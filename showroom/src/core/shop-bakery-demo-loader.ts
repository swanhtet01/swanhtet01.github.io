import type { CommerceState } from './commerce-workspace'
import {
  projectShopCostCoverageAndMarginAtRisk,
  type ShopCostCoverageAndMarginAtRisk,
} from './shop-cost-coverage-and-margin-at-risk'
import {
  type ShopBatchProfitControlInput,
  type ShopBatchProfitControlProjection,
} from './shop-batch-profit-control'
import {
  SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
  SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
} from './shop-batch-profit-control-view'

export const SHOP_BAKERY_DEMO_CLASSIFICATION = 'synthetic local demo only — never pilot, customer, or commercial proof' as const
export const SHOP_BAKERY_DEMO_FIXTURE_DIGEST = 'sha256:60f90d6e79e0a6048cc6b1d49a02ea18ae990f5e4aca72ae03a8fb6a3292c006' as const
export const SHOP_BAKERY_DEMO_EXPECTED_PROJECTION_DIGEST = 'sha256:fca4dfe3030dd8f6445ac364c50205b8501f248b3372be213ce4d028cda2517d' as const
export const SHOP_BAKERY_BATCH_DEMO_INPUT_DIGEST = 'sha256:1d2e0cad93a3b30f9b496ce6598432e07b7a41b2ed42c43a9fc83653f3ea2d37' as const
export const SHOP_BAKERY_BATCH_DEMO_EXPECTED_PROJECTION_DIGEST = 'sha256:62f01c3210bd819c4ef3cc7c7565b5a9dd440e41c991a89a675d76d0513c9a9a' as const

export const SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS = Object.freeze({
  scenarioFileSha256: 'sha256:d0f94e8a709f541d4ca59045f7af23cf51789176d74aaf92962c0956b56eaf8b',
  validationReceiptSha256: 'sha256:a6a3fe7ef4be7dbd69e574687e668884d007d8a503f5381373b03ce68f61b787',
  runSheetSha256: 'sha256:e540b6a3adc36e5125ca224cdd26de81c2c30d38e819f1922a164a2c4d63e565',
})

