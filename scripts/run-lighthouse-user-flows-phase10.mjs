#!/usr/bin/env node
// Lighthouse User Flows evaluation (Fase 10) — perceived performance of the
// React and Angular lab builds (Fase 9 chain: 10 features + scale-dataset)
// across datasets 30 / 300 / 500 / 1000 / 2000 / 3000, driven by
// ?dataset=N.
//
// Validates whether the low-level differences of Fases 7-9 (mount cost,
// incremental sync work, long tasks) show up in user-perceived metrics
// (LCP / TBT / INP / CLS / performance score) measured with Lighthouse
// User Flows over REAL interactions (trusted input).
//
// Zero NEW runtime dependencies: Lighthouse core + puppeteer-core are
// resolved from the npx cache (the same lighthouse the Fase 5.9 script
// uses); the browser is chrome-headless-shell from the Playwright cache
// (the only working headless browser in this environment, Fases 4.1/5.1).
// The chrome flag --enable-blink-features=EventTimingTracing is required
// for INP (interaction-to-next-paint): without it the audit is
// notApplicable because chrome-headless-shell does not emit EventTiming
// trace events (verified experimentally in this phase).
//
// User flows (each flow = one browser session):
//   F1 load          navigation step (initial load of the default section,
//                    which aggregates the dataset -> scales with N)
//   F2 mount         timespan: Projects -> Tasks, wait full list (N rows)
//   F3 search        timespan: type "incident" in the live search
//   F4 combined      timespan: search + status + priority in one interaction
//   F5 end-to-end    navigate + mount timespan + combined timespan +
//                    repeated interaction timespan (priority high -> low)
//   a11y             navigation step, onlyCategories accessibility
//
// Metrics per step (when available):
//   navigation: performance score, FCP, LCP, SI, TBT, CLS, TTI
//   timespan:   performance score, TBT, CLS, INP
//               (interaction-to-next-paint), main-thread-work,
//               long-task count (derived from main-thread-tasks items;
//               the long-tasks audit is notApplicable in timespan mode)
//
// Throttling: throttlingMethod 'provided' (NO simulated throttling) —
// user flows measure real interaction latency; simulated throttling is
// not applied (documented; differs from Fase 5.9's simulated mobile).
//
// Runs: RUNS per cell (3 by default, 1 in --quick). Each run is a fresh
// browser session. Cells already present in the results JSON with enough
// runs are reused (idempotence / crash recovery). Resumable via
// --datasets=300,500 and --app=react.
//
// Output: docs/experiments/results/lighthouse-user-flows-phase10.json

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { cpus, totalmem, homedir } from 'node:os'
import { prettierJson } from './analyze-bundle.mjs'

const require = createRequire(import.meta.url)
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'lighthouse-user-flows-phase10.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase10'
const QUICK = process.argv.includes('--quick')
const CLI_DATASETS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--datasets='))
  return arg ? arg.split('=')[1].split(',').map(Number) : null
})()
const CLI_APP = (() => {
  const arg = process.argv.find((a) => a.startsWith('--app='))
  return arg ? arg.split('=')[1] : null
})()

if (!existsSync(join(LAB, 'package.json'))) {
  console.error(`Copia experimental no encontrada: ${LAB}`)
  process.exit(1)
}

