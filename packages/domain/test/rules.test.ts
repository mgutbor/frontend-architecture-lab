import { describe, expect, it } from 'vitest'
import { makeDataset, makeProject, makeTask, makeUser } from './helpers'
import {
  isEmailUnique,
  isProjectOwnerInTeam,
  projectHasValidOwnerAndTeam,
  taskAssigneeIsValid,
  taskBelongsToProject,
  userBelongsToExistingTeam,
  validateDataset,
} from '../src/index'

const dataset = makeDataset()

describe('BR-1: task belongs to a project', () => {
  it('is true for a task whose project exists', () => {
    expect(taskBelongsToProject(dataset.tasks[0]!, dataset.projects)).toBe(true)
  })

  it('is false for a task whose project does not exist', () => {
    const orphan = makeTask('task-999', { projectId: 'project-999' })
    expect(taskBelongsToProject(orphan, dataset.projects)).toBe(false)
  })
})

describe('BR-2: project has valid owner and team', () => {
  it('is true for a project with existing owner and team', () => {
    expect(projectHasValidOwnerAndTeam(dataset.projects[0]!, dataset.users, dataset.teams)).toBe(
      true,
    )
  })

  it('is false when the owner or the team does not exist', () => {
    const badOwner = makeProject('project-999', { ownerId: 'user-999' })
    expect(projectHasValidOwnerAndTeam(badOwner, dataset.users, dataset.teams)).toBe(false)
    const badTeam = makeProject('project-999', { teamId: 'team-999' })
    expect(projectHasValidOwnerAndTeam(badTeam, dataset.users, dataset.teams)).toBe(false)
  })
})

describe('BR-3: user belongs to exactly one team', () => {
  it('is true when the team exists', () => {
    expect(userBelongsToExistingTeam(dataset.users[0]!, dataset.teams)).toBe(true)
  })

  it('is false when the team does not exist', () => {
    expect(
      userBelongsToExistingTeam(makeUser('user-999', { teamId: 'team-999' }), dataset.teams),
    ).toBe(false)
  })
})

describe('BR-4: assignee references an existing user', () => {
  it('is true for null and for existing users', () => {
    expect(taskAssigneeIsValid(makeTask('task-999', { assigneeId: null }), dataset.users)).toBe(
      true,
    )
    expect(
      taskAssigneeIsValid(makeTask('task-999', { assigneeId: 'user-001' }), dataset.users),
    ).toBe(true)
  })

  it('is false for a missing user', () => {
    expect(
      taskAssigneeIsValid(makeTask('task-999', { assigneeId: 'user-999' }), dataset.users),
    ).toBe(false)
  })
})

describe('BR-5: project owner belongs to the project team', () => {
  it('is true when owner and project share a team', () => {
    expect(isProjectOwnerInTeam(dataset.projects[0]!, dataset.users)).toBe(true)
  })

  it('is false when the owner belongs to a different team', () => {
    const project = makeProject('project-999', { ownerId: 'user-003', teamId: 'team-002' })
    const users = [...dataset.users, makeUser('user-003', { teamId: 'team-001' })]
    expect(isProjectOwnerInTeam(project, users)).toBe(false)
  })
})

describe('email uniqueness', () => {
  it('reports uniqueness and duplicates', () => {
    expect(isEmailUnique('new@operations-hub.dev', dataset.users)).toBe(true)
    const email = dataset.users[0]!.email
    expect(isEmailUnique(email, dataset.users)).toBe(false)
  })

  it('excludes the current user on edit', () => {
    const current = dataset.users[0]!
    expect(isEmailUnique(current.email, dataset.users, current.id)).toBe(true)
  })
})

