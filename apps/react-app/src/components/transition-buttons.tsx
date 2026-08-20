import type { ProjectStatus } from '@operations-hub/domain'

export interface TransitionButtonsProps {
  from: ProjectStatus
  targets: ProjectStatus[]
  onTransition(target: ProjectStatus): void
}

export function TransitionButtons({ from, targets, onTransition }: TransitionButtonsProps) {
  return (
    <div className="transitions">
      {targets.map((target) => (
        <button key={target} type="button" onClick={() => onTransition(target)}>
          {from} → {target}
        </button>
      ))}
    </div>
  )
}
