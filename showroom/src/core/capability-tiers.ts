/**
 * What each tier includes -- and, more importantly, what may never leave the free one.
 *
 * SuperMega runs browser-local. A shop that installs it today gets a working till, an appointment
 * book, stock, orders, a daily close and an accounting handoff, all without an account. That is the
 * product, not a trial of it.
 *
 * So the commercial model is additive, and this module exists to keep it that way. The load-bearing
 * rule is FREE_FOREVER below: a capability that works locally today can never be moved behind a
 * tier. Retroactively paywalling a shop's own till is the one thing that would make every promise
 * on the signup page a lie, and it is exactly the kind of decision that gets made quietly under
 * revenue pressure. It is a checked invariant here rather than a good intention.
 *
 * NO PRICES LIVE HERE, by decision. Tiers describe capability, not cost; what a business pays is
 * agreed with the founder. A guard asserts no amount ever appears in this file.
 */

export const CAPABILITY_TIER_SCHEMA = 'supermega.capability_tiers.v1' as const

/**
 * free       -- runs on the owner's device, no account, no server, no cost to us
 * premium    -- needs our compute or our storage, so it needs a conversation
 * enterprise -- needs shared records across people and devices, so it needs a managed workspace
 */
export type CapabilityTier = 'free' | 'premium' | 'enterprise'

export const capabilityTierOrder: readonly CapabilityTier[] = ['free', 'premium', 'enterprise']

export type Capability = {
  id: string
  label: string
  tier: CapabilityTier
  /** What the owner actually gets. Written for them, not for us. */
  outcome: string
  /** Why it sits at this tier. An owner is owed a reason, not a wall. */
  reason: string
}

/**
 * Everything the product does on a device today, with no account and no network. This list is the
 * promise. Moving any id out of 'free' must fail the build.
 */
export const FREE_FOREVER: readonly string[] = [
  'shop-counter',
  'shop-inventory',
  'shop-orders',
  'shop-appointments',
  'shop-daily-close',
  'shop-accounting-handoff',
  'plant-production',
  'website-builder',
  'ecommerce-storefront',
  'local-backup',
  'device-reset',
]

