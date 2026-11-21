import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

const { transformSync } = createRequire(resolve('showroom/package.json'))('esbuild')
const source = readFileSync('showroom/src/core/workspace-runtime.ts', 'utf8')
const start = source.indexOf('    if (!managedIdentity) {', source.indexOf('  async function mutate('))
const end = source.indexOf('\n    const workspaceId = managedIdentity.workspaceId', start)
assert.ok(start > 0 && end > start)
const mutation = transformSync(`async function mutate(eventType, commandId, evidence, transition) {\n${source.slice(start, end)}\n}`, { loader: 'ts' }).code

function harness({ settlement = 'local_applied', settlementError = null, latestAfterRace = 'candidate' } = {}) {
  const base = { revision: 1 }
  const candidate = { revision: 2 }
  const later = { revision: 3 }
  const snapshotRef = { current: { state: base, mode: 'local', workspaceId: '', version: null, error: '', writeReady: true } }
  const syncStatusRef = { current: { status: 'ready', message: '' } }
  const statuses = []
  const context = {
    Error,
    managedIdentity: null,
    snapshotRef,
    syncStatusRef,
    ShopReviewRequiredError: class extends Error {},
    validateCommerceState: state => state,
    commerceWorkspaceCanWrite: () => true,
    stageLocalCommerceSyncIntent: async () => ({
      status: 'staged',
      intent: { candidateRaw: JSON.stringify(candidate) },
      receipt: null,
    }),
    mutateCommerceWorkspace: async () => ({
      ok: false,
      error: 'The Commerce state changed or the requested transition is not valid. Nothing was written.',
    }),
    abandonLocalCommerceSyncIntent: async () => {
      if (settlementError) throw settlementError
      return { receipt: { status: settlement }, replayed: true }
    },
    loadCommerceWorkspace: () => ({
      state: latestAfterRace === 'candidate' ? candidate : later,
      error: '',
    }),
    updateSyncStatus: status => { syncStatusRef.current = status; statuses.push(status) },
    setLocalSnapshot: state => { snapshotRef.current = state },
  }
  return { mutate: runInNewContext(`${mutation}\nmutate`, context), snapshotRef, statuses, candidate }
}

test('initiating tab accepts a local_applied receipt produced by concurrent recovery', async () => {
  const subject = harness()
  await subject.mutate('commerce.order.created', 'CMD-RACE-1', {}, () => subject.candidate)
  assert.deepEqual(subject.snapshotRef.current.state, subject.candidate)
  assert.equal(subject.statuses.at(-1).status, 'ready')
  assert.equal(subject.statuses.at(-1).recoveredCount, 1)
  assert.doesNotMatch(subject.statuses.at(-1).message, /Nothing was written/)
})

test('a confirmed applied command followed by newer state is never reported as unwritten', async () => {
  const subject = harness({ latestAfterRace: 'later' })
  await assert.rejects(
    subject.mutate('commerce.order.created', 'CMD-RACE-2', {}, () => subject.candidate),
    /was applied, but the workspace changed again/,
  )
  assert.equal(subject.statuses.at(-1).status, 'conflict')
  assert.doesNotMatch(subject.statuses.at(-1).message, /Nothing was written/)
})

test('failed settlement retains an unknown outcome instead of claiming no write', async () => {
  const subject = harness({ settlementError: new Error('Synthetic receipt interruption') })
  await assert.rejects(
    subject.mutate('commerce.order.created', 'CMD-RACE-3', {}, () => subject.candidate),
    /outcome is not yet known/,
  )
  assert.equal(subject.statuses.at(-1).status, 'pending')
  assert.doesNotMatch(subject.statuses.at(-1).message, /Nothing was written/)
})
