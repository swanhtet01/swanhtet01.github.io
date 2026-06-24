export type ProductCompetitor = {
  name: string
  pattern: string
  sourceUrl: string
}

export type ProductCompetitiveReview = {
  productId: string
  productName: string
  market: string
  targetIncumbents: ProductCompetitor[]
  incumbentStrengths: string[]
  supermegaAdvantage: string
  gaps: string[]
  productUpgrades: string[]
  nextFrameworks: string[]
  clientProof: string
}

export const publicProductCompetitiveReviews: ProductCompetitiveReview[] = [
  {
    productId: 'ai-workflow-desk',
    productName: 'Back Office Workflow Desk',
    market: 'Custom work management, internal apps, and workflow automation',
    targetIncumbents: [
      {
        name: 'Airtable',
        pattern: 'Shared relational data, custom interfaces, automations, and AI-native app building.',
        sourceUrl: 'https://www.airtable.com/platform',
      },
      {
        name: 'monday.com',
        pattern: 'People-and-agent work platform with agents, permissions, action logs, and simulation mode.',
        sourceUrl: 'https://monday.com/',
      },
      {
        name: 'Retool Workflows',
        pattern: 'Developer-grade workflow automation with triggers, connectors, custom code, and deployable APIs.',
        sourceUrl: 'https://retool.com/build-enterprise-apps/workflows',
      },
    ],
    incumbentStrengths: [
      'Visual app building from shared data',
      'Templates and interfaces for non-technical operators',
      'Automations, agents, permissions, and activity logs',
      'Connector breadth and developer escape hatches',
    ],
    supermegaAdvantage:
      'Sell one painful workflow first, include source evidence and approval gates by default, and avoid forcing the client into a generic work platform before value is proven.',
    gaps: [
      'Needs a reusable source-schema builder for each workflow type.',
      'Needs a visible automation simulation log before any outbound or writeback action.',
      'Needs one-click client handoff packets with acceptance checks, roles, and connector scope.',
    ],
    productUpgrades: [
      'Add role-specific templates for request intake, approval queue, source register, and owner review.',
      'Add an action simulation ledger showing what an agent would read, draft, send, or update.',
      'Add connector adapters for Drive, Sheets/CSV, Gmail exports, REST APIs, and webhook intake.',
      'Add field mapping, duplicate detection, stale-source flags, and rollback notes for every source.',
    ],
    nextFrameworks: ['Playwright release checks', 'OpenAI eval fixtures', 'OAuth/service-account connector registry', 'event log and audit ledger'],
    clientProof:
      'One client workflow runs from source sample to queue row to owner decision, with a screenshot and acceptance checklist.',
  },
  {
    productId: 'operations-digital-twin',
    productName: 'Factory Operations App',
    market: 'Frontline operations, light MES, quality, maintenance, and asset control',
    targetIncumbents: [
      {
        name: 'Tulip',
        pattern: 'Frontline app suites, connected operations, device integration, and real-time manufacturing visibility.',
        sourceUrl: 'https://tulip.co/platform/',
      },
      {
        name: 'Odoo Manufacturing',
        pattern: 'Manufacturing orders, work orders, barcode, BoM, quality checks, maintenance, and workcenter tablets.',
        sourceUrl: 'https://www.odoo.com/app/manufacturing-features',
      },
      {
        name: 'MaintainX',
        pattern: 'Work orders, preventive maintenance, asset management, inspections, parts inventory, and reporting.',
        sourceUrl: 'https://www.getmaintainx.com/',
      },
    ],
    incumbentStrengths: [
      'Operator work instructions and shop-floor tablet flows',
      'Work orders, quality checks, maintenance requests, and traceability',
      'Asset, parts, inspection, and preventive-maintenance records',
      'Device, sensor, barcode, and ERP connector narratives',
    ],
    supermegaAdvantage:
      'Start with the plant manager control surface: open issues, source proof, owner, risk, CAPA, maintenance, and daily action before attempting full MES or ERP replacement.',
    gaps: [
      'Needs first-class work order, asset, inspection, and CAPA entities instead of only UI proof.',
      'Needs barcode/QR asset scan flows for mobile and tablet operators.',
      'Needs maintenance reliability metrics such as downtime, repeat fault, MTBF, and planned versus reactive work.',
    ],
    productUpgrades: [
      'Add an asset and work-order model with owner, status, source evidence, due date, and closeout proof.',
      'Add quality control points, NCR/CAPA, 5W1H, ISO evidence export, and manager approval state.',
      'Add preventive-maintenance schedule, parts notes, downtime reason, and repeat-fault review.',
      'Add barcode/QR scanning and mobile photo proof for receiving, QC, maintenance, and issue closeout.',
    ],
    nextFrameworks: ['QR/barcode capture', 'IoT sandbox lane', 'Postgres audit tables', 'maintenance metric fixtures', 'factory mobile QA'],
    clientProof:
      'One plant lane shows issue intake, asset signal, CAPA evidence, maintenance action, and manager closeout in a controlled workflow.',
  },
  {
    productId: 'restaurant-group-os',
    productName: 'Restaurant POS + Inventory',
    market: 'Restaurant POS, menu, payments, inventory, kitchen, and owner reporting',
    targetIncumbents: [
      {
        name: 'Square for Restaurants',
        pattern: 'Restaurant POS, inventory, live reporting, kitchen routing, ticket layouts, timers, and staff tools.',
        sourceUrl: 'https://squareup.com/ca/en/point-of-sale/restaurants/features',
      },
      {
        name: 'Toast',
        pattern: 'Orders, sales, payments, restaurant hardware, online ordering, team management, invoices, and back-office visibility.',
        sourceUrl: 'https://pos.toasttab.com/how-toast-works',
      },
      {
        name: 'Lightspeed Restaurant',
        pattern: 'Menus, sales, orders, inventory, staff, table management, handheld payments, and multi-location control.',
        sourceUrl: 'https://www.lightspeedhq.com/pos/b/',
      },
    ],
    incumbentStrengths: [
      'Fast POS screens and restaurant-grade hardware expectations',
      'Menu modifiers, QR/online ordering, payment processing, and receipts',
      'Inventory, low-stock, purchase, and margin visibility',
      'Kitchen routing, table status, staff permissions, and daily reports',
    ],
    supermegaAdvantage:
      'Win where small operators are not ready for a full POS migration: menu cleanup, payment proof, daily close, stock notes, branch reporting, and owner review in one practical app.',
    gaps: [
      'Needs payment-provider and receipt hardware boundaries before claiming production POS replacement.',
      'Needs menu modifier, availability, low-stock, and cash-up flows that staff can use in under one minute.',
      'Needs branch/day reporting and settlement proof before deeper accounting integration.',
    ],
    productUpgrades: [
      'Add menu/item/modifier builder with QR menu publish review and item availability.',
      'Add payment proof reconciliation, cash-up variance, settlement status, and manager approval.',
      'Add stock decrement, low-stock alert, supplier note, waste/prep note, and daily close summary.',
      'Add kitchen station, table/order state, shift handover, and owner daily digest.',
    ],
    nextFrameworks: ['payment proof parser', 'offline-safe local queue', 'receipt/export adapter', 'branch dashboard fixtures', 'mobile cashier QA'],
    clientProof:
      'One restaurant day closes with menu changes, orders, payment proof, stock exceptions, cash-up review, and owner digest.',
  },
]

