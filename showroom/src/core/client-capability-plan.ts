import type { ClientDemoBlueprint, ClientSolutionId } from './client-onboarding.ts'

export const CLIENT_CAPABILITY_PLAN_SCHEMA = 'supermega.client_capability_plan.v1' as const

export type ClientCapabilityPhaseId = 'prove' | 'control' | 'scale'

export type ClientCapability = {
  id: string
  product: ClientSolutionId
  phase: ClientCapabilityPhaseId
  label: string
  outcome: string
  dependsOn: readonly string[]
}

export type ClientCapabilityPlan = {
  schema: typeof CLIENT_CAPABILITY_PLAN_SCHEMA
  generatedAt: string
  workspace: string
  presetId: ClientDemoBlueprint['client']['presetId']
  products: Array<{ product: ClientSolutionId; label: string; templateId: string }>
  sharedControls: readonly string[]
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
    total: number
  }
  controls: {
    roadmapOnly: true
    humanReviewRequired: true
    externalWritesPerformed: false
    capabilityPresenceMustBeVerified: true
  }
}

const phaseDetails: Record<ClientCapabilityPhaseId, { label: string; outcome: string }> = {
  prove: { label: '1. Prove', outcome: 'Run one complete workflow with reviewable evidence.' },
  control: { label: '2. Control', outcome: 'Add master data, approvals, exceptions, and financial control.' },
  scale: { label: '3. Scale', outcome: 'Expand locations, automation, intelligence, and integration safely.' },
}

const sharedControls = [
  'Managed identity and least-privilege roles',
  'One client, location, currency, and timezone foundation',
  'Human approval for consequential actions',
  'Immutable evidence and operational audit trail',
  'Versioned imports, recovery, and rollback proof',
  'Cross-product record IDs and event contracts',
] as const

