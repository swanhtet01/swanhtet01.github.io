import {
  buildEcommerceCheckoutQuote,
  buildEcommerceOrderRequestV2,
  buildEcommercePimProjection,
  type EcommerceBuyingState,
  type EcommerceOrderRequestV2,
} from './ecommerce-buying-lifecycle.ts'
import { ecommerceTradeStorefront } from './ecommerce-trade-storefront.ts'
import type { StorefrontPreview } from './storefront-model.ts'
import type { ShopBusinessTemplateId } from '../shop/business-templates.ts'

// Falls back to today's exact pre-item-6 default -- pickup, pay_on_pickup, no delivery address --
// when the trade is unknown or has no guidedOrder mix written yet. See
// ecommerce-trade-storefront.ts's EcommerceGuidedOrderMix for why a 'delivery' entry always carries
// an address: this default's 'pickup' branch never needs one.
const DEFAULT_GUIDED_ORDER_MIX = { fulfilment: 'pickup', paymentAdapter: 'pay_on_pickup' } as const

// A fixed, obviously-synthetic checkout key keeps the guided sample deterministic
// and recognizable, so it can be replaced on re-provisioning while any real
// customer request is preserved.
export const GUIDED_SAMPLE_CHECKOUT_KEY = 'ECI-5A4D0000-0000-4000-8000-000000000001'
export const GUIDED_SAMPLE_REQUEST_ID = `ECR-${GUIDED_SAMPLE_CHECKOUT_KEY.slice(4)}`
const GUIDED_SAMPLE_QUOTE_MINUTES = 15

export function isGuidedSampleBuyingState(state: EcommerceBuyingState) {
  const onlyGuidedRequests = state.requests.every((request) => request.id === GUIDED_SAMPLE_REQUEST_ID)
  const noFollowUpEvidence = !state.returnIntents.length
    && !state.supportIntents.length
    && !state.correctionIntents.length
    && !state.cancellationIntents.length
    && !state.cancellationDecisions.length
    && !state.amendmentIntents.length
    && !state.rescheduleIntents.length
  return onlyGuidedRequests && noFollowUpEvidence
}

export type GuidedSampleOrderInput = {
  scope: string
  preview: StorefrontPreview
  sourcePreviewDigest: string
  capturedAt: string
  storefrontRevision: number
  storefrontActionId: string
  // The Shop trade the storefront resolved to, the same value workingSamplePlan takes
  // (local-merchandising-import.ts). null covers both "no trade" and "a trade with no
  // guidedOrder mix written yet" -- either way this must fall back to DEFAULT_GUIDED_ORDER_MIX.
  trade: ShopBusinessTemplateId | null
}

/**
 * Builds one pending customer request so the Ecommerce demo opens mid-funnel
 * instead of on an untouched shop window.
 *
 * The request deliberately stops at `pending_shop_review`: confirming it in Shop
 * is the founder's live demo moment, and it is also what earns the Ecommerce
 * proof, so a sample must never perform it.
 */
export async function buildGuidedSampleOrderRequest(
  input: GuidedSampleOrderInput,
): Promise<EcommerceOrderRequestV2 | null> {
  const sellable = input.preview.items.filter((item) => item.availability === 'available')
  if (!sellable.length) return null
  const cart = sellable.slice(0, 2).map((item, index) => ({ sku: item.sku, quantity: index === 0 ? 2 : 1 }))
  const quotedAt = new Date(input.capturedAt)
  if (!Number.isFinite(quotedAt.getTime())) return null
  const expiresAt = new Date(quotedAt.getTime() + GUIDED_SAMPLE_QUOTE_MINUTES * 60_000)
  // trade is a second, orthogonal axis on top of the workflow template id, exactly like
  // ecommerce-trade-storefront.ts's storefront copy -- null (no trade, or a trade with no
  // guidedOrder mix written yet) MUST reproduce today's exact pickup/pay_on_pickup/no-address
  // request, byte for byte.
  const guidedOrder = ecommerceTradeStorefront(input.trade)?.guidedOrder ?? DEFAULT_GUIDED_ORDER_MIX
  const deliveryAddress = guidedOrder.fulfilment === 'delivery' ? guidedOrder.deliveryAddress : null
  try {
    const pim = await buildEcommercePimProjection(input.scope, input.sourcePreviewDigest, input.preview)
    const quote = await buildEcommerceCheckoutQuote({
      pim,
      cart,
      customerReference: 'Guided sample customer',
      customerProfile: { name: 'Ma Thida Aung', phone: '09 450 118 720' },
      deliveryAddress,
      fulfilment: guidedOrder.fulfilment,
      paymentAdapter: guidedOrder.paymentAdapter,
      promotionCode: null,
      idempotencyKey: GUIDED_SAMPLE_CHECKOUT_KEY,
      quotedAt: quotedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    return await buildEcommerceOrderRequestV2(quote, {
      revision: input.storefrontRevision,
      actionId: input.storefrontActionId,
    })
  } catch {
    // A sample must never block provisioning; the storefront still installs.
    return null
  }
}
