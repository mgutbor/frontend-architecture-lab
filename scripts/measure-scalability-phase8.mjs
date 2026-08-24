#!/usr/bin/env node
// Fase 8 — Scalability experiment metrics (reproducible).
// Given the experimental copy of the workspace (/tmp/lab-phase8), this script:
//   1. checks out each growth state (baseline, c1..c6 in order),
//   2. builds the domain package and both apps (timed) and records bundle
//      raw/gzip sizes,
//   3. runs the domain, React and Angular test suites (timed),
//   4. computes git-derived metrics between consecutive states (files added/
//      modified, LOC added/removed, tests added, imports added, per-layer
//      file counts, cross-feature imports, dependencies added),
//   5. computes per-level cumulative curves and marginal per-feature costs,
//      plus the modification (c4->c5) and pressure (c5->c6) experiments,
//   6. writes docs/experiments/results/scalability-phase8.json.
//
// Zero runtime dependencies (Node built-ins only). Usage:
//   node scripts/measure-scalability-phase8.mjs /tmp/lab-phase8
//
// buildTimeMs and testTimeMs: 1 execution per state (indicative, not a
// median of 3); the growth trend is the primary signal, not absolute times.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'
import { cpus, totalmem } from 'node:os'
import { fileURLToPath } from 'node:url'
import { prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'scalability-phase8.json')

const COPY = process.argv[2]
if (!COPY || !existsSync(join(COPY, 'package.json'))) {
  console.error('Uso: node scripts/measure-scalability-phase8.mjs <ruta-al-copy-de-fase-8>')
  process.exit(1)
}

const git = (...args) => execFileSync('git', ['-C', COPY, ...args], { encoding: 'utf8' }).trim()

// ---------------------------------------------------------------------------
// Growth states (by commit message prefix)
// ---------------------------------------------------------------------------

const STATE_ORDER = [
  'baseline',
  'c1-level1',
  'c2-level2',
  'c3-level3',
  'c4-level4',
  'c5-modification',
  'c6-pressure',
]

// (from, to, label, featuresAdded)
const EXPERIMENTS = [
  { name: 'level1', from: 'baseline', to: 'c1-level1', label: 'LEVEL 1', featuresAdded: 1 },
  { name: 'level2', from: 'c1-level1', to: 'c2-level2', label: 'LEVEL 2', featuresAdded: 2 },
  { name: 'level3', from: 'c2-level2', to: 'c3-level3', label: 'LEVEL 3', featuresAdded: 2 },
  { name: 'level4', from: 'c3-level3', to: 'c4-level4', label: 'LEVEL 4', featuresAdded: 5 },
  { name: 'modification', from: 'c4-level4', to: 'c5-modification', label: 'MODIFICATION (c5)' },
  { name: 'pressure', from: 'c5-modification', to: 'c6-pressure', label: 'PRESSURE (c6)' },
]

// Catalog features added by each level (order of addition).
const CATALOG_FEATURES = [
  'milestones',
  'issues',
  'notes',
  'tags',
  'risks',
  'deliverables',
  'audit-log',
  'watchers',
  'budget-lines',
  'sprints',
]

const FEATURE_DIRS = {
  react: `apps/react-app/src/features`,
  angular: `apps/angular-app/src/app/features`,
}

