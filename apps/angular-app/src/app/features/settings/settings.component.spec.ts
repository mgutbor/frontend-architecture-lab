import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { SettingsComponent } from './settings.component'

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function setup(): import('@angular/core/testing').ComponentFixture<SettingsComponent> {
  TestBed.configureTestingModule({ imports: [SettingsComponent] })
  const fixture = TestBed.createComponent(SettingsComponent)
  fixture.detectChanges()
  return fixture
}

describe('SettingsComponent', () => {
  it('defaults to showing completed tasks (SET-1)', () => {
    const fixture = setup()
    const checkbox = fixture.nativeElement.querySelector(
      '#show-completed-tasks',
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    const component = fixture.componentInstance
    expect(component.showCompletedTasks()).toBe(true)
  })

  it('toggles the preference (SET-2)', () => {
    const fixture = setup()
    const checkbox = fixture.nativeElement.querySelector(
      '#show-completed-tasks',
    ) as HTMLInputElement
    click(checkbox)
    fixture.detectChanges()
    expect(fixture.componentInstance.showCompletedTasks()).toBe(false)
    expect(checkbox.checked).toBe(false)
  })

  it('resets to the default when the component is rebuilt (SET-4)', () => {
    TestBed.configureTestingModule({ imports: [SettingsComponent] })
    const fixture = TestBed.createComponent(SettingsComponent)
    fixture.detectChanges()
    const checkbox = fixture.nativeElement.querySelector(
      '#show-completed-tasks',
    ) as HTMLInputElement
    click(checkbox)
    fixture.detectChanges()
    expect(fixture.componentInstance.showCompletedTasks()).toBe(false)

    // Rebuild the component (simulates a fresh application session) without
    // reconfiguring the already-instantiated test module.
    fixture.destroy()
    const fresh = TestBed.createComponent(SettingsComponent)
    fresh.detectChanges()
    expect(fresh.componentInstance.showCompletedTasks()).toBe(true)
  })
})