const REACT_DIST = join(LAB, 'apps/react-app/dist')
const ANGULAR_DIST = join(LAB, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4231
const ANGULAR_PORT = 4232

const RUNS = QUICK ? 1 : 3
const A11Y_RUNS = QUICK ? 1 : 3
const VIEWPORT = { width: 1280, height: 800 }

// F5 datasets (priority per Fase 10: L2/L3/L4, plus L1 and L5 since the
// per-flow cost is low). L0 (30) is covered by F1 and Fase 5.9.
const F5_DATASETS = CLI_DATASETS ?? (QUICK ? [500] : [300, 500, 1000, 2000, 3000])
const EXTRA_CELLS = CLI_DATASETS
  ? []
  : [
      { flow: 'F1', datasets: [30] },
      { flow: 'F2', datasets: [500] },
      { flow: 'F3', datasets: [500, 1000] },
      { flow: 'F4', datasets: [500] },
      { flow: 'a11y', datasets: [500] },
    ]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (v, d = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null

// ---------------------------------------------------------------------------
// Environment discovery (no installation; same pattern as Fase 5.9)
// ---------------------------------------------------------------------------

function findLighthouse() {
  const npxRoot = join(homedir(), '.npm/_npx')
  if (!existsSync(npxRoot)) return null
  const candidates = []
  for (const dir of readdirSync(npxRoot)) {
    const pkg = join(npxRoot, dir, 'node_modules/lighthouse/package.json')
    if (existsSync(pkg)) candidates.push(join(npxRoot, dir, 'node_modules/lighthouse'))
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  const pkg = JSON.parse(readFileSync(join(candidates[0], 'package.json'), 'utf8'))
  return {
    root: candidates[0],
    version: pkg.version,
    core: join(candidates[0], 'core/index.cjs'),
    puppeteerCore: join(candidates[0], '..', 'puppeteer-core'),
  }
}

function listHeadlessShells() {
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  if (!existsSync(base)) return []
  const found = []
  for (const dir of readdirSync(base)) {
    const m = /^chromium_headless_shell-(\d+)$/.exec(dir)
    if (!m) continue
    const candidates = [
      join(base, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
      join(base, dir, 'chrome-mac/headless_shell'),
      join(base, dir, 'headless_shell'),
    ]
    for (const c of candidates) {
      if (existsSync(c)) found.push({ version: Number(m[1]), path: c })
    }
  }
  return found.sort((a, b) => b.version - a.version)
}

// INP capability probe: chrome-headless-shell versions differ in whether they
// emit EventTiming trace events with --enable-blink-features=EventTimingTracing
// (verified: 1208 emits, 1234 does not). The probe runs a minimal flow with a
// trusted click inside a timespan and checks whether interaction-to-next-paint
// comes back numeric. First shell (newest first) that yields numeric INP wins.
async function probeInpCapability(shellPath, probePort) {
  const browser = await puppeteer.launch({
    executablePath: shellPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--enable-blink-features=EventTimingTracing',
    ],
  })
  try {
    const page = await browser.newPage()
    const config = {
      extends: 'lighthouse:default',
      settings: { throttlingMethod: 'provided', onlyCategories: ['performance'] },
    }
    const flow = await lighthouse.startFlow(page, { name: 'inp-probe', config })
    await flow.navigate(`http://127.0.0.1:${probePort}/inp-probe.html`)
    await flow.startTimespan({ name: 'click' })
    await page.click('#btn')
    await sleep(150)
    await flow.endTimespan()
    const result = await flow.createFlowResult()
    const ts = result.steps[1].lhr
    return ts.audits['interaction-to-next-paint']?.numericValue ?? null
  } finally {
    await browser.close()
  }
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
    if (path === '/inp-probe.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><body><button id="btn">go</button>' +
          '<script>document.getElementById("btn").onclick = () => {' +
          'for (let i = 0; i < 50; i++) document.body.appendChild(document.createElement("div"));' +
          '};</script></body></html>',
      )
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
// Expected counts (documented scale-dataset rule, see Fase 9.2/9.3)
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
// Flow runners (trusted input via puppeteer; same DOM ids in both apps)
// ---------------------------------------------------------------------------

async function clickNav(page, label) {
  const buttons = await page.$$('nav[aria-label="Main"] button')
  for (const b of buttons) {
    const t = await b.evaluate((el) => el.textContent.trim())
    if (t === label) {
      await b.click()
      return
    }
  }
  throw new Error(`nav button ${label} not found`)
}

const rowsExpr = `document.querySelectorAll('.task-list li').length`

async function waitRows(page, count, timeoutMs = 60000) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('.task-list li').length === n,
    { timeout: timeoutMs },
    count,
  )
}

async function runF1(page, flow, url) {
  await flow.navigate(url, { name: 'F1 load' })
}

async function runF2(page, flow, url, N) {
  await flow.navigate(url, { name: 'F1 load' })
  await clickNav(page, 'Projects')
  await page.waitForSelector('main section[aria-label="Projects"]')
  await sleep(150)
  await flow.startTimespan({ name: 'F2 mount tasks' })
  await clickNav(page, 'Tasks')
  await waitRows(page, N)
  // keep the timespan open past the mount paint so INP of the navigation
  // interaction is captured (next paint must occur inside the timespan)
  await sleep(250)
  await flow.endTimespan()
}

async function runF3(page, flow, url, N, exp) {
  await flow.navigate(url, { name: 'F1 load' })
  await clickNav(page, 'Projects')
  await page.waitForSelector('main section[aria-label="Projects"]')
  await clickNav(page, 'Tasks')
  await waitRows(page, N)
  await sleep(150)
  await flow.startTimespan({ name: 'F3 search' })
  await page.click('#task-search')
  await page.type('#task-search', 'incident')
  await waitRows(page, exp.incident)
  await sleep(150)
  await flow.endTimespan()
}

async function runF4(page, flow, url, N, exp) {
  await flow.navigate(url, { name: 'F1 load' })
  await clickNav(page, 'Projects')
  await page.waitForSelector('main section[aria-label="Projects"]')
  await clickNav(page, 'Tasks')
  await waitRows(page, N)
  await sleep(150)
  await flow.startTimespan({ name: 'F4 combined' })
  await page.click('#task-search')
  await page.type('#task-search', 'incident')
  await page.select('#task-status-filter', 'in-progress')
  await page.select('#task-priority-filter', 'high')
  await waitRows(page, exp.combined)
  await sleep(150)
  await flow.endTimespan()
}

async function runF5(page, flow, url, N, exp) {
  await flow.navigate(url, { name: 'F1 load' })
  await clickNav(page, 'Projects')
  await page.waitForSelector('main section[aria-label="Projects"]')
  await sleep(150)
  await flow.startTimespan({ name: 'F2 mount tasks' })
  await clickNav(page, 'Tasks')
  await waitRows(page, N)
  await sleep(250)
  await flow.endTimespan()
  await flow.startTimespan({ name: 'F4 combined' })
  await page.click('#task-search')
  await page.type('#task-search', 'incident')
  await page.select('#task-status-filter', 'in-progress')
  await page.select('#task-priority-filter', 'high')
  await waitRows(page, exp.combined)
  await sleep(150)
  await flow.endTimespan()
  await flow.startTimespan({ name: 'F5b repeat interaction' })
  await page.select('#task-priority-filter', 'low')
  await waitRows(page, exp.combinedLow)
  await sleep(150)
  await flow.endTimespan()
}

async function runA11y(page, flow, url) {
  await flow.navigate(url, { name: 'a11y load' })
}

// ---------------------------------------------------------------------------
// Step extraction
// ---------------------------------------------------------------------------

const NAV_METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'speed-index',
  'total-blocking-time',
  'cumulative-layout-shift',
  'interactive',
]

function extractNavStep(lhr) {
  const a = lhr.audits
  const cwv = {}
  for (const k of NAV_METRICS) cwv[k] = a[k]?.numericValue ?? null
  // long-tasks audit (navigation mode): list of long tasks from the trace
  let longTasks = null
  if (a['long-tasks']?.details?.items) {
    longTasks = {
      count: a['long-tasks'].details.items.length,
      maxDurationMs: round(
        Math.max(...a['long-tasks'].details.items.map((i) => i.duration ?? 0), 0),
        2,
      ),
    }
  }
  // accessibility audit results (only present when the accessibility
  // category was gathered): failed/passed audit ids with scores
  let failedA11yAudits = null
  let passedA11yAudits = null
  if (lhr.categories.accessibility) {
    const audits = lhr.categories.accessibility.auditRefs ?? []
    failedA11yAudits = audits
      .filter((ref) => {
        const score = a[ref.id]?.score
        return score !== null && score !== undefined && score < 1
      })
      .map((ref) => ({ id: ref.id, score: a[ref.id]?.score, title: a[ref.id]?.title }))
    passedA11yAudits = audits.filter((ref) => a[ref.id]?.score === 1).map((ref) => ref.id)
  }
  return {
    gatherMode: lhr.gatherMode,
    name: lhr.userFlowStep?.name ?? null,
    performance: lhr.categories.performance?.score ?? null,
    accessibility: lhr.categories.accessibility?.score ?? null,
    cwv,
    longTasks,
    failedA11yAudits,
    passedA11yAudits,
    runtimeError: lhr.runtimeError?.code ?? null,
  }
}

function extractTimespanStep(lhr) {
  const a = lhr.audits
  let longTasks = null
  // main-thread-tasks (informative) carries the task list with durations;
  // the long-tasks audit itself is notApplicable in timespan mode (v13)
  if (a['main-thread-tasks']?.details?.items) {
    const items = a['main-thread-tasks'].details.items
    longTasks = {
      count: items.filter((i) => (i.duration ?? 0) > 50).length,
      maxDurationMs: round(Math.max(...items.map((i) => i.duration ?? 0), 0), 2),
    }
  }
  return {
    gatherMode: lhr.gatherMode,
    name: lhr.userFlowStep?.name ?? null,
    performance: lhr.categories.performance?.score ?? null,
    tbtMs: a['total-blocking-time']?.numericValue ?? null,
    cls: a['cumulative-layout-shift']?.numericValue ?? null,
    inpMs: a['interaction-to-next-paint']?.numericValue ?? null,
    inpMode: a['interaction-to-next-paint']?.scoreDisplayMode ?? null,
    mainthreadWorkMs: a['mainthread-work-breakdown']?.numericValue ?? null,
    longTasks,
    runtimeError: lhr.runtimeError?.code ?? null,
  }
}

// ---------------------------------------------------------------------------
// Cell runner (one browser session per run)
// ---------------------------------------------------------------------------

function median(arr) {
  const v = arr.filter((x) => x !== null && Number.isFinite(x))
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function summarizeRuns(runs, keyFn) {
  const values = runs.map(keyFn)
  const s = [...values].filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b)
  return {
    median: round(median(values), 2),
    min: s.length ? round(s[0], 2) : null,
    max: s.length ? round(s[s.length - 1], 2) : null,
    n: s.length,
  }
}

async function runCell(app, dataset, flowKey) {
  const { lighthouse, puppeteer, chromePath } = app.env
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--enable-blink-features=EventTimingTracing',
    ],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport(VIEWPORT)
    const isA11y = flowKey === 'a11y'
    const config = {
      extends: 'lighthouse:default',
      settings: {
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1280, height: 800, deviceScaleFactor: 1 },
        throttlingMethod: 'provided',
        onlyCategories: isA11y ? ['accessibility'] : ['performance'],
      },
    }
    const url = `${app.url.replace(/\/$/, '')}/?dataset=${dataset}`
    const flow = await lighthouse.startFlow(page, { name: `${flowKey}@${dataset}`, config })
    const exp = expectedCounts(dataset)
    switch (flowKey) {
      case 'F1':
        await runF1(page, flow, url)
        break
      case 'F2':
        await runF2(page, flow, url, dataset)
        break
      case 'F3':
        await runF3(page, flow, url, dataset, exp)
        break
      case 'F4':
        await runF4(page, flow, url, dataset, exp)
        break
      case 'F5':
        await runF5(page, flow, url, dataset, exp)
        break
      case 'a11y':
        await runA11y(page, flow, url)
        break
      default:
        throw new Error(`unknown flow ${flowKey}`)
    }
    const flowResult = await flow.createFlowResult()
    const steps = flowResult.steps.map((s) =>
      s.lhr.gatherMode === 'navigation' ? extractNavStep(s.lhr) : extractTimespanStep(s.lhr),
    )
    return { steps, stepNames: steps.map((s) => s.name) }
  } finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const lh = findLighthouse()
