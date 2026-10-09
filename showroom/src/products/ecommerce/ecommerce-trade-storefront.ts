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
// This registry is complete for every Shop trade. An unrecognised or unselected trade still
// returns null so callers retain their existing generic fallback rather than guessing a business type.
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
  // The merchandising note shown on every row with concise, trade-specific review guidance.
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

// Every shipped Shop trade has a Commerce definition. The type intentionally rejects an
// incomplete registry when a new Shop template is added.
const TRADE_STOREFRONT: Readonly<Record<ShopBusinessTemplateId, EcommerceTradeStorefront>> = {
  'mini-mart': {
    summary: (businessName) => `Browse ${businessName}'s everyday groceries and household essentials, then send a request for availability and collection.`,
    collections: { featured: 'Everyday essentials', rest: 'More for the home' },
    note: 'Confirm quantities, current price and collection time before accepting the request.',
    preferredSkus: ['RICE-25KG', 'OIL-1L', 'SUGAR-1KG'],
  },
  pharmacy: {
    summary: (businessName) => `Browse ${businessName}'s pharmacy products and daily supplies, then ask the team to confirm the exact item before collection.`,
    collections: { featured: 'Daily care', rest: 'Health essentials' },
    note: 'Confirm the exact product, strength, availability and any prescription requirement before accepting the request.',
  },
  'phone-electronics': {
    summary: (businessName) => `Browse ${businessName}'s phone accessories and small electronics, then confirm compatibility before collection.`,
    collections: { featured: 'Device essentials', rest: 'Accessories and power' },
    note: 'Confirm the device model, connector, compatibility, price and warranty terms before accepting the request.',
    preferredSkus: ['CHARGER-TYPEC', 'CABLE-USBC-1M', 'EARBUD-TWS', 'POWERBANK-10K'],
  },
  fashion: {
    summary: (businessName) => `Browse ${businessName}'s clothing and accessories, then request the size, colour and style you need.`,
    collections: { featured: 'New arrivals', rest: 'Wardrobe staples' },
    note: 'Confirm the item, size, colour, measurements, availability and exchange terms before accepting the request.',
    preferredSkus: ['TSHIRT-M-WHT', 'JEANS-32', 'LONGYI-WMN', 'BLOUSE-S'],
  },
  hardware: {
    summary: (businessName) => `Browse ${businessName}'s building materials, tools and site consumables, then request a quantity for review.`,
    collections: { featured: 'Site essentials', rest: 'Tools and supplies' },
    note: 'Confirm the delivery address, quantity, price and handover terms before accepting the request.',
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
  'tea-coffee': {
    summary: (businessName) => `Browse ${businessName}'s tea, coffee and food, then request a collection time for your order.`,
    collections: { featured: 'Ready to order', rest: 'Tea-time favourites' },
    note: 'Confirm ingredients, quantities, collection time and current availability before accepting the request.',
    preferredSkus: ['TEA-SWEET', 'COFFEE-MILK', 'MOHINGA-BOWL', 'NANPYAR-PE'],
  },
  'auto-parts': {
    summary: (businessName) => `Browse ${businessName}'s vehicle parts and consumables, then request a compatibility check for your vehicle.`,
    collections: { featured: 'Service essentials', rest: 'Parts and consumables' },
    note: 'Confirm the vehicle model, year, part number, fitment, price and availability before accepting the request.',
    preferredSkus: ['OIL-ENG-4L', 'FILTER-OIL', 'PAD-BRAKE-FR', 'BATT-12V60'],
  },
  restaurant: {
    summary: (businessName) => `Browse ${businessName}'s menu, then request the dishes and collection time that work for your table or group.`,
    collections: { featured: 'Kitchen favourites', rest: 'More from the menu' },
    note: 'Confirm dietary requirements, quantities, preparation time and collection or table details before accepting the request.',
    preferredSkus: ['CURRY-CHICKEN', 'NOODLE-SHAN', 'SALAD-LAHPET', 'GRILL-TILAPIA'],
  },
  'beauty-spa': {
    summary: (businessName) => `Browse ${businessName}'s home-care products and request items for pickup after confirming availability.`,
    collections: { featured: 'Home care', rest: 'More for your routine' },
    note: 'Confirm treatment suitability, counter stock and pickup time before accepting the request.',
    preferredSkus: ['SPA-OIL-AROMA', 'SPA-SERUM', 'SPA-THANAKA', 'SPA-ROLLON'],
    guidedOrder: { fulfilment: 'pickup', paymentAdapter: 'pay_on_pickup' },
  },
  bakery: {
    summary: (businessName) => `Browse ${businessName}'s bread, cakes and pastries, then request a collection time for what you need.`,
    collections: { featured: 'Fresh today', rest: 'Order ahead' },
    note: "Confirm today's bake list, ingredients, price and collection time before accepting the request.",
    preferredSkus: ['BREAD-WHITE', 'CROISSANT-BUTTER', 'CAKE-SLICE-CHOC', 'TART-EGG'],
    guidedOrder: { fulfilment: 'pickup', paymentAdapter: 'pay_on_pickup' },
  },
}

export const ecommerceTradeStorefrontIds = Object.freeze(Object.keys(TRADE_STOREFRONT).sort() as ShopBusinessTemplateId[])

/**
 * Returns this trade's Ecommerce storefront copy, or null when the trade is unknown or absent.
 * Callers retain their generic fallback on null instead of guessing a business type.
 */
export function ecommerceTradeStorefront(tradeId: ShopBusinessTemplateId | null): EcommerceTradeStorefront | null {
  if (!tradeId) return null
  return Object.prototype.hasOwnProperty.call(TRADE_STOREFRONT, tradeId)
    ? TRADE_STOREFRONT[tradeId] ?? null
    : null
}
