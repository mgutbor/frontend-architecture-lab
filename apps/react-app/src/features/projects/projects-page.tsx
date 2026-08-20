import { useMemo, useState } from 'react'
import { PROJECT_TRANSITIONS, type ProjectStatus } from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { TransitionButtons } from '../../components/transition-buttons'

export function ProjectsPage({ state }: { state: DomainState }) {
  const { dataset, transitionProject } = state

  // UI state: which project is selected. Domain state lives in the store.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => dataset.projects.find((project) => project.id === selectedId) ?? null,
    [dataset, selectedId],
  )

  // The valid targets come from the domain state machine, never from the UI.
  const targets = selected ? (PROJECT_TRANSITIONS[selected.status] ?? []) : []

  const selectedTasks = useMemo(
    () => (selected ? dataset.tasks.filter((task) => task.projectId === selected.id) : []),
    [dataset, selected],
  )

  const userName = (id: string): string => dataset.users.find((user) => user.id === id)?.name ?? id
  const teamName = (id: string): string => dataset.teams.find((team) => team.id === id)?.name ?? id

  return (
    <div className="projects-layout">
      <ul className="project-list">
        {dataset.projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              className={project.id === selectedId ? 'selected' : undefined}
              onClick={() => setSelectedId(project.id)}
            >
              {project.name} ({project.status})
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <section className="project-detail">
          <h2>{selected.name}</h2>
          <p>
            Status: <strong>{selected.status}</strong>
          </p>
          <p>
            Owner: {userName(selected.ownerId)} · Team: {teamName(selected.teamId)}
          </p>

          <h3>Valid transitions</h3>
          <TransitionButtons
            from={selected.status}
            targets={targets}
            onTransition={(to) => transitionProject(selected.id, to)}
          />

          <h3>Tasks ({selectedTasks.length})</h3>
          <ul>
            {selectedTasks.map((task) => (
              <li key={task.id}>
                {task.title} — {task.status} — {task.priority}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p>Select a project to see its state and its valid transitions.</p>
      )}
    </div>
  )
}
