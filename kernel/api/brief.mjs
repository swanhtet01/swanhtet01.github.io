// Scheduled owner brief. When workcell slugs are configured, run those fixed products;
// otherwise preserve the existing SuperMega CEO brief. Every run is admitted by a durable
// hourly execution claim, and every owner-only delivery has a durable daily claim.

import crypto from 'node:crypto'
import { runOperator } from './operator.mjs'
import { notify } from '../alert.mjs'
import { claimWorkcellDelivery, claimWorkcellExecution, formatWorkcellNotification, releaseWorkcellDelivery, runWorkcell } from '../workcell-run.mjs'
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

async function claimSafely(claim, slug, options, failureReason) {
  try { return await claim(slug, options) }
  catch { return { fresh: false, durable: false, reason: failureReason } }
}

async function releaseClaimSafely(releaseClaim, claim) {
  try { return Boolean(await releaseClaim(claim)) }
  catch { return false }
}

export async function runScheduledBrief(options = {}) {
  const env = options.env || process.env
  const now = options.now || new Date()
  const send = options.notify || notify
  const claimExecution = options.claimWorkcellExecution || claimWorkcellExecution
  const claimDelivery = options.claimWorkcellDelivery || claimWorkcellDelivery
  const releaseDelivery = options.releaseWorkcellDelivery || releaseWorkcellDelivery
  const slugs = scheduledWorkcellSlugs(env)

  if (slugs.length) {
    const run = options.runWorkcell || runWorkcell
    const results = []
    for (const slug of slugs) {
      const executionClaim = await claimSafely(claimExecution, slug, { env, now }, 'durable_execution_claim_unavailable')
      if (!executionClaim?.fresh && executionClaim?.durable) {
        results.push({ slug, ok: true, duplicate: true, sent: false })
        continue
      }
      if (!claimAccepted(executionClaim)) {
        results.push({ slug, ok: false, reason: executionClaim?.reason || 'durable_execution_claim_unavailable' })
        continue
      }
      let workcell
      try { workcell = await run(slug, { env, now }) }
      catch { workcell = { ok: false, slug, reason: 'workcell_execution_failed' } }
      if (!workcell.ok) {
        const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
        results.push({ slug, ok: false, reason: workcell.reason, missing: workcell.missing || undefined, retryable })
        continue
      }
      const deliveryClaim = await claimSafely(claimDelivery, slug, { env, now }, 'durable_delivery_claim_unavailable')
      if (!deliveryClaim?.fresh && deliveryClaim?.durable) {
        results.push({ slug, ok: true, duplicate: true, sent: false, sources: workcell.sources })
        continue
      }
      if (!claimAccepted(deliveryClaim)) {
        const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
        results.push({ slug, ok: false, reason: deliveryClaim?.reason || 'durable_delivery_claim_unavailable', retryable })
        continue
      }
      let sent = false
      try { sent = await send(formatWorkcellNotification(workcell)) } catch { sent = false }
      let retryable
      if (!sent) {
        const deliveryReleased = await releaseClaimSafely(releaseDelivery, deliveryClaim)
        const executionReleased = await releaseClaimSafely(releaseDelivery, executionClaim)
        retryable = deliveryReleased && executionReleased
      }
      results.push({
        slug,
        ok: Boolean(sent),
        sent: Boolean(sent),
        reason: sent ? undefined : 'owner_delivery_failed',
        retryable,
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
  const executionClaim = await claimSafely(claimExecution, 'legacy-ceo-brief', { env, now }, 'durable_execution_claim_unavailable')
  if (!executionClaim?.fresh && executionClaim?.durable) return { ok: true, mode: 'legacy', duplicate: true, sent: false }
  if (!claimAccepted(executionClaim)) return { ok: false, mode: 'legacy', reason: executionClaim?.reason || 'durable_execution_claim_unavailable' }
  let result
  try { result = await run({ goal: BRIEF_GOAL }) }
  catch { result = { ok: false, reason: 'brief_failed' } }
  if (!result.ok) {
    const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
    return { ok: false, mode: 'legacy', reason: result.reason || 'brief_failed', retryable }
  }
  const deliveryClaim = await claimSafely(claimDelivery, 'legacy-ceo-brief', { env, now }, 'durable_delivery_claim_unavailable')
  if (!deliveryClaim?.fresh && deliveryClaim?.durable) return { ok: true, mode: 'legacy', duplicate: true, sent: false }
  if (!claimAccepted(deliveryClaim)) {
    const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
    return { ok: false, mode: 'legacy', reason: deliveryClaim?.reason || 'durable_delivery_claim_unavailable', retryable }
  }
  let sent = false
  try { sent = await send(`SuperMega | Daily brief\n\n${result.answer}`) } catch { sent = false }
  let retryable
  if (!sent) {
    const deliveryReleased = await releaseClaimSafely(releaseDelivery, deliveryClaim)
    const executionReleased = await releaseClaimSafely(releaseDelivery, executionClaim)
    retryable = deliveryReleased && executionReleased
  }
  return {
    ok: Boolean(sent),
    mode: 'legacy',
    sent: Boolean(sent),
    reason: sent ? undefined : 'owner_delivery_failed',
    retryable,
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
