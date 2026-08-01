import {
  commercePurchaseOrderProgress,
  commercePurchaseOrders,
  validateCommerceState,
  type CommerceProductionMaterialRequest,
  type CommerceState,
  type CommerceStockMovement,
} from './commerce-workspace.ts'
import {
  createEmptyPlantOrderState,
  plantOrderEvidenceDigest,
  projectPlantOrder,
  validatePlantOrderState,
  type PlantOrderState,
} from './plant-order-foundation.ts'

export const PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT = 'supermega.production.material_requirements.v1' as const

export type ProductionMaterialRequirement = {
  materialId: string
  materialName: string
  unit: CommerceProductionMaterialRequest['unit']
  requiredQuantityMilli: number
  fulfilledQuantityMilli: number
  remainingQuantityMilli: number
  status: 'fulfilled' | 'mapping_required' | 'ready_to_issue' | 'covered_by_open_po' | 'supply_at_risk' | 'shortage'
  shopSupply: null | {
    sku: string
    itemName: string
    materialQuantityMilliPerStockUnit: number
    onHandStockUnits: number
    onHandQuantityMilli: number
    protectedStockUnits: number
    protectedStockQuantityMilli: number
    availableToIssueStockUnits: number
    availableToIssueQuantityMilli: number
    openPurchaseOrderStockUnits: number
    openPurchaseOrderQuantityMilli: number
    atRiskPurchaseOrderStockUnits: number
    atRiskPurchaseOrderQuantityMilli: number
    requiredStockUnits: number
    requiredSupplyStockUnits: number
    suggestedIssueStockUnits: number
    suggestedExpediteStockUnits: number
    suggestedOrderStockUnits: number
    nextExpectedAt: string | null
  }
}

export type ProductionMaterialRequirements = {
  contract: typeof PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT
  source: { plantRevision: number; plantHeadDigest: string; commerceSupplyDigest: string }
  job: { jobId: string; product: string; targetQuantity: number; effectiveFrom: string | null; effectiveUntil: string | null }
  status: 'not_planned' | 'mapping_required' | 'shortage' | 'supply_at_risk' | 'covered_by_open_po' | 'ready_to_issue' | 'fulfilled'
  rows: ProductionMaterialRequirement[]
  summary: { materials: number; mappingRequired: number; shortages: number; supplyAtRisk: number; coveredByOpenPo: number; readyToIssue: number; fulfilled: number }
  authority: { purchaseCreated: false; supplierContacted: false; inventoryIssued: false; productionChanged: false; providerCalled: false }
  digest: string
}

