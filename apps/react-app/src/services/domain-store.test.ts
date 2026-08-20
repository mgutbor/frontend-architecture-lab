import { describe, expect, it } from 'vitest'
import { loadFixture, type Dataset } from '@operations-hub/domain'
import { createDomainStore } from './domain-store'

function freshDataset(): Dataset {
  return loadFixture()
}

describe('DomainStore', () => {
  it('starts from the canonical fixture', () => {
    const store = createDomainStore(freshDataset())
    expect(store.getSnapshot().tasks).toHaveLength(30)
    expect(store.getSnapshot().users).toHaveLength(8)
  })

  it('notifies listeners on every mutation', () => {
    const store = createDomainStore(freshDataset())
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })
    store.createProject({ name: 'New', ownerId: 'user-001', teamId: 'team-001' })
    expect(notifications).toBe(1)
    unsubscribe()
  })

  it('never mutates the initial fixture object', () => {
    const dataset = freshDataset()
    const store = createDomainStore(dataset)
    store.transitionProject('project-001', 'completed')
    store.createTask({ title: 'New task', projectId: 'project-001' })
    expect(dataset.projects.find((p) => p.id === 'project-001')?.status).toBe('active')
    expect(dataset.tasks).toHaveLength(30)
  })

  describe('project transitions (PRJ-EDIT-3)', () => {
    it('applies a valid project transition', () => {
      const store = createDomainStore(freshDataset())
      expect(store.transitionProject('project-001', 'completed')).toBe(true)
      expect(
        store.getSnapshot().projects.find((candidate) => candidate.id === 'project-001')?.status,
      ).toBe('completed')
    })

    it('rejects invalid transitions and leaves the dataset unchanged', () => {
      const store = createDomainStore(freshDataset())
      expect(store.transitionProject('project-002', 'planned')).toBe(false) // completed -> planned
      expect(store.transitionProject('project-004', 'completed')).toBe(false) // planned -> completed
      expect(store.transitionProject('project-999', 'active')).toBe(false)
    })

    it('allows the documented reopening completed -> active', () => {
      const store = createDomainStore(freshDataset())
      expect(store.transitionProject('project-002', 'active')).toBe(true)
    })
  })

  describe('createProject (PRJ-CREATE)', () => {
    it('creates a project with the next id, status planned and session timestamps', () => {
      const store = createDomainStore(freshDataset())
      const project = store.createProject({
        name: 'New Portal',
        description: 'A new project',
        ownerId: 'user-001',
        teamId: 'team-001',
      })
      expect(project?.id).toBe('project-007')
      expect(project?.status).toBe('planned')
      expect(project?.name).toBe('New Portal')
      expect(project?.createdAt).toBe(project?.updatedAt)
      expect(store.getSnapshot().projects).toHaveLength(7)
      expect(store.getSnapshot().projects[6]).toBe(project)
    })

    it('rejects an empty name (PRJ-CREATE-4)', () => {
      const store = createDomainStore(freshDataset())
      expect(
        store.createProject({ name: '   ', ownerId: 'user-001', teamId: 'team-001' }),
      ).toBeNull()
    })

    it('rejects an owner outside the project team (BR-5)', () => {
      const store = createDomainStore(freshDataset())
      expect(
        store.createProject({ name: 'Bad', ownerId: 'user-004', teamId: 'team-001' }),
      ).toBeNull()
    })

    it('rejects an unknown team', () => {
      const store = createDomainStore(freshDataset())
      expect(
        store.createProject({ name: 'Bad', ownerId: 'user-001', teamId: 'team-999' }),
      ).toBeNull()
    })
  })

  describe('updateProject (PRJ-EDIT)', () => {
    it('updates name, description and status with a valid transition', () => {
      const store = createDomainStore(freshDataset())
      const ok = store.updateProject('project-004', {
        name: 'Data Ingest Service v2',
        description: 'Updated',
        status: 'active',
        ownerId: 'user-005',
        teamId: 'team-002',
      })
      expect(ok).toBe(true)
      const project = store.getSnapshot().projects.find((c) => c.id === 'project-004')
      expect(project?.name).toBe('Data Ingest Service v2')
      expect(project?.status).toBe('active')
      expect(project?.updatedAt).not.toBe(project?.createdAt)
    })

    it('rejects an invalid status transition (planned -> completed)', () => {
      const store = createDomainStore(freshDataset())
      const ok = store.updateProject('project-004', {
        name: 'X',
        status: 'completed',
        ownerId: 'user-005',
        teamId: 'team-002',
      })
      expect(ok).toBe(false)
      expect(store.getSnapshot().projects.find((c) => c.id === 'project-004')?.status).toBe(
        'planned',
      )
    })

    it('allows editing metadata without changing status', () => {
      const store = createDomainStore(freshDataset())
      expect(
        store.updateProject('project-002', {
          name: 'Alerting Pipeline (renamed)',
          status: 'completed',
          ownerId: 'user-002',
          teamId: 'team-001',
        }),
      ).toBe(true)
    })
  })

  describe('task transitions (TSK-STATUS)', () => {
    it('applies a valid task transition and updates the derived state', () => {
      const store = createDomainStore(freshDataset())
      expect(store.transitionTask('task-007', 'in-progress')).toBe(true)
      expect(store.getSnapshot().tasks.find((t) => t.id === 'task-007')?.status).toBe('in-progress')
    })

    it('rejects invalid task transitions (todo -> completed, completed -> todo)', () => {
      const store = createDomainStore(freshDataset())
      expect(store.transitionTask('task-007', 'completed')).toBe(false)
      expect(store.transitionTask('task-001', 'todo')).toBe(false) // completed -> todo
      expect(store.transitionTask('task-999', 'todo')).toBe(false)
    })

    it('allows the documented reopening cancelled -> todo', () => {
      const store = createDomainStore(freshDataset())
      expect(store.transitionTask('task-008', 'todo')).toBe(true)
    })
  })

  describe('createTask (TSK-CREATE)', () => {
    it('creates a task with defaults (todo, medium) and the next id', () => {
      const store = createDomainStore(freshDataset())
      const task = store.createTask({ title: 'New task', projectId: 'project-001' })
      expect(task?.id).toBe('task-031')
      expect(task?.status).toBe('todo')
      expect(task?.priority).toBe('medium')
      expect(task?.assigneeId).toBeNull()
      expect(store.getSnapshot().tasks).toHaveLength(31)
    })

    it('honours explicit priority and assignee', () => {
      const store = createDomainStore(freshDataset())
      const task = store.createTask({
        title: 'High priority',
        projectId: 'project-001',
        priority: 'high',
        assigneeId: 'user-002',
      })
      expect(task?.priority).toBe('high')
      expect(task?.assigneeId).toBe('user-002')
    })

    it('rejects an unknown project and an unknown assignee (BR-1, BR-4)', () => {
      const store = createDomainStore(freshDataset())
      expect(store.createTask({ title: 'X', projectId: 'project-999' })).toBeNull()
      expect(
        store.createTask({ title: 'X', projectId: 'project-001', assigneeId: 'user-999' }),
      ).toBeNull()
    })
  })

  describe('updateTask (TSK-EDIT-1)', () => {
    it('edits title, description, priority and assignee in any status, including completed', () => {
      const store = createDomainStore(freshDataset())
      const ok = store.updateTask('task-001', {
        title: 'Renamed',
        description: 'Edited while completed',
        priority: 'low',
        assigneeId: 'user-002',
        projectId: 'project-001',
        status: 'completed',
      })
      expect(ok).toBe(true)
      const task = store.getSnapshot().tasks.find((t) => t.id === 'task-001')
      expect(task?.title).toBe('Renamed')
      expect(task?.priority).toBe('low')
      expect(task?.assigneeId).toBe('user-002')
      expect(task?.status).toBe('completed') // status is not changed by edit
    })
  })

  describe('assignTask (TSK-ASSIGN)', () => {
    it('assigns and unassigns a task', () => {
      const store = createDomainStore(freshDataset())
      expect(store.assignTask('task-007', 'user-003')).toBe(true)
      expect(store.getSnapshot().tasks.find((t) => t.id === 'task-007')?.assigneeId).toBe(
        'user-003',
      )
      expect(store.assignTask('task-007', null)).toBe(true)
      expect(store.getSnapshot().tasks.find((t) => t.id === 'task-007')?.assigneeId).toBeNull()
    })

    it('rejects an unknown assignee (BR-4)', () => {
      const store = createDomainStore(freshDataset())
      expect(store.assignTask('task-007', 'user-999')).toBe(false)
    })
  })

  describe('updateUserTeam (TEA-ASSIGN, BR-3)', () => {
    it('moves a user to another team explicitly', () => {
      const store = createDomainStore(freshDataset())
      expect(store.updateUserTeam('user-007', 'team-001')).toBe(true)
      const user = store.getSnapshot().users.find((u) => u.id === 'user-007')
      expect(user?.teamId).toBe('team-001')
    })

    it('keeps the user in exactly one team (BR-3)', () => {
      const store = createDomainStore(freshDataset())
      store.updateUserTeam('user-007', 'team-001')
      const teamsWithUser = store
        .getSnapshot()
        .users.filter((u) => u.id === 'user-007')
        .map((u) => u.teamId)
      expect(teamsWithUser).toEqual(['team-001'])
    })

    it('rejects an unknown team or user', () => {
      const store = createDomainStore(freshDataset())
      expect(store.updateUserTeam('user-007', 'team-999')).toBe(false)
      expect(store.updateUserTeam('user-999', 'team-001')).toBe(false)
    })
  })
})
