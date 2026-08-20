import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'

const AREAS = ['Dashboard', 'Projects', 'Teams', 'Tasks', 'Reports', 'Settings']

function renderApp() {
  render(<App />)
}

describe('App — navigation (NAV)', () => {
  it('offers persistent navigation to all 6 areas (NAV-1)', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const area of AREAS) {
      expect(within(nav).getByRole('button', { name: area })).toBeInTheDocument()
    }
  })

  it('marks the active area and switches views (NAV-2)', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Projects' })).not.toHaveAttribute('aria-current')

    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByText('30 of 30 tasks')).toBeInTheDocument()
  })

  it('uses semantic landmarks (ACC-5)', () => {
    renderApp()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})

describe('App — settings preference (SET)', () => {
  it('defaults to showing completed tasks (SET-1)', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(
      screen.getByRole('checkbox', { name: 'Show completed tasks in task lists' }),
    ).toBeChecked()
  })

  it('hides completed tasks immediately when disabled (SET-2)', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByText('30 of 30 tasks')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('checkbox', { name: 'Show completed tasks in task lists' }))

    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    // 12 completed tasks are hidden.
    expect(screen.getByText('18 of 30 tasks')).toBeInTheDocument()
    expect(screen.queryByText('Define incident severity levels')).not.toBeInTheDocument()
  })

  it('persists across views within the session (SET-3)', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('checkbox', { name: 'Show completed tasks in task lists' }))

    await user.click(screen.getByRole('button', { name: 'Projects' }))
    await user.click(screen.getByRole('button', { name: /Incident Response Portal/ }))
    // The project detail task list also hides completed tasks: project-001 has
    // 8 tasks, 2 completed -> 6 remain.
    expect(screen.getByText('Tasks (6)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByText('18 of 30 tasks')).toBeInTheDocument()
  })
})
