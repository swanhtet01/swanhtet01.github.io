// SUPERMEGA AI Operator — the safe tool-belt. Curated, READ-ONLY capabilities the operator agent can
// call to gather real data toward a goal. By design this exposes NO money/send/write capability — the
// draft→approve→act gate stays on those. Each tool: { description, input_schema, available, run }.
import store from './store.mjs'
import { ownerEvidenceConfigured, readOwnerEvidence } from './owner-evidence.mjs'
import { MAX_ACTIVE_COMPANY_ASSIGNMENTS, MAX_CYCLE_AGENTS, MAX_CYCLE_ROLE_BUDGET, MAX_REGISTERED_COMPANY_AGENTS } from './agent-company.mjs'

const PLATFORM_STATUS_CONTRACT = 'supermega.platform-status.v1'
const COMPANY_OPERATIONS_STATUS_CONTRACT = 'supermega.company-operations-status.v1'
const COMPANY_OPERATIONS_WINDOWS = Object.freeze([7, 30, 90])
const STORE_MODES = new Set(['memory', 'postgres', 'supabase'])
const RELEASE_ENVIRONMENTS = new Set(['local', 'development', 'preview', 'production'])
const OPERATIONS_READINESS = new Set(['no_orders', 'collecting', 'meeting_targets', 'at_risk'])
const OUTCOME_STATES = new Set([
  'measured',
  'no_outcomes',
  'invalid_coverage',
  'non_durable',
  'incomplete_evaluations',
  'incomplete_usage',
  'zero_work_units',
  'store_unavailable',
])
const DELIVERY_STATES = new Set(['ready', 'no_outcomes', 'missing', 'attention', 'invalid_coverage', 'non_durable', 'store_unavailable'])
const ACTION_STATES = new Set(['ready', 'no_accepted_outcomes', 'missing', 'invalid_coverage', 'non_durable', 'store_unavailable'])

function envValue(name, env = process.env) {
  return String(env?.[name] || '').trim()
}

function googleConnectorConfigured(env = process.env) {
  const serviceAccount = envValue('GOOGLE_SERVICE_ACCOUNT_JSON', env)
    || envValue('GOOGLE_APPLICATION_CREDENTIALS', env)
  const oauth = envValue('GOOGLE_OAUTH_CLIENT_ID', env)
    && envValue('GOOGLE_OAUTH_CLIENT_SECRET', env)
    && envValue('GOOGLE_OAUTH_REFRESH_TOKEN', env)
  return Boolean(serviceAccount || oauth)
}

function paypalConfigured(env = process.env) {
  return Boolean(envValue('PAYPAL_CLIENT_ID', env) && envValue('PAYPAL_CLIENT_SECRET', env))
}

function pipedriveConfigured(env = process.env) {
  return Boolean(envValue('PIPEDRIVE_ACCESS_TOKEN', env) || envValue('PIPEDRIVE_API_TOKEN', env))
}

function clickupConfigured(env = process.env) {
  return Boolean(envValue('CLICKUP_ACCESS_TOKEN', env) || envValue('CLICKUP_API_TOKEN', env))
}

function telegramOwnerConfigured(env = process.env) {
  const token = envValue('TELEGRAM_BOT_TOKEN', env)
  const chatId = envValue('TELEGRAM_ALERT_CHAT_ID', env) || envValue('TELEGRAM_CHAT_ID', env)
  return Boolean(token && /^-?\d{1,20}$/.test(chatId))
}

function releaseIdentity() {
  const candidate = String(process.env.SUPERMEGA_RELEASE_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || '').trim().toLowerCase()
  const environment = String(process.env.VERCEL_ENV || 'local').trim().toLowerCase()
  return {
    environment: RELEASE_ENVIRONMENTS.has(environment) ? environment : 'unknown',
    immutableCommit: /^[0-9a-f]{40}$/.test(candidate),
    commit: /^[0-9a-f]{40}$/.test(candidate) ? candidate : null,
  }
}

