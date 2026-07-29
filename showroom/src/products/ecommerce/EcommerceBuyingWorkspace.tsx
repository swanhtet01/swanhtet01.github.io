import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import {
  buildEcommerceCheckoutQuote,
  buildEcommerceOrderRequestV2,
  buildEcommercePimProjection,
  buildEcommerceReturnIntent,
  createEmptyEcommerceBuyingState,
  ecommerceBuyingStateStorageKey,
  ecommercePaymentMatchesFulfilment,
  prepareEcommerceShopDraftV2,
  readEcommerceBuyingState,
  saveEcommerceOrderRequestV2,
  saveEcommerceReturnIntent,
  type EcommerceBuyingState,
  type EcommerceCartLine,
  type EcommerceFulfilment,
  type EcommercePaymentAdapter,
  type EcommerceReturnDisposition,
  type EcommerceReturnIntent,
  type EcommerceShopDraftV2,
} from './ecommerce-buying-lifecycle'
import {
  commerceStorefrontOrderTimeline,
  commerceStorefrontRequests,
  type CommerceItem,
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
  onDraft: (draft: EcommerceShopDraftV2) => void
  onOpenManagedRequest?: (requestId: string) => void
  onOpenReturns: (intent: EcommerceReturnIntent) => void
  onRecordManagedRequest?: (request: EcommerceBuyingState['requests'][number]) => Promise<void>
  preview: StorefrontPreview
  scope: string
  sourcePreviewDigest: string
  sourceStorefront: { revision: number; actionId: string } | null
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
  onDraft,
  onOpenManagedRequest,
  onOpenReturns,
  onRecordManagedRequest,
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
  const [customerReference, setCustomerReference] = useState('')
  const [fulfilment, setFulfilment] = useState<EcommerceFulfilment>('pickup')
  const [paymentAdapter, setPaymentAdapter] = useState<EcommercePaymentAdapter>('pay_on_pickup')
  const [promotionCode, setPromotionCode] = useState('')
  const [open, setOpen] = useState(false)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [handoffBusy, setHandoffBusy] = useState(false)
  const [handoffConfirmed, setHandoffConfirmed] = useState(false)
  const [freshQuoteId, setFreshQuoteId] = useState('')
  const [quoteClock, setQuoteClock] = useState(() => Date.now())
  const [notice, setNotice] = useState('')
  const [returnDraft, setReturnDraft] = useState<{
    orderId: string
    sku: string
    quantity: string
    disposition: EcommerceReturnDisposition
    reason: string
  } | null>(null)
  const [returnBusy, setReturnBusy] = useState(false)
  const confirmationRef = useRef<HTMLInputElement>(null)

  const emptyBuyingState = useMemo(() => createEmptyEcommerceBuyingState(scope), [scope])
  const activeBuyingState = buyingState.scope === scope ? buyingState : emptyBuyingState
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
      setCustomerReference('')
      setFulfilment('pickup')
      setPaymentAdapter('pay_on_pickup')
      setPromotionCode('')
      setOpen(false)
      setHandoffConfirmed(false)
      setFreshQuoteId('')
      setReturnDraft(null)
      setNotice('')
      const latest = recoveredState.requests[0]
      if (!latest || latest.sourcePreviewDigest !== sourcePreviewDigest) return
      onCartChange(latest.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
      setCustomerReference(latest.customerReference)
      setFulfilment(latest.fulfilment)
      setPaymentAdapter(latest.quote.payment.adapter)
      setPromotionCode(latest.quote.promotion.code ?? '')
      setOpen(true)
      const stillFresh = Date.parse(latest.quote.expiresAt) > Date.now()
      setFreshQuoteId(stillFresh ? latest.id : '')
      setQuoteClock(Date.now())
      setNotice(stillFresh
        ? `${latest.id} recovered on this device. Review current Shop values before handoff.`
        : `${latest.id} was recovered, but its quote expired. Review a new total.`)
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
        setHandoffConfirmed(false)
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
      setHandoffConfirmed(false)
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
  const trackedCustomerReference = customerReference.trim() || latestRequest?.customerReference || ''
  const customerOrderTimeline = combinedOrderTimeline.filter((entry) => (
    trackedCustomerReference && entry.request.customerReference === trackedCustomerReference
  ))
  const completedCustomerOrders = customerOrderTimeline.filter((entry) => entry.stage === 'completed' && entry.order?.completion)
  const returnDraftEntry = returnDraft
    ? completedCustomerOrders.find((entry) => entry.order?.id === returnDraft.orderId) ?? null
    : null
  const returnDraftLines = returnDraftEntry?.order?.lines?.map((line) => {
    const returned = (returnDraftEntry.order?.returns ?? [])
      .filter((record) => record.sku === line.sku)
      .reduce((total, record) => total + record.quantity, 0)
    return { ...line, remaining: line.quantity - returned }
  }).filter((line) => line.remaining > 0) ?? []
  const pendingReturnIntents = activeBuyingState.returnIntents.filter((intent) => {
    const order = completedCustomerOrders.find((entry) => entry.order?.id === intent.orderId)?.order
    return Boolean(order && !(order.returns ?? []).some((record) => (
      record.evidenceReference === intent.evidenceReference
        && record.sku === intent.sku
        && record.quantity === intent.quantity
    )))
  })
  const quoteCurrent = Boolean(latestRequest
    && latestRequest.id === freshQuoteId
    && latestRequest.scope === scope
    && latestRequest.sourcePreviewDigest === sourcePreviewDigest
    && latestRequest.customerReference === customerReference.trim()
    && latestRequest.fulfilment === fulfilment
    && latestRequest.quote.payment.adapter === paymentAdapter
    && (latestRequest.quote.promotion.code ?? '') === promotionCode.trim()
    && cartMatchesRequest(cart, latestRequest))
  const cartItems = useMemo(() => cart.map((line) => ({
    ...line,
    item: preview.items.find((item) => item.sku === line.sku),
  })), [cart, preview.items])
  const cartTotal = cartItems.reduce((total, line) => (
    total + (line.item?.unitPriceMmk ?? 0) * line.quantity
  ), 0)
  const recoveryBlocked = recoveryStatus !== 'empty' && recoveryStatus !== 'ready'
  const quoteMinutesRemaining = latestRequest
    ? Math.max(0, Math.ceil((Date.parse(latestRequest.quote.expiresAt) - quoteClock) / 60000))
    : 0
  const orderAutopilotNext = recoveryBlocked
    ? 'Repair checkout recovery'
    : !cart.length
      ? 'Add product'
      : !quoteCurrent
        ? 'Review order'
        : !handoffConfirmed
          ? 'Confirm reviewed quote'
          : 'Open in Shop'
  const orderAutopilotBoundary = onRecordManagedRequest
    ? 'Managed Shop inbox only. Stock, delivery, message, and payment still need Shop review.'
    : 'Browser-local quote only. No stock, delivery, message, payment, or Shop record changes here.'
  const orderAutopilotRows = [
    ['Cart', cart.length ? `${cart.length} ${cart.length === 1 ? 'item' : 'items'}` : 'Empty'],
    ['Quote', quoteCurrent ? `${quoteMinutesRemaining} min left` : latestRequest ? 'Review again' : 'Not quoted'],
    ['Recovery', recoveryBlocked ? 'Blocked' : recoveryStatus === 'ready' ? 'Ready' : 'Local'],
    ['Shop handoff', quoteCurrent ? handoffConfirmed ? 'Approved to open' : 'Needs owner check' : 'Locked'],
    ['Payment', 'Not charged'],
  ] as const

  function updateCart(sku: string, quantity: number) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) return
    onCartChange(cart.map((line) => line.sku === sku ? { ...line, quantity } : line))
    setNotice('Cart changed. Review a new total before Shop handoff.')
  }

  function removeFromCart(sku: string) {
    onCartChange(cart.filter((line) => line.sku !== sku))
    setNotice('Item removed. No Shop record or payment changed.')
  }

  function changeFulfilment(next: EcommerceFulfilment) {
    setFulfilment(next)
    setPaymentAdapter((current) => ecommercePaymentMatchesFulfilment(next, current)
      ? current
      : next === 'delivery' ? 'cash_on_delivery' : 'pay_on_pickup')
    setHandoffConfirmed(false)
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
    setCustomerReference(entry.request.customerReference)
    changeFulfilment(entry.request.fulfilment)
    setPromotionCode('')
    setHandoffConfirmed(false)
    setFreshQuoteId('')
    setOpen(true)
    setNotice(blockedCount
      ? `${nextCart.length} available line${nextCart.length === 1 ? '' : 's'} added at current prices; ${blockedCount} unavailable line${blockedCount === 1 ? '' : 's'} skipped. Review a new quote.`
      : 'Previous items added at current prices. Review a new quote; no Shop order, stock, message, or payment changed.')
  }

  function orderStageLabel(entry: CommerceStorefrontOrderTimelineEntry) {
    if (entry.stage === 'waiting_shop_review') return 'Waiting for Shop review'
    if (entry.stage === 'confirmed') return 'Confirmed'
    if (entry.stage === 'preparing') return 'Preparing'
    if (entry.stage === 'ready') return entry.request.fulfilment === 'pickup' ? 'Ready for pickup' : 'Ready for delivery'
    if (entry.stage === 'completed') return 'Completed'
    return 'Cancelled'
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
    setReturnDraft({ orderId: order.id, sku: lines[0].sku, quantity: '1', disposition: 'restock', reason: '' })
    setNotice('Describe the return, then send the exact request to Shop review. No refund or stock change starts here.')
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

  async function reviewOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || quoteBusy || recoveryBlocked || !cart.length) return
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
        && retained.customerReference === customerReference.trim()
        && retained.fulfilment === fulfilment
        && retained.quote.payment.adapter === paymentAdapter
        && (retained.quote.promotion.code ?? '') === promotionCode.trim()
        && retained.quote.pimDigest === pim.pimDigest
        && Date.parse(retained.quote.expiresAt) > quotedAt.getTime()
        && cartMatchesRequest(cart, retained))
      if (retainedMatches && retained && onRecordManagedRequest) {
        await onRecordManagedRequest(retained)
        setHandoffConfirmed(false)
        setFreshQuoteId(retained.id)
        setQuoteClock(quotedAt.getTime())
        setNotice('This quote is confirmed in the managed Shop inbox. No order, stock, message, or charge changed.')
        requestAnimationFrame(() => {
          confirmationRef.current?.scrollIntoView({ block: 'center' })
          confirmationRef.current?.focus({ preventScroll: true })
        })
        return
      }
      const quote = await buildEcommerceCheckoutQuote({
        pim,
        cart,
        customerReference,
        fulfilment,
        paymentAdapter,
        promotionCode: promotionCode.trim() || null,
        idempotencyKey: `ECI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        quotedAt: quotedAt.toISOString(),
        expiresAt: new Date(quotedAt.getTime() + 15 * 60 * 1000).toISOString(),
      })
      const request = await buildEcommerceOrderRequestV2(quote, sourceStorefront)
      const saved = await saveEcommerceOrderRequestV2(scope, request, activeBuyingState.headDigest)
      setBuyingState(saved)
      setRecoveryRead({ scope, status: 'ready', issue: '' })
      setHandoffConfirmed(false)
      setFreshQuoteId('')
      if (onRecordManagedRequest) await onRecordManagedRequest(request)
      setFreshQuoteId(request.id)
      setQuoteClock(quotedAt.getTime())
      setNotice(onRecordManagedRequest
        ? 'This quote is saved to the managed Shop inbox and local recovery. No order, stock, message, or charge changed.'
        : 'This quote is saved on this device for 15 minutes. No order, stock, message, or charge changed.')
      requestAnimationFrame(() => {
        confirmationRef.current?.scrollIntoView({ block: 'center' })
        confirmationRef.current?.focus({ preventScroll: true })
      })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Checkout review failed closed.')
    } finally {
      setQuoteBusy(false)
    }
  }

  async function openInShop() {
    if (!latestRequest || !quoteCurrent || !handoffConfirmed || handoffBusy) return
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
        confirmedAt: new Date().toISOString(),
      })
      if (onOpenManagedRequest) {
        setNotice(`${latestRequest.id} is ready in the managed Shop inbox. Payment remains unauthorized.`)
        onOpenManagedRequest(latestRequest.id)
      } else {
        setNotice(`${draft.id} is ready for accountable Shop review. Payment remains unauthorized.`)
        onDraft(draft)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Shop handoff failed closed.')
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
      >
        <summary>
          <span><strong>Cart and checkout</strong><small>Review one total before Shop</small></span>
          <b>{cart.length ? `${cart.length} ${cart.length === 1 ? 'item' : 'items'}` : latestRequest ? 'Recovered' : 'Empty'}</b>
        </summary>
        <div className="ecommerce-buying-body">
          <section className="ecommerce-order-autopilot" aria-label="Order autopilot">
            <div><span>Order autopilot</span><strong>{orderAutopilotNext}</strong><small>{orderAutopilotBoundary}</small></div>
            <div className="ecommerce-order-autopilot-rows">{orderAutopilotRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
          </section>
          {cart.length ? (
            <div className="ecommerce-cart" aria-label="Cart items">
              {cartItems.map(({ item, quantity, sku }) => (
                <div className="ecommerce-cart-line" key={sku}>
                  <span>
                    <strong>{item?.name ?? sku}</strong>
                    <small>{item?.variant || sku} · {item ? formatMmk(item.unitPriceMmk) : 'Unavailable'}</small>
                  </span>
                  <label>
                    <span className="sr-only">Quantity for {item?.name ?? sku}</span>
                    <input aria-label={`Quantity for ${item?.name ?? sku}`} max={99} min={1} onChange={(event) => updateCart(sku, Number(event.target.value))} type="number" value={quantity} />
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

          <form onSubmit={(event) => void reviewOrder(event)}>
            <label>
              <span>{fulfilment === 'delivery' ? 'Phone and delivery area' : 'Name and phone'}</span>
              <input maxLength={80} onChange={(event) => { setCustomerReference(event.target.value); setHandoffConfirmed(false) }} placeholder={fulfilment === 'delivery' ? 'e.g. 09… · Hlaing' : 'e.g. Ma Su · 09…'} required value={customerReference} />
            </label>
            <label>
              <span>Receive order</span>
              <select onChange={(event) => changeFulfilment(event.target.value as EcommerceFulfilment)} value={fulfilment}>
                <option value="pickup">Pickup · included</option>
                <option value="delivery">Delivery · Shop confirms</option>
              </select>
            </label>
            <label>
              <span>Payment</span>
              <select onChange={(event) => { setPaymentAdapter(event.target.value as EcommercePaymentAdapter); setHandoffConfirmed(false) }} value={paymentAdapter}>
                {fulfilment === 'pickup'
                  ? <option value="pay_on_pickup">Pay on pickup</option>
                  : <option value="cash_on_delivery">Cash on delivery</option>}
                <option value="kbzpay_manual">KBZPay · manual confirmation</option>
              </select>
            </label>
            <label>
              <span>Promotion code <small>optional · Shop checks it</small></span>
              <input maxLength={40} onChange={(event) => { setPromotionCode(event.target.value); setHandoffConfirmed(false) }} placeholder="Optional" value={promotionCode} />
            </label>
            {!quoteCurrent ? <button className="core-button primary" disabled={disabled || quoteBusy || recoveryBlocked || !cart.length} type="submit">
              {quoteBusy ? 'Checking…' : 'Review order'}
            </button> : null}
          </form>

          {latestRequest ? (
            <article className="ecommerce-request-receipt ecommerce-quote-receipt" data-current={quoteCurrent ? 'true' : 'false'}>
              <span className="status-pill bounded">{quoteCurrent ? 'Ready for Shop' : 'Review again'}</span>
              <strong>Quote for {latestRequest.customerReference}</strong>
              <b>{formatMmk(latestRequest.totalMmk)}</b>
              <div className="ecommerce-quote-boundaries">
                <span><small>Receive order</small><b>{receiveOrderLabel(latestRequest.fulfilment)}</b></span>
                <span><small>Tax</small><b>Included in listed price</b></span>
                <span><small>Payment</small><b>{paymentLabel(latestRequest.quote.payment.adapter)} · not charged</b></span>
              </div>
              <small>Reference {latestRequest.id} · valid until {new Date(latestRequest.quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              <label className="website-intake-confirm ecommerce-quote-confirm">
                <input checked={handoffConfirmed} disabled={!quoteCurrent || handoffBusy} onChange={(event) => setHandoffConfirmed(event.target.checked)} ref={confirmationRef} type="checkbox" />
                <span>I reviewed every item, the MMK total, how I receive it, and the payment method.</span>
              </label>
              <button className="core-button primary" disabled={!quoteCurrent || !handoffConfirmed || handoffBusy} onClick={() => void openInShop()} type="button">
                {handoffBusy ? 'Checking Shop…' : 'Open in Shop'}
              </button>
            </article>
          ) : null}

          <section className="ecommerce-order-tracking" aria-label="Customer order tracking">
            <div className="ecommerce-order-tracking-head">
              <span><strong>Your orders</strong><small>One request, followed through Shop</small></span>
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
                       {entry.order?.promisedAt ? <small>Promise {new Date(entry.order.promisedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small> : <small>Shop confirms the promise</small>}
                       {entry.returnedQuantity ? <small>{entry.returnedQuantity} returned in Shop</small> : null}
                    </div>
                    <button className="core-button secondary" disabled={disabled} onClick={() => reorder(entry)} type="button">Reorder</button>
                  </article>
                ))}
              </div>
            ) : <p>Use the same name and phone as checkout to see request, fulfilment, and payment status here.</p>}
          </section>

          <p className="form-notice ecommerce-buying-notice" aria-live="polite">{recoveryStatus === 'checking'
            ? 'Checking saved checkout recovery…'
            : recoveryIssue || notice || (cart.length
              ? 'Review the cart. Shop remains the only order, stock, delivery, refund, and payment authority.'
              : 'Add a product to begin.')}</p>
        </div>
      </details>

      <details className="ecommerce-after-purchase" open={Boolean(returnDraft) || undefined}>
        <summary><span><strong>After purchase</strong><small>Request a return from a completed order</small></span><b>{pendingReturnIntents.length ? `${pendingReturnIntents.length} waiting` : 'Shop review'}</b></summary>
        <div className="ecommerce-return-workspace">
          <p>Completed Ecommerce orders use Shop’s proven return quantity, stock disposition, and refund record. No refund starts here.</p>
          {pendingReturnIntents.map((intent) => <article className="ecommerce-return-status" key={intent.id}>
            <span><strong>Waiting for Shop review</strong><small>{intent.quantity} {intent.sku} / {intent.orderId}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => onOpenReturns(intent)} type="button">Continue in Shop</button>
          </article>)}
          {!returnDraft ? completedCustomerOrders.filter((entry) => (
            !pendingReturnIntents.some((intent) => intent.orderId === entry.order?.id)
          )).map((entry) => <article className="ecommerce-return-status" key={entry.order?.id}>
            <span><strong>{entry.order?.id}</strong><small>{entry.order?.lines?.map((line) => `${line.name} x ${line.quantity}`).join(' / ') ?? entry.order?.item}</small></span>
            <button className="core-button secondary" disabled={disabled} onClick={() => openReturnRequest(entry)} type="button">Start return</button>
          </article>) : null}
          {returnDraft && returnDraftEntry?.order ? <form className="ecommerce-return-form" onSubmit={(event) => void submitReturnRequest(event)}>
            <span><strong>Return {returnDraft.orderId}</strong><small>Nothing changes until Shop reviews the physical return.</small></span>
            <label>Item<select disabled={disabled || returnBusy || returnDraftLines.length === 1} onChange={(event) => setReturnDraft((current) => current ? { ...current, sku: event.target.value, quantity: '1' } : current)} value={returnDraft.sku}>{returnDraftLines.map((line) => <option key={line.sku} value={line.sku}>{line.name} / {line.remaining} left</option>)}</select></label>
            <label>Quantity<input disabled={disabled || returnBusy} inputMode="numeric" max={returnDraftLines.find((line) => line.sku === returnDraft.sku)?.remaining ?? 1} min="1" onChange={(event) => setReturnDraft((current) => current ? { ...current, quantity: event.target.value } : current)} required step="1" type="number" value={returnDraft.quantity} /></label>
            <label>Item condition<select disabled={disabled || returnBusy} onChange={(event) => setReturnDraft((current) => current ? { ...current, disposition: event.target.value as EcommerceReturnDisposition } : current)} value={returnDraft.disposition}><option value="restock">Unopened / looks sellable</option><option value="not_restocked">Opened / damaged / check it</option></select></label>
            <label className="ecommerce-return-reason">What happened<textarea disabled={disabled || returnBusy} maxLength={300} onChange={(event) => setReturnDraft((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="Describe the issue for Shop review" required rows={2} value={returnDraft.reason} /></label>
            <div className="ecommerce-return-actions"><button className="core-button primary" disabled={disabled || returnBusy} type="submit">{returnBusy ? 'Saving...' : 'Send to Shop review'}</button><button className="core-button secondary" disabled={disabled || returnBusy} onClick={() => { setReturnDraft(null); setNotice('Return request closed. Nothing changed.') }} type="button">Cancel</button></div>
          </form> : null}
          {!completedCustomerOrders.length && !pendingReturnIntents.length ? <p>Completed orders for this exact contact will appear here when they become returnable.</p> : null}
        </div>
      </details>
    </>
  )
}
