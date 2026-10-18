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

type ShopPublicInboxApi = {
  loadInbox: (identity: ManagedIdentity, after?: string) => ReturnType<typeof import('../products/ecommerce/managed-commerce-public').loadManagedCommercePublicInbox>
  claimRequest: (identity: ManagedIdentity, handle: string, requestId: string) => ReturnType<typeof import('../products/ecommerce/managed-commerce-public').claimManagedCommercePublicRequest>
}

export function shopPublicInboxBacklogCursor(previousCursor: string | null, firstPageNextCursor: string | null, retrying = false) {
  // A completed sweep must not strand new orders beyond the next first page.
  return retrying ? null : previousCursor ?? firstPageNextCursor
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
 * Import new public orders into Shop's pending review queue. Claiming an online
 * request does not confirm a sale, reserve stock, or take payment; a Shop operator
 * still opens and confirms each order. Contact details are deliberately omitted
 * until the operator opens that specific request for review.
 */
export async function syncShopPublicInbox(
  identity: ManagedIdentity,
  attemptedRequestIds: Set<string>,
  api: ShopPublicInboxApi,
  isCurrent: () => boolean = () => true,
  after?: string,
): Promise<ShopPublicInboxSyncResult> {
  const inbox = await api.loadInbox(identity, after)
  const claimedRequestIds = new Set<string>()
  const failedRequestIds: string[] = []
  const alreadyInShopRequests: ShopPublicInboxRequest[] = []

  for (const request of inbox.requests) {
    if (!isCurrent()) break
    if (request.status === 'in_shop') {
      alreadyInShopRequests.push(shopInboxSummary(request))
      continue
    }
    if (attemptedRequestIds.has(request.requestId)) continue

    // Remember the attempt before the request leaves the current turn. The claim
    // endpoint is idempotent; an explicit Retry clears this guard for that request.
    attemptedRequestIds.add(request.requestId)
    try {
      const result = await api.claimRequest(identity, request.handle, request.requestId)
      if (result.status === 'in_shop') claimedRequestIds.add(request.requestId)
      else failedRequestIds.push(request.requestId)
    } catch {
      failedRequestIds.push(request.requestId)
    }
  }

  const claimedRequests = inbox.requests
    .filter((request) => claimedRequestIds.has(request.requestId))
    .map(shopInboxSummary)
    .map((request) => ({ ...request, status: 'in_shop' as const }))
  const requests = inbox.requests
    .filter((request) => request.status !== 'in_shop' && !claimedRequestIds.has(request.requestId))
    .map(shopInboxSummary)

  return { requests, claimedRequests, failedRequestIds, alreadyInShopRequests, nextCursor: inbox.nextCursor }
}