export const catalogProductCompetitiveReviews = [
  {
    productId: 'market-intel-agent-room',
    productName: 'Market Intel Agent Room',
    incumbents: ['AlphaSense', 'CB Insights', 'Perplexity Enterprise', 'Crunchbase'],
    upgrade: 'Add saved source sets, bull/bear/risk debate, citation quality scoring, and decision-owner approval.',
  },
  {
    productId: 'lead-radar-account-research-desk',
    productName: 'Lead Radar and Account Research Desk',
    incumbents: ['Apollo', 'Clay', 'LinkedIn Sales Navigator', 'HubSpot'],
    upgrade: 'Add account enrichment, workflow-pain hypothesis, reviewed outreach drafts, reply ledger, and consent/rate-limit guardrails.',
  },
  {
    productId: 'document-intake-data-cleanroom',
    productName: 'Document Intake and Data Cleanroom',
    incumbents: ['UiPath Document Understanding', 'Rossum', 'ABBYY', 'Google Document AI'],
    upgrade: 'Add extraction confidence, duplicate/stale-source flags, source evidence, review queue, and export register.',
  },
  {
    productId: 'contract-policy-review-desk',
    productName: 'Contract and Policy Review Desk',
    incumbents: ['Ironclad', 'DocuSign CLM', 'LinkSquares', 'SpotDraft'],
    upgrade: 'Add obligation/date extraction, red-flag checklist, renewal watch, reviewer signoff, and legal-advice boundary.',
  },
  {
    productId: 'meeting-action-desk',
    productName: 'Meeting to Action Desk',
    incumbents: ['Otter.ai', 'Fireflies.ai', 'Fathom', 'Notion AI'],
    upgrade: 'Add decision log, owner/deadline extraction, follow-up drafts, next agenda, and task-system handoff.',
  },
  {
    productId: 'competitor-trend-watchtower',
    productName: 'Competitor and Trend Watchtower',
    incumbents: ['Crayon', 'Klue', 'Kompyte', 'Similarweb'],
    upgrade: 'Add monitored-source registry, change diff, signal severity, founder response memo, and permissioned source policy.',
  },
  {
    productId: 'board-pack-report-builder',
    productName: 'Board Pack and Report Builder',
    incumbents: ['Beautiful.ai', 'Canva', 'Google Slides', 'Looker Studio'],
    upgrade: 'Add source-backed KPI story, decision asks, deck/report export, approval workflow, and recurring monthly packet.',
  },
  {
    productId: 'workflow-simulator-roi-calculator',
    productName: 'Workflow Simulator and ROI Calculator',
    incumbents: ['Celonis', 'Process Street', 'Miro', 'Asana Workflow'],
    upgrade: 'Add current-state map, time/cost assumptions, acceptance checks, pilot pricing, and before/after proof.',
  },
  {
    productId: 'custom-workflow-app-starter',
    productName: 'Back Office Workflow Desk',
    incumbents: ['Airtable', 'monday.com', 'Retool', 'Zapier'],
    upgrade: 'Add template app shell, source schema, role queues, agent simulation log, connector registry, and release proof.',
  },
  {
    productId: 'deal-diligence-risk-room',
    productName: 'Deal Diligence Risk Room',
    incumbents: ['PitchBook', 'DealRoom', 'AlphaSense', 'Datasite'],
    upgrade: 'Add source map, upside/downside debate, red flags, unknowns, diligence question queue, and decision signoff.',
  },
  {
    productId: 'customer-support-qa-miner',
    productName: 'Customer Support QA Miner',
    incumbents: ['Zendesk QA', 'Intercom', 'Klaus', 'MaestroQA'],
    upgrade: 'Add ticket theme clustering, severity, saved reply drafts, FAQ gaps, escalation owner, and human reply approval.',
  },
  {
    productId: 'finance-ops-reconciliation-desk',
    productName: 'Finance Ops Reconciliation Desk',
    incumbents: ['QuickBooks', 'Xero', 'Ramp', 'BlackLine'],
    upgrade: 'Add invoice/receipt matching, duplicate flags, exception queue, approval task, and accounting-advice boundary.',
  },
  {
    productId: 'hiring-pipeline-review-desk',
    productName: 'Hiring Pipeline Review Desk',
    incumbents: ['Greenhouse', 'Lever', 'Ashby', 'Workable'],
    upgrade: 'Add role-fit matrix, candidate evidence cards, interview pack, follow-up drafts, and no-automated-decision policy.',
  },
] as const

export const competitorResearchSources = [
  'https://www.airtable.com/platform',
  'https://monday.com/',
  'https://retool.com/build-enterprise-apps/workflows',
  'https://tulip.co/platform/',
  'https://www.odoo.com/app/manufacturing-features',
  'https://www.getmaintainx.com/',
  'https://squareup.com/ca/en/point-of-sale/restaurants/features',
  'https://pos.toasttab.com/how-toast-works',
  'https://www.lightspeedhq.com/pos/b/',
] as const
