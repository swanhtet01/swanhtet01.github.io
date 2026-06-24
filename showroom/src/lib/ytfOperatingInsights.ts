import type { DataFabricDataset } from './dataFabricApi'
import type { YtfRootKpiCandidate, YtfRootWarehouseDataset } from './ytfRootWarehouseApi'

export type YtfInsightAudience = 'manager' | 'plant' | 'admin'

export type YtfOperatingInsight = {
  id: string
  title: string
  signal: string
  owner: string
  severity: string
  route: string
  actionLabel: string
  metric: string
  kind: 'close' | 'review' | 'kpi' | 'quality' | 'maintenance' | 'commercial' | 'setup'
  updatedAt: string | null
}

export type YtfDailyCloseItem = {
  id: string
  title: string
  owner: string
  route: string
  metric: string
  prompt: string
}

const SOURCE_PRIORITY_FACTS: YtfDailyCloseItem[] = [
  {
    id: 'production-close',
    title: 'Production close',
    owner: 'Operations',
    route: '/app/daily-entry',
    metric: 'Daily output',
    prompt: 'Enter production totals, rejects, WIP, and shift issue before end of day.',
  },
  {
    id: 'quality-close',
    title: 'Quality close',
    owner: 'QC',
    route: '/app/daily-entry',
    metric: 'Claims / defects',
    prompt: 'Confirm claims, holds, defect photos, and containment owner.',
  },
  {
    id: 'maintenance-close',
    title: 'Maintenance close',
    owner: 'Maintenance',
    route: '/app/daily-entry',
    metric: 'Downtime',
    prompt: 'Log breakdown, downtime minutes, parts blocker, and next repair action.',
  },
  {
    id: 'planning-close',
    title: 'Planning / OT close',
    owner: 'Admin / Planning',
    route: '/app/daily-entry',
    metric: 'OT + plan',
    prompt: 'Confirm overtime, labor gap, tomorrow plan, and missing confirmation.',
  },
  {
    id: 'sales-close',
    title: 'Sales / inventory close',
    owner: 'Sales',
    route: '/app/daily-entry',
    metric: 'Stock movement',
    prompt: 'Confirm stock movement, showroom signal, retailer follow-up, and collection issue.',
  },
]

function normalizeText(value?: string | null) {
  return String(value || '').trim()
}

function compact(value?: string | null, max = 112) {
  const trimmed = normalizeText(value)
  if (!trimmed) return ''
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

function domainRoute(domain?: string | null) {
  const normalized = normalizeText(domain).toLowerCase()
  if (normalized.includes('quality')) return '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection'
  if (normalized.includes('maintenance')) return '/app/daily-entry?mode=normal_abnormal&section=Maintenance'
  if (normalized.includes('commercial') || normalized.includes('sales')) return '/app/sales'
  if (normalized.includes('finance') || normalized.includes('governance') || normalized.includes('procurement')) return '/app/approvals'
  if (normalized.includes('data') || normalized.includes('knowledge')) return '/app/live-data?view=kpi'
  if (normalized.includes('plant')) return '/app/plant-manager'
  return '/app/action-board'
}

function kindForDomain(domain?: string | null): YtfOperatingInsight['kind'] {
  const normalized = normalizeText(domain).toLowerCase()
  if (normalized.includes('quality')) return 'quality'
  if (normalized.includes('maintenance')) return 'maintenance'
  if (normalized.includes('commercial') || normalized.includes('sales')) return 'commercial'
  if (normalized.includes('finance') || normalized.includes('governance') || normalized.includes('data')) return 'setup'
  return 'review'
}

function businessTitle(rawTitle?: string | null, domain?: string | null) {
  const title = normalizeText(rawTitle)
  const lower = title.toLowerCase()
  if (lower.includes('tyre production') || lower.includes('production')) return 'Production totals need review'
  if (lower.includes('claim')) return 'Claim and defect records need review'
  if (lower.includes('o.t') || lower.includes('ot ') || lower.includes('overtime')) return 'Overtime record needs daily close'
  if (lower.includes('sales') || lower.includes('inventory') || lower.includes('retailer')) return 'Sales and stock movement need review'
  if (lower.includes('iso') || lower.includes('sop')) return 'ISO record needs owner confirmation'
  if (lower.includes('finance') || lower.includes('purchase') || lower.includes('po')) return 'Finance or purchase record needs follow-up'
  if (lower.includes('showroom')) return 'Showroom signal needs commercial follow-up'
  if (lower.includes('admin') || lower.includes('salary')) return 'Admin record needs controlled close'

  const normalizedDomain = normalizeText(domain)
  if (normalizedDomain) return `${normalizedDomain[0].toUpperCase()}${normalizedDomain.slice(1)} update needs review`
  return 'Operating update needs review'
}

function severityRank(value?: string | null) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized.includes('critical')) return 4
  if (normalized.includes('high')) return 3
  if (normalized.includes('review')) return 2
  if (normalized.includes('medium')) return 2
  if (normalized.includes('low')) return 1
  return 0
}

