import { Component, input } from '@angular/core'

// Plain text badge for entity status (no semantic role needed: the status is
// already readable text in the row).
@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="status-badge status-{{ status() }}">{{ status() }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<string>()
}
