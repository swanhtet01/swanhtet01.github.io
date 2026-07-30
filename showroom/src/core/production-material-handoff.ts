import {
  validateCommerceState,
  type CommerceProductionMaterialRequest,
  type CommerceState,
  type CommerceStockMovement,
} from './commerce-workspace'
import {
  createEmptyPlantOrderState,
  projectPlantOrder,
  validatePlantOrderState,
  type PlantOrderState,
} from './plant-order-foundation'

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