const SHOP_BAKERY_DEMO_SOURCE = deepFreeze({
  contract: 'supermega.shop-bakery-demo-scenario.v1',
  classification: 'synthetic_local_demo_never_pilot_customer_or_commercial_proof',
  purpose: 'Provide one deterministic Bakery Profit Control demonstration with complete reviewed cost evidence and exact expected priorities.',
  acceptedArtifacts: SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS,
  sourceBinding: {
    releaseAuthority: 'v221',
    releaseCandidate: '6cc075522669be53896e62d561132ab98bcdf45f',
    marginProjectionCommit: 'b53c7b9fbadff2ac54a91dbe628865d33da8f21f',
    marginProjectionTree: 'a948ff215a5d343c24dcf2096c6c4190e7d654fa',
    marginFloorBasisPoints: 1_500,
  },
  story: {
    businessLabel: 'Synthetic Yangon bakery demo',
    closeQuestion: 'Which bakery item is losing money, which is below the 15 percent floor, and what must the owner review before the next close?',
    items: [
      { sku: 'BAK-CROISSANT', name: 'Butter Croissant', quantitySold: 12, unitSellMmk: 2_000, reviewedUnitCostMmk: 2_150, expectedStatus: 'critical_negative_margin' },
      { sku: 'BAK-MILK-BREAD', name: 'Milk Bread', quantitySold: 8, unitSellMmk: 3_000, reviewedUnitCostMmk: 2_700, expectedStatus: 'attention_below_floor' },
      { sku: 'BAK-TEA-BUN', name: 'Tea Bun', quantitySold: 10, unitSellMmk: 1_500, reviewedUnitCostMmk: 1_000, expectedStatus: 'controlled_above_floor' },
    ],
  },
  workspace: {
    schema: 'supermega.commerce.workspace.v2',
    items: [],
    orders: [{
      id: 'BAKERY-ORDER-001',
      createdAt: '2026-08-29T10:00:00.000Z',
      customer: 'Synthetic bakery buyer',
      owner: 'Synthetic bakery operator',
      channel: 'Counter',
      item: 'Butter Croissant, Milk Bread, Tea Bun',
      quantity: 30,
      payment: 'Cash',
      paymentStatus: 'reconciled',
      refundStatus: 'none',
      paymentReconciledAt: '2026-08-29T10:30:00.000Z',
      paymentReconciliationActionId: 'ACT-BAKERY-PAY-001',
      paymentReconciledBy: 'Synthetic bakery operator',
      paymentReconciliationReason: 'Synthetic local demo settlement review.',
      paymentEvidenceReference: 'BAKERY-PAYMENT-EVIDENCE-001',
      lines: [
        { sku: 'BAK-CROISSANT', name: 'Butter Croissant', quantity: 12, unitPriceMmk: 2_000 },
        { sku: 'BAK-MILK-BREAD', name: 'Milk Bread', quantity: 8, unitPriceMmk: 3_000 },
        { sku: 'BAK-TEA-BUN', name: 'Tea Bun', quantity: 10, unitPriceMmk: 1_500 },
      ],
      calculation: {
        schema: 'supermega.commerce.order-calculation.v1',
        currency: 'MMK',
        catalogRevision: 1,
        subtotalMmk: 63_000,
        taxMode: 'not_configured',
        taxMmk: 0,
        totalMmk: 63_000,
      },
      total: 63_000,
      status: 'completed',
      completion: {
        actionId: 'ACT-BAKERY-COMPLETE-001',
        capturedAt: '2026-08-29T11:00:00.000Z',
        actor: 'Synthetic bakery operator',
        reason: 'Retain synthetic local demo evidence.',
        evidenceReference: 'BAKERY-COMPLETION-EVIDENCE-001',
      },
    }],
    movements: [
      {
        id: 'MOV-BAK-CROISSANT-001',
        actionId: 'ACT-BAKERY-RECEIPT-CROISSANT-001',
        createdAt: '2026-08-29T09:15:00.000Z',
        actor: 'Synthetic bakery operator',
        reason: 'Receive synthetic reviewed cost lot.',
        evidenceReference: 'BAKERY-RECEIPT-CROISSANT-001',
        kind: 'receipt',
        sku: 'BAK-CROISSANT',
        quantityDelta: 12,
        purchaseOrderId: 'PO-BAK-CROISSANT-001',
      },
      {
        id: 'MOV-BAK-MILK-BREAD-001',
        actionId: 'ACT-BAKERY-RECEIPT-MILK-BREAD-001',
        createdAt: '2026-08-29T09:15:00.000Z',
        actor: 'Synthetic bakery operator',
        reason: 'Receive synthetic reviewed cost lot.',
        evidenceReference: 'BAKERY-RECEIPT-MILK-BREAD-001',
        kind: 'receipt',
        sku: 'BAK-MILK-BREAD',
        quantityDelta: 8,
        purchaseOrderId: 'PO-BAK-MILK-BREAD-001',
      },
      {
        id: 'MOV-BAK-TEA-BUN-001',
        actionId: 'ACT-BAKERY-RECEIPT-TEA-BUN-001',
        createdAt: '2026-08-29T09:15:00.000Z',
        actor: 'Synthetic bakery operator',
        reason: 'Receive synthetic reviewed cost lot.',
        evidenceReference: 'BAKERY-RECEIPT-TEA-BUN-001',
        kind: 'receipt',
        sku: 'BAK-TEA-BUN',
        quantityDelta: 10,
        purchaseOrderId: 'PO-BAK-TEA-BUN-001',
      },
    ],
    closes: [],
    purchaseOrders: [
      {
        id: 'PO-BAK-CROISSANT-001',
        createdAt: '2026-08-29T09:00:00.000Z',
        supplier: 'Synthetic ingredient source',
        sku: 'BAK-CROISSANT',
        quantityOrdered: 12,
        unitCostMmk: 2_150,
        creation: {
          actionId: 'ACT-BAKERY-PO-CROISSANT-001',
          capturedAt: '2026-08-29T09:00:00.000Z',
          actor: 'Synthetic bakery operator',
          reason: 'Record synthetic reviewed cost.',
          evidenceReference: 'BAKERY-PO-CROISSANT-001',
        },
        supplierInvoice: {
          id: 'INV-BAK-CROISSANT-001',
          supplierReference: 'SUP-BAK-CROISSANT-001',
          issuedAt: '2026-08-29T09:00:00.000Z',
          dueAt: '2026-08-30T09:00:00.000Z',
          quantityInvoiced: 12,
          unitCostMmk: 2_150,
          totalMmk: 25_800,
          recording: {
            actionId: 'ACT-BAKERY-INV-CROISSANT-001',
            capturedAt: '2026-08-29T09:05:00.000Z',
            actor: 'Synthetic bakery operator',
            reason: 'Record synthetic invoice.',
            evidenceReference: 'BAKERY-INV-CROISSANT-001',
          },
          payableReview: {
            actionId: 'ACT-BAKERY-REVIEW-CROISSANT-001',
            capturedAt: '2026-08-29T09:10:00.000Z',
            actor: 'Synthetic bakery operator',
            reason: 'Review synthetic cost evidence.',
            evidenceReference: 'BAKERY-REVIEW-CROISSANT-001',
          },
        },
      },
      {
        id: 'PO-BAK-MILK-BREAD-001',
        createdAt: '2026-08-29T09:00:00.000Z',
        supplier: 'Synthetic ingredient source',
        sku: 'BAK-MILK-BREAD',
        quantityOrdered: 8,
        unitCostMmk: 2_700,
        creation: {
          actionId: 'ACT-BAKERY-PO-MILK-BREAD-001',
          capturedAt: '2026-08-29T09:00:00.000Z',
          actor: 'Synthetic bakery operator',
          reason: 'Record synthetic reviewed cost.',
          evidenceReference: 'BAKERY-PO-MILK-BREAD-001',
        },
        supplierInvoice: {
          id: 'INV-BAK-MILK-BREAD-001',
          supplierReference: 'SUP-BAK-MILK-BREAD-001',
          issuedAt: '2026-08-29T09:00:00.000Z',
          dueAt: '2026-08-30T09:00:00.000Z',
          quantityInvoiced: 8,
          unitCostMmk: 2_700,
          totalMmk: 21_600,
          recording: {
            actionId: 'ACT-BAKERY-INV-MILK-BREAD-001',
            capturedAt: '2026-08-29T09:05:00.000Z',
            actor: 'Synthetic bakery operator',
            reason: 'Record synthetic invoice.',
            evidenceReference: 'BAKERY-INV-MILK-BREAD-001',
          },
          payableReview: {
            actionId: 'ACT-BAKERY-REVIEW-MILK-BREAD-001',
            capturedAt: '2026-08-29T09:10:00.000Z',
            actor: 'Synthetic bakery operator',
            reason: 'Review synthetic cost evidence.',
            evidenceReference: 'BAKERY-REVIEW-MILK-BREAD-001',
          },
        },
      },
      {
        id: 'PO-BAK-TEA-BUN-001',
        createdAt: '2026-08-29T09:00:00.000Z',
        supplier: 'Synthetic ingredient source',
        sku: 'BAK-TEA-BUN',
        quantityOrdered: 10,
        unitCostMmk: 1_000,
        creation: {
          actionId: 'ACT-BAKERY-PO-TEA-BUN-001',
          capturedAt: '2026-08-29T09:00:00.000Z',
          actor: 'Synthetic bakery operator',
          reason: 'Record synthetic reviewed cost.',
          evidenceReference: 'BAKERY-PO-TEA-BUN-001',
        },
        supplierInvoice: {
          id: 'INV-BAK-TEA-BUN-001',
          supplierReference: 'SUP-BAK-TEA-BUN-001',
          issuedAt: '2026-08-29T09:00:00.000Z',
          dueAt: '2026-08-30T09:00:00.000Z',
          quantityInvoiced: 10,
          unitCostMmk: 1_000,
          totalMmk: 10_000,
          recording: {
            actionId: 'ACT-BAKERY-INV-TEA-BUN-001',
            capturedAt: '2026-08-29T09:05:00.000Z',
            actor: 'Synthetic bakery operator',
            reason: 'Record synthetic invoice.',
            evidenceReference: 'BAKERY-INV-TEA-BUN-001',
          },
          payableReview: {
            actionId: 'ACT-BAKERY-REVIEW-TEA-BUN-001',
            capturedAt: '2026-08-29T09:10:00.000Z',
            actor: 'Synthetic bakery operator',
            reason: 'Review synthetic cost evidence.',
            evidenceReference: 'BAKERY-REVIEW-TEA-BUN-001',
          },
        },
      },
    ],
  },
  expectedProjection: {
    contract: 'supermega.shop.cost_coverage_and_margin_at_risk.v1',
    state: 'margin_at_risk',
    coverageBasisPoints: 10_000,
    soldValueMmk: 63_000,
    coveredSoldValueMmk: 63_000,
    retainedNonSampleCompletedSaleCount: 1,
    countedLineCount: 3,
    fullyCostedLineCount: 3,
    grossProfitMmk: 5_600,
    aggregateMarginBasisPoints: 888,
    marginAtRiskMmk: 6_600,
    priorityOrder: ['BAK-CROISSANT', 'BAK-MILK-BREAD'],
    priorities: [
      { sku: 'BAK-CROISSANT', severity: 'critical', marginMmk: -1_800, marginBasisPoints: -750, exposureMmk: 5_400 },
      { sku: 'BAK-MILK-BREAD', severity: 'attention', marginMmk: 2_400, marginBasisPoints: 1_000, exposureMmk: 1_200 },
    ],
    healthySkuExcludedFromPriorities: 'BAK-TEA-BUN',
    authorityAllFalse: true,
    boundaryMustInclude: 'not pilot, customer, or commercial proof',
  },
  controls: {
    syntheticFixture: true,
    mayCountAsBaseline: false,
    mayCountAsPilotRun: false,
    mayCountAsCustomerEvidence: false,
    mayCountAsCommercialProof: false,
    paymentWrite: false,
    stockWrite: false,
    supplierWrite: false,
    accountingWrite: false,
    customerWrite: false,
    localWorkspaceWrite: false,
    managedWorkspaceWrite: false,
    hostedWrite: false,
    providerWrite: false,
    productionWrite: false,
    modelUsed: false,
  },
} as const)

