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
//
// HOW DISCOVERY USED TO WORK, AND WHY IT WAS BLIND.
//
// It read two regexes: a string literal passed straight to getItem/setItem/removeItem, and a
// `const <something>STORAGE_KEY/KEY_PREFIX<something> = 'supermega...'` declaration. Almost
// nothing in showroom/src is written either way. The dominant style is
//
//     const COMMERCE_KEY = 'supermega.commerce.workspace.v2'   // no STORAGE_KEY in the name
//     ...
//     storage.getItem(COMMERCE_KEY)                            // no literal at the call site
//
// which matched NEITHER pattern. Discovery found 11 keys out of the ~40 the registry lists,
// and every key named in the comment above -- supermega.shop.counter_draft.v1,
// supermega.last_operator.v1, supermega.setup.v3, supermega.commerce.workspace.v2 -- was
// invisible to the guard that exists because of them. Bumping any of them to a .v3 in the
// same style would have sailed through.
//
// Discovery is now structural: parse each file, find every call to getItem/setItem/removeItem,
// and resolve the key ARGUMENT back through constants, template literals, concatenations,
// array elements and key-building functions until it reaches string literals. Nothing depends
// on what a constant is called. That takes discovery from 11 keys to 39, and the resolver is
// pinned by a fixture below so it cannot silently narrow again.
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
// The app's own compiler, so the scan sees exactly the syntax tsc accepts rather than a
// hand-rolled approximation of it.
const ts = (await import(pathToFileURL(requireFromShowroom.resolve('typescript')).href)).default

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
  // Everything below this line was invisible until discovery stopped depending on constant
  // names. None of them is workspace content; each says why.
  ['supermega.last-product.v1', 'CoreShell remembers which product the operator last opened so a reload lands where they were. It is navigation state about the person, not data about the business: restoring last Tuesday\'s backup must not also send them back to whichever tab was open when it was taken.'],
  ['supermega.commerce.workspace.v2.write-probe.', 'Prefix of a throwaway key commerceWorkspaceCanWrite writes and removes inside one function to find out whether storage accepts writes at all. It carries the probe value and nothing else, and is deleted on every path including the catch.'],
  ['supermega.production.workspace.v2.write-probe.', 'Prefix of the same write probe on the Plant side of production-workspace.ts. Same lifetime, same absence of content.'],
  ['supermega.website.workspace.v2.probe', 'The Website product\'s equivalent one-shot storage probe: set to "1" and removed on the next line of loadInitialWorkspace. Registering a key that never outlives its own function would put a literal "1" in every backup.'],
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

const STORAGE_METHODS = new Set(['getItem', 'setItem', 'removeItem'])
const MAX_DEPTH = 10

/**
 * Structural discovery. Walks real syntax trees, seeds on the ARGUMENT of every storage call,
 * and resolves that expression back to the string literals it can be built from. What a
 * constant is called never enters into it.
 */
