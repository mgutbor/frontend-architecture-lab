import { Component, inject, signal } from '@angular/core'
import { DomainStore } from './domain/domain.store'
import { DashboardComponent } from './features/dashboard/dashboard.component'
import { ProjectsComponent } from './features/projects/projects.component'
import { TeamsComponent } from './features/teams/teams.component'
import { TasksComponent } from './features/tasks/tasks.component'
import { ReportsComponent } from './features/reports/reports.component'
import { SettingsComponent } from './features/settings/settings.component'

// Persistent state-based navigation (NAV-1): every functional area is
// reachable from the header in all views. No URL routing is used in this
// phase (Phase 4 decision): the contract requires persistent navigation,
// not deep links.
export type Section = 'dashboard' | 'projects' | 'teams' | 'tasks' | 'reports' | 'settings'

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Projects' },
  { id: 'teams', label: 'Teams' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
]

@Component({
  selector: 'app-root',
  imports: [
    DashboardComponent,
    ProjectsComponent,
    TeamsComponent,
    TasksComponent,
    ReportsComponent,
    SettingsComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly store = inject(DomainStore)

  protected readonly sections = SECTIONS

  // UI state: which section is visible. Domain state lives in DomainStore.
  protected readonly section = signal<Section>('dashboard')

  // Settings UI state (SET-1..4): session-only, defaults to on, resets on reload.
  protected readonly showCompletedTasks = signal(true)

  constructor() {
    this.store.load()
  }

  protected selectSection(section: Section): void {
    this.section.set(section)
  }

  protected setShowCompletedTasks(value: boolean): void {
    this.showCompletedTasks.set(value)
  }
}