export type ShopBakeryMarginDemoResult = Readonly<{
  contract: 'supermega.shop-bakery-margin-demo.v1'
  classification: typeof SHOP_BAKERY_DEMO_CLASSIFICATION
  businessLabel: 'Synthetic Yangon bakery demo'
  closeQuestion: string
  sourceDigest: string
  expectedProjectionDigest: string
  projection: Readonly<ShopCostCoverageAndMarginAtRisk>
  controls: typeof SHOP_BAKERY_DEMO_SOURCE.controls
}>

const SHOP_BAKERY_BATCH_DEMO_CONTROLS = Object.freeze({
  baselineEvidenceAllowed: false,
  pilotEvidenceAllowed: false,
  customerEvidenceAllowed: false,
  commercialProofAllowed: false,
  localWorkspaceWrite: false,
  managedWorkspaceWrite: false,
  paymentWrite: false,
  stockWrite: false,
  supplierWrite: false,
  accountingWrite: false,
  customerWrite: false,
  hostedWrite: false,
  providerWrite: false,
  productionWrite: false,
  modelUsed: false,
})

export type ShopBakeryBatchDemoResult = Readonly<{
  projection: Readonly<ShopBatchProfitControlProjection>
}>

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  }
  return value as Readonly<T>
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('shop_bakery_demo_non_finite_number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}'
  }
  throw new Error('shop_bakery_demo_non_json_value')
}