export function discoverLocalStorageKeys(roots) {
  const bindings = new Map()
  const functions = new Map()
  const seeds = []
  const record = (map, name, entry) => {
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(entry)
  }

  const files = roots.flatMap((root) => sourceFiles(root))
  for (const path of files) {
    const file = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const isExported = (node) => {
      const declaring = ts.isVariableDeclaration(node) ? node.parent?.parent : node
      return Boolean(declaring?.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    }
    const collectReturns = (body, name, exported) => {
      const scan = (node) => {
        if (ts.isReturnStatement(node) && node.expression) record(functions, name, { expr: node.expression, path, exported })
        ts.forEachChild(node, scan)
      }
      if (ts.isBlock(body)) ts.forEachChild(body, scan)
      else record(functions, name, { expr: body, path, exported })
    }
    const walk = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const exported = isExported(node)
        record(bindings, node.name.text, { expr: node.initializer, path, exported })
        if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
          collectReturns(node.initializer.body, node.name.text, exported)
        }
      }
      // `for (const storageKey of [KEY, ...LEGACY_KEYS])` binds the name to the elements.
      if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
        for (const declaration of node.initializer.declarations) {
          if (ts.isIdentifier(declaration.name)) record(bindings, declaration.name.text, { expr: node.expression, path, exported: false })
        }
      }
      if (ts.isFunctionDeclaration(node) && node.name && node.body) collectReturns(node.body, node.name.text, isExported(node))
      // A defaulted parameter -- `storage = globalThis.localStorage`, `sessions =
      // globalThis.sessionStorage` -- is the only thing that says which medium an injected
      // store is, so it is bound like any other name.
      if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.initializer) {
        record(bindings, node.name.text, { expr: node.initializer, path, exported: false })
      }
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && STORAGE_METHODS.has(node.expression.name.text)
        && node.arguments.length > 0
      ) {
        seeds.push({ expr: node.arguments[0], receiver: node.expression.expression, path })
      }
      ts.forEachChild(node, walk)
    }
    walk(file)
  }

  // Same-file bindings win. Only EXPORTED names are followed across files, which is how an
  // imported constant is resolved without walking the module graph -- and what stops a local
  // called `storageKey` in one file from being answered by an unrelated `storageKey` in
  // another, which is a real collision in this codebase.
  const candidates = (map, name, path) => {
    const all = map.get(name) ?? []
    const local = all.filter((entry) => entry.path === path)
    return local.length ? local : all.filter((entry) => entry.exported)
  }

  const resolve = (expr, path, depth, seen) => {
    if (!expr || depth > MAX_DEPTH) return []
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)
      || ts.isSatisfiesExpression?.(expr)) {
      return resolve(expr.expression, path, depth + 1, seen)
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text]
    if (ts.isTemplateExpression(expr)) {
      // A key built by interpolation contributes its fixed leading part: either the literal
      // head, or the resolved first expression plus the text that follows it.
      if (expr.head.text) return [expr.head.text]
      const first = expr.templateSpans[0]
      if (!first) return []
      return resolve(first.expression, path, depth + 1, seen).map((head) => head + (first.literal.text ?? ''))
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolve(expr.left, path, depth + 1, seen)
      if (ts.isStringLiteral(expr.right)) return left.map((value) => value + expr.right.text)
      return left
    }
    if (ts.isConditionalExpression(expr)) {
      return [
        ...resolve(expr.whenTrue, path, depth + 1, seen),
        ...resolve(expr.whenFalse, path, depth + 1, seen),
      ]
    }
    if (ts.isArrayLiteralExpression(expr)) {
      return expr.elements.flatMap((element) =>
        resolve(ts.isSpreadElement(element) ? element.expression : element, path, depth + 1, seen))
    }
    if (ts.isIdentifier(expr)) {
      if (seen.has(`id:${expr.text}`)) return []
      seen.add(`id:${expr.text}`)
      return candidates(bindings, expr.text, path)
        .flatMap((entry) => resolve(entry.expr, entry.path, depth + 1, seen))
    }
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
      if (seen.has(`fn:${expr.expression.text}`)) return []
      seen.add(`fn:${expr.expression.text}`)
      return candidates(functions, expr.expression.text, path)
        .flatMap((entry) => resolve(entry.expr, entry.path, depth + 1, seen))
    }
    return []
  }

  // Which medium a call reaches. isLocalWorkspaceKey governs localStorage; a sessionStorage
  // key dies with the tab whether or not a reset runs, so those calls are not this registry's
  // business. Anything that cannot be resolved to sessionStorage is kept -- the default is to
  // look, not to skip.
  const medium = (expr, path, depth, seen) => {
    if (!expr || depth > MAX_DEPTH) return 'unknown'
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) {
      return medium(expr.expression, path, depth + 1, seen)
    }
    if (ts.isPropertyAccessExpression(expr)) {
      if (expr.name.text === 'sessionStorage') return 'session'
      if (expr.name.text === 'localStorage') return 'local'
      return 'unknown'
    }
    if (ts.isIdentifier(expr)) {
      if (expr.text === 'sessionStorage') return 'session'
      if (expr.text === 'localStorage') return 'local'
      if (seen.has(expr.text)) return 'unknown'
      seen.add(expr.text)
      const found = candidates(bindings, expr.text, path).map((entry) => medium(entry.expr, entry.path, depth + 1, seen))
      if (found.length && found.every((value) => value === 'session')) return 'session'
      return found.includes('local') ? 'local' : 'unknown'
    }
    return 'unknown'
  }

  const discovered = new Map()
  for (const seed of seeds) {
    if (medium(seed.receiver, seed.path, 0, new Set()) === 'session') continue
    for (const literal of resolve(seed.expr, seed.path, 0, new Set())) {
      if (!literal.startsWith('supermega.')) continue
      if (!discovered.has(literal)) discovered.set(literal, seed.path)
    }
  }
  return discovered
}

// --- the resolver proves it reads the shapes the app is written in ------------------------
//
// A fixture rather than a claim: every line here is a shape that the old name-based scan
// missed, and the assertions below fail the moment discovery stops following one of them.
const FIXTURE_SOURCE = [
  "const FEATURE_KEY = 'supermega.guard-fixture.workspace.v9'",
  "const SCOPED_PREFIX = 'supermega.guard-fixture.scoped.v9.'",
  "const LEGACY_KEYS = ['supermega.guard-fixture.legacy.v8']",
  "const CONTRACT_ONLY = 'supermega.guard-fixture.contract.v9'",
  'function scopedKey(scope: string) {',
  '  return `${SCOPED_PREFIX}${encodeURIComponent(scope)}`',
  '}',
  'export function readWorkspace(scope: string) {',
  '  const value = window.localStorage.getItem(FEATURE_KEY)',
  '  for (const legacy of LEGACY_KEYS) window.localStorage.removeItem(legacy)',
  '  return value ?? localStorage.getItem(scopedKey(scope))',
  '}',
  'export function readSession() {',
  "  return window.sessionStorage.getItem('supermega.guard-fixture.session.v9')",
  '}',
  'export const contract = CONTRACT_ONLY',
].join('\n')

