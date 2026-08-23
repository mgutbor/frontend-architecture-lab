#!/usr/bin/env node
// Bundle attribution analysis for the Frontend Architecture Lab (Fase 5.3).
// Zero runtime dependencies: only Node built-ins (fs, path, zlib).
//
// Usage: node scripts/analyze-bundle.mjs
// Output: docs/experiments/results/bundle-attribution-phase5.json
//
// Methodology:
// - Angular: reads the esbuild metafile emitted by `ng build --stats-json`
//   (build outputs are expected in dist/angular-app/browser and the stats
//   file in dist/angular-app/browser/stats.json). `bytesInOutput` per input
//   module gives the exact minified bytes contributed by each module.
// - React: Vite 8 uses rolldown, which does not emit an esbuild-style
//   metafile. Instead we parse the production source map (emitted with
//   `vite build --sourcemap`) and decode its VLQ "mappings" to approximate
//   the minified bytes contributed by each original source. This is an
//   approximation (segments map generated positions to source ranges); the
//   method and its limits are documented in the report.
// - Total asset sizes (raw/gzip/brotli) are measured directly from dist.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { cpus, totalmem } from 'node:os'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'bundle-attribution-phase5.json')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(value, decimals = 1) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VLQ_BASE_SHIFT = 5
const VLQ_BASE_MASK = 31 // 0b11111
const VLQ_CONTINUATION_BIT = 32 // 0b100000

function decodeVlq(segment) {
  const values = []
  let shift = 0
  let value = 0
  let i = 0
  while (i < segment.length) {
    const digit = BASE64.indexOf(segment[i])
    i += 1
    const continuation = (digit & VLQ_CONTINUATION_BIT) !== 0
    value += (digit & VLQ_BASE_MASK) << shift
    if (continuation) {
      shift += VLQ_BASE_SHIFT
    } else {
      const negate = (value & 1) === 1
      values.push(negate ? -(value >> 1) : value >> 1)
      value = 0
      shift = 0
    }
  }
  return values
}

// Approximate minified contribution per source from a source map's mappings.
// For every generated line, for every segment with a source index, the span
// from this segment to the next one on the SAME line (or to the end of the
// line for the last segment) is attributed to that source. This is the classic
// source-map-explorer heuristic; it under/over counts around segment
// boundaries but is deterministic and reproducible.
function attributeMappings(map, bundleLines) {
  const contributions = new Array(map.sources.length).fill(0)
  const lines = map.mappings.split(';')
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const segments = []
    let genColumn = 0
    let srcIdx = 0
    let srcLine = 0
    let srcColumn = 0
    if (lines[lineIdx].length > 0) {
      for (const raw of lines[lineIdx].split(',')) {
        const decoded = decodeVlq(raw)
        genColumn += decoded[0] ?? 0
        if (decoded.length >= 4) {
          srcIdx += decoded[1]
          srcLine += decoded[2]
          srcColumn += decoded[3]
          segments.push([genColumn, srcIdx])
        } else if (decoded.length >= 1) {
          // Segment without source (generated-only code): attribute to -1
          segments.push([genColumn, -1])
        }
      }
    }
    // Span from each segment to the next one on the same line (or to the end
    // of the line). Line lengths come from the actual generated bundle.
    const lineLength = bundleLines[lineIdx]?.length ?? 0
    for (let i = 0; i < segments.length; i += 1) {
      const [col, src] = segments[i]
      const nextCol = segments[i + 1]?.[0] ?? lineLength
      if (src >= 0 && nextCol > col) {
        contributions[src] += nextCol - col
      }
    }
  }
  return contributions
}

function packageOfPath(p) {
  // Returns the npm package name for a node_modules path, else null.
  // Uses the LAST node_modules segment: pnpm stores real packages under
  // node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/...
  const matches = [...p.matchAll(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/g)]
  const m = matches.length > 0 ? matches[matches.length - 1] : null
  return m ? m[1] : null
}

