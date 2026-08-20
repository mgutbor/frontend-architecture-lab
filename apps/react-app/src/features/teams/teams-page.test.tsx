import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { loadFixture } from '@operations-hub/domain'
import type { DomainStore } from '../../services/domain-store'
import { createDomainStore } from '../../services/domain-store'
import { useDomainStore } from '../../hooks/use-domain-store'
import { TeamsPage } from './teams-page'

function TeamsHarness({ store }: { store: DomainStore }) {
  const state = useDomainStore(store)
  return <TeamsPage state={state} />
}

function renderTeams() {
  const store = createDomainStore(loadFixture())
  render(<TeamsHarness store={store} />)
  return store
}

describe('TeamsPage — list (TEA-LIST)', () => {
  it('lists the 3 teams with derived member and project counts (TEA-LIST-1/2)', () => {
    renderTeams()
    const corePlatform = screen.getByRole('button', { name: /Core Platform/ })
    expect(corePlatform).toHaveTextContent('3 members · 2 projects')
    const dataInsights = screen.getByRole('button', { name: /Data Insights/ })
    expect(dataInsights).toHaveTextContent('3 members · 2 projects')
    const customerSuccess = screen.getByRole('button', { name: /Customer Success/ })
    expect(customerSuccess).toHaveTextContent('2 members · 2 projects')
  })
})

describe('TeamsPage — detail (TEA-VIEW)', () => {
  it('shows the members and projects of the selected team', async () => {
    const user = userEvent.setup()
    renderTeams()

    await user.click(screen.getByRole('button', { name: /Customer Success/ }))
    expect(screen.getByText('Barbara Liskov')).toBeInTheDocument()
    expect(screen.getByText('Linus Torvalds')).toBeInTheDocument()
    expect(screen.getByText(/Customer Onboarding/)).toBeInTheDocument()
    expect(screen.getByText(/Legacy Migration/)).toBeInTheDocument()
  })
})

describe('TeamsPage — member assignment (TEA-ASSIGN, BR-3)', () => {
  it('adds a member from the existing users and updates the counters (TEA-ASSIGN-1/4)', async () => {
    const user = userEvent.setup()
    const store = renderTeams()

    await user.click(screen.getByRole('button', { name: /Customer Success/ }))
    // Users outside team-003 can be added.
    await user.selectOptions(screen.getByLabelText('Add member'), 'user-001')

    const moved = store.getSnapshot().users.find((u) => u.id === 'user-001')
    expect(moved?.teamId).toBe('team-003')

    // Counters update: team-003 now has 3 members.
    const customerSuccess = screen.getByRole('button', { name: /Customer Success/ })
    expect(customerSuccess).toHaveTextContent('3 members · 2 projects')
    expect(screen.getByText(/Ada Lovelace added to Customer Success/)).toBeInTheDocument()
  })

  it('moves a member to another team explicitly, never leaving them teamless (TEA-ASSIGN-2/3)', async () => {
    const user = userEvent.setup()
    const store = renderTeams()

    await user.click(screen.getByRole('button', { name: /Customer Success/ }))
    // Barbara Liskov (user-007) belongs to team-003.
    const memberRow = screen.getByText('Barbara Liskov').closest('li')!
    await user.selectOptions(
      within(memberRow).getByRole('combobox', { name: 'Move Barbara Liskov to team' }),
      'team-001',
    )

    const moved = store.getSnapshot().users.find((u) => u.id === 'user-007')
    expect(moved?.teamId).toBe('team-001')
    expect(screen.getByText(/Barbara Liskov moved to Core Platform/)).toBeInTheDocument()
    // Her member row (with its move control) is gone; her old team loses a member.
    expect(
      screen.queryByRole('combobox', { name: 'Move Barbara Liskov to team' }),
    ).not.toBeInTheDocument()
    const customerSuccess = screen.getByRole('button', { name: /Customer Success/ })
    expect(customerSuccess).toHaveTextContent('1 members · 2 projects')
  })
})
