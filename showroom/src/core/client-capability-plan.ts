import type { ClientDemoBlueprint, ClientSolutionId } from './client-onboarding.ts'

export const CLIENT_CAPABILITY_PLAN_SCHEMA = 'supermega.client_capability_plan.v2' as const

export type ClientCapabilityPhaseId = 'prove' | 'control' | 'scale'
export type ClientCapabilityDelivery = 'demo' | 'configure' | 'roadmap'
export type ClientCapabilityDomain =
  | 'operations'
  | 'master-data'
  | 'finance'
  | 'customer'
  | 'supply-chain'
  | 'quality'
  | 'workforce'
  | 'governance'
  | 'intelligence'
  | 'integration'

export type ClientCapability = {
  id: string
  product: ClientSolutionId
  phase: ClientCapabilityPhaseId
  delivery: ClientCapabilityDelivery
  domain: ClientCapabilityDomain
  label: string
  outcome: string
  records: readonly string[]
  roles: readonly string[]
  dependsOn: readonly string[]
  proofPath?: string
}

export type ClientPlatformCapability = Omit<ClientCapability, 'product'>

export type ClientCapabilityPlan = {
  schema: typeof CLIENT_CAPABILITY_PLAN_SCHEMA
  generatedAt: string
  workspace: string
  presetId: ClientDemoBlueprint['client']['presetId']
  products: Array<{ product: ClientSolutionId; label: string; templateId: string }>
  sharedControls: readonly string[]
  platformCapabilities: ClientPlatformCapability[]
  phases: Array<{
    id: ClientCapabilityPhaseId
    label: string
    outcome: string
    capabilities: ClientCapability[]
  }>
  summary: {
    demoReady: number
    configureNext: number
    scaleLater: number
    sharedPlatform: number
    total: number
  }
  controls: {
    roadmapOnly: true
    humanReviewRequired: true
    externalWritesPerformed: false
    capabilityPresenceMustBeVerified: true
    noPlaceholderModules: true
  }
}

const phaseDetails: Record<ClientCapabilityPhaseId, { label: string; outcome: string }> = {
  prove: { label: '1. Prove', outcome: 'Run complete day-one workflows with reviewable records and evidence.' },
  control: { label: '2. Control', outcome: 'Add master data, approvals, exceptions, accounting, and ownership.' },
  scale: { label: '3. Scale', outcome: 'Expand entities, automation, intelligence, and integrations safely.' },
}

const sharedControls = [
  'Managed identity and least-privilege roles',
  'One organization, location, currency, and timezone foundation',
  'Human approval for consequential actions',
  'Immutable evidence and operational audit trail',
  'Versioned imports, recovery, and rollback proof',
  'Cross-product record IDs and event contracts',
  'Idempotent commands and optimistic concurrency',
  'Myanmar and English localization boundaries',
] as const

