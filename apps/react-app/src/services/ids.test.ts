import { describe, expect, it } from 'vitest'
import { nextEntityId } from './ids'

describe('nextEntityId', () => {
  it('returns the next id in the entity-NNN sequence', () => {
    expect(nextEntityId(['project-001', 'project-002'], 'project')).toBe('project-003')
  })

  it('pads the number to three digits', () => {
    expect(nextEntityId(['task-029', 'task-030'], 'task')).toBe('task-031')
    expect(nextEntityId(['user-008'], 'user')).toBe('user-009')
  })

  it('handles an empty collection', () => {
    expect(nextEntityId([], 'project')).toBe('project-001')
  })

  it('ignores ids that do not match the prefix', () => {
    expect(nextEntityId(['project-001', 'task-005', 'team-003'], 'project')).toBe('project-002')
  })

  it('works past three digits', () => {
    expect(nextEntityId(['task-999'], 'task')).toBe('task-1000')
  })
})
