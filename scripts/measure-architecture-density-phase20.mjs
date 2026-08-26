#!/usr/bin/env node
// Fase 20 — Coupling density vs feature graph size.
//
// Reproducible experiment over an isolated copy of the lab (/tmp/lab-phase20,
// own git history) that separates the effect of COUPLING DENSITY from the
// NUMBER OF FEATURES and from the GRAPH TOPOLOGY.
//
//   density = edges / (N * (N - 1))   (directed, self-loops excluded)
//
// Scales (featureCount):
//   F30 — 30 features (3 real + 27 generated catalogs), possible edges = 870
//   F10 — 10 features (3 real + 7 generated catalogs),  possible edges = 90
//
// Topologies (30 features) — density levels with controlled shapes:
//   CLEAN         0 edges     shape none      density 0.000
//   CHAIN-0.10   87 edges     shape chain     density 0.100  (deep)
//   STAR-0.10    87 edges     shape star      density 0.100  (shallow)
//   STAR-0.20   174 edges     shape star      density 0.200  (shallow)
//   CHAIN-0.20  174 edges     shape chain     density 0.200  (deep)
//   BALANCED-0.30 261 edges   shape balanced  density 0.300  (medium)
//   DENSE-0.40  348 edges     shape dense     density 0.400  (deep)
//   DENSE-MAX   351 edges     shape dense     density 0.403  (complete DAG,
//     maximum feasible density: a DAG on 27 synthetic nodes has at most
//     27*26/2 = 351 edges. The ~0.50 target is infeasible under the DAG
//     constraint required for depth semantics; documented deviation.)
//
// Topologies (10 features, PAR-4 control):
//   CLEAN         0 edges
//   STAR-0.20    18 edges     density 0.200
//   CHAIN-0.20   18 edges     density 0.200
//
// Edge generation is deterministic (seeded PRNG / layered construction):
//   - chain:     i -> i-1 for every node + seeded random backward extras
//                (max depth = N preserved)
//   - star:      every node imports the hub (node 1) + layered cross-layer
//                edges pruned by shortest distance, depth capped at `cap`
//   - balanced:  layered cross-layer edges, depth capped at `cap`
//   - dense:     seeded random backward edges, no depth cap
// All edges point from a higher catalog index to a lower one (DAG).
//
// Scenarios (same semantic contract as Fase 19, for continuity):
//   M1 peripheral UI change | M2 central (hub) semantic change | M3 shared
//   contract change | M4 hub deletion | M5 shared domain rule change | M6
//   local refactor | D1 peripheral presentational bug | D2 central semantic
//   bug (type-valid). Every scenario runs on React and Angular.
//
// Metrics are structural and deterministic (git-derived) plus measured
// graph properties; zero runtime dependencies beyond Node + git.
//
// Usage:
//   node scripts/measure-architecture-density-phase20.mjs            (full)
//   node scripts/measure-architecture-density-phase20.mjs gen [filter]
//   node scripts/measure-architecture-density-phase20.mjs run [filter]
//   filter examples: 'F30' 'F30:STAR-0.20' 'F10:CLEAN:D2:react'

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'density-vs-size-phase20.json')

const LAB = process.env.F20_LAB || '/tmp/lab-phase20'
const MODE = process.argv[2] || 'full' // 'gen' | 'run' | 'full'
const FILTER = process.argv[3] || null
const SKIP_VALIDATE = process.argv.includes('--skip-validate')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sh(cmd, opts = {}) {
  const timeout = opts.timeout || 600000
  try {
    const out = execFileSync('bash', ['-lc', cmd], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    })
    return { ok: true, out: out || '' }
  } catch (err) {
    return { ok: false, out: (err.stdout || '') + (err.stderr || ''), status: err.status }
  }
}

const stripAnsi = (s) =>
  String(s)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

const git = (...args) =>
  execFileSync('git', ['-C', LAB, ...args], { encoding: 'utf8', timeout: 120000 }).trim()

const pretty = (obj) => JSON.stringify(obj, null, 2)

// Deterministic PRNG (mulberry32) + string hash.
function hashCode(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Feature naming (deterministic)
// ---------------------------------------------------------------------------

const REAL_FEATURES = ['dashboard', 'projects', 'tasks']

const SCALES = [
  { id: 'F30', total: 30, synthetic: 27 },
  { id: 'F10', total: 10, synthetic: 7 },
]

const TOPOLOGIES = [
  // 30 features
  {
    key: 'F30:CLEAN',
    scale: 'F30',
    label: 'CLEAN',
    shape: 'none',
    edges: 0,
    cap: 1,
    densityTarget: 0.0,
  },
  {
    key: 'F30:CHAIN-0.10',
    scale: 'F30',
    label: 'CHAIN-0.10',
    shape: 'chain',
    edges: 87,
    cap: 27,
    densityTarget: 0.1,
  },
  {
    key: 'F30:STAR-0.10',
    scale: 'F30',
    label: 'STAR-0.10',
    shape: 'star',
    edges: 87,
    cap: 6,
    densityTarget: 0.1,
  },
  {
    key: 'F30:STAR-0.20',
    scale: 'F30',
    label: 'STAR-0.20',
    shape: 'star',
    edges: 174,
    cap: 8,
    densityTarget: 0.2,
  },
  {
    key: 'F30:CHAIN-0.20',
    scale: 'F30',
    label: 'CHAIN-0.20',
    shape: 'chain',
    edges: 174,
    cap: 27,
    densityTarget: 0.2,
  },
  {
    key: 'F30:BALANCED-0.30',
    scale: 'F30',
    label: 'BALANCED-0.30',
    shape: 'balanced',
    edges: 261,
    cap: 15,
    densityTarget: 0.3,
  },
  {
    key: 'F30:DENSE-0.40',
    scale: 'F30',
    label: 'DENSE-0.40',
    shape: 'dense',
    edges: 348,
    cap: 27,
    densityTarget: 0.4,
  },
  {
    key: 'F30:DENSE-MAX',
    scale: 'F30',
    label: 'DENSE-MAX',
    shape: 'dense',
    edges: 351,
    cap: 27,
    densityTarget: 0.403,
  },
  // 10 features (PAR-4 control)
  {
    key: 'F10:CLEAN',
    scale: 'F10',
    label: 'CLEAN',
    shape: 'none',
    edges: 0,
    cap: 1,
    densityTarget: 0.0,
  },
  {
    key: 'F10:STAR-0.20',
    scale: 'F10',
    label: 'STAR-0.20',
    shape: 'star',
    edges: 18,
    cap: 4,
    densityTarget: 0.2,
  },
  {
    key: 'F10:CHAIN-0.20',
    scale: 'F10',
    label: 'CHAIN-0.20',
    shape: 'chain',
    edges: 18,
    cap: 7,
    densityTarget: 0.2,
  },
]

const SCENARIOS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'D1', 'D2']

const kebab = (i) => `catalog-${String(i).padStart(2, '0')}`
const pascal = (i) => `Catalog${String(i).padStart(2, '0')}`
const itemsConst = (i) => `CATALOG_${String(i).padStart(2, '0')}_ITEMS`
const ruleFn = (i) => `countCatalog${String(i).padStart(2, '0')}Overdue`
const title = (i) => `Catalog ${String(i).padStart(2, '0')}`
const linkedFn = (i) => `catalog${String(i).padStart(2, '0')}LinkedTitle`
const ownTitleVar = (i) => `CATALOG_OWN_TITLE_${String(i).padStart(2, '0')}`
const cacheVar = (i) => `__catalogSrcCache${String(i).padStart(2, '0')}`

const parseIndex = (f) => Number(f.replace('catalog-', ''))
const scaleOf = (key) => SCALES.find((s) => s.id === key.split(':')[0])
const topoOf = (key) => TOPOLOGIES.find((t) => t.key === key)

function synthNames(scale) {
  return Array.from({ length: scale.synthetic }, (_, k) => kebab(k + 1))
}

function featureNames(scale) {
  return [...REAL_FEATURES, ...synthNames(scale)]
}

function labelOf(f) {
  return REAL_FEATURES.includes(f) ? f.charAt(0).toUpperCase() + f.slice(1) : title(parseIndex(f))
}

// ---------------------------------------------------------------------------
// Edge generation (deterministic)
// ---------------------------------------------------------------------------

function possiblePairs(n) {
  const pairs = []
  for (let i = 2; i <= n; i++) {
    for (let j = 1; j < i; j++) pairs.push([i, j])
  }
  return pairs
}

// Layered cross-layer pairs: layer(i) = min(D, ceil(i*D/n)); an edge (i -> j)
// exists when layer(j) < layer(i) (strictly decreasing layers => max depth D).
function layeredPairs(n, D) {
  const layerOf = (i) => Math.min(D, Math.ceil((i * D) / n))
  const pairs = []
  for (let i = 2; i <= n; i++) {
    for (let j = 1; j < i; j++) {
      if (layerOf(j) < layerOf(i)) pairs.push([i, j])
    }
  }
  return pairs
}

function buildEdges(topo) {
  const n = scaleOf(topo.key).synthetic
  const target = topo.edges
  if (topo.shape === 'none') return []
  if (topo.shape === 'chain') {
    // Preserve the pure chain (i -> i-1) => max depth = n, then seeded extras.
    const chain = possiblePairs(n).filter(([i, j]) => j === i - 1)
    const rest = possiblePairs(n).filter(([i, j]) => j !== i - 1)
    const rnd = mulberry32(hashCode(topo.key))
    for (let k = rest.length - 1; k > 0; k--) {
      const m = Math.floor(rnd() * (k + 1))
      ;[rest[k], rest[m]] = [rest[m], rest[k]]
    }
    const all = [...chain, ...rest]
    if (all.length < target)
      throw new Error(`chain ${topo.key}: only ${all.length} pairs < ${target}`)
    return all.slice(0, target)
  }
  if (topo.shape === 'star' || topo.shape === 'balanced') {
    // Layered construction capped at `cap` layers; star keeps every hub edge.
    const layered = layeredPairs(n, topo.cap)
    if (layered.length < target) {
      throw new Error(`${topo.shape} ${topo.key}: only ${layered.length} layered pairs < ${target}`)
    }
    const sorted = [...layered].sort(
      (a, b) => a[0] - a[1] - (b[0] - b[1]) || a[1] - b[1] || a[0] - b[0],
    )
    if (topo.shape === 'star') {
      const star = sorted.filter(([, j]) => j === 1)
      const rest = sorted.filter(([, j]) => j !== 1)
      const all = [...star, ...rest]
      if (all.length < target) throw new Error(`star ${topo.key}: ${all.length} < ${target}`)
      return all.slice(0, target)
    }
    return sorted.slice(0, target)
  }
  if (topo.shape === 'dense') {
    const pairs = possiblePairs(n)
    const rnd = mulberry32(hashCode(topo.key))
    for (let k = pairs.length - 1; k > 0; k--) {
      const m = Math.floor(rnd() * (k + 1))
      ;[pairs[k], pairs[m]] = [pairs[m], pairs[k]]
    }
    return pairs.slice(0, target)
  }
  throw new Error(`unknown shape ${topo.shape}`)
}

// ---------------------------------------------------------------------------
// Graph metrics (computed from the designed edge list)
// ---------------------------------------------------------------------------

