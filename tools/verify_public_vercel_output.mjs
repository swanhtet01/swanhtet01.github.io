import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import './enforce_current_public_product_output.mjs'
import './verify_public_ai_workcell_pilot_offer_contract.mjs'

const root = process.cwd()
const outputRoot = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputRoot, 'static')
const functionsDir = resolve(outputRoot, 'functions')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

// CANON: pricing.json is the single source of truth. Build the set of allowed public MMK price strings
// so no thread can ship a price the canon doesn't sanction (owner directive 2026-06-25; see SITE-SPEC.md).
if (!existsSync(resolve(root, 'pricing.json'))) fail('missing_pricing_json')
const pricing = JSON.parse(readFileSync(resolve(root, 'pricing.json'), 'utf8'))
const canonicalMmkNumbers = new Set()
const addCanonicalMmk = (raw) => {
  for (const num of String(raw || '').match(/\d{1,3}(?:,\d{3})+/g) || []) canonicalMmkNumbers.add(num)
}
for (const service of pricing.services || []) addCanonicalMmk(service.mmk)
for (const product of pricing.products || []) for (const tier of Object.values(product.tiers || {})) addCanonicalMmk(tier)
for (const plan of pricing.care || []) addCanonicalMmk(plan.mmk) // care: not on /offers/, but allowed if shown 1:1 elsewhere

const configPath = resolve(outputRoot, 'config.json')
if (!existsSync(configPath)) fail('missing_vercel_output_config')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const routes = new Map((config.routes || []).filter((route) => route.src).map((route) => [route.src, route.dest || route.status || route.headers?.Location]))

for (const [src, dest] of [
  ['^/api/action-runner$', '/api/action-runner.js'],
  ['^/api/contact-submissions$', '/api/contact-submissions.js'],
  ['^/api/contact-submissions/status$', '/api/contact-submissions.js'],
  ['^/api/source-pack-submissions$', '/api/source-pack-submissions.js'],
  ['^/api/source-pack-submissions/status$', '/api/source-pack-submissions.js'],
  ['^/api/proof-review-submissions$', '/api/proof-review-submissions.js'],
  ['^/api/proof-review-submissions/status$', '/api/proof-review-submissions.js'],
  ['^/api/first-run-acceptance-submissions$', '/api/first-run-acceptance-submissions.js'],
  ['^/api/first-run-acceptance-submissions/status$', '/api/first-run-acceptance-submissions.js'],
  ['^/api/pilot-payment-submissions$', '/api/pilot-payment-submissions.js'],
  ['^/api/pilot-payment-submissions/status$', '/api/pilot-payment-submissions.js'],
  ['^/api/behavior-events$', '/api/behavior-events.js'],
  ['^/api/behavior-events/status$', '/api/behavior-events.js'],
  ['^/api/checkout-start$', '/api/checkout-start.js'],
  ['^/api/checkout-start/status$', '/api/checkout-start.js'],
  ['^/api/pipeline-control$', '/api/pipeline-control.js'],
  ['^/api/pipeline-control/status$', '/api/pipeline-control.js'],
]) {
  if (routes.get(src) !== dest) fail('route_contract_missing', { src, expected: dest, actual: routes.get(src) })
}

for (const [path, schedule] of [
  ['/api/cron/sales-daily', '30 2 * * *'],
  ['/api/action-runner', '*/5 * * * *'],
]) {
  const cron = (config.crons || []).find((entry) => entry.path === path)
  if (cron?.schedule !== schedule) fail('cron_contract_missing', { path, expected: schedule, actual: cron })
}

