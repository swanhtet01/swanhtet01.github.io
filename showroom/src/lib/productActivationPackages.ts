import type { PublicProductAlias } from './publicProductAliases'

export type PublicProductPortalId = PublicProductAlias['portalId']

export type ProductActivationPackage = {
  portalId: PublicProductPortalId
  packageId: string
  offer: string
  quickStart: string
  packageOutcome: string
  firstWorkflow: string
  pilotPrice: string
  retainerPath: string
  installTime: string
  includedKit: string[]
  automationPipeline: string[]
  repoStack: string[]
  proofGate: string
  runtimeWorkspace: string
}

export const productActivationPackages: Record<PublicProductPortalId, ProductActivationPackage> = {
  'agency-client-operator': {
    portalId: 'agency-client-operator',
    packageId: 'agency-client-operator',
    offer: 'Plug in one client workflow and get an approval-gated client-ops operator.',
    quickStart: 'One client sample plus approval owner',
    packageOutcome: 'Client queue, draft asks, weekly report, and proof ledger',
    firstWorkflow: 'Client request intake, missing assets, approval follow-up, task routing, and weekly report.',
    pilotPrice: 'USD 5k pilot, then USD 10k/mo target retainer',
    retainerPath: '10 retained agency clients at the target retainer models the road to 100k MRR.',
    installTime: '5 working days after one redacted client sample and approval owner are provided.',
    includedKit: [
      'Template folder: templates/agency-client-operator',
      'Onboarding kit with data request, access matrix, and owner questions',
      'Synthetic first-run demo with dry-run queue and report output',
      'Paid pilot kit with acceptance tests and ROI calculator',
      'Runtime workspace: workspaces/agency-client-operator',
    ],
    automationPipeline: [
      'Visitor selects Agency Client Operator',
      'Owner submits one redacted client sample',
      'Operator generates queue, draft asks, and weekly report',
      'Owner approves before any client-facing send',
      'Payment proof unlocks runtime workspace install',
    ],
    repoStack: [
      'OpenAI Agents SDK JS for handoffs, guardrails, and tool orchestration',
      'n8n for deterministic Gmail, Drive, Sheets, Slack, and webhook handoffs',
      'Composio for authenticated SaaS tool actions after approval',
      'Stagehand + Playwright for browser-only client admin tasks with screenshot proof',
      'Langfuse for traces, evals, prompt versions, cost, and latency evidence',
    ],
    proofGate:
      'No client send, scope change, billing action, writeback, or revenue claim happens without owner approval and verifier evidence.',
    runtimeWorkspace: 'Agent charter, tool policy, approval queue, run ledger, proof ledger, and client report lane.',
  },
  'ai-workflow-desk': {
    portalId: 'ai-workflow-desk',
    packageId: 'document-extraction-ledger',
    offer: 'Turn messy files, screenshots, exports, and forms into a reviewed operating ledger.',
    quickStart: 'Five sample files plus field rules',
    packageOutcome: 'Source ledger, exceptions, reviewer decisions, and export pack',
    firstWorkflow: 'Source ingestion, structured extraction, exception review, and export-ready records.',
    pilotPrice: 'USD 3k-5k setup, then recurring managed workflow retainer',
    retainerPath: 'Expand from one reviewed document lane into recurring back-office queues.',
    installTime: '3-5 working days after five representative samples are supplied.',
    includedKit: [
      'Source register and field map',
      'Review queue with exception status',
      'Export template and acceptance checks',
      'Owner approval checklist',
      'Proof pack with source links and first ROI note',
    ],
    automationPipeline: [
      'Upload samples',
      'Extract fields into a ledger',
      'Flag missing or uncertain records',
      'Reviewer approves export',
      'Next queue is added only after proof',
    ],
    repoStack: [
      'OpenAI Agents SDK for extraction review agents and guardrails',
      'Google Drive and Sheets exports for low-friction setup',
      'n8n for upload, notify, and export automation',
      'Supabase or Neon for persistent reviewed records',
      'Mastra evals for extraction quality checks',
    ],
    proofGate: 'No source-system writeback or public claim until extracted fields and exceptions are reviewed.',
    runtimeWorkspace: 'Source ledger, exception queue, reviewer decisions, export log, and weekly proof summary.',
  },
  'agentops-toolbox': {
    portalId: 'agentops-toolbox',
    packageId: 'back-office-workflow-desk',
    offer: 'Install a controlled AI work queue for one recurring back-office job.',
    quickStart: 'One repeated job plus five examples',
    packageOutcome: 'Approval queue, run ledger, blocked actions, and weekly value report',
    firstWorkflow: 'Inbox, research, CRM, support, quote, or portal work prepared for human approval.',
    pilotPrice: 'USD 5k setup, then USD 6k/mo managed queue target',
    retainerPath: 'Start with one queue, then add more queues after weekly proof shows value.',
    installTime: '4-5 working days after workflow samples and blocked actions are approved.',
    includedKit: [
      'Workflow scope card',
      'Permission matrix',
      'Owner approval queue',
      'Run ledger and proof ledger',
      'Cloud handoff package for safe recurring jobs',
    ],
    automationPipeline: [
      'Scope one job',
      'Collect five examples',
      'Generate draft outputs',
      'Review blocked actions',
      'Promote approved queue to controlled cloud runtime',
    ],
    repoStack: [
      'OpenAI Agents SDK for multi-step operator flow',
      'LangGraph for long-running state and human approval checkpoints',
      'Cloudflare Workers or Trigger.dev for scheduled jobs',
      'Browser Use or Playwright for no-API portal work',
      'Composio for approved SaaS actions',
    ],
    proofGate: 'Sends, writes, payments, credentials, and customer-impacting decisions stay blocked.',
    runtimeWorkspace: 'Agent scope, allowed tools, dry-run jobs, approval queue, proof ledger, and weekly value report.',
  },
  'operations-digital-twin': {
    portalId: 'operations-digital-twin',
    packageId: 'factory-issues-maintenance-quality',
    offer: 'Deploy one factory/warehouse control lane before a full ERP rebuild.',
    quickStart: 'One issue lane plus manager owner',
    packageOutcome: 'Daily board, evidence ledger, CAPA queue, and closeout report',
    firstWorkflow: 'Issue log, QC evidence, maintenance risk, receiving hold, or manager daily review.',
    pilotPrice: 'USD 5k-7.5k pilot, then modular plant operations retainer',
    retainerPath: 'Land one daily-control lane, then add maintenance, quality, receiving, and asset modules.',
    installTime: '5-10 working days after one plant lane and manager owner are named.',
    includedKit: [
      'WCM daily board',
      'ISO evidence checklist',
      'CAPA and maintenance queue',
      'Manager closeout report',
      'Optional meter or IoT pilot checklist',
    ],
    automationPipeline: [
      'Import current log or sheet',
      'Normalize issues and owners',
      'Draft manager actions',
      'Attach evidence',
      'Close only after manager review',
    ],
    repoStack: [
      'OpenAI Agents SDK for manager brief and issue classification',
      'n8n for spreadsheet, Drive, and email handoffs',
      'Supabase or Neon for evidence and action ledgers',
      'Playwright for ERP/browser admin lanes',
      'Cloudflare Workers for scheduled daily briefs',
    ],
    proofGate: 'Hardware, meter claims, ERP writes, and production changes wait for source proof and owner approval.',
    runtimeWorkspace: 'Issue board, evidence ledger, CAPA queue, maintenance queue, action owner map, and closeout report.',
  },
  'restaurant-group-os': {
    portalId: 'restaurant-group-os',
    packageId: 'restaurant-pos-menu-inventory',
    offer: 'Launch a simple counter, menu, payment-proof, stock, and daily-close system.',
    quickStart: 'Menu, payment habit, and closeout owner',
    packageOutcome: 'Orders, payment proof, stock notes, shift close, and owner report',
    firstWorkflow: 'Menu upload, order capture, payment proof, stock note, shift handover, and owner report.',
    pilotPrice: 'USD 2k-5k setup, then branch operations retainer',
    retainerPath: 'Start with one branch, then add QR menu, stock, payments, and multi-branch reporting.',
    installTime: '3-7 working days after menu, payment habit, and closeout owner are supplied.',
    includedKit: [
      'Menu/item import',
      'Order and payment-proof queue',
      'Stock and waste notes',
      'Daily close checklist',
      'Owner report and branch comparison',
    ],
    automationPipeline: [
      'Upload menu and item list',
      'Capture orders and payment proof',
      'Flag missing proof or stock risk',
      'Manager reviews shift close',
      'Owner gets daily report',
    ],
    repoStack: [
      'OpenAI Agents SDK for closeout summaries and anomaly notes',
      'Google Sheets or Supabase for branch records',
      'n8n for daily report delivery',
      'Stripe or local payment proof ledger after review',
      'Vercel app routes for branch-facing UI',
    ],
    proofGate: 'Payment, accounting export, loyalty, and customer messaging need reconciliation and human approval.',
    runtimeWorkspace: 'Menu, orders, proof ledger, stock notes, shift close, and owner report.',
  },
}
