import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createInitialWorkspace, createWebsitePreviewArtifact, restoreWorkspace, createWebsiteEditSession, updateWebsiteEditSession, commitWebsiteEditSession, mutateWebsiteWorkspace, loadWebsiteWorkspace } from '../showroom/src/products/website/website-model.ts'
import { buildWebsiteHtml } from '../showroom/src/products/website/website-export.ts'
import { applyWebsiteStarterBrief, installWebsiteWorkingSample, websiteStarterTemplateManifest, websiteStarterTemplateManifests, websiteStarterTemplates } from '../showroom/src/products/website/website-starter.ts'
import { websiteTradeBrief, websiteTradeBriefOptions } from '../showroom/src/products/website/website-trade-brief.ts'

const capturedAt = '2026-09-18T00:00:00.000Z'
const brief = { businessName: 'Example Studio', audience: 'local businesses', offer: 'Print design for local businesses', proof: 'Owner-supplied description for review.', contactHref: '' }
test('Sites layouts resolve through portable manifests with only supported customer-facing slots', () => {
  assert.equal(websiteStarterTemplateManifests.manifests.length, websiteStarterTemplates.length)
  for (const template of websiteStarterTemplates) {
    const manifest = websiteStarterTemplateManifest(template.id)
    assert.equal(manifest.id, `sites-${template.id}`)
    assert.equal(manifest.version, 'v1')
    assert.deepEqual(manifest.capabilities, ['website.presence', 'website.inquiries'])
    assert.equal(manifest.slots.identity, true)
    assert.equal(manifest.slots.content, true)
  }
  assert.equal(websiteStarterTemplateManifest('catalog-showcase').slots.catalog, true)
  assert.equal(websiteStarterTemplateManifest('lead-generation').slots.services, true)
  assert.equal(websiteStarterTemplateManifest('business-presence').slots.catalog, undefined)
})

const expected = {
  'business-presence': { slug: '/about', label: 'Ask about our business', need: 'which service or information' },
  'lead-generation': { slug: '/services', label: 'Discuss your requirements', need: 'scope of the work' },
  'catalog-showcase': { slug: '/catalog', label: 'Ask about an item', need: 'preferred variant' },
}

test('business brief stays unsaved until commit and survives reload without release evidence', async () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const locks = { request: async (_name, _options, callback) => callback() }
  const loaded = loadWebsiteWorkspace(storage)
  assert.equal(loaded.ok, true)
  const staged = updateWebsiteEditSession(createWebsiteEditSession(loaded.workspace), current =>
    applyWebsiteStarterBrief(current, { ...brief, templateId: 'business-presence' }, capturedAt))
  assert.equal(staged.ok, true)
  assert.equal(staged.changed, true)
  assert.equal(values.size, 0, 'preparing content must not silently save it')
  const saved = await mutateWebsiteWorkspace(current => commitWebsiteEditSession(current, staged.session),
    loaded.workspace.revision, loaded.workspace.contentRevision, storage, locks)
  assert.equal(saved.ok, true)
  assert.equal(saved.changed, true)
  const reloaded = loadWebsiteWorkspace(storage)
  assert.equal(reloaded.ok, true)
  assert.deepEqual(reloaded.workspace, saved.workspace)
  assert.equal(reloaded.workspace.siteName, brief.businessName)
  assert.ok(reloaded.workspace.pages.every(page => page.stage === 'draft'))
  assert.equal(reloaded.workspace.approvals.length, 0)
  assert.equal(reloaded.workspace.localPublishes.length, 0)
  const beforeRetry = new Map(values)
  const stale = await mutateWebsiteWorkspace(current => commitWebsiteEditSession(current, staged.session),
    loaded.workspace.revision, loaded.workspace.contentRevision, storage, locks)
  assert.equal(stale.ok, false, 'a stale setup tab cannot overwrite the saved revision')
  assert.deepEqual(values, beforeRetry)
})

test('business brief save reports denied storage rather than claiming persistence', async () => {
  const loaded = createInitialWorkspace()
  const staged = updateWebsiteEditSession(createWebsiteEditSession(loaded), current =>
    applyWebsiteStarterBrief(current, { ...brief, templateId: 'lead-generation' }, capturedAt))
  assert.equal(staged.ok, true)
  const storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable') } }
  const locks = { request: async (_name, _options, callback) => callback() }
  const result = await mutateWebsiteWorkspace(current => commitWebsiteEditSession(current, staged.session),
    0, 0, storage, locks)
  assert.equal(result.ok, false)
  assert.match(result.error, /write failed/)
  assert.equal(loadWebsiteWorkspace(storage).workspace.siteName, loaded.siteName)
})
test('reviewed menu and service entries become exported content without invented prices', () => {
  for (const template of websiteStarterTemplates) {
    const output = applyWebsiteStarterBrief(createInitialWorkspace(), { ...brief, templateId: template.id, offerings: 'လက်ဖက်ရည် | 2,000 MMK, hot or iced\nConsultation | 30 minutes; price confirmed on inquiry\n<script> | Owner text <b>not markup</b>' }, capturedAt)
    const page = output.pages.find(page => page.slug === expected[template.id].slug)
    assert.equal(page.sections.length, 3)
    assert.equal(page.sections[0].title, 'လက်ဖက်ရည်')
    assert.equal(page.sections[0].body, '2,000 MMK, hot or iced')
    assert.equal(page.sections[1].body, '30 minutes; price confirmed on inquiry')
    const html = buildWebsiteHtml(createWebsitePreviewArtifact(output))
    assert.ok(html.includes('2,000 MMK, hot or iced'))
    assert.ok(html.includes('&lt;b&gt;not markup&lt;/b&gt;'))
    assert.ok(html.includes('&lt;script&gt;'))
    assert.equal(page.stage, 'draft')
    assert.equal(output.localPublishes.length, 0)
  }
})

