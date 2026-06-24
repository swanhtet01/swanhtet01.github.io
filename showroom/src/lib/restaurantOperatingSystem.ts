export type RestaurantDaypart = 'opening' | 'lunch' | 'dinner' | 'close'

export type RestaurantShiftRecord = {
  id: string
  daypart: RestaurantDaypart
  branchName: string
  managerName: string
  status: 'ready' | 'blocked' | 'handover'
  blocker: string
  handover: string
  createdAt: string
}

export type RestaurantStockRecord = {
  id: string
  itemName: string
  par: number
  current: number
  waste: number
  supplierIssue: string
  action: string
  createdAt: string
}

export type RestaurantGuestRecord = {
  id: string
  channel: string
  branchName: string
  issue: string
  recovery: string
  owner: string
  status: 'open' | 'recovering' | 'closed'
  createdAt: string
}

export type RestaurantPromoRecord = {
  id: string
  branchName: string
  promoName: string
  salesLift: number
  foodCostPressure: number
  laborPressure: number
  decision: 'extend' | 'correct' | 'stop' | 'review'
  owner: string
  createdAt: string
}

export type RestaurantPaymentStatus = 'draft' | 'link-issued' | 'partial' | 'paid' | 'refunded' | 'reconcile'
export type RestaurantPaymentTender = 'cash' | 'card' | 'qr' | 'bank-transfer' | 'voucher' | 'house'

export type RestaurantCashMovementType = 'add' | 'remove' | 'payout' | 'safe-drop' | 'tip-out'

export type RestaurantCashMovementRecord = {
  id: string
  registerId: string
  type: RestaurantCashMovementType
  amountMmk: number
  reasonCode: string
  note: string
  owner: string
  createdAt: string
}

export type RestaurantRegisterSessionStatus = 'open' | 'closed'

export type RestaurantRegisterSession = {
  id: string
  registerId: string
  owner: string
  openingFloatMmk: number
  expectedCashMmk: number
  countedCashMmk: number
  varianceMmk: number
  closeNote: string
  status: RestaurantRegisterSessionStatus
  openedAt: string
  closedAt: string
}

export type RestaurantPaymentRecord = {
  id: string
  orderRef: string
  tableName: string
  amountMmk: number
  provider: string
  tenderType: RestaurantPaymentTender
  paymentPayload: string
  customerName: string
  customerPhone: string
  itemSummary: string
  splitGroup: string
  seatLabel: string
  collectedMmk: number
  refundedMmk: number
  tipMmk: number
  changeGivenMmk: number
  settlementRef: string
  proofNote: string
  status: RestaurantPaymentStatus
  note: string
  paidAt: string
  verifiedBy: string
  createdAt: string
}

export type RestaurantTableStatus = 'open' | 'seated' | 'ordered' | 'served' | 'bill-requested' | 'paid' | 'reset'

export type RestaurantTableRecord = {
  id: string
  tableName: string
  floorZone: string
  seats: number
  guestCount: number
  status: RestaurantTableStatus
  orderRef: string
  assignedServer: string
  note: string
  createdAt: string
  updatedAt: string
}

export type RestaurantKitchenTicketStatus = 'queued' | 'firing' | 'ready' | 'served' | 'delayed'
export type RestaurantKitchenTicketPriority = 'normal' | 'rush'

export type RestaurantKitchenTicketRecord = {
  id: string
  orderRef: string
  tableName: string
  station: string
  itemSummary: string
  targetReadyAt: string
  status: RestaurantKitchenTicketStatus
  priority: RestaurantKitchenTicketPriority
  owner: string
  note: string
  createdAt: string
  updatedAt: string
}

export type RestaurantApprovalActionType = 'void' | 'discount' | 'service-charge' | 'refund' | 'closeout'
export type RestaurantApprovalStatus = 'pending' | 'approved' | 'rejected'

export type RestaurantApprovalRecord = {
  id: string
  orderRef: string
  tableName: string
  actionType: RestaurantApprovalActionType
  reason: string
  amountMmk: number
  requestedBy: string
  approvedBy: string
  status: RestaurantApprovalStatus
  note: string
  createdAt: string
  updatedAt: string
}

export type RestaurantAuditSeverity = 'info' | 'review' | 'critical'

export type RestaurantAuditRecord = {
  id: string
  event: string
  detail: string
  actor: string
  actorRole: string
  severity: RestaurantAuditSeverity
  createdAt: string
}

export type RestaurantPaymentSetup = {
  providerName: string
  merchantName: string
  merchantId: string
  branchCode: string
  settlementAccountMasked: string
  mmqrTemplate: string
  settlementExportFormat: string
  cashupOwner: string
  enabledAt: string
}

export type RestaurantMenuItem = {
  id: string
  section: string
  name: string
  price: number
  description: string
}

export type RestaurantMenuSource = {
  name: string
  type: string
  size: number
  capturedAt: string
}

export type RestaurantMenuTransition = {
  sourceText: string
  sourceFiles: RestaurantMenuSource[]
  items: RestaurantMenuItem[]
  orderingMode: 'digital-menu' | 'order-request'
  publicSlug: string
  updatedAt: string
}

export type RestaurantShiftReviewStatus = 'open' | 'locked' | 'released'

export type RestaurantShiftReviewLock = {
  status: RestaurantShiftReviewStatus
  owner: string
  note: string
  lockedAt: string
  releasedAt: string
  updatedAt: string
}

export type RestaurantOfflineQueueLock = 'none' | 'payments-only' | 'strict'

export type RestaurantOfflineGuardrail = {
  isOfflineCaptureActive: boolean
  reconnectDeadlineAt: string
  reconnectOwner: string
  queueLockLevel: RestaurantOfflineQueueLock
  pendingUploads: number
  pendingCriticalActions: number
  dangerousActionsLocked: boolean
  lastOnlineAt: string
  updatedAt: string
}

export type RestaurantTipRecoveryStatus = 'pending' | 'recovered' | 'waived'

export type RestaurantTipRecoveryRecord = {
  id: string
  orderRef: string
  staffName: string
  expectedTipMmk: number
  recoveredTipMmk: number
  status: RestaurantTipRecoveryStatus
  note: string
  createdAt: string
  resolvedAt: string
}

export type RestaurantTransferStatus = 'requested' | 'dispatched' | 'received' | 'variance'

export type RestaurantInventoryTransferRecord = {
  id: string
  itemName: string
  fromLocation: string
  toLocation: string
  requestedQty: number
  dispatchedQty: number
  receivedQty: number
  status: RestaurantTransferStatus
  requestedBy: string
  dispatchedBy: string
  receivedBy: string
  varianceNote: string
  createdAt: string
  updatedAt: string
}

export type RestaurantServiceLaneType = 'table' | 'kitchen'
export type RestaurantServiceDeviceType = 'terminal' | 'tablet' | 'phone' | 'kds'

export type RestaurantServiceDeviceAssignment = {
  id: string
  laneType: RestaurantServiceLaneType
  laneRef: string
  station: string
  deviceLabel: string
  deviceType: RestaurantServiceDeviceType
  owner: string
  status: 'active' | 'inactive'
  note: string
  updatedAt: string
}

export type RestaurantMenuDaypartSchedule = {
  id: string
  daypart: RestaurantDaypart
  startTime: string
  endTime: string
  menuLabel: string
  active: boolean
  updatedBy: string
  updatedAt: string
}

export type RestaurantOperatingWorkspace = {
  branchName: string
  managerName: string
  businessDate: string
  updatedAt: string
  shifts: RestaurantShiftRecord[]
  stock: RestaurantStockRecord[]
  guests: RestaurantGuestRecord[]
  promos: RestaurantPromoRecord[]
  payments: RestaurantPaymentRecord[]
  tables: RestaurantTableRecord[]
  kitchenTickets: RestaurantKitchenTicketRecord[]
  approvals: RestaurantApprovalRecord[]
  registerSessions: RestaurantRegisterSession[]
  cashMovements: RestaurantCashMovementRecord[]
  auditTrail: RestaurantAuditRecord[]
  paymentSetup: RestaurantPaymentSetup
  menu: RestaurantMenuTransition
  shiftReviewLock: RestaurantShiftReviewLock
  offlineGuardrail: RestaurantOfflineGuardrail
  tipRecoveries: RestaurantTipRecoveryRecord[]
  inventoryTransfers: RestaurantInventoryTransferRecord[]
  serviceDevices: RestaurantServiceDeviceAssignment[]
  menuDaypartSchedules: RestaurantMenuDaypartSchedule[]
}

export type RestaurantOperatingSummary = {
  openBlockers: number
  stockoutRisks: number
  wasteUnits: number
  guestIssuesOpen: number
  promosNeedingDecision: number
  menuItems: number
  paymentReviewCount: number
  paymentReviewValueMmk: number
  partialPaymentCount: number
  refundedPaymentCount: number
  openRegisterCount: number
  cashVarianceMmk: number
  tableServiceAlerts: number
  kitchenDelayedCount: number
  pendingApprovalCount: number
  tipRecoveryPendingCount: number
  transferVarianceCount: number
  offlinePendingUploadCount: number
  deviceCoverageCount: number
  recordCount: number
}

export type RestaurantEnterpriseGateStatus = 'ready' | 'review' | 'blocked'

export type RestaurantEnterpriseGate = {
  id: string
  label: string
  status: RestaurantEnterpriseGateStatus
  detail: string
  ownerAction: string
}

export type RestaurantAiControlAction = {
  id: string
  label: string
  source: string
  output: string
  approvalRequired: string
}

export type RestaurantEnterpriseControl = {
  score: number
  label: string
  incidentLevel: 'green' | 'amber' | 'red'
  gates: RestaurantEnterpriseGate[]
  aiActions: RestaurantAiControlAction[]
  ownerBrief: string[]
  permissionBoundary: string[]
  releaseControls: string[]
  branchContext: string
}

export type RestaurantGoLiveChecklistItem = {
  control: string
  status: 'ready' | 'review' | 'blocked'
  owner: string
  detail: string
}

const STORAGE_KEY = 'supermega.restaurant-os.workspace.v1'
const LEGACY_DEMO_BRANCH_NAME = 'Golden Plate Downtown'
const MODERN_DEMO_BRANCH_NAME = 'Restaurant Demo Pack / Core Site'
const LEGACY_DEMO_SLUG = 'golden-plate-downtown'
const MODERN_DEMO_SLUG = 'restaurant-demo-core'
const LEGACY_DEMO_MENU_FILE = 'golden-plate-menu.txt'
const MODERN_DEMO_MENU_FILE = 'restaurant-demo-menu.txt'

function resolveWorkspaceStorageKey(scopeKey?: string | null) {
  const normalized = String(scopeKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!normalized) {
    return STORAGE_KEY
  }
  return `${STORAGE_KEY}.${normalized}`
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function slugify(value: string) {
  return String(value || 'restaurant-menu')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'restaurant-menu'
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function normalizeMenu(value: Partial<RestaurantMenuTransition> | null | undefined, branchName: string): RestaurantMenuTransition {
  return {
    sourceText: String(value?.sourceText ?? ''),
    sourceFiles: Array.isArray(value?.sourceFiles) ? value.sourceFiles : [],
    items: Array.isArray(value?.items) ? value.items : [],
    orderingMode: value?.orderingMode === 'order-request' ? 'order-request' : 'digital-menu',
    publicSlug: String(value?.publicSlug || slugify(branchName)),
    updatedAt: String(value?.updatedAt ?? nowIso()),
  }
}

function normalizeMinuteTime(value: unknown, fallback = '00:00') {
  const candidate = String(value || '').trim()
  if (/^\d{1,2}:\d{2}$/.test(candidate)) {
    const [hText, mText] = candidate.split(':')
    const h = Number(hText)
    const m = Number(mText)
    if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }
  return fallback
}

function normalizePaymentSetup(value: Partial<RestaurantPaymentSetup> | null | undefined, managerName = ''): RestaurantPaymentSetup {
  return {
    providerName: String(value?.providerName || ''),
    merchantName: String(value?.merchantName || ''),
    merchantId: String(value?.merchantId || ''),
    branchCode: String(value?.branchCode || ''),
    settlementAccountMasked: String(value?.settlementAccountMasked || ''),
    mmqrTemplate: String(value?.mmqrTemplate || ''),
    settlementExportFormat: String(value?.settlementExportFormat || ''),
    cashupOwner: String(value?.cashupOwner || managerName || ''),
    enabledAt: String(value?.enabledAt || ''),
  }
}

function normalizePaymentStatus(value: unknown): RestaurantPaymentStatus {
  if (value === 'qr-issued') {
    return 'link-issued'
  }
  return value === 'link-issued' || value === 'partial' || value === 'paid' || value === 'refunded' || value === 'reconcile'
    ? value
    : 'draft'
}

function normalizePaymentTender(value: unknown): RestaurantPaymentTender {
  if (value === 'card' || value === 'qr' || value === 'bank-transfer' || value === 'voucher' || value === 'house') {
    return value
  }
  return 'cash'
}

function normalizeCashMovementType(value: unknown): RestaurantCashMovementType {
  if (value === 'remove' || value === 'payout' || value === 'safe-drop' || value === 'tip-out') {
    return value
  }
  return 'add'
}

function normalizeTableStatus(value: unknown): RestaurantTableStatus {
  if (value === 'seated' || value === 'ordered' || value === 'served' || value === 'bill-requested' || value === 'paid' || value === 'reset') {
    return value
  }
  return 'open'
}

function normalizeKitchenTicketStatus(value: unknown): RestaurantKitchenTicketStatus {
  if (value === 'firing' || value === 'ready' || value === 'served' || value === 'delayed') {
    return value
  }
  return 'queued'
}

function normalizeKitchenTicketPriority(value: unknown): RestaurantKitchenTicketPriority {
  return value === 'rush' ? 'rush' : 'normal'
}

function normalizeApprovalActionType(value: unknown): RestaurantApprovalActionType {
  if (value === 'discount' || value === 'service-charge' || value === 'refund' || value === 'closeout') {
    return value
  }
  return 'void'
}

function normalizeApprovalStatus(value: unknown): RestaurantApprovalStatus {
  if (value === 'approved' || value === 'rejected') {
    return value
  }
  return 'pending'
}

function normalizeShiftReviewStatus(value: unknown): RestaurantShiftReviewStatus {
  if (value === 'locked' || value === 'released') {
    return value
  }
  return 'open'
}

function normalizeOfflineQueueLock(value: unknown): RestaurantOfflineQueueLock {
  if (value === 'payments-only' || value === 'strict') {
    return value
  }
  return 'none'
}

function normalizeTipRecoveryStatus(value: unknown): RestaurantTipRecoveryStatus {
  if (value === 'recovered' || value === 'waived') {
    return value
  }
  return 'pending'
}

function normalizeTransferStatus(value: unknown): RestaurantTransferStatus {
  if (value === 'dispatched' || value === 'received' || value === 'variance') {
    return value
  }
  return 'requested'
}

function normalizeServiceLaneType(value: unknown): RestaurantServiceLaneType {
  return value === 'kitchen' ? 'kitchen' : 'table'
}

function normalizeServiceDeviceType(value: unknown): RestaurantServiceDeviceType {
  if (value === 'tablet' || value === 'phone' || value === 'kds') {
    return value
  }
  return 'terminal'
}

function resolvePaymentStatus(
  status: RestaurantPaymentStatus,
  collectedMmk: number,
  amountMmk: number,
  refundedMmk: number,
): RestaurantPaymentStatus {
  if (status === 'draft' || status === 'link-issued' || status === 'reconcile') {
    return status
  }
  if (refundedMmk > 0) {
    return 'refunded'
  }
  if (amountMmk <= 0) {
    return status === 'partial' ? 'paid' : status
  }
  if (collectedMmk > 0 && collectedMmk < amountMmk) {
    return 'partial'
  }
  return status === 'partial' ? 'paid' : status
}

function isPaymentUrl(value: string) {
  return /^https?:\/\//i.test(value.trim())
}

function isProviderSettlementPayload(value: string) {
  const normalized = value.trim()
  return Boolean(normalized && !/^supermega:payment-draft\?/i.test(normalized))
}

function normalizePayments(value: unknown): RestaurantPaymentRecord[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantPaymentRecord> & { mmqrPayload?: unknown }) : null
      if (!record) {
        return null
      }
      const amountMmk = normalizeNumber(record.amountMmk)
      const collectedMmk = normalizeNumber(record.collectedMmk ?? record.amountMmk)
      const refundedMmk = normalizeNumber(record.refundedMmk)
      const nextStatus = resolvePaymentStatus(normalizePaymentStatus(record.status), collectedMmk, amountMmk, refundedMmk)
      return {
        id: String(record.id || createId('pay')),
        orderRef: String(record.orderRef || 'walk-in-order'),
        tableName: String(record.tableName || ''),
        amountMmk,
        provider: String(record.provider || 'Payment provider'),
        tenderType: normalizePaymentTender(record.tenderType ?? (record as { tender?: unknown }).tender),
        paymentPayload: String(record.paymentPayload || record.mmqrPayload || ''),
        customerName: String(record.customerName || ''),
        customerPhone: String(record.customerPhone || ''),
        itemSummary: String(record.itemSummary || ''),
        splitGroup: String(record.splitGroup || ''),
        seatLabel: String(record.seatLabel || ''),
        collectedMmk,
        refundedMmk,
        tipMmk: normalizeNumber(record.tipMmk),
        changeGivenMmk: normalizeNumber(record.changeGivenMmk),
        settlementRef: String(record.settlementRef || ''),
        proofNote: String(record.proofNote || ''),
        status: nextStatus,
        note: String(record.note || ''),
        paidAt: String(record.paidAt || ''),
        verifiedBy: String(record.verifiedBy || ''),
        createdAt: String(record.createdAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantPaymentRecord => Boolean(item))
}

function normalizeCashMovements(value: unknown, managerName: string): RestaurantCashMovementRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantCashMovementRecord>) : null
      if (!record) {
        return null
      }
      return {
        id: String(record.id || createId('cash')),
        registerId: String(record.registerId || 'front-register'),
        type: normalizeCashMovementType(record.type),
        amountMmk: normalizeNumber(record.amountMmk),
        reasonCode: String(record.reasonCode || ''),
        note: String(record.note || ''),
        owner: String(record.owner || managerName || ''),
        createdAt: String(record.createdAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantCashMovementRecord => Boolean(item))
}

function normalizeRegisterSessions(value: unknown, managerName: string): RestaurantRegisterSession[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantRegisterSession>) : null
      if (!record) {
        return null
      }
      const openingFloatMmk = normalizeNumber(record.openingFloatMmk)
      const expectedCashMmk = normalizeNumber(record.expectedCashMmk || record.openingFloatMmk)
      const countedCashMmk = normalizeNumber(record.countedCashMmk)
      const status: RestaurantRegisterSessionStatus = record.status === 'closed' ? 'closed' : 'open'
      return {
        id: String(record.id || createId('register')),
        registerId: String(record.registerId || 'front-register'),
        owner: String(record.owner || managerName || ''),
        openingFloatMmk,
        expectedCashMmk: expectedCashMmk || openingFloatMmk,
        countedCashMmk,
        varianceMmk: status === 'closed'
          ? normalizeNumber(record.varianceMmk || countedCashMmk - (expectedCashMmk || openingFloatMmk))
          : normalizeNumber(record.varianceMmk),
        closeNote: String(record.closeNote || ''),
        status,
        openedAt: String(record.openedAt || nowIso()),
        closedAt: status === 'closed' ? String(record.closedAt || nowIso()) : '',
      }
    })
    .filter((item): item is RestaurantRegisterSession => Boolean(item))
}

