import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { DomainStore } from '../../domain/domain.store'
import { ProjectsComponent } from './projects.component'

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('ProjectsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ProjectsComponent] })
    TestBed.inject(DomainStore).load()
  })

  it('offers only valid transitions for the selected project and applies them', () => {
    const fixture = TestBed.createComponent(ProjectsComponent)
    fixture.detectChanges()

    const projectButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.project-list button'),
    ) as HTMLElement[]
    const incident = projectButtons.find((button) =>
      button.textContent?.includes('Incident Response Portal'),
    )
    expect(incident).toBeDefined()
    click(incident!)
    fixture.detectChanges()

    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Status: active')

    const transitionButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.transitions button'),
    ) as HTMLElement[]
    expect(transitionButtons.map((button) => button.textContent?.trim())).toEqual([
      'active → completed',
    ])

    click(transitionButtons[0]!)
    fixture.detectChanges()

    const after = fixture.nativeElement.textContent as string
    expect(after).toContain('Status: completed')
    const remaining = Array.from(
      fixture.nativeElement.querySelectorAll('.transitions button'),
    ) as HTMLElement[]
    expect(remaining.map((button) => button.textContent?.trim())).toEqual(['completed → active'])
  })
})
