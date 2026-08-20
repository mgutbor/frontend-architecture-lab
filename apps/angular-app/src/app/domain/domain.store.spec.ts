import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { DomainStore } from './domain.store'

describe('DomainStore', () => {
  let store: DomainStore

  beforeEach(() => {
    TestBed.configureTestingModule({})
    store = TestBed.inject(DomainStore)
  })

  it('loads the canonical fixture through the adapter', () => {
    store.load()
    const dataset = store.dataset()
    expect(dataset?.users).toHaveLength(8)
    expect(dataset?.teams).toHaveLength(3)
    expect(dataset?.projects).toHaveLength(6)
    expect(dataset?.tasks).toHaveLength(30)
    expect(store.isLoaded()).toBe(true)
  })

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
