import { useState } from 'react'
import { Link } from 'react-router-dom'

type ModuleKey =
  | 'sales-os'
  | 'client-portal'
  | 'operations-os'
  | 'founder-brief'
  | 'approval-flow'
  | 'qr-ordering'
  | 'commerce-back-office'

type ModulePhase = 'launch' | 'queued' | 'expand'

type ModuleDefinition = {
  name: string
  strap: string
  replaces: string
  users: string
  setup: string
  expands: string
  route?: string
}

type BlueprintModule = {
  key: ModuleKey
  phase: ModulePhase
  goal: string
  metricLabel: string
  metricValue: string
  dataUse: string
  viewLabel: string
  viewDetail: string
}

type PortalBlueprint = {
  key: string
  company: string
  portalName: string
  sector: string
  phase: string
  summary: string
  launchTarget: string
  operator: string
  coverage: string
  users: string[]
  inspection: Array<{
    label: string
    value: string
    detail: string
  }>
  launchSteps: Array<{
    name: string
    detail: string
  }>
  roles: Array<{
    name: string
    access: string
  }>
  modules: BlueprintModule[]
  expansion: string[]
  outcomes: string[]
}

const moduleCatalog: Record<ModuleKey, ModuleDefinition> = {
  'sales-os': {
    name: 'Sales OS',
    strap: 'Pipeline, follow-up, pricing, and handoff control.',
    replaces: 'Lead spreadsheets, callback lists, and quote chasing in email.',
    users: 'Sales lead, founder, account managers, and SDR operators.',
    setup: 'Import active accounts, stage rules, owner routing, pricing logic, and follow-up timers.',
    expands: 'Adds Client Portal for shared status and Approval Flow for discounts or credit notes.',
    route: '/app/deals',
  },
  'client-portal': {
    name: 'Client Portal',
    strap: 'Shared requests, files, promised dates, and status in one branded surface.',
    replaces: 'Status calls, drive links, forwarded files, and long email threads.',
    users: 'Clients, account managers, delivery coordinators, and customer success leads.',
    setup: 'Brand the workspace, map external roles, publish request forms, and define portal states.',
    expands: 'Adds Approvals, Commerce, or service-delivery modules without changing the base portal.',
    route: '/app/company',
  },
  'operations-os': {
    name: 'Operations OS',
    strap: 'Exception inbox for receiving, delivery, quality, and daily follow-up.',
    replaces: 'Receiving logs, WhatsApp escalation threads, and unresolved issue sheets.',
    users: 'Ops lead, supervisors, dispatch, warehouse, and delivery coordinators.',
    setup: 'Map exception types, queue owners, escalation timers, site-level routing, and SLAs.',
    expands: 'Adds Approval Flow, Client Portal, and Founder Brief once queue discipline is stable.',
    route: '/app/workflows',
  },
  'founder-brief': {
    name: 'Founder Brief',
    strap: 'One daily brief for revenue, risk, approvals, blockers, and next actions.',
    replaces: 'Manual recap messages, status spreadsheets, and scattered leadership updates.',
    users: 'Founder, GM, country operator, and department heads.',
    setup: 'Choose KPIs, risk thresholds, escalation rules, and the exact decision cadence.',
    expands: 'Turns into a multi-tenant director view once more portals are live.',
    route: '/app/hq',
  },
  'approval-flow': {
    name: 'Approval Flow',
    strap: 'Structured approvals for discounting, spend, credits, vendor changes, and exceptions.',
    replaces: 'Screenshot approvals, voice notes, and untracked manager messages.',
    users: 'Managers, finance, founders, and anyone who owns gated decisions.',
    setup: 'Define approval chains, thresholds, evidence requirements, and the audit trail.',
    expands: 'Feeds Founder Brief and Client Portal with clear decision status and history.',
    route: '/app/approvals',
  },
  'qr-ordering': {
    name: 'QR Ordering',
    strap: 'Storefront ordering with live status, payment handoff, and branch-specific menus.',
    replaces: 'Paper tickets, order chat threads, and manual re-entry into back office sheets.',
    users: 'Customers, counter staff, store managers, and delivery dispatch.',
    setup: 'Load menus, branch rules, order states, payment modes, and printer or kitchen routing.',
    expands: 'Connects directly into Commerce Back Office, inventory, and client loyalty flows.',
  },
  'commerce-back-office': {
    name: 'Commerce Back Office',
    strap: 'Catalog, branches, orders, settlements, and payout control.',
    replaces: 'Spreadsheet catalogs, day-end reconciliations, and branch-side manual rollups.',
    users: 'Ops managers, finance, branch leads, and commercial operators.',
    setup: 'Import catalog data, assign branch roles, define settlements, and publish reporting rules.',
    expands: 'Connects QR Ordering, inventory control, and Founder Brief for daily operating review.',
    route: '/app/inventory',
  },
}

