import type { ManagedCommercePublicRequest } from '../products/ecommerce/managed-commerce-public'
import type { ManagedIdentity } from './managed-trial'

export type ShopPublicInboxRequest = Pick<
  ManagedCommercePublicRequest,
  'handle' | 'requestId' | 'shopRequestId' | 'status' | 'receivedAt'
> & {
  request: Pick<ManagedCommercePublicRequest['request'], 'fulfilment' | 'totalMmk' | 'lines'>
}

export type ShopPublicInboxSyncResult = {
  requests: ShopPublicInboxRequest[]
  claimedRequests: ShopPublicInboxRequest[]
  failedRequestIds: string[]
  alreadyInShopRequests: ShopPublicInboxRequest[]
  nextCursor: string | null
}

export function acquireShopPublicInboxFlight(activeIdentityKeys: Set<string>, identityKey: string): boolean {
  if (activeIdentityKeys.has(identityKey)) return false
  activeIdentityKeys.add(identityKey)
  return true
}

export function releaseShopPublicInboxFlight(activeIdentityKeys: Set<string>, identityKey: string): void {
  activeIdentityKeys.delete(identityKey)
}

export type ShopPublicInboxIdentityState = {
  requestCursors: Map<string, string | undefined>
  seenDuringSweep: Set<string>
}

export function shopPublicInboxIdentityState(
  states: Map<string, ShopPublicInboxIdentityState>,
  identityKey: string,
): ShopPublicInboxIdentityState {
  const existing = states.get(identityKey)
  if (existing) return existing
  const state: ShopPublicInboxIdentityState = {
    requestCursors: new Map(),
    seenDuringSweep: new Set(),
  }
  states.set(identityKey, state)
  return state
}

type ShopPublicInboxApi = {
  loadInbox: (identity: ManagedIdentity, after?: string) => ReturnType<typeof import('../products/ecommerce/managed-commerce-public').loadManagedCommercePublicInbox>
}

export function shopPublicInboxBacklogCursor(
  previousCursor: string | null,
  previousAnchor: string | null,
  firstPageNextCursor: string | null,
  retrying = false,
) {
  if (retrying || !firstPageNextCursor) return null
  // Keep paging older records when the newest-page boundary is unchanged.
  // If new requests moved that boundary, restart immediately after the current
  // first page so records between it and the older saved cursor cannot be lost.
  // A null cursor means the prior sweep finished, so begin the next bounded sweep.
  return previousAnchor === firstPageNextCursor
    ? previousCursor ?? firstPageNextCursor
    : firstPageNextCursor
}

export function shopPublicInboxPrunedRequestIds(
  requests: ReadonlyMap<string, ShopPublicInboxRequest>,
  observedRequestIds: ReadonlySet<string>,
  completeSweep: boolean,
): string[] {
  if (!completeSweep) return []
  return [...requests.keys()].filter((requestId) => !observedRequestIds.has(requestId))
}

export function findShopPublicInboxRequestForReview(
  requestId: string,
  pageRequests: readonly ShopPublicInboxRequest[],
  cachedRequests: readonly ShopPublicInboxRequest[],
): ShopPublicInboxRequest | null {
  return [...pageRequests, ...cachedRequests].find((request) => request.requestId === requestId) ?? null
}

function shopInboxSummary(request: ManagedCommercePublicRequest): ShopPublicInboxRequest {
  return {
    handle: request.handle,
    requestId: request.requestId,
    shopRequestId: request.shopRequestId,
    status: request.status,
    receivedAt: request.receivedAt,
    request: {
      fulfilment: request.request.fulfilment,
      totalMmk: request.request.totalMmk,
      lines: request.request.lines.map(({ sku, name, quantity }) => ({ sku, name, quantity })),
    },
  }
}

/**
 * Read new public orders into Shop's privacy-minimal incoming queue. Polling never
 * claims customer requests or changes Shop state. The operator explicitly claims
 * one request when choosing Review order; contact stays private until then.
 */
export async function syncShopPublicInbox(
  identity: ManagedIdentity,
  api: ShopPublicInboxApi,
  isCurrent: () => boolean = () => true,
  after?: string,
): Promise<ShopPublicInboxSyncResult> {
  const inbox = await api.loadInbox(identity, after)
  if (!isCurrent()) return { requests: [], claimedRequests: [], failedRequestIds: [], alreadyInShopRequests: [], nextCursor: inbox.nextCursor }
  const alreadyInShopRequests: ShopPublicInboxRequest[] = []

  for (const request of inbox.requests) {
    if (request.status === 'in_shop') {
      alreadyInShopRequests.push(shopInboxSummary(request))
    }
  }

  const requests = inbox.requests
    .filter((request) => request.status !== 'in_shop')
    .map(shopInboxSummary)

  return { requests, claimedRequests: [], failedRequestIds: [], alreadyInShopRequests, nextCursor: inbox.nextCursor }
}

export async function claimShopPublicInboxRequest(
  identity: ManagedIdentity,
  request: ShopPublicInboxRequest,
  claimRequest: (identity: ManagedIdentity, handle: string, requestId: string) => ReturnType<typeof import('../products/ecommerce/managed-commerce-public').claimManagedCommercePublicRequest>,
): Promise<ShopPublicInboxRequest | null> {
  if (request.status === 'in_shop') return request
  const result = await claimRequest(identity, request.handle, request.requestId)
  if (result.status !== 'in_shop') return null
  return { ...request, shopRequestId: result.shopRequestId, status: 'in_shop' }
}
