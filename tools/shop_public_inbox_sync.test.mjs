import assert from 'node:assert/strict'
import { test } from 'node:test'

import { acquireShopPublicInboxFlight, claimShopPublicInboxRequest, releaseShopPublicInboxFlight, shopPublicInboxBacklogCursor, shopPublicInboxIdentityState, shopPublicInboxPrunedRequestIds, syncShopPublicInbox } from '../showroom/src/core/shop-public-inbox-sync.ts'

const identity = { workspaceId: 'workspace-1', userId: 'user-1', email: 'operator@example.com' }

test('one slow company inbox does not block a different company inbox', () => {
  const active = new Set()
  assert.equal(acquireShopPublicInboxFlight(active, 'company-a'), true)
  assert.equal(acquireShopPublicInboxFlight(active, 'company-a'), false)
  assert.equal(acquireShopPublicInboxFlight(active, 'company-b'), true)
  releaseShopPublicInboxFlight(active, 'company-a')
  assert.equal(acquireShopPublicInboxFlight(active, 'company-a'), true)
})

test('inbox sweep cursors and seen requests stay isolated by workspace identity', () => {
  const states = new Map()
  const firstAccount = shopPublicInboxIdentityState(states, 'workspace-a:user-a')
  const secondAccount = shopPublicInboxIdentityState(states, 'workspace-b:user-b')

  firstAccount.requestCursors.set('request-a', 'cursor-a')
  firstAccount.seenDuringSweep.add('request-a')
  assert.equal(shopPublicInboxIdentityState(states, 'workspace-a:user-a'), firstAccount)
  assert.deepEqual([...firstAccount.requestCursors], [['request-a', 'cursor-a']])
  assert.deepEqual([...firstAccount.seenDuringSweep], ['request-a'])
  assert.deepEqual([...secondAccount.requestCursors], [])
  assert.deepEqual([...secondAccount.seenDuringSweep], [])
})

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

test('automatically displays new public requests without claiming or changing Shop', async () => {
  let claimCalls = 0
  const result = await syncShopPublicInbox(identity, {
    loadInbox: async () => ({ requests: [request('r-1')], nextCursor: null }),
    claimRequest: async () => { claimCalls += 1; throw new Error('polling must never claim') },
  })

  assert.equal(claimCalls, 0)
  assert.deepEqual(result.requests.map((item) => item.requestId), ['r-1'])
  assert.deepEqual(result.claimedRequests, [])
})

test('claims only the request explicitly selected for review', async () => {
  const attempts = []
  const selected = await syncShopPublicInbox(identity, {
    loadInbox: async () => ({ requests: [request('r-1'), request('r-2')], nextCursor: null }),
  })
  const claimed = await claimShopPublicInboxRequest(identity, selected.requests[1], async (_identity, handle, requestId) => {
    attempts.push([handle, requestId])
    return { status: 'in_shop', shopRequestId: `shop-${requestId}`, priceChanged: false }
  })

  assert.deepEqual(attempts, [['store-1', 'r-2']])
  assert.equal(claimed.status, 'in_shop')
  assert.equal(claimed.shopRequestId, 'shop-r-2')
})

test('does not re-claim a request that is already in Shop', async () => {
  let claimCalls = 0
  const result = await syncShopPublicInbox(identity, {
    loadInbox: async () => ({ requests: [request('r-1', 'in_shop'), request('r-2')], nextCursor: null }),
  })

  const alreadyInShop = result.alreadyInShopRequests[0]
  await claimShopPublicInboxRequest(identity, alreadyInShop, async () => { claimCalls += 1; throw new Error('must not reclaim') })
  assert.equal(claimCalls, 0)
  assert.deepEqual(result.claimedRequests, [])
  assert.deepEqual(result.requests.map((item) => item.requestId), ['r-2'])
  assert.deepEqual(result.alreadyInShopRequests.map((item) => item.requestId), ['r-1'])
})

test('does not retain or return customer contact fields or customer-entered names', async () => {
  const result = await syncShopPublicInbox(identity, {
    loadInbox: async () => ({ requests: [request('r-1')], nextCursor: null }),
  })

  const serialized = JSON.stringify(result.requests[0])
  assert.doesNotMatch(serialized, /contact|Private name|\+95900000000|customerReference/i)
  assert.deepEqual(Object.keys(result.requests[0].request).sort(), ['fulfilment', 'lines', 'totalMmk'])
})

test('does not expose an inbox response after the Shop workspace changes', async () => {
  let current = true
  const result = await syncShopPublicInbox(identity, {
    loadInbox: async () => {
      current = false
      return { requests: [request('r-1'), request('r-2')], nextCursor: null }
    },
    claimRequest: async () => { throw new Error('polling must not claim') },
  }, () => current)

  assert.deepEqual(result.requests, [])
})

test('passes the saved page cursor to the inbox API and returns the next cursor', async () => {
  let observedCursor = null
  const result = await syncShopPublicInbox(identity, {
    loadInbox: async (_identity, after) => {
      observedCursor = after
      return { requests: [], nextCursor: 'cursor-page-3' }
    },
  }, () => true, 'cursor-page-2')

  assert.equal(observedCursor, 'cursor-page-2')
  assert.equal(result.nextCursor, 'cursor-page-3')
})

test('a shifted first-page boundary backfills requests before resuming the older cursor', async () => {
  const loaded = []
  const api = {
    loadInbox: async (_identity, after) => {
      loaded.push(after)
      return after === 'current-first-page-boundary'
        ? { requests: [request('request-between-boundaries')], nextCursor: 'saved-older-cursor' }
        : { requests: [request('already-in-shop', 'in_shop')], nextCursor: 'current-first-page-boundary' }
    },
  }
  const first = await syncShopPublicInbox(identity, api)
  const cursor = shopPublicInboxBacklogCursor(
    'saved-older-cursor', 'previous-first-page-boundary', first.nextCursor)
  const backlog = await syncShopPublicInbox(identity, api, () => true, cursor)
  assert.deepEqual(loaded, [undefined, 'current-first-page-boundary'])
  assert.deepEqual(backlog.requests.map((item) => item.requestId), ['request-between-boundaries'])
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
