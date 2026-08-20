import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { loadFixture } from '@operations-hub/domain'
import type { DomainStore } from '../../services/domain-store'
import { createDomainStore } from '../../services/domain-store'
import { useDomainStore } from '../../hooks/use-domain-store'
import { ProjectsPage } from './projects-page'

// Harness that wires the store through the real hook, like App does.
function ProjectsHarness({ store }: { store: DomainStore }) {
  const state = useDomainStore(store)
  return <ProjectsPage state={state} showCompletedTasks={true} />
}

function renderProjects() {
  const store = createDomainStore(loadFixture())
  render(<ProjectsHarness store={store} />)
  return store
}

const PROJECT_NAMES = [
  'Incident Response Portal',
  'Alerting Pipeline',
  'Reporting Dashboard',
  'Data Ingest Service',
  'Customer Onboarding',
  'Legacy Migration',
]

describe('ProjectsPage — list (PRJ-LIST)', () => {
  it('lists the 6 projects with status, owner and team (PRJ-LIST-1/2/3)', () => {
    renderProjects()
    for (const name of PROJECT_NAMES) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument()
    }
    expect(screen.getByText('6 of 6 projects')).toBeInTheDocument()
    // Asc by id: project-001 first.
    const firstRow = screen.getAllByRole('button', { name: /·/ })[0]
    expect(firstRow).toHaveTextContent('Incident Response Portal')
    expect(firstRow).toHaveTextContent('Ada Lovelace')
    expect(firstRow).toHaveTextContent('Core Platform')
  })
})

describe('ProjectsPage — search (PRJ-SEARCH)', () => {
  it('filters live by case-insensitive substring (PRJ-SEARCH-2/3)', async () => {
    const user = userEvent.setup()
    renderProjects()
    const search = screen.getByLabelText('Search projects')

    await user.type(search, 'INCIDENT')
    expect(screen.getByText('1 of 6 projects')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Incident Response Portal/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Alerting Pipeline/ })).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'report')
    expect(screen.getByText('1 of 6 projects')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reporting Dashboard/ })).toBeInTheDocument()
  })

  it('shows an explicit empty state for a search without results (PRJ-SEARCH-4)', async () => {
    const user = userEvent.setup()
    renderProjects()
    await user.type(screen.getByLabelText('Search projects'), 'zzzz')
    expect(screen.getByText('0 of 6 projects')).toBeInTheDocument()
    expect(
      screen.getByText('No projects match the current search and filters.'),
    ).toBeInTheDocument()
  })
})

describe('ProjectsPage — filter (PRJ-FILTER)', () => {
  it('active shows project-001, project-003 and project-006 (PRJ-FILTER-2)', async () => {
    const user = userEvent.setup()
    renderProjects()
    await user.selectOptions(screen.getByLabelText('Status'), 'active')
    expect(screen.getByText('3 of 6 projects')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Incident Response Portal/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reporting Dashboard/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Legacy Migration/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Alerting Pipeline/ })).not.toBeInTheDocument()
  })

  it('completed shows project-002 and project-005 (PRJ-FILTER-3)', async () => {
    const user = userEvent.setup()
    renderProjects()
    await user.selectOptions(screen.getByLabelText('Status'), 'completed')
    expect(screen.getByText('2 of 6 projects')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Alerting Pipeline/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Customer Onboarding/ })).toBeInTheDocument()
  })

  it('planned shows project-004 (PRJ-FILTER-4)', async () => {
    const user = userEvent.setup()
    renderProjects()
    await user.selectOptions(screen.getByLabelText('Status'), 'planned')
    expect(screen.getByText('1 of 6 projects')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Data Ingest Service/ })).toBeInTheDocument()
  })

  it('combines search and filter with AND (PRJ-FILTER-5)', async () => {
    const user = userEvent.setup()
    renderProjects()
    await user.type(screen.getByLabelText('Search projects'), 'portal')
    await user.selectOptions(screen.getByLabelText('Status'), 'active')
    expect(screen.getByText('1 of 6 projects')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Status'), 'completed')
    expect(screen.getByText('0 of 6 projects')).toBeInTheDocument()
  })
})

