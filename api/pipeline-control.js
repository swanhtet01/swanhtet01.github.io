const crypto = require('crypto')
const datastore = require('./lib/supermega-datastore')

function safeEqual(a, b) {
  const aHash = crypto.createHash('sha256').update(String(a)).digest()
  const bHash = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(aHash, bHash)
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 50000) {
        reject(new Error('request_too_large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {})
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function text(value) {
  return String(value || '').trim()
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

function list(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter(Boolean)
}

function csvCell(value) {
  return `"${text(value).replace(/"/g, '""')}"`
}

function slugPart(value, fallback = 'pilot') {
  const slug = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || fallback
}

function oneOf(value, allowed, fallback) {
  const normalized = text(value)
  return allowed.includes(normalized) ? normalized : fallback
}

function moneyAmount(value) {
  const normalized = String(value ?? '').replace(/[,\s]/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}

function buildOrderRoomState(payload = {}) {
  const paymentProofState = oneOf(payload.payment_proof_state, ['payment_proof_required', 'proof_attached'], 'payment_proof_required')
  const requestedWorkspaceState = oneOf(
    payload.private_workspace_state || payload.workspace_state,
    ['not_created_until_payment_proof', 'ready_after_payment_proof', 'created_after_payment_proof'],
    paymentProofState === 'proof_attached' ? 'ready_after_payment_proof' : 'not_created_until_payment_proof',
  )
  const workspaceState = paymentProofState === 'proof_attached' ? requestedWorkspaceState : 'not_created_until_payment_proof'
  return {
    status: 'persisted_order_room_state',
    action_id: text(payload.action_id) || null,
    lead_id: text(payload.lead_id) || null,
    scope_approval_state: oneOf(payload.scope_approval_state, ['pending', 'approved', 'blocked'], 'pending'),
    price_approval_state: oneOf(payload.price_approval_state, ['pending', 'approved', 'blocked'], 'pending'),
    payment_route_state: oneOf(payload.payment_route_state, ['not_approved', 'approved'], 'not_approved'),
    payment_request_state: oneOf(payload.payment_request_state, ['not_sent', 'approved_to_send', 'sent'], 'not_sent'),
    payment_proof_state: paymentProofState,
    private_workspace_state: workspaceState,
    payment_proof_reference: text(payload.payment_proof_reference).slice(0, 240),
    owner_note: text(payload.owner_note).slice(0, 500),
    real_mrr_delta: 0,
    updated_by: 'operator_console',
    updated_at: new Date().toISOString(),
    guardrails: ['owner_approval_before_payment_request', 'no_workspace_before_payment_proof', 'no_revenue_claim_without_payment_proof'],
  }
}

function workspaceActivationStatus(state = {}) {
  const scopeApproved = state.scope_approval_state === 'approved' && state.price_approval_state === 'approved'
  const paymentReady = state.payment_route_state === 'approved' && ['approved_to_send', 'sent'].includes(state.payment_request_state)
  const proofReady = state.payment_proof_state === 'proof_attached'
  if (scopeApproved && paymentReady && proofReady && state.private_workspace_state === 'created_after_payment_proof') return 'private_workspace_created'
  if (scopeApproved && paymentReady && proofReady) return 'ready_to_create_private_workspace'
  if (!scopeApproved) return 'blocked_until_scope_and_price_approved'
  if (!paymentReady) return 'blocked_until_payment_request_sent'
  return 'blocked_until_payment_proof'
}

function privateWorkspaceUrl(workspaceSlug, leadId) {
  const appBase = (envText('SUPERMEGA_APP_BASE_URL', 'PUBLIC_APP_BASE_URL') || 'https://app.supermega.dev').replace(/\/$/, '')
  const params = new URLSearchParams()
  params.set('workspace', workspaceSlug)
  params.set('lead', leadId)
  const next = `/app/start?${params.toString()}`
  return `${appBase}/login?next=${encodeURIComponent(next)}`
}

function buildPrivateWorkspaceManifest(input = {}) {
  const state = input.state || {}
  const activationStatus = workspaceActivationStatus(state)
  const leadId = text(input.leadId) || 'not set'
  const templateId = text(input.templateId) || 'custom-agent'
  const workspaceSlug = text(state.private_workspace_slug || input.workspaceSlug) || `pilot-${slugPart(templateId, 'agent')}-${slugPart(leadId, 'lead')}`.slice(0, 72)
  const createWorkspaceAllowed = ['ready_to_create_private_workspace', 'private_workspace_created'].includes(activationStatus)
  const workspaceUrl = text(state.private_workspace_url || input.workspaceUrl) || privateWorkspaceUrl(workspaceSlug, leadId)
  const modules = [
    'buyer_goal',
    'approved_sources',
    'source_trace',
    'first_run_queue',
    'approval_log',
    'delivery_packet',
  ]
  const firstRunQueue = [
    {
      step_id: 'import_approved_sources',
      title: 'Import only buyer-approved sample sources',
      owner: 'Revenue Pod',
      external_action_state: 'manual_owner_approved',
      evidence_required: 'source_trace',
    },
    {
      step_id: 'build_first_production_run',
      title: `Build the first approval-only ${text(input.templateName) || 'agent'} run`,
      owner: 'Delivery Pod',
      external_action_state: 'not_sent',
      evidence_required: 'first_run_output',
    },
    {
      step_id: 'owner_acceptance_review',
      title: 'Collect owner acceptance before live connector writes or sends',
      owner: 'Founder',
      external_action_state: 'approval_required',
      evidence_required: 'acceptance_checklist',
    },
  ]
  return {
    status: activationStatus,
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_id: templateId,
    template_name: text(input.templateName) || null,
    starter_kit_url: text(input.starterKitUrl) || null,
    first_proof_target: text(input.firstProofTarget) || null,
    price_hint: text(input.priceHint) || 'quote after proof review',
    create_workspace_allowed: createWorkspaceAllowed,
    workspace_created: activationStatus === 'private_workspace_created',
    workspace_created_at: text(state.workspace_created_at || input.workspaceCreatedAt) || null,
    workspace_created_by: text(state.workspace_created_by || input.workspaceCreatedBy) || null,
    workspace_url: workspaceUrl,
    private_workspace_state: activationStatus === 'private_workspace_created' ? 'created_after_payment_proof' : createWorkspaceAllowed ? state.private_workspace_state || 'ready_after_payment_proof' : 'not_created_until_payment_proof',
    payment_proof_reference: createWorkspaceAllowed ? text(state.payment_proof_reference) || 'OWNER_PROOF_REFERENCE_REQUIRED' : 'required_before_workspace',
    first_run_mode: 'approval_only',
    real_mrr_delta: 0,
    modules,
    first_run_queue: firstRunQueue,
    guardrails: [
      'create_private_workspace_only_after_payment_proof',
      'first_production_run_is_approval_only',
      'no_connector_writes_without_owner_acceptance',
      'no_real_mrr_claim_without_payment_proof',
    ],
  }
}

function buildFirstRunAcceptance(input = {}) {
  const manifest = input.manifest || {}
  const evidenceReference = text(input.evidenceReference || input.firstRunEvidenceReference) || 'FIRST_RUN_OUTPUT_REFERENCE_REQUIRED'
  const preparedAt = text(input.preparedAt) || new Date().toISOString()
  const workspaceSlug = text(manifest.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(input.leadId || manifest.lead_id) || 'not set'
  const templateName = text(input.templateName || manifest.template_name) || text(manifest.template_id) || 'SUPERMEGA agent'
  const acceptanceTests = list(input.acceptanceTests).length
    ? list(input.acceptanceTests)
    : ['Shows source trace for important outputs.', 'Uses only approved sources.', 'Keeps external actions approval-only until accepted.']
  const acceptanceChecklist = [
    'First run output is pasted into the workspace delivery packet.',
    'Source trace is attached for important claims.',
    'Owner reviews the output before any external send, connector write, or recurring charge.',
    'Acceptance or requested changes are recorded in the approval log.',
  ]
  const packet = [
    `# ${templateName} first run acceptance packet`,
    '',
    'Status: draft - owner acceptance required',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Workspace URL: ${text(manifest.workspace_url) || privateWorkspaceUrl(workspaceSlug, leadId)}`,
    `Evidence reference: ${evidenceReference}`,
    'External send/write state: blocked_until_owner_acceptance',
    'Recurring revenue state: not_claimed',
    'Real MRR delta: 0',
    '',
    '## First run output',
    '[Paste the first production run output here before sending to the buyer.]',
    '',
    '## Acceptance tests',
    acceptanceTests.map((item) => `- [ ] ${item}`).join('\n'),
    '',
    '## Owner decision',
    '- [ ] Accept first run and allow the next approval-only production run.',
    '- [ ] Request changes before any production send/write.',
    '- [ ] Approve connector write/send policy separately if needed.',
    '',
    '## Guardrails',
    '- No external send from this packet.',
    '- No connector write before owner acceptance.',
    '- No recurring revenue claim before real payment proof and acceptance evidence.',
  ].join('\n')
  const acceptanceQueueCsv = [
    ['workspace_slug', 'lead_id', 'acceptance_step', 'owner', 'state', 'evidence_required', 'real_mrr_delta'].map(csvCell).join(','),
    [workspaceSlug, leadId, 'paste_first_run_output', 'Delivery Pod', 'draft_required', evidenceReference, '0'].map(csvCell).join(','),
    [workspaceSlug, leadId, 'owner_acceptance_review', 'Founder', 'acceptance_required', 'accepted_or_changes_requested', '0'].map(csvCell).join(','),
    [workspaceSlug, leadId, 'connector_policy_review', 'Founder', 'blocked_until_acceptance', 'explicit_send_write_policy', '0'].map(csvCell).join(','),
  ].join('\n')
  return {
    status: 'first_run_acceptance_packet_ready',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_id: text(manifest.template_id || input.templateId) || null,
    template_name: templateName,
    first_run_state: 'draft_ready_for_owner_review',
    acceptance_state: 'owner_acceptance_required',
    external_action_state: 'blocked_until_owner_acceptance',
    connector_write_state: 'blocked_until_owner_acceptance',
    recurring_revenue_state: 'not_claimed',
    evidence_reference: evidenceReference,
    prepared_at: preparedAt,
    prepared_by: 'operator_console',
    real_mrr_delta: 0,
    acceptance_checklist: acceptanceChecklist,
    acceptance_packet: packet,
    acceptance_queue_csv: acceptanceQueueCsv,
    guardrails: [
      'no_external_send_from_acceptance_packet',
      'no_connector_write_before_owner_acceptance',
      'no_recurring_revenue_claim_without_acceptance_evidence',
    ],
  }
}

function buildOwnerAcceptanceRecord(input = {}) {
  const decision = oneOf(input.decision || input.ownerAcceptanceDecision, ['accepted', 'changes_requested'], '')
  const evidenceReference = text(input.evidenceReference || input.ownerAcceptanceReference)
  const recordedAt = text(input.recordedAt) || new Date().toISOString()
  const acceptance = input.acceptance || {}
  const workspaceSlug = text(acceptance.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(acceptance.lead_id || input.leadId) || 'not set'
  const templateName = text(acceptance.template_name || input.templateName) || 'SUPERMEGA agent'
  const ownerNote = text(input.ownerNote).slice(0, 500)
  const accepted = decision === 'accepted'
  const packet = [
    `# ${templateName} owner acceptance record`,
    '',
    `Decision: ${decision || 'missing_decision'}`,
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Evidence reference: ${evidenceReference || 'OWNER_ACCEPTANCE_REFERENCE_REQUIRED'}`,
    `Recorded at: ${recordedAt}`,
    ownerNote ? `Owner note: ${ownerNote}` : 'Owner note: not recorded',
    'Real MRR delta: 0',
    '',
    '## Result',
    accepted
      ? 'Owner accepted the first run for the next approval-only production run.'
      : 'Owner requested changes; no production send/write is allowed until a revised run is accepted.',
    '',
    '## Guardrails',
    '- Connector writes remain blocked until a separate explicit connector policy is approved.',
    '- External sends remain approval-only.',
    '- Recurring revenue is still not claimed from this record.',
    '- Real MRR remains 0 until payment and acceptance evidence are reconciled in the revenue ledger.',
  ].join('\n')
  const queueCsv = [
    ['workspace_slug', 'lead_id', 'decision', 'next_step', 'external_action_state', 'connector_write_state', 'recurring_revenue_state', 'real_mrr_delta', 'evidence_reference'].map(csvCell).join(','),
    [
      workspaceSlug,
      leadId,
      decision,
      accepted ? 'run_next_approval_only_cycle' : 'revise_first_run_output',
      accepted ? 'approval_only_next_run_allowed' : 'blocked_until_revised_acceptance',
      'blocked_until_explicit_policy',
      'not_claimed',
      '0',
      evidenceReference,
    ].map(csvCell).join(','),
  ].join('\n')
  return {
    status: 'owner_acceptance_recorded',
    decision,
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    evidence_reference: evidenceReference,
    owner_note: ownerNote,
    recorded_at: recordedAt,
    recorded_by: 'operator_console',
    first_run_state: accepted ? 'accepted_for_next_approval_only_run' : 'changes_requested',
    external_action_state: accepted ? 'approval_only_next_run_allowed' : 'blocked_until_revised_acceptance',
    connector_write_state: 'blocked_until_explicit_policy',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
    packet,
    queue_csv: queueCsv,
    guardrails: [
      'no_connector_write_without_explicit_policy',
      'external_sends_remain_approval_only',
      'no_recurring_revenue_claim_from_acceptance_record',
    ],
  }
}

function connectorPolicyActions(value) {
  const raw = Array.isArray(value) ? value : text(value).split(',')
  const allowed = new Map([
    ['read_approved_sources', 'Read only buyer-approved sources.'],
    ['draft_next_run', 'Draft the next production run inside the private workspace.'],
    ['queue_external_send_for_owner_approval', 'Queue external sends for owner approval before sending.'],
    ['queue_connector_write_for_owner_approval', 'Queue connector writes for owner approval before writing.'],
    ['record_source_trace', 'Record source trace and decision evidence for every important output.'],
  ])
  const normalized = raw
    .map((item) => text(item).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
    .filter((item) => allowed.has(item))
  const unique = [...new Set(normalized)]
  return unique.length ? unique.map((id) => ({ id, label: allowed.get(id) })) : [
    { id: 'read_approved_sources', label: allowed.get('read_approved_sources') },
    { id: 'draft_next_run', label: allowed.get('draft_next_run') },
    { id: 'queue_external_send_for_owner_approval', label: allowed.get('queue_external_send_for_owner_approval') },
    { id: 'queue_connector_write_for_owner_approval', label: allowed.get('queue_connector_write_for_owner_approval') },
    { id: 'record_source_trace', label: allowed.get('record_source_trace') },
  ]
}

function buildConnectorPolicyRecord(input = {}) {
  const ownerAcceptance = input.ownerAcceptance || {}
  const evidenceReference = text(input.evidenceReference || input.connectorPolicyReference)
  const recordedAt = text(input.recordedAt) || new Date().toISOString()
  const policyMode = oneOf(input.policyMode || input.connectorPolicyMode, ['approval_only'], 'approval_only')
  const actions = connectorPolicyActions(input.allowedConnectorActions || input.allowed_actions)
  const workspaceSlug = text(ownerAcceptance.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(ownerAcceptance.lead_id || input.leadId) || 'not set'
  const templateName = text(ownerAcceptance.template_name || input.templateName) || 'SUPERMEGA agent'
  const ownerNote = text(input.ownerNote).slice(0, 500)
  const blockedActions = [
    'autonomous_external_send',
    'autonomous_connector_write',
    'payment_or_recurring_revenue_claim',
    'credentialed_browser_action_without_per_action_approval',
  ]
  const config = {
    status: 'connector_policy_recorded',
    policy_mode: policyMode,
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    allowed_actions: actions.map((item) => item.id),
    blocked_actions: blockedActions,
    per_action_approval_required: true,
    source_trace_required: true,
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
  }
  const packet = [
    `# ${templateName} connector policy record`,
    '',
    'Status: connector_policy_recorded',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Policy mode: ${policyMode}`,
    `Evidence reference: ${evidenceReference || 'CONNECTOR_POLICY_REFERENCE_REQUIRED'}`,
    `Recorded at: ${recordedAt}`,
    ownerNote ? `Owner note: ${ownerNote}` : 'Owner note: not recorded',
    'External send state: approval_required_per_action',
    'Connector write state: approval_required_per_action',
    'Recurring revenue state: not_claimed',
    'Real MRR delta: 0',
    '',
    '## Allowed connector actions',
    actions.map((item) => `- ${item.id}: ${item.label}`).join('\n'),
    '',
    '## Still blocked',
    blockedActions.map((item) => `- ${item}`).join('\n'),
    '',
    '## Guardrails',
    '- Every external send or connector write still needs a named owner approval event.',
    '- The policy config is a run-control record, not an automatic connector credential.',
    '- Revenue is still not claimed from this policy record.',
  ].join('\n')
  const queueCsv = [
    ['workspace_slug', 'lead_id', 'policy_mode', 'allowed_actions', 'external_send_state', 'connector_write_state', 'recurring_revenue_state', 'real_mrr_delta', 'evidence_reference'].map(csvCell).join(','),
    [
      workspaceSlug,
      leadId,
      policyMode,
      actions.map((item) => item.id).join('|'),
      'approval_required_per_action',
      'approval_required_per_action',
      'not_claimed',
      '0',
      evidenceReference,
    ].map(csvCell).join(','),
  ].join('\n')
  return {
    status: 'connector_policy_recorded',
    policy_mode: policyMode,
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    evidence_reference: evidenceReference,
    owner_note: ownerNote,
    recorded_at: recordedAt,
    recorded_by: 'operator_console',
    allowed_connector_actions: actions.map((item) => item.id),
    blocked_actions: blockedActions,
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
    packet,
    queue_csv: queueCsv,
    config,
    config_json: JSON.stringify(config, null, 2),
    guardrails: [
      'per_action_owner_approval_required',
      'no_autonomous_external_send',
      'no_autonomous_connector_write',
      'no_recurring_revenue_claim_from_connector_policy',
    ],
  }
}

function buildProductionApprovalQueue(input = {}) {
  const connectorPolicy = input.connectorPolicy || {}
  const evidenceReference = text(input.evidenceReference || input.productionQueueReference)
  const preparedAt = text(input.preparedAt) || new Date().toISOString()
  const workspaceSlug = text(connectorPolicy.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(connectorPolicy.lead_id || input.leadId) || 'not set'
  const templateName = text(connectorPolicy.template_name || input.templateName) || 'SUPERMEGA agent'
  const sourceTrace = text(input.sourceTrace || input.source_trace || evidenceReference)
  const queue = [
    {
      queue_id: 'draft_next_run_output',
      action_type: 'internal_draft',
      title: `Draft the next ${templateName} output inside the private workspace`,
      owner: 'Agent Pod',
      execution_state: 'ready_for_agent_draft',
      approval_state: 'operator_review_required',
      external_send_state: 'not_external',
      connector_write_state: 'no_write',
      evidence_required: 'source_trace',
    },
    {
      queue_id: 'queue_client_update',
      action_type: 'external_send',
      title: 'Queue the client update for owner approval',
      owner: 'Founder',
      execution_state: 'blocked_until_owner_approval',
      approval_state: 'owner_approval_required',
      external_send_state: 'queued_for_owner_approval',
      connector_write_state: 'no_write',
      evidence_required: 'approved_message_copy',
    },
    {
      queue_id: 'queue_connector_writeback',
      action_type: 'connector_write',
      title: 'Queue any CRM, sheet, calendar, or file writeback for owner approval',
      owner: 'Founder',
      execution_state: 'blocked_until_owner_approval',
      approval_state: 'owner_approval_required',
      external_send_state: 'not_external',
      connector_write_state: 'queued_for_owner_approval',
      evidence_required: 'target_record_and_rollback_note',
    },
    {
      queue_id: 'record_value_evidence',
      action_type: 'value_evidence',
      title: 'Record time saved, revenue influenced, or risk removed without claiming MRR',
      owner: 'Revenue Pod',
      execution_state: 'ready_for_operator_review',
      approval_state: 'operator_review_required',
      external_send_state: 'not_external',
      connector_write_state: 'no_write',
      evidence_required: 'buyer_visible_value_note',
    },
  ].map((item) => ({ ...item, real_mrr_delta: 0 }))
  const packet = [
    `# ${templateName} autopilot approval queue`,
    '',
    'Status: production_approval_queue_ready',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Evidence reference: ${evidenceReference || 'PRODUCTION_QUEUE_REFERENCE_REQUIRED'}`,
    `Prepared at: ${preparedAt}`,
    'Autopilot state: draft_queue_only',
    'External send state: approval_required_per_action',
    'Connector write state: approval_required_per_action',
    'Recurring revenue state: not_claimed',
    'Real MRR delta: 0',
    '',
    '## What the agents may do now',
    '- Draft the next run from approved sources.',
    '- Prepare client-ready messages and writebacks as queued proposals.',
    '- Record source trace and value evidence for renewal conversations.',
    '',
    '## What still needs owner approval',
    queue
      .filter((item) => item.approval_state === 'owner_approval_required')
      .map((item) => `- ${item.queue_id}: ${item.title}`)
      .join('\n'),
    '',
    '## Guardrails',
    '- No external send without a named owner approval event.',
    '- No connector write without target record, rollback note, and owner approval.',
    '- No revenue claim until payment proof and buyer-visible value evidence are reconciled.',
  ].join('\n')
  const queueCsv = [
    ['workspace_slug', 'lead_id', 'queue_id', 'action_type', 'owner', 'execution_state', 'approval_state', 'external_send_state', 'connector_write_state', 'evidence_required', 'real_mrr_delta'].map(csvCell).join(','),
    ...queue.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.queue_id,
        item.action_type,
        item.owner,
        item.execution_state,
        item.approval_state,
        item.external_send_state,
        item.connector_write_state,
        item.evidence_required,
        '0',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const config = {
    status: 'production_approval_queue_ready',
    autopilot_state: 'draft_queue_only',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    source_trace: sourceTrace || 'source_trace_required',
    queue_ids: queue.map((item) => item.queue_id),
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
    approval_required_for: ['external_send', 'connector_write', 'credentialed_browser_action', 'payment_or_revenue_claim'],
  }
  return {
    status: 'production_approval_queue_ready',
    autopilot_state: 'draft_queue_only',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    evidence_reference: evidenceReference,
    prepared_at: preparedAt,
    prepared_by: 'operator_console',
    queue,
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
    packet,
    queue_csv: queueCsv,
    config,
    config_json: JSON.stringify(config, null, 2),
    guardrails: [
      'agents_prepare_drafts_and_proposals_only',
      'per_action_owner_approval_required_for_sends_and_writes',
      'no_revenue_claim_without_payment_and_value_evidence',
    ],
  }
}

function buildEnterpriseDeliveryPack(input = {}) {
  const productionQueue = input.productionQueue || {}
  const evidenceReference = text(input.evidenceReference || input.deliveryPackReference)
  const preparedAt = text(input.preparedAt) || new Date().toISOString()
  const workspaceSlug = text(productionQueue.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(productionQueue.lead_id || input.leadId) || 'not set'
  const templateName = text(productionQueue.template_name || input.templateName) || 'SUPERMEGA agent'
  const supportWindow = text(input.supportWindow || input.support_window) || 'business-hours Myanmar time, urgent blockers reviewed same day'
  const roles = [
    { role: 'client_owner', access: 'approve scope, sources, sends, connector writes, and value evidence' },
    { role: 'client_operator', access: 'submit source updates, review drafts, and request changes' },
    { role: 'supermega_operator', access: 'prepare proofs, run drafts, and maintain the approval queue' },
    { role: 'agent_worker', access: 'draft only from approved sources; no credentials or external actions' },
  ]
  const rollout = [
    { day: 'day_0', milestone: 'Confirm source access, owner approvals, payment proof, and private workspace.' },
    { day: 'day_1_to_3', milestone: 'Run approval-only autopilot drafts and collect change requests.' },
    { day: 'day_4_to_7', milestone: 'Approve first client-facing send/write actions one by one.' },
    { day: 'day_8_to_30', milestone: 'Track value evidence, support tickets, exception patterns, and renewal reason.' },
  ]
  const serviceLevels = [
    { area: 'source_trace', promise: 'Every important output names the approved source or evidence reference.' },
    { area: 'approval_boundary', promise: 'No external send, connector write, credentialed browser action, or payment action without owner approval.' },
    { area: 'rollback', promise: 'Every connector write proposal includes a target record and rollback note before approval.' },
    { area: 'support', promise: supportWindow },
  ]
  const valueLedgerCsv = [
    ['workspace_slug', 'lead_id', 'metric', 'baseline', 'current_evidence', 'owner_confirmed', 'real_mrr_delta'].map(csvCell).join(','),
    [workspaceSlug, leadId, 'time_saved', 'unknown_until_client_confirms', 'operator_estimate_requires_source_trace', 'no', '0'].map(csvCell).join(','),
    [workspaceSlug, leadId, 'revenue_influenced', 'unknown_until_client_confirms', 'buyer_visible_value_note_required', 'no', '0'].map(csvCell).join(','),
    [workspaceSlug, leadId, 'risk_removed', 'unknown_until_client_confirms', 'exception_or_error_prevented_evidence_required', 'no', '0'].map(csvCell).join(','),
    [workspaceSlug, leadId, 'renewal_reason', 'not_claimed', '30_day_value_review_required', 'no', '0'].map(csvCell).join(','),
  ].join('\n')
  const accessMatrixCsv = [
    ['workspace_slug', 'lead_id', 'role', 'access', 'external_action_allowed', 'connector_write_allowed'].map(csvCell).join(','),
    ...roles.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.role,
        item.access,
        item.role === 'client_owner' ? 'approve_only' : 'no',
        item.role === 'client_owner' ? 'approve_only' : 'no',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const packet = [
    `# ${templateName} enterprise delivery pack`,
    '',
    'Status: enterprise_delivery_pack_ready',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Evidence reference: ${evidenceReference || 'ENTERPRISE_DELIVERY_REFERENCE_REQUIRED'}`,
    `Prepared at: ${preparedAt}`,
    'Delivery mode: managed_ai_workcell',
    'Autopilot state: draft_queue_only_with_owner_approvals',
    'Enterprise posture: approval_gated_source_traced',
    'Recurring revenue state: not_claimed',
    'Real MRR delta: 0',
    '',
    '## Access matrix',
    roles.map((item) => `- ${item.role}: ${item.access}`).join('\n'),
    '',
    '## Rollout plan',
    rollout.map((item) => `- ${item.day}: ${item.milestone}`).join('\n'),
    '',
    '## Service levels',
    serviceLevels.map((item) => `- ${item.area}: ${item.promise}`).join('\n'),
    '',
    '## Value evidence ledger',
    '- time_saved: owner-confirmed evidence required',
    '- revenue_influenced: buyer-visible evidence required',
    '- risk_removed: source-traced exception evidence required',
    '- renewal_reason: 30-day value review required',
    '',
    '## Guardrails',
    '- This delivery pack does not grant connector credentials.',
    '- This delivery pack does not authorize autonomous external sends or writes.',
    '- Real MRR remains 0 until payment proof and buyer-confirmed value evidence are recorded.',
  ].join('\n')
  const config = {
    status: 'enterprise_delivery_pack_ready',
    delivery_mode: 'managed_ai_workcell',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    access_roles: roles.map((item) => item.role),
    rollout_days: rollout.map((item) => item.day),
    support_window: supportWindow,
    autopilot_state: 'draft_queue_only_with_owner_approvals',
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
  }
  return {
    status: 'enterprise_delivery_pack_ready',
    delivery_mode: 'managed_ai_workcell',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    evidence_reference: evidenceReference,
    prepared_at: preparedAt,
    prepared_by: 'operator_console',
    access_matrix: roles,
    rollout_plan: rollout,
    service_levels: serviceLevels,
    support_window: supportWindow,
    autopilot_state: 'draft_queue_only_with_owner_approvals',
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
    packet,
    access_matrix_csv: accessMatrixCsv,
    value_ledger_csv: valueLedgerCsv,
    config,
    config_json: JSON.stringify(config, null, 2),
    guardrails: [
      'enterprise_delivery_pack_is_not_connector_credential',
      'source_trace_required_for_value_claims',
      'per_action_owner_approval_required',
      'no_real_mrr_claim_without_payment_and_value_evidence',
    ],
  }
}

function buildCustomerSuccessDeskPack(input = {}) {
  const enterprisePack = input.enterprisePack || {}
  const evidenceReference = text(input.evidenceReference || input.customerSuccessReference || input.successReference)
  const preparedAt = text(input.preparedAt) || new Date().toISOString()
  const workspaceSlug = text(enterprisePack.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(enterprisePack.lead_id || input.leadId) || 'not set'
  const templateName = text(enterprisePack.template_name || input.templateName) || 'SUPERMEGA agent'
  const supportWindow = text(enterprisePack.support_window || input.supportWindow || input.support_window) || 'business-hours Myanmar time, urgent blockers reviewed same day'
  const cadence = [
    { day: 'day_1', checkpoint: 'Confirm the first managed run outcome, source trace, blockers, and owner approval queue.' },
    { day: 'day_3', checkpoint: 'Resolve onboarding friction and record the first buyer-visible value evidence.' },
    { day: 'day_7', checkpoint: 'Review repeated tasks, exception patterns, and support tickets before expanding automation.' },
    { day: 'day_14', checkpoint: 'Prepare the second value proof and decide whether another module is justified.' },
    { day: 'day_30', checkpoint: 'Run renewal review with value ledger, open risks, next-module proposal, and owner decision.' },
  ]
  const tickets = [
    {
      ticket_type: 'onboarding_blocker',
      owner: 'SuperMega operator',
      state: 'watch',
      evidence_required: 'client_message_or_failed_step_trace',
      external_action_state: 'draft_only',
    },
    {
      ticket_type: 'source_quality_issue',
      owner: 'Agent Pod',
      state: 'watch',
      evidence_required: 'source_trace_and_missing_field_note',
      external_action_state: 'not_external',
    },
    {
      ticket_type: 'user_training_gap',
      owner: 'Client operator',
      state: 'watch',
      evidence_required: 'screen_recording_or_operator_note',
      external_action_state: 'draft_only',
    },
    {
      ticket_type: 'value_exception',
      owner: 'Founder',
      state: 'review',
      evidence_required: 'buyer_visible_value_note',
      external_action_state: 'owner_approval_required',
    },
  ].map((item) => ({ ...item, real_mrr_delta: 0 }))
  const valueEvidence = [
    { value_metric: 'time_saved', baseline: 'unknown_until_client_confirms', current_evidence: 'timed_workflow_or_operator_note_required', owner_confirmed: 'no', renewal_note: 'prove before renewal' },
    { value_metric: 'revenue_influenced', baseline: 'unknown_until_client_confirms', current_evidence: 'lead_order_or_followup_evidence_required', owner_confirmed: 'no', renewal_note: 'do not claim without buyer evidence' },
    { value_metric: 'risk_removed', baseline: 'unknown_until_client_confirms', current_evidence: 'error_prevented_or_missing_task_closed', owner_confirmed: 'no', renewal_note: 'tie to support ticket' },
    { value_metric: 'response_speed', baseline: 'unknown_until_client_confirms', current_evidence: 'before_after_response_sample_required', owner_confirmed: 'no', renewal_note: 'use in 30-day review' },
    { value_metric: 'renewal_reason', baseline: 'not_claimed', current_evidence: '30_day_value_review_required', owner_confirmed: 'no', renewal_note: 'decision pending' },
  ].map((item) => ({ ...item, real_mrr_delta: 0 }))
  const renewalQueue = [
    { renewal_step: 'collect_value_evidence', owner: 'SuperMega operator', state: 'open', evidence_required: 'source_traced_value_ledger' },
    { renewal_step: 'prepare_30_day_review', owner: 'Revenue Pod', state: 'open', evidence_required: 'client_update_and_open_risk_summary' },
    { renewal_step: 'confirm_next_module', owner: 'Founder', state: 'blocked_until_value_evidence', evidence_required: 'buyer_visible_need_and_scope' },
    { renewal_step: 'decide_retainer', owner: 'Client owner', state: 'not_requested', evidence_required: 'payment_and_value_evidence_before_claim' },
  ].map((item) => ({ ...item, real_mrr_delta: 0 }))
  const ticketQueueCsv = [
    ['workspace_slug', 'lead_id', 'ticket_type', 'owner', 'state', 'evidence_required', 'external_action_state', 'real_mrr_delta'].map(csvCell).join(','),
    ...tickets.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.ticket_type,
        item.owner,
        item.state,
        item.evidence_required,
        item.external_action_state,
        '0',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const valueLedgerCsv = [
    ['workspace_slug', 'lead_id', 'value_metric', 'baseline', 'current_evidence', 'owner_confirmed', 'renewal_note', 'real_mrr_delta'].map(csvCell).join(','),
    ...valueEvidence.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.value_metric,
        item.baseline,
        item.current_evidence,
        item.owner_confirmed,
        item.renewal_note,
        '0',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const renewalQueueCsv = [
    ['workspace_slug', 'lead_id', 'renewal_step', 'owner', 'state', 'evidence_required', 'real_mrr_delta'].map(csvCell).join(','),
    ...renewalQueue.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.renewal_step,
        item.owner,
        item.state,
        item.evidence_required,
        '0',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const clientUpdateDraft = [
    `# ${templateName} client update draft`,
    '',
    'Status: draft - review before sending',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Evidence reference: ${evidenceReference || 'CUSTOMER_SUCCESS_REFERENCE_REQUIRED'}`,
    '',
    '## What happened',
    '- First managed run is in support mode.',
    '- Open issues are tracked in the customer success ticket queue.',
    '- Value evidence is being recorded before any renewal or upsell claim.',
    '',
    '## What we need from the client',
    '- Confirm whether the latest output was useful.',
    '- Send one example of a missed, slow, or repeated task we should improve.',
    '- Approve any external message, connector write, account action, or next-module change before it happens.',
  ].join('\n')
  const packet = [
    `# ${templateName} 30-day customer success desk`,
    '',
    'Status: customer_success_desk_ready',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Evidence reference: ${evidenceReference || 'CUSTOMER_SUCCESS_REFERENCE_REQUIRED'}`,
    `Prepared at: ${preparedAt}`,
    'Desk type: managed_ai_agent_customer_success',
    'Support window: ' + supportWindow,
    'Recurring revenue state: not_claimed',
    'Real MRR delta: 0',
    '',
    '## 30-day cadence',
    cadence.map((item) => `- ${item.day}: ${item.checkpoint}`).join('\n'),
    '',
    '## Support queue',
    tickets.map((item) => `- ${item.ticket_type}: ${item.owner} / ${item.state} / ${item.evidence_required}`).join('\n'),
    '',
    '## Value evidence',
    valueEvidence.map((item) => `- ${item.value_metric}: ${item.current_evidence}`).join('\n'),
    '',
    '## Renewal motion',
    renewalQueue.map((item) => `- ${item.renewal_step}: ${item.state} (${item.evidence_required})`).join('\n'),
    '',
    '## Guardrails',
    '- Do not claim retention, upsell, or MRR from this desk without payment proof and buyer-confirmed value evidence.',
    '- Do not send client updates or make connector writes without owner approval.',
    '- Every value claim must link to a source trace, ticket, or client confirmation.',
  ].join('\n')
  const config = {
    status: 'customer_success_desk_ready',
    desk_type: 'managed_ai_agent_customer_success',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    support_window: supportWindow,
    cadence_days: cadence.map((item) => item.day),
    ticket_types: tickets.map((item) => item.ticket_type),
    renewal_steps: renewalQueue.map((item) => item.renewal_step),
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
  }
  return {
    status: 'customer_success_desk_ready',
    desk_type: 'managed_ai_agent_customer_success',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    evidence_reference: evidenceReference,
    prepared_at: preparedAt,
    prepared_by: 'operator_console',
    support_window: supportWindow,
    cadence,
    ticket_queue: tickets,
    value_evidence: valueEvidence,
    renewal_queue: renewalQueue,
    external_send_state: 'approval_required_per_action',
    connector_write_state: 'approval_required_per_action',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
    packet,
    ticket_queue_csv: ticketQueueCsv,
    value_ledger_csv: valueLedgerCsv,
    renewal_queue_csv: renewalQueueCsv,
    client_update_draft: clientUpdateDraft,
    config,
    config_json: JSON.stringify(config, null, 2),
    guardrails: [
      'customer_success_desk_is_not_revenue_proof',
      'value_claims_require_source_trace_or_client_confirmation',
      'per_action_owner_approval_required',
      'no_real_mrr_claim_without_payment_and_value_evidence',
    ],
  }
}

function buildRetainerGrowthOfferPack(input = {}) {
  const customerSuccessDesk = input.customerSuccessDesk || {}
  const evidenceReference = text(input.evidenceReference || input.retainerGrowthReference || input.renewalReference)
  const preparedAt = text(input.preparedAt) || new Date().toISOString()
  const workspaceSlug = text(customerSuccessDesk.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(customerSuccessDesk.lead_id || input.leadId) || 'not set'
  const templateName = text(customerSuccessDesk.template_name || input.templateName) || 'SUPERMEGA agent'
  const retainerQuote = text(input.retainerQuote || input.retainer_quote) || 'OWNER_APPROVED_RETAINER_QUOTE_REQUIRED'
  const offerOptions = [
    {
      option_id: 'managed_support_retainer',
      retainer_shape: 'weekly support, fixes, source maintenance, and owner reporting',
      buyer_value_proof_required: 'confirmed_support_or_time_saved_evidence',
      included_work: 'support queue review, source trace maintenance, client update draft, monthly value ledger',
      approval_state: 'owner_review_required',
      payment_state: 'not_requested',
    },
    {
      option_id: 'growth_operator_retainer',
      retainer_shape: 'recurring agent runs with approval queue and operator review',
      buyer_value_proof_required: 'buyer_visible_repeated_work_or_revenue_followup_evidence',
      included_work: 'scheduled agent runs, approval queue, value ledger, renewal review, next-module proposal',
      approval_state: 'owner_review_required',
      payment_state: 'not_requested',
    },
    {
      option_id: 'next_module_build',
      retainer_shape: 'new agent module or connector added after value review',
      buyer_value_proof_required: 'specific_next_module_need_and_source_sample',
      included_work: 'module blueprint, source manifest, first proof, acceptance tests, delivery pack',
      approval_state: 'scope_review_required',
      payment_state: 'not_requested',
    },
  ].map((item) => ({ ...item, real_mrr_delta: 0 }))
  const decisionLedger = [
    { renewal_action: 'confirm_value_evidence', owner: 'SuperMega operator', state: 'open', evidence_required: 'source_traced_value_ledger' },
    { renewal_action: 'choose_offer_shape', owner: 'Founder', state: 'blocked_until_value_evidence', evidence_required: 'client_success_review_note' },
    { renewal_action: 'approve_retainer_quote', owner: 'Founder', state: 'owner_approval_required', evidence_required: 'owner_approved_mmk_quote' },
    { renewal_action: 'send_retainer_offer', owner: 'Founder', state: 'not_sent', evidence_required: 'owner_approved_client_message' },
    { renewal_action: 'attach_payment_proof', owner: 'Revenue Pod', state: 'payment_proof_required', evidence_required: 'receipt_transfer_reference_or_checkout_record' },
  ].map((item) => ({ ...item, real_mrr_delta: 0 }))
  const nextModuleRoadmap = [
    { module_id: 'source_monitor', trigger: 'client confirms repeated source checking work', proof_needed: 'source list and missed-change example', state: 'candidate' },
    { module_id: 'approval_inbox', trigger: 'client has recurring outbound or writeback approvals', proof_needed: 'sample message or target record', state: 'candidate' },
    { module_id: 'reporting_pack', trigger: 'client asks for weekly/monthly owner reporting', proof_needed: 'report format or decision question', state: 'candidate' },
  ].map((item) => ({ ...item, real_mrr_delta: 0 }))
  const offerOptionsCsv = [
    ['workspace_slug', 'lead_id', 'option_id', 'retainer_shape', 'buyer_value_proof_required', 'included_work', 'approval_state', 'payment_state', 'real_mrr_delta'].map(csvCell).join(','),
    ...offerOptions.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.option_id,
        item.retainer_shape,
        item.buyer_value_proof_required,
        item.included_work,
        item.approval_state,
        item.payment_state,
        '0',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const decisionLedgerCsv = [
    ['workspace_slug', 'lead_id', 'renewal_action', 'owner', 'state', 'evidence_required', 'real_mrr_delta'].map(csvCell).join(','),
    ...decisionLedger.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.renewal_action,
        item.owner,
        item.state,
        item.evidence_required,
        '0',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const roadmapCsv = [
    ['workspace_slug', 'lead_id', 'module_id', 'trigger', 'proof_needed', 'state', 'real_mrr_delta'].map(csvCell).join(','),
    ...nextModuleRoadmap.map((item) =>
      [
        workspaceSlug,
        leadId,
        item.module_id,
        item.trigger,
        item.proof_needed,
        item.state,
        '0',
      ].map(csvCell).join(','),
    ),
  ].join('\n')
  const invoiceRequestDraft = [
    `# ${templateName} retainer invoice request draft`,
    '',
    'Status: draft - owner approval required before sending',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Retainer quote: ${retainerQuote}`,
    'Payment route: PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
    'Real MRR delta: 0',
    '',
    '## Buyer message',
    'The first 30-day support review shows enough evidence to propose a managed retainer, but this invoice request is not live until the owner approves the exact MMK quote and payment route.',
    '',
    '## Stop conditions',
    '- Do not send this invoice request without owner approval.',
    '- Do not create a live payment link from this packet.',
    '- Do not claim MRR until payment proof is attached and reconciled.',
  ].join('\n')
  const clientEmailDraft = [
    `# ${templateName} retainer offer email draft`,
    '',
    'Status: draft - review before sending',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Evidence reference: ${evidenceReference || 'RETAINER_GROWTH_REFERENCE_REQUIRED'}`,
    '',
    'Hi,',
    '',
    'Based on the first support cycle, I can keep this running as a managed AI-agent workcell instead of a one-off build.',
    '',
    'The next step is a short value review: confirm what saved time, reduced risk, or moved revenue, then choose the retainer shape that matches the real workflow.',
    '',
    'I will not send payment requests, connect accounts, write records, or claim recurring revenue without owner approval and payment proof.',
  ].join('\n')
  const packet = [
    `# ${templateName} retainer growth offer`,
    '',
    'Status: retainer_growth_offer_ready',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Evidence reference: ${evidenceReference || 'RETAINER_GROWTH_REFERENCE_REQUIRED'}`,
    `Prepared at: ${preparedAt}`,
    'Offer type: evidence_gated_retainer_growth',
    `Retainer quote: ${retainerQuote}`,
    'Recurring revenue state: not_claimed',
    'Real MRR delta: 0',
    '',
    '## Offer options',
    offerOptions.map((item) => `- ${item.option_id}: ${item.retainer_shape} (${item.buyer_value_proof_required})`).join('\n'),
    '',
    '## Decision ledger',
    decisionLedger.map((item) => `- ${item.renewal_action}: ${item.state} / ${item.evidence_required}`).join('\n'),
    '',
    '## Next module roadmap',
    nextModuleRoadmap.map((item) => `- ${item.module_id}: ${item.trigger}`).join('\n'),
    '',
    '## Guardrails',
    '- This offer is not a payment request until the owner approves the MMK quote and message.',
    '- Real MRR remains 0 until payment proof is recorded.',
    '- Expansion modules require a source sample, first proof, and acceptance tests.',
  ].join('\n')
  const config = {
    status: 'retainer_growth_offer_ready',
    offer_type: 'evidence_gated_retainer_growth',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    retainer_quote: retainerQuote,
    option_ids: offerOptions.map((item) => item.option_id),
    decision_actions: decisionLedger.map((item) => item.renewal_action),
    next_module_candidates: nextModuleRoadmap.map((item) => item.module_id),
    recurring_revenue_state: 'not_claimed',
    payment_state: 'payment_proof_required_before_mrr',
    real_mrr_delta: 0,
  }
  return {
    status: 'retainer_growth_offer_ready',
    offer_type: 'evidence_gated_retainer_growth',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    evidence_reference: evidenceReference,
    prepared_at: preparedAt,
    prepared_by: 'operator_console',
    retainer_quote: retainerQuote,
    offer_options: offerOptions,
    decision_ledger: decisionLedger,
    next_module_roadmap: nextModuleRoadmap,
    recurring_revenue_state: 'not_claimed',
    payment_state: 'payment_proof_required_before_mrr',
    real_mrr_delta: 0,
    packet,
    offer_options_csv: offerOptionsCsv,
    decision_ledger_csv: decisionLedgerCsv,
    next_module_roadmap_csv: roadmapCsv,
    invoice_request_draft: invoiceRequestDraft,
    client_email_draft: clientEmailDraft,
    config,
    config_json: JSON.stringify(config, null, 2),
    guardrails: [
      'retainer_offer_is_not_payment_proof',
      'owner_approval_required_before_invoice_or_client_send',
      'no_real_mrr_claim_without_payment_proof',
      'next_module_requires_source_sample_and_acceptance_tests',
    ],
  }
}

function buildRetainerPaymentRecord(input = {}) {
  const retainerGrowthOffer = input.retainerGrowthOffer || {}
  const preparedAt = text(input.preparedAt) || new Date().toISOString()
  const workspaceSlug = text(retainerGrowthOffer.workspace_slug || input.workspaceSlug) || 'private-workspace-required'
  const leadId = text(retainerGrowthOffer.lead_id || input.leadId) || 'not set'
  const templateName = text(retainerGrowthOffer.template_name || input.templateName) || 'SUPERMEGA agent'
  const paymentProofReference = text(input.paymentProofReference || input.payment_proof_reference)
  const ownerApprovalReference = text(input.ownerApprovalReference || input.owner_approval_reference)
  const amountMmk = moneyAmount(input.amountMmk || input.amount_mmk)
  const paymentPeriod = oneOf(input.paymentPeriod || input.payment_period, ['monthly', 'quarterly', 'annual', 'one_time_retainer'], 'monthly')
  const periodDivisor = paymentPeriod === 'annual' ? 12 : paymentPeriod === 'quarterly' ? 3 : paymentPeriod === 'one_time_retainer' ? 0 : 1
  const normalizedMrrDeltaMmk = periodDivisor ? Math.round(amountMmk / periodDivisor) : 0
  const paidAt = text(input.paidAt || input.paid_at) || preparedAt
  const ledgerCsv = [
    ['workspace_slug', 'lead_id', 'template_name', 'amount_mmk', 'payment_period', 'normalized_mrr_delta_mmk', 'payment_proof_reference', 'owner_approval_reference', 'bank_reconciliation_state', 'recorded_at'].map(csvCell).join(','),
    [
      workspaceSlug,
      leadId,
      templateName,
      String(amountMmk),
      paymentPeriod,
      String(normalizedMrrDeltaMmk),
      paymentProofReference,
      ownerApprovalReference,
      'not_bank_verified',
      preparedAt,
    ].map(csvCell).join(','),
  ].join('\n')
  const packet = [
    `# ${templateName} retainer payment proof record`,
    '',
    'Status: retainer_payment_proof_recorded',
    `Lead: ${leadId}`,
    `Workspace: ${workspaceSlug}`,
    `Amount MMK: ${amountMmk}`,
    `Payment period: ${paymentPeriod}`,
    `Normalized MRR delta MMK: ${normalizedMrrDeltaMmk}`,
    `Payment proof reference: ${paymentProofReference || 'PAYMENT_PROOF_REFERENCE_REQUIRED'}`,
    `Owner approval reference: ${ownerApprovalReference || 'OWNER_APPROVAL_REFERENCE_REQUIRED'}`,
    `Paid at: ${paidAt}`,
    `Recorded at: ${preparedAt}`,
    'Recurring revenue state: payment_proof_recorded',
    'Bank reconciliation state: not_bank_verified',
    '',
    '## Guardrails',
    '- This record requires a human-supplied payment proof reference.',
    '- Bank reconciliation is still not automatic.',
    '- Change, refund, or cancellation evidence must be recorded separately before adjusting MRR down.',
  ].join('\n')
  const summary = {
    status: 'retainer_payment_proof_recorded',
    revenue_event_type: 'retainer_payment_proof',
    workspace_slug: workspaceSlug,
    lead_id: leadId,
    template_name: templateName,
    amount_mmk: amountMmk,
    payment_period: paymentPeriod,
    normalized_mrr_delta_mmk: normalizedMrrDeltaMmk,
    real_mrr_delta: normalizedMrrDeltaMmk,
    recurring_revenue_state: 'payment_proof_recorded',
    payment_state: 'payment_proof_attached',
    payment_proof_reference: paymentProofReference,
    owner_approval_reference: ownerApprovalReference,
    bank_reconciliation_state: 'not_bank_verified',
    paid_at: paidAt,
    recorded_at: preparedAt,
  }
  return {
    ...summary,
    prepared_by: 'operator_console',
    packet,
    ledger_csv: ledgerCsv,
    summary,
    summary_json: JSON.stringify(summary, null, 2),
    guardrails: [
      'payment_proof_reference_required',
      'owner_approval_reference_required',
      'bank_reconciliation_not_automatic',
      'mrr_delta_is_normalized_from_recorded_payment_period',
    ],
  }
}

function envText(...names) {
  for (const name of names) {
    const value = text(process.env[name])
    if (value) return value
  }
  return ''
}

function supabaseConfig() {
  return {
    url: envText('SUPABASE_URL', 'DATABASE_URL_SUPABASE_URL', 'DATABASE_URL_SUPERMEGA_DATABASE_URLSUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: envText('SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function countFromRange(value) {
  const match = text(value).match(/\/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function safeLead(row) {
  return {
    lead_id: row.lead_id || null,
    task_id: row.task_id || null,
    submitted_at: row.submitted_at || null,
    requested_package: row.requested_package || 'Workflow system',
    lead_score: Number(row.lead_score || 0),
    lead_stage: row.lead_stage || 'needs_context',
    status: row.status || 'routed',
    next_step: row.next_step || 'Review and reply with first workflow request.',
  }
}

function firstProofPacket(row) {
  const payload = parseJsonObject(row.payload)
  const result = parseJsonObject(row.result)
  const task = parseJsonObject(payload.first_proof_task)
  const isTask = task.type === 'first_proof_build'
  const isBrief = result.type === 'first_proof_operator_brief'
  if (!isTask && !isBrief) return null

  const checklist = list(result.checklist).length ? list(result.checklist) : list(task.checklist)
  const acceptanceTests = list(result.acceptance_tests).length ? list(result.acceptance_tests) : list(task.acceptance_tests)
  const templateId = text(result.template_id) || text(task.template_id) || text(payload.template_id)
  const templateName = text(task.template_name) || text(payload.public_package) || text(payload.requested_package) || templateId
  const starterKitUrl = text(result.starter_kit_url) || text(task.starter_kit_url) || text(payload.starter_kit_url)
  const firstProofTarget = text(result.first_proof_target) || text(task.first_proof_target) || text(payload.first_proof_target)
  const priceHint = text(task.price_hint) || text(payload.price_hint) || 'quote after proof review'
  const nextStep = text(row.next_step) || 'Share one approved sample source so we can build the first proof.'
  const leadId = text(row.lead_id) || 'not set'
  const intakeJob = parseJsonObject(result.intake_job || task.intake_job || payload.intake_job)
  const solutionRoute = parseJsonObject(result.solution_route || task.solution_route || payload.solution_route)
  const implementationBlueprintPack = parseJsonObject(result.implementation_blueprint_pack || task.implementation_blueprint_pack || payload.implementation_blueprint_pack)
  const clientKickoffPack = parseJsonObject(result.client_kickoff_pack || task.client_kickoff_pack || payload.client_kickoff_pack)
  const sourceTrace = list(task.source_trace || payload.source_trace)
  const persistedOrderRoomState = parseJsonObject(result.pilot_order_room_state || payload.pilot_order_room_state)
  const firstRunAcceptance = parseJsonObject(result.first_run_acceptance || payload.first_run_acceptance)
  const ownerAcceptance = parseJsonObject(result.owner_acceptance || payload.owner_acceptance)
  const connectorPolicy = parseJsonObject(result.connector_policy || payload.connector_policy)
  const productionApprovalQueue = parseJsonObject(result.production_approval_queue || payload.production_approval_queue)
  const enterpriseDeliveryPack = parseJsonObject(result.enterprise_delivery_pack || payload.enterprise_delivery_pack)
  const customerSuccessDesk = parseJsonObject(result.customer_success_desk || payload.customer_success_desk)
  const retainerGrowthOffer = parseJsonObject(result.retainer_growth_offer || payload.retainer_growth_offer)
  const retainerPaymentRecord = parseJsonObject(result.retainer_payment_record || payload.retainer_payment_record)
  const orderRoomState = Object.keys(persistedOrderRoomState).length
    ? persistedOrderRoomState
    : {
        status: 'not_persisted',
        scope_approval_state: 'pending',
        price_approval_state: 'pending',
        payment_route_state: 'not_approved',
        payment_request_state: 'not_sent',
        payment_proof_state: 'payment_proof_required',
        private_workspace_state: 'not_created_until_payment_proof',
        real_mrr_delta: 0,
      }
  if (starterKitUrl) sourceTrace.push(`Starter kit: ${starterKitUrl}`)
  if (text(row.lead_id)) sourceTrace.push(`Lead: ${text(row.lead_id)}`)
  const buyerReplyDraft = [
    `Hi ${text(payload.name) || 'there'},`,
    '',
    `I can start with the ${templateName || 'SUPERMEGA agent'} first proof.`,
    '',
    `First proof: ${firstProofTarget || 'one useful output from your approved source sample'}.`,
    '',
    `Please send one approved sample source: a file, screenshot, export, folder link, or email thread that represents the workflow. I will use it only to prepare the first proof and will not send messages, write records, connect accounts, or take payment actions without owner approval.`,
    '',
    `Next step: ${nextStep}`,
    '',
    'Swan',
    'SUPERMEGA.dev',
  ].join('\n')
  const proofDeliveryPacket = [
    `# ${templateName || 'SUPERMEGA agent'} first proof`,
    '',
    `Status: draft - review before sending`,
    `Lead: ${leadId}`,
    `First proof target: ${firstProofTarget || 'not set'}`,
    '',
    '## Result',
    '[Paste the first useful output here after reviewing the approved source sample.]',
    '',
    '## Source trace',
    sourceTrace.length ? sourceTrace.map((item) => `- ${item}`).join('\n') : '- Add the approved source sample, file, screenshot, export, folder link, or email thread used.',
    '',
    '## Acceptance test status',
    acceptanceTests.length ? acceptanceTests.map((item) => `- [ ] ${item}`).join('\n') : '- [ ] Shows the requested first proof with source trace.',
    '',
    '## Approval request',
    'Please confirm whether this first proof matches the workflow. I will not send messages, write records, connect accounts, or take payment actions without owner approval.',
  ].join('\n')
  const pilotClosePacket = [
    `# ${templateName || 'SUPERMEGA agent'} pilot close packet`,
    '',
    `Lead: ${leadId}`,
    `Pilot offer: turn the approved first proof into a working owner-triggered workflow.`,
    `Price hint: ${priceHint}`,
    '',
    '## Scope',
    `- Build around the approved first proof: ${firstProofTarget || 'not set'}`,
    '- Use only buyer-approved source samples, connectors, and accounts.',
    '- Keep external sends, production writes, account connections, and payment actions approval-only.',
    '- Deliver a private operator workspace, source trace, and acceptance-test checklist.',
    '',
    '## Buyer approval needed',
    '- Confirm the first proof is useful.',
    '- Confirm source access and approval boundary.',
    '- Confirm pilot scope and price before any paid build starts.',
    '',
    '## Close message',
    `If this first proof is useful, I can turn it into the working ${templateName || 'SUPERMEGA agent'} pilot. The current price hint is ${priceHint}. I will keep the first production run approval-only and show source trace for the important outputs.`,
  ].join('\n')
  const paymentRequestDraft = [
    `# ${templateName || 'SUPERMEGA agent'} payment request draft`,
    '',
    'Status: draft - owner approval required before sending',
    `Lead: ${leadId}`,
    `Pilot amount: ${priceHint}`,
    'Payment route: PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
    '',
    '## Buyer message',
    `Approved scope: turn the first proof into the working ${templateName || 'SUPERMEGA agent'} pilot.`,
    `Amount to approve: ${priceHint}.`,
    'I will start the pilot only after payment route approval and payment proof are attached to the order room.',
    '',
    '## Guardrails',
    '- Do not send this request until owner approves the scope and payment route.',
    '- Do not create a live payment link or checkout session from this packet.',
    '- Do not start the private workspace until payment proof is attached.',
    '- Do not claim real MRR until payment proof is recorded.',
  ].join('\n')
  const paymentProofLedgerCsv = [
    ['lead_id', 'template_id', 'amount_hint', 'payment_route', 'payment_status', 'payment_proof', 'real_mrr_delta', 'next_step'].map(csvCell).join(','),
    [
      leadId,
      templateId || 'not set',
      priceHint,
      'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
      'payment_proof_required',
      'attach_receipt_or_transfer_reference',
      '0',
      'owner_approval_before_payment_request',
    ]
      .map(csvCell)
      .join(','),
  ].join('\n')
  const orderRoomLedgerCsv = [
    ['lead_id', 'template_id', 'order_status', 'scope_status', 'payment_status', 'workspace_status', 'start_permission', 'real_mrr_delta', 'next_step']
      .map(csvCell)
      .join(','),
    [
      leadId,
      templateId || 'not set',
      'order_not_started',
      'scope_approval_required',
      'payment_proof_required',
      'not_created_until_payment_proof',
      'owner_approval_required',
      '0',
      'confirm_scope_price_and_payment_proof',
    ]
      .map(csvCell)
      .join(','),
  ].join('\n')
  const pilotStartChecklist = [
    'Buyer confirms the first proof is useful.',
    'Owner confirms pilot scope and MMK price.',
    'Owner approves payment route before any payment request is sent.',
    'Payment proof is attached to the payment-proof ledger.',
    'Private operator workspace is created only after payment proof.',
    'First production run remains approval-only until accepted.',
  ]
  const ownerActivationPacket = [
    `# ${templateName || 'SUPERMEGA agent'} owner activation packet`,
    '',
    'Status: draft - owner approval required',
    `Lead: ${leadId}`,
    `Pilot amount: ${priceHint}`,
    'Payment surface: Payment Links first; Checkout Sessions only if app checkout is needed.',
    'Checkout endpoint: /api/checkout-start',
    'Live payment link: PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
    'Real MRR delta: 0 until payment proof is recorded.',
    '',
    '## Owner action queue',
    '1. Approve first proof usefulness and pilot scope.',
    '2. Approve the MMK price and payment route.',
    '3. Create or paste the owner-approved payment link or manual invoice.',
    '4. Send the payment request only after owner approval.',
    '5. Attach receipt, transfer reference, or payment screenshot to the payment-proof ledger.',
    '6. Create the private pilot workspace only after payment proof exists.',
    '7. Run the first production job approval-only until accepted.',
    '',
    '## Stop conditions',
    '- No payment request if scope is not approved.',
    '- No live payment link in this packet.',
    '- No private workspace before payment proof.',
    '- No revenue claim before payment proof.',
  ].join('\n')
  const ownerActionQueueCsv = [
    ['lead_id', 'action_id', 'owner_action', 'approval_state', 'external_action_state', 'payment_state', 'workspace_state', 'real_mrr_delta', 'evidence_required']
      .map(csvCell)
      .join(','),
    [
      leadId,
      'approve_scope_price',
      'Approve first proof, pilot scope, MMK price, and payment route',
      'owner_approval_required',
      'not_sent',
      'not_requested',
      'not_created',
      '0',
      'approved_scope_and_price',
    ]
      .map(csvCell)
      .join(','),
    [
      leadId,
      'send_payment_request',
      'Send owner-approved payment request',
      'owner_approval_required',
      'not_sent',
      'payment_link_required_after_owner_approval',
      'not_created',
      '0',
      'owner_approved_payment_route',
    ]
      .map(csvCell)
      .join(','),
    [
      leadId,
      'attach_payment_proof',
      'Attach payment proof before pilot start',
      'owner_approval_required',
      'not_sent',
      'payment_proof_required',
      'not_created',
      '0',
      'receipt_transfer_reference_or_screenshot',
    ]
      .map(csvCell)
      .join(','),
    [
      leadId,
      'start_private_pilot_workspace',
      'Create private pilot workspace and run approval-only first job',
      'owner_approval_required',
      'not_sent',
      'payment_proof_required',
      'not_created_until_payment_proof',
      '0',
      'payment_proof_and_acceptance_checklist',
    ]
      .map(csvCell)
      .join(','),
  ].join('\n')
  const activationSummaryJson = JSON.stringify(
    {
      status: 'owner_activation_ready_draft_only',
      lead_id: leadId,
      template_id: templateId || null,
      price_hint: priceHint,
      checkout_endpoint: '/api/checkout-start',
      live_payment_link: 'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
      checkout_session_state: 'not_created',
      payment_proof_state: 'payment_proof_required',
      private_workspace_state: 'not_created_until_payment_proof',
      real_mrr_delta: 0,
      guardrails: ['owner_approval_before_payment_request', 'no_live_payment_link_in_packet', 'no_workspace_before_payment_proof', 'no_revenue_claim_without_payment_proof'],
    },
    null,
    2,
  )
  const privateWorkspaceManifest = buildPrivateWorkspaceManifest({
    leadId,
    templateId,
    templateName,
    starterKitUrl,
    firstProofTarget,
    priceHint,
    state: orderRoomState,
  })
  const privateWorkspaceHandoffPacket = [
    `# ${templateName || 'SUPERMEGA agent'} private pilot workspace`,
    '',
    `Status: ${privateWorkspaceManifest.status}`,
    `Workspace slug: ${privateWorkspaceManifest.workspace_slug}`,
    `Workspace URL: ${privateWorkspaceManifest.workspace_url}`,
    `Lead: ${leadId}`,
    `Template: ${templateId || 'not set'}`,
    `First run mode: ${privateWorkspaceManifest.first_run_mode}`,
    `Create workspace allowed: ${privateWorkspaceManifest.create_workspace_allowed ? 'yes' : 'no'}`,
    `Workspace created: ${privateWorkspaceManifest.workspace_created ? 'yes' : 'no'}`,
    `Payment proof: ${privateWorkspaceManifest.payment_proof_reference}`,
    `Real MRR delta: ${privateWorkspaceManifest.real_mrr_delta}`,
    '',
    '## Modules',
    privateWorkspaceManifest.modules.map((item) => `- ${item}`).join('\n'),
    '',
    '## First run queue',
    privateWorkspaceManifest.first_run_queue.map((item) => `- [ ] ${item.step_id}: ${item.title} (${item.external_action_state})`).join('\n'),
    '',
    '## Guardrails',
    privateWorkspaceManifest.guardrails.map((item) => `- ${item}`).join('\n'),
  ].join('\n')
  const firstRunQueueCsv = [
    ['workspace_slug', 'lead_id', 'step_id', 'title', 'owner', 'external_action_state', 'evidence_required', 'real_mrr_delta'].map(csvCell).join(','),
    ...privateWorkspaceManifest.first_run_queue.map((item) =>
      [
        privateWorkspaceManifest.workspace_slug,
        leadId,
        item.step_id,
        item.title,
        item.owner,
        item.external_action_state,
        item.evidence_required,
        '0',
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n')

  return {
    status: isBrief ? 'operator_brief_ready' : 'queued_for_runner',
    template_id: templateId || null,
    template_name: templateName || null,
    starter_kit_url: starterKitUrl || null,
    first_proof_target: firstProofTarget || null,
    solution_route: Object.keys(solutionRoute).length ? solutionRoute : null,
    solution_route_packet: text(solutionRoute.packet),
    solution_route_json: Object.keys(solutionRoute).length ? JSON.stringify(solutionRoute, null, 2) : '',
    implementation_blueprint_pack: Object.keys(implementationBlueprintPack).length ? implementationBlueprintPack : null,
    implementation_blueprint_packet: text(implementationBlueprintPack.packet),
    implementation_blueprint_json: Object.keys(implementationBlueprintPack).length ? JSON.stringify(implementationBlueprintPack, null, 2) : '',
    intake_job: Object.keys(intakeJob).length ? intakeJob : null,
    intake_job_packet: text(intakeJob.packet),
    intake_job_json: Object.keys(intakeJob).length ? JSON.stringify(intakeJob, null, 2) : '',
    client_kickoff_pack: Object.keys(clientKickoffPack).length ? clientKickoffPack : null,
    client_kickoff_packet: text(clientKickoffPack.packet),
    client_kickoff_json: Object.keys(clientKickoffPack).length ? JSON.stringify(clientKickoffPack, null, 2) : '',
    title: text(result.title) || (templateName && row.lead_id ? `${templateName} first proof for ${row.lead_id}` : 'First proof task'),
    checklist,
    acceptance_tests: acceptanceTests,
    buyer_reply_draft: buyerReplyDraft,
    proof_delivery_packet: proofDeliveryPacket,
    pilot_close_packet: pilotClosePacket,
    pilot_order_room: {
      status: 'draft_owner_approval_required',
      payment_state: 'payment_proof_required',
      order_state: 'order_not_started',
      payment_request_draft: paymentRequestDraft,
      payment_proof_ledger_csv: paymentProofLedgerCsv,
      order_room_ledger_csv: orderRoomLedgerCsv,
      pilot_start_checklist: pilotStartChecklist,
      owner_activation_packet: ownerActivationPacket,
      owner_action_queue_csv: ownerActionQueueCsv,
      activation_summary_json: activationSummaryJson,
      private_workspace_manifest: privateWorkspaceManifest,
      private_workspace_manifest_json: JSON.stringify(privateWorkspaceManifest, null, 2),
      private_workspace_handoff_packet: privateWorkspaceHandoffPacket,
      first_run_queue_csv: firstRunQueueCsv,
      first_run_acceptance: Object.keys(firstRunAcceptance).length ? firstRunAcceptance : null,
      first_run_acceptance_packet: text(firstRunAcceptance.acceptance_packet),
      first_run_acceptance_queue_csv: text(firstRunAcceptance.acceptance_queue_csv),
      owner_acceptance: Object.keys(ownerAcceptance).length ? ownerAcceptance : null,
      owner_acceptance_packet: text(ownerAcceptance.packet),
      owner_acceptance_queue_csv: text(ownerAcceptance.queue_csv),
      connector_policy: Object.keys(connectorPolicy).length ? connectorPolicy : null,
      connector_policy_packet: text(connectorPolicy.packet),
      connector_policy_queue_csv: text(connectorPolicy.queue_csv),
      connector_policy_config_json: text(connectorPolicy.config_json) || (Object.keys(connectorPolicy.config || {}).length ? JSON.stringify(connectorPolicy.config, null, 2) : ''),
      production_approval_queue: Object.keys(productionApprovalQueue).length ? productionApprovalQueue : null,
      production_approval_packet: text(productionApprovalQueue.packet),
      production_approval_queue_csv: text(productionApprovalQueue.queue_csv),
      production_approval_config_json: text(productionApprovalQueue.config_json) || (Object.keys(productionApprovalQueue.config || {}).length ? JSON.stringify(productionApprovalQueue.config, null, 2) : ''),
      enterprise_delivery_pack: Object.keys(enterpriseDeliveryPack).length ? enterpriseDeliveryPack : null,
      enterprise_delivery_packet: text(enterpriseDeliveryPack.packet),
      enterprise_access_matrix_csv: text(enterpriseDeliveryPack.access_matrix_csv),
      enterprise_value_ledger_csv: text(enterpriseDeliveryPack.value_ledger_csv),
      enterprise_delivery_config_json: text(enterpriseDeliveryPack.config_json) || (Object.keys(enterpriseDeliveryPack.config || {}).length ? JSON.stringify(enterpriseDeliveryPack.config, null, 2) : ''),
      customer_success_desk: Object.keys(customerSuccessDesk).length ? customerSuccessDesk : null,
      customer_success_packet: text(customerSuccessDesk.packet),
      customer_success_ticket_queue_csv: text(customerSuccessDesk.ticket_queue_csv),
      customer_success_value_ledger_csv: text(customerSuccessDesk.value_ledger_csv),
      customer_success_renewal_queue_csv: text(customerSuccessDesk.renewal_queue_csv),
      customer_success_client_update: text(customerSuccessDesk.client_update_draft),
      customer_success_config_json: text(customerSuccessDesk.config_json) || (Object.keys(customerSuccessDesk.config || {}).length ? JSON.stringify(customerSuccessDesk.config, null, 2) : ''),
      retainer_growth_offer: Object.keys(retainerGrowthOffer).length ? retainerGrowthOffer : null,
      retainer_growth_packet: text(retainerGrowthOffer.packet),
      retainer_offer_options_csv: text(retainerGrowthOffer.offer_options_csv),
      retainer_decision_ledger_csv: text(retainerGrowthOffer.decision_ledger_csv),
      retainer_next_module_roadmap_csv: text(retainerGrowthOffer.next_module_roadmap_csv),
      retainer_invoice_request_draft: text(retainerGrowthOffer.invoice_request_draft),
      retainer_client_email_draft: text(retainerGrowthOffer.client_email_draft),
      retainer_growth_config_json: text(retainerGrowthOffer.config_json) || (Object.keys(retainerGrowthOffer.config || {}).length ? JSON.stringify(retainerGrowthOffer.config, null, 2) : ''),
      retainer_payment_record: Object.keys(retainerPaymentRecord).length ? retainerPaymentRecord : null,
      retainer_payment_packet: text(retainerPaymentRecord.packet),
      retainer_payment_ledger_csv: text(retainerPaymentRecord.ledger_csv),
      retainer_mrr_summary_json: text(retainerPaymentRecord.summary_json) || (Object.keys(retainerPaymentRecord.summary || {}).length ? JSON.stringify(retainerPaymentRecord.summary, null, 2) : ''),
      state: orderRoomState,
    },
    approval_required: result.approval_required !== undefined ? result.approval_required !== false : task.approval_required !== false,
    human_gate: text(result.human_gate) || text(task.human_gate) || 'owner approval before send/write/payment actions',
  }
}

function safeAction(row) {
  const firstProof = firstProofPacket(row)
  const result = parseJsonObject(row.result)
  const autopilotDraftTypes = ['source_request_packet', 'offer_packet', 'buyer_reply_draft']
  const autopilotDraft = autopilotDraftTypes.includes(text(result.type))
    ? {
        status: text(result.status) || 'ready',
        type: text(result.type),
        package_name: text(result.package_name),
        lead_id: text(result.lead_id || row.lead_id),
        title: text(result.title || row.title || result.package_name || row.action_type),
        packet: text(result.packet),
        subject: text(result.subject),
        body: text(result.body),
        source_request: text(result.source_request),
        first_output: text(result.first_output),
        external_action_state: text(result.external_action_state) || 'blocked_until_owner_approval',
        payment_or_connector_state: text(result.payment_or_connector_state) || 'blocked_until_owner_approval',
        real_mrr_delta: moneyAmount(result.real_mrr_delta),
        approval_required: result.approval_required !== false,
        sent: result.sent === true,
        guardrails: list(result.guardrails),
      }
    : null
  return {
    action_id: row.action_id || null,
    lead_id: row.lead_id || null,
    task_id: row.task_id || null,
    action_type: row.action_type || 'lead_followup',
    status: row.status || 'open',
    priority: row.priority || 'medium',
    owner: row.owner || 'Revenue Pod',
    title: row.title || 'Follow up lead',
    next_step: row.next_step || 'Review and choose next action.',
    approval_required: row.approval_required !== false,
    approval_state: row.approval_state || 'pending',
    notification_channel: row.notification_channel || 'email',
    notification_status: row.notification_status || 'queued',
    created_at: row.created_at || null,
    first_proof: firstProof,
    autopilot_draft: autopilotDraft,
  }
}

function revenueProofBoard(rows = []) {
  const actions = (Array.isArray(rows) ? rows : [])
    .map((row) => (row && Object.prototype.hasOwnProperty.call(row, 'first_proof') ? row : safeAction(row || {})))
    .filter(Boolean)
  const stageCounts = {}
  const paymentRecords = []
  const nextCashActions = []
  const openProofGaps = []
  let proofBackedMrrMmk = 0
  let bankUnverifiedMrrMmk = 0

  for (const action of actions) {
    const status = text(action.status) || 'unknown'
    stageCounts[status] = (stageCounts[status] || 0) + 1
    const proof = action.first_proof || {}
    const room = proof.pilot_order_room || {}
    const record = parseJsonObject(room.retainer_payment_record)
    const retainerOffer = parseJsonObject(room.retainer_growth_offer)
    const customerSuccess = parseJsonObject(room.customer_success_desk)
    const actionId = text(action.action_id)
    const leadId = text(action.lead_id)
    const title = text(action.title) || text(action.action_type) || 'Revenue action'

    if (record.status === 'retainer_payment_proof_recorded') {
      const mrrDelta = moneyAmount(record.normalized_mrr_delta_mmk || record.real_mrr_delta)
      proofBackedMrrMmk += mrrDelta
      if (record.bank_reconciliation_state !== 'bank_verified') bankUnverifiedMrrMmk += mrrDelta
      paymentRecords.push({
        action_id: actionId || null,
        lead_id: leadId || null,
        title,
        workspace_slug: text(record.workspace_slug || retainerOffer.workspace_slug || customerSuccess.workspace_slug),
        template_name: text(record.template_name || proof.template_name || proof.template_id),
        normalized_mrr_delta_mmk: mrrDelta,
        payment_period: text(record.payment_period) || 'monthly',
        payment_proof_reference: text(record.payment_proof_reference),
        owner_approval_reference: text(record.owner_approval_reference),
        bank_reconciliation_state: text(record.bank_reconciliation_state) || 'not_bank_verified',
        recorded_at: text(record.recorded_at || record.paid_at),
      })
      if (record.bank_reconciliation_state !== 'bank_verified') {
        nextCashActions.push({
          action_id: actionId || null,
          lead_id: leadId || null,
          title,
          next_action: 'bank_reconcile_payment_proof',
          owner: 'Revenue Pod',
          evidence_required: 'bank_match_or_manual_owner_reconciliation',
          revenue_claim_state: 'proof_backed_not_bank_verified',
        })
      }
      continue
    }

    if (retainerOffer.status === 'retainer_growth_offer_ready') {
      nextCashActions.push({
        action_id: actionId || null,
        lead_id: leadId || null,
        title,
        next_action: 'collect_retainer_payment_proof',
        owner: text(action.owner) || 'Revenue Pod',
        evidence_required: 'payment_proof_reference_and_owner_approval_reference',
        revenue_claim_state: 'mrr_still_zero_until_payment_proof',
      })
      continue
    }

    if (customerSuccess.status === 'customer_success_desk_ready') {
      nextCashActions.push({
        action_id: actionId || null,
        lead_id: leadId || null,
        title,
        next_action: 'prepare_retainer_growth_offer',
        owner: text(action.owner) || 'Revenue Pod',
        evidence_required: 'value_ledger_and_owner_approved_quote',
        revenue_claim_state: 'not_claimed',
      })
      continue
    }

    openProofGaps.push({
      action_id: actionId || null,
      lead_id: leadId || null,
      title,
      gap: 'no_payment_or_retainer_path_recorded',
      next_action: text(action.next_step) || 'Prepare first proof, customer success desk, or retainer offer.',
    })
  }

  const paymentLedgerCsv = [
    ['action_id', 'lead_id', 'title', 'workspace_slug', 'template_name', 'normalized_mrr_delta_mmk', 'payment_period', 'payment_proof_reference', 'owner_approval_reference', 'bank_reconciliation_state', 'recorded_at'].map(csvCell).join(','),
    ...paymentRecords.map((record) => [
      record.action_id,
      record.lead_id,
      record.title,
      record.workspace_slug,
      record.template_name,
      String(record.normalized_mrr_delta_mmk),
      record.payment_period,
      record.payment_proof_reference,
      record.owner_approval_reference,
      record.bank_reconciliation_state,
      record.recorded_at,
    ].map(csvCell).join(',')),
  ].join('\n')
  const nextCashActionsCsv = [
    ['action_id', 'lead_id', 'title', 'next_action', 'owner', 'evidence_required', 'revenue_claim_state'].map(csvCell).join(','),
    ...nextCashActions.map((item) => [
      item.action_id,
      item.lead_id,
      item.title,
      item.next_action,
      item.owner,
      item.evidence_required,
      item.revenue_claim_state,
    ].map(csvCell).join(',')),
  ].join('\n')

  return {
    status: 'ready',
    board_type: 'revenue_proof_board',
    generated_at: new Date().toISOString(),
    action_count: actions.length,
    payment_record_count: paymentRecords.length,
    proof_backed_mrr_mmk: proofBackedMrrMmk,
    bank_verified_mrr_mmk: Math.max(0, proofBackedMrrMmk - bankUnverifiedMrrMmk),
    bank_unverified_mrr_mmk: bankUnverifiedMrrMmk,
    stage_counts: stageCounts,
    payment_records: paymentRecords,
    next_cash_actions: nextCashActions,
    open_proof_gaps: openProofGaps.slice(0, 8),
    payment_ledger_csv: paymentLedgerCsv,
    next_cash_actions_csv: nextCashActionsCsv,
    guardrails: [
      'proof_backed_mrr_requires_retainer_payment_proof_record',
      'bank_verified_mrr_is_separate_from_payment_proof',
      'drafts_and_offers_do_not_count_as_mrr',
      'next_cash_actions_are_owner_reviewed_before_external_send_or_payment_request',
    ],
  }
}

function commandPriorityRank(priority) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[text(priority)] ?? 4
}

function autopilotCommandBoard({ actions = [], leads = [], proofBoard = {}, latestRuns = [] } = {}) {
  const safeActions = (Array.isArray(actions) ? actions : []).map((action) => (
    action && Object.prototype.hasOwnProperty.call(action, 'first_proof') ? action : safeAction(action || {})
  ))
  const safeLeads = (Array.isArray(leads) ? leads : []).map((lead) => (
    lead && Object.prototype.hasOwnProperty.call(lead, 'lead_score') ? lead : safeLead(lead || {})
  ))
  const commands = []
  const coveredLeadIds = new Set()

  function addCommand(input = {}) {
    const leadId = text(input.lead_id)
    if (leadId) coveredLeadIds.add(leadId)
    const lane = text(input.lane) || 'operator_review'
    const priority = text(input.priority) || 'medium'
    const commandId = text(input.command_id) || [lane, input.action_id, leadId, commands.length + 1].map((part) => slugPart(part, '')).filter(Boolean).join('-')
    commands.push({
      command_id: commandId || `command-${commands.length + 1}`,
      lane,
      priority,
      owner: text(input.owner) || 'Revenue Pod',
      title: text(input.title) || 'Review operating queue',
      lead_id: leadId || null,
      action_id: text(input.action_id) || null,
      suggested_action: text(input.suggested_action) || 'Review and choose the next owner-approved action.',
      evidence_required: text(input.evidence_required) || 'operator_review',
      expected_value: text(input.expected_value) || 'move pipeline forward without unsafe external action',
      approval_required: input.approval_required !== false,
      internal_autorun: input.internal_autorun === true,
      external_action_state: text(input.external_action_state) || 'approval_required',
      revenue_claim_state: text(input.revenue_claim_state) || 'not_claimed',
    })
  }

  for (const cashAction of proofBoard.next_cash_actions || []) {
    const nextAction = text(cashAction.next_action)
    const title = text(cashAction.title) || 'Revenue action'
    const isBankReconcile = nextAction === 'bank_reconcile_payment_proof'
    const isPaymentProof = nextAction === 'collect_retainer_payment_proof'
    addCommand({
      lane: isBankReconcile ? 'cash_reconciliation' : isPaymentProof ? 'cash_collection' : 'retainer_growth',
      priority: isBankReconcile || isPaymentProof ? 'critical' : 'high',
      owner: cashAction.owner,
      title: isBankReconcile ? `Reconcile payment proof: ${title}` : isPaymentProof ? `Collect retainer payment proof: ${title}` : `Prepare retainer path: ${title}`,
      lead_id: cashAction.lead_id,
      action_id: cashAction.action_id,
      suggested_action: isBankReconcile
        ? 'Match the payment proof to bank/payment evidence, then mark bank verification only after a human-confirmed match.'
        : isPaymentProof
          ? 'Prepare the payment-proof follow-up and owner checklist; do not send or claim MRR until proof is attached.'
          : 'Draft the retainer growth offer from value evidence and keep external send approval-only.',
      evidence_required: cashAction.evidence_required,
      expected_value: isBankReconcile ? 'turn proof-backed MRR into bank-verified MRR' : isPaymentProof ? 'convert accepted retainer offer into proof-backed MRR' : 'create the next recurring revenue offer',
      approval_required: true,
      internal_autorun: !isPaymentProof,
      external_action_state: isBankReconcile ? 'internal_review' : 'owner_approval_required_before_external_send',
      revenue_claim_state: cashAction.revenue_claim_state,
    })
  }

  for (const action of safeActions) {
    const proof = action.first_proof || {}
    const status = text(action.status)
    const approvalState = text(action.approval_state)
    const leadId = text(action.lead_id)
    if (coveredLeadIds.has(leadId) && status !== 'queued') continue
    if (proof.status && ['queued', 'open', 'operator_brief_ready'].includes(status)) {
      addCommand({
        lane: 'first_proof_delivery',
        priority: text(action.priority) === 'high' ? 'high' : 'medium',
        owner: action.owner,
        title: `Build first proof: ${text(action.title) || text(proof.template_name) || 'client workflow'}`,
        lead_id: leadId,
        action_id: action.action_id,
        suggested_action: 'Run the first-proof packet, attach source trace, and queue the buyer reply for owner review.',
        evidence_required: text(proof.first_proof_target) || 'source_traced_first_proof',
        expected_value: 'make the buyer see useful output before a paid pilot',
        approval_required: true,
        internal_autorun: true,
        external_action_state: 'draft_only_until_owner_approval',
        revenue_claim_state: 'not_claimed',
      })
      continue
    }
    if (approvalState === 'pending') {
      addCommand({
        lane: 'approval_inbox',
        priority: 'high',
        owner: action.owner,
        title: `Review approval: ${text(action.title) || text(action.action_type) || 'pipeline action'}`,
        lead_id: leadId,
        action_id: action.action_id,
        suggested_action: text(action.next_step) || 'Review approval state and choose the next safe action.',
        evidence_required: 'owner_decision',
        expected_value: 'clear a human gate that blocks delivery or revenue',
        approval_required: true,
        internal_autorun: false,
        external_action_state: 'owner_decision_required',
        revenue_claim_state: 'not_claimed',
      })
    }
  }

  for (const lead of safeLeads) {
    const leadId = text(lead.lead_id)
    if (!leadId || coveredLeadIds.has(leadId)) continue
    addCommand({
      lane: 'new_lead_intake',
      priority: Number(lead.lead_score || 0) >= 70 ? 'high' : 'medium',
      owner: 'Revenue Pod',
      title: `Route new setup lead: ${text(lead.requested_package) || 'workflow request'}`,
      lead_id: leadId,
      suggested_action: text(lead.next_step) || 'Turn the lead into a first-proof task and request one approved source sample.',
      evidence_required: 'buyer_goal_and_approved_source_sample',
      expected_value: 'start the first proof loop from a captured lead',
      approval_required: true,
      internal_autorun: true,
      external_action_state: 'draft_only_until_owner_approval',
      revenue_claim_state: 'not_claimed',
    })
  }

  if (!commands.length) {
    addCommand({
      lane: 'pipeline_watch',
      priority: 'low',
      owner: 'Revenue Pod',
      title: 'Check the pipeline and source inbox',
      suggested_action: 'No active command is ready; review lead sources, campaign clicks, and approved inbox labels for new setup opportunities.',
      evidence_required: 'new_lead_or_owner_approved_source',
      expected_value: 'keep the pipeline from going idle',
      approval_required: false,
      internal_autorun: true,
      external_action_state: 'internal_only',
      revenue_claim_state: 'not_claimed',
    })
  }

  const sortedCommands = commands
    .sort((a, b) => commandPriorityRank(a.priority) - commandPriorityRank(b.priority) || a.lane.localeCompare(b.lane))
    .slice(0, 10)
  const commandQueueCsv = [
    ['command_id', 'lane', 'priority', 'owner', 'lead_id', 'action_id', 'title', 'suggested_action', 'evidence_required', 'expected_value', 'approval_required', 'internal_autorun', 'external_action_state', 'revenue_claim_state'].map(csvCell).join(','),
    ...sortedCommands.map((command) => [
      command.command_id,
      command.lane,
      command.priority,
      command.owner,
      command.lead_id,
      command.action_id,
      command.title,
      command.suggested_action,
      command.evidence_required,
      command.expected_value,
      command.approval_required ? 'yes' : 'no',
      command.internal_autorun ? 'yes' : 'no',
      command.external_action_state,
      command.revenue_claim_state,
    ].map(csvCell).join(',')),
  ].join('\n')
  const operatorBriefMarkdown = [
    '# Autopilot daily money brief',
    '',
    `Status: ${sortedCommands.length ? 'commands_ready' : 'idle'}`,
    `Mode: approval_gated_autopilot`,
    `Proof-backed MRR MMK: ${moneyAmount(proofBoard.proof_backed_mrr_mmk)}`,
    `Bank-unverified MRR MMK: ${moneyAmount(proofBoard.bank_unverified_mrr_mmk)}`,
    `Recent actions: ${safeActions.length}`,
    `Recent leads: ${safeLeads.length}`,
    `Recent sales runs: ${Array.isArray(latestRuns) ? latestRuns.length : 0}`,
    '',
    '## Top commands',
    ...sortedCommands.slice(0, 6).map((command, index) => `${index + 1}. [${command.priority}] ${command.lane} - ${command.title} :: ${command.suggested_action}`),
    '',
    '## Guardrails',
    '- Internal preparation can run automatically when internal_autorun is yes.',
    '- External sends, payment requests, connector writes, and production writes remain owner-approved.',
    '- Revenue is not claimed from drafts, offers, or unverified assumptions.',
  ].join('\n')

  return {
    status: 'ready',
    board_type: 'autopilot_command_board',
    mode: 'approval_gated_autopilot',
    generated_at: new Date().toISOString(),
    command_count: sortedCommands.length,
    critical_count: sortedCommands.filter((command) => command.priority === 'critical').length,
    internal_autorun_count: sortedCommands.filter((command) => command.internal_autorun).length,
    owner_approval_count: sortedCommands.filter((command) => command.approval_required).length,
    blocked_count: sortedCommands.filter((command) => command.external_action_state.includes('blocked')).length,
    commands: sortedCommands,
    command_queue_csv: commandQueueCsv,
    operator_brief_markdown: operatorBriefMarkdown,
    guardrails: [
      'approval_gated_autopilot',
      'internal_drafts_allowed_external_actions_blocked_until_owner_approval',
      'money_actions_require_payment_or_bank_evidence',
      'no_revenue_claim_without_payment_proof',
    ],
  }
}

function fallbackQueue() {
  const emailConfigured = Boolean(envText('RESEND_API_KEY'))
  const webhookConfigured = Boolean(envText('SUPERMEGA_LEAD_WEBHOOK_URL'))
  return {
    status: emailConfigured || webhookConfigured ? 'ready' : 'needs_configuration',
    mode: emailConfigured && webhookConfigured ? 'email_and_webhook' : emailConfigured ? 'email' : webhookConfigured ? 'webhook' : 'manual_email_link',
    email_delivery: emailConfigured ? 'configured' : 'not_configured',
    webhook_delivery: webhookConfigured ? 'configured' : 'not_configured',
    source_endpoint: '/api/contact-submissions',
    owner: envText('SUPERMEGA_CONTACT_NOTIFY_EMAIL') || 'swanhtet@supermega.dev',
    rule: 'Capture still works through email/webhook even when the primary database is quota-blocked.',
  }
}

function recommendedDatastores() {
  return [
    {
      id: 'restore-supabase',
      fit: 'fastest if current project is paid/unblocked',
      action: 'Resolve Supabase exceed_egress_quota or move the tables to a clean Supabase project, then reapply docs/supabase/*.sql.',
    },
    {
      id: 'vercel-postgres-neon',
      fit: 'best Vercel-native SQL replacement',
      action: 'Provision Neon Postgres through the Vercel Marketplace, set POSTGRES_URL or DATABASE_URL in supermega-public, then run npm run db:lead-ledger:schema.',
    },
    {
      id: 'upstash-redis-queue',
      fit: 'best lightweight durable queue for follow-up actions',
      action: 'Use Redis lists or streams for lead actions and keep email as the notification channel.',
    },
    {
      id: 'google-sheets-bridge',
      fit: 'best founder-operator fallback because it is easy to inspect and edit',
      action: 'Use a Google Sheet as the approval inbox while the SQL database is being restored.',
    },
  ]
}

async function updateOrderRoomState(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const state = buildOrderRoomState({ ...payload, action_id: actionId, lead_id: leadId })
  if (state.private_workspace_state === 'created_after_payment_proof') {
    return {
      status: 'error',
      reason: 'use_start_private_workspace_operation',
      state,
    }
  }
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(coalesce(a.result, '{}'::jsonb), '{pilot_order_room_state}', $3::jsonb, true),
        approval_state = case
          when ($3::jsonb ->> 'scope_approval_state') = 'approved'
           and ($3::jsonb ->> 'price_approval_state') = 'approved'
          then 'approved'
          else a.approval_state
        end,
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(state)],
  )
  if (result.status !== 'ready') return { ...result, state }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', state }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    action: safeAction(result.rows[0]),
    order_room_state: state,
  }
}

function contextFromActionRow(row, state = {}) {
  const payload = parseJsonObject(row.payload)
  const result = parseJsonObject(row.result)
  const task = parseJsonObject(payload.first_proof_task)
  const templateId = text(result.template_id) || text(task.template_id) || text(payload.template_id)
  const templateName = text(task.template_name) || text(payload.public_package) || text(payload.requested_package) || templateId
  const acceptanceTests = list(result.acceptance_tests).length ? list(result.acceptance_tests) : list(task.acceptance_tests)
  return {
    leadId: text(row.lead_id) || 'not set',
    templateId,
    templateName,
    starterKitUrl: text(result.starter_kit_url) || text(task.starter_kit_url) || text(payload.starter_kit_url),
    firstProofTarget: text(result.first_proof_target) || text(task.first_proof_target) || text(payload.first_proof_target),
    priceHint: text(task.price_hint) || text(payload.price_hint) || 'quote after proof review',
    acceptanceTests,
    state,
  }
}

async function startPrivateWorkspace(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const currentPayload = parseJsonObject(row.payload)
  const currentState = parseJsonObject(currentResult.pilot_order_room_state || currentPayload.pilot_order_room_state)
  const currentAction = safeAction(row)
  const currentManifest = currentAction.first_proof?.pilot_order_room?.private_workspace_manifest || buildPrivateWorkspaceManifest(contextFromActionRow(row, currentState))
  if (!['ready_to_create_private_workspace', 'private_workspace_created'].includes(currentManifest.status)) {
    return {
      status: 'error',
      reason: 'private_workspace_not_ready',
      activation_status: currentManifest.status,
      action: currentAction,
      private_workspace_manifest: currentManifest,
    }
  }

  if (currentManifest.status === 'private_workspace_created') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_created',
      action: currentAction,
      private_workspace_manifest: currentManifest,
    }
  }

  const createdAt = new Date().toISOString()
  const createdState = {
    ...currentState,
    status: 'persisted_order_room_state',
    action_id: text(row.action_id) || actionId || null,
    lead_id: text(row.lead_id) || leadId || null,
    private_workspace_state: 'created_after_payment_proof',
    private_workspace_slug: currentManifest.workspace_slug,
    private_workspace_url: currentManifest.workspace_url,
    workspace_created_at: createdAt,
    workspace_created_by: 'operator_console',
    real_mrr_delta: 0,
  }
  const createdManifest = buildPrivateWorkspaceManifest(contextFromActionRow(row, createdState))
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(a.result, '{}'::jsonb), '{pilot_order_room_state}', $3::jsonb, true),
            '{private_workspace_manifest}', $4::jsonb,
            true
          ),
          '{private_workspace_started_at}',
          to_jsonb($5::text),
          true
        ),
        status = case when a.status in ('open', 'queued', 'done') then 'workspace_ready' else a.status end,
        next_step = 'Open the private workspace handoff and run the first production job approval-only.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(createdState), JSON.stringify(createdManifest), createdAt],
  )
  if (result.status !== 'ready') return { ...result, private_workspace_manifest: createdManifest }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', private_workspace_manifest: createdManifest }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'created',
    action: safeAction(result.rows[0]),
    private_workspace_manifest: createdManifest,
  }
}

async function prepareFirstRunAcceptance(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const currentState = parseJsonObject(currentResult.pilot_order_room_state || parseJsonObject(row.payload).pilot_order_room_state)
  const currentAction = safeAction(row)
  const currentManifest = currentAction.first_proof?.pilot_order_room?.private_workspace_manifest || buildPrivateWorkspaceManifest(contextFromActionRow(row, currentState))
  if (currentManifest.status !== 'private_workspace_created') {
    return {
      status: 'error',
      reason: 'private_workspace_required',
      activation_status: currentManifest.status,
      action: currentAction,
      private_workspace_manifest: currentManifest,
    }
  }

  const existingAcceptance = parseJsonObject(currentResult.first_run_acceptance)
  if (existingAcceptance.status === 'first_run_acceptance_packet_ready') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_prepared',
      action: currentAction,
      first_run_acceptance: existingAcceptance,
      private_workspace_manifest: currentManifest,
    }
  }

  const context = contextFromActionRow(row, currentState)
  const preparedAt = new Date().toISOString()
  const firstRunAcceptance = buildFirstRunAcceptance({
    ...context,
    manifest: currentManifest,
    evidenceReference: payload.first_run_evidence_reference,
    preparedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{first_run_acceptance}', $3::jsonb, true),
          '{first_run_acceptance_prepared_at}',
          to_jsonb($4::text),
          true
        ),
        status = case when a.status in ('workspace_ready', 'open', 'queued', 'done') then 'first_run_ready' else a.status end,
        next_step = 'Review the first-run acceptance packet with the owner before any external send or connector write.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(firstRunAcceptance), preparedAt],
  )
  if (result.status !== 'ready') return { ...result, first_run_acceptance: firstRunAcceptance, private_workspace_manifest: currentManifest }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', first_run_acceptance: firstRunAcceptance, private_workspace_manifest: currentManifest }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'prepared',
    action: safeAction(result.rows[0]),
    first_run_acceptance: firstRunAcceptance,
    private_workspace_manifest: currentManifest,
  }
}

