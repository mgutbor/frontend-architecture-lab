import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { loadFixture } from '@operations-hub/domain'
import { createDomainStore } from '../../services/domain-store'
import { DashboardPage } from './dashboard-page'

function renderDashboard() {
  const store = createDomainStore(loadFixture())
  render(
    <DashboardPage
      state={{ dataset: store.getSnapshot(), transitionProject: store.transitionProject }}
    />,
  )
}

describe('DashboardPage', () => {
  it('renders the global report derived from the domain', () => {
    renderDashboard()
    expect(screen.getByText('Total tasks')).toBeInTheDocument()
    expect(screen.getByText('42.9%')).toBeInTheDocument()
    expect(screen.getAllByText('30').length).toBeGreaterThan(0)
  })

  it('renders projects, teams and tasks from the fixture', () => {
    renderDashboard()
    expect(screen.getByText(/Incident Response Portal/)).toBeInTheDocument()
    expect(screen.getByText(/Core Platform/)).toBeInTheDocument()
    expect(screen.getByText(/61\.5%/)).toBeInTheDocument()
    expect(screen.getByText(/Write incident documentation/)).toBeInTheDocument()
  })
})
