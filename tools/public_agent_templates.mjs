const mmk = (raw) => {
  const value = String(raw || '').trim()
  return /MMK/i.test(value) ? value : `${value} MMK`
}

function pricingHelpers(pricing) {
  const services = Object.fromEntries((pricing.services || []).map((service) => [service.key, service]))
  const products = Object.fromEntries((pricing.products || []).map((product) => [product.key, product]))
  return {
    serviceMmk: (key) => mmk(services[key]?.mmk),
    productTierMmk: (productKey, tierName) => {
      const value = products[productKey]?.tiers?.[tierName]
      return value ? mmk(value) : ''
    },
  }
}

export function buildPublicAgentTemplates(pricing) {
  const { serviceMmk, productTierMmk } = pricingHelpers(pricing)
  return [
    {
      id: 'deskpos-quickstart',
      name: 'DeskPOS Quickstart',
      status: 'live',
      buyer: 'Spa, salon, retail, cafe, repair, clinic, gym, or tuition owner',
      promise: 'Private POS setup with sales, bookings, payments, receipts, stock, customers, and daily close actions.',
      firstProof: 'Working checkout, booking flow, MMQR receipt, and daily close insight on their starting catalog.',
      setupInputs: ['Business type', 'Menu or product list', 'Staff list', 'Wallet name', 'Logo and hours'],
      pricingLabel: `${productTierMmk('deskpos', 'Counter')} setup`,
      sourceCategory: 'spa',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'DeskPOS Quickstart',
      productArea: 'DeskPOS',
      placeholder: 'Tell us your shop type, service/product list, payment wallet, staff, and what you need to close daily.',
      next: 'Next: we configure a private shop link and prove one real sale and closeout flow.',
      sampleSources: ['service menu', 'staff list', 'payment wallet name', 'last ten sales or bookings'],
      firstRunWorkflow: ['Configure shop profile', 'Load starting catalog', 'Run one checkout or booking', 'Generate receipt', 'Review daily close brief'],
      outputs: ['private shop link', 'checkout or booking proof', 'MMK receipt proof', 'daily close action list'],
    },
    {
      id: 'chat-ledger',
      name: 'Viber / WhatsApp Business Ledger',
      status: 'build-ready',
      buyer: 'Distributor, wholesaler, home business, or service owner selling through chat',
      promise: 'Turn messy chat orders into customers, open balances, invoices, delivery status, and follow-up tasks.',
      firstProof: 'Clean table of recent orders, who owes money, and which customers need follow-up today.',
      setupInputs: ['Chat export or screenshots', 'Product list', 'Payment rules', 'Delivery areas', 'Customer names'],
      pricingLabel: `${serviceMmk('dashboard')} setup`,
      sourceCategory: 'wholesale',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'Viber / WhatsApp Business Ledger',
      productArea: 'Custom Solutions & AI Agents',
      placeholder: 'Paste ten recent chat orders or describe the chat workflow: orders, payment, delivery, and follow-up.',
      next: 'Next: we extract one owner ledger from sample chats before building a repeatable flow.',
      sampleSources: ['ten order screenshots', 'product list', 'delivery rules', 'payment proof examples'],
      firstRunWorkflow: ['Extract orders', 'Match customers', 'Detect unpaid balances', 'Build delivery queue', 'Draft follow-up messages for approval'],
      outputs: ['customer order ledger', 'open balance list', 'delivery queue', 'approval-only follow-up drafts'],
    },
    {
      id: 'inbox-calendar-operator',
      name: 'Inbox & Calendar Operator',
      status: 'build-ready',
      buyer: 'Founder, clinic admin, school operator, importer, or executive assistant',
      promise: 'Read-only assistant that turns email and calendar context into drafts, prep notes, reminders, and approvals.',
      firstProof: 'Morning action brief with drafted replies, meeting prep, and follow-up tasks waiting for approval.',
      setupInputs: ['Gmail scope', 'Calendar scope', 'Reply examples', 'Important contacts', 'Escalation rules'],
      pricingLabel: `${serviceMmk('ai-agent')} setup`,
      sourceCategory: 'clinic',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'Inbox & Calendar Operator',
      productArea: 'Custom Solutions & AI Agents',
      placeholder: 'Describe the inbox/calendar work that repeats every day, who approves replies, and what must stay read-only first.',
      next: 'Next: we start read-only and produce one daily action brief before any send action exists.',
      sampleSources: ['Gmail labels', 'calendar categories', 'reply examples', 'VIP contact list'],
      firstRunWorkflow: ['Read allowed inbox labels', 'Read today and tomorrow calendar', 'Classify urgency', 'Draft replies', 'Create approval queue'],
      outputs: ['morning action brief', 'meeting prep notes', 'reply drafts', 'follow-up queue'],
    },
    {
      id: 'daily-intelligence-brief',
      name: 'Daily Intelligence Brief Agent',
      status: 'build-ready',
      buyer: 'Importer, trader, factory owner, agency, or executive team',
      promise: 'Start-of-day operating brief that watches chosen sources, flags changes, and turns signals into decisions.',
      firstProof: 'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
      setupInputs: ['Watchlist sources', 'Companies or keywords', 'Inbox labels', 'Decision categories', 'Send time'],
      pricingLabel: `${serviceMmk('ai-agent')} setup`,
      sourceCategory: 'import export company',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'Daily Intelligence Brief Agent',
      productArea: 'Custom Solutions & AI Agents',
      placeholder: 'List the sources, companies, inbox labels, or keywords you need watched, and what decisions the brief should support.',
      next: 'Next: we deliver one read-only brief and tune the signal list before automating delivery.',
      sampleSources: ['watchlist URLs', 'company names', 'Gmail labels', 'decision categories'],
      firstRunWorkflow: ['Collect source changes', 'Deduplicate repeated news', 'Rank by business impact', 'Write action brief', 'Log watched sources'],
      outputs: ['daily operating brief', 'source-change log', 'decision queue', 'follow-up task list'],
    },
    {
      id: 'factory-ops-ledger',
      name: 'Factory Ops Ledger',
      status: 'build-ready',
      buyer: 'Small or mid-size factory using Excel, PDF, email, chat, and paper records',
      promise: 'Plant ledger that turns production, quality, maintenance, receiving, and CAPA logs into one risk queue.',
      firstProof: 'Dashboard showing production, quality claims, open issues, and the top risks to review today.',
      setupInputs: ['Daily production file', 'Quality records', 'Line or machine list', 'Maintenance log', 'Roles'],
      pricingLabel: `${productTierMmk('factory', 'Operations build')} setup`,
      sourceCategory: 'factory',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'Factory Ops Ledger',
      productArea: 'Factory & Operations App',
      placeholder: 'Paste or describe the production, quality, maintenance, or issue files that should become one plant ledger.',
      next: 'Next: we build a read-only plant dashboard before changing staff workflows.',
      sampleSources: ['daily production sheet', 'quality claim log', 'maintenance notes', 'machine list'],
      firstRunWorkflow: ['Load production rows', 'Normalize quality issues', 'Join machine or line names', 'Rank open risks', 'Publish read-only dashboard'],
      outputs: ['plant dashboard', 'open issue ledger', 'risk queue', 'source trace list'],
    },
    {
      id: 'data-clean-report-agent',
      name: 'Data Cleanup & Reporting Agent',
      status: 'build-ready',
      buyer: 'Accountant, operations manager, or owner receiving messy files every week',
      promise: 'Repeatable agent that cleans files, validates columns, explains exceptions, and outputs a trusted report.',
      firstProof: 'One messy file cleaned into the target table with exceptions highlighted and a short summary report.',
      setupInputs: ['Sample files', 'Target report', 'Validation rules', 'Exception examples', 'Export destination'],
      pricingLabel: `${serviceMmk('tool-week')} setup`,
      sourceCategory: 'accounting firm',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'Data Cleanup & Reporting Agent',
      productArea: 'Custom Solutions & AI Agents',
      placeholder: 'Paste or describe the messy weekly file, target report format, validation rules, and export destination.',
      next: 'Next: we clean one real file and show the repeatable rule set before expanding.',
      sampleSources: ['messy spreadsheet', 'target report', 'validation rules', 'exception examples'],
      firstRunWorkflow: ['Parse source file', 'Map columns', 'Validate rows', 'Explain exceptions', 'Export clean report'],
      outputs: ['clean table', 'exception report', 'validation summary', 'repeatable rules file'],
    },
    {
      id: 'document-pdf-intake-ledger',
      name: 'Document / PDF Intake Ledger',
      status: 'build-ready',
      buyer: 'Law office, accountant, importer, school admin, clinic, or operations team processing repeated PDFs',
      promise: 'Turn repeated PDFs, scans, and document folders into one structured ledger with missing fields and source trace.',
      firstProof: 'Five sample documents extracted into a clean table with confidence notes, missing fields, and source links.',
      setupInputs: ['Document samples', 'Target fields', 'Naming rules', 'Exception examples', 'Review owner'],
      pricingLabel: `${serviceMmk('dashboard')} setup`,
      sourceCategory: 'professional services',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'Document / PDF Intake Ledger',
      productArea: 'Custom Solutions & AI Agents',
      placeholder: 'Describe the PDFs, scans, forms, or folders that should become a ledger, plus the fields you need extracted.',
      next: 'Next: we extract five real documents and show confidence, gaps, and source trace before any workflow is automated.',
      sampleSources: ['five PDFs or scans', 'target field list', 'example completed report', 'exception examples'],
      firstRunWorkflow: ['Load sample documents', 'Extract target fields', 'Flag missing or uncertain fields', 'Attach source trace', 'Export review ledger'],
      outputs: ['document ledger', 'missing field queue', 'confidence notes', 'source trace links'],
    },
    {
      id: 'crm-follow-up-pipeline-assistant',
      name: 'CRM Follow-up & Pipeline Assistant',
      status: 'build-ready',
      buyer: 'Owner, sales manager, agency, clinic, training center, or B2B service team with leads in chat, sheets, and email',
      promise: 'Combine leads, replies, quotes, and next steps into one follow-up queue with approval-only outreach drafts.',
      firstProof: 'A ranked pipeline showing hot leads, stuck deals, missing next actions, and drafted follow-ups for approval.',
      setupInputs: ['Lead sheet', 'Inbox or chat exports', 'Offer list', 'Follow-up rules', 'Owner approval rule'],
      pricingLabel: `${serviceMmk('ai-agent')} setup`,
      sourceCategory: 'sales team',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'CRM Follow-up & Pipeline Assistant',
      productArea: 'Custom Solutions & AI Agents',
      placeholder: 'Describe where leads arrive, how you follow up, what counts as hot, and who approves outreach.',
      next: 'Next: we merge one lead source with one message source and produce an approval-only follow-up queue.',
      sampleSources: ['lead spreadsheet', 'recent replies', 'offer list', 'follow-up examples'],
      firstRunWorkflow: ['Merge lead sources', 'Classify lead stage', 'Detect missing next action', 'Draft follow-ups', 'Queue owner approvals'],
      outputs: ['ranked lead queue', 'stuck deal list', 'approval-only follow-up drafts', 'pipeline summary'],
    },
    {
      id: 'proposal-sow-builder',
      name: 'Proposal & SOW Builder',
      status: 'build-ready',
      buyer: 'Agency, software studio, consultant, contractor, or B2B service owner writing repeated proposals',
      promise: 'Turn intake notes, scope calls, price bands, and past examples into a structured proposal and SOW draft.',
      firstProof: 'One client-ready draft with scope, assumptions, milestones, exclusions, and approval checklist.',
      setupInputs: ['Scope notes', 'Past proposal example', 'Service list', 'Price band', 'Approval checklist'],
      pricingLabel: `${serviceMmk('dashboard')} setup`,
      sourceCategory: 'service business',
      sourceArea: 'Yangon, Myanmar',
      contactPackage: 'Proposal & SOW Builder',
      productArea: 'Custom Solutions & AI Agents',
      placeholder: 'Paste the proposal workflow: intake notes, typical scope, price bands, required sections, and approval process.',
      next: 'Next: we generate one proposal/SOW draft from your real notes and tune the checklist before reuse.',
      sampleSources: ['scope notes', 'past proposal', 'service menu', 'approval checklist'],
      firstRunWorkflow: ['Parse intake notes', 'Map scope to services', 'Draft proposal', 'Create SOW checklist', 'Queue owner approval'],
      outputs: ['proposal draft', 'SOW draft', 'assumptions and exclusions', 'owner approval checklist'],
    },
  ].map((template) => ({
    ...template,
    entitlementLadder: buildEntitlementLadder(template),
  }))
}

