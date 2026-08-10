import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { recordBehaviorSignal } from '../../core/behavior-trail'

import {
  buildEcommerceCheckoutQuote,
  buildEcommerceCancellationIntent,
  buildEcommerceCorrectionIntent,
  buildEcommerceOrderAmendmentIntent,
  buildEcommerceOrderRescheduleIntent,
  buildEcommerceOrderRequestV2,
  buildEcommercePimProjection,
  buildEcommerceReturnIntent,
  buildEcommerceSupportIntent,
  createEmptyEcommerceBuyingState,
  deriveEcommerceCustomerRequestState,
  ecommerceAvailablePaymentAdapters,
  ecommerceQuoteNextAction,
  ecommerceBuyingStateStorageKey,
  ecommercePaymentMatchesFulfilment,
  readEcommerceRequestReceiptDismissal,
  prepareEcommerceShopDraftV2,
  projectEcommerceReturnOutcome,
  projectEcommerceCorrectionOutcome,
  projectEcommerceSupportOutcome,
  recoverEcommerceCartRemoval,
  readEcommerceBuyingState,
  saveEcommerceOrderRequestV2,
  saveEcommerceRequestReceiptDismissal,
  saveEcommerceCancellationIntent,
  saveEcommerceCorrectionIntent,
  saveEcommerceOrderAmendment,
  saveEcommerceOrderReschedule,
  saveEcommerceReturnIntent,
  saveEcommerceSupportIntent,
  type EcommerceBuyingState,
  type EcommerceCancellationIntent,
  type EcommerceCancellationReasonCode,
  type EcommerceCorrectionIntent,
  type EcommerceOrderAmendmentIntent,
  type EcommerceOrderRescheduleIntent,
  type EcommerceCartLine,
  type EcommerceCustomerRequestState,
  type EcommerceRemovedCartLine,
  type EcommerceFulfilment,
  type EcommercePaymentAdapter,
  type EcommerceReturnDisposition,
  type EcommerceReturnIntent,
  type EcommerceSupportCategory,
  type EcommerceSupportIntent,
  type EcommerceShopDraftV2,
} from './ecommerce-buying-lifecycle'
import {
  closeEcommerceOrderChangeDraft,
  closeEcommerceOrderRescheduleDraft,
  createEcommerceOrderChangeOpening,
  createEcommerceOrderRescheduleOpening,
  recoverEcommerceOrderChangeDraft,
  recoverEcommerceOrderRescheduleDraft,
  type EcommerceClosedOrderChangeDraft,
  type EcommerceClosedOrderRescheduleDraft,
  type EcommerceOrderChangeDraft,
  type EcommerceOrderChangeOpening,
  type EcommerceOrderRescheduleDraft,
  type EcommerceOrderRescheduleOpening,
} from './ecommerce-order-change-draft'
import {
  createEcommerceCheckoutEntryRecovery,
  ecommerceCheckoutEntryDraft,
  ecommerceCheckoutEntryDraftHasContent,
  ecommerceCheckoutEntryRecoveriesMatch,
  ecommerceCheckoutEntryRecoveryMatchesDraft,
  ecommerceCheckoutEntryRecoverySource,
  ecommerceCheckoutEntryRecoveryStorageKey,
  restoreEcommerceCheckoutEntryRecovery,
  reviewEcommerceCheckoutEntryRecovery,
  type EcommerceCheckoutEntryDraft,
  type EcommerceCheckoutEntryRecovery,
  type EcommerceCheckoutEntryRecoverySource,
} from './ecommerce-checkout-entry-recovery'
import {
  commerceOrderAcknowledgement,
  commerceOrderCorrectionExpectation,
  commerceStorefrontOrderTimeline,
  commerceStorefrontRequests,
  createSeedCommerce,
  type CommerceItem,
  type CommerceCorrectionKind,
  type CommerceCorrectionReasonCode,
  type CommerceState,
  type CommerceStorefrontOrderTimelineEntry,
} from '../../core/commerce-workspace'
import type { StorefrontPreview } from './storefront-model'

type EcommerceBuyingWorkspaceProps = {
  cart: EcommerceCartLine[]
  commerceState: CommerceState
  currentCatalog: CommerceItem[]
  disabled: boolean
  onCartChange: (cart: EcommerceCartLine[]) => void
  onOpenShopOrder: (orderId: string) => void
  onDraft: (draft: EcommerceShopDraftV2) => void
  onOpenManagedRequest?: (requestId: string) => void
  onOpenCancellation: (intent: EcommerceCancellationIntent) => void
  onOpenCorrection: (intent: EcommerceCorrectionIntent) => void
  onOpenAmendment: (intent: EcommerceOrderAmendmentIntent) => void
  onOpenReschedule: (intent: EcommerceOrderRescheduleIntent) => void
  onOpenReturns: (intent: EcommerceReturnIntent) => void
  onOpenSupport: (intent: EcommerceSupportIntent) => void
  onRecordManagedRequest?: (
    request: EcommerceBuyingState['requests'][number],
    supersededRequest?: EcommerceBuyingState['requests'][number] | null,
  ) => Promise<void>
  onRecoveryPendingChange: (pending: boolean) => void
  onRequestCurrentChange: (current: boolean) => void
  onRequestStateChange: (state: EcommerceCustomerRequestState) => void
  preview: StorefrontPreview
  scope: string
  sourcePreviewDigest: string
  sourceStorefront: { revision: number; actionId: string } | null
}

type EcommerceCancellationOutcome = {
  intent: EcommerceCancellationIntent
  kind: 'kept' | 'cancelled'
  decidedAt: string
  refundStatus: 'none' | 'due' | 'settled'
}

type EcommerceAmendmentStatus = {
  intent: EcommerceOrderAmendmentIntent
  state: 'waiting_shop_review' | 'replacement_needed' | 'replacement_created' | 'review_required'
  replacementOrderId: string
}

type EcommerceCartQuantityIssues = Record<string, string>

type EcommerceCheckoutEntryRecoveryState = {
  scope: string
  recovery: EcommerceCheckoutEntryRecovery
}

type EcommerceRemovedCartLineNotice = EcommerceRemovedCartLine & Readonly<{
  itemName: string
}>

type EcommerceRescheduleStatus = {
  intent: EcommerceOrderRescheduleIntent
  state: 'waiting_shop_review' | 'replacement_needed' | 'replacement_created' | 'review_required'
  replacementOrderId: string
}

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

function paymentLabel(value: EcommercePaymentAdapter) {
  if (value === 'cash_on_delivery') return 'Cash on delivery'
  if (value === 'kbzpay_manual') return 'KBZPay · Shop confirms'
  return 'Pay on pickup'
}

function receiveOrderLabel(value: EcommerceFulfilment) {
  if (value === 'delivery') return 'Delivery · fee confirmed in Shop'
  return 'Pickup · no delivery fee'
}

function localPromiseInput(value: Date) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

function cartMatchesRequest(cart: EcommerceCartLine[], request: EcommerceBuyingState['requests'][number]) {
  const current = [...cart]
    .sort((left, right) => left.sku.localeCompare(right.sku))
    .map((line) => ({ sku: line.sku, quantity: line.quantity }))
  const quoted = request.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }))
  return JSON.stringify(current) === JSON.stringify(quoted)
}

