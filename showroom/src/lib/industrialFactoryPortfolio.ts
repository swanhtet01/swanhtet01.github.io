export type FactoryProductStackItem = {
  id: string
  name: string
  position: 'core' | 'expansion' | 'included'
  buyer: string
  job: string
  firstWorkflow: string
  modules: string[]
  proofRoute: string
  revenuePath: string
}

export type ProductGap = {
  area: string
  currentState: string
  neededNext: string
  owner: string
}

export type RdSideProject = {
  id: string
  name: string
  whyItMatters: string
  firstPrototype: string
  successSignal: string
  route: string
}

export const FACTORY_PRODUCT_STACK: FactoryProductStackItem[] = [
  {
    id: 'factory-twin-os',
    name: 'Factory Live State',
    position: 'core',
    buyer: 'Factory owner, facility manager, maintenance lead',
    job: 'Show live state for one machine, meter, asset, room, or production lane.',
    firstWorkflow: 'One asset state, readings, anomaly review, owner action, and proof in one screen.',
    modules: ['Asset twin', 'Smart meter lane', 'Anomaly queue', 'Manager action board'],
    proofRoute: '/app/factory-operations',
    revenuePath: 'Paid twin sprint, then monitoring retainer.',
  },
  {
    id: 'easy-erp',
    name: 'Factory Operations App',
    position: 'core',
    buyer: 'Owner, admin, warehouse, finance, sales, operations',
    job: 'Replace spreadsheet ERP fragments with simple transaction records and role-safe work queues.',
    firstWorkflow: 'Inventory movement, receiving, purchase request, order, or daily close record.',
    modules: ['Item master', 'Inventory ledger', 'Purchase queue', 'Customer/order register'],
    proofRoute: '/app/erp',
    revenuePath: 'ERP starter sprint, then per-department rollout.',
  },
  {
    id: 'quality-capa',
    name: 'Quality and CAPA',
    position: 'expansion',
    buyer: 'Quality manager, plant manager, ISO owner',
    job: 'Turn defects, deviations, supplier issues, and evidence into reviewed corrective actions.',
    firstWorkflow: 'One defect or supplier issue moves from capture to root cause, action, proof, and closeout.',
    modules: ['Defect log', '5 Why / fishbone', 'CAPA owner review', 'Evidence closeout'],
    proofRoute: '/app/dqms',
    revenuePath: 'DQMS expansion module after Factory Live State or Factory Operations App.',
  },
  {
    id: 'maintenance-reliability',
    name: 'Maintenance Reliability',
    position: 'expansion',
    buyer: 'Maintenance lead, operations manager',
    job: 'Convert downtime notes, repeat failures, and meter signals into planned work orders.',
    firstWorkflow: 'One repeat stoppage becomes root-cause note, preventive action, owner, and due date.',
    modules: ['Downtime log', 'Failure mode tracker', 'Work order queue', 'Reliability KPI'],
    proofRoute: '/app/maintenance',
    revenuePath: 'Reliability module plus sensor monitoring.',
  },
  {
    id: 'receiving-supplier-control',
    name: 'Receiving and Supplier Control',
    position: 'expansion',
    buyer: 'Warehouse, purchasing, quality, finance',
    job: 'Stop supplier, receiving, and invoice disputes from living in chat and paper.',
    firstWorkflow: 'One blocked receiving batch links PO, invoice, photo evidence, QC decision, and disposition.',
    modules: ['Receiving log', 'Supplier claim', 'QC hold', 'Disposition approval'],
    proofRoute: '/app/receiving',
    revenuePath: 'Warehouse/supplier expansion module.',
  },
  {
    id: 'source-intake',
    name: 'Source Intake',
    position: 'included',
    buyer: 'Every client account',
    job: 'Make files, folders, emails, sheets, photos, and exports trustworthy enough to build on.',
    firstWorkflow: 'One messy source becomes a reviewable record with source link, status, owner, and flags.',
    modules: ['Source register', 'Extraction review', 'Exception queue', 'Client room'],
    proofRoute: '/app/client-room',
    revenuePath: 'Included in every serious product; bill refresh/support when recurring.',
  },
]

export const SUPERMEGA_PRODUCT_GAPS: ProductGap[] = [
  {
    area: 'Transaction-grade persistence',
    currentState: 'Demos and live workspace APIs exist, but not every module is backed by tenant-safe database tables.',
    neededNext: 'Make Factory Operations App records, CAPA, maintenance, receiving, and source intake write to scoped tables with audit history.',
    owner: 'Platform engineering',
  },
  {
    area: 'Device data pipeline',
    currentState: 'Factory Live State has the product shape and ESP32 direction, but needs a working meter ingestion kit.',
    neededNext: 'Ship ESP32 to MQTT/HTTP sample, time-series storage, anomaly flags, and simulator mode for demos.',
    owner: 'Digital twin R&D',
  },
  {
    area: 'Client onboarding',
    currentState: 'The login/demo hub is simpler, but client setup still depends too much on internal operator knowledge.',
    neededNext: 'Create a short client checklist that produces a build packet, first module, quote, and data request.',
    owner: 'Product ops',
  },
  {
    area: 'Offline and desktop packaging',
    currentState: 'The cloud app is live, but factories and restaurants may need tablet/desktop/offline-friendly installs.',
    neededNext: 'Add PWA install, local cache, offline draft capture, and later Windows wrapper only after core flows are stable.',
    owner: 'App platform',
  },
]

export const RD_SIDE_PROJECTS: RdSideProject[] = [
  {
    id: 'esp32-meter-kit',
    name: 'ESP32 Smart Meter Kit',
    whyItMatters: 'Turns Factory Live State from a dashboard demo into defensible hardware-plus-software monitoring.',
    firstPrototype: 'ESP32 sends voltage/current/temperature simulator readings to a cloud endpoint and visible twin card.',
    successSignal: 'One live reading stream, one anomaly flag, one manager action, one exportable evidence row.',
    route: '/app/factory-operations',
  },
  {
    id: 'client-checklist-builder',
    name: 'Client Checklist Builder',
    whyItMatters: 'Makes custom software scalable: client answers a few questions and SuperMega gets a build packet.',
    firstPrototype: 'Industry, role, source, workflow, owner, and approval answers generate module manifest and first quote.',
    successSignal: 'A lead can become a scoped first sprint without a long consulting call.',
    route: '/app/client-build',
  },
  {
    id: 'offline-field-capture',
    name: 'Offline Field Capture',
    whyItMatters: 'Factory operators and restaurant staff need fast mobile entry even when the connection is unreliable.',
    firstPrototype: 'PWA draft queue for issue, photo, reading, stock count, and daily close submission.',
    successSignal: 'Drafts sync to the cloud with source, owner, timestamp, and conflict review.',
    route: '/app/daily-entry',
  },
  {
    id: 'myanmar-sme-pack',
    name: 'Myanmar SME Pack',
    whyItMatters: 'Creates a repeatable local-market offer against Galaxy/MIT-style business software without copying old ERP UX.',
    firstPrototype: 'Restaurant POS + Inventory plus inventory, payment proof, provider settlement review, and owner daily close.',
    successSignal: 'One shop can run menu/items, payments, stock notes, and daily report from one page.',
    route: '/app/restaurant-pos',
  },
]
