#!/usr/bin/env node
// Website edit-and-publish browser journey — ONE deterministic end-to-end run at a
// 390px phone viewport against the BUILT app (showroom/dist), driven over raw CDP.
//
// Why this exists: tools/journey_shop_cash_sale.mjs, tools/journey_plant_shift_release.mjs
// and tools/journey_ecommerce_request_review.mjs are the repo's first three automated
// browser journeys (ENTERPRISE-READINESS-SCORECARD §5). This is the fourth, on the
// product whose output is a FILE rather than an order: a website edited on the phone,
// reviewed by a named person, and retained as an approved, exportable artifact — with
// nothing deployed. It follows docs/demo-playbooks/website.md §2-§3 (guided setup, then
// 'Edit page' → change a headline → Save) and continues through the shipped file
// checklist (showroom/src/products/website/PublishWorkspace.tsx):
//
//   1. /settings/?product=website → business name → 'Create Website and preview it'
//   2. lands on /website/ with the guided working sample provisioned: three ready
//      pages under the typed name, and NO evidence, approval, site file or workflow
//      event — the sample is content only
//   3. 'Edit page' → retype the home headline (an unsaved preview held in
//      sessionStorage; the saved workspace is untouched) → 'Mark page ready' → 'Save'
//      → content revision +1, the working-sample marker no longer matches
//   4. 'Download preview' — where the on-screen device-local flow ends: the preview
//      artifact of the saved content is exported (asserted through the pure exporter
//      on the record; the Blob download itself is denied at the browser level)
//   5. ?view=publish → the file checklist: 'Save review note' ×3 (content,
//      responsive, destinations — each bound to the saved revision's fingerprint) →
//      'Save final review' (named reviewer, explicit confirmation) → 'Create site file'
//      → ONE LocalPublishRecord with the retained WebsiteArtifact
//   6. reload on /website/?view=publish → 'Site file ready' is re-derived from the
//      persisted record, which is byte-identical to what step 5 wrote
//
// Where this journey stops and why: 'Create site file' is the last state-changing
// action the shipped Website offers. What follows on the screen is 'Download site'
// (a Blob download of the retained artifact, which changes no record) and 'Request
// managed hosting' (an external contact link). Nothing deploys from this app — the
// file checklist says so in its own boundary copy — so nothing beyond it is
// simulated here. Exports are asserted on the RECORD: the model's pure exporter
// (website-export.ts) is run twice over the persisted artifact and must produce the
// same, valid HTML.
//
// One workaround, stated plainly. A device-local (browser-local) Website has no
// control that opens the file checklist: 'Prepare file' is rendered for a managed
// company-account workspace only, and the device-local action bar and 'Start here'
// panel end at 'Download preview'. The checklist IS shipped for device-local
// workspaces — the ?view=publish route mounts it (the app keeps that route only
// when every page is saved, ready and passing: canReview) and it renders its own
// 'This device only' boundary and persists real records — but the app's work/preview
// surface toggle, which only the managed 'Prepare file' button flips into 'work',
// leaves it hidden behind the preview. The journey therefore proves the on-screen
// stop first (step 4), then reaches the checklist the way a browser does without a
// reload: an in-app history navigation to ?view=publish (pushState + popstate, which
// the app's router handles as a normal POP) while the editor surface opened by
// 'Edit page' is still active. Every action inside the checklist is a verified
// pointer click on the shipped controls. If the product later opens the checklist
// to device-local workspaces on screen, replace that navigation with the button.
//
// The CLAUDE.md rule this journey pins: a GUIDED Website sample publishes and
// approves nothing. Sample records are identified by actionId prefix (ACT-DEMO-) —
// never by actor string. The journey asserts (a) after onboarding the workspace holds
// no evidence, no approval, no site file and no workflow event at all, the model
// derives no current approval or publish from it, and the device's accountable-action
// ledger carries nothing for Website; and (b) after the operator's work exactly one
// approval and one site file exist, their ids are generated (evidence-/approval-/
// local-snapshot-<hex>), no ACT-DEMO- string appears anywhere in the persisted
// workspace, and the artifact's contentDigest matches the model's own recomputation.
//
// Every assertion is on STATE the app persists (the localStorage Website workspace,
// the sessionStorage edit session, the local metrics) or on rendered text — never on
// pixels. Screenshots are diagnostic output on failure only.
//
// Contract with the environment:
//   - Zero dependencies: Node built-ins + Chromium's DevTools protocol over the
//     built-in WebSocket. The server, browser, CDP client, verified click/type and
//     diagnostics live in tools/journey_lib.mjs, shared with every tools/journey_*.mjs.
//   - The Website model and exporter are imported from showroom/src as TypeScript
//     source through Node's built-in type stripping (Node 22.18+; CI runs 24). They
//     are pure functions of the persisted record — the same code the bundle ran.
//   - Chromium is resolved from --chromium / $CHROMIUM_BIN / /opt/pw-browsers /
//     PATH (google-chrome, chromium, ...). Nothing is downloaded; it never runs
//     `playwright install`.
//   - Every run launches a FRESH temporary browser profile, so there is no service
//     worker, no cache and no localStorage from any earlier run; the journey asserts
//     that emptiness before it starts.
//   - Nothing here seeds a record. The only sample data is what the app's own
//     onboarding provisions. The edit, the review notes, the approval and the site
//     file are made through the real UI, exactly as a website owner would.
//
// Usage:
//   node tools/journey_website_publish.mjs [--chromium /path/to/chrome] [--out-dir DIR]
// Exit 0 with a one-line JSON verdict on success; exit 1 with the failing step, the
// reason, and diagnostics (screenshot path, page text, stored workspace summary).

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  ACCOUNTABLE_ACTIONS_KEY,
  GUIDED_SAMPLE_PREFIX,
  LAST_OPERATOR_KEY,
  LOCAL_METRICS_KEY,
  PRODUCT_SETUPS_KEY,
  SETUP_KEY,
  repoRoot,
  reportFatal,
  runJourney,
} from './journey_lib.mjs'

const CONTRACT = 'supermega.website-publish-journey.v1'
const LABEL = 'WEBSITE PUBLISH JOURNEY'
const BUSINESS_NAME = 'Journey Test Site'
const REVIEWER = 'Journey reviewer'
// 140 characters is the headline field's maxLength (ContentWorkspace.tsx).
const HEADLINE = 'A real headline saved from the phone by the journey.'
// website-model.ts / product-storage-keys.ts: the v2 workspace record, and the scoped
// sessionStorage key an unsaved preview is held under for a device-local workspace.
const WEBSITE_KEY = 'supermega.website.workspace.v2'
const WEBSITE_SCHEMA = 'supermega.website.workspace.v2'
const EDIT_SESSION_KEY = 'supermega.website.edit-session.v1.browser-local'
const LEADS_KEY = 'supermega.website.leads.v1'
// createId(prefix): prefix + '-' + the first 8 hex characters of a random UUID.
const EVIDENCE_ID = /^evidence-[a-f0-9]{8}$/
const APPROVAL_ID = /^approval-[a-f0-9]{8}$/
const SNAPSHOT_ID = /^local-snapshot-[a-f0-9]{8}$/
const FINGERPRINT = /^web-[a-f0-9]{8}$/
const CONTENT_DIGEST = /^site-[a-f0-9]{8}$/
const EVIDENCE_KINDS = ['content', 'responsive', 'links']
const WORKING_SAMPLE_TEMPLATES = {
  'business-presence': 'Business presence',
  'lead-generation': 'Lead generation',
  'catalog-showcase': 'Catalog showcase',
}