if (!lh) {
  console.error('Lighthouse not found in npx cache. Run `npx lighthouse --version` once.')
  process.exit(1)
}
const puppeteer = require(lh.puppeteerCore)
const lighthouse = require(lh.core)

const servers = [
  await startStaticServer(REACT_DIST, REACT_PORT),
  await startStaticServer(ANGULAR_DIST, ANGULAR_PORT),
]
console.log(`Lighthouse ${lh.version} · puppeteer-core ${puppeteer.version || '?'} · lab: ${LAB}`)

// INP-capable shell discovery (see probeInpCapability): chrome-headless-shell
// versions differ in whether they emit EventTiming trace events with the flag
// (verified: 1208 emits, 1234 does not). Probe each cached version, pick the
// first (newest first) that yields numeric INP.
const shells = listHeadlessShells()
if (shells.length === 0) {
  console.error('chrome-headless-shell not found (Playwright cache).')
  process.exit(1)
}
const PROBE_PORT = 4299
const probeServer = await startStaticServer(REACT_DIST, PROBE_PORT)
const inpShellProbe = {}
let chromePath = null
for (const s of shells) {
  let inp = null
  try {
    inp = await probeInpCapability(s.path, PROBE_PORT)
  } catch (err) {
    inp = `error: ${err.message.slice(0, 80)}`
  }
  inpShellProbe[s.version] = inp
  console.log(`  shell ${s.version}: INP probe = ${inp === null ? 'notApplicable' : `${inp} ms`}`)
  if (inp !== null && typeof inp === 'number' && chromePath === null) {
    chromePath = s.path
  }
}
probeServer.close()
if (!chromePath) {
  console.error('No chrome-headless-shell with INP capability found.')
  process.exit(1)
}
console.log(`chrome-headless-shell elegido (INP): ${chromePath}`)
console.log(`servers: react :${REACT_PORT} · angular :${ANGULAR_PORT} · lab: ${LAB}`)