const portalBlueprints: PortalBlueprint[] = [
  {
    key: 'mandalay-distribution',
    company: 'Mandalay Food Distribution',
    portalName: 'Distributor Portal',
    sector: 'Distribution',
    phase: 'Pilot build',
    summary: 'Inspect quote threads, Sheets price books, and reorder messages. Launch one portal for the sales desk, account owners, and distributor buyers.',
    launchTarget: 'Replace forwarded price sheets and callback spreadsheets with a live shared account workspace.',
    operator: 'Sales manager + founder + client success lead',
    coverage: '1 office / 180 SKUs / 18 distributor accounts',
    users: ['Sales desk', 'Account owners', 'Distributor buyers', 'Founder'],
    inspection: [
      { label: 'Inboxes', value: '2 shared mailboxes', detail: 'quotes@ and orders@ with 84 open threads' },
      { label: 'Sheets', value: '6 live price books', detail: 'Distributor, promo, and branch-specific pricing tables' },
      { label: 'Exports', value: '3 WhatsApp logs', detail: 'Repeat reorders and promised callback notes' },
    ],
    launchSteps: [
      { name: 'Inspect current sales data', detail: 'Map account owners, open quotes, pricing tables, and follow-up rules.' },
      { name: 'Publish portal roles', detail: 'Give sales and distributor contacts one shared request and document surface.' },
      { name: 'Queue decisions', detail: 'Route discount or credit requests into Approval Flow after launch week.' },
    ],
    roles: [
      { name: 'Sales manager', access: 'Owns pipeline, quote deadlines, and pricing escalations.' },
      { name: 'Account owner', access: 'Updates deal stage, notes, and promised ship dates.' },
      { name: 'Distributor buyer', access: 'Submits reorder requests, sees files, and checks committed dates.' },
    ],
    modules: [
      {
        key: 'sales-os',
        phase: 'launch',
        goal: 'Own the pipeline, next follow-up, and promised quote date in one operating surface.',
        metricLabel: 'Open accounts',
        metricValue: '64',
        dataUse: 'Reads quote inboxes, Sheets price lists, and reorder messages.',
        viewLabel: 'Primary view',
        viewDetail: 'Pipeline board with account stage, owner, last contact, and next callback timer.',
      },
      {
        key: 'client-portal',
        phase: 'launch',
        goal: 'Give each distributor a clean portal for requests, documents, and shipment promises.',
        metricLabel: 'Portal logins',
        metricValue: '18',
        dataUse: 'Publishes price books, order files, and request forms by account.',
        viewLabel: 'Client view',
        viewDetail: 'Account home with reorder request, open issues, and latest commercial files.',
      },
      {
        key: 'founder-brief',
        phase: 'queued',
        goal: 'Summarize stalled deals, late follow-up, and pricing decisions in one founder note.',
        metricLabel: 'Blocked deals',
        metricValue: '7',
        dataUse: 'Pulls stage drift, missed callbacks, and approval debt.',
        viewLabel: 'Director view',
        viewDetail: 'Daily brief with top revenue risks and action owners.',
      },
      {
        key: 'approval-flow',
        phase: 'expand',
        goal: 'Track price exceptions and credit requests once the base sales portal is live.',
        metricLabel: 'Queued requests',
        metricValue: '11',
        dataUse: 'Captures discounts, special terms, and credit approvals with evidence.',
        viewLabel: 'Decision log',
        viewDetail: 'Approval queue with requester, amount, and committed response time.',
      },
    ],
    expansion: [
      'Add Approval Flow once live quote volume crosses the manual tolerance line.',
      'Publish a shared delivery status lane inside Client Portal after order handoff is stable.',
      'Feed the founder brief with account concentration risk and overdue callback counts.',
    ],
    outcomes: ['Quotes stop disappearing in email.', 'Clients see promised dates without calling.', 'Founders get a daily blocked-revenue view.'],
  },
  {
    key: 'ayeyar-plant',
    company: 'Ayeyar Plant Group',
    portalName: 'Plant Operations Portal',
    sector: 'Manufacturing',
    phase: 'Rollout week 1',
    summary: 'Inspect receiving sheets, maintenance logs, vendor paperwork, and issue escalation chat. Launch one queue-driven portal for plant ops.',
    launchTarget: 'Replace daily exception chasing and manual shift handover notes with one operations inbox.',
    operator: 'Plant operator + warehouse lead + founder',
    coverage: '3 sites / 4 shifts / 260 staff',
    users: ['Ops lead', 'Supervisors', 'Warehouse', 'Founder'],
    inspection: [
      { label: 'Shift logs', value: '12 worksheets', detail: 'Production, receiving, quality, and maintenance handover logs' },
      { label: 'Exceptions', value: '47 open items', detail: 'Receiving variance, late vendors, damaged stock, and machine holds' },
      { label: 'Documents', value: '9 vendor folders', detail: 'Invoices, customs files, QA evidence, and NCR images' },
    ],
    launchSteps: [
      { name: 'Normalize issue types', detail: 'Convert receiving, quality, and downtime reports into one queue structure.' },
      { name: 'Assign site ownership', detail: 'Route queues by plant, shift, and responsible manager.' },
      { name: 'Escalate controlled decisions', detail: 'Move vendor, spend, and hold-release decisions into Approval Flow.' },
    ],
    roles: [
      { name: 'Plant operator', access: 'Owns site queues, drift, and response time.' },
      { name: 'Warehouse lead', access: 'Runs receiving variance, document checks, and release actions.' },
      { name: 'Founder', access: 'Sees blocked operations, approval debt, and unresolved risk by site.' },
    ],
    modules: [
      {
        key: 'operations-os',
        phase: 'launch',
        goal: 'Run receiving, quality, and incident work from one queue with owners and timers.',
        metricLabel: 'Open exceptions',
        metricValue: '47',
        dataUse: 'Combines receiving logs, quality notes, and maintenance escalation threads.',
        viewLabel: 'Ops view',
        viewDetail: 'Exception inbox with site, owner, SLA, evidence, and closeout state.',
      },
      {
        key: 'approval-flow',
        phase: 'launch',
        goal: 'Track hold releases, vendor changes, and urgent spend without side-channel approvals.',
        metricLabel: 'Awaiting approval',
        metricValue: '9',
        dataUse: 'Routes release decisions with evidence and approver thresholds.',
        viewLabel: 'Manager view',
        viewDetail: 'Decision queue with cost, site impact, and sign-off history.',
      },
      {
        key: 'founder-brief',
        phase: 'queued',
        goal: 'Send one plant-level brief each morning with blocked output and unresolved risk.',
        metricLabel: 'Sites at risk',
        metricValue: '2',
        dataUse: 'Pulls site drift, queue backlog, and overnight incident counts.',
        viewLabel: 'Founder view',
        viewDetail: 'A short leadership brief with plant health, approvals, and hold items.',
      },
      {
        key: 'client-portal',
        phase: 'expand',
        goal: 'Expose release-ready documents and shipment exceptions to external partners later.',
        metricLabel: 'External users',
        metricValue: '14',
        dataUse: 'Publishes only approved delivery documents and shipment status.',
        viewLabel: 'Partner view',
        viewDetail: 'Partner portal with release notes, files, and confirmed dates.',
      },
    ],
    expansion: [
      'Expose a filtered partner portal for approved shipment and customs documents.',
      'Feed the founder brief with site-level risk and approval debt every morning.',
      'Add inventory pressure and reorder controls once queue ownership is stable.',
    ],
    outcomes: ['Ops issues stop living in chat threads.', 'Approvals leave an audit trail.', 'Leadership sees plant drift by site.'],
  },
  {
    key: 'northbridge-services',
    company: 'Northbridge Services',
    portalName: 'Client Delivery Portal',
    sector: 'Professional services',
    phase: 'Ready for onboarding',
    summary: 'Inspect client folders, retainers, deliverable trackers, and invoice approvals. Launch a client-facing portal first, then add internal control.',
    launchTarget: 'Replace status emails and scattered drive links with one client delivery portal.',
    operator: 'Delivery director + account lead + founder',
    coverage: '27 retainers / 6 squads / 4 partner firms',
    users: ['Delivery director', 'Account lead', 'Clients', 'Founder'],
    inspection: [
      { label: 'Client folders', value: '27 active spaces', detail: 'Deliverables, contracts, and comment threads spread across Drive' },
      { label: 'Tracker sheets', value: '5 delivery boards', detail: 'Status, owners, hours, and upcoming review dates' },
      { label: 'Invoices', value: '13 pending sign-offs', detail: 'Client approvals and project change requests waiting in mail' },
    ],
    launchSteps: [
      { name: 'Map client-facing workflows', detail: 'Normalize deliverables, review states, and handoff checkpoints.' },
      { name: 'Set external permissions', detail: 'Define partner, client, and internal delivery roles before publish.' },
      { name: 'Attach approvals', detail: 'Route change requests and billing approvals through one queue.' },
    ],
    roles: [
      { name: 'Delivery director', access: 'Owns client health, deadlines, and delivery squad workload.' },
      { name: 'Account lead', access: 'Publishes deliverables, handles requests, and tracks next reviews.' },
      { name: 'Client contact', access: 'Reviews files, comments, approvals, and current service status.' },
    ],
    modules: [
      {
        key: 'client-portal',
        phase: 'launch',
        goal: 'Give every client one secure place for files, requests, reviews, and current status.',
        metricLabel: 'Live client spaces',
        metricValue: '27',
        dataUse: 'Pulls deliverable files, review states, and account-specific forms into one portal.',
        viewLabel: 'Client home',
        viewDetail: 'Requests, files, review deadlines, and recent updates by client account.',
      },
      {
        key: 'founder-brief',
        phase: 'launch',
        goal: 'Show leadership which retainers are late, at risk, or waiting on approval.',
        metricLabel: 'Accounts at risk',
        metricValue: '5',
        dataUse: 'Summarizes overdue reviews, red accounts, and blocked change requests.',
        viewLabel: 'Leadership brief',
        viewDetail: 'A short brief with account risk, upcoming renewals, and client friction.',
      },
      {
        key: 'approval-flow',
        phase: 'queued',
        goal: 'Route billing, scope change, and legal approvals through one history-backed queue.',
        metricLabel: 'Pending approvals',
        metricValue: '13',
        dataUse: 'Captures client sign-off, internal approval, and billing release status.',
        viewLabel: 'Approval board',
        viewDetail: 'Approval list with owner, due date, and linked client context.',
      },
      {
        key: 'sales-os',
        phase: 'expand',
        goal: 'Move renewals and expansion deals into the same system after delivery visibility is stable.',
        metricLabel: 'Renewal pipeline',
        metricValue: '8',
        dataUse: 'Adds renewal stages, expansion opportunities, and follow-up ownership.',
        viewLabel: 'Growth view',
        viewDetail: 'Renewals and upsell opportunities linked to delivery health.',
      },
    ],
    expansion: [
      'Turn approvals into a client-visible review log for change requests and billing release.',
      'Link account health directly to renewal pipeline and founder revenue view.',
      'Add a sales layer only after the delivery portal becomes the system of record.',
    ],
    outcomes: ['Clients stop chasing status by email.', 'Delivery teams work from one shared account surface.', 'Leadership sees service risk before churn shows up.'],
  },
  {
    key: 'union-tea',
    company: 'Union Tea Rooms',
    portalName: 'Store Commerce Portal',
    sector: 'Retail and hospitality',
    phase: 'Pilot menu launch',
    summary: 'Inspect menu sheets, order logs, branch stock files, and payout rollups. Launch QR ordering and the branch back office together.',
    launchTarget: 'Replace paper tickets, manual menu updates, and branch-side day-end rollups.',
    operator: 'Commerce operator + branch managers + founder',
    coverage: '9 branches / 1 commissary / 420 daily orders',
    users: ['Store manager', 'Counter staff', 'Finance', 'Founder'],
    inspection: [
      { label: 'Menus', value: '9 branch menus', detail: 'Price, branch availability, and promo items maintained in Sheets' },
      { label: 'Orders', value: '420 daily tickets', detail: 'Phone, counter, and delivery orders merged manually' },
      { label: 'Settlements', value: '9 branch reports', detail: 'Cash, QR, and platform payouts reconciled at day end' },
    ],
    launchSteps: [
      { name: 'Standardize order states', detail: 'Define branch ordering, payment, and fulfillment status before launch.' },
      { name: 'Load branch catalog', detail: 'Publish menu data, item availability, and branch-specific rules.' },
      { name: 'Publish founder review', detail: 'Feed daily sales, voids, and stock pressure into Founder Brief.' },
    ],
    roles: [
      { name: 'Store manager', access: 'Owns branch menu, open orders, and stock holds.' },
      { name: 'Commerce operator', access: 'Runs catalog, settlements, and branch rollout changes.' },
      { name: 'Founder', access: 'Sees branch sales, stock pressure, and payout drift every day.' },
    ],
    modules: [
      {
        key: 'qr-ordering',
        phase: 'launch',
        goal: 'Capture branch orders in one live flow with status and payment handoff.',
        metricLabel: 'Daily orders',
        metricValue: '420',
        dataUse: 'Publishes branch menus, QR entry points, and active order states.',
        viewLabel: 'Storefront view',
        viewDetail: 'Order screen with live menu, payment mode, and branch-specific availability.',
      },
      {
        key: 'commerce-back-office',
        phase: 'launch',
        goal: 'Run catalog, settlements, branch performance, and day-end control from one place.',
        metricLabel: 'Branches live',
        metricValue: '9',
        dataUse: 'Tracks order totals, branch payout, menu changes, and item-level performance.',
        viewLabel: 'Back office',
        viewDetail: 'Branch dashboard with orders, settlement status, and menu control.',
      },
      {
        key: 'founder-brief',
        phase: 'queued',
        goal: 'Send a daily branch brief with sales, voids, and low-stock pressure.',
        metricLabel: 'Watch branches',
        metricValue: '3',
        dataUse: 'Summarizes sales drift, payout gaps, and stock risk by branch.',
        viewLabel: 'Founder review',
        viewDetail: 'Morning branch brief with exception-first review.',
      },
      {
        key: 'client-portal',
        phase: 'expand',
        goal: 'Add a partner or catering portal once commerce operations are stable.',
        metricLabel: 'Partner accounts',
        metricValue: '6',
        dataUse: 'Creates an external order and file portal for catering or franchise partners.',
        viewLabel: 'Partner portal',
        viewDetail: 'External account view for wholesale orders, schedules, and documents.',
      },
    ],
    expansion: [
      'Add catering or partner ordering in Client Portal after branch operations settle.',
      'Feed daily sales, voids, and low-stock alerts into Founder Brief.',
      'Connect inventory control once menu and settlement discipline is established.',
    ],
    outcomes: ['Branches stop reconciling from paper.', 'Commerce data lands in one back office.', 'Founder sees branch-level drift every morning.'],
  },
]

