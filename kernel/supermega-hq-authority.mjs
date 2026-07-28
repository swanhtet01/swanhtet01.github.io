import { createHash } from 'node:crypto'

export const CEO_OUTCOME_AUTHORITY_CONTRACT = 'supermega.ceo-outcome-authority.v1'

const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/
const OUTCOME_STATES = new Set(['ready', 'blocked', 'done'])
const ACTION_MODES = new Set(['read_only_brief', 'credentialed_provider_read', 'protected_preview', 'managed_pilot'])
const SAFE_EVIDENCE_TOOLS = new Set(['platform_status', 'company_operations_status', 'leads_overview', 'pipeline_overview', 'fx_rate'])
const AUTHORITY_FIELDS = new Set([
  'contract',
  'authorityId',
  'company',
  'northStar',
  'selectionPolicy',
  'maxSelectedOutcomes',
  'controls',
  'outcomes',
])
const CONTROL_FIELDS = new Set([
  'allowedActionModes',
  'externalWrites',
  'dynamicDelegation',
  'recursiveDelegation',
  'humanApprovalForConsequentialActions',
])
const OUTCOME_FIELDS = new Set([
  'id',
  'title',
  'team',
  'priority',
  'state',
  'actionMode',
  'deliverable',
  'objective',
  'blockers',
  'evidencePlan',
  'sourceRefs',
])
const STEP_FIELDS = new Set(['tool', 'args'])

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function unknownFields(value, allowed) {
  return Object.keys(value).filter((field) => !allowed.has(field))
}

function boundedText(value, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text && text.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? text : ''
}

function normalizedIds(value) {
  if (value === undefined) return new Set()
  if (!Array.isArray(value) || value.length > 24) return null
  const ids = value.map((item) => boundedText(item, 80))
  if (ids.some((id) => !ID_RE.test(id)) || new Set(ids).size !== ids.length) return null
  return new Set(ids)
}

function normalizeEvidencePlan(value) {
  if (!Array.isArray(value) || value.length > 4) return null
  const steps = []
  for (const step of value) {
    if (!isRecord(step) || unknownFields(step, STEP_FIELDS).length) return null
    const tool = boundedText(step.tool, 80)
    if (!SAFE_EVIDENCE_TOOLS.has(tool) || !isRecord(step.args)) return null
    let serialized
    try { serialized = JSON.stringify(step.args) } catch { return null }
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > 1_000) return null
    steps.push({ tool, args: JSON.parse(serialized) })
  }
  return steps
}

function normalizeAuthority(value) {
  if (!isRecord(value) || unknownFields(value, AUTHORITY_FIELDS).length) return null
  if (value.contract !== CEO_OUTCOME_AUTHORITY_CONTRACT) return null
  const authorityId = boundedText(value.authorityId, 80)
  const company = boundedText(value.company, 80)
  const northStar = boundedText(value.northStar, 300)
  if (!ID_RE.test(authorityId) || company !== 'supermega' || !northStar) return null
  if (value.selectionPolicy !== 'priority_then_id' || value.maxSelectedOutcomes !== 1) return null

  const controls = value.controls
  if (!isRecord(controls) || unknownFields(controls, CONTROL_FIELDS).length) return null
  if (!Array.isArray(controls.allowedActionModes)
    || controls.allowedActionModes.length !== 1
    || controls.allowedActionModes[0] !== 'read_only_brief'
    || controls.externalWrites !== false
    || controls.dynamicDelegation !== false
    || controls.recursiveDelegation !== false
    || controls.humanApprovalForConsequentialActions !== true) return null

  if (!Array.isArray(value.outcomes) || value.outcomes.length < 1 || value.outcomes.length > 12) return null
  const outcomes = []
  for (const candidate of value.outcomes) {
    if (!isRecord(candidate) || unknownFields(candidate, OUTCOME_FIELDS).length) return null
    const id = boundedText(candidate.id, 80)
    const title = boundedText(candidate.title, 160)
    const team = boundedText(candidate.team, 40)
    const state = boundedText(candidate.state, 20)
    const actionMode = boundedText(candidate.actionMode, 40)
    const deliverable = boundedText(candidate.deliverable, 400)
    const objective = boundedText(candidate.objective, 1_200)
    if (!ID_RE.test(id) || !ID_RE.test(team) || !title || !deliverable || !objective) return null
    if (!Number.isInteger(candidate.priority) || candidate.priority < 0 || candidate.priority > 100) return null
    if (!OUTCOME_STATES.has(state) || !ACTION_MODES.has(actionMode)) return null

    const blockers = normalizedIds(candidate.blockers)
    const evidencePlan = normalizeEvidencePlan(candidate.evidencePlan)
    if (blockers === null || evidencePlan === null) return null
    if ((state === 'blocked') !== (blockers.size > 0)) return null
    if (state === 'ready' && (actionMode !== 'read_only_brief' || evidencePlan.length < 1)) return null
    if (state !== 'ready' && evidencePlan.length > 0) return null

    if (!Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length < 1 || candidate.sourceRefs.length > 4) return null
    const sourceRefs = candidate.sourceRefs.map((item) => boundedText(item, 240))
    if (sourceRefs.some((item) => !item) || new Set(sourceRefs).size !== sourceRefs.length) return null
    outcomes.push({
      id,
      title,
      team,
      priority: candidate.priority,
      state,
      actionMode,
      deliverable,
      objective,
      blockers: [...blockers],
      evidencePlan,
      sourceRefs,
    })
  }
  if (new Set(outcomes.map((outcome) => outcome.id)).size !== outcomes.length) return null
  return {
    contract: value.contract,
    authorityId,
    company,
    northStar,
    selectionPolicy: value.selectionPolicy,
    maxSelectedOutcomes: value.maxSelectedOutcomes,
    controls: {
      allowedActionModes: [...controls.allowedActionModes],
      externalWrites: false,
      dynamicDelegation: false,
      recursiveDelegation: false,
      humanApprovalForConsequentialActions: true,
    },
    outcomes,
  }
}

