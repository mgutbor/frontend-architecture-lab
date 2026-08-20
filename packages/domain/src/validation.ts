// Pure validators for domain inputs (create/edit forms).
// Source of truth: docs/architecture/domain-model.md section 6.
// No external validation library: small explicit functions.

import type { Project, ProjectStatus, TaskPriority, TaskStatus, Team, User } from './types'
import { canTransitionProject, canTransitionTask } from './transitions'

export type FieldErrors = Record<string, string[]>

export const MAX_NAME_LENGTH = 100
export const MAX_TITLE_LENGTH = 120
export const MAX_DESCRIPTION_LENGTH = 500

export const PROJECT_STATUSES: readonly ProjectStatus[] = ['planned', 'active', 'completed']
export const TASK_STATUSES: readonly TaskStatus[] = [
  'todo',
  'in-progress',
  'completed',
  'cancelled',
]
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

export function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value)
}

function addError(errors: FieldErrors, field: string, message: string): void {
  const current = errors[field] ?? []
  errors[field] = [...current, message]
}

function checkRequired(value: string | null | undefined, field: string, errors: FieldErrors): void {
  if (value === undefined || value === null || value.trim().length === 0) {
    addError(errors, field, `${field} is required`)
  }
}

function checkMaxLength(
  value: string | null | undefined,
  field: string,
  maxLength: number,
  errors: FieldErrors,
): void {
  if (value !== undefined && value !== null && value.length > maxLength) {
    addError(errors, field, `${field} must be at most ${maxLength} characters`)
  }
}

function checkOptionalEnum<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  field: string,
  errors: FieldErrors,
): void {
  if (value !== undefined && !isOneOf(value, allowed)) {
    addError(errors, field, `${field} must be one of: ${allowed.join(', ')}`)
  }
}

export interface UserInput {
  name: string
  email: string
  teamId: string
}

export interface UserValidationContext {
  users: User[]
  teams: Team[]
}

export function validateUserInput(
  input: UserInput,
  context: UserValidationContext,
  currentUserId?: string,
): FieldErrors {
  const errors: FieldErrors = {}

  checkRequired(input.name, 'name', errors)
  checkMaxLength(input.name, 'name', MAX_NAME_LENGTH, errors)

  checkRequired(input.email, 'email', errors)
  checkMaxLength(input.email, 'email', MAX_NAME_LENGTH, errors)
  if (input.email.trim().length > 0 && !isValidEmail(input.email)) {
    addError(errors, 'email', 'email must have a valid format')
  }
  if (
    input.email.trim().length > 0 &&
    isValidEmail(input.email) &&
    context.users.some((user) => user.email === input.email && user.id !== currentUserId)
  ) {
    addError(errors, 'email', 'email must be unique')
  }

  checkRequired(input.teamId, 'teamId', errors)
  if (input.teamId && !context.teams.some((team) => team.id === input.teamId)) {
    addError(errors, 'teamId', 'teamId must reference an existing team')
  }

  return errors
}

export interface TeamInput {
  name: string
  description?: string | null
}

export function validateTeamInput(input: TeamInput): FieldErrors {
  const errors: FieldErrors = {}

  checkRequired(input.name, 'name', errors)
  checkMaxLength(input.name, 'name', MAX_NAME_LENGTH, errors)
  checkMaxLength(input.description ?? null, 'description', MAX_DESCRIPTION_LENGTH, errors)

  return errors
}

export interface ProjectInput {
  name: string
  description?: string | null
  status?: ProjectStatus
  ownerId: string
  teamId: string
}

export interface ProjectValidationContext {
  users: User[]
  teams: Team[]
}

export function validateProjectInput(
  input: ProjectInput,
  context: ProjectValidationContext,
  currentStatus?: ProjectStatus,
): FieldErrors {
  const errors: FieldErrors = {}

  checkRequired(input.name, 'name', errors)
  checkMaxLength(input.name, 'name', MAX_NAME_LENGTH, errors)
  checkMaxLength(input.description ?? null, 'description', MAX_DESCRIPTION_LENGTH, errors)
  checkOptionalEnum(input.status, PROJECT_STATUSES, 'status', errors)

  checkRequired(input.teamId, 'teamId', errors)
  if (input.teamId && !context.teams.some((team) => team.id === input.teamId)) {
    addError(errors, 'teamId', 'teamId must reference an existing team')
  }

  checkRequired(input.ownerId, 'ownerId', errors)
  if (input.ownerId) {
    const owner = context.users.find((user) => user.id === input.ownerId)
    if (!owner) {
      addError(errors, 'ownerId', 'ownerId must reference an existing user')
    } else if (input.teamId && owner.teamId !== input.teamId) {
      // BR-5: the project owner must belong to the project's team.
      addError(errors, 'ownerId', 'owner must belong to the project team')
    }
  }

  if (currentStatus !== undefined && input.status !== undefined && input.status !== currentStatus) {
    if (!canTransitionProject(currentStatus, input.status)) {
      addError(errors, 'status', `invalid transition: ${currentStatus} -> ${input.status}`)
    }
  }

  return errors
}

export interface TaskInput {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string | null
  projectId: string
}

export interface TaskValidationContext {
  users: User[]
  projects: Project[]
}

export function validateTaskInput(
  input: TaskInput,
  context: TaskValidationContext,
  currentStatus?: TaskStatus,
): FieldErrors {
  const errors: FieldErrors = {}

  checkRequired(input.title, 'title', errors)
  checkMaxLength(input.title, 'title', MAX_TITLE_LENGTH, errors)
  checkMaxLength(input.description ?? null, 'description', MAX_DESCRIPTION_LENGTH, errors)
  checkOptionalEnum(input.status, TASK_STATUSES, 'status', errors)
  checkOptionalEnum(input.priority, TASK_PRIORITIES, 'priority', errors)

  checkRequired(input.projectId, 'projectId', errors)
  if (input.projectId && !context.projects.some((project) => project.id === input.projectId)) {
    addError(errors, 'projectId', 'projectId must reference an existing project')
  }

  if (input.assigneeId !== undefined && input.assigneeId !== null) {
    if (!context.users.some((user) => user.id === input.assigneeId)) {
      addError(errors, 'assigneeId', 'assigneeId must reference an existing user')
    }
  }

  if (currentStatus !== undefined && input.status !== undefined && input.status !== currentStatus) {
    if (!canTransitionTask(currentStatus, input.status)) {
      addError(errors, 'status', `invalid transition: ${currentStatus} -> ${input.status}`)
    }
  }

  return errors
}
