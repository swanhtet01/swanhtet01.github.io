import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { getSeedDataFabricDataset, loadDataFabricDataset, type DataFabricDataset } from '../lib/dataFabricApi'
import { canAccessPortalRoute } from '../lib/portalRouteAccess'
import { getTenantConfig } from '../lib/tenantConfig'
import {
  getCapabilityProfileForRole,
  getWorkspaceSession,
  getYtfDailyCloseSummary,
  getYtfOperatingMetrics,
  loadCachedWorkspaceSession,
  listWorkspaceTasks,
  sessionHasCapability,
  type WorkspaceTaskRow,
  type YtfDailyCloseSummaryResult,
  type YtfOperatingMetricsResult,
} from '../lib/workspaceApi'
import { isYtfFactoryFacingTask, isYtfInternalOrBuildTask } from '../lib/ytfUiFormat'
import {
  ytfCompactNumber,
  ytfMetricIsCurrentOperational,
  ytfMetricMatchesExactPlantScope,
  ytfMetricPlantScopeText,
  ytfMetricSourceContext,
  ytfMetricSourceBadge,
  ytfMetricSourceLine,
  ytfMetricScopeKind,
  ytfMetricScopeNotice,
  ytfMoneyText,
  rankYtfMetricRows,
  type YtfPlantScope,
  type YtfSizeMetricLike,
} from '../lib/ytfMetricContext'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

const ALLOWED_CAPABILITIES = [
  'actions.view',
  'receiving.view',
  'operations.view',
  'dqms.view',
  'maintenance.view',
  'documents.view',
  'sales.view',
  'director.view',
  'approvals.view',
  'tenant_admin.view',
  'platform_admin.view',
] as const

type ManagerPlantScope = {
  id: YtfPlantScope
  label: string
  shortLabel: string
  entryRoute: string
  boardRoute: string
  dataRoute: string
}

type ManagerQuickLink = {
  label: string
  to: string
  detail: string
  primary: boolean
}

type YtfStory = NonNullable<YtfOperatingMetricsResult['story']>
type YtfFactoryLane = NonNullable<NonNullable<YtfStory['factory_system']>['lanes']>[number]
type YtfProductionSizeRow = NonNullable<NonNullable<YtfStory['size_breakdowns']>['production_by_size']>[number]
type YtfPendingProductionCloseRow = NonNullable<NonNullable<YtfStory['size_breakdowns']>['pending_production_close']>[number] & YtfSizeMetricLike
type YtfQualitySizeRow = NonNullable<NonNullable<YtfStory['size_breakdowns']>['quality_claims_by_size']>[number]
type YtfStockSizeRow = NonNullable<NonNullable<YtfStory['size_breakdowns']>['stock_by_size']>[number]
type YtfProcurementSizeRow = NonNullable<NonNullable<YtfStory['size_breakdowns']>['procurement_by_size']>[number]
type YtfRawMaterialOrderRow = NonNullable<NonNullable<YtfStory['size_breakdowns']>['raw_material_orders']>[number]
type YtfErpFactRow = NonNullable<NonNullable<YtfOperatingMetricsResult['operating_facts']>['facts']>[number]
type ManagerValueRow = {
  category: string
  title: string
  value: string
  detail: string
  period: string
  source: string
  sourceBadge: string
  action: string
  route: string
}

function canOpenManagerSystem(session: SessionState | null | undefined) {
  return ALLOWED_CAPABILITIES.some((capability) => sessionHasCapability(session, capability))
}

function appendRouteQuery(route: string, params: Record<string, string>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const query = search.toString()
  if (!query) return route
  return `${route}${route.includes('?') ? '&' : '?'}${query}`
}

