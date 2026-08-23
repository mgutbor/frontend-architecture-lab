import { Component, computed, inject, input, signal } from '@angular/core'
import { TASK_TRANSITIONS, type TaskInput, type TaskStatus } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'
import { filterTasks, type PriorityFilter, type TaskStatusFilter } from '../../services/filters'
import { EmptyStateComponent } from '../../components/empty-state.component'
import { FeedbackComponent } from '../../components/feedback.component'
import { PriorityBadgeComponent } from '../../components/priority-badge.component'
import { StatusBadgeComponent } from '../../components/status-badge.component'
import { TransitionButtonsComponent } from '../../components/transition-buttons.component'
import { TaskFormComponent } from './task-form.component'

type TaskMode = 'list' | 'create' | 'edit'

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [
    EmptyStateComponent,
    FeedbackComponent,
    PriorityBadgeComponent,
    StatusBadgeComponent,
    TransitionButtonsComponent,
    TaskFormComponent,
  ],
  templateUrl: './tasks.component.html',
})
export class TasksComponent {
  private readonly store = inject(DomainStore)

  // SET-2: completed tasks are hidden from the task list when the preference
  // is off. Pure UI state, owned by the App.
  readonly showCompletedTasks = input(true)

  // Derived state: lists come from the domain store, never duplicated here.
  readonly tasks = computed(() => this.store.dataset()?.tasks ?? [])
  readonly users = computed(() => this.store.dataset()?.users ?? [])
  readonly projects = computed(() => this.store.dataset()?.projects ?? [])

  // UI state: search, filters and selection live in this component.
  readonly search = signal('')
  readonly statusFilter = signal<TaskStatusFilter>('all')
  readonly priorityFilter = signal<PriorityFilter>('all')
  readonly mode = signal<TaskMode>('list')
  readonly editingTaskId = signal<string | null>(null)
  readonly feedback = signal<string | null>(null)

  readonly filtered = computed(() => {
    const matches = filterTasks(this.tasks(), {
      search: this.search(),
      status: this.statusFilter(),
      priority: this.priorityFilter(),
    })
    // SET-2: the preference hides completed tasks immediately.
    return this.showCompletedTasks()
      ? matches
      : matches.filter((task) => task.status !== 'completed')
  })

  readonly editingTask = computed(() => {
    const id = this.editingTaskId()
    if (id === null) {
      return null
    }
    return this.tasks().find((task) => task.id === id) ?? null
  })

  readonly formInitial = computed(() =>
    this.mode() === 'edit' ? (this.editingTask() ?? undefined) : undefined,
  )

  projectName(id: string): string {
    return this.projects().find((project) => project.id === id)?.name ?? id
  }

  userName(id: string): string {
    return this.users().find((user) => user.id === id)?.name ?? id
  }

  taskTargets(status: TaskStatus): TaskStatus[] {
    return TASK_TRANSITIONS[status] ?? []
  }

  startEdit(taskId: string): void {
    this.editingTaskId.set(taskId)
    this.mode.set('edit')
  }

  handleSubmit(input: TaskInput): void {
    if (this.mode() === 'create') {
      const task = this.store.createTask(input)
      if (task !== null) {
        this.mode.set('list')
        this.feedback.set(`Task "${task.title}" created.`)
      } else {
        this.feedback.set('Could not save the task. Review the form and try again.')
      }
    } else {
      const task = this.editingTask()
      if (task !== null && this.store.updateTask(task.id, input)) {
        this.mode.set('list')
        this.editingTaskId.set(null)
        this.feedback.set('Task updated.')
      } else {
        this.feedback.set('Could not save the task. Review the form and try again.')
      }
    }
  }

  handleTransition(taskId: string, to: string): void {
    if (this.store.transitionTask(taskId, to as TaskStatus)) {
      this.feedback.set(`Task moved to ${to}.`)
    }
  }

  handleAssign(taskId: string, assigneeId: string): void {
    if (this.store.assignTask(taskId, assigneeId === '' ? null : assigneeId)) {
      this.feedback.set('Assignee updated.')
    }
  }
}
