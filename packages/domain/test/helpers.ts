// Shared builders for small, valid test datasets (unit tests only).

import type { Dataset, Project, Task, Team, User } from '../src/types'

export function makeUser(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@operations-hub.dev`,
    teamId: 'team-001',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T09:00:00Z',
    ...overrides,
  }
}

export function makeTeam(id: string, overrides: Partial<Team> = {}): Team {
  return {
    id,
    name: `Team ${id}`,
    description: null,
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T09:00:00Z',
    ...overrides,
  }
}

export function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    description: null,
    status: 'active',
    ownerId: 'user-001',
    teamId: 'team-001',
    createdAt: '2025-01-02T09:00:00Z',
    updatedAt: '2025-01-02T09:00:00Z',
    ...overrides,
  }
}

export function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-001',
    createdAt: '2025-01-03T09:00:00Z',
    updatedAt: '2025-01-03T09:00:00Z',
    ...overrides,
  }
}

export function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    datasetVersion: 'v1',
    users: [makeUser('user-001'), makeUser('user-002')],
    teams: [makeTeam('team-001'), makeTeam('team-002')],
    projects: [makeProject('project-001')],
    tasks: [makeTask('task-001', { assigneeId: 'user-001' }), makeTask('task-002')],
    ...overrides,
  }
}