function managerPlantScope(role?: string | null): ManagerPlantScope {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'ceo' || normalized === 'director') {
    return {
      id: 'shared',
      label: 'Company',
      shortLabel: 'CEO',
      entryRoute: '/app/daily-entry?plant=shared&pack=company-review',
      boardRoute: '/app/action-board?plant=shared',
      dataRoute: '/app/live-data?view=kpi&plant=shared',
    }
  }
  if (normalized.includes('plant_b') || normalized === 'manager_plant_b') {
    return {
      id: 'plant-b',
      label: 'Plant B',
      shortLabel: 'B',
      entryRoute: '/app/daily-entry?plant=plant-b&pack=plant-b-control',
      boardRoute: '/app/action-board?plant=plant-b',
      dataRoute: '/app/live-data?view=kpi&plant=plant-b',
    }
  }
  if (normalized.includes('plant_a') || normalized === 'manager_plant_a') {
    return {
      id: 'plant-a',
      label: 'Plant A',
      shortLabel: 'A',
      entryRoute: '/app/daily-entry?plant=plant-a&pack=plant-a-control',
      boardRoute: '/app/action-board?plant=plant-a',
      dataRoute: '/app/live-data?view=kpi&plant=plant-a',
    }
  }
  return {
    id: 'plant-a',
    label: 'Plant A',
    shortLabel: 'A',
    entryRoute: '/app/daily-entry?plant=plant-a&pack=production-flow',
    boardRoute: '/app/action-board?plant=plant-a',
    dataRoute: '/app/live-data?view=kpi&plant=plant-a',
  }
}

function managerEntryModeRoute(scope: ManagerPlantScope, mode: string) {
  return appendRouteQuery(scope.entryRoute, { mode })
}

function managerQuickLinks(scope: ManagerPlantScope): ManagerQuickLink[] {
  return [
    {
      label: 'New Entry',
      to: scope.entryRoute,
      detail: '5W1H, normal/abnormal, 5S, or board photo.',
      primary: true,
    },
    {
      label: 'Team Board',
      to: scope.boardRoute,
      detail: 'Open work, evidence, and finished items.',
      primary: false,
    },
    {
      label: 'Plant Data',
      to: scope.dataRoute,
      detail: 'Production, QC, stock, and buying.',
      primary: false,
    },
  ]
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not yet'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function isOpenTask(row: WorkspaceTaskRow) {
  const normalized = String(row.status || '').trim().toLowerCase()
  return normalized !== 'done' && normalized !== 'closed' && normalized !== 'cancelled' && normalized !== 'resolved'
}

function isClosedTask(row: WorkspaceTaskRow) {
  const normalized = String(row.status || '').trim().toLowerCase()
  return normalized === 'done' || normalized === 'closed' || normalized === 'resolved'
}

function isTodayText(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (raw.toLowerCase() === 'today') return true
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return false
  const now = new Date()
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate()
}

function needsFollowUp(row: WorkspaceTaskRow) {
  const haystack = `${row.title} ${row.notes} ${row.template} ${row.status}`.toLowerCase()
  return haystack.includes('follow') || haystack.includes('evidence') || haystack.includes('photo') || haystack.includes('source') || haystack.includes('in_progress')
}

function managerQtyText(value?: number | null, unit = 'pcs', fallback = 'Needs entry') {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return `${ytfCompactNumber(numeric)} ${unit}`
}

function managerMoneyText(value?: number | null, fallback = 'Needs entry') {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return ytfMoneyText(numeric)
}

function managerValueText(value?: unknown, unit = '', fallback = 'Needs entry') {
  const text = [String(value ?? '').trim(), unit && unit !== 'amount' ? unit : ''].filter(Boolean).join(' ')
  if (!text) return fallback
  if (/^0(?:\.0+)?\s*(?:pcs|kg|ton|claims|rows|mmk)?$/i.test(text)) return fallback
  if (/\b0\s+pcs\b/i.test(text)) return text.replace(/\b0\s+pcs\b/gi, fallback)
  if (/^MMK\s+0$/i.test(text)) return fallback
  return text
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function managerSourceContext(row: YtfSizeMetricLike) {
  const scope = ytfMetricScopeNotice(row)
  let context = ytfMetricSourceContext(row)
  if (scope) {
    context = context.replace(new RegExp(`\\s*/\\s*${escapeRegExp(scope)}\\s*$`, 'i'), '')
  }
  return context
    .replace(/\bPeriod\s+2026-(?:01|02|03|04)\b/gi, 'Needs today entry')
    .replace(
      /\bPeriod\s+(?:2026[\s_-]+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?)[\s_-]+2026)\b/gi,
      'Needs today entry',
    )
    .trim()
}

function currentOperationalRows<T extends YtfSizeMetricLike>(
  rows: T[],
  options: { minYear?: number; allowLowConfidence?: boolean; allowArchiveMarker?: boolean; category?: string; preferredScope?: YtfPlantScope } = {},
): T[] {
  return rankYtfMetricRows(rows.filter((row) => ytfMetricIsCurrentOperational(row, options)), {
    category: options.category,
    preferredScope: options.preferredScope,
    minYear: options.minYear,
  })
}