export function platformStatusView(status) {
  const storeMode = STORE_MODES.has(status?.db?.mode) ? status.db.mode : 'unavailable'
  const connectorTotal = Number.isSafeInteger(status?.connectors?.total) && status.connectors.total >= 0 ? status.connectors.total : 0
  const connectorConfigured = Number.isSafeInteger(status?.connectors?.configured)
    && status.connectors.configured >= 0
    && status.connectors.configured <= connectorTotal
    ? status.connectors.configured
    : 0
  const registrationErrors = Number.isSafeInteger(status?.connectors?.registrationErrors) && status.connectors.registrationErrors >= 0
    ? status.connectors.registrationErrors
    : 0
  const providerCount = Array.isArray(status?.ai?.providers) ? status.ai.providers.length : 0
  const moneyValues = status?.money && typeof status.money === 'object' ? Object.values(status.money) : []
  const maxAgents = status?.agentCompany?.maxAgents === MAX_CYCLE_AGENTS ? MAX_CYCLE_AGENTS : 0
  const maxRoleBudget = status?.agentCompany?.maxRoleBudget === MAX_CYCLE_ROLE_BUDGET ? MAX_CYCLE_ROLE_BUDGET : 0
  const plannerReady = status?.agentCompany?.plannerReady === true && maxAgents > 0 && maxRoleBudget > 0
  const persistenceReady = status?.db?.ok === true
  const connectorInventoryReady = connectorTotal > 0 && connectorConfigured <= connectorTotal
  const runtimeReady = status?.ok === true && persistenceReady && connectorInventoryReady && registrationErrors === 0 && plannerReady
  return {
    contract: PLATFORM_STATUS_CONTRACT,
    status: runtimeReady ? 'ready' : 'attention',
    persistence: {
      ready: persistenceReady,
      mode: storeMode,
      durable: persistenceReady && storeMode !== 'memory' && storeMode !== 'unavailable',
    },
    connectors: {
      total: connectorTotal,
      configured: connectorConfigured,
      registrationErrors,
      byCategory: status?.connectors?.byCategory && typeof status.connectors.byCategory === 'object'
        ? { ...status.connectors.byCategory }
        : {},
    },
    ai: {
      configuredProviders: providerCount,
      failoverReady: providerCount > 1 && status?.ai?.failover === true,
    },
    agentCompany: {
      plannerReady,
      actionMode: plannerReady ? 'draft_only' : 'unavailable',
      maxAgents,
      maxRoleBudget,
      dynamicDelegation: false,
      recursiveDelegation: false,
      modelRequest: false,
      externalWrites: plannerReady ? false : null,
    },
    paymentAdapters: {
      configured: moneyValues.filter((value) => value === true).length,
      total: moneyValues.length,
    },
    release: releaseIdentity(),
  }
}

const exactCount = (value, max = 1_000_000) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : 0
const exactMetric = (value, max = 1_000_000_000) => Number.isFinite(value) && value >= 0 && value <= max ? value : null
const exactIso = (value) => {
  if (typeof value !== 'string') return null
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value ? value : null
}

function operationsUnavailable(windowDays) {
  return {
    contract: COMPANY_OPERATIONS_STATUS_CONTRACT,
    status: 'unavailable',
    windowDays,
    readiness: 'unavailable',
    generatedAt: null,
    counts: { total: 0, planned: 0, running: 0, cancelled: 0, terminal: 0, completed: 0, partial: 0, blocked: 0, failed: 0, evaluated: 0, accepted: 0, revisionRequired: 0, missingEvaluation: 0 },
    attention: { overduePlanned: 0, overdueRunning: 0, failedOrBlocked: 0, revisionRequired: 0, missingEvaluation: 0, deliveryFailed: 0, deliveryUncertain: 0, deliveryMissing: 0 },
    attentionQueue: { state: 'unavailable', requiredActions: 0, signals: 0 },
    targets: { met: 0, atRisk: 0, collecting: 0 },
    workforce: { registeredAgents: MAX_REGISTERED_COMPANY_AGENTS, availableAgents: MAX_REGISTERED_COMPANY_AGENTS, historicalAgents: 0, utilizedAgents: 0, activeAgents: 0, queuedAgents: 0, runningAgents: 0, computeConsumingAgents: 0, registeredAgentsConsumeCompute: false, activationMode: 'demand_driven', dormantAgents: MAX_REGISTERED_COMPANY_AGENTS, totalAssignments: 0, activeAssignments: 0, queuedAssignments: 0, runningAssignments: 0, usedRoleCalls: 0, modelCalls: 0, cacheHits: 0, weightedTotalUnits: 0 },
    outcomes: { available: false, durable: false, state: 'unavailable', completed: 0, evaluated: 0, accepted: 0, revisionRequired: 0, efficiencyAvailable: false, acceptedPer1000WorkUnits: null },
    delivery: { available: false, durable: false, state: 'unavailable', completed: 0, recorded: 0, sent: 0, failed: 0, uncertain: 0, missing: 0 },
    actions: { available: false, durable: false, state: 'unavailable', accepted: 0, proposed: 0, missing: 0 },
    controls: { metadataOnly: true, directCyclesExcluded: true, rawEvidenceReturned: false, modelOutputReturned: false, specialistOutputReturned: false, providerRowsReturned: false, ceoDeliveryContentReturned: false, ceoActionContentReturned: false },
  }
}