function categoryOfAngularPath(p) {
  const pk = packageOfPath(p)
  if (pk?.startsWith('@angular/')) return `@angular/${pk.split('/')[1]}`
  if (pk === 'rxjs') return 'rxjs'
  if (pk === 'tslib') return 'tslib'
  if (p.includes('/packages/domain/')) return '@operations-hub/domain'
  if (p.includes('src/app/')) return 'app code'
  if (p.endsWith('src/main.ts') || p.endsWith('src/main.tsx')) return 'entry'
  return 'other'
}

function categoryOfReactPath(p) {
  const clean = p.replace(/^\.\.\/+(\.\.\/)*/, '')
  const pk = packageOfPath(clean)
  if (pk === 'react' || pk === 'react-dom' || pk === 'scheduler') return 'react runtime'
  if (clean.includes('packages/domain/') || clean.includes('@operations-hub')) {
    return '@operations-hub/domain'
  }
  if (clean.startsWith('src/')) return 'app code'
  return 'other'
}

// ---------------------------------------------------------------------------
// Embedded fixture span in the React bundle (VLQ under-counts data literals)
// ---------------------------------------------------------------------------

function measureEmbeddedFixture(js) {
  // The deterministic fixture is bundled as an object literal (users array
  // starts after "users:["). The last task "Measure activation rate" marks
  // the end of the tasks array; the following object close ends the fixture.
  const marker = js.indexOf('Measure activation rate')
  if (marker < 0) return null
  const back = js.slice(0, marker)
  const start = Math.max(back.lastIndexOf('={users:'), back.lastIndexOf(',users:['))
  const end = js.indexOf('}', marker + 200)
  if (start < 0 || end < 0 || end <= start) return null
  return { start, end, bytes: end - start }
}

// ---------------------------------------------------------------------------
// Asset totals (raw/gzip/brotli) for both apps
// ---------------------------------------------------------------------------

function assetTotals(distRoot) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(js|css)$/.test(entry.name)) files.push(full)
    }
  }
  walk(distRoot)
  const byKind = (ext) => {
    const subset = files.filter((f) => f.endsWith(ext))
    return {
      chunkCount: subset.length,
      totalRawBytes: subset.reduce((a, f) => a + readFileSync(f).length, 0),
      totalGzipBytes: subset.reduce((a, f) => a + gzipSync(readFileSync(f)).length, 0),
      totalBrotliBytes: subset.reduce((a, f) => a + brotliCompressSync(readFileSync(f)).length, 0),
      files: subset.map((f) => relative(ROOT, f)),
    }
  }
  return { js: byKind('.js'), css: byKind('.css') }
}

// ---------------------------------------------------------------------------
// Angular attribution from esbuild metafile (stats.json)
// ---------------------------------------------------------------------------

