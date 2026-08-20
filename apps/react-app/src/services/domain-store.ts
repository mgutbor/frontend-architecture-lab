import { canTransitionProject, type Dataset, type ProjectStatus } from '@operations-hub/domain'

// Minimal external store (no library): holds the domain state and exposes
// mutations that delegate the business rules to @operations-hub/domain
// (the state machine is never reimplemented here).
export interface DomainStore {
  getSnapshot(): Dataset
  subscribe(listener: () => void): () => void
  transitionProject(projectId: string, to: ProjectStatus): boolean
}

export function createDomainStore(initial: Dataset): DomainStore {
  let dataset = initial
  const listeners = new Set<() => void>()

  const emit = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getSnapshot: () => dataset,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    transitionProject(projectId, to) {
      const project = dataset.projects.find((candidate) => candidate.id === projectId)
      if (project === undefined || !canTransitionProject(project.status, to)) {
        return false
      }
      dataset = {
        ...dataset,
        projects: dataset.projects.map((candidate) =>
          candidate.id === projectId ? { ...candidate, status: to } : candidate,
        ),
      }
      emit()
      return true
    },
  }
}
