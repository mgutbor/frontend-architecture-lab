#!/usr/bin/env node
// Baseline attribution analysis for the Frontend Architecture Lab (Fase 5.4).
// Zero runtime dependencies: only Node built-ins (fs, path, zlib).
//
// Usage: node scripts/analyze-bundle-baseline.mjs
// Output: docs/experiments/results/baseline-attribution-phase5.json
//
// Methodology: reuses EXACTLY the same attribution mechanism as Fase 5.3
// (scripts/analyze-bundle.mjs):
// - Angular: esbuild metafile from `ng build --stats-json` (exact
//   bytesInOutput per input module).
// - React: source map + VLQ decode from `vite build --sourcemap`
//   (approximation, with measured correction for the embedded fixture).
//
// Baselines are rebuilt from the historical commit abd78e3 (Fase 2) in
// git worktrees (/tmp/lab-baseline-react, /tmp/lab-baseline-angular) using
// the same toolchain versions as the monoliths (verified identical
// package.json dependencies), so baseline vs monolith is comparable within
// each framework. See docs/experiments/baseline-attribution-phase5.md.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, totalmem } from 'node:os'

import { assetTotals, analyzeReact, analyzeAngular, prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'baseline-attribution-phase5.json')

const BASELINE_REACT = '/tmp/lab-baseline-react/apps/react-app/dist'
const BASELINE_ANGULAR = '/tmp/lab-baseline-angular/apps/angular-app/dist/angular-app/browser'
const MONOLITH_REACT = join(ROOT, 'apps/react-app/dist')
const MONOLITH_ANGULAR = join(ROOT, 'apps/angular-app/dist/angular-app/browser')

const BASELINE_COMMIT = 'abd78e3'
const REACT_MONOLITH_COMMIT = '60053b1'
const ANGULAR_MONOLITH_COMMIT = 'worktree (Fase 5, sin commit)'

