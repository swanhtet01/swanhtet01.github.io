import {
  COMMERCE_KEY,
  commercePurchaseOrderProgress,
  validateCommerceState,
} from './commerce-workspace.ts'
import { PRODUCTION_KEY, validateProductionState } from './production-workspace.ts'
import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_STORAGE_KEY,
  getCurrentApproval,
  getCurrentPublish,
  loadWebsiteWorkspace,
  readinessChecks,
} from '../products/website/website-model.ts'
import {
  LOCAL_STOREFRONT_DRAFT_SCOPE,
  readStorefrontDraft,
  type StorefrontDraftStorage,
} from '../products/ecommerce/storefront-draft.ts'

export type BusinessCommandIntent =
  | 'attention'
  | 'shop_inventory'
  | 'plant_control'
  | 'website_readiness'
  | 'ecommerce_readiness'

export type BusinessDataStatus = 'ready' | 'missing' | 'invalid'

type BusinessCommandStorage = {
  getItem: (key: string) => string | null
}

export const BUSINESS_COMMAND_PROMPTS = [
  { intent: 'attention', label: 'What needs attention?', question: 'What needs attention across my business?' },
  { intent: 'shop_inventory', label: 'What stock is low?', question: 'What stock and Shop work need attention?' },
  { intent: 'plant_control', label: 'What blocks production?', question: 'What is blocking production?' },
  { intent: 'website_readiness', label: 'Is the website ready?', question: 'Is the website ready to release?' },
  { intent: 'ecommerce_readiness', label: 'Are online orders ready?', question: 'Are Ecommerce setup and online orders ready?' },
] as const satisfies ReadonlyArray<{ intent: BusinessCommandIntent; label: string; question: string }>

export type LocalBusinessSnapshot = {
  contract: 'supermega.local_business_snapshot.v1'
  shop: {
    status: BusinessDataStatus
    itemCount: number
    lowStock: number
    activeOrders: number
    paymentExceptions: number
    refundsDue: number
    openPurchaseOrders: number
    incomingRequests: number
  }
  plant: {
    status: BusinessDataStatus
    jobCount: number
    unfinishedJobs: number
    heldJobs: number
    openIssues: number
    priorityIssues: number
    stoppedMachines: number
  }
  website: {
    status: BusinessDataStatus
    pageCount: number
    readyPages: number
    readinessPassed: number
    readinessTotal: number
    approved: boolean
    released: boolean
  }
  ecommerce: {
    status: BusinessDataStatus
    draftState: 'ready' | 'legacy' | 'empty' | 'invalid' | 'unavailable'
    selectedSkus: number
    incomingRequests: number
    shopSourceReady: boolean
  }
}

export type BusinessCommandFact = {
  label: string
  value: string
  detail: string
}

export type BusinessCommandAnswer = {
  contract: 'supermega.local_business_answer.v1'
  intent: BusinessCommandIntent
  sourceCount: number
  title: string
  summary: string
  facts: BusinessCommandFact[]
  nextAction: {
    label: string
    path: string
    product: 'shop' | 'plant' | 'website' | 'ecommerce' | 'settings'
  }
  boundary: string
}

export type BusinessAttentionRank = {
  intent: Exclude<BusinessCommandIntent, 'attention'>
  level: number
  load: number
  order: number
}

const EMPTY_SHOP: LocalBusinessSnapshot['shop'] = {
  status: 'missing',
  itemCount: 0,
  lowStock: 0,
  activeOrders: 0,
  paymentExceptions: 0,
  refundsDue: 0,
  openPurchaseOrders: 0,
  incomingRequests: 0,
}

const EMPTY_PLANT: LocalBusinessSnapshot['plant'] = {
  status: 'missing',
  jobCount: 0,
  unfinishedJobs: 0,
  heldJobs: 0,
  openIssues: 0,
  priorityIssues: 0,
  stoppedMachines: 0,
}

const EMPTY_WEBSITE: LocalBusinessSnapshot['website'] = {
  status: 'missing',
  pageCount: 0,
  readyPages: 0,
  readinessPassed: 0,
  readinessTotal: 0,
  approved: false,
  released: false,
}

