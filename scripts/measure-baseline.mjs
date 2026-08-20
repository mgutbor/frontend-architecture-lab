#!/usr/bin/env node
// Baseline measurement for the Frontend Architecture Lab.
// Zero runtime dependencies: only Node built-ins (fs, child_process, os, path, zlib).
//
// Usage: node scripts/measure-baseline.mjs [name]  (from the repository root)
// Output: docs/experiments/results/<name>.json  (default: baseline-phase2.json)
// Future measurement cycles should pass a new name so the Phase 2 baseline
// is preserved as evidence.
//
// Methodology: docs/experiments/metrics.md (approved, Phase 0.1).
// - Timed metrics (build, tests) use the median and range of 3 runs.
// - Lint and typecheck are recorded once as pass/fail with duration.
// - Source, dependency and architecture counts are static and deterministic.
// - Lighthouse and coverage are intentionally NOT measured in this baseline
//   (see docs/experiments/baseline-phase2.md, section "Limitaciones").

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { cpus, totalmem } from 'node:os'
import { performance } from 'node:perf_hooks'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_NAME = process.argv[2] ?? 'baseline-phase2'
const RESULTS_FILE = join(RESULTS_DIR, `${RESULTS_NAME}.json`)

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function run(cmd, args, cwd) {
  // Runs a command, returns { pass, ms, stdout, stderr }. Never throws.
  const start = performance.now()
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { pass: true, ms: performance.now() - start, stdout, stderr: '' }
  } catch (error) {
    return {
      pass: false,
      ms: performance.now() - start,
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: typeof error.stderr === 'string' ? error.stderr : String(error),
    }
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function walk(dir) {
  // Returns all regular files under dir (empty if dir does not exist).
  const files = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

function countLines(file) {
  return readFileSync(file, 'utf8').split('\n').length
}

const TEST_FILE = /(\.test\.|\.spec\.|test[\\/](setup|helpers)\.ts)/

function analyzeSource(srcRoot, testRoot = null) {
  // Counts production files/lines in srcRoot and test files/lines in testRoot
  // (or, when testRoot is null, in test files co-located in srcRoot).
  const production = walk(srcRoot).filter((f) => !TEST_FILE.test(f))
  const testFiles =
    testRoot === null ? walk(srcRoot).filter((f) => TEST_FILE.test(f)) : walk(testRoot)
  const prodLines = production.reduce((acc, f) => acc + countLines(f), 0)
  const testLines = testFiles.reduce((acc, f) => acc + countLines(f), 0)
  return {
    sourceFiles: production.length,
    testFiles: testFiles.length,
    linesOfCode: prodLines,
    testLines,
    testToCodeRatio: prodLines === 0 ? null : round(testLines / prodLines, 2),
  }
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const pnpmVersion = run('pnpm', ['-v'], ROOT).stdout.trim()
const environment = {
  node: process.version,
  pnpm: pnpmVersion,
  platform: `${process.platform}-${process.arch}`,
  os: `${process.platform} ${process.arch}`,
  cpuModel: cpus()[0]?.model ?? 'unknown',
  cpuCores: cpus().length,
  memoryBytes: totalmem(),
}

// ---------------------------------------------------------------------------
// Packages under measurement
// ---------------------------------------------------------------------------

const PACKAGES = [
  { name: 'react', dir: 'apps/react-app', filter: 'react-app', dist: 'dist' },
  { name: 'angular', dir: 'apps/angular-app', filter: 'angular-app', dist: 'dist/angular-app' },
  { name: 'domain', dir: 'packages/domain', filter: '@operations-hub/domain', dist: 'dist' },
]

// ---------------------------------------------------------------------------
// 1. Build domain once, then 3 timed clean builds per app
// ---------------------------------------------------------------------------

const build = {}

{
  const domainBuild = run('pnpm', ['build'], join(ROOT, 'packages/domain'))
  build.domain = { runsMs: [round(domainBuild.ms)], pass: domainBuild.pass }
}

for (const pkg of PACKAGES.filter((p) => p.name !== 'domain')) {
  const distRoot = join(ROOT, pkg.dir, pkg.dist)
  // Cold builds: remove the output directory and, for Angular, its persistent
  // build cache (.angular/cache) so the measurement matches a fresh checkout
  // (methodology §3.2: cache hot vs cold must be documented).
  const cacheRoot = join(ROOT, pkg.dir, '.angular')
  const runs = []
  for (let i = 0; i < 3; i += 1) {
    rmSync(distRoot, { recursive: true, force: true })
    rmSync(cacheRoot, { recursive: true, force: true })
    const result = run('pnpm', ['build'], join(ROOT, pkg.dir))
    runs.push(round(result.ms))
  }
  const sortedRuns = [...runs].sort((a, b) => a - b)
  build[pkg.name] = {
    runsMs: runs,
    medianMs: median(runs),
    minMs: sortedRuns[0],
    maxMs: sortedRuns[sortedRuns.length - 1],
  }
}

// ---------------------------------------------------------------------------
// 2. Bundle assets: raw / gzip / brotli per file from the last build
// ---------------------------------------------------------------------------

function collectAssets(distRoot) {
  const files = walk(distRoot).filter((f) => /\.(js|css)$/.test(f))
  const assets = files.map((file) => {
    const raw = readFileSync(file)
    return {
      file: relative(join(ROOT, 'apps'), file),
      rawBytes: raw.length,
      gzipBytes: gzipSync(raw).length,
      brotliBytes: brotliCompressSync(raw).length,
    }
  })
  const byKind = (ext) => {
    const subset = assets.filter((a) => a.file.endsWith(ext))
    return {
      chunkCount: subset.length,
      totalRawBytes: subset.reduce((acc, a) => acc + a.rawBytes, 0),
      totalGzipBytes: subset.reduce((acc, a) => acc + a.gzipBytes, 0),
      totalBrotliBytes: subset.reduce((acc, a) => acc + a.brotliBytes, 0),
    }
  }
  return { assets, js: byKind('.js'), css: byKind('.css') }
}

for (const pkg of PACKAGES.filter((p) => p.name !== 'domain')) {
  const assets = collectAssets(join(ROOT, pkg.dir, pkg.dist))
  build[pkg.name] = { ...build[pkg.name], assets }
}

// ---------------------------------------------------------------------------
// 3. Quality: tests (3 runs), lint and typecheck (1 run each)
// ---------------------------------------------------------------------------

const quality = {}

for (const pkg of PACKAGES) {
  const cwd = join(ROOT, pkg.dir)
  const testRuns = []
  let testCount = null
  for (let i = 0; i < 3; i += 1) {
    const result = run('pnpm', ['test'], cwd)
    testRuns.push(round(result.ms))
    if (testCount === null && result.pass) {
      const match = stripAnsi(result.stdout).match(/Tests\s+(\d+)\s+passed\s*\((\d+)\)/)
      if (match) {
        testCount = Number(match[2])
      }
    }
  }
  const sortedRuns = [...testRuns].sort((a, b) => a - b)
  const lint = run('pnpm', ['lint'], cwd)
  const typecheck = run('pnpm', ['typecheck'], cwd)
  quality[pkg.name] = {
    tests: {
      runsMs: testRuns,
      medianMs: median(testRuns),
      minMs: sortedRuns[0],
      maxMs: sortedRuns[sortedRuns.length - 1],
      testCount,
    },
    lint: { pass: lint.pass, ms: round(lint.ms) },
    typecheck: { pass: typecheck.pass, ms: round(typecheck.ms) },
  }
}

// ---------------------------------------------------------------------------
// 4. Static code analysis (deterministic)
// ---------------------------------------------------------------------------

const code = {}

for (const pkg of PACKAGES) {
  if (pkg.name === 'domain') {
    // Domain tests live in packages/domain/test (separate from src).
    code[pkg.name] = analyzeSource(
      join(ROOT, 'packages/domain/src'),
      join(ROOT, 'packages/domain/test'),
    )
  } else if (pkg.name === 'angular') {
    code[pkg.name] = analyzeSource(join(ROOT, 'apps/angular-app/src'))
  } else {
    code[pkg.name] = analyzeSource(join(ROOT, 'apps/react-app/src'))
  }
}

// Role counts (by directory/file convention, documented in baseline-phase2.md)
{
  const reactSrc = join(ROOT, 'apps/react-app/src')
  const angularSrc = join(ROOT, 'apps/angular-app/src/app')
  const reactFiles = walk(reactSrc)
  const angularFiles = walk(angularSrc)
  code.react.roles = {
    components: reactFiles.filter(
      (f) => f.startsWith(join(reactSrc, 'components')) && !TEST_FILE.test(f),
    ).length,
    hooks: reactFiles.filter((f) => f.startsWith(join(reactSrc, 'hooks')) && !TEST_FILE.test(f))
      .length,
    services: reactFiles.filter(
      (f) => f.startsWith(join(reactSrc, 'services')) && !TEST_FILE.test(f),
    ).length,
    adapters: reactFiles.filter(
      (f) => f.startsWith(join(reactSrc, 'adapters')) && !TEST_FILE.test(f),
    ).length,
    features: reactFiles.filter(
      (f) => f.startsWith(join(reactSrc, 'features')) && !TEST_FILE.test(f),
    ).length,
  }
  code.angular.roles = {
    components: angularFiles.filter((f) => f.endsWith('.component.ts')).length,
    templates: angularFiles.filter((f) => f.endsWith('.html')).length,
    adapters: angularFiles.filter((f) => f.endsWith('.adapter.ts')).length,
    stores: angularFiles.filter((f) => f.endsWith('.store.ts')).length,
    features: angularFiles.filter((f) => f.includes('/features/') && !TEST_FILE.test(f)).length,
  }
}

// Public exports of the domain package (symbols exported from src/index.ts)
{
  const index = readFileSync(join(ROOT, 'packages/domain/src/index.ts'), 'utf8')
  const blocks = [...index.matchAll(/export(?:\s+type)?\s*\{([^}]*)\}/g)]
  const symbols = blocks
    .flatMap((block) => block[1].split(','))
    .map((symbol) => symbol.trim())
    .filter(Boolean)
  code.domain.publicExports = symbols.length
}

// ---------------------------------------------------------------------------
// 5. Dependencies
// ---------------------------------------------------------------------------

const dependencies = {}

for (const pkg of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(ROOT, pkg.dir, 'package.json'), 'utf8'))
  const transitive = run('pnpm', ['--filter', pkg.filter, 'list', '--depth', 'Infinity'], ROOT)
  const match = stripAnsi(transitive.stdout).match(/(\d+)\s+packages?/)
  dependencies[pkg.name] = {
    runtime: Object.keys(manifest.dependencies ?? {}).length,
    dev: Object.keys(manifest.devDependencies ?? {}).length,
    transitive: match ? Number(match[1]) : null,
  }
}