const apps = {
  react: {
    url: `http://127.0.0.1:${REACT_PORT}/`,
    key: 'react',
    env: { lighthouse, puppeteer, chromePath },
  },
  angular: {
    url: `http://127.0.0.1:${ANGULAR_PORT}/`,
    key: 'angular',
    env: { lighthouse, puppeteer, chromePath },
  },
}

// Build the cell list (flow x dataset x app x nRuns)
const cells = []
for (const dataset of F5_DATASETS) {
  for (const appKey of Object.keys(apps)) {
    if (CLI_APP && CLI_APP !== appKey) continue
    cells.push({ flow: 'F5', dataset, app: appKey, runs: RUNS })
  }
}
if (!CLI_DATASETS) {
  for (const extra of EXTRA_CELLS) {
    for (const dataset of extra.datasets) {
      for (const appKey of Object.keys(apps)) {
        if (CLI_APP && CLI_APP !== appKey) continue
        cells.push({
          flow: extra.flow,
          dataset,
          app: appKey,
          runs: extra.flow === 'a11y' ? A11Y_RUNS : RUNS,
        })
      }
    }
  }
}

// Merge with previous chunks (resumability) and reuse existing runs
let base = {}
if (existsSync(RESULTS_FILE)) {
  try {
    base = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
  } catch {
    base = {}
  }
}
const keyOf = (c) => `${c.flow}@${c.dataset}:${c.app}`
const allRuns = { ...(base.runs ?? {}) }

