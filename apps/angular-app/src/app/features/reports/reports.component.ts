import { Component, computed, inject, signal } from '@angular/core'
import {
  buildGlobalReport,
  buildProjectReport,
  computeTaskCounts,
  type TaskPriority,
} from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'

@Component({
  selector: 'app-reports',
  standalone: true,
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  private readonly store = inject(DomainStore)

  // UI state: the selected project scope ('' = global).
  readonly projectId = signal('')

  readonly projects = computed(() => this.store.dataset()?.projects ?? [])
  readonly teams = computed(() => this.store.dataset()?.teams ?? [])

  // Derived state: reports are computed by the domain package, never here
  // (TR-7: deterministic values).
  readonly globalReport = computed(() => {
    const dataset = this.store.dataset()
    return dataset === null ? null : buildGlobalReport(dataset)
  })

  readonly projectReport = computed(() => {
    const dataset = this.store.dataset()
    if (dataset === null || this.projectId() === '') {
      return null
    }
    return buildProjectReport(dataset, this.projectId())
  })

  // RPT-TASK-1: scope for the task distribution (global or a single project).
  readonly scopedTasks = computed(() => {
    const dataset = this.store.dataset()
    if (dataset === null) {
      return []
    }
    if (this.projectId() === '') {
      return dataset.tasks
    }
    return dataset.tasks.filter((task) => task.projectId === this.projectId())
  })

  readonly statusCounts = computed(() => computeTaskCounts(this.scopedTasks()))

  readonly priorityCounts = computed<Record<TaskPriority, number>>(() => {
    const counts: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0 }
    for (const task of this.scopedTasks()) {
      counts[task.priority] += 1
    }
    return counts
  })

  formatRate(rate: number | null | undefined): string {
    return rate === null || rate === undefined ? 'n/a' : `${rate}%`
  }
}
