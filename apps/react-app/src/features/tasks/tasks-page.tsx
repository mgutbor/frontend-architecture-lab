import { useMemo, useState } from 'react'
import {
  TASK_TRANSITIONS,
  type Task,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
} from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { filterTasks, type PriorityFilter, type TaskStatusFilter } from '../../services/filters'
import { EmptyState } from '../../components/empty-state'
import { Feedback } from '../../components/feedback'
import { PriorityBadge } from '../../components/priority-badge'
import { StatusBadge } from '../../components/status-badge'
import { TransitionButtons } from '../../components/transition-buttons'
import { TaskForm } from './task-form'

export interface TasksPageProps {
  state: DomainState
  showCompletedTasks: boolean
}

type TaskMode = 'list' | 'create' | 'edit'

export function TasksPage({ state, showCompletedTasks }: TasksPageProps) {
  const { dataset } = state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [mode, setMode] = useState<TaskMode>('list')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const matches = filterTasks(dataset.tasks, {
      search,
      status: statusFilter,
      priority: priorityFilter,
    })
    // SET-2: the "show completed tasks" preference hides completed tasks from
    // the task lists immediately.
    return showCompletedTasks ? matches : matches.filter((task) => task.status !== 'completed')
  }, [dataset.tasks, search, statusFilter, priorityFilter, showCompletedTasks])

  const editingTask = useMemo(
    () => dataset.tasks.find((task) => task.id === editingTaskId) ?? null,
    [dataset.tasks, editingTaskId],
  )

  const projectName = (id: string): string =>
    dataset.projects.find((project) => project.id === id)?.name ?? id
  const userName = (id: string): string => dataset.users.find((user) => user.id === id)?.name ?? id

  const handleCreate = (input: TaskInput): boolean => {
    const task = state.createTask(input)
    if (task !== null) {
      setMode('list')
      setFeedback(`Task "${task.title}" created.`)
      return true
    }
    return false
  }

  const handleUpdate = (input: TaskInput): boolean => {
    if (editingTask === null) {
      return false
    }
    const ok = state.updateTask(editingTask.id, input)
    if (ok) {
      setMode('list')
      setEditingTaskId(null)
      setFeedback('Task updated.')
    }
    return ok
  }

  const handleTransition = (taskId: string, to: TaskStatus): void => {
    if (state.transitionTask(taskId, to)) {
      setFeedback(`Task moved to ${to}.`)
    }
  }

  const handleAssign = (taskId: string, assigneeId: string): void => {
    const ok = state.assignTask(taskId, assigneeId === '' ? null : assigneeId)
    if (ok) {
      setFeedback('Assignee updated.')
    }
  }

  return (
    <section aria-label="Tasks">
      <div className="list-row">
        <h2 className="grow">Tasks</h2>
        <button type="button" className="primary" onClick={() => setMode('create')}>
          New task
        </button>
      </div>

      {mode === 'create' || mode === 'edit' ? (
        <TaskForm
          initial={mode === 'edit' && editingTask !== null ? editingTask : undefined}
          users={dataset.users}
          projects={dataset.projects}
          onSubmit={mode === 'create' ? handleCreate : handleUpdate}
          onCancel={() => {
            setMode('list')
            setEditingTaskId(null)
          }}
        />
      ) : (
        <>
          <div className="toolbar">
            <div className="field">
              <label htmlFor="task-search">Search tasks</label>
              <input
                id="task-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. incident"
              />
            </div>
            <div className="field">
              <label htmlFor="task-status-filter">Status</label>
              <select
                id="task-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as TaskStatusFilter)}
              >
                <option value="all">All</option>
                <option value="todo">Todo</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-priority-filter">Priority</label>
              <select
                id="task-priority-filter"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <p className="results-count" aria-live="polite">
            {filtered.length} of {dataset.tasks.length} tasks
          </p>

          <Feedback message={feedback} />

          {filtered.length === 0 ? (
            <EmptyState message="No tasks match the current search and filters." />
          ) : (
            <ul className="list task-list">
              {filtered.map((task: Task) => (
                <li key={task.id}>
                  <div className="list-row">
                    <span className="grow">{task.title}</span>
                    <span className="task-project">{projectName(task.projectId)}</span>
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                    <span className="task-assignee">
                      {task.assigneeId === null ? 'Sin asignar' : userName(task.assigneeId)}
                    </span>
                  </div>
                  <div className="list-row">
                    <TransitionButtons
                      from={task.status}
                      targets={TASK_TRANSITIONS[task.status] ?? []}
                      onTransition={(to) => handleTransition(task.id, to)}
                    />
                    <select
                      className="assign-select"
                      aria-label={`Assignee for ${task.title}`}
                      value={task.assigneeId ?? ''}
                      onChange={(event) => handleAssign(task.id, event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {dataset.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="edit-task"
                      onClick={() => {
                        setEditingTaskId(task.id)
                        setMode('edit')
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
