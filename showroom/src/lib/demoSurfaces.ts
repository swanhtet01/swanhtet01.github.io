import { PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID } from './publicProductAliases'

export const posDemoBaseUrl = 'https://pos.supermega.dev'
export const appClientLoginBaseUrl = 'https://app.supermega.dev'
const POS_LOGIN_ROUTE = '/pos/login'
const POS_ROLE_ROUTE = '/pos/role'
const POS_WORKSPACE_ROUTE = '/pos/workspace'
const POS_APP_ROUTES = new Set(['/app/restaurant-pos', '/app/restaurant-os'])

function normalizeRoute(route: string) {
  const value = String(route || '').trim()
  if (!value) {
    return '/app/start'
  }
  if (!value.startsWith('/')) {
    return `/${value}`
  }
  return value
}

function shouldUsePosHost(portalId: string, route: string) {
  const normalizedRoute = normalizeRoute(route)
  return portalId === 'restaurant-group-os' || POS_APP_ROUTES.has(normalizedRoute)
}

export function resolveProductAppEntryRoute(portalId: string, route: string) {
  if (shouldUsePosHost(portalId, route)) {
    return `${posDemoBaseUrl}${POS_LOGIN_ROUTE}?next=${encodeURIComponent(POS_ROLE_ROUTE)}`
  }
  return normalizeRoute(route)
}

export function resolveProductWorkspaceRoute(portalId: string, route: string) {
  if (shouldUsePosHost(portalId, route)) {
    return `${posDemoBaseUrl}${POS_WORKSPACE_ROUTE}`
  }
  return normalizeRoute(route)
}

export function buildProofLoginHref(portalId: string, route: string) {
  const normalizedRoute = normalizeRoute(route)
  if (shouldUsePosHost(portalId, normalizedRoute)) {
    return `${posDemoBaseUrl}${POS_LOGIN_ROUTE}?next=${encodeURIComponent(POS_ROLE_ROUTE)}`
  }
  return `${appClientLoginBaseUrl}/login?proof=${encodeURIComponent(portalId)}&next=${encodeURIComponent(normalizedRoute)}`
}

export const publicProductNameContract = ['Agency Client Operator', 'Document Extraction Ledger', 'Back Office Workflow Desk', 'Factory Operations App', 'Restaurant POS + Inventory'] as const

export const sharedPortalShellModules = [
  {
    label: 'Login and roles',
    detail: 'One app login opens the correct company, role, and modules.',
  },
  {
    label: 'Daily queue',
    detail: 'Open work has an owner, due date, evidence, and status.',
  },
  {
    label: 'Source room',
    detail: 'Files, links, exports, photos, and notes stay attached to the work.',
  },
  {
    label: 'Approvals',
    detail: 'Important changes wait for human review before writeback.',
  },
  {
    label: 'Owner report',
    detail: 'Leaders get the short daily summary, KPI movement, and decisions.',
  },
  {
    label: 'Release proof',
    detail: 'Routes, mobile layout, login, and data boundaries are checked before handoff.',
  },
] as const