let skipped = 0
const executed = []
for (const cell of cells) {
  const key = keyOf(cell)
  const existing = allRuns[key]?.runs ?? []
  const needed = cell.runs - existing.length
  if (needed <= 0) {
    skipped += 1
    continue
  }
  const app = apps[cell.app]
  for (let i = 0; i < needed; i += 1) {
    console.log(
      `\n=== ${cell.flow} · dataset=${cell.dataset} · ${cell.app} · run ${i + 1}/${cell.runs} ===`,
    )
    const data = await runCell(app, cell.dataset, cell.flow)
    existing.push(data)
    const stepLine = data.steps
      .map(
        (s) =>
          `${s.gatherMode === 'navigation' ? 'nav' : 'ts'}[${s.name?.replace(/ /g, '_')}] perf=${s.performance ?? '—'} ${s.gatherMode === 'navigation' ? `FCP=${s.cwv['first-contentful-paint']?.toFixed(1)} LCP=${s.cwv['largest-contentful-paint']?.toFixed(1)} TBT=${s.cwv['total-blocking-time']?.toFixed(1)} CLS=${s.cwv['cumulative-layout-shift']?.toFixed(3)}` : `TBT=${s.tbtMs?.toFixed(1)} INP=${s.inpMs?.toFixed(1) ?? `n/a(${s.inpMode})`} CLS=${s.cls?.toFixed(3)} LT=${s.longTasks?.count ?? '?'}`}`,
      )
      .join(' | ')
    console.log(`  ${stepLine}`)
    allRuns[key] = { flow: cell.flow, dataset: cell.dataset, app: cell.app, runs: existing }
  }
  executed.push(key)
}
console.log(`\ncells: ${cells.length} (${executed.length} ejecutadas, ${skipped} reutilizadas)`)

