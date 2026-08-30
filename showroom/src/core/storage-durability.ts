// Durable-storage lane for whatever this browser is the only copy of.
//
// A local (signed-out) Shop keeps every record in this browser: the workspace itself in
// localStorage (COMMERCE_KEY) and the crash-recovery outbox in IndexedDB. Both live in
// "best-effort" storage by default, which the browser is allowed to evict without asking
// and without warning when the device runs low on space. For a shop whose only copy of
// today's takings is on one tablet, that is silent data loss.
//
// A signed-in company account is NOT exempt, which is why the request is unconditional
// (workspace-runtime.ts, useCommerceWorkspace). Signing in moves the workspace ledger
// server-side, but product photos and payment-QR blobs (product-image-store.ts /
// payment-qr-store.ts -- both deliberately excluded from company backups), the unfinished
// order draft (commerce-order-draft.ts) and loyalty settings (shop-loyalty.ts) all stay on
// the device under a `managed:<workspaceId>` scope with no server copy behind them.
// Eviction destroys those for a managed workspace just as permanently as for a local one.
// The warning BANNER is still local-only (CoreApp.tsx) -- that is a separate judgement
// about which failure is worth interrupting a till for, not a claim that a company
// account keeps nothing here.
//
// navigator.storage.persist() asks the browser to move this origin to "persistent"
// storage, which is exempt from that automatic eviction. It is a request, not a
// guarantee -- Chrome grants it from an engagement heuristic, Firefox may prompt, and
// several browsers do not implement it at all -- so the answer is recorded and surfaced
// to the owner rather than assumed.
//
// Degradation is fail-open at every rail, because a storage-durability probe must never
// be the reason the till does not open:
//  - API absent (older Safari, some embedded webviews): state 'unsupported', no warning
//    banner beyond the honest "could not be confirmed" wording, nothing thrown.
//  - persist() rejects or throws: swallowed, state 'unsupported'.
//  - persist() resolves false: state 'denied' -- this is the case the owner must see.
//  - Already persisted from a previous session: persisted() short-circuits so a repeat
//    visit never re-prompts.
//
// The request is fired once per page session (requestPromise memoises it) even though
// useCommerceWorkspace mounts on several surfaces, and it is only ever called from an
// effect, never from render, so it cannot block first paint.

export type StorageDurabilityState = 'checking' | 'persisted' | 'denied' | 'unsupported'

export type StorageDurabilityStatus = {
  state: StorageDurabilityState
  // The literal boolean navigator.storage.persist() (or persisted()) returned, recorded
  // so a reviewer or a diagnostics surface can read the browser's actual answer rather
  // than an interpretation of it. False whenever the API is absent or failed.
  granted: boolean
  // Set once a QuotaExceededError has been observed this session. Independent of the
  // persist() answer: a persisted origin can still run out of quota.
  quotaExceeded: boolean
}

const initialStatus: StorageDurabilityStatus = { state: 'checking', granted: false, quotaExceeded: false }

let snapshot: StorageDurabilityStatus = initialStatus
const listeners = new Set<() => void>()

