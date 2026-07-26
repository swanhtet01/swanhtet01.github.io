// Deterministic supervisor for bounded, draft-only company cycles.
// Specialists are fixed crew definitions; callers cannot invent agents, tools, or model tiers.

import { createHash } from 'node:crypto'

import { loadCrew } from './crew-runner.mjs'
import { runCrew } from './crew-run.mjs'
import {
  claimActivity,
  getActivityClaim,
  getCachedResponse,
  putCachedResponse,
  releaseActivityClaim,
  transitionActivityClaim,
} from './store.mjs'

export const MAX_CYCLE_AGENTS = 2
export const MAX_CYCLE_ROLE_BUDGET = 8
export const MAX_AGENT_EVIDENCE_BYTES = 12_000
export const MAX_REGISTERED_COMPANY_AGENTS = 12
export const MAX_RUNNING_COMPANY_CYCLES = 4
export const COMPANY_CAPACITY_CLAIM_CONTRACT = 'supermega.agent-company-capacity-claims.v1'
export const COMPANY_CAPACITY_CLAIM_TTL_SECONDS = 120

const specialist = (definition) => Object.freeze({
  ...definition,
  capabilityCrews: Object.freeze([...(definition.capabilityCrews || [])]),
})

export const AGENT_ROSTER = Object.freeze([
  specialist({
    id: 'operations-analyst',
    name: 'Operations Analyst',
    department: 'operations',
    crew: 'daily-operator-brief',
    capabilityCrews: ['data-insights-desk'],
    outcome: 'Ranks the day by money at stake and identifies the next operational risk.',
    evidenceHint: 'Provide current sales, cash, delivery, staffing, exceptions, or approved analytical exports and definitions for one operating decision.',
  }),
  specialist({
    id: 'cash-reconciler',
    name: 'Cash Reconciler',
    department: 'finance',
    crew: 'reconcile-premium',
    outcome: 'Reconciles payment channels against POS evidence and drafts the close packet.',
    evidenceHint: 'Provide POS totals and matching MMQR, KBZPay, WavePay, cash, shift, or staff records.',
  }),
  specialist({
    id: 'receivables-agent',
    name: 'Receivables Agent',
    department: 'revenue',
    crew: 'chase-the-money',
    outcome: 'Finds open balances and prepares customer-language reminder drafts.',
    evidenceHint: 'Provide approved invoice, balance, payment, and customer-thread evidence with dates and currency.',
  }),
  specialist({
    id: 'evidence-organizer',
    name: 'Evidence Organizer',
    department: 'operations',
    crew: 'read-my-chaos',
    outcome: 'Turns owner-provided business messages into traceable ledgers and follow-ups.',
    evidenceHint: 'Provide an owner-approved business inbox or chat export with personal threads removed.',
  }),
  specialist({
    id: 'proof-builder',
    name: 'Proof Builder',
    department: 'delivery',
    crew: 'source-to-screen-pilot',
    outcome: 'Builds one source-traced proof and a human approval packet.',
    evidenceHint: 'Provide the approved order packet, source files or links, acceptance test, and known constraints.',
  }),
  specialist({
    id: 'sales-qualifier',
    name: 'Sales Qualifier',
    department: 'growth',
    crew: 'lead-qualification-desk',
    outcome: 'Qualifies one opportunity from evidence and drafts the smallest useful next step.',
    evidenceHint: 'Provide approved lead notes, buyer, problem, timing, budget evidence, and discovery gaps.',
  }),
  specialist({
    id: 'delivery-planner',
    name: 'Delivery Planner',
    department: 'delivery',
    crew: 'delivery-planning-desk',
    outcome: 'Turns an accepted outcome into milestones, dependencies, and objective acceptance checks.',
    evidenceHint: 'Provide the accepted outcome, deadline, owners, dependencies, constraints, and acceptance rules.',
  }),
  specialist({
    id: 'quality-reviewer',
    name: 'Quality Reviewer',
    department: 'assurance',
    crew: 'quality-review-desk',
    outcome: 'Audits a deliverable against sources and acceptance rules before owner release.',
    evidenceHint: 'Provide the exact draft, source trace, tests, acceptance rules, and declared limitations.',
  }),
  specialist({
    id: 'customer-support-operator',
    name: 'Customer Support Operator',
    department: 'service',
    crew: 'customer-support-desk',
    outcome: 'Triages support evidence, drafts resolution paths, and identifies escalations and knowledge gaps.',
    evidenceHint: 'Provide approved ticket or message text, account and order facts, policy excerpts, and prior actions.',
  }),
  specialist({
    id: 'knowledge-manager',
    name: 'Knowledge Manager',
    department: 'knowledge',
    crew: 'knowledge-base-desk',
    capabilityCrews: ['document-processing-desk'],
    outcome: 'Extracts approved business documents and turns accepted source material into canonical answers, procedures, and a controlled update queue.',
    evidenceHint: 'Provide approved documents or OCR, required fields, policies, manuals, source owners, validation rules, effective dates, and publication scope.',
  }),
  specialist({
    id: 'project-controller',
    name: 'Project Controller',
    department: 'delivery',
    crew: 'project-control-desk',
    capabilityCrews: ['meeting-actions-desk'],
    outcome: 'Captures approved meeting actions, finds critical-path risk, and produces a factual owner update with the next accountable actions.',
    evidenceHint: 'Provide the approved notes or transcript, baseline plan, current milestones, owners, dates, dependencies, decision rules, changes, and blockers.',
  }),
  specialist({
    id: 'procurement-analyst',
    name: 'Procurement Analyst',
    department: 'procurement',
    crew: 'procurement-review-desk',
    outcome: 'Normalizes supplier quotes and prepares a traceable comparison, risk register, and decision packet.',
    evidenceHint: 'Provide approved quotes, specifications, commercial terms, currencies, evaluation rules, and known gaps.',
  }),
])

