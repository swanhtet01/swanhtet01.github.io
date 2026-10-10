import { createWebsiteHtmlDownload, validateWebsiteArtifactForExport } from './website-export'
import { verifyPhotoBytes, type WebsiteMediaClient } from './website-media-client'
import type { WebsiteArtifact } from './website-model'

// Bounds the entire HTML, including repeated images across pages. No image
// bytes or short-lived display URLs are written to workspace records.
const MAX_EXPORT_PHOTO_BYTES = 8 * 1024 * 1024
export async function createWebsiteMediaDownload(artifact: WebsiteArtifact, client: WebsiteMediaClient | null, signal: AbortSignal) {
  if (validateWebsiteArtifactForExport(artifact).length) throw new Error('Check the saved pages before downloading.')
  const counts = new Map<string, number>()
  for (const page of artifact.pages) for (const block of [page.hero, ...page.sections]) {
    if (block.image && 'assetId' in block.image) counts.set(block.image.assetId, (counts.get(block.image.assetId) ?? 0) + 1)
  }
  if (counts.size && !client) throw new Error('Sign in to the workspace that owns these photos to download this website.')
  const resolved = new Map<string, string>()
  let total = 0
  for (const [assetId, count] of counts) {
    signal.throwIfAborted()
    const blob = await client!.load(assetId, signal)
    total += blob.size * count
    if (total > MAX_EXPORT_PHOTO_BYTES) throw new Error('This website has too many large photos for one file. Use smaller photos and try again.')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await verifyPhotoBytes(assetId, bytes)
    // Small chunks avoid overflowing the JavaScript argument stack.
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    resolved.set(assetId, `data:image/webp;base64,${btoa(binary)}`)
  }
  if (client) await client.assertCurrent()
  signal.throwIfAborted()
  return createWebsiteHtmlDownload(artifact, resolved)
}
