import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const moduleUrl = `${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'product-setup.ts')).href}?product-setup-registry-test`
const {
  PRODUCT_SETUP_REGISTRY_KEY,
  conflictingOwnerRecord,
  managedTemplateDoorRequiresReview,
  normalizeSetup,
  plantPackSaveAllowed,
  readProductSetup,
  rememberProductSetup,
  resolveSetupTemplateDoor,
  resolveSetupVariantDoor,
  seedSetupForProduct,
  setupDoorQueryAfterChoice,
  setupVariantMatchesSource,
  shopTemplateDoorState,
} = await import(moduleUrl)
const onboardingSource = await readFile(resolve(root, 'showroom', 'src', 'core', 'ProductOnboardingPage.tsx'), 'utf8')
const appBuildVerifierSource = await readFile(resolve(root, 'tools', 'verify_app_build.mjs'), 'utf8')

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

test('a Plant pack door starts a new setup on the validated requested pack', () => {
  const selection = resolveSetupVariantDoor('general-manufacturing', 'food-beverage', false)
  assert.deepEqual(selection, {
    activeId: 'food-beverage',
    requestedId: 'food-beverage',
    choiceRequired: false,
  })
})

test('a different Plant pack door protects the saved pack behind an explicit choice', () => {
  const selection = resolveSetupVariantDoor('general-manufacturing', 'food-beverage', true)
  assert.deepEqual(selection, {
    activeId: 'general-manufacturing',
    requestedId: 'food-beverage',
    choiceRequired: true,
  })
})

test('the same saved Plant pack needs no redundant choice', () => {
  const selection = resolveSetupVariantDoor('food-beverage', 'food-beverage', true)
  assert.deepEqual(selection, {
    activeId: 'food-beverage',
    requestedId: 'food-beverage',
    choiceRequired: false,
  })
})

test('resolving one compound Plant door choice preserves the other unresolved choice', () => {
  assert.equal(
    setupDoorQueryAfterChoice('plant', 'production-control', 'food-beverage', 'template'),
    'product=plant&pack=food-beverage',
  )
  assert.equal(
    setupDoorQueryAfterChoice('plant', 'production-control', 'food-beverage', 'variant'),
    'product=plant&template=production-control',
  )
  const continueSavedTemplateSource = onboardingSource.slice(
    onboardingSource.indexOf('function continueSavedTemplate()'),
    onboardingSource.indexOf('function useRequestedTemplate()'),
  )
  assert.doesNotMatch(continueSavedTemplateSource, /setPlantIndustryPackId/)
})

test('a preserved local Plant cannot be relabelled while reviewed managed setup stays separate', () => {
  assert.equal(plantPackSaveAllowed(false, 'preserved'), false)
  assert.equal(plantPackSaveAllowed(false, 'installed'), true)
  assert.equal(plantPackSaveAllowed(false, 'current'), true)
  assert.equal(plantPackSaveAllowed(true, null), true)
  assert.equal(plantPackSaveAllowed(true, 'preserved'), false)
  assert.equal(setupVariantMatchesSource('apparel', 'food-beverage'), false)
  assert.equal(setupVariantMatchesSource('apparel', 'apparel'), true)
  assert.equal(setupVariantMatchesSource('apparel', null), true)
})

test('Shop trade presentation remains neutral until local or managed identity is known', () => {
  assert.equal(shopTemplateDoorState('bakery', false, false), 'checking')
  assert.equal(shopTemplateDoorState('bakery', true, false), 'local-active')
  assert.equal(shopTemplateDoorState('bakery', false, true), 'managed-unapplied')
  assert.equal(shopTemplateDoorState(null, false, false), 'none')
})

test('only a requested trade on a ready managed Shop requires the blocking review boundary', () => {
  assert.equal(managedTemplateDoorRequiresReview(true, 'managed-ready', 'bakery'), true)
  assert.equal(managedTemplateDoorRequiresReview(true, 'managed-unprovisioned', 'bakery'), false)
  assert.equal(managedTemplateDoorRequiresReview(true, 'managed-loading', 'bakery'), false)
  assert.equal(managedTemplateDoorRequiresReview(false, 'managed-ready', 'bakery'), false)
  assert.equal(managedTemplateDoorRequiresReview(true, 'managed-ready', null), false)
})

