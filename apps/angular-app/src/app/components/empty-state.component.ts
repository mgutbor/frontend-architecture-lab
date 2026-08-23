import { Component, input } from '@angular/core'

// Explicit empty state for lists without results (PRJ-LIST-4, PRJ-VIEW-3,
// TSK-LIST-3). role="status" announces the change to assistive technology
// when it appears after a search or filter (ACC-8).
@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `<p class="empty-state" role="status">{{ message() }}</p>`,
})
export class EmptyStateComponent {
  readonly message = input.required<string>()
}
