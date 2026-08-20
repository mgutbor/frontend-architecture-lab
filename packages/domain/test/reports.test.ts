import { describe, expect, it } from 'vitest'
import {
  buildGlobalReport,
  buildProjectReport,
  buildTeamReport,
  computeCompletionRate,
  computeTaskCounts,
  loadFixture,
} from '../src/index'

// Expected values come from docs/architecture/dataset.md section 6.

describe('computeCompletionRate', () => {
  it('applies the documented formula rounded to one decimal', () => {
    expect(computeCompletionRate(12, 30, 2)).toBe(42.9)
    expect(computeCompletionRate(6, 6, 0)).toBe(100)
    expect(computeCompletionRate(8, 14, 1)).toBe(61.5)
    expect(computeCompletionRate(1, 10, 1)).toBe(11.1)
    expect(computeCompletionRate(2, 8, 1)).toBe(28.6)
    expect(computeCompletionRate(3, 6, 0)).toBe(50)
    expect(computeCompletionRate(1, 3, 0)).toBe(33.3)
  })

  it('returns 0 when no task was completed among actionable tasks', () => {
    expect(computeCompletionRate(0, 4, 1)).toBe(0)
  })

  it('returns null when there are no actionable tasks (denominator 0)', () => {
    expect(computeCompletionRate(0, 0, 0)).toBeNull()
    expect(computeCompletionRate(0, 3, 3)).toBeNull()
  })
})

describe('reports derived from the real fixture', () => {
  const dataset = loadFixture()

  it('computes the global report matching dataset.md section 6', () => {
    const report = buildGlobalReport(dataset)
    expect(report.scope).toBe('global')
    expect(report.targetId).toBeNull()
    expect(report.metrics).toEqual({
      totalTasks: 30,
      todoTasks: 9,
      inProgressTasks: 7,
      completedTasks: 12,
      cancelledTasks: 2,
      completionRate: 42.9,
    })
  })

  it('computes project reports matching dataset.md section 6', () => {
    expect(buildProjectReport(dataset, 'project-001')?.metrics).toMatchObject({
      totalTasks: 8,
      todoTasks: 3,
      inProgressTasks: 2,
      completedTasks: 2,
      cancelledTasks: 1,
      completionRate: 28.6,
    })
    expect(buildProjectReport(dataset, 'project-002')?.metrics).toMatchObject({
      totalTasks: 6,
      completedTasks: 6,
      completionRate: 100,
    })
    expect(buildProjectReport(dataset, 'project-003')?.metrics).toMatchObject({
      totalTasks: 6,
      completionRate: 16.7,
    })
    expect(buildProjectReport(dataset, 'project-004')?.metrics).toMatchObject({
      totalTasks: 4,
      cancelledTasks: 1,
      completionRate: 0,
    })
    expect(buildProjectReport(dataset, 'project-005')?.metrics).toMatchObject({
      totalTasks: 6,
      completedTasks: 3,
      completionRate: 50,
    })
  })

  it('returns n/a (null completion rate) for a project without tasks', () => {
    const report = buildProjectReport(dataset, 'project-006')
    expect(report?.metrics).toMatchObject({ totalTasks: 0, completionRate: null })
  })

  it('computes team reports matching dataset.md section 6', () => {
    expect(buildTeamReport(dataset, 'team-001')?.metrics).toEqual({
      totalTasks: 14,
      todoTasks: 3,
      inProgressTasks: 2,
      completedTasks: 8,
      cancelledTasks: 1,
      completionRate: 61.5,
      projectsCount: 2,
      membersCount: 3,
    })
    expect(buildTeamReport(dataset, 'team-002')?.metrics).toMatchObject({
      totalTasks: 10,
      completionRate: 11.1,
      projectsCount: 2,
      membersCount: 3,
    })
    expect(buildTeamReport(dataset, 'team-003')?.metrics).toMatchObject({
      totalTasks: 6,
      completionRate: 50,
      projectsCount: 2,
      membersCount: 2,
    })
  })

  it('returns null for unknown projects and teams', () => {
    expect(buildProjectReport(dataset, 'project-999')).toBeNull()
    expect(buildTeamReport(dataset, 'team-999')).toBeNull()
  })

  it('computes task counts for the full fixture', () => {
    expect(computeTaskCounts(dataset.tasks)).toEqual({
      totalTasks: 30,
      todoTasks: 9,
      inProgressTasks: 7,
      completedTasks: 12,
      cancelledTasks: 2,
    })
  })
})

describe('reports are pure (BR-7)', () => {
  it('does not mutate the dataset', () => {
    const dataset = loadFixture()
    const snapshot = JSON.stringify(dataset)

    buildGlobalReport(dataset)
    buildProjectReport(dataset, 'project-001')
    buildTeamReport(dataset, 'team-001')

    expect(JSON.stringify(dataset)).toBe(snapshot)
  })
})