const rosterIds = AGENT_ROSTER.map((agent) => agent.id)
const rosterCrews = AGENT_ROSTER.flatMap((agent) => [agent.crew, ...agent.capabilityCrews])
if (
  AGENT_ROSTER.length !== MAX_REGISTERED_COMPANY_AGENTS
  || new Set(rosterIds).size !== rosterIds.length
  || new Set(rosterCrews).size !== rosterCrews.length
) {
  throw new Error('company_roster_contract_invalid')
}

const ROSTER_BY_ID = new Map(AGENT_ROSTER.map((agent) => [agent.id, agent]))
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const INPUT_FIELDS = new Set(['clientId', 'cycleId', 'agents', 'evidence', 'roleBudget'])

const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function normalizeId(value, field) {
  const normalized = String(value || '').trim()
  return ID_RE.test(normalized) ? normalized : failure(`company_invalid_${field}`)
}

function normalizeEvidence(value, agentId) {
  let text = ''
  try {
    text = typeof value === 'string' ? value.trim() : JSON.stringify(value)
  } catch {
    return failure('company_invalid_evidence', { agentId })
  }
  if (!text || text === 'null' || text === 'undefined') {
    return failure('company_missing_evidence', { agentId })
  }
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAX_AGENT_EVIDENCE_BYTES) {
    return failure('company_evidence_too_large', {
      agentId,
      evidenceBytes: bytes,
      maxEvidenceBytes: MAX_AGENT_EVIDENCE_BYTES,
    })
  }
  return { ok: true, text, bytes }
}

function runIdFor(clientId, cycleId) {
  const digest = createHash('sha256').update(`${clientId}\n${cycleId}`).digest('hex').slice(0, 40)
  return `agent-company:${digest}`
}

