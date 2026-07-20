import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import './enforce_current_public_product_output.mjs'

const root = process.cwd()
const outputRoot = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputRoot, 'static')
const behaviorSource = readFileSync(resolve(root, 'api', 'behavior-events.js'), 'utf8')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const configPath = resolve(outputRoot, 'config.json')
if (!existsSync(configPath)) fail('missing_vercel_output_config')
if (!/function privacyIpHint\(req\)/.test(behaviorSource) || !/ip_hint: privacyIpHint\(req\)/.test(behaviorSource) || /ip_hint: clientIp\(req\)/.test(behaviorSource)) {
  fail('behavior_ip_privacy_contract_missing')
}
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const routes = new Map((config.routes || []).filter((route) => route.src).map((route) => [route.src, route.dest || route.status || route.headers?.Location]))

for (const [src, dest] of [
  ['^/api/contact-submissions$', '/api/contact-submissions.js'],
  ['^/api/contact-submissions/status$', '/api/contact-submissions.js'],
  ['^/api/behavior-events/?$', '/api/behavior-events.js'],
  ['^/api/behavior-events/status/?$', '/api/behavior-events.js'],
]) {
  if (routes.get(src) !== dest) fail('route_contract_missing', { src, expected: dest, actual: routes.get(src) })
}

const productsRoute = (config.routes || []).find((route) => route.src === '^/products/?$')
if (productsRoute?.dest !== '/products/index.html') {
  fail('products_route_not_static_page', { expected: { dest: '/products/index.html' }, actual: productsRoute })
}

for (const src of [
  '^/(?:agentops|agentops-toolbox|ai-back-office|back-office-operator|back-office-workflow-desk|openclaw|office-operator)/?$',
  '^/products/(?:agentops|agentops-toolbox|ai-agent-operator|ai-back-office|back-office-operator|back-office-workflow-desk|openclaw)/?$',
]) {
  const route = (config.routes || []).find((entry) => entry.src === src)
  if (route?.status !== 308 || route?.headers?.Location !== '/contact/?package=back-office-workflow-desk') {
    fail('agentops_route_contract_missing', { src, expected: { status: 308, Location: '/contact/?package=back-office-workflow-desk' }, actual: route })
  }
}

for (const entry of ['behavior-events.js.func', 'contact-submissions.js.func', 'health.js.func', 'not-found.js.func', 'public-app-handoff.js.func']) {
  const rootPath = resolve(outputRoot, 'functions', entry)
  const apiPath = resolve(outputRoot, 'functions', 'api', entry)
  if (!existsSync(rootPath) && !existsSync(apiPath)) fail('missing_function_output', { entry })
}

