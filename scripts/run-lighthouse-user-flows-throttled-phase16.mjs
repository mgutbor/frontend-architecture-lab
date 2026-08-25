#!/usr/bin/env node
// Lighthouse User Flows under CPU throttling (Fase 16).
//
// Closes the bridge between the Fase 15 CDP findings (sync work -> commit
// duration under throttling) and user-perceived Lighthouse metrics (INP /
// TBT / main-thread work / long tasks) measured over REAL interactions
// (trusted input) with CPU throttling applied via CDP
// (Emulation.setCPUThrottlingRate) on the same chrome-headless-shell the
// Fase 10 harness uses.
//
// Reuses the Fase 10 Lighthouse User Flows infrastructure (lighthouse core +
// puppeteer-core from the npx cache; chrome-headless-shell with
// --enable-blink-features=EventTimingTracing probed for INP capability) and
// the Fase 15 CPU budgets (1x / 4x / 6x) and datasets (300..3000) on the
// Fase 9 chain apps (10 features + scale-dataset, ?dataset=N) of the
// /tmp/lab-phase15 copy.
//
// Scenarios (same protocol as Fases 9.1/9.2/9.3 and Fase 15):
//   S1  mount      timespan: Projects -> Tasks, wait full list (N rows)
//   S4  incremental timespan: search 'incident' + status in-progress +
//                  priority high in one interaction batch
//   E2E end-to-end navigate + mount timespan + combined timespan +
//                  repeated interaction timespan (priority high -> low)
//   a11y           navigation step, onlyCategories accessibility
//
// Metrics per step: navigation -> performance score, FCP, LCP, SI, TBT, CLS;
// timespan -> performance score, TBT, CLS, INP (interaction-to-next-paint),
// main-thread-work, long tasks (derived from main-thread-tasks > 50 ms; the
// long-tasks audit is notApplicable in timespan mode).
//
// CPU throttling: Emulation.setCPUThrottlingRate set on the page CDP session
// BEFORE the flow starts; Lighthouse runs with throttlingMethod 'provided'
// (no simulated throttling) so the measured values reflect the real CDP
// throttle. Rates 1x / 4x / 6x (real DevTools Protocol throttling, NOT
// artificial sleeps; Fase 15 protocol).
//
// Matrix (priority per Fase 16 spec, since Lighthouse runs are expensive):
//   1x: 500, 1000, 2000, 3000
//   4x: 500, 1000, 1500, 2000, 3000
//   6x: 300, 500, 750, 1000, 1500, 2000, 3000
// n = 3 runs per cell (--iter), fresh browser session per run. Resumable:
// --scenario= / --cpu= / --datasets= / --app= filters; cells already present
// with enough runs are reused.
//
// Zero NEW runtime dependencies: same npx-cache lighthouse + puppeteer-core
// and Playwright-cache chrome-headless-shell as Fase 10.
//
// Usage:
//   node scripts/run-lighthouse-user-flows-throttled-phase16.mjs [LAB] [--quick]
//     [--scenario=S1,S4,E2E,a11y] [--cpu=1,4,6] [--datasets=500,1000] [--app=react] [--iter=3]
// Output: docs/experiments/results/lighthouse-user-flows-throttled-phase16.json

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { cpus, totalmem, homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { prettierJson } from './analyze-bundle.mjs'

const require = createRequire(import.meta.url)
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'lighthouse-user-flows-throttled-phase16.json')

const LAB =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/lab-phase15'
const QUICK = process.argv.includes('--quick')

