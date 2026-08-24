#!/usr/bin/env node
// Incremental updates under large datasets (Fase 9.2) — S2 search/filter and
// S4 combined updates at datasets 300 / 500 / 750 / 1000 / 1500 (2000 if
// stable), driven by the ?dataset=N query parameter (deterministic scale rule
// in packages/domain/src/scale-dataset.ts of the experimental copy).
//
// Reuses the Fase 9.1 mount-settle protocol (deterministic, framework-agnostic
// commit detection) applied to INCREMENTAL updates:
//   t0 -> dispatch action -> tSync (synchronous event work) -> poll until the
//   filtered list (.task-list li) reaches the EXPECTED count -> tRows ->
//   stability poll (count must stay) -> 2 rAF + macrotask + 100 ms flush
//   (long tasks / trailing mutations) -> t1.
//   sync        = tSync - t0        (synchronous event work)
//   commitToRows = tRows - tSync    (deferred commit until target list size)
//   duration    = tRows - t0        (commit / interaction duration; PRIMARY)
//   paintTail   = t1 - tRows        (protocol flush window, informational)
// This is the SAME definition of duration used by Fase 9.1 for S1 (time until
// the target row count is committed), so S1 vs S2 vs S4 thresholds are
// comparable within the same methodology (S1 reference loaded from the Fase
// 9.1 results JSON at the overlapping datasets 300 / 1000 / 1500).
//
// Harness: PerformanceObserver (longtask + event timing) + MutationObserver
// (childList + attributes + characterData) with the Fase 9 isolation probe
// (mutations outside main / outside the active section; detached targets
// conservatively counted as inside). The observer cost is quantified by a
// dedicated overhead probe (S2 at 1000, observer ON vs OFF). Confirmation
// batches (+10 iterations) run for any cell whose median or p95 duration
// >= 100 ms. Resumable via --datasets=300,500 (merges into the existing JSON).
//
// Zero runtime dependencies: Node built-ins + chrome-headless-shell via CDP.
//
// Usage:
//   node scripts/measure-interaction-large-dataset-phase9-2.mjs [/tmp/lab-phase9-2] [--quick] [--no-build] [--datasets=300,500]
// Output: docs/experiments/results/interaction-large-dataset-phase9-2.json

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
const RESULTS_FILE = join(RESULTS_DIR, 'interaction-large-dataset-phase9-2.json')
const S1_REFERENCE_FILE = join(RESULTS_DIR, 'large-dataset-threshold-phase9-1.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase9-2'
const QUICK = process.argv.includes('--quick')
const NO_BUILD = process.argv.includes('--no-build')
const CLI_DATASETS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--datasets='))
  return arg ? arg.split('=')[1].split(',').map(Number) : null
})()

if (!existsSync(join(LAB, 'package.json'))) {
  console.error(`Copia experimental no encontrada: ${LAB}`)
  process.exit(1)
}

const REACT_DIST = join(LAB, 'apps/react-app/dist')
const ANGULAR_DIST = join(LAB, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4197
const ANGULAR_PORT = 4198

// Iterations per cell (NOT the dataset size; the dataset parameter is `size`).
const ITER = QUICK ? 3 : 10
const WARMUP = 1
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
const DATASETS = CLI_DATASETS ?? (QUICK ? [300] : [300, 500, 750, 1000, 1500])
const SCENARIOS = ['S2-search', 'S4-combined']
const PROBE_DATASET = 1000
const PROBE_SCENARIO = 'S2-search'
const THRESHOLDS_MS = [50, 100, 200]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (v, d = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null

// ---------------------------------------------------------------------------
// Build the experimental copy when needed (idempotent)
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
//   - every extra task title contains "Incident" -> incident = 4 + extras;
//   - status cycles [todo,in-progress,completed,cancelled] -> i % 4 === 1;
//   - priority cycles [medium,HIGH,low] -> priority==='high' cuando i % 3 === 1;
//   - combined (incident && in-progress && high) -> i % 4 === 1 && i % 3 === 1
//     (i ≡ 1 mod 12).
// Nota (anomalía documentada): la fórmula de Fase 9 usaba i % 3 === 2, que
// coincide con la real en 30/100/300 (0/6/23) y en 600/750/1000/1500, pero
// diverge en 500 (39 vs 40 real) — la validación de dataset de esta fase lo
// detectó.
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
      if (i % 4 === 1 && i % 3 === 1) combined += 1
    }
  }
  return { incident, inProgress, combined }
}

