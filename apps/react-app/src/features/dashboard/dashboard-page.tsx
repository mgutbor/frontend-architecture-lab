import { useMemo } from 'react'
import { buildGlobalReport, buildTeamReport } from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { KpiCard } from '../../components/kpi-card'

export function DashboardPage({ state }: { state: DomainState }) {
  const { dataset } = state

  // Derived state: reports are computed by the domain package, never here.
  const globalReport = useMemo(() => buildGlobalReport(dataset), [dataset])

  const teamRows = useMemo(
    () =>
      dataset.teams.map((team) => {
        const report = buildTeamReport(dataset, team.id)
        const rate = report?.metrics.completionRate
        return {
          id: team.id,
          name: team.name,
          completionRate: rate === null || rate === undefined ? 'n/a' : `${rate}%`,
          projects: report?.metrics.projectsCount ?? 0,
          members: report?.metrics.membersCount ?? 0,
        }
      }),
    [dataset],
  )

  const rate = globalReport.metrics.completionRate

  return (
    <div>
      <section className="kpis" aria-label="Global summary">
        <KpiCard label="Total tasks" value={globalReport.metrics.totalTasks} />
        <KpiCard label="Completed" value={globalReport.metrics.completedTasks} />
        <KpiCard label="In progress" value={globalReport.metrics.inProgressTasks} />
        <KpiCard label="Todo" value={globalReport.metrics.todoTasks} />
        <KpiCard label="Cancelled" value={globalReport.metrics.cancelledTasks} />
        <KpiCard label="Completion rate" value={rate === null ? 'n/a' : `${rate}%`} />
      </section>

      <section className="panels">
        <div>
          <h2>Projects ({dataset.projects.length})</h2>
          <ul>
            {dataset.projects.map((project) => (
              <li key={project.id}>
                {project.name} — {project.status}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2>Teams</h2>
          <ul>
            {teamRows.map((team) => (
              <li key={team.id}>
                {team.name} — {team.completionRate} ({team.projects} projects, {team.members}{' '}
                members)
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2>Tasks ({dataset.tasks.length})</h2>
          <ul>
            {dataset.tasks.map((task) => (
              <li key={task.id}>
                {task.title} — {task.status}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
