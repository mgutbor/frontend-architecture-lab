import { TestBed } from '@angular/core/testing'
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
  it('makes all 6 functional areas reachable from persistent navigation', () => {
    const fixture = setup()
    const labels = navButtons(fixture).map((button) => button.textContent?.trim())
    expect(labels).toEqual(['Dashboard', 'Projects', 'Teams', 'Tasks', 'Reports', 'Settings'])
  })

  it('indicates the active area with aria-current (NAV-2)', () => {
    const fixture = setup()
    const dashboard = navButtons(fixture)[0]!
    expect(dashboard.getAttribute('aria-current')).toBe('page')

    const projects = navButtons(fixture)[1]!
    click(projects)
    fixture.detectChanges()
    expect(dashboard.getAttribute('aria-current')).toBeNull()
    expect(projects.getAttribute('aria-current')).toBe('page')
  })

  it('switches views when a section is selected', () => {
    const fixture = setup()
    const tasks = navButtons(fixture)[3]!
    click(tasks)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Search tasks')
  })

  it('renders all controls as keyboard-operable buttons (NAV-3)', () => {
    const fixture = setup()
    for (const button of navButtons(fixture)) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
    }
  })

  it('uses semantic landmarks: header, nav and main (ACC-5)', () => {
    const fixture = setup()
    expect(fixture.nativeElement.querySelector('header nav')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('main')).not.toBeNull()
    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement
    expect(nav.getAttribute('aria-label')).toBe('Main')
  })
})

describe('Settings persistence (SET-3)', () => {
  it('persists the completed-tasks preference across views within the session', () => {
    const fixture = setup()

    // Go to Settings and switch the preference off.
    const settings = navButtons(fixture)[5]!
    click(settings)
    fixture.detectChanges()
    const checkbox = fixture.nativeElement.querySelector(
      '#show-completed-tasks',
    ) as HTMLInputElement
    click(checkbox)
    fixture.detectChanges()

    // Navigate to Tasks: completed tasks are hidden (SET-2, SET-3).
    const tasks = navButtons(fixture)[3]!
    click(tasks)
    fixture.detectChanges()
    const taskText = fixture.nativeElement.textContent as string
    expect(taskText).toContain('Search tasks')
    expect(taskText).not.toContain('Define incident severity levels') // completed task

    // Navigate to Projects: completed tasks hidden in the project detail too.
    const projects = navButtons(fixture)[1]!
    click(projects)
    fixture.detectChanges()
    const projectButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.project-list button'),
    ) as HTMLElement[]
    const incident = projectButtons.find((button) =>
      button.textContent?.includes('Incident Response Portal'),
    )
    click(incident!)
    fixture.detectChanges()
    const projectText = fixture.nativeElement.textContent as string
    expect(projectText).not.toContain('Define incident severity levels') // completed task hidden
    expect(projectText).toContain('Implement status timeline') // in-progress remains
  })
})
