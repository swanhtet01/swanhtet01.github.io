import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkflowEventActorBrief = {
  totalEvents: number
  uniqueActors: number
  topActor: string | null
  topActorCount: number
}

export function projectWebsiteWorkflowEventActorBrief(
  workspace: WebsiteWorkspace,
): WebsiteWorkflowEventActorBrief {
  const total = workspace.events.length
  if (total === 0) {
    return { totalEvents: 0, uniqueActors: 0, topActor: null, topActorCount: 0 }
  }

  const counts = new Map<string, number>()
  for (const e of workspace.events) {
    counts.set(e.actor, (counts.get(e.actor) ?? 0) + 1)
  }

  let topActor: string | null = null
  let topActorCount = 0
  for (const [key, count] of counts) {
    if (count > topActorCount) {
      topActorCount = count
      topActor = key
    }
  }

  return {
    totalEvents: total,
    uniqueActors: counts.size,
    topActor,
    topActorCount,
  }
}
