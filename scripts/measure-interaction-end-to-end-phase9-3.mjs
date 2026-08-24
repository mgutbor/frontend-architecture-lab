#!/usr/bin/env node
// End-to-end flow: mount + interaction on large datasets (Fase 9.3).
//
// Combines the two regimes isolated in Fases 9.1 (S1 mount) and 9.2 (S4
// combined updates) into ONE continuous measured flow per iteration:
//
//   t0 -> click Tasks (from Projects) -> tSection (Tasks section in DOM) ->
//   tRowsM (full list N rows committed) -> short flush -> t0s4 -> S4 actions
//   (search "incident" + status in-progress + priority high) -> tSyncS4 ->
//   tRowsS4 (combined count committed) -> stability + flush -> t0s4b -> S4b
//   (repeated interaction: priority high -> low, same combined count) ->
//   tSyncS4b -> tRowsS4b -> stability + flush -> tEnd.
//
// Metrics (all within ONE evaluate expression; continuous clock):
//   navigation = tSection - t0            (entry into the feature)
//   mount      = tRowsM - t0              (same definition as S1 of Fase 9.1)
//   mountToRows = tRowsM - tSection       (deferred commit of the mount)
//   s4         = tRowsS4 - t0s4           (same definition as S4 of Fase 9.2)
//   s4Sync     = tSyncS4 - t0s4           (synchronous event work of S4)
//   s4b        = tRowsS4b - t0s4b         (repeated interaction)
//   s4bSync    = tSyncS4b - t0s4b
//   total      = tRowsS4 - t0             (E2E through FIRST interaction; PRIMARY)
//   total2     = tRowsS4b - t0            (E2E through REPEATED interaction)
//   stableEnd  = tEnd - t0                (informational; includes fixed flush
//                                          floors ~2×100 ms, NOT threshold-usable)
//   residual   = total - (mount + s4)     (measured directly, NOT assumed zero)
//
// The residual is computed per iteration: it equals the gap between the mount
// commit (tRowsM) and the S4 start (t0s4) = mount flush (fixed 30 ms) +
// scheduling/GC/interaction between phases. Reported as residual ms and % of
// total. Nothing is summed; total is always measured directly.
//
// Harness: PerformanceObserver (longtask) + MutationObserver with the Fase 9
// isolation probe (outsideMain / outsideActive; detached targets counted as
// inside), sliced per phase (mount / s4 / s4b). The isolation verdict is based
// on the S4/S4b phases only: the mount phase replaces the section (its
// outsideActive counts the section-replacement work — documented artifact, the
// same as Fase 9.1/9.2).
//
// Overhead probe: the full flow at PROBE_DATASET with observer ON vs OFF.
// Confirmation batches (+10 iterations) run for the FIRST dataset crossing 100
// ms, the FIRST crossing 200 ms and the FIRST with long tasks (deduplicated).
// Resumable via --datasets=300,500 (merges into the existing JSON).
//
// Dataset validation per level: total / incident / inProgress / combined
// (incident+in-progress+high) / combinedLow (incident+in-progress+low, the S4b
// target). Both occur once per 12 extras, but the counts can differ by 1
// depending on where the extra interval ends (detected by the dataset
// validation: equal at 300/750/1000/1500, differ by 1 at 500 and 2000). Each
// phase polls against ITS OWN count.
//
// Zero runtime dependencies: Node built-ins + chrome-headless-shell via CDP.
//
// Usage:
//   node scripts/measure-interaction-end-to-end-phase9-3.mjs [/tmp/lab-phase9-3] [--quick] [--no-build] [--datasets=300,500]
// Output: docs/experiments/results/interaction-end-to-end-phase9-3.json

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
const RESULTS_FILE = join(RESULTS_DIR, 'interaction-end-to-end-phase9-3.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase9-3'
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
const REACT_PORT = 4199
const ANGULAR_PORT = 4200

// Iterations per cell (NOT the dataset size; the dataset parameter is `size`).
const ITER = QUICK ? 3 : 10
const WARMUP = 1
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
const DATASETS = CLI_DATASETS ?? (QUICK ? [300] : [300, 500, 750, 1000, 1500, 2000, 3000])
const PROBE_DATASET = 1000
const THRESHOLDS_MS = [50, 100, 200, 500]
// Inter-phase settles are kept MINIMAL (16 ms each: one macrotask + long-task
// observer delivery + browser processing of the previous commit) so the
// measured total is dominated by real work, not protocol floors. A fixed
// 100 ms final flush collects long tasks / trailing mutations of the last
// phase only (stableEnd is informational and NOT threshold-usable).
const INTER_PHASE_MS = 16
const FINAL_FLUSH_MS = 100

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
// Expected counts (documented generation rule, scale-dataset.ts)
//   - extras = level - 30; every extra title contains "Incident" -> incident
//     = 4 + extras;
//   - status cycles [todo,in-progress,completed,cancelled] -> i % 4 === 1;
//   - priority cycles [medium,high,low] -> high cuando i % 3 === 1, low cuando
//     i % 3 === 2;
//   - combined (incident && in-progress && high) = # i ≡ 1 (mod 12);
//   - combinedLow (incident && in-progress && low) = # i ≡ 5 (mod 12).
// IMPORTANTE (anomalía detectada por la validación de dataset): ambos ocurren
// una vez por cada bloque de 12 extras, pero el conteo puede diferir en 1
// según dónde termine el intervalo de extras: en la escalera 300-3000
// coinciden en 300/750/1000/1500 (23/60/81/123) y difieren en 500 y 2000
// (high=40 vs low=39; high=165 vs low=164). El flujo mide cada fase contra SU
// propio conteo (S4 -> combined, S4b -> combinedLow).
// ---------------------------------------------------------------------------

function expectedCounts(level) {
  const extras = level - 30
  let incident = 4
  let inProgress = 7
  let combined = 0
  let combinedLow = 0
  if (extras > 0) {
    incident += extras
    for (let i = 0; i < extras; i += 1) {
      if (i % 4 === 1) inProgress += 1
      if (i % 4 === 1 && i % 3 === 1) combined += 1
      if (i % 4 === 1 && i % 3 === 2) combinedLow += 1
    }
  }
  return { incident, inProgress, combined, combinedLow }
}

// ---------------------------------------------------------------------------
// Environment discovery / static server / CDP client (same as Fase 7/9/9.1/9.2)
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
  const profile = `/tmp/lh93-profile-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
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
// Harness: long tasks + MutationObserver with the Fase 9 isolation probe
// (outsideMain / outsideActive; detached targets counted as inside).
// `withObserver=false` keeps only the PerformanceObserver (overhead probe).
// ---------------------------------------------------------------------------

const HARNESS = (withObserver) => `
window.__ph93 = { lt: [], mut: { n: 0, added: 0, removed: 0, attrs: 0, outsideMain: 0, outsideActive: 0 }, active: null, mo: null };
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph93.lt.push({ s: e.startTime, d: e.duration });
  }).observe({ type: 'longtask' });
} catch (e) {}
${
  withObserver
    ? `
try {
  window.__ph93.mo = new MutationObserver((recs) => {
    const main = document.querySelector('main');
    const active = window.__ph93.active || document.querySelector('main section[aria-label]');
    for (const r of recs) {
      const m = window.__ph93.mut;
      m.n += 1;
      m.added += r.addedNodes.length;
      m.removed += r.removedNodes.length;
      if (r.type === 'attributes') m.attrs += 1;
      const t = r.target;
      if (!(main && main.contains(t)) && t.isConnected !== false) m.outsideMain += 1;
      if (!(active && active.contains(t)) && t.isConnected !== false) m.outsideActive += 1;
    }
  });
  window.__ph93.mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
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

// S4: combined update (search + status + priority in one batch, Fase 9.2).
const S4_ACTION = `${setInput('task-search', 'incident')}
${setSelect('task-status-filter', 'in-progress')}
${setSelect('task-priority-filter', 'high')}`
// S4b: repeated interaction — priority high -> low (count unchanged, see above).
const S4B_ACTION = `${setSelect('task-priority-filter', 'low')}`

// ---------------------------------------------------------------------------
// E2E flow measure expression (ONE continuous clock; all phases in one IIFE)
// ---------------------------------------------------------------------------

function flowMeasureExpr(N, combined, combinedLow) {
  return `(async () => {
    const lt0 = window.__ph93.lt.length;
    const mut0 = { ...window.__ph93.mut };
    const mcount = (a, b) => ({ n: a.n - b.n, added: a.added - b.added, removed: a.removed - b.removed, attrs: a.attrs - b.attrs, outsideMain: a.outsideMain - b.outsideMain, outsideActive: a.outsideActive - b.outsideActive });
    const ltslice = (from) => window.__ph93.lt.slice(from).map((t) => ({ s: Math.round(t.s * 10) / 10, d: Math.round(t.d * 10) / 10 }));
    // --- PHASE MOUNT (navigation + full-list mount) ---
    window.__ph93.active = document.querySelector('main section[aria-label]');
    const t0 = performance.now();
    ${clickNav('Tasks')}
    let tSection = null;
    for (let i = 0; i < 6000; i += 1) {
      if (document.querySelector('main section[aria-label="Tasks"]') !== null) { tSection = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tSection === null) throw new Error('tasks section never appeared');
    const ltM0 = window.__ph93.lt.length;
    const mutM0 = { ...window.__ph93.mut };
    let tRowsM = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${rowCountExpr} >= ${N}) { tRowsM = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tRowsM === null) throw new Error('rows never reached ${N}');
    const rowsM = ${rowCountExpr};
    await new Promise((r) => setTimeout(r, ${INTER_PHASE_MS}));
    // --- PHASE S4 (first interaction: combined update) ---
    const ltS4 = window.__ph93.lt.length;
    const mutS4 = { ...window.__ph93.mut };
    window.__ph93.active = document.querySelector('main section[aria-label="Tasks"]');
    const t0s4 = performance.now();
    ${S4_ACTION}
    const tSyncS4 = performance.now();
    let tRowsS4 = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${rowCountExpr} === ${combined}) { tRowsS4 = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tRowsS4 === null) throw new Error('S4 rows never reached ${combined}');
    const rowsS4 = ${rowCountExpr};
    await new Promise((r) => setTimeout(r, ${INTER_PHASE_MS}));
    if (${rowCountExpr} !== ${combined}) throw new Error('S4 rows not stable');
    await new Promise((r) => setTimeout(r, ${INTER_PHASE_MS}));
    // --- PHASE S4b (repeated interaction: priority high -> low) ---
    const ltS4b = window.__ph93.lt.length;
    const mutS4b = { ...window.__ph93.mut };
    window.__ph93.active = document.querySelector('main section[aria-label="Tasks"]');
    // Content marker: the S4b commit is detected by the FIRST ROW TEXT changing
    // (plus the count). At datasets where combined === combinedLow the row
    // count does NOT change (300/750/1000/1500) and a count-only poll would
    // pass before Angular's deferred re-render, under-measuring s4b.
    const s4bEl = document.querySelector('.task-list li');
    window.__ph93.s4bMarker = s4bEl ? (s4bEl.textContent ?? '') : '';
    const t0s4b = performance.now();
    ${S4B_ACTION}
    const tSyncS4b = performance.now();
    let tRowsS4b = null;
    for (let i = 0; i < 6000; i += 1) {
      const el = document.querySelector('.task-list li');
      const txt = el ? (el.textContent ?? '') : '';
      if (${rowCountExpr} === ${combinedLow} && txt !== window.__ph93.s4bMarker) { tRowsS4b = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tRowsS4b === null) throw new Error('S4b commit never detected');
    const rowsS4b = ${rowCountExpr};
    await new Promise((r) => setTimeout(r, ${INTER_PHASE_MS}));
    if (${rowCountExpr} !== ${combinedLow}) throw new Error('S4b rows not stable');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, ${FINAL_FLUSH_MS}));
    const tEnd = performance.now();
    const mut = window.__ph93.mut;
    return {
      navigation: tSection - t0,
      mount: tRowsM - t0,
      mountToRows: tRowsM - tSection,
      s4: tRowsS4 - t0s4,
      s4Sync: tSyncS4 - t0s4,
      s4Commit: tRowsS4 - tSyncS4,
      s4b: tRowsS4b - t0s4b,
      s4bSync: tSyncS4b - t0s4b,
      s4bCommit: tRowsS4b - tSyncS4b,
      total: tRowsS4 - t0,
      total2: tRowsS4b - t0,
      stableEnd: tEnd - t0,
    residual: (tRowsS4 - t0) - (tRowsM - t0) - (tRowsS4 - t0s4),
    rowsMount: rowsM,
    rowsS4: rowsS4,
    rowsS4b: rowsS4b,
    longTasks: { mount: ltslice(ltM0), s4: ltslice(ltS4), s4b: ltslice(ltS4b) },
    mutations: { mount: mcount(mut, mutM0), s4: mcount(mut, mutS4), s4b: mcount(mut, mutS4b) },
    interPhaseMs: ${INTER_PHASE_MS}
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
    if (Date.now() - start > 30000) throw new Error('rows did not return to dataset size')
    await sleep(100)
  }
  await sleep(120)
  const again = await evaluate(cdp, `${rowCountExpr} === ${level}`)
  if (again !== true) throw new Error('rows not stable after reset')
}

