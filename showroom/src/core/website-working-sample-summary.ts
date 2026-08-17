import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkingSampleSummary = {
  loaded: boolean
  templateId: string | null
  contentFingerprint: string | null
  installedAt: string | null
}

export function projectWebsiteWorkingSampleSummary(workspace: WebsiteWorkspace): WebsiteWorkingSampleSummary {
  const sample = workspace.workingSample

  if (sample === undefined) {
    return { loaded: false, templateId: null, contentFingerprint: null, installedAt: null }
  }

  return {
    loaded: true,
    templateId: sample.templateId,
    contentFingerprint: sample.contentFingerprint,
    installedAt: sample.installedAt,
  }
}
