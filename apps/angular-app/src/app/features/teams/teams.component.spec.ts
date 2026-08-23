import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { DomainStore } from '../../domain/domain.store'
import { TeamsComponent } from './teams.component'

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function change(element: HTMLElement, value: string): void {
  ;(element as HTMLSelectElement).value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setup(): {
  fixture: import('@angular/core/testing').ComponentFixture<TeamsComponent>
  store: DomainStore
} {
  TestBed.configureTestingModule({ imports: [TeamsComponent] })
  const store = TestBed.inject(DomainStore)
  store.load()
  const fixture = TestBed.createComponent(TeamsComponent)
  fixture.detectChanges()
  return { fixture, store }
}

describe('TeamsComponent', () => {
  it('lists the 3 teams with derived member and project counts (TEA-LIST)', () => {
    const { fixture } = setup()
    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('.team-list button') as NodeListOf<HTMLElement>,
    ) as HTMLElement[]
    expect(rows).toHaveLength(3)
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Core Platform')
    expect(text).toContain('3 members · 2 projects')
    expect(text).toContain('2 members · 2 projects') // team-003
  })

  it('shows team detail with members and projects (TEA-VIEW-1)', () => {
    const { fixture } = setup()
    const core = Array.from(
      fixture.nativeElement.querySelectorAll('.team-list button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.includes('Core Platform')) as HTMLElement
    click(core)
    fixture.detectChanges()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Ada Lovelace')
    expect(text).toContain('Alan Turing')
    expect(text).toContain('Grace Hopper')
    expect(text).toContain('Incident Response Portal')
    expect(text).toContain('Alerting Pipeline')
  })

  it('adds a member to a team as an explicit reassignment (TEA-ASSIGN, BR-3)', () => {
    const { fixture, store } = setup()
    const core = Array.from(
      fixture.nativeElement.querySelectorAll('.team-list button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.includes('Core Platform')) as HTMLElement
    click(core)
    fixture.detectChanges()

    const add = fixture.nativeElement.querySelector('#add-member') as HTMLElement
    // user-004 currently belongs to team-002; adding to team-001 reassigns.
    change(add, 'user-004')
    fixture.detectChanges()

    const user = store.dataset()?.users.find((candidate) => candidate.id === 'user-004')
    expect(user?.teamId).toBe('team-001')
    const coreMembers = store
      .dataset()
      ?.users.filter((candidate) => candidate.teamId === 'team-001').length
    expect(coreMembers).toBe(4)
    const team002Members = store
      .dataset()
      ?.users.filter((candidate) => candidate.teamId === 'team-002').length
    expect(team002Members).toBe(2)
    // Counter shown in the list updates after the reassignment (TEA-ASSIGN-4).
    expect(fixture.nativeElement.textContent).toContain('4 members · 2 projects')
  })

  it('moves a member to another team (TEA-ASSIGN-3)', () => {
    const { fixture, store } = setup()
    const core = Array.from(
      fixture.nativeElement.querySelectorAll('.team-list button') as NodeListOf<HTMLElement>,
    ).find((button) => button.textContent?.includes('Core Platform')) as HTMLElement
    click(core)
    fixture.detectChanges()

    const move = fixture.nativeElement.querySelector('#move-user-001') as HTMLElement
    change(move, 'team-003')
    fixture.detectChanges()

    const user = store.dataset()?.users.find((candidate) => candidate.id === 'user-001')
    expect(user?.teamId).toBe('team-003')
    const team003Members = store
      .dataset()
      ?.users.filter((candidate) => candidate.teamId === 'team-003').length
    expect(team003Members).toBe(3)
  })
})
