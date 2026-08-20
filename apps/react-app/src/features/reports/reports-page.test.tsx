import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { loadFixture } from '@operations-hub/domain'
import type { DomainStore } from '../../services/domain-store'
import { createDomainStore } from '../../services/domain-store'
import { useDomainStore } from '../../hooks/use-domain-store'
import { ReportsPage } from './reports-page'

function ReportsHarness({ store }: { store: DomainStore }) {
  const state = useDomainStore(store)
  return <ReportsPage state={state} />
}

function renderReports() {
  const store = createDomainStore(loadFixture())
  render(<ReportsHarness store={store} />)
  return store
}

function tableRows(caption: string): Record<string, string | undefined> {
  const table = screen.getByRole('table', { name: caption })
  return Object.fromEntries(
    within(table)
      .getAllByRole('row')
      .map((row) => {
        const cells = within(row).getAllByRole('cell')
        const head = within(row).getByRole('rowheader')
        return [head.textContent, cells[0]?.textContent]
      }),
  )
}

describe('ReportsPage — global summary (RPT-SUMMARY)', () => {
  it('shows the deterministic global values (RPT-SUMMARY-1/2)', () => {
    renderReports()
    const rows = tableRows('Global task summary')
    expect(rows['Total tasks']).toBe('30')
    expect(rows['Completed']).toBe('12')
    expect(rows['In progress']).toBe('7')
    expect(rows['Todo']).toBe('9')
    expect(rows['Cancelled']).toBe('2')
    expect(rows['Completion rate']).toBe('42.9%')
    expect(rows['Projects']).toBe('6')
    expect(rows['Teams']).toBe('3')
  })
})

describe('ReportsPage — by project (RPT-PROJECT)', () => {
  it('shows project-002 at 100% and project-006 as n/a (RPT-PROJECT-1)', async () => {
    const user = userEvent.setup()
    renderReports()

    await user.selectOptions(screen.getByLabelText('Project'), 'project-002')
    let rows = tableRows('Metrics for project-002')
    expect(rows['Total tasks']).toBe('6')
    expect(rows['Completed']).toBe('6')
    expect(rows['Completion rate']).toBe('100%')

    await user.selectOptions(screen.getByLabelText('Project'), 'project-006')
    rows = tableRows('Metrics for project-006')
    expect(rows['Total tasks']).toBe('0')
    expect(rows['Completion rate']).toBe('n/a')
  })

  it('shows an empty state before a project is selected', () => {
    renderReports()
    expect(screen.getByText('Select a project to see its metrics.')).toBeInTheDocument()
  })
})

describe('ReportsPage — task metrics (RPT-TASK)', () => {
  it('shows the global status and priority distribution (RPT-TASK-2)', () => {
    renderReports()
    const statusRows = tableRows('Distribution by status')
    expect(statusRows['Total']).toBe('30')
    expect(statusRows['Completed']).toBe('12')

    const priorityRows = tableRows('Distribution by priority')
    expect(priorityRows['High']).toBe('10')
    expect(priorityRows['Medium']).toBe('12')
    expect(priorityRows['Low']).toBe('8')
  })

  it('filters the distribution by project', async () => {
    const user = userEvent.setup()
    renderReports()

    await user.selectOptions(screen.getByLabelText('Project'), 'project-002')
    const statusRows = tableRows('Distribution by status')
    expect(statusRows['Total']).toBe('6')
    expect(statusRows['Completed']).toBe('6')
  })
})