const catalog: Record<ClientSolutionId, readonly Omit<ClientCapability, 'product'>[]> = {
  commerce: [
    { id: 'shop-catalog-stock', phase: 'prove', label: 'Catalog and stock', outcome: 'Import SKUs, prices, opening stock, and reorder thresholds.', dependsOn: ['shared-master-data'] },
    { id: 'shop-accountable-sale', phase: 'prove', label: 'Accountable sale', outcome: 'Create an order, reconcile payment, issue proof, and complete fulfilment.', dependsOn: ['shop-catalog-stock'] },
    { id: 'shop-channel-intake', phase: 'prove', label: 'Channel order review', outcome: 'Normalize website and ecommerce requests before Shop confirmation.', dependsOn: ['shop-catalog-stock'] },
    { id: 'shop-procurement', phase: 'control', label: 'Purchasing and receiving', outcome: 'Plan replenishment, approve suppliers, receive stock, and record variances.', dependsOn: ['shop-catalog-stock', 'approval-policy'] },
    { id: 'shop-finance-control', phase: 'control', label: 'Tax, refunds, and close', outcome: 'Review tax, payment exceptions, returns, refunds, and accounting packets.', dependsOn: ['shop-accountable-sale', 'approval-policy'] },
    { id: 'shop-location-control', phase: 'control', label: 'Locations and transfers', outcome: 'Control stock by branch, bin, batch, and approved transfer.', dependsOn: ['shared-master-data', 'shop-catalog-stock'] },
    { id: 'shop-demand-intelligence', phase: 'scale', label: 'Demand and replenishment intelligence', outcome: 'Forecast demand and prepare explainable reorder recommendations.', dependsOn: ['shop-procurement', 'evidence-history'] },
    { id: 'shop-integration-backbone', phase: 'scale', label: 'Accounting and event APIs', outcome: 'Publish versioned, idempotent handoffs without duplicating authority.', dependsOn: ['cross-product-records', 'shop-finance-control'] },
    { id: 'shop-multi-entity', phase: 'scale', label: 'Multi-entity governance', outcome: 'Operate branches and companies with scoped roles, policies, and reporting.', dependsOn: ['shop-location-control', 'managed-identity'] },
  ],
  production: [
    { id: 'plant-job-control', phase: 'prove', label: 'Jobs and work centers', outcome: 'Import jobs, assign lines, check readiness, and control status.', dependsOn: ['shared-master-data'] },
    { id: 'plant-output-quality', phase: 'prove', label: 'Output, scrap, and quality', outcome: 'Record output and scrap, resolve holds, and release with evidence.', dependsOn: ['plant-job-control', 'approval-policy'] },
    { id: 'plant-maintenance', phase: 'prove', label: 'Maintenance and downtime', outcome: 'Record machine state, downtime, maintenance work, and shift handoff.', dependsOn: ['plant-job-control'] },
    { id: 'plant-material-planning', phase: 'control', label: 'BOM, routing, and MRP', outcome: 'Explode material demand, detect shortages, and prepare purchase or issue actions.', dependsOn: ['plant-job-control', 'shop-procurement'] },
    { id: 'plant-traceability', phase: 'control', label: 'Lot genealogy and quality release', outcome: 'Trace inputs, process events, inspections, holds, and finished lots.', dependsOn: ['plant-output-quality', 'evidence-history'] },
    { id: 'plant-capacity-cost', phase: 'control', label: 'Capacity and production cost', outcome: 'Compare capacity, labor, material, downtime, and standard-versus-actual cost.', dependsOn: ['plant-material-planning', 'plant-maintenance'] },
    { id: 'plant-oee-predictive', phase: 'scale', label: 'OEE and predictive maintenance', outcome: 'Explain availability, performance, quality loss, and maintenance risk.', dependsOn: ['plant-maintenance', 'plant-output-quality'] },
    { id: 'plant-finite-schedule', phase: 'scale', label: 'Finite scheduling', outcome: 'Sequence constrained work with explainable tradeoffs and owner approval.', dependsOn: ['plant-capacity-cost', 'plant-material-planning'] },
    { id: 'plant-multi-site', phase: 'scale', label: 'Multi-plant governance', outcome: 'Standardize recipes, quality, maintenance, and reporting across plants.', dependsOn: ['plant-traceability', 'managed-identity'] },
  ],
  website: [
    { id: 'website-content-model', phase: 'prove', label: 'Pages and approved content', outcome: 'Import structured pages, offers, proof, contacts, and navigation.', dependsOn: ['shared-master-data'] },
    { id: 'website-responsive-proof', phase: 'prove', label: 'Responsive and accessibility proof', outcome: 'Review desktop and mobile presentation with explicit acceptance evidence.', dependsOn: ['website-content-model'] },
    { id: 'website-release-control', phase: 'prove', label: 'Release evidence', outcome: 'Bind an approved content snapshot to a local release record.', dependsOn: ['website-responsive-proof', 'approval-policy'] },
    { id: 'website-lead-routing', phase: 'control', label: 'Lead capture and routing', outcome: 'Validate consent and route enquiries into an accountable owner queue.', dependsOn: ['website-content-model', 'cross-product-records'] },
    { id: 'website-governance', phase: 'control', label: 'Content governance', outcome: 'Assign owners, approvals, expiry dates, claims evidence, and recovery.', dependsOn: ['website-release-control', 'managed-identity'] },
    { id: 'website-localization', phase: 'control', label: 'Localization, SEO, and consent', outcome: 'Control Myanmar and English content, metadata, analytics consent, and redirects.', dependsOn: ['website-content-model', 'approval-policy'] },
    { id: 'website-experimentation', phase: 'scale', label: 'Experimentation and personalization', outcome: 'Test approved variants with guardrails and measurable outcomes.', dependsOn: ['website-lead-routing', 'evidence-history'] },
    { id: 'website-multisite', phase: 'scale', label: 'Multi-site portfolio', outcome: 'Reuse governed components across brands, locations, and campaigns.', dependsOn: ['website-governance', 'managed-identity'] },
    { id: 'website-ecosystem', phase: 'scale', label: 'CRM and marketing integrations', outcome: 'Use versioned, consent-aware lead and campaign handoffs.', dependsOn: ['website-lead-routing', 'cross-product-records'] },
  ],
  ecommerce: [
    { id: 'ecommerce-shop-catalog', phase: 'prove', label: 'Shop-backed storefront', outcome: 'Merchandise current Shop SKUs without duplicating stock or price authority.', dependsOn: ['shop-catalog-stock', 'cross-product-records'] },
    { id: 'ecommerce-buying-flow', phase: 'prove', label: 'Quote and order request', outcome: 'Capture customer, items, fulfilment, payment intent, and source proof.', dependsOn: ['ecommerce-shop-catalog'] },
    { id: 'ecommerce-shop-handoff', phase: 'prove', label: 'Shop confirmation handoff', outcome: 'Send a reviewed request to Shop for accountable order confirmation.', dependsOn: ['ecommerce-buying-flow', 'shop-channel-intake'] },
    { id: 'ecommerce-pricing', phase: 'control', label: 'Promotions and B2B pricing', outcome: 'Apply governed price lists, promotion rules, minimums, and approval limits.', dependsOn: ['ecommerce-shop-catalog', 'approval-policy'] },
    { id: 'ecommerce-fulfilment', phase: 'control', label: 'Fulfilment, returns, and refunds', outcome: 'Control pickup, delivery, status communication, returns, and refund review.', dependsOn: ['ecommerce-shop-handoff', 'shop-finance-control'] },
    { id: 'ecommerce-customer', phase: 'control', label: 'Customer accounts and service', outcome: 'Maintain consent, addresses, preferences, order history, and support ownership.', dependsOn: ['ecommerce-buying-flow', 'managed-identity'] },
    { id: 'ecommerce-recurring', phase: 'scale', label: 'Subscriptions and repeat ordering', outcome: 'Prepare recurring orders with inventory, payment, and cancellation controls.', dependsOn: ['ecommerce-customer', 'ecommerce-fulfilment'] },
    { id: 'ecommerce-channels', phase: 'scale', label: 'Marketplace and social channels', outcome: 'Normalize channel demand into one Shop-owned order lifecycle.', dependsOn: ['ecommerce-shop-handoff', 'cross-product-records'] },
    { id: 'ecommerce-optimization', phase: 'scale', label: 'Conversion and demand intelligence', outcome: 'Explain funnel loss and recommend bounded merchandising actions.', dependsOn: ['ecommerce-pricing', 'evidence-history'] },
  ],
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
    phases,
    summary: {
      demoReady: phases[0].capabilities.length,
      configureNext: phases[1].capabilities.length,
      scaleLater: phases[2].capabilities.length,
      total: capabilities.length,
    },
    controls: {
      roadmapOnly: true,
      humanReviewRequired: true,
      externalWritesPerformed: false,
      capabilityPresenceMustBeVerified: true,
    },
  }
}