test('Plant pack mismatch stays blocked until an explicit reviewed choice and later form submit', () => {
  for (const token of [
    'Saved Plant type protected',
    'The public door requested {pendingRequestedPlantIndustryPack.name}. Nothing has changed yet.',
    'Use {pendingRequestedPlantIndustryPack.name} for reviewed setup',
    'No Plant record or saved plant type changes until the requested pack is explicitly selected and the setup form is submitted.',
    'disabled={Boolean(pendingRequestedPlantIndustryPack)}',
    'setPlantPackChangeSelected(true)',
    'setPlantPackChangeSelected(hasSavedPlantSetup && id !== savedPlantIndustryPackId)',
    'if (pendingRequestedWorkflowTemplate || pendingRequestedPlantIndustryPack)',
    "clearSetupDoorDimension('template')",
    "clearSetupDoorDimension('variant')",
    'if (!setupVariantMatchesSource(plantIndustryPackId, linkedPlantTemplate?.industryPackId))',
    'was not provisioned or saved.',
    'if (!plantPackSaveAllowed(false, plantProvisionDisposition))',
    'Existing Plant records were kept.',
    'savePlantIndustryPackId(plantIndustryPackId, window.localStorage)',
  ]) assert.ok(onboardingSource.includes(token), `Plant pack review guard missing: ${token}`)
  assert.ok(
    onboardingSource.indexOf('if (!setupVariantMatchesSource(plantIndustryPackId, linkedPlantTemplate?.industryPackId))')
      < onboardingSource.indexOf('plantProvisionDisposition = await provisionLocalPlantWorkingSample(plantIndustryPackId, onboardingTemplate.id, workspaceOwner)'),
    'a conflicting Shop-linked Plant pack must stop before provisioning',
  )
  assert.ok(
    onboardingSource.indexOf('if (pendingRequestedWorkflowTemplate || pendingRequestedPlantIndustryPack)')
      < onboardingSource.indexOf('savePlantIndustryPackId(plantIndustryPackId, window.localStorage)'),
    'Plant pack choice must fail closed before the saved pack can change',
  )
  assert.ok(
    onboardingSource.indexOf('plantProvisionDisposition = await provisionLocalPlantWorkingSample(plantIndustryPackId, onboardingTemplate.id, workspaceOwner)')
      < onboardingSource.indexOf('if (!plantPackSaveAllowed(false, plantProvisionDisposition))')
      && onboardingSource.indexOf('if (!plantPackSaveAllowed(false, plantProvisionDisposition))')
      < onboardingSource.indexOf('savePlantIndustryPackId(plantIndustryPackId, window.localStorage)'),
    'Plant pack persistence must follow provisioning and its preserved-workspace refusal',
  )
})

test('the build verifier binds first-task readiness to both explicit setup-door choices', () => {
  for (const token of [
    'const productOnboardingWorkflowReadyContract = sourceBlock(',
    "'  const workflowReady = '",
    "'\\n  const workspaceStarted'",
    "productOnboardingWorkflowReadyContract.includes('setup.product === product')",
    "productOnboardingWorkflowReadyContract.includes('&& Boolean(setup.workspace.trim())')",
    "productOnboardingWorkflowReadyContract.includes('&& !pendingRequestedWorkflowTemplate')",
    "productOnboardingWorkflowReadyContract.includes('&& !pendingRequestedPlantIndustryPack')",
  ]) assert.ok(appBuildVerifierSource.includes(token), `first-task verifier guard missing: ${token}`)
  assert.ok(onboardingSource.includes('navigate(onboardingJourney.firstTaskPath)'), 'the reviewed setup must still open the source-owned first task')
  assert.ok(
    onboardingSource.indexOf('if (pendingRequestedWorkflowTemplate || pendingRequestedPlantIndustryPack)')
      < onboardingSource.indexOf('navigate(onboardingJourney.firstTaskPath)'),
    'unresolved public-door choices must block before first-task navigation',
  )
  assert.doesNotMatch(
    appBuildVerifierSource,
    /productOnboardingPageSource\.includes\('setup\.product === product && Boolean\(setup\.workspace\.trim\(\)\)\)'\)/,
    'the verifier must not regress to the retired one-line formatting assertion',
  )
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
