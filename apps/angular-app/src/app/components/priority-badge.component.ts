import { Component, input } from '@angular/core'
import type { TaskPriority } from '@operations-hub/domain'

@Component({
  selector: 'app-priority-badge',
  standalone: true,
  template: `<span class="priority-badge priority-{{ priority() }}">{{ priority() }}</span>`,
})
export class PriorityBadgeComponent {
  readonly priority = input.required<TaskPriority>()
}