describe('validateDataset', () => {
  it('accepts a valid minimal dataset', () => {
    expect(validateDataset(dataset)).toEqual([])
  })

  it('rejects a missing or non-string datasetVersion', () => {
    expect(validateDataset({ ...dataset, datasetVersion: '' })).toContain(
      'datasetVersion must be a non-empty string',
    )
    expect(validateDataset({ ...dataset, datasetVersion: 1 as never })).toContain(
      'datasetVersion must be a non-empty string',
    )
  })

  it('rejects non-array collections', () => {
    expect(validateDataset({ ...dataset, users: 'nope' as never })).toContain(
      'users must be an array',
    )
  })

  it('rejects duplicate ids within a collection', () => {
    const duplicated = { ...dataset, teams: [dataset.teams[0]!, dataset.teams[0]!] }
    expect(validateDataset(duplicated).some((issue) => issue.includes('duplicate id'))).toBe(true)
  })

  it('rejects ids that do not match the entity pattern', () => {
    const bad = { ...dataset, users: [makeUser('user-01')] }
    expect(validateDataset(bad).some((issue) => issue.includes('invalid id pattern'))).toBe(true)
  })

  it('rejects invalid enum values', () => {
    const badStatus = {
      ...dataset,
      projects: [makeProject('project-001', { status: 'paused' as never })],
    }
    expect(validateDataset(badStatus).some((issue) => issue.includes('invalid status'))).toBe(true)
    const badPriority = {
      ...dataset,
      tasks: [makeTask('task-001', { priority: 'urgent' as never })],
    }
    expect(validateDataset(badPriority).some((issue) => issue.includes('invalid priority'))).toBe(
      true,
    )
  })

  it('rejects invalid references (BR-1, BR-2, BR-3, BR-4)', () => {
    const orphan = {
      ...dataset,
      tasks: [makeTask('task-001', { projectId: 'project-999' })],
    }
    expect(validateDataset(orphan).some((issue) => issue.includes('BR-1'))).toBe(true)

    const badOwner = {
      ...dataset,
      projects: [makeProject('project-001', { ownerId: 'user-999' })],
    }
    expect(validateDataset(badOwner).some((issue) => issue.includes('BR-2'))).toBe(true)

    const badTeam = { ...dataset, users: [makeUser('user-001', { teamId: 'team-999' })] }
    expect(validateDataset(badTeam).some((issue) => issue.includes('BR-3'))).toBe(true)

    const badAssignee = {
      ...dataset,
      tasks: [makeTask('task-001', { assigneeId: 'user-999' })],
    }
    expect(validateDataset(badAssignee).some((issue) => issue.includes('BR-4'))).toBe(true)
  })

  it('rejects a project owner from a different team (BR-5)', () => {
    const users = [
      makeUser('user-001', { teamId: 'team-001' }),
      makeUser('user-003', { teamId: 'team-002' }),
    ]
    const projects = [makeProject('project-001', { ownerId: 'user-003', teamId: 'team-001' })]
    const bad = { ...dataset, users, projects }
    expect(validateDataset(bad).some((issue) => issue.includes('BR-5'))).toBe(true)
  })

  it('rejects timestamps where updatedAt is before createdAt', () => {
    const bad = {
      ...dataset,
      users: [
        makeUser('user-001', {
          createdAt: '2025-01-02T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
        }),
      ],
    }
    expect(validateDataset(bad).some((issue) => issue.includes('updatedAt >= createdAt'))).toBe(
      true,
    )
  })

  it('rejects a task created before its project', () => {
    const bad = {
      ...dataset,
      tasks: [makeTask('task-001', { createdAt: '2025-01-01T09:00:00Z' })], // project-001 created 01-02
    }
    expect(
      validateDataset(bad).some((issue) => issue.includes('must be created after its project')),
    ).toBe(true)
  })

  it('rejects a duplicate email', () => {
    const users = [
      makeUser('user-001', { email: 'same@operations-hub.dev' }),
      makeUser('user-002', { email: 'same@operations-hub.dev' }),
    ]
    expect(
      validateDataset({ ...dataset, users }).some((issue) => issue.includes('must be unique')),
    ).toBe(true)
  })

  it('returns early when users/teams are malformed', () => {
    const issues = validateDataset({ ...dataset, teams: 'nope' as never })
    expect(issues).toContain('teams must be an array')
  })
})