function normalizeTables(value: unknown): RestaurantTableRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantTableRecord>) : null
      if (!record) {
        return null
      }
      return {
        id: String(record.id || createId('table')),
        tableName: String(record.tableName || '').trim() || 'Table',
        floorZone: String(record.floorZone || '').trim() || 'Main floor',
        seats: Math.max(1, normalizeNumber(record.seats || 1)),
        guestCount: Math.max(0, normalizeNumber(record.guestCount)),
        status: normalizeTableStatus(record.status),
        orderRef: String(record.orderRef || '').trim(),
        assignedServer: String(record.assignedServer || '').trim(),
        note: String(record.note || '').trim(),
        createdAt: String(record.createdAt || nowIso()),
        updatedAt: String(record.updatedAt || record.createdAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantTableRecord => Boolean(item))
}

function normalizeKitchenTickets(value: unknown, managerName: string): RestaurantKitchenTicketRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantKitchenTicketRecord>) : null
      if (!record) {
        return null
      }
      return {
        id: String(record.id || createId('kitchen')),
        orderRef: String(record.orderRef || '').trim() || 'order',
        tableName: String(record.tableName || '').trim(),
        station: String(record.station || '').trim() || 'Hot line',
        itemSummary: String(record.itemSummary || '').trim(),
        targetReadyAt: String(record.targetReadyAt || '').trim(),
        status: normalizeKitchenTicketStatus(record.status),
        priority: normalizeKitchenTicketPriority(record.priority),
        owner: String(record.owner || '').trim() || managerName || 'kitchen lead',
        note: String(record.note || '').trim(),
        createdAt: String(record.createdAt || nowIso()),
        updatedAt: String(record.updatedAt || record.createdAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantKitchenTicketRecord => Boolean(item))
}

function normalizeApprovals(value: unknown, managerName: string): RestaurantApprovalRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantApprovalRecord>) : null
      if (!record) {
        return null
      }
      return {
        id: String(record.id || createId('approval')),
        orderRef: String(record.orderRef || '').trim(),
        tableName: String(record.tableName || '').trim(),
        actionType: normalizeApprovalActionType(record.actionType),
        reason: String(record.reason || '').trim(),
        amountMmk: Math.max(0, normalizeNumber(record.amountMmk)),
        requestedBy: String(record.requestedBy || '').trim() || managerName || 'operator',
        approvedBy: String(record.approvedBy || '').trim(),
        status: normalizeApprovalStatus(record.status),
        note: String(record.note || '').trim(),
        createdAt: String(record.createdAt || nowIso()),
        updatedAt: String(record.updatedAt || record.createdAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantApprovalRecord => Boolean(item))
}

function normalizeAuditSeverity(value: unknown): RestaurantAuditSeverity {
  if (value === 'review' || value === 'critical') {
    return value
  }
  return 'info'
}

function normalizeAuditTrail(value: unknown, managerName: string): RestaurantAuditRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantAuditRecord>) : null
      if (!record) {
        return null
      }
      return {
        id: String(record.id || createId('audit')),
        event: String(record.event || '').trim(),
        detail: String(record.detail || '').trim(),
        actor: String(record.actor || '').trim() || managerName || 'system',
        actorRole: String(record.actorRole || '').trim() || 'system',
        severity: normalizeAuditSeverity(record.severity),
        createdAt: String(record.createdAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantAuditRecord => Boolean(item))
}

function normalizeShiftReviewLock(value: unknown, managerName: string): RestaurantShiftReviewLock {
  const record = value && typeof value === 'object' ? (value as Partial<RestaurantShiftReviewLock>) : null
  return {
    status: normalizeShiftReviewStatus(record?.status),
    owner: String(record?.owner || managerName || '').trim(),
    note: String(record?.note || '').trim(),
    lockedAt: String(record?.lockedAt || ''),
    releasedAt: String(record?.releasedAt || ''),
    updatedAt: String(record?.updatedAt || nowIso()),
  }
}

function normalizeOfflineGuardrail(value: unknown, managerName: string): RestaurantOfflineGuardrail {
  const record = value && typeof value === 'object' ? (value as Partial<RestaurantOfflineGuardrail>) : null
  const queueLockLevel = normalizeOfflineQueueLock(record?.queueLockLevel)
  const pendingUploads = Math.max(0, normalizeNumber(record?.pendingUploads))
  const pendingCriticalActions = Math.max(0, normalizeNumber(record?.pendingCriticalActions))
  const dangerousActionsLocked = queueLockLevel === 'strict'
    || (queueLockLevel === 'payments-only' && pendingCriticalActions > 0)
    || Boolean(record?.dangerousActionsLocked)
  return {
    isOfflineCaptureActive: Boolean(record?.isOfflineCaptureActive),
    reconnectDeadlineAt: String(record?.reconnectDeadlineAt || ''),
    reconnectOwner: String(record?.reconnectOwner || managerName || '').trim(),
    queueLockLevel,
    pendingUploads,
    pendingCriticalActions,
    dangerousActionsLocked,
    lastOnlineAt: String(record?.lastOnlineAt || ''),
    updatedAt: String(record?.updatedAt || nowIso()),
  }
}

function normalizeTipRecoveries(value: unknown): RestaurantTipRecoveryRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantTipRecoveryRecord>) : null
      if (!record) {
        return null
      }
      const status = normalizeTipRecoveryStatus(record.status)
      return {
        id: String(record.id || createId('tip')),
        orderRef: String(record.orderRef || '').trim(),
        staffName: String(record.staffName || '').trim(),
        expectedTipMmk: Math.max(0, normalizeNumber(record.expectedTipMmk)),
        recoveredTipMmk: Math.max(0, normalizeNumber(record.recoveredTipMmk)),
        status,
        note: String(record.note || '').trim(),
        createdAt: String(record.createdAt || nowIso()),
        resolvedAt: status === 'pending' ? '' : String(record.resolvedAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantTipRecoveryRecord => Boolean(item))
}

function normalizeInventoryTransfers(value: unknown, branchName: string, managerName: string): RestaurantInventoryTransferRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantInventoryTransferRecord>) : null
      if (!record) {
        return null
      }
      const status = normalizeTransferStatus(record.status)
      return {
        id: String(record.id || createId('transfer')),
        itemName: String(record.itemName || '').trim() || 'Item',
        fromLocation: String(record.fromLocation || branchName).trim() || branchName,
        toLocation: String(record.toLocation || branchName).trim() || branchName,
        requestedQty: Math.max(0, normalizeNumber(record.requestedQty)),
        dispatchedQty: Math.max(0, normalizeNumber(record.dispatchedQty)),
        receivedQty: Math.max(0, normalizeNumber(record.receivedQty)),
        status,
        requestedBy: String(record.requestedBy || managerName || 'operator').trim(),
        dispatchedBy: String(record.dispatchedBy || '').trim(),
        receivedBy: String(record.receivedBy || '').trim(),
        varianceNote: String(record.varianceNote || '').trim(),
        createdAt: String(record.createdAt || nowIso()),
        updatedAt: String(record.updatedAt || record.createdAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantInventoryTransferRecord => Boolean(item))
}

function normalizeServiceDevices(value: unknown, managerName: string): RestaurantServiceDeviceAssignment[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantServiceDeviceAssignment>) : null
      if (!record) {
        return null
      }
      return {
        id: String(record.id || createId('device')),
        laneType: normalizeServiceLaneType(record.laneType),
        laneRef: String(record.laneRef || '').trim() || 'lane',
        station: String(record.station || '').trim() || 'station',
        deviceLabel: String(record.deviceLabel || '').trim() || 'device',
        deviceType: normalizeServiceDeviceType(record.deviceType),
        owner: String(record.owner || managerName || '').trim(),
        status: record.status === 'inactive' ? 'inactive' : 'active',
        note: String(record.note || '').trim(),
        updatedAt: String(record.updatedAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantServiceDeviceAssignment => Boolean(item))
}

function normalizeMenuDaypartSchedules(value: unknown, managerName: string): RestaurantMenuDaypartSchedule[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Partial<RestaurantMenuDaypartSchedule>) : null
      if (!record) {
        return null
      }
      return {
        id: String(record.id || createId('schedule')),
        daypart: record.daypart === 'opening' || record.daypart === 'lunch' || record.daypart === 'dinner' || record.daypart === 'close'
          ? record.daypart
          : 'opening',
        startTime: normalizeMinuteTime(record.startTime, '08:00'),
        endTime: normalizeMinuteTime(record.endTime, '22:00'),
        menuLabel: String(record.menuLabel || '').trim() || 'Default menu',
        active: record.active === undefined ? true : Boolean(record.active),
        updatedBy: String(record.updatedBy || managerName || '').trim(),
        updatedAt: String(record.updatedAt || nowIso()),
      }
    })
    .filter((item): item is RestaurantMenuDaypartSchedule => Boolean(item))
}

function normalizeWorkspace(value: Partial<RestaurantOperatingWorkspace> | null | undefined): RestaurantOperatingWorkspace {
  const branchName = String(value?.branchName ?? 'Main branch')
  const managerName = String(value?.managerName ?? '')
  return {
    branchName,
    managerName,
    businessDate: String(value?.businessDate ?? todayInputValue()),
    updatedAt: String(value?.updatedAt ?? nowIso()),
    shifts: Array.isArray(value?.shifts) ? value.shifts : [],
    stock: Array.isArray(value?.stock) ? value.stock : [],
    guests: Array.isArray(value?.guests) ? value.guests : [],
    promos: Array.isArray(value?.promos) ? value.promos : [],
    payments: normalizePayments(value?.payments),
    tables: normalizeTables(value?.tables),
    kitchenTickets: normalizeKitchenTickets(value?.kitchenTickets, managerName),
    approvals: normalizeApprovals(value?.approvals, managerName),
    registerSessions: normalizeRegisterSessions(value?.registerSessions, managerName),
    cashMovements: normalizeCashMovements(value?.cashMovements, managerName),
    auditTrail: normalizeAuditTrail(value?.auditTrail, managerName),
    paymentSetup: normalizePaymentSetup(value?.paymentSetup, managerName),
    menu: normalizeMenu(value?.menu, branchName),
    shiftReviewLock: normalizeShiftReviewLock(value?.shiftReviewLock, managerName),
    offlineGuardrail: normalizeOfflineGuardrail(value?.offlineGuardrail, managerName),
    tipRecoveries: normalizeTipRecoveries(value?.tipRecoveries),
    inventoryTransfers: normalizeInventoryTransfers(value?.inventoryTransfers, branchName, managerName),
    serviceDevices: normalizeServiceDevices(value?.serviceDevices, managerName),
    menuDaypartSchedules: normalizeMenuDaypartSchedules(value?.menuDaypartSchedules, managerName),
  }
}