// useSyncExternalStore compares snapshots by identity, so the cached object is replaced
// only when a field actually changes. Returning a fresh object every read would spin.
function publish(next: StorageDurabilityStatus) {
  if (snapshot.state === next.state
    && snapshot.granted === next.granted
    && snapshot.quotaExceeded === next.quotaExceeded) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function subscribeStorageDurability(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getStorageDurability(): StorageDurabilityStatus {
  return snapshot
}

// Called from the client error lane when a QuotaExceededError is classified. Idempotent:
// the first quota failure is the signal, and repeats must not re-render the banner.
export function noteStorageQuotaExceeded(): void {
  publish({ ...snapshot, quotaExceeded: true })
}

let requestPromise: Promise<StorageDurabilityStatus> | null = null

async function probe(): Promise<StorageDurabilityStatus> {
  let manager: StorageManager | undefined
  try { manager = globalThis.navigator?.storage } catch { manager = undefined }
  if (!manager || typeof manager.persist !== 'function') {
    return { ...snapshot, state: 'unsupported', granted: false }
  }
  try {
    // A previously granted origin stays granted; asking again would re-prompt on the
    // browsers that prompt, for no new information.
    if (typeof manager.persisted === 'function' && await manager.persisted()) {
      return { ...snapshot, state: 'persisted', granted: true }
    }
    const granted = await manager.persist()
    return { ...snapshot, state: granted ? 'persisted' : 'denied', granted: granted === true }
  } catch {
    // Some webviews expose persist() and then reject it. Indistinguishable from absent
    // for the owner's purposes, and never a reason to fail the Shop.
    return { ...snapshot, state: 'unsupported', granted: false }
  }
}

// Idempotent by memoised promise: safe to call from every Shop mount.
export function requestStorageDurability(): Promise<StorageDurabilityStatus> {
  requestPromise ??= probe().then((result) => {
    publish(result)
    return snapshot
  })
  return requestPromise
}

// ---------------------------------------------------------------------------
// Workspace headroom -- how much room is left before the till stops selling.
//
// A local Shop keeps its whole commerce workspace in one localStorage document, and TWO
// independent ceilings bound it. Neither is checked anywhere the owner can see, so today
// both arrive mid-trading with no warning at all.
//
//  1. BYTES. commerce-sync-outbox.ts's COMMERCE_SYNC_MAX_STATE_BYTES (2 MiB) is weighed
//     against the ENTIRE candidate workspace, not against one change: staging serializes
//     the whole CommerceState and refuses it if it is over. Because staging runs before
//     the local write, the ceiling gates every write, not just large ones.
//  2. INVENTORY COMMANDS. commerce-workspace.ts refuses any workspace whose location-
//     inventory command log exceeds 2,000 entries. A completed sale appends exactly two
//     (order_reserve, order_fulfil) and the entries are digests chained through
//     previousDigest/headDigest, so this log can never be pruned or compacted.
//
// Both numbers are DUPLICATED here rather than imported, and a drift guard in
// tools/storage_durability.test.mjs reads the two enforcing source files and fails if
// either stops agreeing. The duplication is deliberate: commerce-sync-outbox.ts imports
// commerce-workspace.ts, so importing the constant would pull the entire commerce module
// graph into this file -- which the header above exists to keep dependency-free, because a
// storage probe must never be the reason the till does not open. The command ceiling is a
// bare literal inside the validator and cannot be imported at all today, so a guard is
// needed for it regardless; covering both the same way keeps one mechanism, not two.
//
// WHY BOTH MUST BE EVALUATED. For a shop using location stock the two walls sit only 268
// sales apart -- the byte wall at 731 completed sales, the command wall at 999. A gauge
// showing bytes alone would read "70% full" to a shop that is actually much closer to a
// wall it cannot compact its way out of, misleading exactly the shops in most danger. So
// both are measured, and the one the shop will hit FIRST is the one surfaced.

// Measured 2026-08-20 by driving sales through the real transitions (receiveCommerceStock
// -> reserveCommerceOrder -> reconcileCommercePayment -> advanceCommerceOrder x3), not
// estimated from type shapes. Growth was exactly linear: 1,502.0 bytes/sale at every
// 100-sale checkpoint across 400 sales, zero drift. These are the FALLBACK figures, used
// only until a shop has enough of its own history to measure itself.
export const COMMERCE_HEADROOM_BYTE_CEILING = 2 * 1024 * 1024
export const COMMERCE_HEADROOM_COMMAND_CEILING = 2_000
export const COMMERCE_HEADROOM_COMMANDS_PER_SALE = 2
export const COMMERCE_HEADROOM_SEED_BYTES = 9_008
export const COMMERCE_HEADROOM_REFERENCE_BYTES_PER_SALE = 1_502
export const COMMERCE_HEADROOM_REFERENCE_BYTES_PER_SALE_WITH_STOCK = 2_850.8

// Thresholds. Silent below 'tight' -- a shop at 12% must see nothing whatsoever, because a
// meter that talks when there is nothing to do gets ignored at the moment it matters.
//
// 0.70 / 0.90 are the ratios the compaction programme proposed and they are kept, but the
// ESCALATION IS IN TONE, NOT ONLY IN COLOUR. At 70% of the byte wall a plain shop still has
// ~417 sales (about ten trading days at 40 sales/day) and an inventory shop ~219; that is
// early enough that an interrupting alert every day for a fortnight would train the owner
// to dismiss it. So 'tight' renders as a quiet notice and only 'urgent' takes role="alert".
// At 90% a plain shop has ~139 sales left and an inventory shop ~73 -- under two trading
// days -- which is genuinely an interrupt, and the remedy offered (export a backup) takes
// about a minute, so two days is enough room to act.
export const COMMERCE_HEADROOM_TIGHT_RATIO = 0.7
export const COMMERCE_HEADROOM_URGENT_RATIO = 0.9


export type CommerceHeadroomLevel = 'clear' | 'tight' | 'urgent'
export type CommerceHeadroomLimit = 'bytes' | 'inventory-commands'

export type CommerceHeadroom = {
  // 'clear' is the silent state. Callers must render nothing for it.
  level: CommerceHeadroomLevel
  // Which of the two ceilings this shop will actually hit first.
  limit: CommerceHeadroomLimit
  // Sales left against `limit` -- the number the owner is actually shown.
  salesRemaining: number
  // 0..1 against `limit`, the ratio the level was decided from.
  usedRatio: number
  bytes: number
  byteCeiling: number
  byteSalesRemaining: number
  bytesPerSale: number
  // False while the shop has too little history to measure itself and the reference
  // figures above are standing in.
  bytesPerSaleMeasured: boolean
  commands: number
  commandCeiling: number
  // null when the shop does not use location stock, so this ceiling cannot apply.
  commandSalesRemaining: number | null
}

// The minimum of CommerceState this needs. Declared structurally rather than importing
// CommerceState for the dependency reason in the block comment above.
export type CommerceHeadroomSubject = {
  orders?: readonly unknown[]
  inventoryFoundation?: { commands?: readonly unknown[] } | null
}

// Single-slot caches. `lastResult` is keyed on workspace object IDENTITY, which changes
// only when the workspace is mutated -- so every re-render that did not change the
// workspace costs one reference comparison and nothing else.
let lastResult: { subject: object; value: CommerceHeadroom } | null = null

// Test seam only: the caches are module-scoped by design (one workspace per session), so
// a suite covering several fixtures has to be able to clear them between cases.
export function resetCommerceHeadroomCache(): void {
  lastResult = null
}

function weigh(state: CommerceHeadroomSubject): number {
  // Exactly the measure the ceiling check uses at commerce-sync-outbox.ts: serialize the
  // whole candidate workspace and take its UTF-8 byte length.
  return new TextEncoder().encode(JSON.stringify(state)).byteLength
}

/**
 * Weigh a local Shop workspace against both ceilings and report the nearer one.
 *
 * COST, and why it is cached the way it is. Serializing a full workspace measures ~3.9 ms
 * at 1.17 MiB and ~6 ms at the 2 MiB ceiling on a development desktop, so on the cheap
 * Android hardware this is aimed at, several times that. Doing it per render is therefore
 * out of the question, and the cache below is keyed on workspace object IDENTITY:
 *   - Same workspace object as last call -- every re-render that did not change the
 *     workspace, which is the overwhelming majority: one reference comparison, O(1).
 *   - A workspace that actually changed: exactly one serialization.
 *
 * So the cost is one weigh per workspace MUTATION, never per render. That is proportionate
 * rather than new work: the local write path already serializes this same workspace on
 * every mutation to weigh it against the byte ceiling (stageLocalCommerceSyncIntent, which
 * runs BEFORE the localStorage write), so the meter roughly doubles a cost the sale was
 * already paying, instead of introducing a new class of work on the till's hot path.
 *
 * An earlier revision extrapolated the weight from the order count between mutations to
 * avoid even that. It was removed: extrapolation cannot see a jump the order count does
 * not model, so it could report 'clear' for a workspace that had actually crossed into the
 * warning band -- a false silence, which is the one failure this meter exists to prevent.
 * The saving was also in the wrong place, since it only applied while the workspace was
 * small and serializing it was cheapest anyway.
 */
export function measureCommerceHeadroom(state: CommerceHeadroomSubject): CommerceHeadroom {
  if (lastResult && lastResult.subject === (state as object)) return lastResult.value

  const orders = state.orders?.length ?? 0
  const commands = state.inventoryFoundation?.commands?.length ?? 0

  // A shop that uses location stock pays for the command log on top of the order record,
  // so its per-sale byte cost is nearly double. Which reference applies is decided by
  // whether the log exists, not by a guess.
  const referenceBytesPerSale = commands > 0
    ? COMMERCE_HEADROOM_REFERENCE_BYTES_PER_SALE_WITH_STOCK
    : COMMERCE_HEADROOM_REFERENCE_BYTES_PER_SALE

  const bytes = weigh(state)

  // The shop's OWN cost per sale, once it has enough history for the figure to mean
  // anything. Below 20 orders the catalog and seed dominate and the division is noise, and
  // the clamp keeps an unusual workspace (a huge catalog, a handful of sales) from
  // producing a nonsense figure. Overstating the cost is the safe direction -- it reports
  // FEWER sales remaining -- and by the time anything is displayed the shop has hundreds of
  // orders, so the derived figure is well conditioned wherever it is actually used.
  const derived = orders >= 20 ? (bytes - COMMERCE_HEADROOM_SEED_BYTES) / orders : Number.NaN
  const bytesPerSaleMeasured = Number.isFinite(derived) && derived >= 200 && derived <= 20_000
  const bytesPerSale = bytesPerSaleMeasured ? derived : referenceBytesPerSale

  const byteSalesRemaining = Math.max(0, Math.floor((COMMERCE_HEADROOM_BYTE_CEILING - bytes) / bytesPerSale))
  const commandSalesRemaining = commands > 0
    ? Math.max(0, Math.floor((COMMERCE_HEADROOM_COMMAND_CEILING - commands) / COMMERCE_HEADROOM_COMMANDS_PER_SALE))
    : null

  // Which wall comes first, in the only unit the owner experiences: sales. Ties go to
  // bytes, which is the ceiling that binds first for every shop measured so far.
  const commandBinds = commandSalesRemaining !== null && commandSalesRemaining < byteSalesRemaining
  const limit: CommerceHeadroomLimit = commandBinds ? 'inventory-commands' : 'bytes'
  const salesRemaining = commandBinds ? (commandSalesRemaining as number) : byteSalesRemaining
  const usedRatio = commandBinds
    ? commands / COMMERCE_HEADROOM_COMMAND_CEILING
    : bytes / COMMERCE_HEADROOM_BYTE_CEILING

  const level: CommerceHeadroomLevel = usedRatio >= COMMERCE_HEADROOM_URGENT_RATIO
    ? 'urgent'
    : usedRatio >= COMMERCE_HEADROOM_TIGHT_RATIO ? 'tight' : 'clear'

  const value: CommerceHeadroom = {
    level,
    limit,
    salesRemaining,
    usedRatio,
    bytes,
    byteCeiling: COMMERCE_HEADROOM_BYTE_CEILING,
    byteSalesRemaining,
    bytesPerSale,
    bytesPerSaleMeasured,
    commands,
    commandCeiling: COMMERCE_HEADROOM_COMMAND_CEILING,
    commandSalesRemaining,
  }
  lastResult = { subject: state as object, value }
  return value
}