async function sha256(value: string) {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('shop_bakery_demo_digest_unavailable')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return 'sha256:' + Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function withoutField(value: Record<string, unknown>, field: string) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field))
}

async function canonicalDigest(value: unknown) {
  return sha256(canonicalJson(value))
}

function batchSaleLine({ sku, order, completion, adjustment, units, value }: {
  sku: string
  order: string
  completion: string
  adjustment: string
  units: number
  value: number
}): ShopBatchProfitControlInput['sourceRecordSet']['saleLines'][number] {
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

function batchCostSource({ sku, recipe, basis, production, cost, units }: {
  sku: string
  recipe: string
  basis: string
  production: string
  cost: number
  units: number
}): ShopBatchProfitControlInput['sourceRecordSet']['standardUnitCostEstimateSources'][number] {
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

function batchAllocation({ id, line }: {
  id: string
  line: ShopBatchProfitControlInput['sourceRecordSet']['saleLines'][number]
}): ShopBatchProfitControlInput['saleAllocationLedger']['allocations'][number] {
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
    priorAllocatedUnits: 0,
    priorAllocatedValueMmk: 0,
    remainingUnitsBefore: line.netUnits,
    remainingValueBefore: line.netValueMmk,
    preorderBatchBindingDigest: null,
    envelopeRevision: 1,
    supersedesAllocationId: null,
  }
}

async function buildShopBakeryBatchDemoInput(): Promise<ShopBatchProfitControlInput> {
  const dispositionCore: ShopBatchProfitControlInput['dispositionCore'] = {
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
  const saleLines: ShopBatchProfitControlInput['sourceRecordSet']['saleLines'] = [
    batchSaleLine({ sku: 'BAK-CROISSANT', order: 'a', completion: 'd', adjustment: '1', units: 12, value: 24_000 }),
    batchSaleLine({ sku: 'BAK-MILK-BREAD', order: 'b', completion: 'e', adjustment: '2', units: 8, value: 24_000 }),
    batchSaleLine({ sku: 'BAK-TEA-BUN', order: 'c', completion: 'f', adjustment: '3', units: 10, value: 15_000 }),
  ]
  const standardUnitCostEstimateSources: ShopBatchProfitControlInput['sourceRecordSet']['standardUnitCostEstimateSources'] = [
    batchCostSource({ sku: 'BAK-CROISSANT', recipe: '4', basis: '5', production: '6', cost: 2_150, units: 15 }),
    batchCostSource({ sku: 'BAK-MILK-BREAD', recipe: '7', basis: '8', production: '9', cost: 2_700, units: 9 }),
    batchCostSource({ sku: 'BAK-TEA-BUN', recipe: 'ab', basis: 'bc', production: 'cd', cost: 1_000, units: 12 }),
  ]
  const sourceRecordSet: ShopBatchProfitControlInput['sourceRecordSet'] = {
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
    batchAllocation({ id: 'ALLOC-CROISSANT-001', line: saleLines[0] }),
    batchAllocation({ id: 'ALLOC-MILK-001', line: saleLines[1] }),
    batchAllocation({ id: 'ALLOC-TEA-001', line: saleLines[2] }),
  ]
  const saleAllocationLedger: ShopBatchProfitControlInput['saleAllocationLedger'] = {
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
  const productionCostReceipt: ShopBatchProfitControlInput['productionCostReceipt'] = {
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
  const overheadReceipt: ShopBatchProfitControlInput['overheadReceipt'] = {
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
  const retainedEvidenceReceipt: ShopBatchProfitControlInput['retainedEvidenceReceipt'] = {
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
  const batchEnvelope: ShopBatchProfitControlInput['batchEnvelope'] = {
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
  const workspaceHistorySnapshot: ShopBatchProfitControlInput['workspaceHistorySnapshot'] = {
    contract: 'supermega.shop.batch_profit_control.workspace_history_snapshot.v1',
    capturedAt: dispositionCore.projectionAt,
    projectionAt: dispositionCore.projectionAt,
    candidateBatchId: dispositionCore.batchId,
    candidateRevision: dispositionCore.revision,
    scope: 'all_active_closed_voided_batch_lineages',
    recordCount: 0,
    records: [],
    controls: {
      sourceOwnedWorkspaceScan: true,
      callerProvidedSubsetAccepted: false,
      completeWorkspaceScan: true,
      activeClosedVoidedIncluded: true,
      privateIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    recordSetDigest: '',
    snapshotDigest: '',
  }
  const workspaceHistoryReceipt: ShopBatchProfitControlInput['workspaceHistoryReceipt'] = {
    contract: 'supermega.shop.batch_profit_control.workspace_history_receipt.v1',
    generatedAt: dispositionCore.projectionAt,
    projectionAt: dispositionCore.projectionAt,
    candidateBatchId: dispositionCore.batchId,
    candidateRevision: dispositionCore.revision,
    scope: 'all_active_closed_voided_batch_lineages',
    sourceWorkspaceRecordSetDigest: '',
    sourceWorkspaceSnapshotDigest: '',
    recordCount: 0,
    controls: {
      sourceDerived: true,
      completeWorkspaceScan: true,
      activeClosedVoidedIncluded: true,
      manualHistoryAssertionAccepted: false,
      omittedHistoryAllowed: false,
      privateIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    receiptDigest: '',
  }

  const dispositionCoreDigest = await canonicalDigest(dispositionCore)
  const sourceRecordSetDigest = await canonicalDigest(sourceRecordSet)
  saleAllocationLedger.dispositionCoreDigest = dispositionCoreDigest
  saleAllocationLedger.sourceRecordSetDigest = sourceRecordSetDigest
  saleAllocationLedger.ledgerDigest = await canonicalDigest(withoutField(saleAllocationLedger as unknown as Record<string, unknown>, 'ledgerDigest'))
  productionCostReceipt.dispositionCoreDigest = dispositionCoreDigest
  productionCostReceipt.sourceRecordSetDigest = sourceRecordSetDigest
  productionCostReceipt.receiptDigest = await canonicalDigest(withoutField(productionCostReceipt as unknown as Record<string, unknown>, 'receiptDigest'))
  overheadReceipt.dispositionCoreDigest = dispositionCoreDigest
  overheadReceipt.sourceRecordSetDigest = sourceRecordSetDigest
  overheadReceipt.receiptDigest = await canonicalDigest(withoutField(overheadReceipt as unknown as Record<string, unknown>, 'receiptDigest'))
  retainedEvidenceReceipt.dispositionCoreDigest = dispositionCoreDigest
  retainedEvidenceReceipt.sourceRecordSetDigest = sourceRecordSetDigest
  retainedEvidenceReceipt.saleAllocationLedgerDigest = saleAllocationLedger.ledgerDigest
  retainedEvidenceReceipt.productionCostReceiptDigest = productionCostReceipt.receiptDigest
  retainedEvidenceReceipt.ownerReviewedOverheadReceiptDigest = overheadReceipt.receiptDigest
  retainedEvidenceReceipt.productionCostSummary.productionCostReceiptDigest = productionCostReceipt.receiptDigest
  const saleLinesByDigest = new Map(saleLines.map((line) => [line.orderLineBindingDigest, line]))
  retainedEvidenceReceipt.saleLineBindings = allocations.map((entry) => {
    const line = saleLinesByDigest.get(entry.orderLineBindingDigest)
    if (!line) throw new Error('shop_bakery_batch_demo_sale_line_unlinked')
    return {
      ...entry,
      sku: line.sku,
      saleAllocationLedgerDigest: saleAllocationLedger.ledgerDigest,
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
  retainedEvidenceReceipt.receiptDigest = await canonicalDigest(withoutField(retainedEvidenceReceipt as unknown as Record<string, unknown>, 'receiptDigest'))
  batchEnvelope.dispositionCoreDigest = dispositionCoreDigest
  batchEnvelope.sourceRecordSetDigest = sourceRecordSetDigest
  batchEnvelope.retainedEvidenceReceiptDigest = retainedEvidenceReceipt.receiptDigest
  batchEnvelope.ownerReviewedOverheadReceiptDigest = overheadReceipt.receiptDigest
  batchEnvelope.envelopeDigest = await canonicalDigest(withoutField(batchEnvelope as unknown as Record<string, unknown>, 'envelopeDigest'))
  workspaceHistorySnapshot.recordSetDigest = await canonicalDigest({
    contract: 'supermega.shop.batch_profit_control.workspace_history_record_set.v1',
    capturedAt: workspaceHistorySnapshot.capturedAt,
    projectionAt: workspaceHistorySnapshot.projectionAt,
    candidateBatchId: workspaceHistorySnapshot.candidateBatchId,
    candidateRevision: workspaceHistorySnapshot.candidateRevision,
    scope: workspaceHistorySnapshot.scope,
    records: workspaceHistorySnapshot.records,
  })
  workspaceHistorySnapshot.snapshotDigest = await canonicalDigest(withoutField(workspaceHistorySnapshot as unknown as Record<string, unknown>, 'snapshotDigest'))
  workspaceHistoryReceipt.sourceWorkspaceRecordSetDigest = workspaceHistorySnapshot.recordSetDigest
  workspaceHistoryReceipt.sourceWorkspaceSnapshotDigest = workspaceHistorySnapshot.snapshotDigest
  workspaceHistoryReceipt.receiptDigest = await canonicalDigest(withoutField(workspaceHistoryReceipt as unknown as Record<string, unknown>, 'receiptDigest'))

  return {
    dispositionCore,
    sourceRecordSet,
    saleAllocationLedger,
    productionCostReceipt,
    overheadReceipt,
    retainedEvidenceReceipt,
    batchEnvelope,
    workspaceHistorySnapshot,
    workspaceHistoryReceipt,
  }
}

function projectionEvidence(projection: ShopCostCoverageAndMarginAtRisk) {
  const boundaryMustInclude = 'not pilot, customer, or commercial proof'
  return {
    contract: projection.contract,
    state: projection.state,
    coverageBasisPoints: projection.costCoverage.coverageBasisPoints,
    soldValueMmk: projection.costCoverage.soldValueMmk,
    coveredSoldValueMmk: projection.costCoverage.coveredSoldValueMmk,
    retainedNonSampleCompletedSaleCount: projection.costCoverage.retainedNonSampleCompletedSaleCount,
    countedLineCount: projection.costCoverage.countedLineCount,
    fullyCostedLineCount: projection.costCoverage.fullyCostedLineCount,
    grossProfitMmk: projection.profit.grossProfitMmk,
    aggregateMarginBasisPoints: projection.profit.marginBasisPoints,
    marginAtRiskMmk: projection.marginAtRiskMmk,
    priorityOrder: projection.priorities.map((priority) => priority.sku),
    priorities: projection.priorities.map(({ sku, severity, marginMmk, marginBasisPoints, exposureMmk }) => ({
      sku,
      severity,
      marginMmk,
      marginBasisPoints,
      exposureMmk,
    })),
    healthySkuExcludedFromPriorities: projection.priorities.some((priority) => priority.sku === 'BAK-TEA-BUN') ? null : 'BAK-TEA-BUN',
    authorityAllFalse: Object.values(projection.authority).every((allowed) => allowed === false),
    boundaryMustInclude: projection.boundary.includes(boundaryMustInclude) ? boundaryMustInclude : null,
  }
}

export function shopBakeryDemoSourceForVerification(): unknown {
  return structuredClone(SHOP_BAKERY_DEMO_SOURCE)
}

export async function computeShopBakeryDemoFixtureDigest() {
  return sha256(canonicalJson(SHOP_BAKERY_DEMO_SOURCE))
}

export async function computeShopBakeryDemoExpectedProjectionDigest() {
  return sha256(canonicalJson(SHOP_BAKERY_DEMO_SOURCE.expectedProjection))
}

export async function verifyShopBakeryDemoSource(candidate: unknown) {
  const digest = await sha256(canonicalJson(candidate))
  if (digest !== SHOP_BAKERY_DEMO_FIXTURE_DIGEST) throw new Error('shop_bakery_demo_fixture_binding_mismatch')
  return digest
}

export async function verifyShopBakeryDemoProjection(candidate: ShopCostCoverageAndMarginAtRisk) {
  const evidence = projectionEvidence(candidate)
  const digest = await sha256(canonicalJson(evidence))
  if (
    digest !== SHOP_BAKERY_DEMO_EXPECTED_PROJECTION_DIGEST ||
    canonicalJson(evidence) !== canonicalJson(SHOP_BAKERY_DEMO_SOURCE.expectedProjection)
  ) throw new Error('shop_bakery_demo_projection_binding_mismatch')
  return digest
}

export async function loadShopBakeryMarginDemo(): Promise<ShopBakeryMarginDemoResult> {
  const source = shopBakeryDemoSourceForVerification() as typeof SHOP_BAKERY_DEMO_SOURCE
  const sourceDigest = await verifyShopBakeryDemoSource(source)
  const workspaceBefore = canonicalJson(source.workspace)
  const projection = projectShopCostCoverageAndMarginAtRisk(structuredClone(source.workspace) as unknown as CommerceState)
  if (canonicalJson(source.workspace) !== workspaceBefore) throw new Error('shop_bakery_demo_source_mutated')
  const expectedProjectionDigest = await verifyShopBakeryDemoProjection(projection)
  if (Object.values(source.controls).some((value) => value !== true && value !== false)) throw new Error('shop_bakery_demo_controls_invalid')
  if (
    source.controls.syntheticFixture !== true ||
    Object.entries(source.controls).some(([key, value]) => key !== 'syntheticFixture' && value !== false)
  ) throw new Error('shop_bakery_demo_authority_not_closed')

  return deepFreeze({
    contract: 'supermega.shop-bakery-margin-demo.v1',
    classification: SHOP_BAKERY_DEMO_CLASSIFICATION,
    businessLabel: source.story.businessLabel,
    closeQuestion: source.story.closeQuestion,
    sourceDigest,
    expectedProjectionDigest,
    projection,
    controls: source.controls,
  })
}

export async function shopBakeryBatchDemoInputForVerification() {
  return structuredClone(await buildShopBakeryBatchDemoInput())
}

export async function computeShopBakeryBatchDemoInputDigest() {
  return canonicalDigest(await buildShopBakeryBatchDemoInput())
}

const SHOP_BAKERY_BATCH_DEMO_PROJECTION_RECEIPT = Object.freeze({
  contract: 'supermega.shop-bakery-batch-profit-demo.projection-receipt.v1',
  inputDigest: SHOP_BAKERY_BATCH_DEMO_INPUT_DIGEST,
  sourceOwnedWorkspaceSnapshotDigest: 'sha256:ed278e13d1fd2ba2b054e4a1c5ff03e2518e3bc2c2690c6d271c6a362ecf9646',
  projectionDigest: SHOP_BAKERY_BATCH_DEMO_EXPECTED_PROJECTION_DIGEST,
  gzipBase64: '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',
})

async function readShopBakeryBatchDemoProjectionReceipt(inputDigest: string, sourceOwnedWorkspaceSnapshotDigest: string) {
  if (inputDigest !== SHOP_BAKERY_BATCH_DEMO_PROJECTION_RECEIPT.inputDigest) {
    throw new Error('shop_bakery_batch_demo_input_binding_mismatch')
  }
  if (sourceOwnedWorkspaceSnapshotDigest !== SHOP_BAKERY_BATCH_DEMO_PROJECTION_RECEIPT.sourceOwnedWorkspaceSnapshotDigest) {
    throw new Error('shop_bakery_batch_demo_workspace_snapshot_binding_mismatch')
  }
  const compressed = Uint8Array.from(atob(SHOP_BAKERY_BATCH_DEMO_PROJECTION_RECEIPT.gzipBase64), (character) => character.charCodeAt(0))
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).json() as Promise<ShopBatchProfitControlProjection>
}

export async function computeShopBakeryBatchDemoExpectedProjectionDigest() {
  const input = await buildShopBakeryBatchDemoInput()
  const inputDigest = await verifyShopBakeryBatchDemoInput(input)
  const projection = await readShopBakeryBatchDemoProjectionReceipt(inputDigest, input.workspaceHistorySnapshot.snapshotDigest)
  return verifyShopBakeryBatchDemoProjection(projection)
}

export async function verifyShopBakeryBatchDemoInput(candidate: ShopBatchProfitControlInput) {
  const digest = await canonicalDigest(candidate)
  if (digest !== SHOP_BAKERY_BATCH_DEMO_INPUT_DIGEST) throw new Error('shop_bakery_batch_demo_input_binding_mismatch')
  return digest
}

export async function verifyShopBakeryBatchDemoProjection(candidate: ShopBatchProfitControlProjection) {
  const digest = await canonicalDigest(candidate)
  if (digest !== SHOP_BAKERY_BATCH_DEMO_EXPECTED_PROJECTION_DIGEST) throw new Error('shop_bakery_batch_demo_projection_binding_mismatch')
  return digest
}

function assertShopBakeryBatchDemoProjection(projection: ShopBatchProfitControlProjection) {
  if (
    projection.contract !== SHOP_BATCH_PROFIT_CONTROL_CONTRACT
    || projection.contractSourceSha256 !== SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256
    || projection.state !== 'batch_margin_at_risk'
    || projection.batchIdentity.classification !== 'synthetic_local_fixture_never_evidence'
    || projection.evidenceStatus.profitStatus !== 'withheld'
    || projection.evidenceStatus.withheldReasonCodes.join(',') !== 'synthetic_or_sample_evidence_excluded'
    || projection.evidenceStatus.retainedSalesEvidenceComplete !== false
    || projection.truthBoundary.costLabel !== 'Owner-reviewed production-cost estimate'
    || !/never actual accounting cost/i.test(projection.truthBoundary.boundary)
    || Object.values(projection.authority).some((value) => value !== false)
    || [
      projection.truthBoundary.mayCountAsBaseline,
      projection.truthBoundary.mayCountAsPilotRun,
      projection.truthBoundary.mayCountAsCustomerEvidence,
      projection.truthBoundary.mayCountAsCommercialProof,
    ].some((value) => value !== false)
  ) throw new Error('shop_bakery_batch_demo_projection_invariant_mismatch')
}

export async function loadShopBakeryBatchProfitDemo(): Promise<ShopBakeryBatchDemoResult> {
  if (SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256 !== 'd2968009e5eb18c44420e2fbbe6b40072e59b9bac0cda1e9ff531a4cae7b5910') {
    throw new Error('shop_bakery_batch_demo_contract_binding_mismatch')
  }
  const input = await buildShopBakeryBatchDemoInput()
  const inputBefore = canonicalJson(input)
  const inputDigest = await verifyShopBakeryBatchDemoInput(input)
  const projection = await readShopBakeryBatchDemoProjectionReceipt(inputDigest, input.workspaceHistorySnapshot.snapshotDigest)
  if (canonicalJson(input) !== inputBefore) throw new Error('shop_bakery_batch_demo_input_mutated')
  await verifyShopBakeryBatchDemoProjection(projection)
  assertShopBakeryBatchDemoProjection(projection)
  if (Object.values(SHOP_BAKERY_BATCH_DEMO_CONTROLS).some((value) => value !== false)) {
    throw new Error('shop_bakery_batch_demo_authority_not_closed')
  }

  return deepFreeze({ projection })
}
