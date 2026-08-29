import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopBatchProfitControl, SHOP_BATCH_PROFIT_CONTROL_CONTRACT, SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256 } from './shop-batch-profit-control.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-batch-profit-control-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  projectShopBatchProfitControl,
  SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
  SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

const ACCEPTED_CONTRACT_SHA256 = 'd2968009e5eb18c44420e2fbbe6b40072e59b9bac0cda1e9ff531a4cae7b5910'
const EXPECTED_DIGESTS = {
  disposition: 'sha256:aeff6456e341079893caeafd26685d9256b7966a813f78f0b0b28028c749b96f',
  source: 'sha256:e7f7ba80fc3b25114dc6cbb702540c80f7028819a2347a0cb00ce27297af8be9',
  ledger: 'sha256:73610ca00ccfcc8574c2d512fa3b1cf56ec94ac1b1938035a3769c030784d184',
  production: 'sha256:95fbd91408b49f1bd8b154048cefbe64067de0e41350493f800a5e2c6aea17bc',
  overhead: 'sha256:cfdf5f3a056d269074edd8144a4bec73f9e1dfea2fd4afac71044893a1bc8116',
  retained: 'sha256:c68f538a8ae67f10e93c1753f4bb817e0af07f8286e1e78c3d848dd824ef4928',
  envelope: 'sha256:1daf6def90c74e62d923d2dc8cfead88e9b0e652a069edc1769212ee4919cb6c',
}

