import assert from 'node:assert/strict'
import test from 'node:test'

// The module memoises its persist() request at module scope, which is the behaviour
// under test in "asks once". Each case therefore imports a fresh instance through a
// distinct query string so one case's memo cannot leak into the next.
let instanceCounter = 0
async function freshModule() {
  instanceCounter += 1
  return import(`../showroom/src/core/storage-durability.ts?case=${instanceCounter}`)
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
}

// navigator.storage shaped just enough for the probe, with call counting.
function fakeNavigator(storage) {
  return { storage }
}

test('records the granted boolean when the browser persists the origin', async () => {
  const restore = replaceGlobal('navigator', fakeNavigator({
    persisted: async () => false,
    persist: async () => true,
  }))
  try {
    const durability = await freshModule()
    const status = await durability.requestStorageDurability()
    assert.equal(status.state, 'persisted')
    assert.equal(status.granted, true)
    assert.equal(durability.getStorageDurability().granted, true)
  } finally {
    restore()
  }
})

test('records a denial so the owner can be warned', async () => {
  const restore = replaceGlobal('navigator', fakeNavigator({
    persisted: async () => false,
    persist: async () => false,
  }))
  try {
    const durability = await freshModule()
    const status = await durability.requestStorageDurability()
    assert.equal(status.state, 'denied')
    assert.equal(status.granted, false)
  } finally {
    restore()
  }
})

test('never throws and never grants where the API is absent', async () => {
  const restore = replaceGlobal('navigator', fakeNavigator(undefined))
  try {
    const durability = await freshModule()
    const status = await durability.requestStorageDurability()
    assert.equal(status.state, 'unsupported')
    assert.equal(status.granted, false)
  } finally {
    restore()
  }
})

test('never throws when persist() itself rejects', async () => {
  const restore = replaceGlobal('navigator', fakeNavigator({
    persisted: async () => false,
    persist: async () => { throw new Error('persist blew up in this webview') },
  }))
  try {
    const durability = await freshModule()
    const status = await durability.requestStorageDurability()
    assert.equal(status.state, 'unsupported')
    assert.equal(status.granted, false)
  } finally {
    restore()
  }
})

test('an already persisted origin is never asked again', async () => {
  let persistCalls = 0
  const restore = replaceGlobal('navigator', fakeNavigator({
    persisted: async () => true,
    persist: async () => { persistCalls += 1; return true },
  }))
  try {
    const durability = await freshModule()
    const status = await durability.requestStorageDurability()
    assert.equal(status.state, 'persisted')
    assert.equal(status.granted, true)
    assert.equal(persistCalls, 0, 'a granted origin must not be re-prompted')
  } finally {
    restore()
  }
})

test('asks the browser once however many Shop surfaces mount', async () => {
  let persistCalls = 0
  const restore = replaceGlobal('navigator', fakeNavigator({
    persisted: async () => false,
    persist: async () => { persistCalls += 1; return true },
  }))
  try {
    const durability = await freshModule()
    const results = await Promise.all([
      durability.requestStorageDurability(),
      durability.requestStorageDurability(),
      durability.requestStorageDurability(),
    ])
    assert.equal(persistCalls, 1)
    assert.equal(results[0], results[1])
    assert.equal(results[1], results[2])
  } finally {
    restore()
  }
})

test('quota notice flips the flag, notifies once, and keeps a stable snapshot', async () => {
  const restore = replaceGlobal('navigator', fakeNavigator(undefined))
  try {
    const durability = await freshModule()
    let notifications = 0
    const unsubscribe = durability.subscribeStorageDurability(() => { notifications += 1 })

    assert.equal(durability.getStorageDurability().quotaExceeded, false)
    const before = durability.getStorageDurability()

    durability.noteStorageQuotaExceeded()
    assert.equal(durability.getStorageDurability().quotaExceeded, true)
    assert.equal(notifications, 1)
    assert.notEqual(durability.getStorageDurability(), before)

    // Repeats must not re-render: useSyncExternalStore compares by identity.
    const after = durability.getStorageDurability()
    durability.noteStorageQuotaExceeded()
    assert.equal(notifications, 1)
    assert.equal(durability.getStorageDurability(), after)

    unsubscribe()
  } finally {
    restore()
  }
})

