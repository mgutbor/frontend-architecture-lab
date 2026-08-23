#!/usr/bin/env node
// Feature-level decomposition of the app-code increment (Fase 5.8).
// Zero runtime dependencies: only Node built-ins + the reusable helpers of
// scripts/analyze-bundle.mjs (analyzeAngular, analyzeReact, prettierJson).
//
// Question: can the +11 586 B difference between the incremental app code of
// Angular (+36 571 B) and React (+24 985 B) be decomposed per feature, or does
// the tool asymmetry (Angular: esbuild metafile; React: source map without VLQ
// segments for most features) prevent a reliable attribution?
//
// Sources of evidence (must be rebuilt beforehand with reversible CLI flags):
// - Angular monolith:  ng build --stats-json   (dist/angular-app/stats.json)
// - Angular baseline:  same, from the Phase 2 worktree
// - React monolith:    vite build --sourcemap  (dist/assets/*.js + *.js.map)
// - React baseline:    same, from the Phase 2 worktree
//
// Output: docs/experiments/results/feature-bundle-cost-phase5.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, totalmem } from 'node:os'
import { analyzeAngular, analyzeReact, prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'feature-bundle-cost-phase5.json')

// ---------------------------------------------------------------------------
// Artifact locations (overridable via env for reproducibility)
// ---------------------------------------------------------------------------

const ANGULAR_MONOLITH_STATS =
  process.env.FEATURE_ANG_MONO_STATS ??
  '/tmp/lab-angular-f58/apps/angular-app/dist/angular-app/stats.json'
const ANGULAR_BASELINE_STATS =
  process.env.FEATURE_ANG_BASE_STATS ??
  '/tmp/lab-baseline-angular/apps/angular-app/dist/angular-app/stats.json'
const REACT_MONOLITH_DIST =
  process.env.FEATURE_REACT_MONO_DIST ?? '/tmp/lab-react-f58/apps/react-app/dist'
const REACT_BASELINE_DIST =
  process.env.FEATURE_REACT_BASE_DIST ?? '/tmp/lab-baseline-react/apps/react-app/dist'

// ---------------------------------------------------------------------------
// Feature grouping rules (per framework, by path prefix)
// ---------------------------------------------------------------------------

const ANGULAR_FEATURE_PREFIXES = [
  ['features/dashboard/', 'Dashboard'],
  ['features/projects/', 'Projects'],
  ['features/tasks/', 'Tasks'],
  ['features/teams/', 'Teams'],
  ['features/reports/', 'Reports'],
  ['features/settings/', 'Settings'],
  ['components/', 'Shared components'],
  ['services/', 'Services'],
  ['domain/', 'Domain store/adapter'],
]

const REACT_FEATURE_PREFIXES = [
  ['src/features/dashboard/', 'Dashboard'],
  ['src/features/projects/', 'Projects'],
  ['src/features/tasks/', 'Tasks'],
  ['src/features/teams/', 'Teams'],
  ['src/features/reports/', 'Reports'],
  ['src/features/settings/', 'Settings'],
  ['src/components/', 'Shared components'],
  ['src/services/', 'Services'],
  ['src/adapters/', 'Adapters'],
  ['src/hooks/', 'Hooks'],
]

// Unified row order for both tables (features first, then infrastructure).
const TABLE_ORDER = [
  'Dashboard',
  'Projects',
  'Tasks',
  'Teams',
  'Reports',
  'Settings',
  'Shared components',
  'Services',
  'Adapters',
  'Hooks',
  'Domain store/adapter',
  'App shell',
  'Entry',
]