describe('ProjectsPage — detail (PRJ-VIEW)', () => {
  it('shows description, owner, team and tasks with status and priority (PRJ-VIEW-1/2)', async () => {
    const user = userEvent.setup()
    renderProjects()
    await user.click(screen.getByRole('button', { name: /Incident Response Portal/ }))
    expect(screen.getByText('active', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Core Platform', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Define incident severity levels')).toBeInTheDocument()
    expect(screen.getAllByText('high').length).toBeGreaterThan(0)
  })

  it('project-006 shows an explicit empty state in its task list (PRJ-VIEW-3)', async () => {
    const user = userEvent.setup()
    renderProjects()
    await user.click(screen.getByRole('button', { name: /Legacy Migration/ }))
    expect(screen.getByText('This project has no tasks yet.')).toBeInTheDocument()
  })

  it('offers only valid transitions and applies them (PRJ-EDIT-3)', async () => {
    const user = userEvent.setup()
    const store = renderProjects()

    await user.click(screen.getByRole('button', { name: /Incident Response Portal/ }))
    const transitions = screen.getAllByRole('button', { name: /→/ })
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toHaveTextContent('active → completed')

    await user.click(transitions[0]!)
    expect(screen.getByText('completed', { selector: 'strong' })).toBeInTheDocument()
    const remaining = screen.getAllByRole('button', { name: /→/ })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toHaveTextContent('completed → active')

    expect(store.getSnapshot().projects.find((p) => p.id === 'project-001')?.status).toBe(
      'completed',
    )
  })
})

describe('ProjectsPage — create (PRJ-CREATE)', () => {
  it('creates project-007 with the next id and shows it in the list', async () => {
    const user = userEvent.setup()
    const store = renderProjects()

    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.type(screen.getByLabelText('Name'), 'Operations Console')
    await user.selectOptions(screen.getByLabelText('Team'), 'team-001')

    // Owner options are limited to the selected team (PRJ-CREATE-1).
    const owner = screen.getByLabelText('Owner')
    const ownerOptions = within(owner)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(ownerOptions).toEqual(['Select an owner', 'Ada Lovelace', 'Alan Turing', 'Grace Hopper'])

    await user.selectOptions(owner, 'user-001')
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    expect(screen.getByText('7 of 7 projects')).toBeInTheDocument()
    expect(screen.getByText(/Project "Operations Console" created\./)).toBeInTheDocument()
    const created = store.getSnapshot().projects.find((p) => p.id === 'project-007')
    expect(created?.name).toBe('Operations Console')
    expect(created?.status).toBe('planned')
  })

  it('shows inline validation errors and blocks creation without a name (PRJ-CREATE-2/4)', async () => {
    const user = userEvent.setup()
    const store = renderProjects()

    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent)
    expect(alerts.join(' · ')).toContain('name is required')
    expect(store.getSnapshot().projects).toHaveLength(6)
  })
})

describe('ProjectsPage — edit (PRJ-EDIT)', () => {
  it('edits name and status offering only valid transitions', async () => {
    const user = userEvent.setup()
    const store = renderProjects()

    await user.click(screen.getByRole('button', { name: /Data Ingest Service/ }))
    await user.click(screen.getByRole('button', { name: 'Edit project' }))

    // planned -> only active is offered as a new status (PRJ-EDIT-3).
    const status = screen.getByLabelText('Status')
    const statusOptions = within(status)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(statusOptions).toEqual(['planned', 'active'])

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Data Ingest Service v2')
    await user.selectOptions(status, 'active')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText(/Project updated\./)).toBeInTheDocument()
    const project = store.getSnapshot().projects.find((p) => p.id === 'project-004')
    expect(project?.name).toBe('Data Ingest Service v2')
    expect(project?.status).toBe('active')
  })
})
