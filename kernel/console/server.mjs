// SUPERMEGA console — local dev server (zero-dep). Serves index.html + routes /api/* to handle().
// Run: node kernel/console/server.mjs   (defaults to in-memory store; set SUPABASE_URL to persist)
// For Vercel, the same handle() is wrapped by an api/ function. See ../../PLATFORM.md.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, resolve, sep } from 'node:path'
import { handleAgentCompanyAuth } from '../api/agent-company-auth.mjs'
import { handleAgentCompany } from '../api/agent-company.mjs'
import { handle } from './api.mjs'
import store from '../store.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const publicRoot = resolve(here, '..', 'public')
const PORT = Number(process.env.PORT || 4310)
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
})
const SECURITY_HEADERS = Object.freeze({
  'content-security-policy': "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
})

function resolvePublicFile(pathname) {
  let requested
  try { requested = decodeURIComponent(pathname) }
  catch { return null }
  if (requested === '/' || requested === '') requested = '/index.html'
  if (requested === '/status') requested = '/status.html'
  if (requested.includes('\0') || requested.includes('\\')) return null
  const target = resolve(publicRoot, requested.replace(/^\/+/, ''))
  return target === publicRoot || target.startsWith(`${publicRoot}${sep}`) ? target : null
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 512 * 1024) throw new Error('payload_too_large')
    chunks.push(c)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname.startsWith('/api/')) {
      let body = {}
      if (req.method !== 'GET' && req.method !== 'OPTIONS') body = await readJson(req)
      const request = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers: req.headers }
      const result = url.pathname === '/api/agent-company-auth'
        ? await handleAgentCompanyAuth(request)
        : url.pathname === '/api/agent-company'
          ? await handleAgentCompany(request)
          : await handle(request)
      const responseHeaders = { ...SECURITY_HEADERS, 'content-type': 'application/json', 'cache-control': 'no-store' }
      if (result.cookie) responseHeaders['set-cookie'] = result.cookie
      res.writeHead(result.status, responseHeaders)
      res.end(JSON.stringify(result.json))
      return
    }
    const target = resolvePublicFile(url.pathname)
    if (!target) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    let content
    try { content = await readFile(target) }
    catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': CONTENT_TYPES[extname(target)] || 'application/octet-stream' })
    res.end(content)
  } catch (err) {
    res.writeHead(400, { ...SECURITY_HEADERS, 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, reason: String(err.message || 'error').slice(0, 120) }))
  }
})

server.listen(PORT, () => {
  const aiOn = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
  console.log(`SuperMega console -> http://localhost:${PORT}  (store: ${store.mode}, ai: ${aiOn ? 'on' : 'off'})`)
})
