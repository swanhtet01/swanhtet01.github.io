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

export const ECOMMERCE_TRADE_STOREFRONT_SCHEMA = 'supermega.ecommerce.trade_storefront.v1' as const

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
}

// Only trades with Ecommerce-appropriate copy appear here -- see the file header. Section (d) of
// TEMPLATE-EXPANSION.md scopes which trades are worth writing next; this item's acceptance bar is
// bakery alone.
const TRADE_STOREFRONT: Readonly<Partial<Record<ShopBusinessTemplateId, EcommerceTradeStorefront>>> = {
  bakery: {
    summary: (businessName) => `Browse ${businessName}'s fresh bread, cakes and pastries -- order ahead for a cake, or pick up what's ready today.`,
    collections: { featured: 'Fresh today', rest: 'Order ahead' },
    note: "Demo bakery listing: confirm today's bake list, pickup time and pricing before launch.",
    preferredSkus: ['BREAD-WHITE', 'CROISSANT-BUTTER', 'CAKE-SLICE-CHOC', 'TART-EGG'],
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
