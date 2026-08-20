import { useMemo } from 'react'
import { buildGlobalReport, type ProjectStatus } from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { KpiCard } from '../../components/kpi-card'

const PROJECT_STATUSES: readonly ProjectStatus[] = ['planned', 'active', 'completed']

export function DashboardPage({ state }: { state: DomainState }) {
  const { dataset } = state

  // Derived state: the global report is computed by the domain package,
  // never reimplemented here (TR-7: deterministic values).
  const globalReport = useMemo(() => buildGlobalReport(dataset), [dataset])
  const rate = globalReport.metrics.completionRate

  // DSH-1: projects by status (simple derived counts for display).
  const projectsByStatus = useMemo(() => {
    const counts: Record<ProjectStatus, number> = { planned: 0, active: 0, completed: 0 }
    for (const project of dataset.projects) {
      counts[project.status] += 1
    }
    return counts
  }, [dataset.projects])

  return (
    <div>
      <h2>Operational summary</h2>

      <section className="kpis" aria-label="Global task summary">
        <KpiCard label="Total tasks" value={globalReport.metrics.totalTasks} />
        <KpiCard label="Completed" value={globalReport.metrics.completedTasks} />
        <KpiCard label="In progress" value={globalReport.metrics.inProgressTasks} />
        <KpiCard label="Todo" value={globalReport.metrics.todoTasks} />
        <KpiCard label="Cancelled" value={globalReport.metrics.cancelledTasks} />
        <KpiCard label="Completion rate" value={rate === null ? 'n/a' : `${rate}%`} />
      </section>

      <section className="panels" aria-label="Projects by status">
        <div>
          <h3>Projects by status</h3>
          <ul className="list">
            {PROJECT_STATUSES.map((status) => (
              <li key={status} className="list-row">
                <span className="grow">{status}</span>
                <strong>{projectsByStatus[status]}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
