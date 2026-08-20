import { useSyncExternalStore } from 'react'
import type {
  Dataset,
  Project,
  ProjectInput,
  ProjectStatus,
  Task,
  TaskInput,
  TaskStatus,
} from '@operations-hub/domain'
import type { DomainStore } from '../services/domain-store'

export interface DomainState {
  dataset: Dataset
  transitionProject(projectId: string, to: ProjectStatus): boolean
  createProject(input: ProjectInput): Project | null
  updateProject(projectId: string, input: ProjectInput): boolean
  transitionTask(taskId: string, to: TaskStatus): boolean
  createTask(input: TaskInput): Task | null
  updateTask(taskId: string, input: TaskInput): boolean
  assignTask(taskId: string, assigneeId: string | null): boolean
  updateUserTeam(userId: string, teamId: string): boolean
}

export function useDomainStore(store: DomainStore): DomainState {
  const dataset = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return {
    dataset,
    transitionProject: store.transitionProject,
    createProject: store.createProject,
    updateProject: store.updateProject,
    transitionTask: store.transitionTask,
    createTask: store.createTask,
    updateTask: store.updateTask,
    assignTask: store.assignTask,
    updateUserTeam: store.updateUserTeam,
  }
}