function migrateLegacyDemoWorkspace(workspace: RestaurantOperatingWorkspace): RestaurantOperatingWorkspace {
  if (workspace.branchName.trim() !== LEGACY_DEMO_BRANCH_NAME) {
    return workspace
  }

  const replaceLegacyLabels = (value: string) =>
    String(value || '')
      .replaceAll(LEGACY_DEMO_BRANCH_NAME, MODERN_DEMO_BRANCH_NAME)
      .replaceAll(LEGACY_DEMO_SLUG, MODERN_DEMO_SLUG)
      .replaceAll('/merchant/golden-plate', `/merchant/${MODERN_DEMO_SLUG}`)

  return {
    ...workspace,
    branchName: MODERN_DEMO_BRANCH_NAME,
    shifts: workspace.shifts.map((shift) => ({ ...shift, branchName: replaceLegacyLabels(shift.branchName) })),
    guests: workspace.guests.map((guest) => ({ ...guest, branchName: replaceLegacyLabels(guest.branchName) })),
    promos: workspace.promos.map((promo) => ({ ...promo, branchName: replaceLegacyLabels(promo.branchName) })),
    paymentSetup: {
      ...workspace.paymentSetup,
      merchantName: replaceLegacyLabels(workspace.paymentSetup.merchantName),
      mmqrTemplate: replaceLegacyLabels(workspace.paymentSetup.mmqrTemplate),
    },
    menu: {
      ...workspace.menu,
      sourceFiles: workspace.menu.sourceFiles.map((file) => ({
        ...file,
        name: file.name === LEGACY_DEMO_MENU_FILE ? MODERN_DEMO_MENU_FILE : replaceLegacyLabels(file.name),
      })),
      publicSlug:
        workspace.menu.publicSlug.trim() === LEGACY_DEMO_SLUG
          ? MODERN_DEMO_SLUG
          : replaceLegacyLabels(workspace.menu.publicSlug),
    },
    updatedAt: nowIso(),
  }
}

