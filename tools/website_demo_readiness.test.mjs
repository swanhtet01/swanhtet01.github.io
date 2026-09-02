import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  MAX_WEBSITE_PAGES,
  MAX_WEBSITE_SECTIONS,
  WEBSITE_SCHEMA,
  WEBSITE_STORAGE_KEY,
  commitWebsiteEditSession,
  createBlankPage,
  createBlankSection,
  createId,
  createInitialWorkspace,
  createWebsiteArtifact,
  createWebsiteEditSession,
  createWebsitePreviewArtifact,
  duplicatePage,
  evidenceRequirements,
  formatTimestamp,
  getCurrentApproval,
  getCurrentEvidence,
  getCurrentPublish,
  isCurrentApproval,
  isCurrentPublish,
  isReplaceableWebsiteSampleWorkspace,
  normalizeSlug,
  pageIssues,
  previewDevices,
  readinessChecks,
  recordWebsiteEvidence,
  recordWebsiteSnapshot,
  approveWebsiteRevision,
  restoreWebsiteEditSession,
  restoreWorkspace,
  updateWebsiteEditSession,
  websiteEditSessionMatches,
  websiteSource,
  workspaceFingerprint,
  LEGACY_WEBSITE_STORAGE_KEY,
  applyWebsiteWorkspaceUpdate,
  importWebsitePageDrafts,
} from '../showroom/src/products/website/website-model.ts'
import {
  applyWebsiteStarterBrief,
  installWebsiteWorkingSample,
  isUntouchedWebsiteStarter,
  websiteStarterBriefIssues,
  websiteStarterTemplates,
} from '../showroom/src/products/website/website-starter.ts'

const CAPTURED_AT = '2026-08-08T02:00:00.000Z'
const CONTENT_CHECK_IDS = ['ready-pages', 'home-path', 'navigation']
const websiteProductSource = await readFile(new URL('../showroom/src/products/website/WebsiteProduct.tsx', import.meta.url), 'utf8')
const websiteProductCss = (await readFile(new URL('../showroom/src/products/website/website-product.css', import.meta.url), 'utf8')).replaceAll('\r\n', '\n')

function contentChecks(workspace) {
  return readinessChecks(workspace).filter((check) => CONTENT_CHECK_IDS.includes(check.id))
}

test('the Website FILE status stays fully readable on desktop and keeps the mobile layout', () => {
  assert.match(
    websiteProductSource,
    /\['File', hasUnsavedChanges \? 'Blocked by draft' : releaseRecordRequired \? publishIsCurrent \? 'Ready' : 'Needed' : 'Ready to download'\]/,
    'the guarded status must remain the current source-owned FILE truth',
  )

  const ellipsisRule = '.website-today-metrics strong { overflow: hidden; color: var(--website-ink); font-size: 0.6875rem; text-overflow: ellipsis; white-space: nowrap; }'
  const fileRule = '.website-today-metrics span:last-child strong { overflow: visible; text-overflow: clip; white-space: normal; }'
  assert.ok(websiteProductCss.includes(ellipsisRule), 'other compact Website metrics retain their bounded ellipsis behavior')
  assert.ok(websiteProductCss.indexOf(fileRule) > websiteProductCss.indexOf(ellipsisRule), 'the FILE value override must follow and defeat the generic ellipsis rule')
  assert.match(
    websiteProductCss,
    /@media \(max-width: 760px\) \{[\s\S]*?\.website-today-metrics \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}\n  \.website-today-metrics span:last-child \{ grid-column: 1 \/ -1; \}/,
    'mobile keeps its two-column grid with the FILE metric spanning the full row',
  )
})

test('a fresh Website workspace opens on a complete, previewable site', () => {
  const workspace = createInitialWorkspace()
  assert.equal(workspace.pages.length, 3)
  assert.ok(workspace.pages.every((page) => page.stage === 'ready'), 'every seeded page must be ready')
  for (const page of workspace.pages) {
    assert.ok(page.hero.headline.trim(), `${page.id} needs a headline`)
    assert.ok(page.hero.summary.trim(), `${page.id} needs a summary`)
    assert.ok(page.seo.title.trim(), `${page.id} needs an SEO title`)
    assert.ok(page.seo.description.trim(), `${page.id} needs an SEO description`)
  }
  assert.ok(workspace.pages.some((page) => page.navigation.visible), 'navigation must show at least one page')
  assert.ok(isUntouchedWebsiteStarter(workspace))
})

