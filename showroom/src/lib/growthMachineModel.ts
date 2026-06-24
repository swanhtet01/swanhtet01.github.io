export const GROWTH_MACHINE_SUMMARY = {
  title: 'Growth Machine',
  score: 82,
  target: 'Turn one clear offer into daily posts, direct outreach, follow-up, and proof capture.',
  productThesis: 'The same system can become a client Sales Desk: lead sources, outreach, approvals, follow-up, and proof in one work queue.',
  currentOffer: 'Back Office Workflow Desk',
  publicCta: 'https://supermega.dev/contact',
} as const

export const GROWTH_MACHINE_LANES = [
  {
    id: 'offer',
    name: 'Offer',
    owner: 'Founder',
    status: 'Live',
    job: 'Keep one simple promise in market: send the workflow your team keeps chasing.',
    output: 'One page, one CTA, one short sales line.',
  },
  {
    id: 'content',
    name: 'Content',
    owner: 'Marketing agent',
    status: 'Ready',
    job: 'Publish one useful idea per day with a proof asset or direct example.',
    output: 'LinkedIn, X, Facebook, and short-form scripts.',
  },
  {
    id: 'accounts',
    name: 'Accounts',
    owner: 'Research agent',
    status: 'Ready',
    job: 'Find owner-led companies with visible manual work, file chaos, or approval bottlenecks.',
    output: 'Target account list with fit score and first workflow guess.',
  },
  {
    id: 'outreach',
    name: 'Outreach',
    owner: 'Sales agent',
    status: 'Review',
    job: 'Draft short, human messages. Founder reviews before sending.',
    output: 'Email, LinkedIn, WhatsApp, and call notes.',
  },
  {
    id: 'followup',
    name: 'Follow-up',
    owner: 'Revenue operator',
    status: 'Ready',
    job: 'Never lose a reply, next step, or promised proof artifact.',
    output: 'Lead tasks, stage updates, and meeting prep.',
  },
  {
    id: 'learning',
    name: 'Learning',
    owner: 'Strategy agent',
    status: 'Ready',
    job: 'Turn objections, replies, and usage proof into better copy and product modules.',
    output: 'Weekly insight memo and next experiment.',
  },
] as const

export const GROWTH_MARKET_SEGMENTS = [
  {
    id: 'owner-led-distributors',
    name: 'Owner-led distributors',
    signal: 'Quotes, stock questions, delivery notes, and customer follow-up happen across chat, email, and spreadsheets.',
    firstWorkflow: 'Quote and delivery follow-up desk',
    channels: ['LinkedIn', 'Facebook', 'direct email', 'warm intro'],
    score: 94,
  },
  {
    id: 'factories-warehouses',
    name: 'Factories and warehouses',
    signal: 'Receiving, QC, maintenance, documents, and approvals are tracked manually or in disconnected files.',
    firstWorkflow: 'Operations exception desk',
    channels: ['direct email', 'WhatsApp', 'site visit', 'referral'],
    score: 91,
  },
  {
    id: 'service-groups',
    name: 'Multi-location service businesses',
    signal: 'Owners need one view of customer issues, staff tasks, invoices, and branch updates.',
    firstWorkflow: 'Manager follow-up desk',
    channels: ['Facebook', 'Instagram', 'direct message', 'email'],
    score: 84,
  },
  {
    id: 'clinics-education',
    name: 'Clinics and education teams',
    signal: 'Forms, appointments, documents, payment follow-up, and approvals need controlled handling.',
    firstWorkflow: 'Intake and document desk',
    channels: ['LinkedIn', 'direct email', 'referral'],
    score: 78,
  },
  {
    id: 'construction-property',
    name: 'Construction and property teams',
    signal: 'Requests, site photos, contractor follow-up, invoices, and approvals need evidence attached.',
    firstWorkflow: 'Site request desk',
    channels: ['LinkedIn', 'direct email', 'referral', 'WhatsApp'],
    score: 76,
  },
] as const

export const GROWTH_DAILY_ACTIONS = [
  'Publish one concise post with one problem and one clear action.',
  'Research five target accounts and capture the likely messy workflow.',
  'Send five reviewed founder messages.',
  'Follow up every open reply or warm lead.',
  'Capture one proof artifact: screenshot, workflow map, objection, or call note.',
  'Improve one line of copy based on real response data.',
] as const

export const GROWTH_AUTOMATION_STACK = [
  {
    layer: 'Source',
    tools: ['Website contact form', 'manual research', 'LinkedIn/Facebook search', 'Google Drive notes', 'Gmail replies'],
    automation: 'Capture sources into lead/task rows without mass sending.',
  },
  {
    layer: 'Queue',
    tools: ['Lead ledger', 'workspace tasks', 'campaign CSV/JSON', 'revenue pipeline'],
    automation: 'Every account gets owner, stage, next step, channel, and proof link.',
  },
  {
    layer: 'Agent work',
    tools: ['Research agent', 'copy agent', 'sales follow-up agent', 'proof analyst'],
    automation: 'Agents draft, score, summarize, and prepare next actions for human approval.',
  },
  {
    layer: 'Distribution',
    tools: ['LinkedIn', 'X', 'Facebook', 'email', 'WhatsApp'],
    automation: 'Post and outreach are prepared from queues; sending stays reviewed.',
  },
  {
    layer: 'Learning',
    tools: ['Weekly memo', 'objection log', 'win/loss notes', 'product roadmap'],
    automation: 'Replies and objections become better offer copy and module requirements.',
  },
] as const

export const GROWTH_PRODUCTIZATION_STEPS = [
  'Use this internally until it reliably creates calls.',
  'Package the same workflow as a client Sales Desk.',
  'Connect client Gmail, Drive, Sheets, forms, and website leads.',
  'Add human approval before AI-generated outreach is sent.',
  'Sell the module as Back Office Workflow Desk for leads, follow-up, proof, and next actions.',
] as const
