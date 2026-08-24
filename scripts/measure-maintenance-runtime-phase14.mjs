#!/usr/bin/env node
// Maintenance under load (Fase 14) — structural cost + runtime cost of the
// Phase 13 maintenance scenarios (C1 Board, C2 sort, C4 dashboard refactor,
// C5 density), measured on production builds with the ?dataset=N scaling hook
// of the experimental copy.
//
// Design (documented in docs/experiments/maintenance-runtime-phase14.md):
//   Each scenario is an independent git commit in /tmp/lab-phase14 (off the
//   S0 baseline that only adds the dataset instrumentation):
//     s0 = 832b0b2 · c2 = fd3e6e6 · c5 = 11b7d5b · c1 = 8952d8f · c4 = 0cc5c29
//   The harness checks out + rebuilds each state once, then measures the
//   cells of that state across datasets (30 / 300 / 1000 / 2000 / 3000):
//     s0: tasks-mount · tasks-filter · dashboard-mount   (before, shared)
//     c2: tasks-mount · tasks-sort                        (after)
//     c5: tasks-mount · tasks-density                     (after)
//     c1: board-mount · board-transition                  (after)
//     c4: dashboard-mount                                 (after)
//   "before" cells measured at s0 vs the same cell at the scenario commit =
//   runtime_delta of the change (same protocol). New interactions (sort,
//   density, board) only exist after the change: their cost is reported
//   absolutely and cross-framework, with the s0 tasks-filter/tasks-mount
//   cells as the pre-existing interaction reference (documented).
//
// Mount-settle protocol (same as Fase 9.1, deterministic, framework-agnostic):
//   t0 -> trigger -> tSync (synchronous dispatch) -> poll until the completion
//   condition (rows === expected / first sorted row / dense class / board
//   cards / dashboard kpi cards) -> tDone -> 2 rAF + macrotask + 100 ms flush
//   -> t1. duration = tDone - t0 (PRIMARY, commit/interaction time); sync =
//   tSync - t0; commitToDone = tDone - tSync; paintTail = t1 - tDone.
//
// Harness: PerformanceObserver (longtask + event timing) + a MINIMAL
// MutationObserver (childList + characterData; counts records / added /
// removed nodes AND mutations outside the active section for the isolation
// probe H89). Expected counts are computed from the documented scale rule
// (scale-dataset.ts) + the fixture status distribution (todo 9 /
// in-progress 7 / completed 12 / cancelled 2).
//
// Zero runtime dependencies: Node built-ins + chrome-headless-shell via CDP.
//
// Usage:
//   node scripts/measure-maintenance-runtime-phase14.mjs [/tmp/lab-phase14] [--quick] [--no-build] [--datasets=30,300] [--iter=3]
// Output: docs/experiments/results/maintenance-runtime-phase14.json

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
const RESULTS_FILE = join(RESULTS_DIR, 'maintenance-runtime-phase14.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase14'
const QUICK = process.argv.includes('--quick')
const NO_BUILD = process.argv.includes('--no-build')
const CLI_DATASETS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--datasets='))
  return arg ? arg.split('=')[1].split(',').map(Number) : null
})()
const CLI_ITER = (() => {
  const arg = process.argv.find((a) => a.startsWith('--iter='))
  return arg ? Number(arg.split('=')[1]) : null
})()
const ITER = CLI_ITER ?? (QUICK ? 2 : 3)
const WARMUP = 1
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
const DATASETS = CLI_DATASETS ?? (QUICK ? [30, 300, 1000] : [30, 300, 1000, 2000, 3000])

if (!existsSync(join(LAB, 'package.json'))) {
  console.error(`Copia experimental no encontrada: ${LAB}`)
  process.exit(1)
}