// The pure model and exporter, as TypeScript source. Node strips the types; the
// modules touch no browser API at import time and every function used below is a
// pure function of the record handed to it.
const model = await import(pathToFileURL(join(repoRoot, 'showroom', 'src', 'products', 'website', 'website-model.ts')).href)
const exporter = await import(pathToFileURL(join(repoRoot, 'showroom', 'src', 'products', 'website', 'website-export.ts')).href)

const todayExpr = `(() => {
  const panel = document.querySelector('.website-today');
  if (!panel) return null;
  return {
    step: panel.dataset.step,
    state: panel.dataset.state,
    headline: (panel.querySelector('h2') || {}).textContent,
    action: (panel.querySelector('.website-today-priority button') || {}).textContent,
    metrics: Object.fromEntries(Array.from(panel.querySelectorAll('.website-today-metrics span')).map((s) => [(s.querySelector('small') || {}).textContent, (s.querySelector('strong') || {}).textContent])),
    context: (panel.querySelector('.website-today-source span') || {}).textContent,
  };
})()`

const actionBarExpr = `(() => {
  const bar = document.querySelector('.website-action-bar');
  if (!bar) return null;
  return {
    editing: bar.dataset.editing,
    surface: bar.dataset.surface,
    saveState: (bar.querySelector('.website-save-state') || {}).textContent,
    saveMode: (bar.querySelector('.website-save-state') || { dataset: {} }).dataset.mode,
    page: (bar.querySelector('#website-page-select') || {}).value,
    buttons: Array.from(bar.querySelectorAll('.website-primary-actions > button')).map((b) => b.textContent.trim()),
  };
})()`

const checklistExpr = `(() => {
  const panel = document.querySelector('.website-publish-workspace');
  if (!panel) return null;
  return {
    title: (panel.querySelector('#publish-editor-title') || {}).textContent,
    status: (panel.querySelector('.publish-flow-header .website-status') || {}).textContent,
    steps: Object.fromEntries(Array.from(panel.querySelectorAll('.publish-flow-nav li button')).map((b) => [(b.querySelector('strong') || {}).textContent, (b.querySelector('small') || {}).textContent])),
    active: ((panel.querySelector('.publish-flow-nav li button[aria-current="step"] strong') || {}).textContent) || null,
    boundary: (panel.querySelector('.publish-flow-boundary strong') || {}).textContent,
    boundaryCopy: (panel.querySelector('.publish-flow-boundary span') || {}).textContent,
    revision: (panel.querySelector('.publish-flow-revision code') || {}).textContent || null,
  };
})()`

