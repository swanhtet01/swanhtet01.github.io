import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  approveAction,
  createActionDraft,
  executeAction,
  recoverAction,
  rejectAction,
  retryAction,
  workcellActionDraft,
} from './approval-actions.mjs'

function fakeStore() {
  const rows = new Map()
  return {
    rows,
    async createApprovalRecord(row) {
      if (rows.has(row.id)) throw new Error('conflict')
      const next = {
        ...row,
        status: 'draft',
        version: 0,
        attempts: 0,
        created_at: '2026-07-13T00:00:00.000Z',
        updated_at: '2026-07-13T00:00:00.000Z',
      }
      rows.set(row.id, next)
      return structuredClone(next)
    },
    async getApprovalRecord(id) { const row = rows.get(id); return row ? structuredClone(row) : null },
    async listApprovalRecords() { return [...rows.values()].map(structuredClone) },
    async transitionApprovalRecord(id, status, version, patch) {
      const row = rows.get(id)
      if (!row || row.status !== status || Number(row.version) !== Number(version)) return null
      const next = { ...row, ...structuredClone(patch), version: Number(version) + 1 }
      rows.set(id, next)
      return structuredClone(next)
    },
  }
}

const ID = '11111111-1111-4111-8111-111111111111'
const DRAFT = {
  clientId: 'workcell-acme',
  actionType: 'clickup.create_task',
  title: 'Call the buyer',
  payload: { list_id: '123456', name: 'Call the buyer', markdown_content: 'Deal 42 is due.' },
  source: { kind: 'workcell', workcell: 'pipeline-control', local_date: '2026-07-13', evidence: 'Deal 42' },
}

async function draftedAndApproved(store) {
  const drafted = await createActionDraft(DRAFT, { store, id: ID })
  assert.equal(drafted.ok, true)
  const approved = await approveAction({ id: ID, payloadHash: drafted.approval.payloadHash, actor: 'Swan' }, { store, now: new Date('2026-07-13T01:00:00Z') })
  assert.equal(approved.ok, true)
  return approved.approval
}

test('draft freezes one allowed payload and rejects general write types', async () => {
  const store = fakeStore()
  const result = await createActionDraft(DRAFT, { store, id: ID })
  assert.equal(result.ok, true)
  assert.equal(result.approval.status, 'draft')
  assert.equal(result.approval.version, 0)
  assert.equal(result.approval.payload.marker, `supermega-action:${ID}`)
  assert.match(result.approval.payloadHash, /^[a-f0-9]{64}$/)
  assert.equal((await createActionDraft({ ...DRAFT, actionType: 'clickup.delete_task' }, { store, id: '22222222-2222-4222-8222-222222222222' })).reason, 'approval_action_type_not_allowed')
})

test('draft preserves safe markdown line breaks in the owner-reviewed payload', async () => {
  const store = fakeStore()
  const result = await createActionDraft({
    ...DRAFT,
    payload: { ...DRAFT.payload, markdown_content: 'Evidence:\r\n- Buyer replied\t today\n- Budget confirmed' },
  }, { store, id: ID })
  assert.equal(result.approval.payload.markdown_content, 'Evidence:\n- Buyer replied today\n- Budget confirmed')
})

test('approval is hash-bound and compare-and-swap allows one winner', async () => {
  const store = fakeStore()
  const drafted = await createActionDraft(DRAFT, { store, id: ID })
  assert.equal((await approveAction({ id: ID, payloadHash: 'wrong', actor: 'Swan' }, { store })).reason, 'approval_payload_hash_mismatch')
  const [first, second] = await Promise.all([
    approveAction({ id: ID, payloadHash: drafted.approval.payloadHash, actor: 'Swan' }, { store }),
    approveAction({ id: ID, payloadHash: drafted.approval.payloadHash, actor: 'Swan' }, { store }),
  ])
  assert.equal([first, second].filter((item) => item.ok).length, 1)
  assert.equal((await store.getApprovalRecord(ID)).status, 'approved')
})

test('stored payload corruption invalidates the fingerprint before approval or execution', async () => {
  const store = fakeStore()
  const drafted = await createActionDraft(DRAFT, { store, id: ID })
  store.rows.get(ID).payload.name = 'Changed after review'
  const corruptedDraft = await approveAction({ id: ID, payloadHash: drafted.approval.payloadHash, actor: 'Swan' }, { store })
  assert.equal(corruptedDraft.reason, 'approval_payload_integrity_failed')

  const cleanStore = fakeStore()
  const approved = await draftedAndApproved(cleanStore)
  cleanStore.rows.get(ID).payload.list_id = '999999'
  const corruptedApproved = await executeAction({ id: ID, payloadHash: approved.payloadHash }, {
    store: cleanStore,
    execute: async () => { throw new Error('must not execute') },
  })
  assert.equal(corruptedApproved.reason, 'approval_payload_integrity_failed')
  assert.equal((await cleanStore.getApprovalRecord(ID)).status, 'approved')
})

