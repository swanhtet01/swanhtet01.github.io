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
  const sourceTrace = list(task.source_trace || payload.source_trace)
  const persistedOrderRoomState = parseJsonObject(result.pilot_order_room_state || payload.pilot_order_room_state)
  const firstRunAcceptance = parseJsonObject(result.first_run_acceptance || payload.first_run_acceptance)
  const ownerAcceptance = parseJsonObject(result.owner_acceptance || payload.owner_acceptance)
  const connectorPolicy = parseJsonObject(result.connector_policy || payload.connector_policy)
  const productionApprovalQueue = parseJsonObject(result.production_approval_queue || payload.production_approval_queue)
  const enterpriseDeliveryPack = parseJsonObject(result.enterprise_delivery_pack || payload.enterprise_delivery_pack)
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
      state: orderRoomState,
    },
    approval_required: result.approval_required !== undefined ? result.approval_required !== false : task.approval_required !== false,
    human_gate: text(result.human_gate) || text(task.human_gate) || 'owner approval before send/write/payment actions',
  }
}

function safeAction(row) {
  const firstProof = firstProofPacket(row)
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
  if (['private_workspace_not_ready', 'private_workspace_required', 'first_run_acceptance_required', 'owner_acceptance_required', 'owner_acceptance_not_accepted', 'connector_policy_required', 'production_approval_queue_required', 'use_start_private_workspace_operation'].includes(result.reason)) return 409
  if (['missing_action_or_lead_id', 'invalid_owner_acceptance_decision', 'missing_owner_acceptance_reference', 'invalid_connector_policy_mode', 'missing_connector_policy_reference', 'missing_production_queue_reference', 'missing_enterprise_delivery_reference'].includes(result.reason)) return 400
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
  buildEnterpriseDeliveryPack,
  buildOrderRoomState,
  buildOwnerAcceptanceRecord,
  buildPrivateWorkspaceManifest,
  buildProductionApprovalQueue,
  firstProofPacket,
  prepareFirstRunAcceptance,
  prepareEnterpriseDeliveryPack,
  prepareProductionApprovalQueue,
  recordConnectorPolicy,
  recordOwnerAcceptance,
  safeAction,
  startPrivateWorkspace,
  updateOrderRoomState,
}

module.exports = handler
