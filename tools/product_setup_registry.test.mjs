import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const moduleUrl = `${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'product-setup.ts')).href}?product-setup-registry-test`
const {
  PRODUCT_SETUP_REGISTRY_KEY,
  conflictingOwnerRecord,
  normalizeSetup,
  readProductSetup,
  rememberProductSetup,
  resolveSetupTemplateDoor,
  seedSetupForProduct,
} = await import(moduleUrl)

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)) },
    raw: () => values,
  }
}

function completeSetup(product, overrides = {}) {
  return {
    ...seedSetupForProduct(product),
    workspace: 'Nine Yards Bakery',
    owner: 'Dara Okonkwo',
    currentRecord: 'Paper order book',
    baseline: 'Twelve orders a day',
    targetOutcome: 'Every order reconciled by close',
    authorityBoundary: 'Owner approves refunds',
    acceptanceEvidence: 'Five days of reconciled closes',
    startedAt: '2026-08-13T06:00:00.000Z',
    ...overrides,
  }
}

test('a saved setup round-trips through the registry', () => {
  const storage = fakeStorage()
  assert.equal(rememberProductSetup(storage, completeSetup('commerce')), true)
  const read = readProductSetup(storage, 'commerce')
  assert.equal(read.workspace, 'Nine Yards Bakery')
  assert.equal(read.owner, 'Dara Okonkwo')
  assert.equal(read.startedAt, '2026-08-13T06:00:00.000Z')
})

test('each product keeps its own setup without clobbering the others', () => {
  const storage = fakeStorage()
  rememberProductSetup(storage, completeSetup('commerce'))
  rememberProductSetup(storage, completeSetup('production', { workspace: 'Nine Yards Kitchen' }))
  assert.equal(readProductSetup(storage, 'commerce').workspace, 'Nine Yards Bakery')
  assert.equal(readProductSetup(storage, 'production').workspace, 'Nine Yards Kitchen')
  assert.equal(readProductSetup(storage, 'website'), null)
})

test('a template door starts a new product on the exact requested template', () => {
  const current = completeSetup('commerce')
  const selection = resolveSetupTemplateDoor('website', current, 'catalog-showcase')
  assert.equal(selection.activeTemplate.id, 'catalog-showcase')
  assert.equal(selection.requestedTemplate?.id, 'catalog-showcase')
  assert.equal(selection.choiceRequired, false)
})

test('a different template door protects a returning product behind an explicit choice', () => {
  const current = completeSetup('website', { templateId: 'business-presence' })
  const selection = resolveSetupTemplateDoor('website', current, 'lead-generation')
  assert.equal(selection.activeTemplate.id, 'business-presence')
  assert.equal(selection.requestedTemplate?.id, 'lead-generation')
  assert.equal(selection.choiceRequired, true)
  assert.equal(current.templateId, 'business-presence')
})

test('the same saved template needs no redundant template-door choice', () => {
  const current = completeSetup('ecommerce', { templateId: 'pickup-preorder' })
  const selection = resolveSetupTemplateDoor('ecommerce', current, 'pickup-preorder')
  assert.equal(selection.activeTemplate.id, 'pickup-preorder')
  assert.equal(selection.requestedTemplate?.id, 'pickup-preorder')
  assert.equal(selection.choiceRequired, false)
})

test('an invalid template-door id never replaces or challenges saved setup', () => {
  const current = completeSetup('production', { templateId: 'quality-traceability' })
  const selection = resolveSetupTemplateDoor('production', current, 'not-a-template')
  assert.equal(selection.activeTemplate.id, 'quality-traceability')
  assert.equal(selection.requestedTemplate, null)
  assert.equal(selection.choiceRequired, false)
})

test('the company identity of one product is readable from another', () => {
  // The onboarding page prefills a client's second product from whichever
  // product they already set up, so both fields must survive the round trip.
  const storage = fakeStorage()
  rememberProductSetup(storage, completeSetup('commerce'))
  const partner = readProductSetup(storage, 'commerce')
  assert.equal(partner.workspace, 'Nine Yards Bakery')
  assert.equal(partner.owner, 'Dara Okonkwo')
})

test('an entry whose product disagrees with its registry key is dropped', () => {
  const storage = fakeStorage({
    [PRODUCT_SETUP_REGISTRY_KEY]: JSON.stringify({
      website: { ...completeSetup('commerce'), product: 'commerce' },
    }),
  })
  assert.equal(readProductSetup(storage, 'website'), null)
})

