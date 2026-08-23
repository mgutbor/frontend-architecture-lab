import { Component, model } from '@angular/core'

// Application settings (SET-1..4). This is UI state, separate from the domain
// store: it lives at the App level, persists across views within the session,
// and resets to its default when the application reloads (TR-2 / SET-4).
@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  readonly showCompletedTasks = model(true)
}