// ---------------------------------------------------------------------------
// Environment discovery / static server / CDP client (same as Fase 7/9/9.1)
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
  const profile = `/tmp/lh92-profile-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
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

async function waitFor(cdp, expression, timeoutMs = 30000) {
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

// ---------------------------------------------------------------------------
// Harness: long tasks + event timing + MutationObserver with the Fase 9
// isolation probe (outsideMain / outsideActive; detached targets counted as
// inside). `withObserver=false` keeps only the PerformanceObservers (used by
// the overhead probe).
// ---------------------------------------------------------------------------

const HARNESS = (withObserver) => `
window.__ph92 = { lt: [], ev: [], mut: { n: 0, added: 0, removed: 0, attrs: 0, outsideMain: 0, outsideActive: 0 }, mo: null };
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph92.lt.push({ s: e.startTime, d: e.duration });
  }).observe({ type: 'longtask' });
} catch (e) {}
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph92.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
  }).observe({ type: 'event', durationThreshold: 0 });
} catch (e) {}
${
  withObserver
    ? `
try {
  window.__ph92.mo = new MutationObserver((recs) => {
    const main = document.querySelector('main');
    const active = window.__ph92.active || document.querySelector('main section[aria-label]');
    for (const r of recs) {
      const m = window.__ph92.mut;
      m.n += 1;
      m.added += r.addedNodes.length;
      m.removed += r.removedNodes.length;
      if (r.type === 'attributes') m.attrs += 1;
      const t = r.target;
      if (!(main && main.contains(t)) && t.isConnected !== false) m.outsideMain += 1;
      if (!(active && active.contains(t)) && t.isConnected !== false) m.outsideActive += 1;
    }
  });
  window.__ph92.mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
} catch (e) {}
`
    : ''
}
true;
`

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

const SCENARIO_DEFS = {
  'S2-search': {
    label: 'Live search on tasks list (input event "incident")',
    action: setInput('task-search', 'incident'),
    reset: setInput('task-search', ''),
    check: (level) =>
      `document.getElementById('task-search').value === 'incident' && ${rowCountExpr} === ${expectedCounts(level).incident}`,
  },
  'S4-combined': {
    label: 'Combined search + status + priority filters in one batch',
    action: `${setInput('task-search', 'incident')}\n${setSelect('task-status-filter', 'in-progress')}\n${setSelect('task-priority-filter', 'high')}`,
    reset: `${setInput('task-search', '')}\n${setSelect('task-status-filter', 'all')}\n${setSelect('task-priority-filter', 'all')}`,
    check: (level) =>
      `document.getElementById('task-search').value === 'incident' && document.getElementById('task-status-filter').value === 'in-progress' && document.getElementById('task-priority-filter').value === 'high' && ${rowCountExpr} === ${expectedCounts(level).combined}`,
  },
}

// ---------------------------------------------------------------------------
// Update-measure expression: commit until the EXPECTED filtered count is in
// the DOM (same definition of duration as Fase 9.1 S1), then stability poll +
// flush window to collect long tasks / trailing mutations.
// ---------------------------------------------------------------------------

function updateMeasureExpr(expectedCount, actionStmts) {
  return `(async () => {
    const ltStart = window.__ph92.lt.length;
    const evStart = window.__ph92.ev.length;
    const mutStart = { ...window.__ph92.mut };
    window.__ph92.active = document.querySelector('main section[aria-label]');
    const t0 = performance.now();
    ${actionStmts}
    const tSync = performance.now();
    let tRows = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${rowCountExpr} === ${expectedCount}) { tRows = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 16));
    }
    if (tRows === null) throw new Error('rows never reached ${expectedCount}');
    // stability: one more poll must keep the count (guards against catching a transient)
    await new Promise((r) => setTimeout(r, 16));
    if (${rowCountExpr} !== ${expectedCount}) throw new Error('rows not stable at ${expectedCount}');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 100));
    const t1 = performance.now();
    const m = window.__ph92.mut;
    return {
      duration: tRows - t0,
      sync: tSync - t0,
      commitToRows: tRows - tSync,
      paintTail: t1 - tRows,
      rows: ${rowCountExpr},
      longTasks: window.__ph92.lt.slice(ltStart),
      events: window.__ph92.ev.slice(evStart),
      mutations: {
        n: m.n - mutStart.n,
        added: m.added - mutStart.added,
        removed: m.removed - mutStart.removed,
        attrs: m.attrs - mutStart.attrs,
        outsideMain: m.outsideMain - mutStart.outsideMain,
        outsideActive: m.outsideActive - mutStart.outsideActive
      }
    };
  })()
