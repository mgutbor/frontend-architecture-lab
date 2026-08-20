import { useSyncExternalStore } from 'react'
import type { Dataset, ProjectStatus } from '@operations-hub/domain'
import type { DomainStore } from '../services/domain-store'

export interface DomainState {
  dataset: Dataset
  transitionProject(projectId: string, to: ProjectStatus): boolean
}

export function useDomainStore(store: DomainStore): DomainState {
  const dataset = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { dataset, transitionProject: store.transitionProject }
}