async function recordOwnerAcceptance(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  const decision = oneOf(payload.owner_acceptance_decision || payload.decision, ['accepted', 'changes_requested'], '')
  const evidenceReference = text(payload.owner_acceptance_reference || payload.evidence_reference)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!decision) return { status: 'error', reason: 'invalid_owner_acceptance_decision' }
  if (!evidenceReference) return { status: 'error', reason: 'missing_owner_acceptance_reference' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const firstRunAcceptance = parseJsonObject(currentResult.first_run_acceptance)
  if (firstRunAcceptance.status !== 'first_run_acceptance_packet_ready') {
    return {
      status: 'error',
      reason: 'first_run_acceptance_required',
      action: safeAction(row),
    }
  }

  const existingOwnerAcceptance = parseJsonObject(currentResult.owner_acceptance)
  if (existingOwnerAcceptance.status === 'owner_acceptance_recorded') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_recorded',
      action: safeAction(row),
      owner_acceptance: existingOwnerAcceptance,
    }
  }

  const context = contextFromActionRow(row, parseJsonObject(currentResult.pilot_order_room_state))
  const recordedAt = new Date().toISOString()
  const ownerAcceptance = buildOwnerAcceptanceRecord({
    ...context,
    acceptance: firstRunAcceptance,
    decision,
    evidenceReference,
    ownerNote: payload.owner_note,
    recordedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{owner_acceptance}', $3::jsonb, true),
          '{owner_acceptance_recorded_at}',
          to_jsonb($4::text),
          true
        ),
        status = case when $5 = 'accepted' then 'owner_accepted_first_run' else 'first_run_changes_requested' end,
        next_step = case
          when $5 = 'accepted' then 'Run the next production cycle approval-only; connector writes still need explicit policy approval.'
          else 'Revise the first run output and prepare a new owner acceptance packet.'
        end,
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(ownerAcceptance), recordedAt, decision],
  )
  if (result.status !== 'ready') return { ...result, owner_acceptance: ownerAcceptance }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', owner_acceptance: ownerAcceptance }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'recorded',
    action: safeAction(result.rows[0]),
    owner_acceptance: ownerAcceptance,
  }
}