export const capabilities: readonly Capability[] = [
  // --- free: the whole working business, on one device --------------------------------
  {
    id: 'shop-counter',
    label: 'Counter and payments',
    tier: 'free',
    outcome: 'Ring up a sale, take Cash, KBZPay or WavePay, and watch stock fall on its own.',
    reason: 'Runs entirely on your device. It costs us nothing, so it costs you nothing.',
  },
  {
    id: 'shop-inventory',
    label: 'Stock and reorder levels',
    tier: 'free',
    outcome: 'Track what you hold, get told before you run out, and count stock without stopping trade.',
    reason: 'Runs entirely on your device.',
  },
  {
    id: 'shop-orders',
    label: 'Orders, returns and refunds',
    tier: 'free',
    outcome: 'Hold an order, take payment, hand it over, and issue a credit note when something comes back.',
    reason: 'Runs entirely on your device.',
  },
  {
    id: 'shop-appointments',
    label: 'Appointment book',
    tier: 'free',
    outcome: 'Book treatments against staff and rooms, with double-booking refused.',
    reason: 'Runs entirely on your device.',
  },
  {
    id: 'shop-daily-close',
    label: 'Daily close',
    tier: 'free',
    outcome: 'Count the drawer against what the day says it should hold, and keep the difference with its reason.',
    reason: 'This is the step that makes your numbers worth trusting. Charging for it would be charging for honesty.',
  },
  {
    id: 'shop-accounting-handoff',
    label: 'Accounting export',
    tier: 'free',
    outcome: 'Hand your accountant a balanced packet with the evidence behind every figure.',
    reason: 'Your records are yours. Getting them out is never a paid feature.',
  },
  {
    id: 'plant-production',
    label: 'Production and batches',
    tier: 'free',
    outcome: 'Plan a batch, issue materials, record output and quality, and close the shift.',
    reason: 'Runs entirely on your device.',
  },
  {
    id: 'website-builder',
    label: 'Website',
    tier: 'free',
    outcome: 'Build and download business pages that capture enquiries.',
    reason: 'Runs entirely on your device.',
  },
  {
    id: 'ecommerce-storefront',
    label: 'Storefront and order requests',
    tier: 'free',
    // Said "Show a catalog online", which the next line contradicts and the code does not do:
    // a storefront order request is typed `mode: 'browser-local-request'` and the storefront is a
    // surface inside this app, not a public URL. Publishing a shop the internet can reach is a
    // managed-mode capability; promising it here would be a promise the free tier cannot keep.
    outcome: 'Show your catalog on this device and take order requests into Shop for review.',
    reason: 'Runs entirely on your device.',
  },
  {
    id: 'local-backup',
    label: 'Encrypted backup and restore',
    tier: 'free',
    outcome: 'Take an encrypted copy of everything and put it back on any device.',
    reason: 'Losing a business’s records because it did not pay is not a business model.',
  },
  {
    id: 'device-reset',
    label: 'Reset this device',
    tier: 'free',
    outcome: 'Erase everything on this device, with a restore point taken first.',
    reason: 'Leaving is always free.',
  },

  // --- premium: work that needs our compute -------------------------------------------
  {
    id: 'ai-order-intake',
    label: 'Read orders from messages',
    tier: 'premium',
    outcome: 'Paste a customer’s Messenger or Viber message and get a draft order, where every field is quoted from what they actually wrote.',
    reason: 'A model reads the message on our servers, and that costs us money per message.',
  },
  {
    id: 'ai-demand-advice',
    label: 'Reorder and demand advice',
    tier: 'premium',
    // Honesty rule: this capability is DESIGNED, not built — no implementation
    // exists behind it yet (the free reorder plan in shop-replenishment.ts is a
    // different, local feature). The copy must say so; promising an unbuilt
    // capability with "talk to us" framing would break the door-honesty rule
    // the rest of this file enforces.
    outcome: 'Being designed: advice on what is about to run out and what is not selling, from your own trading history. The free reorder plan already works today.',
    reason: 'It would run on our servers against records you choose to share — tell us if you want to shape it.',
  },
  {
    id: 'cloud-backup',
    label: 'Automatic off-device backup',
    tier: 'premium',
    outcome: 'Your encrypted backup kept for you, so a lost phone is not a lost business.',
    reason: 'We hold the storage. Manual backup stays free forever.',
  },

  // --- enterprise: records shared between people ---------------------------------------
  {
    id: 'shared-workspace',
    label: 'One set of records for the whole team',
    tier: 'enterprise',
    outcome: 'Your counter, your stockroom and your office see the same records at the same time.',
    reason: 'Needs a managed workspace we run and keep available.',
  },
  {
    id: 'staff-roles',
    label: 'Staff accounts and limits',
    tier: 'enterprise',
    outcome: 'Give each person their own sign-in and decide what they may change.',
    reason: 'Needs identities we manage.',
  },
  {
    id: 'verified-statements',
    label: 'Verifiable trading record',
    tier: 'enterprise',
    outcome: 'Give a lender or a buyer a record of your trading they can check has not been edited.',
    reason: 'The proof is only worth anything if someone independent holds it.',
  },
]

export function capability(id: string): Capability {
  const found = capabilities.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Unknown capability ${id}.`)
  return found
}

export function capabilitiesForTier(tier: CapabilityTier): readonly Capability[] {
  const reach = capabilityTierOrder.indexOf(tier)
  if (reach < 0) throw new Error(`Unknown tier ${tier}.`)
  return capabilities.filter((candidate) => capabilityTierOrder.indexOf(candidate.tier) <= reach)
}

export function isCapabilityAvailable(id: string, tier: CapabilityTier) {
  return capabilityTierOrder.indexOf(capability(id).tier) <= capabilityTierOrder.indexOf(tier)
}

/**
 * What a device is entitled to right now.
 *
 * Deliberately conservative and deliberately dumb: no account means free, and nothing about this
 * decision is stored on the device where it could be edited. A locked capability must still SHOW
 * what it would do -- see lockedCapabilityNotice -- because hiding it entirely leaves the owner
 * unable to tell the difference between "not for you" and "broken".
 */
export function currentCapabilityTier(input: { managedIdentity?: unknown; premiumUnlocked?: boolean }): CapabilityTier {
  if (input.managedIdentity) return 'enterprise'
  if (input.premiumUnlocked) return 'premium'
  return 'free'
}

/**
 * The words an owner sees when they reach something their tier does not include. Never "upgrade",
 * never a price, never a countdown -- an honest description and a way to start a conversation.
 */
export function lockedCapabilityNotice(id: string) {
  const found = capability(id)
  return {
    label: found.label,
    outcome: found.outcome,
    reason: found.reason,
    action: 'Talk to us about this',
  }
}
