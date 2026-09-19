import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT = 'supermega.shop.pilot_public_boundary.v1'

const MAX_PUBLIC_ARTIFACT_BYTES = 256 * 1024

const REQUIRED_FALSE_CONTROLS = [
  'automaticSendAllowed',
  'paymentAllowed',
  'deploymentAllowed',
  'productionActivationAllowed',
  'hostedWritesAllowed',
  'externalWritesPerformed',
  'customerContactPerformed',
]

const CLAIMS_THAT_MUST_NOT_BE_TRUE = [
  'managedActivation',
  'managedActivationReady',
  'managedPersistenceReady',
  'productionActivation',
  'productionActivationAllowed',
  'hostedWritesAllowed',
  'shopPilotProof',
  'pilotProof',
  'promotionEvidence',
  'readyToRecord',
  'paymentAllowed',
  'paymentAccepted',
  'deploymentAllowed',
  'externalWritesPerformed',
  'customerContactPerformed',
  'customerMessageSent',
  'stockMovementPerformed',
  'stockMovePerformed',
  'serverWritePerformed',
  'hostedWritePerformed',
  'credentialChangePerformed',
  'providerMutationPerformed',
]

const ALLOWED_DECISIONS = new Set(['approve-manual-send', 'revise', 'decline'])

const SENSITIVE_KEY_FRAGMENTS = [
  'businessname',
  'clientname',
  'company',
  'contactemail',
  'contactname',
  'contactphone',
  'decidedby',
  'email',
  'handoff',
  'legalname',
  'location',
  'messagebody',
  'note',
  'operatorname',
  'ownername',
  'phone',
  'privatehandoff',
  'privatereply',
  'rawcontact',
  'recipient',
  'replydraft',
  'requesteremail',
  'requestername',
  'tenantlabel',
  'workspacepath',
]

const EXPLICITLY_ALLOWED_KEYS = new Set([
  'customerContactPerformed',
  'externalWritesPerformed',
  'contactEventSha256',
  'privateWorkspace',
  'privateArtifactsCreated',
  'contactEventDigest',
])

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu
const MYANMAR_PHONE_PATTERN = /(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}/u
const PRIVATE_PATH_PATTERN = /(?:[A-Za-z]:\\|\\\\[^\\\s]+\\|\/Users\/|\/home\/|<private-workspace>|<new-private-workspace>)/u
const PRIVATE_ARTIFACT_TEXT_PATTERN = /(?:private-handoff|private-reply|owner-input\.json|decision-input\.json|PRIVATE\s+-\s+SuperMega Shop pilot sales workspace)/iu
const PROOF_CLAIM_TEXT_PATTERN = /(?:shop pilot proof\s*:\s*true|managed activation\s*:\s*true|readyToRecord\s*:\s*true|promotion evidence\s*:\s*true)/iu

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase()
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readBoundedFile(path) {
  const resolved = resolve(path)
  const linkMetadata = lstatSync(resolved)
  if (linkMetadata.isSymbolicLink()) throw new Error('public_boundary_file_invalid')
  const metadata = statSync(resolved)
  if (!metadata.isFile()) throw new Error('public_boundary_file_invalid')
  if (metadata.size <= 0 || metadata.size > MAX_PUBLIC_ARTIFACT_BYTES) throw new Error('public_boundary_file_size_invalid')
  const raw = readFileSync(resolved, 'utf8')
  if (Buffer.byteLength(raw, 'utf8') !== metadata.size) throw new Error('public_boundary_file_changed')
  return { path: resolved, raw, digest: sha256(raw) }
}

function normalizedKey(key) {
  return String(key).replace(/[^a-z0-9]/giu, '').toLowerCase()
}

function sensitiveKey(key) {
  if (EXPLICITLY_ALLOWED_KEYS.has(String(key))) return false
  const normalized = normalizedKey(key)
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

function publicTextIssues(raw) {
  const issues = []
  if (EMAIL_PATTERN.test(raw)) issues.push('private_email_present')
  if (MYANMAR_PHONE_PATTERN.test(raw)) issues.push('private_phone_present')
  if (PRIVATE_PATH_PATTERN.test(raw)) issues.push('private_path_present')
  if (PRIVATE_ARTIFACT_TEXT_PATTERN.test(raw)) issues.push('private_artifact_reference_present')
  if (PROOF_CLAIM_TEXT_PATTERN.test(raw)) issues.push('unproven_pilot_or_activation_claim')
  return issues
}

function walk(value, visitor, path = []) {
  visitor(value, path)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...path, String(index)]))
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) walk(child, visitor, [...path, key])
  }
}

