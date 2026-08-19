// Device-local merchant payment QR store (IndexedDB).
//
// WHAT THIS IS (roadmap item S2, hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md). Myanmar
// counters take digital payment through ONE static merchant QR the provider issued to
// the owner (Wave MMQR, MyanMyanPay, a KBZPay merchant code). The customer scans it in
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

const DB_NAME = 'supermega.payment-qr.v1'
const DB_VERSION = 1
const STORE_NAME = 'qr'
const MAX_METHOD_LENGTH = 40
const MAX_EDGE_PX = 1280
const MAX_SOURCE_BYTES = 64 * 1024 * 1024

/**
 * The payment-method labels a QR can be stored for: the counter's pinned method
 * list (`['Cash', 'KBZPay', 'WavePay']` in CoreApp.tsx) minus Cash — cash needs no
 * QR. Records are keyed by the exact display label so the counter and the receipt
 * can look a method up with the string they already hold.
 */
export const PAYMENT_QR_METHODS: readonly string[] = ['KBZPay', 'WavePay']

export type PaymentQrRecord = {
  method: string
  imageId: string
  blob: Blob
  updatedAt: string
}

type PaymentQrListener = (method: string) => void

const listeners = new Set<PaymentQrListener>()

function notifyPaymentQrChange(method: string) {
  for (const listener of [...listeners]) {
    try {
      listener(method)
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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!paymentQrSupported()) {
      reject(new Error('QR storage is unavailable in this browser.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'method' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('QR storage could not be opened.'))
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
  if (typeof record.method !== 'string' || !record.method) return null
  if (typeof record.imageId !== 'string' || !record.imageId) return null
  if (typeof record.updatedAt !== 'string') return null
  if (!(record.blob instanceof Blob) || record.blob.size < 1) return null
  return { method: record.method, imageId: record.imageId, blob: record.blob, updatedAt: record.updatedAt }
}

/** Stores (or replaces) the QR for a payment method and returns the new image id. */
export async function putPaymentQr(method: string, blob: Blob): Promise<string> {
  const key = requireMethod(method)
  if (!(blob instanceof Blob) || blob.size < 1) throw new Error('The processed QR image is empty. Nothing was saved.')
  const imageId = `PAYQR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const record: PaymentQrRecord = { method: key, imageId, blob, updatedAt: new Date().toISOString() }
  await withQrStore('readwrite', (store) => store.put(record))
  notifyPaymentQrChange(key)
  return imageId
}

/** The stored QR for a payment method, or null when there is none (or storage is unavailable). */
export async function getPaymentQr(method: string): Promise<PaymentQrRecord | null> {
  let key: string
  try {
    key = requireMethod(method)
  } catch {
    return null
  }
  if (!paymentQrSupported()) return null
  try {
    const value = await withQrStore<unknown>('readonly', (store) => store.get(key) as IDBRequest<unknown>)
    return parsePaymentQrRecord(value)
  } catch {
    // A blocked or broken QR store must never break the counter or the receipt;
    // the caller renders its QR-less fallback.
    return null
  }
}

export async function deletePaymentQr(method: string): Promise<void> {
  const key = requireMethod(method)
  await withQrStore('readwrite', (store) => store.delete(key) as IDBRequest<undefined>)
  notifyPaymentQrChange(key)
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
