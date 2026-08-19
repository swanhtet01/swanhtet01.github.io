// Device-local product photo store (IndexedDB).
//
// WHERE PRODUCT PHOTOS LIVE, AND WHY IT IS NOT THE COMMERCE WORKSPACE.
//
// Photo blobs must not enter localStorage: the whole workspace shares a ~5MB
// quota there, and one phone camera picture would evict real business records.
// They must not be inlined into workspace JSON for the same reason — every
// persistence, sync-outbox, and backup path serializes that record. So blobs
// live here, in IndexedDB (gigabyte-scale quota), keyed by catalog SKU.
//
// The SKU -> photo binding ALSO lives here rather than as an `imageId` field on
// `CommerceItem`. That is deliberate, not an oversight:
//   - The managed runtime (`supermega_runtime/commerce_runtime.py`) validates
//     catalog items with an exact-field contract (`_ITEM_FIELDS`) and allows
//     `commerce.item.updated` to change only price and reorderAt. A workspace
//     record carrying `imageId` would be rejected by the DEPLOYED backend, and
//     a local workspace with that field could never convert to a managed one.
//   - A photo is presentation data, not a domain record. It carries no
//     `ProductionActionProof`, earns no proof counter, and never routes through
//     the accountable-action gate — exactly like the counter draft and the
//     remembered operator, it is a device-local convenience.
//   - Blobs cannot travel anyway. Keeping the reference next to the blob means
//     a record can never point at a photo that is not there.
//
// BACKUP / RESTORE (`company-backup.ts`): photos are NOT included in company
// backups. The backup snapshots registered localStorage keys under strict byte
// bounds (12MB snapshot / 4MB record); this store is invisible to it, so photo
// volume can never break a backup. After a restore — or on any other device —
// catalog records are intact and every surface that shows photos falls back to
// its existing text-or-artwork rendering. Nothing dangles, nothing errors.
//
// GUIDED SAMPLES: nothing here is ever seeded. Sample catalogs
// (`ACT-DEMO-WORKING-SAMPLE-*`) install without photos; only a person choosing
// a file through the photo control writes to this store.
//
// INGEST: phones shoot 12MP originals, so `downscaleProductPhoto` re-encodes
// every upload to at most 1280px on the long edge as JPEG q0.8 (~100-300KB).
// That is the honest version of "no upload limit": unbounded count, bounded
// cost per photo.
//
// A SKU that is renamed or deleted simply strands its photo; a re-created SKU
// inherits it. Both are harmless — the photo only renders when a matching
// catalog SKU is on screen.

const DB_NAME = 'supermega.product-images.v1'
const DB_VERSION = 1
const STORE_NAME = 'images'
const MAX_SKU_LENGTH = 80
const MAX_EDGE_PX = 1280
const JPEG_QUALITY = 0.8
const MAX_SOURCE_BYTES = 64 * 1024 * 1024

export type ProductImageRecord = {
  sku: string
  imageId: string
  blob: Blob
  updatedAt: string
}

type ProductImageListener = (sku: string) => void

const listeners = new Set<ProductImageListener>()

function notifyProductImageChange(sku: string) {
  for (const listener of [...listeners]) {
    try {
      listener(sku)
    } catch {
      // One broken subscriber must not stop the rest from refreshing.
    }
  }
}

/** Same-tab change feed so open surfaces (counter, stock list, storefront preview) refresh together. */
export function subscribeProductImages(listener: ProductImageListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function productImagesSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function requireSku(sku: string): string {
  if (typeof sku !== 'string' || !sku || sku !== sku.trim() || sku.length > MAX_SKU_LENGTH) {
    throw new Error('A product photo needs a valid catalog SKU.')
  }
  return sku
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!productImagesSupported()) {
      reject(new Error('Photo storage is unavailable in this browser.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'sku' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Photo storage could not be opened.'))
  })
}

