import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { RESTAURANT_MODULE_CONTRACTS } from '../lib/portalModuleContracts'
import { type PosModuleContract, type PosUserRole, validatePosManagerOverridePin } from '../lib/posAuth'
import type { PosStaffMember } from '../lib/posStaffDirectory'
import { hasLiveWorkspaceApi, runAgentJob } from '../lib/workspaceApi'
import {
  appendRestaurantCashMovement,
  appendRestaurantGuest,
  appendRestaurantInventoryTransfer,
  appendRestaurantKitchenTicket,
  appendRestaurantMenuDaypartSchedule,
  appendRestaurantPayment,
  appendRestaurantPromo,
  appendRestaurantServiceDeviceAssignment,
  appendRestaurantApprovalRequest,
  appendRestaurantAuditRecord,
  appendRestaurantShift,
  appendRestaurantStock,
  appendRestaurantTable,
  appendRestaurantTipRecovery,
  buildRestaurantCloseoutSummaryText,
  buildRestaurantEnterpriseControl,
  buildRestaurantGoLiveChecklist,
  buildRestaurantMmqrSetupChecklist,
  buildRestaurantMenuHtml,
  buildRestaurantMenuUrl,
  buildRestaurantPaymentQrValue,
  buildRestaurantPaymentReconciliationText,
  closeRestaurantRegisterSession,
  clearRestaurantWorkspace,
  createDefaultRestaurantWorkspace,
  getRestaurantPaymentLink,
  getRestaurantPaymentReadiness,
  getRestaurantPaymentSetupReadiness,
  getRestaurantOperatingSummary,
  getRestaurantQueue,
  getRestaurantActiveMenuDaypart,
  loadRestaurantWorkspace,
  removeRestaurantServiceDeviceAssignment,
  openRestaurantRegisterSession,
  saveRestaurantWorkspace,
  setRestaurantShiftReviewLock,
  serializeRestaurantWorkspace,
  updateRestaurantMenu,
  updateRestaurantMenuDaypartSchedule,
  updateRestaurantKitchenTicketStatus,
  updateRestaurantInventoryTransfer,
  updateRestaurantOfflineGuardrail,
  updateRestaurantPaymentSetup,
  updateRestaurantPaymentStatus,
  updateRestaurantProfile,
  updateRestaurantTableStatus,
  updateRestaurantApprovalStatus,
  updateRestaurantTipRecovery,
  type RestaurantCashMovementType,
  type RestaurantDaypart,
  type RestaurantServiceDeviceType,
  type RestaurantServiceLaneType,
  type RestaurantKitchenTicketPriority,
  type RestaurantKitchenTicketStatus,
  type RestaurantMenuSource,
  type RestaurantOperatingWorkspace,
  type RestaurantApprovalActionType,
  type RestaurantApprovalStatus,
  type RestaurantAuditSeverity,
  type RestaurantPaymentStatus,
  type RestaurantPaymentTender,
  type RestaurantPaymentRecord,
  type RestaurantKitchenTicketRecord,
  type RestaurantStockRecord,
  type RestaurantTableRecord,
  type RestaurantTableStatus,
  type RestaurantTipRecoveryStatus,
  type RestaurantTransferStatus,
} from '../lib/restaurantOperatingSystem'

export type ActiveModule = 'enterprise' | 'shift' | 'stock' | 'guest' | 'margin' | 'payment' | 'tables' | 'kitchen' | 'approvals' | 'qr-menu'

const moduleMap: Record<ActiveModule, string> = {
  enterprise: 'restaurant-enterprise-control',
  shift: 'restaurant-shift-control',
  stock: 'restaurant-prep-stock',
  guest: 'restaurant-guest-recovery',
  margin: 'restaurant-margin-brief',
  payment: 'restaurant-pos-payment-control',
  tables: 'restaurant-table-floor-control',
  kitchen: 'restaurant-kitchen-sla-board',
  approvals: 'restaurant-approval-control',
  'qr-menu': 'restaurant-qr-menu-transition',
}

const moduleTabs: Array<{ id: ActiveModule; label: string }> = [
  { id: 'enterprise', label: 'AI control' },
  { id: 'payment', label: 'Orders & payments' },
  { id: 'tables', label: 'Tables' },
  { id: 'kitchen', label: 'Kitchen SLA' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'shift', label: 'Shift' },
  { id: 'stock', label: 'Stock' },
  { id: 'guest', label: 'Guest recovery' },
  { id: 'margin', label: 'Margin' },
  { id: 'qr-menu', label: 'Menu' },
]

const allModules = Object.keys(moduleMap) as ActiveModule[]
const moduleFallbackContracts: Record<ActiveModule, { name: string; job: string }> = {
  enterprise: {
    name: 'Enterprise AI control center',
    job: 'Govern payment proof, menu publishing, stock risk, cash-up ownership, and AI actions before go-live.',
  },
  payment: {
    name: 'POS payment control',
    job: 'Capture order proof, split tenders, and settlement notes before cash-up.',
  },
  tables: {
    name: 'Table and floor control',
    job: 'Track table states, floor zones, and bill-request alerts for service timing.',
  },
  kitchen: {
    name: 'Kitchen SLA ticket board',
    job: 'Track kitchen ticket station, target-ready time, and delay risk before service misses.',
  },
  approvals: {
    name: 'Approval control',
    job: 'Route void, discount, service-charge, refund, and closeout requests through manager approval before archive.',
  },
  shift: {
    name: 'Shift control',
    job: 'Run opening-to-close checkpoints with handover and blocker notes.',
  },
  stock: {
    name: 'Stock and prep control',
    job: 'Capture par, current stock, waste, and supplier issue actions.',
  },
  guest: {
    name: 'Guest recovery control',
    job: 'Capture issue, owner, recovery path, and closure status with proof.',
  },
  margin: {
    name: 'Margin brief',
    job: 'Evaluate promos against sales lift, food pressure, and labor pressure.',
  },
  'qr-menu': {
    name: 'Menu publish lane',
    job: 'Build and export customer QR menu output with source evidence.',
  },
}

type QrCodeModule = typeof import('qrcode')
type XlsxModule = typeof import('xlsx')

let qrCodeModulePromise: Promise<QrCodeModule> | null = null
let xlsxModulePromise: Promise<XlsxModule> | null = null

function loadQrCodeModule() {
  if (!qrCodeModulePromise) {
    qrCodeModulePromise = import('qrcode')
  }
  return qrCodeModulePromise
}

function loadXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx')
  }
  return xlsxModulePromise
}

type RestaurantOperatingSystemPageProps = {
  allowedModules?: ActiveModule[]
  initialModule?: ActiveModule
  moduleLabelOverrides?: Partial<Record<ActiveModule, string>>
  moduleContractOverrides?: Partial<Record<ActiveModule, PosModuleContract>>
  workspaceScopeKey?: string
  workspaceTitle?: string
  posRole?: PosUserRole | null
  readOnly?: boolean
  canExportExcel?: boolean
  canExportJson?: boolean
  canResetWorkspace?: boolean
  canRunAiActions?: boolean
  staffDirectory?: PosStaffMember[]
  defaultBranchName?: string
}

