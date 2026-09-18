import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createInitialWorkspace, createWebsitePreviewArtifact } from '../showroom/src/products/website/website-model.ts'
import { buildWebsiteHtml } from '../showroom/src/products/website/website-export.ts'
import { applyWebsiteStarterBrief, websiteStarterTemplates } from '../showroom/src/products/website/website-starter.ts'

const capturedAt = '2026-09-18T00:00:00.000Z'
const brief = { businessName: 'Example Studio', audience: 'local businesses', offer: 'Print design for local businesses', proof: 'Owner-supplied description for review.', contactHref: '' }
const expected = {
  'business-presence': { slug: '/about', label: 'Ask about our business', need: 'which service or information' },
  'lead-generation': { slug: '/services', label: 'Discuss your requirements', need: 'scope of the work' },
  'catalog-showcase': { slug: '/catalog', label: 'Ask about an item', need: 'preferred variant' },
}
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
  assert.match(source, /const SAMPLE_BRIEF:[\s\S]*?contactHref: ''/)
  assert.doesNotMatch(source, /https:\/\/m\.me\/mingalarfreshmart/)
})
