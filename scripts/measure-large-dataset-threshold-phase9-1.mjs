#!/usr/bin/env node
// Large-dataset degradation threshold (Fase 9.1) — S1 mount under growth.
//
// Only scenario S1 of Fase 9 (navigation Projects -> Tasks, which mounts the
// full task list) is measured, at datasets 300 / 600 / 1000 / 1500 / 3000,
// driven by the ?dataset=N query parameter (deterministic scale rule in
// packages/domain/src/scale-dataset.ts of the experimental copy). 300 is
// regenerated inside this phase as a contemporary reference point.
//
// Mount-settle protocol (deterministic, framework-agnostic):
//   t0 -> click Tasks -> tSync (synchronous dispatch) -> poll until the full
//   list (.task-list li) reaches N rows -> tRows -> 2 rAF + macrotask +
//   100 ms flush (collects long tasks / trailing mutations) -> t1.
//   So the measurement separates:
//      sync        = tSync - t0        (synchronous event work)
//      mountToRows = tRows - tSync     (deferred commit until full DOM)
//      duration    = tRows - t0        (commit / interaction duration; PRIMARY)
//      paintTail   = t1 - tRows        (protocol flush window, informational)
//
// Harness: PerformanceObserver (longtask + event timing) and a MINIMAL
// MutationObserver (childList + characterData; counts records / added /
// removed nodes; no attribute observation, no contains() classification) so
// the observer itself does not dominate the measured mount. A dedicated
// overhead probe at 1000 elements measures the observer's cost per framework
// (observer ON vs OFF). Confirmation batches (+10 iterations) run for any
// dataset whose median or p95 duration >= 100 ms.
//
// Zero runtime dependencies: Node built-ins + chrome-headless-shell via CDP.
//
// Usage:
//   node scripts/measure-large-dataset-threshold-phase9-1.mjs [/tmp/lab-phase9-1] [--quick] [--no-build]
// Output: docs/experiments/results/large-dataset-threshold-phase9-1.json

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
const RESULTS_FILE = join(RESULTS_DIR, 'large-dataset-threshold-phase9-1.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase9-1'
const QUICK = process.argv.includes('--quick')
const NO_BUILD = process.argv.includes('--no-build')
// Resumability: --datasets=300,600 overrides the dataset ladder. When set, the
// measured datasets are merged into an existing results JSON (if any) so long
// runs can be split into chunks without losing previous data.
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
const REACT_PORT = 4195
const ANGULAR_PORT = 4196

// Number of measured iterations (NOT the dataset size; runS1 shadows this
// intentionally renamed to ITER to avoid the dataset-size parameter name).
const ITER = QUICK ? 3 : 10
const WARMUP = 1
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
// L2 regenerated as contemporary reference + growth steps up to 3000.
const DATASETS = CLI_DATASETS ?? (QUICK ? [300, 1000] : [300, 600, 1000, 1500, 3000])
const PROBE_DATASET = 1000

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
// Environment discovery / static server / CDP client (same as Fase 7/9)
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
  const profile = `/tmp/lh91-profile-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
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

async function waitFor(cdp, expression, timeoutMs = 60000) {
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
// Lightweight harness: long tasks + event timing + MINIMAL MutationObserver
// (childList + characterData only; counts records / added / removed nodes).
// No attribute observation and no contains() classification: the mount
// scenario does not need the isolation probe, and the observer must not
// dominate the measured work (the overhead probe quantifies its cost).
// ---------------------------------------------------------------------------

const HARNESS = (withObserver) => `
window.__m = { lt: [], ev: [], mut: { n: 0, added: 0, removed: 0 }, mo: null };
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__m.lt.push({ s: e.startTime, d: e.duration });
  }).observe({ type: 'longtask' });
} catch (e) {}
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__m.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
  }).observe({ type: 'event', durationThreshold: 0 });
} catch (e) {}
${
  withObserver
    ? `
try {
  window.__m.mo = new MutationObserver((recs) => {
    const m = window.__m.mut;
    for (const r of recs) {
      m.n += 1;
      m.added += r.addedNodes.length;
      m.removed += r.removedNodes.length;
    }
  });
  window.__m.mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
} catch (e) {}
`
    : ''
}
true;
`

const clickNav = (label) => `(() => {
  const btn = [...document.querySelectorAll('nav[aria-label="Main"] button')]
    .find((b) => b.textContent.trim() === '${label}');
  if (!btn) throw new Error('nav button ${label} not found');
  btn.click();
})();`

const rowCountExpr = `document.querySelectorAll('.task-list li').length` // Mount measurement: click Tasks, poll until the full list (N rows) is in the
// DOM, then hold the window open (2 rAF + macrotask + 100 ms) to collect long
// tasks and any trailing mutations. The PRIMARY metric (duration) is the time
// from click until the full list is committed to the DOM (rows === N): it is
// the interaction/commit time of the mount. The trailing window is reported
// separately as paintTail (informational; ~100 ms protocol flush, symmetric).
// A fixed settle window was rejected during development because it adds a
// ~150 ms floor that would cross the 100 ms threshold at the smallest dataset
// and make the threshold question meaningless.
function mountMeasureExpr(N) {
  return `(async () => {
    const ltStart = window.__m.lt.length;
    const evStart = window.__m.ev.length;
    const mStart = { ...window.__m.mut };
    const t0 = performance.now();
    ${clickNav('Tasks')}
    const tSync = performance.now();
    let tRows = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${rowCountExpr} >= ${N}) { tRows = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 16));
    }
    if (tRows === null) throw new Error('rows never reached ${N}');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 100));
    const t1 = performance.now();
    const m = window.__m.mut;
    return {
      duration: tRows - t0,
      sync: tSync - t0,
      mountToRows: tRows - tSync,
      paintTail: t1 - tRows,
      rows: ${rowCountExpr},
      longTasks: window.__m.lt.slice(ltStart),
      events: window.__m.ev.slice(evStart),
      mutations: { n: m.n - mStart.n, added: m.added - mStart.added, removed: m.removed - mStart.removed }
    };
  })()