function numberInputValue(value: FormDataEntryValue | null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function slugify(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function isLegacySeedBranchName(value: string) {
  const token = value.trim().toLowerCase()
  if (!token) {
    return false
  }
  if (token === 'main branch') {
    return true
  }
  return token.includes('golden plate')
    || token.includes('lotus spa')
    || token.includes('north retail')
    || token.includes('restaurant demo')
    || token.includes('spa demo')
    || token.includes('retail demo')
}

function buildWorkspaceExportBaseName(workspace: RestaurantOperatingWorkspace) {
  const branchSlug =
    workspace.branchName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'restaurant-os'
  return `${branchSlug}-${workspace.businessDate}`
}

function detectCompactRestaurantViewport() {
  if (typeof window === 'undefined') {
    return false
  }
  const visualWidth = window.visualViewport?.width || window.innerWidth
  const visualHeight = window.visualViewport?.height || window.innerHeight
  const screenShortEdge = Math.min(window.screen.width || visualWidth, window.screen.height || visualHeight)
  const shortEdge = Math.min(visualWidth, visualHeight, screenShortEdge)
  const widthMatch = window.matchMedia('(max-width: 900px)').matches
  const touchMatch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  return widthMatch || shortEdge <= 820 || (touchMatch && shortEdge <= 1366)
}

function syncCompactRestaurantViewportFlag(setCompactViewport: (value: boolean) => void) {
  if (typeof window === 'undefined') {
    return
  }
  const visualWidth = window.visualViewport?.width || window.innerWidth
  const visualHeight = window.visualViewport?.height || window.innerHeight
  const screenShortEdge = Math.min(window.screen.width || visualWidth, window.screen.height || visualHeight)
  const shortEdge = Math.min(visualWidth, visualHeight, screenShortEdge)
  const widthMatch = window.matchMedia('(max-width: 900px)').matches
  const touchMatch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  setCompactViewport(widthMatch || shortEdge <= 820 || (touchMatch && shortEdge <= 1366))
}

type SplitCoverageRow = {
  groupKey: string
  orderRef: string
  tableName: string
  lineCount: number
  expectedMmk: number
  collectedMmk: number
  refundedMmk: number
  remainingMmk: number
  seatLabels: string
  statuses: string
}

type StockReorderRow = {
  itemName: string
  par: number
  current: number
  waste: number
  deficit: number
  reorderQty: number
  urgency: 'high' | 'medium'
  supplierIssue: string
  action: string
}

function buildSplitCoverageRowsFromPayments(payments: RestaurantPaymentRecord[]): SplitCoverageRow[] {
  const grouped = new Map<string, {
    orderRef: string
    tableName: string
    lineCount: number
    expectedMmk: number
    collectedMmk: number
    refundedMmk: number
    seatLabels: Set<string>
    statuses: Set<string>
  }>()

  for (const payment of payments) {
    const groupKey = payment.splitGroup.trim() || payment.orderRef.trim()
    if (!groupKey) {
      continue
    }
    const current = grouped.get(groupKey) ?? {
      orderRef: payment.orderRef.trim(),
      tableName: payment.tableName.trim(),
      lineCount: 0,
      expectedMmk: 0,
      collectedMmk: 0,
      refundedMmk: 0,
      seatLabels: new Set<string>(),
      statuses: new Set<string>(),
    }
    current.lineCount += 1
    current.expectedMmk += payment.amountMmk
    current.collectedMmk += payment.collectedMmk
    current.refundedMmk += payment.refundedMmk
    if (payment.seatLabel.trim()) {
      current.seatLabels.add(payment.seatLabel.trim())
    }
    if (payment.status.trim()) {
      current.statuses.add(payment.status.trim())
    }
    if (!current.orderRef && payment.orderRef.trim()) {
      current.orderRef = payment.orderRef.trim()
    }
    if (!current.tableName && payment.tableName.trim()) {
      current.tableName = payment.tableName.trim()
    }
    grouped.set(groupKey, current)
  }

  return [...grouped.entries()]
    .map(([groupKey, row]) => {
      const remainingMmk = Math.max(0, row.expectedMmk - row.collectedMmk + row.refundedMmk)
      return {
        groupKey,
        orderRef: row.orderRef || groupKey,
        tableName: row.tableName || '',
        lineCount: row.lineCount,
        expectedMmk: row.expectedMmk,
        collectedMmk: row.collectedMmk,
        refundedMmk: row.refundedMmk,
        remainingMmk,
        seatLabels: [...row.seatLabels].join(', '),
        statuses: [...row.statuses].join(', '),
      }
    })
    .sort((a, b) => b.remainingMmk - a.remainingMmk || b.lineCount - a.lineCount || b.expectedMmk - a.expectedMmk)
}

function buildStockReorderRows(stock: RestaurantStockRecord[]): StockReorderRow[] {
  return stock
    .map((item) => {
      const deficit = Math.max(0, item.par - item.current)
      const reorderQty = Math.max(0, deficit + Math.max(0, item.waste))
      if (reorderQty <= 0) {
        return null
      }
      const urgency = deficit >= Math.ceil(item.par * 0.5) || item.current <= 0 || item.supplierIssue.trim() ? 'high' : 'medium'
      return {
        itemName: item.itemName,
        par: item.par,
        current: item.current,
        waste: item.waste,
        deficit,
        reorderQty,
        urgency,
        supplierIssue: item.supplierIssue,
        action: item.action,
      }
    })
    .filter((item): item is StockReorderRow => Boolean(item))
    .sort((a, b) => b.reorderQty - a.reorderQty || a.itemName.localeCompare(b.itemName))
}

function exportWorkspace(workspace: RestaurantOperatingWorkspace) {
  if (typeof window === 'undefined') {
    return
  }
  const blob = new Blob([serializeRestaurantWorkspace(workspace)], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `${buildWorkspaceExportBaseName(workspace)}.json`
  link.click()
  window.URL.revokeObjectURL(url)
}

async function exportWorkspaceExcel(workspace: RestaurantOperatingWorkspace, staffDirectory: PosStaffMember[] = []) {
  const { utils: xlsxUtils, writeFileXLSX } = await loadXlsxModule()
  const summary = getRestaurantOperatingSummary(workspace)
  const queue = getRestaurantQueue(workspace)
  const splitCoverageRows = buildSplitCoverageRowsFromPayments(workspace.payments)
  const stockReorderRows = buildStockReorderRows(workspace.stock)
  const closeoutSummary = buildRestaurantCloseoutSummaryText(workspace)
  const goLiveChecklist = buildRestaurantGoLiveChecklist(workspace)
  const workbook = xlsxUtils.book_new()
  const fallbackRow = [{ note: 'No records yet.' }]
  const appendSheet = (name: string, rows: Array<Record<string, string | number>>) => {
    const sheet = xlsxUtils.json_to_sheet(rows.length ? rows : fallbackRow)
    xlsxUtils.book_append_sheet(workbook, sheet, name)
  }

  appendSheet('Summary', [
    { metric: 'Branch', value: workspace.branchName },
    { metric: 'Manager', value: workspace.managerName || 'not set' },
    { metric: 'Business date', value: workspace.businessDate },
    { metric: 'Readiness score', value: `${buildRestaurantEnterpriseControl(workspace).score}%` },
    { metric: 'Open blockers', value: summary.openBlockers },
    { metric: 'Stock risks', value: summary.stockoutRisks },
    { metric: 'Waste units', value: summary.wasteUnits },
    { metric: 'Guest issues open', value: summary.guestIssuesOpen },
    { metric: 'Promos needing review', value: summary.promosNeedingDecision },
    { metric: 'Menu items', value: summary.menuItems },
    { metric: 'Payment review count', value: summary.paymentReviewCount },
    { metric: 'Payment review value (MMK)', value: summary.paymentReviewValueMmk },
    { metric: 'Partial payments', value: summary.partialPaymentCount },
    { metric: 'Refund records', value: summary.refundedPaymentCount },
    { metric: 'Table alerts', value: summary.tableServiceAlerts },
    { metric: 'Kitchen delayed tickets', value: summary.kitchenDelayedCount },
    { metric: 'Pending approvals', value: summary.pendingApprovalCount },
    { metric: 'Pending tip recovery', value: summary.tipRecoveryPendingCount },
    { metric: 'Transfer variance count', value: summary.transferVarianceCount },
    { metric: 'Offline pending uploads', value: summary.offlinePendingUploadCount },
    { metric: 'Active device assignments', value: summary.deviceCoverageCount },
    { metric: 'Active daypart schedules', value: workspace.menuDaypartSchedules.filter((item) => item.active).length },
    { metric: 'Split checks', value: splitCoverageRows.filter((item) => item.lineCount > 1).length },
    { metric: 'Open registers', value: summary.openRegisterCount },
    { metric: 'Cash variance (MMK)', value: summary.cashVarianceMmk },
    { metric: 'Audit entries', value: workspace.auditTrail.length },
    { metric: 'Total records', value: summary.recordCount },
    { metric: 'Exported at', value: new Date().toISOString() },
  ])

  appendSheet(
    'CloseoutSummary',
    closeoutSummary.split('\n').map((line, index) => ({
      line: index + 1,
      text: line,
    })),
  )

  appendSheet(
    'GoLiveChecklist',
    goLiveChecklist.map((item) => ({
      control: item.control,
      status: item.status,
      owner: item.owner,
      detail: item.detail,
    })),
  )

  appendSheet(
    'Queue',
    queue.map((item) => ({
      created_at: item.createdAt,
      title: item.title,
      route: item.route,
      priority: item.priority,
      detail: item.detail,
    })),
  )

  appendSheet(
    'Payments',
    workspace.payments.map((payment) => ({
      created_at: payment.createdAt,
      order_ref: payment.orderRef,
      table_name: payment.tableName,
      amount_mmk: payment.amountMmk,
      provider: payment.provider,
      tender_type: payment.tenderType,
      status: payment.status,
      split_group: payment.splitGroup,
      collected_mmk: payment.collectedMmk,
      refunded_mmk: payment.refundedMmk,
      tip_mmk: payment.tipMmk,
      change_given_mmk: payment.changeGivenMmk,
      item_summary: payment.itemSummary,
      settlement_ref: payment.settlementRef,
      proof_note: payment.proofNote,
      review_note: payment.note,
      seat_label: payment.seatLabel,
      customer_name: payment.customerName,
      customer_phone: payment.customerPhone,
      verified_by: payment.verifiedBy,
      paid_at: payment.paidAt,
      payment_payload: payment.paymentPayload,
    })),
  )

  appendSheet(
    'Tables',
    workspace.tables.map((table) => ({
      table_name: table.tableName,
      floor_zone: table.floorZone,
      seats: table.seats,
      guest_count: table.guestCount,
      status: table.status,
      order_ref: table.orderRef,
      assigned_server: table.assignedServer,
      note: table.note,
      created_at: table.createdAt,
      updated_at: table.updatedAt,
    })),
  )

  appendSheet(
    'KitchenTickets',
    workspace.kitchenTickets.map((ticket) => ({
      order_ref: ticket.orderRef,
      table_name: ticket.tableName,
      station: ticket.station,
      item_summary: ticket.itemSummary,
      target_ready_at: ticket.targetReadyAt,
      status: ticket.status,
      priority: ticket.priority,
      owner: ticket.owner,
      note: ticket.note,
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
    })),
  )

  appendSheet(
    'Approvals',
    workspace.approvals.map((approval) => ({
      order_ref: approval.orderRef,
      table_name: approval.tableName,
      action_type: approval.actionType,
      reason: approval.reason,
      amount_mmk: approval.amountMmk,
      requested_by: approval.requestedBy,
      approved_by: approval.approvedBy,
      status: approval.status,
      note: approval.note,
      created_at: approval.createdAt,
      updated_at: approval.updatedAt,
    })),
  )

  appendSheet(
    'RegisterSessions',
    workspace.registerSessions.map((session) => ({
      register_id: session.registerId,
      owner: session.owner,
      status: session.status,
      opening_float_mmk: session.openingFloatMmk,
      expected_cash_mmk: session.expectedCashMmk,
      counted_cash_mmk: session.countedCashMmk,
      variance_mmk: session.varianceMmk,
      opened_at: session.openedAt,
      closed_at: session.closedAt,
      close_note: session.closeNote,
    })),
  )

  appendSheet(
    'CashMovements',
    workspace.cashMovements.map((item) => ({
      created_at: item.createdAt,
      register_id: item.registerId,
      type: item.type,
      amount_mmk: item.amountMmk,
      reason_code: item.reasonCode,
      owner: item.owner,
      note: item.note,
    })),
  )

  appendSheet(
    'AuditTrail',
    workspace.auditTrail.map((entry) => ({
      created_at: entry.createdAt,
      event: entry.event,
      detail: entry.detail,
      actor: entry.actor,
      actor_role: entry.actorRole,
      severity: entry.severity,
    })),
  )

  appendSheet(
    'Stock',
    workspace.stock.map((item) => ({
      created_at: item.createdAt,
      item_name: item.itemName,
      par: item.par,
      current: item.current,
      waste: item.waste,
      supplier_issue: item.supplierIssue,
      next_action: item.action,
    })),
  )

  appendSheet(
    'ReorderPlan',
    stockReorderRows.map((item) => ({
      item_name: item.itemName,
      urgency: item.urgency,
      reorder_qty: item.reorderQty,
      deficit: item.deficit,
      par: item.par,
      current: item.current,
      waste: item.waste,
      supplier_issue: item.supplierIssue,
      action: item.action,
    })),
  )

  appendSheet(
    'Shifts',
    workspace.shifts.map((item) => ({
      created_at: item.createdAt,
      daypart: item.daypart,
      status: item.status,
      branch_name: item.branchName,
      manager_name: item.managerName,
      blocker: item.blocker,
      handover: item.handover,
    })),
  )

  appendSheet(
    'Guests',
    workspace.guests.map((item) => ({
      created_at: item.createdAt,
      channel: item.channel,
      status: item.status,
      issue: item.issue,
      recovery: item.recovery,
      owner: item.owner,
      branch_name: item.branchName,
    })),
  )

  appendSheet(
    'Promos',
    workspace.promos.map((item) => ({
      created_at: item.createdAt,
      promo_name: item.promoName,
      decision: item.decision,
      sales_lift_pct: item.salesLift,
      food_cost_pressure_pct: item.foodCostPressure,
      labor_pressure_pct: item.laborPressure,
      owner: item.owner,
      branch_name: item.branchName,
    })),
  )

  appendSheet(
    'Menu',
    workspace.menu.items.map((item) => ({
      section: item.section,
      name: item.name,
      price: item.price,
      description: item.description,
      ordering_mode: workspace.menu.orderingMode,
      menu_slug: workspace.menu.publicSlug,
      updated_at: workspace.menu.updatedAt,
    })),
  )

  appendSheet('PaymentSetup', [
    {
      provider_name: workspace.paymentSetup.providerName,
      merchant_name: workspace.paymentSetup.merchantName,
      merchant_id: workspace.paymentSetup.merchantId,
      branch_code: workspace.paymentSetup.branchCode,
      settlement_account_masked: workspace.paymentSetup.settlementAccountMasked,
      settlement_export_format: workspace.paymentSetup.settlementExportFormat,
      cashup_owner: workspace.paymentSetup.cashupOwner,
      enabled_at: workspace.paymentSetup.enabledAt,
    },
  ])

  appendSheet(
    'StaffDirectory',
    staffDirectory.map((member) => ({
      staff_name: member.displayName,
      role: member.role,
      location_id: member.locationId,
      location_label: member.locationLabel,
      status: member.status,
      pin_hint: member.pinHint,
      pin_updated_at: member.pinUpdatedAt,
      note: member.note,
      created_at: member.createdAt,
      updated_at: member.updatedAt,
    })),
  )

  appendSheet(
    'OfflineGuardrail',
    [
      {
        offline_capture_active: workspace.offlineGuardrail.isOfflineCaptureActive ? 'yes' : 'no',
        reconnect_deadline_at: workspace.offlineGuardrail.reconnectDeadlineAt,
        reconnect_owner: workspace.offlineGuardrail.reconnectOwner,
        queue_lock_level: workspace.offlineGuardrail.queueLockLevel,
        pending_uploads: workspace.offlineGuardrail.pendingUploads,
        pending_critical_actions: workspace.offlineGuardrail.pendingCriticalActions,
        dangerous_actions_locked: workspace.offlineGuardrail.dangerousActionsLocked ? 'yes' : 'no',
        last_online_at: workspace.offlineGuardrail.lastOnlineAt,
        updated_at: workspace.offlineGuardrail.updatedAt,
      },
    ],
  )

  appendSheet(
    'TipRecovery',
    workspace.tipRecoveries.map((item) => ({
      order_ref: item.orderRef,
      staff_name: item.staffName,
      expected_tip_mmk: item.expectedTipMmk,
      recovered_tip_mmk: item.recoveredTipMmk,
      status: item.status,
      note: item.note,
      created_at: item.createdAt,
      resolved_at: item.resolvedAt,
    })),
  )

  appendSheet(
    'StockTransfers',
    workspace.inventoryTransfers.map((item) => ({
      item_name: item.itemName,
      from_location: item.fromLocation,
      to_location: item.toLocation,
      requested_qty: item.requestedQty,
      dispatched_qty: item.dispatchedQty,
      received_qty: item.receivedQty,
      status: item.status,
      requested_by: item.requestedBy,
      dispatched_by: item.dispatchedBy,
      received_by: item.receivedBy,
      variance_note: item.varianceNote,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    })),
  )

  appendSheet(
    'ServiceDevices',
    workspace.serviceDevices.map((item) => ({
      lane_type: item.laneType,
      lane_ref: item.laneRef,
      station: item.station,
      device_label: item.deviceLabel,
      device_type: item.deviceType,
      owner: item.owner,
      status: item.status,
      note: item.note,
      updated_at: item.updatedAt,
    })),
  )

  appendSheet(
    'MenuSchedule',
    workspace.menuDaypartSchedules.map((item) => ({
      daypart: item.daypart,
      start_time: item.startTime,
      end_time: item.endTime,
      menu_label: item.menuLabel,
      active: item.active ? 'yes' : 'no',
      updated_by: item.updatedBy,
      updated_at: item.updatedAt,
    })),
  )

  writeFileXLSX(workbook, `${buildWorkspaceExportBaseName(workspace)}.xlsx`, { compression: true })
}

function formatTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'now'
  }
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatMmk(value: number) {
  return `${Math.round(value).toLocaleString()} MMK`
}

function toMinuteOfDay(value: string) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }
  return hours * 60 + minutes
}

function getTableTimerBand(ageMinutes: number, yellowAfter: number, redAfter: number): 'green' | 'yellow' | 'red' {
  if (ageMinutes >= redAfter) {
    return 'red'
  }
  if (ageMinutes >= yellowAfter) {
    return 'yellow'
  }
  return 'green'
}

function resolveTableAgeMinutes(table: RestaurantTableRecord, nowMs: number) {
  const start = new Date(table.createdAt).getTime()
  if (Number.isNaN(start)) {
    return 0
  }
  return Math.max(0, Math.floor((nowMs - start) / 60000))
}

function resolveKitchenLateMinutes(ticket: RestaurantKitchenTicketRecord, now: Date) {
  const targetMinute = toMinuteOfDay(ticket.targetReadyAt)
  if (targetMinute === null) {
    return 0
  }
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  return Math.max(0, nowMinute - targetMinute)
}

function buildOrderCoverageMap(workspace: RestaurantOperatingWorkspace) {
  const map = new Map<string, { expected: number; collected: number; refunded: number }>()
  for (const payment of workspace.payments) {
    const key = payment.orderRef.trim() || payment.splitGroup.trim()
    if (!key) {
      continue
    }
    const current = map.get(key) ?? { expected: 0, collected: 0, refunded: 0 }
    current.expected += payment.amountMmk
    current.collected += payment.collectedMmk
    current.refunded += payment.refundedMmk
    map.set(key, current)
  }
  return map
}

