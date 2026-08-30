import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { recordBehaviorSignal } from '../../core/behavior-trail'
import { emitMetric } from '../../analytics/metrics-collector'

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
  ecommerceAvailablePaymentAdapters,
  ecommerceBuyingStateStorageKey,
  ecommercePaymentMatchesFulfilment,
  prepareEcommerceShopDraftV2,
  projectEcommerceReturnOutcome,
  projectEcommerceCorrectionOutcome,
  projectEcommerceSupportOutcome,
  readEcommerceBuyingState,
  saveEcommerceOrderRequestV2,
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
  type EcommerceFulfilment,
  type EcommercePaymentAdapter,
  type EcommerceReturnDisposition,
  type EcommerceReturnIntent,
  type EcommerceSupportCategory,
  type EcommerceSupportIntent,
  type EcommerceShopDraftV2,
} from './ecommerce-buying-lifecycle'
import {
  commerceOrderAcknowledgementReader,
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
  onContinueInShop: (requestId: string) => void
  onDraft: (draft: EcommerceShopDraftV2) => void
  onOpenManagedRequest?: (requestId: string) => void
  onOpenCancellation: (intent: EcommerceCancellationIntent) => void
  onOpenCorrection: (intent: EcommerceCorrectionIntent) => void
  onOpenAmendment: (intent: EcommerceOrderAmendmentIntent) => void
  onOpenReschedule: (intent: EcommerceOrderRescheduleIntent) => void
  onOpenReturns: (intent: EcommerceReturnIntent) => void
  onOpenSupport: (intent: EcommerceSupportIntent) => void
  onRecordManagedRequest?: (request: EcommerceBuyingState['requests'][number]) => Promise<void>
  onRequestStateChange: (state: 'idle' | 'waiting_shop_review' | 'confirmed') => void
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
  onContinueInShop,
  onDraft,
  onOpenManagedRequest,
  onOpenCancellation,
  onOpenCorrection,
  onOpenAmendment,
  onOpenReschedule,
  onOpenReturns,
  onOpenSupport,
  onRecordManagedRequest,
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
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [handoffBusy, setHandoffBusy] = useState(false)
  const [freshQuoteId, setFreshQuoteId] = useState('')
  const [quoteClock, setQuoteClock] = useState(() => Date.now())
  const [notice, setNotice] = useState('')
  const [cartDrafts, setCartDrafts] = useState<Record<string, string>>({})
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
  const [amendmentDraft, setAmendmentDraft] = useState<{
    orderId: string
    mode: 'details' | 'items'
    fulfilment: EcommerceFulfilment
    lines: Array<{ sku: string; name: string; quantity: string }>
    customerName: string
    customerPhone: string
    addressLine1: string
    addressTownship: string
    addressCity: string
    deliveryInstructions: string
    reason: string
  } | null>(null)
  const [amendmentBusy, setAmendmentBusy] = useState(false)
  const [rescheduleDraft, setRescheduleDraft] = useState<{ orderId: string; requestedPromisedAt: string; reason: string } | null>(null)
  const [rescheduleBusy, setRescheduleBusy] = useState(false)
  const requestReceiptRef = useRef<HTMLElement>(null)
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

  useEffect(() => {
    let current = true
    void readEcommerceBuyingState(scope).then((result) => {
      if (!current) return
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
      setFreshQuoteId('')
      setReturnDraft(null)
      setSupportDraft(null)
      setCorrectionDraft(null)
      setCancellationDraft(null)
      setAmendmentDraft(null)
      setRescheduleDraft(null)
      setNotice('')
      const latest = recoveredState.requests[0]
      if (!latest || latest.sourcePreviewDigest !== sourcePreviewDigest) return
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
    const latest = activeBuyingState.requests[0]
    if (!latest || latest.id !== freshQuoteId) return
    const remainingMs = Date.parse(latest.quote.expiresAt) - Date.now()
    const timeoutId = window.setTimeout(() => {
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
  // One validated workspace for every intent on this screen, not one per intent.
  //
  // The cancellation, amendment and reschedule loops below each ask for an order
  // acknowledgement per intent, and commerceOrderAcknowledgement validates the ENTIRE
  // workspace on every call. Unlike the Shop map #539 fixed, these three loops are not in a
  // memo at all -- they are in the component body, so they re-ran on every keystroke in the
  // customer name, phone or address fields.
  //
  // Measured 2026-08-21 against the buying contract's own enforced ceiling, driven through
  // the real exported transitions (100 requests, 100 orders, 100 cancellation intents -- the
  // most the contract will hold; see the note in test_ecommerce_order_coexistence.mjs) on a
  // workspace at its 2 MiB storage ceiling (2,192 orders, 2,096,352 bytes):
  //
  //   as shipped        100 validations   5.8 s per render     56.8 s over ten renders
  //   one reader        one validation    0.07 s               0.68 s over ten renders
  //   memoized here     one validation    0.07 s               0.07 s over ten renders
  //
  // Keyed on commerceState, which is a new object only when the workspace actually changes,
  // so typing in a field no longer revalidates anything. Reading many documents out of one
  // validated state is sound because validateCommerceState is a predicate rather than a
  // normaliser -- pinned in test_commerce_state_validator.mjs -- and every document still
  // comes from a state that was validated; the same state is now checked once, not 100 times.
  const readOrderAcknowledgement = useMemo(() => commerceOrderAcknowledgementReader(commerceState), [commerceState])
  const latestRequestEntry = latestRequest
    ? combinedOrderTimeline.find((entry) => entry.request.id === latestRequest.id) ?? null
    : null
  const latestRequestOrder = latestRequestEntry?.order ?? null
  const customerRequestState = latestRequestOrder ? 'confirmed' : latestRequest ? 'waiting_shop_review' : 'idle'
  useEffect(() => onRequestStateChange(customerRequestState), [customerRequestState, onRequestStateChange])
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
    const acknowledgement = entry?.order ? readOrderAcknowledgement(entry.order.id) : null
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
    const acknowledgement = originalEntry?.order ? readOrderAcknowledgement(originalEntry.order.id) : null
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
    const acknowledgement = originalEntry?.order ? readOrderAcknowledgement(originalEntry.order.id) : null
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
  const cartItems = useMemo(() => cart.map((line) => ({
    ...line,
    item: preview.items.find((item) => item.sku === line.sku),
  })), [cart, preview.items])
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
  const quoteCurrent = Boolean(latestRequest
    && latestRequest.id === freshQuoteId
    && latestRequest.scope === scope
    && latestRequest.sourcePreviewDigest === sourcePreviewDigest
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
    && cartMatchesRequest(cart, latestRequest))
  const latestRequestConfirmed = Boolean(latestRequestOrder && quoteCurrent)
  const recoveryBlocked = recoveryStatus !== 'empty' && recoveryStatus !== 'ready'
  const recoveredCheckoutNotice = latestRequest
    ? Date.parse(latestRequest.quote.expiresAt) > quoteClock
      ? `${latestRequest.id} recovered on this device. It remains waiting for Shop review.`
      : `${latestRequest.id} was recovered, but its quote expired. Review a new total.`
    : ''
  const checkoutNotice = latestRequestConfirmed && latestRequestOrder
    ? `${latestRequest?.id} is confirmed as ${latestRequestOrder.id}. ${latestRequestEntry?.paymentStatus === 'reconciled' ? 'Payment is reconciled in Shop.' : 'Payment still needs Shop reconciliation.'}`
    : notice || (latestRequestOrder
      ? `${latestRequest?.id} is already confirmed as ${latestRequestOrder.id}. Review a new total only to start another order.`
      : recoveredCheckoutNotice || recoveryIssue || (cart.length
        ? 'Review the cart. Shop handles orders, stock, delivery, refunds, and payment review.'
        : 'Add a product to begin.'))

  function updateCart(sku: string, quantity: number) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) return
    onCartChange(cart.map((line) => line.sku === sku ? { ...line, quantity } : line))
    setNotice('Cart changed. Review a new total before Shop review.')
  }

  // The input holds a draft string so backspace-then-retype works; the cart only ever stores a
  // valid 1-99 integer, and blur snaps the display back to the real quantity.
  function draftCartQuantity(sku: string, raw: string) {
    setCartDrafts((previous) => ({ ...previous, [sku]: raw }))
    const parsed = Number(raw)
    if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 99) updateCart(sku, parsed)
  }

  function commitCartQuantity(sku: string) {
    setCartDrafts((previous) => {
      const next = { ...previous }
      delete next[sku]
      return next
    })
  }

  function removeFromCart(sku: string) {
    onCartChange(cart.filter((line) => line.sku !== sku))
    setNotice('Item removed. No Shop record or payment changed.')
  }

  function beginAnotherOrder() {
    onCartChange([])
    setFreshQuoteId('')
    setNotice('Ready for a new order. Add products, then review the current total.')
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
      : 'Previous items added at current prices. Review a new quote; no Shop order, stock, message, or payment changed.')
  }

  function orderStageLabel(entry: CommerceStorefrontOrderTimelineEntry) {
    if (entry.stage === 'waiting_shop_review') return quoteExpiredWithoutOrder(entry) ? 'Quote expired' : 'Waiting for Shop review'
    if (entry.stage === 'confirmed') return 'Confirmed'
    if (entry.stage === 'preparing') return 'Preparing'
    if (entry.stage === 'ready') return entry.request.fulfilment === 'pickup' ? 'Ready for pickup' : 'Ready for delivery'
    if (entry.stage === 'completed') return 'Completed'
    return 'Cancelled'
  }

  function quoteExpiredWithoutOrder(entry: CommerceStorefrontOrderTimelineEntry) {
    return !entry.order && 'quote' in entry.request && Date.parse(entry.request.quote.expiresAt) <= quoteClock
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
    setCancellationDraft(null)
    setSupportDraft(null)
    setReturnDraft({ orderId: order.id, sku: lines[0].sku, quantity: '1', disposition: 'restock', reason: '' })
    setNotice('Describe the return, then send the exact request to Shop review. No refund or stock change starts here.')
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
      setNotice('This order already has one recoverable reschedule request.')
      return
    }
    setReturnDraft(null)
    setSupportDraft(null)
    setAmendmentDraft(null)
    setRescheduleDraft(null)
    setCancellationDraft({ orderId: order.id, reasonCode: 'changed_mind', reason: '' })
    setNotice('Tell Shop why you want to cancel. The order, stock, payment, refund, and customer messages stay unchanged until Shop approves.')
  }

  function openAmendmentRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    const lines = order?.lines ?? []
    const request = entry.request
    if (!order || order.status !== 'confirmed' || order.paymentStatus !== 'pending' || order.refundStatus !== 'none' || !lines.length) {
      setNotice('Order changes are available only before preparation and payment confirmation.')
      return
    }
    if (request.schema !== 'supermega.ecommerce.order_request.v2' || !request.customerProfile) {
      setNotice('This order predates verified customer details and cannot be corrected through the replacement workflow.')
      return
    }
    if (activeBuyingState.amendmentIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.cancellationIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has one recoverable change request.')
      return
    }
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    setRescheduleDraft(null)
    setAmendmentDraft({
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
    })
    setNotice('Correct contact, delivery, or item details. Shop replaces the accepted order only after revalidating the exact original and current policies; the replacement still needs human confirmation.')
  }

  function openRescheduleRequest(entry: CommerceStorefrontOrderTimelineEntry) {
    const order = entry.order
    if (!order || order.status !== 'confirmed' || order.paymentStatus !== 'pending' || order.refundStatus !== 'none' || !order.promisedAt) {
      setNotice('Promise changes are available only before preparation and payment confirmation.')
      return
    }
    if (activeBuyingState.amendmentIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === order.id)
      || activeBuyingState.cancellationIntents.some((intent) => intent.orderId === order.id)) {
      setNotice('This order already has one recoverable change or cancellation request.')
      return
    }
    const minimum = quoteClock + 2 * 60 * 60 * 1000
    const afterOriginal = Date.parse(order.promisedAt) + 24 * 60 * 60 * 1000
    setAmendmentDraft(null)
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    setRescheduleDraft({
      orderId: order.id,
      requestedPromisedAt: localPromiseInput(new Date(Math.max(minimum, afterOriginal))),
      reason: '',
    })
    setNotice('Choose a new requested time. Shop will recheck the current promise policy before replacing the original order; no rider or message is sent.')
  }

  async function openRescheduleInShop(intent: EcommerceOrderRescheduleIntent) {
    const replacementRequest = activeBuyingState.requests.find((request) => request.id === intent.replacementRequestId)
    if (!replacementRequest) {
      setNotice('The reschedule replacement request is missing from recovery. Nothing was opened in Shop.')
      return
    }
    try {
      if (onRecordManagedRequest) await onRecordManagedRequest(replacementRequest)
      onOpenReschedule(intent)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The managed reschedule request could not be synchronized. It remains saved locally.')
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
      setNotice('Secure amendment identity or current Ecommerce order evidence is unavailable. Nothing was recorded.')
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
        throw new Error('This order predates verified contact snapshots. Re-enter it with current customer details before requesting a correction.')
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
      setAmendmentDraft(null)
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
      setNotice('Secure reschedule identity or current Ecommerce order evidence is unavailable. Nothing was recorded.')
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
      setRescheduleDraft(null)
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
      setNotice('Secure cancellation identity or current Shop order evidence is unavailable. Nothing was recorded.')
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
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft({ orderId: order.id, category: 'order_status', description: '' })
    setNotice('Describe what you need. Shop will open an accountable case; no message or refund is sent here.')
  }

  async function submitSupportRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supportDraft || supportBusy || disabled || recoveryBlocked) return
    const order = completedCustomerOrders.find((entry) => entry.order?.id === supportDraft.orderId)?.order
    if (!order?.completion || !globalThis.crypto?.randomUUID) {
      setNotice('Secure support identity or completed order evidence is unavailable. Nothing was recorded.')
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
    setCancellationDraft(null)
    setReturnDraft(null)
    setSupportDraft(null)
    setCorrectionDraft({ orderId: order.id, requestedKind: 'credit', reasonCode: 'pricing_error', listedAmountMmk: '', reason: '' })
    setNotice('Describe the balance issue. Shop must recheck tax and totals before recording a review-only correction note.')
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
    if (disabled || quoteBusy || recoveryBlocked || !cart.length) return
    if (!paymentPolicyReady) {
      setNotice(`Shop has no active payment method for ${fulfilment}. Set one up in Shop before reviewing this order.`)
      return
    }
    if (!globalThis.crypto?.randomUUID) {
      setNotice('Secure checkout identity is unavailable. Nothing was recorded.')
      return
    }
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
        await onRecordManagedRequest(retained)
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
      emitMetric({ product: 'ecommerce', capability: 'ecommerce-storefront', action: 'quote.captured', ts: Date.now() })
      const request = await buildEcommerceOrderRequestV2(quote, sourceStorefront)
      const saved = await saveEcommerceOrderRequestV2(scope, request, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      emitMetric({ product: 'ecommerce', capability: 'ecommerce-storefront', action: 'order.request.submitted', ts: Date.now() })
      setFreshQuoteId('')
      if (onRecordManagedRequest) await onRecordManagedRequest(request)
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
        emitMetric({ product: 'ecommerce', capability: 'ecommerce-storefront', action: 'shop.handoff.reached', ts: Date.now() })
        onDraft(draft)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Shop review failed closed.')
    } finally {
      setHandoffBusy(false)
    }
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
        <summary>
          <span><strong>Cart and checkout</strong><small>Review one total before Shop</small></span>
          <b>{cart.length ? `${cart.length} ${cart.length === 1 ? 'item' : 'items'} · ${formatMmk(cartTotal)}` : latestRequest ? 'Recovered' : 'Empty'}</b>
        </summary>
        <div className="ecommerce-buying-body">
          {cart.length ? (
            <div aria-label="Cart items" className="ecommerce-cart" role="group">
              {cartItems.map(({ item, quantity, sku }) => (
                <div className="ecommerce-cart-line" key={sku}>
                  <span>
                    <strong>{item?.name ?? sku}</strong>
                    <small>{item?.variant || sku} · {item ? formatMmk(item.unitPriceMmk) : 'Unavailable'}</small>
                  </span>
                  <label>
                    <span className="sr-only">Quantity for {item?.name ?? sku}</span>
                    <input aria-label={`Quantity for ${item?.name ?? sku}`} inputMode="numeric" max={99} min={1} onBlur={() => commitCartQuantity(sku)} onChange={(event) => draftCartQuantity(sku, event.target.value)} step={1} type="number" value={cartDrafts[sku] ?? String(quantity)} />
                  </label>
                  <b>{item ? formatMmk(item.unitPriceMmk * quantity) : '—'}</b>
                  <button aria-label={`Remove ${item?.name ?? sku}`} onClick={() => removeFromCart(sku)} type="button">Remove</button>
                </div>
              ))}
              <div className="ecommerce-cart-total"><span>Products</span><strong>{formatMmk(cartTotal)}</strong></div>
            </div>
          ) : (
            <div className="ecommerce-cart-empty">
              <strong>Your cart is empty</strong>
              <p>Add an available product above. Nothing goes to Shop until you review the exact quote.</p>
            </div>
          )}

          <form aria-busy={quoteBusy} onSubmit={(event) => void reviewOrder(event)}>
            <label>
              <span>Name</span>
              <input autoComplete="name" maxLength={80} onChange={(event) => setCustomerName(event.target.value)} placeholder="e.g. Ma Su" required value={customerName} />
            </label>
            <label>
              <span>Phone</span>
              <input autoComplete="tel" inputMode="tel" maxLength={32} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="e.g. 09 123 456 789" required type="tel" value={customerPhone} />
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
            {!quoteCurrent && !latestRequestConfirmed ? <button className="core-button primary" disabled={disabled || quoteBusy || recoveryBlocked || !cart.length || !paymentPolicyReady} type="submit">
              {quoteBusy ? 'Sending...' : 'Send order request'}
            </button> : null}
            <p className="form-notice ecommerce-buying-notice" aria-live="polite">{recoveryStatus === 'checking'
              ? 'Checking saved checkout recovery...'
              : checkoutNotice}</p>
          </form>

          {latestRequest ? latestRequestOrder && latestRequestConfirmed ? (
            <article className="ecommerce-request-receipt ecommerce-quote-receipt" data-current="true">
              <span className="status-pill ready">Confirmed in Shop</span>
              <strong>Order {latestRequestOrder.id}</strong>
              <b>{formatMmk(latestRequestOrder.total)}</b>
              <div className="ecommerce-quote-boundaries">
                <span><small>Customer</small><b>{latestRequestOrder.customer}</b></span>
                <span><small>Receive order</small><b>{receiveOrderLabel(latestRequest.fulfilment)}</b></span>
                <span><small>Payment</small><b>{latestRequestEntry?.paymentStatus === 'reconciled' ? 'Confirmed' : 'Pending in Shop'}</b></span>
                <span><small>Promise</small><b>{latestRequestOrder.promisedAt ? new Date(latestRequestOrder.promisedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set'}</b></span>
              </div>
              <small>Request {latestRequest.id} · Shop recorded the order and stock reservation.</small>
              <button className="core-button primary" disabled={disabled} onClick={() => onContinueInShop(latestRequest.id)} type="button">Continue in Shop</button>
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
                {handoffBusy ? 'Opening Shop...' : 'Open Shop operator review'}
              </button>
            </article>
          ) : (
            <div className="ecommerce-stale-quote" role="status">
              <strong>{latestRequestOrder ? 'Start another order' : 'Cart changed — review a new total'}</strong>
              <small>{latestRequestOrder
                ? `Order ${latestRequestOrder.id} is already confirmed. Review a new total only when creating another order.`
                : 'The previous quote remains in Your orders and cannot continue with this cart.'}</small>
            </div>
          ) : null}

          <section className="ecommerce-order-tracking" aria-label="Customer order tracking">
            <div className="ecommerce-order-tracking-head">
              <span><strong>Your orders</strong><small>Quotes and orders, followed through Shop</small></span>
              <b>{customerOrderTimeline.length ? `${customerOrderTimeline.length} found` : 'Enter contact above'}</b>
            </div>
            {customerOrderTimeline.length ? (
              <div className="ecommerce-order-history">
                {customerOrderTimeline.slice(0, 5).map((entry) => (
                  <article key={entry.request.id}>
                    <span>
                      <small>{entry.request.id}</small>
                      <strong>{orderStageLabel(entry)}</strong>
                      <b>{formatMmk(entry.order?.total ?? entry.request.totalMmk)}</b>
                    </span>
                    <div>
                      <small>{entry.request.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</small>
                      <small>{entry.paymentStatus === 'reconciled' ? 'Payment confirmed' : entry.paymentStatus === 'pending' ? 'Payment pending' : 'Payment not charged'}</small>
                       {entry.order?.promisedAt ? <small>Promise {new Date(entry.order.promisedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small> : quoteExpiredWithoutOrder(entry) ? <small>Review again for the current total</small> : <small>Shop confirms the promise</small>}
                       {entry.returnedQuantity ? <small>{entry.returnedQuantity} returned in Shop</small> : null}
                    </div>
                    <button className="core-button secondary" disabled={disabled} onClick={() => reorder(entry)} type="button">Reorder</button>
                  </article>
                ))}
              </div>
            ) : <p>Use the same name and phone as checkout to see request, fulfilment, and payment status here.</p>}
          </section>

        </div>
        {cart.length ? (
          <div className="ecommerce-cart-sticky-bar">
            <span>{cart.length} {cart.length === 1 ? 'item' : 'items'} in the cart</span>
            <b>{formatMmk(cartTotal)}</b>
          </div>
        ) : null}
      </details>

      <details className="ecommerce-after-purchase" open={Boolean(amendmentDraft || rescheduleDraft || cancellationDraft || returnDraft || supportDraft || correctionDraft) || undefined}>
        <summary><span><strong>Order help</strong><small>Change active orders or resolve completed-order issues</small></span><b>{pendingAmendmentIntents.length + pendingRescheduleIntents.length + pendingCancellationIntents.length + pendingReturnIntents.length + pendingSupportIntents.length + pendingCorrectionIntents.length ? `${pendingAmendmentIntents.length + pendingRescheduleIntents.length + pendingCancellationIntents.length + pendingReturnIntents.length + pendingSupportIntents.length + pendingCorrectionIntents.length} waiting` : 'Shop review'}</b></summary>
        <div className="ecommerce-return-workspace">
          <p>Shop reviews every change, cancellation, return, and help request. Nothing here changes an order, stock, payment, refund, delivery, provider, or customer message by itself.</p>
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
          {!amendmentDraft && !rescheduleDraft && !cancellationDraft && !returnDraft && !supportDraft && !correctionDraft ? activeCustomerOrders.map((entry) => <article className="ecommerce-return-status" key={entry.order?.id}>
            <span><strong>{entry.order?.id}</strong><small>{orderStageLabel(entry)} / {formatMmk(entry.order?.total ?? entry.request.totalMmk)}</small></span>
            <div className="ecommerce-return-actions">
              {entry.order?.status === 'confirmed' && entry.order.paymentStatus === 'pending' && !activeBuyingState.amendmentIntents.some((intent) => intent.orderId === entry.order?.id) && !activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === entry.order?.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openRescheduleRequest(entry)} type="button">Change time</button> : null}
              {entry.order?.status === 'confirmed' && entry.order.paymentStatus === 'pending' && !activeBuyingState.amendmentIntents.some((intent) => intent.orderId === entry.order?.id) && !activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === entry.order?.id) && !activeBuyingState.cancellationIntents.some((intent) => intent.orderId === entry.order?.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openAmendmentRequest(entry)} type="button">Change details</button> : null}
              {!activeBuyingState.cancellationIntents.some((intent) => intent.orderId === entry.order?.id) && !activeBuyingState.amendmentIntents.some((intent) => intent.orderId === entry.order?.id) && !activeBuyingState.rescheduleIntents.some((intent) => intent.orderId === entry.order?.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openCancellationRequest(entry)} type="button">Cancel order</button> : null}
            </div>
          </article>) : null}
          {!amendmentDraft && !rescheduleDraft && !cancellationDraft && !returnDraft && !supportDraft && !correctionDraft ? completedCustomerOrders.map((entry) => <article className="ecommerce-return-status" key={entry.order?.id}>
            <span><strong>{entry.order?.id}</strong><small>{entry.order?.lines?.map((line) => `${line.name} x ${line.quantity}`).join(' / ') ?? entry.order?.item}</small></span>
            <div className="ecommerce-return-actions">
              {!pendingReturnIntents.some((intent) => intent.orderId === entry.order?.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openReturnRequest(entry)} type="button">Return</button> : null}
              {!pendingSupportIntents.some((intent) => intent.orderId === entry.order?.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openSupportRequest(entry)} type="button">Get help</button> : null}
              {!pendingCorrectionIntents.some((intent) => intent.orderId === entry.order?.id) && entry.order && commerceOrderCorrectionExpectation(commerceState, entry.order.id) ? <button className="core-button secondary" disabled={disabled} onClick={() => openCorrectionRequest(entry)} type="button">Fix balance</button> : null}
            </div>
          </article>) : null}
          {amendmentDraft ? <form className="ecommerce-return-form" onSubmit={(event) => void submitAmendmentRequest(event)}>
            <span><strong>Change {amendmentDraft.orderId}</strong><small>Shop keeps the accepted order immutable, revalidates this correction, then prepares a separately confirmed replacement.</small></span>
            <label>What needs correcting?<select disabled={disabled || amendmentBusy} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, mode: event.target.value as 'details' | 'items' } : current)} value={amendmentDraft.mode}><option value="details">Contact or delivery details</option><option value="items">Item quantities</option></select></label>
            {amendmentDraft.mode === 'details' ? <>
              <label>Name<input autoComplete="name" disabled={disabled || amendmentBusy} maxLength={80} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, customerName: event.target.value } : current)} required value={amendmentDraft.customerName} /></label>
              <label>Phone<input autoComplete="tel" disabled={disabled || amendmentBusy} inputMode="tel" maxLength={32} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, customerPhone: event.target.value } : current)} required type="tel" value={amendmentDraft.customerPhone} /></label>
              {amendmentDraft.fulfilment === 'delivery' ? <>
                <label>Delivery address<input autoComplete="street-address" disabled={disabled || amendmentBusy} maxLength={120} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, addressLine1: event.target.value } : current)} required value={amendmentDraft.addressLine1} /></label>
                <label>Township<input disabled={disabled || amendmentBusy} maxLength={80} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, addressTownship: event.target.value } : current)} required value={amendmentDraft.addressTownship} /></label>
                <label>City<input disabled={disabled || amendmentBusy} maxLength={80} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, addressCity: event.target.value } : current)} required value={amendmentDraft.addressCity} /></label>
                <label>Delivery note<input disabled={disabled || amendmentBusy} maxLength={160} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, deliveryInstructions: event.target.value } : current)} value={amendmentDraft.deliveryInstructions} /></label>
              </> : null}
            </> : amendmentDraft.lines.map((line) => <label key={line.sku}>{line.name}<input disabled={disabled || amendmentBusy} inputMode="numeric" max="99" min="1" onChange={(event) => setAmendmentDraft((current) => current ? { ...current, lines: current.lines.map((candidate) => candidate.sku === line.sku ? { ...candidate, quantity: event.target.value } : candidate) } : current)} required step="1" type="number" value={line.quantity} /></label>)}
            <label className="ecommerce-return-reason">Why change it?<textarea disabled={disabled || amendmentBusy} maxLength={300} onChange={(event) => setAmendmentDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="One clear reason for Shop review" required rows={2} value={amendmentDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || amendmentBusy} type="submit">{amendmentBusy ? 'Saving...' : 'Send correction to Shop'}</button><button className="core-button secondary" disabled={disabled || amendmentBusy} onClick={() => { setAmendmentDraft(null); setNotice('Order correction closed. Nothing changed.') }} type="button">Close</button></div>
          </form> : null}
          {rescheduleDraft ? <form className="ecommerce-return-form" onSubmit={(event) => void submitRescheduleRequest(event)}>
            <span><strong>Change time for {rescheduleDraft.orderId}</strong><small>Shop checks current delivery and payment policy before cancelling the original. A second confirmation creates the replacement.</small></span>
            <label>Requested date and time<input disabled={disabled || rescheduleBusy} min={localPromiseInput(new Date(quoteClock + 30 * 60 * 1000))} onChange={(event) => setRescheduleDraft((current) => current ? { ...current, requestedPromisedAt: event.target.value } : current)} required type="datetime-local" value={rescheduleDraft.requestedPromisedAt} /></label>
            <label className="ecommerce-return-reason">Why change it?<textarea disabled={disabled || rescheduleBusy} maxLength={300} onChange={(event) => setRescheduleDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="One clear reason for Shop review" required rows={2} value={rescheduleDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || rescheduleBusy} type="submit">{rescheduleBusy ? 'Saving...' : 'Send time to Shop'}</button><button className="core-button secondary" disabled={disabled || rescheduleBusy} onClick={() => { setRescheduleDraft(null); setNotice('Reschedule closed. The order and promise are unchanged.') }} type="button">Close</button></div>
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
