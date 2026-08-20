import { Component, computed, inject } from '@angular/core'
import { buildGlobalReport, buildTeamReport } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'
import { KpiCardComponent } from '../../components/kpi-card.component'

export interface TeamRow {
  id: string
  name: string
  completionRate: string
  projects: number
  members: number
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [KpiCardComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly store = inject(DomainStore)

  // Derived state: reports are computed by the domain package, never here.
  readonly globalReport = computed(() => {
    const dataset = this.store.dataset()
    return dataset === null ? null : buildGlobalReport(dataset)
  })

  readonly projects = computed(() => this.store.dataset()?.projects ?? [])

  readonly tasks = computed(() => this.store.dataset()?.tasks ?? [])

  readonly teamRows = computed<TeamRow[]>(() => {
    const dataset = this.store.dataset()
    if (dataset === null) {
      return []
    }
    return dataset.teams.map((team) => {
      const report = buildTeamReport(dataset, team.id)
      const rate = report?.metrics.completionRate
      return {
        id: team.id,
        name: team.name,
        completionRate: rate === null || rate === undefined ? 'n/a' : `${rate}%`,
        projects: report?.metrics.projectsCount ?? 0,
        members: report?.metrics.membersCount ?? 0,
      }
    })
  })
}