// Teardown has to be tested against a state change that would actually notify. Asserting
// it after the quota flag is already latched proves nothing: publish() short-circuits on
// an unchanged snapshot, so a leaked listener and a released one look identical. This case
// takes a fresh module instance, unsubscribes while quotaExceeded is still false, and then
// makes the one change that does publish -- so a teardown that failed to delete the
// listener is the difference between 0 notifications and 1.
test('unsubscribing releases the listener before the state it would report changes', async () => {
  const restore = replaceGlobal('navigator', fakeNavigator(undefined))
  try {
    const durability = await freshModule()
    let notifications = 0
    const unsubscribe = durability.subscribeStorageDurability(() => { notifications += 1 })

    assert.equal(durability.getStorageDurability().quotaExceeded, false)
    unsubscribe()

    durability.noteStorageQuotaExceeded()
    assert.equal(durability.getStorageDurability().quotaExceeded, true, 'the change must be one that publishes')
    assert.equal(notifications, 0, 'an unsubscribed listener must not be notified')
  } finally {
    restore()
  }
})

test('a quota notice survives a later persist() answer', async () => {
  const restore = replaceGlobal('navigator', fakeNavigator({
    persisted: async () => false,
    persist: async () => true,
  }))
  try {
    const durability = await freshModule()
    durability.noteStorageQuotaExceeded()
    const status = await durability.requestStorageDurability()
    assert.equal(status.state, 'persisted')
    assert.equal(status.granted, true)
    // A persisted origin can still be out of quota; the warning must not be erased.
    assert.equal(status.quotaExceeded, true)
  } finally {
    restore()
  }
})

// ---------------------------------------------------------------------------
// Workspace headroom -- the storage meter that warns a shop before its till goes
// read-only. Same module as the durability probe above, hence the same file: both are
// "what this browser is the only copy of, and whether it is about to stop coping".
//
// The measured figures these lean on (1,502 bytes/sale plain, 2,850.8 with location
// stock, 9,008-byte empty seed) came from driving sales through the real transitions in
// an earlier batch and are treated here as given, not re-derived.

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const CEILING = 2 * 1024 * 1024

// A workspace serializing to EXACTLY `targetBytes`, so a threshold can be probed on the
// byte either side of it rather than approximately. Padding one order's string field adds
// one byte per character to both the JSON text and its UTF-8 encoding, so a single pass
// lands on the target; the assertion below fails loudly if that ever stops being true.
function workspaceOfBytes(targetBytes, { orders = 900, commands = 0, items = 0, closes = 0 } = {}) {
  const state = {
    schema: 'supermega.commerce.workspace.v2',
    items: Array.from({ length: items }, (_, i) => ({ sku: `SM-${i}` })),
    closes: Array.from({ length: closes }, (_, i) => ({ id: `CLS-${i}` })),
    movements: [],
    orders: Array.from({ length: orders }, (_, i) => ({ id: `ORD-${1000 + i}`, status: 'completed', total: 12000, pad: '' })),
  }
  if (commands > 0) {
    state.inventoryFoundation = {
      schema: 'supermega.shop.inventory_foundation.v1',
      revision: commands,
      headDigest: 'a'.repeat(64),
      commands: Array.from({ length: commands }, (_, i) => ({ id: i })),
    }
  }
  const weigh = () => new TextEncoder().encode(JSON.stringify(state)).byteLength
  const need = targetBytes - weigh()
  assert.ok(need >= 0, `fixture floor is already above ${targetBytes} bytes`)
  state.orders[0].pad = 'x'.repeat(need)
  assert.equal(weigh(), targetBytes, 'fixture did not land on its target size')
  return state
}

async function headroomModule() {
  const durability = await freshModule()
  durability.resetCommerceHeadroomCache()
  return durability
}

// --- the two ceilings are real, and still say what this module thinks they say ---------

// The module duplicates both ceilings rather than importing them (importing would drag the
// whole commerce module graph into a file that must stay dependency-free). This is the
// guard that makes the duplication safe: it reads the code that actually ENFORCES each
// ceiling and fails if either stops agreeing. Both are located by string, never by line
// number -- the design document's own line references had already drifted by one.
test('the duplicated byte ceiling still matches the code that enforces it', async () => {
  const durability = await headroomModule()
  const source = await readFile(new URL('../showroom/src/core/commerce-sync-outbox.ts', import.meta.url), 'utf8')
  const declaration = source.match(/export const COMMERCE_SYNC_MAX_STATE_BYTES\s*=\s*([^\n]+)/)
  assert.ok(declaration, 'COMMERCE_SYNC_MAX_STATE_BYTES is no longer declared in commerce-sync-outbox.ts')
  const factors = declaration[1].trim().replace(/\s*(?:as const)?\s*$/, '').split('*').map((part) => Number(part.trim().replace(/_/g, '')))
  assert.ok(factors.every(Number.isFinite), `could not read COMMERCE_SYNC_MAX_STATE_BYTES from ${declaration[1]}`)
  assert.equal(factors.reduce((a, b) => a * b, 1), durability.COMMERCE_HEADROOM_BYTE_CEILING)

  // ...and it is weighed against the WHOLE workspace, not one change. If this check ever
  // starts weighing a delta the meter is measuring the wrong thing entirely.
  assert.match(source, /candidateRaw[\s\S]{0,120}COMMERCE_SYNC_MAX_STATE_BYTES/, 'the byte ceiling no longer weighs the whole candidate state')
})

