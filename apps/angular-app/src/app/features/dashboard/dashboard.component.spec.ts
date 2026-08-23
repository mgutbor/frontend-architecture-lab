import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { DomainStore } from '../../domain/domain.store'
import { DashboardComponent } from './dashboard.component'

describe('DashboardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DashboardComponent] })
    TestBed.inject(DomainStore).load()
  })

  it('renders the global report with deterministic values (DSH-1)', () => {
    const fixture = TestBed.createComponent(DashboardComponent)
    fixture.detectChanges()

    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Total tasks')
    expect(text).toContain('42.9%')
    expect(text).toContain('12') // completed
  })

  it('shows projects by status coherent with Reports (DSH-2)', () => {
    const fixture = TestBed.createComponent(DashboardComponent)
    fixture.detectChanges()

    // Angular collapses template whitespace, so textContent is compact.
    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, '')
    expect(text).toContain('planned1')
    expect(text).toContain('active3')
    expect(text).toContain('completed2')
  })
})