export function companyOperationsStatusView(report, requestedWindowDays = 30) {
  const requested = COMPANY_OPERATIONS_WINDOWS.includes(Number(requestedWindowDays)) ? Number(requestedWindowDays) : 30
  if (!report?.ok || report.mode !== 'operations_report' || report.windowDays !== requested) return operationsUnavailable(requested)

  const generatedAt = exactIso(report.generatedAt)
  const readiness = OPERATIONS_READINESS.has(report.readiness) ? report.readiness : 'at_risk'
  const countKeys = ['total', 'planned', 'running', 'cancelled', 'terminal', 'completed', 'partial', 'blocked', 'failed', 'evaluated', 'accepted', 'revisionRequired', 'missingEvaluation']
  const attentionKeys = ['overduePlanned', 'overdueRunning', 'failedOrBlocked', 'revisionRequired', 'missingEvaluation', 'deliveryFailed', 'deliveryUncertain', 'deliveryMissing']
  const countsValid = countKeys.every((key) => exactCount(report.counts?.[key]) === report.counts?.[key])
    && report.counts.total === report.counts.planned + report.counts.running + report.counts.cancelled + report.counts.terminal
    && report.counts.terminal === report.counts.completed + report.counts.partial + report.counts.blocked + report.counts.failed
    && report.counts.evaluated <= report.counts.terminal
    && report.counts.accepted + report.counts.revisionRequired === report.counts.evaluated
    && report.counts.missingEvaluation === report.counts.terminal - report.counts.evaluated
  const attentionValid = attentionKeys.every((key) => exactCount(report.attention?.[key]) === report.attention?.[key])
    && report.attention.failedOrBlocked === report.counts.failed + report.counts.blocked
    && report.attention.revisionRequired === report.counts.revisionRequired
    && report.attention.missingEvaluation === report.counts.missingEvaluation
  const count = (key) => exactCount(report.counts?.[key])
  const attention = (key) => exactCount(report.attention?.[key])
  const targets = Array.isArray(report.targets) ? report.targets : []
  const targetsValid = targets.length === 8 && targets.every((target) => ['met', 'missed', 'collecting'].includes(target?.state))
  const targetSummary = targetsValid ? {
      met: targets.filter((target) => target.state === 'met').length,
      atRisk: targets.filter((target) => target.state === 'missed').length,
      collecting: targets.filter((target) => target.state === 'collecting').length,
    } : { met: 0, atRisk: 0, collecting: 0 }
  const availableAgents = report.workforce?.availableAgents === MAX_REGISTERED_COMPANY_AGENTS ? MAX_REGISTERED_COMPANY_AGENTS : 0
  const registeredAgents = report.workforce?.registeredAgents === MAX_REGISTERED_COMPANY_AGENTS ? MAX_REGISTERED_COMPANY_AGENTS : 0
  const historicalAgents = exactCount(report.workforce?.historicalAgents, MAX_REGISTERED_COMPANY_AGENTS)
  const utilizedAgents = exactCount(report.workforce?.utilizedAgents, MAX_REGISTERED_COMPANY_AGENTS)
  const activeAgents = exactCount(report.workforce?.activeAgents, MAX_ACTIVE_COMPANY_ASSIGNMENTS)
  const queuedAgents = exactCount(report.workforce?.queuedAgents, MAX_ACTIVE_COMPANY_ASSIGNMENTS)
  const runningAgents = exactCount(report.workforce?.runningAgents, MAX_ACTIVE_COMPANY_ASSIGNMENTS)
  const computeConsumingAgents = exactCount(report.workforce?.computeConsumingAgents, MAX_ACTIVE_COMPANY_ASSIGNMENTS)
  const totalAssignments = exactCount(report.workforce?.totalAssignments)
  const activeAssignments = exactCount(report.workforce?.activeAssignments)
  const dormantAgents = exactCount(report.workforce?.dormantAgents, MAX_REGISTERED_COMPANY_AGENTS)
  const queuedAssignments = exactCount(report.workforce?.queuedAssignments)
  const runningAssignments = exactCount(report.workforce?.runningAssignments)
  const usedRoleCalls = exactCount(report.workforce?.usedRoleCalls)
  const modelCalls = exactCount(report.workforce?.modelCalls)
  const cacheHits = exactCount(report.workforce?.cacheHits)
  const weightedTotalUnits = exactCount(report.workforce?.weightedTotalUnits, 1_000_000_000)
  const workforceValid = registeredAgents === MAX_REGISTERED_COMPANY_AGENTS
    && availableAgents === registeredAgents
    && historicalAgents === report.workforce?.historicalAgents
    && historicalAgents === utilizedAgents
    && utilizedAgents <= availableAgents
    && activeAgents === report.workforce?.activeAgents
    && activeAgents <= historicalAgents
    && queuedAgents === report.workforce?.queuedAgents
    && runningAgents === report.workforce?.runningAgents
    && queuedAgents <= activeAgents
    && runningAgents <= activeAgents
    && computeConsumingAgents === report.workforce?.computeConsumingAgents
    && computeConsumingAgents === runningAgents
    && report.workforce?.registeredAgentsConsumeCompute === false
    && report.workforce?.activationMode === 'demand_driven'
    && totalAssignments === report.workforce?.totalAssignments
    && activeAssignments === report.workforce?.activeAssignments
    && activeAssignments <= totalAssignments
    && activeAssignments <= MAX_ACTIVE_COMPANY_ASSIGNMENTS
    && dormantAgents === report.workforce?.dormantAgents
    && dormantAgents === availableAgents - activeAgents
    && queuedAssignments === report.workforce?.queuedAssignments
    && runningAssignments === report.workforce?.runningAssignments
    && queuedAssignments + runningAssignments === activeAssignments
    && usedRoleCalls === report.workforce?.usedRoleCalls
    && usedRoleCalls <= totalAssignments * MAX_CYCLE_ROLE_BUDGET
    && modelCalls === report.workforce?.modelCalls
    && cacheHits === report.workforce?.cacheHits
    && modelCalls + cacheHits <= usedRoleCalls
    && weightedTotalUnits === report.workforce?.weightedTotalUnits
  const outcomeState = OUTCOME_STATES.has(report.outcomes?.state) ? report.outcomes.state : 'invalid_coverage'
  const outcomesDurable = report.outcomes?.durable === true
  const outcomeCounts = ['completed', 'evaluated', 'accepted', 'revisionRequired']
  const outcomesValid = outcomeCounts.every((key) => exactCount(report.outcomes?.counts?.[key]) === report.outcomes?.counts?.[key])
    && report.outcomes.counts.evaluated <= report.outcomes.counts.completed
    && report.outcomes.counts.accepted + report.outcomes.counts.revisionRequired === report.outcomes.counts.evaluated
    && (report.outcomes?.efficiency?.available !== true
      || exactMetric(report.outcomes.efficiency.acceptedOutcomesPer1000WorkUnits) !== null)
  const deliveryState = DELIVERY_STATES.has(report.outcomes?.delivery?.state) ? report.outcomes.delivery.state : 'invalid_coverage'
  const deliveryDurable = report.outcomes?.delivery?.durable === true
  const deliveryCountKeys = ['completed', 'recorded', 'sent', 'failed', 'uncertain', 'missing']
  const deliveryCountsValid = deliveryCountKeys.every((key) => exactCount(report.outcomes?.delivery?.counts?.[key]) === report.outcomes?.delivery?.counts?.[key])
    && report.outcomes.delivery.counts.completed === report.outcomes.counts.completed
    && report.outcomes.delivery.counts.recorded === report.outcomes.delivery.counts.sent + report.outcomes.delivery.counts.failed + report.outcomes.delivery.counts.uncertain
    && report.outcomes.delivery.counts.missing === report.outcomes.delivery.counts.completed - report.outcomes.delivery.counts.recorded
    && report.attention.deliveryFailed === report.outcomes.delivery.counts.failed
    && report.attention.deliveryUncertain === report.outcomes.delivery.counts.uncertain
    && report.attention.deliveryMissing === report.outcomes.delivery.counts.missing
  const actionState = ACTION_STATES.has(report.outcomes?.actions?.state) ? report.outcomes.actions.state : 'invalid_coverage'
  const actionsDurable = report.outcomes?.actions?.durable === true
  const actionCountKeys = ['accepted', 'proposed', 'missing']
  const actionCountsValid = actionCountKeys.every((key) => exactCount(report.outcomes?.actions?.counts?.[key]) === report.outcomes?.actions?.counts?.[key])
    && report.outcomes.actions.counts.accepted === report.outcomes.counts.accepted
    && report.outcomes.actions.counts.proposed + report.outcomes.actions.counts.missing === report.outcomes.actions.counts.accepted
    && (actionState !== 'ready' || (actionsDurable && report.outcomes.actions.counts.missing === 0))
    && (actionState !== 'no_accepted_outcomes' || (actionsDurable && report.outcomes.actions.counts.accepted === 0))
    && (actionState !== 'missing' || report.outcomes.actions.counts.missing > 0)
    && (actionState !== 'non_durable' || !actionsDurable)
  const boundarySafe = report.coverage?.directCyclesExcluded === true
    && report.exposure?.rawEvidenceReturned === false
    && report.exposure?.modelOutputReturned === false
    && report.exposure?.specialistOutputReturned === false
    && report.exposure?.providerRowsReturned === false
    && report.exposure?.ceoDeliveryContentReturned === false
  const attentionTotal = attention('overduePlanned') + attention('overdueRunning') + attention('failedOrBlocked')
    + attention('revisionRequired') + attention('missingEvaluation') + attention('deliveryFailed')
    + attention('deliveryUncertain') + attention('deliveryMissing')
  const outcomeReady = outcomeState === 'measured' && outcomesDurable
  const deliveryReady = deliveryState === 'ready' && deliveryDurable
  const deliveryEmpty = outcomeState === 'no_outcomes' && deliveryState === 'no_outcomes' && deliveryDurable
  const status = !generatedAt || !countsValid || !attentionValid || !targetsValid || !workforceValid || !outcomesValid || !deliveryCountsValid || !actionCountsValid
    || !boundarySafe || readiness === 'at_risk' || attentionTotal > 0
    || ['invalid_coverage', 'non_durable', 'store_unavailable'].includes(outcomeState)
    || ['invalid_coverage', 'non_durable', 'store_unavailable', 'missing', 'attention'].includes(deliveryState)
    || ['invalid_coverage', 'non_durable', 'store_unavailable', 'missing'].includes(actionState)
    ? 'attention'
    : readiness === 'meeting_targets' && outcomeReady && deliveryReady ? 'ready'
      : deliveryEmpty || deliveryReady ? 'collecting' : 'attention'

  return {
    contract: COMPANY_OPERATIONS_STATUS_CONTRACT,
    status,
    windowDays: requested,
    readiness,
    generatedAt,
    counts: {
      total: count('total'),
      planned: count('planned'),
      running: count('running'),
      cancelled: count('cancelled'),
      terminal: count('terminal'),
      completed: count('completed'),
      partial: count('partial'),
      blocked: count('blocked'),
      failed: count('failed'),
      evaluated: count('evaluated'),
      accepted: count('accepted'),
      revisionRequired: count('revisionRequired'),
      missingEvaluation: count('missingEvaluation'),
    },
    attention: {
      overduePlanned: attention('overduePlanned'),
      overdueRunning: attention('overdueRunning'),
      failedOrBlocked: attention('failedOrBlocked'),
      revisionRequired: attention('revisionRequired'),
      missingEvaluation: attention('missingEvaluation'),
      deliveryFailed: attention('deliveryFailed'),
      deliveryUncertain: attention('deliveryUncertain'),
      deliveryMissing: attention('deliveryMissing'),
    },
    attentionQueue: {
      state: attentionTotal > 0 ? 'action_required' : 'clear',
      requiredActions: attentionKeys.filter((key) => attention(key) > 0).length,
      signals: attentionTotal,
    },
    targets: targetSummary,
    workforce: {
      registeredAgents: workforceValid ? registeredAgents : 0,
      availableAgents,
      historicalAgents: workforceValid ? historicalAgents : 0,
      utilizedAgents: workforceValid ? utilizedAgents : 0,
      activeAgents: workforceValid ? activeAgents : 0,
      queuedAgents: workforceValid ? queuedAgents : 0,
      runningAgents: workforceValid ? runningAgents : 0,
      computeConsumingAgents: workforceValid ? computeConsumingAgents : 0,
      registeredAgentsConsumeCompute: false,
      activationMode: 'demand_driven',
      dormantAgents: workforceValid ? dormantAgents : 0,
      totalAssignments: workforceValid ? totalAssignments : 0,
      activeAssignments: workforceValid ? activeAssignments : 0,
      queuedAssignments: workforceValid ? queuedAssignments : 0,
      runningAssignments: workforceValid ? runningAssignments : 0,
      usedRoleCalls: workforceValid ? usedRoleCalls : 0,
      modelCalls: workforceValid ? modelCalls : 0,
      cacheHits: workforceValid ? cacheHits : 0,
      weightedTotalUnits: workforceValid ? weightedTotalUnits : 0,
    },
    outcomes: {
      available: report.outcomes?.available === true,
      durable: outcomesDurable,
      state: outcomeState,
      completed: exactCount(report.outcomes?.counts?.completed),
      evaluated: exactCount(report.outcomes?.counts?.evaluated),
      accepted: exactCount(report.outcomes?.counts?.accepted),
      revisionRequired: exactCount(report.outcomes?.counts?.revisionRequired),
      efficiencyAvailable: report.outcomes?.efficiency?.available === true,
      acceptedPer1000WorkUnits: report.outcomes?.efficiency?.available === true
        ? exactMetric(report.outcomes.efficiency.acceptedOutcomesPer1000WorkUnits)
        : null,
    },
    delivery: {
      available: report.outcomes?.delivery?.available === true,
      durable: deliveryDurable,
      state: deliveryState,
      completed: exactCount(report.outcomes?.delivery?.counts?.completed),
      recorded: exactCount(report.outcomes?.delivery?.counts?.recorded),
      sent: exactCount(report.outcomes?.delivery?.counts?.sent),
      failed: exactCount(report.outcomes?.delivery?.counts?.failed),
      uncertain: exactCount(report.outcomes?.delivery?.counts?.uncertain),
      missing: exactCount(report.outcomes?.delivery?.counts?.missing),
    },
    actions: {
      available: report.outcomes?.actions?.available === true,
      durable: actionsDurable,
      state: actionState,
      accepted: exactCount(report.outcomes?.actions?.counts?.accepted),
      proposed: exactCount(report.outcomes?.actions?.counts?.proposed),
      missing: exactCount(report.outcomes?.actions?.counts?.missing),
    },
    controls: {
      metadataOnly: boundarySafe,
      directCyclesExcluded: report.coverage?.directCyclesExcluded === true,
      rawEvidenceReturned: report.exposure?.rawEvidenceReturned === true,
      modelOutputReturned: report.exposure?.modelOutputReturned === true,
      specialistOutputReturned: report.exposure?.specialistOutputReturned === true,
      providerRowsReturned: report.exposure?.providerRowsReturned === true,
      ceoDeliveryContentReturned: report.exposure?.ceoDeliveryContentReturned === true,
      ceoActionContentReturned: false,
    },
  }
}