test('the duplicated inventory command ceiling still matches the validator', async () => {
  const durability = await headroomModule()
  const source = await readFile(new URL('../showroom/src/core/commerce-workspace.ts', import.meta.url), 'utf8')
  const cap = source.match(/inventory\.commands\.length\s*>\s*([\d_]+)/)
  assert.ok(cap, 'the inventory command-log cap is no longer expressed as inventory.commands.length > N')
  assert.equal(Number(cap[1].replace(/_/g, '')), durability.COMMERCE_HEADROOM_COMMAND_CEILING)
})

// --- silence, and when it ends --------------------------------------------------------

test('a shop with room sees nothing at all', async () => {
  const durability = await headroomModule()
  const headroom = durability.measureCommerceHeadroom(workspaceOfBytes(Math.round(CEILING * 0.12)))
  assert.equal(headroom.level, 'clear', 'a shop at 12% must not be warned about anything')
})

test('the tight threshold turns on at 70% and not a byte earlier', async () => {
  const at = Math.ceil(CEILING * 0.7)
  let durability = await headroomModule()
  assert.equal(durability.measureCommerceHeadroom(workspaceOfBytes(at - 1)).level, 'clear')
  durability = await headroomModule()
  assert.equal(durability.measureCommerceHeadroom(workspaceOfBytes(at)).level, 'tight')
})

test('the urgent threshold turns on at 90% and not a byte earlier', async () => {
  const at = Math.ceil(CEILING * 0.9)
  let durability = await headroomModule()
  assert.equal(durability.measureCommerceHeadroom(workspaceOfBytes(at - 1)).level, 'tight')
  durability = await headroomModule()
  assert.equal(durability.measureCommerceHeadroom(workspaceOfBytes(at)).level, 'urgent')
})

// --- BOTH ceilings, which is the whole point ------------------------------------------

// The failure this exists to prevent: a shop using location stock sits comfortably on
// bytes while its unpruneable command log is nearly full. A gauge reading bytes alone
// would tell that shop it has plenty of room, and it is the shop with the LEAST room and
// no remedy -- the log is a hash chain and compaction cannot reclaim one entry of it.
test('the command wall is surfaced even when the byte wall looks comfortable', async () => {
  const durability = await headroomModule()
  const headroom = durability.measureCommerceHeadroom(workspaceOfBytes(Math.round(CEILING * 0.6), { commands: 1_900 }))
  assert.equal(headroom.limit, 'inventory-commands', 'the nearer of the two ceilings was not the one reported')
  assert.equal(headroom.level, 'urgent')
  assert.equal(headroom.salesRemaining, 50, '(2000 - 1900) / 2 commands per sale')
  // The byte reading is still carried, and on its own it would have said nothing.
  assert.ok(headroom.bytes / headroom.byteCeiling < 0.7, 'fixture no longer exercises the misleading case')
})

test('the byte wall is surfaced when it is the one that binds first', async () => {
  const durability = await headroomModule()
  // A stock-using shop early in its command log: bytes bind long before 2,000 commands.
  const headroom = durability.measureCommerceHeadroom(workspaceOfBytes(Math.ceil(CEILING * 0.92), { commands: 400 }))
  assert.equal(headroom.limit, 'bytes')
  assert.equal(headroom.level, 'urgent')
  assert.ok(headroom.commandSalesRemaining > headroom.salesRemaining, 'the command wall should be the further one here')
})

test('a shop with no location stock is never judged against the command ceiling', async () => {
  const durability = await headroomModule()
  const headroom = durability.measureCommerceHeadroom(workspaceOfBytes(Math.round(CEILING * 0.75)))
  assert.equal(headroom.limit, 'bytes')
  assert.equal(headroom.commandSalesRemaining, null, 'a shop without a command log has no command ceiling to hit')
})

// --- sales, not bytes -----------------------------------------------------------------

test('headroom is reported in sales, derived from this shop own cost per sale', async () => {
  const durability = await headroomModule()
  const bytes = Math.ceil(CEILING * 0.8)
  const headroom = durability.measureCommerceHeadroom(workspaceOfBytes(bytes, { orders: 1_000 }))
  assert.equal(headroom.bytesPerSaleMeasured, true, 'a shop with 1,000 orders can measure its own cost per sale')
  assert.equal(headroom.bytesPerSale, (bytes - durability.COMMERCE_HEADROOM_SEED_BYTES) / 1_000)
  assert.equal(headroom.salesRemaining, Math.floor((CEILING - bytes) / headroom.bytesPerSale))
})

