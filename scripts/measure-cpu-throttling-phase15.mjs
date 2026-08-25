#!/usr/bin/env node
// CPU throttling and performance degradation (Fase 15).
//
// Reuses the Fase 9.1 (S1 mount), 9.2 (S4 combined update) and 9.3 (E2E
// mount -> S4 -> S4b) scenario protocols, executed under three CPU budgets
// via CDP Emulation.setCPUThrottlingRate:
//   C0  = rate 1 (baseline, no throttle)
//   C1  = rate 4 (4x slowdown)
//   C2  = rate 6 (6x slowdown)
//
// Matrix: 3 scenarios x 2 frameworks x 3 CPU budgets x 6 datasets (300, 600,
// 1000, 1500, 2000, 3000) = 108 cells. n = 5 iterations per cell (3 with
// --quick). The same deterministic ?dataset=N scale rule (scale-dataset.ts)
// is used as in Fases 9.1-9.3, so React and Angular render IDENTICAL data.
//
// One harness (full observer with the Fase 9 isolation probe) is used for all
// three scenarios so the within-phase comparison (S1 vs S4 vs E2E, 1x vs 4x vs
// 6x) is internally consistent. Asymmetry with Fase 9.1 (minimal observer for
// S1) is documented: cross-phase absolute comparison is contextual only.
//
// Order balancing: CPU budgets are rotated per dataset position (not always
// 1x -> 4x -> 6x) to avoid order effects from machine drift; each cell is a
// FRESH browser session (no cross-cell state).
//
// Resumable: --scenario=S1,S4,E2E --cpu=1,4,6 --datasets=300,600 --iter=5.
//
// Zero runtime dependencies: Node built-ins + chrome-headless-shell via CDP.
//
// Usage:
//   node scripts/measure-cpu-throttling-phase15.mjs [/tmp/lab-phase15] [--quick] [--no-build]
//     [--scenario=S1,S4,E2E] [--cpu=1,4,6] [--datasets=300,600] [--iter=5]
// Output: docs/experiments/results/cpu-throttling-phase15.json

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
const RESULTS_FILE = join(RESULTS_DIR, 'cpu-throttling-phase15.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase15'
const QUICK = process.argv.includes('--quick')
const NO_BUILD = process.argv.includes('--no-build')

const CLI_LIST = (flag, fallback, fn = (x) => x) => {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`))
  return arg ? arg.split('=')[1].split(',').map(fn) : fallback
}
const CLI_SCENARIOS = CLI_LIST('scenario', ['S1', 'S4', 'E2E'])
const CLI_CPU = CLI_LIST('cpu', [1, 4, 6], Number)
const CLI_DATASETS = CLI_LIST('datasets', null, Number)
const CLI_ITER = (() => {
  const arg = process.argv.find((a) => a.startsWith('--iter='))
  return arg ? Number(arg.split('=')[1]) : null
})()
// Explicit chunk flags (resumability): true only when the user passed a
// --scenario/--cpu/--datasets flag (defaults do NOT count as a chunk).
const RESUMABLE =
  process.argv.some((a) => a.startsWith('--scenario=')) ||
  process.argv.some((a) => a.startsWith('--cpu=')) ||
  process.argv.some((a) => a.startsWith('--datasets='))

if (!existsSync(join(LAB, 'package.json'))) {
  console.error(`Copia experimental no encontrada: ${LAB}`)
  process.exit(1)
}

const REACT_DIST = join(LAB, 'apps/react-app/dist')
const ANGULAR_DIST = join(LAB, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4201
const ANGULAR_PORT = 4202

const ITER = CLI_ITER ?? (QUICK ? 3 : 5)
const WARMUP = 1
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
const DATASETS = CLI_DATASETS ?? (QUICK ? [300, 1000] : [300, 600, 1000, 1500, 2000, 3000])
const SCENARIOS = CLI_SCENARIOS
const CPU_RATES = CLI_CPU
// E2E inter-phase settles (Fase 9.3): minimal so the total is dominated by real
// work, not protocol floors.
const INTER_PHASE_MS = 16
const FINAL_FLUSH_MS = 100
const THRESHOLDS_MS = [50, 100, 200, 500]
// Long task budget (for TBT proxy): tasks > 50 ms contribute their excess.
const TBT_BUDGET_MS = 50

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
// Both combined and combinedLow occur once per 12-extras block but may differ
// by 1 depending on where the interval ends (anomaly documented in Fase 9.3).
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
// Environment discovery / static server / CDP client (same as Fase 7/9/9.1-9.3)
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
  const profile = `/tmp/lh15-profile-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
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
// Harness (full observer, Fase 9 isolation probe). ONE harness for all three
// scenarios so within-phase comparisons are internally consistent.
// ---------------------------------------------------------------------------

const HARNESS = (withObserver) => `
window.__ph15 = { lt: [], ev: [], mut: { n: 0, added: 0, removed: 0, attrs: 0, outsideMain: 0, outsideActive: 0 }, active: null, mo: null };
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph15.lt.push({ s: e.startTime, d: e.duration });
  }).observe({ type: 'longtask' });
} catch (e) {}
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ph15.ev.push({ n: e.name, s: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
  }).observe({ type: 'event', durationThreshold: 0 });
} catch (e) {}
${
  withObserver
    ? `
try {
  window.__ph15.mo = new MutationObserver((recs) => {
    const main = document.querySelector('main');
    const active = window.__ph15.active || document.querySelector('main section[aria-label]');
    for (const r of recs) {
      const m = window.__ph15.mut;
      m.n += 1;
      m.added += r.addedNodes.length;
      m.removed += r.removedNodes.length;
      if (r.type === 'attributes') m.attrs += 1;
      const t = r.target;
      if (!(main && main.contains(t)) && t.isConnected !== false) m.outsideMain += 1;
      if (!(active && active.contains(t)) && t.isConnected !== false) m.outsideActive += 1;
    }
  });
  window.__ph15.mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
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

const S4_ACTION = `${setInput('task-search', 'incident')}
${setSelect('task-status-filter', 'in-progress')}
${setSelect('task-priority-filter', 'high')}`
const S4B_ACTION = `${setSelect('task-priority-filter', 'low')}`
const RESET_ACTION = `${setInput('task-search', '')}
${setSelect('task-status-filter', 'all')}
${setSelect('task-priority-filter', 'all')}`

// ---------------------------------------------------------------------------
// S1 mount measure expression (Fase 9.1 protocol, adapted to __ph15)
//   duration = tRows - t0  (commit until full N-row list; PRIMARY)
// ---------------------------------------------------------------------------

function s1MeasureExpr(N) {
  return `(async () => {
    const lt0 = window.__ph15.lt.length;
    const m0 = { ...window.__ph15.mut };
    window.__ph15.active = document.querySelector('main section[aria-label]');
    const t0 = performance.now();
    ${clickNav('Tasks')}
    const tSync = performance.now();
    let tRows = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${rowCountExpr} >= ${N}) { tRows = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tRows === null) throw new Error('rows never reached ${N}');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 100));
    const t1 = performance.now();
    const m = window.__ph15.mut;
    return {
      duration: tRows - t0,
      sync: tSync - t0,
      mountToRows: tRows - tSync,
      paintTail: t1 - tRows,
      rows: ${rowCountExpr},
      longTasks: window.__ph15.lt.slice(lt0).map((t) => ({ s: t.s, d: t.d })),
      mutations: { n: m.n - m0.n, added: m.added - m0.added, removed: m.removed - m0.removed, attrs: m.attrs - m0.attrs, outsideMain: m.outsideMain - m0.outsideMain, outsideActive: m.outsideActive - m0.outsideActive }
    };
  })()`
}

// ---------------------------------------------------------------------------
// S4 incremental measure expression (Fase 9.2 protocol, adapted to __ph15)
// ---------------------------------------------------------------------------

function s4MeasureExpr(expectedCount) {
  return `(async () => {
    const lt0 = window.__ph15.lt.length;
    const m0 = { ...window.__ph15.mut };
    window.__ph15.active = document.querySelector('main section[aria-label="Tasks"]');
    const t0 = performance.now();
    ${S4_ACTION}
    const tSync = performance.now();
    let tRows = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${rowCountExpr} === ${expectedCount}) { tRows = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tRows === null) throw new Error('rows never reached ${expectedCount}');
    await new Promise((r) => setTimeout(r, 16));
    if (${rowCountExpr} !== ${expectedCount}) throw new Error('rows not stable at ${expectedCount}');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 100));
    const t1 = performance.now();
    const m = window.__ph15.mut;
    return {
      duration: tRows - t0,
      sync: tSync - t0,
      commitToRows: tRows - tSync,
      paintTail: t1 - tRows,
      rows: ${rowCountExpr},
      longTasks: window.__ph15.lt.slice(lt0).map((t) => ({ s: t.s, d: t.d })),
      mutations: { n: m.n - m0.n, added: m.added - m0.added, removed: m.removed - m0.removed, attrs: m.attrs - m0.attrs, outsideMain: m.outsideMain - m0.outsideMain, outsideActive: m.outsideActive - m0.outsideActive }
    };
  })()`
}

// ---------------------------------------------------------------------------
// E2E flow measure expression (Fase 9.3 protocol, adapted to __ph15)
// ---------------------------------------------------------------------------

function flowMeasureExpr(N, combined, combinedLow) {
  return `(async () => {
    const lt0 = window.__ph15.lt.length;
    const mut0 = { ...window.__ph15.mut };
    const mcount = (a, b) => ({ n: a.n - b.n, added: a.added - b.added, removed: a.removed - b.removed, attrs: a.attrs - b.attrs, outsideMain: a.outsideMain - b.outsideMain, outsideActive: a.outsideActive - b.outsideActive });
    const ltslice = (from) => window.__ph15.lt.slice(from).map((t) => ({ s: Math.round(t.s * 10) / 10, d: Math.round(t.d * 10) / 10 }));
    // --- PHASE MOUNT ---
    window.__ph15.active = document.querySelector('main section[aria-label]');
    const t0 = performance.now();
    ${clickNav('Tasks')}
    let tSection = null;
    for (let i = 0; i < 6000; i += 1) {
      if (document.querySelector('main section[aria-label="Tasks"]') !== null) { tSection = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tSection === null) throw new Error('tasks section never appeared');
    const ltM0 = window.__ph15.lt.length;
    const mutM0 = { ...window.__ph15.mut };
    let tRowsM = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${rowCountExpr} >= ${N}) { tRowsM = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 8));
    }
    if (tRowsM === null) throw new Error('rows never reached ${N}');
    const rowsM = ${rowCountExpr};
    await new Promise((r) => setTimeout(r, ${INTER_PHASE_MS}));
    // --- PHASE S4 ---
    const ltS4 = window.__ph15.lt.length;
    const mutS4 = { ...window.__ph15.mut };
    window.__ph15.active = document.querySelector('main section[aria-label="Tasks"]');
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
    const ltS4b = window.__ph15.lt.length;
    const mutS4b = { ...window.__ph15.mut };
    window.__ph15.active = document.querySelector('main section[aria-label="Tasks"]');
    const s4bEl = document.querySelector('.task-list li');
    window.__ph15.s4bMarker = s4bEl ? (s4bEl.textContent ?? '') : '';
    const t0s4b = performance.now();
    ${S4B_ACTION}
    const tSyncS4b = performance.now();
    let tRowsS4b = null;
    for (let i = 0; i < 6000; i += 1) {
      const el = document.querySelector('.task-list li');
      const txt = el ? (el.textContent ?? '') : '';
      if (${rowCountExpr} === ${combinedLow} && txt !== window.__ph15.s4bMarker) { tRowsS4b = performance.now(); break; }
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
    const mut = window.__ph15.mut;
    return {
      navigation: tSection - t0,
      mount: tRowsM - t0,
      mountToRows: tRowsM - tSection,
      s4: tRowsS4 - t0s4,
      s4Sync: tSyncS4 - t0s4,
      s4b: tRowsS4b - t0s4b,
      s4bSync: tSyncS4b - t0s4b,
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
  })()`
}

const SETTLE_EXPR = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 50));
  return true;
})()`

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

function tbtOf(longTaskArrays) {
  // TBT proxy (informational): sum over long tasks of max(0, duration - 50ms).
  return longTaskArrays
    .flat()
    .map((t) => t.d)
    .reduce((a, d) => a + Math.max(0, d - TBT_BUDGET_MS), 0)
}

function thresholdsOf(durations) {
  return {
    gt50ms: durations.filter((d) => d > THRESHOLDS_MS[0]).length,
    gt100ms: durations.filter((d) => d > THRESHOLDS_MS[1]).length,
    gt200ms: durations.filter((d) => d > THRESHOLDS_MS[2]).length,
    gt500ms: durations.filter((d) => d > THRESHOLDS_MS[3]).length,
  }
}

// ---------------------------------------------------------------------------
// Cell runners (S1 / S4 / E2E)
// ---------------------------------------------------------------------------

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
    if (Date.now() - start > 60000) throw new Error('rows did not return to dataset size')
    await sleep(100)
  }
  await sleep(120)
  const again = await evaluate(cdp, `${rowCountExpr} === ${level}`)
  if (again !== true) throw new Error('rows not stable after reset')
}

async function runS1(cdp, level) {
  // Session starts at default section; navigate to Projects so every iteration
  // measures a real mount of Tasks.
  await evaluate(cdp, clickNav('Projects'))
  await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
  await evaluate(cdp, SETTLE_EXPR)

  for (let w = 0; w < WARMUP; w += 1) {
    await evaluate(cdp, s1MeasureExpr(level))
    await evaluate(cdp, clickNav('Projects'))
    await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
    await evaluate(cdp, SETTLE_EXPR)
  }

  const iters = []
  for (let i = 0; i < ITER; i += 1) {
    const m0 = await getMetrics(cdp)
    const r = await evaluate(cdp, s1MeasureExpr(level))
    await sleep(120)
    const m1 = await getMetrics(cdp)
    const checkOk = r.rows === level
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
      mutations: r.mutations,
      heapDeltaKb: round((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024, 2),
      nodesDelta: round(m1.Nodes - m0.Nodes, 1),
      checkOk,
    })
  }
  return summarizeS1(iters)
}

function summarizeS1(iters) {
  const pick = (fn) => iters.map(fn)
  const durations = pick((i) => i.duration)
  const longTasks = pick((i) => i.longTasks)
  return {
    n: iters.length,
    iterations: iters,
    checksPassed: iters.filter((i) => i.checkOk).length,
    duration: stats(durations),
    sync: stats(pick((i) => i.sync)),
    mountToRows: stats(pick((i) => i.mountToRows)),
    paintTail: stats(pick((i) => i.paintTail)),
    longTaskCount: {
      sum: longTasks.reduce((a, lt) => a + lt.length, 0),
      iterationsWithLongTasks: longTasks.filter((lt) => lt.length > 0).length,
      pctIterationsAffected: round(
        (longTasks.filter((lt) => lt.length > 0).length / Math.max(iters.length, 1)) * 100,
        1,
      ),
    },
    longTaskMs: stats(longTasks.flat().map((t) => t.dur)),
    tbtMs: round(tbtOf(longTasks), 2),
    mutations: {
      records: stats(pick((i) => i.mutations.n)),
      addedNodes: stats(pick((i) => i.mutations.added)),
      removedNodes: stats(pick((i) => i.mutations.removed)),
      attrChanges: stats(pick((i) => i.mutations.attrs)),
      outsideMain: stats(pick((i) => i.mutations.outsideMain)),
      outsideActive: stats(pick((i) => i.mutations.outsideActive)),
    },
    heapDeltaKb: stats(pick((i) => i.heapDeltaKb)),
    nodesDelta: stats(pick((i) => i.nodesDelta)),
    thresholds: thresholdsOf(durations),
  }
}

async function runS4(cdp, level) {
  await evaluate(cdp, clickNav('Tasks'))
  await waitForTasksLoaded(cdp, level)
  await evaluate(cdp, SETTLE_EXPR)

  const expected = expectedCounts(level).combined
  for (let w = 0; w < WARMUP; w += 1) {
    await evaluate(cdp, s4MeasureExpr(expected))
    await evaluate(cdp, RESET_ACTION)
    await evaluate(cdp, SETTLE_EXPR)
    await settleRows(cdp, level)
  }

  const iters = []
  for (let i = 0; i < ITER; i += 1) {
    const m0 = await getMetrics(cdp)
    const r = await evaluate(cdp, s4MeasureExpr(expected))
    await sleep(120)
    const m1 = await getMetrics(cdp)
    const checkOk =
      (await evaluate(
        cdp,
        `document.getElementById('task-search').value === 'incident' && document.getElementById('task-status-filter').value === 'in-progress' && document.getElementById('task-priority-filter').value === 'high' && ${rowCountExpr} === ${expected}`,
      )) === true
    await evaluate(cdp, RESET_ACTION)
    await evaluate(cdp, SETTLE_EXPR)
    await settleRows(cdp, level)
    iters.push({
      duration: round(r.duration, 3),
      sync: round(r.sync, 3),
      commitToRows: round(r.commitToRows, 3),
      paintTail: round(r.paintTail, 3),
      rows: r.rows,
      longTasks: r.longTasks.map((t) => ({ start: round(t.s, 3), dur: round(t.d, 3) })),
      mutations: r.mutations,
      heapDeltaKb: round((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024, 2),
      nodesDelta: round(m1.Nodes - m0.Nodes, 1),
      checkOk,
    })
  }
  return summarizeS4(iters)
}

function summarizeS4(iters) {
  const pick = (fn) => iters.map(fn)
  const durations = pick((i) => i.duration)
  const longTasks = pick((i) => i.longTasks)
  return {
    n: iters.length,
    iterations: iters,
    checksPassed: iters.filter((i) => i.checkOk).length,
    duration: stats(durations),
    sync: stats(pick((i) => i.sync)),
    commitToRows: stats(pick((i) => i.commitToRows)),
    paintTail: stats(pick((i) => i.paintTail)),
    longTaskCount: {
      sum: longTasks.reduce((a, lt) => a + lt.length, 0),
      iterationsWithLongTasks: longTasks.filter((lt) => lt.length > 0).length,
      pctIterationsAffected: round(
        (longTasks.filter((lt) => lt.length > 0).length / Math.max(iters.length, 1)) * 100,
        1,
      ),
    },
    longTaskMs: stats(longTasks.flat().map((t) => t.dur)),
    tbtMs: round(tbtOf(longTasks), 2),
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
    thresholds: thresholdsOf(durations),
  }
}

async function runE2E(cdp, level) {
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
      s4b: round(r.s4b, 3),
      s4bSync: round(r.s4bSync, 3),
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
  return summarizeE2E(iters)
}

function summarizeE2E(iters) {
  const pick = (fn) => iters.map(fn)
  const totals = pick((i) => i.total)
  const ltAll = pick((i) => i.longTasks)
  return {
    n: iters.length,
    iterations: iters,
    checksPassed: iters.filter((i) => i.checkOk).length,
    navigation: stats(pick((i) => i.navigation)),
    mount: stats(pick((i) => i.mount)),
    mountToRows: stats(pick((i) => i.mountToRows)),
    s4: stats(pick((i) => i.s4)),
    s4Sync: stats(pick((i) => i.s4Sync)),
    s4b: stats(pick((i) => i.s4b)),
    s4bSync: stats(pick((i) => i.s4bSync)),
    total: stats(totals),
    total2: stats(pick((i) => i.total2)),
    stableEnd: stats(pick((i) => i.stableEnd)),
    residual: stats(pick((i) => i.residual)),
    residualPct: stats(pick((i) => (i.total !== 0 ? (i.residual / i.total) * 100 : null))),
    mountPct: stats(pick((i) => (i.total !== 0 ? (i.mount / i.total) * 100 : null))),
    s4Pct: stats(pick((i) => (i.total !== 0 ? (i.s4 / i.total) * 100 : null))),
    longTaskCount: {
      sum: ltAll.reduce((a, lt) => a + lt.mount.length + lt.s4.length + lt.s4b.length, 0),
      iterationsWithLongTasks: ltAll.filter(
        (lt) => lt.mount.length + lt.s4.length + lt.s4b.length > 0,
      ).length,
      pctIterationsAffected: round(
        (ltAll.filter((lt) => lt.mount.length + lt.s4.length + lt.s4b.length > 0).length /
          Math.max(iters.length, 1)) *
          100,
        1,
      ),
      perPhase: {
        mount: ltAll.reduce((a, lt) => a + lt.mount.length, 0),
        s4: ltAll.reduce((a, lt) => a + lt.s4.length, 0),
        s4b: ltAll.reduce((a, lt) => a + lt.s4b.length, 0),
      },
    },
    longTaskMs: stats(
      ltAll.flatMap((lt) => lt.mount.concat(lt.s4).concat(lt.s4b)).map((t) => t.dur),
    ),
    tbtMs: round(tbtOf(ltAll.map((lt) => lt.mount.concat(lt.s4).concat(lt.s4b))), 2),
    mutations: {
      mount: {
        records: stats(pick((i) => i.mutations.mount.n)),
        addedNodes: stats(pick((i) => i.mutations.mount.added)),
        removedNodes: stats(pick((i) => i.mutations.mount.removed)),
      },
      s4: {
        records: stats(pick((i) => i.mutations.s4.n)),
        addedNodes: stats(pick((i) => i.mutations.s4.added)),
        removedNodes: stats(pick((i) => i.mutations.s4.removed)),
      },
      s4b: {
        records: stats(pick((i) => i.mutations.s4b.n)),
        addedNodes: stats(pick((i) => i.mutations.s4b.added)),
        removedNodes: stats(pick((i) => i.mutations.s4b.removed)),
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
    thresholds: thresholdsOf(totals),
  }
}

async function resetAfterFlow(cdp, level) {
  await evaluate(cdp, RESET_ACTION)
  await settleRows(cdp, level)
  await evaluate(cdp, clickNav('Projects'))
  await waitFor(cdp, `document.querySelector('main section[aria-label="Projects"]') !== null`)
  await evaluate(cdp, SETTLE_EXPR)
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
  await evaluate(cdp, setSelect('task-priority-filter', 'low'))
  await waitFor(cdp, `${rowCountExpr} === ${exp.combinedLow}`)
  const combinedLow = await evaluate(cdp, rowCountExpr)
  await evaluate(cdp, RESET_ACTION)
  return { total, incident, inProgress, combined, combinedLow, expected: exp }
}

// ---------------------------------------------------------------------------
// Growth analysis (Fase 9.1 heuristic)
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
console.log(
  `matrix: scenarios=${SCENARIOS.join(',')} · cpu=${CPU_RATES.join(',')} · datasets=${DATASETS.join(',')} · iter=${ITER}`,
)

const apps = {
  react: { url: `http://127.0.0.1:${REACT_PORT}/`, key: 'react' },
  angular: { url: `http://127.0.0.1:${ANGULAR_PORT}/`, key: 'angular' },
}

