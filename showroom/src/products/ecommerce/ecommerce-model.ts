export const commerceViewDefinitions = [
  { id: 'orders', label: 'Orders', index: '01' },
  { id: 'catalog', label: 'Catalog', index: '02' },
  { id: 'fulfillment', label: 'Fulfilment', index: '03' },
  { id: 'payments', label: 'Payments', index: '04' },
] as const

export type CommerceView = (typeof commerceViewDefinitions)[number]['id']

export type PaymentMethod =
  | 'cash_on_delivery'
  | 'cash_pickup'
  | 'kbzpay_qr'
  | 'wavepay_qr'
  | 'manual_bank_transfer'

export type PaymentStatus =
  | 'cash_due'
  | 'evidence_needed'
  | 'evidence_submitted'
  | 'reconciled'
  | 'exception'

export type FulfillmentStatus =
  | 'awaiting_confirmation'
  | 'picking'
  | 'ready_for_dispatch'
  | 'out_for_delivery'
  | 'delivered'
  | 'held'

export type CatalogItem = {
  sku: string
  name: string
  variant: string
  onHand: number
  reorderAt: number
  priceMmk: number
  active: boolean
}

export type OrderLine = {
  sku: string
  name: string
  quantity: number
  unitPriceMmk: number
}

export type CommerceOrder = {
  id: string
  createdAt: string
  customer: string
  phoneSuffix: string
  township: string
  channel: 'Messenger' | 'Viber' | 'Phone' | 'Website' | 'Walk-in'
  lines: OrderLine[]
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentEvidence?: string
  fulfillmentStatus: FulfillmentStatus
  deliveryMethod: 'Yangon delivery' | 'Customer pickup'
  note?: string
}

export type AuditActorKind = 'human' | 'demo_fixture'
export type AuditEventAction = ProposedActionKind | 'scenario_loaded' | 'accept_website_handoff' | 'complete_website_order'

export type AuditEvent = {
  id: string
  createdAt: string
  actorKind: AuditActorKind
  actor: string
  action: AuditEventAction
  subjectId: string
  summary: string
  before: string
  after: string
  reason: string
  evidenceReference: string
}

export type CommerceWorkspace = {
  catalog: CatalogItem[]
  orders: CommerceOrder[]
  audit: AuditEvent[]
  nextAuditSequence: number
}

export type ProposedActionKind =
  | 'confirm_order'
  | 'complete_pick'
  | 'approve_dispatch'
  | 'confirm_delivery'
  | 'release_hold'
  | 'record_payment_evidence'
  | 'reconcile_payment'
  | 'record_cash_collection'
  | 'resolve_payment_exception'
  | 'receive_stock'

type FulfillmentChange = {
  type: 'fulfillment'
  orderId: string
  from: FulfillmentStatus
  to: FulfillmentStatus
}

type PaymentChange = {
  type: 'payment'
  orderId: string
  from: PaymentStatus
  to: PaymentStatus
}

type StockChange = {
  type: 'stock'
  sku: string
  quantity: number
}

export type ProposedAction = {
  id: string
  kind: ProposedActionKind
  subjectId: string
  title: string
  consequence: string
  before: string
  after: string
  evidencePrompt: string
  change: FulfillmentChange | PaymentChange | StockChange
}

export type ApprovalDetails = {
  actor: string
  reason: string
  evidenceReference: string
}

export type CommerceReducerAction =
  | {
      type: 'apply_approved_action'
      proposal: ProposedAction
      approval: ApprovalDetails
      appliedAt: string
    }
  | { type: 'reset_demo'; workspace: CommerceWorkspace }

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash_on_delivery: 'Cash on delivery',
  cash_pickup: 'Cash at pickup',
  kbzpay_qr: 'KBZPay QR · manual check',
  wavepay_qr: 'WavePay QR · manual check',
  manual_bank_transfer: 'Bank transfer · manual check',
}

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  cash_due: 'Cash due',
  evidence_needed: 'Evidence needed',
  evidence_submitted: 'Needs reconciliation',
  reconciled: 'Reconciled',
  exception: 'Exception',
}

export const fulfillmentStatusLabels: Record<FulfillmentStatus, string> = {
  awaiting_confirmation: 'Awaiting confirmation',
  picking: 'Picking',
  ready_for_dispatch: 'Ready for dispatch',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  held: 'Held',
}

const fulfillmentTransitions: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  awaiting_confirmation: 'picking',
  picking: 'ready_for_dispatch',
  ready_for_dispatch: 'out_for_delivery',
  out_for_delivery: 'delivered',
  held: 'awaiting_confirmation',
}

