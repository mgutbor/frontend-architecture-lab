import { Component, OnInit, computed, input, output, signal } from '@angular/core'
import {
  PROJECT_TRANSITIONS,
  validateProjectInput,
  type FieldErrors,
  type Project,
  type ProjectInput,
  type ProjectStatus,
  type Team,
  type User,
} from '@operations-hub/domain'
import { FieldComponent } from '../../components/field.component'

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [FieldComponent],
  templateUrl: './project-form.component.html',
})
export class ProjectFormComponent implements OnInit {
  /** Present in edit mode (PRJ-EDIT), absent in create mode (PRJ-CREATE). */
  readonly initial = input<Project | undefined>(undefined)
  readonly users = input.required<User[]>()
  readonly teams = input.required<Team[]>()
  readonly submit = output<ProjectInput>()
  readonly cancel = output<void>()

  readonly isEdit = computed(() => this.initial() !== undefined)

  readonly name = signal('')
  readonly description = signal('')
  readonly teamId = signal('')
  readonly ownerId = signal('')
  readonly status = signal<ProjectStatus>('planned')
  readonly errors = signal<FieldErrors>({})

  // Owner choices are limited to the users of the selected team (PRJ-CREATE-1).
  readonly ownerOptions = computed(() =>
    this.users().filter((user) => user.teamId === this.teamId()),
  )

  // Edit mode offers the current status plus only its valid targets (PRJ-EDIT-3).
  readonly statusOptions = computed<ProjectStatus[]>(() => {
    const initial = this.initial()
    if (initial === undefined) {
      return []
    }
    return [initial.status, ...(PROJECT_TRANSITIONS[initial.status] ?? [])]
  })

  ngOnInit(): void {
    const initial = this.initial()
    this.name.set(initial?.name ?? '')
    this.description.set(initial?.description ?? '')
    this.teamId.set(initial?.teamId ?? '')
    this.ownerId.set(initial?.ownerId ?? '')
    this.status.set(initial?.status ?? 'planned')
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

  handleTeamChange(nextTeamId: string): void {
    this.teamId.set(nextTeamId)
    // BR-5: the owner must belong to the project team; reset an owner that
    // does not belong to the newly selected team.
    const ownerInTeam = this.users().some(
      (user) => user.id === this.ownerId() && user.teamId === nextTeamId,
    )
    if (!ownerInTeam) {
      this.ownerId.set('')
    }
  }

  handleSubmit(event: Event): void {
    event.preventDefault()
    const input: ProjectInput = {
      name: this.name(),
      description: this.description() || null,
      ownerId: this.ownerId(),
      teamId: this.teamId(),
      ...(this.isEdit() ? { status: this.status() } : {}),
    }
    const initial = this.initial()
    const validationErrors = validateProjectInput(
      input,
      { users: this.users(), teams: this.teams() },
      this.isEdit() && initial !== undefined ? initial.status : undefined,
    )
    if (Object.keys(validationErrors).length > 0) {
      this.errors.set(validationErrors)
      return
    }
    this.errors.set({})
    this.submit.emit(input)
  }
}
