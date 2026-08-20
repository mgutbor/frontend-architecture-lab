import { useMemo, useState } from 'react'
import { buildTeamReport, type Team, type User } from '@operations-hub/domain'
import type { DomainState } from '../../hooks/use-domain-store'
import { Feedback } from '../../components/feedback'

export interface TeamsPageProps {
  state: DomainState
}

export function TeamsPage({ state }: TeamsPageProps) {
  const { dataset } = state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const selected = useMemo(
    () => dataset.teams.find((team) => team.id === selectedId) ?? null,
    [dataset.teams, selectedId],
  )

  // Members and projects of the selected team (derived from the dataset).
  const members = useMemo(
    () => (selected ? dataset.users.filter((user) => user.teamId === selected.id) : []),
    [dataset.users, selected],
  )
  const teamProjects = useMemo(
    () => (selected ? dataset.projects.filter((project) => project.teamId === selected.id) : []),
    [dataset.projects, selected],
  )

  // Users that are NOT in the selected team can be added (BR-3: every user
  // already belongs to exactly one team, so "add" is an explicit reassignment).
  const addableUsers = useMemo(
    () => (selected ? dataset.users.filter((user) => user.teamId !== selected.id) : []),
    [dataset.users, selected],
  )
  const otherTeams = useMemo(
    () => (selected ? dataset.teams.filter((team) => team.id !== selected.id) : []),
    [dataset.teams, selected],
  )

  const teamCounts = (team: Team): { members: number; projects: number } => {
    const report = buildTeamReport(dataset, team.id)
    return {
      members: report?.metrics.membersCount ?? 0,
      projects: report?.metrics.projectsCount ?? 0,
    }
  }

  const handleAddMember = (userId: string): void => {
    if (selected !== null && userId !== '' && state.updateUserTeam(userId, selected.id)) {
      const user = dataset.users.find((candidate) => candidate.id === userId)
      setFeedback(`${user?.name ?? userId} added to ${selected.name}.`)
    }
  }

  const handleMoveMember = (userId: string, targetTeamId: string): void => {
    const user = dataset.users.find((candidate) => candidate.id === userId)
    const target = dataset.teams.find((team) => team.id === targetTeamId)
    if (user !== undefined && target !== undefined && state.updateUserTeam(userId, targetTeamId)) {
      // Explicit reassignment (BR-3): the user leaves the previous team and
      // joins the selected one; never a teamless state.
      setFeedback(`${user.name} moved to ${target.name}.`)
    }
  }

  return (
    <section aria-label="Teams">
      <h2>Teams</h2>
      <Feedback message={feedback} />

      <ul className="list team-list">
        {dataset.teams.map((team) => {
          const counts = teamCounts(team)
          return (
            <li key={team.id}>
              <button
                type="button"
                className={team.id === selectedId ? 'selected team-row' : 'team-row'}
                onClick={() => setSelectedId(team.id)}
              >
                <span className="team-name">{team.name}</span>
                <span className="team-meta">
                  {counts.members} members · {counts.projects} projects
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {selected !== null ? (
        <section className="team-detail" aria-label={`Team ${selected.name}`}>
          <h3>{selected.name}</h3>
          <p>{selected.description ?? 'No description'}</p>

          <h4>Members ({members.length})</h4>
          <ul className="list">
            {members.map((user: User) => (
              <li key={user.id} className="list-row">
                <span className="grow">{user.name}</span>
                <label htmlFor={`move-${user.id}`} className="move-label">
                  Move to
                </label>
                <select
                  id={`move-${user.id}`}
                  aria-label={`Move ${user.name} to team`}
                  value=""
                  onChange={(event) => handleMoveMember(user.id, event.target.value)}
                >
                  <option value="" disabled>
                    Select team…
                  </option>
                  {otherTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          <h4>Projects ({teamProjects.length})</h4>
          <ul className="list">
            {teamProjects.map((project) => (
              <li key={project.id}>
                {project.name} — {project.status}
              </li>
            ))}
          </ul>

          <h4>Add member</h4>
          <div className="field">
            <label htmlFor="add-member">Add member</label>
            <select
              id="add-member"
              value=""
              onChange={(event) => handleAddMember(event.target.value)}
            >
              <option value="" disabled>
                Select a user…
              </option>
              {addableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : (
        <p className="empty-state">Select a team to see its members and projects.</p>
      )}
    </section>
  )
}