const fulfillmentActionKinds: Partial<Record<FulfillmentStatus, ProposedActionKind>> = {
  awaiting_confirmation: 'confirm_order',
  picking: 'complete_pick',
  ready_for_dispatch: 'approve_dispatch',
  out_for_delivery: 'confirm_delivery',
  held: 'release_hold',
}

const fulfillmentActionLabels: Partial<Record<FulfillmentStatus, string>> = {
  awaiting_confirmation: 'Approve order',
  picking: 'Confirm pick complete',
  ready_for_dispatch: 'Approve dispatch',
  out_for_delivery: 'Confirm delivered',
  held: 'Release payment hold',
}

const fulfillmentEvidencePrompts: Partial<Record<FulfillmentStatus, string>> = {
  awaiting_confirmation: 'Stock check, customer confirmation, or source message reference',
  picking: 'Pick list or packing check reference',
  ready_for_dispatch: 'Rider handoff or pickup reference',
  out_for_delivery: 'Delivery confirmation or customer acknowledgement',
  held: 'Payment review or owner decision reference',
}

function minutesBefore(now: number, minutes: number) {
  return new Date(now - minutes * 60_000).toISOString()
}

function createProposalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  return `REQ-${Date.now().toString(36).toUpperCase()}`
}

export function createDemoWorkspace(now = Date.now()): CommerceWorkspace {
  return {
    catalog: [
      { sku: 'SM-RICE-05', name: 'Shwebo rice', variant: '5 viss bag', onHand: 18, reorderAt: 8, priceMmk: 46_000, active: true },
      { sku: 'SM-OIL-02', name: 'Peanut oil', variant: '2 litre tin', onHand: 7, reorderAt: 10, priceMmk: 24_500, active: true },
      { sku: 'SM-CARE-01', name: 'Family care set', variant: 'Standard bundle', onHand: 14, reorderAt: 6, priceMmk: 31_000, active: true },
      { sku: 'SM-TEA-12', name: 'Myanmar tea mix', variant: '12 sachets', onHand: 22, reorderAt: 9, priceMmk: 8_500, active: true },
    ],
    orders: [
      {
        id: 'ORD-MM-2407',
        createdAt: minutesBefore(now, 34),
        customer: 'Ma Thiri',
        phoneSuffix: '•• 3812',
        township: 'Hlaing',
        channel: 'Messenger',
        lines: [
          { sku: 'SM-OIL-02', name: 'Peanut oil', quantity: 1, unitPriceMmk: 24_500 },
          { sku: 'SM-TEA-12', name: 'Myanmar tea mix', quantity: 2, unitPriceMmk: 8_500 },
        ],
        paymentMethod: 'kbzpay_qr',
        paymentStatus: 'evidence_submitted',
        paymentEvidence: 'KBZ-DEMO-2407',
        fulfillmentStatus: 'awaiting_confirmation',
        deliveryMethod: 'Yangon delivery',
        note: 'Customer requested an evening delivery window.',
      },
      {
        id: 'ORD-MM-2406',
        createdAt: minutesBefore(now, 58),
        customer: 'Ko Min',
        phoneSuffix: '•• 9046',
        township: 'South Okkalapa',
        channel: 'Phone',
        lines: [{ sku: 'SM-RICE-05', name: 'Shwebo rice', quantity: 1, unitPriceMmk: 46_000 }],
        paymentMethod: 'cash_on_delivery',
        paymentStatus: 'cash_due',
        fulfillmentStatus: 'ready_for_dispatch',
        deliveryMethod: 'Yangon delivery',
      },
      {
        id: 'ORD-MM-2405',
        createdAt: minutesBefore(now, 91),
        customer: 'Daw Mya',
        phoneSuffix: '•• 1180',
        township: 'Yankin',
        channel: 'Viber',
        lines: [{ sku: 'SM-CARE-01', name: 'Family care set', quantity: 1, unitPriceMmk: 31_000 }],
        paymentMethod: 'wavepay_qr',
        paymentStatus: 'exception',
        paymentEvidence: 'WAVE-DEMO-2405 · amount unreadable',
        fulfillmentStatus: 'held',
        deliveryMethod: 'Customer pickup',
        note: 'Hold until a readable reference is reviewed.',
      },
      {
        id: 'ORD-MM-2404',
        createdAt: minutesBefore(now, 142),
        customer: 'U Zaw',
        phoneSuffix: '•• 5521',
        township: 'Sanchaung',
        channel: 'Walk-in',
        lines: [{ sku: 'SM-TEA-12', name: 'Myanmar tea mix', quantity: 1, unitPriceMmk: 8_500 }],
        paymentMethod: 'cash_pickup',
        paymentStatus: 'reconciled',
        paymentEvidence: 'COUNTER-DEMO-071',
        fulfillmentStatus: 'delivered',
        deliveryMethod: 'Customer pickup',
      },
    ],
    audit: [
      {
        id: 'AUD-DEMO-003',
        createdAt: minutesBefore(now, 33),
        actorKind: 'demo_fixture',
        actor: 'Scenario fixture',
        action: 'scenario_loaded',
        subjectId: 'ORD-MM-2407',
        summary: 'QR evidence attached to the sample order',
        before: 'Evidence needed',
        after: 'Needs reconciliation',
        reason: 'Provides a safe guided review path.',
        evidenceReference: 'KBZ-DEMO-2407',
      },
      {
        id: 'AUD-DEMO-002',
        createdAt: minutesBefore(now, 56),
        actorKind: 'demo_fixture',
        actor: 'Scenario fixture',
        action: 'scenario_loaded',
        subjectId: 'ORD-MM-2406',
        summary: 'Sample order moved to ready for dispatch',
        before: 'Picking',
        after: 'Ready for dispatch',
        reason: 'Shows the cash-on-delivery handoff boundary.',
        evidenceReference: 'PACK-DEMO-2406',
      },
      {
        id: 'AUD-DEMO-001',
        createdAt: minutesBefore(now, 140),
        actorKind: 'demo_fixture',
        actor: 'Scenario fixture',
        action: 'scenario_loaded',
        subjectId: 'ORD-MM-2404',
        summary: 'Sample counter order completed',
        before: 'Cash due',
        after: 'Reconciled',
        reason: 'Demonstrates a completed local record.',
        evidenceReference: 'COUNTER-DEMO-071',
      },
    ],
    nextAuditSequence: 4,
  }
}

