import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const onboardingSource = await readFile('showroom/src/core/ProductOnboardingPage.tsx', 'utf8')
const onboardingStyles = await readFile('showroom/src/core/core-app.css', 'utf8')
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const requiredOnboardingCopy = [
  'Pick your business type',
  'Load starter data or import your services/products',
  'Take one sale',
  'Reconcile payment and close day',
  'Cash, KBZPay, WavePay, AYA Pay, or MMQR',
  'Beauty spa for the first spa pilot',
  'Yangon Wellness Spa',
  'Use the current starter sample',
]

for (const copy of requiredOnboardingCopy) {
  check(onboardingSource.includes(copy), `Shop onboarding includes first-run copy: ${copy}`)
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
  onboardingStyles.includes('grid-template-columns: 28px minmax(0,1fr)'),
  'first-run steps render as a compact numbered mobile-friendly list',
)
check(
  !/\b09\d{5,}\b/.test(onboardingSource),
  'public onboarding source does not expose a private payment phone number',
)
check(
  packageJson.scripts['shop:onboarding:first-run:verify'] === 'node tools/test_shop_onboarding_first_run_path.mjs',
  'package exposes the Shop first-run onboarding verifier',
)
console.log(JSON.stringify({ ok: true, checks, contract: 'supermega.shop.onboarding_first_run_path.v1' }))
