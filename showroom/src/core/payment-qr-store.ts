// Device-local merchant payment QR store (IndexedDB).
//
// WHAT THIS IS (roadmap item S2, hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md). Myanmar
// counters take digital payment through ONE static merchant QR the provider issued to
// the owner (MMQR, AYA Pay, WavePay, or a KBZPay merchant code). The customer scans it in
// their own banking app, types the amount themselves, pays, and shows the cashier the
// confirmation screen. The owner uploads a photo or screenshot of that provider-issued
// QR here, keyed by the payment method label the counter already uses; the counter and
// the order receipt can then show it full screen with the amount due.
//
// DISPLAY-ONLY, BY DESIGN — THIS IS NOT A PAYMENT CAPABILITY. The readiness contract
// forbids `payment` external effects, and nothing in this module or its consumers calls
// a payment API, reads or writes any payment status, or automates reconciliation.
// Showing the owner's OWN static image on the owner's OWN screen is not a payment
// action: money moves entirely inside the customer's banking app, out of this system's
// sight, and the accountable manual flow (`commerce.payment.reconciled`, the owner
// confirming money actually arrived) remains the only way an order's payment state
// changes. No network call of any kind happens here.
//
// WHERE THE IMAGE LIVES, AND WHY IT IS NOT THE COMMERCE WORKSPACE. Same architecture as
// product-image-store.ts, for the same reasons:
//   - Image blobs must not enter localStorage (~5MB shared quota; one phone photo would
//     evict real business records) nor be inlined into workspace JSON (every
//     persistence, sync-outbox, and backup path serializes that record). So blobs live
//     in IndexedDB (gigabyte-scale quota).
//   - The binding also lives here rather than as a field on any workspace record. The
//     managed runtime (`supermega_runtime/commerce_runtime.py`) validates commerce
//     records with exact-field contracts; a workspace record carrying a QR reference
//     would be rejected by the DEPLOYED backend, and a local workspace with that field
//     could never convert to a managed one.
//   - The QR is presentation data, not a domain record. It carries no
//     `ProductionActionProof`, earns no proof counter, and never routes through the
//     accountable-action gate.
//
// BACKUP / RESTORE (`company-backup.ts`): the QR is NOT included in company backups, by
// construction — the backup snapshots registered localStorage keys only, so this store
// is invisible to it, exactly like product photos. That exclusion is also correct on
// its own terms: the image is the owner's own provider-issued payment artifact and
// never leaves the device (this repo is a PUBLIC-facing product; an exported backup
// travels). After a restore or on a new device the owner re-uploads the QR from their
// provider app or printout; until then every surface renders its QR-less fallback.
//
// GUIDED SAMPLES: nothing here is ever seeded. Sample workspaces install without any
// payment QR; only a person choosing a file through the settings control writes to this
// store. A sample must never appear to have a real payment route.
//
// INGEST: uploads are re-encoded to at most 1280px on the long edge as PNG. PNG, not
// the JPEG product photos use: a QR is a high-contrast module grid, and lossless
// encoding keeps its edges crisp for the customer's camera; screenshots (the dominant
// source) compress well under PNG anyway.
//
// WORKSPACE SCOPE — MONEY-PATH ISOLATION (Codex P1, PR #465). IndexedDB is per-origin,
// not per-workspace: without a scope, every company that ever uses this browser would
// share one 'KBZPay' record, and a later merchant's counter could display an EARLIER
// merchant's QR — sending a real customer's money to the wrong bank account. Every
// record is therefore keyed by [scope, method], where scope is
// `paymentQrScopeForWorkspace(workspaceId)`: 'managed:<workspaceId>' for a managed
// company, 'local' for the device-local workspace (one per browser by construction —
// see local-workspace-storage.ts). The same convention as the counter draft's
// localCommerceOrderDraftScope. Scope is a REQUIRED argument end to end; no call site
// can silently fall back to a shared key. "Reset this device" additionally deletes
// this entire database (deleteAllPaymentQrData below) so a handed-over device cannot
// carry the previous owner's payment route.