// ---------------------------------------------------------------------------
// 6. Architecture heuristics (grep-based, deterministic)
// ---------------------------------------------------------------------------

const IMPORT = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g

function domainImportsByLayer(srcRoot) {
  // Production files only, for consistency with filesImportingDomain.
  const layerCounts = {}
  for (const file of walk(srcRoot)) {
    if (!(file.endsWith('.ts') || file.endsWith('.tsx')) || TEST_FILE.test(file)) {
      continue
    }
    const content = readFileSync(file, 'utf8')
    const layer = relative(srcRoot, file).split(/[\\/]/)[0]
    if (content.includes("from '@operations-hub/domain'")) {
      layerCounts[layer] = (layerCounts[layer] ?? 0) + 1
    }
  }
  return layerCounts
}

function countAdapterImporters(srcRoot, adapterPathParts) {
  let count = 0
  for (const file of walk(srcRoot)) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) {
      continue
    }
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(IMPORT)) {
      if (adapterPathParts.some((part) => match[1].includes(part))) {
        count += 1
        break
      }
    }
  }
  return count
}

function analyzeFeatureImports(srcRoot) {
  // Distinguishes imports between features (coupling between features) from
  // relative imports that leave the features layer toward shared layers
  // (components, hooks, services, domain). Production files only.
  const featuresRoot = join(srcRoot, 'features')
  const featureDirs = readdirSync(featuresRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  let interFeature = 0
  let outboundRelative = 0
  for (const file of walk(featuresRoot)) {
    if (!(file.endsWith('.ts') || file.endsWith('.tsx')) || TEST_FILE.test(file)) {
      continue
    }
    const fileDir = dirname(file)
    const thisFeature = relative(featuresRoot, fileDir).split(/[\\/]/)[0]
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(IMPORT)) {
      const specifier = match[1]
      if (!specifier.startsWith('.')) {
        continue
      }
      const targetFeature = relative(featuresRoot, resolve(fileDir, specifier)).split(/[\\/]/)[0]
      if (featureDirs.includes(targetFeature) && targetFeature !== thisFeature) {
        interFeature += 1
      } else if (!featureDirs.includes(targetFeature)) {
        outboundRelative += 1
      }
    }
  }
  return { interFeature, outboundRelative }
}

