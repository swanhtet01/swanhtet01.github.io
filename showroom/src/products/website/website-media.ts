// Portable content references. Image bytes belong in managed media storage, never
// in workspace JSON, session drafts or the localStorage backup envelope.
export type WebsiteImage = ({ src: string } | { assetId: string }) & {
  alt: string
  decorative: boolean
}

export function isWebsiteAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}\.webp$/.test(value)
}

export function websiteImageKey(image: WebsiteImage) {
  return 'assetId' in image ? image.assetId : image.src
}

export function isWebsiteImageSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048
    || !/^https:\/\/[a-z0-9.-]+\//i.test(value) || /[\s\\<>"]/u.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.replace(/\.$/, '')
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && !url.hash && hostname.includes('.') && !/^[\d.]+$/.test(hostname)
      && !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)
  } catch {
    return false
  }
}

export function isWebsiteImage(value: unknown): value is WebsiteImage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const image = value as Record<string, unknown>
  try { encodeURIComponent(String(image.alt)); encodeURIComponent(String(image.src)) } catch { return false }
  const keys = Object.keys(image).sort().join(',')
  const validSource = keys === 'alt,decorative,src' ? isWebsiteImageSource(image.src)
    : keys === 'alt,assetId,decorative' && isWebsiteAssetId(image.assetId)
  return validSource && typeof image.alt === 'string'
    && image.alt.length <= 200 && typeof image.decorative === 'boolean'
    && (image.decorative ? image.alt === '' : Boolean(image.alt.trim()))
}

export function withWebsiteImage<T extends { image?: WebsiteImage }>(block: T, image: WebsiteImage | undefined): T {
  const next = { ...block }
  if (image) next.image = { ...image }
  else delete next.image
  return next
}