`
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
  if (v.length === 0) {
    return { n: 0, median: null, min: null, max: null, p90: null, p95: null, stdev: null }
  }
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
    mountToRows: stats(pick((i) => i.mountToRows)),
    paintTail: stats(pick((i) => i.paintTail)),
    longTaskCount: {
      sum: pick((i) => i.longTasks.length).reduce((a, b) => a + b, 0),
      iterationsWithLongTasks: iters.filter((i) => i.longTasks.length > 0).length,
    },
    longTaskMs: stats(iters.flatMap((i) => i.longTasks.map((t) => t.dur))),
    mutations: {
      records: stats(pick((i) => i.mutations.n)),
      addedNodes: stats(pick((i) => i.mutations.added)),
      removedNodes: stats(pick((i) => i.mutations.removed)),
    },
    heapDeltaKb: stats(pick((i) => i.heapDeltaKb)),
    nodesDelta: stats(pick((i) => i.nodesDelta)),
    // Threshold crossings (operational, not perceptual): fraction of
    // iterations whose duration exceeded 50 / 100 / 200 ms.
    thresholds: {
      gt50ms: iters.filter((i) => i.duration > 50).length,
      gt100ms: iters.filter((i) => i.duration > 100).length,
      gt200ms: iters.filter((i) => i.duration > 200).length,
    },
  }
}

// ---------------------------------------------------------------------------
// Scenario runner — S1 mount with deterministic completion
// ---------------------------------------------------------------------------

const SETTLE_EXPR = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 80));
  return true;
})()`