`
}

const SETTLE_EXPR = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 50));
  return true;
})()`

async function waitForTasksLoaded(cdp, level) {
  await waitFor(
    cdp,
    `document.querySelector('main section[aria-label="Tasks"]') !== null && ${rowCountExpr} === ${level}`,
  )
}

async function settleRows(cdp, level) {
  const start = Date.now()
  for (;;) {
    try {
      if ((await evaluate(cdp, `${rowCountExpr} === ${level}`)) === true) break
    } catch {
      /* retry */
    }
    if (Date.now() - start > 20000) throw new Error('rows did not return to dataset size')
    await sleep(100)
  }
  await sleep(120)
  const again = await evaluate(cdp, `${rowCountExpr} === ${level}`)
  if (again !== true) throw new Error('rows not stable after reset')
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
  return {
    n: iters.length,
    iterations: iters,
    checksPassed: iters.filter((i) => i.checkOk).length,
    duration: stats(pick((i) => i.duration)),
    sync: stats(pick((i) => i.sync)),
    commitToRows: stats(pick((i) => i.commitToRows)),
    paintTail: stats(pick((i) => i.paintTail)),
    longTaskCount: {
      sum: pick((i) => i.longTasks.length).reduce((a, b) => a + b, 0),
      iterationsWithLongTasks: iters.filter((i) => i.longTasks.length > 0).length,
      pctIterationsAffected: round(
        (iters.filter((i) => i.longTasks.length > 0).length / Math.max(iters.length, 1)) * 100,
        1,
      ),
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
    thresholds: {
      gt50ms: iters.filter((i) => i.duration > THRESHOLDS_MS[0]).length,
      gt100ms: iters.filter((i) => i.duration > THRESHOLDS_MS[1]).length,
      gt200ms: iters.filter((i) => i.duration > THRESHOLDS_MS[2]).length,
    },
  }
}

// ---------------------------------------------------------------------------
// Cell runner (one browser session per scenario × dataset × app)
// ---------------------------------------------------------------------------

async function runCell(cdp, sc, level) {
  await evaluate(cdp, clickNav('Tasks'))
  await waitForTasksLoaded(cdp, level)
  await evaluate(cdp, SETTLE_EXPR)

  for (let w = 0; w < WARMUP; w += 1) {
    await evaluate(cdp, updateMeasureExpr(expectedCounts(level)[sc.targetCount], sc.action))
    await evaluate(cdp, sc.reset)
    await evaluate(cdp, SETTLE_EXPR)
    await settleRows(cdp, level)
  }

  const iters = []
  for (let i = 0; i < ITER; i += 1) {
    const m0 = await getMetrics(cdp)
    const r = await evaluate(
      cdp,
      updateMeasureExpr(expectedCounts(level)[sc.targetCount], sc.action),
    )
    await sleep(120)
    const m1 = await getMetrics(cdp)
    const checkOk = (await evaluate(cdp, sc.check(level))) === true
    await evaluate(cdp, sc.reset)
    await evaluate(cdp, SETTLE_EXPR)
    await settleRows(cdp, level)
    iters.push({
      duration: round(r.duration, 3),
      sync: round(r.sync, 3),
      commitToRows: round(r.commitToRows, 3),
      paintTail: round(r.paintTail, 3),
      rows: r.rows,
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
  await evaluate(cdp, setInput('task-search', ''))
  await evaluate(cdp, setSelect('task-status-filter', 'all'))
  await evaluate(cdp, setSelect('task-priority-filter', 'all'))
  return { total, incident, inProgress, combined, expected: exp }
}

// ---------------------------------------------------------------------------
// Growth analysis between consecutive dataset points (Fase 9.1 heuristic)
// ---------------------------------------------------------------------------

function growthSegments(values, sizes) {
  const slopes = []
  if (values.length < 2) return { slopes: [], shapes: [] }
  for (let i = 1; i < values.length; i += 1) {
    const dv = values[i] - values[i - 1]
    const dn = (sizes[i] - sizes[i - 1]) / 1000
    slopes.push({
      from: sizes[i - 1],
      to: sizes[i],
      delta: round(dv, 2),
      per1000: round(dv / dn, 2),
    })
  }
  const shapes = []
  for (let i = 0; i < slopes.length; i += 1) {
    const s = slopes[i]
    let shape = 'inconclusive'
    if (i === 0) {
      shape = 'primer-segmento'
    } else {
      const prev = slopes[i - 1].per1000
      const cur = s.per1000
      const span = Math.max(Math.abs(prev), Math.abs(cur), 1)
      if (Math.abs(cur - prev) <= 0.25 * span) shape = 'lineal'
      else if (cur < prev * 0.75) shape = 'sublineal'
      else if (cur > prev * 1.25) shape = 'superlineal'
      else if (cur > prev * 2 || cur < prev * 0.5) shape = 'cambio-de-regimen'
    }
    shapes.push(shape)
  }
  return { slopes, shapes }
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
console.log(`servers: react :${REACT_PORT} · angular :${ANGULAR_PORT}`)
console.log(`shell: ${shellPath}\nlab: ${LAB}`)

const apps = {
  react: { url: `http://127.0.0.1:${REACT_PORT}/`, key: 'react' },
  angular: { url: `http://127.0.0.1:${ANGULAR_PORT}/`, key: 'angular' },
}

let chromeVersion = null
async function session(app, level, withObserver, setupFn) {
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
    await cdp.send('Performance.enable')
    await evaluate(cdp, HARNESS(withObserver))
    const installed = await evaluate(cdp, `typeof window.__ph92 !== 'undefined'`)
    if (!installed) throw new Error('harness not installed')
    await sleep(500)
    const data = await setupFn(cdp)
    cdp.close()
    return data
  } finally {
    await killBrowser(browser)
    await sleep(250)
  }
}

// --- Dataset validation (one session per level per app) ---
const datasetValidation = {}
for (const level of DATASETS) {
  datasetValidation[level] = {}
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== VALIDACIÓN · dataset=${level} · ${appKey} ===`)
    const v = await session(app, level, true, (cdp) => validateDataset(cdp, level))
    datasetValidation[level][appKey] = v
    const ok =
      v.total === level &&
      v.incident === v.expected.incident &&
      v.inProgress === v.expected.inProgress &&
      v.combined === v.expected.combined
    if (!ok) throw new Error(`dataset validation failed for ${appKey} @ ${level}`)
    console.log(
      `  total=${v.total} incident=${v.incident} inProgress=${v.inProgress} combined=${v.combined} (esperado ${v.expected.incident}/${v.expected.inProgress}/${v.expected.combined}) → OK`,
    )
  }
}

// --- Scenario cells ---
const scenarioDefs = {
  'S2-search': { ...SCENARIO_DEFS['S2-search'], targetCount: 'incident' },
  'S4-combined': { ...SCENARIO_DEFS['S4-combined'], targetCount: 'combined' },
}
const results = {}
for (const skey of SCENARIOS) {
  const sc = scenarioDefs[skey]
  results[skey] = { label: SCENARIO_DEFS[skey].label }
  for (const level of DATASETS) {
    results[skey][level] = { react: null, angular: null }
    for (const [appKey, app] of Object.entries(apps)) {
      console.log(`\n=== ${skey} · dataset=${level} · ${appKey} (observer ON) ===`)
      const data = await session(app, level, true, (cdp) => runCell(cdp, sc, level))
      results[skey][level][appKey] = data
      console.log(
        `  duration ${data.duration.median} ms (${data.duration.min}–${data.duration.max} · p95 ${data.duration.p95}) · sync ${data.sync.median} · commitToRows ${data.commitToRows.median} · muts ${data.mutations.records.median} · outsideActive ${data.isolation.outsideActive.median} · longTasks ${data.longTaskCount.sum} · checks ${data.checksPassed}/${data.n} · >100ms ${data.thresholds.gt100ms}/${data.n}`,
      )
    }
  }
}

// --- Overhead probe (S2 at PROBE_DATASET, observer ON vs OFF) ---
let overheadProbe = {}
if (DATASETS.includes(PROBE_DATASET)) {
  const sc = scenarioDefs[PROBE_SCENARIO]
  overheadProbe = { dataset: PROBE_DATASET, scenario: PROBE_SCENARIO }
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== OVERHEAD PROBE · ${appKey} (observer OFF) ===`)
    const on = results[PROBE_SCENARIO][PROBE_DATASET][appKey]
    const off = await session(app, PROBE_DATASET, false, (cdp) => runCell(cdp, sc, PROBE_DATASET))
    overheadProbe[appKey] = {
      withObserver: { durationMedian: on.duration.median, syncMedian: on.sync.median },
      withoutObserver: { durationMedian: off.duration.median, syncMedian: off.sync.median },
      overheadDurationMs: round((on.duration.median ?? 0) - (off.duration.median ?? 0), 2),
    }
    console.log(
      `  duration ON ${on.duration.median} ms · OFF ${off.duration.median} ms · overhead ${overheadProbe[appKey].overheadDurationMs} ms`,
    )
  }
}

// --- Confirmation batches (cells with median or p95 >= 100 ms) ---
const confirmations = {}
for (const skey of SCENARIOS) {
  for (const level of DATASETS) {
    const cell = results[skey][level]
    const crosses =
      (cell.react?.duration?.median ?? 0) >= 100 ||
      (cell.react?.duration?.p95 ?? 0) >= 100 ||
      (cell.angular?.duration?.median ?? 0) >= 100 ||
      (cell.angular?.duration?.p95 ?? 0) >= 100
    if (!crosses) continue
    confirmations[`${skey}@${level}`] = {}
    const sc = scenarioDefs[skey]
    for (const [appKey, app] of Object.entries(apps)) {
      console.log(`\n=== CONFIRMACIÓN · ${skey} · dataset=${level} · ${appKey} ===`)
      confirmations[`${skey}@${level}`][appKey] = await session(app, level, true, (cdp) =>
        runCell(cdp, sc, level),
      )
      console.log(
        `  duration ${confirmations[`${skey}@${level}`][appKey].duration.median} ms (p95 ${confirmations[`${skey}@${level}`][appKey].duration.p95}) · longTasks ${confirmations[`${skey}@${level}`][appKey].longTaskCount.sum} · checks ${confirmations[`${skey}@${level}`][appKey].checksPassed}/${confirmations[`${skey}@${level}`][appKey].n}`,
      )
    }
  }
}

for (const s of servers) s.close()

// --- Merge with previous chunks (resumability: --datasets=...) ---
let base = {}
if (CLI_DATASETS && existsSync(RESULTS_FILE)) {
  try {
    base = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
  } catch {
    base = {}
  }
}
// Only numeric level keys participate in results / dataset ladders; the
// `label` string inside results[skey] must NOT be merged as a level.
const numericKeys = (obj) => Object.keys(obj ?? {}).filter((k) => /^\d+$/.test(k))
const allResults = {}
for (const skey of SCENARIOS) {
  allResults[skey] = { label: SCENARIO_DEFS[skey].label }
  const mergedKeys = new Set([...numericKeys(base.results?.[skey]), ...numericKeys(results[skey])])
  for (const level of mergedKeys) {
    allResults[skey][level] = {
      ...(base.results?.[skey]?.[level] ?? {}),
      ...(results[skey]?.[level] ?? {}),
    }
  }
}
const allConfirmations = { ...(base.confirmations ?? {}), ...confirmations }
const allOverheadProbe = { ...(base.overheadProbe ?? {}), ...overheadProbe }
const allDatasetValidation = { ...(base.datasetValidation ?? {}), ...datasetValidation }
const allDatasets = numericKeys(allResults['S2-search'] ?? {})
  .map(Number)
  .sort((a, b) => a - b)

// --- Comparison + growth over the merged ladder ---
const comparison = {}
const growth = {}
const isolationSummary = {}
for (const skey of SCENARIOS) {
  comparison[skey] = {}
  growth[skey] = {}
  isolationSummary[skey] = {}
  for (const level of allDatasets) {
    const cell = allResults[skey]?.[level]
    if (!cell?.react || !cell?.angular) continue
    const medianOf = (side, metric) =>
      metric === 'mutations'
        ? (cell[side]?.mutations?.records?.median ?? null)
        : (cell[side]?.[metric]?.median ?? null)
    comparison[skey][level] = {
      duration: {
        react: cell.react.duration.median,
        angular: cell.angular.duration.median,
        deltaAngularMinusReact: round(cell.angular.duration.median - cell.react.duration.median, 3),
        ratioAngularOverReact:
          cell.react.duration.median !== 0
            ? round(cell.angular.duration.median / cell.react.duration.median, 2)
            : null,
      },
      p95: {
        react: cell.react.duration.p95,
        angular: cell.angular.duration.p95,
        deltaAngularMinusReact: round(cell.angular.duration.p95 - cell.react.duration.p95, 3),
      },
      sync: {
        react: cell.react.sync.median,
        angular: cell.angular.sync.median,
        deltaAngularMinusReact: round(cell.angular.sync.median - cell.react.sync.median, 3),
        ratioAngularOverReact:
          cell.react.sync.median !== 0
            ? round(cell.angular.sync.median / cell.react.sync.median, 2)
            : null,
      },
      mutations: {
        react: medianOf('react', 'mutations'),
        angular: medianOf('angular', 'mutations'),
      },
      longTasks: {
        react: cell.react.longTaskCount.sum,
        angular: cell.angular.longTaskCount.sum,
        reactIterationsAffected: cell.react.longTaskCount.iterationsWithLongTasks,
        angularIterationsAffected: cell.angular.longTaskCount.iterationsWithLongTasks,
      },
      thresholds: {
        react: cell.react.thresholds,
        angular: cell.angular.thresholds,
      },
    }
    isolationSummary[skey][level] = {
      react: cell.react.isolation ?? null,
      angular: cell.angular.isolation ?? null,
    }
  }
  for (const metric of ['duration', 'sync']) {
    const med = (side, level) => allResults[skey]?.[level]?.[side]?.[metric]?.median ?? null
    growth[skey][metric] = {
      react: growthSegments(
        allDatasets.map((l) => med('react', l)),
        allDatasets,
      ),
      angular: growthSegments(
        allDatasets.map((l) => med('angular', l)),
        allDatasets,
      ),
    }
  }
}

// --- S1 reference from Fase 9.1 (same commit protocol; minimal observer) ---
let s1Reference = null
if (existsSync(S1_REFERENCE_FILE)) {
  try {
    const s1 = JSON.parse(readFileSync(S1_REFERENCE_FILE, 'utf8'))
    s1Reference = {
      note: 'Fase 9.1 (large-dataset-threshold-phase9-1.json): S1 mount (Projects->Tasks), mismo protocolo de commit (duration = hasta que las filas alcanzan el objetivo). Observador MÍNIMO (sin atributos ni sonda de aislamiento) — asimetría documentada con Fase 9.2 (observador completo).',
      durationMedianMs: {},
    }
    for (const d of Object.keys(s1.comparison ?? {})) {
      s1Reference.durationMedianMs[d] = {
        react: s1.comparison[d]?.duration?.react ?? null,
        angular: s1.comparison[d]?.duration?.angular ?? null,
      }
    }
  } catch {
    s1Reference = null
  }
}

const git = (args) => {
  try {
    return execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const result = {
  experiment: 'interaction-large-dataset-phase9-2',
  capturedAt: new Date().toISOString(),
  objective:
    'Medir S2 (search/filter) y S4 (combined) con datasets grandes (300-1500 tareas, 2000 si estable): si el trabajo síncrono de React sigue creciendo con las filas, si Angular mantiene su coalescing, si la diferencia se convierte en latencia de commit perceptible, en qué dataset cada framework cruza 50/100/200 ms, si las actualizaciones incrementales degradan antes o después que el montaje completo (S1 de Fase 9.1), y si aparece un cambio de régimen. Evaluar H35-H40.',
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
    note: 'chrome-headless-shell (Chrome for Testing), único headless funcional en este entorno (Fases 4.1/5.1/7/9/9.1). Copia experimental aislada en /tmp; el árbol principal no se modifica.',
  },
  method: {
    summary:
      'Escenarios S2 (search "incident") y S4 (search + status + priority en un lote) de Fase 9, con el protocolo commit-determinista de Fase 9.1 aplicado a actualizaciones incrementales: t0 -> acción -> tSync (trabajo síncrono) -> poll de 16 ms hasta que la lista filtrada alcanza el conteo esperado (determinista por regla scale-dataset.ts) -> tRows -> poll de estabilidad (el conteo debe mantenerse) -> 2 rAF + macrotask + 100 ms de flush (long tasks/mutaciones residuales). duration = tRows - t0 (misma definición que S1 de Fase 9.1, por lo que los umbrales S1 vs S2 vs S4 son comparables dentro de la misma metodología). Se rechazó una ventana de quiescencia fija (piso de ~150 ms que cruzaría el umbral en el dataset menor). Harness: long tasks + event timing + MutationObserver (childList + attributes + characterData) con sonda de aislamiento de Fase 9 (fuera de main / fuera de la sección activa; targets desconectados contados como dentro). Sonda de overhead del observador (S2 en 1000, ON vs OFF). Tandas de confirmación (+10 iteraciones) en celdas con mediana o p95 >= 100 ms. Validación de dataset por nivel (total/incident/inProgress/combined contra la regla documentada).',
    viewport: VIEWPORT,
    datasets: DATASETS,
    scenarios: Object.fromEntries(Object.entries(SCENARIO_DEFS).map(([k, v]) => [k, v.label])),
    iterations: ITER,
    warmup: WARMUP,
    probe: { dataset: PROBE_DATASET, scenario: PROBE_SCENARIO },
    thresholds:
      '50 / 100 / 200 ms como umbrales operativos del experimento (NO equivalen automáticamente a percepción humana; documentado).',
    metrics: [
      'duration (ms) = tiempo desde la acción hasta que la lista filtrada alcanza el conteo esperado en el DOM (commit completo). PRIMARIA para los umbrales',
      'sync (ms) = trabajo síncrono del/los evento(s) de la acción',
      'commitToRows (ms) = commit diferido hasta el conteo objetivo',
      'paintTail (ms) = ventana posterior (2 rAF + macrotask + 100 ms; informativa, ~constante)',
      'longTasks (PerformanceObserver longtask; conteo, duraciones y % de iteraciones afectadas)',
      'mutations (records / added / removed / attrs) + aislamiento (outsideMain / outsideActive)',
      'heapDeltaKb / nodesDelta (CDP Performance.getMetrics; informativas; ScriptDuration NO se usa)',
    ],
    checks:
      'cada iteración verifica el valor de los controles + el conteo exacto esperado (checkOk); el poll lanza error si el conteo objetivo no se alcanza (parada controlada); tras el reset se espera a que la lista completa (N filas) vuelva y se confirme estable (settleRows).',
    growthHeuristic:
      'pendientes por segmento: delta por 1000 elementos entre puntos consecutivos; |s2-s1| <= 0.25*max(|s1|,|s2|,1) -> lineal; s2 < 0.75*s1 -> sublineal; s2 > 1.25*s1 -> superlineal; cambio >2x -> cambio de régimen. Heurística sobre 3-5 puntos, no estadística formal.',
    s1Comparison:
      'S1 se toma de los resultados de Fase 9.1 (large-dataset-threshold-phase9-1.json) en los datasets solapados (300/1000/1500) porque usa la misma definición de duration (commit hasta conteo objetivo). Asimetría: observador de 9.1 mínimo vs observador completo de 9.2; acotada por la sonda de overhead.',
  },
  datasetValidation: allDatasetValidation,
  results: allResults,
  comparison,
  growth,
  isolation: isolationSummary,
  overheadProbe: allOverheadProbe,
  confirmations: allConfirmations,
  s1Reference,
  limitations: [
    'Mediciones en localhost sin throttling; no representan condiciones de campo.',
    'El MutationObserver añade overhead asimétrico (Angular genera más registros por construcción incremental); la sonda de overhead en 1000 lo cuantifica para S2, pero no es eliminable si se quiere contar mutaciones y aislamiento.',
    'El poll de 16 ms cuantiza el instante de commit en ~16 ms (incluido en duration), igual que Fase 9.1.',
    'La comparación S1 vs S2/S4 usa resultados de Fase 9.1 para S1 (observador mínimo, sin sonda de aislamiento) — asimetría de harness documentada y acotada por la sonda de overhead; los cruces de 100 ms son holgados respecto al overhead medido.',
    'El reset entre iteraciones reconstruye la lista completa (N filas): a 1500 el coste de reset es material, pero ocurre fuera de la ventana medida.',
    'CDP Performance.getMetrics es poco fiable en este headless-shell; solo JSHeapUsedSize y Nodes se usan como informativas.',
    'Una máquina local; resultados indicativos, no benchmark científico (metrics.md §1).',
    'La comparación de magnitudes absolutas con Fase 9 (S2/S4) solo como contexto: Fase 9 usaba una ventana fija (2 rAF + macrotask + 80 ms) para duration, no poll hasta conteo objetivo.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== TABLA PRINCIPAL (mediana duration, ms — commit hasta conteo objetivo) ===')
for (const skey of SCENARIOS) {
  console.log(`\n-- ${skey} --`)
  console.log(
    'dataset | React mediana (p95) | Angular mediana (p95) | Δ | ratio | sync R/A | LT R/A | >100ms R/A | >200ms R/A',
  )
  for (const level of allDatasets) {
    const c = comparison[skey][level]
    if (!c) continue
    console.log(
      `${level} | ${c.duration.react} (${c.p95.react}) | ${c.duration.angular} (${c.p95.angular}) | ${c.duration.deltaAngularMinusReact} | ${c.duration.ratioAngularOverReact}× | ${c.sync.react}/${c.sync.angular} | ${c.longTasks.react}/${c.longTasks.angular} | ${c.thresholds.react.gt100ms}/${c.thresholds.angular.gt100ms} | ${c.thresholds.react.gt200ms}/${c.thresholds.angular.gt200ms}`,
    )
  }
}
console.log('\n=== CRECIMIENTO (pendiente ms/1000 elementos) ===')
for (const skey of SCENARIOS) {
  for (const metric of ['duration', 'sync']) {
    console.log(`-- ${skey} · ${metric} --`)
    console.log(
      '  React:',
      growth[skey][metric].react.slopes.map((s) => `${s.from}->${s.to}: ${s.per1000}`).join(' · '),
    )
    console.log(
      '  Angular:',
      growth[skey][metric].angular.slopes
        .map((s) => `${s.from}->${s.to}: ${s.per1000}`)
        .join(' · '),
    )
  }
}
console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
