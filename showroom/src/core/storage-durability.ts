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
