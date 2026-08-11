import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commitWebsiteEditSession,
  createInitialWorkspace,
  createWebsiteEditSession,
  pageIssues,
  readinessChecks,
  updateWebsiteEditSession,
  websiteEditSessionMatches,
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

function contentChecks(workspace) {
  return readinessChecks(workspace).filter((check) => CONTENT_CHECK_IDS.includes(check.id))
}

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
