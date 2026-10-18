import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { superMegaBrandMark } from '../../core/brand-mark'
import './public-storefront.css'

type PublicItem = {
  sku: string
  name: string
  variant: string | null
  unitPriceMmk: number
  availability: 'available' | 'sold_out'
  merchandising?: { featured: boolean; collection: string; displayName: string; note: string }
}

type PublicCatalog = {
  handle: string
  storeName: string
  summary: string
  currency: 'MMK'
  items: PublicItem[]
}

function isCatalog(value: unknown, handle: string): value is PublicCatalog {
  if (!value || typeof value !== 'object') return false
  const catalog = value as Partial<PublicCatalog>
  return catalog.handle === handle && typeof catalog.storeName === 'string'
    && typeof catalog.summary === 'string' && catalog.currency === 'MMK'
    && Array.isArray(catalog.items) && catalog.items.length > 0 && catalog.items.length <= 8
    && catalog.items.every((item) => item && typeof item.sku === 'string'
      && typeof item.name === 'string' && Number.isSafeInteger(item.unitPriceMmk)
      && item.unitPriceMmk > 0 && (item.availability === 'available' || item.availability === 'sold_out'))
}

function money(value: number) {
  return `${value.toLocaleString()} MMK`
}

function messageForStatus(status: number) {
  if (status === 404) return 'This store is not available right now. Please contact the business directly.'
  if (status === 409) return 'The catalog or stock changed. Refresh the store and review your cart.'
  if (status === 429) return 'Please wait a little before trying again.'
  if (status === 422) return 'Please check your contact and delivery details, then try again.'
  return 'We could not confirm delivery to the shop. Your request was not marked as sent. Please retry.'
}