export const productDemoSurfaces = [
  {
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agency-client-operator'].publicName,
    portalId: 'agency-client-operator',
    to: '/app/cloud-agent-army',
    detail: 'Client intake, missing assets, draft updates, approval follow-up, and weekly reports.',
    badge: 'Agency operator',
    audience: 'Agency owner / account lead / delivery lead',
    modules: ['Client intake', 'Assets', 'Approvals', 'Reports'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agency-client-operator'].mainShot,
    publicDemo: true,
  },
  {
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'].publicName,
    portalId: 'ai-workflow-desk',
    to: '/app/documents',
    detail: 'Approved files, extracted fields, exception review, export proof.',
    badge: 'Document proof',
    audience: 'Owner / operator / admin',
    modules: ['Source register', 'Field extraction', 'Exceptions', 'Export'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'].mainShot,
    publicDemo: true,
  },
  {
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agentops-toolbox'].publicName,
    portalId: 'agentops-toolbox',
    to: '/app/cloud-agent-army',
    detail: 'Inbox, spreadsheet, support, CRM, research, and ops admin work routed through controlled queues.',
    badge: 'Managed operator',
    audience: 'Owner / operator / agency partner',
    modules: ['Scope', 'Sources', 'Queue', 'Approval'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agentops-toolbox'].mainShot,
    publicDemo: true,
  },
  {
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['operations-digital-twin'].publicName,
    portalId: 'operations-digital-twin',
    to: '/app/factory-operations',
    detail: 'Assets, anomalies, CAPA, maintenance, source proof.',
    badge: 'Factory system',
    audience: 'Owner / plant / quality / maintenance / warehouse',
    modules: ['Assets', 'Anomalies', 'CAPA', 'Maintenance'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['operations-digital-twin'].mainShot,
    publicDemo: true,
  },
  {
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['restaurant-group-os'].publicName,
    portalId: 'restaurant-group-os',
    to: '/app/restaurant-pos',
    detail: 'Menu, orders, payment proof, stock, daily close.',
    badge: 'Counter system',
    audience: 'Restaurant, cafe, retail, or service counter owner',
    modules: ['Menu', 'Orders', 'Payments', 'Closeout'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['restaurant-group-os'].mainShot,
    publicDemo: true,
  },
  {
    label: 'Record Room',
    portalId: 'easy-erp',
    to: '/app/erp',
    detail: 'Compatibility route for item master, inventory ledger, purchase queue, and order register.',
    badge: 'Records',
    audience: 'Owner / admin / warehouse / finance',
    modules: ['Item master', 'Inventory ledger', 'Purchase queue', 'Order register'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'].mainShot,
    publicDemo: false,
  },
  {
    label: 'Factory Module Pack',
    portalId: 'industrial-plant-os',
    to: '/app/industrial-os',
    detail: 'Factory expansion modules for daily management, quality proof, maintenance risk, and receiving control.',
    badge: 'Factory module',
    audience: 'Owner / plant manager',
    modules: ['WCM board', 'Quality proof', 'Maintenance', 'Receiving'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['operations-digital-twin'].mainShot,
    publicDemo: false,
  },
  {
    label: 'Document Extraction Ledger',
    portalId: 'source-intake',
    to: '/app/client-room',
    detail: 'PDFs, images, folders, sheets, and exports become reviewable records with flags and owner decisions.',
    badge: 'Included module',
    audience: 'Any team with untrusted files or scattered operational evidence',
    modules: ['Source register', 'Field extraction', 'Exception queue', 'Export register'],
    shot: '/site/shots/live-demo-clean-records.svg',
    publicDemo: false,
  },
  {
    label: 'Internal Setup',
    portalId: 'portal-factory',
    to: '/app/portal-factory',
    detail: 'Build a client account from a checklist: roles, modules, source inputs, review gates, and go-live QA.',
    badge: 'Setup',
    audience: 'SuperMega delivery team',
    modules: ['Client intake', 'Module map', 'Prepared checks', 'Go-live QA'],
    publicDemo: false,
  },
  {
    label: 'Integration Studio',
    portalId: 'agentic-integration-studio',
    to: '/app/integration-studio',
    detail: 'Turn proven external tools into governed pilots, acceptance checks, and client-ready modules.',
    badge: 'Pilot studio',
    audience: 'Founder, product, and automation lead',
    modules: ['Repo radar', 'Fusion pilots', 'Guardrails', 'Acceptance checks'],
    publicDemo: false,
  },
] as const

export const productFocusLanes = [
  {
    role: 'Main',
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agency-client-operator'].publicName,
    portalId: 'agency-client-operator',
    to: '/app/cloud-agent-army',
    detail:
      'Run one agency client workflow: intake, missing assets, draft client updates, approvals, and weekly report.',
    badge: 'Agency pilot',
    audience: 'Marketing, development, AI, creative, and operations agencies',
    modules: ['Client queue', 'Asset asks', 'Draft updates', 'Weekly report'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agency-client-operator'].mainShot,
  },
  {
    role: 'Main',
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agentops-toolbox'].publicName,
    portalId: 'agentops-toolbox',
    to: '/app/cloud-agent-army',
    detail:
      'Pick one recurring back-office job, attach source examples, set blocked actions, then run a managed review queue.',
    badge: 'AgentOps',
    audience: 'Owner-led teams, service businesses, agencies, and operators replacing repeated admin work',
    modules: ['Scope', 'Source intake', 'Approval queue', 'Value ledger'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agentops-toolbox'].mainShot,
  },
  {
    role: 'Main',
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'].publicName,
    portalId: 'ai-workflow-desk',
    to: '/app/documents',
    detail:
      'Upload approved files, map fields, review exceptions, and export reviewed records.',
    badge: 'Files-first proof',
    audience: 'Any team starting from messy files or intake records',
    modules: ['Sources', 'Fields', 'Review', 'Export'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'].mainShot,
  },
  {
    role: 'Expansion',
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['operations-digital-twin'].publicName,
    portalId: 'operations-digital-twin',
    to: '/app/factory-operations',
    detail:
      'Asset state, anomaly queue, CAPA, maintenance, receiving proof.',
    badge: 'Factory system',
    audience: 'Factory owner, plant manager, quality, maintenance, warehouse, and finance',
    modules: ['WCM board', 'ISO evidence', 'CAPA / 5W1H', 'Maintenance'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['operations-digital-twin'].mainShot,
  },
  {
    role: 'Expansion',
    label: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['restaurant-group-os'].publicName,
    portalId: 'restaurant-group-os',
    to: '/app/restaurant-pos',
    detail:
      'Menu, orders, payment proof, stock guard, owner closeout.',
    badge: 'POS',
    audience: 'Restaurant, cafe, retail food, or service counter owner',
    modules: ['Menu', 'Orders', 'Payments', 'Closeout'],
    shot: PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['restaurant-group-os'].mainShot,
  },
  {
    role: 'Expansion',
    label: 'Service Desk POS',
    portalId: 'spa-service-desk',
    to: '/app/service-desk',
    detail:
      'Checkout, expenses, room flow, daily close, setup.',
    badge: 'Service POS',
    audience: 'Spa, salon, clinic, studio, or service-retail owner',
    modules: ['Checkout', 'Cash-out', 'Room flow', 'Ledger'],
    shot: '/site/shots/live-demo-service-desk.png',
  },
] as const

export const productFeatureChecklists = {
  'agency-client-operator': [
    'Client request intake from inbox, tracker, Drive, chat, or notes',
    'Missing-asset queue with owner, due date, and draft ask',
    'Draft client updates and weekly reports before any send',
    'Approval gate before client-facing messages, scope changes, or billing actions',
    'Proof ledger for requests handled, blockers found, decisions needed, and saved coordination time',
  ],
  'ai-workflow-desk': [
    'Source intake from files, screenshots, sheets, exports, and links',
    'Work queue with owner, status, proof, due date, and next action',
    'Owner review before messages, billing, claims, or writeback',
    'Mobile and desktop release check before handoff',
    'Proof pack with source, acceptance checks, and first ROI note',
  ],
  'agentops-toolbox': [
    'One repeated back-office job scoped before any broad automation',
    'Agent work queue with source proof, draft output, review owner, and blocked action state',
    'Weekly value ledger for completed work, misses, decisions, and time saved estimate',
    'Approval gate before sends, writes, payments, credentials, or customer-impacting decisions',
    'Agency partner rollout kit after the first managed queue is proven',
  ],
  'operations-digital-twin': [
    'WCM daily board for open issues, holds, owners, and closeout',
    'ISO 9001 evidence control with source link and review status',
    'NCR, CAPA, 5W1H, and root-cause review flow',
    'Maintenance reliability and repeat-fault review',
    'Receiving, supplier claim, and stock movement control',
    'Asset or meter signal pilot with safe review boundary',
  ],
  'restaurant-group-os': [
    'Menu and QR setup from PDF, image, sheet, or text',
    'Orders, payments, and settlement proof capture',
    'Cash-up close with mismatch and missing-proof checks',
    'Stock, prep, waste, and supplier notes',
    'Shift handover with manager review',
    'Owner daily report and branch comparison',
  ],
} as const

export const dataConnectionOptions = [
  {
    label: 'Upload first',
    detail: 'Screenshots, PDFs, photos, sheets, CSVs, menus, reports, and exports are enough for the first build.',
  },
  {
    label: 'Map links',
    detail: 'Drive folders, Sheets, Gmail threads, POS exports, ERP exports, forms, and shared folders can be mapped after approval.',
  },
  {
    label: 'Connect accounts',
    detail: 'OAuth and service accounts are added only after scope, access, and review rules are approved.',
  },
  {
    label: 'Add devices',
    detail: 'ESP32 and meters are prototypes first. Production telemetry needs isolation, calibration, and qualified safety review.',
  },
] as const

export const productIntegrationPlaybooks = {
  'agency-client-operator': {
    clientSetup: 'Pick one client workflow, send one inbox thread or tracker, add the weekly report format, and name the approval owner.',
    firstSources: ['client inbox thread', 'project tracker', 'Drive folder', 'Slack or chat export', 'weekly report example'],
    connectsTo: ['manual upload first', 'read-only Gmail/Drive export', 'Sheets/Notion tracker import', 'Slack export after approval'],
    handoff: 'Client queue, missing-asset asks, draft update, weekly report draft, proof ledger, and blocked-action list.',
    goLiveGate: 'Client sends, billing actions, scope changes, and production workspace updates stay blocked until the owner approves.',
  },
  'ai-workflow-desk': {
    clientSetup: 'Name the workflow owner, send five source samples, and choose the approval rule.',
    firstSources: ['spreadsheet or CSV', 'Drive folder', 'email thread', 'screenshots', 'current checklist'],
    connectsTo: ['Google Drive', 'Sheets/CSV', 'Gmail or mailbox exports', 'forms', 'manual uploads'],
    handoff: 'Source register, work queue, owner review, proof pack, and next-module checklist.',
    goLiveGate: 'External messages, billing, public claims, and source-system writeback stay human-approved.',
  },
  'agentops-toolbox': {
    clientSetup: 'Pick one recurring back-office job, send five source examples, name the reviewer, and list blocked actions.',
    firstSources: ['inbox or ticket export', 'spreadsheet or CRM view', 'research list', 'support queue', 'weekly report'],
    connectsTo: ['manual upload first', 'read-only Drive or mailbox export', 'browser task recording', 'CRM/Sheets import after approval'],
    handoff: 'Agent scope card, source register, approval queue, run ledger, weekly value report, and next workcell map.',
    goLiveGate: 'Sends, writebacks, payments, credentials, and customer-facing decisions stay blocked until the reviewer approves.',
  },
  'operations-digital-twin': {
    clientSetup: 'Pick one plant lane, issue type, asset, meter, or daily review and name the manager owner.',
    firstSources: ['issue log', 'daily report', 'maintenance sheet', 'QC evidence', 'meter reading export'],
    connectsTo: ['Excel/Sheets', 'Drive evidence', 'ERP exports', 'photos', 'meter or IoT pilot lane'],
    handoff: 'Daily control board, CAPA/maintenance queue, source evidence, manager actions, and rollout gate.',
    goLiveGate: 'Hardware, meter claims, ERP writeback, and customer-facing results wait for source proof and owner approval.',
  },
  'restaurant-group-os': {
    clientSetup: 'Send the menu or item list, closeout flow, payment proof habit, and manager review owner.',
    firstSources: ['menu PDF or photo', 'item spreadsheet', 'payment screenshots', 'stock notes', 'daily close sheet'],
    connectsTo: ['menu upload', 'payment proof capture', 'CSV import', 'QR menu handoff', 'branch closeout review'],
    handoff: 'Menu/items, orders, payment proof, daily close, stock notes, and owner report.',
    goLiveGate: 'Payment, accounting export, loyalty, and customer messaging need reconciliation and human approval.',
  },
} as const

export const productUpgradeRoadmap = [
  {
    label: 'Agent security drill',
    stage: 'Before autonomy',
    detail:
      'Run prompt-injection, tool-permission, memory, and multi-agent trust drills before a client workflow can browse, call tools, or act through agents.',
    tools: ['sandboxed runs', 'tool allowlist', 'memory review', 'attack-path checklist'],
    gate: 'No browser action, file access, outbound message, or writeback without an approved permission boundary.',
  },
  {
    label: 'Eval and release harness',
    stage: 'Before scale',
    detail:
      'Keep acceptance fixtures for every product path, then run build, public-output verification, smoke checks, and desktop/mobile browser QA before handoff.',
    tools: ['acceptance fixtures', 'Playwright QA', 'release smoke', 'console/error review'],
    gate: 'A product is not sellable unless the first workflow renders, routes, and passes source-to-proof checks.',
  },
  {
    label: 'Connector pack',
    stage: 'After source proof',
    detail:
      'Add the smallest approved connector after upload-first proof works: Drive, Sheets/CSV, Gmail exports, POS/ERP exports, service accounts, or API sync.',
    tools: ['OAuth/service account', 'retry log', 'source register', 'rollback path'],
    gate: 'Connector work waits for source ownership, excluded-data rules, and owner-approved refresh cadence.',
  },
  {
    label: 'Mobile capture lane',
    stage: 'Operator adoption',
    detail:
      'Make field capture usable on phones: photo proof, file upload, quick status, shift close, menu/stock edit, issue capture, and manager review.',
    tools: ['responsive QA', 'camera/file upload', 'offline-safe notes', 'manager queue'],
    gate: 'Mobile release requires readable first viewport, no overlap, and a manager-visible review trail.',
  },
  {
    label: 'Managed operations loop',
    stage: 'Retainer readiness',
    detail:
      'Convert the product into a recurring operating service with weekly review, source-change watch, exception queue, proof pack, and owner brief.',
    tools: ['weekly brief', 'exception queue', 'source-change monitor', 'proof ledger'],
    gate: 'Recurring work stays draft/review/approve until the client explicitly approves external actions and billing.',
  },
] as const
