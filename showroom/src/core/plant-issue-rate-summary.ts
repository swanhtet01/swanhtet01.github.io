import type { ProductionState } from './production-workspace.ts'

export type PlantIssueRateSummary = {
  totalIssues: number
  openCount: number
  resolvedCount: number
  criticalOpenCount: number
  openRate: number
  byKind: { quality: number; maintenance: number; materials: number; operations: number }
  bySeverity: { critical: number; high: number; medium: number; low: number; unspecified: number }
  byArea: Array<{ area: string; count: number }>
}

export function projectPlantIssueRateSummary(production: ProductionState): PlantIssueRateSummary {
  const byKind = { quality: 0, maintenance: 0, materials: 0, operations: 0 }
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, unspecified: 0 }
  const areaMap = new Map<string, number>()

  let openCount = 0
  let resolvedCount = 0
  let criticalOpenCount = 0

  for (const issue of production.issues) {
    if (issue.status === 'open') {
      openCount++
      if (issue.severity === 'critical') criticalOpenCount++
    } else {
      resolvedCount++
    }
    byKind[issue.kind] += 1
    const sev = issue.severity ?? 'unspecified'
    bySeverity[sev as keyof typeof bySeverity] += 1
    areaMap.set(issue.area, (areaMap.get(issue.area) ?? 0) + 1)
  }

  const totalIssues = production.issues.length
  const openRate = totalIssues > 0 ? Math.round((openCount / totalIssues) * 100) : 0

  const byArea = Array.from(areaMap.entries())
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))

  return { totalIssues, openCount, resolvedCount, criticalOpenCount, openRate, byKind, bySeverity, byArea }
}
