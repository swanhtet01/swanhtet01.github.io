// Scheduled owner brief. When workcell slugs are configured, run those fixed products;
// otherwise preserve the existing SuperMega CEO brief. Every delivery is owner-only and
// protected by a durable daily claim because Vercel cron events can be delivered twice.

import crypto from 'node:crypto'
import { runOperator } from './operator.mjs'
import { notify } from '../alert.mjs'
import { claimWorkcellDelivery, formatWorkcellNotification, releaseWorkcellDelivery, runWorkcell } from '../workcell-run.mjs'
import { resolveWorkcellConfig, scheduledWorkcellSlugs } from '../workcells.mjs'

const BRIEF_GOAL =
  "Give the SuperMega CEO a concise daily brief - max 6 short lines. Include: inbound leads (total and by stage), the sales pipeline (projects by status + number of deals), today's USD/MMK reference rate, and flag anything that needs attention. Use the available tools to get the REAL numbers; never invent."

function safeEq(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest()
  const right = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(left, right)
}

function claimAccepted(claim) {
  return Boolean(claim?.fresh && claim?.durable)
}

export async function runScheduledBrief(options = {}) {
  const env = options.env || process.env
  const now = options.now || new Date()
  const send = options.notify || notify
  const claimDelivery = options.claimWorkcellDelivery || claimWorkcellDelivery
  const releaseDelivery = options.releaseWorkcellDelivery || releaseWorkcellDelivery
  const slugs = scheduledWorkcellSlugs(env)

  if (slugs.length) {
    const run = options.runWorkcell || runWorkcell
    const results = []
    for (const slug of slugs) {
      const workcell = await run(slug, { env, now })
      if (!workcell.ok) {
        results.push({ slug, ok: false, reason: workcell.reason, missing: workcell.missing || undefined })
        continue
      }
      const claim = await claimDelivery(slug, { env, now })
      if (!claim?.fresh && claim?.durable) {
        results.push({ slug, ok: true, duplicate: true, sent: false, sources: workcell.sources })
        continue
      }
      if (!claimAccepted(claim)) {
        results.push({ slug, ok: false, reason: claim?.reason || 'durable_delivery_claim_unavailable' })
        continue
      }
      let sent = false
      try { sent = await send(formatWorkcellNotification(workcell)) } catch { sent = false }
      if (!sent) await releaseDelivery(claim)
      results.push({
        slug,
        ok: Boolean(sent),
        sent: Boolean(sent),
        reason: sent ? undefined : 'owner_delivery_failed',
        sources: workcell.sources,
      })
    }
    return {
      ok: results.length > 0 && results.every((result) => result.ok),
      mode: 'workcells',
      client: resolveWorkcellConfig(env, now).clientName,
      results,
    }
  }

  const run = options.runOperator || runOperator
  const result = await run({ goal: BRIEF_GOAL })
  if (!result.ok) return { ok: false, mode: 'legacy', reason: result.reason || 'brief_failed' }
  const claim = await claimDelivery('legacy-ceo-brief', { env, now })
  if (!claim?.fresh && claim?.durable) return { ok: true, mode: 'legacy', duplicate: true, sent: false }
  if (!claimAccepted(claim)) return { ok: false, mode: 'legacy', reason: claim?.reason || 'durable_delivery_claim_unavailable' }
  let sent = false
  try { sent = await send(`SuperMega | Daily brief\n\n${result.answer}`) } catch { sent = false }
  if (!sent) await releaseDelivery(claim)
  return {
    ok: Boolean(sent),
    mode: 'legacy',
    sent: Boolean(sent),
    reason: sent ? undefined : 'owner_delivery_failed',
    toolsUsed: (result.results || []).map((item) => item.tool),
    answer: result.answer,
  }
}

export default async function handler(req, res) {
  const cronSecret = String(process.env.CRON_SECRET || process.env.SUPERMEGA_INTERNAL_CRON_TOKEN || '').trim()
  const opsKey = String(process.env.SUPERMEGA_OPS_KEY || '').trim()
  if (!cronSecret && !opsKey) { res.status(503).json({ ok: false, reason: 'auth_not_configured' }); return }

  const auth = String(req.headers['authorization'] || '')
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const opsHeader = String(req.headers['x-ops-key'] || '')
  const authorized = (cronSecret && bearer && safeEq(bearer, cronSecret)) || (opsKey && opsHeader && safeEq(opsHeader, opsKey))
  if (!authorized) { res.status(401).json({ ok: false, reason: 'unauthorized' }); return }

  const result = await runScheduledBrief()
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.ok ? 200 : 503).json(result)
}