function readShop(storage: BusinessCommandStorage): LocalBusinessSnapshot['shop'] {
  let raw: string | null
  try {
    raw = storage.getItem(COMMERCE_KEY)
  } catch {
    return { ...EMPTY_SHOP, status: 'invalid' }
  }
  if (raw === null) return { ...EMPTY_SHOP }
  try {
    const state = validateCommerceState(JSON.parse(raw) as unknown)
    const purchaseOrders = state.purchaseOrders ?? []
    return {
      status: 'ready',
      itemCount: state.items.length,
      lowStock: state.items.filter((item) => item.onHand <= item.reorderAt).length,
      activeOrders: state.orders.filter((order) => ['confirmed', 'preparing', 'ready'].includes(order.status)).length,
      paymentExceptions: state.orders.filter((order) => order.status !== 'cancelled' && order.paymentStatus === 'pending').length,
      refundsDue: state.orders.filter((order) => order.refundStatus === 'due').length,
      openPurchaseOrders: purchaseOrders.filter((purchaseOrder) => {
        const progress = commercePurchaseOrderProgress(state, purchaseOrder)
        return progress.status === 'open' || progress.status === 'partially_received'
      }).length,
      incomingRequests: (state.storefrontRequests ?? []).length,
    }
  } catch {
    return { ...EMPTY_SHOP, status: 'invalid' }
  }
}

function readPlant(storage: BusinessCommandStorage): LocalBusinessSnapshot['plant'] {
  let raw: string | null
  try {
    raw = storage.getItem(PRODUCTION_KEY)
  } catch {
    return { ...EMPTY_PLANT, status: 'invalid' }
  }
  if (raw === null) return { ...EMPTY_PLANT }
  try {
    const state = validateProductionState(JSON.parse(raw) as unknown)
    const openIssues = state.issues.filter((issue) => issue.status === 'open')
    return {
      status: 'ready',
      jobCount: state.jobs.length,
      unfinishedJobs: state.jobs.filter((job) => !job.closure && job.output < job.target).length,
      heldJobs: state.jobs.filter((job) => Boolean(job.qualityHold) && !job.closure).length,
      openIssues: openIssues.length,
      priorityIssues: openIssues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length,
      stoppedMachines: state.machines.filter((machine) => machine.state === 'stopped').length,
    }
  } catch {
    return { ...EMPTY_PLANT, status: 'invalid' }
  }
}

function readWebsite(storage: BusinessCommandStorage): LocalBusinessSnapshot['website'] {
  try {
    const currentRaw = storage.getItem(WEBSITE_STORAGE_KEY)
    const legacyRaw = currentRaw === null ? storage.getItem(LEGACY_WEBSITE_STORAGE_KEY) : null
    if (currentRaw === null && legacyRaw === null) return { ...EMPTY_WEBSITE }
    const loaded = loadWebsiteWorkspace(storage)
    if (!loaded.ok) return { ...EMPTY_WEBSITE, status: 'invalid' }
    const checks = readinessChecks(loaded.workspace)
    return {
      status: 'ready',
      pageCount: loaded.workspace.pages.length,
      readyPages: loaded.workspace.pages.filter((page) => page.stage === 'ready').length,
      readinessPassed: checks.filter((check) => check.passed).length,
      readinessTotal: checks.length,
      approved: Boolean(getCurrentApproval(loaded.workspace)),
      released: Boolean(getCurrentPublish(loaded.workspace)),
    }
  } catch {
    return { ...EMPTY_WEBSITE, status: 'invalid' }
  }
}

function readEcommerce(storage: BusinessCommandStorage, shop: LocalBusinessSnapshot['shop']): LocalBusinessSnapshot['ecommerce'] {
  const draft = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, storage as StorefrontDraftStorage)
  const status: BusinessDataStatus = draft.status === 'ready' || draft.status === 'legacy'
    ? 'ready'
    : draft.status === 'empty'
      ? 'missing'
      : 'invalid'
  return {
    status,
    draftState: draft.status,
    selectedSkus: draft.draft?.selectedSkus.length ?? 0,
    incomingRequests: shop.incomingRequests,
    shopSourceReady: shop.status === 'ready' && shop.itemCount > 0,
  }
}

export function readLocalBusinessSnapshot(storage: BusinessCommandStorage): LocalBusinessSnapshot {
  const shop = readShop(storage)
  return {
    contract: 'supermega.local_business_snapshot.v1',
    shop,
    plant: readPlant(storage),
    website: readWebsite(storage),
    ecommerce: readEcommerce(storage, shop),
  }
}

export function classifyBusinessQuestion(question: string): BusinessCommandIntent {
  const normalized = question.trim().toLowerCase().slice(0, 240)
  if (/\b(ecommerce|e-commerce|online|storefront|cart|delivery|fulfil|fulfill)\b/.test(normalized)) return 'ecommerce_readiness'
  if (/\b(website|site|publish|release|content|seo|domain)\b/.test(normalized)) return 'website_readiness'
  if (/\b(plant|production|job|machine|quality|maintenance|shift|mes|factory)\b/.test(normalized)) return 'plant_control'
  if (/\b(shop|stock|inventory|reorder|payment|refund|sale|supplier|purchase)\b/.test(normalized)) return 'shop_inventory'
  return 'attention'
}

