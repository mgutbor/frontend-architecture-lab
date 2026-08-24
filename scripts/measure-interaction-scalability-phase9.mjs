#!/usr/bin/env node
// Interaction scalability measurement (Fase 9) — React Monolith vs Angular
// Monolith under controlled dataset growth.
//
// Extends the Fase 7 methodology (scripts/measure-interaction-performance-phase7.mjs):
// the SAME production builds and interaction drivers, run at three task-dataset
// levels (L0=30, L1=100, L2=300) driven by the ?dataset=N query parameter
// (deterministic scale rule in packages/domain/src/scale-dataset.ts, applied by
// the domain adapter of each app in the experimental copy). The 10 catalog
// features of Fase 8 are mounted simultaneously (16 nav areas) in both apps.
//
// Zero runtime dependencies: Node built-ins + chrome-headless-shell via CDP
// (the only working headless browser in this environment, Fases 4.1/5.1/7).
//
// Per (scenario, level, app): warm-up x2, N=10 measured iterations, median +
// min/max/p90/p95 + stdev. Same HARNESS as Fase 7 (long tasks, event timing,
// MutationObserver) plus an isolation probe that counts DOM mutations outside
// the active section (H29). Checks are dataset-aware: exact expected counts
// computed from the documented generation rule.
//
// Usage:
//   node scripts/measure-interaction-scalability-phase9.mjs [/tmp/lab-phase9] [--quick] [--no-build]
// Output: docs/experiments/results/interaction-scalability-phase9.json

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
import { spawn, execFileSync } from 'node:child_process'
import { cpus, totalmem, homedir } from 'node:os'
import { prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'interaction-scalability-phase9.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase9'
const QUICK = process.argv.includes('--quick')
const NO_BUILD = process.argv.includes('--no-build')

if (!existsSync(join(LAB, 'package.json'))) {
  console.error(`Copia experimental no encontrada: ${LAB}`)
  process.exit(1)
}

const REACT_DIST = join(LAB, 'apps/react-app/dist')
const ANGULAR_DIST = join(LAB, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4185
const ANGULAR_PORT = 4186

const N = QUICK ? 3 : 10
const WARMUP = 2
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
const DATASETS = [30, 100, 300]
const SCENARIO_KEYS = QUICK
  ? ['S2-search', 'S4-combined']
  : [
      'S1-nav',
      'S2-search',
      'S3-status',
      'S4-combined',
      'S5-settings',
      'S6-assign',
      'S7a-form-input',
      'S7b-form-submit',
      'S8-nav-catalog',
    ]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (v, d = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null

// ---------------------------------------------------------------------------
// Build the experimental copy when needed (reproducibility; idempotent)
// ---------------------------------------------------------------------------

if (!NO_BUILD) {
  const bin = (rel) => join(LAB, rel)
  const step = (label, args, cwd) => {
    console.log(`  build ${label} …`)
    execFileSync(args[0], args.slice(1), { cwd, stdio: 'ignore' })
  }
  if (!existsSync(join(LAB, 'packages/domain/dist/index.js'))) {
    step(
      'domain',
      [bin('packages/domain/node_modules/.bin/tsc'), '-p', 'tsconfig.build.json'],
      join(LAB, 'packages/domain'),
    )
  }
  const reactAsset = existsSync(REACT_DIST) ? readdirSync(REACT_DIST).join(',') : ''
  if (!reactAsset.includes('assets/index-')) {
    step(
      'react-app',
      [bin('apps/react-app/node_modules/.bin/vite'), 'build'],
      join(LAB, 'apps/react-app'),
    )
  }
  const angularAsset = existsSync(ANGULAR_DIST) ? readdirSync(ANGULAR_DIST).join(',') : ''
  if (!angularAsset.includes('main-')) {
    step(
      'angular-app',
      [bin('apps/angular-app/node_modules/.bin/ng'), 'build'],
      join(LAB, 'apps/angular-app'),
    )
  }
}

// ---------------------------------------------------------------------------
// Expected counts (documented generation rule, packages/domain/src/scale-dataset.ts)
// Base-fraction constants measured from the fixture at L0 (smoke probe): the
// 30 fixture tasks contain 4 with "incident", 7 in-progress, 0 matching the
// combined filter. Every extra task (i = 0..extras-1) has title "Incident
// report N" (so +1 per extra), status i%4===1 => in-progress, and the combined
// filter matches i%4===1 && i%3===2 (i ≡ 5 mod 12).
// ---------------------------------------------------------------------------

function expectedCounts(level) {
  const extras = level - 30
  let incident = 4
  let inProgress = 7
  let combined = 0
  if (extras > 0) {
    incident += extras
    for (let i = 0; i < extras; i += 1) {
      if (i % 4 === 1) inProgress += 1
      if (i % 4 === 1 && i % 3 === 2) combined += 1
    }
  }
  return { incident, inProgress, combined }
}

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
  const profile = `/tmp/lh9-profile-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
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

// Same HARNESS as Fase 7, plus the H29 isolation probe: mutations are
// classified by whether their target lies inside the currently active
// `main section[aria-label=...]` (or inside `main` at all).
const HARNESS = `
window.__ph9 = { lt: [], ev: [], mut: { n: 0, added: 0, removed: 0, attrs: 0, outsideMain: 0, outsideActive: 0 } };
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph9.lt.push({ s: e.startTime, d: e.duration });
  }).observe({ type: 'longtask' });
} catch (e) {}
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph9.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
  }).observe({ type: 'event', durationThreshold: 0 });
} catch (e) {
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__ph9.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
    }).observe({ type: 'event' });
  } catch (e2) {}
}
try {
  new MutationObserver((recs) => {
    const main = document.querySelector('main');
    // Snapshot of the active section taken at the start of each measured
    // iteration (measureExpr sets __ph9.active). A reference keeps containing
    // detached subtrees (e.g. React swapping <ul> for the empty state), so
    // subtree detach inside the section is not misclassified as outside.
    const active = window.__ph9.active || document.querySelector('main section[aria-label]');
    for (const r of recs) {
      window.__ph9.mut.n += 1;
      window.__ph9.mut.added += r.addedNodes.length;
      window.__ph9.mut.removed += r.removedNodes.length;
      if (r.type === 'attributes') window.__ph9.mut.attrs += 1;
      const t = r.target;
      // Detached targets (removed from the document at callback time, e.g.
      // React swapping <ul> for the empty state) are conservatively counted
      // as INSIDE: they usually belong to content being swapped within the
      // active section, and their former location is unknowable. This biases
      // the isolation metric toward 0 (documented in limitations).
      if (!(main && main.contains(t)) && t.isConnected !== false) window.__ph9.mut.outsideMain += 1;
      if (!(active && active.contains(t)) && t.isConnected !== false) window.__ph9.mut.outsideActive += 1;
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
} catch (e) {}
true;
`

function measureExpr(actionStmts) {
  return `(async () => {
    const ltStart = window.__ph9.lt.length;
    const evStart = window.__ph9.ev.length;
    const mutStart = { ...window.__ph9.mut };
    window.__ph9.active = document.querySelector('main section[aria-label]');
    const t0 = performance.now();
    ${actionStmts}
    const tSync = performance.now();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    const t1 = performance.now();
    await new Promise((r) => setTimeout(r, 80));
    const m = window.__ph9.mut;
    return {
      duration: t1 - t0,
      sync: tSync - t0,
      events: window.__ph9.ev.slice(evStart),
      longTasks: window.__ph9.lt.slice(ltStart),
      mutations: {
        n: m.n - mutStart.n,
        added: m.added - mutStart.added,
        removed: m.removed - mutStart.removed,
        attrs: m.attrs - mutStart.attrs,
        outsideMain: m.outsideMain - mutStart.outsideMain,
        outsideActive: m.outsideActive - mutStart.outsideActive
      }
    };
  })()`
}

// ---------------------------------------------------------------------------
// Interaction drivers — identical DOM ids/classes/labels in both frameworks.
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

const rowCountExpr = `document.querySelectorAll('.task-list li').length`

function rowCountIs(level) {
  return `${rowCountExpr} === ${level}`
}

function buildScenarios() {
  return {
    'S1-nav': {
      label: 'Navigation switch Projects → Tasks (state-based SPA navigation, NAV-1)',
      setup: clickNav('Projects'),
      action: clickNav('Tasks'),
      reset: clickNav('Projects'),
      check: `document.querySelector('main section[aria-label="Tasks"]') !== null`,
    },
    'S2-search': {
      label: 'Live search on tasks list (TSK-LIST search; input event "incident")',
      setup: clickNav('Tasks'),
      action: setInput('task-search', 'incident'),
      reset: setInput('task-search', ''),
      check: null, // replaced per level (expected counts are level-dependent)
    },
    'S3-status': {
      label: 'Status filter on tasks list (change event on #task-status-filter = in-progress)',
      setup: clickNav('Tasks'),
      action: setSelect('task-status-filter', 'in-progress'),
      reset: setSelect('task-status-filter', 'all'),
      check: null, // replaced per level
    },
    'S4-combined': {
      label: 'Combined search + status + priority filters in one batch',
      setup: clickNav('Tasks'),
      action: `${setInput('task-search', 'incident')}\n${setSelect('task-status-filter', 'in-progress')}\n${setSelect('task-priority-filter', 'high')}`,
      reset: `${setInput('task-search', '')}\n${setSelect('task-status-filter', 'all')}\n${setSelect('task-priority-filter', 'all')}`,
      check: null, // replaced per level
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
    'S8-nav-catalog': {
      label: 'Navigation to a Fase 8 catalog feature (Projects → Milestones; mounted features)',
      setup: clickNav('Projects'),
      action: clickNav('Milestones'),
      reset: clickNav('Projects'),
      check: `document.querySelector('main section[aria-label="Milestones"]') !== null && document.querySelectorAll('main section[aria-label="Milestones"] li').length > 0`,
    },
  }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function stdev(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x))
  if (v.length < 2) return null
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const sq = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length
  return round(Math.sqrt(sq), 2)
}

function stats(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x))
  if (v.length === 0)
    return { n: 0, median: null, min: null, max: null, p90: null, p95: null, stdev: null }
  const s = [...v].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  const p90 = s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]
  const p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
  return {
    n: v.length,
    median: round(median),
    min: round(s[0]),
    max: round(s[s.length - 1]),
    p90: round(p90),
    p95: round(p95),
    stdev: stdev(v),
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
    isolation: {
      outsideMain: stats(pick((i) => i.mutations.outsideMain)),
      outsideActive: stats(pick((i) => i.mutations.outsideActive)),
    },
    heapDeltaKb: stats(pick((i) => i.heapDeltaKb)),
    nodesDelta: stats(pick((i) => i.nodesDelta)),
    firstHalfMedian: stats(pick((i) => i.duration).slice(0, Math.floor(iters.length / 2))).median,
    secondHalfMedian: stats(pick((i) => i.duration).slice(Math.floor(iters.length / 2))).median,
  }
}

// ---------------------------------------------------------------------------
// Scenario runner (Fase 7 protocol; resets settle before the next baseline)
// ---------------------------------------------------------------------------

const SETTLE_EXPR = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 50));
  return true;
})()`

// For filter scenarios, wait until the full list is back (deterministic
// framework-agnostic settle), then confirm it stays stable.
async function settleRows(cdp, level) {
  const start = Date.now()
  for (;;) {
    try {
      if ((await evaluate(cdp, rowCountIs(level))) === true) break
    } catch {
      /* retry */
    }
    if (Date.now() - start > 10000) throw new Error('rows did not return to dataset size')
    await sleep(100)
  }
  await sleep(120)
  const again = await evaluate(cdp, rowCountIs(level))
  if (again !== true) throw new Error('rows not stable after reset')
}

async function runScenario(cdp, sc, level) {
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
      if (sc.settleRows) await settleRows(cdp, level)
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
        outsideMain: r.mutations.outsideMain,
        outsideActive: r.mutations.outsideActive,
      },
      heapDeltaKb: round((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024, 2),
      nodesDelta: round(m1.Nodes - m0.Nodes, 1),
      checkOk,
    })
  }
  return summarize(iters)
}

