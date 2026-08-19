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
//   - HTTPS only, and the host (plus EVERY redirect hop) must not resolve to a private/loopback/
//     link-local/CGNAT/cloud-metadata address — SSRF-hardened against DNS-rebinding + redirect bypass.
//   - Request bodies capped at 512 KB.
//   - Response bodies capped at 512 KB.
//   - Redirects manually followed + re-validated, capped at 5.
//   - Timeout: configurable, max 30 s, default 10 s.
//   - No credentials stored — callers pass Authorization headers per-call.
//
// Capabilities:
//   request({ url, method, headers, body, timeout })  -> { ok, status, headers, body, text }
//   get(url, opts)    -> same as request({ method: 'GET', ... })
//   post(url, body, opts) -> same as request({ method: 'POST', ... })
//   health()         -> { ok, detail }

import { register } from './registry.mjs'
import { isIP } from 'node:net'
import dns from 'node:dns/promises'

const MAX_BODY_BYTES = 512 * 1024 // 512 KB
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_TIMEOUT_MS = 10_000

// --- SSRF defense ---------------------------------------------------------------------------------
// Reject private / loopback / link-local / CGNAT / cloud-metadata addresses — including when a public
// hostname RESOLVES to one (DNS-rebinding). Re-checked on every redirect hop in request().
function ipToLong(ip) { return ip.split('.').reduce((a, o) => ((a << 8) | (parseInt(o, 10) & 255)) >>> 0, 0) >>> 0 }
function inV4(ip, cidr) {
  const [base, bits] = cidr.split('/')
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0
  return (ipToLong(ip) & mask) === (ipToLong(base) & mask)
}
const V4_BLOCKED = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.168.0.0/16', '198.18.0.0/15', '224.0.0.0/4', '240.0.0.0/4']
// Expands any valid IPv6 literal to its 8 four-hex-digit groups, resolving both `::`
// compression and a trailing embedded IPv4 dotted tail (e.g. ::ffff:127.0.0.1). Returns
// null for anything malformed rather than guessing.
function expandIPv6(raw) {
  let ip = raw.toLowerCase()
  const dotted = ip.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const octets = dotted[1].split('.').map(Number)
    if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null
    const hex1 = ((octets[0] << 8) | octets[1]).toString(16)
    const hex2 = ((octets[2] << 8) | octets[3]).toString(16)
    ip = ip.slice(0, -dotted[1].length) + hex1 + ':' + hex2
  }
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : []
  if (halves.length === 1) { if (head.length !== 8) return null; return head.map((g) => g.padStart(4, '0')) }
  const missing = 8 - head.length - tail.length
  if (missing < 0) return null
  const groups = [...head, ...Array(missing).fill('0'), ...tail]
  return groups.length === 8 ? groups.map((g) => g.padStart(4, '0')) : null
}
function isBlockedIp(ip) {
  const v = isIP(ip)
  if (v === 4) return V4_BLOCKED.some((c) => inV4(ip, c))
  if (v === 6) {
    const lo = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (lo === '::1' || lo === '::') return true
    if (/^f[cd]/.test(lo)) return true        // fc00::/7 unique-local
    if (/^fe[89ab]/.test(lo)) return true     // fe80::/10 link-local
    // v4-mapped (::ffff:0:0/96): catch BOTH the dotted-decimal tail (::ffff:127.0.0.1)
    // and the plain-hex tail (::ffff:7f00:1, or fully expanded with no ::) — the
    // dotted-only regex this replaced let the hex form of the exact same address
    // through unblocked.
    const groups = expandIPv6(lo)
    if (groups && groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff') {
      const hi = parseInt(groups[6], 16), low = parseInt(groups[7], 16)
      return isBlockedIp([(hi >> 8) & 255, hi & 255, (low >> 8) & 255, low & 255].join('.'))
    }
    return false
  }
  return false
}
export async function validateUrl(url) {
  let u
  try { u = new URL(url) } catch { return 'invalid URL' }
  if (u.protocol !== 'https:') return 'only https:// URLs are allowed'
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return isBlockedIp(host) ? 'blocked private/loopback/link-local address' : null
  try {
    const addrs = await dns.lookup(host, { all: true })
    if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) return 'hostname resolves to a blocked address'
  } catch { return 'dns resolution failed' }
  return null
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
export async function request(_input = {}) {
  const { url, method = 'GET', headers = {}, body, timeout } = _input || {}
  const urlErr = await validateUrl(url)
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
    // Manual redirect handling: re-validate every hop's URL so a public host can't 30x us into the
    // internal network (the classic SSRF-via-redirect bypass). Body is only sent on the first hop.
    let currentUrl = url
    let res
    for (let hop = 0; ; hop++) {
      res = await fetch(currentUrl, {
        method: String(method).toUpperCase(),
        headers: reqHeaders,
        body: hop === 0 ? reqBody : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(ms),
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop >= 5) return { ok: false, reason: 'http_too_many_redirects' }
        const next = new URL(res.headers.get('location'), currentUrl).toString()
        const hopErr = await validateUrl(next)
        if (hopErr) return { ok: false, reason: `http_redirect_blocked: ${hopErr}` }
        currentUrl = next
        continue
      }
      break
    }

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
