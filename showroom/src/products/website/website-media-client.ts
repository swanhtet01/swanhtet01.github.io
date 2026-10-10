import { isWebsiteAssetId } from './website-media'
import { sessionForRequest, type ManagedIdentity } from '../../core/managed-trial'

export const MAX_PHOTO_UPLOAD = 4 * 1024 * 1024
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export type WebsiteMediaClient = {
  scopeKey: string
  upload?: (file: File, signal: AbortSignal) => Promise<string>
  load: (assetId: string, signal: AbortSignal) => Promise<Blob>
  assertCurrent: () => Promise<void>
}

export function assertPhotoFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.')
  if (!file.size || file.size > MAX_PHOTO_UPLOAD) throw new Error('Choose a photo smaller than 4 MB.')
}

export function assertMediaReceipt(value: unknown): string {
  const receipt = value as Record<string, unknown> | null
  if (!receipt || Object.keys(receipt).sort().join(',') !== 'assetId,bytes,contentType,height,sha256,visibility,width'
    || !isWebsiteAssetId(receipt.assetId) || receipt.sha256 !== receipt.assetId.slice(0, 64)
    || receipt.contentType !== 'image/webp' || receipt.visibility !== 'private'
    || !Number.isInteger(receipt.bytes) || Number(receipt.bytes) < 1 || Number(receipt.bytes) > MAX_PHOTO_BYTES
    || ![receipt.width, receipt.height].every(edge => Number.isInteger(edge) && Number(edge) >= 1 && Number(edge) <= 2048)) {
    throw new Error('The photo could not be verified. Please try again.')
  }
  return receipt.assetId
}

export async function verifyPhotoBytes(assetId: string, bytes: Uint8Array<ArrayBuffer>) {
  if (!isWebsiteAssetId(assetId) || !bytes.length || bytes.length > MAX_PHOTO_BYTES
    || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'RIFF'
    || new TextDecoder().decode(bytes.subarray(8, 12)) !== 'WEBP') throw new Error('The photo could not be verified.')
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  if (assetId !== `${digest}.webp`) throw new Error('The photo could not be verified.')
}

async function boundedBody(response: Response, limit: number) {
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel()
    throw new Error('The photo response is too large.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The photo could not be loaded.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('The photo response is too large.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export function createWebsiteMediaClient(identity: ManagedIdentity, canWrite: boolean): WebsiteMediaClient {
  const assertCurrent = async () => { await sessionForRequest(identity) }
  async function request(assetId: string | null, file: File | null, signal: AbortSignal) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const timer = setTimeout(abort, 20_000)
    try {
      const { session, workspaceId } = await sessionForRequest(identity)
      const response = await fetch('/api/trial/v1/website-media' + (assetId ? `/${assetId}` : ''), {
        method: file ? 'POST' : 'GET', body: file,
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
        headers: { authorization: `Bearer ${session.access_token}`, 'x-supermega-workspace-id': workspaceId,
          accept: file ? 'application/json' : 'image/webp', ...(file ? { 'content-type': file.type } : {}) },
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(response.status === 401 || response.status === 403 ? 'Sign in to this workspace to use its photos.'
          : response.status === 503 ? 'Photo storage is unavailable. Your current image is unchanged.' : 'The photo could not be saved or loaded. Please try again.')
      }
      if ((response.headers.get('content-type') ?? '').split(';')[0].trim() !== (file ? 'application/json' : 'image/webp')) {
        await response.body?.cancel()
        throw new Error('The photo response could not be verified.')
      }
      const bytes = await boundedBody(response, file ? 2048 : MAX_PHOTO_BYTES)
      await assertCurrent()
      controller.signal.throwIfAborted()
      return bytes
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
  }
  return {
    scopeKey: `${identity.userId}:${identity.workspaceId}`, assertCurrent,
    ...(canWrite ? { upload: async (file: File, signal: AbortSignal) => {
      assertPhotoFile(file)
      const bytes = await request(null, file, signal)
      const assetId = assertMediaReceipt(JSON.parse(new TextDecoder().decode(bytes)))
      await assertCurrent()
      signal.throwIfAborted()
      return assetId
    } } : {}),
    async load(assetId, signal) {
      if (!isWebsiteAssetId(assetId)) throw new Error('This photo reference is invalid.')
      const bytes = await request(assetId, null, signal)
      await verifyPhotoBytes(assetId, bytes)
      await assertCurrent()
      signal.throwIfAborted()
      return new Blob([bytes], { type: 'image/webp' })
    },
  }
}
