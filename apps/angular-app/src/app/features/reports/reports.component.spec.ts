import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { DomainStore } from '../../domain/domain.store'
import { ReportsComponent } from './reports.component'

function change(element: HTMLElement, value: string): void {
  ;(element as HTMLSelectElement).value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setup(): {
  fixture: import('@angular/core/testing').ComponentFixture<ReportsComponent>
  store: DomainStore
} {
  TestBed.configureTestingModule({ imports: [ReportsComponent] })
  const store = TestBed.inject(DomainStore)
  store.load()
  const fixture = TestBed.createComponent(ReportsComponent)
  fixture.detectChanges()
  return { fixture, store }
}

describe('ReportsComponent', () => {
  it('shows the global summary with deterministic values (RPT-SUMMARY)', () => {
    const { fixture } = setup()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('30') // total tasks
    expect(text).toContain('12') // completed
    expect(text).toContain('7') // in-progress
    expect(text).toContain('9') // todo
    expect(text).toContain('2') // cancelled
    expect(text).toContain('42.9%') // completion rate
    expect(text).toContain('6') // projects
    expect(text).toContain('3') // teams
  })

  it('shows project metrics per project (RPT-PROJECT-1)', () => {
    const { fixture } = setup()
    const select = fixture.nativeElement.querySelector('#report-project') as HTMLElement
    change(select, 'project-002')
    fixture.detectChanges()
    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Metrics for project-002')
    expect(text).toContain('100%')

    change(select, 'project-006')
    fixture.detectChanges()
    const text2 = fixture.nativeElement.textContent as string
    expect(text2).toContain('Metrics for project-006')
    expect(text2).toContain('n/a')
  })

  it('shows the global task distribution by status and priority (RPT-TASK)', () => {
    const { fixture } = setup()
    const text = fixture.nativeElement.textContent as string
    // Distribution by status.
    expect(text).toContain('Distribution by status')
    expect(text).toContain('Distribution by priority')
    // Priority high = 10 in the global scope (RPT-TASK-2).
    const highRow = Array.from(
      fixture.nativeElement.querySelectorAll('tr') as NodeListOf<HTMLElement>,
    ).find((row) => row.textContent?.includes('High'))
    expect(highRow?.textContent).toContain('10')
  })
})