let chromeVersion = null
async function session(app, level, cpuRate, withObserver, setupFn) {
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
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
    await cdp.send('Performance.enable')
    await evaluate(cdp, HARNESS(withObserver))
    const installed = await evaluate(cdp, `typeof window.__ph15 !== 'undefined'`)
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

// --- Dataset validation (one session per level per app; baseline cpu=1) ---
const datasetValidation = {}
for (const level of DATASETS) {
  datasetValidation[level] = {}
  for (const [appKey, app] of Object.entries(apps)) {
    console.log(`\n=== VALIDACIÓN · dataset=${level} · ${appKey} ===`)
    const v = await session(app, level, 1, true, (cdp) => validateDataset(cdp, level))
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

// --- Scenario cells (balanced CPU order per dataset) ---
const RUNNER = {
  S1: runS1,
  S4: runS4,
  E2E: runE2E,
}
const SCENARIO_LABEL = {
  S1: 'Mount (Projects -> Tasks, full-list commit)',
  S4: 'Incremental (combined search + status + priority in one batch)',
  E2E: 'End-to-end (mount -> S4 -> S4b in one continuous session)',
}

const results = {}
for (const skey of SCENARIOS) {
  results[skey] = { label: SCENARIO_LABEL[skey] }
  for (const [dIdx, level] of DATASETS.entries()) {
    results[skey][level] = {}
    // Balance CPU order: rotate [1,4,6] by dataset position (avoid 1->4->6 always).
    const cpuOrder = CPU_RATES.map((_, i) => CPU_RATES[(i + dIdx) % CPU_RATES.length])
    for (const [appKey, app] of Object.entries(apps)) {
      for (const cpuRate of cpuOrder) {
        console.log(`\n=== ${skey} · dataset=${level} · ${appKey} · cpu=${cpuRate}x ===`)
        const data = await session(app, level, cpuRate, true, (cdp) => RUNNER[skey](cdp, level))
        results[skey][level][cpuRate] = results[skey][level][cpuRate] ?? {}
        results[skey][level][cpuRate][appKey] = data
        const primary =
          skey === 'S1'
            ? data.duration.median
            : skey === 'S4'
              ? data.duration.median
              : data.total.median
        const p95 = skey === 'E2E' ? data.total.p95 : data.duration.p95
        console.log(
          `  ${skey === 'E2E' ? 'total' : 'duration'} ${primary} ms (p95 ${p95}) · sync ${skey === 'E2E' ? data.s4Sync.median : data.sync.median} · LT ${data.longTaskCount.sum} · checks ${data.checksPassed}/${data.n}`,
        )
      }
    }
  }
}

for (const s of servers) s.close()

// --- Merge with previous chunks (resumability) ---
let base = {}
if (RESUMABLE && existsSync(RESULTS_FILE)) {
  try {
    base = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
  } catch {
    base = {}
  }
}
const numericKeys = (obj) => Object.keys(obj ?? {}).filter((k) => /^\d+$/.test(k))
const allResults = {}
// Preserve ALL scenarios from both base and current run (chunk across
// scenario / cpu / dataset flags).
const baseScenarios = Object.keys(base.results ?? {}).filter(
  (k) => typeof base.results?.[k] === 'object' && base.results?.[k]?.label,
)
const allScenarioKeys = [...new Set([...baseScenarios, ...SCENARIOS])]
for (const skey of allScenarioKeys) {
  allResults[skey] = {
    label: base.results?.[skey]?.label ?? SCENARIO_LABEL[skey] ?? skey,
  }
  const mergedLevels = new Set([
    ...numericKeys(base.results?.[skey]),
    ...numericKeys(results[skey] ?? {}),
  ])
  for (const level of mergedLevels) {
    allResults[skey][level] = {
      ...(base.results?.[skey]?.[level] ?? {}),
      ...(results[skey]?.[level] ?? {}),
    }
  }
}
const allDatasetValidation = { ...(base.datasetValidation ?? {}), ...datasetValidation }
// Derive allDatasets from ALL scenarios (not just the first one).
const allDatasets = [...new Set(allScenarioKeys.flatMap((sk) => numericKeys(allResults[sk] ?? {})))]
  .map(Number)
  .sort((a, b) => a - b)
const allCpu = [...new Set([...(base.cpuRates ?? []), ...CPU_RATES])].sort((a, b) => a - b)

// --- Comparison + slowdown + thresholds ---
const primaryOf = (skey, cell) =>
  skey === 'S1' ? cell.duration : skey === 'S4' ? cell.duration : cell.total
const syncOf = (skey, cell) => (skey === 'E2E' ? cell.s4Sync : cell.sync)

const comparison = {}
const slowdown = {}
const thresholdsTable = {}
for (const skey of allScenarioKeys) {
  comparison[skey] = {}
  slowdown[skey] = {}
  thresholdsTable[skey] = {}
  for (const level of allDatasets) {
    const cell = allResults[skey]?.[level]
    if (!cell) continue
    comparison[skey][level] = {}
    for (const cpuRate of allCpu) {
      const r = cell[cpuRate]?.react
      const a = cell[cpuRate]?.angular
      if (!r || !a) continue
      const pr = primaryOf(skey, r).median
      const pa = primaryOf(skey, a).median
      comparison[skey][level][cpuRate] = {
        duration: {
          react: pr,
          angular: pa,
          deltaAngularMinusReact: round(pa - pr, 3),
          ratioAngularOverReact: pr !== 0 ? round(pa / pr, 2) : null,
        },
        p95: {
          react: primaryOf(skey, r).p95,
          angular: primaryOf(skey, a).p95,
          deltaAngularMinusReact: round(primaryOf(skey, a).p95 - primaryOf(skey, r).p95, 3),
        },
        sync: {
          react: syncOf(skey, r).median,
          angular: syncOf(skey, a).median,
        },
        longTasks: {
          react: r.longTaskCount.sum,
          angular: a.longTaskCount.sum,
        },
        tbtMs: {
          react: r.tbtMs,
          angular: a.tbtMs,
        },
        thresholds: {
          react: r.thresholds,
          angular: a.thresholds,
        },
      }
    }
  }
  // Slowdown factors (throttled / baseline per framework)
  slowdown[skey] = { react: {}, angular: {} }
  for (const level of allDatasets) {
    const base = allResults[skey]?.[level]?.[1]
    if (!base) continue
    const baseR = primaryOf(skey, base.react).median
    const baseA = primaryOf(skey, base.angular).median
    slowdown[skey].react[level] = {}
    slowdown[skey].angular[level] = {}
    for (const cpuRate of allCpu.filter((c) => c !== 1)) {
      const cell = allResults[skey]?.[level]?.[cpuRate]
      if (!cell) continue
      slowdown[skey].react[level][cpuRate] =
        baseR && baseR !== 0 ? round(primaryOf(skey, cell.react).median / baseR, 2) : null
      slowdown[skey].angular[level][cpuRate] =
        baseA && baseA !== 0 ? round(primaryOf(skey, cell.angular).median / baseA, 2) : null
    }
  }
  // Threshold crossing (first dataset where median > threshold, per framework x cpu)
  thresholdsTable[skey] = {}
  for (const th of THRESHOLDS_MS) {
    thresholdsTable[skey][`gt${th}ms`] = { react: {}, angular: {} }
    for (const cpuRate of allCpu) {
      let firstReact = null
      let firstAngular = null
      for (const level of allDatasets) {
        const c = comparison[skey][level]?.[cpuRate]
        if (!c) continue
        if (firstReact === null && c.duration.react !== null && c.duration.react > th) {
          firstReact = level
        }
        if (firstAngular === null && c.duration.angular !== null && c.duration.angular > th) {
          firstAngular = level
        }
      }
      thresholdsTable[skey][`gt${th}ms`].react[cpuRate] = firstReact
      thresholdsTable[skey][`gt${th}ms`].angular[cpuRate] = firstAngular
    }
  }
}

// Growth of the primary metric vs dataset (per framework x cpu) — E2E/S1 use
// the same mount-dominated shape; computed on the primary metric.
const growth = {}
for (const skey of allScenarioKeys) {
  growth[skey] = {}
  for (const cpuRate of allCpu) {
    const med = (side, level) => comparison[skey][level]?.[cpuRate]?.duration?.[side] ?? null
    growth[skey][cpuRate] = {
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

const git = (args) => {
  try {
    return execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const result = {
  experiment: 'cpu-throttling-phase15',
  capturedAt: new Date().toISOString(),
  objective:
    'Determinar cómo cambia el comportamiento relativo React/Angular bajo CPU throttling (CDP Emulation.setCPUThrottlingRate, rate 1/4/6) en los escenarios S1 (mount), S4 (incremental) y E2E (mount+S4+S4b), con datasets 300-3000: si el throttling amplifica la penalización de montaje de Angular, si hace más visible el trabajo síncrono incremental de React, si adelanta long tasks y umbrales (100/200/500 ms), si el E2E sigue dominado por el montaje, y si aparece un cambio de régimen o sensibilidad diferencial al throttling. Evaluar H91-H100.',
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
    note: 'chrome-headless-shell (Chrome for Testing), único headless funcional en este entorno (Fases 4.1/5.1/7/9/9.1-9.3/10/14). Copia experimental aislada en /tmp (mismo instrumentación ?dataset=N de Fases 9.1-9.3); el árbol principal no se modifica.',
  },
  method: {
    summary:
      'Tres escenarios de Fases 9.1/9.2/9.3 reutilizados con un ÚNICO harness (long tasks + event timing + MutationObserver con sonda de aislamiento de Fase 9) para que la comparación intra-fase sea internamente consistente. S1 = mount (click Tasks desde Projects, poll 8 ms hasta que las N filas están en el DOM; duration = tRows - t0, la definición de Fase 9.1). S4 = actualización incremental combinada (search "incident" + status in-progress + priority high en un lote; duration = tRows - t0 hasta el conteo combined, definición de Fase 9.2). E2E = flujo continuo mount -> S4 -> S4b en UNA expresión de medición (reloj continuo; total = tRowsS4 - t0, definición de Fase 9.3; residual = total - (mount + s4) medido por iteración). CPU throttling real vía CDP Emulation.setCPUThrottlingRate (rate 1 = sin throttling, 4 = 4x, 6 = 6x) — NO sleeps artificiales. Cada celda es una sesión de navegador FRESCA. Orden balanceado: los presupuestos de CPU se rotan por posición del dataset (no siempre 1x->4x->6x) para evitar efectos de orden por deriva de la máquina. n=5 iteraciones por celda (3 con --quick) + 1 warm-up. TBT = proxy computado de long tasks (suma de max(0, duración - 50 ms)). INP/TBT/LCP/FCP de Lighthouse NO se miden aquí por CDP directo (Fase 10 ya los cubrió con Lighthouse User Flows; marcados NO MEDIBLE en este harness).',
    viewport: VIEWPORT,
    datasets: DATASETS,
    cpuRates: allCpu,
    scenarios: SCENARIO_LABEL,
    iterations: ITER,
    warmup: WARMUP,
    thresholds:
      '50 / 100 / 200 / 500 ms como umbrales operativos del experimento (NO equivalen automáticamente a percepción humana; documentado).',
    metrics: [
      'duration/total (ms) = commit completo de la interacción; PRIMARIA para umbrales y slowdown',
      'sync (ms) = trabajo síncrono del/los evento(s)',
      'long tasks (PerformanceObserver longtask; conteo, duraciones, % iteraciones afectadas)',
      'tbtMs = proxy TBT computado de long tasks (exceso sobre 50 ms) — informativo',
      'mutations (records / added / removed / attrs) + aislamiento (outsideMain / outsideActive)',
      'heapDeltaKb / nodesDelta (CDP Performance.getMetrics; informativas; ScriptDuration NO se usa)',
      'INP/TBT/LCP/FCP: NO MEDIBLE en este harness CDP directo (Fase 10 con Lighthouse)',
    ],
    checks:
      'cada iteración verifica el estado de los controles + el conteo exacto esperado (checkOk); el poll lanza error si el conteo objetivo no se alcanza (parada controlada); tras el reset se espera a que la lista completa (N filas) vuelva y se confirme estable.',
    orderBalancing:
      'Los presupuestos de CPU se rotan por posición del dataset (cpuOrder = rotación de [1,4,6] en dIdx) para balancear la deriva térmica/GC de la máquina; cada celda es un navegador fresco (sin estado cruzado).',
    growthHeuristic:
      'pendientes por segmento: delta por 1000 elementos entre puntos consecutivos; |s2-s1| <= 0.25*max(|s1|,|s2|,1) -> lineal; s2 < 0.75*s1 -> sublineal; s2 > 1.25*s1 -> superlineal; cambio >2x -> cambio de régimen. Heurística sobre 3-6 puntos, no estadística formal.',
    crossPhaseNote:
      'Comparación de magnitudes absolutas con Fases 9.1/9.2/9.3/10/14 solo como contexto: 9.1 usó observador mínimo para S1 (aquí observador completo, uniforme); la comparación válida es intra-fase (React vs Angular, 1x vs 4x vs 6x).',
  },
  datasetValidation: allDatasetValidation,
  cpuRates: allCpu,
  results: allResults,
  comparison,
  slowdown,
  thresholds: thresholdsTable,
  growth,
  limitations: [
    'Mediciones en localhost; throttling de CPU SIMULADO vía CDP (no equivale a un dispositivo físico real; el scheduler del navegador y la cuantización temporal no son los de hardware móvil).',
    'Una máquina, un navegador (chrome-headless-shell), una versión de Chrome; sin throttling de red.',
    'headless vs usuario real (sin input humano, sin variación de timing entre eventos).',
    'El MutationObserver añade overhead asimétrico (Angular genera más registros por construcción incremental); no eliminable si se quiere contar mutaciones y aislamiento.',
    'El poll de 8 ms cuantiza el instante de commit (incluido en duration).',
    'CDP Performance.getMetrics es poco fiable en este headless-shell; solo JSHeapUsedSize y Nodes se usan como informativas; ScriptDuration NO se usa.',
    'INP/TBT/LCP/FCP no medibles de forma fiable con CDP directo en este harness; Fase 10 los cubrió con Lighthouse (documentado, no sustituido).',
    'n=5 por celda (3 con --quick): muestra pequeña; no se aplica significancia estadística formal, se usa lenguaje reproducible/consistente/ruido.',
    'El throttling rate de CDP se aplica al proceso de renderizado completo; el overhead del harness (observers) también se ralentiza, afectando simétricamente a ambos frameworks.',
    'Efectos de GC y scheduler del navegador pueden introducir variabilidad que no es atribuible al framework.',
    'Comparaciones de magnitud absoluta con Fases 9.1-9.3 solo contextuales (asimetría de observador en S1 documentada).',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== TABLA PRINCIPAL (mediana primary, ms — por escenario/cpu) ===')
for (const skey of allScenarioKeys) {
  console.log(`\n-- ${skey} (${allResults[skey]?.label ?? skey}) --`)
  console.log(
    'dataset | cpu | React mediana (p95) | Angular mediana (p95) | Δ | ratio | sync R/A | LT R/A',
  )
  for (const level of allDatasets) {
    for (const cpuRate of allCpu) {
      const c = comparison[skey][level]?.[cpuRate]
      if (!c) continue
      console.log(
        `${level} | ${cpuRate}x | ${c.duration.react} (${c.p95.react}) | ${c.duration.angular} (${c.p95.angular}) | ${c.duration.deltaAngularMinusReact} | ${c.duration.ratioAngularOverReact}× | ${c.sync.react}/${c.sync.angular} | ${c.longTasks.react}/${c.longTasks.angular}`,
      )
    }
  }
}

console.log('\n=== SLOWDOWN (throttled / baseline, por framework) ===')
for (const skey of allScenarioKeys) {
  console.log(`-- ${skey} --`)
  console.log('dataset | R 4x | A 4x | R 6x | A 6x')
  for (const level of allDatasets) {
    const r = slowdown[skey].react[level] ?? {}
    const a = slowdown[skey].angular[level] ?? {}
    console.log(`${level} | ${r[4] ?? '-'} | ${a[4] ?? '-'} | ${r[6] ?? '-'} | ${a[6] ?? '-'}`)
  }
}

console.log('\n=== UMBRALES (primer dataset con mediana > umbral, por framework/cpu) ===')
for (const skey of allScenarioKeys) {
  console.log(`-- ${skey} --`)
  for (const th of THRESHOLDS_MS) {
    const t = thresholdsTable[skey][`gt${th}ms`]
    console.log(
      `  >${th}ms: react=${JSON.stringify(t.react)} · angular=${JSON.stringify(t.angular)}`,
    )
  }
}

console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
