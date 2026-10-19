import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const onboardingSource = await readFile('showroom/src/core/ProductOnboardingPage.tsx', 'utf8')
const onboardingStyles = await readFile('showroom/src/core/core-app.css', 'utf8')
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const startGuidedWorkspaceSource = onboardingSource.slice(
  onboardingSource.indexOf('async function startGuidedWorkspace'),
  onboardingSource.indexOf('function recordGuidedSetupRequest'),
)
const managedShopStartSource = startGuidedWorkspaceSource.slice(
  startGuidedWorkspaceSource.indexOf('if (managedCommerce)'),
  startGuidedWorkspaceSource.indexOf('if (managedProduction)'),
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const requiredOnboardingCopy = [
  'Pick your business type',
  'Add your products or services',
  'import your catalog',
  'Take one sale',
  'Reconcile payment and close day',
  'Cash, KBZPay, WavePay, AYA Pay, or MMQR',
  'What kind of business?',
  'Shops and trades',
  'Service businesses',
  'Yangon Wellness Spa',
  'Add your own products, prices and opening stock.',
]

for (const copy of requiredOnboardingCopy) {
  check(onboardingSource.includes(copy), `Shop onboarding includes first-run copy: ${copy}`)
}

for (const internalCopy of ['Shop pilot proof rule', 'Spa services vertical pack:', 'accepted order-to-close runs', 'Paid pilot only after']) {
  check(!onboardingSource.includes(internalCopy), `Internal pilot criteria stay out of customer setup: ${internalCopy}`)
}

check(
  onboardingSource.includes('aria-label={`${onboardingProduct.name} first-run path`}'),
  'first-run path is labelled for assistive technology',
)
check(
  onboardingSource.includes('className="product-onboarding-path"'),
  'first-run path has a stable class for styling and regression checks',
)
check(
  onboardingStyles.includes('.product-onboarding-path'),
  'first-run path has dedicated compact styling',
)
check(
  onboardingStyles.includes('.product-onboarding-proof'),
  'Shop pilot proof has dedicated compact styling',
)
check(
  onboardingStyles.includes('grid-template-columns: 1.75rem minmax(0,1fr)'),
  'first-run steps render as a compact numbered mobile-friendly list',
)
check(
  onboardingStyles.includes('.product-onboarding-proof ul { grid-template-columns: 1fr; }'),
  'Shop pilot proof metrics stack on mobile',
)
check(
  !/\b09\d{5,}\b/.test(onboardingSource),
  'public onboarding source does not expose a private payment phone number',
)
check(
  packageJson.scripts['shop:onboarding:first-run:verify'] === 'node tools/test_shop_onboarding_first_run_path.mjs',
  'package exposes the Shop first-run onboarding verifier',
)
check(
  managedShopStartSource.includes('navigate(onboardingJourney.firstTaskPath)'),
  'the first managed generic or service Shop submit reaches the existing catalog surface',
)
check(
  !managedShopStartSource.includes('managedShopOnboardingNotice'),
  'the first managed generic or service Shop submit does not stop at a notice',
)
check(
  managedShopStartSource.includes('navigate(shopBusinessTemplateManagedCatalogPath(selectedBusinessTemplate.id))'),
  'a named Shop template keeps its explicit reviewed-catalog route',
)
check(
  !/provisionLocalShopBusinessTemplateSample|installCommerceWorkingSampleCatalog|mutateCommerceWorkspace/.test(managedShopStartSource),
  'the managed first submit does not write catalog or sample records',
)
console.log(JSON.stringify({ ok: true, checks, contract: 'supermega.shop.onboarding_first_run_path.v1' }))
