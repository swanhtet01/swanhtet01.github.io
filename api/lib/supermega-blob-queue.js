const crypto = require('crypto')

function text(value) {
  return String(value || '').trim()
}

function envText(...names) {
  for (const name of names) {
    const value = text(process.env[name])
    if (value) return value
  }
  return ''
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function slugPart(value, fallback = 'item') {
  const slug = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || fallback
}

function loadBlobSdk() {
  try {
    return require('@vercel/blob')
  } catch {
    return null
  }
}

function blobTokenConfigured() {
  return Boolean(envText('BLOB_READ_WRITE_TOKEN') || (envText('VERCEL_OIDC_TOKEN') && envText('BLOB_STORE_ID')))
}

function queuePrefix() {
  return envText('SUPERMEGA_BLOB_ACTION_QUEUE_PREFIX') || 'supermega/action-queue'
}

function actionPrefix() {
  return `${queuePrefix()}/actions`
}

function runPrefix() {
  return `${queuePrefix()}/sales-runs`
}

function queueStatus(opts = {}) {
  const sdk = Object.prototype.hasOwnProperty.call(opts, 'blobSdk') ? opts.blobSdk : loadBlobSdk()
  const token = blobTokenConfigured()
  return {
    status: sdk && token ? 'ready' : 'not_configured',
    adapter: 'vercel_blob',
    access: 'private',
    prefix: queuePrefix(),
    sdk: sdk ? 'available' : 'missing',
    token: token ? 'configured' : 'missing',
    purpose: 'Durable fallback queue for owner-gated SuperMega revenue actions when SQL is degraded.',
  }
}

function normalizeAction(payload = {}) {
  const now = new Date().toISOString()
  const actionId = text(payload.action_id) || `BLOB-ACTION-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  return {
    id: actionId,
    action_id: actionId,
    lead_id: text(payload.lead_id),
    task_id: text(payload.task_id),
    run_id: text(payload.run_id),
    action_type: text(payload.action_type) || 'lead_followup',
    status: text(payload.status) || 'queued',
    priority: text(payload.priority) || 'medium',
    owner: text(payload.owner) || envText('SUPERMEGA_CONTACT_NOTIFY_EMAIL') || 'Revenue Pod',
    title: text(payload.title) || 'Review revenue action',
    next_step: text(payload.next_step) || 'Review and choose the next owner-approved action.',
    due_at: text(payload.due_at),
    evidence_url: text(payload.evidence_url),
    source_url: text(payload.source_url),
    approval_required: payload.approval_required !== false,
    approval_state: text(payload.approval_state) || 'pending',
    notification_channel: text(payload.notification_channel) || 'blob_queue',
    notification_status: text(payload.notification_status) || 'queued',
    payload: parseJsonObject(payload.payload),
    result: parseJsonObject(payload.result),
    error: text(payload.error),
    created_at: text(payload.created_at) || now,
    updated_at: text(payload.updated_at) || now,
    processed_at: text(payload.processed_at),
    storage_adapter: 'vercel_blob',
  }
}

function actionPath(actionId) {
  return `${actionPrefix()}/${slugPart(actionId, 'action')}.json`
}

function runPath(runId) {
  return `${runPrefix()}/${slugPart(runId, 'run')}.json`
}

async function readJsonBlob(sdk, pathname) {
  const got = await sdk.get(pathname, { access: 'private' })
  const body = got?.stream ? await new Response(got.stream).text() : ''
  return parseJsonObject(body)
}

async function writeJsonBlob(sdk, pathname, value) {
  return sdk.put(pathname, JSON.stringify(value, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
}

async function savePipelineAction(payload = {}, opts = {}) {
  const sdk = Object.prototype.hasOwnProperty.call(opts, 'blobSdk') ? opts.blobSdk : loadBlobSdk()
  if (!sdk || typeof sdk.put !== 'function') {
    return { status: 'skipped', adapter: 'vercel_blob', table: 'supermega_pipeline_actions', reason: 'blob_sdk_missing' }
  }
  if (!blobTokenConfigured() && !opts.allowWithoutToken) {
    return { status: 'skipped', adapter: 'vercel_blob', table: 'supermega_pipeline_actions', reason: 'blob_token_not_configured' }
  }
  const record = normalizeAction(payload)
  const pathname = actionPath(record.action_id)
  try {
    await writeJsonBlob(sdk, pathname, record)
    return {
      status: 'ready',
      adapter: 'vercel_blob',
      table: 'supermega_pipeline_actions',
      action_id: record.action_id,
      pathname,
      access: 'private',
    }
  } catch (error) {
    return {
      status: 'error',
      adapter: 'vercel_blob',
      table: 'supermega_pipeline_actions',
      reason: 'blob_action_write_failed',
      detail: text(error && error.message).slice(0, 180),
    }
  }
}

async function readActionRecords(limit = 20, opts = {}) {
  const sdk = Object.prototype.hasOwnProperty.call(opts, 'blobSdk') ? opts.blobSdk : loadBlobSdk()
  if (!sdk || typeof sdk.list !== 'function' || typeof sdk.get !== 'function') {
    return { ...queueStatus({ blobSdk: sdk }), rows: [], reason: 'blob_sdk_missing' }
  }
  if (!blobTokenConfigured() && !opts.allowWithoutToken) {
    return { ...queueStatus({ blobSdk: sdk }), rows: [], reason: 'blob_token_not_configured' }
  }
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 20, 100))
  try {
    const listed = await sdk.list({ prefix: `${actionPrefix()}/`, limit: boundedLimit })
    const blobs = Array.isArray(listed.blobs) ? listed.blobs : []
    const rows = []
    for (const blob of blobs) {
      const pathname = text(blob.pathname)
      if (!pathname) continue
      try {
        const record = normalizeAction(await readJsonBlob(sdk, pathname))
        record.pathname = pathname
        rows.push(record)
      } catch {
        rows.push({ status: 'unreadable_private_blob', pathname })
      }
    }
    rows.sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)))
    return { ...queueStatus({ blobSdk: sdk }), status: 'ready', rows }
  } catch (error) {
    return {
      ...queueStatus({ blobSdk: sdk }),
      status: 'error',
      rows: [],
      reason: 'blob_action_list_failed',
      detail: text(error && error.message).slice(0, 180),
    }
  }
}

async function claimBatch(limit = 10, opts = {}) {
  const sdk = Object.prototype.hasOwnProperty.call(opts, 'blobSdk') ? opts.blobSdk : loadBlobSdk()
  const listed = await readActionRecords(Math.max(20, limit * 4), { ...opts, blobSdk: sdk })
  if (listed.status !== 'ready') return listed
  const claimId = `CLAIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  const queued = listed.rows
    .filter((row) => text(row.status) === 'queued')
    .sort((a, b) => text(a.created_at).localeCompare(text(b.created_at)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 10, 25)))
  const rows = []
  for (const row of queued) {
    const claimed = {
      ...row,
      id: row.action_id,
      status: 'processing',
      claim_id: claimId,
      claimed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await writeJsonBlob(sdk, actionPath(claimed.action_id), claimed)
    rows.push(claimed)
  }
  return { status: 'ready', adapter: 'vercel_blob', rows, claim_id: claimId }
}

async function updateAction(actionId, patch = {}, opts = {}) {
  const sdk = Object.prototype.hasOwnProperty.call(opts, 'blobSdk') ? opts.blobSdk : loadBlobSdk()
  if (!sdk || typeof sdk.get !== 'function' || typeof sdk.put !== 'function') {
    return { status: 'skipped', adapter: 'vercel_blob', reason: 'blob_sdk_missing' }
  }
  if (!blobTokenConfigured() && !opts.allowWithoutToken) {
    return { status: 'skipped', adapter: 'vercel_blob', reason: 'blob_token_not_configured' }
  }
  const pathname = actionPath(actionId)
  try {
    const current = normalizeAction(await readJsonBlob(sdk, pathname))
    const next = normalizeAction({
      ...current,
      ...patch,
      action_id: current.action_id || actionId,
      payload: Object.prototype.hasOwnProperty.call(patch, 'payload') ? patch.payload : current.payload,
      result: Object.prototype.hasOwnProperty.call(patch, 'result') ? patch.result : current.result,
      updated_at: new Date().toISOString(),
    })
    await writeJsonBlob(sdk, pathname, next)
    return { status: 'ready', adapter: 'vercel_blob', action_id: next.action_id, pathname }
  } catch (error) {
    return { status: 'error', adapter: 'vercel_blob', reason: 'blob_action_update_failed', detail: text(error && error.message).slice(0, 180) }
  }
}

async function findLeadById(leadId, opts = {}) {
  const id = text(leadId)
  if (!id) return null
  const listed = await readActionRecords(100, opts)
  if (listed.status !== 'ready') return null
  for (const row of listed.rows) {
    if (text(row.lead_id) !== id) continue
    const lead = parseJsonObject(parseJsonObject(row.payload).lead)
    if (Object.keys(lead).length) return { ...lead, lead_id: text(lead.lead_id) || id }
  }
  return null
}

async function saveSalesRun(run = {}, opts = {}) {
  const sdk = Object.prototype.hasOwnProperty.call(opts, 'blobSdk') ? opts.blobSdk : loadBlobSdk()
  if (!sdk || typeof sdk.put !== 'function') return { status: 'skipped', adapter: 'vercel_blob', table: 'supermega_sales_runs', reason: 'blob_sdk_missing' }
  if (!blobTokenConfigured() && !opts.allowWithoutToken) return { status: 'skipped', adapter: 'vercel_blob', table: 'supermega_sales_runs', reason: 'blob_token_not_configured' }
  const runId = text(run.run_id) || `BLOB-RUN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  const record = {
    run_id: runId,
    run_type: text(run.run_type) || 'sales_daily',
    campaign: text(run.campaign) || 'general-growth',
    status: text(run.status) || 'ready',
    summary: text(run.core_pitch || run.summary),
    metrics: parseJsonObject(run.metrics),
    payload: run,
    generated_at: text(run.generated_at) || new Date().toISOString(),
    storage_adapter: 'vercel_blob',
  }
  const pathname = runPath(runId)
  try {
    await writeJsonBlob(sdk, pathname, record)
    return { status: 'ready', adapter: 'vercel_blob', table: 'supermega_sales_runs', run_id: runId, pathname }
  } catch (error) {
    return { status: 'error', adapter: 'vercel_blob', table: 'supermega_sales_runs', reason: 'blob_sales_run_write_failed', detail: text(error && error.message).slice(0, 180) }
  }
}

async function latestSalesRun(opts = {}) {
  const sdk = Object.prototype.hasOwnProperty.call(opts, 'blobSdk') ? opts.blobSdk : loadBlobSdk()
  if (!sdk || typeof sdk.list !== 'function' || typeof sdk.get !== 'function') return { ...queueStatus({ blobSdk: sdk }), table: 'supermega_sales_runs', rows: [], reason: 'blob_sdk_missing' }
  if (!blobTokenConfigured() && !opts.allowWithoutToken) return { ...queueStatus({ blobSdk: sdk }), table: 'supermega_sales_runs', rows: [], reason: 'blob_token_not_configured' }
  try {
    const listed = await sdk.list({ prefix: `${runPrefix()}/`, limit: 20 })
    const blobs = Array.isArray(listed.blobs) ? listed.blobs : []
    const rows = []
    for (const blob of blobs) {
      const pathname = text(blob.pathname)
      if (!pathname) continue
      const record = await readJsonBlob(sdk, pathname)
      if (Object.keys(record).length) rows.push({ ...record, pathname })
    }
    rows.sort((a, b) => text(b.generated_at).localeCompare(text(a.generated_at)))
    return { ...queueStatus({ blobSdk: sdk }), status: 'ready', table: 'supermega_sales_runs', rows: rows.slice(0, 3) }
  } catch (error) {
    return { ...queueStatus({ blobSdk: sdk }), status: 'error', table: 'supermega_sales_runs', rows: [], reason: 'blob_sales_run_read_failed', detail: text(error && error.message).slice(0, 180) }
  }
}

async function pipelineSnapshot({ actionLimit = 8 } = {}, opts = {}) {
  const actions = await readActionRecords(Math.max(20, actionLimit), opts)
  if (actions.status !== 'ready') return actions
  const latestRuns = await latestSalesRun(opts)
  const latestLeads = []
  const seenLeads = new Set()
  for (const action of actions.rows) {
    const lead = parseJsonObject(parseJsonObject(action.payload).lead)
    const leadId = text(lead.lead_id || action.lead_id)
    if (!leadId || seenLeads.has(leadId)) continue
    seenLeads.add(leadId)
    latestLeads.push({
      lead_id: leadId,
      task_id: text(lead.task_id || action.task_id),
      submitted_at: text(lead.submitted_at || action.created_at),
      requested_package: text(lead.requested_package || parseJsonObject(action.payload).offer?.package || action.title),
      lead_score: Number(lead.lead_score || 0),
      lead_stage: text(lead.lead_stage) || 'blob_queue',
      status: text(lead.status) || 'queued',
      next_step: text(lead.next_step || action.next_step),
    })
  }
  return {
    ...queueStatus(),
    status: 'ready',
    provider: 'vercel_blob',
    latestActions: actions.rows.slice(0, actionLimit),
    latestLeads: latestLeads.slice(0, 5),
    pendingActionCount: actions.rows.filter((row) => text(row.status) !== 'done').length,
    lead24hCount: latestLeads.length,
    lead7dCount: latestLeads.length,
    latestRuns: latestRuns.status === 'ready' ? latestRuns.rows : [],
  }
}

module.exports = {
  actionPath,
  claimBatch,
  findLeadById,
  latestSalesRun,
  normalizeAction,
  pipelineSnapshot,
  queueStatus,
  readActionRecords,
  savePipelineAction,
  saveSalesRun,
  updateAction,
}
