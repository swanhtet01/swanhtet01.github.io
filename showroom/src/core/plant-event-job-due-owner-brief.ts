import type { ProductionState } from './production-workspace.ts'

export type PlantEventJobDueOwnerBrief = {
  totalJobUpdateEvents: number
  earliestJobDueAt: string | null
  latestJobDueAt: string | null
  earliestFromJobDueAt: string | null
  latestFromJobDueAt: string | null
  uniqueJobOwners: number
  topJobOwnersByCount: Array<{ owner: string; count: number }>
  uniqueFromJobOwners: number
  topFromJobOwnersByCount: Array<{ owner: string; count: number }>
}

export function projectPlantEventJobDueOwnerBrief(
  production: ProductionState,
): PlantEventJobDueOwnerBrief {
  let totalJobUpdateEvents = 0
  let earliestJobDueAt: string | null = null
  let latestJobDueAt: string | null = null
  let earliestFromJobDueAt: string | null = null
  let latestFromJobDueAt: string | null = null
  const ownerMap = new Map<string, number>()
  const fromOwnerMap = new Map<string, number>()

  for (const event of production.events) {
    const hasUpdate =
      event.jobDueAt !== undefined ||
      event.fromJobDueAt !== undefined ||
      event.jobOwner !== undefined ||
      event.fromJobOwner !== undefined
    if (!hasUpdate) continue
    totalJobUpdateEvents++
    if (event.jobDueAt !== undefined) {
      if (earliestJobDueAt === null || event.jobDueAt < earliestJobDueAt)
        earliestJobDueAt = event.jobDueAt
      if (latestJobDueAt === null || event.jobDueAt > latestJobDueAt)
        latestJobDueAt = event.jobDueAt
    }
    if (event.fromJobDueAt !== undefined) {
      if (earliestFromJobDueAt === null || event.fromJobDueAt < earliestFromJobDueAt)
        earliestFromJobDueAt = event.fromJobDueAt
      if (latestFromJobDueAt === null || event.fromJobDueAt > latestFromJobDueAt)
        latestFromJobDueAt = event.fromJobDueAt
    }
    if (event.jobOwner !== undefined)
      ownerMap.set(event.jobOwner, (ownerMap.get(event.jobOwner) ?? 0) + 1)
    if (event.fromJobOwner !== undefined)
      fromOwnerMap.set(event.fromJobOwner, (fromOwnerMap.get(event.fromJobOwner) ?? 0) + 1)
  }

  const topJobOwnersByCount = Array.from(ownerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  const topFromJobOwnersByCount = Array.from(fromOwnerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  return {
    totalJobUpdateEvents,
    earliestJobDueAt,
    latestJobDueAt,
    earliestFromJobDueAt,
    latestFromJobDueAt,
    uniqueJobOwners: ownerMap.size,
    topJobOwnersByCount,
    uniqueFromJobOwners: fromOwnerMap.size,
    topFromJobOwnersByCount,
  }
}