const boundary = 'This answer reads validated local records only. It does not send messages, publish, charge, move stock, write production, or train models.'

function unavailableAnswer(
  intent: BusinessCommandIntent,
  product: 'shop' | 'plant' | 'website' | 'ecommerce',
  status: BusinessDataStatus,
): BusinessCommandAnswer {
  const productLabel = product === 'ecommerce' ? 'Ecommerce' : product[0].toUpperCase() + product.slice(1)
  const invalid = status === 'invalid'
  const samplePath = product === 'shop'
    ? '/shop/?tab=counter'
    : product === 'plant'
      ? '/plant/?tab=production'
      : product === 'website'
        ? '/website/'
        : '/ecommerce/'
  return {
    contract: 'supermega.local_business_answer.v1',
    intent,
    sourceCount: 0,
    title: invalid ? `${productLabel} data needs repair` : `${productLabel} needs source data`,
    summary: invalid
      ? `Saved ${productLabel} data failed validation. SuperMega left it unchanged and will not infer an answer from it.`
      : `No saved ${productLabel} workspace is available yet. Open its working sample or import real records to get a grounded answer.`,
    facts: [
      { label: 'Source', value: invalid ? 'Validation failed' : 'Not connected', detail: invalid ? 'Original browser data remains untouched.' : 'No product records were read.' },
      { label: 'Evidence', value: 'Not enough', detail: 'SuperMega will not invent operational facts.' },
      { label: 'Action', value: invalid ? 'Repair data' : 'Open sample', detail: invalid ? 'Review the saved source without replacing it.' : 'Start with a working local product before managed activation.' },
      { label: 'Write gate', value: 'Blocked', detail: 'No external or product write can run from this answer.' },
    ],
    nextAction: invalid
      ? { label: `Repair ${productLabel} data`, path: `/settings/?product=${product}`, product }
      : { label: `Open ${productLabel} sample`, path: samplePath, product },
    boundary,
  }
}

function shopAnswer(snapshot: LocalBusinessSnapshot): BusinessCommandAnswer {
  const shop = snapshot.shop
  if (shop.status !== 'ready') return unavailableAnswer('shop_inventory', 'shop', shop.status)
  const urgent = shop.lowStock + shop.paymentExceptions + shop.refundsDue
  return {
    contract: 'supermega.local_business_answer.v1',
    intent: 'shop_inventory',
    sourceCount: 1,
    title: urgent ? `${urgent} Shop exceptions need review` : 'Shop records have no urgent exception',
    summary: urgent
      ? 'Review low stock, payment exceptions, and due refunds before advancing routine orders.'
      : 'Validated Shop records show no low-stock, pending-payment, or refund exception. Continue the active order queue.',
    facts: [
      { label: 'Stock', value: `${shop.lowStock} low / ${shop.itemCount} SKUs`, detail: 'On-hand quantity is at or below the saved reorder point.' },
      { label: 'Orders', value: `${shop.activeOrders} active`, detail: `${shop.incomingRequests} Ecommerce requests are retained in Shop.` },
      { label: 'Money review', value: `${shop.paymentExceptions} payment / ${shop.refundsDue} refund`, detail: 'These records still need accountable review.' },
      { label: 'Supply', value: `${shop.openPurchaseOrders} open PO`, detail: 'Open and partially received purchase orders only.' },
    ],
    nextAction: { label: urgent ? 'Review Shop inventory' : 'Open Shop orders', path: urgent ? '/shop/?tab=inventory' : '/shop/?tab=orders', product: 'shop' },
    boundary,
  }
}

function plantAnswer(snapshot: LocalBusinessSnapshot): BusinessCommandAnswer {
  const plant = snapshot.plant
  if (plant.status !== 'ready') return unavailableAnswer('plant_control', 'plant', plant.status)
  const blockers = plant.priorityIssues + plant.heldJobs + plant.stoppedMachines
  return {
    contract: 'supermega.local_business_answer.v1',
    intent: 'plant_control',
    sourceCount: 1,
    title: blockers ? `${blockers} production blockers need containment` : 'Plant has no critical control blocker',
    summary: blockers
      ? 'Contain high-priority issues, quality holds, and stopped equipment before routine MES progress.'
      : 'Validated Plant records show no high-priority issue, quality hold, or stopped machine. Continue unfinished jobs with owner review.',
    facts: [
      { label: 'Jobs', value: `${plant.unfinishedJobs} unfinished / ${plant.jobCount} total`, detail: 'Jobs without closure and below target output.' },
      { label: 'Quality', value: `${plant.heldJobs} held`, detail: 'Unclosed jobs with an active quality hold.' },
      { label: 'Issues', value: `${plant.priorityIssues} priority / ${plant.openIssues} open`, detail: 'Critical and high severity issues are prioritized.' },
      { label: 'Equipment', value: `${plant.stoppedMachines} stopped`, detail: 'Machine state only; no equipment command can run here.' },
    ],
    nextAction: { label: blockers ? 'Open Plant control' : 'Review MES jobs', path: '/plant/?tab=production', product: 'plant' },
    boundary,
  }
}