function insightFromKpi(candidate: YtfRootKpiCandidate): YtfOperatingInsight {
  return {
    id: `kpi-${candidate.id}`,
    title: `${candidate.name} needs review`,
    signal: compact(candidate.formulaHint || candidate.sourceSignal || 'Promote only after owner confirms the operating record.') || 'Promote only after owner confirms the operating record.',
    owner: candidate.owner || 'Plant Manager',
    severity: candidate.stage || 'candidate',
    route: candidate.route || '/app/data-quality',
    actionLabel: 'Review KPI',
    metric: 'KPI',
    kind: 'kpi',
    updatedAt: null,
  }
}

export function buildYtfDailyCloseItems(audience: YtfInsightAudience = 'manager') {
  if (audience === 'manager') return SOURCE_PRIORITY_FACTS.slice(0, 4)
  return SOURCE_PRIORITY_FACTS
}

export function buildYtfOperatingInsights(
  fabric: DataFabricDataset,
  warehouse: YtfRootWarehouseDataset,
  options: { audience?: YtfInsightAudience; limit?: number } = {},
) {
  const audience = options.audience ?? 'manager'
  const limit = options.limit ?? 6
  const insights: YtfOperatingInsight[] = []

  warehouse.changeWatch.forEach((item) => {
    insights.push({
      id: `change-${item.id}`,
      title: businessTitle(item.title, item.domain),
      signal: compact(item.nextAction || item.signal || 'Confirm owner, fact, and action before daily close.') || 'Confirm owner, fact, and action before daily close.',
      owner: item.owner || 'Plant Manager',
      severity: item.priority || 'review',
      route: item.route || domainRoute(item.domain),
      actionLabel: 'Open action',
      metric: item.metricCandidates?.[0] || 'Review',
      kind: kindForDomain(item.domain),
      updatedAt: item.updatedAt || null,
    })
  })

  warehouse.kpiCandidates.slice(0, audience === 'manager' ? 3 : 5).forEach((candidate) => {
    insights.push(insightFromKpi(candidate))
  })

  fabric.sourceEvents.slice(0, 4).forEach((event) => {
    insights.push({
      id: `event-${event.id}`,
      title: businessTitle(event.title, event.source),
      signal: compact(event.detail || 'A factory record changed and needs owner review.') || 'A factory record changed and needs owner review.',
      owner: event.owner || 'Plant Manager',
      severity: event.kind || 'event',
      route: event.route || domainRoute(event.source),
      actionLabel: 'Review',
      metric: event.kind || 'Event',
      kind: kindForDomain(event.source),
      updatedAt: event.signalAt || null,
    })
  })

  fabric.changeLineage.slice(0, 4).forEach((event) => {
    insights.push({
      id: `lineage-${event.id}`,
      title: businessTitle(event.assetName, event.source),
      signal: compact(event.nextStep || event.impact || 'Turn this into a task, KPI, or controlled document.') || 'Turn this into a task, KPI, or controlled document.',
      owner: event.changedBy || 'Data owner',
      severity: event.changeType || 'change',
      route: event.route || domainRoute(event.source),
      actionLabel: 'Open',
      metric: event.changeType || 'Change',
      kind: kindForDomain(event.source),
      updatedAt: event.changedAt || null,
    })
  })

  if (warehouse.mode === 'fallback' || warehouse.connectorStatus === 'fallback' || fabric.source === 'seed') {
    insights.push({
      id: 'setup-live-sync',
      title: 'Live sync needs confirmation',
      signal: 'The screen is using the prepared operating baseline until production storage and scheduled refresh are confirmed.',
      owner: 'Admin',
      severity: 'setup',
      route: '/app/platform-admin',
      actionLabel: 'Fix setup',
      metric: 'Setup',
      kind: 'setup',
      updatedAt: warehouse.lastSyncedAt || fabric.updatedAt || null,
    })
  }

  const deduped = new Map<string, YtfOperatingInsight>()
  insights.forEach((item) => {
    const key = `${item.title}:${item.owner}:${item.route}`
    if (!deduped.has(key)) deduped.set(key, item)
  })

  return [...deduped.values()]
    .sort((left, right) => {
      const severityDelta = severityRank(right.severity) - severityRank(left.severity)
      if (severityDelta !== 0) return severityDelta
      return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
    })
    .slice(0, limit)
}
