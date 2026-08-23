import { Component, input } from '@angular/core'

// Operation feedback announced to assistive technology (ACC-8). The region
// stays in the DOM so later messages are announced; empty messages render
// nothing visible.
@Component({
  selector: 'app-feedback',
  standalone: true,
  template: `<p class="feedback" role="status" aria-live="polite">{{ message() }}</p>`,
})
export class FeedbackComponent {
  readonly message = input<string | null>(null)
}