const platformCatalog: readonly ClientPlatformCapability[] = [
  { id: 'platform-operating-foundation', phase: 'prove', delivery: 'demo', domain: 'master-data', label: 'Organization and location foundation', outcome: 'Use one verified company, operating unit, location, currency, locale, and timezone across every selected product.', records: ['organization', 'operating_unit', 'location', 'localization_policy'], roles: ['Founder', 'System administrator'], dependsOn: [] },
  { id: 'platform-identity', phase: 'prove', delivery: 'demo', domain: 'governance', label: 'Identity and role boundaries', outcome: 'Separate viewer, operator, approver, administrator, and service identities with least privilege.', records: ['identity', 'role', 'permission', 'session'], roles: ['System administrator', 'Security owner'], dependsOn: ['platform-operating-foundation'] },
  { id: 'platform-approval', phase: 'prove', delivery: 'demo', domain: 'governance', label: 'Approval and command control', outcome: 'Bind consequential commands to a named actor, reason, evidence, expected revision, and review decision.', records: ['command', 'approval', 'decision_packet'], roles: ['Operator', 'Approver'], dependsOn: ['platform-identity'] },
  { id: 'platform-audit', phase: 'prove', delivery: 'demo', domain: 'governance', label: 'Audit and evidence ledger', outcome: 'Retain append-only behavior, command, approval, and export evidence without exposing secrets.', records: ['audit_event', 'evidence_reference', 'artifact_digest'], roles: ['Auditor', 'Operations manager'], dependsOn: ['platform-approval'] },
  { id: 'platform-master-data', phase: 'control', delivery: 'configure', domain: 'master-data', label: 'Shared master data governance', outcome: 'Govern customer, supplier, item, unit, location, tax, account, and owner records once.', records: ['customer', 'supplier', 'item', 'unit', 'tax_code', 'account_code'], roles: ['Master data owner', 'Finance manager'], dependsOn: ['platform-operating-foundation', 'platform-approval'] },
  { id: 'platform-data-migration', phase: 'control', delivery: 'configure', domain: 'integration', label: 'Migration and reconciliation workbench', outcome: 'Map CSV data, quarantine errors, dry-run changes, reconcile totals, and retain a rollback package.', records: ['import_job', 'mapping', 'quarantine_row', 'reconciliation'], roles: ['Implementation lead', 'Data steward'], dependsOn: ['platform-master-data', 'platform-audit'] },
  { id: 'platform-financial-control', phase: 'control', delivery: 'configure', domain: 'finance', label: 'Financial posting contract', outcome: 'Produce balanced, reviewable subledger packets for sales, purchasing, stock, tax, refunds, and production variance.', records: ['journal_packet', 'posting_rule', 'fiscal_period', 'reconciliation'], roles: ['Accountant', 'Finance approver'], dependsOn: ['platform-master-data', 'platform-audit'] },
  { id: 'platform-event-backbone', phase: 'control', delivery: 'configure', domain: 'integration', label: 'Integration and event backbone', outcome: 'Exchange versioned, idempotent events while preserving one authority for each business record.', records: ['event', 'outbox', 'inbox', 'integration_receipt'], roles: ['Integration owner', 'System administrator'], dependsOn: ['platform-audit', 'platform-master-data'] },
  { id: 'platform-multi-entity', phase: 'scale', delivery: 'roadmap', domain: 'governance', label: 'Multi-entity and policy inheritance', outcome: 'Operate companies, branches, plants, brands, and fiscal boundaries with scoped policies and consolidation.', records: ['legal_entity', 'business_unit', 'policy', 'consolidation_group'], roles: ['Group administrator', 'Finance director'], dependsOn: ['platform-financial-control', 'platform-identity'] },
  { id: 'platform-intelligence', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'Governed AI decision support', outcome: 'Generate explainable recommendations from approved data, with confidence, source evidence, cost limits, and human action gates.', records: ['recommendation', 'model_run', 'evaluation', 'decision'], roles: ['Process owner', 'AI governance owner'], dependsOn: ['platform-event-backbone', 'platform-audit'] },
  { id: 'platform-observability', phase: 'scale', delivery: 'roadmap', domain: 'governance', label: 'Security, reliability, and observability', outcome: 'Monitor service health, latency, authorization failures, queue age, data drift, backups, and recovery objectives.', records: ['health_check', 'security_event', 'backup', 'recovery_test'], roles: ['Security owner', 'Reliability owner'], dependsOn: ['platform-event-backbone', 'platform-identity'] },
  { id: 'platform-analytics', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'Semantic metrics and planning', outcome: 'Define governed KPIs once and trace every dashboard number back to authoritative operational records.', records: ['metric_definition', 'fact', 'dimension', 'plan', 'forecast'], roles: ['Business analyst', 'Executive owner'], dependsOn: ['platform-financial-control', 'platform-event-backbone'] },
] as const

