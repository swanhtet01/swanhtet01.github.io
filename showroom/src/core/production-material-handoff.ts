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
    if (payload.kind !== 'issue_material') return []
    const material = plan.materials.find((candidate) => candidate.materialId === payload.materialId)
    if (!material) return []
    const request: CommerceProductionMaterialRequest = {
      requestId: payload.id,
      sourceCommandDigest: command.digest,
      jobId: plan.job.jobId,
      materialId: payload.materialId,
      inputLotId: payload.inputLotId,
      quantityMilli: payload.quantityMilli,
      unit: material.unit,
    }
    return [{
      ...request,
      materialName: material.name,
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
