// Drift guard for docs/demo-playbooks/ and docs/pilot-kit/. Every backticked
// token in a playbook or pilot-kit document is a verbatim contract: it must
// exist in the app source (showroom/src), the public-site generator
// (tools/create_public_vercel_output.mjs), the site manifest, or package.json —
// or be derivable from a pattern that is itself pinned here (product-
// parameterised links the generator or app builds at runtime). Pilot-kit
// documents additionally ground against the managed-pilot readiness kernel and
// ledger, the portfolio work order, the sales-agent guide, and the pilot
// handoff generator plus the deterministic baseline/launch gate packet tools.
// If a route, query parameter, button label, copy string, or contract field
// drifts, this test fails and the document must be re-grounded.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n')

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function collectSourceFiles(relativeDir, out) {
  for (const entry of readdirSync(resolve(root, relativeDir), { withFileTypes: true })) {
    const relativePath = `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) collectSourceFiles(relativePath, out)
    else if (/\.(?:ts|tsx|css)$/.test(entry.name)) out.push(relativePath)
  }
  return out
}

const corpusPaths = [
  'tools/create_public_vercel_output.mjs',
  'site-manifest.json',
  'package.json',
  ...collectSourceFiles('showroom/src', []),
]
const corpus = corpusPaths.map(read).join('\n')
const manifest = JSON.parse(read('site-manifest.json'))
const generator = read('tools/create_public_vercel_output.mjs')
const productSetup = read('showroom/src/core/product-setup.ts')
const accountRoutes = read('showroom/src/core/account-routes.ts')
const packageManifest = JSON.parse(read('package.json'))

// Derived tokens: parameterised URLs and labels the sources build at runtime.
// Each derivation is guarded by the exact source pattern that produces it.
const derived = new Set()

check(manifest.release?.productionDomain === 'https://supermega.dev', 'manifest_production_domain')
check(generator.includes('href="/contact/?product=${escapeHtml(product.id)}"'), 'generator_contact_product_link_pattern')
check(generator.includes('https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}'), 'generator_guided_sample_link_pattern')
// eslint-disable-next-line no-template-curly-in-string
check(generator.includes('Set up ${product.name} data'), 'generator_setup_label_pattern')
check(generator.includes('/contact/?product=guide&amp;source=managed-intelligence'), 'generator_managed_pilot_link')
derived.add('/contact/?product=guide&source=managed-intelligence')

check(productSetup.includes("utm_medium: 'guided_trial'")
  && productSetup.includes('return `https://supermega.dev/contact/?${query.toString()}`'), 'app_contact_url_builder_pattern')
check(productSetup.includes('/settings/?product=${encodeURIComponent(productContracts[product].slug)}'), 'app_guided_setup_path_pattern')
check(accountRoutes.includes("template: 'managed-account'"), 'account_contact_template_pattern')

for (const product of manifest.customerProducts) {
  check(product.appRoute === `https://app.supermega.dev/${product.id}/`, `manifest_app_route:${product.id}`)
  derived.add(`/contact/?product=${product.id}`)
  derived.add(`/settings/?product=${product.id}`)
  derived.add(`https://app.supermega.dev/settings/?product=${product.id}`)
  derived.add(`Set up ${product.name} data`)
  for (const template of product.templates ?? []) {
    derived.add(`https://supermega.dev/contact/?product=${product.id}&template=${template.id}&utm_source=app&utm_medium=guided_trial`)
  }
  derived.add(`https://supermega.dev/contact/?product=${product.id}&template=managed-account&utm_source=app&utm_medium=guided_trial`)
}
derived.add('https://supermega.dev/contact/?product=guide&template=managed-account&utm_source=app&utm_medium=guided_trial')

const origins = ['https://app.supermega.dev', 'https://supermega.dev']

function tokenOk(token) {
  if (derived.has(token) || corpus.includes(token)) return true
  for (const origin of origins) {
    if (token === origin) return true
    if (token.startsWith(origin)) {
      const rest = token.slice(origin.length)
      if (rest && (derived.has(rest) || corpus.includes(rest))) return true
    }
  }
  return false
}

const playbookDir = 'docs/demo-playbooks'
const files = readdirSync(resolve(root, playbookDir)).sort()
check(files.join(',') === 'README.md,ecommerce.md,plant.md,shop.md,website.md', `playbook_file_set:${files.join(',')}`)

const requiredSections = [
  '## 1. Client and the 30-second pitch',
  '## 2. Pre-demo setup',
  '## 3. Demo script',
  '## 4. Objection handling: the boundary',
  '## 5. The close',
]

for (const file of files) {
  const text = read(`${playbookDir}/${file}`)
  const tokens = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1])
  check(tokens.length >= 5, `${file}:token_floor:${tokens.length}`)
  for (const token of tokens) check(tokenOk(token), `${file}:unknown_token:${token}`)
  if (file === 'README.md') continue
  for (const section of requiredSections) check(text.includes(section), `${file}:section_missing:${section}`)
  const script = text.split('## 3. Demo script')[1]?.split('## 4.')[0] ?? ''
  const steps = script.split('\n').filter((line) => /^\d+\.\s/.test(line.trim()))
  check(steps.length >= 5 && steps.length <= 10, `${file}:demo_step_count:${steps.length}`)
}

