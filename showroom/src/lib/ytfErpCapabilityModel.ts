export type YtfErpCapabilityStatus = 'live' | 'pilot' | 'gap'

export type YtfErpCapabilityRuntime = {
  databaseReady: boolean
  gmailReady: boolean
  sourceRecords: number
  sourceChanges: number
  kpiCandidates: number
  officialKpis: number
  knowledgeChunks: number
  botReadyCount: number
  botTotal: number
  byDomain?: Record<string, number>
  byPlant?: Record<string, number>
}

export type YtfErpCapabilityCard = {
  id: string
  title: string
  status: YtfErpCapabilityStatus
  score: number
  route: string
  baseline: string
  ytfEdge: string
  nextAction: string
}

function countMatches(record: Record<string, number> | undefined, needles: string[]) {
  return Object.entries(record ?? {}).reduce((sum, [label, value]) => {
    const normalized = String(label || '').toLowerCase()
    return needles.some((needle) => normalized.includes(needle)) ? sum + Number(value || 0) : sum
  }, 0)
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function statusFor(score: number): YtfErpCapabilityStatus {
  if (score >= 70) return 'live'
  if (score >= 40) return 'pilot'
  return 'gap'
}

function card(input: Omit<YtfErpCapabilityCard, 'status'>): YtfErpCapabilityCard {
  return {
    ...input,
    status: statusFor(input.score),
  }
}

export function buildYtfErpCapabilityCards(runtime: YtfErpCapabilityRuntime): YtfErpCapabilityCard[] {
  const plantARecords = countMatches(runtime.byPlant, ['Factory Floor', 'yangon', 'shwe pyi thar'])
  const plantBRecords = countMatches(runtime.byPlant, ['plant b', 'bilin', 'mon'])
  const productionRecords = countMatches(runtime.byDomain, ['production', 'manufacturing', 'planning', 'factory'])
  const qualityRecords = countMatches(runtime.byDomain, ['quality', 'qc', 'claim', 'iso'])
  const maintenanceRecords = countMatches(runtime.byDomain, ['maintenance', 'utility', 'engineering'])
  const salesRecords = countMatches(runtime.byDomain, ['sales', 'inventory', 'showroom', 'commercial'])
  const financeRecords = countMatches(runtime.byDomain, ['finance', 'supplier', 'purchase', 'procurement', 'po'])
  const adminRecords = countMatches(runtime.byDomain, ['admin', 'hr', 'training'])
  const baseDataScore = runtime.databaseReady ? 24 : 8
  const sourceScore = Math.min(28, runtime.sourceRecords / 45)
  const kpiScore = Math.min(22, runtime.kpiCandidates / 18 + runtime.officialKpis * 3)
  const actionScore = Math.min(18, runtime.sourceChanges / 45)

  return [
    card({
      id: 'manufacturing-execution',
      title: 'Manufacturing execution',
      score: clampScore(baseDataScore + sourceScore + kpiScore + Math.min(24, (productionRecords + plantARecords + plantBRecords) / 18)),
      route: '/app/plant-manager',
      baseline: 'ERP production, inventory, and reporting.',
      ytfEdge: 'Factory stages, Factory Floor/B separation, board-photo entry, and confirmed KPIs.',
      nextAction: productionRecords || plantARecords || plantBRecords ? 'Use daily close and KPI values.' : 'Map production files to stage and plant.',
    }),
    card({
      id: 'quality-traceability',
      title: 'Quality + traceability',
      score: clampScore(baseDataScore + Math.min(28, qualityRecords / 8) + Math.min(24, runtime.officialKpis * 5 + runtime.kpiCandidates / 30) + 16),
      route: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
      baseline: 'Quality records, corrective action, and management reports.',
      ytfEdge: '5W1H, claim, defect, evidence, and quality trail hidden behind short forms.',
      nextAction: qualityRecords ? 'Turn claim/defect sheets into follow-up queues.' : 'Attach QC/claim folders to Quality.',
    }),
    card({
      id: 'maintenance-reliability',
      title: 'Maintenance reliability',
      score: clampScore(baseDataScore + Math.min(30, maintenanceRecords / 5) + Math.min(22, runtime.sourceChanges / 60) + 10),
      route: '/app/daily-entry?mode=normal_abnormal&section=Maintenance',
      baseline: 'Asset work orders and spare-part history.',
      ytfEdge: 'Downtime, repeat failure, utility, photo evidence, and root-cause prompts in one desk.',
      nextAction: maintenanceRecords ? 'Add downtime minutes by machine.' : 'Add machine list and PM schedule.',
    }),
    card({
      id: 'sales-inventory',
      title: 'Sales + inventory',
      score: clampScore(baseDataScore + Math.min(34, salesRecords / 8) + Math.min(20, runtime.kpiCandidates / 25) + (runtime.gmailReady ? 14 : 4)),
      route: '/app/live-data?view=kpi',
      baseline: 'Sales, POS, inventory, and executive dashboards.',
      ytfEdge: 'Dealer, showroom, stock movement, tube/flap/tyre analysis, and email follow-up signals.',
      nextAction: runtime.gmailReady ? 'Route dealer/supplier threads into account work.' : 'Finish Gmail OAuth for sales/procurement.',
    }),
    card({
      id: 'finance-procurement',
      title: 'Finance + procurement',
      score: clampScore(baseDataScore + Math.min(34, financeRecords / 7) + (runtime.gmailReady ? 16 : 5) + Math.min(16, runtime.sourceChanges / 80)),
      route: '/app/live-data?view=comms',
      baseline: 'Financials, purchasing, supplier, and reporting.',
      ytfEdge: 'PO, TT/payment, supplier email, and Drive evidence become reviewable signals.',
      nextAction: financeRecords ? 'Normalize PO/payment KPI definitions.' : 'Map finance and PO workbooks.',
    }),
    card({
      id: 'hr-training-admin',
      title: 'HR + training',
      score: clampScore(baseDataScore + Math.min(30, adminRecords / 8) + Math.min(18, runtime.knowledgeChunks / 60) + 8),
      route: '/app/use',
      baseline: 'Attendance, HR, claims, and staff self-service.',
      ytfEdge: 'Role packs, Burmese/English routines, SOP acknowledgement, and manager usage score.',
      nextAction: adminRecords ? 'Publish role checklists by department.' : 'Add attendance/training source files.',
    }),
    card({
      id: 'data-intelligence',
      title: 'Data intelligence',
      score: clampScore(baseDataScore + Math.min(30, runtime.knowledgeChunks / 18) + Math.min(26, runtime.kpiCandidates / 18) + Math.min(12, runtime.botReadyCount * 3)),
      route: '/app/live-data',
      baseline: 'Executive dashboard and AI insights.',
      ytfEdge: 'Drive content extraction, KPI candidates, evidence search, and role-safe dashboards.',
      nextAction: runtime.kpiCandidates ? 'Promote only useful production/quality KPIs.' : 'Run workbook extraction refresh.',
    }),
    card({
      id: 'secure-agent-actions',
      title: 'Secure agent actions',
      score: clampScore((runtime.databaseReady ? 26 : 8) + (runtime.gmailReady ? 18 : 4) + Math.min(20, runtime.botReadyCount * 4) + actionScore),
      route: '/app/agent-teams',
      baseline: 'RBAC, automation, dashboards, and private deployment.',
      ytfEdge: 'Admin-scoped agents can prepare drafts, route work, and refresh data without exposing raw folders to managers.',
      nextAction: runtime.botTotal ? 'Keep write actions human-confirmed.' : 'Add Viber/LINE/WeChat intake bridge.',
    }),
  ]
}

export function summarizeYtfErpCapabilities(cards: YtfErpCapabilityCard[]) {
  const live = cards.filter((card) => card.status === 'live').length
  const pilot = cards.filter((card) => card.status === 'pilot').length
  const gaps = cards.filter((card) => card.status === 'gap').length
  const score = clampScore(cards.reduce((sum, item) => sum + item.score, 0) / Math.max(cards.length, 1))
  const next = [...cards].sort((left, right) => left.score - right.score).slice(0, 3)
  return { score, live, pilot, gaps, next }
}
