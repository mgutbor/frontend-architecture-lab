#!/usr/bin/env node
// Fase 19 — Architecture scalability: impact of feature graph size.
//
// Reproducible experiment over an isolated copy of the lab (/tmp/lab-phase19,
// own git history) that measures how maintenance cost, debugging and blast
// radius scale as the feature graph grows (5/10/20/30 wired features) under
// two topologies:
//
//   CLEAN   — 0 imports feature→feature, domain as single source of rules
//   COUPLED — controlled feature→feature chain (edges = floor(total/5)):
//             5→1, 10→2, 20→4, 30→6 (chain root = central, leaf = peripheral)
//
// Each scale is generated from deterministic templates (3 real features +
// generated catalog features with domain contracts, UI, read/write behavior
// and tests). Scenarios M1–M6 (maintenance) and D1–D2 (debugging) run over
// every scale × topology × framework cell. Metrics are structural and
// deterministic (git-derived), zero runtime dependencies beyond Node + git.
//
// Usage:
//   node scripts/measure-architecture-scalability-phase19.mjs [lab-path] [cell-filter]
//   node scripts/measure-architecture-scalability-phase19.mjs gen   (generate + validate scales only)

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus } from 'node:os'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESULTS_DIR = join(ROOT, 'docs/experiments/results')
const RESULTS_FILE = join(RESULTS_DIR, 'architecture-scalability-phase19.json')

const LAB = process.argv[2] || '/tmp/lab-phase19'
const CELL_FILTER = process.argv[3] || null // prefix, e.g. 'S1' or 'S2:COUPLED:M3:react'
const SKIP_VALIDATE = process.argv[4] === '--skip-validate'
const GEN_ONLY = process.argv[2] === 'gen'

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

// ---------------------------------------------------------------------------
// Feature naming (deterministic)
// ---------------------------------------------------------------------------

const REAL_FEATURES = ['dashboard', 'projects', 'tasks']

const SCALES = [
  { id: 'S1', synthetic: 2, edges: 1 },
  { id: 'S2', synthetic: 7, edges: 2 },
  { id: 'S3', synthetic: 17, edges: 4 },
  { id: 'S4', synthetic: 27, edges: 6 },
]
const TOPOS = ['CLEAN', 'COUPLED']

const kebab = (i) => `catalog-${String(i).padStart(2, '0')}`
const pascal = (i) => `Catalog${String(i).padStart(2, '0')}`
const itemsConst = (i) => `CATALOG_${String(i).padStart(2, '0')}_ITEMS`
const ruleFn = (i) => `countCatalog${String(i).padStart(2, '0')}Overdue`
const title = (i) => `Catalog ${String(i).padStart(2, '0')}`
const linkedFn = (i) => `catalog${String(i).padStart(2, '0')}LinkedTitle`

const synthNames = (scale) => Array.from({ length: scale.synthetic }, (_, k) => kebab(k + 1))
const featureNames = (scale) => [...REAL_FEATURES, ...synthNames(scale)]
const chainLength = (scale) => scale.edges + 1 // root=1 .. leaf=edges+1
const inChain = (scale, i) => i >= 1 && i <= chainLength(scale)

// chainTitle(i): the full provenance chain rendered by feature i's linkedTitle
// in the coupled topology ("Catalog 01 · Catalog 02 · …"); isolated features
// render only their own title.
function chainTitle(scale, i) {
  if (!inChain(scale, i)) return title(i)
  return Array.from({ length: i }, (_, k) => title(k + 1)).join(' · ')
}

const R_FEAT = (f) => join(LAB, 'apps/react-app/src/features', f)
const A_FEAT = (f) => join(LAB, 'apps/angular-app/src/app/features', f)

// ---------------------------------------------------------------------------
// Generated file templates (zero backticks in generated code on purpose)
// ---------------------------------------------------------------------------