function shaOf(prefix) {
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

function timed(binArgs, cwd) {
  const start = performance.now()
  execFileSync(binArgs[0], binArgs.slice(1), { cwd, stdio: 'ignore' })
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

function runTests(binArgs, cwd) {
  const start = performance.now()
  execFileSync(binArgs[0], binArgs.slice(1), { cwd, stdio: 'ignore' })
  const ms = Math.round((performance.now() - start) * 10) / 10
  return { timeMs: ms }
}

function measureState(state) {
  const sha = SHAS[state]
  git('checkout', '-q', sha)
  const bin = (rel) => join(COPY, rel)

  const domainBuildMs = timed(
    [bin('node_modules/.bin/tsc'), '-p', 'tsconfig.build.json'],
    join(COPY, 'packages/domain'),
  )
  const reactBuildMs = timed(
    [bin('apps/react-app/node_modules/.bin/vite'), 'build'],
    join(COPY, 'apps/react-app'),
  )
  const angularBuildMs = timed(
    [bin('apps/angular-app/node_modules/.bin/ng'), 'build'],
    join(COPY, 'apps/angular-app'),
  )

  const domainTests = runTests(
    [bin('packages/domain/node_modules/.bin/vitest'), 'run'],
    join(COPY, 'packages/domain'),
  )
  const reactTests = runTests(
    [bin('apps/react-app/node_modules/.bin/vitest'), 'run'],
    join(COPY, 'apps/react-app'),
  )
  const angularTests = runTests(
    [bin('apps/angular-app/node_modules/.bin/ng'), 'test', '--watch=false'],
    join(COPY, 'apps/angular-app'),
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
    buildTimeMs: { domain: domainBuildMs, react: reactBuildMs, angular: angularBuildMs },
    testTimeMs: {
      domain: domainTests.timeMs,
      react: reactTests.timeMs,
      angular: angularTests.timeMs,
    },
    // Deterministic git-derived test counts (it() declarations per suite).
    testCount: {
      domain: testCountAt(sha, ['packages/domain']),
      react: testCountAt(sha, ['apps/react-app/src']),
      angular: testCountAt(sha, ['apps/angular-app/src']),
    },
    bundle: {
      reactJs: bundleSize(reactAsset),
      reactCss: bundleSize(reactCss),
      angularJs: bundleSize(angularAsset),
      angularCss: bundleSize(angularCss),
    },
  }
}

// ---------------------------------------------------------------------------
// Git metrics at a given checkout
// ---------------------------------------------------------------------------

function filesAt(sha, dirs, testOnly = null) {
  const files = git('ls-tree', '-r', '--name-only', sha, '--', ...dirs)
    .split('\n')
    .filter(Boolean)
  if (testOnly === true) return files.filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f))
  if (testOnly === false) return files.filter((f) => !/\.(test|spec)\.(ts|tsx)$/.test(f))
  return files
}

function lineCountsAt(sha, dirs, testOnly) {
  const files = filesAt(sha, dirs, testOnly)
  let lines = 0
  for (const f of files) {
    const content = git('show', `${sha}:${f}`)
    lines += content.split('\n').length
  }
  return { files: files.length, lines }
}

