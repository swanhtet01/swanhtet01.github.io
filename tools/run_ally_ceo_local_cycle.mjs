#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { buildAllyCeoCompanyPlan } from '../kernel/ally-ceo-company-plan.mjs'

export const ALLY_CEO_LOCAL_CYCLE_CONTRACT = 'supermega.ally-ceo-local-cycle.v1'

const execFileAsync = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const defaultLocalCompanyRoot = resolve(root, '..', 'local-agent-company')
const defaultLocalCompanyHome = resolve(root, '..', 'supermega-local-company-state')
const powershell = resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const MAX_COMMAND_BYTES = 512 * 1024
const MAX_REPORT_BYTES = 256 * 1024
const EXECUTION_SPEC_VERSION = '2026-07-29.20'
const LEGACY_EXECUTION_SPEC_VERSIONS = Object.freeze(['2026-07-29.19', '2026-07-29.18', '2026-07-29.17', '2026-07-29.16', '2026-07-29.15', '2026-07-29.14', '2026-07-29.13', '2026-07-29.12', '2026-07-29.11', '2026-07-29.10'])
const MEMORY_RECOVERY_BLOCKERS = Object.freeze(new Set(['memory_pressure_critical', 'codex_working_set_high']))

const AGENT_ROLE_MAP = Object.freeze({
  'operations-analyst': 'operations',
  'project-controller': 'chief-of-staff',
  'proof-builder': 'engineering',
  'quality-reviewer': 'quality',
  'sales-qualifier': 'sales',
  'cash-reconciler': 'finance',
})

const OUTCOME_BRIEFS = Object.freeze({
  'daily-company-control': 'daily SuperMega operating control',
  'engineering-release-control': 'engineering quality and release-readiness control',
  'product-portfolio-control': 'four-product portfolio control',
  'growth-pipeline-control': 'internal growth-pipeline control',
  'finance-risk-control': 'internal finance and risk control',
})
const OUTCOME_SEQUENCE = Object.freeze([
  'daily-company-control',
  'engineering-release-control',
  'product-portfolio-control',
  'growth-pipeline-control',
  'finance-risk-control',
])
const LEGACY_OUTCOME_ROLES = Object.freeze({
  'daily-company-control': Object.freeze(['operations', 'chief-of-staff']),
  'engineering-release-control': Object.freeze(['engineering', 'quality']),
  'product-portfolio-control': Object.freeze(['operations', 'quality']),
  'growth-pipeline-control': Object.freeze(['sales', 'chief-of-staff']),
  'finance-risk-control': Object.freeze(['operations', 'finance']),
})
const LEGACY_REPAIRABLE_REASONS = Object.freeze(new Set([
  'ally_ceo_local_cycle_report_semantics_rejected',
  'ally_ceo_local_cycle_report_citations_rejected',
  'ally_ceo_local_cycle_specialist_section_rejected',
]))

function fail(reason) {
  throw new Error(reason)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseJson(text, reason) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_COMMAND_BYTES) fail(reason)
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(reason)
    return parsed
  } catch {
    fail(reason)
  }
}

