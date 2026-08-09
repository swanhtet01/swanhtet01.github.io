// Contract guard for loadWebsiteWorkspace -- how a returning shopkeeper's site comes back.
//
// Two failure modes matter here and they pull in opposite directions. Accept corrupt data
// and the builder loads a broken site over the top of real work. Reject data that was
// actually fine and the shopkeeper loses their site. The path in between is that unreadable
// storage FAILS CLOSED: it reports the problem, and it does not write anything, so the
// original value survives for export or guided repair.
//
// That "does not write" half is the one worth a test. It is invisible in the return value --
// a load that quietly overwrote the corrupt key would return exactly the same error object.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      loadWebsiteWorkspace, createInitialWorkspace,
      WEBSITE_STORAGE_KEY, LEGACY_WEBSITE_STORAGE_KEY,
    } from './website-model.ts'`,
    resolveDir: 'showroom/src/products/website',
    sourcefile: 'showroom/src/products/website/load-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { loadWebsiteWorkspace, createInitialWorkspace, WEBSITE_STORAGE_KEY, LEGACY_WEBSITE_STORAGE_KEY } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// A storage double that RECORDS writes, so "it did not overwrite" can be asserted rather
// than assumed. loadWebsiteWorkspace only takes getItem, so any write would have to come
// through a different route -- this makes that visible either way.
const storageWith = (entries) => {
  const writes = []
  return {
    writes,
    getItem: (key) => (key in entries ? entries[key] : null),
    setItem: (key, value) => { writes.push({ key, value }); entries[key] = value },
    removeItem: (key) => { writes.push({ key, value: null }); delete entries[key] },
  }
}

// --- nothing stored yet ------------------------------------------------------
const emptyStore = storageWith({})
const seeded = loadWebsiteWorkspace(emptyStore)
check(seeded.ok === true, 'an empty device loads successfully')
check(seeded.source === 'seed', 'from the seed')
check(seeded.workspace.pages.length > 0, 'and the seeded workspace has pages')
check(emptyStore.writes.length === 0, 'loading does not write anything on a fresh device')

// --- a valid saved workspace -------------------------------------------------
const saved = createInitialWorkspace()
const validStore = storageWith({ [WEBSITE_STORAGE_KEY]: JSON.stringify(saved) })
const loaded = loadWebsiteWorkspace(validStore)
check(loaded.ok === true, 'a valid saved workspace loads')
check(loaded.source === 'v2', 'and is reported as v2 rather than re-seeded')
check(loaded.workspace.siteName === saved.siteName, 'with its site name intact')
check(loaded.workspace.pages.length === saved.pages.length, 'and all of its pages')
check(validStore.writes.length === 0, 'loading a good workspace writes nothing')

// --- unreadable data fails closed and preserves the original -----------------
for (const [label, stored] of [
  ['malformed JSON', '{not valid json'],
  ['valid JSON that is not a workspace', '{"hello":"world"}'],
  ['a JSON array', '[1,2,3]'],
  ['an empty string', ''],
  ['null literal', 'null'],
]) {
  const store = storageWith({ [WEBSITE_STORAGE_KEY]: stored })
  const result = loadWebsiteWorkspace(store)
  check(result.ok === false, `${label} is refused rather than loaded`)
  check(typeof result.error === 'string' && result.error.length > 0, `${label} comes back with an explanation`)
  check(
    store.writes.length === 0,
    `${label} leaves the stored value UNTOUCHED -- no silent overwrite of unreadable work`,
  )
  check(
    store.getItem(WEBSITE_STORAGE_KEY) === stored,
    `${label} is still readable afterwards, so it can be exported or repaired`,
  )
}

// --- legacy data is migrated, not discarded ----------------------------------
// The v1 key is only consulted when v2 is absent; a present-but-broken v2 must NOT fall
// through to it, or a corrupt save would silently resurrect an older site.
const bothKeys = storageWith({
  [WEBSITE_STORAGE_KEY]: '{broken',
  [LEGACY_WEBSITE_STORAGE_KEY]: JSON.stringify(saved),
})
const shadowed = loadWebsiteWorkspace(bothKeys)
check(
  shadowed.ok === false,
  'a broken v2 save does NOT silently fall back to older v1 data -- it reports the problem',
)

// --- storage itself failing ---------------------------------------------------
const throwingStore = {
  getItem: () => { throw new Error('SecurityError: storage disabled') },
}
const denied = loadWebsiteWorkspace(throwingStore)
check(denied.ok === false, 'storage that throws is reported rather than crashing the builder')
check(
  typeof denied.error === 'string' && denied.error.includes('storage'),
  'and the message names storage as the cause',
)

console.log(`website workspace load contract: ${checks} checks passed`)