function controlValue(summary, key) {
  if (Object.hasOwn(summary, key)) return summary[key]
  if (isRecord(summary.controls) && Object.hasOwn(summary.controls, key)) return summary.controls[key]
  if (isRecord(summary.boundaries) && Object.hasOwn(summary.boundaries, key)) return summary.boundaries[key]
  return undefined
}

export function verifyShopPilotPublicBoundary(summary, options = {}) {
  if (!isRecord(summary)) throw new Error('public_boundary_summary_required')

  const issues = []
  let checks = 0

  const check = (condition, code) => {
    checks += 1
    if (!condition) issues.push(code)
  }

  check(summary.contract === undefined || summary.contract === SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT, 'public_boundary_contract_invalid')
  check(summary.product === undefined || summary.product === 'shop', 'public_boundary_product_invalid')
  check(summary.pilotMode === undefined || summary.pilotMode === 'owner_named', 'public_boundary_pilot_mode_invalid')
  check(summary.decision === undefined || ALLOWED_DECISIONS.has(summary.decision), 'public_boundary_decision_invalid')

  for (const key of REQUIRED_FALSE_CONTROLS) {
    check(controlValue(summary, key) === false, `public_boundary_control_not_false:${key}`)
  }

  for (const key of CLAIMS_THAT_MUST_NOT_BE_TRUE) {
    const value = controlValue(summary, key)
    if (value !== undefined) check(value === false, `public_boundary_unproven_claim_true:${key}`)
  }

  if (summary.acceptedRuns !== undefined) check(summary.acceptedRuns === 0, 'public_boundary_accepted_runs_must_be_zero')
  if (summary.consecutiveAcceptedRuns !== undefined) check(summary.consecutiveAcceptedRuns === 0, 'public_boundary_consecutive_runs_must_be_zero')
  if (summary.participantIdentityPresent !== undefined) check(summary.participantIdentityPresent === false, 'public_boundary_identity_flag_true')
  if (summary.secretValuesExposed !== undefined) check(summary.secretValuesExposed === false, 'public_boundary_secret_values_exposed')

  walk(summary, (value, path) => {
    const key = path[path.length - 1]
    if (key && sensitiveKey(key)) issues.push(`public_boundary_sensitive_key:${path.join('.')}`)
    if (typeof value === 'string') {
      for (const issue of publicTextIssues(value)) issues.push(`${issue}:${path.join('.') || '<root>'}`)
    }
  })

  if (options.rawText) {
    for (const issue of publicTextIssues(options.rawText)) issues.push(`${issue}:raw`)
  }

  const uniqueIssues = [...new Set(issues)]
  if (uniqueIssues.length > 0) {
    const error = new Error(uniqueIssues[0])
    error.issues = uniqueIssues
    throw error
  }

  return {
    ok: true,
    contract: SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT,
    checks,
    externalWritesPerformed: false,
    customerContactPerformed: false,
  }
}

function parseArgs(argv) {
  const files = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--file') {
      const next = argv[index + 1]
      if (!next || next.startsWith('--')) throw new Error('public_boundary_usage_invalid')
      files.push(next)
      index += 1
    } else {
      throw new Error('public_boundary_usage_invalid')
    }
  }
  if (files.length === 0) throw new Error('public_boundary_usage_invalid')
  return { files }
}

export function verifyShopPilotPublicBoundaryFiles(files) {
  const results = []
  let checks = 0
  for (const file of files) {
    const artifact = readBoundedFile(file)
    let parsed
    try {
      parsed = JSON.parse(artifact.raw)
    } catch {
      parsed = { contract: SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT, controls: Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((key) => [key, false])) }
    }
    const result = verifyShopPilotPublicBoundary(parsed, { rawText: artifact.raw })
    checks += result.checks
    results.push({ path: artifact.path, digest: artifact.digest })
  }
  return {
    ok: true,
    contract: SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT,
    files: results.length,
    checks,
    fileDigests: results.map((item) => item.digest),
    externalWritesPerformed: false,
    customerContactPerformed: false,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { files } = parseArgs(process.argv.slice(2))
    process.stdout.write(`${JSON.stringify(verifyShopPilotPublicBoundaryFiles(files))}\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT,
      error: String(error?.message || 'public_boundary_failed').slice(0, 240),
      issues: Array.isArray(error?.issues) ? error.issues.slice(0, 12) : undefined,
      externalWritesPerformed: false,
      customerContactPerformed: false,
    })}\n`)
    process.exitCode = 1
  }
}