function graphMetrics(scale, topo, edges) {
  const feats = featureNames(scale)
  const n = feats.length
  const edgeSet = new Set(edges.map(([i, j]) => `${kebab(i)}->${kebab(j)}`))
  const inDeg = {}
  const outDeg = {}
  for (const f of feats) {
    inDeg[f] = 0
    outDeg[f] = 0
  }
  for (const [i, j] of edges) {
    outDeg[kebab(i)]++
    inDeg[kebab(j)]++
  }
  // Depth: longest path from a node following import edges (DAG).
  const depsOf = {}
  for (const f of feats) depsOf[f] = []
  for (const [i, j] of edges) depsOf[kebab(i)].push(kebab(j))
  const depthOf = {}
  function depth(f) {
    if (depthOf[f] !== undefined) return depthOf[f]
    const deps = depsOf[f]
    const d = deps.length === 0 ? 1 : 1 + Math.max(...deps.map(depth))
    depthOf[f] = d
    return d
  }
  let maxDepth = 0
  let sumDepth = 0
  for (const f of feats) {
    const d = depth(f)
    maxDepth = Math.max(maxDepth, d)
    sumDepth += d
  }
  // Hub = max in-degree among SYNTHETIC features (the coupling graph only
  // involves generated catalogs; real features are never hubs). Tie -> min
  // index. Leaf = min in-degree (tie -> max out-degree, then max index).
  const synth = synthNames(scale)
  const sortedFeats = [...synth].sort((a, b) => {
    if (inDeg[b] !== inDeg[a]) return inDeg[b] - inDeg[a]
    return parseIndex(a) - parseIndex(b)
  })
  const hub = sortedFeats[0]
  const leafCandidates = [...feats].sort((a, b) => {
    if (inDeg[a] !== inDeg[b]) return inDeg[a] - inDeg[b]
    if (outDeg[b] !== outDeg[a]) return outDeg[b] - outDeg[a]
    return parseIndex(b) - parseIndex(a)
  })
  const leaf = leafCandidates[0]
  // Transitive consumers of the hub.
  const transitive = new Set()
  const stack = edges.filter(([, j]) => kebab(j) === hub).map(([i]) => kebab(i))
  while (stack.length) {
    const node = stack.pop()
    if (transitive.has(node)) continue
    transitive.add(node)
    for (const [i, j] of edges) {
      if (kebab(j) === node) stack.push(kebab(i))
    }
  }
  // Depth of the deepest transitive consumer of the hub (D2 distance proxy).
  let hubConsumerMaxDepth = 0
  for (const c of transitive) hubConsumerMaxDepth = Math.max(hubConsumerMaxDepth, depth(c))
  // Undirected connected components + diameter (all-pairs BFS within component).
  const adj = {}
  for (const f of feats) adj[f] = new Set()
  for (const [i, j] of edges) {
    adj[kebab(i)].add(kebab(j))
    adj[kebab(j)].add(kebab(i))
  }
  const seen = new Set()
  const components = []
  for (const f of feats) {
    if (seen.has(f)) continue
    const comp = []
    const q = [f]
    seen.add(f)
    while (q.length) {
      const node = q.shift()
      comp.push(node)
      for (const nb of adj[node]) {
        if (!seen.has(nb)) {
          seen.add(nb)
          q.push(nb)
        }
      }
    }
    components.push(comp)
  }
  let diameter = 0
  for (const comp of components) {
    for (const start of comp) {
      const dist = {}
      dist[start] = 0
      const q = [start]
      while (q.length) {
        const node = q.shift()
        for (const nb of adj[node]) {
          if (dist[nb] === undefined) {
            dist[nb] = dist[node] + 1
            q.push(nb)
          }
        }
      }
      for (const d of Object.values(dist)) diameter = Math.max(diameter, d)
    }
  }
  const isolated = feats.filter((f) => inDeg[f] === 0 && outDeg[f] === 0)
  return {
    nodes: n,
    synthetic: scale.synthetic,
    edges: edges.length,
    density: Math.round((edges.length / (n * (n - 1))) * 10000) / 10000,
    maxDepth,
    avgDepth: Math.round((sumDepth / n) * 100) / 100,
    maxInDegree: Math.max(...Object.values(inDeg)),
    maxOutDegree: Math.max(...Object.values(outDeg)),
    hub,
    leaf,
    directConsumersOfHub: inDeg[hub],
    transitiveConsumersOfHub: transitive.size,
    hubConsumerMaxDepth,
    connectedComponents: components.length,
    largestComponent: Math.max(...components.map((c) => c.length)),
    graphDiameter: diameter,
    isolated: isolated.length,
  }
}

// ---------------------------------------------------------------------------
// Generated file templates (zero backticks in generated code on purpose)
// ---------------------------------------------------------------------------

function domainSharedTemplate() {
  return `// Shared catalog model (Fase 20 — generated density experiment).
// Generated catalog features are catalogs of reference data owned by the
// shared domain (ADR-001). The rules here are business rules shared by every
// catalog feature: they are never reimplemented in an app.

export type CatalogStatus = 'planned' | 'active' | 'completed'

export const CATALOG_STATUSES: readonly CatalogStatus[] = ['planned', 'active', 'completed']

export interface CatalogItem {
  id: string
  title: string
  status: CatalogStatus
}

export function countByStatus<T extends CatalogItem>(
  items: readonly T[],
  status: CatalogStatus,
): number {
  return items.filter((item) => item.status === status).length
}

export function openCount<T extends CatalogItem>(items: readonly T[]): number {
  return items.filter((item) => item.status === 'planned' || item.status === 'active').length
}

/** Percentage of completed items; null when the catalog is empty. */
export function completionRatio<T extends CatalogItem>(items: readonly T[]): number | null {
  if (items.length === 0) {
    return null
  }
  return Math.round((countByStatus(items, 'completed') / items.length) * 100)
}
`
}

function domainCatalogTemplate(i) {
  const items = [
    { id: `${kebab(i)}-001`, t: `${title(i)} intake`, p: 'project-001', s: 'completed', d: 0 },
    { id: `${kebab(i)}-002`, t: `${title(i)} review`, p: 'project-001', s: 'active', d: -1 },
    { id: `${kebab(i)}-003`, t: `${title(i)} rollout`, p: 'project-002', s: 'active', d: 12 },
    { id: `${kebab(i)}-004`, t: `${title(i)} training`, p: 'project-002', s: 'planned', d: 40 },
    { id: `${kebab(i)}-005`, t: `${title(i)} audit`, p: 'project-003', s: 'planned', d: 60 },
    { id: `${kebab(i)}-006`, t: `${title(i)} sunset`, p: 'project-004', s: 'planned', d: 90 },
  ]
  const rows = items
    .map(
      (x) =>
        `  { id: '${x.id}', title: '${x.t}', projectId: '${x.p}', status: '${x.s}', dueInDays: ${x.d} },`,
    )
    .join('\n')
  return `// ${title(i)} (Fase 20 — generated catalog feature).
// Deterministic reference data referencing the canonical fixture entities.
// Same structural contract as every other generated catalog feature.

import type { CatalogItem } from './shared'

export interface ${pascal(i)}Item extends CatalogItem {
  projectId: string
  dueInDays: number
}

/** Per-feature business rule: how many items are overdue (dueInDays < 0). */
export function ${ruleFn(i)}(items: readonly ${pascal(i)}Item[]): number {
  return items.filter((item) => item.dueInDays < 0).length
}

export const ${itemsConst(i)}: readonly ${pascal(i)}Item[] = [
${rows}
]
`
}

// ---------------------------------------------------------------------------
// linkedFn body generation (multi-parent, cached, deterministic source)
// ---------------------------------------------------------------------------

function linkedFnBody(i, parents) {
  const own = ownTitleVar(i)
  if (parents.length === 0) {
    return `  return ${own}`
  }
  const deps = parents.map((p) => `...dep${pascal(p)}LinkedTitle().split(' · ')`).join(', ')
  return `  if (${cacheVar(i)} !== null) return ${cacheVar(i)}
  const parts = [...new Set([${deps}, ${own}])]
  parts.sort()
  ${cacheVar(i)} = parts.join(' · ')
  return ${cacheVar(i)}`
}

function linkedFnPrelude(i, parents) {
  const lines = [`const ${ownTitleVar(i)} = '${title(i)}'`]
  if (parents.length > 0) lines.push(`let ${cacheVar(i)}: string | null = null`)
  return lines.join('\n')
}

// sourceTitle computed in the generator = transitive ancestors + own, sorted
// by catalog index (must match the runtime linkedFn output).
function sourceTitle(i, edges) {
  const ancestors = new Set()
  const stack = edges.filter(([f]) => f === i).map(([, t]) => t)
  while (stack.length) {
    const node = stack.pop()
    if (ancestors.has(node)) continue
    ancestors.add(node)
    for (const [f, t] of edges) {
      if (f === node) stack.push(t)
    }
  }
  const all = [...ancestors, i].sort((a, b) => a - b)
  return all.map((k) => title(k)).join(' · ')
}