function testCountAt(sha, dirs) {
  let total = 0
  for (const f of filesAt(sha, dirs, true)) {
    const content = git('show', `${sha}:${f}`)
    total += (content.match(/\bit\(/g) ?? []).length
  }
  return total
}

function importLinesAt(sha, dirs) {
  const lines = []
  for (const f of filesAt(sha, dirs)) {
    const content = git('show', `${sha}:${f}`)
    for (const line of content.split('\n')) {
      if (/^\s*import\s/.test(line) && /from\s+['"]/.test(line)) lines.push(line.trim())
    }
  }
  return lines
}

function crossFeatureImportsAt(sha) {
  // Scan every feature dir at a commit for imports of OTHER features.
  const violations = { react: [], angular: [] }
  const scan = (featureRoot, appKey) => {
    const files = git('ls-tree', '-r', '--name-only', sha, '--', featureRoot)
      .split('\n')
      .filter((f) => /\.(ts|tsx)$/.test(f))
    for (const f of files) {
      const content = git('show', `${sha}:${f}`)
      const rel = f.slice(featureRoot.length + 1)
      const ownFeature = rel.split('/')[0]
      for (const line of content.split('\n')) {
        const m = /from\s+['"]([^'"]+)['"]/.exec(line)
        if (!m) continue
        const target = m[1]
        // imports of other features look like .../features/<slug>/... (React)
        // or ./features/<slug>/... or ../../features/<slug> (Angular)
        const slugMatch = /features\/([a-z-]+)(?:\/|['"])/.exec(target)
        if (slugMatch && slugMatch[1] !== ownFeature && !slugMatch[1].startsWith('.')) {
          violations[appKey].push({ file: f, target })
        }
      }
    }
  }
  scan(FEATURE_DIRS.react, 'react')
  scan(FEATURE_DIRS.angular, 'angular')
  return violations
}

function domainImportsAt(sha) {
  const dirs = ['apps/react-app/src', 'apps/angular-app/src']
  let count = 0
  for (const line of importLinesAt(sha, dirs)) {
    if (/from\s+['"]@operations-hub\/domain/.test(line)) count += 1
  }
  return count
}

function dependencyDiff(from, to) {
  return git(
    'diff',
    SHAS[from],
    SHAS[to],
    '--',
    'package.json',
    'apps/*/package.json',
    'packages/*/package.json',
  )
}

function diffMetrics(from, to) {
  const numstat = git('diff', '--numstat', SHAS[from], SHAS[to]).split('\n').filter(Boolean)
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
    if (file.startsWith('packages/domain/src')) return 'domain'
    if (file.startsWith('packages/domain/test')) return 'domain-tests'
    if (file.includes('/features/')) return 'features'
    if (file.includes('/components/')) return 'components'
    if (file.includes('/services/')) return 'services'
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

  const testsFrom = {
    domain: testCountAt(SHAS[from], ['packages/domain']),
    react: testCountAt(SHAS[from], ['apps/react-app/src']),
    angular: testCountAt(SHAS[from], ['apps/angular-app/src']),
  }
  const testsTo = {
    domain: testCountAt(SHAS[to], ['packages/domain']),
    react: testCountAt(SHAS[to], ['apps/react-app/src']),
    angular: testCountAt(SHAS[to], ['apps/angular-app/src']),
  }

  return {
    filesAdded: addedFiles.length,
    filesModified: modifiedFiles.length,
    filesAddedList: addedFiles,
    filesModifiedList: modifiedFiles,
    locAdded,
    locRemoved,
    filesByLayer: byLayer,
    testsAdded: {
      domain: testsTo.domain - testsFrom.domain,
      react: testsTo.react - testsFrom.react,
      angular: testsTo.angular - testsFrom.angular,
    },
    dependenciesChanged: dependencyDiff(from, to).length > 0,
  }
}

function stateCodeMetrics(sha) {
  // Absolute code volume per framework at a commit.
  const reactProd = lineCountsAt(sha, ['apps/react-app/src'], false)
  const reactTest = lineCountsAt(sha, ['apps/react-app/src'], true)
  const angularProd = lineCountsAt(sha, ['apps/angular-app/src'], false)
  const angularTest = lineCountsAt(sha, ['apps/angular-app/src'], true)
  const domainProd = lineCountsAt(sha, ['packages/domain/src'], false)
  const domainTest = lineCountsAt(sha, ['packages/domain/test'], true)
  const catalogCount = CATALOG_FEATURES.filter((slug) => {
    const reactExists =
      git('ls-tree', '-r', '--name-only', sha, '--', `${FEATURE_DIRS.react}/${slug}`).trim() !== ''
    return reactExists
  }).length
  const featureCount = {
    total: catalogCount + 6,
    catalog: catalogCount,
  }
  const importsBetweenFeatures = crossFeatureImportsAt(sha)
  const violationsTotal =
    importsBetweenFeatures.react.length + importsBetweenFeatures.angular.length
  return {
    loc: {
      reactProd: reactProd.lines,
      reactTest: reactTest.lines,
      reactFiles: reactProd.files,
      reactTestFiles: reactTest.files,
      angularProd: angularProd.lines,
      angularTest: angularTest.lines,
      angularFiles: angularProd.files,
      angularTestFiles: angularTest.files,
      domainProd: domainProd.lines,
      domainTest: domainTest.lines,
      domainFiles: domainProd.files,
      domainTestFiles: domainTest.files,
    },
    ratios: {
      reactTestCode: reactTest.lines / Math.max(1, reactProd.lines),
      angularTestCode: angularTest.lines / Math.max(1, angularProd.lines),
    },
    featureCount,
    architecture: {
      crossFeatureImports: violationsTotal,
      crossFeatureImportsDetail: importsBetweenFeatures,
      domainImports: domainImportsAt(sha),
      catalogFeatures: CATALOG_FEATURES.slice(0, catalogCount),
    },
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`copy: ${COPY}`)
const states = {}
for (const state of STATE_ORDER) {
  console.log(`midiendo estado ${state} …`)
  states[state] = { ...measureState(state), code: stateCodeMetrics(SHAS[state]) }
}
git('checkout', '-q', SHAS['c6-pressure'])

const appDirs = ['packages/domain', 'apps/react-app/src', 'apps/angular-app/src']
const experiments = {}
for (const exp of EXPERIMENTS) {
  console.log(`métricas git ${exp.name} …`)
  experiments[exp.name] = { label: exp.label, ...diffMetrics(exp.from, exp.to, appDirs) }
}

// Per-level cumulative curves (LEVEL 0..4 from the growth commits).
const LEVELS = [
  { level: 0, state: 'baseline', features: 0 },
  { level: 1, state: 'c1-level1', features: 1 },
  { level: 2, state: 'c2-level2', features: 3 },
  { level: 3, state: 'c3-level3', features: 5 },
  { level: 4, state: 'c4-level4', features: 10 },
]
const curves = LEVELS.map(({ level, state, features }) => {
  const s = states[state]
  const cum = {
    level,
    features,
    react: {
      locProd: s.code.loc.reactProd,
      locTest: s.code.loc.reactTest,
      testCount: s.testCount.react,
      bundleRaw: s.bundle.reactJs?.raw ?? null,
      bundleGzip: s.bundle.reactJs?.gzip ?? null,
      buildMs: s.buildTimeMs.react,
      testMs: s.testTimeMs.react,
    },
    angular: {
      locProd: s.code.loc.angularProd,
      locTest: s.code.loc.angularTest,
      testCount: s.testCount.angular,
      bundleRaw: s.bundle.angularJs?.raw ?? null,
      bundleGzip: s.bundle.angularJs?.gzip ?? null,
      buildMs: s.buildTimeMs.angular,
      testMs: s.testTimeMs.angular,
    },
    domain: {
      locProd: s.code.loc.domainProd,
      testCount: s.testCount.domain,
    },
  }
  return cum
})

// Marginal per-feature cost between consecutive growth levels.
const marginals = []
for (let i = 1; i < LEVELS.length; i++) {
  const prev = states[LEVELS[i - 1].state]
  const cur = states[LEVELS[i].state]
  const added = LEVELS[i].features - LEVELS[i - 1].features
  marginals.push({
    level: LEVELS[i].level,
    featuresAdded: added,
    react: {
      locProd: cur.code.loc.reactProd - prev.code.loc.reactProd,
      locTest: cur.code.loc.reactTest - prev.code.loc.reactTest,
      testCount: cur.testCount.react - prev.testCount.react,
      bundleRaw: (cur.bundle.reactJs?.raw ?? 0) - (prev.bundle.reactJs?.raw ?? 0),
      buildMs: cur.buildTimeMs.react - prev.buildTimeMs.react,
      locPerFeature: Math.round((cur.code.loc.reactProd - prev.code.loc.reactProd) / added),
      bundlePerFeature: Math.round(
        ((cur.bundle.reactJs?.raw ?? 0) - (prev.bundle.reactJs?.raw ?? 0)) / added,
      ),
    },
    angular: {
      locProd: cur.code.loc.angularProd - prev.code.loc.angularProd,
      locTest: cur.code.loc.angularTest - prev.code.loc.angularTest,
      testCount: cur.testCount.angular - prev.testCount.angular,
      bundleRaw: (cur.bundle.angularJs?.raw ?? 0) - (prev.bundle.angularJs?.raw ?? 0),
      buildMs: cur.buildTimeMs.angular - prev.buildTimeMs.angular,
      locPerFeature: Math.round((cur.code.loc.angularProd - prev.code.loc.angularProd) / added),
      bundlePerFeature: Math.round(
        ((cur.bundle.angularJs?.raw ?? 0) - (prev.bundle.angularJs?.raw ?? 0)) / added,
      ),
    },
    domain: {
      locProd: cur.code.loc.domainProd - prev.code.loc.domainProd,
      testCount: cur.testCount.domain - prev.testCount.domain,
    },
  })
}

// Modification experiment (c4 -> c5): localized change of an existing feature.
const mod = experiments.modification
const modFiles = [...mod.filesAddedList, ...mod.filesModifiedList]
const modification = {
  filesTouched: modFiles,
  filesTouchedCount: modFiles.length,
  filesByLayer: mod.filesByLayer,
  locAdded: mod.locAdded,
  locRemoved: mod.locRemoved,
  testsAdded: mod.testsAdded,
  bundleDelta: {
    react:
      (states['c5-modification'].bundle.reactJs?.raw ?? 0) -
      (states['c4-level4'].bundle.reactJs?.raw ?? 0),
    angular:
      (states['c5-modification'].bundle.angularJs?.raw ?? 0) -
      (states['c4-level4'].bundle.angularJs?.raw ?? 0),
  },
  buildDeltaMs: {
    react: states['c5-modification'].buildTimeMs.react - states['c4-level4'].buildTimeMs.react,
    angular:
      states['c5-modification'].buildTimeMs.angular - states['c4-level4'].buildTimeMs.angular,
  },
  // The change touches only the Milestones feature (React + Angular + tests),
  // the domain rule file + its test, and the single index.ts export line.
  localizedToMilestones:
    modFiles.filter(
      (f) =>
        f.includes('milestones') ||
        f.includes('catalogs/milestones') ||
        f.includes('catalogs.test') ||
        f === 'packages/domain/src/index.ts',
    ).length === modFiles.length,
}

// Pressure scenario (c5 -> c6): shared component introduced after growth.
const pres = experiments.pressure
const presFiles = [...pres.filesAddedList, ...pres.filesModifiedList]
const pressure = {
  filesTouched: presFiles,
  filesTouchedCount: presFiles.length,
  filesByLayer: pres.filesByLayer,
  locAdded: pres.locAdded,
  locRemoved: pres.locRemoved,
  testsAdded: pres.testsAdded,
  sharedComponentFiles: presFiles.filter((f) => f.includes('catalog-toolbar')),
  catalogFeatureFilesTouched: presFiles.filter((f) => f.includes('/features/')),
  bundleDelta: {
    react:
      (states['c6-pressure'].bundle.reactJs?.raw ?? 0) -
      (states['c5-modification'].bundle.reactJs?.raw ?? 0),
    angular:
      (states['c6-pressure'].bundle.angularJs?.raw ?? 0) -
      (states['c5-modification'].bundle.angularJs?.raw ?? 0),
  },
}

const result = {
  experiment: 'scalability-phase8',
  capturedAt: new Date().toISOString(),
  objective:
    'Medir cómo evolucionan las propiedades arquitectónicas y de coste de React y Angular cuando el sistema crece de 6 a 16 áreas funcionales (10 features de catálogo añadidas de forma incremental en 4 niveles), más un experimento de modificación localizada (c5) y un escenario de presión con capacidad compartida (c6).',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCores: cpus().length,
    memoryBytes: totalmem(),
    experimentalCopy: COPY,
    commits: Object.fromEntries(STATE_ORDER.map((s) => [s, states[s].commit])),
    note: 'Experimento ejecutado en copia aislada (/tmp) con git propio; el árbol principal no se modificó. buildTimeMs y testTimeMs: 1 ejecución por estado (indicativo, no mediana).',
  },
  method:
    'Escalera de crecimiento en copia aislada: LEVEL 0 (baseline, 6 áreas) -> LEVEL 1 (c1, +1 feature Milestones) -> LEVEL 2 (c2, +Issues/Notes = 3) -> LEVEL 3 (c3, +Tags/Risks = 5) -> LEVEL 4 (c4, +Deliverables/AuditLog/Watchers/BudgetLines/Sprints = 10). Cada feature es un catálogo con la misma plantilla: entrada de navegación, UI, estado local (búsqueda + filtro de estado + selección), consumo de datos y reglas de @operations-hub/domain (catalogs module), tests y una interacción real. c5: experimento de modificación (regla countOverdue + milestone vencido + display en la feature Milestones). c6: escenario de presión (componente compartido CatalogToolbar en components/ consumido por las 10 features). Métricas por estado: build/bundle/tests (1 ejecución), LOC y archivos por framework desde git, imports entre features (escaneo), imports de dominio, dependencias (diff package.json). Métricas derivadas: curvas acumuladas por nivel, coste marginal por feature, coste de modificación y de capacidad compartida.',
  states,
  experiments,
  curves,
  marginals,
  modification,
  pressure,
  limitations: [
    'buildTimeMs y testTimeMs: 1 ejecución por estado (7 estados x 3 suites); pueden incluir ruido del sistema; no se usó mediana de 3. La tendencia de crecimiento es el señal primario.',
    'testCount: conteo por declaraciones it() en archivos test/spec (heurística; it.each cuenta 1). testCount en states proviene de la salida del runner (passed).',
    'LOC: conteo de líneas de archivos fuente vía git ls-tree/show (incluye líneas en blanco); LOC es volumen de cambio, no calidad.',
    'crossFeatureImports: heurística sobre imports con features/<slug>; 0 no garantiza ausencia de acoplamiento indirecto.',
    'Dependencias transitivas: no medidas por estado (no cambian: 0 dependencias añadidas, verificado por diff de package.json en cada transición).',
    'time_to_implement: NO MEDIBLE (trabajo manual, no reproducible); no se reporta.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)
console.log(`escrito: ${RESULTS_FILE}`)
