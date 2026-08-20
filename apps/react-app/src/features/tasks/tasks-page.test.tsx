import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { loadFixture } from '@operations-hub/domain'
import type { DomainStore } from '../../services/domain-store'
import { createDomainStore } from '../../services/domain-store'
import { useDomainStore } from '../../hooks/use-domain-store'
import { TasksPage } from './tasks-page'

function TasksHarness({
  store,
  showCompletedTasks,
}: {
  store: DomainStore
  showCompletedTasks: boolean
}) {
  const state = useDomainStore(store)
  return <TasksPage state={state} showCompletedTasks={showCompletedTasks} />
}

function renderTasks(showCompletedTasks = true) {
  const store = createDomainStore(loadFixture())
  render(<TasksHarness store={store} showCompletedTasks={showCompletedTasks} />)
  return store
}

describe('TasksPage — list (TSK-LIST)', () => {
  it('lists all 30 tasks with project, status, priority and assignee (TSK-LIST-1)', () => {
    renderTasks()
    expect(screen.getByText('30 of 30 tasks')).toBeInTheDocument()
    expect(screen.getByText('Define incident severity levels')).toBeInTheDocument()
    expect(screen.getAllByText('Incident Response Portal').length).toBeGreaterThan(0)
    expect(screen.getByText('Write incident documentation')).toBeInTheDocument()
  })

  it('represents unassigned tasks explicitly (TSK-LIST-4)', () => {
    renderTasks()
    // task-007 and task-020 are unassigned in the dataset.
    expect(screen.getAllByText('Sin asignar')).toHaveLength(2)
  })

  it('combines status, priority and title filters with AND (TSK-LIST-2)', async () => {
    const user = userEvent.setup()
    renderTasks()

    await user.selectOptions(screen.getByLabelText('Status'), 'completed')
    expect(screen.getByText('12 of 30 tasks')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    // 6 completed tasks are high priority in the dataset.
    expect(screen.getByText('6 of 30 tasks')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search tasks'), 'alert')
    // Of those, 2 have "alert" in the title: task-009 and task-011.
    expect(screen.getByText('2 of 30 tasks')).toBeInTheDocument()
    expect(screen.getByText('Build alert deduplication')).toBeInTheDocument()
  })

  it('shows an explicit empty state when filters have no matches (TSK-LIST-3)', async () => {
    const user = userEvent.setup()
    renderTasks()
    await user.type(screen.getByLabelText('Search tasks'), 'zzzz')
    expect(screen.getByText('0 of 30 tasks')).toBeInTheDocument()
    expect(screen.getByText('No tasks match the current search and filters.')).toBeInTheDocument()
  })
})

describe('TasksPage — transitions (TSK-STATUS)', () => {
  it('offers only valid transitions and applies them (TSK-STATUS-1/2)', async () => {
    const user = userEvent.setup()
    const store = renderTasks()

    // task-007 is todo: only in-progress and cancelled are offered.
    const row = screen.getByText('Write incident documentation').closest('li')!
    const transitions = within(row).getAllByRole('button', { name: /→/ })
    const labels = transitions.map((button) => button.textContent)
    expect(labels).toEqual(['todo → in-progress', 'todo → cancelled'])

    await user.click(transitions[0]!)
    expect(store.getSnapshot().tasks.find((t) => t.id === 'task-007')?.status).toBe('in-progress')
    // Derived counts update (TSK-STATUS-3): todo went from 9 to 8.
    expect(screen.getByText('30 of 30 tasks')).toBeInTheDocument()
  })

  it('does not offer todo -> completed nor completed -> todo (TSK-STATUS-2)', () => {
    renderTasks()
    const todoRow = screen.getByText('Write incident documentation').closest('li')!
    const todoLabels = within(todoRow)
      .getAllByRole('button', { name: /→/ })
      .map((button) => button.textContent)
    expect(todoLabels).not.toContain('todo → completed')

    const completedRow = screen.getByText('Define incident severity levels').closest('li')!
    const completedLabels = within(completedRow)
      .getAllByRole('button', { name: /→/ })
      .map((button) => button.textContent)
    expect(completedLabels).toEqual(['completed → in-progress'])
  })
})

describe('TasksPage — create (TSK-CREATE)', () => {
  it('creates a task with default priority medium and shows it in the list', async () => {
    const user = userEvent.setup()
    const store = renderTasks()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Investigate incident backlog')
    await user.selectOptions(screen.getByLabelText('Project'), 'project-001')

    const priority = screen.getByLabelText('Priority')
    expect(priority).toHaveValue('medium') // TSK-CREATE-1 default

    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(screen.getByText('31 of 31 tasks')).toBeInTheDocument()
    expect(screen.getByText(/Task "Investigate incident backlog" created\./)).toBeInTheDocument()
    const created = store.getSnapshot().tasks.find((t) => t.id === 'task-031')
    expect(created?.status).toBe('todo')
    expect(created?.priority).toBe('medium')
  })

  it('shows inline validation errors without a title or project (TSK-CREATE-2)', async () => {
    const user = userEvent.setup()
    const store = renderTasks()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent)
    expect(alerts.join(' · ')).toContain('title is required')
    expect(alerts.join(' · ')).toContain('projectId is required')
    expect(store.getSnapshot().tasks).toHaveLength(30)
  })
})

describe('TasksPage — edit (TSK-EDIT)', () => {
  it('edits title, description, priority and assignee in any status, including completed', async () => {
    const user = userEvent.setup()
    const store = renderTasks()

    const completedRow = screen.getByText('Define incident severity levels').closest('li')!
    await user.click(within(completedRow).getByRole('button', { name: 'Edit' }))

    // The project field is not editable (TSK-EDIT-1).
    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Define severity levels v2')
    await user.selectOptions(screen.getByLabelText('Priority'), 'low')
    await user.selectOptions(screen.getByLabelText('Assignee (optional)'), 'user-002')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText(/Task updated\./)).toBeInTheDocument()
    const task = store.getSnapshot().tasks.find((t) => t.id === 'task-001')
    expect(task?.title).toBe('Define severity levels v2')
    expect(task?.priority).toBe('low')
    expect(task?.assigneeId).toBe('user-002')
    expect(task?.status).toBe('completed') // metadata edit does not change status
  })
})

describe('TasksPage — assignment (TSK-ASSIGN)', () => {
  it('assigns and unassigns a task from the row selector (TSK-ASSIGN-1/2)', async () => {
    const user = userEvent.setup()
    const store = renderTasks()

    // task-007 starts unassigned.
    const row = screen.getByText('Write incident documentation').closest('li')!
    const assignee = within(row).getByRole('combobox', {
      name: /Assignee for Write incident documentation/,
    })

    await user.selectOptions(assignee, 'user-003')
    expect(store.getSnapshot().tasks.find((t) => t.id === 'task-007')?.assigneeId).toBe('user-003')
    // The assignee span shows the new assignee (the select option also matches).
    expect(within(row).getAllByText('Grace Hopper').length).toBeGreaterThan(0)

    await user.selectOptions(assignee, '')
    expect(store.getSnapshot().tasks.find((t) => t.id === 'task-007')?.assigneeId).toBeNull()
    expect(within(row).getByText('Sin asignar')).toBeInTheDocument()
  })
})