export function getOrderTotal(order: CommerceOrder) {
  return order.lines.reduce((total, line) => total + line.quantity * line.unitPriceMmk, 0)
}

export function formatMmk(value: number) {
  return `${new Intl.NumberFormat('en-US').format(value)} MMK`
}

export function formatYangonTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Yangon',
  }).format(new Date(value))
}

export function fulfillmentActionLabel(order: CommerceOrder) {
  if (order.fulfillmentStatus === 'held' && order.paymentStatus === 'exception') return null
  return fulfillmentActionLabels[order.fulfillmentStatus] ?? null
}

export function paymentActionLabel(order: CommerceOrder) {
  if (order.paymentStatus === 'reconciled') return null
  if (order.paymentStatus === 'cash_due') return order.fulfillmentStatus === 'delivered' ? 'Record cash collection' : null
  if (order.paymentStatus === 'evidence_needed') return 'Record payment evidence'
  if (order.paymentStatus === 'evidence_submitted') return 'Reconcile payment evidence'
  return 'Resolve payment exception'
}

export function createFulfillmentProposal(order: CommerceOrder): ProposedAction | null {
  if (order.fulfillmentStatus === 'held' && order.paymentStatus === 'exception') return null
  const to = fulfillmentTransitions[order.fulfillmentStatus]
  const kind = fulfillmentActionKinds[order.fulfillmentStatus]
  const title = fulfillmentActionLabels[order.fulfillmentStatus]
  const evidencePrompt = fulfillmentEvidencePrompts[order.fulfillmentStatus]
  if (!to || !kind || !title || !evidencePrompt) return null

  return {
    id: createProposalId(),
    kind,
    subjectId: order.id,
    title: `${title} · ${order.id}`,
    consequence: 'Changes the fulfilment record used by the next operator. No customer or delivery service is contacted.',
    before: fulfillmentStatusLabels[order.fulfillmentStatus],
    after: fulfillmentStatusLabels[to],
    evidencePrompt,
    change: { type: 'fulfillment', orderId: order.id, from: order.fulfillmentStatus, to },
  }
}

