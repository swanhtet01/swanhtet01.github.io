import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteReleaseRecordsSummary = {
  totalRecords: number
  totalCommands: number
  byCommandKind: {
    prepare_package: number
    upgrade_template: number
    approve_release: number
    prepare_deploy_plan: number
  }
  latestRevision: number | null
}

export function projectWebsiteReleaseRecordsSummary(workspace: WebsiteWorkspace): WebsiteReleaseRecordsSummary {
  const records = workspace.releaseRecords ?? []
  const byCommandKind = {
    prepare_package: 0,
    upgrade_template: 0,
    approve_release: 0,
    prepare_deploy_plan: 0,
  }
  let totalCommands = 0
  let latestRevision: number | null = null

  for (const record of records) {
    totalCommands += record.commands.length
    if (latestRevision === null || record.revision > latestRevision) latestRevision = record.revision
    for (const command of record.commands) {
      byCommandKind[command.payload.kind]++
    }
  }

  return {
    totalRecords: records.length,
    totalCommands,
    byCommandKind,
    latestRevision,
  }
}