const DB_NAME = 'supermega.payment-qr.v1'
const DB_VERSION = 2
const STORE_NAME = 'qr'
const MAX_METHOD_LENGTH = 40
const MAX_SCOPE_LENGTH = 160
const MAX_EDGE_PX = 1280
const MAX_SOURCE_BYTES = 64 * 1024 * 1024

/**
 * The payment-method labels a QR can be stored for: the counter's pinned method
 * list (`['Cash', 'KBZPay', 'WavePay', 'AYA Pay', 'MMQR']` in CoreApp.tsx) minus Cash — cash needs no
 * QR. Records are keyed by the exact display label so the counter and the receipt
 * can look a method up with the string they already hold.
 */
export const PAYMENT_QR_METHODS: readonly string[] = ['KBZPay', 'WavePay', 'AYA Pay', 'MMQR']

/** The storage scope for a workspace: its managed id, or the device-local workspace. */
export function paymentQrScopeForWorkspace(workspaceId?: string | null): string {
  return workspaceId ? `managed:${workspaceId}` : 'local'
}

export type PaymentQrRecord = {
  scope: string
  method: string
  imageId: string
  blob: Blob
  updatedAt: string
}

type PaymentQrListener = (scope: string, method: string) => void

const listeners = new Set<PaymentQrListener>()

function notifyPaymentQrChange(scope: string, method: string) {
  for (const listener of [...listeners]) {
    try {
      listener(scope, method)
    } catch {
      // One broken subscriber must not stop the rest from refreshing.
    }
  }
}

/** Same-tab change feed so the settings control, counter, and receipt refresh together. */
export function subscribePaymentQr(listener: PaymentQrListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function paymentQrSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function requireMethod(method: string): string {
  if (typeof method !== 'string' || !method || method !== method.trim() || method.length > MAX_METHOD_LENGTH) {
    throw new Error('A payment QR needs a valid payment method label.')
  }
  return method
}

function requireScope(scope: string): string {
  if (typeof scope !== 'string' || !scope || scope !== scope.trim() || scope.length > MAX_SCOPE_LENGTH) {
    throw new Error('A payment QR needs a valid workspace scope.')
  }
  return scope
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!paymentQrSupported()) {
      reject(new Error('QR storage is unavailable in this browser.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      // v1 keyed records by method alone — the cross-workspace money-path bug this
      // module's scope note describes. No v1 build was ever released (v2 landed inside
      // the same PR), so v1 records are dropped, not migrated: a QR that cannot be
      // attributed to a workspace must not be shown at any counter.
      if (database.objectStoreNames.contains(STORE_NAME)) {
        database.deleteObjectStore(STORE_NAME)
      }
      database.createObjectStore(STORE_NAME, { keyPath: ['scope', 'method'] })
    }
    // Same settle discipline as product-image-store.ts's openDatabase, kept
    // identical on purpose: these two stores are siblings by construction, and
    // the workspace-scope defect this file's scope note describes recurred in
    // the photo store precisely because the two drifted apart. An open() that
    // needs a version change fires 'blocked' — not 'error' — while another tab
    // holds an older connection; without a handler the promise never settles
    // and withQrStore awaits forever, and with one that rejects, the request
    // still completes later and hands back a connection nobody closes (an open
    // connection is what blocks deleteAllPaymentQrData and the next upgrade).
    // Not reachable today — v2 is the first shipped version, so no device
    // performs a version change — but the store is a money-path display
    // surface and the next DB_VERSION bump would make it live.
    let settled = false
    request.onsuccess = () => {
      if (settled) {
        request.result.close()
        return
      }
      settled = true
      resolve(request.result)
    }
    request.onerror = () => {
      if (settled) return
      settled = true
      reject(request.error ?? new Error('QR storage could not be opened.'))
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      reject(new Error('QR storage is busy in another tab. Close the other SuperMega tab and try again.'))
    }
  })
}

// One short-lived connection per operation: nothing lingers to block a future
// schema upgrade, and a failed transaction cannot leak a handle.
async function withQrStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? new Error('QR storage was interrupted.'))
      transaction.onerror = () => reject(transaction.error ?? new Error('QR storage failed.'))
    })
  } finally {
    database.close()
  }
}