function buildEntitlementLadder(template) {
  const sampleProof = `One approved source-pack proof: ${template.firstProof}`
  const freeCore =
    template.id === 'deskpos-quickstart'
      ? 'Free DeskPOS trial, worker matcher, setup checklist, and one checkout or booking proof without private connectors.'
      : `Free matcher, setup checklist, and ${sampleProof} without live connectors or recurring runs.`
  const paidPilot =
    template.id === 'deskpos-quickstart'
      ? 'Owner-approved private shop setup, payment receipt proof, first daily close, and handoff checklist.'
      : `Owner-approved paid pilot that turns the accepted first proof into a private ${template.productArea} workcell.`
  const premiumMaintained =
    template.id === 'deskpos-quickstart'
      ? 'Maintained POS workspace with daily close insight, receipts, backups, support, and premium AI diagnosis.'
      : `Maintained ${template.name} with source trace, connector setup, scheduled runs, approval queue, monitoring, and support.`

  return {
    free_core: {
      label: 'Free core',
      entitlement_code: 'free_core',
      includes: freeCore,
      gate: 'deterministic browser or sample-source proof; no private connector, write action, or recurring claim.',
    },
    paid_pilot: {
      label: 'Paid pilot',
      entitlement_code: 'paid_pilot',
      includes: paidPilot,
      gate: 'starts only after owner approves scope, source boundary, first-run checklist, and payment proof.',
    },
    premium_maintained: {
      label: 'Premium maintained',
      entitlement_code: 'premium_maintained',
      includes: premiumMaintained,
      gate: 'requires accepted proof, approved workspace, token cap, source trace, and monthly review.',
    },
    gated_hands: {
      label: 'Gated hands',
      entitlement_code: 'gated_hands',
      includes: 'Owner-approved computer-use or mobile actions only when API/export paths are not enough.',
      gate: 'requires consent, vaulting, audit logs, rollback plan, reliability checks, and explicit owner approval.',
    },
  }
}

