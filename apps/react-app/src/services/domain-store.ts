import {
  canTransitionProject,
  canTransitionTask,
  validateProjectInput,
  validateTaskInput,
  validateUserInput,
  type Dataset,
  type Project,
  type ProjectInput,
  type ProjectStatus,
  type Task,
  type TaskInput,
  type TaskStatus,
} from '@operations-hub/domain'
import { nextEntityId } from './ids'

// Minimal external store (no library): holds the domain state and exposes
// mutations that delegate the business rules to @operations-hub/domain
// (state machines and validations are never reimplemented here).
//
// Mutations are session-only (functional contract TR-2): they apply to the
// current session and are discarded on reload. Session-created entities get
// their timestamps from the session clock; the fixture is never mutated.
export interface DomainStore {
  getSnapshot(): Dataset
  subscribe(listener: () => void): () => void
  transitionProject(projectId: string, to: ProjectStatus): boolean
  createProject(input: ProjectInput): Project | null
  updateProject(projectId: string, input: ProjectInput): boolean
  transitionTask(taskId: string, to: TaskStatus): boolean
  createTask(input: TaskInput): Task | null
  updateTask(taskId: string, input: TaskInput): boolean
  assignTask(taskId: string, assigneeId: string | null): boolean
  updateUserTeam(userId: string, teamId: string): boolean
}

export function createDomainStore(initial: Dataset): DomainStore {
  let dataset = initial
  const listeners = new Set<() => void>()

  const emit = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  const setDataset = (next: Dataset): void => {
    dataset = next
    emit()
  }

  const nowIso = (): string => new Date().toISOString()

  return {
    getSnapshot: () => dataset,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    transitionProject(projectId, to) {
      const project = dataset.projects.find((candidate) => candidate.id === projectId)
      if (project === undefined || !canTransitionProject(project.status, to)) {
        return false
      }
      setDataset({
        ...dataset,
        projects: dataset.projects.map((candidate) =>
          candidate.id === projectId
            ? { ...candidate, status: to, updatedAt: nowIso() }
            : candidate,
        ),
      })
      return true
    },
    createProject(input) {
      const errors = validateProjectInput(input, {
        users: dataset.users,
        teams: dataset.teams,
      })
      if (Object.keys(errors).length > 0) {
        return null
      }
      const project: Project = {
        id: nextEntityId(
          dataset.projects.map((candidate) => candidate.id),
          'project',
        ),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        // UI default per Phase 4 decision: a new project has not started yet.
        status: 'planned',
        ownerId: input.ownerId,
        teamId: input.teamId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      setDataset({ ...dataset, projects: [...dataset.projects, project] })
      return project
    },
    updateProject(projectId, input) {
      const project = dataset.projects.find((candidate) => candidate.id === projectId)
      if (project === undefined) {
        return false
      }
      // PRJ-EDIT-1: only name, description and status are editable.
      // ownerId/teamId are passed for validation but never changed here.
      const errors = validateProjectInput(
        input,
        { users: dataset.users, teams: dataset.teams },
        project.status,
      )
      if (Object.keys(errors).length > 0) {
        return false
      }
      setDataset({
        ...dataset,
        projects: dataset.projects.map((candidate) =>
          candidate.id === projectId
            ? {
                ...candidate,
                name: input.name.trim(),
                description: input.description?.trim() || null,
                status: input.status ?? project.status,
                updatedAt: nowIso(),
              }
            : candidate,
        ),
      })
      return true
    },
    transitionTask(taskId, to) {
      const task = dataset.tasks.find((candidate) => candidate.id === taskId)
      if (task === undefined || !canTransitionTask(task.status, to)) {
        return false
      }
      setDataset({
        ...dataset,
        tasks: dataset.tasks.map((candidate) =>
          candidate.id === taskId ? { ...candidate, status: to, updatedAt: nowIso() } : candidate,
        ),
      })
      return true
    },
    createTask(input) {
      const errors = validateTaskInput(input, {
        users: dataset.users,
        projects: dataset.projects,
      })
      if (Object.keys(errors).length > 0) {
        return null
      }
      const task: Task = {
        id: nextEntityId(
          dataset.tasks.map((candidate) => candidate.id),
          'task',
        ),
        title: input.title.trim(),
        description: input.description?.trim() || null,
        // UI defaults per Phase 4 decision: a new task is pending work.
        status: 'todo',
        priority: input.priority ?? 'medium',
        assigneeId: input.assigneeId ?? null,
        projectId: input.projectId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      setDataset({ ...dataset, tasks: [...dataset.tasks, task] })
      return task
    },
    updateTask(taskId, input) {
      const task = dataset.tasks.find((candidate) => candidate.id === taskId)
      if (task === undefined) {
        return false
      }
      // TSK-EDIT-1: title, description, priority and assignee are editable in
      // any status; projectId is passed for validation but never changed.
      const errors = validateTaskInput(
        input,
        { users: dataset.users, projects: dataset.projects },
        task.status,
      )
      if (Object.keys(errors).length > 0) {
        return false
      }
      setDataset({
        ...dataset,
        tasks: dataset.tasks.map((candidate) =>
          candidate.id === taskId
            ? {
                ...candidate,
                title: input.title.trim(),
                description: input.description?.trim() || null,
                priority: input.priority ?? task.priority,
                assigneeId: input.assigneeId ?? null,
                updatedAt: nowIso(),
              }
            : candidate,
        ),
      })
      return true
    },
    assignTask(taskId, assigneeId) {
      const task = dataset.tasks.find((candidate) => candidate.id === taskId)
      if (task === undefined) {
        return false
      }
      // Reuse the domain validation (BR-4: assignee must exist when set).
      const errors = validateTaskInput(
        {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assigneeId,
          projectId: task.projectId,
        },
        { users: dataset.users, projects: dataset.projects },
        task.status,
      )
      if (Object.keys(errors).length > 0) {
        return false
      }
      setDataset({
        ...dataset,
        tasks: dataset.tasks.map((candidate) =>
          candidate.id === taskId
            ? { ...candidate, assigneeId: assigneeId ?? null, updatedAt: nowIso() }
            : candidate,
        ),
      })
      return true
    },
    updateUserTeam(userId, teamId) {
      const user = dataset.users.find((candidate) => candidate.id === userId)
      if (user === undefined) {
        return false
      }
      // BR-3: a user belongs to exactly one team; changing team is an explicit
      // reassignment. The domain validation checks that the target team exists.
      const errors = validateUserInput(
        { name: user.name, email: user.email, teamId },
        { users: dataset.users, teams: dataset.teams },
        userId,
      )
      if (Object.keys(errors).length > 0) {
        return false
      }
      setDataset({
        ...dataset,
        users: dataset.users.map((candidate) =>
          candidate.id === userId ? { ...candidate, teamId, updatedAt: nowIso() } : candidate,
        ),
      })
      return true
    },
  }
}
