import { Component, input } from '@angular/core'

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  template: `
    <section class="kpi-card">
      <span class="kpi-label">{{ label() }}</span>
      <strong class="kpi-value">{{ value() }}</strong>
    </section>
  `,
  styles: `
    .kpi-card {
      padding: 0.8rem 1rem;
      border: 1px solid #cbd2d9;
      border-radius: 8px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .kpi-label {
      font-size: 0.8rem;
      color: #52606d;
    }
    .kpi-value {
      font-size: 1.3rem;
    }
  `,
})
export class KpiCardComponent {
  readonly label = input.required<string>()
  readonly value = input.required<string | number>()
}