const finalResultKey = (runId) => `company-cycle:${runId}:final`
const agentResultKey = (runId, index) => `company-cycle:${runId}:agent:${index + 1}`
const capacityClaimKey = (slot) => `agent-company-capacity:${slot}`
const capacityLeaseRef = (runId, expiresAtMs) => `${runId}|${expiresAtMs}`
const capacityLeaseExpiry = (value) => {
  const match = /^agent-company:[a-f0-9]{40}\|([0-9]{13})$/.exec(String(value || ''))
  return match ? Number(match[1]) : null
}

async function acquireCompanyCapacityClaim(plan, {
  reserve,
  release,
  readClaim,
  transferClaim,
  requireDurableClaim,
  nowMs,
}) {
  let observedAtMs
  try { observedAtMs = Number(nowMs()) }
  catch { observedAtMs = Number.NaN }
  if (!Number.isFinite(observedAtMs) || observedAtMs < 0) {
    return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
  }
  const leaseRef = capacityLeaseRef(
    plan.runId,
    Math.floor(observedAtMs) + (COMPANY_CAPACITY_CLAIM_TTL_SECONDS * 1_000),
  )
  for (let slot = 1; slot <= MAX_RUNNING_COMPANY_CYCLES; slot++) {
    const claimId = capacityClaimKey(slot)
    let claim
    try {
      claim = await reserve({
        id: claimId,
        kind: 'agent_company_capacity',
        summary: `Bounded company execution slot ${slot}`,
        ref: leaseRef,
      })
    } catch {
      return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
    }
    if (claim?.fresh) {
      if (requireDurableClaim && !claim.durable) {
        try { await release(claimId, leaseRef) } catch { /* no model call has started */ }
        return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
      }
      return { ok: true, claimId, leaseRef, slot, durable: Boolean(claim.durable) }
    }
    if (requireDurableClaim && !claim?.durable) {
      return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
    }

    let existing
    try { existing = await readClaim(claimId) }
    catch { existing = { claim: null, durable: false, reason: 'claim_store_unavailable' } }
    if (requireDurableClaim && !existing?.durable) {
      return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
    }
    if (!existing?.claim) {
      let retry
      try {
        retry = await reserve({
          id: claimId,
          kind: 'agent_company_capacity',
          summary: `Bounded company execution slot ${slot}`,
          ref: leaseRef,
        })
      } catch {
        retry = { fresh: false, durable: false }
      }
      if (retry?.fresh && (!requireDurableClaim || retry.durable)) {
        return { ok: true, claimId, leaseRef, slot, durable: Boolean(retry.durable) }
      }
      if (requireDurableClaim && !retry?.durable) {
        return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
      }
      continue
    }

    const existingExpiry = capacityLeaseExpiry(existing.claim.ref)
    if (existingExpiry === null) {
      return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
    }
    if (existingExpiry > observedAtMs) continue

    let transferred
    try { transferred = await transferClaim(claimId, existing.claim.ref, leaseRef) }
    catch { transferred = { updated: false, durable: false, reason: 'claim_store_unavailable' } }
    if (transferred?.updated && (!requireDurableClaim || transferred.durable)) {
      return { ok: true, claimId, leaseRef, slot, durable: Boolean(transferred.durable), recovered: true }
    }
    if (requireDurableClaim && !transferred?.durable) {
      return failure('company_capacity_unavailable', { status: 'blocked', runId: plan.runId })
    }
  }
  return failure('company_capacity_exhausted', {
    status: 'busy',
    runId: plan.runId,
    maxRunning: MAX_RUNNING_COMPANY_CYCLES,
    retry: { sameCycleIdAllowed: true },
  })
}

export function listCompanyAgents() {
  return AGENT_ROSTER.map((agent) => ({
    ...agent,
    capabilityCrews: [...agent.capabilityCrews],
  }))
}

