// Drafts a website brief from the trade a shop already told us it is.
//
// Shop onboarding asks what kind of business this is and answers with one of seven trade
// templates. The website starter then asks for audience, offer and proof as three blank
// boxes -- so an owner who has already said "I run a pharmacy" is made to invent marketing
// copy from nothing. That blank-box moment is where a product stops feeling finished.
//
// This maps each trade to a layout and a first draft of the three fields. Two things it
// deliberately does NOT do:
//
//   1. It does not touch the operator's own input. businessName and contactHref are passed
//      through exactly as given, so an over-long name or an http:// link stays invalid and
//      is reported. A generator that quietly repaired its caller's input would be laundering
//      bad data into a valid-looking brief.
//   2. It does not publish anything. applyWebsiteStarterBrief refuses any brief with
//      validation issues, and publishing is separately approval-gated. This produces a draft
//      the owner edits, not copy that goes live on its own.
//
// On the wording: every `proof` line describes how the trade template actually operates --
// reorder levels being set, stock counted per size, prep counts recorded -- rather than
// inventing credentials like customer counts or years in business. The field asks for "one
// supportable fact", and a fact the owner cannot support is worse than a blank box. These
// are still drafts to be reviewed, but they start from something true.
import type { ShopBusinessTemplateId } from '../shop/business-templates.ts'
import type { WebsiteStarterBrief, WebsiteStarterTemplateId } from './website-starter.ts'

export const WEBSITE_TRADE_BRIEF_SCHEMA = 'supermega.website.trade_brief.v1' as const

export type WebsiteTradeBriefRequest = {
  tradeId: ShopBusinessTemplateId
  businessName: string
  contactHref?: string
}

type TradeCopy = {
  label: string
  templateId: WebsiteStarterTemplateId
  audience: string
  offer: string
  proof: string
}

// SHAPE MATTERS, not just wording. `audience` is composed into sentences by the website
// templates -- "For {audience}", "{business} helps {audience}.", "This page is for
// {audience}." -- so it must be a lowercase noun phrase with NO trailing full stop, exactly
// like the sample brief's "families and office buyers in Yangon".
//
// Written as sentences first, which published "Thiri Pharmacy helps Nearby households and
// clinics buying medicine and daily supplies.." -- a double stop and a stray capital on a
// real customer's homepage. `offer` and `proof` DO stand alone as sentences, so they keep
// their capital and full stop. tools/test_website_trade_brief.mjs asserts all of this by
// rendering each trade's site rather than by inspecting the strings.
// Layout is chosen by what the website is FOR in that trade, not by what is easiest to fill:
// a mini-mart needs to be findable, a fashion shop needs to be browsed, and a hardware
// supplier needs an inquiry path because its orders start as a conversation about quantity.
const TRADE_COPY: Readonly<Record<ShopBusinessTemplateId, TradeCopy>> = {
  'mini-mart': {
    label: 'Mini-mart & grocery',
    templateId: 'business-presence',
    audience: 'households nearby who shop for daily groceries and basics',
    offer: 'Everyday groceries and household basics at the counter, with the items families buy most kept in stock and priced clearly.',
    proof: 'Reorder levels are set on every line we carry, so the basics customers come in for are on the shelf rather than sold out.',
  },
  pharmacy: {
    label: 'Pharmacy',
    templateId: 'business-presence',
    audience: 'nearby households and clinics buying medicine and daily supplies',
    offer: 'Over-the-counter medicine and clinic supplies, with strict reorder levels so regular items and first-aid stock stay available.',
    proof: 'Every medicine we stock carries a reorder level, so repeat items are reordered before they run out and stock is counted rather than estimated.',
  },
  'phone-electronics': {
    label: 'Phone & electronics',
    templateId: 'catalog-showcase',
    audience: 'customers shopping for phone accessories and small electronics',
    offer: 'Phone accessories, chargers and small electronics kept at the counter, with prices listed before you make the trip.',
    proof: 'Fast-moving lines are counted daily, so the accessories listed here are the ones actually on the counter today.',
  },
  fashion: {
    label: 'Fashion & clothing',
    templateId: 'catalog-showcase',
    audience: 'shoppers looking for clothing and accessories in their own size',
    offer: 'Clothing and accessories stocked down to the size, so what is listed is what we can actually hand over today.',
    proof: 'Stock is tracked per size rather than per style, so an item shown as available is available in the size listed, not just in the design.',
  },
  hardware: {
    label: 'Hardware & construction supply',
    templateId: 'lead-generation',
    audience: 'builders and contractors ordering site materials in bulk',
    offer: 'Building materials, tools and site consumables, with bulk orders quoted and set aside for collection or delivery.',
    proof: 'Bulk orders are recorded against stock on hand, so a quantity confirmed for your site is reserved rather than promised twice.',
  },
  'tea-coffee': {
    label: 'Tea & coffee shop',
    templateId: 'lead-generation',
    audience: 'counter regulars, plus offices ordering tea for events',
    offer: 'Tea shop menu at the counter, plus large preorders for offices and events prepared for an agreed collection time.',
    proof: 'Daily prep counts are recorded against every menu item, so a preorder is checked against what the kitchen can actually make that day.',
  },
  'auto-parts': {
    label: 'Auto parts',
    templateId: 'lead-generation',
    audience: 'drivers and workshops looking for vehicle spares and consumables',
    offer: 'Vehicle consumables and spares at the workshop counter, with the part your vehicle needs checked against stock before you travel.',
    proof: 'Every part is stocked against its own SKU rather than a description, so a part confirmed as available is the specific fit, not a near match.',
  },
}

// Presentation order, matching the order Shop lists its trade templates in.
const TRADE_ORDER: readonly ShopBusinessTemplateId[] = [
  'mini-mart', 'pharmacy', 'phone-electronics', 'fashion', 'hardware', 'tea-coffee', 'auto-parts',
] as const

/**
 * The trade choices to present, in the order Shop presents them.
 *
 * The labels are held here rather than imported from business-templates.ts so the website
 * bundle does not pull in the whole Shop catalog for seven short strings. The duplication is
 * the trade-off, and tools/test_website_trade_brief.mjs asserts every label still matches the
 * name Shop uses, so the two cannot drift silently.
 */
export function websiteTradeBriefOptions(): readonly { id: ShopBusinessTemplateId; label: string }[] {
  return TRADE_ORDER.map((id) => ({ id, label: TRADE_COPY[id].label }))
}

export function websiteTradeBriefTradeIds(): readonly ShopBusinessTemplateId[] {
  return Object.keys(TRADE_COPY).sort() as ShopBusinessTemplateId[]
}

/**
 * Returns a first-draft website brief for a trade, or null if the trade is unknown.
 *
 * The caller still runs websiteStarterBriefIssues() -- this does not vouch for the
 * operator's own businessName or contactHref, only for the copy it drafts.
 */
export function websiteTradeBrief(request: WebsiteTradeBriefRequest): WebsiteStarterBrief | null {
  const copy = Object.prototype.hasOwnProperty.call(TRADE_COPY, request.tradeId)
    ? TRADE_COPY[request.tradeId]
    : undefined
  if (!copy) return null
  return {
    templateId: copy.templateId,
    // Passed through untouched on purpose -- see note 1 at the top of this file.
    businessName: request.businessName,
    contactHref: request.contactHref ?? '',
    audience: copy.audience,
    offer: copy.offer,
    proof: copy.proof,
  }
}