const CLI_LIST = (flag, fallback, fn = (x) => x) => {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`))
  return arg ? arg.split('=')[1].split(',').map(fn) : fallback
}
const CLI_SCENARIOS = CLI_LIST('scenario', null)
const CLI_CPU = CLI_LIST('cpu', null, Number)
const CLI_DATASETS = CLI_LIST('datasets', null, Number)
const CLI_APP = CLI_LIST('app', null)
const CLI_ITER = (() => {
  const arg = process.argv.find((a) => a.startsWith('--iter='))
  return arg ? Number(arg.split('=')[1]) : null
})()

const RESUMABLE =
  process.argv.some((a) => a.startsWith('--scenario=')) ||
  process.argv.some((a) => a.startsWith('--cpu=')) ||
  process.argv.some((a) => a.startsWith('--datasets=')) ||
  process.argv.some((a) => a.startsWith('--app='))

if (!existsSync(join(LAB, 'package.json'))) {
  console.error(`Copia experimental no encontrada: ${LAB}`)
  process.exit(1)
}

const REACT_DIST = join(LAB, 'apps/react-app/dist')
const ANGULAR_DIST = join(LAB, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4251
const ANGULAR_PORT = 4252
const PROBE_PORT = 4298

const RUNS = CLI_ITER ?? (QUICK ? 1 : 3)
const VIEWPORT = { width: 1280, height: 800 }

// Priority matrix (Fase 16 spec): full matrix (300..3000 x 1/4/6) is
// attempted when cheap; the default below is the prioritized subset.
const PRIORITY_MATRIX = {
  1: [500, 1000, 2000, 3000],
  4: [500, 1000, 1500, 2000, 3000],
  6: [300, 500, 750, 1000, 1500, 2000, 3000],
}
const FULL_DATASETS = [300, 500, 750, 1000, 1500, 2000, 3000]
const CPU_RATES = CLI_CPU ?? (QUICK ? [1, 4] : [1, 4, 6])

// Full matrix if explicitly requested with --datasets=all; otherwise the
// per-rate priority subsets.
const WANT_FULL = process.argv.includes('--full')
const SCENARIOS = CLI_SCENARIOS ?? (QUICK ? ['S4'] : ['S1', 'S4', 'E2E'])
const DATASET_SETS = {}
for (const rate of CPU_RATES) {
  DATASET_SETS[rate] =
    CLI_DATASETS ?? (WANT_FULL || QUICK ? (QUICK ? [500] : FULL_DATASETS) : PRIORITY_MATRIX[rate])
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (v, d = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null

// ---------------------------------------------------------------------------
// Environment discovery (same as Fase 10: npx lighthouse + Playwright shell)
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
// Static server
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
// Expected counts (same generation rule as Fases 9.1-9.3 / 15)
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

async function waitRows(page, count, timeoutMs = 120000) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('.task-list li').length === n,
    { timeout: timeoutMs },
    count,
  )
}

// CPU throttling is applied BOTH before the flow starts (covers the
// navigation step) and re-applied after every flow.navigate() — Lighthouse's
// driver resets emulation when it performs the navigation, so a single
// pre-flow setCPUThrottlingRate is lost (verified empirically in this
// phase). Re-applying after each navigate keeps the timespans (the measured
// interactions) under the requested budget.
async function setThrottle(client, rate) {
  await client.send('Emulation.setCPUThrottlingRate', { rate }).catch(() => {})
}

async function runS1(page, flow, url, N, client, rate) {
  await flow.navigate(url, { name: 'S1 load' })
  await setThrottle(client, rate)
  await clickNav(page, 'Projects')
  await page.waitForSelector('main section[aria-label="Projects"]')
  await sleep(150)
  await flow.startTimespan({ name: 'S1 mount tasks' })
  await clickNav(page, 'Tasks')
  await waitRows(page, N)
  await sleep(250)
  await flow.endTimespan()
}

async function runS4(page, flow, url, N, exp, client, rate) {
  await flow.navigate(url, { name: 'S1 load' })
  await setThrottle(client, rate)
  await clickNav(page, 'Projects')
  await page.waitForSelector('main section[aria-label="Projects"]')
  await clickNav(page, 'Tasks')
  await waitRows(page, N)
  await sleep(150)
  await flow.startTimespan({ name: 'S4 combined' })
  await page.click('#task-search')
  await page.type('#task-search', 'incident')
  await page.select('#task-status-filter', 'in-progress')
  await page.select('#task-priority-filter', 'high')
  await waitRows(page, exp.combined)
  await sleep(150)
  await flow.endTimespan()
}

async function runE2E(page, flow, url, N, exp, client, rate) {
  await flow.navigate(url, { name: 'S1 load' })
  await setThrottle(client, rate)
  await clickNav(page, 'Projects')
  await page.waitForSelector('main section[aria-label="Projects"]')
  await sleep(150)
  await flow.startTimespan({ name: 'E2E mount tasks' })
  await clickNav(page, 'Tasks')
  await waitRows(page, N)
  await sleep(250)
  await flow.endTimespan()
  await flow.startTimespan({ name: 'E2E combined' })
  await page.click('#task-search')
  await page.type('#task-search', 'incident')
  await page.select('#task-status-filter', 'in-progress')
  await page.select('#task-priority-filter', 'high')
  await waitRows(page, exp.combined)
  await sleep(150)
  await flow.endTimespan()
  await flow.startTimespan({ name: 'E2E repeat interaction' })
  await page.select('#task-priority-filter', 'low')
  await waitRows(page, exp.combinedLow)
  await sleep(150)
  await flow.endTimespan()
}

async function runA11y(page, flow, url, client, rate) {
  await flow.navigate(url, { name: 'a11y load' })
  await setThrottle(client, rate)
}

// ---------------------------------------------------------------------------
// Step extraction (same as Fase 10)
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
// Cell runner (fresh browser per run; CPU throttle set before the flow)
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

function stats(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x))
  if (v.length === 0) return { n: 0, median: null, min: null, max: null, p95: null, stdev: null }
  const s = [...v].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  const p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  const sq = s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length
  return {
    n: v.length,
    median: round(median),
    min: round(s[0]),
    max: round(s[s.length - 1]),
    p95: round(p95),
    stdev: round(Math.sqrt(sq)),
  }
}

async function runCell(app, dataset, flowKey, cpuRate) {
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
  const t0 = Date.now()
  try {
    const page = await browser.newPage()
    await page.setViewport(VIEWPORT)
    // Real CPU throttling via CDP (Fase 15 protocol), applied BEFORE the
    // flow starts so navigation + timespans run under the same budget.
    const client = await page.createCDPSession()
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
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
    const flow = await lighthouse.startFlow(page, {
      name: `${flowKey}@${dataset}@${cpuRate}x`,
      config,
    })
    const exp = expectedCounts(dataset)
    switch (flowKey) {
      case 'S1':
        await runS1(page, flow, url, dataset, client, cpuRate)
        break
      case 'S4':
        await runS4(page, flow, url, dataset, exp, client, cpuRate)
        break
      case 'E2E':
        await runE2E(page, flow, url, dataset, exp, client, cpuRate)
        break
      case 'a11y':
        await runA11y(page, flow, url, client, cpuRate)
        break
      default:
        throw new Error(`unknown flow ${flowKey}`)
    }
    const flowResult = await flow.createFlowResult()
    const steps = flowResult.steps.map((s) =>
      s.lhr.gatherMode === 'navigation' ? extractNavStep(s.lhr) : extractTimespanStep(s.lhr),
    )
    return {
      steps,
      stepNames: steps.map((s) => s.name),
      wallMs: round(Date.now() - t0),
      runtimeError: steps.find((s) => s.runtimeError)?.runtimeError ?? null,
    }
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

const shells = listHeadlessShells()
if (shells.length === 0) {
  console.error('chrome-headless-shell not found (Playwright cache).')
  process.exit(1)
}
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
  if (inp !== null && typeof inp === 'number' && chromePath === null) chromePath = s.path
}
probeServer.close()
if (!chromePath) {
  console.error('No chrome-headless-shell with INP capability found.')
  process.exit(1)
}
console.log(`chrome-headless-shell elegido (INP): ${chromePath}`)

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

// Build the cell list
const cells = []
for (const rate of CPU_RATES) {
  for (const dataset of DATASET_SETS[rate]) {
    for (const flowKey of SCENARIOS) {
      for (const appKey of Object.keys(apps)) {
        if (CLI_APP && !CLI_APP.includes(appKey)) continue
        cells.push({ flow: flowKey, dataset, rate, app: appKey, runs: RUNS })
      }
    }
  }
}

// Resumability: merge with previous chunks
let base = {}
if (existsSync(RESULTS_FILE)) {
  try {
    base = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
  } catch {
    base = {}
  }
}
const keyOf = (c) => `${c.flow}@${c.dataset}@${c.rate}x:${c.app}`
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
      `\n=== ${cell.flow} · dataset=${cell.dataset} · ${cell.rate}x · ${cell.app} · run ${i + 1}/${cell.runs} ===`,
    )
    const data = await runCell(app, cell.dataset, cell.flow, cell.rate)
    existing.push(data)
    const stepLine = data.steps
      .map((s) =>
        s.gatherMode === 'navigation'
          ? `nav[${s.name?.replace(/ /g, '_')}] perf=${s.performance ?? '—'} LCP=${s.cwv['largest-contentful-paint']?.toFixed(1)} TBT=${s.cwv['total-blocking-time']?.toFixed(1)}`
          : `ts[${s.name?.replace(/ /g, '_')}] TBT=${s.tbtMs?.toFixed(1)} INP=${s.inpMs?.toFixed(1) ?? `n/a(${s.inpMode})`} MTW=${s.mainthreadWorkMs?.toFixed(0)} LT=${s.longTasks?.count ?? '?'}`,
      )
      .join(' | ')
    console.log(`  ${stepLine} (${data.wallMs}ms wall)`)
    allRuns[key] = {
      flow: cell.flow,
      dataset: cell.dataset,
      rate: cell.rate,
      app: cell.app,
      runs: existing,
    }
  }
  executed.push(key)
}
console.log(`\ncells: ${cells.length} (${executed.length} ejecutadas, ${skipped} reutilizadas)`)

for (const s of servers) s.close()

// ---------------------------------------------------------------------------
// Aggregation + comparison
// ---------------------------------------------------------------------------

const aggCell = (flowKey, dataset, rate, appKey, metricKey, stepIdx, nav = false) => {
  const cell = allRuns[`${flowKey}@${dataset}@${rate}x:${appKey}`]
  if (!cell) return null
  const pick = (run) => {
    const step = run.steps[stepIdx]
    if (!step) return null
    if (nav) return step.cwv?.[metricKey] ?? null
    return step[metricKey] ?? null
  }
  return summarizeRuns(cell.runs, pick)
}

// Scenario -> step layout:
//   S1:  [0]=nav load, [1]=timespan mount
//   S4:  [0]=nav load, [1]=timespan combined
//   E2E: [0]=nav load, [1]=ts mount, [2]=ts combined, [3]=ts repeat
const flowMeta = {
  S1: { label: 'montaje de Tasks (timespan)', tsSteps: [1], navSteps: [0] },
  S4: { label: 'filtro combinado (timespan)', tsSteps: [1], navSteps: [0] },
  E2E: {
    label: 'flujo end-to-end (nav + mount + combined + repeat)',
    tsSteps: [1, 2, 3],
    navSteps: [0],
  },
  a11y: { label: 'accesibilidad (navigation)', tsSteps: [], navSteps: [0] },
}

const summary = {}
for (const c of cells) summary[keyOf(c)] = { ...c, runs: allRuns[keyOf(c)]?.runs ?? [] }

const comparison = {}
for (const flowKey of SCENARIOS) {
  if (flowKey === 'a11y') continue
  comparison[flowKey] = {}
  const rates = [...new Set(cells.filter((c) => c.flow === flowKey).map((c) => c.rate))].sort(
    (a, b) => a - b,
  )
  for (const rate of rates) {
    comparison[flowKey][rate] = {}
    const datasets = [
      ...new Set(cells.filter((c) => c.flow === flowKey && c.rate === rate).map((c) => c.dataset)),
    ].sort((a, b) => a - b)
    for (const dataset of datasets) {
      const entry = { steps: [] }
      const stepCount = Math.max(...flowMeta[flowKey].tsSteps, ...flowMeta[flowKey].navSteps) + 1
      for (let s = 0; s < stepCount; s += 1) {
        const step = { react: {}, angular: {} }
        const isNav = flowMeta[flowKey].navSteps.includes(s)
        if (isNav) {
          for (const m of [
            'first-contentful-paint',
            'largest-contentful-paint',
            'total-blocking-time',
            'cumulative-layout-shift',
            'speed-index',
          ]) {
            step.react[m] = aggCell(flowKey, dataset, rate, 'react', m, s, true)
            step.angular[m] = aggCell(flowKey, dataset, rate, 'angular', m, s, true)
          }
          step.react.performance = aggCell(flowKey, dataset, rate, 'react', 'performance', s)
          step.angular.performance = aggCell(flowKey, dataset, rate, 'angular', 'performance', s)
        } else if (flowMeta[flowKey].tsSteps.includes(s)) {
          for (const m of ['tbtMs', 'cls', 'inpMs', 'mainthreadWorkMs']) {
            step.react[m] = aggCell(flowKey, dataset, rate, 'react', m, s)
            step.angular[m] = aggCell(flowKey, dataset, rate, 'angular', m, s)
          }
          step.react.performance = aggCell(flowKey, dataset, rate, 'react', 'performance', s)
          step.angular.performance = aggCell(flowKey, dataset, rate, 'angular', 'performance', s)
          const ltR = allRuns[`${flowKey}@${dataset}@${rate}x:react`]?.runs?.map(
            (r) => r.steps[s]?.longTasks?.count ?? null,
          )
          const ltA = allRuns[`${flowKey}@${dataset}@${rate}x:angular`]?.runs?.map(
            (r) => r.steps[s]?.longTasks?.count ?? null,
          )
          step.react.longTasks = summarizeRuns(ltR ?? [], (x) => x)
          step.angular.longTasks = summarizeRuns(ltA ?? [], (x) => x)
          step.react.wallMs = summarizeRuns(
            allRuns[`${flowKey}@${dataset}@${rate}x:react`]?.runs ?? [],
            (r) => r.wallMs,
          )
          step.angular.wallMs = summarizeRuns(
            allRuns[`${flowKey}@${dataset}@${rate}x:angular`]?.runs ?? [],
            (r) => r.wallMs,
          )
        }
        entry.steps.push(step)
      }
      comparison[flowKey][rate][dataset] = entry
    }
  }
}

// Accessibility summary (a11y cells per rate/dataset measured)
const accessibility = {}
for (const rate of CPU_RATES) {
  for (const dataset of DATASET_SETS[rate] ?? []) {
    const key = `${dataset}@${rate}x`
    if (!accessibility[key]) accessibility[key] = {}
    for (const appKey of ['react', 'angular']) {
      const cell = allRuns[`a11y@${dataset}@${rate}x:${appKey}`]
      const scores = (cell?.runs ?? []).map((r) => r.steps[0]?.accessibility ?? null)
      accessibility[key][appKey] = {
        score: summarizeRuns(scores, (x) => x),
        failedAudits: (cell?.runs ?? [])[0]?.steps[0]?.failedA11yAudits ?? null,
        n: (cell?.runs ?? []).length,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Threshold analysis (INP > 100/200 ms; TBT; LT) per scenario/rate/framework
// ---------------------------------------------------------------------------

const thresholds = {}
for (const flowKey of ['S1', 'S4', 'E2E']) {
  thresholds[flowKey] = {}
  for (const rate of CPU_RATES) {
    thresholds[flowKey][rate] = { react: {}, angular: {} }
    const datasets = [
      ...new Set(cells.filter((c) => c.flow === flowKey && c.rate === rate).map((c) => c.dataset)),
    ].sort((a, b) => a - b)
    for (const dataset of datasets) {
      const entry = comparison[flowKey]?.[rate]?.[dataset]
      if (!entry) continue
      for (const fw of ['react', 'angular']) {
        // worst INP across the scenario's timespan steps
        const inpVals = flowMeta[flowKey].tsSteps
          .map((s) => entry.steps[s]?.[fw]?.inpMs?.median)
          .filter((x) => x !== null && x !== undefined)
        const tbtVals = flowMeta[flowKey].tsSteps
          .map((s) => entry.steps[s]?.[fw]?.tbtMs?.median)
          .filter((x) => x !== null && x !== undefined)
        const ltVals = flowMeta[flowKey].tsSteps
          .map((s) => entry.steps[s]?.[fw]?.longTasks?.median)
          .filter((x) => x !== null && x !== undefined)
        thresholds[flowKey][rate][fw][dataset] = {
          inpMedian: inpVals.length ? round(Math.max(...inpVals)) : null,
          tbtMedian: tbtVals.length ? round(Math.max(...tbtVals)) : null,
          ltMedian: ltVals.length ? round(Math.max(...ltVals)) : null,
          inpGt100: inpVals.length ? Math.max(...inpVals) > 100 : null,
          inpGt200: inpVals.length ? Math.max(...inpVals) > 200 : null,
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Comparison with Fase 15 (same scenario/dataset/rate semantics; harnesses
// differ: CDP direct vs Lighthouse — directional, not absolute)
// ---------------------------------------------------------------------------

let phase15 = null
try {
  phase15 = JSON.parse(readFileSync(join(RESULTS_DIR, 'cpu-throttling-phase15.json'), 'utf8'))
} catch {
  phase15 = null
}

const phase15Comparison = { available: phase15 !== null }
if (phase15) {
  phase15Comparison.note =
    'Comparación direccional Fase 15 (CDP directo) vs Fase 16 (Lighthouse User Flows). Los harnesses difieren: los valores absolutos no son comparables, solo la dirección del efecto por dataset/rate. S4 Fase 15 = duración/sync; Fase 16 = INP/TBT del timespan combinado.'
  phase15Comparison.cells = {}
  for (const rate of [1, 4, 6]) {
    for (const dataset of [300, 500, 750, 1000, 1500, 2000, 3000]) {
      const p15 = phase15.results?.S4?.[dataset]?.[rate]
      const f16 = comparison.S4?.[rate]?.[dataset]?.steps?.[1]
      if (!p15 || !f16) continue
      phase15Comparison.cells[`S4@${dataset}@${rate}x`] = {
        phase15: {
          reactDuration: p15.react?.duration?.median ?? null,
          angularDuration: p15.angular?.duration?.median ?? null,
          reactSync: p15.react?.sync?.median ?? null,
          angularSync: p15.angular?.sync?.median ?? null,
          reactLT: p15.react?.longTaskCount?.sum ?? null,
          angularLT: p15.angular?.longTaskCount?.sum ?? null,
        },
        phase16: {
          reactInp: f16.react?.inpMs?.median ?? null,
          angularInp: f16.angular?.inpMs?.median ?? null,
          reactTbt: f16.react?.tbtMs?.median ?? null,
          angularTbt: f16.angular?.tbtMs?.median ?? null,
          reactMtw: f16.react?.mainthreadWorkMs?.median ?? null,
          angularMtw: f16.angular?.mainthreadWorkMs?.median ?? null,
          reactLT: f16.react?.longTasks?.median ?? null,
          angularLT: f16.angular?.longTasks?.median ?? null,
        },
      }
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
  experiment: 'lighthouse-user-flows-throttled-phase16',
  capturedAt: new Date().toISOString(),
  objective:
    'Cerrar el puente Fase 15 -> métricas de usuario: determinar si el trabajo incremental de React que se vuelve visible bajo CPU throttling (sync -> duración de commit, Fase 15) se traduce en diferencias medibles de INP/TBT/main-thread work/long tasks con Lighthouse User Flows, y a partir de qué dataset. Evaluar H101-H110.',
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
      '--enable-blink-features=EventTimingTracing (requerido para INP en chrome-headless-shell)',
    inpShellProbe,
    labPath: LAB,
    labHeadCommit: git(['rev-parse', 'HEAD']),
    cpuRates: CPU_RATES,
    note: 'Reutiliza el lab de Fase 15 (/tmp/lab-phase15, S0 = 10 features + scale-dataset). El árbol principal no se modifica; los bundles oficiales quedan intactos.',
  },
  method: {
    summary:
      'Lighthouse User Flows (lighthouse core + puppeteer-core desde el caché npx) sobre chrome-headless-shell (probe INP). Perfil desktop, viewport 1280x800, throttlingMethod "provided" (Lighthouse NO aplica throttling simulado; el throttling real se aplica vía CDP Emulation.setCPUThrottlingRate 1x/4x/6x ANTES del flujo, protocolo Fase 15). Interacciones con input de confianza (page.click/type/select — necesarias para INP). Escenarios S1 (mount Projects->Tasks, N filas), S4 (search incident + status in-progress + priority high), E2E (mount + combined + repeat priority high->low), a11y (navigation, solo categoría accesibilidad). Esperas deterministas por conteo de filas (regla scale-dataset validada en Fases 9.2/9.3/15). Settles post-commit dentro del timespan (150-250 ms). RUNS=3 por celda (--iter), sesión de navegador nueva por run; celdas ya presentes en el JSON se reutilizan (idempotencia/recuperación); resumible con --scenario=/--cpu=/--datasets=/--app=.',
    viewport: VIEWPORT,
    datasetsByRate: DATASET_SETS,
    cpuRates: CPU_RATES,
    runsPerCell: RUNS,
    throttling:
      'CDP Emulation.setCPUThrottlingRate (1x/4x/6x); throttlingMethod provided en Lighthouse. Throttling REAL de CPU, no sleeps artificiales (protocolo Fase 15).',
    flows: Object.fromEntries(Object.entries(flowMeta).map(([k, v]) => [k, v.label])),
    metrics: [
      'navigation: performance score, FCP, LCP, SI, TBT, CLS (audits de Lighthouse)',
      'timespan: performance score, TBT, CLS, INP (interaction-to-next-paint), main-thread-work, long tasks (>50 ms derivadas de main-thread-tasks; el audit long-tasks es notApplicable en timespan v13)',
      'a11y: accessibility score + audits fallidos',
    ],
    note: 'La comparación válida es React vs Angular dentro de esta fase (mismo harness, mismos flujos, mismos datasets, mismo rate). Comparaciones con Fase 15 solo direccionales (harness distinto: CDP directo vs Lighthouse).',
  },
  runs: allRuns,
  comparison,
  accessibility,
  thresholds,
  phase15Comparison,
  limitations: [
    'Mediciones en localhost, una máquina, un navegador (chrome-headless-shell); no representan dispositivos móviles ni hardware real (throttling de CPU simulado por DevTools Protocol, no hardware).',
    'INP requiere input de confianza y el flag EventTimingTracing; la capacidad INP difiere entre versiones de chrome-headless-shell (probe previo).',
    'El audit long-tasks es notApplicable en modo timespan (Lighthouse v13); el conteo de long tasks se deriva de main-thread-tasks (>50 ms).',
    'El typing (page.type) dispara N interacciones; INP es la peor de ellas (semántica correcta de INP).',
    'Lighthouse añade overhead de traza sobre la medición (Fase 9.3): overhead conocido, aplicado por igual a ambos frameworks (documentado; no se usan métricas contaminadas para afirmar diferencias pequeñas).',
    'El throttling CDP 4x/6x NO es equivalente exacto a un dispositivo físico; solo orden de magnitud.',
    'Matriz priorizada (1x: 500-3000; 4x: 500-3000; 6x: 300-3000) por coste de Lighthouse; la matriz completa 300/750/1500 en 1x/4x no está medida salvo --full.',
    'Una máquina local; resultados indicativos, no benchmark científico.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

console.log('\n=== COMPARACIÓN (mediana) ===')
for (const flowKey of ['S1', 'S4', 'E2E']) {
  console.log(`\n-- ${flowKey} --`)
  for (const rate of CPU_RATES) {
    const byRate = comparison[flowKey]?.[rate]
    if (!byRate) continue
    for (const [dataset, entry] of Object.entries(byRate).sort((a, b) => a - b)) {
      const ts =
        entry.steps.find((s) => s.react?.inpMs !== undefined && s.react?.inpMs !== null) ??
        entry.steps[entry.steps.length - 1]
      const r = ts?.react
      const a = ts?.angular
      if (!r || !a) continue
      console.log(
        `  ${dataset} ${rate}x ts TBT R=${r.tbtMs?.median} A=${a.tbtMs?.median} · INP R=${r.inpMs?.median} A=${a.inpMs?.median} ms · MTW R=${r.mainthreadWorkMs?.median} A=${a.mainthreadWorkMs?.median} · LT R=${r.longTasks?.median} A=${a.longTasks?.median}`,
      )
    }
  }
}
console.log('\\n=== ACCESIBILIDAD ===')
for (const [key, entry] of Object.entries(accessibility)) {
  console.log(
    `  ${key}: react=${entry.react?.score?.median} (n=${entry.react?.n}) angular=${entry.angular?.score?.median} (n=${entry.angular?.n})`,
  )
}
console.log(`\n→ ${RESULTS_FILE.replace(ROOT, '.')}`)
process.exit(0)
