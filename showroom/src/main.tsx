import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RouteErrorBoundary } from './core/RouteErrorBoundary'
import { startMetricsCollector } from './analytics/metrics-collector'
import { isBeaconHost, startClientErrorReporter, startStorageQuotaWatch } from './core/client-error-reporter'

startMetricsCollector()

// Error lane rides the same production-hostname gate as the Vercel beacon loader in
// index.html: on any other host the listeners are never installed, so local and dev
// sessions observe errors in the console only and send nothing.
if (isBeaconHost()) startClientErrorReporter()

// The storage-quota lane is owner-facing rather than telemetry, so it is installed on
// every host: a full device silently drops Shop writes wherever the app is running.
startStorageQuotaWatch()

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