export function createDefaultRestaurantWorkspace(): RestaurantOperatingWorkspace {
  const now = nowIso()
  return normalizeWorkspace({
    branchName: MODERN_DEMO_BRANCH_NAME,
    managerName: 'May Thet',
    businessDate: todayInputValue(),
    updatedAt: now,
    shifts: [
      {
        id: 'demo-shift-dinner',
        daypart: 'dinner',
        branchName: MODERN_DEMO_BRANCH_NAME,
        managerName: 'May Thet',
        status: 'handover',
        blocker: 'Table QR at counter 3 is damaged; cashier is using printed backup.',
        handover: 'Cash-up due at 21:30. Confirm three digital payments before close.',
        createdAt: now,
      },
      {
        id: 'demo-shift-lunch',
        daypart: 'lunch',
        branchName: MODERN_DEMO_BRANCH_NAME,
        managerName: 'May Thet',
        status: 'ready',
        blocker: '',
        handover: 'Lunch rush finished cleanly; keep tea-leaf salad prep above par.',
        createdAt: now,
      },
    ],
    stock: [
      {
        id: 'demo-stock-chicken',
        itemName: 'Chicken curry portion',
        par: 36,
        current: 11,
        waste: 2,
        supplierIssue: 'Late delivery reduced dinner buffer.',
        action: 'Prepare 20 extra portions before 18:30 or mark dish limited.',
        createdAt: now,
      },
      {
        id: 'demo-stock-tea',
        itemName: 'Tea leaf salad pack',
        par: 20,
        current: 15,
        waste: 1,
        supplierIssue: '',
        action: 'Ready for dinner.',
        createdAt: now,
      },
    ],
    guests: [
      {
        id: 'demo-guest-delivery',
        channel: 'delivery app',
        branchName: MODERN_DEMO_BRANCH_NAME,
        issue: 'Customer reported missing extra soup on order GP-1048.',
        recovery: 'Offer replacement soup and note pack checklist.',
        owner: 'May Thet',
        status: 'recovering',
        createdAt: now,
      },
    ],
    promos: [
      {
        id: 'demo-promo-lunch',
        branchName: MODERN_DEMO_BRANCH_NAME,
        promoName: 'Lunch combo',
        salesLift: 12,
        foodCostPressure: 4,
        laborPressure: 1,
        decision: 'extend',
        owner: 'Owner',
        createdAt: now,
      },
    ],
    payments: [
      {
        id: 'demo-pay-1042',
        orderRef: 'GP-1042',
        tableName: 'Table 5',
        amountMmk: 42500,
        provider: 'KBZPay',
        tenderType: 'qr',
        paymentPayload: `https://pay.example/merchant/${MODERN_DEMO_SLUG}?ref=GP-1042&amount=42500`,
        customerName: 'Walk-in',
        customerPhone: '',
        itemSummary: '2x chicken curry set, 1x lime juice',
        splitGroup: '',
        seatLabel: 'Seat 2',
        collectedMmk: 42500,
        refundedMmk: 0,
        tipMmk: 1500,
        changeGivenMmk: 0,
        settlementRef: 'KBZ-7721',
        proofNote: 'Provider confirmation visible in merchant app.',
        status: 'paid',
        note: '',
        paidAt: now,
        verifiedBy: 'May Thet',
        createdAt: now,
      },
      {
        id: 'demo-pay-1047',
        orderRef: 'GP-1047',
        tableName: 'Counter 2',
        amountMmk: 18500,
        provider: 'WavePay',
        tenderType: 'qr',
        paymentPayload: `https://pay.example/merchant/${MODERN_DEMO_SLUG}?ref=GP-1047&amount=18500`,
        customerName: 'Takeaway',
        customerPhone: '',
        itemSummary: '1x mohinga, 2x tea',
        splitGroup: '',
        seatLabel: 'Counter',
        collectedMmk: 18500,
        refundedMmk: 0,
        tipMmk: 0,
        changeGivenMmk: 0,
        settlementRef: '',
        proofNote: 'Customer showed screenshot; settlement export not matched yet.',
        status: 'reconcile',
        note: 'Need cashier check before close.',
        paidAt: '',
        verifiedBy: 'May Thet',
        createdAt: now,
      },
      {
        id: 'demo-pay-1049',
        orderRef: 'GP-1049',
        tableName: 'Table 1',
        amountMmk: 31000,
        provider: 'AYA Pay',
        tenderType: 'cash',
        paymentPayload: `https://pay.example/merchant/${MODERN_DEMO_SLUG}?ref=GP-1049&amount=31000`,
        customerName: 'Walk-in',
        customerPhone: '',
        itemSummary: 'Family noodle set',
        splitGroup: 'GP-1049',
        seatLabel: 'Seat 1',
        collectedMmk: 12000,
        refundedMmk: 0,
        tipMmk: 0,
        changeGivenMmk: 0,
        settlementRef: '',
        proofNote: '',
        status: 'partial',
        note: 'Split tender in progress: cash plus provider link.',
        paidAt: '',
        verifiedBy: 'May Thet',
        createdAt: now,
      },
      {
        id: 'demo-pay-1049-b',
        orderRef: 'GP-1049',
        tableName: 'Table 1',
        amountMmk: 19000,
        provider: 'AYA Pay',
        tenderType: 'qr',
        paymentPayload: '',
        customerName: 'Walk-in',
        customerPhone: '',
        itemSummary: 'Remaining split tender amount',
        splitGroup: 'GP-1049',
        seatLabel: 'Seat 3',
        collectedMmk: 0,
        refundedMmk: 0,
        tipMmk: 0,
        changeGivenMmk: 0,
        settlementRef: '',
        proofNote: '',
        status: 'link-issued',
        note: 'Waiting for provider confirmation.',
        paidAt: '',
        verifiedBy: 'May Thet',
        createdAt: now,
      },
    ],
    tables: [
      {
        id: 'demo-table-1',
        tableName: 'Table 1',
        floorZone: 'Main floor',
        seats: 4,
        guestCount: 4,
        status: 'ordered',
        orderRef: 'GP-1049',
        assignedServer: 'Aye Aye',
        note: 'Split tender order in progress.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-table-5',
        tableName: 'Table 5',
        floorZone: 'Main floor',
        seats: 4,
        guestCount: 2,
        status: 'served',
        orderRef: 'GP-1042',
        assignedServer: 'Kyaw Zin',
        note: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-counter-2',
        tableName: 'Counter 2',
        floorZone: 'Counter',
        seats: 2,
        guestCount: 1,
        status: 'bill-requested',
        orderRef: 'GP-1047',
        assignedServer: 'Nilar',
        note: 'Needs digital payment confirmation before close.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    kitchenTickets: [
      {
        id: 'demo-kitchen-1049',
        orderRef: 'GP-1049',
        tableName: 'Table 1',
        station: 'Hot line',
        itemSummary: 'Family noodle set',
        targetReadyAt: '18:40',
        status: 'firing',
        priority: 'normal',
        owner: 'Kitchen lead',
        note: 'Queue split for first partial tender.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-kitchen-1042',
        orderRef: 'GP-1042',
        tableName: 'Table 5',
        station: 'Pass',
        itemSummary: '2x chicken curry set',
        targetReadyAt: '18:22',
        status: 'ready',
        priority: 'rush',
        owner: 'Kitchen lead',
        note: 'Awaiting server handoff.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-kitchen-1047',
        orderRef: 'GP-1047',
        tableName: 'Counter 2',
        station: 'Salad',
        itemSummary: '1x mohinga, 2x tea',
        targetReadyAt: '18:18',
        status: 'delayed',
        priority: 'normal',
        owner: 'Kitchen lead',
        note: 'Tea prep running late.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    approvals: [
      {
        id: 'demo-approval-void',
        orderRef: 'GP-1047',
        tableName: 'Counter 2',
        actionType: 'void',
        reason: 'Customer changed takeaway item after prep started.',
        amountMmk: 3500,
        requestedBy: 'Cashier Team',
        approvedBy: '',
        status: 'pending',
        note: 'Needs manager approval before closeout.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-approval-discount',
        orderRef: 'GP-1042',
        tableName: 'Table 5',
        actionType: 'discount',
        reason: 'Service recovery adjustment.',
        amountMmk: 2000,
        requestedBy: 'May Thet',
        approvedBy: 'Owner',
        status: 'approved',
        note: 'Approved with guest feedback note.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    registerSessions: [
      {
        id: 'demo-register-session',
        registerId: 'front-register',
        owner: 'May Thet',
        openingFloatMmk: 50000,
        expectedCashMmk: 65500,
        countedCashMmk: 0,
        varianceMmk: 0,
        closeNote: '',
        status: 'open',
        openedAt: now,
        closedAt: '',
      },
    ],
    cashMovements: [
      {
        id: 'demo-cash-add',
        registerId: 'front-register',
        type: 'add',
        amountMmk: 15000,
        reasonCode: 'cash-sale',
        note: 'Lunch rush cash sales.',
        owner: 'May Thet',
        createdAt: now,
      },
      {
        id: 'demo-cash-drop',
        registerId: 'front-register',
        type: 'safe-drop',
        amountMmk: 5000,
        reasonCode: 'safe-drop',
        note: 'Safe drop before dinner rush.',
        owner: 'May Thet',
        createdAt: now,
      },
    ],
    auditTrail: [
      {
        id: 'demo-audit-bootstrap',
        event: 'workspace seeded',
        detail: 'Demo POS workspace initialized with starter records for queue, payment, and closeout drills.',
        actor: 'system',
        actorRole: 'system',
        severity: 'info',
        createdAt: now,
      },
    ],
    paymentSetup: {
      providerName: 'KBZPay / WavePay / AYA Pay',
      merchantName: MODERN_DEMO_BRANCH_NAME,
      merchantId: 'GP-DOWNTOWN-01',
      branchCode: 'YGN-DT',
      settlementAccountMasked: '**** 2841',
      mmqrTemplate: `https://pay.example/merchant/${MODERN_DEMO_SLUG}?ref={orderRef}&amount={amount}`,
      settlementExportFormat: 'Provider dashboard CSV plus cashier screenshots',
      cashupOwner: 'May Thet',
      enabledAt: now,
    },
    menu: {
      sourceText: 'Mohinga | Breakfast | 4500 | Fish broth rice noodle\nChicken curry set | Main | 12000 | Curry, rice, soup, salad\nTea leaf salad | Side | 6500 | Laphet with nuts and cabbage\nLime juice | Drinks | 3000 | Fresh lime drink',
      sourceFiles: [
        {
          name: MODERN_DEMO_MENU_FILE,
          type: 'text/plain',
          size: 228,
          capturedAt: now,
        },
      ],
      items: [
        { id: 'demo-menu-mohinga', section: 'Breakfast', name: 'Mohinga', price: 4500, description: 'Fish broth rice noodle' },
        { id: 'demo-menu-curry', section: 'Main', name: 'Chicken curry set', price: 12000, description: 'Curry, rice, soup, salad' },
        { id: 'demo-menu-laphet', section: 'Side', name: 'Tea leaf salad', price: 6500, description: 'Laphet with nuts and cabbage' },
        { id: 'demo-menu-lime', section: 'Drinks', name: 'Lime juice', price: 3000, description: 'Fresh lime drink' },
      ],
      orderingMode: 'digital-menu',
      publicSlug: MODERN_DEMO_SLUG,
      updatedAt: now,
    },
    shiftReviewLock: {
      status: 'locked',
      owner: 'May Thet',
      note: 'Waiting for pending tip recovery confirmation before end-of-day release.',
      lockedAt: now,
      releasedAt: '',
      updatedAt: now,
    },
    offlineGuardrail: {
      isOfflineCaptureActive: false,
      reconnectDeadlineAt: '',
      reconnectOwner: 'May Thet',
      queueLockLevel: 'none',
      pendingUploads: 0,
      pendingCriticalActions: 0,
      dangerousActionsLocked: false,
      lastOnlineAt: now,
      updatedAt: now,
    },
    tipRecoveries: [
      {
        id: 'demo-tip-1049',
        orderRef: 'GP-1049',
        staffName: 'Aye Aye',
        expectedTipMmk: 2000,
        recoveredTipMmk: 0,
        status: 'pending',
        note: 'Recover digital tip after split tender settles.',
        createdAt: now,
        resolvedAt: '',
      },
    ],
    inventoryTransfers: [
      {
        id: 'demo-transfer-tea',
        itemName: 'Tea leaf salad pack',
        fromLocation: 'Central kitchen',
        toLocation: MODERN_DEMO_BRANCH_NAME,
        requestedQty: 10,
        dispatchedQty: 8,
        receivedQty: 0,
        status: 'dispatched',
        requestedBy: 'May Thet',
        dispatchedBy: 'Warehouse lead',
        receivedBy: '',
        varianceNote: 'Awaiting receiving count at branch.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    serviceDevices: [
      {
        id: 'demo-device-table-main',
        laneType: 'table',
        laneRef: 'Main floor',
        station: 'Server lane',
        deviceLabel: 'Tablet-Floor-01',
        deviceType: 'tablet',
        owner: 'Aye Aye',
        status: 'active',
        note: 'Primary floor tablet for table updates.',
        updatedAt: now,
      },
      {
        id: 'demo-device-kitchen-pass',
        laneType: 'kitchen',
        laneRef: 'Pass',
        station: 'Pass',
        deviceLabel: 'KDS-Pass-01',
        deviceType: 'kds',
        owner: 'Kitchen lead',
        status: 'active',
        note: 'Pass screen for handoff and delay visibility.',
        updatedAt: now,
      },
    ],
    menuDaypartSchedules: [
      {
        id: 'demo-daypart-opening',
        daypart: 'opening',
        startTime: '07:00',
        endTime: '10:30',
        menuLabel: 'Breakfast menu',
        active: true,
        updatedBy: 'May Thet',
        updatedAt: now,
      },
      {
        id: 'demo-daypart-lunch',
        daypart: 'lunch',
        startTime: '10:30',
        endTime: '15:00',
        menuLabel: 'Lunch menu',
        active: true,
        updatedBy: 'May Thet',
        updatedAt: now,
      },
      {
        id: 'demo-daypart-dinner',
        daypart: 'dinner',
        startTime: '15:00',
        endTime: '22:30',
        menuLabel: 'Dinner menu',
        active: true,
        updatedBy: 'May Thet',
        updatedAt: now,
      },
    ],
  })
}

export function loadRestaurantWorkspace(scopeKey?: string | null): RestaurantOperatingWorkspace {
  if (typeof window === 'undefined') {
    return migrateLegacyDemoWorkspace(createDefaultRestaurantWorkspace())
  }

  try {
    const raw = window.localStorage.getItem(resolveWorkspaceStorageKey(scopeKey))
    if (!raw) {
      return migrateLegacyDemoWorkspace(createDefaultRestaurantWorkspace())
    }
    return migrateLegacyDemoWorkspace(normalizeWorkspace(JSON.parse(raw) as Partial<RestaurantOperatingWorkspace>))
  } catch {
    return migrateLegacyDemoWorkspace(createDefaultRestaurantWorkspace())
  }
}

export function saveRestaurantWorkspace(workspace: RestaurantOperatingWorkspace, scopeKey?: string | null) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(
    resolveWorkspaceStorageKey(scopeKey),
    JSON.stringify({ ...workspace, updatedAt: nowIso() }, null, 2),
  )
}

export function clearRestaurantWorkspace(scopeKey?: string | null) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(resolveWorkspaceStorageKey(scopeKey))
}

export function serializeRestaurantWorkspace(workspace: RestaurantOperatingWorkspace) {
  return JSON.stringify(workspace, null, 2)
}

export function appendRestaurantAuditRecord(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantAuditRecord, 'id' | 'createdAt'>,
): RestaurantOperatingWorkspace {
  const actor = input.actor.trim() || workspace.managerName || workspace.paymentSetup.cashupOwner || 'system'
  const actorRole = input.actorRole.trim() || 'system'
  return {
    ...workspace,
    auditTrail: [
      {
        id: createId('audit'),
        event: input.event.trim(),
        detail: input.detail.trim(),
        actor,
        actorRole,
        severity: normalizeAuditSeverity(input.severity),
        createdAt: nowIso(),
      },
      ...workspace.auditTrail,
    ].slice(0, 250),
    updatedAt: nowIso(),
  }
}

export function updateRestaurantProfile(
  workspace: RestaurantOperatingWorkspace,
  patch: Pick<RestaurantOperatingWorkspace, 'branchName' | 'managerName' | 'businessDate'>,
): RestaurantOperatingWorkspace {
  return {
    ...workspace,
    ...patch,
    menu: {
      ...workspace.menu,
      publicSlug: workspace.menu.publicSlug || slugify(patch.branchName),
    },
    updatedAt: nowIso(),
  }
}

export function appendRestaurantShift(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantShiftRecord, 'id' | 'createdAt' | 'branchName' | 'managerName'>,
): RestaurantOperatingWorkspace {
  return {
    ...workspace,
    shifts: [
      {
        ...input,
        id: createId('shift'),
        branchName: workspace.branchName,
        managerName: workspace.managerName,
        createdAt: nowIso(),
      },
      ...workspace.shifts,
    ],
    updatedAt: nowIso(),
  }
}

export function appendRestaurantStock(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantStockRecord, 'id' | 'createdAt'>,
): RestaurantOperatingWorkspace {
  return {
    ...workspace,
    stock: [
      {
        ...input,
        par: normalizeNumber(input.par),
        current: normalizeNumber(input.current),
        waste: normalizeNumber(input.waste),
        id: createId('stock'),
        createdAt: nowIso(),
      },
      ...workspace.stock,
    ],
    updatedAt: nowIso(),
  }
}

export function appendRestaurantGuest(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantGuestRecord, 'id' | 'createdAt'>,
): RestaurantOperatingWorkspace {
  return {
    ...workspace,
    guests: [
      {
        ...input,
        id: createId('guest'),
        createdAt: nowIso(),
      },
      ...workspace.guests,
    ],
    updatedAt: nowIso(),
  }
}

export function appendRestaurantPromo(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantPromoRecord, 'id' | 'createdAt'>,
): RestaurantOperatingWorkspace {
  return {
    ...workspace,
    promos: [
      {
        ...input,
        salesLift: normalizeNumber(input.salesLift),
        foodCostPressure: normalizeNumber(input.foodCostPressure),
        laborPressure: normalizeNumber(input.laborPressure),
        id: createId('promo'),
        createdAt: nowIso(),
      },
      ...workspace.promos,
    ],
    updatedAt: nowIso(),
  }
}

function getPaymentCashDelta(payment: Pick<RestaurantPaymentRecord, 'tenderType' | 'status' | 'collectedMmk' | 'changeGivenMmk' | 'refundedMmk'>) {
  if (payment.tenderType !== 'cash') {
    return 0
  }
  if (payment.status === 'draft' || payment.status === 'link-issued') {
    return 0
  }
  return Math.max(0, payment.collectedMmk) - Math.max(0, payment.changeGivenMmk) - Math.max(0, payment.refundedMmk)
}

function applyPaymentCashDeltaToSessions(
  sessions: RestaurantRegisterSession[],
  deltaMmk: number,
  registerId: string,
) {
  if (!deltaMmk) {
    return sessions
  }
  return sessions.map((session) => {
    if (session.status !== 'open' || session.registerId !== registerId) {
      return session
    }
    return {
      ...session,
      expectedCashMmk: Math.max(0, session.expectedCashMmk + deltaMmk),
    }
  })
}

export function appendRestaurantPayment(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantPaymentRecord, 'id' | 'createdAt'>,
): RestaurantOperatingWorkspace {
  const amountMmk = normalizeNumber(input.amountMmk)
  const collectedMmk = normalizeNumber(input.collectedMmk || input.amountMmk)
  const refundedMmk = normalizeNumber(input.refundedMmk)
  const nextStatus = resolvePaymentStatus(normalizePaymentStatus(input.status), collectedMmk, amountMmk, refundedMmk)
  const nextPayment: RestaurantPaymentRecord = {
    ...input,
    orderRef: input.orderRef.trim() || `order-${workspace.payments.length + 1}`,
    amountMmk,
    provider: input.provider.trim() || 'Payment provider',
    tenderType: normalizePaymentTender(input.tenderType),
    paymentPayload: input.paymentPayload.trim(),
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    itemSummary: input.itemSummary.trim(),
    splitGroup: input.splitGroup.trim(),
    seatLabel: input.seatLabel.trim(),
    collectedMmk,
    refundedMmk,
    tipMmk: normalizeNumber(input.tipMmk),
    changeGivenMmk: normalizeNumber(input.changeGivenMmk),
    settlementRef: input.settlementRef.trim(),
    proofNote: input.proofNote.trim(),
    status: nextStatus,
    note: input.note.trim(),
    paidAt: nextStatus === 'paid' || nextStatus === 'refunded' ? input.paidAt || nowIso() : '',
    verifiedBy: input.verifiedBy.trim(),
    id: createId('pay'),
    createdAt: nowIso(),
  }
  const registerId = workspace.registerSessions.find((session) => session.status === 'open')?.registerId || 'front-register'
  const nextSessions = applyPaymentCashDeltaToSessions(workspace.registerSessions, getPaymentCashDelta(nextPayment), registerId)
  return {
    ...workspace,
    registerSessions: nextSessions,
    payments: [nextPayment, ...workspace.payments],
    updatedAt: nowIso(),
  }
}

function getOpenRegisterSessionIndex(workspace: RestaurantOperatingWorkspace, registerId: string) {
  return workspace.registerSessions.findIndex((session) => session.registerId === registerId && session.status === 'open')
}

function applyCashMovementDelta(type: RestaurantCashMovementType, amountMmk: number) {
  const normalizedAmount = Math.max(0, normalizeNumber(amountMmk))
  if (type === 'add') {
    return normalizedAmount
  }
  return -normalizedAmount
}

export function appendRestaurantCashMovement(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantCashMovementRecord, 'id' | 'createdAt'>,
): RestaurantOperatingWorkspace {
  const registerId = input.registerId.trim() || 'front-register'
  const amountMmk = Math.max(0, normalizeNumber(input.amountMmk))
  const type = normalizeCashMovementType(input.type)
  const nextSessions = workspace.registerSessions.map((session) => {
    if (session.status !== 'open' || session.registerId !== registerId) {
      return session
    }
    return {
      ...session,
      expectedCashMmk: Math.max(0, session.expectedCashMmk + applyCashMovementDelta(type, amountMmk)),
    }
  })
  return {
    ...workspace,
    registerSessions: nextSessions,
    cashMovements: [
      {
        ...input,
        registerId,
        type,
        amountMmk,
        reasonCode: input.reasonCode.trim(),
        note: input.note.trim(),
        owner: input.owner.trim() || workspace.managerName || workspace.paymentSetup.cashupOwner || 'owner',
        id: createId('cash'),
        createdAt: nowIso(),
      },
      ...workspace.cashMovements,
    ],
    updatedAt: nowIso(),
  }
}

export function openRestaurantRegisterSession(
  workspace: RestaurantOperatingWorkspace,
  input: {
    registerId: string
    owner: string
    openingFloatMmk: number
    note?: string
  },
): RestaurantOperatingWorkspace {
  const registerId = input.registerId.trim() || 'front-register'
  const existingOpenIndex = getOpenRegisterSessionIndex(workspace, registerId)
  if (existingOpenIndex >= 0) {
    return workspace
  }
  const openingFloatMmk = Math.max(0, normalizeNumber(input.openingFloatMmk))
  const nextSession: RestaurantRegisterSession = {
    id: createId('register'),
    registerId,
    owner: input.owner.trim() || workspace.managerName || workspace.paymentSetup.cashupOwner || 'owner',
    openingFloatMmk,
    expectedCashMmk: openingFloatMmk,
    countedCashMmk: 0,
    varianceMmk: 0,
    closeNote: String(input.note || '').trim(),
    status: 'open',
    openedAt: nowIso(),
    closedAt: '',
  }
  return {
    ...workspace,
    registerSessions: [nextSession, ...workspace.registerSessions],
    updatedAt: nowIso(),
  }
}

export function closeRestaurantRegisterSession(
  workspace: RestaurantOperatingWorkspace,
  input: {
    registerId: string
    countedCashMmk: number
    closeNote?: string
  },
): RestaurantOperatingWorkspace {
  const registerId = input.registerId.trim() || 'front-register'
  const countedCashMmk = Math.max(0, normalizeNumber(input.countedCashMmk))
  return {
    ...workspace,
    registerSessions: workspace.registerSessions.map((session) => {
      if (session.registerId !== registerId || session.status !== 'open') {
        return session
      }
      const varianceMmk = countedCashMmk - session.expectedCashMmk
      return {
        ...session,
        countedCashMmk,
        varianceMmk,
        closeNote: String(input.closeNote || '').trim(),
        status: 'closed',
        closedAt: nowIso(),
      }
    }),
    updatedAt: nowIso(),
  }
}

export function updateRestaurantPaymentSetup(
  workspace: RestaurantOperatingWorkspace,
  patch: Partial<RestaurantPaymentSetup>,
): RestaurantOperatingWorkspace {
  const nextSetup = normalizePaymentSetup({ ...workspace.paymentSetup, ...patch }, workspace.managerName)
  const hasOperationalSetup = [
    nextSetup.providerName,
    nextSetup.merchantName,
    nextSetup.merchantId,
    nextSetup.mmqrTemplate,
    nextSetup.cashupOwner,
  ].every((value) => value.trim())
  return {
    ...workspace,
    paymentSetup: {
      ...nextSetup,
      enabledAt: hasOperationalSetup ? nextSetup.enabledAt || nowIso() : '',
    },
    updatedAt: nowIso(),
  }
}

export function updateRestaurantPaymentStatus(
  workspace: RestaurantOperatingWorkspace,
  paymentId: string,
  patch: {
    status: RestaurantPaymentStatus
    settlementRef?: string
    proofNote?: string
    verifiedBy?: string
    tenderType?: RestaurantPaymentTender
    collectedMmk?: number
    refundedMmk?: number
    tipMmk?: number
    changeGivenMmk?: number
  },
): RestaurantOperatingWorkspace {
  let registerCashDelta = 0
  const registerId = workspace.registerSessions.find((session) => session.status === 'open')?.registerId || 'front-register'
  const nextPayments = workspace.payments.map((payment) => {
    if (payment.id !== paymentId) {
      return payment
    }
    const previousCashDelta = getPaymentCashDelta(payment)
    const collectedMmk = patch.collectedMmk === undefined ? payment.collectedMmk : normalizeNumber(patch.collectedMmk)
    const refundedMmk = patch.refundedMmk === undefined ? payment.refundedMmk : normalizeNumber(patch.refundedMmk)
    const nextStatus = resolvePaymentStatus(normalizePaymentStatus(patch.status), collectedMmk, payment.amountMmk, refundedMmk)
    const nextPayment: RestaurantPaymentRecord = {
      ...payment,
      tenderType: patch.tenderType ? normalizePaymentTender(patch.tenderType) : payment.tenderType,
      collectedMmk,
      refundedMmk,
      tipMmk: patch.tipMmk === undefined ? payment.tipMmk : normalizeNumber(patch.tipMmk),
      changeGivenMmk: patch.changeGivenMmk === undefined ? payment.changeGivenMmk : normalizeNumber(patch.changeGivenMmk),
      status: nextStatus,
      settlementRef: patch.settlementRef?.trim() || payment.settlementRef,
      proofNote: patch.proofNote?.trim() || payment.proofNote,
      verifiedBy: patch.verifiedBy?.trim() || payment.verifiedBy,
      paidAt: nextStatus === 'paid' || nextStatus === 'refunded' ? payment.paidAt || nowIso() : payment.paidAt,
    }
    const nextCashDelta = getPaymentCashDelta(nextPayment)
    registerCashDelta += nextCashDelta - previousCashDelta
    return nextPayment
  })
  const nextSessions = applyPaymentCashDeltaToSessions(workspace.registerSessions, registerCashDelta, registerId)
  return {
    ...workspace,
    registerSessions: nextSessions,
    payments: nextPayments,
    updatedAt: nowIso(),
  }
}

export function appendRestaurantTable(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantTableRecord, 'id' | 'createdAt' | 'updatedAt'>,
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    tables: [
      {
        ...input,
        tableName: input.tableName.trim() || `Table ${workspace.tables.length + 1}`,
        floorZone: input.floorZone.trim() || 'Main floor',
        seats: Math.max(1, normalizeNumber(input.seats || 1)),
        guestCount: Math.max(0, normalizeNumber(input.guestCount)),
        status: normalizeTableStatus(input.status),
        orderRef: input.orderRef.trim(),
        assignedServer: input.assignedServer.trim(),
        note: input.note.trim(),
        id: createId('table'),
        createdAt: now,
        updatedAt: now,
      },
      ...workspace.tables,
    ],
    updatedAt: now,
  }
}

export function updateRestaurantTableStatus(
  workspace: RestaurantOperatingWorkspace,
  tableId: string,
  patch: {
    status: RestaurantTableStatus
    orderRef?: string
    guestCount?: number
    assignedServer?: string
    note?: string
  },
): RestaurantOperatingWorkspace {
  const nextTables = workspace.tables.map((table) => {
    if (table.id !== tableId) {
      return table
    }
    return {
      ...table,
      status: normalizeTableStatus(patch.status),
      orderRef: patch.orderRef === undefined ? table.orderRef : String(patch.orderRef).trim(),
      guestCount: patch.guestCount === undefined ? table.guestCount : Math.max(0, normalizeNumber(patch.guestCount)),
      assignedServer: patch.assignedServer === undefined ? table.assignedServer : String(patch.assignedServer).trim(),
      note: patch.note === undefined ? table.note : String(patch.note).trim(),
      updatedAt: nowIso(),
    }
  })
  return {
    ...workspace,
    tables: nextTables,
    updatedAt: nowIso(),
  }
}

export function appendRestaurantKitchenTicket(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantKitchenTicketRecord, 'id' | 'createdAt' | 'updatedAt'>,
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    kitchenTickets: [
      {
        ...input,
        orderRef: input.orderRef.trim() || `order-${workspace.kitchenTickets.length + 1}`,
        tableName: input.tableName.trim(),
        station: input.station.trim() || 'Hot line',
        itemSummary: input.itemSummary.trim(),
        targetReadyAt: input.targetReadyAt.trim(),
        status: normalizeKitchenTicketStatus(input.status),
        priority: normalizeKitchenTicketPriority(input.priority),
        owner: input.owner.trim() || workspace.managerName || 'kitchen lead',
        note: input.note.trim(),
        id: createId('kitchen'),
        createdAt: now,
        updatedAt: now,
      },
      ...workspace.kitchenTickets,
    ],
    updatedAt: now,
  }
}

