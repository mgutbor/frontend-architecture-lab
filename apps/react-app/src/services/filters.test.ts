import { describe, expect, it } from 'vitest'
import { loadFixture } from '@operations-hub/domain'
import { filterProjects, filterTasks } from './filters'

const dataset = loadFixture()

describe('filterProjects', () => {
  it('returns all projects with no filters (asc by id from the fixture)', () => {
    const result = filterProjects(dataset.projects, { search: '', status: 'all' })
    expect(result.map((project) => project.id)).toEqual([
      'project-001',
      'project-002',
      'project-003',
      'project-004',
      'project-005',
      'project-006',
    ])
  })

  it('PRJ-SEARCH-2: matches case-insensitive substring on name', () => {
    const result = filterProjects(dataset.projects, { search: 'INCIDENT', status: 'all' })
    expect(result.map((project) => project.id)).toEqual(['project-001'])
  })

  it('PRJ-SEARCH-4: "report" finds project-003', () => {
    const result = filterProjects(dataset.projects, { search: 'report', status: 'all' })
    expect(result.map((project) => project.id)).toEqual(['project-003'])
  })

  it('PRJ-SEARCH-4: "zzzz" finds nothing', () => {
    expect(filterProjects(dataset.projects, { search: 'zzzz', status: 'all' })).toHaveLength(0)
  })

  it('PRJ-FILTER-2: active filter shows project-001, project-003, project-006', () => {
    const result = filterProjects(dataset.projects, { search: '', status: 'active' })
    expect(result.map((project) => project.id)).toEqual([
      'project-001',
      'project-003',
      'project-006',
    ])
  })

  it('PRJ-FILTER-3: completed filter shows project-002, project-005', () => {
    const result = filterProjects(dataset.projects, { search: '', status: 'completed' })
    expect(result.map((project) => project.id)).toEqual(['project-002', 'project-005'])
  })

  it('PRJ-FILTER-4: planned filter shows project-004', () => {
    const result = filterProjects(dataset.projects, { search: '', status: 'planned' })
    expect(result.map((project) => project.id)).toEqual(['project-004'])
  })

  it('PRJ-FILTER-5: search and status combine with AND', () => {
    const result = filterProjects(dataset.projects, { search: 'portal', status: 'active' })
    expect(result.map((project) => project.id)).toEqual(['project-001'])
    expect(
      filterProjects(dataset.projects, { search: 'portal', status: 'completed' }),
    ).toHaveLength(0)
  })
})

describe('filterTasks', () => {
  it('returns all 30 tasks with no filters', () => {
    expect(filterTasks(dataset.tasks, { search: '', status: 'all', priority: 'all' })).toHaveLength(
      30,
    )
  })

  it('filters by status', () => {
    const result = filterTasks(dataset.tasks, { search: '', status: 'completed', priority: 'all' })
    expect(result).toHaveLength(12)
  })

  it('filters by priority', () => {
    const result = filterTasks(dataset.tasks, { search: '', status: 'all', priority: 'high' })
    expect(result).toHaveLength(10)
  })

  it('TSK-LIST-2: combines status, priority and title search with AND', () => {
    const result = filterTasks(dataset.tasks, {
      search: 'incident',
      status: 'completed',
      priority: 'high',
    })
    // task-001/task-002 are completed high-priority with "incident" in the title.
    expect(result.map((task) => task.id)).toEqual(['task-001', 'task-002'])
    expect(
      filterTasks(dataset.tasks, { search: 'incident', status: 'todo', priority: 'high' }),
    ).toHaveLength(0)
  })

  it('TSK-LIST-3: a filter combination without matches returns empty', () => {
    expect(
      filterTasks(dataset.tasks, { search: 'zzzz', status: 'all', priority: 'all' }),
    ).toHaveLength(0)
  })
})
