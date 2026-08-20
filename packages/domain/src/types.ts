// Domain types for Operations Hub.
// Source of truth: docs/architecture/domain-model.md (entities are persisted;
// Report is a derived concept, not a persisted entity).

export type ProjectStatus = 'planned' | 'active' | 'completed'

export type TaskStatus = 'todo' | 'in-progress' | 'completed' | 'cancelled'

export type TaskPriority = 'low' | 'medium' | 'high'

export type ReportScope = 'global' | 'project' | 'team'

export interface User {
  id: string
  name: string
  email: string
  teamId: string
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  ownerId: string
  teamId: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  projectId: string
  createdAt: string
  updatedAt: string
}

export interface Dataset {
  datasetVersion: string
  users: User[]
  teams: Team[]
  projects: Project[]
  tasks: Task[]
}

export interface ReportMetrics {
  totalTasks: number
  todoTasks: number
  inProgressTasks: number
  completedTasks: number
  cancelledTasks: number
  completionRate: number | null
  // scope = "team": additionally
  projectsCount?: number
  membersCount?: number
}

export interface Report {
  scope: ReportScope
  targetId: string | null
  // Display-only generation timestamp; optional so report builders stay
  // deterministic (domain-model.md marks it as "solo informativo").
  asOf?: string
  metrics: ReportMetrics
}
