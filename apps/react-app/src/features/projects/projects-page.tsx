import { useMemo, useState } from 'react'
import type { ProjectInput, ProjectStatus } from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { filterProjects, type StatusFilter } from '../../services/filters'
import { EmptyState } from '../../components/empty-state'
import { Feedback } from '../../components/feedback'
import { StatusBadge } from '../../components/status-badge'
import { ProjectDetail } from './project-detail'
import { ProjectForm } from './project-form'

export interface ProjectsPageProps {
  state: DomainState
  showCompletedTasks: boolean
}

type ProjectMode = 'list' | 'create' | 'edit'

export function ProjectsPage({ state, showCompletedTasks }: ProjectsPageProps) {
  const { dataset } = state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ProjectMode>('list')
  const [feedback, setFeedback] = useState<string | null>(null)

  const filtered = useMemo(
    () => filterProjects(dataset.projects, { search, status: statusFilter }),
    [dataset.projects, search, statusFilter],
  )

  const selected = useMemo(
    () => dataset.projects.find((project) => project.id === selectedId) ?? null,
    [dataset.projects, selectedId],
  )

  const selectedTasks = useMemo(() => {
    if (selected === null) {
      return []
    }
    return dataset.tasks.filter(
      (task) =>
        task.projectId === selected.id && (showCompletedTasks || task.status !== 'completed'),
    )
  }, [dataset.tasks, selected, showCompletedTasks])

  const ownerName = (id: string): string => dataset.users.find((user) => user.id === id)?.name ?? id
  const teamName = (id: string): string => dataset.teams.find((team) => team.id === id)?.name ?? id

  const handleCreate = (input: ProjectInput): boolean => {
    const project = state.createProject(input)
    if (project !== null) {
      setSelectedId(project.id)
      setMode('list')
      setFeedback(`Project "${project.name}" created.`)
      return true
    }
    return false
  }

  const handleUpdate = (input: ProjectInput): boolean => {
    if (selected === null) {
      return false
    }
    const ok = state.updateProject(selected.id, input)
    if (ok) {
      setMode('list')
      setFeedback('Project updated.')
    }
    return ok
  }

  const handleTransition = (to: ProjectStatus): void => {
    if (selected !== null && state.transitionProject(selected.id, to)) {
      setFeedback(`Status changed to ${to}.`)
    }
  }

  return (
    <section aria-label="Projects">
      <div className="list-row">
        <h2 className="grow">Projects</h2>
        <button type="button" className="primary" onClick={() => setMode('create')}>
          New project
        </button>
      </div>

      {mode === 'create' || mode === 'edit' ? (
        <ProjectForm
          initial={mode === 'edit' && selected !== null ? selected : undefined}
          users={dataset.users}
          teams={dataset.teams}
          onSubmit={mode === 'create' ? handleCreate : handleUpdate}
          onCancel={() => setMode('list')}
        />
      ) : (
        <>
          <div className="toolbar">
            <div className="field">
              <label htmlFor="project-search">Search projects</label>
              <input
                id="project-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. incident"
              />
            </div>
            <div className="field">
              <label htmlFor="project-status-filter">Status</label>
              <select
                id="project-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">All</option>
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <p className="results-count" aria-live="polite">
            {filtered.length} of {dataset.projects.length} projects
          </p>

          <Feedback message={feedback} />

          {filtered.length === 0 ? (
            <EmptyState message="No projects match the current search and filters." />
          ) : (
            <ul className="list project-list">
              {filtered.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={project.id === selectedId ? 'selected project-row' : 'project-row'}
                    onClick={() => setSelectedId(project.id)}
                  >
                    <span className="project-name">{project.name}</span>
                    <span className="project-meta">
                      {project.status} · {ownerName(project.ownerId)} · {teamName(project.teamId)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected !== null ? (
            <ProjectDetail
              project={selected}
              tasks={selectedTasks}
              users={dataset.users}
              teams={dataset.teams}
              onTransition={handleTransition}
              onEdit={() => setMode('edit')}
            />
          ) : (
            <p className="empty-state">Select a project to see its details.</p>
          )}
        </>
      )}
    </section>
  )
}