async function prepareCompanyCycle(input, options = {}) {
  if (!isRecord(input)) return failure('company_invalid_request')
  const unknownFields = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort()
  if (unknownFields.length) return failure('company_unknown_field', { fields: unknownFields })

  const clientId = normalizeId(input.clientId, 'client_id')
  if (isRecord(clientId)) return clientId
  const cycleId = normalizeId(input.cycleId, 'cycle_id')
  if (isRecord(cycleId)) return cycleId

  if (!Array.isArray(input.agents) || !input.agents.length) return failure('company_missing_agents')
  if (input.agents.length > MAX_CYCLE_AGENTS) {
    return failure('company_agent_limit_exceeded', { maxAgents: MAX_CYCLE_AGENTS })
  }
  const agentIds = input.agents.map((value) => String(value || '').trim())
  if (new Set(agentIds).size !== agentIds.length) return failure('company_duplicate_agent')
  const unknownAgents = agentIds.filter((id) => !ROSTER_BY_ID.has(id))
  if (unknownAgents.length) return failure('company_unknown_agent', { agents: unknownAgents })

  const roleBudget = input.roleBudget === undefined ? MAX_CYCLE_ROLE_BUDGET : Number(input.roleBudget)
  if (!Number.isInteger(roleBudget) || roleBudget < 1 || roleBudget > MAX_CYCLE_ROLE_BUDGET) {
    return failure('company_invalid_role_budget', { maxRoleBudget: MAX_CYCLE_ROLE_BUDGET })
  }
  if (!isRecord(input.evidence)) return failure('company_invalid_evidence_map')
  const extraEvidence = Object.keys(input.evidence).filter((id) => !agentIds.includes(id)).sort()
  if (extraEvidence.length) return failure('company_unassigned_evidence', { agents: extraEvidence })

  const readCrew = options.loadCrew || loadCrew
  const normalizedEvidence = new Map()
  const assignments = []
  for (const agentId of agentIds) {
    const agent = ROSTER_BY_ID.get(agentId)
    const evidence = normalizeEvidence(input.evidence[agentId], agentId)
    if (!evidence.ok) return evidence
    normalizedEvidence.set(agentId, evidence.text)

    let crew
    try { crew = await readCrew(agent.crew) }
    catch { return failure('company_roster_invalid', { agentId }) }
    assignments.push({
      agentId: agent.id,
      name: agent.name,
      department: agent.department,
      outcome: agent.outcome,
      crew: crew.slug,
      crewVersion: crew.version,
      minimumPlan: crew.plan || 'all',
      requiresAccountAccess: Boolean(crew.requires_account_access),
      roleCount: crew.roles.length,
      roles: crew.roles.map((role) => ({ id: role.id, title: role.title, tier: role.tier })),
      returns: [...crew.output_contract.fields],
      evidenceBytes: evidence.bytes,
    })
  }

  const plannedRoles = assignments.reduce((total, assignment) => total + assignment.roleCount, 0)
  if (plannedRoles > roleBudget) {
    return failure('company_role_budget_exceeded', { plannedRoles, roleBudget })
  }

  const runId = runIdFor(clientId, cycleId)
  const plan = {
    ok: true,
    mode: 'plan',
    runId,
    clientId,
    cycleId,
    actionMode: 'draft_only',
    approvalRequired: true,
    assignments,
    budget: {
      agentLimit: MAX_CYCLE_AGENTS,
      selectedAgents: assignments.length,
      roleLimit: roleBudget,
      plannedRoles,
      remainingRoles: roleBudget - plannedRoles,
    },
    controls: {
      execution: 'sequential',
      capacityClaimContract: COMPANY_CAPACITY_CLAIM_CONTRACT,
      capacityClaimTtlSeconds: COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
      maxConcurrentCycles: MAX_RUNNING_COMPANY_CYCLES,
      dynamicDelegation: false,
      crossAgentContext: false,
      externalWrites: false,
      durableClaimRequired: true,
    },
  }
  return { ok: true, plan, normalizedEvidence }
}

export async function planCompanyCycle(input, options = {}) {
  const prepared = await prepareCompanyCycle(input, options)
  return prepared.ok ? prepared.plan : prepared
}

