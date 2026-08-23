import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { DomainStore } from './domain.store'

describe('DomainStore', () => {
  let store: DomainStore

  beforeEach(() => {
    TestBed.configureTestingModule({})
    store = TestBed.inject(DomainStore)
  })

  describe('load', () => {
    it('loads the canonical fixture through the adapter', () => {
      store.load()
      const dataset = store.dataset()
      expect(dataset?.users).toHaveLength(8)
      expect(dataset?.teams).toHaveLength(3)
      expect(dataset?.projects).toHaveLength(6)
      expect(dataset?.tasks).toHaveLength(30)
      expect(store.isLoaded()).toBe(true)
    })

    it('is not loaded before load()', () => {
      expect(store.isLoaded()).toBe(false)
      expect(store.dataset()).toBeNull()
    })
  })

  describe('project transitions', () => {
    it('applies a valid project transition', () => {
      store.load()
      expect(store.transitionProject('project-001', 'completed')).toBe(true)
      const project = store.dataset()?.projects.find((candidate) => candidate.id === 'project-001')
      expect(project?.status).toBe('completed')
    })

    it('rejects invalid transitions without changing the dataset', () => {
      store.load()
      expect(store.transitionProject('project-002', 'planned')).toBe(false) // completed -> planned
      const project = store.dataset()?.projects.find((candidate) => candidate.id === 'project-002')
      expect(project?.status).toBe('completed')
    })

    it('rejects transitions for unknown projects', () => {
      store.load()
      expect(store.transitionProject('project-999', 'active')).toBe(false)
    })
  })

  describe('createProject', () => {
    it('creates a project with the next id and planned status', () => {
      store.load()
      const project = store.createProject({
        name: 'New Initiative',
        description: null,
        ownerId: 'user-001',
        teamId: 'team-001',
      })
      expect(project?.id).toBe('project-007')
      expect(project?.status).toBe('planned')
      expect(project?.name).toBe('New Initiative')
      expect(store.dataset()?.projects).toHaveLength(7)
    })

    it('rejects invalid input without mutating the dataset', () => {
      store.load()
      const before = store.dataset()?.projects.length ?? 0
      expect(store.createProject({ name: '', ownerId: 'user-001', teamId: 'team-001' })).toBeNull()
      expect(store.dataset()?.projects).toHaveLength(before)
    })

    it('does not mutate the previous dataset (immutability)', () => {
      store.load()
      const before = store.dataset()
      store.createProject({ name: 'New Initiative', ownerId: 'user-001', teamId: 'team-001' })
      expect(store.dataset()).not.toBe(before)
      expect(before?.projects).toHaveLength(6)
      expect(before?.tasks).toHaveLength(30)
    })
  })

  describe('updateProject', () => {
    it('updates name, description and status', () => {
      store.load()
      const ok = store.updateProject('project-004', {
        name: 'Renamed Project',
        description: 'updated',
        status: 'active',
        ownerId: 'user-005',
        teamId: 'team-002',
      })
      expect(ok).toBe(true)
      const project = store.dataset()?.projects.find((candidate) => candidate.id === 'project-004')
      expect(project?.name).toBe('Renamed Project')
      expect(project?.description).toBe('updated')
      expect(project?.status).toBe('active')
      // ownerId/teamId are never changed by updateProject (PRJ-EDIT-1).
      expect(project?.ownerId).toBe('user-005')
      expect(project?.teamId).toBe('team-002')
    })

    it('rejects invalid status transitions', () => {
      store.load()
      expect(
        store.updateProject('project-002', {
          name: 'Alerting Pipeline',
          status: 'planned',
          ownerId: 'user-002',
          teamId: 'team-001',
        }),
      ).toBe(false)
      const project = store.dataset()?.projects.find((candidate) => candidate.id === 'project-002')
      expect(project?.status).toBe('completed')
    })

    it('rejects updates for unknown projects', () => {
      store.load()
      expect(
        store.updateProject('project-999', { name: 'x', ownerId: 'user-001', teamId: 'team-001' }),
      ).toBe(false)
    })
  })

  describe('task transitions', () => {
    it('applies a valid task transition', () => {
      store.load()
      expect(store.transitionTask('task-001', 'cancelled')).toBe(false) // completed -> cancelled
      expect(store.transitionTask('task-001', 'in-progress')).toBe(true) // completed -> in-progress
      const task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-001')
      expect(task?.status).toBe('in-progress')
    })

    it('rejects invalid task transitions', () => {
      store.load()
      expect(store.transitionTask('task-001', 'todo')).toBe(false) // completed -> todo
      const task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-001')
      expect(task?.status).toBe('completed')
    })
  })

  describe('createTask', () => {
    it('creates a task with the next id, todo status and medium priority', () => {
      store.load()
      const task = store.createTask({
        title: 'New task',
        projectId: 'project-001',
      })
      expect(task?.id).toBe('task-031')
      expect(task?.status).toBe('todo')
      expect(task?.priority).toBe('medium')
      expect(task?.assigneeId).toBeNull()
      expect(store.dataset()?.tasks).toHaveLength(31)
    })

    it('rejects invalid input without mutating the dataset', () => {
      store.load()
      expect(store.createTask({ title: '', projectId: 'project-001' })).toBeNull()
      expect(store.createTask({ title: 'x', projectId: 'project-999' })).toBeNull()
      expect(store.dataset()?.tasks).toHaveLength(30)
    })
  })

  describe('updateTask', () => {
    it('edits title, description, priority and assignee in any status', () => {
      store.load()
      const ok = store.updateTask('task-030', {
        title: 'Renamed task',
        description: 'notes',
        priority: 'high',
        assigneeId: 'user-001',
        projectId: 'project-005',
      })
      expect(ok).toBe(true)
      const task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-030')
      expect(task?.title).toBe('Renamed task')
      expect(task?.priority).toBe('high')
      expect(task?.assigneeId).toBe('user-001')
    })

    it('rejects updates with an invalid assignee (BR-4)', () => {
      store.load()
      const ok = store.updateTask('task-030', {
        title: 'Renamed task',
        assigneeId: 'user-999',
        projectId: 'project-005',
      })
      expect(ok).toBe(false)
      const task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-030')
      expect(task?.title).toBe('Measure activation rate')
    })
  })

  describe('assignTask', () => {
    it('assigns and unassigns a task', () => {
      store.load()
      expect(store.assignTask('task-007', 'user-002')).toBe(true)
      let task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-007')
      expect(task?.assigneeId).toBe('user-002')
      expect(store.assignTask('task-007', null)).toBe(true)
      task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-007')
      expect(task?.assigneeId).toBeNull()
    })

    it('rejects unknown assignees (BR-4)', () => {
      store.load()
      expect(store.assignTask('task-007', 'user-999')).toBe(false)
    })
  })

  describe('updateUserTeam (BR-3)', () => {
    it('reassigns a user to another team (exactly one team)', () => {
      store.load()
      expect(store.updateUserTeam('user-001', 'team-002')).toBe(true)
      const user = store.dataset()?.users.find((candidate) => candidate.id === 'user-001')
      expect(user?.teamId).toBe('team-002')
      // The previous team loses the member: team-001 now has 2 members.
      const team001Count = store
        .dataset()
        ?.users.filter((candidate) => candidate.teamId === 'team-001').length
      expect(team001Count).toBe(2)
    })

    it('rejects reassignment to an unknown team', () => {
      store.load()
      expect(store.updateUserTeam('user-001', 'team-999')).toBe(false)
      const user = store.dataset()?.users.find((candidate) => candidate.id === 'user-001')
      expect(user?.teamId).toBe('team-001')
    })
  })

  describe('derived counters stay coherent', () => {
    it('keeps reports consistent after mutations', () => {
      store.load()
      // Global report before.
      const before = store.dataset()?.tasks ?? []
      const completedBefore = before.filter((task) => task.status === 'completed').length

      // Complete a todo task -> completed count +1.
      expect(store.transitionTask('task-005', 'in-progress')).toBe(true)
      expect(store.transitionTask('task-005', 'completed')).toBe(true)
      const after = store.dataset()?.tasks ?? []
      expect(after.filter((task) => task.status === 'completed').length).toBe(completedBefore + 1)
    })
  })
})
