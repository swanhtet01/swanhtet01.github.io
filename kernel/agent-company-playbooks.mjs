// Deterministic, plan-only delegation across the existing durable work-order boundary.
// A playbook describes staged handoffs; it never queues, dispatches, or forwards model output.

import { createHash } from 'node:crypto'

import { listCompanyAgents, MAX_CYCLE_ROLE_BUDGET } from './agent-company.mjs'
import { loadCrew } from './crew-runner.mjs'

const stage = (id, name, agentId, objective) => Object.freeze({ id, name, agentId, objective })
const playbook = (definition) => Object.freeze({
  ...definition,
  stages: Object.freeze(definition.stages),
})

export const COMPANY_PLAYBOOKS = Object.freeze([
  playbook({
    id: 'source-to-decision',
    name: 'Source to decision',
    buyerOutcome: 'Turn scattered source material into a checked decision brief.',
    deliverable: 'A traceable evidence ledger, decision analysis, and independent quality verdict.',
    intake: 'Approved messages, files, exports, definitions, business question, and known gaps.',
    stages: [
      stage('organize', 'Organize evidence', 'evidence-organizer', 'Normalize sources, facts, gaps, and accountable follow-ups.'),
      stage('analyze', 'Build decision analysis', 'data-insights-analyst', 'Calculate only source-supported metrics and frame the decision.'),
      stage('assure', 'Review the decision packet', 'quality-reviewer', 'Audit the exact packet against sources and acceptance rules.'),
    ],
  }),
  playbook({
    id: 'lead-to-first-proof',
    name: 'Lead to first proof',
    buyerOutcome: 'Move one qualified problem to a bounded, reviewable first proof.',
    deliverable: 'A fit decision, delivery plan, source-traced proof, and release verdict.',
    intake: 'Approved buyer facts, repeated task, source material, constraints, and useful-result definition.',
    stages: [
      stage('qualify', 'Qualify the problem', 'sales-qualifier', 'Confirm buyer fit, evidence gaps, and the smallest useful proof.'),
      stage('plan', 'Plan delivery', 'delivery-planner', 'Define milestones, owner inputs, dependencies, and acceptance checks.'),
      stage('build', 'Build first proof', 'proof-builder', 'Create one source-traced proof and its approval packet.'),
      stage('assure', 'Review first proof', 'quality-reviewer', 'Audit the proof against sources, tests, and acceptance rules.'),
    ],
  }),
  playbook({
    id: 'support-to-knowledge',
    name: 'Support to knowledge',
    buyerOutcome: 'Resolve repeated support work and turn it into reusable operating knowledge.',
    deliverable: 'A resolution packet, canonical procedure update, and quality verdict.',
    intake: 'Approved tickets, account facts, policy sources, prior actions, and publication scope.',
    stages: [
      stage('resolve', 'Resolve the case', 'customer-support-operator', 'Triage evidence and draft the bounded resolution path.'),
      stage('codify', 'Codify the answer', 'knowledge-manager', 'Turn accepted facts into canonical answers and procedures.'),
      stage('assure', 'Review the knowledge packet', 'quality-reviewer', 'Check the exact procedure against sources and boundaries.'),
    ],
  }),
  playbook({
    id: 'cash-control',
    name: 'Cash control',
    buyerOutcome: 'Close the cash picture and surface the next money-at-risk action.',
    deliverable: 'A reconciled close packet, ranked operator brief, and quality verdict.',
    intake: 'Approved POS, cash, payment-channel, shift, exception, and operating-period evidence.',
    stages: [
      stage('reconcile', 'Reconcile cash', 'cash-reconciler', 'Match payment channels to POS evidence and isolate exceptions.'),
      stage('prioritize', 'Prioritize action', 'operations-analyst', 'Rank the verified exceptions by money and operational risk.'),
      stage('assure', 'Review the close packet', 'quality-reviewer', 'Check reconciliation and actions against supplied evidence.'),
    ],
  }),
  playbook({
    id: 'project-recovery',
    name: 'Project recovery',
    buyerOutcome: 'Turn a slipping project into an evidence-backed recovery decision.',
    deliverable: 'Critical-path findings, recovery plan, and independent quality verdict.',
    intake: 'Approved baseline, current status, owners, dates, dependencies, changes, and blockers.',
    stages: [
      stage('diagnose', 'Diagnose delivery risk', 'project-controller', 'Identify critical-path variance, blockers, and accountable actions.'),
      stage('replan', 'Build recovery plan', 'delivery-planner', 'Convert accepted findings into milestones and acceptance checks.'),
      stage('assure', 'Review recovery plan', 'quality-reviewer', 'Audit the exact plan against evidence and constraints.'),
    ],
  }),
  playbook({
    id: 'documents-to-system',
    name: 'Documents to system',
    buyerOutcome: 'Turn mixed business documents into structured, reusable operating records.',
    deliverable: 'A validated document register, canonical knowledge update, and quality verdict.',
    intake: 'Approved business documents, field requirements, source labels, effective dates, and known exceptions.',
    stages: [
      stage('extract', 'Process documents', 'document-processor', 'Extract required fields with source references and exception flags.'),
      stage('codify', 'Build operating knowledge', 'knowledge-manager', 'Convert accepted records into canonical answers and procedures.'),
      stage('assure', 'Review the records', 'quality-reviewer', 'Audit structured records and procedures against source documents.'),
    ],
  }),
  playbook({
    id: 'meeting-to-delivery',
    name: 'Meeting to delivery',
    buyerOutcome: 'Convert a business meeting into accountable execution without invented commitments.',
    deliverable: 'A decision and action register, controlled delivery update, and quality verdict.',
    intake: 'Approved transcript or notes, attendee roles, project context, dates, and decision rules.',
    stages: [
      stage('capture', 'Capture decisions and actions', 'meeting-actions-coordinator', 'Separate decisions, actions, owners, dates, risks, and open questions.'),
      stage('control', 'Update delivery control', 'project-controller', 'Map accepted actions to critical path and accountable status.'),
      stage('assure', 'Review the action packet', 'quality-reviewer', 'Check actions and status against the approved meeting source.'),
    ],
  }),
  playbook({
    id: 'quote-to-decision',
    name: 'Quote to decision',
    buyerOutcome: 'Compare supplier quotes and prepare a defensible owner decision.',
    deliverable: 'A normalized quote comparison, decision analysis, and quality verdict.',
    intake: 'Approved quotes, specifications, delivery terms, currencies, evaluation rules, and constraints.',
    stages: [
      stage('compare', 'Compare quotes', 'procurement-analyst', 'Normalize commercial terms, flag exceptions, and build the comparison.'),
      stage('analyze', 'Frame the decision', 'data-insights-analyst', 'Calculate traceable trade-offs and decision options.'),
      stage('assure', 'Review the recommendation', 'quality-reviewer', 'Audit the comparison and recommendation against source quotes.'),
    ],
  }),
])

