export type PublicProductAlias = {
  publicName: 'Agency Client Operator' | 'Document Extraction Ledger' | 'Factory Operations App' | 'Restaurant POS + Inventory' | 'Back Office Workflow Desk'
  internalName: 'Agency Client Operator' | 'Custom Workflow App' | 'Factory Operations App' | 'Restaurant POS + Inventory' | 'AgentOps Toolbox'
  portalId: 'agency-client-operator' | 'ai-workflow-desk' | 'operations-digital-twin' | 'restaurant-group-os' | 'agentops-toolbox'
  route: '/app/documents' | '/app/factory-operations' | '/app/restaurant-pos' | '/app/cloud-agent-army'
  requestPackage: string
  mainShot: string
  gallery: readonly { src: string; alt: string; caption: string }[]
}

export const PUBLIC_PRODUCT_ALIASES: PublicProductAlias[] = [
  {
    publicName: 'Agency Client Operator',
    internalName: 'Agency Client Operator',
    portalId: 'agency-client-operator',
    route: '/app/cloud-agent-army',
    requestPackage: 'agency-client-operator',
    mainShot: '/site/shots/actual-custom-workflow-queue.png',
    gallery: [
      { src: '/site/shots/actual-custom-workflow-queue.png', alt: 'Agency Client Operator queue with client requests, owners, status, and next actions', caption: 'Client queue' },
      { src: '/site/shots/live-demo-agent-builder.png', alt: 'Agency Client Operator setup screen with client workflow scope and approval policy', caption: 'Setup' },
      { src: '/site/shots/actual-custom-workflow-modules.png', alt: 'Agency Client Operator modules for weekly reports, assets, approvals, and client follow-up', caption: 'Modules' },
    ],
  },
  {
    internalName: 'Custom Workflow App',
    portalId: 'ai-workflow-desk',
    route: '/app/documents',
    requestPackage: 'document-extraction-ledger',
    publicName: 'Document Extraction Ledger',
    mainShot: '/site/shots/live-demo-clean-records.svg',
    gallery: [
      { src: '/site/shots/live-demo-clean-records.svg', alt: 'Document Extraction Ledger source records with extracted fields, flags, and reviewer actions', caption: 'Records' },
      { src: '/site/shots/live-product-flow-records.png', alt: 'Document Extraction Ledger reviewed queue with normalized rows and owner decisions', caption: 'Queue' },
      { src: '/site/shots/actual-custom-workflow-modules.png', alt: 'Document Extraction Ledger export settings and review modules', caption: 'Export' },
    ],
  },
  {
    publicName: 'Factory Operations App',
    internalName: 'Factory Operations App',
    portalId: 'operations-digital-twin',
    route: '/app/factory-operations',
    requestPackage: 'operations-digital-twin',
    mainShot: '/site/shots/actual-plant-overview.png',
    gallery: [
      { src: '/site/shots/actual-plant-overview.png', alt: 'Plant workspace overview with machine states and floor signals', caption: 'Overview' },
      { src: '/site/shots/actual-factory-assets.png', alt: 'Factory Operations App asset map and current state modules', caption: 'Assets' },
      { src: '/site/shots/actual-factory-actions.png', alt: 'Factory Operations App anomaly review and manager actions', caption: 'Actions' },
    ],
  },
  {
    publicName: 'Restaurant POS + Inventory',
    internalName: 'Restaurant POS + Inventory',
    portalId: 'restaurant-group-os',
    route: '/app/restaurant-pos',
    requestPackage: 'restaurant-group-os',
    mainShot: '/site/shots/actual-shop-overview.png',
    gallery: [
      { src: '/site/shots/actual-shop-overview.png', alt: 'Shop workspace overview with sales, payments, and stock risks', caption: 'Overview' },
      { src: '/site/shots/actual-restaurant-shift-stock.png', alt: 'Restaurant POS + Inventory shift and stock module', caption: 'Shift + Stock' },
      { src: '/site/shots/actual-restaurant-menu.png', alt: 'Restaurant POS + Inventory menu module', caption: 'Menu' },
    ],
  },
  {
    publicName: 'Back Office Workflow Desk',
    internalName: 'AgentOps Toolbox',
    portalId: 'agentops-toolbox',
    route: '/app/cloud-agent-army',
    requestPackage: 'back-office-workflow-desk',
    mainShot: '/site/shots/live-demo-agent-builder.png',
    gallery: [
      { src: '/site/shots/live-demo-agent-builder.png', alt: 'Back Office Workflow Desk setup screen with job scope, approval gate, and output controls', caption: 'Scope' },
      { src: '/site/shots/actual-custom-workflow-queue.png', alt: 'Back Office Workflow Desk queue with owner review items and action status', caption: 'Queue' },
      { src: '/site/shots/live-demo-clean-records.svg', alt: 'Back Office Workflow Desk source records with reviewable extracted fields and proof', caption: 'Proof' },
    ],
  },
] as const

export const PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID = Object.fromEntries(
  PUBLIC_PRODUCT_ALIASES.map((product) => [product.portalId, product]),
) as Record<PublicProductAlias['portalId'], PublicProductAlias>

export const PUBLIC_PRODUCT_ALIAS_BY_INTERNAL_NAME = Object.fromEntries(
  PUBLIC_PRODUCT_ALIASES.map((product) => [product.internalName, product]),
) as Record<PublicProductAlias['internalName'], PublicProductAlias>

export function publicProductName(internalName: string) {
  return PUBLIC_PRODUCT_ALIAS_BY_INTERNAL_NAME[internalName as PublicProductAlias['internalName']]?.publicName ?? internalName
}
