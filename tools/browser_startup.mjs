import { spawn } from 'node:child_process'

// Bound each probe as well as the complete startup. Never retry another browser:
// doing so would obscure which executable supplied the rendered evidence.
export async function startBrowser(browserBin, args, debugPort, {
  spawnBrowser = spawn,
  fetchVersion = fetch,
  timeoutMs = 30_000,
  probeTimeoutMs = 1_000,
  pollMs = 250,
} = {}) {
  const browser = spawnBrowser(browserBin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  let exited = false
  let exitCode = null
  let spawnError = null
  let probeFailure = 'not attempted'
  browser.stderr?.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096) })
  browser.on('error', (error) => { spawnError = error.code || error.name })
  browser.on('exit', (code) => { exited = true; exitCode = code })
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      if (spawnError || exited) break
      try {
        const response = await fetchVersion(`http://127.0.0.1:${debugPort}/json/version`, {
          signal: AbortSignal.timeout(Math.max(1, Math.min(probeTimeoutMs, deadline - Date.now()))),
          redirect: 'error',
        })
        if (response.ok) {
          const version = await response.json()
          const endpoint = new URL(version.webSocketDebuggerUrl)
          if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
            || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
            || endpoint.port !== String(debugPort) || !endpoint.pathname.startsWith('/devtools/browser/')) {
            throw new Error('invalid_devtools_endpoint')
          }
          if (spawnError || exited || Date.now() >= deadline) break
          return { browser, wsUrl: endpoint.href }
        }
        probeFailure = `HTTP ${response.status}`
        await response.body?.cancel()
      } catch (error) {
        // Codes only: do not include arbitrary response bodies or environment data.
        probeFailure = typeof error.cause?.code === 'string' ? error.cause.code
          : typeof error.code === 'string' ? error.code : error.name
      }
      await new Promise((done) => setTimeout(done, Math.max(0, Math.min(pollMs, deadline - Date.now()))))
    }
    const state = spawnError ? `spawn error ${spawnError}` : exited ? `exited with code ${exitCode}` : 'still running'
    throw new Error(`browser did not expose DevTools on port ${debugPort} (${state}); executable=${browserBin}; last probe=${probeFailure}. ${stderr.trim()}`)
  } catch (error) {
    if (!exited) browser.kill()
    throw error
  }
}