function findFactoryLane(lanes: YtfFactoryLane[], id: string) {
  return lanes.find((lane) => String(lane.id || '').toLowerCase() === id)
}

function preferredScopedCurrentOperationalRows<T extends YtfSizeMetricLike>(
  rows: T[],
  plantScope: YtfPlantScope,
  options: { minYear?: number; allowLowConfidence?: boolean; allowArchiveMarker?: boolean; category?: string } = {},
): T[] {
  const currentRows = currentOperationalRows(rows, { ...options, preferredScope: plantScope })
  if (plantScope === 'all') return currentRows
  const exactRows = rankYtfMetricRows(currentRows.filter((row) => ytfMetricMatchesExactPlantScope(row, plantScope)), {
    category: options.category,
    preferredScope: plantScope,
    minYear: options.minYear,
  })
  if (exactRows.length) return exactRows
  if (plantScope === 'plant-a' || plantScope === 'plant-b') {
    return []
  }
  return rankYtfMetricRows(currentRows.filter((row) => ytfMetricMatchesExactPlantScope(row, plantScope)), {
    category: options.category,
    preferredScope: plantScope,
    minYear: options.minYear,
  })
}

function managerScopedTitle(_row: YtfSizeMetricLike, title: string) {
  return title
}

function managerScopedDetail(row: YtfSizeMetricLike, detail: string) {
  const scope = ytfMetricScopeNotice(row)
  return scope ? `${scope} / ${detail}` : detail
}

function managerScopedAction(row: YtfSizeMetricLike, fallback: string, plantScope: YtfPlantScope = 'all') {
  if (ytfMetricScopeKind(row) === 'shared') {
    return `Add a board photo if ${ytfMetricPlantScopeText(plantScope)} changed today.`
  }
  return fallback
}

function factMatchesPlantScope(fact: YtfErpFactRow, plantScope: YtfPlantScope) {
  const scope = String(fact.plant_scope || '').toLowerCase()
  if (plantScope === 'all') return scope !== 'unknown'
  return scope === plantScope || scope === 'shared'
}

function factCategory(fact: YtfErpFactRow) {
  const lane = String(fact.lane || '').toLowerCase()
  if (lane === 'production') return 'Production'
  if (lane === 'quality') return 'Quality'
  if (lane === 'sales_inventory') return 'Stock'
  if (lane === 'finance_procurement') return 'Supplier'
  if (lane === 'maintenance') return 'Maintenance'
  return fact.lane_label || 'Plant data'
}

function factHasUsableCurrentPeriod(fact: YtfErpFactRow) {
  const text = [
    fact.period_label,
    fact.source_sheet,
    fact.source_file,
    fact.plant_label,
    fact.section,
  ]
    .filter(Boolean)
      .join(' ')
    .toLowerCase()
  if (
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?)\s+2026\b/.test(text) ||
    /\b2026\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?)\b/.test(text)
  ) {
    return false
  }
  const ymd = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (ymd) {
    const year = Number(ymd[1])
    const month = Number(ymd[2])
    if (year > 2030 || year < 2026) return false
    if (year === 2026 && month < 5) return false
  }
  return true
}

function buildFactValueRows(metrics: YtfOperatingMetricsResult | null, plantScope: YtfPlantScope): ManagerValueRow[] {
  const facts = (metrics?.operating_facts ?? metrics?.erp_fact_ledger)?.facts ?? []
  const rows = facts
    .filter((fact) => factMatchesPlantScope(fact, plantScope))
    .filter(factHasUsableCurrentPeriod)
    .filter((fact) => Number.isFinite(Number(fact.numeric_value)))
    .slice(0, 8)
    .map((fact) => {
      const category = factCategory(fact)
      const size = String(fact.tyre_size || '').trim()
      const title = [size, fact.metric_name || category].filter(Boolean).join(' - ')
      const period = String(fact.period_label || fact.source_sheet || fact.plant_label || '').trim()
      const source = [fact.source_file, fact.source_sheet].filter(Boolean).join(' / ')
      const unit = String(fact.unit || '').trim()
      return {
        category,
        title: title || category,
        value: managerValueText(fact.value || ytfCompactNumber(Number(fact.numeric_value || 0)), unit),
        detail: [fact.plant_label, fact.section, period].filter(Boolean).join(' / '),
        period,
        source,
        sourceBadge: fact.source_status || 'extracted',
        action: fact.action_label || 'Add today entry if this changed.',
        route: fact.data_route || `/app/live-data?view=kpi&plant=${plantScope}`,
      }
    })
  return firstRowByCategory(rows).slice(0, 5)
}

