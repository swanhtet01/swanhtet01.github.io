// Private Shop photos belong to a signed-in company, never to the browser origin.
// A single short-lived manifest serves all visible product thumbnails on a page.
import { currentManagedIdentity, sessionForRequest, type ManagedIdentity } from './managed-trial'

const ROOT = '/api/trial/v1/shop-media'
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_PHOTOS = 2000
const ASSET_ID = /^[0-9a-f]{64}\.webp$/
const MANIFEST_AGE_MS = 20_000

export type ShopPhotoMetadata = {
  assetId: string
  generation: number
  sha256: string
  bytes: number
  width: number
  height: number
}

type Manifest = {
  photos: ReadonlyMap<string, ShopPhotoMetadata>
  generations: ReadonlyMap<string, number>
}
type ManifestEntry = { loadedAt: number; promise: Promise<Manifest> }
const manifests = new Map<string, ManifestEntry>()
const listeners = new Set<(scope: string, sku: string) => void>()

function cacheKey(identity: ManagedIdentity) {
  return `${identity.userId}:${identity.workspaceId}`
}

async function identityForScope(scope: string): Promise<ManagedIdentity> {
  const identity = await currentManagedIdentity()
  if (!identity || scope !== `managed:${identity.workspaceId}`) {
    throw new Error('Sign in to this company to use its product photos.')
  }
  return identity
}

function validMetadata(value: unknown): ShopPhotoMetadata | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ShopPhotoMetadata>
  if (typeof candidate.assetId !== 'string' || !ASSET_ID.test(candidate.assetId)
    || candidate.sha256 !== candidate.assetId.slice(0, 64)
    || !Number.isSafeInteger(candidate.generation) || Number(candidate.generation) < 1
    || !Number.isSafeInteger(candidate.bytes) || Number(candidate.bytes) < 1 || Number(candidate.bytes) > MAX_IMAGE_BYTES
    || !Number.isSafeInteger(candidate.width) || Number(candidate.width) < 1 || Number(candidate.width) > 2048
    || !Number.isSafeInteger(candidate.height) || Number(candidate.height) < 1 || Number(candidate.height) > 2048) return null
  return candidate as ShopPhotoMetadata
}

