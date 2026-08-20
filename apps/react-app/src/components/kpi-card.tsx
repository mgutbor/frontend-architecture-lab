export interface KpiCardProps {
  label: string
  value: string | number
}

export function KpiCard({ label, value }: KpiCardProps) {
  return (
    <section className="kpi-card">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
    </section>
  )
}
