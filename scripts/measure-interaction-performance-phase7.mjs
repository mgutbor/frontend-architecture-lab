#!/usr/bin/env node
// Interaction performance measurement (Fase 7) — React Monolith vs Angular
// Monolith under real user interaction.
//
// Zero runtime dependencies: Node built-ins only. The browser is
// chrome-headless-shell (from the Playwright cache — the only working headless
// browser in this environment, documented in Fases 4.1/5.1) driven through the
// Chrome DevTools Protocol over the WebSocket that ships with Node >= 22.
//
// Protocol (documented in docs/experiments/interaction-performance-phase7.md):
// - Same production builds, same dataset, same static server implementation.
// - 8 scenarios exercising the real contract surfaces (identical DOM ids /
//   classes / labels in both frameworks, so the SAME driver code runs on both).
// - Per measured interaction: settle time (event dispatch -> 2 rAF + macrotask),
//   PerformanceEventTiming entries (if any), long tasks, and CDP
//   Performance.getMetrics deltas (ScriptDuration, TaskDuration, LayoutDuration,
//   RecalcStyleDuration, JSHeapUsedSize) around the interaction.
// - Warm-up x2 per scenario; N=10 measured iterations; median + min/max/p90.
// - One browser launch per (scenario, app) so tabs are never backgrounded.
//
// Usage: node scripts/measure-interaction-performance-phase7.mjs [--quick]
// Output: docs/experiments/results/interaction-performance-phase7.json

import { createServer } from 'node:http'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
} from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { cpus, totalmem, homedir } from 'node:os'
import { prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'interaction-performance-phase7.json')

