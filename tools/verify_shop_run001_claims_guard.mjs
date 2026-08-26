import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const repoRoot = process.cwd()

const files = {
  packageJson: 'package.json',
  current: 'CURRENT.md',
  readiness: 'hq/readiness/managed-pilot-readiness.json',
  onboarding: 'showroom/src/core/ProductOnboardingPage.tsx',
  coreApp: 'showroom/src/core/CoreApp.tsx',
  ownerPacket: 'tools/create_shop_spa_owner_onboarding_packet.mjs',
  recorder: 'tools/record_shop_pilot_observed_run.mjs',
  recorderTest: 'tools/record_shop_pilot_observed_run.test.mjs',
}

const errors = []
const checkedFiles = []
let checks = 0

function read(rel) {
  const abs = path.join(repoRoot, rel)
  if (!fs.existsSync(abs)) {
    errors.push(`missing:${rel}`)
    return ''
  }
  const text = fs.readFileSync(abs, 'utf8')
  checkedFiles.push({
    path: rel,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  })
  return text
}

function check(condition, label) {
  checks += 1
  if (!condition) errors.push(label)
}

function requireSnippet(text, snippet, rel) {
  check(text.includes(snippet), `missing_required_snippet:${rel}:${snippet}`)
}

const packageText = read(files.packageJson)
const currentText = read(files.current)
const readinessText = read(files.readiness)
const onboardingText = read(files.onboarding)
const coreAppText = read(files.coreApp)
const ownerPacketText = read(files.ownerPacket)
const recorderText = read(files.recorder)
const recorderTestText = read(files.recorderTest)

let packageJson = {}
try {
  packageJson = JSON.parse(packageText)
} catch (error) {
  errors.push(`package_json_invalid:${error.message}`)
}

check(
  packageJson?.scripts?.['shop:run001:claims:verify'] === 'node tools/verify_shop_run001_claims_guard.mjs',
  'package_script_missing:shop:run001:claims:verify',
)
check(
  packageJson?.scripts?.['client:pilot:observed-evidence:template'] === 'node tools/record_shop_pilot_observed_run.mjs --template',
  'package_script_missing:client:pilot:observed-evidence:template',
)
check(
  packageJson?.scripts?.['client:pilot:observed-evidence:validate'] === 'node tools/record_shop_pilot_observed_run.mjs --validate-run-input',
  'package_script_missing:client:pilot:observed-evidence:validate',
)
check(
  typeof packageJson?.scripts?.['preapp:verify'] === 'string'
    && packageJson.scripts['preapp:verify'].includes('shop:run001:claims:verify'),
  'preapp_verify_missing_shop_run001_claims_guard',
)
check(
  typeof packageJson?.scripts?.['preapp:verify:local'] === 'string'
    && packageJson.scripts['preapp:verify:local'].includes('shop:run001:claims:verify'),
  'preapp_verify_local_missing_shop_run001_claims_guard',
)

requireSnippet(recorderText, 'const promotionEvidenceMet = acceptedConsecutiveRuns >= REQUIRED_ACCEPTED_CONSECUTIVE_RUNS && pilotSequenceCoverageMet', files.recorder)
requireSnippet(recorderText, "const readyForOwnerDecisionReview = promotionEvidenceMet && latestReloadRetryOutcome === 'passed'", files.recorder)
requireSnippet(recorderText, 'acceptedConsecutiveRunsRemaining', files.recorder)
requireSnippet(recorderText, 'missingPilotDayIndexes', files.recorder)
requireSnippet(recorderText, 'promotionProgress', files.recorder)
requireSnippet(recorderText, 'SHOP_OBSERVED_RUN_INPUT_TEMPLATE_CONTRACT', files.recorder)
requireSnippet(recorderText, 'buildObservedRunInputTemplate', files.recorder)
requireSnippet(recorderText, 'validateObservedRunInputTemplate', files.recorder)
requireSnippet(recorderText, 'metadata_only_no_record_write', files.recorder)
requireSnippet(recorderText, 'template_written_no_record_write', files.recorder)
requireSnippet(recorderText, "throw new Error('shop_observed_evidence_reference_digest_duplicate')", files.recorder)
requireSnippet(recorderText, "throw new Error('shop_observed_independent_anchor_digest_duplicate')", files.recorder)
requireSnippet(recorderText, "throw new Error('shop_observed_evidence_anchor_digest_not_independent')", files.recorder)
requireSnippet(recorderText, 'externalWritesPerformed: false', files.recorder)
requireSnippet(recorderText, 'customerContactPerformed: false', files.recorder)
requireSnippet(recorderText, 'paymentAccepted: false', files.recorder)
requireSnippet(recorderText, 'stockMovementPerformed: false', files.recorder)
requireSnippet(recorderText, 'serverWritesPerformed: false', files.recorder)
requireSnippet(recorderText, 'hostedWritesPerformed: false', files.recorder)
requireSnippet(recorderText, 'privateValuesReturned: false', files.recorder)
requireSnippet(recorderText, "nextAction: readyForOwnerDecisionReview ? 'owner_review_required_before_activation' : 'collect_more_observed_evidence'", files.recorder)

requireSnippet(recorderTestText, 'nineteen accepted runs do not set promotionEvidenceMet', files.recorderTest)
requireSnippet(recorderTestText, 'twenty consecutive accepted runs set promotionEvidenceMet', files.recorderTest)
requireSnippet(recorderTestText, 'twenty consecutive accepted runs still require five-day pilot sequence coverage', files.recorderTest)
requireSnippet(recorderTestText, 'replayed evidence and anchor digests cannot inflate accepted run count', files.recorderTest)
requireSnippet(recorderTestText, 'twenty accepted runs still block owner decision review until latest reload retry passes', files.recorderTest)
requireSnippet(recorderTestText, 'private run input template is fillable but not recordable evidence', files.recorderTest)
requireSnippet(recorderTestText, 'CLI writes private run template and validates filled run input with metadata-only stdout', files.recorderTest)
requireSnippet(recorderTestText, 'assert.equal(summary.promotionEvidenceMet, false)', files.recorderTest)
requireSnippet(recorderTestText, 'assert.equal(summary.promotionEvidenceMet, true)', files.recorderTest)

