// Scheduled owner brief. When workcell slugs are configured, run those fixed products;
// otherwise run the authority-bound SuperMega CEO outcome. Every run is admitted by a durable
// hourly execution claim, and every owner-only delivery has a durable daily claim.

import crypto from 'node:crypto'
import { runOperator } from './operator.mjs'
import { notify } from '../alert.mjs'
import { claimWorkcellDelivery, claimWorkcellExecution, formatWorkcellNotification, releaseWorkcellDelivery, runWorkcell } from '../workcell-run.mjs'
import { resolveWorkcellConfig, scheduledWorkcellSlugs } from '../workcells.mjs'
import { buildCeoOutcomeGoal, selectCeoOutcome } from '../supermega-hq-authority.mjs'
import {
  CEO_OUTCOME_CYCLE_STATE_CONTRACT,
  loadCeoOutcomeCycleState,
  recordCeoOutcomeCompletion,
} from '../agent-company-operations.mjs'

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

function ceoOutcomeView(selection) {
  const selected = selection?.selected
  return selected ? {
    authorityId: selection.authorityId,
    authorityDigest: selection.authorityDigest,
    id: selected.id,
    title: selected.title,
    team: selected.team,
    actionMode: selected.actionMode,
  } : null
}

function validCycleState(value, expected) {
  if (!value?.ok
    || value.contract !== CEO_OUTCOME_CYCLE_STATE_CONTRACT
    || value.durable !== true
    || value.clientId !== expected.clientId
    || value.authorityDigest !== expected.authorityDigest
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.cycleId || ''))
    || !Array.isArray(value.completedOutcomeIds)
    || value.completedOutcomeIds.length > 12
    || new Set(value.completedOutcomeIds).size !== value.completedOutcomeIds.length
    || !value.completedOutcomeIds.every((id) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(id)))
    || value.completedCount !== value.completedOutcomeIds.length) return false
  const startsAt = Date.parse(value.startsAt)
  const endsAt = Date.parse(value.endsAt)
  const asOf = expected.asOf.getTime()
  return Number.isFinite(startsAt)
    && Number.isFinite(endsAt)
    && endsAt - startsAt === 7 * 24 * 60 * 60 * 1000
    && asOf >= startsAt
    && asOf < endsAt
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

  const select = options.selectCeoOutcome || selectCeoOutcome
  let selection = select({
    authority: options.ceoAuthority,
    completedOutcomeIds: options.completedOutcomeIds,
    inFlightOutcomeIds: options.inFlightOutcomeIds,
  })
  if (!selection?.ok) return { ok: false, mode: 'legacy', companyMode: 'supermega_hq', reason: selection?.reason || 'ceo_outcome_authority_invalid' }
  const clientId = String(options.clientId ?? env.SUPERMEGA_CLIENT_ID ?? '').trim()
  let cycleState = null
  if (options.completedOutcomeIds === undefined && clientId) {
    const loadCycleState = options.loadCeoOutcomeCycleState || loadCeoOutcomeCycleState
    try {
      cycleState = await loadCycleState({
        clientId,
        authorityDigest: selection.authorityDigest,
        asOf: now.toISOString(),
      })
    } catch {
      cycleState = { ok: false, reason: 'ceo_outcome_cycle_store_unavailable' }
    }
    if (!cycleState?.ok) {
      return {
        ok: false,
        mode: 'legacy',
        companyMode: 'supermega_hq',
        reason: cycleState?.reason || 'ceo_outcome_cycle_store_unavailable',
      }
    }
    if (!validCycleState(cycleState, { clientId, authorityDigest: selection.authorityDigest, asOf: now })) {
      return { ok: false, mode: 'legacy', companyMode: 'supermega_hq', reason: 'ceo_outcome_cycle_state_invalid' }
    }
    selection = select({
      authority: options.ceoAuthority,
      completedOutcomeIds: cycleState.completedOutcomeIds,
      inFlightOutcomeIds: options.inFlightOutcomeIds,
    })
    if (!selection?.ok) return { ok: false, mode: 'legacy', companyMode: 'supermega_hq', reason: selection?.reason || 'ceo_outcome_authority_invalid' }
  }
  const cycle = cycleState ? {
    contract: cycleState.contract,
    cycleId: cycleState.cycleId,
    startsAt: cycleState.startsAt,
    endsAt: cycleState.endsAt,
    completedCount: cycleState.completedCount,
  } : null
  if (selection.declined || !selection.selected) {
    return {
      ok: true,
      mode: 'legacy',
      companyMode: 'supermega_hq',
      declined: true,
      sent: false,
      reason: selection.reason || 'no_authorized_ceo_outcome',
      authorityId: selection.authorityId,
      authorityDigest: selection.authorityDigest,
      cycle,
      skipped: selection.skipped,
    }
  }

  const outcome = ceoOutcomeView(selection)
  const claimSlug = `ceo-${selection.selected.id}`
  const run = options.runOperator || runOperator
  const executionClaim = await claimSafely(claimExecution, claimSlug, { env, now }, 'durable_execution_claim_unavailable')
  if (!executionClaim?.fresh && executionClaim?.durable) {
    return {
      ok: true,
      mode: 'legacy',
      companyMode: 'supermega_hq',
      declined: true,
      duplicate: true,
      sent: false,
      reason: 'ceo_outcome_duplicate',
      outcome,
      cycle,
    }
  }
  if (!claimAccepted(executionClaim)) {
    return { ok: false, mode: 'legacy', companyMode: 'supermega_hq', reason: executionClaim?.reason || 'durable_execution_claim_unavailable', outcome, cycle }
  }
  let result
  try {
    result = await run({
      goal: buildCeoOutcomeGoal(selection),
      approvedPlan: selection.selected.evidencePlan,
    })
  }
  catch { result = { ok: false, reason: 'brief_failed' } }
  if (!result.ok) {
    const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
    return { ok: false, mode: 'legacy', companyMode: 'supermega_hq', reason: result.reason || 'brief_failed', retryable, outcome, cycle }
  }
  if (!clientId) {
    const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
    return { ok: false, mode: 'legacy', companyMode: 'supermega_hq', reason: 'company_client_id_missing', retryable, outcome, cycle }
  }
  const recordOutcome = options.recordCeoOutcomeCompletion || recordCeoOutcomeCompletion
  let recorded
  try {
    recorded = await recordOutcome({
      clientId,
      outcomeId: selection.selected.id,
      authorityDigest: selection.authorityDigest,
      completedAt: now.toISOString(),
      usage: result.usage,
    })
  } catch {
    recorded = { ok: false, reason: 'ceo_outcome_store_unavailable' }
  }
  if (!recorded?.ok) {
    const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
    return {
      ok: false,
      mode: 'legacy',
      companyMode: 'supermega_hq',
      reason: recorded?.reason || 'ceo_outcome_store_unavailable',
      retryable,
      outcome,
      cycle,
    }
  }
  const outcomeMetrics = {
    recorded: true,
    operationId: recorded.outcome?.operationId,
    status: recorded.outcome?.status,
    recordHash: recorded.outcome?.recordHash,
    replayed: recorded.replayed === true,
  }
  const deliveryClaim = await claimSafely(claimDelivery, claimSlug, { env, now }, 'durable_delivery_claim_unavailable')
  if (!deliveryClaim?.fresh && deliveryClaim?.durable) {
    return { ok: true, mode: 'legacy', companyMode: 'supermega_hq', declined: true, duplicate: true, sent: false, reason: 'ceo_outcome_duplicate', outcome, cycle }
  }
  if (!claimAccepted(deliveryClaim)) {
    const retryable = await releaseClaimSafely(releaseDelivery, executionClaim)
    return { ok: false, mode: 'legacy', companyMode: 'supermega_hq', reason: deliveryClaim?.reason || 'durable_delivery_claim_unavailable', retryable, outcome, cycle }
  }
  let sent = false
  try { sent = await send(`SuperMega | ${selection.selected.title}\n\n${result.answer}`) } catch { sent = false }
  let retryable
  if (!sent) {
    const deliveryReleased = await releaseClaimSafely(releaseDelivery, deliveryClaim)
    const executionReleased = await releaseClaimSafely(releaseDelivery, executionClaim)
    retryable = deliveryReleased && executionReleased
  }
  return {
    ok: Boolean(sent),
    mode: 'legacy',
    companyMode: 'supermega_hq',
    sent: Boolean(sent),
    reason: sent ? undefined : 'owner_delivery_failed',
    retryable,
    outcome,
    cycle,
    planningMode: result.planningMode || null,
    toolsUsed: (result.results || []).map((item) => item.tool),
    outcomeMetrics,
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