// ---------------------------------------------------------------------------
// Dataset validation (both apps must start from the same dataset)
// ---------------------------------------------------------------------------

async function validateDataset(cdp, level) {
  await evaluate(cdp, clickNav('Tasks'))
  await waitFor(
    cdp,
    `document.querySelector('main section[aria-label="Tasks"]') !== null && ${rowCountExpr} > 0`,
  )
  const total = await evaluate(cdp, rowCountExpr)
  const exp = expectedCounts(level)
  await evaluate(cdp, setInput('task-search', 'incident'))
  await waitFor(cdp, `${rowCountExpr} === ${exp.incident}`)
  const incident = await evaluate(cdp, rowCountExpr)
  await evaluate(cdp, setInput('task-search', ''))
  await evaluate(cdp, setSelect('task-status-filter', 'in-progress'))
  await waitFor(cdp, `${rowCountExpr} === ${exp.inProgress}`)
  const inProgress = await evaluate(cdp, rowCountExpr)
  await evaluate(cdp, setSelect('task-status-filter', 'all'))
  await evaluate(cdp, setInput('task-search', 'incident'))
  await evaluate(cdp, setSelect('task-status-filter', 'in-progress'))
  await evaluate(cdp, setSelect('task-priority-filter', 'high'))
  await waitFor(cdp, `${rowCountExpr} === ${exp.combined}`)
  const combined = await evaluate(cdp, rowCountExpr)
  return { total, incident, inProgress, combined, expected: exp }
}