test('a malformed registry reads as empty instead of throwing', () => {
  const storage = fakeStorage({ [PRODUCT_SETUP_REGISTRY_KEY]: '{not json' })
  assert.equal(readProductSetup(storage, 'commerce'), null)
})

test('a non-object registry reads as empty', () => {
  for (const payload of ['[]', '"text"', 'null', '42']) {
    const storage = fakeStorage({ [PRODUCT_SETUP_REGISTRY_KEY]: payload })
    assert.equal(readProductSetup(storage, 'commerce'), null)
  }
})

test('an oversized stored registry is ignored rather than parsed', () => {
  const storage = fakeStorage({ [PRODUCT_SETUP_REGISTRY_KEY]: 'x'.repeat(64 * 1024 + 1) })
  assert.equal(readProductSetup(storage, 'commerce'), null)
})

test('an oversized write is refused and leaves storage untouched', () => {
  const storage = fakeStorage()
  rememberProductSetup(storage, completeSetup('commerce'))
  const stored = storage.getItem(PRODUCT_SETUP_REGISTRY_KEY)
  const refused = rememberProductSetup(storage, completeSetup('production', {
    workspace: 'y'.repeat(64 * 1024 + 1),
  }))
  assert.equal(refused, false)
  assert.equal(storage.getItem(PRODUCT_SETUP_REGISTRY_KEY), stored)
  assert.equal(readProductSetup(storage, 'production'), null)
})

test('a storage that throws on write is reported rather than surfaced', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError') },
  }
  assert.equal(rememberProductSetup(storage, completeSetup('commerce')), false)
})

test('normalizeSetup coerces non-string fields to empty strings', () => {
  const normalized = normalizeSetup({ ...seedSetupForProduct('commerce'), owner: 42, workspace: null })
  assert.equal(normalized.owner, '')
  assert.equal(normalized.workspace, '')
})

test('normalizeSetup maps the legacy plant identifier onto production', () => {
  assert.equal(normalizeSetup({ ...seedSetupForProduct('production'), product: 'plant' }).product, 'production')
})

test('normalizeSetup falls back to a known entry point', () => {
  const normalized = normalizeSetup({ ...seedSetupForProduct('commerce'), entryPoint: 'not-a-real-entry-point' })
  assert.notEqual(normalized.entryPoint, 'not-a-real-entry-point')
  assert.ok(normalized.entryPoint.length > 0)
})

test('normalizeSetup drops a blank startedAt rather than storing it', () => {
  const normalized = normalizeSetup({ ...seedSetupForProduct('commerce'), startedAt: '' })
  assert.equal('startedAt' in normalized, false)
})

test('a different accountable owner in another product is reported', () => {
  const conflict = conflictingOwnerRecord([{ product: 'production', owner: 'Dara Okonkwo' }], 'Sam Reyes')
  assert.deepEqual(conflict, { product: 'production', owner: 'Dara Okonkwo' })
})

test('a matching accountable owner reports no conflict', () => {
  assert.equal(conflictingOwnerRecord([{ product: 'production', owner: 'Dara Okonkwo' }], 'Dara Okonkwo'), null)
})

test('surrounding whitespace does not count as a different owner', () => {
  assert.equal(conflictingOwnerRecord([{ product: 'production', owner: '  Dara Okonkwo  ' }], 'Dara Okonkwo'), null)
})

test('no conflict is reported until this product names someone', () => {
  assert.equal(conflictingOwnerRecord([{ product: 'production', owner: 'Dara Okonkwo' }], ''), null)
  assert.equal(conflictingOwnerRecord([{ product: 'production', owner: 'Dara Okonkwo' }], '   '), null)
})

test('a blank owner elsewhere is not treated as a conflict', () => {
  assert.equal(conflictingOwnerRecord([{ product: 'production', owner: '   ' }], 'Sam Reyes'), null)
})

test('the first differing product is reported when several disagree', () => {
  const conflict = conflictingOwnerRecord([
    { product: 'production', owner: 'Sam Reyes' },
    { product: 'website', owner: 'Dara Okonkwo' },
  ], 'Sam Reyes')
  assert.deepEqual(conflict, { product: 'website', owner: 'Dara Okonkwo' })
})