function normalizeCrewResult(assignment, result) {
  const usageByRole = Array.isArray(result?.usageByRole) ? result.usageByRole : []
  const trace = Array.isArray(result?.trace) ? result.trace : []
  const guardrails = isRecord(result?.guardrails) ? {
    version: Number(result.guardrails.version) || 1,
    intakeTreatedAsUntrustedData: result.guardrails.intakeTreatedAsUntrustedData === true,
    handoffsResanitized: result.guardrails.handoffsResanitized === true,
    outputFieldsAllowlisted: result.guardrails.outputFieldsAllowlisted === true,
    externalToolAccess: result.guardrails.externalToolAccess === true,
    externalWrites: result.guardrails.externalWrites === true,
    persistentMemory: result.guardrails.persistentMemory === true,
    maxUntrustedBytes: Number(result.guardrails.maxUntrustedBytes) || null,
    maxUntrustedChars: Number(result.guardrails.maxUntrustedChars) || null,
    maxRoles: Number(result.guardrails.maxRoles) || null,
    maxOutputFields: Number(result.guardrails.maxOutputFields) || null,
  } : null
  if (result?.ok && !result.gated) {
    return {
      ok: true,
      status: 'completed',
      agentId: assignment.agentId,
      department: assignment.department,
      crew: assignment.crew,
      output: result.output,
      usedRoleCalls: usageByRole.length,
      usageByRole,
      trace,
      guardrails,
    }
  }
  if (result?.ok && result.gated) {
    return {
      ok: false,
      status: 'gated',
      agentId: assignment.agentId,
      department: assignment.department,
      crew: assignment.crew,
      planRequired: result.plan_required || assignment.minimumPlan,
      fallback: result.free_tier_fallback || null,
      usedRoleCalls: usageByRole.length,
      usageByRole,
      trace,
      guardrails,
    }
  }
  return {
    ok: false,
    status: 'failed',
    agentId: assignment.agentId,
    department: assignment.department,
    crew: assignment.crew,
    reason: String(result?.reason || 'company_agent_failed').slice(0, 120),
    role: result?.role ? String(result.role).slice(0, 80) : undefined,
    usedRoleCalls: usageByRole.length,
    usageByRole,
    trace,
    guardrails,
  }
}

