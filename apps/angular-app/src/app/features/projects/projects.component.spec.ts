import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { DomainStore } from '../../domain/domain.store'
import { ProjectsComponent } from './projects.component'

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

function setup(): {
  fixture: import('@angular/core/testing').ComponentFixture<ProjectsComponent>
  store: DomainStore
} {
  TestBed.configureTestingModule({ imports: [ProjectsComponent] })
  const store = TestBed.inject(DomainStore)
  store.load()
  const fixture = TestBed.createComponent(ProjectsComponent)
  fixture.detectChanges()
  return { fixture, store }
}

// jsdom does not implement requestSubmit(), so form submission is triggered
// by dispatching the native submit event on the form (what ngSubmit listens to).
function submitForm(
  fixture: import('@angular/core/testing').ComponentFixture<ProjectsComponent>,
): void {
  const form = fixture.nativeElement.querySelector('form') as HTMLElement
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  fixture.detectChanges()
}

function projectButtons(
  fixture: import('@angular/core/testing').ComponentFixture<ProjectsComponent>,
): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.project-list button')) as HTMLElement[]
}

describe('ProjectsComponent', () => {
  it('lists the 6 projects with name, status, owner and team (PRJ-LIST)', () => {
    const { fixture } = setup()
    const buttons = projectButtons(fixture)
    expect(buttons).toHaveLength(6)
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Incident Response Portal')
    expect(text).toContain('Ada Lovelace')
    expect(text).toContain('Core Platform')
  })

  it('searches by name, case-insensitive, live (PRJ-SEARCH)', () => {
    const { fixture } = setup()
    const search = fixture.nativeElement.querySelector('#project-search') as HTMLElement
    input(search, 'incident')
    fixture.detectChanges()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Incident Response Portal')
    expect(text).not.toContain('Alerting Pipeline')

    input(search, 'REPORT')
    fixture.detectChanges()
    const text2 = fixture.nativeElement.textContent as string
    expect(text2).toContain('Reporting Dashboard')
    expect(text2).not.toContain('Incident Response Portal')
  })

  it('shows an explicit empty state when nothing matches (PRJ-LIST-4)', () => {
    const { fixture } = setup()
    const search = fixture.nativeElement.querySelector('#project-search') as HTMLElement
    input(search, 'zzzz')
    fixture.detectChanges()
    expect(projectButtons(fixture)).toHaveLength(0)
    expect(fixture.nativeElement.textContent).toContain(
      'No projects match the current search and filters.',
    )
  })

  it('filters by status (PRJ-FILTER)', () => {
    const { fixture } = setup()
    const filter = fixture.nativeElement.querySelector('#project-status-filter') as HTMLElement
    change(filter, 'active')
    fixture.detectChanges()
    const buttons = projectButtons(fixture)
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Incident Response Portal'),
      expect.stringContaining('Reporting Dashboard'),
      expect.stringContaining('Legacy Migration'),
    ])
    expect(buttons).toHaveLength(3)
  })

  it('combines search and filter with AND (PRJ-SEARCH-5 / PRJ-FILTER-5)', () => {
    const { fixture } = setup()
    const search = fixture.nativeElement.querySelector('#project-search') as HTMLElement
    const filter = fixture.nativeElement.querySelector('#project-status-filter') as HTMLElement
    input(search, 'incident')
    change(filter, 'active')
    fixture.detectChanges()
    expect(projectButtons(fixture)).toHaveLength(1)
    input(search, 'incident')
    change(filter, 'completed')
    fixture.detectChanges()
    expect(projectButtons(fixture)).toHaveLength(0)
  })

  it('shows project detail with tasks and only valid transitions (PRJ-VIEW)', () => {
    const { fixture } = setup()
    const incident = projectButtons(fixture).find((button) =>
      button.textContent?.includes('Incident Response Portal'),
    )
    click(incident!)
    fixture.detectChanges()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Define incident severity levels')
    const transitionButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.transitions button'),
    ) as HTMLElement[]
    expect(transitionButtons.map((button) => button.textContent?.trim())).toEqual([
      'active → completed',
    ])
    click(transitionButtons[0]!)
    fixture.detectChanges()
    const after = fixture.nativeElement.textContent as string
    expect(after).toContain('completed')
    const remaining = Array.from(
      fixture.nativeElement.querySelectorAll('.transitions button'),
    ) as HTMLElement[]
    expect(remaining.map((button) => button.textContent?.trim())).toEqual(['completed → active'])
  })

  it('shows an explicit empty state for project-006 (PRJ-VIEW-3)', () => {
    const { fixture } = setup()
    const legacy = projectButtons(fixture).find((button) =>
      button.textContent?.includes('Legacy Migration'),
    )
    click(legacy!)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('This project has no tasks yet.')
  })

  it('creates a project with id project-007 (PRJ-CREATE)', () => {
    const { fixture, store } = setup()
    const create = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.trim() === 'New project') as HTMLElement
    click(create)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('New project')

    input(fixture.nativeElement.querySelector('#project-name') as HTMLElement, 'Brand New Project')
    change(fixture.nativeElement.querySelector('#project-team') as HTMLElement, 'team-001')
    // The owner options are filtered by the selected team; re-render first.
    fixture.detectChanges()
    change(fixture.nativeElement.querySelector('#project-owner') as HTMLElement, 'user-001')
    fixture.detectChanges()

    submitForm(fixture)

    const project = store.dataset()?.projects.find((candidate) => candidate.id === 'project-007')
    expect(project?.name).toBe('Brand New Project')
    expect(project?.status).toBe('planned')
    expect(fixture.nativeElement.textContent).toContain('Brand New Project')
  })

  it('shows inline validation errors on create (PRJ-CREATE-2)', () => {
    const { fixture, store } = setup()
    const create = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.trim() === 'New project') as HTMLElement
    click(create)
    fixture.detectChanges()

    submitForm(fixture)

    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('name is required')
    expect(text).toContain('teamId is required')
    expect(text).toContain('ownerId is required')
    expect(store.dataset()?.projects).toHaveLength(6)
    // ACC-4: the error is associated with the field.
    const name = fixture.nativeElement.querySelector('#project-name') as HTMLElement
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(name.getAttribute('aria-describedby')).toBe('project-name-error')
  })

  it('edits a project name and status with only valid transitions (PRJ-EDIT)', () => {
    const { fixture, store } = setup()
    const planned = projectButtons(fixture).find((button) =>
      button.textContent?.includes('Data Ingest Service'),
    )
    click(planned!)
    fixture.detectChanges()

    const edit = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.trim() === 'Edit project') as HTMLElement
    click(edit)
    fixture.detectChanges()

    // Only planned + valid targets are offered.
    const statusOptions = Array.from(
      fixture.nativeElement.querySelectorAll('#project-status option') as NodeListOf<HTMLElement>,
    ).map((option) => (option as HTMLElement).textContent?.trim())
    expect(statusOptions).toEqual(['planned', 'active'])

    input(fixture.nativeElement.querySelector('#project-name') as HTMLElement, 'Renamed Project')
    change(fixture.nativeElement.querySelector('#project-status') as HTMLElement, 'active')
    fixture.detectChanges()

    submitForm(fixture)

    const project = store.dataset()?.projects.find((candidate) => candidate.id === 'project-004')
    expect(project?.name).toBe('Renamed Project')
    expect(project?.status).toBe('active')
  })
})
