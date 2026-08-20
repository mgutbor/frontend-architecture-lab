// Pure presentation filters per the functional contract:
// - PRJ-SEARCH-2: project search by name, case-insensitive substring.
// - PRJ-FILTER-5 / TSK-LIST-2: search and filters combine with AND.
// These are UI concerns (how lists are filtered for display); the domain
// package owns the data and the business rules, not view filtering.

import type { Project, ProjectStatus, Task, TaskPriority, TaskStatus } from '@operations-hub/domain'

export type StatusFilter = ProjectStatus | 'all'
export type TaskStatusFilter = TaskStatus | 'all'
export type PriorityFilter = TaskPriority | 'all'

export interface ProjectFilters {
  search: string
  status: StatusFilter
}

export interface TaskFilters {
  search: string
  status: TaskStatusFilter
  priority: PriorityFilter
}

export function filterProjects(projects: readonly Project[], filters: ProjectFilters): Project[] {
  const term = filters.search.trim().toLowerCase()
  return projects.filter((project) => {
    const matchesSearch = term === '' || project.name.toLowerCase().includes(term)
    const matchesStatus = filters.status === 'all' || project.status === filters.status
    return matchesSearch && matchesStatus
  })
}

export function filterTasks(tasks: readonly Task[], filters: TaskFilters): Task[] {
  const term = filters.search.trim().toLowerCase()
  return tasks.filter((task) => {
    const matchesSearch = term === '' || task.title.toLowerCase().includes(term)
    const matchesStatus = filters.status === 'all' || task.status === filters.status
    const matchesPriority = filters.priority === 'all' || task.priority === filters.priority
    return matchesSearch && matchesStatus && matchesPriority
  })
}