export function updateRestaurantKitchenTicketStatus(
  workspace: RestaurantOperatingWorkspace,
  ticketId: string,
  patch: {
    status: RestaurantKitchenTicketStatus
    station?: string
    targetReadyAt?: string
    owner?: string
    note?: string
    priority?: RestaurantKitchenTicketPriority
  },
): RestaurantOperatingWorkspace {
  const nextTickets = workspace.kitchenTickets.map((ticket) => {
    if (ticket.id !== ticketId) {
      return ticket
    }
    return {
      ...ticket,
      status: normalizeKitchenTicketStatus(patch.status),
      station: patch.station === undefined ? ticket.station : String(patch.station).trim(),
      targetReadyAt: patch.targetReadyAt === undefined ? ticket.targetReadyAt : String(patch.targetReadyAt).trim(),
      owner: patch.owner === undefined ? ticket.owner : String(patch.owner).trim(),
      note: patch.note === undefined ? ticket.note : String(patch.note).trim(),
      priority: patch.priority === undefined ? ticket.priority : normalizeKitchenTicketPriority(patch.priority),
      updatedAt: nowIso(),
    }
  })
  return {
    ...workspace,
    kitchenTickets: nextTickets,
    updatedAt: nowIso(),
  }
}

export function appendRestaurantApprovalRequest(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantApprovalRecord, 'id' | 'createdAt' | 'updatedAt'>,
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    approvals: [
      {
        ...input,
        orderRef: input.orderRef.trim(),
        tableName: input.tableName.trim(),
        actionType: normalizeApprovalActionType(input.actionType),
        reason: input.reason.trim(),
        amountMmk: Math.max(0, normalizeNumber(input.amountMmk)),
        requestedBy: input.requestedBy.trim() || workspace.managerName || 'operator',
        approvedBy: input.approvedBy.trim(),
        status: normalizeApprovalStatus(input.status),
        note: input.note.trim(),
        id: createId('approval'),
        createdAt: now,
        updatedAt: now,
      },
      ...workspace.approvals,
    ],
    updatedAt: now,
  }
}

export function updateRestaurantApprovalStatus(
  workspace: RestaurantOperatingWorkspace,
  approvalId: string,
  patch: {
    status: RestaurantApprovalStatus
    approvedBy?: string
    note?: string
  },
): RestaurantOperatingWorkspace {
  const nextApprovals = workspace.approvals.map((approval) => {
    if (approval.id !== approvalId) {
      return approval
    }
    return {
      ...approval,
      status: normalizeApprovalStatus(patch.status),
      approvedBy:
        patch.status === 'approved' || patch.status === 'rejected'
          ? String(patch.approvedBy || approval.approvedBy || workspace.managerName || 'manager').trim()
          : approval.approvedBy,
      note: patch.note === undefined ? approval.note : String(patch.note).trim(),
      updatedAt: nowIso(),
    }
  })
  return {
    ...workspace,
    approvals: nextApprovals,
    updatedAt: nowIso(),
  }
}

export function getRestaurantOperatingSummary(workspace: RestaurantOperatingWorkspace): RestaurantOperatingSummary {
  const paymentsNeedingReview = workspace.payments.filter((item) =>
    item.status === 'draft' || item.status === 'link-issued' || item.status === 'partial' || item.status === 'reconcile',
  )
  const partialPaymentCount = workspace.payments.filter((item) => item.status === 'partial').length
  const refundedPaymentCount = workspace.payments.filter((item) => item.status === 'refunded' || item.refundedMmk > 0).length
  const openRegisterCount = workspace.registerSessions.filter((session) => session.status === 'open').length
  const cashVarianceMmk = workspace.registerSessions
    .filter((session) => session.status === 'closed')
    .reduce((sum, session) => sum + session.varianceMmk, 0)
  const tableServiceAlerts = workspace.tables.filter((table) => table.status === 'bill-requested' || table.status === 'open').length
  const kitchenDelayedCount = workspace.kitchenTickets.filter((ticket) => ticket.status === 'delayed').length
  const pendingApprovalCount = workspace.approvals.filter((approval) => approval.status === 'pending').length
  const tipRecoveryPendingCount = workspace.tipRecoveries.filter((item) => item.status === 'pending').length
  const transferVarianceCount = workspace.inventoryTransfers.filter((item) => item.status === 'variance').length
  const offlinePendingUploadCount = workspace.offlineGuardrail.pendingUploads
  const deviceCoverageCount = workspace.serviceDevices.filter((item) => item.status === 'active').length
  return {
    openBlockers: workspace.shifts.filter((item) => item.status === 'blocked' || item.blocker.trim()).length,
    stockoutRisks: workspace.stock.filter((item) => item.current < item.par).length,
    wasteUnits: workspace.stock.reduce((sum, item) => sum + item.waste, 0),
    guestIssuesOpen: workspace.guests.filter((item) => item.status !== 'closed').length,
    promosNeedingDecision: workspace.promos.filter((item) => item.decision === 'review' || item.foodCostPressure + item.laborPressure > item.salesLift).length,
    menuItems: workspace.menu.items.length,
    paymentReviewCount: paymentsNeedingReview.length,
    paymentReviewValueMmk: paymentsNeedingReview.reduce((sum, item) => sum + item.amountMmk, 0),
    partialPaymentCount,
    refundedPaymentCount,
    openRegisterCount,
    cashVarianceMmk,
    tableServiceAlerts,
    kitchenDelayedCount,
    pendingApprovalCount,
    tipRecoveryPendingCount,
    transferVarianceCount,
    offlinePendingUploadCount,
    deviceCoverageCount,
    recordCount:
      workspace.shifts.length
      + workspace.stock.length
      + workspace.guests.length
      + workspace.promos.length
      + workspace.payments.length
      + workspace.tables.length
      + workspace.kitchenTickets.length
      + workspace.approvals.length
      + workspace.registerSessions.length
      + workspace.cashMovements.length
      + workspace.auditTrail.length
      + workspace.menu.items.length
      + workspace.tipRecoveries.length
      + workspace.inventoryTransfers.length
      + workspace.serviceDevices.length
      + workspace.menuDaypartSchedules.length,
  }
}

export function buildRestaurantGoLiveChecklist(workspace: RestaurantOperatingWorkspace): RestaurantGoLiveChecklistItem[] {
  const summary = getRestaurantOperatingSummary(workspace)
  const paymentSetup = getRestaurantPaymentSetupReadiness(workspace)
  const hasManager = Boolean(workspace.managerName.trim())
  const hasCashOwner = Boolean(workspace.paymentSetup.cashupOwner.trim())
  const hasMenu = workspace.menu.items.length > 0
  const hasMenuSource = Boolean(workspace.menu.sourceText.trim() || workspace.menu.sourceFiles.length)
  const unresolvedPayments = workspace.payments.filter((item) => item.status !== 'paid' && item.status !== 'refunded').length
  const unresolvedApprovals = workspace.approvals.filter((item) => item.status === 'pending').length
  const openRegisters = workspace.registerSessions.filter((item) => item.status === 'open').length
  const closeoutApprovalPending = workspace.approvals.filter((item) => item.status === 'pending' && item.actionType === 'closeout').length
  const pendingTipRecoveries = workspace.tipRecoveries.filter((item) => item.status === 'pending').length
  const transferVarianceCount = workspace.inventoryTransfers.filter((item) => item.status === 'variance').length
  const transferInFlightCount = workspace.inventoryTransfers.filter((item) => item.status === 'requested' || item.status === 'dispatched').length
  const activeServiceDevices = workspace.serviceDevices.filter((item) => item.status === 'active')
  const hasTableDevice = activeServiceDevices.some((item) => item.laneType === 'table')
  const hasKitchenDevice = activeServiceDevices.some((item) => item.laneType === 'kitchen')
  const activeDaypartSchedules = workspace.menuDaypartSchedules.filter((item) => item.active).length
  const offlineGuardrail = workspace.offlineGuardrail

  return [
    {
      control: 'Payment setup',
      status: paymentSetup.complete ? 'ready' : paymentSetup.readyFields >= 3 ? 'review' : 'blocked',
      owner: 'Finance / owner',
      detail: paymentSetup.complete
        ? `${workspace.paymentSetup.providerName || 'Provider'} setup is complete for staffed operations.`
        : `Missing: ${paymentSetup.missing.join(', ') || 'setup fields'}.`,
    },
    {
      control: 'Payment reconciliation',
      status: unresolvedPayments === 0 ? 'ready' : unresolvedPayments <= 3 ? 'review' : 'blocked',
      owner: 'Cashier lead',
      detail: unresolvedPayments
        ? `${unresolvedPayments} payment record(s) still unresolved.`
        : 'All payment records are closed as paid or refunded.',
    },
    {
      control: 'Register closeout',
      status: openRegisters === 0 && closeoutApprovalPending === 0 ? 'ready' : openRegisters <= 1 ? 'review' : 'blocked',
      owner: 'Manager',
      detail: openRegisters
        ? `${openRegisters} register session(s) still open.`
        : closeoutApprovalPending
          ? `${closeoutApprovalPending} closeout approval request(s) pending.`
          : 'Registers are closed with approval state captured.',
    },
    {
      control: 'Approvals and exception queue',
      status: unresolvedApprovals === 0 ? 'ready' : unresolvedApprovals <= 3 ? 'review' : 'blocked',
      owner: 'Manager / owner',
      detail: unresolvedApprovals
        ? `${unresolvedApprovals} pending approval request(s).`
        : 'All sensitive actions are approved or rejected.',
    },
    {
      control: 'Menu governance',
      status: hasMenu && hasMenuSource ? 'ready' : hasMenu ? 'review' : 'blocked',
      owner: 'Operations lead',
      detail: hasMenu
        ? `${workspace.menu.items.length} menu item(s) structured${hasMenuSource ? ' with source' : ' without source evidence'}.`
        : 'No structured menu items yet.',
    },
    {
      control: 'Menu daypart schedule',
      status: activeDaypartSchedules >= 3 ? 'ready' : activeDaypartSchedules > 0 ? 'review' : 'blocked',
      owner: 'Manager / owner',
      detail: activeDaypartSchedules
        ? `${activeDaypartSchedules} active daypart schedule(s) configured for timed menu switching.`
        : 'No daypart schedule configured yet.',
    },
    {
      control: 'Stock and service risk',
      status: summary.stockoutRisks === 0 && summary.openBlockers === 0 ? 'ready' : summary.stockoutRisks <= 2 ? 'review' : 'blocked',
      owner: 'Shift manager',
      detail: `${summary.stockoutRisks} stock risks, ${summary.openBlockers} shift blockers, ${summary.kitchenDelayedCount} kitchen delays.`,
    },
    {
      control: 'Inventory transfer lifecycle',
      status: transferVarianceCount === 0 && transferInFlightCount === 0 ? 'ready' : transferVarianceCount > 0 ? 'blocked' : 'review',
      owner: 'Inventory lead',
      detail: transferVarianceCount
        ? `${transferVarianceCount} transfer(s) flagged with variance.`
        : transferInFlightCount
          ? `${transferInFlightCount} transfer(s) still in request/dispatch state.`
          : 'Transfers are settled with receiving confirmation.',
    },
    {
      control: 'Kitchen/table device assignment',
      status: hasTableDevice && hasKitchenDevice ? 'ready' : activeServiceDevices.length ? 'review' : 'blocked',
      owner: 'Ops lead',
      detail: activeServiceDevices.length
        ? `${activeServiceDevices.length} active device assignment(s) / table=${hasTableDevice ? 'yes' : 'no'} / kitchen=${hasKitchenDevice ? 'yes' : 'no'}.`
        : 'No active service-device mapping yet.',
    },
    {
      control: 'Offline payment guardrail',
      status: offlineGuardrail.isOfflineCaptureActive
        ? offlineGuardrail.dangerousActionsLocked ? 'review' : 'blocked'
        : offlineGuardrail.pendingUploads === 0 ? 'ready' : 'review',
      owner: 'Manager / cash-up owner',
      detail: offlineGuardrail.isOfflineCaptureActive
        ? `Offline capture active / pending uploads ${offlineGuardrail.pendingUploads} / critical ${offlineGuardrail.pendingCriticalActions} / lock ${offlineGuardrail.queueLockLevel}.`
        : `Online / pending uploads ${offlineGuardrail.pendingUploads} / critical ${offlineGuardrail.pendingCriticalActions}.`,
    },
    {
      control: 'Tip recovery and shift review lock',
      status: pendingTipRecoveries === 0 && workspace.shiftReviewLock.status !== 'locked'
        ? 'ready'
        : pendingTipRecoveries <= 2
          ? 'review'
          : 'blocked',
      owner: 'Cash-up owner',
      detail: pendingTipRecoveries
        ? `${pendingTipRecoveries} tip recovery item(s) pending / shift review ${workspace.shiftReviewLock.status}.`
        : `Tip recoveries clear / shift review ${workspace.shiftReviewLock.status}.`,
    },
    {
      control: 'Accountability assignment',
      status: hasManager && hasCashOwner ? 'ready' : hasManager || hasCashOwner ? 'review' : 'blocked',
      owner: 'Owner',
      detail: hasManager
        ? `Manager ${workspace.managerName}${hasCashOwner ? ` / cash-up owner ${workspace.paymentSetup.cashupOwner}` : ' / cash-up owner missing'}.`
        : 'Manager and cash-up owner are not assigned.',
    },
  ]
}

