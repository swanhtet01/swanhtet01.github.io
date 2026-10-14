// One photo control for device-local workspaces and signed-in managed shops.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  deleteProductImage,
  downscaleProductPhoto,
  getProductImage,
  productImagesSupported,
  putProductImage,
} from './product-image-store'
import { removeManagedProductPhoto, retryManagedProductPhoto, saveManagedProductPhoto } from './shop-managed-media-client'
import { useProductImageState } from './use-product-image'

/**
 * Thumbnail-as-button photo control for one catalog item: tap to add or
 * replace (on Android the file input offers camera or gallery natively), plus
 * a remove link once a photo exists. Renders nothing where IndexedDB is
 * unavailable so the stock table stays clean instead of offering a dead
 * control.
 */
export function ShopProductPhotoControl({ disabled, name, scope, sku }: { disabled: boolean; name: string; scope: string; sku: string }) {
  const managed = scope.startsWith('managed:')
  const { url, issue: loadIssue } = useProductImageState(scope, sku)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState('')
  const [deviceRecord, setDeviceRecord] = useState<{ scope: string; sku: string; blob: Blob | null } | null>(null)
  const devicePhoto = deviceRecord?.scope === scope && deviceRecord.sku === sku ? deviceRecord.blob : null
  useEffect(() => {
    if (!managed || !productImagesSupported()) return
    let active = true
    getProductImage(scope, sku).then((record) => {
      if (active) setDeviceRecord({ scope, sku, blob: record?.blob ?? null })
    }).catch(() => { if (active) setDeviceRecord({ scope, sku, blob: null }) })
    return () => { active = false }
  }, [managed, scope, sku])
  if (!managed && !productImagesSupported()) return null

  async function upload(photo: Blob) {
    if (managed) await saveManagedProductPhoto(scope, sku, photo)
    else await putProductImage(scope, sku, photo)
  }

  async function storeChosenPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setIssue('')
    try {
      await upload(await downscaleProductPhoto(file))
    } catch (error) {
      setIssue(error instanceof Error && error.message ? error.message : 'The photo could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    setBusy(true)
    setIssue('')
    try {
      if (managed) await removeManagedProductPhoto(scope, sku)
      else await deleteProductImage(scope, sku)
    } catch (error) {
      setIssue(error instanceof Error && error.message ? error.message : 'The photo could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  async function importDevicePhoto() {
    if (!devicePhoto) return
    setBusy(true)
    setIssue('')
    try {
      await upload(devicePhoto)
    } catch (error) {
      setIssue(error instanceof Error && error.message ? error.message : 'The photo could not be shared.')
    } finally {
      setBusy(false)
    }
  }

  return <span className="product-photo-control">
    <button
      aria-busy={busy || undefined}
      aria-label={`${url ? 'Change' : 'Add'} ${managed ? 'shared ' : ''}photo for ${name}${loadIssue ? `. ${loadIssue}` : ''}`}
      className="product-photo-frame"
      disabled={disabled || busy}
      onClick={() => inputRef.current?.click()}
      title={loadIssue ?? undefined}
      type="button"
    >
      {url ? <img alt="" src={url} /> : <span aria-hidden="true" className="product-photo-placeholder">+</span>}
    </button>
    <input accept="image/*" className="sr-only" onChange={storeChosenPhoto} ref={inputRef} tabIndex={-1} type="file" />
    {managed && !url && devicePhoto ? <button className="text-link product-photo-remove" disabled={disabled || busy} onClick={importDevicePhoto} type="button">Share device photo</button> : null}
    {url ? <button aria-label={`Remove photo for ${name}`} className="text-link product-photo-remove" disabled={disabled || busy} onClick={removePhoto} type="button">Remove</button> : null}
    {managed && loadIssue ? <span className="product-photo-issue" role="status">Photo unavailable. <button className="text-link" disabled={busy} onClick={() => { void retryManagedProductPhoto(scope, sku).catch((error: unknown) => setIssue(error instanceof Error ? error.message : 'Please try again.')) }} type="button">Retry</button></span> : null}
    {issue ? <small className="product-photo-issue" role="alert">{issue}</small> : null}
  </span>
}
