import { Component, type ErrorInfo, type ReactNode } from 'react'

import { report as reportClientError } from './client-error-reporter'

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

// The first four cover webpack plus Chrome, Firefox and Safari dynamic-import rejections.
// "Unable to preload CSS" is Vite's own: a lazy route with its own stylesheet chunk is
// loaded through __vitePreload, which awaits the <link> and rejects with that wording. Since
// the heaviest routes here (Ecommerce, Website, Settings) each ship a separate CSS chunk,
// that is the likeliest stale-deploy failure of the set — and it was the one missing.
const CHUNK_FAILURE = /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

function isChunkFailure(error: unknown) {
  if (!error) return false
  const name = (error as { name?: unknown }).name
  const message = (error as { message?: unknown }).message
  return CHUNK_FAILURE.test(`${String(name ?? '')} ${String(message ?? '')}`)
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
  offline: boolean
}

// There is a third cause, and it needs its own answer: the device has no connection and this
// chunk is not in the offline cache. Telling that reader to reload is actively wrong -- a reload
// re-serves the same cached shell and asks for the same missing file again. navigator.onLine is
// only trusted in the false direction, which is the safe one: a browser reporting offline really
// has no network, while one reporting online may still be behind a captive portal. So a false
// reading picks this branch and anything else falls through to the stale-deploy copy above.
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null, stale: false, offline: false }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    const stale = isChunkFailure(error)
    return { error, stale, offline: stale && isOffline() }
  }

  componentDidUpdate(previous: RouteErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null, stale: false, offline: false })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console stays as the local record. It is no longer the ONLY record:
    // reportClientError feeds the same no-PII beacon lane the two window
    // listeners use, so a caught route crash (this exact class of failure,
    // stale-deploy chunk loads first) now reaches it too -- componentDidCatch
    // never propagates to window.onerror on its own.
    console.error('SuperMega route failed to render', error, info.componentStack)
    reportClientError(error, error.message)
  }

  render() {
    const { error, stale, offline } = this.state
    if (!error) return this.props.children

    const heading = offline
      ? 'This screen is not available offline'
      : stale ? 'This page needs reloading' : 'This screen could not open'
    const explanation = offline
      ? 'You are offline and this part of SuperMega has not been saved on this device. Connect to the internet, then reload to open it.'
      : stale
        ? 'SuperMega was updated while this tab was open, so part of it is missing. Reload to get the current version.'
        : 'Something in this screen failed to start. Your other products are unaffected.'

    return (
      <div className="route-error" role="alert">
        <strong>{heading}</strong>
        <p>{explanation}</p>
        <p className="route-error-data">Your saved work on this device has not been changed.</p>
        <div className="route-error-actions">
          {/* Reload stays offered in every state, including offline. React.lazy caches a
              rejected import for the life of the page, so once a chunk has failed nothing short
              of a reload can retry it -- which is exactly why the offline sentence tells the
              reader to reconnect FIRST and then reload, rather than promising a reload alone
              will help. The product list is precached, so that link works with no network. */}
          <button onClick={() => window.location.reload()} type="button">Reload</button>
          {!stale || offline ? <a href="/">Go to product list</a> : null}
        </div>
        <details>
          <summary>Technical detail</summary>
          <code>{error.message || String(error)}</code>
        </details>
      </div>
    )
  }
}