function analyzeAngular(angularDist) {
  // The Angular CLI writes stats.json at the top of the output directory
  // (dist/angular-app/stats.json), not inside the browser/ subfolder.
  const statsFile = existsSync(join(angularDist, 'stats.json'))
    ? join(angularDist, 'stats.json')
    : join(angularDist, '..', 'stats.json')
  if (!existsSync(statsFile)) {
    return { available: false, reason: 'stats.json not found; run: ng build --stats-json' }
  }
  const stats = JSON.parse(readFileSync(statsFile, 'utf8'))
  const jsOutputs = Object.entries(stats.outputs).filter(([k]) => k.endsWith('.js'))
  const categories = {}
  const modules = []
  for (const [, out] of jsOutputs) {
    for (const [path, info] of Object.entries(out.inputs)) {
      const cat = categoryOfAngularPath(path)
      categories[cat] = (categories[cat] ?? 0) + info.bytesInOutput
      modules.push({
        path: path.replace(/^.*node_modules\/\.pnpm\//, 'node_modules/'),
        bytesInOutput: info.bytesInOutput,
        category: cat,
      })
    }
  }
  const totalAttributed = Object.values(categories).reduce((a, b) => a + b, 0)
  return {
    available: true,
    method: 'esbuild metafile (ng build --stats-json): exact bytesInOutput per input module',
    categories,
    modules,
    totalAttributed,
    headerBytes: (jsOutputs[0]?.[1]?.bytes ?? 0) - totalAttributed,
    limitNote:
      'Exact attribution per module. "generated/compiled" is not a separate category here: Angular templates compile into the component .ts modules during AOT and appear under app code; the fixture JSON is bundled inside @operations-hub/domain.',
  }
}

// ---------------------------------------------------------------------------
// React attribution from source map + VLQ decode
// ---------------------------------------------------------------------------

function analyzeReact(reactDist) {
  const assetsDir = join(reactDist, 'assets')
  if (!existsSync(assetsDir)) return { available: false, reason: 'dist/assets not found' }
  const mapFile = readdirSync(assetsDir).find((f) => f.endsWith('.js.map'))
  if (!mapFile) {
    return {
      available: false,
      reason: 'no .js.map found; run: vite build --sourcemap (reversible CLI flag)',
    }
  }
  const map = JSON.parse(readFileSync(join(assetsDir, mapFile), 'utf8'))
  const jsFile = mapFile.replace(/\.map$/, '')
  const bundle = readFileSync(join(assetsDir, jsFile), 'utf8')
  const bundleSize = Buffer.byteLength(bundle)
  const bundleLines = bundle.split('\n')
  const contributions = attributeMappings(map, bundleLines)
  const categories = {}
  const categoriesOriginal = {}
  const modules = map.sources.map((src, i) => ({
    source: src,
    category: categoryOfReactPath(src),
    approxMinifiedBytes: contributions[i],
    originalBytes: map.sourcesContent?.[i]?.length ?? 0,
  }))
  for (const m of modules) {
    categories[m.category] = (categories[m.category] ?? 0) + m.approxMinifiedBytes
    categoriesOriginal[m.category] = (categoriesOriginal[m.category] ?? 0) + m.originalBytes
  }
  const totalAttributed = Object.values(categories).reduce((a, b) => a + b, 0)
  const fixtureSpan = measureEmbeddedFixture(bundle)
  // The VLQ decode under-counts the embedded fixture JSON (object literal with
  // no per-field source segments); correct the domain category with the
  // measured span so the domain contribution is comparable with Angular's.
  let categoriesCorrected = { ...categories }
  if (fixtureSpan !== null) {
    categoriesCorrected = { ...categories }
    categoriesCorrected['@operations-hub/domain'] =
      (categoriesCorrected['@operations-hub/domain'] ?? 0) + fixtureSpan.bytes
  }
  return {
    available: true,
    method:
      'source map VLQ decode (vite build --sourcemap): approximate minified bytes per source, with measured correction for the embedded fixture literal',
    bundleSize,
    mapFile,
    categories,
    categoriesOriginal,
    categoriesCorrected,
    fixtureSpanBytes: fixtureSpan?.bytes ?? null,
    modules,
    totalAttributed,
    unAttributedBytes: bundleSize - totalAttributed,
    limitNote:
      'Approximation: VLQ segment-span attribution over/under counts around boundaries; generated-only code (e.g. Vite preambles) may be unattributed. Original source sizes (sourcesContent) are exact but unminified. The embedded fixture object literal is under-counted by VLQ and corrected by measuring its span in the bundle.',
  }
}

// ---------------------------------------------------------------------------
// JSON serializer matching Prettier's style (2-space indent, single-element
// arrays collapsed on one line) so `format:check` accepts generated JSON.
// ---------------------------------------------------------------------------

// Compact single-line serialization (used to test whether Prettier would
// collapse an array/object onto one line within printWidth).
function compactJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(compactJson).join(', ')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{ ${Object.keys(value)
      .map((k) => `${JSON.stringify(k)}: ${compactJson(value[k])}`)
      .join(', ')} }`
  }
  return JSON.stringify(value)
}

function prettierJson(value, indent = 0, prefix = '') {
  const pad = ' '.repeat(indent)
  const innerPad = ' '.repeat(indent + 2)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    // Prettier colapsa un array en una sola línea si la línea completa
    // (prefijo de la clave + array) cabe en printWidth (100). Si algún
    // elemento es multilínea o la línea no cabe, lo expande. `prefix` es
    // todo lo ya impreso en esa línea.
    const inline = `[${value.map(compactJson).join(', ')}]`
    if (!inline.includes('\n') && prefix.length + inline.length <= 100) return inline
    const items = value.map((v) => `${innerPad}${prettierJson(v, indent + 2, innerPad)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    // Same collapse rule for objects (e.g. small nested objects inside arrays).
    const inline = `{ ${keys.map((k) => `${JSON.stringify(k)}: ${compactJson(value[k])}`).join(', ')} }`
    if (!inline.includes('\n') && prefix.length + inline.length <= 100) return inline
    const items = keys.map(
      (k) =>
        `${innerPad}${JSON.stringify(k)}: ${prettierJson(value[k], indent + 2, `${innerPad}${JSON.stringify(k)}: `)}`,
    )
    return `{\n${items.join(',\n')}\n${pad}}`
  }
  return JSON.stringify(value)
}