function buildRolePlaybook(template) {
  return {
    owner: {
      label: 'Owner',
      first_action: `Approve the first proof target: ${template.firstProof}`,
      approval_focus: 'Scope, price, payment route, external sends, connector writes, and first production run.',
      success_signal: 'Owner can decide whether the worker saves time, reduces risk, or moves revenue before any recurring claim.',
    },
    operator: {
      label: 'Operator',
      first_action: `Collect the starting source pack: ${template.sampleSources.slice(0, 3).join(', ')}.`,
      approval_focus: 'Confirm sample quality, missing fields, edge cases, and whether the first proof matches daily work.',
      success_signal: 'Operator can repeat the workflow with less manual checking and fewer missed follow-ups.',
    },
    technical_admin: {
      label: 'Technical admin',
      first_action: `Map the approved source boundary for ${template.sourceCategory} data before any connector access.`,
      approval_focus: 'Accounts, permissions, API/export path, audit logs, vaulting, and rollback plan.',
      success_signal: 'Technical admin can explain what the worker can read, what it cannot do, and how every action is logged.',
    },
  }
}

export function buildAgentTemplateStarterKit(template) {
  return {
    id: template.id,
    name: template.name,
    status: template.status,
    buyer: template.buyer,
    product_area: template.productArea,
    source_category: template.sourceCategory,
    source_area: template.sourceArea,
    offer: {
      promise: template.promise,
      price_hint: template.pricingLabel,
      first_proof: template.firstProof,
      next_step: template.next,
    },
    intake_schema: {
      required: ['name', 'email', 'company', 'goal', 'sample_sources'],
      setup_inputs: template.setupInputs,
      sample_sources: template.sampleSources,
      approval_required_before: ['sending messages', 'writing to source systems', 'charging payments', 'editing live business records'],
    },
    adaptation_signals: [
      `template:${template.id}`,
      `product_area:${template.productArea}`,
      `source_category:${template.sourceCategory}`,
      `requested_package:${template.contactPackage}`,
    ],
    role_playbook: buildRolePlaybook(template),
    first_run_workflow: template.firstRunWorkflow,
    outputs: template.outputs,
    entitlement_ladder: template.entitlementLadder,
    acceptance_tests: [
      `Produces: ${template.firstProof}`,
      'Uses only approved sample sources on the first run.',
      'Shows source trace for every important number, record, or recommendation.',
      'Keeps every external action in approval-only mode until the owner signs off.',
      'Keeps free core, paid pilot, premium maintained, and gated hands entitlements separate.',
    ],
    deployment_mode: {
      first_run: 'read-only proof',
      production: 'cloud scheduled or owner-triggered workflow',
      human_gate: 'owner approval before send/write/payment actions',
    },
    contact_url: `/contact/?template=${template.id}`,
    setup_url: `/agent-templates/${template.id}/setup/`,
  }
}

