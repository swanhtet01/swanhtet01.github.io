export type PublicPersonaProfile = {
  id: string
  name: string
  role: string
  pain: string
  stack: string
  firstLaunch: string
  expandsTo: string
  route: string
}

export type PublicShowcaseTemplate = {
  id: string
  name: string
  strap: string
  audience: string
  currentStack: string
  firstLaunch: string
  expandsTo: string
  modules: string[]
  route: string
  packageName: string
  image: string
}

export const PUBLIC_PERSONAS: PublicPersonaProfile[] = [
  {
    id: 'founder-sales',
    name: 'Founder-led sales team',
    role: 'Distributor, branch sales, or commercial operator',
    pain: 'Prospecting, follow-up, and account notes are spread across search, inboxes, sheets, and CRM exports.',
    stack: 'Gmail, Google Sheets, CSV, CRM export',
    firstLaunch: 'Find Clients or Revenue System Package',
    expandsTo: 'Sales System, Client Portal, Founder Brief',
    route: '/packages?package=Revenue%20System%20Package',
  },
  {
    id: 'ops-receiving',
    name: 'Operations and receiving team',
    role: 'Warehouse, procurement, service ops, or branch manager',
    pain: 'Shortages, GRN gaps, approvals, and supplier files stay trapped in email chains and spreadsheets.',
    stack: 'ERP export, Gmail, Drive, uploaded documents',
    firstLaunch: 'Receiving Control or Operations Control Package',
    expandsTo: 'Operations Inbox, Supplier Portal, Approval Policy Engine',
    route: '/packages?package=Operations%20Control%20Package',
  },
  {
    id: 'plant-quality',
    name: 'Plant and quality leadership',
    role: 'Plant manager, quality lead, maintenance lead, or director',
    pain: 'Quality incidents, KPI drift, CAPA, and maintenance review still happen in generic ERP screens or offline files.',
    stack: 'ERP export, shift files, quality forms, maintenance logs',
    firstLaunch: 'Industrial Quality Package',
    expandsTo: 'Industrial DQMS, Data Science Studio, Director Command Center',
    route: '/packages?package=Industrial%20Quality%20Package',
  },
  {
    id: 'client-service',
    name: 'Client service and delivery team',
    role: 'Agency, managed operator, service firm, or account team',
    pain: 'Clients still chase status through email, shared drives, and disconnected portal tools.',
    stack: 'Gmail, Drive, Calendar, uploaded documents',
    firstLaunch: 'Client Portal or Portal Network Package',
    expandsTo: 'Support and Service Desk, Decision Journal, Supplier Portal',
    route: '/packages?package=Portal%20Network%20Package',
  },
]

export const PUBLIC_SHOWCASE_TEMPLATES: PublicShowcaseTemplate[] = [
  {
    id: 'revenue-system',
    name: 'Revenue System Package',
    strap: 'For founder-led sales and account growth.',
    audience: 'Distributors, branch sales teams, owner-led commercial operators',
    currentStack: 'Gmail, Sheets, CSV, CRM exports',
    firstLaunch: 'Launch a working shortlist, follow-up queue, and account history desk first.',
    expandsTo: 'Expand into Sales System, Client Portal, and leadership review.',
    modules: ['Find Clients', 'Company List', 'Decision Journal', 'Founder Brief'],
    route: '/packages?package=Revenue%20System%20Package',
    packageName: 'Revenue System Package',
    image: '/site/company-list-live.png',
  },
  {
    id: 'operations-control',
    name: 'Operations Control Package',
    strap: 'For receiving, approvals, and supplier follow-up.',
    audience: 'Warehouse, procurement, plant ops, and service operations',
    currentStack: 'ERP exports, Gmail, Drive, uploaded documents',
    firstLaunch: 'Launch a live exception queue, receiving review, and approval path first.',
    expandsTo: 'Expand into Operations Inbox, Supplier Portal, and document routing.',
    modules: ['Receiving Control', 'Operations Inbox', 'Document Intelligence', 'Approval Policy Engine'],
    route: '/packages?package=Operations%20Control%20Package',
    packageName: 'Operations Control Package',
    image: '/site/receiving-control-live.png',
  },
  {
    id: 'industrial-quality',
    name: 'Industrial Quality Package',
    strap: 'For plant quality, maintenance, and leadership review.',
    audience: 'Manufacturing operators, quality teams, plant managers, and directors',
    currentStack: 'ERP exports, quality logs, maintenance files, uploaded evidence',
    firstLaunch: 'Launch the DQMS board, KPI review, and corrective-action lane first.',
    expandsTo: 'Expand into Data Science Studio and Director Command Center.',
    modules: ['Industrial DQMS', 'Knowledge Graph', 'Data Science Studio', 'Director Command Center'],
    route: '/packages?package=Industrial%20Quality%20Package',
    packageName: 'Industrial Quality Package',
    image: '/site/client-portal.svg',
  },
  {
    id: 'portal-network',
    name: 'Portal Network Package',
    strap: 'For external clients, suppliers, and service relationships.',
    audience: 'Agencies, managed operators, service firms, and external-facing teams',
    currentStack: 'Gmail, Drive, Calendar, uploaded documents',
    firstLaunch: 'Launch one branded client or supplier portal with status, requests, and approvals first.',
    expandsTo: 'Expand into Support and Service Desk, Supplier Portal, and tenant rollout.',
    modules: ['Client Portal', 'Supplier Portal', 'Tenant Control Plane', 'Document Intelligence'],
    route: '/packages?package=Portal%20Network%20Package',
    packageName: 'Portal Network Package',
    image: '/site/client-portal.svg',
  },
]
