import { useMemo, useState } from 'react'
import { createDomainStore } from '../services/domain-store'
import { loadDomainDataset } from '../adapters/domain-adapter'
import { useDomainStore } from '../hooks/use-domain-store'
import { DashboardPage } from '../features/dashboard/dashboard-page'
import { ProjectsPage } from '../features/projects/projects-page'

type Section = 'dashboard' | 'projects'

export function App() {
  // The store is created once from the data source (fixture -> API later).
  const store = useMemo(() => createDomainStore(loadDomainDataset()), [])
  const state = useDomainStore(store)

  // UI state: which section is visible.
  const [section, setSection] = useState<Section>('dashboard')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Operations Hub</h1>
        <nav aria-label="Sections">
          <button
            type="button"
            className={section === 'dashboard' ? 'active' : undefined}
            onClick={() => setSection('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={section === 'projects' ? 'active' : undefined}
            onClick={() => setSection('projects')}
          >
            Projects
          </button>
        </nav>
      </header>

      <main>
        {section === 'dashboard' ? <DashboardPage state={state} /> : <ProjectsPage state={state} />}
      </main>
    </div>
  )
}