for (const entry of [
  'index.html',
  'products/index.html',
  'contact/index.html',
  'demo/index.html',
  'site/shots/actual-custom-workflow-queue.png',
  'site/shots/actual-custom-workflow-modules.png',
  'site/shots/actual-custom-workflow-overview.png',
  'site/shots/actual-factory-assets.png',
  'site/shots/actual-factory-actions.png',
  'site/shots/actual-factory-overview.png',
  'site/shots/actual-restaurant-shift-stock.png',
  'site/shots/actual-restaurant-menu.png',
  'site/shots/actual-restaurant-overview.png',
  'site/shots/live-demo-agent-builder.png',
  'site/shots/live-demo-service-desk.png',
  'site/shots/live-demo-industrial-os.png',
  'site/activation-kits/index.json',
  'site/sales-sprints/index.json',
  'site/first-wave/index.json',
  'site/first-wave/agency-client-operator.md',
  'site/first-wave/agency-client-operator.json',
  'site/first-wave/agency-client-operator.approvals.csv',
  'site/first-wave-runtime/index.json',
  'site/first-wave-runtime/agency-client-operator.md',
  'site/first-wave-runtime/agency-client-operator.json',
  'site/first-wave-runtime/agency-client-operator.goose.md',
  'site/first-wave-runtime/agency-client-operator.openai-agents.json',
  'site/first-wave-runtime/agency-client-operator.n8n.workflow.json',
  'site/first-wave-runtime/agency-client-operator.daily-queue.csv',
  'site/first-wave-prospects/index.json',
  'site/first-wave-prospects/agency-client-operator.md',
  'site/first-wave-prospects/agency-client-operator.json',
  'site/first-wave-prospects/agency-client-operator.prospects.csv',
  'site/first-wave-prospects/agency-client-operator.operator-queue.csv',
  'site/first-wave-account-briefs/index.json',
  'site/first-wave-account-briefs/agency-client-operator.md',
  'site/first-wave-account-briefs/agency-client-operator.json',
  'site/first-wave-account-briefs/agency-client-operator.approvals.csv',
  'site/first-wave-account-briefs/agency-client-operator.messages.csv',
  'site/first-wave-account-briefs/agency-client-operator.goose.md',
  'site/first-wave-pilot-close/index.json',
  'site/first-wave-pilot-close/agency-client-operator.md',
  'site/first-wave-pilot-close/agency-client-operator.json',
  'site/first-wave-pilot-close/agency-client-operator.call-script.md',
  'site/first-wave-pilot-close/agency-client-operator.close-checklist.csv',
  'site/first-wave-pilot-close/agency-client-operator.reply-tracker.csv',
  'site/first-wave-pilot-close/agency-client-operator.payment-proof-ledger.csv',
  'site/first-wave-pilot-close/agency-client-operator.goose.md',
  'site/first-wave-pilot-close/agency-client-operator.openai-agents.json',
  'site/first-wave-pilot-close/agency-client-operator.n8n.workflow.json',
  'site/product-install-kits/index.json',
  'site/product-install-kits/agency-client-operator.md',
  'site/product-install-kits/agency-client-operator.json',
  'site/product-install-kits/agency-client-operator.goose.md',
  'site/product-install-kits/agency-client-operator.openai-agents.json',
  'site/product-install-kits/agency-client-operator.n8n.workflow.json',
  'site/product-install-kits/agency-client-operator.stagehand.json',
  'site/product-install-kits/agency-client-operator.langfuse.json',
  'site/product-install-kits/agency-client-operator.sample-intake-report.json',
  'site/product-install-kits/agency-client-operator.sample-intake-report.md',
  'site/product-install-kits/agency-client-operator.buyer-intake-room.html',
  'site/product-install-kits/agency-client-operator.buyer-intake-room.json',
  'site/product-install-kits/agency-client-operator.buyer-intake-room.md',
  'site/product-install-kits/agency-client-operator.buyer-intake-goose.md',
  'site/product-install-kits/agency-client-operator.pilot-proof-packet.md',
  'site/product-install-kits/agency-client-operator.payment-request-draft.md',
  'site/product-install-kits/agency-client-operator.sales-handoff.json',
  'site/product-install-kits/agency-client-operator.sales-handoff.md',
  'site/product-install-kits/agency-client-operator.sales-handoff.crm-draft.csv',
  'site/product-install-kits/agency-client-operator.sales-handoff.email-draft.md',
  'site/product-install-kits/agency-client-operator.sales-handoff.stripe-checklist.md',
  'site/product-install-kits/agency-client-operator.sales-handoff.goose.md',
  'site/product-install-kits/agency-client-operator.sales-handoff.approval-ledger.csv',
  'site/product-install-kits/agency-client-operator.revenue-activation.html',
  'site/product-install-kits/agency-client-operator.revenue-activation.json',
  'site/product-install-kits/agency-client-operator.revenue-activation.md',
  'site/product-install-kits/agency-client-operator.revenue-activation.owner-action-queue.csv',
  'site/product-install-kits/agency-client-operator.revenue-activation.payment-proof-ledger.csv',
  'site/product-install-kits/agency-client-operator.revenue-activation.order-room-ledger.csv',
  'site/product-install-kits/agency-client-operator.revenue-activation.goose.md',
]) {
  // AgentOps machine artifacts (activation-kits / first-wave* / sales-sprints / product-install-kits) are
  // pruned from the public output — they are internal, not customer-facing. Skip their existence checks.
  if (/^site\/(activation-kits|first-wave|sales-sprints|product-install-kits)/.test(entry)) continue
  if (!existsSync(resolve(staticDir, entry))) fail('missing_static_output', { entry })
}

