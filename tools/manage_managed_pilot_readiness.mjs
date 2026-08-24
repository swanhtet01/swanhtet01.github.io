import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

import {
  MANAGED_PILOT_READINESS_SOURCE_PATHS,
  buildManagedPilotReadiness,
  readinessDigest,
  validateManagedPilotReadiness,
} from '../kernel/managed-pilot-readiness.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json')
const sources = MANAGED_PILOT_READINESS_SOURCE_PATHS
const DECISION_PREVIEW_CONTRACT = 'supermega.managed-pilot-decision-preview.v1'
const DECISION_PREVIEW_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']

async function currentLedger() {
  const texts = new Map()
  for (const path of sources) texts.set(path, await readFile(resolve(root, path), 'utf8'))
  const sourceReceipts = sources.map((path) => ({ path, digest: readinessDigest(texts.get(path)) }))
  return buildManagedPilotReadiness({
    portfolio: JSON.parse(texts.get('hq/portfolio.json')),
    databaseEvidence: JSON.parse(texts.get('hq/research/postgres17-rehearsal.json')),
    storageAudit: texts.get('hq/pilots/private-storage-privacy-audit.md'),
    securityAudit: JSON.parse(texts.get('hq/readiness/supabase-security-advisor-audit.json')),
    hqNow: texts.get('hq/NOW.md'),
    packageManifest: JSON.parse(texts.get('package.json')),
    sourceReceipts,
  })
}

function buildDecisionPreview(readiness, selectedProduct = null) {
  const selected = selectedProduct ? readiness.products.find((entry) => entry.productId === selectedProduct) : null
  return {
    contract: DECISION_PREVIEW_CONTRACT,
    asOf: readiness.asOf,
    pilotMode: readiness.pilotMode,
    sourceDigest: readiness.sourceDigest,
    ownerApprovalRequired: true,
    createsAuthority: false,
    createsAuthorityIn: false,
    approvalReceiptRequired: false,
    previewMode: true,
    selectedProduct: selectedProduct || 'none',
    selectedProposal: selected
      ? {
          productId: selected.productId,
          localStatus: selected.localStatus,
          managedPilotStatus: selected.managedPilotStatus,
          automationStatus: selected.automationStatus,
          workOrderId: selected.workOrderId,
          proposedWork: selected.proposedWork,
          blockingReason: selected.blockingReason,
          requiredProof: selected.requiredProof,
        }
      : null,
    operator: {
      productId: readiness.founderDecision.operator.productId,
      pilotMode: readiness.founderDecision.operator.pilotMode,
      namedBusinessRequired: readiness.founderDecision.operator.namedBusinessRequired,
      namedOperatorRequired: readiness.founderDecision.operator.namedOperatorRequired,
      measuredBaselineRequired: readiness.founderDecision.operator.measuredBaselineRequired,
      acceptanceEvidenceRequired: readiness.founderDecision.operator.acceptanceEvidenceRequired,
      requiredConsecutiveAcceptedRuns: readiness.founderDecision.operator.requiredConsecutiveAcceptedRuns,
    },
    decisions: readiness.products.map((product) => ({
      productId: product.productId,
      managedPilotStatus: product.managedPilotStatus,
      automationStatus: product.automationStatus,
      blocked: true,
      nextAction: 'proposal_only',
      prohibitedActions: [...readiness.founderDecision.doesNotAuthorize],
      requiredProof: product.requiredProof,
    })),
    controls: {
      externalWritesPerformed: false,
      connectorRequestsPerformedToBuild: readiness.controls.connectorRequestsPerformedToBuild,
      modelCallsRequiredToBuild: readiness.controls.modelCallsRequiredToBuild,
      productionWritesEnabled: readiness.controls.productionWritesEnabled,
      ownerApprovalRequired: true,
      safeAutomatedActions: ['rebuild_local_evidence', 'verify_current_ledger', 'rehearse_local_client_package'],
      forbiddenUntilReady: readiness.controls.forbiddenUntilReady,
      doesNotAuthorize: [...readiness.founderDecision.doesNotAuthorize],
      proposes: [...readiness.founderDecision.proposedActions],
    },
    evidence: {
      nextAction: readiness.overall.nextAction,
      sourceDigest: readiness.sourceDigest,
      status: readiness.overall.status,
      blockingGateCount: readiness.overall.blockingGateCount,
      localDatabaseProofReady: readiness.overall.localDatabaseProofReady,
      productionSourceParityReady: readiness.overall.productionSourceParityReady,
      hostedActivationReady: readiness.overall.hostedActivationReady,
    },
    sourceReceipts: readiness.sourceReceipts.map((entry) => ({ ...entry })),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const previewMode = args[0] === '--decision-preview'
  if (args[0] && !previewMode && args[0] !== '--verify') {
    throw new Error('managed_pilot_readiness_arguments_invalid')
  }
  if (previewMode && args.length > 2) throw new Error('managed_pilot_readiness_arguments_invalid')
  if (previewMode && args[1] && !DECISION_PREVIEW_PRODUCTS.includes(args[1])) {
    throw new Error('managed_pilot_readiness_decision_preview_product_invalid')
  }
  const expected = currentLedger()
  if (args[0] === '--verify') {
    const actual = validateManagedPilotReadiness(JSON.parse(await readFile(output, 'utf8')))
    if (JSON.stringify(actual) !== JSON.stringify(await expected)) throw new Error('managed_pilot_readiness_evidence_stale')
    console.log(JSON.stringify({ ok: true, contract: actual.contract, products: actual.products.length, blockingGates: actual.overall.blockingGateCount, hostedActivationReady: false }))
    return
  }
  if (previewMode) {
    const readiness = await expected
    const product = args[1] || null
    const preview = buildDecisionPreview(readiness, product)
    console.log(JSON.stringify(preview))
    return
  }
  const ledger = await expected
  await mkdir(dirname(output), { recursive: true })
  const staged = resolve(dirname(output), `.managed-pilot-readiness.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, output)
  console.log(JSON.stringify({ ok: true, contract: ledger.contract, output: relative(root, output).split(sep).join('/'), products: ledger.products.length, blockingGates: ledger.overall.blockingGateCount, hostedActivationReady: false }))
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || 'managed_pilot_readiness_failed').slice(0, 240), externalWritesPerformed: false }))
  process.exitCode = 1
})
