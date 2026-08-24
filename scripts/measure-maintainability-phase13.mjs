#!/usr/bin/env node
// Fase 13 — cognitive cost & maintainability (scenarios C1..C6).
//
// Measures, for each experimental snapshot of the isolated copy
// /tmp/lab-phase13 (BASELINE, C1, C2, C3-BUG, C3-FIX, C4, C5, C6), the
// structural and cognitive-proxy cost of 6 heterogeneous maintenance tasks
// implemented identically in React and Angular:
//
//   C1  new complete feature (Board)          C4  refactor without functional change
//   C2  modify existing feature (sort)        C5  UI-only change (density)
//   C3  bug fix (case-sensitive search)       C6  remove a feature (Settings)
//
// Metrics per transition: surface (files/LOC per framework), imports,
// tests, features touched (blast radius), new symbols, complexity proxy
// (branches), and the accidental-vs-functional classification (each changed
// file is classified domain / framework / mixed with documented heuristics).
//
// Zero external dependencies (node + git only). Output:
//   docs/experiments/results/maintainability-phase13.json

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, totalmem } from 'node:os'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'maintainability-phase13.json')

const LAB = process.argv[2] ?? '/tmp/lab-phase13'
if (!existsSync(join(LAB, 'package.json'))) {
  console.error(`Copia experimental no encontrada: ${LAB}`)
  process.exit(1)
}

const git = (args) =>
  execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .trim()
    .split('\n')
    .filter(Boolean)

const SNAPSHOTS = ['BASELINE', 'C1', 'C2', 'C3-BUG', 'C3-FIX', 'C4', 'C5', 'C6']
const SNAPSHOT_REF = {
  BASELINE: '1422b49',
  C1: '7dcbc07',
  C2: '71bf655',
  'C3-BUG': '3f4b527',
  'C3-FIX': '924bd64',
  C4: '51ec350',
  C5: 'a029bd9',
  C6: '36ce86f',
}

