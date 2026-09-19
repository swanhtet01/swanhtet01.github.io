// Credentials are runtime inputs only. This module performs no provider setup,
// has no filesystem access, and never includes token values in thrown errors.
export function createPreviewScopedAccess({ publicOrigin, appOrigin, publicToken, appToken }) {
  if (!/^https:\/\/supermega-public-[a-z0-9]{9}-swanhtet01s-projects\.vercel\.app$/.test(publicOrigin || '')
    || !/^https:\/\/megaos-[a-z0-9]{9}-swanhtet01s-projects\.vercel\.app$/.test(appOrigin || '')) throw new Error('preview_access_origins_invalid')
  for (const token of [publicToken, appToken]) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('preview_access_credential_invalid')
  }
  const credentials = new Map([[publicOrigin, publicToken], [appOrigin, appToken]])
  let disposed = false
  const headersFor = (rawUrl, method = 'GET') => {
    if (disposed) throw new Error('preview_access_disposed')
    let url
    try { url = new URL(rawUrl) } catch { throw new Error('preview_access_url_invalid') }
    if (url.username || url.password || url.hash || !credentials.has(url.origin)
      || [...credentials.values()].some(token => url.href.includes(token))
      || !['GET', 'HEAD', 'OPTIONS'].includes(method)
      || [...url.searchParams.keys()].some(key => /token|secret|bypass|password/i.test(key))) throw new Error('preview_access_request_denied')
    return { 'x-vercel-protection-bypass': credentials.get(url.origin) }
  }
  return Object.freeze({
    headersFor,
    assertNoCredential(value) {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      if ([...credentials.values()].some(token => text?.includes(token))) throw new Error('preview_access_credential_reflected')
    },
    async fetchReadOnly(url, fetchImpl = fetch) {
      const headers = headersFor(url)
      // Redirects cannot carry credentials onwards; callers must validate the
      // exact nonredirecting response and release body independently.
      let response
      try { response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json', 'cache-control': 'no-cache, no-store', ...headers }, cache: 'no-store', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15000) }) }
      catch { throw new Error('preview_access_fetch_failed') }
      if (response.status >= 300 && response.status < 400) throw new Error('preview_access_redirect_denied')
      return response
    },
    dispose() { credentials.clear(); disposed = true },
    toJSON() { return { contract: 'supermega.preview-scoped-access.v1', credentialValuesExported: false } },
  })
}

// Consume only these process-local inputs before a browser child is launched.
// This does not create credentials, load files, or grant provider authority.
export function consumePreviewAccessEnvironment(binding, environment = process.env) {
  const captured = capturePreviewAccessEnvironment(environment)
  try { return captured.bind(binding) } finally { captured.dispose() }
}

export function capturePreviewAccessEnvironment(environment = process.env) {
  let publicToken = environment.SUPERMEGA_PUBLIC_PREVIEW_BYPASS
  let appToken = environment.SUPERMEGA_APP_PREVIEW_BYPASS
  delete environment.SUPERMEGA_PUBLIC_PREVIEW_BYPASS
  delete environment.SUPERMEGA_APP_PREVIEW_BYPASS
  let disposed = false
  return Object.freeze({
    bind(binding) {
      if (disposed) throw new Error('preview_access_inputs_disposed')
      if (publicToken === undefined && appToken === undefined) return null
      return createPreviewScopedAccess({ ...binding, publicToken, appToken })
    },
    dispose() { publicToken = undefined; appToken = undefined; disposed = true },
    toJSON() { return { credentialValuesExported: false } },
  })
}

