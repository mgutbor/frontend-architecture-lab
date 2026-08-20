export interface EmptyStateProps {
  message: string
}

// Explicit empty state for lists without results (PRJ-LIST-4, PRJ-VIEW-3,
// TSK-LIST-3). role="status" announces the change to assistive technology
// when it appears after a search or filter (ACC-8).
export function EmptyState({ message }: EmptyStateProps) {
  return (
    <p className="empty-state" role="status">
      {message}
    </p>
  )
}
