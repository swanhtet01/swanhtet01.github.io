import type { ProductionState } from './production-workspace.ts'

export type PlantEventJobPriorityBrief = {
  totalPriorityEvents: number
  toUrgentCount: number
  toNormalCount: number
  toLowCount: number
  fromUrgentCount: number
  fromNormalCount: number
  fromLowCount: number
}

export function projectPlantEventJobPriorityBrief(
  production: ProductionState,
): PlantEventJobPriorityBrief {
  let totalPriorityEvents = 0
  let toUrgentCount = 0
  let toNormalCount = 0
  let toLowCount = 0
  let fromUrgentCount = 0
  let fromNormalCount = 0
  let fromLowCount = 0

  for (const event of production.events) {
    if (event.jobPriority === undefined) continue
    totalPriorityEvents++
    if (event.jobPriority === 'urgent') toUrgentCount++
    else if (event.jobPriority === 'normal') toNormalCount++
    else if (event.jobPriority === 'low') toLowCount++
    if (event.fromJobPriority === 'urgent') fromUrgentCount++
    else if (event.fromJobPriority === 'normal') fromNormalCount++
    else if (event.fromJobPriority === 'low') fromLowCount++
  }

  return {
    totalPriorityEvents,
    toUrgentCount,
    toNormalCount,
    toLowCount,
    fromUrgentCount,
    fromNormalCount,
    fromLowCount,
  }
}