export const TOOLS = {
  platform_status: {
    description: 'Get a secret-safe SuperMega runtime readiness snapshot: persistence, connector registration, AI/provider availability, bounded Agent Company controls, payment-adapter count, and release identity. Read-only; no model or connector calls. No args.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    available: () => true,
    run: async () => {
      const { buildStatus: buildKernelStatus } = await import('./api/status.mjs')
      const status = await buildKernelStatus()
      return platformStatusView(status)
    },
  },
  company_operations_status: {
    description: 'Get a metadata-only 7, 30, or 90 day Agent Company operating readout: accountable work states, overdue/blocked and owner-delivery attention, accepted-action queue counts, target coverage, bounded workforce utilization, cache/model work units, and accepted CEO outcomes. Read-only; no model or connector calls and no raw evidence or output. Defaults to 30 days.',
    input_schema: { type: 'object', properties: { window_days: { type: 'integer', enum: COMPANY_OPERATIONS_WINDOWS } }, additionalProperties: false },
    available: () => true,
    run: async ({ window_days = 30 } = {}) => {
      const windowDays = COMPANY_OPERATIONS_WINDOWS.includes(Number(window_days)) ? Number(window_days) : 30
      const clientId = String(process.env.SUPERMEGA_CLIENT_ID || '').trim()
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(clientId)) return operationsUnavailable(windowDays)
      try {
        const { buildCompanyOperationsReport } = await import('./agent-company-operations.mjs')
        const report = await buildCompanyOperationsReport({ clientId, windowDays })
        return companyOperationsStatusView(report, windowDays)
      } catch {
        return operationsUnavailable(windowDays)
      }
    },
  },
  web_get: {
    description: 'Fetch a PUBLIC https URL and return its (truncated) body. Read-only; private/loopback/cloud-metadata addresses are blocked. Use for public data (FX rates, public APIs, public pages).',
    input_schema: { type: 'object', properties: { url: { type: 'string', description: 'full https:// URL' } }, required: ['url'], additionalProperties: false },
    available: () => true,
    run: async ({ url }) => {
      const { default: infraHttp } = await import('./connectors/infra-http.mjs')
      const r = await infraHttp.get(String(url || ''))
      const body = typeof r.body === 'string' ? r.body.slice(0, 2000) : r.body
      return { status: r.status || 0, ok: Boolean(r.ok), body, reason: r.reason }
    },
  },
  fx_rate: {
    description: 'Latest Central Bank of Myanmar reference exchange rates (MMK per USD, EUR, SGD, and others). Read-only; no args.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    available: () => true,
    run: async () => {
      const { default: cbm } = await import('./connectors/data-cbm-rate.mjs')
      const r = await cbm.getRates()
      return r.ok ? { rates: r.rates, source: r.source, timestamp: r.timestamp } : { ok: false, reason: r.reason }
    },
  },
  leads_overview: {
    description: 'Overview of inbound leads from the SuperMega CRM: total count, breakdown by stage, and the most recent few (name, company, stage, score). Read-only.',
    input_schema: { type: 'object', properties: { limit: { type: 'number', description: 'how many recent leads to include (default 5, max 20)' } }, additionalProperties: false },
    available: () => true,
    run: async ({ limit = 5 } = {}) => {
      const leads = await store.listLeads(200)
      const byStage = {}
      for (const l of leads) byStage[l.stage || 'new'] = (byStage[l.stage || 'new'] || 0) + 1
      const n = Math.max(1, Math.min(20, Number(limit) || 5))
      const recent = leads.slice(0, n).map((l) => ({ name: l.name, company: l.company, stage: l.stage, score: l.score }))
      return { total: leads.length, byStage, recent }
    },
  },
  pipeline_overview: {
    description: 'Overview of the sales pipeline: project counts by status, number of saved deals, and recent activity log. Read-only.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    available: () => true,
    run: async () => {
      const [projects, deals, activity] = await Promise.all([store.listProjects(), store.listDeals(), store.listActivity(8)])
      const byStatus = {}
      for (const p of projects) byStatus[p.status || '?'] = (byStatus[p.status || '?'] || 0) + 1
      return { projects: projects.length, byStatus, deals: deals.length, recentActivity: (activity || []).map((a) => ({ kind: a.kind, summary: a.summary })) }
    },
  },
  gmail_count: {
    description: 'Count emails in the connected mailbox matching a Gmail search query (e.g. "from:client@x.com newer_than:7d" or "subject:invoice"). Returns an approximate count. Read-only; never reads message bodies.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'a Gmail search expression' } }, required: ['query'], additionalProperties: false },
    available: () => googleConnectorConfigured(),
    run: async ({ query }) => {
      const { default: gmail } = await import('./connectors/data-gmail.mjs')
      const r = await gmail.search(String(query || ''), { maxResults: 1 })
      return { query: String(query || ''), approxCount: r.resultSizeEstimate || 0 }
    },
  },
  sheets_read: {
    description: 'Read a range of cells from a Google Sheet the service account can access (the sheet must be shared with it). Args: spreadsheet_id (from the sheet URL) + range (A1 notation, e.g. "Sheet1!A1:F50"). Returns the rows. Read-only — never writes.',
    input_schema: { type: 'object', properties: { spreadsheet_id: { type: 'string' }, range: { type: 'string', description: 'A1 notation, e.g. Sheet1!A1:F50' } }, required: ['spreadsheet_id', 'range'], additionalProperties: false },
    available: () => googleConnectorConfigured(),
    run: async ({ spreadsheet_id, range }) => {
      const { default: sheets } = await import('./connectors/data-sheets.mjs')
      const r = await sheets.readRange(String(spreadsheet_id || ''), String(range || ''))
      const values = (r.values || []).slice(0, 50).map((row) => (Array.isArray(row) ? row.slice(0, 20) : row))
      return { range: r.range, rows: values.length, values }
    },
  },
  settled_transactions_read: {
    description: 'Read a bounded PayPal Transaction Search window for reconciliation. Read-only: cannot capture, refund, or move money. Requires start_date and end_date in ISO date-time format; maximum window is 31 days.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date-time, e.g. 2026-07-01T00:00:00Z' },
        end_date: { type: 'string', description: 'ISO date-time after start_date, maximum 31 days later' },
        page: { type: 'integer', minimum: 1, maximum: 10000 },
        page_size: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['start_date', 'end_date'],
      additionalProperties: false,
    },
    available: () => paypalConfigured(),
    run: async ({ start_date, end_date, page = 1, page_size = 100 } = {}) => {
      const { default: paypal } = await import('./connectors/payment-paypal.mjs')
      const result = await paypal.listTransactions({
        startDate: start_date,
        endDate: end_date,
        page,
        pageSize: Math.min(100, Number(page_size) || 100),
      })
      if (!result.ok) throw new Error(result.reason || 'payment-paypal_read_failed')
      const transactions = result.transactions.slice(0, 100).map((row) => {
        const info = row && typeof row === 'object' ? row.transaction_info || {} : {}
        return {
          id: info.transaction_id || null,
          at: info.transaction_initiation_date || info.transaction_updated_date || null,
          status: info.transaction_status || null,
          eventCode: info.transaction_event_code || null,
          gross: info.transaction_amount || null,
          fee: info.fee_amount || null,
          net: info.transaction_amount && info.fee_amount
            ? {
                currency_code: info.transaction_amount.currency_code || null,
                value: Number(info.transaction_amount.value || 0) - Number(info.fee_amount.value || 0),
              }
            : null,
        }
      })
      return {
        transactions,
        page: result.page,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      }
    },
  },
  crm_deals_read: {
    description: 'Read a bounded page of Pipedrive deals for pipeline briefs. Read-only: cannot create or modify CRM records.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        cursor: { type: 'string', maxLength: 2048 },
        status: { type: 'string', enum: ['open', 'won', 'lost', 'deleted'] },
      },
      additionalProperties: false,
    },
    available: () => pipedriveConfigured(),
    run: async ({ limit = 100, cursor, status } = {}) => {
      const { default: pipedrive } = await import('./connectors/crm-pipedrive.mjs')
      const result = await pipedrive.listDeals({ limit: Math.min(100, Number(limit) || 100), cursor, status })
      if (!result.ok) throw new Error(result.reason || 'crm-pipedrive_read_failed')
      return {
        deals: result.deals.slice(0, 100).map((deal) => ({
          id: deal?.id || null,
          title: deal?.title || null,
          status: deal?.status || null,
          value: deal?.value ?? null,
          currency: deal?.currency || null,
          expectedCloseDate: deal?.expected_close_date || null,
          updatedAt: deal?.update_time || null,
        })),
        nextCursor: result.nextCursor,
      }
    },
  },
  work_tasks_read: {
    description: 'Read one ClickUp List page for an operator work brief. Read-only: cannot create, assign, close, or modify tasks.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', pattern: '^\\d{1,32}$' },
        page: { type: 'integer', minimum: 0, maximum: 10000 },
        include_closed: { type: 'boolean' },
        subtasks: { type: 'boolean' },
      },
      required: ['list_id'],
      additionalProperties: false,
    },
    available: () => clickupConfigured(),
    run: async ({ list_id, page = 0, include_closed = false, subtasks = false } = {}) => {
      const { default: clickup } = await import('./connectors/data-clickup.mjs')
      const result = await clickup.listTasks({
        listId: list_id,
        page,
        includeClosed: include_closed,
        subtasks,
      })
      if (!result.ok) throw new Error(result.reason || 'data-clickup_read_failed')
      return {
        tasks: result.tasks.slice(0, 100).map((task) => {
          const status = typeof task?.status === 'string' ? task.status : task?.status?.status
          const priority = typeof task?.priority === 'string' ? task.priority : task?.priority?.priority
          return {
            id: task?.id || null,
            name: task?.name || null,
            status: status || null,
            dueAt: task?.due_date || null,
            priority: priority || null,
            url: task?.url || null,
          }
        }),
        page: result.page,
      }
    },
  },
  owner_updates_read: {
    description: 'Read a bounded time window of owner evidence from the configured private Telegram chat and immutable reviewed LINE/Viber inbox. Read-only: does not acknowledge, send, modify, or expose other chats.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date-time at the start of the evidence window' },
        end_date: { type: 'string', description: 'ISO date-time after start_date, maximum 168 hours later' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['start_date', 'end_date'],
      additionalProperties: false,
    },
    available: () => {
      try { return telegramOwnerConfigured() || ownerEvidenceConfigured() } catch { return false }
    },
    run: async ({ start_date, end_date, limit = 100 } = {}) => {
      const boundedLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 100))
      const readers = []
      if (telegramOwnerConfigured()) {
        const { default: telegram } = await import('./connectors/messaging-telegram.mjs')
        readers.push({
          source: 'telegram',
          promise: telegram.readOwnerUpdates({ startDate: start_date, endDate: end_date, limit: boundedLimit }),
        })
      }
      if (ownerEvidenceConfigured()) {
        readers.push({
          source: 'reviewed-evidence',
          promise: readOwnerEvidence({ startDate: start_date, endDate: end_date, limit: boundedLimit }),
        })
      }
      if (!readers.length) throw new Error('owner_updates_not_configured')
      const results = await Promise.all(readers.map(async (reader) => {
        try { return { source: reader.source, result: await reader.promise } }
        catch { return { source: reader.source, result: { ok: false, reason: 'owner_updates_read_failed' } } }
      }))
      const successful = results.filter((entry) => entry.result?.ok)
      if (!successful.length) throw new Error(results[0]?.result?.reason || 'owner_updates_read_failed')
      const updates = successful.flatMap((entry) => entry.result.updates.map((update) => ({
        ...update,
        source: update.source || entry.source,
      })))
      updates.sort((left, right) => String(left.at || '').localeCompare(String(right.at || ''))
        || String(left.evidenceId || left.updateId || '').localeCompare(String(right.evidenceId || right.updateId || '')))
      const bounded = updates.slice(-boundedLimit)
      return {
        updates: bounded,
        fetched: successful.reduce((sum, entry) => sum + Number(entry.result.fetched || 0), 0),
        truncated: updates.length > bounded.length || successful.some((entry) => entry.result.truncated),
        sourceStatus: results.map((entry) => ({
          source: entry.source,
          ok: Boolean(entry.result?.ok),
          items: entry.result?.ok ? entry.result.updates.length : 0,
          reason: entry.result?.ok ? null : String(entry.result?.reason || 'owner_updates_read_failed').slice(0, 80),
        })),
      }
    },
  },
}

// The catalog the agent is shown — only tools whose dependencies are configured.
export function availableTools() {
  return Object.entries(TOOLS)
    .filter(([, t]) => { try { return t.available() } catch { return false } })
    .map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema }))
}

// Execute one tool by name. Validates the name against the allow-list and never throws.
export async function runTool(name, args) {
  const t = TOOLS[name]
  if (!t) return { ok: false, error: 'unknown_tool' }
  if (!t.available()) return { ok: false, error: 'tool_not_available' }
  try { return { ok: true, data: await t.run(args || {}) } }
  catch (e) { return { ok: false, error: String((e && e.message) || 'tool_error').slice(0, 200) } }
}

export default { TOOLS, availableTools, runTool }
