import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  buildStorefrontPreview,
  readStorefrontCatalog,
  storefrontPreviewDigest,
} from './storefront-model'

type PreviewDevice = 'phone' | 'desktop'

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

export function EcommerceProduct() {
  const catalog = useMemo(() => readStorefrontCatalog(), [])
  const initialSelection = useMemo(
    () => catalog.items.filter((item) => item.onHand > 0).slice(0, 4).map((item) => item.sku),
    [catalog.items],
  )
  const [storeName, setStoreName] = useState('My Shop')
  const [summary, setSummary] = useState('Everyday products, clearly priced and ready to request.')
  const [selectedSkus, setSelectedSkus] = useState(initialSelection)
  const [device, setDevice] = useState<PreviewDevice>('phone')
  const [digestState, setDigestState] = useState({ previewJson: '', value: '', error: '' })

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

  const sourceLabel = catalog.source === 'shop-local'
    ? 'Current local Shop catalog'
      : catalog.source === 'sample'
      ? 'Sample Shop catalog'
      : 'Catalog unavailable'
  const digest = digestState.previewJson === previewJson ? digestState.value : ''
  const digestError = digestState.previewJson === previewJson ? digestState.error : ''

  return (
    <div className="workspace-screen ecommerce-product">
      <header className="ecommerce-heading">
        <div>
          <span className="core-eyebrow">Local preview</span>
          <h1>Ecommerce</h1>
          <p>Shape a simple customer storefront from Shop. Nothing is published or ordered here.</p>
        </div>
        <Link className="text-link" to="/shop/?tab=inventory">Open Shop stock</Link>
      </header>

      <div className="ecommerce-boundary" role="status">
        <span>{sourceLabel}</span>
        <p>Prices and availability are read-only. This preview cannot change stock, create an order, take payment, send a message, or publish a site.</p>
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
                <footer>Ordering is not connected in this preview.</footer>
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
        </section>
      </div>
    </div>
  )
}