async function recordConnectorPolicy(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  const policyMode = oneOf(payload.connector_policy_mode || payload.policy_mode, ['approval_only'], '')
  const evidenceReference = text(payload.connector_policy_reference || payload.evidence_reference)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!policyMode) return { status: 'error', reason: 'invalid_connector_policy_mode' }
  if (!evidenceReference) return { status: 'error', reason: 'missing_connector_policy_reference' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const ownerAcceptance = parseJsonObject(currentResult.owner_acceptance)
  if (ownerAcceptance.status !== 'owner_acceptance_recorded') {
    return {
      status: 'error',
      reason: 'owner_acceptance_required',
      action: safeAction(row),
    }
  }
  if (ownerAcceptance.decision !== 'accepted') {
    return {
      status: 'error',
      reason: 'owner_acceptance_not_accepted',
      action: safeAction(row),
      owner_acceptance: ownerAcceptance,
    }
  }

  const existingConnectorPolicy = parseJsonObject(currentResult.connector_policy)
  if (existingConnectorPolicy.status === 'connector_policy_recorded') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_recorded',
      action: safeAction(row),
      connector_policy: existingConnectorPolicy,
    }
  }

  const context = contextFromActionRow(row, parseJsonObject(currentResult.pilot_order_room_state))
  const recordedAt = new Date().toISOString()
  const connectorPolicy = buildConnectorPolicyRecord({
    ...context,
    ownerAcceptance,
    policyMode,
    allowedConnectorActions: payload.allowed_connector_actions || payload.allowed_actions,
    evidenceReference,
    ownerNote: payload.owner_note,
    recordedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{connector_policy}', $3::jsonb, true),
          '{connector_policy_recorded_at}',
          to_jsonb($4::text),
          true
        ),
        status = 'connector_policy_recorded',
        next_step = 'Run the next production cycle under the approval-only connector policy; per-action approval is still required.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(connectorPolicy), recordedAt],
  )
  if (result.status !== 'ready') return { ...result, connector_policy: connectorPolicy }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', connector_policy: connectorPolicy }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'recorded',
    action: safeAction(result.rows[0]),
    connector_policy: connectorPolicy,
  }
}

