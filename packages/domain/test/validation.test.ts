import { describe, expect, it } from 'vitest'
import { makeDataset, makeTeam, makeUser } from './helpers'
import {
  validateProjectInput,
  validateTaskInput,
  validateTeamInput,
  validateUserInput,
  type ProjectInput,
  type TaskInput,
} from '../src/index'
import type { ProjectStatus, TaskPriority, TaskStatus } from '../src/index'

const dataset = makeDataset()

const validProject: ProjectInput = {
  name: 'New portal',
  description: null,
  status: 'planned',
  ownerId: 'user-001',
  teamId: 'team-001',
}

const validTask: TaskInput = {
  title: 'Write tests',
  description: null,
  status: 'todo',
  priority: 'medium',
  assigneeId: 'user-001',
  projectId: 'project-001',
}

describe('validateProjectInput', () => {
  it('accepts a valid input', () => {
    expect(validateProjectInput(validProject, dataset)).toEqual({})
  })

  it('rejects a missing or whitespace-only name', () => {
    expect(validateProjectInput({ ...validProject, name: '' }, dataset).name).toBeDefined()
    expect(validateProjectInput({ ...validProject, name: '   ' }, dataset).name).toBeDefined()
  })

  it('rejects a name longer than 100 characters', () => {
    const tooLong = validateProjectInput({ ...validProject, name: 'x'.repeat(101) }, dataset)
    expect(tooLong.name).toBeDefined()
    expect(validateProjectInput({ ...validProject, name: 'x'.repeat(100) }, dataset)).toEqual({})
  })

  it('rejects a description longer than 500 characters', () => {
    const errors = validateProjectInput({ ...validProject, description: 'x'.repeat(501) }, dataset)
    expect(errors.description).toBeDefined()
  })

  it('rejects a status outside the documented enum', () => {
    const errors = validateProjectInput(
      { ...validProject, status: 'archived' as ProjectStatus },
      dataset,
    )
    expect(errors.status).toBeDefined()
  })

  it('rejects a teamId that does not reference an existing team', () => {
    const errors = validateProjectInput({ ...validProject, teamId: 'team-999' }, dataset)
    expect(errors.teamId).toBeDefined()
  })

  it('rejects an ownerId that does not reference an existing user', () => {
    const errors = validateProjectInput({ ...validProject, ownerId: 'user-999' }, dataset)
    expect(errors.ownerId).toBeDefined()
  })

  it('rejects an owner that does not belong to the project team (BR-5)', () => {
    const otherTeam = makeDataset({ teams: [...dataset.teams, makeTeam('team-003')] })
    const ownerInOtherTeam = makeUser('user-003', { teamId: 'team-003' })
    const context = { ...otherTeam, users: [...otherTeam.users, ownerInOtherTeam] }
    const errors = validateProjectInput(
      { ...validProject, ownerId: 'user-003', teamId: 'team-001' },
      context,
    )
    expect(errors.ownerId).toBeDefined()
  })

  it('rejects an invalid status transition on edit', () => {
    const errors = validateProjectInput(validProject, dataset, 'completed')
    expect(errors.status).toBeDefined()
  })

  it('accepts a valid status transition on edit', () => {
    expect(
      validateProjectInput({ ...validProject, status: 'completed' }, dataset, 'active'),
    ).toEqual({})
  })

  it('does not validate a transition when the status is unchanged', () => {
    expect(validateProjectInput({ ...validProject, status: 'active' }, dataset, 'active')).toEqual(
      {},
    )
  })
})

describe('validateTaskInput', () => {
  it('accepts a valid input', () => {
    expect(validateTaskInput(validTask, dataset)).toEqual({})
  })

  it('rejects a missing or whitespace-only title', () => {
    expect(validateTaskInput({ ...validTask, title: '' }, dataset).title).toBeDefined()
    expect(validateTaskInput({ ...validTask, title: '  ' }, dataset).title).toBeDefined()
  })

  it('rejects a title longer than 120 characters', () => {
    const errors = validateTaskInput({ ...validTask, title: 'x'.repeat(121) }, dataset)
    expect(errors.title).toBeDefined()
    expect(validateTaskInput({ ...validTask, title: 'x'.repeat(120) }, dataset)).toEqual({})
  })

  it('rejects invalid status and priority enums', () => {
    const badStatus = validateTaskInput({ ...validTask, status: 'blocked' as TaskStatus }, dataset)
    expect(badStatus.status).toBeDefined()
    const badPriority = validateTaskInput(
      { ...validTask, priority: 'urgent' as TaskPriority },
      dataset,
    )
    expect(badPriority.priority).toBeDefined()
  })

  it('rejects a projectId that does not reference an existing project', () => {
    const errors = validateTaskInput({ ...validTask, projectId: 'project-999' }, dataset)
    expect(errors.projectId).toBeDefined()
  })

  it('rejects an assigneeId that does not reference an existing user', () => {
    const errors = validateTaskInput({ ...validTask, assigneeId: 'user-999' }, dataset)
    expect(errors.assigneeId).toBeDefined()
  })

  it('accepts an unassigned task', () => {
    expect(validateTaskInput({ ...validTask, assigneeId: null }, dataset)).toEqual({})
  })

  it('rejects an invalid status transition on edit', () => {
    const errors = validateTaskInput({ ...validTask, status: 'completed' }, dataset, 'todo')
    expect(errors.status).toBeDefined()
  })

  it('accepts a valid status transition on edit', () => {
    expect(validateTaskInput({ ...validTask, status: 'in-progress' }, dataset, 'todo')).toEqual({})
  })
})

describe('validateUserInput', () => {
  const validUser = { name: 'Ada Lovelace', email: 'ada@operations-hub.dev', teamId: 'team-001' }

  it('accepts a valid input', () => {
    expect(validateUserInput(validUser, dataset)).toEqual({})
  })

  it('rejects an invalid email format', () => {
    const errors = validateUserInput({ ...validUser, email: 'not-an-email' }, dataset)
    expect(errors.email).toBeDefined()
  })

  it('rejects a duplicate email', () => {
    const duplicate = dataset.users[0] as { email: string }
    const errors = validateUserInput({ ...validUser, email: duplicate.email }, dataset)
    expect(errors.email).toBeDefined()
  })

  it('does not flag the current user email as duplicate on edit', () => {
    const current = dataset.users[0] as { id: string; email: string }
    expect(validateUserInput({ ...validUser, email: current.email }, dataset, current.id)).toEqual(
      {},
    )
  })

  it('rejects a teamId that does not reference an existing team', () => {
    const errors = validateUserInput({ ...validUser, teamId: 'team-999' }, dataset)
    expect(errors.teamId).toBeDefined()
  })
})

describe('validateTeamInput', () => {
  it('accepts a valid input', () => {
    expect(validateTeamInput({ name: 'Core Platform', description: null })).toEqual({})
  })

  it('rejects a missing name and an over-long name', () => {
    expect(validateTeamInput({ name: '' }).name).toBeDefined()
    expect(validateTeamInput({ name: 'x'.repeat(101) }).name).toBeDefined()
  })

  it('rejects an over-long description', () => {
    expect(
      validateTeamInput({ name: 'Core', description: 'x'.repeat(501) }).description,
    ).toBeDefined()
  })
})
