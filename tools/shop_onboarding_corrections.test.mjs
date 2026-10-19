import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const setupModuleUrl = `${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'product-setup.ts')).href}?shop-onboarding-corrections`
const previewRuntimeUrl = pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'client-import-preview-runtime.ts')).href
const shopChoiceModuleUrl = pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'shop-business-choice.ts')).href
const shopTemplatesModuleUrl = pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'shop', 'business-templates.ts')).href
const shopPacksModuleUrl = pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'shop-service-scheduling.ts')).href
const signupModuleUrl = pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'signup-trial.ts')).href
const {
  PRODUCT_SETUP_REGISTRY_KEY,
  normalizeShopBusinessChoiceId,
  readProductSetup,
  rememberProductSetup,
  resolveSetupVariantDoor,
  setupHasProgress,
  seedSetupForProduct,
  templateFor,
} = await import(setupModuleUrl)
const { resolveClientImportPreviewIfCurrent } = await import(previewRuntimeUrl)
const {
  SHOP_BUSINESS_CHOICE_IDS,
  requestedShopBusinessChoiceFromSearch,
  shopIndustryPackIdForBusinessChoice,
} = await import(shopChoiceModuleUrl)
const [{ shopBusinessChoiceFromIndustryPack, shopBusinessTemplates }, { shopIndustryPacks, shopIndustryPack }, { signupBusinessChoices }] = await Promise.all([
  import(shopTemplatesModuleUrl),
  import(shopPacksModuleUrl),
  import(signupModuleUrl),
])
const shopPickerChoices = signupBusinessChoices(shopBusinessTemplates, shopIndustryPacks)
const sourceOwnedShopBusinessChoiceIds = new Set([
  ...shopPickerChoices.map((choice) => choice.id),
  ...shopIndustryPacks.map((pack) => shopBusinessChoiceFromIndustryPack(pack.id)),
])
const onboardingSource = await readFile(resolve(root, 'showroom', 'src', 'core', 'ProductOnboardingPage.tsx'), 'utf8')
const setupSource = await readFile(resolve(root, 'showroom', 'src', 'core', 'product-setup.ts'), 'utf8')
const shopChoiceSource = await readFile(resolve(root, 'showroom', 'src', 'core', 'shop-business-choice.ts'), 'utf8')
const importSource = await readFile(resolve(root, 'showroom', 'src', 'core', 'ClientDataOnboarding.tsx'), 'utf8')

const validShopBusinessChoiceIds = SHOP_BUSINESS_CHOICE_IDS

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)) },
    raw: () => values,
  }
}

function shopSetup(overrides = {}) {
  return {
    ...seedSetupForProduct('commerce'),
    workspace: 'Hnin’s Spa',
    owner: 'Daw Hnin',
    ...overrides,
  }
}

function deferred() {
  let resolve
  const promise = new Promise((complete) => { resolve = complete })
  return { promise, resolve }
}

test('an actual Shop business choice survives a query-free reload through the setup registry', () => {
  const storage = fakeStorage()
  assert.equal(rememberProductSetup(storage, shopSetup({ businessChoiceId: 'pack:gym' }), validShopBusinessChoiceIds), true)

  const reloaded = readProductSetup(storage, 'commerce', validShopBusinessChoiceIds)
  assert.equal(reloaded.businessChoiceId, 'pack:gym')
  const withoutQuery = resolveSetupVariantDoor(reloaded.businessChoiceId, null, true)
  assert.equal(withoutQuery.activeId, 'pack:gym')
  assert.equal(withoutQuery.choiceRequired, false)
})

test('a fresh seeded setup does not block a valid business-choice deep link', () => {
  const fresh = seedSetupForProduct('commerce')
  assert.equal(setupHasProgress(fresh), false)
  assert.equal(setupHasProgress({ ...fresh, entryPoint: 'Walk-in' }), false)
  assert.equal(setupHasProgress({ ...fresh, workspace: 'Hnin’s Spa' }), true)

  const requestedChoice = requestedShopBusinessChoiceFromSearch('?product=shop&pack=gym')
  const firstVisit = resolveSetupVariantDoor('', requestedChoice, setupHasProgress(fresh))
  assert.equal(firstVisit.activeId, 'pack:gym')
  assert.equal(firstVisit.choiceRequired, false)
})

