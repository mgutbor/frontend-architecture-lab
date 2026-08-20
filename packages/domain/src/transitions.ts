// State machines for Project and Task.
// Source of truth: docs/architecture/domain-model.md section 4.
// Only the documented transitions are allowed; nothing else is added.

import type { ProjectStatus, TaskStatus } from './types'

// Project: planned -> active -> completed, with explicit reopen completed -> active.
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planned: ['active'],
  active: ['completed'],
  completed: ['active'],
}

// Task: linear flow with documented reopens and cancels.
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in-progress', 'cancelled'],
  'in-progress': ['todo', 'completed', 'cancelled'],
  completed: ['in-progress'],
  cancelled: ['todo'],
}

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return (PROJECT_TRANSITIONS[from] ?? []).includes(to)
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to)
}