// After the flow the filters are at the S4b state (incident + in-progress +
// low). Reset to the full list, then back to the small Projects view so the
// next iteration measures a real mount again.
async function resetAfterFlow(cdp, level) {
  await evaluate(
    cdp,
    `${setInput('task-search', '')}
${setSelect('task-status-filter', 'all')}
${setSelect('task-priority-filter', 'all')}`,
  )
  await settleRows(cdp, level)
  await evaluate(cdp, clickNav('Projects'))
  await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
  await evaluate(cdp, SETTLE_EXPR)
}

// ---------------------------------------------------------------------------
// Flow cell runner (one browser session per dataset × app)
// ---------------------------------------------------------------------------

async function runFlowCell(cdp, level) {
  // every iteration starts from the small Projects view (real mount)
  await evaluate(cdp, clickNav('Projects'))
  await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
  await evaluate(cdp, SETTLE_EXPR)

  const exp = expectedCounts(level)
  for (let w = 0; w < WARMUP; w += 1) {
    await evaluate(cdp, flowMeasureExpr(level, exp.combined, exp.combinedLow))
    await resetAfterFlow(cdp, level)
  }

  const iters = []
  for (let i = 0; i < ITER; i += 1) {
    const m0 = await getMetrics(cdp)
    const r = await evaluate(cdp, flowMeasureExpr(level, exp.combined, exp.combinedLow))
    await sleep(120)
    const m1 = await getMetrics(cdp)
    const checkOk =
      (await evaluate(
        cdp,
        `document.getElementById('task-search').value === 'incident' && document.getElementById('task-status-filter').value === 'in-progress' && document.getElementById('task-priority-filter').value === 'low' && ${rowCountExpr} === ${exp.combinedLow}`,
      )) === true
    await resetAfterFlow(cdp, level)
    iters.push({
      navigation: round(r.navigation, 3),
      mount: round(r.mount, 3),
      mountToRows: round(r.mountToRows, 3),
      s4: round(r.s4, 3),
      s4Sync: round(r.s4Sync, 3),
      s4Commit: round(r.s4Commit, 3),
      s4b: round(r.s4b, 3),
      s4bSync: round(r.s4bSync, 3),
      s4bCommit: round(r.s4bCommit, 3),
      total: round(r.total, 3),
      total2: round(r.total2, 3),
      stableEnd: round(r.stableEnd, 3),
      residual: round(r.residual, 3),
      rowsMount: r.rowsMount,
      rowsS4: r.rowsS4,
      rowsS4b: r.rowsS4b,
      longTasks: {
        mount: r.longTasks.mount.map((t) => ({ start: t.s, dur: t.d })),
        s4: r.longTasks.s4.map((t) => ({ start: t.s, dur: t.d })),
        s4b: r.longTasks.s4b.map((t) => ({ start: t.s, dur: t.d })),
      },
      mutations: r.mutations,
      heapDeltaKb: round((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024, 2),
      nodesDelta: round(m1.Nodes - m0.Nodes, 1),
      checkOk,
    })
  }
  return summarize(iters)
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

function ltStats(arrays) {
  const flat = arrays.flat()
  return {
    sum: flat.length,
    iterationsAffected: arrays.filter((a) => a.length > 0).length,
    ms: stats(flat.map((t) => t.d)),
  }
}

function summarize(iters) {
  const pick = (fn) => iters.map(fn)
  const ltOf = (phase) => pick((i) => i.longTasks[phase])
  return {
    n: iters.length,
    iterations: iters,
    checksPassed: iters.filter((i) => i.checkOk).length,
    navigation: stats(pick((i) => i.navigation)),
    mount: stats(pick((i) => i.mount)),
    mountToRows: stats(pick((i) => i.mountToRows)),
    s4: stats(pick((i) => i.s4)),
    s4Sync: stats(pick((i) => i.s4Sync)),
    s4Commit: stats(pick((i) => i.s4Commit)),
    s4b: stats(pick((i) => i.s4b)),
    s4bSync: stats(pick((i) => i.s4bSync)),
    s4bCommit: stats(pick((i) => i.s4bCommit)),
    total: stats(pick((i) => i.total)),
    total2: stats(pick((i) => i.total2)),
    stableEnd: stats(pick((i) => i.stableEnd)),
    residual: stats(pick((i) => i.residual)),
    residualPct: stats(pick((i) => (i.total !== 0 ? (i.residual / i.total) * 100 : null))),
    mountPct: stats(pick((i) => (i.total !== 0 ? (i.mount / i.total) * 100 : null))),
    s4Pct: stats(pick((i) => (i.total !== 0 ? (i.s4 / i.total) * 100 : null))),
    longTaskCount: {
      sum: pick(
        (i) => i.longTasks.mount.length + i.longTasks.s4.length + i.longTasks.s4b.length,
      ).reduce((a, b) => a + b, 0),
      iterationsWithLongTasks: iters.filter(
        (i) => i.longTasks.mount.length + i.longTasks.s4.length + i.longTasks.s4b.length > 0,
      ).length,
      pctIterationsAffected: round(
        (iters.filter(
          (i) => i.longTasks.mount.length + i.longTasks.s4.length + i.longTasks.s4b.length > 0,
        ).length /
          Math.max(iters.length, 1)) *
          100,
        1,
      ),
      perPhase: {
        mount: ltStats(ltOf('mount')),
        s4: ltStats(ltOf('s4')),
        s4b: ltStats(ltOf('s4b')),
      },
    },
    longTaskMs: stats(
      pick((i) => i.longTasks.mount.concat(i.longTasks.s4).concat(i.longTasks.s4b)).flatMap(
        (t) => t.d,
      ),
    ),
    mutations: {
      mount: {
        records: stats(pick((i) => i.mutations.mount.n)),
        addedNodes: stats(pick((i) => i.mutations.mount.added)),
        removedNodes: stats(pick((i) => i.mutations.mount.removed)),
        attrChanges: stats(pick((i) => i.mutations.mount.attrs)),
      },
      s4: {
        records: stats(pick((i) => i.mutations.s4.n)),
        addedNodes: stats(pick((i) => i.mutations.s4.added)),
        removedNodes: stats(pick((i) => i.mutations.s4.removed)),
        attrChanges: stats(pick((i) => i.mutations.s4.attrs)),
      },
      s4b: {
        records: stats(pick((i) => i.mutations.s4b.n)),
        addedNodes: stats(pick((i) => i.mutations.s4b.added)),
        removedNodes: stats(pick((i) => i.mutations.s4b.removed)),
        attrChanges: stats(pick((i) => i.mutations.s4b.attrs)),
      },
    },
    isolation: {
      s4: {
        outsideMain: stats(pick((i) => i.mutations.s4.outsideMain)),
        outsideActive: stats(pick((i) => i.mutations.s4.outsideActive)),
      },
      s4b: {
        outsideMain: stats(pick((i) => i.mutations.s4b.outsideMain)),
        outsideActive: stats(pick((i) => i.mutations.s4b.outsideActive)),
      },
    },
    heapDeltaKb: stats(pick((i) => i.heapDeltaKb)),
    nodesDelta: stats(pick((i) => i.nodesDelta)),
    thresholds: {
      gt50ms: iters.filter((i) => i.total > THRESHOLDS_MS[0]).length,
      gt100ms: iters.filter((i) => i.total > THRESHOLDS_MS[1]).length,
      gt200ms: iters.filter((i) => i.total > THRESHOLDS_MS[2]).length,
      gt500ms: iters.filter((i) => i.total > THRESHOLDS_MS[3]).length,
    },
  }
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
  // S4b target: priority high -> low (its OWN count, see expectedCounts note)
  await evaluate(cdp, setSelect('task-priority-filter', 'low'))
  await waitFor(cdp, `${rowCountExpr} === ${exp.combinedLow}`)
  const combinedLow = await evaluate(cdp, rowCountExpr)
  await evaluate(cdp, setInput('task-search', ''))
  await evaluate(cdp, setSelect('task-status-filter', 'all'))
  await evaluate(cdp, setSelect('task-priority-filter', 'all'))
  return { total, incident, inProgress, combined, combinedLow, expected: exp }
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
    const installed = await evaluate(cdp, `typeof window.__ph93 !== 'undefined'`)
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
      v.combined === v.expected.combined &&
      v.combinedLow === v.expected.combinedLow
    if (!ok) {
      throw new Error(
        `dataset validation failed for ${appKey} @ ${level}: ${JSON.stringify(v)} vs ${JSON.stringify(v.expected)}`,
      )
    }
    console.log(
      `  total=${v.total} incident=${v.incident} inProgress=${v.inProgress} combined=${v.combined} combinedLow=${v.combinedLow} (esperado ${v.expected.incident}/${v.expected.inProgress}/${v.expected.combined}/${v.expected.combinedLow}) → OK`,
    )
  }
}

// --- Flow cells ---
const results = {}
for (const level of DATASETS) {
  results[level] = { react: null, angular: null }
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== FLUJO E2E · dataset=${level} · ${appKey} (observer ON) ===`)
    const data = await session(app, level, true, (cdp) => runFlowCell(cdp, level))
    results[level][appKey] = data
    console.log(
      `  mount ${data.mount.median} ms · s4 ${data.s4.median} (sync ${data.s4Sync.median}) · s4b ${data.s4b.median} · total ${data.total.median} ms (${data.total.min}–${data.total.max} · p95 ${data.total.p95}) · residual ${data.residual.median} · LT ${data.longTaskCount.sum} · outsideActive(s4) ${data.isolation.s4.outsideActive.median} · checks ${data.checksPassed}/${data.n} · >100ms ${data.thresholds.gt100ms}/${data.n} · >200ms ${data.thresholds.gt200ms}/${data.n} · >500ms ${data.thresholds.gt500ms}/${data.n}`,
    )
  }
}

// --- Overhead probe (full flow at PROBE_DATASET, observer ON vs OFF) ---
let overheadProbe = {}
if (DATASETS.includes(PROBE_DATASET)) {
  overheadProbe = { dataset: PROBE_DATASET }
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== OVERHEAD PROBE · ${appKey} (observer OFF) ===`)
    const on = results[PROBE_DATASET][appKey]
    const off = await session(app, PROBE_DATASET, false, (cdp) => runFlowCell(cdp, PROBE_DATASET))
    overheadProbe[appKey] = {
      withObserver: {
        totalMedian: on.total.median,
        mountMedian: on.mount.median,
        s4Median: on.s4.median,
      },
      withoutObserver: {
        totalMedian: off.total.median,
        mountMedian: off.mount.median,
        s4Median: off.s4.median,
      },
      overheadTotalMs: round((on.total.median ?? 0) - (off.total.median ?? 0), 2),
      overheadMountMs: round((on.mount.median ?? 0) - (off.mount.median ?? 0), 2),
    }
    console.log(
      `  total ON ${on.total.median} ms · OFF ${off.total.median} ms · overhead ${overheadProbe[appKey].overheadTotalMs} ms (mount ${overheadProbe[appKey].overheadMountMs} ms)`,
    )
  }
}

