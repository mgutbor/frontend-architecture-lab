export interface StatusBadgeProps {
  status: string
}

// Plain text badge for entity status (no semantic role needed: the status is
// already readable text in the row).
export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-${status}`}>{status}</span>
}