export function getRestaurantQueue(workspace: RestaurantOperatingWorkspace) {
  const shiftItems = workspace.shifts.map((item) => ({
    id: item.id,
    title: item.blocker || `${item.daypart} shift ${item.status}`,
    detail: item.handover || `${item.branchName} / ${item.managerName || 'manager not set'}`,
    route: 'Shift Control',
    priority: item.status === 'blocked' ? 'High' : 'Normal',
    createdAt: item.createdAt,
  }))
  const stockItems = workspace.stock.map((item) => ({
    id: item.id,
    title: item.current < item.par ? `${item.itemName} below par` : `${item.itemName} checked`,
    detail: item.action || item.supplierIssue || `Current ${item.current} / par ${item.par}`,
    route: 'Prep and Stock',
    priority: item.current < item.par || item.supplierIssue ? 'High' : 'Normal',
    createdAt: item.createdAt,
  }))
  const guestItems = workspace.guests.map((item) => ({
    id: item.id,
    title: item.issue,
    detail: item.recovery || `${item.channel} / ${item.owner || 'owner missing'}`,
    route: 'Guest Recovery',
    priority: item.status === 'open' ? 'High' : 'Normal',
    createdAt: item.createdAt,
  }))
  const promoItems = workspace.promos.map((item) => ({
    id: item.id,
    title: item.promoName,
    detail: `${item.decision} / sales ${item.salesLift}% / pressure ${item.foodCostPressure + item.laborPressure}%`,
    route: 'Margin Brief',
    priority: item.decision === 'review' ? 'High' : 'Normal',
    createdAt: item.createdAt,
  }))
  const paymentItems = workspace.payments.map((item) => ({
    id: item.id,
    title: `${item.orderRef} / ${item.amountMmk.toLocaleString()} MMK`,
    detail: `${item.provider} / ${item.tenderType} / ${item.status}${item.seatLabel ? ` / ${item.seatLabel}` : ''}${item.note ? ` / ${item.note}` : ''}`,
    route: 'Payment Control',
    priority: item.status === 'paid' || item.status === 'refunded' ? 'Normal' : 'High',
    createdAt: item.createdAt,
  }))
  const tableItems = workspace.tables.map((table) => ({
    id: table.id,
    title: `${table.tableName} / ${table.status}`,
    detail: `${table.floorZone} / ${table.guestCount} guest(s)${table.orderRef ? ` / ${table.orderRef}` : ''}${table.note ? ` / ${table.note}` : ''}`,
    route: 'Table Service',
    priority: table.status === 'bill-requested' || table.status === 'open' ? 'High' : 'Normal',
    createdAt: table.updatedAt || table.createdAt,
  }))
  const kitchenItems = workspace.kitchenTickets.map((ticket) => ({
    id: ticket.id,
    title: `${ticket.orderRef} / ${ticket.status}`,
    detail: `${ticket.station} / ${ticket.priority}${ticket.targetReadyAt ? ` / target ${ticket.targetReadyAt}` : ''}${ticket.itemSummary ? ` / ${ticket.itemSummary}` : ''}`,
    route: 'Kitchen SLA',
    priority: ticket.status === 'delayed' || ticket.priority === 'rush' ? 'High' : 'Normal',
    createdAt: ticket.updatedAt || ticket.createdAt,
  }))
  const approvalItems = workspace.approvals.map((approval) => ({
    id: approval.id,
    title: `${approval.actionType} / ${approval.orderRef || 'order missing'}`,
    detail: `${approval.status} / ${approval.amountMmk.toLocaleString()} MMK / ${approval.requestedBy}${approval.reason ? ` / ${approval.reason}` : ''}`,
    route: 'Approval Control',
    priority: approval.status === 'pending' ? 'High' : 'Normal',
    createdAt: approval.updatedAt || approval.createdAt,
  }))
  const registerItems = workspace.registerSessions.map((session) => ({
    id: session.id,
    title: `${session.registerId} / ${session.status}`,
    detail: session.status === 'closed'
      ? `expected ${session.expectedCashMmk.toLocaleString()} / counted ${session.countedCashMmk.toLocaleString()} / variance ${session.varianceMmk.toLocaleString()}`
      : `open float ${session.openingFloatMmk.toLocaleString()} / expected ${session.expectedCashMmk.toLocaleString()}`,
    route: 'Cash Desk',
    priority: session.status === 'open' ? 'High' : Math.abs(session.varianceMmk) > 0 ? 'High' : 'Normal',
    createdAt: session.status === 'closed' ? session.closedAt : session.openedAt,
  }))
  const cashItems = workspace.cashMovements.map((item) => ({
    id: item.id,
    title: `${item.type} / ${item.amountMmk.toLocaleString()} MMK`,
    detail: `${item.registerId} / ${item.reasonCode || 'reason missing'} / ${item.owner || 'owner missing'}`,
    route: 'Cash Desk',
    priority: item.type === 'safe-drop' || item.type === 'remove' ? 'High' : 'Normal',
    createdAt: item.createdAt,
  }))
  const menuItems = workspace.menu.items.length
    ? [{
        id: `menu_${workspace.menu.updatedAt}`,
        title: `${workspace.menu.items.length} menu item(s) ready`,
        detail: workspace.menu.orderingMode === 'order-request' ? 'Customer menu can collect order requests' : 'Customer menu opens a clean digital page',
        route: 'Menu Setup',
        priority: 'Normal',
        createdAt: workspace.menu.updatedAt,
      }]
    : []
  const tipRecoveryItems = workspace.tipRecoveries.map((item) => ({
    id: item.id,
    title: `Tip recovery / ${item.orderRef || 'order missing'}`,
    detail: `${item.status} / expected ${item.expectedTipMmk.toLocaleString()} / recovered ${item.recoveredTipMmk.toLocaleString()} / ${item.staffName || 'staff missing'}`,
    route: 'Payment Control',
    priority: item.status === 'pending' ? 'High' : 'Normal',
    createdAt: item.createdAt,
  }))
  const transferItems = workspace.inventoryTransfers.map((item) => ({
    id: item.id,
    title: `Transfer / ${item.itemName}`,
    detail: `${item.status} / ${item.fromLocation} -> ${item.toLocation} / req ${item.requestedQty} / dispatch ${item.dispatchedQty} / receive ${item.receivedQty}${item.varianceNote ? ` / ${item.varianceNote}` : ''}`,
    route: 'Stock Transfer',
    priority: item.status === 'variance' || item.status === 'requested' ? 'High' : 'Normal',
    createdAt: item.updatedAt || item.createdAt,
  }))
  const deviceItems = workspace.serviceDevices.map((item) => ({
    id: item.id,
    title: `${item.laneType} device / ${item.deviceLabel}`,
    detail: `${item.station} / ${item.deviceType} / ${item.status} / ${item.owner || 'owner missing'}${item.note ? ` / ${item.note}` : ''}`,
    route: 'Service Devices',
    priority: item.status === 'inactive' ? 'High' : 'Normal',
    createdAt: item.updatedAt,
  }))
  const scheduleItems = workspace.menuDaypartSchedules.map((item) => ({
    id: item.id,
    title: `Menu schedule / ${item.daypart}`,
    detail: `${item.active ? 'active' : 'inactive'} / ${item.startTime}-${item.endTime} / ${item.menuLabel}`,
    route: 'Menu Setup',
    priority: item.active ? 'Normal' : 'High',
    createdAt: item.updatedAt,
  }))
  const offlineItems = workspace.offlineGuardrail.pendingUploads || workspace.offlineGuardrail.isOfflineCaptureActive
    ? [{
        id: `offline_${workspace.offlineGuardrail.updatedAt}`,
        title: workspace.offlineGuardrail.isOfflineCaptureActive
          ? 'Offline capture active'
          : 'Offline queue pending upload',
        detail: `lock=${workspace.offlineGuardrail.queueLockLevel} / pending uploads=${workspace.offlineGuardrail.pendingUploads} / critical=${workspace.offlineGuardrail.pendingCriticalActions}`,
        route: 'Offline Guardrail',
        priority: workspace.offlineGuardrail.dangerousActionsLocked ? 'High' : 'Normal',
        createdAt: workspace.offlineGuardrail.updatedAt,
      }]
    : []
  const shiftReviewItems = workspace.shiftReviewLock.status === 'open' && !workspace.shiftReviewLock.note.trim()
    ? []
    : [{
        id: `shift_review_${workspace.shiftReviewLock.updatedAt}`,
        title: `Shift review / ${workspace.shiftReviewLock.status}`,
        detail: `${workspace.shiftReviewLock.owner || 'owner missing'}${workspace.shiftReviewLock.note ? ` / ${workspace.shiftReviewLock.note}` : ''}`,
        route: 'Shift Review',
        priority: workspace.shiftReviewLock.status === 'locked' ? 'High' : 'Normal',
        createdAt: workspace.shiftReviewLock.updatedAt,
      }]

  return [
    ...shiftItems,
    ...stockItems,
    ...guestItems,
    ...promoItems,
    ...paymentItems,
    ...tableItems,
    ...kitchenItems,
    ...approvalItems,
    ...registerItems,
    ...cashItems,
    ...menuItems,
    ...tipRecoveryItems,
    ...transferItems,
    ...deviceItems,
    ...scheduleItems,
    ...offlineItems,
    ...shiftReviewItems,
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function buildRestaurantCloseoutSummaryText(workspace: RestaurantOperatingWorkspace) {
  const summary = getRestaurantOperatingSummary(workspace)
  const control = buildRestaurantEnterpriseControl(workspace)
  const paymentSetup = getRestaurantPaymentSetupReadiness(workspace)
  const pendingCloseoutApprovals = workspace.approvals.filter((item) => item.status === 'pending' && item.actionType === 'closeout').length
  const unresolvedApprovals = workspace.approvals.filter((item) => item.status === 'pending').length
  const netSettledSalesMmk = workspace.payments.reduce((sum, item) => {
    if (item.status !== 'paid' && item.status !== 'refunded') {
      return sum
    }
    return sum + Math.max(0, item.collectedMmk - item.refundedMmk)
  }, 0)
  const highPriorityQueue = getRestaurantQueue(workspace).filter((item) => item.priority === 'High').slice(0, 8)
  const gateSnapshot = control.gates.map((gate) => `${gate.label}=${gate.status}`).join(' | ')
  const queueSection = highPriorityQueue.length
    ? highPriorityQueue.map((item, index) => `${index + 1}. ${item.title} (${item.route}) - ${item.detail}`).join('\n')
    : '1. No high-priority queue items at this time.'
  const now = new Date().toISOString()
  return [
    `Restaurant closeout summary (X/Z-style)`,
    `Branch: ${workspace.branchName}`,
    `Date: ${workspace.businessDate}`,
    `Manager: ${workspace.managerName || 'manager missing'}`,
    `Generated at: ${now}`,
    '',
    `Readiness: ${control.score}% / ${control.label}`,
    `Gate snapshot: ${gateSnapshot}`,
    '',
    `Net settled sales: ${netSettledSalesMmk.toLocaleString()} MMK`,
    `Payment exceptions: ${summary.paymentReviewCount} (value ${summary.paymentReviewValueMmk.toLocaleString()} MMK)`,
    `Partial payments: ${summary.partialPaymentCount}`,
    `Refund records: ${summary.refundedPaymentCount}`,
    `Pending approvals: ${unresolvedApprovals} (closeout approvals ${pendingCloseoutApprovals})`,
    `Tip recovery pending: ${summary.tipRecoveryPendingCount}`,
    `Transfer variance: ${summary.transferVarianceCount}`,
    `Offline pending uploads: ${summary.offlinePendingUploadCount}`,
    `Open registers: ${summary.openRegisterCount}`,
    `Closed cash variance: ${summary.cashVarianceMmk.toLocaleString()} MMK`,
    `Stock risks: ${summary.stockoutRisks} / waste ${summary.wasteUnits}`,
    `Table alerts: ${summary.tableServiceAlerts}`,
    `Kitchen delayed: ${summary.kitchenDelayedCount}`,
    `Setup readiness: ${paymentSetup.label}`,
    `Audit entries: ${workspace.auditTrail.length}`,
    '',
    `High-priority queue:`,
    queueSection,
  ].join('\n')
}

export function parseRestaurantMenuText(sourceText: string): RestaurantMenuItem[] {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const items: RestaurantMenuItem[] = []
  let section = 'Menu'

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, ' ')
    const priceMatch = normalized.match(/(?:[$€£]|MMK|Ks)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:[$€£]|MMK|Ks)?$/i)
    if (!priceMatch) {
      if (normalized.length <= 42 && !/[.!?]$/.test(normalized)) {
        section = normalized
      }
      continue
    }

    const price = normalizeNumber(priceMatch[1].replace(',', '.'))
    const withoutPrice = normalized.slice(0, priceMatch.index).replace(/[-–—|:]+$/g, '').trim()
    if (!withoutPrice) {
      continue
    }
    const [namePart, ...descriptionParts] = withoutPrice.split(/\s[-–—|]\s/)
    items.push({
      id: createId('menu'),
      section,
      name: namePart.trim(),
      description: descriptionParts.join(' - ').trim(),
      price,
    })
  }

  return items
}

export function updateRestaurantMenu(
  workspace: RestaurantOperatingWorkspace,
  input: {
    sourceText: string
    sourceFiles: RestaurantMenuSource[]
    orderingMode: RestaurantMenuTransition['orderingMode']
    publicSlug?: string
  },
): RestaurantOperatingWorkspace {
  const items = parseRestaurantMenuText(input.sourceText)
  return {
    ...workspace,
    menu: {
      sourceText: input.sourceText,
      sourceFiles: input.sourceFiles,
      items,
      orderingMode: input.orderingMode,
      publicSlug: slugify(input.publicSlug || workspace.menu.publicSlug || workspace.branchName),
      updatedAt: nowIso(),
    },
    updatedAt: nowIso(),
  }
}

export function setRestaurantShiftReviewLock(
  workspace: RestaurantOperatingWorkspace,
  input: {
    status: RestaurantShiftReviewStatus
    note?: string
    owner?: string
  },
): RestaurantOperatingWorkspace {
  const status = normalizeShiftReviewStatus(input.status)
  const now = nowIso()
  return {
    ...workspace,
    shiftReviewLock: {
      ...workspace.shiftReviewLock,
      status,
      owner: String(input.owner || workspace.managerName || workspace.paymentSetup.cashupOwner || 'owner').trim(),
      note: String(input.note || workspace.shiftReviewLock.note || '').trim(),
      lockedAt: status === 'locked'
        ? (workspace.shiftReviewLock.lockedAt || now)
        : workspace.shiftReviewLock.lockedAt,
      releasedAt: status === 'released' || status === 'open'
        ? now
        : workspace.shiftReviewLock.releasedAt,
      updatedAt: now,
    },
    updatedAt: now,
  }
}

export function updateRestaurantOfflineGuardrail(
  workspace: RestaurantOperatingWorkspace,
  patch: Partial<RestaurantOfflineGuardrail>,
): RestaurantOperatingWorkspace {
  const current = workspace.offlineGuardrail
  const queueLockLevel = normalizeOfflineQueueLock(patch.queueLockLevel ?? current.queueLockLevel)
  const pendingUploads = Math.max(0, normalizeNumber(patch.pendingUploads ?? current.pendingUploads))
  const pendingCriticalActions = Math.max(0, normalizeNumber(patch.pendingCriticalActions ?? current.pendingCriticalActions))
  const dangerousActionsLocked = queueLockLevel === 'strict'
    || (queueLockLevel === 'payments-only' && pendingCriticalActions > 0)
    || Boolean(patch.dangerousActionsLocked ?? current.dangerousActionsLocked)
  const isOfflineCaptureActive = patch.isOfflineCaptureActive === undefined
    ? current.isOfflineCaptureActive
    : Boolean(patch.isOfflineCaptureActive)
  const now = nowIso()
  return {
    ...workspace,
    offlineGuardrail: {
      ...current,
      isOfflineCaptureActive,
      reconnectDeadlineAt: String((patch.reconnectDeadlineAt ?? current.reconnectDeadlineAt) || '').trim(),
      reconnectOwner: String((patch.reconnectOwner ?? current.reconnectOwner ?? workspace.managerName) || '').trim(),
      queueLockLevel,
      pendingUploads,
      pendingCriticalActions,
      dangerousActionsLocked,
      lastOnlineAt: isOfflineCaptureActive ? current.lastOnlineAt : now,
      updatedAt: now,
    },
    updatedAt: now,
  }
}

export function appendRestaurantTipRecovery(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantTipRecoveryRecord, 'id' | 'createdAt' | 'resolvedAt'>,
): RestaurantOperatingWorkspace {
  const now = nowIso()
  const status = normalizeTipRecoveryStatus(input.status)
  return {
    ...workspace,
    tipRecoveries: [
      {
        ...input,
        id: createId('tip'),
        orderRef: String(input.orderRef || '').trim(),
        staffName: String(input.staffName || workspace.managerName || '').trim(),
        expectedTipMmk: Math.max(0, normalizeNumber(input.expectedTipMmk)),
        recoveredTipMmk: Math.max(0, normalizeNumber(input.recoveredTipMmk)),
        status,
        note: String(input.note || '').trim(),
        createdAt: now,
        resolvedAt: status === 'pending' ? '' : now,
      },
      ...workspace.tipRecoveries,
    ],
    updatedAt: now,
  }
}

