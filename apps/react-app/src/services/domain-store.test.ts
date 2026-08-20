import { describe, expect, it } from 'vitest'
import { loadFixture } from '@operations-hub/domain'
import { createDomainStore } from './domain-store'

describe('DomainStore', () => {
  it('starts from the canonical fixture', () => {
    const store = createDomainStore(loadFixture())
    expect(store.getSnapshot().tasks).toHaveLength(30)
    expect(store.getSnapshot().users).toHaveLength(8)
  })

  it('applies a valid project transition and notifies listeners', () => {
    const store = createDomainStore(loadFixture())
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })

    expect(store.transitionProject('project-001', 'completed')).toBe(true)
    const project = store.getSnapshot().projects.find((candidate) => candidate.id === 'project-001')
    expect(project?.status).toBe('completed')
    expect(notifications).toBe(1)

    unsubscribe()
  })

  it('rejects invalid transitions and leaves the dataset unchanged', () => {
    const store = createDomainStore(loadFixture())
    expect(store.transitionProject('project-002', 'planned')).toBe(false) // completed -> planned
    expect(store.transitionProject('project-004', 'completed')).toBe(false) // planned -> completed
    const project = store.getSnapshot().projects.find((candidate) => candidate.id === 'project-002')
    expect(project?.status).toBe('completed')
  })

  it('returns false for unknown projects', () => {
    const store = createDomainStore(loadFixture())
    expect(store.transitionProject('project-999', 'active')).toBe(false)
  })
})
