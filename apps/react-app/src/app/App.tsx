import { useMemo, useState } from 'react'
import { createDomainStore } from '../services/domain-store'
import { loadDomainDataset } from '../adapters/domain-adapter'
import { useDomainStore } from '../hooks/use-domain-store'
import { DashboardPage } from '../features/dashboard/dashboard-page'
import { ProjectsPage } from '../features/projects/projects-page'
import { TeamsPage } from '../features/teams/teams-page'
import { TasksPage } from '../features/tasks/tasks-page'
import { ReportsPage } from '../features/reports/reports-page'
import { SettingsPage } from '../features/settings/settings-page'

// Persistent state-based navigation (NAV-1): every functional area is
// reachable from the header in all views. No URL routing is used in this
// phase (Phase 4 decision): the contract requires persistent navigation,
// not deep links.
export type Section = 'dashboard' | 'projects' | 'teams' | 'tasks' | 'reports' | 'settings'

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Projects' },
  { id: 'teams', label: 'Teams' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
]

export function App() {
  // The store is created once from the data source (fixture -> API later).
  const store = useMemo(() => createDomainStore(loadDomainDataset()), [])
  const state = useDomainStore(store)

  // UI state: which section is visible (domain state lives in the store).
  const [section, setSection] = useState<Section>('dashboard')

  // Settings UI state (SET-1..4): session-only, defaults to on, resets on reload.
  const [showCompletedTasks, setShowCompletedTasks] = useState(true)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Operations Hub</h1>
        <nav aria-label="Main">
          <ul>
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  className={section === id ? 'active' : undefined}
                  aria-current={section === id ? 'page' : undefined}
                  onClick={() => setSection(id)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main>
        {section === 'dashboard' ? <DashboardPage state={state} /> : null}
        {section === 'projects' ? (
          <ProjectsPage state={state} showCompletedTasks={showCompletedTasks} />
        ) : null}
        {section === 'teams' ? <TeamsPage state={state} /> : null}
        {section === 'tasks' ? (
          <TasksPage state={state} showCompletedTasks={showCompletedTasks} />
        ) : null}
        {section === 'reports' ? <ReportsPage state={state} /> : null}
        {section === 'settings' ? (
          <SettingsPage showCompletedTasks={showCompletedTasks} onChange={setShowCompletedTasks} />
        ) : null}
      </main>
    </div>
  )
}
