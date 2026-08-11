import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkflowEventSummary = {
  totalEvents: number
  byAction: {
    publish_evidence_recorded: number
    website_revision_approved: number
    local_snapshot_recorded: number
  }
  uniqueActors: number
  uniqueSubjects: number
}

export function projectWebsiteWorkflowEventSummary(workspace: WebsiteWorkspace): WebsiteWorkflowEventSummary {
  const byAction = {
    publish_evidence_recorded: 0,
    website_revision_approved: 0,
    local_snapshot_recorded: 0,
  }
  const actorSet = new Set<string>()
  const subjectSet = new Set<string>()

  for (const event of workspace.events) {
    byAction[event.action]++
    actorSet.add(event.actor)
    subjectSet.add(event.subjectId)
  }

  return {
    totalEvents: workspace.events.length,
    byAction,
    uniqueActors: actorSet.size,
    uniqueSubjects: subjectSet.size,
  }
}