const REACT_DIST = join(ROOT, 'apps/react-app/dist')
const ANGULAR_DIST = join(ROOT, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4175
const ANGULAR_PORT = 4176

const QUICK = process.argv.includes('--quick')
const N = QUICK ? 3 : 10
const WARMUP = 2
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (v, d = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null

// ---------------------------------------------------------------------------
// Environment discovery
// ---------------------------------------------------------------------------

function findHeadlessShell() {
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  if (!existsSync(base)) return null
  let best = null
  let bestVer = -1
  for (const dir of readdirSync(base)) {
    const m = /^chromium_headless_shell-(\d+)$/.exec(dir)
    if (!m) continue
    const candidates = [
      join(base, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
      join(base, dir, 'chrome-mac/headless_shell'),
      join(base, dir, 'headless_shell'),
    ]
    for (const c of candidates) {
      if (existsSync(c) && Number(m[1]) > bestVer) {
        best = c
        bestVer = Number(m[1])
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Static server (same implementation for both apps)
// ---------------------------------------------------------------------------

function startStaticServer(distRoot, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    let path = decodeURIComponent(url.pathname)
    if (path === '/') path = '/index.html'
    const file = join(distRoot, path)
    const safe = file.startsWith(distRoot)
    const ext = extname(file)
    const mime =
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.map': 'application/json',
      }[ext] ?? 'application/octet-stream'
    if (safe && existsSync(file) && !statSync(file).isDirectory()) {
      res.writeHead(200, { 'Content-Type': mime })
      res.end(readFileSync(file))
      return
    }
    const idx = join(distRoot, 'index.html')
    if (existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(readFileSync(idx))
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

// ---------------------------------------------------------------------------
// Minimal CDP client (Node >= 22 global WebSocket)
// ---------------------------------------------------------------------------

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = new Map()
    ws.onmessage = (e) =>
      this._onMessage(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString())
    ws.onerror = () => {}
    ws.onclose = () => {
      for (const [, p] of this.pending) p.reject(new Error('cdp closed'))
      this.pending.clear()
    }
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error(`ws connect failed: ${url}`))
    })
    return new Cdp(ws)
  }

  _onMessage(raw) {
    const msg = JSON.parse(raw)
    if (msg.id) {
      const p = this.pending.get(msg.id)
      if (p) {
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`))
        else p.resolve(msg.result)
      }
      return
    }
    const hs = this.listeners.get(msg.method)
    if (hs) for (const h of hs) h(msg.params)
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

async function launchBrowser(shellPath) {
  const profile = `/tmp/lh7-profile-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  const child = spawn(
    shellPath,
    [
      '--headless',
      '--remote-debugging-port=0',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  )
  // The actual port is written to DevToolsActivePort in the profile dir.
  let port = null
  const portFile = join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 100; i += 1) {
    if (existsSync(portFile)) {
      try {
        port = Number.parseInt(readFileSync(portFile, 'utf8').split('\n')[0], 10)
        break
      } catch {
        /* retry */
      }
    }
    await sleep(100)
  }
  if (!port) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      /* ignore */
    }
    throw new Error('browser did not expose DevToolsActivePort')
  }
  // Wait until the debugging endpoint answers.
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) return { child, port, profile }
    } catch {
      /* retry */
    }
    await sleep(100)
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    /* ignore */
  }
  throw new Error(`browser debugging endpoint did not answer on port ${port}`)
}

async function killBrowser(browser) {
  try {
    process.kill(-browser.child.pid, 'SIGKILL')
  } catch {
    try {
      browser.child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
  try {
    rmSync(browser.profile, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

async function openPage(port, url) {
  let res
  try {
    res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
      method: 'PUT',
    })
  } catch {
    res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`)
  }
  if (!res.ok) throw new Error(`/json/new failed: ${res.status}`)
  const target = await res.json()
  if (!target.webSocketDebuggerUrl) throw new Error('/json/new returned no ws url')
  return target.webSocketDebuggerUrl
}

// ---------------------------------------------------------------------------
// CDP helpers
// ---------------------------------------------------------------------------

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) {
    throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`)
  }
  return r.result?.value
}

async function waitFor(cdp, expression, timeoutMs = 15000) {
  const start = Date.now()
  for (;;) {
    try {
      if ((await evaluate(cdp, expression)) === true) return
    } catch {
      /* expression may throw while the app is still booting */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out: ${expression}`)
    await sleep(100)
  }
}

async function getMetrics(cdp) {
  const r = await cdp.send('Performance.getMetrics')
  const m = {}
  for (const mm of r.metrics) m[mm.name] = mm.value
  return m
}

// Injected once per page. Collects, per measured interaction:
// - long tasks (PerformanceObserver 'longtask')
// - PerformanceEventTiming entries (may be absent for fast events)
// - DOM mutation work (MutationObserver counters: number of records and of
//   added/removed nodes). Mutation volume is a symmetric, framework-agnostic
//   proxy for the render/commit work produced by an interaction.
const HARNESS = `
window.__ph7 = { lt: [], ev: [], mut: { n: 0, added: 0, removed: 0, attrs: 0 } };
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph7.lt.push({ s: e.startTime, d: e.duration });
  }).observe({ type: 'longtask' });
} catch (e) {}
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph7.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
  }).observe({ type: 'event', durationThreshold: 0 });
} catch (e) {
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__ph7.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
    }).observe({ type: 'event' });
  } catch (e2) {}
}
try {
  new MutationObserver((recs) => {
    for (const r of recs) {
      window.__ph7.mut.n += 1;
      window.__ph7.mut.added += r.addedNodes.length;
      window.__ph7.mut.removed += r.removedNodes.length;
      if (r.type === 'attributes') window.__ph7.mut.attrs += 1;
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
} catch (e) {}
true;
`

// Measured interaction: run the action statements, then wait for two animation
// frames plus a macrotask (framework-agnostic "settle": covers sync handlers
// and deferred/scheduled renders), then an 80 ms flush window for
// PerformanceEventTiming entries. `duration` is the settle time; events and
// long tasks observed during the window are returned alongside.
function measureExpr(actionStmts) {
  return `(async () => {
    const ltStart = window.__ph7.lt.length;
    const evStart = window.__ph7.ev.length;
    const mutStart = { ...window.__ph7.mut };
    const t0 = performance.now();
    ${actionStmts}
    const tSync = performance.now();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    const t1 = performance.now();
    await new Promise((r) => setTimeout(r, 80));
    const m = window.__ph7.mut;
    return {
      duration: t1 - t0,
      sync: tSync - t0,
      events: window.__ph7.ev.slice(evStart),
      longTasks: window.__ph7.lt.slice(ltStart),
      mutations: {
        n: m.n - mutStart.n,
        added: m.added - mutStart.added,
        removed: m.removed - mutStart.removed,
        attrs: m.attrs - mutStart.attrs
      }
    };
  })()`
}

// ---------------------------------------------------------------------------
// Interaction drivers — identical DOM ids/classes/labels in both frameworks
// (same functional contract), so the same statements drive both apps.
// ---------------------------------------------------------------------------

const clickNav = (label) =>
  `(() => {
    const btn = [...document.querySelectorAll('nav[aria-label="Main"] button')]
      .find((b) => b.textContent.trim() === '${label}');
    if (!btn) throw new Error('nav button ${label} not found');
    btn.click();
  })();`

const setInput = (id, value) => `(() => {
  const el = document.getElementById('${id}');
  if (!el) throw new Error('input ${id} not found');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(el, '${value}');
  el.dispatchEvent(new Event('input', { bubbles: true }));
})();`

const setSelect = (id, value) => `(() => {
  const el = document.getElementById('${id}');
  if (!el) throw new Error('select ${id} not found');
  const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  set.call(el, '${value}');
  el.dispatchEvent(new Event('change', { bubbles: true }));
})();`

const SCENARIOS = {
  'S1-nav': {
    label: 'Navigation switch Projects → Tasks (state-based SPA navigation, NAV-1)',
    setup: clickNav('Projects'),
    action: clickNav('Tasks'),
    reset: clickNav('Projects'),
    check: `document.querySelector('main section[aria-label="Tasks"]') !== null`,
  },
  'S2-search': {
    label: 'Live search on tasks list (TSK-LIST search; input event)',
    setup: clickNav('Tasks'),
    action: setInput('task-search', 'incident'),
    reset: setInput('task-search', ''),
    check: `document.getElementById('task-search').value === 'incident' && document.querySelectorAll('.task-list li').length < 30`,
  },
  'S3-status': {
    label: 'Status filter on tasks list (change event on #task-status-filter)',
    setup: clickNav('Tasks'),
    action: setSelect('task-status-filter', 'in-progress'),
    reset: setSelect('task-status-filter', 'all'),
    check: `document.getElementById('task-status-filter').value === 'in-progress' && document.querySelectorAll('.task-list li').length < 30`,
  },
  'S4-combined': {
    label: 'Combined search + status + priority filters in one batch',
    setup: clickNav('Tasks'),
    action: `${setInput('task-search', 'incident')}
${setSelect('task-status-filter', 'in-progress')}
${setSelect('task-priority-filter', 'high')}`,
    reset: `${setInput('task-search', '')}
${setSelect('task-status-filter', 'all')}
${setSelect('task-priority-filter', 'all')}`,
    check: `document.getElementById('task-search').value === 'incident' && document.getElementById('task-status-filter').value === 'in-progress' && document.getElementById('task-priority-filter').value === 'high' && document.querySelectorAll('.task-list li').length < 30`,
  },
  'S5-settings': {
    label: 'Toggle "Show completed tasks" (SET-1..4; App-level UI state)',
    setup: clickNav('Settings'),
    action: `document.getElementById('show-completed-tasks').click()`,
    reset: `document.getElementById('show-completed-tasks').click()`,
    check: `document.getElementById('show-completed-tasks').checked === false`,
  },
  'S6-assign': {
    label: 'Reassign task assignee via select (TSK-ASSIGN; domain store mutation)',
    setup: clickNav('Tasks'),
    action: `(() => {
      const sel = document.querySelector('.assign-select');
      if (!sel || !sel.options[1]) throw new Error('assign select not found');
      const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      set.call(sel, sel.options[1].value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
    reset: `(() => {
      const sel = document.querySelector('.assign-select');
      const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      set.call(sel, sel.options[0].value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
    check: `(() => {
      const sel = document.querySelector('.assign-select');
      return sel !== null && sel.value === sel.options[1].value;
    })()`,
  },
  'S7a-form-input': {
    label: 'Typing in the new-project form name field (PRJ-CREATE)',
    setup: `(async () => {
  [...document.querySelectorAll('nav[aria-label="Main"] button')]
    .find((b) => b.textContent.trim() === 'Projects').click();
  for (let i = 0; i < 50 && ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'New project'); i += 1) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New project');
  if (!btn) throw new Error('New project button not found');
  btn.click();
  for (let i = 0; i < 50 && !document.getElementById('project-name'); i += 1) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return document.getElementById('project-name') !== null;
})()`,
    action: setInput('project-name', 'x'),
    reset: null,
    check: `document.getElementById('project-name').value === 'x'`,
  },
  'S7b-form-submit': {
    label: 'Submitting the new-project form with invalid input (validation errors, PRJ-CREATE-2)',
    setup: `(async () => {
  [...document.querySelectorAll('nav[aria-label="Main"] button')]
    .find((b) => b.textContent.trim() === 'Projects').click();
  for (let i = 0; i < 50 && ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'New project'); i += 1) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New project');
  if (!btn) throw new Error('New project button not found');
  btn.click();
  for (let i = 0; i < 50 && !document.getElementById('project-name'); i += 1) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(document.getElementById('project-name'), '');
  document.getElementById('project-name').dispatchEvent(new Event('input', { bubbles: true }));
  return document.getElementById('project-name').value === '';
})()`,
    action: `document.querySelector('form.project-form button[type="submit"]').click()`,
    reset: null,
    check: `document.getElementById('project-name-error') !== null`,
  },
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function stats(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x))
  if (v.length === 0) return { n: 0, median: null, min: null, max: null, p90: null }
  const s = [...v].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  const p90 = s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]
  return {
    n: v.length,
    median: round(median),
    min: round(s[0]),
    max: round(s[s.length - 1]),
    p90: round(p90),
  }
}

function summarize(iters) {
  const pick = (fn) => iters.map(fn)
  const eventDur = iters
    .map((it) =>
      it.eventTimings.length > 0 ? Math.max(...it.eventTimings.map((e) => e.dur)) : null,
    )
    .filter((x) => x !== null)
  return {
    n: iters.length,
    iterations: iters,
    checksPassed: iters.filter((i) => i.checkOk).length,
    duration: stats(pick((i) => i.duration)),
    sync: stats(pick((i) => i.sync)),
    eventTimingDuration: stats(eventDur),
    eventTimingEntriesWithData: eventDur.length,
    longTaskCount: {
      sum: pick((i) => i.longTasks.length).reduce((a, b) => a + b, 0),
      iterationsWithLongTasks: iters.filter((i) => i.longTasks.length > 0).length,
    },
    longTaskMs: stats(iters.flatMap((i) => i.longTasks.map((t) => t.dur))),
    mutations: {
      records: stats(pick((i) => i.mutations.n)),
      addedNodes: stats(pick((i) => i.mutations.added)),
      removedNodes: stats(pick((i) => i.mutations.removed)),
      attrChanges: stats(pick((i) => i.mutations.attrs)),
    },
    heapDeltaKb: stats(pick((i) => i.heapDeltaKb)),
    nodesDelta: stats(pick((i) => i.nodesDelta)),
    // H15: stability = first-half vs second-half median of settle duration.
    firstHalfMedian: stats(pick((i) => i.duration).slice(0, Math.floor(iters.length / 2))).median,
    secondHalfMedian: stats(pick((i) => i.duration).slice(Math.floor(iters.length / 2))).median,
  }
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

// The reset of an iteration schedules deferred framework work (Angular
// zoneless renders on rAF; React on scheduled tasks). Without waiting for it,
// that work leaks into the next iteration's measured window (observed: Angular
// nodesDelta inflated by ~2000 DOM nodes). So every reset is followed by a
// full settle before the next measurement baseline (m0).
const SETTLE_EXPR = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 50));
  return true;
})()`

async function runScenario(cdp, sc) {
  if (sc.setup) {
    await evaluate(cdp, sc.setup)
    await evaluate(cdp, SETTLE_EXPR)
  }
  for (let w = 0; w < WARMUP; w += 1) {
    await evaluate(cdp, measureExpr(sc.action))
    if (sc.reset) {
      await evaluate(cdp, sc.reset)
      await evaluate(cdp, SETTLE_EXPR)
    }
  }
  const iters = []
  for (let i = 0; i < N; i += 1) {
    const m0 = await getMetrics(cdp)
    const r = await evaluate(cdp, measureExpr(sc.action))
    await sleep(120)
    const m1 = await getMetrics(cdp)
    const checkOk = sc.check ? (await evaluate(cdp, sc.check)) === true : true
    if (sc.reset) {
      await evaluate(cdp, sc.reset)
      await evaluate(cdp, SETTLE_EXPR)
    }
    iters.push({
      duration: round(r.duration, 3),
      sync: round(r.sync, 3),
      eventTimings: r.events.map((e) => ({ name: e.n, start: round(e.s, 3), dur: round(e.d, 3) })),
      longTasks: r.longTasks.map((t) => ({ start: round(t.s, 3), dur: round(t.d, 3) })),
      mutations: {
        n: r.mutations.n,
        added: r.mutations.added,
        removed: r.mutations.removed,
        attrs: r.mutations.attrs,
      },
      heapDeltaKb: round((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024, 2),
      nodesDelta: round(m1.Nodes - m0.Nodes, 1),
      checkOk,
    })
  }
  return summarize(iters)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const shellPath = findHeadlessShell()
if (!shellPath) {
  console.error(
    'chrome-headless-shell not found (Playwright cache). Needed: the full Chrome binary hangs on http:// URLs in this environment.',
  )
  process.exit(1)
}

const servers = [
  await startStaticServer(REACT_DIST, REACT_PORT),
  await startStaticServer(ANGULAR_DIST, ANGULAR_PORT),
]
console.log(
  `servers: react http://127.0.0.1:${REACT_PORT}/ · angular http://127.0.0.1:${ANGULAR_PORT}/`,
)
console.log(`shell: ${shellPath}`)

const apps = {
  react: { url: `http://127.0.0.1:${REACT_PORT}/`, dist: REACT_DIST },
  angular: { url: `http://127.0.0.1:${ANGULAR_PORT}/`, dist: ANGULAR_DIST },
}

const scenarioKeys = QUICK ? ['S1-nav'] : Object.keys(SCENARIOS)
const appKeys = QUICK ? ['react'] : ['react', 'angular']

const results = {}
let chromeVersion = null
let browserForVersion = null

for (const skey of scenarioKeys) {
  const sc = SCENARIOS[skey]
  results[skey] = { label: sc.label, react: null, angular: null }
  for (const appKey of appKeys) {
    const app = apps[appKey]
    const browser = await launchBrowser(shellPath)
    if (!browserForVersion) browserForVersion = browser
    try {
      const wsUrl = await openPage(browser.port, app.url)
      const cdp = await Cdp.connect(wsUrl)
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')
      if (!chromeVersion) {
        try {
          const v = await fetch(`http://127.0.0.1:${browser.port}/json/version`)
          chromeVersion = (await v.json()).Browser ?? null
        } catch {
          chromeVersion = null
        }
      }
      await waitFor(cdp, `document.querySelector('nav[aria-label="Main"]') !== null`)
      await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT)
      await cdp.send('Performance.enable')
      await evaluate(cdp, HARNESS)
      await sleep(500)
      console.log(`\n=== ${skey} · ${appKey} (${app.url}) ===`)
      const data = await runScenario(cdp, sc)
      results[skey][appKey] = data
      const d = data.duration
      console.log(
        `  settle ${d.median} ms (${d.min}–${d.max}) · sync ${data.sync.median} ms · muts ${data.mutations.records.median} · longTasks ${data.longTaskCount.sum} · checks ${data.checksPassed}/${data.n}`,
      )
      cdp.close()
    } finally {
      await killBrowser(browser)
      await sleep(300)
    }
  }
}

for (const s of servers) s.close()

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

const comparisons = {}
for (const skey of scenarioKeys) {
  const r = results[skey]
  const cmp = {}
  for (const metric of ['duration', 'sync', 'mutations']) {
    const rv = r.react?.[metric]?.median ?? null
    const av = r.angular?.[metric]?.median ?? null
    cmp[metric] = {
      react: rv,
      angular: av,
      deltaAngularMinusReact: rv !== null && av !== null ? round(av - rv, 3) : null,
      ratioAngularOverReact: rv !== null && av !== null && rv !== 0 ? round(av / rv, 2) : null,
    }
  }
  comparisons[skey] = cmp
}

// Aggregate: mean of per-scenario medians (informational only).
function meanOfMedians(metric) {
  const vals = scenarioKeys.map((k) => comparisons[k][metric]?.react).filter((x) => x !== null)
  const vala = scenarioKeys.map((k) => comparisons[k][metric]?.angular).filter((x) => x !== null)
  const mean = (arr) => (arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length, 3) : null)
  return { react: mean(vals), angular: mean(vala) }
}

const result = {
  experiment: 'interaction-performance-phase7',
  capturedAt: new Date().toISOString(),
  objective:
    'Medir el rendimiento bajo interacción real de React Monolith vs Angular Monolith (mismo contrato, mismo dataset, mismos builds de producción): coste de actualización de estado, trabajo por interacción, latencia percibida y estabilidad bajo interacción repetitiva. Evaluar H14–H18.',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCores: cpus().length,
    memoryBytes: totalmem(),
    chromeVersion,
    chromeShell: shellPath,
    note: 'chrome-headless-shell (Chrome for Testing) es el único navegador headless funcional en este entorno (documentado en Fases 4.1/5.1).',
  },
  method: {
    summary:
      'CDP directo (WebSocket de Node) sobre chrome-headless-shell. Una sesión por (escenario, app), nunca con tabs en background. Servidores estáticos equivalentes (misma implementación Node http) sobre los builds de producción oficiales. Driver de interacción idéntico para ambos frameworks (mismos ids/classes/labels del contrato).',
    viewport: VIEWPORT,
    iterations: N,
    warmup: WARMUP,
    settle:
      'evento -> 2 requestAnimationFrame + macrotask (framework-agnostic; cubre handlers síncronos y renders diferidos), +80 ms flush para PerformanceEventTiming. duration = tiempo entre dispatch y settle.',
    metrics: [
      'duration (settle, ms; performance.now() en página: dispatch -> 2 rAF + macrotask; incluye latencia percibida hasta la siguiente pintura, cuantizada por frame)',
      'sync (ms; duración del dispatch síncrono). Verificado experimentalmente: ambos frameworks difieren el commit del DOM fuera del click() (tasksSync=false en React y Angular), así que sync mide handler + scheduling en ambos (semántica comparable, no el render)',
      'mutations (MutationObserver sobre document.documentElement: registros, nodos añadidos/eliminados, cambios de atributo) — proxy simétrico del trabajo de render/commit',
      'eventTimingDuration (PerformanceEventTiming, si existe; umbral ~16 ms del navegador)',
      'longTaskCount / longTaskMs (PerformanceObserver longtask)',
      'heapDeltaKb (CDP JSHeapUsedSize, informativo)',
      'nodesDelta (CDP Nodes, informativo)',
    ],
    checks:
      'cada iteración verifica el estado DOM esperado tras la interacción (checkOk) para descartar selectores rotos o interacciones sin efecto.',
    runOrder: appKeys.join(' -> '),
    scenarios: Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, v.label])),
  },
  scenarios: results,
  comparison: comparisons,
  aggregateMeanOfMedians: meanOfMedians('duration'),
  limitations: [
    'Mediciones en localhost sin red ni throttling; no representan condiciones de campo.',
    'Solo interacción sintética (eventos no confiables) — mismos eventos para ambos frameworks.',
    'duration incluye el overhead del harness de medición (simétrico entre frameworks) y está cuantizado por el intervalo de frame del headless-shell.',
    'CDP Performance.getMetrics es poco fiable en este headless-shell: ScriptDuration permanece en 0 incluso con un busy-loop de 50 ms y TaskDuration subcuenta (verificado experimentalmente); por eso NO se usan como métricas. Solo JSHeapUsedSize y Nodes se conservan como informativas.',
    'sync mide solo el trabajo síncrono del handler + scheduling: se verificó experimentalmente que ambos frameworks difieren el commit del DOM (no está presente inmediatamente tras el click), por lo que el render real queda capturado por duration + mutations, no por sync.',
    'MutationObserver añade overhead al documento (simétrico entre frameworks) y cuenta atributos/caracteres, no solo nodos.',
    'PerformanceEventTiming puede no reportar eventos rápidos (umbral del navegador ~16 ms).',
    'Render/commit/paint no se distinguen individualmente; settle cubre hasta la pintura siguiente (2 rAF).',
    'Una máquina local; resultados indicativos, no benchmark científico (metrics.md §1).',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== RESUMEN (mediana; min–max) ===')
for (const skey of scenarioKeys) {
  const c = comparisons[skey]
  const m = results[skey]
  console.log(`\n${skey} — ${SCENARIOS[skey].label}`)
  console.log(
    `  settle  React ${c.duration.react} ms · Angular ${c.duration.angular} ms · Δ ${c.duration.deltaAngularMinusReact} ms (${c.duration.ratioAngularOverReact}×)`,
  )
  console.log(
    `  sync    React ${c.sync.react} ms · Angular ${c.sync.angular} ms · Δ ${c.sync.deltaAngularMinusReact} ms`,
  )
  console.log(
    `  muts    React ${m.react ? m.react.mutations.records.median : '—'} · Angular ${m.angular ? m.angular.mutations.records.median : '—'} registros · added React ${m.react ? m.react.mutations.addedNodes.median : '—'} / Angular ${m.angular ? m.angular.mutations.addedNodes.median : '—'}`,
  )
  console.log(
    `  nodesΔ  React ${m.react ? m.react.nodesDelta.median : '—'} · Angular ${m.angular ? m.angular.nodesDelta.median : '—'}`,
  )
  console.log(
    `  heap    React ${m.react ? m.react.heapDeltaKb.median : '—'} kB · Angular ${m.angular ? m.angular.heapDeltaKb.median : '—'} kB`,
  )
}
console.log(
  `\nmedia de medianas (settle): React ${result.aggregateMeanOfMedians.react} ms · Angular ${result.aggregateMeanOfMedians.angular} ms`,
)
console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
