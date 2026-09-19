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
// A selected trade proves no operational facts about the business. Draft useful inquiry
// guidance, not claims of current inventory, reserved capacity or guaranteed service.
// The legacy `proof` field holds this guidance until an operator supplies reviewed facts.
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
    offer: 'Ask about everyday groceries and household basics for your next shopping trip.',
    proof: 'Share your shopping list and quantities. Confirm current prices, availability and collection options before travelling.',
  },
  pharmacy: {
    label: 'Pharmacy',
    templateId: 'business-presence',
    audience: 'nearby households and clinics buying medicine and daily supplies',
    offer: 'Ask about pharmacy products and daily supplies before your visit.',
    proof: 'Ask a qualified pharmacist about suitability and any prescription requirements. Confirm the exact product, strength and availability; this website does not give medical advice.',
  },
  'phone-electronics': {
    label: 'Phone & electronics',
    templateId: 'catalog-showcase',
    audience: 'customers shopping for phone accessories and small electronics',
    offer: 'Find out about phone accessories, chargers and small electronics for your device.',
    proof: 'Include your device model and required connector. Confirm compatibility, current price, availability and warranty terms before buying.',
  },
  fashion: {
    label: 'Fashion & clothing',
    templateId: 'catalog-showcase',
    audience: 'shoppers looking for clothing and accessories in their own size',
    offer: 'Explore clothing and accessories and ask about the size and style you need.',
    proof: 'Include the item, size and colour you want. Confirm measurements, availability and exchange terms before ordering.',
  },
  hardware: {
    label: 'Hardware & construction supply',
    templateId: 'lead-generation',
    audience: 'builders and contractors ordering site materials in bulk',
    offer: 'Discuss building materials, tools and site consumables for your project.',
    proof: 'Send the specification, quantities and site location. Request a confirmed quote and collection or delivery terms; an inquiry does not reserve stock.',
  },
  'tea-coffee': {
    label: 'Tea & coffee shop',
    templateId: 'lead-generation',
    audience: 'counter regulars, plus offices ordering tea for events',
    offer: 'Ask about tea, coffee and food options for a visit or group order.',
    proof: 'Share the drinks or food, quantities and preferred time. Ask about ingredients and confirm capacity and collection details before relying on a group order.',
  },
  'auto-parts': {
    label: 'Auto parts',
    templateId: 'lead-generation',
    audience: 'drivers and workshops looking for vehicle spares and consumables',
    offer: 'Ask about vehicle spares and consumables for your repair or maintenance job.',
    proof: 'Provide the vehicle model, year and part number where available. Confirm fitment, condition, warranty and availability before purchase.',
  },
  restaurant: {
    label: 'Restaurant',
    templateId: 'lead-generation',
    audience: 'diners nearby plus families booking a table for a group meal',
    offer: 'Explore dining options and ask about your next meal or group visit.',
    proof: 'Share your date, time and party size. Discuss dietary requirements with the team and wait for explicit confirmation before treating a table as booked.',
  },
  'beauty-spa': {
    label: 'Beauty spa',
    templateId: 'lead-generation',
    audience: 'clients booking treatments and buying spa products',
    offer: 'Ask about treatments, appointment options and products for your next spa visit.',
    proof: 'Ask about treatment duration, suitability, price and cancellation terms. Request a preferred time; an inquiry is not a confirmed appointment.',
  },
  bakery: {
    label: 'Bakery & patisserie',
    templateId: 'lead-generation',
    audience: 'walk-in customers plus families and offices ordering cakes ahead',
    offer: 'Ask about bread, pastries and cake options for your next occasion.',
    proof: 'Share the date, servings and design you have in mind. Confirm ingredients, allergens, lead time, price and collection details before placing an order.',
  },
}

// Presentation order, matching the order Shop lists its trade templates in.
const TRADE_ORDER: readonly ShopBusinessTemplateId[] = [
  'mini-mart', 'pharmacy', 'phone-electronics', 'fashion', 'hardware', 'tea-coffee', 'auto-parts', 'restaurant', 'beauty-spa', 'bakery',
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