function websiteAnswer(snapshot: LocalBusinessSnapshot): BusinessCommandAnswer {
  const website = snapshot.website
  if (website.status !== 'ready') return unavailableAnswer('website_readiness', 'website', website.status)
  const ready = website.readinessPassed === website.readinessTotal && website.approved && website.released
  return {
    contract: 'supermega.local_business_answer.v1',
    intent: 'website_readiness',
    sourceCount: 1,
    title: ready ? 'Website release evidence is complete' : 'Website still needs release evidence',
    summary: ready
      ? 'The saved Website workspace has complete checks, current approval, and a current local release record.'
      : 'Complete the failed checks, then record current human approval and release evidence. This answer cannot publish a domain.',
    facts: [
      { label: 'Pages', value: `${website.readyPages} ready / ${website.pageCount} total`, detail: 'Ready page state from the saved Website workspace.' },
      { label: 'Checks', value: `${website.readinessPassed}/${website.readinessTotal} passed`, detail: 'Content, paths, navigation, destinations, and evidence.' },
      { label: 'Approval', value: website.approved ? 'Current' : 'Missing', detail: 'Evidence-bound human approval for this content revision.' },
      { label: 'Release record', value: website.released ? 'Current' : 'Missing', detail: 'Browser-local proof only; this is not a live domain claim.' },
    ],
    nextAction: { label: ready ? 'Open Website' : 'Finish Website review', path: '/website/', product: 'website' },
    boundary,
  }
}

function ecommerceAnswer(snapshot: LocalBusinessSnapshot): BusinessCommandAnswer {
  const ecommerce = snapshot.ecommerce
  if (ecommerce.status !== 'ready') return unavailableAnswer('ecommerce_readiness', 'ecommerce', ecommerce.status)
  const ready = ecommerce.draftState === 'ready' && ecommerce.shopSourceReady && ecommerce.selectedSkus > 0
  return {
    contract: 'supermega.local_business_answer.v1',
    intent: 'ecommerce_readiness',
    sourceCount: ecommerce.shopSourceReady ? 2 : 1,
    title: ready ? 'Ecommerce setup is ready for order review' : 'Ecommerce setup needs a source fix',
    summary: ready
      ? 'The current storefront draft is tied to a validated Shop source. Incoming requests still require Shop-side owner review.'
      : 'Upgrade the draft or connect a validated Shop catalog before treating Ecommerce requests as operational orders.',
    facts: [
      { label: 'Draft', value: ecommerce.draftState === 'legacy' ? 'Upgrade needed' : 'Current', detail: 'Saved storefront draft schema and scope.' },
      { label: 'Catalog', value: `${ecommerce.selectedSkus} selected SKUs`, detail: ecommerce.shopSourceReady ? 'Validated Shop catalog is available.' : 'Validated Shop catalog is missing.' },
      { label: 'Requests', value: `${ecommerce.incomingRequests} in Shop`, detail: 'Retained requests only; not a claim of fulfilment or payment.' },
      { label: 'Order gate', value: ready ? 'Review ready' : 'Blocked', detail: 'Owner approval remains required before any Shop action.' },
    ],
    nextAction: { label: ready ? 'Review Ecommerce orders' : 'Repair Ecommerce setup', path: '/ecommerce/', product: 'ecommerce' },
    boundary,
  }
}

function sourceCount(snapshot: LocalBusinessSnapshot) {
  return [snapshot.shop, snapshot.plant, snapshot.website, snapshot.ecommerce].filter((source) => source.status === 'ready').length
}