export function createPaymentProposal(order: CommerceOrder): ProposedAction | null {
  let kind: ProposedActionKind
  let to: PaymentStatus
  let title: string
  let evidencePrompt: string

  if (order.paymentStatus === 'cash_due') {
    if (order.fulfillmentStatus !== 'delivered') return null
    kind = 'record_cash_collection'
    to = 'reconciled'
    title = 'Record cash collection'
    evidencePrompt = 'Rider cash sheet, counter receipt, or owner count reference'
  } else if (order.paymentStatus === 'evidence_needed') {
    kind = 'record_payment_evidence'
    to = 'evidence_submitted'
    title = 'Record payment evidence'
    evidencePrompt = 'Customer-provided transaction or receipt reference'
  } else if (order.paymentStatus === 'evidence_submitted') {
    kind = 'reconcile_payment'
    to = 'reconciled'
    title = 'Reconcile payment evidence'
    evidencePrompt = 'Reviewed receipt, statement line, or manual ledger reference'
  } else if (order.paymentStatus === 'exception') {
    kind = 'resolve_payment_exception'
    to = 'evidence_submitted'
    title = 'Replace exception evidence'
    evidencePrompt = 'New readable transaction reference or owner decision'
  } else {
    return null
  }

  return {
    id: createProposalId(),
    kind,
    subjectId: order.id,
    title: `${title} · ${order.id}`,
    consequence: 'Updates only the local reconciliation record. It does not verify with a bank, move money, refund, or capture payment.',
    before: paymentStatusLabels[order.paymentStatus],
    after: paymentStatusLabels[to],
    evidencePrompt,
    change: { type: 'payment', orderId: order.id, from: order.paymentStatus, to },
  }
}

export function createStockReceiptProposal(item: CatalogItem, quantity = 10): ProposedAction {
  return {
    id: createProposalId(),
    kind: 'receive_stock',
    subjectId: item.sku,
    title: `Receive ${quantity} units · ${item.sku}`,
    consequence: 'Increases the local available-stock record. It does not create a supplier receipt or warehouse movement.',
    before: `${item.onHand} on hand`,
    after: `${item.onHand + quantity} on hand`,
    evidencePrompt: 'Count sheet, supplier note, or receiving observation',
    change: { type: 'stock', sku: item.sku, quantity },
  }
}

function applyProposal(state: CommerceWorkspace, proposal: ProposedAction, evidenceReference: string) {
  if (proposal.change.type === 'fulfillment') {
    const change = proposal.change
    const order = state.orders.find((candidate) => candidate.id === change.orderId)
    if (!order || order.fulfillmentStatus !== change.from) return null
    return {
      catalog: state.catalog,
      orders: state.orders.map((candidate) => candidate.id === change.orderId
        ? { ...candidate, fulfillmentStatus: change.to }
        : candidate),
    }
  }

  if (proposal.change.type === 'payment') {
    const change = proposal.change
    const order = state.orders.find((candidate) => candidate.id === change.orderId)
    if (!order || order.paymentStatus !== change.from) return null
    return {
      catalog: state.catalog,
      orders: state.orders.map((candidate) => candidate.id === change.orderId
        ? { ...candidate, paymentStatus: change.to, paymentEvidence: evidenceReference }
        : candidate),
    }
  }

  const change = proposal.change
  const item = state.catalog.find((candidate) => candidate.sku === change.sku)
  if (!item) return null
  return {
    catalog: state.catalog.map((candidate) => candidate.sku === change.sku
      ? { ...candidate, onHand: candidate.onHand + change.quantity }
      : candidate),
    orders: state.orders,
  }
}

function isValidApprovalDetails(approval: ApprovalDetails) {
  return approval.actor === approval.actor.trim()
    && approval.actor.length > 0
    && approval.actor.length <= 80
    && approval.reason === approval.reason.trim()
    && approval.reason.length > 0
    && approval.reason.length <= 220
    && approval.evidenceReference === approval.evidenceReference.trim()
    && approval.evidenceReference.length > 0
    && approval.evidenceReference.length <= 180
}

export function commerceReducer(state: CommerceWorkspace, action: CommerceReducerAction): CommerceWorkspace {
  if (action.type === 'reset_demo') return action.workspace

  if (!isValidApprovalDetails(action.approval) || Number.isNaN(Date.parse(action.appliedAt))) return state

  const applied = applyProposal(state, action.proposal, action.approval.evidenceReference)
  if (!applied) return state

  const auditEvent: AuditEvent = {
    id: `AUD-${String(state.nextAuditSequence).padStart(4, '0')}`,
    createdAt: action.appliedAt,
    actorKind: 'human',
    actor: action.approval.actor,
    action: action.proposal.kind,
    subjectId: action.proposal.subjectId,
    summary: action.proposal.title,
    before: action.proposal.before,
    after: action.proposal.after,
    reason: action.approval.reason,
    evidenceReference: action.approval.evidenceReference,
  }

  return {
    ...state,
    ...applied,
    audit: [auditEvent, ...state.audit].slice(0, 100),
    nextAuditSequence: state.nextAuditSequence + 1,
  }
}