function domainSharedTemplate() {
  return `// Shared catalog model (Fase 19 — generated scalability experiment).
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
  return `// ${title(i)} (Fase 19 — generated catalog feature).
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

function reactPageTemplate(i, coupled, scale) {
  const hasEdge = coupled && inChain(scale, i) && i > 1
  const depImport = hasEdge
    ? `import { ${linkedFn(i - 1)} as dep${pascal(i - 1)}LinkedTitle } from '../${kebab(i - 1)}/${kebab(i - 1)}-page'\n`
    : ''
  const linkedBody = hasEdge
    ? `  return dep${pascal(i - 1)}LinkedTitle() + ' · ' + '${title(i)}'`
    : `  return '${title(i)}'`
  const source = `      <p className="linked-label">Source: {${linkedFn(i)}()}</p>\n`
  return `import { useMemo, useState } from 'react'
import { ${itemsConst(i)}, completionRatio, ${ruleFn(i)} } from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { filterCatalog, type CatalogStatusFilter } from '../../services/filters'
import { CatalogToolbar } from '../../components/catalog-toolbar'
${depImport}export interface ${pascal(i)}PageProps {
  state: DomainState
}

// Fase 19 generated catalog feature: same architectural boundaries as the
// existing areas. Data and rules come from @operations-hub/domain (ADR-001);
// the page adds UI state (query/status/selection/note) and local helpers.
export function ${linkedFn(i)}(): string {
${linkedBody}
}

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

function reactTestTemplate(i, coupled, scale) {
  const expectedSource = coupled ? chainTitle(scale, i) : title(i)
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

describe('${pascal(i)}Page (Fase 19 — generated catalog feature)', () => {
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

function angularComponentTemplate(i, coupled, scale) {
  const hasEdge = coupled && inChain(scale, i) && i > 1
  const depImport = hasEdge
    ? `import { ${linkedFn(i - 1)} as dep${pascal(i - 1)}LinkedTitle } from '../${kebab(i - 1)}/${kebab(i - 1)}.component'\n`
    : ''
  const linkedBody = hasEdge
    ? `  return dep${pascal(i - 1)}LinkedTitle() + ' · ' + '${title(i)}'`
    : `  return '${title(i)}'`
  return `import { Component, computed, inject, signal } from '@angular/core'
import { ${itemsConst(i)}, completionRatio, ${ruleFn(i)} } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'
import { filterCatalog, type CatalogStatusFilter } from '../../services/filters'
import { CatalogToolbarComponent } from '../../components/catalog-toolbar.component'
${depImport}// Fase 19 generated catalog feature: same architectural boundaries as the
// existing areas. Data and rules come from @operations-hub/domain (ADR-001).
export function ${linkedFn(i)}(): string {
${linkedBody}
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

function angularSpecTemplate(i, coupled, scale) {
  const expectedSource = coupled ? chainTitle(scale, i) : title(i)
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

describe('${pascal(i)}Component (Fase 19 — generated catalog feature)', () => {
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

// Fase 19 generated shell: persistent state-based navigation (NAV-1).
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

// Fase 19 generated shell: persistent state-based navigation (NAV-1).
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

// ---------------------------------------------------------------------------
// Shared catalog infrastructure (services + toolbar), appended once per scale
// ---------------------------------------------------------------------------

const FILTER_CATALOG_BLOCK = `\n// Fase 19 catalog features: shared presentation filter for catalog items.\nexport type CatalogStatusFilter = CatalogStatus | 'all'\n\nexport function filterCatalog<T extends { status: CatalogStatus }>(\n  items: readonly T[],\n  query: string,\n  status: CatalogStatusFilter,\n): T[] {\n  const term = query.trim().toLowerCase()\n  return items.filter((item) => {\n    const matchesQuery =\n      term === '' ||\n      Object.values(item).some(\n        (value) => typeof value === 'string' && value.toLowerCase().includes(term),\n      )\n    const matchesStatus = status === 'all' || item.status === status\n    return matchesQuery && matchesStatus\n  })\n}\n`

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

// Shared catalog toolbar (Fase 19): every generated catalog feature shares the
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

// Shared catalog toolbar (Fase 19): every generated catalog feature shares the
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

function parseIndex(f) {
  return Number(f.replace('catalog-', ''))
}

function labelOf(f) {
  return REAL_FEATURES.includes(f) ? f.charAt(0).toUpperCase() + f.slice(1) : title(parseIndex(f))
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
// Scale generation
// ---------------------------------------------------------------------------

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
  // Remove any previous Fase 19 catalog exports (idempotent regeneration).
  content = content
    .split('\n')
    .filter(
      (line) =>
        !/Fase 19/.test(line) && !/catalogs\/catalog-/.test(line) && !/catalogs\/shared/.test(line),
    )
    .join('\n')
  const block = [
    '',
    '// Fase 19 generated catalogs',
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

function generateScale(scale, topo) {
  const coupled = topo === 'COUPLED'
  const label = `scale-${scale.id}-${topo}`

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
    writeFile(join(R_FEAT(f), `${f}-page.tsx`), reactPageTemplate(i, coupled, scale))
    writeFile(join(R_FEAT(f), `${f}-page.test.tsx`), reactTestTemplate(i, coupled, scale))
    writeFile(join(A_FEAT(f), `${f}.component.ts`), angularComponentTemplate(i, coupled, scale))
    writeFile(join(A_FEAT(f), `${f}.component.html`), angularHtmlTemplate(i))
    writeFile(join(A_FEAT(f), `${f}.component.spec.ts`), angularSpecTemplate(i, coupled, scale))
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
    `scale ${label}: ${featureNames(scale).length} features, ${scale.edges} edges`,
    '--allow-empty',
  )
  return label
}

// ---------------------------------------------------------------------------
// Graph scan
// ---------------------------------------------------------------------------

function scanGraph(scale, topo) {
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
  const fanIn = {}
  const fanOut = {}
  for (const f of feats) {
    fanIn[f] = 0
    fanOut[f] = 0
  }
  for (const e of unique) {
    fanOut[e.from]++
    fanIn[e.to]++
  }
  // Depth: longest path from any node (DAG chain). Compute via DFS memo.
  const depthOf = {}
  function depth(f) {
    if (depthOf[f] !== undefined) return depthOf[f]
    const deps = unique.filter((e) => e.from === f).map((e) => e.to)
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
  const isolated = feats.filter((f) => fanIn[f] === 0 && fanOut[f] === 0)
  // Transitive consumers of the chain root (catalog-01) when present.
  const root = synthNames(scale)[0]
  const transitive = new Set()
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()
    for (const e of unique) {
      if (e.to === node && e.from !== node) {
        if (!transitive.has(e.from)) {
          transitive.add(e.from)
          stack.push(e.from)
        }
      }
    }
  }
  // Duplicated rules: count definitions of completionRatio across the repo.
  const dupFiles = ['packages/domain/src/catalogs/shared.ts']
  let duplicatedRules = 0
  const allSrc = readdirSync(join(LAB, 'apps/react-app/src'), { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.tsx'))
    .map((f) => readFileSync(join(LAB, 'apps/react-app/src', f), 'utf8'))
  for (const c of allSrc) {
    if (/function completionRatio|const completionRatio/.test(c)) duplicatedRules++
  }
  return {
    nodes: feats.length,
    synthetic: scale.synthetic,
    edges: unique.length,
    edgeList: unique,
    fanIn,
    fanOut,
    maxDepth,
    avgDepth: Math.round((sumDepth / feats.length) * 100) / 100,
    density: Math.round((unique.length / feats.length) * 1000) / 1000,
    isolated: isolated.length,
    rootTransitiveConsumers: transitive.size,
    duplicatedRules,
  }
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

// Expected affected features per scenario (used to compute unrelatedFeatures).
function expectedAffected(scale, topo, scenario) {
  const chain = Array.from({ length: chainLength(scale) }, (_, k) => kebab(k + 1))
  const consumers = chain.slice(1) // features that transitively consume the root
  switch (scenario) {
    case 'M1':
    case 'D1':
      return new Set([chain[chain.length - 1]])
    case 'M2':
    case 'D2':
      return topo === 'COUPLED' ? new Set(chain) : new Set([chain[0]])
    case 'M3':
    case 'M5':
      return new Set(synthNames(scale)) // domain contract/rule consumed by all catalogs
    case 'M4':
      return topo === 'COUPLED' ? new Set([chain[0], chain[1]]) : new Set([chain[0]])
    case 'M6':
      return new Set([kebab(2)])
    default:
      return new Set()
  }
}

function scenarioTargets(scale, topo, scenario) {
  const chain = Array.from({ length: chainLength(scale) }, (_, k) => kebab(k + 1))
  switch (scenario) {
    case 'M1':
    case 'D1':
      return { feature: chain[chain.length - 1] }
    case 'M2':
    case 'D2':
      return { feature: chain[0] }
    case 'M3':
    case 'M5':
      return { feature: 'domain' }
    case 'M4':
      return { feature: chain[0] }
    case 'M6':
      return { feature: kebab(2) }
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// Scenario apply/fix (source patches in the lab copy)
// ---------------------------------------------------------------------------

const SCENARIOS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'D1', 'D2']

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

function applyScenario(scale, topo, app, scenario) {
  const t = scenarioTargets(scale, topo, scenario)
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
      // Central: change the root's linkedTitle output (semantic, type-valid).
      const from = `  return '${title(i)}'`
      const to = `  return '${title(i)} (v2)'`
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
      // Deletion: remove the chain root feature entirely (source + domain +
      // wiring). The app shell is regenerated from the same templates with the
      // root excluded, which keeps the wiring consistent (Section type,
      // nav, render/switch, App tests).
      rm(join(LAB, `apps/react-app/src/features/${f}`))
      rm(join(LAB, `apps/angular-app/src/app/features/${f}`))
      rm(join(LAB, `packages/domain/src/catalogs/${f}.ts`))
      // domain index: remove the root's exports
      const index = join(LAB, 'packages/domain/src/index.ts')
      let content = readFileSync(index, 'utf8')
      content = content
        .split('\n')
        .filter((line) => !line.includes(`catalogs/${f}'`) && !line.includes(`${pascal(i)}Item`))
        .join('\n')
      writeFile(index, content)
      // Regenerate the app shells without the root feature.
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
      // Internal refactor: rename statusLabel -> statusBadge in catalog-02
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
      // Peripheral semantic bug (type-valid): swap Active/Planned labels in the leaf.
      const from = `value === 'completed' ? 'Completed' : value === 'active' ? 'Active' : 'Planned'`
      const to = `value === 'completed' ? 'Completed' : value === 'active' ? 'Planned' : 'Active'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
    case 'D2': {
      // Central semantic bug (type-valid): wrong title in the root's linkedTitle.
      const from = `  return '${title(i)}'`
      const to = `  return 'Catalog 99'`
      if (app === 'react') patch(`apps/react-app/src/features/${f}/${f}-page.tsx`, from, to)
      else patch(`apps/angular-app/src/app/features/${f}/${f}.component.ts`, from, to)
      break
    }
  }
}

function fixScenario(scale, topo, app, scenario) {
  const t = scenarioTargets(scale, topo, scenario)
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
      const from = `  return '${title(i)} (v2)'`
      const to = `  return '${title(i)}'`
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
          const page = `apps/react-app/src/features/${n}/${n}-page.tsx`
          const p = join(LAB, page)
          const content = readFileSync(p, 'utf8')
          writeFile(
            p,
            content.replaceAll(call(itemsConst(parseIndex(n))), fixed(itemsConst(parseIndex(n)))),
          )
        }
      } else {
        for (const n of synthNames(scale)) {
          const comp = `apps/angular-app/src/app/features/${n}/${n}.component.ts`
          const p = join(LAB, comp)
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
          const test = `apps/react-app/src/features/${n}/${n}-page.test.tsx`
          const p = join(LAB, test)
          const content = readFileSync(p, 'utf8')
          writeFile(p, content.replaceAll(`17% complete`, `16% complete`))
        }
      } else {
        for (const n of synthNames(scale)) {
          const spec = `apps/angular-app/src/app/features/${n}/${n}.component.spec.ts`
          const p = join(LAB, spec)
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
      const from = `  return 'Catalog 99'`
      const to = `  return '${title(i)}'`
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

function testTargets(scale, topo, app, scenario) {
  const chain = Array.from({ length: chainLength(scale) }, (_, k) => kebab(k + 1))
  const leaf = chain[chain.length - 1]
  const root = chain[0]
  switch (scenario) {
    case 'M1':
    case 'D1':
      return [leaf]
    case 'M2':
    case 'D2':
      return topo === 'COUPLED' ? chain : [root]
    case 'M3':
      return [] // typecheck-driven
    case 'M4':
      return [] // typecheck-driven
    case 'M5':
      return synthNames(scale)
    case 'M6':
      return [kebab(2)]
    default:
      return []
  }
}

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
    // all synthetic catalogs share the catalog-* prefix
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
    {
      timeout: 300000,
    },
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

function featuresOfFiles(files) {
  const out = new Set()
  for (const f of files) {
    const m = f.match(/features\/([a-z0-9-]+)\//)
    if (m) out.add(m[1])
  }
  return out
}

function grepCount(pattern, dirs) {
  let count = 0
  for (const dir of dirs) {
    const res = sh(`grep -rl "${pattern}" ${dir} 2>/dev/null | wc -l`)
    count += Number(res.out.trim())
  }
  return count
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

function validateState(scale, topo) {
  const label = `scale-${scale.id}-${topo}`
  console.log(`[validate] ${label} …`)
  buildDomain()
  const reactTc = runTypecheck('react')
  const angularTc = runTypecheck('angular')
  const reactTests = sh(`cd ${LAB} && pnpm --filter react-app test 2>&1`, { timeout: 600000 })
  const angularTests = sh(`cd ${LAB} && pnpm --filter angular-app test 2>&1`, { timeout: 600000 })
  const state = {
    typecheck: {
      react: { ok: reactTc.ok, errors: reactTc.errors },
      angular: { ok: angularTc.ok, errors: angularTc.errors },
    },
    tests: {
      react: { ok: reactTests.ok, failing: failingTestFiles(reactTests.out, 'react') },
      angular: { ok: angularTests.ok, failing: failingTestFiles(angularTests.out, 'angular') },
    },
  }
  console.log(
    `[validate] ${label}: reactTc=${state.typecheck.react.ok} angTc=${state.typecheck.angular.ok} reactTests=${state.tests.react.ok} angTests=${state.tests.angular.ok}`,
  )
  if (
    !state.typecheck.react.ok ||
    !state.typecheck.angular.ok ||
    !state.tests.react.ok ||
    !state.tests.angular.ok
  ) {
    throw new Error(`scale state ${label} FAILED validation:\n${JSON.stringify(state, null, 1)}`)
  }
  return state
}

function runCell(scale, topo, app, scenario, snapshots, results, stateValidation) {
  const cellKey = `${scale.id}:${topo}:${scenario}:${app}`
  if (CELL_FILTER && !cellKey.startsWith(CELL_FILTER)) return
  if (results[cellKey]) {
    console.log(`  [skip] ${cellKey} (already measured)`)
    return
  }
  const label = `scale-${scale.id}-${topo}`
  const snapshotRef = snapshots[label]
  console.log(`[cell] ${cellKey} …`)

  git('checkout', '-q', '--', '.')
  git('reset', '-q', '--hard', snapshotRef)
  // Rebuild the domain package so app typecheck/tests resolve the scale's
  // domain source (apps consume @operations-hub/domain from dist).
  buildDomain()

  const expected = expectedAffected(scale, topo, scenario)
  const result = {
    scale: scale.id,
    topology: topo,
    app,
    scenario,
    targetFeature: scenarioTargets(scale, topo, scenario).feature,
    graph: scanGraph(scale, topo),
  }

  try {
    applyScenario(scale, topo, app, scenario)
    // Domain-touching scenarios must rebuild so app tooling sees the change.
    if (scenario === 'M3' || scenario === 'M4' || scenario === 'M5') buildDomain()

    // --- measure (before fix) ---
    const diff = diffMetrics(snapshotRef)
    const affectedFeatures = featuresOfFiles(diff.files)
    const unrelated = [...affectedFeatures].filter(
      (f) => !expected.has(f) && !REAL_FEATURES.includes(f),
    )
    // domain changes aren't a "feature" — treat them as expected for domain scenarios
    const domainOnly = diff.files.every((f) => f.startsWith('packages/domain'))
    result.filesChanged = diff.files
    result.locAdded = diff.locAdded
    result.locRemoved = diff.locRemoved
    result.featuresAffected = [...affectedFeatures]
    result.unrelatedFeaturesAffected = domainOnly ? [] : unrelated
    result.blastRadius =
      diff.files.length +
      [...affectedFeatures].length +
      (result.unrelatedFeaturesAffected.length ? 1 : 0)

    // filesInspected proxy:
    //  - maintenance scenarios (M1-M6): files the change touches (git-derived)
    //  - D1 (local presentational bug): the feature's own file (scale-independent)
    //  - D2 (shared-helper bug): files referencing the root's linkedTitle,
    //    i.e. the reachable consumers of the coupled chain (grep of the root
    //    function name; isolated features do not reference it)
    if (scenario === 'D1') {
      result.filesInspected = 1
    } else if (scenario === 'D2') {
      const rootFn = linkedFn(1)
      const dir =
        app === 'react'
          ? join(LAB, 'apps/react-app/src/features')
          : join(LAB, 'apps/angular-app/src/app/features')
      const res = sh(`grep -rl "${rootFn}" ${dir} 2>/dev/null | wc -l`)
      result.filesInspected = Number(res.out.trim())
    } else {
      result.filesInspected = diff.files.length
    }

    // causeToSymptomDistance: debugging only
    if (scenario === 'D1') result.causeToSymptomDistance = 1
    else if (scenario === 'D2') {
      result.causeToSymptomDistance = topo === 'COUPLED' ? chainLength(scale) : 1
    }

    // --- tests / typecheck ---
    if (scenario === 'M3' || scenario === 'M4') {
      const tc = runTypecheck(app)
      result.typecheckOk = tc.ok
      result.typecheckErrors = tc.errors
      result.testsFailing = []
      result.testsFailingCount = 0
    } else {
      const targets = testTargets(scale, topo, app, scenario)
      const run = app === 'react' ? runReactTests(targets) : runAngularTests(targets)
      const failing = failingTestFiles(run.out, app)
      result.typecheckOk = true
      result.typecheckErrors = 0
      result.testsFailing = failing
      result.testsFailingCount = failing.length
    }
    result.regressionTestsNeeded = result.testsFailingCount

    // --- fix / validate ---
    if (scenario !== 'M4') fixScenario(scale, topo, app, scenario)
    if (scenario === 'M3' || scenario === 'M5' || scenario === 'M4') buildDomain()
    const afterDiff = diffMetrics(snapshotRef)
    const afterFail = () => {
      if (scenario === 'M3' || scenario === 'M4') {
        return runTypecheck(app)
      }
      const targets = testTargets(scale, topo, app, scenario)
      const run = app === 'react' ? runReactTests(targets) : runAngularTests(targets)
      const failing = failingTestFiles(run.out, app)
      return { ok: failing.length === 0 && run.ok, failing }
    }
    const after = afterFail()
    result.suiteOkAfter = after.ok
    result.testsFailingAfter = after.failing || []
    result.filesChangedAfterFix = afterDiff.files
    result.locResidual = afterDiff.locAdded + afterDiff.locRemoved
    result.invariantsOk = result.unrelatedFeaturesAffected.length === 0

    // residual references for M4
    if (scenario === 'M4') {
      const root = kebab(1)
      const res = sh(
        `grep -rl "${root}" ${LAB}/apps/react-app/src/features ${LAB}/apps/angular-app/src/app/features ${LAB}/packages/domain/src 2>/dev/null | wc -l`,
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

  // restore clean state for the next cell
  git('checkout', '-q', '--', '.')
  git('reset', '-q', '--hard', snapshotRef)
}

function main() {
  ensureLab()
  // Load previously persisted results/graph/stateValidation (resumable runs).
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

  // 1. Generate + validate every scale/topology state.
  const existing = sh(`cd ${LAB} && git log --oneline | grep -c "scale-" || true`)
  if (Number(existing.out.trim()) < SCALES.length * TOPOS.length || GEN_ONLY) {
    for (const scale of SCALES) {
      for (const topo of TOPOS) {
        const label = `scale-${scale.id}-${topo}`
        // if the snapshot already exists, reuse it
        const has = sh(`cd ${LAB} && git log --all --oneline --grep="^scale ${label}:" | head -1`)
        if (has.out.trim()) {
          snapshots[label] = has.out.trim().split(' ')[0]
          console.log(`[snapshot] ${label} exists: ${snapshots[label]}`)
          continue
        }
        console.log(`[generate] ${label} …`)
        generateScale(scale, topo)
        snapshots[label] = git('rev-parse', 'HEAD')
      }
    }
  } else {
    for (const scale of SCALES) {
      for (const topo of TOPOS) {
        const label = `scale-${scale.id}-${topo}`
        const has = sh(`cd ${LAB} && git log --all --oneline --grep="^scale ${label}:" | head -1`)
        snapshots[label] = has.out.trim().split(' ')[0]
      }
    }
  }

  if (GEN_ONLY) {
    console.log(`gen-only: validating scale states matching '${CELL_FILTER || 'all'}' …`)
    for (const scale of SCALES) {
      for (const topo of TOPOS) {
        const key = `${scale.id}:${topo}`
        if (CELL_FILTER && !key.startsWith(CELL_FILTER)) continue
        if (stateValidation[key]) continue
        const label = `scale-${scale.id}-${topo}`
        git('checkout', '-q', '--', '.')
        git('reset', '-q', '--hard', snapshots[label])
        stateValidation[key] = validateState(scale, topo)
        graph[key] = scanGraph(scale, topo)
        mkdirSync(RESULTS_DIR, { recursive: true })
        writeFileSync(
          RESULTS_FILE,
          JSON.stringify(
            {
              experiment: 'architecture-scalability-phase19',
              capturedAt: new Date().toISOString(),
              scales: SCALES.map((s) => ({
                id: s.id,
                totalFeatures: 3 + s.synthetic,
                synthetic: s.synthetic,
                edges: s.edges,
                chain: Array.from({ length: s.edges + 1 }, (_, k) => kebab(k + 1)),
              })),
              stateValidation,
              graph,
            },
            null,
            2,
          ) + '\n',
        )
      }
    }
    console.log(`[gen-only] validation results written to ${RESULTS_FILE}`)
    return
  }

  // 2. Validate all states (skip if already validated in a previous run).
  for (const scale of SCALES) {
    for (const topo of TOPOS) {
      const key = `${scale.id}:${topo}`
      if (stateValidation[key] || SKIP_VALIDATE) continue
      git('checkout', '-q', '--', '.')
      git('reset', '-q', '--hard', snapshots[`scale-${scale.id}-${topo}`])
      stateValidation[key] = validateState(scale, topo)
      graph[key] = scanGraph(scale, topo)
      // persist incrementally so a killed run keeps its progress
      mkdirSync(RESULTS_DIR, { recursive: true })
      const partial = {
        experiment: 'architecture-scalability-phase19',
        capturedAt: new Date().toISOString(),
        graph,
        stateValidation,
        aggregates: aggregate(results),
        results,
      }
      writeFileSync(RESULTS_FILE, JSON.stringify(partial, null, 2) + '\n')
    }
  }
  // fill any graph entries skipped by SKIP_VALIDATE from the persisted file
  for (const scale of SCALES) {
    for (const topo of TOPOS) {
      const key = `${scale.id}:${topo}`
      if (!graph[key]) graph[key] = scanGraph(scale, topo)
    }
  }

  // 3. Scenario cells.
  const t0 = Date.now()
  for (const scale of SCALES) {
    for (const topo of TOPOS) {
      for (const scenario of SCENARIOS) {
        for (const app of ['react', 'angular']) {
          runCell(scale, topo, app, scenario, snapshots, results)
        }
      }
    }
  }
  // persist cells incrementally as well
  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(
    RESULTS_FILE,
    JSON.stringify(
      {
        experiment: 'architecture-scalability-phase19',
        capturedAt: new Date().toISOString(),
        elapsedMs: Date.now() - t0,
        scales: SCALES.map((s) => ({
          id: s.id,
          totalFeatures: 3 + s.synthetic,
          synthetic: s.synthetic,
          edges: s.edges,
          chain: Array.from({ length: s.edges + 1 }, (_, k) => kebab(k + 1)),
        })),
        graph,
        stateValidation,
        aggregates: aggregate(results),
        results,
      },
      null,
      2,
    ) + '\n',
  )

  // 4. Aggregates.
  const aggregates = aggregate(results)

  const out = {
    experiment: 'architecture-scalability-phase19',
    capturedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    scales: SCALES.map((s) => ({
      id: s.id,
      totalFeatures: 3 + s.synthetic,
      synthetic: s.synthetic,
      edges: s.edges,
      chain: Array.from({ length: s.edges + 1 }, (_, k) => kebab(k + 1)),
    })),
    graph,
    stateValidation,
    aggregates,
    results,
  }
  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, JSON.stringify(out, null, 2) + '\n')
  console.log(`\nCeldas completadas: ${Object.keys(results).length}/128`)
  console.log(`JSON escrito en ${RESULTS_FILE}`)

  // 5. Exit code: non-zero if any mandatory invariant failed.
  //    M4 in the coupled topology is expected to end with a broken import
  //    (residual reference measured); that is the measured result, not a
  //    script failure.
  let failed = 0
  for (const cell of Object.values(results)) {
    if (cell.error) {
      failed++
      console.error(
        `[fail] ${cell.scale}:${cell.topology}:${cell.scenario}:${cell.app} -> ${cell.error}`,
      )
    }
  }
  const json = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
  const invalid = !json || (!Array.isArray(Object.values(json.results)) && !json.results)
  if (failed > 0 || invalid) {
    console.error(`exit 1: ${failed} cells failed`)
    process.exit(1)
  }
  console.log('JSON válido. Exit 0.')
}

function aggregate(results) {
  const byScenario = {}
  for (const [key, cell] of Object.entries(results)) {
    if (cell.error) continue
    const s = `${cell.scale}:${cell.topology}:${cell.scenario}`
    if (!byScenario[s]) byScenario[s] = { react: null, angular: null }
    byScenario[s][cell.app] = cell
  }
  const out = {}
  for (const [key, pair] of Object.entries(byScenario)) {
    const [scale, topo, scenario] = key.split(':')
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
        unrelatedFeatures: c.unrelatedFeaturesAffected?.length ?? 0,
        locAdded: c.locAdded ?? 0,
        locRemoved: c.locRemoved ?? 0,
        suiteOkAfter: c.suiteOkAfter ?? false,
      }
    }
    out[key] = {
      scale,
      topology: topo,
      scenario,
      react: summarize('react'),
      angular: summarize('angular'),
    }
  }
  return out
}

main()