function parsePaymentQrRecord(value: unknown): PaymentQrRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<PaymentQrRecord>
  if (typeof record.scope !== 'string' || !record.scope) return null
  if (typeof record.method !== 'string' || !record.method) return null
  if (typeof record.imageId !== 'string' || !record.imageId) return null
  if (typeof record.updatedAt !== 'string') return null
  if (!(record.blob instanceof Blob) || record.blob.size < 1) return null
  return { scope: record.scope, method: record.method, imageId: record.imageId, blob: record.blob, updatedAt: record.updatedAt }
}

/** Stores (or replaces) the QR for a payment method in one workspace scope; returns the new image id. */
export async function putPaymentQr(scope: string, method: string, blob: Blob): Promise<string> {
  const scopeKey = requireScope(scope)
  const methodKey = requireMethod(method)
  if (!(blob instanceof Blob) || blob.size < 1) throw new Error('The processed QR image is empty. Nothing was saved.')
  const imageId = `PAYQR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const record: PaymentQrRecord = { scope: scopeKey, method: methodKey, imageId, blob, updatedAt: new Date().toISOString() }
  await withQrStore('readwrite', (store) => store.put(record))
  notifyPaymentQrChange(scopeKey, methodKey)
  return imageId
}

/** The stored QR for a method in one workspace scope, or null when there is none (or storage is unavailable). */
export async function getPaymentQr(scope: string, method: string): Promise<PaymentQrRecord | null> {
  let scopeKey: string
  let methodKey: string
  try {
    scopeKey = requireScope(scope)
    methodKey = requireMethod(method)
  } catch {
    return null
  }
  if (!paymentQrSupported()) return null
  try {
    const value = await withQrStore<unknown>('readonly', (store) => store.get([scopeKey, methodKey]) as IDBRequest<unknown>)
    return parsePaymentQrRecord(value)
  } catch {
    // A blocked or broken QR store must never break the counter or the receipt;
    // the caller renders its QR-less fallback.
    return null
  }
}

export async function deletePaymentQr(scope: string, method: string): Promise<void> {
  const scopeKey = requireScope(scope)
  const methodKey = requireMethod(method)
  await withQrStore('readwrite', (store) => store.delete([scopeKey, methodKey]) as IDBRequest<undefined>)
  notifyPaymentQrChange(scopeKey, methodKey)
}

/**
 * Deletes the entire payment-QR database. "Reset this device" calls this so a
 * handed-over or re-purposed device cannot show the previous owner's payment
 * route at the next merchant's counter. Best-effort: resolves (never rejects)
 * so a blocked deletion cannot abort the reset flow that localStorage clearing
 * is part of; 'blocked' still deletes as soon as other tabs close.
 */
export function deleteAllPaymentQrData(): Promise<void> {
  return new Promise((resolve) => {
    if (!paymentQrSupported()) {
      resolve()
      return
    }
    try {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function decodeImage(source: Blob): Promise<ImageBitmap> {
  try {
    // from-image applies the EXIF rotation phones record instead of storing sideways photos.
    return await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    // Older engines reject the options bag; a plain decode is better than no QR.
    return createImageBitmap(source)
  }
}

/**
 * Re-encodes an uploaded QR photo or screenshot to at most 1280px on the long
 * edge, PNG (lossless — see the INGEST note above). Throws with an
 * operator-readable message when the file is not a usable image.
 */
export async function downscalePaymentQrImage(source: Blob): Promise<Blob> {
  if (!(source instanceof Blob) || !source.type.startsWith('image/')) {
    throw new Error('Choose an image file (a screenshot or photo of the QR).')
  }
  if (source.size < 1) throw new Error('This image file is empty.')
  if (source.size > MAX_SOURCE_BYTES) throw new Error('This image file is too large to process on this device.')
  let bitmap: ImageBitmap
  try {
    bitmap = await decodeImage(source)
  } catch {
    throw new Error('This file could not be read as an image.')
  }
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    if (longEdge < 1) throw new Error('This file could not be read as an image.')
    const scale = Math.min(1, MAX_EDGE_PX / longEdge)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image processing is unavailable in this browser.')
    context.drawImage(bitmap, 0, 0, width, height)
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!encoded || encoded.size < 1) throw new Error('This image could not be converted for storage.')
    return encoded
  } finally {
    bitmap.close()
  }
}
