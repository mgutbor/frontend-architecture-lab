import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { DomainStore } from '../../domain/domain.store'
import { DashboardComponent } from './dashboard.component'

describe('DashboardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DashboardComponent] })
    TestBed.inject(DomainStore).load()
  })

  it('renders the global report and lists derived from the domain', () => {
    const fixture = TestBed.createComponent(DashboardComponent)
    fixture.detectChanges()

    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('Total tasks')
    expect(text).toContain('42.9%')
    expect(text).toContain('Incident Response Portal')
    expect(text).toContain('Core Platform')
    expect(text).toContain('Legacy Migration')
  })
})
