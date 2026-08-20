import { describe, expect, it } from 'vitest'
import { FIXTURE_VERSION, loadFixture, validateDataset } from '../src/index'

const fixture = loadFixture()

function countBy<K extends string>(values: readonly K[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
}

describe('operations-hub-v1.json integrity (docs/architecture/dataset.md)', () => {
  it('has the documented version and sizes', () => {
    expect(fixture.datasetVersion).toBe('v1')
    expect(fixture.users).toHaveLength(8)
    expect(fixture.teams).toHaveLength(3)
    expect(fixture.projects).toHaveLength(6)
    expect(fixture.tasks).toHaveLength(30)
  })

  it('exposes the fixture version constant', () => {
    expect(FIXTURE_VERSION).toBe('v1')
  })

  it('passes full dataset validation (structure, enums, references, BR-1..BR-5)', () => {
    expect(validateDataset(fixture)).toEqual([])
  })

  it('uses unique deterministic ids matching the entity patterns', () => {
    const ids = [
      ...fixture.users.map((user) => user.id),
      ...fixture.teams.map((team) => team.id),
      ...fixture.projects.map((project) => project.id),
      ...fixture.tasks.map((task) => task.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    for (const user of fixture.users) {
      expect(user.id).toMatch(/^user-\d{3}$/)
    }
    for (const team of fixture.teams) {
      expect(team.id).toMatch(/^team-\d{3}$/)
    }
    for (const project of fixture.projects) {
      expect(project.id).toMatch(/^project-\d{3}$/)
    }
    for (const task of fixture.tasks) {
      expect(task.id).toMatch(/^task-\d{3}$/)
    }
  })
})

describe('dataset distributions (docs/architecture/dataset.md section 4.5)', () => {
  it('has the documented task status distribution', () => {
    expect(countBy(fixture.tasks.map((task) => task.status))).toEqual({
      completed: 12,
      'in-progress': 7,
      todo: 9,
      cancelled: 2,
    })
  })

  it('has the documented task priority distribution', () => {
    expect(countBy(fixture.tasks.map((task) => task.priority))).toEqual({
      high: 10,
      medium: 12,
      low: 8,
    })
  })

  it('has exactly the documented unassigned tasks', () => {
    const unassigned = fixture.tasks
      .filter((task) => task.assigneeId === null)
      .map((task) => task.id)
    expect(unassigned.sort()).toEqual(['task-007', 'task-020'])
  })

  it('has the documented per-project task counts', () => {
    const perProject = new Map<string, number>(fixture.projects.map((project) => [project.id, 0]))
    for (const task of fixture.tasks) {
      perProject.set(task.projectId, (perProject.get(task.projectId) ?? 0) + 1)
    }
    expect(perProject.get('project-001')).toBe(8)
    expect(perProject.get('project-002')).toBe(6)
    expect(perProject.get('project-003')).toBe(6)
    expect(perProject.get('project-004')).toBe(4)
    expect(perProject.get('project-005')).toBe(6)
    expect(perProject.get('project-006')).toBe(0)
  })

  it('has the documented project status distribution', () => {
    expect(countBy(fixture.projects.map((project) => project.status))).toEqual({
      active: 3,
      completed: 2,
      planned: 1,
    })
  })

  it('has the documented team sizes and project counts', () => {
    expect(fixture.users.filter((user) => user.teamId === 'team-001')).toHaveLength(3)
    expect(fixture.users.filter((user) => user.teamId === 'team-002')).toHaveLength(3)
    expect(fixture.users.filter((user) => user.teamId === 'team-003')).toHaveLength(2)
    expect(fixture.projects.filter((project) => project.teamId === 'team-001')).toHaveLength(2)
    expect(fixture.projects.filter((project) => project.teamId === 'team-002')).toHaveLength(2)
    expect(fixture.projects.filter((project) => project.teamId === 'team-003')).toHaveLength(2)
  })
})

describe('determinism and reproducibility', () => {
  it('returns the same data on every load', () => {
    const first = loadFixture()
    const second = loadFixture()
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('uses fixed ISO 8601 timestamps', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
    for (const record of [
      ...fixture.users,
      ...fixture.teams,
      ...fixture.projects,
      ...fixture.tasks,
    ]) {
      expect(record.createdAt).toMatch(isoPattern)
      expect(record.updatedAt).toMatch(isoPattern)
    }
  })
})