export default function PublicStorefrontPage() {
  const { handle = '' } = useParams()
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [fulfilment, setFulfilment] = useState<'pickup' | 'delivery'>('pickup')
  const [line1, setLine1] = useState('')
  const [township, setTownship] = useState('')
  const [city, setCity] = useState('')
  const [instructions, setInstructions] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [receipt, setReceipt] = useState('')
  const requestId = useRef('')

  useEffect(() => {
    let active = true
    void fetch(`/api/public/commerce/${encodeURIComponent(handle)}`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error',
    }).then(async (response) => {
      if (!response.ok) throw new Error(messageForStatus(response.status))
      const value: unknown = await response.json()
      if (!isCatalog(value, handle)) throw new Error('The store could not be verified. Please try again.')
      if (active) setCatalog(value)
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : messageForStatus(503))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [handle])

  const selected = useMemo(() => catalog?.items
    .filter((item) => (cart[item.sku] ?? 0) > 0)
    .map((item) => ({ ...item, quantity: cart[item.sku] })) ?? [], [catalog, cart])
  const total = selected.reduce((sum, item) => sum + item.unitPriceMmk * item.quantity, 0)

  function changeQuantity(sku: string, change: number) {
    if (submitting || receipt) return
    requestId.current = ''
    setSubmitError('')
    setCart((current) => ({ ...current, [sku]: Math.max(0, Math.min(99, (current[sku] ?? 0) + change)) }))
  }

  function editDetails() {
    if (!submitting && !receipt) {
      requestId.current = ''
      setSubmitError('')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || receipt || !catalog || selected.length === 0 || !consent || !globalThis.crypto?.randomUUID) return
    const id = requestId.current || globalThis.crypto.randomUUID()
    requestId.current = id
    setSubmitting(true)
    setSubmitError('')
    const body = {
      requestId: id, name: name.trim(), phone: phone.trim(), fulfilment,
      lines: selected.map(({ sku, quantity }) => ({ sku, quantity })),
      address: fulfilment === 'delivery'
        ? { line1: line1.trim(), township: township.trim(), city: city.trim(), instructions: instructions.trim() }
        : null,
      consent: true,
    }
    try {
      const response = await fetch(`/api/public/commerce/${encodeURIComponent(handle)}/requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store', credentials: 'omit', redirect: 'error', body: JSON.stringify(body),
      })
      if (!response.ok) {
        if (response.status === 409) {
          const errorBody: unknown = await response.json().catch(() => null)
          if (errorBody && typeof errorBody === 'object' && (errorBody as { detail?: unknown }).detail === 'request_conflict') {
            requestId.current = ''
            throw new Error('Your request details changed. Please review them and send again.')
          }
        }
        throw new Error(messageForStatus(response.status))
      }
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object'
        || (result as { status?: unknown }).status !== 'received'
        || (result as { requestId?: unknown }).requestId !== id) {
        throw new Error(messageForStatus(503))
      }
      setReceipt(id)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : messageForStatus(503))
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="public-storefront">
    <header className="public-storefront-bar">
      <span className="public-storefront-brand">
        <span className="public-storefront-mark" aria-hidden="true">
          <svg viewBox={superMegaBrandMark.viewBox} width={superMegaBrandMark.width} height={superMegaBrandMark.height} focusable={false}>
            <path d={superMegaBrandMark.path} fill="none" stroke="currentColor" strokeWidth={superMegaBrandMark.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="public-storefront-name">SuperMega</span>
      </span>
      <small>Secure store request</small>
    </header>
    {loading || (catalog?.handle !== handle && !loadError) ? <div className="public-storefront-state" role="status">Opening store…</div> : loadError || !catalog
      ? <div className="public-storefront-state" role="alert"><h1>Store unavailable</h1><p>{loadError || messageForStatus(404)}</p></div>
      : <div className="public-storefront-layout">
        <section className="public-storefront-catalog" aria-labelledby="public-storefront-title">
          <div className="public-storefront-intro"><span className="public-storefront-eyebrow">ONLINE STORE · အွန်လိုင်းဆိုင်</span><h1 id="public-storefront-title">{catalog.storeName}</h1><p>{catalog.summary}</p></div>
          <div className="public-storefront-products">
            {catalog.items.map((item) => {
              const displayName = item.merchandising?.displayName || item.name
              const quantity = cart[item.sku] ?? 0
              return <article className="public-storefront-product" key={item.sku}>
                <div className="public-storefront-product-icon" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</div>
                <div className="public-storefront-product-info"><small>{item.merchandising?.collection || item.variant || 'PRODUCT'}</small><h2>{displayName}</h2><strong>{money(item.unitPriceMmk)}</strong>{item.merchandising?.note ? <p>{item.merchandising.note}</p> : null}</div>
                <div className="public-storefront-quantity">{item.availability === 'sold_out' ? <span>Sold out</span>
                  : quantity === 0 ? <button disabled={submitting} onClick={() => changeQuantity(item.sku, 1)} type="button">Add</button>
                    : <div className="public-storefront-stepper"><button aria-label={`Remove one ${displayName}`} disabled={submitting} onClick={() => changeQuantity(item.sku, -1)} type="button">−</button><output>{quantity}</output><button aria-label={`Add one ${displayName}`} disabled={submitting} onClick={() => changeQuantity(item.sku, 1)} type="button">+</button></div>}</div>
              </article>
            })}
          </div>
        </section>
        <aside className="public-storefront-checkout" aria-label="Your request">
          <div className="public-storefront-checkout-head"><span>YOUR REQUEST · မှာယူရန်</span><h2>Review and send</h2><p>The shop confirms stock, delivery and payment before your order is final.</p></div>
          {receipt ? <div className="public-storefront-success" role="status"><span aria-hidden="true">✓</span><h3>Request sent to the shop</h3><p>ဆိုင်သို့ ပေးပို့ပြီးပါပြီ။ The shop will review it and contact you before confirming.</p><small>Reference {receipt}</small></div>
            : <form onSubmit={(event) => void submit(event)}>
              {selected.length ? <ul className="public-storefront-summary">{selected.map((item) => <li key={item.sku}><span>{item.quantity} × {item.merchandising?.displayName || item.name}</span><strong>{money(item.quantity * item.unitPriceMmk)}</strong></li>)}</ul>
                : <p className="public-storefront-empty">Add a product to start your request.</p>}
              <div className="public-storefront-total"><span>Products</span><strong>{money(total)}</strong></div>
              <div className="public-storefront-fields">
                <label>Name <input autoComplete="name" disabled={submitting} maxLength={80} onChange={(event) => { editDetails(); setName(event.target.value) }} required value={name} /></label>
                <label>Phone <input autoComplete="tel" disabled={submitting} inputMode="tel" maxLength={32} onChange={(event) => { editDetails(); setPhone(event.target.value) }} required value={phone} /></label>
                <fieldset disabled={submitting}><legend>Receive your order</legend><label><input checked={fulfilment === 'pickup'} onChange={() => { editDetails(); setFulfilment('pickup') }} type="radio" /> Pick up</label><label><input checked={fulfilment === 'delivery'} onChange={() => { editDetails(); setFulfilment('delivery') }} type="radio" /> Delivery</label></fieldset>
                {fulfilment === 'delivery' ? <div className="public-storefront-address"><label>Street address <input autoComplete="street-address" disabled={submitting} maxLength={120} onChange={(event) => { editDetails(); setLine1(event.target.value) }} required value={line1} /></label><label>Township <input disabled={submitting} maxLength={80} onChange={(event) => { editDetails(); setTownship(event.target.value) }} required value={township} /></label><label>City <input disabled={submitting} maxLength={80} onChange={(event) => { editDetails(); setCity(event.target.value) }} required value={city} /></label><label>Delivery note <input disabled={submitting} maxLength={160} onChange={(event) => { editDetails(); setInstructions(event.target.value) }} value={instructions} /></label></div> : null}
                <label className="public-storefront-consent"><input checked={consent} disabled={submitting} onChange={(event) => { editDetails(); setConsent(event.target.checked) }} required type="checkbox" /> I agree to share these details with this shop for this request.</label>
              </div>
              {submitError ? <p className="public-storefront-error" role="alert">{submitError}</p> : null}
              <button className="public-storefront-submit" disabled={selected.length === 0 || submitting} type="submit">{submitting ? 'Sending…' : 'Send request'} <span aria-hidden="true">→</span></button>
              <small className="public-storefront-footnote">No payment is taken on this page.</small>
            </form>}
        </aside>
      </div>}
  </main>
}
