import { Component, computed, input, output } from '@angular/core'
import {
  PROJECT_TRANSITIONS,
  type Project,
  type ProjectStatus,
  type Task,
  type Team,
  type User,
} from '@operations-hub/domain'
import { EmptyStateComponent } from '../../components/empty-state.component'
import { PriorityBadgeComponent } from '../../components/priority-badge.component'
import { StatusBadgeComponent } from '../../components/status-badge.component'
import { TransitionButtonsComponent } from '../../components/transition-buttons.component'

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [
    EmptyStateComponent,
    PriorityBadgeComponent,
    StatusBadgeComponent,
    TransitionButtonsComponent,
  ],
  templateUrl: './project-detail.component.html',
})
export class ProjectDetailComponent {
  readonly project = input.required<Project>()
  readonly tasks = input.required<Task[]>()
  readonly users = input.required<User[]>()
  readonly teams = input.required<Team[]>()
  readonly transition = output<ProjectStatus>()
  readonly edit = output<void>()

  readonly owner = computed(() => this.users().find((user) => user.id === this.project().ownerId))
  readonly team = computed(() =>
    this.teams().find((candidate) => candidate.id === this.project().teamId),
  )
  readonly targets = computed<ProjectStatus[]>(
    () => PROJECT_TRANSITIONS[this.project().status] ?? [],
  )

  onTransition(target: string): void {
    this.transition.emit(target as ProjectStatus)
  }
}
