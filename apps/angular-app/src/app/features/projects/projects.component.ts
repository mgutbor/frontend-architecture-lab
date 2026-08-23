import { Component, computed, inject, input, signal } from '@angular/core'
import { type ProjectInput, type ProjectStatus } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'
import { filterProjects, type StatusFilter } from '../../services/filters'
import { EmptyStateComponent } from '../../components/empty-state.component'
import { FeedbackComponent } from '../../components/feedback.component'
import { ProjectDetailComponent } from './project-detail.component'
import { ProjectFormComponent } from './project-form.component'

type ProjectMode = 'list' | 'create' | 'edit'

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [EmptyStateComponent, FeedbackComponent, ProjectDetailComponent, ProjectFormComponent],
  templateUrl: './projects.component.html',
})
export class ProjectsComponent {
  private readonly store = inject(DomainStore)

  // SET-2: completed tasks are hidden from the project detail task list when
  // the preference is off. Pure UI state, owned by the App.
  readonly showCompletedTasks = input(true)

  // Derived state: lists come from the domain store, never duplicated here.
  readonly projects = computed(() => this.store.dataset()?.projects ?? [])
  readonly users = computed(() => this.store.dataset()?.users ?? [])
  readonly teams = computed(() => this.store.dataset()?.teams ?? [])

  // UI state: search, filters and selection live in this component.
  readonly search = signal('')
  readonly statusFilter = signal<StatusFilter>('all')
  readonly selectedId = signal<string | null>(null)
  readonly mode = signal<ProjectMode>('list')
  readonly feedback = signal<string | null>(null)

  readonly filtered = computed(() =>
    filterProjects(this.projects(), { search: this.search(), status: this.statusFilter() }),
  )

  readonly selected = computed(() => {
    const id = this.selectedId()
    if (id === null) {
      return null
    }
    return this.projects().find((project) => project.id === id) ?? null
  })

  readonly selectedTasks = computed(() => {
    const project = this.selected()
    const dataset = this.store.dataset()
    if (project === null || dataset === null) {
      return []
    }
    return dataset.tasks.filter(
      (task) =>
        task.projectId === project.id && (this.showCompletedTasks() || task.status !== 'completed'),
    )
  })

  readonly formInitial = computed(() =>
    this.mode() === 'edit' ? (this.selected() ?? undefined) : undefined,
  )

  userName(id: string): string {
    return this.users().find((user) => user.id === id)?.name ?? id
  }

  teamName(id: string): string {
    return this.teams().find((team) => team.id === id)?.name ?? id
  }

  selectProject(id: string): void {
    this.selectedId.set(id)
  }

  handleSubmit(input: ProjectInput): void {
    if (this.mode() === 'create') {
      const project = this.store.createProject(input)
      if (project !== null) {
        this.selectedId.set(project.id)
        this.mode.set('list')
        this.feedback.set(`Project "${project.name}" created.`)
      } else {
        this.feedback.set('Could not save the project. Review the form and try again.')
      }
    } else {
      const project = this.selected()
      if (project !== null && this.store.updateProject(project.id, input)) {
        this.mode.set('list')
        this.feedback.set('Project updated.')
      } else {
        this.feedback.set('Could not save the project. Review the form and try again.')
      }
    }
  }

  handleTransition(to: string): void {
    const project = this.selected()
    if (project !== null && this.store.transitionProject(project.id, to as ProjectStatus)) {
      this.feedback.set(`Status changed to ${to}.`)
    }
  }
}