function safeProduct(left: number, right: number, field: string) {
  const product = BigInt(left) * BigInt(right)
  if (product > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} exceeds the supported quantity range.`)
  return Number(product)
}

function stockUnitsFor(quantityMilli: number, materialQuantityMilliPerStockUnit: number) {
  if (!quantityMilli) return 0
  return Number((BigInt(quantityMilli) + BigInt(materialQuantityMilliPerStockUnit) - 1n) / BigInt(materialQuantityMilliPerStockUnit))
}

export type ProductionMaterialHandoff = CommerceProductionMaterialRequest & {
  materialName: string
  substitution: null | {
    approvalId: string
    originalMaterialId: string
    originalMaterialName: string
    originalQuantityMilli: number
    originalUnit: CommerceProductionMaterialRequest['unit']
    approvalSourceDigest: string
    technicalBasis: string
  }
  fulfilledBy: CommerceStockMovement | null
}

function movementMatchesRequest(
  movement: CommerceStockMovement,
  request: CommerceProductionMaterialRequest,
) {
  return movement.kind === 'production_issue'
    && movement.productionRequestId === request.requestId
    && movement.productionCommandDigest === request.sourceCommandDigest
    && movement.productionJobId === request.jobId
    && movement.productionMaterialId === request.materialId
    && movement.productionInputLotId === request.inputLotId
    && movement.productionQuantityMilli === request.quantityMilli
    && movement.productionUnit === request.unit
}

export function productionMaterialHandoffs(
  executionValue: PlantOrderState | null | undefined,
  commerceValue: CommerceState | null | undefined,
): ProductionMaterialHandoff[] {
  const execution = validatePlantOrderState(executionValue ?? createEmptyPlantOrderState())
  const projection = projectPlantOrder(execution)
  const plan = projection.plan
  if (!plan) return []
  const commerce = commerceValue ? validateCommerceState(commerceValue) : null
  return execution.commands.flatMap((command): ProductionMaterialHandoff[] => {
    const payload = command.payload
    if (payload.kind !== 'issue_material' && payload.kind !== 'issue_substitute_material') return []
    const material = plan.materials.find((candidate) => candidate.materialId === payload.materialId)
    if (!material) return []
    const approval = payload.kind === 'issue_substitute_material'
      ? projection.materialSubstitutions.find((candidate) => candidate.id === payload.substitutionId
        && candidate.materialId === payload.materialId
        && candidate.substituteMaterialId === payload.substituteMaterialId)
      : null
    if (payload.kind === 'issue_substitute_material' && !approval) return []
    const quantityMilli = payload.kind === 'issue_material' ? payload.quantityMilli : payload.substituteQuantityMilli
    const creditedQuantityMilli = payload.kind === 'issue_material'
      ? payload.quantityMilli
      : Number(BigInt(payload.substituteQuantityMilli) * BigInt(approval!.originalQuantityPerUnitMilli) / BigInt(approval!.substituteQuantityPerUnitMilli))
    const request: CommerceProductionMaterialRequest = {
      requestId: payload.id,
      sourceCommandDigest: command.digest,
      jobId: plan.job.jobId,
      materialId: payload.kind === 'issue_material' ? payload.materialId : payload.substituteMaterialId,
      inputLotId: payload.inputLotId,
      quantityMilli,
      unit: payload.kind === 'issue_material' ? material.unit : approval!.substituteUnit,
    }
    return [{
      ...request,
      materialName: payload.kind === 'issue_material' ? material.name : approval!.substituteName,
      substitution: payload.kind === 'issue_material' ? null : {
        approvalId: approval!.id,
        originalMaterialId: material.materialId,
        originalMaterialName: material.name,
        originalQuantityMilli: creditedQuantityMilli,
        originalUnit: material.unit,
        approvalSourceDigest: approval!.approvalSourceDigest,
        technicalBasis: approval!.technicalBasis,
      },
      fulfilledBy: commerce?.movements.find((movement) => movementMatchesRequest(movement, request)) ?? null,
    }]
  })
}

export function pendingProductionMaterialHandoffs(
  execution: PlantOrderState | null | undefined,
  commerce: CommerceState | null | undefined,
) {
  return productionMaterialHandoffs(execution, commerce).filter((request) => !request.fulfilledBy)
}

export function projectProductionMaterialRequirements(
  executionValue: PlantOrderState | null | undefined,
  commerceValue: CommerceState | null | undefined,
): ProductionMaterialRequirements | null {
  const execution = validatePlantOrderState(executionValue ?? createEmptyPlantOrderState())
  const projection = projectPlantOrder(execution)
  if (!projection.plan) return null
  const commerce = validateCommerceState(commerceValue)
  const handoffs = productionMaterialHandoffs(execution, commerce)
  const relevantSkus = new Set(projection.materials.flatMap((material) => material.shopSupply ? [material.shopSupply.sku] : []))
  const purchaseOrders = commercePurchaseOrders(commerce).filter((order) => relevantSkus.has(order.sku)).map((order) => {
    const progress = commercePurchaseOrderProgress(commerce, order)
    return { id: order.id, sku: order.sku, remaining: progress.remaining, status: progress.status, expectedAt: order.expectedAt ?? null }
  }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  const commerceSupplyDigest = plantOrderEvidenceDigest({
    items: commerce.items.filter((item) => relevantSkus.has(item.sku)).map((item) => ({ sku: item.sku, name: item.name, onHand: item.onHand, reorderAt: item.reorderAt })).sort((left, right) => left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0),
    purchaseOrders,
    productionIssues: commerce.movements.filter((movement) => movement.kind === 'production_issue' && movement.productionJobId === projection.plan?.job.jobId).map((movement) => ({ actionId: movement.actionId, productionRequestId: movement.productionRequestId, productionCommandDigest: movement.productionCommandDigest, productionQuantityMilli: movement.productionQuantityMilli })).sort((left, right) => (left.productionRequestId ?? '') < (right.productionRequestId ?? '') ? -1 : 1),
  })
  const rows = projection.materials.map((material): ProductionMaterialRequirement => {
    const fulfilledQuantityMilli = handoffs.filter((handoff) => handoff.fulfilledBy && (handoff.materialId === material.materialId || handoff.substitution?.originalMaterialId === material.materialId)).reduce((total, handoff) => total + (handoff.substitution?.originalQuantityMilli ?? handoff.quantityMilli), 0)
    const remainingQuantityMilli = Math.max(material.requiredQuantityMilli - fulfilledQuantityMilli, 0)
    const mapping = material.shopSupply
    const matchingItems = mapping ? commerce.items.filter((item) => item.sku === mapping.sku) : []
    if (!remainingQuantityMilli) return { materialId: material.materialId, materialName: material.name, unit: material.unit, requiredQuantityMilli: material.requiredQuantityMilli, fulfilledQuantityMilli, remainingQuantityMilli, status: 'fulfilled', shopSupply: mapping && matchingItems.length === 1 ? { sku: mapping.sku, itemName: matchingItems[0].name, materialQuantityMilliPerStockUnit: mapping.materialQuantityMilliPerStockUnit, onHandStockUnits: matchingItems[0].onHand, onHandQuantityMilli: safeProduct(matchingItems[0].onHand, mapping.materialQuantityMilliPerStockUnit, `on-hand supply for ${material.materialId}`), protectedStockUnits: matchingItems[0].reorderAt, protectedStockQuantityMilli: safeProduct(matchingItems[0].reorderAt, mapping.materialQuantityMilliPerStockUnit, `protected stock for ${material.materialId}`), availableToIssueStockUnits: Math.max(matchingItems[0].onHand - matchingItems[0].reorderAt, 0), availableToIssueQuantityMilli: safeProduct(Math.max(matchingItems[0].onHand - matchingItems[0].reorderAt, 0), mapping.materialQuantityMilliPerStockUnit, `available stock for ${material.materialId}`), openPurchaseOrderStockUnits: 0, openPurchaseOrderQuantityMilli: 0, atRiskPurchaseOrderStockUnits: 0, atRiskPurchaseOrderQuantityMilli: 0, requiredStockUnits: 0, requiredSupplyStockUnits: 0, suggestedIssueStockUnits: 0, suggestedExpediteStockUnits: 0, suggestedOrderStockUnits: 0, nextExpectedAt: null } : null }
    if (!mapping || matchingItems.length !== 1) return { materialId: material.materialId, materialName: material.name, unit: material.unit, requiredQuantityMilli: material.requiredQuantityMilli, fulfilledQuantityMilli, remainingQuantityMilli, status: 'mapping_required', shopSupply: null }
    const item = matchingItems[0]
    const openOrders = purchaseOrders.filter((order) => order.sku === mapping.sku && order.remaining > 0 && order.status !== 'cancelled')
    const effectiveFromMs = projection.plan.effectiveFrom ? Date.parse(projection.plan.effectiveFrom) : null
    const effectiveUntilMs = projection.plan.effectiveUntil ? Date.parse(projection.plan.effectiveUntil) : null
    const atRiskOrders = openOrders.filter((order) => {
      if (!order.expectedAt) return true
      const expectedMs = Date.parse(order.expectedAt)
      return (effectiveFromMs !== null && expectedMs < effectiveFromMs)
        || (effectiveUntilMs !== null && expectedMs >= effectiveUntilMs)
    })
    const scheduledOrders = openOrders.filter((order) => !atRiskOrders.includes(order))
    const openPurchaseOrderStockUnits = openOrders.reduce((total, order) => total + order.remaining, 0)
    const atRiskPurchaseOrderStockUnits = atRiskOrders.reduce((total, order) => total + order.remaining, 0)
    const scheduledPurchaseOrderStockUnits = openPurchaseOrderStockUnits - atRiskPurchaseOrderStockUnits
    const protectedStockUnits = item.reorderAt
    const availableToIssueStockUnits = Math.max(item.onHand - protectedStockUnits, 0)
    const onHandQuantityMilli = safeProduct(item.onHand, mapping.materialQuantityMilliPerStockUnit, `on-hand supply for ${material.materialId}`)
    const protectedStockQuantityMilli = safeProduct(protectedStockUnits, mapping.materialQuantityMilliPerStockUnit, `protected stock for ${material.materialId}`)
    const availableToIssueQuantityMilli = safeProduct(availableToIssueStockUnits, mapping.materialQuantityMilliPerStockUnit, `available stock for ${material.materialId}`)
    const openPurchaseOrderQuantityMilli = safeProduct(openPurchaseOrderStockUnits, mapping.materialQuantityMilliPerStockUnit, `open purchase-order supply for ${material.materialId}`)
    const atRiskPurchaseOrderQuantityMilli = safeProduct(atRiskPurchaseOrderStockUnits, mapping.materialQuantityMilliPerStockUnit, `at-risk purchase-order supply for ${material.materialId}`)
    const requiredStockUnits = stockUnitsFor(remainingQuantityMilli, mapping.materialQuantityMilliPerStockUnit)
    const requiredSupplyStockUnits = protectedStockUnits + requiredStockUnits
    const dependableSupplyStockUnits = item.onHand + scheduledPurchaseOrderStockUnits
    const totalSupplyStockUnits = dependableSupplyStockUnits + atRiskPurchaseOrderStockUnits
    const dependableGapStockUnits = Math.max(requiredSupplyStockUnits - dependableSupplyStockUnits, 0)
    const totalGapStockUnits = Math.max(requiredSupplyStockUnits - totalSupplyStockUnits, 0)
    const status: ProductionMaterialRequirement['status'] = availableToIssueStockUnits >= requiredStockUnits ? 'ready_to_issue' : !dependableGapStockUnits ? 'covered_by_open_po' : !totalGapStockUnits ? 'supply_at_risk' : 'shortage'
    return {
      materialId: material.materialId, materialName: material.name, unit: material.unit,
      requiredQuantityMilli: material.requiredQuantityMilli, fulfilledQuantityMilli, remainingQuantityMilli, status,
      shopSupply: {
        sku: mapping.sku, itemName: item.name, materialQuantityMilliPerStockUnit: mapping.materialQuantityMilliPerStockUnit,
        onHandStockUnits: item.onHand, onHandQuantityMilli, protectedStockUnits, protectedStockQuantityMilli,
        availableToIssueStockUnits, availableToIssueQuantityMilli, openPurchaseOrderStockUnits, openPurchaseOrderQuantityMilli,
        atRiskPurchaseOrderStockUnits, atRiskPurchaseOrderQuantityMilli,
        requiredStockUnits, requiredSupplyStockUnits,
        suggestedIssueStockUnits: Math.min(availableToIssueStockUnits, requiredStockUnits),
        suggestedExpediteStockUnits: Math.min(atRiskPurchaseOrderStockUnits, dependableGapStockUnits),
        suggestedOrderStockUnits: totalGapStockUnits,
        nextExpectedAt: scheduledOrders.map((order) => order.expectedAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
      },
    }
  })
  const summary = {
    materials: rows.length,
    mappingRequired: rows.filter((row) => row.status === 'mapping_required').length,
    shortages: rows.filter((row) => row.status === 'shortage').length,
    supplyAtRisk: rows.filter((row) => row.status === 'supply_at_risk').length,
    coveredByOpenPo: rows.filter((row) => row.status === 'covered_by_open_po').length,
    readyToIssue: rows.filter((row) => row.status === 'ready_to_issue').length,
    fulfilled: rows.filter((row) => row.status === 'fulfilled').length,
  }
  const status: ProductionMaterialRequirements['status'] = summary.mappingRequired ? 'mapping_required' : summary.shortages ? 'shortage' : summary.supplyAtRisk ? 'supply_at_risk' : summary.coveredByOpenPo ? 'covered_by_open_po' : summary.readyToIssue ? 'ready_to_issue' : 'fulfilled'
  const body = {
    contract: PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT,
    source: { plantRevision: projection.revision, plantHeadDigest: projection.headDigest, commerceSupplyDigest },
    job: { jobId: projection.plan.job.jobId, product: projection.plan.job.product, targetQuantity: projection.plan.job.targetQuantity, effectiveFrom: projection.plan.effectiveFrom ?? null, effectiveUntil: projection.plan.effectiveUntil ?? null },
    status, rows, summary,
    authority: { purchaseCreated: false, supplierContacted: false, inventoryIssued: false, productionChanged: false, providerCalled: false } as const,
  }
  return { ...body, digest: plantOrderEvidenceDigest(body) }
}

export function validateProductionMaterialRequirements(
  value: unknown,
  execution: PlantOrderState | null | undefined,
  commerce: CommerceState | null | undefined,
) {
  const expected = projectProductionMaterialRequirements(execution, commerce)
  if (!expected || typeof value !== 'object' || value === null || (value as { contract?: unknown }).contract !== PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT || plantOrderEvidenceDigest(value) !== plantOrderEvidenceDigest(expected)) throw new Error('Production material requirements do not match their current Plant and Shop evidence.')
  return expected
}
