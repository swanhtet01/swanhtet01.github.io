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
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
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
  firstProofPacket,
  safeAction,
}

module.exports = handler