const productsRoute = (config.routes || []).find((route) => route.src === '^/products/?$')
if (productsRoute?.dest !== '/products/index.html') {
  fail('products_route_not_static_page', { expected: { dest: '/products/index.html' }, actual: productsRoute })
}
const appStartRoute = (config.routes || []).find((route) => route.src === '^/app/start/?$')
if (appStartRoute?.dest !== '/app/start/index.html') {
  fail('pilot_workspace_route_not_static_page', { expected: { dest: '/app/start/index.html' }, actual: appStartRoute })
}
const appHandoffRouteIndex = (config.routes || []).findIndex((route) => route.src === '^/(app|clients)(?:/.*)?$')
const appStartRouteIndex = (config.routes || []).findIndex((route) => route.src === '^/app/start/?$')
if (appStartRouteIndex < 0 || appHandoffRouteIndex < 0 || appStartRouteIndex > appHandoffRouteIndex) {
  fail('pilot_workspace_route_must_precede_app_handoff', { appStartRouteIndex, appHandoffRouteIndex })
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

for (const entry of ['contact-submissions.js.func', 'health.js.func', 'not-found.js.func', 'public-app-handoff.js.func']) {
  const rootPath = resolve(outputRoot, 'functions', entry)
  const apiPath = resolve(outputRoot, 'functions', 'api', entry)
  if (!existsSync(rootPath) && !existsSync(apiPath)) fail('missing_function_output', { entry })
}

for (const entry of [
  'index.html',
  'products/index.html',
  'contact/index.html',
  'app/start/index.html',
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
const aiAgentsHtml = readFileSync(resolve(staticDir, 'ai-agents/index.html'), 'utf8')
const aiWorkerGuidePath = resolve(staticDir, 'ai-agents/guide/index.html')
if (!existsSync(aiWorkerGuidePath)) fail('public_ai_worker_user_guide_missing')
const aiWorkerGuideHtml = readFileSync(aiWorkerGuidePath, 'utf8')
const operatorHtmlPath = resolve(staticDir, 'operator/index.html')
if (!existsSync(operatorHtmlPath)) fail('public_operator_console_missing')
const operatorHtml = readFileSync(operatorHtmlPath, 'utf8')
const sourcePackHtmlPath = resolve(staticDir, 'app/source-pack/index.html')
if (!existsSync(sourcePackHtmlPath)) fail('source_pack_intake_page_missing')
const sourcePackHtml = readFileSync(sourcePackHtmlPath, 'utf8')
const proofReviewHtmlPath = resolve(staticDir, 'app/proof-review/index.html')
if (!existsSync(proofReviewHtmlPath)) fail('proof_review_page_missing')
const proofReviewHtml = readFileSync(proofReviewHtmlPath, 'utf8')
const paymentProofHtmlPath = resolve(staticDir, 'app/payment-proof/index.html')
if (!existsSync(paymentProofHtmlPath)) fail('payment_proof_page_missing')
const paymentProofHtml = readFileSync(paymentProofHtmlPath, 'utf8')
const pilotWorkspaceHtmlPath = resolve(staticDir, 'app/start/index.html')
if (!existsSync(pilotWorkspaceHtmlPath)) fail('pilot_workspace_page_missing')
const pilotWorkspaceHtml = readFileSync(pilotWorkspaceHtmlPath, 'utf8')
for (const token of [
  'Private Pilot Workspace',
  'data-workspace-slug',
  'data-lead-id',
  'approval_only',
  'First run queue',
  'Client kickoff packet',
  'First production run queue',
  'Record first production run',
  'Submit first-run acceptance',
  '/api/first-run-acceptance-submissions',
  'first_run_acceptance_submitted',
  'Submitted for operator owner-acceptance review',
  'Submitting stores the first-run decision for operator review only',
  'first-run-output',
  'first-run-evidence-reference',
  'record-first-run',
  "operation: 'record_first_production_run'",
  'first_run_output_ready',
  'ready_for_owner_acceptance',
  'Copy kickoff packet',
  'Copy first run queue',
  'workspace_delivery_room_ready',
  'approval_only_until_owner_acceptance',
  'Proof-backed MRR: 0',
  'No connector writes without owner acceptance',
  '/api/pipeline-control/status',
  'recent_actions',
  'datastore_failover_report',
  'operator_runtime_summary',
  'Load operator status',
  'noindex,nofollow',
]) {
  if (!pilotWorkspaceHtml.includes(token)) fail('pilot_workspace_page_contract_missing', { token })
}
const contactFunctionPath = resolve(functionsDir, 'api/contact-submissions.js.func/api/contact-submissions.js')
if (!existsSync(contactFunctionPath)) fail('public_contact_function_missing')
const contactFunctionSource = readFileSync(contactFunctionPath, 'utf8')
for (const token of ['buildSolutionRoute', 'autopilot_solution_router', 'solution_route', 'buildImplementationBlueprintPack', 'implementation_blueprint_pack', 'buildIntakeJob', 'intake_to_first_proof', 'intake_job', 'buildClientKickoffPack', 'client_kickoff_pack', 'buildContactSourcePackRequest', 'source_pack_request_ready', 'client_source_pack_intake', 'buildOwnerOnboardingAlert', 'owner_onboarding_alert', 'ai_workcell_source_pack_room', '/app/source-pack?', 'buildFirstProofTaskPayload', 'first_proof_task', 'lead: {', 'owner approval before send/write/payment actions', 'supermega-blob-queue', 'blob_action_queue', 'New setup lead -', 'Source pack room:', 'Operator:']) {
  if (!contactFunctionSource.includes(token)) {
    fail('public_contact_proof_task_contract_missing', { token })
  }
}
const sourcePackFunctionPath = resolve(functionsDir, 'api/source-pack-submissions.js.func/api/source-pack-submissions.js')
if (!existsSync(sourcePackFunctionPath)) fail('public_source_pack_submission_function_missing')
const sourcePackFunctionSource = readFileSync(sourcePackFunctionPath, 'utf8')
for (const token of ['normalizeSourcePackSubmission', 'client_source_pack_submitted', 'client_source_pack_received', 'pending_source_review', 'publicSubmissionResponse', 'no_mrr_delta_without_payment_proof']) {
  if (!sourcePackFunctionSource.includes(token)) {
    fail('public_source_pack_submission_contract_missing', { token })
  }
}
const proofReviewFunctionPath = resolve(functionsDir, 'api/proof-review-submissions.js.func/api/proof-review-submissions.js')
if (!existsSync(proofReviewFunctionPath)) fail('public_proof_review_submission_function_missing')
const proofReviewFunctionSource = readFileSync(proofReviewFunctionPath, 'utf8')
for (const token of ['normalizeProofReviewSubmission', 'proof_review_acceptance_recorded', 'proof_review_acceptance_received', 'proof_accepted_for_scope', 'publicSubmissionResponse', 'no_mrr_delta_without_payment_proof']) {
  if (!proofReviewFunctionSource.includes(token)) {
    fail('public_proof_review_submission_contract_missing', { token })
  }
}
const firstRunAcceptanceFunctionPath = resolve(functionsDir, 'api/first-run-acceptance-submissions.js.func/api/first-run-acceptance-submissions.js')
if (!existsSync(firstRunAcceptanceFunctionPath)) fail('public_first_run_acceptance_submission_function_missing')
const firstRunAcceptanceFunctionSource = readFileSync(firstRunAcceptanceFunctionPath, 'utf8')
for (const token of ['normalizeFirstRunAcceptanceSubmission', 'first_run_acceptance_submitted', 'first_run_acceptance_received', 'client_accepted_first_run', 'publicSubmissionResponse', 'no_recurring_revenue_claim']) {
  if (!firstRunAcceptanceFunctionSource.includes(token)) {
    fail('public_first_run_acceptance_submission_contract_missing', { token })
  }
}
const pilotPaymentSubmissionFunctionPath = resolve(functionsDir, 'api/pilot-payment-submissions.js.func/api/pilot-payment-submissions.js')
if (!existsSync(pilotPaymentSubmissionFunctionPath)) fail('public_pilot_payment_submission_function_missing')
const pilotPaymentSubmissionFunctionSource = readFileSync(pilotPaymentSubmissionFunctionPath, 'utf8')
for (const token of ['normalizePilotPaymentSubmission', 'client_pilot_payment_submitted', 'client_payment_proof_received', 'pending_payment_review', 'publicSubmissionResponse', 'no_mrr_delta_without_owner_verified_payment_proof']) {
  if (!pilotPaymentSubmissionFunctionSource.includes(token)) {
    fail('public_pilot_payment_submission_contract_missing', { token })
  }
}
const actionRunnerFunctionPath = resolve(functionsDir, 'api/action-runner.js.func/api/action-runner.js')
if (!existsSync(actionRunnerFunctionPath)) fail('public_action_runner_function_missing')
const actionRunnerFunctionSource = readFileSync(actionRunnerFunctionPath, 'utf8')
for (const token of ['renderFirstProofBrief', 'dispatchDraftReply', 'first_proof_operator_brief', 'Solution route', 'solution_route_packet', 'Implementation blueprint', 'implementation_blueprint_packet', 'Client kickoff pack', 'client_kickoff_packet', 'Intake job', 'intake_job_packet', 'Source trace', 'Do not send, write, charge, or edit live business records', 'renderSalesAutopilotDraft', 'source_request_packet', 'offer_packet', 'buyer_reply_draft', 'draft_only_no_send', 'owner_approval_before_external_send', 'no_revenue_claim_without_payment_proof', 'claimPostgresBatch', 'blobStore', 'vercel_blob', 'supermega-blob-queue', 'vercel_postgres_neon']) {
  if (!actionRunnerFunctionSource.includes(token)) {
    fail('public_action_runner_first_proof_contract_missing', { token })
  }
}
const salesDailyFunctionPath = resolve(functionsDir, 'api/sales-daily.js.func/api/sales-daily.js')
if (!existsSync(salesDailyFunctionPath)) fail('public_sales_daily_function_missing')
const salesDailyFunctionSource = readFileSync(salesDailyFunctionPath, 'utf8')
for (const token of ['prepareBlobLeadAutopilot', 'fallbackLeadForRun', 'supermega-blob-queue', 'queue_adapter', 'blocked_until_owner_approval']) {
  if (!salesDailyFunctionSource.includes(token)) {
    fail('public_sales_daily_blob_queue_contract_missing', { token })
  }
}
const pipelineControlFunctionPath = resolve(functionsDir, 'api/pipeline-control.js.func/api/pipeline-control.js')
if (!existsSync(pipelineControlFunctionPath)) fail('public_pipeline_control_function_missing')
const pipelineControlFunctionSource = readFileSync(pipelineControlFunctionPath, 'utf8')
for (const token of ['PUBLIC_WORKSPACE_BASE_URL', 'https://supermega.dev', '/app/start?', 'paymentProofUrl', '/app/payment-proof?', 'client_pilot_payment_submission', 'client_payment_proof_url', 'reconcileClientPaymentSubmission', 'reconcile_client_payment_submission', 'client_payment_submission_reconciled']) {
  if (!pipelineControlFunctionSource.includes(token)) {
    fail('public_pipeline_workspace_url_contract_missing', { token })
  }
}
for (const token of ['firstProofPacket', 'first_proof', 'operator_brief_ready', 'starter_kit_url', 'solution_route_packet', 'solution_route_json', 'implementation_blueprint_packet', 'implementation_blueprint_json', 'intake_job_packet', 'intake_job_json', 'client_kickoff_packet', 'client_kickoff_json', 'buyer_reply_draft', 'proof_delivery_packet', 'pilot_close_packet', 'pilot_order_room', 'private_workspace_manifest', 'first_run_acceptance', 'client_first_run_acceptance', 'owner_acceptance', 'connector_policy', 'production_approval_queue', 'enterprise_delivery_pack', 'customer_success_desk', 'retainer_growth_offer', 'retainer_payment_record', 'recordRetainerPaymentProof', 'record_retainer_payment_proof', 'revenueProofBoard', 'revenue_proof_board', 'autopilotCommandBoard', 'autopilot_command_board', 'autopilot_command_count', 'autopilot_draft', 'autopilot_draft_approval', 'autopilotApprovalLedgerStatus', 'writeAutopilotApprovalLedger', 'readAutopilotApprovalLedger', 'blobPipelineControlPayload', 'updateBlobOrderRoomState', 'startBlobPrivateWorkspace', 'blob_action_queue', 'approval_ledger', 'vercel_blob', 'buildDatastoreFailoverReport', 'datastore_failover_report', 'operatorRuntimeSummary', 'operator_runtime_summary', 'blob_queue_approval_only', 'zero_until_payment_proof', 'autopilotDraftFromPayload', 'sendAutopilotDraftApprovalEmail', 'email_fallback', 'recordAutopilotDraftApproval', 'record_autopilot_draft_approval', 'autopilot_draft_packet', 'source_request_packet', 'offer_packet', 'buyer_reply_draft', 'command_queue_csv', 'operator_brief_markdown', 'approval_gated_autopilot', 'internal_drafts_allowed_external_actions_blocked_until_owner_approval', 'proof_backed_mrr_mmk', 'bank_verified_mrr_mmk', 'bank_unverified_mrr_mmk', 'payment_ledger_csv', 'next_cash_actions_csv', 'drafts_and_offers_do_not_count_as_mrr', 'prepareRetainerGrowthOffer', 'prepare_retainer_growth_offer', 'prepareCustomerSuccessDesk', 'prepare_customer_success_desk', 'prepareEnterpriseDeliveryPack', 'prepare_enterprise_delivery_pack', 'prepareProductionApprovalQueue', 'prepare_production_approval_queue', 'recordConnectorPolicy', 'record_connector_policy', 'recordOwnerAcceptance', 'record_owner_acceptance', 'prepareFirstRunAcceptance', 'prepare_first_run_acceptance', 'startPrivateWorkspace', 'start_private_workspace', 'updateOrderRoomState', 'update_order_room']) {
  if (!pipelineControlFunctionSource.includes(token)) {
    fail('public_pipeline_control_first_proof_contract_missing', { token })
  }
}
for (const token of [
  'submittedSourcePackFromRow',
  'submittedSourcePackHasSources',
  'prepareFirstProofFromSubmittedSourcePack',
  'prepare_first_proof_from_submitted_source_pack',
  'first_proof_prepared_from_submitted_pack',
  'client_source_pack_submission_required',
]) {
  if (!pipelineControlFunctionSource.includes(token)) {
    fail('public_pipeline_control_submitted_source_pack_to_proof_contract_missing', { token })
  }
}
for (const token of [
  'buildSourcePackRequestApprovalRecord',
  'sourcePackRequestFromPayload',
  'recordSourcePackRequestApproval',
  'record_source_pack_request_approval',
  'source_pack_request_approval',
  'source_request_approved_manual_send_only',
  'approved_for_manual_owner_send',
  'no_client_request_from_runner',
  'pipelineActionsResultColumnStatus',
  'pipelineActionResultSelect',
]) {
  if (!pipelineControlFunctionSource.includes(token)) {
    fail('public_pipeline_control_source_request_approval_contract_missing', { token })
  }
}
for (const token of [
  '<title>SUPERMEGA.dev - Free core tools, premium AI workers</title>',
  'Free core tools. Premium AI workers.',
  'Agent crews',
  'Digital workers',
  'sm_worker_continue_state',
  'data-local-worker-continue',
  'Browser-local continuation',
  'No source files, typed business text, credentials, or payment data are stored',
  'supermegaRememberWorker',
  'sm_worker_role_mode',
  'data-role-mode-panel',
  'Role-aware onboarding',
  'supermegaSetRoleMode',
  'user_role_mode',
  'sm_worker_device_mode',
  'data-device-mode-panel',
  'Device-aware onboarding',
  'supermegaDetectDeviceMode',
  'user_device_mode',
  'sm_adaptive_setup_plan',
  'data-adaptive-setup-plan',
  'Adaptive setup plan',
  'supermegaAdaptiveSetupPlan',
  'adaptive_plan_summary',
  'sm_adaptive_source_pack',
  'data-adaptive-source-pack',
  'Source pack checklist',
  'supermegaAdaptiveSourcePack',
  'source_pack_required',
  'sm_adaptive_proof_plan',
  'data-adaptive-proof-plan',
  'First proof planner',
  'supermegaAdaptiveProofPlan',
  'proof_plan_milestones',
  'sm_adaptive_value_plan',
  'data-adaptive-value-plan',
  'Value proof plan',
  'supermegaAdaptiveValuePlan',
  'value_plan_metrics',
  'no_revenue_claim_without_payment_proof',
  'sm_adaptive_pilot_plan',
  'data-adaptive-pilot-plan',
  'Paid pilot close plan',
  'supermegaAdaptivePilotPlan',
  'pilot_plan_next_action',
  'payment_proof_required_before_workspace_or_mrr',
]) {
  if (!homeHtml.includes(token)) fail('public_shell_contract_missing', { token })
}
for (const token of [
  'General AI Worker Toolkit',
  'Pick one reusable worker and prove it on real sources.',
  '/ai-agents/guide/',
  'Adaptive Worker Matcher',
  'data-worker-router',
  'data-router-result',
  'data-router-choice="sales-follow-up"',
  'data-router-choice="pdfs-docs"',
  'data-router-choice="proposal"',
  'Recommended first worker',
  'supermegaTrackBehavior',
  'adaptive_worker_matcher_result',
  'is-router-match',
  'privacy-light first-party events',
  'Document / PDF Intake Ledger',
  'CRM Follow-up &amp; Pipeline Assistant',
  'Proposal &amp; SOW Builder',
  'Sellable tool ladder',
  'Free core',
  'Paid pilot',
  'Premium maintained',
  'Gated hands',
  'data-worker-entitlements',
  'entitlement_free_core',
  'entitlement_paid_pilot',
  'entitlement_premium',
  'entitlement_gated_hands',
  'Owner-approved computer-use or mobile actions only',
  '/api/behavior-events',
]) {
  if (!aiAgentsHtml.includes(token)) fail('public_ai_agents_sellable_toolkit_contract_missing', { token })
}
for (const token of [
  'AI worker user guide',
  'Use any worker in four steps.',
  'Mobile, tablet, and desktop.',
  'Connector setup rules.',
  'Behavior adaptation loop',
  'no external sends, writes, payments, or browser/mobile actions without owner approval',
  'Computer-use and mobile workers are available only as gated workcells',
  'data-ai-worker-user-guide',
  'data-role-mode-guide',
  'data-device-mode-guide',
  'data-adaptive-plan-guide',
  'data-source-pack-guide',
  'data-proof-plan-guide',
  'data-value-plan-guide',
  'data-pilot-plan-guide',
  'Owner mode',
  'Operator mode',
  'Technical admin mode',
  'Phone mode',
  'Tablet mode',
  'Desktop mode',
  'The next step changes with the user.',
  'worker ID, plan summary, next step, and page path',
  'Send the smallest approved source pack.',
  'No secrets first',
  'Prove value before production.',
  'Day 7 acceptance gate',
  'Prove value before retainer.',
  'No revenue claim without payment proof',
  'Time saved',
  'Risk removed',
  'Cash follow-up',
  'Close paid pilot after proof.',
  'Free proof',
  'Paid pilot',
  'Payment proof',
  'no workspace, retainer, or MRR before payment proof',
  'Entitlement ladder',
  'Free core stays deterministic',
  'Premium maintained adds monitoring, connectors, scheduled runs, and support',
  'Gated hands require consent, vaulting, audit logs, and owner approval',
]) {
  if (!aiWorkerGuideHtml.includes(token)) fail('public_ai_worker_user_guide_contract_missing', { token })
}
for (const token of [
  '<title>Products | SUPERMEGA.dev</title>',
  'Factory & Operations App',
  'Custom Solutions & AI Agents',
  '/products/factory/',
  '/products/pos/',
]) {
  if (!productsHtml.includes(token)) fail('public_products_contract_missing', { token })
}
const checkoutFunctionPath = resolve(functionsDir, 'api/checkout-start.js.func/api/checkout-start.js')
if (!existsSync(checkoutFunctionPath)) fail('public_checkout_function_missing')
const checkoutFunctionSource = readFileSync(checkoutFunctionPath, 'utf8')
for (const token of ['2,500,000 MMK', '8,000,000 MMK', '11,000,000 MMK', 'Custom Solutions & AI Agents', 'DeskPOS']) {
  if (!checkoutFunctionSource.includes(token)) {
    fail('public_checkout_mmk_contract_missing', { token })
  }
}
for (const retired of ['USD ', '$1', 'Custom Workflow App']) {
  if (checkoutFunctionSource.includes(retired)) {
    fail('public_checkout_retired_pricing_or_product_found', { retired })
  }
}
for (const token of [
  'noindex,nofollow',
  'Operator Console',
  'id="ops-key"',
  'Load sample proof',
  'samplePipelineData',
  'No lead was created',
  '/api/pipeline-control/status',
  '/api/action-runner',
  'first_proof',
  'Run queue now',
  'Open starter kit',
  'Copy solution route',
  'Copy implementation blueprint',
  'Copy intake job',
  'Copy kickoff pack',
  'Copy buyer reply',
  'Copy proof packet',
  'Copy pilot packet',
  'Paid pilot order room',
  'Client payment proof link',
  'Copy client payment link',
  'Client payment proof submission',
  'Copy client payment proof',
  'client_pilot_payment_submission',
  'Reconcile client payment + create workspace',
  'data-client-payment-reconcile',
  'reconcile_client_payment_submission',
  'Copy payment request',
  'Copy payment ledger',
  'Copy order ledger',
  'Copy pilot start checklist',
  'Copy owner activation packet',
  'Copy owner action queue',
  'Copy activation JSON',
  'Copy workspace manifest',
  'Copy workspace handoff',
  'Copy first run queue',
  'Create private workspace',
  'startPrivateWorkspace',
  'Prepare first-run acceptance',
  'prepareFirstRunAcceptance',
  'Record owner accepted',
  'Record changes requested',
  'Owner acceptance evidence',
  'data-owner-acceptance-reference-for',
  'owner_acceptance_reference',
  'Client first-run acceptance',
  'Record connector policy',
  'Connector policy evidence',
  'data-connector-policy-reference-for',
  'connector_policy_reference',
  'Prepare autopilot approval queue',
  'Production approval queue evidence',
  'data-production-queue-reference-for',
  'production_queue_reference',
  'Prepare enterprise delivery pack',
  'Prepare customer success desk',
  'Prepare retainer growth offer',
  'Record retainer payment proof',
  'recordOwnerAcceptance',
  'recordConnectorPolicy',
  'prepareProductionApprovalQueue',
  'prepareEnterpriseDeliveryPack',
  'prepareCustomerSuccessDesk',
  'prepareRetainerGrowthOffer',
  'recordRetainerPaymentProof',
  'private_workspace_manifest',
  'customer_success_desk',
  'retainer_growth_offer',
  'retainer_payment_record',
  'Autopilot command board',
  'renderAutopilotCommandBoard',
  'autopilot-command-board',
  'action queue',
  'blob_action_queue',
  'Approval fallback ledger',
  'approval-ledger',
  'approval ledger',
  'autopilot_command_board',
  'approval_gated_autopilot',
  'Copy autopilot command queue',
  'Copy autopilot daily brief',
  'autopilot_command_count',
  'Autopilot draft artifact',
  'salesAutopilotDraft',
  'operator-sales-draft',
  'Copy autopilot draft',
  'Approve autopilot draft',
  'Request draft changes',
  'recordAutopilotDraftApproval',
  'data-autopilot-draft-type',
  'autopilot_draft_packet',
  'source_request_packet',
  'sales-autopilot-draft',
  'Revenue proof board',
  'renderRevenueProofBoard',
  'revenue-proof-board',
  'Behavior summary',
  'renderBehaviorSummaryBoard',
  'behavior-summary-board',
  '/api/behavior-events?summary=1',
  'behavior_summary',
  'sellable_tool_recommendations',
  'Sellable tools to push',
  'free_core_tool',
  'premium_upgrade',
  'proof_metric',
  'entitlement_ladder',
  'next_entitlement_offer',
  'Gated hands',
  'user_adaptation_segments',
  'User adaptation segments',
  'recommended_ui_adaptation',
  'Adaptation queue',
  'Top templates',
  'operator_summary_no_ip_user_agent_or_raw_payloads',
  'Datastore failover report',
  'renderDatastoreFailoverReport',
  'datastore-failover-report',
  'blob_queue_approval_only',
  'zero_until_payment_proof',
  'client onboarding allowed',
  'Activation cockpit',
  'renderActivationCockpit',
  'activationTargetAction',
  'activationStepState',
  'runActivationStep',
  'operator-activation-cockpit',
  'data-activation-command',
  'One-click activation runbook',
  'payment_proof_gate',
  'workspace_start_gate',
  'customer_success_gate',
  'retainer_gate',
  'revenue_proof_board',
  'Proof-backed MRR',
  'Bank verified',
  'Needs bank check',
  'Copy revenue payment ledger',
  'Copy next cash actions',
  'proof_backed_mrr_mmk',
  'bank_unverified_mrr_mmk',
  'Copy customer success desk',
  'Copy support ticket queue',
  'Copy customer value ledger',
  'Copy renewal queue',
  'Copy client update draft',
  'Copy retainer growth offer',
  'Copy retainer options',
  'Copy retainer decision ledger',
  'Copy next module roadmap',
  'Copy retainer invoice draft',
  'Copy retainer email draft',
  'Copy retainer payment record',
  'Copy retainer payment ledger',
  'Copy MRR summary',
  'Save scope approval',
  'Save payment proof',
  'persistOrderRoomState',
  'proofBuyerReply',
  'proofSolutionRoute',
  'proofImplementationBlueprint',
  'proofIntakeJob',
  'proofClientKickoff',
  'proofDeliveryPacket',
  'pilotClosePacket',
  'pilotOrderRoom',
  "proofList('Checklist'",
  "proofList('Acceptance tests'",
]) {
  if (!operatorHtml.includes(token)) fail('public_operator_console_contract_missing', { token })
}
for (const token of [
  'Approve source request',
  'Request source changes',
  'data-source-pack-request-decision',
  'recordSourcePackRequestDecision',
  'record_source_pack_request_approval',
  'source_pack_request_reference',
  'source_pack_request_packet',
]) {
  if (!operatorHtml.includes(token)) fail('public_operator_source_request_approval_contract_missing', { token })
}
for (const token of [
  'Attach submitted pack + prepare proof',
  'data-submitted-source-pack-proof',
  'prepareFirstProofFromSubmittedSourcePack',
  'prepare_first_proof_from_submitted_source_pack',
  'preparing_first_proof_from_submitted_source_pack',
]) {
  if (!operatorHtml.includes(token)) fail('public_operator_submitted_source_pack_to_proof_contract_missing', { token })
}
for (const token of [
  'Submit source pack',
  '/api/source-pack-submissions',
  'client_source_pack_submitted',
  'Submitted for operator review',
  'Submitting stores the pack for operator review only',
]) {
  if (!sourcePackHtml.includes(token)) fail('public_source_pack_intake_submit_contract_missing', { token })
}
for (const token of [
  'Submit proof review',
  '/api/proof-review-submissions',
  'proof_review_acceptance_recorded',
  'Submitted for operator review',
  'Submitting stores the proof review for operator review only',
]) {
  if (!proofReviewHtml.includes(token)) fail('public_proof_review_submit_contract_missing', { token })
}
for (const token of [
  'Submit payment proof',
  '/api/pilot-payment-submissions',
  'client_pilot_payment_submitted',
  'Submitted for operator reconciliation',
  'Submitting stores the payment proof for operator reconciliation only',
]) {
  if (!paymentProofHtml.includes(token)) fail('public_payment_proof_submit_contract_missing', { token })
}
const publicAgentTemplateContract = [
  ['deskpos-quickstart', 'DeskPOS Quickstart'],
  ['chat-ledger', 'Viber / WhatsApp Business Ledger'],
  ['inbox-calendar-operator', 'Inbox & Calendar Operator'],
  ['daily-intelligence-brief', 'Daily Intelligence Brief Agent'],
  ['factory-ops-ledger', 'Factory Ops Ledger'],
  ['data-clean-report-agent', 'Data Cleanup & Reporting Agent'],
  ['document-pdf-intake-ledger', 'Document / PDF Intake Ledger'],
  ['crm-follow-up-pipeline-assistant', 'CRM Follow-up & Pipeline Assistant'],
  ['proposal-sow-builder', 'Proposal & SOW Builder'],
]
const htmlEscaped = (value) => String(value).replace(/&/g, '&amp;')
const starterKitIndexPath = resolve(staticDir, 'site/agent-templates/index.json')
if (!existsSync(starterKitIndexPath)) fail('public_agent_template_starter_index_missing')
const starterKitIndex = JSON.parse(readFileSync(starterKitIndexPath, 'utf8'))
if (!Array.isArray(starterKitIndex.templates) || starterKitIndex.templates.length !== publicAgentTemplateContract.length) {
  fail('public_agent_template_starter_index_wrong_size', { count: starterKitIndex.templates?.length })
}
const starterPageIndexPath = resolve(staticDir, 'agent-templates/index.html')
if (!existsSync(starterPageIndexPath)) fail('public_agent_template_page_index_missing')
const starterPageIndexHtml = readFileSync(starterPageIndexPath, 'utf8')
if (!starterPageIndexHtml.includes('AI agent setup kits') || !starterPageIndexHtml.includes('Start from a working template.')) {
  fail('public_agent_template_page_index_contract_missing')
}
if (!starterPageIndexHtml.includes('/ai-agents/guide/')) {
  fail('public_agent_template_page_index_guide_link_missing')
}
const sitemapHtml = readFileSync(resolve(staticDir, 'sitemap.xml'), 'utf8')
if (!sitemapHtml.includes('https://supermega.dev/ai-agents/guide/')) {
  fail('public_ai_worker_user_guide_sitemap_missing')
}
for (const [id, name] of publicAgentTemplateContract) {
  if (!productsHtml.includes(id) || (!productsHtml.includes(name) && !productsHtml.includes(htmlEscaped(name)))) {
    fail('public_agent_template_missing_from_products', { id, name })
  }
  if (!aiWorkerGuideHtml.includes(id) || (!aiWorkerGuideHtml.includes(name) && !aiWorkerGuideHtml.includes(htmlEscaped(name)))) {
    fail('public_ai_worker_user_guide_template_missing', { id, name })
  }
  if (!sitemapHtml.includes(`https://supermega.dev/agent-templates/${id}/`)) {
    fail('public_agent_template_sitemap_missing', { id })
  }
  if (!contactHtml.includes(id)) {
    fail('public_agent_template_missing_from_contact_router', { id })
  }
  const starterJsonPath = resolve(staticDir, 'site/agent-templates', `${id}.json`)
  const starterMarkdownPath = resolve(staticDir, 'site/agent-templates', `${id}.md`)
  const starterPagePath = resolve(staticDir, 'agent-templates', id, 'index.html')
  const starterSetupPath = resolve(staticDir, 'agent-templates', id, 'setup', 'index.html')
  if (!existsSync(starterJsonPath) || !existsSync(starterMarkdownPath)) {
    fail('public_agent_template_starter_missing', { id })
  }
  if (!existsSync(starterPagePath)) {
    fail('public_agent_template_page_missing', { id })
  }
  if (!existsSync(starterSetupPath)) {
    fail('public_agent_template_setup_page_missing', { id })
  }
  const starter = JSON.parse(readFileSync(starterJsonPath, 'utf8'))
  const starterPageHtml = readFileSync(starterPagePath, 'utf8')
  const starterSetupHtml = readFileSync(starterSetupPath, 'utf8')
  if (
    starter.id !== id ||
    !Array.isArray(starter.first_run_workflow) ||
    starter.first_run_workflow.length < 4 ||
    !Array.isArray(starter.acceptance_tests) ||
    starter.acceptance_tests.length < 4 ||
    !Array.isArray(starter.adaptation_signals) ||
    starter.adaptation_signals.length < 4 ||
    !starter.role_playbook?.owner?.first_action ||
    !starter.role_playbook?.operator?.approval_focus ||
    !starter.role_playbook?.technical_admin?.success_signal ||
    starter.contact_url !== `/contact/?template=${id}` ||
    starter.setup_url !== `/agent-templates/${id}/setup/`
  ) {
    fail('public_agent_template_starter_contract_missing', { id })
  }
  if (!starterPageHtml.includes(name) && !starterPageHtml.includes(htmlEscaped(name))) {
    fail('public_agent_template_page_contract_missing', { id, name })
  }
  if (!starterPageHtml.includes('/ai-agents/guide/') || !starterSetupHtml.includes('/ai-agents/guide/')) {
    fail('public_agent_template_guide_link_missing', { id })
  }
  for (const token of ['Role playbook', 'data-role-playbook="owner"', 'data-role-playbook="operator"', 'data-role-playbook="technical_admin"']) {
    if (!starterPageHtml.includes(token) || !starterSetupHtml.includes(token)) {
      fail('public_agent_template_role_playbook_missing', { id, token })
    }
  }
  for (const token of [
    'data-agent-template-setup',
    '/api/contact-submissions',
    `name="template_id" value="${id}"`,
    'name="starter_kit_url"',
    'name="user_role_mode"',
    'name="user_role_label"',
    'name="user_device_mode"',
    'name="user_device_label"',
    'name="adaptive_worker_id"',
    'name="adaptive_plan_summary"',
    'name="adaptive_next_step"',
    'name="adaptive_user_path"',
    'name="source_pack_required"',
    'name="source_pack_samples"',
    'name="source_pack_first_proof"',
    'name="source_pack_readiness"',
    'name="proof_plan_worker_id"',
    'name="proof_plan_summary"',
    'name="proof_plan_milestones"',
    'name="proof_plan_metrics"',
    'name="proof_plan_gate"',
    'name="value_plan_worker_id"',
    'name="value_plan_summary"',
    'name="value_plan_metrics"',
    'name="value_plan_evidence"',
    'name="value_plan_gate"',
    'name="pilot_plan_worker_id"',
    'name="pilot_plan_summary"',
    'name="pilot_plan_scope"',
    'name="pilot_plan_next_action"',
    'name="pilot_plan_gate"',
    'name="first_proof_target"',
    'name="acceptance_tests"',
    'name="intake_job_mode" value="intake_to_first_proof"',
    'name="kickoff_pack_mode" value="client_kickoff_pack"',
    'name="first_run_mode" value="approval_only"',
    'Kickoff pack',
    'Queued job',
    'Send setup request',
    'first-proof build',
  ]) {
    if (!starterSetupHtml.includes(token)) {
      fail('public_agent_template_setup_contract_missing', { id, token })
    }
  }
}
for (const token of ['AI agent templates', 'View setup kit', 'name="template_id"', 'name="starter_kit_url"', "search.get('template')", '/site/agent-templates/daily-intelligence-brief.json', '/agent-templates/daily-intelligence-brief/setup/']) {
  if (!productsHtml.includes(token) && !contactHtml.includes(token)) {
    fail('public_agent_template_contract_missing', { token })
  }
}
const behaviorFunctionPath = resolve(functionsDir, 'api/behavior-events.js.func/api/behavior-events.js')
if (!existsSync(behaviorFunctionPath)) fail('public_behavior_events_function_missing')
const behaviorFunctionSource = readFileSync(behaviorFunctionPath, 'utf8')
for (const token of [
  'supermega_behavior_events',
  'savePostgresBehaviorEvent',
  'behaviorSummary',
  'buildAdaptationQueue',
  'buildSellableToolRecommendations',
  'sellable_tool_recommendations',
  'free_core_tool',
  'premium_upgrade',
  'proof_metric',
  'buildUserAdaptationSegments',
  'user_adaptation_segments',
  'user_role_mode',
  'user_device_mode',
  'aggregate_role_device_only_no_keystrokes_or_source_content',
  'requireOpsAuth',
  'SUPERMEGA_OPS_KEY',
  'vercel_postgres_neon',
  'summary_endpoint',
  'summary_auth',
  'operator_summary_no_ip_user_agent_or_raw_payloads',
  'page_viewed',
  'cta_clicked',
  'template_clicked',
  'setup_started',
  'lead_form_submitted',
  'coarse_first_party_event_no_keystrokes_no_source_files_no_credentials',
]) {
  if (!behaviorFunctionSource.includes(token)) fail('public_behavior_events_contract_missing', { token })
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
  // Every public "N,NNN,NNN MMK" price string MUST be a canonical value from pricing.json.
  for (const priceMatch of html.match(/\d{1,3}(?:,\d{3})+\s*MMK/g) || []) {
    const num = priceMatch.match(/\d{1,3}(?:,\d{3})+/)?.[0]
    if (num && !canonicalMmkNumbers.has(num)) {
      fail('non_canonical_mmk_price', { entry, price: priceMatch, allowed: [...canonicalMmkNumbers] })
    }
  }
  // CANON GUARDRAIL (owner directive 2026-06-25): NO USD/$ price strings on ANY public surface — MMK only.
  // This is the guard that was missing when /offers/ silently regressed to "$600 / $1,500 …". A dollar sign
  // followed by a digit ($600, $1,500, $200–400) is a price and must never ship. MMK-only, always.
  const dollarPriceMatch = html.match(/\$\s?\d/)
  if (dollarPriceMatch) {
    const at = html.indexOf(dollarPriceMatch[0])
    fail('usd_dollar_price_found', { entry, context: html.slice(Math.max(0, at - 15), at + 20) })
  }
  // Also ban the literal "USD" token on public marketing surfaces — the "$\d" guard alone missed
  // "...bank transfer (MMK or USD)." because there was no digit. Machine ops page is exempt (it
  // surfaces an internal "Real MRR: USD 0" line, not a public price).
  if (entry !== 'machine/index.html') {
    const usdWord = html.match(/\bUSD\b/)
    if (usdWord) {
      const at = html.search(/\bUSD\b/)
      fail('usd_word_found', { entry, context: html.slice(Math.max(0, at - 20), at + 12) })
    }
  }
  // No Starter/Pro/Operator pricing-tier naming on the /offers/ pricing surface (canon: 2 honest tiers, no
  // such names). Scoped to /offers/ so legitimate product copy/labels elsewhere ("Operator tablet flows",
  // the "Operator Builder" screenshot label) aren't flagged — /offers/ carries no such product labels.
  if (entry === 'offers/index.html') {
    const tierNameMatch = html.match(/\b(Starter|Operator)\b/)
    if (tierNameMatch) fail('retired_pricing_tier_name', { entry, match: tierNameMatch[0] })
  }
}

// Approved product detail pages (premium per-product pages, linked from the /products/ index "See details" CTAs).
// Anything else under products/ is still rejected so no rogue/legacy subpage ships.
const allowedProductSubpages = new Set([
  'pos/index.html',
  'factory/index.html',
  'documents/index.html',
  'back-office/index.html',
])
const productHtmlFiles = walkHtmlFiles(resolve(staticDir, 'products'))
  .filter((entry) => entry !== 'index.html' && !allowedProductSubpages.has(entry))
if (productHtmlFiles.length) {
  fail('product_subpages_should_not_ship', { productHtmlFiles })
}

console.log('public_vercel_output=verified')