test('invalid offering input fails closed instead of dropping entries or replacing existing work', () => {
  for (const offerings of ['Missing separator', ' | details', 'Name | ', 'x'.repeat(81) + ' | details', 'Name | ' + 'x'.repeat(361), Array(5).fill('Item | detail').join('\n')]) {
    const original = createInitialWorkspace()
    assert.equal(applyWebsiteStarterBrief(original, { ...brief, templateId: 'lead-generation', offerings }, capturedAt), original)
  }
})

test('four featured offerings retain exact content and export after a storage round trip', () => {
  for (const template of websiteStarterTemplates) {
    const offerings = [
      'လက်ဖက်ရည် | 2,000 MMK; ask about ingredients',
      'Consultation | 30 minutes; price confirmed on inquiry',
      'A'.repeat(80) + ' | ' + 'B'.repeat(360),
      'Seasonal selection | Availability confirmed by the business',
    ].join('\r\n')
    const workspace = applyWebsiteStarterBrief(createInitialWorkspace(), { ...brief, templateId: template.id, offerings }, capturedAt)
    const restored = restoreWorkspace(JSON.parse(JSON.stringify(workspace)))
    assert.ok(restored, 'generated content must satisfy the actual persistence schema')
    assert.deepEqual(restored, workspace)
    const page = restored.pages.find(item => item.slug === expected[template.id].slug)
    assert.equal(page.sections.length, 4)
    assert.equal(new Set(page.sections.map(section => section.id)).size, 4)
    assert.equal(buildWebsiteHtml(createWebsitePreviewArtifact(restored)), buildWebsiteHtml(createWebsitePreviewArtifact(workspace)))
    assert.equal(applyWebsiteStarterBrief(restored, { ...brief, templateId: template.id, offerings: 'Replacement | Must not overwrite' }, capturedAt), restored)
  }
})
for (const template of websiteStarterTemplates) {
  test(`${template.id}: useful distinct output without invented business commitments`, () => {
    const original = createInitialWorkspace()
    const before = JSON.stringify(original)
    const output = applyWebsiteStarterBrief(original, { ...brief, templateId: template.id }, capturedAt)
    assert.equal(JSON.stringify(original), before)
    const secondary = output.pages.find(page => page.slug === expected[template.id].slug)
    assert.ok(secondary)
    assert.equal(secondary.hero.ctaLabel, expected[template.id].label)
    assert.equal(secondary.hero.ctaHref, '/contact')
    assert.equal(secondary.sections.length, 3)
    assert.equal(secondary.sections[0].body, brief.proof)
    assert.equal(new Set(secondary.sections.map(section => section.id)).size, 3)
    assert.ok(secondary.sections[1].body.includes(expected[template.id].need))
    const contact = output.pages.find(page => page.slug === '/contact')
    assert.equal(contact.hero.ctaHref, '')
    assert.equal(contact.hero.ctaLabel, '')
    assert.ok(contact.sections[0].body.includes(expected[template.id].need))
    assert.ok(output.pages.every(page => page.stage === 'draft'))
    assert.deepEqual(output.approvals, original.approvals)
    assert.deepEqual(output.localPublishes, original.localPublishes)
    assert.doesNotMatch(JSON.stringify(output.pages), /m\.me\/mingalarfreshmart|guaranteed|24.hour response|free shipping/i)
    assert.deepEqual(applyWebsiteStarterBrief(original, { ...brief, templateId: template.id }, capturedAt), output)
    const html = buildWebsiteHtml(createWebsitePreviewArtifact(output))
    assert.ok(html.includes(expected[template.id].label))
    assert.ok(html.includes(expected[template.id].need))
    assert.ok(html.includes('href="#contact"'))
    assert.ok(html.includes('id="contact"'))
  })
  test(`${template.id}: Myanmar content and hostile markup survive safe HTML export`, () => {
    const output = applyWebsiteStarterBrief(createInitialWorkspace(), { ...brief, templateId: template.id, businessName: 'မင်္ဂလာ Studio', proof: '<img src=x onerror=alert(1)> is supplied text, not verified proof.' }, capturedAt)
    const html = buildWebsiteHtml(createWebsitePreviewArtifact(output))
    assert.ok(html.includes('မင်္ဂလာ Studio'))
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
    assert.doesNotMatch(html, /<img src=x/)
  })
}
test('explicit owner contact is preserved and existing work cannot be replaced', () => {
  const input = { ...brief, templateId: 'lead-generation', contactHref: 'https://example.com/contact' }
  const output = applyWebsiteStarterBrief(createInitialWorkspace(), input, capturedAt)
  assert.equal(output.pages.find(page => page.slug === '/services').hero.ctaHref, input.contactHref)
  assert.equal(output.pages.find(page => page.slug === '/contact').hero.ctaHref, input.contactHref)
  assert.equal(applyWebsiteStarterBrief(output, { ...input, businessName: 'Replacement' }, capturedAt), output)
})
test('operator starter does not prefill an unrelated business contact', () => {
  const source = readFileSync(new URL('../showroom/src/products/website/WebsiteStarterSetup.tsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../showroom/src/products/website/website-product.css', import.meta.url), 'utf8')
  for (const field of ['businessName', 'audience', 'offer', 'proof', 'contactHref']) {
    assert.match(source, new RegExp(`const EMPTY_BRIEF:[\\s\\S]*?${field}: ''`))
  }
  assert.doesNotMatch(source, /https:\/\/m\.me\/mingalarfreshmart/)
  assert.ok(source.includes('What should customers know before contacting you?'))
  assert.ok(source.includes('Tell us about the business'))
  assert.ok(source.includes('SuperMega will prepare the pages, wording and navigation.'))
  assert.ok(source.includes('Create website'))
  assert.ok(!source.includes('Choose business type'))
  assert.ok(!source.includes('View example'))
  assert.ok(!source.includes('onViewSample'))
  assert.ok(!source.includes('type="file"'))
  assert.ok(!source.includes('Preview only.'))
  assert.ok(!source.includes('Website example'))
  assert.ok(source.includes('Use accurate public details, such as opening hours or service areas.'))
  assert.doesNotMatch(source, /Why should customers trust it\?|same-day neighborhood delivery/)
  assert.match(styles, /\.website-starter-setup input,[\s\S]*?min-height: 2\.75rem;[\s\S]*?font-size: 1rem;/)
  assert.match(styles, /\.website-starter-setup \.website-button \{[\s\S]*?font-size: \.875rem;/)
})

test('business brief opens the real page-review workspace and keeps publish explicit', () => {
  const source = readFileSync(new URL('../showroom/src/products/website/WebsiteProduct.tsx', import.meta.url), 'utf8')
  const handoff = source.slice(source.indexOf('function startWithBusiness'), source.indexOf('function openStarterSetup'))
  assert.ok(handoff.includes("openContentSurface('work')"))
  assert.ok(!handoff.includes("openContentSurface('preview')"))
  assert.ok(source.includes("? 'Ready' : 'Review'"))
  assert.ok(source.includes('Mark ready & next'))
  assert.ok(source.includes("if (nextDraftPage) setSelectedPageId(nextDraftPage.id)"))
  assert.ok(!readFileSync(new URL('../showroom/src/products/website/ContentWorkspace.tsx', import.meta.url), 'utf8').includes('Mark page ready'))
})

test('all trade outputs give useful inquiry guidance without asserting business operations', () => {
  const expectations = {
    'mini-mart': 'shopping list', pharmacy: 'qualified pharmacist',
    'phone-electronics': 'device model', fashion: 'measurements', hardware: 'specification',
    'tea-coffee': 'ingredients', 'auto-parts': 'part number', restaurant: 'party size',
    'beauty-spa': 'cancellation terms', bakery: 'allergens',
  }
  assert.deepEqual(websiteTradeBriefOptions().map(row => row.id).sort(), Object.keys(expectations).sort())
  for (const { id } of websiteTradeBriefOptions()) {
    const drafted = websiteTradeBrief({ tradeId: id, businessName: 'Example Business' })
    const site = applyWebsiteStarterBrief(createInitialWorkspace(), drafted, capturedAt)
    assert.equal(site.siteName, 'Example Business', `${id}: draft accepted`)
    const html = buildWebsiteHtml(createWebsitePreviewArtifact(site))
    assert.ok(html.includes(expectations[id]), `${id}: actionable customer requirements`)
    assert.doesNotMatch(html, /reorder levels|counted daily|tracked per size|reserved rather than|actually being baked|what we can actually hand over|nothing is lost|same-day neighborhood delivery/i)
    assert.equal(site.pages[0].sections[0].eyebrow, 'Business details')
    assert.ok(site.pages.every(page => page.stage === 'draft'))
    assert.deepEqual(site.localPublishes, [])
  }
})

test('working samples never imply connected stock or guaranteed request handling', () => {
  for (const { id } of websiteStarterTemplates) {
    const sample = installWebsiteWorkingSample(createInitialWorkspace(), { templateId: id, businessName: 'Example Studio', capturedAt })
    assert.ok(sample)
    const html = buildWebsiteHtml(createWebsitePreviewArtifact(sample))
    assert.doesNotMatch(html, /nothing is lost|same record the team works from|what we can supply|one shared record|every request is tracked/i)
    assert.ok(html.includes('Business details'))
    assert.deepEqual(sample.localPublishes, [])
  }
})
