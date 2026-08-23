#!/usr/bin/env node
// Lighthouse evaluation of H8 (Fase 5.9) — React Monolith vs Angular Monolith.
// Zero runtime dependencies: Node built-ins only (http for static serving, zlib
// not needed, child_process to run the Lighthouse CLI).
//
// Methodology (metrics.md §3.4):
// - Performance / Core Web Vitals: mobile profile (Lighthouse default, with
//   simulated throttling).
// - Accessibility, Best Practices, SEO: desktop profile.
// - 3 runs per app per profile; median + range reported.
// - Both apps served from their production builds by equivalent static servers
//   (same Node http server implementation, different ports).
//
// Environment discovery (no installation):
// - Lighthouse CLI: searched in the npx cache (~/.npm/_npx/*/node_modules/
//   lighthouse), falling back to `npx lighthouse`.
// - Browser: chrome-headless-shell from the Playwright cache
//   (~/Library/Caches/ms-playwright/chromium_headless_shell-*/...), which is
//   the only working headless browser in this environment (the full Chrome
//   binary hangs on http:// URLs, documented in Fases 4.1/5.1). Falls back to
//   the system Chrome via CHROME_PATH if the shell is not found.
//
// Output: docs/experiments/results/lighthouse-phase5.json

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { cpus, totalmem, homedir } from 'node:os'
import { prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'lighthouse-phase5.json')

const REACT_DIST = join(ROOT, 'apps/react-app/dist')
const ANGULAR_DIST = join(ROOT, 'apps/angular-app/dist/angular-app/browser')
const REACT_PORT = 4173
const ANGULAR_PORT = 4174
const RUNS_PER_PROFILE = 3

// ---------------------------------------------------------------------------
// Environment discovery
// ---------------------------------------------------------------------------

function findLighthouseCli() {
  const npxCandidates = []
  const npxRoot = join(homedir(), '.npm/_npx')
  if (existsSync(npxRoot)) {
    for (const dir of readdirSync(npxRoot)) {
      const pkg = join(npxRoot, dir, 'node_modules/lighthouse/package.json')
      if (existsSync(pkg)) npxCandidates.push(join(npxRoot, dir, 'node_modules/lighthouse'))
    }
  }
  if (npxCandidates.length > 0) {
    // Prefer the newest by mtime.
    npxCandidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    return {
      cli: join(npxCandidates[0], 'cli/index.js'),
      version: JSON.parse(readFileSync(join(npxCandidates[0], 'package.json'), 'utf8')).version,
    }
  }
  return null
}

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
// Static server (same implementation for both apps; no framework-specific
// serving logic). SPA fallback: serve index.html for unknown paths.
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
    // SPA fallback
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
// Lighthouse execution
// ---------------------------------------------------------------------------

