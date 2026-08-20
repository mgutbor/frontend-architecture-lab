import { describe, expect, it } from 'vitest'
import {
  canTransitionProject,
  canTransitionTask,
  PROJECT_TRANSITIONS,
  TASK_TRANSITIONS,
} from '../src/index'
import type { ProjectStatus, TaskStatus } from '../src/index'

describe('Project state machine (domain-model.md section 4.1)', () => {
  it('exposes exactly the documented transition map', () => {
    expect(PROJECT_TRANSITIONS).toEqual({
      planned: ['active'],
      active: ['completed'],
      completed: ['active'],
    })
  })

  it.each([
    ['planned', 'active'],
    ['active', 'completed'],
    ['completed', 'active'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionProject(from, to)).toBe(true)
  })

  it.each([
    ['planned', 'completed'],
    ['active', 'planned'],
    ['completed', 'planned'],
    ['planned', 'planned'],
    ['active', 'active'],
    ['completed', 'completed'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransitionProject(from, to)).toBe(false)
  })
})

describe('Task state machine (domain-model.md section 4.2)', () => {
  it('exposes exactly the documented transition map', () => {
    expect(TASK_TRANSITIONS).toEqual({
      todo: ['in-progress', 'cancelled'],
      'in-progress': ['todo', 'completed', 'cancelled'],
      completed: ['in-progress'],
      cancelled: ['todo'],
    })
  })

  it.each([
    ['todo', 'in-progress'],
    ['todo', 'cancelled'],
    ['in-progress', 'todo'],
    ['in-progress', 'completed'],
    ['in-progress', 'cancelled'],
    ['completed', 'in-progress'],
    ['cancelled', 'todo'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionTask(from, to)).toBe(true)
  })

  it.each([
    ['todo', 'completed'],
    ['completed', 'todo'],
    ['completed', 'cancelled'],
    ['cancelled', 'in-progress'],
    ['cancelled', 'completed'],
    ['todo', 'todo'],
    ['in-progress', 'in-progress'],
    ['completed', 'completed'],
    ['cancelled', 'cancelled'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransitionTask(from, to)).toBe(false)
  })
})

describe('state machines are deterministic and total', () => {
  it('defines a transition list for every documented status', () => {
    const projectStatuses: readonly ProjectStatus[] = ['planned', 'active', 'completed']
    const taskStatuses: readonly TaskStatus[] = ['todo', 'in-progress', 'completed', 'cancelled']
    for (const status of projectStatuses) {
      expect(PROJECT_TRANSITIONS[status]).toBeDefined()
    }
    for (const status of taskStatuses) {
      expect(TASK_TRANSITIONS[status]).toBeDefined()
    }
  })

  it('returns the same result for repeated calls', () => {
    expect(canTransitionTask('todo', 'in-progress')).toBe(canTransitionTask('todo', 'in-progress'))
    expect(canTransitionProject('completed', 'active')).toBe(
      canTransitionProject('completed', 'active'),
    )
  })
})
