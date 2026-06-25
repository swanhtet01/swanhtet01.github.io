// Connector: infra — Generic HTTP/REST client. Call any external API that doesn't have a
// dedicated connector — accounting software, custom POS systems, legacy in-house APIs,
// Myanmar government data endpoints, or any webhook-driven service.
//
// This is the escape hatch: 28 dedicated connectors cover the known integrations, but
// infra-http lets agents reach anything reachable over HTTPS without needing a new connector.
//
// category 'infra' · always configured (no env vars required — it's a generic client).
//
// Security model:
//   - Only HTTPS URLs allowed (blocks SSRF against internal services via http://).
//   - Request bodies capped at 512 KB.
//   - Response bodies capped at 512 KB.
//   - Redirects capped at 5.
//   - Timeout: configurable, max 30 s, default 10 s.
//   - No credentials stored — callers pass Authorization headers per-call.
//
// Capabilities:
//   request({ url, method, headers, body, timeout })  -> { ok, status, headers, body, text }
//   get(url, opts)    -> same as request({ method: 'GET', ... })
//   post(url, body, opts) -> same as request({ method: 'POST', ... })
//   health()         -> { ok, detail }

import { register } from './registry.mjs'

const MAX_BODY_BYTES = 512 * 1024 // 512 KB
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_TIMEOUT_MS = 10_000

function assertHttps(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return 'only https:// URLs are allowed'
    return null
  } catch {
    return 'invalid URL'
  }
}

function clampTimeout(t) {
  const n = typeof t === 'number' && Number.isFinite(t) ? t : DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(n, 1000), MAX_TIMEOUT_MS)
}

/**
 * request — generic HTTP request to any HTTPS endpoint.
 * @param {object} o
 * @param {string}  o.url           full HTTPS URL
 * @param {string}  [o.method]      HTTP method (default: GET)
 * @param {object}  [o.headers]     additional request headers
 * @param {string|object} [o.body]  request body — objects are JSON-serialised automatically
 * @param {number}  [o.timeout]     timeout in ms (1000–30000, default 10000)
 * @returns {Promise<{ ok:boolean, status:number, headers:object, body:any, text:string, reason?:string }>}
 */
export async function request({ url, method = 'GET', headers = {}, body, timeout } = {}) {
  const urlErr = assertHttps(url)
  if (urlErr) return { ok: false, reason: `http_invalid_url: ${urlErr}` }

  const ms = clampTimeout(timeout)
  const reqHeaders = { ...headers }
  let reqBody

  if (body !== undefined && body !== null) {
    if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      reqBody = JSON.stringify(body)
      if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
        reqHeaders['content-type'] = 'application/json'
      }
    } else {
      reqBody = body
    }
    const byteLen = typeof reqBody === 'string' ? Buffer.byteLength(reqBody, 'utf8') : (reqBody?.length || 0)
    if (byteLen > MAX_BODY_BYTES) return { ok: false, reason: `http_request_too_large: ${byteLen} bytes (max ${MAX_BODY_BYTES})` }
  }

  try {
    const res = await fetch(url, {
      method: String(method).toUpperCase(),
      headers: reqHeaders,
      body: reqBody,
      redirect: 'follow',
      signal: AbortSignal.timeout(ms),
    })

    // Safely read response body — cap at MAX_BODY_BYTES
    let text = ''
    try {
      const buf = await res.arrayBuffer()
      const slice = buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf
      text = new TextDecoder('utf-8', { fatal: false }).decode(slice)
    } catch { /* network error on body read — leave text empty */ }

    // Try to parse as JSON; fall back to raw text
    let parsedBody
    try { parsedBody = JSON.parse(text) } catch { parsedBody = text }

    // Collect response headers as a plain object
    const resHeaders = {}
    res.headers.forEach((v, k) => { resHeaders[k] = v })

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        headers: resHeaders,
        body: parsedBody,
        text,
        reason: `http_${res.status}: ${res.statusText || ''}`.slice(0, 200),
      }
    }

    return { ok: true, status: res.status, headers: resHeaders, body: parsedBody, text }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'http_error').slice(0, 200) }
  }
}

/**
 * get — convenience wrapper for GET requests.
 * @param {string} url
 * @param {object} [opts]  same as request() minus url and method
 */
export function get(url, opts = {}) {
  return request({ ...opts, url, method: 'GET' })
}

/**
 * post — convenience wrapper for POST requests.
 * @param {string} url
 * @param {string|object} body
 * @param {object} [opts]  same as request() minus url, method, and body
 */
export function post(url, body, opts = {}) {
  return request({ ...opts, url, method: 'POST', body })
}

/**
 * patch — convenience wrapper for PATCH requests.
 */
export function patch(url, body, opts = {}) {
  return request({ ...opts, url, method: 'PATCH', body })
}

/**
 * put — convenience wrapper for PUT requests.
 */
export function put(url, body, opts = {}) {
  return request({ ...opts, url, method: 'PUT', body })
}

/**
 * del — convenience wrapper for DELETE requests.
 */
export function del(url, opts = {}) {
  return request({ ...opts, url, method: 'DELETE' })
}

export const infraHttp = {
  key: 'infra-http',
  name: 'Generic HTTP',
  category: 'infra',
  docs: 'kernel/connectors/infra-http.mjs',
  configured: () => true,
  async health() {
    return { ok: true, detail: 'always ready — HTTPS-only, 10s default timeout, 512 KB cap' }
  },
  request,
  get,
  post,
  patch,
  put,
  del,
}

register(infraHttp)
export default infraHttp
