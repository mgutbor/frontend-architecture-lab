import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

// Minimal defensive boundary: the data source is a synchronous fixture (TR-1),
// so errors are unlikely, but a crash should not blank the whole application.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="error-boundary">
          <h1>Something went wrong</h1>
          <p>Reload the application to restart it.</p>
        </main>
      )
    }
    return this.props.children
  }
}
