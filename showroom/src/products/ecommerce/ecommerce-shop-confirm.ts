import type { CommerceItem } from '../../core/commerce-workspace.ts'
import {
  buildStorefrontPreview,
  storefrontPreviewDigest,
  validateStorefrontPreview,
  type StorefrontPreview,
} from './storefront-model.ts'
import { recordEcommerceShopDraft } from './ecommerce-shop-handoff.ts'
import {
  storefrontRequestLedgerContains,
  validateStorefrontOrderRequest,
  type StorefrontRequestLedger,
  type StorefrontOrderRequest,
} from './storefront-request.ts'

const digestPattern = /^sha256:[a-f0-9]{64}$/

export async function confirmEcommerceShopDraft(input: {
  request: StorefrontOrderRequest
  requestLedger: StorefrontRequestLedger
  preview: StorefrontPreview
  sourcePreviewDigest: string
  currentCatalog: CommerceItem[]
  confirmedAt: string
}) {
  const request = validateStorefrontOrderRequest(input.request)
  if (!storefrontRequestLedgerContains(input.requestLedger, request)) {
    throw new Error('The request receipt is not the exact retained Ecommerce record.')
  }
  const preview = validateStorefrontPreview(input.preview)
  if (!digestPattern.test(input.sourcePreviewDigest)
    || request.sourcePreviewDigest !== input.sourcePreviewDigest
    || await storefrontPreviewDigest(preview) !== input.sourcePreviewDigest) {
    throw new Error('The storefront preview changed. Create a new request receipt before Shop review.')
  }
  const currentPreview = buildStorefrontPreview(input.currentCatalog, {
    storeName: preview.storeName,
    summary: preview.summary,
    selectedSkus: preview.items.map((item) => item.sku),
  })
  if (await storefrontPreviewDigest(currentPreview) !== input.sourcePreviewDigest) {
    throw new Error('The Shop catalog changed. Refresh Ecommerce before handing off this request.')
  }
  const matchingPreviewItems = preview.items.filter((item) => item.sku === request.line.sku)
  const catalogItems = input.currentCatalog.filter((item) => item.sku === request.line.sku)
  if (matchingPreviewItems.length !== 1
    || catalogItems.length !== 1
    || matchingPreviewItems[0].name !== request.line.name
    || matchingPreviewItems[0].variant !== request.line.variant
    || matchingPreviewItems[0].unitPriceMmk !== request.line.unitPriceMmk
    || matchingPreviewItems[0].availability !== 'available'
    || catalogItems[0].name !== request.line.name
    || (catalogItems[0].variant ?? null) !== request.line.variant
    || catalogItems[0].price !== request.line.unitPriceMmk
    || catalogItems[0].onHand < request.line.quantity) {
    throw new Error('The requested item, price, or availability changed. Nothing was handed to Shop.')
  }
  return recordEcommerceShopDraft({
    request,
    currentCatalog: input.currentCatalog,
    confirmedAt: input.confirmedAt,
  })
}
