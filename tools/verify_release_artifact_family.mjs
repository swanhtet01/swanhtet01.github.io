#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateApplyReport } from './apply_github_main_protection.mjs'
import { validateReviewBranchPushReport } from './apply_review_branch_push.mjs'
import { validatePullRequestReport } from './apply_release_pull_request.mjs'
import { validateGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import { validateCurrentOperatorBoard } from './prepare_current_operator_board.mjs'
import { validateCurrentReleaseControlIndex } from './prepare_current_release_control_index.mjs'
import { validateGitHubMainProtectionOwnerActionCard } from './prepare_github_main_protection_owner_action_card.mjs'
import { validateNextReleaseActionPreflight } from './prepare_next_release_action_preflight.mjs'
import { validateProductReadinessMatrix } from './prepare_product_readiness_matrix.mjs'
import { validateReleaseHandoffPacket } from './prepare_release_handoff.mjs'
import { validateReleaseOwnerApprovalMarkdown } from './prepare_release_owner_approval_packet.mjs'
import { validateShopPilotBaselinePacket } from './prepare_shop_pilot_baseline_packet.mjs'
import { validateShopPilotDay0OwnerBaselineActionCard } from './prepare_shop_pilot_day0_owner_baseline_action_card.mjs'
import { validateShopPilotDay0ReadinessPacket } from './prepare_shop_pilot_day0_readiness_packet.mjs'
import { validateShopPilotPrivateIntakePacket } from './prepare_shop_pilot_private_intake_packet.mjs'
import { validateSuperMegaStatusBrief } from './prepare_supermega_status_brief.mjs'

export const RELEASE_ARTIFACT_FAMILY_VERIFIER_CONTRACT = 'supermega.release-artifact-family-verifier.v1'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GITHUB_PROPOSAL_PATH = resolve(root, 'hq', 'readiness', 'github-main-protection-proposal.json')
const SUPABASE_PROPOSAL_PATH = resolve(root, 'hq', 'readiness', 'supabase-preview-rehearsal-proposal.json')
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const FALSE_CONTROL_KEYS = [
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'paymentOrStockActionPerformed',
  'managedActivationPerformed',
]
const LEAK_PATTERNS = [
  ['windows_absolute_path', /[A-Za-z]:\\+[^\s"')\]}]*/g],
  ['posix_private_path', /(?:^|["'\s])\/(?:Users|home)\/[^\s"')\]}]*/g],
  ['email_like', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu],
  ['phone_like', /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/gu],
  ['token_shape', /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9_]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/gi],
  ['private_key', /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/g],
]

function fail(code) {
  throw new Error(code)
}

function normalize(text) {
  return String(text || '').replace(/\r\n?/g, '\n')
}

function digest(text) {
  return `sha256:${createHash('sha256').update(normalize(text)).digest('hex')}`
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function ensureDigest(value, code) {
  if (!DIGEST_PATTERN.test(String(value || ''))) fail(code)
  return value
}

async function readText(path, code) {
  const text = await readFile(resolve(path || ''), 'utf8').catch(() => null)
  if (text === null) fail(code)
  return text
}

async function readJson(path, code) {
  const text = await readText(path, code)
  try {
    return JSON.parse(text)
  } catch {
    fail(`${code}_json_invalid`)
  }
}

function artifactFamilyStamp(fileName) {
  const match = /\.((?:v)[0-9]{1,3})\.generated-([0-9]{8})\./i.exec(fileName || '')
  if (!match) fail('release_artifact_family_stamp_invalid')
  return {
    version: match[1].toLowerCase(),
    date: match[2],
    suffix: `${match[1].toLowerCase()}.generated-${match[2]}`,
  }
}

export function scanOwnerFacingText(fileName, text) {
  const findings = []
  for (const [pattern, regex] of LEAK_PATTERNS) {
    const matches = [...normalize(text).matchAll(regex)]
    if (matches.length) findings.push({ fileName, pattern, count: matches.length })
  }
  return findings
}

function controlsRemainFalse(report) {
  const controls = report?.controls || report?.authority || report
  return isRecord(controls) && FALSE_CONTROL_KEYS.every((key) => controls[key] === false || controls[key] === undefined)
}

function artifactPath(artifactsDir, fileName) {
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) fail('release_artifact_family_file_name_invalid')
  return resolve(artifactsDir, fileName)
}

function jsonDigestFromPacket(label, packet, artifact) {
  if (label === 'releaseHandoff') {
    ensureDigest(artifact.packetDigest, 'release_artifact_family_handoff_packet_digest_missing')
    if (packet.digest !== artifact.packetDigest) fail('release_artifact_family_handoff_packet_digest_mismatch')
    return null
  }
  ensureDigest(packet.digest, `release_artifact_family_${label}_packet_digest_missing`)
  if (packet.digest !== artifact.digest) fail(`release_artifact_family_${label}_digest_mismatch`)
  return packet.digest
}

function markdownCounterpartName(fileName) {
  return fileName.endsWith('.json') ? fileName.replace(/\.json$/i, '.md') : null
}

function derivedFamilyFileNames({ suffix }) {
  return [
    `supermega.current-release-control-index.${suffix}.json`,
    `supermega.current-release-control-index.${suffix}.md`,
    `supermega.current-operator-board.${suffix}.json`,
    `supermega.current-operator-board.${suffix}.md`,
    `supermega.product-readiness-matrix.${suffix}.json`,
    `supermega.product-readiness-matrix.${suffix}.md`,
    `supermega.status-brief.${suffix}.json`,
    `supermega.status-brief.${suffix}.md`,
    `supermega.next-release-action-preflight.${suffix}.json`,
    `supermega.next-release-action-preflight.${suffix}.md`,
    `supermega.shop-pilot-private-intake-packet.${suffix}.json`,
    `supermega.shop-pilot-private-intake-packet.${suffix}.md`,
    `supermega.shop-pilot-baseline-input.template.private.${suffix}.json`,
    `supermega.shop-pilot-baseline-worksheet.private.${suffix}.md`,
    `supermega.shop-pilot-day0-readiness.${suffix}.json`,
    `supermega.shop-pilot-day0-readiness.${suffix}.md`,
    `supermega.shop-pilot-day0-owner-baseline-action-card.${suffix}.json`,
    `supermega.shop-pilot-day0-owner-baseline-action-card.${suffix}.md`,
    `supermega.github-main-protection-owner-action-card.${suffix}.json`,
    `supermega.github-main-protection-owner-action-card.${suffix}.md`,
  ]
}

function ownerFacingFamilyFileNames({ suffix }) {
  return [
    `supermega.current-release-control-index.${suffix}.json`,
    `supermega.current-release-control-index.${suffix}.md`,
    `supermega.product-readiness-matrix.${suffix}.json`,
    `supermega.product-readiness-matrix.${suffix}.md`,
    `supermega.status-brief.${suffix}.json`,
    `supermega.status-brief.${suffix}.md`,
    `supermega.next-release-action-preflight.${suffix}.json`,
    `supermega.next-release-action-preflight.${suffix}.md`,
    `supermega.shop-pilot-private-intake-packet.${suffix}.json`,
    `supermega.shop-pilot-private-intake-packet.${suffix}.md`,
    `supermega.shop-pilot-baseline-input.template.private.${suffix}.json`,
    `supermega.shop-pilot-baseline-worksheet.private.${suffix}.md`,
    `supermega.shop-pilot-day0-readiness.${suffix}.json`,
    `supermega.shop-pilot-day0-readiness.${suffix}.md`,
    `supermega.shop-pilot-day0-owner-baseline-action-card.${suffix}.json`,
    `supermega.shop-pilot-day0-owner-baseline-action-card.${suffix}.md`,
    `supermega.github-main-protection-owner-action-card.${suffix}.json`,
    `supermega.github-main-protection-owner-action-card.${suffix}.md`,
  ]
}

async function maybeRead(artifactsDir, fileName) {
  return readFile(artifactPath(artifactsDir, fileName), 'utf8').then(
    (text) => ({ fileName, text }),
    () => null,
  )
}

async function verifyExtraArtifact(artifactsDir, fileName) {
  const path = artifactPath(artifactsDir, fileName)
  if (fileName.includes('github-main-protection-owner-action-card') && fileName.endsWith('.json')) {
    validateGitHubMainProtectionOwnerActionCard(await readJson(path, 'release_artifact_family_github_action_card_missing'))
    return 'github_main_protection_owner_action_card'
  }
  if (fileName.includes('shop-pilot-day0-owner-baseline-action-card') && fileName.endsWith('.json')) {
    validateShopPilotDay0OwnerBaselineActionCard(await readJson(path, 'release_artifact_family_shop_action_card_missing'))
    return 'shop_day0_owner_baseline_action_card'
  }
  if (fileName.includes('shop-pilot-private-intake-packet') && fileName.endsWith('.json')) {
    validateShopPilotPrivateIntakePacket(await readJson(path, 'release_artifact_family_private_intake_missing'))
    return 'shop_private_intake_packet'
  }
  if (fileName.includes('shop-pilot-baseline-packet') && fileName.endsWith('.json')) {
    validateShopPilotBaselinePacket(await readJson(path, 'release_artifact_family_baseline_packet_missing'))
    return 'shop_baseline_packet'
  }
  return null
}

export async function verifyReleaseArtifactFamily({ controlIndexPath, artifactsDir = null, generatedAt = new Date().toISOString() } = {}) {
  const controlPath = resolve(controlIndexPath || '')
  const baseDir = resolve(artifactsDir || dirname(controlPath))
  const controlText = await readText(controlPath, 'release_artifact_family_control_index_missing')
  const controlIndex = validateCurrentReleaseControlIndex(JSON.parse(controlText))
  const family = artifactFamilyStamp(controlIndex.authoritativeArtifacts.releaseHandoff.fileName)
  if (controlIndex.artifactFamily.version !== family.version) fail('release_artifact_family_version_mismatch')

  const artifacts = controlIndex.authoritativeArtifacts
  const handoffPath = artifactPath(baseDir, artifacts.releaseHandoff.fileName)
  const snapshotPath = artifactPath(baseDir, artifacts.githubMainProtectionSnapshot.fileName)
  const handoffText = await readText(handoffPath, 'release_artifact_family_handoff_missing')
  if (digest(handoffText) !== artifacts.releaseHandoff.digest) fail('release_artifact_family_handoff_file_digest_mismatch')
  const handoff = validateReleaseHandoffPacket(JSON.parse(handoffText))
  Object.defineProperty(handoff, '__sourcePath', {
    value: handoffPath,
    enumerable: false,
  })
  jsonDigestFromPacket('releaseHandoff', handoff, artifacts.releaseHandoff)

  const snapshot = validateGitHubMainProtectionSnapshot(await readJson(snapshotPath, 'release_artifact_family_snapshot_missing'))
  jsonDigestFromPacket('githubMainProtectionSnapshot', snapshot, artifacts.githubMainProtectionSnapshot)

  const jsonArtifacts = [
    ['githubMainProtectionApplyPlan', validateApplyReport, { expectedMode: 'plan_only_no_github_write' }],
    ['reviewBranchPushPlan', validateReviewBranchPushReport, { expectedMode: 'plan_only_no_git_remote_write' }],
    ['pullRequestCreatePlan', validatePullRequestReport, { expectedMode: 'plan_only_no_github_write' }],
    ['currentOperatorBoard', validateCurrentOperatorBoard],
    ['productReadinessMatrix', validateProductReadinessMatrix],
    ['statusBrief', validateSuperMegaStatusBrief],
    ['nextReleaseActionPreflight', validateNextReleaseActionPreflight],
    ['githubMainProtectionOwnerActionCard', validateGitHubMainProtectionOwnerActionCard],
    ['shopPilotDay0Readiness', validateShopPilotDay0ReadinessPacket],
    ['shopPilotDay0OwnerBaselineActionCard', validateShopPilotDay0OwnerBaselineActionCard],
  ]
  const semanticArtifacts = ['releaseHandoff', 'githubMainProtectionSnapshot']
  for (const [label, validator, options] of jsonArtifacts) {
    const artifact = artifacts[label]
    const packet = validator(await readJson(artifactPath(baseDir, artifact.fileName), `release_artifact_family_${label}_missing`), options)
    jsonDigestFromPacket(label, packet, artifact)
    semanticArtifacts.push(label)
    if (packet?.candidate?.commit && packet.candidate.commit !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
    if (packet?.candidate?.head && packet.candidate.head !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
    if (packet?.candidateCommit && packet.candidateCommit !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
    if (packet?.currentAction?.candidateCommit && packet.currentAction.candidateCommit !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
  }

  const githubProposal = await readJson(GITHUB_PROPOSAL_PATH, 'release_artifact_family_github_proposal_missing')
  const supabaseProposal = await readJson(SUPABASE_PROPOSAL_PATH, 'release_artifact_family_supabase_proposal_missing')
  const ownerApprovalText = await readText(artifactPath(baseDir, artifacts.releaseOwnerApprovalPacket.fileName), 'release_artifact_family_owner_approval_missing')
  if (digest(ownerApprovalText) !== artifacts.releaseOwnerApprovalPacket.digest) fail('release_artifact_family_owner_approval_digest_mismatch')
  const ownerVersion = artifactFamilyStamp(artifacts.releaseOwnerApprovalPacket.fileName).version
  validateReleaseOwnerApprovalMarkdown(ownerApprovalText, {
    handoff,
    githubProposal,
    githubProtectionSnapshot: snapshot,
    githubProtectionSnapshotPath: snapshotPath,
    supabaseProposal,
    version: ownerVersion,
  })
  semanticArtifacts.push('releaseOwnerApprovalPacket')

  const extraArtifacts = []
  for (const fileName of derivedFamilyFileNames(family)) {
    const label = await maybeRead(baseDir, fileName)
    if (!label) continue
    const verifiedExtra = await verifyExtraArtifact(baseDir, fileName)
    if (verifiedExtra) extraArtifacts.push(verifiedExtra)
  }

  const ownerFacingNames = new Set([
    basename(controlPath),
    basename(controlPath).replace(/\.json$/i, '.md'),
    artifacts.releaseOwnerApprovalPacket.fileName,
    artifacts.productReadinessMatrix.fileName,
    markdownCounterpartName(artifacts.productReadinessMatrix.fileName),
    artifacts.statusBrief.fileName,
    markdownCounterpartName(artifacts.statusBrief.fileName),
    artifacts.nextReleaseActionPreflight.fileName,
    markdownCounterpartName(artifacts.nextReleaseActionPreflight.fileName),
    artifacts.shopPilotDay0Readiness.fileName,
    markdownCounterpartName(artifacts.shopPilotDay0Readiness.fileName),
    ...ownerFacingFamilyFileNames(family),
  ].filter(Boolean))

  const leakFindings = []
  let ownerFacingFilesScanned = 0
  ownerFacingFilesScanned += 1
  leakFindings.push(...scanOwnerFacingText(basename(controlPath), controlText))
  for (const fileName of ownerFacingNames) {
    const file = await maybeRead(baseDir, fileName)
    if (!file) continue
    ownerFacingFilesScanned += 1
    leakFindings.push(...scanOwnerFacingText(file.fileName, file.text))
  }
  if (leakFindings.length) fail(`release_artifact_family_owner_facing_leak:${leakFindings[0].fileName}:${leakFindings[0].pattern}`)
  if (!controlsRemainFalse(controlIndex.controls)) fail('release_artifact_family_controls_invalid')

  return {
    ok: true,
    contract: RELEASE_ARTIFACT_FAMILY_VERIFIER_CONTRACT,
    generatedAt,
    artifactFamily: family.version,
    candidateCommit: controlIndex.candidate.commit,
    currentGateId: controlIndex.currentOwnerAction.gateId,
    semanticArtifactsVerified: semanticArtifacts.length,
    semanticArtifacts,
    extraArtifactsVerified: [...new Set(extraArtifacts)].sort(),
    ownerFacingFilesScanned,
    ownerFacingLeakFindings: 0,
    blockersStillExpected: [
      'github_main_protection_unverified',
      'owner_observed_baseline_packet_missing',
      'preview_rehearsal_missing',
      'real_pilot_evidence_missing',
    ],
    controls: {
      externalWritesPerformed: false,
      gitRemoteWritesPerformed: false,
      githubWritesPerformed: false,
      vercelDeploymentsPerformed: false,
      supabaseMutationsPerformed: false,
      credentialValuesInspected: false,
      customerContactPerformed: false,
      paymentOrStockActionPerformed: false,
      managedActivationPerformed: false,
      privateIdentityExposed: false,
    },
  }
}

export function runSelfTest() {
  const family = artifactFamilyStamp('supermega.release-handoff.v115.generated-20260826.json')
  const safeFindings = scanOwnerFacingText('safe.md', `Candidate sha256:${'a'.repeat(64)} with owner gates false.`)
  const leakFindings = scanOwnerFacingText('unsafe.md', 'C:\\Users\\owner\\secret.txt owner@example.com ghp_123456789012345678901234')
  const checks = {
    family_version_and_date_detected: family.version === 'v115' && family.date === '20260826',
    safe_text_has_no_findings: safeFindings.length === 0,
    leak_text_detects_path_contact_and_token: leakFindings.some((finding) => finding.pattern === 'windows_absolute_path')
      && leakFindings.some((finding) => finding.pattern === 'email_like')
      && leakFindings.some((finding) => finding.pattern === 'token_shape'),
    invalid_family_rejected: (() => {
      try {
        artifactFamilyStamp('supermega.release-handoff.generated.json')
        return false
      } catch (error) {
        return String(error?.message || '').includes('release_artifact_family_stamp_invalid')
      }
    })(),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
  return {
    ok: failedChecks.length === 0,
    contract: `${RELEASE_ARTIFACT_FAMILY_VERIFIER_CONTRACT}.self-test`,
    checks,
    failedChecks,
    externalWritesPerformed: false,
  }
}

function parseArgs(argv) {
  const options = { selfTest: false, controlIndexPath: null, artifactsDir: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--control-index') options.controlIndexPath = argv[++index] || null
    else if (arg === '--artifacts-dir') options.artifactsDir = argv[++index] || null
    else fail(`release_artifact_family_usage_invalid:${arg}`)
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (!options.controlIndexPath) fail('release_artifact_family_control_index_required')
  console.log(JSON.stringify(await verifyReleaseArtifactFamily(options), null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: RELEASE_ARTIFACT_FAMILY_VERIFIER_CONTRACT,
      error: String(error?.message || 'release_artifact_family_failed').slice(0, 240),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