export async function installPreviewBrowserAccess({ cdp, sessionId, targetId, access, commandTimeoutMs = 5000 }) {
  if (!sessionId || !targetId || !access?.headersFor) throw new Error('preview_browser_access_input_invalid')
  if (!Number.isInteger(commandTimeoutMs) || commandTimeoutMs < 1 || commandTimeoutMs > 5000) throw new Error('preview_browser_access_timeout_invalid')
  let failed = false
  let closed = false
  let closure = null
  const pending = new Set()
  const removers = []
  const send = async (method, params, session = sessionId) => {
    let timer
    try {
      return await Promise.race([cdp.send(method, params, session), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('preview_browser_access_timeout')), commandTimeoutMs)
      })])
    } finally { clearTimeout(timer) }
  }
  const close = () => {
    if (!closure) closure = (async () => {
      try {
        const result = await send('Target.closeTarget', { targetId }, '')
        if (result?.success !== true) throw new Error('close_not_confirmed')
        closed = true
      } catch { failed = true; throw new Error('preview_browser_access_close_failed') }
    })()
    return closure
  }
  const track = (work) => {
    const promise = work().catch(async () => { failed = true; await close().catch(() => {}) })
    pending.add(promise)
    void promise.finally(() => pending.delete(promise))
  }
  removers.push(cdp.on(sessionId, 'Fetch.requestPaused', event => track(async () => {
    let credentialHeaders
    try { credentialHeaders = access.headersFor(event.request?.url, event.request?.method) }
    catch {
      failed = true
      await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
      return
    }
    // Never forward cookies, authorization, referrers, or stale bypass headers.
    const headers = Object.entries(event.request.headers || {})
      .filter(([name]) => /^(accept|accept-language|user-agent|cache-control|pragma|range|priority|sec-fetch-[a-z-]+|sec-ch-ua[a-z-]*)$/i.test(name))
      .map(([name, value]) => ({ name, value: String(value) }))
    headers.push(...Object.entries(credentialHeaders).map(([name, value]) => ({ name, value })))
    await send('Fetch.continueRequest', { requestId: event.requestId, headers })
  })))
  removers.push(cdp.on(sessionId, 'Fetch.authRequired', event => track(async () => {
    failed = true
    await send('Fetch.continueWithAuth', { requestId: event.requestId, authChallengeResponse: { response: 'CancelAuth' } })
  })))
  // Child workers/targets are paused before execution, then closed rather than
  // inheriting a broader transport policy. These are static preview journeys.
  removers.push(cdp.on(sessionId, 'Target.attachedToTarget', event => track(async () => {
    failed = true
    const result = await send('Target.closeTarget', { targetId: event.targetInfo.targetId }, '')
    if (result?.success !== true) throw new Error('child_close_not_confirmed')
  })))
  try {
    await send('Network.setBypassServiceWorker', { bypass: true })
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }], handleAuthRequests: true })
  } catch {
    failed = true
    await close().catch(() => {})
    if (closed) for (const remove of removers) remove()
    throw new Error('preview_browser_access_setup_failed')
  }
  return {
    async assertClean() {
      await Promise.all([...pending])
      if (failed) throw new Error('preview_browser_access_request_failed')
    },
    // Caller must close the target/context first: never disable interception
    // while the page can still issue requests.
    async dispose() {
      await close()
      while (pending.size) await Promise.all([...pending])
      for (const remove of removers) remove()
      if (failed) throw new Error('preview_browser_access_request_failed')
    },
  }
}

async function boundedCleanup(action, timeoutMs) {
  let timer
  try {
    return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('preview_cleanup_timeout')), timeoutMs)
    })])
  } finally { clearTimeout(timer) }
}

export async function finishPreviewCase({ cdp, targetId, browserContextId, accessGuard, disposers = [], timeoutMs = 5000 }) {
  let failed = false
  let closed = false
  try {
    if (accessGuard) {
      try { await boundedCleanup(() => accessGuard.dispose(), timeoutMs * 2); closed = true }
      catch { failed = true }
    }
    if (!closed) {
      try {
        const result = await boundedCleanup(() => cdp.send('Target.closeTarget', { targetId }), timeoutMs)
        if (result?.success !== true) failed = true
      } catch { failed = true }
    }
    if (browserContextId) {
      try { await boundedCleanup(() => cdp.send('Target.disposeBrowserContext', { browserContextId }), timeoutMs) }
      catch { failed = true }
    }
  } finally {
    for (const dispose of disposers) {
      try { dispose() } catch { failed = true }
    }
  }
  if (failed) throw new Error('preview_case_cleanup_failed')
}

export async function finishPreviewBrowser({ cdp, browserProcess, access, timeoutMs = 5000 }) {
  let failed = false
  try {
    if (cdp) {
      try { await boundedCleanup(() => cdp.send('Browser.close'), timeoutMs) } catch { failed = true }
      try { await boundedCleanup(() => cdp.close(), timeoutMs) } catch { failed = true }
    }
  } finally {
    try { browserProcess?.kill() } catch { failed = true }
    finally { access?.dispose() }
  }
  if (failed) throw new Error('preview_browser_cleanup_failed')
}
