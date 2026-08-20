// Reports are derived concepts, computed from the current domain data.
// Source of truth: docs/architecture/domain-model.md section 3.5.
// Pure functions: they never mutate the dataset and never persist anything (BR-7).

import type { Dataset, Report, ReportMetrics, Task } from './types'

export interface TaskCounts {
  totalTasks: number
  todoTasks: number
  inProgressTasks: number
  completedTasks: number
  cancelledTasks: number
}

export function computeTaskCounts(tasks: Task[]): TaskCounts {
  const counts: TaskCounts = {
    totalTasks: tasks.length,
    todoTasks: 0,
    inProgressTasks: 0,
    completedTasks: 0,
    cancelledTasks: 0,
  }
  for (const task of tasks) {
    switch (task.status) {
      case 'todo':
        counts.todoTasks += 1
        break
      case 'in-progress':
        counts.inProgressTasks += 1
        break
      case 'completed':
        counts.completedTasks += 1
        break
      case 'cancelled':
        counts.cancelledTasks += 1
        break
    }
  }
  return counts
}

// completionRate = completedTasks / (totalTasks - cancelledTasks) * 100,
// rounded to one decimal. null when there are no actionable tasks
// (totalTasks - cancelledTasks === 0).
export function computeCompletionRate(
  completedTasks: number,
  totalTasks: number,
  cancelledTasks: number,
): number | null {
  const actionable = totalTasks - cancelledTasks
  if (actionable <= 0) {
    return null
  }
  return Math.round((completedTasks / actionable) * 1000) / 10
}

function countsToMetrics(counts: TaskCounts): ReportMetrics {
  return {
    ...counts,
    completionRate: computeCompletionRate(
      counts.completedTasks,
      counts.totalTasks,
      counts.cancelledTasks,
    ),
  }
}

function toReport(scope: Report['scope'], targetId: string | null, metrics: ReportMetrics): Report {
  return { scope, targetId, metrics }
}

export function buildGlobalReport(dataset: Dataset): Report {
  return toReport('global', null, countsToMetrics(computeTaskCounts(dataset.tasks)))
}

export function buildProjectReport(dataset: Dataset, projectId: string): Report | null {
  if (!dataset.projects.some((project) => project.id === projectId)) {
    return null
  }
  const tasks = dataset.tasks.filter((task) => task.projectId === projectId)
  return toReport('project', projectId, countsToMetrics(computeTaskCounts(tasks)))
}

export function buildTeamReport(dataset: Dataset, teamId: string): Report | null {
  if (!dataset.teams.some((team) => team.id === teamId)) {
    return null
  }
  const projectIds = new Set(
    dataset.projects.filter((project) => project.teamId === teamId).map((project) => project.id),
  )
  const tasks = dataset.tasks.filter((task) => projectIds.has(task.projectId))
  return toReport('team', teamId, {
    ...countsToMetrics(computeTaskCounts(tasks)),
    projectsCount: projectIds.size,
    membersCount: dataset.users.filter((user) => user.teamId === teamId).length,
  })
}