test('legacy setup remains readable and invalid saved or requested choice ids are rejected', () => {
  const storage = fakeStorage()
  assert.equal(rememberProductSetup(storage, shopSetup(), validShopBusinessChoiceIds), true)
  const legacy = readProductSetup(storage, 'commerce', validShopBusinessChoiceIds)
  assert.equal(Object.hasOwn(legacy, 'businessChoiceId'), false)

  const registry = JSON.parse(storage.raw().get(PRODUCT_SETUP_REGISTRY_KEY))
  registry.commerce.businessChoiceId = 'trade:not-a-shop-template'
  storage.raw().set(PRODUCT_SETUP_REGISTRY_KEY, JSON.stringify(registry))
  const invalidSaved = readProductSetup(storage, 'commerce', validShopBusinessChoiceIds)
  assert.equal(Object.hasOwn(invalidSaved, 'businessChoiceId'), false)
  assert.equal(normalizeShopBusinessChoiceId('pack:not-a-service-pack', validShopBusinessChoiceIds), undefined)
})

test('a Shop deep link cannot replace a saved business choice without an explicit choice', () => {
  const requestedChoice = requestedShopBusinessChoiceFromSearch('?product=shop&pack=gym')
  const saved = resolveSetupVariantDoor('trade:mini-mart', requestedChoice, true)
  assert.equal(saved.activeId, 'trade:mini-mart')
  assert.equal(saved.requestedId, 'pack:gym')
  assert.equal(saved.choiceRequired, true)

  const newSetup = resolveSetupVariantDoor('', requestedChoice, false)
  assert.equal(newSetup.activeId, 'pack:gym')
  assert.equal(newSetup.choiceRequired, false)

  assert.match(onboardingSource, /readProductSetup\(window\.localStorage, 'commerce', SHOP_BUSINESS_CHOICE_IDS\)/)
  assert.match(onboardingSource, /resolveSetupVariantDoor\(\s*savedShopBusinessChoiceId,\s*requestedShopBusinessChoiceId,\s*Boolean\(savedShopSetup\),\s*\)/)
  assert.match(onboardingSource, /aria-label="Shop business type choice"/)
})

test('saved and requested choices use the same validated source-owned ids', () => {
  assert.match(setupSource, /normalizeShopBusinessChoiceId\(source\.businessChoiceId, validShopBusinessChoiceIds\)/)
  assert.deepEqual([...validShopBusinessChoiceIds].sort(), [...sourceOwnedShopBusinessChoiceIds].sort())
  assert.match(shopChoiceSource, /shopBusinessChoiceFromIndustryPack\(pack\.id\)/)
  assert.match(onboardingSource, /businessChoiceId: normalizeShopBusinessChoiceId\(businessChoiceId, SHOP_BUSINESS_CHOICE_IDS\)/)
  assert.match(onboardingSource, /rememberProductSetup\(window\.localStorage, setup, SHOP_BUSINESS_CHOICE_IDS\)/)
  assert.match(onboardingSource, /shopIndustryPack\(\s*shopIndustryPackIdForBusinessChoice\(businessChoiceId\) \?\? shopIndustryPackId,\s*\)/)
})

test('all real Shop pack links canonicalize and require an explicit choice over saved progress', () => {
  const pickerIds = shopPickerChoices.map((choice) => choice.id)
  assert.equal(new Set(pickerIds).size, pickerIds.length)
  assert.equal(pickerIds.includes('pack:spa'), false)
  assert.equal(pickerIds.includes('pack:cafe'), false)
  assert.equal(validShopBusinessChoiceIds.has('pack:spa'), false)
  assert.equal(validShopBusinessChoiceIds.has('pack:cafe'), true)

  assert.equal(requestedShopBusinessChoiceFromSearch('?pack=spa'), 'trade:beauty-spa')
  assert.equal(requestedShopBusinessChoiceFromSearch('?pack=restaurant'), 'trade:restaurant')
  assert.equal(requestedShopBusinessChoiceFromSearch('?pack=cafe'), 'pack:cafe')

  for (const pack of shopIndustryPacks) {
    const requested = requestedShopBusinessChoiceFromSearch(`?product=shop&pack=${pack.id}`)
    const canonical = shopBusinessChoiceFromIndustryPack(pack.id)
    assert.equal(requested, canonical, `${pack.id} pack URL uses its canonical choice`)
    assert.equal(validShopBusinessChoiceIds.has(canonical), true, `${canonical} is source-owned`)
    assert.equal(shopIndustryPackIdForBusinessChoice(requested), pack.id)

    const savedChoice = [...validShopBusinessChoiceIds].find((choiceId) => choiceId !== requested)
    assert.ok(savedChoice)
    const protectedSavedChoice = resolveSetupVariantDoor(savedChoice, requested, true)
    assert.equal(protectedSavedChoice.activeId, savedChoice)
    assert.equal(protectedSavedChoice.requestedId, requested)
    assert.equal(protectedSavedChoice.choiceRequired, true)
  }
})

