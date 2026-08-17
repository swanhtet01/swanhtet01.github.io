// Contract guard for the Website edit session -- the lost-update protection on the builder.
//
// A shopkeeper opens the builder, edits pages for a while, and saves. If the saved website
// changed in between (another tab, another device, a restore), committing the stale draft
// would silently discard whatever happened in between. commitWebsiteEditSession refuses
// instead, and it checks three things rather than one: revision, contentRevision, and a
// content fingerprint that catches edits which do not bump either number.
//
// The second, subtler property is what the commit KEEPS. The session holds a stale copy of
// the workspace's evidence, approvals, local publishes and event log. The commit must take
// those from the CURRENT workspace, not the session -- otherwise saving a page edit silently
// reverts an approval that was recorded while the draft was open.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createInitialWorkspace, createWebsiteEditSession, updateWebsiteEditSession,
      websiteEditSessionMatches, commitWebsiteEditSession, restoreWebsiteEditSession,
      workspaceFingerprint,
    } from './website-model.ts'`,
    resolveDir: 'showroom/src/products/website',
    sourcefile: 'showroom/src/products/website/session-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createInitialWorkspace, createWebsiteEditSession, updateWebsiteEditSession,
  websiteEditSessionMatches, commitWebsiteEditSession, restoreWebsiteEditSession,
  workspaceFingerprint,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(run, label) {
  checks += 1
  assert.throws(run, undefined, label)
}

const saved = createInitialWorkspace()
const renameTo = (name) => (workspace) => ({ ...workspace, siteName: name })

// --- a clean edit and save ---------------------------------------------------
const session = createWebsiteEditSession(saved)
check(websiteEditSessionMatches(session, saved), 'a fresh session matches the workspace it was opened on')

const edited = updateWebsiteEditSession(session, renameTo('Yangon Tyre'))
check(edited.ok && edited.changed, 'renaming the site is a real change')
check(edited.session.workspace.siteName === 'Yangon Tyre', 'the draft carries the new name')
check(saved.siteName !== 'Yangon Tyre', 'and the saved workspace is untouched while the draft is open')

const committed = commitWebsiteEditSession(saved, edited.session)
check(committed.siteName === 'Yangon Tyre', 'committing an unchanged workspace applies the draft')

// A no-op edit reports changed:false rather than inventing a revision.
const unchanged = updateWebsiteEditSession(session, (workspace) => ({ ...workspace }))
check(unchanged.ok && !unchanged.changed, 'an edit that changes nothing is reported as unchanged')

// --- the workspace moving underneath the draft -------------------------------
// This is the case the guard exists for. Each of these is a save that must NOT proceed.
const bumpedRevision = { ...saved, revision: saved.revision + 1 }
check(!websiteEditSessionMatches(edited.session, bumpedRevision), 'a bumped revision no longer matches the session')
rejects(
  () => commitWebsiteEditSession(bumpedRevision, edited.session),
  'committing over a workspace whose revision moved is refused',
)

const bumpedContent = { ...saved, contentRevision: saved.contentRevision + 1 }
rejects(
  () => commitWebsiteEditSession(bumpedContent, edited.session),
  'committing over a workspace whose contentRevision moved is refused',
)

// The fingerprint is the one that matters most: content can change without either counter
// moving, and a revision check alone would wave that through.
const quietlyEdited = { ...saved, siteName: 'Someone Else Renamed It' }
check(
  quietlyEdited.revision === saved.revision && quietlyEdited.contentRevision === saved.contentRevision,
  'this rival edit leaves BOTH revision counters untouched',
)
check(
  workspaceFingerprint(quietlyEdited) !== workspaceFingerprint(saved),
  'but it does change the content fingerprint',
)
rejects(
  () => commitWebsiteEditSession(quietlyEdited, edited.session),
  'so committing over it is refused -- the fingerprint catches what the counters miss',
)

// --- a draft cannot forge revision metadata or release history ---------------
const forgedRevision = updateWebsiteEditSession(session, (workspace) => ({ ...workspace, revision: workspace.revision + 5 }))
check(!forgedRevision.ok, 'a draft that rewrites saved revision metadata is rejected')

const forgedHistory = updateWebsiteEditSession(session, (workspace) => ({ ...workspace, approvals: [{ forged: true }] }))
check(!forgedHistory.ok, 'a draft that stages an approval is rejected -- release actions are not draft edits')

const brokenDraft = updateWebsiteEditSession(session, () => ({ not: 'a workspace' }))
check(!brokenDraft.ok, 'a draft that produces an invalid workspace is rejected rather than thrown')

const throwingUpdate = updateWebsiteEditSession(session, () => { throw new Error('editor blew up') })
check(!throwingUpdate.ok, 'an update function that throws is caught and reported, not propagated')

// --- the commit keeps the CURRENT release history, not the draft's -----------
// Someone records an approval while the draft is open. The draft still holds the old, empty
// approval list. Saving the page edit must not roll that approval back.
const approvedMeanwhile = {
  ...saved,
  approvals: [{ id: 'APR-1', note: 'recorded while the draft was open' }],
  events: [...(saved.events ?? []), { id: 'EVT-1' }],
}
// Release history differing is itself a refusal, which is the stronger protection.
rejects(
  () => commitWebsiteEditSession(approvedMeanwhile, edited.session),
  'a workspace whose release history moved cannot be committed over by a stale draft',
)

// --- restoring a persisted session -------------------------------------------
const restored = restoreWebsiteEditSession(JSON.stringify(edited.session))
check(Boolean(restored), 'a session survives a JSON round trip')
check(restored.baseFingerprint === edited.session.baseFingerprint, 'and keeps the fingerprint it was opened with')
check(restoreWebsiteEditSession('not json') === null, 'a corrupt stored session restores as null rather than throwing')
check(restoreWebsiteEditSession(JSON.stringify({ nope: true })) === null, 'a structurally wrong session restores as null')

console.log(`website edit session contract: ${checks} checks passed`)
