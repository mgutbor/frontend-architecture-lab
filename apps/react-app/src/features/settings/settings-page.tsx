export interface SettingsPageProps {
  showCompletedTasks: boolean
  onChange(showCompletedTasks: boolean): void
}

// Application settings (SET-1..4). This is UI state, separate from the domain
// store: it lives at the App level, persists across views within the session,
// and resets to its default when the application reloads (TR-2 / SET-4).
export function SettingsPage({ showCompletedTasks, onChange }: SettingsPageProps) {
  return (
    <section aria-label="Settings">
      <h2>Settings</h2>

      <div className="field setting-checkbox">
        <label htmlFor="show-completed-tasks">
          <input
            id="show-completed-tasks"
            type="checkbox"
            checked={showCompletedTasks}
            onChange={(event) => onChange(event.target.checked)}
          />
          Show completed tasks in task lists
        </label>
      </div>

      <p className="empty-state">
        This preference applies for the current session and returns to its default value when the
        application reloads (functional contract SET-4).
      </p>
    </section>
  )
}