export function rankBusinessAttention(snapshot: LocalBusinessSnapshot): BusinessAttentionRank[] {
  const shop = snapshot.shop
  const plant = snapshot.plant
  const website = snapshot.website
  const ecommerce = snapshot.ecommerce
  return [
    {
      intent: 'shop_inventory' as const,
      level: shop.status === 'invalid' ? 3 : shop.status === 'ready' ? (shop.paymentExceptions || shop.refundsDue ? 3 : shop.lowStock ? 2 : shop.activeOrders || shop.openPurchaseOrders ? 1 : 0) : -1,
      load: shop.status === 'ready' ? (shop.paymentExceptions + shop.refundsDue) * 3 + shop.lowStock * 2 + shop.activeOrders + shop.openPurchaseOrders : shop.status === 'invalid' ? 1 : -1,
      order: 0,
    },
    {
      intent: 'plant_control' as const,
      level: plant.status === 'invalid' ? 5 : plant.status === 'ready' ? (plant.stoppedMachines ? 4 : plant.priorityIssues || plant.heldJobs ? 3 : plant.openIssues || plant.unfinishedJobs ? 1 : 0) : -1,
      load: plant.status === 'ready' ? plant.priorityIssues * 4 + plant.heldJobs * 3 + plant.stoppedMachines * 6 + plant.openIssues * 2 + plant.unfinishedJobs : plant.status === 'invalid' ? 1 : -1,
      order: 1,
    },
    {
      intent: 'website_readiness' as const,
      level: website.status === 'invalid' ? 3 : website.status === 'ready' ? (!website.approved || !website.released ? 2 : website.readyPages < website.pageCount || website.readinessPassed < website.readinessTotal ? 1 : 0) : -1,
      load: website.status === 'ready' ? (website.approved ? 0 : 2) + (website.released ? 0 : 2) + website.pageCount - website.readyPages + website.readinessTotal - website.readinessPassed : website.status === 'invalid' ? 1 : -1,
      order: 2,
    },
    {
      intent: 'ecommerce_readiness' as const,
      level: ecommerce.status === 'invalid' ? 3 : ecommerce.status === 'ready' ? (!ecommerce.shopSourceReady ? 2 : ecommerce.incomingRequests ? 1 : 0) : -1,
      load: ecommerce.status === 'ready' ? ecommerce.incomingRequests + (ecommerce.shopSourceReady ? 0 : 3) + (ecommerce.draftState === 'legacy' ? 2 : 0) : ecommerce.status === 'invalid' ? 1 : -1,
      order: 3,
    },
  ].filter((row) => row.level >= 0)
    .sort((left, right) => right.level - left.level || right.load - left.load || left.order - right.order)
}

function attentionAnswer(snapshot: LocalBusinessSnapshot): BusinessCommandAnswer {
  const availableSources = sourceCount(snapshot)
  const ranked = rankBusinessAttention(snapshot)
  if (availableSources === 0 && ranked.length === 0) {
    return {
      contract: 'supermega.local_business_answer.v1',
      intent: 'attention',
      sourceCount: 0,
      title: 'Start with one business source',
      summary: 'No validated product workspace is saved yet. Open the working Shop sample or import your own catalog to create the first grounded operating answer.',
      facts: [
        { label: 'Shop', value: 'No source', detail: 'Catalog, stock, orders, and money review are unavailable.' },
        { label: 'Plant', value: 'No source', detail: 'Jobs, issues, quality, and equipment state are unavailable.' },
        { label: 'Website', value: 'No source', detail: 'Pages, readiness, approval, and release evidence are unavailable.' },
        { label: 'Ecommerce', value: 'No source', detail: 'Store draft and Shop review are unavailable.' },
      ],
      nextAction: { label: 'Open Shop sample', path: '/shop/?tab=counter', product: 'shop' },
      boundary,
    }
  }

  const selected = ranked[0].intent === 'shop_inventory'
    ? shopAnswer(snapshot)
    : ranked[0].intent === 'plant_control'
      ? plantAnswer(snapshot)
      : ranked[0].intent === 'website_readiness'
        ? websiteAnswer(snapshot)
        : ecommerceAnswer(snapshot)
  return {
    ...selected,
    intent: 'attention',
    sourceCount: availableSources,
    title: `Start here: ${selected.title}`,
  }
}

export function buildBusinessCommandAnswer(snapshot: LocalBusinessSnapshot, intent: BusinessCommandIntent): BusinessCommandAnswer {
  if (snapshot.contract !== 'supermega.local_business_snapshot.v1') throw new Error('Business snapshot contract is invalid.')
  if (intent === 'shop_inventory') return shopAnswer(snapshot)
  if (intent === 'plant_control') return plantAnswer(snapshot)
  if (intent === 'website_readiness') return websiteAnswer(snapshot)
  if (intent === 'ecommerce_readiness') return ecommerceAnswer(snapshot)
  return attentionAnswer(snapshot)
}
