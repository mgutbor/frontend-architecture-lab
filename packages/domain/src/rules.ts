// Business rules BR-1..BR-7 and full dataset validation.
// Source of truth: docs/architecture/domain-model.md sections 5 and 6.
//
// BR-7 (reports are always derived from current data, never stored) is an
// implementation invariant enforced by design: reports.ts only contains pure
// functions and nothing in this package persists or caches domain data.

import type { Dataset, Project, Task, Team, User } from './types'
import {
  isOneOf,
  isValidEmail,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from './validation'

const ID_PATTERN = /^(user|team|project|task)-\d{3}$/

// --- BR-1: a task must belong to an existing project. ---
export function taskBelongsToProject(task: Task, projects: Project[]): boolean {
  return projects.some((project) => project.id === task.projectId)
}

// --- BR-2: a project must have an owner and a team referencing existing records. ---
export function projectHasValidOwnerAndTeam(
  project: Project,
  users: User[],
  teams: Team[],
): boolean {
  return (
    users.some((user) => user.id === project.ownerId) &&
    teams.some((team) => team.id === project.teamId)
  )
}

// --- BR-3: a user belongs to exactly one team (single required teamId). ---
export function userBelongsToExistingTeam(user: User, teams: Team[]): boolean {
  return teams.some((team) => team.id === user.teamId)
}

// --- BR-4: the assignee, if present, must reference an existing user. ---
export function taskAssigneeIsValid(task: Task, users: User[]): boolean {
  return task.assigneeId === null || users.some((user) => user.id === task.assigneeId)
}

// --- BR-5: the project owner must belong to the project's team. ---
export function isProjectOwnerInTeam(project: Project, users: User[]): boolean {
  const owner = users.find((user) => user.id === project.ownerId)
  return owner !== undefined && owner.teamId === project.teamId
}

// --- Email uniqueness (domain-model.md section 6). ---
export function isEmailUnique(email: string, users: User[], excludeUserId?: string): boolean {
  return !users.some((user) => user.email === email && user.id !== excludeUserId)
}

// --- Full dataset validation. ---
// Checks structure, types, enums, id patterns, references, BR-1..BR-5 and the
// documented timestamp coherence rules. Returns a list of issues; empty = valid.

export function validateDataset(dataset: Dataset): string[] {
  const issues: string[] = []

  if (typeof dataset !== 'object' || dataset === null) {
    return ['dataset must be an object']
  }

  if (typeof dataset.datasetVersion !== 'string' || dataset.datasetVersion.length === 0) {
    issues.push('datasetVersion must be a non-empty string')
  }

  type LooseRecord = { id?: unknown; createdAt?: unknown; updatedAt?: unknown }
  const collections: Record<string, { records: LooseRecord[]; label: string }> = {
    users: { records: dataset.users, label: 'users' },
    teams: { records: dataset.teams, label: 'teams' },
    projects: { records: dataset.projects, label: 'projects' },
    tasks: { records: dataset.tasks, label: 'tasks' },
  }

  const entityPrefix: Record<string, string> = {
    users: 'user',
    teams: 'team',
    projects: 'project',
    tasks: 'task',
  }

  const seenIds = new Map<string, string>()
  for (const [key, { records, label }] of Object.entries(collections)) {
    if (!Array.isArray(records)) {
      issues.push(`${label} must be an array`)
      continue
    }
    for (const record of records) {
      if (typeof record !== 'object' || record === null) {
        issues.push(`${label} contains a non-object record`)
        continue
      }
      const id = record.id
      if (
        typeof id !== 'string' ||
        !ID_PATTERN.test(id) ||
        !id.startsWith(`${entityPrefix[key]}-`)
      ) {
        issues.push(`${label} record has invalid id pattern: ${String(id)}`)
      } else if (seenIds.has(id)) {
        issues.push(`duplicate id in ${label}: ${id}`)
      } else {
        seenIds.set(id, label)
      }
      for (const field of ['createdAt', 'updatedAt'] as const) {
        const value = record[field]
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
          issues.push(`${label} record ${String(id)} has invalid ${field}`)
        }
      }
    }
  }

  if (issues.some((issue) => issue.startsWith('users') || issue.startsWith('teams'))) {
    // Cannot check references without well-formed users/teams.
    return issues
  }

  const users = dataset.users as User[]
  const teams = dataset.teams as Team[]
  const projects = dataset.projects as Project[]
  const tasks = dataset.tasks as Task[]

  const projectIds = new Set(projects.map((project) => project.id))

  // Structure and enum checks per entity.
  for (const user of users) {
    if (typeof user.name !== 'string' || user.name.trim().length === 0) {
      issues.push(`user ${user.id} must have a non-empty name`)
    }
    if (typeof user.email !== 'string' || !isValidEmail(user.email)) {
      issues.push(`user ${user.id} must have a valid email`)
    }
    if (!userBelongsToExistingTeam(user, teams)) {
      issues.push(`user ${user.id} must reference an existing team (BR-3)`)
    }
  }

  const emails = new Map<string, string>()
  for (const user of users) {
    const previous = emails.get(user.email)
    if (previous !== undefined) {
      issues.push(`email must be unique: ${user.email} (users ${previous} and ${user.id})`)
    } else {
      emails.set(user.email, user.id)
    }
  }

  for (const team of teams) {
    if (typeof team.name !== 'string' || team.name.trim().length === 0) {
      issues.push(`team ${team.id} must have a non-empty name`)
    }
  }

  for (const project of projects) {
    if (typeof project.name !== 'string' || project.name.trim().length === 0) {
      issues.push(`project ${project.id} must have a non-empty name`)
    }
    if (!isOneOf(project.status, PROJECT_STATUSES)) {
      issues.push(`project ${project.id} has invalid status: ${String(project.status)}`)
    }
    if (!projectHasValidOwnerAndTeam(project, users, teams)) {
      issues.push(`project ${project.id} must have a valid owner and team (BR-2)`)
    }
    if (!isProjectOwnerInTeam(project, users)) {
      issues.push(`project ${project.id} owner must belong to the project team (BR-5)`)
    }
  }

  for (const task of tasks) {
    if (typeof task.title !== 'string' || task.title.trim().length === 0) {
      issues.push(`task ${task.id} must have a non-empty title`)
    }
    if (!isOneOf(task.status, TASK_STATUSES)) {
      issues.push(`task ${task.id} has invalid status: ${String(task.status)}`)
    }
    if (!isOneOf(task.priority, TASK_PRIORITIES)) {
      issues.push(`task ${task.id} has invalid priority: ${String(task.priority)}`)
    }
    if (!taskBelongsToProject(task, projects)) {
      issues.push(`task ${task.id} must belong to an existing project (BR-1)`)
    }
    if (!taskAssigneeIsValid(task, users)) {
      issues.push(`task ${task.id} assignee must reference an existing user (BR-4)`)
    }
  }

  // Timestamp coherence: updatedAt >= createdAt; task created after its project.
  for (const user of users) {
    checkTimestampOrder(user, issues)
  }
  for (const team of teams) {
    checkTimestampOrder(team, issues)
  }
  for (const project of projects) {
    checkTimestampOrder(project, issues)
  }
  for (const task of tasks) {
    checkTimestampOrder(task, issues)
    if (projectIds.has(task.projectId)) {
      const project = projects.find((candidate) => candidate.id === task.projectId)
      if (project !== undefined && Date.parse(task.createdAt) < Date.parse(project.createdAt)) {
        issues.push(`task ${task.id} must be created after its project (${task.projectId})`)
      }
    }
  }

  return issues
}

interface Timestamped {
  id: string
  createdAt: string
  updatedAt: string
}

function checkTimestampOrder(record: Timestamped, issues: string[]): void {
  if (
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    Date.parse(record.updatedAt) < Date.parse(record.createdAt)
  ) {
    issues.push(`${record.id} must have updatedAt >= createdAt`)
  }
}