test('a shop too new to measure itself falls back to the measured reference figures', async () => {
  let durability = await headroomModule()
  const plain = durability.measureCommerceHeadroom(workspaceOfBytes(20_000, { orders: 5 }))
  assert.equal(plain.bytesPerSaleMeasured, false)
  assert.equal(plain.bytesPerSale, durability.COMMERCE_HEADROOM_REFERENCE_BYTES_PER_SALE)
  // A shop using location stock costs nearly double per sale, and the fallback knows it.
  durability = await headroomModule()
  const stocked = durability.measureCommerceHeadroom(workspaceOfBytes(20_000, { orders: 5, commands: 10 }))
  assert.equal(stocked.bytesPerSale, durability.COMMERCE_HEADROOM_REFERENCE_BYTES_PER_SALE_WITH_STOCK)
})

// --- what it costs --------------------------------------------------------------------

test('re-measuring an unchanged workspace does not weigh it again', async () => {
  const durability = await headroomModule()
  const state = workspaceOfBytes(Math.round(CEILING * 0.95))
  const first = durability.measureCommerceHeadroom(state)
  const second = durability.measureCommerceHeadroom(state)
  // Same object back, not merely an equal one: proof the cached entry was returned rather
  // than the 2 MiB workspace being serialized a second time for the same render.
  assert.equal(first, second, 'an unchanged workspace was weighed twice')
})

// The cost claim, measured rather than asserted: one weigh per workspace MUTATION and
// none per render. TextEncoder is the last step of weighing, so counting its
// constructions counts serializations of the workspace.
test('an unchanged workspace is never weighed twice, and a changed one is weighed once', async () => {
  const durability = await headroomModule()
  // Both fixtures are built BEFORE the counter is installed: workspaceOfBytes weighs its
  // own output to land on an exact size, and those weighs are not the module's.
  const state = workspaceOfBytes(Math.round(CEILING * 0.95))
  const afterSale = workspaceOfBytes(Math.round(CEILING * 0.95) + 1_502, { orders: 901 })
  const RealTextEncoder = globalThis.TextEncoder
  let weighs = 0
  const restore = replaceGlobal('TextEncoder', class extends RealTextEncoder {
    encode(input) { weighs += 1; return super.encode(input) }
  })
  try {
    durability.measureCommerceHeadroom(state)
    assert.equal(weighs, 1, 'the first reading weighs the workspace once')
    for (let i = 0; i < 20; i += 1) durability.measureCommerceHeadroom(state)
    assert.equal(weighs, 1, 'twenty re-renders of an unchanged workspace must not weigh it again')

    // A real mutation -- a new sale appended -- is weighed, exactly once.
    durability.measureCommerceHeadroom(afterSale)
    durability.measureCommerceHeadroom(afterSale)
    assert.equal(weighs, 2, 'a changed workspace is weighed once, then cached')
  } finally {
    restore()
  }
})

// The property the removed extrapolation could not hold: every reading is a real
// measurement of the workspace in front of it, including one that jumps into the band
// without the order count moving much.
test('a workspace that jumps into the band is seen immediately', async () => {
  const durability = await headroomModule()
  const base = Math.round(CEILING * 0.2)
  assert.equal(durability.measureCommerceHeadroom(workspaceOfBytes(base, { orders: 300 })).level, 'clear')
  const jumped = durability.measureCommerceHeadroom(workspaceOfBytes(Math.ceil(CEILING * 0.95), { orders: 305 }))
  assert.equal(jumped.level, 'urgent', 'a size jump the order count does not explain must still be seen')
})

// --- the local-mode gate --------------------------------------------------------------