const catalog: Record<ClientSolutionId, readonly Omit<ClientCapability, 'product'>[]> = {
  commerce: [
    { id: 'shop-catalog-stock', phase: 'prove', delivery: 'demo', domain: 'master-data', label: 'Catalog and stock', outcome: 'Import SKUs, prices, opening stock, and reorder thresholds with revision proof.', records: ['item', 'catalog_revision', 'stock_balance'], roles: ['Shop operator', 'Inventory owner'], dependsOn: ['platform-operating-foundation'], proofPath: '/shop/?tab=inventory' },
    { id: 'shop-order-to-cash', phase: 'prove', delivery: 'demo', domain: 'operations', label: 'Order to cash', outcome: 'Create, reserve, fulfil, reconcile payment, and close a customer order.', records: ['order', 'reservation', 'payment_reconciliation', 'fulfilment'], roles: ['Cashier', 'Order owner'], dependsOn: ['shop-catalog-stock'], proofPath: '/shop/?tab=counter' },
    { id: 'shop-channel-intake', phase: 'prove', delivery: 'demo', domain: 'customer', label: 'Omnichannel order review', outcome: 'Normalize counter, website, ecommerce, phone, and social requests before confirmation.', records: ['channel_request', 'order_draft', 'conversion_receipt'], roles: ['Sales operator', 'Order approver'], dependsOn: ['shop-catalog-stock'], proofPath: '/shop/?tab=orders' },
    { id: 'shop-purchase-receive', phase: 'prove', delivery: 'demo', domain: 'supply-chain', label: 'Purchase and receive', outcome: 'Raise a supplier order, track arrival, receive stock, and record quality or quantity variance.', records: ['purchase_order', 'goods_receipt', 'receipt_variance'], roles: ['Buyer', 'Receiving operator'], dependsOn: ['shop-catalog-stock'], proofPath: '/shop/?tab=inventory' },
    { id: 'shop-location-control', phase: 'control', delivery: 'configure', domain: 'supply-chain', label: 'Locations, bins, lots, and transfers', outcome: 'Control inventory by branch, bin, lot, expiry, and approved transfer.', records: ['location', 'bin', 'lot', 'transfer'], roles: ['Inventory controller', 'Branch manager'], dependsOn: ['platform-master-data', 'shop-catalog-stock'] },
    { id: 'shop-finance-control', phase: 'control', delivery: 'configure', domain: 'finance', label: 'Tax, settlement, returns, and daily close', outcome: 'Review tax, payment exceptions, corrections, returns, refunds, settlement, and accounting packets.', records: ['tax_rule', 'close', 'return', 'refund', 'journal_packet'], roles: ['Cashier', 'Finance approver'], dependsOn: ['shop-order-to-cash', 'platform-financial-control'] },
    { id: 'shop-customer-credit', phase: 'control', delivery: 'configure', domain: 'customer', label: 'Customer, pricing, and credit', outcome: 'Govern customer accounts, price lists, credit limits, terms, collections, and service ownership.', records: ['customer', 'price_list', 'credit_policy', 'collection_action'], roles: ['Sales manager', 'Credit controller'], dependsOn: ['platform-master-data', 'shop-order-to-cash'] },
    { id: 'shop-supplier-control', phase: 'control', delivery: 'configure', domain: 'supply-chain', label: 'Supplier and procurement control', outcome: 'Qualify suppliers, compare lead time and variance, approve spend, and track obligations.', records: ['supplier', 'source_list', 'purchase_requisition', 'purchase_order'], roles: ['Buyer', 'Procurement approver'], dependsOn: ['shop-purchase-receive', 'platform-approval'] },
    { id: 'shop-demand-intelligence', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'Demand and replenishment intelligence', outcome: 'Forecast demand and prepare explainable reorder, transfer, and markdown recommendations.', records: ['forecast', 'replenishment_proposal', 'recommendation'], roles: ['Demand planner', 'Inventory owner'], dependsOn: ['shop-supplier-control', 'platform-intelligence'] },
    { id: 'shop-warehouse-execution', phase: 'scale', delivery: 'roadmap', domain: 'operations', label: 'Warehouse execution', outcome: 'Wave, pick, pack, count, dispatch, and measure warehouse work with scan-ready tasks.', records: ['wave', 'pick_task', 'pack', 'shipment'], roles: ['Warehouse lead', 'Picker'], dependsOn: ['shop-location-control', 'shop-order-to-cash'] },
    { id: 'shop-multi-entity', phase: 'scale', delivery: 'roadmap', domain: 'governance', label: 'Multi-branch commerce governance', outcome: 'Operate branches and companies with scoped assortments, roles, fiscal controls, and reporting.', records: ['branch', 'assortment', 'policy', 'consolidation'], roles: ['Regional manager', 'Finance director'], dependsOn: ['platform-multi-entity', 'shop-location-control'] },
    { id: 'shop-integration-backbone', phase: 'scale', delivery: 'roadmap', domain: 'integration', label: 'Accounting, payment, logistics, and event APIs', outcome: 'Publish versioned handoffs without duplicating order, stock, payment, or customer authority.', records: ['integration_event', 'posting_receipt', 'carrier_status'], roles: ['Integration owner', 'Finance systems owner'], dependsOn: ['platform-event-backbone', 'shop-finance-control'] },
  ],
  production: [
    { id: 'plant-job-control', phase: 'prove', delivery: 'demo', domain: 'operations', label: 'Jobs and work centers', outcome: 'Import jobs, assign work centers, check readiness, prioritize, and control status.', records: ['production_job', 'work_center', 'schedule'], roles: ['Planner', 'Line supervisor'], dependsOn: ['platform-operating-foundation'], proofPath: '/plant/?tab=production' },
    { id: 'plant-output-quality', phase: 'prove', delivery: 'demo', domain: 'quality', label: 'Output, scrap, and quality release', outcome: 'Record output and scrap, place holds, resolve issues, and release with evidence.', records: ['output', 'scrap', 'quality_hold', 'release'], roles: ['Operator', 'Quality approver'], dependsOn: ['plant-job-control'], proofPath: '/plant/?tab=production' },
    { id: 'plant-maintenance', phase: 'prove', delivery: 'demo', domain: 'operations', label: 'Machine, downtime, and maintenance', outcome: 'Record machine state, downtime, maintenance work, return-to-service, and shift close.', records: ['machine', 'downtime', 'maintenance_order', 'shift_handoff'], roles: ['Maintenance technician', 'Shift supervisor'], dependsOn: ['plant-job-control'], proofPath: '/plant/?tab=control' },
    { id: 'plant-material-flow', phase: 'prove', delivery: 'demo', domain: 'supply-chain', label: 'Material issue and stock handoff', outcome: 'Check material availability, consume controlled quantities, and hand released output to Shop stock.', records: ['material_requirement', 'material_issue', 'stock_handoff'], roles: ['Material handler', 'Production operator'], dependsOn: ['plant-job-control', 'shop-catalog-stock'], proofPath: '/plant/?tab=production' },
    { id: 'plant-bom-routing-mrp', phase: 'control', delivery: 'configure', domain: 'supply-chain', label: 'BOM, routing, recipe, and MRP', outcome: 'Version product structures and routes, explode demand, detect shortages, and prepare supply actions.', records: ['bom', 'routing', 'recipe', 'mrp_proposal'], roles: ['Production engineer', 'Material planner'], dependsOn: ['platform-master-data', 'plant-material-flow'] },
    { id: 'plant-traceability', phase: 'control', delivery: 'configure', domain: 'quality', label: 'Lot genealogy and quality management', outcome: 'Trace inputs, process events, inspections, holds, deviations, and finished lots.', records: ['lot', 'genealogy_link', 'inspection', 'deviation'], roles: ['Quality manager', 'Traceability owner'], dependsOn: ['plant-output-quality', 'platform-audit'] },
    { id: 'plant-capacity-cost', phase: 'control', delivery: 'configure', domain: 'finance', label: 'Capacity, labor, and production cost', outcome: 'Compare capacity, labor, material, downtime, overhead, and standard-versus-actual cost.', records: ['capacity_bucket', 'labor_time', 'cost_rollup', 'variance'], roles: ['Plant controller', 'Planner'], dependsOn: ['plant-bom-routing-mrp', 'platform-financial-control'] },
    { id: 'plant-compliance', phase: 'control', delivery: 'configure', domain: 'governance', label: 'Safety, compliance, and change control', outcome: 'Control permits, checks, specifications, training, deviations, and engineering changes.', records: ['permit', 'specification', 'training_record', 'change_order'], roles: ['EHS owner', 'Engineering approver'], dependsOn: ['platform-approval', 'plant-traceability'] },
    { id: 'plant-finite-schedule', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'Finite scheduling', outcome: 'Sequence constrained work using materials, capacity, labor, setup, and due-date tradeoffs.', records: ['constraint', 'schedule_scenario', 'dispatch_list'], roles: ['Production planner', 'Operations manager'], dependsOn: ['plant-capacity-cost', 'platform-intelligence'] },
    { id: 'plant-oee-predictive', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'OEE and predictive maintenance', outcome: 'Explain availability, performance, quality loss, failure risk, and recommended intervention.', records: ['oee_loss', 'condition_reading', 'maintenance_prediction'], roles: ['Reliability engineer', 'Plant manager'], dependsOn: ['plant-maintenance', 'plant-output-quality'] },
    { id: 'plant-digital-instructions', phase: 'scale', delivery: 'roadmap', domain: 'workforce', label: 'Digital work and skills', outcome: 'Deliver versioned work instructions, certifications, operator guidance, and electronic sign-off.', records: ['work_instruction', 'skill', 'qualification', 'execution_signoff'], roles: ['Operator', 'Training owner'], dependsOn: ['plant-compliance', 'platform-identity'] },
    { id: 'plant-multi-site', phase: 'scale', delivery: 'roadmap', domain: 'governance', label: 'Multi-plant governance and benchmarking', outcome: 'Standardize recipes, quality, maintenance, cost, and metrics across plants.', records: ['plant', 'standard', 'benchmark', 'interplant_transfer'], roles: ['Manufacturing director', 'Plant manager'], dependsOn: ['platform-multi-entity', 'plant-traceability'] },
  ],
  website: [
    { id: 'website-content-model', phase: 'prove', delivery: 'demo', domain: 'master-data', label: 'Pages and approved content', outcome: 'Import structured pages, offers, proof, contacts, navigation, and metadata.', records: ['page', 'content_block', 'navigation', 'metadata'], roles: ['Content editor', 'Business owner'], dependsOn: ['platform-operating-foundation'], proofPath: '/website/' },
    { id: 'website-responsive-proof', phase: 'prove', delivery: 'demo', domain: 'quality', label: 'Responsive and accessibility proof', outcome: 'Review desktop and mobile presentation, links, semantics, and acceptance evidence.', records: ['responsive_check', 'accessibility_check', 'evidence'], roles: ['Designer', 'Approver'], dependsOn: ['website-content-model'], proofPath: '/website/' },
    { id: 'website-release-control', phase: 'prove', delivery: 'demo', domain: 'governance', label: 'Release and rollback evidence', outcome: 'Bind an approved content snapshot and verification set to a recoverable release record.', records: ['release', 'approval', 'artifact_digest', 'rollback_point'], roles: ['Publisher', 'Release approver'], dependsOn: ['website-responsive-proof', 'platform-approval'], proofPath: '/website/' },
    { id: 'website-lead-routing', phase: 'prove', delivery: 'demo', domain: 'customer', label: 'Lead capture and ownership', outcome: 'Capture consent, qualify enquiries, assign an owner, record follow-up, and close the lifecycle.', records: ['lead', 'consent', 'assignment', 'follow_up'], roles: ['Sales owner', 'Marketing operator'], dependsOn: ['website-content-model'], proofPath: '/website/' },
    { id: 'website-governance', phase: 'control', delivery: 'configure', domain: 'governance', label: 'Content governance', outcome: 'Assign owners, approvals, expiry dates, claims evidence, legal checks, and recovery.', records: ['content_owner', 'claim', 'review', 'expiry_policy'], roles: ['Content manager', 'Legal approver'], dependsOn: ['website-release-control', 'platform-identity'] },
    { id: 'website-localization', phase: 'control', delivery: 'configure', domain: 'customer', label: 'Localization, SEO, consent, and redirects', outcome: 'Control Myanmar and English content, metadata, schema, analytics consent, and URL changes.', records: ['locale_variant', 'seo_rule', 'consent_policy', 'redirect'], roles: ['SEO owner', 'Privacy owner'], dependsOn: ['website-content-model', 'platform-master-data'] },
    { id: 'website-design-system', phase: 'control', delivery: 'configure', domain: 'quality', label: 'Governed design system', outcome: 'Reuse accessible tokens, components, templates, and brand variants without visual drift.', records: ['design_token', 'component', 'template', 'brand_variant'], roles: ['Design owner', 'Frontend owner'], dependsOn: ['website-responsive-proof', 'website-governance'] },
    { id: 'website-campaign-operations', phase: 'control', delivery: 'configure', domain: 'customer', label: 'Campaign and form operations', outcome: 'Build approved landing pages, forms, routing rules, source attribution, and service-level follow-up.', records: ['campaign', 'form', 'attribution', 'routing_rule'], roles: ['Campaign manager', 'Sales operations'], dependsOn: ['website-lead-routing', 'platform-event-backbone'] },
    { id: 'website-experimentation', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'Experimentation and personalization', outcome: 'Test approved variants with guardrails, segment rules, and measurable outcomes.', records: ['experiment', 'variant', 'audience', 'outcome'], roles: ['Growth owner', 'Approver'], dependsOn: ['website-campaign-operations', 'platform-analytics'] },
    { id: 'website-multisite', phase: 'scale', delivery: 'roadmap', domain: 'governance', label: 'Multi-site portfolio', outcome: 'Reuse governed components across brands, locations, languages, and campaigns.', records: ['site', 'brand', 'domain', 'shared_component'], roles: ['Portfolio owner', 'Brand manager'], dependsOn: ['website-design-system', 'platform-multi-entity'] },
    { id: 'website-content-intelligence', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'Content and lead intelligence', outcome: 'Recommend bounded content and routing improvements using approved evidence and conversion data.', records: ['content_recommendation', 'lead_score', 'evaluation'], roles: ['Marketing owner', 'AI governance owner'], dependsOn: ['website-experimentation', 'platform-intelligence'] },
    { id: 'website-ecosystem', phase: 'scale', delivery: 'roadmap', domain: 'integration', label: 'CRM, messaging, and marketing integrations', outcome: 'Use versioned, consent-aware lead, audience, campaign, and conversion handoffs.', records: ['crm_handoff', 'message_request', 'campaign_event'], roles: ['Integration owner', 'Privacy owner'], dependsOn: ['website-lead-routing', 'platform-event-backbone'] },
  ],
  ecommerce: [
    { id: 'ecommerce-shop-catalog', phase: 'prove', delivery: 'demo', domain: 'master-data', label: 'Shop-backed storefront', outcome: 'Merchandise current Shop SKUs without duplicating stock or price authority.', records: ['storefront', 'collection', 'shop_sku_reference'], roles: ['Merchandiser', 'Catalog owner'], dependsOn: ['shop-catalog-stock', 'platform-event-backbone'], proofPath: '/ecommerce/' },
    { id: 'ecommerce-buying-flow', phase: 'prove', delivery: 'demo', domain: 'customer', label: 'Quote and order request', outcome: 'Capture customer, items, fulfilment, payment intent, consent, and source proof.', records: ['cart', 'quote', 'customer_intent', 'order_request'], roles: ['Customer', 'Sales reviewer'], dependsOn: ['ecommerce-shop-catalog'], proofPath: '/ecommerce/' },
    { id: 'ecommerce-shop-handoff', phase: 'prove', delivery: 'demo', domain: 'integration', label: 'Shop confirmation handoff', outcome: 'Send a reviewed request to Shop for accountable stock, price, payment, and order confirmation.', records: ['handoff', 'confirmation', 'shop_order_reference'], roles: ['Sales reviewer', 'Shop operator'], dependsOn: ['ecommerce-buying-flow', 'shop-channel-intake'], proofPath: '/ecommerce/' },
    { id: 'ecommerce-service-lifecycle', phase: 'prove', delivery: 'demo', domain: 'customer', label: 'Customer service lifecycle', outcome: 'Open, own, acknowledge, respond, resolve, reopen, and evidence order support.', records: ['support_case', 'service_event', 'resolution'], roles: ['Service agent', 'Service manager'], dependsOn: ['ecommerce-shop-handoff'], proofPath: '/ecommerce/' },
    { id: 'ecommerce-pricing', phase: 'control', delivery: 'configure', domain: 'finance', label: 'Promotions and B2B pricing', outcome: 'Apply governed price lists, promotions, contracts, minimums, tax, and approval limits.', records: ['price_list', 'promotion', 'contract_price', 'tax_rule'], roles: ['Pricing manager', 'Finance approver'], dependsOn: ['ecommerce-shop-catalog', 'platform-financial-control'] },
    { id: 'ecommerce-fulfilment', phase: 'control', delivery: 'configure', domain: 'operations', label: 'Fulfilment, returns, and refunds', outcome: 'Control pickup, delivery, tracking, cancellation, returns, exchanges, and refund review.', records: ['fulfilment_plan', 'shipment', 'return_request', 'refund_request'], roles: ['Fulfilment owner', 'Customer service'], dependsOn: ['ecommerce-shop-handoff', 'shop-finance-control'] },
    { id: 'ecommerce-customer', phase: 'control', delivery: 'configure', domain: 'customer', label: 'Customer accounts and service', outcome: 'Maintain consent, addresses, preferences, segments, order history, and service ownership.', records: ['customer_account', 'address', 'consent', 'segment'], roles: ['Customer', 'Customer service manager'], dependsOn: ['ecommerce-buying-flow', 'platform-master-data'] },
    { id: 'ecommerce-fraud-privacy', phase: 'control', delivery: 'configure', domain: 'governance', label: 'Fraud, privacy, and payment controls', outcome: 'Review payment risk, consent, data retention, suspicious behavior, and approval boundaries.', records: ['risk_signal', 'payment_review', 'privacy_request', 'retention_policy'], roles: ['Risk reviewer', 'Privacy owner'], dependsOn: ['platform-identity', 'ecommerce-buying-flow'] },
    { id: 'ecommerce-recurring', phase: 'scale', delivery: 'roadmap', domain: 'customer', label: 'Subscriptions and repeat ordering', outcome: 'Prepare recurring orders with inventory, payment, pause, cancellation, and recovery controls.', records: ['subscription', 'renewal', 'payment_mandate', 'pause'], roles: ['Customer', 'Subscription manager'], dependsOn: ['ecommerce-customer', 'ecommerce-fulfilment'] },
    { id: 'ecommerce-channels', phase: 'scale', delivery: 'roadmap', domain: 'integration', label: 'Marketplace and social channels', outcome: 'Normalize channel catalog, demand, service, and fulfilment into one Shop-owned lifecycle.', records: ['channel_listing', 'channel_order', 'channel_message'], roles: ['Channel manager', 'Shop operator'], dependsOn: ['ecommerce-shop-handoff', 'platform-event-backbone'] },
    { id: 'ecommerce-optimization', phase: 'scale', delivery: 'roadmap', domain: 'intelligence', label: 'Conversion and demand intelligence', outcome: 'Explain funnel loss and recommend bounded pricing, merchandising, and fulfilment actions.', records: ['funnel_event', 'recommendation', 'experiment'], roles: ['Ecommerce manager', 'Demand planner'], dependsOn: ['ecommerce-pricing', 'platform-intelligence'] },
    { id: 'ecommerce-multi-market', phase: 'scale', delivery: 'roadmap', domain: 'governance', label: 'Multi-market storefront governance', outcome: 'Operate brands, languages, domains, currencies, catalogs, and policies with one authority model.', records: ['market', 'brand_storefront', 'assortment', 'market_policy'], roles: ['Market manager', 'Portfolio owner'], dependsOn: ['platform-multi-entity', 'ecommerce-customer'] },
  ],
}

