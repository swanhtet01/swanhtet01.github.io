const RIGHTS_SCHEMA = 'supermega.shop-image-rights.v1'
const CREATIVE_COMMONS_LICENSES = new Map([
  ['cc0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ['cc-by-4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  ['cc-by-sa-4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
])
const PERMISSION_BASES = new Set(['owner-owned', 'written-permission'])

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Check evidence shape and explicit review metadata before a public release.
 * This does not determine whether a license or permission claim is legally valid.
 */
export function publicGalleryReleaseReadinessError(capture, imageSources) {
  if (capture?.publicationReady !== true) return 'public_gallery_capture_not_publication_ready'
  if (imageSources?.schemaVersion !== RIGHTS_SCHEMA
    || imageSources?.status !== 'cleared_for_publication'
    || !Array.isArray(imageSources.products)
    || imageSources.products.length === 0) return 'public_gallery_image_rights_unverified'

  const seenFiles = new Set()
  for (const product of imageSources.products) {
    if (!product || typeof product.file !== 'string'
      || !/^[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(product.file)
      || seenFiles.has(product.file)
      || !isHttpsUrl(product.source_page)) return 'public_gallery_image_rights_unverified'
    seenFiles.add(product.file)

    const rights = product.publication_rights
    const reviewedAt = typeof rights?.reviewed_at === 'string'
      && Number.isFinite(Date.parse(rights.reviewed_at))
      && new Date(rights.reviewed_at).toISOString().slice(0, 10) === rights.reviewed_at
    if (rights?.status !== 'cleared_for_publication'
      || !reviewedAt
      || typeof rights.reviewed_by !== 'string'
      || !rights.reviewed_by.trim()
      || !/^[0-9a-f]{64}$/.test(rights.evidence_sha256)
      || typeof rights.attribution !== 'string'
      || !rights.attribution.trim()) return 'public_gallery_image_rights_unverified'

    const licenseUrl = CREATIVE_COMMONS_LICENSES.get(rights.basis)
    if (licenseUrl) {
      if (rights.license_url !== licenseUrl) return 'public_gallery_image_rights_unverified'
      continue
    }

    if (!PERMISSION_BASES.has(rights.basis)
      || typeof rights.permission_ref !== 'string'
      || !rights.permission_ref.trim()) return 'public_gallery_image_rights_unverified'
  }

  return null
}

export function assertPublicGalleryReleaseReady(capture, imageSources) {
  const error = publicGalleryReleaseReadinessError(capture, imageSources)
  if (error) throw new Error(error)
}