runJourney({
  contract: CONTRACT,
  label: LABEL,
  profilePrefix: 'website-journey',
  workspaceKey: WEBSITE_KEY,
  summarizeWorkspace: (workspace) => ({
    siteName: workspace.siteName,
    revision: workspace.revision,
    contentRevision: workspace.contentRevision,
    pages: (workspace.pages || []).map((page) => ({ id: page.id, slug: page.slug, stage: page.stage, headline: page.hero?.headline })),
    evidence: (workspace.evidence || []).map((entry) => [entry.id, entry.kind, entry.verifiedBy, entry.fingerprint]),
    approvals: (workspace.approvals || []).map((entry) => [entry.id, entry.reviewer, entry.fingerprint]),
    localPublishes: (workspace.localPublishes || []).map((entry) => [entry.id, entry.recordedBy, entry.approvalId, entry.artifact?.contentDigest]),
    events: (workspace.events || []).map((entry) => [entry.id, entry.action, entry.actor, entry.subjectId]),
    workingSample: workspace.workingSample,
  }),
}, async (j) => {
  const expected = {}

  // Reads the persisted Website workspace and passes it through the model's own
  // integrity check every time: a record the app would refuse to load fails here.
  async function readWebsite() {
    const raw = await j.readStored(WEBSITE_KEY)
    j.expect(raw !== null, `${WEBSITE_KEY} is missing`)
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`${WEBSITE_KEY} is not valid JSON`)
    }
    j.expect(parsed && parsed.schema === WEBSITE_SCHEMA && parsed.version === 2, `${WEBSITE_KEY} has schema ${JSON.stringify(parsed && parsed.schema)} v${parsed && parsed.version}`)
    const workspace = model.restoreWorkspace(parsed)
    j.expect(workspace !== null, `${WEBSITE_KEY} fails the model's integrity check (restoreWorkspace returned null)`)
    j.expect(JSON.stringify(workspace) === JSON.stringify(parsed), 'the model normalised the persisted workspace on load — what is stored is not what the app runs')
    return { workspace, raw }
  }

  // The prefix rule and the record counts, in one place: called after every write.
  function assertNoSampleProof(workspace, where) {
    const ids = [
      ...workspace.evidence.map((entry) => entry.id),
      ...workspace.approvals.map((entry) => entry.id),
      ...workspace.localPublishes.map((entry) => entry.id),
      ...workspace.events.map((entry) => entry.id),
    ]
    const guided = ids.filter((id) => id.startsWith(GUIDED_SAMPLE_PREFIX))
    j.expect(guided.length === 0, `${where}: guided-sample ids in the release records: ${JSON.stringify(guided)}`)
    j.expect(!JSON.stringify(workspace).includes(GUIDED_SAMPLE_PREFIX), `${where}: the persisted workspace contains a ${GUIDED_SAMPLE_PREFIX} string`)
  }

  await j.step('fresh-origin', async () => {
    await j.navigate('/settings/?product=website')
    // The app writes housekeeping keys on first paint (theme, local metrics, the
    // Plant seed). What proves a fresh origin is that no Website workspace, no
    // setup record and no inquiry ledger exist before onboarding — the keys this
    // journey goes on to assert against.
    const fresh = await j.evaluate(`(async () => ({
      business: [${JSON.stringify(WEBSITE_KEY)}, ${JSON.stringify(SETUP_KEY)}, ${JSON.stringify(PRODUCT_SETUPS_KEY)}, ${JSON.stringify(LEADS_KEY)}, ${JSON.stringify(LAST_OPERATOR_KEY)}]
        .filter((key) => window.localStorage.getItem(key) !== null),
      session: Object.keys(window.sessionStorage).sort(),
      keys: Object.keys(window.localStorage).sort(),
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      viewport: window.innerWidth,
    }))()`)
    j.expect(fresh.business.length === 0, `a fresh profile already carries ${fresh.business.join(', ')} — this run is contaminated by a previous one`)
    j.expect(!fresh.session.includes(EDIT_SESSION_KEY), 'a fresh profile already holds an unsaved Website preview')
    j.expect(fresh.viewport === j.viewport.width, `expected a ${j.viewport.width}px viewport, got ${fresh.viewport}`)
    return { browser: j.browser, profile: j.userDataDir, keysWrittenByFirstPaint: fresh.keys, serviceWorkers: fresh.workers }
  })

  await j.step('setup-website', async () => {
    // Playbook §2.2-§2.3: the business name, then 'Create Website and preview it'.
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await j.type('input[autocomplete="organization"]', null, BUSINESS_NAME, 'Business name')
    const submit = await j.click('form.product-onboarding-form button[type="submit"]', null, 'the Website setup submit button')
    j.expect(submit.text === 'Create Website and preview it', `Website setup submit reads ${JSON.stringify(submit.text)} (playbook §2.3)`)
    await j.waitUntil(`location.pathname === '/website/'`, 'navigation to /website/')
    const today = await j.waitUntil(todayExpr, 'the Start here panel')
    const { workspace } = await readWebsite()
    // The guided working sample: the typed name, every page ready, the sample
    // marker current — and (a) no evidence, no approval, no site file, no event.
    j.expect(workspace.siteName === BUSINESS_NAME, `the site is named ${JSON.stringify(workspace.siteName)}, expected the typed business name`)
    j.expect(workspace.pages.length === 3 && workspace.pages.every((page) => page.stage === 'ready'), `the sample pages are ${JSON.stringify(workspace.pages.map((page) => [page.slug, page.stage]))}, expected three ready pages`)
    j.expect(workspace.pages.filter((page) => page.slug === '/').length === 1, 'the sample has no single home page at /')
    const fingerprint = model.workspaceFingerprint(workspace)
    j.expect(FINGERPRINT.test(fingerprint), `the workspace fingerprint is ${JSON.stringify(fingerprint)}`)
    const sample = workspace.workingSample
    j.expect(sample && sample.contract === 'supermega.website.working-sample.v1' && sample.contentFingerprint === fingerprint,
      `the working-sample marker is ${JSON.stringify(sample)}, expected it to match the current fingerprint ${fingerprint}`)
    j.expect(Object.hasOwn(WORKING_SAMPLE_TEMPLATES, sample.templateId), `the working sample names template ${JSON.stringify(sample.templateId)}`)
    j.expect(workspace.revision === workspace.contentRevision && workspace.contentRevision >= 1,
      `the sample is at revision ${workspace.revision} / content revision ${workspace.contentRevision} — a content-only install must not leave a release-record gap`)
    j.expect(workspace.evidence.length === 0 && workspace.approvals.length === 0 && workspace.localPublishes.length === 0 && workspace.events.length === 0,
      `the guided sample carries ${workspace.evidence.length} evidence, ${workspace.approvals.length} approvals, ${workspace.localPublishes.length} site files, ${workspace.events.length} events — a guided Website sample must publish and approve nothing`)
    j.expect(model.getCurrentApproval(workspace) === null && model.getCurrentPublish(workspace) === null, 'the model derives a current approval or publish from the untouched sample')
    assertNoSampleProof(workspace, 'after onboarding')
    const checks = model.readinessChecks(workspace, fingerprint)
    const contentChecks = checks.filter((check) => !check.id.startsWith('evidence-'))
    const evidenceChecks = checks.filter((check) => check.id.startsWith('evidence-'))
    j.expect(contentChecks.every((check) => check.passed), `sample content checks fail: ${JSON.stringify(contentChecks.filter((check) => !check.passed).map((check) => check.label))}`)
    j.expect(evidenceChecks.length === EVIDENCE_KINDS.length && evidenceChecks.every((check) => !check.passed), 'the sample already passes an evidence check without any evidence')
    // Nothing of Website's in the device ledger: the sample earned no proof there either.
    const actions = (await j.readJson(ACCOUNTABLE_ACTIONS_KEY)) || []
    j.expect(actions.every((action) => action.domain !== 'website'), `the accountable-action ledger already holds Website actions: ${JSON.stringify(actions.filter((action) => action.domain === 'website'))}`)
    j.expect(actions.every((action) => typeof action.id !== 'string' || action.id.startsWith(GUIDED_SAMPLE_PREFIX)), `a ledger action without the guided-sample prefix exists before any operator action: ${JSON.stringify(actions.map((action) => action.id))}`)
    // The screen: a device-local workspace's Start here offers the preview download,
    // and the action bar offers 'Edit page' with no 'Prepare file' — the checklist is
    // not button-reachable here (see the header comment).
    j.expect(today.step === 'preview-file' && today.state === 'ready' && today.headline === 'Download your website preview' && today.action === 'Download preview',
      `Start here reads ${JSON.stringify(today)}`)
    j.expect(today.metrics.Pages === '3/3 ready' && today.metrics.Readiness === 'Clear' && today.metrics.Review === 'Not required' && today.metrics['File'] === 'Ready to download',
      `Start here metrics read ${JSON.stringify(today.metrics)}`)
    j.expect(today.context === `${WORKING_SAMPLE_TEMPLATES[sample.templateId]} working sample · Saved on this device`, `Start here context reads ${JSON.stringify(today.context)}`)
    const bar = await j.waitUntil(actionBarExpr, 'the Website action bar')
    j.expect(bar.surface === 'preview' && bar.editing === 'false' && bar.saveState === 'Saved on this device' && bar.saveMode === 'browser-local',
      `the action bar reads ${JSON.stringify(bar)}`)
    j.expect(JSON.stringify(bar.buttons) === JSON.stringify(['Edit page', 'Download preview']), `the action bar offers ${JSON.stringify(bar.buttons)}, expected 'Edit page' and 'Download preview' with no 'Prepare file'`)
    const home = workspace.pages.find((page) => page.slug === '/')
    j.expect(bar.page === home.id, `the page selector holds ${JSON.stringify(bar.page)}, expected the home page ${home.id}`)
    expected.sample = { fingerprint, revision: workspace.revision, contentRevision: workspace.contentRevision, templateId: sample.templateId, homeId: home.id, homeHeadline: home.hero.headline, pageIds: workspace.pages.map((page) => page.id) }
    return { template: sample.templateId, fingerprint, revision: workspace.revision, pages: workspace.pages.map((page) => page.slug) }
  })

  await j.step('edit-headline', async () => {
    // Playbook §3.4: 'Edit page', change one headline live, then 'Save'.
    await j.click('.website-primary-actions button', 'Edit page', 'Edit page')
    await j.waitUntil(`(() => { const b = ${actionBarExpr}; return b && b.surface === 'work' ? b : null; })()`, 'the editor surface')
    // Scoped by its heading: the closed 'Site' disclosure holds a second
    // .website-editor-panel (the navigation editor) earlier in the DOM.
    const editor = await j.waitUntil(`(() => {
      const panel = document.querySelector('.website-editor-panel[aria-labelledby="content-editor-title"]');
      if (!panel) return null;
      const field = panel.querySelector('fieldset[data-content-section="hero"] textarea[maxlength="140"]');
      if (!field) return null;
      return { title: (panel.querySelector('#content-editor-title') || {}).textContent, stage: (panel.querySelector('.website-panel-head .website-status') || {}).textContent, headline: field.value };
    })()`, 'the home page content editor')
    j.expect(editor.title === 'Home' && editor.stage === 'ready' && editor.headline === expected.sample.homeHeadline, `the editor opened on ${JSON.stringify(editor)}`)
    j.expect(editor.headline !== HEADLINE, 'the sample already carries the journey headline')
    await j.type('fieldset[data-content-section="hero"] textarea[maxlength="140"]', null, HEADLINE, 'the Headline field')
    // The edit is an unsaved preview: held in sessionStorage, page back to draft,
    // and the saved workspace byte-for-byte what onboarding wrote.
    const staged = await j.waitUntil(`(() => {
      const raw = window.sessionStorage.getItem(${JSON.stringify(EDIT_SESSION_KEY)});
      if (!raw) return null;
      const session = JSON.parse(raw);
      const home = session.workspace.pages.find((page) => page.id === ${JSON.stringify(expected.sample.homeId)});
      return home && home.hero.headline === ${JSON.stringify(HEADLINE)} ? { baseFingerprint: session.baseFingerprint, baseRevision: session.baseRevision, stage: home.stage, evidence: session.workspace.evidence.length } : null;
    })()`, 'the unsaved preview to hold the new headline')
    j.expect(staged.baseFingerprint === expected.sample.fingerprint && staged.baseRevision === expected.sample.revision, `the edit session is based on ${JSON.stringify(staged)}, expected the sample's fingerprint and revision`)
    j.expect(staged.stage === 'draft', `an edited page is ${staged.stage}, expected it to return to draft`)
    const bar = await j.waitUntil(`(() => { const b = ${actionBarExpr}; return b && b.editing === 'true' ? b : null; })()`, 'the action bar to report an unsaved preview')
    j.expect(bar.saveState === 'Unsaved preview' && bar.buttons.includes('Save') && bar.buttons.includes('Discard'), `the editing action bar reads ${JSON.stringify(bar)}`)
    const { workspace: untouched } = await readWebsite()
    j.expect(model.workspaceFingerprint(untouched) === expected.sample.fingerprint && untouched.revision === expected.sample.revision,
      'typing into the editor changed the saved workspace before Save — a preview must never overwrite silently')
    const ready = await j.click('.website-panel-actions button.is-primary', 'Mark page ready', 'Mark page ready')
    j.expect(ready.text === 'Mark page ready', `the page action reads ${JSON.stringify(ready.text)}`)
    await j.waitUntil(`(() => {
      const raw = window.sessionStorage.getItem(${JSON.stringify(EDIT_SESSION_KEY)});
      if (!raw) return false;
      const home = JSON.parse(raw).workspace.pages.find((page) => page.id === ${JSON.stringify(expected.sample.homeId)});
      return Boolean(home) && home.stage === 'ready' && home.hero.headline === ${JSON.stringify(HEADLINE)};
    })()`, 'the edited home page to be marked ready in the preview')
    await j.click('.website-primary-actions button', 'Save', 'Save')
    const notice = await j.waitUntil(`(() => { const n = document.querySelector('.website-notice[data-priority="update"] p'); return n && n.textContent.startsWith('Website saved once') ? n.textContent : null; })()`, 'the save confirmation')
    const { workspace } = await readWebsite()
    j.expect(notice === `Website saved once as content revision ${workspace.contentRevision}. Nothing was deployed.`, `the save notice reads ${JSON.stringify(notice)}`)
    j.expect(workspace.revision === expected.sample.revision + 1 && workspace.contentRevision === expected.sample.contentRevision + 1,
      `after Save the workspace is at r${workspace.revision}/c${workspace.contentRevision}, expected r${expected.sample.revision + 1}/c${expected.sample.contentRevision + 1} — one content revision`)
    const home = workspace.pages.find((page) => page.id === expected.sample.homeId)
    j.expect(home && home.hero.headline === HEADLINE && home.stage === 'ready', `the saved home page is ${JSON.stringify(home && { headline: home.hero.headline, stage: home.stage })}`)
    j.expect(workspace.pages.every((page) => page.stage === 'ready') && JSON.stringify(workspace.pages.map((page) => page.id)) === JSON.stringify(expected.sample.pageIds), 'Save changed the page set or a page stage other than the edited one')
    const fingerprint = model.workspaceFingerprint(workspace)
    j.expect(fingerprint !== expected.sample.fingerprint && workspace.workingSample && workspace.workingSample.contentFingerprint === expected.sample.fingerprint,
      `after the edit the fingerprint is ${fingerprint} and the sample marker ${JSON.stringify(workspace.workingSample)} — the real edit must leave the sample marker behind`)
    j.expect(workspace.evidence.length === 0 && workspace.approvals.length === 0 && workspace.localPublishes.length === 0 && workspace.events.length === 0, 'saving content created a release record')
    assertNoSampleProof(workspace, 'after Save')
    const cleared = await j.evaluate(`window.sessionStorage.getItem(${JSON.stringify(EDIT_SESSION_KEY)}) === null`)
    j.expect(cleared, 'the unsaved preview is still held after Save')
    const preview = await j.waitUntil(`(() => { const h = document.querySelector('.website-preview-site .preview-hero h1'); return h && h.textContent === ${JSON.stringify(HEADLINE)} ? h.textContent : null; })()`, 'the preview to render the saved headline')
    const after = await j.waitUntil(`(() => { const b = ${actionBarExpr}; return b && b.editing === 'false' ? b : null; })()`, 'the action bar to settle after Save')
    // Save keeps the editor surface open; the device-local bar offers the preview
    // download and never 'Prepare file' (header comment).
    j.expect(after.surface === 'work' && after.saveState === 'Saved on this device' && JSON.stringify(after.buttons) === JSON.stringify(['Preview', 'Download preview']),
      `after Save the action bar reads ${JSON.stringify(after)}, expected the editor surface with 'Preview' and 'Download preview' and no 'Prepare file'`)
    const metrics = (await j.readJson(LOCAL_METRICS_KEY)) || { events: [] }
    const saved = (metrics.events || []).filter((entry) => entry.action === 'edit.saved')
    j.expect(saved.length === 1, `expected one edit.saved local metric, found ${saved.length}`)
    expected.edited = { fingerprint, revision: workspace.revision, contentRevision: workspace.contentRevision }
    return { headline: preview, fingerprint, revision: workspace.revision, contentRevision: workspace.contentRevision }
  })

  await j.step('download-preview-path', async () => {
    // Playbook §3.6: where the on-screen device-local flow ends. The button exports
    // the PREVIEW artifact of the saved content (every page, ready or not) and
    // records nothing: no site file, no approval, no revision. The Blob download is
    // denied at the browser level so the run leaves no file behind; the app's own
    // confirmation and metric prove the handler ran, and the exporter is asserted on
    // the artifact the model derives from the persisted record.
    await j.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' })
    const today = await j.waitUntil(todayExpr, 'the Start here panel')
    j.expect(today.step === 'preview-file' && today.action === 'Download preview' && today.context === `${WORKING_SAMPLE_TEMPLATES[expected.sample.templateId]} starting template · Saved on this device`,
      `after the real edit Start here reads ${JSON.stringify(today)} — the sample must be reported as a starting template, not a current sample`)
    const { workspace, raw } = await readWebsite()
    const preview = model.createWebsitePreviewArtifact(workspace)
    j.expect(preview.fingerprint === expected.edited.fingerprint && CONTENT_DIGEST.test(preview.contentDigest) && preview.pages.find((page) => page.slug === '/')?.hero.headline === HEADLINE,
      `the preview artifact is ${JSON.stringify({ fingerprint: preview.fingerprint, contentDigest: preview.contentDigest, pages: preview.pages.map((page) => page.slug) })}`)
    const issues = exporter.validateWebsiteArtifactForExport(preview)
    j.expect(issues.length === 0, `the preview artifact is not exportable: ${JSON.stringify(issues)}`)
    const first = exporter.createWebsiteHtmlDownload(preview)
    const second = exporter.createWebsiteHtmlDownload(model.createWebsitePreviewArtifact(JSON.parse(raw)))
    j.expect(first.content === second.content && first.filename === 'journey-test-site.html', 'the preview export is not deterministic over the persisted workspace')
    j.expect(first.content.includes(`<h1 id="home-title">${HEADLINE}</h1>`), 'the preview export does not carry the saved headline')
    await j.click('.website-primary-actions button', 'Download preview', 'Download preview')
    const notice = await j.waitUntil(`(() => { const n = document.querySelector('.website-notice[data-priority="update"] p'); return n && n.textContent.includes('downloaded') ? n.textContent : null; })()`, 'the download confirmation')
    j.expect(notice === `${first.filename} downloaded. It is a standalone preview; no site or domain was deployed.`, `the download notice reads ${JSON.stringify(notice)}`)
    const metrics = (await j.readJson(LOCAL_METRICS_KEY)) || { events: [] }
    const downloaded = (metrics.events || []).filter((entry) => entry.action === 'file.downloaded')
    j.expect(downloaded.length === 1, `expected one file.downloaded local metric, found ${downloaded.length}`)
    const unchanged = await j.readStored(WEBSITE_KEY)
    j.expect(unchanged === raw, 'Download preview changed the persisted workspace — a preview export must record nothing')
    return { filename: first.filename, previewDigest: preview.contentDigest, exportBytes: first.content.length }
  })

  await j.step('open-file-checklist', async () => {
    // The in-app history navigation described in the header comment: the editor
    // surface from 'Edit page' is still active, the URL gains ?view=publish, and the
    // app decides whether to honour it (canReview, re-derived from the saved
    // workspace: every page saved, ready and passing the content checks).
    await j.evaluate(`(() => { window.history.pushState(null, '', '/website/?view=publish'); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); })()`)
    const checklist = await j.waitUntil(`(() => { const c = ${checklistExpr}; return c && c.status ? c : null; })()`, 'the file checklist')
    const surface = await j.evaluate(`(() => {
      const grid = document.getElementById('website-active-panel');
      const panel = document.querySelector('.website-publish-workspace');
      return { view: grid && grid.className, surface: grid && grid.dataset.surface, visible: Boolean(panel) && panel.getClientRects().length > 0, heading: (document.querySelector('.website-heading h1') || {}).textContent };
    })()`)
    j.expect(surface.heading === 'Prepare website file' && surface.view === 'website-workspace-grid view-publish' && surface.surface === 'work' && surface.visible,
      `the publish view opened as ${JSON.stringify(surface)}`)
    j.expect(checklist.title === 'Check and download the site' && checklist.status === 'Needs evidence', `the checklist reads ${JSON.stringify([checklist.title, checklist.status])}`)
    j.expect(checklist.boundary === 'This device only' && checklist.boundaryCopy === 'Stored in this browser. No deployment, domain, payment, stock, message, or order change happens here.',
      `the checklist boundary reads ${JSON.stringify([checklist.boundary, checklist.boundaryCopy])}`)
    j.expect(checklist.steps.Checks === '7/7' && checklist.steps.Evidence === '0/3' && checklist.steps.Review === 'Required' && checklist.steps['Site file'] === 'Not ready',
      `the step statuses read ${JSON.stringify(checklist.steps)}`)
    j.expect(checklist.active === 'Evidence', `the checklist opened on ${JSON.stringify(checklist.active)}, expected Evidence (checks pass, no evidence yet)`)
    // Settled, not merely rendered: the app's own effect drops ?view=publish when
    // canReview is false, so the parameter surviving a tick is the app's decision.
    await j.sleep(300)
    const view = await j.evaluate(`new URLSearchParams(location.search).get('view')`)
    j.expect(view === 'publish', 'the app dropped ?view=publish for a saved, ready, passing workspace')
    return { status: checklist.status, steps: checklist.steps }
  })

  await j.step('record-evidence', async () => {
    const form = 'form.website-evidence-form'
    const recorded = []
    for (let index = 0; index < EVIDENCE_KINDS.length; index += 1) {
      const kind = await j.waitUntil(`(() => { const s = document.querySelector('${form} select'); return s && !${JSON.stringify(recorded)}.includes(s.value) ? s.value : null; })()`, `the evidence form to offer requirement ${index + 1}`)
      j.expect(EVIDENCE_KINDS.includes(kind), `the evidence form offers kind ${JSON.stringify(kind)}`)
      const prefilled = await j.evaluate(`(() => { const inputs = Array.from(document.querySelectorAll('${form} input')); return inputs.map((i) => i.value); })()`)
      j.expect(prefilled.length === 3 && prefilled[0] && prefilled[1], `the evidence form is prefilled with ${JSON.stringify(prefilled)}`)
      // The name is the accountability: a real person replaces the role placeholder.
      await j.type(`${form} input[maxlength="80"]`, null, REVIEWER, 'the Checked by field')
      const submit = await j.click(`${form} button[type="submit"]`, null, 'Save review note')
      j.expect(submit.text === 'Save review note', `the evidence submit reads ${JSON.stringify(submit.text)}`)
      await j.waitUntil(`(() => { const raw = window.__journey.read(${JSON.stringify(WEBSITE_KEY)}); return raw && JSON.parse(raw).evidence.length === ${index + 1}; })()`, `evidence record ${index + 1} in the stored workspace`)
      const { workspace } = await readWebsite()
      const [entry] = workspace.evidence
      j.expect(EVIDENCE_ID.test(entry.id) && !entry.id.startsWith(GUIDED_SAMPLE_PREFIX), `evidence id is ${JSON.stringify(entry.id)} — a real review note must carry a generated id`)
      j.expect(entry.kind === kind && entry.verifiedBy === REVIEWER && entry.finding === prefilled[0] && entry.reference === prefilled[1] && entry.migratedFromV1 === false,
        `the evidence record is ${JSON.stringify(entry)}`)
      j.expect(entry.fingerprint === expected.edited.fingerprint && entry.source.digest === expected.edited.fingerprint && entry.source.contentRevision === expected.edited.contentRevision,
        `the evidence is bound to ${JSON.stringify([entry.fingerprint, entry.source])}, expected the edited revision ${expected.edited.fingerprint} c${expected.edited.contentRevision}`)
      const event = workspace.events.find((candidate) => candidate.subjectId === entry.id)
      j.expect(event && event.id === `event-${entry.id}` && event.action === 'publish_evidence_recorded' && event.actor === REVIEWER && event.actorKind === 'human' && event.reason === entry.finding && event.evidenceReference === entry.reference,
        `the evidence event is ${JSON.stringify(event)}`)
      j.expect(workspace.revision === expected.edited.revision + index + 1 && workspace.contentRevision === expected.edited.contentRevision, `after review note ${index + 1} the workspace is at r${workspace.revision}/c${workspace.contentRevision}`)
      j.expect(workspace.approvals.length === 0 && workspace.localPublishes.length === 0, 'a review note created an approval or a site file')
      recorded.push(kind)
      expected.evidenceIds = workspace.evidence.map((candidate) => candidate.id)
    }
    j.expect(JSON.stringify([...recorded].sort()) === JSON.stringify([...EVIDENCE_KINDS].sort()), `the recorded kinds are ${JSON.stringify(recorded)}`)
    const { workspace } = await readWebsite()
    const checks = model.readinessChecks(workspace)
    j.expect(checks.every((check) => check.passed), `readiness checks still fail after three review notes: ${JSON.stringify(checks.filter((check) => !check.passed).map((check) => check.label))}`)
    j.expect(model.getCurrentApproval(workspace) === null, 'the model derives a current approval from evidence alone')
    assertNoSampleProof(workspace, 'after the review notes')
    // The form advanced to the final review on its own.
    const checklist = await j.waitUntil(`(() => { const c = ${checklistExpr}; return c && c.active === 'Review' ? c : null; })()`, 'the checklist to advance to Review')
    j.expect(checklist.status === 'Needs review' && checklist.steps.Evidence === '3/3' && checklist.steps.Review === 'Required', `after the review notes the checklist reads ${JSON.stringify([checklist.status, checklist.steps])}`)
    return { kinds: recorded, evidenceIds: expected.evidenceIds, revision: workspace.revision }
  })

  await j.step('approve-revision', async () => {
    const form = 'form.website-approval-form'
    const gate = await j.waitUntil(`(() => {
      const f = document.querySelector('${form}');
      if (!f) return null;
      const inputs = Array.from(f.querySelectorAll('input'));
      return { values: inputs.map((i) => i.value), disabled: inputs.map((i) => i.disabled), checked: (f.querySelector('input[type="checkbox"]') || {}).checked, hint: (f.querySelector('.website-gate-actions small') || {}).textContent, submit: (f.querySelector('button[type="submit"]') || {}).disabled };
    })()`, 'the final review form')
    j.expect(gate.disabled.every((flag) => flag === false) && gate.checked === false && gate.submit === true && gate.hint === 'Ready for a named reviewer.',
      `the final review form opened as ${JSON.stringify(gate)}, expected unlocked fields, an unchecked confirmation and a disabled submit`)
    await j.type(`${form} input[maxlength="80"]`, null, REVIEWER, 'the Reviewer field')
    const note = await j.evaluate(`(document.querySelector('${form} input[maxlength="240"]') || {}).value`)
    j.expect(note === `Content, responsive preview, and destinations reviewed for ${BUSINESS_NAME}.`, `the decision note reads ${JSON.stringify(note)}`)
    await j.click(`${form} input[type="checkbox"]`, null, 'the review confirmation checkbox')
    await j.waitUntil(`(document.querySelector('${form} input[type="checkbox"]') || {}).checked === true`, 'the confirmation to be checked')
    const submit = await j.click(`${form} button[type="submit"]`, null, 'Save final review')
    j.expect(submit.text === 'Save final review', `the approval submit reads ${JSON.stringify(submit.text)}`)
    await j.waitUntil(`(() => { const raw = window.__journey.read(${JSON.stringify(WEBSITE_KEY)}); return raw && JSON.parse(raw).approvals.length === 1; })()`, 'the approval in the stored workspace')
    const { workspace } = await readWebsite()
    const [approval] = workspace.approvals
    j.expect(APPROVAL_ID.test(approval.id) && !approval.id.startsWith(GUIDED_SAMPLE_PREFIX), `approval id is ${JSON.stringify(approval.id)} — a real approval must carry a generated id`)
    j.expect(approval.reviewer === REVIEWER && approval.note === note && approval.migratedFromV1 === false, `the approval is ${JSON.stringify(approval)}`)
    j.expect(approval.fingerprint === expected.edited.fingerprint && approval.source.contentRevision === expected.edited.contentRevision, `the approval is bound to ${JSON.stringify([approval.fingerprint, approval.source])}`)
    j.expect(JSON.stringify([...approval.evidenceIds].sort()) === JSON.stringify([...expected.evidenceIds].sort()), `the approval binds evidence ${JSON.stringify(approval.evidenceIds)}, expected ${JSON.stringify(expected.evidenceIds)}`)
    const event = workspace.events.find((candidate) => candidate.subjectId === approval.id)
    j.expect(event && event.id === `event-${approval.id}` && event.action === 'website_revision_approved' && event.actor === REVIEWER && event.createdAt === approval.approvedAt && event.evidenceReference === approval.evidenceIds.join(','),
      `the approval event is ${JSON.stringify(event)}`)
    const current = model.getCurrentApproval(workspace)
    j.expect(current && current.id === approval.id, 'the model does not derive the saved approval as current')
    j.expect(workspace.localPublishes.length === 0 && model.getCurrentPublish(workspace) === null, 'approving created a site file')
    j.expect(workspace.revision === expected.edited.revision + EVIDENCE_KINDS.length + 1 && workspace.contentRevision === expected.edited.contentRevision, `after approval the workspace is at r${workspace.revision}/c${workspace.contentRevision}`)
    assertNoSampleProof(workspace, 'after approval')
    const checklist = await j.waitUntil(`(() => { const c = ${checklistExpr}; return c && c.active === 'Site file' ? c : null; })()`, 'the checklist to advance to Site file')
    j.expect(checklist.status === 'Ready to record' && checklist.steps.Review === 'Approved' && checklist.steps['Site file'] === 'Not ready', `after approval the checklist reads ${JSON.stringify([checklist.status, checklist.steps])}`)
    const panel = await j.waitUntil(`(() => {
      const s = document.querySelector('#publish-step-snapshot');
      if (!s) return null;
      return { lead: (s.querySelector('.website-local-publish-action strong') || {}).textContent, status: (s.querySelector('header .website-status') || {}).textContent, buttons: Array.from(s.querySelectorAll('.website-local-publish-controls button')).map((b) => [b.textContent.trim(), b.disabled]), history: (s.querySelector('.website-empty p') || {}).textContent };
    })()`, 'the site-file step')
    j.expect(panel.lead === 'Review matches. Create the site file.' && panel.status === 'Not ready' && panel.history === 'No approved site files yet.', `the site-file step reads ${JSON.stringify(panel)}`)
    j.expect(JSON.stringify(panel.buttons) === JSON.stringify([['Create site file', false], ['Download site', true]]), `the site-file controls are ${JSON.stringify(panel.buttons)}`)
    expected.approval = approval
    return { approvalId: approval.id, reviewer: approval.reviewer, revision: workspace.revision }
  })

  await j.step('create-site-file', async () => {
    await j.click('#publish-step-snapshot .website-local-publish-controls button', 'Create site file', 'Create site file')
    await j.waitUntil(`(() => { const raw = window.__journey.read(${JSON.stringify(WEBSITE_KEY)}); return raw && JSON.parse(raw).localPublishes.length === 1; })()`, 'the site file in the stored workspace')
    const notice = await j.evaluate(`(document.querySelector('.website-notice[data-priority="update"] p') || {}).textContent`)
    j.expect(notice === 'Approved website file saved. Nothing was deployed.', `the site-file notice reads ${JSON.stringify(notice)}`)
    const { workspace, raw } = await readWebsite()
    const [record] = workspace.localPublishes
    // (b) The real proof: a generated id, the named reviewer, the approval and its
    // evidence, every ready page, and the retained artifact — bound to the edited
    // revision, never to the sample.
    j.expect(SNAPSHOT_ID.test(record.id) && !record.id.startsWith(GUIDED_SAMPLE_PREFIX), `site-file id is ${JSON.stringify(record.id)} — a real site file must carry a generated id, never the guided-sample prefix`)
    j.expect(record.recordedBy === REVIEWER && record.approvalId === expected.approval.id && record.migratedFromV1 === false, `the site file is ${JSON.stringify({ recordedBy: record.recordedBy, approvalId: record.approvalId, migratedFromV1: record.migratedFromV1 })}`)
    j.expect(JSON.stringify([...record.evidenceIds].sort()) === JSON.stringify([...expected.approval.evidenceIds].sort()), `the site file binds evidence ${JSON.stringify(record.evidenceIds)}`)
    j.expect(JSON.stringify([...record.readyPageIds].sort()) === JSON.stringify([...expected.sample.pageIds].sort()), `the site file lists ready pages ${JSON.stringify(record.readyPageIds)}, expected all three`)
    j.expect(record.fingerprint === expected.edited.fingerprint && record.source.digest === expected.edited.fingerprint && record.source.contentRevision === expected.edited.contentRevision,
      `the site file is bound to ${JSON.stringify([record.fingerprint, record.source])}`)
    j.expect(Date.parse(record.recordedAt) >= Date.parse(expected.approval.approvedAt), 'the site file predates its approval')
    const artifact = record.artifact
    j.expect(artifact && artifact.schema === 'supermega.website.artifact.v1' && artifact.siteName === BUSINESS_NAME && artifact.fingerprint === expected.edited.fingerprint,
      `the retained artifact is ${JSON.stringify(artifact && { schema: artifact.schema, siteName: artifact.siteName, fingerprint: artifact.fingerprint })}`)
    j.expect(CONTENT_DIGEST.test(artifact.contentDigest), `the artifact's content digest is ${JSON.stringify(artifact.contentDigest)}`)
    j.expect(artifact.pages.length === 3 && artifact.pages.find((page) => page.slug === '/')?.hero.headline === HEADLINE, `the artifact pages are ${JSON.stringify(artifact.pages.map((page) => [page.slug, page.hero.headline]))}`)
    // The model's own recomputation from the persisted workspace must reproduce the
    // artifact byte for byte — including the content digest.
    const recomputed = model.createWebsiteArtifact(workspace)
    j.expect(recomputed.contentDigest === artifact.contentDigest, `recomputing the artifact gives digest ${recomputed.contentDigest}, the record holds ${artifact.contentDigest}`)
    j.expect(JSON.stringify(recomputed) === JSON.stringify(artifact), 'recomputing the artifact from the persisted workspace does not reproduce the retained artifact')
    const current = model.getCurrentPublish(workspace)
    j.expect(current && current.id === record.id, 'the model does not derive the saved site file as the current publish')
    const event = workspace.events.find((candidate) => candidate.subjectId === record.id)
    j.expect(event && event.id === `event-${record.id}` && event.action === 'local_snapshot_recorded' && event.actor === REVIEWER && event.createdAt === record.recordedAt && event.evidenceReference === expected.approval.id && event.reason === 'Approved browser-local snapshot recorded',
      `the site-file event is ${JSON.stringify(event)}`)
    j.expect(workspace.events.length === EVIDENCE_KINDS.length + 2 && workspace.evidence.length === EVIDENCE_KINDS.length && workspace.approvals.length === 1,
      `the release history is ${workspace.evidence.length} evidence / ${workspace.approvals.length} approvals / ${workspace.localPublishes.length} site files / ${workspace.events.length} events`)
    j.expect(workspace.revision === expected.edited.revision + EVIDENCE_KINDS.length + 2 && workspace.contentRevision === expected.edited.contentRevision, `after the site file the workspace is at r${workspace.revision}/c${workspace.contentRevision}`)
    assertNoSampleProof(workspace, 'after the site file')
    // The export, asserted on the record: the pure exporter accepts the artifact and
    // is deterministic over it. The browser download itself is not driven.
    const issues = exporter.validateWebsiteArtifactForExport(artifact)
    j.expect(issues.length === 0, `the retained artifact is not exportable: ${JSON.stringify(issues)}`)
    const first = exporter.createWebsiteHtmlDownload(artifact)
    const second = exporter.createWebsiteHtmlDownload(JSON.parse(JSON.stringify(artifact)))
    j.expect(first.content === second.content && first.filename === second.filename, 'the exporter is not deterministic over the retained artifact')
    j.expect(first.filename === 'journey-test-site.html' && first.mimeType === 'text/html;charset=utf-8', `the export is ${first.filename} (${first.mimeType})`)
    j.expect(first.content.startsWith('<!doctype html>\n<html lang="en">') && first.content.includes(`<h1 id="home-title">${HEADLINE}</h1>`) && first.content.includes(`<a class="site-name" href="#home">${BUSINESS_NAME}</a>`),
      'the exported HTML does not carry the saved headline and site name')
    j.expect(!first.content.includes(GUIDED_SAMPLE_PREFIX) && !first.content.includes(record.id), 'the exported HTML leaks record identifiers')
    // The screen after the write: file ready, download offered, the go-live section
    // that deploys nothing, and one history entry. This is where the shipped UI stops.
    const checklist = await j.waitUntil(`(() => { const c = ${checklistExpr}; return c && c.status === 'Site file ready' ? c : null; })()`, "the checklist to read 'Site file ready'")
    j.expect(checklist.steps['Site file'] === 'Ready' && checklist.steps.Review === 'Approved' && checklist.steps.Evidence === '3/3', `after the site file the steps read ${JSON.stringify(checklist.steps)}`)
    const panel = await j.waitUntil(`(() => {
      const s = document.querySelector('#publish-step-snapshot');
      if (!s || !s.querySelector('.website-go-live')) return null;
      return {
        lead: (s.querySelector('.website-local-publish-action strong') || {}).textContent,
        status: (s.querySelector('header .website-status') || {}).textContent,
        buttons: Array.from(s.querySelectorAll('.website-local-publish-controls button')).map((b) => [b.textContent.trim(), b.disabled]),
        goLive: (s.querySelector('#go-live-title') || {}).textContent,
        options: Array.from(s.querySelectorAll('.website-go-live-option summary')).map((n) => n.textContent.trim()),
        history: (s.querySelector('.website-publish-history-disclosure summary') || {}).textContent,
        historyId: (s.querySelector('.website-publish-history article strong') || {}).textContent,
      };
    })()`, 'the site-file step after the write')
    j.expect(panel.lead === 'The approved site is retained and ready to download.' && panel.status === 'File ready', `the site-file step reads ${JSON.stringify([panel.lead, panel.status])}`)
    j.expect(JSON.stringify(panel.buttons) === JSON.stringify([['Download site', false]]), `the site-file controls are ${JSON.stringify(panel.buttons)}, expected only an enabled 'Download site'`)
    j.expect(panel.goLive === 'Get this live' && JSON.stringify(panel.options) === JSON.stringify(['Host it yourself', 'Request managed hosting']), `the go-live section reads ${JSON.stringify([panel.goLive, panel.options])}`)
    j.expect(panel.history === 'Site file history (1)' && panel.historyId === record.id, `the history reads ${JSON.stringify([panel.history, panel.historyId])}`)
    const actions = (await j.readJson(ACCOUNTABLE_ACTIONS_KEY)) || []
    j.expect(actions.every((action) => action.domain !== 'website'), 'the Website file checklist wrote to the shared accountable-action ledger')
    expected.record = record
    expected.raw = raw
    return { recordId: record.id, contentDigest: artifact.contentDigest, filename: first.filename, exportBytes: first.content.length, revision: workspace.revision }
  })

  await j.step('reload-re-derives-published', async () => {
    // A full reload: 'Site file ready' must come from the persisted record, not from
    // React state — and loading must not rewrite the record. After a reload the app
    // mounts the checklist behind the preview surface again (header comment), so
    // this step reads its derived state and clicks nothing.
    await j.navigate('/website/?view=publish')
    const checklist = await j.waitUntil(`(() => { const c = ${checklistExpr}; return c && c.status === 'Site file ready' ? c : null; })()`, "the checklist to re-derive 'Site file ready'")
    j.expect(checklist.active === 'Site file' && checklist.steps['Site file'] === 'Ready' && checklist.steps.Review === 'Approved' && checklist.steps.Evidence === '3/3' && checklist.steps.Checks === '7/7',
      `after reload the checklist reads ${JSON.stringify([checklist.active, checklist.steps])}`)
    const surface = await j.evaluate(`(() => { const grid = document.getElementById('website-active-panel'); const panel = document.querySelector('.website-publish-workspace'); return { surface: grid && grid.dataset.surface, visible: Boolean(panel) && panel.getClientRects().length > 0, heading: (document.querySelector('.website-heading h1') || {}).textContent }; })()`)
    j.expect(surface.heading === 'Prepare website file' && surface.surface === 'preview' && surface.visible === false,
      `after reload the publish view is ${JSON.stringify(surface)} — expected the checklist mounted behind the preview surface (update this journey if the product now shows it)`)
    const raw = await j.readStored(WEBSITE_KEY)
    j.expect(raw === expected.raw, 'the persisted Website workspace changed across a reload')
    const { workspace } = await readWebsite()
    const current = model.getCurrentPublish(workspace)
    j.expect(current && current.id === expected.record.id && JSON.stringify(current) === JSON.stringify(expected.record), 'the reloaded record is not the site file the journey created')
    j.expect(model.createWebsiteArtifact(workspace).contentDigest === expected.record.artifact.contentDigest, 'the recomputed digest drifted across a reload')
    const panel = await j.waitUntil(`(() => {
      const s = document.querySelector('#publish-step-snapshot');
      if (!s || !s.querySelector('.website-go-live')) return null;
      return { buttons: Array.from(s.querySelectorAll('.website-local-publish-controls button')).map((b) => [b.textContent.trim(), b.disabled]), historyId: (s.querySelector('.website-publish-history article strong') || {}).textContent };
    })()`, 'the site-file step after reload')
    j.expect(JSON.stringify(panel.buttons) === JSON.stringify([['Download site', false]]) && panel.historyId === expected.record.id, `after reload the site-file step reads ${JSON.stringify(panel)}`)
    const today = await j.waitUntil(todayExpr, 'the Start here panel after reload')
    j.expect(today.metrics.Pages === '3/3 ready' && today.metrics.Readiness === 'Clear' && today.metrics.Review === 'Not required' && today.metrics['File'] === 'Ready to download',
      `after reload Start here metrics read ${JSON.stringify(today.metrics)}`)
    j.expect(today.context === `${WORKING_SAMPLE_TEMPLATES[expected.sample.templateId]} starting template · Saved on this device`, `after the real edit Start here context reads ${JSON.stringify(today.context)} — the sample must be reported as a starting template, not a current sample`)
    const operator = await j.readStored(LAST_OPERATOR_KEY)
    j.expect(operator === null, `Website wrote the shared last-operator key: ${JSON.stringify(operator)}`)
    return { recordId: expected.record.id, contentDigest: expected.record.artifact.contentDigest, status: checklist.status }
  })
}).catch((err) => reportFatal(LABEL, err))
