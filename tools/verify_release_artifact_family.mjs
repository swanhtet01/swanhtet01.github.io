#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
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
import { validateAdminTechnicalCoordinationPacket } from './prepare_admin_technical_coordination_packet.mjs'
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
const CONFUSING_OWNER_MARKDOWN_PATTERNS = [
  ['public_packet_label', /raw_identity_or_private_note_would_enter_public_packet/gi],
  ['public_baseline_packet_label', /(?:ready to generate|generate|converted into)\s+(?:a\s+)?public(?:-safe)?\s+baseline\s+packet/gi],
  ['public_safe_baseline_metrics_label', /public-safe\s+baseline\s+metrics/gi],
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

export function scanOwnerFacingMarkdownClarity(fileName, text) {
  if (!String(fileName || '').toLowerCase().endsWith('.md')) return []
  const findings = []
  for (const [pattern, regex] of CONFUSING_OWNER_MARKDOWN_PATTERNS) {
    const matches = [...normalize(text).matchAll(regex)]
    if (matches.length) findings.push({ fileName, pattern, count: matches.length })
  }
  return findings
}

function controlsRemainFalse(report) {
  const controls = report?.controls || report?.authority || report
  return isRecord(controls) && FALSE_CONTROL_KEYS.every((key) => controls[key] === false || controls[key] === undefined)
}

export function verifyShopDay0ProductMatrixBinding(productReadinessMatrix, shopPilotDay0Readiness, shopPilotDay0Artifact) {
  const shopProduct = productReadinessMatrix?.products?.find((product) => product.productId === 'shop')
  if (!shopProduct) fail('release_artifact_family_product_matrix_shop_missing')
  if (!Array.isArray(shopProduct.currentBlockers)) fail('release_artifact_family_product_matrix_shop_blockers_invalid')
  const expectedSourceDigest = shopPilotDay0Artifact?.sourceDigest || shopPilotDay0Artifact?.digest
  if (productReadinessMatrix.sourceDigests?.shopPilotDay0ReadinessDigest !== expectedSourceDigest) {
    fail('release_artifact_family_product_matrix_shop_day0_digest_mismatch')
  }
  if (shopPilotDay0Readiness.day0Readiness?.intakePacketAccepted === true
    && shopProduct.currentBlockers.includes('owner_private_intake')) {
    fail('release_artifact_family_product_matrix_stale_shop_intake_blocker')
  }
  if (shopPilotDay0Readiness.day0Readiness?.baselinePacketAccepted === true
    && shopProduct.currentBlockers.includes('owner_private_baseline')) {
    fail('release_artifact_family_product_matrix_stale_shop_baseline_blocker')
  }
  if (shopPilotDay0Readiness.day0Readiness?.baselinePacketAccepted !== true
    && !shopProduct.currentBlockers.includes('owner_private_baseline')) {
    fail('release_artifact_family_product_matrix_missing_shop_baseline_blocker')
  }
  return true
}

export function verifyShopPrivateIntakeDay0Binding(shopPilotDay0Readiness, extraArtifacts) {
  const hasPrivateIntakePacket = Array.isArray(extraArtifacts) && extraArtifacts.includes('shop_private_intake_packet')
  if (hasPrivateIntakePacket && shopPilotDay0Readiness?.day0Readiness?.intakePacketAccepted !== true) {
    fail('release_artifact_family_shop_private_intake_not_bound_to_day0')
  }
  if (hasPrivateIntakePacket && !DIGEST_PATTERN.test(String(shopPilotDay0Readiness?.sourceDigests?.intakePacketDigest || ''))) {
    fail('release_artifact_family_shop_private_intake_digest_missing')
  }
  return true
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

function adminTechnicalCoordinationRegex({ version, date }, extension) {
  return new RegExp(`^supermega\\.admin-technical-${version}-coordination-packet\\.v[0-9]{1,3}\\.generated-${date}\\.${extension}$`, 'i')
}

function uniqueAdminTechnicalCoordinationFile(entries, family, extension) {
  const regex = adminTechnicalCoordinationRegex(family, extension)
  const matches = entries.filter((entry) => regex.test(entry)).sort()
  if (matches.length !== 1) {
    fail(matches.length === 0
      ? `release_artifact_family_admin_technical_coordination_${extension}_missing`
      : `release_artifact_family_admin_technical_coordination_${extension}_ambiguous`)
  }
  return matches[0]
}

export function verifyAdminTechnicalCoordinationBinding(packet, controlIndex, controlIndexFileName) {
  const verified = validateAdminTechnicalCoordinationPacket(packet)
  if (verified.candidate.commit !== controlIndex.candidate.commit) {
    fail('release_artifact_family_admin_technical_coordination_candidate_mismatch')
  }
  if (verified.candidate.branch !== controlIndex.candidate.branch) {
    fail('release_artifact_family_admin_technical_coordination_branch_mismatch')
  }
  if (verified.currentOwnerAction.gateId !== controlIndex.currentOwnerAction.gateId
    || verified.currentOwnerAction.sourcePacketFileName !== controlIndex.currentOwnerAction.sourcePacketFileName
    || verified.currentOwnerAction.sourceActionCardFileName !== controlIndex.currentOwnerAction.sourceActionCardFileName
    || verified.currentOwnerAction.exactCommit !== controlIndex.candidate.commit) {
    fail('release_artifact_family_admin_technical_coordination_owner_action_mismatch')
  }
  if (verified.shopPilot.day0Status !== controlIndex.shopPilot.day0Status
    || verified.shopPilot.currentPrivateGate !== controlIndex.shopPilot.currentPrivateGate
    || verified.shopPilot.customerContactAllowed !== false
    || verified.shopPilot.managedActivationAllowed !== false) {
    fail('release_artifact_family_admin_technical_coordination_shop_gate_mismatch')
  }
  if (verified.sourceFiles?.currentReleaseControlIndex !== controlIndexFileName) {
    fail('release_artifact_family_admin_technical_coordination_source_index_mismatch')
  }
  return verified
}

async function verifyRequiredAdminTechnicalCoordinationArtifact(baseDir, family, controlIndex, controlIndexFileName) {
  const entries = await readdir(baseDir).catch(() => [])
  const jsonFileName = uniqueAdminTechnicalCoordinationFile(entries, family, 'json')
  const markdownFileName = uniqueAdminTechnicalCoordinationFile(entries, family, 'md')
  const packet = verifyAdminTechnicalCoordinationBinding(
    await readJson(artifactPath(baseDir, jsonFileName), 'release_artifact_family_admin_technical_coordination_missing'),
    controlIndex,
    controlIndexFileName,
  )
  return { jsonFileName, markdownFileName, packet }
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
    ...(artifacts.githubMainProtectionOwnerActionCard
      ? [['githubMainProtectionOwnerActionCard', validateGitHubMainProtectionOwnerActionCard]]
      : []),
    ['shopPilotDay0Readiness', validateShopPilotDay0ReadinessPacket],
    ['shopPilotDay0OwnerBaselineActionCard', validateShopPilotDay0OwnerBaselineActionCard],
  ]
  const semanticArtifacts = ['releaseHandoff', 'githubMainProtectionSnapshot']
  const verifiedPackets = { releaseHandoff: handoff, githubMainProtectionSnapshot: snapshot }
  const verifiedSourceDigests = {}
  for (const [label, validator, options] of jsonArtifacts) {
    const artifact = artifacts[label]
    const artifactText = await readText(artifactPath(baseDir, artifact.fileName), `release_artifact_family_${label}_missing`)
    let artifactJson = null
    try {
      artifactJson = JSON.parse(artifactText)
    } catch {
      fail(`release_artifact_family_${label}_missing_json_invalid`)
    }
    const packet = validator(artifactJson, options)
    verifiedPackets[label] = packet
    verifiedSourceDigests[label] = digest(artifactText)
    jsonDigestFromPacket(label, packet, artifact)
    semanticArtifacts.push(label)
    if (packet?.candidate?.commit && packet.candidate.commit !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
    if (packet?.candidate?.head && packet.candidate.head !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
    if (packet?.candidateCommit && packet.candidateCommit !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
    if (packet?.currentAction?.candidateCommit && packet.currentAction.candidateCommit !== controlIndex.candidate.commit) fail(`release_artifact_family_${label}_candidate_mismatch`)
  }
  verifyShopDay0ProductMatrixBinding(
    verifiedPackets.productReadinessMatrix,
    verifiedPackets.shopPilotDay0Readiness,
    {
      ...artifacts.shopPilotDay0Readiness,
      sourceDigest: verifiedSourceDigests.shopPilotDay0Readiness,
    },
  )
  const adminTechnicalCoordination = await verifyRequiredAdminTechnicalCoordinationArtifact(
    baseDir,
    family,
    controlIndex,
    basename(controlPath),
  )
  semanticArtifacts.push('adminTechnicalCoordinationPacket')
  verifiedPackets.adminTechnicalCoordinationPacket = adminTechnicalCoordination.packet

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
  verifyShopPrivateIntakeDay0Binding(verifiedPackets.shopPilotDay0Readiness, extraArtifacts)

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
    adminTechnicalCoordination.jsonFileName,
    adminTechnicalCoordination.markdownFileName,
    ...ownerFacingFamilyFileNames(family),
  ].filter(Boolean))

  const leakFindings = []
  const clarityFindings = []
  let ownerFacingFilesScanned = 0
  ownerFacingFilesScanned += 1
  leakFindings.push(...scanOwnerFacingText(basename(controlPath), controlText))
  clarityFindings.push(...scanOwnerFacingMarkdownClarity(basename(controlPath), controlText))
  for (const fileName of ownerFacingNames) {
    const file = await maybeRead(baseDir, fileName)
    if (!file) continue
    ownerFacingFilesScanned += 1
    leakFindings.push(...scanOwnerFacingText(file.fileName, file.text))
    clarityFindings.push(...scanOwnerFacingMarkdownClarity(file.fileName, file.text))
  }
  if (leakFindings.length) fail(`release_artifact_family_owner_facing_leak:${leakFindings[0].fileName}:${leakFindings[0].pattern}`)
  if (clarityFindings.length) fail(`release_artifact_family_owner_facing_clarity:${clarityFindings[0].fileName}:${clarityFindings[0].pattern}`)
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
    ownerFacingClarityFindings: 0,
    blockersStillExpected: [
      controlIndex.currentOwnerAction.gateId === 'github_main_protection'
        ? 'github_main_protection_unverified'
        : 'owner_approval_missing',
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
  const clarityFindings = scanOwnerFacingMarkdownClarity('confusing.md', 'Ready to generate public baseline packet: false')
  const jsonClarityFindings = scanOwnerFacingMarkdownClarity('artifact.json', '{"completionSignal":"public_safe_baseline_packet_digest"}')
  const checks = {
    family_version_and_date_detected: family.version === 'v115' && family.date === '20260826',
    safe_text_has_no_findings: safeFindings.length === 0,
    leak_text_detects_path_contact_and_token: leakFindings.some((finding) => finding.pattern === 'windows_absolute_path')
      && leakFindings.some((finding) => finding.pattern === 'email_like')
      && leakFindings.some((finding) => finding.pattern === 'token_shape'),
    confusing_owner_markdown_labels_detected: clarityFindings.some((finding) => finding.pattern === 'public_baseline_packet_label'),
    json_internal_contract_tokens_not_flagged_as_markdown_clarity: jsonClarityFindings.length === 0,
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