const fixtureRoot = mkdtempSync(join(tmpdir(), 'supermega-storage-registry-fixture-'))
let fixture
try {
  writeFileSync(join(fixtureRoot, 'fixture.ts'), FIXTURE_SOURCE, 'utf8')
  fixture = discoverLocalStorageKeys([fixtureRoot])
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}

check(
  fixture.has('supermega.guard-fixture.workspace.v9'),
  'a key declared as `const FEATURE_KEY = ...` and passed to getItem by NAME is discovered -- this is the codebase\'s dominant style and the shape a version bump would use',
)
check(
  fixture.has('supermega.guard-fixture.scoped.v9.'),
  'a prefix reached through a key-building function and a template literal is discovered',
)
check(
  fixture.has('supermega.guard-fixture.legacy.v8'),
  'a key reached through an array constant iterated by for..of is discovered',
)
check(
  !fixture.has('supermega.guard-fixture.contract.v9'),
  'a contract/schema string that never reaches a storage call is NOT swept in',
)
check(
  !fixture.has('supermega.guard-fixture.session.v9'),
  'a sessionStorage key is not claimed by the localStorage registry',
)

// --- the real scan ------------------------------------------------------------------------
const discovered = discoverLocalStorageKeys(['showroom/src'])

check(discovered.size >= 35, `the scan found storage keys to check, got ${discovered.size}`)

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

// The keys that motivated this guard, and the ones the old name-based scan could not see.
// Spelled out so a regression in the resolver fails HERE, naming the shape it stopped reading,
// instead of quietly shrinking the scan back to a third of the registry -- which would look
// like a pass, because a scan that finds nothing finds nothing unregistered either.
for (const key of [
  'supermega.commerce.workspace.v2',
  'supermega.production.workspace.v2',
  'supermega.setup.v3',
  'supermega.shop.counter_draft.v1',
  'supermega.shop.batch-profit-control.local-workspace.v1',
  'supermega.last_operator.v1',
  'supermega.trial_signup.v1',
  'supermega.behavior-trail.v1',
  'supermega.product_setups.v1',
]) {
  check(discovered.has(key), `"${key}" is reached by the scan -- it is stored by constant NAME, which is what discovery used to miss`)
}

// The exclusions list only helps while its entries are real and explained.
for (const [key, reason] of DELIBERATE_EXCLUSIONS) {
  check(discovered.has(key), `excluded key "${key}" is still used somewhere; drop it from the list if it is gone`)
  const probe = /[.:]$/.test(key) ? `${key}sample-scope` : key
  check(!isLocalWorkspaceKey(probe), `excluded key "${key}" is genuinely unregistered -- otherwise the exclusion is stale`)
  check(reason.length > 40, `excluded key "${key}" states why it is excluded`)
}

// --- the registry recognises what it should, and nothing more ----------------
check(isLocalWorkspaceKey('supermega.commerce.workspace.v2'), 'the Shop workspace is registered')
check(isLocalWorkspaceKey('supermega.production.workspace.v2'), 'the Plant workspace is registered')
check(isLocalWorkspaceKey('supermega.website.workspace.v2'), 'the Website workspace is registered')
check(isLocalWorkspaceKey('supermega.shop.counter_draft.v1'), 'the in-progress counter sale is registered')
check(isLocalWorkspaceKey('supermega.shop.batch-profit-control.local-workspace.v1'), 'local Batch Profit Control reviews are registered')
check(isLocalWorkspaceKey('supermega.last_operator.v1'), 'the remembered operator name is registered')
check(isLocalWorkspaceKey('supermega.shop.order_draft.v1.any-scope'), 'scoped order drafts are registered by prefix')

check(!isLocalWorkspaceKey('unrelated.app.data'), 'an unrelated key is not claimed')
check(!isLocalWorkspaceKey('supermega'), 'a bare prefix is not claimed')
check(!isLocalWorkspaceKey(''), 'an empty key is not claimed')

// --- listing only reports what is present ------------------------------------
const fakeStorage = (keys) => ({ length: keys.length, key: (index) => keys[index] ?? null })
const listed = listLocalWorkspaceStorageKeys(fakeStorage([
  'supermega.commerce.workspace.v2',
  'supermega.shop.batch-profit-control.local-workspace.v1',
  'unrelated.app.data',
  'supermega.last_operator.v1',
]))
check(listed.length === 3, `listing returns only workspace keys, got ${listed.length}`)
check(listed.includes('supermega.shop.batch-profit-control.local-workspace.v1'), 'listing includes local Batch Profit Control reviews')
check(!listed.includes('unrelated.app.data'), 'and never a key belonging to another app on the same origin')

console.log(`workspace storage registry contract: ${checks} checks passed (${discovered.size} keys scanned, ${DELIBERATE_EXCLUSIONS.size} documented exclusions)`)