// A signed-in company account keeps its ledger server-side and neither local ceiling
// applies to it, so it must never see this meter. The bug this enumerates is real and
// shipped once (af705d42): runtime.status starts at 'checking', which leaves
// useManagedIdentity disabled, which makes managedIdentity null -- so on first mount a
// signed-IN operator is indistinguishable from a local shop to `if (!managedIdentity)`.
//
// The gate is bundled from source rather than reimplemented here, so this is a test of the
// shipping predicate and not of a copy of it.
const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const gateBundle = await build({
  stdin: {
    contents: `export { localShopConfirmed, managedIdentitySettled } from './workspace-runtime.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/headroom-gate-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const { localShopConfirmed, managedIdentitySettled } =
  await import(`data:text/javascript;base64,${Buffer.from(gateBundle.outputFiles[0].contents).toString('base64')}`)

// One render of the real hook: `enabled` is runtime.status === 'enterprise', the identity
// the hook hands back is `enabled ? identity : null`, and settled is derived from both.
function frame(runtimeStatus, probed, identity) {
  const enabled = runtimeStatus === 'enterprise'
  return localShopConfirmed(runtimeStatus, managedIdentitySettled(enabled, probed), enabled ? identity : null)
}

test('a signed-in session never confirms local mode, on any frame of its startup', async () => {
  const account = { workspaceId: 'ws-fictional-lantern-shop' }
  // Frame 1: health has not answered. The identity hook is still disabled, so the identity
  // it reports is null -- exactly what a local shop reports.
  assert.equal(frame('checking', false, account), false, 'health had not answered yet')
  // Frame 2: health says enterprise, the identity probe has NOT come back. This is the
  // frame the shipped bug painted, because useEffect runs after paint.
  assert.equal(frame('enterprise', false, account), false, 'the identity probe had not resolved yet')
  // Frame 3: the probe resolved and there IS an account.
  assert.equal(frame('enterprise', true, account), false, 'a company account must never see the local meter')
})

test('a local shop does confirm local mode, once both answers are in', async () => {
  // Silent while the answer is still unknown -- the meter waits rather than guessing.
  assert.equal(frame('checking', false, null), false, 'nothing may be concluded before health answers')
  // Health answered and it is not an enterprise runtime: there is no identity to wait for.
  assert.equal(frame('local', false, null), true, 'a local shop must reach the meter')
  // An enterprise runtime with nobody signed in is also a local shop, once the probe says so.
  assert.equal(frame('enterprise', false, null), false, 'still waiting on the probe')
  assert.equal(frame('enterprise', true, null), true, 'signed out on an enterprise runtime is a local shop')
})

// ---------------------------------------------------------------------------
// The escape hatch itself -- can the device the meter is warning actually produce
// the backup the meter tells it to produce?
//
// The section above measures how close a Shop is to its own wall and tells the owner
// to "Export a backup from Settings". That advice is only worth giving if the door
// opens. It belongs in this file for the same reason the meter does: both are about
// what this browser is the only copy of, and whether it is about to stop coping.
//
// WHAT WAS MEASURED, AND WHY IT MATTERS. An earlier batch established that a
// commerce-ONLY workspace at 97.7% of the byte ceiling backs up in 29 ms and 2.28 MB,
// and flagged the multi-product case as the one thing it could not close. Driving the
// real transitions on 2026-08-21 closed it, and the answer is that the room is not
// comfortable:
//
//   - Shop is hard-bounded. COMMERCE_SYNC_MAX_STATE_BYTES gates every local write, so a
//     Shop workspace can never exceed 2 MiB -- about 1,190 completed sales at the 1,755
//     bytes/sale a restocking shop actually costs.
//   - Every record is JSON escaped INSIDE a JSON string in the backup envelope, which
//     inflates it by about 1.12x. Shop alone at its ceiling therefore already spends
//     50.3% of the 5 MiB backup file.
//   - Plant has NO byte ceiling anywhere in the codebase and no headroom meter of its
//     own, and costs about 2,085 bytes per job with its shift output records. So the
//     remaining half of the file is spent by roughly 1,200 Plant jobs, and past that the
//     backup refuses.
//
// The tests below therefore do two different jobs. The first two are a squeeze guard:
// they pin that the file still holds a realistic two-product device, and go red if
// either ceiling rises or either per-record cost grows. The rest are about what the
// owner is TOLD when it does not fit, because a silent refusal here is the failure this
// product already found in its sister POS.
//
// Every figure is derived at run time. Nothing below is a number somebody wrote down.

const backupBundle = await build({
  stdin: {
    contents: `
      export {
        collectLocalWorkspaceBackup, describeLocalWorkspaceBackupRefusal,
        localWorkspaceBackupRefusalMessage,
        LOCAL_WORKSPACE_BACKUP_MAX_BYTES, LOCAL_WORKSPACE_BACKUP_MAX_RECORDS,
      } from './local-workspace-backup.ts'
      export { createSeedCommerce, COMMERCE_KEY } from './commerce-workspace.ts'
      export { COMMERCE_SYNC_MAX_STATE_BYTES } from './commerce-sync-outbox.ts'
      export {
        createSeedProduction, registerProductionJob, recordProductionOutput, PRODUCTION_KEY,
      } from './production-workspace.ts'
      export { createInitialWorkspace, WEBSITE_STORAGE_KEY } from '../products/website/website-model.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/backup-headroom-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const {
  collectLocalWorkspaceBackup, describeLocalWorkspaceBackupRefusal,
  localWorkspaceBackupRefusalMessage,
  LOCAL_WORKSPACE_BACKUP_MAX_BYTES, LOCAL_WORKSPACE_BACKUP_MAX_RECORDS,
  createSeedCommerce, COMMERCE_KEY, COMMERCE_SYNC_MAX_STATE_BYTES,
  createSeedProduction, registerProductionJob, recordProductionOutput, PRODUCTION_KEY,
  createInitialWorkspace, WEBSITE_STORAGE_KEY,
} = await import(`data:text/javascript;base64,${Buffer.from(backupBundle.outputFiles[0].contents).toString('base64')}`)

const encodedBytes = (text) => new TextEncoder().encode(text).byteLength
const weighState = (state) => encodedBytes(JSON.stringify(state))

function backupStorage(records) {
  const map = new Map(Object.entries(records))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
}

// A stored record of an EXACT byte size whose content is real serialized workspace text
// repeated, not a run of one character. The distinction is the whole point: what inflates a
// record inside the backup envelope is escaping its quotes and backslashes, so filler with
// no quotes in it would measure a cost no real device pays.
function recordOfBytes(sample, targetBytes) {
  const unit = JSON.stringify(sample)
  const unitBytes = encodedBytes(unit)
  // The repeat count is computed rather than appended in a loop. These fixtures run to
  // several MB, and re-weighing a growing string on every pass took half a minute per case.
  const repeats = Math.max(0, Math.floor(targetBytes / unitBytes) - 1)
  const text = unit.repeat(repeats)
  const padding = targetBytes - encodedBytes(text)
  assert.ok(padding >= 0, 'record filler overshot its target size')
  return text + 'x'.repeat(padding)
}

const backupAt = '2026-08-21T04:00:00.000Z'
function producedBytes(records) {
  const backup = collectLocalWorkspaceBackup(backupStorage(records), backupAt)
  return backup ? encodedBytes(JSON.stringify(backup)) : null
}

// A Plant workspace built by driving the real transitions -- registerProductionJob followed
// by the shift output records a job actually accumulates. Nothing here is shaped by hand.
let plantProofSeq = 0
function plantProof(label, ms) {
  plantProofSeq += 1
  return {
    actionId: `ACT-A5B6${plantProofSeq.toString(16).padStart(4, '0').toUpperCase()}-0000-4000-8000-${plantProofSeq.toString(16).padStart(12, '0').toUpperCase()}`,
    capturedAt: new Date(ms).toISOString(),
    actor: 'U Aung Ko',
    reason: `Backup headroom fixture ${label}`,
    evidenceReference: `BACKUP-HEADROOM-${label}`,
  }
}
const OUTPUT_RECORDS_PER_JOB = 4
function buildPlant(jobCount) {
  let plant = createSeedProduction()
  const dueBase = Date.UTC(2026, 9, 1, 2, 0, 0)
  for (let index = 0; index < jobCount; index += 1) {
    const at = Date.UTC(2026, 8, 1, 2, 0, 0) + index * 600_000
    const id = `JOB-HEADROOM-${index}`
    const registered = registerProductionJob(plant, {
      id,
      line: `Line ${String((index % 6) + 1).padStart(2, '0')}`,
      product: `Batch ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][index % 5]} ${index}`,
      target: 1200,
      output: 0,
      owner: `Line ${String((index % 6) + 1).padStart(2, '0')} lead`,
      priority: ['urgent', 'normal', 'low'][index % 3],
      dueAt: new Date(dueBase + index * 3_600_000).toISOString(),
    }, plantProof(`JOB-${index}`, at))
    assert.ok(registered, `the Plant fixture job ${index} was refused by registerProductionJob`)
    plant = registered
    for (let run = 0; run < OUTPUT_RECORDS_PER_JOB; run += 1) {
      const recorded = recordProductionOutput(plant, id, 50, `SHIFT-${index}-${run}`, plantProof(`OUT-${index}-${run}`, at + (run + 1) * 60_000))
      assert.ok(recorded, `the Plant fixture output ${index}/${run} was refused by recordProductionOutput`)
      plant = recorded
    }
  }
  return plant
}

// The per-job cost, measured at two sizes so the rate is PROVEN linear before it is
// multiplied out to a plant no test could afford to build one job at a time. An earlier
// suite in this programme passed against a hardcoded count that happened to match its
// fixture; a measured rate that is never checked for linearity is the same mistake wearing
// a different hat.
const plantSeedBytes = weighState(createSeedProduction())
const plantRateSmall = (weighState(buildPlant(50)) - plantSeedBytes) / 50
const plantRateLarge = (weighState(buildPlant(100)) - plantSeedBytes) / 100
const PLANT_BYTES_PER_JOB = plantRateLarge

const shopAtCeiling = recordOfBytes(createSeedCommerce(), COMMERCE_SYNC_MAX_STATE_BYTES)
const websiteRecord = JSON.stringify(createInitialWorkspace())

test('the Plant cost per job is linear, so it can be multiplied rather than built', () => {
  assert.equal(encodedBytes(shopAtCeiling), COMMERCE_SYNC_MAX_STATE_BYTES, 'the Shop fixture did not land on the enforced ceiling')
  const drift = Math.abs(plantRateLarge - plantRateSmall) / plantRateSmall
  assert.ok(drift < 0.02, `Plant growth is no longer linear (${plantRateSmall.toFixed(1)} then ${plantRateLarge.toFixed(1)} bytes/job, ${(drift * 100).toFixed(2)}% drift) -- every size below is extrapolated from this rate and would now be wrong`)
})

// --- the squeeze guard ----------------------------------------------------------------

test('a Shop at its enforced ceiling still fits in the backup file, and the cost is the escaping', () => {
  const produced = producedBytes({ [COMMERCE_KEY]: shopAtCeiling })
  assert.ok(produced, 'a Shop at its own enforced write ceiling must be able to produce a backup')
  assert.ok(produced <= LOCAL_WORKSPACE_BACKUP_MAX_BYTES, 'the produced backup exceeded the cap it was checked against')
  // Every record is escaped inside a JSON string, so the file is always bigger than what is
  // stored. The guard is on the RATIO rather than on the byte figure: if escaping ever
  // stopped inflating, the sums below would be measuring something other than a backup.
  const inflation = produced / COMMERCE_SYNC_MAX_STATE_BYTES
  assert.ok(inflation > 1, 'a backup that does not inflate its records is not escaping them')
  assert.ok(inflation < 1.35, `record escaping now costs ${inflation.toFixed(4)}x, far above the ~1.12x measured -- the multi-product budget below was sized against the old figure`)
})

// The failure this exists to prevent: a shop at her own ceiling ALSO running Plant, told by
// the meter to take a backup, finding that she cannot. Shop is bounded and Plant is not, so
// the only thing standing between an owner and that page is that the two together still fit.
// Plant's share is stated as a working profile rather than a number: two jobs a working day
// for a year. If the Shop ceiling rises, or either per-record cost grows, this goes red.
const PLANT_JOBS_PER_WORKING_DAY = 2
const WORKING_DAYS_PER_YEAR = 250
const PLANT_YEAR_OF_JOBS = PLANT_JOBS_PER_WORKING_DAY * WORKING_DAYS_PER_YEAR

test('a Shop at its ceiling running a year of Plant jobs can still be backed up', () => {
  const plantYearBytes = Math.round(plantSeedBytes + PLANT_YEAR_OF_JOBS * PLANT_BYTES_PER_JOB)
  const produced = producedBytes({
    [COMMERCE_KEY]: shopAtCeiling,
    [PRODUCTION_KEY]: recordOfBytes(createSeedProduction(), plantYearBytes),
    [WEBSITE_STORAGE_KEY]: websiteRecord,
  })
  assert.ok(
    produced,
    `a device holding Shop at its ${COMMERCE_SYNC_MAX_STATE_BYTES.toLocaleString()}-byte ceiling plus ${PLANT_YEAR_OF_JOBS} Plant jobs (${plantYearBytes.toLocaleString()} bytes at ${PLANT_BYTES_PER_JOB.toFixed(1)} bytes/job) can no longer produce a backup -- the storage meter tells this owner to export one`,
  )
  assert.ok(
    produced <= LOCAL_WORKSPACE_BACKUP_MAX_BYTES,
    `the two-product backup is ${produced.toLocaleString()} bytes against a ${LOCAL_WORKSPACE_BACKUP_MAX_BYTES.toLocaleString()} cap`,
  )
})

// --- what the owner is told when it does NOT fit ---------------------------------------

// A device over the cap by construction: Shop at its ceiling plus enough Plant to spend the
// rest of the file. The size is derived from the cap, never written down.
function oversizeDevice() {
  return {
    [COMMERCE_KEY]: shopAtCeiling,
    [PRODUCTION_KEY]: recordOfBytes(createSeedProduction(), LOCAL_WORKSPACE_BACKUP_MAX_BYTES),
    [WEBSITE_STORAGE_KEY]: websiteRecord,
  }
}

test('a device that cannot be backed up says which limit it hit, not nothing', () => {
  const records = oversizeDevice()
  assert.equal(producedBytes(records), null, 'the oversize fixture was supposed to be refused')
  const refusal = describeLocalWorkspaceBackupRefusal(backupStorage(records), backupAt)
  assert.ok(refusal, 'a device that cannot produce a backup must be able to say why -- a disabled button is not an answer')
  assert.equal(refusal.reason, 'too_large')
  assert.equal(refusal.maxBytes, LOCAL_WORKSPACE_BACKUP_MAX_BYTES)
  assert.ok(refusal.bytes > refusal.maxBytes, 'the reported size must be the one that failed the check')
  assert.equal(refusal.records, Object.keys(records).length, 'the reported record count must be what the device actually holds')
})

test('the other refusal -- too many records -- is told apart from too many bytes', () => {
  const records = {}
  for (let index = 0; index <= LOCAL_WORKSPACE_BACKUP_MAX_RECORDS; index += 1) {
    records[`supermega.shop.loyalty.v1.managed:workspace-${index}`] = JSON.stringify({ enabled: true, index })
  }
  const refusal = describeLocalWorkspaceBackupRefusal(backupStorage(records), backupAt)
  assert.ok(refusal, 'a device over the record cap must also be able to say why')
  assert.equal(refusal.reason, 'too_many_records', 'a device refused for its record COUNT must not be told its records are too large')
  assert.equal(refusal.maxRecords, LOCAL_WORKSPACE_BACKUP_MAX_RECORDS)
  assert.ok(refusal.bytes < refusal.maxBytes, 'this fixture is tiny -- if it is over on bytes the fixture is wrong, not the code')
})

// The property that makes the sentence trustworthy: the reason shown and the decision made
// come from the same weighing. Swept across sizes straddling the cap rather than probed at
// one, because a refusal that disagrees with the button on ONE size is a refusal that lies.
test('the reason can never disagree with the decision that produced it', () => {
  for (let step = -3; step <= 3; step += 1) {
    const target = Math.round(LOCAL_WORKSPACE_BACKUP_MAX_BYTES - (COMMERCE_SYNC_MAX_STATE_BYTES / 2) + step * 40_000)
    const records = { [PRODUCTION_KEY]: recordOfBytes(createSeedProduction(), target) }
    const produced = producedBytes(records)
    const refusal = describeLocalWorkspaceBackupRefusal(backupStorage(records), backupAt)
    assert.equal(
      produced === null,
      refusal !== null,
      `at ${target.toLocaleString()} stored bytes the backup ${produced === null ? 'refused' : 'succeeded'} but the reason said ${refusal === null ? 'nothing was wrong' : refusal.reason}`,
    )
  }
})

test('the refusal names the cause in the units the storage meter uses, and warns that reset lost its safety net', () => {
  const refusal = describeLocalWorkspaceBackupRefusal(backupStorage(oversizeDevice()), backupAt)
  const message = localWorkspaceBackupRefusalMessage(refusal)
  // The meter renders MB as bytes/1048576 to two places. An owner sent here BY that meter has
  // to be able to hold the two readings side by side, so the refusal must not switch units.
  assert.ok(message.includes(`${(refusal.bytes / 1048576).toFixed(2)} MB`), `the refusal does not state the size in the meter's own MB units: ${message}`)
  assert.ok(message.includes(`${(refusal.maxBytes / 1048576).toFixed(2)} MB`), 'the refusal does not state what a backup file can carry')
  assert.match(message, /Nothing has been lost/, 'the first fear on reading that a backup failed is that the records are already gone')
  assert.match(message, /Download sales archive/, 'a refusal with no remaining action is a dead end')
  assert.match(message, /do not reset this device/, 'reset takes a restore point first, so this owner has no safety net under the destructive control on the same page')

  const countRefusal = { reason: 'too_many_records', bytes: 1_000, maxBytes: LOCAL_WORKSPACE_BACKUP_MAX_BYTES, records: 300, maxRecords: LOCAL_WORKSPACE_BACKUP_MAX_RECORDS }
  const countMessage = localWorkspaceBackupRefusalMessage(countRefusal)
  assert.match(countMessage, /300 separate records/, 'a device refused on its record count must be told about records, not megabytes')
  assert.ok(!countMessage.includes('MB of records'), 'a record-count refusal must not report a size as the cause')
})

// The sentence has to reach the page. Read from the shipping source rather than
// reimplemented, so deleting the render deletes the guard's subject too and this fails.
test('the settings page renders the refusal instead of only a disabled button', async () => {
  const page = await readFile(new URL('../showroom/src/core/WorkspaceControlsPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /localWorkspaceBackupRefusalMessage\(backupRefusal\)/, 'the workspace controls page no longer renders the refusal message')
  assert.match(page, /backupRefusal \?[\s\S]{0,200}role="alert"/, 'the refusal is no longer announced -- the owner was sent to this page by a warning')
  assert.match(page, /describeLocalWorkspaceBackupRefusal/, 'the page no longer asks why the backup was refused')
})