export const SUPERMEGA_HQ_AUTHORITY = Object.freeze({
  contract: CEO_OUTCOME_AUTHORITY_CONTRACT,
  authorityId: 'supermega-hq-2026-07-27',
  company: 'supermega',
  northStar: 'One real workflow reaches a measurable outcome through an accountable operating record.',
  selectionPolicy: 'priority_then_id',
  maxSelectedOutcomes: 1,
  controls: Object.freeze({
    allowedActionModes: Object.freeze(['read_only_brief']),
    externalWrites: false,
    dynamicDelegation: false,
    recursiveDelegation: false,
    humanApprovalForConsequentialActions: true,
  }),
  outcomes: Object.freeze([
    Object.freeze({
      id: 'managed-storage-privacy-proof',
      title: 'Prove private managed storage before activation',
      team: 'finance-risk',
      priority: 100,
      state: 'blocked',
      actionMode: 'credentialed_provider_read',
      deliverable: 'Bucket inventory plus anonymous-list, cross-tenant-list, and short-lived authorized-object evidence.',
      objective: 'Verify that a stranger cannot enumerate or read another tenant\'s uploads even when individual object links look private.',
      blockers: Object.freeze(['isolated-tenant-missing', 'owner-provider-approval-required']),
      evidencePlan: Object.freeze([]),
      sourceRefs: Object.freeze([
        'hq/NOW.md',
        'hq/research/agent-operations-security-2026-07-26.md',
        'https://www.instagram.com/p/Da-NXcnkz8p/?img_index=8',
      ]),
    }),
    Object.freeze({
      id: 'protected-release-preview',
      title: 'Verify the exact protected release candidate',
      team: 'engineering',
      priority: 90,
      state: 'blocked',
      actionMode: 'protected_preview',
      deliverable: 'One exact-commit preview with desktop, mobile, persistence, security, observability, and rollback evidence.',
      objective: 'Prove the clean candidate on the canonical project without changing production aliases.',
      blockers: Object.freeze(['canonical-project-link-missing', 'owner-release-approval-required']),
      evidencePlan: Object.freeze([]),
      sourceRefs: Object.freeze(['hq/NOW.md', 'hq/WORKBOARD.md']),
    }),
    Object.freeze({
      id: 'named-pilot-evidence',
      title: 'Run one named measured product workflow',
      team: 'product',
      priority: 80,
      state: 'blocked',
      actionMode: 'managed_pilot',
      deliverable: 'A named operator, baseline, isolated tenant, five-day evidence plan, and measured workflow outcome.',
      objective: 'Move one Shop, Plant, Website, or Ecommerce workflow from local release candidate to measured customer proof.',
      blockers: Object.freeze(['named-pilot-missing', 'isolated-tenant-missing']),
      evidencePlan: Object.freeze([]),
      sourceRefs: Object.freeze(['hq/portfolio.json', 'hq/NOW.md']),
    }),
    Object.freeze({
      id: 'engineering-release-control',
      title: 'Review engineering and release health',
      team: 'engineering',
      priority: 74,
      state: 'ready',
      actionMode: 'read_only_brief',
      deliverable: 'One exact release-health brief with current platform state, the highest verified delivery risk, and one bounded engineering next action.',
      objective: 'Inspect only the fixed platform evidence. Separate live facts from missing proof, identify the most important quality, security, reliability, or rollback gap, and propose one reversible next action. Do not deploy, modify infrastructure, or invent incident evidence.',
      blockers: Object.freeze([]),
      evidencePlan: Object.freeze([
        Object.freeze({ tool: 'platform_status', args: Object.freeze({}) }),
        Object.freeze({ tool: 'company_operations_status', args: Object.freeze({ window_days: 30 }) }),
      ]),
      sourceRefs: Object.freeze(['hq/NOW.md', 'hq/WORKBOARD.md']),
    }),
    Object.freeze({
      id: 'product-portfolio-control',
      title: 'Review product and customer evidence',
      team: 'product',
      priority: 73,
      state: 'ready',
      actionMode: 'read_only_brief',
      deliverable: 'One evidence-backed product brief naming the strongest customer signal, the largest evidence gap, and one measurable product decision.',
      objective: 'Compare the fixed lead, pipeline, and company-operation evidence across Shop, Plant, Website, and Ecommerce. Prefer a real workflow outcome over feature volume, state missing evidence plainly, and propose one measurable product decision. Do not change the roadmap or customer records.',
      blockers: Object.freeze([]),
      evidencePlan: Object.freeze([
        Object.freeze({ tool: 'leads_overview', args: Object.freeze({ limit: 5 }) }),
        Object.freeze({ tool: 'pipeline_overview', args: Object.freeze({}) }),
        Object.freeze({ tool: 'company_operations_status', args: Object.freeze({ window_days: 30 }) }),
      ]),
      sourceRefs: Object.freeze(['hq/portfolio.json', 'hq/NOW.md']),
    }),
    Object.freeze({
      id: 'growth-pipeline-control',
      title: 'Review growth and onboarding evidence',
      team: 'growth',
      priority: 72,
      state: 'ready',
      actionMode: 'read_only_brief',
      deliverable: 'One supportable growth brief with the best qualified conversation, the next onboarding proof, and one owner-approved communication decision.',
      objective: 'Use only fixed lead, pipeline, and exchange-rate evidence. Rank one qualified conversation and one proof that could reduce onboarding friction for Myanmar customers. Draft no unsupported claim and do not send or modify any communication.',
      blockers: Object.freeze([]),
      evidencePlan: Object.freeze([
        Object.freeze({ tool: 'leads_overview', args: Object.freeze({ limit: 5 }) }),
        Object.freeze({ tool: 'pipeline_overview', args: Object.freeze({}) }),
        Object.freeze({ tool: 'fx_rate', args: Object.freeze({}) }),
        Object.freeze({ tool: 'company_operations_status', args: Object.freeze({ window_days: 30 }) }),
      ]),
      sourceRefs: Object.freeze(['hq/portfolio.json', 'hq/NOW.md']),
    }),
    Object.freeze({
      id: 'finance-risk-control',
      title: 'Review finance, security, and operating risk',
      team: 'finance-risk',
      priority: 71,
      state: 'ready',
      actionMode: 'read_only_brief',
      deliverable: 'One risk-control brief with the largest evidenced exposure, missing control proof, and one owner decision that preserves cash, privacy, or release safety.',
      objective: 'Inspect only fixed pipeline, exchange-rate, and platform evidence. Distinguish measured exposure from missing evidence, retain every production and security gate, and propose one owner decision. Do not pay, approve, change access, or weaken a release gate.',
      blockers: Object.freeze([]),
      evidencePlan: Object.freeze([
        Object.freeze({ tool: 'pipeline_overview', args: Object.freeze({}) }),
        Object.freeze({ tool: 'fx_rate', args: Object.freeze({}) }),
        Object.freeze({ tool: 'platform_status', args: Object.freeze({}) }),
        Object.freeze({ tool: 'company_operations_status', args: Object.freeze({ window_days: 30 }) }),
      ]),
      sourceRefs: Object.freeze(['hq/NOW.md', 'hq/research/agent-operations-security-2026-07-26.md']),
    }),
    Object.freeze({
      id: 'daily-company-control',
      title: 'Prepare one evidence-backed owner decision',
      team: 'product',
      priority: 75,
      state: 'ready',
      actionMode: 'read_only_brief',
      deliverable: 'At most six short lines with real leads, pipeline, company-operation status, missing evidence, and one owner decision.',
      objective: 'Use only the fixed read-only evidence plan. State exact values, distinguish missing evidence, and identify one decision for the owner. Do not send, deploy, pay, modify records, or imply that a blocked outcome is executable.',
      blockers: Object.freeze([]),
      evidencePlan: Object.freeze([
        Object.freeze({ tool: 'leads_overview', args: Object.freeze({ limit: 5 }) }),
        Object.freeze({ tool: 'pipeline_overview', args: Object.freeze({}) }),
        Object.freeze({ tool: 'company_operations_status', args: Object.freeze({ window_days: 30 }) }),
      ]),
      sourceRefs: Object.freeze(['hq/portfolio.json', 'hq/NOW.md']),
    }),
  ]),
})

