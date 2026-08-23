import { Component, computed, inject, signal } from '@angular/core'
import { buildTeamReport, type User } from '@operations-hub/domain'
import { DomainStore } from '../../domain/domain.store'
import { FeedbackComponent } from '../../components/feedback.component'

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [FeedbackComponent],
  templateUrl: './teams.component.html',
})
export class TeamsComponent {
  private readonly store = inject(DomainStore)

  readonly teams = computed(() => this.store.dataset()?.teams ?? [])
  readonly users = computed(() => this.store.dataset()?.users ?? [])
  readonly projects = computed(() => this.store.dataset()?.projects ?? [])

  // UI state: which team is selected.
  readonly selectedId = signal<string | null>(null)
  readonly feedback = signal<string | null>(null)

  readonly selected = computed(() => {
    const id = this.selectedId()
    if (id === null) {
      return null
    }
    return this.teams().find((team) => team.id === id) ?? null
  })

  // Members and projects of the selected team (derived from the dataset).
  readonly members = computed<User[]>(() => {
    const team = this.selected()
    return team === null ? [] : this.users().filter((user) => user.teamId === team.id)
  })
  readonly teamProjects = computed(() => {
    const team = this.selected()
    return team === null ? [] : this.projects().filter((project) => project.teamId === team.id)
  })

  // Users that are NOT in the selected team can be added (BR-3: every user
  // already belongs to exactly one team, so "add" is an explicit reassignment).
  readonly addableUsers = computed<User[]>(() => {
    const team = this.selected()
    return team === null ? [] : this.users().filter((user) => user.teamId !== team.id)
  })
  readonly otherTeams = computed(() => {
    const team = this.selected()
    return team === null ? [] : this.teams().filter((candidate) => candidate.id !== team.id)
  })

  teamCounts(teamId: string): { members: number; projects: number } {
    const dataset = this.store.dataset()
    if (dataset === null) {
      return { members: 0, projects: 0 }
    }
    const report = buildTeamReport(dataset, teamId)
    return {
      members: report?.metrics.membersCount ?? 0,
      projects: report?.metrics.projectsCount ?? 0,
    }
  }

  handleAddMember(userId: string): void {
    const team = this.selected()
    if (team === null || userId === '' || !this.store.updateUserTeam(userId, team.id)) {
      return
    }
    const user = this.users().find((candidate) => candidate.id === userId)
    this.feedback.set(`${user?.name ?? userId} added to ${team.name}.`)
  }

  handleMoveMember(userId: string, targetTeamId: string): void {
    const user = this.users().find((candidate) => candidate.id === userId)
    const target = this.teams().find((candidate) => candidate.id === targetTeamId)
    if (
      user === undefined ||
      target === undefined ||
      !this.store.updateUserTeam(userId, targetTeamId)
    ) {
      return
    }
    // Explicit reassignment (BR-3): the user leaves the previous team and
    // joins the target one; never a teamless state.
    this.feedback.set(`${user.name} moved to ${target.name}.`)
  }
}
