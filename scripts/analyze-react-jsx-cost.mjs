#!/usr/bin/env node
// JSX cost isolation for the Frontend Architecture Lab (Fase 5.6).
// Zero runtime dependencies: only Node built-ins (fs, path, os, url, zlib).
//
// Usage: node scripts/analyze-react-jsx-cost.mjs
// Output: docs/experiments/results/react-jsx-cost-phase5.json
//
// The experiment mirrors Fase 5.5 (Angular AOT templates) but for React JSX:
// three variants of the React Monolith in a TEMPORARY directory outside the
// repo (see docs/experiments/react-jsx-cost-phase5.md, anexo):
//   A — real monolith (vite build --sourcemap: 233 590 B raw, oficial 233 547 B)
//   B — JSX-minimal  (JSX mínimo en dashboard-page y tasks-page, MISMA lógica
//       TS: la lógica se mantiene viva mediante un "keeper" experimental, porque
//       a diferencia de Angular el minificador elimina la lógica no referenciada)
//   C — JSX-rich     (JSX artificialmente más rico, misma lógica TS)
// Artifacts: <JSX_ARTIFACTS_DIR>/artifacts-{A,B,C}/dist/assets/{main.js, main.js.map}
// (default JSX_ARTIFACTS_DIR=/tmp/lab-react-jsx)
//
// Attribution mechanism: the same as Fase 5.3/5.4 (source map + VLQ decode,
// approximation). Per-component exact metric: sourcesContent (original bytes).
// The VLQ per-component attribution FAILS for tasks-page (0 segments in the
// map, coverage artifact) — documented; sourcesContent is used instead.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { cpus, totalmem } from 'node:os'

import { analyzeReact, prettierJson } from './analyze-bundle.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'react-jsx-cost-phase5.json')
const REACT_SRC = join(ROOT, 'apps/react-app/src')
const ARTIFACTS = process.env.JSX_ARTIFACTS_DIR ?? '/tmp/lab-react-jsx'

const VARIANTS = ['A', 'B', 'C']

// Componentes seleccionados (espejo de Fase 5.5: dashboard sencillo, tasks
// complejo). JSX LOC = líneas del bloque return (medidas en el informe):
// dashboard líneas 25–52 (28), tasks líneas 90–210 (121).
const SELECTED = {
  dashboard: { label: 'features/dashboard/dashboard-page.tsx', jsxLoc: 28 },
  tasks: { label: 'features/tasks/tasks-page.tsx', jsxLoc: 121 },
}

// Componentes hijos que solo son referenciados por el JSX de los componentes
// seleccionados (cascada por tree-shaking en B).
const CASCADE = [
  'features/tasks/task-form.tsx',
  'components/kpi-card.tsx',
  'components/empty-state.tsx',
  'components/feedback.tsx',
  'components/priority-badge.tsx',
  'components/status-badge.tsx',
  'components/transition-buttons.tsx',
]

function round(value, decimals = 1) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function loadVariant(name) {
  const dir = join(ARTIFACTS, `artifacts-${name}/dist`)
  if (!existsSync(dir)) {
    console.error(`FATAL: faltan artefactos de la variante ${name} en ${dir}`)
    console.error('Reconstruye las variantes experimentales (ver anexo del informe).')
    process.exit(1)
  }
  const comp = analyzeReact(dir)
  if (!comp.available) {
    console.error(`FATAL: variante ${name} sin source map — ${comp.reason}`)
    process.exit(1)
  }
  const js = readFileSync(join(dir, 'assets/main.js'), 'utf8')
  const cssFiles = readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.css'))
  const cssRaw = cssFiles.reduce((a, f) => a + readFileSync(join(dir, 'assets', f)).length, 0)
  const bySource = {}
  for (const m of comp.modules) {
    const clean = m.source.replace(/^.*src\//, 'src/')
    bySource[clean] = { vlq: m.approxMinifiedBytes, orig: m.originalBytes }
  }
  return {
    raw: Buffer.byteLength(js),
    gzip: gzipSync(Buffer.from(js, 'utf8')).length,
    brotli: brotliCompressSync(Buffer.from(js, 'utf8')).length,
    cssRaw,
    categories: comp.categoriesCorrected ?? comp.categories,
    modules: comp.modules.length,
    bySource,
  }
}

// JSX LOC total de la app (heurística de tags, documentada en el informe):
// líneas que contienen al menos un tag JSX (<tag, </tag, />).
function countJsxTagLines(baseDir) {
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) files.push(f)
    }
  }
  walk(baseDir)
  let total = 0
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const line of src.split('\n')) {
      if (/<\w|\/>|<\/\w/.test(line)) total += 1
    }
  }
  return total
}

