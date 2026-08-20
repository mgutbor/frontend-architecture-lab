import { useMemo, useState } from 'react'
import {
  buildGlobalReport,
  buildProjectReport,
  computeTaskCounts,
  type TaskPriority,
} from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'

export interface ReportsPageProps {
  state: DomainState
}

interface MetricRow {
  label: string
  value: string | number
}

function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? 'n/a' : `${rate}%`
}

function MetricTable({ caption, rows }: { caption: string; rows: MetricRow[] }) {
  return (
    <table className="metric-table">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function priorityCounts(tasks: { priority: TaskPriority }[]): Record<TaskPriority, number> {
  return tasks.reduce<Record<TaskPriority, number>>(
    (acc, task) => {
      acc[task.priority] += 1
      return acc
    },
    { low: 0, medium: 0, high: 0 },
  )
}

export function ReportsPage({ state }: ReportsPageProps) {
  const { dataset } = state
  const [projectId, setProjectId] = useState('')

  const globalReport = useMemo(() => buildGlobalReport(dataset), [dataset])

  const projectReport = useMemo(() => {
    if (projectId === '') {
      return null
    }
    return buildProjectReport(dataset, projectId)
  }, [dataset, projectId])

  // RPT-TASK-1: scope for the task distribution (global or a single project).
  const scopedTasks = useMemo(() => {
    if (projectId === '') {
      return dataset.tasks
    }
    return dataset.tasks.filter((task) => task.projectId === projectId)
  }, [dataset.tasks, projectId])

  const statusCounts = useMemo(() => computeTaskCounts(scopedTasks), [scopedTasks])
  const priorityCountsByScope = useMemo(() => priorityCounts(scopedTasks), [scopedTasks])

  const globalMetrics = globalReport.metrics

  return (
    <section aria-label="Reports">
      <h2>Reports</h2>

      <h3>Global summary</h3>
      <MetricTable
        caption="Global task summary"
        rows={[
          { label: 'Total tasks', value: globalMetrics.totalTasks },
          { label: 'Completed', value: globalMetrics.completedTasks },
          { label: 'In progress', value: globalMetrics.inProgressTasks },
          { label: 'Todo', value: globalMetrics.todoTasks },
          { label: 'Cancelled', value: globalMetrics.cancelledTasks },
          { label: 'Completion rate', value: formatRate(globalMetrics.completionRate) },
          { label: 'Projects', value: dataset.projects.length },
          { label: 'Teams', value: dataset.teams.length },
        ]}
      />

      <h3>By project</h3>
      <div className="field">
        <label htmlFor="report-project">Project</label>
        <select
          id="report-project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">Select a project</option>
          {dataset.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      {projectReport !== null ? (
        <MetricTable
          caption={`Metrics for ${projectReport.targetId}`}
          rows={[
            { label: 'Total tasks', value: projectReport.metrics.totalTasks },
            { label: 'Completed', value: projectReport.metrics.completedTasks },
            { label: 'In progress', value: projectReport.metrics.inProgressTasks },
            { label: 'Todo', value: projectReport.metrics.todoTasks },
            { label: 'Cancelled', value: projectReport.metrics.cancelledTasks },
            { label: 'Completion rate', value: formatRate(projectReport.metrics.completionRate) },
          ]}
        />
      ) : (
        <p className="empty-state">Select a project to see its metrics.</p>
      )}

      <h3>Task metrics</h3>
      <div className="panels">
        <MetricTable
          caption="Distribution by status"
          rows={[
            { label: 'Todo', value: statusCounts.todoTasks },
            { label: 'In progress', value: statusCounts.inProgressTasks },
            { label: 'Completed', value: statusCounts.completedTasks },
            { label: 'Cancelled', value: statusCounts.cancelledTasks },
            { label: 'Total', value: statusCounts.totalTasks },
          ]}
        />
        <MetricTable
          caption="Distribution by priority"
          rows={[
            { label: 'High', value: priorityCountsByScope.high },
            { label: 'Medium', value: priorityCountsByScope.medium },
            { label: 'Low', value: priorityCountsByScope.low },
          ]}
        />
      </div>
    </section>
  )
}
