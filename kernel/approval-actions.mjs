// Owner approval and idempotent execution for a deliberately tiny write surface.
// Agents can create drafts only. Approval and execution are separate ops-gated commands.

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

import { createTask, findTaskByMarker } from './connectors/data-clickup.mjs'
import store from './store.mjs'

const CLIENT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/
const ACTION_TYPE = 'clickup.create_task'
const LEASE_MS = 2 * 60 * 1000

function text(value, max = 200) {
  try { return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').slice(0, max) } catch { return '' }
}

function markdownText(value, max = 4000) {
  try {
    return String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
      .join('\n')
      .trim()
      .slice(0, max)
  } catch { return '' }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

function payloadHash(actionType, payload) {
  return createHash('sha256').update(JSON.stringify(stable({ actionType, payload }))).digest('hex')
}

function equalHash(left, right) {
  const a = createHash('sha256').update(String(left)).digest()
  const b = createHash('sha256').update(String(right)).digest()
  return timingSafeEqual(a, b)
}

function payloadIntegrityValid(row) {
  return Boolean(row) && equalHash(row.payload_hash, payloadHash(row.action_type, row.payload))
}

function integer(value, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function normalizePayload(input, id) {
  const listId = text(input?.list_id ?? input?.listId, 32)
  const name = text(input?.name, 200)
  const markdownContent = markdownText(input?.markdown_content ?? input?.markdownContent, 4000)
  const priority = integer(input?.priority, 1, 4)
  const dueDate = integer(input?.due_date ?? input?.dueDate, 1, Number.MAX_SAFE_INTEGER)
  if (!/^\d{1,32}$/.test(listId)) throw new Error('approval_invalid_clickup_list_id')
  if (!name) throw new Error('approval_task_name_required')
  return {
    list_id: listId,
    name,
    markdown_content: markdownContent,
    priority,
    due_date: dueDate,
    marker: `supermega-action:${id}`,
  }
}

function normalizeSource(input) {
  return {
    kind: text(input?.kind, 40) || 'manual',
    workcell: text(input?.workcell, 60) || null,
    local_date: text(input?.local_date ?? input?.localDate, 20) || null,
    evidence: text(input?.evidence, 500) || null,
  }
}

function resultView(row) {
  if (!row) return null
  return {
    id: row.id,
    clientId: row.client_id,
    actionType: row.action_type,
    title: row.title,
    payload: row.payload,
    payloadHash: row.payload_hash,
    source: row.source || {},
    status: row.status,
    version: Number(row.version) || 0,
    attempts: Number(row.attempts) || 0,
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at || null,
    rejectedBy: row.rejected_by || null,
    rejectedAt: row.rejected_at || null,
    executingAt: row.executing_at || null,
    leaseExpiresAt: row.lease_expires_at || null,
    providerRef: row.provider_ref || null,
    result: row.result || null,
    lastError: row.last_error || null,
    executedAt: row.executed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra }
}

export async function createActionDraft(input = {}, options = {}) {
  const storage = options.store || store
  const id = text(options.id || randomUUID(), 80)
  const clientId = text(input.clientId, 80)
  const actionType = text(input.actionType, 80)
  if (!CLIENT_ID_RE.test(clientId)) return failure('approval_invalid_client_id')
  if (actionType !== ACTION_TYPE) return failure('approval_action_type_not_allowed')
  let payload
  try { payload = normalizePayload(input.payload, id) } catch (error) { return failure(error.message) }
  const hash = payloadHash(actionType, payload)
  try {
    const row = await storage.createApprovalRecord({
      id,
      client_id: clientId,
      action_type: actionType,
      title: text(input.title, 200) || payload.name,
      payload,
      payload_hash: hash,
      source: normalizeSource(input.source),
    })
    return row ? { ok: true, approval: resultView(row) } : failure('approval_store_write_failed')
  } catch {
    return failure('approval_store_unavailable')
  }
}

export async function listActionApprovals(input = {}, options = {}) {
  const storage = options.store || store
  const status = text(input.status, 20)
  const allowed = new Set(['draft', 'approved', 'executing', 'succeeded', 'failed', 'rejected'])
  if (status && !allowed.has(status)) return failure('approval_invalid_status')
  try {
    const rows = await storage.listApprovalRecords({
      status: status || undefined,
      clientId: text(input.clientId, 80) || undefined,
      limit: Math.max(1, Math.min(200, Number(input.limit) || 100)),
    })
    return { ok: true, approvals: rows.map(resultView) }
  } catch {
    return failure('approval_store_unavailable')
  }
}

export async function approveAction(input = {}, options = {}) {
  const storage = options.store || store
  const id = text(input.id, 80)
  const actor = text(input.actor, 80) || 'owner'
  try {
    const current = await storage.getApprovalRecord(id)
    if (!current) return failure('approval_not_found')
    if (current.status !== 'draft') return failure('approval_not_draft', { approval: resultView(current) })
    if (!payloadIntegrityValid(current)) return failure('approval_payload_integrity_failed')
    if (!equalHash(current.payload_hash, input.payloadHash)) return failure('approval_payload_hash_mismatch')
    const now = (options.now || new Date()).toISOString()
    const row = await storage.transitionApprovalRecord(id, 'draft', Number(current.version), {
      status: 'approved', approved_by: actor, approved_at: now, last_error: null,
    })
    return row ? { ok: true, approval: resultView(row) } : failure('approval_transition_conflict')
  } catch {
    return failure('approval_store_unavailable')
  }
}

export async function rejectAction(input = {}, options = {}) {
  const storage = options.store || store
  const id = text(input.id, 80)
  const actor = text(input.actor, 80) || 'owner'
  try {
    const current = await storage.getApprovalRecord(id)
    if (!current) return failure('approval_not_found')
    if (!['draft', 'approved'].includes(current.status)) return failure('approval_not_rejectable', { approval: resultView(current) })
    if (!payloadIntegrityValid(current)) return failure('approval_payload_integrity_failed')
    if (!equalHash(current.payload_hash, input.payloadHash)) return failure('approval_payload_hash_mismatch')
    const now = (options.now || new Date()).toISOString()
    const row = await storage.transitionApprovalRecord(id, current.status, Number(current.version), {
      status: 'rejected', rejected_by: actor, rejected_at: now, last_error: text(input.reason, 300) || null,
    })
    return row ? { ok: true, approval: resultView(row) } : failure('approval_transition_conflict')
  } catch {
    return failure('approval_store_unavailable')
  }
}

async function executeClickUpPayload(approval, options = {}) {
  const find = options.findTaskByMarker || findTaskByMarker
  const create = options.createTask || createTask
  const payload = approval.payload
  const existing = await find({ listId: payload.list_id, marker: payload.marker, maxPages: 5 })
  if (!existing.ok) return { ok: false, uncertain: true, reason: existing.reason || 'approval_dedupe_check_failed' }
  if (existing.found) return { ok: true, recovered: true, providerRef: existing.task.id, providerResult: existing.task }
  if (existing.truncated) return { ok: false, uncertain: true, reason: 'approval_dedupe_search_inconclusive' }
  const created = await create({
    listId: payload.list_id,
    name: payload.name,
    markdownContent: payload.markdown_content,
    priority: payload.priority,
    dueDate: payload.due_date,
    marker: payload.marker,
  })
  if (!created.ok) return created
  return { ok: true, recovered: false, providerRef: created.task.id, providerResult: created.task }
}

export async function executeAction(input = {}, options = {}) {
  const storage = options.store || store
  const id = text(input.id, 80)
  const nowDate = options.now || new Date()
  let current
  try { current = await storage.getApprovalRecord(id) } catch { return failure('approval_store_unavailable') }
  if (!current) return failure('approval_not_found')
  if (current.status !== 'approved') return failure('approval_not_approved', { approval: resultView(current) })
  if (!payloadIntegrityValid(current)) return failure('approval_payload_integrity_failed')
  if (!equalHash(current.payload_hash, input.payloadHash)) return failure('approval_payload_hash_mismatch')
  const executing = await storage.transitionApprovalRecord(id, 'approved', Number(current.version), {
    status: 'executing',
    executing_at: nowDate.toISOString(),
    lease_expires_at: new Date(nowDate.getTime() + LEASE_MS).toISOString(),
    attempts: Number(current.attempts || 0) + 1,
    last_error: null,
  }).catch(() => null)
  if (!executing) return failure('approval_transition_conflict')

  const execute = options.execute || executeClickUpPayload
  const outcome = await execute(executing, options)
  if (!outcome.ok && (outcome.uncertain || outcome.retryable)) {
    const reason = text(outcome.reason, 300) || 'approval_execution_uncertain'
    const uncertain = await storage.transitionApprovalRecord(id, 'executing', Number(executing.version), {
      status: 'executing', last_error: reason,
    }).catch(() => null)
    return failure('approval_execution_uncertain', { detail: reason, approval: resultView(uncertain || executing) })
  }
  const completedAt = (options.afterExecuteNow || new Date()).toISOString()
  const patch = outcome.ok ? {
    status: 'succeeded',
    provider_ref: text(outcome.providerRef, 200),
    result: { recovered: Boolean(outcome.recovered), provider: outcome.providerResult || null },
    last_error: null,
    executed_at: completedAt,
    lease_expires_at: null,
  } : {
    status: 'failed',
    result: null,
    last_error: text(outcome.reason, 300) || 'approval_execution_failed',
    lease_expires_at: null,
  }
  const row = await storage.transitionApprovalRecord(id, 'executing', Number(executing.version), patch).catch(() => null)
  return row ? { ok: outcome.ok, reason: outcome.ok ? undefined : 'approval_execution_failed', approval: resultView(row) } : failure('approval_completion_conflict')
}

export async function recoverAction(input = {}, options = {}) {
  const storage = options.store || store
  const id = text(input.id, 80)
  const nowDate = options.now || new Date()
  let current
  try { current = await storage.getApprovalRecord(id) } catch { return failure('approval_store_unavailable') }
  if (!current) return failure('approval_not_found')
  if (current.status !== 'executing') return failure('approval_not_executing', { approval: resultView(current) })
  if (!payloadIntegrityValid(current)) return failure('approval_payload_integrity_failed')
  if (!current.lease_expires_at || Date.parse(current.lease_expires_at) > nowDate.getTime()) {
    return failure('approval_execution_lease_active', { approval: resultView(current) })
  }
  const find = options.findTaskByMarker || findTaskByMarker
  const check = await find({ listId: current.payload.list_id, marker: current.payload.marker, maxPages: 5 })
  if (!check.ok || check.truncated) return failure('approval_recovery_inconclusive', { detail: text(check.reason, 200), approval: resultView(current) })
  const patch = check.found ? {
    status: 'succeeded',
    provider_ref: text(check.task.id, 200),
    result: { recovered: true, provider: check.task },
    last_error: null,
    executed_at: nowDate.toISOString(),
    lease_expires_at: null,
  } : {
    status: 'approved',
    last_error: 'provider_result_not_found_after_lease',
    lease_expires_at: null,
  }
  const row = await storage.transitionApprovalRecord(id, 'executing', Number(current.version), patch).catch(() => null)
  return row ? { ok: true, recovered: Boolean(check.found), approval: resultView(row) } : failure('approval_transition_conflict')
}

export async function retryAction(input = {}, options = {}) {
  const storage = options.store || store
  const id = text(input.id, 80)
  try {
    const current = await storage.getApprovalRecord(id)
    if (!current) return failure('approval_not_found')
    if (current.status !== 'failed') return failure('approval_not_failed', { approval: resultView(current) })
    if (!payloadIntegrityValid(current)) return failure('approval_payload_integrity_failed')
    if (!equalHash(current.payload_hash, input.payloadHash)) return failure('approval_payload_hash_mismatch')
    const row = await storage.transitionApprovalRecord(id, 'failed', Number(current.version), {
      status: 'approved', last_error: null,
    })
    return row ? { ok: true, approval: resultView(row) } : failure('approval_transition_conflict')
  } catch {
    return failure('approval_store_unavailable')
  }
}

export function workcellActionDraft(result, input = {}) {
  if (!result?.ok || !['pipeline-control', 'owner-command'].includes(result.slug)) return null
  const listId = text(input.clickupListId, 32)
  const clientId = text(input.clientId, 80)
  if (!/^\d{1,32}$/.test(listId) || !CLIENT_ID_RE.test(clientId)) return null
  const evidence = (result.output?.priorities || []).slice(0, 3)
    .map((priority) => `${text(priority.title, 140)}: ${text(priority.evidence, 280)}`)
    .filter(Boolean)
    .join('\n')
  return {
    clientId,
    actionType: ACTION_TYPE,
    title: text(result.output?.owner_action, 200) || `${result.name} owner action`,
    payload: {
      list_id: listId,
      name: text(result.output?.owner_action, 200),
      markdown_content: [
        `Source: ${text(result.name, 100)} on ${text(result.localDate, 20)}`,
        text(result.output?.headline, 240),
        evidence ? `Evidence:\n${evidence}` : '',
      ].filter(Boolean).join('\n\n'),
    },
    source: {
      kind: 'workcell',
      workcell: result.slug,
      local_date: result.localDate,
      evidence: text(result.output?.headline, 240),
    },
  }
}

export default {
  createActionDraft,
  listActionApprovals,
  approveAction,
  rejectAction,
  executeAction,
  recoverAction,
  retryAction,
  workcellActionDraft,
}
