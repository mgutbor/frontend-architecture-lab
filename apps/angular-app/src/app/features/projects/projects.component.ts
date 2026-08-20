import { Component, computed, inject, signal } from '@angular/core'
import { PROJECT_TRANSITIONS, type ProjectStatus } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'

@Component({
  selector: 'app-projects',
  standalone: true,
  templateUrl: './projects.component.html',
})
export class ProjectsComponent {
  private readonly store = inject(DomainStore)

  readonly projects = computed(() => this.store.dataset()?.projects ?? [])

  // UI state: which project is selected. Domain state lives in DomainStore.
  readonly selectedId = signal<string | null>(null)

  readonly selected = computed(() => {
    const id = this.selectedId()
    if (id === null) {
      return null
    }
    return this.projects().find((project) => project.id === id) ?? null
  })

  // The valid targets come from the domain state machine, never from the UI.
  readonly availableTransitions = computed<ProjectStatus[]>(() => {
    const project = this.selected()
    return project === null ? [] : (PROJECT_TRANSITIONS[project.status] ?? [])
  })

  readonly selectedTasks = computed(() => {
    const project = this.selected()
    const dataset = this.store.dataset()
    if (project === null || dataset === null) {
      return []
    }
    return dataset.tasks.filter((task) => task.projectId === project.id)
  })

  selectProject(id: string): void {
    this.selectedId.set(id)
  }

  transition(to: ProjectStatus): void {
    const project = this.selected()
    if (project !== null) {
      this.store.transitionProject(project.id, to)
    }
  }

  userName(id: string): string {
    return this.store.dataset()?.users.find((user) => user.id === id)?.name ?? id
  }

  teamName(id: string): string {
    return this.store.dataset()?.teams.find((team) => team.id === id)?.name ?? id
  }
}