async function runS1(cdp, datasetSize) {
  // Session starts at the default section; navigate to Projects first so every
  // iteration measures a real mount of Tasks.
  await evaluate(cdp, clickNav('Projects'))
  await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
  await evaluate(cdp, SETTLE_EXPR)

  for (let w = 0; w < WARMUP; w += 1) {
    await evaluate(cdp, mountMeasureExpr(datasetSize))
    await evaluate(cdp, clickNav('Projects'))
    await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
    await evaluate(cdp, SETTLE_EXPR)
  }

  const iters = []
  for (let i = 0; i < ITER; i += 1) {
    const m0 = await getMetrics(cdp)
    const r = await evaluate(cdp, mountMeasureExpr(datasetSize))
    await sleep(120)
    const m1 = await getMetrics(cdp)
    const checkOk = r.rows === datasetSize
    // reset: back to Projects (small view), settles before the next baseline
    await evaluate(cdp, clickNav('Projects'))
    await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
    await evaluate(cdp, SETTLE_EXPR)
    iters.push({
      duration: round(r.duration, 3),
      sync: round(r.sync, 3),
      mountToRows: round(r.mountToRows, 3),
      paintTail: round(r.paintTail, 3),
      rows: r.rows,
      longTasks: r.longTasks.map((t) => ({ start: round(t.s, 3), dur: round(t.d, 3) })),
      mutations: { n: r.mutations.n, added: r.mutations.added, removed: r.mutations.removed },
      heapDeltaKb: round((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024, 2),
      nodesDelta: round(m1.Nodes - m0.Nodes, 1),
      checkOk,
    })
  }
  return summarize(iters)
}

// ---------------------------------------------------------------------------
// Growth analysis between consecutive dataset points (documented heuristic)
// ---------------------------------------------------------------------------

// deltaPer1000 = (v2 - v1) / ((n2 - n1) / 1000). Consecutive-step slopes are
// compared: |s2 - s1| <= 0.25 * max(|s1|, |s2|, 1) -> roughly linear;
// s2 < s1 * 0.75 -> sublinear; s2 > s1 * 1.25 -> superlinear; a slope change
// beyond 2x between consecutive steps is flagged as a regime change.
function growthSegments(values, sizes) {
  const slopes = []
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
async function session(app, dataset, withObserver) {
  const browser = await launchBrowser(shellPath)
  try {
    const wsUrl = await openPage(browser.port, `${app.url.replace(/\/$/, '')}/?dataset=${dataset}`)
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
    await sleep(500)
    const data = await runS1(cdp, dataset)
    cdp.close()
    return data
  } finally {
    await killBrowser(browser)
    await sleep(250)
  }
}

// --- Main measurement (observer ON) ---
const results = {}
for (const dataset of DATASETS) {
  results[dataset] = {}
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== S1 · dataset=${dataset} · ${appKey} (observer ON) ===`)
    const data = await session(app, dataset, true)
    results[dataset][appKey] = data
    console.log(
      `  duration ${data.duration.median} ms (min ${data.duration.min} · max ${data.duration.max} · p95 ${data.duration.p95}) · sync ${data.sync.median} · mountToRows ${data.mountToRows.median} · longTasks ${data.longTaskCount.sum} · checks ${data.checksPassed}/${data.n} · >100ms ${data.thresholds.gt100ms}/${data.n}`,
    )
  }
}

// --- Overhead probe at PROBE_DATASET (observer ON vs OFF) ---
const overheadProbe = {}
if (DATASETS.includes(PROBE_DATASET)) {
  overheadProbe.dataset = PROBE_DATASET
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== OVERHEAD PROBE · ${appKey} (observer OFF) ===`)
    const on = results[PROBE_DATASET][appKey]
    const off = await session(app, PROBE_DATASET, false)
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

// --- Confirmation batches (datasets with median or p95 >= 100 ms) ---
const confirmations = {}
for (const dataset of DATASETS) {
  const crosses =
    (results[dataset].react.duration.median ?? 0) >= 100 ||
    (results[dataset].react.duration.p95 ?? 0) >= 100 ||
    (results[dataset].angular.duration.median ?? 0) >= 100 ||
    (results[dataset].angular.duration.p95 ?? 0) >= 100
  if (!crosses) continue
  confirmations[dataset] = {}
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== CONFIRMACIÓN · S1 · dataset=${dataset} · ${appKey} ===`)
    confirmations[dataset][appKey] = await session(app, dataset, true)
    console.log(
      `  duration ${confirmations[dataset][appKey].duration.median} ms (p95 ${confirmations[dataset][appKey].duration.p95}) · longTasks ${confirmations[dataset][appKey].longTaskCount.sum} · checks ${confirmations[dataset][appKey].checksPassed}/${confirmations[dataset][appKey].n}`,
    )
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
const allResults = { ...(base.results ?? {}), ...results }
const allConfirmations = { ...(base.confirmations ?? {}), ...confirmations }
const allOverheadProbe = { ...(base.overheadProbe ?? {}), ...overheadProbe }
const allDatasets = Object.keys(allResults)
  .map(Number)
  .sort((a, b) => a - b)

// --- Comparison + growth (computed over the merged dataset ladder) ---
const comparison = {}
const growth = {}
for (const dataset of allDatasets) {
  const r = allResults[dataset]
  if (!r.react || !r.angular) continue
  comparison[dataset] = {
    duration: {
      react: r.react.duration.median,
      angular: r.angular.duration.median,
      deltaAngularMinusReact: round(r.angular.duration.median - r.react.duration.median, 3),
      ratioAngularOverReact:
        r.react.duration.median !== 0
          ? round(r.angular.duration.median / r.react.duration.median, 2)
          : null,
    },
    p95: {
      react: r.react.duration.p95,
      angular: r.angular.duration.p95,
      deltaAngularMinusReact: round(r.angular.duration.p95 - r.react.duration.p95, 3),
    },
    sync: {
      react: r.react.sync.median,
      angular: r.angular.sync.median,
    },
    longTasks: {
      react: r.react.longTaskCount.sum,
      angular: r.angular.longTaskCount.sum,
    },
    thresholds: {
      react: r.react.thresholds,
      angular: r.angular.thresholds,
    },
  }
}

for (const metric of ['duration', 'sync']) {
  const med = (appKey, d) => allResults[d]?.[appKey]?.[metric]?.median ?? null
  growth[metric] = {
    react: growthSegments(
      allDatasets.map((d) => med('react', d)),
      allDatasets,
    ),
    angular: growthSegments(
      allDatasets.map((d) => med('angular', d)),
      allDatasets,
    ),
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
  experiment: 'large-dataset-threshold-phase9-1',
  capturedAt: new Date().toISOString(),
  objective:
    'Determinar experimentalmente si existe un umbral de degradación perceptible (100 ms operativos) al montar la vista completa (S1) con datasets grandes (300-3000 tareas), qué framework lo alcanza primero, si el crecimiento es aproximadamente lineal o cambia de régimen, si el trabajo síncrono y la latencia divergen, y si aparecen long tasks. Evaluar H31-H34.',
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
    note: 'chrome-headless-shell (Chrome for Testing), único headless funcional en este entorno (Fases 4.1/5.1/7/9). Copia experimental aislada en /tmp; el árbol principal no se modifica.',
  },
  method: {
    summary:
      'Solo escenario S1 (navegación Projects -> Tasks = montaje de la lista completa). Dataset por ?dataset=N (regla determinista scale-dataset.ts). Protocolo mount-settle determinista: click -> sync (dispatch síncrono) -> poll hasta que las N filas están en el DOM (mountToRows); duration = tiempo hasta el commit completo (sync + mountToRows); la ventana posterior (2 rAF + macrotask + 100 ms) solo recoge long tasks/mutaciones residuales (paintTail, informativo). Se descartó una ventana de quiescencia fija porque añade un piso de ~150 ms que cruzaría el umbral de 100 ms ya en el dataset menor. Harness ligero: long tasks + MutationObserver mínimo (childList + characterData; sin atributos ni clasificación). Sonda de overhead del observador en 1000 (ON vs OFF). Tandas de confirmación (+10 iteraciones) en datasets con mediana o p95 >= 100 ms. 300 se regenera como referencia contemporánea de Fase 9.',
    viewport: VIEWPORT,
    datasets: DATASETS,
    iterations: ITER,
    warmup: WARMUP,
    probeDataset: PROBE_DATASET,
    thresholds:
      '50 / 100 / 200 ms como umbrales operativos del experimento (NO equivalen automáticamente a percepción humana; documentado).',
    metrics: [
      'duration (ms) = tiempo desde el click hasta que las N filas están en el DOM (commit completo; settle del montaje). PRIMARIA para el umbral',
      'sync (ms) = trabajo síncrono del evento (dispatch del click)',
      'mountToRows (ms) = commit diferido hasta que las N filas están en el DOM',
      'paintTail (ms) = ventana posterior al commit (2 rAF + macrotask + 100 ms de flush; informativa, ~constante)',
      'longTasks (PerformanceObserver longtask)',
      'mutations (MutationObserver mínimo: registros, nodos añadidos/eliminados)',
      'heapDeltaKb / nodesDelta (CDP Performance.getMetrics; informativas; ScriptDuration NO se usa)',
    ],
    checks:
      'cada iteración verifica que el número de filas alcanza exactamente N (checkOk); si no llega en el plazo, la medición lanza error (parada controlada).',
    growthHeuristic:
      'pendientes por segmento: delta por 1000 elementos entre puntos consecutivos; |s2-s1| <= 0.25*max(|s1|,|s2|,1) -> lineal; s2 < 0.75*s1 -> sublineal; s2 > 1.25*s1 -> superlineal; cambio >2x -> cambio de régimen. Heurística sobre 3-5 puntos, no estadística formal.',
  },
  results: allResults,
  comparison,
  growth,
  overheadProbe: allOverheadProbe,
  confirmations: allConfirmations,
  limitations: [
    'Mediciones en localhost sin throttling; no representan condiciones de campo.',
    'El MutationObserver añade overhead asimétrico (Angular genera muchos más registros por construcción incremental); la sonda de overhead en 1000 lo cuantifica, pero el overhead del observador no es eliminable si se quiere contar mutaciones.',
    'mountToRows usa polling de 16 ms: la resolución del instante en que la lista se completa es de ~16 ms (cuantización del poll), incluida en la duración del montaje.',
    'A 3000 filas (~265k nodos) el navegador headless puede acercarse a sus límites; si una sesión falla o no completa, se documenta y se detiene el escalado de forma controlada.',
    'CDP Performance.getMetrics es poco fiable en este headless-shell (ScriptDuration en 0); solo JSHeapUsedSize y Nodes se usan como informativas.',
    'Una máquina local; resultados indicativos, no benchmark científico (metrics.md §1).',
    'Comparaciones de magnitud absoluta con Fase 7/9 solo como contexto; el protocolo mount-settle de esta fase es más robusto (espera a las N filas) que el de Fase 9 para S1.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== TABLA PRINCIPAL (mediana duration, ms) ===')
console.log(
  'dataset | React mediana (p95) | Angular mediana (p95) | Δ | ratio | sync R/A | LT R/A | >100ms R/A',
)
for (const dataset of DATASETS) {
  const c = comparison[dataset]
  console.log(
    `${dataset} | ${c.duration.react} (${c.p95.react}) | ${c.duration.angular} (${c.p95.angular}) | ${c.duration.deltaAngularMinusReact} | ${c.duration.ratioAngularOverReact}× | ${c.sync.react}/${c.sync.angular} | ${c.longTasks.react}/${c.longTasks.angular} | ${c.thresholds.react.gt100ms}/${c.thresholds.angular.gt100ms}`,
  )
}
console.log('\n=== CRECIMIENTO (pendiente ms/1000 elementos) ===')
for (const metric of ['duration', 'sync']) {
  console.log(`-- ${metric} --`)
  console.log(
    '  React:',
    growth[metric].react.slopes.map((s) => `${s.from}->${s.to}: ${s.per1000}`).join(' · '),
  )
  console.log(
    '  Angular:',
    growth[metric].angular.slopes.map((s) => `${s.from}->${s.to}: ${s.per1000}`).join(' · '),
  )
}
console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