function main() {
  const variants = {}
  for (const v of VARIANTS) variants[v] = loadVariant(v)
  const A = variants.A
  const B = variants.B
  const C = variants.C

  // Por componente seleccionado: bytes originales (exactos) y VLQ (aproximados;
  // tasks-page = 0 segmentos → NO MEDIBLE por VLQ)
  const componentCost = {}
  for (const [name, meta] of Object.entries(SELECTED)) {
    const key = `src/${meta.label}`
    const a = A.bySource[key] ?? { vlq: 0, orig: 0 }
    const b = B.bySource[key] ?? { vlq: 0, orig: 0 }
    const c = C.bySource[key] ?? { vlq: 0, orig: 0 }
    componentCost[name] = {
      label: meta.label,
      jsxLoc: meta.jsxLoc,
      origA: a.orig,
      origB: b.orig,
      origC: c.orig,
      vlqA: a.vlq,
      vlqB: b.vlq,
      vlqC: c.vlq,
      deltaOrigAB: a.orig - b.orig,
      deltaOrigAC: c.orig - a.orig,
      vlqNote: a.vlq === 0 ? 'NO MEDIBLE por VLQ (0 segmentos en el source map)' : 'aproximado',
    }
  }

  // Cascada: componentes hijos en A vs B (orig). En B desaparecen si solo los
  // referenciaba el JSX eliminado.
  const cascade = {}
  for (const frag of CASCADE) {
    const key = `src/${frag}`
    const a = A.bySource[key] ?? { orig: 0 }
    const b = B.bySource[key] ?? { orig: 0 }
    cascade[frag] = {
      origA: a.orig,
      origB: b.orig,
      droppedInB: a.orig > 0 && b.orig === 0,
    }
  }

  const directOrigAB = Object.values(componentCost).reduce((s, c) => s + c.deltaOrigAB, 0)
  const directOrigAC = Object.values(componentCost).reduce((s, c) => s + c.deltaOrigAC, 0)
  const cascadeOrigAB = Object.values(cascade).reduce((s, c) => s + (c.origA - c.origB), 0)

  // JSX LOC total de la app (heurística de tags) para la extrapolación
  const totalJsxTagLines = countJsxTagLines(REACT_SRC)
  const selectedLoc = Object.values(SELECTED).reduce((s, c) => s + c.jsxLoc, 0)

  // Tasas: bytes originales (fuente JSX) por línea del bloque return
  const rateOrigPerReturnLine = directOrigAB / selectedLoc
  // Extrapolación: aplicar la tasa a las líneas de tag de toda la app (límite
  // inferior del JSX real) y a un estimado de líneas return (~1,6× los tags)
  const estimateLow = totalJsxTagLines * rateOrigPerReturnLine
  const estimateHigh = totalJsxTagLines * 1.6 * rateOrigPerReturnLine

  const result = {
    experiment: 'react-jsx-cost-phase5',
    capturedAt: new Date().toISOString(),
    hypothesis: {
      id: 'H10',
      text: 'Una parte medible del incremento de app code de React es atribuible al JSX compilado, y su magnitud puede estimarse mediante una variante controlada del mismo componente.',
    },
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      cpuCores: cpus().length,
      memoryBytes: totalmem(),
      reactVersion: 'react/react-dom 19.2.8, vite 8.2.2 (rolldown 1.2.5), typescript 5.9.x',
    },
    design: {
      variants: {
        A: 'React Monolith real (vite build --sourcemap: 233 590 B raw; oficial sin sourcemap 233 547 B, +43 B del comentario sourceMappingURL)',
        B: 'JSX-minimal: JSX mínimo en dashboard-page y tasks-page, MISMA lógica TS/estado/servicios/imports; la lógica se mantiene viva con un keeper experimental (DashboardPage.__keepAlive / TasksPage.__keepAlive) para que el minificador no la elimine',
        C: 'JSX-rich: JSX artificialmente más rico (elementos, props, eventos, condiciones, listas, ARIA), misma lógica TS',
      },
      keeperNote:
        'En React, a diferencia de Angular, el minificador elimina la lógica local no referenciada al vaciar el JSX. El keeper (una línea por componente) referencia toda la lógica para que el delta A→B mida JSX, no lógica. Verificado empíricamente: los strings de los handlers (Task moved to, Assignee updated., Task updated.) sobreviven en B.',
      controlled: [
        'misma copia de apps/react-app (diff idéntico al árbol principal)',
        'mismo node_modules (mismas versiones)',
        'misma configuración de build (producción, minificación)',
        'mismo flag CLI --sourcemap',
        'dominio, fixture, servicios, estado, CSS y rutas intactos',
      ],
      artifactsDir: ARTIFACTS,
    },
    components: {
      selected: componentCost,
      cascade,
      totalJsxTagLines,
      jsxLocSelected: selectedLoc,
    },
    variants: {
      A: {
        raw: A.raw,
        gzip: A.gzip,
        brotli: A.brotli,
        cssRaw: A.cssRaw,
        modules: A.modules,
        categories: A.categories,
      },
      B: {
        raw: B.raw,
        gzip: B.gzip,
        brotli: B.brotli,
        cssRaw: B.cssRaw,
        modules: B.modules,
        categories: B.categories,
      },
      C: {
        raw: C.raw,
        gzip: C.gzip,
        brotli: C.brotli,
        cssRaw: C.cssRaw,
        modules: C.modules,
        categories: C.categories,
      },
    },
    deltas: {
      removeJsx: {
        // A→B: quitar el JSX de los 2 componentes seleccionados
        raw: A.raw - B.raw,
        gzip: A.gzip - B.gzip,
        brotli: A.brotli - B.brotli,
        directOrigSelected: directOrigAB,
        cascadeOrig: cascadeOrigAB,
      },
      richJsx: {
        // A→C: enriquecer el JSX de los 2 componentes
        raw: C.raw - A.raw,
        gzip: C.gzip - A.gzip,
        brotli: C.brotli - A.brotli,
        directOrigSelected: directOrigAC,
      },
    },
    jsxCost: {
      directOrigMeasured: directOrigAB,
      directMinifiedMeasured: {
        dashboard: componentCost.dashboard.vlqA - componentCost.dashboard.vlqB,
        tasks: null,
        note: 'solo dashboard medible por VLQ (aproximado); tasks NO MEDIBLE en minificado (0 segmentos). El total minificado A→B (−6 548 B) es exacto a nivel de bundle.',
      },
      cascadeOrigMeasured: cascadeOrigAB,
      totalObservedMinified: A.raw - B.raw,
      rateOrigPerReturnLine: round(rateOrigPerReturnLine, 1),
      estimateAllJsxLow: Math.round(estimateLow),
      estimateAllJsxHigh: Math.round(estimateHigh),
      note: 'La extrapolación está en bytes FUENTE (orig, sin minificar). No se compara con el app code minificado (VLQ 16 176 B) porque sería mezclar unidades; la conversión minificada no es medible con fiabilidad (el único punto minificado por componente es dashboard: 1 121 B por VLQ, ratio ≈1,1× sobre orig).',
    },
    reference: {
      reactMonolithRaw: 233547,
      reactIncrementRaw: 24985,
      reactAppCodeVlq: 16176,
      note: 'reactMonolithRaw (oficial, sin sourcemap), reactIncrementRaw y reactAppCodeVlq proceden de Fases 4.1/5.3/5.4, no alterados. El app code VLQ (16 176 B) es aproximado; el real se estima en 16–26 kB.',
    },
    method:
      'Variantes A/B/C del mismo React Monolith en directorio temporal, única diferencia = cantidad de JSX en 2 componentes seleccionados. Atribución: source map + VLQ (Fase 5.3/5.4) para categorías y dashboard; sourcesContent (original bytes, exacto) para la atribución por componente. gzip/brotli via Node zlib default level.',
    limitations: [
      'La atribución minificada por componente NO es medible para tasks-page (0 segmentos de source map — artefacto de cobertura de rolldown, igual que en el baseline de Fase 5.4). Se usa sourcesContent (bytes originales, exactos pero sin minificar) para la atribución por componente.',
      'El coste directo orig mide la FUENTE JSX eliminada (unminified), no los bytes minificados del bundle. El único número minificado exacto por componente es el total del bundle (A→B −6 548 B).',
      'El keeper (instrumentación experimental) añade una pequeña cantidad de bytes a B; el delta A→B infra-estima el JSX en ese margen (decenas de bytes).',
      'El efecto cascada (componentes hijos eliminados) contiene JSX + lógica de los hijos: no es atribuible solo a JSX.',
      'Las categorías VLQ (runtime/domain/app) varían entre variantes por cobertura del source map: los deltas de categoría NO son fiables; solo se reporta el total minificado.',
      'La extrapolación a toda la app usa la heurística de líneas de tag (407) y un factor estimado de líneas return (×1,6): es aproximada y con amplia incertidumbre.',
      'El experimento no mide el coste equivalente de templates AOT en Angular: la comparación entre Fases 5.5 y 5.6 es asimétrica (Angular minificado exacto por módulo vs React orig/unminified + total minificado).',
    ],
  }

  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)
  console.log(`React JSX cost → ${relative(ROOT, RESULTS_FILE)}\n`)

  const fmt = (n) => String(n).padStart(8)
  console.log('Variantes (JS raw / gzip / brotli / CSS / módulos):')
  for (const v of VARIANTS) {
    const x = variants[v]
    console.log(
      `  ${v}  ${fmt(x.raw)} / ${fmt(x.gzip)} / ${fmt(x.brotli)} / ${fmt(x.cssRaw)} / ${x.modules}`,
    )
  }
  console.log('\nPor componente (bytes originales exactos, A→B→C):')
  for (const [name, c] of Object.entries(componentCost)) {
    console.log(
      `  ${name.padEnd(10)} ${String(c.origA).padStart(6)} → ${String(c.origB).padStart(6)} → ${String(c.origC).padStart(6)}  | ΔAB: -${c.deltaOrigAB} B | ΔAC: +${c.deltaOrigAC} B | VLQ A: ${c.vlqA} (${c.vlqNote})`,
    )
  }
  console.log('\nCascada (componentes hijos, orig A vs B):')
  for (const [name, c] of Object.entries(cascade)) {
    console.log(
      `  ${name.padEnd(40)} A:${c.origA} B:${c.origB} (${c.droppedInB ? 'eliminado' : 'retenido'})`,
    )
  }
  console.log('\nDeltas:')
  console.log(
    `  A→B (quitar JSX): raw -${result.deltas.removeJsx.raw} B | gzip -${result.deltas.removeJsx.gzip} | brotli -${result.deltas.removeJsx.brotli} | directo orig -${directOrigAB} | cascada orig -${cascadeOrigAB}`,
  )
  console.log(
    `  A→C (enriquecer): raw +${result.deltas.richJsx.raw} B | gzip +${result.deltas.richJsx.gzip} | brotli +${result.deltas.richJsx.brotli} | directo orig +${directOrigAC}`,
  )
  console.log('\nExtrapolación (INFERIDO, bytes fuente sin minificar):')
  console.log(
    `  tasa: ${round(rateOrigPerReturnLine, 1)} B orig por línea return JSX (${selectedLoc} líneas en los 2 seleccionados)`,
  )
  console.log(
    `  líneas tag JSX app: ${totalJsxTagLines} → estimación JSX app: ${Math.round(estimateLow)}–${Math.round(estimateHigh)} B orig`,
  )
  console.log('  (no comparable directamente con app code minificado: unidades distintas)')
}

main()