function within(base, target) {
  const rel = relative(resolve(base), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function planSpec(plan) {
  const hash = String(plan?.preflight?.expectedPlanHash || '')
  const agents = plan?.manifest?.agents
  const outcomeId = String(plan?.outcomeId || '')
  const generatedAt = String(plan?.generatedAt || '')
  const period = generatedAt.slice(0, 10)
  if (!plan?.ok
    || plan.contract !== 'supermega.ally-ceo-company-plan.v1'
    || plan.declined !== false
    || !/^[a-f0-9]{64}$/.test(hash)
    || !Array.isArray(agents)
    || agents.length !== 1
    || new Set(agents).size !== 1
    || plan.manifest?.roleBudget !== plan.plan?.budget?.plannedRoles
    || plan.plan?.budget?.remainingRoles !== 0
    || plan.controls?.planningModelCalls !== 0
    || plan.controls?.planningConnectorRequests !== 0
    || plan.controls?.planningExternalWrites !== false
    || plan.controls?.maxAgents !== 1
    || plan.controls?.maxConcurrentAllyRuns !== 1
    || plan.controls?.scaleToZero !== true
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)
    || new Date(generatedAt).toISOString() !== generatedAt
    || plan.manifest?.cycleId !== `ally-ceo-${period.replaceAll('-', '')}-${outcomeId}`) {
    fail('ally_ceo_local_cycle_plan_invalid')
  }
  const roles = agents.map((agent) => AGENT_ROLE_MAP[agent])
  if (roles.some((role) => !role) || new Set(roles).size !== 1 || !OUTCOME_BRIEFS[outcomeId]) {
    fail('ally_ceo_local_cycle_team_invalid')
  }
  const planShortHash = hash.slice(0, 12)
  const cycleHash = sha256([
    ALLY_CEO_LOCAL_CYCLE_CONTRACT,
    EXECUTION_SPEC_VERSION,
    hash,
    outcomeId,
    roles.join(','),
  ].join('|'))
  const legacyRoles = LEGACY_OUTCOME_ROLES[outcomeId]
  if (!legacyRoles) fail('ally_ceo_local_cycle_legacy_team_invalid')
  const legacyShortHashes = LEGACY_EXECUTION_SPEC_VERSIONS.map((version) => sha256([
    ALLY_CEO_LOCAL_CYCLE_CONTRACT,
    version,
    hash,
    outcomeId,
    legacyRoles.join(','),
  ].join('|')).slice(0, 12))
  const shortHash = cycleHash.slice(0, 12)
  const outcomeMarker = `[ALLY_CEO_OUTCOME:${period}:${outcomeId}]`
  const repairMarker = `[ALLY_CEO_REPAIR:${period}:${outcomeId}:${shortHash}]`
  const legacyRepairMarkers = [
    ...legacyShortHashes.map((hash) => `[ALLY_CEO_REPAIR:${period}:${outcomeId}:${hash}]`),
    `[ALLY_CEO_REPAIR:${period}:${outcomeId}]`,
  ]
  const objectiveBody = [
    `Using imported SuperMega project evidence, produce one concise internal ${OUTCOME_BRIEFS[outcomeId]} brief and separate verified facts from assumptions.`,
    'Use CURRENT.md, hq/NOW.md, hq/portfolio.json, and site-manifest.json as current authority; treat older handoff files as historical context that cannot prove current completion.',
    'Lead with current limitations: the live app is not a managed system of record, and managed persistence and security remain not ready.',
    'Define 1 reusable task template under Task templates for the highest-value internal next action, plus success checks, failure modes that expose missing proof, and owner gates.',
    'Every verified claim must name its exact source filename and matching supplied evidence ID.',
    'Each specialist section must be at most 90 words and contain exactly these advisory labels: Proposed next action, Assumption, and Missing proof. Specialists must not claim execution or verified facts; the evidence-grounded executive synthesis remains code-owned. The executive synthesis must be at most 120 words and end with: Owner review required.',
  ]
  const objective = [outcomeMarker, `[ALLY_CEO_CYCLE:${shortHash}]`, `[ALLY_CEO_PLAN:${planShortHash}]`, ...objectiveBody].join(' ')
  const repairObjective = [
    repairMarker,
    `[ALLY_CEO_CYCLE:${shortHash}]`,
    `[ALLY_CEO_PLAN:${planShortHash}]`,
    'Replace one rejected legacy control artifact under the current quality contract; do not retry a current-version failure.',
    ...objectiveBody,
  ].join(' ')
  return {
    outcomeId,
    period,
    outcomeMarker,
    repairMarker,
    legacyRepairMarkers,
    planHash: hash,
    cycleHash,
    shortHash,
    legacyShortHashes,
    workOrderId: String(plan.preflight?.expectedWorkOrderId || ''),
    agents: [...agents],
    roles,
    objective,
    objectiveDigest: `sha256:${sha256(objective)}`,
    repairObjective,
    repairObjectiveDigest: `sha256:${sha256(repairObjective)}`,
  }
}

function validateAudit(audit) {
  if (audit?.contract !== 'supermega.ally-runtime-audit.v1'
    || audit.mode !== 'read_only'
    || audit.hostAdmission?.contract !== 'supermega.ally-host-admission.v1') {
    fail('ally_ceo_local_cycle_audit_invalid')
  }
  if (audit.hostAdmission.eligible !== true || audit.hostAdmission.maxConcurrentLocalRuns !== 1) {
    const blockers = Array.isArray(audit.hostAdmission.blockers) ? audit.hostAdmission.blockers.join(',') : 'unknown'
    fail(`ally_ceo_local_cycle_host_blocked:${blockers}`)
  }
  if (audit.localModels?.loaded !== 0
    || audit.localCompany?.activeJobs !== 0
    || audit.localCompany?.queuedMissions !== 0
    || audit.localCompany?.runningMissions !== 0
    || audit.localCompany?.pendingApprovals !== 0
    || audit.localCompany?.pendingReportFinalizations !== 0
    || audit.localCompany?.pendingEvaluations !== 0) {
    fail('ally_ceo_local_cycle_host_not_idle')
  }
  return {
    generatedAt: String(audit.generatedAt || ''),
    memoryUsedPercent: Number(audit.memory?.usedPercent),
    maxConcurrentLocalRuns: 1,
    loadedModels: 0,
  }
}

function hostIsIdle(audit) {
  return audit?.localModels?.loaded === 0
    && audit?.localCompany?.activeJobs === 0
    && audit?.localCompany?.queuedMissions === 0
    && audit?.localCompany?.runningMissions === 0
    && audit?.localCompany?.pendingApprovals === 0
    && audit?.localCompany?.pendingReportFinalizations === 0
    && audit?.localCompany?.pendingEvaluations === 0
}

function canAttemptMemoryRecovery(audit) {
  const blockers = audit?.hostAdmission?.blockers
  return audit?.contract === 'supermega.ally-runtime-audit.v1'
    && audit.mode === 'read_only'
    && audit.hostAdmission?.contract === 'supermega.ally-host-admission.v1'
    && audit.hostAdmission.eligible === false
    && Array.isArray(blockers)
    && blockers.length > 0
    && blockers.every((blocker) => MEMORY_RECOVERY_BLOCKERS.has(blocker))
    && hostIsIdle(audit)
}

function validateMemoryRecovery(receipt, beforeAudit) {
  const beforeWorkingSetMb = Number(receipt?.beforeWorkingSetMb)
  const afterWorkingSetMb = Number(receipt?.afterWorkingSetMb)
  const releasedWorkingSetMb = Number(receipt?.releasedWorkingSetMb)
  if (receipt?.contract !== 'supermega.ally-working-set-trim.v1'
    || receipt.mode !== 'apply'
    || receipt.ok !== true
    || receipt.targetScope !== 'verified_codex_process_tree'
    || !Number.isInteger(receipt.targetCount)
    || receipt.targetCount < 1
    || !Number.isFinite(beforeWorkingSetMb)
    || !Number.isFinite(afterWorkingSetMb)
    || !Number.isFinite(releasedWorkingSetMb)
    || beforeWorkingSetMb < afterWorkingSetMb
    || releasedWorkingSetMb < 0
    || receipt.trimFailed !== 0
    || receipt.controls?.processMutation !== true
    || receipt.controls?.processTerminationCalls !== 0
    || receipt.controls?.filesModified !== 0
    || receipt.controls?.networkRequests !== 0
    || receipt.controls?.commandLinesRead !== false
    || receipt.controls?.environmentRead !== false
    || receipt.controls?.secretValuesReturned !== false) {
    fail('ally_ceo_local_cycle_memory_recovery_invalid')
  }
  return {
    attempted: true,
    initialMemoryUsedPercent: Number(beforeAudit.memory?.usedPercent),
    targetCount: receipt.targetCount,
    beforeWorkingSetMb,
    afterWorkingSetMb,
    releasedWorkingSetMb,
    processTerminations: 0,
  }
}

function validateFinalAudit(audit) {
  if (audit?.contract !== 'supermega.ally-runtime-audit.v1'
    || audit.mode !== 'read_only'
    || audit.hostAdmission?.contract !== 'supermega.ally-host-admission.v1') {
    fail('ally_ceo_local_cycle_final_audit_invalid')
  }
  if (audit.localModels?.loaded !== 0
    || audit.localCompany?.activeJobs !== 0
    || audit.localCompany?.queuedMissions !== 0
    || audit.localCompany?.runningMissions !== 0
    || audit.localCompany?.pendingApprovals !== 0
    || audit.localCompany?.pendingReportFinalizations !== 0
    || audit.localCompany?.pendingEvaluations !== 0) {
    fail('ally_ceo_local_cycle_final_host_not_idle')
  }
  return {
    eligible: audit.hostAdmission.eligible === true,
    memoryUsedPercent: Number(audit.memory?.usedPercent),
    loadedModels: 0,
    activeJobs: 0,
    queuedMissions: 0,
    runningMissions: 0,
  }
}

function validateHealth(health, provider, model) {
  const exactZero = ['active_jobs', 'queued_missions', 'running_missions', 'pending_approvals', 'pending_report_finalizations', 'pending_evaluations']
    .every((key) => health?.[key] === 0)
  if (!exactZero || !Array.isArray(health?.pending_completion) || health.pending_completion.length !== 0) {
    fail('ally_ceo_local_cycle_company_not_idle')
  }
  if (provider === 'ollama' && (!Array.isArray(health.installed_models) || !health.installed_models.includes(model))) {
    fail('ally_ceo_local_cycle_model_unavailable')
  }
}

function knowledgeStatus(knowledge) {
  const counts = knowledge?.status_counts
  if (knowledge?.schema !== 'local-company.knowledge-freshness.v1'
    || !/^[a-f0-9]{12}$/.test(String(knowledge.project_id || ''))
    || typeof knowledge.ready_for_use !== 'boolean'
    || !Number.isInteger(knowledge.source_count)
    || knowledge.source_count < 1
    || !['current', 'changed', 'missing', 'unavailable'].every((key) => Number.isInteger(counts?.[key]) && counts[key] >= 0)
    || counts.current + counts.changed + counts.missing + counts.unavailable !== knowledge.source_count
    || knowledge.ready_for_use !== (counts.changed === 0 && counts.missing === 0 && counts.unavailable === 0)
    || knowledge.effects?.knowledge_records_mutated !== false
    || knowledge.effects?.model_called !== false
    || knowledge.effects?.work_started !== false) {
    fail('ally_ceo_local_cycle_knowledge_invalid')
  }
  return {
    projectId: knowledge.project_id,
    sourceCount: knowledge.source_count,
    current: counts.current,
    changed: counts.changed,
    missing: counts.missing,
    unavailable: counts.unavailable,
    ready: knowledge.ready_for_use,
  }
}

function validateCurrentKnowledge(knowledge) {
  const status = knowledgeStatus(knowledge)
  if (!status.ready || status.changed !== 0 || status.missing !== 0 || status.unavailable !== 0) {
    fail('ally_ceo_local_cycle_knowledge_not_current')
  }
  return status
}

function validateKnowledgeRefresh(receipt, before) {
  const refreshedIds = receipt?.refreshed_ids
  if (receipt?.schema !== 'local-company.knowledge-refresh.v1'
    || receipt.project_id !== before.projectId
    || receipt.source_count !== before.sourceCount
    || receipt.refreshed_count !== before.changed
    || receipt.unchanged_count !== before.current
    || !Array.isArray(refreshedIds)
    || refreshedIds.length !== before.changed
    || new Set(refreshedIds).size !== refreshedIds.length
    || !refreshedIds.every((id) => /^[a-f0-9]{12}$/.test(String(id)))
    || receipt.effects?.knowledge_records_mutated !== true
    || receipt.effects?.model_called !== false
    || receipt.effects?.work_started !== false) {
    fail('ally_ceo_local_cycle_knowledge_refresh_rejected')
  }
  return receipt.refreshed_count
}

function findExistingCycle(queueText, marker) {
  if (typeof queueText !== 'string' || Buffer.byteLength(queueText, 'utf8') > MAX_COMMAND_BYTES) {
    fail('ally_ceo_local_cycle_queue_inventory_invalid')
  }
  if (typeof marker !== 'string' || !/^\[ALLY_CEO_(?:OUTCOME|CYCLE|REPAIR):[A-Za-z0-9:-]+\]$/.test(marker)) {
    fail('ally_ceo_local_cycle_queue_marker_invalid')
  }
  const parsed = queueText.split(/\r?\n/)
    .filter((line) => line.includes(marker))
    .map((line) => {
      const match = /^([a-f0-9]{12})\s+([a-z_]+)/.exec(line)
      const job = /\sjob=([a-f0-9]{12}|-)\s/.exec(line)
      if (!match
        || !job
        || !/\sp=100\s/.test(line)
        || !/\sproject=SuperMega\s/.test(line)) {
        fail('ally_ceo_local_cycle_queue_inventory_invalid')
      }
      return { queueId: match[1], status: match[2], jobId: job[1] === '-' ? null : job[1] }
    })
    .filter((item) => item.status !== 'cancelled')
  if (parsed.length > 1) fail('ally_ceo_local_cycle_duplicate_plan')
  return parsed[0] || null
}

function existingForSpec(queueText, spec) {
  const markers = [
    `[ALLY_CEO_CYCLE:${spec.shortHash}]`,
    spec.repairMarker,
    ...spec.legacyRepairMarkers,
    spec.outcomeMarker,
    ...spec.legacyShortHashes.map((hash) => `[ALLY_CEO_CYCLE:${hash}]`),
  ]
  for (const marker of markers) {
    const existing = findExistingCycle(queueText, marker)
    if (existing) return existing
  }
  return null
}

function validateQueuePreflight(preflight, queueId, roles) {
  if (preflight?.schema !== 'local-company.queue-preflight.v1'
    || preflight.status !== 'ready'
    || preflight.queue_id !== queueId
    || preflight.reviewed_queue_matches !== true
    || preflight.submission_allowed !== true
    || preflight.model_execution_ready !== true
    || !Array.isArray(preflight.blockers)
    || preflight.blockers.length !== 0
    || !Array.isArray(preflight.owner_gate_categories)
    || preflight.owner_gate_categories.length !== 0
    || preflight.team?.selection !== 'explicit'
    || preflight.team?.roles?.join(',') !== roles.join(',')
    || preflight.knowledge?.status !== 'ready'
    || !Number.isInteger(preflight.knowledge?.source_count)
    || preflight.knowledge.source_count < 1
    || preflight.knowledge.status_counts?.changed !== 0
    || preflight.knowledge.status_counts?.missing !== 0
    || preflight.knowledge.status_counts?.unavailable !== 0
    || preflight.effects?.model_called !== false
    || preflight.effects?.work_started !== false) {
    fail('ally_ceo_local_cycle_queue_preflight_rejected')
  }
}

function parseQueueAdd(text) {
  const match = /^Queued mission ([a-f0-9]{12}); nothing was executed\.\s*$/m.exec(String(text || ''))
  if (!match) fail('ally_ceo_local_cycle_queue_add_invalid')
  return match[1]
}

function parseQueueResult(text, queueId) {
  const match = /^Queue item ([a-f0-9]{12}) completed as job ([a-f0-9]{12}); quality=(passed|failed)\r?\nReport: (.+)\s*$/m.exec(String(text || ''))
  if (!match || match[1] !== queueId) fail('ally_ceo_local_cycle_result_invalid')
  return { queueId: match[1], jobId: match[2], qualityPassed: match[3] === 'passed', reportPath: match[4].trim() }
}

async function currentPlan(now, completedOutcomeIds = []) {
  const [hqNow, workboard, portfolioText] = await Promise.all([
    readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'),
    readFile(resolve(root, 'hq', 'WORKBOARD.md'), 'utf8'),
    readFile(resolve(root, 'hq', 'portfolio.json'), 'utf8'),
  ])
  return buildAllyCeoCompanyPlan({ now, hqNow, workboard, portfolioText, completedOutcomeIds })
}

function limitedEnvironment(localCompanyRoot) {
  const environment = {
    PYTHONIOENCODING: 'utf-8',
    PYTHONPATH: resolve(localCompanyRoot, 'src'),
    PYTHONUTF8: '1',
    TEMP: tmpdir(),
    TMP: tmpdir(),
  }
  for (const name of ['SystemRoot', 'WINDIR']) {
    if (process.env[name]) environment[name] = process.env[name]
  }
  return environment
}

async function defaultCommandRunner({ kind, args, timeoutMs, localCompanyRoot, localCompanyHome }) {
  let file
  let commandArgs
  let cwd
  let env
  if (kind === 'audit') {
    file = powershell
    commandArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'tools', 'audit_ally_runtime.ps1'), '-Json']
    cwd = root
    env = limitedEnvironment(localCompanyRoot)
  } else if (kind === 'trim') {
    file = powershell
    commandArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'tools', 'trim_codex_working_sets.ps1'), '-Apply', '-Json']
    cwd = root
    env = limitedEnvironment(localCompanyRoot)
  } else {
    file = resolve(localCompanyRoot, '.venv', 'Scripts', 'python.exe')
    commandArgs = ['-m', 'local_company.cli', '--home', localCompanyHome, ...args]
    cwd = localCompanyRoot
    env = limitedEnvironment(localCompanyRoot)
  }
  for (const candidate of [
    file,
    ...(kind === 'local' ? [resolve(localCompanyRoot, 'src', 'local_company', 'cli.py')] : []),
    ...(kind === 'trim' ? [resolve(root, 'tools', 'trim_codex_working_sets.ps1')] : []),
  ]) {
    const stat = await lstat(candidate).catch(() => null)
    if (!stat?.isFile() || stat.isSymbolicLink()) fail('ally_ceo_local_cycle_runtime_untrusted')
  }
  try {
    const result = await execFileAsync(file, commandArgs, {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: MAX_COMMAND_BYTES,
      timeout: timeoutMs,
      windowsHide: true,
    })
    return String(result.stdout || '')
  } catch (error) {
    const code = typeof error?.code === 'number' ? error.code : 'error'
    fail(`ally_ceo_local_cycle_command_failed:${kind}:${code}`)
  }
}

