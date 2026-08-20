import type { TaskPriority } from '@operations-hub/domain'

export interface PriorityBadgeProps {
  priority: TaskPriority
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return <span className={`priority-badge priority-${priority}`}>{priority}</span>
}