async function prepareProductionApprovalQueue(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  const evidenceReference = text(payload.production_queue_reference || payload.evidence_reference)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!evidenceReference) return { status: 'error', reason: 'missing_production_queue_reference' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const connectorPolicy = parseJsonObject(currentResult.connector_policy)
  if (connectorPolicy.status !== 'connector_policy_recorded') {
    return {
      status: 'error',
      reason: 'connector_policy_required',
      action: safeAction(row),
    }
  }

  const existingQueue = parseJsonObject(currentResult.production_approval_queue)
  if (existingQueue.status === 'production_approval_queue_ready') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_prepared',
      action: safeAction(row),
      production_approval_queue: existingQueue,
    }
  }

  const context = contextFromActionRow(row, parseJsonObject(currentResult.pilot_order_room_state))
  const preparedAt = new Date().toISOString()
  const productionQueue = buildProductionApprovalQueue({
    ...context,
    connectorPolicy,
    evidenceReference,
    sourceTrace: payload.source_trace,
    preparedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{production_approval_queue}', $3::jsonb, true),
          '{production_approval_queue_prepared_at}',
          to_jsonb($4::text),
          true
        ),
        status = 'production_approval_queue_ready',
        next_step = 'Let agents prepare the next run drafts; approve each external send or connector write from the production approval queue.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(productionQueue), preparedAt],
  )
  if (result.status !== 'ready') return { ...result, production_approval_queue: productionQueue }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', production_approval_queue: productionQueue }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'prepared',
    action: safeAction(result.rows[0]),
    production_approval_queue: productionQueue,
  }
}