async function defaultReportInspector(reportPath, localCompanyHome) {
  const absolute = resolve(reportPath)
  if (!within(resolve(localCompanyHome, 'outputs'), absolute)) fail('ally_ceo_local_cycle_report_path_invalid')
  const stat = await lstat(absolute).catch(() => null)
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_REPORT_BYTES) {
    fail('ally_ceo_local_cycle_report_invalid')
  }
  const bytes = await readFile(absolute)
  return { path: absolute, bytes: bytes.length, digest: `sha256:${sha256(bytes)}`, text: bytes.toString('utf8') }
}

function specialistSection(text, role) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${role}`)
  if (start < 0) return ''
  const endOffset = lines.slice(start + 1).findIndex((line) => line.startsWith('## '))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start + 1, end).join('\n').trim()
}

function balancedSpecialistDelimiters(text) {
  const stack = []
  const closing = { ')': '(', ']': '[', '}': '{' }
  for (const character of text) {
    if ('([{'.includes(character)) stack.push(character)
    else if (closing[character] && stack.pop() !== closing[character]) return false
  }
  return stack.length === 0 && (text.match(/`/g) || []).length % 2 === 0
}

function validateSpecialistSections(text, requiredRoles) {
  if (!Array.isArray(requiredRoles) || requiredRoles.length !== 1 || new Set(requiredRoles).size !== 1) {
    fail('ally_ceo_local_cycle_specialist_roles_invalid')
  }
  for (const role of requiredRoles) {
    const section = specialistSection(text, role)
    const words = section.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu) || []
    if (!section.startsWith('Not verified or performed:')
      || words.length < 12
      || words.length > 90
      || !/Proposed next action\s*:/i.test(section)
      || !/Assumption\s*:/i.test(section)
      || !/Missing proof\s*:/i.test(section)
      || /specialist draft withheld|incomplete model output|no substantive specialist draft/i.test(section)
      || /Proposed next action\s*:\s*(?:execute|deploy|publish|send|pay|purchase|migrate|enable)\b/i.test(section)
      || /\b(?:and|or|to|for|with|using|before|after|the|a|an|of|in|on|at|from|does|is|are|has|have|can|will|must|should|could|would|may|might|verify|confirm|assuming|currently|whether)\.?$/i.test(section)
      || /\b(?:and|or|to|for|with|using|before|after|the|a|an|of|in|on|at|from|does|is|are|has|have|can|will|must|should|could|would|may|might|verify|confirm|assuming|currently|whether|not|state|reusable|consequential)\s*;\s*(?:Keep the scope local|Treat this as unverified|Require evidence before consequential action)\b/i.test(section)
      || !balancedSpecialistDelimiters(section)
      || /\[EVIDENCE:/i.test(section)) {
      fail('ally_ceo_local_cycle_specialist_section_rejected')
    }
  }
}

