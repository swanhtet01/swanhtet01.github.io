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
check(generator.includes('function assistedSetupAction(product) {'), 'generator_assisted_setup_action')
check(generator.includes('const expectedHref = `/contact/?product=${encodeURIComponent(product.id)}`'), 'generator_assisted_setup_expected_href')
check(generator.includes("assert(product.secondaryCta?.label === 'Request assisted setup'"), 'generator_assisted_setup_label_guard')
check(generator.includes('assert(product.secondaryCta.url === expectedHref'), 'generator_assisted_setup_route_guard')
check(generator.includes('return { href: product.secondaryCta.url, label: product.secondaryCta.label }'), 'generator_assisted_setup_manifest_projection')
check(generator.includes('const assistedSetup = assistedSetupAction(product)'), 'generator_assisted_setup_call')
check(generator.includes('https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}'), 'generator_guided_sample_link_pattern')
// eslint-disable-next-line no-template-curly-in-string
check(!generator.includes('Set up ${product.name} data'), 'generator_retired_setup_label_absent')
check(generator.includes('/contact/?product=guide&amp;source=managed-intelligence'), 'generator_managed_pilot_link')
derived.add('/contact/?product=guide&source=managed-intelligence')

check(productSetup.includes("utm_medium: 'guided_trial'")
  && productSetup.includes('return `https://supermega.dev/contact/?${query.toString()}`'), 'app_contact_url_builder_pattern')
check(productSetup.includes('/settings/?product=${encodeURIComponent(productContracts[product].slug)}'), 'app_guided_setup_path_pattern')
check(accountRoutes.includes("template: 'managed-account'"), 'account_contact_template_pattern')

