import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shopPublicInboxBacklogCursor, shopPublicInboxPrunedRequestIds, syncShopPublicInbox } from '../showroom/src/core/shop-public-inbox-sync.ts'

const identity = { workspaceId: 'workspace-1', userId: 'user-1', email: 'operator@example.com' }

function request(requestId, status = 'new') {
  return {
    handle: 'store-1',
    requestId,
    shopRequestId: `shop-${requestId}`,
    status,
    receivedAt: '2026-10-18T10:00:00.000Z',
    contact: { name: 'Private name', phone: '+95900000000', address: null },
    request: {
      id: requestId,
      customerReference: 'Private name',
      fulfilment: 'pickup',
      totalMmk: 8000,
      lines: [{ sku: 'RICE-1', name: 'Rice 1 kg', quantity: 2 }],
    },
  }
}

test('automatically claims a new public request only into the Shop review queue', async () => {
  const attempts = []
  const result = await syncShopPublicInbox(identity, new Set(), {
    loadInbox: async () => ({ requests: [request('r-1')], nextCursor: null }),
    claimRequest: async (_identity, handle, requestId) => {
      attempts.push([handle, requestId])
      return { status: 'in_shop', shopRequestId: `shop-${requestId}`, priceChanged: false }
    },
  })

  assert.deepEqual(attempts, [['store-1', 'r-1']])
  assert.deepEqual(result.requests, [])
  assert.equal(result.claimedRequests[0].status, 'in_shop')
  assert.equal(result.claimedRequests[0].shopRequestId, 'shop-r-1')
})

test('does not re-claim requests already in Shop and skips a prior failed attempt', async () => {
  const attempts = []
  const priorAttempts = new Set(['r-2'])
  const result = await syncShopPublicInbox(identity, priorAttempts, {
    loadInbox: async () => ({ requests: [request('r-1', 'in_shop'), request('r-2')], nextCursor: null }),
    claimRequest: async (_identity, _handle, requestId) => {
      attempts.push(requestId)
      return { status: 'in_shop', shopRequestId: `shop-${requestId}`, priceChanged: false }
    },
  })

  assert.deepEqual(attempts, [])
  assert.deepEqual(result.claimedRequests, [])
  assert.deepEqual(result.requests.map((item) => item.requestId), ['r-2'])
  assert.deepEqual(result.alreadyInShopRequests.map((item) => item.requestId), ['r-1'])
})

test('keeps a failed request visible and continues processing later requests', async () => {
  const attempts = []
  const result = await syncShopPublicInbox(identity, new Set(), {
    loadInbox: async () => ({ requests: [request('r-1'), request('r-2')], nextCursor: null }),
    claimRequest: async (_identity, _handle, requestId) => {
      attempts.push(requestId)
      if (requestId === 'r-1') throw new Error('temporary failure')
      return { status: 'in_shop', shopRequestId: `shop-${requestId}`, priceChanged: true }
    },
  })

  assert.deepEqual(attempts, ['r-1', 'r-2'])
  assert.deepEqual(result.failedRequestIds, ['r-1'])
  assert.deepEqual(result.requests.map((item) => item.requestId), ['r-1'])
  assert.deepEqual(result.claimedRequests.map((item) => item.requestId), ['r-2'])
})

test('does not retain or return customer contact fields or customer-entered names', async () => {
  const result = await syncShopPublicInbox(identity, new Set(), {
    loadInbox: async () => ({ requests: [request('r-1')], nextCursor: null }),
    claimRequest: async () => { throw new Error('offline') },
  })

  const serialized = JSON.stringify(result.requests[0])
  assert.doesNotMatch(serialized, /contact|Private name|\+95900000000|customerReference/i)
  assert.deepEqual(Object.keys(result.requests[0].request).sort(), ['fulfilment', 'lines', 'totalMmk'])
})

test('stops claiming as soon as the Shop workspace is no longer current', async () => {
  let current = true
  const attempts = []
  const result = await syncShopPublicInbox(identity, new Set(), {
    loadInbox: async () => ({ requests: [request('r-1'), request('r-2')], nextCursor: null }),
    claimRequest: async (_identity, _handle, requestId) => {
      attempts.push(requestId)
      current = false
      return { status: 'in_shop', shopRequestId: `shop-${requestId}`, priceChanged: false }
    },
  }, () => current)

  assert.deepEqual(attempts, ['r-1'])
  assert.deepEqual(result.claimedRequests.map((item) => item.requestId), ['r-1'])
})

test('passes the saved page cursor to the inbox API and returns the next cursor', async () => {
  let observedCursor = null
  const result = await syncShopPublicInbox(identity, new Set(), {
    loadInbox: async (_identity, after) => {
      observedCursor = after
      return { requests: [], nextCursor: 'cursor-page-3' }
    },
    claimRequest: async () => { throw new Error('no request to claim') },
  }, () => true, 'cursor-page-2')

  assert.equal(observedCursor, 'cursor-page-2')
  assert.equal(result.nextCursor, 'cursor-page-3')
})

test('a shifted first-page boundary backfills requests before resuming the older cursor', async () => {
  const loaded = [], claimed = []
  const attempts = new Set()
  const api = {
    loadInbox: async (_identity, after) => {
      loaded.push(after)
      return after === 'current-first-page-boundary'
        ? { requests: [request('request-between-boundaries')], nextCursor: 'saved-older-cursor' }
        : { requests: [request('already-in-shop', 'in_shop')], nextCursor: 'current-first-page-boundary' }
    },
    claimRequest: async (_identity, _handle, requestId) => {
      claimed.push(requestId)
      return { status: 'in_shop', shopRequestId: `shop-${requestId}`, priceChanged: false }
    },
  }
  const first = await syncShopPublicInbox(identity, attempts, api)
  const cursor = shopPublicInboxBacklogCursor(
    'saved-older-cursor', 'previous-first-page-boundary', first.nextCursor)
  const backlog = await syncShopPublicInbox(identity, attempts, api, () => true, cursor)
  assert.deepEqual(loaded, [undefined, 'current-first-page-boundary'])
  assert.deepEqual(claimed, ['request-between-boundaries'])
  assert.equal(backlog.claimedRequests[0].shopRequestId, 'shop-request-between-boundaries')
  assert.equal(shopPublicInboxBacklogCursor('saved-older-cursor', first.nextCursor, first.nextCursor), 'saved-older-cursor')
  assert.equal(shopPublicInboxBacklogCursor(null, first.nextCursor, first.nextCursor), first.nextCursor)
  assert.equal(shopPublicInboxBacklogCursor('unfinished-page', first.nextCursor, first.nextCursor, true), null)
})

test('closed requests disappear only after a complete inbox sweep', () => {
  const displayed = new Map([
    ['still-open', request('still-open')],
    ['closed', request('closed')],
  ])
  const seen = new Set(['still-open'])
  assert.deepEqual(shopPublicInboxPrunedRequestIds(displayed, seen, false), [])
  assert.deepEqual(shopPublicInboxPrunedRequestIds(displayed, seen, true), ['closed'])
})