function validateAcceptedReport(value, requiredRoles) {
  const text = typeof value?.text === 'string' ? value.text : ''
  const digest = String(value?.digest || '')
  if (!value
    || typeof value.path !== 'string'
    || !Number.isInteger(value.bytes)
    || value.bytes < 2
    || value.bytes > MAX_REPORT_BYTES
    || !/^sha256:[a-f0-9]{64}$/.test(digest)
    || Buffer.byteLength(text, 'utf8') !== value.bytes
    || !text.includes('## Executive synthesis')
    || !text.includes('Owner review required.')
    || /(?:instagram\.com|linkedin\.com|lnkd\.in|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk-proj|ghp|gho|glpat|xoxb|xoxp|xoxa|xoxr)-[A-Za-z0-9_-]{16,})/i.test(text)) {
    fail('ally_ceo_local_cycle_report_semantics_rejected')
  }
  const generatedOutput = (text.split('## Team plan')[1] || '').split('## Evidence manifest')[0]
  validateSpecialistSections(generatedOutput, requiredRoles)
  const structuredLabels = [
    'Verified facts:', 'Assumptions:', 'Task templates:', 'Success checks:',
    'Failure modes:', 'Owner gates:',
  ]
  const structured = structuredLabels.every((label) => generatedOutput.includes(label))
  if (structured) {
    if (!/records this frozen limitation:/i.test(generatedOutput)
      || !/remain unverified/i.test(generatedOutput)
      || !/Missing evidence blocks local report acceptance\./i.test(generatedOutput)) {
      fail('ally_ceo_local_cycle_report_semantics_rejected')
    }
  } else if (!/missing proof\s*:/i.test(generatedOutput)
    || /missing proof\s*:\s*(?:no|none|nothing|complete)\b/i.test(generatedOutput)
    || !/managed persistence/i.test(generatedOutput)
    || !/security/i.test(generatedOutput)
    || !/(?:not ready|unready|not a managed system of record)/i.test(generatedOutput)) {
    fail('ally_ceo_local_cycle_report_semantics_rejected')
  }
  const evidenceCitations = generatedOutput.match(/\[EVIDENCE:[a-f0-9]{16}\]/gi) || []
  const authorityNames = ['CURRENT.md', 'hq/NOW.md', 'hq/portfolio.json', 'site-manifest.json']
    .filter((name) => generatedOutput.includes(name))
  if (evidenceCitations.length < 2 || authorityNames.length < 1) {
    fail('ally_ceo_local_cycle_report_citations_rejected')
  }
  return { path: value.path, bytes: value.bytes, digest }
}

