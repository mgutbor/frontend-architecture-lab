import { Component, computed, input } from '@angular/core'

// Form field wrapper: associates the label with the control (ACC-3) and wires
// inline validation errors through aria-describedby + role="alert" (ACC-4).
// The control itself must render with the given id and, when errors exist,
// set aria-invalid and aria-describedby="{controlId}-error".
// controlId is passed as a bound input (not an id attribute) so the wrapper
// host never duplicates the control's id in the DOM.
@Component({
  selector: 'app-field',
  standalone: true,
  template: `
    <div class="field">
      <label [for]="controlId()">{{ label() }}</label>
      <ng-content />
      @if (hasErrors()) {
        <span class="field-error" [id]="controlId() + '-error'" role="alert">{{
          errorsText()
        }}</span>
      }
    </div>
  `,
})
export class FieldComponent {
  readonly controlId = input.required<string>()
  readonly label = input.required<string>()
  readonly errors = input<string[] | undefined>(undefined)

  readonly hasErrors = computed(() => (this.errors()?.length ?? 0) > 0)
  readonly errorsText = computed(() => this.errors()?.join(' · ') ?? '')
}
