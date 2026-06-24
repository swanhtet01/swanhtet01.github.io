// SUPERMEGA console — local dev server (zero-dep). Serves index.html + routes /api/* to handle().
// Run: node kernel/console/server.mjs   (defaults to in-memory store; set SUPABASE_URL to persist)
// For Vercel, the same handle() is wrapped by an api/ function. See ../../PLATFORM.md.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { handle } from './api.mjs'
import store from '../store.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 4310)

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
      const result = await handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers: req.headers })
      res.writeHead(result.status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(result.json))
      return
    }
    const html = await readFile(resolve(here, '..', 'public', 'index.html'), 'utf8')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, reason: String(err.message || 'error').slice(0, 120) }))
  }
})

server.listen(PORT, () => {
  const aiOn = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
  console.log(`SuperMega console -> http://localhost:${PORT}  (store: ${store.mode}, ai: ${aiOn ? 'on' : 'off'})`)
})