export function updateRestaurantTipRecovery(
  workspace: RestaurantOperatingWorkspace,
  tipRecoveryId: string,
  patch: {
    status?: RestaurantTipRecoveryStatus
    recoveredTipMmk?: number
    note?: string
  },
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    tipRecoveries: workspace.tipRecoveries.map((item) => {
      if (item.id !== tipRecoveryId) {
        return item
      }
      const status = patch.status ? normalizeTipRecoveryStatus(patch.status) : item.status
      return {
        ...item,
        status,
        recoveredTipMmk: patch.recoveredTipMmk === undefined ? item.recoveredTipMmk : Math.max(0, normalizeNumber(patch.recoveredTipMmk)),
        note: patch.note === undefined ? item.note : String(patch.note).trim(),
        resolvedAt: status === 'pending' ? '' : item.resolvedAt || now,
      }
    }),
    updatedAt: now,
  }
}

export function appendRestaurantInventoryTransfer(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantInventoryTransferRecord, 'id' | 'createdAt' | 'updatedAt'>,
): RestaurantOperatingWorkspace {
  const now = nowIso()
  const status = normalizeTransferStatus(input.status)
  return {
    ...workspace,
    inventoryTransfers: [
      {
        ...input,
        id: createId('transfer'),
        itemName: String(input.itemName || '').trim() || 'Item',
        fromLocation: String(input.fromLocation || workspace.branchName).trim() || workspace.branchName,
        toLocation: String(input.toLocation || workspace.branchName).trim() || workspace.branchName,
        requestedQty: Math.max(0, normalizeNumber(input.requestedQty)),
        dispatchedQty: Math.max(0, normalizeNumber(input.dispatchedQty)),
        receivedQty: Math.max(0, normalizeNumber(input.receivedQty)),
        status,
        requestedBy: String(input.requestedBy || workspace.managerName || 'operator').trim(),
        dispatchedBy: String(input.dispatchedBy || '').trim(),
        receivedBy: String(input.receivedBy || '').trim(),
        varianceNote: String(input.varianceNote || '').trim(),
        createdAt: now,
        updatedAt: now,
      },
      ...workspace.inventoryTransfers,
    ],
    updatedAt: now,
  }
}

export function updateRestaurantInventoryTransfer(
  workspace: RestaurantOperatingWorkspace,
  transferId: string,
  patch: {
    status?: RestaurantTransferStatus
    dispatchedQty?: number
    receivedQty?: number
    dispatchedBy?: string
    receivedBy?: string
    varianceNote?: string
  },
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    inventoryTransfers: workspace.inventoryTransfers.map((item) => {
      if (item.id !== transferId) {
        return item
      }
      const status = patch.status ? normalizeTransferStatus(patch.status) : item.status
      return {
        ...item,
        status,
        dispatchedQty: patch.dispatchedQty === undefined ? item.dispatchedQty : Math.max(0, normalizeNumber(patch.dispatchedQty)),
        receivedQty: patch.receivedQty === undefined ? item.receivedQty : Math.max(0, normalizeNumber(patch.receivedQty)),
        dispatchedBy: patch.dispatchedBy === undefined ? item.dispatchedBy : String(patch.dispatchedBy).trim(),
        receivedBy: patch.receivedBy === undefined ? item.receivedBy : String(patch.receivedBy).trim(),
        varianceNote: patch.varianceNote === undefined ? item.varianceNote : String(patch.varianceNote).trim(),
        updatedAt: now,
      }
    }),
    updatedAt: now,
  }
}

export function appendRestaurantServiceDeviceAssignment(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantServiceDeviceAssignment, 'id' | 'updatedAt'>,
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    serviceDevices: [
      {
        ...input,
        id: createId('device'),
        laneType: normalizeServiceLaneType(input.laneType),
        laneRef: String(input.laneRef || '').trim() || 'lane',
        station: String(input.station || '').trim() || 'station',
        deviceLabel: String(input.deviceLabel || '').trim() || 'device',
        deviceType: normalizeServiceDeviceType(input.deviceType),
        owner: String(input.owner || workspace.managerName || '').trim(),
        status: input.status === 'inactive' ? 'inactive' : 'active',
        note: String(input.note || '').trim(),
        updatedAt: now,
      },
      ...workspace.serviceDevices,
    ],
    updatedAt: now,
  }
}

export function removeRestaurantServiceDeviceAssignment(
  workspace: RestaurantOperatingWorkspace,
  assignmentId: string,
): RestaurantOperatingWorkspace {
  return {
    ...workspace,
    serviceDevices: workspace.serviceDevices.filter((item) => item.id !== assignmentId),
    updatedAt: nowIso(),
  }
}

export function appendRestaurantMenuDaypartSchedule(
  workspace: RestaurantOperatingWorkspace,
  input: Omit<RestaurantMenuDaypartSchedule, 'id' | 'updatedAt'>,
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    menuDaypartSchedules: [
      {
        ...input,
        id: createId('schedule'),
        daypart: input.daypart,
        startTime: normalizeMinuteTime(input.startTime, '08:00'),
        endTime: normalizeMinuteTime(input.endTime, '22:00'),
        menuLabel: String(input.menuLabel || '').trim() || 'Menu',
        active: Boolean(input.active),
        updatedBy: String(input.updatedBy || workspace.managerName || '').trim(),
        updatedAt: now,
      },
      ...workspace.menuDaypartSchedules,
    ],
    updatedAt: now,
  }
}

export function updateRestaurantMenuDaypartSchedule(
  workspace: RestaurantOperatingWorkspace,
  scheduleId: string,
  patch: {
    active?: boolean
    startTime?: string
    endTime?: string
    menuLabel?: string
    updatedBy?: string
  },
): RestaurantOperatingWorkspace {
  const now = nowIso()
  return {
    ...workspace,
    menuDaypartSchedules: workspace.menuDaypartSchedules.map((item) => {
      if (item.id !== scheduleId) {
        return item
      }
      return {
        ...item,
        active: patch.active === undefined ? item.active : Boolean(patch.active),
        startTime: patch.startTime === undefined ? item.startTime : normalizeMinuteTime(patch.startTime, item.startTime),
        endTime: patch.endTime === undefined ? item.endTime : normalizeMinuteTime(patch.endTime, item.endTime),
        menuLabel: patch.menuLabel === undefined ? item.menuLabel : String(patch.menuLabel).trim() || item.menuLabel,
        updatedBy: patch.updatedBy === undefined ? item.updatedBy : String(patch.updatedBy).trim(),
        updatedAt: now,
      }
    }),
    updatedAt: now,
  }
}

export function getRestaurantActiveMenuDaypart(
  workspace: RestaurantOperatingWorkspace,
  now = new Date(),
) {
  const minuteOfDay = now.getHours() * 60 + now.getMinutes()
  const activeSchedules = workspace.menuDaypartSchedules
    .filter((schedule) => schedule.active)
    .map((schedule) => {
      const [startHour, startMinute] = normalizeMinuteTime(schedule.startTime).split(':').map((value) => Number(value))
      const [endHour, endMinute] = normalizeMinuteTime(schedule.endTime).split(':').map((value) => Number(value))
      const start = startHour * 60 + startMinute
      const end = endHour * 60 + endMinute
      return {
        schedule,
        start,
        end,
      }
    })
  const matched = activeSchedules.find((item) => minuteOfDay >= item.start && minuteOfDay < item.end)
  return matched?.schedule || null
}

export function buildRestaurantMenuUrl(workspace: RestaurantOperatingWorkspace) {
  const slug = slugify(workspace.menu.publicSlug || workspace.branchName)
  if (typeof window === 'undefined') {
    return `/menu/${slug}`
  }
  const payload = buildRestaurantMenuSharePayload(workspace)
  return `${window.location.origin}/menu/${slug}${payload ? `#data=${encodeURIComponent(payload)}` : ''}`
}

export function buildRestaurantPaymentQrValue(workspace: RestaurantOperatingWorkspace, payment: RestaurantPaymentRecord | null | undefined) {
  if (!payment) {
    return ''
  }
  const providerPayload = payment.paymentPayload.trim()
  if (providerPayload) {
    return providerPayload
  }
  const setupPayload = workspace.paymentSetup.mmqrTemplate.trim()
  if (setupPayload) {
    return setupPayload
      .replace(/\{amount\}/gi, String(payment.amountMmk))
      .replace(/\{orderRef\}/gi, payment.orderRef)
      .replace(/\{merchantId\}/gi, workspace.paymentSetup.merchantId)
      .replace(/\{branch\}/gi, workspace.paymentSetup.branchCode || workspace.branchName)
      .replace(/\{provider\}/gi, workspace.paymentSetup.providerName || payment.provider)
  }
  const params = new URLSearchParams({
    branch: workspace.branchName,
    ref: payment.orderRef,
    table: payment.tableName,
    amount: String(payment.amountMmk),
    provider: payment.provider || 'provider-issued-payment-draft',
    mode: 'draft-review-only',
  })
  return `supermega:payment-draft?${params.toString()}`
}

export function getRestaurantPaymentSetupReadiness(workspace: RestaurantOperatingWorkspace) {
  const checks = [
    ['Provider selected', workspace.paymentSetup.providerName],
    ['Merchant name', workspace.paymentSetup.merchantName],
    ['Merchant ID', workspace.paymentSetup.merchantId],
    ['Provider QR or payment link template', workspace.paymentSetup.mmqrTemplate],
    ['Cash-up owner', workspace.paymentSetup.cashupOwner],
  ] as const
  const missing = checks.filter(([, value]) => !String(value).trim()).map(([label]) => label)
  const readyFields = checks.length - missing.length
  return {
    complete: missing.length === 0,
    score: Math.round((readyFields / checks.length) * 100),
    missing,
    readyFields,
    totalFields: checks.length,
    label: missing.length === 0 ? 'Ready for staffed payment proof' : `${missing.length} setup item(s) missing`,
  }
}

export function buildRestaurantMmqrSetupChecklist(workspace: RestaurantOperatingWorkspace) {
  const readiness = getRestaurantPaymentSetupReadiness(workspace)
  if (readiness.complete) {
    return [
      `Use ${workspace.paymentSetup.providerName} merchant QR or payment link for customer collection.`,
      'Keep screenshots, provider settlement IDs, or export rows attached to each order.',
      `${workspace.paymentSetup.cashupOwner} reviews unpaid, reconcile, and paid records before daily close.`,
    ]
  }
  return [
    'Pick the payment provider used by the store.',
    'Add merchant name, merchant ID, and branch code from the provider dashboard.',
    'Paste only a provider-issued merchant QR payload or payment link template.',
    'Assign a cashier or owner for cash-up review.',
    ...readiness.missing.map((item) => `Missing: ${item}.`),
  ]
}

export function getRestaurantPaymentReadiness(
  payment: RestaurantPaymentRecord | null | undefined,
  workspace?: RestaurantOperatingWorkspace,
) {
  if (!payment) {
    return {
      status: 'no-payment' as const,
      label: 'Create order first',
      customerReady: false,
      detail: 'Add order ref, amount, provider, and provider-issued payment QR, link, slip, or settlement proof.',
    }
  }
  if (isProviderSettlementPayload(payment.paymentPayload)) {
    return {
      status: 'customer-ready' as const,
      label: isPaymentUrl(payment.paymentPayload) ? 'Payment link ready' : 'Provider proof ready',
      customerReady: true,
      detail: 'This record has provider-issued payment QR, link, slip, or settlement evidence. Staff can collect proof, then mark paid after verification.',
    }
  }
  if (workspace && getRestaurantPaymentSetupReadiness(workspace).complete) {
    return {
      status: 'setup-ready' as const,
      label: 'Merchant payment setup ready',
      customerReady: true,
      detail: 'This order can use the branch merchant QR setup. Staff still attach settlement proof and manager review before closeout.',
    }
  }
  return {
    status: 'draft-only' as const,
    label: 'Internal review only',
    customerReady: false,
    detail: 'Paste provider-issued payment QR, link, slip, or settlement proof before using this record with a customer.',
  }
}

export function getRestaurantPaymentLink(payment: RestaurantPaymentRecord | null | undefined) {
  if (!payment?.paymentPayload || !isPaymentUrl(payment.paymentPayload)) {
    return ''
  }
  return payment.paymentPayload.trim()
}

export function buildRestaurantPaymentReconciliationText(workspace: RestaurantOperatingWorkspace) {
  const reviewPayments = workspace.payments.filter((payment) =>
    payment.status === 'draft' || payment.status === 'link-issued' || payment.status === 'partial' || payment.status === 'reconcile',
  )
  const pendingTipRecoveries = workspace.tipRecoveries.filter((item) => item.status === 'pending')
  const openRegisters = workspace.registerSessions.filter((session) => session.status === 'open')
  const closedVariance = workspace.registerSessions
    .filter((session) => session.status === 'closed')
    .reduce((sum, session) => sum + session.varianceMmk, 0)

  if (!reviewPayments.length) {
    return `${workspace.branchName}: no open payment exceptions. setup=${getRestaurantPaymentSetupReadiness(workspace).label} / open-registers=${openRegisters.length} / cash-variance=${closedVariance.toLocaleString()} / pending-tip-recovery=${pendingTipRecoveries.length}`
  }
  const paymentLines = reviewPayments
    .map((payment) => `${payment.orderRef} / ${payment.amountMmk.toLocaleString()} MMK / ${payment.provider || workspace.paymentSetup.providerName || 'provider missing'} / ${payment.status} / seat=${payment.seatLabel || 'n/a'} / setup=${getRestaurantPaymentSetupReadiness(workspace).label} / settlement=${payment.settlementRef || 'missing'} / proof=${payment.proofNote || payment.note || 'missing'} / customer=${payment.customerPhone || payment.customerName || 'unknown'}`)
    .join('\n')
  const registerLine = `registers: open=${openRegisters.length} / cash-variance=${closedVariance.toLocaleString()} / pending-tip-recovery=${pendingTipRecoveries.length}`
  return `${paymentLines}\n${registerLine}`
}

function gateWeight(status: RestaurantEnterpriseGateStatus) {
  if (status === 'ready') return 1
  if (status === 'review') return 0.58
  return 0.18
}