async function prepareEnterpriseDeliveryPack(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  const evidenceReference = text(payload.enterprise_delivery_reference || payload.evidence_reference)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!evidenceReference) return { status: 'error', reason: 'missing_enterprise_delivery_reference' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const productionQueue = parseJsonObject(currentResult.production_approval_queue)
  if (productionQueue.status !== 'production_approval_queue_ready') {
    return {
      status: 'error',
      reason: 'production_approval_queue_required',
      action: safeAction(row),
    }
  }

  const existingPack = parseJsonObject(currentResult.enterprise_delivery_pack)
  if (existingPack.status === 'enterprise_delivery_pack_ready') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_prepared',
      action: safeAction(row),
      enterprise_delivery_pack: existingPack,
    }
  }

  const context = contextFromActionRow(row, parseJsonObject(currentResult.pilot_order_room_state))
  const preparedAt = new Date().toISOString()
  const enterprisePack = buildEnterpriseDeliveryPack({
    ...context,
    productionQueue,
    evidenceReference,
    supportWindow: payload.support_window,
    preparedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{enterprise_delivery_pack}', $3::jsonb, true),
          '{enterprise_delivery_pack_prepared_at}',
          to_jsonb($4::text),
          true
        ),
        status = 'enterprise_delivery_pack_ready',
        next_step = 'Use the enterprise delivery pack for client onboarding, access boundaries, support cadence, and 30-day value review.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(enterprisePack), preparedAt],
  )
  if (result.status !== 'ready') return { ...result, enterprise_delivery_pack: enterprisePack }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', enterprise_delivery_pack: enterprisePack }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'prepared',
    action: safeAction(result.rows[0]),
    enterprise_delivery_pack: enterprisePack,
  }
}

