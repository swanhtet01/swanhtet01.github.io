import type { CommerceState } from './commerce-workspace'
import {
  projectShopCostCoverageAndMarginAtRisk,
  type ShopCostCoverageAndMarginAtRisk,
} from './shop-cost-coverage-and-margin-at-risk'

export const SHOP_BAKERY_DEMO_CLASSIFICATION = 'synthetic local demo only — never pilot, customer, or commercial proof' as const
export const SHOP_BAKERY_DEMO_FIXTURE_DIGEST = 'sha256:60f90d6e79e0a6048cc6b1d49a02ea18ae990f5e4aca72ae03a8fb6a3292c006' as const
export const SHOP_BAKERY_DEMO_EXPECTED_PROJECTION_DIGEST = 'sha256:fca4dfe3030dd8f6445ac364c50205b8501f248b3372be213ce4d028cda2517d' as const

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