// --- Confirmation batches: FIRST dataset crossing 100 ms, FIRST crossing
// 200 ms and FIRST with long tasks (per run; deduplicated) ---
const confirmations = {}
const sortedDatasets = [...DATASETS].sort((a, b) => a - b)
const seen = { gt100: false, gt200: false, lt: false }
const triggers = { gt100: null, gt200: null, lt: null }
for (const level of sortedDatasets) {
  const cell = results[level]
  const any100 =
    (cell.react.total.median ?? 0) >= 100 ||
    (cell.react.total.p95 ?? 0) >= 100 ||
    (cell.angular.total.median ?? 0) >= 100 ||
    (cell.angular.total.p95 ?? 0) >= 100
  const any200 =
    (cell.react.total.median ?? 0) >= 200 ||
    (cell.react.total.p95 ?? 0) >= 200 ||
    (cell.angular.total.median ?? 0) >= 200 ||
    (cell.angular.total.p95 ?? 0) >= 200
  const anyLT = (cell.react.longTaskCount.sum ?? 0) + (cell.angular.longTaskCount.sum ?? 0) > 0
  if (any100 && !seen.gt100) {
    triggers.gt100 = level
    seen.gt100 = true
  }
  if (any200 && !seen.gt200) {
    triggers.gt200 = level
    seen.gt200 = true
  }
  if (anyLT && !seen.lt) {
    triggers.lt = level
    seen.lt = true
  }
}
const confirmSet = new Set([triggers.gt100, triggers.gt200, triggers.lt].filter((d) => d !== null))
for (const level of confirmSet) {
  confirmations[level] = {}
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== CONFIRMACIÓN · FLUJO E2E · dataset=${level} · ${appKey} ===`)
    confirmations[level][appKey] = await session(app, level, true, (cdp) => runFlowCell(cdp, level))
    console.log(
      `  mount ${confirmations[level][appKey].mount.median} · s4 ${confirmations[level][appKey].s4.median} · total ${confirmations[level][appKey].total.median} ms (p95 ${confirmations[level][appKey].total.p95}) · LT ${confirmations[level][appKey].longTaskCount.sum} · checks ${confirmations[level][appKey].checksPassed}/${confirmations[level][appKey].n}`,
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
const numericKeys = (obj) => Object.keys(obj ?? {}).filter((k) => /^\d+$/.test(k))
const allResults = {}
for (const level of new Set([...numericKeys(base.results), ...numericKeys(results)])) {
  allResults[level] = { ...(base.results?.[level] ?? {}), ...(results[level] ?? {}) }
}
const allConfirmations = { ...(base.confirmations ?? {}), ...confirmations }
const allOverheadProbe = { ...(base.overheadProbe ?? {}), ...overheadProbe }
const allDatasetValidation = { ...(base.datasetValidation ?? {}), ...datasetValidation }
const allDatasets = numericKeys(allResults)
  .map(Number)
  .sort((a, b) => a - b)

// --- Comparison + growth + residual analysis over the merged ladder ---
const comparison = {}
const growth = {}
const residualAnalysis = {}
for (const level of allDatasets) {
  const cell = allResults[level]
  if (!cell?.react || !cell?.angular) continue
  const cmp = (metric, reactKey = metric, angularKey = metric) => ({
    react: cell.react[reactKey]?.median ?? null,
    angular: cell.angular[angularKey]?.median ?? null,
    deltaAngularMinusReact: round(
      (cell.angular[angularKey]?.median ?? 0) - (cell.react[reactKey]?.median ?? 0),
      3,
    ),
    ratioAngularOverReact:
      (cell.react[reactKey]?.median ?? 0) !== 0
        ? round((cell.angular[angularKey]?.median ?? 0) / (cell.react[reactKey]?.median ?? 0), 2)
        : null,
  })
  comparison[level] = {
    navigation: cmp('navigation'),
    mount: cmp('mount'),
    mountToRows: cmp('mountToRows'),
    s4: cmp('s4'),
    s4Sync: cmp('s4Sync'),
    s4Commit: cmp('s4Commit'),
    s4b: cmp('s4b'),
    s4bSync: cmp('s4bSync'),
    total: cmp('total'),
    total2: cmp('total2'),
    residual: cmp('residual'),
    mountPct: cmp('mountPct'),
    s4Pct: cmp('s4Pct'),
    longTasks: {
      react: cell.react.longTaskCount.sum,
      angular: cell.angular.longTaskCount.sum,
      perPhase: {
        mount: {
          react: cell.react.longTaskCount.perPhase.mount.sum,
          angular: cell.angular.longTaskCount.perPhase.mount.sum,
        },
        s4: {
          react: cell.react.longTaskCount.perPhase.s4.sum,
          angular: cell.angular.longTaskCount.perPhase.s4.sum,
        },
        s4b: {
          react: cell.react.longTaskCount.perPhase.s4b.sum,
          angular: cell.angular.longTaskCount.perPhase.s4b.sum,
        },
      },
    },
    thresholds: {
      react: cell.react.thresholds,
      angular: cell.angular.thresholds,
    },
    isolation: {
      s4: {
        react: cell.react.isolation.s4.outsideActive.median,
        angular: cell.angular.isolation.s4.outsideActive.median,
      },
      s4b: {
        react: cell.react.isolation.s4b.outsideActive.median,
        angular: cell.angular.isolation.s4b.outsideActive.median,
      },
    },
  }
  const sumR = (cell.react.mount.median ?? 0) + (cell.react.s4.median ?? 0)
  const sumA = (cell.angular.mount.median ?? 0) + (cell.angular.s4.median ?? 0)
  residualAnalysis[level] = {
    react: {
      mount: cell.react.mount.median,
      s4: cell.react.s4.median,
      mountPlusS4: round(sumR, 3),
      total: cell.react.total.median,
      residualMeasured: cell.react.residual.median,
      residualPct: cell.react.residualPct.median,
      mountPct: cell.react.mountPct.median,
      s4Pct: cell.react.s4Pct.median,
    },
    angular: {
      mount: cell.angular.mount.median,
      s4: cell.angular.s4.median,
      mountPlusS4: round(sumA, 3),
      total: cell.angular.total.median,
      residualMeasured: cell.angular.residual.median,
      residualPct: cell.angular.residualPct.median,
      mountPct: cell.angular.mountPct.median,
      s4Pct: cell.angular.s4Pct.median,
    },
  }
}
for (const metric of ['mount', 's4', 'total']) {
  const med = (side, level) => allResults[level]?.[side]?.[metric]?.median ?? null
  growth[metric] = {
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

const git = (args) => {
  try {
    return execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const result = {
  experiment: 'interaction-end-to-end-phase9-3',
  capturedAt: new Date().toISOString(),
  objective:
    'Medir el flujo end-to-end real (entrar en una vista grande -> montar el dataset -> primera interacción S4 -> interacción repetida S4b) con datasets 300-3000 tareas: duración de entrada, montaje, S4, S4b, total hasta commit de la primera y de la segunda interacción, long tasks, aislamiento, residual total vs (mount + s4) medido directamente, y si el flujo combinado cruza umbrales (50/100/200/500 ms) antes o después que los experimentos aislados (S1 de Fase 9.1, S4 de Fase 9.2). Evaluar H41-H46.',
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
    note: 'chrome-headless-shell (Chrome for Testing), único headless funcional en este entorno (Fases 4.1/5.1/7/9/9.1/9.2). Copia experimental aislada en /tmp; el árbol principal no se modifica.',
  },
  method: {
    summary:
      'Flujo continuo en UNA expresión de medición: t0 -> click Tasks (desde Projects) -> tSection (sección Tasks en DOM; navigation = tSection - t0) -> tRowsM (lista completa N filas; mount = tRowsM - t0, misma definición que S1 de Fase 9.1) -> settle mínimo (16 ms, parte del residual) -> S4 (search incident + status in-progress + priority high en un lote; s4 = tRowsS4 - t0s4, misma definición que S4 de Fase 9.2; s4Sync = trabajo síncrono) -> estabilidad (16 ms) + settle (16 ms) -> S4b (interacción repetida: priority high -> low, contra SU PROPIO conteo combinedLow — ver nota de expectedCounts; la validación de dataset detectó que combined y combinedLow difieren en 1 en 500 y 2000) -> estabilidad (16 ms) -> flush final (2 rAF + macrotask + 100 ms) -> tEnd. Los settles entre fases son MÍNIMOS (16 ms fijos, simétricos: entrega del observer de long tasks + procesamiento del commit anterior) para que el total esté dominado por trabajo real, no por pisos de protocolo; el flush de 100 ms solo recoge long tasks/mutaciones residuales de la última fase. total = tRowsS4 - t0 (E2E hasta la PRIMERA interacción; PRIMARIA); total2 = tRowsS4b - t0 (E2E hasta la interacción repetida); stableEnd = tEnd - t0 (informativa; incluye el piso fijo del flush final de 100 ms, NO usable para umbrales). residual = total - (mount + s4) medido por iteración (no asumido cero); equivale al hueco entre el commit del montaje y el inicio de S4 (settle de 16 ms + cuantización del poll + scheduling/GC). Reset entre iteraciones: filtros a lista completa (N filas) + vuelta a Projects (vista pequeña) para que cada iteración mida un montaje real. Harness: long tasks + MutationObserver con sonda de aislamiento de Fase 9, troceado por fase (mount/s4/s4b); el veredicto de aislamiento se basa en las fases S4/S4b (la fase mount reemplaza la sección: sus outsideActive son el artefacto documentado de construcción). Sonda de overhead del observador (flujo completo en 1000, ON vs OFF). Tandas de confirmación (+10 iteraciones) para el PRIMER dataset con total >= 100 ms, el PRIMERO con >= 200 ms y el PRIMERO con long tasks (deduplicados). Validación de dataset por nivel (total/incident/inProgress/combined/combinedLow contra la regla documentada).',
    viewport: VIEWPORT,
    datasets: DATASETS,
    iterations: ITER,
    warmup: WARMUP,
    probe: { dataset: PROBE_DATASET },
    thresholds:
      '50 / 100 / 200 / 500 ms como umbrales operativos del experimento (NO equivalen automáticamente a percepción humana; documentado).',
    metrics: [
      'navigation (ms) = tSection - t0 (entrada a la feature)',
      'mount (ms) = tRowsM - t0 (commit completo del montaje; misma definición que S1 de Fase 9.1)',
      'mountToRows (ms) = commit diferido del montaje',
      's4 (ms) = tRowsS4 - t0s4 (commit de la primera interacción; misma definición que S4 de Fase 9.2)',
      's4Sync (ms) = trabajo síncrono de la primera interacción',
      's4b / s4bSync (ms) = interacción repetida (priority high -> low); el commit se detecta por cambio de CONTENIDO (texto de la primera fila) + conteo combinedLow, porque en datasets donde combined === combinedLow el conteo no cambia y un poll solo de conteo subestimaría el render diferido de Angular',
      'total (ms) = tRowsS4 - t0 (E2E hasta la primera interacción). PRIMARIA para los umbrales',
      'total2 (ms) = tRowsS4b - t0 (E2E hasta la interacción repetida)',
      'stableEnd (ms) = tEnd - t0 (informativa; incluye pisos fijos de flush)',
      'residual (ms y %) = total - (mount + s4), medido por iteración; equivale al hueco mount->S4 (flush 30 ms + scheduling/GC)',
      'longTasks (PerformanceObserver longtask; conteo, duraciones y % de iteraciones afectadas, por fase)',
      'mutations por fase (records / added / removed / attrs) + aislamiento (outsideMain / outsideActive) en S4/S4b',
      'heapDeltaKb / nodesDelta (CDP Performance.getMetrics; informativas; ScriptDuration NO se usa)',
    ],
    checks:
      'cada iteración verifica el estado final de los filtros (incident + in-progress + low) y el conteo exacto esperado (checkOk); los polls lanzan error si un conteo objetivo no se alcanza o no se mantiene (parada controlada); la validación de dataset comprueba total/incident/inProgress/combined/combinedLow por nivel antes de medir.',
    growthHeuristic:
      'pendientes por segmento: delta por 1000 elementos entre puntos consecutivos; |s2-s1| <= 0.25*max(|s1|,|s2|,1) -> lineal; s2 < 0.75*s1 -> sublineal; s2 > 1.25*s1 -> superlineal; cambio >2x -> cambio de régimen. Heurística sobre 3-5 puntos, no estadística formal.',
    phaseComparisons:
      'mount es comparable con S1 de Fase 9.1 (misma definición de duration) y s4 con S4 de Fase 9.2 (misma definición), ambos dentro de la misma metodología commit-determinista; el flujo combina ambos regímenes en una sola sesión, por lo que las comparaciones con las fases aisladas son solo contextuales.',
  },
  datasetValidation: allDatasetValidation,
  results: allResults,
  comparison,
  growth,
  residualAnalysis,
  overheadProbe: allOverheadProbe,
  confirmations: allConfirmations,
  limitations: [
    'Mediciones en localhost sin throttling; no representan condiciones de campo.',
    'El MutationObserver añade overhead asimétrico (Angular genera más registros por construcción incremental); la sonda de overhead en 1000 lo cuantifica para el flujo completo, pero no es eliminable si se quiere contar mutaciones y aislamiento.',
    'Los polls de 8-16 ms cuantizan el instante de commit en ~8-16 ms (incluido en las duraciones), igual que Fase 9.1/9.2.',
    'residual = total - (mount + s4) incluye el settle fijo de 16 ms entre montaje y S4 + la cuantización del poll (~8 ms): un piso de ~16-24 ms, simétrico en ambos frameworks; solo el exceso sobre ese piso es atribuible a scheduling/GC.',
    'stableEnd incluye el piso fijo del flush final de 100 ms; se reporta como informativa y NO se usa para umbrales.',
    'El reset entre iteraciones reconstruye la lista completa (N filas) y vuelve a Projects; a 3000 el coste de reset es material, pero ocurre fuera de la ventana medida.',
    'La comparación con S1 (9.1) y S4 (9.2) usa resultados de fases anteriores con la misma definición de duration pero observadores ligeramente distintos (9.1 mínimo, 9.2 completo, 9.3 completo); la sonda de overhead acota la asimetría.',
    'CDP Performance.getMetrics es poco fiable en este headless-shell; solo JSHeapUsedSize y Nodes se usan como informativas.',
    'Una máquina local; resultados indicativos, no benchmark científico (metrics.md §1).',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== TABLA PRINCIPAL (mediana, ms) ===')
console.log(
  'dataset | mount R/A | s4 R/A | s4b R/A | total R/A (p95) | Δ total | ratio | residual R/A | LT R/A | >100 R/A | >200 R/A | >500 R/A',
)
for (const level of allDatasets) {
  const c = comparison[level]
  console.log(
    `${level} | ${c.mount.react}/${c.mount.angular} | ${c.s4.react}/${c.s4.angular} | ${c.s4b.react}/${c.s4b.angular} | ${c.total.react} (${cellP95(allResults[level].react.total.p95)})/${c.total.angular} (${cellP95(allResults[level].angular.total.p95)}) | ${c.total.deltaAngularMinusReact} | ${c.total.ratioAngularOverReact}× | ${c.residual.react}/${c.residual.angular} | ${c.longTasks.react}/${c.longTasks.angular} | ${c.thresholds.react.gt100ms}/${c.thresholds.angular.gt100ms} | ${c.thresholds.react.gt200ms}/${c.thresholds.angular.gt200ms} | ${c.thresholds.react.gt500ms}/${c.thresholds.angular.gt500ms}`,
  )
}
console.log('\n=== RESIDUAL (total vs mount+s4) ===')
for (const level of allDatasets) {
  const r = residualAnalysis[level]
  console.log(
    `${level}: React ${r.react.mount}+${r.react.s4}=${r.react.mountPlusS4} vs total ${r.react.total} → residual ${r.react.residualMeasured} ms (${r.react.residualPct}%) · Angular ${r.angular.mount}+${r.angular.s4}=${r.angular.mountPlusS4} vs total ${r.angular.total} → residual ${r.angular.residualMeasured} ms (${r.angular.residualPct}%)`,
  )
}
console.log('\n=== CRECIMIENTO (pendiente ms/1000 elementos) ===')
for (const metric of ['mount', 's4', 'total']) {
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

function cellP95(v) {
  return v ?? '—'
}
