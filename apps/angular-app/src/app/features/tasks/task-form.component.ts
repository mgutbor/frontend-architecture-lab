import { Component, OnInit, computed, input, output, signal } from '@angular/core'
import {
  TASK_PRIORITIES,
  validateTaskInput,
  type FieldErrors,
  type Project,
  type Task,
  type TaskInput,
  type TaskPriority,
  type User,
} from '@operations-hub/domain'
import { FieldComponent } from '../../components/field.component'

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [FieldComponent],
  templateUrl: './task-form.component.html',
})
export class TaskFormComponent implements OnInit {
  /** Present in edit mode (TSK-EDIT), absent in create mode (TSK-CREATE). */
  readonly initial = input<Task | undefined>(undefined)
  readonly users = input.required<User[]>()
  readonly projects = input.required<Project[]>()
  readonly submit = output<TaskInput>()
  readonly cancel = output<void>()

  readonly isEdit = computed(() => this.initial() !== undefined)

  readonly title = signal('')
  readonly description = signal('')
  readonly projectId = signal('')
  readonly priority = signal<TaskPriority>('medium')
  readonly assigneeId = signal('')
  readonly errors = signal<FieldErrors>({})

  readonly priorities = TASK_PRIORITIES

  ngOnInit(): void {
    const initial = this.initial()
    this.title.set(initial?.title ?? '')
    this.description.set(initial?.description ?? '')
    this.projectId.set(initial?.projectId ?? '')
    // TSK-CREATE-1: priority defaults to medium for new tasks.
    this.priority.set(initial?.priority ?? 'medium')
    this.assigneeId.set(initial?.assigneeId ?? '')
  }

  fieldErrors(field: string): string[] | undefined {
    return this.errors()[field]
  }

  hasError(field: string): boolean {
    return (this.errors()[field]?.length ?? 0) > 0
  }

  clearError(field: string): void {
    this.errors.update((current) => {
      if (current[field] === undefined) {
        return current
      }
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  handleSubmit(event: Event): void {
    event.preventDefault()
    const input: TaskInput = {
      title: this.title(),
      description: this.description() || null,
      priority: this.priority(),
      assigneeId: this.assigneeId() === '' ? null : this.assigneeId(),
      projectId: this.projectId(),
    }
    const initial = this.initial()
    const validationErrors = validateTaskInput(
      input,
      { users: this.users(), projects: this.projects() },
      initial?.status,
    )
    if (Object.keys(validationErrors).length > 0) {
      this.errors.set(validationErrors)
      return
    }
    this.errors.set({})
    this.submit.emit(input)
  }
}