// ---------------------------------------------------------------------------
// Scaling analysis (documented heuristic)
// ---------------------------------------------------------------------------

// Growth of a per-iteration metric between consecutive levels. Shape is
// classified from the per-step ratios r1 = L1/L0, r2 = L2/L1:
//   |r2 - r1| <= 0.25  -> linear
//   r2 < r1 - 0.25     -> sublinear
//   r2 > r1 + 0.25     -> superlinear
// otherwise -> inconclusive. Only applied to strictly positive medians.
function scalingCurve(values) {
  const [v0, v1, v2] = values
  const out = {
    l0l1: v0 !== null && v1 !== null ? round(v1 - v0, 2) : null,
    l1l2: v1 !== null && v2 !== null ? round(v2 - v1, 2) : null,
    l0l2: v0 !== null && v2 !== null ? round(v2 - v0, 2) : null,
    ratioL1OverL0: v0 !== null && v1 !== null && v0 !== 0 ? round(v1 / v0, 2) : null,
    ratioL2OverL1: v1 !== null && v2 !== null && v1 !== 0 ? round(v2 / v1, 2) : null,
    shape: null,
  }
  const r1 = out.ratioL1OverL0
  const r2 = out.ratioL2OverL1
  if (r1 === null || r2 === null || r1 <= 0 || r2 <= 0) {
    out.shape = 'inconclusive'
  } else if (Math.abs(r2 - r1) <= 0.25) {
    out.shape = 'linear'
  } else if (r2 < r1 - 0.25) {
    out.shape = 'sublinear'
  } else if (r2 > r1 + 0.25) {
    out.shape = 'superlinear'
  } else {
    out.shape = 'inconclusive'
  }
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const shellPath = findHeadlessShell()
if (!shellPath) {
  console.error('chrome-headless-shell not found (Playwright cache).')
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
console.log(`lab: ${LAB}`)

const apps = {
  react: { url: `http://127.0.0.1:${REACT_PORT}/`, dist: REACT_DIST, key: 'react' },
  angular: { url: `http://127.0.0.1:${ANGULAR_PORT}/`, dist: ANGULAR_DIST, key: 'angular' },
}

// --- Dataset validation (one session per level per app) ---
const datasetValidation = {}
let chromeVersion = null
for (const level of DATASETS) {
  datasetValidation[level] = {}
  for (const [appKey, app] of Object.entries(apps)) {
    const browser = await launchBrowser(shellPath)
    try {
      const wsUrl = await openPage(browser.port, `${app.url.replace(/\/$/, '')}/?dataset=${level}`)
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
      datasetValidation[level][appKey] = await validateDataset(cdp, level)
      console.log(
        `dataset ${level} · ${appKey}: total=${datasetValidation[level][appKey].total} incident=${datasetValidation[level][appKey].incident} inProgress=${datasetValidation[level][appKey].inProgress} combined=${datasetValidation[level][appKey].combined}`,
      )
      cdp.close()
    } finally {
      await killBrowser(browser)
      await sleep(200)
    }
  }
}

// --- Scenarios ---
const baseScenarios = buildScenarios()
const results = {}
for (const skey of SCENARIO_KEYS) {
  const sc = { ...baseScenarios[skey] }
  results[skey] = { label: sc.label }
  for (const level of DATASETS) {
    results[skey][level] = { react: null, angular: null }
    // dataset-aware checks for the filter scenarios
    if (skey === 'S2-search') {
      sc.check = `document.getElementById('task-search').value === 'incident' && ${rowCountExpr} === ${expectedCounts(level).incident}`
    } else if (skey === 'S3-status') {
      sc.check = `document.getElementById('task-status-filter').value === 'in-progress' && ${rowCountExpr} === ${expectedCounts(level).inProgress}`
    } else if (skey === 'S4-combined') {
      sc.check = `document.getElementById('task-search').value === 'incident' && document.getElementById('task-status-filter').value === 'in-progress' && document.getElementById('task-priority-filter').value === 'high' && ${rowCountExpr} === ${expectedCounts(level).combined}`
    }
    sc.settleRows = skey === 'S2-search' || skey === 'S3-status' || skey === 'S4-combined'
    for (const [appKey, app] of Object.entries(apps)) {
      const browser = await launchBrowser(shellPath)
      try {
        const wsUrl = await openPage(
          browser.port,
          `${app.url.replace(/\/$/, '')}/?dataset=${level}`,
        )
        const cdp = await Cdp.connect(wsUrl)
        await cdp.send('Page.enable')
        await cdp.send('Runtime.enable')
        await waitFor(cdp, `document.querySelector('nav[aria-label="Main"]') !== null`)
        await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT)
        await cdp.send('Performance.enable')
        await evaluate(cdp, HARNESS)
        await sleep(500)
        console.log(`\n=== ${skey} · dataset=${level} · ${appKey} ===`)
        const data = await runScenario(cdp, sc, level)
        results[skey][level][appKey] = data
        console.log(
          `  settle ${data.duration.median} ms (${data.duration.min}–${data.duration.max}) · sync ${data.sync.median} ms · muts ${data.mutations.records.median} · outsideActive ${data.isolation.outsideActive.median} · longTasks ${data.longTaskCount.sum} · checks ${data.checksPassed}/${data.n}`,
        )
        cdp.close()
      } finally {
        await killBrowser(browser)
        await sleep(200)
      }
    }
  }
}

for (const s of servers) s.close()

// --- Comparisons + scaling ---
const comparison = {}
const scaling = {}
const isolation = {}
for (const skey of SCENARIO_KEYS) {
  comparison[skey] = {}
  scaling[skey] = {}
  isolation[skey] = {}
  for (const level of DATASETS) {
    const r = results[skey][level]
    const cmp = {}
    // mutation metrics are stored under mutations.records (the MutationObserver
    // record count), unlike duration/sync which are scalars.
    const medianOf = (side, metric) =>
      metric === 'mutations'
        ? (r[side]?.mutations?.records?.median ?? null)
        : (r[side]?.[metric]?.median ?? null)
    for (const metric of ['duration', 'sync', 'mutations']) {
      const rv = medianOf('react', metric)
      const av = medianOf('angular', metric)
      cmp[metric] = {
        react: rv,
        angular: av,
        deltaAngularMinusReact: rv !== null && av !== null ? round(av - rv, 3) : null,
        ratioAngularOverReact: rv !== null && av !== null && rv !== 0 ? round(av / rv, 2) : null,
      }
    }
    comparison[skey][level] = cmp
    isolation[skey][level] = {
      react: r.react?.isolation ?? null,
      angular: r.angular?.isolation ?? null,
    }
  }
  // scaling per metric across levels
  const medianAt = (side, level, metric) =>
    metric === 'mutations'
      ? (results[skey][level][side]?.mutations?.records?.median ?? null)
      : (results[skey][level][side]?.[metric]?.median ?? null)
  for (const metric of ['duration', 'sync', 'mutations']) {
    scaling[skey][metric] = {
      react: scalingCurve(DATASETS.map((l) => medianAt('react', l, metric))),
      angular: scalingCurve(DATASETS.map((l) => medianAt('angular', l, metric))),
      deltaAngularMinusReact: {
        l0: comparison[skey][30][metric].deltaAngularMinusReact,
        l1: comparison[skey][100][metric].deltaAngularMinusReact,
        l2: comparison[skey][300][metric].deltaAngularMinusReact,
      },
    }
  }
}

// Aggregate (mean of medians per level) — informational.
const aggregate = {}
for (const level of DATASETS) {
  const vals = {}
  for (const metric of ['duration', 'sync', 'mutations']) {
    const rv = SCENARIO_KEYS.map((k) => comparison[k][level][metric]?.react).filter(
      (x) => x !== null,
    )
    const av = SCENARIO_KEYS.map((k) => comparison[k][level][metric]?.angular).filter(
      (x) => x !== null,
    )
    const mean = (arr) =>
      arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length, 3) : null
    vals[metric] = { react: mean(rv), angular: mean(av) }
  }
  aggregate[level] = vals
}

