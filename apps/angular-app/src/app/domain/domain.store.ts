import { Injectable, computed, inject, signal } from '@angular/core'
import { canTransitionProject, type Dataset, type ProjectStatus } from '@operations-hub/domain'
import { DomainDataAdapter } from './domain-data.adapter'

// Domain state holder. It keeps the dataset in a writable signal and exposes
// mutations that delegate the business rules to @operations-hub/domain
// (the state machine is never reimplemented here).
@Injectable({ providedIn: 'root' })
export class DomainStore {
  private readonly adapter = inject(DomainDataAdapter)
  private readonly state = signal<Dataset | null>(null)

  /** Read-only view of the current domain state. */
  readonly dataset = this.state.asReadonly()

  readonly isLoaded = computed(() => this.state() !== null)

  load(): void {
    this.state.set(this.adapter.load())
  }

  transitionProject(projectId: string, to: ProjectStatus): boolean {
    const current = this.state()
    if (current === null) {
      return false
    }
    const project = current.projects.find((candidate) => candidate.id === projectId)
    if (project === undefined || !canTransitionProject(project.status, to)) {
      return false
    }
    this.state.set({
      ...current,
      projects: current.projects.map((candidate) =>
        candidate.id === projectId ? { ...candidate, status: to } : candidate,
      ),
    })
    return true
  }
}
