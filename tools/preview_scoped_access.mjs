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
      || !['GET', 'HEAD', 'OPTIONS'].includes(method)
      || [...url.searchParams.keys()].some(key => /token|secret|bypass|password/i.test(key))) throw new Error('preview_access_request_denied')
    return { 'x-vercel-protection-bypass': credentials.get(url.origin) }
  }
  return Object.freeze({
    headersFor,
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
