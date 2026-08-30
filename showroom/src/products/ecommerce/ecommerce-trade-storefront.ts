// Drafts per-trade Ecommerce storefront copy from the trade a Shop already told us it is --
// the same source Website reads (readLocalShopBusinessTemplateId), applied here instead of to
// website copy. See hq/strategy/TEMPLATE-EXPANSION.md section (c) for the full reasoning; the
// short version:
//
//   workingSamplePlan (local-merchandising-import.ts) builds its storefront summary, collection
//   labels and merchandising note from the WORKFLOW template id alone (social-storefront /
//   pickup-preorder / wholesale-request) -- identical wording for a pharmacy and a bakery. Trade
//   and workflow are orthogonal: a bakery can run any of the three workflows, so this is a
//   second axis layered on top, not a replacement registry. Extending Shop's existing ids costs
//   far less than a parallel Ecommerce catalog would (that catalog IS Shop's, via
//   readStorefrontCatalog) and it is what website-trade-brief.ts already proved out.
//
// Unlike website-trade-brief.ts's TRADE_COPY, this table is intentionally partial -- only trades
// whose Ecommerce storefront copy has actually been written appear here. A trade id absent from
// the table is treated exactly like an id workingSamplePlan cannot resolve to a known trade at
// all: ecommerceTradeStorefront returns null, and every caller falls back to today's exact
// generic wording. That "no id or no match -> return null / fall back to generic" discipline is
// the one website-trade-brief.ts documents, and it is what keeps a hand-imported CSV -- where the
// trade cannot be determined -- reading exactly as it does today.
import type { ShopBusinessTemplateId } from '../shop/business-templates.ts'
import type { EcommercePaymentAdapter } from './ecommerce-buying-lifecycle.ts'

export const ECOMMERCE_TRADE_STOREFRONT_SCHEMA = 'supermega.ecommerce.trade_storefront.v1' as const

// The guided sample's checkout mix for this trade -- replaces the hardcoded pickup/pay_on_pickup
// guided-sample-order.ts shipped with (TEMPLATE-EXPANSION.md queue item 6). buildEcommerceCheckoutQuote
// (ecommerce-buying-lifecycle.ts) requires a delivery address whenever fulfilment is 'delivery' and
// throws otherwise -- a thrown error inside buildGuidedSampleOrderRequest is swallowed and yields a
// silently unseeded sample, not a visible failure, so the discriminated union below makes a
// delivery entry missing its address unrepresentable at the type level rather than relying on a
// runtime check someone could forget. ecommercePaymentMatchesFulfilment (same file) constrains the
// pairing further: kbzpay_manual pairs with either fulfilment, pickup requires pay_on_pickup, and
// delivery requires cash_on_delivery -- every entry below must satisfy that pairing.
export type EcommerceGuidedOrderMix =
  | { fulfilment: 'pickup'; paymentAdapter: EcommercePaymentAdapter }
  | {
      fulfilment: 'delivery'
      paymentAdapter: EcommercePaymentAdapter
      deliveryAddress: { line1: string; township: string; city: string; instructions: string | null }
    }

export type EcommerceTradeStorefront = {
  // The storefront's one-line promise. Takes the business name because the generic copy it
  // replaces embeds it too (`Browse ${businessName}'s featured products...`).
  summary: (businessName: string) => string
  // Collection labels, split by whether a row is "featured" -- the same boolean
  // workingSamplePlan already computes per row for every workflow template, so a trade's labels
  // apply the same way regardless of which workflow chose the row.
  collections: { featured: string; rest: string }
  // The merchandising note shown on every row, replacing the workflow-specific "Demo ... listing"
  // wording with trade-specific guidance.
  note: string
  // SKUs to rank ahead of the plain onHand sort, so a trade's own hero products lead the
  // storefront instead of whatever happens to carry the highest stock count. A bakery storefront
  // led by bottled water is the same class of bug as the tea shop once led by "Catering
  // consultation" (see business-templates.ts's packServiceRows comment). Merged with, not
  // replacing, any preferredSkus the caller already supplies (the client's own installed
  // working-sample SKUs), so both signals count.
  preferredSkus?: readonly string[]
  // Fulfilment and payment mix for the one guided customer request this trade's Ecommerce sample
  // seeds. Optional: a trade entry may omit this and inherit guided-sample-order.ts's default of
  // pickup/pay_on_pickup/no address -- see that file. A bakery customer picking up their own cake
  // IS the realistic default, so bakery below writes it out explicitly rather than relying on the
  // fallback, to keep the choice visible and testable per trade rather than implicit.
  guidedOrder?: EcommerceGuidedOrderMix
}

