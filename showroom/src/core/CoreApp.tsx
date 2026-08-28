import { lazy, Suspense, type ChangeEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  shopBusinessTemplate,
  shopBusinessTemplateCommerceItems,
  shopBusinessTemplateFromQuery,
  shopBusinessTemplates,
  type ShopBusinessTemplate,
} from '../products/shop/business-templates'
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router'

import './core-app.css'
import type { EcommerceShopDraft } from '../products/ecommerce/ecommerce-shop-handoff'
import type { EcommerceCancellationIntent, EcommerceCorrectionIntent, EcommerceOrderAmendmentIntent, EcommerceOrderRequestV2, EcommerceOrderRescheduleIntent, EcommerceReturnIntent, EcommerceShopDraftV2, EcommerceSupportIntent } from '../products/ecommerce/ecommerce-buying-lifecycle'
import type { WebsiteEcommerceHandoffContext, WebsiteOrderRecord } from '../products/product-handoff'
import { type ManagedIdentity } from './managed-trial'
import { recordBehaviorSignal } from './behavior-trail'
import { downloadBlob } from './download-file'
import { emitMetric } from '../analytics/metrics-collector'
import { BarcodeScanButton } from './BarcodeScanButton'
import { Empty, PageHeading, type RuntimeHealth } from './CoreShell'
import { activeCommerceTab, commerceTabs, type CommerceTab } from './commerce-tabs'
import { bi } from './i18n-actions'
import { managedTrialProofFragmentFields, type ManagedTrialProof } from './managed-trial-proof'
import {
  ACTION_KEY,
  productContracts,
  productDisplayName,
  SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
  SHOP_ORDER_DRAFT_RESET_PREFIX,
  clientSetupPath,
  type SetupProductId,
} from './product-setup'
import {
  PlantReviewRequiredError,
  ShopReviewRequiredError,
  commerceActionProof,
  confirmAccountableAction,
  normalizeActions,
  productionActionProof,
  useCommerceWorkspace,
  localShopConfirmed,
  useManagedIdentity,
  useProductionWorkspace,
  useSetupWorkspace,
  useStoredState,
  type AccountableAction,
  type ActionDetails,
  type ActionDomain,
  type PendingAccountableAction,
} from './workspace-runtime'
import { getStorageDurability, measureCommerceHeadroom, subscribeStorageDurability } from './storage-durability'
import { formatTime } from './team-work'
import { ProductPhoto, ShopProductPhotoControl } from './ProductPhoto'
import { PaymentQrButton } from './PaymentQr'
import { paymentQrScopeForWorkspace } from './payment-qr-store'
import { productImageScopeForWorkspace } from './product-image-store'
import { SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX, readShopLoyaltySettings, shopLoyaltyBalances, shopLoyaltyDisplayPoints, shopLoyaltyRedeemedPointsForOrder, shopLoyaltyRedemptionAllowed, shopLoyaltyScopeForWorkspace } from './shop-loyalty'
import { projectShopProfitControl } from './shop-profit-control'
import { managedPlantStarterPlan, plantIndustryPack, plantIndustryPackIdFromSearch, readPlantIndustryPackId } from './plant-industry-packs'
import {
  advanceCommerceOrder,
  approveCommercePurchaseBudgetEnvelope,
  approveCommercePurchaseRequisition,
  approveCommerceSupplierSourcingDecision,
  authorizeCommerceSupplierReturn,
  cancelCommercePurchaseOrder,
  cancelCommerceOrder,
  countCommerceStock,
  commerceAccountingHandoff,
  commerceAccountingHandoffCsv,
  commerceDailyCloseCsv,
  commerceDailyCloseExport,
  commerceCloseExpectation,
  commerceCloseSettlementReview,
  commerceCorrectionCalculation,
  commerceCurrentTaxConfiguration,
  commerceCurrentAccountMappingConfiguration,
  commerceCurrentCustomerCreditPolicy,
  commerceCurrentPromotionPolicy,
  commerceCurrentShippingPolicy,
  commerceCurrentPaymentPolicy,
  commerceCustomerCreditReview,
  commerceOrderCalculation,
  commerceOrderAcknowledgement,
  commerceOrderAcknowledgementReader,
  commerceOrderAcknowledgementText,
  commerceOrderCorrectionExpectation,
  commerceOrderAdjustedTotal,
  commerceOrderReturnExpectation,
  commerceOrderSupportOpenExpectation,
  commerceOrderSupportReopenExpectation,
  commerceOrderSupportResolveExpectation,
  commerceOrderSupportServiceExpectation,
  commerceSupportCaseUrgency,
  commerceSupportCheckpointState,
  commerceSupportQueue,
  commerceSupportSlaSummary,
  commerceSupportServiceState,
  commerceSupportWorkloadCsv,
  commerceSupportWorkloadExport,
  commerceOrderItemSummary,
  commerceOrderLocationAllocationPreview,
  commerceOrderNeedsAction,
  commerceOrderHasReleasableReservation,
  commerceOrderPromiseUrgency,
  commerceReceivablesAging,
  compareCommercePurchaseOrderAttention,
  commercePurchaseOrderArrivalUrgency,
  commercePurchaseOrderProgress,
  commercePurchaseOrders,
  commercePurchaseBudgetCommitment,
  commercePurchaseBudgetEnvelopes,
  commercePurchaseRequisitions,
  commerceSupplierSourcingDecisions,
  commerceSupplierSourcingSelectedQuote,
  commerceSupplierInvoiceMatch,
  commerceSupplierPayablesHandoff,
  commerceSupplierPayablesHandoffCsv,
  commerceSupplierPayablesAging,
  commerceCustomerReceivablesHandoff,
  commerceCustomerReceivablesHandoffCsv,
  commerceSupplierReturnClaimBalance,
  commerceSupplierReturnClaimStatus,
  commerceSupplierPerformance,
  commerceStorefrontRequestLines,
  commerceStorefrontRequests,
  commerceWebsiteIntakes,
  commerceWorkingSampleCatalogId,
  convertCommerceWebsiteIntake,
  configureCommerceTax,
  configureCommerceAccountMapping,
  configureCommerceCustomerCreditPolicy,
  configureCommercePromotionPolicy,
  configureCommerceShippingPolicy,
  configureCommercePaymentPolicy,
  createCommerceCatalogBaseline,
  createCommercePurchaseOrder,
  markCommerceSupplierInvoicePayableReady,
  recordCommerceSupplierInvoice,
  recordCommerceSupplierCreditNote,
  receiveCommercePurchaseOrder,
  reconcileCommercePayment,
  recordCommerceCollectionAction,
  recordCommerceOrderReturn,
  recordCommerceOrderSupportCase,
  recordCommerceOrderSupportServiceEvent,
  reopenCommerceOrderSupportCase,
  resolveCommerceOrderSupportCase,
  recordCommerceOrderCorrection,
  registerCommerceItem,
  reserveCommerceOrder,
  restoreBrowserLocalSamplePaymentPolicies,
  saveCommerceClose,
  settleCommerceRefund,
  updateCommerceItem,
  validateCommerceState,
  type CommerceActionProof,
  type CommerceCloseSettlementInputLine,
  type CommerceCorrectionKind,
  type CommerceCorrectionReasonCode,
  type CommerceItem,
  type CommerceItemUpdate,
  type CommerceOrder,
  type CommerceOrderLine,
  type CommerceOrderStatus,
  type CommerceState,
  type CommercePurchaseOrderDiscrepancyCode,
  type CommerceSupplierReturnClaim,
  type CommerceReturnDisposition,
  type CommerceSupportResolutionOutcome,
  type CommerceSupportPriority,
  type CommerceSupportServiceEventKind,
  type CommerceStockMovement,
  type CommerceTaxConfiguration,
  type CommerceTaxMode,
  type CommerceCustomerCreditPolicyStatus,
  type CommerceDailyCloseExport,
  type CommerceOrderAcknowledgement,
  type CommerceWebsiteOrderInput,
} from './commerce-workspace'
import { projectShopInventory } from './shop-inventory-foundation'
import { projectShopArAgingSummary } from './shop-ar-aging-summary'
import { projectShopApAgingSummary } from './shop-ap-aging-summary'
import { buildShopLedgerJournal } from './shop-ledger-journal'
import { projectShopMonthlyStatement } from './shop-monthly-statement'
import { projectProductionMaterialRequirements } from './production-material-handoff'
import { channelOrderDraftIsReady, type ChannelOrderDraft } from './channel-order-intake'
import type {
  CommerceOrderDraft,
  CommerceOrderDraftInput,
  CommerceOrderDraftReadResult,
} from './commerce-order-draft'
import {
  buildProductionShiftHandoff,
  buildProductionBatchGenealogy,
  buildProductionCertificateOfConformance,
  buildProductionQualityCorrectiveAction,
  isCapaEffectivenessOverdue,
  buildProductionRecallTrace,
  closeProductionJob,
  compareProductionJobSchedule,
  completeProductionMaintenance,
  currentProductionShiftCloseEvidence,
  endProductionDowntime,
  formatProductionShiftHandoff,
  formatProductionBatchGenealogy,
  formatProductionCertificateOfConformance,
  formatProductionRecallTrace,
  productionCertificateOfConformanceText,
  openProductionIssue,
  parseProductionMaterialQuantity,
  placeProductionQualityHold,
  productionDowntimeIntervals,
  productionIssueSeverities,
  productionJobPriorities,
  productionMaintenanceDueQueue,
  productionMaintenanceFindingSource,
  productionMaintenanceRecords,
  productionMaterialUnits,
  productionQualityCauseCategories,
  productionMachineStates,
  productionShopDemandSource,
  productionShiftOutput,
  productionStateCanonical,
  productionWorkingSamplePackId,
  recordProductionOutput,
  recordProductionScrap,
  recordProductionMaterialConsumption,
  recordProductionMachineState,
  recordProductionShiftClose,
  registerProductionJob,
  releaseProductionQualityHold,
  resolveProductionIssue,
  startProductionDowntime,
  startProductionMaintenance,
  updateProductionJobPlan,
  validateProductionState,
  type ProductionActionProof,
  type ProductionDowntimeInterval,
  type ProductionEvent,
  type ProductionIssue,
  type ProductionIssueSeverity,
  type ProductionJob,
  type ProductionJobPriority,
  type ProductionMaintenanceOutcome,
  type ProductionMaintenanceCorrectiveAction,
  type ProductionMaintenanceFindingSource,
  type ProductionMaintenanceRecord,
  type ProductionMaintenanceResult,
  type ProductionMaintenanceReturnToService,
  type ProductionMaterialUnit,
  type ProductionMachineState,
  type ProductionOutputKind,
  type ProductionQualityCauseCategory,
  type ProductionQualityCorrectiveAction,
  type ProductionShiftHandoff,
  type ProductionCertificateOfConformance,
} from './production-workspace'
import {
  projectShopProductionDemand,
  shopProductionDemandIsCurrent,
  type ShopProductionDemandSignal,
} from './shop-production-demand'
import { projectPlantOrder } from './plant-order-foundation'
import { productionOrderPortfolioEntries } from './production-order-portfolio'
import { projectShopDemandIntelligence } from './shop-demand-intelligence'
import { projectShopProcurementDecision, projectShopReplenishment } from './shop-replenishment'
import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  readShopServiceSchedule,
  shopIndustryPack,
  shopScheduleVocabulary,
  type ShopIndustryPack,
  type ShopServiceSchedule as ShopServiceScheduleState,
} from './shop-service-scheduling'
import { projectShopAppointmentTillReconciliation } from './shop-appointment-till-reconciliation'
import { decideShopNextAction } from './shop-next-action'
import { projectShopCloseAnomalyFlags, type ShopCloseAnomalyFlag, type ShopCloseAnomalyFlags } from './shop-close-anomaly-flags'
import { lockedCapabilityNotice } from './capability-tiers'

const WebsiteCommerceIntake = lazy(() => import('../products/WebsiteCommerceIntake').then((module) => ({ default: module.WebsiteCommerceIntake })))

const ChannelOrderIntake = lazy(() => import('./ChannelOrderIntake').then((module) => ({ default: module.ChannelOrderIntake })))
const ShopInventoryFoundation = lazy(() => import('./ShopInventoryFoundation').then((module) => ({ default: module.ShopInventoryFoundation })))
const ShopOperatingFlow = lazy(() => import('./ShopOperatingFlow').then((module) => ({ default: module.ShopOperatingFlow })))
const ShopServiceSchedule = lazy(() => import('./ShopServiceSchedule').then((module) => ({ default: module.ShopServiceSchedule })))
const ShopToday = lazy(() => import('./ShopToday').then((module) => ({ default: module.ShopToday })))
const ShopMonthlyStatement = lazy(() => import('./ShopMonthlyStatement').then((module) => ({ default: module.ShopMonthlyStatement })))
const PlantOrderFoundation = lazy(() => import('./PlantOrderFoundation').then((module) => ({ default: module.PlantOrderFoundation })))
const ReceiptDialog = lazy(() => import('./ReceiptDialog').then((module) => ({ default: module.ReceiptDialog })))

type PurchaseOrderDraft =
  | { mode: 'create'; requisitionId?: string; sku: string; supplier: string; expectedAt: string; quantity: string; unitCostMmk: string }
  | { mode: 'receive'; purchaseOrderId: string; quantity: string; rejectedQuantity: string; discrepancyCode: CommercePurchaseOrderDiscrepancyCode; locationId: string; trackingCode: string }

type PurchaseBudgetDraft = {
  budgetCode: string
  label: string
  periodEnd: string
  ceilingMmk: string
  perRequisitionLimitMmk: string
}

type SupplierQuoteDraft = {
  supplier: string
  quoteReference: string
  vendorApprovalReference: string
  unitCostMmk: string
  deliveryAt: string
}

type SupplierSourcingDraft = {
  sku: string
  itemName: string
  quantity: number
  validUntil: string
  quotes: [SupplierQuoteDraft, SupplierQuoteDraft]
  selectedIndex: 0 | 1
  unitCostTolerancePercent: string
  deliveryToleranceDays: string
}

type SupplierInvoiceDraft = {
  purchaseOrderId: string
  supplierReference: string
  issuedAt: string
  dueAt: string
  quantity: string
  unitCostMmk: string
}

type SupplierReturnDraft = {
  purchaseOrderId: string
  receiptMovementId: string
  internalReturnReference: string
}

type SupplierCreditDraft = {
  purchaseOrderId: string
  supplierReturnId: string
  supplierReference: string
  issuedAt: string
  amountMmk: string
}

type StockCountDraft = {
  sku: string
  stockUnitId: string
  locationId: string
  quantity: string
}

type TaxConfigurationDraft = {
  code: string
  label: string
  ratePercent: string
  mode: CommerceTaxMode
  jurisdictionCode: string
  effectiveFrom: string
}

type AccountMappingDraft = {
  paymentClearing: string
  salesRevenue: string
  taxPayable: string
  legacyRevenue: string
  salesAdjustment: string
  correctionReceivable: string
  correctionPayable: string
}

type CustomerCreditPolicyDraft = {
  customer: string
  creditLimitMmk: string
  maxPaymentTermsDays: 0 | 7 | 30
  status: CommerceCustomerCreditPolicyStatus
}

type PromotionPolicyDraft = {
  code: string
  discountPercent: string
  minimumSubtotalMmk: string
  maximumDiscountMmk: string
  status: 'active' | 'inactive'
  effectiveFrom: string
  effectiveUntil: string
}

type ShippingPolicyDraft = {
  zoneCode: string
  townships: string
  feeMmk: string
  promiseMinutes: string
  status: 'active' | 'inactive'
  effectiveFrom: string
  effectiveUntil: string
}

type PaymentPolicyDraft = {
  adapter: 'pay_on_pickup' | 'cash_on_delivery' | 'kbzpay_manual'
  allowedFulfilments: 'pickup' | 'delivery' | 'both'
  maximumOrderMmk: string
  instructions: string
  status: 'active' | 'inactive'
  effectiveFrom: string
  effectiveUntil: string
}

type CloseSettlementDraftLine = {
  paymentMethod: string
  countedMmk: string
  varianceOwner: string
  varianceReason: string
}

type CatalogItemEditDraft = {
  sku: string
  expectedPrice: number
  expectedReorderAt: number
  price: string
  reorderAt: string
}

type CommerceReturnDraft = {
  orderId: string
  sku: string
  quantity: string
  disposition: CommerceReturnDisposition
  sourceIntent?: EcommerceReturnIntent
}

type CommerceSupportResolutionDraft = {
  orderId: string
  caseId: string
  outcome: CommerceSupportResolutionOutcome
  note: string
}

type CommerceSupportOpenDraft = {
  intent: EcommerceSupportIntent
  priority: CommerceSupportPriority
  owner: string
  dueAt: string
}

type CommerceSupportReopenDraft = {
  orderId: string
  caseId: string
  sourceResolutionActionId: string
  priority: CommerceSupportPriority
  owner: string
  dueAt: string
  note: string
}

type CommerceSupportServiceDraft = {
  orderId: string
  caseId: string
  kind: CommerceSupportServiceEventKind
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
  note: string
}

const commerceSupportPriorityOrder: CommerceSupportPriority[] = ['urgent', 'high', 'normal', 'low']
const commerceSupportServiceActionLabels: Record<CommerceSupportServiceEventKind, string> = {
  reassigned: 'Reassign case',
  escalated: 'Escalate case',
  acknowledged: 'Acknowledge case',
  first_response_ready: 'First response ready',
}

type ProductId = 'commerce' | 'production'

// Hand-maintained duplicate of the canonical ecommerceCancellationMatchesCurrentShop
// export in ecommerce-buying-lifecycle.ts (kept local rather than statically imported
// so this file's deliberate dynamic-import code-splitting boundary for that module is
// not broken). Currently byte-identical logic, confirmed by a real regression test --
// see tools/test_ecommerce_order_coexistence.mjs. If you change this function, change
// the canonical one too, or the two will silently drift.
function ecommerceCancellationMatchesCurrentShop(state: CommerceState, intent: EcommerceCancellationIntent) {
  const order = state.orders.find((candidate) => candidate.id === intent.orderId)
  const acknowledgement = commerceOrderAcknowledgement(state, intent.orderId)
  return Boolean(order
    && acknowledgement
    && order.sourceRecordId === intent.sourceRequestId
    && acknowledgement.digest === intent.sourceAcknowledgementDigest
    && acknowledgement.status === intent.orderStatus
    && acknowledgement.payment.status === intent.paymentStatus
    && acknowledgement.payment.refundStatus === intent.refundStatus
    && acknowledgement.totalMmk === intent.totalMmk
    && acknowledgement.cancellation.state === 'not_cancelled'
    && commerceOrderHasReleasableReservation(state, intent.orderId))
}

function ecommerceOrderAmendmentShopState(state: CommerceState, intent: EcommerceOrderAmendmentIntent) {
  const order = state.orders.find((candidate) => candidate.id === intent.orderId)
  const acknowledgement = commerceOrderAcknowledgement(state, intent.orderId)
  if (!order || !acknowledgement
    || order.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.evidence.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.payment.status !== intent.paymentStatus
    || acknowledgement.payment.refundStatus !== intent.refundStatus) return 'stale' as const
  if (acknowledgement.status === intent.orderStatus
    && acknowledgement.digest === intent.sourceAcknowledgementDigest
    && acknowledgement.totalMmk === intent.originalTotalMmk
    && acknowledgement.cancellation.state === 'not_cancelled'
    && commerceOrderHasReleasableReservation(state, intent.orderId)) return 'active' as const
  if (acknowledgement.status === 'cancelled'
    && acknowledgement.cancellation.state === 'cancelled'
    && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) return 'replacement_needed' as const
  return 'stale' as const
}

function ecommerceOrderAmendmentSummary(intent: EcommerceOrderAmendmentIntent) {
  if (intent.lineChanges.length) {
    return intent.lineChanges.map((line) => `${line.name} ${line.fromQuantity}→${line.toQuantity}`).join(' · ')
  }
  if (intent.fromFulfilment !== intent.toFulfilment) return `${intent.fromFulfilment}→${intent.toFulfilment}`
  return 'Customer contact or delivery details'
}

function ecommerceOrderRescheduleShopState(state: CommerceState, intent: EcommerceOrderRescheduleIntent) {
  const order = state.orders.find((candidate) => candidate.id === intent.orderId)
  const acknowledgement = commerceOrderAcknowledgement(state, intent.orderId)
  if (!order || !acknowledgement
    || order.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.evidence.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.payment.status !== intent.paymentStatus
    || acknowledgement.payment.refundStatus !== intent.refundStatus) return 'stale' as const
  if (acknowledgement.status === intent.orderStatus
    && acknowledgement.digest === intent.sourceAcknowledgementDigest
    && acknowledgement.totalMmk === intent.originalTotalMmk
    && acknowledgement.delivery.promisedAt === intent.originalPromisedAt
    && acknowledgement.cancellation.state === 'not_cancelled'
    && commerceOrderHasReleasableReservation(state, intent.orderId)) return 'active' as const
  if (acknowledgement.status === 'cancelled'
    && acknowledgement.cancellation.state === 'cancelled'
    && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) return 'replacement_needed' as const
  return 'stale' as const
}

function ecommerceReschedulePromiseAllowed(draft: EcommerceShopDraftV2, intent: EcommerceOrderRescheduleIntent) {
  const requested = Date.parse(intent.requestedPromisedAt)
  const reviewed = Date.parse(draft.confirmedAt)
  if (!Number.isFinite(requested) || !Number.isFinite(reviewed) || requested <= reviewed) return false
  if (intent.fulfilment === 'pickup') return draft.pricing.shipping.status === 'pickup'
  return draft.pricing.shipping.status === 'approved'
    && draft.pricing.shipping.promiseMinutes !== null
    && requested >= reviewed + draft.pricing.shipping.promiseMinutes * 60_000
}

function productCanonicalPath(product: ProductId) {
  return product === 'commerce' ? '/shop/' : '/plant/'
}

type ProductionTab = 'production' | 'control'

export type ManagedTrialRequestPrefill = {
  company?: string
  goal?: string
  proof?: ManagedTrialProof
  approvedContext?: {
    contract: 'supermega.ai_context_export.v1'
    digest: string
    outcomeDigest: string
    approved: true
    rawRecordsIncluded: false
  }
}

export function managedTrialRequestUrl(product: SetupProductId, templateId: string, prefill?: ManagedTrialRequestPrefill) {
  const query = new URLSearchParams({
    product: productContracts[product].slug,
    template: templateId,
    utm_source: 'app',
    utm_medium: 'guided_trial',
  })
  const fragment = new URLSearchParams()
  const company = prefill?.company?.trim().slice(0, 180)
  const goal = prefill?.goal?.trim().slice(0, 4_000)
  if (company) fragment.set('company', company)
  if (goal) fragment.set('goal', goal)
  if (prefill?.proof) {
    for (const [name, value] of managedTrialProofFragmentFields(prefill.proof, productContracts[product].slug, templateId)) {
      fragment.set(name, value)
    }
  }
  if (prefill?.approvedContext) {
    const context = prefill.approvedContext
    const proof = prefill.proof
    if (context.contract !== 'supermega.ai_context_export.v1'
      || !/^sha256:[0-9a-f]{64}$/.test(context.digest)
      || !/^sha256:[0-9a-f]{64}$/.test(context.outcomeDigest)
      || !proof
      || proof.outcomeDigest !== context.outcomeDigest
      || proof.outcomeAccepted !== true
      || (proof.outcomeStatus !== 'target_met' && proof.outcomeStatus !== 'improved')
      || proof.sourceRecordCount < 1
      || proof.behaviorSignalCount < 1
      || proof.reviewedDecisionCount < 1
      || context.approved !== true
      || context.rawRecordsIncluded !== false) throw new Error('approved_context_invalid')
    fragment.set('proof_context_contract', context.contract)
    fragment.set('proof_context_digest', context.digest)
    fragment.set('proof_context_outcome_digest', context.outcomeDigest)
    fragment.set('proof_context_approved', 'true')
    fragment.set('proof_context_raw_records', 'false')
  }
  const handoff = fragment.toString()
  return `https://supermega.dev/contact/?${query.toString()}${handoff ? `#${handoff}` : ''}`
}

// commerceTabs lives in ./commerce-tabs so the CoreShell mobile bottom bar can
// render the same task list without importing this chunk-isolated module.
const productionTabs: Array<{ id: ProductionTab; label: string }> = [
  { id: 'production', label: 'Jobs' },
  { id: 'control', label: 'Problems' },
]

const productionMachineStateLabels: Record<ProductionMachineState, string> = {
  running: 'Running',
  attention: 'Needs attention',
  stopped: 'Stopped',
}

const productionIssueSeverityLabels: Record<ProductionIssueSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const productionQualityCauseLabels: Record<ProductionQualityCauseCategory, string> = {
  material: 'Material',
  method: 'Method',
  machine: 'Machine',
  measurement: 'Measurement',
  people: 'People',
  environment: 'Environment',
}

const productionIssueSeverityRank: Record<ProductionIssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const productionJobPriorityLabels: Record<ProductionJobPriority, string> = {
  urgent: 'Urgent',
  normal: 'Normal',
  low: 'Low',
}

// Device-local view preference for the Plant "Jobs to finish" panel: list (default)
// or the due-date board. Registered in local-workspace-storage.ts so "Reset this
// device" clears it, and classified deliberately NOT portable in company-backup.ts —
// the same call as supermega.hq.local-metrics.v1 — because it is a marker about how
// THIS device displays jobs, not a business record a restored backup should re-assert.
const PLANT_JOB_VIEW_KEY = 'supermega.plant.job-view.v1'
type PlantJobView = 'list' | 'board'

function normalizePlantJobView(value: PlantJobView): PlantJobView {
  return value === 'board' ? 'board' : 'list'
}

const wrappedIssueDetail = { overflow: 'visible', overflowWrap: 'anywhere', textOverflow: 'clip', whiteSpace: 'normal' } as const

function localDateTimeInputValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function defaultIssueDueInput() {
  return localDateTimeInputValue(new Date(Date.now() + 4 * 60 * 60 * 1000))
}

function defaultOrderPromiseInput() {
  return localDateTimeInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000))
}

function defaultPurchaseOrderExpectedInput() {
  return localDateTimeInputValue(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000))
}

function defaultJobDueInput() {
  return localDateTimeInputValue(new Date(Date.now() + 8 * 60 * 60 * 1000))
}

function defaultCapaEffectivenessDueInput() {
  return localDateTimeInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
}

type PlantJobImportReview = {
  status: 'ready' | 'blocked'
  totalRows: number
  readyRows: number
  blockedRows: number
  firstReady?: { id: string; line: string; product: string; target: string; owner: string; priority: ProductionJobPriority; dueAt: string }
  summary: string
}

const PLANT_JOB_IMPORT_MAX_BYTES = 180 * 1024
const PLANT_JOB_IMPORT_MAX_ROWS = 50

function plantJobImportCsvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function parsePlantJobImportCsv(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field.trim())
      field = ''
    } else if (character === '\n') {
      row.push(field.trim())
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') field += character
  }
  if (quoted) throw new Error('Plant job CSV has an unclosed quoted cell.')
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function plantJobImportColumn(headers: string[], aliases: string[]) {
  const normalized = headers.map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ''))
  return aliases.reduce<number>((found, alias) => {
    if (found >= 0) return found
    return normalized.indexOf(alias)
  }, -1)
}

function plantJobImportDate(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : localDateTimeInputValue(parsed)
}

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function commerceOrderPromiseTime(order: CommerceOrder) {
  if (!order.promisedAt) return Number.POSITIVE_INFINITY
  const promisedAt = Date.parse(order.promisedAt)
  return Number.isNaN(promisedAt) ? Number.POSITIVE_INFINITY : promisedAt
}

function compareCommerceOrderPromise(left: CommerceOrder, right: CommerceOrder) {
  return commerceOrderPromiseTime(left) - commerceOrderPromiseTime(right)
    || Date.parse(left.createdAt) - Date.parse(right.createdAt)
}

function shiftReferencePlaceholder() {
  const businessDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  return `${businessDate} Day`
}

function formatIssueDue(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function uid(prefix: string) {
  return `${prefix}-${commandUuid()}`.toUpperCase()
}

function commerceOrderDisplayReference(orderId: string) {
  const canonical = orderId.trim().toUpperCase()
  const match = /^ORD-([A-F0-9]{8})(?:-[A-F0-9-]+)?$/.exec(canonical)
  return match ? `#${match[1]}` : canonical
}

// Ecommerce requests and after-purchase intents are named PREFIX-<uuid>, and several
// notices print them whole — "ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578 is ready for Shop
// review" is not something an operator can read back over a counter or a phone. The prefix
// says which kind of record it is, so keep it and drop the rest of the UUID; the first
// segment is already unique enough to find the record. Anything not shaped like a UUID —
// a human-assigned reference — passes through untouched.
function recordDisplayReference(recordId: string) {
  const trimmed = String(recordId ?? '').trim()
  // Upper-cased for MATCHING only. Returning the upper-cased value on the non-match path
  // would shout every human-assigned reference — "Messenger delivery review #1042" came
  // back as "MESSENGER DELIVERY REVIEW #1042" — which is the opposite of passing through
  // untouched. Every caller happens to pass a generated UUID today, so this was latent.
  const match = /^([A-Z]{2,5})-([A-F0-9]{8})(?:-[A-F0-9-]+)?$/.exec(trimmed.toUpperCase())
  return match ? `${match[1]}-${match[2]}` : trimmed
}

function commerceOrderTargetId(orderId: string) {
  return `shop-order-${orderId.replace(/[^A-Za-z0-9_-]+/g, '-')}`
}

function commandUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}





function formatMoney(value: number) {
  return `${new Intl.NumberFormat('en-US').format(value)} MMK`
}

type CommerceCorrectionDraft = {
  orderId: string
  kind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  listedAmountMmk: string
  sourceIntent?: EcommerceCorrectionIntent
  /**
   * Present when this draft is a POINTS REDEMPTION (S3 PR2): the credit
   * correction stays the money authority, and a redemption row keyed by the
   * same actionId records the points spent (shop-loyalty.ts module header).
   * kind/reasonCode are locked to credit/other; listedAmountMmk IS the points
   * (1 point = 1 MMK before tax).
   */
  loyalty?: { customer: string }
}

function formatTaxRate(rateBasisPoints: number) {
  return `${(rateBasisPoints / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

function formatCommerceCalculation(calculation: NonNullable<CommerceOrder['calculation']>) {
  if (!('taxCode' in calculation)) {
    return `Subtotal ${formatMoney(calculation.subtotalMmk)} · Tax not configured · Total ${formatMoney(calculation.totalMmk)}`
  }
  const treatment = calculation.taxMode === 'inclusive' ? 'included' : 'added'
  const jurisdiction = calculation.taxJurisdictionCode ? ` · ${calculation.taxJurisdictionCode}` : ''
  return `Net ${formatMoney(calculation.subtotalMmk)} · Tax ${calculation.taxCode}${jurisdiction} ${formatTaxRate(calculation.taxRateBasisPoints)} ${treatment} ${formatMoney(calculation.taxMmk)} · Total ${formatMoney(calculation.totalMmk)}`
}

function taxConfigurationDraft(configuration: CommerceTaxConfiguration | null): TaxConfigurationDraft {
  return {
    code: configuration?.code ?? '',
    label: configuration?.label ?? '',
    ratePercent: configuration ? String(configuration.rateBasisPoints / 100) : '',
    mode: configuration?.mode ?? 'exclusive',
    jurisdictionCode: configuration?.jurisdictionCode ?? '',
    effectiveFrom: '',
  }
}

function accountMappingDraft(configuration: ReturnType<typeof commerceCurrentAccountMappingConfiguration>): AccountMappingDraft {
  const mappings = new Map(configuration?.mappings.map((mapping) => [mapping.accountRole, mapping.externalAccountCode]) ?? [])
  return {
    paymentClearing: mappings.get('payment_clearing') ?? '',
    salesRevenue: mappings.get('sales_revenue') ?? '',
    taxPayable: mappings.get('tax_payable') ?? '',
    legacyRevenue: mappings.get('sales_revenue_unverified') ?? '',
    salesAdjustment: mappings.get('sales_adjustment') ?? '',
    correctionReceivable: mappings.get('correction_receivable') ?? '',
    correctionPayable: mappings.get('correction_payable') ?? '',
  }
}

function parseTaxRateBasisPoints(value: string) {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(basisPoints) && basisPoints <= 10_000 ? basisPoints : null
}

function fulfilmentLabel(value: string | undefined) {
  if (value === 'pickup') return 'Pickup'
  if (value === 'delivery') return 'Delivery'
  return value ?? ''
}

function commerceOrderReturnLines(order: CommerceOrder) {
  return order.lines?.map((line) => ({
    sku: line.sku,
    name: line.variant ? `${line.name} · ${line.variant}` : line.name,
    quantity: line.quantity,
  })) ?? (order.itemSku ? [{ sku: order.itemSku, name: order.item, quantity: order.quantity }] : [])
}

// The record validators speak to engineers: 'orders[3].completion is outside the order
// chronology.' A shop owner standing at a counter cannot act on an array index, and reading raw
// internals makes a change that was correctly refused look like a broken app. Say what happened
// and what it means for their money in their language, and keep the exact validator text one
// disclosure away rather than swallowing it -- that string is what an engineer needs to diagnose.
const ownerFacingActionErrors: readonly { match: RegExp; message: string }[] = [
  {
    match: /outside the .*chronology/i,
    message: 'This would record the payment or handover out of order — a step would land before the one it follows. Nothing was changed, and the money already recorded is untouched.',
  },
  {
    match: /\bdigest\b|\bhash\b|head digest/i,
    message: 'The saved records did not match their own integrity check, so nothing was changed. Your existing records are untouched.',
  },
  {
    match: /\bis invalid\b|\bmust be\b|\bcannot retain\b/i,
    message: 'One of the details on this change did not pass the record checks, so nothing was changed.',
  },
]

// Validator strings are recognisable by shape: an array index like `orders[3]` or a dotted
// internal field path like `completion.capturedAt`. Most refusals in this app already raise
// sentences written for the owner ('The Shop state changed ... Nothing was written.'), and
// replacing those with a generic line would lose information rather than add it. Only rewrite
// what actually reads as machine output.
const technicalErrorShape = /\[\d+\]|\b[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*\b/

function ownerFacingActionError(detail: string) {
  const known = ownerFacingActionErrors.find((entry) => entry.match.test(detail))
  if (known) return known.message
  return technicalErrorShape.test(detail)
    ? 'This change was not applied, so nothing was recorded. Your existing records are untouched.'
    : detail
}

function AccountableActionGate({ action, authenticatedActor, onCancel, onConfirm, returnFocus }: {
  action: PendingAccountableAction | null
  authenticatedActor?: { id: string; label: string }
  onCancel: () => void
  onConfirm: (details: ActionDetails) => void | Promise<void>
  returnFocus?: HTMLElement | null
}) {
  const [trialSetup] = useSetupWorkspace()
  // Only 7 of the 53 accountable actions carry an actorSuggestion, and setup leaves
  // trialSetup.owner empty, so the person on the counter was retyping their own name for
  // every routine step — mark ready, reconcile, close. The name is not the accountability;
  // recording who did it is. Ask once, then default to whoever last confirmed, still
  // editable when someone else takes over the till.
  // '||' not '??': trialSetup.owner is an empty string when setup never captured one.
  const [actor, setActor] = useState(() => action?.actorSuggestion || trialSetup.owner || readLastOperator())
  const [reason, setReason] = useState(action?.reasonSuggestion ?? '')
  const [evidenceReference, setEvidenceReference] = useState(action?.evidenceReferenceSuggestion ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!action) return undefined
    const dialog = dialogRef.current
    previousFocusRef.current = returnFocus?.isConnected
      ? returnFocus
      : document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog && !dialog.open) dialog.showModal()
    headingRef.current?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      const previousFocus = previousFocusRef.current
      requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus()
      })
    }
  }, [action, returnFocus])

  if (!action) return null
  const isCounterConfirmation = action.presentation === 'counter'
  const isCounterSettlement = isCounterConfirmation && action.kind === 'order_settle'
  // A frozen command proof normally blocks Cancel and Escape on purpose: the managed write may
  // already have landed, so walking away could leave the operator believing nothing happened.
  // That reasoning only holds while the outcome is unknown. Once a submit has come back with an
  // error the outcome IS known -- nothing was applied -- and keeping the only exit as "Retry same
  // confirmation" traps the operator in a dialog whose retry reuses the same frozen timestamp and
  // therefore fails identically. Reloading the app was the sole escape. Let them dismiss it.
  const confirmationLocked = Boolean(action.confirmation) && !error

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!action) return
    const responsibleActor = action.confirmation?.actor ?? authenticatedActor?.id ?? actor.trim()
    const confirmedReason = action.confirmation?.reason ?? reason.trim()
    const confirmedEvidence = action.confirmation?.evidenceReference
      ?? (action.evidenceReferenceLocked ? action.evidenceReferenceSuggestion?.trim() ?? '' : evidenceReference.trim())
    if (!responsibleActor || !confirmedReason || !confirmedEvidence) return
    setBusy(true)
    setError('')
    try {
      await onConfirm({ actor: responsibleActor, reason: confirmedReason, evidenceReference: confirmedEvidence })
      // Remember only a name the operator actually supplied, and only after the change
      // applied. Six actions offer a ROLE placeholder as actorSuggestion — 'Sample cashier',
      // 'Plant operator', 'Shift supervisor'. Confirming one of those untouched must not
      // turn the placeholder into the default identity for every later action, which would
      // sign the whole device's audit trail with a name nobody ever claimed.
      const offeredSuggestion = (action.actorSuggestion ?? '').trim()
      if (!authenticatedActor && responsibleActor !== offeredSuggestion) rememberLastOperator(responsibleActor)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The change was not applied.')
      setBusy(false)
    }
  }

  return <dialog aria-labelledby="action-confirm-title" className="accountable-action-gate" onCancel={(event) => { event.preventDefault(); if (!busy && !confirmationLocked) onCancel() }} ref={dialogRef}>
    <div className="action-change"><span className="core-eyebrow">{isCounterConfirmation ? 'Review counter sale' : 'Confirm change'}</span><h2 id="action-confirm-title" ref={headingRef} tabIndex={-1}>{action.summary}</h2><dl className="action-change-flow"><div><dt>Current evidence</dt><dd>{action.before}</dd></div><div><dt>After confirmation</dt><dd>{action.after}</dd></div></dl></div>
    <form className="core-form action-confirm-form" onSubmit={(event) => void submit(event)}>
      {authenticatedActor
        ? <label>Your account<input readOnly value={authenticatedActor.label} /></label>
        : <label>{isCounterConfirmation ? 'Cashier' : 'Your name'}<input maxLength={80} readOnly={Boolean(action.confirmation)} required value={action.confirmation?.actor ?? actor} onChange={(event) => setActor(event.target.value)} placeholder={isCounterConfirmation ? 'Name responsible for this order' : 'Name or responsible role'} /></label>}
      {isCounterConfirmation
        ? <div className="counter-confirm-proof"><span><small>Reason</small><strong>{action.confirmation?.reason ?? reason}</strong></span><span><small>Reference</small><strong>{action.confirmation?.evidenceReference ?? evidenceReference}</strong></span></div>
        : <><label>Reason<input maxLength={180} readOnly={Boolean(action.confirmation)} required value={action.confirmation?.reason ?? reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this change is correct now" /></label><label>Reference<input maxLength={180} readOnly={Boolean(action.confirmation) || action.evidenceReferenceLocked} required value={action.confirmation?.evidenceReference ?? (action.evidenceReferenceLocked ? action.evidenceReferenceSuggestion ?? '' : evidenceReference)} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Message ID, receipt, count sheet, or observation" /></label></>}
      {isCounterConfirmation && !authenticatedActor ? <p className="form-notice counter-local-boundary">{isCounterSettlement
        ? 'Browser-local sample only. Confirming records the cashier’s reviewed payment and handoff, completes the sale, and updates sample stock in this browser. It does not charge a wallet or card, contact a customer, write to a server or company account, or move real stock.'
        : 'Browser-local sample only. Confirming creates an open sample order and reserves sample stock in this browser. Payment and fulfilment stay pending for review in Orders. No payment is captured, no customer is contacted, no server or company account is written, and no real stock is moved.'}</p> : null}
      <div className="form-actions"><button className="core-button" data-action-gate="cancel" disabled={busy || confirmationLocked} onClick={onCancel} type="button">{bi('Cancel')}</button><button className="core-button primary" disabled={busy} type="submit">{busy ? 'Applying…' : action.confirmation ? bi('Retry same confirmation') : isCounterSettlement ? 'Complete sale' : bi(isCounterConfirmation ? 'Create order' : 'Confirm change')}</button></div>
      {error
        ? <div className="form-notice" data-action-gate="error" data-tone="error" role="alert">
          <p>{ownerFacingActionError(error)}</p>
          {action.confirmation ? <p>This confirmation keeps its original time stamp, so retrying it will refuse the same way. Cancel and start the change again.</p> : null}
          <details className="action-error-detail"><summary>Technical detail</summary><code data-action-gate="error-detail">{error}</code></details>
        </div>
        : action.confirmation ? <p className="form-notice" role="status">This command proof is frozen. Any retry reuses the same command and evidence; reload can reconcile managed state.</p> : null}
    </form>
  </dialog>
}

function ActionHistory({ actions, domain }: { actions: AccountableAction[]; domain: ActionDomain }) {
  const domainActions = actions.filter((action) => action.domain === domain)
  return <details className="core-panel action-history">
    <summary><span>Action history</span><strong>{domainActions.length} accountable records</strong></summary>
    {domainActions.length ? <div className="action-history-list">{domainActions.slice(0, 6).map((action) => <article key={action.id}><div><strong>{action.summary}</strong><small>{action.id} · {action.actor} · {formatTime(action.capturedAt)}</small></div><p>{action.before} → {action.after}</p><small>{action.reason} · Evidence: {action.evidenceReference}</small></article>)}</div> : <p className="panel-copy">No accountable action has been confirmed in this local workspace.</p>}
  </details>
}

export function OperationsPage({ product }: { product: ProductId }) {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [managedIdentity, , managedIdentitySettled] = useManagedIdentity(runtime.status === 'enterprise')
  // "Signed out" is NOT the same as "not asked yet", and every surface that fires on being
  // signed OUT needs the difference. runtime.status starts at 'checking', which keeps
  // useManagedIdentity disabled, so on first mount a signed-IN operator has
  // managedIdentity === null exactly like a local shop does -- a naive `if (!managedIdentity)`
  // therefore runs the LOCAL arm for a company account until /api/health answers and the
  // identity probe resolves behind it. localShopConfirmed requires all three: health
  // answered at all, the probe settled behind it, and no identity returned. Its lifecycle
  // is enumerated frame by frame in tools/storage_durability.test.mjs.
  const confirmedLocalShop = localShopConfirmed(runtime.status, managedIdentitySettled, managedIdentity)
  const ecommerceNavigationDraft = (location.state as { ecommerceShopDraft?: EcommerceShopDraft } | null)?.ecommerceShopDraft ?? null
  const ecommerceReturnNavigationIntent = (location.state as { ecommerceReturnIntent?: EcommerceReturnIntent } | null)?.ecommerceReturnIntent ?? null
  const ecommerceSupportNavigationIntent = (location.state as { ecommerceSupportIntent?: EcommerceSupportIntent } | null)?.ecommerceSupportIntent ?? null
  const ecommerceCorrectionNavigationIntent = (location.state as { ecommerceCorrectionIntent?: EcommerceCorrectionIntent } | null)?.ecommerceCorrectionIntent ?? null
  const ecommerceCancellationNavigationIntent = (location.state as { ecommerceCancellationIntent?: EcommerceCancellationIntent } | null)?.ecommerceCancellationIntent ?? null
  const ecommerceOrderAmendmentNavigationIntent = (location.state as { ecommerceOrderAmendmentIntent?: EcommerceOrderAmendmentIntent } | null)?.ecommerceOrderAmendmentIntent ?? null
  const ecommerceOrderRescheduleNavigationIntent = (location.state as { ecommerceOrderRescheduleIntent?: EcommerceOrderRescheduleIntent } | null)?.ecommerceOrderRescheduleIntent ?? null
  const shopCounterSearch = (location.state as { shopCounterSearch?: string } | null)?.shopCounterSearch?.trim().slice(0, 80) ?? ''
  const shopCounterCustomer = (location.state as { shopCounterCustomer?: string } | null)?.shopCounterCustomer?.trim().slice(0, 120) ?? ''
  const requestedSource = searchParams.get('source')
  const requestedRequestId = searchParams.get('request')
  const view = product
  const requestedTab = searchParams.get('tab')
  const requestedShopTemplateId = view === 'commerce' ? shopBusinessTemplateFromQuery(searchParams.get('template')) : null
  const requestedShopTemplate = requestedShopTemplateId ? shopBusinessTemplate(requestedShopTemplateId) : null
  // A trade link is a counter door, not a setup detour. An explicit tab still wins so an
  // operator can move through Today, Orders, and Stock without losing the trade context.
  const commerceTab = requestedShopTemplateId && requestedTab === null ? 'counter' : activeCommerceTab(requestedTab)
  const productionTab = productionTabs.some((tab) => tab.id === requestedTab) ? requestedTab as ProductionTab : 'production'
  const activeTab = view === 'commerce' ? commerceTab : productionTab
  const requestedTabIsCanonical = requestedTab === activeTab
  const canonicalPath = productCanonicalPath(view)
  const canonicalParams = new URLSearchParams({ tab: activeTab })
  if (view === 'commerce' && requestedShopTemplateId) canonicalParams.set('template', requestedShopTemplateId)
  const canonicalTabPath = `${canonicalPath}?${canonicalParams}`

  useEffect(() => {
    if (location.pathname !== canonicalPath || !requestedTabIsCanonical) navigate(canonicalTabPath, { replace: true })
  }, [canonicalPath, canonicalTabPath, location.pathname, navigate, requestedTabIsCanonical])

  function setTab(tab: CommerceTab | ProductionTab) {
    const params = new URLSearchParams({ tab })
    if (view === 'commerce' && requestedShopTemplateId) params.set('template', requestedShopTemplateId)
    navigate(`${productCanonicalPath(view)}?${params}`, { replace: true })
  }

  const tabs = view === 'commerce' ? commerceTabs : productionTabs
  const productCopy = view === 'commerce'
    ? requestedShopTemplate && commerceTab === 'counter'
      ? `${requestedShopTemplate.name.en}: choose an item, select a local payment method, and review the sale.`
      : {
        today: 'See today’s next job and key numbers.',
        counter: 'Tap an item, choose payment, and confirm the sale.',
        orders: 'Finish fulfilment, follow up payment, and handle exceptions.',
        inventory: 'Count stock, replenish items, and review location availability.',
      }[commerceTab]
    : {
        production: 'Plan jobs, record output, and track the materials each shift used.',
        control: 'Contain quality, equipment, downtime, and maintenance problems.',
      }[productionTab]

  return (
    <div className={`workspace-screen operations-screen${view === 'commerce' ? ' commerce-screen' : ''}`} data-active-tab={activeTab}>
      <PageHeading title={productDisplayName(view)} copy={productCopy} />
      <nav className="workspace-toolbar view-tabs product-task-tabs" aria-label={`${productDisplayName(view)} tasks`}>{tabs.map((tab) => <button aria-current={activeTab === tab.id ? 'page' : undefined} key={tab.id} onClick={() => setTab(tab.id)} type="button">{view === 'commerce' ? bi(tab.label) : tab.label}</button>)}</nav>
      <div className="workspace-view">{view === 'commerce' ? <CommercePage ecommerceCancellationNavigationIntent={ecommerceCancellationNavigationIntent} ecommerceCorrectionNavigationIntent={ecommerceCorrectionNavigationIntent} ecommerceNavigationDraft={ecommerceNavigationDraft} ecommerceOrderAmendmentNavigationIntent={ecommerceOrderAmendmentNavigationIntent} ecommerceOrderRescheduleNavigationIntent={ecommerceOrderRescheduleNavigationIntent} ecommerceReturnNavigationIntent={ecommerceReturnNavigationIntent} ecommerceSupportNavigationIntent={ecommerceSupportNavigationIntent} confirmedLocalShop={confirmedLocalShop} managedIdentity={managedIdentity} requestedRequestId={requestedRequestId} requestedShopTemplate={requestedShopTemplate} requestedSource={requestedSource} shopCounterCustomer={shopCounterCustomer} shopCounterSearch={shopCounterSearch} tab={commerceTab} /> : <ProductionPage managedIdentity={managedIdentity} tab={productionTab} />}</div>
    </div>
  )
}

type ShopCounterReview = {
  lines: Array<{ sku: string; quantity: number }>
  customer: string
  payment: string
  outcome: 'paid_handoff' | 'open_order'
  onCommitted: () => void
}

function readLocalShopIndustryPack() {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  if (!stored) return null
  try {
    return shopIndustryPack(readShopServiceSchedule(stored).industryPackId)
  } catch {
    return null
  }
}

// Read-only. Commerce never writes this key and must not start: the appointment book owns it,
// under its own lock. This exists so the close screen can ASK the book a question, which is a
// different thing from the close screen being able to change it.
function readLocalShopServiceSchedule(): ShopServiceScheduleState | null {
  if (typeof window === 'undefined') return null
  try {
    return readShopServiceSchedule(window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY))
  } catch {
    // An unreadable book is already reported, loudly, by the appointment panel itself. The
    // close screen staying quiet is better than two alarms for one fault.
    return null
  }
}

function ShopProductArtwork({ kind }: { kind: number }) {
  if (kind === 1) return <svg aria-hidden="true" className="shop-product-art" focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><rect className="art-main" height="48" rx="7" width="18" x="20" y="34" /><rect className="art-main" height="58" rx="7" width="18" x="41" y="24" /><rect className="art-main" height="44" rx="7" width="18" x="62" y="38" /><path className="art-highlight" d="M24 42h10M45 33h10M66 46h10" /></svg>
  if (kind === 2) return <svg aria-hidden="true" className="shop-product-art" focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><path className="art-main" d="M27 23h46l7 58H20z" /><path className="art-highlight" d="M32 39h36M39 57h22" /><circle className="art-detail" cx="50" cy="69" r="6" /></svg>
  if (kind === 3) return <svg aria-hidden="true" className="shop-product-art" focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><rect className="art-main" height="48" rx="9" width="28" x="22" y="35" /><rect className="art-main" height="55" rx="9" width="26" x="55" y="28" /><path className="art-highlight" d="M29 28h15v8M62 20h13v9M30 54h12M62 49h12" /></svg>
  if (kind === 4) return <svg aria-hidden="true" className="shop-product-art" focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><rect className="art-main" height="58" rx="10" width="62" x="19" y="23" /><path className="art-detail" d="M50 67 34 53c-9-9 4-21 16-8 12-13 25-1 16 8z" /><path className="art-highlight" d="M27 32h46" /></svg>
  return <svg aria-hidden="true" className="shop-product-art" focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><path className="art-highlight" d="M30 41c2-18 38-18 40 0" /><path className="art-main" d="M18 42h64l-8 39H26z" /><rect className="art-detail" height="21" rx="4" width="15" x="31" y="50" /><circle className="art-detail" cx="59" cy="60" r="10" /></svg>
}

function ShopCounter({ businessTemplate, canCompleteInOneReview, disabled, industryPack, initialCustomer, initialQuery, items, localDemoStatus, lowStockCount, loyaltyPoints, onReview, openOrderCount, paymentQrScope, productImageScope, sampleCatalogActive }: {
  businessTemplate: ShopBusinessTemplate | null
  canCompleteInOneReview: boolean
  disabled: boolean
  industryPack: ShopIndustryPack | null
  initialCustomer: string
  initialQuery: string
  items: CommerceItem[]
  localDemoStatus: 'local' | 'records-at-risk' | null
  lowStockCount: number
  loyaltyPoints: ReadonlyMap<string, number> | null
  onReview: (review: ShopCounterReview, returnFocus: HTMLElement) => void
  openOrderCount: number
  paymentQrScope: string
  productImageScope: string
  sampleCatalogActive: boolean
}) {
  const [restoredDraft] = useState(readShopCounterDraft)
  const [cart, setCart] = useState<Record<string, number>>(() => restoredDraft?.cart ?? {})
  const [customer, setCustomer] = useState(() => restoredDraft?.customer || initialCustomer)
  const [payment, setPayment] = useState(() => restoredDraft?.payment ?? 'Cash')
  const [outcome, setOutcome] = useState<'paid_handoff' | 'open_order'>(() => restoredDraft?.outcome ?? 'paid_handoff')
  const [query, setQuery] = useState(initialQuery)
  const [cartOpen, setCartOpen] = useState(false)

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleItems = normalizedQuery
    ? items.filter((item) => `${item.name} ${item.variant ?? ''} ${item.sku}`.toLocaleLowerCase().includes(normalizedQuery))
    : items
  const lines = items.flatMap((item) => {
    const quantity = Math.min(cart[item.sku] ?? 0, item.onHand)
    return quantity > 0 ? [{ item, quantity }] : []
  })
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0)
  const effectiveOutcome = canCompleteInOneReview ? outcome : 'open_order'

  // Persist what the counter can actually act on, not the raw cart. `lines` is the same
  // derived value the UI uses: catalog SKUs only, clamped to live stock. Judging emptiness
  // from raw cart keys instead left a draft the operator could neither see nor remove —
  // the Clear button is gated on unitCount, so a cart holding only sold-out or deleted SKUs
  // rendered as an empty counter while quietly resurrecting a stale customer and payment
  // method on every load. A sale exists only if it has at least one sellable line.
  const liveCartJson = JSON.stringify(Object.fromEntries(lines.map((line) => [line.item.sku, line.quantity])))
  useEffect(() => {
    try {
      if (liveCartJson === '{}') window.localStorage.removeItem(SHOP_COUNTER_DRAFT_KEY)
      else window.localStorage.setItem(SHOP_COUNTER_DRAFT_KEY, JSON.stringify({ cart: JSON.parse(liveCartJson), customer, payment, outcome }))
    } catch {
      // Storage full or blocked. The counter keeps working in memory; losing persistence
      // must never cost the operator the sale they are ringing up right now.
    }
  }, [liveCartJson, customer, payment, outcome])

  function changeQuantity(item: CommerceItem, next: number) {
    const nextQuantity = Math.max(0, Math.min(next, item.onHand))
    if (!nextQuantity && unitCount === 1) setCartOpen(false)
    setCart((current) => {
      if (!nextQuantity) {
        const remaining = { ...current }
        delete remaining[item.sku]
        return remaining
      }
      return { ...current, [item.sku]: nextQuantity }
    })
  }

  function addItem(item: CommerceItem) {
    if (item.onHand < 1) return
    setCart((current) => ({ ...current, [item.sku]: Math.min((current[item.sku] ?? 0) + 1, item.onHand) }))
  }

  // Single resolution path for every scan source. The Enter key (keyboard-wedge USB/BT
  // scanners type the code and send Enter) and the camera scanner below both land here,
  // so exact-SKU matching can never drift between the two.
  function addScannedValue(value: string) {
    const normalizedQuery = value.trim().toLocaleLowerCase()
    if (!normalizedQuery) return false
    const visibleItems = items.filter((item) => `${item.name} ${item.variant ?? ''} ${item.sku}`.toLocaleLowerCase().includes(normalizedQuery))
    const exactSku = visibleItems.find((item) => item.sku.toLocaleLowerCase() === normalizedQuery)
    const match = exactSku ?? (visibleItems.length === 1 ? visibleItems[0] : null)
    if (!match || match.onHand < 1) return false
    addItem(match)
    setQuery('')
    return true
  }

  function addSearchMatch(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || !normalizedQuery) return
    if (addScannedValue(query)) event.preventDefault()
  }

  function addCameraScan(value: string) {
    // Show the scanned code in the search box first: when it matches, addScannedValue
    // clears it again in the same commit; when it does not match, the operator sees the
    // exact code the camera read next to the "no matching item" state instead of nothing.
    setQuery(value)
    addScannedValue(value)
  }

  function clearSale() {
    setCart({})
    setCustomer('')
    setPayment('Cash')
    setOutcome('paid_handoff')
    setCartOpen(false)
  }

  function reviewSale(event: MouseEvent<HTMLButtonElement>) {
    if (!lines.length || disabled) return
    onReview({
      lines: lines.map((line) => ({ sku: line.item.sku, quantity: line.quantity })),
      customer: customer.trim(),
      payment,
      outcome: effectiveOutcome,
      onCommitted: () => {
        clearSale()
      },
    }, event.currentTarget)
  }

  const counterContextLabel = businessTemplate && sampleCatalogActive
    ? `${businessTemplate.name.en} · Shop Counter`
    : industryPack && sampleCatalogActive
    ? `${industryPack.name} working sample`
    : industryPack
      ? 'Existing Shop catalog'
      : bi('Counter open')
  const packContext = businessTemplate && sampleCatalogActive
    ? `${businessTemplate.description} This sample stays on this device; Cash, KBZPay, WavePay, AYA Pay, and MMQR stay manual until the sale is reviewed.`
    : industryPack
    ? sampleCatalogActive
      ? `${industryPack.firstWorkflow} ${industryPack.name} sample items are loaded.`
      : `Your existing items were kept. The ${industryPack.name} appointment schedule is separate.`
    : ''
  const spaPilotActive = industryPack?.id === 'spa'

  return <section aria-label="Sales counter" className="shop-counter-surface">
    <div className="shop-counter-grid">
      <section className="shop-catalog-panel">
        <header className="shop-catalog-head">
          <div>
            <span className="core-eyebrow">{counterContextLabel}</span>
            <h2>{bi('Tap an item to add it')}</h2>
            {businessTemplate && sampleCatalogActive
              ? <p className="shop-pack-context"><span>{packContext}</span></p>
              : industryPack ? <p className="shop-pack-context"><span>{packContext}</span><Link to="/shop/?tab=orders#shop-service-schedule">Open schedule</Link></p> : null}
            <nav aria-label="Shop attention" className="shop-counter-summary"><Link to="/shop/?tab=orders">{openOrderCount} open orders</Link><Link to="/shop/?tab=inventory">{lowStockCount} low stock</Link>{localDemoStatus ? <Link className="shop-counter-local-link" data-risk={localDemoStatus === 'records-at-risk' ? 'true' : undefined} to="/settings/#controls">{localDemoStatus === 'records-at-risk' ? 'Local demo · records at risk' : 'Local demo · on this device'}</Link> : null}</nav>
            {spaPilotActive ? <div aria-label="Spa pilot first sale path" className="shop-spa-pilot-strip">
              <span><strong>Sell package</strong><small>Cash, KBZPay, WavePay, AYA Pay, or MMQR</small></span>
              <span><strong>Book treatment</strong><small>Use the schedule before the guest arrives</small></span>
              <span><strong>Reject bad redemption</strong><small>Refuse duplicate or invalid package use</small></span>
              <span><strong>Close day + reload</strong><small>Count cash, payments, open orders, and stock</small></span>
            </div> : null}
          </div>
          <div className="shop-item-search-row"><label className="shop-item-search"><span className="sr-only">Find or scan an item</span><input autoComplete="off" onChange={(event) => setQuery(event.target.value)} onKeyDown={addSearchMatch} placeholder="Search or scan SKU" type="search" value={query} /></label><BarcodeScanButton label="Scan a barcode with the camera" onDetected={addCameraScan} /></div>
        </header>
        {/* The tile is named by REFERENCE, not by aria-label. An aria-label on a
            button replaces its whole subtree in the accessibility tree, so the
            previous `aria-label={`Add ${item.name} to this sale`}` announced the
            action and the English name and then nothing else: not the price, not
            the stock level, not the quantity already in the sale, and never
            item.nameMy -- the Burmese product name the owner typed in themselves.
            The quantity badge's own aria-label sat inside that override and was
            announced nowhere.

            Naming the tile from its CONTENTS instead is not the fix and was
            measured to be worse: it yields "Rice 5kgဆန်350012 in stock2", losing
            the action verb and fusing the price to the stock count. aria-labelledby
            picks the identifying nodes for the name and aria-describedby the
            numeric ones for the description, so a screen reader reads
            "Add to this sale · <my> Rice 5kg ဆန်" then "3500 12 in stock 2 in sale".
            Nothing here is visual: every id is on a node that already rendered, so
            this changes no layout and no CSS.

            The shared action node is aria-hidden. .sr-only only clips it VISUALLY,
            so without that a screen-reader user browsing the catalog hears "Add to
            this sale" once as a stray line of its own -- and hears it even when the
            search matches nothing and there is no tile to add anything to. Being
            aria-hidden does not stop it naming the buttons: a node referenced
            directly by aria-labelledby is included in the name computation whether
            or not it is hidden. Measured, not assumed -- plain, aria-hidden, and
            hidden all compute the identical name and description, and only the plain
            one leaves a traversable StaticText behind. */}
        <span aria-hidden="true" className="sr-only" id="shop-tile-action">{bi('Add to this sale')}</span>
        {visibleItems.length ? <div className="shop-item-grid">
          {visibleItems.map((item, tileIndex) => {
            const quantity = cart[item.sku] ?? 0
            const artKind = items.indexOf(item) % 5
            // Ids are keyed by render position, not by SKU: aria-labelledby takes a
            // SPACE-separated id list and a SKU is operator-typed, so a SKU with a
            // space in it would silently split into two broken references.
            const nameId = `shop-tile-name-${tileIndex}`
            const myId = `shop-tile-my-${tileIndex}`
            const variantId = `shop-tile-variant-${tileIndex}`
            const priceId = `shop-tile-price-${tileIndex}`
            const stockId = `shop-tile-stock-${tileIndex}`
            const quantityId = `shop-tile-quantity-${tileIndex}`
            const labelledBy = ['shop-tile-action', nameId, item.nameMy ? myId : '', item.variant ? variantId : ''].filter(Boolean).join(' ')
            const describedBy = [priceId, stockId, quantity ? quantityId : ''].filter(Boolean).join(' ')
            return <button aria-describedby={describedBy} aria-labelledby={labelledBy} className="shop-product-tile" data-art={String(artKind)} data-empty={item.onHand < 1 ? 'true' : 'false'} disabled={item.onHand < 1} key={item.sku} onClick={() => addItem(item)} type="button">
              <ProductPhoto className="shop-product-art shop-product-photo" fallback={<ShopProductArtwork kind={artKind} />} scope={productImageScope} sku={item.sku} />
              <span className="shop-product-copy"><strong id={nameId}>{item.name}</strong>{item.nameMy ? <small className="shop-product-my" id={myId} lang="my">{item.nameMy}</small> : null}{item.variant ? <small id={variantId}>{item.variant}</small> : null}<b id={priceId}>{formatMoney(item.price)}</b><small className={item.onHand <= item.reorderAt ? 'is-low' : ''} id={stockId}>{item.onHand ? `${item.onHand} in stock` : bi('Out of stock')}</small></span>
              {quantity ? <span className="shop-product-quantity" aria-label={`${quantity} in sale`} id={quantityId}>{quantity}</span> : <span aria-hidden="true" className="shop-product-add">+</span>}
            </button>
          })}
        </div> : <Empty>{items.length
          ? bi('No matching item. Search by name or SKU.')
          : <>Your catalog is empty. <Link className="text-link" to="/shop/?tab=inventory#shop-catalog-import">Add or import products</Link> before the first sale.</>}</Empty>}
      </section>

      <button aria-label="Close current sale" className={`shop-cart-backdrop${cartOpen ? ' is-open' : ''}`} onClick={() => setCartOpen(false)} type="button" />
      <aside aria-label="Current sale" className={`shop-current-sale${cartOpen ? ' is-open' : ''}`} id="shop-current-sale">
        <header><div><span className="core-eyebrow">{bi('Current sale')}</span><h2>{unitCount ? `${unitCount} ${unitCount === 1 ? 'item' : 'items'}` : bi('Ready for the first item')}</h2></div><div className="shop-cart-actions">{unitCount ? <button className="text-link" onClick={clearSale} type="button">{bi('Clear')}</button> : null}<button aria-label="Close current sale" className="shop-cart-close" onClick={() => setCartOpen(false)} type="button">×</button></div></header>
        <div className="shop-cart-lines">
          {lines.length ? lines.map(({ item, quantity }) => <article key={item.sku}><div><strong>{item.name}</strong>{item.nameMy ? <small className="shop-product-my" lang="my">{item.nameMy}</small> : null}<small>{formatMoney(item.price)} each</small></div><div className="shop-quantity-stepper"><button aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item, quantity - 1)} type="button">−</button><strong>{quantity}</strong><button aria-label={`Add one ${item.name}`} disabled={quantity >= item.onHand} onClick={() => changeQuantity(item, quantity + 1)} type="button">+</button></div><b>{formatMoney(item.price * quantity)}</b></article>) : <div className="shop-empty-cart"><ShopProductArtwork kind={0} /><strong>{bi('Your sale is empty')}</strong><small>{bi('Tap any product to begin.')}</small></div>}
        </div>
        {unitCount ? <><div className="shop-sale-details">
          <label>{bi('Customer')} <small>optional</small><input maxLength={80} onChange={(event) => setCustomer(event.target.value)} placeholder="Guest" value={customer} /></label>
          {/* S3 PR1 loyalty balance chip. Renders ONLY for an exact match against a known
              customer (a projected balance or a client-master name) while points are on —
              loyaltyPoints is null when the device-local setting is off, so a shop that
              never opted in sees nothing here. Balance is the pure projection in
              shop-loyalty.ts; showing it changes no record. */}
          {loyaltyPoints?.has(customer.trim()) && customer.trim() !== 'Guest' ? <p className="shop-loyalty-chip">{customer.trim()} · {shopLoyaltyDisplayPoints(loyaltyPoints.get(customer.trim()) ?? 0).toLocaleString()} pts</p> : null}
          <fieldset><legend>{bi('Payment')}</legend><div className="shop-payment-options">{['Cash', 'KBZPay', 'WavePay', 'AYA Pay', 'MMQR'].map((method) => <button aria-pressed={payment === method} key={method} onClick={() => setPayment(method)} type="button">{method}</button>)}</div></fieldset>
          {/* S2 merchant payment QR: display-only (see payment-qr-store.ts). At a Myanmar
              counter the customer pays a non-cash sale by scanning the owner's static
              merchant QR and typing the amount, so the affordance lives exactly here —
              non-cash method chosen, amount due on screen. No payment API, no status
              write; the cashier still confirms money received in the reviewed sale. */}
          {payment !== 'Cash' ? <PaymentQrButton amountDue={formatMoney(total)} method={payment} scope={paymentQrScope} settingsHint /> : null}
          {canCompleteInOneReview ? <label className="shop-open-order-choice"><input checked={outcome === 'open_order'} onChange={(event) => setOutcome(event.target.checked ? 'open_order' : 'paid_handoff')} type="checkbox" /><span><strong>Keep as open order</strong><small>Use for pay-later or later handoff. Otherwise this sale completes now.</small></span></label> : null}
        </div>
        <footer><div><span>{bi('Total')}</span><strong>{formatMoney(total)}</strong></div><button className="shop-review-sale" disabled={disabled} onClick={reviewSale} type="button">{disabled ? bi('Sales paused') : effectiveOutcome === 'paid_handoff' ? 'Review & complete sale' : bi('Review order')}<span aria-hidden="true">→</span></button><small>{effectiveOutcome === 'paid_handoff' ? 'One review records payment, handoff, stock, and the order record.' : 'Creates an open order; payment and handoff stay for Orders.'}</small></footer></> : null}
      </aside>
    </div>
    {unitCount ? <button aria-controls="shop-current-sale" aria-expanded={cartOpen} className="shop-mobile-cart" onClick={() => setCartOpen(true)} type="button"><span><small>{bi('Current sale')}</small><strong>{unitCount} {unitCount === 1 ? 'item' : 'items'}</strong></span><b>{formatMoney(total)}</b></button> : null}
  </section>
}

function localCommerceOrderDraftScope(workspaceId?: string) {
  return workspaceId ? `managed:${workspaceId}` : 'local'
}

function localCommerceOrderDraftStorageKey(scope: string) {
  return `${SHOP_ORDER_DRAFT_RESET_PREFIX}${encodeURIComponent(scope)}`
}

// The half-rung sale was the only counter state held purely in React. Every link in the
// Shop header is a route change, and setTab replaces history rather than pushing, so one
// mis-tap on "2 open orders" discarded the basket with no Back button to return to — at a
// real counter, in front of a customer. Persisted per device, like every other workspace
// record, so nothing leaves the browser.
const SHOP_COUNTER_DRAFT_KEY = 'supermega.shop.counter_draft.v1'
// Who is on the till. Remembered so the accountable-review sheet can default to them
// instead of demanding the same name at every step of a shift. Kept on the device only,
// like every other workspace record, and always editable at the moment of confirming.
const LAST_OPERATOR_KEY = 'supermega.last_operator.v1'

function readLastOperator() {
  try {
    return (window.localStorage.getItem(LAST_OPERATOR_KEY) ?? '').slice(0, 80)
  } catch {
    return ''
  }
}

function rememberLastOperator(name: string) {
  const trimmed = name.trim().slice(0, 80)
  if (!trimmed) return
  try {
    window.localStorage.setItem(LAST_OPERATOR_KEY, trimmed)
  } catch {
    // Storage unavailable. The name still applied to this action; only the convenience
    // of pre-filling the next one is lost.
  }
}

type ShopCounterDraft = {
  cart: Record<string, number>
  customer: string
  payment: string
  outcome: 'paid_handoff' | 'open_order'
}

// Validates field by field rather than trusting the parse: this value survives upgrades and
// hand-edited storage, and a malformed draft must degrade to an empty counter, never throw
// on the way to rendering it. Quantities are re-clamped against live stock at render, so a
// stale SKU here is inert.
function readShopCounterDraft(): ShopCounterDraft | null {
  try {
    const raw = window.localStorage.getItem(SHOP_COUNTER_DRAFT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const draft = parsed as Partial<ShopCounterDraft>
    const cart: Record<string, number> = {}
    if (draft.cart && typeof draft.cart === 'object' && !Array.isArray(draft.cart)) {
      for (const [sku, quantity] of Object.entries(draft.cart)) {
        if (sku && Number.isSafeInteger(quantity) && (quantity as number) > 0) cart[sku] = quantity as number
      }
    }
    return {
      cart,
      customer: typeof draft.customer === 'string' ? draft.customer.slice(0, 120) : '',
      payment: typeof draft.payment === 'string' && draft.payment ? draft.payment : 'Cash',
      outcome: draft.outcome === 'open_order' ? 'open_order' : 'paid_handoff',
    }
  } catch {
    return null
  }
}

function localCommerceOrderDraftCatalogState(draft: CommerceOrderDraft, catalog: CommerceItem[]) {
  const currentBySku = new Map(catalog.map((item) => [item.sku, item]))
  const missingSkus: string[] = []
  const insufficientSkus: string[] = []
  const changedSkus: string[] = []
  for (const line of draft.lines) {
    const item = currentBySku.get(line.sku)
    if (!item) {
      missingSkus.push(line.sku)
      continue
    }
    if (item.onHand < line.quantity) insufficientSkus.push(line.sku)
    if (item.price !== line.unitPriceMmk || item.onHand !== line.availableAtSave) changedSkus.push(line.sku)
  }
  return {
    current: missingSkus.length === 0 && insufficientSkus.length === 0 && changedSkus.length === 0,
    canRebind: missingSkus.length === 0 && insufficientSkus.length === 0,
  }
}

function buildCommerceOrderRecoveryInput(
  fields: {
    customer: string
    channel: string
    payment: string
    fulfilment: '' | 'pickup' | 'delivery'
    fulfilmentReference: string
    promisedAt: string
    paymentTermsDays: 0 | 7 | 30
    lines: Array<{ sku: string; quantity: number }>
  },
  catalog: CommerceItem[],
  baseline: CommerceOrderDraft | null,
): CommerceOrderDraftInput | null {
  const lines = fields.lines.map((line) => {
    const retained = baseline?.lines.find((candidate) => (
      candidate.sku === line.sku && candidate.quantity === line.quantity
    ))
    const item = catalog.find((candidate) => candidate.sku === line.sku)
    if (!retained && !item) return null
    return {
      sku: line.sku,
      quantity: line.quantity,
      unitPriceMmk: retained?.unitPriceMmk ?? item?.price ?? 0,
      availableAtSave: retained?.availableAtSave ?? item?.onHand ?? 0,
    }
  })
  if (lines.some((line) => line === null)) return null
  const promisedAt = fields.promisedAt ? new Date(fields.promisedAt) : null
  return {
    customer: fields.customer.trim(),
    channel: fields.channel as CommerceOrderDraftInput['channel'],
    payment: fields.payment as CommerceOrderDraftInput['payment'],
    fulfilment: fields.fulfilment,
    fulfilmentReference: fields.fulfilmentReference.trim(),
    promisedAt: promisedAt && !Number.isNaN(promisedAt.getTime()) ? promisedAt.toISOString() : '',
    paymentTermsDays: fields.paymentTermsDays,
    lines: lines as CommerceOrderDraftInput['lines'],
  }
}

function CommercePage({ ecommerceCancellationNavigationIntent, ecommerceCorrectionNavigationIntent, ecommerceNavigationDraft, ecommerceOrderAmendmentNavigationIntent, ecommerceOrderRescheduleNavigationIntent, ecommerceReturnNavigationIntent, ecommerceSupportNavigationIntent, confirmedLocalShop, managedIdentity, requestedRequestId, requestedShopTemplate, requestedSource, shopCounterCustomer, shopCounterSearch, tab }: {
  ecommerceCancellationNavigationIntent: EcommerceCancellationIntent | null
  ecommerceCorrectionNavigationIntent: EcommerceCorrectionIntent | null
  ecommerceNavigationDraft: EcommerceShopDraft | null
  ecommerceOrderAmendmentNavigationIntent: EcommerceOrderAmendmentIntent | null
  ecommerceOrderRescheduleNavigationIntent: EcommerceOrderRescheduleIntent | null
  ecommerceReturnNavigationIntent: EcommerceReturnIntent | null
  ecommerceSupportNavigationIntent: EcommerceSupportIntent | null
  confirmedLocalShop: boolean
  managedIdentity: ManagedIdentity | null
  requestedRequestId: string | null
  requestedShopTemplate: ShopBusinessTemplate | null
  requestedSource: string | null
  shopCounterCustomer: string
  shopCounterSearch: string
  tab: CommerceTab
}) {
  const navigate = useNavigate()
  const commerceLocation = useLocation()
  const purchaseOrderClock = useMinuteClock()
  const [shopPack] = useState<ShopIndustryPack | null>(readLocalShopIndustryPack)
  const [shopSchedule, setShopSchedule] = useState<ShopServiceScheduleState | null>(readLocalShopServiceSchedule)
  const [localWebsiteIntakeRead, setLocalWebsiteIntakeRead] = useState<{
    status: 'checking' | 'ready' | 'error'
    intake: WebsiteEcommerceHandoffContext | null
  }>({ status: 'checking', intake: null })
  const [commerce, mutateCommerce, commerceStorageError, workspaceMode, managedVersion, managedWorkspaceId, commerceCanWrite, commerceSync, commerceStuckRecovery, discardStuckCommerceChange] = useCommerceWorkspace(managedIdentity)
  // Workspace headroom. LOCAL SHOPS ONLY: a company account keeps the ledger server-side
  // and neither local ceiling applies to it (workspace-runtime.ts branches on
  // !managedIdentity long before any of this), so a signed-in operator must never be told
  // their till is filling up. Gated on confirmedLocalShop rather than on `!managedIdentity`
  // alone -- see where confirmedLocalShop is derived: a null identity means "not asked yet"
  // until health and the identity probe have both answered, so the bare check runs the
  // LOCAL arm for a signed-in session on first mount.
  //
  // Keyed on the workspace object identity, which changes only when the workspace is
  // actually mutated -- so a re-render that changed nothing costs one reference comparison.
  // measureCommerceHeadroom caches on that same identity and only serializes the workspace
  // when the shop is near a wall; its doc comment carries the cost profile.
  const commerceHeadroom = useMemo(
    () => (confirmedLocalShop ? measureCommerceHeadroom(commerce) : null),
    [commerce, confirmedLocalShop],
  )
  const storageDurability = useSyncExternalStore(subscribeStorageDurability, getStorageDurability)
  // The installed sample id is either an industry pack id or a business template id;
  // comparing only the pack id reported a successful template install as "preserved".
  const installedShopSampleId = commerceWorkingSampleCatalogId(commerce)
  const activeShopBusinessTemplate = requestedShopTemplate?.id === installedShopSampleId ? requestedShopTemplate : null
  const shopSampleCatalogActive = Boolean(activeShopBusinessTemplate || (shopPack && installedShopSampleId && (
    installedShopSampleId === shopPack.id
    || shopBusinessTemplates.some((template) => template.id === installedShopSampleId && template.industryPackId === shopPack.id)
  )))
  const [shopTradeDemoResult, setShopTradeDemoResult] = useState<{
    templateId: string
    status: 'preserved' | 'error'
    error: string
  } | null>(null)
  const shopTradeDemoAttempt = useRef('')
  const requestedShopTemplateId = requestedShopTemplate?.id ?? ''
  const requestedShopTemplateName = requestedShopTemplate?.name.en ?? ''
  const shopTradeDemoStatus = activeShopBusinessTemplate
    ? 'ready'
    : shopTradeDemoResult?.templateId === requestedShopTemplateId
      ? shopTradeDemoResult.status
      : 'loading'
  const shopTradeDemoError = shopTradeDemoResult?.templateId === requestedShopTemplateId ? shopTradeDemoResult.error : ''
  const shopTradeDemoCheckoutBlocked = !managedIdentity
    && Boolean(requestedShopTemplate)
    && (shopTradeDemoStatus === 'loading' || shopTradeDemoStatus === 'error')
  useEffect(() => {
    if (!requestedShopTemplateId) {
      shopTradeDemoAttempt.current = ''
      return
    }
    if (installedShopSampleId === requestedShopTemplateId) return
    // Never mistake the first identity frame for a signed-out visitor. The guarded installer
    // runs only after the server and identity probe confirm this is a local browser workspace,
    // and only after recovery says writes are safe. The installer itself replaces only the exact
    // untouched seed (or another guided sample); any operator-edited workspace is preserved.
    if (!confirmedLocalShop || managedIdentity || !commerceCanWrite || commerceSync.status !== 'ready'
      || shopTradeDemoAttempt.current === requestedShopTemplateId) return
    shopTradeDemoAttempt.current = requestedShopTemplateId
    void import('./product-onboarding-runtime')
      .then(({ provisionLocalShopBusinessTemplateSample }) => provisionLocalShopBusinessTemplateSample(requestedShopTemplateId))
      .then((disposition) => {
        if (disposition === 'installed' || disposition === 'current') {
          window.location.reload()
          return
        }
        setShopTradeDemoResult({ templateId: requestedShopTemplateId, status: 'preserved', error: '' })
      })
      .catch((error: unknown) => {
        setShopTradeDemoResult({
          templateId: requestedShopTemplateId,
          status: 'error',
          error: error instanceof Error ? error.message : `The ${requestedShopTemplateName} sample could not be loaded.`,
        })
      })
  }, [commerceCanWrite, commerceSync.status, confirmedLocalShop, installedShopSampleId, managedIdentity, requestedShopTemplateId, requestedShopTemplateName])
  const [relatedProduction] = useProductionWorkspace(managedIdentity)
  const currentTaxConfiguration = commerceCurrentTaxConfiguration(commerce)
  const currentAccountMappingConfiguration = commerceCurrentAccountMappingConfiguration(commerce)
  const orderDraftScope = localCommerceOrderDraftScope(managedIdentity?.workspaceId)
  // Money-path isolation (payment-qr-store.ts scope note): the QR lookup key must
  // carry which company this browser is operating as, or a later workspace could
  // show an earlier merchant's bank QR at its counter.
  const paymentQrScope = paymentQrScopeForWorkspace(managedIdentity?.workspaceId)
  // Same per-origin trap for device-local product photos (product-image-store.ts
  // scope note): IndexedDB is shared by every company that uses this browser, so
  // an unscoped SKU key showed one shop's photo on another shop's counter tile
  // and stock row wherever the two catalogs share a SKU string.
  const productImageScope = productImageScopeForWorkspace(managedIdentity?.workspaceId)
  const ecommerceBuyingScope = managedIdentity ? `ecommerce:${managedIdentity.workspaceId}` : 'ecommerce:local'
  const commerceRef = useRef(commerce)
  useEffect(() => {
    commerceRef.current = commerce
  }, [commerce])
  useEffect(() => {
    if (managedIdentity || !confirmedLocalShop) return undefined
    let active = true
    void import('../products/product-handoff')
      .then(({ readWebsiteEcommerceHandoff }) => {
        if (active) setLocalWebsiteIntakeRead({ status: 'ready', intake: readWebsiteEcommerceHandoff() })
      })
      .catch(() => {
        if (active) setLocalWebsiteIntakeRead({ status: 'error', intake: null })
      })
    return () => { active = false }
  }, [confirmedLocalShop, managedIdentity])
  const [actions, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [pendingAction, setPendingAction] = useState<PendingAccountableAction | null>(null)
  const [sku, setSku] = useState(commerce.items[0]?.sku ?? '')
  const [quantity, setQuantity] = useState(1)
  const [extraOrderLines, setExtraOrderLines] = useState<Array<{ sku: string; quantity: number }>>([])
  const [customer, setCustomer] = useState('')
  const [channel, setChannel] = useState('Messenger')
  const [payment, setPayment] = useState('')
  const [fulfilment, setFulfilment] = useState<'' | 'pickup' | 'delivery'>('')
  const [fulfilmentReference, setFulfilmentReference] = useState('')
  const [promisedAt, setPromisedAt] = useState('')
  const [paymentTermsDays, setPaymentTermsDays] = useState<0 | 7 | 30>(0)
  const [preparedChannelDraft, setPreparedChannelDraft] = useState<ChannelOrderDraft | null>(null)
  const [preparedEcommerceDraft, setPreparedEcommerceDraft] = useState<EcommerceShopDraft | null>(null)
  const [orderEntryMode, setOrderEntryMode] = useState<'manual' | 'message' | 'online'>('manual')
  const [orderDraftRead, setOrderDraftRead] = useState<CommerceOrderDraftReadResult>({ status: 'empty', draft: null, error: '' })
  const [orderDraftActive, setOrderDraftActive] = useState(false)
  const [resumedOrderDraft, setResumedOrderDraft] = useState<CommerceOrderDraft | null>(null)
  const [orderDraftIssue, setOrderDraftIssue] = useState('')
  const [orderDraftSaving, setOrderDraftSaving] = useState(false)
  const [orderDraftConflict, setOrderDraftConflict] = useState(false)
  const [orderDraftInitializedScope, setOrderDraftInitializedScope] = useState('')
  const orderDraftInitialized = orderDraftInitializedScope === orderDraftScope
  const orderComposerRef = useRef<HTMLDialogElement>(null)
  const pendingOrderComposerReveal = useRef<'' | 'ecommerce-request' | 'ecommerce-inbox' | 'ecommerce-inbox-request'>('')
  const orderComposerHeadingRef = useRef<HTMLHeadingElement>(null)
  const orderComposerTriggerRef = useRef<HTMLButtonElement>(null)
  const orderReviewRef = useRef<HTMLButtonElement>(null)
  const orderPromiseRef = useRef<HTMLInputElement>(null)
  const orderOptionsRef = useRef<HTMLDetailsElement>(null)
  const orderPaymentRef = useRef<HTMLSelectElement>(null)
  const catalogEditTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const catalogEditEditorRef = useRef<HTMLFormElement>(null)
  const purchaseOrderTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const purchaseOrderEditorRef = useRef<HTMLFormElement>(null)
  const purchaseOrderHistoryRef = useRef<HTMLDetailsElement>(null)
  const catalogCreateFormRef = useRef<HTMLFormElement>(null)
  const stockCountTriggerRef = useRef<HTMLButtonElement>(null)
  const stockCountEditorRef = useRef<HTMLFormElement>(null)
  const returnTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const returnEditorRef = useRef<HTMLFormElement>(null)
  const correctionTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const correctionEditorRef = useRef<HTMLFormElement>(null)
  const ecommerceInboxTargetRef = useRef<HTMLButtonElement>(null)
  const preparedChannelRef = useRef<HTMLDivElement>(null)
  const consumedEcommerceDraftId = useRef('')
  const consumedEcommerceReturnIntentId = useRef('')
  const consumedEcommerceSupportIntentId = useRef('')
  const consumedEcommerceCorrectionIntentId = useRef('')
  const consumedEcommerceCancellationIntentId = useRef('')
  const consumedEcommerceOrderAmendmentIntentId = useRef('')
  const consumedEcommerceOrderRescheduleIntentId = useRef('')
  const consumedEcommerceInboxSource = useRef('')
  const orderDraftRevisionRef = useRef(orderDraftRead.draft?.revision ?? 0)
  const orderDraftSaveQueueRef = useRef(Promise.resolve())
  const orderDraftCatalogRef = useRef(commerce.items)
  const orderDraftScopeRef = useRef(orderDraftScope)
  const orderDraftOperationEpochRef = useRef(0)
  const orderDraftResetEpochRef = useRef(0)
  const [actionTrigger, setActionTrigger] = useState<HTMLElement | null>(null)
  const [notice, setNotice] = useState('')
  const [catalogDraft, setCatalogDraft] = useState({ sku: '', name: '', onHand: '', reorderAt: '', price: '', reason: '', evidenceReference: '' })
  const [managedTemplateDraft, setManagedTemplateDraft] = useState({ reviewed: false, reason: '', evidenceReference: '' })
  const [itemDraft, setItemDraft] = useState({ sku: '', name: '', onHand: '', reorderAt: '', price: '' })
  const [catalogCreateOpen, setCatalogCreateOpen] = useState(false)
  const [catalogEditDraft, setCatalogEditDraft] = useState<CatalogItemEditDraft | null>(null)
  const [purchaseBudgetDraft, setPurchaseBudgetDraft] = useState<PurchaseBudgetDraft | null>(null)
  const [supplierSourcingDraft, setSupplierSourcingDraft] = useState<SupplierSourcingDraft | null>(null)
  const [purchaseOrderDraft, setPurchaseOrderDraft] = useState<PurchaseOrderDraft | null>(null)
  const [supplierInvoiceDraft, setSupplierInvoiceDraft] = useState<SupplierInvoiceDraft | null>(null)
  const [supplierReturnDraft, setSupplierReturnDraft] = useState<SupplierReturnDraft | null>(null)
  const [supplierCreditDraft, setSupplierCreditDraft] = useState<SupplierCreditDraft | null>(null)
  const [stockCountDraft, setStockCountDraft] = useState<StockCountDraft | null>(null)
  const [returnDraft, setReturnDraft] = useState<CommerceReturnDraft | null>(null)
  const [cancellationDraft, setCancellationDraft] = useState<EcommerceCancellationIntent | null>(null)
  const [orderAmendmentReview, setOrderAmendmentReview] = useState<{ intent: EcommerceOrderAmendmentIntent; replacementRequest: EcommerceOrderRequestV2; draft: EcommerceShopDraftV2 } | null>(null)
  const [orderRescheduleReview, setOrderRescheduleReview] = useState<{ intent: EcommerceOrderRescheduleIntent; replacementRequest: EcommerceOrderRequestV2; draft: EcommerceShopDraftV2 } | null>(null)
  const [supportDraft, setSupportDraft] = useState<CommerceSupportOpenDraft | null>(null)
  const [supportReopenDraft, setSupportReopenDraft] = useState<CommerceSupportReopenDraft | null>(null)
  const [supportServiceDraft, setSupportServiceDraft] = useState<CommerceSupportServiceDraft | null>(null)
  const [supportResolutionDraft, setSupportResolutionDraft] = useState<CommerceSupportResolutionDraft | null>(null)
  const [correctionDraft, setCorrectionDraft] = useState<CommerceCorrectionDraft | null>(null)
  const [taxDraft, setTaxDraft] = useState<TaxConfigurationDraft | null>(null)
  const [accountMapping, setAccountMapping] = useState<AccountMappingDraft | null>(null)
  const [creditPolicyDraft, setCreditPolicyDraft] = useState<CustomerCreditPolicyDraft>({
    customer: '',
    creditLimitMmk: '',
    maxPaymentTermsDays: 30,
    status: 'active',
  })
  const [promotionPolicyDraft, setPromotionPolicyDraft] = useState<PromotionPolicyDraft>({
    code: 'WELCOME',
    discountPercent: '10',
    minimumSubtotalMmk: '10000',
    maximumDiscountMmk: '10000',
    status: 'active',
    effectiveFrom: '',
    effectiveUntil: '',
  })
  const [shippingPolicyDraft, setShippingPolicyDraft] = useState<ShippingPolicyDraft>({
    zoneCode: 'YGN-CENTRAL',
    townships: 'Bahan, Kamayut, Sanchaung, Tamwe',
    feeMmk: '3000',
    promiseMinutes: '120',
    status: 'active',
    effectiveFrom: '',
    effectiveUntil: '',
  })
  const [paymentPolicyDraft, setPaymentPolicyDraft] = useState<PaymentPolicyDraft>({
    adapter: 'cash_on_delivery',
    allowedFulfilments: 'delivery',
    maximumOrderMmk: '500000',
    instructions: 'Collect at delivery and reconcile the courier cash handoff in Shop.',
    status: 'active',
    effectiveFrom: '',
    effectiveUntil: '',
  })
  const [closeSettlementDraft, setCloseSettlementDraft] = useState<CloseSettlementDraftLine[]>([])
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const effectiveTaxDraft = taxDraft ?? taxConfigurationDraft(currentTaxConfiguration)
  const effectiveAccountMapping = accountMapping ?? accountMappingDraft(currentAccountMappingConfiguration)
  const selectedSku = commerce.items.some((item) => item.sku === sku) || (resumedOrderDraft && sku)
    ? sku
    : commerce.items[0]?.sku ?? ''
  const selected = commerce.items.find((item) => item.sku === selectedSku)
  const manualOrderLineDrafts = [{ sku: selectedSku, quantity }, ...extraOrderLines]
  const manualOrderLineItems = manualOrderLineDrafts.map((line) => ({
    ...line,
    item: commerce.items.find((item) => item.sku === line.sku),
  }))
  const manualOrderQuantity = manualOrderLineDrafts.reduce((total, line) => total + Math.max(line.quantity, 0), 0)
  const manualOrderTotal = manualOrderLineItems.reduce((total, line) => total + (line.item?.price ?? 0) * Math.max(line.quantity, 0), 0)
  const manualOrderPricedTotal = preparedEcommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
    ? preparedEcommerceDraft.totalMmk
    : manualOrderTotal
  const orderCreditCalculation = commerceOrderCalculation(commerce, manualOrderPricedTotal, new Date(purchaseOrderClock).toISOString())
  const orderCreditReview = orderCreditCalculation
    ? commerceCustomerCreditReview(
      commerce,
      customer.trim() || 'Guest',
      orderCreditCalculation.totalMmk,
      paymentTermsDays,
      new Date(purchaseOrderClock).toISOString(),
    )
    : null
  const orderCreditBlocked = paymentTermsDays !== 0 && orderCreditReview?.allowed !== true
  const creditPolicyCustomer = creditPolicyDraft.customer.trim()
  const currentCreditPolicy = creditPolicyCustomer
    ? commerceCurrentCustomerCreditPolicy(commerce, creditPolicyCustomer)
    : null
  const currentPromotionPolicy = commerceCurrentPromotionPolicy(commerce, promotionPolicyDraft.code)
  const currentShippingPolicy = commerceCurrentShippingPolicy(commerce, shippingPolicyDraft.zoneCode)
  const currentPaymentPolicy = commerceCurrentPaymentPolicy(commerce, paymentPolicyDraft.adapter)
  const orderDraftHasMeaningfulFields = Boolean(customer.trim()
    || channel !== 'Messenger'
    || payment
    || fulfilment
    || fulfilmentReference.trim()
    || promisedAt
    || paymentTermsDays !== 0
    || extraOrderLines.length
    || quantity !== 1
    || selectedSku !== (commerce.items[0]?.sku ?? ''))
  const orderDraftFieldKey = JSON.stringify({
    customer,
    channel,
    payment,
    fulfilment,
    fulfilmentReference,
    promisedAt,
    paymentTermsDays,
    lines: manualOrderLineDrafts,
  })
  const currentOrderRecoveryInput = buildCommerceOrderRecoveryInput(
    { customer, channel, payment, fulfilment, fulfilmentReference, promisedAt, paymentTermsDays, lines: manualOrderLineDrafts },
    commerce.items,
    null,
  )
  const resumedOrderLinesMatch = Boolean(resumedOrderDraft
    && resumedOrderDraft.lines.length === manualOrderLineDrafts.length
    && resumedOrderDraft.lines.every((line, index) => (
      line.sku === manualOrderLineDrafts[index]?.sku
      && line.quantity === manualOrderLineDrafts[index]?.quantity
    )))
  const resumedOrderCatalogState = resumedOrderDraft
    ? localCommerceOrderDraftCatalogState(resumedOrderDraft, commerce.items)
    : null
  const resumedOrderNeedsReview = Boolean(orderDraftActive
    && resumedOrderDraft
    && (!resumedOrderLinesMatch || !resumedOrderCatalogState?.current))
  const resumedOrderCanRebind = Boolean(currentOrderRecoveryInput
    && currentOrderRecoveryInput.lines.every((line) => line.availableAtSave >= line.quantity))
  const legacyCloseNeedsMigration = commerce.closes.some((close) => !close.orderIds || !close.businessDate)
  const closePreview = commerceCloseExpectation(commerce, new Date().toISOString())
  const closePreviewOrderIds = new Set(closePreview?.orderIds ?? [])
  const closableOrders = commerce.orders.filter((order) => closePreviewOrderIds.has(order.id))
  const reconciledValue = closePreview?.total ?? 0
  const closeExpectedByPayment = new Map<string, number>()
  for (const order of closableOrders) {
    const adjustedTotal = commerceOrderAdjustedTotal(order)
    if (adjustedTotal !== null) closeExpectedByPayment.set(order.payment, (closeExpectedByPayment.get(order.payment) ?? 0) + adjustedTotal)
  }
  const effectiveCloseSettlementDraft = [...closeExpectedByPayment.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([paymentMethod, expectedMmk]) => closeSettlementDraft.find((line) => line.paymentMethod === paymentMethod) ?? {
      paymentMethod,
      countedMmk: String(expectedMmk),
      varianceOwner: '',
      varianceReason: '',
    })
  const closeSettlementInput = effectiveCloseSettlementDraft.map((line): CommerceCloseSettlementInputLine | null => {
    if (!/^(?:0|[1-9]\d*)$/.test(line.countedMmk)) return null
    const countedMmk = Number(line.countedMmk)
    return Number.isSafeInteger(countedMmk) ? { ...line, countedMmk } : null
  })
  const closeSettlement = closePreview && closeSettlementInput.every((line) => line !== null)
    ? commerceCloseSettlementReview(commerce, closePreview, closeSettlementInput as CommerceCloseSettlementInputLine[])
    : null
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt)
  const stockRows = commerce.items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftNeedsAttention = left.item.onHand <= left.item.reorderAt
      const rightNeedsAttention = right.item.onHand <= right.item.reorderAt
      if (leftNeedsAttention !== rightNeedsAttention) return leftNeedsAttention ? -1 : 1
      if (!leftNeedsAttention) return left.index - right.index
      const leftShortage = left.item.reorderAt - left.item.onHand
      const rightShortage = right.item.reorderAt - right.item.onHand
      return rightShortage - leftShortage || left.index - right.index
    })
  const openOrders = commerce.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
  const paymentReview = commerce.orders.filter((order) => order.refundStatus === 'due' || (order.status !== 'cancelled' && order.paymentStatus === 'pending'))
  const receivablesAging = commerceReceivablesAging(commerce, purchaseOrderClock)
  // "Which treatments did I finish today and never ring up?" Derived, never stored, and it
  // posts nothing -- see shop-appointment-till-reconciliation.ts for why that boundary holds.
  const appointmentTillReconciliation = useMemo(() => {
    if (!shopSchedule) return null
    try {
      return projectShopAppointmentTillReconciliation(shopSchedule, commerce, new Date(purchaseOrderClock).toISOString())
    } catch {
      return null
    }
  }, [commerce, purchaseOrderClock, shopSchedule])
  const scheduleVocabulary = shopScheduleVocabulary(shopSchedule?.industryPackId ?? '')
  const supplierPayablesAging = commerceSupplierPayablesAging(commerce, purchaseOrderClock)
  const actionOrders = commerce.orders.filter(commerceOrderNeedsAction).sort(compareCommerceOrderPromise)
  const actionOrderIds = new Set(actionOrders.map((order) => order.id))
  const closedOrders = commerce.orders.filter((order) => !actionOrderIds.has(order.id))
  // This memo used to build one acknowledgement for EVERY order in the workspace. It is keyed
  // on `commerce`, which is a new object after every sale, so a till rebuilt all of them after
  // every sale -- and commerceOrderAcknowledgement validated the whole workspace once per
  // order to do it.
  //
  // Measured 2026-08-21 on a Shop driven to its enforced 2 MiB ceiling through the real
  // transitions (1,262 orders, 1,081 completed, 2,097,406 bytes): about 50 SECONDS per sale
  // (three runs, medians 47.6 s, 50.6 s, 54.5 s). 97% of that was the repeated validation;
  // the rest was building 1,073 acknowledgements nobody was looking at. This screen shows 189
  // of them -- every order needing action, plus one eight-row page of the archive.
  //
  // So: validated once, and built per order only when a row asks. About 50 ms on the same
  // fixture (48.3, 50.7, 59.1). Hoisting the validation alone would have been about 150 ms
  // (137.0, 137.6, 170.3); the rest of the win is not doing the work.
  const orderAcknowledgementDownloads = useMemo(() => orderAcknowledgementLookup(commerce), [commerce])
  const [receiptAck, setReceiptAck] = useState<CommerceOrderAcknowledgement | null>(null)
  const [counterReceiptOrderId, setCounterReceiptOrderId] = useState('')
  const counterReceiptAck = tab === 'counter' && counterReceiptOrderId
    ? orderAcknowledgementDownloads.get(counterReceiptOrderId)?.artifact ?? null
    : null
  const activeReceiptAck = receiptAck ?? counterReceiptAck
  const latestClose = commerce.closes.find((close) => close.operator)
  // Roadmap §2 item 5 — anomaly flags on the close. A pure projection over
  // closes already saved (shop-close-anomaly-flags.ts): nothing is stored, no
  // clock is read, and guided-sample closes are excluded by actionId prefix.
  const closeAnomaly = useMemo(() => projectShopCloseAnomalyFlags(commerce), [commerce])
  // The projection stays numeric; the sentences live here so they can use the
  // shell's own money format. Each one states no more than the numbers behind
  // it: what happened, in which direction, against which baseline, and the one
  // thing worth doing about it. The baseline phrase is exact about WHICH
  // closes were compared — `baselineDays` counts only the closes that recorded
  // that measure, so it may be fewer than the window, and saying "your last N
  // closes" when it is fewer would name a set that was never looked at.
  const closeAnomalyBaselinePhrase = (flag: ShopCloseAnomalyFlag) => flag.baselineDays === flag.windowDays
    ? `more than on any of your last ${flag.windowDays} closes`
    : `more than on any of the ${flag.baselineDays} earlier closes that recorded it`
  const closeAnomalySentence = (flag: ShopCloseAnomalyFlag) => {
    // The percentage is recomputed from the two figures the projection exposes
    // rather than from the already-rounded multiple, so an owner who divides
    // one by the other gets the number on screen.
    const percentOfUsual = flag.baselineMedian > 0 ? Math.round((flag.todayValue / flag.baselineMedian) * 100) : 0
    if (flag.measure === 'cash_variance') {
      const versus = flag.basis === 'multiple_of_median' ? `about ${flag.multipleOfMedian}× your usual difference` : closeAnomalyBaselinePhrase(flag)
      return `The drawer was off by ${formatMoney(flag.todayValue)} — ${versus}. Worth counting it again against this close.`
    }
    if (flag.measure === 'unpaid_orders') {
      const versus = flag.basis === 'multiple_of_median' ? `about ${flag.multipleOfMedian}× your usual day` : closeAnomalyBaselinePhrase(flag)
      return `${flag.todayValue} ${flag.todayValue === 1 ? 'order was' : 'orders were'} left unpaid — ${versus}. That is money still to collect.`
    }
    if (flag.direction === 'below') return `Takings were ${formatMoney(flag.todayValue)} — about ${percentOfUsual}% of your usual day. Worth checking every sale was rung up.`
    return `Takings were ${formatMoney(flag.todayValue)} — about ${flag.multipleOfMedian}× your usual day. Worth checking nothing was keyed in twice or with an extra zero.`
  }
  // Named only for measures the projection actually compared. A measure that
  // sat out is never spoken for.
  const closeAnomalyComparedPhrase = (measures: ShopCloseAnomalyFlags['comparedMeasures']) => {
    const names = measures.map((measure) => measure === 'cash_variance' ? 'drawer count' : measure === 'unpaid_orders' ? 'unpaid orders' : 'takings')
    if (names.length === 1) return names[0]
    return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  }
  // The artifact stays memoised: four places on this screen read whether it exists to decide
  // what to say ("CSV ready", "Export ready", "Review import"), so it is genuinely consumed on
  // every render. The FILE is not. It used to be spelled out here as a percent-encoded data:
  // URL and held for the life of the page.
  //
  // Measured 2026-08-21 against a Shop driven to its enforced 2 MiB ceiling through the real
  // transitions (1,453 orders, 1,244 completed, one saved close): the close CSV is 509,334
  // bytes and its data: URL 758,928 -- 1.49x, because percent-encoding escapes every comma,
  // quote and newline. This memo is keyed on `commerce`, which is a new object after every
  // sale, so that string was rebuilt and re-retained on every sale all day, for a file an
  // owner downloads at most once a day. The till sits on this screen; the settings page #535
  // fixed is opened rarely, and this one is never closed.
  const latestCloseDownload = useMemo(() => {
    if (!latestClose) return null
    const artifact = commerceDailyCloseExport(commerce, latestClose.id)
    if (!artifact) return null
    return {
      artifact,
      filename: `supermega-shop-close-${artifact.businessDate}-${artifact.digest.slice(7, 15)}.csv`,
    }
  }, [commerce, latestClose])
  const latestAccountingDownload = useMemo(() => {
    if (!latestClose) return null
    const artifact = commerceAccountingHandoff(commerce, latestClose.id)
    if (!artifact) return null
    return {
      filename: `supermega-shop-accounting-${artifact.businessDate}-${artifact.digest.slice(7, 15)}.csv`,
      href: `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${commerceAccountingHandoffCsv(artifact)}`)}`,
      artifact,
    }
  }, [commerce, latestClose])
  const supplierPayablesDownload = useMemo(() => {
    const artifact = commerceSupplierPayablesHandoff(commerce)
    if (!artifact) return null
    return {
      filename: `supermega-shop-payables-${artifact.generatedAt.slice(0, 10)}-${artifact.digest.slice(7, 15)}.csv`,
      href: `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${commerceSupplierPayablesHandoffCsv(artifact)}`)}`,
      artifact,
    }
  }, [commerce])
  const customerReceivablesDownload = useMemo(() => {
    const artifact = commerceCustomerReceivablesHandoff(commerce, purchaseOrderClock)
    if (!artifact) return null
    return {
      filename: `supermega-shop-receivables-${artifact.generatedAt.slice(0, 10)}-${artifact.digest.slice(7, 15)}.csv`,
      href: `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${commerceCustomerReceivablesHandoffCsv(artifact)}`)}`,
      artifact,
    }
  }, [commerce, purchaseOrderClock])
  const supportWorkloadDownload = useMemo(() => {
    try {
      const artifact = commerceSupportWorkloadExport(commerce, new Date(purchaseOrderClock).toISOString())
      if (!artifact.rows.length) return null
      return {
        filename: `supermega-shop-support-${artifact.asOf.slice(0, 10)}-${artifact.digest.slice(7, 15)}.csv`,
        href: `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${commerceSupportWorkloadCsv(artifact)}`)}`,
        artifact,
      }
    } catch {
      return null
    }
  }, [commerce, purchaseOrderClock])
  const importedWebsiteOrderIds = commerce.orders.flatMap((order) => order.sourceRecordId ? [order.sourceRecordId] : [])
  const websiteIntakes = commerceWebsiteIntakes(commerce)
  const localWebsiteIntake = localWebsiteIntakeRead.intake
  const legacyWebsiteWorkWaiting = managedIdentity
    ? websiteIntakes.some((intake) => intake.status === 'pending_confirmation')
    : confirmedLocalShop && localWebsiteIntakeRead.status === 'ready'
      && Boolean(localWebsiteIntake && (!localWebsiteIntake.order || !importedWebsiteOrderIds.includes(localWebsiteIntake.order.id)))
  const storefrontRequests = commerceStorefrontRequests(commerce)
  const pendingStorefrontRequests = storefrontRequests.filter((request) => (
    !commerce.orders.some((order) => order.sourceRecordId === request.id)
  ))
  const requestedStorefrontRequestIsWaiting = Boolean(
    requestedRequestId
    && pendingStorefrontRequests.some((request) => request.id === requestedRequestId),
  )
  const purchaseOrderRows = commercePurchaseOrders(commerce)
    .map((purchaseOrder) => ({
      purchaseOrder,
      progress: commercePurchaseOrderProgress(commerce, purchaseOrder),
      item: commerce.items.find((item) => item.sku === purchaseOrder.sku),
    }))
    .sort(compareCommercePurchaseOrderAttention)
  const convertedRequisitionIds = new Set(purchaseOrderRows.flatMap(({ purchaseOrder }) => purchaseOrder.requisitionId ? [purchaseOrder.requisitionId] : []))
  const openPurchaseRequisitions = commercePurchaseRequisitions(commerce).filter((requisition) => !convertedRequisitionIds.has(requisition.id))
  const purchaseBudgetEnvelopes = commercePurchaseBudgetEnvelopes(commerce)
  const activePurchaseBudget = purchaseBudgetEnvelopes.find((envelope) => (
    Date.parse(envelope.periodStart) <= purchaseOrderClock && purchaseOrderClock < Date.parse(envelope.periodEnd)
  ))
  const activePurchaseBudgetCommitment = activePurchaseBudget
    ? commercePurchaseBudgetCommitment(commerce, activePurchaseBudget)
    : null
  const consumedSourcingDecisionIds = new Set(commercePurchaseRequisitions(commerce).flatMap((requisition) => (
    requisition.sourceSourcingDecisionId ? [requisition.sourceSourcingDecisionId] : []
  )))
  const openSupplierSourcingDecisions = commerceSupplierSourcingDecisions(commerce).filter((decision) => {
    const selected = commerceSupplierSourcingSelectedQuote(decision)
    return selected && !consumedSourcingDecisionIds.has(decision.id) && Date.parse(selected.validUntil) >= purchaseOrderClock
  })
  const supplierPerformance = commerceSupplierPerformance(commerce, purchaseOrderClock)
  const activePurchaseOrderBySku = new Map(
    purchaseOrderRows
      .filter(({ progress }) => progress.status === 'open' || progress.status === 'partially_received')
      .map((row) => [row.purchaseOrder.sku, row]),
  )
  const shopDemandIntelligence = useMemo(
    () => projectShopDemandIntelligence(commerce, purchaseOrderClock),
    [commerce, purchaseOrderClock],
  )
  const demandForecastRows = shopDemandIntelligence.rows.filter((row) => row.netDemandUnits > 0)
  const shopReplenishment = useMemo(
    () => projectShopReplenishment(commerce, relatedProduction),
    [commerce, relatedProduction],
  )
  const purchaseRecommendations = shopReplenishment.rows.filter((row) => row.recommendedOrderUnits > 0)
  const shopProcurementDecision = useMemo(
    () => projectShopProcurementDecision(commerce, shopReplenishment, purchaseOrderClock),
    [commerce, purchaseOrderClock, shopReplenishment],
  )
  const procurementReviews = shopProcurementDecision.rows
  const managedInventoryProjection = useMemo(() => {
    if (!commerce.inventoryFoundation) return null
    try {
      return projectShopInventory(
        commerce.inventoryFoundation,
        commerce.items.map((item) => item.sku).sort(),
      )
    } catch {
      return null
    }
  }, [commerce.inventoryFoundation, commerce.items])
  const defaultReceiptLocationId = managedInventoryProjection?.locations.find((location) => /main/i.test(location.name))?.id
    ?? managedInventoryProjection?.locations[0]?.id
    ?? ''
  // S3 customer points. Settings are read once per mount (they are edited on the
  // separate Workspace-controls route, so navigating back here remounts this page and
  // picks the change up). Balances — including redeemed spends, which live as
  // prefixed corrections inside the commerce state itself (PR2) — are a pure
  // projection over the same commerce state the counter renders, so a redemption
  // refreshes every chip through the ordinary state update with no extra epoch.
  // Client-master names are added at zero so a known customer with no points yet
  // still gets an exact-match chip instead of silence.
  const shopLoyaltySettings = useMemo(
    () => readShopLoyaltySettings(shopLoyaltyScopeForWorkspace(managedIdentity?.workspaceId)),
    [managedIdentity],
  )
  const shopLoyaltyPoints = useMemo(() => {
    if (!shopLoyaltySettings?.enabled) return null
    const balances = shopLoyaltyBalances(commerce, shopLoyaltySettings)
    for (const client of managedInventoryProjection?.clients ?? []) {
      if (!balances.has(client.name)) balances.set(client.name, 0)
    }
    return balances
  }, [commerce, managedInventoryProjection, shopLoyaltySettings])
  // S3 PR2 receipt lines: the named customer's balance, plus any points already
  // redeemed against this order. Display-only — the printed artifact text stays
  // byte-identical to what the settle recorded.
  const receiptLoyalty = useMemo(() => {
    if (!activeReceiptAck || !shopLoyaltySettings?.enabled || !shopLoyaltyPoints) return null
    const customer = activeReceiptAck.customer.trim()
    if (!customer || customer === 'Guest') return null
    return {
      balancePoints: shopLoyaltyDisplayPoints(shopLoyaltyPoints.get(customer) ?? 0),
      redeemedPoints: shopLoyaltyRedeemedPointsForOrder(commerce.orders.find((order) => order.id === activeReceiptAck.orderId)),
    }
  }, [activeReceiptAck, commerce.orders, shopLoyaltyPoints, shopLoyaltySettings])
  const purchaseOrderDraftOrder = purchaseOrderDraft?.mode === 'receive'
    ? purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === purchaseOrderDraft.purchaseOrderId)
    : undefined
  const purchaseOrderDraftItem = purchaseOrderDraft?.mode === 'create'
    ? commerce.items.find((item) => item.sku === purchaseOrderDraft.sku)
    : purchaseOrderDraftOrder?.item
  const purchaseOrderQuantityText = purchaseOrderDraft?.quantity.trim() ?? ''
  const purchaseOrderQuantity = /^\d+$/.test(purchaseOrderQuantityText)
    ? Number(purchaseOrderQuantityText)
    : Number.NaN
  const purchaseOrderRejectedText = purchaseOrderDraft?.mode === 'receive' ? purchaseOrderDraft.rejectedQuantity.trim() : '0'
  const purchaseOrderRejectedQuantity = /^\d+$/.test(purchaseOrderRejectedText)
    ? Number(purchaseOrderRejectedText)
    : Number.NaN
  const purchaseOrderRejectedResult = Number.isSafeInteger(purchaseOrderRejectedQuantity) && purchaseOrderRejectedQuantity >= 0
    ? purchaseOrderRejectedQuantity
    : null
  const purchaseOrderQuantityLimit = purchaseOrderDraft?.mode === 'receive'
    ? Math.min(
        Math.max(0, (purchaseOrderDraftOrder?.progress.remaining ?? 0) - (purchaseOrderRejectedResult ?? 0)),
        purchaseOrderDraftItem ? Number.MAX_SAFE_INTEGER - purchaseOrderDraftItem.onHand : 0,
      )
    : Number.MAX_SAFE_INTEGER
  const purchaseOrderQuantityResult = purchaseOrderDraftItem
    && Number.isSafeInteger(purchaseOrderQuantity)
    && purchaseOrderQuantity > 0
    && purchaseOrderQuantity <= purchaseOrderQuantityLimit
    ? purchaseOrderQuantity
    : null
  const purchaseOrderExpectedAtTime = purchaseOrderDraft?.mode === 'create'
    ? new Date(purchaseOrderDraft.expectedAt).getTime()
    : Number.NaN
  const purchaseOrderExpectedAtResult = Number.isFinite(purchaseOrderExpectedAtTime)
    && purchaseOrderExpectedAtTime > purchaseOrderClock
    ? new Date(purchaseOrderExpectedAtTime).toISOString()
    : null
  const purchaseOrderUnitCostText = purchaseOrderDraft?.mode === 'create' ? purchaseOrderDraft.unitCostMmk.trim() : ''
  const purchaseOrderUnitCost = /^\d+$/.test(purchaseOrderUnitCostText) ? Number(purchaseOrderUnitCostText) : Number.NaN
  const purchaseOrderUnitCostResult = Number.isSafeInteger(purchaseOrderUnitCost) && purchaseOrderUnitCost > 0
    ? purchaseOrderUnitCost
    : null
  const purchaseOrderDraftTotal = purchaseOrderQuantityResult !== null && purchaseOrderUnitCostResult !== null
    && Number.isSafeInteger(purchaseOrderQuantityResult * purchaseOrderUnitCostResult)
    ? purchaseOrderQuantityResult * purchaseOrderUnitCostResult
    : null
  const supplierInvoiceDraftRow = supplierInvoiceDraft
    ? purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === supplierInvoiceDraft.purchaseOrderId)
    : null
  const supplierInvoiceQuantity = supplierInvoiceDraft && /^\d+$/.test(supplierInvoiceDraft.quantity.trim())
    ? Number(supplierInvoiceDraft.quantity)
    : Number.NaN
  const supplierInvoiceUnitCost = supplierInvoiceDraft && /^\d+$/.test(supplierInvoiceDraft.unitCostMmk.trim())
    ? Number(supplierInvoiceDraft.unitCostMmk)
    : Number.NaN
  const supplierInvoiceIssuedAt = supplierInvoiceDraft ? new Date(supplierInvoiceDraft.issuedAt).getTime() : Number.NaN
  const supplierInvoiceDueAt = supplierInvoiceDraft ? new Date(supplierInvoiceDraft.dueAt).getTime() : Number.NaN
  const supplierInvoiceTotal = Number.isSafeInteger(supplierInvoiceQuantity)
    && supplierInvoiceQuantity > 0
    && Number.isSafeInteger(supplierInvoiceUnitCost)
    && supplierInvoiceUnitCost > 0
    && Number.isSafeInteger(supplierInvoiceQuantity * supplierInvoiceUnitCost)
    ? supplierInvoiceQuantity * supplierInvoiceUnitCost
    : null
  const supplierInvoiceDraftReady = Boolean(
    supplierInvoiceDraftRow
    && !supplierInvoiceDraftRow.purchaseOrder.supplierInvoice
    && supplierInvoiceDraft?.supplierReference.trim()
    && supplierInvoiceDraft.supplierReference.trim().length <= 80
    && supplierInvoiceTotal !== null
    && Number.isFinite(supplierInvoiceIssuedAt)
    && Number.isFinite(supplierInvoiceDueAt)
    && supplierInvoiceIssuedAt >= Date.parse(supplierInvoiceDraftRow.purchaseOrder.createdAt)
    && supplierInvoiceDueAt >= supplierInvoiceIssuedAt,
  )
  const supplierReturnDraftRow = supplierReturnDraft
    ? purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === supplierReturnDraft.purchaseOrderId)
    : null
  const supplierReturnDraftReceipt = supplierReturnDraft
    ? commerce.movements.find((movement) => movement.id === supplierReturnDraft.receiptMovementId)
    : null
  const supplierReturnDraftReady = Boolean(
    supplierReturnDraftRow
    && supplierReturnDraftReceipt?.kind === 'receipt'
    && supplierReturnDraftReceipt.purchaseOrderId === supplierReturnDraftRow.purchaseOrder.id
    && supplierReturnDraftReceipt.rejectedQuantity
    && supplierReturnDraft?.internalReturnReference.trim()
    && supplierReturnDraft.internalReturnReference.trim().length <= 80,
  )
  const supplierCreditDraftRow = supplierCreditDraft
    ? purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === supplierCreditDraft.purchaseOrderId)
    : null
  const supplierCreditDraftClaim = supplierCreditDraftRow?.purchaseOrder.supplierReturns
    ?.find((claim) => claim.id === supplierCreditDraft?.supplierReturnId)
  const supplierCreditAmount = supplierCreditDraft && /^\d+$/.test(supplierCreditDraft.amountMmk.trim())
    ? Number(supplierCreditDraft.amountMmk)
    : Number.NaN
  const supplierCreditIssuedAt = supplierCreditDraft ? new Date(supplierCreditDraft.issuedAt).getTime() : Number.NaN
  const supplierCreditDraftReady = Boolean(
    supplierCreditDraftClaim
    && supplierCreditDraft?.supplierReference.trim()
    && supplierCreditDraft.supplierReference.trim().length <= 80
    && Number.isSafeInteger(supplierCreditAmount)
    && supplierCreditAmount > 0
    && supplierCreditAmount <= commerceSupplierReturnClaimBalance(supplierCreditDraftClaim)
    && Number.isFinite(supplierCreditIssuedAt)
    && supplierCreditIssuedAt >= Date.parse(supplierCreditDraftClaim.createdAt),
  )
  const purchaseReceiptLocation = purchaseOrderDraft?.mode === 'receive'
    ? managedInventoryProjection?.locations.find((location) => location.id === purchaseOrderDraft.locationId)
    : undefined
  const purchaseReceiptTrackingCode = purchaseOrderDraft?.mode === 'receive'
    ? purchaseOrderDraft.trackingCode.trim().normalize('NFC')
    : ''
  const purchaseReceiptAllocationReady = purchaseOrderDraft?.mode !== 'receive' || !commerce.inventoryFoundation || Boolean(
    managedInventoryProjection
    && purchaseReceiptLocation
    && purchaseReceiptTrackingCode
    && purchaseReceiptTrackingCode.length <= 80,
  )
  const purchaseReceiptDiscrepancyReady = purchaseOrderDraft?.mode !== 'receive'
    || (purchaseOrderRejectedResult !== null
      && purchaseOrderQuantityResult !== null
      && purchaseOrderQuantityResult + purchaseOrderRejectedResult <= (purchaseOrderDraftOrder?.progress.remaining ?? 0))
  const catalogEditItem = catalogEditDraft
    ? commerce.items.find((item) => item.sku === catalogEditDraft.sku)
    : undefined
  const catalogEditPriceText = catalogEditDraft?.price.trim() ?? ''
  const catalogEditPrice = /^[0-9]+$/.test(catalogEditPriceText)
    ? Number(catalogEditPriceText)
    : Number.NaN
  const catalogEditPriceResult = Number.isSafeInteger(catalogEditPrice) && catalogEditPrice >= 1
    ? catalogEditPrice
    : null
  const catalogEditReorderText = catalogEditDraft?.reorderAt.trim() ?? ''
  const catalogEditReorder = /^[0-9]+$/.test(catalogEditReorderText)
    ? Number(catalogEditReorderText)
    : Number.NaN
  const catalogEditReorderResult = Number.isSafeInteger(catalogEditReorder) && catalogEditReorder >= 0
    ? catalogEditReorder
    : null
  const catalogEditStale = Boolean(catalogEditDraft && (!catalogEditItem
    || catalogEditItem.price !== catalogEditDraft.expectedPrice
    || catalogEditItem.reorderAt !== catalogEditDraft.expectedReorderAt))
  const catalogEditChanged = Boolean(catalogEditDraft
    && catalogEditPriceResult !== null
    && catalogEditReorderResult !== null
    && (catalogEditPriceResult !== catalogEditDraft.expectedPrice
      || catalogEditReorderResult !== catalogEditDraft.expectedReorderAt))
  const stockCountBalance = stockCountDraft && managedInventoryProjection
    ? managedInventoryProjection.balances.find((balance) => (
        balance.stockUnitId === stockCountDraft.stockUnitId
        && balance.locationId === stockCountDraft.locationId
      ))
    : undefined
  const stockCountItem = stockCountDraft
    ? commerce.items.find((item) => item.sku === (stockCountBalance?.sku ?? stockCountDraft.sku))
    : undefined
  const stockCountQuantityText = stockCountDraft?.quantity.trim() ?? ''
  const stockCountQuantity = /^[0-9]+$/.test(stockCountQuantityText)
    ? Number(stockCountQuantityText)
    : Number.NaN
  const stockCountQuantityResult = stockCountItem
    && Number.isSafeInteger(stockCountQuantity)
    && stockCountQuantity >= 0
    && (!commerce.inventoryFoundation || Boolean(stockCountBalance))
    && (!stockCountBalance || stockCountQuantity >= stockCountBalance.reserved)
    && (!stockCountBalance || stockCountBalance.tracking !== 'serial' || stockCountQuantity <= 1)
    && Number.isSafeInteger(stockCountItem.onHand + stockCountQuantity - (stockCountBalance?.onHand ?? stockCountItem.onHand))
    ? stockCountQuantity
    : null
  const stockCountTargetValue = stockCountBalance
    ? `${stockCountBalance.stockUnitId}|${stockCountBalance.locationId}`
    : ''
  const stockCountTargetSelected = commerce.inventoryFoundation
    ? Boolean(stockCountBalance)
    : Boolean(stockCountItem)
  const returnDraftOrder = returnDraft
    ? commerce.orders.find((order) => order.id === returnDraft.orderId)
    : undefined
  const returnDraftLines = returnDraftOrder
    ? commerceOrderReturnLines(returnDraftOrder).map((line) => {
        const returned = (returnDraftOrder.returns ?? [])
          .filter((record) => record.sku === line.sku)
          .reduce((sum, record) => sum + record.quantity, 0)
        return { ...line, returned, remaining: line.quantity - returned }
      }).filter((line) => line.remaining > 0)
    : []
  const selectedReturnLine = returnDraftLines.find((line) => line.sku === returnDraft?.sku)
  const returnQuantityText = returnDraft?.quantity.trim() ?? ''
  const returnQuantity = /^[0-9]+$/.test(returnQuantityText)
    ? Number(returnQuantityText)
    : Number.NaN
  const returnQuantityResult = selectedReturnLine
    && Number.isSafeInteger(returnQuantity)
    && returnQuantity > 0
    && returnQuantity <= selectedReturnLine.remaining
    ? returnQuantity
    : null
  const returnReviewExpectation = useMemo(() => {
    if (!returnDraft || returnQuantityResult === null) return null
    return commerceOrderReturnExpectation(
      commerce,
      returnDraft.orderId,
      returnDraft.sku,
      returnDraft.disposition,
      returnQuantityResult,
    )
  }, [commerce, returnDraft, returnQuantityResult])
  const returnLocationPreview = returnReviewExpectation?.locationAllocations?.map((allocation) => {
    const location = managedInventoryProjection?.locations.find((candidate) => candidate.id === allocation.locationId)
    const stockUnit = managedInventoryProjection?.stockUnits.find((candidate) => candidate.id === allocation.stockUnitId)
    return `${location?.name ?? allocation.locationId} · ${stockUnit?.trackingCode ?? allocation.stockUnitId} × ${allocation.quantity}`
  }).join(', ') ?? ''
  const correctionDraftOrder = correctionDraft
    ? commerce.orders.find((order) => order.id === correctionDraft.orderId)
    : undefined
  const correctionAmountText = correctionDraft?.listedAmountMmk.trim() ?? ''
  const correctionAmount = /^[0-9]+$/.test(correctionAmountText)
    ? Number(correctionAmountText)
    : Number.NaN
  const correctionCalculation = correctionDraftOrder
    && Number.isSafeInteger(correctionAmount)
    && correctionAmount > 0
    ? commerceCorrectionCalculation(correctionDraftOrder, correctionAmount)
    : null
  const correctionReviewExpectation = useMemo(() => (
    correctionDraft ? commerceOrderCorrectionExpectation(commerce, correctionDraft.orderId) : null
  ), [commerce, correctionDraft])

  useEffect(() => {
    if (tab !== 'inventory' && tab !== 'orders') return
    const frame = window.requestAnimationFrame(() => {
      if (tab === 'orders' && commerceLocation.hash.startsWith('#shop-order-')) {
        const target = document.getElementById(commerceLocation.hash.slice(1))
        target?.scrollIntoView({ block: 'center' })
        target?.focus({ preventScroll: true })
        return
      }
      if (tab !== 'inventory') return
      if (commerceLocation.hash === '#purchase-orders') {
        const history = purchaseOrderHistoryRef.current
        if (history) history.open = true
        history?.scrollIntoView({ block: 'center' })
        history?.querySelector('summary')?.focus({ preventScroll: true })
        return
      }
      if (commerceLocation.hash === '#shop-catalog-import') {
        const target = document.getElementById('shop-catalog-import')
        target?.scrollIntoView({ block: 'start' })
        target?.focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [commerce.orders.length, commerceLocation.hash, tab])

  useEffect(() => {
    let current = true
    const scopeChanged = orderDraftScopeRef.current !== orderDraftScope
    orderDraftOperationEpochRef.current += 1
    orderDraftScopeRef.current = orderDraftScope
    if (scopeChanged) {
      queueMicrotask(() => {
        if (!current || orderDraftScopeRef.current !== orderDraftScope) return
        orderComposerRef.current?.close()
        setOrderDraftActive(false)
        setResumedOrderDraft(null)
        setOrderDraftConflict(false)
        setSku('')
        setQuantity(1)
        setExtraOrderLines([])
        setCustomer('')
        setChannel('Messenger')
        setPayment('')
        setFulfilment('')
        setFulfilmentReference('')
        setPromisedAt('')
        setPreparedChannelDraft(null)
        setPreparedEcommerceDraft(null)
        setOrderEntryMode('manual')
      })
    }
    void import('./commerce-order-draft')
      .then(({ commerceOrderDraftResetEpoch, readCommerceOrderDraft }) => {
        if (!current || orderDraftScopeRef.current !== orderDraftScope) return
        const latest = readCommerceOrderDraft(orderDraftScope)
        orderDraftResetEpochRef.current = commerceOrderDraftResetEpoch()
        orderDraftRevisionRef.current = latest.draft?.revision ?? 0
        setOrderDraftRead(latest)
        setOrderDraftIssue(latest.error)
        setOrderDraftInitializedScope(orderDraftScope)
      })
      .catch(() => {
        if (!current || orderDraftScopeRef.current !== orderDraftScope) return
        const recoveryError = 'Order recovery could not load. Shop records remain available, but new unfinished orders cannot be saved safely.'
        setOrderDraftRead({
          status: 'unavailable',
          draft: null,
          error: recoveryError,
        })
        setOrderDraftIssue(recoveryError)
        setOrderDraftInitializedScope(orderDraftScope)
      })
    return () => { current = false }
  }, [orderDraftScope])

  useEffect(() => {
    orderDraftCatalogRef.current = commerce.items
  }, [commerce.items])

  useEffect(() => {
    const storageKey = localCommerceOrderDraftStorageKey(orderDraftScope)
    function refreshOrderDraft(event: StorageEvent) {
      if (event.key !== storageKey
        && event.key !== SHOP_ORDER_DRAFT_RESET_EPOCH_KEY
        && event.key !== null) return
      orderDraftOperationEpochRef.current += 1
      void import('./commerce-order-draft').then(({ commerceOrderDraftResetEpoch, readCommerceOrderDraft }) => {
        if (orderDraftScopeRef.current !== orderDraftScope) return
        const latest = readCommerceOrderDraft(orderDraftScope)
        orderDraftResetEpochRef.current = commerceOrderDraftResetEpoch()
        orderDraftRevisionRef.current = latest.draft?.revision ?? 0
        setOrderDraftRead(latest)
        if (orderDraftActive) {
          setOrderDraftConflict(true)
          setOrderDraftIssue('The unfinished order changed in another tab. Current fields were kept; close this form to review the latest saved draft.')
          return
        }
        setOrderDraftIssue(latest.error)
      }).catch(() => {
        setOrderDraftIssue('The changed order draft could not be read. Current fields were kept.')
      })
    }
    window.addEventListener('storage', refreshOrderDraft)
    return () => window.removeEventListener('storage', refreshOrderDraft)
  }, [orderDraftActive, orderDraftScope])

  useEffect(() => {
    if (!orderDraftActive
      || !orderDraftInitialized
      || orderEntryMode !== 'manual'
      || preparedChannelDraft
      || preparedEcommerceDraft
      || pendingAction
      || !commerceCanWrite
      || orderDraftConflict
      || orderDraftRead.status === 'invalid'
      || orderDraftRead.status === 'unavailable') return
    const operationEpochAtSchedule = orderDraftOperationEpochRef.current
    const resetEpochAtSchedule = orderDraftResetEpochRef.current
    const recoveryFields = JSON.parse(orderDraftFieldKey) as {
      customer: string
      channel: string
      payment: string
      fulfilment: '' | 'pickup' | 'delivery'
      fulfilmentReference: string
      promisedAt: string
      paymentTermsDays: 0 | 7 | 30
      lines: Array<{ sku: string; quantity: number }>
    }
    const timer = window.setTimeout(() => {
      const scopeAtSave = orderDraftScope
      const operation = async () => {
        if (orderDraftScopeRef.current !== scopeAtSave
          || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
        setOrderDraftSaving(true)
        try {
          const expectedRevision = orderDraftRevisionRef.current
          if (!orderDraftHasMeaningfulFields) {
            if (expectedRevision > 0) {
              const { discardCommerceOrderDraft } = await import('./commerce-order-draft')
              if (orderDraftScopeRef.current !== scopeAtSave
                || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
              await discardCommerceOrderDraft(scopeAtSave, expectedRevision, {
                expectedResetEpoch: resetEpochAtSchedule,
              })
            }
            if (orderDraftScopeRef.current !== scopeAtSave
              || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
            orderDraftRevisionRef.current = 0
            setOrderDraftRead({ status: 'empty', draft: null, error: '' })
            setResumedOrderDraft(null)
            setOrderDraftIssue('')
            return
          }
          const input = buildCommerceOrderRecoveryInput(
            recoveryFields,
            orderDraftCatalogRef.current,
            resumedOrderDraft,
          )
          if (!input) {
            setOrderDraftIssue('Choose current Shop items before this unfinished order can be saved.')
            return
          }
          const { saveCommerceOrderDraft } = await import('./commerce-order-draft')
          if (orderDraftScopeRef.current !== scopeAtSave
            || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
          const saved = await saveCommerceOrderDraft(
            input,
            expectedRevision,
            scopeAtSave,
            { expectedResetEpoch: resetEpochAtSchedule },
          )
          if (orderDraftScopeRef.current !== scopeAtSave
            || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
          orderDraftRevisionRef.current = saved.revision
          setOrderDraftRead({ status: 'ready', draft: saved, error: '' })
          setOrderDraftIssue('')
        } catch (error) {
          if (orderDraftScopeRef.current === scopeAtSave
            && orderDraftOperationEpochRef.current === operationEpochAtSchedule) {
            setOrderDraftIssue(error instanceof Error ? error.message : 'The unfinished order could not be saved.')
          }
        } finally {
          if (orderDraftScopeRef.current === scopeAtSave) setOrderDraftSaving(false)
        }
      }
      orderDraftSaveQueueRef.current = orderDraftSaveQueueRef.current.then(operation, operation)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [
    commerceCanWrite,
    orderDraftActive,
    orderDraftConflict,
    orderDraftFieldKey,
    orderDraftHasMeaningfulFields,
    orderDraftInitialized,
    orderDraftRead.status,
    orderDraftScope,
    orderEntryMode,
    pendingAction,
    preparedChannelDraft,
    preparedEcommerceDraft,
    resumedOrderDraft,
  ])

  useEffect(() => {
    if (!ecommerceNavigationDraft
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceDraftId.current === ecommerceNavigationDraft.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-shop-handoff')
      .then(({ ecommerceShopDraftLines, ecommerceShopDraftMatchesCatalog, ecommerceShopDraftMatchesOperatingContext, ecommerceShopDraftPayment }) => {
        if (!current) return
        const navigationDraftId = ecommerceNavigationDraft.id
        const availableLocationIds = commerce.inventoryFoundation
          ? managedInventoryProjection?.locations.map((candidate) => candidate.id) ?? []
          : null
        if (!ecommerceShopDraftMatchesOperatingContext(ecommerceNavigationDraft, availableLocationIds)) {
          consumedEcommerceDraftId.current = navigationDraftId
          setPreparedEcommerceDraft(null)
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
          setNotice('The Ecommerce request has no valid Shop operating authority. Nothing was prepared.')
          return
        }
        if (!ecommerceShopDraftMatchesCatalog(ecommerceNavigationDraft, commerce.items)) {
          consumedEcommerceDraftId.current = navigationDraftId
          if (preparedEcommerceDraft) {
            setFulfilmentReference('')
          }
          setPreparedEcommerceDraft(null)
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
          setNotice('The Ecommerce request no longer matches the current Shop catalog. Nothing was prepared.')
          return
        }
        const navigationCustomer = ecommerceNavigationDraft.schema === 'supermega.ecommerce.shop_draft.v7'
          ? ecommerceNavigationDraft.customerProfile?.name ?? ecommerceNavigationDraft.customerReference
          : ecommerceNavigationDraft.customerReference
        const navigationAddress = ecommerceNavigationDraft.schema === 'supermega.ecommerce.shop_draft.v7'
          ? ecommerceNavigationDraft.deliveryAddress
          : null
        setPreparedChannelDraft(null)
        setPreparedEcommerceDraft(ecommerceNavigationDraft)
        setCustomer(navigationCustomer)
        setChannel('Ecommerce')
        const draftLines = ecommerceShopDraftLines(ecommerceNavigationDraft)
        setSku(draftLines[0].sku)
        setQuantity(draftLines[0].quantity)
        setExtraOrderLines(draftLines.slice(1).map((line) => ({ sku: line.sku, quantity: line.quantity })))
        setPayment(ecommerceShopDraftPayment(ecommerceNavigationDraft))
        setFulfilment(ecommerceNavigationDraft.fulfilment)
        setFulfilmentReference(navigationAddress
          ? `${navigationAddress.line1} · ${navigationAddress.township} · ${navigationAddress.city}${navigationAddress.instructions ? ` · ${navigationAddress.instructions}` : ''}`
          : ecommerceNavigationDraft.sourceRequestId)
        setPromisedAt(defaultOrderPromiseInput())
        setOrderEntryMode('manual')
        setOrderDraftActive(true)
        setResumedOrderDraft(null)
        setOrderDraftConflict(false)
        setNotice(`${recordDisplayReference(ecommerceNavigationDraft.sourceRequestId)} is ready for Shop review. Confirm the quote, promise, and payment before the accountable order gate.`)
        pendingOrderComposerReveal.current = 'ecommerce-request'
      })
      .catch(() => {
        if (current) setNotice('The Ecommerce request guard could not load. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce.inventoryFoundation, commerce.items, ecommerceNavigationDraft, managedIdentity, managedInventoryProjection, navigate, preparedEcommerceDraft, workspaceMode])

  useEffect(() => {
    if (!ecommerceReturnNavigationIntent
      || tab !== 'orders'
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceReturnIntentId.current === ecommerceReturnNavigationIntent.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-buying-lifecycle')
      .then(({ projectEcommerceReturnOutcome, validateEcommerceReturnIntent }) => {
        if (!current) return
        const intent = validateEcommerceReturnIntent(ecommerceReturnNavigationIntent)
        const order = commerce.orders.find((candidate) => candidate.id === intent.orderId)
        const outcome = order ? projectEcommerceReturnOutcome(intent, order) : null
        if (outcome) {
          consumedEcommerceReturnIntentId.current = intent.id
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
          setNotice(`${intent.id} was already accepted by ${outcome.reviewedBy}. Ecommerce can recover the recorded outcome; no second return was prepared.`)
          return
        }
        if (order?.returns?.some((record) => record.evidenceReference === intent.evidenceReference)) {
          consumedEcommerceReturnIntentId.current = intent.id
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
          setNotice('The return evidence conflicts with the exact Ecommerce request. No second return was prepared.')
          return
        }
        const expected = commerceOrderReturnExpectation(commerce, intent.orderId, intent.sku, intent.disposition, intent.quantity)
        if (!order
          || order.status !== 'completed'
          || !order.completion
          || order.sourceRecordId !== intent.sourceRequestId
          || !expected
          || intent.quantity > expected.soldQuantity - expected.returnedQuantity) {
          consumedEcommerceReturnIntentId.current = intent.id
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
          setNotice('The Ecommerce return request no longer matches a completed Shop order. Nothing was prepared.')
          return
        }
        consumedEcommerceReturnIntentId.current = intent.id
        setReturnDraft({
          orderId: intent.orderId,
          sku: intent.sku,
          quantity: String(intent.quantity),
          disposition: intent.disposition,
          sourceIntent: intent,
        })
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        setNotice(`${recordDisplayReference(intent.id)} is ready for Shop review. Confirm the received item and stock condition; no refund has started.`)
        requestAnimationFrame(() => returnEditorRef.current?.querySelector<HTMLElement>('#order-return-quantity')?.focus())
      })
      .catch(() => {
        if (!current) return
        consumedEcommerceReturnIntentId.current = ecommerceReturnNavigationIntent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        setNotice('The Ecommerce return request could not be verified. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce, ecommerceReturnNavigationIntent, managedIdentity, navigate, tab, workspaceMode])

  useEffect(() => {
    if (!ecommerceCancellationNavigationIntent
      || tab !== 'orders'
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceCancellationIntentId.current === ecommerceCancellationNavigationIntent.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-buying-lifecycle')
      .then(({ validateEcommerceCancellationIntent }) => {
        if (!current) return
        const intent = validateEcommerceCancellationIntent(ecommerceCancellationNavigationIntent)
        consumedEcommerceCancellationIntentId.current = intent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        if (!ecommerceCancellationMatchesCurrentShop(commerce, intent)) {
          setCancellationDraft(null)
          setNotice('The cancellation request no longer matches the current Shop order, payment, refund, or reserved stock. Nothing was prepared.')
          return
        }
        setReturnDraft(null)
        setSupportDraft(null)
        setOrderAmendmentReview(null)
        setOrderRescheduleReview(null)
        setCancellationDraft(intent)
        setNotice(`${recordDisplayReference(intent.id)} is ready for Shop review. Keeping the order changes nothing; cancellation still requires the accountable Shop gate.`)
        requestAnimationFrame(() => document.getElementById('shop-cancellation-review')?.focus())
      })
      .catch(() => {
        if (!current) return
        consumedEcommerceCancellationIntentId.current = ecommerceCancellationNavigationIntent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        setCancellationDraft(null)
        setNotice('The cancellation request could not be verified. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce, ecommerceCancellationNavigationIntent, managedIdentity, navigate, tab, workspaceMode])

  useEffect(() => {
    if (!ecommerceOrderAmendmentNavigationIntent
      || tab !== 'orders'
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceOrderAmendmentIntentId.current === ecommerceOrderAmendmentNavigationIntent.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-buying-lifecycle')
      .then(async (lifecycle) => {
        const intent = lifecycle.validateEcommerceOrderAmendmentIntent(ecommerceOrderAmendmentNavigationIntent)
        const recovered = await lifecycle.readEcommerceBuyingState(ecommerceBuyingScope)
        if (!current) return
        consumedEcommerceOrderAmendmentIntentId.current = intent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        if (!recovered.state || recovered.status !== 'ready') throw new Error(recovered.error || 'Order amendment recovery is unavailable.')
        const storedIntent = recovered.state.amendmentIntents.find((candidate) => candidate.id === intent.id)
        const replacementRequest = recovered.state.requests.find((candidate) => candidate.id === intent.replacementRequestId)
        if (!storedIntent || JSON.stringify(storedIntent) !== JSON.stringify(intent) || !replacementRequest) {
          throw new Error('Order amendment does not match its recovered request.')
        }
        if (ecommerceOrderAmendmentShopState(commerce, intent) === 'stale') {
          throw new Error('The original order no longer matches this change request. Nothing was prepared.')
        }
        const draft = await lifecycle.prepareEcommerceShopDraftV2({
          request: replacementRequest,
          state: recovered.state,
          currentCatalog: commerce.items,
          currentPromotionPolicies: commerce.promotionPolicies ?? [],
          currentShippingPolicies: commerce.shippingPolicies ?? [],
          currentPaymentPolicies: commerce.paymentPolicies ?? [],
          currentTaxConfigurations: commerce.taxConfigurations ?? [],
          catalogRevision: commerce.catalogChanges?.length ?? 0,
          confirmedAt: new Date().toISOString(),
        })
        if (!current) return
        setCancellationDraft(null)
        setOrderRescheduleReview(null)
        setOrderAmendmentReview({ intent, replacementRequest, draft })
        setNotice(`${intent.id} is ready for a two-step Shop replacement. Review the repriced total before the original order is cancelled.`)
        requestAnimationFrame(() => document.getElementById('shop-order-amendment-review')?.focus())
      })
      .catch((error) => {
        if (!current) return
        consumedEcommerceOrderAmendmentIntentId.current = ecommerceOrderAmendmentNavigationIntent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        setOrderAmendmentReview(null)
        setNotice(error instanceof Error ? error.message : 'The order amendment could not be verified. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce, ecommerceBuyingScope, ecommerceOrderAmendmentNavigationIntent, managedIdentity, navigate, tab, workspaceMode])

  useEffect(() => {
    if (!ecommerceOrderRescheduleNavigationIntent
      || tab !== 'orders'
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceOrderRescheduleIntentId.current === ecommerceOrderRescheduleNavigationIntent.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-buying-lifecycle')
      .then(async (lifecycle) => {
        const intent = lifecycle.validateEcommerceOrderRescheduleIntent(ecommerceOrderRescheduleNavigationIntent)
        const recovered = await lifecycle.readEcommerceBuyingState(ecommerceBuyingScope)
        if (!current) return
        consumedEcommerceOrderRescheduleIntentId.current = intent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        if (!recovered.state || recovered.status !== 'ready') throw new Error(recovered.error || 'Order reschedule recovery is unavailable.')
        const storedIntent = recovered.state.rescheduleIntents.find((candidate) => candidate.id === intent.id)
        const replacementRequest = recovered.state.requests.find((candidate) => candidate.id === intent.replacementRequestId)
        if (!storedIntent || JSON.stringify(storedIntent) !== JSON.stringify(intent) || !replacementRequest) {
          throw new Error('Order reschedule does not match its recovered request.')
        }
        if (ecommerceOrderRescheduleShopState(commerce, intent) === 'stale') {
          throw new Error('The original order no longer matches this reschedule request. Nothing was prepared.')
        }
        const draft = await lifecycle.prepareEcommerceShopDraftV2({
          request: replacementRequest,
          state: recovered.state,
          currentCatalog: commerce.items,
          currentPromotionPolicies: commerce.promotionPolicies ?? [],
          currentShippingPolicies: commerce.shippingPolicies ?? [],
          currentPaymentPolicies: commerce.paymentPolicies ?? [],
          currentTaxConfigurations: commerce.taxConfigurations ?? [],
          catalogRevision: commerce.catalogChanges?.length ?? 0,
          confirmedAt: new Date().toISOString(),
        })
        if (!ecommerceReschedulePromiseAllowed(draft, intent)) {
          throw new Error('The requested promise no longer satisfies current Shop delivery policy. Nothing was prepared.')
        }
        if (!current) return
        setCancellationDraft(null)
        setOrderAmendmentReview(null)
        setOrderRescheduleReview({ intent, replacementRequest, draft })
        setNotice(`${intent.id} is ready for two-step Shop rescheduling. Review the current total and requested promise before cancelling the original.`)
        requestAnimationFrame(() => document.getElementById('shop-order-reschedule-review')?.focus())
      })
      .catch((error) => {
        if (!current) return
        consumedEcommerceOrderRescheduleIntentId.current = ecommerceOrderRescheduleNavigationIntent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        setOrderRescheduleReview(null)
        setNotice(error instanceof Error ? error.message : 'The order reschedule could not be verified. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce, ecommerceBuyingScope, ecommerceOrderRescheduleNavigationIntent, managedIdentity, navigate, tab, workspaceMode])

  useEffect(() => {
    if (!ecommerceSupportNavigationIntent
      || tab !== 'orders'
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceSupportIntentId.current === ecommerceSupportNavigationIntent.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-buying-lifecycle')
      .then(({ projectEcommerceSupportOutcome, validateEcommerceSupportIntent }) => {
        if (!current) return
        const intent = validateEcommerceSupportIntent(ecommerceSupportNavigationIntent)
        const order = commerce.orders.find((candidate) => candidate.id === intent.orderId)
        const existing = order?.supportCases?.find((supportCase) => supportCase.sourceIntentId === intent.id)
        const outcome = order ? projectEcommerceSupportOutcome(intent, order) : null
        const expected = commerceOrderSupportOpenExpectation(commerce, intent.orderId, intent.id)
        consumedEcommerceSupportIntentId.current = intent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        if (existing) {
          setSupportDraft(null)
          setNotice(outcome
            ? `${intent.id} is already ${outcome.state} as ${outcome.caseId}. Ecommerce can recover the accountable Shop outcome.`
            : 'The Shop help-case evidence conflicts with the exact Ecommerce request. No second case was prepared.')
          return
        }
        if (!order
          || order.status !== 'completed'
          || !order.completion
          || order.sourceRecordId !== intent.sourceRequestId
          || !expected) {
          setNotice('The Ecommerce help request no longer matches a completed Shop order. Nothing was prepared.')
          return
        }
        setReturnDraft(null)
        setSupportDraft({
          intent,
          priority: 'normal',
          owner: managedIdentity?.email ?? order.owner ?? '',
          dueAt: defaultIssueDueInput(),
        })
        setNotice(`${recordDisplayReference(intent.id)} is ready for Shop review. Assign priority, owner, and due time before opening it; no message or refund is sent.`)
        requestAnimationFrame(() => document.getElementById('shop-support-open-review')?.focus())
      })
      .catch(() => {
        if (!current) return
        consumedEcommerceSupportIntentId.current = ecommerceSupportNavigationIntent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        setNotice('The Ecommerce help request could not be verified. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce, ecommerceSupportNavigationIntent, managedIdentity, navigate, tab, workspaceMode])

  useEffect(() => {
    if (!ecommerceCorrectionNavigationIntent
      || tab !== 'orders'
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceCorrectionIntentId.current === ecommerceCorrectionNavigationIntent.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-buying-lifecycle')
      .then(async (lifecycle) => {
        const intent = lifecycle.validateEcommerceCorrectionIntent(ecommerceCorrectionNavigationIntent)
        const recovered = await lifecycle.readEcommerceBuyingState(ecommerceBuyingScope)
        if (!current) return
        consumedEcommerceCorrectionIntentId.current = intent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        const storedIntent = recovered.state?.correctionIntents.find((candidate) => candidate.id === intent.id)
        if (recovered.status !== 'ready' || !storedIntent || JSON.stringify(storedIntent) !== JSON.stringify(intent)) {
          throw new Error('The balance request no longer matches its recovered Ecommerce evidence. Nothing was prepared.')
        }
        const order = commerce.orders.find((candidate) => candidate.id === intent.orderId)
        const outcome = order ? lifecycle.projectEcommerceCorrectionOutcome(intent, order) : null
        const existing = order?.corrections?.filter((record) => record.evidenceReference === intent.evidenceReference) ?? []
        if (outcome || existing.length) {
          setCorrectionDraft(null)
          setNotice(outcome
            ? `${intent.id} was already reviewed by ${outcome.reviewedBy}. Ecommerce can recover the correction outcome; no second note was prepared.`
            : 'The Shop correction evidence conflicts with the exact Ecommerce request. No second note was prepared.')
          return
        }
        const expectation = commerceOrderCorrectionExpectation(commerce, intent.orderId)
        if (!order
          || order.sourceRecordId !== intent.sourceRequestId
          || order.paymentStatus !== intent.paymentStatus
          || order.refundStatus !== intent.refundStatus
          || !expectation
          || expectation.sourceCalculationDigest !== intent.sourceCalculationDigest
          || expectation.correctionCount !== intent.sourceCorrectionCount
          || expectation.currentBalanceMmk !== intent.originalBalanceMmk) {
          setCorrectionDraft(null)
          setNotice('The Ecommerce balance request no longer matches the current Shop calculation, payment, refund, or correction history. Nothing was prepared.')
          return
        }
        setReturnDraft(null)
        setSupportDraft(null)
        setCancellationDraft(null)
        setCorrectionDraft({
          orderId: intent.orderId,
          kind: intent.requestedKind,
          reasonCode: intent.reasonCode,
          listedAmountMmk: String(intent.listedAmountMmk),
          sourceIntent: intent,
        })
        setNotice(`${recordDisplayReference(intent.id)} is ready for Shop review. Recheck the calculated adjustment before recording a review-only correction note.`)
        requestAnimationFrame(() => correctionEditorRef.current?.querySelector<HTMLElement>('#order-correction-amount')?.focus())
      })
      .catch((error) => {
        if (!current) return
        consumedEcommerceCorrectionIntentId.current = ecommerceCorrectionNavigationIntent.id
        navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        setCorrectionDraft(null)
        setNotice(error instanceof Error ? error.message : 'The Ecommerce balance request could not be verified. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce, ecommerceBuyingScope, ecommerceCorrectionNavigationIntent, managedIdentity, navigate, tab, workspaceMode])

  useEffect(() => {
    const sourceKey = requestedRequestId || 'ecommerce-inbox'
    if (requestedSource !== 'ecommerce-inbox'
      || consumedEcommerceInboxSource.current === sourceKey
      || tab !== 'orders'
      || !managedIdentity
      || workspaceMode !== 'managed-ready') return
    consumedEcommerceInboxSource.current = sourceKey
    setOrderEntryMode('online')
    setOrderDraftActive(true)
    setResumedOrderDraft(null)
    setOrderDraftConflict(false)
    setNotice(requestedStorefrontRequestIsWaiting
      ? `${requestedRequestId} is ready for Shop review. Choose Review to prepare the order.`
      : pendingStorefrontRequests.length
        ? `${pendingStorefrontRequests.length} Ecommerce ${pendingStorefrontRequests.length === 1 ? 'request is' : 'requests are'} waiting for Shop review.`
        : 'The Ecommerce inbox is open. No request currently needs Shop review.')
    pendingOrderComposerReveal.current = requestedStorefrontRequestIsWaiting ? 'ecommerce-inbox-request' : 'ecommerce-inbox'
  }, [managedIdentity, navigate, pendingStorefrontRequests.length, requestedRequestId, requestedSource, requestedStorefrontRequestIsWaiting, tab, workspaceMode])

  // The composer only mounts on the orders tab, so reveal a queued Ecommerce handoff on whichever commit
  // first has that dialog rather than on a single animation frame: requestAnimationFrame never runs while
  // the Shop tab is hidden or backgrounded, which leaves a prepared request behind a closed composer.
  useEffect(() => {
    const reveal = pendingOrderComposerReveal.current
    if (!reveal) return
    if (tab !== 'orders') {
      pendingOrderComposerReveal.current = ''
      return
    }
    const dialog = orderComposerRef.current
    if (!dialog) return
    pendingOrderComposerReveal.current = ''
    if (!dialog.open) dialog.showModal()
    if (reveal === 'ecommerce-request') orderPaymentRef.current?.focus({ preventScroll: true })
    else if (reveal === 'ecommerce-inbox-request') ecommerceInboxTargetRef.current?.focus()
    else orderComposerHeadingRef.current?.focus()
    if (reveal !== 'ecommerce-request') navigate('/shop/?tab=orders', { replace: true })
  })

  async function initializeManagedCatalog(event: FormEvent) {
    event.preventDefault()
    if (!managedIdentity) return
    const skuValue = catalogDraft.sku.trim().toUpperCase()
    const name = catalogDraft.name.trim()
    const onHand = Number(catalogDraft.onHand)
    const reorderAt = Number(catalogDraft.reorderAt)
    const price = Number(catalogDraft.price)
    const reason = catalogDraft.reason.trim()
    const evidenceReference = catalogDraft.evidenceReference.trim()
    if (!skuValue || !name || !reason || !evidenceReference || ![onHand, reorderAt, price].every(Number.isSafeInteger) || onHand < 0 || reorderAt < 0 || price < 1) {
      setCatalogError('Enter a valid item, whole-number stock boundaries, price, reason, and evidence reference.')
      return
    }
    const proof: CommerceActionProof = {
      actionId: uid('ACT'),
      capturedAt: new Date().toISOString(),
      actor: managedIdentity.userId,
      reason,
      evidenceReference,
    }
    setCatalogBusy(true)
    setCatalogError('')
    try {
      await mutateCommerce('commerce.workspace.initialized', commandUuid(), proof, (current) => current.items.length || current.orders.length || current.movements.length || current.closes.length || commerceWebsiteIntakes(current).length ? null : validateCommerceState({
        ...current,
        items: [{ sku: skuValue, name, onHand, reorderAt, price }],
        catalogBaselines: [createCommerceCatalogBaseline({ sku: skuValue, price, reorderAt }, proof)],
      }))
      setNotice(`Managed catalog initialized with ${skuValue}.`)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'The managed catalog was not initialized.')
    } finally {
      setCatalogBusy(false)
    }
  }

  const managedTemplateId = shopBusinessTemplateFromQuery(new URLSearchParams(commerceLocation.search).get('template'))
  const managedTemplate = managedTemplateId ? shopBusinessTemplate(managedTemplateId) : null

  async function initializeManagedTemplateCatalog(event: FormEvent) {
    event.preventDefault()
    if (!managedIdentity || !managedTemplate || !managedTemplateId) return
    const reason = managedTemplateDraft.reason.trim()
    const evidenceReference = managedTemplateDraft.evidenceReference.trim()
    if (!managedTemplateDraft.reviewed || !reason || !evidenceReference) {
      setCatalogError('Review the starter values, then enter the source and reason used to approve them.')
      return
    }
    const items = shopBusinessTemplateCommerceItems(managedTemplateId)
    const proof: CommerceActionProof = {
      actionId: uid('ACT'),
      capturedAt: new Date().toISOString(),
      actor: managedIdentity.userId,
      reason,
      evidenceReference,
    }
    setCatalogBusy(true)
    setCatalogError('')
    try {
      await mutateCommerce('commerce.workspace.initialized', commandUuid(), proof, (current) => current.items.length || current.orders.length || current.movements.length || current.closes.length || commerceWebsiteIntakes(current).length ? null : validateCommerceState({
        ...current,
        items,
        catalogBaselines: items.map((item) => createCommerceCatalogBaseline({ sku: item.sku, price: item.price, reorderAt: item.reorderAt }, proof)),
      }))
      setSku(items[0]?.sku ?? '')
      setNotice(`${managedTemplate.name.en} catalog created with ${items.length} reviewed items. No sales or customer records were added.`)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'The managed starter catalog was not initialized.')
    } finally {
      setCatalogBusy(false)
    }
  }

  const effectiveMode = managedIdentity && (workspaceMode === 'local' || managedWorkspaceId !== managedIdentity.workspaceId) ? 'managed-loading' : workspaceMode
  const managedCommerceBoundary: ReactNode = managedIdentity && effectiveMode !== 'managed-ready' ? (() => {
    const unprovisioned = effectiveMode === 'managed-unprovisioned'
    if (unprovisioned) return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Company Shop setup</span><h2>Create the real catalog</h2></div><span className="status-pill pending">Not provisioned</span></div>
      <p className="panel-copy">{managedTemplate
        ? `Review the ${managedTemplate.name.en} starter catalog, confirm its opening values, and create the whole catalog once. No demo sales, customers, or appointments are copied.`
        : 'Start with the first real inventory item. No browser demo orders, customers, or stock records are copied into this workspace.'}</p>
      {managedTemplate ? <form className="core-form compact-form managed-template-catalog-form" onSubmit={(formEvent) => void initializeManagedTemplateCatalog(formEvent)}>
        <div className="setup-choice-copy"><strong>{managedTemplate.name.en}</strong><span>{managedTemplate.catalog.length} items · prices and opening counts can be edited in Shop after setup</span></div>
        <details><summary>Review starter items</summary><div className="compact-list">{managedTemplate.catalog.map((item) => <span key={item.sku}><strong>{item.name}</strong> · {item.priceMmk.toLocaleString()} MMK · opening {item.openingStock}</span>)}</div></details>
        <label className="checkbox-row"><input checked={managedTemplateDraft.reviewed} onChange={(inputEvent) => setManagedTemplateDraft((current) => ({ ...current, reviewed: inputEvent.target.checked }))} required type="checkbox" />I reviewed the starter prices, opening counts, and reorder levels.</label>
        <label>Approval reason<input maxLength={180} onChange={(inputEvent) => setManagedTemplateDraft((current) => ({ ...current, reason: inputEvent.target.value }))} placeholder="Why these starting values are acceptable" required value={managedTemplateDraft.reason} /></label>
        <label>Source or evidence<input maxLength={180} onChange={(inputEvent) => setManagedTemplateDraft((current) => ({ ...current, evidenceReference: inputEvent.target.value }))} placeholder="Price list, stock count, or owner review" required value={managedTemplateDraft.evidenceReference} /></label>
        <div className="form-actions"><Link className="text-link" to="/settings/?product=shop">Choose another business type</Link><button className="core-button primary" disabled={catalogBusy} type="submit">{catalogBusy ? 'Creating…' : `Create ${managedTemplate.name.en} catalog`}</button></div>
        <p className="form-notice" role="status">{catalogError || commerceStorageError || `Signed in as ${managedIdentity.email}. This creates server-backed company records.`}</p>
      </form> : null}
      {managedTemplate ? <details className="secondary-setup-path"><summary>Start with one item instead</summary>
      <form className="core-form compact-form" onSubmit={(formEvent) => void initializeManagedCatalog(formEvent)}>
        <div className="form-row"><label>SKU<span className="sku-scan-row"><input maxLength={80} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, sku: inputEvent.target.value }))} placeholder="SKU-001" required value={catalogDraft.sku} /><BarcodeScanButton label="Scan the product barcode into the SKU field" onDetected={(value) => setCatalogDraft((current) => ({ ...current, sku: value }))} /></span></label><label>Item name<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, name: inputEvent.target.value }))} placeholder="Real item name" required value={catalogDraft.name} /></label></div>
        <div className="form-row"><label>Opening stock<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, onHand: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.onHand} /></label><label>Reorder at<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reorderAt: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.reorderAt} /></label></div>
        <label>Price (MMK)<input min="1" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, price: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.price} /></label>
        <label>Opening balance reason<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reason: inputEvent.target.value }))} placeholder="How the opening count was verified" required value={catalogDraft.reason} /></label>
        <label>Evidence reference<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, evidenceReference: inputEvent.target.value }))} placeholder="Count sheet, stocktake, or source record" required value={catalogDraft.evidenceReference} /></label>
        <div className="form-actions"><Link className="text-link" to="/settings/#controls">Workspace settings</Link><button className="core-button primary" disabled={catalogBusy} type="submit">{catalogBusy ? 'Creating…' : 'Create managed catalog'}</button></div>
        <p className="form-notice" role="status">{catalogError || commerceStorageError || `Signed in as ${managedIdentity.email}. The company account records this setup.`}</p>
      </form>
      </details> : <form className="core-form compact-form" onSubmit={(formEvent) => void initializeManagedCatalog(formEvent)}>
        <div className="form-row"><label>SKU<span className="sku-scan-row"><input maxLength={80} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, sku: inputEvent.target.value }))} placeholder="SKU-001" required value={catalogDraft.sku} /><BarcodeScanButton label="Scan the product barcode into the SKU field" onDetected={(value) => setCatalogDraft((current) => ({ ...current, sku: value }))} /></span></label><label>Item name<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, name: inputEvent.target.value }))} placeholder="Real item name" required value={catalogDraft.name} /></label></div>
        <div className="form-row"><label>Opening stock<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, onHand: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.onHand} /></label><label>Reorder at<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reorderAt: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.reorderAt} /></label></div>
        <label>Price (MMK)<input min="1" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, price: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.price} /></label>
        <label>Opening balance reason<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reason: inputEvent.target.value }))} placeholder="How the opening count was verified" required value={catalogDraft.reason} /></label>
        <label>Evidence reference<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, evidenceReference: inputEvent.target.value }))} placeholder="Count sheet, stocktake, or source record" required value={catalogDraft.evidenceReference} /></label>
        <div className="form-actions"><Link className="text-link" to="/settings/#controls">Workspace settings</Link><button className="core-button primary" disabled={catalogBusy} type="submit">{catalogBusy ? 'Creating…' : 'Create managed catalog'}</button></div>
        <p className="form-notice" role="status">{catalogError || commerceStorageError || `Signed in as ${managedIdentity.email}. The company account records this setup.`}</p>
      </form>}
    </section>
    return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Company Shop</span><h2>{effectiveMode === 'managed-error' ? 'Company account unavailable' : 'Loading company account'}</h2></div><span className="status-pill bounded">{effectiveMode === 'managed-error' ? 'Blocked' : 'Checking'}</span></div>
      <p className="panel-copy">{commerceStorageError || 'Shop remains read-only until the authenticated tenant state is confirmed.'}</p>
      <div className="form-actions"><Link className="core-button" to="/settings/#controls">Open workspace settings</Link></div>
    </section>
  })() : null

  const commerceWriteBanner = <div className="production-mode-banner commerce-mode-banner" data-sync={commerceSync.status} data-write={commerceCanWrite ? 'ready' : 'blocked'} role={commerceCanWrite ? 'status' : 'alert'}>
    <span className={`status-pill ${commerceCanWrite ? 'bounded' : 'pending'}`}>{managedIdentity ? 'Managed records' : 'Sample data'}</span>
    <p>{commerceStorageError
      ? `Writes paused: ${commerceStorageError}`
      : commerceSync.status === 'checking'
        ? commerceSync.message
        : commerceSync.status === 'pending' || commerceSync.status === 'conflict' || commerceSync.status === 'unavailable'
          ? `Writes paused: ${commerceSync.message}`
      : !commerceCanWrite
        ? 'Writes paused: this browser could not confirm durable local storage and write locking.'
        : commerceSync.message || notice || (managedIdentity
          ? `Company records - revision ${managedVersion ?? 0}. Writes are confirmed by the company account.`
          : 'Sample data on this device. Sign in for team data.')}</p>
    {commerceSync.status === 'pending'
      ? <button type="button" onClick={() => window.location.reload()}>Reload Shop</button>
      : !commerceCanWrite && commerceSync.status !== 'checking'
        ? <Link to="/settings/#controls">Open Settings</Link>
        : null}
  </div>

  // Durable-storage warning. Shown for a local workspace only, which is narrower than the
  // request itself: persistence is asked for on every Shop open, company account included,
  // because photos, payment QRs, the order draft and loyalty settings stay device-local
  // under a managed scope (see storage-durability.ts). What a company account does NOT
  // risk is the books -- the ledger is server-side and re-syncs -- so this banner, which
  // says records saved here can be cleared, would overstate the loss and interrupt a till
  // for something a re-open repairs. Quota outranks eviction risk -- "writes are failing
  // now" beats "writes may be cleared later" -- and neither is shown while the browser is
  // still being asked.
  const storageDurabilityNotice = managedIdentity || !(storageDurability.quotaExceeded || storageDurability.state === 'denied')
    ? null
    : <div className="production-mode-banner storage-durability-banner" data-durability={storageDurability.quotaExceeded ? 'full' : 'evictable'} role="alert">
      <span className="status-pill pending">{storageDurability.quotaExceeded ? 'Storage full' : 'Records at risk'}</span>
      <p>{storageDurability.quotaExceeded
        ? 'This device has run out of storage space. New Shop entries may not be saved until space is freed up on the device.'
        : 'This browser would not promise to keep Shop records on this device. If the device runs low on space, records saved here can be cleared without warning.'}</p>
      {storageDurability.quotaExceeded
        ? <button type="button" onClick={() => window.location.reload()}>Reload Shop</button>
        : <Link to="/settings/#controls">Open Settings</Link>}
    </div>

  // Stuck-till escape hatch. 'conflict' and 'unavailable' both hold canWrite false with
  // no offered way forward -- the pending branch above gets "Reload Shop", these got
  // nothing, so an interrupted sale could freeze the till until someone cleared site
  // data by hand (which would take the committed records with it).
  //
  // The evidence is rendered above the control on purpose: the operator has to be able
  // to see the actionId, reason and evidence reference of the change they are throwing
  // away. When the outbox cannot be read at all, no discard is offered -- refusing to
  // discard something unseen is the safe failure, not a worse one.
  const commerceStuckRecoveryPanel = managedIdentity || !(commerceSync.status === 'conflict' || commerceSync.status === 'unavailable')
    ? null
    : <details className="evidence-disclosure commerce-stuck-recovery" open>
      <summary><span>Unsent Shop change is holding the till</span><strong>{commerceSync.status === 'conflict' ? 'Conflict' : 'Recovery unavailable'}</strong></summary>
      <p className="panel-copy">A change from an interrupted session was saved for recovery but never applied to the record, so Shop has paused new entries. Reload Shop to try recovering it again. If it cannot be recovered, discard it below: that removes only this unsent change, and everything already saved to the Shop record stays exactly as it is.</p>
      {commerceStuckRecovery.loading ? <p className="form-notice">Reading the unsent change on this device.</p> : null}
      {commerceStuckRecovery.loadError
        ? <p className="form-notice" data-tone="error">{commerceStuckRecovery.loadError} Nothing is offered for discard while the unsent change cannot be read, so no record can be thrown away unseen.</p>
        : null}
      {commerceStuckRecovery.intents.length
        ? <div className="stuck-change-list">{commerceStuckRecovery.intents.map((intent) => <article key={intent.commandId}>
          <div><strong>{intent.eventType}</strong><small>{intent.evidence.actionId} · {intent.evidence.actor} · {formatTime(intent.evidence.capturedAt)}</small></div>
          <p>{intent.evidence.reason}</p>
          <small>Evidence: {intent.evidence.evidenceReference}</small>
          <button
            className="core-button compact"
            disabled={Boolean(commerceStuckRecovery.discarding)}
            onClick={() => { void discardStuckCommerceChange(intent.commandId) }}
            type="button"
          >{commerceStuckRecovery.discarding === intent.commandId ? 'Discarding' : 'Discard this unsent change'}</button>
        </article>)}</div>
        : null}
      {!commerceStuckRecovery.loading && !commerceStuckRecovery.loadError && !commerceStuckRecovery.intents.length
        ? <p className="form-notice">No unsent change is left on this device. Reload Shop to start taking entries again.</p>
        : null}
      {commerceStuckRecovery.discardError ? <p className="form-notice" data-tone="error">{commerceStuckRecovery.discardError}</p> : null}
    </details>

  // Headroom warning -- the till filling up, said in sales rather than bytes.
  //
  // SILENT BY DEFAULT. 'clear' renders nothing whatsoever: a shop at 12% has nothing to do
  // about it, and a meter that talks when there is nothing to do is a meter that gets
  // ignored at 95%. Escalation is in TONE as well as colour, because 'tight' can persist
  // for roughly ten trading days on a plain shop -- it is a quiet notice with no role, and
  // only 'urgent' takes role="alert" and the danger pill.
  //
  // The advice deliberately stops at "take a backup". A follow-up batch that reclaims room
  // by folding settled orders is DESIGNED but NOT APPROVED -- it rewrites a shop's own
  // business records and sits behind a founder gate -- so nothing here may promise it. The
  // copy says only what is true today: a backup is the safe step, and Shop cannot yet free
  // up room from the inside.
  const headroomSales = commerceHeadroom?.salesRemaining ?? 0
  const storageHeadroomNotice = !commerceHeadroom || commerceHeadroom.level === 'clear'
    ? null
    : <div className="production-mode-banner storage-durability-banner" data-headroom={commerceHeadroom.level} role={commerceHeadroom.level === 'urgent' ? 'alert' : undefined}>
      <span className={`status-pill ${commerceHeadroom.level === 'urgent' ? 'danger' : 'pending'}`}>{commerceHeadroom.limit === 'inventory-commands'
        ? (commerceHeadroom.level === 'urgent' ? 'Stock log almost full' : 'Stock log filling up')
        : (commerceHeadroom.level === 'urgent' ? 'Storage almost full' : 'Storage filling up')}</span>
      <p>{headroomSales === 0
        ? 'This device has no room left for new sales.'
        : `${commerceHeadroom.level === 'urgent' ? 'Only about' : 'About'} ${headroomSales.toLocaleString()} more ${headroomSales === 1 ? 'sale fits' : 'sales fit'} on this device before Shop stops accepting new sales.`}
        {commerceHeadroom.limit === 'inventory-commands' ? " This shop's limit is its stock movement log, which cannot be cleared once it is written." : ''}
        {commerceHeadroom.level === 'urgent'
          ? ' Export a backup from Settings now. When this device is full Shop stops taking new sales, and the records already saved stay where they are.'
          : ' Export a backup from Settings so these records are safe off the device.'}
        {' There is no way to free up room inside Shop yet, so a backup is the safe step today.'}
        <small className="storage-headroom-detail">{commerceHeadroom.limit === 'inventory-commands'
          ? `${commerceHeadroom.commands.toLocaleString()} of ${commerceHeadroom.commandCeiling.toLocaleString()} stock log entries used · 2 per sale`
          : `${(commerceHeadroom.bytes / 1048576).toFixed(2)} MB of ${(commerceHeadroom.byteCeiling / 1048576).toFixed(2)} MB used · about ${Math.round(commerceHeadroom.bytesPerSale).toLocaleString()} bytes per sale${commerceHeadroom.bytesPerSaleMeasured ? ' on this device' : ''}`}</small>
      </p>
      <Link to="/settings/#controls">Open Settings</Link>
    </div>

  const commerceBoundary = <>
    {commerceWriteBanner}
    {storageDurabilityNotice}
    {storageHeadroomNotice}
    {commerceStuckRecoveryPanel}
  </>
  const compactCounterStatus = confirmedLocalShop
    && !managedIdentity
    && commerceCanWrite
    && commerceSync.status === 'ready'
    && !commerceStorageError
    && !storageDurability.quotaExceeded
    && (!commerceHeadroom || commerceHeadroom.level === 'clear')
  const counterLocalDemoStatus = compactCounterStatus
    ? storageDurability.state === 'denied' ? 'records-at-risk' as const : 'local' as const
    : null
  const counterBoundary = compactCounterStatus && !notice ? null : commerceBoundary
  const shopTradeDemoNotice = !managedIdentity && requestedShopTemplate && shopTradeDemoStatus !== 'ready'
    ? <div className="production-mode-banner shop-trade-demo-notice" data-status={shopTradeDemoStatus} role={shopTradeDemoStatus === 'error' ? 'alert' : 'status'}>
      <span className={`status-pill ${shopTradeDemoStatus === 'error' ? 'danger' : shopTradeDemoStatus === 'preserved' ? 'pending' : 'bounded'}`}>{shopTradeDemoStatus === 'loading' ? 'Loading trade' : shopTradeDemoStatus === 'preserved' ? 'Existing Shop kept' : 'Trade unavailable'}</span>
      <p>{shopTradeDemoStatus === 'loading'
        ? `Preparing the ${requestedShopTemplate.name.en} sample without replacing operator data.`
        : shopTradeDemoStatus === 'preserved'
          ? `The ${requestedShopTemplate.name.en} sample was not loaded because this device already has Shop activity. Nothing was overwritten.`
          : shopTradeDemoError}</p>
      {shopTradeDemoStatus === 'preserved' ? <Link to={`/settings/?product=shop&template=${encodeURIComponent(requestedShopTemplate.id)}`}>Review setup</Link> : null}
    </div>
    : null
  const orderNotice = notice || commerceStorageError
  const commerceControlsDisabled = !commerceCanWrite || Boolean(pendingAction)
  // The appointment book is NOT a commerce control. ShopServiceSchedule has its own storage
  // key and does not read commerce state at all, but it was gated on commerceCanWrite -- so a
  // company account that had not provisioned a Shop catalog yet, or a local device before
  // onboarding finished, found every control greyed out: hold, confirm, check in, complete,
  // cancel, add service. For a spa, whose first action is taking a booking, that is the whole
  // product frozen behind a catalog it does not need.
  //
  // The pending-action half IS legitimately app-wide: it is the two-person review gate, and
  // nothing should move while a change is awaiting confirmation.
  const shopScheduleControlsDisabled = Boolean(pendingAction)
  const activePurchaseOrders = purchaseOrderRows.filter(({ progress }) => progress.status === 'open' || progress.status === 'partially_received')
  const procurementArrivalRows = activePurchaseOrders.map((row) => ({
    ...row,
    urgency: commercePurchaseOrderArrivalUrgency(row.purchaseOrder, row.progress, purchaseOrderClock),
  }))
  const overduePurchaseOrders = procurementArrivalRows.filter(({ urgency }) => urgency === 'late')
  const dueSoonPurchaseOrders = procurementArrivalRows.filter(({ urgency }) => urgency === 'due_soon')
  const partiallyReceivedPurchaseOrders = activePurchaseOrders.filter(({ progress }) => progress.status === 'partially_received')
  const supplierControlNext = !commerceCanWrite
    ? 'Restore purchasing readiness'
    : pendingAction
      ? 'Approve pending supplier action'
      : overduePurchaseOrders.length
        ? 'Resolve late supplier order'
        : dueSoonPurchaseOrders.length
          ? 'Prepare receiving evidence'
          : partiallyReceivedPurchaseOrders.length
            ? 'Close partial receipt'
            : openPurchaseRequisitions.length
              ? 'Second operator creates order'
              : !activePurchaseBudget
                ? 'Set buying limits'
              : procurementReviews.length
                ? openSupplierSourcingDecisions.length ? 'Approve quoted requisition' : shopProcurementDecision.summary.riskReviews ? 'Review supplier risk' : 'Compare supplier quotes'
              : activePurchaseOrders.length
                ? 'Monitor supplier promise'
                : 'Supplier controls ready'
  const supplierControlRows = [
    ['Buy', purchaseRecommendations.length ? `${shopReplenishment.summary.recommendedOrderUnits} units` : 'Covered'],
    ['Budget', activePurchaseBudgetCommitment ? `${formatMoney(activePurchaseBudgetCommitment.availableMmk)} left` : 'Set limits'],
    ['Demand', shopDemandIntelligence.summary.forecastWeeklyUnits ? `${shopDemandIntelligence.summary.forecastWeeklyUnits}/week` : 'Collecting'],
    ['Plant', shopReplenishment.summary.productionDemandUnits ? `${shopReplenishment.summary.productionDemandUnits} units` : 'No demand'],
    ['Risk', overduePurchaseOrders.length ? `${overduePurchaseOrders.length} late` : shopReplenishment.summary.supplyAtRisk ? `${shopReplenishment.summary.supplyAtRisk} at risk` : 'Clear'],
    ['Gate', pendingAction ? 'Pending approval' : commerceCanWrite ? 'Two-person' : 'Locked'],
  ] as const
  const supplierControl = <section className="shop-order-control supplier-control" aria-label="Supplier control">
    <div><span className="core-eyebrow">Procurement control</span><strong>{supplierControlNext}</strong><small>AI combines demand, stock, Plant materials, approved-vendor evidence, comparable quotes, delivery, quality, and exposure. Budget, sourcing, requisition, and independent PO approval stay separate. Nothing contacts or pays a supplier here.</small><button className="text-link" disabled={commerceControlsDisabled || (Boolean(activePurchaseBudget) && !openPurchaseRequisitions.length && !procurementReviews.length)} onClick={startSupplierRequest} type="button">{openPurchaseRequisitions.length ? 'Create with second operator' : !activePurchaseBudget ? 'Set buying limits' : openSupplierSourcingDecisions.length ? 'Approve quoted requisition' : 'Compare supplier quotes'}</button></div>
    <div className="shop-order-control-rows">{supplierControlRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
    {/* A Plant material's Shop SKU is free text on its BOM row, never checked against
        a real Shop item. A typo or a since-renamed/deleted item means Plant believes
        it flagged real demand that then vanishes with no error on either side --
        surface it here instead, naming the exact SKU and the Plant jobs that need it. */}
    {shopReplenishment.unmatchedDemand.length ? <p className="form-notice" role="alert">
      Plant demand does not match a Shop item for {shopReplenishment.unmatchedDemand.map((entry) => `"${entry.sku}" (${entry.materialName}, ${Number((entry.requiredQuantityMilli / 1000).toFixed(3))} ${entry.unit}, job${entry.jobIds.length === 1 ? '' : 's'} ${entry.jobIds.join(', ')})`).join('; ')}. Check the Shop SKU on that material's BOM row -- this demand is not included in the recommendations above.
    </p> : null}
    {procurementReviews.length ? <section aria-label="Shop procurement decisions" className="supplier-performance"><div className="supplier-performance-heading"><span className="core-eyebrow">Requisition review</span><small>Source-bound ranking · budget and review required</small></div><div className="shop-replenishment-list" role="list">{procurementReviews.slice(0, 4).map((row) => { const approved = openPurchaseRequisitions.find((requisition) => requisition.sku === row.sku); const budget = approved?.budgetEnvelopeId ? purchaseBudgetEnvelopes.find((envelope) => envelope.id === approved.budgetEnvelopeId) : null; return <div data-status={approved ? 'approved' : row.status} key={row.requisitionReference} role="listitem"><span><strong>{row.itemName}</strong><small>{approved?.id ?? row.requisitionReference} · {approved?.quantityRequested ?? row.quantity} units{row.plantJobIds.length ? ` · Plant ${row.plantJobIds.join(', ')}` : ''}</small></span><span><b>{approved ? 'Approved requisition' : row.recommendedSupplier ?? 'Supplier terms needed'}</b><small>{approved ? `${approved.supplier} · ${formatMoney(approved.totalMmk)} · ${budget?.budgetCode ?? 'legacy authority'} · second operator next` : `${row.estimatedTotalMmk === null ? 'Cost not retained' : formatMoney(row.estimatedTotalMmk)} · ${row.supplierOptions.length} ${row.supplierOptions.length === 1 ? 'option' : 'options'} · ${row.status === 'risk_review_required' ? 'risk review' : row.status === 'terms_required' ? 'terms review' : 'ready for review'}`}</small></span></div> })}</div></section> : null}
    {demandForecastRows.length ? <section aria-label="Shop demand intelligence" className="supplier-performance">
      <div className="supplier-performance-heading"><span className="core-eyebrow">Demand intelligence</span><small>28-day completed sales · returns netted · recommendation only</small></div>
      <div className="shop-replenishment-list" role="list">{demandForecastRows.slice(0, 4).map((row) => <div data-status={row.status} key={row.sku} role="listitem"><span><strong>{row.itemName}</strong><small>{row.completedOrderCount} completed {row.completedOrderCount === 1 ? 'order' : 'orders'} · {row.confidence} evidence</small></span><span><b>{row.status === 'stockout_risk' ? 'Stockout risk' : row.status === 'reorder_soon' ? 'Reorder soon' : `${row.forecastWeeklyUnits}/week`}</b><small>{row.projectedDaysOfCover === null ? 'Cover collecting' : `${row.projectedDaysOfCover}d projected cover`} · {row.planningHorizonDays}d {row.planningHorizonSource === 'supplier_policy' ? 'supplier lead' : 'planning horizon'}{row.recommendedSafetyStockUnits === null ? '' : ` · ${row.recommendedSafetyStockUnits} safety suggested`}</small></span></div>)}</div>
    </section> : <p className="empty-state">Demand forecast starts after the first completed sale.</p>}
  </section>
  const shopNextAction = decideShopNextAction({
    actionOrderCount: actionOrders.length,
    activePurchaseOrderCount: activePurchaseOrders.length,
    canWrite: commerceCanWrite,
    catalogItemCount: commerce.items.length,
    inventoryReady: Boolean(commerce.inventoryFoundation && managedInventoryProjection),
    lowStockCount: lowStock.length,
    pendingAction: Boolean(pendingAction),
    pendingOnlineRequestCount: pendingStorefrontRequests.length + (legacyWebsiteWorkWaiting ? 1 : 0),
  })
  const shopAgentJob = shopNextAction.job
  const shopAgentReason = shopNextAction.reason
  const shopAgentPath = shopNextAction.path
  const shopAutopilotStage = shopNextAction.stage
  const shopAutopilotNextAction = shopNextAction.nextAction
  const shopAutopilotRows = [
    ['Track', shopNextAction.track],
    ['Stage', shopAutopilotStage],
    ['Next', shopAutopilotNextAction],
    ['Memory', 'Saves helpful patterns'],
    ['Safety', 'Review first'],
  ] as const
  const shopCatalogUploadRows = [
    ['Source', commerce.items.length ? `${commerce.items.length} current SKU` : 'Need catalog'],
    ['Upload', 'Shared mapper'],
    ['Checks', 'SKU, price, stock'],
    ['Review', 'Review package'],
    ['Safety', 'Review first'],
  ] as const
  const shopSetupGuideRows = [
    ['Products', commerce.items.length ? `${commerce.items.length} current SKU` : 'Import catalog'],
    ['Stock', commerce.inventoryFoundation && managedInventoryProjection ? 'Location + ATP' : 'Simple count first'],
    ['Orders', pendingStorefrontRequests.length || legacyWebsiteWorkWaiting ? 'Online review' : actionOrders.length ? 'Queue active' : 'Counter ready'],
    ['Payments', paymentReview.length ? `${paymentReview.length} exception` : 'Review only'],
    ['Accounting', latestCloseDownload ? 'Export ready' : 'Close later'],
    ['Boundary', 'Review before writes'],
  ] as const
  const shopCatalogOnboarding = <section aria-label="Shop catalog import helper" className="catalog-onboarding-bridge" id="shop-catalog-import" tabIndex={-1}>
    <div><span className="core-eyebrow">Catalog import helper</span><strong>Bring your catalog into the Shop trial.</strong><p>The assistant routes product spreadsheets through the shared mapper, checks SKU, name, stock, reorder, and price fields, then prepares one reviewed import package. No supplier message, stock move, sale, accounting post, or Shop write runs from this panel.</p></div>
    <div className="catalog-onboarding-status">{shopCatalogUploadRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
    <button className="core-button" disabled={commerceControlsDisabled} onClick={loadSampleCatalogItem} type="button">Load sample catalog item</button>
    <Link className="core-button" to={clientSetupPath('commerce')}>Upload product data</Link>
  </section>
  function runShopAutopilot() {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'commerce',
      route: commerceLocation.pathname + commerceLocation.search,
      detail: `Shop autopilot: ${shopAutopilotStage}`,
    })
    if (pendingAction) {
      setNotice('Finish or cancel the pending Shop review before starting another step.')
      return
    }
    navigate(shopAgentPath)
  }

  function loadSampleCatalogItem() {
    const sampleItem = {
      sku: 'SM-FRESH-006',
      name: 'Fresh market delivery pack',
      onHand: '24',
      reorderAt: '8',
      price: '16500',
    }
    if (pendingAction) {
      setNotice('Finish or cancel the pending Shop review before loading a sample catalog item.')
      return
    }
    if (commerce.items.some((item) => item.sku === sampleItem.sku)) {
      setSku(sampleItem.sku)
      setNotice(`${sampleItem.sku} is already in the catalog. Open its row to edit price, reorder level, stock, or receiving.`)
      return
    }
    setItemDraft(sampleItem)
    setCatalogCreateOpen(true)
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'commerce',
      route: commerceLocation.pathname + commerceLocation.search,
      detail: 'Load sample Shop catalog item',
    })
    setNotice('Sample Shop catalog item loaded for review. Click Review catalog item to queue it; no Shop write, stock move, supplier message, sale, payment, or accounting post ran.')
    requestAnimationFrame(() => catalogCreateFormRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
  }

  const shopCommandCenter = <section aria-label="Shop next step" className="shop-command-center">
    <div>
      <span className="core-eyebrow">Shop next step</span>
      <h2>{shopAutopilotStage}</h2>
      <p>Open the next useful Shop task. SuperMega brings together online requests, orders, payments, purchasing, and stock so the manager can review one clear step at a time.</p>
    </div>
    <div className="shop-command-center-rows">{shopAutopilotRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
    <button className="core-button primary compact" onClick={runShopAutopilot} type="button">Open next step</button>
  </section>
  const shopSetupGuide = <section aria-label="Shop setup guide" className="shop-order-control shop-setup-guide">
    <div>
      <span className="core-eyebrow">Shop setup guide</span>
      <strong>Import products once. Then run the daily queue.</strong>
      <small>Use this only when you are adding real products, receiving stock, checking payment problems, or preparing end-of-day reports. Daily selling stays in the main order screen.</small>
    </div>
    <div className="shop-order-control-rows">{shopSetupGuideRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  useEffect(() => {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_seen',
      product: 'commerce',
      route: commerceLocation.pathname + commerceLocation.search,
      detail: shopAgentJob,
    })
  }, [commerceLocation.pathname, commerceLocation.search, shopAgentJob])

  if (managedCommerceBoundary) return managedCommerceBoundary

  function showOrderComposer() {
    const dialog = orderComposerRef.current
    if (dialog && !dialog.open) dialog.showModal()
    requestAnimationFrame(() => orderComposerHeadingRef.current?.focus())
  }

  function resetOrderDraftFields() {
    setSku(commerce.items[0]?.sku ?? '')
    setQuantity(1)
    setExtraOrderLines([])
    setCustomer('')
    setChannel('Messenger')
    setPayment('')
    setFulfilment('')
    setFulfilmentReference('')
    setPromisedAt('')
    setPaymentTermsDays(0)
    setPreparedChannelDraft(null)
    setPreparedEcommerceDraft(null)
    setOrderEntryMode('manual')
  }

  function detachPreparedOrderSources(options: { channel?: boolean; ecommerce?: boolean } = {}) {
    const removeChannel = options.channel ?? true
    const removeEcommerce = options.ecommerce ?? true
    const removed = (removeChannel && Boolean(preparedChannelDraft))
      || (removeEcommerce && Boolean(preparedEcommerceDraft))
    if (removeEcommerce && preparedEcommerceDraft) {
      consumedEcommerceDraftId.current = preparedEcommerceDraft.id
      navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
    }
    if (removeChannel) setPreparedChannelDraft(null)
    if (removeEcommerce) setPreparedEcommerceDraft(null)
    if (removed) setFulfilmentReference('')
    return removed
  }

  function openOrderComposer(mode: 'manual' | 'online' = 'manual') {
    if (!commerceCanWrite) {
      setNotice('Shop changes are paused. Open Settings before adding an order.')
      return
    }
    if (!orderDraftInitialized) {
      setNotice('Order recovery is still loading. Try again in a moment.')
      return
    }
    if (orderDraftRead.status === 'unavailable') {
      setNotice(orderDraftRead.error || 'Order recovery is unavailable. Open Settings before starting a manual order.')
      return
    }
    if (!promisedAt) setPromisedAt(defaultOrderPromiseInput())
    setOrderDraftActive(true)
    setResumedOrderDraft(null)
    setOrderDraftConflict(false)
    setOrderDraftIssue('')
    setOrderEntryMode(mode)
    showOrderComposer()
  }

  function closeOrderComposer() {
    orderComposerRef.current?.close()
    setOrderDraftActive(false)
    setResumedOrderDraft(null)
    setOrderDraftConflict(false)
    setOrderDraftIssue(orderDraftRead.error)
  }

  function focusNextOrderRequirement() {
    if (!promisedAt) {
      orderPromiseRef.current?.scrollIntoView({ block: 'center' })
      orderPromiseRef.current?.focus({ preventScroll: true })
      return
    }
    if (!payment) {
      if (orderOptionsRef.current) orderOptionsRef.current.open = true
      requestAnimationFrame(() => {
        orderPaymentRef.current?.scrollIntoView({ block: 'center' })
        orderPaymentRef.current?.focus({ preventScroll: true })
      })
    }
  }

  function resumeSavedOrderDraft() {
    const draft = orderDraftRead.status === 'ready' ? orderDraftRead.draft : null
    if (!draft) {
      setOrderDraftIssue(orderDraftRead.error || 'No saved order draft is available to resume.')
      return
    }
    const [firstLine, ...remainingLines] = draft.lines
    if (!firstLine) {
      setOrderDraftIssue('The saved order draft has no item to resume.')
      return
    }
    setCustomer(draft.customer)
    setChannel(draft.channel)
    setPayment(draft.payment)
    setFulfilment(draft.fulfilment)
    setFulfilmentReference(draft.fulfilmentReference)
    setPromisedAt(draft.promisedAt ? localDateTimeInputValue(new Date(draft.promisedAt)) : '')
    setPaymentTermsDays(draft.paymentTermsDays)
    setSku(firstLine.sku)
    setQuantity(firstLine.quantity)
    setExtraOrderLines(remainingLines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
    setPreparedChannelDraft(null)
    setPreparedEcommerceDraft(null)
    setOrderEntryMode('manual')
    setResumedOrderDraft(draft)
    setOrderDraftActive(true)
    setOrderDraftConflict(false)
    const catalogState = localCommerceOrderDraftCatalogState(draft, commerce.items)
    setOrderDraftIssue(catalogState.current
      ? 'Unfinished order restored. Source-message and Ecommerce links are never recovered.'
      : 'Shop price or availability changed. Review current Shop values before this order can continue.')
    showOrderComposer()
  }

  async function discardSavedOrderDraft() {
    if (orderDraftConflict) {
      setOrderDraftIssue('The saved draft changed in another tab. Close this form before discarding the latest saved copy.')
      return
    }
    const scopeAtDiscard = orderDraftScope
    const operationEpochAtDiscard = orderDraftOperationEpochRef.current
    const resetEpochAtDiscard = orderDraftResetEpochRef.current
    const discardInvalidDraft = orderDraftRead.status === 'invalid'
    const invalidFingerprintAtDiscard = discardInvalidDraft
      ? orderDraftRead.invalidFingerprint
      : undefined
    setOrderDraftActive(false)
    setOrderDraftSaving(true)
    try {
      await orderDraftSaveQueueRef.current
      if (orderDraftScopeRef.current !== scopeAtDiscard
        || orderDraftOperationEpochRef.current !== operationEpochAtDiscard) {
        throw new Error('The unfinished order changed while discard was waiting. Review the latest saved draft.')
      }
      const expectedRevision = discardInvalidDraft ? undefined : orderDraftRevisionRef.current
      const { discardCommerceOrderDraft } = await import('./commerce-order-draft')
      if (discardInvalidDraft || (expectedRevision ?? 0) > 0) {
        await discardCommerceOrderDraft(scopeAtDiscard, expectedRevision || undefined, {
          expectedResetEpoch: resetEpochAtDiscard,
          expectedInvalidFingerprint: invalidFingerprintAtDiscard,
        })
      }
      if (orderDraftScopeRef.current !== scopeAtDiscard
        || orderDraftOperationEpochRef.current !== operationEpochAtDiscard) {
        throw new Error('The unfinished order changed while discard was being confirmed. Review the latest saved draft.')
      }
      orderDraftOperationEpochRef.current += 1
      orderDraftRevisionRef.current = 0
      setOrderDraftRead({ status: 'empty', draft: null, error: '' })
      setResumedOrderDraft(null)
      setOrderDraftConflict(false)
      setOrderDraftIssue('')
      resetOrderDraftFields()
      orderComposerRef.current?.close()
      setNotice('Unfinished order discarded. No Shop order, stock, or payment record changed.')
    } catch (error) {
      if (orderComposerRef.current?.open) setOrderDraftActive(true)
      setOrderDraftIssue(error instanceof Error ? error.message : 'The unfinished order could not be discarded.')
    } finally {
      setOrderDraftSaving(false)
    }
  }

  async function acceptCurrentOrderDraftCatalog() {
    if (!resumedOrderDraft || !currentOrderRecoveryInput || !resumedOrderCanRebind || orderDraftSaving) return
    const scopeAtRebind = orderDraftScope
    const operationEpochAtRebind = orderDraftOperationEpochRef.current
    const resetEpochAtRebind = orderDraftResetEpochRef.current
    const inputAtRebind = currentOrderRecoveryInput
    setOrderDraftSaving(true)
    try {
      await orderDraftSaveQueueRef.current
      if (orderDraftScopeRef.current !== scopeAtRebind
        || orderDraftOperationEpochRef.current !== operationEpochAtRebind) {
        throw new Error('The unfinished order changed while Shop values were being reviewed. Reload the saved draft.')
      }
      const expectedRevision = orderDraftRevisionRef.current
      const { saveCommerceOrderDraft } = await import('./commerce-order-draft')
      const saved = await saveCommerceOrderDraft(
        inputAtRebind,
        expectedRevision,
        scopeAtRebind,
        { expectedResetEpoch: resetEpochAtRebind },
      )
      if (orderDraftScopeRef.current !== scopeAtRebind
        || orderDraftOperationEpochRef.current !== operationEpochAtRebind) {
        throw new Error('The unfinished order changed while Shop values were being recorded. Reload the saved draft.')
      }
      orderDraftRevisionRef.current = saved.revision
      setOrderDraftRead({ status: 'ready', draft: saved, error: '' })
      setResumedOrderDraft(saved)
      setOrderDraftConflict(false)
      setOrderDraftIssue('Current Shop prices and availability reviewed. The order can continue.')
    } catch (error) {
      setOrderDraftIssue(error instanceof Error ? error.message : 'Current Shop values could not be recorded.')
    } finally {
      setOrderDraftSaving(false)
    }
  }

  function queueAction(
    // actionIdPrefix lets a caller mark the resulting proof's actionId with a
    // structural, greppable prefix (e.g. the loyalty redemption marker) — the
    // repo identifies record kinds by actionId prefix, never by display copy.
    action: Omit<PendingAccountableAction, 'id' | 'commandId' | 'domain'> & { actionIdPrefix?: string },
    returnFocus?: HTMLElement | null,
  ): boolean {
    if (!commerceCanWrite) {
      setNotice('Shop changes are paused because this workspace cannot confirm writes. Reload or open Settings before retrying.')
      return false
    }
    if (pendingAction) {
      setNotice(`Finish or cancel ${pendingAction.id} before reviewing another change.`)
      return false
    }
    const trigger = returnFocus?.isConnected
      ? returnFocus
      : action.kind === 'order_create'
        ? preparedEcommerceDraft && orderReviewRef.current?.isConnected
          ? orderReviewRef.current
          : orderComposerTriggerRef.current
        : document.activeElement instanceof HTMLElement ? document.activeElement : null
    setActionTrigger(trigger)
    if (action.kind === 'order_create' && orderComposerRef.current?.open) orderComposerRef.current.close()
    const { actionIdPrefix, ...queued } = action
    setPendingAction({ ...queued, id: actionIdPrefix ? `${actionIdPrefix}${commandUuid().toUpperCase()}` : uid('ACT'), commandId: commandUuid(), domain: 'commerce' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
    return true
  }

  function queueCatalogItem(event: FormEvent) {
    event.preventDefault()
    const itemSku = itemDraft.sku.trim().toUpperCase()
    const name = itemDraft.name.trim()
    const onHand = Number(itemDraft.onHand)
    const reorderAt = Number(itemDraft.reorderAt)
    const price = Number(itemDraft.price)
    if (!itemSku || !name
      || !Number.isSafeInteger(onHand) || onHand < 0
      || !Number.isSafeInteger(reorderAt) || reorderAt < 0
      || !Number.isSafeInteger(price) || price < 1) {
      setNotice('Enter a SKU, item name, non-negative opening and reorder quantities, and a whole-MMK price.')
      return
    }
    if (commerce.items.some((item) => item.sku === itemSku)) {
      setNotice(`${itemSku} already exists. No catalog item was queued.`)
      return
    }
    const item: CommerceItem = { sku: itemSku, name, onHand, reorderAt, price }
    queueAction({
      kind: 'catalog_item_create',
      subjectId: item.sku,
      summary: `Add ${item.sku} to the catalog`,
      before: 'No catalog item',
      after: `${item.name} · ${item.onHand.toLocaleString()} opening units`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.item.created', action.commandId, proof, (current) => registerCommerceItem(current, item, proof))
        setItemDraft({ sku: '', name: '', onHand: '', reorderAt: '', price: '' })
        setSku(item.sku)
      },
    })
  }

  function openCatalogItemEditor(itemSku: string) {
    const item = commerce.items.find((candidate) => candidate.sku === itemSku)
    if (!item) return
    if (stockCountDraft) {
      const selector = stockCountTargetSelected ? '#stock-count-quantity' : '#stock-count-sku'
      requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(selector)?.focus())
      setNotice('Finish or cancel the stock count before editing catalog values. Your count draft was preserved.')
      return
    }
    if (purchaseOrderDraft) {
      requestAnimationFrame(() => purchaseOrderEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the stock order before editing catalog values. Your stock-order draft was preserved.')
      return
    }
    const alreadyEditingCurrent = catalogEditDraft?.sku === item.sku
      && catalogEditDraft.expectedPrice === item.price
      && catalogEditDraft.expectedReorderAt === item.reorderAt
    if (alreadyEditingCurrent) {
      requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('#catalog-edit-price')?.focus())
      setNotice(`Continue editing ${item.sku} below. Your draft was preserved.`)
      return
    }
    setCatalogEditDraft({
      sku: item.sku,
      expectedPrice: item.price,
      expectedReorderAt: item.reorderAt,
      price: String(item.price),
      reorderAt: String(item.reorderAt),
    })
    setNotice(`Edit only the current price and reorder level for ${item.name}. Stock and prior orders stay unchanged.`)
    requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('#catalog-edit-price')?.focus())
  }

  function cancelCatalogItemEditor() {
    const itemSku = catalogEditDraft?.sku
    setCatalogEditDraft(null)
    setNotice('Catalog editing closed. Shop data was not modified.')
    requestAnimationFrame(() => {
      if (itemSku) catalogEditTriggerRefs.current.get(itemSku)?.focus()
    })
  }

  function reviewCatalogItemUpdate(event: FormEvent) {
    event.preventDefault()
    if (!catalogEditDraft || !catalogEditItem
      || catalogEditPriceResult === null || catalogEditReorderResult === null) {
      setNotice('Enter a whole-MMK price of at least 1 and a non-negative whole reorder level.')
      return
    }
    if (catalogEditStale) {
      setNotice('Catalog values changed while this editor was open. Reload current values before review.')
      return
    }
    if (!catalogEditChanged) {
      setNotice('Change the price or reorder level before review. Nothing was queued.')
      return
    }
    const item = catalogEditItem
    const update: CommerceItemUpdate = {
      sku: item.sku,
      expectedPrice: catalogEditDraft.expectedPrice,
      nextPrice: catalogEditPriceResult,
      expectedReorderAt: catalogEditDraft.expectedReorderAt,
      nextReorderAt: catalogEditReorderResult,
    }
    queueAction({
      kind: 'catalog_item_update',
      subjectId: item.sku,
      summary: `Update catalog values for ${item.name}`,
      before: `${item.sku} · ${formatMoney(update.expectedPrice)} · reorder at ${update.expectedReorderAt.toLocaleString()}`,
      after: `${item.sku} · ${formatMoney(update.nextPrice)} · reorder at ${update.nextReorderAt.toLocaleString()} · stock unchanged`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        let reviewRequired = false
        try {
          await mutateCommerce('commerce.item.updated', action.commandId, proof, (current) => {
            const next = updateCommerceItem(current, update, proof)
            if (!next) reviewRequired = true
            return next
          })
          setCatalogEditDraft((current) => current?.sku === item.sku ? null : current)
        } catch (error) {
          if (reviewRequired || error instanceof ShopReviewRequiredError) {
            setCatalogEditDraft(null)
            requestAnimationFrame(() => catalogEditTriggerRefs.current.get(item.sku)?.focus())
            throw new ShopReviewRequiredError(`Catalog values changed while ${item.sku} was under review. Nothing was applied; reopen Edit item to use the current values.`)
          }
          throw error
        }
      },
    }, catalogEditTriggerRefs.current.get(item.sku))
  }

  async function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    const counterSettlement = pendingAction.presentation === 'counter' && pendingAction.kind === 'order_settle'
    if (pendingAction.evidenceReferenceLocked
      && details.evidenceReference.trim() !== pendingAction.evidenceReferenceSuggestion) {
      throw new Error('Source-backed evidence is fixed to the reviewed message mapping. Cancel and review the source again to change it.')
    }
    const record = confirmAccountableAction(
      pendingAction,
      managedIdentity ? { ...details, actor: managedIdentity.userId } : details,
    )
    if (!pendingAction.confirmation) {
      setPendingAction((current) => current?.id === pendingAction.id
        ? { ...current, confirmation: record }
        : current)
    }
    try {
      await pendingAction.apply(record)
    } catch (error) {
      if (error instanceof ShopReviewRequiredError) {
        setPendingAction(null)
        setNotice(error.message)
      }
      throw error
    }
    if (!managedIdentity) setActions((current) => [record, ...current])
    if (pendingAction.presentation === 'counter') recordBehaviorSignal(window.localStorage, {
      event: 'first_value_completed',
      product: 'commerce',
      route: commerceLocation.pathname + commerceLocation.search,
      detail: counterSettlement
        ? 'Completed a reviewed Shop sale with payment, handoff, stock, and its order record ready.'
        : 'Created a reviewed Shop order and reserved its stock.',
    })
    if (counterSettlement) emitMetric({ product: 'shop', capability: 'shop-counter', action: 'sale.completed', ts: Date.now() })
    else if (pendingAction.presentation === 'counter') emitMetric({ product: 'shop', capability: 'shop-counter', action: 'order.created', ts: Date.now() })
    if (pendingAction.kind === 'daily_close') emitMetric({ product: 'shop', capability: 'shop-daily-close', action: 'shift.close.confirmed', ts: Date.now() })
    setNotice(pendingAction.presentation === 'counter'
      ? counterSettlement
        ? `Sale ${commerceOrderDisplayReference(pendingAction.subjectId)} completed. Payment and handoff recorded; order record ready.`
        : `Order ${commerceOrderDisplayReference(pendingAction.subjectId)} created. Stock reserved. Finish fulfilment and reconcile payment before completion.`
      : `${pendingAction.summary} ${managedIdentity ? 'confirmed.' : 'completed.'}`)
    setPendingAction(null)
    if (pendingAction.presentation === 'counter' && !counterSettlement) navigate(`/shop/?tab=orders#${commerceOrderTargetId(pendingAction.subjectId)}`)
  }

  function useChannelDraft(draft: ChannelOrderDraft) {
    if (!commerceCanWrite) {
      setNotice('Shop changes are paused because this workspace cannot confirm writes.')
      return
    }
    if (pendingAction || !channelOrderDraftIsReady(draft)) {
      setNotice('Finish the current accountable action before using another channel draft.')
      return
    }
    setCustomer(draft.customer)
    setChannel(draft.channel)
    setSku(draft.sku)
    setQuantity(draft.quantity)
    setExtraOrderLines([])
    setPayment(draft.payment)
    setFulfilment('')
    setFulfilmentReference(draft.sourceRecordId)
    setPromisedAt(defaultOrderPromiseInput())
    setPreparedChannelDraft(draft)
    setPreparedEcommerceDraft(null)
    setOrderEntryMode('manual')
    setNotice(`${draft.sourceRecordId} mapped locally. Review the structured order before any stock changes.`)
  }

  async function reviewStorefrontRequest(requestId: string) {
    if (!commerceCanWrite || pendingAction) {
      setNotice('Finish the current Shop action before reviewing an Ecommerce request.')
      return
    }
    const request = pendingStorefrontRequests.find((candidate) => candidate.id === requestId)
    if (!request) {
      setNotice('The Ecommerce request is no longer waiting in this Shop inbox.')
      return
    }
    try {
      if (request.schema === 'supermega.ecommerce.order_request.v2') {
        const { prepareManagedEcommerceShopDraftV2 } = await import('../products/ecommerce/ecommerce-buying-lifecycle')
        const draft = await prepareManagedEcommerceShopDraftV2({
          request,
          currentCatalog: commerce.items,
          currentPromotionPolicies: commerce.promotionPolicies ?? [],
          currentShippingPolicies: commerce.shippingPolicies ?? [],
          currentPaymentPolicies: commerce.paymentPolicies ?? [],
          currentTaxConfigurations: commerce.taxConfigurations ?? [],
          catalogRevision: commerce.catalogChanges?.length ?? 0,
          confirmedAt: new Date().toISOString(),
        })
        const [firstLine, ...remainingLines] = draft.lines
        if (!firstLine) throw new Error('The managed Ecommerce request has no reviewed item.')
        setPreparedChannelDraft(null)
        setPreparedEcommerceDraft(draft)
        setCustomer(draft.customerProfile?.name ?? draft.customerReference)
        setChannel('Ecommerce')
        setSku(firstLine.sku)
        setQuantity(firstLine.quantity)
        setExtraOrderLines(remainingLines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
        setPayment(draft.pricing.payment.adapter === 'cash_on_delivery'
          ? 'Cash on delivery'
          : draft.pricing.payment.adapter === 'kbzpay_manual' ? 'KBZPay' : 'Cash')
        setFulfilment(draft.fulfilment)
        setFulfilmentReference(draft.deliveryAddress
          ? `${draft.deliveryAddress.line1} · ${draft.deliveryAddress.township} · ${draft.deliveryAddress.city}${draft.deliveryAddress.instructions ? ` · ${draft.deliveryAddress.instructions}` : ''}`
          : draft.sourceRequestId)
        setPromisedAt(draft.pricing.shipping.promiseMinutes
          ? localDateTimeInputValue(new Date(Date.parse(draft.confirmedAt) + draft.pricing.shipping.promiseMinutes * 60_000))
          : defaultOrderPromiseInput())
        setOrderEntryMode('manual')
        setNotice(`${request.id} loaded from the authenticated inbox with ${draft.lines.length} ${draft.lines.length === 1 ? 'item' : 'items'}. Confirm the promise and payment, then use the separate Shop action gate.`)
        return
      }
      const { recordEcommerceShopDraft } = await import('../products/ecommerce/ecommerce-shop-handoff')
      const draft = recordEcommerceShopDraft({
        request,
        currentCatalog: commerce.items,
        confirmedAt: new Date().toISOString(),
      })
      setPreparedChannelDraft(null)
      setPreparedEcommerceDraft(draft)
      setCustomer(draft.customerReference)
      setChannel('Ecommerce')
      setSku(draft.line.sku)
      setQuantity(draft.line.quantity)
      setExtraOrderLines([])
      setPayment('')
      setFulfilment(draft.fulfilment)
      setFulfilmentReference(draft.sourceRequestId)
      setPromisedAt(defaultOrderPromiseInput())
      setOrderEntryMode('manual')
      setNotice(`${request.id} loaded from the authenticated inbox. Confirm the promise and payment, then use the separate Shop action gate.`)
    } catch (error) {
      detachPreparedOrderSources({ channel: false })
      setNotice(error instanceof Error ? error.message : 'The Ecommerce inbox request failed closed.')
    }
  }

  function addOrderLine() {
    const usedSkus = new Set(manualOrderLineDrafts.map((line) => line.sku))
    const nextItem = commerce.items.find((item) => !usedSkus.has(item.sku))
    if (!nextItem || manualOrderLineDrafts.length >= 20) {
      setNotice('Every available catalog item is already in this order.')
      return
    }
    setExtraOrderLines((current) => [...current, { sku: nextItem.sku, quantity: 1 }])
    detachPreparedOrderSources()
    setNotice(`${nextItem.name} added. Each item can appear once in an order.`)
  }

  function updateExtraOrderLine(index: number, patch: Partial<{ sku: string; quantity: number }>) {
    setExtraOrderLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
    detachPreparedOrderSources()
  }

  function removeExtraOrderLine(index: number) {
    setExtraOrderLines((current) => current.filter((_, lineIndex) => lineIndex !== index))
    detachPreparedOrderSources()
    setNotice('Item removed from this order draft. Shop data has not changed.')
  }

  function reviewCounterSale(review: ShopCounterReview, returnFocus: HTMLElement) {
    if (!review.lines.length || !review.payment) {
      setNotice('Add at least one item and choose payment before reviewing the sale.')
      return
    }
    const reviewedAt = new Date()
    const orderLines: CommerceOrderLine[] = []
    const seenSkus = new Set<string>()
    let orderQuantity = 0
    let orderTotal = 0
    for (const line of review.lines) {
      const item = commerce.items.find((candidate) => candidate.sku === line.sku)
      if (!item || seenSkus.has(line.sku) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > item.onHand) {
        setNotice('The catalog or available stock changed. Review the current sale again.')
        return
      }
      const lineTotal = item.price * line.quantity
      const nextQuantity = orderQuantity + line.quantity
      const nextTotal = orderTotal + lineTotal
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(nextTotal)) {
        setNotice('This sale exceeds the supported whole-MMK or quantity limit.')
        return
      }
      seenSkus.add(line.sku)
      orderQuantity = nextQuantity
      orderTotal = nextTotal
      orderLines.push({ sku: item.sku, name: item.name, ...(item.variant ? { variant: item.variant } : {}), quantity: line.quantity, unitPriceMmk: item.price })
    }
    const orderId = uid('ORD')
    const promisedAt = new Date(reviewedAt.getTime() + 30 * 60 * 1000).toISOString()
    const order: CommerceOrder = {
      id: orderId,
      createdAt: reviewedAt.toISOString(),
      customer: review.customer || 'Guest',
      channel: 'Walk-in',
      item: commerceOrderItemSummary(orderLines),
      ...(orderLines.length === 1 ? { itemSku: orderLines[0].sku } : {}),
      quantity: orderQuantity,
      payment: review.payment,
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: 'pickup',
      fulfilmentReference: `Counter ${orderId}`,
      promisedAt,
      lines: orderLines,
      total: orderTotal,
      status: 'confirmed',
    }
    if (commerce.inventoryFoundation) {
      try {
        commerceOrderLocationAllocationPreview(commerce, order)
      } catch {
        setNotice('Location stock cannot cover this sale. Receive or move stock, then try again.')
        return
      }
    }
    const lineReview = orderLines.map((line) => `${line.name} × ${line.quantity}`).join(', ')
    const stockReview = orderLines.map((line) => {
      const item = commerce.items.find((candidate) => candidate.sku === line.sku)
      return `${line.sku} ${item?.onHand ?? 0} → ${(item?.onHand ?? 0) - line.quantity}`
    }).join(', ')
    const displayReference = commerceOrderDisplayReference(order.id)
    const completesSale = review.outcome === 'paid_handoff'
    queueAction({
      kind: completesSale ? 'order_settle' : 'order_create',
      subjectId: order.id,
      summary: completesSale ? `Complete ${formatMoney(order.total)} counter sale` : `Create ${formatMoney(order.total)} counter order`,
      before: `${lineReview} · ${review.payment}`,
      after: completesSale
        ? `Order ${displayReference} completed · ${review.payment} reconciled · Stock ${stockReview}`
        : `Order ${displayReference} confirmed · Reserved stock ${stockReview}`,
      presentation: 'counter',
      actorSuggestion: managedIdentity ? undefined : 'Sample cashier',
      evidenceReferenceSuggestion: `Counter order ${displayReference}`,
      evidenceReferenceLocked: true,
      reasonSuggestion: completesSale ? `${review.payment} received and the customer took the order.` : 'Walk-in counter order reviewed.',
      apply: async (action) => {
        const proof = commerceActionProof(action)
        const ownedOrder = { ...order, owner: action.actor }
        // Browser-local counter settlement is one crash-safe workspace write. The same
        // pure lifecycle transitions used by Orders are composed inside one recovery
        // intent, with a unique proof id per recorded step. Managed workspaces stay on
        // the server-supported open-order intent until a compound command exists there.
        await mutateCommerce('commerce.order.created', action.commandId, proof, (current) => {
          let state = reserveCommerceOrder(current, ownedOrder, proof)
          if (!state || !completesSale) return state
          if (managedIdentity) return null
          state = reconcileCommercePayment(state, order.id, { ...proof, actionId: `${proof.actionId}:payment` })
          if (!state) return null
          for (let step = 0; step < 3; step += 1) {
            const live = state.orders.find((candidate) => candidate.id === order.id)
            if (!live || live.status === 'cancelled') return null
            if (live.status === 'completed') break
            const stepStatus = live.status
            const advanced = advanceCommerceOrder(state, order.id, stepStatus, { ...proof, actionId: `${proof.actionId}:advance-${stepStatus}` }, 'client')
            if (!advanced) return null
            state = advanced
          }
          const settled = state.orders.find((candidate) => candidate.id === order.id)
          return settled?.status === 'completed' && settled.paymentStatus === 'reconciled' ? state : null
        })
        review.onCommitted()
        if (completesSale) {
          setReceiptAck(null)
          setCounterReceiptOrderId(order.id)
        }
      },
    }, returnFocus)
  }

  function recordOrder(event: FormEvent) {
    event.preventDefault()
    if (orderDraftConflict || resumedOrderNeedsReview) {
      setOrderDraftIssue(orderDraftConflict
        ? 'Close this form and resume the latest saved order before review.'
        : 'Review current Shop prices and availability before preparing this recovered order.')
      return
    }
    if (!payment) {
      setNotice('Choose how payment will be reviewed before preparing this order.')
      return
    }
    const handoffReference = fulfilmentReference.trim()
    if (!fulfilment || !handoffReference) {
      setNotice('Choose pickup or delivery and enter its handoff reference before reviewing this order.')
      return
    }
    const reviewedAt = new Date()
    const promisedTime = new Date(promisedAt)
    if (!promisedAt || Number.isNaN(promisedTime.getTime()) || promisedTime.getTime() <= reviewedAt.getTime()) {
      setNotice('Choose a promised pickup or delivery time that is still in the future.')
      return
    }
    const canonicalPromisedAt = promisedTime.toISOString()
    const paymentDueAt = paymentTermsDays === 0
      ? undefined
      : new Date(reviewedAt.getTime() + paymentTermsDays * 24 * 60 * 60 * 1000).toISOString()
    const sourceDraft = preparedChannelDraft && channelOrderDraftIsReady(preparedChannelDraft) ? preparedChannelDraft : null
    const ecommerceDraft = preparedEcommerceDraft
    if (sourceDraft && ecommerceDraft) {
      detachPreparedOrderSources()
      setNotice('Two source drafts were present. Both links were removed and nothing was queued.')
      return
    }
    const orderLineSkus = new Set<string>()
    const orderLines: CommerceOrderLine[] = []
    let orderQuantity = 0
    let orderTotal = 0
    for (const line of manualOrderLineItems) {
      if (!line.item
        || !Number.isSafeInteger(line.quantity)
        || line.quantity < 1
        || line.item.onHand < line.quantity
        || orderLineSkus.has(line.item.sku)) {
        setNotice('Each order item must be unique, in stock, and use a whole quantity of at least 1.')
        return
      }
      const lineTotal = line.item.price * line.quantity
      const nextQuantity = orderQuantity + line.quantity
      const nextTotal = orderTotal + lineTotal
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(nextTotal)) {
        setNotice('This order exceeds the supported whole-MMK or quantity limit.')
        return
      }
      orderLineSkus.add(line.item.sku)
      orderQuantity = nextQuantity
      orderTotal = nextTotal
      orderLines.push({
        sku: line.item.sku,
        name: line.item.name,
        ...(line.item.variant ? { variant: line.item.variant } : {}),
        quantity: line.quantity,
        unitPriceMmk: line.item.price,
      })
    }
    const selectedLine = orderLines[0]
    const selectedItem = manualOrderLineItems[0]?.item
    if (!selectedLine || !selectedItem) {
      setNotice('Add at least one available catalog item before reviewing the order.')
      return
    }
    if (sourceDraft && orderLines.length !== 1) {
      detachPreparedOrderSources({ ecommerce: false })
      setNotice('This channel source contains one reviewed item. Its source link was removed; review the multi-item order manually.')
      return
    }
    if (sourceDraft && (customer.trim() !== sourceDraft.customer
      || channel !== sourceDraft.channel
      || selectedLine.sku !== sourceDraft.sku
      || selectedLine.quantity !== sourceDraft.quantity
      || payment !== sourceDraft.payment)) {
      detachPreparedOrderSources({ ecommerce: false })
      setNotice('The structured order changed after source review. Review the channel mapping again or continue as a manual order.')
      return
    }
    const ecommerceLines = ecommerceDraft
      ? ecommerceDraft.schema === 'supermega.ecommerce.shop_draft.v7'
        ? ecommerceDraft.lines
        : [ecommerceDraft.line]
      : []
    const ecommercePayment = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
      ? ecommerceDraft.pricing.payment.adapter === 'cash_on_delivery'
        ? 'Cash on delivery'
        : ecommerceDraft.pricing.payment.adapter === 'kbzpay_manual'
          ? 'KBZPay'
          : 'Cash'
      : ''
    const ecommerceCustomer = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
      ? ecommerceDraft.customerProfile?.name ?? ecommerceDraft.customerReference
      : ecommerceDraft?.customerReference ?? ''
    if (ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
      && commerce.inventoryFoundation
      && !managedInventoryProjection?.locations.some((candidate) => candidate.id === ecommerceDraft.operatingContext.operatingUnitLocationId)) {
      detachPreparedOrderSources({ ecommerce: true })
      setNotice('The Shop operating location changed after Ecommerce review. Reopen the request; no order was prepared.')
      return
    }
    const promotionDecision = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
      ? ecommerceDraft.pricing.promotion
      : undefined
    const shippingDecision = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
      ? ecommerceDraft.pricing.shipping
      : undefined
    const paymentDecision = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
      ? ecommerceDraft.pricing.payment
      : undefined
    const taxDecision = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
      ? ecommerceDraft.pricing.tax
      : undefined
    if (taxDecision) {
      const draftTaxCalculation = commerceOrderCalculation(
        commerce,
        taxDecision.listedSubtotalMmk,
        taxDecision.reviewedAt,
      )
      const draftTaxConfiguration = taxDecision.taxConfigurationRevision === null
        ? null
        : (commerce.taxConfigurations ?? []).find((candidate) => candidate.revision === taxDecision.taxConfigurationRevision) ?? null
      if (!draftTaxCalculation
        || draftTaxCalculation.totalMmk !== taxDecision.totalMmk
        || draftTaxCalculation.taxMmk !== taxDecision.taxMmk
        || ('taxConfigurationRevision' in draftTaxCalculation
          ? draftTaxCalculation.taxConfigurationRevision !== taxDecision.taxConfigurationRevision
          : taxDecision.taxConfigurationRevision !== null)
        || (draftTaxConfiguration?.proof.actionId ?? null) !== taxDecision.policyActionId) {
        detachPreparedOrderSources({ channel: false })
        setNotice('The Shop tax schedule changed after Ecommerce review. Reopen the request; no order was prepared.')
        return
      }
    }
    const listedOrderTotal = (promotionDecision?.netSubtotalMmk ?? orderTotal) + (shippingDecision?.feeMmk ?? 0)
    const pricedOrderTotal = taxDecision?.totalMmk ?? listedOrderTotal
    if (shippingDecision?.promiseMinutes
      && Date.parse(canonicalPromisedAt) < Date.parse(shippingDecision.reviewedAt) + shippingDecision.promiseMinutes * 60_000) {
      setNotice(`Choose a promise at least ${shippingDecision.promiseMinutes} minutes after the governed delivery review.`)
      return
    }
    if (ecommerceDraft && (customer.trim() !== ecommerceCustomer
      || channel !== 'Ecommerce'
      || fulfilment !== ecommerceDraft.fulfilment
      || Boolean(ecommercePayment && payment !== ecommercePayment)
      || orderLines.length !== ecommerceLines.length
      || orderLines.some((line, index) => {
        const expected = ecommerceLines[index]
        return !expected
          || line.sku !== expected.sku
          || line.quantity !== expected.quantity
          || line.name !== expected.name
          || (line.variant ?? null) !== expected.variant
          || line.unitPriceMmk !== expected.unitPriceMmk
      })
      || pricedOrderTotal !== ecommerceDraft.totalMmk)) {
      detachPreparedOrderSources({ channel: false })
      setNotice('The Ecommerce request changed after confirmation. Return to Ecommerce or continue as a manual order.')
      return
    }
    const sourceRecordId = sourceDraft?.sourceRecordId ?? ecommerceDraft?.sourceRequestId
    const sourceEvidence = sourceDraft?.evidenceReference ?? ecommerceDraft?.evidenceReference
    const confirmationEvidence = sourceEvidence ?? handoffReference
    if (sourceRecordId && commerce.orders.some((candidate) => candidate.sourceRecordId === sourceRecordId)) {
      setNotice(`${sourceRecordId} is already linked to an order. No duplicate was queued.`)
      return
    }
    const sourceBacked = Boolean(sourceRecordId)
    const recoveryInputAtReview = sourceBacked ? null : currentOrderRecoveryInput
    const recoveryScopeAtReview = orderDraftScope
    const recoveryOperationEpochAtReview = orderDraftOperationEpochRef.current
    const recoveryResetEpochAtReview = orderDraftResetEpochRef.current
    const order: CommerceOrder = {
      id: uid('ORD'),
      createdAt: reviewedAt.toISOString(),
      customer: customer.trim() || 'Guest',
      channel,
      item: orderLines.length === 1 ? selectedLine.name : commerceOrderItemSummary(orderLines),
      ...(orderLines.length === 1 ? { itemSku: selectedLine.sku } : {}),
      quantity: orderQuantity,
      payment,
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment,
      fulfilmentReference: handoffReference,
      promisedAt: canonicalPromisedAt,
      ...(paymentDueAt ? { paymentDueAt } : {}),
      sourceRecordId,
      evidenceReference: sourceEvidence,
      ...(!sourceBacked || orderLines.length > 1 || promotionDecision ? { lines: orderLines } : {}),
      ...(promotionDecision ? { promotionDecision } : {}),
      ...(shippingDecision ? { shippingDecision } : {}),
      ...(paymentDecision ? { paymentDecision } : {}),
      ...(taxDecision ? { taxDecision } : {}),
      total: listedOrderTotal,
      status: 'confirmed',
    }
    const lineReview = orderLines.map((line) => `${line.sku} × ${line.quantity} @ ${line.unitPriceMmk.toLocaleString()} MMK`).join(', ')
    const reservationReview = orderLines.map((line) => {
      const item = commerce.items.find((candidate) => candidate.sku === line.sku)
      return `${line.sku} ${item?.onHand ?? 0} → ${(item?.onHand ?? 0) - line.quantity}`
    }).join(', ')
    let locationReview = ''
    if (commerce.inventoryFoundation) {
      try {
        const projection = projectShopInventory(commerce.inventoryFoundation, commerce.items.map((item) => item.sku).sort())
        const locationNames = new Map(projection.locations.map((location) => [location.id, location.name]))
        const trackingCodes = new Map(projection.stockUnits.map((unit) => [unit.id, unit.trackingCode]))
        const allocations = commerceOrderLocationAllocationPreview(commerce, order)
        locationReview = ` · Pick ${allocations.map((allocation) => `${allocation.quantity} ${allocation.sku} from ${locationNames.get(allocation.locationId) ?? allocation.locationId} / ${trackingCodes.get(allocation.stockUnitId) ?? allocation.stockUnitId}`).join(', ')}`
      } catch {
        setNotice('Location stock cannot cover this order. Move or receive stock, then review the order again.')
        return
      }
    }
    const calculationReview = commerceOrderCalculation(commerce, listedOrderTotal, reviewedAt.toISOString())
    if (!calculationReview) {
      setNotice('The order total cannot be calculated safely. Review item prices and tax setup before continuing.')
      return
    }
    if (taxDecision && (calculationReview.totalMmk !== taxDecision.totalMmk
      || calculationReview.taxMmk !== taxDecision.taxMmk
      || ('listedSubtotalMmk' in calculationReview
        ? calculationReview.listedSubtotalMmk
        : calculationReview.subtotalMmk) !== taxDecision.listedSubtotalMmk
      || ('taxConfigurationRevision' in calculationReview
        ? calculationReview.taxConfigurationRevision !== taxDecision.taxConfigurationRevision
        : taxDecision.taxConfigurationRevision !== null))) {
      detachPreparedOrderSources({ channel: false })
      setNotice('The governed Ecommerce tax total no longer matches Shop. Reopen the request; no order was queued.')
      return
    }
    const creditReview = commerceCustomerCreditReview(
      commerce,
      order.customer,
      calculationReview.totalMmk,
      paymentTermsDays,
      order.createdAt,
    )
    if (!creditReview.allowed) {
      setNotice(creditReview.reason === 'policy_missing'
        ? `Set a customer credit policy for ${order.customer} before offering payment terms.`
        : creditReview.reason === 'customer_hold'
          ? `${order.customer} is on credit hold. Choose payment at handoff or review the policy.`
          : creditReview.reason === 'terms_exceeded'
            ? `${order.customer} is not approved for ${paymentTermsDays}-day terms.`
            : `This order would exceed ${order.customer}'s ${formatMoney(creditReview.policy?.creditLimitMmk ?? 0)} credit limit.`)
      return
    }
    queueAction({
      kind: 'order_create',
      subjectId: order.id,
      summary: ecommerceDraft ? 'Review Ecommerce order' : `Confirm order for ${order.customer}`,
      before: `${sourceRecordId ? `Request ${sourceRecordId} · ` : ''}Customer ${order.customer} · ${lineReview}`,
      after: `Order ${order.id} · ${formatCommerceCalculation(calculationReview)}${promotionDecision?.status === 'approved' ? ` · promotion ${promotionDecision.code} -${formatMoney(promotionDecision.discountMmk)} under policy R${promotionDecision.policyRevision}` : promotionDecision?.status === 'rejected' ? ` · promotion ${promotionDecision.code} rejected (${promotionDecision.reason.replaceAll('_', ' ')})` : ''} · Payment ${payment} · due ${paymentDueAt ? formatIssueDue(paymentDueAt) : 'at handoff'}${paymentTermsDays ? ` · credit ${formatMoney(creditReview.exposureBeforeMmk)} → ${formatMoney(creditReview.exposureAfterMmk)} under policy R${creditReview.policy?.revision}` : ''} · Owner confirming operator · Promise ${formatIssueDue(canonicalPromisedAt)} · ${fulfilmentLabel(order.fulfilment)} · Stock ${reservationReview}${locationReview}`,
      actorSuggestion: managedIdentity ? undefined : 'Shop reviewer',
      evidenceReferenceSuggestion: confirmationEvidence,
      evidenceReferenceLocked: Boolean(sourceRecordId),
      reasonSuggestion: ecommerceDraft
        ? 'Customer request reviewed against the current Shop catalog.'
        : 'Order and handoff reviewed.',
      apply: async (action) => {
        const ownedOrder = { ...order, owner: action.actor }
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.order.created', action.commandId, proof, (current) => {
          const paymentPolicyState = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7'
            && !managedIdentity
            && paymentDecision
            && (current.paymentPolicies?.length ?? 0) === 0
            ? restoreBrowserLocalSamplePaymentPolicies(
                current,
                paymentDecision,
                ecommerceDraft.fulfilment,
                ecommerceDraft.totalMmk,
              )
            : current
          return paymentPolicyState
            ? reserveCommerceOrder(paymentPolicyState, ownedOrder, proof)
            : null
        })
        emitMetric({ product: 'shop', capability: 'shop-orders', action: 'order.created', ts: Date.now() })
        if (ecommerceDraft) {
          consumedEcommerceDraftId.current = ecommerceDraft.id
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        }
        if (recoveryInputAtReview) {
          try {
            await orderDraftSaveQueueRef.current
            if (orderDraftScopeRef.current !== recoveryScopeAtReview
              || orderDraftOperationEpochRef.current !== recoveryOperationEpochAtReview) {
              throw new Error('a newer or different unfinished order is now saved')
            }
            const {
              commerceOrderDraftMatchesInput,
              discardCommerceOrderDraft,
              readCommerceOrderDraft,
            } = await import('./commerce-order-draft')
            const latestRecovery = readCommerceOrderDraft(recoveryScopeAtReview)
            if (latestRecovery.status === 'ready'
              && latestRecovery.draft
              && commerceOrderDraftMatchesInput(latestRecovery.draft, recoveryInputAtReview)) {
              await discardCommerceOrderDraft(
                recoveryScopeAtReview,
                latestRecovery.draft.revision,
                { expectedResetEpoch: recoveryResetEpochAtReview },
              )
              if (orderDraftScopeRef.current !== recoveryScopeAtReview
                || orderDraftOperationEpochRef.current !== recoveryOperationEpochAtReview) {
                throw new Error('a newer unfinished order arrived while the confirmed copy was being cleared')
              }
              orderDraftOperationEpochRef.current += 1
              orderDraftRevisionRef.current = 0
              setOrderDraftRead({ status: 'empty', draft: null, error: '' })
              setOrderDraftIssue('')
            } else if (latestRecovery.status === 'empty') {
              orderDraftRevisionRef.current = 0
              setOrderDraftRead(latestRecovery)
              setOrderDraftIssue('')
            } else {
              orderDraftRevisionRef.current = latestRecovery.draft?.revision ?? 0
              setOrderDraftRead(latestRecovery)
              throw new Error('the saved recovery copy does not exactly match the confirmed manual order')
            }
          } catch (error) {
            setOrderDraftIssue(error instanceof Error
              ? `Order confirmed, but its local recovery copy remains: ${error.message}`
              : 'Order confirmed, but its local recovery copy could not be cleared.')
          }
        }
        setOrderDraftActive(false)
        setResumedOrderDraft(null)
        setOrderDraftConflict(false)
        resetOrderDraftFields()
      },
    })
  }

  function queueWebsiteOrder(record: WebsiteOrderRecord, promisedAtInput: string) {
    if (commerce.orders.some((order) => order.id === record.id || order.sourceRecordId === record.id)) {
      setNotice(`${record.id} is already in the Shop order queue.`)
      return
    }
    if (pendingAction?.kind === 'order_create' && pendingAction.subjectId === record.id) {
      setNotice(`${record.id} is already waiting for accountable confirmation.`)
      return
    }

    const line = record.lines.length === 1 ? record.lines[0] : null
    const matchingItems = line ? commerce.items.filter((item) => item.sku === line.sku) : []
    const item = matchingItems.length === 1 ? matchingItems[0] : null
    if (!line || !item || line.quantity < 1 || item.onHand < line.quantity || item.price !== line.unitPriceMmk || record.totalMmk !== line.quantity * line.unitPriceMmk) {
      setNotice('Website order confirmation failed closed. Recheck the item, immutable price, quantity, and available stock.')
      return
    }
    const promisedTime = new Date(promisedAtInput)
    const reviewedAt = new Date()
    if (!promisedAtInput || Number.isNaN(promisedTime.getTime()) || promisedTime.getTime() <= reviewedAt.getTime()) {
      setNotice('Choose a promised pickup or delivery time that is still in the future.')
      return
    }
    const canonicalPromisedAt = promisedTime.toISOString()

    const paymentLabel = record.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : record.paymentMethod === 'manual_qr' ? 'Manual QR review' : 'Manual bank transfer'
    const orderFulfilment = record.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery'
    const order: CommerceOrder = {
      id: record.id,
      createdAt: record.createdAt,
      customer: record.customerReference,
      channel: 'Website',
      item: line.itemName,
      itemSku: line.sku,
      quantity: line.quantity,
      payment: paymentLabel,
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: orderFulfilment,
      fulfilmentReference: record.id,
      promisedAt: canonicalPromisedAt,
      paymentDueAt: record.createdAt,
      sourceRecordId: record.id,
      evidenceReference: record.completion.evidenceReference,
      total: record.totalMmk,
      status: 'confirmed',
    }
    const beforeStock = item.onHand
    queueAction({
      kind: 'order_create',
      subjectId: record.id,
      summary: `Confirm ${record.id} from Website`,
      before: `ready for confirmation · ${item.sku} · ${beforeStock} on hand`,
      after: `confirmed · owner: confirming operator · promised ${formatTime(canonicalPromisedAt)} · ${fulfilmentLabel(orderFulfilment)} · ${record.id} · ${beforeStock - line.quantity} on hand`,
      apply: (action) => mutateCommerce('commerce.order.created', action.commandId, commerceActionProof(action), (current) => reserveCommerceOrder(current, { ...order, owner: action.actor }, commerceActionProof(action))),
    })
  }

  function queueManagedWebsiteIntake(intakeId: string, input: CommerceWebsiteOrderInput): boolean {
    const intake = websiteIntakes.find((candidate) => candidate.id === intakeId && candidate.status === 'pending_confirmation')
    const item = intake ? commerce.items.find((candidate) => candidate.sku === intake.sku) : null
    if (!intake || !item || item.onHand < intake.quantity || item.price !== intake.unitPrice) {
      setNotice('Managed Website intake failed closed. Recheck the retained intake, catalog price, and available stock.')
      return false
    }
    const orderId = `ORD-WEB-${intake.id.slice(5)}`
    if (pendingAction?.kind === 'order_create' && pendingAction.subjectId === orderId) {
      setNotice(`${orderId} is already waiting for authenticated confirmation.`)
      return true
    }
    const fulfilment = input.fulfilmentMethod === 'pickup' ? 'Customer pickup' : 'Local delivery'
    return queueAction({
      kind: 'order_create',
      subjectId: orderId,
      summary: `Confirm ${orderId} from Website`,
      before: `${intake.id} waiting · ${item.onHand} on hand`,
      after: `${fulfilment} · owner: confirming operator · promised ${formatTime(input.promisedAt)} · ${item.onHand - intake.quantity} on hand`,
      apply: (action) => mutateCommerce(
        'commerce.website_intake.converted',
        action.commandId,
        commerceActionProof(action),
        (current) => convertCommerceWebsiteIntake(current, intake.id, input, commerceActionProof(action)),
      ),
    })
  }

  function advanceOrder(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed' || order.status === 'cancelled') return
    if (order.status === 'ready' && order.paymentStatus !== 'reconciled') {
      setNotice(`Reconcile ${order.id} payment before completion.`)
      return
    }
    const next: Record<'confirmed' | 'preparing' | 'ready', CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' }
    const nextStatus = next[order.status]
    // Moving an order along is the most repeated action in a shift. The reason and the
    // evidence are both knowable from the transition itself, so state them rather than
    // making the counter write them out every time — the operator can still edit either.
    const fulfilmentReason: Record<CommerceOrderStatus, string> = {
      confirmed: 'Started preparing this order.',
      preparing: 'Order is packed and ready for handoff.',
      ready: 'Customer received the order.',
      completed: 'Order closed.',
      cancelled: 'Order cancelled.',
    }
    const displayReference = commerceOrderDisplayReference(order.id)
    queueAction({
      kind: 'order_status',
      subjectId: orderId,
      summary: `Advance ${displayReference} fulfilment`,
      before: order.status,
      after: nextStatus,
      reasonSuggestion: fulfilmentReason[order.status],
      evidenceReferenceSuggestion: `Order ${displayReference}`,
      apply: (action) => mutateCommerce('commerce.order.advanced', action.commandId, commerceActionProof(action), (current) => advanceCommerceOrder(current, orderId, order.status, commerceActionProof(action), managedIdentity ? 'managed-server' : 'client')),
    })
  }

  function reconcilePayment(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'cancelled') return
    if (order.paymentStatus === 'reconciled') {
      setNotice(`${order.id} payment is already reconciled.`)
      return
    }
    // The other action a counter repeats all day. Naming the method in the reason is more
    // useful than a blank box, and the reference is the order it settles.
    const paymentReference = commerceOrderDisplayReference(order.id)
    queueAction({
      kind: 'payment_reconcile',
      subjectId: orderId,
      summary: `Reconcile ${paymentReference} payment`,
      before: `${order.payment} · ${order.paymentStatus}`,
      after: `${order.payment} · reconciled`,
      reasonSuggestion: `${order.payment} payment received and matched.`,
      evidenceReferenceSuggestion: `Order ${paymentReference}`,
      apply: (action) => mutateCommerce('commerce.payment.reconciled', action.commandId, commerceActionProof(action), (current) => reconcileCommercePayment(current, orderId, commerceActionProof(action))),
    })
  }

  function settleSale(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed' || order.status === 'cancelled') return
    if (order.paymentStatus !== 'pending') {
      setNotice(`${order.id} payment is already reconciled. Advance fulfilment instead.`)
      return
    }
    // The everyday counter outcome — the customer paid and took the order — as ONE
    // reviewed action. #355's explicit lifecycle is preserved: the counter still only
    // creates orders, and payment reconciliation and each fulfilment step remain the
    // same recorded state transitions they always were. This composes them inside a
    // single atomic, crash-safe write (one command, one recovery intent) instead of
    // four separate confirmations. Each inner step carries a derived actionId because
    // every recorded transition must stay individually attributable and unique.
    const displayReference = commerceOrderDisplayReference(order.id)
    queueAction({
      kind: 'order_settle',
      subjectId: orderId,
      summary: `Settle ${displayReference} · paid and handed over`,
      before: `${order.payment} · ${order.paymentStatus} · ${order.status}`,
      after: `${order.payment} · reconciled · completed`,
      reasonSuggestion: `${order.payment} received and the customer took the order.`,
      evidenceReferenceSuggestion: `Order ${displayReference}`,
      apply: (action) => {
        const proof = commerceActionProof(action)
        const lane = managedIdentity ? 'managed-server' : 'client'
        return mutateCommerce('commerce.payment.reconciled', action.commandId, proof, (current) => {
          let state = reconcileCommercePayment(current, orderId, proof)
          if (!state) return null
          for (let step = 0; step < 3; step += 1) {
            const live = state.orders.find((candidate) => candidate.id === orderId)
            if (!live || live.status === 'cancelled') return null
            if (live.status === 'completed') return state
            const stepStatus = live.status
            const advanced = advanceCommerceOrder(state, orderId, stepStatus, { ...proof, actionId: `${proof.actionId}:advance-${stepStatus}` }, lane)
            if (!advanced) return null
            state = advanced
          }
          const settled = state.orders.find((candidate) => candidate.id === orderId)
          return settled?.status === 'completed' ? state : null
        })
      },
    })
  }

  function recordCollectionContact(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'cancelled' || order.paymentStatus !== 'pending') {
      setNotice('Only a pending, active customer balance can receive a collection note.')
      return
    }
    const dueAt = order.paymentDueAt ?? order.promisedAt ?? order.createdAt
    queueAction({
      kind: 'collection_contact',
      subjectId: orderId,
      summary: `Record customer follow-up for ${order.id}`,
      before: `${order.customer} · ${formatMoney(order.total)} pending · due ${formatTime(dueAt)} · ${order.collectionActions?.length ?? 0} prior notes`,
      after: 'Append an attributable contact note · no message sent · no payment changed',
      reasonSuggestion: 'Customer payment follow-up recorded.',
      apply: (action) => mutateCommerce(
        'commerce.collection_action.recorded',
        action.commandId,
        commerceActionProof(action),
        (current) => recordCommerceCollectionAction(current, orderId, commerceActionProof(action)),
      ),
    })
  }

  function settleRefund(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.refundStatus !== 'due') {
      setNotice('Only a refund currently marked due can be recorded as settled.')
      return
    }
    queueAction({
      kind: 'refund_settle',
      subjectId: orderId,
      summary: `Record ${order.id} refund settlement`,
      before: 'refund due',
      after: 'refund settled · external provider evidence recorded · no money sent',
      apply: (action) => mutateCommerce(
        'commerce.refund.settled',
        action.commandId,
        commerceActionProof(action),
        (current) => settleCommerceRefund(current, orderId, commerceActionProof(action)),
      ),
    })
  }

  function canReturnOrder(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    return Boolean(order?.completion && commerceOrderReturnLines(order).some((line) => (
      commerceOrderReturnExpectation(commerce, orderId, line.sku, 'not_restocked')
    )))
  }

  function openReturnEditor(orderId: string) {
    if (pendingAction || correctionDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) {
      setNotice('Finish or cancel the current Shop help action before recording a return.')
      return
    }
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    const line = order?.completion
      ? commerceOrderReturnLines(order).find((candidate) => (
          commerceOrderReturnExpectation(commerce, orderId, candidate.sku, 'not_restocked')
        ))
      : undefined
    if (!order || order.status !== 'completed' || !line) {
      setNotice(order?.status === 'completed' && !order.completion
        ? `${order.id} predates attributable completion records, so its return workflow is read-only.`
        : 'This order has no proven sold quantity left to return.')
      return
    }
    setReturnDraft((current) => current?.orderId === orderId && current.sku === line.sku
      ? current
      : { orderId, sku: line.sku, quantity: '1', disposition: 'restock' })
    requestAnimationFrame(() => returnEditorRef.current?.querySelector<HTMLElement>('#order-return-quantity')?.focus())
  }

  function cancelReturnEditor() {
    const orderId = returnDraft?.orderId
    setReturnDraft(null)
    setNotice('Return draft closed. Shop data was not modified.')
    requestAnimationFrame(() => orderId && returnTriggerRefs.current.get(orderId)?.focus())
  }

  function reviewOrderReturn(event: FormEvent) {
    event.preventDefault()
    if (!returnDraft || !returnDraftOrder || !selectedReturnLine || returnDraft.sku !== selectedReturnLine.sku || returnQuantityResult === null) {
      setNotice('Choose an order item and a whole return quantity within the remaining sold quantity.')
      return
    }
    if (returnDraft.sourceIntent && returnDraftOrder.returns?.some((record) => record.evidenceReference === returnDraft.sourceIntent?.evidenceReference)) {
      setReturnDraft(null)
      setNotice('This Ecommerce return request already has Shop evidence. No second return was queued.')
      return
    }
    const expected = returnReviewExpectation
    if (!expected || returnQuantityResult > expected.soldQuantity - expected.returnedQuantity) {
      setNotice('The order or its remaining return quantity changed. Review the latest order record.')
      return
    }
    const item = commerce.items.find((candidate) => candidate.sku === returnDraft.sku)
    if (!item) {
      setNotice('The returned item is no longer in the Shop catalog. Nothing was queued.')
      return
    }
    const nextReturned = expected.returnedQuantity + returnQuantityResult
    const dispositionAfter = returnDraft.disposition === 'restock'
      ? `${item.onHand} → ${item.onHand + returnQuantityResult} sellable units${returnLocationPreview ? ` · ${returnLocationPreview}` : ''}`
      : `${item.onHand} sellable units unchanged · item not restocked`
    const input = {
      orderId: returnDraft.orderId,
      sku: returnDraft.sku,
      quantity: returnQuantityResult,
      disposition: returnDraft.disposition,
    } as const
    queueAction({
      kind: 'order_return',
      subjectId: `${input.orderId}:${input.sku}`,
      summary: `Record ${input.quantity} ${input.sku} returned from ${input.orderId}`,
      before: `${expected.returnedQuantity} of ${expected.soldQuantity} returned · ${item.onHand} sellable units`,
      after: `${nextReturned} of ${expected.soldQuantity} returned · ${dispositionAfter} · payment and order total unchanged`,
      reasonSuggestion: returnDraft.sourceIntent
        ? `Customer requested return review: ${returnDraft.sourceIntent.reason}`
        : 'Reviewed the received return and its stock condition.',
      evidenceReferenceSuggestion: returnDraft.sourceIntent?.evidenceReference,
      evidenceReferenceLocked: Boolean(returnDraft.sourceIntent),
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce(
          'commerce.order.return_recorded',
          action.commandId,
          proof,
          (current) => {
            const latestOrder = current.orders.find((candidate) => candidate.id === input.orderId)
            if (returnDraft.sourceIntent && latestOrder?.returns?.some((record) => record.evidenceReference === returnDraft.sourceIntent?.evidenceReference)) return null
            return recordCommerceOrderReturn(current, input, proof, expected)
          },
        )
        setReturnDraft(null)
      },
    }, returnTriggerRefs.current.get(input.orderId))
  }

  function reviewSupportCaseOpen(event: FormEvent) {
    event.preventDefault()
    if (!supportDraft) return
    const intent = supportDraft.intent
    const sourceOrder = commerce.orders.find((order) => order.id === intent.orderId)
    if (sourceOrder?.supportCases?.some((supportCase) => supportCase.sourceIntentId === intent.id)) {
      setSupportDraft(null)
      setNotice('This Ecommerce help request already has a Shop case. No second case was queued.')
      return
    }
    const dueAt = new Date(supportDraft.dueAt)
    const owner = supportDraft.owner.trim()
    const expected = commerceOrderSupportOpenExpectation(commerce, intent.orderId, intent.id)
    if (!expected) {
      setSupportDraft(null)
      setNotice('This help request was already handled or its Shop order changed. Nothing was queued.')
      return
    }
    if (!owner || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= purchaseOrderClock) {
      setNotice('Choose one accountable owner and a future due time for this support case.')
      return
    }
    const input = {
      orderId: intent.orderId,
      sourceIntentId: intent.id,
      sourceRequestId: intent.sourceRequestId,
      customerRequestedAt: intent.createdAt,
      category: intent.category,
      customerDescription: intent.description,
      priority: supportDraft.priority,
      owner,
      dueAt: dueAt.toISOString(),
      externalMessageSent: false,
      refundStarted: false,
    } as const
    queueAction({
      kind: 'order_support_open',
      subjectId: `${input.orderId}:${input.sourceIntentId}`,
      summary: `Open support case for ${input.orderId}`,
      before: `${input.category.replaceAll('_', ' ')} request waiting for Shop review`,
      after: `${input.priority} · owner ${input.owner} · due ${formatTime(input.dueAt)} · no message or refund sent`,
      reasonSuggestion: `Customer requested help: ${input.customerDescription}`,
      evidenceReferenceSuggestion: intent.evidenceReference,
      evidenceReferenceLocked: true,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce(
          'commerce.order.support_case_opened',
          action.commandId,
          proof,
          (current) => {
            const latestOrder = current.orders.find((order) => order.id === input.orderId)
            if (latestOrder?.supportCases?.some((supportCase) => supportCase.sourceIntentId === input.sourceIntentId)) return null
            return recordCommerceOrderSupportCase(current, input, proof, expected)
          },
        )
        setSupportDraft(null)
      },
    })
  }

  function openSupportResolution(orderId: string, caseId: string) {
    if (pendingAction || returnDraft || correctionDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) {
      setNotice('Finish or close the current Shop action before resolving a support case.')
      return
    }
    if (!commerceOrderSupportResolveExpectation(commerce, orderId, caseId)) {
      setNotice('This support case is not open or changed before review.')
      return
    }
    setSupportResolutionDraft({ orderId, caseId, outcome: 'information_provided', note: '' })
    requestAnimationFrame(() => document.getElementById(`support-resolution-${caseId}`)?.focus())
  }

  function openSupportReopen(orderId: string, caseId: string) {
    if (pendingAction || returnDraft || correctionDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) {
      setNotice('Finish or close the current Shop action before reopening a support case.')
      return
    }
    const expected = commerceOrderSupportReopenExpectation(commerce, orderId, caseId)
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === caseId)
    const service = supportCase ? commerceSupportServiceState(supportCase) : null
    if (!expected || !supportCase?.resolution || !service) {
      setNotice('Only one resolved, attributable support case can enter follow-up review.')
      return
    }
    setSupportReopenDraft({
      orderId,
      caseId,
      sourceResolutionActionId: supportCase.resolution.proof.actionId,
      priority: service.priority,
      owner: service.owner,
      dueAt: localDateTimeInputValue(new Date(purchaseOrderClock + 4 * 60 * 60 * 1000)),
      note: '',
    })
    requestAnimationFrame(() => document.getElementById(`support-reopen-${caseId}`)?.focus())
  }

  function reviewSupportReopen(event: FormEvent) {
    event.preventDefault()
    if (!supportReopenDraft) return
    const expected = commerceOrderSupportReopenExpectation(
      commerce,
      supportReopenDraft.orderId,
      supportReopenDraft.caseId,
    )
    const owner = supportReopenDraft.owner.trim()
    const note = supportReopenDraft.note.trim()
    const dueAt = new Date(supportReopenDraft.dueAt)
    if (!expected || !owner || !note || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= purchaseOrderClock) {
      setNotice('Choose one accountable owner, a future due time, and the linked follow-up reason.')
      return
    }
    const input = {
      orderId: supportReopenDraft.orderId,
      caseId: supportReopenDraft.caseId,
      sourceResolutionActionId: supportReopenDraft.sourceResolutionActionId,
      priority: supportReopenDraft.priority,
      owner,
      dueAt: dueAt.toISOString(),
      note,
    }
    queueAction({
      kind: 'order_support_reopen',
      subjectId: `${input.orderId}:${input.caseId}`,
      summary: `Reopen ${input.caseId}`,
      before: `Resolved by action ${input.sourceResolutionActionId}`,
      after: `${input.priority} · owner ${input.owner} · due ${formatTime(input.dueAt)} · original resolution retained`,
      reasonSuggestion: input.note,
      evidenceReferenceSuggestion: `SUPPORT-REOPEN:${input.caseId}:${input.sourceResolutionActionId}`,
      evidenceReferenceLocked: true,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce(
          'commerce.order.support_case_reopened',
          action.commandId,
          proof,
          (current) => reopenCommerceOrderSupportCase(current, input, proof, expected),
        )
        setSupportReopenDraft(null)
      },
    })
  }

  function openSupportService(orderId: string, caseId: string, kind: CommerceSupportServiceEventKind) {
    if (pendingAction || returnDraft || correctionDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) {
      setNotice('Finish or close the current Shop action before changing support responsibility.')
      return
    }
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === caseId)
    const service = supportCase ? commerceSupportServiceState(supportCase) : null
    const checkpoints = supportCase ? commerceSupportCheckpointState(supportCase) : null
    if (!supportCase || !service || !commerceOrderSupportServiceExpectation(commerce, orderId, caseId)) {
      setNotice('This support case is resolved, untriaged, or changed before review.')
      return
    }
    if (kind === 'acknowledged' && (checkpoints?.acknowledged || checkpoints?.firstResponseReady)) {
      setNotice('This support case already has immutable acknowledgement evidence.')
      return
    }
    if (kind === 'first_response_ready' && (!checkpoints?.acknowledged || checkpoints.firstResponseReady)) {
      setNotice(checkpoints?.firstResponseReady ? 'This support case already has first-response evidence.' : 'Acknowledge this support case before preparing its first response.')
      return
    }
    const currentPriorityIndex = commerceSupportPriorityOrder.indexOf(service.priority)
    let priority = service.priority
    let dueAt = service.dueAt
    if (kind === 'escalated') {
      if (currentPriorityIndex > 0) priority = commerceSupportPriorityOrder[currentPriorityIndex - 1]
      else {
        const currentDueTime = Date.parse(service.dueAt)
        if (!Number.isFinite(currentDueTime) || currentDueTime <= purchaseOrderClock + 60_000) {
          setNotice('This urgent case has no earlier future due time available. Resolve or reassign it instead.')
          return
        }
        dueAt = new Date(purchaseOrderClock + Math.max(60_000, Math.floor((currentDueTime - purchaseOrderClock) / 2))).toISOString()
      }
    }
    setSupportServiceDraft({
      orderId,
      caseId,
      kind,
      owner: service.owner,
      priority,
      dueAt: localDateTimeInputValue(new Date(dueAt)),
      note: '',
    })
    requestAnimationFrame(() => document.getElementById(`support-service-${caseId}`)?.focus())
  }

  function reviewSupportService(event: FormEvent) {
    event.preventDefault()
    if (!supportServiceDraft) return
    const expected = commerceOrderSupportServiceExpectation(
      commerce,
      supportServiceDraft.orderId,
      supportServiceDraft.caseId,
    )
    const order = commerce.orders.find((candidate) => candidate.id === supportServiceDraft.orderId)
    const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === supportServiceDraft.caseId)
    const service = supportCase ? commerceSupportServiceState(supportCase) : null
    const checkpoints = supportCase ? commerceSupportCheckpointState(supportCase) : null
    const dueAt = new Date(supportServiceDraft.dueAt)
    const owner = supportServiceDraft.owner.trim()
    const note = supportServiceDraft.note.trim()
    if (!expected || !service || !checkpoints) {
      setSupportServiceDraft(null)
      setNotice('This support case changed before review. Nothing was queued.')
      return
    }
    if (!owner || !note || Number.isNaN(dueAt.getTime())) {
      setNotice('Record one accountable owner and the reason for this support action.')
      return
    }
    const dueChanged = supportServiceDraft.dueAt !== localDateTimeInputValue(new Date(service.dueAt))
    const canonicalDueAt = supportServiceDraft.kind === 'escalated' && dueChanged ? dueAt.toISOString() : service.dueAt
    const previousPriority = commerceSupportPriorityOrder.indexOf(service.priority)
    const nextPriority = commerceSupportPriorityOrder.indexOf(supportServiceDraft.priority)
    if (supportServiceDraft.kind === 'reassigned') {
      if (owner === service.owner || supportServiceDraft.priority !== service.priority || canonicalDueAt !== service.dueAt) {
        setNotice('Reassignment changes only the owner. Use escalation to tighten priority or due time.')
        return
      }
    } else if (supportServiceDraft.kind === 'escalated') {
      if (owner !== service.owner
        || nextPriority > previousPriority
        || Date.parse(canonicalDueAt) > Date.parse(service.dueAt)
        || (nextPriority === previousPriority && canonicalDueAt === service.dueAt)
        || (canonicalDueAt !== service.dueAt && Date.parse(canonicalDueAt) <= purchaseOrderClock)) {
        setNotice('Escalation keeps the owner and must raise priority or bring a future due time forward.')
        return
      }
    } else if (supportServiceDraft.kind === 'acknowledged') {
      if (checkpoints.acknowledged || checkpoints.firstResponseReady
        || owner !== service.owner
        || supportServiceDraft.priority !== service.priority
        || canonicalDueAt !== service.dueAt) {
        setNotice('Acknowledgement records the current owner, priority, and due time exactly once.')
        return
      }
    } else if (!checkpoints.acknowledged || checkpoints.firstResponseReady
      || owner !== service.owner
      || supportServiceDraft.priority !== service.priority
      || canonicalDueAt !== service.dueAt) {
      setNotice('First response must follow acknowledgement and preserve the current service responsibility.')
      return
    }
    const input = {
      orderId: supportServiceDraft.orderId,
      caseId: supportServiceDraft.caseId,
      kind: supportServiceDraft.kind,
      owner,
      priority: supportServiceDraft.priority,
      dueAt: canonicalDueAt,
      note,
    }
    const actionLabel = input.kind === 'reassigned'
      ? 'Reassign'
      : input.kind === 'escalated'
        ? 'Escalate'
        : input.kind === 'acknowledged'
          ? 'Acknowledge'
          : 'Record first response ready'
    queueAction({
      kind: 'order_support_service',
      subjectId: `${input.orderId}:${input.caseId}`,
      summary: `${actionLabel} ${input.caseId}`,
      before: `${service.priority} · ${service.owner} · due ${formatTime(service.dueAt)}`,
      after: input.kind === 'acknowledged'
        ? `${input.owner} acknowledged internally · no customer message sent`
        : input.kind === 'first_response_ready'
          ? 'First response ready for independent delivery · no customer message sent'
          : `${input.priority} · ${input.owner} · due ${formatTime(input.dueAt)} · no external action`,
      reasonSuggestion: input.note,
      evidenceReferenceSuggestion: `SUPPORT-SERVICE:${input.caseId}`,
      evidenceReferenceLocked: true,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce(
          'commerce.order.support_case_service_recorded',
          action.commandId,
          proof,
          (current) => recordCommerceOrderSupportServiceEvent(current, input, proof, expected),
        )
        setSupportServiceDraft(null)
      },
    })
  }

  function reviewSupportCaseResolution(event: FormEvent) {
    event.preventDefault()
    if (!supportResolutionDraft) return
    const expected = commerceOrderSupportResolveExpectation(
      commerce,
      supportResolutionDraft.orderId,
      supportResolutionDraft.caseId,
    )
    if (!expected || !supportResolutionDraft.note.trim()) {
      setNotice('Add the reviewed outcome note for one open support case.')
      return
    }
    const input = {
      orderId: supportResolutionDraft.orderId,
      caseId: supportResolutionDraft.caseId,
      outcome: supportResolutionDraft.outcome,
      note: supportResolutionDraft.note.trim(),
    }
    queueAction({
      kind: 'order_support_resolve',
      subjectId: `${input.orderId}:${input.caseId}`,
      summary: `Resolve ${input.caseId}`,
      before: 'Support case open',
      after: `${input.outcome.replaceAll('_', ' ')} · no external action performed`,
      reasonSuggestion: input.note,
      evidenceReferenceSuggestion: `SUPPORT-RESOLUTION:${input.caseId}`,
      evidenceReferenceLocked: true,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce(
          'commerce.order.support_case_resolved',
          action.commandId,
          proof,
          (current) => resolveCommerceOrderSupportCase(current, input, proof, expected),
        )
        setSupportResolutionDraft(null)
      },
    })
  }

  function canCorrectOrder(orderId: string) {
    return Boolean(commerceOrderCorrectionExpectation(commerce, orderId))
  }

  function openCorrectionEditor(orderId: string) {
    if (pendingAction || returnDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) {
      setNotice('Finish or close the current Shop action before recording a correction.')
      return
    }
    const expectation = commerceOrderCorrectionExpectation(commerce, orderId)
    if (!expectation) {
      setNotice('Corrections require an unclosed, calculated, reconciled, completed order.')
      return
    }
    setCorrectionDraft((current) => current?.orderId === orderId
      ? current
      : { orderId, kind: 'credit', reasonCode: 'pricing_error', listedAmountMmk: '' })
    requestAnimationFrame(() => correctionEditorRef.current?.querySelector<HTMLElement>('#order-correction-amount')?.focus())
  }

  // S3 PR2: a points redemption is the correction editor in a locked shape —
  // credit/other, amount = points (1 point = 1 MMK before tax) — plus a
  // redemption row written next to the loyalty settings after the correction
  // lands (shop-loyalty.ts module header).
  function openRedemptionEditor(orderId: string) {
    if (pendingAction || returnDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) {
      setNotice('Finish or close the current Shop action before redeeming points.')
      return
    }
    const expectation = commerceOrderCorrectionExpectation(commerce, orderId)
    const customer = commerce.orders.find((order) => order.id === orderId)?.customer.trim() ?? ''
    const availablePoints = shopLoyaltyDisplayPoints(shopLoyaltyPoints?.get(customer) ?? 0)
    if (!expectation || !shopLoyaltySettings?.enabled || !customer || customer === 'Guest' || availablePoints < 1) {
      setNotice('Redeeming points needs an unclosed completed order for a named customer with a positive points balance.')
      return
    }
    setCorrectionDraft((current) => current?.orderId === orderId
      ? current
      : { orderId, kind: 'credit', reasonCode: 'other', listedAmountMmk: '', loyalty: { customer } })
    requestAnimationFrame(() => correctionEditorRef.current?.querySelector<HTMLElement>('#order-correction-amount')?.focus())
  }

  function cancelCorrectionEditor() {
    const orderId = correctionDraft?.orderId
    setCorrectionDraft(null)
    setNotice('Correction draft closed. Shop data was not modified.')
    requestAnimationFrame(() => orderId && correctionTriggerRefs.current.get(orderId)?.focus())
  }

  function reviewOrderCorrection(event: FormEvent) {
    event.preventDefault()
    if (!correctionDraft || !correctionDraftOrder || !correctionCalculation || !correctionReviewExpectation) {
      setNotice('Enter a positive whole MMK amount on an eligible completed order.')
      return
    }
    const balanceAfter = correctionReviewExpectation.currentBalanceMmk
      + (correctionDraft.kind === 'debit' ? correctionCalculation.totalMmk : -correctionCalculation.totalMmk)
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) {
      setNotice('A credit cannot exceed the order’s current corrected balance.')
      return
    }
    const sourceIntent = correctionDraft.sourceIntent
    if (sourceIntent && (correctionDraftOrder.sourceRecordId !== sourceIntent.sourceRequestId
      || correctionDraftOrder.paymentStatus !== sourceIntent.paymentStatus
      || correctionDraftOrder.refundStatus !== sourceIntent.refundStatus
      || correctionReviewExpectation.sourceCalculationDigest !== sourceIntent.sourceCalculationDigest
      || correctionReviewExpectation.correctionCount !== sourceIntent.sourceCorrectionCount
      || correctionReviewExpectation.currentBalanceMmk !== sourceIntent.originalBalanceMmk
      || correctionDraft.kind !== sourceIntent.requestedKind
      || correctionDraft.reasonCode !== sourceIntent.reasonCode
      || correctionCalculation.listedAmountMmk !== sourceIntent.listedAmountMmk)) {
      setCorrectionDraft(null)
      setNotice(`${sourceIntent.id} no longer matches the current Shop correction review. Nothing was prepared.`)
      return
    }
    const loyaltyRedemption = correctionDraft.loyalty
    if (loyaltyRedemption) {
      // S3 PR2 gate at review time: a redemption stays a credit/other note for
      // the order's own customer, within the points they currently hold. The
      // same gate re-runs structurally inside redeemShopLoyaltyPoints at apply
      // time against the then-current state.
      const availablePoints = shopLoyaltyDisplayPoints(shopLoyaltyPoints?.get(loyaltyRedemption.customer) ?? 0)
      if (correctionDraft.kind !== 'credit'
        || correctionDraft.reasonCode !== 'other'
        || correctionDraftOrder.customer.trim() !== loyaltyRedemption.customer
        || correctionCalculation.listedAmountMmk > availablePoints) {
        setNotice(`Points redemption must stay a credit within ${loyaltyRedemption.customer}’s ${availablePoints.toLocaleString()} available points.`)
        return
      }
    }
    const input = {
      orderId: correctionDraft.orderId,
      kind: correctionDraft.kind,
      reasonCode: correctionDraft.reasonCode,
      listedAmountMmk: correctionCalculation.listedAmountMmk,
    } as const
    queueAction({
      kind: 'order_correction',
      subjectId: input.orderId,
      // The prefix IS the spend record: the projection recognises this
      // correction as redeemed points from its actionId alone (shop-loyalty.ts
      // module header) — one atomic commerce write, nothing else to persist.
      ...(loyaltyRedemption ? { actionIdPrefix: SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX } : {}),
      summary: loyaltyRedemption
        ? `Redeem ${input.listedAmountMmk.toLocaleString()} points for ${loyaltyRedemption.customer}`
        : `Record ${input.kind} note for ${input.orderId}`,
      ...(sourceIntent ? {
        reasonSuggestion: sourceIntent.reason.slice(0, 180),
        evidenceReferenceSuggestion: sourceIntent.evidenceReference,
        evidenceReferenceLocked: true,
      } : loyaltyRedemption ? {
        reasonSuggestion: `Redeem ${input.listedAmountMmk.toLocaleString()} customer points as a credit note (1 point = 1 MMK).`,
        evidenceReferenceSuggestion: `Points redemption · ${input.orderId}`,
      } : {}),
      before: loyaltyRedemption
        ? `${loyaltyRedemption.customer} holds ${shopLoyaltyDisplayPoints(shopLoyaltyPoints?.get(loyaltyRedemption.customer) ?? 0).toLocaleString()} points · corrected balance ${formatMoney(correctionReviewExpectation.currentBalanceMmk)}`
        : `Original invoice preserved · corrected balance ${formatMoney(correctionReviewExpectation.currentBalanceMmk)}`,
      after: `${loyaltyRedemption ? `${input.listedAmountMmk.toLocaleString()} points spent · ` : ''}${input.kind} ${formatMoney(correctionCalculation.totalMmk)} · corrected balance ${formatMoney(balanceAfter)} · external posting not performed`,
      apply: async (action) => {
        if (sourceIntent) {
          const { readEcommerceBuyingState } = await import('../products/ecommerce/ecommerce-buying-lifecycle')
          const recovered = await readEcommerceBuyingState(ecommerceBuyingScope)
          const storedIntent = recovered.state?.correctionIntents.find((candidate) => candidate.id === sourceIntent.id)
          if (recovered.status !== 'ready' || !storedIntent || JSON.stringify(storedIntent) !== JSON.stringify(sourceIntent)) {
            throw new ShopReviewRequiredError(`${sourceIntent.id} recovery changed during review. No correction was recorded.`)
          }
        }
        const proof = commerceActionProof(action)
        // S3 PR2: the correction IS the spend (its actionId carries the
        // redemption prefix — see queueAction above), so the redemption is
        // ONE atomic commerce write: a refused correction spends nothing, a
        // landed one is subtracted by the projection from state alone, on
        // every device the state syncs to. This re-check guards the gap
        // between review and apply — the balance the operator saw may have
        // changed underneath the review dialog.
        if (loyaltyRedemption && !shopLoyaltyRedemptionAllowed(
          readShopLoyaltySettings(shopLoyaltyScopeForWorkspace(managedIdentity?.workspaceId)),
          commerceRef.current,
          { customer: loyaltyRedemption.customer, orderId: input.orderId, points: input.listedAmountMmk },
        )) {
          throw new ShopReviewRequiredError(`${loyaltyRedemption.customer}’s points balance changed during review. No credit was recorded and no points were spent.`)
        }
        await mutateCommerce(
          'commerce.order.correction_recorded',
          action.commandId,
          proof,
          (current) => recordCommerceOrderCorrection(current, input, proof, correctionReviewExpectation),
        )
        setCorrectionDraft(null)
      },
    }, correctionTriggerRefs.current.get(input.orderId))
  }

  function keepOrderFromCancellation() {
    if (!cancellationDraft) return
    if (!ecommerceCancellationMatchesCurrentShop(commerce, cancellationDraft)) {
      setCancellationDraft(null)
      setNotice(`${cancellationDraft.id} no longer matches the current Shop order. Nothing changed.`)
      return
    }
    const sourceIntent = cancellationDraft
    queueAction({
      kind: 'order_cancellation_review',
      subjectId: sourceIntent.orderId,
      summary: `Decline ${sourceIntent.id} and keep ${sourceIntent.orderId}`,
      before: `${sourceIntent.orderStatus} · cancellation waiting · ${sourceIntent.reasonCode.replaceAll('_', ' ')}`,
      after: `${sourceIntent.orderStatus} · order and stock unchanged · customer decision receipt saved locally`,
      reasonSuggestion: `Keep the reviewed order active: ${sourceIntent.reason}`.slice(0, 180),
      evidenceReferenceSuggestion: sourceIntent.evidenceReference,
      evidenceReferenceLocked: true,
      apply: async (action) => {
        const currentCommerce = commerceRef.current
        if (!ecommerceCancellationMatchesCurrentShop(currentCommerce, sourceIntent)) {
          setCancellationDraft(null)
          throw new ShopReviewRequiredError(`${sourceIntent.id} changed during review. No decision was saved and the order was not changed; reopen the current request.`)
        }
        const lifecycle = await import('../products/ecommerce/ecommerce-buying-lifecycle')
        const recovered = await lifecycle.readEcommerceBuyingState(ecommerceBuyingScope)
        if (!recovered.state || recovered.status !== 'ready') {
          throw new ShopReviewRequiredError(recovered.error || `${sourceIntent.id} recovery is unavailable. No decision was saved and the order was not changed.`)
        }
        const storedIntent = recovered.state.cancellationIntents.find((candidate) => candidate.id === sourceIntent.id)
        if (!storedIntent || JSON.stringify(storedIntent) !== JSON.stringify(sourceIntent)) {
          throw new ShopReviewRequiredError(`${sourceIntent.id} no longer matches its recovered Ecommerce request. No decision was saved and the order was not changed.`)
        }
        const decision = await lifecycle.buildEcommerceCancellationDecision({
          scope: ecommerceBuyingScope,
          commerceState: currentCommerce,
          intent: storedIntent,
          proof: commerceActionProof(action),
        })
        await lifecycle.saveEcommerceCancellationDecision(
          ecommerceBuyingScope,
          decision,
          recovered.state.headDigest,
        )
        setCancellationDraft(null)
      },
    })
  }

  async function prepareCurrentAmendmentDraft(intent: EcommerceOrderAmendmentIntent, currentCommerce: CommerceState) {
    const lifecycle = await import('../products/ecommerce/ecommerce-buying-lifecycle')
    const recovered = await lifecycle.readEcommerceBuyingState(ecommerceBuyingScope)
    if (!recovered.state || recovered.status !== 'ready') {
      throw new ShopReviewRequiredError(recovered.error || `${intent.id} recovery is unavailable. Nothing changed.`)
    }
    const storedIntent = recovered.state.amendmentIntents.find((candidate) => candidate.id === intent.id)
    const replacementRequest = recovered.state.requests.find((candidate) => candidate.id === intent.replacementRequestId)
    if (!storedIntent || JSON.stringify(storedIntent) !== JSON.stringify(intent) || !replacementRequest) {
      throw new ShopReviewRequiredError(`${intent.id} no longer matches its recovered replacement request. Nothing changed.`)
    }
    const draft = await lifecycle.prepareEcommerceShopDraftV2({
      request: replacementRequest,
      state: recovered.state,
      currentCatalog: currentCommerce.items,
      currentPromotionPolicies: currentCommerce.promotionPolicies ?? [],
      currentShippingPolicies: currentCommerce.shippingPolicies ?? [],
      currentPaymentPolicies: currentCommerce.paymentPolicies ?? [],
      currentTaxConfigurations: currentCommerce.taxConfigurations ?? [],
      catalogRevision: currentCommerce.catalogChanges?.length ?? 0,
      confirmedAt: new Date().toISOString(),
    })
    return { draft, replacementRequest }
  }

  async function prepareCurrentRescheduleDraft(intent: EcommerceOrderRescheduleIntent, currentCommerce: CommerceState) {
    const lifecycle = await import('../products/ecommerce/ecommerce-buying-lifecycle')
    const recovered = await lifecycle.readEcommerceBuyingState(ecommerceBuyingScope)
    if (!recovered.state || recovered.status !== 'ready') {
      throw new ShopReviewRequiredError(recovered.error || `${intent.id} recovery is unavailable. Nothing changed.`)
    }
    const storedIntent = recovered.state.rescheduleIntents.find((candidate) => candidate.id === intent.id)
    const replacementRequest = recovered.state.requests.find((candidate) => candidate.id === intent.replacementRequestId)
    if (!storedIntent || JSON.stringify(storedIntent) !== JSON.stringify(intent) || !replacementRequest) {
      throw new ShopReviewRequiredError(`${intent.id} no longer matches its recovered reschedule request. Nothing changed.`)
    }
    const draft = await lifecycle.prepareEcommerceShopDraftV2({
      request: replacementRequest,
      state: recovered.state,
      currentCatalog: currentCommerce.items,
      currentPromotionPolicies: currentCommerce.promotionPolicies ?? [],
      currentShippingPolicies: currentCommerce.shippingPolicies ?? [],
      currentPaymentPolicies: currentCommerce.paymentPolicies ?? [],
      currentTaxConfigurations: currentCommerce.taxConfigurations ?? [],
      catalogRevision: currentCommerce.catalogChanges?.length ?? 0,
      confirmedAt: new Date().toISOString(),
    })
    if (!ecommerceReschedulePromiseAllowed(draft, intent)) {
      throw new ShopReviewRequiredError(`${intent.id} no longer satisfies current Shop promise policy. Nothing changed.`)
    }
    return { draft, replacementRequest }
  }

  function openPreparedReplacement(intent: EcommerceOrderAmendmentIntent | EcommerceOrderRescheduleIntent, draft: EcommerceShopDraftV2, promisedAt?: string) {
    const [firstLine, ...remainingLines] = draft.lines
    if (!firstLine) throw new ShopReviewRequiredError('The replacement request has no reviewed item. Nothing was prepared.')
    setPreparedChannelDraft(null)
    setPreparedEcommerceDraft(draft)
    setCustomer(draft.customerProfile?.name ?? draft.customerReference)
    setChannel('Ecommerce')
    setSku(firstLine.sku)
    setQuantity(firstLine.quantity)
    setExtraOrderLines(remainingLines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
    setPayment(draft.pricing.payment.adapter === 'kbzpay_manual' ? 'KBZPay' : draft.pricing.payment.adapter === 'cash_on_delivery' ? 'Cash on delivery' : 'Pay on pickup')
    setFulfilment(draft.fulfilment)
    setFulfilmentReference(draft.deliveryAddress
      ? `${draft.deliveryAddress.line1} · ${draft.deliveryAddress.township} · ${draft.deliveryAddress.city}${draft.deliveryAddress.instructions ? ` · ${draft.deliveryAddress.instructions}` : ''}`
      : draft.sourceRequestId)
    setPromisedAt(promisedAt ? localDateTimeInputValue(new Date(promisedAt)) : defaultOrderPromiseInput())
    setOrderEntryMode('manual')
    setOrderDraftActive(true)
    setResumedOrderDraft(null)
    setOrderDraftConflict(false)
    setOrderAmendmentReview(null)
    setOrderRescheduleReview(null)
    setNotice(`${intent.orderId} is retained as cancelled evidence. Replacement ${draft.sourceRequestId} is repriced${promisedAt ? ` for ${formatTime(promisedAt)}` : ''} and ready for a separate accountable order confirmation.`)
    requestAnimationFrame(() => {
      const dialog = orderComposerRef.current
      if (dialog && !dialog.open) dialog.showModal()
      orderPaymentRef.current?.focus({ preventScroll: true })
    })
  }

  async function prepareOrderAmendmentReplacement() {
    if (!orderAmendmentReview) return
    const { intent } = orderAmendmentReview
    const currentCommerce = commerceRef.current
    const currentState = ecommerceOrderAmendmentShopState(currentCommerce, intent)
    if (currentState === 'stale') {
      setOrderAmendmentReview(null)
      setNotice(`${intent.id} no longer matches the current Shop order. Nothing changed.`)
      return
    }
    if (currentState === 'replacement_needed') {
      try {
        const { draft } = await prepareCurrentAmendmentDraft(intent, currentCommerce)
        openPreparedReplacement(intent, draft)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'The replacement draft could not be recovered. Nothing changed.')
      }
      return
    }
    queueAction({
      kind: 'order_cancel',
      subjectId: intent.orderId,
      summary: `Cancel ${intent.orderId} and prepare replacement ${intent.replacementRequestId}`,
      before: `${intent.orderStatus} · ${formatMoney(intent.originalTotalMmk)} · ${ecommerceOrderAmendmentSummary(intent)}`,
      after: `original cancelled · exact stock released · replacement repriced for separate confirmation · no message or provider call`,
      reasonSuggestion: intent.reason.slice(0, 180),
      evidenceReferenceSuggestion: intent.evidenceReference,
      evidenceReferenceLocked: true,
      apply: async (action) => {
        const latestCommerce = commerceRef.current
        if (ecommerceOrderAmendmentShopState(latestCommerce, intent) !== 'active') {
          setOrderAmendmentReview(null)
          throw new ShopReviewRequiredError(`${intent.id} changed during review. Nothing was cancelled; reopen the request.`)
        }
        const { draft } = await prepareCurrentAmendmentDraft(intent, latestCommerce)
        const proof = commerceActionProof(action)
        let reviewRequired = false
        try {
          await mutateCommerce('commerce.order.cancelled', action.commandId, proof, (current) => {
            if (ecommerceOrderAmendmentShopState(current, intent) !== 'active') {
              reviewRequired = true
              return null
            }
            return cancelCommerceOrder(current, intent.orderId, proof)
          })
        } catch (error) {
          if (reviewRequired) throw new ShopReviewRequiredError(`${intent.id} changed during review. Nothing was cancelled; reopen the request.`)
          throw error
        }
        if (reviewRequired) throw new ShopReviewRequiredError(`${intent.id} changed during review. Nothing was cancelled; reopen the request.`)
        openPreparedReplacement(intent, draft)
      },
    })
  }

  async function prepareOrderRescheduleReplacement() {
    if (!orderRescheduleReview) return
    const { intent } = orderRescheduleReview
    const currentCommerce = commerceRef.current
    const currentState = ecommerceOrderRescheduleShopState(currentCommerce, intent)
    if (currentState === 'stale') {
      setOrderRescheduleReview(null)
      setNotice(`${intent.id} no longer matches the current Shop order. Nothing changed.`)
      return
    }
    if (currentState === 'replacement_needed') {
      try {
        const { draft } = await prepareCurrentRescheduleDraft(intent, currentCommerce)
        openPreparedReplacement(intent, draft, intent.requestedPromisedAt)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'The rescheduled replacement draft could not be recovered. Nothing changed.')
      }
      return
    }
    queueAction({
      kind: 'order_cancel',
      subjectId: intent.orderId,
      summary: `Cancel ${intent.orderId} and prepare rescheduled replacement ${intent.replacementRequestId}`,
      before: `${intent.orderStatus} · ${formatMoney(intent.originalTotalMmk)} · promised ${formatTime(intent.originalPromisedAt)}`,
      after: `original cancelled · exact stock released · replacement repriced for ${formatTime(intent.requestedPromisedAt)} · separate confirmation · no rider, message, or provider call`,
      reasonSuggestion: intent.reason.slice(0, 180),
      evidenceReferenceSuggestion: intent.evidenceReference,
      evidenceReferenceLocked: true,
      apply: async (action) => {
        const latestCommerce = commerceRef.current
        if (ecommerceOrderRescheduleShopState(latestCommerce, intent) !== 'active') {
          setOrderRescheduleReview(null)
          throw new ShopReviewRequiredError(`${intent.id} changed during review. Nothing was cancelled; reopen the request.`)
        }
        const { draft } = await prepareCurrentRescheduleDraft(intent, latestCommerce)
        const proof = commerceActionProof(action)
        let reviewRequired = false
        try {
          await mutateCommerce('commerce.order.cancelled', action.commandId, proof, (current) => {
            if (ecommerceOrderRescheduleShopState(current, intent) !== 'active') {
              reviewRequired = true
              return null
            }
            return cancelCommerceOrder(current, intent.orderId, proof)
          })
        } catch (error) {
          if (reviewRequired) throw new ShopReviewRequiredError(`${intent.id} changed during review. Nothing was cancelled; reopen the request.`)
          throw error
        }
        if (reviewRequired) throw new ShopReviewRequiredError(`${intent.id} changed during review. Nothing was cancelled; reopen the request.`)
        openPreparedReplacement(intent, draft, intent.requestedPromisedAt)
      },
    })
  }

  function cancelOrder(orderId: string, sourceIntent?: EcommerceCancellationIntent) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed' || order.status === 'cancelled') return
    if (sourceIntent && !ecommerceCancellationMatchesCurrentShop(commerce, sourceIntent)) {
      setCancellationDraft(null)
      setNotice(`${sourceIntent.id} no longer matches the current Shop order. Nothing changed.`)
      return
    }
    if (!commerceOrderHasReleasableReservation(commerce, orderId)) return setNotice(`${order.id} has no unmatched, attributable reservation. Cancellation failed closed without changing stock.`)
    const lines = order.lines ?? (order.itemSku ? [{ sku: order.itemSku, quantity: order.quantity }] : [])
    const stockLines = lines.map((line) => {
      const item = commerce.items.find((candidate) => candidate.sku === line.sku)
      return item ? { sku: line.sku, quantity: line.quantity, onHand: item.onHand } : null
    })
    if (!lines.length || stockLines.some((line) => !line)) {
      setNotice(`${order.id} inventory references are unavailable, so cancellation failed closed.`)
      return
    }
    const paymentAfter = order.paymentStatus === 'reconciled' ? 'reconciled · refund due' : 'pending'
    queueAction({
      kind: 'order_cancel',
      subjectId: orderId,
      summary: sourceIntent ? `Approve ${sourceIntent.id} and cancel ${order.id}` : `Cancel ${order.id} and release ${lines.length} stock ${lines.length === 1 ? 'line' : 'lines'}`,
      before: `${order.status} · ${order.paymentStatus} · ${stockLines.map((line) => `${line?.sku} ${line?.onHand}`).join(', ')}${sourceIntent ? ` · request ${sourceIntent.reasonCode.replaceAll('_', ' ')}` : ''}`,
      after: `cancelled · ${paymentAfter} · ${stockLines.map((line) => `${line?.sku} ${(line?.onHand ?? 0) + (line?.quantity ?? 0)}`).join(', ')} · no customer message or provider call`,
      ...(sourceIntent ? {
        reasonSuggestion: `${sourceIntent.reasonCode.replaceAll('_', ' ')}: ${sourceIntent.reason}`.slice(0, 180),
        evidenceReferenceSuggestion: sourceIntent.evidenceReference,
        evidenceReferenceLocked: true,
      } : {}),
      apply: async (action) => {
        let reviewRequired = false
        const proof = commerceActionProof(action)
        try {
          await mutateCommerce('commerce.order.cancelled', action.commandId, proof, (current) => {
            if (sourceIntent) {
              if (!ecommerceCancellationMatchesCurrentShop(current, sourceIntent)) {
                reviewRequired = true
                return null
              }
            }
            return cancelCommerceOrder(current, orderId, proof)
          })
        } catch (error) {
          if (reviewRequired) throw new ShopReviewRequiredError(`${sourceIntent?.id ?? order.id} changed during review. Nothing was cancelled; reopen the current request.`)
          throw error
        }
        if (reviewRequired) throw new ShopReviewRequiredError(`${sourceIntent?.id ?? order.id} changed during review. Nothing was cancelled; reopen the current request.`)
        if (sourceIntent) setCancellationDraft(null)
      },
    })
  }

  function openPurchaseOrder(itemSku: string) {
    const item = commerce.items.find((candidate) => candidate.sku === itemSku)
    if (!item) return
    if (catalogEditDraft) {
      requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the catalog edit before opening a stock order. Your catalog draft was preserved.')
      return
    }
    if (stockCountDraft) {
      const selector = stockCountTargetSelected ? '#stock-count-quantity' : '#stock-count-sku'
      requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(selector)?.focus())
      setNotice('Finish or cancel the stock count before opening a stock order. Your count draft was preserved.')
      return
    }
    const active = activePurchaseOrderBySku.get(itemSku)
    const alreadyEditing = purchaseOrderDraft?.mode === 'create'
      ? purchaseOrderDraft.sku === itemSku
      : purchaseOrderDraft?.mode === 'receive'
        ? purchaseOrderDraft.purchaseOrderId === active?.purchaseOrder.id
        : false
    if (alreadyEditing) {
      requestAnimationFrame(() => purchaseOrderEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice(`Continue the ${active ? 'receipt' : 'stock order'} below. Your draft was preserved.`)
      return
    }
    const receiptDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date()).replaceAll('-', '')
    setPurchaseOrderDraft(active
      ? { mode: 'receive', purchaseOrderId: active.purchaseOrder.id, quantity: '', rejectedQuantity: '0', discrepancyCode: 'damaged', locationId: defaultReceiptLocationId, trackingCode: `IN-${receiptDate}-${commandUuid().slice(0, 8).toUpperCase()}` }
      : { mode: 'create', sku: itemSku, supplier: '', expectedAt: defaultPurchaseOrderExpectedInput(), quantity: '', unitCostMmk: '' })
    setNotice(active
      ? `Record only units counted against ${active.purchaseOrder.id}. Nothing changes until confirmation.`
      : `Create an internal order for ${item.name}. This does not contact a supplier or create a payment.`)
  }

  function openPurchaseBudgetEditor() {
    setPurchaseOrderDraft(null)
    setPurchaseBudgetDraft({
      budgetCode: `SHOP-STOCK-${new Date(purchaseOrderClock).getUTCFullYear()}`,
      label: 'Stock replenishment',
      periodEnd: localDateTimeInputValue(new Date(purchaseOrderClock + 365 * 24 * 60 * 60 * 1000)),
      ceilingMmk: '5000000',
      perRequisitionLimitMmk: '1000000',
    })
    setNotice('Set the maximum approved buying commitment. This creates internal authority only; it does not order or pay for anything.')
  }

  function reviewPurchaseBudget(event: FormEvent) {
    event.preventDefault()
    if (!purchaseBudgetDraft) return
    const budgetCode = purchaseBudgetDraft.budgetCode.trim().toUpperCase()
    const label = purchaseBudgetDraft.label.trim()
    const ceilingValue = Number(purchaseBudgetDraft.ceilingMmk)
    const perRequisitionValue = Number(purchaseBudgetDraft.perRequisitionLimitMmk)
    const ceilingMmk = Number.isSafeInteger(ceilingValue) && ceilingValue > 0 ? ceilingValue : null
    const perRequisitionLimitMmk = Number.isSafeInteger(perRequisitionValue) && perRequisitionValue > 0 ? perRequisitionValue : null
    const periodEndTime = Date.parse(purchaseBudgetDraft.periodEnd)
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(budgetCode) || !label || label.length > 120) {
      setNotice('Use a 3–40 character budget code and a short budget name.')
      return
    }
    if (ceilingMmk === null || perRequisitionLimitMmk === null || perRequisitionLimitMmk > ceilingMmk) {
      setNotice('Enter whole-MMK limits with the per-request limit no higher than the total ceiling.')
      return
    }
    if (!Number.isFinite(periodEndTime) || periodEndTime <= purchaseOrderClock) {
      setNotice('Choose a budget end later than the current time.')
      return
    }
    const envelopeId = uid('PBE')
    queueAction({
      kind: 'purchase_budget_approve',
      subjectId: envelopeId,
      summary: `Approve ${budgetCode} purchasing limits`,
      before: 'No active purchase authority · requisitions blocked',
      after: `${label} · ${formatMoney(ceilingMmk)} ceiling · ${formatMoney(perRequisitionLimitMmk)} per request · no order or payment created`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.purchase_budget.approved', action.commandId, proof, (current) => approveCommercePurchaseBudgetEnvelope(current, {
          id: envelopeId,
          budgetCode,
          label,
          periodStart: proof.capturedAt,
          periodEnd: new Date(periodEndTime).toISOString(),
          ceilingMmk,
          perRequisitionLimitMmk,
        }, proof))
        setPurchaseBudgetDraft(null)
      },
    })
  }

  function updateSupplierQuote(index: 0 | 1, field: keyof SupplierQuoteDraft, value: string) {
    setSupplierSourcingDraft((current) => {
      if (!current) return current
      const quotes: [SupplierQuoteDraft, SupplierQuoteDraft] = [{ ...current.quotes[0] }, { ...current.quotes[1] }]
      quotes[index][field] = value
      return { ...current, quotes }
    })
  }

  function reviewSupplierSourcing(event: FormEvent) {
    event.preventDefault()
    if (!supplierSourcingDraft) return
    const validUntilTime = Date.parse(supplierSourcingDraft.validUntil)
    const tolerancePercent = Number(supplierSourcingDraft.unitCostTolerancePercent)
    const deliveryToleranceDays = Number(supplierSourcingDraft.deliveryToleranceDays)
    const unitCostToleranceBasisPoints = Math.round(tolerancePercent * 100)
    const enteredQuotes = supplierSourcingDraft.quotes
      .map((quote, index) => ({ quote, index }))
      .filter(({ quote, index }) => index === 0 || [
        quote.supplier,
        quote.quoteReference,
        quote.vendorApprovalReference,
        quote.unitCostMmk,
      ].some((value) => value.trim()))
    if (!Number.isFinite(validUntilTime) || validUntilTime < purchaseOrderClock
      || !Number.isFinite(tolerancePercent) || tolerancePercent < 0 || tolerancePercent > 20
      || !Number.isSafeInteger(unitCostToleranceBasisPoints)
      || !Number.isSafeInteger(deliveryToleranceDays) || deliveryToleranceDays < 0 || deliveryToleranceDays > 30
      || !enteredQuotes.length || !enteredQuotes.some(({ index }) => index === supplierSourcingDraft.selectedIndex)) {
      setNotice('Enter a current quote, selected award, cost tolerance up to 20%, and delivery tolerance up to 30 days.')
      return
    }
    const quotes = enteredQuotes.map(({ quote }) => {
      const unitCostMmk = Number(quote.unitCostMmk)
      const deliveryTime = Date.parse(quote.deliveryAt)
      if (!quote.supplier.trim() || quote.supplier.trim().length > 120
        || !quote.quoteReference.trim() || quote.quoteReference.trim().length > 80
        || !quote.vendorApprovalReference.trim() || quote.vendorApprovalReference.trim().length > 120
        || !Number.isSafeInteger(unitCostMmk) || unitCostMmk < 1
        || !Number.isFinite(deliveryTime) || deliveryTime <= purchaseOrderClock) return null
      return {
        supplier: quote.supplier.trim(), quoteReference: quote.quoteReference.trim(),
        vendorApprovalReference: quote.vendorApprovalReference.trim(), unitCostMmk,
        deliveryAt: new Date(deliveryTime).toISOString(), validUntil: new Date(validUntilTime).toISOString(),
      }
    })
    if (quotes.some((quote) => quote === null)) {
      setNotice('Each entered quote needs supplier, quote reference, approved-vendor reference, whole-MMK cost, and future delivery.')
      return
    }
    const selectedQuoteReference = supplierSourcingDraft.quotes[supplierSourcingDraft.selectedIndex].quoteReference.trim()
    const sourcingId = uid('SSD')
    queueAction({
      kind: 'supplier_sourcing_approve',
      subjectId: sourcingId,
      summary: `Approve supplier award for ${supplierSourcingDraft.quantity.toLocaleString()} units of ${supplierSourcingDraft.itemName}`,
      before: `${quotes.length} retained ${quotes.length === 1 ? 'quote' : 'quotes'} · no supplier award or purchase authority`,
      after: `${sourcingId} · award ${selectedQuoteReference} · ${formatTaxRate(unitCostToleranceBasisPoints)} cost tolerance · ${deliveryToleranceDays}d delivery tolerance · no requisition or order created`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.supplier_sourcing.approved', action.commandId, proof, (current) => approveCommerceSupplierSourcingDecision(current, {
          id: sourcingId,
          sku: supplierSourcingDraft.sku,
          quantity: supplierSourcingDraft.quantity,
          quotes: quotes as NonNullable<(typeof quotes)[number]>[],
          selectedQuoteReference,
          unitCostToleranceBasisPoints,
          deliveryToleranceDays,
        }, proof))
        setSupplierSourcingDraft(null)
      },
    })
  }

  function startSupplierRequest() {
    const approved = openPurchaseRequisitions[0]
    if (!approved && !activePurchaseBudget) {
      openPurchaseBudgetEditor()
      return
    }
    const decision = procurementReviews.find((row) => row.sku === approved?.sku) ?? procurementReviews[0]
    const recommendation = decision ? purchaseRecommendations.find((row) => row.sku === decision.sku) : null
    const item = commerce.items.find((candidate) => candidate.sku === (approved?.sku ?? recommendation?.sku))
    if ((!approved && (!decision || !recommendation)) || !item) {
      setNotice('Replenishment is clear. Shop stock, open purchase orders, and current Plant demand are covered.')
      return
    }
    if (catalogEditDraft) {
      requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the catalog edit before starting a supplier request. Your catalog draft was preserved.')
      return
    }
    if (stockCountDraft) {
      const selector = stockCountTargetSelected ? '#stock-count-quantity' : '#stock-count-sku'
      requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(selector)?.focus())
      setNotice('Finish or cancel the stock count before starting a supplier request. Your count draft was preserved.')
      return
    }
    const recommendedOption = decision?.supplierOptions.find((option) => option.supplier === decision.recommendedSupplier)
    const policyArrivalAt = purchaseOrderClock + (recommendedOption?.leadTimeDays ?? 7) * 24 * 60 * 60 * 1000
    const earliestSafeArrival = recommendation?.earliestNeedAt
      ? new Date(Math.max(policyArrivalAt, Date.parse(recommendation.earliestNeedAt) - 24 * 60 * 60 * 1000))
      : new Date(policyArrivalAt)
    const sourcingDecision = !approved ? openSupplierSourcingDecisions.find((candidate) => (
      candidate.sku === item.sku && candidate.quantity === recommendation?.recommendedOrderUnits
    )) : null
    const selectedQuote = sourcingDecision ? commerceSupplierSourcingSelectedQuote(sourcingDecision) : null
    if (!approved && !selectedQuote) {
      const primary = recommendedOption ?? decision?.supplierOptions[0]
      const alternate = decision?.supplierOptions.find((option) => option.supplier !== primary?.supplier)
      const deliveryAt = earliestSafeArrival && Number.isFinite(earliestSafeArrival.getTime())
        ? localDateTimeInputValue(earliestSafeArrival)
        : defaultPurchaseOrderExpectedInput()
      setPurchaseOrderDraft(null)
      setSupplierSourcingDraft({
        sku: item.sku,
        itemName: item.name,
        quantity: recommendation!.recommendedOrderUnits,
        validUntil: localDateTimeInputValue(new Date(purchaseOrderClock + 30 * 24 * 60 * 60 * 1000)),
        quotes: [
          { supplier: primary?.supplier ?? '', quoteReference: '', vendorApprovalReference: primary?.supplierPolicyCommandId ?? '', unitCostMmk: String(primary?.unitCostMmk ?? ''), deliveryAt },
          { supplier: alternate?.supplier ?? '', quoteReference: '', vendorApprovalReference: alternate?.supplierPolicyCommandId ?? '', unitCostMmk: String(alternate?.unitCostMmk ?? ''), deliveryAt },
        ],
        selectedIndex: 0,
        unitCostTolerancePercent: '0',
        deliveryToleranceDays: '0',
      })
      setNotice(`Compare retained quotes for ${recommendation!.recommendedOrderUnits} ${item.name} units. Recording the award creates no requisition, order, message, or payment.`)
      return
    }
    const sourcedExpectedAt = selectedQuote?.deliveryAt
    setPurchaseOrderDraft({
      mode: 'create',
      ...(approved ? { requisitionId: approved.id } : {}),
      sku: item.sku,
      supplier: approved?.supplier ?? selectedQuote?.supplier ?? '',
      expectedAt: approved ? localDateTimeInputValue(new Date(approved.expectedAt)) : sourcedExpectedAt ? localDateTimeInputValue(new Date(sourcedExpectedAt)) : defaultPurchaseOrderExpectedInput(),
      quantity: String(approved?.quantityRequested ?? recommendation!.recommendedOrderUnits),
      unitCostMmk: String(approved?.unitCostMmk ?? selectedQuote?.unitCostMmk ?? ''),
    })
    setNotice(approved
      ? `${approved.id} is approved and ready to become one internal purchase order. A different operator must confirm the unchanged terms; nothing was sent or purchased.`
      : `${sourcingDecision!.id} awarded ${selectedQuote!.quoteReference} to ${selectedQuote!.supplier}. Review the bound terms; approval records a requisition only.`)
    requestAnimationFrame(() => purchaseOrderEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
  }

  function cancelPurchaseOrderEditor() {
    const itemSku = purchaseOrderDraft?.mode === 'create'
      ? purchaseOrderDraft.sku
      : purchaseOrderDraftOrder?.purchaseOrder.sku
    setPurchaseOrderDraft(null)
    setNotice('Stock order editing closed. Shop data was not modified.')
    requestAnimationFrame(() => {
      if (itemSku) purchaseOrderTriggerRefs.current.get(itemSku)?.focus()
    })
  }

  function reviewPurchaseOrder(event: FormEvent) {
    event.preventDefault()
    if (!purchaseOrderDraft || !purchaseOrderDraftItem || purchaseOrderQuantityResult === null || !purchaseReceiptDiscrepancyReady) {
      setNotice('Enter a positive whole-unit quantity within the available order balance.')
      return
    }

    if (purchaseOrderDraft.mode === 'create') {
      const supplier = purchaseOrderDraft.supplier.trim()
      if (!supplier || supplier.length > 120) {
        setNotice('Enter a supplier reference of 120 characters or fewer.')
        return
      }
      const expectedAtTime = new Date(purchaseOrderDraft.expectedAt).getTime()
      if (!Number.isFinite(expectedAtTime) || expectedAtTime <= purchaseOrderClock) {
        setNotice('Choose an expected arrival later than the current time.')
        return
      }
      if (purchaseOrderUnitCostResult === null || purchaseOrderDraftTotal === null) {
        setNotice('Enter a positive whole-MMK unit cost within the supported total range.')
        return
      }
      const expectedAt = new Date(expectedAtTime).toISOString()
      const item = purchaseOrderDraftItem
      const quantityOrdered = purchaseOrderQuantityResult
      if (!purchaseOrderDraft.requisitionId) {
        const sourcingDecision = openSupplierSourcingDecisions.find((candidate) => (
          candidate.sku === item.sku && candidate.quantity === quantityOrdered
        ))
        const selectedQuote = sourcingDecision ? commerceSupplierSourcingSelectedQuote(sourcingDecision) : null
        if (!sourcingDecision || !selectedQuote) {
          setNotice('Approve a current supplier quote comparison before approving this requisition.')
          startSupplierRequest()
          return
        }
        if (!activePurchaseBudget || !activePurchaseBudgetCommitment) {
          setNotice('Approve an active buying limit before approving a new requisition.')
          openPurchaseBudgetEditor()
          return
        }
        if (purchaseOrderDraftTotal > activePurchaseBudget.perRequisitionLimitMmk || purchaseOrderDraftTotal > activePurchaseBudgetCommitment.availableMmk) {
          setNotice(`This request exceeds ${activePurchaseBudget.budgetCode}. Reduce it or approve a later non-overlapping budget.`)
          return
        }
        const decision = procurementReviews.find((row) => row.sku === item.sku)
        if (!decision) {
          setNotice('The procurement decision changed. Reopen the requisition before approval.')
          return
        }
        const requisitionId = uid('PR')
        queueAction({
          kind: 'purchase_requisition_approve',
          subjectId: requisitionId,
          summary: `Approve requisition for ${quantityOrdered.toLocaleString()} units of ${item.name}`,
          before: `${item.onHand.toLocaleString()} on hand · recommendation only · no purchase authority`,
          after: `${requisitionId} · ${sourcingDecision.id}/${selectedQuote.quoteReference} · ${supplier} · ${quantityOrdered.toLocaleString()} at ${formatMoney(purchaseOrderUnitCostResult)} each · ${formatMoney(purchaseOrderDraftTotal)} exposure · purchase order not created`,
          apply: async (action) => {
            const proof = commerceActionProof(action)
            await mutateCommerce('commerce.purchase_requisition.approved', action.commandId, proof, (current) => approveCommercePurchaseRequisition(current, {
              id: requisitionId, expectedAt, supplier, sku: item.sku, quantityRequested: quantityOrdered,
              unitCostMmk: purchaseOrderUnitCostResult, sourceDecisionDigest: shopProcurementDecision.digest,
              sourceReplenishmentDigest: shopReplenishment.digest, budgetEnvelopeId: activePurchaseBudget.id,
              sourceSourcingDecisionId: sourcingDecision.id,
            }, proof))
            setPurchaseOrderDraft((current) => current?.mode === 'create' && current.sku === item.sku ? null : current)
          },
        }, purchaseOrderTriggerRefs.current.get(item.sku))
        return
      }
      const purchaseOrderId = uid('PO')
      queueAction({
        kind: 'purchase_order_create',
        subjectId: purchaseOrderId,
        summary: `Second operator converts ${purchaseOrderDraft.requisitionId} into one internal purchase order`,
        before: `${purchaseOrderDraft.requisitionId} approved · different operator required · purchase order not created · supplier not contacted`,
        after: `${purchaseOrderId} · independent operator confirmed · ${supplier} · ${quantityOrdered.toLocaleString()} ordered at ${formatMoney(purchaseOrderUnitCostResult)} each · ${formatMoney(purchaseOrderDraftTotal)} total · expected ${formatIssueDue(expectedAt)} · no message or payment created`,
        apply: async (action) => {
          const proof = commerceActionProof(action)
          const approvedRequisition = commercePurchaseRequisitions(commerce).find((candidate) => candidate.id === purchaseOrderDraft.requisitionId)
          if (approvedRequisition && approvedRequisition.approval.actor.trim().toLowerCase() === proof.actor.trim().toLowerCase()) {
            throw new Error(`Use a different operator from ${approvedRequisition.approval.actor} to create this purchase order. Nothing was written.`)
          }
          await mutateCommerce('commerce.purchase_order.created', action.commandId, proof, (current) => createCommercePurchaseOrder(
            current,
            { id: purchaseOrderId, requisitionId: purchaseOrderDraft.requisitionId, expectedAt, supplier, sku: item.sku, quantityOrdered, unitCostMmk: purchaseOrderUnitCostResult },
            proof,
          ))
          setPurchaseOrderDraft((current) => current?.mode === 'create' && current.sku === item.sku ? null : current)
        },
      }, purchaseOrderTriggerRefs.current.get(item.sku))
      return
    }

    const purchaseOrderRow = purchaseOrderDraftOrder
    if (!purchaseOrderRow?.item) {
      setNotice('The active stock order is no longer available. Nothing was changed.')
      return
    }
    const { purchaseOrder, progress, item } = purchaseOrderRow
    const receiptQuantity = purchaseOrderQuantityResult
    const rejectedQuantity = purchaseOrderRejectedResult ?? 0
    const discrepancy = rejectedQuantity > 0
      ? { quantityRejected: rejectedQuantity, reasonCode: purchaseOrderDraft.discrepancyCode, disposition: 'return_to_vendor' as const }
      : undefined
    const expectedOnHand = item.onHand
    const expectedRemaining = progress.remaining
    if (!purchaseReceiptAllocationReady) {
      setNotice('Choose a receiving location and keep the lot or batch reference within 80 characters.')
      return
    }
    const locationReceipt = commerce.inventoryFoundation && purchaseReceiptLocation
      ? {
          receiptId: uid('RCV'),
          stockUnitId: uid('LOT'),
          trackingCode: purchaseReceiptTrackingCode,
          locationId: purchaseReceiptLocation.id,
          expectedHeadDigest: commerce.inventoryFoundation.headDigest,
        }
      : undefined
    // Receiving stock is a routine back-door job, repeated on every delivery. The
    // purchase order is the evidence and the quantities are already stated above, so
    // there is nothing here the operator knows that the screen does not.
    const purchaseOrderReference = recordDisplayReference(purchaseOrder.id)
    queueAction({
      kind: 'purchase_order_receive',
      subjectId: purchaseOrder.id,
      summary: `Receive ${receiptQuantity.toLocaleString()} accepted${rejectedQuantity ? ` and reject ${rejectedQuantity.toLocaleString()}` : ''} against ${purchaseOrderReference}`,
      reasonSuggestion: rejectedQuantity
        ? `Delivery checked against ${purchaseOrderReference}; ${rejectedQuantity.toLocaleString()} rejected.`
        : `Delivery received and counted against ${purchaseOrderReference}.`,
      evidenceReferenceSuggestion: `Purchase order ${purchaseOrderReference}`,
      before: `${progress.received.toLocaleString()} accepted · ${progress.rejected.toLocaleString()} rejected · ${progress.remaining.toLocaleString()} due · ${expectedOnHand.toLocaleString()} on hand`,
      after: `${(progress.received + receiptQuantity).toLocaleString()} accepted · ${(progress.rejected + rejectedQuantity).toLocaleString()} rejected${rejectedQuantity ? ` for ${purchaseOrderDraft.discrepancyCode.replace('_', ' ')} / return to vendor` : ''} · ${(expectedOnHand + receiptQuantity).toLocaleString()} on hand${locationReceipt ? ` · ${purchaseReceiptLocation?.name ?? locationReceipt.locationId} · lot ${locationReceipt.trackingCode}` : ''}`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.purchase_order.received', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrder.id)
          const currentItem = current.items.find((candidate) => candidate.sku === item.sku)
          if (!currentPurchaseOrder
            || !currentItem
            || currentItem.onHand !== expectedOnHand
            || commercePurchaseOrderProgress(current, currentPurchaseOrder).remaining !== expectedRemaining) return null
          return receiveCommercePurchaseOrder(current, purchaseOrder.id, receiptQuantity, proof, locationReceipt, discrepancy)
        })
        setPurchaseOrderDraft((current) => current?.mode === 'receive' && current.purchaseOrderId === purchaseOrder.id ? null : current)
      },
    }, purchaseOrderTriggerRefs.current.get(item.sku))
  }

  function openStockCount() {
    if (stockCountDraft) {
      const selector = stockCountTargetSelected ? '#stock-count-quantity' : '#stock-count-sku'
      requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(selector)?.focus())
      setNotice('Continue the available-stock count below. Your draft was preserved.')
      return
    }
    if (purchaseOrderDraft) {
      requestAnimationFrame(() => purchaseOrderEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the stock order before starting a count. Your stock-order draft was preserved.')
      return
    }
    if (catalogEditDraft) {
      requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the catalog edit before starting a count. Your catalog draft was preserved.')
      return
    }
    const suggestedItem = lowStock[0] ?? commerce.items[0]
    const suggestedBalance = commerce.inventoryFoundation
      ? managedInventoryProjection?.balances.find((balance) => balance.sku === suggestedItem?.sku)
        ?? managedInventoryProjection?.balances[0]
      : undefined
    const suggestedDraft: StockCountDraft = {
      sku: suggestedBalance?.sku ?? suggestedItem?.sku ?? '',
      stockUnitId: suggestedBalance?.stockUnitId ?? '',
      locationId: suggestedBalance?.locationId ?? '',
      quantity: '',
    }
    setStockCountDraft(suggestedDraft)
    setNotice(commerce.inventoryFoundation
      ? suggestedBalance
        ? 'Enter the physical count for the suggested location and lot. Choose another target if needed; nothing changes until confirmation.'
        : 'Choose one location and lot, then count every physical unit there. Nothing changes until confirmation.'
      : suggestedItem
        ? `Enter counted sellable units for ${suggestedItem.name}. Choose another item if needed; nothing changes until confirmation.`
        : 'Choose one item, then enter counted sellable units. Nothing changes until confirmation.')
    requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(suggestedDraft.sku ? '#stock-count-quantity' : '#stock-count-sku')?.focus())
  }

  function cancelStockCount() {
    setStockCountDraft(null)
    setNotice('Stock count closed. Shop data was not modified.')
    requestAnimationFrame(() => stockCountTriggerRef.current?.focus())
  }

  function selectStockCountTarget(value: string) {
    if (!commerce.inventoryFoundation) {
      setStockCountDraft((current) => current ? {
        sku: value,
        stockUnitId: '',
        locationId: '',
        quantity: '',
      } : current)
      return
    }
    const separator = value.indexOf('|')
    const stockUnitId = separator > 0 ? value.slice(0, separator) : ''
    const locationId = separator > 0 ? value.slice(separator + 1) : ''
    const balance = managedInventoryProjection?.balances.find((candidate) => (
      candidate.stockUnitId === stockUnitId && candidate.locationId === locationId
    ))
    setStockCountDraft((current) => current ? {
      sku: balance?.sku ?? '',
      stockUnitId: balance?.stockUnitId ?? '',
      locationId: balance?.locationId ?? '',
      quantity: '',
    } : current)
  }

  function reviewStockCount(event: FormEvent) {
    event.preventDefault()
    if (!stockCountDraft || !stockCountItem || stockCountQuantityResult === null || (commerce.inventoryFoundation && !stockCountBalance)) {
      setNotice(commerce.inventoryFoundation
        ? 'Choose one location and lot, then enter a physical count that includes its reserved units.'
        : 'Choose one item and enter a non-negative whole-unit available count.')
      return
    }
    const item = stockCountItem
    const countedPhysicalQuantity = stockCountQuantityResult
    const expectedAvailable = item.onHand
    const expectedPhysicalQuantity = stockCountBalance?.onHand ?? expectedAvailable
    const countedAvailable = expectedAvailable + countedPhysicalQuantity - expectedPhysicalQuantity
    const variance = countedPhysicalQuantity - expectedPhysicalQuantity
    const varianceLabel = variance === 0
      ? 'no variance'
      : `${variance > 0 ? '+' : ''}${variance.toLocaleString()} variance`
    const countLocation = stockCountBalance
      ? managedInventoryProjection?.locations.find((location) => location.id === stockCountBalance.locationId)
      : undefined
    const targetLabel = stockCountBalance
      ? `${countLocation?.name ?? stockCountBalance.locationId} / ${stockCountBalance.trackingCode}`
      : item.sku
    const locationCount = commerce.inventoryFoundation && stockCountBalance
      ? {
          countId: uid('CNT'),
          stockUnitId: stockCountBalance.stockUnitId,
          locationId: stockCountBalance.locationId,
          expectedQuantity: expectedPhysicalQuantity,
          countedQuantity: countedPhysicalQuantity,
          expectedHeadDigest: commerce.inventoryFoundation.headDigest,
        }
      : undefined
    // A stock count with no variance is bookkeeping and needs no explanation. A count that
    // disagrees with the record is the opposite — that is the entry someone audits later —
    // so state the variance and leave the operator to say what caused it.
    const countHasVariance = countedPhysicalQuantity !== expectedPhysicalQuantity
    queueAction({
      kind: 'inventory_count',
      subjectId: item.sku,
      ...(countHasVariance ? {} : { reasonSuggestion: `Routine stock count of ${item.name}; counted quantity matches the record.` }),
      evidenceReferenceSuggestion: `Stock count ${item.sku}`,
      summary: stockCountBalance ? `Count ${item.name} at ${targetLabel}` : `Count available stock for ${item.name}`,
      before: stockCountBalance
        ? `${targetLabel} / ${expectedPhysicalQuantity.toLocaleString()} physical / ${stockCountBalance.reserved.toLocaleString()} reserved / ${expectedAvailable.toLocaleString()} total available`
        : `${item.sku} / ${expectedAvailable.toLocaleString()} recorded available`,
      after: stockCountBalance
        ? `${countedPhysicalQuantity.toLocaleString()} physical / ${varianceLabel} / ${countedAvailable.toLocaleString()} total available / count evidence only`
        : `${countedAvailable.toLocaleString()} counted available / ${varianceLabel} / count evidence only`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        let staleCount = false
        try {
          await mutateCommerce('commerce.stock.counted', action.commandId, proof, (current) => {
            const replay = current.movements.find((movement) => movement.actionId === proof.actionId)
            if (replay) return countCommerceStock(current, item.sku, countedAvailable, proof, locationCount)
            const currentItems = current.items.filter((candidate) => candidate.sku === item.sku)
            if (currentItems.length !== 1
              || currentItems[0].onHand !== expectedAvailable
              || (locationCount && current.inventoryFoundation?.headDigest !== locationCount.expectedHeadDigest)) {
              staleCount = true
              return null
            }
            return countCommerceStock(current, item.sku, countedAvailable, proof, locationCount)
          })
          setStockCountDraft((current) => current?.sku === item.sku
            && current.stockUnitId === (locationCount?.stockUnitId ?? '')
            && current.locationId === (locationCount?.locationId ?? '') ? null : current)
        } catch (error) {
          if (staleCount || error instanceof ShopReviewRequiredError) {
            setStockCountDraft({
              sku: item.sku,
              stockUnitId: locationCount?.stockUnitId ?? '',
              locationId: locationCount?.locationId ?? '',
              quantity: '',
            })
            requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLInputElement>('#stock-count-quantity')?.focus())
            throw new ShopReviewRequiredError(`Stock changed while you were reviewing. Nothing was applied. Recount ${targetLabel} against the latest stock record.`)
          }
          throw error
        }
      },
    }, stockCountTriggerRef.current)
  }

  function reviewPurchaseOrderCancellation(purchaseOrderId: string) {
    const row = purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === purchaseOrderId)
    if (!row || row.progress.remaining < 1 || row.progress.status === 'cancelled') return
    const expectedRemaining = row.progress.remaining
    queueAction({
      kind: 'purchase_order_cancel',
      subjectId: row.purchaseOrder.id,
      summary: `Cancel ${expectedRemaining.toLocaleString()} outstanding units on ${row.purchaseOrder.id}`,
      before: `${row.progress.received.toLocaleString()} of ${row.purchaseOrder.quantityOrdered.toLocaleString()} received · ${expectedRemaining.toLocaleString()} still open`,
      after: `outstanding remainder cancelled internally · no supplier message, payment, or accounting entry created`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.purchase_order.cancelled', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
          if (!currentPurchaseOrder
            || commercePurchaseOrderProgress(current, currentPurchaseOrder).remaining !== expectedRemaining) return null
          return cancelCommercePurchaseOrder(current, purchaseOrderId, proof)
        })
        setPurchaseOrderDraft((current) => current?.mode === 'receive' && current.purchaseOrderId === purchaseOrderId ? null : current)
      },
    }, purchaseOrderTriggerRefs.current.get(row.purchaseOrder.sku))
  }

  function openSupplierInvoice(purchaseOrderId: string) {
    const row = purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === purchaseOrderId)
    const purchaseOrder = row?.purchaseOrder
    if (!purchaseOrder || purchaseOrder.supplierInvoice || purchaseOrder.unitCostMmk === undefined) return
    const issuedAt = new Date(Math.max(purchaseOrderClock, Date.parse(purchaseOrder.createdAt)))
    setSupplierInvoiceDraft({
      purchaseOrderId,
      supplierReference: '',
      issuedAt: localDateTimeInputValue(issuedAt),
      dueAt: localDateTimeInputValue(new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000)),
      quantity: String(purchaseOrder.quantityOrdered),
      unitCostMmk: String(purchaseOrder.unitCostMmk),
    })
    setNotice(`Enter the supplier's invoice reference and confirm the billed terms for ${purchaseOrderId}. No payable or payment is created.`)
  }

  function openSupplierReturn(purchaseOrderId: string, receiptMovementId: string) {
    const row = purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === purchaseOrderId)
    const receipt = commerce.movements.find((movement) => movement.id === receiptMovementId)
    if (!row?.purchaseOrder.unitCostMmk || receipt?.kind !== 'receipt' || !receipt.rejectedQuantity
      || row.purchaseOrder.supplierReturns?.some((claim) => claim.receiptMovementId === receiptMovementId)) return
    setSupplierReturnDraft({
      purchaseOrderId,
      receiptMovementId,
      internalReturnReference: uid('RET'),
    })
    setNotice(`Review the ${receipt.rejectedQuantity.toLocaleString()} rejected unit return claim. This records internal evidence only; it does not contact the supplier or dispatch goods.`)
  }

  function reviewSupplierReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supplierReturnDraft || !supplierReturnDraftRow || !supplierReturnDraftReceipt || !supplierReturnDraftReady) {
      setNotice('Choose one rejected receipt and enter a unique internal return reference.')
      return
    }
    const purchaseOrder = supplierReturnDraftRow.purchaseOrder
    const receipt = supplierReturnDraftReceipt
    const internalReturnReference = supplierReturnDraft.internalReturnReference.trim()
    const claimAmountMmk = (receipt.rejectedQuantity ?? 0) * (purchaseOrder.unitCostMmk ?? 0)
    const input = { id: uid('SRET'), receiptMovementId: receipt.id, internalReturnReference }
    queueAction({
      kind: 'supplier_return_authorize',
      subjectId: purchaseOrder.id,
      summary: `Authorize supplier return claim ${internalReturnReference}`,
      before: `${receipt.rejectedQuantity?.toLocaleString()} rejected unit${receipt.rejectedQuantity === 1 ? '' : 's'} on ${receipt.id} · no return claim`,
      after: `${formatMoney(claimAmountMmk)} claim retained · physical return not dispatched · supplier not contacted · accounting not posted`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.supplier_return.authorized', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrder.id)
          if (!currentPurchaseOrder || currentPurchaseOrder.supplierReturns?.some((claim) => claim.receiptMovementId === receipt.id)) return null
          return authorizeCommerceSupplierReturn(current, purchaseOrder.id, input, proof)
        })
        setSupplierReturnDraft((current) => current?.receiptMovementId === receipt.id ? null : current)
      },
    }, purchaseOrderTriggerRefs.current.get(purchaseOrder.sku))
  }

  function openSupplierCredit(purchaseOrderId: string, claim: CommerceSupplierReturnClaim) {
    const remainingMmk = commerceSupplierReturnClaimBalance(claim)
    if (remainingMmk < 1) return
    const issuedAtBasis = Math.max(purchaseOrderClock, Date.parse(claim.createdAt))
    const issuedAt = new Date(Math.ceil(issuedAtBasis / 60_000) * 60_000)
    setSupplierCreditDraft({
      purchaseOrderId,
      supplierReturnId: claim.id,
      supplierReference: '',
      issuedAt: localDateTimeInputValue(issuedAt),
      amountMmk: String(remainingMmk),
    })
    setNotice(`Record supplier credit evidence up to ${formatMoney(remainingMmk)}. This does not post to accounting or initiate payment.`)
  }

  function reviewSupplierCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supplierCreditDraft || !supplierCreditDraftRow || !supplierCreditDraftClaim || !supplierCreditDraftReady) {
      setNotice('Enter a unique supplier credit reference, valid issue time, and an amount within the outstanding claim.')
      return
    }
    const purchaseOrder = supplierCreditDraftRow.purchaseOrder
    const claim = supplierCreditDraftClaim
    const supplierReference = supplierCreditDraft.supplierReference.trim()
    const input = {
      id: uid('SCN'),
      supplierReference,
      issuedAt: new Date(supplierCreditIssuedAt).toISOString(),
      amountMmk: supplierCreditAmount,
    }
    const balanceAfter = commerceSupplierReturnClaimBalance(claim) - supplierCreditAmount
    queueAction({
      kind: 'supplier_credit_record',
      subjectId: claim.id,
      summary: `Record supplier credit ${supplierReference}`,
      before: `${formatMoney(commerceSupplierReturnClaimBalance(claim))} outstanding on ${claim.internalReturnReference}`,
      after: `${formatMoney(supplierCreditAmount)} credit evidence retained · ${formatMoney(balanceAfter)} outstanding · accounting not posted`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.supplier_credit.recorded', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrder.id)
          const currentClaim = currentPurchaseOrder?.supplierReturns?.find((candidate) => candidate.id === claim.id)
          if (!currentClaim || supplierCreditAmount > commerceSupplierReturnClaimBalance(currentClaim)) return null
          return recordCommerceSupplierCreditNote(current, purchaseOrder.id, claim.id, input, proof)
        })
        setSupplierCreditDraft((current) => current?.supplierReturnId === claim.id ? null : current)
      },
    }, purchaseOrderTriggerRefs.current.get(purchaseOrder.sku))
  }

  function reviewSupplierInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supplierInvoiceDraft || !supplierInvoiceDraftRow || !supplierInvoiceDraftReady || supplierInvoiceTotal === null) {
      setNotice('Enter one supplier reference, valid invoice and due dates, quantity, and whole-MMK unit cost.')
      return
    }
    const purchaseOrder = supplierInvoiceDraftRow.purchaseOrder
    const supplierReference = supplierInvoiceDraft.supplierReference.trim()
    const input = {
      id: uid('PINV'),
      supplierReference,
      issuedAt: new Date(supplierInvoiceIssuedAt).toISOString(),
      dueAt: new Date(supplierInvoiceDueAt).toISOString(),
      quantityInvoiced: supplierInvoiceQuantity,
      unitCostMmk: supplierInvoiceUnitCost,
    }
    queueAction({
      kind: 'purchase_order_receive',
      subjectId: purchaseOrder.id,
      summary: `Record supplier invoice ${supplierReference} against ${purchaseOrder.id}`,
      before: `${purchaseOrder.quantityOrdered.toLocaleString()} ordered at ${formatMoney(purchaseOrder.unitCostMmk ?? 0)} · invoice not recorded`,
      after: `${input.quantityInvoiced.toLocaleString()} billed at ${formatMoney(input.unitCostMmk)} · ${formatMoney(supplierInvoiceTotal)} retained for three-way review · no payable or payment created`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.supplier_invoice.recorded', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrder.id)
          if (!currentPurchaseOrder || currentPurchaseOrder.supplierInvoice) return null
          return recordCommerceSupplierInvoice(current, purchaseOrder.id, input, proof)
        })
        setSupplierInvoiceDraft((current) => current?.purchaseOrderId === purchaseOrder.id ? null : current)
      },
    }, purchaseOrderTriggerRefs.current.get(purchaseOrder.sku))
  }

  function reviewSupplierInvoicePayable(purchaseOrderId: string) {
    const row = purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === purchaseOrderId)
    const invoice = row?.purchaseOrder.supplierInvoice
    if (!row || !invoice || invoice.payableReview) return
    const match = commerceSupplierInvoiceMatch(commerce, row.purchaseOrder)
    if (match.status !== 'matched') return
    queueAction({
      kind: 'purchase_order_receive',
      subjectId: purchaseOrderId,
      summary: `Mark supplier invoice ${invoice.supplierReference} payable-ready`,
      before: `${match.orderedQuantity.toLocaleString()} ordered · ${match.acceptedQuantity.toLocaleString()} accepted${match.rejectedQuantity ? ` · ${match.rejectedQuantity.toLocaleString()} rejected` : ''} · ${match.invoicedQuantity.toLocaleString()} invoiced${match.supplierCreditMmk ? ` · ${formatMoney(match.supplierCreditMmk)} supplier credit` : ''} · ${formatMoney(match.netInvoiceTotalMmk)} net · exact match pending review`,
      after: `${formatMoney(match.netInvoiceTotalMmk)} payable-ready evidence retained for accountant handoff · no ledger post, bank instruction, or supplier payment created`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.supplier_invoice.payable_ready', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
          if (!currentPurchaseOrder?.supplierInvoice
            || currentPurchaseOrder.supplierInvoice.id !== invoice.id
            || commerceSupplierInvoiceMatch(current, currentPurchaseOrder).status !== 'matched') return null
          return markCommerceSupplierInvoicePayableReady(current, purchaseOrderId, proof)
        })
      },
    }, purchaseOrderTriggerRefs.current.get(row.purchaseOrder.sku))
  }

  function reviewTaxConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = effectiveTaxDraft.code.trim().toUpperCase()
    const label = effectiveTaxDraft.label.trim()
    const jurisdictionCode = effectiveTaxDraft.jurisdictionCode.trim().toUpperCase()
    const rateBasisPoints = parseTaxRateBasisPoints(effectiveTaxDraft.ratePercent)
    const effectiveFromDate = new Date(effectiveTaxDraft.effectiveFrom)
    if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(code)
      || !/^[A-Z0-9][A-Z0-9_-]{1,15}$/.test(jurisdictionCode)
      || !label
      || label.length > 80
      || rateBasisPoints === null
      || Number.isNaN(effectiveFromDate.getTime())
      || effectiveFromDate.getTime() < purchaseOrderClock + 60_000) {
      setNotice('Enter reviewed tax and jurisdiction codes, a short label, a valid rate, and an effective time at least one minute ahead.')
      return
    }
    const expectedRevision = currentTaxConfiguration?.revision ?? 0
    const effectiveFrom = effectiveFromDate.toISOString()
    const input = { code, label, rateBasisPoints, mode: effectiveTaxDraft.mode, jurisdictionCode, effectiveFrom }
    const previous = currentTaxConfiguration
      ? `${currentTaxConfiguration.code} · ${currentTaxConfiguration.jurisdictionCode ?? 'legacy scope'} · ${formatTaxRate(currentTaxConfiguration.rateBasisPoints)} · ${currentTaxConfiguration.mode} · revision ${currentTaxConfiguration.revision}`
      : 'No Shop tax configuration'
    queueAction({
      kind: 'tax_configuration',
      subjectId: `SHOP-TAX-R${expectedRevision + 1}`,
      summary: `Set Shop tax code ${code}`,
      before: previous,
      after: `${code} · ${label} · ${jurisdictionCode} · ${formatTaxRate(rateBasisPoints)} · ${effectiveTaxDraft.mode} · effective ${formatTime(effectiveFrom)} · future orders only`,
      reasonSuggestion: 'Reviewed the Shop tax setup for future orders.',
      apply: async (action) => {
        await mutateCommerce(
          'commerce.tax_configuration.saved',
          action.commandId,
          commerceActionProof(action),
          (current) => {
            if ((commerceCurrentTaxConfiguration(current)?.revision ?? 0) !== expectedRevision) return null
            return configureCommerceTax(current, input, commerceActionProof(action))
          },
        )
        setTaxDraft(null)
      },
    }, event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]'))
  }

  function reviewAccountMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = {
      paymentClearing: effectiveAccountMapping.paymentClearing.trim(),
      salesRevenue: effectiveAccountMapping.salesRevenue.trim(),
      taxPayable: effectiveAccountMapping.taxPayable.trim(),
      legacyRevenue: effectiveAccountMapping.legacyRevenue.trim(),
      salesAdjustment: effectiveAccountMapping.salesAdjustment.trim(),
      correctionReceivable: effectiveAccountMapping.correctionReceivable.trim(),
      correctionPayable: effectiveAccountMapping.correctionPayable.trim(),
    }
    if (Object.values(values).some((value) => !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(value))) {
      setNotice('Enter all seven reviewed account codes using letters, numbers, dot, underscore, slash, or hyphen.')
      return
    }
    const expectedRevision = currentAccountMappingConfiguration?.revision ?? 0
    const mappings = [
      { accountRole: 'payment_clearing' as const, externalAccountCode: values.paymentClearing },
      { accountRole: 'sales_revenue' as const, externalAccountCode: values.salesRevenue },
      { accountRole: 'sales_revenue_unverified' as const, externalAccountCode: values.legacyRevenue },
      { accountRole: 'tax_payable' as const, externalAccountCode: values.taxPayable },
      { accountRole: 'sales_adjustment' as const, externalAccountCode: values.salesAdjustment },
      { accountRole: 'correction_receivable' as const, externalAccountCode: values.correctionReceivable },
      { accountRole: 'correction_payable' as const, externalAccountCode: values.correctionPayable },
    ]
    const previous = currentAccountMappingConfiguration
      ? `Account mapping revision ${currentAccountMappingConfiguration.revision}`
      : 'No Shop account mapping'
    queueAction({
      kind: 'account_mapping',
      subjectId: `SHOP-ACCOUNTS-R${expectedRevision + 1}`,
      summary: 'Set Shop accounting handoff mapping',
      before: previous,
      after: `clearing ${values.paymentClearing} · revenue ${values.salesRevenue} · tax ${values.taxPayable} · adjustment ${values.salesAdjustment} · correction receivable/payable ${values.correctionReceivable}/${values.correctionPayable} · future closes only`,
      reasonSuggestion: 'Reviewed the Shop account mapping for future closes.',
      apply: async (action) => {
        await mutateCommerce(
          'commerce.account_mapping.saved',
          action.commandId,
          commerceActionProof(action),
          (current) => {
            if ((commerceCurrentAccountMappingConfiguration(current)?.revision ?? 0) !== expectedRevision) return null
            return configureCommerceAccountMapping(current, { mappings }, commerceActionProof(action))
          },
        )
        setAccountMapping(null)
      },
    }, event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]'))
  }

  function reviewCustomerCreditPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const customer = creditPolicyDraft.customer.trim()
    const limitText = creditPolicyDraft.creditLimitMmk.trim()
    const creditLimitMmk = /^(?:0|[1-9]\d*)$/.test(limitText) ? Number(limitText) : Number.NaN
    if (!customer
      || customer.length > 120
      || !Number.isSafeInteger(creditLimitMmk)
      || creditLimitMmk < 0) {
      setNotice('Enter a customer name and a non-negative whole-MMK credit limit.')
      return
    }
    const input = {
      customer,
      creditLimitMmk,
      maxPaymentTermsDays: creditPolicyDraft.maxPaymentTermsDays,
      status: creditPolicyDraft.status,
    }
    const expectedRevision = commerce.customerCreditPolicies?.length ?? 0
    const previous = commerceCurrentCustomerCreditPolicy(commerce, customer)
    queueAction({
      kind: 'customer_credit_policy',
      subjectId: `SHOP-CREDIT-${customer}-R${expectedRevision + 1}`,
      summary: `${input.status === 'hold' ? 'Hold' : 'Set'} credit for ${customer}`,
      before: previous
        ? `${formatMoney(previous.creditLimitMmk)} limit · ${previous.maxPaymentTermsDays}-day terms · ${previous.status}`
        : 'No customer credit policy',
      after: `${formatMoney(input.creditLimitMmk)} limit · ${input.maxPaymentTermsDays}-day maximum · ${input.status} · future credit orders only`,
      reasonSuggestion: 'Reviewed the customer credit boundary for future Shop orders.',
      apply: async (action) => {
        await mutateCommerce(
          'commerce.customer_credit_policy.saved',
          action.commandId,
          commerceActionProof(action),
          (current) => {
            if ((current.customerCreditPolicies?.length ?? 0) !== expectedRevision) return null
            return configureCommerceCustomerCreditPolicy(current, input, commerceActionProof(action))
          },
        )
      },
    }, event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]'))
  }

  function reviewPromotionPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = promotionPolicyDraft.code.trim().toUpperCase()
    const discountBasisPoints = parseTaxRateBasisPoints(promotionPolicyDraft.discountPercent)
    const minimumText = promotionPolicyDraft.minimumSubtotalMmk.trim()
    const maximumText = promotionPolicyDraft.maximumDiscountMmk.trim()
    const minimumSubtotalMmk = /^(?:0|[1-9]\d*)$/.test(minimumText) ? Number(minimumText) : Number.NaN
    const maximumDiscountMmk = /^[1-9]\d*$/.test(maximumText) ? Number(maximumText) : Number.NaN
    const effectiveFromDate = new Date(promotionPolicyDraft.effectiveFrom)
    const effectiveUntilDate = promotionPolicyDraft.effectiveUntil ? new Date(promotionPolicyDraft.effectiveUntil) : null
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)
      || discountBasisPoints === null
      || discountBasisPoints < 1
      || !Number.isSafeInteger(minimumSubtotalMmk)
      || minimumSubtotalMmk < 0
      || !Number.isSafeInteger(maximumDiscountMmk)
      || maximumDiscountMmk < 1
      || Number.isNaN(effectiveFromDate.getTime())
      || effectiveFromDate.getTime() < purchaseOrderClock + 60_000
      || (effectiveUntilDate && (Number.isNaN(effectiveUntilDate.getTime()) || effectiveUntilDate <= effectiveFromDate))) {
      setNotice('Enter an uppercase code, discount from 0.01% to 100%, whole-MMK limits, and an effective start at least one minute ahead. End time must be later or blank.')
      return
    }
    const expectedRevision = commerce.promotionPolicies?.length ?? 0
    const input = {
      code,
      discountBasisPoints,
      minimumSubtotalMmk,
      maximumDiscountMmk,
      status: promotionPolicyDraft.status,
      effectiveFrom: effectiveFromDate.toISOString(),
      effectiveUntil: effectiveUntilDate?.toISOString() ?? null,
    }
    const previous = commerceCurrentPromotionPolicy(commerce, code)
    queueAction({
      kind: 'promotion_policy',
      subjectId: `SHOP-PROMOTION-${code}-R${expectedRevision + 1}`,
      summary: `${input.status === 'active' ? 'Set' : 'Stop'} promotion ${code}`,
      before: previous
        ? `${formatTaxRate(previous.discountBasisPoints)} · minimum ${formatMoney(previous.minimumSubtotalMmk)} · cap ${formatMoney(previous.maximumDiscountMmk)} · ${previous.status} · revision ${previous.revision}`
        : 'No Shop promotion policy for this code',
      after: `${formatTaxRate(input.discountBasisPoints)} · minimum ${formatMoney(input.minimumSubtotalMmk)} · cap ${formatMoney(input.maximumDiscountMmk)} · ${input.status} · effective ${formatTime(input.effectiveFrom)}${input.effectiveUntil ? ` to ${formatTime(input.effectiveUntil)}` : ' until changed'} · future Shop reviews only`,
      reasonSuggestion: 'Reviewed the Shop promotion boundary for future Ecommerce orders.',
      apply: async (action) => {
        await mutateCommerce(
          'commerce.promotion_policy.saved',
          action.commandId,
          commerceActionProof(action),
          (current) => {
            if ((current.promotionPolicies?.length ?? 0) !== expectedRevision) return null
            return configureCommercePromotionPolicy(current, input, commerceActionProof(action))
          },
        )
      },
    }, event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]'))
  }

  function reviewShippingPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const zoneCode = shippingPolicyDraft.zoneCode.trim().toUpperCase()
    const townships = [...new Set(shippingPolicyDraft.townships.split(',').map((value) => value.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }))
    const feeMmk = /^\d+$/.test(shippingPolicyDraft.feeMmk.trim()) ? Number(shippingPolicyDraft.feeMmk) : Number.NaN
    const promiseMinutes = /^\d+$/.test(shippingPolicyDraft.promiseMinutes.trim()) ? Number(shippingPolicyDraft.promiseMinutes) : Number.NaN
    const effectiveFromDate = new Date(shippingPolicyDraft.effectiveFrom)
    const effectiveUntilDate = shippingPolicyDraft.effectiveUntil ? new Date(shippingPolicyDraft.effectiveUntil) : null
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(zoneCode)
      || townships.length < 1 || townships.length > 50 || townships.some((township) => township.length > 80)
      || !Number.isSafeInteger(feeMmk) || feeMmk < 0
      || !Number.isSafeInteger(promiseMinutes) || promiseMinutes < 15 || promiseMinutes > 10_080
      || Number.isNaN(effectiveFromDate.getTime()) || effectiveFromDate.getTime() < purchaseOrderClock + 60_000
      || (effectiveUntilDate && (Number.isNaN(effectiveUntilDate.getTime()) || effectiveUntilDate <= effectiveFromDate))) {
      setNotice('Enter a zone, 1 to 50 comma-separated townships, a whole-MMK fee, a 15-minute to 7-day promise, and a valid future effective window.')
      return
    }
    const expectedRevision = commerce.shippingPolicies?.length ?? 0
    const input = {
      zoneCode, townships, feeMmk, promiseMinutes, status: shippingPolicyDraft.status,
      effectiveFrom: effectiveFromDate.toISOString(), effectiveUntil: effectiveUntilDate?.toISOString() ?? null,
    }
    queueAction({
      kind: 'shipping_policy',
      subjectId: `SHOP-SHIPPING-${zoneCode}-R${expectedRevision + 1}`,
      summary: `${input.status === 'active' ? 'Set' : 'Stop'} delivery zone ${zoneCode}`,
      before: currentShippingPolicy
        ? `${currentShippingPolicy.townships.join(', ')} · ${formatMoney(currentShippingPolicy.feeMmk)} · ${currentShippingPolicy.promiseMinutes} minutes · ${currentShippingPolicy.status}`
        : 'No Shop delivery policy for this zone',
      after: `${townships.join(', ')} · ${formatMoney(feeMmk)} · ${promiseMinutes} minutes · ${input.status} · future Shop reviews only`,
      reasonSuggestion: 'Reviewed the Shop delivery boundary for future Ecommerce orders.',
      apply: async (action) => {
        await mutateCommerce('commerce.shipping_policy.saved', action.commandId, commerceActionProof(action), (current) => {
          if ((current.shippingPolicies?.length ?? 0) !== expectedRevision) return null
          return configureCommerceShippingPolicy(current, input, commerceActionProof(action))
        })
      },
    }, event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]'))
  }

  function reviewPaymentPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const maximumOrderMmk = paymentPolicyDraft.maximumOrderMmk.trim()
      ? /^\d+$/.test(paymentPolicyDraft.maximumOrderMmk.trim()) ? Number(paymentPolicyDraft.maximumOrderMmk) : Number.NaN
      : null
    const instructions = paymentPolicyDraft.instructions.trim()
    const allowedFulfilments = paymentPolicyDraft.allowedFulfilments === 'both'
      ? ['delivery', 'pickup'] as const
      : [paymentPolicyDraft.allowedFulfilments] as const
    const effectiveFromDate = new Date(paymentPolicyDraft.effectiveFrom)
    const effectiveUntilDate = paymentPolicyDraft.effectiveUntil ? new Date(paymentPolicyDraft.effectiveUntil) : null
    if ((maximumOrderMmk !== null && (!Number.isSafeInteger(maximumOrderMmk) || maximumOrderMmk < 1))
      || !instructions || instructions.length > 240
      || Number.isNaN(effectiveFromDate.getTime()) || effectiveFromDate.getTime() < purchaseOrderClock + 60_000
      || (effectiveUntilDate && (Number.isNaN(effectiveUntilDate.getTime()) || effectiveUntilDate <= effectiveFromDate))) {
      setNotice('Enter concise staff instructions, an optional positive whole-MMK limit, and an effective start at least one minute ahead. End time must be later or blank.')
      return
    }
    const expectedRevision = commerce.paymentPolicies?.length ?? 0
    const input = {
      adapter: paymentPolicyDraft.adapter,
      allowedFulfilments: [...allowedFulfilments],
      maximumOrderMmk,
      instructions,
      status: paymentPolicyDraft.status,
      effectiveFrom: effectiveFromDate.toISOString(),
      effectiveUntil: effectiveUntilDate?.toISOString() ?? null,
    }
    queueAction({
      kind: 'payment_policy',
      subjectId: `SHOP-PAYMENT-${input.adapter.toUpperCase()}-R${expectedRevision + 1}`,
      summary: `${input.status === 'active' ? 'Set' : 'Stop'} ${input.adapter.replaceAll('_', ' ')} policy`,
      before: currentPaymentPolicy
        ? `${currentPaymentPolicy.allowedFulfilments.join(' + ')} · ${currentPaymentPolicy.maximumOrderMmk === null ? 'no order limit' : formatMoney(currentPaymentPolicy.maximumOrderMmk)} · ${currentPaymentPolicy.status} · revision ${currentPaymentPolicy.revision}`
        : 'No Shop payment policy for this method',
      after: `${input.allowedFulfilments.join(' + ')} · ${input.maximumOrderMmk === null ? 'no order limit' : formatMoney(input.maximumOrderMmk)} · ${input.status} · future Shop reviews only`,
      reasonSuggestion: 'Reviewed the Shop payment-method boundary for future Ecommerce orders.',
      apply: async (action) => {
        await mutateCommerce('commerce.payment_policy.saved', action.commandId, commerceActionProof(action), (current) => {
          if ((current.paymentPolicies?.length ?? 0) !== expectedRevision) return null
          return configureCommercePaymentPolicy(current, input, commerceActionProof(action))
        })
      },
    }, event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]'))
  }

  function closeDay() {
    const queuedAt = new Date().toISOString()
    const expected = commerceCloseExpectation(commerce, queuedAt)
    if (!expected) {
      setNotice(legacyCloseNeedsMigration
        ? 'Legacy close history must be migrated before another daily close can be saved.'
        : 'This business date already has a close. Review the latest snapshot instead of closing it again.')
      return
    }
    const settlementInput = closeSettlementInput.every((line) => line !== null)
      ? closeSettlementInput as CommerceCloseSettlementInputLine[]
      : null
    const settlement = settlementInput ? commerceCloseSettlementReview(commerce, expected, settlementInput) : null
    if (!settlement) {
      setNotice('Count every payment method. Any variance needs a responsible owner and a clear review reason before close.')
      return
    }
    const closeId = uid('CLOSE')
    const paymentExceptions = expected.paymentExceptionOrderIds.length ? expected.paymentExceptionOrderIds.join(', ') : 'none'
    const stockExceptions = expected.stockExceptionSkus.length ? expected.stockExceptionSkus.join(', ') : 'none'
    // Closing the day happens once every day the shop opens, and the interesting facts —
    // the date, the counted total, whether the settlement balanced — are already computed
    // and shown above. When the count does NOT match, say so in the reason rather than
    // hiding it behind a generic line: a short close is exactly the entry someone will
    // read back later.
    const closeReason = settlement.status === 'matched'
      ? `End of day ${expected.businessDate}. Counted cash matches the expected total.`
      : `End of day ${expected.businessDate}. Settlement needs review — counted ${formatMoney(settlement.totalCountedMmk)} against expected ${formatMoney(expected.total)}.`
    queueAction({
      kind: 'daily_close',
      subjectId: closeId,
      summary: `Close ${expected.businessDate}`,
      reasonSuggestion: closeReason,
      evidenceReferenceSuggestion: `Daily close ${expected.businessDate}`,
      before: `${commerce.closes.length} snapshots`,
      after: `${expected.orderIds.length} orders (${expected.orderIds.length ? expected.orderIds.join(', ') : 'none'}) · expected ${formatMoney(expected.total)} · counted ${formatMoney(settlement.totalCountedMmk)} · settlement ${settlement.status.replace('_', ' ')} · payment exceptions: ${paymentExceptions} · stock exceptions: ${stockExceptions}`,
      apply: (action) => mutateCommerce(
        'commerce.close.saved',
        action.commandId,
        commerceActionProof(action),
        (current) => saveCommerceClose(current, closeId, commerceActionProof(action), expected, settlementInput ?? undefined),
      ),
    })
  }

  function cancelCommerceActionReview() {
    const restorePreparedEcommerce = pendingAction?.kind === 'order_create' && Boolean(preparedEcommerceDraft)
    if (pendingAction?.kind === 'order_create' && !restorePreparedEcommerce) {
      setOrderDraftActive(false)
      setResumedOrderDraft(null)
    }
    setPendingAction(null)
    if (!restorePreparedEcommerce) {
      setNotice('Change cancelled. Shop data was not modified.')
      return
    }
    setNotice('Review cancelled. The prepared Ecommerce request and Payment are unchanged; Shop data was not modified.')
    requestAnimationFrame(() => {
      const dialog = orderComposerRef.current
      if (dialog && !dialog.open) dialog.showModal()
      orderReviewRef.current?.focus({ preventScroll: true })
    })
  }

  const actionGate = <AccountableActionGate authenticatedActor={managedIdentity ? { id: managedIdentity.userId, label: managedIdentity.email } : undefined} key={pendingAction?.id ?? 'commerce-idle'} action={pendingAction} onCancel={cancelCommerceActionReview} onConfirm={confirmAction} returnFocus={actionTrigger} />
  const actionHistory = managedIdentity ? null : <ActionHistory actions={actions} domain="commerce" />
  const orderDraftRecoveryWarning = orderDraftRead.status === 'ready'
    && orderDraftIssue.startsWith('Order confirmed, but its local recovery copy remains:')
  const orderDraftRecoveryBlocked = orderDraftRead.status === 'invalid'
    || orderDraftRead.status === 'unavailable'
  const orderDraftRecoveryVisible = !orderDraftActive
    && !pendingAction
    && (orderDraftRead.status === 'ready' || orderDraftRecoveryBlocked)
  const shopOrderControlNext = orderDraftRecoveryBlocked
    ? 'Repair saved order draft'
    : pendingStorefrontRequests.length
      ? 'Review Ecommerce inbox'
      : actionOrders.length
        ? 'Finish fulfilment queue'
        : paymentReview.length
          ? 'Reconcile payment exceptions'
          : closableOrders.length
            ? 'Save daily close'
            : 'Ready for new orders'
  const shopOrderControlRows = [
    ['Online inbox', pendingStorefrontRequests.length ? `${pendingStorefrontRequests.length} waiting` : 'Clear'],
    ['Fulfilment', actionOrders.length ? `${actionOrders.length} needs action` : 'Clear'],
    ['Payment', paymentReview.length ? `${paymentReview.length} review` : 'Clear'],
    ['Recovery', orderDraftRecoveryBlocked ? 'Blocked' : orderDraftRecoveryVisible ? 'Resume available' : 'Ready'],
    ['Write status', commerceCanWrite && !pendingAction ? 'Ready' : 'Locked'],
  ] as const
  const shopOrderControlBoundary = 'Owner confirms orders, payments, refunds, deliveries, cancellations, and stock changes.'
  const shopOrderLifecycleRows = [
    ['Capture', pendingStorefrontRequests.length || legacyWebsiteWorkWaiting ? `${pendingStorefrontRequests.length + (legacyWebsiteWorkWaiting ? 1 : 0)} online` : openOrders.length ? `${openOrders.length} open` : 'Ready'],
    ['Reserve', managedInventoryProjection ? 'ATP active' : 'Catalog stock'],
    ['Fulfil', actionOrders.length ? `${actionOrders.length} action` : openOrders.length ? 'In progress' : 'Ready'],
    ['Collect', paymentReview.length ? `${paymentReview.length} review` : 'Clear'],
    ['Replenish', activePurchaseOrders.length ? `${activePurchaseOrders.length} active PO` : lowStock.length ? `${lowStock.length} reorder` : 'Clear'],
    ['Return', returnDraft ? 'Drafting' : commerce.orders.some((order) => order.returns?.length) ? 'Recorded' : 'Accountable'],
  ] as const
  const pendingPaymentOrders = commerce.orders.filter((order) => order.status !== 'cancelled' && order.paymentStatus === 'pending')
  const refundExposureOrders = commerce.orders.filter((order) => order.refundStatus === 'due')
  const supplierReceiptExposure = overduePurchaseOrders.length + dueSoonPurchaseOrders.length + partiallyReceivedPurchaseOrders.length
  const supplierInvoiceMatches = purchaseOrderRows.flatMap(({ purchaseOrder }) => (
    purchaseOrder.supplierInvoice ? [commerceSupplierInvoiceMatch(commerce, purchaseOrder)] : []
  ))
  const supplierInvoiceExceptions = supplierInvoiceMatches.filter((match) => match.status !== 'matched')
  const supplierInvoicesPendingReview = supplierInvoiceMatches.filter((match) => match.status === 'matched' && !match.payableReady)
  const supplierInvoicesPayableReady = supplierInvoiceMatches.filter((match) => match.payableReady)
  const shopAccountingNext = !commerceCanWrite
    ? 'Restore accounting readiness'
    : pendingAction
      ? 'Approve pending Shop action'
      : pendingPaymentOrders.length
        ? 'Review payment exceptions'
        : refundExposureOrders.length
          ? 'Review refund exposure'
          : supplierInvoiceExceptions.length
            ? 'Resolve invoice variance'
            : supplierInvoicesPendingReview.length
              ? 'Review matched invoice'
              : supplierPayablesAging.overdueInvoiceCount
                ? 'Review overdue supplier invoice'
          : supplierReceiptExposure
            ? 'Receive supplier evidence'
            : lowStock.length
              ? 'Reconcile stock evidence'
              : closableOrders.length
                ? 'Save daily close'
                : 'Accounting package ready'
  const shopAccountingRows = [
    ['Sales', closableOrders.length ? `${closableOrders.length} ready` : latestClose ? 'Closed today' : 'No close'],
    ['Payments', pendingPaymentOrders.length ? `${pendingPaymentOrders.length} exception` : 'Clear'],
    ['Refunds', refundExposureOrders.length ? `${refundExposureOrders.length} due` : commerce.orders.some((order) => order.refundStatus === 'settled') ? 'Settled evidence' : 'Clear'],
    ['Receipts', supplierReceiptExposure ? `${supplierReceiptExposure} review` : activePurchaseOrders.length ? 'Open supply' : 'Clear'],
    ['Invoices', supplierInvoiceExceptions.length ? `${supplierInvoiceExceptions.length} variance` : supplierInvoicesPendingReview.length ? `${supplierInvoicesPendingReview.length} review` : supplierPayablesAging.overdueInvoiceCount ? `${supplierPayablesAging.overdueInvoiceCount} overdue` : supplierInvoicesPayableReady.length ? `${supplierInvoicesPayableReady.length} ready` : 'None'],
    ['Inventory', lowStock.length ? `${lowStock.length} reconcile` : managedInventoryProjection ? 'ATP evidence' : 'Catalog evidence'],
    ['Export gate', commerceCanWrite && !pendingAction ? 'Review only' : 'Locked'],
  ] as const
  const shopAccountingReadiness = <section className="shop-order-control" aria-label="Shop accounting readiness">
    <div><span className="core-eyebrow">Accounting readiness</span><strong>{shopAccountingNext}</strong><small>AI checks sales capture, payment exceptions, refund exposure, supplier receipts, inventory evidence, and manager review before any accounting export is reviewed. No ledger, tax, payment, payable, refund, inventory, or Shop write runs from this panel.</small></div>
    <div className="shop-order-control-rows">{shopAccountingRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const shopAccountingPacketRows = [
    ['Close', latestCloseDownload ? 'CSV ready' : closePreview ? `${closableOrders.length} ready` : 'Close first'],
    ['Ledger', latestCloseDownload ? 'Review import' : 'Not posted'],
    ['Tax', 'Not configured'],
    ['Payables', supplierInvoiceExceptions.length ? `${supplierInvoiceExceptions.length} blocked` : supplierInvoicesPendingReview.length ? `${supplierInvoicesPendingReview.length} match review` : supplierPayablesAging.overdueInvoiceCount ? `${supplierPayablesAging.overdueInvoiceCount} overdue` : supplierPayablesAging.dueWithin7DaysInvoiceCount ? `${supplierPayablesAging.dueWithin7DaysInvoiceCount} due this week` : supplierPayablesDownload ? `${supplierPayablesDownload.artifact.readyInvoiceCount} CSV ready` : 'None created'],
    ['Receivables', receivablesAging.overdueOrders ? `${receivablesAging.overdueOrders} overdue` : customerReceivablesDownload ? `${customerReceivablesDownload.artifact.outstandingOrderCount} CSV ready` : 'None outstanding'],
    ['Settlement', paymentReview.length ? `${paymentReview.length} exception` : 'External proof only'],
    ['Audit', latestClose?.evidenceReference ? 'Evidence linked' : 'Need close evidence'],
  ] as const
  const shopAccountingPacket = <section className="shop-order-control" aria-label="Shop accounting export packet">
    <div><span className="core-eyebrow">Accounting export packet</span><strong>{latestCloseDownload || supplierPayablesDownload || customerReceivablesDownload ? 'Ready for accountant review' : closePreview ? 'Close before export' : 'No export package yet'}</strong><small>AI packages reviewed sales and exact supplier payables with source evidence for accounting review. No ledger post, tax filing, bank settlement, refund, payment, inventory, or Shop write runs from this packet.</small>{supplierPayablesDownload ? <small><a className="text-link" data-supplier-payables-handoff="review-required" download={supplierPayablesDownload.filename} href={supplierPayablesDownload.href}>Download supplier payables CSV</a> · {formatMoney(supplierPayablesDownload.artifact.netPayableTotalMmk)} net · {supplierPayablesAging.overdueInvoiceCount ? `${formatMoney(supplierPayablesAging.totalsMmk.overdue)} overdue` : supplierPayablesAging.dueWithin7DaysInvoiceCount ? `${formatMoney(supplierPayablesAging.totalsMmk.due_7_days)} due within 7 days` : 'nothing due within 7 days'} · {formatMoney(supplierPayablesDownload.artifact.supplierCreditTotalMmk)} supplier credit · no payment initiated</small> : null}{customerReceivablesDownload ? <small><a className="text-link" data-customer-receivables-handoff="review-required" download={customerReceivablesDownload.filename} href={customerReceivablesDownload.href}>Download customer receivables CSV</a> · {formatMoney(customerReceivablesDownload.artifact.totalOutstandingMmk)} outstanding · {customerReceivablesDownload.artifact.overdueOrderCount ? `${formatMoney(customerReceivablesDownload.artifact.overdueOutstandingMmk)} overdue` : 'nothing overdue'} · no collection initiated</small> : null}</div>
    <div className="shop-order-control-rows">{shopAccountingPacketRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>

  // Owner-language monthly statement, derived from the same operating record.
  // The ledger is a projection: it fails closed (null) rather than show an
  // unbalanced statement, so the panel simply does not render on imbalance.
  const shopStatementAsOf = new Date(purchaseOrderClock).toISOString()
  const shopLedgerJournal = buildShopLedgerJournal(commerce)
  const shopMonthlyStatement = shopLedgerJournal
    ? projectShopMonthlyStatement(
        shopLedgerJournal,
        projectShopArAgingSummary(commerce, shopStatementAsOf),
        projectShopApAgingSummary(commerce, shopStatementAsOf),
        { asOf: shopStatementAsOf },
      )
    : null
  const shopMonthlyStatementPanel = shopMonthlyStatement
    ? <Suspense fallback={null}><ShopMonthlyStatement statement={shopMonthlyStatement} /></Suspense>
    : null

  const afterSalesCount = commerce.orders.reduce((total, order) => (
    total + (order.returns?.length ?? 0) + (order.supportCases?.length ?? 0)
  ), 0)
  const incomingRequestCount = pendingStorefrontRequests.length + (legacyWebsiteWorkWaiting ? 1 : 0)
  const yangonDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' })
  const todayInYangon = yangonDateFmt.format(new Date(purchaseOrderClock))
  const todayOrders = commerce.orders.filter((order) => (
    order.status !== 'cancelled' && yangonDateFmt.format(new Date(order.createdAt)) === todayInYangon
  ))
  const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total, 0)
  const shopTodayMetrics = [
    { label: 'Open orders', value: String(openOrders.length), tone: actionOrders.length ? 'attention' as const : 'ready' as const },
    { label: "Today's sales", value: todayOrders.length ? formatMoney(todayRevenue) : '—' },
    { label: 'Stock alerts', value: String(lowStock.length), tone: lowStock.length ? 'attention' as const : 'ready' as const },
    { label: 'Outstanding', value: formatMoney(receivablesAging.totalOutstandingMmk), tone: receivablesAging.overdueOrders ? 'attention' as const : 'ready' as const },
  ]
  const shopTodayModules = [
    { label: 'Sell & POS', detail: 'Counter, cart, payment choice, tax and receipt evidence', status: `${commerce.items.length} items`, to: '/shop/?tab=counter' },
    { label: 'Orders & fulfilment', detail: 'Channel intake, allocation, promise, delivery and returns', status: actionOrders.length ? `${actionOrders.length} need action` : `${openOrders.length} open`, to: '/shop/?tab=orders', tone: actionOrders.length ? 'attention' as const : 'ready' as const },
    { label: 'Inventory & purchasing', detail: 'Locations, lots, ATP, counts, suppliers and receiving', status: lowStock.length ? `${lowStock.length} low` : activePurchaseOrders.length ? `${activePurchaseOrders.length} PO` : 'Ready', to: '/shop/?tab=inventory', tone: lowStock.length || overduePurchaseOrders.length ? 'attention' as const : 'ready' as const },
    { label: 'Customers & after-sales', detail: 'Credit, receivables, appointments, support and warranty trail', status: afterSalesCount ? `${afterSalesCount} records` : 'Ready', to: '/shop/?tab=orders#shop-order-history' },
    { label: 'Finance controls', detail: 'Payment review, daily close, settlement and accounting export', status: paymentReview.length ? `${paymentReview.length} review` : latestClose ? 'Close recorded' : 'Ready to close', to: '/shop/?tab=orders#shop-close-controls', tone: paymentReview.length ? 'attention' as const : 'ready' as const },
    { label: 'Online channels', detail: 'Website and Ecommerce requests enter one Shop authority', status: incomingRequestCount ? `${incomingRequestCount} waiting` : 'Inbox clear', to: '/shop/?tab=orders', tone: incomingRequestCount ? 'attention' as const : 'ready' as const },
  ]
  const shopProfitControl = projectShopProfitControl({
    canWrite: commerceCanWrite,
    pendingAction: Boolean(pendingAction),
    catalogItemCount: commerce.items.length,
    incomingRequestCount,
    latePromiseCount: actionOrders.filter((order) => commerceOrderPromiseUrgency(order, purchaseOrderClock) === 'late').length,
    paymentPendingCount: pendingPaymentOrders.length,
    overdueReceivableCount: receivablesAging.overdueOrders,
    overdueReceivableMmk: receivablesAging.overdueMmk,
    refundDueCount: refundExposureOrders.length,
    lowStockCount: lowStock.length,
    closeReadyCount: closableOrders.length,
    closeReadyMmk: closableOrders.reduce((sum, order) => sum + order.total, 0),
  })
  const stockAttentionRows = stockRows.filter(({ item }) => item.onHand <= item.reorderAt)
  const stockCatalogRows = stockRows.filter(({ item }) => item.onHand > item.reorderAt)

  function renderStockRow({ item }: (typeof stockRows)[number]) {
    const active = activePurchaseOrderBySku.get(item.sku)
    const catalogEditing = catalogEditDraft?.sku === item.sku
    const editing = purchaseOrderDraft?.mode === 'create'
      ? purchaseOrderDraft.sku === item.sku
      : purchaseOrderDraft?.mode === 'receive'
        ? purchaseOrderDraft.purchaseOrderId === active?.purchaseOrder.id
        : false
    const stockNeedsAttention = item.onHand <= item.reorderAt
    const stockAttentionLabel = stockNeedsAttention
      ? item.onHand === item.reorderAt ? 'At reorder level' : `${item.reorderAt - item.onHand} below reorder`
      : null
    return <div className="data-row" data-receiving={editing || catalogEditing} data-stock-attention={stockNeedsAttention ? 'true' : 'false'} role="row" key={item.sku}>
      <span role="rowheader"><ShopProductPhotoControl disabled={commerceControlsDisabled} name={item.name} scope={productImageScope} sku={item.sku} /><span className="stock-row-copy"><strong>{item.name}</strong>{stockAttentionLabel ? <small className="stock-attention-label">{stockAttentionLabel}</small> : null}<small>{item.sku}</small></span></span>
      <span className={stockNeedsAttention ? 'warning-text' : ''} role="cell">{item.onHand}</span>
      <span role="cell">{item.reorderAt}</span>
      <span role="cell">{formatMoney(item.price)}</span>
      <span className="catalog-row-actions" role="cell">
        <button aria-controls="catalog-item-editor" aria-expanded={catalogEditing} aria-label={`Edit price and reorder level for ${item.name}`} className="text-link" disabled={commerceControlsDisabled} ref={(node) => { if (node) catalogEditTriggerRefs.current.set(item.sku, node); else catalogEditTriggerRefs.current.delete(item.sku) }} type="button" onClick={() => openCatalogItemEditor(item.sku)}>{catalogEditing ? 'Editing' : 'Edit'}</button>
        <button aria-expanded={editing} aria-label={active ? `Receive stock for ${item.name}` : `Order stock for ${item.name}`} className="text-link" disabled={commerceControlsDisabled} ref={(node) => { if (node) purchaseOrderTriggerRefs.current.set(item.sku, node); else purchaseOrderTriggerRefs.current.delete(item.sku) }} type="button" onClick={() => openPurchaseOrder(item.sku)}>{editing ? 'Continue' : active ? 'Receive' : stockNeedsAttention ? 'Reorder' : 'Order'}</button>
      </span>
    </div>
  }

  if (tab === 'today') return <div className="operation-module shop-today-module">
    {commerceBoundary}
    <Suspense fallback={null}><ShopToday catalogReady={commerce.items.length > 0} metrics={shopTodayMetrics} modules={shopTodayModules} nextAction={shopAgentJob} nextDetail={shopAgentReason} nextTo={shopAgentPath} profitControl={shopProfitControl} /></Suspense>
    {actionGate}
  </div>

  if (tab === 'counter') return <div className="operation-module shop-counter-module">
    {counterBoundary}
    {shopTradeDemoNotice}
    <ShopCounter businessTemplate={activeShopBusinessTemplate} canCompleteInOneReview={confirmedLocalShop && !managedIdentity} disabled={commerceControlsDisabled || (!confirmedLocalShop && !managedIdentity) || shopTradeDemoCheckoutBlocked} industryPack={shopPack} initialCustomer={shopCounterCustomer} initialQuery={shopCounterSearch} items={commerce.items} localDemoStatus={counterLocalDemoStatus} lowStockCount={lowStock.length} loyaltyPoints={shopLoyaltyPoints} onReview={reviewCounterSale} openOrderCount={openOrders.length} paymentQrScope={paymentQrScope} productImageScope={productImageScope} sampleCatalogActive={shopSampleCatalogActive} />
    <Suspense fallback={null}><ReceiptDialog ack={activeReceiptAck} loyalty={receiptLoyalty} onClose={() => { setReceiptAck(null); setCounterReceiptOrderId('') }} paymentQrScope={paymentQrScope} /></Suspense>
    {actionGate}
  </div>

  if (tab === 'orders') return <div className={`operation-module orders-module${returnDraft && selectedReturnLine || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft || correctionDraft ? ' has-return-draft' : ''}`}>
    {commerceBoundary}
    <section className="core-panel order-queue-panel order-workspace" id="shop-order-queue">
      <div className="panel-head"><div><span className="core-eyebrow">Orders</span><h2>{actionOrders.length} {actionOrders.length === 1 ? 'order needs' : 'orders need'} action</h2></div><div className="order-queue-actions"><span className="panel-note">{openOrders.length} in fulfilment</span>{!orderDraftRecoveryVisible ? <button className="core-button primary compact" disabled={!commerceCanWrite || Boolean(pendingAction) || !orderDraftInitialized || orderDraftRecoveryBlocked} onClick={() => openOrderComposer()} ref={orderComposerTriggerRef} type="button">{!orderDraftInitialized ? 'Loading orders' : orderDraftRead.status === 'unavailable' ? 'Recovery unavailable' : 'New order'}</button> : null}</div></div>
      {orderDraftRecoveryVisible ? <div className={`order-draft-recovery ${orderDraftRecoveryBlocked || orderDraftRecoveryWarning ? 'is-blocked' : ''}`} role={orderDraftRecoveryBlocked || orderDraftRecoveryWarning ? 'alert' : 'status'}>
        <div>
          <strong>{orderDraftRecoveryWarning
            ? 'Confirmed order left a saved recovery copy'
            : orderDraftRead.status === 'ready'
              ? 'Unfinished order saved on this device'
              : orderDraftRead.status === 'invalid'
                ? 'Saved order draft needs recovery'
                : 'Order recovery unavailable'}</strong>
          <small>{orderDraftRecoveryWarning
            ? orderDraftIssue
            : orderDraftRead.status === 'ready' && orderDraftRead.draft
            ? `${orderDraftRead.draft.lines.length} ${orderDraftRead.draft.lines.length === 1 ? 'item' : 'items'} · revision ${orderDraftRead.draft.revision} · ${new Date(orderDraftRead.draft.savedAt).toLocaleString()}`
            : orderDraftRead.error}</small>
          {orderDraftRecoveryWarning && orderDraftRead.draft ? <small>{orderDraftRead.draft.lines.length} {orderDraftRead.draft.lines.length === 1 ? 'item' : 'items'} · revision {orderDraftRead.draft.revision} · review before creating another order</small> : null}
        </div>
        <div className="order-draft-recovery-actions">
          {orderDraftRead.status === 'ready' ? <button className="core-button compact" onClick={resumeSavedOrderDraft} type="button">Resume order</button> : <Link className="text-link" to="/settings/#controls">{orderDraftRead.status === 'invalid' ? 'Export evidence' : 'Open Settings'}</Link>}
          {orderDraftRead.status !== 'unavailable' ? <button className="text-link danger-text" disabled={orderDraftSaving} onClick={() => void discardSavedOrderDraft()} type="button">{orderDraftRead.status === 'ready' ? 'Discard' : 'Discard unreadable draft'}</button> : null}
        </div>
      </div> : null}
      {orderRescheduleReview ? <section aria-label="Customer order reschedule review" className="order-draft-recovery" id="shop-order-reschedule-review" tabIndex={-1}>
        <div>
          <strong>Customer asks to change the promise for {orderRescheduleReview.intent.orderId}</strong>
          <small>{formatTime(orderRescheduleReview.intent.originalPromisedAt)} → {formatTime(orderRescheduleReview.intent.requestedPromisedAt)} · {orderRescheduleReview.intent.reason}</small>
          <small>{formatMoney(orderRescheduleReview.intent.originalTotalMmk)} original → {formatMoney(orderRescheduleReview.draft.totalMmk)} currently repriced · replacement {orderRescheduleReview.intent.replacementRequestId}</small>
          <small>{ecommerceOrderRescheduleShopState(commerce, orderRescheduleReview.intent) === 'replacement_needed' ? 'The original is already cancelled with this exact evidence. Resume the recovered replacement at the requested promise.' : 'Step 1 rechecks current promise policy, cancels, and releases the original. Step 2 separately confirms the repriced replacement and requested time.'}</small>
        </div>
        <div className="order-draft-recovery-actions">
          <button className="core-button primary compact" disabled={commerceControlsDisabled} onClick={() => void prepareOrderRescheduleReplacement()} type="button">{ecommerceOrderRescheduleShopState(commerce, orderRescheduleReview.intent) === 'replacement_needed' ? 'Resume reschedule' : 'Review reschedule'}</button>
          <button className="core-button compact" disabled={Boolean(pendingAction)} onClick={() => { setOrderRescheduleReview(null); setNotice('Reschedule review closed. Nothing changed.') }} type="button">Close review</button>
        </div>
      </section> : null}
      {orderAmendmentReview ? <section aria-label="Customer order change review" className="order-draft-recovery" id="shop-order-amendment-review" tabIndex={-1}>
        <div>
          <strong>Customer asks to replace {orderAmendmentReview.intent.orderId}</strong>
          <small>{ecommerceOrderAmendmentSummary(orderAmendmentReview.intent)} · {orderAmendmentReview.intent.reason}</small>
          <small>{formatMoney(orderAmendmentReview.intent.originalTotalMmk)} original → {formatMoney(orderAmendmentReview.draft.totalMmk)} repriced · replacement {orderAmendmentReview.intent.replacementRequestId}</small>
          <small>{ecommerceOrderAmendmentShopState(commerce, orderAmendmentReview.intent) === 'replacement_needed' ? 'The original is already cancelled with this exact evidence. Resume the recovered replacement draft.' : 'Step 1 cancels and releases the original under accountable review. Step 2 separately confirms the repriced replacement order.'}</small>
        </div>
        <div className="order-draft-recovery-actions">
          <button className="core-button primary compact" disabled={commerceControlsDisabled} onClick={() => void prepareOrderAmendmentReplacement()} type="button">{ecommerceOrderAmendmentShopState(commerce, orderAmendmentReview.intent) === 'replacement_needed' ? 'Resume replacement' : 'Review replacement'}</button>
          <button className="core-button compact" disabled={Boolean(pendingAction)} onClick={() => { setOrderAmendmentReview(null); setNotice('Order change review closed. Nothing changed.') }} type="button">Close review</button>
        </div>
      </section> : null}
      {cancellationDraft ? <section aria-label="Customer cancellation review" className="order-draft-recovery" id="shop-cancellation-review" tabIndex={-1}>
        <div>
          <strong>Customer asks to cancel {cancellationDraft.orderId}</strong>
          <small>{cancellationDraft.reasonCode.replaceAll('_', ' ')} · {cancellationDraft.reason}</small>
          <small>{cancellationDraft.id} · requested {new Date(cancellationDraft.createdAt).toLocaleString()} · {formatMoney(cancellationDraft.totalMmk)} · payment {cancellationDraft.paymentStatus}</small>
          <small>Shop rechecked the exact acknowledgement, active order, reserved stock, payment, and refund state. No message, refund, provider call, or cancellation has run.</small>
        </div>
        <div className="order-draft-recovery-actions">
          <button className="core-button primary compact" disabled={commerceControlsDisabled} onClick={() => cancelOrder(cancellationDraft.orderId, cancellationDraft)} type="button">Review cancellation</button>
          <button className="core-button compact" disabled={Boolean(pendingAction)} onClick={keepOrderFromCancellation} type="button">Keep order</button>
        </div>
      </section> : null}
      <OrderList acknowledgementDownloads={orderAcknowledgementDownloads} canCancel={(orderId) => commerceOrderHasReleasableReservation(commerce, orderId)} disabled={commerceControlsDisabled} highlightedTargetId={commerceLocation.hash.startsWith('#shop-order-') ? commerceLocation.hash.slice(1) : ''} onAdvance={advanceOrder} onCancel={cancelOrder} onReconcilePayment={reconcilePayment} onSettleRefund={settleRefund} onSettleSale={settleSale} onViewReceipt={setReceiptAck} orders={actionOrders} />
      <details className="shop-business-controls">
        <summary><span>Daily tools</span><small>Reports and setup when needed</small></summary>
        <div className="shop-business-controls-content">
          {shopCommandCenter}
          {shopSetupGuide}
          <section className="shop-order-control" aria-label="Shop order control">
            <div><span className="core-eyebrow">Order control</span><strong>{shopOrderControlNext}</strong><small>{shopOrderControlBoundary}</small></div>
            <div className="shop-order-control-rows">{shopOrderControlRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
          </section>
          <section className="shop-order-control" aria-label="Shop order lifecycle">
            <div><span className="core-eyebrow">Order lifecycle</span><strong>Capture to return</strong><small>AI guides capture, reserve, fulfil, collect, replenish, and returns. Owner confirms orders, payments, refunds, deliveries, cancellations, and stock writes.</small></div>
            <div className="shop-order-control-rows">{shopOrderLifecycleRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
          </section>
          {shopAccountingReadiness}
          {shopAccountingPacket}
          {shopMonthlyStatementPanel}
        </div>
      </details>
    </section>
    <details className="core-panel today-more order-workflow-controls">
      <summary><span>Order overview</span><small>{actionOrders.length} active · {receivablesAging.overdueOrders} payment overdue</small></summary>
      <div className="today-more-content">
        <Suspense fallback={null}><ShopOperatingFlow
          closeReady={closableOrders.length}
          confirmed={commerce.orders.filter((order) => order.status === 'confirmed').length}
          disabled={commerceControlsDisabled || !orderDraftInitialized || orderDraftRecoveryBlocked}
          incomingOnline={pendingStorefrontRequests.length}
          incomingWebsite={managedIdentity ? websiteIntakes.filter((intake) => intake.status === 'pending_confirmation').length : Number(legacyWebsiteWorkWaiting)}
          onOpenOrder={openOrderComposer}
          overdue={actionOrders.filter((order) => commerceOrderPromiseUrgency(order, purchaseOrderClock) === 'late').length}
          paymentPending={commerce.orders.filter((order) => order.status !== 'cancelled' && order.paymentStatus === 'pending').length}
          preparing={commerce.orders.filter((order) => order.status === 'preparing').length}
          ready={commerce.orders.filter((order) => order.status === 'ready').length}
          refundDue={commerce.orders.filter((order) => order.refundStatus === 'due').length}
        /></Suspense>
        <ReceivablesAging aging={receivablesAging} disabled={commerceControlsDisabled} onRecordContact={recordCollectionContact} />
      </div>
    </details>
    <Suspense fallback={null}><ShopServiceSchedule
      actor={managedIdentity?.email ?? 'Local Shop operator'}
      commerce={commerce}
      disabled={shopScheduleControlsDisabled}
      initiallyOpen={commerceLocation.hash === '#shop-service-schedule'}
      onScheduleChange={setShopSchedule}
    /></Suspense>
    <dialog aria-labelledby="order-composer-title" className="order-composer-dialog" onClose={() => {
      setOrderDraftActive(false)
      setResumedOrderDraft(null)
      setOrderDraftConflict(false)
    }} ref={orderComposerRef}>
      <div className="order-composer-head"><div><span className="core-eyebrow">New order</span><h2 id="order-composer-title" ref={orderComposerHeadingRef} tabIndex={-1}>Add an order</h2><p>Choose the fastest source. Nothing changes until the separate confirmation step.</p></div><div className="order-composer-actions">{orderDraftHasMeaningfulFields && !preparedChannelDraft && !preparedEcommerceDraft ? <button className="text-link danger-text" disabled={orderDraftSaving || orderDraftConflict} onClick={() => void discardSavedOrderDraft()} type="button">Discard draft</button> : null}<button aria-label="Close new order" className="core-button compact" onClick={closeOrderComposer} type="button">Close</button></div></div>
      {orderDraftActive && orderEntryMode === 'manual' && !preparedChannelDraft && !preparedEcommerceDraft && (orderDraftHasMeaningfulFields || resumedOrderDraft || orderDraftIssue) ? <div className={`order-draft-status ${orderDraftConflict || resumedOrderNeedsReview ? 'needs-review' : ''}`} role={orderDraftConflict ? 'alert' : 'status'}>
        <div>
          <strong>{orderDraftConflict
            ? 'Saved draft changed in another tab'
            : resumedOrderNeedsReview
              ? 'Review current Shop values'
              : orderDraftSaving
                ? 'Saving unfinished order'
                : orderDraftRead.status === 'ready'
                  ? 'Draft saved on this device'
                  : 'Unfinished order'}</strong>
          <small>{orderDraftIssue || (orderDraftRead.status === 'ready'
            ? 'Customer, promise, fulfilment, item quantities, and payment can be resumed after reload.'
            : 'This structured manual draft stays on this device. Raw messages and source links are never stored.')}</small>
        </div>
        {resumedOrderNeedsReview ? <button className="core-button compact" disabled={!resumedOrderCanRebind || orderDraftSaving || orderDraftConflict} onClick={() => void acceptCurrentOrderDraftCatalog()} type="button">Use current Shop values</button> : null}
      </div> : null}
      {!preparedEcommerceDraft && !preparedChannelDraft ? <div aria-label="Order source" className="order-entry-methods" role="group">
        <button aria-pressed={orderEntryMode === 'manual'} disabled={Boolean(pendingAction)} onClick={() => setOrderEntryMode('manual')} type="button">Enter order</button>
        <button aria-pressed={orderEntryMode === 'message'} disabled={Boolean(pendingAction)} onClick={() => setOrderEntryMode('message')} type="button">From message</button>
        <button aria-pressed={orderEntryMode === 'online'} disabled={Boolean(pendingAction)} onClick={() => setOrderEntryMode('online')} type="button">Online request</button>
      </div> : null}
      {orderNotice ? <p className="form-notice order-entry-notice" aria-live="polite">{orderNotice}</p> : null}
      {orderEntryMode === 'message' ? <div className="order-entry-panel" data-mode="message"><Suspense fallback={<p className="form-notice" role="status">Loading message intake…</p>}><ChannelOrderIntake disabled={commerceControlsDisabled} identity={managedIdentity ?? undefined} items={commerce.items} onAcceptedFocus={() => requestAnimationFrame(() => preparedChannelRef.current?.focus())} onUse={useChannelDraft} /></Suspense></div> : null}
      {orderEntryMode === 'online' ? <div className="order-entry-panel" data-mode="online">
        <section className="website-intake">
          <div className="website-intake-head"><div><span className="core-eyebrow">Ecommerce inbox</span><strong>{pendingStorefrontRequests.length} requests waiting</strong></div><span className={`status-pill ${managedIdentity ? 'bounded' : 'pending'}`}>{managedIdentity ? 'Managed' : 'Not connected'}</span></div>
          {managedIdentity && pendingStorefrontRequests.length ? pendingStorefrontRequests.slice(0, 20).map((request) => {
            const lines = commerceStorefrontRequestLines(request)
            const itemSummary = lines.length === 1 ? `${lines[0].name} × ${lines[0].quantity}` : `${lines.length} items · ${lines.reduce((total, line) => total + line.quantity, 0)} units`
            return <div className="website-intake-ready" key={request.id}>
              <div><strong>{request.customerReference} · {itemSummary}</strong><small>{request.id} · {request.totalMmk.toLocaleString()} MMK · {request.fulfilment}</small></div>
              <button className="core-button compact" disabled={commerceControlsDisabled} onClick={() => void reviewStorefrontRequest(request.id)} ref={request.id === requestedRequestId ? ecommerceInboxTargetRef : undefined} type="button">Review</button>
            </div>
          }) : <div className="website-intake-record"><strong>{managedIdentity ? 'No Ecommerce request needs Shop review.' : 'Open a company account to use the shared inbox.'}</strong><small>No request creates an order, reserves stock, starts payment, sends a message, or requests delivery.</small></div>}
          <Link className="text-link" to="/ecommerce/">Open Ecommerce</Link>
        </section>
        {confirmedLocalShop && localWebsiteIntakeRead.status === 'error' ? <div className="website-intake-record"><strong>Older Website order could not be checked.</strong><small>Reload before reviewing older Website handoffs. No order was created or changed.</small></div> : null}
        {legacyWebsiteWorkWaiting ? <details className="legacy-website-intake"><summary>Older Website order needs review</summary><Suspense fallback={<div className="website-intake-record"><strong>Opening older Website order…</strong><small>No order is created until you review and confirm it.</small></div>}><WebsiteCommerceIntake catalog={commerce.items} disabled={commerceControlsDisabled} importedSourceIds={importedWebsiteOrderIds} key={`${managedIdentity ? 'managed' : 'local'}:${websiteIntakes.find((intake) => intake.status === 'pending_confirmation')?.id ?? 'none'}`} managedIntakes={websiteIntakes} mode={managedIdentity ? 'managed' : 'local'} onQueueManagedIntake={queueManagedWebsiteIntake} onQueueReadyOrder={queueWebsiteOrder} /></Suspense></details> : null}
      </div> : null}
      {orderEntryMode === 'manual' ? <>
        <div className="order-entry-panel" data-mode="manual">
        {preparedEcommerceDraft ? <div className="channel-source-ready">
          <div><span className="core-eyebrow">Ecommerce request</span><strong>{preparedEcommerceDraft.sourceRequestId}</strong><small>{preparedEcommerceDraft.schema === 'supermega.ecommerce.shop_draft.v7' ? `${preparedEcommerceDraft.operatingContext.operatingUnitLocationId} · ${preparedEcommerceDraft.customerProfile?.phone ? `${preparedEcommerceDraft.customerProfile.phone} · ` : ''}${preparedEcommerceDraft.deliveryAddress ? `${preparedEcommerceDraft.deliveryAddress.township}, ${preparedEcommerceDraft.deliveryAddress.city} · ` : ''}${preparedEcommerceDraft.pricing.promotion.status === 'approved' ? `${preparedEcommerceDraft.pricing.promotion.code} approved · -${formatMoney(preparedEcommerceDraft.pricing.promotion.discountMmk)} · ` : preparedEcommerceDraft.pricing.promotion.status === 'rejected' ? `${preparedEcommerceDraft.pricing.promotion.code} rejected · ` : ''}${preparedEcommerceDraft.pricing.shipping.status === 'approved' ? `${preparedEcommerceDraft.pricing.shipping.zoneCode} delivery · ${formatMoney(preparedEcommerceDraft.pricing.shipping.feeMmk)} · ` : ''}${preparedEcommerceDraft.pricing.tax.status === 'configured' ? `${preparedEcommerceDraft.pricing.tax.taxCode} tax ${formatMoney(preparedEcommerceDraft.pricing.tax.taxMmk)} · ` : 'tax not configured · '}${preparedEcommerceDraft.pricing.payment.adapter.replaceAll('_', ' ')} · policy ${preparedEcommerceDraft.pricing.payment.policyRevision} · governed handoff · ` : ''}{preparedEcommerceDraft.fulfilment} · price locked · payment not authorized · no stock reserved</small></div>
          <button className="text-link" disabled={Boolean(pendingAction)} onClick={() => { detachPreparedOrderSources({ channel: false }); setNotice('Ecommerce source link removed. Enter a manual handoff reference before recovery can save this order.') }} type="button">Remove source link</button>
        </div> : null}
        {preparedChannelDraft && channelOrderDraftIsReady(preparedChannelDraft) ? <div className="channel-source-ready" ref={preparedChannelRef} tabIndex={-1}>
          <div><span className="core-eyebrow">Mapped source</span><strong>{preparedChannelDraft.sourceRecordId}</strong><small>Exact excerpts reviewed; the full message was discarded.</small></div>
          <button className="text-link" disabled={Boolean(pendingAction)} onClick={() => { detachPreparedOrderSources({ ecommerce: false }); setNotice('Source link removed. Enter a manual handoff reference before recovery can save this order.') }} type="button">Remove source link</button>
        </div> : null}
        <form className="core-form compact-form commerce-order-form" id="commerce-manual-order-form" onSubmit={recordOrder}>
          <div className="order-essential-fields">
            <label>Customer<input disabled={commerceControlsDisabled} list={managedInventoryProjection?.clients.length ? 'shop-client-master-options' : undefined} maxLength={80} value={customer} onChange={(event) => { setCustomer(event.target.value); detachPreparedOrderSources() }} placeholder="Name or reference" /></label>
            {managedInventoryProjection?.clients.length ? <datalist id="shop-client-master-options">{managedInventoryProjection.clients.map((client) => <option key={client.id} value={client.name} />)}</datalist> : null}
            <label>Fulfilment<select disabled={commerceControlsDisabled} required value={fulfilment} onChange={(event) => {
              setFulfilment(event.target.value as '' | 'pickup' | 'delivery')
              if (preparedEcommerceDraft) {
                detachPreparedOrderSources({ channel: false })
                setNotice('Fulfilment changed. The Ecommerce source link was removed; review this as a manual order.')
              }
            }}><option value="">Choose pickup or delivery</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>
            <label>Promised for<input autoComplete="off" disabled={commerceControlsDisabled} id="commerce-order-promise" min={localDateTimeInputValue(new Date())} onChange={(event) => setPromisedAt(event.target.value)} ref={orderPromiseRef} required type="datetime-local" value={promisedAt} /></label>
            <label>Payment due<select disabled={commerceControlsDisabled} onChange={(event) => setPaymentTermsDays(Number(event.target.value) as 0 | 7 | 30)} value={paymentTermsDays}><option value="0">At handoff</option><option value="7">7 days after order</option><option value="30">30 days after order</option></select></label>
            <label>Handoff reference<input disabled={commerceControlsDisabled} maxLength={160} onChange={(event) => setFulfilmentReference(event.target.value)} placeholder="Pickup ticket or delivery route" required value={fulfilmentReference} /></label>
            <label>{extraOrderLines.length ? 'Item 1' : 'Item'}<select disabled={commerceControlsDisabled} value={selectedSku} onChange={(event) => { setSku(event.target.value); detachPreparedOrderSources() }}>{!commerce.items.some((item) => item.sku === selectedSku) && selectedSku ? <option disabled value={selectedSku}>{selectedSku} · no longer in Shop</option> : null}{commerce.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.onHand} available</option>)}</select></label>
            <label>{extraOrderLines.length ? 'Quantity 1' : 'Quantity'}<input disabled={commerceControlsDisabled} min="1" max={selected?.onHand ?? 1} type="number" value={quantity} onChange={(event) => { setQuantity(Number(event.target.value)); detachPreparedOrderSources() }} /></label>
            <div className="order-total"><span>{manualOrderLineDrafts.length} {manualOrderLineDrafts.length === 1 ? 'item' : 'items'} · {manualOrderQuantity} units{preparedEcommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7' && preparedEcommerceDraft.pricing.promotion.status === 'approved' ? ` · ${preparedEcommerceDraft.pricing.promotion.code} -${formatMoney(preparedEcommerceDraft.pricing.promotion.discountMmk)}` : ''}{preparedEcommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7' && preparedEcommerceDraft.pricing.shipping.feeMmk ? ` · delivery ${formatMoney(preparedEcommerceDraft.pricing.shipping.feeMmk)}` : ''}{preparedEcommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v7' && preparedEcommerceDraft.pricing.tax.taxMmk ? ` · tax ${formatMoney(preparedEcommerceDraft.pricing.tax.taxMmk)}` : ''}</span><strong>{formatMoney(manualOrderPricedTotal)}</strong></div>
          </div>
          {paymentTermsDays !== 0 ? <p className="form-notice" data-customer-credit-review={orderCreditReview?.reason ?? 'calculation_unavailable'}>
            {orderCreditReview?.allowed
              ? `Credit ready · ${formatMoney(orderCreditReview.exposureBeforeMmk)} → ${formatMoney(orderCreditReview.exposureAfterMmk)} exposure · ${formatMoney(orderCreditReview.policy?.creditLimitMmk ?? 0)} limit`
              : orderCreditReview?.reason === 'customer_hold'
                ? 'Credit blocked · this customer is on hold. Choose payment at handoff or review the policy.'
                : orderCreditReview?.reason === 'terms_exceeded'
                  ? `Credit blocked · the current policy does not allow ${paymentTermsDays}-day terms.`
                  : orderCreditReview?.reason === 'limit_exceeded'
                    ? `Credit blocked · this order would exceed the ${formatMoney(orderCreditReview.policy?.creditLimitMmk ?? 0)} limit.`
                    : 'Credit blocked · set a policy for this exact customer under Close and exceptions.'}
          </p> : null}
          {extraOrderLines.map((line, index) => {
            const item = commerce.items.find((candidate) => candidate.sku === line.sku)
            const lineNumber = index + 2
            return <div className="form-row" key={`${index}:${line.sku}`}>
              <label>Item {lineNumber}<select disabled={commerceControlsDisabled} value={line.sku} onChange={(event) => updateExtraOrderLine(index, { sku: event.target.value })}>{!commerce.items.some((candidate) => candidate.sku === line.sku) && line.sku ? <option disabled value={line.sku}>{line.sku} · no longer in Shop</option> : null}{commerce.items.map((candidate) => <option key={candidate.sku} value={candidate.sku}>{candidate.name} · {candidate.onHand} available</option>)}</select></label>
              <label>Quantity {lineNumber}<input disabled={commerceControlsDisabled} max={item?.onHand ?? 1} min="1" onChange={(event) => updateExtraOrderLine(index, { quantity: Number(event.target.value) })} type="number" value={line.quantity} /></label>
              <button aria-label={`Remove item ${lineNumber}`} className="core-button compact" disabled={commerceControlsDisabled} onClick={() => removeExtraOrderLine(index)} type="button">Remove</button>
            </div>
          })}
          <button className="core-button compact" disabled={commerceControlsDisabled || manualOrderLineDrafts.length >= commerce.items.length || manualOrderLineDrafts.length >= 20} onClick={addOrderLine} type="button">Add item</button>
          {!preparedEcommerceDraft ? <details className="order-options" id="commerce-order-options" ref={orderOptionsRef}>
            <summary><span>Channel and payment</span><small>{channel} · {payment || 'Choose payment'}</small></summary>
            <div className="form-row order-options-fields">
              <label>Channel<select disabled={commerceControlsDisabled} value={channel} onChange={(event) => { setChannel(event.target.value); detachPreparedOrderSources() }}><option>Messenger</option><option>Viber</option><option>Phone</option><option>Website</option><option>Ecommerce</option><option>Walk-in</option></select></label>
              <label>Payment<select disabled={commerceControlsDisabled} ref={orderPaymentRef} value={payment} onChange={(event) => { setPayment(event.target.value); detachPreparedOrderSources({ ecommerce: false }) }}><option value="">Choose payment</option><option>KBZPay</option><option>WavePay</option><option>AYA Pay</option><option>MMQR</option><option>Cash on delivery</option><option>Cash</option><option>Card</option></select></label>
            </div>
          </details> : null}
        </form>
        </div>
        <div className="order-submit-bar" data-ecommerce-payment={preparedEcommerceDraft ? 'true' : 'false'}>
          {preparedEcommerceDraft ? <label className="order-ecommerce-payment"><span>Payment policy</span><select aria-readonly="true" disabled form="commerce-manual-order-form" ref={orderPaymentRef} value={payment}><option>{payment}</option></select></label> : null}
          <button aria-controls={!promisedAt ? 'commerce-order-promise' : !payment && !preparedEcommerceDraft ? 'commerce-order-options' : undefined} className="core-button primary" disabled={commerceControlsDisabled || resumedOrderNeedsReview || orderDraftConflict || orderCreditBlocked || Boolean(preparedEcommerceDraft && (!payment || !promisedAt))} form="commerce-manual-order-form" onClick={!preparedEcommerceDraft && (!promisedAt || !payment) ? focusNextOrderRequirement : undefined} ref={orderReviewRef} type={!preparedEcommerceDraft && (!promisedAt || !payment) ? 'button' : 'submit'}>{!promisedAt ? 'Choose promise' : !payment ? 'Choose payment' : orderCreditBlocked ? 'Credit policy required' : resumedOrderNeedsReview ? 'Review current Shop values' : orderDraftConflict ? 'Reload saved draft' : 'Review order'}</button>
        </div>
      </> : null}
    </dialog>
  <ClosedOrderHistory
    canCorrect={canCorrectOrder}
    canReturn={canReturnOrder}
    correctionCalculation={correctionCalculation}
    correctionDraft={correctionDraft}
    disabled={commerceControlsDisabled}
    onCancelCorrection={cancelCorrectionEditor}
    onCancelReturn={cancelReturnEditor}
    onChangeCorrection={(patch) => setCorrectionDraft((current) => current ? { ...current, ...patch } : current)}
    onChangeReturn={(patch) => setReturnDraft((current) => {
      if (!current) return current
      const next = { ...current, ...patch }
      if (!current.sourceIntent) return next
      const remainsExact = next.sku === current.sourceIntent.sku
        && next.quantity === String(current.sourceIntent.quantity)
      if (remainsExact) return next
      return { orderId: next.orderId, sku: next.sku, quantity: next.quantity, disposition: next.disposition }
    })}
    onOpenCorrection={openCorrectionEditor}
    onOpenRedemption={openRedemptionEditor}
    onOpenReturn={openReturnEditor}
    onReviewCorrection={reviewOrderCorrection}
    loyaltyPoints={shopLoyaltyPoints}
    onReviewReturn={reviewOrderReturn}
    onReviewSupportOpen={reviewSupportCaseOpen}
    onReviewSupportReopen={reviewSupportReopen}
    onReviewSupportService={reviewSupportService}
    onReviewSupportResolution={reviewSupportCaseResolution}
    onOpenSupportService={openSupportService}
    onOpenSupportResolution={openSupportResolution}
    onOpenSupportReopen={openSupportReopen}
    onCancelSupportOpen={() => { setSupportDraft(null); setNotice('Support review closed. Nothing changed.') }}
    onChangeSupportOpen={(patch) => setSupportDraft((current) => current ? { ...current, ...patch } : current)}
    onCancelSupportReopen={() => { setSupportReopenDraft(null); setNotice('Support follow-up review closed. Nothing changed.') }}
    onChangeSupportReopen={(patch) => setSupportReopenDraft((current) => current ? { ...current, ...patch } : current)}
    onCancelSupportService={() => { setSupportServiceDraft(null); setNotice('Support service review closed. Nothing changed.') }}
    onChangeSupportService={(patch) => setSupportServiceDraft((current) => current ? { ...current, ...patch } : current)}
    onCancelSupportResolution={() => { setSupportResolutionDraft(null); setNotice('Support resolution closed. Nothing changed.') }}
    onChangeSupportResolution={(patch) => setSupportResolutionDraft((current) => current ? { ...current, ...patch } : current)}
    onCorrectionEditor={(node) => { correctionEditorRef.current = node }}
    onCorrectionTrigger={(orderId, node) => {
      if (node) correctionTriggerRefs.current.set(orderId, node)
      else correctionTriggerRefs.current.delete(orderId)
    }}
    onReturnEditor={(node) => { returnEditorRef.current = node }}
    onReturnTrigger={(orderId, node) => {
      if (node) returnTriggerRefs.current.set(orderId, node)
      else returnTriggerRefs.current.delete(orderId)
    }}
    acknowledgementDownloads={orderAcknowledgementDownloads}
    onViewReceipt={setReceiptAck}
    orders={closedOrders}
    returnDraft={returnDraft}
    returnLocationPreview={returnLocationPreview}
    supportDraft={supportDraft}
    supportReopenDraft={supportReopenDraft}
    supportServiceDraft={supportServiceDraft}
    supportResolutionDraft={supportResolutionDraft}
    supportWorkloadDownload={supportWorkloadDownload}
  />
  <details className="core-panel today-more order-daily-controls">
    <summary><span>Pricing and credit policies</span><small>{paymentReview.length + lowStock.length} {paymentReview.length + lowStock.length === 1 ? 'item needs' : 'items need'} attention</small></summary>
    <div className="today-more-content">
      <div className="exception-summary"><span><strong>{paymentReview.length}</strong><small>payment review</small></span><span><strong>{lowStock.length}</strong><small>reorder boundaries</small></span></div>
      <div className="boundary-list">{lowStock.map((item) => <Link key={item.sku} to="/shop/?tab=inventory"><strong>{item.name}</strong><small>{item.onHand} on hand</small></Link>)}</div>
      <p className="form-notice">Orders ready: {closePreview?.orderIds.length ? closePreview.orderIds.join(', ') : 'none'} · Payment exceptions: {paymentReview.length ? paymentReview.map((order) => order.id).join(', ') : 'none'} · Stock exceptions: {lowStock.length ? lowStock.map((item) => item.sku).join(', ') : 'none'}</p>
      <details className="compact-disclosure" data-promotion-policy="versioned">
        <summary><span>Promotions</span><small>{currentPromotionPolicy ? `${currentPromotionPolicy.code} · ${formatTaxRate(currentPromotionPolicy.discountBasisPoints)} · ${currentPromotionPolicy.status}` : 'No policy for this code'}</small></summary>
        <form className="core-form compact-form" onSubmit={reviewPromotionPolicy}>
          <div className="form-row">
            <label>Customer code<input autoCapitalize="characters" disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setPromotionPolicyDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="WELCOME" required value={promotionPolicyDraft.code} /></label>
            <label>Discount (%)<input disabled={commerceControlsDisabled} inputMode="decimal" max="100" min="0.01" onChange={(event) => setPromotionPolicyDraft((current) => ({ ...current, discountPercent: event.target.value }))} required step="0.01" type="number" value={promotionPolicyDraft.discountPercent} /></label>
          </div>
          <div className="form-row">
            <label>Minimum order (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="0" onChange={(event) => setPromotionPolicyDraft((current) => ({ ...current, minimumSubtotalMmk: event.target.value }))} required step="1" type="number" value={promotionPolicyDraft.minimumSubtotalMmk} /></label>
            <label>Maximum discount (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => setPromotionPolicyDraft((current) => ({ ...current, maximumDiscountMmk: event.target.value }))} required step="1" type="number" value={promotionPolicyDraft.maximumDiscountMmk} /></label>
          </div>
          <div className="form-row">
            <label>Effective from<input autoComplete="off" disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date(purchaseOrderClock + 60_000))} onChange={(event) => setPromotionPolicyDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} required type="datetime-local" value={promotionPolicyDraft.effectiveFrom} /></label>
            <label>End (optional)<input autoComplete="off" disabled={commerceControlsDisabled} min={promotionPolicyDraft.effectiveFrom || localDateTimeInputValue(new Date(purchaseOrderClock + 60_000))} onChange={(event) => setPromotionPolicyDraft((current) => ({ ...current, effectiveUntil: event.target.value }))} type="datetime-local" value={promotionPolicyDraft.effectiveUntil} /></label>
          </div>
          <label>Policy status<select disabled={commerceControlsDisabled} onChange={(event) => setPromotionPolicyDraft((current) => ({ ...current, status: event.target.value as 'active' | 'inactive' }))} value={promotionPolicyDraft.status}><option value="active">Active · approve when limits match</option><option value="inactive">Inactive · reject this code safely</option></select></label>
          <div className="form-actions"><button className="core-button compact" disabled={commerceControlsDisabled} type="submit">Review promotion</button></div>
          <p className="panel-copy">Shop remains the only price authority. Saving creates a new reviewed revision; inactive safely stops the code without deleting history. Quotes, orders, payments, and customer messages do not run from this setup.</p>
          {currentPromotionPolicy ? <p className="form-notice">Revision {currentPromotionPolicy.revision} · effective {formatTime(currentPromotionPolicy.effectiveFrom)}{currentPromotionPolicy.effectiveUntil ? ` to ${formatTime(currentPromotionPolicy.effectiveUntil)}` : ''} · saved by {currentPromotionPolicy.proof.actor} · evidence {currentPromotionPolicy.proof.evidenceReference}</p> : null}
        </form>
      </details>
      <details className="compact-disclosure" data-shipping-policy="versioned">
        <summary><span>Delivery zones</span><small>{currentShippingPolicy ? `${currentShippingPolicy.zoneCode} · ${formatMoney(currentShippingPolicy.feeMmk)} · ${currentShippingPolicy.promiseMinutes} min` : 'No policy for this zone'}</small></summary>
        <form className="core-form compact-form" onSubmit={reviewShippingPolicy}>
          <div className="form-row">
            <label>Zone code<input autoCapitalize="characters" disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setShippingPolicyDraft((current) => ({ ...current, zoneCode: event.target.value.toUpperCase() }))} required value={shippingPolicyDraft.zoneCode} /></label>
            <label>Fee (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="0" onChange={(event) => setShippingPolicyDraft((current) => ({ ...current, feeMmk: event.target.value }))} required step="1" type="number" value={shippingPolicyDraft.feeMmk} /></label>
          </div>
          <label>Townships<input disabled={commerceControlsDisabled} maxLength={2000} onChange={(event) => setShippingPolicyDraft((current) => ({ ...current, townships: event.target.value }))} placeholder="Bahan, Kamayut, Sanchaung" required value={shippingPolicyDraft.townships} /></label>
          <div className="form-row">
            <label>Promise (minutes)<input disabled={commerceControlsDisabled} max="10080" min="15" onChange={(event) => setShippingPolicyDraft((current) => ({ ...current, promiseMinutes: event.target.value }))} required step="1" type="number" value={shippingPolicyDraft.promiseMinutes} /></label>
            <label>Status<select disabled={commerceControlsDisabled} onChange={(event) => setShippingPolicyDraft((current) => ({ ...current, status: event.target.value as 'active' | 'inactive' }))} value={shippingPolicyDraft.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          </div>
          <div className="form-row">
            <label>Effective from<input autoComplete="off" disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date(purchaseOrderClock + 60_000))} onChange={(event) => setShippingPolicyDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} required type="datetime-local" value={shippingPolicyDraft.effectiveFrom} /></label>
            <label>End (optional)<input autoComplete="off" disabled={commerceControlsDisabled} min={shippingPolicyDraft.effectiveFrom || localDateTimeInputValue(new Date(purchaseOrderClock + 60_000))} onChange={(event) => setShippingPolicyDraft((current) => ({ ...current, effectiveUntil: event.target.value }))} type="datetime-local" value={shippingPolicyDraft.effectiveUntil} /></label>
          </div>
          <div className="form-actions"><button className="core-button compact" disabled={commerceControlsDisabled} type="submit">Review delivery zone</button></div>
          <p className="panel-copy">Shop owns delivery eligibility, fee, and promise. Saving creates a reviewed revision for future Ecommerce handoffs; it never books a courier or contacts a customer.</p>
        </form>
      </details>
      <details className="compact-disclosure" data-payment-policy="versioned">
        <summary><span>Payment methods</span><small>{currentPaymentPolicy ? `${paymentPolicyDraft.adapter.replaceAll('_', ' ')} · ${currentPaymentPolicy.allowedFulfilments.join(' + ')} · revision ${currentPaymentPolicy.revision}` : 'No policy for this method'}</small></summary>
        <form className="core-form compact-form" onSubmit={reviewPaymentPolicy}>
          <div className="form-row">
            <label>Method<select disabled={commerceControlsDisabled} onChange={(event) => setPaymentPolicyDraft((current) => ({ ...current, adapter: event.target.value as PaymentPolicyDraft['adapter'] }))} value={paymentPolicyDraft.adapter}><option value="cash_on_delivery">Cash on delivery</option><option value="pay_on_pickup">Pay on pickup</option><option value="kbzpay_manual">KBZPay · manual proof</option></select></label>
            <label>Allowed handoff<select disabled={commerceControlsDisabled} onChange={(event) => setPaymentPolicyDraft((current) => ({ ...current, allowedFulfilments: event.target.value as PaymentPolicyDraft['allowedFulfilments'] }))} value={paymentPolicyDraft.allowedFulfilments}><option value="delivery">Delivery only</option><option value="pickup">Pickup only</option><option value="both">Delivery and pickup</option></select></label>
          </div>
          <div className="form-row">
            <label>Maximum order (MMK, optional)<input disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => setPaymentPolicyDraft((current) => ({ ...current, maximumOrderMmk: event.target.value }))} placeholder="No limit" step="1" type="number" value={paymentPolicyDraft.maximumOrderMmk} /></label>
            <label>Status<select disabled={commerceControlsDisabled} onChange={(event) => setPaymentPolicyDraft((current) => ({ ...current, status: event.target.value as 'active' | 'inactive' }))} value={paymentPolicyDraft.status}><option value="active">Active</option><option value="inactive">Inactive · block future use</option></select></label>
          </div>
          <label>Staff instructions<input disabled={commerceControlsDisabled} maxLength={240} onChange={(event) => setPaymentPolicyDraft((current) => ({ ...current, instructions: event.target.value }))} required value={paymentPolicyDraft.instructions} /></label>
          <div className="form-row">
            <label>Effective from<input autoComplete="off" disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date(purchaseOrderClock + 60_000))} onChange={(event) => setPaymentPolicyDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} required type="datetime-local" value={paymentPolicyDraft.effectiveFrom} /></label>
            <label>End (optional)<input autoComplete="off" disabled={commerceControlsDisabled} min={paymentPolicyDraft.effectiveFrom || localDateTimeInputValue(new Date(purchaseOrderClock + 60_000))} onChange={(event) => setPaymentPolicyDraft((current) => ({ ...current, effectiveUntil: event.target.value }))} type="datetime-local" value={paymentPolicyDraft.effectiveUntil} /></label>
          </div>
          <div className="form-actions"><button className="core-button compact" disabled={commerceControlsDisabled} type="submit">Review payment method</button></div>
          <p className="panel-copy">Shop approves only the method, fulfilment fit, order limit, and staff instructions for future Ecommerce handoffs. It never charges, transfers money, contacts a customer, or marks payment received.</p>
          {currentPaymentPolicy ? <p className="form-notice">Revision {currentPaymentPolicy.revision} · {currentPaymentPolicy.status} · effective {formatTime(currentPaymentPolicy.effectiveFrom)}{currentPaymentPolicy.effectiveUntil ? ` to ${formatTime(currentPaymentPolicy.effectiveUntil)}` : ''} · {currentPaymentPolicy.instructions} · evidence {currentPaymentPolicy.proof.evidenceReference}</p> : null}
        </form>
      </details>
      <details className="compact-disclosure" data-customer-credit-policy="versioned">
        <summary><span>Customer credit</span><small>{commerce.customerCreditPolicies?.length ? `${commerce.customerCreditPolicies.length} reviewed ${commerce.customerCreditPolicies.length === 1 ? 'policy' : 'revisions'}` : 'Cash terms only'}</small></summary>
        <form className="core-form compact-form" onSubmit={reviewCustomerCreditPolicy}>
          <label>Customer<input disabled={commerceControlsDisabled} list={managedInventoryProjection?.clients.length ? 'shop-client-master-options' : undefined} maxLength={120} onChange={(event) => setCreditPolicyDraft((current) => ({ ...current, customer: event.target.value }))} placeholder="Exact customer name or reference" required value={creditPolicyDraft.customer} /></label>
          <div className="form-row">
            <label>Credit limit (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="0" onChange={(event) => setCreditPolicyDraft((current) => ({ ...current, creditLimitMmk: event.target.value }))} placeholder="500000" required step="1" type="number" value={creditPolicyDraft.creditLimitMmk} /></label>
            <label>Maximum terms<select disabled={commerceControlsDisabled} onChange={(event) => setCreditPolicyDraft((current) => ({ ...current, maxPaymentTermsDays: Number(event.target.value) as 0 | 7 | 30 }))} value={creditPolicyDraft.maxPaymentTermsDays}><option value="0">Payment at handoff</option><option value="7">Up to 7 days</option><option value="30">Up to 30 days</option></select></label>
          </div>
          <label>Account status<select disabled={commerceControlsDisabled} onChange={(event) => setCreditPolicyDraft((current) => ({ ...current, status: event.target.value as CommerceCustomerCreditPolicyStatus }))} value={creditPolicyDraft.status}><option value="active">Active · allow within boundary</option><option value="hold">Hold · block new credit</option></select></label>
          {currentCreditPolicy ? <p className="form-notice"><strong>Current revision {currentCreditPolicy.revision}</strong> · {formatMoney(currentCreditPolicy.creditLimitMmk)} limit · {currentCreditPolicy.maxPaymentTermsDays}-day maximum · {currentCreditPolicy.status} · evidence {currentCreditPolicy.proof.evidenceReference}</p> : creditPolicyCustomer ? <p className="form-notice">No policy exists for this exact customer. New 7/30-day orders remain blocked.</p> : null}
          <div className="form-actions"><button className="core-button compact" disabled={commerceControlsDisabled} type="submit">Review credit policy</button></div>
          <p className="panel-copy">Future credit orders must fit the active limit and terms. A hold stops new credit. This records an internal approval boundary only; it never collects, lends, charges, or contacts the customer.</p>
        </form>
      </details>
      <details className="compact-disclosure" data-tax-configuration="versioned">
        <summary><span>Tax schedule</span><small>{currentTaxConfiguration ? `${currentTaxConfiguration.code} · ${currentTaxConfiguration.jurisdictionCode ?? 'legacy scope'} · ${formatTaxRate(currentTaxConfiguration.rateBasisPoints)}` : 'Not configured'}</small></summary>
        <form className="core-form compact-form" onSubmit={reviewTaxConfiguration}>
          <div className="form-row">
            <label>Tax code<input autoCapitalize="characters" disabled={commerceControlsDisabled} maxLength={12} onChange={(event) => setTaxDraft({ ...effectiveTaxDraft, code: event.target.value.toUpperCase() })} placeholder="Your configured code" required value={effectiveTaxDraft.code} /></label>
            <label>Rate (%)<input disabled={commerceControlsDisabled} inputMode="decimal" max="100" min="0" onChange={(event) => setTaxDraft({ ...effectiveTaxDraft, ratePercent: event.target.value })} placeholder="Enter reviewed rate" required step="0.01" type="number" value={effectiveTaxDraft.ratePercent} /></label>
          </div>
          <label>Label<input disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => setTaxDraft({ ...effectiveTaxDraft, label: event.target.value })} placeholder="How staff recognize this code" required value={effectiveTaxDraft.label} /></label>
          <div className="form-row">
            <label>Jurisdiction code<input autoCapitalize="characters" disabled={commerceControlsDisabled} maxLength={16} onChange={(event) => setTaxDraft({ ...effectiveTaxDraft, jurisdictionCode: event.target.value.toUpperCase() })} placeholder="Reviewed scope, e.g. MM" required value={effectiveTaxDraft.jurisdictionCode} /></label>
            <label>Effective from<input autoComplete="off" disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date(purchaseOrderClock + 60_000))} onChange={(event) => setTaxDraft({ ...effectiveTaxDraft, effectiveFrom: event.target.value })} required type="datetime-local" value={effectiveTaxDraft.effectiveFrom} /></label>
          </div>
          <label>Price treatment<select disabled={commerceControlsDisabled} onChange={(event) => setTaxDraft({ ...effectiveTaxDraft, mode: event.target.value as CommerceTaxMode })} value={effectiveTaxDraft.mode}><option value="exclusive">Add tax to listed price</option><option value="inclusive">Tax included in listed price</option></select></label>
          <div className="form-actions"><button className="core-button compact" disabled={commerceControlsDisabled} type="submit">Review tax setup</button></div>
          <p className="panel-copy">Takes effect only at the reviewed time. Earlier orders keep their original calculation. This does not choose a legal rate, determine branch tax, file, or post externally.</p>
          {currentTaxConfiguration ? <p className="form-notice">Revision {currentTaxConfiguration.revision} · {currentTaxConfiguration.effectiveFrom ? `effective ${formatTime(currentTaxConfiguration.effectiveFrom)} · ` : ''}saved by {currentTaxConfiguration.proof.actor} · evidence {currentTaxConfiguration.proof.evidenceReference}</p> : null}
        </form>
      </details>
      <details className="compact-disclosure" data-account-mapping="versioned">
        <summary><span>Account mapping</span><small>{currentAccountMappingConfiguration ? `Revision ${currentAccountMappingConfiguration.revision} · ${currentAccountMappingConfiguration.mappings.length}/7 roles mapped` : 'Required for mapped exports'}</small></summary>
        <form className="core-form compact-form" onSubmit={reviewAccountMapping}>
          <div className="form-row">
            <label>Payment clearing<input disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setAccountMapping({ ...effectiveAccountMapping, paymentClearing: event.target.value })} placeholder="Reviewed account code" required value={effectiveAccountMapping.paymentClearing} /></label>
            <label>Sales revenue<input disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setAccountMapping({ ...effectiveAccountMapping, salesRevenue: event.target.value })} placeholder="Reviewed account code" required value={effectiveAccountMapping.salesRevenue} /></label>
          </div>
          <div className="form-row">
            <label>Tax payable<input disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setAccountMapping({ ...effectiveAccountMapping, taxPayable: event.target.value })} placeholder="Reviewed account code" required value={effectiveAccountMapping.taxPayable} /></label>
            <label>Legacy / unverified revenue<input disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setAccountMapping({ ...effectiveAccountMapping, legacyRevenue: event.target.value })} placeholder="Reviewed account code" required value={effectiveAccountMapping.legacyRevenue} /></label>
          </div>
          <div className="form-row">
            <label>Sales adjustment<input disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setAccountMapping({ ...effectiveAccountMapping, salesAdjustment: event.target.value })} placeholder="Credit/debit adjustment account" required value={effectiveAccountMapping.salesAdjustment} /></label>
            <label>Correction receivable<input disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setAccountMapping({ ...effectiveAccountMapping, correctionReceivable: event.target.value })} placeholder="Customer amount due" required value={effectiveAccountMapping.correctionReceivable} /></label>
          </div>
          <label>Correction payable<input disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setAccountMapping({ ...effectiveAccountMapping, correctionPayable: event.target.value })} placeholder="Customer refund or credit due" required value={effectiveAccountMapping.correctionPayable} /></label>
          <div className="form-actions"><button className="core-button compact" disabled={commerceControlsDisabled} type="submit">Review account mapping</button></div>
          <p className="panel-copy">Applies only to closes saved after this mapping. Corrections retain their source order and document, and split reviewed receivable, payable, tax, and sales adjustment lines. Historical exports do not change. Every accounting CSV remains review-only and never posts externally.</p>
          {currentAccountMappingConfiguration ? <p className="form-notice">Revision {currentAccountMappingConfiguration.revision} · saved by {currentAccountMappingConfiguration.proof.actor} · evidence {currentAccountMappingConfiguration.proof.evidenceReference}</p> : null}
        </form>
      </details>
      {actionHistory}
    </div>
  </details>
  {/* Design phase 2 item 4: counting the drawer is the ritual that sells this
      product against a paper notebook, so it is a first-class section rather
      than the tail of a policy accordion. The anchor id moves with it, keeping
      the /shop/?tab=orders#shop-close-controls deep links working. */}
  <section aria-labelledby="shop-close-heading" className="core-panel shop-close-day" id="shop-close-controls">
    <div className="section-head"><h2 id="shop-close-heading">Close the day</h2><small>{closableOrders.length ? `${closableOrders.length} ready` : latestClose ? 'Today is closed' : 'Nothing to close yet'}</small></div>
    {/* The appointment book does not post to the ledger, so a treatment completed in the book
        and never rung up at the counter is simply absent from this close and from every report
        after it. This is where she finds that out -- at the moment she is closing, not by going
        looking. It is a prompt, never a blocker: the close below stays available whatever this
        says, because a complimentary treatment, a voucher redemption or a staff treatment are
        all ordinary reasons for a completed appointment to have no sale, and the product has no
        business deciding which. */}
    {appointmentTillReconciliation?.gaps.length ? <section aria-labelledby="shop-appointment-till-heading" className="core-panel shop-appointment-till" data-appointment-till-gaps={appointmentTillReconciliation.unpostedBookings}>
      <div className="section-head">
        <h3 id="shop-appointment-till-heading">Completed, not yet at the counter</h3>
        <small>{appointmentTillReconciliation.unpostedBookings} of {appointmentTillReconciliation.completedBookings} · {formatMoney(appointmentTillReconciliation.unpostedValueMmk)}</small>
      </div>
      <p className="form-notice">These {scheduleVocabulary.plural.toLowerCase()} were completed today and no matching sale was rung up. Ring one up at the counter if it was paid for, or leave it if it was complimentary, prepaid, or settled another way. Nothing here changes an order by itself.</p>
      <ul className="appointment-till-list">
        {appointmentTillReconciliation.gaps.map((gap) => <li key={gap.serviceId}>
          <div>
            <strong>{gap.serviceName}</strong>
            {gap.serviceNameMy ? <small className="shop-product-my" lang="my">{gap.serviceNameMy}</small> : null}
            <small>{gap.unpostedCount} of {gap.completedCount} completed · {gap.chargedQuantity} rung up · {formatMoney(gap.unitPriceMmk)} each</small>
          </div>
          <div>
            <span className="status-pill pending">{formatMoney(gap.unpostedValueMmk)}</span>
            <small>{gap.bookings.filter((booking) => gap.unpostedBookingIds.includes(booking.id)).map((booking) => `${booking.customerName} ${formatTime(booking.startsAt)}`).join(' · ')}</small>
          </div>
        </li>)}
      </ul>
      <Link className="core-button" to="/shop/?tab=counter">Open the counter</Link>
    </section> : null}
    <details className="compact-disclosure" data-close-settlement={closeSettlement?.status ?? 'incomplete'} open={Boolean(closePreview)}>
      <summary><span>Settlement count</span><small>{closePreview ? `${closeExpectedByPayment.size} payment method${closeExpectedByPayment.size === 1 ? '' : 's'} · ${closeSettlement?.status === 'matched' ? 'matched' : closeSettlement?.status === 'variance_review' ? 'variance needs review' : 'complete the count'}` : 'No open close'}</small></summary>
      <section aria-label="Daily settlement count" className="core-form compact-form">
        {effectiveCloseSettlementDraft.length ? effectiveCloseSettlementDraft.map((line) => {
          const expectedMmk = closeExpectedByPayment.get(line.paymentMethod) ?? 0
          const countedMmk = /^(?:0|[1-9]\d*)$/.test(line.countedMmk) ? Number(line.countedMmk) : null
          const varianceMmk = countedMmk !== null && Number.isSafeInteger(countedMmk) ? countedMmk - expectedMmk : null
          const update = (changes: Partial<CloseSettlementDraftLine>) => setCloseSettlementDraft(
            effectiveCloseSettlementDraft.map((candidate) => candidate.paymentMethod === line.paymentMethod ? { ...candidate, ...changes } : candidate),
          )
          return <div className="settlement-method" data-variance={varianceMmk === 0 ? 'matched' : 'review'} key={line.paymentMethod}>
            <div className="form-row">
              <label>{line.paymentMethod} counted<input disabled={commerceControlsDisabled} inputMode="numeric" min="0" onChange={(event) => {
                const countedMmk = event.target.value
                update({ countedMmk, ...(Number(countedMmk) === expectedMmk ? { varianceOwner: '', varianceReason: '' } : {}) })
              }} required step="1" type="number" value={line.countedMmk} /></label>
              <div className="form-notice"><strong>Expected {formatMoney(expectedMmk)}</strong><br />{varianceMmk === null ? 'Enter whole MMK' : varianceMmk === 0 ? 'Matched' : `Variance ${varianceMmk > 0 ? '+' : ''}${formatMoney(varianceMmk)}`}</div>
            </div>
            {varianceMmk !== null && varianceMmk !== 0 ? <div className="form-row">
              <label>Variance owner<input disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => update({ varianceOwner: event.target.value })} placeholder="Responsible person" required value={line.varianceOwner} /></label>
              <label>Review reason<input disabled={commerceControlsDisabled} maxLength={240} onChange={(event) => update({ varianceReason: event.target.value })} placeholder="Why the count differs and what happens next" required value={line.varianceReason} /></label>
            </div> : null}
          </div>
        }) : <p className="form-notice">No reconciled payments are waiting. Save a zero-value close only if the business date still needs an accountable snapshot.</p>}
        <p className="panel-copy">Expected amounts come from completed, reconciled orders. Counted amounts come from the cashier. A variance is retained with its owner and reason; SuperMega does not move money or post externally.</p>
      </section>
    </details>
    <button className="core-button" disabled={commerceControlsDisabled || !closePreview || !closeSettlement} onClick={closeDay} type="button">{closePreview ? 'Review and save close' : legacyCloseNeedsMigration ? 'Close history needs migration' : 'Today is closed'}</button>
    <p className="form-notice" aria-live="polite">{`${closableOrders.length} completed, reconciled orders · ${formatMoney(reconciledValue)} ready to close.`}</p>
    {/* Roadmap §2 item 5 — what was unusual about the day just closed, read from
        the closes already saved. Nothing here is a finding about money owed or
        owing; it points at things worth a look while the till is still open. */}
    {closeAnomaly.state === 'no_close' ? null : <div className="close-anomaly" data-close-anomaly={closeAnomaly.state}>
      {/* The heading names the close it read. The projection means "the most
          recent close", not "today", so on a morning before anything is closed
          this block is about yesterday and has to say so. */}
      <strong>{closeAnomaly.businessDate ? `${closeAnomaly.businessDate} against your usual day` : 'Compared with your usual day'}</strong>
      {closeAnomaly.state === 'building_baseline'
        ? <p className="panel-copy">Close {closeAnomaly.baselineDaysNeeded} more {closeAnomaly.baselineDaysNeeded === 1 ? 'day' : 'days'} and this will point out what stood out about the day you closed. Until then there is no usual day to compare against.</p>
        // An empty flag list proves only that no threshold was crossed.
        // Everything between a quarter and four times the usual day lands here,
        // so "close to your usual day" would be untrue at 3.9× — the discipline
        // comparedMeasures applies to coverage, applied to magnitude.
        : closeAnomaly.state === 'nothing_unusual'
          ? <p className="panel-copy">{closeAnomaly.comparedMeasures.length ? `Nothing in your ${closeAnomalyComparedPhrase(closeAnomaly.comparedMeasures)} was far enough from your usual day to be worth raising.` : 'There is nothing on this close to compare yet.'}</p>
          : <ul className="close-anomaly-list">{closeAnomaly.flags.map((flag) => <li key={flag.measure}>{closeAnomalySentence(flag)}</li>)}</ul>}
    </div>}
    {latestClose?.operator ? <details className="compact-disclosure">
      <summary><span>Last close · {latestClose.businessDate}</span><small>{latestClose.orders} orders · {formatMoney(latestClose.total)}</small></summary>
      <p className="form-notice">{latestClose.operator} · {formatTime(latestClose.createdAt)} · evidence {latestClose.evidenceReference}</p>
      <p className="form-notice">Orders: {latestClose.orderIds?.length ? latestClose.orderIds.join(', ') : 'none'} · Payment exceptions: {latestClose.paymentExceptionOrderIds?.length ? latestClose.paymentExceptionOrderIds.join(', ') : 'none'} · Stock exceptions: {latestClose.stockExceptionSkus?.length ? latestClose.stockExceptionSkus.join(', ') : 'none'}</p>
      {latestClose.settlement ? <p className="form-notice" data-close-settlement-status={latestClose.settlement.status}><strong>Settlement {latestClose.settlement.status === 'matched' ? 'matched' : 'variance under review'}</strong> · expected {formatMoney(latestClose.settlement.totalExpectedMmk)} · counted {formatMoney(latestClose.settlement.totalCountedMmk)} · variance {latestClose.settlement.totalVarianceMmk > 0 ? '+' : ''}{formatMoney(latestClose.settlement.totalVarianceMmk)}</p> : <p className="form-notice">Legacy close · settlement count not recorded</p>}
      {latestCloseDownload ? <button className="core-button" data-close-export="accounting-csv-v1" onClick={() => downloadBlob(latestCloseDownload.filename, new Blob([closeExportFileText(latestCloseDownload.artifact)], { type: 'text/csv;charset=utf-8' }))} type="button">Download close CSV</button> : null}
      {latestAccountingDownload ? <div className="form-notice" data-accounting-handoff="review-required">
        <strong>Accounting review</strong> · balanced {formatMoney(latestAccountingDownload.artifact.totalDebitMmk)} debit / credit · net orders {formatMoney(latestAccountingDownload.artifact.netOrderTotalMmk)} · {latestAccountingDownload.artifact.correctionCount ? `${latestAccountingDownload.artifact.correctionCount} correction ${latestAccountingDownload.artifact.correctionCount === 1 ? 'document' : 'documents'} · ` : ''}{latestAccountingDownload.artifact.accountMappingRevision ? `mapping revision ${latestAccountingDownload.artifact.accountMappingRevision}` : 'account mapping required'} · no external posting
        <br /><a className="text-link" download={latestAccountingDownload.filename} href={latestAccountingDownload.href} onClick={() => emitMetric({ product: 'shop', capability: 'shop-accounting-handoff', action: 'accounting.export.downloaded', ts: Date.now() })}>Download accounting CSV</a>
      </div> : null}
    </details> : null}
  </section>
  <Suspense fallback={null}><ReceiptDialog ack={activeReceiptAck} loyalty={receiptLoyalty} onClose={() => { setReceiptAck(null); setCounterReceiptOrderId('') }} paymentQrScope={paymentQrScope} /></Suspense>
  {actionGate}</div>

  if (tab === 'inventory') return <div className="operation-module">
    {commerceBoundary}
    {!commerce.items.length ? shopCatalogOnboarding : null}
    <section className="core-panel inventory-panel">
      <div className="panel-head"><div><span className="core-eyebrow">Stock</span><h2>Available stock</h2></div><div className="order-queue-actions"><span className="panel-note">{lowStock.length} need attention</span><button aria-controls="stock-count-editor" aria-expanded={Boolean(stockCountDraft)} className="core-button" disabled={commerceControlsDisabled || !commerce.items.length} onClick={openStockCount} ref={stockCountTriggerRef} type="button">{stockCountDraft ? 'Continue count' : commerce.items.length ? 'Count stock' : 'Add products first'}</button></div></div>
      {stockCountDraft ? <form aria-labelledby="stock-count-title" className="stock-receipt-editor stock-count-editor" id="stock-count-editor" onSubmit={reviewStockCount} ref={stockCountEditorRef}>
        <div className="stock-receipt-copy">
          <span className="core-eyebrow">Stock check</span>
          <h3 id="stock-count-title">{commerce.inventoryFoundation ? 'Count one location' : 'Count available units'}</h3>
          <small id="stock-count-help">{commerce.inventoryFoundation
            ? 'Count every physical unit in the selected lot, including reserved units. This records count evidence only.'
            : 'Exclude units already set aside for open orders. This records count evidence only.'}</small>
          <strong aria-live="polite" id="stock-count-preview">{commerce.inventoryFoundation
            ? !stockCountBalance || !stockCountItem
              ? 'Choose one location and lot'
              : stockCountQuantityResult === null
                ? `${stockCountBalance.onHand.toLocaleString()} physical · ${stockCountBalance.reserved.toLocaleString()} reserved · enter at least ${stockCountBalance.reserved.toLocaleString()}`
                : `${stockCountBalance.onHand.toLocaleString()} physical → ${stockCountQuantityResult.toLocaleString()} counted · ${(stockCountItem.onHand + stockCountQuantityResult - stockCountBalance.onHand).toLocaleString()} total available after count`
            : !stockCountItem
              ? 'Choose one item'
              : stockCountQuantityResult === null
                ? `${stockCountItem.onHand.toLocaleString()} recorded · enter counted units`
                : `${stockCountItem.onHand.toLocaleString()} recorded → ${stockCountQuantityResult.toLocaleString()} counted · ${stockCountQuantityResult === stockCountItem.onHand ? 'no variance' : `${stockCountQuantityResult > stockCountItem.onHand ? '+' : ''}${(stockCountQuantityResult - stockCountItem.onHand).toLocaleString()} variance`}`}</strong>
        </div>
        <label>{commerce.inventoryFoundation ? 'Location and lot' : 'Item'}<select aria-describedby="stock-count-help" disabled={commerceControlsDisabled || Boolean(commerce.inventoryFoundation && !managedInventoryProjection)} id="stock-count-sku" onChange={(event) => selectStockCountTarget(event.target.value)} required value={commerce.inventoryFoundation ? stockCountTargetValue : stockCountDraft.sku}><option value="">{commerce.inventoryFoundation ? 'Choose location and lot' : 'Choose an item'}</option>{commerce.inventoryFoundation
          ? managedInventoryProjection?.balances.map((balance) => {
              const item = commerce.items.find((candidate) => candidate.sku === balance.sku)
              const location = managedInventoryProjection.locations.find((candidate) => candidate.id === balance.locationId)
              return <option key={`${balance.stockUnitId}|${balance.locationId}`} value={`${balance.stockUnitId}|${balance.locationId}`}>{item?.name ?? balance.sku} · {location?.name ?? balance.locationId} · {balance.trackingCode} · {balance.onHand.toLocaleString()} physical{balance.reserved ? ` · ${balance.reserved.toLocaleString()} reserved` : ''}</option>
            })
          : commerce.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.sku}</option>)}</select></label>
        <label>{commerce.inventoryFoundation ? 'Counted physical units' : 'Counted available units'}<input aria-describedby="stock-count-help stock-count-preview" aria-invalid={Boolean(stockCountQuantityText) && stockCountQuantityResult === null} disabled={commerceControlsDisabled || !stockCountItem || Boolean(commerce.inventoryFoundation && !stockCountBalance)} id="stock-count-quantity" inputMode="numeric" max={stockCountBalance?.tracking === 'serial' ? 1 : Number.MAX_SAFE_INTEGER} min={stockCountBalance?.reserved ?? 0} onChange={(event) => setStockCountDraft((current) => current ? { ...current, quantity: event.target.value } : current)} placeholder="0" required step="1" type="number" value={stockCountDraft.quantity} /></label>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={cancelStockCount} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled || stockCountQuantityResult === null || Boolean(commerce.inventoryFoundation && !stockCountBalance)} type="submit">Review count</button></div>
      </form> : null}
      <div className="data-table stock-attention-table" data-stock-list="attention" role="table" aria-label="Shop stock">
        <div className="data-row table-head" role="row"><span role="columnheader">Item</span><span role="columnheader">Available</span><span role="columnheader">Reorder</span><span role="columnheader">Price</span><span role="columnheader">Next step</span></div>
        {stockAttentionRows.length ? stockAttentionRows.map(renderStockRow) : <div className="data-row stock-empty-row" role="row"><span role="cell"><strong>No stock needs action.</strong><small>Count stock or open other products only when needed.</small></span></div>}
      </div>
      <details className="inventory-tools-disclosure stock-catalog-disclosure">
        <summary><span><strong>Other products</strong><small>Healthy stock, pricing, and reorder levels</small></span><b>{stockCatalogRows.length} {stockCatalogRows.length === 1 ? 'item' : 'items'}</b></summary>
        <div className="stock-catalog-content">
          <div className="data-table" data-stock-list="catalog" role="table" aria-label="Other Shop products">
            <div className="data-row table-head" role="row"><span role="columnheader">Item</span><span role="columnheader">Available</span><span role="columnheader">Reorder</span><span role="columnheader">Price</span><span role="columnheader">Next step</span></div>
            {stockCatalogRows.length ? stockCatalogRows.map(renderStockRow) : <div className="data-row stock-empty-row" role="row"><span role="cell"><strong>No other products.</strong><small>Every current product appears in the action list above.</small></span></div>}
          </div>
        </div>
      </details>
      {catalogEditDraft && catalogEditItem ? <form aria-labelledby="catalog-item-editor-title" className="stock-receipt-editor" id="catalog-item-editor" onSubmit={reviewCatalogItemUpdate} ref={catalogEditEditorRef}>
        <div className="stock-receipt-copy">
          <span className="core-eyebrow">Edit item</span>
          <h3 id="catalog-item-editor-title">{catalogEditItem.name}</h3>
          <small>{catalogEditItem.sku} · Only price and reorder level change{catalogEditStale ? ' · reload current values' : ''}</small>
        </div>
        <label>Price (MMK)<input aria-invalid={Boolean(catalogEditPriceText) && catalogEditPriceResult === null} autoFocus disabled={commerceControlsDisabled || catalogEditStale} id="catalog-edit-price" inputMode="numeric" max={Number.MAX_SAFE_INTEGER} min="1" onChange={(event) => setCatalogEditDraft((current) => current ? { ...current, price: event.target.value } : current)} required step="1" type="number" value={catalogEditDraft.price} /></label>
        <label>Reorder at<input aria-invalid={Boolean(catalogEditReorderText) && catalogEditReorderResult === null} disabled={commerceControlsDisabled || catalogEditStale} inputMode="numeric" max={Number.MAX_SAFE_INTEGER} min="0" onChange={(event) => setCatalogEditDraft((current) => current ? { ...current, reorderAt: event.target.value } : current)} required step="1" type="number" value={catalogEditDraft.reorderAt} /></label>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={cancelCatalogItemEditor} type="button">Cancel</button><button className="core-button primary" disabled={catalogEditStale ? Boolean(pendingAction) || !commerceCanWrite : commerceControlsDisabled || !catalogEditChanged} onClick={catalogEditStale ? () => openCatalogItemEditor(catalogEditItem.sku) : undefined} type={catalogEditStale ? 'button' : 'submit'}>{catalogEditStale ? 'Reload values' : 'Review changes'}</button></div>
      </form> : null}
      <details className="inventory-tools-disclosure">
        <summary><span><strong>Purchasing &amp; locations</strong><small>Supplier planning, location stock, and available-to-promise</small></span><b>Open when needed</b></summary>
        <div className="inventory-tools-content">
          {supplierControl}
          <section aria-label="AI demand advice" className="core-panel company-backup-panel"><div className="company-backup-head"><div><span className="core-eyebrow">AI demand advice</span><h2>{lockedCapabilityNotice('ai-demand-advice').label}</h2><p>{lockedCapabilityNotice('ai-demand-advice').outcome}</p></div><span className="status-pill">premium</span></div><p className="form-notice">{lockedCapabilityNotice('ai-demand-advice').reason} <a className="text-link" href="/contact/?product=guide&source=managed-intelligence">Talk to us about this.</a></p></section>
          {commerce.items.length ? <Suspense fallback={null}><ShopInventoryFoundation actor={managedIdentity?.userId ?? 'Local Shop operator'} commerce={commerce} disabled={commerceControlsDisabled} identity={managedIdentity} key={`${orderDraftScope}:${commerce.items.map((item) => item.sku).sort().join('|')}`} onInventory={mutateCommerce} onIssue={mutateCommerce} production={relatedProduction} scope={orderDraftScope} /></Suspense> : <p className="empty-state">Add products before enabling locations, lots, available-to-promise, or supplier policies.</p>}
        </div>
      </details>
      {supplierSourcingDraft ? <form aria-labelledby="supplier-sourcing-title" className="stock-receipt-editor purchase-order-editor" onSubmit={reviewSupplierSourcing}>
        <div className="stock-receipt-copy"><span className="core-eyebrow">Supplier sourcing</span><h3 id="supplier-sourcing-title">Compare quotes for {supplierSourcingDraft.itemName}</h3><small>{supplierSourcingDraft.quantity.toLocaleString()} units · immutable award evidence · no supplier contact</small></div>
        {supplierSourcingDraft.quotes.map((quote, index) => <fieldset className="form-row" key={index}><legend><label><input checked={supplierSourcingDraft.selectedIndex === index} disabled={commerceControlsDisabled || (index === 1 && !quote.supplier.trim())} name="selected-supplier-quote" onChange={() => setSupplierSourcingDraft((current) => current ? { ...current, selectedIndex: index as 0 | 1 } : current)} type="radio" /> {index === 0 ? 'Primary quote' : 'Alternate quote (optional)'}</label></legend><label>Supplier<input disabled={commerceControlsDisabled} maxLength={120} onChange={(event) => updateSupplierQuote(index as 0 | 1, 'supplier', event.target.value)} required={index === 0} value={quote.supplier} /></label><label>Quote reference<input disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => updateSupplierQuote(index as 0 | 1, 'quoteReference', event.target.value)} required={index === 0} value={quote.quoteReference} /></label><label>Approved-vendor reference<input disabled={commerceControlsDisabled} maxLength={120} onChange={(event) => updateSupplierQuote(index as 0 | 1, 'vendorApprovalReference', event.target.value)} required={index === 0} value={quote.vendorApprovalReference} /></label><label>Unit cost (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => updateSupplierQuote(index as 0 | 1, 'unitCostMmk', event.target.value)} required={index === 0} step="1" type="number" value={quote.unitCostMmk} /></label><label>Delivery<input disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date())} onChange={(event) => updateSupplierQuote(index as 0 | 1, 'deliveryAt', event.target.value)} required={index === 0} type="datetime-local" value={quote.deliveryAt} /></label></fieldset>)}
        <div className="form-row"><label>Quotes valid until<input disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date())} onChange={(event) => setSupplierSourcingDraft((current) => current ? { ...current, validUntil: event.target.value } : current)} required type="datetime-local" value={supplierSourcingDraft.validUntil} /></label><label>Cost tolerance (%)<input disabled={commerceControlsDisabled} max="20" min="0" onChange={(event) => setSupplierSourcingDraft((current) => current ? { ...current, unitCostTolerancePercent: event.target.value } : current)} required step="0.1" type="number" value={supplierSourcingDraft.unitCostTolerancePercent} /></label><label>Delivery tolerance (days)<input disabled={commerceControlsDisabled} max="30" min="0" onChange={(event) => setSupplierSourcingDraft((current) => current ? { ...current, deliveryToleranceDays: event.target.value } : current)} required step="1" type="number" value={supplierSourcingDraft.deliveryToleranceDays} /></label></div>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={() => setSupplierSourcingDraft(null)} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled} type="submit">Review supplier award</button></div>
      </form> : null}
      {purchaseBudgetDraft ? <form aria-labelledby="purchase-budget-title" className="stock-receipt-editor purchase-order-editor" onSubmit={reviewPurchaseBudget}>
        <div className="stock-receipt-copy"><span className="core-eyebrow">Buying limits</span><h3 id="purchase-budget-title">Approve purchase budget</h3><small>Immutable commitment ceiling · internal authority only</small></div>
        <div className="form-row"><label>Budget code<input autoFocus disabled={commerceControlsDisabled} maxLength={40} onChange={(event) => setPurchaseBudgetDraft((current) => current ? { ...current, budgetCode: event.target.value.toUpperCase() } : current)} required value={purchaseBudgetDraft.budgetCode} /></label><label>Budget name<input disabled={commerceControlsDisabled} maxLength={120} onChange={(event) => setPurchaseBudgetDraft((current) => current ? { ...current, label: event.target.value } : current)} required value={purchaseBudgetDraft.label} /></label></div>
        <label>Valid until<input disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date())} onChange={(event) => setPurchaseBudgetDraft((current) => current ? { ...current, periodEnd: event.target.value } : current)} required type="datetime-local" value={purchaseBudgetDraft.periodEnd} /></label>
        <div className="form-row"><label>Total ceiling (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => setPurchaseBudgetDraft((current) => current ? { ...current, ceilingMmk: event.target.value } : current)} required step="1" type="number" value={purchaseBudgetDraft.ceilingMmk} /></label><label>Per request (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => setPurchaseBudgetDraft((current) => current ? { ...current, perRequisitionLimitMmk: event.target.value } : current)} required step="1" type="number" value={purchaseBudgetDraft.perRequisitionLimitMmk} /></label></div>
        <div className="stock-receipt-preview"><small>Authority</small><strong>{formatMoney(Number(purchaseBudgetDraft.ceilingMmk) || 0)} total · {formatMoney(Number(purchaseBudgetDraft.perRequisitionLimitMmk) || 0)} per request</strong></div>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={() => setPurchaseBudgetDraft(null)} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled} type="submit">Review buying limits</button></div>
      </form> : null}
      {purchaseOrderDraft && purchaseOrderDraftItem ? <form aria-labelledby="purchase-order-title" className="stock-receipt-editor purchase-order-editor" data-mode={purchaseOrderDraft.mode} onSubmit={reviewPurchaseOrder} ref={purchaseOrderEditorRef}>
        <div className="stock-receipt-copy">
          <span className="core-eyebrow">{purchaseOrderDraft.mode === 'create' ? purchaseOrderDraft.requisitionId ? 'Second operator approval' : 'Approve requisition' : 'Receive order'}</span>
          <h3 id="purchase-order-title">{purchaseOrderDraftItem.name}</h3>
          <small>{purchaseOrderDraft.mode === 'create'
            ? `${purchaseOrderDraft.requisitionId ?? purchaseOrderDraftItem.sku} · internal record only`
            : `${purchaseOrderDraftOrder?.purchaseOrder.id} · ${purchaseOrderDraftOrder?.purchaseOrder.supplier} · ${purchaseOrderDraftOrder?.purchaseOrder.expectedAt ? `expected ${formatIssueDue(purchaseOrderDraftOrder.purchaseOrder.expectedAt)}` : 'arrival not recorded'}`}</small>
        </div>
        {purchaseOrderDraft.mode === 'create' ? <label>Supplier reference{managedInventoryProjection ? <select autoFocus disabled={commerceControlsDisabled} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'create' ? { ...current, supplier: event.target.value } : current)} required value={purchaseOrderDraft.supplier}><option value="">Choose supplier</option>{managedInventoryProjection.vendors.map((vendor) => <option key={vendor.id} value={vendor.name}>{vendor.name}</option>)}</select> : <input autoFocus disabled={commerceControlsDisabled} maxLength={120} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'create' ? { ...current, supplier: event.target.value } : current)} placeholder="Supplier name" required value={purchaseOrderDraft.supplier} />}</label> : null}
        {purchaseOrderDraft.mode === 'create' ? <label>Expected arrival<input autoComplete="off" disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date())} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'create' ? { ...current, expectedAt: event.target.value } : current)} required type="datetime-local" value={purchaseOrderDraft.expectedAt} /></label> : null}
        <label>{purchaseOrderDraft.mode === 'create' ? 'Quantity to order' : 'Accepted units'}<input aria-describedby="stock-receipt-preview" autoFocus={purchaseOrderDraft.mode === 'receive'} disabled={commerceControlsDisabled} inputMode="numeric" max={purchaseOrderQuantityLimit} min="1" onChange={(event) => setPurchaseOrderDraft((current) => current ? { ...current, quantity: event.target.value } : current)} placeholder="10" required step="1" type="number" value={purchaseOrderDraft.quantity} /></label>
        {purchaseOrderDraft.mode === 'create' ? <label>Unit cost (MMK)<input aria-describedby="stock-receipt-preview" disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'create' ? { ...current, unitCostMmk: event.target.value } : current)} placeholder="5000" required step="1" type="number" value={purchaseOrderDraft.unitCostMmk} /></label> : null}
        {purchaseOrderDraft.mode === 'receive' ? <div className="form-row"><label>Rejected units<input aria-describedby="stock-receipt-preview" disabled={commerceControlsDisabled} inputMode="numeric" max={Math.max(0, (purchaseOrderDraftOrder?.progress.remaining ?? 0) - (purchaseOrderQuantityResult ?? 0))} min="0" onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'receive' ? { ...current, rejectedQuantity: event.target.value } : current)} required step="1" type="number" value={purchaseOrderDraft.rejectedQuantity} /></label><label>Discrepancy reason<select disabled={commerceControlsDisabled || purchaseOrderRejectedResult === 0} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'receive' ? { ...current, discrepancyCode: event.target.value as CommercePurchaseOrderDiscrepancyCode } : current)} required={Boolean(purchaseOrderRejectedResult)} value={purchaseOrderDraft.discrepancyCode}><option value="damaged">Damaged</option><option value="wrong_item">Wrong item</option><option value="quality_failed">Quality failed</option></select></label></div> : null}
        {purchaseOrderDraft.mode === 'receive' && commerce.inventoryFoundation ? <label>Receive into<select disabled={commerceControlsDisabled || !managedInventoryProjection} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'receive' ? { ...current, locationId: event.target.value } : current)} required value={purchaseOrderDraft.locationId}><option value="">Choose location</option>{managedInventoryProjection?.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : null}
        {purchaseOrderDraft.mode === 'receive' && commerce.inventoryFoundation ? <label>Lot or batch<input autoComplete="off" disabled={commerceControlsDisabled || !managedInventoryProjection} maxLength={80} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'receive' ? { ...current, trackingCode: event.target.value } : current)} placeholder="Scan or enter lot" required value={purchaseOrderDraft.trackingCode} /></label> : null}
        <div aria-live="polite" className="stock-receipt-preview" id="stock-receipt-preview"><small>{purchaseOrderDraft.mode === 'create' ? purchaseOrderDraft.requisitionId ? 'Internal order' : 'Requisition exposure' : 'New on hand'}</small><strong>{purchaseOrderQuantityResult === null
          ? 'Enter whole units'
          : purchaseOrderDraft.mode === 'create'
            ? `${purchaseOrderQuantityResult.toLocaleString()} units${purchaseOrderDraftTotal === null ? ' · enter unit cost' : ` · ${formatMoney(purchaseOrderDraftTotal)} total`}`
            : `${purchaseOrderDraftItem.onHand.toLocaleString()} → ${(purchaseOrderDraftItem.onHand + purchaseOrderQuantityResult).toLocaleString()} accepted into stock${purchaseOrderRejectedResult ? ` · ${purchaseOrderRejectedResult.toLocaleString()} rejected / return to vendor` : ''}${purchaseReceiptLocation ? ` · ${purchaseReceiptLocation.name}` : ''}`}</strong></div>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={cancelPurchaseOrderEditor} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled || purchaseOrderQuantityResult === null || !purchaseReceiptAllocationReady || !purchaseReceiptDiscrepancyReady || (purchaseOrderDraft.mode === 'create' && (!purchaseOrderDraft.supplier.trim() || purchaseOrderExpectedAtResult === null || purchaseOrderUnitCostResult === null || purchaseOrderDraftTotal === null))} type="submit">{purchaseOrderDraft.mode === 'create' ? purchaseOrderDraft.requisitionId ? 'Review second approval' : 'Review requisition' : 'Review receipt'}</button></div>
      </form> : null}
      {supplierReturnDraft && supplierReturnDraftRow && supplierReturnDraftReceipt ? <form aria-label="Supplier return review" className="stock-receipt-editor purchase-order-editor" onSubmit={reviewSupplierReturn}>
        <div className="stock-receipt-copy"><span className="core-eyebrow">Rejected supplier units</span><h3>{supplierReturnDraftRow.purchaseOrder.supplier}</h3><small>{supplierReturnDraftReceipt.rejectedQuantity} rejected · {supplierReturnDraftReceipt.discrepancyCode?.replaceAll('_', ' ')} · internal claim only</small></div>
        <label>Internal return reference<input autoFocus disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => setSupplierReturnDraft((current) => current ? { ...current, internalReturnReference: event.target.value } : current)} required value={supplierReturnDraft.internalReturnReference} /></label>
        <div className="stock-receipt-preview"><small>Claim value</small><strong>{formatMoney((supplierReturnDraftReceipt.rejectedQuantity ?? 0) * (supplierReturnDraftRow.purchaseOrder.unitCostMmk ?? 0))}</strong><small>Not dispatched · supplier not contacted · accounting not posted</small></div>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={() => setSupplierReturnDraft(null)} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled || !supplierReturnDraftReady} type="submit">Review return claim</button></div>
      </form> : null}
      {supplierCreditDraft && supplierCreditDraftRow && supplierCreditDraftClaim ? <form aria-label="Supplier credit review" className="stock-receipt-editor purchase-order-editor" onSubmit={reviewSupplierCredit}>
        <div className="stock-receipt-copy"><span className="core-eyebrow">Supplier credit evidence</span><h3>{supplierCreditDraftRow.purchaseOrder.supplier}</h3><small>{supplierCreditDraftClaim.internalReturnReference} · {formatMoney(commerceSupplierReturnClaimBalance(supplierCreditDraftClaim))} outstanding</small></div>
        <label>Supplier credit reference<input autoFocus disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => setSupplierCreditDraft((current) => current ? { ...current, supplierReference: event.target.value } : current)} placeholder="Supplier credit note number" required value={supplierCreditDraft.supplierReference} /></label>
        <div className="form-row"><label>Credit issued<input disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date(supplierCreditDraftClaim.createdAt))} onChange={(event) => setSupplierCreditDraft((current) => current ? { ...current, issuedAt: event.target.value } : current)} required type="datetime-local" value={supplierCreditDraft.issuedAt} /></label><label>Amount (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" max={commerceSupplierReturnClaimBalance(supplierCreditDraftClaim)} min="1" onChange={(event) => setSupplierCreditDraft((current) => current ? { ...current, amountMmk: event.target.value } : current)} required step="1" type="number" value={supplierCreditDraft.amountMmk} /></label></div>
        <div className="stock-receipt-preview"><small>Balance after</small><strong>{supplierCreditDraftReady ? formatMoney(commerceSupplierReturnClaimBalance(supplierCreditDraftClaim) - supplierCreditAmount) : 'Enter valid credit'}</strong><small>Evidence only · accounting not posted</small></div>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={() => setSupplierCreditDraft(null)} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled || !supplierCreditDraftReady} type="submit">Review supplier credit</button></div>
      </form> : null}
      {supplierInvoiceDraft && supplierInvoiceDraftRow ? <form aria-label="Supplier invoice review" className="stock-receipt-editor purchase-order-editor" onSubmit={reviewSupplierInvoice}>
        <div className="stock-receipt-copy"><span className="core-eyebrow">Supplier invoice</span><h3>{supplierInvoiceDraftRow.purchaseOrder.supplier}</h3><small>{supplierInvoiceDraftRow.purchaseOrder.id} · three-way review only</small></div>
        <label>Invoice reference<input autoFocus disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => setSupplierInvoiceDraft((current) => current ? { ...current, supplierReference: event.target.value } : current)} placeholder="Supplier invoice number" required value={supplierInvoiceDraft.supplierReference} /></label>
        <div className="form-row"><label>Invoice date<input disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date(supplierInvoiceDraftRow.purchaseOrder.createdAt))} onChange={(event) => setSupplierInvoiceDraft((current) => current ? { ...current, issuedAt: event.target.value } : current)} required type="datetime-local" value={supplierInvoiceDraft.issuedAt} /></label><label>Due date<input disabled={commerceControlsDisabled} min={supplierInvoiceDraft.issuedAt} onChange={(event) => setSupplierInvoiceDraft((current) => current ? { ...current, dueAt: event.target.value } : current)} required type="datetime-local" value={supplierInvoiceDraft.dueAt} /></label></div>
        <div className="form-row"><label>Invoiced units<input disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => setSupplierInvoiceDraft((current) => current ? { ...current, quantity: event.target.value } : current)} required step="1" type="number" value={supplierInvoiceDraft.quantity} /></label><label>Unit cost (MMK)<input disabled={commerceControlsDisabled} inputMode="numeric" min="1" onChange={(event) => setSupplierInvoiceDraft((current) => current ? { ...current, unitCostMmk: event.target.value } : current)} required step="1" type="number" value={supplierInvoiceDraft.unitCostMmk} /></label></div>
        <div className="stock-receipt-preview"><small>Invoice total</small><strong>{supplierInvoiceTotal === null ? 'Enter valid terms' : formatMoney(supplierInvoiceTotal)}</strong></div>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={() => setSupplierInvoiceDraft(null)} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled || !supplierInvoiceDraftReady} type="submit">Review invoice</button></div>
      </form> : null}
      <details className="compact-disclosure purchase-order-history" id="purchase-orders" ref={purchaseOrderHistoryRef}>
        <summary><span>Purchase orders</span><strong>{purchaseOrderRows.filter(({ progress }) => progress.status === 'open' || progress.status === 'partially_received').length} active · {purchaseOrderRows.length} total</strong></summary>
        {supplierPerformance.length ? <section aria-label="Supplier performance" className="supplier-performance">
          <div className="supplier-performance-heading"><span className="core-eyebrow">Supplier performance</span><small>Measured from Shop orders and receipts</small></div>
          <div className="supplier-performance-grid">{supplierPerformance.map((supplier) => <article data-supplier-status={supplier.status} key={supplier.supplier}>
            <div><strong>{supplier.supplier}</strong><small>{supplier.totalOrders} order{supplier.totalOrders === 1 ? '' : 's'} · {supplier.activeOrders} active</small></div>
            <span><strong>{supplier.receivedUnits}/{supplier.orderedUnits}</strong><small>units accepted · {supplier.rejectedUnits} rejected · {supplier.openUnits} open</small></span>
            <span><strong>{supplier.onTimeRateBasisPoints === null ? 'Collecting' : formatTaxRate(supplier.onTimeRateBasisPoints)}</strong><small>{supplier.completedDeliveries ? `${supplier.onTimeDeliveries}/${supplier.completedDeliveries} on time` : 'No completed arrival yet'} · defect {formatTaxRate(supplier.defectRateBasisPoints)}{supplier.lateOpenOrders ? ` · ${supplier.lateOpenOrders} late open` : ''}</small></span>
          </article>)}</div>
        </section> : null}
        {purchaseOrderRows.length ? <div className="purchase-order-list">{purchaseOrderRows.map(({ purchaseOrder, progress, item }) => {
          const arrivalUrgency = commercePurchaseOrderArrivalUrgency(purchaseOrder, progress, purchaseOrderClock)
          const invoiceMatch = purchaseOrder.supplierInvoice ? commerceSupplierInvoiceMatch(commerce, purchaseOrder) : null
          const unresolvedRejectedReceipt = commerce.movements.find((movement) => movement.kind === 'receipt'
            && movement.purchaseOrderId === purchaseOrder.id && Boolean(movement.rejectedQuantity)
            && !purchaseOrder.supplierReturns?.some((claim) => claim.receiptMovementId === movement.id))
          const openReturnClaim = purchaseOrder.supplierReturns?.find((claim) => commerceSupplierReturnClaimBalance(claim) > 0)
          const nextControl = unresolvedRejectedReceipt
            ? <button aria-label={`Review rejected supplier units for ${purchaseOrder.id}`} className="text-link" disabled={commerceControlsDisabled} onClick={() => openSupplierReturn(purchaseOrder.id, unresolvedRejectedReceipt.id)} type="button">Review return</button>
            : openReturnClaim
              ? <button aria-label={`Record supplier credit for ${openReturnClaim.internalReturnReference}`} className="text-link" disabled={commerceControlsDisabled} onClick={() => openSupplierCredit(purchaseOrder.id, openReturnClaim)} type="button">Record credit</button>
              : purchaseOrder.supplierInvoice
            ? purchaseOrder.supplierInvoice.payableReview
              ? <small className="purchase-order-closed">Payable ready</small>
              : invoiceMatch?.status === 'matched'
                ? <button aria-label={`Mark invoice payable-ready for ${purchaseOrder.id}`} className="text-link" disabled={commerceControlsDisabled} onClick={() => reviewSupplierInvoicePayable(purchaseOrder.id)} type="button">Review payable</button>
                : <small className="purchase-order-closed">{invoiceMatch?.status.replaceAll('_', ' ')}</small>
            : (progress.status === 'received' || progress.status === 'received_with_discrepancy') && purchaseOrder.unitCostMmk !== undefined
              ? <button aria-label={`Record supplier invoice for ${purchaseOrder.id}`} className="text-link" disabled={commerceControlsDisabled} onClick={() => openSupplierInvoice(purchaseOrder.id)} type="button">Record invoice</button>
              : progress.remaining > 0 && progress.status !== 'cancelled'
                ? <button aria-label={`Cancel remainder for ${purchaseOrder.id}`} className="text-link" disabled={commerceControlsDisabled} onClick={() => reviewPurchaseOrderCancellation(purchaseOrder.id)} type="button">Cancel remainder</button>
                : <small className="purchase-order-closed">{progress.status === 'received' ? 'Complete' : progress.status === 'received_with_discrepancy' ? 'Return resolved' : 'Closed'}</small>
          const returnSummary = purchaseOrder.supplierReturns?.length
            ? purchaseOrder.supplierReturns.map((claim) => `${claim.internalReturnReference}: ${commerceSupplierReturnClaimStatus(claim).replaceAll('_', ' ')}`).join(' · ')
            : null
          return <article key={purchaseOrder.id}>
            <div><strong>{item?.name ?? purchaseOrder.sku}</strong><small>{purchaseOrder.supplier} · {purchaseOrder.id}</small><small>{purchaseOrder.unitCostMmk === undefined ? 'Legacy PO · commercial terms not retained' : `${formatMoney(purchaseOrder.unitCostMmk)} each · ${formatMoney(purchaseOrder.unitCostMmk * purchaseOrder.quantityOrdered)}`}</small>{returnSummary ? <small>Returns · {returnSummary}</small> : null}<small data-arrival-risk={arrivalUrgency}>{purchaseOrder.expectedAt
              ? `Expected ${formatIssueDue(purchaseOrder.expectedAt)}${arrivalUrgency === 'late' ? ' · Late' : arrivalUrgency === 'due_soon' ? ' · Due soon' : ''}`
              : 'Arrival not recorded · legacy order'}</small></div>
            <span><strong>{progress.received} accepted{progress.rejected ? ` · ${progress.rejected} rejected` : ''}/{purchaseOrder.quantityOrdered}</strong><small>{invoiceMatch ? `Invoice · ${invoiceMatch.status.replaceAll('_', ' ')}` : progress.status.replaceAll('_', ' ')}</small></span>
            {nextControl}
          </article>
        })}</div> : <p className="empty-state">No purchase orders yet. Use Order stock on an item when replenishment is needed.</p>}
      </details>
      {commerce.items.length ? shopCatalogOnboarding : null}
      <details className="compact-disclosure catalog-disclosure" onToggle={(event) => setCatalogCreateOpen(event.currentTarget.open)} open={catalogCreateOpen}>
        <summary>Add catalog item</summary>
        <form className="core-form compact-form catalog-create-form" onSubmit={queueCatalogItem} ref={catalogCreateFormRef}>
          <div className="form-row"><label>SKU<span className="sku-scan-row"><input disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => setItemDraft((current) => ({ ...current, sku: event.target.value }))} placeholder="SKU-002" required value={itemDraft.sku} /><BarcodeScanButton disabled={commerceControlsDisabled} label="Scan the product barcode into the SKU field" onDetected={(value) => setItemDraft((current) => ({ ...current, sku: value }))} /></span></label><label>Item name<input disabled={commerceControlsDisabled} maxLength={180} onChange={(event) => setItemDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Real item name" required value={itemDraft.name} /></label></div>
          <div className="form-row"><label>Opening stock<input disabled={commerceControlsDisabled} min="0" onChange={(event) => setItemDraft((current) => ({ ...current, onHand: event.target.value }))} required step="1" type="number" value={itemDraft.onHand} /></label><label>Reorder at<input disabled={commerceControlsDisabled} min="0" onChange={(event) => setItemDraft((current) => ({ ...current, reorderAt: event.target.value }))} required step="1" type="number" value={itemDraft.reorderAt} /></label></div>
          <label>Price (MMK)<input disabled={commerceControlsDisabled} min="1" onChange={(event) => setItemDraft((current) => ({ ...current, price: event.target.value }))} required step="1" type="number" value={itemDraft.price} /></label>
          <div className="form-actions"><button className="core-button primary compact" disabled={commerceControlsDisabled} type="submit">Review catalog item</button></div>
          <p className="panel-copy">The opening balance may be zero. A named operator, reason, and evidence are required before the SKU is recorded.</p>
        </form>
      </details>
      <p className="form-notice" aria-live="polite">{commerceStorageError || 'Catalog values, counts, stock orders, receipts, and cancellations require attributable confirmation. Supplier contact, payment, and accounting remain outside this workflow.'}</p>
    </section>
    <StockMovementHistory actionHistory={actionHistory} movements={commerce.movements} />
    {actionGate}
  </div>

  return null
}

function ReceivablesAging({ aging, disabled, onRecordContact }: {
  aging: ReturnType<typeof commerceReceivablesAging>
  disabled: boolean
  onRecordContact: (orderId: string) => void
}) {
  if (!aging.rows.length) return null
  const bucketLabels = [
    ['current', 'Not overdue'],
    ['1_7', '1-7 days'],
    ['8_30', '8-30 days'],
    ['31_60', '31-60 days'],
    ['over_60', 'Over 60 days'],
  ] as const
  return <details className="core-panel receivables-aging" data-overdue-orders={aging.overdueOrders}>
    <summary>
      <span><span className="core-eyebrow">Payment follow-up</span><strong>{aging.overdueOrders ? `${aging.overdueOrders} overdue` : 'No overdue orders'}</strong></span>
      <small>{formatMoney(aging.overdueMmk)} overdue · {formatMoney(aging.totalOutstandingMmk)} pending</small>
    </summary>
    <div className="receivables-aging-buckets" aria-label="Receivables aging buckets">
      {bucketLabels.map(([bucket, label]) => <div key={bucket}>
        <small>{label}</small>
        <strong>{formatMoney(aging.totalsMmk[bucket])}</strong>
      </div>)}
    </div>
    <div className="receivables-aging-list">
      {aging.rows.slice(0, 5).map((row) => <div key={row.orderId}>
        <span><strong>{row.customer}</strong><small>{row.orderId} · {row.paymentMethod} · due {formatTime(row.dueAt)}</small>{row.lastCollectionAction ? <small>Last contact {formatTime(row.lastCollectionAction.capturedAt)} by {row.lastCollectionAction.actor} · {row.collectionActionCount} total</small> : <small>No customer contact recorded</small>}</span>
        <span><strong>{formatMoney(row.balanceMmk)}</strong><small>{row.daysPastDue ? `${row.daysPastDue} days overdue` : 'not overdue'}</small><button className="text-link" disabled={disabled} onClick={() => onRecordContact(row.orderId)} type="button">Record contact</button></span>
      </div>)}
    </div>
    <p className="form-notice">New orders retain an immutable payment-due snapshot. Older orders fall back to their fulfilment promise. Contact notes are append-only evidence; recording one does not send a message or change payment.</p>
  </details>
}

function OrderCalculationNote({ order }: { order: CommerceOrder }) {
  if (!order.calculation) return <small data-order-calculation-note="true" data-order-calculation-status="legacy">Recorded total {formatMoney(order.total)} · Tax status not recorded</small>
  return <small data-order-calculation-note="true" data-order-calculation-status={'taxCode' in order.calculation ? 'configured' : 'not-configured'}>{formatCommerceCalculation(order.calculation)}</small>
}

// The bytes of the acknowledgement file, and nothing else. Kept as its own function so the
// artifact can be weighed without a DOM: this string IS the file the customer is handed, so a
// test that pins this pins what she gets.
//
// The U+FEFF byte-order mark is load-bearing and must stay. This file is opened by whatever
// the customer has -- Notepad, a spreadsheet, a phone viewer -- and without the mark a Burmese
// customer or product name comes back as mojibake. It is the opposite call from the workspace
// backup on the settings page, which must NOT carry one because loadBackupFile JSON.parses it
// back and a BOM is not JSON. Nothing reads this file back in.
function orderAcknowledgementFileText(artifact: CommerceOrderAcknowledgement) {
  return `\uFEFF${commerceOrderAcknowledgementText(artifact)}`
}

// The bytes of the daily close CSV, on the same terms: this string IS the file, and it carries
// the same U+FEFF every other CSV in this app carries so a spreadsheet opens Burmese product
// and customer names as UTF-8 rather than mojibake.
function closeExportFileText(artifact: CommerceDailyCloseExport) {
  return `\uFEFF${commerceDailyCloseCsv(artifact)}`
}

// One row's receipt controls, built when that row asks for them.
//
// #538 took the FILE off this path: each of these used to carry a percent-encoded data: URL,
// 1,852,602 bytes of them alive for the life of the page at the workspace ceiling, rebuilt on
// every sale for a file at most one order is ever downloaded from. The artifact stayed,
// because `Boolean(acknowledgement)` decides whether an order shows any secondary actions at
// all and "View receipt" hands it straight to the dialog -- and it cost 53.9 ms EACH, which
// that PR filed as the larger bug rather than smuggling into its own change.
//
// This is that bug. The 53.9 ms was validateCommerceState re-checking the whole workspace once
// per order; the state is now validated once by the caller, and `read` is bound to it. Nothing
// about the document changed -- see the three properties pinned in
// tools/test_commerce_order_integrity.mjs.
function orderAcknowledgementDownload(read: (orderId: string) => CommerceOrderAcknowledgement | null, orderId: string) {
  const artifact = read(orderId)
  if (!artifact) return null
  const safeOrderId = artifact.orderId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'order'
  return {
    artifact,
    filename: `supermega-${safeOrderId}-acknowledgement.txt`,
  }
}

type OrderAcknowledgementDownload = NonNullable<ReturnType<typeof orderAcknowledgementDownload>>

// The two receipt controls an order carries, in one place. The active order list and the
// archive below it rendered a byte-identical copy of this pair each; they are the two controls
// that must agree about what a receipt IS, so keeping two copies in step was a standing
// invitation to drift. A fragment, so the rendered DOM is exactly what it was.
function OrderReceiptActions({ acknowledgement, onViewReceipt }: {
  acknowledgement: OrderAcknowledgementDownload | undefined
  onViewReceipt: (artifact: CommerceOrderAcknowledgement) => void
}) {
  if (!acknowledgement) return null
  return <>
    <button className="text-link" data-order-receipt="view" onClick={() => onViewReceipt(acknowledgement.artifact)} type="button">View receipt</button>
    <button className="text-link subtle" data-order-acknowledgement="local-download" onClick={() => downloadBlob(acknowledgement.filename, new Blob([orderAcknowledgementFileText(acknowledgement.artifact)], { type: 'text/plain;charset=utf-8' }))} type="button">Download acknowledgement</button>
  </>
}

// Asked, not enumerated. The order list and the archive each render a handful of rows and ask
// this for those rows only; nothing else is ever built. It carries a `get` so the two call
// sites read as they always did, but it is a lookup and not a collection -- there is no set of
// downloads standing by behind it, which is the whole point.
type OrderAcknowledgementLookup = { get: (orderId: string) => OrderAcknowledgementDownload | undefined }

// One validation of this workspace, then a document per row that asks for one. A workspace this
// device cannot validate answers nothing for every order, which is exactly what the per-order
// try/catch this replaced did -- it returned null for each order in turn.
function orderAcknowledgementLookup(commerce: CommerceState): OrderAcknowledgementLookup {
  let read: ReturnType<typeof commerceOrderAcknowledgementReader>
  try {
    read = commerceOrderAcknowledgementReader(commerce)
  } catch {
    return { get: () => undefined }
  }
  return { get: (orderId) => orderAcknowledgementDownload(read, orderId) ?? undefined }
}

function OrderList({
  acknowledgementDownloads,
  orders,
  canCancel,
  disabled,
  highlightedTargetId,
  onAdvance,
  onCancel,
  onReconcilePayment,
  onSettleRefund,
  onSettleSale,
  onViewReceipt,
}: {
  acknowledgementDownloads: OrderAcknowledgementLookup
  orders: CommerceOrder[]
  canCancel: (id: string) => boolean
  disabled: boolean
  highlightedTargetId: string
  onAdvance: (id: string) => void
  onCancel: (id: string) => void
  onReconcilePayment: (id: string) => void
  onSettleRefund: (id: string) => void
  onSettleSale: (id: string) => void
  onViewReceipt: (ack: CommerceOrderAcknowledgement) => void
}) {
  const promiseNow = useMinuteClock()
  if (!orders.length) return <Empty>No orders need action.</Empty>
  const nextAction: Record<'confirmed' | 'preparing' | 'ready', string> = { confirmed: 'Start preparing', preparing: 'Mark ready', ready: 'Complete' }
  return <div className="order-list">{orders.map((order) => {
    const active = order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready'
    const needsPayment = order.paymentStatus === 'pending'
    // The everyday outcome — paid and handed over — is the one-review primary for
    // any active unpaid order; payment-only reconciliation (pay-later customers)
    // stays reachable under More. Both remain the same recorded transitions.
    const settleSaleIsPrimary = needsPayment && active
    // 'completed' is deliberately absent. The record keeps payment at or before handover, so a
    // completed order cannot accept a payment proof stamped now -- offering it as the primary
    // action promises the owner something the transition will always refuse. advanceCommerceOrder
    // will not complete an unpaid order in the first place, so the app never reaches this state;
    // only workspaces provisioned before the sample installer was fixed still carry it.
    const reconcileIsPrimary = !settleSaleIsPrimary && needsPayment && order.status === 'ready'
    // No settle-sale guard needed here: a refund is only ever due on a cancelled
    // order, and the settle primary only shows on an active one.
    const settleRefundIsPrimary = !reconcileIsPrimary && order.refundStatus === 'due'
    const canAdvance = active && !settleSaleIsPrimary && !reconcileIsPrimary && !settleRefundIsPrimary
    const promiseUrgency = active ? commerceOrderPromiseUrgency(order, promiseNow) : 'scheduled'
    const acknowledgement = acknowledgementDownloads.get(order.id)
    const canCancelOrder = active && canCancel(order.id)
    const hasSecondaryActions = Boolean(acknowledgement) || canCancelOrder || (order.refundStatus === 'due' && !settleRefundIsPrimary) || settleSaleIsPrimary
    const targetId = commerceOrderTargetId(order.id)
    return <article data-highlighted={highlightedTargetId === targetId ? 'true' : undefined} id={targetId} key={order.id} tabIndex={-1}>
      <div>
        <div className="order-statuses">
          <span className={`status-pill ${order.status === 'completed' ? 'approved' : order.status === 'cancelled' ? 'cancelled' : 'bounded'}`}>{order.status}</span>
          <span className={`status-pill ${order.paymentStatus === 'reconciled' ? 'approved' : 'pending'}`}>payment {order.paymentStatus}</span>
          {order.refundStatus === 'due' ? <span className="status-pill pending">refund due</span> : null}
          {promiseUrgency === 'late' ? <span className="status-pill late">late</span> : null}
          {promiseUrgency === 'due_soon' ? <span className="status-pill pending">due soon</span> : null}
          {promiseUrgency === 'unrecorded' ? <span className="status-pill pending">promise missing</span> : null}
        </div>
        <strong>{order.customer} · {order.lines
          ? order.lines.length === 1
            ? `${order.lines[0].name} × ${order.quantity}`
            : `${order.lines.length} items · ${order.quantity} units`
          : `${order.item} × ${order.quantity}`}</strong>
        <details className="order-record-details">
          <summary><span>{commerceOrderDisplayReference(order.id)} · {order.promisedAt ? `promised ${formatTime(order.promisedAt)}` : 'promise missing'}</span><small>Details</small></summary>
          <div>
            {order.lines ? <small>{order.lines.map((line) => `${line.name} × ${line.quantity} @ ${line.unitPriceMmk.toLocaleString()} MMK`).join(' · ')}</small> : null}
            <OrderCalculationNote order={order} />
            <small>{commerceOrderDisplayReference(order.id)} · {order.owner ? `owner ${order.owner}` : 'owner not recorded'} · {order.channel} · {order.payment}{order.paymentDueAt ? ` · payment due ${formatTime(order.paymentDueAt)}` : ''}{order.fulfilment ? ` · ${fulfilmentLabel(order.fulfilment)}` : ''}{order.fulfilmentReference ? ` · ${order.fulfilmentReference}` : ''} · {order.promisedAt ? `promised ${formatTime(order.promisedAt)}` : 'promise not recorded'} · created {formatTime(order.createdAt)}</small>
          </div>
        </details>
        {order.refundStatus === 'due' ? <small role="note">Record a refund already completed with the external payment provider. This does not send money.</small> : null}
      </div>
      <div className="order-row-actions">
        <b>{formatMoney(order.total)}</b>
        {settleSaleIsPrimary ? <button className="core-button primary compact" disabled={disabled} onClick={() => onSettleSale(order.id)} type="button">Paid &amp; handed over</button> : null}
        {reconcileIsPrimary ? <button className="core-button primary compact" disabled={disabled} onClick={() => onReconcilePayment(order.id)} type="button">Reconcile payment</button> : null}
        {settleRefundIsPrimary ? <button className="core-button primary compact" disabled={disabled} onClick={() => onSettleRefund(order.id)} type="button">Record settled refund</button> : null}
        {canAdvance ? <button className="core-button primary compact" disabled={disabled} onClick={() => onAdvance(order.id)} type="button">{nextAction[order.status as 'confirmed' | 'preparing' | 'ready']}</button> : null}
        {hasSecondaryActions ? <details className="order-row-more">
          <summary aria-label={`More options for ${order.id}`}>More</summary>
          <div>
            {settleSaleIsPrimary ? <button className="text-link" disabled={disabled} onClick={() => onReconcilePayment(order.id)} type="button">Record payment only</button> : null}
            {order.refundStatus === 'due' && !settleRefundIsPrimary ? <button className="text-link" disabled={disabled} onClick={() => onSettleRefund(order.id)} type="button">Record settled refund</button> : null}
            <OrderReceiptActions acknowledgement={acknowledgement} onViewReceipt={onViewReceipt} />
            {canCancelOrder ? <button className="text-link subtle" disabled={disabled} onClick={() => onCancel(order.id)} type="button">Cancel order</button> : null}
          </div>
        </details> : null}
      </div>
    </article>
  })}</div>
}

function ClosedOrderHistory({
  acknowledgementDownloads,
  canCorrect,
  canReturn,
  correctionCalculation,
  correctionDraft,
  disabled,
  onCancelCorrection,
  onCancelReturn,
  loyaltyPoints,
  onChangeCorrection,
  onChangeReturn,
  onOpenCorrection,
  onOpenRedemption,
  onOpenReturn,
  onReviewCorrection,
  onReviewReturn,
  onReviewSupportOpen,
  onReviewSupportReopen,
  onReviewSupportService,
  onReviewSupportResolution,
  onOpenSupportService,
  onOpenSupportResolution,
  onOpenSupportReopen,
  onCancelSupportOpen,
  onCancelSupportReopen,
  onCancelSupportResolution,
  onCancelSupportService,
  onChangeSupportOpen,
  onChangeSupportReopen,
  onChangeSupportService,
  onChangeSupportResolution,
  onCorrectionEditor,
  onCorrectionTrigger,
  onReturnEditor,
  onReturnTrigger,
  onViewReceipt,
  orders,
  returnDraft,
  returnLocationPreview,
  supportDraft,
  supportReopenDraft,
  supportServiceDraft,
  supportResolutionDraft,
  supportWorkloadDownload,
}: {
  acknowledgementDownloads: OrderAcknowledgementLookup
  canCorrect: (orderId: string) => boolean
  canReturn: (orderId: string) => boolean
  correctionCalculation: ReturnType<typeof commerceCorrectionCalculation>
  correctionDraft: CommerceCorrectionDraft | null
  disabled: boolean
  onCancelCorrection: () => void
  onCancelReturn: () => void
  loyaltyPoints: ReadonlyMap<string, number> | null
  onChangeCorrection: (patch: Partial<CommerceCorrectionDraft>) => void
  onChangeReturn: (patch: Partial<CommerceReturnDraft>) => void
  onOpenCorrection: (orderId: string) => void
  onOpenRedemption: (orderId: string) => void
  onOpenReturn: (orderId: string) => void
  onReviewCorrection: (event: FormEvent) => void
  onReviewReturn: (event: FormEvent) => void
  onReviewSupportOpen: (event: FormEvent) => void
  onReviewSupportReopen: (event: FormEvent) => void
  onReviewSupportService: (event: FormEvent) => void
  onReviewSupportResolution: (event: FormEvent) => void
  onOpenSupportService: (orderId: string, caseId: string, kind: CommerceSupportServiceEventKind) => void
  onOpenSupportResolution: (orderId: string, caseId: string) => void
  onOpenSupportReopen: (orderId: string, caseId: string) => void
  onCancelSupportOpen: () => void
  onCancelSupportReopen: () => void
  onCancelSupportResolution: () => void
  onCancelSupportService: () => void
  onChangeSupportOpen: (patch: Partial<Omit<CommerceSupportOpenDraft, 'intent'>>) => void
  onChangeSupportReopen: (patch: Partial<CommerceSupportReopenDraft>) => void
  onChangeSupportService: (patch: Partial<CommerceSupportServiceDraft>) => void
  onChangeSupportResolution: (patch: Partial<CommerceSupportResolutionDraft>) => void
  onCorrectionEditor: (node: HTMLFormElement | null) => void
  onCorrectionTrigger: (orderId: string, node: HTMLButtonElement | null) => void
  onReturnEditor: (node: HTMLFormElement | null) => void
  onReturnTrigger: (orderId: string, node: HTMLButtonElement | null) => void
  onViewReceipt: (ack: CommerceOrderAcknowledgement) => void
  orders: CommerceOrder[]
  returnDraft: CommerceReturnDraft | null
  returnLocationPreview: string
  supportDraft: CommerceSupportOpenDraft | null
  supportReopenDraft: CommerceSupportReopenDraft | null
  supportServiceDraft: CommerceSupportServiceDraft | null
  supportResolutionDraft: CommerceSupportResolutionDraft | null
  supportWorkloadDownload: {
    filename: string
    href: string
    artifact: ReturnType<typeof commerceSupportWorkloadExport>
  } | null
}) {
  const [page, setPage] = useState(0)
  const supportClock = useMinuteClock()
  const pageSize = 8
  if (!orders.length) return null
  const pageCount = Math.ceil(orders.length / pageSize)
  const returnOrderIndex = returnDraft ? orders.findIndex((order) => order.id === returnDraft.orderId) : -1
  const correctionOrderIndex = correctionDraft ? orders.findIndex((order) => order.id === correctionDraft.orderId) : -1
  const supportOrderId = supportDraft?.intent.orderId ?? supportReopenDraft?.orderId ?? supportServiceDraft?.orderId ?? supportResolutionDraft?.orderId
  const supportOrderIndex = supportOrderId ? orders.findIndex((order) => order.id === supportOrderId) : -1
  const focusedOrderIndex = returnOrderIndex >= 0 ? returnOrderIndex : correctionOrderIndex >= 0 ? correctionOrderIndex : supportOrderIndex
  const currentPage = focusedOrderIndex >= 0 ? Math.floor(focusedOrderIndex / pageSize) : Math.min(page, pageCount - 1)
  const visibleOrders = orders.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const supportWorkQueue = commerceSupportQueue(orders, supportClock)
  const supportSla = commerceSupportSlaSummary(orders, supportClock)
  return <details className="order-archive" id="shop-order-history" open={Boolean(returnDraft || correctionDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) || undefined}>
    <summary><span>Completed and cancelled orders</span><small>{supportWorkQueue.length ? `${supportSla.openCases} help open · ${supportSla.overdueCases} overdue · ` : ''}{orders.length} {orders.length === 1 ? 'record' : 'records'}</small></summary>
    {supportWorkloadDownload ? <section aria-label="Support workload export" className="order-return-records" data-support-workload="privacy-minimal">
      <div><strong>Support workload record</strong><small>{supportWorkloadDownload.artifact.summary.totalCases} cases · {supportWorkloadDownload.artifact.summary.reopenedCases} repeat contacts · {supportWorkloadDownload.artifact.summary.responseTargetMisses} target misses</small></div>
      <div><small>Case and order references, aging, ownership, lifecycle, and service counts only. Customer names, contact details, descriptions, notes, and evidence text are excluded.</small><a className="text-link" download={supportWorkloadDownload.filename} href={supportWorkloadDownload.href}>Download workload CSV</a></div>
    </section> : null}
    {supportWorkQueue.length ? <section aria-label="Open support queue" className="order-return-records" data-support-queue="ordered">
      <div><strong>Support queue · next work first</strong><small>Overdue, priority, due time, request time</small></div>
      <div data-support-sla="bounded"><strong>Service level</strong><small>{supportSla.awaitingAcknowledgement} awaiting acknowledgement · {supportSla.awaitingFirstResponse} awaiting first response · {supportSla.firstResponseReady} response ready · {supportSla.responseTargetMisses} target missed</small></div>
      {supportWorkQueue.slice(0, 6).map((row) => <div data-support-urgency={row.urgency} key={`queue-${row.supportCase.caseId}`}>
        <strong>{row.urgency === 'overdue' ? 'OVERDUE · ' : ''}{row.customer} · {row.supportCase.category.replaceAll('_', ' ')}</strong>
        <small>{row.service ? `${row.service.priority} · ${row.service.owner} · due ${formatTime(row.service.dueAt)}` : 'Legacy untriaged case'} · {row.supportCase.caseId}</small>
        {row.service ? <button className="text-link" disabled={disabled || Boolean(supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft || returnDraft || correctionDraft)} onClick={() => row.checkpoints.acknowledged
          ? row.checkpoints.firstResponseReady
            ? onOpenSupportResolution(row.orderId, row.supportCase.caseId)
            : onOpenSupportService(row.orderId, row.supportCase.caseId, 'first_response_ready')
          : onOpenSupportService(row.orderId, row.supportCase.caseId, 'acknowledged')} type="button">{row.checkpoints.acknowledged ? row.checkpoints.firstResponseReady ? 'Resolve case' : 'Response ready' : 'Acknowledge'}</button> : null}
      </div>)}
      {supportWorkQueue.length > 6 ? <small>{supportWorkQueue.length - 6} more open cases remain in the order archive.</small> : null}
    </section> : null}
    <div className="order-archive-list">{visibleOrders.map((order) => {
      const lines = commerceOrderReturnLines(order).map((line) => {
        const returned = (order.returns ?? [])
          .filter((record) => record.sku === line.sku)
          .reduce((sum, record) => sum + record.quantity, 0)
        return { ...line, returned, remaining: line.quantity - returned }
      })
      const availableLines = lines.filter((line) => line.remaining > 0)
      const draftedLine = returnDraft?.orderId === order.id
        ? availableLines.find((line) => line.sku === returnDraft.sku)
        : undefined
      const activeReturnDraft = draftedLine && returnDraft?.orderId === order.id ? returnDraft : null
      const editing = activeReturnDraft !== null
      const activeCorrectionDraft = correctionDraft?.orderId === order.id ? correctionDraft : null
      const correcting = activeCorrectionDraft !== null
      const activeSupportDraft = supportDraft?.intent.orderId === order.id ? supportDraft : null
      const activeSupportReopen = supportReopenDraft?.orderId === order.id ? supportReopenDraft : null
      const activeSupportService = supportServiceDraft?.orderId === order.id ? supportServiceDraft : null
      const activeSupportResolution = supportResolutionDraft?.orderId === order.id ? supportResolutionDraft : null
      const selectedLine = draftedLine ?? availableLines[0]
      const returnable = canReturn(order.id)
      const correctable = canCorrect(order.id)
      // S3 PR2: the redemption affordance appears only while points are on
      // (loyaltyPoints is null otherwise) for a named customer with a positive
      // balance, on an order corrections can still reach.
      const redeeming = Boolean(activeCorrectionDraft?.loyalty)
      const loyaltyBalance = shopLoyaltyDisplayPoints(loyaltyPoints?.get(order.customer.trim()) ?? 0)
      const redeemable = correctable && order.customer.trim() !== 'Guest' && loyaltyBalance > 0
      const adjustedTotal = commerceOrderAdjustedTotal(order) ?? order.total
      const acknowledgement = acknowledgementDownloads.get(order.id)
      return <article className={editing || correcting ? 'is-returning' : undefined} key={order.id}>
      <div className="order-archive-main">
        <strong>{order.customer} · {order.lines
          ? order.lines.length === 1
            ? `${order.lines[0].name} × ${order.quantity}`
            : `${order.lines.length} items · ${order.quantity} units`
          : `${order.item} × ${order.quantity}`}</strong>
        {order.lines ? <small>{order.lines.map((line) => `${line.name} × ${line.quantity} @ ${line.unitPriceMmk.toLocaleString()} MMK`).join(' · ')}</small> : null}
        <OrderCalculationNote order={order} />
        <small>{commerceOrderDisplayReference(order.id)} · {order.owner ? `owner ${order.owner}` : 'owner not recorded'} · {order.status} · payment {order.paymentStatus}{order.refundStatus !== 'none' ? ` · refund ${order.refundStatus}` : ''}{order.fulfilment ? ` · ${fulfilmentLabel(order.fulfilment)}` : ''}{order.fulfilmentReference ? ` · ${order.fulfilmentReference}` : ''} · {order.promisedAt ? `promised ${formatTime(order.promisedAt)}` : 'promise not recorded'} · created {formatTime(order.createdAt)}</small>
        {order.refundStatus === 'settled' && order.refundSettledAt && order.refundSettledBy && order.refundEvidenceReference ? <small role="note">{order.refundSettledBy} · {formatTime(order.refundSettledAt)} · evidence {order.refundEvidenceReference}</small> : null}
        {order.status === 'completed' && order.completion ? <small role="note">Completed by {order.completion.actor} · {formatTime(order.completion.capturedAt)} · evidence {order.completion.evidenceReference}</small> : null}
        {order.status === 'completed' && !order.completion ? <small role="note">Return unavailable: this older order has no attributable completion proof.</small> : null}
        {order.status === 'completed' && order.completion && availableLines.length > 0 && !returnable ? <small role="note">Return unavailable: the sold quantity cannot be matched to an attributable stock reservation.</small> : null}
      </div>
      <div className="order-archive-actions">
        <b>{formatMoney(adjustedTotal)}</b>
        {adjustedTotal !== order.total ? <small>original {formatMoney(order.total)}</small> : null}
        <OrderReceiptActions acknowledgement={acknowledgement} onViewReceipt={onViewReceipt} />
        {order.status === 'completed' && (returnable || editing) ? <button
          aria-expanded={editing}
          className="text-link"
          disabled={disabled || correcting}
          onClick={() => editing ? onCancelReturn() : onOpenReturn(order.id)}
          ref={(node) => { onReturnTrigger(order.id, node) }}
          type="button"
        >{editing ? 'Close return' : 'Record return'}</button> : null}
        {order.status === 'completed' && ((correctable && !redeeming) || (correcting && !redeeming)) ? <button
          aria-expanded={correcting && !redeeming}
          className="text-link"
          disabled={disabled || editing}
          onClick={() => correcting ? onCancelCorrection() : onOpenCorrection(order.id)}
          ref={(node) => { onCorrectionTrigger(order.id, node) }}
          type="button"
        >{correcting && !redeeming ? 'Close correction' : 'Correct invoice'}</button> : null}
        {order.status === 'completed' && (redeemable || redeeming) ? <button
          aria-expanded={redeeming}
          className="text-link"
          disabled={disabled || editing || (correcting && !redeeming)}
          onClick={() => redeeming ? onCancelCorrection() : onOpenRedemption(order.id)}
          ref={redeeming ? (node) => { onCorrectionTrigger(order.id, node) } : undefined}
          type="button"
        >{redeeming ? 'Close redemption' : `Redeem points · ${loyaltyBalance.toLocaleString()}`}</button> : null}
      </div>
      {order.returns?.length ? <div className="order-return-records" role="list">
        {order.returns.map((record) => <div key={record.actionId} role="listitem">
          <strong>{record.quantity} {record.sku} returned · {record.disposition === 'restock' ? 'restocked' : 'not restocked'}</strong>
          <small>{record.actor} · {formatTime(record.createdAt)} · evidence {record.evidenceReference}</small>
        </div>)}
      </div> : null}
      {order.supportCases?.length ? <div className="order-return-records" role="list">
        {order.supportCases.map((supportCase) => {
          const urgency = commerceSupportCaseUrgency(supportCase, supportClock)
          const service = commerceSupportServiceState(supportCase)
          const checkpoints = commerceSupportCheckpointState(supportCase)
          const serviceEvents = [...(supportCase.followUpServiceEvents ?? []), ...(supportCase.serviceEvents ?? [])]
          const finalResolution = supportCase.followUpResolution ?? supportCase.resolution
          return <div data-support-urgency={urgency} key={supportCase.caseId} role="listitem">
            <strong>{urgency === 'overdue' ? 'OVERDUE · ' : ''}{supportCase.status === 'resolved' ? 'Resolved help case' : 'Open help case'} · {supportCase.category.replaceAll('_', ' ')}</strong>
            <small>{supportCase.caseId} · requested {formatTime(supportCase.customerRequestedAt)} · opened by {supportCase.opening.actor}</small>
            {service
              ? <small>{service.priority} priority · owner {service.owner} · {urgency === 'overdue' ? 'overdue since' : 'due'} {formatTime(service.dueAt)}</small>
              : <small>Legacy case · priority, owner, and due time were not recorded</small>}
            <small>{supportCase.customerDescription}</small>
            {supportCase.reopen ? <small>Follow-up opened by {supportCase.reopen.proof.actor} · {formatTime(supportCase.reopen.proof.capturedAt)} · linked to resolution {supportCase.reopen.sourceResolutionActionId} · {supportCase.reopen.note}</small> : null}
            {supportCase.reopen && supportCase.resolution ? <small>Original resolution retained · {supportCase.resolution.outcome.replaceAll('_', ' ')} · {supportCase.resolution.note}</small> : null}
            {checkpoints.acknowledged ? <small>Acknowledged by {checkpoints.acknowledged.proof.actor} · {formatTime(checkpoints.acknowledged.proof.capturedAt)}{checkpoints.firstResponseReady ? ` · first response ready ${formatTime(checkpoints.firstResponseReady.proof.capturedAt)}` : ' · first response pending'}</small> : service ? <small>Acknowledgement pending</small> : null}
            {serviceEvents.length ? <details className="compact-disclosure"><summary><span>Service history</span><small>{serviceEvents.length} {serviceEvents.length === 1 ? 'event' : 'events'}</small></summary><div className="boundary-list">{serviceEvents.map((serviceEvent) => <div key={serviceEvent.proof.actionId}><strong>{serviceEvent.kind.replaceAll('_', ' ')} · {serviceEvent.priority} · {serviceEvent.owner}</strong><small>{formatTime(serviceEvent.proof.capturedAt)} · due {formatTime(serviceEvent.dueAt)} · {serviceEvent.note}</small></div>)}</div></details> : null}
            {supportCase.status === 'resolved' && finalResolution ? <><small>{finalResolution.outcome.replaceAll('_', ' ')} · {finalResolution.note} · {finalResolution.proof.actor}</small>{!supportCase.reopen ? <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportReopen(order.id, supportCase.caseId)} type="button">Reopen case</button> : null}</> : service ? <div className="form-actions">{!checkpoints.acknowledged ? <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'acknowledged')} type="button">Acknowledge</button> : !checkpoints.firstResponseReady ? <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'first_response_ready')} type="button">Response ready</button> : <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportResolution(order.id, supportCase.caseId)} type="button">Resolve case</button>}<button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'reassigned')} type="button">Reassign</button><button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'escalated')} type="button">Escalate</button></div> : <button className="text-link" disabled={disabled || Boolean(activeSupportResolution)} onClick={() => onOpenSupportResolution(order.id, supportCase.caseId)} type="button">Resolve legacy case</button>}
            <small>No external message or refund performed</small>
          </div>
        })}
      </div> : null}
      {order.corrections?.length ? <div className="order-return-records" role="list">
        {order.corrections.map((record) => <div key={record.documentId} role="listitem">
          <strong>{record.kind} note · {formatMoney(record.calculation.totalMmk)} · balance {formatMoney(record.balanceAfterMmk)}</strong>
          <small>{record.reasonCode.replaceAll('_', ' ')} · {record.actor} · {formatTime(record.createdAt)} · evidence {record.evidenceReference}</small>
          <small>Review required · no external posting performed</small>
        </div>)}
      </div> : null}
      {activeReturnDraft && selectedLine ? <form aria-label={`Return items from ${order.id}`} className="order-return-editor" onSubmit={onReviewReturn} ref={onReturnEditor}>
        <div className="order-return-copy"><span className="core-eyebrow">Return</span><strong>{order.id}</strong><small>{activeReturnDraft.sourceIntent ? `Prepared from customer request ${activeReturnDraft.sourceIntent.id}. Confirm what Shop actually received.` : 'Record received goods only.'} Payment and order totals do not change.</small></div>
        <label>Item<select disabled={disabled || availableLines.length === 1} onChange={(event) => onChangeReturn({ sku: event.target.value, quantity: '1' })} value={selectedLine.sku}>{availableLines.map((line) => <option key={line.sku} value={line.sku}>{line.name} · {line.remaining} left</option>)}</select></label>
        <label>Quantity<input disabled={disabled} id="order-return-quantity" max={selectedLine.remaining} min="1" onChange={(event) => onChangeReturn({ quantity: event.target.value })} required step="1" type="number" value={activeReturnDraft.quantity} /></label>
        <label>Stock result<select disabled={disabled} onChange={(event) => onChangeReturn({ disposition: event.target.value as CommerceReturnDisposition })} value={activeReturnDraft.disposition}><option value="restock">Sellable · add to stock</option><option value="not_restocked">Not sellable · stock unchanged</option></select></label>
        {activeReturnDraft.disposition === 'restock' && returnLocationPreview ? <small role="note">Restock to {returnLocationPreview}</small> : null}
        <div className="form-actions"><button className="core-button primary compact" disabled={disabled} type="submit">Review return</button><button className="core-button compact" disabled={disabled} onClick={onCancelReturn} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportDraft ? <form aria-label={`Open support case for ${order.id}`} className="order-return-editor" onSubmit={onReviewSupportOpen}>
        <div className="order-return-copy"><span className="core-eyebrow">Customer help</span><strong>{activeSupportDraft.intent.category.replaceAll('_', ' ')}</strong><small>{activeSupportDraft.intent.description}</small><small>Assign service responsibility before opening. This does not send a message or start a refund.</small></div>
        <div className="form-row"><label>Priority<select disabled={disabled} onChange={(event) => onChangeSupportOpen({ priority: event.target.value as CommerceSupportPriority })} value={activeSupportDraft.priority}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Owner<input disabled={disabled} maxLength={120} onChange={(event) => onChangeSupportOpen({ owner: event.target.value })} required value={activeSupportDraft.owner} /></label></div>
        <label>Due time<input disabled={disabled} min={localDateTimeInputValue(new Date())} onChange={(event) => onChangeSupportOpen({ dueAt: event.target.value })} required type="datetime-local" value={activeSupportDraft.dueAt} /></label>
        <div className="form-actions"><button className="core-button primary compact" disabled={disabled} id="shop-support-open-review" type="submit">Review case opening</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportOpen} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportReopen ? <form aria-label={`Reopen support case ${activeSupportReopen.caseId}`} className="order-return-editor" onSubmit={onReviewSupportReopen}>
        <div className="order-return-copy"><span className="core-eyebrow">Follow-up</span><strong>{activeSupportReopen.caseId}</strong><small>Retain resolution {activeSupportReopen.sourceResolutionActionId} and start one linked service cycle. This does not send a message or start a refund.</small></div>
        <div className="form-row"><label>Priority<select disabled={disabled} onChange={(event) => onChangeSupportReopen({ priority: event.target.value as CommerceSupportPriority })} value={activeSupportReopen.priority}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Owner<input disabled={disabled} id={`support-reopen-${activeSupportReopen.caseId}`} maxLength={120} onChange={(event) => onChangeSupportReopen({ owner: event.target.value })} required value={activeSupportReopen.owner} /></label></div>
        <label>Due time<input disabled={disabled} min={localDateTimeInputValue(new Date())} onChange={(event) => onChangeSupportReopen({ dueAt: event.target.value })} required type="datetime-local" value={activeSupportReopen.dueAt} /></label>
        <label>Follow-up reason<textarea disabled={disabled} maxLength={300} onChange={(event) => onChangeSupportReopen({ note: event.target.value })} required rows={2} value={activeSupportReopen.note} /></label>
        <div className="form-actions"><button className="core-button primary compact" disabled={disabled} type="submit">Review follow-up</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportReopen} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportService ? <form aria-label={`${commerceSupportServiceActionLabels[activeSupportService.kind]} ${activeSupportService.caseId}`} className="order-return-editor" onSubmit={onReviewSupportService}>
        <div className="order-return-copy"><span className="core-eyebrow">{commerceSupportServiceActionLabels[activeSupportService.kind]}</span><strong>{activeSupportService.caseId}</strong><small>{activeSupportService.kind === 'reassigned' ? 'Change only the accountable owner. Priority and due time stay immutable.' : activeSupportService.kind === 'escalated' ? 'Keep the owner and raise priority or bring a future due time forward.' : activeSupportService.kind === 'acknowledged' ? 'Record that the accountable owner accepted this case internally.' : 'Record that a first response is ready for independent delivery.'} No message, refund, or payment action runs.</small></div>
        {activeSupportService.kind === 'reassigned' ? <label>New owner<input disabled={disabled} id={`support-service-${activeSupportService.caseId}`} maxLength={120} onChange={(event) => onChangeSupportService({ owner: event.target.value })} required value={activeSupportService.owner} /></label> : activeSupportService.kind === 'escalated' ? <><div className="form-row"><label>Owner<input disabled value={activeSupportService.owner} /></label><label>Priority<select disabled={disabled} id={`support-service-${activeSupportService.caseId}`} onChange={(event) => onChangeSupportService({ priority: event.target.value as CommerceSupportPriority })} value={activeSupportService.priority}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label></div><label>Earlier due time<input disabled={disabled} min={localDateTimeInputValue(new Date())} onChange={(event) => onChangeSupportService({ dueAt: event.target.value })} required type="datetime-local" value={activeSupportService.dueAt} /></label></> : <small role="note">{activeSupportService.priority} priority · owner {activeSupportService.owner} · target {formatTime(new Date(activeSupportService.dueAt).toISOString())}</small>}
        <label>{activeSupportService.kind === 'first_response_ready' ? 'Response preparation note' : activeSupportService.kind === 'acknowledged' ? 'Acknowledgement note' : 'Reason'}<textarea disabled={disabled} id={activeSupportService.kind === 'acknowledged' || activeSupportService.kind === 'first_response_ready' ? `support-service-${activeSupportService.caseId}` : undefined} maxLength={300} onChange={(event) => onChangeSupportService({ note: event.target.value })} required rows={2} value={activeSupportService.note} /></label>
        <div className="form-actions"><button className="core-button primary compact" disabled={disabled} type="submit">Review {activeSupportService.kind === 'acknowledged' ? 'acknowledgement' : activeSupportService.kind === 'first_response_ready' ? 'response readiness' : 'service change'}</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportService} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportResolution ? <form aria-label={`Resolve support case ${activeSupportResolution.caseId}`} className="order-return-editor" onSubmit={onReviewSupportResolution}>
        <div className="order-return-copy"><span className="core-eyebrow">Resolve help case</span><strong>{activeSupportResolution.caseId}</strong><small>Record the reviewed outcome only. External communication and financial action remain separate.</small></div>
        <label>Outcome<select disabled={disabled} onChange={(event) => onChangeSupportResolution({ outcome: event.target.value as CommerceSupportResolutionOutcome })} value={activeSupportResolution.outcome}><option value="information_provided">Information provided</option><option value="replacement_review_required">Replacement review required</option><option value="refund_review_required">Refund review required</option><option value="no_action">No action</option></select></label>
        <label>Resolution note<textarea disabled={disabled} id={`support-resolution-${activeSupportResolution.caseId}`} maxLength={300} onChange={(event) => onChangeSupportResolution({ note: event.target.value })} required rows={2} value={activeSupportResolution.note} /></label>
        <div className="form-actions"><button className="core-button primary compact" disabled={disabled} type="submit">Review resolution</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportResolution} type="button">Cancel</button></div>
      </form> : null}
      {activeCorrectionDraft ? <form aria-label={activeCorrectionDraft.loyalty ? `Redeem points on ${order.id}` : `Correct invoice ${order.id}`} className="order-return-editor" onSubmit={onReviewCorrection} ref={onCorrectionEditor}>
        <div className="order-return-copy"><span className="core-eyebrow">{activeCorrectionDraft.loyalty ? 'Redeem points' : 'Correction note'}</span><strong>{order.id}</strong><small>{activeCorrectionDraft.loyalty ? `${activeCorrectionDraft.loyalty.customer} holds ${loyaltyBalance.toLocaleString()} points. Points are redeemed as a credit note on this order — 1 point = 1 MMK.` : activeCorrectionDraft.sourceIntent ? `Prepared from customer request ${activeCorrectionDraft.sourceIntent.id}. Recheck the calculation; request details stay locked.` : 'The original invoice stays unchanged.'} This records review evidence; it does not post externally.</small></div>
        {activeCorrectionDraft.loyalty
          ? <small role="note">Credit note · reason “other” — locked for points redemption</small>
          : <>
            <label>Type<select disabled={disabled || Boolean(activeCorrectionDraft.sourceIntent)} onChange={(event) => onChangeCorrection({ kind: event.target.value as CommerceCorrectionKind })} value={activeCorrectionDraft.kind}><option value="credit">Credit · reduce balance</option><option value="debit">Debit · increase balance</option></select></label>
            <label>Reason<select disabled={disabled || Boolean(activeCorrectionDraft.sourceIntent)} onChange={(event) => onChangeCorrection({ reasonCode: event.target.value as CommerceCorrectionReasonCode })} value={activeCorrectionDraft.reasonCode}><option value="pricing_error">Pricing error</option><option value="service_recovery">Service recovery</option><option value="fee_adjustment">Fee adjustment</option><option value="other">Other</option></select></label>
          </>}
        <label>{activeCorrectionDraft.loyalty ? 'Points to redeem' : 'Amount before tax'}<input disabled={disabled || Boolean(activeCorrectionDraft.sourceIntent)} id="order-correction-amount" inputMode="numeric" max={activeCorrectionDraft.loyalty ? loyaltyBalance : undefined} min="1" onChange={(event) => onChangeCorrection({ listedAmountMmk: event.target.value })} required step="1" type="number" value={activeCorrectionDraft.listedAmountMmk} /></label>
        {correctionCalculation ? <small role="note">Tax {formatMoney(correctionCalculation.taxMmk)} · note total {formatMoney(correctionCalculation.totalMmk)} · same tax snapshot as the original invoice</small> : null}
        <div className="form-actions"><button className="core-button primary compact" disabled={disabled || !correctionCalculation} type="submit">{activeCorrectionDraft.loyalty ? 'Review redemption' : 'Review correction'}</button><button className="core-button compact" disabled={disabled} onClick={onCancelCorrection} type="button">Cancel</button></div>
      </form> : null}
    </article>})}</div>
    {pageCount > 1 ? <nav aria-label="Closed order pages" className="order-archive-pagination">
      <button className="text-link" disabled={currentPage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button">Previous</button>
      <span>Page {currentPage + 1} of {pageCount}</span>
      <button className="text-link" disabled={currentPage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} type="button">Next</button>
    </nav> : null}
  </details>
}

function StockMovementHistory({ actionHistory, movements }: { actionHistory: ReactNode; movements: CommerceStockMovement[] }) {
  return <details className="core-panel action-history stock-movement-history">
    <summary><span>Stock records</span><strong>{movements.length} movements · actions on demand</strong></summary>
    <div className="stock-record-content">
      <section aria-label="Stock movements">
        <span className="core-eyebrow">Stock movements</span>
        {movements.length ? <div className="action-history-list">{movements.map((movement) => <article key={movement.id}>
          <div>
            <strong>{movement.kind === 'count'
              ? `count · ${movement.sku} · ${movement.expectedQuantity} → ${movement.countedQuantity} · ${movement.quantityDelta === 0 ? 'no variance' : `${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`}`
              : `${movement.kind} · ${movement.sku} · ${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`}</strong>
            <small>{movement.orderId ? `${movement.orderId} · ` : ''}{movement.actionId} · {movement.actor}</small>
            <p>{movement.reason} · Evidence: {movement.evidenceReference}</p>
          </div>
          <small>{formatTime(movement.createdAt)}</small>
        </article>)}</div> : <Empty>No attributable stock movements yet.</Empty>}
      </section>
      {actionHistory}
    </div>
  </details>
}

const productionEventLabels: Record<ProductionEvent['kind'], string> = {
  job_created: 'Job created',
  job_schedule_updated: 'Job plan updated',
  job_closed: 'Job closed short',
  output_recorded: 'Output recorded',
  material_consumed: 'Material used',
  issue_opened: 'Issue opened',
  issue_resolved: 'Issue resolved',
  quality_hold_placed: 'Quality hold placed',
  quality_hold_released: 'Quality hold released',
  machine_state_changed: 'Machine state changed',
  equipment_master_imported: 'Equipment master imported',
  equipment_commissioned: 'Equipment commissioned',
  equipment_maintenance_strategy_saved: 'Maintenance strategy saved',
  downtime_started: 'Downtime started',
  downtime_ended: 'Downtime ended',
  maintenance_started: 'Maintenance started',
  maintenance_completed: 'Maintenance completed',
  shift_closed: 'Shift closed',
}

const productionMaterialUnitLabels: Record<ProductionMaterialUnit, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
  pcs: 'pieces',
  pack: 'packs',
  bag: 'bags',
  roll: 'rolls',
  sheet: 'sheets',
  m: 'm',
  cm: 'cm',
}

function formatDowntimeDuration(durationMs: number) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${totalMinutes} min`
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`
}

// Same technique as ReceiptDialog's openPrintWindow: a Blob-backed print view,
// no PDF dependency. Read-only text; nothing here writes to Plant records.
function openProductionCertificatePrintWindow(certificate: ProductionCertificateOfConformance) {
  const text = productionCertificateOfConformanceText(certificate)
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Certificate ${certificate.job.id.replace(/[^A-Za-z0-9._-]/g, '-')}</title>
  <style>
    body { font-family: ui-monospace, 'Courier New', monospace; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
    @media print { @page { margin: 1cm; } }
  </style>
</head>
<body><pre>${escaped}</pre></body>
</html>`
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) {
    win.addEventListener('load', () => win.print())
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}

function productionJobPlanEventDetail(event: ProductionEvent) {
  const previousSchedule = event.fromJobPriority && event.fromJobDueAt
    ? `${productionJobPriorityLabels[event.fromJobPriority]} / ${formatIssueDue(event.fromJobDueAt)}`
    : 'Legacy unscheduled'
  const nextSchedule = `${productionJobPriorityLabels[event.jobPriority ?? 'normal']} / ${formatIssueDue(event.jobDueAt ?? event.createdAt)}`
  const previousOwner = event.fromJobOwner ? `owner ${event.fromJobOwner}` : 'owner not recorded'
  const nextOwner = event.jobOwner ? `owner ${event.jobOwner}` : 'owner not recorded (legacy)'
  return ` - ${previousSchedule} / ${previousOwner} to ${nextSchedule} / ${nextOwner}`
}

function ProductionEventHistory({ events }: { events: ProductionEvent[] }) {
  const [showAll, setShowAll] = useState(false)
  const visibleEvents = showAll ? events : events.slice(0, 8)
  return <details className="core-panel action-history production-event-history">
    <summary><span>Plant record</span><strong>{events.length} attributed events</strong></summary>
    {visibleEvents.length ? <div className="action-history-list">{visibleEvents.map((event) => <article key={event.id}>
      <div>
        <strong>{event.kind === 'output_recorded' ? event.outputKind === 'scrap' ? 'Scrap recorded' : 'Good output recorded' : productionEventLabels[event.kind]} - {event.summary}</strong>
        <small>{event.subjectId} - {event.actionId} - {event.actor}{event.kind === 'output_recorded' ? ` - Shift: ${event.shiftRef ?? 'Unassigned (legacy)'}` : event.kind === 'material_consumed' ? ` - Shift: ${event.shiftRef} - ${event.quantity} ${event.materialUnit} ${event.materialRef}${event.materialLot ? ` - Lot: ${event.materialLot}` : ''}` : event.kind === 'job_schedule_updated' ? productionJobPlanEventDetail(event) : event.kind === 'job_closed' ? ` - Shift: ${event.shiftRef} - ${event.remainingQuantity} not produced` : event.kind === 'maintenance_started' ? ` - Owner: ${event.maintenanceOwner}` : event.kind === 'maintenance_completed' ? ` - Start action: ${event.maintenanceStartActionId}` : ''}</small>
        <p>{event.reason} - Evidence: {event.evidenceReference}</p>
      </div>
      <small>{formatTime(event.createdAt)}</small>
    </article>)}</div> : <Empty>No attributed Plant event has been recorded yet.</Empty>}
    {events.length > 8 ? <button className="text-link" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? 'Show latest 8' : `Show all ${events.length}`}</button> : null}
  </details>
}

function ProductionPage({ managedIdentity, tab }: { managedIdentity: ManagedIdentity | null; tab: ProductionTab }) {
  const productionLocation = useLocation()
  const navigate = useNavigate()
  const [production, mutateProduction, productionStorageError, workspaceMode, managedVersion, managedWorkspaceId, productionCanWrite] = useProductionWorkspace(managedIdentity)
  const [relatedCommerce] = useCommerceWorkspace(managedIdentity)
  const relatedCommerceRef = useRef(relatedCommerce)
  const productionRef = useRef(production)
  useEffect(() => { relatedCommerceRef.current = relatedCommerce }, [relatedCommerce])
  useEffect(() => { productionRef.current = production }, [production])
  const [localPlantIndustryPackId] = useState(() => readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const requestedPlantIndustryPackId = plantIndustryPackIdFromSearch(productionLocation.search)
  const plantIndustryPackId = production.openingPlan?.industryPackId ?? requestedPlantIndustryPackId ?? localPlantIndustryPackId
  const activePlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  const loadedPlantSamplePackId = productionWorkingSamplePackId(production)
  const loadedPlantSamplePack = loadedPlantSamplePackId ? plantIndustryPack(loadedPlantSamplePackId) : null
  const plantSampleJobsActive = loadedPlantSamplePackId === plantIndustryPackId
  const plantSampleWorkflow = loadedPlantSamplePack?.firstWorkflow ?? activePlantIndustryPack.firstWorkflow
  const plantSampleContext = plantSampleJobsActive
    ? `${activePlantIndustryPack.name} sample jobs are loaded.`
    : loadedPlantSamplePack
      ? `${loadedPlantSamplePack.name} sample jobs are preserved. ${activePlantIndustryPack.name} is selected for future setup.`
      : 'Existing Plant job data was preserved.'
  const plantOrderScopeWorkspaceId = managedIdentity
    ? managedWorkspaceId || managedIdentity.workspaceId
    : 'local-sample'
  const plantOrderScope = `plant:${plantOrderScopeWorkspaceId}`
  const latestRecordedShiftRef = production.events.find((event) => Boolean(event.shiftRef?.trim()))?.shiftRef?.trim() ?? ''
  const [, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [plantJobView, setPlantJobView] = useStoredState<PlantJobView>(PLANT_JOB_VIEW_KEY, 'list', normalizePlantJobView)
  const [pendingAction, setPendingAction] = useState<PendingAccountableAction | null>(null)
  const [jobId, setJobId] = useState('')
  const [jobScanMiss, setJobScanMiss] = useState('')
  const [holdJobId, setHoldJobId] = useState(production.jobs.find((job) => !job.qualityHold && !job.closure)?.id ?? '')
  const [handoffShiftRef, setHandoffShiftRef] = useState(latestRecordedShiftRef)
  const [shiftHandoff, setShiftHandoff] = useState<ProductionShiftHandoff | null>(null)
  const [genealogyJobId, setGenealogyJobId] = useState(production.jobs[0]?.id ?? '')
  const [recallQuery, setRecallQuery] = useState('')
  const [recallSearchId, setRecallSearchId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [outputKind, setOutputKind] = useState<ProductionOutputKind>('good')
  const [shiftRef, setShiftRef] = useState(latestRecordedShiftRef)
  const [outputOpen, setOutputOpen] = useState(false)
  const [materialGuideOpen, setMaterialGuideOpen] = useState(false)
  const [shiftCloseGuideOpen, setShiftCloseGuideOpen] = useState(false)
  const [plantBatchOpen, setPlantBatchOpen] = useState(false)
  const [materialDraft, setMaterialDraft] = useState({
    jobId: production.jobs.find((job) => !job.closure && job.output + (job.scrap ?? 0) < job.target)?.id ?? '',
    materialRef: '',
    materialLot: '',
    quantity: '1',
    materialUnit: 'kg' as ProductionMaterialUnit,
  })
  const [area, setArea] = useState('Line 01')
  const [kind, setKind] = useState<ProductionIssue['kind']>('quality')
  const [severity, setSeverity] = useState<ProductionIssueSeverity>('medium')
  const [issueOwner, setIssueOwner] = useState('')
  const [issueDueInput, setIssueDueInput] = useState(defaultIssueDueInput)
  const [containment, setContainment] = useState('')
  const [summary, setSummary] = useState('')
  const [issueClock, setIssueClock] = useState(Date.now)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [issueMaintenanceFindingSource, setIssueMaintenanceFindingSource] = useState<ProductionMaintenanceFindingSource | null>(null)
  const [maintenanceCorrectiveDraft, setMaintenanceCorrectiveDraft] = useState<{
    issueId: string
    correctiveAction: string
    verificationResult: string
    finalDisposition: ProductionMaintenanceReturnToService
  } | null>(null)
  const [qualityCorrectiveDraft, setQualityCorrectiveDraft] = useState<{
    issueId: string
    failureMode: string
    causeCategory: ProductionQualityCauseCategory
    rootCause: string
    correctiveAction: string
    verificationResult: string
    effectivenessOwner: string
    effectivenessDue: string
  } | null>(null)
  const [machineObservation, setMachineObservation] = useState<{ machineId: string; toState: ProductionMachineState } | null>(null)
  const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false)
  const [downtimeMachineId, setDowntimeMachineId] = useState(production.machines[0]?.id ?? '')
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
  const [maintenanceMachineId, setMaintenanceMachineId] = useState(production.machines[0]?.id ?? '')
  const [maintenanceOwner, setMaintenanceOwner] = useState('')
  const [maintenanceCompletionDraft, setMaintenanceCompletionDraft] = useState<{
    startActionId: string
    outcome: ProductionMaintenanceOutcome
    findings: string
    procedureCompleted: boolean
    returnToService: ProductionMaintenanceReturnToService
  } | null>(null)
  const [jobDraft, setJobDraft] = useState<{ id: string; line: string; product: string; target: string; owner: string; priority: ProductionJobPriority; dueAt: string }>({
    id: '',
    line: '',
    product: '',
    target: '',
    owner: '',
    priority: 'normal',
    dueAt: defaultJobDueInput(),
  })
  const [shopDemandSignals, setShopDemandSignals] = useState<ShopProductionDemandSignal[]>([])
  const [shopDemandIssue, setShopDemandIssue] = useState('')
  const [selectedShopDemandDigest, setSelectedShopDemandDigest] = useState('')
  const jobDisclosureRef = useRef<HTMLDetailsElement>(null)
  const [plantJobImportReview, setPlantJobImportReview] = useState<PlantJobImportReview | null>(null)
  const [plantJobImportSourceName, setPlantJobImportSourceName] = useState('')
  const [scheduleDraft, setScheduleDraft] = useState<{ jobId: string; owner: string; priority: ProductionJobPriority; dueAt: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [actionTrigger, setActionTrigger] = useState<HTMLElement | null>(null)
  const [planDraft, setPlanDraft] = useState<{ jobId: string; line: string; product: string; target: string; owner: string; priority: ProductionJobPriority; dueAt: string; machineId: string; machineName: string; reason: string; evidenceReference: string; reviewed: boolean }>(() => ({
    ...managedPlantStarterPlan(plantIndustryPackId),
    owner: '',
    priority: 'normal',
    dueAt: defaultJobDueInput(),
    reason: '',
    evidenceReference: '',
    reviewed: false,
  }))
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')
  const issueDialogRef = useRef<HTMLDialogElement>(null)
  const maintenanceCorrectiveDialogRef = useRef<HTMLDialogElement>(null)
  const qualityCorrectiveDialogRef = useRef<HTMLDialogElement>(null)
  const issueTriggerRef = useRef<HTMLButtonElement>(null)
  const machineDialogRef = useRef<HTMLDialogElement>(null)
  const machineTriggerRef = useRef<HTMLButtonElement | null>(null)
  const downtimeDialogRef = useRef<HTMLDialogElement>(null)
  const downtimeTriggerRef = useRef<HTMLButtonElement>(null)
  const maintenanceDialogRef = useRef<HTMLDialogElement>(null)
  const maintenanceTriggerRef = useRef<HTMLButtonElement>(null)
  const maintenanceMachineSelectRef = useRef<HTMLSelectElement>(null)
  const maintenanceOutcomeRef = useRef<HTMLSelectElement>(null)
  const scheduleDialogRef = useRef<HTMLDialogElement>(null)
  const scheduleTriggerRef = useRef<HTMLButtonElement | null>(null)
  const outputPanelRef = useRef<HTMLElement>(null)
  const outputJobSelectRef = useRef<HTMLSelectElement>(null)
  const outputTriggerRef = useRef<HTMLButtonElement | null>(null)
  const materialDisclosureRef = useRef<HTMLDetailsElement>(null)
  const materialRefInputRef = useRef<HTMLInputElement>(null)
  const shiftCloseDisclosureRef = useRef<HTMLDetailsElement>(null)
  const openIssues = production.issues
    .filter((issue) => issue.status === 'open')
    .sort((left, right) => {
      const severityDifference = (left.severity ? productionIssueSeverityRank[left.severity] : 4)
        - (right.severity ? productionIssueSeverityRank[right.severity] : 4)
      if (severityDifference) return severityDifference
      return (left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY)
        - (right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY)
    })
  const resolvedIssues = production.issues.filter((issue) => issue.status === 'resolved')
  const urgentIssueCount = openIssues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length
  const heldJobs = production.jobs.filter((job) => Boolean(job.qualityHold))
  const holdableJobs = production.jobs.filter((job) => !job.qualityHold && !job.closure)
  const selectedHoldJobId = holdableJobs.some((job) => job.id === holdJobId) ? holdJobId : holdableJobs[0]?.id ?? ''
  const selectedHoldJob = holdableJobs.find((job) => job.id === selectedHoldJobId)
  const activeJobs = production.jobs
    .filter((job) => !job.closure && !job.qualityHold && job.output + (job.scrap ?? 0) < job.target)
    .sort(compareProductionJobSchedule)
  const completedJobs = production.jobs.filter((job) => Boolean(job.closure) || job.output + (job.scrap ?? 0) >= job.target)
  const selectedJobId = activeJobs.some((job) => job.id === jobId) ? jobId : activeJobs[0]?.id ?? ''
  const selectedJob = activeJobs.find((job) => job.id === selectedJobId)
  const selectedRemaining = selectedJob ? selectedJob.target - selectedJob.output - (selectedJob.scrap ?? 0) : 0
  // An unresolved job scan BLOCKS both output actions. Scanning a label is the moment an
  // operator believes the panel now knows which job they mean; a miss leaves the PREVIOUS
  // job selected, so without this an operator who scans, glances at the warning and taps on
  // would queue production against a job they did not scan. Clearing the selection instead
  // would be worse, not better: `selectedJobId` falls back to `activeJobs[0]` when `jobId`
  // is not in the list, so blanking it silently selects the FIRST active job -- also a job
  // nobody scanned, and with no warning left on screen. So the selection stays visible for
  // context and becomes un-actionable until the operator resolves the scan.
  const jobScanUnresolved = Boolean(jobScanMiss)
  const selectedMaterialJob = activeJobs.find((job) => job.id === materialDraft.jobId)
  const materialJobIsStale = Boolean(materialDraft.jobId && !selectedMaterialJob)
  const parsedMaterialQuantity = parseProductionMaterialQuantity(materialDraft.quantity)
  const materialQuantityError = parsedMaterialQuantity === null
    ? 'Enter a positive amount with up to three decimals that can be stored exactly (maximum 9,007,199,254,740.99).'
    : ''
  const materialEntries = production.events.filter((event) => event.kind === 'material_consumed')
  const recentMaterialEntries = materialEntries.slice(0, 5)
  const canonicalShiftRef = shiftRef.trim()
  const currentShiftOutput = productionShiftOutput(production, canonicalShiftRef)
  const currentShiftMaterialEntries = canonicalShiftRef
    ? materialEntries.filter((event) => event.shiftRef === canonicalShiftRef)
    : []
  const currentProductionCanonical = shiftHandoff ? productionStateCanonical(production) : ''
  const shiftHandoffIsCurrent = Boolean(shiftHandoff
    && shiftHandoff.sourceRevision === production.revision
    && shiftHandoff.sourceCanonical === currentProductionCanonical
    && shiftHandoff.plantOrderScope === plantOrderScope
    && shiftHandoff.shiftRef === handoffShiftRef.trim())
  const currentShiftCloseEvidence = currentProductionShiftCloseEvidence(production, undefined, plantOrderScope)
  const currentShiftClose = currentShiftCloseEvidence?.event ?? null
  const controlledOrderBlockerCount = shiftHandoff?.controlledOrders.filter((order) => order.blockingReasons.length > 0).length ?? 0
  const shiftCloseRows = shiftHandoff ? [
    ['Output', shiftHandoff.shiftOutput.goodUnits > 0 && shiftHandoff.shiftOutput.entryCount > 0 ? `${shiftHandoff.shiftOutput.goodUnits} good / ${shiftHandoff.shiftOutput.entryCount} entries` : 'Need good output'],
    ['Material', shiftHandoff.materialEntries.length > 0 ? `${shiftHandoff.materialEntries.length} traced` : 'Need same-shift trace'],
    ['Orders', shiftHandoff.controlledOrders.length ? controlledOrderBlockerCount ? `${controlledOrderBlockerCount} blocked` : `${shiftHandoff.controlledOrders.length} classified` : 'No controlled batch'],
    ['Quality', shiftHandoff.activeHolds.length + shiftHandoff.openQualityIssues.length === 0 ? 'Clear' : `${shiftHandoff.activeHolds.length + shiftHandoff.openQualityIssues.length} blockers`],
    ['Urgent', shiftHandoff.priorityProblems.length === 0 ? 'Clear' : `${shiftHandoff.priorityProblems.length} open`],
    ['Maintenance', shiftHandoff.activeDowntime.length + shiftHandoff.activeMaintenance.length === 0 ? 'Clear' : `${shiftHandoff.activeDowntime.length + shiftHandoff.activeMaintenance.length} open`],
  ] as const : []
  const shiftCloseReady = Boolean(shiftHandoffIsCurrent
    && shiftHandoff
    && shiftHandoff.shiftOutput.goodUnits > 0
    && shiftHandoff.shiftOutput.entryCount > 0
    && shiftHandoff.materialEntries.length > 0
    && shiftHandoff.activeHolds.length === 0
    && shiftHandoff.openQualityIssues.length === 0
    && shiftHandoff.priorityProblems.length === 0
    && shiftHandoff.activeDowntime.length === 0
    && shiftHandoff.activeMaintenance.length === 0
    && controlledOrderBlockerCount === 0)
  const plantHandoffReady = shiftCloseReady || Boolean(currentShiftClose)
  const selectedGenealogyJobId = production.jobs.some((job) => job.id === genealogyJobId)
    ? genealogyJobId
    : production.jobs[0]?.id ?? ''
  const batchGenealogyDownload = useMemo(() => {
    if (!selectedGenealogyJobId) return null
    const report = buildProductionBatchGenealogy(production, selectedGenealogyJobId)
    if (!report) return null
    return {
      report,
      filename: `supermega-plant-genealogy-${report.job.id}-${report.digest.slice(7, 15)}.json`,
      href: `data:application/json;charset=utf-8,${encodeURIComponent(formatProductionBatchGenealogy(report))}`,
    }
  }, [production, selectedGenealogyJobId])
  const certificateOfConformance = useMemo(() => {
    if (!selectedGenealogyJobId) return null
    return buildProductionCertificateOfConformance(production, selectedGenealogyJobId)
  }, [production, selectedGenealogyJobId])
  const certificateOfConformanceDownload = useMemo(() => {
    if (!certificateOfConformance) return null
    return {
      report: certificateOfConformance,
      filename: `supermega-plant-certificate-${certificateOfConformance.job.id}-${certificateOfConformance.digest.slice(7, 15)}.json`,
      href: `data:application/json;charset=utf-8,${encodeURIComponent(formatProductionCertificateOfConformance(certificateOfConformance))}`,
    }
  }, [certificateOfConformance])
  const recallTraceDownload = useMemo(() => {
    const report = buildProductionRecallTrace(production, recallSearchId)
    if (!report) return null
    const safeQuery = report.query.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'trace'
    return {
      report,
      filename: `supermega-plant-recall-${safeQuery}-${report.digest.slice(7, 15)}.json`,
      href: `data:application/json;charset=utf-8,${encodeURIComponent(formatProductionRecallTrace(report))}`,
    }
  }, [production, recallSearchId])
  const observedMachine = machineObservation
    ? production.machines.find((machine) => machine.id === machineObservation.machineId)
    : undefined
  const machineObservationTargets = observedMachine
    ? productionMachineStates.filter((state) => state !== observedMachine.state)
    : []
  const downtimeIntervals = productionDowntimeIntervals(production)
  const openDowntimeIntervals = downtimeIntervals.filter((interval) => !interval.end)
  const recentDowntimeIntervals = downtimeIntervals.filter((interval) => interval.end).slice(0, 3)
  const downtimeMachineIds = new Set(openDowntimeIntervals.map((interval) => interval.machineId))
  const availableDowntimeMachines = production.machines.filter((machine) => !downtimeMachineIds.has(machine.id))
  const selectedDowntimeMachineId = availableDowntimeMachines.some((machine) => machine.id === downtimeMachineId)
    ? downtimeMachineId
    : availableDowntimeMachines[0]?.id ?? ''
  const selectedDowntimeMachine = availableDowntimeMachines.find((machine) => machine.id === selectedDowntimeMachineId)
  const maintenanceRecords = productionMaintenanceRecords(production)
  const openMaintenanceRecords = maintenanceRecords.filter((record) => !record.completion)
  const recentMaintenanceRecords = maintenanceRecords.filter((record) => record.completion).slice(0, 3)
  const maintenanceFindingSources = new Map(recentMaintenanceRecords.flatMap((record) => {
    const source = record.completion ? productionMaintenanceFindingSource(production, record.completion.actionId) : null
    return source ? [[record.completion?.actionId ?? '', source] as const] : []
  }))
  const selectedMaintenanceCompletionRecord = maintenanceCompletionDraft
    ? openMaintenanceRecords.find((record) => record.startActionId === maintenanceCompletionDraft.startActionId)
    : undefined
  const maintenanceCompletionFindings = maintenanceCompletionDraft?.findings.trim() ?? ''
  const maintenanceCompletionIsValid = Boolean(maintenanceCompletionDraft
    && selectedMaintenanceCompletionRecord?.strategy
    && maintenanceCompletionFindings
    && maintenanceCompletionFindings.length <= 360
    && maintenanceCompletionDraft.procedureCompleted
    && (maintenanceCompletionDraft.outcome !== 'completed' || maintenanceCompletionDraft.returnToService === 'recommended'))
  const maintenanceMachineIds = new Set(openMaintenanceRecords.map((record) => record.machineId))
  const maintenanceDueQueue = productionMaintenanceDueQueue(production, new Date(issueClock).toISOString())
  const readyMaintenanceDueItems = maintenanceDueQueue.items.filter((item) => !maintenanceMachineIds.has(item.assetId)).slice(0, 6)
  const overdueMaintenanceCount = readyMaintenanceDueItems.filter((item) => item.status === 'overdue').length
  const availableMaintenanceMachines = production.machines.filter((machine) => !maintenanceMachineIds.has(machine.id))
  const selectedMaintenanceMachineId = availableMaintenanceMachines.some((machine) => machine.id === maintenanceMachineId)
    ? maintenanceMachineId
    : availableMaintenanceMachines[0]?.id ?? ''
  const selectedMaintenanceMachine = availableMaintenanceMachines.find((machine) => machine.id === selectedMaintenanceMachineId)
  const selectedMaintenanceStrategy = production.equipmentMaster?.assets.find((asset) => asset.id === selectedMaintenanceMachineId)?.maintenanceStrategy
  const selectedMaintenanceOwner = selectedMaintenanceStrategy?.maintenanceOwner ?? maintenanceOwner.trim()
  const selectedShopDemand = shopDemandSignals.find((signal) => signal.sourceDigest === selectedShopDemandDigest)
  const nextShopDemand = shopDemandSignals.find((signal) => !signal.existingActiveJobIds.length) ?? shopDemandSignals[0]
  const plantAgentJob = !productionCanWrite
    ? 'Restore Plant write readiness'
    : urgentIssueCount
      ? 'Contain urgent Plant problems'
      : heldJobs.length
        ? 'Review quality holds'
        : openDowntimeIntervals.length + openMaintenanceRecords.length
          ? 'Close maintenance records'
          : activeJobs.length
            ? 'Record next job output'
            : !plantHandoffReady
              ? 'Prepare shift close'
              : 'Add next Plant job'
  const plantControlNext = !productionCanWrite
    ? 'Restore write readiness'
    : urgentIssueCount
      ? 'Contain urgent problems'
      : heldJobs.length
        ? 'Clear quality holds'
        : openDowntimeIntervals.length + openMaintenanceRecords.length
          ? 'Close maintenance work'
          : activeJobs.length
            ? 'Record next output'
            : !plantHandoffReady
              ? 'Prepare shift close'
              : 'Plan next job'
  const plantControlRows = [
    ['Jobs', activeJobs.length ? `${activeJobs.length} active` : 'Plan'],
    ['Quality', heldJobs.length ? `${heldJobs.length} held` : 'Clear'],
    ['Maintenance', openDowntimeIntervals.length + openMaintenanceRecords.length ? `${openDowntimeIntervals.length + openMaintenanceRecords.length} open` : 'Clear'],
    ['Materials', materialEntries.length ? `${materialEntries.length} traced` : 'No trace'],
    ['Shift close', currentShiftClose ? 'Closed' : shiftHandoffIsCurrent ? 'Ready' : 'Build'],
    ['Write status', productionCanWrite && !pendingAction ? 'Ready' : 'Locked'],
  ] as const
  const plantLifecycleRows = [
    ['Plan', activeJobs.length ? `${activeJobs.length} active` : 'Add job'],
    ['Execute', activeJobs[0] ? `${activeJobs[0].id} next` : 'No active job'],
    ['Quality', heldJobs.length ? `${heldJobs.length} held` : 'Clear'],
    ['Maintenance', openDowntimeIntervals.length + openMaintenanceRecords.length ? `${openDowntimeIntervals.length + openMaintenanceRecords.length} open` : 'Clear'],
    ['Trace', materialEntries.length ? `${materialEntries.length} material` : 'No trace'],
    ['Shift close', currentShiftClose ? 'Closed' : shiftHandoffIsCurrent ? 'Ready' : 'Build'],
  ] as const
  const plantControlBoundary = 'Manager reviews production, quality, maintenance, material, and shift-close changes.'
  const openWcmCount = openDowntimeIntervals.length + openMaintenanceRecords.length
  const mesDispatchStation = activeJobs[0]?.line ?? selectedDowntimeMachine?.name ?? selectedMaintenanceMachine?.name ?? 'Plant floor'
  const mesDispatchTarget = urgentIssueCount
    ? `${urgentIssueCount} urgent issue${urgentIssueCount === 1 ? '' : 's'}`
    : heldJobs[0]
      ? heldJobs[0].id
      : activeJobs[0]
        ? `${activeJobs[0].id} / ${(activeJobs[0].target - activeJobs[0].output - (activeJobs[0].scrap ?? 0)).toLocaleString()} left`
        : plantHandoffReady
          ? 'Next plan'
          : 'Shift close'
  const mesDispatchBlocker = !productionCanWrite
    ? 'Write readiness'
    : pendingAction
      ? 'Owner approval'
      : urgentIssueCount
        ? 'Containment'
        : heldJobs.length
          ? 'Quality hold'
          : openWcmCount
            ? 'Maintenance close'
            : activeJobs.length && !materialEntries.length
              ? 'Trace start'
              : !plantHandoffReady
                ? 'Shift close'
                : 'None'
  const mesDispatchEvidence = materialEntries.length
    ? `${materialEntries.length} material trace`
    : plantHandoffReady
      ? 'Shift close current'
      : activeJobs.length
        ? 'Need trace'
        : 'Plan evidence'
  const mesDispatchRows = [
    ['Station', mesDispatchStation],
    ['Target', mesDispatchTarget],
    ['Blocker', mesDispatchBlocker],
    ['Evidence', mesDispatchEvidence],
    ['Shift close', currentShiftClose ? 'Closed' : shiftHandoffIsCurrent ? 'Current' : 'Build'],
    ['Safety', 'Review first'],
  ] as const
  const openMaterialIssues = openIssues.filter((issue) => issue.kind === 'materials')
  const primaryOrderExecution = productionOrderPortfolioEntries(production)[0]?.execution ?? null
  const orderExecutionProjection = primaryOrderExecution ? projectPlantOrder(primaryOrderExecution) : null
  const materialRequirements = primaryOrderExecution ? projectProductionMaterialRequirements(primaryOrderExecution, relatedCommerce) : null
  const plantMrpNext = !productionCanWrite
    ? 'Restore Plant readiness'
    : openMaterialIssues.length
      ? 'Resolve material blockers'
      : !materialRequirements
        ? 'Set up the reviewed BOM'
        : materialRequirements.status === 'mapping_required'
          ? 'Map BOM materials to Shop stock'
          : materialRequirements.status === 'shortage'
            ? 'Review purchase quantities'
            : materialRequirements.status === 'supply_at_risk'
              ? 'Expedite or re-date incoming supply'
            : materialRequirements.status === 'covered_by_open_po'
              ? 'Monitor incoming purchase orders'
              : materialRequirements.status === 'ready_to_issue'
                ? 'Issue reviewed Shop stock'
                : 'Material supply fulfilled'
  const plantMrpRows = [
    ['Demand', materialRequirements ? `${materialRequirements.job.targetQuantity} ${materialRequirements.job.product}` : activeJobs.length ? `${activeJobs.length} active jobs` : 'No active job'],
    ['BOM', materialRequirements ? `${materialRequirements.summary.materials} materials` : orderExecutionProjection?.plan ? `${orderExecutionProjection.materials.length} materials` : 'Use order plan'],
    ['Availability', orderExecutionProjection?.latestAvailability ? orderExecutionProjection.latestAvailability.passed ? 'Checked clear' : `${orderExecutionProjection.latestAvailability.shortfalls.length} short` : 'Needs check'],
    ['Shop mapping', materialRequirements?.summary.mappingRequired ? `${materialRequirements.summary.mappingRequired} required` : materialRequirements ? 'Complete' : 'Not planned'],
    ['Supply', materialRequirements?.summary.shortages ? `${materialRequirements.summary.shortages} shortage` : materialRequirements?.summary.supplyAtRisk ? `${materialRequirements.summary.supplyAtRisk} at risk` : materialRequirements?.summary.coveredByOpenPo ? `${materialRequirements.summary.coveredByOpenPo} on PO` : materialRequirements?.summary.readyToIssue ? `${materialRequirements.summary.readyToIssue} ready` : materialRequirements?.summary.fulfilled ? 'Fulfilled' : 'Not planned'],
    ['Issue gate', openMaterialIssues.length ? `${openMaterialIssues.length} open` : 'Clear'],
  ] as const
  const openQualityIssues = openIssues.filter((issue) => issue.kind === 'quality')
  const productionGoodUnits = production.jobs.reduce((total, job) => total + job.output, 0)
  const productionScrapUnits = production.jobs.reduce((total, job) => total + (job.scrap ?? 0), 0)
  const plantCostReadinessNext = !productionCanWrite
    ? 'Restore cost evidence readiness'
    : pendingAction
      ? 'Approve pending Plant action'
      : !materialEntries.length
        ? 'Record material trace before cost'
        : heldJobs.length || openQualityIssues.length
          ? 'Resolve quality before cost'
          : openWcmCount
            ? 'Close maintenance before cost'
            : !plantHandoffReady
              ? 'Prepare cost review'
              : completedJobs.length
                ? 'Cost package ready for review'
                : 'Run evidence ready'
  const plantCostReadinessRows = [
    ['Good', productionGoodUnits ? `${productionGoodUnits.toLocaleString()} units` : 'No output'],
    ['Scrap', productionScrapUnits ? `${productionScrapUnits.toLocaleString()} units` : 'None'],
    ['Materials', materialEntries.length ? `${materialEntries.length} traced` : 'Missing'],
    ['Quality', heldJobs.length || openQualityIssues.length ? 'Blocked' : 'Clear'],
    ['Maintenance', openWcmCount ? `${openWcmCount} open` : 'Closed'],
    ['Cost gate', plantHandoffReady && materialEntries.length && !heldJobs.length && !openQualityIssues.length && !openWcmCount ? 'Review only' : 'Blocked'],
  ] as const
  const plantCostPacketReady = Boolean(completedJobs.length && productionGoodUnits && materialEntries.length && plantHandoffReady && !heldJobs.length && !openQualityIssues.length && !openWcmCount)
  const plantCostPacketRows = [
    ['Batch', completedJobs.length ? `${completedJobs.length} finished` : activeJobs.length ? 'Still running' : 'No job'],
    ['Output', productionGoodUnits ? `${productionGoodUnits.toLocaleString()} good` : 'No output'],
    ['Scrap', productionScrapUnits ? `${productionScrapUnits.toLocaleString()} scrap` : 'None'],
    ['Materials', materialEntries.length ? `${materialEntries.length} trace rows` : 'Need trace'],
    ['Release', heldJobs.length || openQualityIssues.length ? 'Quality blocked' : plantHandoffReady ? 'Evidence ready' : 'Need shift close'],
    ['Cost file', plantCostPacketReady ? 'Review package' : 'Blocked'],
  ] as const
  const plantQualityReleaseNext = !productionCanWrite
    ? 'Restore Plant readiness'
    : pendingAction
      ? 'Approve pending Plant action'
      : heldJobs.length || openQualityIssues.length
        ? 'Resolve quality holds'
        : openWcmCount
          ? 'Close maintenance work'
          : openMaterialIssues.length || !materialEntries.length
            ? 'Complete trace evidence'
            : !plantHandoffReady
              ? 'Prepare release review'
              : 'Release package ready'
  const plantQualityReleaseRows = [
    ['Holds', heldJobs.length ? `${heldJobs.length} held` : 'Clear'],
    ['Quality', openQualityIssues.length ? `${openQualityIssues.length} open` : 'Clear'],
    ['Maintenance', openWcmCount ? `${openWcmCount} open` : 'Closed'],
    ['Trace', materialEntries.length ? `${materialEntries.length} material` : 'Missing'],
    ['Shift close', currentShiftClose ? 'Closed' : shiftHandoffIsCurrent ? 'Current' : 'Needed'],
    ['Gate', productionCanWrite && !pendingAction ? 'Owner release' : 'Locked'],
  ] as const
  const qualityIssuesWithContainment = openQualityIssues.filter((issue) => Boolean(issue.owner && issue.dueAt && issue.containment))
  const plantInspectionNext = !productionCanWrite
    ? 'Restore inspection readiness'
    : pendingAction
      ? 'Approve pending quality action'
      : heldJobs.length
        ? 'Inspect held batches'
        : openQualityIssues.length > qualityIssuesWithContainment.length
          ? 'Assign NCR containment'
          : openQualityIssues.length
            ? 'Close CAPA evidence'
            : activeJobs.length && !materialEntries.length
              ? 'Sample first production run'
              : 'Inspection queue clear'
  const closedCapaCount = resolvedIssues.filter((issue) => issue.kind === 'quality').length
  const overdueCapaCount = resolvedIssues.filter((issue) => issue.resolution?.qualityCorrectiveAction && isCapaEffectivenessOverdue(issue.resolution.qualityCorrectiveAction, new Date(issueClock).toISOString())).length
  const plantInspectionRows = [
    ['Sample', activeJobs.length ? `${activeJobs.length} jobs` : 'No job'],
    ['NCR', openQualityIssues.length ? `${openQualityIssues.length} open` : 'Clear'],
    ['Containment', qualityIssuesWithContainment.length === openQualityIssues.length ? 'Owned' : `${openQualityIssues.length - qualityIssuesWithContainment.length} missing`],
    ['CAPA', closedCapaCount ? (overdueCapaCount ? `${closedCapaCount} closed · ${overdueCapaCount} review overdue` : `${closedCapaCount} closed`) : 'None yet'],
    ['Evidence', heldJobs.length || openQualityIssues.length || materialEntries.length ? 'Required' : 'Ready'],
    ['Release', productionCanWrite && !pendingAction && !heldJobs.length && !openQualityIssues.length ? 'Owner review' : 'Blocked'],
  ] as const
  const plantComplianceDossierNext = !productionCanWrite
    ? 'Restore audit readiness'
    : pendingAction
      ? 'Approve pending Plant action'
      : openQualityIssues.length || heldJobs.length
        ? 'Resolve audit quality'
        : openWcmCount
          ? 'Close maintenance evidence'
          : !materialEntries.length
            ? 'Record traceability'
            : !plantHandoffReady
              ? 'Build shift dossier'
              : plantCostPacketReady
                ? 'Audit dossier ready'
                : 'Prepare cost dossier'
  const plantComplianceDossierRows = [
    ['Audit quality', openQualityIssues.length || heldJobs.length ? `${openQualityIssues.length + heldJobs.length} blocked` : 'Clear'],
    ['Maintenance', openWcmCount ? `${openWcmCount} open` : 'Closed'],
    ['Trace', materialEntries.length ? `${materialEntries.length} material` : 'Missing'],
    ['Output', productionGoodUnits ? `${productionGoodUnits.toLocaleString()} good` : 'No output'],
    ['Handoff', currentShiftClose ? 'Closed' : shiftHandoffIsCurrent ? 'Current' : 'Build'],
    ['Safety', 'Review first'],
  ] as const
  const currentShiftHasOutput = Boolean(canonicalShiftRef
    && currentShiftOutput.goodUnits > 0
    && currentShiftOutput.entryCount > 0)
  const guidedPlantJobId = activeJobs[0]?.id ?? ''
  const shiftCloseProblemCount = openIssues.filter((issue) => issue.kind === 'quality' || issue.severity === 'critical' || issue.severity === 'high').length
    + heldJobs.length
    + openWcmCount
  const immediatePlantBlockerCount = urgentIssueCount + heldJobs.length + openWcmCount
  const plantTodayStep = !productionCanWrite
    ? 'restore'
    : pendingAction
      ? 'approval'
      : immediatePlantBlockerCount
        ? 'problems'
        : activeJobs.length && !currentShiftHasOutput
          ? 'output'
          : currentShiftHasOutput && !currentShiftMaterialEntries.length
            ? 'material'
            : shiftCloseProblemCount
              ? 'problems'
              : !activeJobs.length && !currentShiftHasOutput
                ? 'plan'
                : !currentShiftClose
                  ? 'shift-close'
                  : activeJobs.length
                    ? 'output'
                    : 'plan'
  const plantTodayState = !productionCanWrite
    ? 'blocked'
    : pendingAction || shiftCloseProblemCount
      ? 'attention'
      : 'ready'
  const plantTodayHeadline = plantTodayStep === 'restore'
    ? 'Restore Plant write access'
    : plantTodayStep === 'approval'
      ? 'One Plant change needs approval'
      : plantTodayStep === 'problems'
        ? 'Clear shift blockers'
        : plantTodayStep === 'material'
          ? 'Record materials used'
          : plantTodayStep === 'shift-close'
            ? 'Close this shift'
            : plantTodayStep === 'plan'
              ? 'Plan the next job'
              : currentShiftClose
                ? 'Continue production'
                : 'Record first shift output'
  const plantTodayReason = plantTodayStep === 'restore'
    ? 'Company data must confirm durable storage before records can change.'
    : plantTodayStep === 'approval'
      ? 'Review the pending change, responsible owner, reason, and evidence.'
      : plantTodayStep === 'problems'
        ? `${shiftCloseProblemCount} quality or maintenance blocker${shiftCloseProblemCount === 1 ? '' : 's'} must be cleared before owner close.`
        : plantTodayStep === 'material'
          ? `Good output is recorded for ${canonicalShiftRef}. Record the materials used in this shift before owner close.`
          : plantTodayStep === 'shift-close'
            ? `${canonicalShiftRef} has output, materials used, and clear quality and maintenance gates. Prepare the accountable close.`
            : plantTodayStep === 'plan'
              ? 'No active production job is waiting. Add the next owned job and due time.'
              : currentShiftClose
                ? `${currentShiftClose.shiftRef} is closed by ${currentShiftClose.actor}. Record the next output when production continues.`
                : activeJobs[0]
                  ? `${activeJobs[0].id} is the next active job by priority and due time.`
                  : 'Choose an active job and record the first good output for this shift.'
  const plantTodayAction = plantTodayStep === 'restore'
    ? 'Restore write access'
    : plantTodayStep === 'approval'
      ? 'Finish approval'
      : plantTodayStep === 'problems'
        ? 'Review blockers'
        : plantTodayStep === 'material'
          ? 'Record materials used'
          : plantTodayStep === 'shift-close'
            ? 'Close shift'
            : plantTodayStep === 'plan'
              ? 'Plan next job'
              : currentShiftClose
                ? 'Record next output'
                : 'Record output'
  const plantTodayMetrics = [
    ['Active jobs', activeJobs.length ? `${activeJobs.length} running` : 'None'],
    ['Shift output', currentShiftHasOutput ? `${currentShiftOutput.goodUnits.toLocaleString()} good` : currentShiftClose ? `${(currentShiftClose.goodUnits ?? 0).toLocaleString()} closed` : 'Not started'],
    ['Problems & quality', openIssues.length + heldJobs.length ? `${openIssues.length + heldJobs.length} open` : 'Clear'],
    ['Maintenance', openWcmCount ? `${openWcmCount} open` : overdueMaintenanceCount ? `${overdueMaintenanceCount} overdue` : 'Clear'],
    ['Materials used', currentShiftMaterialEntries.length ? `${currentShiftMaterialEntries.length} records` : currentShiftClose ? `${currentShiftClose.materialEntryCount ?? 0} closed` : currentShiftHasOutput ? 'Next step' : 'Not started'],
    ['Shift close', currentShiftClose ? 'Closed' : shiftHandoffIsCurrent ? 'Ready' : 'Not closed'],
  ] as const
  const plantTodaySource = managedIdentity
    ? `Company Plant · revision ${managedVersion ?? production.revision}`
    : 'Local sample records on this device'
  const plantTodayNotice = productionStorageError
    ? `Writes paused: ${productionStorageError}`
    : notice || (productionCanWrite
      ? 'Every production, quality, material, maintenance, and equipment-status change still requires accountable review.'
      : 'Writes are paused until durable storage and write locking are confirmed.')

  useEffect(() => {
    let current = true
    void projectShopProductionDemand(relatedCommerce, production.jobs)
      .then((signals) => {
        if (!current) return
        setShopDemandSignals(signals)
        setShopDemandIssue('')
        setSelectedShopDemandDigest((digest) => digest && signals.some((signal) => signal.sourceDigest === digest) ? digest : '')
      })
      .catch((error) => {
        if (!current) return
        setShopDemandSignals([])
        setShopDemandIssue(error instanceof Error ? error.message : 'Shop demand could not be verified.')
        setSelectedShopDemandDigest('')
      })
    return () => { current = false }
  }, [production.jobs, relatedCommerce])

  useEffect(() => {
    const timer = window.setInterval(() => setIssueClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const dialog = issueDialogRef.current
    if (!dialog) return
    if (issueDialogOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('textarea')?.focus())
    }
    if (!issueDialogOpen && dialog.open) dialog.close()
  }, [issueDialogOpen, tab])

  useEffect(() => {
    const dialog = maintenanceCorrectiveDialogRef.current
    if (!dialog) return
    if (maintenanceCorrectiveDraft && !dialog.open) dialog.showModal()
    if (!maintenanceCorrectiveDraft && dialog.open) dialog.close()
  }, [maintenanceCorrectiveDraft, tab])

  useEffect(() => {
    const dialog = qualityCorrectiveDialogRef.current
    if (!dialog) return
    if (qualityCorrectiveDraft && !dialog.open) dialog.showModal()
    if (!qualityCorrectiveDraft && dialog.open) dialog.close()
  }, [qualityCorrectiveDraft, tab])

  useEffect(() => {
    const dialog = machineDialogRef.current
    if (!dialog) return
    if (machineObservation && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('select')?.focus())
    }
    if (!machineObservation && dialog.open) dialog.close()
  }, [machineObservation, tab])

  useEffect(() => {
    const dialog = downtimeDialogRef.current
    if (!dialog) return
    if (downtimeDialogOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-downtime-primary]')?.focus())
    }
    if (!downtimeDialogOpen && dialog.open) dialog.close()
  }, [downtimeDialogOpen, tab])

  useEffect(() => {
    const dialog = maintenanceDialogRef.current
    if (!dialog) return
    if (maintenanceDialogOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-maintenance-primary]')?.focus())
    }
    if (!maintenanceDialogOpen && dialog.open) dialog.close()
  }, [maintenanceDialogOpen, tab])

  useEffect(() => {
    const dialog = scheduleDialogRef.current
    if (!dialog) return
    if (scheduleDraft && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('select')?.focus())
    }
    if (!scheduleDraft && dialog.open) dialog.close()
  }, [scheduleDraft, tab])

  useEffect(() => {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_seen',
      product: 'production',
      route: productionLocation.pathname + productionLocation.search,
      detail: `Plant next step: ${plantTodayStep}`,
    })
  }, [plantTodayStep, productionLocation.pathname, productionLocation.search])

  useEffect(() => {
    const focus = new URLSearchParams(productionLocation.search).get('focus')
    if (focus === 'material-use' && tab === 'production') {
      if (guidedPlantJobId) {
        requestAnimationFrame(() => {
          outputTriggerRef.current = null
          setJobId(guidedPlantJobId)
          setMaterialDraft((current) => ({ ...current, jobId: guidedPlantJobId }))
          setOutputOpen(true)
          setMaterialGuideOpen(true)
          requestAnimationFrame(() => {
            const disclosure = materialDisclosureRef.current
            if (!disclosure) return
            disclosure.scrollIntoView({ behavior: 'smooth', block: 'center' })
            materialRefInputRef.current?.focus({ preventScroll: true })
          })
        })
      }
      navigate('/plant/?tab=production', { replace: true })
      return
    }
    if (focus === 'shift-close' && tab === 'control') {
      const suggestedShiftRef = canonicalShiftRef || shiftReferencePlaceholder()
      requestAnimationFrame(() => {
        setShiftRef(suggestedShiftRef)
        setHandoffShiftRef(suggestedShiftRef)
        setShiftCloseGuideOpen(true)
        requestAnimationFrame(() => {
          const disclosure = shiftCloseDisclosureRef.current
          if (!disclosure) return
          disclosure.scrollIntoView({ behavior: 'smooth', block: 'center' })
          disclosure.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
        })
      })
      navigate('/plant/?tab=control', { replace: true })
    }
  }, [canonicalShiftRef, guidedPlantJobId, navigate, productionLocation.search, tab])

  async function initializeManagedProduction(event: FormEvent) {
    event.preventDefault()
    if (!managedIdentity) return
    const firstJobId = planDraft.jobId.trim().toUpperCase()
    const line = planDraft.line.trim()
    const product = planDraft.product.trim()
    const owner = planDraft.owner.trim()
    const jobTarget = Number(planDraft.target)
    const jobDueAt = new Date(planDraft.dueAt)
    const machineId = planDraft.machineId.trim().toUpperCase()
    const machineName = planDraft.machineName.trim()
    const reason = planDraft.reason.trim()
    const evidenceReference = planDraft.evidenceReference.trim()
    if (!planDraft.reviewed || !firstJobId || !line || !product || !owner || owner.length > 120 || !machineId || !machineName || !reason || !evidenceReference || !Number.isSafeInteger(jobTarget) || jobTarget < 1 || Number.isNaN(jobDueAt.getTime()) || jobDueAt.getTime() <= Date.now()) {
      setPlanError('Review every suggested value, then confirm one real job with an owner, future due time, machine, whole-number target, reason, and evidence reference.')
      return
    }
    const proof: ProductionActionProof = {
      actionId: uid('ACT'),
      capturedAt: new Date().toISOString(),
      actor: managedIdentity.userId,
      reason,
      evidenceReference,
    }
    setPlanBusy(true)
    setPlanError('')
    try {
      await mutateProduction('production.workspace.initialized', commandUuid(), proof, (current) => current.jobs.length || current.issues.length || current.machines.length || current.events.length ? null : validateProductionState({
        ...current,
        jobs: [{ id: firstJobId, line, product, target: jobTarget, output: 0, owner, priority: planDraft.priority, dueAt: jobDueAt.toISOString() }],
        machines: [{ id: machineId, name: machineName, state: 'running' }],
      }))
      setJobId(firstJobId)
      setNotice(`Company Plant initialized with ${firstJobId}.`)
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'The managed Plant plan was not initialized.')
    } finally {
      setPlanBusy(false)
    }
  }

  const effectiveMode = managedIdentity && (workspaceMode === 'local' || managedWorkspaceId !== managedIdentity.workspaceId) ? 'managed-loading' : workspaceMode
  if (managedIdentity && effectiveMode !== 'managed-ready') {
    const unprovisioned = effectiveMode === 'managed-unprovisioned'
    if (unprovisioned) return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Company Plant setup · {activePlantIndustryPack.name}</span><h2>Review your first operating plan</h2></div><span className="status-pill pending">Not provisioned</span></div>
      <p className="panel-copy">We suggested one editable job and work centre for {activePlantIndustryPack.name.toLowerCase()}. Confirm them against your real work order. No browser demo jobs, issues, equipment, or output are copied, and no production history will be invented.</p>
      <form className="core-form compact-form" onSubmit={(formEvent) => void initializeManagedProduction(formEvent)}>
        <div className="form-row"><label>Job ID<input maxLength={80} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, jobId: inputEvent.target.value }))} placeholder="JOB-001" required value={planDraft.jobId} /></label><label>Line or team<input maxLength={120} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, line: inputEvent.target.value }))} placeholder="Line 01" required value={planDraft.line} /></label></div>
        <div className="form-row"><label>Product or batch<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, product: inputEvent.target.value }))} placeholder="Product name" required value={planDraft.product} /></label><label>Target units<input min="1" onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, target: inputEvent.target.value }))} required step="1" type="number" value={planDraft.target} /></label></div>
        <div className="form-row"><label>Priority<select onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, priority: inputEvent.target.value as ProductionJobPriority }))} value={planDraft.priority}>{productionJobPriorities.map((priority) => <option key={priority} value={priority}>{productionJobPriorityLabels[priority]}</option>)}</select></label><label>Due time<input autoComplete="off" min={localDateTimeInputValue(new Date())} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, dueAt: inputEvent.target.value }))} required type="datetime-local" value={planDraft.dueAt} /></label></div>
        <label>Responsible owner<input autoComplete="off" maxLength={120} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, owner: inputEvent.target.value }))} placeholder="Named person or role" required value={planDraft.owner} /></label>
        <div className="form-row"><label>Machine ID<input maxLength={80} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, machineId: inputEvent.target.value }))} placeholder="MC-01" required value={planDraft.machineId} /></label><label>Machine name<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, machineName: inputEvent.target.value }))} placeholder="Mixer 01" required value={planDraft.machineName} /></label></div>
        <label>Opening plan reason<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, reason: inputEvent.target.value }))} placeholder="How this job and target were confirmed" required value={planDraft.reason} /></label>
        <label>Evidence reference<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, evidenceReference: inputEvent.target.value }))} placeholder="Shift plan, work order, or count sheet" required value={planDraft.evidenceReference} /></label>
        <label className="checkbox-row"><input checked={planDraft.reviewed} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, reviewed: inputEvent.target.checked }))} required type="checkbox" /><span>I reviewed these values against a real plan. Create only this zero-output job and machine.</span></label>
        <div className="form-actions"><Link className="text-link" to="/settings/#controls">Workspace settings</Link><button className="core-button primary" disabled={planBusy} type="submit">{planBusy ? 'Creating…' : 'Create managed plan'}</button></div>
        <p className="form-notice" role="status">{planError || productionStorageError || `Signed in as ${managedIdentity.email}. The company account records this setup.`}</p>
      </form>
    </section>
    return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Company Plant</span><h2>{effectiveMode === 'managed-error' ? 'Company account unavailable' : 'Loading company account'}</h2></div><span className="status-pill bounded">{effectiveMode === 'managed-error' ? 'Blocked' : 'Checking'}</span></div>
      <p className="panel-copy">{productionStorageError || 'Plant remains read-only until the authenticated tenant state is confirmed.'}</p>
      <div className="form-actions"><Link className="core-button" to="/settings/#controls">Open workspace settings</Link></div>
    </section>
  }

  function queueAction(
    action: Omit<PendingAccountableAction, 'id' | 'commandId' | 'domain'>,
    trigger?: HTMLElement | null,
  ): boolean {
    if (!productionCanWrite) {
      setNotice('Plant changes are paused because this workspace cannot confirm writes. Reload or open Settings before retrying.')
      return false
    }
    if (pendingAction) {
      setNotice(`Finish or cancel ${pendingAction.id} before reviewing another change.`)
      return false
    }
    setActionTrigger(trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
    setPendingAction({ ...action, id: uid('ACT'), commandId: commandUuid(), domain: 'production' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
    return true
  }

  async function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    const action = pendingAction
    const record = confirmAccountableAction(action, details)
    if (!action.confirmation) {
      setPendingAction((current) => current?.id === action.id
        ? { ...current, confirmation: record }
        : current)
    }
    try {
      await action.apply(record)
    } catch (error) {
      if (error instanceof PlantReviewRequiredError) {
        setPendingAction(null)
        setNotice(error.message)
      }
      throw error
    }
    if (!managedIdentity) setActions((current) => [record, ...current])
    setNotice(managedIdentity ? `${record.id} confirmed in Company Plant. ${pendingAction.summary}`
      : `${pendingAction.summary} completed. It was persisted with attributed Plant evidence.`)
    setPendingAction(null)
  }

  // Shop-floor scanning is input assistance only: neither function below writes a Plant
  // record, opens an accountable action, or invents a domain value. They fill exactly the
  // field an operator would otherwise fill by hand at the line, from the printed code on
  // the job card and on the material label.
  //
  // The Job control is a select, so there is no typed variant a scan could drift from --
  // a scan sets the same jobId the dropdown sets and nothing else. Matching is an exact,
  // case-insensitive job-id comparison against the SAME activeJobs list the dropdown
  // renders, so a code can never select a job the operator could not have picked. An
  // unmatched code is never swallowed: it stays on screen so the operator can read what
  // the camera actually decoded instead of wondering why nothing happened.
  function selectScannedJob(value: string) {
    const scanned = value.trim()
    const normalized = scanned.toLocaleLowerCase()
    const match = activeJobs.find((job) => job.id.toLocaleLowerCase() === normalized)
    // The echoed miss is capped exactly like the material field: a QR code carrying a long
    // URL must not push an unbreakable string through the panel. The notice also wraps
    // anywhere, so what is shown is readable rather than a horizontal scrollbar.
    if (!match) return setJobScanMiss(scanned.slice(0, 120))
    setJobScanMiss('')
    setJobId(match.id)
  }

  // The material reference is free text with no master list to resolve against, so the
  // scan simply becomes the field value -- identical to typing it. The one thing applied
  // on top is the field's own maxLength: the keyboard path cannot produce more than 120
  // characters, so a long QR payload must not enter through the camera either. The value
  // stays visible in the field and passes through the same accountable review gate.
  function applyScannedMaterialRef(value: string) {
    setMaterialDraft((current) => ({ ...current, materialRef: value.slice(0, 120) }))
  }

  function recordOutput(event: FormEvent) {
    event.preventDefault()
    // Guarded here as well as on the button: a disabled control is an affordance, not a
    // safety boundary, and this form can also be reached by implicit submission.
    if (jobScanUnresolved) return setNotice(`No active job carries the scanned code ${jobScanMiss}. Choose the job or scan again before recording output.`)
    const recordedShiftRef = shiftRef.trim()
    if (!recordedShiftRef || recordedShiftRef.length > 80) return setNotice('Enter a shift reference of 1 to 80 characters.')
    if (!Number.isSafeInteger(quantity) || quantity < 1) return setNotice('Enter a whole-unit quantity of at least 1.')
    if (!selectedJob) return setNotice('Choose an active job before recording output.')
    if (selectedRemaining < 1) return setNotice(`${selectedJob.id} is already at target.`)
    if (quantity > selectedRemaining) return setNotice(`Only ${selectedRemaining} units remain for ${selectedJob.id}. Nothing was recorded.`)
    const recordedJobId = selectedJob.id
    const recordedQuantity = quantity
    const recordedOutputKind = outputKind
    const recordedScrap = selectedJob.scrap ?? 0
    const recordedShiftOutput = productionShiftOutput(production, recordedShiftRef)
    const recordedShiftMaterialCount = materialEntries.filter((event) => event.shiftRef === recordedShiftRef).length
    const resultLabel = recordedOutputKind === 'scrap' ? 'scrap units' : 'good units'
    const nextGood = selectedJob.output + (recordedOutputKind === 'good' ? recordedQuantity : 0)
    const nextScrap = recordedScrap + (recordedOutputKind === 'scrap' ? recordedQuantity : 0)
    setShiftRef(recordedShiftRef)
    setHandoffShiftRef(recordedShiftRef)
    queueAction({
      kind: recordedOutputKind === 'scrap' ? 'production_scrap' : 'production_output',
      subjectId: recordedJobId,
      summary: `Record ${recordedQuantity} ${resultLabel} for ${recordedJobId} · ${recordedShiftRef}`,
      before: `${selectedJob.output} good · ${recordedScrap} scrap · ${recordedShiftOutput.goodUnits} good / ${recordedShiftOutput.scrapUnits} scrap this shift`,
      after: `${nextGood} good · ${nextScrap} scrap · ${recordedShiftOutput.goodUnits + (recordedOutputKind === 'good' ? recordedQuantity : 0)} good / ${recordedShiftOutput.scrapUnits + (recordedOutputKind === 'scrap' ? recordedQuantity : 0)} scrap this shift`,
      actorSuggestion: managedIdentity ? undefined : 'Plant operator',
      reasonSuggestion: `${recordedOutputKind === 'scrap' ? 'Scrap' : 'Good output'} reviewed for ${recordedJobId} during ${recordedShiftRef}.`,
      evidenceReferenceSuggestion: `Plant shift ${recordedShiftRef} · ${recordedJobId}`,
      evidenceReferenceLocked: true,
      apply: async (record) => {
        await mutateProduction('production.output.recorded', record.commandId, productionActionProof(record), (current) => recordedOutputKind === 'scrap'
          ? recordProductionScrap(current, recordedJobId, recordedQuantity, recordedShiftRef, productionActionProof(record))
          : recordProductionOutput(current, recordedJobId, recordedQuantity, recordedShiftRef, productionActionProof(record)))
        emitMetric({ product: 'plant', capability: 'plant-production', action: 'output.recorded', ts: Date.now() })
        if (recordedOutputKind === 'good' && recordedShiftMaterialCount === 0) {
          setMaterialGuideOpen(true)
          focusMaterialDisclosure()
        }
      },
    })
  }

  function openJobOutput(job: ProductionJob, trigger: HTMLButtonElement | null = null) {
    outputTriggerRef.current = trigger
    setJobScanMiss('')
    setJobId(job.id)
    if (!managedIdentity && !shiftRef.trim()) {
      const suggestedShiftRef = shiftReferencePlaceholder()
      setShiftRef(suggestedShiftRef)
      setHandoffShiftRef(suggestedShiftRef)
    }
    setOutputOpen(true)
    requestAnimationFrame(() => {
      outputJobSelectRef.current?.scrollIntoView({ block: 'center' })
      outputJobSelectRef.current?.focus({ preventScroll: true })
    })
  }

  function openMaterialTrace(job: ProductionJob, trigger: HTMLButtonElement | null = null) {
    openJobOutput(job, trigger)
    setMaterialGuideOpen(true)
    focusMaterialDisclosure()
  }

  function focusMaterialDisclosure() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const disclosure = materialDisclosureRef.current
        if (!disclosure) return
        disclosure.scrollIntoView({ behavior: 'smooth', block: 'center' })
        materialRefInputRef.current?.focus({ preventScroll: true })
      })
    })
  }

  function openShiftCloseGuide() {
    const suggestedShiftRef = canonicalShiftRef || shiftReferencePlaceholder()
    setShiftRef(suggestedShiftRef)
    setHandoffShiftRef(suggestedShiftRef)
    setShiftCloseGuideOpen(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const disclosure = shiftCloseDisclosureRef.current
        if (!disclosure) return
        disclosure.scrollIntoView({ behavior: 'smooth', block: 'center' })
        disclosure.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
      })
    })
  }

  function closeJobOutput() {
    setOutputOpen(false)
    setMaterialGuideOpen(false)
    setJobScanMiss('')
    requestAnimationFrame(() => outputTriggerRef.current?.focus())
  }

  function handleOutputDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    // The camera scan dialog renders INSIDE this panel and opens with showModal(), so its
    // key events bubble here. They belong to that dialog, not to the panel: swallowing
    // Escape would preventDefault() the native close request and leave a modal open with
    // the camera still streaming, while `closeJobOutput()` hides the panel around it
    // (`visibility: hidden` is inherited, so the dialog and its backdrop go invisible too
    // and the effect cleanup that stops the MediaStream never runs). Tab is the same story
    // in reverse: while a modal is open the panel's own focus trap must not compete with
    // it. Anything raised from inside an open <dialog> in this panel is that dialog's.
    const eventTarget = event.target instanceof Element ? event.target : null
    const nestedDialog = eventTarget?.closest('dialog[open]') ?? null
    if (nestedDialog && outputPanelRef.current?.contains(nestedDialog)) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeJobOutput()
      return
    }
    if (event.key !== 'Tab' || !outputOpen) return
    const panel = outputPanelRef.current
    if (!panel) return
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) return
    const active = document.activeElement
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  function closeSelectedJobShort(trigger: HTMLButtonElement) {
    if (jobScanUnresolved) return setNotice(`No active job carries the scanned code ${jobScanMiss}. Choose the job or scan again before closing a job short.`)
    const recordedShiftRef = shiftRef.trim()
    if (!recordedShiftRef || recordedShiftRef.length > 80) return setNotice('Enter a shift reference of 1 to 80 characters before closing a job short.')
    if (!selectedJob) return setNotice('Choose an active job before reviewing a short close.')
    const recordedJobId = selectedJob.id
    const expectedRevision = production.revision
    const expectedGood = selectedJob.output
    const expectedScrap = selectedJob.scrap ?? 0
    const expectedRemaining = selectedJob.target - expectedGood - expectedScrap
    if (expectedRemaining < 1) return setNotice(`${recordedJobId} has no remaining units to close short.`)
    setShiftRef(recordedShiftRef)
    queueAction({
      kind: 'production_job_close',
      subjectId: recordedJobId,
      summary: `Close ${recordedJobId} short · ${recordedShiftRef}`,
      before: `${expectedGood.toLocaleString()} good · ${expectedScrap.toLocaleString()} scrap · ${expectedRemaining.toLocaleString()} remaining`,
      after: `Closed short · ${expectedRemaining.toLocaleString()} not produced · target and output unchanged${selectedJob.qualityHold ? ' · quality hold remains' : ''}`,
      apply: async (record) => {
        await mutateProduction('production.job.closed', record.commandId, productionActionProof(record), (current) => {
          const currentJob = current.jobs.find((candidate) => candidate.id === recordedJobId)
          if (current.revision !== expectedRevision
            || !currentJob
            || currentJob.closure
            || currentJob.output !== expectedGood
            || (currentJob.scrap ?? 0) !== expectedScrap
            || currentJob.target - currentJob.output - (currentJob.scrap ?? 0) !== expectedRemaining) return null
          return closeProductionJob(current, recordedJobId, recordedShiftRef, productionActionProof(record))
        })
      },
    }, trigger)
  }

  function recordMaterialUse(event: FormEvent) {
    event.preventDefault()
    const materialRef = materialDraft.materialRef.trim()
    const materialLot = materialDraft.materialLot.trim() || undefined
    const recordedShiftRef = shiftRef.trim()
    const recordedQuantity = parsedMaterialQuantity
    const materialUnit = materialDraft.materialUnit
    if (!selectedMaterialJob) return setNotice('Choose an active job before recording material use.')
    if (!materialRef || materialRef.length > 120) return setNotice('Enter a material reference of 1 to 120 characters.')
    if (materialLot && materialLot.length > 120) return setNotice('Enter a lot or batch reference of at most 120 characters.')
    if (!recordedShiftRef || recordedShiftRef.length > 80) return setNotice('Enter a shift reference of 1 to 80 characters.')
    if (!productionMaterialUnits.includes(materialUnit)) return setNotice('Choose a supported material unit.')
    if (recordedQuantity === null) return setNotice('Enter a positive material quantity with no more than three decimal places.')
    const recordedJobId = selectedMaterialJob.id
    const recordedProduct = selectedMaterialJob.product
    const held = Boolean(selectedMaterialJob.qualityHold)
    setHandoffShiftRef(recordedShiftRef)
    const lotSummary = materialLot ? ` · lot ${materialLot}` : ''
    queueAction({
      kind: 'production_material',
      subjectId: recordedJobId,
      summary: `Record ${recordedQuantity} ${materialUnit} ${materialRef}${lotSummary} for ${recordedJobId}`,
      before: `${recordedProduct} · no material-use event for this action${held ? ' · QUALITY HOLD remains active' : ''}`,
      after: `${recordedQuantity} ${materialUnit} ${materialRef}${lotSummary} · ${recordedShiftRef} · internal traceability only${held ? ' · QUALITY HOLD remains active' : ''}`,
      actorSuggestion: managedIdentity ? undefined : 'Plant operator',
      reasonSuggestion: `Material use reviewed for ${recordedJobId} during ${recordedShiftRef}.`,
      evidenceReferenceSuggestion: `Plant shift ${recordedShiftRef} · ${recordedJobId} · ${materialRef}${materialLot ? ` · ${materialLot}` : ''}`,
      apply: async (record) => {
        await mutateProduction('production.material.consumed', record.commandId, productionActionProof(record), (current) => recordProductionMaterialConsumption(
          current,
          recordedJobId,
          materialRef,
          materialLot,
          recordedQuantity,
          materialUnit,
          recordedShiftRef,
          productionActionProof(record),
        ))
        if (productionShiftOutput(production, recordedShiftRef).goodUnits > 0) recordBehaviorSignal(window.localStorage, {
          event: 'first_value_completed',
          product: 'production',
          route: productionLocation.pathname + productionLocation.search,
          detail: 'Recorded reviewed Plant output with same-shift material trace.',
        })
        setMaterialDraft((current) => ({ ...current, jobId: recordedJobId, materialRef: '', materialLot: '', quantity: '1' }))
        setMaterialGuideOpen(false)
        setOutputOpen(false)
      },
    }, outputTriggerRef.current)
  }

  function createJob(event: FormEvent) {
    event.preventDefault()
    const id = jobDraft.id.trim().toUpperCase()
    const line = jobDraft.line.trim()
    const product = jobDraft.product.trim()
    const owner = jobDraft.owner.trim()
    const jobTarget = Number(jobDraft.target)
    const dueAt = new Date(jobDraft.dueAt)
    if (selectedShopDemandDigest && !selectedShopDemand) {
      setNotice('Shop demand changed after selection. Choose the current signal again before review.')
      return
    }
    if (selectedShopDemand && (product !== selectedShopDemand.productName
      || jobTarget !== selectedShopDemand.recommendedBatchUnits
      || selectedShopDemand.existingActiveJobIds.length)) {
      setNotice('The Shop-bound product, quantity, or existing Plant coverage changed. Reopen the current demand signal.')
      return
    }
    if (!id || !line || !product || !owner || owner.length > 120 || !Number.isSafeInteger(jobTarget) || jobTarget < 1 || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= issueClock) {
      setNotice('Enter a unique job ID, line or team, product or batch, responsible owner, whole-number target, and future due time.')
      return
    }
    const canonicalDueAt = dueAt.toISOString()
    const demandSignal = selectedShopDemand
    const job: ProductionJob = {
      id,
      line,
      product,
      target: jobTarget,
      output: 0,
      owner,
      priority: jobDraft.priority,
      dueAt: canonicalDueAt,
      ...(demandSignal ? { shopDemandSource: productionShopDemandSource(demandSignal) } : {}),
    }
    queueAction({
      kind: 'production_job',
      subjectId: id,
      summary: `Create ${id} for ${product}`,
      before: demandSignal ? `Shop ${demandSignal.operatingContext.operatingUnitLocationId} · ${demandSignal.activeDemandUnits} active demand · ${demandSignal.replenishmentGapUnits} replenishment gap · ${demandSignal.sourceOrderIds.length || 'reorder'} source ${demandSignal.sourceOrderIds.length === 1 ? 'order' : 'orders'}` : 'No production job',
      after: `${line} · owner ${owner} · ${productionJobPriorityLabels[jobDraft.priority]} · due ${formatIssueDue(canonicalDueAt)} · target ${jobTarget.toLocaleString()}${demandSignal ? ' · governed Shop demand' : ''}`,
      apply: async (record) => {
        if (demandSignal && !await shopProductionDemandIsCurrent(demandSignal, relatedCommerceRef.current, productionRef.current.jobs)) {
          throw new PlantReviewRequiredError('Shop orders, stock, reorder level, or Plant coverage changed. Nothing was written; review the current demand again.')
        }
        const confirmedProof = productionActionProof(record)
        const boundProof = demandSignal ? { ...confirmedProof, evidenceReference: demandSignal.evidenceReference } : confirmedProof
        await mutateProduction('production.job.created', record.commandId, boundProof, (current) => {
          if (demandSignal && current.jobs.some((candidate) => !candidate.closure
            && !candidate.qualityHold
            && candidate.output + (candidate.scrap ?? 0) < candidate.target
            && (candidate.product.toLocaleLowerCase('en-US') === demandSignal.productName.toLocaleLowerCase('en-US')
              || candidate.product.toLocaleUpperCase('en-US') === demandSignal.sku.toLocaleUpperCase('en-US')))) return null
          return registerProductionJob(current, job, boundProof)
        })
        setJobId(id)
        setJobDraft({ id: '', line: '', product: '', target: '', owner: '', priority: 'normal', dueAt: defaultJobDueInput() })
        setSelectedShopDemandDigest('')
      },
    })
  }

  function selectShopDemand(signal: ShopProductionDemandSignal) {
    if (signal.existingActiveJobIds.length) {
      setJobId(signal.existingActiveJobIds[0])
      setNotice(`${signal.productName} is already covered by ${signal.existingActiveJobIds.join(', ')}.`)
      return
    }
    setSelectedShopDemandDigest(signal.sourceDigest)
    setJobDraft({
      id: signal.suggestedJobId,
      line: production.jobs[0]?.line ?? 'Line 01',
      product: signal.productName,
      target: String(signal.recommendedBatchUnits),
      owner: production.jobs.find((job) => job.owner)?.owner ?? managedIdentity?.email ?? '',
      priority: signal.activeDemandUnits ? 'urgent' : 'normal',
      dueAt: defaultJobDueInput(),
    })
    if (jobDisclosureRef.current) jobDisclosureRef.current.open = true
    requestAnimationFrame(() => jobDisclosureRef.current?.querySelector<HTMLInputElement>('input')?.focus())
    setNotice('Shop demand is bound to this draft. Review the owner, line, due time, and accountable action before creating the job.')
  }

  function buildPlantJobImportReview(csvText: string): PlantJobImportReview {
    const parsed = parsePlantJobImportCsv(csvText)
    if (parsed.length < 2) throw new Error('Upload the Plant job CSV header and at least one job row.')
    if (parsed.length - 1 > PLANT_JOB_IMPORT_MAX_ROWS) throw new Error(`Review at most ${PLANT_JOB_IMPORT_MAX_ROWS} Plant job rows at a time.`)
    const headers = parsed[0].map((header) => header.trim())
    const jobIdIndex = plantJobImportColumn(headers, ['jobid', 'job', 'id', 'workorder', 'order'])
    const lineIndex = plantJobImportColumn(headers, ['line', 'team', 'station', 'workcenter', 'workcentre'])
    const productIndex = plantJobImportColumn(headers, ['product', 'batch', 'sku', 'item'])
    const targetIndex = plantJobImportColumn(headers, ['target', 'units', 'quantity', 'qty'])
    const ownerIndex = plantJobImportColumn(headers, ['owner', 'responsible', 'supervisor', 'operator'])
    const priorityIndex = plantJobImportColumn(headers, ['priority', 'urgency'])
    const dueAtIndex = plantJobImportColumn(headers, ['dueat', 'duetime', 'due', 'deadline'])
    const missingColumns = ([
      ['job_id', jobIdIndex],
      ['line', lineIndex],
      ['product', productIndex],
      ['target', targetIndex],
      ['owner', ownerIndex],
      ['due_at', dueAtIndex],
    ] as Array<[string, number]>).filter(([, index]) => index < 0).map(([label]) => label)
    if (missingColumns.length) throw new Error(`Plant job CSV is missing ${missingColumns.join(', ')}.`)

    const existingIds = new Set(production.jobs.map((job) => job.id.toUpperCase()))
    const seenIds = new Set<string>()
    let readyRows = 0
    let blockedRows = 0
    let firstReady: PlantJobImportReview['firstReady']
    for (const cells of parsed.slice(1)) {
      const id = (cells[jobIdIndex] ?? '').trim().toUpperCase()
      const line = (cells[lineIndex] ?? '').trim()
      const product = (cells[productIndex] ?? '').trim()
      const target = (cells[targetIndex] ?? '').trim()
      const owner = (cells[ownerIndex] ?? '').trim()
      const dueAt = plantJobImportDate(cells[dueAtIndex] ?? '')
      const priorityRaw = (priorityIndex >= 0 ? cells[priorityIndex] ?? '' : '').toLowerCase()
      const priority: ProductionJobPriority = priorityRaw.includes('urgent') || priorityRaw.includes('high') || priorityRaw.includes('rush')
        ? 'urgent'
        : priorityRaw.includes('low')
          ? 'low'
          : 'normal'
      const targetNumber = Number(target)
      const dueDate = dueAt ? new Date(dueAt) : null
      const blocked = !id || !line || !product || !owner || owner.length > 120
        || !Number.isSafeInteger(targetNumber) || targetNumber < 1
        || !dueDate || Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()
        || existingIds.has(id) || seenIds.has(id)
      if (blocked) {
        blockedRows += 1
      } else {
        readyRows += 1
        seenIds.add(id)
        firstReady ??= { id, line, product, target: String(targetNumber), owner, priority, dueAt }
      }
    }
    const totalRows = readyRows + blockedRows
    return {
      status: readyRows > 0 && blockedRows === 0 ? 'ready' : 'blocked',
      totalRows,
      readyRows,
      blockedRows,
      firstReady,
      summary: firstReady
        ? `${readyRows} ready of ${totalRows}. First ready job ${firstReady.id} was copied into the review form.`
        : `${blockedRows} blocked of ${totalRows}. Fix IDs, line, product, target, owner, future due time, and duplicates.`,
    }
  }

  function buildSamplePlantJobImportCsv() {
    const rows = [
      ['job_id', 'line', 'product', 'target', 'owner', 'priority', 'due_at'],
      ['JOB-AI-101', 'Line A', 'First production run', 120, 'Plant supervisor', 'urgent', localDateTimeInputValue(new Date(Date.now() + 10 * 60 * 60 * 1000))],
      ['JOB-SAMPLE-102', 'Quality Lab', 'Quality release sample', 1, 'Quality owner', 'normal', localDateTimeInputValue(new Date(Date.now() + 12 * 60 * 60 * 1000))],
    ]
    return rows.map((row) => row.map(plantJobImportCsvCell).join(',')).join('\r\n')
  }

  function loadSamplePlantJobImportBatch() {
    if (pendingAction) {
      setNotice('Finish or cancel the pending Plant review before loading a sample job batch.')
      return
    }
    const review = buildPlantJobImportReview(buildSamplePlantJobImportCsv())
    setPlantJobImportReview(review)
    setPlantJobImportSourceName('sample-plant-job-batch.csv')
    if (review.firstReady) setJobDraft(review.firstReady)
    setNotice(review.firstReady
      ? 'Sample Plant job batch loaded and the first reviewed job was copied into the form. No production job, equipment command, material movement, accounting post, or managed write ran.'
      : 'Sample Plant job batch was reviewed locally but no row is ready. No production job, equipment command, material movement, accounting post, or managed write ran.')
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'production',
      route: productionLocation.pathname + productionLocation.search,
      detail: 'Load sample Plant job batch',
    })
  }

  async function uploadPlantJobCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (!file) return
    setPlantJobImportSourceName(file.name)
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setPlantJobImportReview(null)
      setNotice('Plant job upload rejected locally. Choose a CSV file. No production job, equipment command, material movement, accounting post, or managed write ran.')
      return
    }
    if (file.size > PLANT_JOB_IMPORT_MAX_BYTES) {
      setPlantJobImportReview(null)
      setNotice('Plant job CSV is too large. Upload at most 180 KB or split the file into 50-row batches. No production job, equipment command, material movement, accounting post, or managed write ran.')
      return
    }
    try {
      const text = await file.text()
      const review = buildPlantJobImportReview(text)
      setPlantJobImportReview(review)
      if (review.firstReady) setJobDraft(review.firstReady)
      setNotice(review.firstReady
        ? 'Uploaded Plant job CSV and prepared the first reviewed job locally. No production job, equipment command, material movement, accounting post, or managed write ran.'
        : 'Uploaded Plant job CSV was reviewed locally but no row is ready. No production job, equipment command, material movement, accounting post, or managed write ran.')
      recordBehaviorSignal(window.localStorage, {
        event: 'agent_job_chosen',
        product: 'production',
        route: productionLocation.pathname + productionLocation.search,
        detail: 'Upload Plant job CSV for local production review',
      })
    } catch (error) {
      setPlantJobImportReview(null)
      setNotice(error instanceof Error ? error.message : 'Uploaded Plant job CSV could not be reviewed locally.')
    }
  }

  function openJobSchedule(job: ProductionJob, trigger: HTMLButtonElement) {
    if (job.closure || job.output + (job.scrap ?? 0) >= job.target) return
    scheduleTriggerRef.current = trigger
    setScheduleDraft({
      jobId: job.id,
      owner: job.owner ?? '',
      priority: job.priority ?? 'normal',
      dueAt: job.dueAt ? localDateTimeInputValue(new Date(job.dueAt)) : defaultJobDueInput(),
    })
  }

  function closeJobSchedule() {
    setScheduleDraft(null)
    requestAnimationFrame(() => scheduleTriggerRef.current?.focus())
  }

  function reviewJobSchedule(event: FormEvent) {
    event.preventDefault()
    if (!scheduleDraft) return
    const job = production.jobs.find((candidate) => candidate.id === scheduleDraft.jobId)
    const dueAt = new Date(scheduleDraft.dueAt)
    const owner = scheduleDraft.owner.trim()
    if (!job || job.closure || job.output + (job.scrap ?? 0) >= job.target) {
      setNotice(`${scheduleDraft.jobId} is no longer active. Reload its current plan before review.`)
      return
    }
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      setNotice('Choose a future due time before reviewing the schedule.')
      return
    }
    if (!owner || owner.length > 120) {
      setNotice('Name one responsible owner of 1 to 120 characters before reviewing the plan.')
      return
    }
    const priority = scheduleDraft.priority
    const canonicalDueAt = dueAt.toISOString()
    if (job.priority === priority && job.dueAt === canonicalDueAt && job.owner === owner) {
      setNotice('Change the owner, priority, or due time before review.')
      return
    }
    const expectedRevision = production.revision
    const expectedPriority = job.priority
    const expectedDueAt = job.dueAt
    const expectedOwner = job.owner
    const beforeSchedule = expectedPriority && expectedDueAt
      ? `${productionJobPriorityLabels[expectedPriority]} · due ${formatIssueDue(expectedDueAt)}`
      : 'Schedule not recorded · legacy job'
    const beforeOwner = expectedOwner ? `owner ${expectedOwner}` : 'owner not recorded · legacy job'
    const queued = queueAction({
      kind: 'production_job_schedule',
      subjectId: job.id,
      summary: `Update ${job.id} plan`,
      before: `${beforeOwner} · ${beforeSchedule}`,
      after: `owner ${owner} · ${productionJobPriorityLabels[priority]} · due ${formatIssueDue(canonicalDueAt)} · target and output unchanged`,
      apply: async (record) => {
        await mutateProduction('production.job.schedule_updated', record.commandId, productionActionProof(record), (current) => {
          const currentJob = current.jobs.find((candidate) => candidate.id === job.id)
          if (current.revision !== expectedRevision
            || !currentJob
            || currentJob.priority !== expectedPriority
            || currentJob.dueAt !== expectedDueAt
            || currentJob.owner !== expectedOwner) return null
          return updateProductionJobPlan(current, job.id, priority, canonicalDueAt, owner, productionActionProof(record))
        })
      },
    }, scheduleTriggerRef.current)
    if (queued) setScheduleDraft(null)
  }

  function createIssue(event: FormEvent) {
    event.preventDefault()
    const createdAt = new Date()
    const dueAt = new Date(issueDueInput)
    const canonicalOwner = issueOwner.trim()
    const canonicalContainment = containment.trim()
    const canonicalSummary = summary.trim()
    const canonicalArea = area.trim()
    if (!canonicalArea || canonicalArea.length > 120 || !canonicalSummary || !canonicalOwner || !canonicalContainment || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= createdAt.getTime()) {
      setNotice('Add an area, an owner, a future due time, and the next containment action before review.')
      return
    }
    const issue: ProductionIssue = {
      id: uid('ISS'),
      createdAt: createdAt.toISOString(),
      area: canonicalArea,
      kind,
      summary: canonicalSummary,
      status: 'open',
      severity,
      owner: canonicalOwner,
      dueAt: dueAt.toISOString(),
      containment: canonicalContainment,
      ...(issueMaintenanceFindingSource ? { maintenanceFindingSource: issueMaintenanceFindingSource } : {}),
    }
    issueDialogRef.current?.close()
    setIssueDialogOpen(false)
    queueAction({
      kind: 'issue_create',
      subjectId: issue.id,
      summary: `Open ${productionIssueSeverityLabels[issue.severity ?? 'medium'].toLowerCase()} ${issue.kind} issue for ${issue.area}`,
      before: 'No issue record',
      after: `${issue.id} · ${issue.owner} · due ${formatIssueDue(issue.dueAt ?? issue.createdAt)} · containment recorded`,
      apply: async (record) => {
        await mutateProduction('production.issue.opened', record.commandId, productionActionProof(record), (current) => openProductionIssue(current, issue, productionActionProof(record)))
        if (issue.kind === 'quality') emitMetric({ product: 'plant', capability: 'plant-production', action: 'capa.opened', ts: Date.now() })
        setSummary('')
        setIssueOwner('')
        setContainment('')
        setSeverity('medium')
        setIssueDueInput(defaultIssueDueInput())
        setIssueMaintenanceFindingSource(null)
      },
    }, issueTriggerRef.current)
  }

  function startInspectionNcr() {
    setIssueMaintenanceFindingSource(null)
    setKind('quality')
    setArea('Quality')
    setSeverity('high')
    setIssueOwner(managedIdentity?.userId ?? 'Quality owner')
    setSummary('Inspection sample needs NCR review')
    setContainment('Hold affected output until sample evidence, root cause, and corrective action are reviewed.')
    setIssueDueInput(defaultIssueDueInput())
    setIssueDialogOpen(true)
  }

  function openManualIssueDialog() {
    setIssueMaintenanceFindingSource(null)
    setIssueDialogOpen(true)
  }

  function closeIssueDialog() {
    setIssueDialogOpen(false)
    setIssueMaintenanceFindingSource(null)
    requestAnimationFrame(() => issueTriggerRef.current?.focus())
  }

  function startMaintenanceFindingProblem(record: ProductionMaintenanceRecord) {
    const completionActionId = record.completion?.actionId
    const source = completionActionId ? productionMaintenanceFindingSource(production, completionActionId) : null
    if (!source) {
      setNotice('This maintenance result is already linked or no longer eligible for a problem review.')
      return
    }
    setIssueMaintenanceFindingSource(source)
    setKind('maintenance')
    setArea(source.equipmentName)
    setSeverity(source.returnToService === 'not_recommended' ? 'high' : 'medium')
    setIssueOwner(source.maintenanceOwner)
    setSummary(`Maintenance finding: ${source.findings}`.slice(0, 240).trim())
    setContainment(source.returnToService === 'not_recommended'
      ? 'Keep the asset out of service pending reviewed corrective action.'
      : 'Define restricted-service controls and corrective action before normal operation.')
    setIssueDueInput(defaultIssueDueInput())
    maintenanceDialogRef.current?.close()
    setMaintenanceDialogOpen(false)
    setMaintenanceCompletionDraft(null)
    setIssueDialogOpen(true)
  }

  function resolveIssue(issueId: string) {
    const issue = production.issues.find((candidate) => candidate.id === issueId)
    if (!issue || issue.status === 'resolved') return
    // Mirror the engine, which requires CAPA only for a fully specified quality
    // issue. Demanding it for an incomplete legacy record forces six fields to
    // dismiss a problem whose own owner, due time, and containment were never set.
    if (issue.kind === 'quality' && Boolean(issue.severity && issue.owner && issue.dueAt && issue.containment)) {
      setQualityCorrectiveDraft({
        issueId,
        failureMode: issue.summary,
        causeCategory: 'method',
        rootCause: '',
        correctiveAction: '',
        verificationResult: '',
        effectivenessOwner: issue.owner ?? managedIdentity?.userId ?? 'Quality owner',
        effectivenessDue: defaultCapaEffectivenessDueInput(),
      })
      return
    }
    if (issue.maintenanceFindingSource) {
      setMaintenanceCorrectiveDraft({
        issueId,
        correctiveAction: '',
        verificationResult: '',
        finalDisposition: issue.maintenanceFindingSource.returnToService,
      })
      return
    }
    queueIssueResolution(issue)
  }

  function reviewMaintenanceCorrectiveResolution(event: FormEvent) {
    event.preventDefault()
    if (!maintenanceCorrectiveDraft) return
    const issue = production.issues.find((candidate) => candidate.id === maintenanceCorrectiveDraft.issueId)
    const correctiveAction = maintenanceCorrectiveDraft.correctiveAction.trim()
    const verificationResult = maintenanceCorrectiveDraft.verificationResult.trim()
    if (!issue?.maintenanceFindingSource || !correctiveAction || !verificationResult) {
      setNotice('Record the corrective action and verification result before review.')
      return
    }
    const result: ProductionMaintenanceCorrectiveAction = {
      contract: 'supermega.production.maintenance-corrective-action.v1',
      correctiveAction,
      verificationResult,
      finalDisposition: maintenanceCorrectiveDraft.finalDisposition,
    }
    maintenanceCorrectiveDialogRef.current?.close()
    setMaintenanceCorrectiveDraft(null)
    queueIssueResolution(issue, result)
  }

  function reviewQualityCorrectiveResolution(event: FormEvent) {
    event.preventDefault()
    if (!qualityCorrectiveDraft) return
    const issue = production.issues.find((candidate) => candidate.id === qualityCorrectiveDraft.issueId)
    if (!issue || issue.kind !== 'quality' || issue.status !== 'open') {
      setNotice('This quality problem is no longer open for CAPA review.')
      return
    }
    const result = buildProductionQualityCorrectiveAction(production, issue.id, {
      failureMode: qualityCorrectiveDraft.failureMode.trim(),
      causeCategory: qualityCorrectiveDraft.causeCategory,
      rootCause: qualityCorrectiveDraft.rootCause.trim(),
      correctiveAction: qualityCorrectiveDraft.correctiveAction.trim(),
      verificationResult: qualityCorrectiveDraft.verificationResult.trim(),
      effectivenessOwner: qualityCorrectiveDraft.effectivenessOwner.trim(),
      effectivenessDue: new Date(qualityCorrectiveDraft.effectivenessDue).toISOString(),
    })
    if (!result) {
      setNotice('Record a stable failure mode, cause, corrective action, effectiveness evidence, and owner before review.')
      return
    }
    qualityCorrectiveDialogRef.current?.close()
    setQualityCorrectiveDraft(null)
    queueIssueResolution(issue, undefined, result)
  }

  function queueIssueResolution(issue: ProductionIssue, maintenanceCorrectiveAction?: ProductionMaintenanceCorrectiveAction, qualityCorrectiveAction?: ProductionQualityCorrectiveAction) {
    const issueId = issue.id
    queueAction({
      kind: 'issue_resolution',
      subjectId: issueId,
      summary: `Resolve ${issueId}`,
      before: issue.owner && issue.containment ? `${issue.status} · owner ${issue.owner} · containment: ${issue.containment}` : `${issue.status} · legacy issue without assigned owner`,
      after: qualityCorrectiveAction
        ? `resolved with effective CAPA · ${qualityCorrectiveAction.priorIssueIds.length ? `${qualityCorrectiveAction.priorIssueIds.length} prior matching problem${qualityCorrectiveAction.priorIssueIds.length === 1 ? '' : 's'} linked` : 'first classified occurrence'} · no inventory or customer action`
        : maintenanceCorrectiveAction
          ? `resolved with corrective action and ${maintenanceCorrectiveAction.finalDisposition.replaceAll('_', ' ')} disposition; machine status unchanged`
          : 'resolved with operator evidence',
      actorSuggestion: managedIdentity ? undefined : qualityCorrectiveAction?.effectivenessOwner || issue.owner || 'Plant supervisor',
      reasonSuggestion: qualityCorrectiveAction
        ? `CAPA evidence reviewed and effectiveness verified for ${issueId}.`
        : `Resolution evidence reviewed for ${issueId}.`,
      evidenceReferenceSuggestion: (qualityCorrectiveAction
        ? `CAPA ${issueId} · ${qualityCorrectiveAction.failureMode}`
        : `Plant issue ${issueId}`).slice(0, 180),
      apply: async (record) => {
        await mutateProduction('production.issue.resolved', record.commandId, productionActionProof(record), (current) => resolveProductionIssue(current, issueId, productionActionProof(record), maintenanceCorrectiveAction, qualityCorrectiveAction))
        if (qualityCorrectiveAction) emitMetric({ product: 'plant', capability: 'plant-production', action: 'capa.resolved', ts: Date.now() })
      },
    })
  }

  function placeQualityHold(event: FormEvent) {
    event.preventDefault()
    if (!selectedHoldJob) return setNotice('Choose an existing job or batch before reviewing a quality hold.')
    const heldJobId = selectedHoldJob.id
    const heldProduct = selectedHoldJob.product
    queueAction({
      kind: 'quality_hold',
      subjectId: heldJobId,
      summary: `Place quality hold on ${heldJobId}`,
      before: `${heldProduct} · no quality hold`,
      after: `${heldProduct} · held by the accountable operator with reason and evidence`,
      apply: async (record) => {
        await mutateProduction('production.quality_hold.placed', record.commandId, productionActionProof(record), (current) => placeProductionQualityHold(current, heldJobId, productionActionProof(record)))
        setHoldJobId('')
      },
    })
  }

  function releaseQualityHold(jobId: string, trigger: HTMLButtonElement) {
    const job = production.jobs.find((candidate) => candidate.id === jobId)
    if (!job?.qualityHold) return
    queueAction({
      kind: 'quality_release',
      subjectId: jobId,
      summary: `Release quality hold on ${jobId}`,
      before: `${job.product} · held by ${job.qualityHold.heldBy} · ${job.qualityHold.reason}`,
      after: `${job.product} · released by a named human with new evidence`,
      apply: async (record) => {
        await mutateProduction('production.quality_hold.released', record.commandId, productionActionProof(record), (current) => releaseProductionQualityHold(current, jobId, productionActionProof(record)))
        emitMetric({ product: 'plant', capability: 'plant-production', action: 'job.released', ts: Date.now() })
      },
    }, trigger)
  }

  function buildShiftHandoff(event: FormEvent) {
    event.preventDefault()
    const canonicalHandoffShiftRef = handoffShiftRef.trim() || shiftRef.trim()
    if (currentShiftClose?.shiftRef === canonicalHandoffShiftRef) return setNotice(`${canonicalHandoffShiftRef} is already closed by ${currentShiftClose.actor}. Record new Plant evidence before closing another shift packet.`)
    const draft = buildProductionShiftHandoff(production, canonicalHandoffShiftRef, plantOrderScope)
    if (!draft) return setNotice('Enter one named shift reference of at most 80 characters.')
    setHandoffShiftRef(canonicalHandoffShiftRef)
    setShiftHandoff(draft)
    const blockers = (draft.shiftOutput.goodUnits < 1 ? 1 : 0)
      + (draft.materialEntries.length < 1 ? 1 : 0)
      + draft.activeHolds.length
      + draft.openQualityIssues.length
      + draft.priorityProblems.length
      + draft.activeDowntime.length
      + draft.activeMaintenance.length
      + draft.controlledOrders.filter((order) => order.blockingReasons.length > 0).length
    setNotice(blockers
      ? `Shift packet prepared from Plant revision ${draft.sourceRevision} with ${blockers} close blocker${blockers === 1 ? '' : 's'}. No Plant record changed.`
      : `Shift packet prepared from Plant revision ${draft.sourceRevision}. It is ready for accountable owner close review.`)
  }

  function reviewShiftClose(trigger: HTMLButtonElement) {
    if (currentShiftClose) return setNotice(`${currentShiftClose.shiftRef} is already closed by ${currentShiftClose.actor}. Any later Plant event will require a new close packet.`)
    if (!shiftHandoff || !shiftHandoffIsCurrent) return setNotice('Build a current shift packet before owner close review.')
    if (!shiftCloseReady) return setNotice('Close blockers remain. Record good output and same-shift material trace, classify controlled work, then clear quality and WCM exceptions.')
    const reviewedHandoff = shiftHandoff
    const expectedRevision = production.revision
    queueAction({
      kind: 'production_shift_close',
      subjectId: reviewedHandoff.shiftRef,
      summary: `Close shift ${reviewedHandoff.shiftRef}`,
      before: `Revision ${reviewedHandoff.sourceRevision} | ${reviewedHandoff.shiftOutput.goodUnits} good | ${reviewedHandoff.materialEntries.length} material entries | ${reviewedHandoff.controlledOrders.length} controlled orders | quality clear | WCM clear`,
      after: 'Append one owner-attributed shift-close event bound to this exact Plant revision and evidence packet',
      actorSuggestion: managedIdentity ? undefined : 'Shift supervisor',
      reasonSuggestion: `Output, controlled orders, material trace, quality, and maintenance checks reviewed for ${reviewedHandoff.shiftRef}.`,
      evidenceReferenceSuggestion: `Shift close ${reviewedHandoff.shiftRef} · revision ${reviewedHandoff.sourceRevision}`,
      evidenceReferenceLocked: true,
      apply: async (record) => {
        await mutateProduction('production.shift.closed', record.commandId, productionActionProof(record), (current) => current.revision === expectedRevision
          ? recordProductionShiftClose(current, reviewedHandoff, productionActionProof(record))
          : null)
        emitMetric({ product: 'plant', capability: 'plant-production', action: 'shift.close.confirmed', ts: Date.now() })
      },
    }, trigger)
  }

  async function copyShiftHandoff() {
    if (!shiftHandoff || !shiftHandoffIsCurrent) return setNotice('Plant records or the shift reference changed. Prepare the shift close file again before copying it.')
    if (!navigator.clipboard?.writeText) return setNotice('Clipboard copy is unavailable in this browser. No Plant record changed.')
    try {
      await navigator.clipboard.writeText(formatProductionShiftHandoff(shiftHandoff))
      setNotice('Shift close file copied. No Plant record changed.')
    } catch {
      setNotice('Clipboard copy was not permitted. No Plant record changed.')
    }
  }

  async function copyClosedShiftHandoff() {
    if (!currentShiftCloseEvidence) return setNotice('The verified closed-shift evidence is unavailable.')
    if (!navigator.clipboard?.writeText) return setNotice('Clipboard copy is unavailable in this browser. No Plant record changed.')
    try {
      await navigator.clipboard.writeText(formatProductionShiftHandoff(currentShiftCloseEvidence.handoff))
      setNotice('Verified closed-shift evidence copied. No Plant record changed.')
    } catch {
      setNotice('Clipboard copy was not permitted. No Plant record changed.')
    }
  }

  function openMachineObservation(machineId: string, trigger: HTMLButtonElement) {
    const machine = production.machines.find((candidate) => candidate.id === machineId)
    if (!machine) return
    const firstAlternative = productionMachineStates.find((state) => state !== machine.state)
    if (!firstAlternative) return
    machineTriggerRef.current = trigger
    setMachineObservation({ machineId, toState: firstAlternative })
  }

  function closeMachineObservation() {
    setMachineObservation(null)
    requestAnimationFrame(() => machineTriggerRef.current?.focus())
  }

  function reviewMachineObservation(event: FormEvent) {
    event.preventDefault()
    if (!machineObservation) return
    const machine = production.machines.find((candidate) => candidate.id === machineObservation.machineId)
    if (!machine
      || machineObservation.toState === machine.state
      || !productionMachineStates.includes(machineObservation.toState)) {
      setNotice('Choose a different recorded status for an existing machine.')
      return
    }
    const expectedState = machine.state
    const observedState = machineObservation.toState
    const trigger = machineTriggerRef.current
    machineDialogRef.current?.close()
    setMachineObservation(null)
    queueAction({
      kind: 'machine_state',
      subjectId: machine.id,
      summary: `Record ${productionMachineStateLabels[observedState].toLowerCase()} for ${machine.name}`,
      before: `Recorded: ${productionMachineStateLabels[expectedState]}`,
      after: `Recorded: ${productionMachineStateLabels[observedState]}`,
      apply: async (record) => {
        await mutateProduction('production.machine_state.changed', record.commandId, productionActionProof(record), (current) => recordProductionMachineState(current, machine.id, expectedState, observedState, productionActionProof(record)))
      },
    }, trigger)
  }

  function reviewDowntimeStart(event: FormEvent) {
    event.preventDefault()
    if (!selectedDowntimeMachine) return setNotice('Choose one recorded machine without open downtime.')
    const machine = selectedDowntimeMachine
    downtimeDialogRef.current?.close()
    setDowntimeDialogOpen(false)
    queueAction({
      kind: 'downtime_start',
      subjectId: machine.id,
      summary: `Start downtime record for ${machine.name}`,
      before: `${machine.name} · no open downtime · machine status record unchanged by this action`,
      after: `${machine.name} · downtime open with human evidence · machine status record unchanged`,
      apply: async (record) => {
        await mutateProduction('production.downtime.started', record.commandId, productionActionProof(record), (current) => startProductionDowntime(current, machine.id, productionActionProof(record)))
        setDowntimeMachineId('')
      },
    }, downtimeTriggerRef.current)
  }

  function reviewDowntimeEnd(interval: ProductionDowntimeInterval) {
    const machine = production.machines.find((candidate) => candidate.id === interval.machineId)
    if (!machine || interval.end) return
    downtimeDialogRef.current?.close()
    setDowntimeDialogOpen(false)
    queueAction({
      kind: 'downtime_end',
      subjectId: machine.id,
      summary: `End downtime record for ${machine.name}`,
      before: `${machine.name} · downtime open since ${formatTime(interval.startedAt)} · machine status record unchanged by this action`,
      after: `${machine.name} · downtime closed with new human evidence · machine status record unchanged`,
      apply: async (record) => {
        await mutateProduction('production.downtime.ended', record.commandId, productionActionProof(record), (current) => endProductionDowntime(current, machine.id, interval.startActionId, productionActionProof(record)))
      },
    }, downtimeTriggerRef.current)
  }

  function closeDowntimeDialog() {
    setDowntimeDialogOpen(false)
    requestAnimationFrame(() => downtimeTriggerRef.current?.focus())
  }

  function reviewMaintenanceStart(event: FormEvent) {
    event.preventDefault()
    const owner = selectedMaintenanceOwner
    if (!selectedMaintenanceMachine || !owner || owner.length > 120) {
      setNotice('Choose one recorded machine and a named maintenance owner.')
      return
    }
    const machine = selectedMaintenanceMachine
    maintenanceDialogRef.current?.close()
    setMaintenanceDialogOpen(false)
    queueAction({
      kind: 'maintenance_start',
      subjectId: machine.id,
      summary: `Start maintenance for ${machine.name}`,
      before: `${machine.name} · no open maintenance work · machine status and downtime records unchanged`,
      after: selectedMaintenanceStrategy
        ? `${machine.name} · strategy R${selectedMaintenanceStrategy.revision} procedure bound to ${owner} with evidence · no equipment command`
        : `${machine.name} · maintenance owned by ${owner} with scope and evidence · no equipment command`,
      apply: async (record) => {
        await mutateProduction('production.maintenance.started', record.commandId, productionActionProof(record), (current) => startProductionMaintenance(current, machine.id, owner, productionActionProof(record)))
        setMaintenanceMachineId('')
        setMaintenanceOwner('')
      },
    }, maintenanceTriggerRef.current)
  }

  function beginMaintenanceCompletion(record: ProductionMaintenanceRecord) {
    if (record.completion) return
    if (!record.strategy) {
      queueMaintenanceCompletion(record)
      return
    }
    setMaintenanceCompletionDraft({
      startActionId: record.startActionId,
      outcome: 'completed',
      findings: '',
      procedureCompleted: false,
      returnToService: 'recommended',
    })
    requestAnimationFrame(() => maintenanceOutcomeRef.current?.focus())
  }

  function reviewMaintenanceCompletion(event: FormEvent) {
    event.preventDefault()
    if (!maintenanceCompletionDraft || !selectedMaintenanceCompletionRecord || !maintenanceCompletionIsValid) {
      setNotice('Confirm the procedure and record one valid maintenance result before review.')
      return
    }
    const result: ProductionMaintenanceResult = {
      outcome: maintenanceCompletionDraft.outcome,
      findings: maintenanceCompletionFindings,
      procedureCompleted: true,
      returnToService: maintenanceCompletionDraft.returnToService,
    }
    queueMaintenanceCompletion(selectedMaintenanceCompletionRecord, result)
  }

  function queueMaintenanceCompletion(record: ProductionMaintenanceRecord, result?: ProductionMaintenanceResult) {
    const machine = production.machines.find((candidate) => candidate.id === record.machineId)
    if (!machine || record.completion) return
    maintenanceDialogRef.current?.close()
    setMaintenanceDialogOpen(false)
    setMaintenanceCompletionDraft(null)
    queueAction({
      kind: 'maintenance_complete',
      subjectId: machine.id,
      summary: `Complete maintenance for ${machine.name}`,
      before: `${machine.name} · open maintenance owned by ${record.owner} since ${formatTime(record.startedAt)}`,
      after: record.strategy
        ? `${machine.name} · ${result?.outcome === 'completed_with_findings' ? 'completed with findings' : 'completed'} · ${result?.returnToService.replaceAll('_', ' ')} · next due advances · machine status unchanged`
        : `${machine.name} · maintenance completed with outcome and evidence · machine status and downtime records unchanged`,
      apply: async (action) => {
        await mutateProduction('production.maintenance.completed', action.commandId, productionActionProof(action), (current) => completeProductionMaintenance(current, machine.id, record.startActionId, productionActionProof(action), result))
      },
    }, maintenanceTriggerRef.current)
  }

  function closeMaintenanceDialog() {
    setMaintenanceDialogOpen(false)
    setMaintenanceCompletionDraft(null)
    requestAnimationFrame(() => maintenanceTriggerRef.current?.focus())
  }

  const actionControls = <>
    <AccountableActionGate authenticatedActor={managedIdentity ? { id: managedIdentity.userId, label: managedIdentity.email } : undefined} key={pendingAction?.id ?? 'production-idle'} action={pendingAction} onCancel={() => { setPendingAction(null); setNotice('Change cancelled. Plant data was not modified.') }} onConfirm={confirmAction} returnFocus={actionTrigger} />
    <ProductionEventHistory events={production.events} />
  </>
  function runPlantAutopilot(trigger: HTMLButtonElement) {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'production',
      route: productionLocation.pathname + productionLocation.search,
      detail: `Plant next step: ${plantTodayStep}`,
    })
    if (pendingAction) {
      setNotice('Finish or cancel the pending Plant review before starting another step.')
      return
    }
    if (!productionCanWrite) {
      navigate('/settings/#controls')
      return
    }
    if (plantTodayStep === 'problems') {
      if (tab !== 'control') {
        navigate('/plant/?tab=control')
        return
      }
      document.querySelector('.control-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (plantTodayStep === 'material' && activeJobs[0]) {
      if (tab !== 'production') {
        navigate('/plant/?tab=production&focus=material-use')
        return
      }
      openMaterialTrace(activeJobs[0], trigger)
      return
    }
    if (plantTodayStep === 'shift-close') {
      if (tab !== 'control') {
        navigate('/plant/?tab=control&focus=shift-close')
        return
      }
      openShiftCloseGuide()
      return
    }
    if (plantTodayStep === 'output' && activeJobs[0]) {
      if (tab !== 'production') {
        navigate('/plant/?tab=production')
        return
      }
      openJobOutput(activeJobs[0], trigger)
      return
    }
    if (tab !== 'production') {
      navigate('/plant/?tab=production')
      return
    }
    if (jobDisclosureRef.current) {
      jobDisclosureRef.current.open = true
      jobDisclosureRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      requestAnimationFrame(() => jobDisclosureRef.current?.querySelector<HTMLInputElement>('input')?.focus())
    }
  }
  const plantToday = <section aria-labelledby="plant-today-title" className="plant-today" data-state={plantTodayState} data-step={plantTodayStep}>
    <div className="plant-today-priority"><span className="core-eyebrow">Start here</span><h2 id="plant-today-title">{plantTodayHeadline}</h2><p>{plantTodayReason}</p><div className="plant-pack-context"><strong>{loadedPlantSamplePack?.name ?? activePlantIndustryPack.name} working sample</strong><span>{plantSampleWorkflow}. {plantSampleContext}</span></div><button className="core-button primary" onClick={(event) => runPlantAutopilot(event.currentTarget)} type="button">{plantTodayAction}</button></div>
    <div aria-label="Plant today status" className="plant-today-metrics" role="group">{plantTodayMetrics.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
    <div className="plant-today-source" role={productionCanWrite ? 'status' : 'alert'}><span>{plantTodaySource}</span><small>{plantTodayNotice}</small></div>
  </section>
  const plantControl = <section aria-label="Plant control" className="plant-control">
    <div><span className="core-eyebrow">Plant control</span><strong>{plantControlNext}</strong><small>{plantControlBoundary}</small></div>
    <div className="plant-control-rows">{plantControlRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const mesDispatch = <section aria-label="Plant dispatch helper" className="plant-control mes-dispatch-control">
    <div><span className="core-eyebrow">Daily dispatch</span><strong>{plantAgentJob}</strong><small>SuperMega shows the next station, blocker, evidence need, and shift route from live Plant state. The manager reviews equipment and production changes before anything is saved.</small></div>
    <div className="plant-control-rows">{mesDispatchRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantLifecycle = <section aria-label="Plant lifecycle control" className="plant-control">
    <div><span className="core-eyebrow">Production lifecycle</span><strong>Plan to shift close</strong><small>Follow planning, output, quality, maintenance, material trace, and shift close in one place. No equipment or production write runs without manager review.</small></div>
    <div className="plant-control-rows">{plantLifecycleRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantMrp = <section aria-label="Plant material readiness" className="plant-control">
    <div><span className="core-eyebrow">Material readiness</span><strong>{plantMrpNext}</strong><small>Review job demand, BOM, availability, Shop supply, material blockers, and trace evidence. No purchase, issue, costing, inventory, or production write runs from this panel.</small></div>
    <div className="plant-control-rows">{plantMrpRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantCostReadiness = <section aria-label="Plant cost readiness" className="plant-control">
    <div><span className="core-eyebrow">Cost readiness</span><strong>{plantCostReadinessNext}</strong><small>Check good output, waste, material trace, quality release, maintenance closure, and shift close before any costing package is reviewed. No costing, accounting, inventory, payroll, invoice, or production write runs from this panel.</small></div>
    <div className="plant-control-rows">{plantCostReadinessRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantCostPacket = <section aria-label="Plant cost review file" className="plant-control">
    <div><span className="core-eyebrow">Cost review file</span><strong>{plantCostPacketReady ? 'Ready for cost review' : plantCostReadinessNext}</strong><small>Package finished batch output, waste, material trace, quality release state, maintenance closure, and shift evidence for cost review. No standard cost update, inventory valuation, journal, payroll, invoice, certificate, or production write runs from this packet.</small></div>
    <div className="plant-control-rows">{plantCostPacketRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantQualityRelease = <section aria-label="Plant quality release" className="plant-control">
    <div><span className="core-eyebrow">Quality release</span><strong>{plantQualityReleaseNext}</strong><small>Check quality holds, maintenance closure, material trace, shift close, and manager release evidence before output can be treated as ready. No quality release, certificate, equipment command, material issue, costing, inventory, or production write runs from this panel.</small></div>
    <div className="plant-control-rows">{plantQualityReleaseRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantInspectionControl = <section aria-label="Plant inspection and CAPA" className="plant-control">
    <div><span className="core-eyebrow">Inspection + CAPA</span><strong>{plantInspectionNext}</strong><small>Keep sampling, NCR containment, corrective action, evidence, and release review in one quality queue. No certificate, CAPA closure, customer claim, inventory block, costing, or production write runs from this panel.</small>{tab === 'control' ? <button className="text-link" disabled={!productionCanWrite || Boolean(pendingAction)} onClick={startInspectionNcr} type="button">Start inspection NCR</button> : <Link className="text-link" to="/plant/?tab=control">Open inspection queue</Link>}</div>
    <div className="plant-control-rows">{plantInspectionRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantComplianceDossier = <section aria-label="Plant compliance dossier" className="plant-control plant-compliance-dossier">
    <div><span className="core-eyebrow">Compliance file</span><strong>{plantComplianceDossierNext}</strong><small>Summarize quality release, maintenance closure, material traceability, output evidence, shift close, and cost-readiness into one audit packet. No certificate, quality release, costing, inventory valuation, equipment command, customer claim, or production write runs from this file.</small></div>
    <div className="plant-control-rows">{plantComplianceDossierRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
  </section>
  const plantJobRepairRows = plantJobImportReview
    ? [
        ['Ready rows', `${plantJobImportReview.readyRows}`],
        ['Blocked rows', `${plantJobImportReview.blockedRows}`],
        ['Next fix', plantJobImportReview.status === 'ready' ? 'Review copied job' : 'Fix ID, line, product, target, owner, due time, duplicates'],
      ] as const
    : [
        ['Step 1', 'Load sample or upload CSV'],
        ['Step 2', 'Checks job fields locally'],
        ['Step 3', 'Review one copied job'],
      ] as const
  const plantBusinessControls = <details className="product-guidance-disclosure plant-business-controls">
    <summary><span>Advanced Plant controls</span><small>Planning, MRP, quality, maintenance, traceability, compliance, and costing</small></summary>
    <div className="product-guidance-content">
      {mesDispatch}
      {plantControl}
      {plantLifecycle}
      {plantMrp}
      {plantCostReadiness}
      {plantCostPacket}
      {plantQualityRelease}
      {plantInspectionControl}
      {plantComplianceDossier}
    </div>
  </details>
  const plantControlBusinessControls = plantBusinessControls

  if (tab === 'production') return <div className="operation-module production-operation-module">
    {plantToday}
    <div className="split-workspace production-view">
      <section className="core-panel job-panel">
        <div className="panel-head"><div><span className="core-eyebrow">Plant plan</span><h2>Jobs to finish</h2></div><span className="panel-note">{activeJobs.length} active · {completedJobs.length} finished</span></div>
        <div aria-label="Jobs view" className="plant-job-view-toggle" role="group">
          <button aria-pressed={plantJobView === 'list'} onClick={() => setPlantJobView('list')} type="button">List</button>
          <button aria-pressed={plantJobView === 'board'} onClick={() => setPlantJobView('board')} type="button">Board</button>
        </div>
        {plantJobView === 'board'
          ? <PlantJobBoard disabled={!productionCanWrite || Boolean(pendingAction)} jobs={activeJobs} now={issueClock} onOutput={openJobOutput} onSchedule={openJobSchedule} />
          : <JobList disabled={!productionCanWrite || Boolean(pendingAction)} jobs={activeJobs} now={issueClock} onOutput={openJobOutput} onSchedule={openJobSchedule} />}
        {nextShopDemand ? <section aria-label={nextShopDemand.sourceOrderIds.length ? 'Shop demand to Plant' : 'Stock replenishment to Plant'} className="stock-receipt-preview" data-demand-kind={nextShopDemand.sourceOrderIds.length ? 'orders' : 'replenishment'} data-selected={selectedShopDemand?.sourceDigest === nextShopDemand.sourceDigest ? 'true' : 'false'}><small>{nextShopDemand.sourceOrderIds.length ? 'Shop demand' : 'Stock replenishment'} · {nextShopDemand.operatingContext.operatingUnitLocationId}</small><strong>{nextShopDemand.productName} · {nextShopDemand.recommendedBatchUnits.toLocaleString()} suggested</strong><span>{nextShopDemand.activeDemandUnits.toLocaleString()} active order units · {nextShopDemand.availableToPromiseUnits.toLocaleString()} available · {nextShopDemand.replenishmentGapUnits.toLocaleString()} below reorder · {nextShopDemand.sourceOrderIds.length || 'no'} source {nextShopDemand.sourceOrderIds.length === 1 ? 'order' : 'orders'}</span>{nextShopDemand.existingActiveJobIds.length ? <button className="core-button compact" disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => selectShopDemand(nextShopDemand)} type="button">Open {nextShopDemand.existingActiveJobIds[0]}</button> : <button aria-pressed={selectedShopDemand?.sourceDigest === nextShopDemand.sourceDigest} className="core-button primary compact" disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => selectShopDemand(nextShopDemand)} type="button">{selectedShopDemand?.sourceDigest === nextShopDemand.sourceDigest ? nextShopDemand.sourceOrderIds.length ? 'Shop demand selected' : 'Replenishment selected' : nextShopDemand.sourceOrderIds.length ? 'Use Shop demand' : 'Plan replenishment'}</button>}</section> : shopDemandIssue ? <p className="form-notice" role="alert">{shopDemandIssue}</p> : null}
        <CompletedJobHistory jobs={completedJobs} now={issueClock} />
        <details className="compact-disclosure catalog-disclosure" ref={jobDisclosureRef}>
          <summary>{selectedShopDemand ? 'Add Shop-demand job' : 'Add job'}</summary>
          <section aria-label="Plant job CSV import" className="plant-job-import">
            <div><span className="core-eyebrow">Job CSV import</span><strong>Upload job list</strong><small>Check job ID, line, product, target, owner, priority, due time, and duplicates before copying one ready job into review. No production job, equipment command, material movement, accounting post, or managed write runs from this importer.</small></div>
            <div className="plant-job-import-actions">
              <button className="core-button" disabled={Boolean(pendingAction)} onClick={loadSamplePlantJobImportBatch} type="button">Load sample job batch</button>
              <label className="plant-job-import-upload">Upload Plant job CSV<input accept=".csv,text/csv" disabled={Boolean(pendingAction)} onChange={uploadPlantJobCsv} type="file" /></label>
              <div aria-label="Plant job repair checklist" className="plant-job-import-repair">{plantJobRepairRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
              {plantJobImportReview ? <div className={`plant-job-import-review ${plantJobImportReview.status}`} role="status"><strong>{plantJobImportReview.status === 'ready' ? 'Ready for review' : 'Repair before Plant review'}</strong><span>{plantJobImportReview.summary}</span><small>{plantJobImportReview.readyRows} ready / {plantJobImportReview.blockedRows} blocked / no Plant write</small></div> : null}
              {plantJobImportSourceName ? <p className="plant-job-import-source">Local file: {plantJobImportSourceName}</p> : null}
            </div>
          </section>
          <form className="core-form compact-form" onSubmit={createJob}>
            <div className="form-row"><label>Job ID<input disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={80} onChange={(event) => setJobDraft((current) => ({ ...current, id: event.target.value }))} placeholder="JOB-002" required value={jobDraft.id} /></label><label>Line or team<input disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setJobDraft((current) => ({ ...current, line: event.target.value }))} placeholder="Line 02" required value={jobDraft.line} /></label></div>
            <div className="form-row"><label>Product or batch<input disabled={!productionCanWrite || Boolean(pendingAction) || Boolean(selectedShopDemand)} maxLength={180} onChange={(event) => setJobDraft((current) => ({ ...current, product: event.target.value }))} placeholder="Product name" required value={jobDraft.product} /></label><label>Target units<input disabled={!productionCanWrite || Boolean(pendingAction) || Boolean(selectedShopDemand)} min="1" onChange={(event) => setJobDraft((current) => ({ ...current, target: event.target.value }))} required step="1" type="number" value={jobDraft.target} /></label></div>
            <div className="form-row"><label>Priority<select disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setJobDraft((current) => ({ ...current, priority: event.target.value as ProductionJobPriority }))} value={jobDraft.priority}>{productionJobPriorities.map((priority) => <option key={priority} value={priority}>{productionJobPriorityLabels[priority]}</option>)}</select></label><label>Due time<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} min={localDateTimeInputValue(new Date())} onChange={(event) => setJobDraft((current) => ({ ...current, dueAt: event.target.value }))} required type="datetime-local" value={jobDraft.dueAt} /></label></div>
            <label>Responsible owner<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setJobDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="Named person or role" required value={jobDraft.owner} /></label>
            {selectedShopDemand ? <div className="form-notice" role="status"><strong>Governed Shop source.</strong> {selectedShopDemand.evidenceReference} · {selectedShopDemand.sourceOrderIds.join(', ') || 'reorder threshold'}<button className="text-link" disabled={Boolean(pendingAction)} onClick={() => setSelectedShopDemandDigest('')} type="button">Remove source</button></div> : null}
            <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction)} type="submit">Review job</button>
            <p className="panel-copy">Owner, priority, and due time make responsibility and run order visible. The accountable operator, reason, and source record are confirmed in the next step.</p>
          </form>
        </details>
      </section>
      <button aria-label="Close job output" className={`plant-output-backdrop${outputOpen ? ' is-open' : ''}`} onClick={closeJobOutput} type="button" />
      <section aria-labelledby="plant-output-title" aria-modal={outputOpen} className={`core-panel output-panel${outputOpen ? ' is-open' : ''}`} id="plant-output-panel" onKeyDown={handleOutputDialogKeyDown} ref={outputPanelRef} role="dialog">
        <div className="plant-output-head"><div><span className="core-eyebrow">{materialGuideOpen ? 'Materials used' : 'Job output'}</span><h2 id="plant-output-title">{materialGuideOpen ? 'Record materials used' : 'Record good or scrap'}</h2></div><button aria-label="Close Plant action" className="plant-output-close" onClick={closeJobOutput} type="button">Close</button></div>
        {!materialGuideOpen ? <form autoComplete="off" className="core-form compact-form" id="plant-output-form" onSubmit={recordOutput}>
          <label>Job<span className="sku-scan-row"><select disabled={!productionCanWrite || Boolean(pendingAction) || !activeJobs.length} ref={outputJobSelectRef} value={selectedJobId} onChange={(event) => { setJobScanMiss(''); setJobId(event.target.value) }}>{activeJobs.length ? activeJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {job.line} · {(job.target - job.output - (job.scrap ?? 0)).toLocaleString()} left{job.qualityHold ? ' · QUALITY HOLD' : ''}</option>) : <option value="">No active jobs</option>}</select><BarcodeScanButton disabled={!productionCanWrite || Boolean(pendingAction) || !activeJobs.length} label="Scan the job card to choose this job" onDetected={selectScannedJob} /></span></label>
          {jobScanMiss ? <p className="form-notice plant-job-scan-miss" role="alert">Scanned {jobScanMiss} · no active job carries this code. {selectedJob ? `${selectedJob.id} is still selected and both review actions are blocked` : 'Both review actions are blocked'} until you choose the job in the list or scan the job card again.</p> : null}
          <label>Result<select disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob} value={outputKind} onChange={(event) => setOutputKind(event.target.value as ProductionOutputKind)}><option value="good">Good output</option><option value="scrap">Scrap</option></select></label>
          <div className="form-row"><label>Shift reference<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob} maxLength={80} name="plant-output-shift-reference" placeholder={`e.g. ${shiftReferencePlaceholder()}`} required value={shiftRef} onChange={(event) => setShiftRef(event.target.value)} /></label><label>{outputKind === 'scrap' ? 'Scrap units' : 'Good units'}<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob} max={selectedRemaining} min="1" name="plant-output-quantity" step="1" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label></div>
          {selectedJob?.qualityHold ? <p className="form-notice" role="alert">QUALITY HOLD · Held by {selectedJob.qualityHold.heldBy}. Recording a result does not release this hold; verify the hold and evidence before review.</p> : null}
          <p className="form-notice" role="status">{canonicalShiftRef && canonicalShiftRef.length <= 80 ? `This shift: ${currentShiftOutput.goodUnits.toLocaleString()} good · ${currentShiftOutput.scrapUnits.toLocaleString()} scrap across ${currentShiftOutput.entryCount} ${currentShiftOutput.entryCount === 1 ? 'entry' : 'entries'}.` : 'Enter the shift name or date to continue.'}</p>
          <div className="form-actions">
            <button className="core-button primary" disabled={jobScanUnresolved || !productionCanWrite || Boolean(pendingAction) || !selectedJob || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > selectedRemaining || selectedRemaining < 1 || !canonicalShiftRef || canonicalShiftRef.length > 80} type="submit">Review {outputKind === 'scrap' ? 'scrap' : 'good output'}</button>
            <button aria-describedby="plant-short-close-boundary" className="core-button" disabled={jobScanUnresolved || !productionCanWrite || Boolean(pendingAction) || !selectedJob || selectedRemaining < 1 || !canonicalShiftRef || canonicalShiftRef.length > 80} onClick={(event) => closeSelectedJobShort(event.currentTarget)} type="button">Review short close</button>
          </div>
          <p className="panel-copy" id="plant-short-close-boundary">{selectedJob ? `${selectedJob.id} · ${selectedJob.product} · ${selectedJob.line} · ${selectedJob.output.toLocaleString()} good · ${(selectedJob.scrap ?? 0).toLocaleString()} scrap · ${selectedRemaining.toLocaleString()} left.` : 'Add or choose an active job.'} Results are append-only. Short close ends the selected job without changing its target, output, hold, inventory, costing, or accounting.</p>
        </form> : null}
        <details className="compact-disclosure production-history" onToggle={(event) => { setJobScanMiss(''); setMaterialGuideOpen(event.currentTarget.open) }} open={materialGuideOpen} ref={materialDisclosureRef}>
          <summary>Materials used <span>{materialEntries.length}</span></summary>
          <form autoComplete="off" className="core-form compact-form" onSubmit={recordMaterialUse}>
            <label>Job<select disabled={!productionCanWrite || Boolean(pendingAction) || !activeJobs.length} onChange={(event) => setMaterialDraft((current) => ({ ...current, jobId: event.target.value }))} value={materialDraft.jobId}>
              {!materialDraft.jobId ? <option value="">Choose an active job</option> : null}
              {materialJobIsStale ? <option disabled value={materialDraft.jobId}>{materialDraft.jobId} · no longer active</option> : null}
              {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {job.line}{job.qualityHold ? ' · QUALITY HOLD' : ''}</option>)}
            </select></label>
            {materialJobIsStale ? <p className="form-notice" role="alert">The selected job {materialDraft.jobId} is no longer active. Your draft is preserved; choose another job before review.</p> : null}
            <label>Material used<span className="sku-scan-row"><input disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} maxLength={120} onChange={(event) => setMaterialDraft((current) => ({ ...current, materialRef: event.target.value }))} placeholder="e.g. Resin A or RM-001" ref={materialRefInputRef} required value={materialDraft.materialRef} /><BarcodeScanButton disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} label="Scan the material label into the material field" onDetected={applyScannedMaterialRef} /></span></label>
            <label>Lot or batch (optional)<input disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} maxLength={120} onChange={(event) => setMaterialDraft((current) => ({ ...current, materialLot: event.target.value }))} placeholder="LOT-24" value={materialDraft.materialLot} /></label>
            <div className="form-row">
              <label>Quantity<input aria-describedby={materialQuantityError ? 'plant-material-quantity-error' : undefined} aria-invalid={materialQuantityError ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} min="0.001" onChange={(event) => setMaterialDraft((current) => ({ ...current, quantity: event.target.value }))} required step="0.001" type="number" value={materialDraft.quantity} /></label>
              <label>Unit<select disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} onChange={(event) => setMaterialDraft((current) => ({ ...current, materialUnit: event.target.value as ProductionMaterialUnit }))} value={materialDraft.materialUnit}>{productionMaterialUnits.map((unit) => <option key={unit} value={unit}>{productionMaterialUnitLabels[unit]}</option>)}</select></label>
            </div>
            {materialQuantityError ? <p className="form-notice" id="plant-material-quantity-error" role="alert">{materialQuantityError}</p> : null}
            <label>Shift reference<input disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} maxLength={80} onChange={(event) => setShiftRef(event.target.value)} placeholder={shiftReferencePlaceholder()} required value={shiftRef} /></label>
            {selectedMaterialJob?.qualityHold ? <p className="form-notice" role="alert">QUALITY HOLD · This records observed material use only. It does not release the hold.</p> : null}
            {!managedIdentity ? <button className="text-link" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} onClick={() => {
              const sampleShiftRef = shiftRef.trim() || shiftReferencePlaceholder()
              setShiftRef(sampleShiftRef)
              setHandoffShiftRef(sampleShiftRef)
              setMaterialDraft((current) => ({ ...current, materialRef: 'RM-SAMPLE-01', materialLot: 'LOT-SAMPLE-01', quantity: '1', materialUnit: 'pcs' }))
              setNotice('Sample material details filled locally. Review and confirm them before any Plant record changes.')
            }} type="button">Use sample material</button> : null}
            <button className="core-button primary" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob || !materialDraft.materialRef.trim() || materialDraft.materialRef.trim().length > 120 || materialDraft.materialLot.trim().length > 120 || !shiftRef.trim() || shiftRef.trim().length > 80 || parsedMaterialQuantity === null} type="submit">Review material record</button>
            <p className="panel-copy">Records one material and quantity against this job. Stock, purchasing, costing, accounting, and equipment stay unchanged.</p>
          </form>
          {recentMaterialEntries.length ? <div className="issue-list">{recentMaterialEntries.map((entry) => <article key={entry.actionId}>
            <span aria-hidden="true" className="issue-mark resolved">M</span>
            <div><strong>{entry.quantity?.toLocaleString(undefined, { maximumFractionDigits: 3 })} {entry.materialUnit} · {entry.materialRef}{entry.materialLot ? ` · lot ${entry.materialLot}` : ''}</strong><small style={wrappedIssueDetail}>{entry.subjectId} · {entry.shiftRef} · {formatIssueDue(entry.createdAt)} · {entry.actor}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
          </article>)}</div> : <Empty>No materials are recorded for this shift yet.</Empty>}
          {materialEntries.length > recentMaterialEntries.length ? <p className="panel-copy">Showing the latest {recentMaterialEntries.length} material entries. The complete attributed record remains in Plant record.</p> : null}
        </details>
      </section>
    </div>
    <details className="plant-batch-disclosure" onToggle={(event) => setPlantBatchOpen(event.currentTarget.open)} open={plantBatchOpen}>
      <summary><span>Controlled batch execution</span><small>BOM, routing, material, quality, and release</small></summary>
      <div className="plant-batch-content">
        {plantBatchOpen ? <Suspense fallback={<p className="form-notice" role="status">Loading batch execution…</p>}><PlantOrderFoundation actor={managedIdentity?.userId ?? 'Local Plant supervisor'} commerceState={relatedCommerce} disabled={!productionCanWrite || Boolean(pendingAction)} industryPackId={plantIndustryPackId} jobs={production.jobs} key={`plant-order:${plantOrderScopeWorkspaceId}:${plantIndustryPackId}`} onProductionCommand={mutateProduction} productionState={production} scope={plantOrderScope} /></Suspense> : null}
      </div>
    </details>
    {plantBusinessControls}
    <dialog aria-labelledby="job-schedule-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeJobSchedule() }} ref={scheduleDialogRef}>
      {scheduleDraft ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Plant plan</span><h2 id="job-schedule-title">Change {scheduleDraft.jobId} plan</h2></div><button aria-label="Close job schedule" className="text-link" onClick={closeJobSchedule} type="button">Close</button></div>
        <form autoComplete="off" className="core-form" onSubmit={reviewJobSchedule}>
          <div className="form-row"><label>Priority<select disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setScheduleDraft((current) => current ? { ...current, priority: event.target.value as ProductionJobPriority } : current)} value={scheduleDraft.priority}>{productionJobPriorities.map((priority) => <option key={priority} value={priority}>{productionJobPriorityLabels[priority]}</option>)}</select></label><label>Due time<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} min={localDateTimeInputValue(new Date())} onChange={(event) => setScheduleDraft((current) => current ? { ...current, dueAt: event.target.value } : current)} required type="datetime-local" value={scheduleDraft.dueAt} /></label></div>
          <label>Responsible owner<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setScheduleDraft((current) => current ? { ...current, owner: event.target.value } : current)} placeholder="Named person or role" required value={scheduleDraft.owner} /></label>
          <p className="panel-copy">This records responsibility and run order only. It grants no access, assigns no machine, and dispatches no work. Target, output, quality hold, materials, and accounting stay unchanged.</p>
          <p className="panel-copy">Nothing changes until the accountable operator confirms a reason and evidence.</p>
          <div className="form-actions"><button className="core-button" onClick={closeJobSchedule} type="button">Cancel</button><button className="core-button primary" disabled={!productionCanWrite || Boolean(pendingAction)} type="submit">Review plan</button></div>
        </form>
      </> : null}
    </dialog>
    {actionControls}
  </div>

  if (tab === 'control') return <div className="operation-module production-operation-module">
    {plantToday}
    {plantControlBusinessControls}
    <div className="control-workspace">
      <div className="split-workspace">
        <section className="core-panel production-issue-launcher">
          <div className="panel-head"><div><span className="core-eyebrow">Shift review</span><h2>Open problems</h2></div><span className="panel-note">{urgentIssueCount ? `${urgentIssueCount} urgent · ` : ''}{openIssues.length} open</span></div>
          <IssueList disabled={!productionCanWrite || Boolean(pendingAction)} issues={openIssues} now={issueClock} onResolve={resolveIssue} />
          <ResolvedIssueHistory issues={resolvedIssues} now={issueClock} />
          <button className="core-button primary" disabled={!productionCanWrite || Boolean(pendingAction)} onClick={openManualIssueDialog} ref={issueTriggerRef} type="button">Record problem</button>
          <details className="compact-disclosure production-history" open={heldJobs.length ? true : undefined}>
            <summary>Quality holds <span>{heldJobs.length}</span></summary>
            <QualityHoldList disabled={!productionCanWrite || Boolean(pendingAction)} jobs={heldJobs} onRelease={releaseQualityHold} />
            {holdableJobs.length ? <form autoComplete="off" className="core-form compact-form" onSubmit={placeQualityHold}>
              <label>Job or batch<select disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setHoldJobId(event.target.value)} value={selectedHoldJobId}>{holdableJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {job.line}</option>)}</select></label>
              <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedHoldJob} type="submit">Review hold</button>
              <p className="panel-copy">The next review records who placed the hold, why, and the source evidence. It does not change output or control equipment.</p>
            </form> : <p className="panel-copy">Every recorded job is currently held. Release one with evidence before placing another hold.</p>}
          </details>
          <details className="compact-disclosure production-history" data-plant-genealogy="versioned">
            <summary>Batch trace <span>{batchGenealogyDownload ? 'Ready' : 'None'}</span></summary>
            {production.jobs.length ? <div className="core-form compact-form">
              <label>Job or batch<select onChange={(event) => setGenealogyJobId(event.target.value)} value={selectedGenealogyJobId}>{production.jobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product}</option>)}</select></label>
              {batchGenealogyDownload ? <>
                <p className="panel-copy"><strong>{batchGenealogyDownload.report.job.product}</strong> · {batchGenealogyDownload.report.job.goodUnits.toLocaleString()} good · {batchGenealogyDownload.report.job.scrapUnits.toLocaleString()} scrap · {batchGenealogyDownload.report.materialEntries.length} material records · {batchGenealogyDownload.report.qualityEvents.length} quality events.</p>
                <p className="panel-copy">{batchGenealogyDownload.report.shopDemandSource ? `${batchGenealogyDownload.report.shopDemandSource.snapshot.sourceOrderIds.length || 'Reorder'} Shop source ${batchGenealogyDownload.report.shopDemandSource.snapshot.sourceOrderIds.length === 1 ? 'order' : 'orders'} retained without customer details.` : 'No retained Shop-demand source exists for this legacy or manual job.'}</p>
                <a className="core-button" download={batchGenealogyDownload.filename} href={batchGenealogyDownload.href}>Download batch genealogy</a>
                <p className="panel-copy">Read-only evidence. It does not issue inventory, control equipment, post costs, issue a certificate, or contact another system.</p>
                {certificateOfConformance ? <>
                  <p className="panel-copy"><strong>Certificate of Conformance ready</strong> · closed {certificateOfConformance.closure.closedAt} by {certificateOfConformance.closure.closedBy} · {certificateOfConformance.materialLots.length} material {certificateOfConformance.materialLots.length === 1 ? 'lot' : 'lots'} traced · quality {certificateOfConformance.qualityReleaseStatus === 'released' ? 'released' : certificateOfConformance.qualityReleaseStatus === 'not_released' ? 'not formally released' : 'not tracked'}.</p>
                  <div className="form-actions">
                    <button className="core-button" onClick={() => openProductionCertificatePrintWindow(certificateOfConformance)} type="button">Print certificate</button>
                    {certificateOfConformanceDownload ? <a className="core-button" download={certificateOfConformanceDownload.filename} href={certificateOfConformanceDownload.href}>Download certificate</a> : null}
                  </div>
                  <p className="panel-copy">Read-only Certificate of Conformance for this closed job. It issues no inventory, changes no equipment, posts no cost, and sends no message to any customer or external system.</p>
                </> : <p className="panel-copy">A certificate becomes available once this job closes with recorded evidence and carries no unresolved controlled-batch quality hold.</p>}
              </> : null}
              <form className="core-form compact-form" onSubmit={(event) => { event.preventDefault(); setRecallSearchId(recallQuery.trim()) }}>
                <label>Recall lot or output batch<input autoCapitalize="characters" maxLength={120} onChange={(event) => { setRecallQuery(event.target.value); setRecallSearchId('') }} placeholder="LOT-INPUT-001 or BATCH-OUTPUT-001" required spellCheck={false} value={recallQuery} /></label>
                <button className="core-button" type="submit">Trace batch</button>
              </form>
              {recallTraceDownload ? <div className="stock-receipt-preview" role="status">
                <small>{recallTraceDownload.report.completeness.status === 'complete' ? 'Exact retained trace' : 'Partial trace · review gaps'}</small>
                <strong>{recallTraceDownload.report.match.directJobIds.length} direct {recallTraceDownload.report.match.directJobIds.length === 1 ? 'job' : 'jobs'} · {recallTraceDownload.report.downstream.outputBatchIds.length} downstream {recallTraceDownload.report.downstream.outputBatchIds.length === 1 ? 'batch' : 'batches'} · {recallTraceDownload.report.upstream.inputLotIds.length} upstream {recallTraceDownload.report.upstream.inputLotIds.length === 1 ? 'lot' : 'lots'}</strong>
                <span>{recallTraceDownload.report.completeness.reason}</span>
                <a className="core-button" download={recallTraceDownload.filename} href={recallTraceDownload.href}>Download recall trace</a>
              </div> : recallSearchId ? <p className="panel-copy">No exact retained input-lot or output-batch link matches this ID.</p> : <p className="panel-copy">Enter one exact lot or output batch to trace origins and downstream production without customer details.</p>}
              <p className="panel-copy">Recall review only. No inventory block, customer contact, certificate, message, payment, or external action runs from this trace.</p>
            </div> : <p className="panel-copy">Create a production job before building a batch trace.</p>}
          </details>
          <details className="compact-disclosure production-history" onToggle={(event) => { if (!event.currentTarget.open && shiftCloseGuideOpen) setShiftCloseGuideOpen(false) }} open={shiftCloseGuideOpen || Boolean(shiftHandoff || currentShiftClose)} ref={shiftCloseDisclosureRef}>
            <summary>Shift close <span>{currentShiftClose ? 'Closed' : shiftHandoffIsCurrent ? shiftCloseReady ? 'Ready' : 'Blocked' : 'Build'}</span></summary>
            <form autoComplete="off" className="core-form compact-form" onSubmit={buildShiftHandoff}>
              <label>Shift reference<input maxLength={80} onChange={(event) => setHandoffShiftRef(event.target.value)} placeholder={shiftReferencePlaceholder()} required value={handoffShiftRef} /></label>
              <button className="core-button" disabled={!handoffShiftRef.trim() && !shiftRef.trim()} type="submit">Prepare shift close file</button>
              <p className="panel-copy">Review current output, material, quality, WCM, maintenance, and carry-forward work. Preparing changes nothing; closing requires a named owner, reason, and evidence.</p>
            </form>
            {shiftCloseRows.length ? <div aria-label="Shift close checklist" className="plant-shift-close-grid">{shiftCloseRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div> : null}
            {currentShiftClose ? <div className="form-notice" role="status"><strong>Shift closed by {currentShiftClose.actor}</strong><br />{currentShiftClose.shiftRef} | revision {currentShiftClose.sourceRevision} | {currentShiftClose.goodUnits} good | {currentShiftClose.materialEntryCount} material entries | {currentShiftCloseEvidence?.handoff.controlledOrders.length ?? 0} controlled orders | quality clear | WCM clear<br />Evidence: {currentShiftClose.evidenceReference}</div> : null}
            {shiftHandoff && !shiftHandoffIsCurrent && !currentShiftClose ? <p className="form-notice" role="alert">Plant records or the shift reference changed after this close file was prepared. Prepare it again before use.</p> : null}
            {currentShiftCloseEvidence ? <ShiftHandoffView handoff={currentShiftCloseEvidence.handoff} onCopy={copyClosedShiftHandoff} /> : shiftHandoff && shiftHandoffIsCurrent ? <ShiftHandoffView handoff={shiftHandoff} onCopy={copyShiftHandoff} /> : null}
            {!currentShiftClose && shiftHandoff && shiftHandoffIsCurrent ? <button className="core-button primary" disabled={!productionCanWrite || Boolean(pendingAction) || !shiftCloseReady} onClick={(event) => reviewShiftClose(event.currentTarget)} type="button">Review shift close</button> : null}
            {!currentShiftClose && shiftHandoff && shiftHandoffIsCurrent && !shiftCloseReady ? <p className="panel-copy">The owner close remains locked until this exact shift has good output and material trace, every controlled order is released or safely owned forward, and the current Plant record has no quality or WCM blocker.</p> : null}
          </details>
        </section>
        <section className="core-panel" style={{ overflowY: 'auto' }}>
          <div className="panel-head"><div><span className="core-eyebrow">Equipment</span><h2>Recorded status</h2></div></div>
          <p className="panel-copy production-control-boundary" style={{ fontSize: 11, lineHeight: 1.35, marginTop: 6 }}>Records operator observations only. No equipment control.</p>
          <button aria-label={`Review downtime records; ${openDowntimeIntervals.length} open`} className="core-button" onClick={() => setDowntimeDialogOpen(true)} ref={downtimeTriggerRef} style={{ justifyContent: 'space-between', margin: '8px 0', width: '100%' }} type="button"><span>Downtime</span><small>{openDowntimeIntervals.length ? `${openDowntimeIntervals.length} open` : `${recentDowntimeIntervals.length} recent`}</small></button>
          <button aria-label={`Review maintenance work; ${openMaintenanceRecords.length} open`} className="core-button" onClick={() => setMaintenanceDialogOpen(true)} ref={maintenanceTriggerRef} style={{ justifyContent: 'space-between', margin: '0 0 8px', width: '100%' }} type="button"><span>Maintenance</span><small>{openMaintenanceRecords.length ? `${openMaintenanceRecords.length} open` : `${recentMaintenanceRecords.length} recent`}</small></button>
          {production.machines.length ? <div className="machine-list">{production.machines.map((machine) => <button aria-label={`Review recorded status for ${machine.name}; currently ${productionMachineStateLabels[machine.state]}`} disabled={!productionCanWrite || Boolean(pendingAction)} key={machine.id} type="button" onClick={(event) => openMachineObservation(machine.id, event.currentTarget)}><span className={`machine-dot ${machine.state}`} /><span><strong>{machine.name}</strong><small>{machine.id} - Recorded: {productionMachineStateLabels[machine.state]}</small></span><b>Record status</b></button>)}</div> : <Empty>No equipment records exist in this workspace.</Empty>}
        </section>
      </div>
    </div>
    <dialog aria-labelledby="downtime-dialog-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeDowntimeDialog() }} ref={downtimeDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Equipment record</span><h2 id="downtime-dialog-title">Machine downtime</h2></div><button aria-label="Close downtime records" className="text-link" onClick={closeDowntimeDialog} style={{ minHeight: 44, minWidth: 44 }} type="button">Close</button></div>
      {openDowntimeIntervals.length ? <div className="issue-list">{openDowntimeIntervals.map((interval, index) => <article key={interval.startActionId}>
        <span aria-hidden="true" className="issue-mark">DT</span>
        <div><strong>{interval.machineName} · downtime open</strong><small style={wrappedIssueDetail}>Started {formatTime(interval.startedAt)} by {interval.startedBy} · {formatDowntimeDuration(issueClock - Date.parse(interval.startedAt))} elapsed</small><small style={wrappedIssueDetail}>Reason: {interval.startReason}</small><small style={wrappedIssueDetail}>Evidence: {interval.startEvidenceReference} · Action: {interval.startActionId}</small></div>
        <button className="core-button" data-downtime-primary={index === 0 ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => reviewDowntimeEnd(interval)} type="button">Review end</button>
      </article>)}</div> : <p className="panel-copy">No machine has an open downtime record.</p>}
      {availableDowntimeMachines.length ? <form autoComplete="off" className="core-form compact-form" onSubmit={reviewDowntimeStart}>
        <label>Machine<select data-downtime-primary={!openDowntimeIntervals.length ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setDowntimeMachineId(event.target.value)} value={selectedDowntimeMachineId}>{availableDowntimeMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} · {machine.id} · recorded {productionMachineStateLabels[machine.state]}</option>)}</select></label>
        <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedDowntimeMachine} type="submit">Review start</button>
      </form> : <p className="panel-copy">Every recorded machine already has open downtime.</p>}
      {recentDowntimeIntervals.length ? <><p className="panel-copy"><strong>Recent closed intervals</strong></p><div className="action-history-list">{recentDowntimeIntervals.map((interval) => <article key={interval.startActionId}><div><strong>{interval.machineName} · {formatDowntimeDuration(interval.durationMs ?? 0)}</strong><small style={wrappedIssueDetail}>{formatTime(interval.startedAt)} to {formatTime(interval.end?.endedAt ?? interval.startedAt)}</small><small style={wrappedIssueDetail}>Start: {interval.startedBy} · {interval.startReason} · {interval.startEvidenceReference}</small><small style={wrappedIssueDetail}>End: {interval.end?.endedBy} · {interval.end?.reason} · {interval.end?.evidenceReference}</small></div></article>)}</div></> : null}
      <p className="panel-copy">This human record is separate from machine status. It sends no equipment command and changes no job or output.</p>
    </dialog>
    <dialog aria-labelledby="maintenance-dialog-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeMaintenanceDialog() }} ref={maintenanceDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Owned work</span><h2 id="maintenance-dialog-title">Machine maintenance</h2></div><button aria-label="Close maintenance work" className="text-link" onClick={closeMaintenanceDialog} style={{ minHeight: 44, minWidth: 44 }} type="button">Close</button></div>
      {readyMaintenanceDueItems.length ? <><p className="panel-copy"><strong>Preventive work</strong> · {overdueMaintenanceCount ? `${overdueMaintenanceCount} overdue` : `${readyMaintenanceDueItems.length} planned`}</p><div className="action-history-list">{readyMaintenanceDueItems.map((item, index) => <article key={item.assetId}><div><strong>{item.assetName} · {item.status === 'overdue' ? (item.daysUntilDue === 0 ? 'Due now' : `${Math.abs(item.daysUntilDue)}d overdue`) : item.status === 'due_soon' ? `Due in ${item.daysUntilDue}d` : formatIssueDue(item.dueAt)}</strong><small style={wrappedIssueDetail}>{item.criticality} · {item.owner} · Strategy R{item.strategyRevision}</small><small style={wrappedIssueDetail}>{item.procedureReference}</small></div>{index === 0 ? <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => { setMaintenanceCompletionDraft(null); setMaintenanceMachineId(item.assetId); requestAnimationFrame(() => maintenanceMachineSelectRef.current?.focus()) }} type="button">Review next</button> : null}</article>)}</div></> : null}
      {openMaintenanceRecords.length ? <div className="issue-list">{openMaintenanceRecords.map((record, index) => <article key={record.startActionId}>
        <span aria-hidden="true" className="issue-mark">MX</span>
        <div><strong>{record.machineName} · {record.owner}</strong><small style={wrappedIssueDetail}>Started {formatTime(record.startedAt)} by {record.startedBy}</small>{record.strategy ? <small style={wrappedIssueDetail}>Strategy R{record.strategy.revision} · Due {formatIssueDue(record.strategy.plannedDueAt)} · {record.strategy.procedureReference}</small> : null}<small style={wrappedIssueDetail}>Scope: {record.scope}</small><small style={wrappedIssueDetail}>Evidence: {record.startEvidenceReference} · Action: {record.startActionId}</small></div>
        <button className="core-button" data-maintenance-primary={index === 0 ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => beginMaintenanceCompletion(record)} type="button">{record.strategy ? 'Add result' : 'Review complete'}</button>
      </article>)}</div> : <p className="panel-copy">No machine has open maintenance work.</p>}
      {maintenanceCompletionDraft && selectedMaintenanceCompletionRecord ? <form autoComplete="off" className="core-form compact-form" onSubmit={reviewMaintenanceCompletion}>
        <p className="panel-copy"><strong>Completion result · {selectedMaintenanceCompletionRecord.machineName}</strong><br />Strategy R{selectedMaintenanceCompletionRecord.strategy?.revision} · {selectedMaintenanceCompletionRecord.strategy?.procedureReference}</p>
        <label>Outcome<select onChange={(event) => { const outcome = event.target.value as ProductionMaintenanceOutcome; setMaintenanceCompletionDraft((current) => current ? { ...current, outcome, returnToService: outcome === 'completed' ? 'recommended' : current.returnToService } : current) }} ref={maintenanceOutcomeRef} value={maintenanceCompletionDraft.outcome}><option value="completed">Completed · no limiting finding</option><option value="completed_with_findings">Completed with findings</option></select></label>
        <label>Findings<textarea maxLength={360} onChange={(event) => setMaintenanceCompletionDraft((current) => current ? { ...current, findings: event.target.value } : current)} placeholder="Record inspected condition and findings; use 'No findings' only when confirmed." required value={maintenanceCompletionDraft.findings} /></label>
        <label className="website-intake-confirm"><input checked={maintenanceCompletionDraft.procedureCompleted} onChange={(event) => setMaintenanceCompletionDraft((current) => current ? { ...current, procedureCompleted: event.target.checked } : current)} type="checkbox" /><span>Reviewed procedure completed</span></label>
        <label>Return-to-service recommendation<select disabled={maintenanceCompletionDraft.outcome === 'completed'} onChange={(event) => setMaintenanceCompletionDraft((current) => current ? { ...current, returnToService: event.target.value as ProductionMaintenanceReturnToService } : current)} value={maintenanceCompletionDraft.returnToService}><option value="recommended">Recommended</option><option value="restricted">Restricted service</option><option value="not_recommended">Not recommended</option></select></label>
        <p className="panel-copy">This recommendation does not change recorded machine status. Record any status observation or problem separately.</p>
        <div className="form-actions"><button className="core-button" onClick={() => setMaintenanceCompletionDraft(null)} type="button">Cancel result</button><button className="core-button primary" disabled={!maintenanceCompletionIsValid || Boolean(pendingAction)} type="submit">Review completion</button></div>
      </form> : availableMaintenanceMachines.length ? <form autoComplete="off" className="core-form compact-form" onSubmit={reviewMaintenanceStart}>
        <label>Machine<select data-maintenance-primary={!openMaintenanceRecords.length ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setMaintenanceMachineId(event.target.value)} ref={maintenanceMachineSelectRef} value={selectedMaintenanceMachineId}>{availableMaintenanceMachines.map((machine) => { const strategy = production.equipmentMaster?.assets.find((asset) => asset.id === machine.id)?.maintenanceStrategy; return <option key={machine.id} value={machine.id}>{machine.name} · {strategy ? `planned R${strategy.revision}` : `recorded ${productionMachineStateLabels[machine.state]}`}</option> })}</select></label>
        {selectedMaintenanceStrategy ? <p className="panel-copy"><strong>Strategy R{selectedMaintenanceStrategy.revision}</strong> · Due {formatIssueDue(selectedMaintenanceStrategy.nextDueAt)}<br />Procedure: {selectedMaintenanceStrategy.procedureReference}</p> : null}
        <label>{selectedMaintenanceStrategy ? 'Strategy owner' : 'Owner'}<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setMaintenanceOwner(event.target.value)} placeholder="Named person or role" readOnly={Boolean(selectedMaintenanceStrategy)} required value={selectedMaintenanceStrategy ? selectedMaintenanceOwner : maintenanceOwner} /></label>
        <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaintenanceMachine || !selectedMaintenanceOwner || selectedMaintenanceOwner.length > 120} type="submit">Review start</button>
      </form> : <p className="panel-copy">Every recorded machine already has open maintenance work.</p>}
      {recentMaintenanceRecords.length ? <><p className="panel-copy"><strong>Recent completed work</strong></p><div className="action-history-list">{recentMaintenanceRecords.map((record) => {
        const findingSource = record.completion ? maintenanceFindingSources.get(record.completion.actionId) : undefined
        return <article key={record.startActionId}><div><strong>{record.machineName} · {record.owner}</strong><small style={wrappedIssueDetail}>Started: {record.startedBy} · {record.scope} · {record.startEvidenceReference}</small><small style={wrappedIssueDetail}>Completed: {record.completion?.completedBy} · {record.completion?.outcome} · {record.completion?.evidenceReference}</small>{record.completion?.result ? <small style={wrappedIssueDetail}>{record.completion.result.outcome.replaceAll('_', ' ')} · Return: {record.completion.result.returnToService.replaceAll('_', ' ')} · {record.completion.result.findings}</small> : null}{record.completion?.nextDueAt ? <small style={wrappedIssueDetail}>Next due: {formatIssueDue(record.completion.nextDueAt)} · Strategy R{record.strategy?.revision}</small> : null}<small style={wrappedIssueDetail}>{formatTime(record.startedAt)} to {formatTime(record.completion?.completedAt ?? record.startedAt)}</small></div>{findingSource ? <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => startMaintenanceFindingProblem(record)} type="button">Review problem</button> : null}</article>
      })}</div></> : null}
      <p className="panel-copy">Strategy-bound completion retains outcome, findings, procedure confirmation, recommendation, and next due. It performs no equipment command, telemetry, parts purchase, status change, downtime, or job change.</p>
    </dialog>
    <dialog aria-labelledby="machine-observation-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeMachineObservation() }} ref={machineDialogRef}>
      {observedMachine && machineObservation ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Equipment observation</span><h2 id="machine-observation-title">{observedMachine.name}</h2></div><button aria-label="Close equipment observation" className="text-link" onClick={closeMachineObservation} type="button">Close</button></div>
        <form className="core-form" onSubmit={reviewMachineObservation}>
          <label>New recorded status<select onChange={(event) => setMachineObservation((current) => current ? { ...current, toState: event.target.value as ProductionMachineState } : current)} value={machineObservation.toState}>{machineObservationTargets.map((state) => <option key={state} value={state}>{productionMachineStateLabels[state]}</option>)}</select></label>
          <p className="panel-copy">Currently recorded as {productionMachineStateLabels[observedMachine.state]}. This records an operator observation only; it does not start, stop, or control equipment.</p>
          <p className="panel-copy">Nothing changes until the accountable review is confirmed.</p>
          <div className="form-actions"><button className="core-button" onClick={closeMachineObservation} type="button">Cancel</button><button className="core-button primary" type="submit">Review observation</button></div>
        </form>
      </> : null}
    </dialog>
    <dialog aria-labelledby="production-issue-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeIssueDialog() }} ref={issueDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Plant problem</span><h2 id="production-issue-title">{issueMaintenanceFindingSource ? 'Review maintenance finding' : 'Record an observation'}</h2></div><button aria-label="Close problem form" className="text-link" onClick={closeIssueDialog} type="button">Close</button></div>
      <form autoComplete="off" className="core-form" onSubmit={createIssue}>
        {issueMaintenanceFindingSource ? <p className="form-notice" role="status"><strong>Linked completion</strong><br />{issueMaintenanceFindingSource.equipmentName} · Strategy R{issueMaintenanceFindingSource.strategyRevision} · {issueMaintenanceFindingSource.returnToService.replaceAll('_', ' ')}<br />Owner: {issueMaintenanceFindingSource.maintenanceOwner} · Evidence: {issueMaintenanceFindingSource.evidenceReference}</p> : null}
        <div className="form-row"><label>Type<select disabled={Boolean(issueMaintenanceFindingSource)} value={kind} onChange={(event) => setKind(event.target.value as ProductionIssue['kind'])}><option value="quality">Quality</option><option value="maintenance">Maintenance</option><option value="materials">Materials</option><option value="operations">Operations</option></select></label><label>Area<input maxLength={120} onChange={(event) => setArea(event.target.value)} placeholder="Line, machine, or work centre" required value={area} /></label></div>
        <label>Observation<textarea autoFocus maxLength={240} required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe what happened, not the assumption." /></label>
        <div className="form-row"><label>Priority<select value={severity} onChange={(event) => setSeverity(event.target.value as ProductionIssueSeverity)}>{productionIssueSeverities.map((candidate) => <option key={candidate} value={candidate}>{productionIssueSeverityLabels[candidate]}</option>)}</select></label><label>Owner<input autoComplete="off" maxLength={120} name="plant-issue-owner" onChange={(event) => setIssueOwner(event.target.value)} placeholder="Named person or role" required value={issueOwner} /></label></div>
        <label>Due time<input autoComplete="off" min={localDateTimeInputValue(new Date())} name="plant-issue-due" onChange={(event) => setIssueDueInput(event.target.value)} required type="datetime-local" value={issueDueInput} /></label>
        <label>Containment / next action<textarea maxLength={240} onChange={(event) => setContainment(event.target.value)} placeholder="What happens next, and what stays on hold?" required value={containment} /></label>
        <p className="panel-copy">{issueMaintenanceFindingSource ? 'The completion link is immutable. This review opens one problem only; it does not change machine status, dispatch work, buy parts, or control equipment.' : 'Nothing is saved until the next accountable review is confirmed.'}</p>
        <div className="form-actions"><button className="core-button" onClick={closeIssueDialog} type="button">Cancel</button><button className="core-button primary" type="submit">Review problem</button></div>
      </form>
    </dialog>
    <dialog aria-labelledby="maintenance-corrective-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); setMaintenanceCorrectiveDraft(null) }} ref={maintenanceCorrectiveDialogRef}>
      {maintenanceCorrectiveDraft ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Maintenance closeout</span><h2 id="maintenance-corrective-title">Review corrective action</h2></div><button aria-label="Close corrective action form" className="text-link" onClick={() => setMaintenanceCorrectiveDraft(null)} type="button">Close</button></div>
        <form autoComplete="off" className="core-form" onSubmit={reviewMaintenanceCorrectiveResolution}>
          <label>Corrective action<textarea autoFocus maxLength={360} onChange={(event) => setMaintenanceCorrectiveDraft((current) => current ? { ...current, correctiveAction: event.target.value } : current)} placeholder="What was corrected or controlled?" required value={maintenanceCorrectiveDraft.correctiveAction} /></label>
          <label>Verification result<textarea maxLength={360} onChange={(event) => setMaintenanceCorrectiveDraft((current) => current ? { ...current, verificationResult: event.target.value } : current)} placeholder="What evidence shows the action was effective?" required value={maintenanceCorrectiveDraft.verificationResult} /></label>
          <label>Final return-to-service disposition<select onChange={(event) => setMaintenanceCorrectiveDraft((current) => current ? { ...current, finalDisposition: event.target.value as ProductionMaintenanceReturnToService } : current)} value={maintenanceCorrectiveDraft.finalDisposition}><option value="recommended">Recommended</option><option value="restricted">Restricted service</option><option value="not_recommended">Not recommended</option></select></label>
          <p className="panel-copy">This closes the problem record only. It does not change machine status, dispatch work, buy parts, or control equipment.</p>
          <div className="form-actions"><button className="core-button" onClick={() => setMaintenanceCorrectiveDraft(null)} type="button">Cancel</button><button className="core-button primary" type="submit">Review closeout</button></div>
        </form>
      </> : null}
    </dialog>
    <dialog aria-labelledby="quality-corrective-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); setQualityCorrectiveDraft(null) }} ref={qualityCorrectiveDialogRef}>
      {qualityCorrectiveDraft ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Quality CAPA</span><h2 id="quality-corrective-title">Verify corrective action</h2></div><button aria-label="Close quality CAPA form" className="text-link" onClick={() => setQualityCorrectiveDraft(null)} type="button">Close</button></div>
        <form autoComplete="off" className="core-form" onSubmit={reviewQualityCorrectiveResolution}>
          <label>Failure mode<input autoFocus maxLength={120} onChange={(event) => setQualityCorrectiveDraft((current) => current ? { ...current, failureMode: event.target.value } : current)} placeholder="Stable name used to find repeats" required value={qualityCorrectiveDraft.failureMode} /><small>Use the same short name when the same defect happens again.</small></label>
          <div className="form-row"><label>Cause category<select onChange={(event) => setQualityCorrectiveDraft((current) => current ? { ...current, causeCategory: event.target.value as ProductionQualityCauseCategory } : current)} value={qualityCorrectiveDraft.causeCategory}>{productionQualityCauseCategories.map((category) => <option key={category} value={category}>{productionQualityCauseLabels[category]}</option>)}</select></label><label>Effectiveness owner<input autoComplete="off" maxLength={120} onChange={(event) => setQualityCorrectiveDraft((current) => current ? { ...current, effectivenessOwner: event.target.value } : current)} placeholder="Named person or role" required value={qualityCorrectiveDraft.effectivenessOwner} /></label></div>
          <label>Effectiveness review by<input min={localDateTimeInputValue(new Date())} onChange={(event) => setQualityCorrectiveDraft((current) => current ? { ...current, effectivenessDue: event.target.value } : current)} required type="datetime-local" value={qualityCorrectiveDraft.effectivenessDue} /></label>
          <label>Verified root cause<textarea maxLength={360} onChange={(event) => setQualityCorrectiveDraft((current) => current ? { ...current, rootCause: event.target.value } : current)} placeholder="What evidence identifies the cause?" required value={qualityCorrectiveDraft.rootCause} /></label>
          <label>Corrective action<textarea maxLength={360} onChange={(event) => setQualityCorrectiveDraft((current) => current ? { ...current, correctiveAction: event.target.value } : current)} placeholder="What changed to prevent recurrence?" required value={qualityCorrectiveDraft.correctiveAction} /></label>
          <label>Effectiveness evidence<textarea maxLength={360} onChange={(event) => setQualityCorrectiveDraft((current) => current ? { ...current, verificationResult: event.target.value } : current)} placeholder="What result proves the action worked?" required value={qualityCorrectiveDraft.verificationResult} /></label>
          <p className="panel-copy">Matching prior CAPA records are linked automatically from the failure mode and cause category. Closing changes only this problem record; it does not release a batch, block stock, contact a customer, or issue a certificate.</p>
          <div className="form-actions"><button className="core-button" onClick={() => setQualityCorrectiveDraft(null)} type="button">Cancel</button><button className="core-button primary" type="submit">Review CAPA closeout</button></div>
        </form>
      </> : null}
    </dialog>
    {actionControls}
  </div>

  return null
}

// Shared between JobList and PlantJobBoard so the two renderings of the same job
// cannot drift: one progress formula, one empty-state copy, one pair of action links.
const PLANT_NO_ACTIVE_JOBS_COPY = 'No active jobs. Add a job below to start recording output.'

function plantJobAccounting(job: ProductionJob) {
  const scrap = job.scrap ?? 0
  const accounted = job.output + scrap
  return { scrap, accounted, progress: Math.min(100, Math.round((accounted / job.target) * 100)) }
}

function PlantJobActionLinks({ disabled, job, onOutput, onSchedule }: { disabled: boolean; job: ProductionJob; onOutput?: (job: ProductionJob, trigger: HTMLButtonElement) => void; onSchedule?: (job: ProductionJob, trigger: HTMLButtonElement) => void }) {
  return <>
    {onOutput ? <button aria-controls="plant-output-panel" className="text-link job-output-link" disabled={disabled} onClick={(event) => onOutput(job, event.currentTarget)} type="button">Record output</button> : null}
    {onSchedule ? <button className="text-link" disabled={disabled} onClick={(event) => onSchedule(job, event.currentTarget)} type="button">Change plan</button> : null}
  </>
}

function JobList({ disabled = false, jobs, now, onOutput, onSchedule }: { disabled?: boolean; jobs: ProductionJob[]; now: number; onOutput?: (job: ProductionJob, trigger: HTMLButtonElement) => void; onSchedule?: (job: ProductionJob, trigger: HTMLButtonElement) => void }) {
  if (!jobs.length) return <Empty>{PLANT_NO_ACTIVE_JOBS_COPY}</Empty>
  return <div className="job-list">{jobs.map((job) => {
    const { scrap, accounted, progress } = plantJobAccounting(job)
    const scheduled = Boolean(job.priority && job.dueAt)
    const overdue = Boolean(!job.closure && job.dueAt && Date.parse(job.dueAt) <= now)
    const scheduleLabel = scheduled
      ? `${productionJobPriorityLabels[job.priority ?? 'normal']} · ${overdue ? 'OVERDUE ' : job.closure ? 'Was due ' : 'Due '}${formatIssueDue(job.dueAt ?? '')}`
      : 'Schedule not recorded · legacy job'
    const ownerLabel = job.owner ? `Owner ${job.owner}` : 'Owner not recorded · legacy job'
    return <article key={job.id}><div><span>{job.id} · {job.line}{job.qualityHold ? ' · QUALITY HOLD' : ''}{job.closure ? ' · CLOSED SHORT' : ''}</span><strong>{job.product}</strong><small className={`job-schedule${overdue ? ' overdue' : ''}`} data-priority={job.priority ?? 'legacy'}>{ownerLabel} · {scheduleLabel}</small>{job.closure ? <small>Closed {formatIssueDue(job.closure.closedAt)} by {job.closure.closedBy} · Shift {job.closure.shiftRef} · {job.closure.remainingUnits.toLocaleString()} not produced</small> : null}{job.qualityHold ? <small>Held by {job.qualityHold.heldBy} · Evidence: {job.qualityHold.evidenceReference}</small> : null}{!job.closure && accounted < job.target && (onOutput || onSchedule) ? <div className="job-row-actions"><PlantJobActionLinks disabled={disabled} job={job} onOutput={onOutput} onSchedule={onSchedule} /></div> : null}</div><div className="job-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{job.output.toLocaleString()} good · {scrap.toLocaleString()} scrap · {accounted.toLocaleString()} / {job.target.toLocaleString()}{job.closure ? ` · ${job.closure.remainingUnits.toLocaleString()} closed short` : ''}</small></div></article>
  })}</div>
}

// Due-date lanes for the Plant job board, in render order: most urgent lane first.
// "This week" is a rolling window — the 7 calendar days starting today — not a
// locale calendar week, so the grouping reads the same on any day of the week.
const plantJobBoardLanes = [
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['week', 'This week'],
  ['later', 'Later'],
  ['undated', 'No due date'],
] as const

type PlantJobBoardLaneId = (typeof plantJobBoardLanes)[number][0]

function plantJobBoardLaneId(job: ProductionJob, now: number): PlantJobBoardLaneId {
  if (!job.dueAt) return 'undated'
  const due = Date.parse(job.dueAt)
  if (!Number.isFinite(due)) return 'undated'
  // Same boundary as JobList's overdue marker: due at or before "now" is overdue.
  if (due <= now) return 'overdue'
  // EXCLUSIVE upper bounds: the datetime-local inputs accept midnight deadlines,
  // and a deadline exactly at local midnight displays with the NEXT day's date
  // (formatIssueDue), so it must group with that day — tomorrow 00:00 is not
  // "Today", and the first instant of day 8 is not "This week".
  const endOfToday = new Date(now)
  endOfToday.setHours(24, 0, 0, 0)
  if (due < endOfToday.getTime()) return 'today'
  // setDate, not fixed 24h arithmetic, so the 7-day boundary stays on local
  // midnight across a DST transition.
  const endOfWeek = new Date(endOfToday)
  endOfWeek.setDate(endOfWeek.getDate() + 6)
  if (due < endOfWeek.getTime()) return 'week'
  return 'later'
}

// Display-and-navigation board over the SAME jobs the list renders: no write, no
// rescheduling, no drag-and-drop — moving a job between lanes is a domain write and
// stays behind the accountable "Change plan" review the list also uses. Jobs arrive
// pre-sorted by compareProductionJobSchedule, so each lane is priority-ordered.
function PlantJobBoard({ disabled = false, jobs, now, onOutput, onSchedule }: { disabled?: boolean; jobs: ProductionJob[]; now: number; onOutput?: (job: ProductionJob, trigger: HTMLButtonElement) => void; onSchedule?: (job: ProductionJob, trigger: HTMLButtonElement) => void }) {
  if (!jobs.length) return <Empty>{PLANT_NO_ACTIVE_JOBS_COPY}</Empty>
  const laneJobs = new Map<PlantJobBoardLaneId, ProductionJob[]>(plantJobBoardLanes.map(([id]) => [id, []]))
  for (const job of jobs) laneJobs.get(plantJobBoardLaneId(job, now))?.push(job)
  return <div aria-label="Job board grouped by due date" className="plant-job-board" role="group">
    {plantJobBoardLanes.map(([id, label]) => {
      const grouped = laneJobs.get(id) ?? []
      return <section aria-label={`${label} · ${grouped.length} ${grouped.length === 1 ? 'job' : 'jobs'}`} className="plant-job-board-lane" data-lane={id} key={id}>
        <header><strong>{label}</strong><span>{grouped.length}</span></header>
        {grouped.length ? grouped.map((job) => {
          const { scrap, accounted, progress } = plantJobAccounting(job)
          const overdue = id === 'overdue'
          return <article className={`plant-job-card${overdue ? ' overdue' : ''}`} data-priority={job.priority ?? 'legacy'} key={job.id}>
            <small>{job.id} · {job.line}{job.qualityHold ? ' · QUALITY HOLD' : ''}</small>
            <strong>{job.product}</strong>
            <small className="plant-job-card-schedule">{job.priority && job.dueAt ? `${productionJobPriorityLabels[job.priority]} · ${overdue ? 'OVERDUE ' : 'Due '}${formatIssueDue(job.dueAt)}` : 'Schedule not recorded · legacy job'}</small>
            <div className="job-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{job.output.toLocaleString()} good · {scrap.toLocaleString()} scrap · {accounted.toLocaleString()} / {job.target.toLocaleString()}</small></div>
            {!job.closure && accounted < job.target && (onOutput || onSchedule) ? <div className="plant-job-card-actions"><PlantJobActionLinks disabled={disabled} job={job} onOutput={onOutput} onSchedule={onSchedule} /></div> : null}
          </article>
        }) : <p className="plant-job-board-empty">No jobs in this lane.</p>}
      </section>
    })}
  </div>
}

function CompletedJobHistory({ jobs, now }: { jobs: ProductionJob[]; now: number }) {
  if (!jobs.length) return null
  return <details className="compact-disclosure production-history">
    <summary>Finished jobs <span>{jobs.length}</span></summary>
    <JobList jobs={jobs.slice(0, 8)} now={now} />
    {jobs.length > 8 ? <p>Showing the latest 8 completed jobs.</p> : null}
  </details>
}

function IssueList({ disabled = false, issues, now, onResolve }: { disabled?: boolean; issues: ProductionIssue[]; now: number; onResolve: (id: string) => void }) {
  if (!issues.length) return <Empty>No production issue is open.</Empty>
  return <div className="issue-list">{issues.map((issue) => {
    const actionable = Boolean(issue.severity && issue.owner && issue.dueAt && issue.containment)
    const overdue = issue.status === 'open' && Boolean(issue.dueAt) && Date.parse(issue.dueAt ?? '') < now
    const severityLabel = issue.severity ? productionIssueSeverityLabels[issue.severity] : 'Legacy'
    return <article key={issue.id} title={issue.id}>
      <span className={`issue-mark ${issue.status}`}>{issue.status === 'open' ? issue.severity?.charAt(0).toUpperCase() ?? '!' : '✓'}</span>
      <div>
        <strong>{issue.summary}</strong>
        <small style={wrappedIssueDetail}>{severityLabel} · {issue.kind} · {issue.area} · opened {formatTime(issue.createdAt)}</small>
        {actionable ? <>
          <small style={wrappedIssueDetail}>{overdue ? 'OVERDUE' : `Due ${formatIssueDue(issue.dueAt ?? '')}`} · Owner {issue.owner}</small>
          <small style={wrappedIssueDetail}>Next: {issue.containment}</small>
        </> : <small style={wrappedIssueDetail}>Legacy problem · owner, due time, and containment were not recorded</small>}
        {issue.maintenanceFindingSource ? <small style={wrappedIssueDetail}>Maintenance finding · {issue.maintenanceFindingSource.equipmentName} · Strategy R{issue.maintenanceFindingSource.strategyRevision} · Source {issue.maintenanceFindingSource.completionActionId}</small> : null}
        {issue.status === 'resolved' ? <small style={wrappedIssueDetail}>{issue.resolution ? `Resolved by ${issue.resolution.resolvedBy} · Evidence: ${issue.resolution.evidenceReference}` : 'Legacy resolution · no attributed proof was available'}</small> : null}
        {issue.resolution?.maintenanceCorrectiveAction ? <small style={wrappedIssueDetail}>Corrective action: {issue.resolution.maintenanceCorrectiveAction.correctiveAction} · Verified: {issue.resolution.maintenanceCorrectiveAction.verificationResult} · Final disposition: {issue.resolution.maintenanceCorrectiveAction.finalDisposition.replaceAll('_', ' ')}</small> : null}
        {issue.resolution?.qualityCorrectiveAction ? <><small style={wrappedIssueDetail}>CAPA: {productionQualityCauseLabels[issue.resolution.qualityCorrectiveAction.causeCategory]} · {issue.resolution.qualityCorrectiveAction.failureMode} · Owner {issue.resolution.qualityCorrectiveAction.effectivenessOwner}{isCapaEffectivenessOverdue(issue.resolution.qualityCorrectiveAction, new Date(now).toISOString()) ? ' · REVIEW OVERDUE' : ` · Review by ${formatIssueDue(issue.resolution.qualityCorrectiveAction.effectivenessDue)}`}</small><small style={wrappedIssueDetail}>{issue.resolution.qualityCorrectiveAction.priorIssueIds.length ? `Repeat · linked to ${issue.resolution.qualityCorrectiveAction.priorIssueIds.join(', ')}` : 'First classified occurrence'} · Verified: {issue.resolution.qualityCorrectiveAction.verificationResult}</small></> : null}
      </div>
      {issue.status === 'open' ? <button className="text-link" disabled={disabled} onClick={() => onResolve(issue.id)} type="button">{issue.kind === 'quality' ? 'Review CAPA' : 'Review close'}</button> : <b>Resolved</b>}
    </article>
  })}</div>
}

function ResolvedIssueHistory({ issues, now }: { issues: ProductionIssue[]; now: number }) {
  if (!issues.length) return null
  return <details className="compact-disclosure production-history resolved-issue-history">
    <summary>Resolved problems <span>{issues.length}</span></summary>
    <IssueList issues={issues.slice(0, 8)} now={now} onResolve={() => undefined} />
    {issues.length > 8 ? <p>Showing the latest 8 resolved problems.</p> : null}
  </details>
}

function QualityHoldList({ disabled, jobs, onRelease }: { disabled: boolean; jobs: ProductionJob[]; onRelease: (id: string, trigger: HTMLButtonElement) => void }) {
  if (!jobs.length) return <Empty>No job or batch is on quality hold.</Empty>
  return <div className="issue-list">{jobs.map((job) => {
    const hold = job.qualityHold
    if (!hold) return null
    return <article key={job.id}>
      <span className="issue-mark open">H</span>
      <div>
        <strong>{job.product} · {job.id}</strong>
        <small style={wrappedIssueDetail}>Held by {hold.heldBy} · {formatIssueDue(hold.heldAt)}</small>
        <small style={wrappedIssueDetail}>Reason: {hold.reason}</small>
        <small style={wrappedIssueDetail}>Evidence: {hold.evidenceReference}</small>
      </div>
      <button className="text-link" disabled={disabled} onClick={(event) => onRelease(job.id, event.currentTarget)} type="button">Review release</button>
    </article>
  })}</div>
}

function ShiftHandoffView({ handoff, onCopy }: { handoff: ProductionShiftHandoff; onCopy: () => void }) {
  const visibleMaterialEntries = handoff.materialEntries.slice(0, 8)
  const controlledOrderBlockers = handoff.controlledOrders.filter((order) => order.blockingReasons.length > 0)
  return <div>
    <p className="panel-copy"><strong>Close gate</strong> | {controlledOrderBlockers.length} controlled-order blockers | {handoff.openQualityIssues.length} open quality | {handoff.activeDowntime.length} downtime open | {handoff.activeMaintenance.length} maintenance open.</p>
    <p className="form-notice" role="status">{handoff.shiftRef} · revision {handoff.sourceRevision} · {handoff.shiftOutput.goodUnits.toLocaleString()} good · {handoff.shiftOutput.scrapUnits.toLocaleString()} scrap · {handoff.materialTotals.length} material totals · {handoff.controlledOrders.length} controlled orders · {handoff.shortCloses.length} closed short · {handoff.unfinishedJobs.length} unfinished · {handoff.activeHolds.length} held · {handoff.priorityProblems.length} critical/high · {handoff.activeMaintenance.length} maintenance open.</p>
    <details className="compact-disclosure production-history">
      <summary>Shift entries <span>{handoff.shiftEntries.length}</span></summary>
      <div className="issue-list">
        {handoff.shiftEntries.map((entry) => <article key={entry.actionId}>
          <span className="issue-mark resolved">{entry.outputKind === 'scrap' ? 'S' : 'G'}</span>
          <div><strong>{entry.quantity.toLocaleString()} {entry.outputKind} · {entry.product}</strong><small style={wrappedIssueDetail}>{entry.jobId} · {formatIssueDue(entry.recordedAt)} · {entry.recordedBy}</small><small style={wrappedIssueDetail}>Reason: {entry.reason}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
        </article>)}
        {!handoff.shiftEntries.length ? <Empty>No output entry is attributed to this shift reference.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Material use <span>{handoff.materialEntries.length}</span></summary>
      <p className="panel-copy"><strong>Shift totals</strong></p>
      <div className="issue-list">
        {handoff.materialTotals.map((total) => <article key={`${total.materialRef}-${total.materialUnit}`}>
          <span aria-hidden="true" className="issue-mark resolved">Σ</span>
          <div><strong>{total.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {total.materialUnit} · {total.materialRef}</strong><small style={wrappedIssueDetail}>{total.entryCount} {total.entryCount === 1 ? 'entry' : 'entries'} in this shift</small></div>
        </article>)}
        {!handoff.materialTotals.length ? <Empty>No material use is attributed to this shift reference.</Empty> : null}
      </div>
      {visibleMaterialEntries.length ? <><p className="panel-copy"><strong>Recent evidence</strong></p><div className="issue-list">{visibleMaterialEntries.map((entry) => <article key={entry.actionId}>
        <span aria-hidden="true" className="issue-mark resolved">M</span>
        <div><strong>{entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {entry.materialUnit} · {entry.materialRef}{entry.materialLot ? ` · lot ${entry.materialLot}` : ''}</strong><small style={wrappedIssueDetail}>{entry.jobId} · {entry.product} · {formatIssueDue(entry.recordedAt)} · {entry.recordedBy}</small><small style={wrappedIssueDetail}>Reason: {entry.reason}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
      </article>)}</div></> : null}
      {handoff.materialEntries.length > visibleMaterialEntries.length ? <p className="panel-copy">Showing the latest {visibleMaterialEntries.length} of {handoff.materialEntries.length} entries. Copy keeps every attributed entry.</p> : null}
    </details>
    <details className="compact-disclosure production-history" open={Boolean(controlledOrderBlockers.length)}>
      <summary>Controlled orders <span>{handoff.controlledOrders.length}</span></summary>
      <div className="issue-list">
        {handoff.controlledOrders.map((order) => <article key={order.jobId}>
          <span className={`issue-mark ${order.blockingReasons.length ? 'open' : 'resolved'}`}>{order.disposition === 'released' ? 'R' : order.disposition === 'carry_forward' ? 'C' : 'Q'}</span>
          <div><strong>{order.product} · {order.jobId}</strong><small style={wrappedIssueDetail}>{order.disposition.replaceAll('_', ' ')} · {order.status.replaceAll('_', ' ')} · Binding {order.bindingCurrent ? 'current' : 'stale'} · Plan {order.planId}</small><small style={wrappedIssueDetail}>Operations {order.completedOperationCount}/{order.operationCount} · Output {order.outputUnits.toLocaleString()}/{order.targetUnits.toLocaleString()} · Accepted {order.acceptedUnits.toLocaleString()} · Trace links {order.genealogyLinkCount}</small>{order.owner || order.dueAt ? <small style={wrappedIssueDetail}>{order.owner ? `Owner ${order.owner}` : 'Owner missing'} · {order.dueAt ? `Due ${formatIssueDue(order.dueAt)}` : 'Due time missing'}</small> : null}{order.nextOperation ? <small style={wrappedIssueDetail}>Next: {order.nextOperation.operationId} · {order.nextOperation.name} · {order.nextOperation.remainingUnits.toLocaleString()} remaining</small> : null}{order.inspection ? <small style={wrappedIssueDetail}>Inspection {order.inspection.inspectionId} · {order.inspection.result} · {order.inspection.acceptedUnits.toLocaleString()} accepted · {order.inspection.rejectedUnits.toLocaleString()} rejected · Evidence {order.inspection.evidenceReference}</small> : null}{order.batchRelease ? <small style={wrappedIssueDetail}>Release {order.batchRelease.releaseId} · {formatIssueDue(order.batchRelease.releasedAt)} · {order.batchRelease.releasedBy} · Evidence {order.batchRelease.evidenceReference}</small> : null}{order.exceptions.map((exception) => <small key={exception} style={wrappedIssueDetail}>Exception: {exception}</small>)}{order.blockingReasons.map((reason) => <small key={reason} style={wrappedIssueDetail}>BLOCKED: {reason}</small>)}<small style={wrappedIssueDetail}>Plan digest: {order.planDigest}</small></div>
        </article>)}
        {!handoff.controlledOrders.length ? <Empty>No controlled order exists in this Plant workspace.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Closed short <span>{handoff.shortCloses.length}</span></summary>
      <div className="issue-list">
        {handoff.shortCloses.map((entry) => <article key={entry.actionId}>
          <span aria-hidden="true" className="issue-mark resolved">C</span>
          <div><strong>{entry.product} · {entry.jobId}</strong><small style={wrappedIssueDetail}>{entry.goodUnits.toLocaleString()} good · {entry.scrapUnits.toLocaleString()} scrap · {entry.remainingUnits.toLocaleString()} not produced</small><small style={wrappedIssueDetail}>Closed {formatIssueDue(entry.recordedAt)} by {entry.recordedBy} · Shift {entry.shiftRef}</small><small style={wrappedIssueDetail}>Reason: {entry.reason}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
        </article>)}
        {!handoff.shortCloses.length ? <Empty>No job was closed short in this shift.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Unfinished jobs <span>{handoff.unfinishedJobs.length}</span></summary>
      <div className="issue-list">
        {handoff.unfinishedJobs.map((job) => <article key={job.id}>
          <span className={`issue-mark ${job.qualityHold ? 'open' : 'resolved'}`}>{job.qualityHold ? 'H' : 'J'}</span>
          <div><strong>{job.product} · {job.id}</strong><small style={wrappedIssueDetail}>{job.line} · {job.remainingUnits.toLocaleString()} remaining · {job.goodUnits.toLocaleString()} good · {job.scrapUnits.toLocaleString()} scrap</small><small style={wrappedIssueDetail}>{job.priority && job.dueAt ? `${productionJobPriorityLabels[job.priority]} · Due ${formatIssueDue(job.dueAt)}` : 'Schedule not recorded · legacy job'}</small>{job.qualityHold ? <small style={wrappedIssueDetail}>QUALITY HOLD · {job.qualityHold.heldBy} · Evidence: {job.qualityHold.evidenceReference}</small> : null}</div>
        </article>)}
        {!handoff.unfinishedJobs.length ? <Empty>No unfinished job is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Active quality holds <span>{handoff.activeHolds.length}</span></summary>
      <div className="issue-list">
        {handoff.activeHolds.map((heldJob) => <article key={heldJob.id}>
          <span className="issue-mark open">H</span>
          <div><strong>{heldJob.product} · {heldJob.id}</strong><small style={wrappedIssueDetail}>{heldJob.line} · target {heldJob.target.toLocaleString()} · {heldJob.goodUnits.toLocaleString()} good · {heldJob.scrapUnits.toLocaleString()} scrap · {heldJob.remainingUnits.toLocaleString()} remaining</small><small style={wrappedIssueDetail}>Held {formatIssueDue(heldJob.qualityHold.heldAt)} by {heldJob.qualityHold.heldBy}</small><small style={wrappedIssueDetail}>Reason: {heldJob.qualityHold.reason}</small><small style={wrappedIssueDetail}>Evidence: {heldJob.qualityHold.evidenceReference} · Action: {heldJob.qualityHold.actionId}</small></div>
        </article>)}
        {!handoff.activeHolds.length ? <Empty>No active quality hold is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Open quality problems <span>{handoff.openQualityIssues.length}</span></summary>
      <div className="issue-list">
        {handoff.openQualityIssues.map((problem) => <article key={problem.id}>
          <span className="issue-mark open">{problem.severity.charAt(0).toUpperCase()}</span>
          <div><strong>{problem.summary}</strong><small style={wrappedIssueDetail}>{productionIssueSeverityLabels[problem.severity]} · {problem.area}</small><small style={wrappedIssueDetail}>Owner {problem.owner} · Due {formatIssueDue(problem.dueAt)}</small><small style={wrappedIssueDetail}>Next: {problem.containment}</small></div>
        </article>)}
        {!handoff.openQualityIssues.length ? <Empty>No open quality problem is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Critical/high problems <span>{handoff.priorityProblems.length}</span></summary>
      <div className="issue-list">
        {handoff.priorityProblems.map((problem) => <article key={problem.id}>
          <span className="issue-mark open">{problem.severity.charAt(0).toUpperCase()}</span>
          <div><strong>{problem.summary}</strong><small style={wrappedIssueDetail}>{productionIssueSeverityLabels[problem.severity]} · {problem.area} · Opened {formatIssueDue(problem.openedAt)} by {problem.openedBy}</small><small style={wrappedIssueDetail}>Owner {problem.owner} · Due {formatIssueDue(problem.dueAt)}</small><small style={wrappedIssueDetail}>Next: {problem.containment}</small><small style={wrappedIssueDetail}>Evidence: {problem.evidenceReference} · Action: {problem.actionId}</small></div>
        </article>)}
        {!handoff.priorityProblems.length ? <Empty>No open critical or high problem is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Active downtime <span>{handoff.activeDowntime.length}</span></summary>
      <div className="issue-list">
        {handoff.activeDowntime.map((interval) => <article key={interval.startActionId}>
          <span className="issue-mark open">DT</span>
          <div><strong>{interval.machineName}</strong><small style={wrappedIssueDetail}>{interval.machineId} · Started {formatIssueDue(interval.startedAt)} by {interval.startedBy}</small><small style={wrappedIssueDetail}>Reason: {interval.startReason}</small><small style={wrappedIssueDetail}>Evidence: {interval.startEvidenceReference} · Action: {interval.startActionId}</small></div>
        </article>)}
        {!handoff.activeDowntime.length ? <Empty>No active downtime is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Active maintenance <span>{handoff.activeMaintenance.length}</span></summary>
      <div className="issue-list">
        {handoff.activeMaintenance.map((record) => <article key={record.startActionId}>
          <span className="issue-mark open">MX</span>
          <div><strong>{record.machineName} · {record.owner}</strong><small style={wrappedIssueDetail}>{record.machineId} · Started {formatIssueDue(record.startedAt)} by {record.startedBy}</small><small style={wrappedIssueDetail}>Scope: {record.scope}</small><small style={wrappedIssueDetail}>Evidence: {record.startEvidenceReference} · Action: {record.startActionId}</small></div>
        </article>)}
        {!handoff.activeMaintenance.length ? <Empty>No active maintenance work is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Machine observations <span>{handoff.machineObservations.length}</span></summary>
      <div className="issue-list">
        {handoff.machineObservations.map((machine) => <article key={machine.id}>
          <span className={`machine-dot ${machine.state}`} />
          <div><strong>{machine.name}</strong><small style={wrappedIssueDetail}>{machine.id} · Recorded: {productionMachineStateLabels[machine.state]}</small>{machine.observation ? <><small style={wrappedIssueDetail}>Observed {formatIssueDue(machine.observation.observedAt)} by {machine.observation.observedBy}</small><small style={wrappedIssueDetail}>Reason: {machine.observation.reason}</small><small style={wrappedIssueDetail}>Evidence: {machine.observation.evidenceReference} · Action: {machine.observation.actionId}</small></> : <small style={wrappedIssueDetail}>No attributed observation recorded</small>}</div>
        </article>)}
        {!handoff.machineObservations.length ? <Empty>No machine record exists.</Empty> : null}
      </div>
    </details>
    <button className="core-button" onClick={onCopy} type="button">Copy close file</button>
  </div>
}
