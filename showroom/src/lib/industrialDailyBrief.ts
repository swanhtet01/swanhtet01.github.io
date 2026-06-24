import type { DataFabricDataset } from './dataFabricApi'

export type IndustrialBriefLane = {
  id: string
  label: string
  title: string
  signal: string
  decision: string
  owner: string
  route: string
  kpi: string
  method: string
  agentMove: string
}

export type IndustrialBriefPacket = {
  score: number
  headline: string
  updatedAt: string | null
  lanes: IndustrialBriefLane[]
  reviewOrder: string[]
  sourcePosture: {
    label: string
    value: string
    detail: string
  }[]
  nextActions: {
    title: string
    owner: string
    route: string
    reason: string
  }[]
}

const baseLanes: IndustrialBriefLane[] = [
  {
    id: 'plan-risk',
    label: 'Plan',
    title: 'Production plan risk',
    signal: 'Open tasks, shift notes, receiving holds, and maintenance records are checked for output risk.',
    decision: 'Can the plant hit the next plan without executive intervention?',
    owner: 'Plant manager',
    route: '/app/operations',
    kpi: 'Schedule adherence',
    method: 'Daily management review',
    agentMove: 'Draft the shift risk summary and name the owning desk.',
  },
  {
    id: 'quality-exposure',
    label: 'Quality',
    title: 'Quality exposure',
    signal: 'Defects, holds, complaints, repeated inspection drift, and missing evidence are grouped.',
    decision: 'Can the affected lot move, stay on hold, or require CAPA escalation?',
    owner: 'Quality lead',
    route: '/app/dqms',
    kpi: 'Repeat defect rate',
    method: 'NCR, 5W1H, Ishikawa, CAPA',
    agentMove: 'Prepare the CAPA evidence packet and root-cause branches.',
  },
  {
    id: 'asset-reliability',
    label: 'Assets',
    title: 'Reliability pressure',
    signal: 'Breakdowns, PM misses, repeat faults, and spare signals are checked for carryover risk.',
    decision: 'What machine, spare, or PM action prevents the next loss?',
    owner: 'Maintenance lead',
    route: '/app/maintenance',
    kpi: 'Downtime and repeat-failure rate',
    method: 'MTBF, MTTR, 5 Why, FMEA-lite',
    agentMove: 'Cluster repeat faults and draft a preventive action review.',
  },
  {
    id: 'supplier-recovery',
    label: 'Supply',
    title: 'Supplier and receiving exposure',
    signal: 'Shortages, COA gaps, inbound holds, supplier claims, and production-impacting variance are checked.',
    decision: 'Receive, hold, claim, recover, or escalate commercial risk?',
    owner: 'Receiving and procurement',
    route: '/app/receiving',
    kpi: 'Supplier hold aging',
    method: 'Supplier quality scorecard and traceability event',
    agentMove: 'Assemble discrepancy evidence and draft supplier follow-up.',
  },
  {
    id: 'source-trust',
    label: 'Data',
    title: 'Source trust and changed files',
    signal: 'Drive, Gmail, Sheets, ERP exports, and manual entries are checked for stale or unreviewed changes.',
    decision: 'Which source changes must be reviewed before KPI or agent output can be trusted?',
    owner: 'Data owner',
    route: '/app/data-fabric',
    kpi: 'Trusted record rate',
    method: 'Source ledger, lineage, entity resolution',
    agentMove: 'Classify changed files and propose cleanup with source links.',
  },
]

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function scoreFromDataset(dataset: DataFabricDataset | null) {
  if (!dataset) return 64
  const summary = dataset.summary
  const issueLoad =
    Number(summary.openTaskCount || 0) +
    Number(summary.pendingApprovalCount || 0) +
    Number(summary.receivingHoldCount || 0) +
    Number(summary.qualityIncidentCount || 0) +
    Number(summary.supplierRiskCount || 0)
  const trust = Number(dataset.learningDatabase?.trustScore || 0)
  const stalePenalty = dataset.connectorSignals.filter((item) => item.status !== 'Healthy').length * 5
  return clamp(Math.round((trust || 72) - Math.min(issueLoad, 28) - stalePenalty + 18))
}

function headlineForScore(score: number) {
  if (score >= 86) return 'Plant is controlled. Watch the exceptions.'
  if (score >= 70) return 'Plant is workable. Clear the top blockers today.'
  return 'Plant needs active management review before the next shift.'
}

export function buildIndustrialDailyBrief(dataset: DataFabricDataset | null): IndustrialBriefPacket {
  const score = scoreFromDataset(dataset)
  const summary = dataset?.summary
  const sourceCount = dataset?.sourceRegistry.length ?? 0
  const liveSourceCount = dataset?.sourceRegistry.filter((item) => item.status === 'live').length ?? 0
  const connectorRiskCount = dataset?.connectorSignals.filter((item) => item.status !== 'Healthy').length ?? 0
  const trustScore = dataset?.learningDatabase?.trustScore ?? 0

  const lanes = baseLanes.map((lane) => {
    if (lane.id === 'quality-exposure' && Number(summary?.qualityIncidentCount || 0) > 0) {
      return { ...lane, signal: `${summary?.qualityIncidentCount} quality records need containment, evidence, or CAPA review.` }
    }
    if (lane.id === 'supplier-recovery' && Number(summary?.receivingHoldCount || 0) > 0) {
      return { ...lane, signal: `${summary?.receivingHoldCount} receiving holds can affect production, inventory, or supplier recovery.` }
    }
    if (lane.id === 'asset-reliability' && Number(summary?.maintenanceCount || 0) > 0) {
      return { ...lane, signal: `${summary?.maintenanceCount} maintenance records are available for repeat-fault clustering.` }
    }
    if (lane.id === 'source-trust' && connectorRiskCount > 0) {
      return { ...lane, signal: `${connectorRiskCount} connector lanes need review before source truth is considered clean.` }
    }
    return lane
  })

  return {
    score,
    headline: headlineForScore(score),
    updatedAt: dataset?.updatedAt ?? null,
    lanes,
    reviewOrder: ['Plan risk', 'Quality exposure', 'Reliability pressure', 'Supplier recovery', 'Source trust'],
    sourcePosture: [
      {
        label: 'Live sources',
        value: `${liveSourceCount}/${sourceCount || 0}`,
        detail: 'Connected inputs that can support the brief today.',
      },
      {
        label: 'Source trust',
        value: trustScore ? `${trustScore}/100` : 'seed',
        detail: 'Confidence before KPI explanation or AI writeback.',
      },
      {
        label: 'Open work',
        value: String(summary?.openTaskCount ?? 0),
        detail: 'Tasks that can become carryover without owner review.',
      },
      {
        label: 'Approval drag',
        value: String(summary?.pendingApprovalCount ?? 0),
        detail: 'Decisions that need human approval before records change.',
      },
    ],
    nextActions: lanes.slice(0, 4).map((lane) => ({
      title: lane.title,
      owner: lane.owner,
      route: lane.route,
      reason: lane.decision,
    })),
  }
}

export const INDUSTRIAL_DAILY_BRIEF_AGENT_ACTIONS = [
  'Summarize the last source changes with links.',
  'Name the top risk and the human owner.',
  'Draft CAPA, maintenance, or supplier packets only as reviewable drafts.',
  'Write the CEO brief in five bullets with no hidden assumptions.',
] as const
