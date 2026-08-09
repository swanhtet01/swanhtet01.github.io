// Contract guard for the local workspace storage registry.
//
// isLocalWorkspaceKey decides which localStorage keys belong to a workspace, and it drives
// BOTH halves of the lifecycle: what a backup captures, and what "clear this workspace"
// removes (local-workspace-backup.ts:68 iterates the same list and calls removeItem).
//
// So a storage key that is not registered fails twice over. It is missing from every backup,
// and it survives a reset that told the shopkeeper their workspace was cleared. That is
// exactly the defect fixed earlier in this branch, when the in-progress counter sale and the
// remembered operator name were both writing to unregistered keys -- a reset reseeded the
// catalog while the previous basket and the previous person's name survived on top of the
// supposedly clean workspace.
//
// Keeping that list correct is otherwise a manual discipline that only fails silently. This
// scans the source for keys the app actually reads or writes and requires each one to be
// either registered or a documented exclusion.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { isLocalWorkspaceKey, listLocalWorkspaceStorageKeys } from './local-workspace-storage.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/registry-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { isLocalWorkspaceKey, listLocalWorkspaceStorageKeys } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// Keys the app touches that are deliberately NOT workspace-scoped. Each needs a reason,
// because the cost of a wrong entry here is silent: the key stops being backed up and stops
// being cleared, with nothing failing.
const DELIBERATE_EXCLUSIONS = new Map([
  ['supermega.managed.workspace.v1', 'Holds the managed workspace IDENTITY, not workspace content, and has its own lifecycle (forgetWorkspace on sign-out). Registering it would make a local demo reset silently sign the operator out of their enterprise workspace.'],
])

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

// Only literals actually used AS keys: passed to a storage method, or bound to a constant
// whose name says it is a key. A schema or contract string that merely starts with
// "supermega." is not a storage key and must not be swept in.
const discovered = new Map()
for (const path of sourceFiles('showroom/src')) {
  const source = readFileSync(path, 'utf8')
  const patterns = [
    /\.(?:getItem|setItem|removeItem)\(\s*'(supermega\.[^']+)'/g,
    /(?:const|let)\s+\w*(?:STORAGE_KEY|KEY_PREFIX|StorageKey)\w*\s*=\s*'(supermega\.[^']+)'/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (!discovered.has(match[1])) discovered.set(match[1], path)
    }
  }
}

check(discovered.size >= 10, `the scan found storage keys to check, got ${discovered.size}`)

const unregistered = []
for (const [key, path] of discovered) {
  // Prefix constants end in '.' or ':' and are used with a suffix appended.
  const probe = /[.:]$/.test(key) ? `${key}sample-scope` : key
  if (isLocalWorkspaceKey(probe) || DELIBERATE_EXCLUSIONS.has(key)) continue
  unregistered.push(`${key}   (${path})`)
}

check(
  unregistered.length === 0,
  unregistered.length === 0
    ? 'every storage key the app reads or writes is registered or documented'
    : `storage keys that are neither registered nor documented:\n    ${unregistered.join('\n    ')}\n  Add to exactWorkspaceKeys/workspaceKeyPrefixes in local-workspace-storage.ts, or to DELIBERATE_EXCLUSIONS here with the reason.`,
)

// The exclusions list only helps while its entries are real and explained.
for (const [key, reason] of DELIBERATE_EXCLUSIONS) {
  check(discovered.has(key), `excluded key "${key}" is still used somewhere; drop it from the list if it is gone`)
  check(!isLocalWorkspaceKey(key), `excluded key "${key}" is genuinely unregistered -- otherwise the exclusion is stale`)
  check(reason.length > 40, `excluded key "${key}" states why it is excluded`)
}

// --- the registry recognises what it should, and nothing more ----------------
check(isLocalWorkspaceKey('supermega.commerce.workspace.v2'), 'the Shop workspace is registered')
check(isLocalWorkspaceKey('supermega.production.workspace.v2'), 'the Plant workspace is registered')
check(isLocalWorkspaceKey('supermega.website.workspace.v2'), 'the Website workspace is registered')
check(isLocalWorkspaceKey('supermega.shop.counter_draft.v1'), 'the in-progress counter sale is registered')
check(isLocalWorkspaceKey('supermega.last_operator.v1'), 'the remembered operator name is registered')
check(isLocalWorkspaceKey('supermega.shop.order_draft.v1.any-scope'), 'scoped order drafts are registered by prefix')

check(!isLocalWorkspaceKey('unrelated.app.data'), 'an unrelated key is not claimed')
check(!isLocalWorkspaceKey('supermega'), 'a bare prefix is not claimed')
check(!isLocalWorkspaceKey(''), 'an empty key is not claimed')

// --- listing only reports what is present ------------------------------------
const fakeStorage = (keys) => ({ length: keys.length, key: (index) => keys[index] ?? null })
const listed = listLocalWorkspaceStorageKeys(fakeStorage([
  'supermega.commerce.workspace.v2', 'unrelated.app.data', 'supermega.last_operator.v1',
]))
check(listed.length === 2, `listing returns only workspace keys, got ${listed.length}`)
check(!listed.includes('unrelated.app.data'), 'and never a key belonging to another app on the same origin')

console.log(`workspace storage registry contract: ${checks} checks passed (${discovered.size} keys scanned, ${DELIBERATE_EXCLUSIONS.size} documented exclusion)`)
