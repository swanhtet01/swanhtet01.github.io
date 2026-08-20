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