async function prepareCustomerSuccessDesk(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  const evidenceReference = text(payload.customer_success_reference || payload.evidence_reference)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!evidenceReference) return { status: 'error', reason: 'missing_customer_success_reference' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const enterprisePack = parseJsonObject(currentResult.enterprise_delivery_pack)
  if (enterprisePack.status !== 'enterprise_delivery_pack_ready') {
    return {
      status: 'error',
      reason: 'enterprise_delivery_pack_required',
      action: safeAction(row),
    }
  }

  const existingDesk = parseJsonObject(currentResult.customer_success_desk)
  if (existingDesk.status === 'customer_success_desk_ready') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_prepared',
      action: safeAction(row),
      customer_success_desk: existingDesk,
    }
  }

  const context = contextFromActionRow(row, parseJsonObject(currentResult.pilot_order_room_state))
  const preparedAt = new Date().toISOString()
  const customerSuccessDesk = buildCustomerSuccessDeskPack({
    ...context,
    enterprisePack,
    evidenceReference,
    supportWindow: payload.support_window,
    preparedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{customer_success_desk}', $3::jsonb, true),
          '{customer_success_desk_prepared_at}',
          to_jsonb($4::text),
          true
        ),
        status = 'customer_success_desk_ready',
        next_step = 'Use the customer success desk to run support, value evidence, renewal review, and next-module approvals.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(customerSuccessDesk), preparedAt],
  )
  if (result.status !== 'ready') return { ...result, customer_success_desk: customerSuccessDesk }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', customer_success_desk: customerSuccessDesk }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'prepared',
    action: safeAction(result.rows[0]),
    customer_success_desk: customerSuccessDesk,
  }
}