// IMPORTANT: must use async spawn (not spawnSync): the static servers run in
// this same process, so a blocking child would starve the event loop and the
// page request would never be served.
//
// We resolve on the 'exit' event (NOT 'close'): chrome-headless-shell spawns
// grandchild processes that keep the inherited stdout pipe open, so 'close'
// never fires even though the CLI already wrote its JSON output. The output
// file is written by the CLI before it exits, so 'exit' is sufficient.
function runLighthouse(lh, chromePath, url, outFile, flags) {
  const args = [lh.cli, url, '--quiet', '--output=json', `--output-path=${outFile}`, ...flags]
  const env = { ...process.env, CHROME_PATH: chromePath }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let stdout = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Lighthouse timed out after 300s (${url})`))
    }, 300000)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`Lighthouse exited ${code}: ${(stderr || stdout).slice(0, 300)}`))
        return
      }
      try {
        resolve(JSON.parse(readFileSync(outFile, 'utf8')))
      } catch (err) {
        reject(new Error(`Failed to parse Lighthouse output: ${err.message}`))
      }
    })
  })
}

// Reuse an existing valid artifact if present (crash recovery / idempotence):
// the same script re-run must not change measurements, so skipping a run that
// already produced a parseable Lighthouse report is safe and keeps the
// experiment reproducible.
function tryReuseArtifact(outFile) {
  if (!existsSync(outFile)) return null
  try {
    const r = JSON.parse(readFileSync(outFile, 'utf8'))
    if (r && r.categories && r.lighthouseVersion) return r
  } catch {
    // fall through
  }
  return null
}

const CWV_AUDITS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'speed-index',
  'total-blocking-time',
  'cumulative-layout-shift',
  'interactive',
]

function extractResult(run) {
  const c = run.categories
  const a = run.audits
  const cwv = {}
  for (const k of CWV_AUDITS) {
    cwv[k] = a[k]?.numericValue ?? null
  }
  const a11yAudits = Object.entries(a)
    .filter(
      ([id, audit]) =>
        audit.score !== null &&
        audit.score < 1 &&
        audit.scoreDisplayMode !== 'notApplicable' &&
        audit.scoreDisplayMode !== 'informative' &&
        (audit.group === 'a11y-accessibility' ||
          run.categories.accessibility?.auditRefs?.some((r) => r.id === id)),
    )
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      score: audit.score,
      displayValue: audit.displayValue ?? null,
    }))
  return {
    finalUrl: run.finalUrl,
    requestedUrl: run.requestedUrl,
    lighthouseVersion: run.lighthouseVersion,
    scores: {
      performance: c.performance?.score ?? null,
      accessibility: c.accessibility?.score ?? null,
      bestPractices: c['best-practices']?.score ?? null,
      seo: c.seo?.score ?? null,
    },
    cwv,
    failedA11yAudits: a11yAudits,
    runtimeError: run.runtimeError?.code ?? null,
  }
}

function median(arr) {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function summarize(extracts) {
  const scores = { performance: [], accessibility: [], bestPractices: [], seo: [] }
  const cwv = {}
  for (const k of CWV_AUDITS) cwv[k] = []
  for (const e of extracts) {
    for (const [cat, arr] of Object.entries(scores)) {
      if (e.scores[cat] !== null) arr.push(e.scores[cat])
    }
    for (const [k, arr] of Object.entries(cwv)) {
      if (e.cwv[k] !== null) arr.push(e.cwv[k])
    }
  }
  const sum = (arr) => ({
    median: median(arr),
    min: arr.length ? Math.min(...arr) : null,
    max: arr.length ? Math.max(...arr) : null,
    n: arr.length,
  })
  const scoreSum = {}
  for (const [cat, arr] of Object.entries(scores)) scoreSum[cat] = sum(arr)
  const cwvSum = {}
  for (const [k, arr] of Object.entries(cwv)) cwvSum[k] = sum(arr)
  // Merge failed a11y audits across runs (union).
  const failed = {}
  for (const e of extracts) {
    for (const fa of e.failedA11yAudits) failed[fa.id] = fa
  }
  return { scores: scoreSum, cwv: cwvSum, failedA11yAudits: Object.values(failed) }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const lh = findLighthouseCli()
if (!lh) {
  console.error(
    'Lighthouse CLI not found in npx cache. Run `npx lighthouse --version` once to fetch it.',
  )
  process.exit(1)
}
const chromePath = findHeadlessShell()
if (!chromePath) {
  console.error(
    'chrome-headless-shell not found. This environment needs it (the full Chrome binary hangs on http://).',
  )
  process.exit(1)
}
console.log(`Lighthouse ${lh.version} · chrome-headless-shell: ${chromePath}`)

const servers = [
  await startStaticServer(REACT_DIST, REACT_PORT),
  await startStaticServer(ANGULAR_DIST, ANGULAR_PORT),
]
console.log(
  `servers: react http://127.0.0.1:${REACT_PORT}/ · angular http://127.0.0.1:${ANGULAR_PORT}/`,
)

const MOBILE_FLAGS = ['--chrome-flags=--no-sandbox --disable-gpu']
const DESKTOP_FLAGS = ['--preset=desktop', '--chrome-flags=--no-sandbox --disable-gpu']

const apps = [
  { key: 'react', url: `http://127.0.0.1:${REACT_PORT}/`, dist: REACT_DIST },
  { key: 'angular', url: `http://127.0.0.1:${ANGULAR_PORT}/`, dist: ANGULAR_DIST },
]

const results = {}
for (const app of apps) {
  const mobile = []
  const desktop = []
  console.log(`\n=== ${app.key} ===`)
  for (let i = 0; i < RUNS_PER_PROFILE; i += 1) {
    const mOut = `/tmp/lh-${app.key}-mobile-${i}.json`
    const cached = tryReuseArtifact(mOut)
    if (cached) {
      console.log(`  mobile run ${i + 1}/${RUNS_PER_PROFILE} … (artefacto reutilizado)`)
      mobile.push(extractResult(cached))
      continue
    }
    console.log(`  mobile run ${i + 1}/${RUNS_PER_PROFILE} …`)
    const m = await runLighthouse(lh, chromePath, app.url, mOut, MOBILE_FLAGS)
    mobile.push(extractResult(m))
  }
  for (let i = 0; i < RUNS_PER_PROFILE; i += 1) {
    const dOut = `/tmp/lh-${app.key}-desktop-${i}.json`
    const cached = tryReuseArtifact(dOut)
    if (cached) {
      console.log(`  desktop run ${i + 1}/${RUNS_PER_PROFILE} … (artefacto reutilizado)`)
      desktop.push(extractResult(cached))
      continue
    }
    console.log(`  desktop run ${i + 1}/${RUNS_PER_PROFILE} …`)
    const d = await runLighthouse(lh, chromePath, app.url, dOut, DESKTOP_FLAGS)
    desktop.push(extractResult(d))
  }
  results[app.key] = {
    mobile: { runs: mobile, summary: summarize(mobile) },
    desktop: { runs: desktop, summary: summarize(desktop) },
  }
}

