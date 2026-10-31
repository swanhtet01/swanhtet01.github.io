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
  'Add your products or services',
  'Enter actual prices and opening stock, or import your catalog.',
  'Take one sale',
  'Reconcile payment and close day',
  'Cash, KBZPay, WavePay, AYA Pay, or MMQR',
  'What kind of business?',
  'Choose a business type',
  'Yangon Wellness Spa',
  'Add your own products, prices and opening stock.',
]

for (const copy of requiredOnboardingCopy) {
  check(onboardingSource.includes(copy), `Shop onboarding includes first-run copy: ${copy}`)
}

for (const internalCopy of ['Shop pilot proof rule', 'Spa services vertical pack:', 'accepted order-to-close runs', 'Paid pilot only after']) {
  check(!onboardingSource.includes(internalCopy), `Internal pilot criteria stay out of customer setup: ${internalCopy}`)
}

for (const retiredSampleCopy of ['Load starter data or import your services/products', 'Use the current starter sample']) {
  check(!onboardingSource.includes(retiredSampleCopy), `retired sample-first onboarding stays absent: ${retiredSampleCopy}`)
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
  onboardingStyles.includes('.product-onboarding-path li { display: grid; grid-template-columns: 1.75rem minmax(0,1fr);')
    && onboardingStyles.includes('.product-onboarding-path li > span { display: grid; place-items: center; width: var(--space-6); height: var(--space-6);'),
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
console.log(JSON.stringify({ ok: true, checks, contract: 'supermega.shop.onboarding_first_run_path.v1' }))