function main() {
  for (const [label, dir] of [
    ['React baseline', BASELINE_REACT],
    ['React monolith', MONOLITH_REACT],
    ['Angular baseline', BASELINE_ANGULAR],
    ['Angular monolith', MONOLITH_ANGULAR],
  ]) {
    if (!existsSync(dir)) {
      console.error(`FATAL: ${label} dist no existe: ${dir}`)
      console.error('Reconstruye los baselines en worktrees (ver anexo del informe).')
      process.exit(1)
    }
  }

  const reactBaseline = {
    ...assetTotals(BASELINE_REACT),
    composition: analyzeReact(BASELINE_REACT),
  }
  const reactMonolith = {
    ...assetTotals(MONOLITH_REACT),
    composition: analyzeReact(MONOLITH_REACT),
  }
  const angularBaseline = {
    ...assetTotals(BASELINE_ANGULAR),
    composition: analyzeAngular(BASELINE_ANGULAR),
  }
  const angularMonolith = {
    ...assetTotals(MONOLITH_ANGULAR),
    composition: analyzeAngular(MONOLITH_ANGULAR),
  }

  // Normalize category keys: Angular uses 'app code' with the same name.
  const catOf = (c) => (c.available ? Object.keys(c.categoriesCorrected ?? c.categories) : [])
  const allCats = [
    ...new Set([
      ...catOf(reactBaseline.composition),
      ...catOf(reactMonolith.composition),
      ...catOf(angularBaseline.composition),
      ...catOf(angularMonolith.composition),
    ]),
  ]

  const categoryDelta = {}
  for (const cat of allCats) {
    const rb =
      reactBaseline.composition.categoriesCorrected?.[cat] ??
      reactBaseline.composition.categories?.[cat] ??
      0
    const rm =
      reactMonolith.composition.categoriesCorrected?.[cat] ??
      reactMonolith.composition.categories?.[cat] ??
      0
    const ab = angularBaseline.composition.categories?.[cat] ?? 0
    const am = angularMonolith.composition.categories?.[cat] ?? 0
    categoryDelta[cat] = {
      reactBaseline: rb,
      reactMonolith: rm,
      reactDelta: rm - rb,
      angularBaseline: ab,
      angularMonolith: am,
      angularDelta: am - ab,
      differenceDelta: am - ab - (rm - rb),
    }
  }

  const result = {
    experiment: 'baseline-attribution-phase5',
    capturedAt: new Date().toISOString(),
    commits: {
      baseline: BASELINE_COMMIT,
      reactMonolith: REACT_MONOLITH_COMMIT,
      angularMonolith: ANGULAR_MONOLITH_COMMIT,
    },
    frameworkVersions: {
      react: 'react 19.2.8, react-dom 19.2.8, vite 8.2.2 (rolldown 1.2.5)',
      angular: '@angular/core 21.2.21, @angular/cli 21.2.21, typescript 5.9.2',
      domain: 'workspace:* (idéntico entre baseline y monolith, verificado con git diff)',
    },
    environment: {
      node: process.version,
      pnpm: 'pnpm@10.34.5 (packageManager en package.json raíz)',
      platform: `${process.platform}-${process.arch}`,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      cpuCores: cpus().length,
      memoryBytes: totalmem(),
    },
    tools: {
      react: 'source map + VLQ decode (vite build --sourcemap), mismo mecanismo que Fase 5.3',
      angular: 'esbuild metafile (ng build --stats-json), mismo mecanismo que Fase 5.3',
    },
    frameworks: {
      react: { baseline: reactBaseline, monolith: reactMonolith },
      angular: { baseline: angularBaseline, monolith: angularMonolith },
    },
    categoryDelta,
    totals: {
      react: {
        jsRawBaseline: reactBaseline.js.totalRawBytes,
        jsRawMonolith: reactMonolith.js.totalRawBytes,
        deltaRaw: reactMonolith.js.totalRawBytes - reactBaseline.js.totalRawBytes,
      },
      angular: {
        jsRawBaseline: angularBaseline.js.totalRawBytes,
        jsRawMonolith: angularMonolith.js.totalRawBytes,
        deltaRaw: angularMonolith.js.totalRawBytes - angularBaseline.js.totalRawBytes,
      },
    },
    method:
      'Atribución baseline→monolith con el MISMO mecanismo por framework (React: source map VLQ; Angular: metafile esbuild). Baselines reconstruidos en worktrees git desde el commit abd78e3 (Fase 2) con las mismas versiones de toolchain que los monoliths (verificado). gzip/brotli via Node zlib default level, igual que metrics.md.',
    notes: [
      'React app code baseline = 0 B en la atribución VLQ: el source map del baseline NO contiene segmentos para las fuentes de la app (0 de 48 169 segmentos) — limitación del mapa generado por rolldown, no del código. El app code minificado real del baseline NO es medible por esta vía.',
      'React: runtime y domain VERIFICADOS constantes entre baseline y monolith (sourcesContent byte-idénticos: runtime 574 367 = 574 367 B, domain 34 601 = 34 601 B; fixture literal 9 336 vs 9 335 B). Por tanto el delta React +24 985 B es app code (residual). El "+8 966 B runtime" que muestra la VLQ es artefacto de cobertura del mapa del baseline, no crecimiento real.',
      'Angular: delta +43 013 B descompuesto exacto por metafile: app code +36 571 B (85,0%), retención de runtime @angular/core +4 102 B (core.mjs +465, _debug_node-chunk +2 942, _resource-chunk +570, _effect-chunk +123; platform-browser +2), retención de domain +2 322 B (validation.js 220→2 229, transitions.js 117→294, reports.js 867→1 003), rxjs +18 B. La retención es tree-shaking: el monolith usa más superficie del mismo código (sin dependencias ni versiones nuevas).',
      'ΔΔ (ΔAngular − ΔReact) = +18 028 B = app code +11 586 + runtime +4 102 + domain +2 322 + rxjs +18 (exacto por construcción).',
    ],
    limitations: [
      'React: la atribución VLQ es aproximada (±5-10 kB en app code); el baseline se reconstruyó con el toolchain actual (versiones idénticas a las del monolith, verificado en git), no con los bins históricos.',
      'React: el app code minificado del baseline no es medible (source map sin segmentos de app); se reporta como residual = delta total − (runtime + domain, verificados constantes).',
      'Angular: atribución exacta por módulo (metafile); templates AOT compilados dentro de los .component.ts (sin desglose template/lógica).',
      'El fixture JSON (≈9.3 kB) está embebido en ambos bundles (baseline y monolith) y contado dentro de @operations-hub/domain.',
      'Los nombres de archivo de los assets del baseline difieren de los históricos (outputHashing); los bytes totales coinciden con los oficiales de Fase 2 (React 208 605 B, Angular 136 621 B).',
      'gzip/brotli solo se miden por asset (compresión global), no por categoría: comprimir módulos por separado no es representativo de la transferencia real.',
    ],
  }

  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)
  console.log(`Baseline attribution → ${relative(ROOT, RESULTS_FILE)}\n`)

  const fmt = (n) => String(n).padStart(8)
  console.log('Tabla por categoría (raw):')
  console.log(
    `${'categoría'.padEnd(24)} ${'React base'.padStart(10)} ${'React mono'.padStart(10)} ${'Δ React'.padStart(9)} | ${'Ang base'.padStart(9)} ${'Ang mono'.padStart(9)} ${'Δ Angular'.padStart(9)} | ${'ΔΔ'.padStart(9)}`,
  )
  for (const cat of allCats) {
    const d = categoryDelta[cat]
    console.log(
      `${cat.padEnd(24)} ${fmt(d.reactBaseline)} ${fmt(d.reactMonolith)} ${fmt(d.reactDelta)} | ${fmt(d.angularBaseline)} ${fmt(d.angularMonolith)} ${fmt(d.angularDelta)} | ${fmt(d.differenceDelta)}`,
    )
  }
  console.log(
    `${'TOTAL JS'.padEnd(24)} ${fmt(result.totals.react.jsRawBaseline)} ${fmt(result.totals.react.jsRawMonolith)} ${fmt(result.totals.react.deltaRaw)} | ${fmt(result.totals.angular.jsRawBaseline)} ${fmt(result.totals.angular.jsRawMonolith)} ${fmt(result.totals.angular.deltaRaw)} | ${fmt(result.totals.angular.deltaRaw - result.totals.react.deltaRaw)}`,
  )
}

main()