const REACT_DIST = join(LAB, 'apps/react-app/dist')
const ANGULAR_DIST = join(LAB, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4215
const ANGULAR_PORT = 4216

// Experimental states (commits in the lab copy) and the cells measured per state.
const STATES = {
  s0: '832b0b2', // baseline: dataset instrumentation only (before, shared)
  c2: 'fd3e6e6', // sort control on Tasks (after)
  c5: '11b7d5b', // density toggle on Tasks (after)
  c1: '8952d8f', // Board feature (after)
  c4: '0cc5c29', // dashboard KPI refactor (after)
}
const STATE_CELLS = {
  s0: ['tasks-mount', 'tasks-filter', 'dashboard-mount'],
  c2: ['tasks-mount', 'tasks-sort'],
  c5: ['tasks-mount', 'tasks-density'],
  c1: ['board-mount', 'board-transition'],
  c4: ['dashboard-mount'],
}
// Active section per cell (for the isolation probe: mutations outside it).
const CELL_SECTION = {
  'tasks-mount': 'Tasks',
  'tasks-filter': 'Tasks',
  'tasks-sort': 'Tasks',
  'tasks-density': 'Tasks',
  'board-mount': 'Board',
  'board-transition': 'Board',
  'dashboard-mount': 'Dashboard',
}

// Expected counts from the documented scale rule (scale-dataset.ts) + fixture
// status distribution (todo 9 / in-progress 7 / completed 12 / cancelled 2).
const FIXTURE_STATUSES = { todo: 9, 'in-progress': 7, completed: 12, cancelled: 2 }
const STATUSES = ['todo', 'in-progress', 'completed', 'cancelled']
const FIXTURE_TASKS = 30
function expectedCounts(N) {
  const m = N - FIXTURE_TASKS
  const extra = { todo: 0, 'in-progress': 0, completed: 0, cancelled: 0 }
  for (let i = 0; i < m; i += 1) extra[STATUSES[i % STATUSES.length]] += 1
  const tot = {}
  for (const k of STATUSES) tot[k] = FIXTURE_STATUSES[k] + extra[k]
  return {
    inProgress: tot['in-progress'],
    board: N - tot.cancelled,
    todo: tot.todo,
    cancelled: tot.cancelled,
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (v, d = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null

// ---------------------------------------------------------------------------
// State checkout + build (idempotent per state)
// ---------------------------------------------------------------------------

const git = (args) => execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8' }).trim()

let lastBuiltState = null
function ensureState(state) {
  const target = STATES[state]
  const current = git(['rev-parse', 'HEAD'])
  if (current !== target) {
    console.log(`  checkout ${state} (${target.slice(0, 7)}) …`)
    git(['checkout', '-q', target])
  }
  if (NO_BUILD) return
  if (lastBuiltState === state && current === target) return
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
  step(
    'react-app',
    [bin('apps/react-app/node_modules/.bin/vite'), 'build'],
    join(LAB, 'apps/react-app'),
  )
  step(
    'angular-app',
    [bin('apps/angular-app/node_modules/.bin/ng'), 'build'],
    join(LAB, 'apps/angular-app'),
  )
  lastBuiltState = state
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
  const profile = `/tmp/lh14-profile-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
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

// Lightweight harness: long tasks + event timing + MINIMAL MutationObserver
// (childList + characterData only; counts records / added / removed nodes and
// mutations OUTSIDE the active section for the isolation probe H89).
const HARNESS = (activeLabel) => `
window.__m = { lt: [], ev: [], mut: { n: 0, added: 0, removed: 0, outside: 0 }, mo: null };
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
try {
  window.__m.mo = new MutationObserver((recs) => {
    const m = window.__m.mut;
    for (const r of recs) {
      m.n += 1;
      m.added += r.addedNodes.length;
      m.removed += r.removedNodes.length;
      if (typeof r.target.closest === 'function') {
        const s = r.target.closest('main section[aria-label]');
        if (!s || s.getAttribute('aria-label') !== '${activeLabel}') m.outside += 1;
      }
    }
  });
  window.__m.mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
} catch (e) {}
true;
`

const clickNav = (label) => `(() => {
  const btn = [...document.querySelectorAll('nav[aria-label="Main"] button')]
    .find((b) => b.textContent.trim() === '${label}');
  if (!btn) throw new Error('nav button ${label} not found');
  btn.click();
})();`

const SETTLE_EXPR = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 80));
  return true;
})()`

const rowCountExpr = `document.querySelectorAll('.task-list li').length`
const boardCountExpr = `document.querySelectorAll('.board-list li').length`
const kpiCountExpr = `document.querySelectorAll('.kpis .kpi-card').length`

// waitForBody produces a pre body that polls until a condition (used to make
// sure the target section/control is mounted BEFORE t0, so the trigger always
// finds its controls and the measurement starts from a settled state).
const waitForBody = (cond) =>
  `for (let i = 0; i < 2000; i += 1) { if (${cond}) break; await new Promise((r) => setTimeout(r, 8)); }`

// Generic measurement expression: pre (awaited navigation/settle) -> t0 ->
// trigger -> tSync -> poll completion -> tDone -> flush -> t1. The pre is
// awaited so setup work is NOT included in the measured duration.
function measureExpr({ pre, trigger, doneExpr, label, rowsExpr, extraExpr }) {
  return `(async () => {
    ${pre ? `await (async () => { ${pre} })();` : ''}
    const ltStart = window.__m.lt.length;
    const evStart = window.__m.ev.length;
    const mStart = { ...window.__m.mut };
    const t0 = performance.now();
    ${trigger}
    const tSync = performance.now();
    let tDone = null;
    for (let i = 0; i < 6000; i += 1) {
      if (${doneExpr}) { tDone = performance.now(); break; }
      await new Promise((r) => setTimeout(r, 16));
    }
    if (tDone === null) throw new Error('completion never reached: ${label}');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 100));
    const t1 = performance.now();
    const m = window.__m.mut;
    return {
      duration: tDone - t0,
      sync: tSync - t0,
      commitToDone: tDone - tSync,
      paintTail: t1 - tDone,
      rows: ${rowsExpr ?? 'null'},
      extra: ${extraExpr ?? 'null'},
      longTasks: window.__m.lt.slice(ltStart),
      events: window.__m.ev.slice(evStart),
      mutations: { n: m.n - mStart.n, added: m.added - mStart.added, removed: m.removed - mStart.removed, outside: m.outside - mStart.outside }
    };
  })()
`
}

const projectsMounted = `document.querySelector('main section[aria-label="Projects"]') !== null`
const tasksMounted = (controlId) => `document.getElementById('${controlId}') !== null`
const boardMounted = `document.querySelectorAll('.board-list li').length > 0`

const CELLS = {
  'tasks-mount': {
    active: 'Tasks',
    expr: (N) =>
      measureExpr({
        pre: `${clickNav('Projects')}; ${waitForBody(projectsMounted)}; await new Promise((r) => setTimeout(r, 40));`,
        trigger: clickNav('Tasks'),
        doneExpr: `${rowCountExpr} >= ${N}`,
        label: `tasks-mount@${N}`,
        rowsExpr: rowCountExpr,
      }),
    check: (r, N) => r.rows === N,
    afterIteration: async (cdp, N) => {
      // reset: back to Projects (small view), settles before the next baseline
      await evaluate(cdp, clickNav('Projects'))
      await waitFor(cdp, projectsMounted)
      await evaluate(cdp, SETTLE_EXPR)
    },
  },
  'tasks-filter': {
    active: 'Tasks',
    expr: (N) => {
      const exp = expectedCounts(N)
      return measureExpr({
        pre: `${clickNav('Tasks')}; ${waitForBody(tasksMounted('task-status-filter'))}; await new Promise((r) => setTimeout(r, 40));`,
        trigger: `(() => { const el = document.getElementById('task-status-filter'); el.value = 'in-progress'; el.dispatchEvent(new Event('change', { bubbles: true })); })();`,
        doneExpr: `${rowCountExpr} === ${exp.inProgress}`,
        label: `tasks-filter@${N}`,
        rowsExpr: rowCountExpr,
      })
    },
    check: (r, N) => r.rows === expectedCounts(N).inProgress,
    afterIteration: async (cdp, N) => {
      // reset: clear the filter back to 'all' (full list again)
      await evaluate(
        cdp,
        `(() => { const el = document.getElementById('task-status-filter'); el.value = 'all'; el.dispatchEvent(new Event('change', { bubbles: true })); })();`,
      )
      await waitFor(cdp, `${rowCountExpr} === ${N}`)
      await evaluate(cdp, SETTLE_EXPR)
    },
  },
  'tasks-sort': {
    active: 'Tasks',
    expr: (N) =>
      measureExpr({
        pre: `${clickNav('Tasks')}; ${waitForBody(tasksMounted('task-sort'))}; await new Promise((r) => setTimeout(r, 40));`,
        trigger: `(() => { const el = document.getElementById('task-sort'); el.value = 'title'; el.dispatchEvent(new Event('change', { bubbles: true })); })();`,
        doneExpr: `${rowCountExpr} === ${N} && (document.querySelector('.task-list li')?.textContent ?? '').includes('Add completion rate card')`,
        label: `tasks-sort@${N}`,
        rowsExpr: rowCountExpr,
      }),
    check: (r, N) => r.rows === N,
    afterIteration: async (cdp, N) => {
      await evaluate(
        cdp,
        `(() => { const el = document.getElementById('task-sort'); el.value = 'none'; el.dispatchEvent(new Event('change', { bubbles: true })); })();`,
      )
      await waitFor(
        cdp,
        `${rowCountExpr} === ${N} && !(document.querySelector('.task-list li')?.textContent ?? '').includes('Add completion rate card')`,
      )
      await evaluate(cdp, SETTLE_EXPR)
    },
  },
  'tasks-density': {
    active: 'Tasks',
    expr: (N) =>
      measureExpr({
        pre: `${clickNav('Tasks')}; ${waitForBody(tasksMounted('task-dense'))}; await new Promise((r) => setTimeout(r, 40));`,
        trigger: `document.getElementById('task-dense').click();`,
        doneExpr: `document.querySelector('ul.task-list')?.classList.contains('dense') === true`,
        label: `tasks-density@${N}`,
        rowsExpr: rowCountExpr,
      }),
    check: (r, N) => r.rows === N,
    afterIteration: async (cdp, N) => {
      await evaluate(cdp, `document.getElementById('task-dense').click();`)
      await waitFor(
        cdp,
        `document.querySelector('ul.task-list')?.classList.contains('dense') === false`,
      )
      await evaluate(cdp, SETTLE_EXPR)
    },
  },
  'board-mount': {
    active: 'Board',
    expr: (N) => {
      const exp = expectedCounts(N)
      return measureExpr({
        pre: `${clickNav('Projects')}; ${waitForBody(projectsMounted)}; await new Promise((r) => setTimeout(r, 40));`,
        trigger: clickNav('Board'),
        doneExpr: `${boardCountExpr} >= ${exp.board}`,
        label: `board-mount@${N}`,
        rowsExpr: boardCountExpr,
      })
    },
    check: (r, N) => r.rows === expectedCounts(N).board,
    afterIteration: async (cdp, N) => {
      await evaluate(cdp, clickNav('Projects'))
      await waitFor(cdp, projectsMounted)
      await evaluate(cdp, SETTLE_EXPR)
    },
  },
  'board-transition': {
    active: 'Board',
    expr: (N) =>
      measureExpr({
        pre: `${clickNav('Board')}; ${waitForBody(boardMounted)}; await new Promise((r) => setTimeout(r, 40));`,
        trigger: `(() => {
          // The store mutation is persistent across iterations in the session,
          // so the completion is a DELTA (todoBefore - 1), not an absolute count.
          window.__todoBefore = document.querySelectorAll('.board-column')[0].querySelectorAll('.board-list li').length;
          const firstCard = document.querySelector('.board-column .board-list li');
          const btn = [...firstCard.querySelectorAll('.transitions button')]
            .find((b) => b.textContent.includes('in-progress'));
          if (!btn) throw new Error('transition button not found');
          btn.click();
        })();`,
        doneExpr: `document.querySelectorAll('.board-column')[0].querySelectorAll('.board-list li').length === window.__todoBefore - 1`,
        label: `board-transition@${N}`,
        rowsExpr: `document.querySelectorAll('.board-column')[0].querySelectorAll('.board-list li').length`,
        extraExpr: `window.__todoBefore - (document.querySelectorAll('.board-column')[0].querySelectorAll('.board-list li').length)`,
      }),
    check: (r, N) => r.extra === 1,
    afterIteration: async (cdp, N) => {
      // reset: navigate away and back to remount the board from the store state
      await evaluate(cdp, clickNav('Projects'))
      await waitFor(cdp, projectsMounted)
      await evaluate(cdp, clickNav('Board'))
      const exp = expectedCounts(N)
      await waitFor(cdp, `${boardCountExpr} === ${exp.board}`)
      await evaluate(cdp, SETTLE_EXPR)
    },
  },
  'dashboard-mount': {
    active: 'Dashboard',
    expr: (N) =>
      measureExpr({
        pre: `${clickNav('Projects')}; ${waitForBody(projectsMounted)}; await new Promise((r) => setTimeout(r, 40));`,
        trigger: clickNav('Dashboard'),
        doneExpr: `${kpiCountExpr} === 6`,
        label: `dashboard-mount@${N}`,
        rowsExpr: kpiCountExpr,
      }),
    check: (r, N) => r.rows === 6,
    afterIteration: async (cdp, N) => {
      await evaluate(cdp, clickNav('Projects'))
      await waitFor(cdp, projectsMounted)
      await evaluate(cdp, SETTLE_EXPR)
    },
  },
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
    commitToDone: stats(pick((i) => i.commitToDone)),
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
      outsideSection: stats(pick((i) => i.mutations.outside)),
    },
    heapDeltaKb: stats(pick((i) => i.heapDeltaKb)),
    nodesDelta: stats(pick((i) => i.nodesDelta)),
    thresholds: {
      gt50ms: iters.filter((i) => i.duration > 50).length,
      gt100ms: iters.filter((i) => i.duration > 100).length,
      gt200ms: iters.filter((i) => i.duration > 200).length,
    },
  }
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

async function runCell(cdp, cellKey, N) {
  const cell = CELLS[cellKey]
  // warmup
  for (let w = 0; w < WARMUP; w += 1) {
    await evaluate(cdp, cell.expr(N))
    await cell.afterIteration(cdp, N)
  }
  const iters = []
  for (let i = 0; i < ITER; i += 1) {
    const m0 = await getMetrics(cdp)
    const r = await evaluate(cdp, cell.expr(N))
    await sleep(120)
    const m1 = await getMetrics(cdp)
    const checkOk = cell.check(r, N)
    await cell.afterIteration(cdp, N)
    iters.push({
      duration: round(r.duration, 3),
      sync: round(r.sync, 3),
      commitToDone: round(r.commitToDone, 3),
      paintTail: round(r.paintTail, 3),
      rows: r.rows,
      longTasks: r.longTasks.map((t) => ({ start: round(t.s, 3), dur: round(t.d, 3) })),
      mutations: {
        n: r.mutations.n,
        added: r.mutations.added,
        removed: r.mutations.removed,
        outside: r.mutations.outside,
      },
      heapDeltaKb: round((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024, 2),
      nodesDelta: round(m1.Nodes - m0.Nodes, 1),
      checkOk,
    })
  }
  return summarize(iters)
}

async function session(app, dataset, cellKey) {
  const browser = await launchBrowser(shellPath)
  try {
    if (!chromeVersion) {
      try {
        const v = await fetch(`http://127.0.0.1:${browser.port}/json/version`)
        chromeVersion = (await v.json()).Browser ?? null
      } catch {
        chromeVersion = null
      }
    }
    const wsUrl = await openPage(browser.port, `${app.url.replace(/\/$/, '')}/?dataset=${dataset}`)
    const cdp = await Cdp.connect(wsUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await waitFor(cdp, `document.querySelector('nav[aria-label="Main"]') !== null`)
    await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT)
    await cdp.send('Performance.enable')
    await evaluate(cdp, HARNESS(CELLS[cellKey].active))
    await sleep(500)
    const data = await runCell(cdp, cellKey, dataset)
    cdp.close()
    return data
  } finally {
    await killBrowser(browser)
    await sleep(250)
  }
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

// results[state][cell][dataset][appKey] = summarized cell
const results = {}
for (const [state, cells] of Object.entries(STATE_CELLS)) {
  ensureState(state)
  for (const cellKey of cells) {
    for (const dataset of DATASETS) {
      results[state] ??= {}
      results[state][cellKey] ??= {}
      results[state][cellKey][dataset] ??= {}
      for (const [appKey, app] of Object.entries(apps)) {
        console.log(`\n=== ${state} · ${cellKey} · dataset=${dataset} · ${appKey} ===`)
        const data = await session(app, dataset, cellKey)
        results[state][cellKey][dataset][appKey] = data
        console.log(
          `  duration ${data.duration.median} ms (p95 ${data.duration.p95} · min ${data.duration.min} · max ${data.duration.max}) · sync ${data.sync.median} · LT ${data.longTaskCount.sum} · outside ${data.mutations.outsideSection.median ?? 0} · checks ${data.checksPassed}/${data.n} · >100ms ${data.thresholds.gt100ms}/${data.n}`,
        )
      }
    }
  }
}
for (const s of servers) s.close()

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

// Per-scenario comparison: duration (ms) react vs angular, before (s0) vs
// after (scenario state) for the cells measured in both states.
const SCENARIO_STATES = {
  c2: { after: 'c2', before: 's0' },
  c5: { after: 'c5', before: 's0' },
  c1: { after: 'c1', before: 's0' },
  c4: { after: 'c4', before: 's0' },
}
const COMPARABLE_CELLS = {
  c2: { before: 'tasks-mount', after: 'tasks-mount' },
  c5: { before: 'tasks-mount', after: 'tasks-mount' },
  c1: { before: 'tasks-mount', after: 'tasks-mount' },
  c4: { before: 'dashboard-mount', after: 'dashboard-mount' },
}

const comparison = {}
const growth = {}
for (const scenario of Object.keys(SCENARIO_STATES)) {
  const { before, after } = SCENARIO_STATES[scenario]
  const beforeCell = COMPARABLE_CELLS[scenario].before
  const afterCell = COMPARABLE_CELLS[scenario].after
  comparison[scenario] = {}
  for (const dataset of DATASETS) {
    const b = results[before]?.[beforeCell]?.[dataset]
    const a = results[after]?.[afterCell]?.[dataset]
    if (!a) continue
    const row = {
      dataset,
      before: {
        react: b?.react?.duration.median ?? null,
        angular: b?.angular?.duration.median ?? null,
      },
      after: {
        react: a.react?.duration.median ?? null,
        angular: a.angular?.duration.median ?? null,
      },
      runtimeDelta: {
        react: round((a.react?.duration.median ?? null) - (b?.react?.duration.median ?? null), 3),
        angular: round(
          (a.angular?.duration.median ?? null) - (b?.angular?.duration.median ?? null),
          3,
        ),
      },
      deltaPercent: {
        react: b?.react?.duration.median
          ? round(
              ((a.react.duration.median - b.react.duration.median) / b.react.duration.median) * 100,
              1,
            )
          : null,
        angular: b?.angular?.duration.median
          ? round(
              ((a.angular.duration.median - b.angular.duration.median) /
                b.angular.duration.median) *
                100,
              1,
            )
          : null,
      },
      afterComparison: {
        deltaAngularMinusReact: round(
          (a.angular?.duration.median ?? null) - (a.react?.duration.median ?? null),
          3,
        ),
        ratioAngularOverReact: a.react?.duration.median
          ? round(a.angular.duration.median / a.react.duration.median, 2)
          : null,
      },
      p95: {
        react: a.react?.duration.p95 ?? null,
        angular: a.angular?.duration.p95 ?? null,
      },
      sync: {
        react: a.react?.sync.median ?? null,
        angular: a.angular?.sync.median ?? null,
      },
      longTasks: {
        react: a.react?.longTaskCount.sum ?? null,
        angular: a.angular?.longTaskCount.sum ?? null,
      },
      outsideMutations: {
        react: a.react?.mutations.outsideSection.median ?? null,
        angular: a.angular?.mutations.outsideSection.median ?? null,
      },
      thresholds: {
        react: a.react?.thresholds ?? null,
        angular: a.angular?.thresholds ?? null,
      },
    }
    comparison[scenario][dataset] = row
  }
  // growth of the after-cell duration per framework (ms per 1000 elements)
  growth[scenario] = {}
  for (const appKey of ['react', 'angular']) {
    const values = DATASETS.map(
      (d) => results[after]?.[afterCell]?.[d]?.[appKey]?.duration?.median ?? null,
    )
    growth[scenario][appKey] = growthSegments(values, DATASETS)
  }
}

function growthSegments(values, sizes) {
  const slopes = []
  for (let i = 1; i < values.length; i += 1) {
    const v1 = values[i - 1]
    const v2 = values[i]
    if (v1 === null || v2 === null) continue
    const dv = v2 - v1
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
    let shape = 'inconcluso'
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

const structural = (() => {
  // Structural cost per scenario: git diff of the scenario commit vs S0
  // (files / LOC, split by domain / framework / mixed), from the lab copy.
  const out = {}
  for (const [state, commit] of Object.entries(STATES)) {
    if (state === 's0') continue
    const diff = git(['diff', '--numstat', STATES.s0, commit])
    let files = 0
    let added = 0
    let removed = 0
    const byKind = { domain: 0, framework: 0, mixed: 0 }
    const fileKinds = {}
    for (const line of diff.split('\n')) {
      if (!line.trim()) continue
      const [a, d, file] = line.split('\t')
      if (!file || file.includes('/dist/') || file.endsWith('.json')) continue
      files += 1
      added += Number(a) || 0
      removed += Number(d) || 0
      const kind = file.startsWith('packages/domain')
        ? 'domain'
        : /\.(html|css|component\.ts|spec\.ts)$/.test(file)
          ? 'framework'
          : 'mixed'
      byKind[kind] += 1
      fileKinds[file] = kind
    }
    out[state] = {
      files,
      locAdded: added,
      locRemoved: removed,
      locNet: added - removed,
      filesByKind: byKind,
      fileKinds,
    }
  }
  return out
})()

const result = {
  experiment: 'maintenance-runtime-phase14',
  capturedAt: new Date().toISOString(),
  objective:
    'Determinar si el coste estructural de los escenarios de mantenimiento de Fase 13 (C1 Board, C2 sort, C4 refactor dashboard, C5 density) tiene relación con el coste de runtime bajo datasets pequeños y grandes (30-3000 tareas). Evaluar H83-H90: coste estructural comparable, cambios localizados sin impacto en datasets pequeños, impacto creciente con el dataset, cambios de renderizado vs estructurales, dependencia del tipo de cambio vs framework, correlación accidental-estructural con runtime, aislamiento de la actualización, reproducibilidad.',
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
    states: STATES,
    note: 'chrome-headless-shell (Chrome for Testing), único headless funcional en este entorno (Fases 4.1/5.1/7/9/9.1). Copia experimental aislada en /tmp/lab-phase14 con historial propio; el árbol principal no se modifica.',
  },
  method: {
    summary:
      'Cada escenario de Fase 13 es un commit independiente sobre la baseline S0 (solo instrumentación ?dataset=N). El harness hace checkout + build de cada estado y mide sus celdas (ver STATE_CELLS) con el protocolo mount-settle de Fase 9.1: t0 -> trigger -> tSync -> poll hasta condición de completado -> tDone -> 2 rAF + macrotask + 100 ms. duration (PRIMARY) = tDone - t0. Las celdas de montaje (tasks-mount, dashboard-mount) se miden en S0 (before) y en el commit del escenario (after): su runtime_delta mide el coste que el cambio añade a una vista existente. Las interacciones nuevas (tasks-sort, tasks-density, board-mount, board-transition) solo existen after: su coste se reporta en absoluto y por framework, con tasks-filter/tasks-mount de S0 como referencia de interacción preexistente.',
    viewport: VIEWPORT,
    datasets: DATASETS,
    iterations: ITER,
    warmup: WARMUP,
    thresholds:
      '50 / 100 / 200 ms como umbrales operativos del experimento (NO equivalen automáticamente a percepción humana; documentado).',
    metrics: [
      'duration (ms) = tiempo desde el trigger hasta la condición de completado (commit completo; PRIMARY)',
      'sync (ms) = trabajo síncrono del evento',
      'commitToDone (ms) = commit diferido hasta la condición de completado',
      'paintTail (ms) = ventana posterior (2 rAF + macrotask + 100 ms; informativa)',
      'longTasks (PerformanceObserver longtask)',
      'mutations (MutationObserver mínimo: registros, nodos añadidos/eliminados y fuera de la sección activa para H89)',
      'heapDeltaKb / nodesDelta (CDP Performance.getMetrics; informativas; ScriptDuration NO se usa)',
    ],
    expectedCounts:
      'Conteos esperados derivados de la regla documentada scale-dataset.ts + distribución del fixture (todo 9 / in-progress 7 / completed 12 / cancelled 2): tasks-filter espera inProgress(N); board-mount espera N - cancelled(N); board-transition espera todo(N) - 1; tasks-sort espera la primera fila ordenada (Add completion rate card); dashboard-mount espera 6 kpi-cards.',
    checks:
      'cada iteración verifica la condición de completado exacta (checkOk): filas === esperado para filter/board, 6 kpi-cards para dashboard, clase dense para density, primera fila ordenada para sort.',
    growthHeuristic:
      'pendientes por segmento: delta por 1000 elementos entre puntos consecutivos; |s2-s1| <= 0.25*max(|s1|,|s2|,1) -> lineal; s2 < 0.75*s1 -> sublineal; s2 > 1.25*s1 -> superlineal; cambio >2x -> cambio de régimen. Heurística sobre 3-5 puntos, no estadística formal.',
  },
  states: STATES,
  cellsPerState: STATE_CELLS,
  results,
  comparison,
  growth,
  structural,
  limitations: [
    'Mediciones en localhost sin throttling; no representan condiciones de campo.',
    'El MutationObserver añade overhead asimétrico (Angular genera más registros por construcción incremental); la clasificación outside se basa en closest(aria-label) y es aproximada para mutaciones en nodos sin ancestro de sección.',
    'El polling de 16 ms cuantiza el instante de completado (~16 ms), incluido en duration.',
    'El protocolo de interacción before/after solo es idéntico para las celdas de montaje; las interacciones nuevas no tienen medición "before" y su coste se reporta en absoluto (documentado).',
    'time_to_implement humano: NO MEDIBLE (no hay operador cronometrado); solo proxies estructurales reproducibles.',
    'Una máquina local; resultados indicativos, no benchmark científico (metrics.md §1).',
    'Los commits de los estados pertenecen a la copia experimental /tmp/lab-phase14; regenerables desde el árbol principal con la instrumentación documentada.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log(
  '\n=== TABLA PRINCIPAL (mediana duration, ms) — escenario | dataset | R/A | Δ | ratio | LT | outside ===',
)
for (const scenario of Object.keys(SCENARIO_STATES)) {
  const after = SCENARIO_STATES[scenario].after
  const afterCell = COMPARABLE_CELLS[scenario].after
  console.log(`-- ${scenario} (${afterCell} @ ${after}) --`)
  for (const dataset of DATASETS) {
    const c = comparison[scenario][dataset]
    if (!c) continue
    console.log(
      `${dataset} | before ${c.before.react}/${c.before.angular} | after ${c.after.react} (p95 ${c.p95.react}) / ${c.after.angular} (p95 ${c.p95.angular}) | Δ ${c.runtimeDelta.react}/${c.runtimeDelta.angular} | ratio ${c.afterComparison.ratioAngularOverReact}× | LT ${c.longTasks.react}/${c.longTasks.angular} | outside ${c.outsideMutations.react}/${c.outsideMutations.angular}`,
    )
  }
}
console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
