#!/usr/bin/env node
// Fase 6 — Evolution experiment metrics (reproducible).
// Given the experimental copy of the workspace (/tmp/lab-phase6), this script:
//   1. checks out each experiment commit (baseline, c1..c4 in order),
//   2. builds the domain package and both apps (timed) and records bundle
//      raw/gzip sizes,
//   3. computes git-derived change metrics between consecutive commits
//      (files added/modified, LOC added/removed, tests added, imports added,
//      per-layer file counts, cross-feature imports, dependencies added),
//   4. merges the CAMBIO 3 typecheck census captured during the experiment,
//   5. writes docs/experiments/results/evolution-phase6.json.
//
// Zero runtime dependencies (Node built-ins only). Usage:
//   node scripts/measure-evolution-phase6.mjs /tmp/lab-phase6
//
// Optional: --c3-census <file.json> to merge the C3 typecheck census.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'
import { cpus, totalmem } from 'node:os'
import { fileURLToPath } from 'node:url'
import { prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'evolution-phase6.json')

const COPY = process.argv[2]
if (!COPY || !existsSync(join(COPY, 'package.json'))) {
  console.error('Uso: node scripts/measure-evolution-phase6.mjs <ruta-al-copy-de-fase-6>')
  process.exit(1)
}

const C3_CENSUS_ARG = process.argv.find((a) => a.startsWith('--c3-census='))
const C3_CENSUS_FILE = C3_CENSUS_ARG ? C3_CENSUS_ARG.slice('--c3-census='.length) : null

const git = (...args) => execFileSync('git', ['-C', COPY, ...args], { encoding: 'utf8' }).trim()

// ---------------------------------------------------------------------------
// Experiment states (by commit message prefix)
// ---------------------------------------------------------------------------

const STATE_ORDER = [
  'baseline',
  'c1-feature',
  'c2-domain-rule',
  'c4-feature-evolution',
  'c3-contract-change',
]
const EXPERIMENTS = [
  { name: 'c1-feature', from: 'baseline', to: 'c1-feature' },
  { name: 'c2-domain-rule', from: 'c1-feature', to: 'c2-domain-rule' },
  { name: 'c4-feature-evolution', from: 'c2-domain-rule', to: 'c4-feature-evolution' },
  { name: 'c3-contract-change', from: 'c4-feature-evolution', to: 'c3-contract-change' },
]

function shaOf(prefix) {
  // --all: the copy may be on a detached HEAD at an older commit; the
  // experiment commits are still reachable via the lab branch/reflog.
  const out = git('log', '--all', '--format=%H', `--grep=^${prefix}`, '-1')
  if (!out) throw new Error(`commit no encontrado para ${prefix}`)
  return out
}

// Resolve ALL commit SHAs up front (before any checkout): after a detached
// checkout, `git log` from the current commit no longer sees the later
// experiment commits.
const SHAS = {}
for (const state of STATE_ORDER) {
  SHAS[state] = shaOf(state)
}

// ---------------------------------------------------------------------------
// Build + bundle measurement at a given checkout
// ---------------------------------------------------------------------------

function buildStep(dir, binArgs, label) {
  const start = performance.now()
  execFileSync(binArgs[0], binArgs.slice(1), { cwd: join(COPY, dir), stdio: 'ignore' })
  return Math.round((performance.now() - start) * 10) / 10
}

function bundleSize(file) {
  if (!existsSync(file)) return null
  const bytes = readFileSync(file)
  return { raw: bytes.length, gzip: gzipSync(bytes).length }
}

function findAsset(dir, pattern) {
  if (!existsSync(dir)) return null
  const hit = readdirSync(dir).find((f) => pattern.test(f))
  return hit ? join(dir, hit) : null
}

function measureState(state) {
  const sha = SHAS[state]
  git('checkout', '-q', sha)
  const domainMs = buildStep(
    'packages/domain',
    [join(COPY, 'node_modules/.bin/tsc'), '-p', 'tsconfig.build.json'],
    'domain',
  )
  const reactMs = buildStep(
    'apps/react-app',
    [join(COPY, 'apps/react-app/node_modules/.bin/vite'), 'build'],
    'react',
  )
  const angularMs = buildStep(
    'apps/angular-app',
    [join(COPY, 'apps/angular-app/node_modules/.bin/ng'), 'build'],
    'angular',
  )

  const reactAsset = findAsset(join(COPY, 'apps/react-app/dist/assets'), /^index-.*\.js$/)
  const angularAsset = findAsset(
    join(COPY, 'apps/angular-app/dist/angular-app/browser'),
    /^main-.*\.js$/,
  )
  const reactCss = findAsset(join(COPY, 'apps/react-app/dist/assets'), /^index-.*\.css$/)
  const angularCss = findAsset(
    join(COPY, 'apps/angular-app/dist/angular-app/browser'),
    /^styles-.*\.css$/,
  )

  return {
    commit: sha,
    buildTimeMs: { domain: domainMs, react: reactMs, angular: angularMs },
    bundle: {
      reactJs: bundleSize(reactAsset),
      reactCss: bundleSize(reactCss),
      angularJs: bundleSize(angularAsset),
      angularCss: bundleSize(angularCss),
    },
  }
}

