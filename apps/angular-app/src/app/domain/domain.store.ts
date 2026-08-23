import { Injectable, computed, inject, signal } from '@angular/core'
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
import { nextEntityId } from '../services/ids'
import { DomainDataAdapter } from './domain-data.adapter'

// Domain state holder (ADR-002): the dataset lives in one writable signal and
// every mutation delegates the business rules to @operations-hub/domain
// (state machines and validations are never reimplemented here).
//
// Mutations are session-only (functional contract TR-2): they apply to the
// current session and are discarded on reload. Session-created entities get
// their timestamps from the session clock; the fixture is never mutated.
@Injectable({ providedIn: 'root' })
export class DomainStore {
  private readonly adapter = inject(DomainDataAdapter)
  private readonly state = signal<Dataset | null>(null)

  /** Read-only view of the current domain state. */
  readonly dataset = this.state.asReadonly()

  readonly isLoaded = computed(() => this.state() !== null)

  load(): void {
    this.state.set(this.adapter.load())
  }

  private nowIso(): string {
    return new Date().toISOString()
  }

  transitionProject(projectId: string, to: ProjectStatus): boolean {
    const current = this.state()
    if (current === null) {
      return false
    }
    const project = current.projects.find((candidate) => candidate.id === projectId)
    if (project === undefined || !canTransitionProject(project.status, to)) {
      return false
    }
    this.state.set({
      ...current,
      projects: current.projects.map((candidate) =>
        candidate.id === projectId
          ? { ...candidate, status: to, updatedAt: this.nowIso() }
          : candidate,
      ),
    })
    return true
  }

  createProject(input: ProjectInput): Project | null {
    const current = this.state()
    if (current === null) {
      return null
    }
    const errors = validateProjectInput(input, {
      users: current.users,
      teams: current.teams,
    })
    if (Object.keys(errors).length > 0) {
      return null
    }
    const project: Project = {
      id: nextEntityId(
        current.projects.map((candidate) => candidate.id),
        'project',
      ),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      // UI default per Phase 4 decision: a new project has not started yet.
      status: 'planned',
      ownerId: input.ownerId,
      teamId: input.teamId,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    }
    this.state.set({ ...current, projects: [...current.projects, project] })
    return project
  }

  updateProject(projectId: string, input: ProjectInput): boolean {
    const current = this.state()
    if (current === null) {
      return false
    }
    const project = current.projects.find((candidate) => candidate.id === projectId)
    if (project === undefined) {
      return false
    }
    // PRJ-EDIT-1: only name, description and status are editable.
    // ownerId/teamId are passed for validation but never changed here.
    const errors = validateProjectInput(
      input,
      { users: current.users, teams: current.teams },
      project.status,
    )
    if (Object.keys(errors).length > 0) {
      return false
    }
    this.state.set({
      ...current,
      projects: current.projects.map((candidate) =>
        candidate.id === projectId
          ? {
              ...candidate,
              name: input.name.trim(),
              description: input.description?.trim() || null,
              status: input.status ?? project.status,
              updatedAt: this.nowIso(),
            }
          : candidate,
      ),
    })
    return true
  }

  transitionTask(taskId: string, to: TaskStatus): boolean {
    const current = this.state()
    if (current === null) {
      return false
    }
    const task = current.tasks.find((candidate) => candidate.id === taskId)
    if (task === undefined || !canTransitionTask(task.status, to)) {
      return false
    }
    this.state.set({
      ...current,
      tasks: current.tasks.map((candidate) =>
        candidate.id === taskId
          ? { ...candidate, status: to, updatedAt: this.nowIso() }
          : candidate,
      ),
    })
    return true
  }

  createTask(input: TaskInput): Task | null {
    const current = this.state()
    if (current === null) {
      return null
    }
    const errors = validateTaskInput(input, {
      users: current.users,
      projects: current.projects,
    })
    if (Object.keys(errors).length > 0) {
      return null
    }
    const task: Task = {
      id: nextEntityId(
        current.tasks.map((candidate) => candidate.id),
        'task',
      ),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      // UI defaults per Phase 4 decision: a new task is pending work.
      status: 'todo',
      priority: input.priority ?? 'medium',
      assigneeId: input.assigneeId ?? null,
      projectId: input.projectId,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    }
    this.state.set({ ...current, tasks: [...current.tasks, task] })
    return task
  }

  updateTask(taskId: string, input: TaskInput): boolean {
    const current = this.state()
    if (current === null) {
      return false
    }
    const task = current.tasks.find((candidate) => candidate.id === taskId)
    if (task === undefined) {
      return false
    }
    // TSK-EDIT-1: title, description, priority and assignee are editable in
    // any status; projectId is passed for validation but never changed.
    const errors = validateTaskInput(
      input,
      { users: current.users, projects: current.projects },
      task.status,
    )
    if (Object.keys(errors).length > 0) {
      return false
    }
    this.state.set({
      ...current,
      tasks: current.tasks.map((candidate) =>
        candidate.id === taskId
          ? {
              ...candidate,
              title: input.title.trim(),
              description: input.description?.trim() || null,
              priority: input.priority ?? task.priority,
              assigneeId: input.assigneeId ?? null,
              updatedAt: this.nowIso(),
            }
          : candidate,
      ),
    })
    return true
  }

  assignTask(taskId: string, assigneeId: string | null): boolean {
    const current = this.state()
    if (current === null) {
      return false
    }
    const task = current.tasks.find((candidate) => candidate.id === taskId)
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
      { users: current.users, projects: current.projects },
      task.status,
    )
    if (Object.keys(errors).length > 0) {
      return false
    }
    this.state.set({
      ...current,
      tasks: current.tasks.map((candidate) =>
        candidate.id === taskId
          ? { ...candidate, assigneeId: assigneeId ?? null, updatedAt: this.nowIso() }
          : candidate,
      ),
    })
    return true
  }

  updateUserTeam(userId: string, teamId: string): boolean {
    const current = this.state()
    if (current === null) {
      return false
    }
    const user = current.users.find((candidate) => candidate.id === userId)
    if (user === undefined) {
      return false
    }
    // BR-3: a user belongs to exactly one team; changing team is an explicit
    // reassignment. The domain validation checks that the target team exists.
    const errors = validateUserInput(
      { name: user.name, email: user.email, teamId },
      { users: current.users, teams: current.teams },
      userId,
    )
    if (Object.keys(errors).length > 0) {
      return false
    }
    this.state.set({
      ...current,
      users: current.users.map((candidate) =>
        candidate.id === userId ? { ...candidate, teamId, updatedAt: this.nowIso() } : candidate,
      ),
    })
    return true
  }
}