test('a recovered tab draft waits for an explicit provenance choice', () => {
  assert.match(
    websiteProductSource,
    /setEditSessionState\(null\)\s+setRestoredDraftState\(next\)/,
    'restoration must hold the candidate aside instead of silently activating it',
  )
  assert.match(websiteProductSource, /Unsaved tab draft found/)
  assert.match(websiteProductSource, /Current \{isUntouchedWebsiteStarter\(workspace\) \? 'sample' : 'saved Website'\}/)
  assert.match(websiteProductSource, /Continue saved draft/)
  assert.match(websiteProductSource, /Start from this \{isUntouchedWebsiteStarter\(workspace\) \? 'sample' : 'Website'\}/)
  assert.match(websiteProductSource, /Nothing was overwritten, deployed, published, or sent\./)
  assert.match(
    websiteProductSource,
    /window\.sessionStorage\.removeItem\(websiteEditSessionStorageKey\(pendingRestoredDraft\.scope\)\)/,
    'choosing the current Website must remove the older tab draft',
  )
  assert.match(
    websiteProductSource,
    /The older tab draft could not be discarded safely[\s\S]*?focusRestoredDraftChoice\(\)[\s\S]*?return/,
    'a storage failure must keep the provenance choice unresolved',
  )
  assert.match(
    websiteProductSource,
    /if \(pendingRestoredDraft\) \{\s+focusRestoredDraftChoice\(\)\s+return\s+\}/,
    'the primary action must return to the unresolved choice instead of bypassing it',
  )
})

test('the seeded site passes every content readiness check', () => {
  const checks = contentChecks(createInitialWorkspace())
  assert.equal(checks.length, CONTENT_CHECK_IDS.length, 'all content checks must be present')
  const failed = checks.filter((check) => !check.passed).map((check) => `${check.id}: ${check.detail}`)
  assert.deepEqual(failed, [], 'a fresh demo site must not open with failing checks')
})

test('every starter template installs a ready working sample that still passes its checks', () => {
  for (const template of websiteStarterTemplates) {
    const installed = installWebsiteWorkingSample(createInitialWorkspace(), {
      templateId: template.id,
      businessName: 'Yangon Wellness Spa',
      capturedAt: CAPTURED_AT,
    })
    assert.ok(installed, `${template.id} working sample must install`)
    const workspace = installed.workspace ?? installed
    assert.ok(workspace.pages.length >= 2, `${template.id} needs pages`)
    assert.ok(
      workspace.pages.every((page) => page.stage === 'ready'),
      `${template.id} must leave every page ready`,
    )
    const failed = contentChecks(workspace).filter((check) => !check.passed).map((check) => check.id)
    assert.deepEqual(failed, [], `${template.id} must not fail content checks`)
    assert.ok(
      workspace.pages.some((page) => page.hero.headline.includes('Yangon Wellness Spa')
        || page.seo.title.includes('Yangon Wellness Spa')
        || workspace.siteName.includes('Yangon Wellness Spa')),
      `${template.id} must carry the client business name`,
    )
  }
})

