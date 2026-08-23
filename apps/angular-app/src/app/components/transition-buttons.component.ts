import { Component, input, output } from '@angular/core'

// Renders the valid status transitions for an entity. The targets come from
// the domain state machines (PROJECT_TRANSITIONS / TASK_TRANSITIONS), so only
// documented transitions are ever offered (PRJ-EDIT-3, TSK-STATUS-1/2).
@Component({
  selector: 'app-transition-buttons',
  standalone: true,
  template: `
    <div class="transitions">
      @for (target of targets(); track $index) {
        <button type="button" (click)="transition.emit(target)">{{ from() }} → {{ target }}</button>
      }
    </div>
  `,
})
export class TransitionButtonsComponent {
  readonly from = input.required<string>()
  readonly targets = input.required<string[]>()
  readonly transition = output<string>()
}
