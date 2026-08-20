import { useState, type FormEvent } from 'react'
import {
  TASK_PRIORITIES,
  validateTaskInput,
  type FieldErrors,
  type Project,
  type Task,
  type TaskInput,
  type TaskPriority,
  type User,
} from '@operations-hub/domain'
import { Field } from '../../components/field'

export interface TaskFormProps {
  /** Present in edit mode (TSK-EDIT), absent in create mode (TSK-CREATE). */
  initial?: Task
  users: User[]
  projects: Project[]
  /** Returns true when the store accepted the mutation. */
  onSubmit(input: TaskInput): boolean
  onCancel(): void
}

export function TaskForm({ initial, users, projects, onSubmit, onCancel }: TaskFormProps) {
  const isEdit = initial !== undefined
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [projectId, setProjectId] = useState(initial?.projectId ?? '')
  // TSK-CREATE-1: priority defaults to medium for new tasks.
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium')
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const clearError = (field: string): void => {
    setErrors((current) => {
      if (current[field] === undefined) {
        return current
      }
      const next = { ...current }
      delete next[field]
      return next
    })
    setSubmitError(null)
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    const input: TaskInput = {
      title,
      description: description || null,
      priority,
      assigneeId: assigneeId === '' ? null : assigneeId,
      projectId,
    }
    const validationErrors = validateTaskInput(
      input,
      { users, projects },
      isEdit ? initial.status : undefined,
    )
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setSubmitError(null)
      return
    }
    setErrors({})
    if (!onSubmit(input)) {
      setSubmitError('Could not save the task. Review the form and try again.')
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <h3>{isEdit ? 'Edit task' : 'New task'}</h3>

      <Field id="task-title" label="Title" errors={errors.title}>
        <input
          id="task-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            clearError('title')
          }}
          aria-invalid={errors.title !== undefined}
          aria-describedby={errors.title !== undefined ? 'task-title-error' : undefined}
        />
      </Field>

      <Field id="task-description" label="Description (optional)" errors={errors.description}>
        <textarea
          id="task-description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            clearError('description')
          }}
          aria-invalid={errors.description !== undefined}
          aria-describedby={errors.description !== undefined ? 'task-description-error' : undefined}
        />
      </Field>

      {!isEdit ? (
        <Field id="task-project" label="Project" errors={errors.projectId}>
          <select
            id="task-project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              clearError('projectId')
            }}
            aria-invalid={errors.projectId !== undefined}
            aria-describedby={errors.projectId !== undefined ? 'task-project-error' : undefined}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field id="task-priority" label="Priority" errors={errors.priority}>
        <select
          id="task-priority"
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value as TaskPriority)
            clearError('priority')
          }}
          aria-invalid={errors.priority !== undefined}
          aria-describedby={errors.priority !== undefined ? 'task-priority-error' : undefined}
        >
          {TASK_PRIORITIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>

      <Field id="task-assignee" label="Assignee (optional)" errors={errors.assigneeId}>
        <select
          id="task-assignee"
          value={assigneeId}
          onChange={(event) => {
            setAssigneeId(event.target.value)
            clearError('assigneeId')
          }}
          aria-invalid={errors.assigneeId !== undefined}
          aria-describedby={errors.assigneeId !== undefined ? 'task-assignee-error' : undefined}
        >
          <option value="">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </Field>

      {submitError !== null ? (
        <p className="feedback" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="primary">
          {isEdit ? 'Save changes' : 'Create task'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