test('approved task executes once and a second request cannot create again', async () => {
  const store = fakeStore()
  const approved = await draftedAndApproved(store)
  let creates = 0
  const options = {
    store,
    now: new Date('2026-07-13T01:01:00Z'),
    afterExecuteNow: new Date('2026-07-13T01:01:01Z'),
    findTaskByMarker: async () => ({ ok: true, found: false, task: null, pagesRead: 1 }),
    createTask: async (payload) => { creates += 1; assert.equal(payload.marker, `supermega-action:${ID}`); return { ok: true, task: { id: 'cu-1', name: payload.name, url: 'https://app.clickup.com/t/cu-1' } } },
  }
  const executed = await executeAction({ id: ID, payloadHash: approved.payloadHash }, options)
  assert.equal(executed.ok, true)
  assert.equal(executed.approval.status, 'succeeded')
  assert.equal(executed.approval.providerRef, 'cu-1')
  assert.equal(creates, 1)
  assert.equal((await executeAction({ id: ID, payloadHash: approved.payloadHash }, options)).reason, 'approval_not_approved')
  assert.equal(creates, 1)
})

test('dedupe marker recovers a provider success before creating', async () => {
  const store = fakeStore()
  const approved = await draftedAndApproved(store)
  let creates = 0
  const result = await executeAction({ id: ID, payloadHash: approved.payloadHash }, {
    store,
    findTaskByMarker: async () => ({ ok: true, found: true, task: { id: 'existing', name: 'Call buyer', url: '' } }),
    createTask: async () => { creates += 1 },
  })
  assert.equal(result.ok, true)
  assert.equal(result.approval.result.recovered, true)
  assert.equal(creates, 0)
})

test('uncertain execution stays leased; recovery either finds it or safely rearms it', async () => {
  const store = fakeStore()
  const approved = await draftedAndApproved(store)
  const started = await executeAction({ id: ID, payloadHash: approved.payloadHash }, {
    store,
    now: new Date('2026-07-13T01:00:00Z'),
    execute: async () => ({ ok: false, uncertain: true, reason: 'transport_lost' }),
  })
  assert.equal(started.reason, 'approval_execution_uncertain')
  assert.equal((await store.getApprovalRecord(ID)).status, 'executing')
  assert.equal((await store.getApprovalRecord(ID)).last_error, 'transport_lost')
  assert.equal((await recoverAction({ id: ID }, { store, now: new Date('2026-07-13T01:01:00Z') })).reason, 'approval_execution_lease_active')

  const recovered = await recoverAction({ id: ID }, {
    store,
    now: new Date('2026-07-13T01:03:00Z'),
    findTaskByMarker: async () => ({ ok: true, found: true, task: { id: 'cu-lost-ack', name: 'Call buyer', url: '' } }),
  })
  assert.equal(recovered.ok, true)
  assert.equal(recovered.approval.status, 'succeeded')
  assert.equal(recovered.approval.providerRef, 'cu-lost-ack')
})

test('conclusive recovery miss rearms unchanged payload; failed actions require explicit retry', async () => {
  const store = fakeStore()
  const approved = await draftedAndApproved(store)
  await executeAction({ id: ID, payloadHash: approved.payloadHash }, {
    store,
    now: new Date('2026-07-13T01:00:00Z'),
    execute: async () => ({ ok: false, uncertain: true, reason: 'transport_lost' }),
  })
  const rearmed = await recoverAction({ id: ID }, {
    store,
    now: new Date('2026-07-13T01:03:00Z'),
    findTaskByMarker: async () => ({ ok: true, found: false, task: null, pagesRead: 1 }),
  })
  assert.equal(rearmed.approval.status, 'approved')
  assert.equal(rearmed.approval.payloadHash, approved.payloadHash)

  const failed = await executeAction({ id: ID, payloadHash: approved.payloadHash }, {
    store,
    execute: async () => ({ ok: false, retryable: false, reason: 'provider_validation_failed' }),
  })
  assert.equal(failed.approval.status, 'failed')
  const retry = await retryAction({ id: ID, payloadHash: approved.payloadHash }, { store })
  assert.equal(retry.approval.status, 'approved')
})

test('reject requires the reviewed hash and workcells only draft ClickUp owner actions', async () => {
  const store = fakeStore()
  const drafted = await createActionDraft(DRAFT, { store, id: ID })
  const rejected = await rejectAction({ id: ID, payloadHash: drafted.approval.payloadHash, actor: 'Swan', reason: 'Not this week' }, { store })
  assert.equal(rejected.approval.status, 'rejected')
  assert.equal(rejected.approval.lastError, 'Not this week')

  const proposal = workcellActionDraft({
    ok: true,
    slug: 'owner-command',
    name: 'Owner Command',
    localDate: '2026-07-13',
    output: {
      headline: 'Deal 42 is late',
      owner_action: 'Assign the rollout owner',
      priorities: [{ title: 'Rollout', evidence: 'Deal 42 closes tomorrow' }],
    },
  }, { clientId: 'workcell-acme', clickupListId: '123456' })
  assert.equal(proposal.actionType, 'clickup.create_task')
  assert.equal(proposal.payload.name, 'Assign the rollout owner')
  assert.equal(workcellActionDraft({ ok: true, slug: 'cash-close' }, { clientId: 'workcell-acme', clickupListId: '123456' }), null)
})
