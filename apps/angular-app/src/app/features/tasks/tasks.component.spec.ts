import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { DomainStore } from '../../domain/domain.store'
import { TasksComponent } from './tasks.component'

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function input(element: HTMLElement, value: string): void {
  ;(element as HTMLInputElement).value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function change(element: HTMLElement, value: string): void {
  ;(element as HTMLSelectElement).value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setup(showCompletedTasks = true): {
  fixture: import('@angular/core/testing').ComponentFixture<TasksComponent>
  store: DomainStore
} {
  TestBed.configureTestingModule({ imports: [TasksComponent] })
  const store = TestBed.inject(DomainStore)
  store.load()
  const fixture = TestBed.createComponent(TasksComponent)
  fixture.componentRef.setInput('showCompletedTasks', showCompletedTasks)
  fixture.detectChanges()
  return { fixture, store }
}

function taskRows(
  fixture: import('@angular/core/testing').ComponentFixture<TasksComponent>,
): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.task-list > li')) as HTMLElement[]
}

// jsdom does not implement requestSubmit(), so form submission is triggered
// by dispatching the native submit event on the form (what ngSubmit listens to).
function submitForm(
  fixture: import('@angular/core/testing').ComponentFixture<TasksComponent>,
): void {
  const form = fixture.nativeElement.querySelector('form') as HTMLElement
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  fixture.detectChanges()
}

describe('TasksComponent', () => {
  it('lists the 30 tasks with title, project, status, priority and assignee (TSK-LIST-1)', () => {
    const { fixture } = setup()
    expect(taskRows(fixture)).toHaveLength(30)
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Define incident severity levels')
    expect(text).toContain('Incident Response Portal')
    expect(text).toContain('Sin asignar')
    expect(text).toContain('Ada Lovelace')
  })

  it('searches by title (TSK-LIST-2)', () => {
    const { fixture } = setup()
    const search = fixture.nativeElement.querySelector('#task-search') as HTMLElement
    input(search, 'alert')
    fixture.detectChanges()
    // Set up alert routing, Configure alert thresholds, Build alert deduplication,
    // Export alert history, Migrate alert storage.
    expect(taskRows(fixture)).toHaveLength(5)
  })

  it('combines status and priority filters (TSK-LIST-2)', () => {
    const { fixture } = setup()
    const status = fixture.nativeElement.querySelector('#task-status-filter') as HTMLElement
    const priority = fixture.nativeElement.querySelector('#task-priority-filter') as HTMLElement
    change(status, 'completed')
    change(priority, 'high')
    fixture.detectChanges()
    const rows = taskRows(fixture)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.textContent).toContain('completed')
      expect(row.textContent).toContain('high')
    }
    expect(rows.length).toBe(6) // 6 completed + high tasks in the fixture
  })

  it('shows an explicit empty state when no tasks match (TSK-LIST-3)', () => {
    const { fixture } = setup()
    const search = fixture.nativeElement.querySelector('#task-search') as HTMLElement
    input(search, 'zzzz')
    fixture.detectChanges()
    expect(taskRows(fixture)).toHaveLength(0)
    expect(fixture.nativeElement.textContent).toContain(
      'No tasks match the current search and filters.',
    )
  })

  it('hides completed tasks when the preference is off (SET-2)', () => {
    const { fixture } = setup(false)
    const rows = taskRows(fixture)
    // 30 tasks, 12 completed: the completed ones are hidden immediately.
    expect(rows).toHaveLength(18)
    for (const row of rows) {
      expect(row.querySelector('.status-completed')).toBeNull()
    }
  })

  it('creates a task with defaults (TSK-CREATE)', () => {
    const { fixture, store } = setup()
    const create = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.trim() === 'New task') as HTMLElement
    click(create)
    fixture.detectChanges()

    input(fixture.nativeElement.querySelector('#task-title') as HTMLElement, 'Brand new task')
    change(fixture.nativeElement.querySelector('#task-project') as HTMLElement, 'project-001')
    fixture.detectChanges()

    submitForm(fixture)

    const task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-031')
    expect(task?.title).toBe('Brand new task')
    expect(task?.status).toBe('todo')
    expect(task?.priority).toBe('medium')
    expect(task?.assigneeId).toBeNull()
  })

  it('shows inline validation errors on create (TSK-CREATE-2)', () => {
    const { fixture, store } = setup()
    const create = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.trim() === 'New task') as HTMLElement
    click(create)
    fixture.detectChanges()

    submitForm(fixture)

    expect(fixture.nativeElement.textContent).toContain('title is required')
    expect(fixture.nativeElement.textContent).toContain('projectId is required')
    expect(store.dataset()?.tasks).toHaveLength(30)
  })

  it('offers only valid transitions and applies them (TSK-STATUS)', () => {
    const { fixture } = setup()
    const rows = taskRows(fixture)
    const first = rows[0]!
    const buttons = Array.from(first.querySelectorAll('.transitions button')) as HTMLElement[]
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['completed → in-progress'])
    click(buttons[0]!)
    fixture.detectChanges()
    expect(first.textContent).toContain('in-progress')
  })

  it('does not offer invalid transitions (TSK-STATUS-2)', () => {
    const { fixture } = setup()
    const rows = taskRows(fixture)
    const todo = rows.find((row) => row.textContent?.includes('Create escalation rules'))
    const buttons = Array.from(todo!.querySelectorAll('.transitions button')) as HTMLElement[]
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'todo → in-progress',
      'todo → cancelled',
    ])
  })

  it('assigns and unassigns a task (TSK-ASSIGN)', () => {
    const { fixture, store } = setup()
    const rows = taskRows(fixture)
    const unassigned = rows.find((row) => row.textContent?.includes('Sin asignar'))
    const select = unassigned!.querySelector('.assign-select') as HTMLElement
    change(select, 'user-002')
    fixture.detectChanges()
    const task = store
      .dataset()
      ?.tasks.find((candidate) => candidate.title === 'Write incident documentation')
    expect(task?.assigneeId).toBe('user-002')

    change(select, '')
    fixture.detectChanges()
    const after = store
      .dataset()
      ?.tasks.find((candidate) => candidate.title === 'Write incident documentation')
    expect(after?.assigneeId).toBeNull()
  })

  it('edits a task in any status (TSK-EDIT)', () => {
    const { fixture, store } = setup()
    const rows = taskRows(fixture)
    const completed = rows.find((row) =>
      row.textContent?.includes('Define incident severity levels'),
    )
    const edit = completed!.querySelector('.edit-task') as HTMLElement
    click(edit)
    fixture.detectChanges()

    input(
      fixture.nativeElement.querySelector('#task-title') as HTMLElement,
      'Renamed completed task',
    )
    fixture.detectChanges()
    submitForm(fixture)

    const task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-001')
    expect(task?.title).toBe('Renamed completed task')
    expect(task?.status).toBe('completed')
  })
})
