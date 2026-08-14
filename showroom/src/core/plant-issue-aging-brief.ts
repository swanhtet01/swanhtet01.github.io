import type { ProductionState } from './production-workspace.ts'

export type PlantIssueAgingBrief = {
  totalIssues: number
  openIssues: number
  resolvedIssues: number
  issuesWithDueDate: number
  openPastDue: number
  criticalOrHighPastDue: number
  resolvedOnTime: number
  resolvedLate: number
  slaAdherenceRate: number
}

export function projectPlantIssueAgingBrief(production: ProductionState, asOf: string): PlantIssueAgingBrief {
  let openIssues = 0
  let resolvedIssues = 0
  let issuesWithDueDate = 0
  let openPastDue = 0
  let criticalOrHighPastDue = 0
  let resolvedOnTime = 0
  let resolvedLate = 0

  for (const issue of production.issues) {
    if (issue.status === 'open') {
      openIssues++
      if (issue.dueAt !== undefined) {
        issuesWithDueDate++
        if (issue.dueAt < asOf) {
          openPastDue++
          if (issue.severity === 'critical' || issue.severity === 'high') {
            criticalOrHighPastDue++
          }
        }
      }
    } else {
      resolvedIssues++
      if (issue.dueAt !== undefined && issue.resolution !== undefined) {
        issuesWithDueDate++
        if (issue.resolution.resolvedAt <= issue.dueAt) {
          resolvedOnTime++
        } else {
          resolvedLate++
        }
      }
    }
  }

  const resolvedWithDue = resolvedOnTime + resolvedLate
  return {
    totalIssues: production.issues.length,
    openIssues,
    resolvedIssues,
    issuesWithDueDate,
    openPastDue,
    criticalOrHighPastDue,
    resolvedOnTime,
    resolvedLate,
    slaAdherenceRate: resolvedWithDue > 0 ? Math.round((resolvedOnTime / resolvedWithDue) * 100) : 0,
  }
}