const shopPlaybook = read(`${playbookDir}/shop.md`)
for (const required of [
  'bottom task bar',
  'camera scanning',
  'keyboard-wedge/search path',
  'product photos are device-local',
  'points chip',
  'display-only',
  'Paid & handed over',
  'Android phone smoke pass',
  'rehearsal evidence only',
  'not hosted pilot proof',
  'shop:android-smoke:packet',
]) {
  check(shopPlaybook.includes(required), `shop_playbook_w2_coverage:${required}`)
}
check(packageManifest.scripts['shop:android-smoke:packet'] === 'node tools/prepare_shop_android_smoke_packet.mjs', 'shop_android_smoke_packet_script')
check(packageManifest.scripts['shop:android-smoke:self-test'] === 'node --test tools/prepare_shop_android_smoke_packet.test.mjs && node tools/prepare_shop_android_smoke_packet.mjs --self-test', 'shop_android_smoke_self_test_script')
check(packageManifest.scripts['demo:playbooks:verify'] === 'node tools/test_demo_playbooks.mjs && npm run shop:android-smoke:self-test', 'demo_playbooks_runs_shop_android_smoke')

const readme = read(`${playbookDir}/README.md`)
for (const name of ['shop.md', 'plant.md', 'website.md', 'ecommerce.md']) {
  check(readme.includes(name), `readme_indexes:${name}`)
}

// docs/pilot-kit/: the Shop design-partner pilot kit. Same token discipline,
// with an extended corpus: the readiness kernel and ledger, the portfolio work
// order, the sales-agent guide, and the pilot handoff generator. Reading each
// source also proves the cited file path exists, so those paths become tokens.
const kitSourcePaths = [
  'kernel/managed-pilot-readiness.mjs',
  'hq/readiness/managed-pilot-readiness.json',
  'hq/portfolio.json',
  'docs/supermega-shop-sales-agent.md',
  'tools/create_shop_pilot_handoff.mjs',
  'tools/prepare_shop_pilot_baseline_packet.mjs',
  'tools/prepare_shop_pilot_day0_readiness_packet.mjs',
  'tools/record_shop_pilot_observed_run.mjs',
  'tools/verify_shop_pilot_launch_gate.mjs',
]
const kitCorpus = kitSourcePaths.map(read).join('\n')
const kitDerived = new Set(kitSourcePaths)
const kitTokenOk = (token) => kitDerived.has(token) || kitCorpus.includes(token) || tokenOk(token)

// Pins for the contract facts the kit states in prose: the production
// activation decision, its four founder inputs, its non-expiring production
// target, the five-day duration, the review-date closure rule, and the
// no-payment commercial draft.
const readinessKernel = read('kernel/managed-pilot-readiness.mjs')
check(readinessKernel.includes("const NEXT_ACTION_DECISION_ID = 'managed-production-activation'"), 'kit_kernel_decision_id_pin')
check(readinessKernel.includes("const NEXT_ACTION_REQUIREMENTS = ['approve_runtime_role_provisioning', 'approve_first_named_owner_identity', 'approve_exact_production_release', 'approve_managed_activation_window']"), 'kit_kernel_decision_inputs_pin')
check(readinessKernel.includes('maximumLifetimeHours: null'), 'kit_kernel_lifetime_pin')
check(readinessKernel.includes("environment: 'production'"), 'kit_kernel_environment_pin')
const handoffGenerator = read('tools/create_shop_pilot_handoff.mjs')
check(handoffGenerator.includes('durationDays: 5'), 'kit_handoff_duration_pin')
check(handoffGenerator.includes("throw new Error('review_date_must_close_five_day_plan')"), 'kit_handoff_review_date_pin')
check(handoffGenerator.includes('paymentAccepted: false'), 'kit_handoff_no_payment_pin')
const observedRunRecorder = read('tools/record_shop_pilot_observed_run.mjs')
check(observedRunRecorder.includes('evidenceReferenceDigest')
  && observedRunRecorder.includes('independentAnchorDigest')
  && observedRunRecorder.includes('shop_observed_evidence_anchor_digest_not_independent'), 'kit_observed_run_receipt_anchor_pin')

const kitDir = 'docs/pilot-kit'
const kitFiles = readdirSync(resolve(root, kitDir)).sort()
check(kitFiles.join(',') === 'README.md,acceptance-checklist.md,baseline-measurement.md,pilot-agreement-outline.md', `pilot_kit_file_set:${kitFiles.join(',')}`)

for (const file of kitFiles) {
  const text = read(`${kitDir}/${file}`)
  const tokens = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1])
  check(tokens.length >= 5, `pilot-kit/${file}:token_floor:${tokens.length}`)
  for (const token of tokens) check(kitTokenOk(token), `pilot-kit/${file}:unknown_token:${token}`)
}

const kitReadme = read(`${kitDir}/README.md`)
check(kitReadme.includes('managed-production-activation'), 'pilot_kit_readme_names_decision_id')
for (const name of ['baseline-measurement.md', 'acceptance-checklist.md', 'pilot-agreement-outline.md']) {
  check(kitReadme.includes(name), `pilot_kit_readme_indexes:${name}`)
}