async function inspectExistingCycle(existing, spec, runCommand, inspectReport) {
  let report = null
  let reason = null
  let legacyExecution = false
  if (existing.status === 'complete' && existing.jobId) {
    try {
      const detail = parseJson(
        await runCommand({ kind: 'local', args: ['show', existing.jobId], timeoutMs: 30_000 }),
        'ally_ceo_local_cycle_existing_job_invalid',
      )
      if (!Array.isArray(detail.job)
        || detail.job[0] !== existing.jobId
        || detail.job[2] !== 'complete'
        || detail.evaluation?.passed !== true
        || typeof detail.job[1] !== 'string'
        || typeof detail.job[4] !== 'string') {
        fail('ally_ceo_local_cycle_existing_job_rejected')
      }
      legacyExecution = spec.legacyShortHashes.some((hash) => detail.job[1].includes(`[ALLY_CEO_CYCLE:${hash}]`))
      report = validateAcceptedReport(await inspectReport(detail.job[4]), spec.roles)
    } catch (error) {
      reason = String(error?.message || 'ally_ceo_local_cycle_existing_job_rejected').slice(0, 160)
    }
  }
  return {
    accepted: existing.status === 'complete' && Boolean(report) && !reason,
    report,
    reason,
    legacyExecution,
  }
}

