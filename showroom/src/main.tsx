import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RouteErrorBoundary } from './core/RouteErrorBoundary'
import { ensureUiLocaleReady, readUiLocale } from './core/ui-locale'
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
async function mountApplication(): Promise<void> {
  const root = document.getElementById('root')
  if (!root) return
  try {
    // The selected Burmese dictionary must be ready before any route renders so
    // language switching never briefly mixes English and Burmese labels.
    await ensureUiLocaleReady()
  } catch {
    const message = document.createElement('p')
    message.lang = readUiLocale()
    message.textContent = readUiLocale() === 'my'
      ? 'ဘာသာစကားအချက်အလက်ကို ဖွင့်၍မရပါ။ ပြန်ဖွင့်ကြည့်ပါ။'
      : 'Language resources could not load. Reload to try again.'
    root.replaceChildren(message)
    return
  }
  createRoot(root).render(
    <StrictMode>
      <RouteErrorBoundary>
        <App />
      </RouteErrorBoundary>
    </StrictMode>,
  )
}

void mountApplication()