// ---------------------------------------------------------------------------
// Accidental-vs-functional classification (documented heuristics)
// ---------------------------------------------------------------------------
// domain   : packages/domain — required by the functional problem itself.
// framework: files that exist only because of the framework's structure
//            (Angular templates, component boilerplate, state integration,
//            app shell wiring, styles, Angular test scaffolding).
// mixed    : framework-agnostic logic co-located with framework usage
//            (.tsx, services/filters, store tests) — cannot be separated
//            mechanically, reported separately.
function classifyFile(path) {
  if (path.startsWith('packages/domain')) return 'domain'
  if (path.endsWith('.html')) return 'framework'
  if (path.includes('.component.ts') && !path.includes('.spec.ts')) return 'framework'
  if (path.includes('.component.spec.ts')) return 'framework'
  if (path.includes('domain.store') || path.includes('domain-data.adapter')) return 'framework'
  if (path.includes('/hooks/')) return 'framework'
  if (path.includes('/adapters/')) return 'framework'
  if (path.endsWith('.css')) return 'framework'
  if (path.includes('/app/App') || path.includes('/app/app.')) return 'framework'
  if (path.endsWith('.tsx')) return 'mixed'
  if (path.endsWith('filters.ts') || path.endsWith('filters.test.ts')) return 'mixed'
  if (path.endsWith('.spec.ts') || path.endsWith('.test.ts') || path.endsWith('.test.tsx')) {
    return 'mixed'
  }
  return 'mixed'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAt(ref, file) {
  return execFileSync('git', ['-C', LAB, 'show', `${ref}:${file}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function countLoc(ref, fileList) {
  let total = 0
  for (const file of fileList) {
    try {
      total += readAt(ref, file).split('\n').length
    } catch {
      // missing in this ref
    }
  }
  return total
}

function branchesIn(source) {
  // McCabe-ish proxy: if/else if/ternary/&&/|| short-circuits per file.
  const matches = source.match(/\bif\s*\(|\?|\?\?|&&|\|\|/g)
  return matches === null ? 0 : matches.length
}

function newSymbols(prevRef, curRef, path) {
  let before = []
  try {
    before = readAt(prevRef, path).split('\n')
  } catch {
    // file did not exist before (newly added)
  }
  let after = []
  try {
    after = readAt(curRef, path).split('\n')
  } catch {
    // file deleted in the current ref
    return 0
  }
  const beforeSet = new Set(
    before.filter((l) => /^export (function|const|class|interface|type)/.test(l)),
  )
  const afterSymbols = after.filter((l) => /^export (function|const|class|interface|type)/.test(l))
  return afterSymbols.filter((l) => !beforeSet.has(l)).length
}

// ---------------------------------------------------------------------------
// Transition analysis
// ---------------------------------------------------------------------------

function transitionDelta(prev, cur, label) {
  const prevRef = SNAPSHOT_REF[prev]
  const curRef = SNAPSHOT_REF[cur]
  const files = git(['diff', '--name-status', prevRef, curRef])
  const parsed = files
    .map((line) => {
      const [status, ...rest] = line.split('\t')
      return { status: status[0], path: rest.join('\t') }
    })
    .filter((f) => f.path.startsWith('apps/') || f.path.startsWith('packages/'))
  const added = parsed.filter((f) => f.status === 'A').map((f) => f.path)
  const deleted = parsed.filter((f) => f.status === 'D').map((f) => f.path)
  const modified = parsed.filter((f) => f.status === 'M' || f.status === 'R').map((f) => f.path)
  const all = [...added, ...deleted, ...modified]

  const numstat = git(['diff', '--numstat', prevRef, curRef])
    .map((l) => l.split('\t'))
    .filter((s) => s.length === 3)
  let locAdded = 0
  let locRemoved = 0
  for (const [add, del] of numstat) {
    if (add === '-') continue
    locAdded += Number(add)
    locRemoved += Number(del)
  }

  const locDelta = (prefix) =>
    numstat
      .filter(([, , path]) => path.startsWith(prefix))
      .reduce((acc, [add, del]) => acc + (Number(add) || 0) - (Number(del) || 0), 0)

  // imports added/removed (diff lines)
  const diffLines = git(['diff', '-U0', prevRef, curRef, '--', 'apps', 'packages'])
  const importsAdded = diffLines.filter((l) => l.startsWith('+') && /import\s/.test(l)).length
  const importsRemoved = diffLines.filter((l) => l.startsWith('-') && /import\s/.test(l)).length

  const testFilesChanged = all.filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f))
  const reactPaths = all.filter((f) => f.startsWith('apps/react-app'))
  const angularPaths = all.filter((f) => f.startsWith('apps/angular-app'))
  const domainPaths = all.filter((f) => f.startsWith('packages/domain'))

  const features = ['dashboard', 'projects', 'teams', 'tasks', 'reports', 'settings', 'board']
  const featuresReact = features.filter((f) =>
    reactPaths.some((p) => p.includes(`/features/${f}/`)),
  )
  const featuresAngular = features.filter((f) =>
    angularPaths.some((p) => p.includes(`/features/${f}/`)),
  )

  const classification = { domain: 0, framework: 0, mixed: 0, files: {} }
  const classificationLoc = {
    domain: { add: 0, del: 0 },
    framework: { add: 0, del: 0 },
    mixed: { add: 0, del: 0 },
  }
  for (const file of all) {
    const kind = classifyFile(file)
    classification[kind] += 1
    classification.files[file] = kind
  }
  for (const [add, del, path] of numstat) {
    if (add === '-') continue
    if (!path.startsWith('apps/') && !path.startsWith('packages/')) continue
    const kind = classifyFile(path)
    classificationLoc[kind].add += Number(add)
    classificationLoc[kind].del += Number(del)
  }

  // complexity proxy on the modified files (final state)
  const complexity = modified
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .reduce((acc, f) => {
      try {
        acc[f] = branchesIn(readAt(curRef, f))
      } catch {
        // deleted
      }
      return acc
    }, {})

  // new exported symbols per framework, restricted to the feature surface
  // (files under /features/) so shell types (e.g. the Section union) do not
  // count as feature work.
  const symbolFiles = new Set([
    ...reactPaths.filter((f) => f.includes('/features/') && /\.(tsx|ts)$/.test(f)),
    ...angularPaths.filter((f) => f.includes('/features/') && /\.ts$/.test(f)),
  ])
  let symbolsReact = 0
  let symbolsAngular = 0
  for (const f of symbolFiles) {
    if (f.startsWith('apps/react-app')) symbolsReact += newSymbols(prevRef, curRef, f)
    else if (f.startsWith('apps/angular-app')) symbolsAngular += newSymbols(prevRef, curRef, f)
  }

  return {
    transition: `${prev}->${cur}`,
    label,
    filesChanged: all.length,
    filesAdded: added.length,
    filesDeleted: deleted.length,
    filesModified: modified.length,
    filesChangedReact: reactPaths.length,
    filesChangedAngular: angularPaths.length,
    filesChangedDomain: domainPaths.length,
    locAdded,
    locRemoved,
    locNet: locAdded - locRemoved,
    locDeltaReact: locDelta('apps/react-app'),
    locDeltaAngular: locDelta('apps/angular-app'),
    locDeltaDomain: locDelta('packages/domain'),
    importsAdded,
    importsRemoved,
    testsChanged: testFilesChanged.length,
    testsAdded: testFilesChanged.filter((f) => added.includes(f)).length,
    testsDeleted: testFilesChanged.filter((f) => deleted.includes(f)).length,
    testsModified: testFilesChanged.filter((f) => modified.includes(f)).length,
    featuresReactTouched: featuresReact,
    featuresAngularTouched: featuresAngular,
    unrelatedFeaturesTouched: featuresReact.filter((f) => !labelTargetsReact(prev, f)).length,
    classification,
    classificationLoc,
    complexityProxy: complexity,
    symbolsNew: { react: symbolsReact, angular: symbolsAngular },
  }
}

// Which feature each scenario targets (for the unrelated-features metric).
// The prev-state name identifies the scenario (BASELINE->C1 = C1, C1->C2 = C2,
// C2->C3-BUG = C3-BUG, ...).
function labelTargetsReact(prev, feature) {
  switch (prev) {
    case 'BASELINE':
      return feature === 'board'
    case 'C1':
      return feature === 'tasks'
    case 'C2':
      return feature === 'tasks'
    case 'C3-BUG':
      return feature === 'tasks' || feature === 'dashboard'
    case 'C3-FIX':
      return feature === 'dashboard'
    case 'C4':
      return feature === 'tasks'
    case 'C5':
      return feature === 'settings'
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const gitLog = git(['log', '--oneline', '-9'])
const order = ['BASELINE', 'C1', 'C2', 'C3-BUG', 'C3-FIX', 'C4', 'C5', 'C6']
const labels = {
  'BASELINE->C1': 'C1: new Board feature',
  'C1->C2': 'C2: modify Tasks (sort control)',
  'C2->C3-BUG': 'C3-BUG: inject case-sensitive search',
  'C3-BUG->C3-FIX': 'C3-FIX: restore case-insensitive search',
  'C3-FIX->C4': 'C4: refactor dashboard KPIs',
  'C4->C5': 'C5: UI-only density toggle',
  'C5->C6': 'C6: remove Settings feature',
}

const transitions = {}
for (let i = 1; i < order.length; i += 1) {
  const key = `${order[i - 1]}->${order[i]}`
  transitions[key] = transitionDelta(order[i - 1], order[i], labels[key])
}

// C3 specific: measured during the experiment (deterministic).
const c3 = {
  testsFailedBeforeFix: { react: 1, angular: 1, note: 'exactly the injected regression test' },
  testsFailedAfterFix: { react: 0, angular: 0 },
  filesInspectedToLocate: {
    react: [
      'apps/react-app/src/services/filters.ts',
      'apps/react-app/src/features/tasks/tasks-page.tsx',
    ],
    angular: [
      'apps/angular-app/src/app/services/filters.ts',
      'apps/angular-app/src/app/features/tasks/tasks.component.html',
    ],
    note: 'symptom (search UI) -> cause (filters service): 1 file away, 1 layer boundary',
  },
  distanceCauseToSymptom: {
    layers: 1,
    files: 1,
    note: 'the bug lived in the presentation filter service; the symptom appeared in the Tasks view that consumes it',
  },
  bugEquivalentInBoth: true,
}

// Aggregate: per-framework totals across the 6 scenarios (C3 counted once as
// the fix; the injection is a deliberate defect, not a maintenance task).
const scenarioTransitions = ['BASELINE->C1', 'C1->C2', 'C3-FIX->C4', 'C4->C5', 'C5->C6']
const aggregate = {
  perScenario: scenarioTransitions.map((key) => ({
    label: transitions[key].label,
    react: {
      files: transitions[key].filesChangedReact,
      loc: transitions[key].locDeltaReact,
      tests: transitions[key].testsChanged,
    },
    angular: {
      files: transitions[key].filesChangedAngular,
      loc: transitions[key].locDeltaAngular,
      tests: transitions[key].testsChanged,
    },
  })),
}

const result = {
  experiment: 'maintainability-phase13',
  capturedAt: new Date().toISOString(),
  objective:
    'Medir el coste cognitivo y estructural de 6 tareas heterogéneas de mantenimiento (C1 nueva feature, C2 modificación, C3 bug fix, C4 refactor, C5 UI-only, C6 eliminación) implementadas idénticamente en React y Angular sobre el mismo dominio, separando trabajo funcional de trabajo accidental con heurísticas documentadas y proxies reproducibles (tiempo humano NO MEDIBLE).',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    memoryBytes: totalmem(),
    labPath: LAB,
    labHead: gitLog[0],
    labCommits: gitLog,
    note: 'Copia aislada con historial propio (un commit por escenario). El árbol principal no se modifica.',
  },
  snapshots: SNAPSHOTS.map((name) => ({
    name,
    commit: git(['rev-parse', '--short', SNAPSHOT_REF[name]])[0],
  })),
  transitions,
  c3,
  aggregate,
  accidentalWorkMethodology: {
    classification: {
      domain: 'packages/domain — requerido por el problema funcional',
      framework:
        'archivos que existen solo por la estructura del framework (.html, boilerplate de componente, integración de estado store/hook/adapter, shell de la app, estilos, specs de componente)',
      mixed:
        'lógica agnóstica co-localizada con uso del framework (.tsx, services/filters, tests de store) — no separable mecánicamente, se reporta aparte',
    },
    limitation:
      'La clasificación es por heurística de archivo, no por análisis semántico; los .tsx mezclan JSX y lógica, por eso se marcan mixed en lugar de atribuirlos.',
  },
  limitations: [
    'time_to_implement es NO MEDIBLE: no hay operador humano cronometrado; se usan proxies estructurales reproducibles.',
    'La clasificación accidental-vs-funcional es heurística y puede discutirse caso a caso; los archivos mixtos se reportan por separado.',
    'El proxy de complejidad (ramas if/ternario/&&/||) es una aproximación McCabe limitada, no complejidad ciclomática real.',
    'C3 se ejecutó con un bug deliberadamente equivalente en ambos frameworks; los tiempos de localización reales de un equipo no están medidos.',
    'Una sola máquina, un solo par de implementaciones; los deltas dependen del estilo del experimento.',
    'La feature Board (C1) permanece en los estados posteriores (escenarios acumulativos), como en Fases 11-12.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${JSON.stringify(result, null, 2)}\n`)
console.log(`→ ${RESULTS_FILE.replace(ROOT, '.')}`)
console.log(
  JSON.stringify(
    {
      transitions: Object.fromEntries(
        Object.entries(transitions).map(([k, v]) => [
          k,
          {
            files: `${v.filesChanged} (R${v.filesChangedReact} A${v.filesChangedAngular} D${v.filesChangedDomain})`,
            loc: v.locNet,
            locR: v.locDeltaReact,
            locA: v.locDeltaAngular,
            tests: `${v.testsChanged} (+${v.testsAdded} -${v.testsDeleted} ~${v.testsModified})`,
            classification: v.classification,
            symbols: v.symbolsNew,
            unrelatedFeatures: v.unrelatedFeaturesTouched,
          },
        ]),
      ),
    },
    null,
    1,
  ).slice(0, 2000),
)
process.exit(0)
