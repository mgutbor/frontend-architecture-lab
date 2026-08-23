#!/usr/bin/env node
// AOT template cost isolation for the Frontend Architecture Lab (Fase 5.5).
// Zero runtime dependencies: only Node built-ins (fs, path, os, url).
//
// Usage: node scripts/analyze-aot-template-cost.mjs
// Output: docs/experiments/results/aot-template-cost-phase5.json
//
// The experiment builds three variants of the Angular Monolith in a TEMPORARY
// directory outside the repo (see docs/experiments/aot-template-cost-phase5.md,
// anexo de reproducibilidad):
//   A — real monolith (templateUrl real para dashboard y tasks)
//   B — template-minimal (template: '' para dashboard y tasks, misma lógica TS)
//   C — template-rich   (templates artificialmente más ricas, misma lógica TS)
// Each variant emits dist/angular-app/stats.json (esbuild metafile) and the
// production bundle main.js. Artifacts are read from:
//   <AOT_ARTIFACTS_DIR>/artifacts-{A,B,C}/{stats.json, main.js}
// (default AOT_ARTIFACTS_DIR=/tmp/lab-angular-aot)
//
// Attribution mechanism is the same as Fase 5.3/5.4: esbuild metafile
// bytesInOutput per input module (exact for Angular).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, totalmem } from 'node:os'

import { prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'aot-template-cost-phase5.json')
const APP_SRC = join(ROOT, 'apps/angular-app/src/app')
const ARTIFACTS = process.env.AOT_ARTIFACTS_DIR ?? '/tmp/lab-angular-aot'

const VARIANTS = ['A', 'B', 'C']

// Componentes seleccionados (ver informe, sección 5): uno sencillo
// (dashboard, 34 LOC template) y uno con template compleja (tasks, 102 LOC).
const SELECTED = {
  dashboard: { label: 'src/app/features/dashboard/dashboard.component.ts', templateLoc: 34 },
  tasks: { label: 'src/app/features/tasks/tasks.component.ts', templateLoc: 102 },
}

// Componentes hijos que solo son referenciados por las templates seleccionadas
// (se eliminan por tree-shaking en la variante B).
const CASCADE = [
  'src/app/features/tasks/task-form.component.ts',
  'src/app/components/kpi-card.component.ts',
]

function round(value, decimals = 1) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function loadVariant(name) {
  const dir = join(ARTIFACTS, `artifacts-${name}`)
  const statsFile = join(dir, 'stats.json')
  const jsFile = join(dir, 'main.js')
  if (!existsSync(statsFile) || !existsSync(jsFile)) {
    console.error(`FATAL: faltan artefactos de la variante ${name} en ${dir}`)
    console.error('Reconstruye las variantes experimentales (ver anexo del informe).')
    process.exit(1)
  }
  const stats = JSON.parse(readFileSync(statsFile, 'utf8'))
  const js = readFileSync(jsFile, 'utf8')
  const out = Object.entries(stats.outputs).find(([k]) => k.endsWith('.js'))[1]
  const mods = Object.entries(out.inputs)
  const byModule = {}
  let appCode = 0
  let core = 0
  let domain = 0
  let rxjs = 0
  let entry = 0
  for (const [p, i] of mods) {
    if (p.includes('src/app/')) {
      byModule[p.replace(/^.*src\//, 'src/')] = i.bytesInOutput
      appCode += i.bytesInOutput
    } else if (
      p.includes('@angular/core/fesm2022') ||
      p.includes('@angular/platform-browser') ||
      p.includes('@angular/common')
    ) {
      core += i.bytesInOutput
    } else if (p.includes('/packages/domain/')) {
      domain += i.bytesInOutput
    } else if (p.includes('node_modules/rxjs')) {
      rxjs += i.bytesInOutput
    } else if (p.endsWith('src/main.ts')) {
      entry += i.bytesInOutput
    }
  }
  const yyOccurrences = (js.match(/ɵɵ/g) ?? []).length
  const yyDistinct = new Set(js.match(/ɵɵ[a-zA-Z0-9]+/g) ?? []).size
  return {
    raw: Buffer.byteLength(js),
    appCode,
    core,
    domain,
    rxjs,
    entry,
    byModule,
    yyOccurrences,
    yyDistinct,
  }
}

// LOC de template de todos los componentes (para la extrapolación), medidos
// desde el repositorio (mismo conteo que el informe).
function countTemplateLoc(baseDir) {
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.name.endsWith('.ts')) files.push(f)
    }
  }
  walk(baseDir)
  const locs = {}
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const turl = src.match(/templateUrl:\s*'\.\/([^']+)'/)
    if (turl) {
      const html = readFileSync(join(f.replace(/\/[^/]+$/, ''), turl[1]), 'utf8')
      locs[f.replace(baseDir + '/', '')] = html.split('\n').length
      continue
    }
    const m = src.match(/template:\s*`([\s\S]*?)`/)
    if (m) locs[f.replace(baseDir + '/', '')] = m[1].split('\n').length
  }
  return locs
}