export function selectCeoOutcome(options = {}) {
  const authority = normalizeAuthority(options.authority ?? SUPERMEGA_HQ_AUTHORITY)
  if (!authority) return { ok: false, reason: 'ceo_outcome_authority_invalid' }
  const completed = normalizedIds(options.completedOutcomeIds)
  const inFlight = normalizedIds(options.inFlightOutcomeIds)
  if (completed === null || inFlight === null) return { ok: false, reason: 'ceo_outcome_state_invalid' }
  const knownIds = new Set(authority.outcomes.map((outcome) => outcome.id))
  if ([...completed, ...inFlight].some((id) => !knownIds.has(id))) {
    return { ok: false, reason: 'ceo_outcome_state_unknown' }
  }
  if ([...completed].some((id) => inFlight.has(id))) return { ok: false, reason: 'ceo_outcome_state_conflict' }

  const authorityDigest = createHash('sha256').update(stableStringify(authority)).digest('hex')
  const skipped = []
  const ordered = [...authority.outcomes].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
  for (const outcome of ordered) {
    if (completed.has(outcome.id) || outcome.state === 'done') {
      skipped.push({ id: outcome.id, reason: 'already_completed' })
      continue
    }
    if (inFlight.has(outcome.id)) {
      skipped.push({ id: outcome.id, reason: 'duplicate_in_flight' })
      continue
    }
    if (outcome.state === 'blocked') {
      skipped.push({ id: outcome.id, reason: 'authority_blocked', blockers: [...outcome.blockers] })
      continue
    }
    if (!authority.controls.allowedActionModes.includes(outcome.actionMode)) {
      skipped.push({ id: outcome.id, reason: 'action_mode_not_authorized' })
      continue
    }
    return {
      ok: true,
      contract: authority.contract,
      authorityId: authority.authorityId,
      authorityDigest,
      northStar: authority.northStar,
      selected: outcome,
      skipped,
      declined: false,
      controls: authority.controls,
    }
  }
  return {
    ok: true,
    contract: authority.contract,
    authorityId: authority.authorityId,
    authorityDigest,
    northStar: authority.northStar,
    selected: null,
    skipped,
    declined: true,
    reason: 'no_authorized_ceo_outcome',
    controls: authority.controls,
  }
}

export function buildCeoOutcomeGoal(selection) {
  if (!selection?.ok || !selection.selected || selection.declined) return ''
  const blocked = selection.skipped
    .filter((item) => item.reason === 'authority_blocked')
    .map((item) => `${item.id} (${item.blockers.join(', ')})`)
    .join('; ')
  return [
    `HQ authority: ${selection.authorityId} / ${selection.authorityDigest}`,
    `North star: ${selection.northStar}`,
    `Selected outcome: ${selection.selected.title}`,
    `Deliverable: ${selection.selected.deliverable}`,
    `Objective: ${selection.selected.objective}`,
    `Blocked context only - never execute or present as ready: ${blocked || 'none'}`,
  ].join('\n')
}

export default { SUPERMEGA_HQ_AUTHORITY, selectCeoOutcome, buildCeoOutcomeGoal }
