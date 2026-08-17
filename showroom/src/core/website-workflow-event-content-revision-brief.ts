import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkflowEventContentRevisionBrief = {
  totalEvents: number
  minContentRevision: number | null
  maxContentRevision: number | null
  uniqueRevisions: number
}

export function projectWebsiteWorkflowEventContentRevisionBrief(
  workspace: WebsiteWorkspace,
): WebsiteWorkflowEventContentRevisionBrief {
  const total = workspace.events.length
  if (total === 0)
    return { totalEvents: 0, minContentRevision: null, maxContentRevision: null, uniqueRevisions: 0 }
  let min = workspace.events[0].source.contentRevision
  let max = workspace.events[0].source.contentRevision
  const revisionSet = new Set<number>()
  for (const event of workspace.events) {
    const rev = event.source.contentRevision
    if (rev < min) min = rev
    if (rev > max) max = rev
    revisionSet.add(rev)
  }
  return {
    totalEvents: total,
    minContentRevision: min,
    maxContentRevision: max,
    uniqueRevisions: revisionSet.size,
  }
}
