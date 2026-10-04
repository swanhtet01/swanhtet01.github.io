import {
  validateCommerceState,
  type CommerceActionProof,
  type CommerceOperatingUnit,
  type CommerceShiftSession,
  type CommerceState,
} from './commerce-workspace'

function safeCommerceState(value: unknown) {
  try {
    return validateCommerceState(value)
  } catch {
    return null
  }
}

function sameProof(left: CommerceActionProof, right: CommerceActionProof) {
  return left.actionId === right?.actionId
    && left.capturedAt === right.capturedAt
    && left.actor === right.actor
    && left.reason === right.reason
    && left.evidenceReference === right.evidenceReference
}

export function registerCommerceOperatingUnit(
  state: CommerceState,
  input: { id: string; name: string },
  proof: CommerceActionProof,
) {
  const current = safeCommerceState(state)
  if (!current) return null
  const units = current.operatingUnits ?? []
  const existing = units.find((unit) => unit.id === input?.id)
  if (existing) return existing.name === input.name && sameProof(existing.registration, proof) ? current : null
  const unit: CommerceOperatingUnit = { id: input?.id, name: input?.name, registration: proof }
  return safeCommerceState({
    ...current,
    operatingUnits: [...units, unit],
    shiftSessions: current.shiftSessions ?? [],
  })
}

export function openCommerceShiftSession(
  state: CommerceState,
  input: { id: string; unitId: string },
  proof: CommerceActionProof,
) {
  const current = safeCommerceState(state)
  if (!current?.operatingUnits || !current.shiftSessions) return null
  const existing = current.shiftSessions.find((session) => session.id === input?.id)
  if (existing) return existing.unitId === input.unitId && sameProof(existing.opening, proof) ? current : null
  const session: CommerceShiftSession = { id: input?.id, unitId: input?.unitId, opening: proof }
  return safeCommerceState({ ...current, shiftSessions: [...current.shiftSessions, session] })
}