function parentsOf(edges, i) {
  return edges
    .filter(([f]) => f === i)
    .map(([, t]) => t)
    .sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Feature templates
// ---------------------------------------------------------------------------

function reactPageTemplate(i, edges) {
  const parents = parentsOf(edges, i)
  const depImports = parents
    .map(
      (p) =>
        `import { ${linkedFn(p)} as dep${pascal(p)}LinkedTitle } from '../${kebab(p)}/${kebab(p)}-page'`,
    )
    .join('\n')
  const prelude = linkedFnPrelude(i, parents)
  const body = linkedFnBody(i, parents)
  const source = `      <p className="linked-label">Source: {${linkedFn(i)}()}</p>\n`
  return `import { useMemo, useState } from 'react'
import { ${itemsConst(i)}, completionRatio, ${ruleFn(i)} } from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { filterCatalog, type CatalogStatusFilter } from '../../services/filters'
import { CatalogToolbar } from '../../components/catalog-toolbar'
${depImports}
${prelude}
export function ${linkedFn(i)}(): string {
${body}
}

export interface ${pascal(i)}PageProps {
  state: DomainState
}

// Fase 20 generated catalog feature: same architectural boundaries as the
// existing areas. Data and rules come from @operations-hub/domain (ADR-001);
// the page adds UI state (query/status/selection/note) and local helpers.
export function ${pascal(i)}Page({ state }: ${pascal(i)}PageProps) {
  const { dataset } = state
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<CatalogStatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const filtered = useMemo(() => filterCatalog(${itemsConst(i)}, query, status), [query, status])
  const selected = useMemo(
    () => ${itemsConst(i)}.find((item) => item.id === selectedId) ?? null,
    [selectedId],
  )
  const completion = completionRatio(${itemsConst(i)})
  const overdue = ${ruleFn(i)}(${itemsConst(i)})

  const projectName = (id: string): string =>
    dataset.projects.find((project) => project.id === id)?.name ?? id

  const statusLabel = (value: string): string =>
    value === 'completed' ? 'Completed' : value === 'active' ? 'Active' : 'Planned'

  return (
    <section aria-label="${title(i)}">
      <h2>${title(i)}</h2>
${source}      <CatalogToolbar
        searchLabel="Search ${kebab(i)}"
        searchId="${kebab(i)}-search"
        statusId="${kebab(i)}-status-filter"
        query={query}
        onQueryChange={setQuery}
        status={status}
        onStatusChange={setStatus}
      />
      <p className="results-count" aria-live="polite">
        {filtered.length} of {${itemsConst(i)}.length} ${kebab(i)} items · {completion ?? 'n/a'}%
        complete · {overdue} overdue
      </p>
      {filtered.length === 0 ? (
        <p className="empty-state">No ${kebab(i)} items match the current search and filters.</p>
      ) : (
        <ul className="list ${kebab(i)}-list">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === selectedId ? 'selected ${kebab(i)}-row' : '${kebab(i)}-row'}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="${kebab(i)}-title">{item.title}</span>
                <span className="${kebab(i)}-meta">
                  {statusLabel(item.status)} · {projectName(item.projectId)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected !== null ? (
        <section className="${kebab(i)}-detail" aria-label={selected.title}>
          <h3>{selected.title}</h3>
          <p>Project: {projectName(selected.projectId)}</p>
          <p>
            {selected.dueInDays < 0
              ? -selected.dueInDays + ' days overdue'
              : 'Due in ' + selected.dueInDays + ' days'}
          </p>
        </section>
      ) : null}
      <div className="field">
        <label htmlFor="${kebab(i)}-note">Note</label>
        <input
          id="${kebab(i)}-note"
          type="text"
          aria-label="${title(i)} note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <p className="note-count" aria-live="polite">
        Note: {note.length} chars
      </p>
    </section>
  )
}
`
}

function reactTestTemplate(i, edges) {
  const expectedSource = sourceTitle(i, edges)
  const source = `    expect(screen.getByText('Source: ${expectedSource}')).toBeInTheDocument()`
  const items = [
    `${title(i)} intake`,
    `${title(i)} review`,
    `${title(i)} rollout`,
    `${title(i)} training`,
    `${title(i)} audit`,
    `${title(i)} sunset`,
  ]
  const titles = items.map((t) => `      '${t}',`).join('\n')
  return `import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { loadFixture } from '@operations-hub/domain'
import type { DomainStore } from '../../services/domain-store'
import { createDomainStore } from '../../services/domain-store'
import { useDomainStore } from '../../hooks/use-domain-store'
import { ${pascal(i)}Page } from './${kebab(i)}-page'

function ${pascal(i)}Harness({ store }: { store: DomainStore }) {
  const state = useDomainStore(store)
  return <${pascal(i)}Page state={state} />
}

function render${pascal(i)}() {
  const store = createDomainStore(loadFixture())
  render(<${pascal(i)}Harness store={store} />)
  return store
}

describe('${pascal(i)}Page (Fase 20 — generated catalog feature)', () => {
  it('lists all 6 items with status, project, completion ratio and overdue count', () => {
    render${pascal(i)}()
    expect(
      screen.getByText('6 of 6 ${kebab(i)} items · 17% complete · 1 overdue'),
    ).toBeInTheDocument()
    for (const t of [
${titles}
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(t) })).toBeInTheDocument()
    }
    expect(
      screen.getByRole('button', { name: /${title(i)} review/ }),
    ).toHaveTextContent('Active · Incident Response Portal')
${source}  })

  it('searches live by case-insensitive substring', async () => {
    const user = userEvent.setup()
    render${pascal(i)}()
    await user.type(screen.getByLabelText('Search ${kebab(i)}'), 'SUNSET')
    expect(
      screen.getByText('1 of 6 ${kebab(i)} items · 17% complete · 1 overdue'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /${title(i)} review/ })).not.toBeInTheDocument()
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    render${pascal(i)}()
    await user.selectOptions(screen.getByLabelText('Status'), 'planned')
    expect(
      screen.getByText('3 of 6 ${kebab(i)} items · 17% complete · 1 overdue'),
    ).toBeInTheDocument()
  })

  it('writes a local note', async () => {
    const user = userEvent.setup()
    render${pascal(i)}()
    await user.type(screen.getByLabelText('${title(i)} note'), 'abc')
    expect(screen.getByText('Note: 3 chars')).toBeInTheDocument()
  })
})
`
}

function angularComponentTemplate(i, edges) {
  const parents = parentsOf(edges, i)
  const depImports = parents
    .map(
      (p) =>
        `import { ${linkedFn(p)} as dep${pascal(p)}LinkedTitle } from '../${kebab(p)}/${kebab(p)}.component'`,
    )
    .join('\n')
  const prelude = linkedFnPrelude(i, parents)
  const body = linkedFnBody(i, parents)
  return `import { Component, computed, inject, signal } from '@angular/core'
import { ${itemsConst(i)}, completionRatio, ${ruleFn(i)} } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'
import { filterCatalog, type CatalogStatusFilter } from '../../services/filters'
import { CatalogToolbarComponent } from '../../components/catalog-toolbar.component'
${depImports}
${prelude}
export function ${linkedFn(i)}(): string {
${body}
}

@Component({
  selector: 'app-${kebab(i)}',
  standalone: true,
  imports: [CatalogToolbarComponent],
  templateUrl: './${kebab(i)}.component.html',
})
export class ${pascal(i)}Component {
  private readonly store = inject(DomainStore)

  readonly title = '${title(i)}'

  readonly projects = computed(() => this.store.dataset()?.projects ?? [])

  readonly items = ${itemsConst(i)}

  readonly query = signal('')
  readonly statusFilter = signal<CatalogStatusFilter>('all')
  readonly selectedId = signal<string | null>(null)
  readonly note = signal('')

  readonly filtered = computed(() =>
    filterCatalog(${itemsConst(i)}, this.query(), this.statusFilter()),
  )
  readonly selected = computed(
    () => ${itemsConst(i)}.find((item) => item.id === this.selectedId()) ?? null,
  )
  readonly completion = completionRatio(${itemsConst(i)})
  readonly overdue = ${ruleFn(i)}(${itemsConst(i)})

  readonly source = ${linkedFn(i)}()

  projectName(id: string): string {
    return this.projects().find((project) => project.id === id)?.name ?? id
  }

  statusLabel(value: string): string {
    return value === 'completed' ? 'Completed' : value === 'active' ? 'Active' : 'Planned'
  }

  dueLabel(dueInDays: number): string {
    return dueInDays < 0 ? -dueInDays + ' days overdue' : 'Due in ' + dueInDays + ' days'
  }
}
`
}

function angularHtmlTemplate(i) {
  return `<section aria-label="${title(i)}">
  <h2>${title(i)}</h2>
  <p class="linked-label">Source: {{ source }}</p>
  <app-catalog-toolbar
    [searchLabel]="'Search ${kebab(i)}'"
    [searchId]="'${kebab(i)}-search'"
    [statusId]="'${kebab(i)}-status-filter'"
    [(query)]="query"
    [(statusFilter)]="statusFilter"
  />
  <p class="results-count" aria-live="polite">
    {{ filtered().length }} of {{ items.length }} ${kebab(i)} items · {{ completion ?? 'n/a' }}%
    complete · {{ overdue }} overdue
  </p>
  @if (filtered().length === 0) {
  <p class="empty-state">No ${kebab(i)} items match the current search and filters.</p>
  } @else {
  <ul class="list ${kebab(i)}-list">
    @for (item of filtered(); track item.id) {
    <li>
      <button
        type="button"
        [class.selected]="item.id === selectedId()"
        class="${kebab(i)}-row"
        (click)="selectedId.set(item.id)"
      >
        <span class="${kebab(i)}-title">{{ item.title }}</span>
        <span class="${kebab(i)}-meta">{{ statusLabel(item.status) }} · {{ projectName(item.projectId) }}</span>
      </button>
    </li>
    }
  </ul>
  }
  @if (selected() !== null) {
  <section class="${kebab(i)}-detail" attr.aria-label="{{ title }} {{ selected()!.title }}">
    <h3>{{ selected()!.title }}</h3>
    <p>Project: {{ projectName(selected()!.projectId) }}</p>
    <p>{{ dueLabel(selected()!.dueInDays) }}</p>
  </section>
  }
  <div class="field">
    <label for="${kebab(i)}-note">Note</label>
    <input
      id="${kebab(i)}-note"
      type="text"
      aria-label="${title(i)} note"
      [value]="note()"
      (input)="note.set($any($event.target).value)"
    />
  </div>
  <p class="note-count" aria-live="polite">Note: {{ note().length }} chars</p>
</section>
`
}

function angularSpecTemplate(i, edges) {
  const expectedSource = sourceTitle(i, edges)
  const items = [
    `${title(i)} intake`,
    `${title(i)} review`,
    `${title(i)} rollout`,
    `${title(i)} training`,
    `${title(i)} audit`,
    `${title(i)} sunset`,
  ]
  const titles = items.map((t) => `    expect(text).toContain('${t}')`).join('\n')
  return `import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { ${pascal(i)}Component } from './${kebab(i)}.component'
import { DomainStore } from '../../domain/domain.store'

function setup() {
  TestBed.configureTestingModule({ imports: [${pascal(i)}Component] })
  const store = TestBed.inject(DomainStore)
  store.load()
  const fixture = TestBed.createComponent(${pascal(i)}Component)
  fixture.detectChanges()
  return { fixture }
}

describe('${pascal(i)}Component (Fase 20 — generated catalog feature)', () => {
  it('lists all 6 items with status, project, completion ratio and overdue count', () => {
    const { fixture } = setup()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('6 of 6 ${kebab(i)} items · 17% complete · 1 overdue')
${titles}
    const sourceEl = fixture.nativeElement.querySelector('.linked-label') as HTMLElement
    expect(sourceEl.textContent?.trim()).toBe('Source: ${expectedSource}')
    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('.${kebab(i)}-row'),
    ) as HTMLElement[]
    const row = rows.find((b) => b.textContent?.includes('${title(i)} review')) as HTMLElement
    expect(row.textContent).toContain('Active · Incident Response Portal')
  })

  it('searches live by case-insensitive substring', () => {
    const { fixture } = setup()
    const input = fixture.nativeElement.querySelector('#${kebab(i)}-search') as HTMLInputElement
    input.value = 'sunset'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('1 of 6 ${kebab(i)} items · 17% complete · 1 overdue')
  })

  it('filters by status', () => {
    const { fixture } = setup()
    const select = fixture.nativeElement.querySelector(
      '#${kebab(i)}-status-filter',
    ) as HTMLSelectElement
    select.value = 'planned'
    select.dispatchEvent(new Event('change'))
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('3 of 6 ${kebab(i)} items')
  })

  it('writes a local note', () => {
    const { fixture } = setup()
    const input = fixture.nativeElement.querySelector('#${kebab(i)}-note') as HTMLInputElement
    input.value = 'abc'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Note: 3 chars')
  })
})
`
}

// ---------------------------------------------------------------------------
// App shell rewrites (per scale)
// ---------------------------------------------------------------------------

function reactAppTemplate(scale, exclude = []) {
  const synths = synthNames(scale).filter((n) => !exclude.includes(n))
  const imports = synths.map(
    (f) => `import { ${pascal(parseIndex(f))}Page } from '../features/${f}/${f}-page'`,
  )
  const sectionType = [...REAL_FEATURES, ...synths].map((f) => `'${f}'`).join(' | ')
  const sections = [...REAL_FEATURES, ...synths]
    .map((f) => `  { id: '${f}', label: '${labelOf(f)}' },`)
    .join('\n')
  const renders = [...REAL_FEATURES, ...synths]
    .map((f) => {
      const props =
        f === 'projects' || f === 'tasks'
          ? ` state={state} showCompletedTasks={showCompletedTasks}`
          : ` state={state}`
      return `        {section === '${f}' ? <${componentOf(f)}${props} /> : null}`
    })
    .join('\n')
  return `import { useMemo, useState } from 'react'
import { createDomainStore } from '../services/domain-store'
import { loadDomainDataset } from '../adapters/domain-adapter'
import { useDomainStore } from '../hooks/use-domain-store'
import { DashboardPage } from '../features/dashboard/dashboard-page'
import { ProjectsPage } from '../features/projects/projects-page'
import { TasksPage } from '../features/tasks/tasks-page'
${imports.join('\n')}

// Fase 20 generated shell: persistent state-based navigation (NAV-1).
export type Section = ${sectionType}

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
${sections}
]

export function App() {
  const store = useMemo(() => createDomainStore(loadDomainDataset()), [])
  const state = useDomainStore(store)

  const [section, setSection] = useState<Section>('dashboard')

  // Settings UI state (SET-1..4): session-only, defaults to on, resets on reload.
  const [showCompletedTasks, setShowCompletedTasks] = useState(true)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Operations Hub</h1>
        <nav aria-label="Main">
          <ul>
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  className={section === id ? 'active' : undefined}
                  aria-current={section === id ? 'page' : undefined}
                  onClick={() => setSection(id)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main>
${renders}
      </main>
    </div>
  )
}
`
}

function reactAppTestTemplate(scale, exclude = []) {
  const synths = synthNames(scale).filter((n) => !exclude.includes(n))
  const areas = [...REAL_FEATURES, ...synths].map((f) => `'${labelOf(f)}'`)
  const n = [...REAL_FEATURES, ...synths].length
  const synthSwitch = synths
    .map(
      (f) => `  it('switches to the ${labelOf(f)} view (NAV-2c)', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '${labelOf(f)}' }))
    expect(screen.getByRole('heading', { name: '${labelOf(f)}' })).toBeInTheDocument()
    expect(screen.getByText('6 of 6 ${f} items · 17% complete · 1 overdue')).toBeInTheDocument()
  })`,
    )
    .join('\n\n')
  return `import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'

const AREAS = [${areas.join(', ')}]

function renderApp() {
  render(<App />)
}

describe('App — navigation (NAV)', () => {
  it('offers persistent navigation to all ${n} areas (NAV-1)', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const area of AREAS) {
      expect(within(nav).getByRole('button', { name: area })).toBeInTheDocument()
    }
  })

  it('marks the active area and switches views (NAV-2)', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByText('30 of 30 tasks')).toBeInTheDocument()
  })

  it('uses semantic landmarks (ACC-5)', () => {
    renderApp()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
${synthSwitch ? `\n${synthSwitch}` : ''}
})
`
}

function angularAppTemplate(scale, exclude = []) {
  const synths = synthNames(scale).filter((n) => !exclude.includes(n))
  const imports = synths.map(
    (f) => `import { ${pascal(parseIndex(f))}Component } from './features/${f}/${f}.component'`,
  )
  const sectionType = [...REAL_FEATURES, ...synths].map((f) => `'${f}'`).join(' | ')
  const sections = [...REAL_FEATURES, ...synths]
    .map((f) => `  { id: '${f}', label: '${labelOf(f)}' },`)
    .join('\n')
  const compImports = [...REAL_FEATURES, ...synths]
    .map((f) => `    ${angularComponentOf(f)},`)
    .join('\n')
  return `import { Component, inject, signal } from '@angular/core'
import { DomainStore } from './domain/domain.store'
import { DashboardComponent } from './features/dashboard/dashboard.component'
import { ProjectsComponent } from './features/projects/projects.component'
import { TasksComponent } from './features/tasks/tasks.component'
${imports.join('\n')}

// Fase 20 generated shell: persistent state-based navigation (NAV-1).
export type Section = ${sectionType}

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
${sections}
]

@Component({
  selector: 'app-root',
  imports: [
${compImports}
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly store = inject(DomainStore)

  protected readonly sections = SECTIONS

  protected readonly section = signal<Section>('dashboard')

  protected readonly showCompletedTasks = signal(true)

  constructor() {
    this.store.load()
  }

  protected selectSection(section: Section): void {
    this.section.set(section)
  }

  protected setShowCompletedTasks(value: boolean): void {
    this.showCompletedTasks.set(value)
  }
}
`
}

function angularAppHtmlTemplate(scale, exclude = []) {
  const synths = synthNames(scale).filter((n) => !exclude.includes(n))
  const cases = [...REAL_FEATURES, ...synths]
    .map((f) => {
      const sel =
        f === 'dashboard'
          ? 'app-dashboard'
          : f === 'projects'
            ? 'app-projects'
            : f === 'tasks'
              ? 'app-tasks'
              : `app-${f}`
      const attrs =
        f === 'projects'
          ? ' [showCompletedTasks]="showCompletedTasks()"'
          : f === 'tasks'
            ? ' [showCompletedTasks]="showCompletedTasks()"'
            : ''
      return `  } @case ('${f}') {\n  <${sel}${attrs} />`
    })
    .join('\n')
  return `<header class="app-header">
  <h1>Operations Hub</h1>
  <nav aria-label="Main">
    <ul>
      @for (item of sections; track item.id) {
      <li>
        <button
          type="button"
          [class.active]="section() === item.id"
          [attr.aria-current]="section() === item.id ? 'page' : null"
          (click)="selectSection(item.id)"
        >
          {{ item.label }}
        </button>
      </li>
      }
    </ul>
  </nav>
</header>

<main>
  @switch (section()) { @case ('dashboard') {
  <app-dashboard />
${cases}
  } }
</main>
`
}

function angularAppSpecTemplate(scale, exclude = []) {
  const synths = synthNames(scale).filter((n) => !exclude.includes(n))
  const areas = [...REAL_FEATURES, ...synths].map((f) => `'${labelOf(f)}'`)
  const n = [...REAL_FEATURES, ...synths].length
  const synthSwitch = synths
    .map(
      (f) => `  it('switches to the ${labelOf(f)} view (NAV-2c)', () => {
    const fixture = setup()
    const btn = navButtons(fixture).find((b) => b.textContent?.trim() === '${labelOf(f)}')
    click(btn!)
    fixture.detectChanges()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('6 of 6 ${f} items · 17% complete · 1 overdue')
  })`,
    )
    .join('\n\n')
  return `import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { App } from './app'
import { DomainStore } from './domain/domain.store'

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function setup(): import('@angular/core/testing').ComponentFixture<App> {
  TestBed.configureTestingModule({ imports: [App] })
  const store = TestBed.inject(DomainStore)
  store.load()
  const fixture = TestBed.createComponent(App)
  fixture.detectChanges()
  return fixture
}

function navButtons(fixture: import('@angular/core/testing').ComponentFixture<App>): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('nav button')) as HTMLElement[]
}

describe('App navigation (NAV-1..3)', () => {
  it('makes all ${n} functional areas reachable from persistent navigation', () => {
    const fixture = setup()
    const labels = navButtons(fixture).map((button) => button.textContent?.trim())
    expect(labels).toEqual([${areas.join(', ')}])
  })

  it('indicates the active area with aria-current (NAV-2)', () => {
    const fixture = setup()
    const dashboard = navButtons(fixture)[0]!
    expect(dashboard.getAttribute('aria-current')).toBe('page')

    const tasks = navButtons(fixture).find((b) => b.textContent?.trim() === 'Tasks')!
    click(tasks)
    fixture.detectChanges()
    expect(dashboard.getAttribute('aria-current')).toBeNull()
    expect(tasks.getAttribute('aria-current')).toBe('page')
  })

  it('uses semantic landmarks: header, nav and main (ACC-5)', () => {
    const fixture = setup()
    expect(fixture.nativeElement.querySelector('header nav')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('main')).not.toBeNull()
    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement
    expect(nav.getAttribute('aria-label')).toBe('Main')
  })
${synthSwitch ? `\n${synthSwitch}` : ''}
})
`
}

function componentOf(f) {
  if (f === 'dashboard') return 'DashboardPage'
  if (f === 'projects') return 'ProjectsPage'
  if (f === 'tasks') return 'TasksPage'
  return `${pascal(parseIndex(f))}Page`
}

function angularComponentOf(f) {
  if (f === 'dashboard') return 'DashboardComponent'
  if (f === 'projects') return 'ProjectsComponent'
  if (f === 'tasks') return 'TasksComponent'
  return `${pascal(parseIndex(f))}Component`
}

// ---------------------------------------------------------------------------
// Shared catalog infrastructure (services + toolbar), appended once per scale
// ---------------------------------------------------------------------------

const FILTER_CATALOG_BLOCK = `\n// Fase 20 catalog features: shared presentation filter for catalog items.\nexport type CatalogStatusFilter = CatalogStatus | 'all'\n\nexport function filterCatalog<T extends { status: CatalogStatus }>(\n  items: readonly T[],\n  query: string,\n  status: CatalogStatusFilter,\n): T[] {\n  const term = query.trim().toLowerCase()\n  return items.filter((item) => {\n    const matchesQuery =\n      term === '' ||\n      Object.values(item).some(\n        (value) => typeof value === 'string' && value.toLowerCase().includes(term),\n      )\n    const matchesStatus = status === 'all' || item.status === status\n    return matchesQuery && matchesStatus\n  })\n}\n`

const REACT_TOOLBAR = `import type { CatalogStatusFilter } from '../services/filters'

export interface CatalogToolbarProps {
  searchLabel: string
  searchId: string
  statusId: string
  query: string
  onQueryChange: (value: string) => void
  status: CatalogStatusFilter
  onStatusChange: (value: CatalogStatusFilter) => void
}

// Shared catalog toolbar (Fase 20): every generated catalog feature shares the
// same search + status filter UI. It lives in components/ (never imports a
// feature) and only deals with UI state passed in from the consumer.
export function CatalogToolbar({
  searchLabel,
  searchId,
  statusId,
  query,
  onQueryChange,
  status,
  onStatusChange,
}: CatalogToolbarProps) {
  return (
    <div className="toolbar">
      <div className="field">
        <label htmlFor={searchId}>{searchLabel}</label>
        <input
          id={searchId}
          type="search"
          placeholder={\`\${searchLabel}…\`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={statusId}>Status</label>
        <select
          id={statusId}
          value={status}
          onChange={(event) => onStatusChange(event.target.value as CatalogStatusFilter)}
        >
          <option value="all">All</option>
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>
    </div>
  )
}
`

const ANGULAR_TOOLBAR_TS = `import { Component, input, model } from '@angular/core'
import type { CatalogStatusFilter } from '../services/filters'

// Shared catalog toolbar (Fase 20): every generated catalog feature shares the
// same search + status filter UI. It lives in components/ (never imports a
// feature) and only deals with UI state passed in from the consumer.
@Component({
  selector: 'app-catalog-toolbar',
  standalone: true,
  templateUrl: './catalog-toolbar.component.html',
})
export class CatalogToolbarComponent {
  readonly searchLabel = input.required<string>()
  readonly searchId = input.required<string>()
  readonly statusId = input.required<string>()

  readonly query = model.required<string>()
  readonly statusFilter = model.required<CatalogStatusFilter>()
}
`

const ANGULAR_TOOLBAR_HTML = `<div class="toolbar">
  <div class="field">
    <label [for]="searchId()">{{ searchLabel() }}</label>
    <input
      [id]="searchId()"
      type="search"
      [attr.placeholder]="searchLabel() + '…'"
      [value]="query()"
      (input)="query.set($any($event.target).value)"
    />
  </div>
  <div class="field">
    <label [for]="statusId()">Status</label>
    <select
      [id]="statusId()"
      [value]="statusFilter()"
      (change)="statusFilter.set($any($event.target).value)"
    >
      <option value="all">All</option>
      <option value="planned">Planned</option>
      <option value="active">Active</option>
      <option value="completed">Completed</option>
    </select>
  </div>
</div>
`

const R_FEAT = (f) => join(LAB, 'apps/react-app/src/features', f)
const A_FEAT = (f) => join(LAB, 'apps/angular-app/src/app/features', f)

function writeFile(path, content) {
  const dir = path.slice(0, path.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, content)
}

function appendFilterCatalog() {
  // React services/filters.ts
  const reactFilters = join(LAB, 'apps/react-app/src/services/filters.ts')
  let rf = readFileSync(reactFilters, 'utf8')
  if (!rf.includes('filterCatalog')) {
    if (!rf.includes('CatalogStatus')) {
      rf = rf.replace(
        "import type { Project, ProjectStatus, Task, TaskPriority, TaskStatus } from '@operations-hub/domain'",
        "import type { CatalogStatus, Project, ProjectStatus, Task, TaskPriority, TaskStatus } from '@operations-hub/domain'",
      )
    }
    writeFile(reactFilters, rf.trimEnd() + FILTER_CATALOG_BLOCK)
  }
  // Angular services/filters.ts
  const angularFilters = join(LAB, 'apps/angular-app/src/app/services/filters.ts')
  let af = readFileSync(angularFilters, 'utf8')
  if (!af.includes('filterCatalog')) {
    af = af.replace(
      "import type { Project, ProjectStatus, Task, TaskPriority, TaskStatus } from '@operations-hub/domain'",
      "import type { CatalogStatus, Project, ProjectStatus, Task, TaskPriority, TaskStatus } from '@operations-hub/domain'",
    )
    writeFile(angularFilters, af.trimEnd() + FILTER_CATALOG_BLOCK)
  }
  // Toolbars
  writeFile(join(LAB, 'apps/react-app/src/components/catalog-toolbar.tsx'), REACT_TOOLBAR)
  writeFile(
    join(LAB, 'apps/angular-app/src/app/components/catalog-toolbar.component.ts'),
    ANGULAR_TOOLBAR_TS,
  )
  writeFile(
    join(LAB, 'apps/angular-app/src/app/components/catalog-toolbar.component.html'),
    ANGULAR_TOOLBAR_HTML,
  )
}

function writeDomainIndex(scale) {
  const index = join(LAB, 'packages/domain/src/index.ts')
  let content = readFileSync(index, 'utf8')
  // Remove any previous catalog exports (Fase 19/20, idempotent regeneration).
  content = content
    .split('\n')
    .filter(
      (line) =>
        !/Fase 19|Fase 20/.test(line) &&
        !/catalogs\/catalog-/.test(line) &&
        !/catalogs\/shared/.test(line),
    )
    .join('\n')
  const block = [
    '',
    '// Fase 20 generated catalogs',
    "export { CATALOG_STATUSES, completionRatio, countByStatus, openCount } from './catalogs/shared'",
    "export type { CatalogItem, CatalogStatus } from './catalogs/shared'",
    ...synthNames(scale).flatMap((f) => {
      const i = parseIndex(f)
      return [
        `export { ${itemsConst(i)}, ${ruleFn(i)} } from './catalogs/${f}'`,
        `export type { ${pascal(i)}Item } from './catalogs/${f}'`,
      ]
    }),
  ]
  writeFile(index, content.trimEnd() + '\n' + block.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Topology generation (snapshot per topology)
// ---------------------------------------------------------------------------

function generateTopo(topo) {
  const scale = scaleOf(topo.key)
  const label = `topo-${topo.key.replace(':', '-')}`
  const edges = buildEdges(topo)
  const graph = graphMetrics(scale, topo, edges)
  if (graph.edges !== topo.edges) {
    throw new Error(`topo ${topo.key}: built ${graph.edges} edges, expected ${topo.edges}`)
  }
  // Snapshots share a linear history, so remove generated features that a
  // smaller scale (F10) does not own (they would reference domain exports
  // missing from the smaller scale's index and break typecheck).
  const synthList = synthNames(scale)
  const stale = Array.from({ length: 27 }, (_, k) => kebab(k + 1)).filter(
    (f) => !synthList.includes(f),
  )
  for (const f of stale) {
    rm(join(R_FEAT(f)))
    rm(join(A_FEAT(f)))
    rm(join(LAB, `packages/domain/src/catalogs/${f}.ts`))
  }
  // 1. Domain catalogs
  mkdirSync(join(LAB, 'packages/domain/src/catalogs'), { recursive: true })
  writeFile(join(LAB, 'packages/domain/src/catalogs/shared.ts'), domainSharedTemplate())
  for (const f of synthNames(scale)) {
    writeFile(
      join(LAB, 'packages/domain/src/catalogs', `${f}.ts`),
      domainCatalogTemplate(parseIndex(f)),
    )
  }
  writeDomainIndex(scale)
  // 2. Shared services + toolbar
  appendFilterCatalog()
  // 3. Features (React + Angular)
  for (const f of synthNames(scale)) {
    const i = parseIndex(f)
    writeFile(join(R_FEAT(f), `${f}-page.tsx`), reactPageTemplate(i, edges))
    writeFile(join(R_FEAT(f), `${f}-page.test.tsx`), reactTestTemplate(i, edges))
    writeFile(join(A_FEAT(f), `${f}.component.ts`), angularComponentTemplate(i, edges))
    writeFile(join(A_FEAT(f), `${f}.component.html`), angularHtmlTemplate(i))
    writeFile(join(A_FEAT(f), `${f}.component.spec.ts`), angularSpecTemplate(i, edges))
  }
  // 4. App shell
  writeFile(join(LAB, 'apps/react-app/src/app/App.tsx'), reactAppTemplate(scale))
  writeFile(join(LAB, 'apps/react-app/src/app/App.test.tsx'), reactAppTestTemplate(scale))
  writeFile(join(LAB, 'apps/angular-app/src/app/app.ts'), angularAppTemplate(scale))
  writeFile(join(LAB, 'apps/angular-app/src/app/app.html'), angularAppHtmlTemplate(scale))
  writeFile(join(LAB, 'apps/angular-app/src/app/app.spec.ts'), angularAppSpecTemplate(scale))
  // 5. Commit snapshot
  git('add', '-A')
  git(
    'commit',
    '-q',
    '-m',
    `topo ${topo.key}: ${scale.total} features, ${topo.edges} edges, ${topo.shape} shape`,
    '--allow-empty',
  )
  return { label, edges, graph }
}

// ---------------------------------------------------------------------------
// Source scan (verify the designed graph matches reality)
// ---------------------------------------------------------------------------

function scanGraph(scale, topo, designedEdges) {
  const feats = featureNames(scale)
  const edges = []
  for (const f of feats) {
    const files = []
    const rPage = join(R_FEAT(f), `${f}-page.tsx`)
    const aComp = join(A_FEAT(f), `${f}.component.ts`)
    if (existsSync(rPage)) files.push(readFileSync(rPage, 'utf8'))
    if (existsSync(aComp)) files.push(readFileSync(aComp, 'utf8'))
    for (const content of files) {
      const re = /from '\.\.\/([a-z0-9-]+)\//g
      let m
      while ((m = re.exec(content)) !== null) {
        const dep = m[1]
        if (feats.includes(dep) && dep !== f) {
          edges.push({ from: f, to: dep })
        }
      }
    }
  }
  const unique = []
  for (const e of edges) {
    if (!unique.some((u) => u.from === e.from && u.to === e.to)) unique.push(e)
  }
  const designed = new Set(designedEdges.map(([i, j]) => `${kebab(i)}->${kebab(j)}`))
  const scanned = new Set(unique.map((e) => `${e.from}->${e.to}`))
  const unexpected = [...scanned].filter((e) => !designed.has(e))
  const missing = [...designed].filter((e) => !scanned.has(e))
  // domain -> apps imports (must be 0)
  const domainImportsApps = (() => {
    const res = sh(
      `grep -rl "from '.*react-app\\|from '.*angular-app" ${LAB}/packages/domain/src 2>/dev/null | wc -l`,
    )
    return Number(res.out.trim())
  })()
  return {
    scannedEdges: unique.length,
    designedEdges: designed.size,
    unexpectedEdges: unexpected,
    missingEdges: missing,
    domainImportsApps,
    violations: unexpected.length,
  }
}

// ---------------------------------------------------------------------------
// Scenario definitions (topology-aware)
// ---------------------------------------------------------------------------

function topoContext(scale, topo, edges) {
  const feats = featureNames(scale)
  const synth = synthNames(scale)
  const inDeg = {}
  const outDeg = {}
  for (const f of feats) {
    inDeg[f] = 0
    outDeg[f] = 0
  }
  for (const [i, j] of edges) {
    outDeg[kebab(i)]++
    inDeg[kebab(j)]++
  }
  const sortedByInDeg = [...synth].sort((a, b) => {
    if (inDeg[b] !== inDeg[a]) return inDeg[b] - inDeg[a]
    return parseIndex(a) - parseIndex(b)
  })
  const root = sortedByInDeg[0]
  const leafCandidates = [...synth].sort((a, b) => {
    if (inDeg[a] !== inDeg[b]) return inDeg[a] - inDeg[b]
    if (outDeg[b] !== outDeg[a]) return outDeg[b] - outDeg[a]
    return parseIndex(b) - parseIndex(a)
  })
  const leaf = leafCandidates[0]
  const consumers = new Set()
  const stack = edges.filter(([, j]) => kebab(j) === root).map(([i]) => kebab(i))
  while (stack.length) {
    const node = stack.pop()
    if (consumers.has(node)) continue
    consumers.add(node)
    for (const [i, j] of edges) {
      if (kebab(j) === node) stack.push(kebab(i))
    }
  }
  return { root, leaf, consumers, inDeg, outDeg }
}

function expectedAffected(ctx, topo, scenario) {
  switch (scenario) {
    case 'M1':
    case 'D1':
      return new Set([ctx.leaf])
    case 'M2':
    case 'D2':
      return topo.shape === 'none' ? new Set([ctx.root]) : new Set([ctx.root, ...ctx.consumers])
    case 'M3':
    case 'M5':
      return new Set(synthNames(scaleOf(topo.key)))
    case 'M4':
      return topo.shape === 'none' ? new Set([ctx.root]) : new Set([ctx.root, ...ctx.consumers])
    case 'M6':
      return new Set([ctx.leaf])
    default:
      return new Set()
  }
}

function scenarioTargets(ctx, topo, scenario) {
  switch (scenario) {
    case 'M1':
    case 'D1':
      return { feature: ctx.leaf }
    case 'M2':
    case 'D2':
      return { feature: ctx.root }
    case 'M3':
    case 'M5':
      return { feature: 'domain' }
    case 'M4':
      return { feature: ctx.root }
    case 'M6':
      return { feature: ctx.leaf }
    default:
      return {}
  }
}

function testTargets(ctx, topo, scale, scenario) {
  switch (scenario) {
    case 'M1':
    case 'D1':
      return [ctx.leaf]
    case 'M2':
    case 'D2':
      return topo.shape === 'none' ? [ctx.root] : [ctx.root, ...ctx.consumers]
    case 'M3':
      return [] // typecheck-driven
    case 'M4':
      return [] // typecheck-driven
    case 'M5':
      return synthNames(scale)
    case 'M6':
      return [ctx.leaf]
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Scenario apply/fix (source patches in the lab copy)
// ---------------------------------------------------------------------------

function fileOf(app, f, kind) {
  if (app === 'react') {
    if (kind === 'page') return join(R_FEAT(f), `${f}-page.tsx`)
    if (kind === 'test') return join(R_FEAT(f), `${f}-page.test.tsx`)
  }
  if (kind === 'comp') return join(A_FEAT(f), `${f}.component.ts`)
  if (kind === 'html') return join(A_FEAT(f), `${f}.component.html`)
  if (kind === 'spec') return join(A_FEAT(f), `${f}.component.spec.ts`)
  return null
}

const patch = (file, from, to) => {
  const p = join(LAB, file)
  const content = readFileSync(p, 'utf8')
  if (!content.includes(from)) {
    throw new Error(`ANCHOR NOT FOUND in ${file}: ${from.slice(0, 80)}`)
  }
  writeFile(p, content.replace(from, to))
}

function applyScenario(ctx, topo, scale, app, scenario) {
  const t = scenarioTargets(ctx, topo, scenario)
  const f = t.feature
  const i = parseIndex(f)
  const shared = 'packages/domain/src/catalogs/shared.ts'

  switch (scenario) {
    case 'M1': {
      // Peripheral: add a subtitle to the leaf feature.
      const marker = `      <h2>${title(i)}</h2>\n`
      const markerAngular = `  <h2>${title(i)}</h2>\n`
      if (app === 'react') {
        patch(
          `apps/react-app/src/features/${f}/${f}-page.tsx`,
          marker,
          marker + `      <p className="feature-subtitle">Managed catalog</p>\n`,
        )
      } else {
        patch(
          `apps/angular-app/src/app/features/${f}/${f}.component.html`,
          markerAngular,
          markerAngular + `  <p class="feature-subtitle">Managed catalog</p>\n`,
        )
      }
      break
    }
    case 'M2': {
      // Central: change the hub's own title (semantic, type-valid).
      const from = `const ${ownTitleVar(i)} = '${title(i)}'`
      const to = `const ${ownTitleVar(i)} = '${title(i)} (v2)'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
    case 'M3': {
      // Contract: completionRatio gains a required second parameter.
      patch(
        shared,
        `export function completionRatio<T extends CatalogItem>(items: readonly T[]): number | null {`,
        `export function completionRatio<T extends CatalogItem>(items: readonly T[], scale: number): number | null {`,
      )
      patch(
        shared,
        `  return Math.round((countByStatus(items, 'completed') / items.length) * 100)`,
        `  return Math.round((countByStatus(items, 'completed') / items.length) * scale * 100) / scale`,
      )
      break
    }
    case 'M4': {
      // Deletion: remove the hub feature entirely (source + domain + wiring).
      rm(join(LAB, `apps/react-app/src/features/${f}`))
      rm(join(LAB, `apps/angular-app/src/app/features/${f}`))
      rm(join(LAB, `packages/domain/src/catalogs/${f}.ts`))
      const index = join(LAB, 'packages/domain/src/index.ts')
      let content = readFileSync(index, 'utf8')
      content = content
        .split('\n')
        .filter((line) => !line.includes(`catalogs/${f}'`) && !line.includes(`${pascal(i)}Item`))
        .join('\n')
      writeFile(index, content)
      const exclude = [f]
      writeFile(join(LAB, 'apps/react-app/src/app/App.tsx'), reactAppTemplate(scale, exclude))
      writeFile(
        join(LAB, 'apps/react-app/src/app/App.test.tsx'),
        reactAppTestTemplate(scale, exclude),
      )
      writeFile(join(LAB, 'apps/angular-app/src/app/app.ts'), angularAppTemplate(scale, exclude))
      writeFile(
        join(LAB, 'apps/angular-app/src/app/app.html'),
        angularAppHtmlTemplate(scale, exclude),
      )
      writeFile(
        join(LAB, 'apps/angular-app/src/app/app.spec.ts'),
        angularAppSpecTemplate(scale, exclude),
      )
      break
    }
    case 'M5': {
      // Domain rule semantic change: round -> floor (17% becomes 16%).
      patch(shared, `  return Math.round(`, `  return Math.floor(`)
      break
    }
    case 'M6': {
      // Internal refactor: rename statusLabel -> statusBadge in the leaf
      // (every occurrence — pure rename, behaviour unchanged).
      if (app === 'react') {
        const p = join(LAB, `apps/react-app/src/features/${f}/${f}-page.tsx`)
        const content = readFileSync(p, 'utf8')
        writeFile(p, content.replaceAll('statusLabel', 'statusBadge'))
      } else {
        const p = join(LAB, `apps/angular-app/src/app/features/${f}/${f}.component.ts`)
        const content = readFileSync(p, 'utf8')
        writeFile(p, content.replaceAll('statusLabel', 'statusBadge'))
        const h = join(LAB, `apps/angular-app/src/app/features/${f}/${f}.component.html`)
        const hc = readFileSync(h, 'utf8')
        writeFile(h, hc.replaceAll('statusLabel', 'statusBadge'))
      }
      break
    }
    case 'D1': {
      // Peripheral semantic bug (type-valid): swap Active/Planned labels.
      const from = `value === 'completed' ? 'Completed' : value === 'active' ? 'Active' : 'Planned'`
      const to = `value === 'completed' ? 'Completed' : value === 'active' ? 'Planned' : 'Active'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
    case 'D2': {
      // Central semantic bug (type-valid): wrong title in the hub.
      const from = `const ${ownTitleVar(i)} = '${title(i)}'`
      const to = `const ${ownTitleVar(i)} = 'Catalog 99'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
  }
}

function fixScenario(ctx, topo, scale, app, scenario) {
  const t = scenarioTargets(ctx, topo, scenario)
  const f = t.feature
  const i = parseIndex(f)
  const shared = 'packages/domain/src/catalogs/shared.ts'

  switch (scenario) {
    case 'M1': {
      const marker = `      <h2>${title(i)}</h2>\n`
      const markerAngular = `  <h2>${title(i)}</h2>\n`
      if (app === 'react') {
        patch(
          `apps/react-app/src/features/${f}/${f}-page.tsx`,
          marker + `      <p className="feature-subtitle">Managed catalog</p>\n`,
          marker,
        )
      } else {
        patch(
          `apps/angular-app/src/app/features/${f}/${f}.component.html`,
          markerAngular + `  <p class="feature-subtitle">Managed catalog</p>\n`,
          markerAngular,
        )
      }
      break
    }
    case 'M2': {
      const from = `const ${ownTitleVar(i)} = '${title(i)} (v2)'`
      const to = `const ${ownTitleVar(i)} = '${title(i)}'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
    case 'M3': {
      // Fix = adapt all consumers to the new contract (migration cost).
      const call = (name) => `completionRatio(${name})`
      const fixed = (name) => `completionRatio(${name}, 1)`
      if (app === 'react') {
        for (const n of synthNames(scale)) {
          const p = join(LAB, `apps/react-app/src/features/${n}/${n}-page.tsx`)
          const content = readFileSync(p, 'utf8')
          writeFile(
            p,
            content.replaceAll(call(itemsConst(parseIndex(n))), fixed(itemsConst(parseIndex(n)))),
          )
        }
      } else {
        for (const n of synthNames(scale)) {
          const p = join(LAB, `apps/angular-app/src/app/features/${n}/${n}.component.ts`)
          const content = readFileSync(p, 'utf8')
          writeFile(
            p,
            content.replaceAll(call(itemsConst(parseIndex(n))), fixed(itemsConst(parseIndex(n)))),
          )
        }
      }
      break
    }
    case 'M4': {
      // Deletion has no fix: it is the final state (residual refs measured).
      break
    }
    case 'M5': {
      // Fix = adapt test expectations to the new rule (17% -> 16%).
      if (app === 'react') {
        for (const n of synthNames(scale)) {
          const p = join(LAB, `apps/react-app/src/features/${n}/${n}-page.test.tsx`)
          const content = readFileSync(p, 'utf8')
          writeFile(p, content.replaceAll(`17% complete`, `16% complete`))
        }
      } else {
        for (const n of synthNames(scale)) {
          const p = join(LAB, `apps/angular-app/src/app/features/${n}/${n}.component.spec.ts`)
          const content = readFileSync(p, 'utf8')
          writeFile(p, content.replaceAll(`17% complete`, `16% complete`))
        }
      }
      break
    }
    case 'M6': {
      if (app === 'react') {
        const p = join(LAB, `apps/react-app/src/features/${f}/${f}-page.tsx`)
        const content = readFileSync(p, 'utf8')
        writeFile(p, content.replaceAll('statusBadge', 'statusLabel'))
      } else {
        const p = join(LAB, `apps/angular-app/src/app/features/${f}/${f}.component.ts`)
        const content = readFileSync(p, 'utf8')
        writeFile(p, content.replaceAll('statusBadge', 'statusLabel'))
        const h = join(LAB, `apps/angular-app/src/app/features/${f}/${f}.component.html`)
        const hc = readFileSync(h, 'utf8')
        writeFile(h, hc.replaceAll('statusBadge', 'statusLabel'))
      }
      break
    }
    case 'D1': {
      const from = `value === 'completed' ? 'Completed' : value === 'active' ? 'Planned' : 'Active'`
      const to = `value === 'completed' ? 'Completed' : value === 'active' ? 'Active' : 'Planned'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
    case 'D2': {
      const from = `const ${ownTitleVar(i)} = 'Catalog 99'`
      const to = `const ${ownTitleVar(i)} = '${title(i)}'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
  }
}

const rm = (p) => {
  execFileSync('rm', ['-rf', p])
}

// ---------------------------------------------------------------------------
// Test / typecheck runners
// ---------------------------------------------------------------------------

function runReactTests(files) {
  const args = files.map((f) => `src/features/${f}/${f}-page.test.tsx`).join(' ')
  const res = sh(`cd ${LAB} && pnpm --filter react-app test ${args} 2>&1`, { timeout: 300000 })
  return res
}

function runAngularTests(files) {
  let include
  if (files.length === 1) {
    include = `**/${files[0]}.component.spec.ts`
  } else {
    include = `**/catalog-*.spec.ts`
  }
  const res = sh(`cd ${LAB} && pnpm --filter angular-app test --include='${include}' 2>&1`, {
    timeout: 300000,
  })
  return res
}

function failingTestFiles(out, app) {
  const clean = stripAnsi(out)
  const files = new Set()
  const re =
    app === 'react'
      ? /(?:FAIL|❯)\s+([\w./-]+\.(?:test|spec)\.tsx?)/g
      : /(?:FAIL|❯)\s+[\w-]+\s+([\w./-]+\.(?:spec|test)\.ts)/g
  let m
  while ((m = re.exec(clean)) !== null) {
    files.add(m[1])
  }
  return [...files]
}

function runTypecheck(app) {
  const res = sh(
    `cd ${LAB} && pnpm --filter ${app === 'react' ? 'react-app' : 'angular-app'} typecheck 2>&1`,
    { timeout: 300000 },
  )
  const clean = stripAnsi(res.out)
  const errors = (clean.match(/error TS\d+/g) || []).length
  return { ok: res.ok, errors, out: clean }
}

// ---------------------------------------------------------------------------
// Structural measurement (git diff vs snapshot ref)
// ---------------------------------------------------------------------------

function diffMetrics(snapshotRef) {
  const nameOnly = git('diff', '--name-only', snapshotRef)
  const files = nameOnly.split('\n').filter(Boolean)
  const numstat = git('diff', '--numstat', snapshotRef)
  let locAdded = 0
  let locRemoved = 0
  for (const line of numstat.split('\n')) {
    const parts = line.split('\t')
    if (parts.length >= 2) {
      if (/^\d+$/.test(parts[0])) locAdded += Number(parts[0])
      if (/^\d+$/.test(parts[1])) locRemoved += Number(parts[1])
    }
  }
  return { files, locAdded, locRemoved }
}

function dependenciesAdded(snapshotRef) {
  const diff = git('diff', snapshotRef)
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  const featImports = added.filter(
    (l) => /from '\.\.\/[a-z0-9-]+\/[a-z0-9-]+'/.test(l) && !/from '\.\.\/components\//.test(l),
  )
  return featImports.length
}

function featuresOfFiles(files) {
  const out = new Set()
  for (const f of files) {
    const m = f.match(/features\/([a-z0-9-]+)\//)
    if (m) out.add(m[1])
  }
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function ensureLab() {
  if (!existsSync(join(LAB, 'package.json'))) {
    console.log(`[setup] cloning repo into ${LAB} …`)
    sh(`rm -rf ${LAB}`)
    sh(`git clone -q ${ROOT} ${LAB}`)
    console.log('[setup] pnpm install …')
    const res = sh(`cd ${LAB} && pnpm install --frozen-lockfile 2>&1 | tail -3`)
    console.log(res.out)
  }
}

function buildDomain() {
  const res = sh(`cd ${LAB} && pnpm --filter @operations-hub/domain build 2>&1 | tail -3`, {
    timeout: 180000,
  })
  if (!res.ok) throw new Error('domain build failed: ' + res.out)
}

function validateState(topo, snapshotRef) {
  const scale = scaleOf(topo.key)
  const edges = buildEdges(topo)
  console.log(`[validate] ${topo.key} …`)
  buildDomain()
  const reactTc = runTypecheck('react')
  const angularTc = runTypecheck('angular')
  const reactTests = sh(`cd ${LAB} && pnpm --filter react-app test 2>&1`, { timeout: 600000 })
  const angularTests = sh(`cd ${LAB} && pnpm --filter angular-app test 2>&1`, { timeout: 600000 })
  const scan = scanGraph(scale, topo, edges)
  const state = {
    typecheck: {
      react: { ok: reactTc.ok, errors: reactTc.errors },
      angular: { ok: angularTc.ok, errors: angularTc.errors },
    },
    tests: {
      react: { ok: reactTests.ok, failing: failingTestFiles(reactTests.out, 'react') },
      angular: { ok: angularTests.ok, failing: failingTestFiles(angularTests.out, 'angular') },
    },
    graph: scan,
  }
  console.log(
    `[validate] ${topo.key}: reactTc=${state.typecheck.react.ok} angTc=${state.typecheck.angular.ok} reactTests=${state.tests.react.ok} angTests=${state.tests.angular.ok} edges=${scan.scannedEdges}/${scan.designedEdges}`,
  )
  if (
    !state.typecheck.react.ok ||
    !state.typecheck.angular.ok ||
    !state.tests.react.ok ||
    !state.tests.angular.ok
  ) {
    throw new Error(
      `topology state ${topo.key} FAILED validation:\n${JSON.stringify(state, null, 1)}`,
    )
  }
  return state
}

function runCell(topo, snapshotRef, ctx, edges, app, scenario, snapshots, results) {
  const cellKey = `${topo.key}:${scenario}:${app}`
  if (FILTER && !cellKey.startsWith(FILTER)) return
  if (results[cellKey]) {
    console.log(`  [skip] ${cellKey} (already measured)`)
    return
  }
  const scale = scaleOf(topo.key)
  console.log(`[cell] ${cellKey} …`)

  git('checkout', '-q', '--', '.')
  git('reset', '-q', '--hard', snapshotRef)
  buildDomain()

  const expected = expectedAffected(ctx, topo, scenario)
  const result = {
    topology: topo.key,
    featureCount: scale.total,
    edgeCount: edges.length,
    density: Math.round((edges.length / (scale.total * (scale.total - 1))) * 10000) / 10000,
    app,
    scenario,
    targetFeature: scenarioTargets(ctx, topo, scenario).feature,
  }

  try {
    applyScenario(ctx, topo, scale, app, scenario)
    if (scenario === 'M3' || scenario === 'M4' || scenario === 'M5') buildDomain()

    // --- measure (before fix) ---
    const diff = diffMetrics(snapshotRef)
    const affectedFeatures = featuresOfFiles(diff.files)
    const unrelated = [...affectedFeatures].filter(
      (f) => !expected.has(f) && !REAL_FEATURES.includes(f),
    )
    const domainOnly = diff.files.every((f) => f.startsWith('packages/domain'))
    result.filesChanged = diff.files
    result.locAdded = diff.locAdded
    result.locRemoved = diff.locRemoved
    result.featuresAffected = [...affectedFeatures]
    result.unrelatedFeaturesTouched = domainOnly ? [] : unrelated
    result.blastRadius =
      diff.files.length +
      [...affectedFeatures].length +
      (result.unrelatedFeaturesTouched.length ? 1 : 0)
    result.dependenciesAdded = dependenciesAdded(snapshotRef)

    // filesInspected proxy:
    //  - maintenance scenarios: files the change touches (git-derived)
    //  - D1 (local presentational bug): the leaf's own file
    //  - D2 (hub bug): files referencing the hub's linkedFn (grep)
    if (scenario === 'D1') {
      result.filesInspected = 1
    } else if (scenario === 'D2') {
      const hubFn = linkedFn(parseIndex(ctx.root))
      const dir =
        app === 'react'
          ? join(LAB, 'apps/react-app/src/features')
          : join(LAB, 'apps/angular-app/src/app/features')
      const res = sh(`grep -rl "${hubFn}" ${dir} 2>/dev/null | wc -l`)
      result.filesInspected = Number(res.out.trim())
    } else {
      result.filesInspected = diff.files.length
    }

    // causeToSymptomDistance: debugging only. D2 = deepest transitive
    // consumer of the hub (1 when nobody consumes it).
    if (scenario === 'D1') result.causeToSymptomDistance = 1
    else if (scenario === 'D2') {
      result.causeToSymptomDistance =
        ctx.consumers.size === 0 ? 1 : graphMetrics(scale, topo, edges).hubConsumerMaxDepth
    }

    // --- tests / typecheck ---
    if (scenario === 'M3' || scenario === 'M4') {
      const tc = runTypecheck(app)
      result.typecheckOk = tc.ok
      result.typecheckErrors = tc.errors
      result.testsFailing = []
      result.testsFailingCount = 0
    } else {
      const targets = testTargets(ctx, topo, scale, scenario)
      const run = app === 'react' ? runReactTests(targets) : runAngularTests(targets)
      const failing = failingTestFiles(run.out, app)
      result.typecheckOk = true
      result.typecheckErrors = 0
      result.testsFailing = failing
      result.testsFailingCount = failing.length
    }
    result.regressionTestsNeeded = result.testsFailingCount

    // --- fix / validate ---
    if (scenario !== 'M4') fixScenario(ctx, topo, scale, app, scenario)
    if (scenario === 'M3' || scenario === 'M5' || scenario === 'M4') buildDomain()
    const afterDiff = diffMetrics(snapshotRef)
    const afterFail = () => {
      if (scenario === 'M3' || scenario === 'M4') {
        return runTypecheck(app)
      }
      const targets = testTargets(ctx, topo, scale, scenario)
      const run = app === 'react' ? runReactTests(targets) : runAngularTests(targets)
      const failing = failingTestFiles(run.out, app)
      return { ok: failing.length === 0 && run.ok, failing }
    }
    const after = afterFail()
    result.suiteOkAfter = after.ok
    result.testsFailingAfter = after.failing || []
    result.filesChangedAfterFix = afterDiff.files
    result.locResidual = afterDiff.locAdded + afterDiff.locRemoved
    result.invariantsOk = result.unrelatedFeaturesTouched.length === 0

    if (scenario === 'M4') {
      const res = sh(
        `grep -rl "${ctx.root}" ${LAB}/apps/react-app/src/features ${LAB}/apps/angular-app/src/app/features ${LAB}/packages/domain/src 2>/dev/null | wc -l`,
      )
      result.residualReferences = Number(res.out.trim())
    }
  } catch (err) {
    result.error = String(err.message || err)
  }

  results[cellKey] = result
  console.log(
    `  [done] ${cellKey}: files=${result.filesChanged?.length} insp=${result.filesInspected} dist=${result.causeToSymptomDistance ?? '-'} blast=${result.blastRadius} testsFail=${result.testsFailingCount} tcErr=${result.typecheckErrors} afterOk=${result.suiteOkAfter}`,
  )

  git('checkout', '-q', '--', '.')
  git('reset', '-q', '--hard', snapshotRef)
}

// ---------------------------------------------------------------------------
// Aggregates, correlations, control pairs
// ---------------------------------------------------------------------------

function aggregate(results) {
  const byScenario = {}
  for (const [key, cell] of Object.entries(results)) {
    if (cell.error) continue
    const s = `${cell.topology}:${cell.scenario}`
    if (!byScenario[s]) byScenario[s] = { react: null, angular: null }
    byScenario[s][cell.app] = cell
  }
  const out = {}
  for (const [key, pair] of Object.entries(byScenario)) {
    const summarize = (app) => {
      const c = pair[app]
      if (!c) return null
      return {
        filesChanged: c.filesChanged?.length ?? 0,
        filesInspected: c.filesInspected ?? 0,
        causeToSymptomDistance: c.causeToSymptomDistance ?? null,
        blastRadius: c.blastRadius ?? 0,
        testsFailing: c.testsFailingCount ?? 0,
        typecheckErrors: c.typecheckErrors ?? 0,
        unrelatedFeatures: c.unrelatedFeaturesTouched?.length ?? 0,
        locAdded: c.locAdded ?? 0,
        locRemoved: c.locRemoved ?? 0,
        dependenciesAdded: c.dependenciesAdded ?? 0,
        suiteOkAfter: c.suiteOkAfter ?? false,
      }
    }
    out[key] = {
      topology: key.split(':')[0],
      scenario: key.split(':')[1],
      react: summarize('react'),
      angular: summarize('angular'),
    }
  }
  return out
}

function pearson(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  const r = num / Math.sqrt(dx * dy)
  return { n, r: +r.toFixed(4), r2: +(r * r).toFixed(4) }
}

function computeCorrelations(results, graph) {
  // F30 coupled topologies (excludes CLEAN) — deterministic descriptive data.
  const coupled30 = TOPOLOGIES.filter((t) => t.scale === 'F30' && t.shape !== 'none')
  const g = (key) => graph[key]
  const corr = (scenarios, xKey, yKey) => {
    const xs = []
    const ys = []
    for (const t of coupled30) {
      for (const s of scenarios) {
        for (const app of ['react', 'angular']) {
          const cell = results[`${t.key}:${s}:${app}`]
          if (!cell) continue
          const x =
            xKey === 'density'
              ? g(t.key).density
              : xKey === 'maxDepth'
                ? g(t.key).maxDepth
                : xKey === 'transitiveConsumers'
                  ? g(t.key).transitiveConsumersOfHub
                  : xKey === 'directConsumers'
                    ? g(t.key).directConsumersOfHub
                    : null
          const y =
            yKey === 'blastRadius'
              ? cell.blastRadius
              : yKey === 'causeToSymptomDistance'
                ? cell.causeToSymptomDistance
                : yKey === 'testsFailing'
                  ? cell.testsFailingCount
                  : yKey === 'filesInspected'
                    ? cell.filesInspected
                    : null
          if (x === null || y === null) continue
          xs.push(x)
          ys.push(y)
        }
      }
    }
    return pearson(xs, ys)
  }
  return {
    densityVsMaxDepth: pearson(
      coupled30.map((t) => g(t.key).density),
      coupled30.map((t) => g(t.key).maxDepth),
    ),
    densityVsBlastRadius: {
      M2: corr(['M2'], 'density', 'blastRadius'),
      M3: corr(['M3'], 'density', 'blastRadius'),
      M5: corr(['M5'], 'density', 'blastRadius'),
      D2: corr(['D2'], 'density', 'blastRadius'),
    },
    maxDepthVsCauseToSymptom: corr(['D2'], 'maxDepth', 'causeToSymptomDistance'),
    maxDepthVsFilesInspected: corr(['D2'], 'maxDepth', 'filesInspected'),
    transitiveConsumersVsBlastRadius: {
      M2: corr(['M2'], 'transitiveConsumers', 'blastRadius'),
      D2: corr(['D2'], 'transitiveConsumers', 'blastRadius'),
    },
    directConsumersVsBlastRadius: {
      M2: corr(['M2'], 'directConsumers', 'blastRadius'),
      D2: corr(['D2'], 'directConsumers', 'blastRadius'),
    },
    transitiveConsumersVsTestsFailing: {
      M2: corr(['M2'], 'transitiveConsumers', 'testsFailing'),
      D2: corr(['D2'], 'transitiveConsumers', 'testsFailing'),
    },
  }
}

function computeControlPairs(results, graph) {
  const pairs = {
    'PAR-1': {
      description: 'same featureCount + same density + different depth',
      a: 'F30:STAR-0.20',
      b: 'F30:CHAIN-0.20',
      note: '174 edges each, density 0.200; star shallow vs chain deep',
    },
    'PAR-2': {
      description: 'same featureCount + similar depth + different density',
      a: 'F30:STAR-0.10',
      b: 'F30:STAR-0.20',
      note: 'same star shape; density 0.100 vs 0.200; depth 6 vs 8',
    },
    'PAR-3': {
      description: 'same featureCount + same edge count + different distribution',
      a: 'F30:CHAIN-0.10',
      b: 'F30:STAR-0.10',
      note: '87 edges each; chain (deep) vs star (shallow) distribution',
    },
    'PAR-4': {
      description: '10 vs 30 features with comparable density',
      a: 'F10:STAR-0.20',
      b: 'F30:STAR-0.20',
      note: 'density 0.200 at both sizes; star shape',
    },
  }
  const out = {}
  for (const [id, p] of Object.entries(pairs)) {
    const ga = graph[p.a]
    const gb = graph[p.b]
    out[id] = {
      ...p,
      graphA: ga && {
        featureCount: ga.nodes,
        edges: ga.edges,
        density: ga.density,
        maxDepth: ga.maxDepth,
        avgDepth: ga.avgDepth,
        transitiveConsumersOfHub: ga.transitiveConsumersOfHub,
      },
      graphB: gb && {
        featureCount: gb.nodes,
        edges: gb.edges,
        density: gb.density,
        maxDepth: gb.maxDepth,
        avgDepth: gb.avgDepth,
        transitiveConsumersOfHub: gb.transitiveConsumersOfHub,
      },
      cells: {},
    }
    for (const s of ['M2', 'M3', 'M4', 'M5', 'D2']) {
      const row = {}
      for (const app of ['react', 'angular']) {
        const ca = results[`${p.a}:${s}:${app}`]
        const cb = results[`${p.b}:${s}:${app}`]
        if (!ca || !cb) continue
        const metric = (c) => ({
          blast: c.blastRadius,
          dist: c.causeToSymptomDistance ?? null,
          insp: c.filesInspected,
          tests: c.testsFailingCount,
          tc: c.typecheckErrors,
        })
        row[app] = {
          a: metric(ca),
          b: metric(cb),
          deltaBlast: cb.blastRadius - ca.blastRadius,
          deltaDist: (cb.causeToSymptomDistance ?? 0) - (ca.causeToSymptomDistance ?? 0),
        }
      }
      out[id].cells[s] = row
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

function main() {
  ensureLab()
  let results = {}
  let stateValidation = {}
  let graph = {}
  if (existsSync(RESULTS_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
      results = prev.results || {}
      stateValidation = prev.stateValidation || {}
      graph = prev.graph || {}
    } catch {
      // ignore corrupted previous file
    }
  }
  const snapshots = {}

  // 1. Generate snapshots for every topology (reuse existing commits).
  for (const topo of TOPOLOGIES) {
    const label = `topo-${topo.key.replace(':', '-')}`
    const has = sh(`cd ${LAB} && git log --all --oneline --grep="^topo ${topo.key}:" | head -1`)
    if (has.out.trim()) {
      snapshots[topo.key] = has.out.trim().split(' ')[0]
      graph[topo.key] = graphMetrics(scaleOf(topo.key), topo, buildEdges(topo))
      console.log(`[snapshot] ${topo.key} exists: ${snapshots[topo.key]}`)
      continue
    }
    console.log(`[generate] ${topo.key} …`)
    const { graph: g } = generateTopo(topo)
    snapshots[topo.key] = git('rev-parse', 'HEAD')
    graph[topo.key] = g
  }

  if (MODE === 'gen') {
    console.log(`gen-only: validating topologies matching '${FILTER || 'all'}' …`)
    for (const topo of TOPOLOGIES) {
      if (FILTER && !topo.key.startsWith(FILTER)) continue
      if (stateValidation[topo.key]) continue
      git('checkout', '-q', '--', '.')
      git('reset', '-q', '--hard', snapshots[topo.key])
      stateValidation[topo.key] = validateState(topo, snapshots[topo.key])
      persist(results, stateValidation, graph, 0)
    }
    console.log(`[gen-only] validation results written to ${RESULTS_FILE}`)
    return
  }

  // 2. Validate all states (skip if already validated).
  if (!SKIP_VALIDATE) {
    for (const topo of TOPOLOGIES) {
      if (FILTER && !topo.key.startsWith(FILTER) && MODE === 'full') continue
      if (stateValidation[topo.key]) continue
      git('checkout', '-q', '--', '.')
      git('reset', '-q', '--hard', snapshots[topo.key])
      stateValidation[topo.key] = validateState(topo, snapshots[topo.key])
      persist(results, stateValidation, graph, 0)
    }
  }

  // 3. Scenario cells.
  const t0 = Date.now()
  for (const topo of TOPOLOGIES) {
    if (FILTER && !topo.key.startsWith(FILTER)) continue
    const scale = scaleOf(topo.key)
    const edges = buildEdges(topo)
    const ctx = topoContext(scale, topo, edges)
    for (const scenario of SCENARIOS) {
      for (const app of ['react', 'angular']) {
        runCell(topo, snapshots[topo.key], ctx, edges, app, scenario, snapshots, results)
      }
    }
    persist(results, stateValidation, graph, Date.now() - t0)
  }

  // 4. Final output with aggregates, correlations and control pairs.
  const correlations = computeCorrelations(results, graph)
  const controlPairs = computeControlPairs(results, graph)
  const out = {
    experiment: 'density-vs-size-phase20',
    capturedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    methodology: {
      densityFormula: 'density = edges / (N * (N - 1))  (directed, self-loops excluded)',
      topologies: TOPOLOGIES.map((t) => ({
        key: t.key,
        shape: t.shape,
        targetEdges: t.edges,
        depthCap: t.cap,
      })),
      scenarios: SCENARIOS,
    },
    graph,
    stateValidation,
    correlations,
    controlPairs,
    aggregates: aggregate(results),
    results,
  }
  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, JSON.stringify(out, null, 2) + '\n')
  const total = TOPOLOGIES.length * SCENARIOS.length * 2
  console.log(`\nCeldas completadas: ${Object.keys(results).length}/${total}`)
  console.log(`JSON escrito en ${RESULTS_FILE}`)

  // 5. Exit code: non-zero on cell errors, JSON problems, or invariant
  //    violations (CLEAN topologies must have 0 feature->feature imports;
  //    every topology must have scanned edges == designed edges).
  let failed = 0
  for (const cell of Object.values(results)) {
    if (cell.error) {
      failed++
      console.error(`[fail] ${cell.topology}:${cell.scenario}:${cell.app} -> ${cell.error}`)
    }
  }
  for (const topo of TOPOLOGIES) {
    const st = stateValidation[topo.key]
    if (!st) continue
    if (st.graph.violations > 0) {
      failed++
      console.error(`[fail] ${topo.key}: scanned edges differ from designed edges`)
    }
    if (topo.shape === 'none' && st.graph.scannedEdges > 0) {
      failed++
      console.error(
        `[fail] ${topo.key}: CLEAN topology has ${st.graph.scannedEdges} feature imports`,
      )
    }
    if (st.graph.domainImportsApps > 0) {
      failed++
      console.error(`[fail] ${topo.key}: domain imports app code`)
    }
  }
  if (failed > 0) {
    console.error(`exit 1: ${failed} failures`)
    process.exit(1)
  }
  console.log('JSON válido. Invariantes OK. Exit 0.')
}

function persist(results, stateValidation, graph, elapsedMs) {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const partial = {
    experiment: 'density-vs-size-phase20',
    capturedAt: new Date().toISOString(),
    elapsedMs,
    methodology: {
      densityFormula: 'density = edges / (N * (N - 1))  (directed, self-loops excluded)',
      topologies: TOPOLOGIES.map((t) => ({
        key: t.key,
        shape: t.shape,
        targetEdges: t.edges,
        depthCap: t.cap,
      })),
      scenarios: SCENARIOS,
    },
    graph,
    stateValidation,
    aggregates: aggregate(results),
    results,
  }
  writeFileSync(RESULTS_FILE, JSON.stringify(partial, null, 2) + '\n')
}

main()
