import { Component, inject, signal } from '@angular/core'
import { DomainStore } from './domain/domain.store'
import { DashboardComponent } from './features/dashboard/dashboard.component'
import { ProjectsComponent } from './features/projects/projects.component'

type Section = 'dashboard' | 'projects'

@Component({
  selector: 'app-root',
  imports: [DashboardComponent, ProjectsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly store = inject(DomainStore)

  // UI state: which section is visible. Domain state lives in DomainStore.
  protected readonly section = signal<Section>('dashboard')

  constructor() {
    this.store.load()
  }

  protected selectSection(section: Section): void {
    this.section.set(section)
  }
}
