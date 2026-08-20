export interface FeedbackProps {
  message: string | null
}

// Operation feedback announced to assistive technology (ACC-8). The region
// stays in the DOM so later messages are announced; empty messages render
// nothing visible.
export function Feedback({ message }: FeedbackProps) {
  return (
    <p className="feedback" role="status" aria-live="polite">
      {message}
    </p>
  )
}
