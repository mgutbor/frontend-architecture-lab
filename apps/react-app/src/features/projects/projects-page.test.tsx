import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { loadFixture } from '@operations-hub/domain'
import type { DomainStore } from '../../services/domain-store'
import { createDomainStore } from '../../services/domain-store'
import { useDomainStore } from '../../hooks/use-domain-store'
import { ProjectsPage } from './projects-page'

// Harness that wires the store through the real hook, like App does.
function ProjectsHarness({ store }: { store: DomainStore }) {
  const state = useDomainStore(store)
  return <ProjectsPage state={state} />
}

function renderProjects() {
  const store = createDomainStore(loadFixture())
  render(<ProjectsHarness store={store} />)
  return store
}

describe('ProjectsPage', () => {
  it('offers only valid transitions for the selected project and applies them', async () => {
    const user = userEvent.setup()
    const store = renderProjects()

    await user.click(screen.getByRole('button', { name: /Incident Response Portal/ }))
    expect(screen.getByText('active', { selector: 'strong' })).toBeInTheDocument()

    const transitionButtons = screen.getAllByRole('button', { name: /→/ })
    expect(transitionButtons).toHaveLength(1)
    expect(transitionButtons[0]).toHaveTextContent('active → completed')

    await user.click(transitionButtons[0]!)
    expect(screen.getByText('completed', { selector: 'strong' })).toBeInTheDocument()
    const remaining = screen.getAllByRole('button', { name: /→/ })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toHaveTextContent('completed → active')

    // The store was updated through the domain state machine.
    const project = store.getSnapshot().projects.find((candidate) => candidate.id === 'project-001')
    expect(project?.status).toBe('completed')
  })

  it('does not offer invalid transitions for a completed project', async () => {
    const user = userEvent.setup()
    renderProjects()

    await user.click(screen.getByRole('button', { name: /Alerting Pipeline/ }))
    const transitionButtons = screen.getAllByRole('button', { name: /→/ })
    expect(transitionButtons).toHaveLength(1)
    expect(transitionButtons[0]).toHaveTextContent('completed → active')
  })
})
