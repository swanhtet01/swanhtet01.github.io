// SUPERMEGA console — Vercel function. Wraps the host-agnostic handle() for /api/*.
// Static UI is served from ../public/index.html. See ../../PLATFORM.md.
import { handle } from '../console/api.mjs'

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const result = await handle({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: req.body && typeof req.body === 'object' ? req.body : {},
    headers: req.headers,
  })
  res.status(result.status).json(result.json)
}
