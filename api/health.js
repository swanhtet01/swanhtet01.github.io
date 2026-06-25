// Public health probe for the supermega.dev backend (the api/* serverless functions). Reports real
// data-store reachability + which integrations are configured (booleans only — no secret values).
// 200 when healthy, 503 when the configured DB is unreachable. CJS — matches the bundled function shape.
const { ping } = require('./lib/supermega-datastore')

const env = (n) => Boolean(String(process.env[n] || '').trim())
const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))])

module.exports = async function handler(_req, res) {
  let db
  try { db = await withTimeout(ping(), 2500, { ok: false, detail: 'ping_timeout' }) }
  catch (e) { db = { ok: false, detail: String((e && e.message) || 'ping_error').slice(0, 120) } }

  const integrations = {
    ai: env('ANTHROPIC_API_KEY') || env('CLAUDE_API_KEY'),
    email: env('RESEND_API_KEY'),
    telegram: env('TELEGRAM_BOT_TOKEN'),
    stripe: env('STRIPE_SECRET_KEY'),
    db_configured: db.configured !== false,
  }
  const ok = db.ok !== false

  res.statusCode = ok ? 200 : 503
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({
    ok,
    status: ok ? 'ready' : 'degraded',
    service: 'supermega-public-site',
    db,
    integrations,
    checked_at: new Date().toISOString(),
  }))
}