export function EcommerceBuyingWorkspace({
  cart,
  commerceState,
  currentCatalog,
  disabled,
  onCartChange,
  onOpenShopOrder,
  onDraft,
  onOpenManagedRequest,
  onOpenCancellation,
  onOpenCorrection,
  onOpenAmendment,
  onOpenReschedule,
  onOpenReturns,
  onOpenSupport,
  onRecordManagedRequest,
  onRecoveryPendingChange,
  onRequestCurrentChange,
  onRequestStateChange,
  preview,
  scope,
  sourcePreviewDigest,
  sourceStorefront,
}: EcommerceBuyingWorkspaceProps) {
  const [buyingState, setBuyingState] = useState<EcommerceBuyingState>(() => createEmptyEcommerceBuyingState(scope))
  const [recoveryRead, setRecoveryRead] = useState<{
    scope: string
    status: 'checking' | 'empty' | 'ready' | 'invalid' | 'unavailable'
    issue: string
  }>({ scope, status: 'checking', issue: '' })
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressTownship, setAddressTownship] = useState('')
  const [addressCity, setAddressCity] = useState('Yangon')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [fulfilment, setFulfilment] = useState<EcommerceFulfilment>('pickup')
  const [paymentAdapter, setPaymentAdapter] = useState<EcommercePaymentAdapter>('pay_on_pickup')
  const [promotionCode, setPromotionCode] = useState('')
  const [open, setOpen] = useState(false)
  const [orderHistoryExpanded, setOrderHistoryExpanded] = useState(false)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [handoffBusy, setHandoffBusy] = useState(false)
  const [freshQuoteId, setFreshQuoteId] = useState('')
  const [quoteClock, setQuoteClock] = useState(() => Date.now())
  const [notice, setNotice] = useState('')
  const [cartQuantityDrafts, setCartQuantityDrafts] = useState<Record<string, string>>({})
  const [cartQuantityIssues, setCartQuantityIssues] = useState<EcommerceCartQuantityIssues>({})
  const [removedCartLine, setRemovedCartLine] = useState<EcommerceRemovedCartLineNotice | null>(null)
  const [checkoutEntryRecoveryState, setCheckoutEntryRecoveryState] = useState<EcommerceCheckoutEntryRecoveryState | null>(null)
  const [checkoutEntryRecoveryNotice, setCheckoutEntryRecoveryNotice] = useState('')
  const [checkoutEntryHydratedIdentity, setCheckoutEntryHydratedIdentity] = useState('')
  const [checkoutEntrySourceState, setCheckoutEntrySourceState] = useState<{
    context: {
      scope: string
      commerceState: CommerceState
      currentCatalog: CommerceItem[]
      preview: StorefrontPreview
      buyingState: EcommerceBuyingState
      sourcePreviewDigest: string
      sourceStorefrontRevision: number | null
      sourceStorefrontActionId: string | null
    } | null
    value: EcommerceCheckoutEntryRecoverySource | null
    error: string
  }>({ context: null, value: null, error: '' })
  const [returnDraft, setReturnDraft] = useState<{
    orderId: string
    sku: string
    quantity: string
    disposition: EcommerceReturnDisposition
    reason: string
  } | null>(null)
  const [returnBusy, setReturnBusy] = useState(false)
  const [supportDraft, setSupportDraft] = useState<{
    orderId: string
    category: EcommerceSupportCategory
    description: string
  } | null>(null)
  const [supportBusy, setSupportBusy] = useState(false)
  const [correctionDraft, setCorrectionDraft] = useState<{
    orderId: string
    requestedKind: CommerceCorrectionKind
    reasonCode: CommerceCorrectionReasonCode
    listedAmountMmk: string
    reason: string
  } | null>(null)
  const [correctionBusy, setCorrectionBusy] = useState(false)
  const [cancellationDraft, setCancellationDraft] = useState<{
    orderId: string
    reasonCode: EcommerceCancellationReasonCode
    reason: string
  } | null>(null)
  const [cancellationBusy, setCancellationBusy] = useState(false)
  const [amendmentDraft, setAmendmentDraft] = useState<EcommerceOrderChangeDraft | null>(null)
  const [closedAmendmentDraft, setClosedAmendmentDraft] = useState<EcommerceClosedOrderChangeDraft | null>(null)
  const [amendmentBusy, setAmendmentBusy] = useState(false)
  const [rescheduleDraft, setRescheduleDraft] = useState<EcommerceOrderRescheduleDraft | null>(null)
  const [closedRescheduleDraft, setClosedRescheduleDraft] = useState<EcommerceClosedOrderRescheduleDraft | null>(null)
  const [rescheduleBusy, setRescheduleBusy] = useState(false)
  const requestReceiptRef = useRef<HTMLElement>(null)
  const checkoutSummaryRef = useRef<HTMLElement>(null)
  const checkoutRecoveryActionRef = useRef<HTMLButtonElement>(null)
  const checkoutRecoveryHydrationRef = useRef('')
  const checkoutLastWrittenRecoveryRef = useRef<EcommerceCheckoutEntryRecovery | null>(null)
  const customerNameRef = useRef<HTMLInputElement>(null)
  const cartQuantityRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const cartRemovalUndoRef = useRef<HTMLButtonElement>(null)
  const amendmentOpeningRef = useRef<EcommerceOrderChangeOpening | null>(null)
  const amendmentRecoveryRef = useRef<HTMLButtonElement>(null)
  const amendmentModeRef = useRef<HTMLSelectElement>(null)
  const rescheduleOpeningRef = useRef<EcommerceOrderRescheduleOpening | null>(null)
  const rescheduleRecoveryRef = useRef<HTMLButtonElement>(null)
  const rescheduleDateRef = useRef<HTMLInputElement>(null)
  const samplePaymentPolicies = useMemo(() => createSeedCommerce().paymentPolicies ?? [], [])

  const emptyBuyingState = useMemo(() => createEmptyEcommerceBuyingState(scope), [scope])
  const activeBuyingState = buyingState.scope === scope
    ? {
      ...buyingState,
      correctionIntents: buyingState.correctionIntents ?? [],
      amendmentIntents: buyingState.amendmentIntents ?? [],
      rescheduleIntents: buyingState.rescheduleIntents ?? [],
    }
    : emptyBuyingState
  const recoveryStatus = recoveryRead.scope === scope ? recoveryRead.status : 'checking'
  const recoveryIssue = recoveryRead.scope === scope ? recoveryRead.issue : ''
  const checkoutEntrySourceBuyingState = buyingState.scope === scope ? buyingState : emptyBuyingState
  const sourceStorefrontRevision = sourceStorefront?.revision ?? null
  const sourceStorefrontActionId = sourceStorefront?.actionId ?? null
  const checkoutEntrySourceContext = checkoutEntrySourceState.context
  const checkoutEntrySource = checkoutEntrySourceContext
    && checkoutEntrySourceContext.scope === scope
    && checkoutEntrySourceContext.commerceState === commerceState
    && checkoutEntrySourceContext.currentCatalog === currentCatalog
    && checkoutEntrySourceContext.preview === preview
    && checkoutEntrySourceContext.buyingState === checkoutEntrySourceBuyingState
    && checkoutEntrySourceContext.sourcePreviewDigest === sourcePreviewDigest
    && checkoutEntrySourceContext.sourceStorefrontRevision === sourceStorefrontRevision
    && checkoutEntrySourceContext.sourceStorefrontActionId === sourceStorefrontActionId
    ? checkoutEntrySourceState.value
    : null

  useEffect(() => {
    let current = true
    void readEcommerceBuyingState(scope).then((result) => {
      if (!current) return
      setCartQuantityDrafts({})
      setCartQuantityIssues({})
      setRemovedCartLine(null)
      const recoveredState = result.state ?? createEmptyEcommerceBuyingState(scope)
      setRecoveryRead({ scope, status: result.status, issue: result.error })
      setBuyingState(recoveredState)
      onCartChange([])
      setCustomerName('')
      setCustomerPhone('')
      setAddressLine1('')
      setAddressTownship('')
      setAddressCity('Yangon')
      setDeliveryInstructions('')
      setFulfilment('pickup')
      setPaymentAdapter('pay_on_pickup')
      setPromotionCode('')
      setOpen(false)
      setOrderHistoryExpanded(false)
      setFreshQuoteId('')
      setReturnDraft(null)
      setSupportDraft(null)
      setCorrectionDraft(null)
      setCancellationDraft(null)
      setAmendmentDraft(null)
      setClosedAmendmentDraft(null)
      amendmentOpeningRef.current = null
      setRescheduleDraft(null)
      setClosedRescheduleDraft(null)
      rescheduleOpeningRef.current = null
      setNotice('')
      const latest = recoveredState.requests[0]
      if (!latest || latest.sourcePreviewDigest !== sourcePreviewDigest) return
      let dismissedRequestId: string
      try {
        dismissedRequestId = readEcommerceRequestReceiptDismissal(window.localStorage, scope)
      } catch {
        setNotice('Saved order-receipt recovery needs review. The previous checkout was not restored.')
        return
      }
      if (dismissedRequestId === latest.id) {
        setNotice('Ready for a new order. The previous order remains in Shop history.')
        return
      }
      onCartChange(latest.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
      setCustomerName(latest.customerProfile?.name ?? latest.customerReference)
      setCustomerPhone(latest.customerProfile?.phone ?? '')
      setAddressLine1(latest.deliveryAddress?.line1 ?? '')
      setAddressTownship(latest.deliveryAddress?.township ?? '')
      setAddressCity(latest.deliveryAddress?.city ?? 'Yangon')
      setDeliveryInstructions(latest.deliveryAddress?.instructions ?? '')
      setFulfilment(latest.fulfilment)
      setPaymentAdapter(latest.quote.payment.adapter)
      setPromotionCode(latest.quote.promotion.code ?? '')
      setOpen(true)
      const stillFresh = Date.parse(latest.quote.expiresAt) > Date.now()
      setFreshQuoteId(stillFresh ? latest.id : '')
      setQuoteClock(Date.now())
    })
    return () => { current = false }
  }, [onCartChange, scope, sourcePreviewDigest])

  useEffect(() => {
    if (recoveryStatus === 'checking') return
    let current = true
    void ecommerceCheckoutEntryRecoverySource(scope, {
      commerceState,
      currentCatalog,
      preview,
      buyingState: checkoutEntrySourceBuyingState,
      sourcePreviewDigest,
      sourceStorefront: sourceStorefrontRevision === null || sourceStorefrontActionId === null
        ? null
        : { revision: sourceStorefrontRevision, actionId: sourceStorefrontActionId },
    }).then((value) => {
      if (current) setCheckoutEntrySourceState({
        context: {
          scope,
          commerceState,
          currentCatalog,
          preview,
          buyingState: checkoutEntrySourceBuyingState,
          sourcePreviewDigest,
          sourceStorefrontRevision,
          sourceStorefrontActionId,
        },
        value,
        error: '',
      })
    }).catch(() => {
      if (current) setCheckoutEntrySourceState({
        context: {
          scope,
          commerceState,
          currentCatalog,
          preview,
          buyingState: checkoutEntrySourceBuyingState,
          sourcePreviewDigest,
          sourceStorefrontRevision,
          sourceStorefrontActionId,
        },
        value: null,
        error: 'Unfinished checkout recovery is unavailable on this device.',
      })
    })
    return () => { current = false }
  }, [checkoutEntrySourceBuyingState, commerceState, currentCatalog, preview, recoveryStatus, scope, sourcePreviewDigest, sourceStorefrontActionId, sourceStorefrontRevision])

  useEffect(() => {
    const storageKey = ecommerceBuyingStateStorageKey(scope)
    let current = true
    const refresh = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return
      void readEcommerceBuyingState(scope).then((result) => {
        if (!current) return
        const recoveredState = result.state ?? createEmptyEcommerceBuyingState(scope)
        setRecoveryRead({ scope, status: result.status, issue: result.error })
        setBuyingState(recoveredState)
        const latest = recoveredState.requests[0]
        setFreshQuoteId(latest && Date.parse(latest.quote.expiresAt) > Date.now() ? latest.id : '')
        setQuoteClock(Date.now())
        setNotice(latest
          ? 'Checkout recovery changed in another tab. Review the current receipt.'
          : result.error || 'The saved checkout was cleared in another tab.')
      })
    }
    window.addEventListener('storage', refresh)
    return () => {
      current = false
      window.removeEventListener('storage', refresh)
    }
  }, [scope])

  useEffect(() => {
    if (!removedCartLine) return
    const frame = window.requestAnimationFrame(() => cartRemovalUndoRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [removedCartLine])

  useEffect(() => {
    const latest = activeBuyingState.requests[0]
    if (!latest || latest.id !== freshQuoteId) return
    const remainingMs = Date.parse(latest.quote.expiresAt) - Date.now()
    const timeoutId = window.setTimeout(() => {
      setQuoteClock(Date.now())
      setFreshQuoteId((current) => current === latest.id ? '' : current)
    }, Math.max(0, remainingMs))
    return () => window.clearTimeout(timeoutId)
  }, [activeBuyingState.requests, freshQuoteId])

  useEffect(() => {
    if (!freshQuoteId) return
    const intervalId = window.setInterval(() => setQuoteClock(Date.now()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [freshQuoteId])

  const latestRequest = activeBuyingState.requests[0] ?? null
  const combinedOrderTimeline = useMemo(() => {
    const sharedRequests = commerceStorefrontRequests(commerceState)
    const sharedRequestIds = new Set(sharedRequests.map((request) => request.id))
    const localOnlyRequests = activeBuyingState.requests.filter((request) => !sharedRequestIds.has(request.id))
    return commerceStorefrontOrderTimeline(commerceState, [...sharedRequests, ...localOnlyRequests])
  }, [activeBuyingState.requests, commerceState])
  const latestRequestEntry = latestRequest
    ? combinedOrderTimeline.find((entry) => entry.request.id === latestRequest.id) ?? null
    : null
  const latestRequestOrder = latestRequestEntry?.order ?? null
  const latestRequestCompleted = latestRequestEntry?.stage === 'completed'
  const customerReference = [customerName.trim(), customerPhone.trim()].filter(Boolean).join(' · ')
  const trackedCustomerReference = customerReference || latestRequest?.customerReference || ''
  const replacementRequestIds = new Set([
    ...activeBuyingState.amendmentIntents.map((intent) => intent.replacementRequestId),
    ...activeBuyingState.rescheduleIntents.map((intent) => intent.replacementRequestId),
  ])
  const customerOrderTimeline = combinedOrderTimeline.filter((entry) => (
    trackedCustomerReference && (entry.request.schema === 'supermega.ecommerce.order_request.v2'
      && entry.request.customerProfile?.phone
      ? entry.request.customerProfile.phone === customerPhone.trim()
      : entry.request.customerReference === trackedCustomerReference)
  )).filter((entry) => !replacementRequestIds.has(entry.request.id) || Boolean(entry.order))
  const customerOrderHistoryLimit = Math.min(5, customerOrderTimeline.length)
  const visibleCustomerOrderTimeline = customerOrderTimeline.slice(0, orderHistoryExpanded ? customerOrderHistoryLimit : 1)
  const completedCustomerOrders = customerOrderTimeline.filter((entry) => entry.stage === 'completed' && entry.order?.completion)
  const activeCustomerOrders = customerOrderTimeline.filter((entry) => (
    entry.order && ['confirmed', 'preparing', 'ready'].includes(entry.order.status)
  ))
  const returnDraftEntry = returnDraft
    ? completedCustomerOrders.find((entry) => entry.order?.id === returnDraft.orderId) ?? null
    : null
  const returnDraftLines = returnDraftEntry?.order?.lines?.map((line) => {
    const returned = (returnDraftEntry.order?.returns ?? [])
      .filter((record) => record.sku === line.sku)
      .reduce((total, record) => total + record.quantity, 0)
    return { ...line, remaining: line.quantity - returned }
  }).filter((line) => line.remaining > 0) ?? []
  const returnOutcomes = activeBuyingState.returnIntents.flatMap((intent) => {
    const order = completedCustomerOrders.find((entry) => entry.order?.id === intent.orderId)?.order
    const outcome = order ? projectEcommerceReturnOutcome(intent, order) : null
    return outcome ? [outcome] : []
  })
  const returnOutcomeIntentIds = new Set(returnOutcomes.map((outcome) => outcome.intentId))
  const pendingReturnIntents = activeBuyingState.returnIntents.filter((intent) => (
    !returnOutcomeIntentIds.has(intent.id)
      && completedCustomerOrders.some((entry) => entry.order?.id === intent.orderId)
  ))
  const supportOutcomes = activeBuyingState.supportIntents.flatMap((intent) => {
    const order = completedCustomerOrders.find((entry) => entry.order?.id === intent.orderId)?.order
    const outcome = order ? projectEcommerceSupportOutcome(intent, order) : null
    return outcome ? [outcome] : []
  })
  const supportOutcomeIntentIds = new Set(supportOutcomes.map((outcome) => outcome.intentId))
  const pendingSupportIntents = activeBuyingState.supportIntents.filter((intent) => (
    !supportOutcomeIntentIds.has(intent.id)
      && completedCustomerOrders.some((entry) => entry.order?.id === intent.orderId)
  ))
  const correctionOutcomes = activeBuyingState.correctionIntents.flatMap((intent) => {
    const order = completedCustomerOrders.find((entry) => entry.order?.id === intent.orderId)?.order
    const outcome = order ? projectEcommerceCorrectionOutcome(intent, order) : null
    return outcome ? [outcome] : []
  })
  const correctionOutcomeIntentIds = new Set(correctionOutcomes.map((outcome) => outcome.intentId))
  const pendingCorrectionIntents = activeBuyingState.correctionIntents.filter((intent) => (
    !correctionOutcomeIntentIds.has(intent.id)
      && completedCustomerOrders.some((entry) => entry.order?.id === intent.orderId)
  ))
  const cancellationDecisionByIntentId = new Map(activeBuyingState.cancellationDecisions.map((decision) => [decision.intentId, decision]))
  const pendingCancellationIntents = activeBuyingState.cancellationIntents.filter((intent) => {
    const order = activeCustomerOrders.find((entry) => entry.order?.id === intent.orderId)?.order
    return Boolean(order && order.sourceRecordId === intent.sourceRequestId && !cancellationDecisionByIntentId.has(intent.id))
  })
  const cancellationOutcomes = activeBuyingState.cancellationIntents.reduce<EcommerceCancellationOutcome[]>((outcomes, intent) => {
    const entry = customerOrderTimeline.find((candidate) => candidate.order?.id === intent.orderId)
    const decision = cancellationDecisionByIntentId.get(intent.id)
    if (decision && entry?.order?.sourceRecordId === intent.sourceRequestId) {
      outcomes.push({ intent, kind: 'kept', decidedAt: decision.createdAt, refundStatus: 'none' })
      return outcomes
    }
    const acknowledgement = entry?.order ? commerceOrderAcknowledgement(commerceState, entry.order.id) : null
    if (acknowledgement?.cancellation.state === 'cancelled'
      && acknowledgement.evidence.sourceRecordId === intent.sourceRequestId
      && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) {
      outcomes.push({ intent, kind: 'cancelled', decidedAt: acknowledgement.cancellation.cancelledAt ?? entry?.order?.createdAt ?? intent.createdAt, refundStatus: acknowledgement.payment.refundStatus })
    }
    return outcomes
  }, [])
  const customerSourceRequestIds = new Set(customerOrderTimeline.map((entry) => entry.request.id))
  const amendmentStatuses = activeBuyingState.amendmentIntents.filter((intent) => customerSourceRequestIds.has(intent.sourceRequestId)).reduce<EcommerceAmendmentStatus[]>((statuses, intent) => {
    const originalEntry = customerOrderTimeline.find((entry) => entry.order?.id === intent.orderId)
    const replacementEntry = combinedOrderTimeline.find((entry) => entry.request.id === intent.replacementRequestId)
    if (replacementEntry?.order) {
      statuses.push({ intent, state: 'replacement_created', replacementOrderId: replacementEntry.order.id })
      return statuses
    }
    const acknowledgement = originalEntry?.order ? commerceOrderAcknowledgement(commerceState, originalEntry.order.id) : null
    if (acknowledgement?.cancellation.state === 'cancelled'
      && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) {
      statuses.push({ intent, state: 'replacement_needed', replacementOrderId: '' })
      return statuses
    }
    if (acknowledgement?.status === 'confirmed'
      && acknowledgement.digest === intent.sourceAcknowledgementDigest
      && acknowledgement.payment.status === 'pending'
      && acknowledgement.cancellation.state === 'not_cancelled') {
      statuses.push({ intent, state: 'waiting_shop_review', replacementOrderId: '' })
      return statuses
    }
    statuses.push({ intent, state: 'review_required', replacementOrderId: '' })
    return statuses
  }, [])
  const pendingAmendmentIntents = amendmentStatuses.filter((status) => status.state !== 'replacement_created')
  const rescheduleStatuses = activeBuyingState.rescheduleIntents.filter((intent) => customerSourceRequestIds.has(intent.sourceRequestId)).reduce<EcommerceRescheduleStatus[]>((statuses, intent) => {
    const originalEntry = customerOrderTimeline.find((entry) => entry.order?.id === intent.orderId)
    const replacementEntry = combinedOrderTimeline.find((entry) => entry.request.id === intent.replacementRequestId)
    if (replacementEntry?.order) {
      statuses.push({ intent, state: 'replacement_created', replacementOrderId: replacementEntry.order.id })
      return statuses
    }
    const acknowledgement = originalEntry?.order ? commerceOrderAcknowledgement(commerceState, originalEntry.order.id) : null
    if (acknowledgement?.cancellation.state === 'cancelled'
      && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) {
      statuses.push({ intent, state: 'replacement_needed', replacementOrderId: '' })
      return statuses
    }
    if (acknowledgement?.status === 'confirmed'
      && acknowledgement.digest === intent.sourceAcknowledgementDigest
      && acknowledgement.payment.status === 'pending'
      && acknowledgement.cancellation.state === 'not_cancelled') {
      statuses.push({ intent, state: 'waiting_shop_review', replacementOrderId: '' })
      return statuses
    }
    statuses.push({ intent, state: 'review_required', replacementOrderId: '' })
    return statuses
  }, [])
  const pendingRescheduleIntents = rescheduleStatuses.filter((status) => status.state !== 'replacement_created')
  const orderChangeConflictIds = [
    ...activeBuyingState.amendmentIntents.map((intent) => intent.orderId),
    ...activeBuyingState.rescheduleIntents.map((intent) => intent.orderId),
    ...activeBuyingState.cancellationIntents.map((intent) => intent.orderId),
  ]
  const pendingOrderHelpCount = pendingAmendmentIntents.length + pendingRescheduleIntents.length
    + pendingCancellationIntents.length + pendingReturnIntents.length + pendingSupportIntents.length
    + pendingCorrectionIntents.length
  const orderChangeRecovery = closedAmendmentDraft
    ? recoverEcommerceOrderChangeDraft(null, closedAmendmentDraft, activeCustomerOrders, orderChangeConflictIds)
    : null
  const recoverableOrderChangeId = orderChangeRecovery?.ok ? orderChangeRecovery.draft.orderId : ''
  useEffect(() => {
    if (!recoverableOrderChangeId) return
    const frame = window.requestAnimationFrame(() => amendmentRecoveryRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [closedAmendmentDraft, recoverableOrderChangeId])
  const rescheduleRecovery = closedRescheduleDraft
    ? recoverEcommerceOrderRescheduleDraft(null, closedRescheduleDraft, activeCustomerOrders, orderChangeConflictIds)
    : null
  const recoverableRescheduleId = rescheduleRecovery?.ok ? rescheduleRecovery.draft.orderId : ''
  useEffect(() => {
    if (!recoverableRescheduleId) return
    const frame = window.requestAnimationFrame(() => rescheduleRecoveryRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [closedRescheduleDraft, recoverableRescheduleId])
  const orderHelpDraftOpen = Boolean(amendmentDraft || rescheduleDraft || cancellationDraft || returnDraft || supportDraft || correctionDraft)
  const showOrderHelpActions = !orderHelpDraftOpen
  const orderHelpOpen = orderHelpDraftOpen || Boolean(orderChangeRecovery?.ok || rescheduleRecovery?.ok)
  const cartItems = useMemo(() => cart.map((line) => ({
    ...line,
    item: preview.items.find((item) => item.sku === line.sku),
    quantityLimit: Math.min(99, Math.max(0, currentCatalog.find((item) => item.sku === line.sku)?.onHand ?? 0)),
  })), [cart, currentCatalog, preview.items])
  const firstCartQuantityIssueSku = cart.find((line) => Boolean(cartQuantityIssues[line.sku]))?.sku ?? ''
  const cartHasQuantityIssue = Boolean(firstCartQuantityIssueSku)
  const cartTotal = cartItems.reduce((total, line) => (
    total + (line.item?.unitPriceMmk ?? 0) * line.quantity
  ), 0)
  const configuredPaymentPolicies = commerceState.paymentPolicies ?? []
  const configuredPaymentAdapters = ecommerceAvailablePaymentAdapters(
    configuredPaymentPolicies,
    fulfilment,
    Math.max(1, cartTotal),
    new Date(quoteClock).toISOString(),
  )
  const usingSamplePaymentFallback = !onRecordManagedRequest
    && configuredPaymentPolicies.length === 0
    && configuredPaymentAdapters.length === 0
  const checkoutPaymentPolicies = usingSamplePaymentFallback ? samplePaymentPolicies : configuredPaymentPolicies
  const availablePaymentAdapters = usingSamplePaymentFallback
    ? ecommerceAvailablePaymentAdapters(
        checkoutPaymentPolicies,
        fulfilment,
        Math.max(1, cartTotal),
        new Date(quoteClock).toISOString(),
      )
    : configuredPaymentAdapters
  const effectivePaymentAdapter = availablePaymentAdapters.includes(paymentAdapter)
    ? paymentAdapter
    : availablePaymentAdapters[0] ?? paymentAdapter
  const paymentPolicyReady = availablePaymentAdapters.includes(effectivePaymentAdapter)
  const latestRequestCheckoutMatches = Boolean(latestRequest
    && latestRequest.scope === scope
    && latestRequest.sourcePreviewDigest === sourcePreviewDigest
    && latestRequest.sourceStorefrontRevision === (sourceStorefront?.revision ?? null)
    && latestRequest.sourceStorefrontActionId === (sourceStorefront?.actionId ?? null)
    && latestRequest.customerReference === customerReference
    && (!latestRequest.customerProfile || latestRequest.customerProfile.name === customerName.trim())
    && (!latestRequest.customerProfile || latestRequest.customerProfile.phone === customerPhone.trim())
    && (latestRequest.fulfilment !== 'delivery' || Boolean(latestRequest.deliveryAddress
      && latestRequest.deliveryAddress.line1 === addressLine1.trim()
      && latestRequest.deliveryAddress.township === addressTownship.trim()
      && latestRequest.deliveryAddress.city === addressCity.trim()
      && (latestRequest.deliveryAddress.instructions ?? '') === deliveryInstructions.trim()))
    && latestRequest.fulfilment === fulfilment
    && latestRequest.quote.payment.adapter === effectivePaymentAdapter
    && (latestRequest.quote.promotion.code ?? '') === promotionCode.trim()
    && !cartHasQuantityIssue
    && cartMatchesRequest(cart, latestRequest))
  const quoteCurrent = Boolean(latestRequestCheckoutMatches && latestRequest?.id === freshQuoteId)
  const customerRequestState = deriveEcommerceCustomerRequestState({
    checkoutMatches: latestRequestCheckoutMatches,
    hasConfirmedOrder: Boolean(latestRequestOrder),
    hasRequest: Boolean(latestRequest),
    now: quoteClock,
    quoteExpiresAt: latestRequest?.quote.expiresAt ?? null,
  })
  const quoteNextAction = ecommerceQuoteNextAction(
    customerRequestState,
    cart.reduce((total, line) => total + line.quantity, 0),
  )
  const replacingCurrentRequest = Boolean(latestRequest && !latestRequestOrder && quoteNextAction)
  const latestRequestConfirmed = Boolean(latestRequestOrder && quoteCurrent)
  useEffect(() => {
    onRequestStateChange(customerRequestState)
    onRequestCurrentChange(latestRequestConfirmed)
  }, [customerRequestState, latestRequestConfirmed, onRequestCurrentChange, onRequestStateChange])
  const checkoutEntryDraftInput = {
    lines: cart.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      quantityDraft: cartQuantityDrafts[line.sku] ?? String(line.quantity),
    })),
    removedCartLine: removedCartLine ? {
      line: { ...removedCartLine.line },
      index: removedCartLine.index,
      itemName: removedCartLine.itemName,
    } : null,
    customerName,
    customerPhone,
    addressLine1,
    addressTownship,
    addressCity,
    deliveryInstructions,
    fulfilment,
    paymentAdapter,
    promotionCode,
  }
  const checkoutEntryHasMeaningfulDraft = ecommerceCheckoutEntryDraftHasContent(checkoutEntryDraftInput)
  let currentCheckoutEntryDraft: EcommerceCheckoutEntryDraft | null = null
  if (checkoutEntryHasMeaningfulDraft) {
    try {
      currentCheckoutEntryDraft = ecommerceCheckoutEntryDraft(checkoutEntryDraftInput)
    } catch {
      currentCheckoutEntryDraft = null
    }
  }
  const checkoutEntryMatchesLatestRequest = Boolean(currentCheckoutEntryDraft
    && latestRequest
    && !currentCheckoutEntryDraft.removedCartLine
    && latestRequest.scope === scope
    && latestRequest.sourcePreviewDigest === sourcePreviewDigest
    && latestRequest.sourceStorefrontRevision === (sourceStorefront?.revision ?? null)
    && latestRequest.sourceStorefrontActionId === (sourceStorefront?.actionId ?? null)
    && currentCheckoutEntryDraft.lines.every((line) => line.quantityDraft === String(line.quantity))
    && cartMatchesRequest(currentCheckoutEntryDraft.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })), latestRequest)
    && currentCheckoutEntryDraft.customerName === (latestRequest.customerProfile?.name ?? latestRequest.customerReference)
    && currentCheckoutEntryDraft.customerPhone === (latestRequest.customerProfile?.phone ?? '')
    && currentCheckoutEntryDraft.fulfilment === latestRequest.fulfilment
    && currentCheckoutEntryDraft.paymentAdapter === latestRequest.quote.payment.adapter
    && currentCheckoutEntryDraft.promotionCode === (latestRequest.quote.promotion.code ?? '')
    && (latestRequest.fulfilment === 'delivery'
      ? Boolean(latestRequest.deliveryAddress
        && currentCheckoutEntryDraft.addressLine1 === latestRequest.deliveryAddress.line1
        && currentCheckoutEntryDraft.addressTownship === latestRequest.deliveryAddress.township
        && currentCheckoutEntryDraft.addressCity === latestRequest.deliveryAddress.city
        && currentCheckoutEntryDraft.deliveryInstructions === (latestRequest.deliveryAddress.instructions ?? ''))
      : !currentCheckoutEntryDraft.addressLine1
        && !currentCheckoutEntryDraft.addressTownship
        && currentCheckoutEntryDraft.addressCity === 'Yangon'
        && !currentCheckoutEntryDraft.deliveryInstructions))
  const checkoutEntryDraftJson = currentCheckoutEntryDraft ? JSON.stringify(currentCheckoutEntryDraft) : ''
  const checkoutEntrySourceIdentity = checkoutEntrySource ? JSON.stringify(checkoutEntrySource) : ''
  const checkoutEntryHydrationIdentity = checkoutEntrySource
    ? `${scope}|${checkoutEntrySource.stateDigest}`
    : ''
  const activeCheckoutEntryRecovery = checkoutEntryRecoveryState?.scope === scope
    ? checkoutEntryRecoveryState.recovery
    : null
  const checkoutEntryRecoveryReview = activeCheckoutEntryRecovery && checkoutEntrySource
    ? reviewEcommerceCheckoutEntryRecovery(
        activeCheckoutEntryRecovery,
        scope,
        checkoutEntrySource,
        currentCatalog,
        preview,
      )
    : null
  const hasCheckoutEntryRecovery = Boolean(activeCheckoutEntryRecovery)
  const hasActiveCheckoutEntryDraft = Boolean(
    checkoutEntrySource
    && currentCheckoutEntryDraft
    && !checkoutEntryMatchesLatestRequest
    && !hasCheckoutEntryRecovery
    && (recoveryStatus === 'empty' || recoveryStatus === 'ready'),
  )

  useEffect(() => {
    if (!checkoutEntryHydrationIdentity || !checkoutEntrySource) return
    if (checkoutRecoveryHydrationRef.current === checkoutEntryHydrationIdentity
      && checkoutEntryHydratedIdentity === checkoutEntryHydrationIdentity) return
    checkoutRecoveryHydrationRef.current = checkoutEntryHydrationIdentity
    setCheckoutEntryHydratedIdentity('')
    const timer = window.setTimeout(() => {
      try {
        const key = ecommerceCheckoutEntryRecoveryStorageKey(scope)
        const raw = window.localStorage.getItem(key)
        const restored = raw ? restoreEcommerceCheckoutEntryRecovery(raw) : null
        if (raw && !restored) window.localStorage.removeItem(key)
        checkoutLastWrittenRecoveryRef.current = null
        setCheckoutEntryRecoveryState(restored ? { scope, recovery: restored } : null)
        setCheckoutEntryHydratedIdentity(checkoutEntryHydrationIdentity)
        if (restored) requestAnimationFrame(() => checkoutRecoveryActionRef.current?.focus({ preventScroll: true }))
      } catch {
        setCheckoutEntryRecoveryState(null)
        setCheckoutEntryHydratedIdentity(checkoutEntryHydrationIdentity)
        setCheckoutEntryRecoveryNotice('Checkout recovery is unavailable. Finish or clear this checkout before leaving.')
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [checkoutEntryHydratedIdentity, checkoutEntryHydrationIdentity, checkoutEntrySource, scope])

  useEffect(() => {
    if (!checkoutEntrySourceIdentity
      || !checkoutEntryDraftJson
      || !hasActiveCheckoutEntryDraft
      || checkoutEntryHydratedIdentity !== checkoutEntryHydrationIdentity) return
    const timer = window.setTimeout(() => {
      try {
        const sourceForPersistence = JSON.parse(checkoutEntrySourceIdentity) as EcommerceCheckoutEntryRecoverySource
        const draftForPersistence = JSON.parse(checkoutEntryDraftJson) as EcommerceCheckoutEntryDraft
        const key = ecommerceCheckoutEntryRecoveryStorageKey(scope)
        const raw = window.localStorage.getItem(key)
        const retained = raw ? restoreEcommerceCheckoutEntryRecovery(raw) : null
        const lastWritten = checkoutLastWrittenRecoveryRef.current
        if (retained && (!lastWritten || !ecommerceCheckoutEntryRecoveriesMatch(retained, lastWritten))) {
          setCheckoutEntryRecoveryState({ scope, recovery: retained })
          setCheckoutEntryRecoveryNotice('Another tab has an unfinished checkout. Resume or discard it before replacing it.')
          requestAnimationFrame(() => checkoutRecoveryActionRef.current?.focus({ preventScroll: true }))
          return
        }
        const next = createEcommerceCheckoutEntryRecovery(scope, sourceForPersistence, draftForPersistence)
        window.localStorage.setItem(key, JSON.stringify(next))
        checkoutLastWrittenRecoveryRef.current = next
        setCheckoutEntryRecoveryNotice('')
      } catch {
        setCheckoutEntryRecoveryNotice('This checkout stays in this tab. Send or clear it before leaving Ecommerce.')
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [checkoutEntryDraftJson, checkoutEntryHydratedIdentity, checkoutEntryHydrationIdentity, checkoutEntrySourceIdentity, hasActiveCheckoutEntryDraft, scope])

  useEffect(() => {
    if (hasActiveCheckoutEntryDraft || hasCheckoutEntryRecovery) return
    const lastWritten = checkoutLastWrittenRecoveryRef.current
    if (!lastWritten) return
    const timer = window.setTimeout(() => {
      try {
        const key = ecommerceCheckoutEntryRecoveryStorageKey(scope)
        const raw = window.localStorage.getItem(key)
        const current = raw ? restoreEcommerceCheckoutEntryRecovery(raw) : null
        if (current && ecommerceCheckoutEntryRecoveriesMatch(current, lastWritten)) window.localStorage.removeItem(key)
        checkoutLastWrittenRecoveryRef.current = null
      } catch {
        setCheckoutEntryRecoveryNotice('The cleared checkout recovery could not be removed from this device.')
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [hasActiveCheckoutEntryDraft, hasCheckoutEntryRecovery, scope])

  useEffect(() => {
    const recoveryKey = ecommerceCheckoutEntryRecoveryStorageKey(scope)
    function refreshCheckoutEntryRecovery(event: StorageEvent) {
      if (event.key !== recoveryKey && event.key !== null) return
      try {
        const raw = window.localStorage.getItem(recoveryKey)
        const restored = raw ? restoreEcommerceCheckoutEntryRecovery(raw) : null
        checkoutLastWrittenRecoveryRef.current = null
        setCheckoutEntryRecoveryState(restored ? { scope, recovery: restored } : null)
        if (restored) {
          setCheckoutEntryRecoveryNotice('The unfinished checkout changed in another tab. Review it before continuing.')
          requestAnimationFrame(() => checkoutRecoveryActionRef.current?.focus({ preventScroll: true }))
        }
      } catch {
        setCheckoutEntryRecoveryState(null)
      }
    }
    window.addEventListener('storage', refreshCheckoutEntryRecovery)
    return () => window.removeEventListener('storage', refreshCheckoutEntryRecovery)
  }, [scope])

  useEffect(() => {
    onRecoveryPendingChange(hasCheckoutEntryRecovery)
    return () => onRecoveryPendingChange(false)
  }, [hasCheckoutEntryRecovery, onRecoveryPendingChange])

  const recoveryBlocked = recoveryStatus !== 'empty' && recoveryStatus !== 'ready'
  const recoveredCheckoutNotice = latestRequest
    ? Date.parse(latestRequest.quote.expiresAt) > quoteClock
      ? `${latestRequest.id} recovered on this device. It remains waiting for Shop review.`
      : `${latestRequest.id} was recovered, but its quote expired. Review a new total.`
    : ''
  const checkoutNotice = firstCartQuantityIssueSku
    ? cartQuantityIssues[firstCartQuantityIssueSku]
    : latestRequestConfirmed && latestRequestOrder
    ? `${latestRequest?.id} is confirmed as ${latestRequestOrder.id}. ${latestRequestEntry?.paymentStatus === 'reconciled' ? 'Payment is reconciled in Shop.' : 'Payment still needs Shop reconciliation.'}`
    : notice || checkoutEntryRecoveryNotice || checkoutEntrySourceState.error || (latestRequestOrder
      ? `${latestRequest?.id} is already confirmed as ${latestRequestOrder.id}. Review a new total only to start another order.`
      : recoveredCheckoutNotice || recoveryIssue || (cart.length
        ? 'Review the cart. Shop controls order and payment actions.'
        : 'Add a product to begin.'))

  function checkoutEntryRecoveryIsCurrent(target: EcommerceCheckoutEntryRecoveryState) {
    try {
      const raw = window.localStorage.getItem(ecommerceCheckoutEntryRecoveryStorageKey(target.scope))
      const current = raw ? restoreEcommerceCheckoutEntryRecovery(raw) : null
      if (current && ecommerceCheckoutEntryRecoveriesMatch(current, target.recovery)) return true
      checkoutLastWrittenRecoveryRef.current = null
      setCheckoutEntryRecoveryState(current ? { scope: target.scope, recovery: current } : null)
      setCheckoutEntryRecoveryNotice(current
        ? 'Another tab changed this checkout. Review the newer recovery before continuing.'
        : 'This checkout was already resolved in another tab.')
    } catch {
      setCheckoutEntryRecoveryNotice('Checkout recovery could not be checked. No request, payment, or stock change was created.')
    }
    return false
  }

  function clearCheckoutEntryRecovery(target = checkoutEntryRecoveryState) {
    if (!target) return true
    if (!checkoutEntryRecoveryIsCurrent(target)) return false
    try {
      window.localStorage.removeItem(ecommerceCheckoutEntryRecoveryStorageKey(target.scope))
    } catch {
      setCheckoutEntryRecoveryNotice('Checkout recovery could not be removed. No request, payment, or stock change was created.')
      return false
    }
    checkoutLastWrittenRecoveryRef.current = null
    if (checkoutEntryRecoveryState === target) setCheckoutEntryRecoveryState(null)
    return true
  }

  function clearMatchingCheckoutEntryRecovery(
    draft = currentCheckoutEntryDraft,
    source = checkoutEntrySource,
  ) {
    if (!draft || !source) return
    try {
      const key = ecommerceCheckoutEntryRecoveryStorageKey(scope)
      const raw = window.localStorage.getItem(key)
      const current = raw ? restoreEcommerceCheckoutEntryRecovery(raw) : null
      if (current && ecommerceCheckoutEntryRecoveryMatchesDraft(current, scope, source, draft)) {
        window.localStorage.removeItem(key)
        checkoutLastWrittenRecoveryRef.current = null
      }
    } catch {
      // A retained or newer source-bound recovery cannot create an Ecommerce request.
    }
  }

  function quantityIssueForDraft(draft: string, itemName: string, quantityLimit: number) {
    const quantity = Number(draft)
    if (quantityLimit < 1) return `${itemName} is no longer available. Remove this line to continue. Your cart and checkout are unchanged.`
    if (!draft.trim() || !Number.isSafeInteger(quantity) || quantity < 1) {
      return `Enter a whole number from 1 to ${quantityLimit} for ${itemName}. Your cart and checkout are unchanged.`
    }
    if (quantity > quantityLimit) {
      return `Only ${quantityLimit} ${quantityLimit === 1 ? 'unit is' : 'units are'} available for ${itemName}. Your cart and checkout are unchanged.`
    }
    return ''
  }

  function resumeCheckoutEntryRecovery() {
    const target = checkoutEntryRecoveryState
    if (!target
      || target.scope !== scope
      || !activeCheckoutEntryRecovery
      || !checkoutEntryRecoveryReview?.ok) {
      setCheckoutEntryRecoveryNotice('This checkout cannot resume because the storefront, catalog, or Shop record changed. Discard it to continue.')
      return
    }
    if (!checkoutEntryRecoveryIsCurrent(target)) return
    const recovered = checkoutEntryRecoveryReview.draft
    const quantityDrafts = Object.fromEntries(recovered.lines.map((line) => [line.sku, line.quantityDraft]))
    const quantityIssues = Object.fromEntries(recovered.lines.flatMap((line) => {
      const item = preview.items.find((candidate) => candidate.sku === line.sku)
      const quantityLimit = Math.min(99, Math.max(0, currentCatalog.find((candidate) => candidate.sku === line.sku)?.onHand ?? 0))
      const issue = quantityIssueForDraft(line.quantityDraft, item?.name ?? line.sku, quantityLimit)
      return issue ? [[line.sku, issue]] : []
    }))
    onCartChange(recovered.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
    setCartQuantityDrafts(quantityDrafts)
    setCartQuantityIssues(quantityIssues)
    setRemovedCartLine(recovered.removedCartLine ? {
      line: { ...recovered.removedCartLine.line },
      index: recovered.removedCartLine.index,
      itemName: recovered.removedCartLine.itemName,
    } : null)
    setCustomerName(recovered.customerName)
    setCustomerPhone(recovered.customerPhone)
    setAddressLine1(recovered.addressLine1)
    setAddressTownship(recovered.addressTownship)
    setAddressCity(recovered.addressCity)
    setDeliveryInstructions(recovered.deliveryInstructions)
    setFulfilment(recovered.fulfilment)
    setPaymentAdapter(recovered.paymentAdapter)
    setPromotionCode(recovered.promotionCode)
    setOpen(true)
    setFreshQuoteId('')
    checkoutLastWrittenRecoveryRef.current = target.recovery
    setCheckoutEntryRecoveryState(null)
    setCheckoutEntryRecoveryNotice('Unfinished checkout resumed. No request, order, payment, stock, or message changed.')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const firstIssueSku = recovered.lines.find((line) => Boolean(quantityIssues[line.sku]))?.sku
      const focusTarget = recovered.removedCartLine
        ? cartRemovalUndoRef.current
        : firstIssueSku
          ? cartQuantityRefs.current[firstIssueSku]
          : customerNameRef.current
      focusTarget?.scrollIntoView({ block: 'center' })
      focusTarget?.focus({ preventScroll: true })
      if (focusTarget instanceof HTMLInputElement) focusTarget.select()
    }))
  }

  function discardCheckoutEntryRecovery() {
    if (!activeCheckoutEntryRecovery) return
    if (!clearCheckoutEntryRecovery()) return
    setCartQuantityDrafts({})
    setCartQuantityIssues({})
    setRemovedCartLine(null)
    onCartChange([])
    setCustomerName('')
    setCustomerPhone('')
    setAddressLine1('')
    setAddressTownship('')
    setAddressCity('Yangon')
    setDeliveryInstructions('')
    setFulfilment('pickup')
    setPaymentAdapter('pay_on_pickup')
    setPromotionCode('')
    setOpen(false)
    setFreshQuoteId('')
    setCheckoutEntryRecoveryNotice('Unfinished checkout discarded. No request, order, payment, stock, or message changed.')
    requestAnimationFrame(() => requestAnimationFrame(() => checkoutSummaryRef.current?.focus({ preventScroll: true })))
  }

  function focusCartQuantity(sku: string) {
    requestAnimationFrame(() => {
      const input = cartQuantityRefs.current[sku]
      if (!input) return
      input.scrollIntoView({ block: 'center' })
      input.focus({ preventScroll: true })
      input.select()
    })
  }

  function updateCart(sku: string, draft: string, itemName: string, quantityLimit: number) {
    setCartQuantityDrafts((current) => ({ ...current, [sku]: draft }))
    const quantity = Number(draft)
    const issue = quantityIssueForDraft(draft, itemName, quantityLimit)
    if (issue) {
      setCartQuantityIssues((current) => ({ ...current, [sku]: issue }))
      setNotice(issue)
      return
    }
    setCartQuantityIssues((current) => {
      if (!current[sku]) return current
      const next = { ...current }
      delete next[sku]
      return next
    })
    onCartChange(cart.map((line) => line.sku === sku ? { ...line, quantity } : line))
    setNotice(`Quantity updated to ${quantity}. Your checkout details are still here; review a new total before Shop review.`)
  }

  function removeFromCart(sku: string) {
    const index = cart.findIndex((line) => line.sku === sku)
    if (index < 0) return
    const line = cart[index]
    const itemName = preview.items.find((item) => item.sku === sku)?.name ?? sku
    setRemovedCartLine({ line: { ...line }, index, itemName })
    setCartQuantityDrafts((current) => {
      const next = { ...current }
      delete next[sku]
      return next
    })
    setCartQuantityIssues((current) => {
      const next = { ...current }
      delete next[sku]
      return next
    })
    onCartChange(cart.filter((line) => line.sku !== sku))
    setFreshQuoteId('')
    setNotice(`${itemName} removed. Undo is available; your checkout details are still here. No quote, Shop request, payment, or stock changed.`)
  }

  function undoCartRemoval() {
    if (!removedCartLine) return
    const recovery = recoverEcommerceCartRemoval(cart, removedCartLine, currentCatalog)
    if (!recovery.ok) {
      if (recovery.reason === 'already_present') {
        setRemovedCartLine(null)
        setNotice(`${removedCartLine.itemName} is already in the cart. Nothing else changed.`)
        return
      }
      if (recovery.reason === 'insufficient_stock') {
        setNotice(`Cannot restore ${removedCartLine.line.quantity} ${recovery.available === 1 ? 'unit' : 'units'} of ${removedCartLine.itemName}; only ${recovery.available} available now. The item stays removed and your checkout details are unchanged. No quote or Shop request was created.`)
        return
      }
      setRemovedCartLine(null)
      setNotice('Line recovery failed. Nothing was restored or sent.')
      return
    }
    onCartChange(recovery.cart)
    setCartQuantityDrafts((current) => ({ ...current, [removedCartLine.line.sku]: String(removedCartLine.line.quantity) }))
    setCartQuantityIssues((current) => {
      if (!current[removedCartLine.line.sku]) return current
      const next = { ...current }
      delete next[removedCartLine.line.sku]
      return next
    })
    setFreshQuoteId('')
    setRemovedCartLine(null)
    setNotice(`${removedCartLine.itemName} restored at quantity ${removedCartLine.line.quantity}. Your checkout details are still here; review a new total. No quote, Shop request, payment, or stock changed.`)
    requestAnimationFrame(() => focusCartQuantity(removedCartLine.line.sku))
  }

  function beginAnotherOrder() {
    if (latestRequest && latestRequestOrder) {
      try {
        saveEcommerceRequestReceiptDismissal(window.localStorage, scope, latestRequest.id)
      } catch {
        setNotice('The previous order receipt could not be closed safely. Nothing was cleared; try again before entering another customer order.')
        return
      }
    }
    clearMatchingCheckoutEntryRecovery()
    expireOrderChangeRecovery()
    setCartQuantityDrafts({})
    setCartQuantityIssues({})
    setRemovedCartLine(null)
    onCartChange([])
    setCustomerName('')
    setCustomerPhone('')
    setAddressLine1('')
    setAddressTownship('')
    setAddressCity('Yangon')
    setDeliveryInstructions('')
    setFulfilment('pickup')
    setPaymentAdapter('pay_on_pickup')
    setPromotionCode('')
    setOpen(false)
    setFreshQuoteId('')
    setNotice('Ready for a new order. The previous order remains in Shop history.')
  }

  function changeFulfilment(next: EcommerceFulfilment) {
    const reviewedAt = new Date().toISOString()
    const configuredNextPaymentAdapters = ecommerceAvailablePaymentAdapters(
      configuredPaymentPolicies,
      next,
      Math.max(1, cartTotal),
      reviewedAt,
    )
    const nextPaymentAdapters = !onRecordManagedRequest && configuredNextPaymentAdapters.length === 0
      ? ecommerceAvailablePaymentAdapters(samplePaymentPolicies, next, Math.max(1, cartTotal), reviewedAt)
      : configuredNextPaymentAdapters
    setFulfilment(next)
    setPaymentAdapter((current) => nextPaymentAdapters.includes(current)
      ? current
      : nextPaymentAdapters[0] ?? (next === 'delivery' ? 'cash_on_delivery' : 'pay_on_pickup'))
  }

  function reorder(entry: CommerceStorefrontOrderTimelineEntry) {
    const requestedLines = entry.request.schema === 'supermega.ecommerce.order_request.v2'
      ? entry.request.lines
      : [entry.request.line]
    const nextCart = requestedLines.flatMap((line) => {
      const item = currentCatalog.find((candidate) => candidate.sku === line.sku)
      return item && item.onHand >= line.quantity ? [{ sku: line.sku, quantity: line.quantity }] : []
    })
    const blockedCount = requestedLines.length - nextCart.length
    if (!nextCart.length) {
      setNotice('That order cannot be reordered from current stock. Nothing changed.')
      return
    }
    expireOrderChangeRecovery()
    setCartQuantityDrafts({})
    setCartQuantityIssues({})
    setRemovedCartLine(null)
    onCartChange(nextCart)
    setCustomerName(entry.request.schema === 'supermega.ecommerce.order_request.v2' ? entry.request.customerProfile?.name ?? entry.request.customerReference : entry.request.customerReference)
    setCustomerPhone(entry.request.schema === 'supermega.ecommerce.order_request.v2' ? entry.request.customerProfile?.phone ?? '' : '')
    setAddressLine1(entry.request.schema === 'supermega.ecommerce.order_request.v2' ? entry.request.deliveryAddress?.line1 ?? '' : '')
    setAddressTownship(entry.request.schema === 'supermega.ecommerce.order_request.v2' ? entry.request.deliveryAddress?.township ?? '' : '')
    setAddressCity(entry.request.schema === 'supermega.ecommerce.order_request.v2' ? entry.request.deliveryAddress?.city ?? 'Yangon' : 'Yangon')
    setDeliveryInstructions(entry.request.schema === 'supermega.ecommerce.order_request.v2' ? entry.request.deliveryAddress?.instructions ?? '' : '')
    changeFulfilment(entry.request.fulfilment)
    setPromotionCode('')
    setFreshQuoteId('')
    setOpen(true)
    setNotice(blockedCount
      ? `${nextCart.length} available line${nextCart.length === 1 ? '' : 's'} added at current prices; ${blockedCount} unavailable line${blockedCount === 1 ? '' : 's'} skipped. Review a new quote.`
      : 'Items added at current prices. Review a new quote.')
  }

  function orderStageLabel(entry: CommerceStorefrontOrderTimelineEntry) {
    if (entry.stage === 'waiting_shop_review') return quoteExpiredWithoutOrder(entry) ? 'Quote expired' : 'Waiting for Shop review'
    if (entry.stage === 'superseded') return 'Replaced'
    if (entry.stage === 'confirmed') return 'Confirmed'
    if (entry.stage === 'preparing') return 'Preparing'
    if (entry.stage === 'ready') return entry.request.fulfilment === 'pickup' ? 'Ready for pickup' : 'Ready for delivery'
    if (entry.stage === 'completed') return 'Completed'
    return 'Cancelled'
  }

  function quoteExpiredWithoutOrder(entry: CommerceStorefrontOrderTimelineEntry) {
    return !entry.order && 'quote' in entry.request && Date.parse(entry.request.quote.expiresAt) <= quoteClock
  }

  function expireOrderChangeRecovery() {
    setClosedAmendmentDraft(null)
    amendmentOpeningRef.current = null
    setClosedRescheduleDraft(null)
    rescheduleOpeningRef.current = null
  }

  function openReturnRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    const lines = order?.lines?.map((line) => {
      const returned = (order.returns ?? [])
        .filter((record) => record.sku === line.sku)
        .reduce((total, record) => total + record.quantity, 0)
      return { ...line, remaining: line.quantity - returned }
    }).filter((line) => line.remaining > 0) ?? []
    if (!order?.completion || order.status !== 'completed' || !lines.length) {
      setNotice('This order has no attributable sold quantity left to request a return for.')
      return
    }
    if (pendingReturnIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has a return request waiting for Shop review.')
      return
    }
    expireOrderChangeRecovery()
    setCancellationDraft(null)
    setSupportDraft(null)
    setReturnDraft({ orderId: order.id, sku: lines[0].sku, quantity: '1', disposition: 'restock', reason: '' })
    setNotice('Describe the return for Shop review. Nothing changes here.')
  }

  function openCancellationRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    if (!order || !['confirmed', 'preparing', 'ready'].includes(order.status)) {
      setNotice('Only an active Ecommerce order can request cancellation.')
      return
    }
    if (pendingCancellationIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has a cancellation request waiting for Shop review.')
      return
    }
    if (activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has a reschedule request.')
      return
    }
    expireOrderChangeRecovery()
    setReturnDraft(null)
    setSupportDraft(null)
    setAmendmentDraft(null)
    setRescheduleDraft(null)
    setCancellationDraft({ orderId: order.id, reasonCode: 'changed_mind', reason: '' })
    setNotice('Tell Shop why. Nothing changes until Shop approves.')
  }

  function openAmendmentRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    const lines = order?.lines ?? []
    const request = entry.request
    if (!order || order.status !== 'confirmed' || order.paymentStatus !== 'pending' || order.refundStatus !== 'none' || !lines.length) {
      setNotice('Changes are available only before preparation or payment.')
      return
    }
    if (request.schema !== 'supermega.ecommerce.order_request.v2' || !request.customerProfile) {
      setNotice('Verified customer details are missing. Create a current request first.')
      return
    }
    if (activeBuyingState.amendmentIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.cancellationIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has one recoverable change request.')
      return
    }
    const draft: EcommerceOrderChangeDraft = {
      orderId: order.id,
      mode: 'details',
      fulfilment: request.fulfilment,
      lines: lines.map((line) => ({ sku: line.sku, name: line.name, quantity: String(line.quantity) })),
      customerName: request.customerProfile.name,
      customerPhone: request.customerProfile.phone,
      addressLine1: request.deliveryAddress?.line1 ?? '',
      addressTownship: request.deliveryAddress?.township ?? '',
      addressCity: request.deliveryAddress?.city ?? 'Yangon',
      deliveryInstructions: request.deliveryAddress?.instructions ?? '',
      reason: '',
    }
    const opening = createEcommerceOrderChangeOpening(draft, entry)
    if (!opening) {
      setNotice('Accepted order evidence changed. Nothing opened.')
      return
    }
    expireOrderChangeRecovery()
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    setRescheduleDraft(null)
    amendmentOpeningRef.current = opening
    setAmendmentDraft(draft)
    setNotice('Edit the change. Shop revalidates and confirms any replacement.')
  }

  function closeAmendmentRequest() {
    if (!amendmentDraft || !amendmentOpeningRef.current) {
      setNotice('Close failed safely; the change stays open.')
      return
    }
    const closed = closeEcommerceOrderChangeDraft(amendmentDraft, amendmentOpeningRef.current)
    setClosedAmendmentDraft(closed)
    setAmendmentDraft(null)
    amendmentOpeningRef.current = null
    setNotice(closed
      ? 'Change closed. Reopen once to restore unsent fields; nothing was sent.'
      : 'Order correction closed. Nothing changed.')
  }

  function reopenAmendmentRequest() {
    if (!closedAmendmentDraft) return
    const recovery = recoverEcommerceOrderChangeDraft(null, closedAmendmentDraft, activeCustomerOrders, orderChangeConflictIds)
    if (!recovery.ok) {
      setClosedAmendmentDraft(null)
      amendmentOpeningRef.current = null
      setNotice(recovery.reason === 'change_pending'
        ? 'A Shop change is pending, so recovery expired.'
        : recovery.reason === 'order_inactive'
          ? 'The order is no longer changeable, so recovery expired.'
          : 'Order evidence changed, so recovery expired safely.')
      return
    }
    setClosedAmendmentDraft(null)
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    setCorrectionDraft(null)
    setRescheduleDraft(null)
    amendmentOpeningRef.current = recovery.opening
    setAmendmentDraft(recovery.draft)
    setNotice('Unsent change restored exactly. Review before sending to Shop.')
    window.requestAnimationFrame(() => amendmentModeRef.current?.focus({ preventScroll: true }))
  }

  function openRescheduleRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    if (!order || order.status !== 'confirmed' || order.paymentStatus !== 'pending' || order.refundStatus !== 'none' || !order.promisedAt) {
      setNotice('Time changes are available only before preparation or payment.')
      return
    }
    if (activeBuyingState.amendmentIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.cancellationIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has a change or cancellation request.')
      return
    }
    const minimum = quoteClock + 2 * 60 * 60 * 1000
    const afterOriginal = Date.parse(order.promisedAt) + 24 * 60 * 60 * 1000
    const draft: EcommerceOrderRescheduleDraft = {
      orderId: order.id,
      requestedPromisedAt: localPromiseInput(new Date(Math.max(minimum, afterOriginal))),
      reason: '',
    }
    const opening = createEcommerceOrderRescheduleOpening(draft, entry)
    if (!opening) {
      setNotice('Accepted promise evidence changed. Nothing opened.')
      return
    }
    expireOrderChangeRecovery()
    setAmendmentDraft(null)
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    rescheduleOpeningRef.current = opening
    setRescheduleDraft(draft)
    setNotice('Choose a requested time. Shop reviews it before any replacement.')
  }

  function closeRescheduleRequest() {
    if (!rescheduleDraft || !rescheduleOpeningRef.current) {
      setNotice('Close failed safely; the reschedule stays open.')
      return
    }
    const closed = closeEcommerceOrderRescheduleDraft(rescheduleDraft, rescheduleOpeningRef.current)
    setClosedRescheduleDraft(closed)
    setRescheduleDraft(null)
    rescheduleOpeningRef.current = null
    setNotice(closed
      ? 'Time change closed. Reopen once to restore its unsent fields.'
      : 'Reschedule closed. The order and promise are unchanged.')
  }

  function reopenRescheduleRequest() {
    if (!closedRescheduleDraft) return
    const recovery = recoverEcommerceOrderRescheduleDraft(null, closedRescheduleDraft, activeCustomerOrders, orderChangeConflictIds)
    if (!recovery.ok) {
      setClosedRescheduleDraft(null)
      rescheduleOpeningRef.current = null
      setNotice(recovery.reason === 'change_pending'
        ? 'A Shop change is pending, so recovery expired.'
        : recovery.reason === 'order_inactive'
          ? 'The order is no longer reschedulable, so recovery expired.'
          : 'Order evidence changed, so recovery expired safely.')
      return
    }
    setClosedRescheduleDraft(null)
    setClosedAmendmentDraft(null)
    amendmentOpeningRef.current = null
    setAmendmentDraft(null)
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    setCorrectionDraft(null)
    rescheduleOpeningRef.current = recovery.opening
    setRescheduleDraft(recovery.draft)
    setNotice('Unsent time and reason restored. Review before sending to Shop.')
    window.requestAnimationFrame(() => rescheduleDateRef.current?.focus({ preventScroll: true }))
  }

  async function openRescheduleInShop(intent: EcommerceOrderRescheduleIntent) {
    const replacementRequest = activeBuyingState.requests.find((request) => request.id === intent.replacementRequestId)
    if (!replacementRequest) {
      setNotice('The replacement request is missing. Nothing opened in Shop.')
      return
    }
    try {
      if (onRecordManagedRequest) await onRecordManagedRequest(replacementRequest)
      onOpenReschedule(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sync failed; the reschedule remains saved locally.')
    }
  }

  async function openAmendmentInShop(intent: EcommerceOrderAmendmentIntent) {
    const replacementRequest = activeBuyingState.requests.find((request) => request.id === intent.replacementRequestId)
    if (!replacementRequest) {
      setNotice('The replacement request is missing from recovery. Nothing was opened in Shop.')
      return
    }
    try {
      if (onRecordManagedRequest) await onRecordManagedRequest(replacementRequest)
      onOpenAmendment(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The managed replacement request could not be synchronized. It remains saved locally.')
    }
  }

  async function submitAmendmentRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!amendmentDraft || amendmentBusy || disabled || recoveryBlocked) return
    const entry = activeCustomerOrders.find((candidate) => candidate.order?.id === amendmentDraft.orderId)
    if (!entry?.order || entry.request.schema !== 'supermega.ecommerce.order_request.v2' || !globalThis.crypto?.randomUUID) {
      setNotice('Current order evidence is unavailable. Nothing was recorded.')
      return
    }
    const replacementCart = amendmentDraft.lines.map((line) => ({
      sku: line.sku,
      quantity: /^(?:[1-9]\d*)$/.test(line.quantity) ? Number(line.quantity) : Number.NaN,
    }))
    if (replacementCart.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99)) {
      setNotice('Each replacement quantity must be a whole number from 1 to 99.')
      return
    }
    setAmendmentBusy(true)
    setNotice('')
    try {
      const quotedAt = new Date()
      const pim = await buildEcommercePimProjection(scope, sourcePreviewDigest, preview)
      const originalRequest = entry.request
      const originalPayment = originalRequest.quote.payment.adapter
      const replacementPayment = ecommercePaymentMatchesFulfilment(amendmentDraft.fulfilment, originalPayment)
        ? originalPayment
        : amendmentDraft.fulfilment === 'delivery' ? 'cash_on_delivery' : 'pay_on_pickup'
      if (!originalRequest.customerProfile) {
        throw new Error('Verified contact is missing. Create a current request first.')
      }
      const replacementReference = `${amendmentDraft.customerName.trim()} · ${amendmentDraft.customerPhone.trim()}`
      const quote = await buildEcommerceCheckoutQuote({
        pim,
        cart: replacementCart,
        customerReference: replacementReference,
        customerProfile: {
          name: amendmentDraft.customerName,
          phone: amendmentDraft.customerPhone,
          previous: originalRequest.customerProfile,
        },
        deliveryAddress: amendmentDraft.fulfilment === 'delivery' ? {
          line1: amendmentDraft.addressLine1,
          township: amendmentDraft.addressTownship,
          city: amendmentDraft.addressCity,
          instructions: amendmentDraft.deliveryInstructions.trim() || null,
          previous: originalRequest.deliveryAddress ?? null,
        } : null,
        fulfilment: amendmentDraft.fulfilment,
        paymentAdapter: replacementPayment,
        promotionCode: originalRequest.quote.promotion.code,
        idempotencyKey: `ECI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        quotedAt: quotedAt.toISOString(),
        expiresAt: new Date(quotedAt.getTime() + 30 * 60 * 1000).toISOString(),
      })
      const replacementRequest = await buildEcommerceOrderRequestV2(quote, sourceStorefront)
      const intent = await buildEcommerceOrderAmendmentIntent({
        scope,
        commerceState,
        orderId: entry.order.id,
        replacementRequest,
        reason: amendmentDraft.reason,
        idempotencyKey: `AMI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        createdAt: quotedAt.toISOString(),
      })
      const saved = await saveEcommerceOrderAmendment(scope, replacementRequest, intent, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setClosedAmendmentDraft(null)
      setAmendmentDraft(null)
      amendmentOpeningRef.current = null
      setNotice(`${intent.id} and ${replacementRequest.id} are saved together. No order, stock, payment, refund, message, or provider changed.`)
      if (onRecordManagedRequest) await onRecordManagedRequest(replacementRequest)
      onOpenAmendment(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Order amendment failed closed.')
    } finally {
      setAmendmentBusy(false)
    }
  }

  async function submitRescheduleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rescheduleDraft || rescheduleBusy || disabled || recoveryBlocked) return
    const entry = activeCustomerOrders.find((candidate) => candidate.order?.id === rescheduleDraft.orderId)
    if (!entry?.order || entry.request.schema !== 'supermega.ecommerce.order_request.v2' || !globalThis.crypto?.randomUUID) {
      setNotice('Current order evidence is unavailable. Nothing was recorded.')
      return
    }
    const requestedPromise = new Date(rescheduleDraft.requestedPromisedAt)
    if (Number.isNaN(requestedPromise.getTime()) || requestedPromise.getTime() <= quoteClock) {
      setNotice('Choose a future date and time for Shop review.')
      return
    }
    setRescheduleBusy(true)
    setNotice('')
    try {
      const quotedAt = new Date()
      const originalRequest = entry.request
      const pim = await buildEcommercePimProjection(scope, sourcePreviewDigest, preview)
      const quote = await buildEcommerceCheckoutQuote({
        pim,
        cart: (entry.order.lines ?? []).map((line) => ({ sku: line.sku, quantity: line.quantity })),
        customerReference: originalRequest.customerReference,
        customerProfile: originalRequest.customerProfile ? {
          name: originalRequest.customerProfile.name,
          phone: originalRequest.customerProfile.phone,
          previous: originalRequest.customerProfile,
        } : undefined,
        deliveryAddress: originalRequest.fulfilment === 'delivery' && originalRequest.deliveryAddress ? {
          line1: originalRequest.deliveryAddress.line1,
          township: originalRequest.deliveryAddress.township,
          city: originalRequest.deliveryAddress.city,
          instructions: originalRequest.deliveryAddress.instructions,
          previous: originalRequest.deliveryAddress,
        } : null,
        fulfilment: originalRequest.fulfilment,
        paymentAdapter: originalRequest.quote.payment.adapter,
        promotionCode: originalRequest.quote.promotion.code,
        idempotencyKey: `ECI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        quotedAt: quotedAt.toISOString(),
        expiresAt: new Date(quotedAt.getTime() + 30 * 60 * 1000).toISOString(),
      })
      const replacementRequest = await buildEcommerceOrderRequestV2(quote, sourceStorefront)
      const intent = await buildEcommerceOrderRescheduleIntent({
        scope,
        commerceState,
        orderId: entry.order.id,
        replacementRequest,
        requestedPromisedAt: requestedPromise.toISOString(),
        reason: rescheduleDraft.reason,
        idempotencyKey: `RSI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        createdAt: quotedAt.toISOString(),
      })
      const saved = await saveEcommerceOrderReschedule(scope, replacementRequest, intent, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setClosedRescheduleDraft(null)
      setRescheduleDraft(null)
      rescheduleOpeningRef.current = null
      setNotice(`${intent.id} and ${replacementRequest.id} are saved together. No order, stock, payment, refund, rider, message, or provider changed.`)
      if (onRecordManagedRequest) await onRecordManagedRequest(replacementRequest)
      onOpenReschedule(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Order reschedule failed closed.')
    } finally {
      setRescheduleBusy(false)
    }
  }

  async function submitCancellationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cancellationDraft || cancellationBusy || disabled || recoveryBlocked) return
    const order = activeCustomerOrders.find((entry) => entry.order?.id === cancellationDraft.orderId)?.order
    if (!order || !globalThis.crypto?.randomUUID) {
      setNotice('Current order evidence is unavailable. Nothing was recorded.')
      return
    }
    setCancellationBusy(true)
    setNotice('')
    try {
      const intent = buildEcommerceCancellationIntent({
        scope,
        commerceState,
        orderId: order.id,
        reasonCode: cancellationDraft.reasonCode,
        reason: cancellationDraft.reason,
        idempotencyKey: `CNI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        createdAt: new Date().toISOString(),
      })
      const saved = await saveEcommerceCancellationIntent(scope, intent, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setCancellationDraft(null)
      setNotice(`${intent.id} is saved for Shop review. No order, stock, payment, refund, provider, or customer message changed.`)
      onOpenCancellation(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cancellation request failed closed.')
    } finally {
      setCancellationBusy(false)
    }
  }

  async function submitReturnRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!returnDraft || !returnDraftEntry?.order || returnBusy || disabled || recoveryBlocked) return
    const line = returnDraftLines.find((candidate) => candidate.sku === returnDraft.sku)
    const quantity = /^(?:[1-9]\d*)$/.test(returnDraft.quantity) ? Number(returnDraft.quantity) : Number.NaN
    if (!line || !Number.isSafeInteger(quantity) || quantity > line.remaining) {
      setNotice('Choose one sold item and a whole quantity within the amount left to return.')
      return
    }
    if (!globalThis.crypto?.randomUUID) {
      setNotice('Secure return identity is unavailable. Nothing was recorded.')
      return
    }
    setReturnBusy(true)
    setNotice('')
    try {
      const intent = buildEcommerceReturnIntent({
        scope,
        orderSnapshot: returnDraftEntry.order,
        sku: line.sku,
        quantity,
        disposition: returnDraft.disposition,
        reason: returnDraft.reason,
        idempotencyKey: `ERI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        createdAt: new Date().toISOString(),
      })
      const saved = await saveEcommerceReturnIntent(scope, intent, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setReturnDraft(null)
      setNotice(`${intent.id} is saved for Shop review. No refund, payment, stock, message, or order changed.`)
      onOpenReturns(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Return request failed closed.')
    } finally {
      setReturnBusy(false)
    }
  }

  function openSupportRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    if (!order?.completion || order.status !== 'completed') {
      setNotice('Support requests require one completed Ecommerce order.')
      return
    }
    if (pendingSupportIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has a help request waiting for Shop review.')
      return
    }
    expireOrderChangeRecovery()
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft({ orderId: order.id, category: 'order_status', description: '' })
    setNotice('Describe the issue for Shop review. Nothing is sent here.')
  }

  async function submitSupportRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supportDraft || supportBusy || disabled || recoveryBlocked) return
    const order = completedCustomerOrders.find((entry) => entry.order?.id === supportDraft.orderId)?.order
    if (!order?.completion || !globalThis.crypto?.randomUUID) {
      setNotice('Completed order evidence is unavailable. Nothing was recorded.')
      return
    }
    setSupportBusy(true)
    setNotice('')
    try {
      const intent = buildEcommerceSupportIntent({
        scope,
        orderSnapshot: order,
        category: supportDraft.category,
        description: supportDraft.description,
        idempotencyKey: `ESI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        createdAt: new Date().toISOString(),
      })
      const saved = await saveEcommerceSupportIntent(scope, intent, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setSupportDraft(null)
      setNotice(`${intent.id} is saved for Shop review. No message, refund, payment, stock, or order changed.`)
      onOpenSupport(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Support request failed closed.')
    } finally {
      setSupportBusy(false)
    }
  }

  function openCorrectionRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    if (!order || !commerceOrderCorrectionExpectation(commerceState, order.id)) {
      setNotice('Balance corrections require an unclosed, reconciled, completed Shop order.')
      return
    }
    if (pendingCorrectionIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has a balance correction waiting for Shop review.')
      return
    }
    expireOrderChangeRecovery()
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    setCorrectionDraft({ orderId: order.id, requestedKind: 'credit', reasonCode: 'pricing_error', listedAmountMmk: '', reason: '' })
    setNotice('Describe the issue. Shop rechecks tax and totals.')
  }

  async function submitCorrectionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!correctionDraft || correctionBusy || disabled || recoveryBlocked) return
    const order = completedCustomerOrders.find((entry) => entry.order?.id === correctionDraft.orderId)?.order
    const listedAmountMmk = /^(?:[1-9]\d*)$/.test(correctionDraft.listedAmountMmk)
      ? Number(correctionDraft.listedAmountMmk)
      : Number.NaN
    if (!order || !commerceOrderCorrectionExpectation(commerceState, order.id) || !Number.isSafeInteger(listedAmountMmk)) {
      setNotice('Choose an eligible completed order and enter a positive whole-MMK amount.')
      return
    }
    if (!globalThis.crypto?.randomUUID) {
      setNotice('Secure correction identity is unavailable. Nothing was recorded.')
      return
    }
    setCorrectionBusy(true)
    setNotice('')
    try {
      const intent = buildEcommerceCorrectionIntent({
        scope,
        orderSnapshot: order,
        requestedKind: correctionDraft.requestedKind,
        reasonCode: correctionDraft.reasonCode,
        listedAmountMmk,
        reason: correctionDraft.reason,
        idempotencyKey: `COI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        createdAt: new Date().toISOString(),
      })
      const saved = await saveEcommerceCorrectionIntent(scope, intent, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setCorrectionDraft(null)
      setNotice(`${intent.id} is saved for Shop review. No invoice, payment, refund, ledger, tax filing, provider, or customer message changed.`)
      onOpenCorrection(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Correction request failed closed.')
    } finally {
      setCorrectionBusy(false)
    }
  }

  async function reviewOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (firstCartQuantityIssueSku) {
      setNotice(`${cartQuantityIssues[firstCartQuantityIssueSku]} No Shop request was created.`)
      focusCartQuantity(firstCartQuantityIssueSku)
      return
    }
    if (disabled || quoteBusy || recoveryBlocked || !cart.length) return
    if (!paymentPolicyReady) {
      setNotice(`Shop has no active payment method for ${fulfilment}. Set one up in Shop before reviewing this order.`)
      return
    }
    if (!globalThis.crypto?.randomUUID) {
      setNotice('Secure checkout identity is unavailable. Nothing was recorded.')
      return
    }
    const reviewedRecoveryDraft = currentCheckoutEntryDraft
    const reviewedRecoverySource = checkoutEntrySource
    setQuoteBusy(true)
    setNotice('')
    try {
      const quotedAt = new Date()
      const pim = await buildEcommercePimProjection(scope, sourcePreviewDigest, preview)
      const retained = activeBuyingState.requests[0]
      const retainedMatches = Boolean(onRecordManagedRequest
        && retained
        && retained.scope === scope
        && retained.sourcePreviewDigest === sourcePreviewDigest
        && retained.sourceStorefrontRevision === (sourceStorefront?.revision ?? null)
        && retained.sourceStorefrontActionId === (sourceStorefront?.actionId ?? null)
        && retained.customerReference === customerReference
        && retained.customerProfile?.name === customerName.trim()
        && retained.customerProfile.phone === customerPhone.trim()
        && (retained.fulfilment !== 'delivery' || Boolean(retained.deliveryAddress
          && retained.deliveryAddress.line1 === addressLine1.trim()
          && retained.deliveryAddress.township === addressTownship.trim()
          && retained.deliveryAddress.city === addressCity.trim()
          && (retained.deliveryAddress.instructions ?? '') === deliveryInstructions.trim()))
        && retained.fulfilment === fulfilment
        && retained.quote.payment.adapter === effectivePaymentAdapter
        && (retained.quote.promotion.code ?? '') === promotionCode.trim()
        && retained.quote.pimDigest === pim.pimDigest
        && Date.parse(retained.quote.expiresAt) > quotedAt.getTime()
        && cartMatchesRequest(cart, retained))
      if (retainedMatches && retained && onRecordManagedRequest) {
        const retainedPrior = retained.supersedesRequestId
          ? activeBuyingState.requests.find((candidate) => candidate.id === retained.supersedesRequestId) ?? null
          : null
        await onRecordManagedRequest(retained, retainedPrior)
        clearMatchingCheckoutEntryRecovery(reviewedRecoveryDraft, reviewedRecoverySource)
        setFreshQuoteId(retained.id)
        setQuoteClock(quotedAt.getTime())
        setNotice('This order request is in the Company Shop inbox. No order, stock, message, or charge changed.')
        requestAnimationFrame(() => {
          requestReceiptRef.current?.scrollIntoView({ block: 'center' })
          requestReceiptRef.current?.focus({ preventScroll: true })
        })
        return
      }
      const quote = await buildEcommerceCheckoutQuote({
        pim,
        cart,
        customerReference,
        customerProfile: {
          name: customerName,
          phone: customerPhone,
          previous: activeBuyingState.requests.find((request) => request.customerProfile?.phone === customerPhone.trim())?.customerProfile ?? null,
        },
        deliveryAddress: fulfilment === 'delivery' ? {
          line1: addressLine1,
          township: addressTownship,
          city: addressCity,
          instructions: deliveryInstructions.trim() || null,
          previous: activeBuyingState.requests.find((request) => request.customerProfile?.phone === customerPhone.trim() && request.deliveryAddress)?.deliveryAddress ?? null,
        } : null,
        fulfilment,
        paymentAdapter: effectivePaymentAdapter,
        promotionCode: promotionCode.trim() || null,
        idempotencyKey: `ECI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        quotedAt: quotedAt.toISOString(),
        expiresAt: new Date(quotedAt.getTime() + 15 * 60 * 1000).toISOString(),
      })
      const supersededRequest = latestRequest && !latestRequestOrder
        && (Date.parse(latestRequest.quote.expiresAt) <= quotedAt.getTime() || !latestRequestCheckoutMatches)
        ? latestRequest
        : null
      const request = await buildEcommerceOrderRequestV2(quote, sourceStorefront, supersededRequest?.id ?? null)
      const saved = await saveEcommerceOrderRequestV2(scope, request, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setFreshQuoteId('')
      if (onRecordManagedRequest) await onRecordManagedRequest(request, supersededRequest)
      clearMatchingCheckoutEntryRecovery(reviewedRecoveryDraft, reviewedRecoverySource)
      recordBehaviorSignal(window.localStorage, {
        event: 'first_value_completed',
        product: 'ecommerce',
        route: window.location.pathname + window.location.search,
        detail: 'Saved a reviewed Ecommerce order request for Shop review.',
      })
      setFreshQuoteId(request.id)
      setQuoteClock(quotedAt.getTime())
      setNotice(onRecordManagedRequest
        ? 'This order request is in the Company Shop inbox and local recovery. No order, stock, message, or charge changed.'
        : 'This sample order request is saved on this device for Shop review. No order, stock, message, or charge changed.')
      requestAnimationFrame(() => {
        requestReceiptRef.current?.scrollIntoView({ block: 'center' })
        requestReceiptRef.current?.focus({ preventScroll: true })
      })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Checkout review failed closed.')
    } finally {
      setQuoteBusy(false)
    }
  }

  async function openOperatorReview() {
    if (!latestRequest || latestRequestConfirmed || !quoteCurrent || handoffBusy) return
    setHandoffBusy(true)
    setNotice('')
    try {
      const currentPim = await buildEcommercePimProjection(scope, sourcePreviewDigest, preview)
      if (currentPim.pimDigest !== latestRequest.quote.pimDigest) {
        throw new Error('The customer catalog changed after this quote. Review a new total.')
      }
      const draft = await prepareEcommerceShopDraftV2({
        request: latestRequest,
        state: activeBuyingState,
        currentCatalog,
        currentPromotionPolicies: commerceState.promotionPolicies ?? [],
        currentShippingPolicies: commerceState.shippingPolicies ?? [],
        currentPaymentPolicies: checkoutPaymentPolicies,
        currentTaxConfigurations: commerceState.taxConfigurations ?? [],
        catalogRevision: commerceState.catalogChanges?.length ?? 0,
        confirmedAt: new Date().toISOString(),
      })
      if (onOpenManagedRequest) {
        setNotice(`${latestRequest.id} is ready in the Company Shop inbox. Payment remains unauthorized.`)
        onOpenManagedRequest(latestRequest.id)
      } else {
        setNotice(`${draft.id} is ready for Shop review at ${formatMmk(draft.totalMmk)}. ${draft.pricing.promotion.status === 'approved' ? `${formatMmk(draft.pricing.promotion.discountMmk)} promotion approved.` : draft.pricing.promotion.status === 'rejected' ? 'The promotion code was rejected by Shop policy.' : 'No promotion requested.'} ${draft.pricing.tax.status === 'configured' ? `${formatMmk(draft.pricing.tax.taxMmk)} tax uses ${draft.pricing.tax.taxCode} revision ${draft.pricing.tax.taxConfigurationRevision}.` : 'No Shop tax schedule is configured.'} Payment remains unauthorized.`)
        onDraft(draft)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Shop review failed closed.')
    } finally {
      setHandoffBusy(false)
    }
  }

  if (activeCheckoutEntryRecovery) {
    const recoveredDraft = checkoutEntryRecoveryReview?.ok
      ? checkoutEntryRecoveryReview.draft
      : activeCheckoutEntryRecovery.draft
    const recoveredUnits = recoveredDraft.lines.reduce((total, line) => total + line.quantity, 0)
    return (
      <section
        aria-labelledby="ecommerce-checkout-recovery-title"
        aria-live="polite"
        className="ecommerce-checkout-entry-recovery"
        data-state={checkoutEntryRecoveryReview?.ok ? 'ready' : 'conflict'}
        id="ecommerce-buying-workspace"
        tabIndex={-1}
      >
        <div className="ecommerce-checkout-entry-recovery-copy">
          <span className="core-eyebrow">Unfinished checkout found</span>
          <h2 id="ecommerce-checkout-recovery-title">{checkoutEntryRecoveryReview?.ok ? 'Continue this checkout?' : 'This checkout needs a fresh start'}</h2>
          <p>{checkoutEntryRecoveryReview?.ok
            ? 'Resume the exact cart, raw quantities, customer details, delivery, payment, promotion, and undo state. Nothing is sent automatically.'
            : 'The storefront, Shop catalog, or order record changed after this checkout began. Discard the older recovery to protect the current source.'}</p>
        </div>
        <div aria-label="Recovered checkout summary" className="ecommerce-checkout-entry-recovery-summary" role="group">
          <span><small>Cart</small><strong>{recoveredUnits ? `${recoveredUnits} item${recoveredUnits === 1 ? '' : 's'}` : 'No current line'}</strong></span>
          <span><small>Customer</small><strong>{recoveredDraft.customerName || 'Name not entered'}</strong></span>
          <span><small>Receive</small><strong>{recoveredDraft.fulfilment === 'delivery' ? recoveredDraft.addressTownship || 'Delivery details unfinished' : 'Pickup'}</strong></span>
          <span><small>Payment</small><strong>{paymentLabel(recoveredDraft.paymentAdapter)}</strong></span>
          {recoveredDraft.removedCartLine ? <span><small>Undo</small><strong>{recoveredDraft.removedCartLine.itemName} can be restored</strong></span> : null}
        </div>
        <div className="ecommerce-checkout-entry-recovery-actions">
          <button className="core-button secondary" onClick={discardCheckoutEntryRecovery} ref={checkoutEntryRecoveryReview?.ok ? undefined : checkoutRecoveryActionRef} type="button">Discard</button>
          {checkoutEntryRecoveryReview?.ok ? <button className="core-button primary" onClick={resumeCheckoutEntryRecovery} ref={checkoutRecoveryActionRef} type="button">Resume checkout</button> : null}
        </div>
        {checkoutEntryRecoveryNotice ? <p className="form-notice" role="status">{checkoutEntryRecoveryNotice}</p> : null}
        <small className="ecommerce-checkout-entry-recovery-boundary">No quote, request, order, stock, payment, delivery, provider, message, or company write happens here. Source: buying revision {activeCheckoutEntryRecovery.source.buyingRevision}.</small>
      </section>
    )
  }

  return (
    <>
      <details
        className="ecommerce-request-lab ecommerce-buying-workspace"
        id="ecommerce-buying-workspace"
        onToggle={(event) => setOpen(event.currentTarget.open)}
        open={open}
        tabIndex={-1}
      >
        <summary ref={checkoutSummaryRef} tabIndex={-1}>
          <span><strong>Cart and checkout</strong><small>Review one total before Shop</small></span>
          <b>{cart.length ? `${cart.length} ${cart.length === 1 ? 'item' : 'items'}` : latestRequest ? 'Recovered' : 'Empty'}</b>
        </summary>
        <div className="ecommerce-buying-body">
          {cart.length ? (
            <div aria-label="Cart items" className="ecommerce-cart" role="group">
              {cartItems.map(({ item, quantity, quantityLimit, sku }, index) => {
                const itemName = item?.name ?? sku
                const quantityIssue = cartQuantityIssues[sku] ?? ''
                const quantityHelpId = `ecommerce-cart-quantity-${index}-help`
                const quantityIssueId = `ecommerce-cart-quantity-${index}-issue`
                return <div className={`ecommerce-cart-line${quantityIssue ? ' has-issue' : ''}`} data-ecommerce-cart-quantity-line={sku} key={sku}>
                  <span>
                    <strong>{itemName}</strong>
                    <small>{item?.variant || sku} · {item ? formatMmk(item.unitPriceMmk) : 'Unavailable'}</small>
                  </span>
                  <label className="ecommerce-cart-quantity">
                    <span className="sr-only">Quantity for {itemName}</span>
                    <input aria-describedby={`${quantityHelpId}${quantityIssue ? ` ${quantityIssueId}` : ''}`} aria-invalid={Boolean(quantityIssue)} aria-label={`Quantity for ${itemName}`} data-ecommerce-cart-quantity-field={sku} inputMode="numeric" max={Math.max(1, quantityLimit)} min={1} onChange={(event) => updateCart(sku, event.target.value, itemName, quantityLimit)} ref={(node) => { cartQuantityRefs.current[sku] = node }} step={1} type="number" value={cartQuantityDrafts[sku] ?? String(quantity)} />
                    <small className="ecommerce-cart-quantity-help" id={quantityHelpId}>{quantityLimit > 0 ? `1 to ${quantityLimit} available` : 'Unavailable now'}</small>
                  </label>
                  <b>{item ? formatMmk(item.unitPriceMmk * quantity) : '—'}</b>
                  <button aria-label={`Remove ${itemName}`} disabled={disabled} onClick={() => removeFromCart(sku)} type="button">Remove</button>
                  {quantityIssue ? <p className="ecommerce-cart-quantity-issue" id={quantityIssueId} role="alert"><span>{quantityIssue}</span><button onClick={() => focusCartQuantity(sku)} type="button">Fix quantity</button></p> : null}
                </div>
              })}
              <div className="ecommerce-cart-total"><span>Products</span><strong>{formatMmk(cartTotal)}</strong></div>
            </div>
          ) : (
            <div className="ecommerce-cart-empty">
              <strong>Your cart is empty</strong>
              <p>Add an available product above. Nothing goes to Shop until you review the exact quote.</p>
            </div>
          )}

          {removedCartLine ? (
            <div className="ecommerce-cart-remove-recovery" data-ecommerce-cart-remove-recovery={removedCartLine.line.sku} role="status">
              <span>
                <strong>{removedCartLine.itemName} removed</strong>
                <small>Quantity {removedCartLine.line.quantity} can be restored after a current stock check. Checkout details stay here.</small>
              </span>
              <button aria-label={`Undo remove ${removedCartLine.itemName}`} disabled={disabled} onClick={undoCartRemoval} ref={cartRemovalUndoRef} type="button">Undo remove</button>
            </div>
          ) : null}

          <form onSubmit={(event) => void reviewOrder(event)}>
            <label>
              <span>Name</span>
              <input autoComplete="name" data-checkout-primary-field="true" maxLength={80} onChange={(event) => setCustomerName(event.target.value)} placeholder="e.g. Ma Su" ref={customerNameRef} required value={customerName} />
            </label>
            <label>
              <span>Phone</span>
              <input autoComplete="tel" inputMode="tel" maxLength={32} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="e.g. 09 123 456 789" required value={customerPhone} />
            </label>
            <label>
              <span>Receive order</span>
              <select onChange={(event) => changeFulfilment(event.target.value as EcommerceFulfilment)} value={fulfilment}>
                <option value="pickup">Pickup · included</option>
                <option value="delivery">Delivery · Shop confirms</option>
              </select>
            </label>
            {fulfilment === 'delivery' ? <>
              <label>
                <span>Address</span>
                <input autoComplete="street-address" maxLength={120} onChange={(event) => setAddressLine1(event.target.value)} placeholder="Building, street, ward" required value={addressLine1} />
              </label>
              <label>
                <span>Township</span>
                <input autoComplete="address-level2" maxLength={80} onChange={(event) => setAddressTownship(event.target.value)} placeholder="e.g. Hlaing" required value={addressTownship} />
              </label>
              <label>
                <span>City</span>
                <input autoComplete="address-level1" maxLength={80} onChange={(event) => setAddressCity(event.target.value)} placeholder="e.g. Yangon" required value={addressCity} />
              </label>
              <label>
                <span>Delivery note <small>optional</small></span>
                <input maxLength={160} onChange={(event) => setDeliveryInstructions(event.target.value)} placeholder="Landmark or safe handoff note" value={deliveryInstructions} />
              </label>
            </> : null}
            <label>
              <span>Payment</span>
              <select disabled={!availablePaymentAdapters.length} onChange={(event) => setPaymentAdapter(event.target.value as EcommercePaymentAdapter)} value={paymentPolicyReady ? effectivePaymentAdapter : ''}>
                {availablePaymentAdapters.length
                  ? availablePaymentAdapters.map((adapter) => <option key={adapter} value={adapter}>{paymentLabel(adapter)}</option>)
                  : <option value="">No Shop payment method</option>}
              </select>
            </label>
            {usingSamplePaymentFallback && availablePaymentAdapters.length
              ? <p className="form-notice" role="status">Browser-local sample payment. No charge or payment-provider request is made.</p>
              : !availablePaymentAdapters.length
                ? <p className="form-notice" role="status">Set up an active Shop payment method for {fulfilment} before reviewing an order.</p>
                : null}
            <label>
              <span>Promotion code <small>optional · Shop checks it</small></span>
              <input maxLength={40} onChange={(event) => setPromotionCode(event.target.value)} placeholder="Optional" value={promotionCode} />
            </label>
            {!quoteCurrent && !latestRequestConfirmed && replacingCurrentRequest
              ? <p className="form-notice" data-ecommerce-replaces={latestRequest?.id} role="status">Replaces request {latestRequest?.id}. Earlier request stays in Your orders; Shop creates no order until review.</p>
              : null}
            {!quoteCurrent && !latestRequestConfirmed ? <button className="core-button primary" data-ecommerce-submit-mode={replacingCurrentRequest ? 'replacement' : 'new'} data-ecommerce-quote-review-action="true" disabled={disabled || quoteBusy || recoveryBlocked || !cart.length || !paymentPolicyReady} type="submit">
              {quoteBusy ? replacingCurrentRequest ? 'Replacing...' : 'Sending...' : replacingCurrentRequest ? 'Replace current request' : 'Send order request'}
            </button> : null}
          </form>

          {latestRequest ? latestRequestOrder && latestRequestConfirmed ? (
            <article className="ecommerce-request-receipt ecommerce-quote-receipt" data-current="true" ref={requestReceiptRef} tabIndex={-1}>
              <span className="status-pill ready">{latestRequestCompleted ? 'Completed in Shop' : 'Confirmed in Shop'}</span>
              <strong>Order {latestRequestOrder.id}</strong>
              <b>{formatMmk(latestRequestOrder.total)}</b>
              <div className="ecommerce-quote-boundaries">
                <span><small>Customer</small><b>{latestRequestOrder.customer}</b></span>
                <span><small>Receive order</small><b>{receiveOrderLabel(latestRequest.fulfilment)}</b></span>
                <span><small>Payment</small><b>{latestRequestEntry?.paymentStatus === 'reconciled' ? 'Confirmed' : 'Pending in Shop'}</b></span>
                <span><small>Promise</small><b>{latestRequestOrder.promisedAt ? new Date(latestRequestOrder.promisedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set'}</b></span>
              </div>
              <small>Request {latestRequest.id} · {latestRequestCompleted ? 'Shop completed fulfilment and retained the accountable order.' : 'Shop recorded the order and stock reservation.'}</small>
              <button className="core-button primary" disabled={disabled} onClick={() => onOpenShopOrder(latestRequestOrder.id)} type="button">{latestRequestCompleted ? 'View completed Shop order' : 'Continue in Shop'}</button>
              <button className="core-button secondary" disabled={disabled} onClick={beginAnotherOrder} type="button">Start another order</button>
            </article>
          ) : quoteCurrent ? (
            <article className="ecommerce-request-receipt ecommerce-quote-receipt" data-current="true" ref={requestReceiptRef} tabIndex={-1}>
              <span className="status-pill ready">Request sent</span>
              <strong>Request for {latestRequest.customerReference}</strong>
              <b>{formatMmk(latestRequest.totalMmk)}</b>
              <div className="ecommerce-quote-boundaries">
                <span><small>Receive order</small><b>{receiveOrderLabel(latestRequest.fulfilment)}</b></span>
                {latestRequest.deliveryAddress ? <span><small>Deliver to</small><b>{latestRequest.deliveryAddress.township} · {latestRequest.deliveryAddress.city}</b></span> : null}
                <span><small>Tax</small><b>Included in listed price</b></span>
                <span><small>Payment</small><b>{paymentLabel(latestRequest.quote.payment.adapter)} · not charged</b></span>
              </div>
              <small>Reference {latestRequest.id} · quote valid until {new Date(latestRequest.quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              <p>{onRecordManagedRequest ? 'Company Shop received this request.' : 'This browser demo retained the request.'} Shop still confirms stock, promise, payment, and delivery.</p>
              <button className="core-button secondary" disabled={!quoteCurrent || handoffBusy} onClick={() => void openOperatorReview()} type="button">
                {handoffBusy ? 'Opening Shop…' : 'Open Shop operator review'}
              </button>
            </article>
          ) : (
            <div className="ecommerce-stale-quote" role="status">
              <strong>{latestRequestOrder ? 'Start another order' : quoteNextAction?.headline ?? 'Review the current total'}</strong>
              <small>{latestRequestOrder
                ? `Order ${latestRequestOrder.id} is already confirmed. Review a new total only when creating another order.`
                : quoteNextAction?.summary ?? 'The previous request remains in Your orders and cannot continue with this checkout.'}</small>
            </div>
          ) : null}

          <section className="ecommerce-order-tracking" aria-label="Customer order tracking">
            <div className="ecommerce-order-tracking-head">
              <span><strong>Your orders</strong><small>Quotes and orders, followed through Shop</small></span>
              <b>{customerOrderTimeline.length ? `${customerOrderTimeline.length} found` : 'Enter contact above'}</b>
            </div>
            {customerOrderTimeline.length ? (
              <div className="ecommerce-order-history" id="ecommerce-order-history">
                {visibleCustomerOrderTimeline.map((entry) => (
                  <article key={entry.request.id}>
                    <span>
                      <small>{entry.request.id}</small>
                      <strong>{orderStageLabel(entry)}</strong>
                      <b>{formatMmk(entry.order?.total ?? entry.request.totalMmk)}</b>
                    </span>
                    <div>
                      <small>{entry.request.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</small>
                      <small>{entry.paymentStatus === 'reconciled' ? 'Payment confirmed' : entry.paymentStatus === 'pending' ? 'Payment pending' : 'Payment not charged'}</small>
                       {entry.order?.promisedAt ? <small>Promise {new Date(entry.order.promisedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small> : entry.supersededByRequestId ? <small>Replaced by {entry.supersededByRequestId}</small> : quoteExpiredWithoutOrder(entry) ? <small>Review again for the current total</small> : <small>Shop confirms the promise</small>}
                       {entry.returnedQuantity ? <small>{entry.returnedQuantity} returned in Shop</small> : null}
                    </div>
                    <button className="core-button secondary" disabled={disabled} onClick={() => reorder(entry)} type="button">Reorder</button>
                  </article>
                ))}
                {customerOrderHistoryLimit > 1 ? <button aria-controls="ecommerce-order-history" aria-expanded={orderHistoryExpanded} className="text-link ecommerce-order-history-toggle" onClick={() => setOrderHistoryExpanded((current) => !current)} type="button">
                  {orderHistoryExpanded ? 'Show latest only' : `Show ${customerOrderHistoryLimit - 1} older ${customerOrderHistoryLimit === 2 ? 'order' : 'orders'}`}
                </button> : null}
              </div>
            ) : <p>Use the same name and phone as checkout to see request, fulfilment, and payment status here.</p>}
          </section>

          <p className="form-notice ecommerce-buying-notice" aria-live="polite">{recoveryStatus === 'checking'
            ? 'Checking saved checkout recovery…'
            : checkoutNotice}</p>
        </div>
      </details>

      <details className="ecommerce-after-purchase" open={orderHelpOpen || undefined}>
        <summary><span><strong>Order help</strong><small>Changes, returns, and support</small></span><b>{pendingOrderHelpCount ? `${pendingOrderHelpCount} waiting` : 'Shop review'}</b></summary>
        <div className="ecommerce-return-workspace">
          <p>Shop reviews every request before anything changes.</p>
          {pendingAmendmentIntents.map(({ intent, state }) => <article className="ecommerce-return-status" key={intent.id}>
            <span><strong>{state === 'replacement_needed' ? 'Replacement needs confirmation' : state === 'review_required' ? 'Change needs fresh review' : 'Order change waiting'}</strong><small>{intent.orderId} / {intent.lineChanges.map((line) => `${line.sku} ${line.fromQuantity}→${line.toQuantity}`).join(', ') || `${intent.fromFulfilment}→${intent.toFulfilment}`}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => void openAmendmentInShop(intent)} type="button">Continue in Shop</button>
          </article>)}
          {amendmentStatuses.filter((status) => status.state === 'replacement_created').slice(0, 3).map(({ intent, replacementOrderId }) => <article className="ecommerce-return-status" key={`amendment:${intent.id}`}>
            <span><strong>Order updated</strong><small>{intent.orderId} replaced by {replacementOrderId}</small></span><b>Confirmed</b>
          </article>)}
          {pendingRescheduleIntents.map(({ intent, state }) => <article className="ecommerce-return-status" key={intent.id}>
            <span><strong>{state === 'replacement_needed' ? 'New promise needs confirmation' : state === 'review_required' ? 'Reschedule needs fresh review' : 'Reschedule waiting'}</strong><small>{intent.orderId} / requested {new Date(intent.requestedPromisedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => void openRescheduleInShop(intent)} type="button">Continue in Shop</button>
          </article>)}
          {rescheduleStatuses.filter((status) => status.state === 'replacement_created').slice(0, 3).map(({ intent, replacementOrderId }) => <article className="ecommerce-return-status" key={`reschedule:${intent.id}`}>
            <span><strong>New promise confirmed</strong><small>{intent.orderId} replaced by {replacementOrderId} / {new Date(intent.requestedPromisedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span><b>Confirmed</b>
          </article>)}
          {pendingCancellationIntents.map((intent) => <article className="ecommerce-return-status" key={intent.id}>
            <span><strong>Cancellation waiting</strong><small>{intent.orderId} / {intent.reasonCode.replaceAll('_', ' ')}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => onOpenCancellation(intent)} type="button">Continue in Shop</button>
          </article>)}
          {cancellationOutcomes.slice(0, 3).map((outcome) => <article className="ecommerce-return-status" key={`outcome:${outcome.intent.id}`}>
            <span><strong>{outcome.kind === 'cancelled' ? 'Cancellation approved' : 'Order kept'}</strong><small>{outcome.intent.orderId} / reviewed {new Date(outcome.decidedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span>
            <b>{outcome.kind === 'cancelled' ? outcome.refundStatus === 'due' ? 'Refund due' : 'Cancelled' : 'Active'}</b>
          </article>)}
          {pendingReturnIntents.map((intent) => <article className="ecommerce-return-status" key={intent.id}>
            <span><strong>Waiting for Shop review</strong><small>{intent.quantity} {intent.sku} / {intent.orderId}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => onOpenReturns(intent)} type="button">Continue in Shop</button>
          </article>)}
          {returnOutcomes.slice(0, 3).map((outcome) => <article className="ecommerce-return-status" key={`return-outcome:${outcome.intentId}`}>
            <span><strong>Return accepted</strong><small>{outcome.quantity} {outcome.sku} / {outcome.stockOutcome.replaceAll('_', ' ')} / reviewed by {outcome.reviewedBy} {new Date(outcome.reviewedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span>
            <b>{outcome.refundStatus === 'settled' ? 'Refund settled' : outcome.refundStatus === 'due' ? 'Refund due' : 'No refund recorded'}</b>
          </article>)}
          {pendingSupportIntents.map((intent) => <article className="ecommerce-return-status" key={intent.id}>
            <span><strong>Help waiting</strong><small>{intent.category.replaceAll('_', ' ')} / {intent.orderId}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => onOpenSupport(intent)} type="button">Continue in Shop</button>
          </article>)}
          {supportOutcomes.slice(0, 3).map((outcome) => <article className="ecommerce-return-status" key={outcome.caseId}>
            <span><strong>{outcome.state === 'resolved' ? 'Help resolved' : 'Shop is reviewing'}</strong><small>{outcome.orderId} / {outcome.category.replaceAll('_', ' ')} / owner {outcome.owner}</small></span>
            <b>{outcome.state === 'resolved' ? outcome.resolutionOutcome?.replaceAll('_', ' ') : `${outcome.priority} priority`}</b>
          </article>)}
          {pendingCorrectionIntents.map((intent) => <article className="ecommerce-return-status" key={intent.id}>
            <span><strong>Balance review waiting</strong><small>{intent.orderId} / {intent.requestedKind} {formatMmk(intent.listedAmountMmk)} / {intent.reasonCode.replaceAll('_', ' ')}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => onOpenCorrection(intent)} type="button">Continue in Shop</button>
          </article>)}
          {correctionOutcomes.slice(0, 3).map((outcome) => <article className="ecommerce-return-status" key={`correction-outcome:${outcome.intentId}`}>
            <span><strong>Correction reviewed</strong><small>{outcome.orderId} / {outcome.kind} {formatMmk(outcome.adjustmentTotalMmk)} / reviewed by {outcome.reviewedBy}</small></span>
            <b>Posting review required</b>
          </article>)}
          {orderChangeRecovery?.ok && showOrderHelpActions ? <div className="ecommerce-order-change-recovery" data-ecommerce-order-change-recovery={orderChangeRecovery.draft.orderId} role="status">
            <span><strong>Resume unsent change?</strong><small>{orderChangeRecovery.draft.orderId} can reopen once. Nothing is sent or changed.</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={reopenAmendmentRequest} ref={amendmentRecoveryRef} type="button">Reopen change</button>
          </div> : null}
          {rescheduleRecovery?.ok && showOrderHelpActions ? <div className="ecommerce-order-change-recovery" data-ecommerce-order-reschedule-recovery={rescheduleRecovery.draft.orderId} role="status">
            <span><strong>Resume unsent time?</strong><small>{rescheduleRecovery.draft.orderId} can reopen once. Nothing is sent or changed.</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={reopenRescheduleRequest} ref={rescheduleRecoveryRef} type="button">Reopen time</button>
          </div> : null}
          {showOrderHelpActions ? activeCustomerOrders.map((entry) => {
            const conflict = orderChangeConflictIds.includes(entry.order?.id ?? '')
            const editable = entry.order?.status === 'confirmed' && entry.order.paymentStatus === 'pending' && !conflict
            return <article className="ecommerce-return-status" key={entry.order?.id}>
              <span><strong>{entry.order?.id}</strong><small>{orderStageLabel(entry)} / {formatMmk(entry.order?.total ?? entry.request.totalMmk)}</small></span>
              <div className="ecommerce-return-actions">
                {editable ? <><button className="core-button secondary" disabled={disabled} onClick={() => openRescheduleRequest(entry)} type="button">Change time</button><button className="core-button secondary" disabled={disabled} onClick={() => openAmendmentRequest(entry)} type="button">Change details</button></> : null}
                {!conflict ? <button className="core-button secondary" disabled={disabled} onClick={() => openCancellationRequest(entry)} type="button">Cancel order</button> : null}
              </div>
            </article>
          }) : null}
          {showOrderHelpActions ? completedCustomerOrders.map((entry) => <article className="ecommerce-return-status" key={entry.order?.id}>
            <span><strong>{entry.order?.id}</strong><small>{entry.order?.lines?.map((line) => `${line.name} x ${line.quantity}`).join(' / ') ?? entry.order?.item}</small></span>
            <div className="ecommerce-return-actions">
              {!pendingReturnIntents.some((intent) => intent.orderId === entry.order?.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openReturnRequest(entry)} type="button">Return</button> : null}
              {!pendingSupportIntents.some((intent) => intent.orderId === entry.order?.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openSupportRequest(entry)} type="button">Get help</button> : null}
              {!pendingCorrectionIntents.some((intent) => intent.orderId === entry.order?.id) && entry.order && commerceOrderCorrectionExpectation(commerceState, entry.order.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openCorrectionRequest(entry)} type="button">Fix balance</button> : null}
            </div>
          </article>) : null}
          {amendmentDraft ? <form className="ecommerce-return-form" onSubmit={(event) => void submitAmendmentRequest(event)}>
            <span><strong>Change {amendmentDraft.orderId}</strong><small>Shop reviews and separately confirms any replacement.</small></span>
            <label>What needs correcting?<select disabled={disabled || amendmentBusy} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, mode: event.target.value as 'details' | 'items' } : current)} ref={amendmentModeRef} value={amendmentDraft.mode}><option value="details">Contact or delivery details</option><option value="items">Item quantities</option></select></label>
            {amendmentDraft.mode === 'details' ? <>
              <label>Name<input autoComplete="name" disabled={disabled || amendmentBusy} maxLength={80} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, customerName: event.target.value } : current)} required value={amendmentDraft.customerName} /></label>
              <label>Phone<input autoComplete="tel" disabled={disabled || amendmentBusy} inputMode="tel" maxLength={32} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, customerPhone: event.target.value } : current)} required value={amendmentDraft.customerPhone} /></label>
              {amendmentDraft.fulfilment === 'delivery' ? <>
                <label>Delivery address<input autoComplete="street-address" disabled={disabled || amendmentBusy} maxLength={120} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, addressLine1: event.target.value } : current)} required value={amendmentDraft.addressLine1} /></label>
                <label>Township<input disabled={disabled || amendmentBusy} maxLength={80} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, addressTownship: event.target.value } : current)} required value={amendmentDraft.addressTownship} /></label>
                <label>City<input disabled={disabled || amendmentBusy} maxLength={80} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, addressCity: event.target.value } : current)} required value={amendmentDraft.addressCity} /></label>
                <label>Delivery note<input disabled={disabled || amendmentBusy} maxLength={160} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, deliveryInstructions: event.target.value } : current)} value={amendmentDraft.deliveryInstructions} /></label>
              </> : null}
            </> : amendmentDraft.lines.map((line) => <label key={line.sku}>{line.name}<input disabled={disabled || amendmentBusy} inputMode="numeric" max="99" min="1" onChange={(event) => setAmendmentDraft((current) => current ? { ...current, lines: current.lines.map((candidate) => candidate.sku === line.sku ? { ...candidate, quantity: event.target.value } : candidate) } : current)} required step="1" type="number" value={line.quantity} /></label>)}
            <label className="ecommerce-return-reason">Why change it?<textarea disabled={disabled || amendmentBusy} maxLength={300} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="One clear reason for Shop review" required rows={2} value={amendmentDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || amendmentBusy} type="submit">{amendmentBusy ? 'Saving…' : 'Send correction to Shop'}</button><button className="core-button secondary" disabled={disabled || amendmentBusy} onClick={closeAmendmentRequest} type="button">Close</button></div>
          </form> : null}
          {rescheduleDraft ? <form className="ecommerce-return-form" onSubmit={(event) => void submitRescheduleRequest(event)}>
            <span><strong>Change time for {rescheduleDraft.orderId}</strong><small>Shop reviews the time before any replacement.</small></span>
            <label>Requested date and time<input disabled={disabled || rescheduleBusy} min={localPromiseInput(new Date(quoteClock + 30 * 60 * 1000))} onInput={(event) => setRescheduleDraft({ ...rescheduleDraft, requestedPromisedAt: event.currentTarget.value })} ref={rescheduleDateRef} required type="datetime-local" value={rescheduleDraft.requestedPromisedAt} /></label>
            <label className="ecommerce-return-reason">Why change it?<textarea disabled={disabled || rescheduleBusy} maxLength={300} onChange={(event) => setRescheduleDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="One clear reason for Shop review" required rows={2} value={rescheduleDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || rescheduleBusy} type="submit">{rescheduleBusy ? 'Saving…' : 'Send time to Shop'}</button><button className="core-button secondary" disabled={disabled || rescheduleBusy} onClick={closeRescheduleRequest} type="button">Close</button></div>
          </form> : null}
          {cancellationDraft ? <form className="ecommerce-return-form" onSubmit={(event) => void submitCancellationRequest(event)}>
            <span><strong>Cancel {cancellationDraft.orderId}</strong><small>Shop must recheck the order, reserved stock, payment, and refund impact.</small></span>
            <label>Reason<select disabled={disabled || cancellationBusy} onChange={(event) => setCancellationDraft((current) => current ? { ...current, reasonCode: event.target.value as EcommerceCancellationReasonCode } : current)} value={cancellationDraft.reasonCode}><option value="changed_mind">Changed my mind</option><option value="duplicate_order">Duplicate order</option><option value="order_error">Order details are wrong</option><option value="delivery_too_slow">Delivery will be too late</option><option value="other">Other</option></select></label>
            <label className="ecommerce-return-reason">What should Shop know?<textarea disabled={disabled || cancellationBusy} maxLength={300} onChange={(event) => setCancellationDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="One clear reason for Shop review" required rows={2} value={cancellationDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || cancellationBusy} type="submit">{cancellationBusy ? 'Saving...' : 'Send to Shop review'}</button><button className="core-button secondary" disabled={disabled || cancellationBusy} onClick={() => { setCancellationDraft(null); setNotice('Cancellation request closed. The order is unchanged.') }} type="button">Keep order</button></div>
          </form> : null}
          {returnDraft && returnDraftEntry?.order ? <form className="ecommerce-return-form" onSubmit={(event) => void submitReturnRequest(event)}>
            <span><strong>Return {returnDraft.orderId}</strong><small>Nothing changes until Shop reviews the physical return.</small></span>
            <label>Item<select disabled={disabled || returnBusy || returnDraftLines.length === 1} onChange={(event) => setReturnDraft((current) => current ? { ...current, sku: event.target.value, quantity: '1' } : current)} value={returnDraft.sku}>{returnDraftLines.map((line) => <option key={line.sku} value={line.sku}>{line.name} / {line.remaining} left</option>)}</select></label>
            <label>Quantity<input disabled={disabled || returnBusy} inputMode="numeric" max={returnDraftLines.find((line) => line.sku === returnDraft.sku)?.remaining ?? 1} min="1" onChange={(event) => setReturnDraft((current) => current ? { ...current, quantity: event.target.value } : current)} required step="1" type="number" value={returnDraft.quantity} /></label>
            <label>Item condition<select disabled={disabled || returnBusy} onChange={(event) => setReturnDraft((current) => current ? { ...current, disposition: event.target.value as EcommerceReturnDisposition } : current)} value={returnDraft.disposition}><option value="restock">Unopened / looks sellable</option><option value="not_restocked">Opened / damaged / check it</option></select></label>
            <label className="ecommerce-return-reason">What happened<textarea disabled={disabled || returnBusy} maxLength={300} onChange={(event) => setReturnDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="Describe the issue for Shop review" required rows={2} value={returnDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || returnBusy} type="submit">{returnBusy ? 'Saving...' : 'Send to Shop review'}</button><button className="core-button secondary" disabled={disabled || returnBusy} onClick={() => { setReturnDraft(null); setNotice('Return request closed. Nothing changed.') }} type="button">Cancel</button></div>
          </form> : null}
          {supportDraft ? <form className="ecommerce-return-form" onSubmit={(event) => void submitSupportRequest(event)}>
            <span><strong>Help with {supportDraft.orderId}</strong><small>Shop will open a trackable case after review.</small></span>
            <label>Topic<select disabled={disabled || supportBusy} onChange={(event) => setSupportDraft((current) => current ? { ...current, category: event.target.value as EcommerceSupportCategory } : current)} value={supportDraft.category}><option value="order_status">Order status</option><option value="delivery_issue">Delivery issue</option><option value="payment_question">Payment question</option><option value="item_issue">Item issue</option><option value="other">Other</option></select></label>
            <label className="ecommerce-return-reason">What do you need?<textarea disabled={disabled || supportBusy} maxLength={300} onChange={(event) => setSupportDraft((current) => current ? { ...current, description: event.target.value } : current)} placeholder="One clear description for Shop" required rows={2} value={supportDraft.description} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || supportBusy} type="submit">{supportBusy ? 'Saving...' : 'Send to Shop review'}</button><button className="core-button secondary" disabled={disabled || supportBusy} onClick={() => { setSupportDraft(null); setNotice('Help request closed. Nothing changed.') }} type="button">Cancel</button></div>
          </form> : null}
          {correctionDraft ? <form className="ecommerce-return-form" onSubmit={(event) => void submitCorrectionRequest(event)}>
            <span><strong>Fix balance for {correctionDraft.orderId}</strong><small>Shop recalculates tax and records a review-only correction note. This does not move money or replace the original invoice.</small></span>
            <label>Balance issue<select disabled={disabled || correctionBusy} onChange={(event) => setCorrectionDraft((current) => current ? { ...current, requestedKind: event.target.value as CommerceCorrectionKind } : current)} value={correctionDraft.requestedKind}><option value="credit">Charged too much / reduce balance</option><option value="debit">Charged too little / increase balance</option></select></label>
            <label>Reason<select disabled={disabled || correctionBusy} onChange={(event) => setCorrectionDraft((current) => current ? { ...current, reasonCode: event.target.value as CommerceCorrectionReasonCode } : current)} value={correctionDraft.reasonCode}><option value="pricing_error">Pricing error</option><option value="service_recovery">Service recovery</option><option value="fee_adjustment">Fee adjustment</option><option value="other">Other</option></select></label>
            <label>Amount before tax (MMK)<input disabled={disabled || correctionBusy} inputMode="numeric" min="1" onChange={(event) => setCorrectionDraft((current) => current ? { ...current, listedAmountMmk: event.target.value } : current)} required step="1" type="number" value={correctionDraft.listedAmountMmk} /></label>
            <label className="ecommerce-return-reason">What is wrong?<textarea disabled={disabled || correctionBusy} maxLength={300} onChange={(event) => setCorrectionDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="One clear reason for Shop review" required rows={2} value={correctionDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || correctionBusy} type="submit">{correctionBusy ? 'Saving...' : 'Send balance review'}</button><button className="core-button secondary" disabled={disabled || correctionBusy} onClick={() => { setCorrectionDraft(null); setNotice('Balance review closed. Nothing changed.') }} type="button">Cancel</button></div>
          </form> : null}
          {!activeCustomerOrders.length && !completedCustomerOrders.length && !pendingAmendmentIntents.length && !pendingRescheduleIntents.length && !pendingCancellationIntents.length && !pendingReturnIntents.length && !pendingSupportIntents.length && !pendingCorrectionIntents.length ? <p>Active and completed orders for this exact contact will appear here.</p> : null}
        </div>
      </details>
    </>
  )
}