export async function runCompanyCycle(input, options = {}) {
  const prepared = await prepareCompanyCycle(input, options)
  if (!prepared.ok) return prepared
  const { plan, normalizedEvidence } = prepared

  const reserve = options.claimActivity || claimActivity
  const release = options.releaseActivityClaim || releaseActivityClaim
  const readResult = options.getRunResult || getCachedResponse
  const saveResult = options.putRunResult || putCachedResponse
  const readClaim = options.getActivityClaim || getActivityClaim
  const transferClaim = options.transitionActivityClaim || transitionActivityClaim
  const requireDurableClaim = options.requireDurableClaim !== false
  const capacityNowMs = options.capacityNowMs || Date.now
  let claim
  try {
    claim = await reserve({
      id: plan.runId,
      kind: 'agent_company_cycle',
      summary: `${plan.assignments.length} bounded specialists for cycle ${plan.cycleId}`,
      ref: plan.clientId,
    })
  } catch {
    claim = { fresh: false, durable: false, reason: 'claim_store_unavailable' }
  }
  if (!claim?.fresh) {
    if (!claim?.durable) {
      return failure('company_claim_unavailable', { status: 'blocked', runId: plan.runId })
    }
    try {
      const completedRun = await readResult(finalResultKey(plan.runId))
      if (isRecord(completedRun) && completedRun.runId === plan.runId && completedRun.clientId === plan.clientId) {
        return { ...completedRun, replayed: true, durableResultStored: true }
      }
    } catch { /* return the duplicate envelope below */ }
    const recoveredResults = []
    for (let index = 0; index < plan.assignments.length; index++) {
      try {
        const saved = await readResult(agentResultKey(plan.runId, index))
        if (isRecord(saved) && saved.runId === plan.runId && isRecord(saved.result)) {
          recoveredResults.push(saved.result)
        }
      } catch { /* one missing partial result does not hide the others */ }
    }
    return failure('company_cycle_already_claimed', {
      status: 'duplicate',
      runId: plan.runId,
      recoveredResults,
      retry: { requiresNewCycleId: true },
    })
  }
  if (requireDurableClaim && !claim.durable) {
    try { await release(plan.runId, plan.clientId) } catch { /* no model call has started */ }
    return failure('company_durable_claim_required', { status: 'blocked', runId: plan.runId })
  }

  const capacity = await acquireCompanyCapacityClaim(plan, {
    reserve,
    release,
    readClaim,
    transferClaim,
    requireDurableClaim,
    nowMs: capacityNowMs,
  })
  if (!capacity.ok) {
    try { await release(plan.runId, plan.clientId) } catch { /* capacity rejected before model use */ }
    return capacity
  }

  try {
    const executeCrew = options.runCrew || runCrew
    const results = []
    let persistedAgentResults = 0
    for (let index = 0; index < plan.assignments.length; index++) {
      const assignment = plan.assignments[index]
      let result
      try {
        result = await executeCrew(assignment.crew, normalizedEvidence.get(assignment.agentId), {
          clientId: plan.clientId,
        })
      } catch {
        result = { ok: false, reason: 'company_agent_failed' }
      }
      const normalized = normalizeCrewResult(assignment, result)
      results.push(normalized)
      try {
        const stored = await saveResult(agentResultKey(plan.runId, index), {
          version: 1,
          runId: plan.runId,
          clientId: plan.clientId,
          cycleId: plan.cycleId,
          result: normalized,
        })
        if (stored) persistedAgentResults += 1
      } catch { /* the caller still receives the completed specialist result */ }
    }

    const completed = results.filter((result) => result.status === 'completed').length
    const gated = results.filter((result) => result.status === 'gated').length
    const failed = results.length - completed - gated
    const status = completed === results.length ? 'completed'
      : completed > 0 ? 'partial'
        : gated > 0 && failed === 0 ? 'blocked'
          : 'failed'
    const usedRoleCalls = results.reduce((total, result) => total + result.usedRoleCalls, 0)

    const envelope = {
      ok: completed > 0,
      mode: 'run',
      status,
      runId: plan.runId,
      clientId: plan.clientId,
      cycleId: plan.cycleId,
      actionMode: 'draft_only',
      approvalRequired: true,
      results,
      budget: { ...plan.budget, usedRoleCalls },
      capacity: {
        contract: COMPANY_CAPACITY_CLAIM_CONTRACT,
        maxConcurrentCycles: MAX_RUNNING_COMPANY_CYCLES,
        claimTtlSeconds: COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
        release: 'finally',
      },
      trace: results.map((result, index) => ({
        order: index + 1,
        agentId: result.agentId,
        crew: result.crew,
        status: result.status,
        usedRoleCalls: result.usedRoleCalls,
        guardrails: result.guardrails,
      })),
      retry: status === 'completed' ? null : { requiresNewCycleId: true },
    }
    let durableResultStored = false
    try { durableResultStored = Boolean(await saveResult(finalResultKey(plan.runId), envelope)) }
    catch { durableResultStored = false }
    return { ...envelope, persistedAgentResults, durableResultStored }
  } finally {
    try { await release(capacity.claimId, capacity.leaseRef) } catch { /* the bounded slot remains fail-closed */ }
  }
}

export default {
  AGENT_ROSTER,
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
  MAX_RUNNING_COMPANY_CYCLES,
  MAX_REGISTERED_COMPANY_AGENTS,
  listCompanyAgents,
  planCompanyCycle,
  runCompanyCycle,
}