// The AgentOps machine artifacts validated below are pruned from the public output; only run these checks
// when the artifacts are present (internal builds that keep them).
if (existsSync(resolve(staticDir, 'site/first-wave/agency-client-operator.json'))) {
const firstWavePacket = JSON.parse(readFileSync(resolve(staticDir, 'site/first-wave/agency-client-operator.json'), 'utf8'))
if (firstWavePacket.status !== 'draft_only_requires_owner_approval') {
  fail('first_wave_status_not_draft_only', { status: firstWavePacket.status })
}
if (firstWavePacket.businessTruth?.businessLive !== false || firstWavePacket.businessTruth?.realMrrUsd !== 0) {
  fail('first_wave_revenue_truth_invalid', { businessTruth: firstWavePacket.businessTruth })
}
if (!Array.isArray(firstWavePacket.prospectResearchSlots) || firstWavePacket.prospectResearchSlots.length < 20) {
  fail('first_wave_research_slots_missing', { count: firstWavePacket.prospectResearchSlots?.length ?? 0 })
}
if (!Array.isArray(firstWavePacket.approvalQueue) || firstWavePacket.approvalQueue.length < 10) {
  fail('first_wave_approval_queue_missing', { count: firstWavePacket.approvalQueue?.length ?? 0 })
}
if (firstWavePacket.approvalQueue.some((row) => row.approvalStatus !== 'pending_owner_review' || row.actionState !== 'not_sent')) {
  fail('first_wave_approval_queue_claims_action')
}
if (!firstWavePacket.proofLedgerFields?.includes('payment_proof') || !firstWavePacket.proofLedgerFields?.includes('real_mrr_delta')) {
  fail('first_wave_proof_ledger_fields_missing', { proofLedgerFields: firstWavePacket.proofLedgerFields })
}

const firstWaveRuntime = JSON.parse(readFileSync(resolve(staticDir, 'site/first-wave-runtime/agency-client-operator.json'), 'utf8'))
if (firstWaveRuntime.status !== 'draft_only_requires_owner_approval') {
  fail('first_wave_runtime_status_not_draft_only', { status: firstWaveRuntime.status })
}
if (firstWaveRuntime.businessTruth?.businessLive !== false || firstWaveRuntime.businessTruth?.realMrrUsd !== 0) {
  fail('first_wave_runtime_revenue_truth_invalid', { businessTruth: firstWaveRuntime.businessTruth })
}
if (!firstWaveRuntime.openAiAgentsManifest?.guardrails?.includes('no_external_send')) {
  fail('first_wave_runtime_openai_guardrail_missing')
}
if (firstWaveRuntime.n8nWorkflowDraft?.active !== false) {
  fail('first_wave_runtime_n8n_should_be_inactive')
}
if (firstWaveRuntime.dailyQueue?.some((row) => row.external_action_state !== 'not_sent' || row.real_mrr_delta !== '0')) {
  fail('first_wave_runtime_queue_claims_action')
}

const firstWaveProspects = JSON.parse(readFileSync(resolve(staticDir, 'site/first-wave-prospects/agency-client-operator.json'), 'utf8'))
if (firstWaveProspects.status !== 'source_seeded_requires_owner_review') {
  fail('first_wave_prospect_status_unexpected', { status: firstWaveProspects.status })
}
if (firstWaveProspects.businessTruth?.businessLive !== false || firstWaveProspects.businessTruth?.realMrrUsd !== 0) {
  fail('first_wave_prospect_revenue_truth_invalid', { businessTruth: firstWaveProspects.businessTruth })
}
if (!Array.isArray(firstWaveProspects.prospectRows) || firstWaveProspects.prospectRows.length !== 20) {
  fail('first_wave_prospect_rows_missing', { count: firstWaveProspects.prospectRows?.length ?? 0 })
}
if (firstWaveProspects.prospectRows.some((row) => row.outreachStatus !== 'not_contacted' || row.externalActionState !== 'not_sent')) {
  fail('first_wave_prospect_claims_contact')
}
if (firstWaveProspects.prospectRows.some((row) => !/^https:\/\//i.test(row.sourceUrl || '') || row.sourceUrl === 'REQUIRED_BEFORE_APPROVAL')) {
  fail('first_wave_prospect_source_url_missing')
}

const firstWaveAccountBriefs = JSON.parse(readFileSync(resolve(staticDir, 'site/first-wave-account-briefs/agency-client-operator.json'), 'utf8'))
if (firstWaveAccountBriefs.status !== 'draft_only_requires_owner_approval') {
  fail('first_wave_account_briefs_status_unexpected', { status: firstWaveAccountBriefs.status })
}
if (firstWaveAccountBriefs.businessTruth?.businessLive !== false || firstWaveAccountBriefs.businessTruth?.realMrrUsd !== 0) {
  fail('first_wave_account_briefs_revenue_truth_invalid', { businessTruth: firstWaveAccountBriefs.businessTruth })
}
if (firstWaveAccountBriefs.businessTruth?.externalActionsPerformed !== 0 || firstWaveAccountBriefs.businessTruth?.contactedProspects !== 0) {
  fail('first_wave_account_briefs_claims_action', { businessTruth: firstWaveAccountBriefs.businessTruth })
}
if (!Array.isArray(firstWaveAccountBriefs.accountBriefs) || firstWaveAccountBriefs.accountBriefs.length !== 10) {
  fail('first_wave_account_briefs_missing', { count: firstWaveAccountBriefs.accountBriefs?.length ?? 0 })
}
if (!Array.isArray(firstWaveAccountBriefs.approvalQueue) || firstWaveAccountBriefs.approvalQueue.length !== 10) {
  fail('first_wave_account_brief_approval_queue_missing', { count: firstWaveAccountBriefs.approvalQueue?.length ?? 0 })
}
if (
  firstWaveAccountBriefs.accountBriefs.some(
    (row) => row.approvalStatus !== 'pending_owner_review' || row.externalActionState !== 'not_sent' || row.realMrrDelta !== 0,
  )
) {
  fail('first_wave_account_briefs_claims_contact_or_revenue')
}
if (firstWaveAccountBriefs.approvalQueue.some((row) => row.approvalStatus !== 'pending_owner_review' || row.externalActionState !== 'not_sent')) {
  fail('first_wave_account_brief_approval_queue_claims_action')
}
if (!firstWaveAccountBriefs.gooseRunbook?.blockedActions?.includes('external_send')) {
  fail('first_wave_account_brief_goose_guardrail_missing')
}
if (!firstWaveAccountBriefs.openAiAgentPlan?.guardrails?.includes('no_external_send')) {
  fail('first_wave_account_brief_openai_guardrail_missing')
}

const firstWavePilotClose = JSON.parse(readFileSync(resolve(staticDir, 'site/first-wave-pilot-close/agency-client-operator.json'), 'utf8'))
if (firstWavePilotClose.status !== 'draft_only_requires_owner_approval') {
  fail('first_wave_pilot_close_status_unexpected', { status: firstWavePilotClose.status })
}
if (firstWavePilotClose.pipelineMath?.targetMrrUsd !== 100000 || firstWavePilotClose.pipelineMath?.retainedClientsNeeded !== 10) {
  fail('first_wave_pilot_close_pipeline_math_invalid', { pipelineMath: firstWavePilotClose.pipelineMath })
}
if (firstWavePilotClose.businessTruth?.businessLive !== false || firstWavePilotClose.businessTruth?.realMrrUsd !== 0) {
  fail('first_wave_pilot_close_revenue_truth_invalid', { businessTruth: firstWavePilotClose.businessTruth })
}
if (
  firstWavePilotClose.businessTruth?.externalActionsPerformed !== 0 ||
  firstWavePilotClose.businessTruth?.contactedProspects !== 0 ||
  firstWavePilotClose.businessTruth?.paymentProofRows !== 0
) {
  fail('first_wave_pilot_close_claims_action', { businessTruth: firstWavePilotClose.businessTruth })
}
if (!Array.isArray(firstWavePilotClose.closeRows) || firstWavePilotClose.closeRows.length !== 10) {
  fail('first_wave_pilot_close_rows_missing', { count: firstWavePilotClose.closeRows?.length ?? 0 })
}
if (
  firstWavePilotClose.closeRows.some(
    (row) =>
      row.approvalStatus !== 'pending_owner_review' ||
      row.externalActionState !== 'not_sent' ||
      row.replyStatus !== 'no_reply_recorded' ||
      row.paymentStatus !== 'not_requested' ||
      row.realMrrDelta !== 0,
  )
) {
  fail('first_wave_pilot_close_claims_contact_payment_or_revenue')
}
if (!firstWavePilotClose.gooseRunbook?.blockedActions?.includes('external_send')) {
  fail('first_wave_pilot_close_goose_guardrail_missing')
}
if (!firstWavePilotClose.openAiAgentsManifest?.guardrails?.includes('no_external_send')) {
  fail('first_wave_pilot_close_openai_guardrail_missing')
}
if (firstWavePilotClose.n8nWorkflowDraft?.active !== false) {
  fail('first_wave_pilot_close_n8n_should_be_inactive')
}

const productInstallIndex = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/index.json'), 'utf8'))
const agencyInstallPack = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.json'), 'utf8'))
if (productInstallIndex.status !== 'draft_install_ready_needs_customer_sample' || productInstallIndex.firstFocus !== 'agency-client-operator') {
  fail('product_install_index_unexpected', { status: productInstallIndex.status, firstFocus: productInstallIndex.firstFocus })
}
if (productInstallIndex.revenueTruth?.businessLive !== false || productInstallIndex.revenueTruth?.realMrrUsd !== 0) {
  fail('product_install_index_revenue_truth_invalid', { revenueTruth: productInstallIndex.revenueTruth })
}
if (agencyInstallPack.status !== 'draft_install_ready_needs_customer_sample') {
  fail('product_install_pack_status_unexpected', { status: agencyInstallPack.status })
}
if (agencyInstallPack.installPath?.templateFolder !== 'templates/agency-client-operator') {
  fail('product_install_template_folder_missing', { installPath: agencyInstallPack.installPath })
}
if (agencyInstallPack.installPath?.workspaceFolder !== 'workspaces/agency-client-operator') {
  fail('product_install_workspace_folder_missing', { installPath: agencyInstallPack.installPath })
}
if (
  agencyInstallPack.businessTruth?.businessLive !== false ||
  agencyInstallPack.businessTruth?.realMrrUsd !== 0 ||
  agencyInstallPack.businessTruth?.externalActionsPerformed !== 0 ||
  agencyInstallPack.businessTruth?.customerSamplesReceived !== 0
) {
  fail('product_install_pack_claims_live_action_or_revenue', { businessTruth: agencyInstallPack.businessTruth })
}
if (!agencyInstallPack.toolStack?.some((tool) => tool.engine === 'Langfuse')) {
  fail('product_install_langfuse_stack_missing')
}
if (!agencyInstallPack.toolStack?.some((tool) => tool.engine === 'Stagehand + Playwright')) {
  fail('product_install_stagehand_stack_missing')
}
const agencyIntegrationIds = new Set((agencyInstallPack.integrationBacklog ?? []).map((item) => item.id))
for (const id of ['composio-tool-router', 'e2b-or-daytona-sandbox', 'browser-use-fallback']) {
  if (!agencyIntegrationIds.has(id)) fail('product_install_integration_backlog_missing', { id })
}
if (!agencyInstallPack.integrationBacklog?.some((item) => item.timing === 'now' && item.decision === 'integrate_after_first_sample')) {
  fail('product_install_integration_backlog_has_no_now_candidate')
}
const agencyInstallMarkdown = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.md'), 'utf8')
for (const token of ['Composio', 'E2B or Daytona', 'Browser Use fallback', 'do not install everything first']) {
  if (!agencyInstallMarkdown.includes(token)) fail('product_install_markdown_missing_integration_token', { token })
}
const agencyInstallGoose = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.goose.md'), 'utf8')
if (!agencyInstallGoose.includes('external_send') || !agencyInstallGoose.includes('claim_real_mrr')) {
  fail('product_install_goose_guardrails_missing')
}
const agencyInstallOpenAi = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.openai-agents.json'), 'utf8'))
if (!agencyInstallOpenAi.guardrails?.includes('no_external_send') || !agencyInstallOpenAi.tools?.some((tool) => tool.name === 'approval_gate')) {
  fail('product_install_openai_guardrails_missing')
}
const agencyInstallN8n = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.n8n.workflow.json'), 'utf8'))
if (agencyInstallN8n.active !== false) {
  fail('product_install_n8n_should_be_inactive')
}
const agencyInstallStagehand = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.stagehand.json'), 'utf8'))
if (!agencyInstallStagehand.guardrails?.includes('screenshot_before_after_required')) {
  fail('product_install_stagehand_guardrail_missing')
}
const agencyInstallLangfuse = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.langfuse.json'), 'utf8'))
if (!agencyInstallLangfuse.evals?.some((item) => item.id === 'no_revenue_claim_without_payment_proof')) {
  fail('product_install_langfuse_revenue_eval_missing')
}
const agencySampleIntakeReport = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sample-intake-report.json'), 'utf8'))
if (agencySampleIntakeReport.status !== 'draft_sample_intake_ready') {
  fail('product_sample_intake_status_unexpected', { status: agencySampleIntakeReport.status })
}
if (
  agencySampleIntakeReport.businessTruth?.businessLive !== false ||
  agencySampleIntakeReport.businessTruth?.realMrrUsd !== 0 ||
  agencySampleIntakeReport.businessTruth?.externalActionsPerformed !== 0 ||
  agencySampleIntakeReport.businessTruth?.customerSamplesReceived !== 0
) {
  fail('product_sample_intake_claims_live_action_or_revenue', { businessTruth: agencySampleIntakeReport.businessTruth })
}
if (agencySampleIntakeReport.sampleIntake?.queueRows < 4 || agencySampleIntakeReport.sampleIntake?.missingAssetRows < 2) {
  fail('product_sample_intake_rows_too_low', { sampleIntake: agencySampleIntakeReport.sampleIntake })
}
if (!agencySampleIntakeReport.blockedActions?.includes('external_send') || !agencySampleIntakeReport.blockedActions?.includes('claim_real_mrr')) {
  fail('product_sample_intake_guardrails_missing', { blockedActions: agencySampleIntakeReport.blockedActions })
}
const agencySampleIntakeMarkdown = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sample-intake-report.md'), 'utf8')
for (const token of ['Sample intake proof', 'synthetic_redacted_demo', 'Real MRR: USD 0', 'No external sends']) {
  if (!agencySampleIntakeMarkdown.includes(token)) fail('product_sample_intake_markdown_missing_token', { token })
}
const agencyBuyerIntakeRoom = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.buyer-intake-room.json'), 'utf8'))
if (agencyBuyerIntakeRoom.status !== 'buyer_intake_room_ready_draft_only') {
  fail('product_buyer_intake_status_unexpected', { status: agencyBuyerIntakeRoom.status })
}
if (
  agencyBuyerIntakeRoom.businessTruth?.businessLive !== false ||
  agencyBuyerIntakeRoom.businessTruth?.realMrrUsd !== 0 ||
  agencyBuyerIntakeRoom.businessTruth?.externalActionsPerformed !== 0 ||
  agencyBuyerIntakeRoom.businessTruth?.paymentProofRows !== 0
) {
  fail('product_buyer_intake_claims_live_action_or_revenue', { businessTruth: agencyBuyerIntakeRoom.businessTruth })
}
if (!agencyBuyerIntakeRoom.guardrails?.includes('no_external_send') || !agencyBuyerIntakeRoom.guardrails?.includes('no_live_payment_link')) {
  fail('product_buyer_intake_guardrails_missing', { guardrails: agencyBuyerIntakeRoom.guardrails })
}
if (agencyBuyerIntakeRoom.localProofRuntime?.status !== 'browser_only_not_submitted') {
  fail('product_buyer_intake_local_proof_runtime_missing', {
    localProofRuntime: agencyBuyerIntakeRoom.localProofRuntime,
  })
}
if (
  !agencyBuyerIntakeRoom.localProofRuntime?.blockedActions?.includes('external_send') ||
  !agencyBuyerIntakeRoom.localProofRuntime?.blockedActions?.includes('network_submit') ||
  !agencyBuyerIntakeRoom.localProofRuntime?.downloadName?.endsWith('local-pilot-proof.json')
) {
  fail('product_buyer_intake_local_proof_contract_invalid', {
    localProofRuntime: agencyBuyerIntakeRoom.localProofRuntime,
  })
}
const agencyBuyerIntakeHtml = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.buyer-intake-room.html'), 'utf8')
for (const token of [
  'Paste redacted workflow sample',
  'Owner approval required',
  'No external sends',
  'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
  'Generate local pilot proof',
  'id="generate-proof"',
  'id="pilot-proof-output"',
  'id="download-local-proof"',
  'browser_only_not_submitted',
  'agency-client-operator-local-pilot-proof.json',
  'clientWorkflowFingerprint',
  'URL.createObjectURL',
]) {
  if (!agencyBuyerIntakeHtml.includes(token)) fail('product_buyer_intake_html_missing_token', { token })
}
const agencyPaymentDraft = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.payment-request-draft.md'), 'utf8')
if (!agencyPaymentDraft.includes('Payment request draft') || !agencyPaymentDraft.includes('Real MRR: 0')) {
  fail('product_buyer_intake_payment_draft_missing_truth')
}
if (/https?:\/\/(checkout|buy|pay|billing|stripe)\./i.test(agencyPaymentDraft) || /https?:\/\/(checkout|buy|pay|billing|stripe)\./i.test(agencyBuyerIntakeHtml)) {
  fail('product_buyer_intake_contains_live_payment_link')
}
const agencySalesHandoff = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sales-handoff.json'), 'utf8'))
if (agencySalesHandoff.status !== 'proof_to_sales_handoff_ready_draft_only') {
  fail('product_sales_handoff_status_unexpected', { status: agencySalesHandoff.status })
}
if (
  agencySalesHandoff.businessTruth?.businessLive !== false ||
  agencySalesHandoff.businessTruth?.realMrrUsd !== 0 ||
  agencySalesHandoff.businessTruth?.externalActionsPerformed !== 0 ||
  agencySalesHandoff.businessTruth?.contactedProspects !== 0 ||
  agencySalesHandoff.businessTruth?.paymentLinksCreated !== 0 ||
  agencySalesHandoff.businessTruth?.checkoutSessionsCreated !== 0 ||
  agencySalesHandoff.businessTruth?.paymentProofRows !== 0
) {
  fail('product_sales_handoff_claims_live_action_or_revenue', { businessTruth: agencySalesHandoff.businessTruth })
}
if (
  !agencySalesHandoff.guardrails?.includes('no_external_send') ||
  !agencySalesHandoff.guardrails?.includes('no_live_payment_link') ||
  !agencySalesHandoff.guardrails?.includes('no_checkout_session_created') ||
  !agencySalesHandoff.guardrails?.includes('owner_approval_before_payment_request')
) {
  fail('product_sales_handoff_guardrails_missing', { guardrails: agencySalesHandoff.guardrails })
}
if (agencySalesHandoff.paymentActivation?.recommendedStripeSurface !== 'Payment Links first, Checkout Sessions if app checkout is needed') {
  fail('product_sales_handoff_payment_surface_unexpected', { paymentActivation: agencySalesHandoff.paymentActivation })
}
if (agencySalesHandoff.paymentActivation?.stripeApiVersion !== '2026-02-25.clover') {
  fail('product_sales_handoff_stripe_api_version_unexpected', { paymentActivation: agencySalesHandoff.paymentActivation })
}
if (
  agencySalesHandoff.paymentActivation?.livePaymentLink !== 'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL' ||
  agencySalesHandoff.paymentActivation?.checkoutSessionState !== 'not_created'
) {
  fail('product_sales_handoff_payment_state_not_draft_only', { paymentActivation: agencySalesHandoff.paymentActivation })
}
const agencySalesHandoffMarkdown = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sales-handoff.md'), 'utf8')
const agencySalesHandoffCrm = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sales-handoff.crm-draft.csv'), 'utf8')
const agencySalesHandoffEmail = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sales-handoff.email-draft.md'), 'utf8')
const agencySalesHandoffStripe = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sales-handoff.stripe-checklist.md'), 'utf8')
const agencySalesHandoffGoose = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sales-handoff.goose.md'), 'utf8')
const agencySalesHandoffApproval = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.sales-handoff.approval-ledger.csv'), 'utf8')
for (const [label, text, tokens] of [
  ['markdown', agencySalesHandoffMarkdown, ['Proof-to-sales handoff', 'Real MRR: 0', 'Payment Links first', 'Checkout Sessions']],
  ['crm', agencySalesHandoffCrm, ['draft_unsubmitted', 'not_sent', 'proof_fingerprint_required', 'real_mrr_delta']],
  ['email', agencySalesHandoffEmail, ['Status: draft_not_sent', 'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL', 'no external send']],
  ['stripe', agencySalesHandoffStripe, ['Payment Links first', 'Checkout Sessions', '2026-02-25.clover', 'Do not use Charges API']],
  ['goose', agencySalesHandoffGoose, ['read sales-handoff/latest', 'external_send', 'payment_link', 'checkout_session', 'claim_real_mrr']],
  ['approval', agencySalesHandoffApproval, ['owner_approval_required', 'create_payment_link', 'send_email', 'start_pilot', 'not_sent']],
]) {
  for (const token of tokens) {
    if (!text.includes(token)) fail('product_sales_handoff_missing_token', { label, token })
  }
}
for (const [label, text] of [
  ['markdown', agencySalesHandoffMarkdown],
  ['email', agencySalesHandoffEmail],
  ['stripe', agencySalesHandoffStripe],
  ['goose', agencySalesHandoffGoose],
]) {
  if (/https?:\/\/(checkout|buy|pay|billing|stripe)\./i.test(text)) fail('product_sales_handoff_contains_live_payment_link', { label })
}
const agencyRevenueActivation = JSON.parse(readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.revenue-activation.json'), 'utf8'))
if (agencyRevenueActivation.status !== 'revenue_activation_console_ready_draft_only') {
  fail('product_revenue_activation_status_unexpected', { status: agencyRevenueActivation.status })
}
if (
  agencyRevenueActivation.businessTruth?.businessLive !== false ||
  agencyRevenueActivation.businessTruth?.realMrrUsd !== 0 ||
  agencyRevenueActivation.businessTruth?.externalActionsPerformed !== 0 ||
  agencyRevenueActivation.businessTruth?.contactedProspects !== 0 ||
  agencyRevenueActivation.businessTruth?.paymentLinksCreated !== 0 ||
  agencyRevenueActivation.businessTruth?.checkoutSessionsCreated !== 0 ||
  agencyRevenueActivation.businessTruth?.ordersRecorded !== 0 ||
  agencyRevenueActivation.businessTruth?.paymentProofRows !== 0
) {
  fail('product_revenue_activation_claims_live_action_or_revenue', { businessTruth: agencyRevenueActivation.businessTruth })
}
if (
  !agencyRevenueActivation.guardrails?.includes('no_external_send') ||
  !agencyRevenueActivation.guardrails?.includes('no_live_payment_link') ||
  !agencyRevenueActivation.guardrails?.includes('no_checkout_session_created') ||
  !agencyRevenueActivation.guardrails?.includes('no_order_recorded_without_payment_proof')
) {
  fail('product_revenue_activation_guardrails_missing', { guardrails: agencyRevenueActivation.guardrails })
}
if (agencyRevenueActivation.paymentPlan?.recommendedStripeSurface !== 'Payment Links first, Checkout Sessions if app checkout is needed') {
  fail('product_revenue_activation_payment_surface_unexpected', { paymentPlan: agencyRevenueActivation.paymentPlan })
}
if (agencyRevenueActivation.paymentPlan?.stripeApiVersion !== '2026-02-25.clover') {
  fail('product_revenue_activation_stripe_api_version_unexpected', { paymentPlan: agencyRevenueActivation.paymentPlan })
}
if (agencyRevenueActivation.paymentPlan?.livePaymentLink !== 'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL') {
  fail('product_revenue_activation_live_payment_link_not_placeholder', { paymentPlan: agencyRevenueActivation.paymentPlan })
}
const agencyRevenueActivationHtml = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.revenue-activation.html'), 'utf8')
const agencyRevenueActivationMarkdown = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.revenue-activation.md'), 'utf8')
const agencyRevenueActivationQueue = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.revenue-activation.owner-action-queue.csv'), 'utf8')
const agencyRevenueActivationPayment = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.revenue-activation.payment-proof-ledger.csv'), 'utf8')
const agencyRevenueActivationOrder = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.revenue-activation.order-room-ledger.csv'), 'utf8')
const agencyRevenueActivationGoose = readFileSync(resolve(staticDir, 'site/product-install-kits/agency-client-operator.revenue-activation.goose.md'), 'utf8')
for (const [label, text, tokens] of [
  ['html', agencyRevenueActivationHtml, ['Revenue activation console', 'Generate owner action packet', 'browser_only_not_submitted', 'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL', 'URL.createObjectURL']],
  ['markdown', agencyRevenueActivationMarkdown, ['Revenue activation console', 'Real MRR: 0', 'Payment Links first', 'Checkout Sessions']],
  ['queue', agencyRevenueActivationQueue, ['owner_approval_required', 'send_email', 'create_payment_link', 'import_payment_proof', 'start_order_room', 'not_sent']],
  ['payment', agencyRevenueActivationPayment, ['payment_proof_required', 'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL', 'real_mrr_delta']],
  ['order', agencyRevenueActivationOrder, ['order_not_started', 'payment_proof_required', 'real_mrr_delta']],
  ['goose', agencyRevenueActivationGoose, ['read revenue-activation/latest', 'external_send', 'payment_link', 'checkout_session', 'order_record', 'claim_real_mrr']],
]) {
  for (const token of tokens) {
    if (!text.includes(token)) fail('product_revenue_activation_missing_token', { label, token })
  }
}
for (const [label, text] of [
  ['html', agencyRevenueActivationHtml],
  ['markdown', agencyRevenueActivationMarkdown],
  ['payment', agencyRevenueActivationPayment],
  ['goose', agencyRevenueActivationGoose],
]) {
  if (/https?:\/\/(checkout|buy|pay|billing|stripe)\./i.test(text)) fail('product_revenue_activation_contains_live_payment_link', { label })
}
}

const homeHtml = readFileSync(resolve(staticDir, 'index.html'), 'utf8')
const productsHtml = readFileSync(resolve(staticDir, 'products/index.html'), 'utf8')
const contactHtml = readFileSync(resolve(staticDir, 'contact/index.html'), 'utf8')
const offersHtml = readFileSync(resolve(staticDir, 'offers/index.html'), 'utf8')
const demoHtml = readFileSync(resolve(staticDir, 'demo/index.html'), 'utf8')
const agentsHtml = readFileSync(resolve(staticDir, 'products/agents/index.html'), 'utf8')
for (const token of ['app.supermega.dev/?demo=shop', 'app.supermega.dev/?demo=plant', 'app.supermega.dev/commerce-machine']) {
  if (!demoHtml.includes(token)) fail('demo_stable_link_missing', { token })
}

for (const [src, location] of [
  ['^/products/manager-operating-system/?$', '/products/agents/'],
  ['^/products/find-clients/?$', '/products/agents/'],
  ['^/signup/?$', 'https://app.supermega.dev/signup/?source=public-site'],
]) {
  const route = (config.routes || []).find((entry) => entry.src === src)
  if (route?.status !== 308 || route?.headers?.Location !== location) {
    fail('legacy_public_route_contract_missing', { src, expected: { status: 308, Location: location }, actual: route })
  }
}
const offerCards = (offersHtml.match(/class="of-card/g) || []).length
if (offerCards !== 4) fail('offers_scope_card_count_invalid', { expected: 4, actual: offerCards })
if (/\bUSD\b|\$\s*[0-9]/.test(offersHtml)) fail('offers_public_currency_not_mmk_only')
if (/care[- ]plan/i.test(offersHtml)) fail('offers_care_plan_regression')
if (!offersHtml.includes('8,000,000 MMK')) fail('offers_dashboard_anchor_missing')
for (const [entry, html] of [['home', homeHtml], ['products', productsHtml], ['contact', contactHtml]]) {
  if (/\$\s*[0-9]|\bUSD\b|50%\s+deposit|50%\s+to\s+start|care[- ]plan/i.test(html)) fail('public_funnel_legacy_pricing_copy', { entry })
}
for (const token of [
  '<title>Custom business software, built for Myanmar | SUPERMEGA.dev</title>',
  '<h2>What we build</h2>',
]) {
  if (!homeHtml.includes(token)) fail('public_shell_contract_missing', { token })
}
for (const token of [
  '<title>Products | SUPERMEGA.dev</title>',
  'Plant',
  'AI Agent Solutions',
  '/products/agents/',
  '/products/factory/',
  '/products/pos/',
]) {
  if (!productsHtml.includes(token)) fail('public_products_contract_missing', { token })
}
for (const token of ['AI Agent Solutions', 'Try a free agent starter', 'app.supermega.dev/commerce-machine?source=agent-product']) {
  if (!agentsHtml.includes(token)) fail('public_agents_contract_missing', { token })
}
// Guard against re-introducing speculative/non-sellable product names on the public products page.
for (const banned of ['AI-worker paid pilots', 'Agency Client Operator', 'Agent App Control Room', 'Custom Agent Workcell', 'Social Commerce Inbox Operator']) {
  if (productsHtml.includes(banned)) fail('non_sellable_product_listed', { banned })
}

const privateLeakPattern = /YTF|Yangon Tyre|Plant A/i
for (const entry of ['index.html', 'products/index.html', 'contact/index.html']) {
  const html = readFileSync(resolve(staticDir, entry), 'utf8')
  const match = html.match(privateLeakPattern)
  if (match) fail('private_client_copy_leak', { entry, match: match[0] })
}

function walkHtmlFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    const fullPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return walkHtmlFiles(fullPath, nextPrefix)
    return entry.isFile() && entry.name.endsWith('.html') ? [nextPrefix] : []
  })
}

for (const entry of walkHtmlFiles(staticDir)) {
  const html = readFileSync(resolve(staticDir, entry), 'utf8')
  const staleMatch = html.match(/Product Activation|Three products\. One setup contract|Quote-ready setup|View pricing|USD\s|Demo hub|Demo center|open demos|login demos|Request quote/i)
  if (staleMatch) fail('retired_public_copy_found_anywhere', { entry, match: staleMatch[0] })
  const privateMatch = html.match(privateLeakPattern)
  if (privateMatch) fail('private_client_copy_leak_anywhere', { entry, match: privateMatch[0] })
}

// Approved product detail pages (premium per-product pages, linked from the /products/ index "See details" CTAs).
// Anything else under products/ is still rejected so no rogue/legacy subpage ships.
const allowedProductSubpages = new Set([
  'pos/index.html',
  'factory/index.html',
  'documents/index.html',
  'agents/index.html',
  'back-office/index.html',
])
const productHtmlFiles = walkHtmlFiles(resolve(staticDir, 'products'))
  .filter((entry) => entry !== 'index.html' && !allowedProductSubpages.has(entry))
if (productHtmlFiles.length) {
  fail('product_subpages_should_not_ship', { productHtmlFiles })
}

console.log('public_vercel_output=verified')
