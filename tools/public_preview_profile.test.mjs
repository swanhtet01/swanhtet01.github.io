import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previewProfile, validatePreviewContact, validatePreviewLinks, validatePreviewDeployment } from './public_preview_profile.mjs'
const commit = 'a'.repeat(40)
const app = { origin: 'https://megaos-123456789-swanhtet01s-projects.vercel.app',
  projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG', deploymentId: 'dpl_12345678', commit }
const policy = previewProfile({ profile: 'isolated-pair', expectedCommit: commit, appBinding: JSON.stringify(app) })
const products = ['shop', 'website', 'ecommerce', 'plant'].map(id => ({ id }))
const html = `<a href="${app.origin}/shop/?tab=today">Shop</a><a href="${app.origin}/settings/?product=website">Website</a><a href="${app.origin}/settings/?product=ecommerce">Ecommerce</a>`
test('requires explicit profile, exact SHA and app binding', () => {
  for (const input of [{}, { profile: 'isolated-pair', expectedCommit: commit },
    { profile: 'isolated-pair', expectedCommit: 'main' }, { profile: 'unknown', expectedCommit: commit }]) assert.throws(() => previewProfile(input))
  assert.throws(() => previewProfile({ profile: 'isolated-pair', expectedCommit: commit, appBinding: JSON.stringify({ ...app, commit: 'b'.repeat(40) }) }))
})
test('paired active actions exclude Plant and production escapes', () => {
  assert.equal(validatePreviewLinks(html, policy, products).activeProducts.length, 3)
  for (const wrong of [html.replace('?tab=today', '?tab=counter'), html.replace(app.origin, 'https://app.supermega.dev'),
    html + '<a href="/plant/">Plant</a>', html + '<a href="/settings/?product=production">Setup</a>',
    html.replace(app.origin, 'https://other.vercel.app')]) assert.throws(() => validatePreviewLinks(wrong, policy, products))
})
test('isolated contact cannot accept while production contract still requires acceptance', () => {
  const contact = { service: 'supermega-contact', status: 'attention', accepting: false,
    controls: { idempotency: 'required', edge_rate_limit: 'required' } }
  validatePreviewContact(contact, policy)
  const production = previewProfile({ profile: 'production-contract', expectedCommit: commit })
  assert.throws(() => validatePreviewContact(contact, production))
  const accepting = { ...contact, status: 'ready', accepting: true }
  validatePreviewContact(accepting, production)
  assert.throws(() => validatePreviewContact(accepting, policy))
})
test('provider readback must bind exact immutable app identity', () => {
  const deployed = { id: app.deploymentId, projectId: app.projectId, url: app.origin.slice(8), readyState: 'READY', target: null, meta: { githubCommitSha: commit } }
  validatePreviewDeployment(deployed, app)
  for (const bad of [{ ...deployed, target: 'production' }, { ...deployed, projectId: 'other' },
    { ...deployed, url: 'megaos.vercel.app' }, { ...deployed, meta: {} }, { ...deployed, id: 'other' },
    { ...deployed, target: undefined }, { ...deployed, target: {} }, { ...deployed, target: 'custom' }]) {
    assert.throws(() => validatePreviewDeployment(bad, app), /binding_mismatch/)
  }
})
test('rejects extra escape links even when all good actions remain', () => {
  for (const href of ['https://evil.example/shop/', 'https://supermega.dev/shop/', '//app.supermega.dev/shop/',
    `${app.origin.replace('https://', 'https://user@')}/shop/?tab=today`, `${app.origin}/shop/?tab=wrong`,
    'javascript:alert(1)', '&#47;&#47;app.supermega.dev/shop/', '/%70lant/', '/settings/?product=plant']) {
    assert.throws(() => validatePreviewLinks(html + `<A HREF='${href}'>Open</A>`, policy, products,
      { publicOrigin: 'https://public-preview.example' }), undefined, href)
  }
})
test('all-page mode permits informational tombstone but not a retired tool action', () => {
  const options = { requireActions: false, publicOrigin: 'https://public-preview.example' }
  validatePreviewLinks('<h1>Plant retained records</h1><a href="/#products">View current products</a>', policy, products, options)
  assert.throws(() => validatePreviewLinks(`<a href="${app.origin}/plant/">Open retained workspace</a>`, policy, products, options))
  validatePreviewLinks('<a href="mailto:swanhtet@supermega.dev">Contact</a>', policy, products, options)
})