function phaseLabel(phase: ModulePhase) {
  if (phase === 'launch') {
    return 'Launch now'
  }
  if (phase === 'queued') {
    return 'Queue next'
  }
  return 'Expand later'
}

function phaseClassName(phase: ModulePhase) {
  if (phase === 'launch') {
    return 'border-emerald-400/25 bg-emerald-400/12 text-emerald-100'
  }
  if (phase === 'queued') {
    return 'border-[rgba(37,208,255,0.24)] bg-[rgba(37,208,255,0.12)] text-[var(--sm-ink)]'
  }
  return 'border-white/10 bg-white/6 text-[var(--sm-muted)]'
}

export function PortalStudioWorkbench() {
  const [activeBlueprintKey, setActiveBlueprintKey] = useState(portalBlueprints[0]?.key ?? '')
  const [activeModuleKey, setActiveModuleKey] = useState<ModuleKey>('sales-os')

  const activeBlueprint = portalBlueprints.find((item) => item.key === activeBlueprintKey) ?? portalBlueprints[0]
  const activeModule = activeBlueprint?.modules.find((item) => item.key === activeModuleKey) ?? activeBlueprint?.modules[0]

  if (!activeBlueprint || !activeModule) {
    return null
  }

  const activeDefinition = moduleCatalog[activeModule.key]
  const launchCount = activeBlueprint.modules.filter((item) => item.phase === 'launch').length
  const queuedCount = activeBlueprint.modules.filter((item) => item.phase === 'queued').length

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Portal</p>
          <p className="mt-3 text-2xl font-bold text-white">{activeBlueprint.portalName}</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">{activeBlueprint.phase}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Launch modules</p>
          <p className="mt-3 text-3xl font-bold text-white">{launchCount}</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">System of record from day one.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Queued next</p>
          <p className="mt-3 text-3xl font-bold text-white">{queuedCount}</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Modules added after the base loop is stable.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Sources inspected</p>
          <p className="mt-3 text-3xl font-bold text-white">{activeBlueprint.inspection.length}</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Existing files, inboxes, and exports before build.</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="sm-surface p-4">
          <div className="border-b border-white/8 pb-4">
            <p className="sm-kicker text-[var(--sm-accent)]">Sample portal blueprints</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Choose a company shape</h2>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">
              Portal Studio starts from the company&apos;s actual data and operating bottleneck, not a generic template.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {portalBlueprints.map((blueprint) => {
              const selected = blueprint.key === activeBlueprint.key
              return (
                <button
                  className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                    selected
                      ? 'border-[rgba(37,208,255,0.32)] bg-[rgba(37,208,255,0.1)]'
                      : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/14 hover:bg-white/6'
                  }`}
                  key={blueprint.key}
                  onClick={() => {
                    setActiveBlueprintKey(blueprint.key)
                    setActiveModuleKey(blueprint.modules[0].key)
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{blueprint.company}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{blueprint.summary}</p>
                    </div>
                    <span className="sm-status-pill">{blueprint.sector}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="sm-status-pill">{blueprint.phase}</span>
                    <span className="sm-status-pill">{blueprint.coverage}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <article className="sm-surface-deep overflow-hidden">
          <div className="border-b border-white/8 px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="sm-kicker text-[var(--sm-accent)]">Portal Studio</p>
                <h2 className="mt-2 text-3xl font-bold text-white">{activeBlueprint.portalName}</h2>
                <p className="mt-3 text-base text-[var(--sm-muted)]">{activeBlueprint.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="sm-status-pill">{activeBlueprint.phase}</span>
                <span className="sm-status-pill">{activeBlueprint.operator}</span>
              </div>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Launch target</p>
                <p className="mt-3 text-sm text-white">{activeBlueprint.launchTarget}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Who uses it</p>
                <p className="mt-3 text-sm text-white">{activeBlueprint.users.join(', ')}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Coverage</p>
                <p className="mt-3 text-sm text-white">{activeBlueprint.coverage}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[250px_minmax(0,1fr)_280px]">
            <aside className="border-b border-white/8 px-5 py-5 xl:border-b-0 xl:border-r">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Module stack</p>
              <div className="mt-4 space-y-3">
                {activeBlueprint.modules.map((module) => {
                  const definition = moduleCatalog[module.key]
                  const selected = module.key === activeModule.key
                  return (
                    <button
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        selected
                          ? 'border-[rgba(37,208,255,0.32)] bg-[rgba(37,208,255,0.12)]'
                          : 'border-white/8 bg-[rgba(255,255,255,0.02)] hover:border-white/14 hover:bg-white/5'
                      }`}
                      key={module.key}
                      onClick={() => setActiveModuleKey(module.key)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{definition.name}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{definition.strap}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${phaseClassName(module.phase)}`}>
                          {phaseLabel(module.phase)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </aside>

            <div className="border-b border-white/8 px-5 py-5 xl:border-b-0 xl:border-r xl:px-6 xl:py-6">
              <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(8,16,29,0.98),rgba(6,12,22,0.96))]">
                <div className="border-b border-white/8 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">Live portal frame</p>
                      <h3 className="mt-2 text-2xl font-bold text-white">{activeDefinition.name}</h3>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${phaseClassName(activeModule.phase)}`}>
                      {phaseLabel(activeModule.phase)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-0 xl:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="border-b border-white/8 px-4 py-4 xl:border-b-0 xl:border-r">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Portal nav</p>
                    <div className="mt-4 space-y-2">
                      {activeBlueprint.modules.map((module) => {
                        const definition = moduleCatalog[module.key]
                        const selected = module.key === activeModule.key
                        return (
                          <div
                            className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                              selected ? 'bg-[rgba(37,208,255,0.14)] text-white' : 'bg-white/4 text-[var(--sm-muted)]'
                            }`}
                            key={`${activeBlueprint.key}-${module.key}`}
                          >
                            {definition.name}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="px-4 py-4 xl:px-5 xl:py-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                        <p className="sm-kicker text-[var(--sm-accent)]">{activeModule.metricLabel}</p>
                        <p className="mt-3 text-3xl font-bold text-white">{activeModule.metricValue}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">What it is</p>
                        <p className="mt-3 text-sm text-white">{activeDefinition.strap}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                        <p className="sm-kicker text-[var(--sm-accent)]">What it replaces</p>
                        <p className="mt-3 text-sm text-white">{activeDefinition.replaces}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-3xl border border-white/8 bg-white/4 px-4 py-4">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">{activeModule.viewLabel}</p>
                      <h4 className="mt-2 text-xl font-bold text-white">{activeBlueprint.portalName}</h4>
                      <p className="mt-3 text-sm text-[var(--sm-muted)]">{activeModule.goal}</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/8 bg-[rgba(3,8,18,0.46)] px-4 py-4">
                          <p className="sm-kicker text-[var(--sm-accent)]">Data inspected</p>
                          <p className="mt-3 text-sm text-white">{activeModule.dataUse}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-[rgba(3,8,18,0.46)] px-4 py-4">
                          <p className="sm-kicker text-[var(--sm-accent-alt)]">Operator output</p>
                          <p className="mt-3 text-sm text-white">{activeModule.viewDetail}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-[rgba(3,8,18,0.46)] px-4 py-4">
                          <p className="sm-kicker text-[var(--sm-accent)]">Who uses it</p>
                          <p className="mt-3 text-sm text-white">{activeDefinition.users}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-[rgba(3,8,18,0.46)] px-4 py-4">
                          <p className="sm-kicker text-[var(--sm-accent-alt)]">Set up for another company</p>
                          <p className="mt-3 text-sm text-white">{activeDefinition.setup}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {activeBlueprint.outcomes.map((item) => (
                        <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-white" key={item}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {activeBlueprint.inspection.map((item) => (
                  <div className="rounded-3xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4" key={item.label}>
                    <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
                    <p className="mt-3 text-xl font-bold text-white">{item.value}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="px-5 py-5">
              <p className="sm-kicker text-[var(--sm-accent)]">Build path</p>
              <div className="mt-4 space-y-3">
                {activeBlueprint.launchSteps.map((step, index) => (
                  <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4" key={step.name}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{step.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{step.detail}</p>
                      </div>
                      <span className="sm-status-pill">0{index + 1}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-3xl border border-white/8 bg-white/4 px-4 py-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Access map</p>
                <div className="mt-4 space-y-3">
                  {activeBlueprint.roles.map((role) => (
                    <div className="rounded-2xl border border-white/8 bg-[rgba(3,8,18,0.4)] px-4 py-4" key={role.name}>
                      <p className="font-semibold text-white">{role.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{role.access}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-white/8 bg-white/4 px-4 py-4">
                <p className="sm-kicker text-[var(--sm-accent)]">How it expands</p>
                <div className="mt-4 space-y-3">
                  {activeBlueprint.expansion.map((item) => (
                    <div className="rounded-2xl border border-white/8 bg-[rgba(3,8,18,0.4)] px-4 py-4 text-sm text-white" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {activeDefinition.route ? (
                  <Link className="sm-button-primary" to={activeDefinition.route}>
                    Open related workspace
                  </Link>
                ) : null}
                <Link className="sm-button-secondary" to="/app/architect">
                  Open Solution Architect
                </Link>
              </div>
            </aside>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Module library</p>
          <h2 className="mt-2 text-2xl font-bold text-white">What Portal Studio can assemble.</h2>
          <div className="mt-5 space-y-3">
            {Object.entries(moduleCatalog).map(([key, module]) => {
              const usedBy = portalBlueprints.filter((blueprint) => blueprint.modules.some((item) => item.key === key)).length
              return (
                <div className="sm-proof-card" key={key}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-3xl">
                      <p className="text-lg font-bold text-white">{module.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.strap}</p>
                    </div>
                    <span className="sm-status-pill">Used in {usedBy} blueprint{usedBy === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                      <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                      <p className="mt-3 text-sm text-white">{module.replaces}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Users</p>
                      <p className="mt-3 text-sm text-white">{module.users}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                      <p className="sm-kicker text-[var(--sm-accent)]">Expands to</p>
                      <p className="mt-3 text-sm text-white">{module.expands}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Studio rule</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Inspect first. Ship the smallest system of record. Add modules after trust is earned.</h2>
          <div className="mt-5 space-y-3">
            <div className="sm-chip text-white">
              Portal Studio does not start from a brochure package. It starts from inboxes, spreadsheets, exports, approvals, and the operator who is already holding the system together.
            </div>
            <div className="sm-chip text-white">
              Each client portal begins with one or two launch modules that replace the current manual operating loop. Everything else stays queued until the new surface becomes the place people actually use.
            </div>
            <div className="sm-chip text-white">
              Once the base module is live, we layer in approvals, founder review, external client access, or commerce surfaces without rebuilding the workspace.
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-white/8 bg-white/4 px-4 py-4">
            <p className="sm-kicker text-[var(--sm-accent)]">Current selection</p>
            <p className="mt-3 text-xl font-bold text-white">{activeBlueprint.company}</p>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">{activeDefinition.name} is currently selected as the focused module inside this blueprint.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="sm-status-pill">{activeBlueprint.sector}</span>
              <span className="sm-status-pill">{activeBlueprint.phase}</span>
              <span className="sm-status-pill">{phaseLabel(activeModule.phase)}</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