export function productCapabilityCatalog(product: ClientSolutionId): ClientCapability[] {
  return catalog[product].map((capability) => ({ ...capability, product }))
}

const capabilityLabels = new Map<string, string>([
  ...platformCatalog.map((capability) => [capability.id, capability.label] as const),
  ...Object.values(catalog).flat().map((capability) => [capability.id, capability.label] as const),
])

export function clientCapabilityDependencyLabel(id: string) {
  return capabilityLabels.get(id) ?? id.replaceAll('-', ' ')
}

export function clientCapabilityIdsForProducts(products: readonly ClientSolutionId[]) {
  const selected = new Set(products)
  return new Set([
    ...platformCatalog.map((capability) => capability.id),
    ...Object.entries(catalog).flatMap(([product, capabilities]) => selected.has(product as ClientSolutionId)
      ? capabilities.map((capability) => capability.id)
      : []),
  ])
}

export function productCapabilitySummary(product: ClientSolutionId) {
  const capabilities = productCapabilityCatalog(product)
  return {
    demoReady: capabilities.filter((capability) => capability.delivery === 'demo').length,
    configureNext: capabilities.filter((capability) => capability.delivery === 'configure').length,
    scaleLater: capabilities.filter((capability) => capability.delivery === 'roadmap').length,
    total: capabilities.length,
  }
}

