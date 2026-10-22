const RIGHTS_SCHEMA = 'supermega.shop-image-rights.v1'
const RELEASE_ATTESTATION_SCHEMA = 'supermega.public-gallery-release-attestation.v1'
const CANDIDATE_CLASSIFICATION = 'candidate_only_local_real_component_synthetic'
const CREATIVE_COMMONS_LICENSES = new Map([
  ['cc0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ['cc-by-4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  ['cc-by-sa-4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
])
const PERMISSION_BASES = new Set(['owner-owned', 'written-permission'])
// These are the Shop PNGs copied into the public bundle; the capture report also
// contains internal Sites and Commerce views for source review.
export const PUBLIC_SHOP_GALLERY_ASSETS = Object.freeze([
  'actual-shop-today.png',
  'actual-shop-sell.png', 'actual-shop-sell-tablet.png', 'actual-shop-sell-mobile.png',
  'actual-shop-sell-my.png', 'actual-shop-sell-my-tablet.png', 'actual-shop-sell-my-mobile.png',
  'actual-shop-orders.png', 'actual-shop-orders-tablet.png', 'actual-shop-orders-mobile.png',
  'actual-shop-inventory.png', 'actual-shop-inventory-tablet.png', 'actual-shop-inventory-mobile.png',
  'actual-shop-inventory-my-tablet.png', 'actual-shop-inventory-my-mobile.png',
])

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
}

/**
 * Capture receipts remain candidate-only. A separate, explicit review of the
 * exact source, report, provenance, image-rights manifest and PNG digests is
 * the only state that can authorize public use of those captures.
 */
function galleryReviewError(capture, provenance, attestation, evidence) {
  if (capture?.ok !== true || capture.classification !== CANDIDATE_CLASSIFICATION
    || capture.publicationReady !== false || !Array.isArray(capture.captures)
    || capture.captures.length === 0) return 'public_gallery_capture_not_candidate'
  if (attestation == null) return 'public_gallery_review_attestation_missing'
  if (attestation.schemaVersion !== RELEASE_ATTESTATION_SCHEMA
    || attestation.publicationReady !== true
    || attestation.reviewScope !== 'public_shop_gallery'
    || attestation.reviewedSurface !== 'browser_component_synthetic'
    || !isIsoTimestamp(attestation.reviewedAt)
    || !isIsoTimestamp(capture.capturedAt)
    || Date.parse(attestation.reviewedAt) < Date.parse(capture.capturedAt)
    || typeof attestation.reviewedBy !== 'string' || !attestation.reviewedBy.trim()
    || !isHttpsUrl(attestation.reviewRef)) return 'public_gallery_review_attestation_invalid'

  const binding = attestation.sourceBinding
  if (!binding || !/^[0-9a-f]{40}$/.test(capture.sourceCommit)
    || !/^[0-9a-f]{40}$/.test(capture.showroomTree)
    || !isSha256(capture.captureInputsSha256)
    || !isSha256(evidence?.captureReportSha256)
    || !isSha256(evidence?.provenanceSha256)
    || !isSha256(evidence?.imageSourcesSha256)
    || provenance?.captureSourceCommit !== capture.sourceCommit
    || provenance?.captureSourceTree !== capture.showroomTree
    || provenance?.capturedAt !== capture.capturedAt
    || binding.sourceCommit !== capture.sourceCommit
    || binding.showroomTree !== capture.showroomTree
    || binding.captureInputsSha256 !== capture.captureInputsSha256
    || binding.capturedAt !== capture.capturedAt
    || binding.captureReportSha256 !== evidence.captureReportSha256
    || binding.provenanceSha256 !== evidence.provenanceSha256
    || binding.imageSourcesSha256 !== evidence.imageSourcesSha256) {
    return 'public_gallery_review_source_binding_invalid'
  }

  const captureAssets = capture.captures
  const provenanceAssets = provenance?.assets
  const approvedAssets = attestation.assets
  const publicAssetNames = evidence?.publicAssetNames
  if (!Array.isArray(provenanceAssets) || !Array.isArray(approvedAssets)
    || !Array.isArray(publicAssetNames) || publicAssetNames.length === 0
    || new Set(publicAssetNames).size !== publicAssetNames.length
    || publicAssetNames.some(file => typeof file !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.png$/i.test(file))
    || captureAssets.length !== provenanceAssets.length
    || approvedAssets.length !== publicAssetNames.length) return 'public_gallery_review_assets_invalid'
  const sourceByFile = new Map(captureAssets.map(asset => [asset.file, asset]))
  const provenanceByFile = new Map(provenanceAssets.map(asset => [asset.file, asset]))
  const reviewedFiles = new Set()
  if (sourceByFile.size !== captureAssets.length || provenanceByFile.size !== provenanceAssets.length) {
    return 'public_gallery_review_assets_invalid'
  }
  for (const [file, source] of sourceByFile) {
    const proven = provenanceByFile.get(file)
    if (!proven || source.sha256 !== proven.sha256 || source.width !== proven.width
      || source.height !== proven.height) return 'public_gallery_review_assets_invalid'
  }
  const publicFiles = new Set(publicAssetNames)
  for (const asset of approvedAssets) {
    if (!asset || typeof asset.file !== 'string' || reviewedFiles.has(asset.file)
      || !publicFiles.has(asset.file) || !isSha256(asset.sha256)) return 'public_gallery_review_assets_invalid'
    reviewedFiles.add(asset.file)
    const source = sourceByFile.get(asset.file)
    const proven = provenanceByFile.get(asset.file)
    if (!source || !proven || asset.sha256 !== source.sha256 || asset.sha256 !== proven.sha256
      || asset.width !== source.width || asset.width !== proven.width
      || asset.height !== source.height || asset.height !== proven.height) {
      return 'public_gallery_review_assets_invalid'
    }
  }
  if (reviewedFiles.size !== publicFiles.size) return 'public_gallery_review_assets_invalid'
  return null
}

/**
 * Check evidence shape and explicit review metadata before a public release.
 * This does not determine whether a license or permission claim is legally valid.
 */
export function publicGalleryReleaseReadinessError(capture, imageSources, provenance, attestation, evidence) {
  const reviewError = galleryReviewError(capture, provenance, attestation, evidence)
  if (reviewError) return reviewError
  if (imageSources?.schemaVersion !== RIGHTS_SCHEMA
    || imageSources?.status !== 'cleared_for_publication'
    || !Array.isArray(imageSources.products)
    || imageSources.products.length === 0) return 'public_gallery_image_rights_unverified'

  const seenFiles = new Set()
  const seenSkus = new Set()
  for (const product of imageSources.products) {
    if (!product || typeof product.sku !== 'string' || !product.sku.trim()
      || seenSkus.has(product.sku) || !isHttpsUrl(product.source_page))
      return 'public_gallery_image_rights_unverified'
    seenSkus.add(product.sku)
    if (product.file == null) {
      if (product.image_use !== 'text_only_no_image'
        || !/^not_included_(?:no_public_reuse_grant|package_artwork_unreviewed)$/.test(product.photo_status)
        || product.source_image != null || product.image_sha256 != null
        || product.publication_rights != null) return 'public_gallery_image_rights_unverified'
      continue
    }
    if (typeof product.file !== 'string'
      || !/^[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(product.file)
      || seenFiles.has(product.file) || product.image_use === 'text_only_no_image'
      || !isHttpsUrl(product.source_image) || !isSha256(product.image_sha256)
      || evidence?.imageFileSha256?.[product.file] !== product.image_sha256)
      return 'public_gallery_image_rights_unverified'
    seenFiles.add(product.file)

    const rights = product.publication_rights
    const reviewedAt = typeof rights?.reviewed_at === 'string'
      && Number.isFinite(Date.parse(rights.reviewed_at))
      && new Date(rights.reviewed_at).toISOString().slice(0, 10) === rights.reviewed_at
    if (rights?.status !== 'cleared_for_publication'
      || !reviewedAt
      || typeof rights.reviewed_by !== 'string'
      || !rights.reviewed_by.trim()
      || rights.evidence_sha256 !== product.image_sha256
      || typeof rights.attribution !== 'string'
      || !rights.attribution.trim()) return 'public_gallery_image_rights_unverified'

    const licenseUrl = CREATIVE_COMMONS_LICENSES.get(rights.basis)
    if (licenseUrl) {
      if (rights.license_url !== licenseUrl) return 'public_gallery_image_rights_unverified'
      continue
    }

    // Commons also hosts author-dedicated public-domain photos that are not
    // CC0. Bind that basis to the exact source page instead of relabelling it
    // as a Creative Commons license or accepting an arbitrary URL.
    if (rights.basis === 'author-public-domain-dedication') {
      if (rights.license_url !== product.source_page
        || typeof rights.original_author !== 'string' || !rights.original_author.trim()) {
        return 'public_gallery_image_rights_unverified'
      }
      continue
    }

    if (!PERMISSION_BASES.has(rights.basis)
      || typeof rights.permission_ref !== 'string'
      || !rights.permission_ref.trim()) return 'public_gallery_image_rights_unverified'
  }

  if (seenFiles.size === 0 || Object.keys(evidence?.imageFileSha256 ?? {}).length !== seenFiles.size)
    return 'public_gallery_image_rights_unverified'

  return null
}

export function assertPublicGalleryReleaseReady(capture, imageSources, provenance, attestation, evidence) {
  const error = publicGalleryReleaseReadinessError(capture, imageSources, provenance, attestation, evidence)
  if (error) throw new Error(error)
}