async function selectRotatingPlan({ buildPlan, queueText, runCommand, inspectReport }) {
  const completedOutcomeIds = []
  const processedOutcomeIds = []
  const rejectedOutcomes = []
  let period = null
  for (const expectedOutcomeId of OUTCOME_SEQUENCE) {
    const plan = await buildPlan([...processedOutcomeIds])
    const spec = planSpec(plan)
    if (spec.outcomeId !== expectedOutcomeId || period && spec.period !== period) {
      fail('ally_ceo_local_cycle_rotation_sequence_invalid')
    }
    period ??= spec.period
    const existing = existingForSpec(queueText, spec)
    if (!existing) return { allDone: false, periodIncomplete: false, plan, spec, existing: null, inspection: null, completedOutcomeIds, rejectedOutcomes }
    const inspection = await inspectExistingCycle(existing, spec, runCommand, inspectReport)
    if (inspection.accepted) completedOutcomeIds.push(spec.outcomeId)
    else rejectedOutcomes.push({
      outcomeId: spec.outcomeId,
      queueId: existing.queueId,
      jobId: existing.jobId ?? null,
      status: existing.status,
      reason: inspection.reason || `queue_${existing.status}`,
    })
    processedOutcomeIds.push(spec.outcomeId)
  }

  const declined = await buildPlan([...processedOutcomeIds])
  if (!declined?.ok
    || declined.contract !== 'supermega.ally-ceo-company-plan.v1'
    || declined.declined !== true
    || declined.reason !== 'no_authorized_ceo_outcome'
    || declined.manifest !== null
    || declined.plan !== null) {
    fail('ally_ceo_local_cycle_rotation_completion_invalid')
  }
  return {
    allDone: rejectedOutcomes.length === 0,
    periodIncomplete: rejectedOutcomes.length > 0,
    period,
    completedOutcomeIds,
    rejectedOutcomes,
  }
}