export function buildClientCapabilityPlan(blueprint: ClientDemoBlueprint, generatedAt: string): ClientCapabilityPlan {
  const products = blueprint.products.map(({ product, label, templateId }) => ({ product, label, templateId }))
  const selected = new Set(products.map(({ product }) => product))
  const capabilities = Object.entries(catalog).flatMap(([product, entries]) => selected.has(product as ClientSolutionId)
    ? entries.map((entry) => ({ ...entry, product: product as ClientSolutionId }))
    : [])
  const phases = (Object.keys(phaseDetails) as ClientCapabilityPhaseId[]).map((id) => ({
    id,
    ...phaseDetails[id],
    capabilities: capabilities.filter((capability) => capability.phase === id),
  }))
  return {
    schema: CLIENT_CAPABILITY_PLAN_SCHEMA,
    generatedAt,
    workspace: blueprint.client.workspace,
    presetId: blueprint.client.presetId,
    products,
    sharedControls,
    platformCapabilities: platformCatalog.map((capability) => ({ ...capability })),
    phases,
    summary: {
      demoReady: phases[0].capabilities.length,
      configureNext: phases[1].capabilities.length,
      scaleLater: phases[2].capabilities.length,
      sharedPlatform: platformCatalog.length,
      total: capabilities.length + platformCatalog.length,
    },
    controls: {
      roadmapOnly: true,
      humanReviewRequired: true,
      externalWritesPerformed: false,
      capabilityPresenceMustBeVerified: true,
      noPlaceholderModules: true,
    },
  }
}