// One short-lived connection per operation: nothing lingers to block a future
// schema upgrade, and a failed transaction cannot leak a handle.
async function withImageStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? new Error('Photo storage was interrupted.'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Photo storage failed.'))
    })
  } finally {
    database.close()
  }
}

function parseProductImageRecord(value: unknown): ProductImageRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ProductImageRecord>
  if (typeof record.sku !== 'string' || !record.sku) return null
  if (typeof record.imageId !== 'string' || !record.imageId) return null
  if (typeof record.updatedAt !== 'string') return null
  if (!(record.blob instanceof Blob) || record.blob.size < 1) return null
  return { sku: record.sku, imageId: record.imageId, blob: record.blob, updatedAt: record.updatedAt }
}

/** Stores (or replaces) the photo for a SKU and returns the new image id. */
export async function putProductImage(sku: string, blob: Blob): Promise<string> {
  const key = requireSku(sku)
  if (!(blob instanceof Blob) || blob.size < 1) throw new Error('The processed photo is empty. Nothing was saved.')
  const imageId = `IMG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const record: ProductImageRecord = { sku: key, imageId, blob, updatedAt: new Date().toISOString() }
  await withImageStore('readwrite', (store) => store.put(record))
  notifyProductImageChange(key)
  return imageId
}

/** The stored photo for a SKU, or null when there is none (or storage is unavailable). */
export async function getProductImage(sku: string): Promise<ProductImageRecord | null> {
  let key: string
  try {
    key = requireSku(sku)
  } catch {
    return null
  }
  if (!productImagesSupported()) return null
  try {
    const value = await withImageStore<unknown>('readonly', (store) => store.get(key) as IDBRequest<unknown>)
    return parseProductImageRecord(value)
  } catch {
    // A blocked or broken photo store must never break the surface that asked;
    // the caller renders its photo-less fallback.
    return null
  }
}

export async function deleteProductImage(sku: string): Promise<void> {
  const key = requireSku(sku)
  await withImageStore('readwrite', (store) => store.delete(key) as IDBRequest<undefined>)
  notifyProductImageChange(key)
}

async function decodePhoto(source: Blob): Promise<ImageBitmap> {
  try {
    // from-image applies the EXIF rotation phones record instead of storing sideways photos.
    return await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    // Older engines reject the options bag; a plain decode is better than no photo.
    return createImageBitmap(source)
  }
}

/**
 * Re-encodes an uploaded photo to at most 1280px on the long edge, JPEG q0.8.
 * Throws with an operator-readable message when the file is not a usable image.
 */
export async function downscaleProductPhoto(source: Blob): Promise<Blob> {
  if (!(source instanceof Blob) || !source.type.startsWith('image/')) {
    throw new Error('Choose a photo file (JPEG, PNG, or similar).')
  }
  if (source.size < 1) throw new Error('This photo file is empty.')
  if (source.size > MAX_SOURCE_BYTES) throw new Error('This photo file is too large to process on this device.')
  let bitmap: ImageBitmap
  try {
    bitmap = await decodePhoto(source)
  } catch {
    throw new Error('This file could not be read as a photo.')
  }
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    if (longEdge < 1) throw new Error('This file could not be read as a photo.')
    const scale = Math.min(1, MAX_EDGE_PX / longEdge)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable in this browser.')
    context.drawImage(bitmap, 0, 0, width, height)
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!encoded || encoded.size < 1) throw new Error('This photo could not be converted for storage.')
    return encoded
  } finally {
    bitmap.close()
  }
}

/**
 * Deletes the entire product-image database. "Reset this device"
 * (WorkspaceControlsPage) calls this so a handed-over or re-purposed device does
 * not keep the previous workspace's photos after its records are gone — this
 * store is not in localStorage, so the reset's key sweep never sees it.
 * Best-effort: resolves (never rejects) so a blocked deletion cannot abort the
 * reset flow; 'blocked' still deletes as soon as other tabs close.
 */
export function deleteAllProductImageData(): Promise<void> {
  return new Promise((resolve) => {
    if (!productImagesSupported()) {
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
