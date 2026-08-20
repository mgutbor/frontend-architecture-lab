export interface TransitionButtonsProps<T extends string> {
  from: T
  targets: T[]
  onTransition(target: T): void
}

// Renders the valid status transitions for an entity. The targets come from
// the domain state machines (PROJECT_TRANSITIONS / TASK_TRANSITIONS), so only
// documented transitions are ever offered (PRJ-EDIT-3, TSK-STATUS-1/2).
export function TransitionButtons<T extends string>({
  from,
  targets,
  onTransition,
}: TransitionButtonsProps<T>) {
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
