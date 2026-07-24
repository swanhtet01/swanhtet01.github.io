import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  commerceStorefrontRequests,
  recordCommerceStorefrontRequest,
  validateCommerceState,
  type CommerceItem,
  type CommerceState,
} from '../../core/commerce-workspace'
import {
  currentManagedIdentity,
  loadManagedBootstrap,
  saveManagedCommerceCommand,
  type ManagedIdentity,
} from '../../core/managed-trial'
import { confirmEcommerceShopDraft } from './ecommerce-shop-confirm'
import {
  buildStorefrontOrderRequest,
  createEmptyStorefrontRequestLedger,
  recordStorefrontOrderRequest,
} from './storefront-request'
import {
  buildStorefrontPreview,
  readStorefrontCatalog,
  storefrontPreviewDigest,
} from './storefront-model'

type PreviewDevice = 'phone' | 'desktop'
type EcommerceCatalog = {
  source: 'shop-local' | 'sample' | 'unavailable' | 'managed-shop'
  items: CommerceItem[]
  error: string
}
type ManagedInboxContext = {
  identity: ManagedIdentity
  state: CommerceState
  version: number
}

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

export function EcommerceProduct() {
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<EcommerceCatalog>(() => readStorefrontCatalog())
  const [managedIdentity, setManagedIdentity] = useState<ManagedIdentity | null>(null)
  const [managedInbox, setManagedInbox] = useState<ManagedInboxContext | null>(null)
  const initialSelection = useMemo(
    () => catalog.items.filter((item) => item.onHand > 0).slice(0, 4).map((item) => item.sku),
    [catalog.items],
  )
  const [storeName, setStoreName] = useState('My Shop')
  const [summary, setSummary] = useState('Everyday products, clearly priced and ready to request.')
  const [selectedSkus, setSelectedSkus] = useState(initialSelection)
  const [device, setDevice] = useState<PreviewDevice>('phone')
  const [digestState, setDigestState] = useState({ previewJson: '', value: '', error: '' })
  const [requestLedger, setRequestLedger] = useState(createEmptyStorefrontRequestLedger)
  const [requestCustomer, setRequestCustomer] = useState('Customer A')
  const [requestSku, setRequestSku] = useState(initialSelection[0] ?? '')
  const [requestQuantity, setRequestQuantity] = useState(1)
  const [requestFulfilment, setRequestFulfilment] = useState<'pickup' | 'delivery'>('pickup')
  const [requestBusy, setRequestBusy] = useState(false)
  const [requestNotice, setRequestNotice] = useState('')
  const [handoffConfirmed, setHandoffConfirmed] = useState(false)
  const [handoffBusy, setHandoffBusy] = useState(false)

  useEffect(() => {
    let current = true
    void currentManagedIdentity()
      .then(async (identity) => {
        if (!current || !identity) return
        setManagedIdentity(identity)
        const bootstrap = await loadManagedBootstrap()
        if (!current) return
        const record = bootstrap.states.commerce
        if (record.surface !== 'commerce' || !Number.isSafeInteger(record.version) || record.version < 1) {
          setCatalog({ source: 'unavailable', items: [], error: 'Create the managed Shop catalog before opening its Ecommerce storefront.' })
          setSelectedSkus([])
          setRequestSku('')
          setRequestLedger(createEmptyStorefrontRequestLedger())
          setHandoffConfirmed(false)
          return
        }
        const state = validateCommerceState(record.state)
        const available = state.items.filter((item) => item.onHand > 0)
        setSelectedSkus((selected) => {
          const retained = selected.filter((sku) => available.some((item) => item.sku === sku)).slice(0, 8)
          return retained.length ? retained : available.slice(0, 4).map((item) => item.sku)
        })
        setRequestSku((sku) => available.some((item) => item.sku === sku) ? sku : available[0]?.sku ?? '')
        setRequestLedger(createEmptyStorefrontRequestLedger())
        setHandoffConfirmed(false)
        setRequestNotice('')
        setManagedInbox({ identity, state, version: record.version })
        setCatalog({ source: 'managed-shop', items: state.items, error: '' })
      })
      .catch((error) => {
        if (!current) return
        setCatalog({
          source: 'unavailable',
          items: [],
          error: error instanceof Error ? error.message : 'The authenticated Shop catalog could not be loaded.',
        })
        setSelectedSkus([])
        setRequestSku('')
        setRequestLedger(createEmptyStorefrontRequestLedger())
        setHandoffConfirmed(false)
      })
    return () => { current = false }
  }, [])

  const previewResult = useMemo(() => {
    try {
      return {
        preview: buildStorefrontPreview(catalog.items, { storeName, summary, selectedSkus }),
        error: '',
      }
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : 'Storefront preview is invalid.',
      }
    }
  }, [catalog.items, selectedSkus, storeName, summary])
  const previewJson = previewResult.preview ? JSON.stringify(previewResult.preview) : ''

  useEffect(() => {
    let current = true
    if (!previewResult.preview) return () => { current = false }
    void storefrontPreviewDigest(previewResult.preview)
      .then((value) => {
        if (current) setDigestState({ previewJson, value, error: '' })
      })
      .catch((error) => {
        if (current) setDigestState({ previewJson, value: '', error: error instanceof Error ? error.message : 'Preview digest failed.' })
      })
    return () => { current = false }
  }, [previewJson, previewResult.preview])

  function toggleSku(sku: string) {
    setSelectedSkus((current) => (
      current.includes(sku)
        ? current.filter((candidate) => candidate !== sku)
        : current.length < 8 ? [...current, sku] : current
    ))
  }

  async function createRequestReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!previewResult.preview || !digest || requestBusy) return
    if (!globalThis.crypto?.randomUUID) {
      setRequestNotice('Secure request identity is unavailable. Nothing was recorded.')
      return
    }
    setRequestBusy(true)
    setRequestNotice('')
    try {
      const selectedSku = previewResult.preview.items.some((item) => item.sku === requestSku)
        ? requestSku
        : previewResult.preview.items[0]?.sku ?? ''
      const request = await buildStorefrontOrderRequest(previewResult.preview, digest, {
        idempotencyKey: `ECI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        customerReference: requestCustomer,
        sku: selectedSku,
        quantity: requestQuantity,
        fulfilment: requestFulfilment,
        createdAt: new Date().toISOString(),
      })
      const nextLedger = recordStorefrontOrderRequest(requestLedger, request)
      if (!nextLedger) throw new Error('The request receipt conflicted with the current local ledger.')
      setRequestLedger(nextLedger)
      setHandoffConfirmed(false)
      setRequestNotice(`${request.id} is pending Shop review. No Shop record or stock changed.`)
    } catch (error) {
      setRequestNotice(error instanceof Error ? error.message : 'Request receipt failed closed.')
    } finally {
      setRequestBusy(false)
    }
  }

  async function sendToShopReview() {
    if (!latestRequest || !previewResult.preview || !digest || !handoffConfirmed || handoffBusy) return
    setHandoffBusy(true)
    setRequestNotice('')
    try {
      const currentCatalog = readStorefrontCatalog()
      if (currentCatalog.source === 'unavailable') throw new Error(currentCatalog.error || 'Current Shop catalog is unavailable.')
      const draft = await confirmEcommerceShopDraft({
        request: latestRequest,
        requestLedger,
        preview: previewResult.preview,
        sourcePreviewDigest: digest,
        currentCatalog: currentCatalog.items,
        confirmedAt: new Date().toISOString(),
      })
      setRequestNotice(`${draft.id} is ready for human review in Shop. No stock or order changed.`)
      navigate('/shop/?tab=orders&source=ecommerce', { state: { ecommerceShopDraft: draft } })
    } catch (error) {
      setRequestNotice(error instanceof Error ? error.message : 'Shop handoff failed closed.')
    } finally {
      setHandoffBusy(false)
    }
  }

  async function retainInManagedInbox() {
    if (!latestRequest || !handoffConfirmed || handoffBusy) return
    setHandoffBusy(true)
    setRequestNotice('')
    try {
      if (!previewResult.preview) throw new Error('The current storefront preview is unavailable.')
      const currentDigest = await storefrontPreviewDigest(previewResult.preview)
      if (latestRequest.sourcePreviewDigest !== currentDigest || digest !== currentDigest) {
        throw new Error('The storefront changed after this request receipt was created. Create and review a new receipt.')
      }
      const identity = await currentManagedIdentity()
      if (!identity) throw new Error('Connect an authenticated workspace in Settings before saving this request.')
      const bootstrap = await loadManagedBootstrap()
      const record = bootstrap.states.commerce
      if (record.surface !== 'commerce' || !Number.isSafeInteger(record.version) || record.version < 1) {
        throw new Error('The managed Shop catalog is not ready for Ecommerce requests.')
      }
      const currentState = validateCommerceState(record.state)
      const proof = {
        actionId: `ACT-${latestRequest.id.slice(4)}`,
        capturedAt: latestRequest.createdAt,
        actor: identity.userId,
        reason: 'Retain this customer request for human Shop review.',
        evidenceReference: `ECOMMERCE:${latestRequest.id}:${latestRequest.sourcePreviewDigest}`,
      }
      const nextState = recordCommerceStorefrontRequest(currentState, latestRequest, proof)
      if (!nextState) throw new Error('The Ecommerce request conflicts with the current managed Shop inbox.')
      if (nextState === currentState) {
        setManagedInbox({ identity, state: currentState, version: record.version })
        setRequestNotice(`${latestRequest.id} is already retained in the managed Shop inbox.`)
        navigate('/shop/?tab=orders&source=ecommerce-inbox')
        return
      }
      const result = await saveManagedCommerceCommand({
        commandId: latestRequest.idempotencyKey.slice(4),
        evidence: proof,
        eventType: 'commerce.storefront_request.received',
        expectedVersion: record.version,
        state: nextState as unknown as Record<string, unknown>,
      })
      if (result.surface !== 'commerce'
        || result.event_type !== 'commerce.storefront_request.received'
        || result.version !== record.version + 1) {
        throw new Error('The managed Shop returned an invalid Ecommerce inbox receipt.')
      }
      const accepted = validateCommerceState(result.state)
      const retained = commerceStorefrontRequests(accepted).find((candidate) => candidate.id === latestRequest.id)
      if (!retained || JSON.stringify(retained) !== JSON.stringify(latestRequest)
        || JSON.stringify(accepted.items) !== JSON.stringify(currentState.items)
        || JSON.stringify(accepted.orders) !== JSON.stringify(currentState.orders)
        || JSON.stringify(accepted.movements) !== JSON.stringify(currentState.movements)
        || JSON.stringify(accepted.closes) !== JSON.stringify(currentState.closes)
        || JSON.stringify(accepted.websiteIntakes ?? []) !== JSON.stringify(currentState.websiteIntakes ?? [])) {
        throw new Error('The managed Ecommerce receipt changed Shop records and was rejected by the client.')
      }
      setManagedIdentity(identity)
      setManagedInbox({ identity, state: accepted, version: result.version })
      setRequestNotice(`${latestRequest.id} is retained in ${identity.workspaceId}. No order or stock changed.`)
      navigate('/shop/?tab=orders&source=ecommerce-inbox')
    } catch (error) {
      setRequestNotice(error instanceof Error ? error.message : 'The managed request was not confirmed. Nothing was claimed.')
    } finally {
      setHandoffBusy(false)
    }
  }

  const sourceLabel = catalog.source === 'shop-local'
    ? 'Current local Shop catalog'
    : catalog.source === 'managed-shop'
      ? `Managed Shop · ${managedInbox?.identity.workspaceId ?? 'authenticated'}`
      : catalog.source === 'sample'
      ? 'Sample Shop catalog'
      : 'Catalog unavailable'
  const digest = digestState.previewJson === previewJson ? digestState.value : ''
  const digestError = digestState.previewJson === previewJson ? digestState.error : ''
  const currentRequestSku = previewResult.preview?.items.some((item) => item.sku === requestSku)
    ? requestSku
    : previewResult.preview?.items[0]?.sku ?? ''
  const latestRequest = requestLedger.requests[0]

  return (
    <div className="workspace-screen ecommerce-product">
      <header className="ecommerce-heading">
        <div>
          <span className="core-eyebrow">{managedIdentity ? 'Managed storefront' : 'Local preview'}</span>
          <h1>Ecommerce</h1>
          <p>Shape a simple customer storefront from Shop, then retain customer requests for human review.</p>
        </div>
        <Link className="text-link" to="/shop/?tab=inventory">Open Shop stock</Link>
      </header>

      <div className="ecommerce-boundary" role="status">
        <span>{sourceLabel}</span>
        <p>Prices and availability are read-only. A request can enter the authenticated Shop inbox, but cannot reserve stock, create an order, take payment, send a message, or publish a site.</p>
      </div>

      <div className="ecommerce-workspace">
        <section className="core-panel ecommerce-setup" aria-labelledby="ecommerce-setup-title">
          <div className="panel-head">
            <div><span className="core-eyebrow">1 · Storefront</span><h2 id="ecommerce-setup-title">Choose what customers see</h2></div>
            <span className="status-pill bounded">{selectedSkus.length}/8</span>
          </div>

          <div className="ecommerce-copy-fields">
            <label>
              <span>Store name</span>
              <input maxLength={60} onChange={(event) => setStoreName(event.target.value)} value={storeName} />
            </label>
            <label>
              <span>Short description</span>
              <textarea maxLength={180} onChange={(event) => setSummary(event.target.value)} rows={3} value={summary} />
            </label>
          </div>

          <div className="ecommerce-catalog-head">
            <strong>Shop products</strong>
            <small>Select 1–8. Price and availability stay locked.</small>
          </div>
          {catalog.error ? <p className="form-notice warning-text">{catalog.error}</p> : null}
          <div className="ecommerce-catalog-list">
            {catalog.items.map((item) => {
              const selected = selectedSkus.includes(item.sku)
              return (
                <button
                  aria-pressed={selected}
                  className="ecommerce-catalog-item"
                  disabled={!selected && selectedSkus.length >= 8}
                  key={item.sku}
                  onClick={() => toggleSku(item.sku)}
                  type="button"
                >
                  <span><strong>{item.name}</strong><small>{item.variant || item.sku}</small></span>
                  <span><b>{formatMmk(item.price)}</b><small>{item.onHand > 0 ? 'Available' : 'Sold out'}</small></span>
                  <i aria-hidden="true">{selected ? '✓' : '+'}</i>
                </button>
              )
            })}
          </div>
        </section>

        <section className="core-panel ecommerce-preview-panel" aria-labelledby="ecommerce-preview-title">
          <div className="panel-head ecommerce-preview-head">
            <div><span className="core-eyebrow">2 · Preview</span><h2 id="ecommerce-preview-title">Customer view</h2></div>
            <div className="segmented-control" role="group" aria-label="Preview size">
              <button aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} type="button">Phone</button>
              <button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} type="button">Desktop</button>
            </div>
          </div>

          <div className={`ecommerce-preview-frame is-${device}`}>
            {previewResult.preview ? (
              <div className="storefront-preview">
                <header>
                  <span>&gt;_ {previewResult.preview.storeName}</span>
                  <b>{previewResult.preview.items.length} products</b>
                </header>
                <section className="storefront-hero">
                  <small>ORDER ONLINE</small>
                  <h3>{previewResult.preview.storeName}</h3>
                  <p>{previewResult.preview.summary}</p>
                </section>
                <div className="storefront-grid">
                  {previewResult.preview.items.map((item) => (
                    <article key={item.sku}>
                      <div aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</div>
                      <small>{item.variant || item.sku}</small>
                      <strong>{item.name}</strong>
                      <span>{formatMmk(item.unitPriceMmk)}</span>
                      <b>{item.availability === 'available' ? 'Available' : 'Sold out'}</b>
                    </article>
                  ))}
                </div>
                <footer>Requests enter Shop review. Payment and fulfilment stay separate.</footer>
              </div>
            ) : (
              <div className="ecommerce-preview-empty">
                <span>&gt;_</span>
                <strong>Preview needs attention</strong>
                <p>{previewResult.error}</p>
              </div>
            )}
          </div>

          <div className="ecommerce-digest" aria-live="polite">
            <span>Preview digest</span>
            <code>{digest || (digestError ? 'Unavailable' : 'Calculating…')}</code>
            <small>{digestError || 'Same approved copy and Shop snapshot produce the same digest.'}</small>
          </div>

          <details className="ecommerce-request-lab">
            <summary>
              <span><strong>Test a customer request</strong><small>Creates one local receipt for Shop review</small></span>
              <b>{requestLedger.requests.length ? `${requestLedger.requests.length} receipt` : 'Optional'}</b>
            </summary>
            <div className="ecommerce-request-body">
              <form onSubmit={(event) => void createRequestReceipt(event)}>
                <label>
                  <span>Customer reference</span>
                  <input maxLength={80} onChange={(event) => setRequestCustomer(event.target.value)} required value={requestCustomer} />
                </label>
                <label>
                  <span>Product</span>
                  <select onChange={(event) => setRequestSku(event.target.value)} required value={currentRequestSku}>
                    {previewResult.preview?.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {formatMmk(item.unitPriceMmk)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Quantity</span>
                  <input max={99} min={1} onChange={(event) => setRequestQuantity(Number(event.target.value))} required type="number" value={requestQuantity} />
                </label>
                <label>
                  <span>Fulfilment</span>
                  <select onChange={(event) => setRequestFulfilment(event.target.value as 'pickup' | 'delivery')} value={requestFulfilment}>
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery request</option>
                  </select>
                </label>
                <button className="core-button primary" disabled={!previewResult.preview || !digest || requestBusy} type="submit">
                  {requestBusy ? 'Recording…' : 'Create request receipt'}
                </button>
              </form>

              {latestRequest ? (
                <article className="ecommerce-request-receipt">
                  <span className="status-pill bounded">Pending Shop review</span>
                  <strong>{latestRequest.id}</strong>
                  <p>{latestRequest.customerReference} · {latestRequest.line.name} × {latestRequest.line.quantity}</p>
                  <b>{formatMmk(latestRequest.totalMmk)}</b>
                  <small>{latestRequest.fulfilment} · preview {latestRequest.sourcePreviewDigest.slice(7, 19)}</small>
                </article>
              ) : null}
              {latestRequest ? <>
                <label className="website-intake-confirm">
                  <input checked={handoffConfirmed} onChange={(event) => setHandoffConfirmed(event.target.checked)} type="checkbox" />
                  <span>I reviewed the SKU, quantity, MMK price, and current availability.</span>
                </label>
                <button className="core-button primary" disabled={!handoffConfirmed || !digest || handoffBusy} onClick={() => void (managedIdentity ? retainInManagedInbox() : sendToShopReview())} type="button">
                  {handoffBusy ? 'Checking…' : managedIdentity ? 'Save to Shop inbox' : 'Send to Shop review'}
                </button>
              </> : null}
              <p className="form-notice" aria-live="polite">{requestNotice || (managedIdentity
                ? 'Confirm the exact receipt, then retain it in the managed Shop inbox. It remains request intent only.'
                : 'This local receipt is not a Shop order. Connect a managed workspace for shared, recoverable retention.')}</p>
            </div>
          </details>
        </section>
      </div>
    </div>
  )
}
