import { useMemo, useState, type FormEvent } from 'react'
import {
  PROJECT_TRANSITIONS,
  validateProjectInput,
  type FieldErrors,
  type Project,
  type ProjectInput,
  type ProjectStatus,
  type Team,
  type User,
} from '@operations-hub/domain'
import { Field } from '../../components/field'

export interface ProjectFormProps {
  /** Present in edit mode (PRJ-EDIT), absent in create mode (PRJ-CREATE). */
  initial?: Project
  users: User[]
  teams: Team[]
  /** Returns true when the store accepted the mutation. */
  onSubmit(input: ProjectInput): boolean
  onCancel(): void
}

export function ProjectForm({ initial, users, teams, onSubmit, onCancel }: ProjectFormProps) {
  const isEdit = initial !== undefined
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [teamId, setTeamId] = useState(initial?.teamId ?? '')
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? '')
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'planned')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Owner choices are limited to the users of the selected team (PRJ-CREATE-1).
  const ownerOptions = useMemo(
    () => users.filter((user) => user.teamId === teamId),
    [users, teamId],
  )

  // Edit mode offers the current status plus only its valid targets (PRJ-EDIT-3).
  const statusOptions = useMemo<ProjectStatus[]>(() => {
    if (initial === undefined) {
      return []
    }
    return [initial.status, ...(PROJECT_TRANSITIONS[initial.status] ?? [])]
  }, [initial])

  const handleTeamChange = (nextTeamId: string): void => {
    setTeamId(nextTeamId)
    // BR-5: the owner must belong to the project team; reset an owner that
    // does not belong to the newly selected team.
    const ownerInTeam = users.some((user) => user.id === ownerId && user.teamId === nextTeamId)
    if (!ownerInTeam) {
      setOwnerId('')
    }
  }

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
    const input: ProjectInput = {
      name,
      description: description || null,
      ownerId,
      teamId,
      ...(isEdit ? { status } : {}),
    }
    const validationErrors = validateProjectInput(
      input,
      { users, teams },
      isEdit ? initial.status : undefined,
    )
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setSubmitError(null)
      return
    }
    setErrors({})
    if (!onSubmit(input)) {
      setSubmitError('Could not save the project. Review the form and try again.')
    }
  }

  return (
    <form className="project-form" onSubmit={handleSubmit} noValidate>
      <h3>{isEdit ? 'Edit project' : 'New project'}</h3>

      <Field id="project-name" label="Name" errors={errors.name}>
        <input
          id="project-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            clearError('name')
          }}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name !== undefined ? 'project-name-error' : undefined}
        />
      </Field>

      <Field id="project-description" label="Description (optional)" errors={errors.description}>
        <textarea
          id="project-description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            clearError('description')
          }}
          aria-invalid={errors.description !== undefined}
          aria-describedby={
            errors.description !== undefined ? 'project-description-error' : undefined
          }
        />
      </Field>

      <Field id="project-team" label="Team" errors={errors.teamId}>
        <select
          id="project-team"
          value={teamId}
          onChange={(event) => {
            handleTeamChange(event.target.value)
            clearError('teamId')
          }}
          aria-invalid={errors.teamId !== undefined}
          aria-describedby={errors.teamId !== undefined ? 'project-team-error' : undefined}
        >
          <option value="">Select a team</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </Field>

      <Field id="project-owner" label="Owner" errors={errors.ownerId}>
        <select
          id="project-owner"
          value={ownerId}
          onChange={(event) => {
            setOwnerId(event.target.value)
            clearError('ownerId')
          }}
          aria-invalid={errors.ownerId !== undefined}
          aria-describedby={errors.ownerId !== undefined ? 'project-owner-error' : undefined}
        >
          <option value="">Select an owner</option>
          {ownerOptions.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </Field>

      {isEdit ? (
        <Field id="project-status" label="Status" errors={errors.status}>
          <select
            id="project-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProjectStatus)
              clearError('status')
            }}
            aria-invalid={errors.status !== undefined}
            aria-describedby={errors.status !== undefined ? 'project-status-error' : undefined}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {submitError !== null ? (
        <p className="feedback" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="primary">
          {isEdit ? 'Save changes' : 'Create project'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