// Only trades with Ecommerce-appropriate copy appear here -- see the file header. Section (d) of
// TEMPLATE-EXPANSION.md scopes which trades are worth writing next; item 5's acceptance bar was
// bakery alone, item 6 adds hardware as the delivery/cash_on_delivery example its acceptance
// criterion names.
const TRADE_STOREFRONT: Readonly<Partial<Record<ShopBusinessTemplateId, EcommerceTradeStorefront>>> = {
  'beauty-spa': {
    // The Spa Website and onboarding samples already promise appointment-led treatments while
    // Ecommerce currently carries only the two real home-care SKUs. Keep the storefront honest:
    // it can collect product requests for pickup, but it does not pretend to book an appointment.
    summary: (businessName) => `Browse ${businessName}'s home-care products after your treatment -- request items for pickup and confirm availability before collection.`,
    collections: { featured: 'Home care', rest: 'More for your routine' },
    note: 'Demo spa listing: confirm treatment suitability, counter stock, and pickup time before launch.',
    preferredSkus: ['SPA-OIL-100ML', 'SPA-COMPRESS'],
    guidedOrder: { fulfilment: 'pickup', paymentAdapter: 'pay_on_pickup' },
  },
  bakery: {
    summary: (businessName) => `Browse ${businessName}'s fresh bread, cakes and pastries -- order ahead for a cake, or pick up what's ready today.`,
    collections: { featured: 'Fresh today', rest: 'Order ahead' },
    note: "Demo bakery listing: confirm today's bake list, pickup time and pricing before launch.",
    preferredSkus: ['BREAD-WHITE', 'CROISSANT-BUTTER', 'CAKE-SLICE-CHOC', 'TART-EGG'],
    // A bakery customer collects their own cake in person and settles at the counter -- the exact
    // pickup/pay_on_pickup pair guided-sample-order.ts already defaulted to before this item.
    guidedOrder: { fulfilment: 'pickup', paymentAdapter: 'pay_on_pickup' },
  },
  // Hardware SKUs (business-templates.ts's hardware seed) and its 'Site delivery before concrete
  // pour' pending order both point the same way: a hardware customer orders bulk site materials
  // for delivery and settles in cash when the load arrives -- delivery/cash_on_delivery, the
  // non-pickup pairing TEMPLATE-EXPANSION.md's item 6 acceptance criterion names explicitly.
  hardware: {
    summary: (businessName) => `Browse ${businessName}'s building materials, tools and site consumables -- request a delivery quantity for manager review.`,
    collections: { featured: 'Site essentials', rest: 'Tools' },
    note: 'Demo hardware listing: confirm delivery address, quantity and pricing before launch.',
    preferredSkus: ['CEMENT-50KG', 'REBAR-10MM', 'NAIL-2IN-KG', 'PAINT-4L-WHT'],
    guidedOrder: {
      fulfilment: 'delivery',
      paymentAdapter: 'cash_on_delivery',
      deliveryAddress: {
        line1: 'No. 42, Bogyoke Aung San Road',
        township: 'Botahtaung',
        city: 'Yangon',
        instructions: 'Call before arrival; unload at the side gate.',
      },
    },
  },
}

/**
 * Returns this trade's Ecommerce storefront copy, or null when the trade is unknown or has no
 * copy written yet. Callers MUST fall back to their own generic copy on null -- see the file
 * header for why a wrong guess here is worse than the generic wording it would replace.
 */
export function ecommerceTradeStorefront(tradeId: ShopBusinessTemplateId | null): EcommerceTradeStorefront | null {
  if (!tradeId) return null
  return Object.prototype.hasOwnProperty.call(TRADE_STOREFRONT, tradeId)
    ? TRADE_STOREFRONT[tradeId] ?? null
    : null
}