export function RestaurantOperatingSystemPage({
  allowedModules,
  initialModule,
  moduleLabelOverrides,
  moduleContractOverrides,
  workspaceScopeKey,
  workspaceTitle = 'Restaurant POS + Inventory',
  posRole = null,
  readOnly = false,
  canExportExcel = true,
  canExportJson = true,
  canResetWorkspace = true,
  canRunAiActions = true,
  staffDirectory = [],
  defaultBranchName = '',
}: RestaurantOperatingSystemPageProps = {}) {
  const roleModules = useMemo(() => {
    const requested = Array.isArray(allowedModules)
      ? allowedModules.filter((module): module is ActiveModule => allModules.includes(module))
      : []
    const base = requested.length ? requested : allModules
    const ordered = allModules.filter((module) => base.includes(module))
    return ordered.length ? ordered : allModules
  }, [allowedModules])
  const safeInitialModule = useMemo(() => {
    if (initialModule && roleModules.includes(initialModule)) {
      return initialModule
    }
    if (roleModules.includes('enterprise')) {
      return 'enterprise'
    }
    return roleModules[0] ?? 'enterprise'
  }, [initialModule, roleModules])
  const visibleTabs = useMemo(
    () =>
      moduleTabs
        .filter((item) => roleModules.includes(item.id))
        .map((item) => ({
          ...item,
          label: moduleLabelOverrides?.[item.id] || item.label,
        })),
    [moduleLabelOverrides, roleModules],
  )
  const [workspace, setWorkspace] = useState<RestaurantOperatingWorkspace>(() => loadRestaurantWorkspace(workspaceScopeKey))
  const [activeModule, setActiveModule] = useState<ActiveModule>(() => {
    if (detectCompactRestaurantViewport() && safeInitialModule === 'enterprise') {
      return roleModules.includes('payment') ? 'payment' : safeInitialModule
    }
    return safeInitialModule
  })
  const [message, setMessage] = useState('Order proof, stock risk, closeout.')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [tableYellowAfterMinutes, setTableYellowAfterMinutes] = useState(20)
  const [tableRedAfterMinutes, setTableRedAfterMinutes] = useState(40)
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState<'all' | 'active' | 'delayed' | 'rush'>('all')
  const [kitchenStationFilter, setKitchenStationFilter] = useState('all')
  const [menuSourceText, setMenuSourceText] = useState(() => workspace.menu.sourceText)
  const [menuSourceFiles, setMenuSourceFiles] = useState<RestaurantMenuSource[]>(() => workspace.menu.sourceFiles)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [paymentQrDataUrl, setPaymentQrDataUrl] = useState('')
  const [menuAgentBusy, setMenuAgentBusy] = useState(false)
  const [paymentAgentBusy, setPaymentAgentBusy] = useState(false)
  const [excelExportBusy, setExcelExportBusy] = useState(false)
  const [isBrowserOnline, setIsBrowserOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [compactViewport, setCompactViewport] = useState(() => detectCompactRestaurantViewport())
  const [activeWorkspacePanel, setActiveWorkspacePanel] = useState<'capture' | 'queue'>(
    detectCompactRestaurantViewport() ? 'queue' : 'capture',
  )
  const canEdit = !readOnly
  const canApproveOrReject =
    posRole === null ||
    posRole === undefined ||
    posRole === 'owner' ||
    posRole === 'manager'
  const summary = useMemo(() => getRestaurantOperatingSummary(workspace), [workspace])
  const queue = useMemo(() => getRestaurantQueue(workspace), [workspace])
  const enterpriseControl = useMemo(() => buildRestaurantEnterpriseControl(workspace), [workspace])
  const activeContract = useMemo(() => {
    const override = moduleContractOverrides?.[activeModule]
    if (override?.name && override?.job) {
      return override
    }
    return RESTAURANT_MODULE_CONTRACTS.find((item) => item.id === moduleMap[activeModule]) ?? moduleFallbackContracts[activeModule]
  }, [activeModule, moduleContractOverrides])
  const compactContractHint = useMemo(() => {
    const firstSentence = String(activeContract?.job || '').split('.').map((line) => line.trim()).filter(Boolean)[0]
    return firstSentence || String(activeContract?.job || '')
  }, [activeContract])
  const menuUrl = useMemo(() => buildRestaurantMenuUrl(workspace), [workspace])
  const latestPayment = workspace.payments[0] ?? null
  const latestPaymentQrValue = useMemo(() => buildRestaurantPaymentQrValue(workspace, latestPayment), [workspace, latestPayment])
  const latestPaymentReadiness = useMemo(() => getRestaurantPaymentReadiness(latestPayment, workspace), [latestPayment, workspace])
  const latestPaymentLink = useMemo(() => getRestaurantPaymentLink(latestPayment), [latestPayment])
  const paymentSetupReadiness = useMemo(() => getRestaurantPaymentSetupReadiness(workspace), [workspace])
  const paymentSetupChecklist = useMemo(() => buildRestaurantMmqrSetupChecklist(workspace), [workspace])
  const paymentReconciliationText = useMemo(() => buildRestaurantPaymentReconciliationText(workspace), [workspace])
  const closeoutSummaryText = useMemo(() => buildRestaurantCloseoutSummaryText(workspace), [workspace])
  const orderCoverage = useMemo(() => buildOrderCoverageMap(workspace), [workspace])
  const splitCoverageRows = useMemo(() => buildSplitCoverageRowsFromPayments(workspace.payments), [workspace.payments])
  const stockReorderRows = useMemo(() => buildStockReorderRows(workspace.stock), [workspace.stock])
  const activeRegisterSession = useMemo(
    () => workspace.registerSessions.find((session) => session.status === 'open') ?? null,
    [workspace.registerSessions],
  )
  const closedRegisterVarianceMmk = useMemo(
    () => workspace.registerSessions.filter((session) => session.status === 'closed').reduce((sum, session) => sum + session.varianceMmk, 0),
    [workspace.registerSessions],
  )
  const todaySalesMmk = useMemo(
    () =>
      workspace.payments.reduce((sum, payment) => {
        const collected = payment.status === 'paid' || payment.status === 'partial' ? payment.collectedMmk : 0
        return sum + collected - payment.refundedMmk
      }, 0),
    [workspace.payments],
  )
  const openTables = useMemo(
    () => workspace.tables.filter((table) => table.status !== 'paid' && table.status !== 'reset').length,
    [workspace.tables],
  )
  const tableServiceRows = useMemo(
    () =>
      workspace.tables.map((table) => {
        const ageMinutes = resolveTableAgeMinutes(table, nowMs)
        const band = getTableTimerBand(ageMinutes, tableYellowAfterMinutes, tableRedAfterMinutes)
        return { table, ageMinutes, band }
      }),
    [workspace.tables, nowMs, tableYellowAfterMinutes, tableRedAfterMinutes],
  )
  const tableIndicatorCounts = useMemo(() => {
    return tableServiceRows.reduce(
      (acc, row) => {
        const band = row.band as keyof typeof acc
        acc[band] += 1
        return acc
      },
      { green: 0, yellow: 0, red: 0 },
    )
  }, [tableServiceRows])
  const kitchenActiveTickets = useMemo(
    () => workspace.kitchenTickets.filter((ticket) => ticket.status !== 'served').length,
    [workspace.kitchenTickets],
  )
  const kitchenStations = useMemo(() => {
    return [...new Set(workspace.kitchenTickets.map((ticket) => ticket.station).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [workspace.kitchenTickets])
  const kitchenRows = useMemo(() => {
    const now = new Date(nowMs)
    return workspace.kitchenTickets.map((ticket) => {
      const lateMinutes = resolveKitchenLateMinutes(ticket, now)
      return { ticket, lateMinutes }
    })
  }, [workspace.kitchenTickets, nowMs])
  const kitchenVisibleRows = useMemo(() => {
    return kitchenRows.filter(({ ticket }) => {
      if (kitchenStationFilter !== 'all' && ticket.station !== kitchenStationFilter) {
        return false
      }
      if (kitchenStatusFilter === 'active') {
        return ticket.status !== 'served'
      }
      if (kitchenStatusFilter === 'delayed') {
        return ticket.status === 'delayed'
      }
      if (kitchenStatusFilter === 'rush') {
        return ticket.priority === 'rush'
      }
      return true
    })
  }, [kitchenRows, kitchenStatusFilter, kitchenStationFilter])
  const pendingApprovalValueMmk = useMemo(
    () =>
      workspace.approvals
        .filter((approval) => approval.status === 'pending')
        .reduce((sum, approval) => sum + approval.amountMmk, 0),
    [workspace.approvals],
  )
  const pendingTipRecoveryItems = useMemo(
    () => workspace.tipRecoveries.filter((item) => item.status === 'pending'),
    [workspace.tipRecoveries],
  )
  const transferVarianceItems = useMemo(
    () => workspace.inventoryTransfers.filter((item) => item.status === 'variance'),
    [workspace.inventoryTransfers],
  )
  const transferInFlightItems = useMemo(
    () => workspace.inventoryTransfers.filter((item) => item.status === 'requested' || item.status === 'dispatched'),
    [workspace.inventoryTransfers],
  )
  const activeServiceDevices = useMemo(
    () => workspace.serviceDevices.filter((item) => item.status === 'active'),
    [workspace.serviceDevices],
  )
  const activeDaypartScheduleCount = useMemo(
    () => workspace.menuDaypartSchedules.filter((item) => item.active).length,
    [workspace.menuDaypartSchedules],
  )
  const activeMenuDaypart = useMemo(
    () => getRestaurantActiveMenuDaypart(workspace, new Date(nowMs)),
    [workspace, nowMs],
  )
  const goLiveChecklist = useMemo(() => buildRestaurantGoLiveChecklist(workspace), [workspace])
  const recentAuditTrail = useMemo(() => workspace.auditTrail.slice(0, 10), [workspace.auditTrail])
  const toplineStatusText = compactViewport
    ? `${isBrowserOnline ? 'Online' : 'Offline'} / ${enterpriseControl.score}% / ${enterpriseControl.label}`
    : `${readOnly ? 'Read-only role / ' : ''}${isBrowserOnline ? 'Online' : 'Offline capture mode'} / ${enterpriseControl.score}% / ${enterpriseControl.label} / ${message}`
  const compactStatusMessage = useMemo(() => {
    if (!compactViewport) {
      return ''
    }
    if (!canEdit) {
      return 'Read-only role active. Review queues, proof, and exports only.'
    }
    if (!isBrowserOnline) {
      return 'Offline capture mode active. Keep records local, then export/sync when online.'
    }
    if (workspace.offlineGuardrail.pendingUploads > 0) {
      return `Pending uploads: ${workspace.offlineGuardrail.pendingUploads}. Lock: ${workspace.offlineGuardrail.queueLockLevel}.`
    }
    return ''
  }, [canEdit, compactViewport, isBrowserOnline, workspace.offlineGuardrail.pendingUploads, workspace.offlineGuardrail.queueLockLevel])

  useEffect(() => {
    if (roleModules.includes(activeModule)) {
      return
    }
    setActiveModule(safeInitialModule)
  }, [activeModule, roleModules, safeInitialModule])

  useEffect(() => {
    if (compactViewport && activeModule === 'enterprise') {
      setActiveWorkspacePanel('queue')
      return
    }
    setActiveWorkspacePanel('capture')
  }, [activeModule, compactViewport])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const widthQuery = window.matchMedia('(max-width: 900px)')
    const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)')
    const syncCompactViewport = () => syncCompactRestaurantViewportFlag(setCompactViewport)
    const visualViewport = window.visualViewport
    syncCompactViewport()
    widthQuery.addEventListener('change', syncCompactViewport)
    touchQuery.addEventListener('change', syncCompactViewport)
    window.addEventListener('orientationchange', syncCompactViewport)
    visualViewport?.addEventListener('resize', syncCompactViewport)
    return () => {
      widthQuery.removeEventListener('change', syncCompactViewport)
      touchQuery.removeEventListener('change', syncCompactViewport)
      window.removeEventListener('orientationchange', syncCompactViewport)
      visualViewport?.removeEventListener('resize', syncCompactViewport)
    }
  }, [])

  useEffect(() => {
    const scopedWorkspace = loadRestaurantWorkspace(workspaceScopeKey)
    setWorkspace(scopedWorkspace)
    setMenuSourceText(scopedWorkspace.menu.sourceText)
    setMenuSourceFiles(scopedWorkspace.menu.sourceFiles)
    setMessage('Order proof, stock risk, closeout.')
  }, [workspaceScopeKey])

  useEffect(() => {
    const targetBranchName = defaultBranchName.trim()
    if (!targetBranchName) {
      return
    }
    setWorkspace((current) => {
      const currentBranchName = current.branchName.trim()
      if (!isLegacySeedBranchName(currentBranchName) || currentBranchName === targetBranchName) {
        return current
      }
      const targetSlug = slugify(targetBranchName) || current.menu.publicSlug
      return {
        ...current,
        branchName: targetBranchName,
        shifts: current.shifts.map((shift) => ({ ...shift, branchName: targetBranchName })),
        guests: current.guests.map((guest) => ({ ...guest, branchName: targetBranchName })),
        promos: current.promos.map((promo) => ({ ...promo, branchName: targetBranchName })),
        paymentSetup: {
          ...current.paymentSetup,
          merchantName: targetBranchName,
          mmqrTemplate: current.paymentSetup.mmqrTemplate.replace(/\/merchant\/[a-z0-9-]+/gi, `/merchant/${targetSlug}`),
        },
        menu: {
          ...current.menu,
          publicSlug: targetSlug,
        },
        updatedAt: new Date().toISOString(),
      }
    })
  }, [defaultBranchName])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleOnline = () => setIsBrowserOnline(true)
    const handleOffline = () => setIsBrowserOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handle = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(handle)
  }, [])

  useEffect(() => {
    saveRestaurantWorkspace(workspace, workspaceScopeKey)
  }, [workspace, workspaceScopeKey])

  useEffect(() => {
    let cancelled = false
    async function renderQr() {
      try {
        const qrCode = await loadQrCodeModule()
        const value = await qrCode.toDataURL(menuUrl, {
          margin: 1,
          scale: 8,
          color: {
            dark: '#111827',
            light: '#ffffff',
          },
        })
        if (!cancelled) {
          setQrDataUrl(value)
        }
      } catch {
        if (!cancelled) {
          setQrDataUrl('')
        }
      }
    }
    void renderQr()
    return () => {
      cancelled = true
    }
  }, [menuUrl])

  useEffect(() => {
    let cancelled = false
    async function renderPaymentQr() {
      if (!latestPaymentQrValue) {
        setPaymentQrDataUrl('')
        return
      }
      try {
        const qrCode = await loadQrCodeModule()
        const value = await qrCode.toDataURL(latestPaymentQrValue, {
          margin: 1,
          scale: 8,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        })
        if (!cancelled) {
          setPaymentQrDataUrl(value)
        }
      } catch {
        if (!cancelled) {
          setPaymentQrDataUrl('')
        }
      }
    }
    void renderPaymentQr()
    return () => {
      cancelled = true
    }
  }, [latestPaymentQrValue])

  function resolveAuditActor(workspaceSnapshot: RestaurantOperatingWorkspace) {
    return workspaceSnapshot.managerName.trim()
      || workspaceSnapshot.paymentSetup.cashupOwner.trim()
      || (posRole ? `${posRole} operator` : 'system')
  }

  function appendAuditEvent(event: string, detail: string, severity: RestaurantAuditSeverity = 'info') {
    setWorkspace((current) =>
      appendRestaurantAuditRecord(current, {
        event,
        detail,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity,
      }),
    )
  }

  function guardEditable() {
    if (canEdit) {
      return true
    }
    setMessage('Read-only role. Switch role to update records.')
    return false
  }

  function guardOfflineDangerousAction(actionLabel: string, paymentOnly = false) {
    const guardrail = workspace.offlineGuardrail
    if (!guardrail.isOfflineCaptureActive) {
      return true
    }
    if (guardrail.queueLockLevel === 'none') {
      return true
    }
    if (guardrail.queueLockLevel === 'payments-only' && !paymentOnly) {
      return true
    }
    setMessage(
      `Action blocked in offline mode: ${actionLabel}. Reconnect and flush pending uploads before continuing.`,
    )
    return false
  }

  function requestManagerOverride(actionLabel: string) {
    if (canApproveOrReject) {
      return true
    }
    if (typeof window === 'undefined') {
      setMessage(`Manager override required for ${actionLabel}.`)
      appendAuditEvent('manager override required', `Override required for ${actionLabel}, but prompt is unavailable in this runtime.`, 'review')
      return false
    }
    const enteredPin = window.prompt(`Manager override required for ${actionLabel}. Enter manager PIN.`, '')
    if (enteredPin === null) {
      setMessage(`Manager override cancelled for ${actionLabel}.`)
      appendAuditEvent('manager override cancelled', `Cashier cancelled manager override for ${actionLabel}.`, 'review')
      return false
    }
    if (!validatePosManagerOverridePin(enteredPin)) {
      setMessage(`Manager override failed for ${actionLabel}. Invalid PIN.`)
      appendAuditEvent('manager override failed', `Invalid manager PIN entered for ${actionLabel}.`, 'critical')
      return false
    }
    setMessage(`Manager override approved for ${actionLabel}.`)
    appendAuditEvent('manager override approved', `Manager override approved for ${actionLabel}.`, 'info')
    return true
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      updateRestaurantProfile(current, {
        branchName: String(form.get('branchName') || 'Main branch'),
        managerName: String(form.get('managerName') || ''),
        businessDate: String(form.get('businessDate') || current.businessDate),
      }),
    )
    setMessage('Branch profile saved for this browser.')
  }

  function handleShiftSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantShift(current, {
        daypart: String(form.get('daypart') || 'opening') as RestaurantDaypart,
        status: String(form.get('status') || 'ready') as 'ready' | 'blocked' | 'handover',
        blocker: String(form.get('blocker') || ''),
        handover: String(form.get('handover') || ''),
      }),
    )
    event.currentTarget.reset()
    setMessage('Shift record saved. The queue and metrics updated.')
  }

  function handleStockSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantStock(current, {
        itemName: String(form.get('itemName') || 'Unnamed item'),
        par: numberInputValue(form.get('par')),
        current: numberInputValue(form.get('current')),
        waste: numberInputValue(form.get('waste')),
        supplierIssue: String(form.get('supplierIssue') || ''),
        action: String(form.get('action') || ''),
      }),
    )
    event.currentTarget.reset()
    setMessage('Stock and prep record saved.')
  }

  function handleGuestSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantGuest(current, {
        channel: String(form.get('channel') || 'in-store'),
        branchName: current.branchName,
        issue: String(form.get('issue') || 'Guest issue'),
        recovery: String(form.get('recovery') || ''),
        owner: String(form.get('owner') || current.managerName),
        status: String(form.get('status') || 'open') as 'open' | 'recovering' | 'closed',
      }),
    )
    event.currentTarget.reset()
    setMessage('Guest recovery record saved.')
  }

  function handlePromoSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantPromo(current, {
        branchName: current.branchName,
        promoName: String(form.get('promoName') || 'Promotion'),
        salesLift: numberInputValue(form.get('salesLift')),
        foodCostPressure: numberInputValue(form.get('foodCostPressure')),
        laborPressure: numberInputValue(form.get('laborPressure')),
        decision: String(form.get('decision') || 'review') as 'extend' | 'correct' | 'stop' | 'review',
        owner: String(form.get('owner') || current.managerName),
      }),
    )
    event.currentTarget.reset()
    setMessage('Margin decision record saved.')
  }

  function handleTableSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantTable(current, {
        tableName: String(form.get('tableName') || ''),
        floorZone: String(form.get('floorZone') || ''),
        seats: numberInputValue(form.get('seats')) || 1,
        guestCount: numberInputValue(form.get('guestCount')),
        status: String(form.get('status') || 'open') as RestaurantTableStatus,
        orderRef: String(form.get('orderRef') || ''),
        assignedServer: String(form.get('assignedServer') || current.managerName),
        note: String(form.get('note') || ''),
      }),
    )
    event.currentTarget.reset()
    setMessage('Table/floor record saved.')
  }

  function handleTableStatus(tableId: string, status: RestaurantTableStatus) {
    if (!guardEditable()) {
      return
    }
    setWorkspace((current) =>
      updateRestaurantTableStatus(current, tableId, {
        status,
      }),
    )
    setMessage(`Table status updated: ${status}.`)
  }

  function handleKitchenTicketSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantKitchenTicket(current, {
        orderRef: String(form.get('orderRef') || ''),
        tableName: String(form.get('tableName') || ''),
        station: String(form.get('station') || ''),
        itemSummary: String(form.get('itemSummary') || ''),
        targetReadyAt: String(form.get('targetReadyAt') || ''),
        status: String(form.get('status') || 'queued') as RestaurantKitchenTicketStatus,
        priority: String(form.get('priority') || 'normal') as RestaurantKitchenTicketPriority,
        owner: String(form.get('owner') || current.managerName || 'kitchen lead'),
        note: String(form.get('note') || ''),
      }),
    )
    event.currentTarget.reset()
    setMessage('Kitchen ticket saved.')
  }

  function handleKitchenTicketStatus(ticketId: string, status: RestaurantKitchenTicketStatus) {
    if (!guardEditable()) {
      return
    }
    setWorkspace((current) =>
      updateRestaurantKitchenTicketStatus(current, ticketId, {
        status,
      }),
    )
    setMessage(`Kitchen ticket status updated: ${status}.`)
  }

  function handleApprovalSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) => {
      const next = appendRestaurantApprovalRequest(current, {
        orderRef: String(form.get('orderRef') || '').trim(),
        tableName: String(form.get('tableName') || '').trim(),
        actionType: String(form.get('actionType') || 'void') as RestaurantApprovalActionType,
        reason: String(form.get('reason') || '').trim(),
        amountMmk: numberInputValue(form.get('amountMmk')),
        requestedBy: String(form.get('requestedBy') || current.managerName || 'operator').trim(),
        approvedBy: '',
        status: 'pending',
        note: String(form.get('note') || '').trim(),
      })
      return appendRestaurantAuditRecord(next, {
        event: 'approval requested',
        detail: `Action=${String(form.get('actionType') || 'void')} / Order=${String(form.get('orderRef') || '').trim() || 'n/a'}.`,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity: 'review',
      })
    })
    event.currentTarget.reset()
    setMessage('Approval request logged as pending.')
  }

  function handleApprovalStatus(approvalId: string, status: RestaurantApprovalStatus) {
    if (!guardEditable()) {
      return
    }
    if (status !== 'pending' && !guardOfflineDangerousAction(`approval ${status}`)) {
      return
    }
    if (status !== 'pending' && !canApproveOrReject) {
      if (!requestManagerOverride(`approval ${status}`)) {
        return
      }
    }
    setWorkspace((current) => {
      const next = updateRestaurantApprovalStatus(current, approvalId, {
        status,
        approvedBy: current.managerName || current.paymentSetup.cashupOwner || 'manager',
      })
      return appendRestaurantAuditRecord(next, {
        event: 'approval status changed',
        detail: `Approval ${approvalId} marked ${status}.`,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity: status === 'rejected' ? 'review' : 'info',
      })
    })
    setMessage(`Approval marked ${status}.`)
  }

  function handlePaymentSetupSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      updateRestaurantPaymentSetup(current, {
        providerName: String(form.get('providerName') || ''),
        merchantName: String(form.get('merchantName') || ''),
        merchantId: String(form.get('merchantId') || ''),
        branchCode: String(form.get('branchCode') || ''),
        settlementAccountMasked: String(form.get('settlementAccountMasked') || ''),
        mmqrTemplate: String(form.get('mmqrTemplate') || ''),
        settlementExportFormat: String(form.get('settlementExportFormat') || ''),
        cashupOwner: String(form.get('cashupOwner') || current.managerName),
      }),
    )
    setMessage('Payment setup saved. Use only provider-issued merchant QR or payment payloads.')
  }

  function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amountMmk = numberInputValue(form.get('amountMmk'))
    const collectedMmk = numberInputValue(form.get('collectedMmk'))
    setWorkspace((current) => {
      const next = appendRestaurantPayment(current, {
        orderRef: String(form.get('orderRef') || ''),
        tableName: String(form.get('tableName') || ''),
        amountMmk,
        provider: String(form.get('provider') || 'Payment provider'),
        tenderType: String(form.get('tenderType') || 'cash') as RestaurantPaymentTender,
        paymentPayload: String(form.get('paymentPayload') || ''),
        customerName: String(form.get('customerName') || ''),
        customerPhone: String(form.get('customerPhone') || ''),
        itemSummary: String(form.get('itemSummary') || ''),
        splitGroup: String(form.get('splitGroup') || ''),
        seatLabel: String(form.get('seatLabel') || ''),
        collectedMmk: collectedMmk || amountMmk,
        refundedMmk: numberInputValue(form.get('refundedMmk')),
        tipMmk: numberInputValue(form.get('tipMmk')),
        changeGivenMmk: numberInputValue(form.get('changeGivenMmk')),
        settlementRef: String(form.get('settlementRef') || ''),
        proofNote: String(form.get('proofNote') || ''),
        status: String(form.get('status') || 'draft') as RestaurantPaymentStatus,
        note: String(form.get('note') || ''),
        paidAt: '',
        verifiedBy: String(form.get('verifiedBy') || current.managerName),
      })
      if (!current.offlineGuardrail.isOfflineCaptureActive) {
        return next
      }
      return updateRestaurantOfflineGuardrail(next, {
        pendingUploads: current.offlineGuardrail.pendingUploads + 1,
        pendingCriticalActions: current.offlineGuardrail.pendingCriticalActions + 1,
      })
    })
    event.currentTarget.reset()
    setMessage('Payment record saved. Reconcile before cash-up close.')
  }

  function handlePaymentStatus(paymentId: string, status: RestaurantPaymentStatus) {
    if (!guardEditable()) {
      return
    }
    if (!guardOfflineDangerousAction(`payment status ${status}`, true) && status !== 'link-issued') {
      return
    }
    if (status === 'refunded' || status === 'reconcile') {
      if (!requestManagerOverride(status === 'refunded' ? 'refund payment' : 'reconcile payment')) {
        return
      }
    }
    setWorkspace((current) => {
      let next = updateRestaurantPaymentStatus(current, paymentId, {
        status,
        verifiedBy: current.managerName || 'manager',
      })
      if (current.offlineGuardrail.isOfflineCaptureActive) {
        const criticalDelta = status === 'paid' || status === 'refunded' ? -1 : 0
        next = updateRestaurantOfflineGuardrail(next, {
          pendingCriticalActions: Math.max(0, current.offlineGuardrail.pendingCriticalActions + criticalDelta),
        })
      }
      return appendRestaurantAuditRecord(next, {
        event: 'payment status changed',
        detail: `Payment ${paymentId} moved to ${status}.`,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity: status === 'refunded' ? 'review' : 'info',
      })
    })
    setMessage(
      status === 'paid'
        ? 'Payment marked paid. Keep provider settlement proof for cash-up.'
        : status === 'partial'
          ? 'Payment marked partial. Capture remaining split tender before close.'
          : status === 'refunded'
            ? 'Payment marked refunded. Include reason and proof in closeout export.'
        : status === 'link-issued'
          ? 'Payment issued. Wait for provider confirmation before marking paid.'
          : 'Payment moved to reconciliation review.',
    )
  }

  function handleRegisterOpenSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const registerId = String(form.get('registerId') || 'front-register').trim() || 'front-register'
    const hasOpenSession = workspace.registerSessions.some((session) => session.registerId === registerId && session.status === 'open')
    if (hasOpenSession) {
      setMessage(`${registerId} is already open. Close it before starting a new session.`)
      return
    }
    setWorkspace((current) => {
      const next = openRestaurantRegisterSession(current, {
        registerId,
        owner: String(form.get('owner') || current.paymentSetup.cashupOwner || current.managerName || 'owner'),
        openingFloatMmk: numberInputValue(form.get('openingFloatMmk')),
        note: String(form.get('openNote') || ''),
      })
      return appendRestaurantAuditRecord(next, {
        event: 'register opened',
        detail: `Register ${registerId} opened with float ${numberInputValue(form.get('openingFloatMmk')).toLocaleString()} MMK.`,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity: 'info',
      })
    })
    event.currentTarget.reset()
    setMessage(`Register session opened for ${registerId}.`)
  }

  function handleRegisterCloseSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    if (!guardOfflineDangerousAction('register close')) {
      return
    }
    if (!requestManagerOverride('close register session')) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const registerId = String(form.get('registerId') || activeRegisterSession?.registerId || 'front-register').trim() || 'front-register'
    const hasOpenSession = workspace.registerSessions.some((session) => session.registerId === registerId && session.status === 'open')
    if (!hasOpenSession) {
      setMessage(`No open session found for ${registerId}.`)
      return
    }
    setWorkspace((current) => {
      const countedCashMmk = numberInputValue(form.get('countedCashMmk'))
      const next = closeRestaurantRegisterSession(current, {
        registerId,
        countedCashMmk,
        closeNote: String(form.get('closeNote') || ''),
      })
      return appendRestaurantAuditRecord(next, {
        event: 'register closed',
        detail: `Register ${registerId} closed with counted cash ${countedCashMmk.toLocaleString()} MMK.`,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity: 'review',
      })
    })
    event.currentTarget.reset()
    setMessage(`Register session closed for ${registerId}. Review variance before archive.`)
  }

  function handleCashMovementSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const registerId = String(form.get('registerId') || activeRegisterSession?.registerId || 'front-register').trim() || 'front-register'
    const hasOpenSession = workspace.registerSessions.some((session) => session.registerId === registerId && session.status === 'open')
    if (!hasOpenSession) {
      setMessage(`Open ${registerId} before logging cash movements.`)
      return
    }
    setWorkspace((current) => {
      const amountMmk = numberInputValue(form.get('amountMmk'))
      const movementType = String(form.get('movementType') || 'add') as RestaurantCashMovementType
      const next = appendRestaurantCashMovement(current, {
        registerId,
        type: movementType,
        amountMmk,
        reasonCode: String(form.get('reasonCode') || ''),
        note: String(form.get('movementNote') || ''),
        owner: String(form.get('owner') || current.paymentSetup.cashupOwner || current.managerName || 'owner'),
      })
      return appendRestaurantAuditRecord(next, {
        event: 'cash movement logged',
        detail: `Register ${registerId} / ${movementType} / ${amountMmk.toLocaleString()} MMK.`,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity: movementType === 'remove' || movementType === 'payout' || movementType === 'safe-drop' ? 'review' : 'info',
      })
    })
    event.currentTarget.reset()
    setMessage(`Cash movement logged for ${registerId}.`)
  }

  function handleOfflineGuardrailSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const isOfflineCaptureActive = String(form.get('isOfflineCaptureActive') || '') === 'yes'
    const queueLockLevel = String(form.get('queueLockLevel') || 'none') as 'none' | 'payments-only' | 'strict'
    setWorkspace((current) =>
      updateRestaurantOfflineGuardrail(current, {
        isOfflineCaptureActive,
        reconnectDeadlineAt: String(form.get('reconnectDeadlineAt') || ''),
        reconnectOwner: String(form.get('reconnectOwner') || current.managerName || current.paymentSetup.cashupOwner),
        queueLockLevel,
        pendingUploads: numberInputValue(form.get('pendingUploads')),
        pendingCriticalActions: numberInputValue(form.get('pendingCriticalActions')),
      }),
    )
    setMessage(
      isOfflineCaptureActive
        ? `Offline guardrail enabled with ${queueLockLevel} lock policy.`
        : 'Offline guardrail updated for online mode.',
    )
  }

  function handleTipRecoverySubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantTipRecovery(current, {
        orderRef: String(form.get('orderRef') || ''),
        staffName: String(form.get('staffName') || current.managerName || ''),
        expectedTipMmk: numberInputValue(form.get('expectedTipMmk')),
        recoveredTipMmk: numberInputValue(form.get('recoveredTipMmk')),
        status: String(form.get('status') || 'pending') as RestaurantTipRecoveryStatus,
        note: String(form.get('note') || ''),
      }),
    )
    event.currentTarget.reset()
    setMessage('Tip recovery item saved.')
  }

  function handleTipRecoveryStatus(tipRecoveryId: string, status: RestaurantTipRecoveryStatus) {
    if (!guardEditable()) {
      return
    }
    setWorkspace((current) =>
      updateRestaurantTipRecovery(current, tipRecoveryId, {
        status,
      }),
    )
    setMessage(`Tip recovery marked ${status}.`)
  }

  function handleShiftReviewLockStatus(status: 'open' | 'locked' | 'released') {
    if (!guardEditable()) {
      return
    }
    if (status === 'released' && !requestManagerOverride('release shift review lock')) {
      return
    }
    setWorkspace((current) =>
      setRestaurantShiftReviewLock(current, {
        status,
        owner: current.paymentSetup.cashupOwner || current.managerName,
        note: current.shiftReviewLock.note || 'Shift review status updated from POS control.',
      }),
    )
    setMessage(`Shift review moved to ${status}.`)
  }

  function handleTransferSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantInventoryTransfer(current, {
        itemName: String(form.get('itemName') || ''),
        fromLocation: String(form.get('fromLocation') || current.branchName),
        toLocation: String(form.get('toLocation') || current.branchName),
        requestedQty: numberInputValue(form.get('requestedQty')),
        dispatchedQty: numberInputValue(form.get('dispatchedQty')),
        receivedQty: numberInputValue(form.get('receivedQty')),
        status: String(form.get('status') || 'requested') as RestaurantTransferStatus,
        requestedBy: String(form.get('requestedBy') || current.managerName || 'operator'),
        dispatchedBy: String(form.get('dispatchedBy') || ''),
        receivedBy: String(form.get('receivedBy') || ''),
        varianceNote: String(form.get('varianceNote') || ''),
      }),
    )
    event.currentTarget.reset()
    setMessage('Transfer record saved.')
  }

  function handleTransferStatus(transferId: string, status: RestaurantTransferStatus) {
    if (!guardEditable()) {
      return
    }
    if (status === 'variance' && !requestManagerOverride('mark transfer variance')) {
      return
    }
    setWorkspace((current) =>
      updateRestaurantInventoryTransfer(current, transferId, {
        status,
        dispatchedBy: current.managerName || current.paymentSetup.cashupOwner,
        receivedBy: current.managerName || current.paymentSetup.cashupOwner,
      }),
    )
    setMessage(`Transfer status moved to ${status}.`)
  }

  function handleDeviceAssignmentSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantServiceDeviceAssignment(current, {
        laneType: String(form.get('laneType') || 'table') as RestaurantServiceLaneType,
        laneRef: String(form.get('laneRef') || ''),
        station: String(form.get('station') || ''),
        deviceLabel: String(form.get('deviceLabel') || ''),
        deviceType: String(form.get('deviceType') || 'terminal') as RestaurantServiceDeviceType,
        owner: String(form.get('owner') || current.managerName || current.paymentSetup.cashupOwner),
        status: String(form.get('status') || 'active') === 'inactive' ? 'inactive' : 'active',
        note: String(form.get('note') || ''),
      }),
    )
    event.currentTarget.reset()
    setMessage('Service-device assignment saved.')
  }

  function handleDeviceRemove(assignmentId: string) {
    if (!guardEditable()) {
      return
    }
    setWorkspace((current) => removeRestaurantServiceDeviceAssignment(current, assignmentId))
    setMessage('Service-device assignment removed.')
  }

  function handleMenuScheduleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setWorkspace((current) =>
      appendRestaurantMenuDaypartSchedule(current, {
        daypart: String(form.get('daypart') || 'opening') as RestaurantDaypart,
        startTime: String(form.get('startTime') || '08:00'),
        endTime: String(form.get('endTime') || '22:00'),
        menuLabel: String(form.get('menuLabel') || ''),
        active: String(form.get('active') || 'yes') === 'yes',
        updatedBy: String(form.get('updatedBy') || current.managerName || current.paymentSetup.cashupOwner),
      }),
    )
    event.currentTarget.reset()
    setMessage('Menu daypart schedule saved.')
  }

  function handleMenuScheduleToggle(scheduleId: string, nextActive: boolean) {
    if (!guardEditable()) {
      return
    }
    setWorkspace((current) =>
      updateRestaurantMenuDaypartSchedule(current, scheduleId, {
        active: nextActive,
        updatedBy: current.managerName || current.paymentSetup.cashupOwner,
      }),
    )
    setMessage(nextActive ? 'Menu schedule enabled.' : 'Menu schedule disabled.')
  }

  async function handleMenuFiles(files: FileList | null) {
    if (!guardEditable()) {
      return
    }
    const uploadedFiles = Array.from(files ?? [])
    const nextFiles = uploadedFiles.map((file) => ({
      name: file.name,
      type: file.type || 'unknown',
      size: file.size,
      capturedAt: new Date().toISOString(),
    }))
    setMenuSourceFiles(nextFiles)
    const readableFiles = uploadedFiles.filter((file) => file.type.startsWith('text/') || /\.(csv|txt)$/i.test(file.name))
    const extracted = (await Promise.all(readableFiles.map((file) => file.text().catch(() => '')))).map((value) => value.trim()).filter(Boolean)
    if (extracted.length) {
      setMenuSourceText((current) => [current.trim(), ...extracted].filter(Boolean).join('\n\n'))
    }
    setMessage(
      nextFiles.length
        ? `${nextFiles.length} menu file(s) attached. Text and CSV files were read; PDFs/images are queued as vision evidence.`
        : 'Menu files cleared.',
    )
  }

  function handleMenuSubmit(event: FormEvent<HTMLFormElement>) {
    if (!guardEditable()) {
      return
    }
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextWorkspace = updateRestaurantMenu(workspace, {
      sourceText: menuSourceText,
      sourceFiles: menuSourceFiles,
      orderingMode: String(form.get('orderingMode') || 'digital-menu') as 'digital-menu' | 'order-request',
      publicSlug: String(form.get('publicSlug') || workspace.menu.publicSlug),
    })
    setWorkspace(nextWorkspace)
    setMessage(`Customer menu generated with ${nextWorkspace.menu.items.length} structured item(s).`)
  }

  function downloadMenuHtml() {
    if (typeof window === 'undefined') {
      return
    }
    const blob = new Blob([buildRestaurantMenuHtml(workspace, qrDataUrl)], { type: 'text/html' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${workspace.menu.publicSlug || 'restaurant-menu'}.html`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  function printMenuPage() {
    if (typeof window === 'undefined') {
      return
    }
    const popup = window.open('', '_blank', 'noopener,noreferrer')
    if (!popup) {
      setMessage('Popup blocked. Use Download menu page instead.')
      return
    }
    popup.document.write(buildRestaurantMenuHtml(workspace, qrDataUrl))
    popup.document.close()
    popup.focus()
    popup.print()
  }

  async function handleQueueMenuExtraction() {
    if (!canRunAiActions) {
      setMessage('This role cannot run AI actions. Switch to owner or manager.')
      return
    }
    if (!isBrowserOnline) {
      setMessage('Offline mode active. Queue AI menu review after reconnecting.')
      return
    }
    if (!hasLiveWorkspaceApi()) {
      setMessage('Login to the live client app before queueing menu review.')
      return
    }
    setMenuAgentBusy(true)
    try {
      const response = await runAgentJob({
        job_type: 'menu_extraction',
        source: 'restaurant_os_qr_menu',
        enqueue_only: true,
        payload: {
          branch_name: workspace.branchName,
          public_slug: workspace.menu.publicSlug,
          ordering_mode: workspace.menu.orderingMode,
          source_files: menuSourceFiles,
          source_text: menuSourceText,
          structured_item_count: workspace.menu.items.length,
          menu_url: menuUrl,
        },
        idempotency_key: `menu-extraction-${workspace.menu.publicSlug}-${new Date().toISOString().slice(0, 13)}`,
      })
      const queued = response.mode === 'queued' || response.row?.status === 'queued'
      const summary = queued ? 'queued for the cloud worker.' : response.row?.summary || response.status || 'Menu extraction queued.'
      setMessage(`Menu review: ${summary}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Menu review could not be queued.')
    } finally {
      setMenuAgentBusy(false)
    }
  }

  async function handleQueuePaymentReconciliation() {
    if (!canRunAiActions) {
      setMessage('This role cannot run AI actions. Switch to owner or manager.')
      return
    }
    if (!isBrowserOnline) {
      setMessage('Offline mode active. Queue payment reconciliation after reconnecting.')
      return
    }
    if (!hasLiveWorkspaceApi()) {
      setMessage('Login to the live client app before queueing payment reconciliation.')
      return
    }
    setPaymentAgentBusy(true)
    try {
      const response = await runAgentJob({
        job_type: 'mmqr_payment_reconciliation',
        source: 'restaurant_pos_payment',
        enqueue_only: true,
        payload: {
          branch_name: workspace.branchName,
          business_date: workspace.businessDate,
          payment_setup: workspace.paymentSetup,
          setup_readiness: paymentSetupReadiness,
          payments: workspace.payments.slice(0, 50),
          register_sessions: workspace.registerSessions.slice(0, 20),
          cash_movements: workspace.cashMovements.slice(0, 80),
          reconciliation_text: paymentReconciliationText,
        },
        idempotency_key: `restaurant-payment-reconciliation-${workspace.branchName}-${workspace.businessDate}-${new Date().toISOString().slice(0, 13)}`,
      })
      const queued = response.mode === 'queued' || response.row?.status === 'queued'
      const summary = queued
        ? 'queued for cloud worker review.'
        : response.row?.summary || response.status || 'Payment reconciliation queued.'
      setMessage(`Payment reconciliation: ${summary}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Payment reconciliation could not be queued.')
    } finally {
      setPaymentAgentBusy(false)
    }
  }

  async function copyLatestPaymentQrValue() {
    if (!latestPaymentQrValue || typeof navigator === 'undefined' || !navigator.clipboard) {
      setMessage('No payment payload to copy yet.')
      return
    }
    try {
      await navigator.clipboard.writeText(latestPaymentQrValue)
      setMessage('Payment payload copied.')
    } catch {
      setMessage('Clipboard permission blocked. Use the export file for this record.')
    }
  }

  async function copyEnterpriseOwnerBrief() {
    const brief = [
      `${workspaceTitle} / ${enterpriseControl.branchContext}`,
      `Readiness: ${enterpriseControl.score}% / ${enterpriseControl.label}`,
      ...enterpriseControl.ownerBrief,
      'Approval boundary:',
      ...enterpriseControl.permissionBoundary.map((item) => `- ${item}`),
    ].join('\n')
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setMessage(brief)
      return
    }
    try {
      await navigator.clipboard.writeText(brief)
      setMessage('Enterprise owner brief copied with gates, AI actions, and approval boundary.')
    } catch {
      setMessage(brief)
    }
  }

  async function copyCloseoutSummary() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setMessage(closeoutSummaryText)
      appendAuditEvent('closeout summary viewed', 'Closeout summary rendered in terminal message due missing clipboard support.', 'info')
      return
    }
    try {
      await navigator.clipboard.writeText(closeoutSummaryText)
      setMessage('Closeout summary copied.')
      appendAuditEvent('closeout summary copied', 'Closeout summary copied to clipboard.', 'info')
    } catch {
      setMessage(closeoutSummaryText)
      appendAuditEvent('closeout summary viewed', 'Clipboard write failed; closeout summary shown in terminal message.', 'review')
    }
  }

  function downloadCloseoutSummary() {
    if (typeof window === 'undefined') {
      return
    }
    const blob = new Blob([closeoutSummaryText], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${buildWorkspaceExportBaseName(workspace)}-closeout-summary.txt`
    link.click()
    window.URL.revokeObjectURL(url)
    appendAuditEvent('closeout summary exported', 'Closeout summary text exported.', 'info')
  }

  function requestCloseoutApproval() {
    if (!guardEditable()) {
      return
    }
    if (!guardOfflineDangerousAction('closeout approval')) {
      return
    }
    setWorkspace((current) => {
      const unresolvedPayments = current.payments.filter((item) => item.status !== 'paid' && item.status !== 'refunded').length
      const openRegisters = current.registerSessions.filter((item) => item.status === 'open').length
      const varianceMmk = current.registerSessions
        .filter((item) => item.status === 'closed')
        .reduce((sum, item) => sum + Math.abs(item.varianceMmk), 0)
      const next = appendRestaurantApprovalRequest(current, {
        orderRef: `CLOSE-${current.businessDate}`,
        tableName: current.branchName,
        actionType: 'closeout',
        reason: `Request manager closeout review. Unresolved payments=${unresolvedPayments}; open registers=${openRegisters}; variance=${varianceMmk.toLocaleString()} MMK.`,
        amountMmk: varianceMmk,
        requestedBy: resolveAuditActor(current),
        approvedBy: '',
        status: 'pending',
        note: 'Closeout package requires manager sign-off before archive/export.',
      })
      return appendRestaurantAuditRecord(next, {
        event: 'closeout approval requested',
        detail: `Closeout approval requested for ${current.businessDate}.`,
        actor: resolveAuditActor(current),
        actorRole: posRole || 'system',
        severity: 'review',
      })
    })
    setMessage('Closeout approval request added to approval queue.')
  }

  function handleReset() {
    if (!canResetWorkspace) {
      setMessage('This role cannot reset the workspace.')
      return
    }
    if (!guardEditable()) {
      return
    }
    clearRestaurantWorkspace(workspaceScopeKey)
    const nextWorkspace = createDefaultRestaurantWorkspace()
    setWorkspace(nextWorkspace)
    setMenuSourceText(nextWorkspace.menu.sourceText)
    setMenuSourceFiles(nextWorkspace.menu.sourceFiles)
    setMessage('Counter workspace reset for this browser.')
    appendAuditEvent('workspace reset', 'POS workspace reset to default seed records.', 'review')
  }

  function handleExportJson() {
    if (!canExportJson) {
      setMessage('JSON export is not enabled for this role.')
      return
    }
    exportWorkspace(workspace)
    setMessage('Day pack JSON exported.')
    appendAuditEvent('json export', 'Day pack JSON exported.', 'info')
  }

  async function handleExportExcel() {
    if (!canExportExcel) {
      setMessage('Excel export is not enabled for this role.')
      return
    }
    if (excelExportBusy) {
      return
    }
    setExcelExportBusy(true)
    setMessage('Preparing Excel day pack...')
    try {
      await exportWorkspaceExcel(workspace, staffDirectory)
      setMessage('Excel workbook exported with summary, go-live checklist, closeout summary, queue, payments, split checks, reorder plan, tables, kitchen tickets, approvals, register sessions, cash movements, audit trail, stock, menu, payment setup, and staff directory.')
      appendAuditEvent('excel export', 'Excel day pack exported.', 'info')
    } catch {
      setMessage('Excel export failed. Retry or use JSON export.')
      appendAuditEvent('excel export failed', 'Excel day pack export failed.', 'critical')
    } finally {
      setExcelExportBusy(false)
    }
  }

  const showCapturePane = !compactViewport || activeWorkspacePanel === 'capture'
  const showQueuePane = !compactViewport || activeWorkspacePanel === 'queue'

  return (
    <div className={`sm-product-app-screen sm-restaurant-product-workbench ${compactViewport ? 'is-compact' : ''}`}>
      <section className="sm-product-app-topline" aria-label={`${workspaceTitle} status`}>
        <div>
          <p>{workspaceTitle}</p>
          <strong>{workspace.branchName}</strong>
        </div>
        <span>{toplineStatusText}</span>
      </section>

      <section className={`sm-restaurant-command-row ${activeModule === 'enterprise' && !compactViewport ? 'is-enterprise' : ''}`}>
        <article className="sm-pos-branch-card sm-surface p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Branch setup</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{workspace.branchName}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{workspace.businessDate} / {workspace.managerName || 'manager not set'}</p>
            </div>
            {compactViewport ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {canExportExcel ? (
                  <button className="sm-button-secondary !px-4 !py-2 text-sm" disabled={excelExportBusy} onClick={() => void handleExportExcel()} type="button">
                    {excelExportBusy ? 'Exporting...' : 'Excel'}
                  </button>
                ) : null}
                {canExportJson ? (
                  <button className="sm-button-secondary !px-4 !py-2 text-sm" onClick={handleExportJson} type="button">
                    JSON
                  </button>
                ) : null}
                {canResetWorkspace ? (
                  <button className="sm-button-secondary !px-4 !py-2 text-sm" onClick={handleReset} type="button">
                    Reset
                  </button>
                ) : null}
              </div>
            ) : (
              <details className="sm-compact-actions">
                <summary>More</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {canExportExcel ? (
                    <button className="sm-button-secondary !px-4 !py-2 text-sm" disabled={excelExportBusy} onClick={() => void handleExportExcel()} type="button">
                      {excelExportBusy ? 'Exporting...' : 'Export Excel'}
                    </button>
                  ) : null}
                  {canExportJson ? (
                    <button className="sm-button-secondary !px-4 !py-2 text-sm" onClick={handleExportJson} type="button">
                      Export JSON
                    </button>
                  ) : null}
                  {canResetWorkspace ? (
                    <button className="sm-button-secondary !px-4 !py-2 text-sm" onClick={handleReset} type="button">
                      Reset workspace
                    </button>
                  ) : null}
                </div>
              </details>
            )}
          </div>

          <details className="sm-pos-setup-drawer">
            <summary>Edit branch setup</summary>
            <form className="mt-3 grid gap-3 md:grid-cols-3" key={`${workspace.updatedAt}-${workspace.branchName}`} onSubmit={handleProfileSubmit}>
              <label className="grid gap-2 text-sm text-[var(--sm-muted)]">
                Branch
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[var(--sm-accent)]" defaultValue={workspace.branchName} name="branchName" />
              </label>
              <label className="grid gap-2 text-sm text-[var(--sm-muted)]">
                Manager
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[var(--sm-accent)]" defaultValue={workspace.managerName} name="managerName" />
              </label>
              <label className="grid gap-2 text-sm text-[var(--sm-muted)]">
                Date
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[var(--sm-accent)]" defaultValue={workspace.businessDate} name="businessDate" type="date" />
              </label>
              <button className="sm-button-secondary md:col-span-3" disabled={!canEdit} type="submit">
                Save setup
              </button>
            </form>
          </details>
        </article>

        {!compactViewport ? (
          <article className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {[
            ['Net settled sales', formatMmk(todaySalesMmk)],
            ['Pay exceptions', `${summary.paymentReviewCount} / partial ${summary.partialPaymentCount}`],
            ['Tip recovery', `${pendingTipRecoveryItems.length} pending`],
            ['Tables active', `${openTables} / alerts ${summary.tableServiceAlerts}`],
            ['Kitchen SLA', `${kitchenActiveTickets} active / delayed ${summary.kitchenDelayedCount}`],
            ['Pending approvals', `${summary.pendingApprovalCount} / ${formatMmk(pendingApprovalValueMmk)}`],
            ['Transfers', `${transferInFlightItems.length} in flight / variance ${transferVarianceItems.length}`],
            ['Registers', `${summary.openRegisterCount} open / var ${formatMmk(summary.cashVarianceMmk)}`],
            ['AI readiness', `${enterpriseControl.score}% / ${enterpriseControl.label}`],
          ].map(([label, value]) => (
            <div className="sm-metric-card" key={label}>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">{label}</p>
              <p className="mt-3 text-3xl font-bold text-white">{value}</p>
            </div>
          ))}
          </article>
        ) : null}
      </section>

      {compactViewport ? (
        <section className="sm-pos-module-picker-mobile">
          <label className="sm-pos-panel-picker-label">
            <span className="sm-pos-picker-title">Workflow view</span>
            <select className="sm-input" onChange={(event) => setActiveModule(event.target.value as ActiveModule)} value={activeModule}>
              {visibleTabs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <p className="sm-pos-compact-lane-hint">
            One module at a time. Use capture/queue toggle for the current module.
          </p>
        </section>
      ) : (
        <section className="sm-pos-tab-strip rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
            {visibleTabs.map((item) => (
              <button
                aria-pressed={activeModule === item.id}
                className={`sm-pos-tab-button rounded-2xl px-4 py-3 text-sm font-bold transition ${activeModule === item.id ? 'bg-[var(--sm-accent)] text-slate-950' : 'bg-black/20 text-white hover:bg-white/10'}`}
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {compactViewport ? (
        compactStatusMessage ? (
          <section className="rounded-[1.05rem] border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-50">
            {compactStatusMessage}
          </section>
        ) : null
      ) : (
        <>
          {!canEdit ? (
            <section className="rounded-[1.05rem] border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-50">
              Read-only role active. You can review queues, payment proof, and exports, but records cannot be changed.
            </section>
          ) : null}
          {!isBrowserOnline ? (
            <section className="rounded-[1.05rem] border border-sky-300/30 bg-sky-200/10 px-4 py-3 text-sm text-sky-50">
              Offline mode: keep capturing orders, payments, and shift records locally, then export Excel once connection is restored.
            </section>
          ) : null}
          {workspace.offlineGuardrail.pendingUploads > 0 ? (
            <section className="rounded-[1.05rem] border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-50">
              Pending offline uploads: {workspace.offlineGuardrail.pendingUploads}. Lock policy: {workspace.offlineGuardrail.queueLockLevel}. Reconnect owner: {workspace.offlineGuardrail.reconnectOwner || 'not set'}.
            </section>
          ) : null}
        </>
      )}

      {compactViewport ? (
        <section className="sm-restaurant-pane-toggle" aria-label="POS workspace panes">
          <button
            aria-pressed={activeWorkspacePanel === 'capture'}
            className={`sm-pos-tab-button rounded-2xl px-4 py-2 text-sm font-bold transition ${activeWorkspacePanel === 'capture' ? 'bg-[var(--sm-accent)] text-slate-950' : 'bg-black/20 text-white hover:bg-white/10'}`}
            onClick={() => setActiveWorkspacePanel('capture')}
            type="button"
          >
            Capture lane
          </button>
          <button
            aria-pressed={activeWorkspacePanel === 'queue'}
            className={`sm-pos-tab-button rounded-2xl px-4 py-2 text-sm font-bold transition ${activeWorkspacePanel === 'queue' ? 'bg-[var(--sm-accent)] text-slate-950' : 'bg-black/20 text-white hover:bg-white/10'}`}
            onClick={() => setActiveWorkspacePanel('queue')}
            type="button"
          >
            Queue lane
          </button>
        </section>
      ) : null}

      <section className={`sm-restaurant-main-grid ${activeModule === 'enterprise' ? 'is-enterprise' : ''} ${activeWorkspacePanel === 'capture' ? 'is-capture-panel' : 'is-queue-panel'} ${compactViewport ? 'is-compact' : ''}`}>
        {showCapturePane ? (
        <article className="sm-surface sm-restaurant-main-pane sm-restaurant-main-pane-capture p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Capture</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{activeContract?.name}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{compactViewport ? compactContractHint : activeContract?.job}</p>
            </div>
            <span className="sm-status-pill">{summary.recordCount} records</span>
          </div>

          {activeModule === 'enterprise' ? (
            <div className="sm-pos-enterprise-layout mt-5">
              <section className="sm-pos-enterprise-hero" aria-label="Enterprise POS readiness">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Enterprise branch control</p>
                  <h3>{enterpriseControl.score}% readiness</h3>
                  <span className={`sm-pos-incident is-${enterpriseControl.incidentLevel}`}>{enterpriseControl.label}</span>
                </div>
                <p>{enterpriseControl.branchContext}</p>
              </section>

              <section className="sm-pos-gate-grid" aria-label="Enterprise readiness gates">
                {enterpriseControl.gates.map((gate) => (
                  <article className={`sm-pos-gate is-${gate.status}`} key={gate.id}>
                    <div>
                      <span>{gate.status}</span>
                      <strong>{gate.label}</strong>
                    </div>
                    <p>{gate.detail}</p>
                    <small>{gate.ownerAction}</small>
                  </article>
                ))}
              </section>

              <section className="sm-pos-gate-grid" aria-label="Go-live checklist">
                {goLiveChecklist.map((item) => (
                  <article className={`sm-pos-gate is-${item.status}`} key={item.control}>
                    <div>
                      <span>{item.status}</span>
                      <strong>{item.control}</strong>
                    </div>
                    <p>{item.detail}</p>
                    <small>Owner: {item.owner}</small>
                  </article>
                ))}
              </section>

              <section className="sm-pos-ai-action-grid" aria-label="AI-native POS actions">
                {enterpriseControl.aiActions.map((action) => (
                  <article key={action.id}>
                    <span>AI action</span>
                    <strong>{action.label}</strong>
                    <p>{action.source}</p>
                    <small>{action.output}</small>
                    <em>{action.approvalRequired}</em>
                  </article>
                ))}
              </section>

              <div className="flex flex-wrap gap-3">
                <button className="sm-button-primary" onClick={() => void copyEnterpriseOwnerBrief()} type="button">Copy owner brief</button>
                <button className="sm-button-secondary" onClick={() => void copyCloseoutSummary()} type="button">Copy closeout summary</button>
                <button className="sm-button-secondary" onClick={downloadCloseoutSummary} type="button">Export closeout summary</button>
                {canExportExcel ? (
                  <button className="sm-button-secondary" disabled={excelExportBusy} onClick={() => void handleExportExcel()} type="button">
                    {excelExportBusy ? 'Exporting day pack...' : 'Export Excel day pack'}
                  </button>
                ) : null}
                {canExportJson ? <button className="sm-button-secondary" onClick={handleExportJson} type="button">Export JSON day pack</button> : null}
              </div>
            </div>
          ) : null}

          {activeModule === 'shift' ? (
            <form className="mt-5 grid gap-3" onSubmit={handleShiftSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="daypart">
                  <option value="opening">Opening</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="close">Close</option>
                </select>
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="status">
                  <option value="ready">Ready</option>
                  <option value="blocked">Blocked</option>
                  <option value="handover">Handover</option>
                </select>
              </div>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="blocker" placeholder="Blocker or abnormal condition" />
              <textarea className="min-h-24 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="handover" placeholder="Handover note" />
              <button className="sm-button-primary" disabled={!canEdit} type="submit">Save shift record</button>
            </form>
          ) : null}

          {activeModule === 'stock' || activeModule === 'shift' ? (
            <form className="mt-5 grid gap-3" onSubmit={handleStockSubmit}>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="itemName" placeholder="Item name" required />
              <div className="grid gap-3 md:grid-cols-3">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="par" placeholder="Par" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="current" placeholder="Current" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="waste" placeholder="Waste" type="number" />
              </div>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="supplierIssue" placeholder="Supplier issue, if any" />
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="action" placeholder="Next action" />
              <button className="sm-button-primary" disabled={!canEdit} type="submit">Save stock record</button>
            </form>
          ) : null}
          {activeModule === 'stock' ? (
            <form className="mt-4 grid gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4" onSubmit={handleTransferSubmit}>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Inter-location transfer</p>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="itemName" placeholder="Item name" required />
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="requested" name="status">
                  <option value="requested">Requested</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="received">Received</option>
                  <option value="variance">Variance</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.branchName} name="fromLocation" placeholder="From location" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.branchName} name="toLocation" placeholder="To location" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="requestedQty" placeholder="Requested qty" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="dispatchedQty" placeholder="Dispatched qty" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="receivedQty" placeholder="Received qty" type="number" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.managerName} name="requestedBy" placeholder="Requested by" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="dispatchedBy" placeholder="Dispatched by" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="receivedBy" placeholder="Received by" />
              </div>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="varianceNote" placeholder="Variance note" />
              <button className="sm-button-secondary" disabled={!canEdit} type="submit">Save transfer record</button>
            </form>
          ) : null}

          {activeModule === 'tables' ? (
            <form className="mt-5 grid gap-3" onSubmit={handleTableSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="tableName" placeholder="Table 8 / Counter 1" required />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="floorZone" placeholder="Main floor / Patio / Counter" />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="1" name="seats" placeholder="Seats" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="guestCount" placeholder="Guest count" type="number" />
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="status">
                  <option value="open">Open</option>
                  <option value="seated">Seated</option>
                  <option value="ordered">Ordered</option>
                  <option value="served">Served</option>
                  <option value="bill-requested">Bill requested</option>
                  <option value="paid">Paid</option>
                  <option value="reset">Reset</option>
                </select>
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="orderRef" placeholder="Order ref" />
              </div>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="assignedServer" placeholder="Assigned server" />
              <textarea className="min-h-20 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="note" placeholder="Service note" />
              <button className="sm-button-primary" disabled={!canEdit} type="submit">Save table record</button>
            </form>
          ) : null}

          {activeModule === 'kitchen' ? (
            <form className="mt-5 grid gap-3" onSubmit={handleKitchenTicketSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="orderRef" placeholder="Order ref" required />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="tableName" placeholder="Table / channel" />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="station" placeholder="Station (hot line, salad, pass)" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="targetReadyAt" placeholder="Target ready time (HH:MM)" />
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="status">
                  <option value="queued">Queued</option>
                  <option value="firing">Firing</option>
                  <option value="ready">Ready</option>
                  <option value="served">Served</option>
                  <option value="delayed">Delayed</option>
                </select>
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="priority">
                  <option value="normal">Normal</option>
                  <option value="rush">Rush</option>
                </select>
              </div>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="owner" placeholder="Kitchen owner" />
              <textarea className="min-h-20 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="itemSummary" placeholder="Items on ticket" required />
              <textarea className="min-h-20 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="note" placeholder="Delay reason / pass note" />
              <button className="sm-button-primary" disabled={!canEdit} type="submit">Save kitchen ticket</button>
            </form>
          ) : null}
          {activeModule === 'tables' || activeModule === 'kitchen' ? (
            <form className="mt-4 grid gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4" onSubmit={handleDeviceAssignmentSubmit}>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Service-device assignment</p>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={activeModule === 'kitchen' ? 'kitchen' : 'table'} name="laneType">
                  <option value="table">Table lane</option>
                  <option value="kitchen">Kitchen lane</option>
                </select>
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="laneRef" placeholder="Lane ref (Main floor, Pass)" required />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="station" placeholder="Station" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="deviceLabel" placeholder="Device label" required />
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="terminal" name="deviceType">
                  <option value="terminal">Terminal</option>
                  <option value="tablet">Tablet</option>
                  <option value="phone">Phone</option>
                  <option value="kds">KDS</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.managerName || workspace.paymentSetup.cashupOwner} name="owner" placeholder="Owner" />
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="active" name="status">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="note" placeholder="Note" />
              </div>
              <button className="sm-button-secondary" disabled={!canEdit} type="submit">Save device assignment</button>
            </form>
          ) : null}

          {activeModule === 'approvals' ? (
            <form className="mt-5 grid gap-3" onSubmit={handleApprovalSubmit}>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-relaxed text-amber-50">
                Cashier submits void/discount/service-charge/refund/closeout requests. Owner or manager approves before closeout export.
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="orderRef" placeholder="Order ref" required />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="tableName" placeholder="Table / channel" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="actionType">
                  <option value="void">Void</option>
                  <option value="discount">Discount</option>
                  <option value="service-charge">Service charge</option>
                  <option value="refund">Refund</option>
                  <option value="closeout">Closeout sign-off</option>
                </select>
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="amountMmk" placeholder="Amount MMK" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="requestedBy" placeholder="Requested by" />
              </div>
              <textarea className="min-h-20 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="reason" placeholder="Reason for approval request" required />
              <textarea className="min-h-20 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="note" placeholder="Additional note" />
              <button className="sm-button-primary" disabled={!canEdit} type="submit">Submit approval request</button>
            </form>
          ) : null}

          {activeModule === 'guest' ? (
            <form className="mt-5 grid gap-3" onSubmit={handleGuestSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="channel" placeholder="Channel: in-store, delivery, review" />
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="status">
                  <option value="open">Open</option>
                  <option value="recovering">Recovering</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="issue" placeholder="Guest issue" required />
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="recovery" placeholder="Recovery action" />
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="owner" placeholder="Owner" />
              <button className="sm-button-primary" disabled={!canEdit} type="submit">Save guest record</button>
            </form>
          ) : null}

          {activeModule === 'margin' ? (
            <form className="mt-5 grid gap-3" onSubmit={handlePromoSubmit}>
              <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="promoName" placeholder="Promo or menu decision" required />
              <div className="grid gap-3 md:grid-cols-3">
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="salesLift" placeholder="Sales lift %" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="foodCostPressure" placeholder="Food pressure %" type="number" />
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="laborPressure" placeholder="Labor pressure %" type="number" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="decision">
                  <option value="review">Review</option>
                  <option value="extend">Extend</option>
                  <option value="correct">Correct</option>
                  <option value="stop">Stop</option>
                </select>
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="owner" placeholder="Owner" />
              </div>
              <button className="sm-button-primary" disabled={!canEdit} type="submit">Save margin record</button>
            </form>
          ) : null}

          {activeModule === 'payment' ? (
            <div className="mt-5 grid gap-4">
              <details className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">Payment setup</p>
                      <h3 className="mt-2 text-xl font-bold text-white">Provider and cash-up rules</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">
                        Optional. Use this only when the owner wants provider QR payloads, payment-link templates, settlement refs, and cash-up ownership saved.
                      </p>
                    </div>
                    <span className="sm-status-pill">{paymentSetupReadiness.score}% ready</span>
                  </div>
                </summary>
              <form className="mt-4 grid gap-3" onSubmit={handlePaymentSetupSubmit}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">One-time setup</p>
                    <h3 className="mt-2 text-xl font-bold text-white">Payment proof control</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">
                      Store only provider-issued merchant QR payloads, payment-link templates, masked settlement references, and cash-up ownership. Do not store bank passwords, card data, or private credentials.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Default payment provider
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue={workspace.paymentSetup.providerName} name="providerName" placeholder="KBZPay, WavePay, AYA Pay, CBPay, MPU..." />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Merchant name
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue={workspace.paymentSetup.merchantName} name="merchantName" placeholder="Store legal or provider merchant name" />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Merchant ID
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue={workspace.paymentSetup.merchantId} name="merchantId" placeholder="Provider merchant ID" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Branch code
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue={workspace.paymentSetup.branchCode} name="branchCode" placeholder="MAIN, YGN-01..." />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Cash-up owner
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue={workspace.paymentSetup.cashupOwner || workspace.managerName} name="cashupOwner" placeholder="Owner or cashier lead" />
                  </label>
                </div>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Provider QR / payment link template
                  <textarea
                    className="min-h-20 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none"
                    defaultValue={workspace.paymentSetup.mmqrTemplate}
                    name="mmqrTemplate"
                    placeholder="Paste provider-issued static merchant QR payload or payment link template. Optional tokens: {amount}, {orderRef}, {merchantId}, {branch}, {provider}."
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Settlement account, masked
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue={workspace.paymentSetup.settlementAccountMasked} name="settlementAccountMasked" placeholder="****1234 or provider settlement wallet" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Settlement export format
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue={workspace.paymentSetup.settlementExportFormat} name="settlementExportFormat" placeholder="CSV, screenshot, provider dashboard, bank statement" />
                  </label>
                </div>
                <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-bold text-white">{paymentSetupReadiness.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {paymentSetupChecklist.slice(0, 5).map((item) => (
                      <span className="sm-status-pill" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
                <button className="sm-button-secondary" disabled={!canEdit} type="submit">Save payment setup</button>
              </form>
              </details>

              <form className="grid gap-3 rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-4" onSubmit={handleOfflineGuardrailSubmit}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Offline payment guardrail</p>
                    <h3 className="mt-2 text-lg font-bold text-white">Reconnect queue and lock policy</h3>
                  </div>
                  <span className="sm-status-pill">
                    {workspace.offlineGuardrail.isOfflineCaptureActive ? 'offline active' : 'online'}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Capture mode
                    <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.offlineGuardrail.isOfflineCaptureActive ? 'yes' : 'no'} name="isOfflineCaptureActive">
                      <option value="no">Online</option>
                      <option value="yes">Offline capture active</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Lock policy
                    <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.offlineGuardrail.queueLockLevel} name="queueLockLevel">
                      <option value="none">No lock</option>
                      <option value="payments-only">Payments-only lock</option>
                      <option value="strict">Strict lock</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Pending uploads
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.offlineGuardrail.pendingUploads} min="0" name="pendingUploads" type="number" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Critical queue
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.offlineGuardrail.pendingCriticalActions} min="0" name="pendingCriticalActions" type="number" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                    Reconnect owner
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.offlineGuardrail.reconnectOwner || workspace.managerName} name="reconnectOwner" placeholder="Owner" />
                  </label>
                </div>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Reconnect deadline
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.offlineGuardrail.reconnectDeadlineAt} name="reconnectDeadlineAt" placeholder="2026-05-28T18:30:00+06:30" />
                </label>
                <button className="sm-button-secondary" disabled={!canEdit} type="submit">Save offline guardrail</button>
              </form>

              <form className="grid gap-3 rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-4" onSubmit={handleTipRecoverySubmit}>
                <p className="sm-kicker text-[var(--sm-accent)]">Pending tip recovery queue</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="orderRef" placeholder="Order ref" required />
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.managerName} name="staffName" placeholder="Staff name" />
                  <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="pending" name="status">
                    <option value="pending">Pending</option>
                    <option value="recovered">Recovered</option>
                    <option value="waived">Waived</option>
                  </select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="expectedTipMmk" placeholder="Expected tip MMK" type="number" />
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="recoveredTipMmk" placeholder="Recovered tip MMK" type="number" />
                </div>
                <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="note" placeholder="Tip recovery note" />
                <button className="sm-button-secondary" disabled={!canEdit} type="submit">Save tip recovery item</button>
              </form>

              <form className="grid gap-3" onSubmit={handlePaymentSubmit}>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-relaxed text-amber-50">
                Use provider-issued QR payloads, payment links, slips, or settlement references for real customer payment proof. If blank, SuperMega creates an internal review QR only; no bank credentials or card data are stored here.
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Order ref
                  <input aria-label="Order ref" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="orderRef" placeholder="INV-1042" required />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Table / channel
                  <input aria-label="Table / channel" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="tableName" placeholder="Counter 2" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Customer name
                  <input aria-label="Customer name" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="customerName" placeholder="Walk-in customer" />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Customer phone
                  <input aria-label="Customer phone" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="customerPhone" placeholder="+95..." />
                </label>
              </div>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                Items sold
                <textarea
                  aria-label="Items sold"
                  className="min-h-20 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none"
                  name="itemSummary"
                  placeholder="2x Mohinga, 1x tea, takeaway fee"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Amount MMK
                  <input aria-label="Amount MMK" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" min="0" name="amountMmk" placeholder="12500" required type="number" />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Provider
                  <input aria-label="Provider" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="provider" placeholder="KBZPay, WavePay, AYA Pay, CBPay, MPU..." />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Tender
                  <select aria-label="Tender type" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" defaultValue="cash" name="tenderType">
                    <option value="cash">Cash</option>
                    <option value="qr">QR wallet</option>
                    <option value="card">Card</option>
                    <option value="bank-transfer">Bank transfer</option>
                    <option value="voucher">Voucher</option>
                    <option value="house">House account</option>
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Status
                  <select aria-label="Status" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="status">
                    <option value="draft">Draft</option>
                    <option value="link-issued">Link issued</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                    <option value="reconcile">Reconcile</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Split group (optional)
                  <input aria-label="Split group" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="splitGroup" placeholder="Order ID for split tender rows" />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Seat / check label
                  <input aria-label="Seat / check label" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="seatLabel" placeholder="Seat 1, Bar-2, Guest A..." />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Collected MMK
                  <input aria-label="Collected MMK" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" min="0" name="collectedMmk" placeholder="12500" type="number" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Refunded MMK
                  <input aria-label="Refunded MMK" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" min="0" name="refundedMmk" placeholder="0" type="number" />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Tip MMK
                  <input aria-label="Tip MMK" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" min="0" name="tipMmk" placeholder="0" type="number" />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Change given MMK
                  <input aria-label="Change given MMK" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" min="0" name="changeGivenMmk" placeholder="0" type="number" />
                </label>
              </div>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Provider QR / payment link / slip reference
                <textarea
                  aria-label="Provider QR / payment link / slip reference"
                  className="min-h-24 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none"
                  name="paymentPayload"
                  placeholder="Paste provider-issued QR payload, payment link, slip text, or confirmation reference. Leave blank for internal review QR only."
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Settlement reference
                  <input aria-label="Settlement reference" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="settlementRef" placeholder="Provider txn/reference" />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  Verified by
                  <input aria-label="Verified by" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="verifiedBy" placeholder="Cashier or manager" />
                </label>
              </div>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                Review note
                <input aria-label="Review note" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="note" placeholder="Settlement note, screenshot reference, or cash-up mismatch" />
              </label>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                Proof note
                <input aria-label="Proof note" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none" name="proofNote" placeholder="Screenshot filename, slip ID, or cashier note" />
              </label>
              <div className="flex flex-wrap gap-3">
                <button className="sm-button-primary" disabled={!canEdit} type="submit">Save payment record</button>
                <button className="sm-button-secondary" disabled={paymentAgentBusy || !canEdit || !canRunAiActions || !isBrowserOnline} onClick={() => void handleQueuePaymentReconciliation()} type="button">
                  {paymentAgentBusy ? 'Queueing...' : 'Review payments'}
                </button>
              </div>
              </form>

              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Register cash desk</p>
                    <h3 className="mt-2 text-xl font-bold text-white">Open, move cash, close with variance</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">
                      Tracks expected cash versus counted cash with reason-coded movements for closeout.
                    </p>
                  </div>
                  <span className="sm-status-pill">
                    {activeRegisterSession ? `${activeRegisterSession.registerId} open` : 'no open register'}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Expected cash</p>
                    <p className="mt-2 text-lg font-bold text-white">
                      {formatMmk(activeRegisterSession?.expectedCashMmk || 0)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Closed variance</p>
                    <p className="mt-2 text-lg font-bold text-white">{formatMmk(closedRegisterVarianceMmk)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Cash movements</p>
                    <p className="mt-2 text-lg font-bold text-white">{workspace.cashMovements.length}</p>
                  </div>
                </div>

                <form className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3" onSubmit={handleRegisterOpenSubmit}>
                  <p className="text-sm font-bold text-white">Open register session</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={activeRegisterSession?.registerId || 'front-register'} name="registerId" placeholder="Register ID" />
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.paymentSetup.cashupOwner || workspace.managerName} name="owner" placeholder="Owner" />
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="openingFloatMmk" placeholder="Opening float MMK" type="number" />
                  </div>
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="openNote" placeholder="Optional opening note" />
                  <div className="flex flex-wrap gap-3">
                    <button className="sm-button-secondary" disabled={!canEdit} type="submit">Open register</button>
                  </div>
                </form>

                <form className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3" onSubmit={handleCashMovementSubmit}>
                  <p className="text-sm font-bold text-white">Cash movement</p>
                  <div className="grid gap-3 md:grid-cols-4">
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={activeRegisterSession?.registerId || 'front-register'} name="registerId" placeholder="Register ID" />
                    <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="add" name="movementType">
                      <option value="add">Add / cash sale</option>
                      <option value="remove">Remove</option>
                      <option value="safe-drop">Safe drop</option>
                      <option value="payout">Payout</option>
                      <option value="tip-out">Tip-out</option>
                    </select>
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="amountMmk" placeholder="Amount MMK" required type="number" />
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.paymentSetup.cashupOwner || workspace.managerName} name="owner" placeholder="Owner" />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="reasonCode" placeholder="Reason code (cash-sale, safe-drop, payout...)" />
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="movementNote" placeholder="Note" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button className="sm-button-secondary" disabled={!canEdit} type="submit">Log cash movement</button>
                  </div>
                </form>

                <form className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3" onSubmit={handleRegisterCloseSubmit}>
                  <p className="text-sm font-bold text-white">Close register session</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={activeRegisterSession?.registerId || 'front-register'} name="registerId" placeholder="Register ID" />
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" min="0" name="countedCashMmk" placeholder="Counted cash MMK" required type="number" />
                  </div>
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="closeNote" placeholder="Variance note or closeout explanation" />
                  <div className="flex flex-wrap gap-3">
                    <button className="sm-button-secondary" disabled={!canEdit} type="submit">Close register</button>
                    <button className="sm-button-secondary" disabled={!canEdit} onClick={requestCloseoutApproval} type="button">Request closeout approval</button>
                  </div>
                </form>
              </article>
            </div>
          ) : null}

          {activeModule === 'payment' ? (
            <div className="sm-pos-terminal-stack mt-5">
              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="rounded-2xl bg-white p-3">
                    {paymentQrDataUrl ? <img alt="Payment code" className="h-36 w-36" src={paymentQrDataUrl} /> : <div className="h-36 w-36" />}
                  </div>
                  <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Payment proof</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{latestPayment ? latestPayment.orderRef : 'No payment record yet'}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {latestPayment
                        ? `${latestPayment.amountMmk.toLocaleString()} MMK / ${latestPayment.provider} / ${latestPayment.tenderType} / ${latestPayment.status}${latestPayment.seatLabel ? ` / ${latestPayment.seatLabel}` : ''}`
                        : 'Create the first order payment record to preview a QR.'}
                    </p>
                    {latestPayment ? (
                      <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                        Collected {latestPayment.collectedMmk.toLocaleString()} / Refunded {latestPayment.refundedMmk.toLocaleString()} / Tip {latestPayment.tipMmk.toLocaleString()} / Change {latestPayment.changeGivenMmk.toLocaleString()} MMK
                      </p>
                    ) : null}
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-sm font-bold text-white">{latestPaymentReadiness.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--sm-muted)]">{latestPaymentReadiness.detail}</p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/80">
                    Provider-issued payment QR payloads, payment links, slips, and settlement refs are treated as proof. Internal SuperMega review QR codes are not customer payment QR codes.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="sm-button-secondary !px-4 !py-2 text-sm" onClick={() => void copyLatestPaymentQrValue()} type="button">
                        Copy proof payload
                      </button>
                      {latestPaymentLink ? (
                        <a className="sm-button-primary !px-4 !py-2 text-sm" href={latestPaymentLink} rel="noreferrer" target="_blank">
                          Open payment link
                        </a>
                      ) : null}
                      {latestPayment ? (
                        <>
                          <button className="sm-button-secondary !px-4 !py-2 text-sm" disabled={!canEdit} onClick={() => handlePaymentStatus(latestPayment.id, 'link-issued')} type="button">
                            Mark issued
                          </button>
                          <button className="sm-button-secondary !px-4 !py-2 text-sm" disabled={!canEdit} onClick={() => handlePaymentStatus(latestPayment.id, 'partial')} type="button">
                            Mark partial
                          </button>
                          <button className="sm-button-secondary !px-4 !py-2 text-sm" disabled={!canEdit} onClick={() => handlePaymentStatus(latestPayment.id, 'paid')} type="button">
                            Mark paid
                          </button>
                          <button className="sm-button-secondary !px-4 !py-2 text-sm" disabled={!canEdit} onClick={() => handlePaymentStatus(latestPayment.id, 'refunded')} type="button">
                            Mark refunded
                          </button>
                          <button className="sm-button-secondary !px-4 !py-2 text-sm" disabled={!canEdit} onClick={() => handlePaymentStatus(latestPayment.id, 'reconcile')} type="button">
                            Reconcile
                          </button>
                        </>
                      ) : null}
                    </div>
                    {latestPaymentQrValue ? (
                      <code className="mt-3 block max-w-xl break-all rounded-2xl border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-white/75">
                        {latestPaymentQrValue}
                      </code>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Payment closeout</p>
                <div className="mt-3 grid gap-2">
                  {workspace.payments.length ? (
                    workspace.payments.slice(0, 8).map((item) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={item.id}>
                        {(() => {
                          const coverage = orderCoverage.get(item.orderRef.trim() || item.splitGroup.trim())
                          const remainingMmk = coverage ? Math.max(0, coverage.expected - coverage.collected + coverage.refunded) : 0
                          return (
                            <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.orderRef}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">{item.provider} / {item.tenderType} / {item.tableName || 'counter'} / {formatTime(item.createdAt)}</p>
                          </div>
                          <span className="sm-status-pill">{item.status}</span>
                        </div>
                        <p className="mt-3 text-sm text-white/80">
                          {item.amountMmk.toLocaleString()} MMK
                          {item.splitGroup ? ` / split ${item.splitGroup}` : ''}
                          {item.seatLabel ? ` / ${item.seatLabel}` : ''}
                          {item.note ? ` / ${item.note}` : ''}
                        </p>
                        {item.itemSummary || item.settlementRef || item.proofNote ? (
                          <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                            {item.itemSummary ? `Items: ${item.itemSummary}. ` : ''}
                            {item.settlementRef ? `Settlement: ${item.settlementRef}. ` : ''}
                            {item.proofNote ? `Proof: ${item.proofNote}.` : ''}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                          Collected {item.collectedMmk.toLocaleString()} / Refunded {item.refundedMmk.toLocaleString()} / Tip {item.tipMmk.toLocaleString()} / Change {item.changeGivenMmk.toLocaleString()} MMK
                        </p>
                        {coverage ? (
                          <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                            Order coverage: expected {coverage.expected.toLocaleString()} / collected {coverage.collected.toLocaleString()} / remaining {remainingMmk.toLocaleString()} MMK
                          </p>
                        ) : null}
                            </>
                          )
                        })()}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No payment records yet. Add order ref, amount, provider, and status from the cashier flow.</p>
                  )}
                </div>
              </article>

              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Reconciliation scope</p>
                <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-2xl bg-black/30 p-3 text-xs leading-relaxed text-white/78">{paymentReconciliationText}</pre>
                <p className="mt-3 text-xs leading-relaxed text-[var(--sm-muted)]">
                  Prepared output must cite source records and route partial/paid/refunded/reconcile changes back to a human cash-up owner before status changes become official.
                </p>
              </article>

              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Tip recovery and shift review</p>
                <div className="mt-3 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Shift review</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {workspace.shiftReviewLock.status} / {workspace.shiftReviewLock.owner || 'owner missing'}
                    </p>
                    {workspace.shiftReviewLock.note ? (
                      <p className="mt-1 text-xs leading-relaxed text-[var(--sm-muted)]">{workspace.shiftReviewLock.note}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleShiftReviewLockStatus('locked')} type="button">Lock</button>
                      <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleShiftReviewLockStatus('open')} type="button">Open</button>
                      <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleShiftReviewLockStatus('released')} type="button">Release</button>
                    </div>
                  </div>
                  {workspace.tipRecoveries.length ? (
                    workspace.tipRecoveries.slice(0, 8).map((item) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.orderRef || 'order missing'}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              {item.staffName || 'staff missing'} / expected {formatMmk(item.expectedTipMmk)} / recovered {formatMmk(item.recoveredTipMmk)}
                            </p>
                          </div>
                          <span className="sm-status-pill">{item.status}</span>
                        </div>
                        {item.note ? <p className="mt-2 text-xs text-[var(--sm-muted)]">{item.note}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTipRecoveryStatus(item.id, 'pending')} type="button">Pending</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTipRecoveryStatus(item.id, 'recovered')} type="button">Recovered</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTipRecoveryStatus(item.id, 'waived')} type="button">Waived</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No tip recovery rows yet. Use the capture panel to add pending tip items.</p>
                  )}
                </div>
              </article>

              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Offline guardrail status</p>
                <div className="mt-3 grid gap-2">
                  <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/82">
                    Capture: {workspace.offlineGuardrail.isOfflineCaptureActive ? 'offline active' : 'online'} / lock {workspace.offlineGuardrail.queueLockLevel}
                  </p>
                  <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/82">
                    Pending uploads {workspace.offlineGuardrail.pendingUploads} / critical {workspace.offlineGuardrail.pendingCriticalActions} / deadline {workspace.offlineGuardrail.reconnectDeadlineAt || 'not set'}
                  </p>
                </div>
              </article>
            </div>
          ) : activeModule === 'qr-menu' ? (
            <form className="mt-5 grid gap-4" onSubmit={handleMenuSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-[var(--sm-muted)]">
                  Public slug
                  <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.menu.publicSlug} name="publicSlug" placeholder="main-branch-menu" />
                </label>
                <label className="grid gap-2 text-sm text-[var(--sm-muted)]">
                  Mode
                  <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.menu.orderingMode} name="orderingMode">
                    <option value="digital-menu">Digital menu only</option>
                    <option value="order-request">Collect order requests</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-2 text-sm text-[var(--sm-muted)]">
                Upload source menu
                <input
                  accept="image/*,.pdf,.txt,.csv"
                  className="rounded-2xl border border-dashed border-white/20 bg-black/30 px-4 py-4 text-sm text-white outline-none file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-bold file:text-slate-950"
                  disabled={!canEdit}
                  multiple
                  onChange={(event) => void handleMenuFiles(event.target.files)}
                  type="file"
                />
              </label>
              <label className="grid gap-2 text-sm text-[var(--sm-muted)]">
                Menu text for guided extraction
                <textarea
                  className="min-h-44 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                  onChange={(event) => setMenuSourceText(event.target.value)}
                  placeholder={`Burgers\nClassic Burger - beef, cheese, pickles - 8.50\nChicken Burger - crispy chicken - 7.50\n\nDrinks\nIced Tea - 2.00`}
                  readOnly={!canEdit}
                  value={menuSourceText}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button className="sm-button-primary" disabled={!canEdit} type="submit">Generate customer menu</button>
                <button className="sm-button-secondary" disabled={menuAgentBusy || !canEdit || !canRunAiActions || !isBrowserOnline} onClick={() => void handleQueueMenuExtraction()} type="button">
                  {menuAgentBusy ? 'Queueing...' : 'Review menu extraction'}
                </button>
                <button className="sm-button-secondary" onClick={downloadMenuHtml} type="button">Download menu page</button>
                <button className="sm-button-secondary" onClick={printMenuPage} type="button">Print / save PDF</button>
              </div>
            </form>
          ) : null}
        </article>
        ) : null}

        {showQueuePane ? (
        <article className="sm-terminal sm-restaurant-main-pane sm-restaurant-main-pane-queue p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Today queue</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{compactViewport ? 'Priority queue' : 'Work that needs attention.'}</h2>
            </div>
            {!compactViewport ? <span className="sm-status-pill">{message}</span> : null}
          </div>
          {activeModule === 'enterprise' ? (
            <div className="sm-pos-terminal-stack is-enterprise mt-5">
              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Owner closeout brief</p>
                <div className="mt-3 grid gap-2">
                  {enterpriseControl.ownerBrief.map((item) => (
                    <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-relaxed text-white/82" key={item}>{item}</p>
                  ))}
                </div>
              </article>

              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Permission boundary</p>
                <div className="mt-3 grid gap-2">
                  {enterpriseControl.permissionBoundary.map((item) => (
                    <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-relaxed text-white/82" key={item}>{item}</p>
                  ))}
                </div>
              </article>

              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Release controls</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {enterpriseControl.releaseControls.map((item) => (
                    <span className="sm-status-pill" key={item}>{item}</span>
                  ))}
                </div>
              </article>

              <article className="sm-pos-terminal-card rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Audit trail</p>
                <div className="mt-3 grid gap-2">
                  {recentAuditTrail.length ? (
                    recentAuditTrail.map((item) => (
                      <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/82" key={item.id}>
                        <strong className="mr-2 text-white">{item.event}</strong>
                        {item.detail}
                        <br />
                        {item.actor} / {item.actorRole} / {item.severity} / {formatTime(item.createdAt)}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No audit records yet.</p>
                  )}
                </div>
              </article>
            </div>
          ) : activeModule === 'stock' ? (
            <div className="mt-5 grid gap-4">
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Below par</p>
                    <p className="mt-2 text-lg font-bold text-white">{summary.stockoutRisks}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Waste units</p>
                    <p className="mt-2 text-lg font-bold text-white">{summary.wasteUnits}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Reorder items</p>
                    <p className="mt-2 text-lg font-bold text-white">{stockReorderRows.length}</p>
                  </div>
                </div>
              </article>
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Reorder plan</p>
                <div className="mt-3 grid gap-3">
                  {stockReorderRows.length ? (
                    stockReorderRows.slice(0, 12).map((row) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={row.itemName}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{row.itemName}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              Par {row.par} / Current {row.current} / Waste {row.waste}
                            </p>
                          </div>
                          <span className={`sm-status-pill ${row.urgency === 'high' ? 'bg-rose-400/20 text-rose-100' : 'bg-amber-300/20 text-amber-100'}`}>
                            {row.urgency} / order {row.reorderQty}
                          </span>
                        </div>
                        {row.supplierIssue || row.action ? (
                          <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                            {row.supplierIssue ? `Issue: ${row.supplierIssue}. ` : ''}{row.action ? `Action: ${row.action}.` : ''}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No reorder risks right now. Keep par/current/waste entries updated each shift.</p>
                  )}
                </div>
              </article>
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Transfer lifecycle</p>
                <div className="mt-3 grid gap-3">
                  {workspace.inventoryTransfers.length ? (
                    workspace.inventoryTransfers.slice(0, 10).map((item) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.itemName}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              {item.fromLocation} {'->'} {item.toLocation} / req {item.requestedQty} / dispatch {item.dispatchedQty} / receive {item.receivedQty}
                            </p>
                          </div>
                          <span className="sm-status-pill">{item.status}</span>
                        </div>
                        {item.varianceNote ? <p className="mt-2 text-xs text-[var(--sm-muted)]">{item.varianceNote}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTransferStatus(item.id, 'requested')} type="button">Requested</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTransferStatus(item.id, 'dispatched')} type="button">Dispatched</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTransferStatus(item.id, 'received')} type="button">Received</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTransferStatus(item.id, 'variance')} type="button">Variance</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No transfer records yet. Capture request-dispatch-receive flow from the stock lane.</p>
                  )}
                </div>
              </article>
            </div>
          ) : activeModule === 'tables' ? (
            <div className="mt-5 grid gap-4">
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Open tables</p>
                    <p className="mt-2 text-lg font-bold text-white">{openTables}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Bill requests</p>
                    <p className="mt-2 text-lg font-bold text-white">{summary.tableServiceAlerts}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Timer bands</p>
                    <p className="mt-2 text-lg font-bold text-white">
                      G {tableIndicatorCounts.green} / Y {tableIndicatorCounts.yellow} / R {tableIndicatorCounts.red}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Active devices</p>
                    <p className="mt-2 text-lg font-bold text-white">{activeServiceDevices.length}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">
                    Yellow after (min)
                    <input
                      className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none"
                      min={1}
                      onChange={(event) => setTableYellowAfterMinutes(Math.max(1, Number(event.target.value) || 20))}
                      type="number"
                      value={tableYellowAfterMinutes}
                    />
                  </label>
                  <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">
                    Red after (min)
                    <input
                      className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold normal-case tracking-normal text-white outline-none"
                      min={tableYellowAfterMinutes + 1}
                      onChange={(event) => setTableRedAfterMinutes(Math.max(tableYellowAfterMinutes + 1, Number(event.target.value) || 40))}
                      type="number"
                      value={tableRedAfterMinutes}
                    />
                  </label>
                </div>
              </article>
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Floor board</p>
                <div className="mt-3 grid gap-3">
                  {tableServiceRows.length ? (
                    tableServiceRows.slice(0, 10).map(({ table, ageMinutes, band }) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={table.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{table.tableName}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              {table.floorZone} / {table.guestCount} guest(s) / seats {table.seats}{table.assignedServer ? ` / ${table.assignedServer}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <span className="sm-status-pill">{table.status}</span>
                            <span className={`sm-status-pill ${band === 'red' ? 'bg-rose-400/20 text-rose-100' : band === 'yellow' ? 'bg-amber-300/25 text-amber-100' : 'bg-emerald-300/20 text-emerald-100'}`}>
                              {ageMinutes} min / {band}
                            </span>
                          </div>
                        </div>
                        {table.orderRef || table.note ? (
                          <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                            {table.orderRef ? `Order ${table.orderRef}` : ''}{table.orderRef && table.note ? ' / ' : ''}{table.note || ''}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTableStatus(table.id, 'seated')} type="button">Seated</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTableStatus(table.id, 'ordered')} type="button">Ordered</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTableStatus(table.id, 'served')} type="button">Served</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTableStatus(table.id, 'bill-requested')} type="button">Bill requested</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTableStatus(table.id, 'paid')} type="button">Paid</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleTableStatus(table.id, 'reset')} type="button">Reset</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No table records yet. Add tables from the capture panel.</p>
                  )}
                </div>
              </article>
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Split check board</p>
                <div className="mt-3 grid gap-3">
                  {splitCoverageRows.length ? (
                    splitCoverageRows.slice(0, 10).map((row) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={row.groupKey}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{row.orderRef}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              {row.tableName || 'counter'} / {row.lineCount} payment line(s){row.seatLabels ? ` / ${row.seatLabels}` : ''}
                            </p>
                          </div>
                          <span className="sm-status-pill">
                            {row.remainingMmk > 0 ? `Remaining ${formatMmk(row.remainingMmk)}` : 'Covered'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                          Expected {formatMmk(row.expectedMmk)} / Collected {formatMmk(row.collectedMmk)} / Refunded {formatMmk(row.refundedMmk)}
                        </p>
                        {row.statuses ? <p className="mt-1 text-xs leading-relaxed text-[var(--sm-muted)]">Statuses: {row.statuses}</p> : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No split checks yet. Add payment rows with split group and seat/check label.</p>
                  )}
                </div>
              </article>
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Service-device map</p>
                <div className="mt-3 grid gap-3">
                  {workspace.serviceDevices.length ? (
                    workspace.serviceDevices.slice(0, 10).map((item) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.deviceLabel}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              {item.laneType} / {item.laneRef} / {item.station} / {item.deviceType} / {item.owner || 'owner missing'}
                            </p>
                          </div>
                          <span className="sm-status-pill">{item.status}</span>
                        </div>
                        {item.note ? <p className="mt-2 text-xs text-[var(--sm-muted)]">{item.note}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleDeviceRemove(item.id)} type="button">Remove</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No service-device assignments yet.</p>
                  )}
                </div>
              </article>
            </div>
          ) : activeModule === 'kitchen' ? (
            <div className="mt-5 grid gap-4">
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Active tickets</p>
                    <p className="mt-2 text-lg font-bold text-white">{kitchenActiveTickets}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Delayed tickets</p>
                    <p className="mt-2 text-lg font-bold text-white">{summary.kitchenDelayedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Rush tickets</p>
                    <p className="mt-2 text-lg font-bold text-white">{workspace.kitchenTickets.filter((ticket) => ticket.priority === 'rush').length}</p>
                  </div>
                </div>
              </article>
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Kitchen SLA board</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', 'All'],
                      ['active', 'Active'],
                      ['delayed', 'Delayed'],
                      ['rush', 'Rush'],
                    ].map(([id, label]) => (
                      <button
                        className={`sm-button-secondary !px-3 !py-2 text-xs ${kitchenStatusFilter === id ? 'bg-[var(--sm-accent)] text-slate-950' : ''}`}
                        key={id}
                        onClick={() => setKitchenStatusFilter(id as 'all' | 'active' | 'delayed' | 'rush')}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                    onChange={(event) => setKitchenStationFilter(event.target.value)}
                    value={kitchenStationFilter}
                  >
                    <option value="all">All stations</option>
                    {kitchenStations.map((station) => (
                      <option key={station} value={station}>{station}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 grid gap-3">
                  {kitchenVisibleRows.length ? (
                    kitchenVisibleRows.slice(0, 12).map(({ ticket, lateMinutes }) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={ticket.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{ticket.orderRef}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              {ticket.station} / {ticket.tableName || 'counter'} / {ticket.priority}{ticket.targetReadyAt ? ` / target ${ticket.targetReadyAt}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <span className="sm-status-pill">{ticket.status}</span>
                            {lateMinutes > 0 && ticket.status !== 'served' ? (
                              <span className="sm-status-pill bg-rose-400/20 text-rose-100">Late {lateMinutes} min</span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-white/85">{ticket.itemSummary || 'No items listed.'}</p>
                        {ticket.note ? <p className="mt-2 text-xs text-[var(--sm-muted)]">{ticket.note}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleKitchenTicketStatus(ticket.id, 'queued')} type="button">Queued</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleKitchenTicketStatus(ticket.id, 'firing')} type="button">Firing</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleKitchenTicketStatus(ticket.id, 'ready')} type="button">Ready</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleKitchenTicketStatus(ticket.id, 'served')} type="button">Served</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleKitchenTicketStatus(ticket.id, 'delayed')} type="button">Delayed</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No kitchen tickets for this filter. Add tickets from capture or change filters.</p>
                  )}
                </div>
              </article>
            </div>
          ) : activeModule === 'approvals' ? (
            <div className="mt-5 grid gap-4">
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Pending</p>
                    <p className="mt-2 text-lg font-bold text-white">{summary.pendingApprovalCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Pending value</p>
                    <p className="mt-2 text-lg font-bold text-white">{formatMmk(pendingApprovalValueMmk)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Total requests</p>
                    <p className="mt-2 text-lg font-bold text-white">{workspace.approvals.length}</p>
                  </div>
                </div>
              </article>
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Approval queue</p>
                <div className="mt-3 grid gap-3">
                  {workspace.approvals.length ? (
                    workspace.approvals.slice(0, 12).map((approval) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={approval.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{approval.actionType} / {approval.orderRef || 'order missing'}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">
                              {approval.tableName || 'counter'} / {formatMmk(approval.amountMmk)} / requested by {approval.requestedBy}
                            </p>
                          </div>
                          <span className="sm-status-pill">{approval.status}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">{approval.reason}{approval.note ? ` / ${approval.note}` : ''}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleApprovalStatus(approval.id, 'approved')} type="button">Approve</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleApprovalStatus(approval.id, 'rejected')} type="button">Reject</button>
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleApprovalStatus(approval.id, 'pending')} type="button">Set pending</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No approval requests yet. Use the capture panel to create one.</p>
                  )}
                </div>
              </article>
            </div>
          ) : activeModule === 'qr-menu' ? (
            <div className="mt-5 grid gap-4">
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="rounded-2xl bg-white p-3">
                    {qrDataUrl ? <img alt="Restaurant customer menu" className="h-36 w-36" src={qrDataUrl} /> : <div className="h-36 w-36" />}
                  </div>
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Customer menu</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{workspace.branchName}</h3>
                    <p className="mt-2 break-all text-sm text-[var(--sm-muted)]">{menuUrl}</p>
                    <p className="mt-3 text-sm leading-relaxed text-white/80">
                      This produces a scannable customer menu, printable HTML/PDF page, and public customer route. Long menus should be published through the live client backend.
                    </p>
                  </div>
                </div>
              </article>

              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Extraction result</p>
                <div className="mt-3 grid gap-2">
                  {workspace.menu.items.length ? (
                    workspace.menu.items.slice(0, 8).map((item) => (
                      <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3" key={item.id}>
                        <div>
                          <p className="font-semibold text-white">{item.name}</p>
                          <p className="mt-1 text-xs text-[var(--sm-muted)]">{item.section}{item.description ? ` / ${item.description}` : ''}</p>
                        </div>
                        <span className="font-bold text-white">{item.price.toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">Paste menu text or upload TXT/CSV to draft items. Queue PDFs/images for the live extraction review task.</p>
                  )}
                </div>
              </article>

              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Sources</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {menuSourceFiles.length ? menuSourceFiles.map((file) => (
                    <span className="sm-status-pill" key={`${file.name}-${file.size}`}>{file.name}</span>
                  )) : <span className="sm-status-pill">No file attached</span>}
                </div>
              </article>

              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Daypart schedule</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  Active schedules: {activeDaypartScheduleCount}{activeMenuDaypart ? ` / now ${activeMenuDaypart.daypart} (${activeMenuDaypart.menuLabel})` : ' / no active window now'}
                </p>
                <form className="mt-3 grid gap-3" onSubmit={handleMenuScheduleSubmit}>
                  <div className="grid gap-3 md:grid-cols-4">
                    <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="opening" name="daypart">
                      <option value="opening">Opening</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Dinner</option>
                      <option value="close">Close</option>
                    </select>
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="08:00" name="startTime" placeholder="Start HH:MM" />
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="22:00" name="endTime" placeholder="End HH:MM" />
                    <select className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue="yes" name="active">
                      <option value="yes">Active</option>
                      <option value="no">Inactive</option>
                    </select>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" name="menuLabel" placeholder="Menu label (Breakfast menu)" required />
                    <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" defaultValue={workspace.managerName || workspace.paymentSetup.cashupOwner} name="updatedBy" placeholder="Updated by" />
                  </div>
                  <button className="sm-button-secondary" disabled={!canEdit} type="submit">Add daypart schedule</button>
                </form>
                <div className="mt-3 grid gap-2">
                  {workspace.menuDaypartSchedules.length ? (
                    workspace.menuDaypartSchedules.slice(0, 8).map((item) => (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.daypart} / {item.menuLabel}</p>
                            <p className="mt-1 text-xs text-[var(--sm-muted)]">{item.startTime}-{item.endTime} / updated by {item.updatedBy || 'owner missing'}</p>
                          </div>
                          <span className="sm-status-pill">{item.active ? 'active' : 'inactive'}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="sm-button-secondary !px-3 !py-2 text-xs" disabled={!canEdit} onClick={() => handleMenuScheduleToggle(item.id, !item.active)} type="button">
                            {item.active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--sm-muted)]">No schedule windows yet.</p>
                  )}
                </div>
              </article>
            </div>
          ) : (
          <div className="mt-5 grid gap-3">
            {queue.length ? (
              queue.slice(0, 10).map((item) => (
                <article className="sm-proof-card" key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs text-[var(--sm-muted)]">{item.route} / {formatTime(item.createdAt)}</p>
                    </div>
                    <span className="sm-status-pill">{item.priority}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[var(--sm-muted)]">
                No records yet. Save the first shift, stock, table, kitchen, approval, guest, or margin record.
              </p>
            )}
          </div>
          )}
        </article>
        ) : null}
      </section>
    </div>
  )
}
