export type YangonTyreSourcePack = {
  id: string
  name: string
  status: 'live' | 'mapped' | 'queued'
  sourceType: string
  evidence: string
  feedsApps: string[]
  note: string
}

export type YangonTyreConnectorExpansion = {
  id: string
  name: string
  status: 'live' | 'mapped' | 'queued'
  purpose: string
  apps: string[]
  firstJobs: string[]
}

export const YANGON_TYRE_SOURCE_PACKS: YangonTyreSourcePack[] = [
  {
    id: 'drive-ops-manual',
    name: 'Plant A operations manual',
    status: 'live',
    sourceType: 'Google Docs',
    evidence: 'Plant A operations manual covering mixing, rubberizing, extrusion, bead, cutting, building, curing, packing, warehouse, utilities, and QC.',
    feedsApps: ['Manufacturing Command', 'DQMS and Quality Lab', 'Maintenance and Reliability', 'Knowledge Graph and SOP Vault'],
    note: 'This gives the platform the real factory stage map, SOP structure, and KPI expectations for Plant A.',
  },
  {
    id: 'drive-tyre-analysis',
    name: 'Tyre Analysis workbook',
    status: 'live',
    sourceType: 'Google Sheets',
    evidence:
      'Workbook tabs cover bias and PCR sales, costing, production, distribution, revenue, price lists, specs, and tube or flap analysis.',
    feedsApps: ['Operating Intelligence Studio', 'Sales and Dealer Control', 'CEO Command Center'],
    note: 'This is the core management analytics spine for sales, costing, revenue, and product mix.',
  },
  {
    id: 'drive-plant-a',
    name: 'Plant A shared folders',
    status: 'live',
    sourceType: 'Google Drive folders and shortcuts',
    evidence: 'Planning, admin, tyre sales and inventory, GRN shortcuts, raw-stock details, tyre production, ISO forms, and procedure packs.',
    feedsApps: ['Receiving Control', 'Operations Control', 'Manufacturing Command', 'Supplier and Approval Control'],
    note: 'The folder structure already maps to GRN, raw material, production, ISO, and management review workflows.',
  },
  {
    id: 'drive-ceo-data',
    name: 'CEO data hub',
    status: 'mapped',
    sourceType: 'Google Drive folder',
    evidence: 'Shortcuts to 2025 YTF, 2026 YTF, export packs, and Bilin source bundles.',
    feedsApps: ['CEO Command Center', 'Operating Intelligence Studio'],
    note: 'This should become the leadership briefing lane for export, planning, and year-over-year performance review.',
  },
  {
    id: 'email-financials',
    name: 'Finance and purchase-order mail packs',
    status: 'mapped',
    sourceType: 'Email-linked Google Sheets',
    evidence: 'H1 2024, H2 2024, H1 2025 financial sheets plus NR purchase-order data listed in the source register.',
    feedsApps: ['Supplier and Approval Control', 'CEO Command Center', 'Operating Intelligence Studio'],
    note: 'These packs connect procurement, finance, and director review into the same evidence chain.',
  },
  {
    id: 'future-source-register',
    name: 'Data source register',
    status: 'live',
    sourceType: 'Google Docs',
    evidence: 'The source register already links Plant A, Plant B, historical folders, op guide, analysis workbook, financial packs, and planning docs.',
    feedsApps: ['Admin and Connector Control', 'Tenant App Foundry', 'Operating Intelligence Studio'],
    note: 'This becomes the tenant ingestion backlog and data-governance starting point.',
  },
]

export const YANGON_TYRE_CONNECTOR_EXPANSION: YangonTyreConnectorExpansion[] = [
  {
    id: 'gmail-intake',
    name: 'Gmail and attachment intake',
    status: 'live',
    purpose: 'Convert supplier, dealer, and finance threads into account updates, discrepancy cases, and director prompts.',
    apps: ['Sales and Dealer Control', 'Supplier and Approval Control', 'CEO Command Center'],
    firstJobs: ['thread-to-record capture', 'draft follow-up', 'evidence attachment'],
  },
  {
    id: 'drive-spine',
    name: 'Google Drive evidence spine',
    status: 'live',
    purpose: 'Index docs, sheets, SOPs, production records, and ISO files as the auditable plant memory.',
    apps: ['Manufacturing Command', 'DQMS and Quality Lab', 'Admin and Connector Control'],
    firstJobs: ['folder indexing', 'sheet snapshots', 'document-linked provenance'],
  },
  {
    id: 'website-catalog',
    name: 'Website and product catalog signals',
    status: 'queued',
    purpose: 'Bring public product, dealer, and inquiry surfaces into the commercial and leadership memory.',
    apps: ['Sales and Dealer Control', 'Operating Intelligence Studio'],
    firstJobs: ['web lead capture', 'product inquiry tagging', 'pricing or catalog sync'],
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics and funnel telemetry',
    status: 'queued',
    purpose: 'Turn traffic, campaign, and inquiry flow into measurable demand signals for managers.',
    apps: ['Operating Intelligence Studio', 'CEO Command Center'],
    firstJobs: ['traffic ingest', 'campaign attribution', 'lead-source scoring'],
  },
  {
    id: 'facebook-commerce',
    name: 'Facebook and social commercial inbox',
    status: 'queued',
    purpose: 'Capture social inquiries, dealer reactions, and campaign response into account memory and follow-up queues.',
    apps: ['Sales and Dealer Control', 'Operating Intelligence Studio'],
    firstJobs: ['message ingestion', 'campaign response tagging', 'dealer engagement summary'],
  },
  {
    id: 'chat-mesh',
    name: 'Viber, LINE, and WeChat internal and external chat mesh',
    status: 'queued',
    purpose: 'Promote fragmented chat updates into owner-based operating records for plant, supplier, and commercial workflows.',
    apps: ['Operations Control', 'Supplier and Approval Control', 'Sales and Dealer Control'],
    firstJobs: ['chat-linked task creation', 'decision evidence capture', 'follow-up reminders'],
  },
  {
    id: 'shopfloor-forms',
    name: 'Shopfloor mobile forms and line logs',
    status: 'mapped',
    purpose: 'Capture shift, batch, QC, and downtime data at the source without waiting for retrospective entry.',
    apps: ['Manufacturing Command', 'DQMS and Quality Lab', 'Maintenance and Reliability'],
    firstJobs: ['line entry forms', 'batch and lot capture', 'downtime reason coding'],
  },
]