function main() {
  const variants = {}
  for (const v of VARIANTS) variants[v] = loadVariant(v)

  const A = variants.A
  const B = variants.B
  const C = variants.C

  // Coste directo por componente seleccionado (variante B = template mínima)
  const componentCost = {}
  for (const [name, meta] of Object.entries(SELECTED)) {
    const a = A.byModule[meta.label] ?? 0
    const b = B.byModule[meta.label] ?? 0
    const c = C.byModule[meta.label] ?? 0
    componentCost[name] = {
      label: meta.label,
      templateLoc: meta.templateLoc,
      bytesA: a,
      bytesB: b,
      bytesC: c,
      templateCostDirect: a - b,
      bytesPerTemplateLoc: round((a - b) / meta.templateLoc, 1),
      richDelta: c - a,
      richTemplateLoc: meta.templateLoc, // rica: el script no la re-mide; se documenta en el informe
    }
  }

  // Componentes en cascada (presentes en A/C, ausentes en B)
  const cascade = {}
  for (const mod of CASCADE) {
    const key = mod.replace(/^src\/app\//, '')
    cascade[key] = {
      bytesA: A.byModule[mod] ?? 0,
      bytesB: B.byModule[mod] ?? 0,
      bytesC: C.byModule[mod] ?? 0,
      droppedInB: (A.byModule[mod] ?? 0) > 0 && !(B.byModule[mod] ?? 0),
    }
  }

  const directTotal = Object.values(componentCost).reduce((a, c) => a + c.templateCostDirect, 0)
  const cascadeTotal = Object.values(cascade).reduce((a, c) => a + (c.bytesA - c.bytesB), 0)
  const coreDelta = A.core - B.core

  // LOC de template total de la app
  const templateLocs = countTemplateLoc(APP_SRC)
  const totalTemplateLoc = Object.values(templateLocs).reduce((a, b) => a + b, 0)

  // Extrapolación lineal (INFERIDO, no MEDIDO):
  // tasa alta = coste directo / LOC de los 2 componentes seleccionados
  const selectedLoc = Object.values(SELECTED).reduce((a, c) => a + c.templateLoc, 0)
  const rateHigh = directTotal / selectedLoc
  // tasa baja = tasa marginal de las templates enriquecidas (contenido más simple)
  const richAddedLoc = { dashboard: 106, tasks: 49 } // LOC añadidos en C (medidos en el informe)
  const marginalRates = Object.entries(richAddedLoc).map(
    ([name, addedLoc]) => (componentCost[name].richDelta ?? 0) / addedLoc,
  )
  const rateLow = Math.min(...marginalRates)
  const estimateHigh = totalTemplateLoc * rateHigh
  const estimateLow = totalTemplateLoc * rateLow

  const appCodeMonolith = A.appCode
  const appCodeIncrement = 36571 // Fase 5.4: incremento de app code baseline→monolith
  const totalIncrement = 43013 // Fase 5.4: incremento JS raw total

  const result = {
    experiment: 'aot-template-cost-phase5',
    capturedAt: new Date().toISOString(),
    hypothesis: {
      id: 'H9',
      text: 'Una parte significativa del incremento de app code de Angular (+36 571 B) procede de las instrucciones JavaScript generadas por las templates AOT.',
    },
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      cpuCores: cpus().length,
      memoryBytes: totalmem(),
      angularVersion: '21.2.21 (misma que el monolith; node_modules compartido)',
      typescript: '5.9.2',
    },
    design: {
      variants: {
        A: 'Angular Monolith real (sin cambios)',
        B: 'Template-minimal: template vacía para dashboard y tasks, misma lógica TS/imports/estado/servicios',
        C: 'Template-rich: templates artificialmente más ricas para dashboard y tasks, misma lógica TS',
      },
      controlled: [
        'misma copia de apps/angular-app (diff idéntico al árbol principal)',
        'mismo node_modules (mismas versiones Angular/TS/dependencias)',
        'misma configuración de build (optimización, producción)',
        'mismo flag CLI --stats-json',
        'misma máquina/sesión/Node',
        'dominio y fixture intactos (no modificados)',
      ],
      artifactsDir: ARTIFACTS,
    },
    components: {
      selected: componentCost,
      cascade,
      totalTemplateLoc,
      templateLocsPerComponent: templateLocs,
    },
    variants: {
      A: {
        raw: A.raw,
        appCode: A.appCode,
        core: A.core,
        domain: A.domain,
        rxjs: A.rxjs,
        entry: A.entry,
        yyOccurrences: A.yyOccurrences,
        yyDistinct: A.yyDistinct,
      },
      B: {
        raw: B.raw,
        appCode: B.appCode,
        core: B.core,
        domain: B.domain,
        rxjs: B.rxjs,
        entry: B.entry,
        yyOccurrences: B.yyOccurrences,
        yyDistinct: B.yyDistinct,
      },
      C: {
        raw: C.raw,
        appCode: C.appCode,
        core: C.core,
        domain: C.domain,
        rxjs: C.rxjs,
        entry: C.entry,
        yyOccurrences: C.yyOccurrences,
        yyDistinct: C.yyDistinct,
      },
    },
    deltas: {
      removeTemplates: {
        // A→B: quitar las 2 templates reales
        raw: A.raw - B.raw,
        appCode: A.appCode - B.appCode,
        core: coreDelta,
        directSelectedComponents: directTotal,
        cascade: cascadeTotal,
      },
      richTemplates: {
        // A→C: enriquecer las 2 templates
        raw: C.raw - A.raw,
        appCode: C.appCode - A.appCode,
      },
    },
    templateCost: {
      directMeasured: directTotal,
      cascadeMeasured: cascadeTotal,
      totalMeasuredEffect: directTotal + cascadeTotal + coreDelta,
      perTemplateLocHigh: round(rateHigh, 1),
      perTemplateLocLow: round(rateLow, 1),
      estimateAllTemplatesHigh: Math.round(estimateHigh),
      estimateAllTemplatesLow: Math.round(estimateLow),
      percentOfAppCodeHigh: round((estimateHigh / appCodeMonolith) * 100, 1),
      percentOfAppCodeLow: round((estimateLow / appCodeMonolith) * 100, 1),
      percentOfIncrementHigh: round((estimateHigh / appCodeIncrement) * 100, 1),
      percentOfIncrementLow: round((estimateLow / appCodeIncrement) * 100, 1),
    },
    reference: {
      appCodeMonolith,
      appCodeIncrement,
      totalIncrement,
      note: 'appCodeIncrement y totalIncrement proceden de Fase 5.4 (baseline-attribution-phase5.json), no alterados.',
    },
    method:
      'Variantes A/B/C del mismo Angular Monolith en directorio temporal (/tmp/lab-angular-aot), única diferencia = cantidad de template compilada en 2 componentes seleccionados. Metafile esbuild (ng build --stats-json): bytesInOutput exactos por módulo. El conteo de instrucciones ɵɵ no es medible en el bundle minificado (identificadores mangled por esbuild): se reporta el intento (0 ocurrencias) como NO MEDIBLE.',
    limitations: [
      'El coste directo medido (bytes del módulo del componente) incluye las instrucciones de la template COMPILADA (ɵɵ*) y sus imports asociados; no es posible separar dentro del módulo instrucciones de template vs miembros de clase (la clase se conserva íntegra en B).',
      'Al vaciar la template, los componentes hijos solo referenciados por ella se eliminan por tree-shaking (task-form, kpi-card): el efecto total A→B (10 593 B) incluye esa cascada, que contiene template + lógica de los hijos. Se distingue directo vs cascada.',
      'La extrapolación a toda la app (735 LOC template) es lineal y asume que los 2 componentes seleccionados son representativos; las templates enriquecidas sugieren una tasa marginal menor para contenido simple (17-24 B/LOC vs 38.7 medidos) → rango amplio.',
      'Las variantes experimentales se construyeron en /tmp/lab-angular-aot (fuera del repo) y no se versionan; el JSON referencia sus artefactos (reconstruibles según el anexo del informe).',
      'El experimento no mide el coste equivalente de JSX en React: solo cuantifica el coste de templates AOT dentro de Angular.',
    ],
  }

  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)
  console.log(`AOT template cost → ${relative(ROOT, RESULTS_FILE)}\n`)

  const fmt = (n) => String(n).padStart(8)
  console.log('Variantes (JS raw / app code / core / domain / rxjs):')
  for (const v of VARIANTS) {
    const x = variants[v]
    console.log(
      `  ${v}  ${fmt(x.raw)} / ${fmt(x.appCode)} / ${fmt(x.core)} / ${fmt(x.domain)} / ${fmt(x.rxjs)}`,
    )
  }
  console.log('\nCoste directo por componente seleccionado (bytes en A → B):')
  for (const [name, c] of Object.entries(componentCost)) {
    console.log(
      `  ${name.padEnd(10)} ${String(c.bytesA).padStart(6)} → ${String(c.bytesB).padStart(6)} = -${c.templateCostDirect} B (${c.bytesPerTemplateLoc} B/LOC template)`,
    )
  }
  console.log('\nCascada (eliminados por tree-shaking en B):')
  for (const [name, c] of Object.entries(cascade)) {
    console.log(
      `  ${name.padEnd(40)} A:${c.bytesA} B:${c.bytesB} (${c.droppedInB ? 'eliminado' : 'retenido'})`,
    )
  }
  console.log('\nDeltas:')
  console.log(
    `  A→B (quitar templates): raw -${result.deltas.removeTemplates.raw} B | directo -${directTotal} | cascada -${cascadeTotal} | core -${coreDelta}`,
  )
  console.log(
    `  A→C (enriquecer):       raw +${result.deltas.richTemplates.raw} B | app code +${result.deltas.richTemplates.appCode}`,
  )
  console.log('\nExtrapolación (INFERIDO):')
  console.log(
    `  tasa por LOC template: ${round(rateHigh, 1)} B (alta, medidos) / ${round(rateLow, 1)} B (baja, marginal enriquecido)`,
  )
  console.log(`  templates totales app: ${totalTemplateLoc} LOC`)
  console.log(
    `  estimación app code por templates: ${Math.round(estimateLow)}–${Math.round(estimateHigh)} B`,
  )
  console.log(
    `  % del app code monolith (${appCodeMonolith} B): ${round((estimateLow / appCodeMonolith) * 100, 1)}–${round((estimateHigh / appCodeMonolith) * 100, 1)}%`,
  )
  console.log(
    `  % del incremento app code +${appCodeIncrement} B: ${round((estimateLow / appCodeIncrement) * 100, 1)}–${round((estimateHigh / appCodeIncrement) * 100, 1)}%`,
  )
}

main()