test('Gym and School choices restore pack, workflow, entry point, and timestamps without local schedules', () => {
  for (const packId of ['gym', 'school']) {
    const pack = shopIndustryPacks.find((candidate) => candidate.id === packId)
    assert.ok(pack)
    const storage = fakeStorage()
    const choiceId = `pack:${pack.id}`
    const setup = {
      ...seedSetupForProduct('commerce', pack.workflowTemplateId),
      workspace: `${pack.name} workspace`,
      owner: 'Daw Hnin',
      entryPoint: pack.entryPoint,
      businessChoiceId: choiceId,
      startedAt: `${pack.id}-started`,
      savedAt: `${pack.id}-saved`,
    }

    assert.equal(rememberProductSetup(storage, setup, validShopBusinessChoiceIds), true)
    const reloaded = readProductSetup(storage, 'commerce', validShopBusinessChoiceIds)
    assert.ok(reloaded)
    const legacyLocalPackId = 'retail'
    const restoredPackId = shopIndustryPackIdForBusinessChoice(reloaded.businessChoiceId) ?? legacyLocalPackId
    const restoredPack = shopIndustryPack(restoredPackId)

    assert.equal(restoredPackId, pack.id)
    assert.equal(reloaded.businessChoiceId, choiceId)
    assert.equal(restoredPack.workflowTemplateId, pack.workflowTemplateId)
    assert.equal(reloaded.templateId, templateFor('commerce', pack.workflowTemplateId).id)
    assert.equal(restoredPack.entryPoint, pack.entryPoint)
    assert.equal(reloaded.entryPoint, pack.entryPoint)
    assert.equal(reloaded.startedAt, setup.startedAt)
    assert.equal(reloaded.savedAt, setup.savedAt)
    assert.equal(
      reloaded.templateId !== templateFor('commerce', restoredPack.workflowTemplateId).id
        || reloaded.entryPoint !== restoredPack.entryPoint,
      false,
      'the setup synchronization effect has no mismatch that would clear saved timestamps',
    )
  }
})

test('deferred variant digests are discarded after clear, newer request, or route change', async (t) => {
  const scenarios = [
    ['clear', (request) => { request.id += 1 }],
    ['new request', (request) => { request.id += 1 }],
    ['product route change', (request) => { request.product = 'production' }],
    ['workflow route change', (request) => { request.workflow = 'service-appointments' }],
  ]

  for (const [label, invalidate] of scenarios) {
    await t.test(label, async () => {
      const request = { id: 7, product: 'commerce', workflow: 'retail-wholesale' }
      const digest = deferred()
      let committed = false
      const shopPreviewWork = (async () => ({
        previewDigest: await digest.promise,
      }))()
      const pending = resolveClientImportPreviewIfCurrent(
        shopPreviewWork,
        () => request.id === 7
          && request.product === 'commerce'
          && request.workflow === 'retail-wholesale',
      )

      invalidate(request)
      digest.resolve('sha256:stale-preview')
      const result = await pending
      if (result) committed = true

      assert.equal(result, null)
      assert.equal(committed, false)
    })
  }
})

test('the component rechecks request ownership before restoring a preview and preserves approval reset', () => {
  const previewFlow = importSource.slice(
    importSource.indexOf('async function runPreview'),
    importSource.indexOf('async function chooseFile'),
  )
  const digestWait = previewFlow.indexOf('await resolveClientImportPreviewIfCurrent(')
  const staleReturn = previewFlow.indexOf('if (!shopPreview || !isCurrentRequest()) return', digestWait)
  const previewCommit = previewFlow.indexOf('setState({ ...emptyImportState(), sourceName, sourceText, preview, catalogReview })', staleReturn)

  assert.match(previewFlow, /const isCurrentRequest = \(\) => requestRef\.current === requestId\s+&& productRef\.current === expectedProduct\s+&& workflowTemplateRef\.current === expectedWorkflowTemplateId/)
  assert.ok(previewFlow.indexOf('validationRequestRef.current += 1') < digestWait)
  assert.ok(digestWait >= 0 && staleReturn > digestWait && previewCommit > staleReturn)
})