function buildManagerValueRows(metrics: YtfOperatingMetricsResult | null, plantScope: YtfPlantScope = 'plant-a'): ManagerValueRow[] {
  const factRows = buildFactValueRows(metrics, plantScope)
  const breakdowns = metrics?.story?.size_breakdowns
  const pendingProductionRows = preferredScopedCurrentOperationalRows((breakdowns?.pending_production_close ?? []) as YtfPendingProductionCloseRow[], plantScope, {
    minYear: 2025,
    allowLowConfidence: true,
    category: 'production',
  })
  const factHasProduction = factRows.some((row) => row.category === 'Production')
  if (factRows.length >= 3 && (factHasProduction || !pendingProductionRows.length)) {
    return factRows
  }
  const productionRows = preferredScopedCurrentOperationalRows(breakdowns?.production_by_size ?? [], plantScope, { minYear: 2025, category: 'production' })
  const qualityRows = preferredScopedCurrentOperationalRows(breakdowns?.quality_claims_by_size ?? [], plantScope, { minYear: 2024, category: 'quality' })
  const stockRows = preferredScopedCurrentOperationalRows(breakdowns?.stock_by_size ?? [], plantScope, { minYear: 2024, category: 'stock' })
  const procurementRows = preferredScopedCurrentOperationalRows(breakdowns?.procurement_by_size ?? [], plantScope, { minYear: 2024, category: 'procurement' })
  const rawMaterialRows = preferredScopedCurrentOperationalRows(breakdowns?.procurement_material_orders ?? breakdowns?.raw_material_orders ?? [], plantScope, {
    minYear: 2024,
    category: 'raw material',
  })

  const rows: ManagerValueRow[] = []

  if (!productionRows.length) {
    pendingProductionRows.slice(0, 2).forEach((row) => {
      const context = managerSourceContext(row)
      rows.push({
        category: 'Production',
        title: managerScopedTitle(row, `${row.size || 'Production close'} needs confirmation`),
        value: managerQtyText(row.pending_qty),
        detail: managerScopedDetail(row, `${context} / confirm close`),
        period: context,
        source: ytfMetricSourceLine(row),
        sourceBadge: 'needs confirm',
        action: managerScopedAction(row, 'Confirm date, shift, good qty, rejects, and plant.', plantScope),
        route: `/app/live-data?view=kpi&lane=production&plant=${plantScope}`,
      })
    })
  }

  productionRows.slice(0, 3).forEach((row: YtfProductionSizeRow) => {
    const context = managerSourceContext(row)
    rows.push({
      category: 'Production',
      title: managerScopedTitle(row, `${row.size || 'Production size'} output`),
      value: managerQtyText(row.output_qty),
      detail: managerScopedDetail(row, `${context}${row.weight_kg ? ` / ${ytfCompactNumber(row.weight_kg, 1)} kg` : ''}`),
      period: context,
      source: ytfMetricSourceLine(row),
      sourceBadge: ytfMetricSourceBadge(row),
      action: managerScopedAction(row, 'Add today board photo if the line changed.', plantScope),
      route: `/app/live-data?view=kpi&plant=${plantScope}`,
    })
  })

  qualityRows.slice(0, 2).forEach((row: YtfQualitySizeRow) => {
    const context = managerSourceContext(row)
    rows.push({
      category: 'Quality',
      title: managerScopedTitle(row, `${row.size || 'Quality size'} claims`),
      value: managerQtyText(row.claim_qty, 'claims', 'No claims logged'),
      detail: managerScopedDetail(row, `${context}${row.claim_amount ? ` / ${ytfMoneyText(row.claim_amount)}` : ''}`),
      period: context,
      source: ytfMetricSourceLine(row),
      sourceBadge: ytfMetricSourceBadge(row),
      action: managerScopedAction(row, 'Add defect reason, process stage, and photo if repeated.', plantScope),
      route: `/app/live-data?view=kpi&plant=${plantScope}`,
    })
  })

  stockRows.slice(0, 2).forEach((row: YtfStockSizeRow) => {
    const movementQty = row.movement_qty ?? row.received_qty ?? row.issued_qty ?? row.closing_qty
    const stockParts = [
      Number(row.received_qty || 0) > 0 ? `R ${ytfCompactNumber(row.received_qty)}` : '',
      Number(row.issued_qty || 0) > 0 ? `I ${ytfCompactNumber(row.issued_qty)}` : '',
      Number(row.closing_qty || 0) > 0 ? `C ${ytfCompactNumber(row.closing_qty)}` : '',
    ].filter(Boolean)
    const context = managerSourceContext(row)
    rows.push({
      category: 'Stock',
      title: managerScopedTitle(row, `${row.size || 'Stock size'} movement`),
      value: managerQtyText(movementQty),
      detail: managerScopedDetail(row, [...stockParts, context].join(' / ')),
      period: context,
      source: ytfMetricSourceLine(row),
      sourceBadge: ytfMetricSourceBadge(row),
      action: managerScopedAction(row, 'Check balance board and enter today close if different.', plantScope),
      route: `/app/live-data?view=kpi&plant=${plantScope}`,
    })
  })

  procurementRows.slice(0, 1).forEach((row: YtfProcurementSizeRow) => {
    const context = managerSourceContext(row)
    rows.push({
      category: 'Supplier',
      title: managerScopedTitle(row, `${row.size || 'Buying size'} buying`),
      value: row.pcs ? managerQtyText(row.pcs) : managerMoneyText(row.amount),
      detail: managerScopedDetail(row, [managerMoneyText(row.amount), context].filter(Boolean).join(' / ')),
      period: context,
      source: ytfMetricSourceLine(row),
      sourceBadge: ytfMetricSourceBadge(row),
      action: managerScopedAction(row, 'Check whether this buying signal changes receiving, stock, or production today.', plantScope),
      route: `/app/live-data?view=kpi&plant=${plantScope}`,
    })
  })

  if (!procurementRows.length) {
    rawMaterialRows.slice(0, 1).forEach((row: YtfRawMaterialOrderRow) => {
      const sourceRow = { source: row.source, plant: 'Supplier / raw material' }
      const tonText = row.order_ton ? `${ytfCompactNumber(row.order_ton, 1)} ton` : ''
      const lbText = row.order_lb ? `${ytfCompactNumber(row.order_lb, 0)} lb` : ''
      const context = managerSourceContext(sourceRow)
      rows.push({
        category: 'Supplier',
        title: managerScopedTitle(row, `${row.material || 'Raw material'} order`),
        value: tonText || managerMoneyText(row.amount_mmk),
        detail: managerScopedDetail(row, [managerMoneyText(row.amount_mmk), lbText, context].filter(Boolean).join(' / ')),
        period: context,
        source: ytfMetricSourceLine(sourceRow),
        sourceBadge: ytfMetricSourceBadge(row),
        action: managerScopedAction(row, 'Check receiving, stock, and production impact when raw material status changes.', plantScope),
        route: `/app/live-data?view=kpi&plant=${plantScope}`,
      })
    })
  }

  return firstRowByCategory([...factRows, ...rows]).slice(0, 6)
}