async function readBounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel()
    throw new Error('The product photo response is too large.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The product photo response is unavailable.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > limit) throw new Error('The product photo response is too large.')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

async function request(identity: ManagedIdentity, path: string, method: 'GET' | 'PUT' | 'DELETE',
  options: { body?: Blob; generation?: number; signal?: AbortSignal; type: 'json' | 'image' }): Promise<Uint8Array<ArrayBuffer>> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const timer = setTimeout(abort, 20_000)
  try {
    const { session, workspaceId } = await sessionForRequest(identity)
    controller.signal.throwIfAborted()
    const response = await fetch(path, {
      method, body: options.body, signal: controller.signal, cache: 'no-store',
      credentials: 'omit', redirect: 'error',
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-supermega-workspace-id': workspaceId,
        accept: options.type === 'image' ? 'image/webp' : 'application/json',
        ...(options.body ? { 'content-type': options.body.type } : {}),
        ...(options.generation === undefined ? {} : { 'if-match': `"${options.generation}"` }),
      },
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(response.status === 401 || response.status === 403
        ? 'Sign in to this company to use its product photos.'
        : response.status === 409 ? 'This photo changed on another device. Refresh and try again.'
          : response.status === 404 ? 'This product or photo is no longer available.'
            : response.status === 503 ? 'Shared product photos are unavailable. Your current photo is unchanged.'
              : 'The product photo could not be saved or loaded. Please try again.')
    }
    if ((response.headers.get('content-type') ?? '').split(';', 1)[0].trim() !== (options.type === 'image' ? 'image/webp' : 'application/json')) {
      await response.body?.cancel()
      throw new Error('The product photo response could not be verified.')
    }
    const bytes = await readBounded(response, options.type === 'image' ? MAX_IMAGE_BYTES : MAX_MANIFEST_BYTES)
    await sessionForRequest(identity)
    controller.signal.throwIfAborted()
    return bytes
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

function parseManifest(bytes: Uint8Array): Manifest {
  let body: unknown
  try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Error('The product photo list could not be verified.') }
  const response = body as { photos?: unknown; generations?: unknown } | null
  const photos = response?.photos
  const generations = response?.generations
  if (!photos || typeof photos !== 'object' || Array.isArray(photos)
    || !generations || typeof generations !== 'object' || Array.isArray(generations)) {
    throw new Error('The product photo list could not be verified.')
  }
  const entries = Object.entries(photos)
  const versionEntries = Object.entries(generations)
  if (entries.length > MAX_PHOTOS || versionEntries.length > MAX_PHOTOS) throw new Error('The product photo list is too large.')
  const parsed = new Map<string, ShopPhotoMetadata>()
  const versions = new Map<string, number>()
  for (const [sku, value] of versionEntries) {
    if (!sku || sku.length > 160 || !Number.isSafeInteger(value) || Number(value) < 1) {
      throw new Error('The product photo list could not be verified.')
    }
    versions.set(sku, Number(value))
  }
  for (const [sku, value] of entries) {
    const metadata = validMetadata(value)
    if (!sku || sku.length > 160 || !metadata || versions.get(sku) !== metadata.generation) {
      throw new Error('The product photo list could not be verified.')
    }
    parsed.set(sku, metadata)
  }
  return { photos: parsed, generations: versions }
}

async function manifest(identity: ManagedIdentity, force = false): Promise<Manifest> {
  const key = cacheKey(identity)
  const previous = manifests.get(key)
  if (!force && previous && Date.now() - previous.loadedAt < MANIFEST_AGE_MS) return previous.promise
  const promise = request(identity, ROOT, 'GET', { type: 'json' }).then(parseManifest)
  manifests.set(key, { loadedAt: Date.now(), promise })
  try { return await promise } catch (error) {
    if (manifests.get(key)?.promise === promise) manifests.delete(key)
    throw error
  }
}

function notify(scope: string, sku: string) {
  for (const listener of listeners) listener(scope, sku)
}

export function subscribeManagedProductPhotos(listener: (scope: string, sku: string) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function retryManagedProductPhoto(scope: string, sku: string): Promise<void> {
  const identity = await identityForScope(scope)
  manifests.delete(cacheKey(identity))
  notify(scope, sku)
}

function skuPath(sku: string): string {
  // Prefix the segment so valid SKUs "." and ".." survive URL normalization.
  return `${ROOT}/sku/~${encodeURIComponent(sku)}`
}

export async function loadManagedProductPhoto(scope: string, sku: string, signal: AbortSignal): Promise<Blob | null> {
  const identity = await identityForScope(scope)
  const metadata = (await manifest(identity)).photos.get(sku)
  if (!metadata) return null
  const bytes = await request(identity, `${ROOT}/image/${metadata.assetId}`, 'GET', { type: 'image', signal })
  if (bytes.length !== metadata.bytes || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'RIFF'
    || new TextDecoder().decode(bytes.subarray(8, 12)) !== 'WEBP') throw new Error('The product photo could not be verified.')
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
  if (digest !== metadata.sha256) throw new Error('The product photo could not be verified.')
  signal.throwIfAborted()
  return new Blob([bytes], { type: 'image/webp' })
}

export async function saveManagedProductPhoto(scope: string, sku: string, photo: Blob): Promise<void> {
  const identity = await identityForScope(scope)
  const before = await manifest(identity, true)
  const current = before.photos.get(sku)
  const generation = before.generations.get(sku) ?? 0
  const bytes = await request(identity, skuPath(sku), 'PUT',
    { body: photo, generation, type: 'json' })
  let saved: unknown
  try { saved = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Error('The product photo confirmation was invalid.') }
  const result = validMetadata(saved)
  if (!result || !(result.generation === generation + 1
    || (current && result.generation === generation && result.assetId === current.assetId))) {
    throw new Error('The product photo confirmation was invalid.')
  }
  const readback = (await manifest(identity, true)).photos.get(sku)
  if (!readback || readback.assetId !== result.assetId || readback.generation !== result.generation) {
    throw new Error('The photo was submitted, but its shared save could not be confirmed. Refresh before trying again.')
  }
  notify(scope, sku)
}

export async function removeManagedProductPhoto(scope: string, sku: string): Promise<void> {
  const identity = await identityForScope(scope)
  const current = (await manifest(identity, true)).photos.get(sku)
  if (!current) { notify(scope, sku); return }
  await request(identity, skuPath(sku), 'DELETE',
    { generation: current.generation, type: 'json' })
  if ((await manifest(identity, true)).photos.has(sku)) {
    throw new Error('The photo removal could not be confirmed. Refresh before trying again.')
  }
  notify(scope, sku)
}
