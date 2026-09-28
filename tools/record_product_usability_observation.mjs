import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, open, realpath, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CONTRACT = 'supermega.formative-usability-observation.v1'
const EXPERIMENTS = new Set(['SETUP-01', 'REVIEW-01', 'SHOP-01'])
const VARIANTS = new Set(['comparison', 'candidate'])
const LANGUAGES = new Set(['en', 'my', 'mixed'])
const DEVICES = new Set(['mobile', 'tablet', 'desktop', 'counter'])
const OUTCOMES = new Set(['completed_unassisted', 'completed_with_help', 'not_completed', 'stopped_for_safety'])
const ISSUES = new Set(['accessibility', 'confusing_copy', 'navigation', 'performance', 'recovery', 'stale_state', 'task_flow', 'unexpected_error'])
const INPUT_KEYS = ['activeSeconds', 'boundaryChecks', 'candidateCommit', 'comparisonCommit', 'consentAttested', 'contract', 'deviceClass', 'experimentId', 'helpRequests', 'issueCodes', 'language', 'moderatorInterventions', 'observedAt', 'observerRole', 'sessionCode', 'safety', 'taskOutcome', 'variant']
const BOUNDARY_KEYS = ['externalEffectBoundaryUnderstood', 'nextActionUnderstood', 'scopeUnderstood']
const SAFETY_KEYS = ['crossTenantExposure', 'dataLoss', 'falseExternalEffectStatus', 'wrongMoneyResult']

const fail = (code) => { throw new Error(`usability_observation_${code}`) }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const iso = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail('time_invalid')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z'))) fail('time_invalid')
  return parsed.toISOString()
}
const count = (value, maximum) => {
  if (!Number.isInteger(value) || value < 0 || value > maximum) fail('count_invalid')
  return value
}
const commit = (value) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) fail('commit_invalid')
  return value
}

export function buildObservation(input, { expectedHead }) {
  if (!exactKeys(input, INPUT_KEYS) || input.contract !== CONTRACT) fail('shape_invalid')
  if (!EXPERIMENTS.has(input.experimentId) || !VARIANTS.has(input.variant)) fail('experiment_invalid')
  const candidateCommit = commit(input.candidateCommit)
  const comparisonCommit = commit(input.comparisonCommit)
  if (candidateCommit !== commit(expectedHead) || candidateCommit === comparisonCommit) fail('commit_mismatch')
  if (input.consentAttested !== true || input.observerRole !== 'owner_moderator') fail('attestation_invalid')
  if (typeof input.sessionCode !== 'string' || !/^SESSION-[A-Z0-9]{8}$/.test(input.sessionCode)) fail('session_code_invalid')
  if (!LANGUAGES.has(input.language) || !DEVICES.has(input.deviceClass) || !OUTCOMES.has(input.taskOutcome)) fail('classification_invalid')
  if (!exactKeys(input.boundaryChecks, BOUNDARY_KEYS) || !BOUNDARY_KEYS.every(key => typeof input.boundaryChecks[key] === 'boolean')) fail('boundary_invalid')
  if (!exactKeys(input.safety, SAFETY_KEYS) || !SAFETY_KEYS.every(key => typeof input.safety[key] === 'boolean')) fail('safety_invalid')
  if (!Array.isArray(input.issueCodes) || input.issueCodes.length > ISSUES.size
      || new Set(input.issueCodes).size !== input.issueCodes.length
      || input.issueCodes.some(value => !ISSUES.has(value))) fail('issues_invalid')
  const activeSeconds = count(input.activeSeconds, 7200)
  const helpRequests = count(input.helpRequests, 50)
  const moderatorInterventions = count(input.moderatorInterventions, 50)
  const observedAt = iso(input.observedAt)
  const safetyStop = Object.values(input.safety).some(Boolean)
  if (safetyStop !== (input.taskOutcome === 'stopped_for_safety')) fail('safety_outcome_mismatch')
  const body = {
    contract: CONTRACT,
    experimentId: input.experimentId,
    candidateCommit,
    comparisonCommit,
    variant: input.variant,
    sessionDigest: sha256(`${input.experimentId}:${input.sessionCode}`),
    observedAt,
    language: input.language,
    deviceClass: input.deviceClass,
    taskOutcome: input.taskOutcome,
    activeSeconds,
    helpRequests,
    moderatorInterventions,
    issueCodes: [...input.issueCodes].sort(),
    boundaryChecks: { ...input.boundaryChecks },
    safety: { ...input.safety },
    derived: {
      safetyStop,
      taskCompleted: input.taskOutcome.startsWith('completed_'),
      completedUnassisted: input.taskOutcome === 'completed_unassisted' && helpRequests === 0 && moderatorInterventions === 0,
      allBoundariesUnderstood: Object.values(input.boundaryChecks).every(Boolean),
      eligibleForFormativeAnalysis: !safetyStop,
    },
    authority: {
      manualAttestationNotCryptographic: true,
      quantitativeWinnerProven: false,
      customerPreferenceProven: false,
      releaseAuthorized: false,
      providerWritesPerformed: false,
    },
    privacy: {
      participantIdentityRetained: false,
      freeTextRetained: false,
      contactDataRetained: false,
      recordingRetained: false,
    },
  }
  return { ...body, digest: sha256(JSON.stringify(body)) }
}

export async function recordObservation({ inputPath, outputPath, expectedHead, cwd = process.cwd() }) {
  const source = resolve(inputPath)
  const output = resolve(outputPath)
  if (source === output) fail('path_invalid')
  const sourceStat = await lstat(source)
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || await realpath(source) !== source) fail('input_invalid')
  const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  if (actualHead !== expectedHead || execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim()) fail('source_state_invalid')
  execFileSync('git', ['merge-base', '--is-ancestor', comparisonCommitFrom(await readFile(source, 'utf8')), actualHead], { cwd, stdio: 'ignore' })
  const input = JSON.parse(await readFile(source, 'utf8'))
  const receipt = buildObservation(input, { expectedHead: actualHead })
  const handle = await open(output, 'wx')
  try { await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`) } finally { await handle.close() }
  return receipt
}

function comparisonCommitFrom(source) {
  try { return commit(JSON.parse(source).comparisonCommit) } catch { fail('input_invalid') }
}

function cliArguments(argv) {
  const values = {}
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--input', '--out', '--expected-head'].includes(key) || !value || values[key]) fail('usage')
    values[key] = value
  }
  if (Object.keys(values).length !== 3) fail('usage')
  return { inputPath: values['--input'], outputPath: values['--out'], expectedHead: values['--expected-head'] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const receipt = await recordObservation(cliArguments(process.argv))
  console.log(JSON.stringify({ ok: true, contract: receipt.contract, digest: receipt.digest, status: receipt.taskOutcome }))
}
