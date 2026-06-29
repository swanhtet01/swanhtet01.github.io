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
  ]
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
    first_run_workflow: template.firstRunWorkflow,
    outputs: template.outputs,
    acceptance_tests: [
      `Produces: ${template.firstProof}`,
      'Uses only approved sample sources on the first run.',
      'Shows source trace for every important number, record, or recommendation.',
      'Keeps every external action in approval-only mode until the owner signs off.',
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

## Acceptance Tests

${kit.acceptance_tests.map((item) => `- ${item}`).join('\n')}

Contact URL: ${kit.contact_url}

Setup URL: ${kit.setup_url}
`
}