for (const s of servers) s.close()

// ---------------------------------------------------------------------------
// Aggregation + comparison
// ---------------------------------------------------------------------------

const aggCell = (flowKey, dataset, appKey, metricKey, stepIdx, nav = false) => {
  const cell = allRuns[`${flowKey}@${dataset}:${appKey}`]
  if (!cell) return null
  const pick = (run) => {
    const step = run.steps[stepIdx]
    if (!step) return null
    if (nav) return step.cwv?.[metricKey] ?? null
    return step[metricKey] ?? null
  }
  return summarizeRuns(cell.runs, pick)
}

const flowMeta = {
  F5: { label: 'flujo end-to-end (nav + mount + combined + repeat)', stepCount: 4 },
  F1: { label: 'carga inicial (navigation)', stepCount: 1 },
  F2: { label: 'montaje de Tasks (timespan)', stepCount: 2 },
  F3: { label: 'búsqueda live (timespan)', stepCount: 2 },
  F4: { label: 'filtro combinado (timespan)', stepCount: 2 },
  a11y: { label: 'accesibilidad (navigation)', stepCount: 1 },
}

const summary = {}
for (const c of cells) {
  const { flow: flowKey, dataset, app } = c
  summary[`${flowKey}@${dataset}:${app}`] = {
    flow: flowKey,
    dataset,
    app,
    runs: allRuns[keyOf(c)]?.runs ?? [],
  }
}

// Per-flow aggregated comparison (React vs Angular)
const comparison = {}
for (const flowKey of ['F5', 'F1', 'F2', 'F3', 'F4']) {
  comparison[flowKey] = {}
  const datasets = [...new Set(cells.filter((c) => c.flow === flowKey).map((c) => c.dataset))].sort(
    (a, b) => a - b,
  )
  for (const dataset of datasets) {
    const stepCount = flowMeta[flowKey].stepCount
    const entry = { steps: [] }
    for (let s = 0; s < stepCount; s += 1) {
      const step = { react: {}, angular: {} }
      if (flowKey === 'F1' || (flowKey === 'F5' && s === 0)) {
        for (const m of [
          'first-contentful-paint',
          'largest-contentful-paint',
          'total-blocking-time',
          'cumulative-layout-shift',
          'speed-index',
        ]) {
          step.react[m] = aggCell(flowKey, dataset, 'react', m, s, true)
          step.angular[m] = aggCell(flowKey, dataset, 'angular', m, s, true)
        }
        step.react.performance = aggCell(flowKey, dataset, 'react', 'performance', s)
        step.angular.performance = aggCell(flowKey, dataset, 'angular', 'performance', s)
      } else {
        for (const m of ['tbtMs', 'cls', 'inpMs', 'mainthreadWorkMs']) {
          step.react[m] = aggCell(flowKey, dataset, 'react', m, s)
          step.angular[m] = aggCell(flowKey, dataset, 'angular', m, s)
        }
        step.react.performance = aggCell(flowKey, dataset, 'react', 'performance', s)
        step.angular.performance = aggCell(flowKey, dataset, 'angular', 'performance', s)
        const ltR = allRuns[`${flowKey}@${dataset}:react`]?.runs?.map(
          (r) => r.steps[s]?.longTasks?.count ?? null,
        )
        const ltA = allRuns[`${flowKey}@${dataset}:angular`]?.runs?.map(
          (r) => r.steps[s]?.longTasks?.count ?? null,
        )
        step.react.longTasks = summarizeRuns(ltR ?? [], (x) => x)
        step.angular.longTasks = summarizeRuns(ltA ?? [], (x) => x)
      }
      entry.steps.push(step)
    }
    comparison[flowKey][dataset] = entry
  }
}

