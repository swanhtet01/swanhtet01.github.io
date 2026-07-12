// SUPERMEGA autonomous daily brief — the AI ops analyst that works while you sleep. The operator runs
// a standing CEO-brief goal (read-only: leads, pipeline, FX, platform), then Telegrams the owner the
// real numbers. SAFE: read-only data + a notification to the OWNER's own channel (not customer comms).
// Triggered by Vercel cron (GET, Authorization: Bearer CRON_SECRET) or manually (GET, x-ops-key).
import crypto from 'node:crypto'
import { runOperator } from './operator.mjs'
import { notify } from '../alert.mjs'

const BRIEF_GOAL =
  "Give the SuperMega CEO a concise daily brief — max 6 short lines. Include: inbound leads (total and by stage), the sales pipeline (projects by status + number of deals), today's USD/MMK reference rate, and flag anything that needs attention. Use the available tools to get the REAL numbers; never invent."

function safeEq(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

export default async function handler(req, res) {
  const cronSecret = String(process.env.CRON_SECRET || process.env.SUPERMEGA_INTERNAL_CRON_TOKEN || '').trim()
  const opsKey = String(process.env.SUPERMEGA_OPS_KEY || '').trim()
  if (!cronSecret && !opsKey) { res.status(503).json({ ok: false, reason: 'auth_not_configured' }); return }

  const auth = String(req.headers['authorization'] || '')
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const opsHdr = String(req.headers['x-ops-key'] || '')
  const authorized = (cronSecret && bearer && safeEq(bearer, cronSecret)) || (opsKey && opsHdr && safeEq(opsHdr, opsKey))
  if (!authorized) { res.status(401).json({ ok: false, reason: 'unauthorized' }); return }

  const r = await runOperator({ goal: BRIEF_GOAL })
  const answer = r.ok ? r.answer : `(brief unavailable: ${r.reason || 'error'})`
  const sent = await notify(`📊 SuperMega — daily brief\n\n${answer}`)

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, sent, toolsUsed: (r.results || []).map((x) => x.tool), answer })
}
