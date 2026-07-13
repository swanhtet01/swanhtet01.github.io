// Deterministic supervisor for bounded, draft-only company cycles.
// Specialists are fixed crew definitions; callers cannot invent agents, tools, or model tiers.

import { createHash } from 'node:crypto'

import { loadCrew } from './crew-runner.mjs'
import { runCrew } from './crew-run.mjs'
import {
  claimActivity,
  getCachedResponse,
  putCachedResponse,
  releaseActivityClaim,
} from './store.mjs'

export const MAX_CYCLE_AGENTS = 2
export const MAX_CYCLE_ROLE_BUDGET = 8
export const MAX_AGENT_EVIDENCE_BYTES = 12_000

export const AGENT_ROSTER = Object.freeze([
  Object.freeze({
    id: 'operations-analyst',
    name: 'Operations Analyst',
    department: 'operations',
    crew: 'daily-operator-brief',
    outcome: 'Ranks the day by money at stake and identifies the next operational risk.',
  }),
  Object.freeze({
    id: 'cash-reconciler',
    name: 'Cash Reconciler',
    department: 'finance',
    crew: 'reconcile-premium',
    outcome: 'Reconciles payment channels against POS evidence and drafts the close packet.',
  }),
  Object.freeze({
    id: 'receivables-agent',
    name: 'Receivables Agent',
    department: 'revenue',
    crew: 'chase-the-money',
    outcome: 'Finds open balances and prepares customer-language reminder drafts.',
  }),
  Object.freeze({
    id: 'evidence-organizer',
    name: 'Evidence Organizer',
    department: 'operations',
    crew: 'read-my-chaos',
    outcome: 'Turns owner-provided business messages into traceable ledgers and follow-ups.',
  }),
  Object.freeze({
    id: 'proof-builder',
    name: 'Proof Builder',
    department: 'delivery',
    crew: 'source-to-screen-pilot',
    outcome: 'Builds one source-traced proof and a human approval packet.',
  }),
  Object.freeze({
    id: 'sales-qualifier',
    name: 'Sales Qualifier',
    department: 'growth',
    crew: 'lead-qualification-desk',
    outcome: 'Qualifies one opportunity from evidence and drafts the smallest useful next step.',
  }),
  Object.freeze({
    id: 'delivery-planner',
    name: 'Delivery Planner',
    department: 'delivery',
    crew: 'delivery-planning-desk',
    outcome: 'Turns an accepted outcome into milestones, dependencies, and objective acceptance checks.',
  }),
  Object.freeze({
    id: 'quality-reviewer',
    name: 'Quality Reviewer',
    department: 'assurance',
    crew: 'quality-review-desk',
    outcome: 'Audits a deliverable against sources and acceptance rules before owner release.',
  }),
])

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

export function listCompanyAgents() {
  return AGENT_ROSTER.map((agent) => ({ ...agent }))
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
  const requireDurableClaim = options.requireDurableClaim !== false
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
    try { await release(plan.runId) } catch { /* no model call has started */ }
    return failure('company_durable_claim_required', { status: 'blocked', runId: plan.runId })
  }

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
    trace: results.map((result, index) => ({
      order: index + 1,
      agentId: result.agentId,
      crew: result.crew,
      status: result.status,
      usedRoleCalls: result.usedRoleCalls,
    })),
    retry: status === 'completed' ? null : { requiresNewCycleId: true },
  }
  let durableResultStored = false
  try { durableResultStored = Boolean(await saveResult(finalResultKey(plan.runId), envelope)) }
  catch { durableResultStored = false }
  return { ...envelope, persistedAgentResults, durableResultStored }
}

export default { AGENT_ROSTER, listCompanyAgents, planCompanyCycle, runCompanyCycle }
