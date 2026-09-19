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
  const publicToken = environment.SUPERMEGA_PUBLIC_PREVIEW_BYPASS
  const appToken = environment.SUPERMEGA_APP_PREVIEW_BYPASS
  delete environment.SUPERMEGA_PUBLIC_PREVIEW_BYPASS
  delete environment.SUPERMEGA_APP_PREVIEW_BYPASS
  if (publicToken === undefined && appToken === undefined) return null
  return createPreviewScopedAccess({ ...binding, publicToken, appToken })
}

export async function installPreviewBrowserAccess({ cdp, sessionId, targetId, access }) {
  if (!sessionId || !targetId || !access?.headersFor) throw new Error('preview_browser_access_input_invalid')
  let failed = false
  const pending = new Set()
  const removers = []
  const send = async (method, params, session = sessionId) => {
    let timer
    try {
      return await Promise.race([cdp.send(method, params, session), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('preview_browser_access_timeout')), 5000)
      })])
    } finally { clearTimeout(timer) }
  }
  const close = () => send('Target.closeTarget', { targetId }, '').catch(() => {})
  const track = (work) => {
    const promise = work().catch(async () => { failed = true; await close() })
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
    await send('Target.closeTarget', { targetId: event.targetInfo.targetId }, '')
  })))
  try {
    await send('Network.setBypassServiceWorker', { bypass: true })
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }], handleAuthRequests: true })
  } catch {
    failed = true
    await close()
    for (const remove of removers) remove()
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
      await Promise.all([...pending])
      for (const remove of removers) remove()
    },
  }
}