export async function runAllyCeoLocalCycle(input = {}, dependencies = {}) {
  const execute = input.execute === true
  const refreshKnowledge = input.refreshKnowledge === true
  const repairRejected = input.repairRejected === true
  const recoverMemory = input.recoverMemory !== false
  const provider = input.provider || 'ollama'
  const model = input.model || 'qwen3.5:0.8b'
  if (refreshKnowledge && !execute) fail('ally_ceo_local_cycle_knowledge_refresh_requires_execution')
  if (repairRejected && !execute) fail('ally_ceo_local_cycle_legacy_repair_requires_execution')
  if (!['ollama', 'mock'].includes(provider) || !/^[a-zA-Z0-9._:-]{1,80}$/.test(model)) {
    fail('ally_ceo_local_cycle_provider_invalid')
  }
  const localCompanyRoot = resolve(input.localCompanyRoot || defaultLocalCompanyRoot)
  const localCompanyHome = resolve(input.localCompanyHome || defaultLocalCompanyHome)
  const runCommand = dependencies.runCommand || ((request) => defaultCommandRunner({ ...request, localCompanyRoot, localCompanyHome }))
  const inspectReport = dependencies.inspectReport || ((path) => defaultReportInspector(path, localCompanyHome))
  const cycleNow = input.now ?? new Date()
  const buildPlan = dependencies.buildPlan || ((completedOutcomeIds) => currentPlan(cycleNow, completedOutcomeIds))

  let audit = parseJson(await runCommand({ kind: 'audit', args: [], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_audit_json_invalid')
  let memoryRecovery = {
    attempted: false,
    initialMemoryUsedPercent: Number(audit.memory?.usedPercent),
    targetCount: 0,
    beforeWorkingSetMb: 0,
    afterWorkingSetMb: 0,
    releasedWorkingSetMb: 0,
    processTerminations: 0,
  }
  if (execute && recoverMemory && canAttemptMemoryRecovery(audit)) {
    const receipt = parseJson(
      await runCommand({ kind: 'trim', args: [], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_memory_recovery_json_invalid',
    )
    memoryRecovery = validateMemoryRecovery(receipt, audit)
    audit = parseJson(await runCommand({ kind: 'audit', args: [], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_recovery_audit_json_invalid')
  }
  const host = { ...validateAudit(audit), memoryRecovery }
  const health = parseJson(await runCommand({ kind: 'local', args: ['health'], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_health_invalid')
  validateHealth(health, provider, model)
  const knowledge = parseJson(await runCommand({ kind: 'local', args: ['knowledge', 'audit', '--project', 'SuperMega'], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_knowledge_invalid')
  const initialKnowledge = knowledgeStatus(knowledge)
  if (initialKnowledge.missing > 0 || initialKnowledge.unavailable > 0) {
    fail('ally_ceo_local_cycle_knowledge_source_unavailable')
  }
  let refreshedSources = 0
  let currentKnowledge
  if (initialKnowledge.changed > 0) {
    if (!refreshKnowledge) fail('ally_ceo_local_cycle_knowledge_not_current')
    const refreshReceipt = parseJson(
      await runCommand({ kind: 'local', args: ['knowledge', 'refresh', '--project', 'SuperMega'], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_knowledge_refresh_invalid',
    )
    refreshedSources = validateKnowledgeRefresh(refreshReceipt, initialKnowledge)
    const refreshedAudit = parseJson(
      await runCommand({ kind: 'local', args: ['knowledge', 'audit', '--project', 'SuperMega'], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_knowledge_invalid',
    )
    currentKnowledge = validateCurrentKnowledge(refreshedAudit)
  } else {
    currentKnowledge = validateCurrentKnowledge(knowledge)
  }
  const sourceCount = currentKnowledge.sourceCount
  const knowledgeRefresh = {
    requested: refreshKnowledge,
    performed: refreshedSources > 0,
    refreshedSources,
  }
  const queueText = await runCommand({ kind: 'local', args: ['queue', 'list'], timeoutMs: 30_000 })
  const rotation = dependencies.plan
    ? (() => {
        const spec = planSpec(dependencies.plan)
        return {
          allDone: false,
          plan: dependencies.plan,
          spec,
          existing: existingForSpec(queueText, spec),
          inspection: null,
          completedOutcomeIds: [],
        }
      })()
    : await selectRotatingPlan({ buildPlan, queueText, runCommand, inspectReport })
  if (rotation.periodIncomplete) {
    return {
      ok: false,
      contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
      status: 'period_incomplete',
      replayed: true,
      period: rotation.period,
      completedOutcomeIds: rotation.completedOutcomeIds,
      rejectedOutcomes: rotation.rejectedOutcomes,
      host,
      sourceCount,
      knowledgeRefresh,
      modelCalls: 0,
      queueWrites: 0,
      controls: { externalWrites: false, connectors: 0, maxLocalRuns: 1, scaleToZero: true },
    }
  }
  if (rotation.allDone) {
    return {
      ok: true,
      contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
      status: 'period_complete',
      replayed: true,
      period: rotation.period,
      outcomeId: null,
      completedOutcomeIds: rotation.completedOutcomeIds,
      host,
      sourceCount,
      knowledgeRefresh,
      modelCalls: 0,
      queueWrites: 0,
      controls: { externalWrites: false, connectors: 0, maxLocalRuns: 1, scaleToZero: true },
    }
  }
  const { spec, existing, completedOutcomeIds, rejectedOutcomes = [] } = rotation
  let repair = null
  if (existing) {
    const inspected = rotation.inspection || await inspectExistingCycle(existing, spec, runCommand, inspectReport)
    if (repairRejected && !inspected.accepted) {
      if (existing.status !== 'complete'
        || !existing.jobId
        || !inspected.legacyExecution
        || !LEGACY_REPAIRABLE_REASONS.has(inspected.reason)) {
        fail('ally_ceo_local_cycle_legacy_repair_not_allowed')
      }
      repair = { queueId: existing.queueId, jobId: existing.jobId, reason: inspected.reason }
    } else {
      return {
        ok: inspected.accepted,
        contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
        status: inspected.reason ? 'existing_rejected' : 'existing',
        replayed: true,
        period: spec.period,
        outcomeId: spec.outcomeId,
        completedOutcomeIds,
        planHash: spec.planHash,
        cycleHash: spec.cycleHash,
        workOrderId: spec.workOrderId,
        agents: spec.agents,
        roles: spec.roles,
        objectiveDigest: spec.objectiveDigest,
        queueId: existing.queueId,
        jobId: existing.jobId,
        queueStatus: existing.status,
        qualityPassed: inspected.accepted,
        report: inspected.report,
        reason: inspected.reason,
        host,
        sourceCount,
        knowledgeRefresh,
        modelCalls: 0,
        queueWrites: 0,
        controls: { externalWrites: false, connectors: 0, maxLocalRuns: 1, scaleToZero: true },
      }
    }
  } else if (repairRejected) {
    fail('ally_ceo_local_cycle_legacy_repair_not_available')
  }

  const executionObjective = repair ? spec.repairObjective : spec.objective
  const base = {
    ok: true,
    contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
    status: execute ? 'executing' : 'ready',
    replayed: false,
    period: spec.period,
    outcomeId: spec.outcomeId,
    completedOutcomeIds,
    rejectedOutcomes,
    planHash: spec.planHash,
    cycleHash: spec.cycleHash,
    workOrderId: spec.workOrderId,
    agents: spec.agents,
    roles: spec.roles,
    objectiveDigest: repair ? spec.repairObjectiveDigest : spec.objectiveDigest,
    repair,
    host,
    sourceCount,
    knowledgeRefresh,
    controls: { externalWrites: false, connectors: 0, maxLocalRuns: 1, scaleToZero: true },
  }
  if (!execute) return { ...base, status: 'ready', modelCalls: 0, queueWrites: 0 }

  const added = await runCommand({
    kind: 'local',
    args: ['queue', 'add', executionObjective, '--project', 'SuperMega', '--roles', spec.roles.join(','), '--priority', '100'],
    timeoutMs: 30_000,
  })
  const queueId = parseQueueAdd(added)
  let preflight
  try {
    preflight = parseJson(
      await runCommand({ kind: 'local', args: ['queue', 'preflight', '--queue-id', queueId], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_queue_preflight_invalid',
    )
    validateQueuePreflight(preflight, queueId, spec.roles)
  } catch (error) {
    await runCommand({ kind: 'local', args: ['queue', 'cancel', queueId], timeoutMs: 30_000 }).catch(() => '')
    throw error
  }

  const execution = await runCommand({
    kind: 'local',
    args: [
      'queue', 'run-next', '--queue-id', queueId,
      '--provider', provider,
      '--model', model,
      '--num-ctx', '4096',
      '--num-predict', '768',
      '--keep-alive', '0s',
    ],
    timeoutMs: 8 * 60_000,
  })
  const result = parseQueueResult(execution, queueId)
  const detail = parseJson(
    await runCommand({ kind: 'local', args: ['show', result.jobId], timeoutMs: 30_000 }),
    'ally_ceo_local_cycle_job_invalid',
  )
  if (!Array.isArray(detail.job)
    || detail.job[0] !== result.jobId
    || detail.job[2] !== 'complete'
    || detail.job[4] !== result.reportPath
    || detail.evaluation?.passed !== result.qualityPassed
    || !Array.isArray(detail.events)) {
    fail('ally_ceo_local_cycle_job_rejected')
  }
  const modelCalls = detail.events.filter((event) => Array.isArray(event) && event[0] === 'model_metrics').length
  if (modelCalls < spec.roles.length || modelCalls > spec.roles.length + 2) {
    fail('ally_ceo_local_cycle_model_count_invalid')
  }
  const report = validateAcceptedReport(await inspectReport(result.reportPath), spec.roles)
  const finalHealth = parseJson(await runCommand({ kind: 'local', args: ['health'], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_final_health_invalid')
  validateHealth(finalHealth, provider, model)
  const finalAudit = parseJson(await runCommand({ kind: 'audit', args: [], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_final_audit_invalid')
  const finalHost = validateFinalAudit(finalAudit)

  return {
    ...base,
    ok: result.qualityPassed,
    status: result.qualityPassed ? 'accepted' : 'quality_failed',
    queueId,
    jobId: result.jobId,
    qualityPassed: result.qualityPassed,
    report,
    modelCalls,
    queueWrites: 1,
    finalHost,
  }
}

function parseArgs(argv) {
  const result = { execute: false, refreshKnowledge: false, repairRejected: false, recoverMemory: true, provider: 'ollama' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--execute') result.execute = true
    else if (arg === '--refresh-knowledge') result.refreshKnowledge = true
    else if (arg === '--repair-rejected') result.repairRejected = true
    else if (arg === '--no-memory-recovery') result.recoverMemory = false
    else if (arg === '--provider') result.provider = argv[++index]
    else if (arg === '--help' || arg === '-h') result.help = true
    else fail(`ally_ceo_local_cycle_unknown_argument:${arg}`)
  }
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write([
      'SuperMega Ally CEO local company cycle',
      '',
      '  npm run company:ally:preflight',
      '  npm run company:ally:run',
      '  npm run company:ally:repair',
      '',
      'Preflight is read-only. Run refreshes changed registered sources, then queues and executes one exact local mission.',
      'Run may trim the verified idle Codex process tree once when memory pressure is the only host blocker; it never terminates a process.',
      'Repair replaces at most one rejected prior-version artifact; a current-version failure is never retried.',
      'Missing, unavailable, unstable, or malformed source evidence fails before queue or model work.',
      'No connector, deployment, payment, message, or customer action is available.',
    ].join('\n') + '\n')
    return
  }
  const result = await runAllyCeoLocalCycle(args)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 2
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: String(error?.message || 'ally_ceo_local_cycle_failed').slice(0, 300) })}\n`)
    process.exitCode = 1
  })
}

export default { ALLY_CEO_LOCAL_CYCLE_CONTRACT, runAllyCeoLocalCycle }