// Accessibility summary (a11y cells)
const accessibility = {}
for (const appKey of ['react', 'angular']) {
  const cell = allRuns[`a11y@500:${appKey}`]
  const scores = (cell?.runs ?? []).map((r) => r.steps[0]?.accessibility ?? null)
  accessibility[appKey] = {
    score: summarizeRuns(scores, (x) => x),
    n: (cell?.runs ?? []).length,
  }
}

const git = (args) => {
  try {
    return execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}
import { execFileSync } from 'node:child_process'

const result = {
  experiment: 'lighthouse-user-flows-phase10',
  capturedAt: new Date().toISOString(),
  objective:
    'Validar si las diferencias de bajo nivel de Fases 7-9 (coste de montaje, trabajo síncrono incremental, long tasks) se traducen en métricas de rendimiento percibido (LCP / TBT / INP / CLS / score) medidas con Lighthouse User Flows sobre interacciones reales (input de confianza) en los builds del laboratorio Fase 9 (10 features + scale-dataset), datasets 30-3000. Evaluar H47-H52.',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCores: cpus().length,
    memoryBytes: totalmem(),
    lighthouseVersion: lh.version,
    lighthouseCore: lh.core,
    puppeteerCoreVersion: puppeteer.version ?? 'unknown',
    chromePath,
    chromeFlag:
      '--enable-blink-features=EventTimingTracing (requerido para INP: sin él el audit interaction-to-next-paint es notApplicable en chrome-headless-shell, verificado experimentalmente)',
    inpShellProbe,
    inpShellNote:
      'La capacidad INP difiere entre versiones de chrome-headless-shell (verificado: 1208 emite EventTiming, 1234 no). El script sondea cada versión en caché y elige la primera (de más reciente a más antigua) con INP numérico.',
    labPath: LAB,
    labHeadCommit: git(['rev-parse', 'HEAD']),
    note: 'chrome-headless-shell (Chrome for Testing) es el único navegador headless funcional en este entorno (Fases 4.1/5.1/5.9/7/9). Builds del laboratorio Fase 9 (mismos que Fases 9-9.3): React y Angular con 10 features de catálogo + scale-dataset; los monoliths oficiales (233 547 B / 179 634 B) no soportan datasets > 30 y se verifican intactos en el repositorio. Copia aislada en /tmp; el árbol principal no se modifica.',
  },
  method: {
    summary:
      'Lighthouse User Flows (API programática, lighthouse core + puppeteer-core desde el caché npx) sobre chrome-headless-shell. Perfil desktop, viewport 1280x800, throttlingMethod "provided" (SIN throttling simulado: los user flows miden latencia de interacción real; difiere del móvil simulado de Fase 5.9 — comparaciones con 5.9 solo contextuales). Configuración: onlyCategories performance (accesibilidad en celdas a11y). Interacciones con input de confianza (page.click/type/select) — necesario para INP (los dispatchEvent no confiados no generan interactionId). Flujos: F1 navigate (carga inicial); F2 timespan Projects->Tasks (montaje completo N filas); F3 timespan búsqueda "incident"; F4 timespan search+status+priority; F5 flujo completo navigate + mount + combined + interacción repetida (priority high->low); a11y navigate solo categoría accesibilidad. Esperas deterministas por conteo de filas (regla scale-dataset validada en Fases 9.2/9.3). Settles post-commit dentro del timespan (150-250 ms) para capturar el next-paint de las interacciones (INP). RUNS=3 por celda (1 en --quick), sesión de navegador nueva por run; celdas ya presentes en el JSON se reutilizan (idempotencia/recuperación); resumible con --datasets= y --app=.',
    viewport: VIEWPORT,
    datasets: {
      F5: F5_DATASETS,
      extras: EXTRA_CELLS.map((e) => `${e.flow}@${e.datasets.join(',')}`),
    },
    runsPerCell: RUNS,
    throttling: 'provided (sin throttling simulado; documentado)',
    flows: Object.fromEntries(Object.entries(flowMeta).map(([k, v]) => [k, v.label])),
    metrics: [
      'navigation: performance score, FCP, LCP, SI, TBT, CLS, TTI (audits de Lighthouse)',
      'timespan: performance score, TBT, CLS, INP (interaction-to-next-paint; requiere EventTimingTracing), main-thread-work, long tasks (derivadas de main-thread-tasks; el audit long-tasks es notApplicable en timespan v13)',
      'a11y: accessibility score + audits fallidos',
    ],
    inpHypothesis:
      'INP solo se mide en tiempos de interacción con input de confianza; los dispatchEvent programáticos (Fases 7-9) no cuentan como interacciones para INP.',
    note: 'La comparación válida es React vs Angular dentro de esta misma fase (mismo harness, mismos flujos, mismos datasets). Comparaciones de magnitud con Fases 7-9 solo como contexto de direccionalidad (harness distinto: CDP directo vs Lighthouse).',
  },
  runs: allRuns,
  comparison,
  accessibility,
  limitations: [
    'Mediciones en localhost sin throttling; no representan condiciones de campo ni dispositivos móviles (perfil desktop).',
    'INP requiere input de confianza y el flag --enable-blink-features=EventTimingTracing en chrome-headless-shell; sin el flag el audit es notApplicable (verificado).',
    'El audit long-tasks es notApplicable en modo timespan (Lighthouse v13); el conteo de long tasks se deriva de main-thread-tasks (items > 50 ms).',
    'El timespan CLS mide desplazamientos durante la interacción (cambio de la lista), no el CLS de página; la semántica difiere del CLS de Fase 5.9.',
    'El typing (page.type) dispara N interacciones; INP es la peor de ellas (semántica correcta de INP).',
    'Los builds son los del laboratorio Fase 9 (10 features + scale-dataset), no los monoliths oficiales de Fase 5 (que no soportan datasets > 30); los bundles oficiales se verifican intactos.',
    'La navegación SPA no es una navegación de página: F2/F3/F4 usan timespan sobre la sección Tasks; F1 mide la carga inicial (Dashboard, que agrega el dataset y por tanto escala con N).',
    'Una máquina local; resultados indicativos, no benchmark científico (metrics.md §1).',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== COMPARACIÓN (mediana) ===')
for (const flowKey of ['F5', 'F1', 'F2', 'F3', 'F4']) {
  console.log(`\n-- ${flowKey} --`)
  for (const [dataset, entry] of Object.entries(comparison[flowKey]).sort((a, b) => a - b)) {
    for (let s = 0; s < entry.steps.length; s += 1) {
      const step = entry.steps[s]
      const isNav = flowKey === 'F1' || (flowKey === 'F5' && s === 0)
      const label = isNav ? 'nav' : 'ts'
      const r = step.react
      const a = step.angular
      if (isNav) {
        console.log(
          `  ${dataset} ${label}${s} perf R=${r.performance?.median} A=${a.performance?.median} · LCP R=${r['largest-contentful-paint']?.median} A=${a['largest-contentful-paint']?.median} ms · TBT R=${r['total-blocking-time']?.median} A=${a['total-blocking-time']?.median} ms`,
        )
      } else {
        console.log(
          `  ${dataset} ${label}${s} perf R=${r.performance?.median} A=${a.performance?.median} · TBT R=${r.tbtMs?.median} A=${a.tbtMs?.median} ms · INP R=${r.inpMs?.median} A=${a.inpMs?.median} ms · CLS R=${r.cls?.median} A=${a.cls?.median} · LT R=${r.longTasks?.median} A=${a.longTasks?.median}`,
        )
      }
    }
  }
}
console.log('\n=== ACCESIBILIDAD (500) ===')
for (const appKey of ['react', 'angular']) {
  console.log(
    `  ${appKey}: score ${accessibility[appKey].score?.median} (n=${accessibility[appKey].n})`,
  )
}
console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