export function buildAgentTemplateStarterKits(templates) {
  return templates.map(buildAgentTemplateStarterKit)
}

export function renderAgentTemplateStarterKitMarkdown(kit) {
  return `# ${kit.name}

Status: ${kit.status}

Buyer: ${kit.buyer}

Promise: ${kit.offer.promise}

Price hint: ${kit.offer.price_hint}

First proof: ${kit.offer.first_proof}

## Intake

Required fields: ${kit.intake_schema.required.join(', ')}

Setup inputs:
${kit.intake_schema.setup_inputs.map((item) => `- ${item}`).join('\n')}

Sample sources:
${kit.intake_schema.sample_sources.map((item) => `- ${item}`).join('\n')}

## First Run Workflow

${kit.first_run_workflow.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## Outputs

${kit.outputs.map((item) => `- ${item}`).join('\n')}

## Entitlement Ladder

Free core: ${kit.entitlement_ladder.free_core.includes}

Paid pilot: ${kit.entitlement_ladder.paid_pilot.includes}

Premium maintained: ${kit.entitlement_ladder.premium_maintained.includes}

Gated hands: ${kit.entitlement_ladder.gated_hands.includes}

## Role Playbook

Owner:
- First action: ${kit.role_playbook.owner.first_action}
- Approval focus: ${kit.role_playbook.owner.approval_focus}
- Success signal: ${kit.role_playbook.owner.success_signal}

Operator:
- First action: ${kit.role_playbook.operator.first_action}
- Approval focus: ${kit.role_playbook.operator.approval_focus}
- Success signal: ${kit.role_playbook.operator.success_signal}

Technical admin:
- First action: ${kit.role_playbook.technical_admin.first_action}
- Approval focus: ${kit.role_playbook.technical_admin.approval_focus}
- Success signal: ${kit.role_playbook.technical_admin.success_signal}

## Acceptance Tests

${kit.acceptance_tests.map((item) => `- ${item}`).join('\n')}

Contact URL: ${kit.contact_url}

Setup URL: ${kit.setup_url}
`
}
