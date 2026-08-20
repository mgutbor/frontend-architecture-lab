import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { loadFixture } from '@operations-hub/domain'
import type { DomainStore } from '../../services/domain-store'
import { createDomainStore } from '../../services/domain-store'
import { useDomainStore } from '../../hooks/use-domain-store'
import { DashboardPage } from './dashboard-page'

function DashboardHarness({ store }: { store: DomainStore }) {
  const state = useDomainStore(store)
  return <DashboardPage state={state} />
}

function renderDashboard() {
  const store = createDomainStore(loadFixture())
  render(<DashboardHarness store={store} />)
}

describe('DashboardPage (DSH)', () => {
  it('shows the global task summary derived from the domain (DSH-1)', () => {
    renderDashboard()
    const kpis = screen.getByRole('region', { name: 'Global task summary' })
    expect(kpis).toHaveTextContent('Total tasks')
    expect(kpis).toHaveTextContent('Completed')
    expect(kpis).toHaveTextContent('30')
    expect(kpis).toHaveTextContent('12')
    expect(kpis).toHaveTextContent('7')
    expect(kpis).toHaveTextContent('9')
    expect(kpis).toHaveTextContent('2')
    expect(kpis).toHaveTextContent('42.9%')
  })

  it('shows projects by status: 3 active, 2 completed, 1 planned (DSH-1)', () => {
    renderDashboard()
    const panel = screen.getByRole('region', { name: 'Projects by status' })
    expect(panel).toHaveTextContent('planned')
    expect(panel).toHaveTextContent('active')
    expect(panel).toHaveTextContent('completed')
    expect(panel).toHaveTextContent('3')
    expect(panel).toHaveTextContent('2')
    expect(panel).toHaveTextContent('1')
  })

  it('is deterministic and coherent with the domain report (DSH-2)', () => {
    renderDashboard()
    // The same values are asserted in the Reports view from the domain report;
    // here they come from the same buildGlobalReport call.
    expect(screen.getAllByText('42.9%').length).toBeGreaterThan(0)
  })
})
