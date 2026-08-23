import { Component, computed, inject } from '@angular/core'
import { buildGlobalReport, type ProjectStatus } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'
import { KpiCardComponent } from '../../components/kpi-card.component'

const PROJECT_STATUSES: readonly ProjectStatus[] = ['planned', 'active', 'completed']

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [KpiCardComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly store = inject(DomainStore)

  // Derived state: the global report is computed by the domain package,
  // never reimplemented here (TR-7: deterministic values).
  readonly globalReport = computed(() => {
    const dataset = this.store.dataset()
    return dataset === null ? null : buildGlobalReport(dataset)
  })

  // DSH-1: projects by status (simple derived counts for display).
  readonly projectsByStatus = computed<Record<ProjectStatus, number>>(() => {
    const counts: Record<ProjectStatus, number> = { planned: 0, active: 0, completed: 0 }
    for (const project of this.store.dataset()?.projects ?? []) {
      counts[project.status] += 1
    }
    return counts
  })

  readonly statuses = PROJECT_STATUSES
}