function firstRowByCategory(rows: ManagerValueRow[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = row.category.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function managerTopValueLabel(rows: ManagerValueRow[]) {
  const production = rows.find((row) => row.category === 'Production')
  const quality = rows.find((row) => row.category === 'Quality')
  const stock = rows.find((row) => row.category === 'Stock')
  const supplier = rows.find((row) => row.category === 'Supplier')
  const parts = [
    production ? `Output ${production.value}` : '',
    quality ? `QC ${quality.value}` : '',
    stock ? `Stock ${stock.value}` : '',
    supplier ? `Buying ${supplier.value}` : '',
  ].filter(Boolean)
  return parts.slice(0, 2).join(' / ')
}

function taskTeamLabel(row: WorkspaceTaskRow) {
  const text = `${row.owner} ${row.title} ${row.notes} ${row.template}`.toLowerCase()
  if (/(qc|quality|claim|defect|capa|inspection)/.test(text)) return 'QC team'
  if (/(maintenance|machine|downtime|repair|utility|spare)/.test(text)) return 'Maintenance team'
  if (/(sales|inventory|stock|showroom|dealer|dispatch)/.test(text)) return 'Sales / inventory team'
  if (/(admin|planning|hr|ot)/.test(text)) return 'Admin / planning team'
  if (/(mixing|curing|building|production|shift|output|wip)/.test(text)) return 'Production team'
  return 'Plant team'
}

function taskPlantScope(row: WorkspaceTaskRow): YtfPlantScope | 'shared' {
  const text = `${row.owner} ${row.title} ${row.notes} ${row.template}`.toLowerCase()
  if (/(plant\s*b|bilin|mon state|radial|motorcycle|\bmc\b|no\.?\s*2|large machinery)/.test(text)) return 'plant-b'
  if (/(plant\s*a|shwe|shwe pyi thar|yangon|bias|nylon|agricultural|mixing|curing|tyre building)/.test(text)) return 'plant-a'
  return 'shared'
}

function taskMatchesManagerPlant(row: WorkspaceTaskRow, plantScope: YtfPlantScope) {
  if (plantScope === 'all') return true
  const rowScope = taskPlantScope(row)
  return rowScope === 'shared' || rowScope === plantScope
}

function buildCollaborationRows(openTasks: WorkspaceTaskRow[]) {
  const groups = new Map<string, { team: string; count: number; high: number; sample: WorkspaceTaskRow | null }>()
  openTasks.forEach((task) => {
    const team = taskTeamLabel(task)
    const current = groups.get(team) ?? { team, count: 0, high: 0, sample: null }
    current.count += 1
    if (String(task.priority || '').toLowerCase().includes('high')) current.high += 1
    current.sample = current.sample ?? task
    groups.set(team, current)
  })
  return [...groups.values()].sort((left, right) => right.high - left.high || right.count - left.count).slice(0, 4)
}

async function withFallback<T>(promise: Promise<T>, fallback: T, timeoutMs = 3500): Promise<T> {
  return await Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}

async function loadDataFabricDatasetWithFallback(timeoutMs = 2500) {
  return await Promise.race([
    loadDataFabricDataset().catch(() => getSeedDataFabricDataset()),
    new Promise<DataFabricDataset>((resolve) => {
      setTimeout(() => resolve(getSeedDataFabricDataset()), timeoutMs)
    }),
  ])
}

function ManagerActionGrid({ links }: { links: ManagerQuickLink[] }) {
  return (
    <div className="sm-ytf-action-grid">
      {links.map((item) => (
        <Link className={`sm-ytf-action-tile ${item.primary ? 'is-primary' : ''}`.trim()} key={item.to} to={item.to}>
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
      ))}
    </div>
  )
}

export function ManagerOperatingSystemPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionState | null>(() => loadCachedWorkspaceSession()?.session ?? null)
  const [dataFabric, setDataFabric] = useState<DataFabricDataset>(() => getSeedDataFabricDataset())
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])
  const [operatingMetrics, setOperatingMetrics] = useState<YtfOperatingMetricsResult | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [dailyCloseSummary, setDailyCloseSummary] = useState<YtfDailyCloseSummaryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const cachedSession = loadCachedWorkspaceSession()
        setMetricsLoading(true)
        const operatingMetricsPromise = getYtfOperatingMetrics().catch(() => null)
        const [payload, nextDataFabric, taskPayload, dailyClose] = await Promise.all([
          withFallback(getWorkspaceSession(), cachedSession, 2500),
          loadDataFabricDatasetWithFallback(),
          withFallback(listWorkspaceTasks(undefined, 80), { rows: [] as WorkspaceTaskRow[] }, 2500),
          withFallback(getYtfDailyCloseSummary(), null, 2500),
        ])
        if (!cancelled) {
          setSession(payload?.session ?? cachedSession?.session ?? null)
          setDataFabric(nextDataFabric)
          setTasks(taskPayload.rows ?? [])
          setDailyCloseSummary(dailyClose)
          setError(null)
        }
        void operatingMetricsPromise.then((metrics) => {
          if (!cancelled) {
            setOperatingMetrics(metrics)
            setMetricsLoading(false)
          }
        })
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Manager workspace could not be loaded.')
          setMetricsLoading(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const capabilityProfile = useMemo(() => getCapabilityProfileForRole(session?.role), [session?.role])
  const plantScope = useMemo(() => managerPlantScope(capabilityProfile.roleKey), [capabilityProfile.roleKey])
  const quickLinks = useMemo(() => managerQuickLinks(plantScope).filter((item) => canAccessPortalRoute(item.to, session)), [plantScope, session])
  const dataUpdatedAt = dataFabric?.updatedAt ?? null
  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !isYtfInternalOrBuildTask(task) &&
          isYtfFactoryFacingTask(task) &&
          taskMatchesManagerPlant(task, plantScope.id),
      ),
    [tasks, plantScope.id],
  )
  const openTasks = useMemo(() => visibleTasks.filter(isOpenTask), [visibleTasks])
  const dueTodayCount = useMemo(() => openTasks.filter((task) => isTodayText(task.due)).length, [openTasks])
  const needsFollowUpCount = useMemo(() => openTasks.filter(needsFollowUp).length, [openTasks])
  const doneTodayCount = useMemo(
    () => visibleTasks.filter((task) => isClosedTask(task) && isTodayText(task.updated_at || task.created_at)).length,
    [visibleTasks],
  )
  const factoryLanes = operatingMetrics?.story?.factory_system?.lanes ?? []
  const productionLane = findFactoryLane(factoryLanes, 'production')
  const operatingRows = useMemo(() => buildManagerValueRows(operatingMetrics, plantScope.id), [operatingMetrics, plantScope.id])
  const visibleOperatingRows = useMemo(() => firstRowByCategory(operatingRows).slice(0, 4), [operatingRows])
  const collaborationRows = useMemo(() => buildCollaborationRows(openTasks), [openTasks])
  const visibleCollaborationRows = useMemo(() => collaborationRows.slice(0, 3), [collaborationRows])
  const missingDailyInputs = dailyCloseSummary?.inputs?.filter((input) => input.status !== 'ready') ?? []
  const hasPlantNumbers = !metricsLoading && operatingRows.length > 0
  const valueCountLabel = metricsLoading
    ? 'Checking plant data'
    : managerTopValueLabel(operatingRows) || productionLane?.value || (hasPlantNumbers ? 'Plant data ready' : 'Add board photo')
  const plantNumbersLabel = metricsLoading ? 'Checking' : managerTopValueLabel(operatingRows) || (operatingRows.length ? 'Review' : 'Add board')
  const oeeProxy = dailyCloseSummary?.summary?.oee_proxy
  const dailyNumbersValue =
    oeeProxy === null || oeeProxy === undefined || Number.isNaN(oeeProxy)
      ? 'Upload'
      : `${Math.round(Number(oeeProxy) * 100)}%`
  if (!session) {
    return (
      <section className="sm-ytf-simple-page">
        <div className="sm-ytf-panel">
          <h1>Login required.</h1>
          <p>Open the Yangon Tyre workspace before using manager tools.</p>
          <Link className="sm-button-primary mt-4" to="/login?next=/app/manager-system">
            Login
          </Link>
        </div>
      </section>
    )
  }

  if (!canOpenManagerSystem(session)) {
    return (
      <section className="sm-ytf-simple-page">
        <div className="sm-ytf-panel">
          <h1>No manager access.</h1>
          <p>Current role: {capabilityProfile.label}. Use your assigned home or ask admin for the manager workspace.</p>
          <Link className="sm-button-primary mt-4" to="/app/start">
            Open launchpad
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row" aria-busy={loading}>
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">{tenant.brandName}</p>
          <h1>{plantScope.label} manager home.</h1>
          <p>Add today&apos;s work. Check team work. Read current plant values.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{capabilityProfile.label} / {plantScope.shortLabel}</span>
          <span>Team board</span>
          <span>{valueCountLabel}</span>
          <span>{formatDateTime(dataUpdatedAt)}</span>
        </div>
      </section>

      {error ? <section className="sm-ytf-alert">{error}</section> : null}

      <ManagerActionGrid links={quickLinks} />

      <section className="sm-ytf-metric-strip is-compact">
        <Link to={plantScope.boardRoute}>
          <span>Open work</span>
          <strong>{openTasks.length}</strong>
          <small>Finish, reassign, or request a clear update.</small>
        </Link>
        <Link to={plantScope.boardRoute}>
          <span>Due today</span>
          <strong>{dueTodayCount}</strong>
          <small>Finish before shift handoff.</small>
        </Link>
        <Link to={plantScope.boardRoute}>
          <span>Follow-up</span>
          <strong>{needsFollowUpCount}</strong>
          <small>Add one board photo, quantity, or note.</small>
        </Link>
        <Link to={plantScope.dataRoute}>
          <span>Plant values</span>
          <strong>{plantNumbersLabel}</strong>
          <small>Production, QC, stock, and supplier values.</small>
        </Link>
      </section>

      <section className="sm-ytf-panel sm-ytf-manager-today-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Today</p>
            <h2>Today.</h2>
          </div>
          <Link className="sm-link" to={plantScope.entryRoute}>
            New entry
          </Link>
        </div>
        <div className="sm-ytf-metric-strip is-compact">
          <Link to={managerEntryModeRoute(plantScope, 'whiteboard_snapshot')}>
            <span>Board photo</span>
            <strong>{dailyNumbersValue}</strong>
            <small>Use when output, rejects, downtime, WIP, or stock are on a board.</small>
          </Link>
          <Link to={managerEntryModeRoute(plantScope, 'daily_routine')}>
            <span>Routine missing</span>
            <strong>{missingDailyInputs.length}</strong>
            <small>Daily 5W1H entries still needed.</small>
          </Link>
          <Link to={plantScope.boardRoute}>
            <span>Done today</span>
            <strong>{doneTodayCount}</strong>
            <small>closed records from today.</small>
          </Link>
        </div>
        <div className="sm-ytf-data-list-head">
          <strong>Plant Data</strong>
          <span>Production, QC, stock, and supplier values.</span>
        </div>
        <div className="sm-ytf-compact-list">
          {visibleOperatingRows.map((row, index) => (
            <Link className="sm-ytf-list-row" key={`${row.title}-${row.source}-${index}`} to={row.route}>
              <span>
                <strong>{row.title}</strong>
                <small>{row.detail}</small>
              </span>
              <em>{row.value}</em>
            </Link>
          ))}
          {metricsLoading && !operatingRows.length ? (
            <Link className="sm-ytf-list-row" to={plantScope.dataRoute}>
              <span>
                <strong>Open Plant Data</strong>
                <small>Production, quality, stock, and supplier values are ready there.</small>
              </span>
              <em>Data</em>
            </Link>
          ) : null}
          {!operatingRows.length && !metricsLoading ? (
          <Link className="sm-ytf-list-row" to={hasPlantNumbers ? plantScope.dataRoute : managerEntryModeRoute(plantScope, 'whiteboard_snapshot')}>
              <span>
                <strong>{hasPlantNumbers ? `${plantNumbersLabel} for ${plantScope.label}` : 'No values loaded yet'}</strong>
                <small>{hasPlantNumbers ? `Open Data to see scoped production, quality, stock, and supplier rows.` : 'Add output, rejects, downtime, WIP, OT, or stock from the floor.'}</small>
              </span>
              <em>{hasPlantNumbers ? 'Data' : 'Entry'}</em>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="sm-ytf-panel sm-ytf-manager-secondary">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Team</p>
            <h2>Collaboration queue.</h2>
          </div>
          <Link className="sm-link" to={plantScope.boardRoute}>
            Board
          </Link>
        </div>
        <div className="sm-ytf-compact-list">
          {visibleCollaborationRows.map((row) => (
            <Link className="sm-ytf-list-row sm-ytf-insight-row" key={row.team} to={plantScope.boardRoute}>
              <span>
                <strong>{row.team}</strong>
                <small>{row.sample?.title || 'Open team work'}</small>
                <small>{row.high} high / {row.count} open</small>
              </span>
              <em>Open</em>
            </Link>
          ))}
          {!collaborationRows.length ? (
            <Link className="sm-ytf-list-row sm-ytf-insight-row" to={managerEntryModeRoute(plantScope, 'daily_routine')}>
              <span>
                <strong>No open team work</strong>
                <small>Add a Daily 5W1H, abnormal record, 5S check, or board photo when there is something real to capture.</small>
              </span>
              <em>Entry</em>
            </Link>
          ) : null}
        </div>
      </section>

    </div>
  )
}
