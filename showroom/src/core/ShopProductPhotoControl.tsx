// The photo editor uses product-image-store.ts and loads only when inventory needs it.
import { useRef, useState, type ChangeEvent } from 'react'

import {
  deleteProductImage,
  downscaleProductPhoto,
  productImagesSupported,
  putProductImage,
} from './product-image-store'
import { useProductImageUrl } from './use-product-image'

/**
 * Thumbnail-as-button photo control for one catalog item: tap to add or
 * replace (on Android the file input offers camera or gallery natively), plus
 * a remove link once a photo exists. Renders nothing where IndexedDB is
 * unavailable so the stock table stays clean instead of offering a dead
 * control.
 */
export function ShopProductPhotoControl({ disabled, name, scope, sku }: { disabled: boolean; name: string; scope: string; sku: string }) {
  const url = useProductImageUrl(scope, sku)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState('')
  if (!productImagesSupported()) return null

  async function storeChosenPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setIssue('')
    try {
      await putProductImage(scope, sku, await downscaleProductPhoto(file))
    } catch (error) {
      setIssue(error instanceof Error && error.message ? error.message : 'The photo could not be saved on this device.')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    setBusy(true)
    setIssue('')
    try {
      await deleteProductImage(scope, sku)
    } catch {
      setIssue('The photo could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return <span className="product-photo-control">
    <button
      aria-busy={busy || undefined}
      aria-label={url ? `Change photo for ${name}` : `Add photo for ${name}`}
      className="product-photo-frame"
      disabled={disabled || busy}
      onClick={() => inputRef.current?.click()}
      type="button"
    >
      {url ? <img alt="" src={url} /> : <span aria-hidden="true" className="product-photo-placeholder">+</span>}
    </button>
    <input accept="image/*" className="sr-only" onChange={storeChosenPhoto} ref={inputRef} tabIndex={-1} type="file" />
    {url ? <button aria-label={`Remove photo for ${name}`} className="text-link product-photo-remove" disabled={disabled || busy} onClick={removePhoto} type="button">Remove</button> : null}
    {issue ? <small className="product-photo-issue" role="alert">{issue}</small> : null}
  </span>
}