function countSharedDirectories(srcRoot) {
  let count = 0
  for (const file of walk(srcRoot)) {
    const segments = relative(srcRoot, file).split(/[\\/]/)
    if (segments.some((segment) => /^(shared|common)$/.test(segment))) {
      count += 1
      break
    }
  }
  return count
}

const reactSrc = join(ROOT, 'apps/react-app/src')
const angularSrc = join(ROOT, 'apps/angular-app/src/app')

function productionFilesImportingDomain(srcRoot) {
  return walk(srcRoot).filter((f) => {
    if (!(f.endsWith('.ts') || f.endsWith('.tsx')) || TEST_FILE.test(f)) {
      return false
    }
    return readFileSync(f, 'utf8').includes("from '@operations-hub/domain'")
  }).length
}

const architecture = {
  react: {
    filesImportingDomain: productionFilesImportingDomain(reactSrc),
    domainImportsByLayer: domainImportsByLayer(reactSrc),
    adapterImporters: countAdapterImporters(reactSrc, ['adapters/domain-adapter']),
    featureImports: analyzeFeatureImports(reactSrc),
    sharedDirectories: countSharedDirectories(reactSrc),
  },
  angular: {
    filesImportingDomain: productionFilesImportingDomain(angularSrc),
    domainImportsByLayer: domainImportsByLayer(angularSrc),
    adapterImporters: countAdapterImporters(angularSrc, ['domain-data.adapter']),
    featureImports: analyzeFeatureImports(angularSrc),
    sharedDirectories: countSharedDirectories(angularSrc),
  },
  deliberateDuplication: {
    // Parallel files that exist by design in both apps (documented in
    // frontend-architecture.md §5); the domain logic itself is never duplicated.
    conceptPairs: [
      [
        'data adapter',
        'apps/react-app/src/adapters/domain-adapter.ts',
        'apps/angular-app/src/app/domain/domain-data.adapter.ts',
      ],
      [
        'domain store',
        'apps/react-app/src/services/domain-store.ts',
        'apps/angular-app/src/app/domain/domain.store.ts',
      ],
      [
        'kpi card',
        'apps/react-app/src/components/kpi-card.tsx',
        'apps/angular-app/src/app/components/kpi-card.component.ts',
      ],
      [
        'dashboard',
        'apps/react-app/src/features/dashboard/dashboard-page.tsx',
        'apps/angular-app/src/app/features/dashboard/dashboard.component.ts',
      ],
      [
        'projects',
        'apps/react-app/src/features/projects/projects-page.tsx',
        'apps/angular-app/src/app/features/projects/projects.component.ts',
      ],
      ['app shell', 'apps/react-app/src/app/App.tsx', 'apps/angular-app/src/app/app.ts'],
    ].map(([concept, reactFile, angularFile]) => ({
      concept,
      reactFile,
      angularFile,
    })),
    pairCount: 6,
  },
}