// ---------------------------------------------------------------------------
// Exports (reused by scripts/analyze-bundle-baseline.mjs, Fase 5.4)
// ---------------------------------------------------------------------------

export { assetTotals, analyzeReact, analyzeAngular, prettierJson }

// ---------------------------------------------------------------------------
// Assemble result (only when run directly: `node scripts/analyze-bundle.mjs`)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)

if (isMain) {
  const reactDist = join(ROOT, 'apps/react-app/dist')
  const angularDist = join(ROOT, 'apps/angular-app/dist/angular-app/browser')

  const result = {
    experiment: 'bundle-attribution-phase5',
    capturedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      cpuCores: cpus().length,
      memoryBytes: totalmem(),
    },
    frameworks: {
      react: {
        ...assetTotals(reactDist),
        composition: analyzeReact(reactDist),
      },
      angular: {
        ...assetTotals(angularDist),
        composition: analyzeAngular(angularDist),
      },
    },
    method:
      'Symmetric where possible. Angular: esbuild metafile (exact bytesInOutput). React: source-map VLQ decode (approximation). Both measured from production dist builds generated with reversible CLI flags (ng build --stats-json; vite build --sourcemap). gzip/brotli via Node zlib default level, same as metrics.md.',
  }

  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, `${prettierJson(result)}\n`)
  console.log(`Bundle attribution → ${relative(ROOT, RESULTS_FILE)}\n`)

  for (const app of ['react', 'angular']) {
    const fw = result.frameworks[app]
    console.log(
      `${app.padEnd(8)} JS ${fw.js.totalRawBytes} B raw / ${fw.js.totalGzipBytes} B gzip / ${fw.js.totalBrotliBytes} B brotli (${fw.js.chunkCount} chunks) · CSS ${fw.css.totalRawBytes} B raw`,
    )
    const c = fw.composition
    if (!c.available) {
      console.log(`  composition: NOT AVAILABLE — ${c.reason}`)
      continue
    }
    console.log(`  ${c.method}`)
    const cats = c.categoriesCorrected ?? c.categories
    for (const [cat, bytes] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
      console.log(
        `    ${cat.padEnd(24)} ${String(bytes).padStart(8)} B (${round((bytes / fw.js.totalRawBytes) * 100, 1)}% of JS raw)`,
      )
    }
    if (c.categoriesOriginal) {
      console.log('    original (unminified) sizes:')
      for (const [cat, bytes] of Object.entries(c.categoriesOriginal).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${cat.padEnd(24)} ${String(bytes).padStart(8)} B`)
      }
    }
    if (c.fixtureSpanBytes !== null && c.fixtureSpanBytes !== undefined) {
      console.log(`    fixture literal span (measured): ${c.fixtureSpanBytes} B`)
    }
    console.log(
      `    attributed total: ${c.totalAttributed} B (unattributed: ${c.unAttributedBytes ?? 0} B)`,
    )
  }
}