for (const product of manifest.customerProducts) {
  check(product.appRoute === `https://app.supermega.dev/${product.id}/`, `manifest_app_route:${product.id}`)
  const expectedAssistedSetupHref = `/contact/?product=${encodeURIComponent(product.id)}`
  check(product.secondaryCta?.label === 'Request assisted setup', `manifest_assisted_setup_label:${product.id}`)
  check(product.secondaryCta?.url === expectedAssistedSetupHref, `manifest_assisted_setup_route:${product.id}`)
  derived.add(product.secondaryCta.label)
  derived.add(product.secondaryCta.url)
  derived.add(`/settings/?product=${product.id}`)
  derived.add(`https://app.supermega.dev/settings/?product=${product.id}`)
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
  const productId = file.replace(/\.md$/, '')
  const product = manifest.customerProducts.find((candidate) => candidate.id === productId)
  const page = manifest.pages.find((candidate) => candidate.productId === productId)
  check(Boolean(product && page), `${file}:manifest_product_page_missing`)
  const renderedDescription = page.description || product.description
  check(text.includes(`eyebrow \`${product.eyebrow}\``), `${file}:eyebrow_drift`)
  check(text.includes(`- \`${manifest.company.statement}\``), `${file}:company_statement_drift`)
  check(text.includes(`- \`${product.headline}\``), `${file}:headline_drift`)
  check(text.includes(`- \`${renderedDescription}\``), `${file}:description_drift`)
  check(text.includes(`\`${product.secondaryCta.label}\``), `${file}:assisted_setup_label_missing`)
  check(text.includes(`\`${product.secondaryCta.url}\``), `${file}:assisted_setup_route_missing`)
  check(!text.includes(`Set up ${product.name} data`), `${file}:retired_setup_label_present`)
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
  'tools/complete_shop_pilot_baseline.mjs',
  'tools/prepare_shop_pilot_day0_readiness_packet.mjs',
  'tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs',
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

const clientReadinessBrief = read('hq/strategy/CLIENT-READINESS-BRIEF.md')
const shopStrategyBridgeDocuments = [
  ['shop_playbook', shopPlaybook.replace(/\s+/g, ' ')],
  ['pilot_kit_readme', kitReadme.replace(/\s+/g, ' ')],
  ['client_readiness_brief', clientReadinessBrief.replace(/\s+/g, ' ')],
]
const shopStrategyBridgeRequired = [
  'POS-independent Shop Profit Control',
  'public and owner first-use acquisition and diagnostic wedge',
  'selects and prioritizes one accountable money leak or operating risk',
  'shop-spa-owner-pilot remains the first bounded named vertical proof',
  "Spa is not Shop's product identity",
  'does not prove all Myanmar trades',
  'package sale, treatment redemption, daily close, and recovery',
  'measured correction effort',
  'Both paths remain owner-gated',
  'Synthetic, sample, browser-local, and local-rendered evidence cannot close the real pilot',
]
for (const [label, document] of shopStrategyBridgeDocuments) {
  for (const required of shopStrategyBridgeRequired) {
    check(document.includes(required), `${label}:shop_profit_control_spa_bridge:${required}`)
  }
  for (const forbidden of [
    "Spa is Shop's product identity",
    'Spa proves all Myanmar trades',
    'Synthetic evidence closes the real pilot',
    'Local evidence closes the real pilot',
  ]) {
    check(!document.includes(forbidden), `${label}:shop_profit_control_spa_bridge_forbidden:${forbidden}`)
  }
}

const kitBaseline = read(`${kitDir}/baseline-measurement.md`)
for (const fieldName of ['weekly_orders', 'median_minutes_per_order', 'weekly_exception_count', 'close_minutes_per_day', 'client_import_row_count', 'weekly_package_sales', 'weekly_treatment_redemptions', 'median_minutes_per_redemption', 'weekly_package_correction_count']) {
  check(kitBaseline.includes(`\`${fieldName}\``), `pilot_kit_baseline_field:${fieldName}`)
}
const baselineCompleteCommand = 'npm.cmd run shop:pilot:baseline-complete -- --input "<private-baseline-input.json>" --output-dir "<private-baseline-completion-directory>"'
const baselineCompleteVerifyCommand = 'npm.cmd run shop:pilot:baseline-complete -- --verify-dir "<private-baseline-completion-directory>"'
const intakePacketCommand = 'npm.cmd run shop:pilot:intake-packet -- --output "<owner-safe-intake-packet.json>"'
const launchGateReportCommand = 'npm.cmd run shop:pilot:launch-gate -- --baseline-packet "<private-baseline-completion-directory>/owner-safe-baseline-packet.json" --intake-packet "<owner-safe-intake-packet.json>" --output "<owner-safe-launch-gate-report.json>"'
const launchGateVerifyCommand = 'npm.cmd run shop:pilot:launch-gate:verify -- --verify-report "<owner-safe-launch-gate-report.json>"'
const day0ReleaseBoundCommand = 'npm.cmd run shop:pilot:day0-readiness -- --launch-gate-report "<owner-safe-launch-gate-report.json>" --release-handoff "<release-handoff.json>" --github-protection-snapshot "<github-protection-snapshot.json>" --output "<owner-safe-day0-packet.json>" --markdown-output "<owner-safe-day0-packet.md>"'
const retiredBaselineCommands = [
  'npm.cmd run shop:pilot:baseline-packet -- --lint-input "<private-baseline-input.json>"',
  'npm.cmd run shop:pilot:baseline-packet -- --input "<private-baseline-input.json>" --output "<owner-safe-baseline-packet.json>" --markdown-output "<owner-safe-baseline-packet.md>"',
  'npm.cmd run shop:pilot:baseline-packet -- --verify "<owner-safe-baseline-packet.json>"',
]
const atomicBaselineSequence = [
  baselineCompleteCommand,
  baselineCompleteVerifyCommand,
  intakePacketCommand,
  launchGateReportCommand,
  launchGateVerifyCommand,
  day0ReleaseBoundCommand,
]
const salesAgentGuide = read('docs/supermega-shop-sales-agent.md')
for (const [label, guide] of [['pilot_kit', kitBaseline], ['sales_agent', salesAgentGuide]]) {
  let priorCommandIndex = -1
  for (const command of atomicBaselineSequence) {
    const commandIndex = guide.indexOf(command)
    check(commandIndex > priorCommandIndex, `${label}_atomic_baseline_command_order:${command}`)
    priorCommandIndex = commandIndex
  }
  check(guide.includes('`owner_safe_baseline_completion_receipt_digest`'), `${label}_completion_signal`)
  check(guide.includes('`owner-safe-baseline-completion-receipt.json`'), `${label}_sealed_completion_receipt`)
  check(guide.includes('Do not hand-edit or manually replace any file in the completion directory'), `${label}_no_manual_replacement`)
  for (const retiredCommand of retiredBaselineCommands) {
    check(!guide.includes(retiredCommand), `${label}_retired_manual_baseline_command_absent:${retiredCommand}`)
  }
}
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