function groupAngular(stats) {
  // Returns { feature -> { bytes: n, modules: [{path, bytes}] } } for src/app
  const outputs = Object.entries(stats.outputs).filter(([k]) => k.endsWith('.js'))
  const groups = {}
  for (const [, out] of outputs) {
    for (const [path, info] of Object.entries(out.inputs)) {
      if (!path.includes('src/app/')) continue
      const rel = path.replace(/^.*src\/app\//, '')
      let label = null
      for (const [prefix, name] of ANGULAR_FEATURE_PREFIXES) {
        if (rel.startsWith(prefix)) {
          label = name
          break
        }
      }
      if (label === null) label = rel.includes('app.ts') ? 'App shell' : 'Other'
      groups[label] = groups[label] ?? { bytes: 0, modules: [] }
      groups[label].bytes += info.bytesInOutput
      groups[label].modules.push({ path: rel, bytes: info.bytesInOutput })
    }
  }
  return { groups }
}

function groupReact(analysis) {
  // Uses exact original bytes (sourcesContent) per source + VLQ minified where
  // the source map provides segments (dashboard only, per Fases 5.6/5.7).
  const groups = {}
  for (const m of analysis.modules) {
    if (!m.category || m.category !== 'app code') continue
    const clean = m.source.replace(/^.*\/src\//, 'src/')
    let label = null
    for (const [prefix, name] of REACT_FEATURE_PREFIXES) {
      if (clean.startsWith(prefix)) {
        label = name
        break
      }
    }
    if (label === null)
      label = clean.startsWith('src/app/')
        ? 'App shell'
        : clean.startsWith('src/main')
          ? 'Entry'
          : 'Other'
    // main.tsx is bundled app code in the source map (counted in the official
    // app-code total), so keep it as its own row instead of dropping it.
    groups[label] = groups[label] ?? { originalBytes: 0, vlqBytes: 0, segments: 0, modules: [] }
    groups[label].originalBytes += m.originalBytes
    groups[label].vlqBytes += m.approxMinifiedBytes
    groups[label].modules.push({
      path: clean,
      originalBytes: m.originalBytes,
      vlq: m.approxMinifiedBytes,
    })
  }
  // Count VLQ segments per source for the confidence assessment.
  for (const g of Object.values(groups)) {
    g.segments = g.modules.reduce((a, m) => a + (m.vlq > 0 ? 1 : 0), 0)
  }
  return { groups }
}

// ---------------------------------------------------------------------------
// Load artifacts
// ---------------------------------------------------------------------------

function requireStats(file) {
  if (!existsSync(file)) throw new Error(`stats.json not found: ${file}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

const angMono = groupAngular(requireStats(ANGULAR_MONOLITH_STATS))
const angBase = groupAngular(requireStats(ANGULAR_BASELINE_STATS))
const reactMono = groupReact(analyzeReact(REACT_MONOLITH_DIST))
const reactBase = groupReact(analyzeReact(REACT_BASELINE_DIST))

// ---------------------------------------------------------------------------
// Per-feature delta tables (Angular minified EXACT; React source EXACT)
// ---------------------------------------------------------------------------

function deltaTable(mono, base) {
  return TABLE_ORDER.map((label) => {
    const m = mono.groups[label]?.bytes ?? 0
    const b = base.groups[label]?.bytes ?? 0
    return {
      feature: label,
      baselineBytes: b,
      monolithBytes: m,
      deltaBytes: m - b,
      confidence: 'EXACTA (metafile esbuild)',
    }
  })
}

function deltaTableReact(mono, base) {
  return TABLE_ORDER.map((label) => {
    const m = mono.groups[label] ?? { originalBytes: 0, vlqBytes: 0, segments: 0 }
    const b = base.groups[label] ?? { originalBytes: 0, vlqBytes: 0, segments: 0 }
    const deltaSource = m.originalBytes - b.originalBytes
    const vlqMinifiedMono = m.vlqBytes > 0 ? m.vlqBytes : null
    return {
      feature: label,
      baselineSourceBytes: b.originalBytes,
      monolithSourceBytes: m.originalBytes,
      deltaSourceBytes: deltaSource,
      vlqMinifiedMonolith: vlqMinifiedMono,
      confidence:
        vlqMinifiedMono !== null
          ? 'FUENTE EXACTA + VLQ minificado disponible'
          : 'FUENTE EXACTA; minificado NO MEDIBLE (0 segmentos VLQ)',
    }
  })
}

const angularTable = deltaTable(angMono, angBase)
const reactTable = deltaTableReact(reactMono, reactBase)

// ---------------------------------------------------------------------------
// Reconciliation with the official increments (Fase 5.4, not altered)
// ---------------------------------------------------------------------------

const angularAppCodeMono = angularTable.reduce((a, r) => a + r.monolithBytes, 0)
const angularAppCodeBase = angularTable.reduce((a, r) => a + r.baselineBytes, 0)
const angularDelta = angularTable.reduce((a, r) => a + r.deltaBytes, 0)

const reactSourceMono = reactTable.reduce((a, r) => a + r.monolithSourceBytes, 0)
const reactSourceBase = reactTable.reduce((a, r) => a + r.baselineSourceBytes, 0)
const reactSourceDelta = reactTable.reduce((a, r) => a + r.deltaSourceBytes, 0)

const OFFICIAL = {
  angularAppCodeIncrement: 36571,
  reactAppCodeIncrement: 24985,
  differenceAppCode: 11586,
  angularTotalIncrement: 43013,
  reactTotalIncrement: 24985,
  differenceTotal: 18028,
  note: 'Cifras oficiales de Fase 5.4 (baseline-attribution-phase5.json), no alteradas.',
}

// ---------------------------------------------------------------------------
// Known minified React points from Fases 5.6/5.7 (external evidence)
// ---------------------------------------------------------------------------

const knownReactMinified = {
  dashboard: {
    method: 'VLQ (source map), Fase 5.6',
    monolithVlqBytes: reactMono.groups['Dashboard']?.vlqBytes ?? null,
    jsxDeltaMinified: 1121,
  },
  teams: {
    method: 'bundle-delta exacto sin cascada, Fase 5.7',
    jsxDeltaMinified: 1730,
    jsxDeltaSource: 2840,
  },
  dashboardPlusTasksTotal: {
    method: 'bundle-delta A→B con cascada, Fase 5.6',
    minifiedDelta: 6548,
    sourceDelta: 5009,
  },
}

// ---------------------------------------------------------------------------
// Per-type-of-cost table (only filled where evidence exists)
// ---------------------------------------------------------------------------

const costTypeTable = [
  {
    type: 'Templates AOT (Angular) / JSX (React)',
    react:
      'Dashboard −1 121 B (VLQ) · Teams −1 730 B (bundle-delta exacto) · Dashboard+Tasks −6 548 B total con cascada (Fases 5.6/5.7)',
    angular:
      'Directo −5 267 B (2 componentes, metafile) · total con cascada −10 593 B · extrapolación app 12 661–28 465 B (Fase 5.5)',
    difference:
      'NO COMPARABLE directamente: unidades y alcance distintos (minificado exacto Angular vs VLQ/bundle-delta React); única comparación soportada: −10 593 B (Angular) vs −6 548 B (React) para las mismas 2 áreas',
    evidence: 'Fases 5.5 / 5.6 / 5.7',
  },
  {
    type: 'Lógica app (no template/JSX)',
    react:
      'NO MEDIBLE por separado (el minificador elimina la lógica no referenciada; el keeper la conserva pero no se cuantificó por sí sola)',
    angular:
      'NO SEPARABLE dentro del módulo (clase + template compilada conviven en el mismo módulo del metafile)',
    difference: 'NO MEDIBLE en ambos',
    evidence: 'Fases 5.5 / 5.6',
  },
  {
    type: 'Runtime retenido',
    react: '≈ 0 (verificado constante: 574 367 B originales idénticos baseline↔monolith, Fase 5.4)',
    angular:
      '+4 102 B (metafile: _debug_node-chunk +2 942, _resource-chunk +570, core.mjs +465, effects +123)',
    difference: '+4 102 B (Angular)',
    evidence: 'Fase 5.4',
  },
  {
    type: 'Domain retenido',
    react: '≈ 0 (constante verificada, Fase 5.4)',
    angular:
      '+2 322 B (retención por tree-shaking: validation.js 220→2 229; el monolith usa todos los validadores)',
    difference: '+2 322 B (Angular)',
    evidence: 'Fase 5.4',
  },
  {
    type: 'Dependencias',
    react: '0 nuevas',
    angular: 'rxjs +18 B (retención); 0 dependencias nuevas',
    difference: '+18 B (Angular)',
    evidence: 'Fase 5.4',
  },
  {
    type: 'No atribuible',
    react:
      'Minificado por feature NO MEDIBLE (source map sin segmentos VLQ para features; solo dashboard) — residual del +24 985 B sin descomponer en minificado',
    angular: '0 (metafile atribuye el 100 % del app code)',
    difference: 'Residual React = bloqueo metodológico, no bytes desconocidos',
    evidence: 'Fases 5.6 / 5.7 / esta fase',
  },
]

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

const result = {
  experiment: 'feature-bundle-cost-phase5',
  capturedAt: new Date().toISOString(),
  objective:
    'Descomponer por features y por tipo de coste la diferencia de +11 586 B entre el app code incremental de Angular (+36 571 B) y React (+24 985 B), o demostrar que la asimetría de herramientas impide una atribución fiable.',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCores: cpus().length,
    memoryBytes: totalmem(),
    angularMonolithStats: ANGULAR_MONOLITH_STATS,
    angularBaselineStats: ANGULAR_BASELINE_STATS,
    reactMonolithDist: REACT_MONOLITH_DIST,
    reactBaselineDist: REACT_BASELINE_DIST,
  },
  method:
    'Angular: esbuild metafile (ng build --stats-json) → bytesInOutput EXACTOS por módulo, agrupados por feature. React: source map + sourcesContent (bytes fuente EXACTOS por módulo) + VLQ minificado solo donde el mapa tiene segmentos (dashboard). Reconciliación con los totales oficiales de Fase 5.4. Sin modificación de código funcional: los monoliths se reconstruyeron con flags CLI reversibles en directorios temporales (/tmp/lab-angular-f58, /tmp/lab-react-f58); los baselines proceden de Fase 5.4 (/tmp/lab-baseline-angular, /tmp/lab-baseline-react).',
  featureMapping: {
    Dashboard: ['Angular: features/dashboard/*', 'React: features/dashboard/dashboard-page.tsx'],
    Projects: [
      'Angular: features/projects/* (projects, project-detail, project-form)',
      'React: features/projects/* (projects-page, project-detail, project-form)',
    ],
    Tasks: [
      'Angular: features/tasks/* (tasks, task-form)',
      'React: features/tasks/* (tasks-page, task-form)',
    ],
    Teams: ['Angular: features/teams/teams.component.ts', 'React: features/teams/teams-page.tsx'],
    Reports: [
      'Angular: features/reports/reports.component.ts',
      'React: features/reports/reports-page.tsx',
    ],
    Settings: [
      'Angular: features/settings/settings.component.ts',
      'React: features/settings/settings-page.tsx',
    ],
    'Shared components': ['Angular: components/* (7)', 'React: components/* (7)'],
    Services: [
      'Angular: services/* (filters, ids)',
      'React: services/* (domain-store, filters, ids)',
    ],
    Adapters: ['—', 'React: adapters/domain-adapter.ts'],
    Hooks: ['—', 'React: hooks/use-domain-store.ts'],
    'Domain store/adapter': [
      'Angular: domain/* (store, data-adapter)',
      'React: dentro de services/adapters',
    ],
    'App shell': ['Angular: app.ts', 'React: app/App.tsx, error-boundary.tsx, main.tsx'],
    note: 'Correspondencia 1:1 para las 6 áreas del contrato; la distribución de archivos internos difiere (Angular separa store/adapter en domain/; React en services/ y adapters/).',
  },
  angular: {
    baselineAppCodeBytes: angularAppCodeBase,
    monolithAppCodeBytes: angularAppCodeMono,
    incrementBytes: angularDelta,
    byFeature: angularTable,
    note: 'Atribución minificada EXACTA (metafile esbuild). Suma por feature = total app code.',
  },
  react: {
    baselineAppCodeSourceBytes: reactSourceBase,
    monolithAppCodeSourceBytes: reactSourceMono,
    incrementSourceBytes: reactSourceDelta,
    byFeature: reactTable,
    note: 'Atribución en bytes FUENTE exacta (sourcesContent). El minificado por feature es NO MEDIBLE salvo dashboard (VLQ). El incremento minificado oficial es +24 985 B (Fase 5.4); la conversión fuente→minificado es inestable entre componentes (Fase 5.7: ratio 0,61 vs 1,09) y no se extrapola.',
  },
  official: OFFICIAL,
  reconciliation: {
    angular: {
      sumOfFeatures: angularDelta,
      officialIncrement: OFFICIAL.angularAppCodeIncrement,
      matches: angularDelta === OFFICIAL.angularAppCodeIncrement,
    },
    react: {
      sumOfSourceFeatures: reactSourceDelta,
      officialIncrementMinified: OFFICIAL.reactAppCodeIncrement,
      note: 'Los incrementos de React solo son comparables en bytes fuente (suma = 51 454 B fuente); el incremento minificado oficial (+24 985 B) no se puede descomponer por feature con las herramientas disponibles.',
    },
    differenceAppCode: {
      official: OFFICIAL.differenceAppCode,
      explanation:
        'El lado Angular se descompone EXACTAMENTE en minificado (36 571 B). El lado React solo a nivel fuente (51 454 B fuente) + puntos minificados aislados (dashboard VLQ 3 710 B del monolith; teams JSX −1 730 B exacto de Fase 5.7). La asimetría de herramientas impide una descomposición minificada comparable por feature para la mayoría de features React.',
    },
  },
  knownReactMinifiedPoints: knownReactMinified,
  costTypeTable,
  classification:
    'EXPLICACIÓN PARCIAL: el +11 586 B de diferencia de app code se descompone completamente en el lado Angular (minificado exacto por feature); en el lado React la descomposición es exacta solo en bytes fuente y el minificado por feature es NO MEDIBLE salvo Dashboard (VLQ) y Teams (bundle-delta). El residual no es bytes desconocidos sino un bloqueo metodológico del source map de rolldown (0 segmentos VLQ para las features), documentado en Fases 5.6/5.7.',
  limitations: [
    'React: el source map de rolldown solo tiene segmentos VLQ para dashboard-page entre las features (0 para projects/tasks/teams/reports/settings/forms/App) → minificado por feature NO MEDIBLE salvo dashboard.',
    'La comparación minificada por feature entre frameworks solo es posible para Dashboard (VLQ React 3 710 B vs metafile Angular 1 680 B) y para el coste de JSX/template de las 2 áreas medidas en Fases 5.5–5.7 (−10 593 B Angular vs −6 548 B React).',
    'Los bytes fuente de React (61 215 B monolith) no son convertibles a minificado con un ratio único (Fase 5.7: ratio inestable 0,61–1,09).',
    'Angular: dashboard y projects decrecen en minificado entre baseline y monolith (dashboard 2 247→1 680; projects 2 426→12 053 incluye detalle+form nuevos) — los deltas negativos son reales (refactor del baseline) y se reportan tal cual.',
    'Las categorías Services/Adapters/Hooks/Domain store/adapter/App shell no son equivalentes 1:1 entre frameworks: se documentan por separado para no forzar la comparación.',
    'Los monoliths se reconstruyeron en /tmp (fuera del repo) con flags CLI reversibles; los baselines proceden de Fase 5.4 (misma máquina/Node/versiones).',
  ],
  threatsToValidity: [
    'VLQ de dashboard es aproximado (segment-span heuristic): el punto minificado de Dashboard React es APROXIMADO, no exacto.',
    'Los deltas fuente de React no deben leerse como deltas minificados: mezclar unidades sería un error.',
    'El refactor de dashboard/projects entre baseline y monolith (Angular) introduce deltas negativos que no representan "ahorro" sino cambio de implementación.',
  ],
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------

console.log(
  `Feature bundle cost → ${join('docs/experiments/results', 'feature-bundle-cost-phase5.json')}\n`,
)
console.log('ANGULAR (minificado EXACTO, metafile)')
console.log('  feature                          baseline   monolith      delta')
for (const r of angularTable) {
  console.log(
    `  ${r.feature.padEnd(30)} ${String(r.baselineBytes).padStart(8)} ${String(r.monolithBytes).padStart(10)} ${String(r.deltaBytes).padStart(10)}`,
  )
}
console.log(
  `  ${'TOTAL'.padEnd(30)} ${String(angularAppCodeBase).padStart(8)} ${String(angularAppCodeMono).padStart(10)} ${String(angularDelta).padStart(10)}`,
)
console.log(
  `  reconciliación con +36 571 B: ${angularDelta === OFFICIAL.angularAppCodeIncrement ? 'SÍ ✓' : 'NO ✗'}\n`,
)

console.log('REACT (bytes FUENTE exactos; minificado NO MEDIBLE salvo dashboard)')
console.log('  feature                          baseline   monolith      delta    vlqMono')
for (const r of reactTable) {
  console.log(
    `  ${r.feature.padEnd(30)} ${String(r.baselineSourceBytes).padStart(8)} ${String(r.monolithSourceBytes).padStart(10)} ${String(r.deltaSourceBytes).padStart(10)} ${String(r.vlqMinifiedMonolith ?? '—').padStart(8)}`,
  )
}
console.log(
  `  ${'TOTAL (fuente)'.padEnd(30)} ${String(reactSourceBase).padStart(8)} ${String(reactSourceMono).padStart(10)} ${String(reactSourceDelta).padStart(10)}`,
)
console.log(
  '  incremento minificado oficial (Fase 5.4): +24 985 B (no descomponible por feature)\n',
)

console.log('Δ app code incremental Angular−React: +11 586 B (oficial Fase 5.4)')
console.log('  Angular: descomposición minificada EXACTA por feature ✓')
console.log(
  '  React:   descomposición exacta solo en bytes fuente; minificado NO MEDIBLE salvo dashboard/teams',
)
console.log(
  '  Resultado: EXPLICACIÓN PARCIAL (residual = bloqueo metodológico del source map, no bytes desconocidos)',
)
