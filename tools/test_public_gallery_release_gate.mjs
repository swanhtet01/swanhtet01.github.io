import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { assertPublicGalleryReleaseReady, publicGalleryReleaseReadinessError } from './public_gallery_rights.mjs'

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function fixture() {
  const asset = { file: 'actual-shop-today.png', width: 1440, height: 900, sha256: 'd'.repeat(64) }
  const internalAsset = { file: 'actual-sites-editor.png', width: 1440, height: 900, sha256: 'a'.repeat(64) }
  const capture = {
    ok: true,
    classification: 'candidate_only_local_real_component_synthetic',
    publicationReady: false,
    capturedAt: '2026-10-21T04:54:23.003Z',
    sourceCommit: 'a'.repeat(40),
    showroomTree: 'b'.repeat(40),
    captureInputsSha256: 'c'.repeat(64),
    captures: [{ ...asset }, { ...internalAsset }],
  }
  const provenance = {
    captureSourceCommit: capture.sourceCommit,
    captureSourceTree: capture.showroomTree,
    capturedAt: capture.capturedAt,
    assets: [{ ...asset }, { ...internalAsset }],
  }
  const imageSources = {
    schemaVersion: 'supermega.shop-image-rights.v1',
    status: 'cleared_for_publication',
    products: [{
      sku: 'SM-1006',
      file: 'example.webp',
      image_sha256: 'e'.repeat(64),
      source_page: 'https://example.com/photo',
      source_image: 'https://example.com/example.webp',
      publication_rights: {
        status: 'cleared_for_publication',
        basis: 'cc-by-4.0',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: 'Example photographer — CC BY 4.0',
        reviewed_at: '2026-10-21',
        reviewed_by: 'founder',
        evidence_sha256: 'e'.repeat(64),
      },
    }, {
      sku: 'SM-1002',
      source_page: 'https://example.com/text-only-product',
      photo_status: 'not_included_package_artwork_unreviewed',
      image_use: 'text_only_no_image',
    }],
  }
  const evidence = {
    captureReportSha256: sha(capture),
    provenanceSha256: sha(provenance),
    imageSourcesSha256: sha(imageSources),
    publicAssetNames: [asset.file],
    imageFileSha256: { 'example.webp': 'e'.repeat(64) },
  }
  const attestation = {
    schemaVersion: 'supermega.public-gallery-release-attestation.v1',
    publicationReady: true,
    reviewScope: 'public_shop_gallery',
    reviewedSurface: 'browser_component_synthetic',
    reviewedAt: '2026-10-21T05:00:00.000Z',
    reviewedBy: 'independent reviewer',
    reviewRef: 'https://example.com/review/1',
    sourceBinding: {
      sourceCommit: capture.sourceCommit,
      showroomTree: capture.showroomTree,
      captureInputsSha256: capture.captureInputsSha256,
      capturedAt: capture.capturedAt,
      ...evidence,
    },
    assets: [{ ...asset }],
  }
  return { capture, imageSources, provenance, attestation, evidence }
}

const result = ({ capture, imageSources, provenance, attestation, evidence }) =>
  publicGalleryReleaseReadinessError(capture, imageSources, provenance, attestation, evidence)
const rebindRights = input => {
  input.evidence.imageSourcesSha256 = sha(input.imageSources)
  input.attestation.sourceBinding.imageSourcesSha256 = input.evidence.imageSourcesSha256
}

test('candidate capture alone cannot become a public release', () => {
  const input = fixture()
  input.attestation = null
  assert.equal(result(input), 'public_gallery_review_attestation_missing')
  assert.throws(() => assertPublicGalleryReleaseReady(input.capture, input.imageSources,
    input.provenance, input.attestation, input.evidence), /public_gallery_review_attestation_missing/)
  input.capture.publicationReady = true
  assert.equal(result(input), 'public_gallery_capture_not_candidate')
})

test('separate review of only public Shop assets accepts a fully cleared synthetic fixture', () => {
  assert.equal(result(fixture()), null)
})

test('review metadata and scope fail closed', () => {
  for (const change of [
    input => { input.attestation.publicationReady = false },
    input => { input.attestation.reviewScope = 'internal_gallery' },
    input => { input.attestation.reviewedSurface = 'native_flutter_app' },
    input => { input.attestation.reviewedBy = ' ' },
    input => { input.attestation.reviewRef = 'local-note' },
    input => { input.attestation.reviewedAt = '2026-10-20T05:00:00.000Z' },
  ]) {
    const input = fixture()
    change(input)
    assert.equal(result(input), 'public_gallery_review_attestation_invalid')
  }
})

test('capture, provenance, rights and source digest drift invalidate review', () => {
  for (const change of [
    input => { input.evidence.captureReportSha256 = 'f'.repeat(64) },
    input => { input.evidence.provenanceSha256 = 'f'.repeat(64) },
    input => { input.evidence.imageSourcesSha256 = 'f'.repeat(64) },
    input => { input.capture.sourceCommit = 'f'.repeat(40) },
    input => { input.capture.showroomTree = 'f'.repeat(40) },
    input => { input.capture.captureInputsSha256 = 'f'.repeat(64) },
    input => { input.provenance.captureSourceCommit = 'f'.repeat(40) },
    input => { input.attestation.sourceBinding.capturedAt = '2026-10-21T05:00:00.000Z' },
  ]) {
    const input = fixture()
    change(input)
    assert.equal(result(input), 'public_gallery_review_source_binding_invalid')
  }
})

test('missing, duplicated, or altered reviewed assets invalidate review', () => {
  for (const change of [
    input => { input.attestation.assets = [] },
    input => { input.attestation.assets.push(input.attestation.assets[0]) },
    input => { input.attestation.assets[0].sha256 = 'f'.repeat(64) },
    input => { input.attestation.assets[0].width = 100 },
    input => { input.attestation.assets[0].file = 'actual-sites-editor.png' },
    input => { input.evidence.publicAssetNames = ['actual-shop-renamed.png'] },
    input => { input.capture.captures[0].file = 'actual-shop-renamed.png' },
    input => { input.provenance.assets[1].sha256 = 'f'.repeat(64) },
  ]) {
    const input = fixture()
    change(input)
    assert.equal(result(input), 'public_gallery_review_assets_invalid')
  }
})

test('a correctly bound review cannot override missing product image rights', () => {
  const input = fixture()
  delete input.imageSources.products[0].publication_rights.evidence_sha256
  rebindRights(input)
  assert.equal(result(input), 'public_gallery_image_rights_unverified')
})

test('an uncleared photo, disguised text-only photo, or changed image bytes fail closed', () => {
  for (const change of [
    input => { input.imageSources.products[0].publication_rights.status = 'candidate' },
    input => { input.imageSources.products[1].file = 'mama.webp' },
    input => { input.imageSources.products[1].image_sha256 = 'f'.repeat(64) },
    input => { input.imageSources.products[0].file = 'renamed.webp' },
    input => { input.evidence.imageFileSha256['example.webp'] = 'f'.repeat(64) },
    input => { input.evidence.imageFileSha256['extra.webp'] = 'f'.repeat(64) },
  ]) {
    const input = fixture()
    change(input)
    rebindRights(input)
    assert.equal(result(input), 'public_gallery_image_rights_unverified')
  }
})