async function prepareRetainerGrowthOffer(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  const evidenceReference = text(payload.retainer_growth_reference || payload.renewal_reference || payload.evidence_reference)
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!evidenceReference) return { status: 'error', reason: 'missing_retainer_growth_reference' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const customerSuccessDesk = parseJsonObject(currentResult.customer_success_desk)
  if (customerSuccessDesk.status !== 'customer_success_desk_ready') {
    return {
      status: 'error',
      reason: 'customer_success_desk_required',
      action: safeAction(row),
    }
  }

  const existingOffer = parseJsonObject(currentResult.retainer_growth_offer)
  if (existingOffer.status === 'retainer_growth_offer_ready') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_prepared',
      action: safeAction(row),
      retainer_growth_offer: existingOffer,
    }
  }

  const context = contextFromActionRow(row, parseJsonObject(currentResult.pilot_order_room_state))
  const preparedAt = new Date().toISOString()
  const retainerGrowthOffer = buildRetainerGrowthOfferPack({
    ...context,
    customerSuccessDesk,
    evidenceReference,
    retainerQuote: payload.retainer_quote,
    preparedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{retainer_growth_offer}', $3::jsonb, true),
          '{retainer_growth_offer_prepared_at}',
          to_jsonb($4::text),
          true
        ),
        status = 'retainer_growth_offer_ready',
        next_step = 'Review value evidence, approve the retainer quote, then send the retainer offer only after owner approval.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(retainerGrowthOffer), preparedAt],
  )
  if (result.status !== 'ready') return { ...result, retainer_growth_offer: retainerGrowthOffer }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', retainer_growth_offer: retainerGrowthOffer }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'prepared',
    action: safeAction(result.rows[0]),
    retainer_growth_offer: retainerGrowthOffer,
  }
}