export function buildRestaurantEnterpriseControl(workspace: RestaurantOperatingWorkspace): RestaurantEnterpriseControl {
  const summary = getRestaurantOperatingSummary(workspace)
  const paymentSetupReadiness = getRestaurantPaymentSetupReadiness(workspace)
  const unpaidPayments = workspace.payments.filter((payment) => payment.status !== 'paid' && payment.status !== 'refunded')
  const partialPayments = workspace.payments.filter((payment) => payment.status === 'partial')
  const splitTenderGroups = new Set(
    workspace.payments.map((payment) => payment.splitGroup.trim() || payment.orderRef.trim()).filter(Boolean),
  )
  const paymentWithoutProof = unpaidPayments.filter((payment) => !payment.settlementRef.trim() && !payment.proofNote.trim() && !payment.paymentPayload.trim())
  const lowStockWithoutAction = workspace.stock.filter((item) => item.current < item.par && !item.action.trim())
  const hasMenuSource = Boolean(workspace.menu.sourceText.trim() || workspace.menu.sourceFiles.length)
  const managerReady = Boolean(workspace.managerName.trim())
  const cashupOwnerReady = Boolean(workspace.paymentSetup.cashupOwner.trim() || workspace.managerName.trim())
  const openRegisterSessions = workspace.registerSessions.filter((session) => session.status === 'open')
  const closedRegisterWithVariance = workspace.registerSessions.filter((session) => session.status === 'closed' && Math.abs(session.varianceMmk) > 0)
  const pendingApprovals = workspace.approvals.filter((approval) => approval.status === 'pending')
  const pendingCloseoutApprovals = pendingApprovals.filter((approval) => approval.actionType === 'closeout')
  const pendingTipRecoveries = workspace.tipRecoveries.filter((item) => item.status === 'pending')
  const transferVariance = workspace.inventoryTransfers.filter((item) => item.status === 'variance')
  const transferInFlight = workspace.inventoryTransfers.filter((item) => item.status === 'requested' || item.status === 'dispatched')
  const activeDeviceAssignments = workspace.serviceDevices.filter((item) => item.status === 'active')
  const hasTableDevice = activeDeviceAssignments.some((item) => item.laneType === 'table')
  const hasKitchenDevice = activeDeviceAssignments.some((item) => item.laneType === 'kitchen')
  const activeDaypartSchedules = workspace.menuDaypartSchedules.filter((item) => item.active)
  const offlineGuardrail = workspace.offlineGuardrail

  const gates: RestaurantEnterpriseGate[] = [
    {
      id: 'payment-reconciliation',
      label: 'Payment reconciliation',
      status: paymentSetupReadiness.complete && unpaidPayments.length === 0 ? 'ready' : paymentWithoutProof.length ? 'blocked' : 'review',
      detail: unpaidPayments.length
        ? `${unpaidPayments.length} payment record(s) still need settlement proof or manager review; partial=${partialPayments.length}; split-groups=${splitTenderGroups.size}.`
        : 'Every payment record is paid or closed for the current browser workspace.',
      ownerAction: paymentWithoutProof.length
        ? 'Attach provider proof or settlement reference before close.'
        : unpaidPayments.length
          ? 'Review open payment records, split tenders, and partial balances before daily close.'
          : 'Keep provider export with the day snapshot.',
    },
    {
      id: 'register-closeout',
      label: 'Register closeout',
      status: openRegisterSessions.length === 0 && closedRegisterWithVariance.length === 0 && pendingCloseoutApprovals.length === 0
        ? 'ready'
        : closedRegisterWithVariance.length
          ? 'blocked'
          : 'review',
      detail: openRegisterSessions.length
        ? `${openRegisterSessions.length} register session(s) still open.`
        : closedRegisterWithVariance.length
          ? `${closedRegisterWithVariance.length} register session(s) closed with variance.`
          : pendingCloseoutApprovals.length
            ? `${pendingCloseoutApprovals.length} closeout approval request(s) still pending.`
          : 'Every register session is closed and balanced.',
      ownerAction: openRegisterSessions.length
        ? 'Close active register sessions with counted cash.'
        : closedRegisterWithVariance.length
          ? 'Resolve cash variance with reason code and owner approval.'
          : pendingCloseoutApprovals.length
            ? 'Approve or reject pending closeout requests before archive.'
          : 'Archive register closeout summary with payment export.',
    },
    {
      id: 'approval-closure',
      label: 'Sensitive action approvals',
      status: pendingApprovals.length === 0 ? 'ready' : pendingCloseoutApprovals.length ? 'blocked' : 'review',
      detail: pendingApprovals.length
        ? `${pendingApprovals.length} pending approval request(s), including ${pendingCloseoutApprovals.length} closeout request(s).`
        : 'All approval requests are resolved.',
      ownerAction: pendingApprovals.length
        ? 'Resolve pending approval requests and keep reason/evidence before closing day.'
        : 'Keep approved/rejected history in export package.',
    },
    {
      id: 'menu-governance',
      label: 'Menu governance',
      status: workspace.menu.items.length && hasMenuSource ? 'ready' : workspace.menu.items.length ? 'review' : 'blocked',
      detail: workspace.menu.items.length
        ? `${workspace.menu.items.length} structured menu item(s), source ${hasMenuSource ? 'attached' : 'missing'}.`
        : 'No structured menu has been generated yet.',
      ownerAction: hasMenuSource ? 'Approve price changes before publishing QR menu.' : 'Attach menu photo, PDF, text, or item sheet.',
    },
    {
      id: 'menu-daypart',
      label: 'Daypart schedule',
      status: activeDaypartSchedules.length >= 3 ? 'ready' : activeDaypartSchedules.length ? 'review' : 'blocked',
      detail: activeDaypartSchedules.length
        ? `${activeDaypartSchedules.length} active daypart schedule(s) controlling menu windows.`
        : 'No active daypart schedule configured.',
      ownerAction: 'Set opening/lunch/dinner schedule windows and keep manager override trace.',
    },
    {
      id: 'stock-control',
      label: 'Stock and waste control',
      status: summary.stockoutRisks === 0 ? 'ready' : lowStockWithoutAction.length ? 'blocked' : 'review',
      detail: `${summary.stockoutRisks} stock risk(s), ${summary.wasteUnits} waste unit(s), ${lowStockWithoutAction.length} without action.`,
      ownerAction: lowStockWithoutAction.length ? 'Assign prep or supplier action for low-stock rows.' : 'Confirm prep action before rush hour.',
    },
    {
      id: 'transfer-control',
      label: 'Transfer lifecycle',
      status: transferVariance.length === 0 && transferInFlight.length === 0
        ? 'ready'
        : transferVariance.length
          ? 'blocked'
          : 'review',
      detail: transferVariance.length
        ? `${transferVariance.length} transfer(s) are unresolved variance.`
        : transferInFlight.length
          ? `${transferInFlight.length} transfer(s) are still requested/dispatched.`
          : 'All transfer records are settled at receive stage.',
      ownerAction: transferVariance.length
        ? 'Resolve transfer variance with recount and owner sign-off.'
        : 'Confirm dispatch/receive handoff before day close.',
    },
    {
      id: 'device-assignment',
      label: 'Kitchen/table devices',
      status: hasTableDevice && hasKitchenDevice ? 'ready' : activeDeviceAssignments.length ? 'review' : 'blocked',
      detail: `${activeDeviceAssignments.length} active assignment(s) / table=${hasTableDevice ? 'yes' : 'no'} / kitchen=${hasKitchenDevice ? 'yes' : 'no'}.`,
      ownerAction: 'Assign floor and kitchen device ownership before service rush.',
    },
    {
      id: 'tip-recovery',
      label: 'Tip recovery lock',
      status: pendingTipRecoveries.length === 0 && workspace.shiftReviewLock.status !== 'locked'
        ? 'ready'
        : pendingTipRecoveries.length > 2
          ? 'blocked'
          : 'review',
      detail: `${pendingTipRecoveries.length} tip recovery pending / shift review ${workspace.shiftReviewLock.status}.`,
      ownerAction: pendingTipRecoveries.length
        ? 'Clear pending tip recoveries before releasing shift review lock.'
        : 'Keep shift review lock open only for unresolved payment risk.',
    },
    {
      id: 'role-permissions',
      label: 'Role and approval boundary',
      status: managerReady && cashupOwnerReady ? 'ready' : managerReady || cashupOwnerReady ? 'review' : 'blocked',
      detail: managerReady
        ? `${workspace.managerName} owns the branch day; cash-up owner ${cashupOwnerReady ? 'set' : 'missing'}.`
        : 'Manager or owner is not set for the branch day.',
      ownerAction: 'Name the manager and cash-up owner before enabling writeback or payment status changes.',
    },
    {
      id: 'offline-export',
      label: 'Offline continuity',
      status: offlineGuardrail.isOfflineCaptureActive
        ? offlineGuardrail.dangerousActionsLocked ? 'review' : 'blocked'
        : summary.recordCount > 0 && offlineGuardrail.pendingUploads === 0
          ? 'ready'
          : 'review',
      detail: offlineGuardrail.isOfflineCaptureActive
        ? `Offline capture active / queue lock ${offlineGuardrail.queueLockLevel} / pending uploads ${offlineGuardrail.pendingUploads}.`
        : `Online mode / pending offline uploads ${offlineGuardrail.pendingUploads}.`,
      ownerAction: 'Maintain reconnect deadline, upload queue count, and lock level before close.',
    },
  ]

  const score = Math.round((gates.reduce((sum, gate) => sum + gateWeight(gate.status), 0) / gates.length) * 100)
  const incidentLevel = score >= 86 ? 'green' : score >= 60 ? 'amber' : 'red'
  const branchContext = `${workspace.branchName} / ${workspace.businessDate} / ${workspace.managerName || 'manager missing'}`

  return {
    score,
    label: score >= 86 ? 'Enterprise-ready day pack' : score >= 60 ? 'Closeout review required' : 'Setup blocked before go-live',
    incidentLevel,
    gates,
    aiActions: [
      {
        id: 'daily-close-brief',
        label: 'AI daily-close owner brief',
        source: 'payments, stock, shift handover, menu changes',
        output: 'one owner-ready closeout note with exceptions and proof links',
        approvalRequired: 'owner approves before archive or client send',
      },
      {
        id: 'payment-match',
        label: 'AI settlement matcher',
        source: 'provider payloads, settlement refs, cashier notes',
        output: 'paid, unpaid, duplicate, and reconcile recommendations',
        approvalRequired: 'cash-up owner approves status changes',
      },
      {
        id: 'stock-forecast',
        label: 'AI prep and waste guard',
        source: 'par/current/waste rows and supplier notes',
        output: 'rush-hour prep list and low-stock supplier actions',
        approvalRequired: 'manager approves prep and supplier changes',
      },
      {
        id: 'menu-control',
        label: 'AI menu margin guard',
        source: 'menu source, item prices, promo pressure, payment mix',
        output: 'price-change checklist and QR publish review',
        approvalRequired: 'owner approves public menu publish',
      },
    ],
    ownerBrief: [
      `${summary.paymentReviewCount} payment exception(s), ${summary.partialPaymentCount} partial payment(s), ${summary.refundedPaymentCount} refund record(s).`,
      `${summary.openRegisterCount} open register(s), closed variance ${summary.cashVarianceMmk.toLocaleString()} MMK, ${summary.stockoutRisks} stock risk(s), ${summary.openBlockers} shift blocker(s).`,
      `${pendingApprovals.length} pending approval(s), including ${pendingCloseoutApprovals.length} closeout approval(s), and ${workspace.auditTrail.length} audit record(s).`,
      `${pendingTipRecoveries.length} pending tip recovery item(s), ${transferVariance.length} transfer variance item(s), ${activeDeviceAssignments.length} active device assignments.`,
      paymentSetupReadiness.complete
        ? `Payment setup is staffed for ${workspace.paymentSetup.providerName}.`
        : `Payment setup needs ${paymentSetupReadiness.missing.join(', ') || 'operator review'}.`,
      workspace.menu.items.length
        ? `${workspace.menu.items.length} menu item(s) are structured for QR/menu publish review.`
        : 'Menu source is not structured yet.',
      activeDaypartSchedules.length
        ? `${activeDaypartSchedules.length} daypart schedule window(s) are active.`
        : 'Menu daypart schedule is not configured.',
    ],
    permissionBoundary: [
      'Cashier can create orders, attach provider proof, log cash movement, and mark draft/link issued.',
      'Manager can mark partial/paid/reconcile/refunded after provider evidence is present.',
      'Owner approval is required for price publish, inventory writeback, payment connector changes, exports, and external customer messages.',
    ],
    releaseControls: [
      'Offline local-first mode with daily JSON export.',
      'Offline guardrail requires reconnect deadline, queue lock policy, and pending upload count.',
      'Provider credentials are never stored in browser state.',
      'Cloud agent jobs enqueue only after authenticated workspace login.',
      'Promotion to live branch requires payment setup, menu source, daypart schedule, owner, cash-up owner, register closeout, and day-pack export.',
    ],
    branchContext,
  }
}

export function buildRestaurantMenuSharePayload(workspace: RestaurantOperatingWorkspace) {
  if (typeof window === 'undefined' || !workspace.menu.items.length) {
    return ''
  }
  const payload = {
    branchName: workspace.branchName,
    businessDate: workspace.businessDate,
    orderingMode: workspace.menu.orderingMode,
    items: workspace.menu.items.slice(0, 80),
  }
  const encoded = window.btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
  return encoded.length <= 2600 ? encoded : ''
}

export function parseRestaurantMenuSharePayload(hash: string): {
  branchName: string
  businessDate: string
  orderingMode: RestaurantMenuTransition['orderingMode']
  items: RestaurantMenuItem[]
} | null {
  const match = hash.match(/(?:^#|&)data=([^&]+)/)
  if (!match || typeof window === 'undefined') {
    return null
  }
  try {
    const decoded = decodeURIComponent(match[1])
    const parsed = JSON.parse(decodeURIComponent(escape(window.atob(decoded)))) as {
      branchName?: string
      businessDate?: string
      orderingMode?: RestaurantMenuTransition['orderingMode']
      items?: RestaurantMenuItem[]
    }
    return {
      branchName: String(parsed.branchName || 'Restaurant menu'),
      businessDate: String(parsed.businessDate || ''),
      orderingMode: parsed.orderingMode === 'order-request' ? 'order-request' : 'digital-menu',
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return null
  }
}

export function buildRestaurantMenuHtml(workspace: RestaurantOperatingWorkspace, qrDataUrl = '') {
  const sections = new Map<string, RestaurantMenuItem[]>()
  for (const item of workspace.menu.items) {
    sections.set(item.section, [...(sections.get(item.section) ?? []), item])
  }
  const menuRows = [...sections.entries()]
    .map(([section, items]) => `
      <section>
        <h2>${escapeHtml(section)}</h2>
        ${items
          .map(
            (item) => `
              <article>
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
                </div>
                <span>${escapeHtml(item.price.toLocaleString())}</span>
              </article>
            `,
          )
          .join('')}
      </section>
    `)
    .join('')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(workspace.branchName)} Menu</title>
  <style>
    body{font-family:Inter,system-ui,sans-serif;background:#fbf7ef;color:#211a14;margin:0;padding:40px}
    main{max-width:780px;margin:0 auto;background:#fffdf8;border:1px solid #eadfcd;border-radius:28px;padding:32px}
    header{display:flex;gap:24px;align-items:center;justify-content:space-between;border-bottom:1px solid #eadfcd;padding-bottom:20px;margin-bottom:24px}
    h1{font-size:42px;line-height:1;margin:0} h2{margin:28px 0 12px;font-size:18px;text-transform:uppercase;letter-spacing:.14em;color:#8a5b24}
    article{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #eee2d2;padding:14px 0}
    p{margin:6px 0 0;color:#6b6258} span{font-weight:800;white-space:nowrap}
    img{width:112px;height:112px;border:8px solid #fff;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    .mode{display:inline-flex;border:1px solid #eadfcd;border-radius:999px;padding:7px 12px;color:#6b6258;font-size:12px;text-transform:uppercase;letter-spacing:.12em}
    @media print{body{background:#fff;padding:0}main{border:0;border-radius:0}}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <span class="mode">${workspace.menu.orderingMode === 'order-request' ? 'Order request' : 'Digital menu'}</span>
        <h1>${escapeHtml(workspace.branchName)}</h1>
        <p>${escapeHtml(workspace.businessDate)}</p>
      </div>
      ${qrDataUrl ? `<img alt="Menu QR code" src="${escapeHtml(qrDataUrl)}" />` : ''}
    </header>
    ${menuRows || '<p>No menu items yet.</p>'}
  </main>
</body>
</html>`
}
