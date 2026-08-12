import { Component, type ErrorInfo, type ReactNode } from 'react'

// Every product route is a lazy chunk. When one fails to arrive the error is thrown
// inside <Suspense>, escapes to the root, and React unmounts the whole tree — sidebar,
// topbar and nav included — leaving a blank rectangle with no text and no way back.
//
// Two distinct causes, and they need different answers:
//
//  - A stale asset hash. Static hosting replaces the whole hashed asset set on deploy,
//    so any tab held open across a release 404s on the chunk it asks for next. Reloading
//    fetches the new index.html and fixes it outright.
//  - A dropped request on a slow connection. Reloading usually fixes this too, on retry.
//
// A genuine render bug is NOT fixed by reloading, so it gets different copy rather than a
// button that quietly does nothing. Either way local workspace data is untouched: it lives
// in this browser's storage, not in the component tree, so the reassurance is honest.

// The last alternative is Vite's wording when a lazy route's stylesheet preload fails.
const CHUNK_FAILURE = /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

function isChunkFailure(error: unknown) {
  if (!error) return false
  const name = (error as { name?: unknown }).name
  const message = (error as { message?: unknown }).message
  return CHUNK_FAILURE.test(`${typeof name === 'string' ? name : ''} ${typeof message === 'string' ? message : ''}`)
}

type RouteErrorBoundaryProps = {
  children: ReactNode
  // Remounts the boundary when the route changes, so a failure on one product does not
  // leave the next one stuck behind an error screen the user cannot dismiss.
  resetKey?: string
}

type RouteErrorBoundaryState = {
  error: Error | null
  stale: boolean
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null, stale: false }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error, stale: isChunkFailure(error) }
  }

  componentDidUpdate(previous: RouteErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null, stale: false })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No crash reporting exists yet, so the console is the only record. Keep it: without
    // this the founder has no way to learn what a shop owner saw.
    console.error('SuperMega route failed to render', error, info.componentStack)
  }

  render() {
    const { error, stale } = this.state
    if (!error) return this.props.children

    return (
      <div className="route-error" role="alert">
        <strong>{stale ? 'This page needs reloading' : 'This screen could not open'}</strong>
        <p>
          {stale
            ? 'SuperMega was updated while this tab was open, so part of it is missing. Reload to get the current version.'
            : 'Something in this screen failed to start. Your other products are unaffected.'}
        </p>
        <p className="route-error-data">Your saved work on this device has not been changed.</p>
        <div className="route-error-actions">
          <button onClick={() => window.location.reload()} type="button">Reload</button>
          {!stale ? <a href="/">Go to product list</a> : null}
        </div>
        <details>
          <summary>Technical detail</summary>
          <code>{error.message || String(error)}</code>
        </details>
      </div>
    )
  }
}