// ---------------------------------------------------------------------------
// Git change metrics between two commits
// ---------------------------------------------------------------------------

function testCountAt(sha, dirs) {
  // Count `it(` declarations in test/spec files under the given dirs at a commit.
  let total = 0
  const files = git('ls-tree', '-r', '--name-only', sha, '--', ...dirs)
    .split('\n')
    .filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f))
  for (const f of files) {
    const content = git('show', `${sha}:${f}`)
    total += (content.match(/\bit\(/g) ?? []).length
  }
  return total
}

function importLinesAt(sha, dirs) {
  const files = git('ls-tree', '-r', '--name-only', sha, '--', ...dirs)
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f))
  let lines = []
  for (const f of files) {
    const content = git('show', `${sha}:${f}`)
    for (const line of content.split('\n')) {
      if (/^\s*import\s/.test(line) && /from\s+['"]/.test(line)) lines.push(line.trim())
    }
  }
  return lines
}

function countCrossFeatureImports(sha, featureDir) {
  // Scan a feature dir at a commit for imports of OTHER features.
  const files = git('ls-tree', '-r', '--name-only', sha, '--', featureDir)
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f))
  let violations = 0
  for (const f of files) {
    const content = git('show', `${sha}:${f}`)
    for (const line of content.split('\n')) {
      const m = /from\s+['"]([^'"]+)['"]/.exec(line)
      if (m && /features\/(?!favorites)/.test(m[1])) violations += 1
    }
  }
  return violations
}

function filesInDirsAt(sha, dirs) {
  return git('ls-tree', '-r', '--name-only', sha, '--', ...dirs)
    .split('\n')
    .filter(Boolean)
}

function diffMetrics(from, to, appDirs) {
  const numstat = git('diff', '--numstat', SHAS[from], SHAS[to]).split('\n').filter(Boolean)
  const stat = git('diff', '--stat', SHAS[from], SHAS[to]).split('\n').filter(Boolean)

  let locAdded = 0
  let locRemoved = 0
  const touched = []
  for (const line of numstat) {
    const [added, removed, file] = line.split('\t')
    if (!file) continue
    touched.push(file)
    if (added !== '-') locAdded += Number(added)
    if (removed !== '-') locRemoved += Number(removed)
  }

  const addedFiles = git('diff', '--name-status', '--diff-filter=A', SHAS[from], SHAS[to])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(2).trim())
  const modifiedFiles = git('diff', '--name-status', '--diff-filter=M', SHAS[from], SHAS[to])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(2).trim())

  const layer = (file) => {
    if (file.startsWith('packages/domain/')) return 'domain'
    if (file.startsWith('apps/react-app/src/features/favorites')) return 'feature-favorites-react'
    if (file.startsWith('apps/angular-app/src/app/features/favorites'))
      return 'feature-favorites-angular'
    if (file.startsWith('apps/react-app/src/features/')) return 'features-react'
    if (file.startsWith('apps/angular-app/src/app/features/')) return 'features-angular'
    if (file.includes('/services/')) return 'services'
    if (file.includes('/components/')) return 'components'
    if (file.includes('/adapters/') || file.includes('/domain-data')) return 'adapters'
    if (/App\.(tsx|ts)$/.test(file)) return 'app-shell'
    if (/app\.(html|spec\.ts)$/.test(file)) return 'app-shell'
    if (/styles\.css$/.test(file)) return 'styles'
    return 'other'
  }
  const byLayer = {}
  for (const f of touched) {
    const l = layer(f)
    byLayer[l] = (byLayer[l] ?? 0) + 1
  }

  const testsFrom = testCountAt(SHAS[from], appDirs)
  const testsTo = testCountAt(SHAS[to], appDirs)
  const importsFrom = new Set(importLinesAt(SHAS[from], appDirs))
  const importsTo = new Set(importLinesAt(SHAS[to], appDirs))
  const importsAdded = [...importsTo].filter((i) => !importsFrom.has(i))

  const depsDiff = git(
    'diff',
    SHAS[from],
    SHAS[to],
    '--',
    'package.json',
    'apps/*/package.json',
    'packages/*/package.json',
  )

  return {
    filesAdded: addedFiles.length,
    filesModified: modifiedFiles.length,
    filesAddedList: addedFiles,
    filesModifiedList: modifiedFiles,
    locAdded,
    locRemoved,
    filesByLayer: byLayer,
    testsAdded: testsTo - testsFrom,
    testsFrom,
    testsTo,
    importsAdded: importsAdded.length,
    importsAddedList: importsAdded,
    dependenciesChanged: depsDiff.length > 0,
    crossFeatureImportsInFavorites: {
      react: countCrossFeatureImports(SHAS[to], 'apps/react-app/src/features/favorites'),
      angular: countCrossFeatureImports(SHAS[to], 'apps/angular-app/src/app/features/favorites'),
    },
    statSummary:
      stat.filter((l) => !l.startsWith(' ') || /files? changed/.test(l)).slice(-1)[0] ?? '',
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`copy: ${COPY}`)
const states = {}
for (const state of STATE_ORDER) {
  console.log(`midiendo estado ${state} …`)
  states[state] = measureState(state)
}
git('checkout', '-q', SHAS['c3-contract-change'])