const result = {
  experiment: 'lighthouse-phase5',
  capturedAt: new Date().toISOString(),
  objective:
    'Evaluar H8 (accesibilidad y rendimiento percibido equivalentes al implementar el mismo contrato) con Lighthouse real sobre los builds de producción de React Monolith y Angular Monolith.',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCores: cpus().length,
    memoryBytes: totalmem(),
    lighthouseVersion: lh.version,
    lighthouseCli: lh.cli,
    chromePath,
    note: 'chrome-headless-shell (Chrome for Testing) es el único navegador headless funcional en este entorno; el binario completo de Chrome se cuelga con URLs http:// (documentado en Fases 4.1/5.1).',
  },
  method:
    'metrics.md §3.4: Performance/CWV con perfil móvil (throttling simulado por defecto); Accessibility/Best Practices/SEO con perfil desktop. 3 ejecuciones por app y perfil; mediana y rango. Servidores estáticos equivalentes (misma implementación Node http, puertos distintos) sobre los builds de producción oficiales (React 233 547 B / Angular 179 634 B, verificados). Misma máquina, misma sesión, mismo Node, mismo Chrome.',
  urls: {
    react: `http://127.0.0.1:${REACT_PORT}/`,
    angular: `http://127.0.0.1:${ANGULAR_PORT}/`,
  },
  apps: {
    react: {
      dist: REACT_DIST,
      mobile: results.react.mobile,
      desktop: results.react.desktop,
    },
    angular: {
      dist: ANGULAR_DIST,
      mobile: results.angular.mobile,
      desktop: results.angular.desktop,
    },
  },
  comparison: {
    mobileScores: {
      performance: {
        react: summarize(results.react.mobile.runs).scores.performance,
        angular: summarize(results.angular.mobile.runs).scores.performance,
      },
      accessibility: {
        react: summarize(results.react.mobile.runs).scores.accessibility,
        angular: summarize(results.angular.mobile.runs).scores.accessibility,
      },
      bestPractices: {
        react: summarize(results.react.mobile.runs).scores.bestPractices,
        angular: summarize(results.angular.mobile.runs).scores.bestPractices,
      },
      seo: {
        react: summarize(results.react.mobile.runs).scores.seo,
        angular: summarize(results.angular.mobile.runs).scores.seo,
      },
    },
    note: 'La comparación formal de scores usa: Performance/CWV → perfil móvil; Accessibility/BP/SEO → perfil desktop (metrics.md §3.4).',
  },
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

// Close the static servers so the Node process can exit (an open http.Server
// keeps the event loop alive indefinitely).
for (const s of servers) {
  s.close()
}

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------

function fmtScore(sum) {
  return `${(sum.median * 100).toFixed(0)} (${(sum.min * 100).toFixed(0)}–${(sum.max * 100).toFixed(0)})`
}
function fmtCwv(sum) {
  if (sum.median === null) return '—'
  // numericValue is in ms for FCP/LCP/SI/TBT/Interactive; CLS is unitless (< 1).
  if (sum.median >= 1000) return `${(sum.median / 1000).toFixed(2)} s`
  return `${Math.round(sum.median)} ms`
}

console.log('\n=== RESUMEN (mediana; rango) ===')
for (const app of ['react', 'angular']) {
  const m = results[app].mobile.summary
  const d = results[app].desktop.summary
  console.log(`\n${app.toUpperCase()}`)
  console.log(
    `  MÓVIL   perf ${fmtScore(m.scores.performance)} · a11y ${fmtScore(m.scores.accessibility)} · FCP ${fmtCwv(m.cwv['first-contentful-paint'])} · LCP ${fmtCwv(m.cwv['largest-contentful-paint'])} · TBT ${fmtCwv(m.cwv['total-blocking-time'])} · CLS ${m.cwv['cumulative-layout-shift'].median?.toFixed(3)}`,
  )
  console.log(
    `  DESKTOP a11y ${fmtScore(d.scores.accessibility)} · bp ${fmtScore(d.scores.bestPractices)} · seo ${fmtScore(d.scores.seo)}`,
  )
}
