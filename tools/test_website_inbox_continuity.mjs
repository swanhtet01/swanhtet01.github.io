// Contract guard for the two ways the Website product used to lose an owner's work silently.
//
// 1. THE UNSAVED PREVIEW. WebsiteProduct holds a not-yet-saved edit in sessionStorage under a
//    per-scope key, `supermega.website.edit-session.v1.<scope>`. The onboarding activation guard
//    looked for the BARE `supermega.website.edit-session.v1` in localStorage -- a different medium
//    and a different key shape -- so it matched a key nothing has ever written and never once
//    fired. An owner who typed page copy and then ran Website onboarding had the workspace swapped
//    underneath them; the preview then failed websiteEditSessionMatches, Save was disabled, and
//    Discard was the only way out. Writer and reader now share websiteEditSessionStorageKey.
//
// 2. THE CAPTURED INQUIRIES. The inbox, the "N new" badge and the export all selected leads with
//    `lead.siteName === workspace.siteName`. Renaming the site -- one field in Navigation -- made
//    every already-captured customer inquiry vanish from all three while still sitting on disk.
//    The same stale comparison guarded workspace replacement, so a renamed site also looked
//    lead-free to onboarding. Inbox membership now follows the ledger that belongs to the
//    workspace; lead.siteName is kept only as the name the customer saw when they wrote in.
//
// Both properties are checked by RUNNING the real modules against storage stubs shaped like the
// browser's, not by reading source alone; the few source checks at the end exist only to stop the
// builder from quietly growing a second, private copy of the edit-session key.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export * from './website-model.ts'
export * from './website-starter.ts'
export * from './website-leads.ts'`,
    resolveDir: 'showroom/src/products/website',
    sourcefile: 'showroom/src/products/website/inbox-continuity-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  activateLocalWebsitePageDrafts,
  activateLocalWebsiteWorkingSample,
  captureWebsiteLead,
  createInitialWorkspace,
  createWebsiteEditSession,
  emptyWebsiteLeadLedger,
  loadWebsiteWorkspace,
  mutateWebsiteWorkspace,
  reviewWebsiteLead,
  updateWebsiteEditSession,
  websiteEditSessionMatches,
  websiteEditSessionStorageKey,
  websiteInboxLeads,
  websiteLeadCounts,
  WEBSITE_EDIT_SESSION_KEY,
  WEBSITE_LEAD_LEDGER_KEY,
  WEBSITE_LOCAL_EDIT_SESSION_SCOPES,
  WEBSITE_STORAGE_KEY,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function makeStorage(entries = []) {
  const values = new Map(entries)
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

let lockTail = Promise.resolve()
const locks = {
  request: async (_name, _options, callback) => {
    const previous = lockTail
    let release
    lockTail = new Promise((resolveLock) => { release = resolveLock })
    await previous
    try { return await callback() } finally { release() }
  },
}

const at = (minute) => `2026-08-11T0${minute}:00:00.000Z`
const sampleInput = (over = {}) => ({
  templateId: 'lead-generation',
  businessName: 'Golden Valley Services',
  capturedAt: at(1),
  ...over,
})

function stageUnsavedEdit(workspace, headline) {
  const staged = updateWebsiteEditSession(createWebsiteEditSession(workspace), (draft) => ({
    ...draft,
    pages: draft.pages.map((page, index) => index === 0
      ? { ...page, hero: { ...page.hero, headline } }
      : page),
  }))
  check(staged.ok && staged.changed, 'the guard could stage a real unsaved edit to work with')
  return staged.session
}

// --- 1. the key the builder writes is the key the guard reads ------------------
check(
  websiteEditSessionStorageKey('browser-local') === `${WEBSITE_EDIT_SESSION_KEY}.browser-local`,
  'the shared key builder scopes the edit-session key with the workspace scope',
)
check(
  websiteEditSessionStorageKey('managed:owner one') === `${WEBSITE_EDIT_SESSION_KEY}.managed%3Aowner%20one`,
  'and percent-encodes the scope so an actor id cannot forge another scope\'s key',
)
check(
  WEBSITE_LOCAL_EDIT_SESSION_SCOPES.includes('browser-local')
    && WEBSITE_LOCAL_EDIT_SESSION_SCOPES.includes('session-only'),
  'both device-local storage modes are declared as scopes a local preview can be held under',
)

// --- 2. onboarding refuses to replace a workspace under an unsaved preview ----
// One pass per scope: whichever storage mode the owner is in, the copy they typed survives.
for (const scope of WEBSITE_LOCAL_EDIT_SESSION_SCOPES) {
  const storage = makeStorage()
  const sessions = makeStorage()
  const saved = loadWebsiteWorkspace(storage)
  const typed = stageUnsavedEdit(saved.workspace, `Unsaved copy typed in ${scope}`)
  sessions.setItem(websiteEditSessionStorageKey(scope), JSON.stringify(typed))

  const before = storage.getItem(WEBSITE_STORAGE_KEY)
  const activated = await activateLocalWebsiteWorkingSample(sampleInput(), storage, locks, sessions)
  check(!activated.ok, `onboarding is refused while an unsaved preview is held in ${scope}`)
  check(
    storage.getItem(WEBSITE_STORAGE_KEY) === before,
    `and the saved workspace bytes are untouched after the refusal in ${scope}`,
  )
  const after = loadWebsiteWorkspace(storage)
  check(
    websiteEditSessionMatches(typed, after.workspace),
    `so the preview still matches its base and Save is still available in ${scope}`,
  )
}

// The same activation must still succeed when there is nothing to protect -- a guard that always
// refuses would pass every check above while leaving onboarding permanently broken.
{
  const storage = makeStorage()
  const activated = await activateLocalWebsiteWorkingSample(sampleInput(), storage, locks, makeStorage())
  check(activated.ok && activated.status === 'installed', 'with no unsaved preview the working sample still installs')
  check(loadWebsiteWorkspace(storage).workspace.siteName === 'Golden Valley Services', 'and the workspace really is the new sample')
}

// Scenario B: onboarding already ran, the owner stages an edit, goes back and corrects the
// business name. The corrected brief must not overwrite the staged edit either.
{
  const storage = makeStorage()
  const sessions = makeStorage()
  const first = await activateLocalWebsiteWorkingSample(sampleInput(), storage, locks, sessions)
  check(first.ok, 'the first onboarding run installs the sample')
  const staged = stageUnsavedEdit(loadWebsiteWorkspace(storage).workspace, 'Owner rewrote the hero')
  sessions.setItem(websiteEditSessionStorageKey('browser-local'), JSON.stringify(staged))

  const before = storage.getItem(WEBSITE_STORAGE_KEY)
  const corrected = await activateLocalWebsiteWorkingSample(
    sampleInput({ businessName: 'Golden Valley Trading Co', capturedAt: at(2) }),
    storage, locks, sessions,
  )
  check(!corrected.ok, 'correcting the business name in onboarding cannot overwrite a staged edit')
  check(storage.getItem(WEBSITE_STORAGE_KEY) === before, 'and the saved workspace is byte-identical afterwards')
  check(websiteEditSessionMatches(staged, loadWebsiteWorkspace(storage).workspace), 'the staged edit is still savable')
}

// An unreadable preview store must refuse rather than read as "no preview held".
{
  const storage = makeStorage()
  const sessions = { getItem: () => { throw new Error('sessionStorage is blocked') } }
  const activated = await activateLocalWebsiteWorkingSample(sampleInput(), storage, locks, sessions)
  check(!activated.ok, 'a preview store that cannot be read is treated as holding a preview, not as empty')
}

// --- 3. renaming the site keeps every captured inquiry ------------------------
const capturedAtName = 'Golden Valley Services'
const renamedTo = 'Golden Valley Trading Co'
let ledger = emptyWebsiteLeadLedger()
for (const [index, request] of [
  'Needs a wholesale quote for 40 bags.',
  'Asks whether delivery reaches Insein township.',
  'Wants the price list for monthly resupply.',
].entries()) {
  ledger = captureWebsiteLead(ledger, {
    siteName: capturedAtName,
    sourcePage: '/contact',
    name: `Customer ${index + 1}`,
    contact: `09 000 000 00${index + 1}`,
    request,
    consentRecorded: true,
  }, { id: `lead-continuity-00${index + 1}`, now: at(3) })
}
ledger = reviewWebsiteLead(ledger, 'lead-continuity-001', { status: 'qualified', owner: 'Sales lead', decisionNote: '' }, at(4))
ledger = reviewWebsiteLead(ledger, 'lead-continuity-002', { status: 'closed', owner: 'Sales lead', decisionNote: 'Chose another supplier.' }, at(4))

check(websiteLeadCounts.length === 1, 'websiteLeadCounts takes the ledger alone -- no display name to go stale')
check(websiteInboxLeads.length === 1, 'websiteInboxLeads takes the ledger alone as well')

const countsAtCapture = websiteLeadCounts(ledger)
check(
  countsAtCapture.total === 3 && countsAtCapture.new === 1 && countsAtCapture.qualified === 1 && countsAtCapture.closed === 1,
  'the three inquiries are counted while the site still carries the name they were captured under',
)

// The rename itself. Nothing in the ledger changes, and nothing in the ledger is allowed to hide.
const renamedWorkspace = { ...createInitialWorkspace(), siteName: renamedTo }
check(
  ledger.leads.every((lead) => lead.siteName !== renamedWorkspace.siteName),
  'every stored inquiry now carries a site name that no longer matches the renamed site',
)
const inboxAfterRename = websiteInboxLeads(ledger)
const countsAfterRename = websiteLeadCounts(ledger)
check(inboxAfterRename.length === 3, 'the inbox still lists all three inquiries after the rename')
check(
  countsAfterRename.total === 3 && countsAfterRename.new === 1 && countsAfterRename.qualified === 1 && countsAfterRename.closed === 1,
  'and the counts that drive the "review new inquiries" next step are unchanged by the rename',
)
check(
  JSON.stringify(inboxAfterRename.map((lead) => lead.id)) === JSON.stringify(ledger.leads.map((lead) => lead.id)),
  'the export payload the owner downloads carries the same inquiries, in the same order',
)
check(
  inboxAfterRename.every((lead) => lead.siteName === capturedAtName),
  'the captured-at name is preserved on each record as the label it always was',
)
check(
  websiteLeadCounts(emptyWebsiteLeadLedger()).total === 0,
  'an empty ledger still counts as empty -- the fix is "do not filter by name", not "always show something"',
)

// --- 4. a stored inquiry pins the workspace, whatever the site is called now ---
// This is what makes ledger-based membership safe: a ledger can never come to hold two businesses,
// because every path that would swap a different business in refuses while inquiries are stored.
{
  const storage = makeStorage()
  const installed = await activateLocalWebsiteWorkingSample(sampleInput(), storage, locks, makeStorage())
  check(installed.ok, 'a working sample is installed on a clean device')
  storage.setItem(WEBSITE_LEAD_LEDGER_KEY, JSON.stringify(ledger))
  const renameSaved = await mutateWebsiteWorkspace(
    (current) => ({ ...current, siteName: renamedTo }),
    installed.workspace.revision, installed.workspace.contentRevision, storage, locks,
  )
  check(renameSaved.ok && renameSaved.workspace.siteName === renamedTo, 'the owner renames the saved site')
  const before = storage.getItem(WEBSITE_STORAGE_KEY)
  const replaced = await activateLocalWebsiteWorkingSample(
    sampleInput({ templateId: 'catalog-showcase', businessName: renamedTo, capturedAt: at(5) }),
    storage, locks, makeStorage(),
  )
  check(!replaced.ok, 'onboarding cannot replace a workspace whose device holds captured inquiries')
  check(storage.getItem(WEBSITE_STORAGE_KEY) === before, 'and the renamed workspace is left byte-identical')
  check(storage.getItem(WEBSITE_LEAD_LEDGER_KEY) === JSON.stringify(ledger), 'the inquiries are left byte-identical too')
}

// An untouched starter is the case the old name comparison waved through: the seed is called
// something else entirely, so no stored lead ever matched it.
{
  const storage = makeStorage([[WEBSITE_LEAD_LEDGER_KEY, JSON.stringify(ledger)]])
  check(
    ledger.leads.every((lead) => lead.siteName !== createInitialWorkspace().siteName),
    'the stored inquiries belong to a site named differently from the untouched starter',
  )
  const activated = await activateLocalWebsiteWorkingSample(sampleInput({ capturedAt: at(6) }), storage, locks, makeStorage())
  check(!activated.ok, 'onboarding over stored inquiries is refused even when no lead name matches the workspace')
  check(storage.getItem(WEBSITE_STORAGE_KEY) === null, 'nothing was written over the untouched starter')
}

// The client-draft import is the other path that swaps a business in. Capturing an inquiry never
// touches the workspace, so the workspace can still look pristine while the device holds real
// customer contact details.
{
  const storage = makeStorage([[WEBSITE_LEAD_LEDGER_KEY, JSON.stringify(ledger)]])
  const imported = await activateLocalWebsitePageDrafts({
    siteName: 'Shwe Client Co',
    pages: [{
      slug: 'home',
      title: 'Home',
      headline: 'Clear help for your customers',
      body: 'Explain the main service and the strongest proof.',
      contactUrl: 'https://example.com/contact',
    }],
    sourceDigest: `sha256:${'b'.repeat(64)}`,
    capturedAt: at(7),
  }, storage, locks)
  check(!imported.ok, 'a client draft import is refused while the device holds another business\'s inquiries')
  check(storage.getItem(WEBSITE_STORAGE_KEY) === null, 'and the workspace is not replaced')
  check(storage.getItem(WEBSITE_LEAD_LEDGER_KEY) === JSON.stringify(ledger), 'and the inquiries are untouched')
}

// A ledger that cannot be read is refused rather than treated as an empty inbox.
for (const corrupt of ['{not json', JSON.stringify({ schema: 'wrong', revision: 0, leads: [] })]) {
  const storage = makeStorage([[WEBSITE_LEAD_LEDGER_KEY, corrupt]])
  const activated = await activateLocalWebsiteWorkingSample(sampleInput({ capturedAt: at(8) }), storage, locks, makeStorage())
  check(!activated.ok, 'an unreadable inquiry ledger blocks replacement instead of reading as empty')
  check(storage.getItem(WEBSITE_STORAGE_KEY) === null, 'and nothing is written while the inbox is unreadable')
}

// --- 5. the builder keeps using the shared key, not a private copy of it ------
const websiteProductSource = await readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'WebsiteProduct.tsx'), 'utf8')
const websiteStarterSource = await readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'website-starter.ts'), 'utf8')

check(
  (websiteProductSource.match(/websiteEditSessionStorageKey\(/g) ?? []).length === 4
    && websiteProductSource.includes('const storageKey = websiteEditSessionStorageKey(editSessionScope)')
    && websiteProductSource.includes('sessionStorage.setItem(websiteEditSessionStorageKey(next.scope)')
    && websiteProductSource.includes('sessionStorage.removeItem(websiteEditSessionStorageKey(target.scope))')
    && websiteProductSource.includes('sessionStorage.removeItem(websiteEditSessionStorageKey(pendingRestoredDraft.scope))'),
  'restore, persist, active-discard and held-draft choice all use the one shared key builder',
)
check(
  !/function\s+editSessionStorageKey/.test(websiteProductSource)
    && !new RegExp(`\\$\\{WEBSITE_EDIT_SESSION_KEY\\}\\.`).test(websiteProductSource),
  'and does not rebuild that key privately, which is how writer and reader drifted apart',
)
check(
  websiteStarterSource.includes('websiteEditSessionStorageKey(scope)')
    && websiteStarterSource.includes('WEBSITE_LOCAL_EDIT_SESSION_SCOPES'),
  'the activation guard reads the scoped key through the same builder',
)
check(
  !/lead\.siteName ===/.test(websiteProductSource) && !/lead\.siteName ===/.test(websiteStarterSource),
  'no inquiry is selected by comparing its captured site name against the current one',
)

console.log(`website inbox continuity contract: ${checks} checks passed`)