test('the working sample never fabricates release, approval, or publish evidence', () => {
  const installed = installWebsiteWorkingSample(createInitialWorkspace(), {
    templateId: websiteStarterTemplates[0].id,
    businessName: 'Yangon Wellness Spa',
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed)
  const workspace = installed.workspace ?? installed
  // These are the surfaces the v4 proof baseline reads; a sample must leave them empty.
  assert.deepEqual(workspace.localPublishes ?? [], [])
  assert.deepEqual(workspace.approvals ?? [], [])
  assert.deepEqual(workspace.evidence ?? [], [])
  assert.deepEqual(workspace.events ?? [], [])
})

test('every client preset maps to a real website template with its own second page', async () => {
  const { clientDemoPresets } = await import('../showroom/src/core/client-onboarding.ts')
  const templateIds = new Set(websiteStarterTemplates.map((template) => template.id))
  const secondarySlugBy = {
    'lead-generation': '/services',
    'catalog-showcase': '/catalog',
    'business-presence': '/about',
  }
  const seen = new Set()
  for (const preset of clientDemoPresets) {
    const selection = preset.selections.find((entry) => entry.product === 'website')
    if (!selection) continue
    const templateId = selection.templateId
    assert.ok(templateIds.has(templateId), `${preset.id} maps to unknown website template ${templateId}`)
    seen.add(templateId)
    const installed = installWebsiteWorkingSample(createInitialWorkspace(), {
      templateId,
      businessName: 'Yangon Wellness Spa',
      capturedAt: CAPTURED_AT,
    })
    assert.ok(installed, `${preset.id} (${templateId}) must install`)
    const workspace = installed.workspace ?? installed
    const slugs = workspace.pages.map((page) => page.slug)
    assert.ok(
      slugs.includes(secondarySlugBy[templateId]),
      `${templateId} must produce ${secondarySlugBy[templateId]}, saw ${JSON.stringify(slugs)}`,
    )
  }
  // The presets must exercise more than one template, or client type is not reaching Website.
  assert.ok(seen.size >= 2, `presets collapse to a single website template: ${JSON.stringify([...seen])}`)
})

test('a client can import their real pages over a working sample, but not over real work', async () => {
  const { importWebsitePageDrafts, isReplaceableWebsiteSampleWorkspace } = await import(
    '../showroom/src/products/website/website-model.ts'
  )
  const sampleInstall = installWebsiteWorkingSample(createInitialWorkspace(), {
    templateId: 'catalog-showcase',
    businessName: 'Yangon Wellness Spa',
    capturedAt: CAPTURED_AT,
  })
  assert.ok(sampleInstall)
  const sample = sampleInstall.workspace ?? sampleInstall
  assert.ok(isReplaceableWebsiteSampleWorkspace(sample), 'a fresh working sample must be replaceable')

  const importInput = {
    siteName: 'Yangon Wellness Spa',
    pages: [
      { slug: 'home', title: 'Home', headline: 'Book a treatment today', body: 'Real client copy for the home page.', contactUrl: '' },
      { slug: 'treatments', title: 'Treatments', headline: 'Our treatments', body: 'Real client copy for the treatments page.', contactUrl: '' },
    ],
    sourceDigest: `sha256:${'b'.repeat(64)}`,
    capturedAt: CAPTURED_AT,
  }
  // The app's own onboarding installed the sample, so it must not block the first import.
  const imported = importWebsitePageDrafts(sample, importInput)
  assert.ok(imported, 'importing over an untouched working sample must succeed')
  assert.equal(imported.created, 2)
  assert.deepEqual(imported.workspace.pages.map((page) => page.slug), ['/', '/treatments'])

  // Real owner evidence still blocks a replacing import.
  const withOwnerEvidence = { ...sample, localPublishes: [...(sample.localPublishes ?? []), { id: 'pub-1' }] }
  assert.equal(isReplaceableWebsiteSampleWorkspace(withOwnerEvidence), false)
  assert.equal(importWebsitePageDrafts(withOwnerEvidence, importInput), null)
})

test('the starter brief validator catches invalid fields before any workspace is touched', () => {
  const validBrief = {
    templateId: 'lead-generation',
    businessName: 'Yangon Wellness Spa',
    audience: 'health-conscious adults in Yangon',
    offer: 'personalized spa treatments and wellness packages',
    proof: 'Over 500 five-star reviews since 2021.',
    contactHref: '',
  }
  assert.deepEqual(websiteStarterBriefIssues(validBrief), [], 'a complete brief must have no issues')
  assert.ok(websiteStarterBriefIssues({ ...validBrief, templateId: 'unknown-layout' }).some((issue) => issue.field === 'templateId'))
  assert.ok(websiteStarterBriefIssues({ ...validBrief, businessName: '' }).some((issue) => issue.field === 'businessName'))
  assert.ok(websiteStarterBriefIssues({ ...validBrief, offer: '' }).some((issue) => issue.field === 'offer'))
  assert.ok(websiteStarterBriefIssues({ ...validBrief, contactHref: 'http://insecure' }).some((issue) => issue.field === 'contactHref'))
  assert.ok(websiteStarterBriefIssues({ ...validBrief, contactHref: 'https://contact.example.com' }).length === 0, 'a valid HTTPS contact is accepted')
})

test('applying a starter brief on a fresh workspace customises content with the business name', () => {
  const workspace = createInitialWorkspace()
  assert.ok(isUntouchedWebsiteStarter(workspace))

  const brief = {
    templateId: 'lead-generation',
    businessName: 'Shwe Spa and Wellness',
    audience: 'working professionals',
    offer: 'expert massage and wellness sessions',
    proof: 'Certified therapists with 10+ years of experience.',
    contactHref: 'https://shwespa.com/contact',
  }
  const applied = applyWebsiteStarterBrief(workspace, brief, CAPTURED_AT)
  assert.ok(applied !== workspace, 'applying a valid brief must produce a new workspace')
  assert.equal(applied.siteName, 'Shwe Spa and Wellness')
  assert.ok(
    applied.pages.some((page) => JSON.stringify(page).includes('Shwe Spa and Wellness')),
    'business name must appear in page content',
  )

  // Applying with a brief that has issues returns the unchanged workspace.
  const badBrief = { ...brief, businessName: '' }
  assert.equal(applyWebsiteStarterBrief(workspace, badBrief, CAPTURED_AT), workspace, 'invalid brief must not modify the workspace')

  // Applying on a touched workspace also returns it unchanged.
  assert.equal(applyWebsiteStarterBrief(applied, brief, CAPTURED_AT), applied, 'brief must not apply over a modified workspace')
})

test('an edit session round-trips a site-name change and detects stale sessions', () => {
  const workspace = createInitialWorkspace()
  const session = createWebsiteEditSession(workspace)
  assert.ok(websiteEditSessionMatches(session, workspace), 'a fresh session must match its source workspace')

  // Apply a valid change: update the site name.
  const result = updateWebsiteEditSession(session, (ws) => ({ ...ws, siteName: 'Mandalay Wellness' }))
  assert.ok(result.ok, `update failed: ${result.ok ? '' : result.error}`)
  assert.ok(result.changed, 'changing the site name must mark the session as changed')

  // The updated session still matches the original workspace (base revision unchanged).
  assert.ok(websiteEditSessionMatches(result.session, workspace))

  // Commit the session back to the workspace.
  const committed = commitWebsiteEditSession(workspace, result.session)
  assert.equal(committed.siteName, 'Mandalay Wellness')

  // A session that started on an older workspace no longer matches after any content change.
  const changed = commitWebsiteEditSession(workspace, result.session)
  const session2 = createWebsiteEditSession(changed)
  assert.ok(!websiteEditSessionMatches(session, changed), 'a session must not match a newer workspace')
  assert.throws(
    () => commitWebsiteEditSession(changed, session),
    /changed after this edit session/,
  )
  // The newer session does match.
  assert.ok(websiteEditSessionMatches(session2, changed))
})

test('pageIssues surfaces missing fields and passes on a complete seeded page', () => {
  const workspace = createInitialWorkspace()

  // Every seeded page must be clean.
  for (const page of workspace.pages) {
    const issues = pageIssues(page)
    assert.deepEqual(issues, [], `seeded page ${page.id} must have no issues, saw ${JSON.stringify(issues)}`)
  }

  // A page missing a headline must report the issue.
  const noHeadline = { ...workspace.pages[0], hero: { ...workspace.pages[0].hero, headline: '' } }
  assert.ok(pageIssues(noHeadline).some((issue) => /headline/i.test(issue)), 'missing headline must be reported')

  // A page with a CTA label but no href (or vice versa) must report the issue.
  const halfCta = { ...workspace.pages[0], hero: { ...workspace.pages[0].hero, ctaLabel: 'Book now', ctaHref: '' } }
  assert.ok(pageIssues(halfCta).some((issue) => /CTA/i.test(issue)), 'incomplete CTA must be reported')

  // A page with no sections must report the issue.
  const noSections = { ...workspace.pages[0], sections: [] }
  assert.ok(pageIssues(noSections).some((issue) => /section/i.test(issue)), 'missing sections must be reported')
})

test('normalizeSlug, createBlankPage, and duplicatePage behave correctly', () => {
  // normalizeSlug: root is preserved, trailing slash is stripped, whitespace is trimmed.
  assert.equal(normalizeSlug('/'), '/')
  assert.equal(normalizeSlug('/about'), '/about')
  assert.equal(normalizeSlug('/services/'), '/services')
  assert.equal(normalizeSlug('  /contact  '), '/contact')

  // createBlankPage: produces a draft page at the expected slug.
  const blank = createBlankPage(3)
  assert.ok(blank.id.startsWith('page-'), 'blank page id must start with page-')
  assert.equal(blank.slug, '/untitled-3')
  assert.equal(blank.stage, 'draft')
  assert.equal(blank.navigation.visible, false)
  assert.deepEqual(blank.sections, [])

  // duplicatePage: copies content but assigns a new id and slug, resets to draft.
  const source = createInitialWorkspace().pages[0]
  const dupe = duplicatePage(source, 7)
  assert.notEqual(dupe.id, source.id, 'duplicated page must have a fresh id')
  assert.equal(dupe.slug, '/copy-7')
  assert.equal(dupe.stage, 'draft')
  assert.equal(dupe.navigation.visible, false)
  assert.ok(dupe.internalName.includes('copy'), 'duplicated page name must include copy')
  assert.equal(dupe.sections.length, source.sections.length, 'all sections must be carried over')
  assert.ok(
    dupe.sections.every((s, i) => s.id !== source.sections[i].id),
    'duplicated sections must have fresh ids',
  )
})

test('evidence and approval workflow requires all checks to pass before approval is accepted', () => {
  const workspace = createInitialWorkspace()
  const capturedAt = CAPTURED_AT

  // Approval must be blocked before any evidence is recorded.
  assert.throws(
    () => approveWebsiteRevision(workspace, {
      actionId: 'ACT-APPROVE-001',
      capturedAt,
      reviewer: 'Founder',
      note: 'Approved for launch.',
    }),
    /readiness check/i,
  )

  // Record all required evidence kinds.
  let ws = workspace
  for (const req of evidenceRequirements) {
    ws = recordWebsiteEvidence(ws, {
      actionId: `ACT-EVIDENCE-${req.id.toUpperCase()}`,
      capturedAt,
      kind: req.id,
      finding: `Reviewed ${req.id} — passed.`,
      reference: `REVIEW-${req.id.toUpperCase()}-001`,
      verifiedBy: 'Founder',
    })
    assert.ok(ws, `evidence for ${req.id} must record`)
  }

  // Idempotent replay returns the same workspace.
  const replay = recordWebsiteEvidence(ws, {
    actionId: `ACT-EVIDENCE-${evidenceRequirements[0].id.toUpperCase()}`,
    capturedAt,
    kind: evidenceRequirements[0].id,
    finding: `Reviewed ${evidenceRequirements[0].id} — passed.`,
    reference: `REVIEW-${evidenceRequirements[0].id.toUpperCase()}-001`,
    verifiedBy: 'Founder',
  })
  assert.equal(replay, ws, 'idempotent evidence replay must return the same workspace')

  // All evidence readiness checks must now pass.
  const checks = readinessChecks(ws)
  const evidenceChecks = checks.filter((check) => check.id.startsWith('evidence-'))
  assert.ok(evidenceChecks.every((check) => check.passed), 'all evidence checks must pass after recording evidence')

  // Approval must now succeed.
  const approved = approveWebsiteRevision(ws, {
    actionId: 'ACT-APPROVE-001',
    capturedAt,
    reviewer: 'Founder',
    note: 'Approved for launch.',
  })
  assert.ok(approved !== ws, 'approval must produce a new workspace')
  assert.equal(approved.approvals.length, 1)
  assert.equal(approved.approvals[0].reviewer, 'Founder')

  // Approving again returns the same workspace (current approval already present).
  const reApproved = approveWebsiteRevision(approved, {
    actionId: 'ACT-APPROVE-002',
    capturedAt,
    reviewer: 'Founder',
    note: 'Second approval attempt.',
  })
  assert.equal(reApproved, approved, 'approval when one is already current must return unchanged workspace')
})

test('createBlankSection, workspaceFingerprint, getCurrentEvidence, and getCurrentApproval behave correctly', () => {
  const capturedAt = CAPTURED_AT

  // createBlankSection: returns a blank section with an id prefixed 'section-'.
  const section = createBlankSection()
  assert.ok(section.id.startsWith('section-'), 'blank section id must start with section-')
  assert.equal(section.eyebrow, '')
  assert.equal(section.title, '')
  assert.equal(section.body, '')

  // workspaceFingerprint: stable for the same workspace, changes when content changes.
  const workspace = createInitialWorkspace()
  const fp1 = workspaceFingerprint(workspace)
  assert.ok(fp1.startsWith('web-'), 'fingerprint must start with web-')
  assert.equal(workspaceFingerprint(workspace), fp1, 'fingerprint must be deterministic')
  const modified = { ...workspace, siteName: 'Changed Site Name' }
  assert.notEqual(workspaceFingerprint(modified), fp1, 'fingerprint must change when siteName changes')

  // getCurrentEvidence: empty on a fresh workspace; populated after recording all requirements.
  assert.deepEqual(getCurrentEvidence(workspace), [], 'no evidence on a fresh workspace')
  assert.equal(getCurrentApproval(workspace), null, 'no approval on a fresh workspace')

  let ws = workspace
  for (const req of evidenceRequirements) {
    ws = recordWebsiteEvidence(ws, {
      actionId: `ACT-EVIDENCE-UTIL-${req.id.toUpperCase()}`,
      capturedAt,
      kind: req.id,
      finding: `Checked ${req.id} — passed.`,
      reference: `REVIEW-UTIL-${req.id.toUpperCase()}`,
      verifiedBy: 'Founder',
    })
  }
  const evidence = getCurrentEvidence(ws)
  assert.equal(evidence.length, evidenceRequirements.length, 'all evidence must be current')

  // getCurrentApproval: null before approval, non-null after.
  assert.equal(getCurrentApproval(ws), null, 'no approval before approveWebsiteRevision')
  const approved = approveWebsiteRevision(ws, {
    actionId: 'ACT-APPROVE-UTIL-001',
    capturedAt,
    reviewer: 'Founder',
    note: 'Utility test approval.',
  })
  const approval = getCurrentApproval(approved)
  assert.ok(approval !== null, 'approval must be present after approveWebsiteRevision')
  assert.equal(approval.reviewer, 'Founder')

  // After modifying the workspace, the evidence and approval are no longer current.
  const touched = { ...approved, siteName: 'New Name After Approval' }
  assert.deepEqual(getCurrentEvidence(touched), [], 'evidence must be empty after content change')
  assert.equal(getCurrentApproval(touched), null, 'approval must be null after content change')
})

test('websiteSource, isReplaceableWebsiteSampleWorkspace, restoreWebsiteEditSession, createWebsiteArtifact, createWebsitePreviewArtifact, and getCurrentPublish behave correctly', () => {
  const workspace = createInitialWorkspace()
  const fp = workspaceFingerprint(workspace)

  // websiteSource: reflects contentRevision and fingerprint.
  const source = websiteSource(workspace)
  assert.equal(source.contentRevision, 0)
  assert.equal(source.digest, fp)

  // isReplaceableWebsiteSampleWorkspace: false for initial workspace (no working sample marker).
  assert.equal(isReplaceableWebsiteSampleWorkspace(workspace), false)

  // After installWebsiteWorkingSample, the workspace becomes replaceable.
  const installed = installWebsiteWorkingSample(workspace, {
    templateId: websiteStarterTemplates[0].id,
    businessName: 'Test Business',
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed)
  assert.equal(isReplaceableWebsiteSampleWorkspace(installed), true)

  // restoreWebsiteEditSession: null for invalid input; valid session for a created session.
  assert.equal(restoreWebsiteEditSession(null), null)
  assert.equal(restoreWebsiteEditSession('not-json'), null)
  assert.equal(restoreWebsiteEditSession({}), null)
  const session = createWebsiteEditSession(workspace)
  const restored = restoreWebsiteEditSession(session)
  assert.ok(restored !== null)
  assert.equal(restored.baseRevision, 0)
  assert.equal(restored.baseContentRevision, 0)
  assert.equal(restored.baseFingerprint, fp)
  // Also works from a serialized JSON string.
  const restoredFromJson = restoreWebsiteEditSession(JSON.stringify(session))
  assert.ok(restoredFromJson !== null)
  assert.equal(restoredFromJson.baseRevision, 0)

  // createWebsiteArtifact: all ready pages from the initial workspace.
  const artifact = createWebsiteArtifact(workspace)
  assert.equal(artifact.schema, 'supermega.website.artifact.v1')
  assert.equal(artifact.siteName, workspace.siteName)
  assert.ok(artifact.contentDigest.startsWith('site-'))
  assert.equal(artifact.pages.length, workspace.pages.filter((p) => p.stage === 'ready').length)

  // createWebsitePreviewArtifact: includes all pages regardless of stage.
  const preview = createWebsitePreviewArtifact(workspace)
  assert.equal(preview.schema, 'supermega.website.artifact.v1')
  assert.equal(preview.pages.length, workspace.pages.length)

  // getCurrentPublish: null when no publish has been recorded.
  assert.equal(getCurrentPublish(workspace), null)
})

test('WEBSITE_SCHEMA, MAX_WEBSITE_PAGES, previewDevices, createId, isCurrentApproval, isCurrentPublish, and formatTimestamp behave correctly', () => {
  // Constants have expected values.
  assert.equal(WEBSITE_SCHEMA, 'supermega.website.workspace.v2')
  assert.equal(WEBSITE_STORAGE_KEY, 'supermega.website.workspace.v2')
  assert.equal(MAX_WEBSITE_PAGES, 4)
  assert.equal(MAX_WEBSITE_SECTIONS, 4)

  // previewDevices: three entries covering desktop, tablet, and mobile.
  assert.equal(previewDevices.length, 3)
  assert.ok(previewDevices.some((d) => d.id === 'desktop'))
  assert.ok(previewDevices.some((d) => d.id === 'mobile'))

  // createId: returns a string starting with the given prefix.
  const id = createId('pg')
  assert.ok(id.startsWith('pg-'))
  // Two calls produce different IDs.
  assert.notEqual(createId('pg'), createId('pg'))

  // isCurrentApproval: no approvals in the initial workspace → false for undefined.
  const workspace = createInitialWorkspace()
  assert.equal(isCurrentApproval(undefined, workspace), false)

  // isCurrentPublish: no publishes in the initial workspace → false for undefined.
  assert.equal(isCurrentPublish(undefined, workspace), false)

  // formatTimestamp: valid ISO string produces a non-empty, non-'Unknown time' result.
  const formatted = formatTimestamp('2026-07-23T08:00:00.000Z')
  assert.equal(typeof formatted, 'string')
  assert.notEqual(formatted, 'Unknown time')

  // Invalid input → 'Unknown time'.
  assert.equal(formatTimestamp('not-a-date'), 'Unknown time')
  assert.equal(formatTimestamp(''), 'Unknown time')
})

test('restoreWorkspace and recordWebsiteSnapshot behave correctly', () => {
  const workspace = createInitialWorkspace()

  // restoreWorkspace: valid workspace returns itself.
  const restored = restoreWorkspace(workspace)
  assert.ok(restored !== null)
  assert.equal(restored.schema, workspace.schema)

  // null / unknown value returns null.
  assert.equal(restoreWorkspace(null), null)
  assert.equal(restoreWorkspace({}), null)
  assert.equal(restoreWorkspace('not-a-workspace'), null)

  // recordWebsiteSnapshot: throws when no current approval exists.
  assert.throws(() => recordWebsiteSnapshot(workspace, {
    actionId: 'ACT-SNAP-001',
    capturedAt: CAPTURED_AT,
  }))
})

test('applyWebsiteWorkspaceUpdate and importWebsitePageDrafts behave correctly', () => {
  const workspace = createInitialWorkspace()

  // Legacy and secondary storage key constants are defined strings.
  assert.equal(typeof LEGACY_WEBSITE_STORAGE_KEY, 'string')
  assert.ok(LEGACY_WEBSITE_STORAGE_KEY.length > 0)

  // A no-op update returns ok: true with changed: false.
  const noOp = applyWebsiteWorkspaceUpdate(workspace, (w) => w)
  assert.ok(noOp.ok)
  if (noOp.ok) assert.equal(noOp.changed, false)

  // An update that sets revision directly is rejected.
  const badRevision = applyWebsiteWorkspaceUpdate(workspace, (w) => ({ ...w, revision: 9999 }))
  assert.equal(badRevision.ok, false)

  // importWebsitePageDrafts returns null for null input.
  assert.equal(importWebsitePageDrafts(workspace, null), null)

  // importWebsitePageDrafts returns null when pages array is empty.
  assert.equal(
    importWebsitePageDrafts(workspace, {
      siteName: 'Test Site',
      pages: [],
      sourceDigest: 'sha256:' + 'a'.repeat(64),
      capturedAt: '2026-07-23T08:00:00.000Z',
    }),
    null,
  )
})
