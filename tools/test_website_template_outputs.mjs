import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createInitialWorkspace, createWebsitePreviewArtifact, restoreWorkspace } from '../showroom/src/products/website/website-model.ts'
import { buildWebsiteHtml } from '../showroom/src/products/website/website-export.ts'
import { applyWebsiteStarterBrief, installWebsiteWorkingSample, websiteStarterTemplates } from '../showroom/src/products/website/website-starter.ts'
import { websiteTradeBrief, websiteTradeBriefOptions } from '../showroom/src/products/website/website-trade-brief.ts'

const capturedAt = '2026-09-18T00:00:00.000Z'
const brief = { businessName: 'Example Studio', audience: 'local businesses', offer: 'Print design for local businesses', proof: 'Owner-supplied description for review.', contactHref: '' }
const expected = {
  'business-presence': { slug: '/about', label: 'Ask about our business', need: 'which service or information' },
  'lead-generation': { slug: '/services', label: 'Discuss your requirements', need: 'scope of the work' },
  'catalog-showcase': { slug: '/catalog', label: 'Ask about an item', need: 'preferred variant' },
}
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
  assert.match(source, /const SAMPLE_BRIEF:[\s\S]*?contactHref: ''/)
  assert.doesNotMatch(source, /https:\/\/m\.me\/mingalarfreshmart/)
  assert.ok(source.includes('What should customers know before contacting you?'))
  assert.ok(source.includes('Tell us the basics. We prepare the Website.'))
  assert.ok(source.includes('SuperMega drafts a private three-page Website for your review'))
  assert.ok(source.includes('Prepare private draft'))
  assert.ok(source.includes('View example'))
  assert.ok(source.includes('Review the suggested wording against the actual business.'))
  assert.doesNotMatch(source, /Why should customers trust it\?|same-day neighborhood delivery/)
  assert.match(styles, /\.website-starter-setup input,[\s\S]*?min-height: 2\.75rem;[\s\S]*?font-size: 1rem;/)
  assert.match(styles, /\.website-starter-setup \.website-button \{[\s\S]*?font-size: \.875rem;/)
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