async function recordRetainerPaymentProof(payload) {
  const actionId = text(payload.action_id)
  const leadId = text(payload.lead_id)
  const paymentProofReference = text(payload.payment_proof_reference || payload.retainer_payment_proof_reference)
  const ownerApprovalReference = text(payload.owner_approval_reference || payload.retainer_owner_approval_reference)
  const amountMmk = moneyAmount(payload.amount_mmk || payload.retainer_amount_mmk)
  const rawPaymentPeriod = text(payload.payment_period || payload.retainer_payment_period || 'monthly')
  const paymentPeriod = oneOf(rawPaymentPeriod, ['monthly', 'quarterly', 'annual', 'one_time_retainer'], '')
  if (!actionId && !leadId) return { status: 'error', reason: 'missing_action_or_lead_id' }
  if (!paymentProofReference) return { status: 'error', reason: 'missing_retainer_payment_proof_reference' }
  if (!ownerApprovalReference) return { status: 'error', reason: 'missing_retainer_owner_approval_reference' }
  if (!amountMmk) return { status: 'error', reason: 'invalid_retainer_payment_amount' }
  if (!paymentPeriod) return { status: 'error', reason: 'invalid_retainer_payment_period' }
  if (!datastore.postgresConfigured()) return { status: 'error', reason: 'postgres_not_configured' }

  const selected = await datastore.query(
    `
      select
        action_id, lead_id, task_id, action_type, status, priority, owner,
        title, next_step, approval_required, approval_state,
        notification_channel, notification_status, payload, result, created_at
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [actionId, leadId],
  )
  if (selected.status !== 'ready') return selected
  if (!selected.rows.length) return { status: 'error', reason: 'action_not_found' }

  const row = selected.rows[0]
  const currentResult = parseJsonObject(row.result)
  const retainerGrowthOffer = parseJsonObject(currentResult.retainer_growth_offer)
  if (retainerGrowthOffer.status !== 'retainer_growth_offer_ready') {
    return {
      status: 'error',
      reason: 'retainer_growth_offer_required',
      action: safeAction(row),
    }
  }

  const existingRecord = parseJsonObject(currentResult.retainer_payment_record)
  if (existingRecord.status === 'retainer_payment_proof_recorded') {
    return {
      status: 'ready',
      adapter: 'vercel_postgres_neon',
      operation_status: 'already_recorded',
      action: safeAction(row),
      retainer_payment_record: existingRecord,
    }
  }

  const context = contextFromActionRow(row, parseJsonObject(currentResult.pilot_order_room_state))
  const preparedAt = new Date().toISOString()
  const paymentRecord = buildRetainerPaymentRecord({
    ...context,
    retainerGrowthOffer,
    paymentProofReference,
    ownerApprovalReference,
    amountMmk,
    paymentPeriod,
    paidAt: payload.paid_at,
    preparedAt,
  })
  const result = await datastore.query(
    `
      with target as (
        select id
        from public.supermega_pipeline_actions
        where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
        order by created_at desc
        limit 1
      )
      update public.supermega_pipeline_actions a
      set
        result = jsonb_set(
          jsonb_set(coalesce(a.result, '{}'::jsonb), '{retainer_payment_record}', $3::jsonb, true),
          '{retainer_payment_recorded_at}',
          to_jsonb($4::text),
          true
        ),
        status = 'retainer_payment_proof_recorded',
        next_step = 'Reconcile the payment proof, keep delivery running, and update the value ledger before the next renewal.',
        updated_at = now()
      where a.id in (select id from target)
      returning
        a.action_id, a.lead_id, a.task_id, a.action_type, a.status, a.priority, a.owner,
        a.title, a.next_step, a.approval_required, a.approval_state,
        a.notification_channel, a.notification_status, a.payload, a.result, a.created_at
    `,
    [actionId, leadId, JSON.stringify(paymentRecord), preparedAt],
  )
  if (result.status !== 'ready') return { ...result, retainer_payment_record: paymentRecord }
  if (!result.rows.length) return { status: 'error', reason: 'action_not_found', retainer_payment_record: paymentRecord }
  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    operation_status: 'recorded',
    action: safeAction(result.rows[0]),
    retainer_payment_record: paymentRecord,
  }
}

function primaryDatabaseStatus(result) {
  if (!result || result.status === 'ready') {
    return { status: 'ready' }
  }
  const detail = text(result.detail)
  const quotaBlocked = result.code === 402 || /exceed_egress_quota|quota|restricted/i.test(detail)
  const provider = result.provider || result.adapter || 'supabase'
  return {
    status: 'blocked',
    provider,
    adapter: result.adapter || null,
    code: result.code || null,
    reason: provider === 'vercel_postgres_neon' ? 'vercel_postgres_query_failed' : quotaBlocked ? 'supabase_quota_or_project_restriction' : 'supabase_query_failed',
    detail: detail || text(result.reason),
  }
}

function writeStatusCode(result) {
  if (result.status === 'ready') return 200
  if (result.reason === 'action_not_found') return 404
  if (['private_workspace_not_ready', 'private_workspace_required', 'first_run_acceptance_required', 'owner_acceptance_required', 'owner_acceptance_not_accepted', 'connector_policy_required', 'production_approval_queue_required', 'enterprise_delivery_pack_required', 'customer_success_desk_required', 'retainer_growth_offer_required', 'use_start_private_workspace_operation'].includes(result.reason)) return 409
  if (['missing_action_or_lead_id', 'invalid_owner_acceptance_decision', 'missing_owner_acceptance_reference', 'invalid_connector_policy_mode', 'missing_connector_policy_reference', 'missing_production_queue_reference', 'missing_enterprise_delivery_reference', 'missing_customer_success_reference', 'missing_retainer_growth_reference', 'missing_retainer_payment_proof_reference', 'missing_retainer_owner_approval_reference', 'invalid_retainer_payment_amount', 'invalid_retainer_payment_period'].includes(result.reason)) return 400
  return 503
}

async function supabaseFetch(config, path, options = {}) {
  const response = await fetch(`${config.url}${path}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      accept: 'application/json',
      ...(options.count ? { Prefer: 'count=exact' } : {}),
    },
    signal: AbortSignal.timeout(Number(process.env.SUPERMEGA_PIPELINE_STATUS_TIMEOUT_MS || 10000)),
  })
  const body = await response.text().catch(() => '')
  if (!response.ok) {
    return {
      status: 'error',
      code: response.status,
      detail: body.slice(0, 180),
    }
  }
  let data = []
  try {
    data = body ? JSON.parse(body) : []
  } catch {
    data = []
  }
  return {
    status: 'ready',
    code: response.status,
    count: options.count ? countFromRange(response.headers.get('content-range')) : undefined,
    data,
  }
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    res.end()
    return
  }

  // Auth guard — fail closed: deny if the ops key is unset, then require a match
  const opsKey = text(process.env.SUPERMEGA_OPS_KEY)
  if (!opsKey) {
    json(res, 503, { status: 'error', reason: 'auth_not_configured' })
    return
  }
  const authHeader = req.headers['authorization'] || ''
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!provided || !safeEqual(provided, opsKey)) {
    json(res, 401, { status: 'error', reason: 'unauthorized' })
    return
  }

  if (req.method === 'POST') {
    let payload
    try {
      payload = await readBody(req)
    } catch (error) {
      json(res, 400, { status: 'error', reason: error.message || 'invalid_request' })
      return
    }
    const operation = text(payload.operation)
    if (operation === 'update_order_room') {
      const updated = await updateOrderRoomState(payload)
      json(res, writeStatusCode(updated), {
        endpoint: 'pipeline-control',
        operation,
        ...updated,
      })
      return
    }
    if (operation === 'start_private_workspace') {
      const started = await startPrivateWorkspace(payload)
      json(res, writeStatusCode(started), {
        endpoint: 'pipeline-control',
        operation,
        ...started,
      })
      return
    }
    if (operation === 'prepare_first_run_acceptance') {
      const prepared = await prepareFirstRunAcceptance(payload)
      json(res, writeStatusCode(prepared), {
        endpoint: 'pipeline-control',
        operation,
        ...prepared,
      })
      return
    }
    if (operation === 'record_owner_acceptance') {
      const recorded = await recordOwnerAcceptance(payload)
      json(res, writeStatusCode(recorded), {
        endpoint: 'pipeline-control',
        operation,
        ...recorded,
      })
      return
    }
    if (operation === 'record_connector_policy') {
      const recorded = await recordConnectorPolicy(payload)
      json(res, writeStatusCode(recorded), {
        endpoint: 'pipeline-control',
        operation,
        ...recorded,
      })
      return
    }
    if (operation === 'prepare_production_approval_queue') {
      const prepared = await prepareProductionApprovalQueue(payload)
      json(res, writeStatusCode(prepared), {
        endpoint: 'pipeline-control',
        operation,
        ...prepared,
      })
      return
    }
    if (operation === 'prepare_enterprise_delivery_pack') {
      const prepared = await prepareEnterpriseDeliveryPack(payload)
      json(res, writeStatusCode(prepared), {
        endpoint: 'pipeline-control',
        operation,
        ...prepared,
      })
      return
    }
    if (operation === 'prepare_customer_success_desk') {
      const prepared = await prepareCustomerSuccessDesk(payload)
      json(res, writeStatusCode(prepared), {
        endpoint: 'pipeline-control',
        operation,
        ...prepared,
      })
      return
    }
    if (operation === 'prepare_retainer_growth_offer') {
      const prepared = await prepareRetainerGrowthOffer(payload)
      json(res, writeStatusCode(prepared), {
        endpoint: 'pipeline-control',
        operation,
        ...prepared,
      })
      return
    }
    if (operation === 'record_retainer_payment_proof') {
      const recorded = await recordRetainerPaymentProof(payload)
      json(res, writeStatusCode(recorded), {
        endpoint: 'pipeline-control',
        operation,
        ...recorded,
      })
      return
    }
    if (!operation) {
      json(res, 400, { status: 'error', reason: 'unsupported_operation' })
      return
    }
    json(res, 400, { status: 'error', reason: 'unsupported_operation' })
    return
  }

  if (req.method !== 'GET') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  const config = supabaseConfig()
  const contract = {
    required_tables: ['supermega_leads', 'supermega_pipeline_actions', 'supermega_sales_runs'],
    lead_capture: '/api/contact-submissions',
    pipeline_status: '/api/pipeline-control/status',
    daily_sales_cron: '/api/cron/sales-daily',
    primary_database: 'vercel_postgres_neon',
    fallback_database: 'supabase_rest',
    owner_rule: 'Agents prepare and queue work; the founder approves external sending, money, connector access, and production writes.',
    pc_dependency: 'none',
  }

  if (datastore.postgresConfigured()) {
    const since24h = isoHoursAgo(24)
    const since7d = isoHoursAgo(24 * 7)
    const snapshot = await datastore.pipelineSnapshot({ since24h, since7d })
    if (snapshot.status !== 'ready') {
      const fallback = fallbackQueue()
      json(res, 200, {
        status: 'ready',
        runtime_status: fallback.status === 'ready' ? 'degraded' : 'blocked',
        endpoint: 'pipeline-control',
        contract,
        primary_database: primaryDatabaseStatus(snapshot),
        fallback_queue: fallback,
        approval_inbox: {
          status: fallback.status === 'ready' ? 'email_fallback' : 'blocked',
          pending_count: null,
          next_action: {
            action_type: 'operator_review',
            priority: 'high',
            owner: fallback.owner,
            title: 'Fix Vercel Postgres pipeline schema or connection',
            next_step: 'Run npm run db:lead-ledger:schema with the Vercel/Neon DATABASE_URL, then redeploy public.',
            approval_required: true,
            approval_state: 'pending',
          },
        },
        notifications: {
          status: fallback.email_delivery,
          channel: fallback.mode,
          human_review_required: true,
        },
        durable_queue: {
          status: fallback.status === 'ready' ? 'degraded_ready' : 'blocked',
          public_daily_cron: '/api/cron/sales-daily',
          app_daily_cron: '/api/cron/supermega/daily',
          fallback_mode: fallback.mode,
          protected_by_bearer_token: true,
        },
        recommended_datastores: recommendedDatastores(),
        blocker: snapshot,
      })
      return
    }

    const actions = snapshot.latestActions.map(safeAction)
    const leads = snapshot.latestLeads.map(safeLead)
    const nextAction = actions.find((action) => action.approval_state === 'pending') || actions[0] || null
    const proofBoard = revenueProofBoard(actions)
    const autopilotBoard = autopilotCommandBoard({ actions, leads, proofBoard, latestRuns: snapshot.latestRuns })

    json(res, 200, {
      status: 'ready',
      runtime_status: 'ready',
      endpoint: 'pipeline-control',
      generated_at: new Date().toISOString(),
      contract,
      primary_database: {
        status: 'ready',
        provider: 'vercel_postgres_neon',
        adapter: 'pg',
      },
      metrics: {
        leads_24h: snapshot.lead24hCount,
        leads_7d: snapshot.lead7dCount,
        open_action_count: snapshot.pendingActionCount,
        recent_action_count: actions.length,
        recent_lead_count: leads.length,
        recent_sales_run_count: snapshot.latestRuns.length,
        proof_backed_mrr_mmk: proofBoard.proof_backed_mrr_mmk,
        bank_verified_mrr_mmk: proofBoard.bank_verified_mrr_mmk,
        bank_unverified_mrr_mmk: proofBoard.bank_unverified_mrr_mmk,
        autopilot_command_count: autopilotBoard.command_count,
        autopilot_internal_autorun_count: autopilotBoard.internal_autorun_count,
        autopilot_owner_approval_count: autopilotBoard.owner_approval_count,
      },
      approval_inbox: {
        status: 'ready',
        pending_count: snapshot.pendingActionCount,
        next_action: nextAction,
      },
      notifications: {
        status: envText('RESEND_API_KEY') ? 'configured' : 'not_configured',
        channel: 'email',
        human_review_required: true,
      },
      fallback_queue: fallbackQueue(),
      durable_queue: {
        status: 'ready',
        public_daily_cron: '/api/cron/sales-daily',
        app_daily_cron: '/api/cron/supermega/daily',
        protected_by_bearer_token: true,
      },
      recent_leads: leads,
      recent_actions: actions,
      revenue_proof_board: proofBoard,
      autopilot_command_board: autopilotBoard,
      recent_sales_runs: snapshot.latestRuns,
    })
    return
  }

  if (!config.url || !config.serviceRoleKey) {
    json(res, 200, {
      status: 'ready',
      runtime_status: 'not_configured',
      endpoint: 'pipeline-control',
      contract,
      primary_database: datastore.datastoreStatus(),
      fallback_queue: fallbackQueue(),
      recommended_datastores: recommendedDatastores(),
      blockers: ['Provision Neon Postgres in the Vercel Marketplace, set POSTGRES_URL or DATABASE_URL, then run npm run db:lead-ledger:schema.'],
    })
    return
  }

  try {
    const since24h = encodeURIComponent(isoHoursAgo(24))
    const since7d = encodeURIComponent(isoHoursAgo(24 * 7))
    const [latestLeads, latestActions, pendingActions, lead24h, lead7d, latestRuns] = await Promise.all([
      supabaseFetch(config, '/rest/v1/supermega_leads?select=lead_id,task_id,submitted_at,requested_package,lead_score,lead_stage,status,next_step&order=submitted_at.desc&limit=5'),
      supabaseFetch(config, '/rest/v1/supermega_pipeline_actions?select=action_id,lead_id,task_id,action_type,status,priority,owner,title,next_step,approval_required,approval_state,notification_channel,notification_status,payload,result,created_at&order=created_at.desc&limit=8'),
      supabaseFetch(config, '/rest/v1/supermega_pipeline_actions?select=action_id&status=neq.done&limit=1', { count: true }),
      supabaseFetch(config, `/rest/v1/supermega_leads?select=lead_id&submitted_at=gte.${since24h}&limit=1`, { count: true }),
      supabaseFetch(config, `/rest/v1/supermega_leads?select=lead_id&submitted_at=gte.${since7d}&limit=1`, { count: true }),
      supabaseFetch(config, '/rest/v1/supermega_sales_runs?select=run_id,generated_at,status,summary&order=generated_at.desc&limit=3'),
    ])

    const blocked = [latestLeads, latestActions, pendingActions, lead24h, lead7d, latestRuns].find((result) => result.status !== 'ready')
    if (blocked) {
      const fallbackDatabase = primaryDatabaseStatus(blocked)
      const fallback = fallbackQueue()
      json(res, 200, {
        status: 'ready',
        runtime_status: fallback.status === 'ready' ? 'degraded' : 'blocked',
        endpoint: 'pipeline-control',
        contract,
        primary_database: datastore.datastoreStatus(),
        fallback_database: fallbackDatabase,
        fallback_queue: fallback,
        approval_inbox: {
          status: fallback.status === 'ready' ? 'email_fallback' : 'blocked',
          pending_count: null,
          next_action: {
            action_type: 'operator_review',
            priority: 'high',
            owner: fallback.owner,
            title: 'Review inbound lead emails while primary database is blocked',
            next_step: 'Provision Vercel Postgres/Neon for the primary ledger; use email fallback until the schema is applied.',
            approval_required: true,
            approval_state: 'pending',
          },
        },
        notifications: {
          status: fallback.email_delivery,
          channel: fallback.mode,
          human_review_required: true,
        },
        durable_queue: {
          status: fallback.status === 'ready' ? 'degraded_ready' : 'blocked',
          public_daily_cron: '/api/cron/sales-daily',
          app_daily_cron: '/api/cron/supermega/daily',
          fallback_mode: fallback.mode,
          protected_by_bearer_token: true,
        },
        recommended_datastores: recommendedDatastores(),
        blocker: blocked,
      })
      return
    }

    const actions = latestActions.data.map(safeAction)
    const leads = latestLeads.data.map(safeLead)
    const nextAction = actions.find((action) => action.approval_state === 'pending') || actions[0] || null
    const proofBoard = revenueProofBoard(actions)
    const autopilotBoard = autopilotCommandBoard({ actions, leads, proofBoard, latestRuns: latestRuns.data })

    json(res, 200, {
      status: 'ready',
      runtime_status: 'ready',
      endpoint: 'pipeline-control',
      generated_at: new Date().toISOString(),
      contract,
      metrics: {
        leads_24h: lead24h.count ?? 0,
        leads_7d: lead7d.count ?? 0,
        open_action_count: pendingActions.count ?? 0,
        recent_action_count: actions.length,
        recent_lead_count: leads.length,
        recent_sales_run_count: latestRuns.data.length,
        proof_backed_mrr_mmk: proofBoard.proof_backed_mrr_mmk,
        bank_verified_mrr_mmk: proofBoard.bank_verified_mrr_mmk,
        bank_unverified_mrr_mmk: proofBoard.bank_unverified_mrr_mmk,
        autopilot_command_count: autopilotBoard.command_count,
        autopilot_internal_autorun_count: autopilotBoard.internal_autorun_count,
        autopilot_owner_approval_count: autopilotBoard.owner_approval_count,
      },
      approval_inbox: {
        status: 'ready',
        pending_count: pendingActions.count ?? 0,
        next_action: nextAction,
      },
      notifications: {
        status: envText('RESEND_API_KEY') ? 'configured' : 'not_configured',
        channel: 'email',
        human_review_required: true,
      },
      fallback_queue: fallbackQueue(),
      durable_queue: {
        status: 'ready',
        public_daily_cron: '/api/cron/sales-daily',
        app_daily_cron: '/api/cron/supermega/daily',
        protected_by_bearer_token: true,
      },
      recent_leads: leads,
      recent_actions: actions,
      revenue_proof_board: proofBoard,
      autopilot_command_board: autopilotBoard,
      recent_sales_runs: latestRuns.data,
    })
  } catch (error) {
    json(res, 200, {
      status: 'ready',
      runtime_status: 'blocked',
      endpoint: 'pipeline-control',
      contract,
      fallback_queue: fallbackQueue(),
      recommended_datastores: recommendedDatastores(),
      reason: 'pipeline_control_failed',
      detail: text(error?.message).slice(0, 180),
    })
  }
}

handler.__test = {
  buildConnectorPolicyRecord,
  buildCustomerSuccessDeskPack,
  buildEnterpriseDeliveryPack,
  buildOrderRoomState,
  buildOwnerAcceptanceRecord,
  buildPrivateWorkspaceManifest,
  buildProductionApprovalQueue,
  buildRetainerGrowthOfferPack,
  buildRetainerPaymentRecord,
  firstProofPacket,
  autopilotCommandBoard,
  prepareFirstRunAcceptance,
  prepareCustomerSuccessDesk,
  prepareEnterpriseDeliveryPack,
  prepareProductionApprovalQueue,
  prepareRetainerGrowthOffer,
  recordRetainerPaymentProof,
  recordConnectorPolicy,
  recordOwnerAcceptance,
  revenueProofBoard,
  safeAction,
  startPrivateWorkspace,
  updateOrderRoomState,
}

module.exports = handler