const kitBaseline = read(`${kitDir}/baseline-measurement.md`)
for (const fieldName of ['weekly_orders', 'median_minutes_per_order', 'weekly_exception_count', 'close_minutes_per_day', 'client_import_row_count', 'weekly_package_sales', 'weekly_treatment_redemptions', 'median_minutes_per_redemption', 'weekly_package_correction_count']) {
  check(kitBaseline.includes(`\`${fieldName}\``), `pilot_kit_baseline_field:${fieldName}`)
}
const baselineLintCommand = 'npm.cmd run shop:pilot:baseline-packet -- --lint-input "<private-baseline-input.json>"'
const baselineGenerateCommand = 'npm.cmd run shop:pilot:baseline-packet -- --input "<private-baseline-input.json>" --output "<owner-safe-baseline-packet.json>" --markdown-output "<owner-safe-baseline-packet.md>"'
const baselineVerifyCommand = 'npm.cmd run shop:pilot:baseline-packet -- --verify "<owner-safe-baseline-packet.json>"'
const launchGateReportCommand = 'npm.cmd run shop:pilot:launch-gate -- --baseline-packet "<owner-safe-baseline-packet.json>" --intake-packet "<owner-safe-intake-packet.json>" --output "<owner-safe-launch-gate-report.json>"'
const launchGateVerifyCommand = 'npm.cmd run shop:pilot:launch-gate:verify -- --verify-report "<owner-safe-launch-gate-report.json>"'
const day0ReleaseBoundCommand = 'npm.cmd run shop:pilot:day0-readiness -- --launch-gate-report "<owner-safe-launch-gate-report.json>" --release-handoff "<release-handoff.json>" --github-protection-snapshot "<github-protection-snapshot.json>" --output "<owner-safe-day0-packet.json>" --markdown-output "<owner-safe-day0-packet.md>"'
check(kitBaseline.includes(baselineLintCommand), 'pilot_kit_baseline_lint_command')
check(kitBaseline.includes('`baseline_input_ready`'), 'pilot_kit_baseline_lint_ready_status')
check(kitBaseline.indexOf(baselineLintCommand) >= 0
  && kitBaseline.indexOf(baselineLintCommand) < kitBaseline.indexOf(baselineGenerateCommand), 'pilot_kit_baseline_lint_before_generate')
check(kitBaseline.includes('do not generate or hand-edit the owner-safe packet'), 'pilot_kit_baseline_no_hand_edit')
check(kitBaseline.includes(baselineVerifyCommand), 'pilot_kit_baseline_verify_command')
check(kitBaseline.indexOf(baselineGenerateCommand) >= 0
  && kitBaseline.indexOf(baselineGenerateCommand) < kitBaseline.indexOf(baselineVerifyCommand), 'pilot_kit_baseline_generate_before_verify')
check(kitBaseline.includes(launchGateReportCommand), 'pilot_kit_launch_gate_report_command')
check(kitBaseline.includes(launchGateVerifyCommand), 'pilot_kit_launch_gate_verify_command')
check(kitBaseline.includes(day0ReleaseBoundCommand), 'pilot_kit_day0_release_bound_command')
check(kitReadme.includes('must include the current release handoff plus GitHub protection snapshot'), 'pilot_kit_readme_day0_release_binding')

const kitAcceptance = read(`${kitDir}/acceptance-checklist.md`)
for (const measurement of ['median_minutes_per_order', 'weekly_exception_rate', 'close_minutes_per_day', 'operator_corrections', 'reload_and_retry_result', 'client_import_minutes', 'package_sale_minutes', 'treatment_redemption_minutes', 'package_balance_result']) {
  check(kitAcceptance.includes(`\`${measurement}\``), `pilot_kit_acceptance_measurement:${measurement}`)
}
for (const gateName of ['isolatedNonProductionTenantApproved', 'namedOperatorAuthorized', 'pilotDataHandlingApproved', 'ownerReviewedCommercialDraft']) {
  check(kitAcceptance.includes(`\`${gateName}\``), `pilot_kit_acceptance_gate:${gateName}`)
}
for (const receiptAnchorToken of ['evidenceReferenceDigest', 'independentAnchorDigest', 'client:pilot:observed-evidence:template', 'client:pilot:observed-evidence:validate', 'client:pilot:observed-evidence']) {
  check(kitAcceptance.includes(`\`${receiptAnchorToken}\``), `pilot_kit_acceptance_receipt_anchor:${receiptAnchorToken}`)
}
check(kitAcceptance.includes('If either digest is missing, reused, or equal to the other digest, the run does not count.'), 'pilot_kit_acceptance_digest_pair_fail_closed')

check(read(`${kitDir}/pilot-agreement-outline.md`).includes('NOT LEGAL ADVICE'), 'pilot_kit_agreement_disclaimer')

console.log(JSON.stringify({ ok: true, contract: 'supermega_demo_playbooks', playbooks: files.length, pilotKitDocs: kitFiles.length, checks }))