const appDirs = ['packages/domain', 'apps/react-app/src', 'apps/angular-app/src']
const experiments = {}
for (const exp of EXPERIMENTS) {
  console.log(`métricas git ${exp.name} …`)
  experiments[exp.name] = diffMetrics(exp.from, exp.to, appDirs)
}

const c3Census =
  C3_CENSUS_FILE && existsSync(C3_CENSUS_FILE)
    ? JSON.parse(readFileSync(C3_CENSUS_FILE, 'utf8'))
    : { note: 'NO DISPONIBLE: pasar --c3-census=<file>' }

const result = {
  experiment: 'evolution-phase6',
  capturedAt: new Date().toISOString(),
  objective:
    'Medir el coste real de cambio (evolución) de React Monolith y Angular Monolith al implementar el mismo contrato: nueva feature (C1), nueva regla de dominio (C2), evolución de feature (C4) y cambio de contrato compartido (C3).',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCores: cpus().length,
    memoryBytes: totalmem(),
    experimentalCopy: COPY,
    commits: Object.fromEntries(STATE_ORDER.map((s) => [s, states[s].commit])),
    note: 'Experimento ejecutado en copia aislada (/tmp) con git propio; el árbol principal no se modificó. buildTimeMs: 1 ejecución por estado (indicativo, no mediana).',
  },
  method:
    'CAMBIO 1: feature Favoritos (nav entry, UI, estado local UI en App, consumo de buildProjectReport/getProjectHealth vía store/adapter, interacción star, tests) en ambos frameworks. CAMBIO 2: regla getProjectHealth añadida una sola vez en packages/domain y consumida por ambas apps. CAMBIO 4: evolución de la feature (filtro por estado reutilizando filterProjects + contador de tareas). CAMBIO 3: cambio de firma canTransitionProject(from,to) -> canTransitionProject({from,to}); censo de errores typecheck en dos etapas (sin rebuild del dist y tras rebuild). Métricas: git diff (numstat/stat) entre commits consecutivos del copy; conteo de tests por declaraciones it(); imports por líneas import; violaciones cross-feature por escaneo de imports; dependencias por diff de package.json; build y bundle por reconstrucción en cada estado.',
  states,
  experiments,
  c3Census,
  limitations: [
    'buildTimeMs: 1 ejecución por estado; puede incluir ruido del sistema; no se usó mediana de 3 (coste de 5 estados x 2 apps).',
    'testsAdded: conteo por declaraciones it() en archivos test/spec (heurística; it.each cuenta 1).',
    'importsAdded: heurística sobre líneas import de archivos .ts/.tsx en las rutas dadas.',
    'time_to_implement: NO MEDIBLE (trabajo manual, no reproducible); no se reporta.',
    'time_to_detect_contract_break: medido como tiempo de tsc en el censo C3 (reproducible).',
    'El dist de packages/domain no se commitea (gitignored); cada medición reconstruye el dominio antes de las apps.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)
console.log(`escrito: ${RESULTS_FILE}`)