requireSnippet(onboardingText, 'Shop pilot proof rule', files.onboarding)
requireSnippet(onboardingText, 'accepted order-to-close runs', files.onboarding)
requireSnippet(onboardingText, 'daily closes observed', files.onboarding)
requireSnippet(onboardingText, 'unexplained payment or stock changes', files.onboarding)
requireSnippet(onboardingText, 'Paid pilot only after the owner can name faster close', files.onboarding)
requireSnippet(onboardingText, 'Spa services vertical pack: package sale, treatment redemption, invalid redemption refusal, daily close, then reload check.', files.onboarding)

requireSnippet(coreAppText, 'Spa pilot first sale', files.coreApp)
requireSnippet(coreAppText, 'Sell package', files.coreApp)
requireSnippet(coreAppText, 'Book treatment', files.coreApp)
requireSnippet(coreAppText, 'Reject bad redemption', files.coreApp)
requireSnippet(coreAppText, 'Close day + reload', files.coreApp)

requireSnippet(ownerPacketText, 'prove one useful operating workflow before any managed activation', files.ownerPacket)
requireSnippet(ownerPacketText, 'It does not send a message, accept payment, move stock, post accounting, deploy software, activate production, or write hosted data.', files.ownerPacket)

requireSnippet(currentText, 'No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.', files.current)
requireSnippet(currentText, 'Add provider-backed AI, payment, shipping, tax, publishing, and broader marketing only after their product gate has measured pilot evidence.', files.current)

if (readinessText) {
  try {
    const readiness = JSON.parse(readinessText)
    const shop = Array.isArray(readiness.products)
      ? readiness.products.find((product) => product.productId === 'shop')
      : null
    check(Boolean(shop), 'readiness_shop_product_missing')
    if (shop) {
      check(shop.managedPilotStatus === 'blocked', 'readiness_shop_managed_pilot_should_be_blocked')
      check(shop.automationStatus === 'owner-gated', 'readiness_shop_automation_should_be_owner_gated')
      check(/sample evidence cannot close the pilot/i.test(shop.blockingReason ?? ''), 'readiness_shop_must_reject_sample_evidence')
      check(/named Spa owner/i.test(shop.requiredProof ?? ''), 'readiness_shop_required_proof_must_name_real_owner')
    }
    check(readiness.controls?.productionWritesEnabled === false, 'readiness_production_writes_must_be_false')
    check(readiness.controls?.ownerApprovalRequired === true, 'readiness_owner_approval_must_be_true')
  } catch (error) {
    errors.push(`readiness_json_invalid:${error.message}`)
  }
}

const claimTargets = [
  [files.current, currentText],
  [files.readiness, readinessText],
  [files.onboarding, onboardingText],
  [files.coreApp, coreAppText],
  [files.ownerPacket, ownerPacketText],
]

const forbiddenClaimPatterns = [
  /\breadyToRecord\b\s*[:=]\s*true/i,
  /\bcommercialProof(?:Ready|Met)?\b\s*[:=]\s*true/i,
  /\bmanagedActivation(?:Ready|Allowed)?\b\s*[:=]\s*true/i,
  /\bpaymentsAllowed\b\s*[:=]\s*true/i,
  /\bstockMovementsAllowed\b\s*[:=]\s*true/i,
  /\bcustomerMessagesAllowed\b\s*[:=]\s*true/i,
  /\bhostedWritesAllowed\b\s*[:=]\s*true/i,
  /commercial proof (?:is )?(?:ready|complete|met)/i,
  /managed activation (?:is )?(?:ready|allowed|complete|met)/i,
]

for (const [rel, text] of claimTargets) {
  for (const pattern of forbiddenClaimPatterns) {
    check(!pattern.test(text), `forbidden_run001_claim:${rel}:${pattern}`)
  }
}

check(!/[^\s@]+@[^\s@]+\.[^\s@]+/.test(onboardingText), 'public_onboarding_must_not_include_email')
check(!/\b09\d{5,}\b/.test(onboardingText), 'public_onboarding_must_not_include_myanmar_phone')

const result = {
  ok: errors.length === 0,
  contract: 'supermega.shop.run001_claims_guard.v1',
  checkedAt: new Date().toISOString(),
  checks,
  checkedFiles,
  requiredPromotionEvidence: {
    acceptedConsecutiveRuns: 20,
    fiveDayPilotSequenceCoverageRequired: true,
    independentAnchorRequired: true,
    receiptRequired: true,
    latestReloadRetryPassedRequired: true,
    promotionProgressRequired: true,
    privateRunInputTemplateRequired: true,
    metadataOnlyRunInputValidationRequired: true,
    uniqueEvidenceReferenceDigestsRequired: true,
    uniqueIndependentAnchorDigestsRequired: true,
    evidenceAnchorDigestPairsMustBeDistinct: true,
    syntheticEvidenceAccepted: false,
  },
  gatesPreserved: {
    readyToRecord: false,
    commercialProofReady: false,
    managedActivationReady: false,
    externalWritesPerformed: false,
    customerContactPerformed: false,
    paymentAccepted: false,
    stockMovementPerformed: false,
    hostedWritesPerformed: false,
  },
  errors,
}

console.log(JSON.stringify(result, null, 2))
if (errors.length > 0) process.exit(1)