// ---------------------------------------------------------------------------
// 7. Assemble and write the result
// ---------------------------------------------------------------------------

const baseline = {
  baseline: 'phase2',
  capturedAt: new Date().toISOString(), // metadata only; all other fields are deterministic
  environment,
  code,
  dependencies,
  build,
  quality,
  architecture,
}

mkdirSync(RESULTS_DIR, { recursive: true })
writeFileSync(RESULTS_FILE, `${JSON.stringify(baseline, null, 2)}\n`)

// ---------------------------------------------------------------------------
// 8. Summary
// ---------------------------------------------------------------------------

console.log(`Baseline medido → ${relative(ROOT, RESULTS_FILE)}\n`)
console.log(
  'Entorno:',
  environment.node,
  '· pnpm',
  environment.pnpm,
  '·',
  environment.cpuModel,
  `(${environment.cpuCores} cores)`,
)
for (const pkg of PACKAGES.filter((p) => p.name !== 'domain')) {
  const b = build[pkg.name]
  const t = quality[pkg.name].tests
  const js = b.assets.js
  console.log(
    `\n${pkg.name.padEnd(7)} build mediana ${String(b.medianMs).padStart(5)} ms (${b.minMs}-${b.maxMs}) · ` +
      `JS ${js.totalRawBytes} B raw / ${js.totalGzipBytes} B gzip / ${js.totalBrotliBytes} B brotli (${js.chunkCount} chunks) · ` +
      `tests ${t.medianMs} ms (${t.testCount ?? '?'} tests) · lint ${quality[pkg.name].lint.pass ? 'OK' : 'FAIL'} · typecheck ${quality[pkg.name].typecheck.pass ? 'OK' : 'FAIL'}`,
  )
}
console.log(
  `\ndomain      tests ${quality.domain.tests.medianMs} ms (${quality.domain.tests.testCount ?? '?'} tests) · lint ${quality.domain.lint.pass ? 'OK' : 'FAIL'} · typecheck ${quality.domain.typecheck.pass ? 'OK' : 'FAIL'}`,
)