const git = (args) => {
  try {
    return execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const result = {
  experiment: 'interaction-scalability-phase9',
  capturedAt: new Date().toISOString(),
  objective:
    'Determinar si la equivalencia de rendimiento percibido observada en Fase 7 (React vs Angular, mismo contrato funcional) se mantiene cuando el dataset de tareas crece de 30 (L0) a 100 (L1) y 300 (L2) elementos y las 10 features de catálogo de Fase 8 están montadas simultáneamente (16 áreas de navegación). Evaluar H27–H30.',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCores: cpus().length,
    memoryBytes: totalmem(),
    chromeVersion,
    chromeShell: shellPath,
    labPath: LAB,
    labHeadCommit: git(['rev-parse', 'HEAD']),
    labBaselineCommit: git(['log', '--all', '--format=%H', '--grep=^baseline', '-1']),
    note: 'chrome-headless-shell (Chrome for Testing) es el único navegador headless funcional en este entorno (Fases 4.1/5.1/7). Copia experimental aislada en /tmp; el árbol principal no se modifica.',
  },
  method: {
    summary:
      'Mismo harness que Fase 7 (CDP sobre chrome-headless-shell, una sesión por (escenario, nivel, app), servidores estáticos equivalentes, builds de producción). El tamaño del dataset lo controla ?dataset=N (30/100/300), leído por el adapter de dominio de cada app con la misma regla determinista (scale-dataset.ts). Validación previa del dataset por nivel y app (recuentos exactos idénticos en ambos frameworks). Checks dependientes del dataset: recuentos exactos esperados derivados de la regla de generación documentada.',
    viewport: VIEWPORT,
    datasets: DATASETS,
    iterations: N,
    warmup: WARMUP,
    settle:
      'evento -> 2 requestAnimationFrame + macrotask (framework-agnostic), +80 ms flush para PerformanceEventTiming. duration = tiempo entre dispatch y settle. Los resets de los escenarios de filtro esperan hasta que la lista vuelve al tamaño del dataset (settle determinista).',
    metrics: [
      'duration (settle, ms) — latencia percibida hasta la siguiente pintura (cuantizada por frame)',
      'sync (ms) — duración del dispatch síncrono (handler + scheduling; verificado en Fase 7: ambos frameworks difieren el commit del DOM, semántica comparable)',
      'mutations (MutationObserver: registros, nodos añadidos/eliminados, atributos) — proxy simétrico del trabajo de render/commit',
      'isolation.outsideMain / isolation.outsideActive — mutaciones cuyo target NO está dentro de main / dentro de la sección activa (H29)',
      'longTaskCount / longTaskMs (PerformanceObserver longtask)',
      'heapDeltaKb (CDP JSHeapUsedSize, informativo)',
      'nodesDelta (CDP Nodes, informativo)',
    ],
    checks:
      'cada iteración verifica el estado DOM esperado (checkOk); los escenarios de filtro comparan el número de filas con el recuento esperado exacto (regla de generación documentada).',
    scalingHeuristic:
      'curva de crecimiento por métrica entre L0->L1->L2: ratios r1=L1/L0 y r2=L2/L1; |r2-r1|<=0.25 => lineal; r2<r1-0.25 => sublineal; r2>r1+0.25 => superlineal; si no -> inconcluyente. Solo sobre medianas estrictamente positivas. Heurística documentada, no estadística formal.',
    runOrder: 'por escenario -> por nivel -> react -> angular',
    scenarios: Object.fromEntries(SCENARIO_KEYS.map((k) => [k, baseScenarios[k].label])),
  },
  datasetValidation,
  results,
  comparison,
  scaling,
  isolation,
  aggregate,
  limitations: [
    'Mediciones en localhost sin red ni throttling; no representan condiciones de campo.',
    'duration incluye el overhead del harness (simétrico) y está cuantizado por el frame del headless-shell.',
    'sync mide solo el trabajo síncrono del handler + scheduling; el render real queda en duration + mutations (verificado en Fase 7).',
    'MutationObserver añade overhead al documento (simétrico) y cuenta atributos/caracteres, no solo nodos.',
    'CDP Performance.getMetrics es poco fiable en este headless-shell (ScriptDuration en 0); solo JSHeapUsedSize y Nodes se usan como informativas.',
    'La clasificación de forma de crecimiento (lineal/sublineal/superlineal) es una heurística sobre 3 puntos, no un ajuste estadístico.',
    'La sonda de aislamiento (outsideActive) es un proxy de mutaciones DOM; no detecta renders internos sin mutación DOM.',
    'Una máquina local; resultados indicativos, no benchmark científico (metrics.md §1).',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== RESUMEN (mediana) ===')
for (const skey of SCENARIO_KEYS) {
  console.log(`\n${skey} — ${baseScenarios[skey].label}`)
  for (const level of DATASETS) {
    const c = comparison[skey][level]
    const r = results[skey][level]
    console.log(
      `  L${level === 30 ? 0 : level === 100 ? 1 : 2}  settle React ${c.duration.react} · Angular ${c.duration.angular} ms (Δ ${c.duration.deltaAngularMinusReact}) · sync R ${c.sync.react} / A ${c.sync.angular} ms · muts R ${r.react ? r.react.mutations.records.median : '—'} / A ${r.angular ? r.angular.mutations.records.median : '—'} · LT R ${r.react ? r.react.longTaskCount.sum : '—'} / A ${r.angular ? r.angular.longTaskCount.sum : '—'} · checks R ${r.react ? r.react.checksPassed : '—'}/${r.react ? r.react.n : '—'} A ${r.angular ? r.angular.checksPassed : '—'}/${r.angular ? r.angular.n : '—'}`,
    )
  }
}
console.log('\n=== AISLAMIENTO (outsideActive, mediana) ===')
for (const skey of SCENARIO_KEYS) {
  const parts = DATASETS.map(
    (l) =>
      `${l === 30 ? 'L0' : l === 100 ? 'L1' : 'L2'} R ${isolation[skey][l].react?.outsideActive?.median ?? '—'} / A ${isolation[skey][l].angular?.outsideActive?.median ?? '—'}`,
  )
  console.log(`  ${skey}: ${parts.join(' · ')}`)
}
console.log('\n=== ESCALABILIDAD (settle: forma L0->L2) ===')
for (const skey of SCENARIO_KEYS) {
  const s = scaling[skey].duration
  console.log(
    `  ${skey}: React ${s.react.shape} (Δ ${s.react.l0l2} ms) · Angular ${s.angular.shape} (Δ ${s.angular.l0l2} ms)`,
  )
}
console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