function normalizeCanonical(value) {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.normalize('NFC')
  if (typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'fixture canonical numbers are safe integers')
    return value
  }
  if (Array.isArray(value)) return value.map(normalizeCanonical)
  const result = {}
  for (const key of Object.keys(value).map((entry) => entry.normalize('NFC')).sort()) result[key] = normalizeCanonical(value[key])
  return result
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(normalizeCanonical(value))).digest('hex')}`
}

function without(value, field) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field))
}

function clone(value) {
  return structuredClone(value)
}

function sourceLine({ sku, order, completion, adjustment, units, value }) {
  return {
    sku,
    orderLineBindingDigest: `sha256:${order.repeat(64)}`,
    completionBindingDigest: `sha256:${completion.repeat(64)}`,
    completedAt: '2026-08-29T11:00:00.000Z',
    sourceBusinessDate: '2026-08-29',
    netUnits: units,
    netValueMmk: value,
    nonSample: false,
    paymentReconciled: true,
    completionPresent: true,
    returnCount: 0,
    refundCount: 0,
    correctionCount: 0,
    discountCount: 0,
    adjustmentBindingDigest: `sha256:${adjustment.repeat(64)}`,
  }
}

function costSource({ sku, recipe, basis, production, cost, units }) {
  return {
    sku,
    recipeRevisionDigest: `sha256:${recipe.repeat(64 / recipe.length)}`,
    estimateBasisDigest: `sha256:${basis.repeat(64 / basis.length)}`,
    productionRunBindingDigest: `sha256:${production.repeat(64 / production.length)}`,
    ownerReviewedStandardUnitCostEstimateMmk: cost,
    standardOutputUnits: units,
    batchProducedUnits: units,
    reviewedAt: '2026-08-29T09:10:00.000Z',
    effectiveFrom: '2026-08-29',
    effectiveTo: null,
    method: 'owner_reviewed_standard_unit_cost_estimate',
    reviewedByRole: 'Shop owner',
    estimateReasonCode: 'owner_standard_cost',
    reviewStatus: 'accepted',
    sourceState: 'accepted',
  }
}

function allocation({ id, line, revision = 1, supersedesAllocationId = null, priorUnits = 0, priorValue = 0 }) {
  return {
    allocationId: id,
    batchId: 'SYNTHETIC-BAKERY-BATCH-001',
    orderLineBindingDigest: line.orderLineBindingDigest,
    completionBindingDigest: line.completionBindingDigest,
    allocationMode: 'whole_net_line_only',
    assignmentReason: 'same_business_date',
    completedAt: line.completedAt,
    sourceBusinessDate: line.sourceBusinessDate,
    batchBusinessDate: '2026-08-29',
    retainedNetUnits: line.netUnits,
    retainedNetValueMmk: line.netValueMmk,
    allocatedNetUnits: line.netUnits,
    allocatedNetValueMmk: line.netValueMmk,
    priorAllocatedUnits: priorUnits,
    priorAllocatedValueMmk: priorValue,
    remainingUnitsBefore: line.netUnits,
    remainingValueBefore: line.netValueMmk,
    preorderBatchBindingDigest: null,
    envelopeRevision: revision,
    supersedesAllocationId,
  }
}

function buildFixture() {
  const dispositionCore = {
    contract: 'supermega.shop.batch_profit_control.disposition_core.v1',
    batchId: 'SYNTHETIC-BAKERY-BATCH-001',
    businessDate: '2026-08-29',
    projectionAt: '2026-08-29T12:00:00.000Z',
    status: 'closed',
    classification: 'synthetic_local_fixture_never_evidence',
    items: [
      { sku: 'BAK-CROISSANT', itemName: 'Butter Croissant', producedUnits: 15, leftoverUnits: 2, wastedUnits: 1, remakeUnits: 1, preorderUnits: 12 },
      { sku: 'BAK-MILK-BREAD', itemName: 'Milk Bread', producedUnits: 9, leftoverUnits: 1, wastedUnits: 0, remakeUnits: 0, preorderUnits: 8 },
      { sku: 'BAK-TEA-BUN', itemName: 'Tea Bun', producedUnits: 12, leftoverUnits: 1, wastedUnits: 1, remakeUnits: 0, preorderUnits: 10 },
    ],
    revision: 1,
  }
  const saleLines = [
    sourceLine({ sku: 'BAK-CROISSANT', order: 'a', completion: 'd', adjustment: '1', units: 12, value: 24_000 }),
    sourceLine({ sku: 'BAK-MILK-BREAD', order: 'b', completion: 'e', adjustment: '2', units: 8, value: 24_000 }),
    sourceLine({ sku: 'BAK-TEA-BUN', order: 'c', completion: 'f', adjustment: '3', units: 10, value: 15_000 }),
  ]
  const standardUnitCostEstimateSources = [
    costSource({ sku: 'BAK-CROISSANT', recipe: '4', basis: '5', production: '6', cost: 2_150, units: 15 }),
    costSource({ sku: 'BAK-MILK-BREAD', recipe: '7', basis: '8', production: '9', cost: 2_700, units: 9 }),
    costSource({ sku: 'BAK-TEA-BUN', recipe: 'ab', basis: 'bc', production: 'cd', cost: 1_000, units: 12 }),
  ]
  const sourceRecordSet = {
    contract: 'supermega.shop.batch_profit_control.source_record_set.v1',
    projectionAt: dispositionCore.projectionAt,
    saleLines,
    standardUnitCostEstimateSources,
    overheadSource: {
      batchId: dispositionCore.batchId,
      reviewedAt: '2026-08-29T11:30:00.000Z',
      packagingCostMmk: 3_000,
      deliveryCostMmk: 6_000,
      otherReviewedBatchCostMmk: 0,
      otherReviewedBatchCostReason: 'none',
      evidenceBindingDigest: `sha256:${'de'.repeat(32)}`,
      ownerReviewBindingDigest: `sha256:${'ef'.repeat(32)}`,
      revision: 1,
    },
    generatedReceiptsExcluded: true,
    batchId: dispositionCore.batchId,
    revision: 1,
  }
  const allocations = [
    allocation({ id: 'ALLOC-CROISSANT-001', line: saleLines[0] }),
    allocation({ id: 'ALLOC-MILK-001', line: saleLines[1] }),
    allocation({ id: 'ALLOC-TEA-001', line: saleLines[2] }),
  ]
  const saleAllocationLedger = {
    contract: 'supermega.shop.batch_profit_control.sale_allocation_ledger.v1',
    generatedAt: dispositionCore.projectionAt,
    projectionAt: dispositionCore.projectionAt,
    dispositionCoreDigest: '',
    sourceRecordSetDigest: '',
    allocations,
    controls: {
      sourceDerived: true,
      partialAllocationAllowed: false,
      crossBatchReuseAllowed: false,
      automaticDateOrSkuInference: false,
      customerIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
      sameBatchCorrectionReplacementAllowed: true,
    },
    ledgerDigest: '',
    batchId: dispositionCore.batchId,
    revision: 1,
  }
  const productionCostReceipt = {
    contract: 'supermega.shop.batch_profit_control.production_cost_receipt.v1',
    generatedAt: dispositionCore.projectionAt,
    projectionAt: dispositionCore.projectionAt,
    batchId: dispositionCore.batchId,
    businessDate: dispositionCore.businessDate,
    dispositionCoreDigest: '',
    sourceRecordSetDigest: '',
    method: 'owner_reviewed_standard_unit_cost_estimate',
    skuBindings: standardUnitCostEstimateSources.map((source) => ({ ...source, coveredProducedUnits: source.batchProducedUnits })),
    summary: {
      coveredSkuCount: 3,
      totalSkuCount: 3,
      coveredProducedUnits: 36,
      totalProducedUnits: 36,
      quantityCoverageComplete: true,
      partialCoverageCount: 0,
      ambiguousMethodCount: 0,
    },
    controls: {
      sourceDerived: false,
      finishedSkuPurchaseReceiptAloneAccepted: false,
      quantityCoverageRequired: true,
      supplierIdentityExported: false,
      accountingWrite: false,
      supplierWrite: false,
      stockWrite: false,
      hostedWrite: false,
      ownerReviewedEstimateReceiptRequired: true,
      manualProjectionUnitCostEntryAccepted: false,
    },
    receiptDigest: '',
    revision: 1,
  }
  const overheadReceipt = {
    contract: 'supermega.shop.batch_profit_control.overhead_receipt.v1',
    batchId: dispositionCore.batchId,
    projectionAt: dispositionCore.projectionAt,
    dispositionCoreDigest: '',
    sourceRecordSetDigest: '',
    reviewedAt: sourceRecordSet.overheadSource.reviewedAt,
    packagingCostMmk: sourceRecordSet.overheadSource.packagingCostMmk,
    deliveryCostMmk: sourceRecordSet.overheadSource.deliveryCostMmk,
    otherReviewedBatchCostMmk: sourceRecordSet.overheadSource.otherReviewedBatchCostMmk,
    otherReviewedBatchCostReason: sourceRecordSet.overheadSource.otherReviewedBatchCostReason,
    evidenceBindingDigest: sourceRecordSet.overheadSource.evidenceBindingDigest,
    ownerReviewBindingDigest: sourceRecordSet.overheadSource.ownerReviewBindingDigest,
    controls: {
      sourceDerived: true,
      customerIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    receiptDigest: '',
    revision: 1,
  }
  const retainedEvidenceReceipt = {
    contract: 'supermega.shop.batch_profit_control.retained_evidence_receipt.v1',
    generatedAt: dispositionCore.projectionAt,
    projectionAt: dispositionCore.projectionAt,
    batchId: dispositionCore.batchId,
    businessDate: dispositionCore.businessDate,
    dispositionCoreDigest: '',
    sourceRecordSetDigest: '',
    saleAllocationLedgerDigest: '',
    productionCostReceiptDigest: '',
    ownerReviewedOverheadReceiptDigest: '',
    saleLineBindings: [],
    productionCostSummary: {
      method: 'owner_reviewed_standard_unit_cost_estimate',
      productionCostReceiptDigest: '',
      coveredSkuCount: 3,
      coveredProducedUnits: 36,
      totalProducedUnits: 36,
      quantityCoverageComplete: true,
      ambiguousMethodCount: 0,
      partialCoverageCount: 0,
    },
    adjustmentSummary: {
      returnCount: 0,
      refundCount: 0,
      correctionCount: 0,
      discountCount: 0,
      unresolvedAdjustmentCount: 0,
      allAdjustmentsLinked: true,
    },
    controls: {
      sourceDerived: true,
      manualEvidenceAssertionAccepted: false,
      privateIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    receiptDigest: '',
    revision: 1,
  }
  const batchEnvelope = {
    contract: 'supermega.shop.batch_profit_control.batch_envelope.v1',
    batchId: dispositionCore.batchId,
    businessDate: dispositionCore.businessDate,
    projectionAt: dispositionCore.projectionAt,
    classification: dispositionCore.classification,
    dispositionCoreDigest: '',
    sourceRecordSetDigest: '',
    retainedEvidenceReceiptDigest: '',
    ownerReviewedOverheadReceiptDigest: '',
    envelopeDigest: '',
    revision: 1,
    priorEnvelopeDigest: null,
    revisionReasonCode: 'initial',
    logicalStatus: 'closed',
  }
  return reseal({
    dispositionCore,
    sourceRecordSet,
    saleAllocationLedger,
    productionCostReceipt,
    overheadReceipt,
    retainedEvidenceReceipt,
    batchEnvelope,
    workspaceBatchEnvelopes: [],
    workspaceSaleAllocations: [],
  })
}

function rebuildRetainedBindings(input) {
  const lines = new Map(input.sourceRecordSet.saleLines.map((line) => [line.orderLineBindingDigest, line]))
  input.retainedEvidenceReceipt.saleLineBindings = input.saleAllocationLedger.allocations.map((entry) => {
    const line = lines.get(entry.orderLineBindingDigest)
    return {
      ...entry,
      sku: line.sku,
      saleAllocationLedgerDigest: input.saleAllocationLedger.ledgerDigest,
      completedUnits: line.netUnits,
      completedSaleValueMmk: line.netValueMmk,
      nonSample: line.nonSample,
      paymentReconciled: line.paymentReconciled,
      completionPresent: line.completionPresent,
      returnCount: line.returnCount,
      refundCount: line.refundCount,
      correctionCount: line.correctionCount,
      discountCount: line.discountCount,
      adjustmentState: 'complete',
      adjustmentBindingDigest: line.adjustmentBindingDigest,
    }
  })
}

function reseal(input) {
  const dispositionDigest = digest(input.dispositionCore)
  const sourceDigest = digest(input.sourceRecordSet)
  input.saleAllocationLedger.dispositionCoreDigest = dispositionDigest
  input.saleAllocationLedger.sourceRecordSetDigest = sourceDigest
  input.saleAllocationLedger.ledgerDigest = digest(without(input.saleAllocationLedger, 'ledgerDigest'))
  input.productionCostReceipt.dispositionCoreDigest = dispositionDigest
  input.productionCostReceipt.sourceRecordSetDigest = sourceDigest
  input.productionCostReceipt.receiptDigest = digest(without(input.productionCostReceipt, 'receiptDigest'))
  input.overheadReceipt.dispositionCoreDigest = dispositionDigest
  input.overheadReceipt.sourceRecordSetDigest = sourceDigest
  input.overheadReceipt.receiptDigest = digest(without(input.overheadReceipt, 'receiptDigest'))
  input.retainedEvidenceReceipt.dispositionCoreDigest = dispositionDigest
  input.retainedEvidenceReceipt.sourceRecordSetDigest = sourceDigest
  input.retainedEvidenceReceipt.saleAllocationLedgerDigest = input.saleAllocationLedger.ledgerDigest
  input.retainedEvidenceReceipt.productionCostReceiptDigest = input.productionCostReceipt.receiptDigest
  input.retainedEvidenceReceipt.ownerReviewedOverheadReceiptDigest = input.overheadReceipt.receiptDigest
  input.retainedEvidenceReceipt.productionCostSummary.productionCostReceiptDigest = input.productionCostReceipt.receiptDigest
  rebuildRetainedBindings(input)
  input.retainedEvidenceReceipt.receiptDigest = digest(without(input.retainedEvidenceReceipt, 'receiptDigest'))
  input.batchEnvelope.dispositionCoreDigest = dispositionDigest
  input.batchEnvelope.sourceRecordSetDigest = sourceDigest
  input.batchEnvelope.retainedEvidenceReceiptDigest = input.retainedEvidenceReceipt.receiptDigest
  input.batchEnvelope.ownerReviewedOverheadReceiptDigest = input.overheadReceipt.receiptDigest
  input.batchEnvelope.envelopeDigest = digest(without(input.batchEnvelope, 'envelopeDigest'))
  return input
}

function makeRevisionTwo(first) {
  const next = clone(first)
  next.workspaceBatchEnvelopes = [clone(first.batchEnvelope)]
  next.workspaceSaleAllocations = clone(first.saleAllocationLedger.allocations)
  next.dispositionCore.revision = 2
  next.sourceRecordSet.revision = 2
  next.sourceRecordSet.overheadSource.revision = 2
  next.saleAllocationLedger.revision = 2
  next.productionCostReceipt.revision = 2
  next.overheadReceipt.revision = 2
  next.retainedEvidenceReceipt.revision = 2
  next.batchEnvelope.revision = 2
  next.batchEnvelope.priorEnvelopeDigest = first.batchEnvelope.envelopeDigest
  next.batchEnvelope.revisionReasonCode = 'owner_review_correction'
  next.saleAllocationLedger.allocations = next.saleAllocationLedger.allocations.map((entry) => ({
    ...entry,
    allocationId: `${entry.allocationId}-R2`,
    envelopeRevision: 2,
    supersedesAllocationId: entry.allocationId,
    priorAllocatedUnits: entry.allocatedNetUnits,
    priorAllocatedValueMmk: entry.allocatedNetValueMmk,
  }))
  return reseal(next)
}

function makeZeroSale(input, indexes) {
  const next = clone(input)
  for (const index of indexes) {
    next.sourceRecordSet.saleLines[index].netValueMmk = 0
    next.saleAllocationLedger.allocations[index].retainedNetValueMmk = 0
    next.saleAllocationLedger.allocations[index].allocatedNetValueMmk = 0
    next.saleAllocationLedger.allocations[index].remainingValueBefore = 0
  }
  return reseal(next)
}

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

async function rejects(input, code, label) {
  checks += 1
  await assert.rejects(() => projectShopBatchProfitControl(input), (error) => error instanceof Error && error.message === code, label)
}

check(SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256 === ACCEPTED_CONTRACT_SHA256, 'implementation binds the exact accepted R&D contract digest')
check(SHOP_BATCH_PROFIT_CONTROL_CONTRACT === 'supermega.shop.batch_profit_control.v1', 'output contract is exact')

const fixture = buildFixture()
check(digest(fixture.dispositionCore) === EXPECTED_DIGESTS.disposition, 'accepted disposition-core digest independently recomputes')
check(digest(fixture.sourceRecordSet) === EXPECTED_DIGESTS.source, 'accepted source-record-set digest independently recomputes')
check(fixture.saleAllocationLedger.ledgerDigest === EXPECTED_DIGESTS.ledger, 'accepted sale-ledger digest independently recomputes')
check(fixture.productionCostReceipt.receiptDigest === EXPECTED_DIGESTS.production, 'accepted production-cost-estimate digest independently recomputes')
check(fixture.overheadReceipt.receiptDigest === EXPECTED_DIGESTS.overhead, 'accepted overhead digest independently recomputes')
check(fixture.retainedEvidenceReceipt.receiptDigest === EXPECTED_DIGESTS.retained, 'accepted retained-evidence digest independently recomputes')
check(fixture.batchEnvelope.envelopeDigest === EXPECTED_DIGESTS.envelope, 'accepted envelope digest independently recomputes')

const projection = await projectShopBatchProfitControl(fixture)
check(projection.totals.producedUnits === 36 && projection.totals.completedSaleUnits === 30, 'produced and completed unit totals match the accepted vector')
check(projection.totals.leftoverUnits === 4 && projection.totals.wastedUnits === 2 && projection.totals.remakeUnits === 1, 'batch dispositions match the accepted vector')
check(projection.totals.totalCompletedSaleValueMmk === 63_000, 'retained net sold value is exact')
check(projection.totals.totalReviewedProductionCostEstimateMmk === 68_550, 'reviewed production-cost estimate is exact')
check(projection.totals.totalBatchOverheadMmk === 9_000 && projection.totals.totalBatchCostEstimateMmk === 77_550, 'reviewed overhead and total cost estimates are exact')
check(projection.estimatePreview?.batchContributionEstimateMmk === -14_550, 'batch contribution estimate is exact')
check(projection.estimatePreview?.aggregateContributionEstimateBasisPoints === -2_310, 'aggregate contribution-estimate basis points use signed floor')
check(projection.estimatePreview?.estimatedBreakEvenSoldValueMmk === 77_550 && projection.estimatePreview.remainingToEstimatedBreakEvenMmk === 14_550, 'break-even estimate is exact')
check(projection.estimatePreview?.observedAverageNetSalePerUnitMmk === 2_100 && projection.estimatePreview.breakEvenEquivalentCompletedUnits === 37, 'exact-rational break-even units do not reuse display rounding')
check(JSON.stringify(projection.estimatePreview?.overheadAllocationMmkBySku) === JSON.stringify({ 'BAK-CROISSANT': 3_429, 'BAK-MILK-BREAD': 3_428, 'BAK-TEA-BUN': 2_143 }), 'largest-remainder overhead allocation matches the accepted vector')
check(projection.estimatePreview?.estimatedMarginAtRiskMmk === 24_000, 'estimated margin at risk is exact')
check(projection.priorities.map((priority) => priority.sku).join(',') === 'BAK-CROISSANT,BAK-MILK-BREAD,BAK-TEA-BUN', 'priority order matches the accepted vector')
check(projection.evidenceStatus.profitStatus === 'withheld' && projection.evidenceStatus.withheldReasonCodes.join(',') === 'synthetic_or_sample_evidence_excluded', 'synthetic arithmetic never becomes evidence')
check(projection.truthBoundary.costLabel === 'Owner-reviewed production-cost estimate' && /never actual accounting cost/i.test(projection.truthBoundary.boundary), 'reviewed-estimate wording is permanent')
check(Object.values(projection.authority).every((value) => value === false), 'all external authority flags are false')
check([projection.truthBoundary.mayCountAsBaseline, projection.truthBoundary.mayCountAsPilotRun, projection.truthBoundary.mayCountAsCustomerEvidence, projection.truthBoundary.mayCountAsCommercialProof].every((value) => value === false), 'synthetic output cannot become baseline, pilot, customer, or commercial proof')

const reloaded = await projectShopBatchProfitControl(JSON.parse(JSON.stringify(fixture)))
check(JSON.stringify(reloaded) === JSON.stringify(projection), 'reload reproduces exact digests, estimates, nullable fields, and priority order')

for (const [label, mutate, code] of [
  ['disposition', (value) => { value.dispositionCore.items[0].preorderUnits += 1 }, 'shop_batch_profit_disposition_digest_mismatch'],
  ['source', (value) => { value.sourceRecordSet.saleLines[0].discountCount += 1 }, 'shop_batch_profit_retained_sale_source_mismatch'],
  ['ledger', (value) => { value.saleAllocationLedger.controls.automaticDateOrSkuInference = true }, 'shop_batch_profit_sale_ledger_controls_invalid'],
  ['production', (value) => { value.productionCostReceipt.summary.coveredSkuCount -= 1 }, 'shop_batch_profit_production_summary_invalid'],
  ['overhead', (value) => { value.overheadReceipt.packagingCostMmk += 1 }, 'shop_batch_profit_overhead_source_receipt_mismatch'],
  ['retained', (value) => { value.retainedEvidenceReceipt.adjustmentSummary.allAdjustmentsLinked = false }, 'shop_batch_profit_adjustment_linkage_incomplete'],
  ['envelope', (value) => { value.batchEnvelope.logicalStatus = 'draft' }, 'shop_batch_profit_envelope_digest_mismatch'],
]) {
  const tampered = clone(fixture)
  mutate(tampered)
  await rejects(tampered, code, `${label} tampering fails closed before projection`)
}

const zeroSale = makeZeroSale(fixture, [0])
const zeroSaleProjection = await projectShopBatchProfitControl(zeroSale)
check(zeroSaleProjection.priorities[0].sku === 'BAK-CROISSANT' && zeroSaleProjection.priorities[0].itemState === 'zero_sale_produced', 'zero-sale produced item ranks first')
check(zeroSaleProjection.priorities[0].contributionEstimateBasisPoints === null && zeroSaleProjection.priorities[0].allocatedBatchOverheadMmk === 0, 'zero-sale rate is unavailable and overhead remains zero')
check(zeroSaleProjection.priorities[0].marginRiskEstimateMmk === 32_250 && zeroSaleProjection.priorities[0].contributionEstimateMmk === -32_250, 'zero-sale exposure retains the reviewed production-cost estimate')

const allZeroSales = makeZeroSale(fixture, [0, 1, 2])
const allZeroProjection = await projectShopBatchProfitControl(allZeroSales)
check(allZeroProjection.estimatePreview === null && allZeroProjection.priorities.length === 0, 'all-zero sales withhold every decision metric and priority')
check(allZeroProjection.evidenceStatus.withheldReasonCodes.includes('completed_sale_value_zero'), 'all-zero sales exposes the exact blocker')

const realLocal = clone(fixture)
realLocal.dispositionCore.classification = 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof'
realLocal.batchEnvelope.classification = realLocal.dispositionCore.classification
for (const line of realLocal.sourceRecordSet.saleLines) line.nonSample = true
reseal(realLocal)
const localProjection = await projectShopBatchProfitControl(realLocal)
check(localProjection.evidenceStatus.profitStatus === 'available', 'complete retained non-sample local evidence can expose the estimate')
check(localProjection.truthBoundary.mayCountAsPilotRun === false && localProjection.truthBoundary.mayCountAsCommercialProof === false, 'local estimate still cannot become pilot or commercial proof')

const revisionTwo = makeRevisionTwo(fixture)
const revisionTwoProjection = await projectShopBatchProfitControl(revisionTwo)
check(revisionTwoProjection.batchIdentity.revision === 2 && revisionTwoProjection.batchIdentity.priorEnvelopeDigest === fixture.batchEnvelope.envelopeDigest, 'one immutable child revision binds the exact prior envelope')
check(JSON.stringify(revisionTwoProjection.estimatePreview) === JSON.stringify(projection.estimatePreview), 'same-source correction revision is deterministic')

const wrongPrior = clone(revisionTwo)
wrongPrior.batchEnvelope.priorEnvelopeDigest = `sha256:${'0'.repeat(64)}`
wrongPrior.batchEnvelope.envelopeDigest = digest(without(wrongPrior.batchEnvelope, 'envelopeDigest'))
await rejects(wrongPrior, 'shop_batch_profit_revision_prior_mismatch', 'wrong prior envelope digest fails closed')

const gap = clone(revisionTwo)
gap.workspaceBatchEnvelopes = []
await rejects(gap, 'shop_batch_profit_revision_lineage_gap', 'revision gap fails closed')

const crossBatch = clone(fixture)
crossBatch.workspaceSaleAllocations = [{ ...clone(fixture.saleAllocationLedger.allocations[0]), batchId: 'OTHER-BATCH' }]
await rejects(crossBatch, 'shop_batch_profit_cross_batch_sale_reuse', 'cross-batch retained sale reuse fails closed')

const partialCost = clone(fixture)
partialCost.productionCostReceipt.skuBindings[0].coveredProducedUnits = 14
partialCost.productionCostReceipt.summary.coveredProducedUnits = 35
partialCost.productionCostReceipt.summary.quantityCoverageComplete = false
partialCost.productionCostReceipt.summary.partialCoverageCount = 1
reseal(partialCost)
await rejects(partialCost, 'shop_batch_profit_produced_quantity_cost_coverage_incomplete', 'partial produced-quantity cost coverage fails closed')

const staleCost = clone(fixture)
staleCost.sourceRecordSet.standardUnitCostEstimateSources[0].reviewedAt = '2026-02-01T09:10:00Z'
staleCost.productionCostReceipt.skuBindings[0].reviewedAt = '2026-02-01T09:10:00Z'
reseal(staleCost)
await rejects(staleCost, 'shop_batch_profit_cost_estimate_stale', 'stale reviewed estimate fails closed')

const crossDate = clone(fixture)
crossDate.sourceRecordSet.saleLines[0].sourceBusinessDate = '2026-08-28'
crossDate.saleAllocationLedger.allocations[0].sourceBusinessDate = '2026-08-28'
reseal(crossDate)
await rejects(crossDate, 'shop_batch_profit_cross_date_preorder_binding_missing', 'cross-date allocation without preorder binding fails closed')

const privateField = clone(fixture)
privateField.sourceRecordSet.saleLines[0].customerName = 'Private fixture identity'
await rejects(privateField, 'shop_batch_profit_sale_line_shape_invalid', 'private or uncontracted sale fields fail exact-shape validation')

const overflow = clone(fixture)
overflow.dispositionCore.items[0].producedUnits = 100_000
overflow.dispositionCore.items[0].leftoverUnits = 99_987
overflow.sourceRecordSet.standardUnitCostEstimateSources[0].ownerReviewedStandardUnitCostEstimateMmk = 1_000_000_000_000
overflow.sourceRecordSet.standardUnitCostEstimateSources[0].standardOutputUnits = 100_000
overflow.sourceRecordSet.standardUnitCostEstimateSources[0].batchProducedUnits = 100_000
overflow.productionCostReceipt.skuBindings[0].ownerReviewedStandardUnitCostEstimateMmk = 1_000_000_000_000
overflow.productionCostReceipt.skuBindings[0].standardOutputUnits = 100_000
overflow.productionCostReceipt.skuBindings[0].batchProducedUnits = 100_000
overflow.productionCostReceipt.skuBindings[0].coveredProducedUnits = 100_000
overflow.productionCostReceipt.summary.coveredProducedUnits = 100_021
overflow.productionCostReceipt.summary.totalProducedUnits = 100_021
overflow.retainedEvidenceReceipt.productionCostSummary.coveredProducedUnits = 100_021
overflow.retainedEvidenceReceipt.productionCostSummary.totalProducedUnits = 100_021
reseal(overflow)
await rejects(overflow, 'shop_batch_profit_numeric_range_exceeded', 'unsafe serialized arithmetic fails the complete projection')

const sourceText = await readFile('showroom/src/core/shop-batch-profit-control.ts', 'utf8')
check(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/.test(sourceText), 'core engine has no network or storage primitive')
check(!/actual (?:accounting )?(?:cost|profit)|customer proof|commercial proof/iu.test(sourceText.replace(/never actual accounting cost|Not actual accounting cost/g, '')), 'source does not claim actual cost, actual profit, customer proof, or commercial proof')
check((sourceText.match(/paymentWrite: false/g) ?? []).length >= 2 && (sourceText.match(/stockWrite: false/g) ?? []).length >= 2, 'source and output controls keep payment and stock writes false')

const packageSource = await readFile('package.json', 'utf8')
check(packageSource.includes('"shop:batch-profit-control:verify": "node tools/test_shop_batch_profit_control.mjs"'), 'package registers the focused Batch verifier')
check(packageSource.includes('"postshop:profit-control:verify": "npm run shop:batch-profit-control:verify"'), 'the existing serial Profit Control gate invokes the Batch verifier')

console.log(JSON.stringify({ contract: SHOP_BATCH_PROFIT_CONTROL_CONTRACT, checks, acceptedContractSha256: ACCEPTED_CONTRACT_SHA256, authority: 'local_read_only_no_external_write' }))
