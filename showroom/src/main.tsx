import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RouteErrorBoundary } from './core/RouteErrorBoundary'

// The inner boundary in CoreShell covers route content. This one is the last line of
// defence: if the shell itself throws, or a chunk fails before any route mounts, without
// this the user gets an empty <div id="root"> and nothing else.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouteErrorBoundary>
      <App />
    </RouteErrorBoundary>
  </StrictMode>,
)