const PLAYBOOK_BY_ID = new Map(COMPANY_PLAYBOOKS.map((item) => [item.id, item]))
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const MISSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/
const INPUT_FIELDS = new Set(['clientId', 'missionId', 'playbookId'])
const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

export function listCompanyPlaybooks() {
  return COMPANY_PLAYBOOKS.map((item) => ({
    id: item.id,
    name: item.name,
    buyerOutcome: item.buyerOutcome,
    deliverable: item.deliverable,
    intake: item.intake,
    stageCount: item.stages.length,
    agents: item.stages.map((itemStage) => itemStage.agentId),
  }))
}

export async function planCompanyPlaybook(input, options = {}) {
  if (!isRecord(input)) return failure('company_playbook_invalid_request')
  const unknownFields = Object.keys(input).filter((field) => !INPUT_FIELDS.has(field)).sort()
  if (unknownFields.length) return failure('company_playbook_unknown_field', { fields: unknownFields })

  const clientId = String(input.clientId || '').trim()
  if (!ID_RE.test(clientId)) return failure('company_invalid_client_id')
  const missionId = String(input.missionId || '').trim()
  if (!MISSION_ID_RE.test(missionId)) return failure('company_playbook_invalid_mission_id')
  const playbookId = String(input.playbookId || '').trim()
  const definition = PLAYBOOK_BY_ID.get(playbookId)
  if (!definition) return failure('company_playbook_unknown', { playbookId })

  const roster = new Map(listCompanyAgents().map((agent) => [agent.id, agent]))
  const readCrew = options.loadCrew || loadCrew
  const stages = []
  for (let index = 0; index < definition.stages.length; index += 1) {
    const definitionStage = definition.stages[index]
    const agent = roster.get(definitionStage.agentId)
    if (!agent) return failure('company_playbook_roster_invalid', { agentId: definitionStage.agentId })
    let crew
    try { crew = await readCrew(agent.crew) }
    catch { return failure('company_playbook_roster_invalid', { agentId: agent.id }) }
    if (crew.roles.length > MAX_CYCLE_ROLE_BUDGET) {
      return failure('company_playbook_role_budget_exceeded', {
        agentId: agent.id,
        plannedRoles: crew.roles.length,
        maxRoleBudget: MAX_CYCLE_ROLE_BUDGET,
      })
    }
    const previous = stages[index - 1]
    stages.push({
      number: index + 1,
      stageId: `${missionId}:stage:${index + 1}`,
      cycleId: `${missionId}:s${index + 1}`,
      key: definitionStage.id,
      name: definitionStage.name,
      objective: definitionStage.objective,
      agentId: agent.id,
      agentName: agent.name,
      department: agent.department,
      crew: crew.slug,
      crewVersion: crew.version,
      roleBudget: crew.roles.length,
      roles: crew.roles.map((role) => ({ id: role.id, title: role.title, tier: role.tier })),
      returns: [...crew.output_contract.fields],
      evidenceHint: index === 0
        ? definition.intake
        : `Provide only the owner-reviewed, redacted output from ${previous.name}, plus any approved source evidence required for this stage.`,
      gate: index === 0 ? 'owner_review_before_queue' : 'previous_stage_accepted_and_handoff_reviewed',
      handoffFrom: previous ? {
        stageId: previous.stageId,
        requiredEvaluation: 'accepted',
        transfer: 'owner_reviewed_redacted_output_only',
      } : null,
    })
  }

  const missionRunId = `company-mission:${sha256(`${clientId}\n${missionId}\n${playbookId}`).slice(0, 40)}`
  const plan = {
    ok: true,
    mode: 'playbook_plan',
    actionMode: 'plan_only',
    clientId,
    missionId,
    missionRunId,
    playbook: {
      id: definition.id,
      name: definition.name,
      buyerOutcome: definition.buyerOutcome,
      deliverable: definition.deliverable,
    },
    approvalRequired: true,
    durableMissionCreated: false,
    stages,
    budget: {
      stageCount: stages.length,
      totalPlannedRoleCalls: stages.reduce((total, item) => total + item.roleBudget, 0),
      maxRoleCallsPerStage: MAX_CYCLE_ROLE_BUDGET,
      maxAgentsPerStage: 1,
    },
    controls: {
      execution: 'operator_staged',
      automaticQueue: false,
      automaticDispatch: false,
      dynamicDelegation: false,
      recursiveDelegation: false,
      crossStageContext: false,
      externalWrites: false,
      stageAdvancement: 'manual_after_accepted_evaluation',
      handoff: 'owner_reviewed_redacted_output_only',
    },
  }
  return { ...plan, planHash: sha256(stableStringify(plan)) }
}

export default { COMPANY_PLAYBOOKS, listCompanyPlaybooks, planCompanyPlaybook }
