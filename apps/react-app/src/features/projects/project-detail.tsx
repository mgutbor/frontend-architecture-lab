import {
  PROJECT_TRANSITIONS,
  type Project,
  type ProjectStatus,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type Team,
  type User,
} from '@operations-hub/domain'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { PriorityBadge } from '../../components/priority-badge'
import { TransitionButtons } from '../../components/transition-buttons'

export interface ProjectDetailProps {
  project: Project
  tasks: Task[]
  users: User[]
  teams: Team[]
  onTransition(to: ProjectStatus): void
  onEdit(): void
}

export function ProjectDetail({
  project,
  tasks,
  users,
  teams,
  onTransition,
  onEdit,
}: ProjectDetailProps) {
  const owner = users.find((user) => user.id === project.ownerId)
  const team = teams.find((candidate) => candidate.id === project.teamId)
  const targets = PROJECT_TRANSITIONS[project.status] ?? []

  return (
    <section className="project-detail" aria-label={`Project ${project.name}`}>
      <div className="list-row">
        <h2 className="grow">{project.name}</h2>
        <StatusBadge status={project.status} />
      </div>
      <p>{project.description ?? 'No description'}</p>
      <p>
        Owner: <strong>{owner?.name ?? project.ownerId}</strong> · Team:{' '}
        <strong>{team?.name ?? project.teamId}</strong>
      </p>

      <div className="list-row">
        <button type="button" onClick={onEdit}>
          Edit project
        </button>
        <span className="grow" />
      </div>

      <h3>Status</h3>
      <p>
        Current: <strong>{project.status}</strong>
      </p>
      <TransitionButtons from={project.status} targets={targets} onTransition={onTransition} />

      <h3>Tasks ({tasks.length})</h3>
      {tasks.length === 0 ? (
        <EmptyState message="This project has no tasks yet." />
      ) : (
        <ul className="list">
          {tasks.map((task: Task) => (
            <li key={task.id} className="list-row">
              <span className="grow">{task.title}</span>
              <TaskMeta status={task.status} priority={task.priority} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TaskMeta({ status, priority }: { status: TaskStatus; priority: TaskPriority }) {
  return (
    <>
      <StatusBadge status={status} />
      <PriorityBadge priority={priority} />
    </>
  )
}
