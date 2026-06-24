import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import {
  confirmYtfProductionClose,
  getCapabilityProfileForRole,
  getLatestYtfDataManagerRun,
  getMetricRecords,
  getWorkspaceSession,
  getYtfBotPipeline,
  getYtfCloudCommsRuntime,
  getYtfCommunicationsLatest,
  getYtfCompanyBrainGraph,
  getYtfDashboardSummary,
  getYtfFileAgentRunsLatest,
  getYtfFileAgentsStatus,
  getYtfFullRefreshLatest,
  getYtfGmailStatus,
  getYtfKnowledgeStatus,
  getYtfKpiDefinitionsLatest,
  getYtfOperatingMetrics,
  getYtfPipelineStats,
  getYtfSourceChanges,
  getYtfSourceBehaviorMap,
  getYtfSourceRecords,
  getYtfWorkbookExtractionLatest,
  runYtfFileAgents,
  runYtfFullRefresh,
  saveYtfCommunicationManualDrop,
  sessionHasCapability,
  syncYtfGmail,
  updateMetricRecordStatus,
  type EnterpriseMetricRecord,
  type WorkspaceCapability,
  type WorkspaceSessionPayload,
  type YtfBotPipelineResult,
  type YtfBotRecentMessage,
  type YtfChatFact,
  type YtfCloudCommsRuntimeResult,
  type YtfCommunicationsLatestResult,
  type YtfCompanyBrainGraphResult,
  type YtfDashboardSummaryResult,
  type YtfFileAgentRunsResult,
  type YtfDataManagerRunResult,
  type YtfFileAgentRow,
  type YtfFileAgentsStatusResult,
  type YtfFullRefreshLatestResult,
  type YtfGmailStatusResult,
  type YtfKnowledgeStatusResult,
  type YtfOperatingMetricsResult,
  type YtfPipelineStatsResult,
  type YtfSourceBehaviorMapResult,
  type YtfSourceChangeEvent,
  type YtfSourceChangesResult,
  type YtfSourceRecord,
  type YtfSourceRecordsResult,
  type YtfWorkbookExtractionResult,
} from '../lib/workspaceApi'
import { resolveRoleDataView } from '../lib/roleDataVisibilityModel'
import {
  isGenericYtfMetricName,
  selectTopYtfOperatingRows,
  type YtfOperatingMetricRow,
  ytfOperatingMetricContext,
  ytfOperatingMetricSource,
  ytfOperatingMetricStatus,
  ytfOperatingMetricTitle,
  ytfOperatingMetricValue,
} from '../lib/ytfMetricRows'
import {
  inferYtfTextPlantScope,
  ytfCompactNumber,
  ytfMetricIsCurrentOperational,
  ytfMetricMatchesExactPlantScope,
  ytfMetricPlantScopeText,
  ytfMetricSourceContext,
  ytfMetricSourceLine,
  ytfMoneyText,
  normalizeYtfPlantScope,
  rankYtfMetricRows,
  ytfProcurementMetricCard,
  ytfProductionMetricCard,
  ytfQualityMetricCard,
  ytfRawMaterialMetricCard,
  ytfStockMetricCard,
  type YtfMetricDisplayCard,
  type YtfPlantScope,
  type YtfSizeMetricLike,
} from '../lib/ytfMetricContext'
import { ytfWcmMetricLens } from '../lib/ytfWcmModel'

type LiveDataView = 'operate' | 'database' | 'data' | 'kpi' | 'comms' | 'actions'
type SourceChangeEvent = YtfSourceChangeEvent
type ActionGroupId = 'do_now' | 'needs_source' | 'kpi_review' | 'maintenance' | 'archive'
type WorkbookMetricValue = NonNullable<YtfWorkbookExtractionResult['metric_values']>[number]
type WorkbookMetricCandidate = NonNullable<YtfWorkbookExtractionResult['metric_candidates']>[number]
type WorkbookAgentTrustRow = NonNullable<NonNullable<YtfWorkbookExtractionResult['agent_table_trust']>['rows']>[number]
type OperatingLane = NonNullable<YtfOperatingMetricsResult['lanes']>[number]
type OperatingLaneRow = NonNullable<OperatingLane['rows']>[number]
type PlantOperatingScope = 'plant-a' | 'plant-b' | 'shared'
type ProductionBySizeRow = NonNullable<NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['size_breakdowns']>['production_by_size']>[number]
type ErpFactLedgerRow = NonNullable<NonNullable<YtfOperatingMetricsResult['operating_facts']>['facts']>[number]
type PlantSplitCard = {
  label: string
  value: string
  numericValue: number
  detail: string
  route: string
}
type OwnerFocusItem = {
  label?: string
  sample?: string
  route?: string
  count?: number
}

function currentMetricRows<T extends YtfSizeMetricLike>(
  rows: T[] = [],
  options: {
    minYear?: number
    allowLowConfidence?: boolean
    allowArchiveMarker?: boolean
    maxAgeDays?: number
    preferBusinessDate?: boolean
    allowIngestFallback?: boolean
  } = {},
): T[] {
  return rows.filter((row) => ytfMetricIsCurrentOperational(row, options))
}

type PlantMetricSignal = {
  label: string
  value: number
  unit: string
  detail: string
  score: number
}
type FactoryLedgerLaneId = 'production' | 'quality' | 'stock' | 'supplier'
type LiveDataLaneFilter = 'all' | FactoryLedgerLaneId

type PendingProductionCloseRow = NonNullable<NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['size_breakdowns']>['pending_production_close']>[number]
type ConfirmableProductionRow = PendingProductionCloseRow | ProductionBySizeRow

function normalizeLiveDataLaneFilter(value: string | null): LiveDataLaneFilter {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'all'
  if (/(production|output|plant)/.test(normalized)) return 'production'
  if (/(quality|claim|defect|qc)/.test(normalized)) return 'quality'
  if (/(sales|stock|inventory|dispatch|showroom|sales_inventory)/.test(normalized)) return 'stock'
  if (/(supplier|procurement|finance|finance_procurement|maintenance|purchase|material)/.test(normalized)) return 'supplier'
  return 'all'
}

function normalizeYtfSizeToken(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function prioritizeRowsBySize<T>(rows: T[], selectedSizeToken: string, rowLabel: (row: T) => string): T[] {
  if (!selectedSizeToken) return rows
  const exact = rows.filter((row) => normalizeYtfSizeToken(rowLabel(row)) === selectedSizeToken)
  if (!exact.length) return rows
  const rest = rows.filter((row) => normalizeYtfSizeToken(rowLabel(row)) !== selectedSizeToken)
  return [...exact, ...rest]
}

type FactoryLedgerItem = {
  laneId: FactoryLedgerLaneId
  title: string
  value: string
  context: string
  source: string
  status: string
  route: string
  score: number
}
type FactoryLedgerLaneCard = {
  id: FactoryLedgerLaneId
  label: string
  hint: string
  entryMode: string
  count: number
  rows: FactoryLedgerItem[]
}
const LIVE_DATA_VIEWS: Array<{ id: LiveDataView; label: string; hint: string }> = [
  { id: 'kpi', label: 'Numbers', hint: 'Production and factory metrics' },
  { id: 'operate', label: 'Areas', hint: 'Plant data map' },
  { id: 'data', label: 'Records', hint: 'Organized factory data' },
  { id: 'actions', label: 'Work', hint: 'Team board' },
  { id: 'comms', label: 'Messages', hint: 'Private intake' },
  { id: 'database', label: 'Setup', hint: 'Background status' },
]

const RAW_COMMS_CAPABILITIES: WorkspaceCapability[] = ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view']
const RAW_SOURCE_CAPABILITIES: WorkspaceCapability[] = ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view', 'director.view']
const ADMIN_RUNTIME_CAPABILITIES: WorkspaceCapability[] = ['tenant_admin.view', 'platform_admin.view', 'connector_admin.view']
const ADMIN_ROLE_NAMES = new Set(['admin', 'owner', 'ceo', 'director', 'tenant_admin', 'platform_admin', 'implementation_lead'])
const RAW_COMMS_ROLE_NAMES = new Set(['admin', 'owner', 'ceo', 'tenant_admin', 'platform_admin'])

const DAILY_CLOUD_REFRESH_STEPS = [
  { time: '23:30 MMT', label: 'Queue clean-up', detail: 'Prepare owner, plant, and data-quality jobs.' },
  { time: '23:40 MMT', label: 'Record map', detail: 'Rebuild record map and detect changed records.' },
  { time: '23:50 MMT', label: 'Comms intake', detail: 'Sync Gmail status and chat/bot evidence drops.' },
  { time: '00:00 MMT', label: 'Daily numbers', detail: 'Prepare plant values, work items, and evidence.' },
  { time: '00:10 MMT', label: 'Evidence lookup', detail: 'Refresh searchable context with citations.' },
  { time: '00:40 MMT', label: 'Full update', detail: 'Run the complete safety net pass and save the marker.' },
]

function compactNumber(value?: number | null) {
  return Number(value || 0).toLocaleString()
}

function compactDateTime(value?: string | null, fallback = 'Current view') {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function compactSourceName(value?: string | null) {
  return String(value || '').replace(/[_-][0-9a-f]{8,}(?:-[0-9a-f]{4,})*$/i, '').trim()
}

function publicDataText(value?: string | null, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  const monthMap: Record<string, string> = {
    jan: '01',
    january: '01',
    feb: '02',
    february: '02',
    mar: '03',
    march: '03',
    apr: '04',
    april: '04',
    may: '05',
    jun: '06',
    june: '06',
    jul: '07',
    july: '07',
    aug: '08',
    august: '08',
    sep: '09',
    sept: '09',
    september: '09',
    oct: '10',
    october: '10',
    nov: '11',
    november: '11',
    dec: '12',
    december: '12',
  }
  const cleaned = text
    .replace(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s_-]+(\d{2,4})\b/gi,
      (match, rawMonth: string, rawYear: string) => {
        const month = monthMap[rawMonth.toLowerCase()] || ''
        const yearNumber = Number(rawYear)
        const year = rawYear.length === 4 ? yearNumber : yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber
        return month && Number.isFinite(year) ? `${year}-${month}` : match
      },
    )
    .replace(/\bjan\s*to\s*december\b/gi, 'full year')
    .replace(/\b(?:qty|quantity)\s*\((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?)\)/gi, 'Quantity')
    .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?)\b/gi, 'period')
    .replace(/\bSource:\s*[^;\n]*\.(?:xlsx|xls|csv)\b[^;\n]*/gi, '')
    .replace(/\b[^.\n;]*\.(?:xlsx|xls|csv)\b[^.\n;]*/gi, 'Operational source')
    .replace(/\b(?:Google\s+Drive|Drive)\b/gi, 'business source')
    .replace(/\bworkbooks?\b/gi, 'records')
    .replace(/\bfile-level\b/gi, 'source-level')
    .replace(/\bfiles?\b/gi, 'records')
    .replace(/\b0\s+pcs\b/gi, 'Needs qty')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.;,])/g, '$1')
    .trim()
  return cleaned || fallback
}

function publicMetricValue(value?: unknown, fallback = 'Needs entry') {
  const text = publicDataText(String(value ?? ''), fallback)
  if (!text) return fallback
  if (/^0(?:\.0+)?\s*(?:pcs|kg|ton|claims|rows|mmk)?$/i.test(text)) return fallback
  if (/^MMK\s+0$/i.test(text)) return fallback
  if (/\b0\s+pcs\b/i.test(text)) return text.replace(/\b0\s+pcs\b/gi, fallback)
  return text
}

function countBucket(record: Record<string, number> | undefined, key: string) {
  return Number(record?.[key] || 0)
}

function topBucketLabel(record?: Record<string, number>, fallback = 'mixed') {
  return topEntries(record, 1)[0]?.[0] || fallback
}

function sanitizeYtfCommsText(value?: string | null) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'admin mailbox')
    .replace(/\bSwanny\b/gi, 'Admin')
    .replace(/\bAung Thu\b/gi, 'sales role')
    .trim()
}

function compactDuration(seconds?: number | null) {
  const value = Math.max(0, Number(seconds || 0))
  if (!value) return '0m'
  if (value < 3600) return `${Math.max(1, Math.round(value / 60))}m`
  return `${Math.round(value / 3600)}h`
}

function formatMode(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Ready'
  if (normalized.includes('postgres') || normalized.includes('psycopg') || normalized.includes('database_url')) return 'Cloud history'
  if (normalized.includes('pgvector') && normalized.includes('ready')) return 'Search ready'
  return normalized.replace(/_/g, ' ')
}

function metricValue(metric: EnterpriseMetricRecord) {
  const value = String(metric.metric_value ?? '').trim()
  const unit = String(metric.unit ?? '').trim()
  return publicMetricValue([value || 'Pending', unit && unit !== 'definition' ? unit : ''].filter(Boolean).join(' '), 'Pending')
}

function metricSourceSummary(metric: EnterpriseMetricRecord) {
  const sourceRef = objectField(metric.source_ref)
  const workbook = stringField(sourceRef.workbook)
  const sheet = stringField(sourceRef.sheet_name)
  const title = stringField(sourceRef.title)
  const source = stringField(sourceRef.source)
  return publicDataText([workbook || title || source, sheet].filter(Boolean).join(' / '), metric.scope || metric.notes || 'Operational record')
}

function metricReviewLane(metric: EnterpriseMetricRecord) {
  const haystack = [metric.metric_name, metric.metric_group, metric.owner, metric.scope, metric.notes, metricSourceSummary(metric)].join(' ').toLowerCase()
  if (/(claim|defect|reject|quality|hold|capa|inspection)/.test(haystack)) return 'Quality'
  if (/(maintenance|downtime|repair|utility|spare|machine|press|breakdown)/.test(haystack)) return 'Maintenance'
  if (/(stock|inventory|sale|dealer|retailer|showroom|dispatch|delivery)/.test(haystack)) return 'Sales / Inventory'
  if (/(payment|purchase|supplier|invoice|cost|finance|junky|kiic|tt)/.test(haystack)) return 'Finance / Supplier'
  if (/(production|output|curing|mixing|building|wip|plan|shift|waste)/.test(haystack)) return 'Production'
  return 'General'
}

function workbookMetricValue(metric: WorkbookMetricValue) {
  const raw = metric.metric_value ?? metric.raw_value ?? ''
  if (raw === null || raw === undefined || raw === '') return 'Pending'
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && Math.abs(numeric) >= 1000) return numeric.toLocaleString()
  return publicMetricValue(String(raw), 'Pending')
}

function workbookMetricSource(metric: WorkbookMetricValue | WorkbookMetricCandidate) {
  const valueMetric = metric as WorkbookMetricValue
  return [valueMetric.plant, workbookMetricLane(valueMetric), valueMetric.period_label].filter(Boolean).join(' / ') || 'Operational record'
}

function numericFromUnknown(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!cleaned) return 0
  const parsed = Number(cleaned[0])
  return Number.isFinite(parsed) ? parsed : 0
}

function formatPlantMetricValue(value: number, unit = '') {
  if (!Number.isFinite(value) || value <= 0) return 'Needs entry'
  const formatted =
    Math.abs(value) >= 1000
      ? Math.round(value).toLocaleString()
      : Number.isInteger(value)
        ? value.toLocaleString()
        : value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return [formatted, unit].filter(Boolean).join(' ')
}

function sourceMapLabel(source?: Record<string, string>) {
  return compactSourceName(source?.workbook || source?.source_workbook || source?.file_name || source?.title || source?.source || '')
}

function plantScopeMatches(text: string, scope: PlantOperatingScope) {
  const inferred = inferYtfTextPlantScope(text, 'shared')
  if (scope === 'plant-a') return inferred === 'plant-a'
  if (scope === 'plant-b') return inferred === 'plant-b'
  return inferred === 'shared'
}

function filterForSelectedPlant<T>(rows: T[], scope: YtfPlantScope, textForRow: (row: T) => string): T[] {
  if (scope === 'all') return rows
  const plantScope = scope as PlantOperatingScope
  const exactRows = rows.filter((row) => plantScopeMatches(textForRow(row), plantScope))
  if (exactRows.length) return exactRows
  if (scope === 'plant-a' || scope === 'plant-b') return []
  return rows.filter((row) => plantScopeMatches(textForRow(row), 'shared'))
}

function preferExactPlantMetricRows<T extends YtfSizeMetricLike>(rows: T[], scope: YtfPlantScope, category = 'factory'): T[] {
  if (scope === 'all') return rankYtfMetricRows(rows, { category, preferredScope: 'all' })
  const exactRows = rows.filter((row) => ytfMetricMatchesExactPlantScope(row, scope))
  if (exactRows.length) return rankYtfMetricRows(exactRows, { category, preferredScope: scope })
  if (scope === 'plant-a' || scope === 'plant-b') return []
  return rankYtfMetricRows(rows.filter((row) => ytfMetricMatchesExactPlantScope(row, scope)), { category, preferredScope: scope })
}

function pendingProductionClosePlantScope(row: PendingProductionCloseRow): YtfPlantScope {
  const raw = row as PendingProductionCloseRow & { site_scope?: string; source?: Record<string, string | undefined> }
  const explicit = normalizeYtfPlantScope(raw.plant || raw.site_scope || raw.source?.plant || raw.source?.site_scope, 'all')
  if (explicit !== 'all') return explicit
  return inferYtfTextPlantScope(
    [
      raw.size,
      raw.plant,
      raw.site_scope,
      raw.updated_at,
      raw.action,
      raw.source?.date_context,
      raw.source?.period_label,
      raw.source?.source_workbook,
      raw.source?.workbook,
      raw.source?.sheet_name,
    ]
      .filter(Boolean)
      .join(' '),
    'shared',
  )
}

function filterPendingProductionCloseRows(rows: PendingProductionCloseRow[], scope: YtfPlantScope): PendingProductionCloseRow[] {
  if (scope === 'all') return rows
  return rows.filter((row) => pendingProductionClosePlantScope(row) === scope)
}

function erpFactPlantScope(fact: ErpFactLedgerRow): YtfPlantScope {
  const raw = fact as Record<string, unknown>
  const explicit = normalizeYtfPlantScope(fact.plant_scope || fact.plant_label || raw.site_scope || raw.plant, 'all')
  const text = [
    fact.metric_name,
    fact.section,
    fact.tyre_size,
    raw.product,
    raw.material,
    fact.plant_scope,
    fact.plant_label,
    raw.site_scope,
    raw.source_workbook,
    raw.source_sheet,
    raw.row_label,
    fact.period_label,
  ]
    .filter(Boolean)
    .join(' ')
  return inferYtfTextPlantScope(text, explicit === 'all' ? 'shared' : explicit)
}

function isProductionSignalText(text: string) {
  const normalized = text.toLowerCase()
  if (isProcurementOrRawMaterialMetricText(normalized)) return false
  if (/(tube order|order form|claim tyre|sales?|stock|warehouse|purchase|supplier|invoice|payment|cost|pi qty|real pi qty|raw code|aromatic oil|natural rubber)/.test(normalized)) return false
  return /(production|output|monthly|weekly|actual|wip|mixing|building|curing|compound|total wt|actual wt|produced|tyre production)/.test(normalized)
}

function productionSizeSummary(rows: ProductionBySizeRow[], scope: PlantOperatingScope): PlantMetricSignal | null {
  const scoped = rows.filter((row) =>
    plantScopeMatches(
      [
        row.size,
        row.size ? '' : row.plant,
        row.size ? '' : Object.keys(row.plants ?? {}).join(' '),
        row.periods?.join(' '),
        row.metric_names?.join(' '),
        sourceMapLabel(row.source),
      ]
        .filter(Boolean)
        .join(' '),
      scope,
    ),
  )
  if (!scoped.length) return null
  const output = scoped.reduce((sum, row) => sum + numericFromUnknown(row.output_qty), 0)
  const weight = scoped.reduce((sum, row) => sum + numericFromUnknown(row.weight_kg), 0)
  const value = output || weight || scoped.reduce((sum, row) => sum + numericFromUnknown(row.row_count), 0)
  if (!value) return null
  const scopeLabel = scope === 'plant-a' ? 'Floor A' : scope === 'plant-b' ? 'Floor B' : 'shared company'
  return {
    label: output ? 'Production output' : weight ? 'Production weight' : 'Production rows',
    value,
    unit: output ? 'pcs' : weight ? 'kg' : 'rows',
    detail: `${compactNumber(scoped.length)} tyre-size rows for ${scopeLabel}.`,
    score: 100,
  }
}

function productionMetricSignalFromOperating(metric: YtfOperatingMetricRow): PlantMetricSignal | null {
  const text = [operatingMetricHaystack(metric), operatingMetricSourceHaystack(metric)].join(' ')
  if (!isProductionSignalText(text)) return null
  const value = numericFromUnknown(metric.numeric_value ?? metric.raw_value ?? metric.value)
  if (!value) return null
  const unit = /(wt|weight|kg)/.test(text) ? 'kg' : /(percent|rate|yield|oee)/.test(text) ? '%' : 'pcs'
  return {
    label: ytfOperatingMetricTitle(metric),
    value,
    unit,
    detail: [metric.site_scope || metric.plant, metric.period_label].filter(Boolean).join(' / ') || 'Production row',
    score: Number(metric.operating_score || 0) + 40,
  }
}

function productionMetricSignalFromWorkbook(metric: WorkbookMetricValue): PlantMetricSignal | null {
  const text = [workbookMetricHaystack(metric), workbookMetricSourceHaystack(metric)].join(' ')
  if (!isProductionSignalText(text)) return null
  const value = numericFromUnknown(metric.metric_value ?? metric.raw_value)
  if (!value) return null
  const unit = /(wt|weight|kg)/.test(text) ? 'kg' : /(percent|rate|yield|oee)/.test(text) ? '%' : 'pcs'
  return {
    label: workbookMetricTitle(metric),
    value,
    unit,
    detail: [metric.plant, metric.period_label].filter(Boolean).join(' / ') || 'Production value',
    score: 30,
  }
}

function bestPlantProductionSignal(
  scope: PlantOperatingScope,
  sizeRows: ProductionBySizeRow[],
  operatingRows: YtfOperatingMetricRow[],
  workbookRows: WorkbookMetricValue[],
  options: { allowSummaryFallback?: boolean } = {},
) {
  const sizeSummary = productionSizeSummary(sizeRows, scope)
  if (sizeSummary) return sizeSummary
  if (options.allowSummaryFallback === false) return null
  const signals = [
    ...operatingRows
      .filter((row) => plantScopeMatches([operatingMetricHaystack(row), operatingMetricSourceHaystack(row)].join(' '), scope))
      .map(productionMetricSignalFromOperating),
    ...workbookRows
      .filter((row) => plantScopeMatches([workbookMetricHaystack(row), workbookMetricSourceHaystack(row)].join(' '), scope))
      .map(productionMetricSignalFromWorkbook),
  ].filter((signal): signal is PlantMetricSignal => Boolean(signal))
  return signals.sort((left, right) => right.score - left.score || Math.abs(right.value) - Math.abs(left.value))[0] ?? null
}

function cleanMetricDisplayTitle(value?: string | null) {
  return String(value || '').trim().replace(/\s*:\s*(total|qty|quantity|amount|value)\s*$/i, '')
}

function isGenericWorkbookMetricName(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  return !normalized || /^(value|qty|quantity|total|amount|date|month|year|column[_\s-]?\d+|\d+(?:\.\d+)?(?:_\d+)?)$/.test(normalized)
}

function workbookMetricTitle(metric: WorkbookMetricValue) {
  const name = String(metric.metric_name || '').trim()
  const row = String(metric.row_label || '').trim()
  if (isGenericWorkbookMetricName(name)) return cleanMetricDisplayTitle(row) || `${workbookMetricLane(metric)} value`
  return cleanMetricDisplayTitle(name)
}

function workbookMetricContext(metric: WorkbookMetricValue) {
  return [workbookMetricLane(metric), metric.plant, metric.period_label].filter(Boolean).join(' / ') || 'Extracted operating value'
}

function workbookMetricReviewLabel(metric: WorkbookMetricValue) {
  const status = String(metric.status || metric.recommendation || '').replace(/[_-]+/g, ' ').trim().toLowerCase()
  if (!status || status === 'value sample') return 'extracted'
  return status
}

function isUsefulWorkbookMetric(metric: WorkbookMetricValue) {
  const haystack = [metric.metric_name, metric.row_label, metric.workbook, metric.sheet_name, metric.metric_group].join(' ').toLowerCase()
  if (isGenericYtfMetricName(metric.metric_name) && !/(claim|defect|stock|inventory|sales?|production|output|downtime|purchase|payment)/.test(haystack)) return false
  return /(production|output|total|qty|quantity|stock|inventory|sales|sale|amount|payment|cost|claim|defect|reject|downtime|waste|weekly|monthly|curing|mixing|building|natural rubber|purchase)/.test(haystack)
}

function workbookMetricLane(metric: WorkbookMetricValue) {
  const haystack = [
    metric.metric_name,
    metric.metric_key,
    metric.row_label,
    metric.workbook,
    metric.sheet_name,
    metric.metric_group,
    metric.plant,
    metric.owner,
    metric.source,
    metric.period_label,
  ].join(' ').toLowerCase()
  if (/(claim|defect|reject|quality|abr|capa)/.test(haystack)) return 'Quality'
  if (/(payment|purchase|supplier|junky|mr\.?\s*dong|tt|invoice|amount|cost)/.test(haystack)) return 'Finance / Supplier'
  if (/(stock|inventory|sale|retailer|wholesale|cash sale|qty)/.test(haystack)) return 'Sales / Inventory'
  if (/(production|output|monthly|weekly|curing|mixing|building|waste|downtime|machine|plan)/.test(haystack)) return 'Production'
  return String(metric.metric_group || 'Workbook')
}

function agentTrustRowTitle(row: WorkbookAgentTrustRow) {
  return compactSourceName(row.workbook || row.title || 'Workbook table')
}

function agentTrustRowMeta(row: WorkbookAgentTrustRow) {
  return [row.sheet_name, row.table_id, row.date_confidence ? `date ${row.date_confidence}` : '', row.confidence_score ? `${row.confidence_score}%` : '']
    .filter(Boolean)
    .join(' / ')
}

function operatingMetricHaystack(metric: YtfOperatingMetricRow) {
  return [
    metric.metric_name,
    metric.metric_group,
    metric.metric_family,
    metric.tyre_size,
    metric.row_label,
    metric.lane,
    metric.operating_lane,
    metric.plant,
    metric.site_scope,
    metric.workbook,
    metric.sheet_name,
    metric.source_workbook,
    metric.source_sheet,
    metric.source,
    metric.source_record_id,
  ]
    .join(' ')
    .toLowerCase()
}

function operatingMetricSourceHaystack(metric: YtfOperatingMetricRow) {
  return [
    metric.metric_name,
    metric.metric_family,
    metric.tyre_size,
    metric.row_label,
    metric.workbook,
    metric.sheet_name,
    metric.source_workbook,
    metric.source_sheet,
    metric.source,
    metric.period_label,
  ]
    .join(' ')
    .toLowerCase()
}

function workbookMetricHaystack(metric: WorkbookMetricValue) {
  return [
    metric.metric_name,
    metric.metric_key,
    metric.row_label,
    metric.workbook,
    metric.sheet_name,
    metric.metric_group,
    metric.plant,
    metric.owner,
    metric.source,
    metric.period_label,
  ]
    .join(' ')
    .toLowerCase()
}

function workbookMetricSourceHaystack(metric: WorkbookMetricValue) {
  return [
    metric.metric_name,
    metric.row_label,
    metric.workbook,
    metric.sheet_name,
    metric.source,
    metric.period_label,
  ]
    .join(' ')
    .toLowerCase()
}

function isProcurementOrRawMaterialMetricText(text: string) {
  return /(purchase|supplier|invoice|raw code|raw material|aromatic oil|natural rubber purchase order|shipper|consignee|pi n[0o]|bush|spare|payment|cost)/.test(text)
}

function laneRowAsOperatingMetric(row: OperatingLaneRow, lane: OperatingLane): YtfOperatingMetricRow {
  return {
    ...row,
    lane: row.operating_lane || lane.label || lane.id,
    route: lane.route || '/app/live-data?view=kpi',
  }
}

function dedupeOperatingRows(rows: YtfOperatingMetricRow[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = [
      row.metric_key,
      row.metric_name,
      row.value,
      row.raw_value,
      row.source_record_id,
      row.source_item_id,
      row.workbook || row.source_workbook,
      row.sheet_name || row.source_sheet,
      row.row_label,
    ]
      .filter(Boolean)
      .join('|')
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const FACTORY_LEDGER_LANE_DEFS: Array<Omit<FactoryLedgerLaneCard, 'count' | 'rows'>> = [
  {
    id: 'production',
    label: 'Production output',
    hint: 'Tyre output, WIP, actual weight, mixing, building, and curing board numbers.',
    entryMode: 'daily_routine',
  },
  {
    id: 'quality',
    label: 'Quality / claims',
    hint: 'Claims, rejects, defects, holds, and QC checks.',
    entryMode: 'normal_abnormal',
  },
  {
    id: 'stock',
    label: 'Stock movement',
    hint: 'Showroom balance, warehouse, sales, dispatch, and inventory rows.',
    entryMode: 'whiteboard_snapshot',
  },
  {
    id: 'supplier',
    label: 'Supplier / PO',
    hint: 'Purchase, PI, invoice, raw material, cost, and supplier evidence.',
    entryMode: 'normal_abnormal',
  },
]

function factoryLedgerLaneFromText(text: string): FactoryLedgerLaneId | null {
  const normalized = text.toLowerCase()
  if (
    /\b(spec|specification|design|drawing|autocad|dwg|layout|mold|mould|building spec)\b/.test(normalized) &&
    !/(actual production|production qty|daily output|monthly tyre production|output|produced|claim|defect|reject|stock|issued|received|closing|purchase|invoice|order)/.test(
      normalized,
    )
  ) {
    return null
  }
  if (/(claim|claim tyre|defect|reject|quality|qc|inspection|hold|capa|abrasion)/.test(normalized)) return 'quality'
  if (/(stock|inventory|warehouse|showroom|balance|dealer|retailer|wholesale|dispatch|sales?\b|cash sale)/.test(normalized)) return 'stock'
  if (/(supplier|purchase|invoice|payment|cost|junky|mr\.?\s*dong|kiic|pi\s*(?:no|qty)?|po\b|raw material|natural rubber|aromatic oil)/.test(normalized)) return 'supplier'
  if (/(production|output|actual|wip|mixing|building|curing|compound|total wt|actual wt|produced|downtime|machine|shift|plan)/.test(normalized)) return 'production'
  return null
}

function factoryLedgerLaneForWorkbook(metric: WorkbookMetricValue): FactoryLedgerLaneId | null {
  const lane = workbookMetricLane(metric)
  const text = [lane, workbookMetricHaystack(metric), workbookMetricSourceHaystack(metric)].join(' ')
  return factoryLedgerLaneFromText(text)
}

function factoryLedgerLaneForOperating(metric: YtfOperatingMetricRow): FactoryLedgerLaneId | null {
  return factoryLedgerLaneFromText([operatingMetricHaystack(metric), operatingMetricSourceHaystack(metric)].join(' '))
}

function factoryLedgerScore(text: string, value: string, source: 'operating' | 'workbook') {
  const normalized = text.toLowerCase()
  let score = source === 'operating' ? 50 : 30
  if (value && value !== 'Pending') score += 20
  if (/(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|shift|weekly|monthly|today)/.test(normalized)) score += 18
  if (/(tyre|tube|flap|\b\d{3}\/\d{2}\s*r\s*\d{2,3}\b|\b\d{1,2}(?:\.\d{2})?-\d{2,3}\b)/.test(normalized)) score += 16
  if (/(agent|cron|postgres|pgvector|oauth|connector|vercel|setup|api|database readiness)/.test(normalized)) score -= 80
  if (/(2022 to 2024|h1 2024 financial|sofp|schdule|building spec|design|drawing|autocad|dwg)/.test(normalized)) score -= 80
  return score
}

function factoryLedgerItemFromWorkbook(metric: WorkbookMetricValue): FactoryLedgerItem | null {
  const laneId = factoryLedgerLaneForWorkbook(metric)
  if (!laneId) return null
  const value = workbookMetricValue(metric)
  const text = [workbookMetricHaystack(metric), workbookMetricSourceHaystack(metric), workbookMetricContext(metric)].join(' ')
  return {
    laneId,
    title: workbookMetricTitle(metric),
    value,
    context: workbookMetricContext(metric),
    source: workbookMetricSource(metric),
    status: workbookMetricReviewLabel(metric),
    route: '/app/live-data?view=kpi&focus=workbook_values',
    score: factoryLedgerScore(text, value, 'workbook'),
  }
}

function factoryLedgerItemFromOperating(metric: YtfOperatingMetricRow): FactoryLedgerItem | null {
  const laneId = factoryLedgerLaneForOperating(metric)
  if (!laneId) return null
  const value = ytfOperatingMetricValue(metric)
  const text = [operatingMetricHaystack(metric), operatingMetricSourceHaystack(metric), ytfOperatingMetricContext(metric)].join(' ')
  return {
    laneId,
    title: ytfOperatingMetricTitle(metric),
    value,
    context: ytfOperatingMetricContext(metric),
    source: ytfOperatingMetricSource(metric),
    status: ytfOperatingMetricStatus(metric),
    route: metric.route || '/app/live-data?view=kpi',
    score: factoryLedgerScore(text, value, 'operating'),
  }
}

function factoryLedgerItemFromErpFact(fact: ErpFactLedgerRow): FactoryLedgerItem | null {
  const lane = String(fact.lane || '').toLowerCase()
  const laneId: FactoryLedgerLaneId | null =
    lane === 'production'
      ? 'production'
      : lane === 'quality'
        ? 'quality'
        : lane === 'sales_inventory'
          ? 'stock'
          : lane === 'finance_procurement'
            ? 'supplier'
            : null
  if (!laneId) return null
  const metric = String(fact.metric_name || fact.section || 'Plant value').trim()
  const size = String(fact.tyre_size || '').trim()
  const value = [fact.value, fact.unit].filter(Boolean).join(' ').trim() || 'Ready'
  const source = [fact.plant_label, fact.period_label].filter(Boolean).join(' / ') || 'Operational record'
  const context = [fact.section, size, fact.period_label].filter(Boolean).join(' / ') || String(fact.plant_label || 'Factory Client')
  return {
    laneId,
    title: size ? `${metric} - ${size}` : metric,
    value,
    context,
    source,
    status: String(fact.plant_label || fact.source_status || 'extracted'),
    route: fact.data_route || '/app/live-data?view=kpi',
    score: 140 + Number(fact.numeric_value || 0) / 100000,
  }
}

function buildFactoryLedgerLanes(operatingRows: YtfOperatingMetricRow[], workbookRows: WorkbookMetricValue[], erpFacts: ErpFactLedgerRow[] = []): FactoryLedgerLaneCard[] {
  const dedupe = new Set<string>()
  const items = [
    ...erpFacts.map(factoryLedgerItemFromErpFact),
    ...operatingRows.map(factoryLedgerItemFromOperating),
    ...workbookRows.map(factoryLedgerItemFromWorkbook),
  ]
    .filter((item): item is FactoryLedgerItem => Boolean(item))
    .filter((item) => item.score > 0)
    .filter((item) => {
      const key = [item.laneId, item.title, item.value, item.source].join('|').toLowerCase()
      if (dedupe.has(key)) return false
      dedupe.add(key)
      return true
    })
    .sort((left, right) => right.score - left.score)

  return FACTORY_LEDGER_LANE_DEFS.map((definition) => {
    const rows = items.filter((item) => item.laneId === definition.id)
    return {
      ...definition,
      count: rows.length,
      rows: rows.slice(0, 3),
    }
  })
}

function topEntries(record?: Record<string, number>, limit = 8) {
  return Object.entries(record ?? {})
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .slice(0, limit)
}

function isLiveDataView(value: string | null): value is LiveDataView {
  return LIVE_DATA_VIEWS.some((view) => view.id === value)
}

function storyCardView(value?: string | null, fallback: LiveDataView = 'kpi'): LiveDataView {
  const normalized = value ?? null
  return isLiveDataView(normalized) ? normalized : fallback
}

function normalizeStoryCardLabel(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return 'Factory'
  if (/^production signal$/i.test(raw)) return 'Production'
  if (/^quality signal$/i.test(raw)) return 'Quality'
  if (/^stock signal$/i.test(raw)) return 'Stock'
  if (/^supplier signal$/i.test(raw)) return 'Supplier'
  const cleaned = raw.replace(/\bsignal\b/gi, '').replace(/\s{2,}/g, ' ').trim()
  return cleaned || 'Factory'
}

function sourceTitle(event: SourceChangeEvent) {
  const raw = publicDataText(event.title || event.summary || event.domain, 'Factory update')
  if (/open director|open plant|convert the signal|needs review|review structured source record|governance update/i.test(raw)) {
    const record = String(event.path || event.organized_path || event.source_item_id || '').split('/').filter(Boolean).pop()
    const domain = event.department || event.domain || 'Factory'
    return record ? `${domain}: ${publicDataText(record, 'updated record')}` : `${domain} update`
  }
  return raw
}

function sourceMeta(event: SourceChangeEvent) {
  return [event.change_type, event.department || event.domain, event.plant].filter(Boolean).join(' / ') || 'Data update'
}

function actionGroupForEvent(event: SourceChangeEvent): ActionGroupId {
  const text = [
    sourceTitle(event),
    sourceMeta(event),
    event.summary,
    event.owner_hint,
    event.change_type,
    event.department,
    event.domain,
    event.plant,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/(missing|unknown|owner pending|needs|evidence|source|proof|unassigned)/.test(text)) return 'needs_source'
  if (/(kpi|metric|workbook|number|production|output|reject|defect|quality|stock|sales|inventory|finance|payment|cost|purchase)/.test(text)) return 'kpi_review'
  if (/(maintenance|downtime|repair|utility|spare|machine|press|breakdown|engineering)/.test(text)) return 'maintenance'
  if (/(archive|info|reference|manual|policy|sop|literature|unchanged)/.test(text)) return 'archive'
  return 'do_now'
}

function actionGroupLabel(group: ActionGroupId) {
  if (group === 'needs_source') return 'Needs context'
  if (group === 'kpi_review') return 'Number review'
  if (group === 'maintenance') return 'Maintenance'
  if (group === 'archive') return 'Archive'
  return 'Do now'
}

function actionNextStepForEvent(event: SourceChangeEvent) {
  const group = actionGroupForEvent(event)
  if (group === 'needs_source') return 'Pick the team and add one daily note if this affects today.'
  if (group === 'kpi_review') return 'Check Floor And date before using this number on the dashboard.'
  if (group === 'maintenance') return 'Route to maintenance with machine, downtime, and daily notes.'
  if (group === 'archive') return 'Keep as context unless a real work task needs it.'
  return 'Open, decide owner, then send to Work Board or close.'
}

function getMetricRows(payload: Awaited<ReturnType<typeof getMetricRecords>> | null) {
  return ((payload?.enterprise?.rows ?? payload?.rows ?? []) as EnterpriseMetricRecord[]).filter((row) => row.metric_name)
}

function sourceRecordLabel(record: YtfSourceRecord) {
  return publicDataText(record.title || record.path?.split('/').filter(Boolean).pop() || record.organized_path, 'Source record')
}

function sourceRecordMeta(record: YtfSourceRecord) {
  return [record.domain, record.plant, record.department, record.owner_hint].filter(Boolean).join(' / ') || 'Unassigned record'
}

function stringField(value: unknown) {
  return String(value ?? '').trim()
}

function formatChatFactValue(fact: YtfChatFact) {
  const value = stringField(fact.value)
  const unit = stringField(fact.unit)
  return [value, unit].filter(Boolean).join(' ') || 'reported'
}

function formatChatFact(fact: YtfChatFact) {
  const label = stringField(fact.label) || stringField(fact.metric).replace(/_/g, ' ') || 'Chat fact'
  const qualifiers = [stringField(fact.size), stringField(fact.equipment)].filter(Boolean)
  return `${label}: ${formatChatFactValue(fact)}${qualifiers.length ? ` (${qualifiers.join(' / ')})` : ''}`
}

function stringListField(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => stringField(item)).filter(Boolean)
}

function objectField(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function sourceRecordFileAgent(record: YtfSourceRecord): YtfFileAgentRow | null {
  const classification = record.classification ?? {}
  const extractor = classification.extractor_agent
  if (!extractor || typeof extractor !== 'object' || Array.isArray(extractor)) return null
  const contract = extractor as Record<string, unknown>
  const fileAgentId = stringField(contract.file_agent_id)
  const profileId = stringField(contract.profile_id)
  if (!fileAgentId && !profileId) return null
  return {
    file_agent_id: fileAgentId,
    profile_id: profileId,
    agent_name: stringField(contract.name),
    dataset_type: stringField(contract.dataset_type),
    automation_mode: stringField(contract.automation_mode),
    granularity: stringField(contract.granularity),
    priority: stringField(contract.priority),
    owner: stringField(contract.owner) || record.owner_hint,
    plant_scope: stringField(contract.plant_scope) || record.plant,
    source_record_id: record.source_record_id,
    source_item_id: record.source_item_id,
    title: record.title,
    path: record.path,
    modified_time: record.modified_time,
    file_kind: record.file_kind,
    domain: record.domain,
    department: record.department,
    metric_targets: stringListField(contract.metric_targets),
    outputs: stringListField(contract.outputs),
    instructions: stringListField(contract.instructions),
    refresh_trigger: stringField(contract.refresh_trigger),
    safety_policy: stringField(contract.safety_policy),
    web_view_link: record.web_view_link,
  }
}

function safeSourceStatus(value?: string | null) {
  return String(value || 'mapped').replace(/_/g, ' ')
}

function roleCanSeeRawComms(session: WorkspaceSessionPayload['session'] | null | undefined) {
  const role = String(session?.role || '').trim().toLowerCase()
  if (RAW_COMMS_ROLE_NAMES.has(role)) return true
  return RAW_COMMS_CAPABILITIES.some((capability) => sessionHasCapability(session, capability))
}

function roleCanBrowseSourceRecords(session: WorkspaceSessionPayload['session'] | null | undefined) {
  const role = String(session?.role || '').trim().toLowerCase()
  if (ADMIN_ROLE_NAMES.has(role)) return true
  return RAW_SOURCE_CAPABILITIES.some((capability) => sessionHasCapability(session, capability))
}

function roleCanReadAdminRuntime(session: WorkspaceSessionPayload['session'] | null | undefined) {
  const role = String(session?.role || '').trim().toLowerCase()
  if (ADMIN_ROLE_NAMES.has(role)) return true
  return ADMIN_RUNTIME_CAPABILITIES.some((capability) => sessionHasCapability(session, capability))
}

function safeYtfMetricRoute(route?: string) {
  const value = String(route || '').trim()
  if (!value) return '/app/action-board'
  if (value === '/app/data-fabric' || value === '/app/connectors') return '/app/live-data?view=data'
  if (value === '/app/actions') return '/app/action-board'
  return value
}

function defaultPlantScopeForSession(session?: WorkspaceSessionPayload['session'] | null): YtfPlantScope {
  const roleText = String(session?.role || '').trim().toLowerCase()
  if (/admin|ceo|director|owner/.test(roleText)) return 'all'
  const text = [
    session?.username,
    session?.workspace_id,
    session?.workspace_slug,
    session?.workspace_name,
    session?.role,
    session?.display_name,
  ]
    .join(' ')
    .toLowerCase()
  if (/\bplant[-_\s]?b\b|bilin|mon state|radial|motorcycle|manager-b|plant-manager-b/.test(text)) return 'plant-b'
  if (/\bplant[-_\s]?a\b|shwe|pyi|yangon|bias|nylon|agri|manager-a|plant-manager-a/.test(text)) return 'plant-a'
  if (/admin|ceo|director|owner/.test(text)) return 'all'
  return 'plant-a'
}

export function YtfLiveDataPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialView = searchParams.get('view')
  const initialSafeView: LiveDataView = isLiveDataView(initialView) ? initialView : 'kpi'
  const [activeView, setActiveView] = useState<LiveDataView>(initialSafeView)
  const [dashboard, setDashboard] = useState<YtfDashboardSummaryResult | null>(null)
  const [sessionPayload, setSessionPayload] = useState<WorkspaceSessionPayload | null>(null)
  const currentSession = sessionPayload?.session ?? null
  const requestedPlantScope = searchParams.get('plant')
  const selectedPlantScope: YtfPlantScope = requestedPlantScope
    ? normalizeYtfPlantScope(requestedPlantScope, defaultPlantScopeForSession(currentSession))
    : defaultPlantScopeForSession(currentSession)
  const selectedLaneFilter = normalizeLiveDataLaneFilter(searchParams.get('lane'))
  const selectedSizeToken = normalizeYtfSizeToken(searchParams.get('size'))
  const selectedSizeRaw = String(searchParams.get('size') || '').trim()
  const selectedPlantLabel = ytfMetricPlantScopeText(selectedPlantScope)
  const [pipeline, setPipeline] = useState<YtfPipelineStatsResult | null>(null)
  const [knowledge, setKnowledge] = useState<YtfKnowledgeStatusResult | null>(null)
  const [gmail, setGmail] = useState<YtfGmailStatusResult | null>(null)
  const [bots, setBots] = useState<YtfBotPipelineResult | null>(null)
  const [cloudComms, setCloudComms] = useState<YtfCloudCommsRuntimeResult | null>(null)
  const [communications, setCommunications] = useState<YtfCommunicationsLatestResult | null>(null)
  const [fullRefresh, setFullRefresh] = useState<YtfFullRefreshLatestResult | null>(null)
  const [dataManagerRun, setDataManagerRun] = useState<YtfDataManagerRunResult | null>(null)
  const [sourceRecordResult, setSourceRecordResult] = useState<YtfSourceRecordsResult | null>(null)
  const [sourceBehaviorMap, setSourceBehaviorMap] = useState<YtfSourceBehaviorMapResult | null>(null)
  const [sourceChangeResult, setSourceChangeResult] = useState<YtfSourceChangesResult | null>(null)
  const [fileAgents, setFileAgents] = useState<YtfFileAgentsStatusResult | null>(null)
  const [fileAgentRuns, setFileAgentRuns] = useState<YtfFileAgentRunsResult | null>(null)
  const [workbookExtraction, setWorkbookExtraction] = useState<YtfWorkbookExtractionResult | null>(null)
  const [companyBrainGraph, setCompanyBrainGraph] = useState<YtfCompanyBrainGraphResult | null>(null)
  const [operatingMetrics, setOperatingMetrics] = useState<YtfOperatingMetricsResult | null>(null)
  const [latestMetrics, setLatestMetrics] = useState<EnterpriseMetricRecord[]>([])
  const [candidateMetrics, setCandidateMetrics] = useState<EnterpriseMetricRecord[]>([])
  const [officialKpis, setOfficialKpis] = useState<EnterpriseMetricRecord[]>([])
  const [sourceSearch, setSourceSearch] = useState('')
  const [sourceDomain, setSourceDomain] = useState('')
  const [sourcePlant, setSourcePlant] = useState('')
  const [sourceLoading, setSourceLoading] = useState(false)
  const [manualSourceId, setManualSourceId] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualText, setManualText] = useState('')
  const [manualSender, setManualSender] = useState('')
  const [manualEvidence, setManualEvidence] = useState('')
  const [manualStatus, setManualStatus] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [gmailSyncing, setGmailSyncing] = useState(false)
  const [gmailSyncMessage, setGmailSyncMessage] = useState('')
  const [refreshRunning, setRefreshRunning] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [fileAgentRunning, setFileAgentRunning] = useState(false)
  const [fileAgentMessage, setFileAgentMessage] = useState('')
  const [metricReviewingId, setMetricReviewingId] = useState('')
  const [metricReviewMessage, setMetricReviewMessage] = useState('')
  const [productionConfirmingKey, setProductionConfirmingKey] = useState('')
  const [productionConfirmMessage, setProductionConfirmMessage] = useState('')
  const [liveDataLoading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const fastOperatingMetrics = getYtfOperatingMetrics({ compact: true })
          .then((result) => {
            if (!cancelled) {
              setOperatingMetrics(result)
              setLoading(false)
            }
            return result
          })
          .catch(() => null)
        const [summary, initialOperatingMetrics, initialCompanyBrain] = await Promise.all([
          getYtfDashboardSummary({ compact: true }).catch(() => null),
          fastOperatingMetrics,
          getYtfCompanyBrainGraph().catch(() => null),
        ])
        if (!cancelled) {
          if (summary) {
            setDashboard(summary)
            if (summary.pipeline_stats) setPipeline(summary.pipeline_stats)
            if (summary.knowledge_status) setKnowledge(summary.knowledge_status)
            if (summary.latest_metrics) setLatestMetrics(getMetricRows(summary.latest_metrics).slice(0, 12))
            if (summary.kpi_definitions?.rows) setOfficialKpis(summary.kpi_definitions.rows.slice(0, 12))
          }
          if (initialOperatingMetrics) setOperatingMetrics(initialOperatingMetrics)
          if (initialCompanyBrain) setCompanyBrainGraph(initialCompanyBrain)
          if (summary || initialOperatingMetrics) setLoading(false)
        }
        const nextSession = await getWorkspaceSession().catch(() => null)
        if (!cancelled) setSessionPayload(nextSession)
        const canReadRuntime = roleCanReadAdminRuntime(nextSession?.session)
        const canReadRawComms = roleCanSeeRawComms(nextSession?.session)
        const canReadSourceTools = roleCanBrowseSourceRecords(nextSession?.session)
        const [
          nextPipeline,
          nextKnowledge,
          nextGmail,
          nextBots,
          nextMetrics,
          nextCandidateMetrics,
          nextKpis,
          nextSourceRecords,
          nextSourceBehaviorMap,
          nextSourceChanges,
          nextFileAgents,
          nextFileAgentRuns,
          nextFullRefresh,
          nextDataManagerRun,
          nextWorkbookExtraction,
          nextOperatingMetrics,
          nextCompanyBrain,
          nextCommunications,
        ] = await Promise.all([
          summary?.pipeline_stats ? Promise.resolve(summary.pipeline_stats) : getYtfPipelineStats().catch(() => null),
          summary?.knowledge_status ? Promise.resolve(summary.knowledge_status) : getYtfKnowledgeStatus().catch(() => null),
          canReadRawComms ? getYtfGmailStatus().catch(() => summary?.gmail_status ?? null) : Promise.resolve(null),
          canReadRawComms
            ? summary?.bot_pipeline
              ? Promise.resolve(summary.bot_pipeline)
              : getYtfBotPipeline().catch(() => null)
            : Promise.resolve(null),
          canReadRuntime
            ? summary?.latest_metrics
              ? Promise.resolve(summary.latest_metrics)
              : getMetricRecords({ status: 'reported', limit: 12 }).catch(() => null)
            : Promise.resolve(summary?.latest_metrics ?? null),
          canReadRuntime ? getMetricRecords({ status: 'candidate', limit: 12 }).catch(() => null) : Promise.resolve(null),
          canReadRuntime
            ? summary?.kpi_definitions
              ? Promise.resolve(summary.kpi_definitions)
              : getYtfKpiDefinitionsLatest().catch(() => null)
            : Promise.resolve(summary?.kpi_definitions ?? null),
          canReadSourceTools ? getYtfSourceRecords({ limit: 60 }).catch(() => null) : Promise.resolve(null),
          canReadSourceTools ? getYtfSourceBehaviorMap().catch(() => null) : Promise.resolve(null),
          canReadSourceTools ? getYtfSourceChanges({ limit: 18 }).catch(() => null) : Promise.resolve(null),
          canReadSourceTools ? getYtfFileAgentsStatus({ limit: 80 }).catch(() => null) : Promise.resolve(null),
          canReadSourceTools ? getYtfFileAgentRunsLatest().catch(() => null) : Promise.resolve(null),
          canReadRuntime ? getYtfFullRefreshLatest().catch(() => null) : Promise.resolve(null),
          canReadRuntime ? getLatestYtfDataManagerRun().catch(() => null) : Promise.resolve(null),
          getYtfWorkbookExtractionLatest().catch(() => null),
          getYtfOperatingMetrics().catch(() => null),
          getYtfCompanyBrainGraph().catch(() => null),
          canReadRawComms ? getYtfCommunicationsLatest({ durable: true }).catch(() => null) : Promise.resolve(null),
        ])
        if (cancelled) return
        setDashboard(summary)
        setPipeline(nextPipeline)
        setKnowledge(nextKnowledge)
        setGmail(canReadRawComms ? nextGmail : null)
        setBots(canReadRawComms ? nextBots : null)
        setFullRefresh(nextFullRefresh)
        setDataManagerRun(nextDataManagerRun)
        if (nextWorkbookExtraction) setWorkbookExtraction(nextWorkbookExtraction)
        if (nextOperatingMetrics) setOperatingMetrics(nextOperatingMetrics)
        if (nextCompanyBrain) setCompanyBrainGraph(nextCompanyBrain)
        setCommunications(canReadRawComms ? nextCommunications : null)
        setSourceRecordResult(nextSourceRecords)
        setSourceBehaviorMap(nextSourceBehaviorMap)
        setSourceChangeResult(nextSourceChanges)
        setFileAgents(nextFileAgents)
        setFileAgentRuns(nextFileAgentRuns)
        setLatestMetrics(getMetricRows(nextMetrics).slice(0, 12))
        setCandidateMetrics(getMetricRows(nextCandidateMetrics).slice(0, 12))
        setOfficialKpis((nextKpis?.rows ?? []).slice(0, 12))
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'Live data could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const requestedView = searchParams.get('view')
    const safeView: LiveDataView = isLiveDataView(requestedView) ? requestedView : 'kpi'
    if (safeView !== activeView) setActiveView(safeView)
  }, [activeView, searchParams])

  useEffect(() => {
    let cancelled = false
    async function loadAdminCommunicationState() {
      const nextSession = await getWorkspaceSession().catch(() => null)
      if (cancelled) return
      if (nextSession) setSessionPayload(nextSession)
      if (!roleCanSeeRawComms(nextSession?.session)) return

      const [nextGmail, nextBots, nextCommunications, nextCloudComms] = await Promise.all([
        getYtfGmailStatus().catch(() => null),
        getYtfBotPipeline().catch(() => null),
        getYtfCommunicationsLatest({ durable: true }).catch(() => null),
        getYtfCloudCommsRuntime().catch(() => null),
      ])
      if (cancelled) return
      if (nextGmail) setGmail(nextGmail)
      if (nextBots) setBots(nextBots)
      if (nextCommunications) setCommunications(nextCommunications)
      if (nextCloudComms) setCloudComms(nextCloudComms)
    }

    const timers = [0, 1500].map((delay) => globalThis.setTimeout(() => void loadAdminCommunicationState(), delay))
    return () => {
      cancelled = true
      timers.forEach((timer) => globalThis.clearTimeout(timer))
    }
  }, [activeView])

  const communicationSources = useMemo(() => {
    const rows = [...(communications?.plan?.sources ?? []), ...(gmail?.sources ?? []), ...(bots?.sources ?? [])]
    const seen = new Set<string>()
    return rows.filter((source) => {
      const sourceId = String(source.source_id || '').trim()
      if (!sourceId || seen.has(sourceId)) return false
      seen.add(sourceId)
      return true
    })
  }, [bots?.sources, communications?.plan?.sources, gmail?.sources])

  useEffect(() => {
    if (!manualSourceId && communicationSources[0]?.source_id) {
      setManualSourceId(communicationSources[0].source_id)
    }
  }, [communicationSources, manualSourceId])

  async function refreshSourceRecords() {
    setSourceLoading(true)
    try {
      const [nextRecords, nextChanges, nextFileAgents, nextFileAgentRuns] = await Promise.all([
        getYtfSourceRecords({ domain: sourceDomain, plant: sourcePlant, limit: 80 }).catch(() => null),
        getYtfSourceChanges({ domain: sourceDomain, plant: sourcePlant, limit: 24 }).catch(() => null),
        getYtfFileAgentsStatus({ limit: 80 }).catch(() => null),
        getYtfFileAgentRunsLatest().catch(() => null),
      ])
      setSourceRecordResult(nextRecords)
      setSourceChangeResult(nextChanges)
      setFileAgents(nextFileAgents)
      setFileAgentRuns(nextFileAgentRuns)
      getYtfSourceBehaviorMap().then(setSourceBehaviorMap).catch(() => undefined)
    } finally {
      setSourceLoading(false)
    }
  }

  async function runFullRefreshNow() {
    if (refreshRunning) return
    setRefreshRunning(true)
    setRefreshMessage('')
    try {
      const canReadRawComms = roleCanSeeRawComms(sessionPayload?.session)
      const canReadRuntime = roleCanReadAdminRuntime(sessionPayload?.session)
      const canReadSourceTools = roleCanBrowseSourceRecords(sessionPayload?.session)
      const result = await runYtfFullRefresh()
      setRefreshMessage(result.next_step || result.status || 'Refresh completed.')
      const [
        nextSummary,
        nextPipeline,
        nextKnowledge,
        nextGmail,
        nextBots,
        nextFullRefresh,
        nextDataManager,
        nextRecords,
        nextSourceBehaviorMap,
        nextChanges,
        nextFileAgents,
        nextFileAgentRuns,
        nextCandidateMetrics,
        nextWorkbookExtraction,
        nextOperatingMetrics,
        nextCompanyBrain,
        nextCommunications,
      ] = await Promise.all([
        getYtfDashboardSummary({ compact: true }).catch(() => null),
        getYtfPipelineStats().catch(() => null),
        getYtfKnowledgeStatus().catch(() => null),
        canReadRawComms ? getYtfGmailStatus().catch(() => null) : Promise.resolve(null),
        canReadRawComms ? getYtfBotPipeline().catch(() => null) : Promise.resolve(null),
        canReadRuntime ? getYtfFullRefreshLatest().catch(() => null) : Promise.resolve(null),
        canReadRuntime ? getLatestYtfDataManagerRun().catch(() => null) : Promise.resolve(null),
        canReadSourceTools ? getYtfSourceRecords({ limit: 60 }).catch(() => null) : Promise.resolve(null),
        canReadSourceTools ? getYtfSourceBehaviorMap().catch(() => null) : Promise.resolve(null),
        canReadSourceTools ? getYtfSourceChanges({ limit: 18 }).catch(() => null) : Promise.resolve(null),
        canReadSourceTools ? getYtfFileAgentsStatus({ limit: 80 }).catch(() => null) : Promise.resolve(null),
        canReadSourceTools ? getYtfFileAgentRunsLatest().catch(() => null) : Promise.resolve(null),
        canReadRuntime ? getMetricRecords({ status: 'candidate', limit: 12 }).catch(() => null) : Promise.resolve(null),
        canReadRuntime ? getYtfWorkbookExtractionLatest().catch(() => null) : Promise.resolve(null),
        getYtfOperatingMetrics({ refresh: true }).catch(() => null),
        getYtfCompanyBrainGraph().catch(() => null),
        canReadRawComms ? getYtfCommunicationsLatest({ durable: true }).catch(() => null) : Promise.resolve(null),
      ])
      if (nextSummary) setDashboard(nextSummary)
      if (nextSummary?.latest_metrics) setLatestMetrics(getMetricRows(nextSummary.latest_metrics).slice(0, 12))
      if (nextSummary?.kpi_definitions?.rows) setOfficialKpis(nextSummary.kpi_definitions.rows.slice(0, 12))
      if (nextPipeline) setPipeline(nextPipeline)
      if (nextKnowledge) setKnowledge(nextKnowledge)
      if (canReadRawComms && nextGmail) setGmail(nextGmail)
      if (canReadRawComms && nextBots) setBots(nextBots)
      if (nextFullRefresh) setFullRefresh(nextFullRefresh)
      if (nextDataManager) setDataManagerRun(nextDataManager)
      if (nextRecords) setSourceRecordResult(nextRecords)
      if (nextSourceBehaviorMap) setSourceBehaviorMap(nextSourceBehaviorMap)
      if (nextChanges) setSourceChangeResult(nextChanges)
      if (nextFileAgents) setFileAgents(nextFileAgents)
      if (nextFileAgentRuns) setFileAgentRuns(nextFileAgentRuns)
      if (nextCandidateMetrics) setCandidateMetrics(getMetricRows(nextCandidateMetrics).slice(0, 12))
      if (nextWorkbookExtraction) setWorkbookExtraction(nextWorkbookExtraction)
      if (nextOperatingMetrics) setOperatingMetrics(nextOperatingMetrics)
      if (nextCompanyBrain) setCompanyBrainGraph(nextCompanyBrain)
      if (canReadRawComms && nextCommunications) setCommunications(nextCommunications)
    } catch (nextError) {
      setRefreshMessage(nextError instanceof Error ? nextError.message : 'Refresh could not run.')
    } finally {
      setRefreshRunning(false)
    }
  }

  async function runFileAgentsNow() {
    if (fileAgentRunning) return
    setFileAgentRunning(true)
    setFileAgentMessage('')
    try {
      const result = await runYtfFileAgents({ limit: 4, priority: 'high' })
      setFileAgentRuns(result)
      setFileAgentMessage(
        `${compactNumber(result.processed_count)} source checks processed; ${compactNumber(result.queued_count)} queued or already tracked.`,
      )
      const [nextAgents, nextRuns, nextCandidateMetrics, nextPipeline, nextChanges] = await Promise.all([
        getYtfFileAgentsStatus({ limit: 80 }).catch(() => null),
        getYtfFileAgentRunsLatest().catch(() => null),
        getMetricRecords({ status: 'candidate', limit: 12 }).catch(() => null),
        getYtfPipelineStats().catch(() => null),
        getYtfSourceChanges({ limit: 18 }).catch(() => null),
      ])
      if (nextAgents) setFileAgents(nextAgents)
      if (nextRuns) setFileAgentRuns(nextRuns)
      if (nextCandidateMetrics) setCandidateMetrics(getMetricRows(nextCandidateMetrics).slice(0, 12))
      if (nextPipeline) setPipeline(nextPipeline)
      if (nextChanges) setSourceChangeResult(nextChanges)
      getYtfOperatingMetrics({ refresh: true })
        .then((result) => setOperatingMetrics(result))
        .catch(() => undefined)
    } catch (nextError) {
      setFileAgentMessage(nextError instanceof Error ? nextError.message : 'Source update could not complete.')
    } finally {
      setFileAgentRunning(false)
    }
  }

  async function reviewCandidateMetric(metric: EnterpriseMetricRecord, status: 'official' | 'rejected') {
    const metricId = String(metric.metric_id || '').trim()
    if (!metricId || metricReviewingId) return
    setMetricReviewingId(metricId)
    setMetricReviewMessage('')
    try {
      const result = await updateMetricRecordStatus(metricId, {
        status,
        owner: metric.owner || 'Plant Manager',
        note:
          status === 'official'
            ? 'Shown on YTF numbers.'
            : 'Ignored from YTF numbers.',
      })
      setMetricReviewMessage(result.message || `Metric marked ${status}.`)
      const [nextCandidateMetrics, nextLatestMetrics, nextKpis] = await Promise.all([
        getMetricRecords({ status: 'candidate', limit: 12 }).catch(() => null),
        getMetricRecords({ status: 'reported', limit: 12 }).catch(() => null),
        getYtfKpiDefinitionsLatest().catch(() => null),
      ])
      if (nextCandidateMetrics) setCandidateMetrics(getMetricRows(nextCandidateMetrics).slice(0, 12))
      if (nextLatestMetrics) setLatestMetrics(getMetricRows(nextLatestMetrics).slice(0, 12))
      if (nextKpis?.rows) setOfficialKpis(nextKpis.rows.slice(0, 12))
    } catch (nextError) {
      setMetricReviewMessage(nextError instanceof Error ? nextError.message : 'Metric update failed.')
    } finally {
      setMetricReviewingId('')
    }
  }

  function productionRowQuantity(row: ConfirmableProductionRow) {
    const quantityRow = row as { pending_qty?: number; output_qty?: number; quantity?: number; good_quantity?: number; value?: number | string }
    return Number(quantityRow.pending_qty ?? quantityRow.output_qty ?? quantityRow.quantity ?? quantityRow.good_quantity ?? quantityRow.value ?? 0)
  }

  function productionRowNeedsConfirmation(row: ConfirmableProductionRow) {
    return String(row.status || '').trim().toLowerCase() === 'needs_confirmation'
  }

  function productionConfirmationKey(row: ConfirmableProductionRow) {
    return [
      String(row.plant || selectedPlantScope || '').trim().toLowerCase(),
      String(row.size || '').trim().toLowerCase(),
      String(row.updated_at || row.source?.date_context || '').trim(),
      String(productionRowQuantity(row) || '').trim(),
    ].join('|')
  }

  async function confirmPendingProduction(row: ConfirmableProductionRow) {
    const size = String(row.size || '').trim()
    const pendingQty = productionRowQuantity(row)
    if (!size || !Number.isFinite(pendingQty) || pendingQty <= 0 || productionConfirmingKey) return
    const key = productionConfirmationKey(row)
    const plant = String(row.plant || '').trim() || selectedPlantLabel
    const sourceDate = String(row.source?.date_context || row.source?.period_label || row.updated_at || '').trim()
    const boardDate = sourceDate.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/)?.[0]?.replace(/\//g, '-') || ''
    setProductionConfirmingKey(key)
    setProductionConfirmMessage('')
    try {
      const result = await confirmYtfProductionClose({
        size,
        plant,
        pending_qty: String(pendingQty),
        good_qty: String(pendingQty),
        reject_qty: '0',
        board_date: boardDate,
        shift: 'Daily close',
        source_updated_at: String(row.updated_at || ''),
        note: 'Manager confirmed from production close review.',
        idempotency_key: key,
      })
      setProductionConfirmMessage(result.message || `${size} production confirmed.`)
      const nextOperatingMetrics = await getYtfOperatingMetrics({ refresh: true }).catch(() => null)
      if (nextOperatingMetrics) setOperatingMetrics(nextOperatingMetrics)
    } catch (nextError) {
      setProductionConfirmMessage(nextError instanceof Error ? nextError.message : 'Production confirmation failed.')
    } finally {
      setProductionConfirmingKey('')
    }
  }

  function changeView(view: LiveDataView) {
    setActiveView(view)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', view)
    if (selectedPlantScope !== 'all') nextParams.set('plant', selectedPlantScope)
    setSearchParams(nextParams)
  }

  async function saveManualDrop() {
    const rawText = manualText.trim()
    const sourceId = manualSourceId || communicationSources[0]?.source_id || ''
    if (!sourceId || !rawText) {
      setManualStatus('Choose an intake lane and paste the message or email note first.')
      return
    }
    setManualSaving(true)
    setManualStatus('')
    try {
      const result = await saveYtfCommunicationManualDrop({
        source_id: sourceId,
        title: manualTitle.trim() || 'Manual communication evidence',
        raw_text: rawText,
        sender: manualSender.trim(),
        evidence_link: manualEvidence.trim(),
      })
      const owner = result.classification?.owner || 'data owner'
      const priority = result.classification?.priority || 'check'
      setManualStatus(`Saved as ${priority} evidence for ${owner}. ${result.next_step || ''}`.trim())
      setManualText('')
      setManualTitle('')
      setManualSender('')
      setManualEvidence('')
      const canReadRawComms = roleCanSeeRawComms(sessionPayload?.session)
      const [nextPipeline, nextBots] = await Promise.all([
        getYtfPipelineStats().catch(() => null),
        canReadRawComms ? getYtfBotPipeline().catch(() => null) : Promise.resolve(null),
      ])
      if (nextPipeline) setPipeline(nextPipeline)
      if (canReadRawComms && nextBots) setBots(nextBots)
    } catch (nextError) {
      setManualStatus(nextError instanceof Error ? nextError.message : 'Manual drop could not be saved.')
    } finally {
      setManualSaving(false)
    }
  }

  async function runGmailSyncNow() {
    if (gmailSyncing) return
    setGmailSyncing(true)
    setGmailSyncMessage('')
    try {
      const result = await syncYtfGmail()
      setCommunications(result)
      const [nextGmail, nextSummary] = await Promise.all([
        getYtfGmailStatus().catch(() => null),
        getYtfDashboardSummary({ compact: true }).catch(() => null),
      ])
      if (nextGmail) setGmail(nextGmail)
      if (nextSummary) {
        setDashboard(nextSummary)
        if (nextSummary.pipeline_stats) setPipeline(nextSummary.pipeline_stats)
        if (nextSummary.latest_metrics) setLatestMetrics(getMetricRows(nextSummary.latest_metrics).slice(0, 12))
      }
      const matched = result.summary?.gmail_message_count ?? 0
      const relevant = result.summary?.gmail_relevant_count ?? 0
      const saved = result.summary?.gmail_saved_tasks ?? 0
      setGmailSyncMessage(`${compactNumber(matched)} matched; ${compactNumber(relevant)} relevant; ${compactNumber(saved)} routed.`)
    } catch (nextError) {
      setGmailSyncMessage(nextError instanceof Error ? nextError.message : 'Gmail sync could not run.')
    } finally {
      setGmailSyncing(false)
    }
  }

  const displayPipeline = pipeline ?? dashboard?.pipeline_stats ?? ({} as YtfPipelineStatsResult)
  const sourceRecords = displayPipeline.source_records
  const sourceBehaviorSummary = sourceBehaviorMap?.summary
  const sourceExtractionPlan = sourceBehaviorMap?.source_extraction_plan
  const sourceExtractionSummary = sourceExtractionPlan?.summary
  const sourceBehaviorFolders = sourceBehaviorMap?.folder_behaviors ?? []
  const liveOperationalFolders = sourceBehaviorFolders.filter((folder) => countBucket(folder.by_behavior, 'operational_dataset') > 0)
  const sourceBehaviorCards = [
    {
      label: 'Live data lanes',
      value: compactNumber(sourceExtractionSummary?.operational_dataset_count ?? sourceBehaviorSummary?.operational_dataset_count),
      detail: 'Updated production, QC, stock, supplier, and maintenance sources that can feed the app.',
    },
    {
      label: 'Table jobs',
      value: compactNumber(sourceExtractionSummary?.table_job_count ?? sourceBehaviorSummary?.structured_dataset_count),
      detail: 'Sheets/workbooks being parsed into sizes, quantities, dates, materials, and costs.',
    },
    {
      label: 'Document context',
      value: compactNumber(sourceExtractionSummary?.document_job_count ?? sourceBehaviorSummary?.context_reference_count),
      detail: 'SOPs, layouts, procedures, manuals, and reference docs for the company brain.',
    },
    {
      label: 'Board/photo jobs',
      value: compactNumber(sourceExtractionSummary?.visual_job_count),
      detail: 'Whiteboard and image values are read before numbers reach dashboards.',
    },
  ]
  const sourceBehaviorFolderRows = (liveOperationalFolders.length ? liveOperationalFolders : sourceBehaviorFolders).slice(0, 6)
  const sourceChanges = displayPipeline.source_changes
  const sourceEvents = useMemo<SourceChangeEvent[]>(
    () =>
      [
        ...((sourceChangeResult?.rows as SourceChangeEvent[] | undefined) ??
          (dashboard?.story?.source_events as SourceChangeEvent[] | undefined) ??
          (sourceChanges?.events as SourceChangeEvent[] | undefined) ??
          []),
      ].slice(0, 12),
    [dashboard?.story?.source_events, sourceChangeResult?.rows, sourceChanges?.events],
  )
  const sourceRecordRows = useMemo(() => {
    const rows = sourceRecordResult?.rows?.length ? sourceRecordResult.rows : sourceRecordResult?.local_preview ?? []
    const search = sourceSearch.trim().toLowerCase()
    if (!search) return rows.slice(0, 24)
    return rows
      .filter((record) =>
        [record.title, record.path, record.organized_path, record.domain, record.plant, record.department, record.owner_hint]
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
      .slice(0, 24)
  }, [sourceRecordResult?.local_preview, sourceRecordResult?.rows, sourceSearch])
  const sourceDomainOptions = useMemo(() => topEntries(sourceRecords?.by_domain).map(([label]) => label).filter(Boolean), [sourceRecords?.by_domain])
  const sourcePlantOptions = useMemo(() => topEntries(sourceRecords?.by_plant).map(([label]) => label).filter(Boolean), [sourceRecords?.by_plant])
  const nextActions = (dashboard?.story?.next_actions ?? displayPipeline.next_actions ?? []) as string[]
  const ownerFocus = (dashboard?.story?.owner_focus ?? []) as OwnerFocusItem[]
  const communicationSummary = communications?.summary ?? communications?.plan?.summary
  const communicationSourceRows = communications?.plan?.sources ?? []
  const gmailIntakePlan = gmail?.intake_plan ?? communications?.plan?.gmail_intake_plan
  const gmailQueryProfiles = gmailIntakePlan?.query_profiles ?? []
  const gmailScanResults = (communications?.scan_results ?? []).filter((item) =>
    String(item?.source_id || '').startsWith('gmail_'),
  )
  const gmailMatchedCount = communicationSummary?.gmail_message_count ?? gmailScanResults.reduce((sum, item) => sum + Number(item?.message_count || 0), 0)
  const gmailRelevantCount = communicationSummary?.gmail_relevant_count ?? gmailScanResults.reduce((sum, item) => sum + Number(item?.relevant_count || 0), 0)
  const gmailSavedCount = communicationSummary?.gmail_saved_tasks ?? gmailScanResults.reduce((sum, item) => sum + Number(item?.saved_tasks || 0), 0)
  const gmailWorkerMode = communicationSummary?.gmail_worker_mode || gmail?.summary?.worker_mode || gmailIntakePlan?.worker_contract?.mode || 'metadata worker'
  const communicationGmailRows = communicationSourceRows.filter((source) => String(source.system || '').toLowerCase() === 'gmail')
  const communicationChatRows = communicationSourceRows.filter((source) => String(source.system || '').toLowerCase() !== 'gmail')
  const gmailSourceRows = (gmail?.sources ?? []).filter((source) => String(source.system || '').toLowerCase() === 'gmail')
  const useGmailSummary = !gmailSourceRows.length && Number(gmail?.summary?.source_count || 0) > 0 && Number(gmail?.summary?.source_count || 0) <= 4
  const gmailSourceReady = gmailSourceRows.filter((source) =>
    ['ready', 'live', 'ok'].includes(String(source.status || source.probe_status || '').toLowerCase()),
  ).length
  const communicationGmailReady = communicationGmailRows.filter((source) =>
    ['ready', 'live', 'ok'].includes(String(source.status || source.probe_status || '').toLowerCase()),
  ).length
  const communicationChatReady = communicationChatRows.filter((source) =>
    ['ready', 'live', 'ok'].includes(String(source.status || source.probe_status || '').toLowerCase()),
  ).length
  const emailReady = Math.max(
    gmailSourceReady,
    useGmailSummary ? Number(gmail?.summary?.ready_count || 0) : 0,
    communicationGmailReady,
  )
  const emailTotal = Math.max(
    gmailSourceRows.length,
    useGmailSummary ? Number(gmail?.summary?.source_count || 0) : 0,
    communicationGmailRows.length,
  )
  const botReady = Math.max(bots?.summary?.ready_count ?? 0, communicationChatReady, displayPipeline.communications?.bot_ready_count ?? 0)
  const botTotal = Math.max(bots?.summary?.bot_source_count ?? 0, communicationChatRows.length, displayPipeline.communications?.bot_source_count ?? 0)
  const recentBotMessages = ((bots?.latest?.recent_messages ?? []) as YtfBotRecentMessage[]).slice(0, 5)
  const recentBotFactCount = recentBotMessages.reduce((sum, message) => sum + Number(message.fact_count || 0), 0)
  const cloudCommsSecretReady = cloudComms?.summary?.secret_ready_count ?? 0
  const cloudCommsSecretCount = cloudComms?.summary?.secret_count ?? 0
  const cloudCommsCronReady = cloudComms?.summary?.cron_ready_count ?? 0
  const cloudCommsCronCount = cloudComms?.summary?.cron_count ?? 0
  const cloudCommsActions = cloudComms?.operator_actions ?? []
  const cloudCommsSetupFlow = cloudComms?.setup_flows?.find((flow) => flow.recommended) ?? cloudComms?.setup_flows?.[0]
  const commReady = Math.max(communicationSummary?.ready_count ?? 0, emailReady + botReady)
  const commTotal = Math.max(communicationSummary?.source_count ?? 0, emailTotal + botTotal)
  const knowledgeChunks = Math.max(knowledge?.summary?.chunk_count ?? 0, displayPipeline.knowledge?.chunk_count ?? 0)
  const vectorMode = formatMode(knowledge?.vector_readiness?.mode ?? (displayPipeline.knowledge?.pgvector_ready ? 'pgvector ready' : 'token search'))
  const workbookMetricValues = useMemo(
    () => (workbookExtraction?.metric_values ?? []).filter(isUsefulWorkbookMetric),
    [workbookExtraction?.metric_values],
  )
  const workbookMetricCandidates = useMemo(() => workbookExtraction?.metric_candidates ?? [], [workbookExtraction?.metric_candidates])
  const dashboardPipeline = dashboard?.pipeline_stats
  const workbookProfileCount =
    workbookExtraction?.summary?.profiled_workbook_count ??
    displayPipeline.workbooks?.profiled_count ??
    dashboardPipeline?.workbooks?.profiled_count ??
    0
  const workbookSelectedCount =
    workbookExtraction?.summary?.selected_workbook_count ??
    displayPipeline.workbooks?.selected_count ??
    dashboardPipeline?.workbooks?.selected_count ??
    0
  const workbookBlockedCount =
    workbookExtraction?.summary?.blocked_workbook_count ??
    displayPipeline.workbooks?.blocked_count ??
    dashboardPipeline?.workbooks?.blocked_count ??
    0
  const workbookValueSampleCount = workbookExtraction?.summary?.metric_value_sample_count ?? workbookMetricValues.length
  const workbookGeneratedAt = workbookExtraction?.summary?.generated_at
  const scopedWorkbookMetricValues = useMemo(
    () =>
      filterForSelectedPlant(
        workbookMetricValues,
        selectedPlantScope,
        (metric) => [workbookMetricHaystack(metric), workbookMetricSourceHaystack(metric)].join(' '),
      ),
    [selectedPlantScope, workbookMetricValues],
  )
  const visiblePlantMetricValues = useMemo(() => {
    const source = scopedWorkbookMetricValues.length ? scopedWorkbookMetricValues : workbookMetricValues
    const selected: WorkbookMetricValue[] = []
    for (const lane of ['Production', 'Quality', 'Sales / Inventory', 'Finance / Supplier']) {
      const sample =
        source.find((metric) => workbookMetricLane(metric) === lane) ||
        scopedWorkbookMetricValues.find((metric) => workbookMetricLane(metric) === lane) ||
        workbookMetricValues.find((metric) => workbookMetricLane(metric) === lane)
      if (sample && !selected.includes(sample)) selected.push(sample)
    }
    for (const metric of source) {
      if (selected.length >= 8) break
      if (!selected.includes(metric)) selected.push(metric)
    }
    return selected
  }, [scopedWorkbookMetricValues, workbookMetricValues])
  const workbookLaneCards = ['Production', 'Quality', 'Sales / Inventory', 'Finance / Supplier'].map((lane) => {
    const rows = workbookMetricValues.filter((metric) => workbookMetricLane(metric) === lane)
    return {
      lane,
      count: rows.length,
      sample: rows[0],
    }
  })
  const operatingLaneCards = (operatingMetrics?.lanes ?? []).filter((lane) => Number(lane.count || 0) > 0).slice(0, 5)
  const factoryLedgerOperatingRows = useMemo(() => {
    const laneRows = (operatingMetrics?.lanes ?? []).flatMap((lane) =>
      (lane.rows ?? []).map((row) => laneRowAsOperatingMetric(row, lane)),
    )
    return dedupeOperatingRows([
      ...selectTopYtfOperatingRows(operatingMetrics?.top_rows ?? [], 120, {
        preferredScope: selectedPlantScope,
        minYear: 2024,
      }),
      ...laneRows,
    ])
  }, [operatingMetrics?.lanes, operatingMetrics?.top_rows, selectedPlantScope])
  const scopedFactoryLedgerOperatingRows = useMemo(
    () =>
      filterForSelectedPlant(
        factoryLedgerOperatingRows,
        selectedPlantScope,
        (row) => [operatingMetricHaystack(row), operatingMetricSourceHaystack(row)].join(' '),
      ),
    [factoryLedgerOperatingRows, selectedPlantScope],
  )
  const operatingMetricRows = useMemo(
    () =>
      selectTopYtfOperatingRows(scopedFactoryLedgerOperatingRows, 8, {
        preferredScope: selectedPlantScope,
        minYear: 2024,
      }),
    [scopedFactoryLedgerOperatingRows, selectedPlantScope],
  )
  const operatingFactLedger = operatingMetrics?.operating_facts ?? operatingMetrics?.erp_fact_ledger
  const scopedErpFacts = useMemo(() => {
    const facts = operatingFactLedger?.facts ?? []
    if (selectedPlantScope === 'all') return facts
    return facts.filter((fact) => erpFactPlantScope(fact) === selectedPlantScope)
  }, [operatingFactLedger?.facts, selectedPlantScope])
  const factoryLedgerLanes = useMemo(
    () => buildFactoryLedgerLanes(scopedFactoryLedgerOperatingRows, scopedWorkbookMetricValues, scopedErpFacts),
    [scopedFactoryLedgerOperatingRows, scopedWorkbookMetricValues, scopedErpFacts],
  )
  const visibleFactoryLedgerLanes = useMemo(
    () => (selectedLaneFilter === 'all' ? factoryLedgerLanes : factoryLedgerLanes.filter((lane) => lane.id === selectedLaneFilter)),
    [factoryLedgerLanes, selectedLaneFilter],
  )
  const operatingStory = operatingMetrics?.story
  const operatingStoryCards = operatingStory?.insight_cards ?? []
  const operatingStoryWatchlist = operatingStory?.watchlist ?? []
  const operatingStoryActions = operatingStory?.recommended_actions ?? []
  const operatingStoryRoles = operatingStory?.role_briefs ?? []
  const factorySystem = operatingStory?.factory_system
  const factoryNowLanes = factorySystem?.lanes ?? []
  const workbookStructure = factorySystem?.workbook_structure
  const agentTableTrust = factorySystem?.agent_table_trust ?? workbookExtraction?.agent_table_trust
  const agentTableSummary = agentTableTrust?.summary
  const agentTableRows = agentTableTrust?.rows ?? []
  const agentKeyEscalations = agentTableSummary?.key_escalation_count ?? workbookStructure?.agent_key_escalations ?? 0
  const agentAutoHandledTables = agentTableSummary?.auto_handled_count ?? workbookStructure?.agent_auto_handled_tables ?? 0
  const agentDashboardSafeTables = agentTableSummary?.dashboard_safe_count ?? 0
  const agentHandledPreview = agentTableRows.filter((row) => row.status !== 'key_escalation').slice(0, 2)
  const agentEscalationPreview = agentTableRows.filter((row) => row.status === 'key_escalation').slice(0, 3)
  const factoryOperatingGaps = factorySystem?.operating_gaps ?? []
  const operatingSizeBreakdowns = operatingStory?.size_breakdowns
  const sizeAttention = useMemo(
    () => operatingSizeBreakdowns?.size_attention ?? [],
    [operatingSizeBreakdowns?.size_attention],
  )
  const productionBySize = useMemo(
    () => currentMetricRows(operatingSizeBreakdowns?.production_by_size ?? [], { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 10 }),
    [operatingSizeBreakdowns?.production_by_size],
  )
  const pendingProductionClose = useMemo(
    () => operatingSizeBreakdowns?.pending_production_close ?? [],
    [operatingSizeBreakdowns?.pending_production_close],
  )
  const qualityClaimsBySize = useMemo(
    () => currentMetricRows(operatingSizeBreakdowns?.quality_claims_by_size ?? [], { minYear: 2024, allowLowConfidence: true, maxAgeDays: 30 }),
    [operatingSizeBreakdowns?.quality_claims_by_size],
  )
  const stockBySize = useMemo(
    () => currentMetricRows(operatingSizeBreakdowns?.stock_by_size ?? [], { minYear: 2024, allowLowConfidence: true, maxAgeDays: 21 }),
    [operatingSizeBreakdowns?.stock_by_size],
  )
  const procurementBySize = useMemo(
    () => currentMetricRows(operatingSizeBreakdowns?.procurement_by_size ?? [], { minYear: 2024, maxAgeDays: 45 }),
    [operatingSizeBreakdowns?.procurement_by_size],
  )
  const energyByPlant = operatingSizeBreakdowns?.energy_by_plant ?? []
  const rawMaterialOrders = useMemo(
    () => currentMetricRows(operatingSizeBreakdowns?.raw_material_orders ?? [], { minYear: 2024, maxAgeDays: 60 }),
    [operatingSizeBreakdowns?.raw_material_orders],
  )
  const scopedProductionBySize = useMemo(
    () => preferExactPlantMetricRows(productionBySize, selectedPlantScope, 'production'),
    [productionBySize, selectedPlantScope],
  )
  const scopedPendingProductionClose = useMemo(
    () => filterPendingProductionCloseRows(pendingProductionClose, selectedPlantScope),
    [pendingProductionClose, selectedPlantScope],
  )
  const scopedQualityClaimsBySize = useMemo(
    () => preferExactPlantMetricRows(qualityClaimsBySize, selectedPlantScope, 'quality'),
    [qualityClaimsBySize, selectedPlantScope],
  )
  const scopedStockBySize = useMemo(
    () => preferExactPlantMetricRows(stockBySize, selectedPlantScope, 'stock'),
    [stockBySize, selectedPlantScope],
  )
  const scopedProcurementBySize = useMemo(
    () => preferExactPlantMetricRows(procurementBySize, selectedPlantScope, 'procurement'),
    [procurementBySize, selectedPlantScope],
  )
  const scopedRawMaterialOrders = useMemo(
    () => preferExactPlantMetricRows(rawMaterialOrders, selectedPlantScope, 'raw material'),
    [rawMaterialOrders, selectedPlantScope],
  )
  const visibleProductionBySize = useMemo(
    () => prioritizeRowsBySize(scopedProductionBySize, selectedSizeToken, (row) => String(row.size || '')),
    [scopedProductionBySize, selectedSizeToken],
  )
  const visiblePendingProductionClose = useMemo(
    () => prioritizeRowsBySize(scopedPendingProductionClose, selectedSizeToken, (row) => String(row.size || '')),
    [scopedPendingProductionClose, selectedSizeToken],
  )
  const visibleProductionConfirmRows: ConfirmableProductionRow[] = []
  const visibleProductionConfirmKeys = new Set<string>()
  ;[...visibleProductionBySize, ...visiblePendingProductionClose].forEach((row) => {
    if (!productionRowNeedsConfirmation(row)) return
    const rowKey = productionConfirmationKey(row)
    if (!rowKey || visibleProductionConfirmKeys.has(rowKey)) return
    visibleProductionConfirmKeys.add(rowKey)
    visibleProductionConfirmRows.push(row)
  })
  const productionConfirmTotal = visibleProductionConfirmRows.reduce(
    (sum, row) => sum + Math.max(0, Number(productionRowQuantity(row) || 0)),
    0,
  )
  const visibleQualityClaimsBySize = useMemo(
    () => prioritizeRowsBySize(scopedQualityClaimsBySize, selectedSizeToken, (row) => String(row.size || '')),
    [scopedQualityClaimsBySize, selectedSizeToken],
  )
  const visibleStockBySize = useMemo(
    () => prioritizeRowsBySize(scopedStockBySize, selectedSizeToken, (row) => String(row.size || '')),
    [scopedStockBySize, selectedSizeToken],
  )
  const visibleProcurementBySize = useMemo(
    () => prioritizeRowsBySize(scopedProcurementBySize, selectedSizeToken, (row) => String(row.size || '')),
    [scopedProcurementBySize, selectedSizeToken],
  )
  const visibleRawMaterialOrders = useMemo(
    () => prioritizeRowsBySize(scopedRawMaterialOrders, selectedSizeToken, (row) => String(row.material || '')),
    [scopedRawMaterialOrders, selectedSizeToken],
  )
  const scopedProductionTotal = scopedProductionBySize.reduce((sum, row) => sum + Number(row.output_qty || 0), 0)
  const scopedClaimTotal = scopedQualityClaimsBySize.reduce((sum, row) => sum + Number(row.claim_qty || 0), 0)
  const scopedStockTotal = scopedStockBySize.reduce(
    (sum, row) => sum + Number(row.received_qty || row.issued_qty || row.movement_qty || row.closing_qty || 0),
    0,
  )
  const scopedMaterialTotalTon = scopedRawMaterialOrders.reduce((sum, row) => sum + Number(row.order_ton || 0), 0)
  const scopedBuyingRecordCount = scopedProcurementBySize.length + scopedRawMaterialOrders.length
  const selectedProductionSignal = useMemo<PlantMetricSignal | null>(() => {
    if (scopedProductionTotal > 0) {
      return {
        label: 'Production output',
        value: scopedProductionTotal,
        unit: 'pcs',
        detail: `Current production split for ${selectedPlantLabel}.`,
        score: 125,
      }
    }
    if (selectedPlantScope !== 'all') {
      return bestPlantProductionSignal(
        selectedPlantScope as PlantOperatingScope,
        productionBySize,
        scopedFactoryLedgerOperatingRows,
        scopedWorkbookMetricValues,
        { allowSummaryFallback: false },
      )
    }
    const plantSignals = (['plant-a', 'plant-b'] as PlantOperatingScope[])
      .map((scope) =>
        bestPlantProductionSignal(scope, productionBySize, scopedFactoryLedgerOperatingRows, scopedWorkbookMetricValues, {
          allowSummaryFallback: false,
        }),
      )
      .filter((signal): signal is PlantMetricSignal => Boolean(signal))
    if (!plantSignals.length) return null
    const unit = plantSignals.find((signal) => signal.unit === 'pcs')?.unit ?? plantSignals[0].unit
    return {
      label: 'Production output',
      value: plantSignals.reduce((sum, signal) => sum + Number(signal.value || 0), 0),
      unit,
      detail: 'Floor A and Floor B production signals.',
      score: Math.max(...plantSignals.map((signal) => signal.score || 0)),
    }
  }, [productionBySize, scopedFactoryLedgerOperatingRows, scopedProductionTotal, scopedWorkbookMetricValues, selectedPlantLabel, selectedPlantScope])
  const showProductionLaneDetail = selectedLaneFilter === 'all' || selectedLaneFilter === 'production'
  const showQualityLaneDetail = selectedLaneFilter === 'all' || selectedLaneFilter === 'quality'
  const showStockLaneDetail = selectedLaneFilter === 'all' || selectedLaneFilter === 'stock'
  const showSupplierLaneDetail = selectedLaneFilter === 'all' || selectedLaneFilter === 'supplier'
  const laneQueryValue =
    selectedLaneFilter === 'production'
      ? 'production'
      : selectedLaneFilter === 'quality'
        ? 'quality'
        : selectedLaneFilter === 'stock'
          ? 'sales_inventory'
          : selectedLaneFilter === 'supplier'
            ? 'finance_procurement'
            : ''
  const buildKpiDrillRoute = (lane: string, size?: string) => {
    const params = new URLSearchParams()
    params.set('view', 'kpi')
    params.set('lane', lane)
    params.set('plant', selectedPlantScope)
    if (size && String(size).trim()) params.set('size', String(size).trim())
    return `/app/live-data?${params.toString()}`
  }
  const clearSizeRoute = useMemo(() => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('size')
    if (!nextParams.get('view')) nextParams.set('view', 'kpi')
    if (!nextParams.get('plant')) nextParams.set('plant', selectedPlantScope)
    if (!nextParams.get('lane') && laneQueryValue) nextParams.set('lane', laneQueryValue)
    return `/app/live-data?${nextParams.toString()}`
  }, [laneQueryValue, searchParams, selectedPlantScope])
  const scopedSizeAttention = useMemo(
    () => preferExactPlantMetricRows(sizeAttention, selectedPlantScope, 'production quality stock'),
    [selectedPlantScope, sizeAttention],
  )
  const visibleSizeAttention = scopedSizeAttention.slice(0, 6)
  const missingOperatingInputs = operatingSizeBreakdowns?.missing_inputs ?? []
  const maxSizeAttentionScore = Math.max(1, ...visibleSizeAttention.map((row) => Number(row.attention_score || 0)))
  const capabilityProfile = getCapabilityProfileForRole(currentSession?.role)
  const roleCapabilities = Array.from(
    new Set([...(capabilityProfile.capabilities ?? []), ...((currentSession?.capabilities ?? []) as WorkspaceCapability[])]),
  ) as WorkspaceCapability[]
  const showInternalDataOps = false
  const canSeeRawComms = showInternalDataOps && roleCanSeeRawComms(currentSession)
  const canBrowseSourceRecords = showInternalDataOps && roleCanBrowseSourceRecords(currentSession)
  const transformedRecordCount =
    sourceRecords?.count ??
    sourceRecordResult?.summary?.source_record_count ??
    displayPipeline.source_records?.count ??
    dashboardPipeline?.source_records?.count ??
    0
  const changedSourceCount =
    sourceChanges?.event_count ??
    sourceChangeResult?.rows?.length ??
    displayPipeline.source_changes?.event_count ??
    dashboardPipeline?.source_changes?.event_count ??
    0
  const workbookMetricCount =
    workbookMetricCandidates.length ||
    displayPipeline.workbooks?.metric_candidate_count ||
    dashboardPipeline?.workbooks?.metric_candidate_count ||
    0
  const sourceKpiCandidateCount =
    sourceRecords?.kpi_candidate_count ??
    displayPipeline.source_records?.kpi_candidate_count ??
    dashboardPipeline?.source_records?.kpi_candidate_count ??
    0
  const actualMetricValueCount = Math.max(Number(operatingMetrics?.summary?.extracted_metric_value_count || 0), workbookValueSampleCount, Number(operatingFactLedger?.fact_count || 0))
  const visibleMetricSignalCount =
    actualMetricValueCount ||
    workbookMetricCount ||
    latestMetrics.length ||
    candidateMetrics.length ||
    officialKpis.length ||
    visiblePlantMetricValues.length
  const officialMetricCount = officialKpis.length
  const sourceAgenticExtraction =
    fileAgents?.summary ??
    sourceRecordResult?.summary?.agentic_extraction ??
    sourceRecordResult?.database?.summary?.agentic_extraction ??
    sourceRecords?.agentic_extraction
  const fileAgentRows = useMemo<YtfFileAgentRow[]>(() => {
    if (fileAgents?.rows?.length) return fileAgents.rows
    const rows = sourceRecordResult?.rows?.length ? sourceRecordResult.rows : sourceRecordResult?.local_preview ?? []
    return rows
      .map(sourceRecordFileAgent)
      .filter((row): row is YtfFileAgentRow => Boolean(row))
      .slice(0, 80)
  }, [fileAgents?.rows, sourceRecordResult?.local_preview, sourceRecordResult?.rows])
  const fileAgentCount = sourceAgenticExtraction?.file_agent_count ?? fileAgentRows.length
  const fileAgentProfileCount = sourceAgenticExtraction?.profile_count ?? topEntries(sourceAgenticExtraction?.by_profile).length
  const highPriorityFileAgentCount =
    sourceAgenticExtraction?.high_priority_count ?? sourceAgenticExtraction?.high_priority_file_agent_count ?? 0
  const latestFileAgentRuns = useMemo(() => fileAgentRuns?.latest_runs ?? [], [fileAgentRuns?.latest_runs])
  const latestFileAgentRun = latestFileAgentRuns[0]
  const roleDataView = resolveRoleDataView(currentSession?.role, roleCapabilities, {
    sourceRecordCount: transformedRecordCount,
    sourceChangeCount: changedSourceCount,
    reviewTaskCount: sourceChanges?.promoted_task_count ?? sourceChangeResult?.task_promotion?.review_task_count ?? 0,
    latestMetricCount: latestMetrics.length || candidateMetrics.length || officialKpis.length || visiblePlantMetricValues.length || visibleMetricSignalCount,
    officialKpiCount: officialMetricCount,
    knowledgeChunkCount: knowledgeChunks,
    liveSourceCount: commTotal,
    connectorGapCount: Math.max(0, commTotal - commReady),
    openTaskCount: sourceChanges?.promoted_task_count ?? 0,
    pendingApprovalCount: sourceRecordResult?.promotion_board?.action_count ?? 0,
  })
  const fullRefreshLatest = fullRefresh?.latest
  const fullRefreshMarkerStale = Boolean(fullRefreshLatest?.stale_running || fullRefreshLatest?.status === 'stale')
  const rawFullRefreshStatus = fullRefreshLatest?.result_status || fullRefreshLatest?.status || fullRefresh?.status || displayPipeline.refresh_loop?.status || 'ready'
  const fullRefreshStatus = fullRefreshMarkerStale ? 'ready' : rawFullRefreshStatus
  const fullRefreshAt =
    fullRefreshLatest?.completed_at ||
    fullRefreshLatest?.updated_at ||
    fullRefreshLatest?.created_at ||
    displayPipeline.refresh_loop?.latest_at ||
    dataManagerRun?.synced_at ||
    dashboard?.generated_at
  const operationsUpdatedAt =
    dashboard?.generated_at ||
    operatingMetrics?.generated_at ||
    workbookGeneratedAt ||
    displayPipeline.refresh_loop?.latest_at ||
    dataManagerRun?.synced_at ||
    fullRefreshAt
  const fullRefreshStepCount = fullRefreshLatest?.step_count ?? fullRefreshLatest?.result?.steps?.length ?? 0
  const fullRefreshPipelineVersion = fullRefreshLatest?.pipeline_version || 'current'
  const fullRefreshHasSourceReview = Boolean(fullRefreshLatest?.has_source_change_review_step)
  const fullRefreshHasFileAgents = Boolean(fullRefreshLatest?.has_file_agent_extraction_step)
  const sourceChangeReviewTaskCount = sourceChanges?.promoted_task_count ?? sourceChangeResult?.task_promotion?.review_task_count ?? 0
  const canRunFullRefresh = showInternalDataOps && roleCanReadAdminRuntime(currentSession)
  const canSeeTeamWorkView = roleCapabilities.includes('actions.view')
    || roleCapabilities.includes('operations.view')
    || roleCapabilities.includes('dqms.view')
    || roleCapabilities.includes('maintenance.view')
    || roleCapabilities.includes('director.view')
  const fullRefreshDetail = canRunFullRefresh
    ? fullRefreshMarkerStale
      ? `Background jobs are current; old marker exceeded ${compactDuration(fullRefreshLatest?.running_timeout_seconds)} TTL.`
      : `${fullRefreshStatus}; ${compactNumber(fullRefreshStepCount)} background steps.`
    : 'Cloud data refresh runs in the background.'
  const activeDatabase = displayPipeline.database ?? dashboardPipeline?.database
  const dataManagerSaved = dataManagerRun?.saved ?? {}
  const databaseHealthCards = [
    {
      label: 'Saved history',
      value: activeDatabase?.external ? 'Cloud' : 'Cached',
      detail: 'Daily values, work, and evidence are saved together.',
    },
    {
      label: 'Known records',
      value: compactNumber(transformedRecordCount),
      detail: `${compactNumber(sourceKpiCandidateCount)} possible plant numbers are held for review before use.`,
    },
    {
      label: 'Review checks',
      value: compactNumber(fileAgentCount),
      detail: `${compactNumber(fileAgentProfileCount)} review patterns keep records separated by Floor And department.`,
    },
    {
      label: 'Changed records',
      value: compactNumber(changedSourceCount),
      detail: `${compactNumber(sourceChanges?.promoted_task_count ?? sourceChangeResult?.task_promotion?.review_task_count ?? 0)} work items from source changes.`,
    },
    {
      label: 'Plant values',
      value: compactNumber(visibleMetricSignalCount),
      detail: `${compactNumber(workbookMetricCount)} possible values; managers should add missing current numbers in Entry.`,
    },
    {
      label: 'Context search',
      value: compactNumber(knowledgeChunks),
      detail: `${compactNumber(knowledge?.embedding_index?.indexed_count)} notes can support manager briefs and follow-up.`,
    },
    {
      label: 'Data update',
      value: compactDateTime(fullRefreshAt),
      detail: canRunFullRefresh ? `${fullRefreshPipelineVersion}: ${fullRefreshDetail}` : fullRefreshDetail,
    },
    {
      label: 'Background update',
      value: fullRefreshHasSourceReview && fullRefreshHasFileAgents ? 'On' : 'Scheduled',
      detail: `${compactNumber(fileAgentCount)} business records watched; ${compactNumber(sourceChangeReviewTaskCount)} work items.`,
    },
  ]
  const databaseWriteModel = [
    { label: 'Original records', detail: 'Business records, messages, board photos, and manual drops stay traceable.' },
    { label: 'Structured extraction', detail: 'Rows become plant values with period, section, plant, and owner context.' },
    { label: 'Organized tables', detail: 'Record changes, values, team work, and communication evidence.' },
    { label: 'Evidence lookup', detail: 'Context search supports role-safe briefs, number explanations, and owner follow-up.' },
    { label: 'Manager review', detail: 'Managers confirm context, owner, and meaning before a number is used.' },
  ]
  const erpLoop = dashboard?.erp_loop
  const cleanErpStatus = (status?: string) => {
    const normalized = String(status || '').trim().toLowerCase()
    if (normalized === 'working' || normalized === 'live') return 'Live'
    if (normalized === 'partial' || normalized === 'pilot') return 'Partial'
    if (normalized === 'mapped') return 'Mapped'
    if (normalized === 'gap') return 'Gap'
    if (normalized === 'empty') return 'Empty'
    return normalized ? normalized.replace(/_/g, ' ') : 'Ready'
  }
  const erpInputChannels = (erpLoop?.input_channels ?? [])
    .filter((channel) => canSeeRawComms || channel.id !== 'messages')
    .slice(0, canRunFullRefresh ? 5 : 4)
  const erpCoverageRows = (erpLoop?.erp_coverage ?? [])
    .filter((row) => canRunFullRefresh || !['company_brain', 'supplier'].includes(String(row.id || '')))
    .slice(0, canRunFullRefresh ? 6 : 4)
  const erpGapRows = (erpLoop?.missing_enterprise_layer ?? []).slice(0, 3)
  const erpLearning = erpLoop?.database_learning ?? {}
  const erpLoopVisible = false
  const companyBrainSummary = companyBrainGraph?.summary ?? {}
  const companyBrainBooks = (companyBrainGraph?.factory_books ?? []).slice(0, 5)
  const companyBrainFlow = (companyBrainGraph?.flow ?? []).slice(0, 4)
  const companyBrainInsights = (companyBrainGraph?.insights ?? []).slice(0, 3)
  const companyBrainBookCount = companyBrainSummary.factory_books_ready ?? companyBrainBooks.filter((book) => Number(book.count || 0) > 0).length
  const companyBrainTotalBooks = companyBrainSummary.factory_books_total ?? Math.max(5, companyBrainBooks.length)
  const companyBrainNodeCount = companyBrainGraph?.nodes?.length ?? 0
  const companyBrainEdgeCount = companyBrainGraph?.edges?.length ?? 0
  const aiNativePipelineRows = [
    {
      label: 'Inputs',
      detail: `Business sources, messages, board photos, and phone entries feed ${compactNumber(transformedRecordCount)} clean factory records.`,
    },
    {
      label: 'Data checks',
      detail: `${compactNumber(fileAgentCount)} data patterns classify useful records and stage values, tasks, and evidence.`,
    },
    {
      label: 'Plant records',
        detail: 'Changes, values, communication events, and work items become stable plant records.',
    },
    {
      label: 'Search',
      detail: `${vectorMode} over ${compactNumber(knowledgeChunks)} context rows for cited manager briefs.`,
    },
    {
      label: 'Manager review',
      detail: 'Managers correct outputs before dashboards and team work change.',
    },
  ]
  const dataSourceCards = [
    {
      label: 'Plant values',
      value: compactNumber(transformedRecordCount),
      detail: `${compactNumber(visibleMetricSignalCount)} production, QC, stock, and supplier values are ready for review.`,
      route: '/app/data-quality',
    },
    {
      label: 'Data checks',
      value: compactNumber(fileAgentProfileCount),
      detail: `${compactNumber(highPriorityFileAgentCount)} high-priority sources; latest run ${latestFileAgentRun?.status || 'not run yet'}.`,
      route: '/app/live-data?view=data&focus=file_agents',
    },
    {
      label: canSeeRawComms ? 'Gmail intake' : 'Email signals',
      value: canSeeRawComms ? `${emailReady}/${emailTotal || 0}` : 'Filtered',
      detail: canSeeRawComms
        ? `${gmail?.summary?.token_status || 'tracked'}; ${compactNumber(gmailRelevantCount)} relevant from ${compactNumber(gmailMatchedCount)} matched.`
        : 'Raw email stays admin-only; roles see routed work.',
      route: canSeeRawComms ? '/app/email' : '/app/action-board',
    },
    {
      label: 'Chat drops',
      value: `${botReady}/${botTotal || 0}`,
      detail: recentBotFactCount
        ? `${compactNumber(recentBotFactCount)} production, sales, quality, or maintenance facts extracted from recent chat.`
        : `${compactNumber(displayPipeline.communications?.manual_message_count)} manual/bot evidence drops mapped for action.`,
      route: canSeeRawComms ? '/app/live-data?view=comms' : '/app/action-board',
    },
    {
      label: 'Evidence search',
      value: compactNumber(knowledgeChunks),
      detail: `${vectorMode}; evidence-backed context for summaries and number explanations.`,
      route: '/app/live-data?view=data',
    },
  ]
  const plantSplitCards = useMemo<PlantSplitCard[]>(() => {
    const counts = sourceRecords?.by_plant ?? {}
    const countByNeedle = (needles: string[]) =>
      Object.entries(counts).reduce((sum, [label, value]) => {
        const normalized = String(label || '').toLowerCase()
        return needles.some((needle) => normalized.includes(needle)) ? sum + Number(value || 0) : sum
      }, 0)
    const laneRows = (operatingMetrics?.lanes ?? []).flatMap((lane) => (lane.rows ?? []).map((row) => laneRowAsOperatingMetric(row, lane)))
    const operatingRows = dedupeOperatingRows([
      ...selectTopYtfOperatingRows(operatingMetrics?.top_rows ?? [], 250, {
        preferredScope: 'all',
        minYear: 2024,
      }),
      ...laneRows,
    ])
    const buildProductionCard = (
      scope: PlantOperatingScope,
      label: string,
      route: string,
      fallbackDetail: string,
    ): PlantSplitCard => {
      const signal = bestPlantProductionSignal(scope, productionBySize, operatingRows, workbookMetricValues, {
        allowSummaryFallback: false,
      })
      return {
        label,
        value: signal ? formatPlantMetricValue(signal.value, signal.unit) : 'Needs entry',
        numericValue: signal?.value || 0,
        detail: signal ? `${signal.label}. ${signal.detail}` : `${fallbackDetail} Latest production close is not complete.`,
        route,
      }
    }

    return [
      buildProductionCard(
        'plant-a',
        'Floor A - Yangon',
        '/app/plant-manager',
        'Shwe Pyi Thar / bias, nylon, and agricultural tyres. Add daily close data if the latest output is missing.',
      ),
      buildProductionCard(
        'plant-b',
        'Floor B - Bilin',
        '/app/live-data?view=data&plant=plant-b',
        'Bilin, Mon State / radial and motorcycle tyres. Keep values separate unless the record is tagged shared.',
      ),
      {
        label: 'Head office / shared',
        value: 'Review',
        numericValue: countByNeedle(['ceo', 'head office', 'finance', 'admin', 'shared', 'showroom']),
        detail: 'Finance, supply chain, showroom, admin, and owner data become filtered work or dashboard numbers.',
        route: canSeeRawComms ? '/app/email' : '/app/action-board',
      },
    ]
  }, [canSeeRawComms, operatingMetrics?.lanes, operatingMetrics?.top_rows, productionBySize, sourceRecords?.by_plant, workbookMetricValues])
  const plantScopeDisplayCards = useMemo(() => {
    const brainScopes = (companyBrainGraph?.plant_scopes ?? [])
      .filter((scope) => scope?.id && scope?.label)
      .slice(0, 3)
      .map((scope) => ({
        id: String(scope.id || ''),
        label: String(scope.label || ''),
        site: String(scope.site || ''),
        value: String(scope.value || compactNumber(scope.count || 0)),
        detail: publicDataText(scope.detail, 'Plant operating scope.'),
        route: String(scope.route || `/app/live-data?view=kpi&plant=${scope.id || 'all'}`),
      }))
    if (brainScopes.length) return brainScopes
    return plantSplitCards.map((card) => ({
      id: card.label.toLowerCase().includes('Floor A')
        ? 'plant-a'
        : card.label.toLowerCase().includes('Floor B')
          ? 'plant-b'
          : 'shared',
      label: card.label,
      site: card.label.toLowerCase().includes('Floor A')
        ? 'Yangon / Shwe Pyi Thar'
        : card.label.toLowerCase().includes('Floor B')
          ? 'Bilin / Mon State'
          : 'Head office / shared',
      value: card.value,
      detail: publicDataText(card.detail, 'Plant operating scope.'),
      route: card.route,
    }))
  }, [companyBrainGraph?.plant_scopes, plantSplitCards])
  const visiblePlantScopeDisplayCards = useMemo(() => {
    if (selectedPlantScope === 'all') return plantScopeDisplayCards
    return plantScopeDisplayCards.filter((scope) => scope.id === selectedPlantScope)
  }, [plantScopeDisplayCards, selectedPlantScope])
  const dataMapNodes = useMemo(() => {
    const plantA = plantSplitCards.find((card) => card.label.includes('Floor A'))
    const plantB = plantSplitCards.find((card) => card.label.includes('Floor B'))
    const shared = plantSplitCards.find((card) => card.label.includes('Head office'))
    return [
      {
        id: 'plant-a',
        title: 'Floor A',
        subtitle: 'Yangon / Shwe Pyi Thar',
        value: plantA?.value ?? '0',
        route: '/app/live-data?view=data&plant=plant-a',
        tone: 'primary',
      },
      {
        id: 'production',
        title: 'Production',
        subtitle: 'Output, WIP, rejects, size mix',
        value: scopedProductionTotal > 0 ? `${ytfCompactNumber(scopedProductionTotal)} pcs` : 'Needs entry',
        route: '/app/live-data?view=kpi&lane=production',
        tone: 'strong',
      },
      {
        id: 'quality',
        title: 'QC / Quality',
        subtitle: 'Claims, holds, defects, checks',
        value: scopedClaimTotal > 0 ? `${ytfCompactNumber(scopedClaimTotal)} pcs` : 'Needs entry',
        route: '/app/live-data?view=kpi&lane=quality',
        tone: 'warn',
      },
      {
        id: 'maintenance',
        title: 'Maintenance',
        subtitle: 'Downtime, utility, spares',
        value: 'Review',
        route: '/app/live-data?view=kpi&lane=maintenance',
        tone: 'strong',
      },
      {
        id: 'sales',
        title: 'Sales / Inventory',
        subtitle: 'Stock, showroom, dealer signals',
        value: scopedStockTotal > 0 ? `${ytfCompactNumber(scopedStockTotal)} pcs` : 'Needs entry',
        route: '/app/live-data?view=kpi&lane=sales_inventory',
        tone: 'soft',
      },
      {
        id: 'finance',
        title: 'Admin / Finance',
        subtitle: 'Costing, PO, cash, planning',
        value: scopedMaterialTotalTon > 0 ? `${ytfCompactNumber(scopedMaterialTotalTon)} tons` : 'Review',
        route: '/app/live-data?view=data&domain=finance',
        tone: 'soft',
      },
      {
        id: 'plant-b',
        title: 'Floor B',
        subtitle: 'Bilin / radial and motorcycle',
        value: plantB?.value ?? '0',
        route: '/app/live-data?view=data&plant=plant-b',
        tone: 'muted',
      },
      {
        id: 'shared',
        title: 'Shared company',
        subtitle: 'Head office, CEO, showroom',
        value: shared?.value ?? '0',
        route: '/app/live-data?view=data&plant=shared',
        tone: 'muted',
      },
    ]
  }, [plantSplitCards, scopedClaimTotal, scopedMaterialTotalTon, scopedProductionTotal, scopedStockTotal])
  const roleSafeMetricCards = roleDataView.kpis.slice(0, 4).map((metric) => {
    const label = publicDataText(metric.label, 'Factory metric')
    const detail = publicDataText(metric.detail, 'Operating signal.')
    return {
      ...metric,
      label,
      detail,
      route: safeYtfMetricRoute(metric.route),
      wcm: ytfWcmMetricLens(label, detail).label,
    }
  })
  const candidateMetricRows = useMemo(
    () => {
      if (!canRunFullRefresh) return []
      return (
      candidateMetrics
        .filter((metric) => metric.metric_name && String(metric.status || '').toLowerCase() === 'candidate')
        .slice(0, 8)
      )
    },
    [candidateMetrics, canRunFullRefresh],
  )
  const savedMetricRows = (latestMetrics.length ? latestMetrics : officialKpis).slice(0, 8)
  const visibleLiveDataViews = useMemo(
    () =>
      LIVE_DATA_VIEWS.filter((view) => {
        if (view.id === 'kpi') return true
        if (view.id === 'actions') return canSeeTeamWorkView
        return false
      }),
    [canSeeTeamWorkView],
  )
  useEffect(() => {
    const requestedView = searchParams.get('view')
    const safeRequestedView = isLiveDataView(requestedView) ? requestedView : null
    if (safeRequestedView && visibleLiveDataViews.some((view) => view.id === safeRequestedView)) {
      if (activeView !== safeRequestedView) setActiveView(safeRequestedView)
      return
    }
    if (safeRequestedView && !sessionPayload) return
    if (!visibleLiveDataViews.some((view) => view.id === activeView)) {
      const fallbackView = visibleLiveDataViews[0]?.id ?? 'kpi'
      setActiveView(fallbackView)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('view', fallbackView)
      if (selectedPlantScope !== 'all') nextParams.set('plant', selectedPlantScope)
      setSearchParams(nextParams)
    }
  }, [activeView, searchParams, selectedPlantScope, sessionPayload, setSearchParams, visibleLiveDataViews])
  const showDataNarrative = false
  const productionSignalCard: YtfMetricDisplayCard | null = selectedProductionSignal
    ? {
        label: selectedProductionSignal.unit === 'kg' ? 'Production weight' : 'Production',
        value: formatPlantMetricValue(selectedProductionSignal.value, selectedProductionSignal.unit),
        detail: selectedProductionSignal.detail || `${selectedPlantLabel} production.`,
        source: selectedPlantLabel,
        route: '/app/live-data?view=kpi',
        wcm: 'Production control',
        wcmAction: 'Review output by Floor And size',
      }
    : null
  const productionCloseCard: YtfMetricDisplayCard | null = visibleProductionConfirmRows.length
    ? {
        label: 'Production close',
        value: `${ytfCompactNumber(visibleProductionConfirmRows.length)} rows`,
        detail: `${selectedPlantLabel}: confirm ${ytfCompactNumber(productionConfirmTotal)} pcs before using as official output.`,
        source: selectedPlantLabel,
        route: `/app/live-data?view=kpi&plant=${selectedPlantScope}`,
        wcm: 'Daily close',
        wcmAction: 'Confirm by tyre size',
      }
    : null
  const scopeSafeDetail = (value: unknown, fallback: string) => {
    const detail = publicDataText(typeof value === 'string' ? value : String(value ?? ''), fallback)
    if (selectedPlantScope === 'all') return detail
    return detail
      .replace(/\bFloor A\s*(?:and|&|\+|\/)\s*Floor B\b/gi, selectedPlantLabel)
      .replace(/\bFloor A,\s*Floor B,\s*/gi, '')
      .replace(/\bFloor A,\s*Floor B\b/gi, selectedPlantLabel)
      .replace(/\bboth plants\b/gi, selectedPlantLabel)
      .replace(/\bother plant\b/gi, 'this plant')
  }
  const sizeInsightCards: YtfMetricDisplayCard[] = [
    productionCloseCard || ytfProductionMetricCard(scopedProductionBySize[0]) || productionSignalCard,
    ytfQualityMetricCard(scopedQualityClaimsBySize[0]),
    ytfStockMetricCard(scopedStockBySize[0]),
    ytfProcurementMetricCard(scopedProcurementBySize[0]) || ytfRawMaterialMetricCard(scopedRawMaterialOrders[0]),
  ].filter(Boolean).map((card) => ({ ...(card as YtfMetricDisplayCard), route: `/app/live-data?view=kpi&plant=${selectedPlantScope}` })) as YtfMetricDisplayCard[]
  const operatingHeroCards = sizeInsightCards.length
    ? sizeInsightCards.slice(0, 4).map((card) => ({
      label: card.label,
      value: card.value,
      detail: scopeSafeDetail(card.detail, 'Operating signal.'),
      routeView: 'kpi' as LiveDataView,
      }))
    : operatingStoryCards.length
    ? operatingStoryCards.slice(0, 4).map((card) => ({
        label: normalizeStoryCardLabel(card.label),
        value: card.value || 'Review',
        detail: scopeSafeDetail(card.interpretation || card.detail, 'Extracted operations signal from Factory Client source data.'),
        routeView: storyCardView(card.view, 'kpi'),
      }))
    : liveDataLoading
    ? [
        {
          label: 'Production',
          value: 'Checking',
          detail: 'Reading latest production, quality, stock, and supplier values now.',
          routeView: 'kpi' as LiveDataView,
        },
      ]
    : [
        {
          label: 'Production',
          value: 'Needs entry',
          detail: 'Add daily output by plant, shift, and tyre size.',
          routeView: 'kpi' as LiveDataView,
        },
        {
          label: 'Quality / claims',
          value: 'Needs entry',
          detail: 'Add claim, reject, hold, or abnormality 5W1H.',
          routeView: 'kpi' as LiveDataView,
        },
        {
          label: 'Stock movement',
          value: 'Needs entry',
          detail: 'Add receipt, issue, closing stock, or dispatch close.',
          routeView: 'kpi' as LiveDataView,
        },
        {
          label: 'Supplier / cost',
          value: 'Needs entry',
          detail: 'Add raw material receipt, supplier order, or purchase close.',
          routeView: 'kpi' as LiveDataView,
        },
      ]
  const liveOverviewCards = [
    ...operatingHeroCards.slice(0, 4).map((card) => ({
      label: card.label,
      value: card.value,
      detail: publicDataText(card.detail, 'Operating signal.'),
      route: `/app/live-data?view=${card.routeView}`,
      view: card.routeView,
    })),
    ...(canRunFullRefresh
      ? [
          {
            label: 'Daily close',
            value: 'Open',
            detail: 'Review missing entries and complete today before shift handoff.',
            route: '/app/daily-entry',
            view: 'kpi' as LiveDataView,
          },
        ]
      : []),
    ...(canSeeRawComms
      ? [
          {
            label: 'Email/comms',
            value: `${commReady}/${commTotal || 0}`,
            detail: `${compactNumber(gmailQueryProfiles.length || gmail?.summary?.query_profile_count || 0)} Gmail filters; ${compactNumber(gmailSavedCount)} routed tasks.`,
            route: '/app/live-data?view=comms',
            view: 'comms' as LiveDataView,
          },
        ]
      : []),
  ]
  const dashboardInsightCards = sizeInsightCards.length
    ? sizeInsightCards.slice(0, 5).map((card, index) => ({
        label: card.label,
        value: card.value,
        detail: publicDataText(card.detail, 'Operating signal.'),
        progress: Math.max(12, 88 - index * 12),
        routeView: 'kpi' as LiveDataView,
      }))
    : operatingStoryCards.length
    ? operatingStoryCards.slice(0, 5).map((card) => ({
        label: normalizeStoryCardLabel(card.label),
        value: card.value || 'Review',
        detail: publicDataText(card.detail || card.interpretation, 'Extracted and interpreted from Factory Client operating records.'),
        progress: Math.max(8, Math.min(100, Number(card.progress || 0) || 24)),
        routeView: storyCardView(card.view, 'kpi'),
      }))
    : liveDataLoading
    ? [
        {
          label: 'Production',
          value: 'Checking',
          detail: 'Reading latest production, quality, stock, and supplier values now.',
          progress: 24,
          routeView: 'kpi' as LiveDataView,
        },
      ]
    : [
        {
          label: 'Production',
          value: 'Needs entry',
          detail: 'Add daily output by plant, shift, and tyre size.',
          progress: 20,
          routeView: 'kpi' as LiveDataView,
        },
        {
          label: 'Quality / claims',
          value: 'Needs entry',
          detail: 'Add claim, reject, hold, or abnormality 5W1H.',
          progress: 20,
          routeView: 'kpi' as LiveDataView,
        },
        {
          label: 'Stock movement',
          value: 'Needs entry',
          detail: 'Add receipt, issue, closing stock, or dispatch close.',
          progress: 20,
          routeView: 'kpi' as LiveDataView,
        },
        {
          label: 'Daily close',
          value: 'Open',
          detail: 'Review today, add missing numbers, or upload a board photo.',
          progress: 35,
          routeView: 'kpi' as LiveDataView,
        },
      ]
  const actionGroups = [
    {
      id: 'do_now' as ActionGroupId,
      label: 'Do now',
      detail: 'Fresh changes that need a decision.',
      events: sourceEvents.filter((event) => actionGroupForEvent(event) === 'do_now'),
    },
    {
      id: 'needs_source' as ActionGroupId,
      label: 'Needs context',
      detail: 'Missing owner, meaning, or next step.',
      events: sourceEvents.filter((event) => actionGroupForEvent(event) === 'needs_source'),
    },
    {
      id: 'kpi_review' as ActionGroupId,
      label: 'Number holds',
      detail: 'Only weak or high-impact numbers held back from dashboards.',
      events: sourceEvents.filter((event) => actionGroupForEvent(event) === 'kpi_review'),
    },
    {
      id: 'maintenance' as ActionGroupId,
      label: 'Maintenance',
      detail: 'Machine, utility, downtime, and repair signals.',
      events: sourceEvents.filter((event) => actionGroupForEvent(event) === 'maintenance'),
    },
    {
      id: 'archive' as ActionGroupId,
      label: 'Archive',
      detail: 'Reference context, manuals, or old evidence.',
      events: sourceEvents.filter((event) => actionGroupForEvent(event) === 'archive'),
    },
  ]
  return (
    <div className="sm-ytf-simple-page sm-ytf-live-data-page">
      <section className="sm-ytf-hero-row sm-ytf-hero-compact">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Today</p>
          <h1>{selectedPlantLabel} operations</h1>
          <p>Production, quality, stock, sales, and supplier values.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span className="sm-status-pill">Production</span>
          <span className="sm-status-pill">Quality</span>
          <span className="sm-status-pill">Stock</span>
          <span className="sm-status-pill">{compactDateTime(operationsUpdatedAt)}</span>
        </div>
      </section>

      {error ? <section className="sm-ytf-alert">{error}</section> : null}

      <section className="sm-ytf-metric-strip is-five" aria-label="Factory operating summary">
        {operatingHeroCards.map((card) => (
          <button className="sm-ytf-live-stat" key={card.label} onClick={() => changeView(card.routeView)} type="button">
            <span>{card.label}</span>
            <strong>{publicMetricValue(card.value, 'Review')}</strong>
            <small>{publicDataText(card.detail, 'Operating signal.')}</small>
          </button>
        ))}
      </section>

      {visibleProductionConfirmRows.length ? (
        <section className="sm-ytf-production-confirm-strip" aria-label="Production close requiring manager confirmation">
          <span>Confirm close</span>
          {visibleProductionConfirmRows.slice(0, 3).map((row) => {
            const quantity = productionRowQuantity(row)
            const rowKey = productionConfirmationKey(row)
            const isConfirming = productionConfirmingKey === rowKey
            return (
              <button
                className="sm-ytf-production-confirm-card"
                disabled={Boolean(productionConfirmingKey)}
                key={`top-production-confirm-${rowKey}`}
                onClick={() => void confirmPendingProduction(row)}
                type="button"
              >
                <strong>{row.size || 'Unknown size'}</strong>
                <em>{quantity > 0 ? `${ytfCompactNumber(quantity)} pcs` : 'Confirm'}</em>
                <small>{[row.plant, row.source?.date_context || row.updated_at || ''].filter(Boolean).join(' / ')}</small>
                <span>{isConfirming ? 'Saving...' : 'Confirm'}</span>
              </button>
            )
          })}
          <Link className="sm-ytf-production-confirm-card" to="/app/daily-entry?mode=daily_routine">
            <strong>Add missing output</strong>
            <em>Entry</em>
            <small>Use when the close is not on the board.</small>
            <span>Add</span>
          </Link>
        </section>
      ) : null}

      {erpLoopVisible ? (
        <section className="sm-ytf-panel sm-ytf-erp-loop" aria-label="Factory data flow">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Data flow</p>
              <h2>Inputs become numbers and team work.</h2>
              <p>{publicDataText(erpLoop?.plain_summary, 'Board photos, manager reports, and messages become useful factory records.')}</p>
            </div>
            <span className="sm-ytf-inline-value">
              {cleanErpStatus(erpLoop?.status)} {erpLoop?.score ? `${Math.round(Number(erpLoop.score))}/100` : ''}
            </span>
          </div>
          <div className="sm-ytf-erp-flow-grid">
            {erpInputChannels.map((channel) => (
              <Link className="sm-ytf-erp-flow-card" key={channel.id || channel.label} to={safeYtfMetricRoute(channel.route || '/app/live-data?view=kpi')}>
                <span>{channel.label || 'Input'}</span>
                <strong>{compactNumber(Number(channel.count || 0))}</strong>
                <small>{channel.output || cleanErpStatus(channel.status)}</small>
              </Link>
            ))}
          </div>
          <div className="sm-ytf-erp-coverage-grid">
            {erpCoverageRows.map((row) => (
              <Link className="sm-ytf-erp-coverage-card" key={row.id || row.label} to={safeYtfMetricRoute(row.route || '/app/live-data?view=kpi')}>
                <span>
                  <strong>{row.label || 'Factory area'}</strong>
                  <small>{row.current || 'Current data is being organized.'}</small>
                </span>
                <em>{cleanErpStatus(row.status)} · {compactNumber(Number(row.count || 0))}</em>
              </Link>
            ))}
          </div>
          {canRunFullRefresh ? (
            <div className="sm-ytf-erp-gap-row" aria-label="Enterprise gaps">
              {erpGapRows.map((gap) => (
                <article key={gap.id || gap.label}>
                  <strong>{gap.label}</strong>
                  <small>{gap.detail}</small>
                </article>
              ))}
              <article>
                <strong>Database learning</strong>
                <small>
                    {compactNumber(Number(erpLearning.source_records || 0))} records / {compactNumber(Number(erpLearning.workbook_values || 0))} values / {compactNumber(Number(erpLearning.knowledge_chunks || 0))} context rows
                </small>
              </article>
            </div>
          ) : null}
        </section>
      ) : null}

      {showDataNarrative && operatingStory ? (
        <section className="sm-ytf-panel sm-ytf-operating-brief" aria-label="Management operating brief">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Management brief</p>
            <h2>{operatingStory.management_brief}</h2>
          </div>
          <div className="sm-ytf-compact-list">
            {(operatingStoryActions.length ? operatingStoryActions : ['Use the highest-value extracted KPI rows, then add today&apos;s missing output, reject, downtime, WIP, and stock numbers.'])
              .slice(0, 3)
              .map((action) => (
                <div className="sm-ytf-list-row" key={action}>
                  <span>
                    <strong>{action}</strong>
                <small>Action from Factory Client operating context.</small>
                  </span>
                  <em>Next</em>
                </div>
              ))}
            {operatingStoryRoles.slice(0, 2).map((role) => (
              <div className="sm-ytf-list-row" key={role.role || role.brief}>
                <span>
                  <strong>{role.role || 'Role brief'}</strong>
                  <small>{role.brief || 'Role-specific insight from the operating data.'}</small>
                </span>
                <em>Role</em>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showDataNarrative && factorySystem ? (
        <section className="sm-ytf-panel sm-ytf-factory-now" aria-label="Whole factory status">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Factory now</p>
              <h2>{factorySystem.overview?.title || 'Whole-factory operating view'}</h2>
              <p>{factorySystem.overview?.summary || 'Production, quality, stock, supplier, maintenance, planning, and admin lanes are grouped from company records.'}</p>
            </div>
            <Link className="sm-button-secondary" to="/app/daily-entry?mode=daily_routine">
              Add today
            </Link>
          </div>
          <div className="sm-ytf-factory-grid">
            {factoryNowLanes.slice(0, 8).map((lane) => {
              const sourceRows = Number(lane.source_rows || 0)
              const sourceBooks = Number(lane.workbook_count || 0)
              const coverageLabel =
                sourceRows > 0 && sourceBooks > 0
                  ? `${compactNumber(sourceRows)} source rows / ${compactNumber(sourceBooks)} books`
                  : sourceRows > 0
                    ? `${compactNumber(sourceRows)} source rows`
                    : sourceBooks > 0
                      ? `${compactNumber(sourceBooks)} source books`
                      : ''

              return (
                <Link className="sm-ytf-factory-card" key={lane.id || lane.label} to={lane.route || '/app/live-data?view=kpi'}>
                  <span>
                    <strong>{lane.label || 'Factory lane'}</strong>
                  <small>{publicDataText(lane.detail || lane.source, 'Operating signal.')}</small>
                  </span>
                  <em>{lane.value || 'Review'}</em>
                  <small>{lane.action || 'Review source, confirm value, and route next action.'}</small>
                  {coverageLabel ? <i>{coverageLabel}</i> : null}
                </Link>
              )
            })}
          </div>
          {canRunFullRefresh ? (
            <>
              <div className="sm-ytf-structure-row">
                <article className="sm-ytf-structure-card">
                  <span>Source tables</span>
                  <strong>{agentKeyEscalations ? `${compactNumber(agentKeyEscalations)} need check` : 'Ready'}</strong>
                  <small>
                    {compactNumber(agentAutoHandledTables)} checked / {compactNumber(agentDashboardSafeTables)} usable / {compactNumber(workbookStructure?.detected_tables)} tables read
                  </small>
                  <em>{workbookStructure?.action || 'Tables are checked before weak totals reach dashboards.'}</em>
                </article>
                <div className="sm-ytf-factory-gap-list">
                  {(factoryOperatingGaps.length ? factoryOperatingGaps : [{ id: 'daily-close', label: 'Daily close', action: 'Add output, rejects, downtime, stock movement, and abnormal notes.', route: '/app/daily-entry?mode=daily_routine' }])
                    .slice(0, 3)
                    .map((gap) => (
                      <Link className="sm-ytf-gap-pill" key={gap.id || gap.label} to={gap.route || '/app/daily-entry'}>
                        <strong>{gap.label || 'Operating gap'}</strong>
                        <small>{gap.action || 'Confirm source and assign owner.'}</small>
                      </Link>
                    ))}
                </div>
              </div>
              {agentTableRows.length ? (
                <div className="sm-ytf-agent-trust-list">
                  {(agentEscalationPreview.length ? agentEscalationPreview : agentHandledPreview).map((row) => (
                    <a className={`sm-ytf-agent-trust-row ${row.status === 'key_escalation' ? 'needs-attention' : ''}`} href={row.source_url || '#'} key={row.review_id || `${row.workbook}-${row.sheet_name}-${row.table_id}`} rel="noreferrer" target={row.source_url ? '_blank' : undefined}>
                      <span>
                        <strong>{agentTrustRowTitle(row)}</strong>
                        <small>{agentTrustRowMeta(row)}</small>
                      </span>
                      <em>{row.status === 'key_escalation' ? 'Needs check' : 'Ready'}</em>
                    </a>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {operatingSizeBreakdowns ? (
        <section className="sm-ytf-panel sm-ytf-size-intel" aria-label="Tyre size operating intelligence">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">By size</p>
              <h2>Sizes needing work</h2>
              <p>Output, claims, stock, sales, and buying by tyre size.</p>
            </div>
            <Link className="sm-button-primary" to="/app/daily-entry?mode=daily_routine">
              Add today
            </Link>
          </div>
          {selectedSizeToken ? (
            <p className="sm-ytf-live-answer">
              Size focus: <strong>{selectedSizeRaw || 'selected size'}</strong>. <Link to={clearSizeRoute}>Clear</Link>
            </p>
          ) : null}
          {productionConfirmMessage ? <p className="sm-ytf-live-answer">{productionConfirmMessage}</p> : null}
          {visibleSizeAttention.length ? (
            <div className="sm-ytf-attention-list" aria-label="Tyre size attention list">
              {visibleSizeAttention.slice(0, 6).map((row) => {
                const score = Number(row.attention_score || 0)
                const barWidth = Math.max(8, Math.min(100, (score / maxSizeAttentionScore) * 100))
                const productionQty = Number(row.production_qty || 0)
                const claimQty = Number(row.claim_qty || 0)
                const stockQty = Number(row.stock_movement_qty || 0)
                const attentionFacts = [
                  productionQty > 0 ? `${compactNumber(productionQty)} pcs output` : '',
                  claimQty > 0 ? `${compactNumber(claimQty)} claims` : '',
                  stockQty > 0 ? `${compactNumber(stockQty)} stock` : '',
                ].filter(Boolean)
                const attentionSignals = (row.signals ?? []).map((signal) => publicDataText(signal, '')).filter(Boolean)
                const route = Number(row.claim_qty || 0)
                  ? '/app/live-data?view=kpi'
                  : Number(row.stock_movement_qty || 0)
                    ? '/app/daily-entry?mode=whiteboard_snapshot&section=Showroom%20stock%20board'
                    : Number(row.procurement_amount || 0)
                      ? '/app/live-data?view=kpi'
                      : '/app/daily-entry?mode=daily_routine'
                return (
                  <Link className="sm-ytf-attention-row" key={`attention-${row.size}`} to={route}>
                    <span>
                      <strong>{row.size || 'Unknown size'}</strong>
                      <small>{row.action || 'Review the source and add missing context.'}</small>
                    </span>
                    <em>{attentionFacts.join(' / ') || 'Open detail'}</em>
                    <i aria-hidden="true">
                      <b style={{ width: `${barWidth}%` }} />
                    </i>
                    <small>
                      {(attentionSignals.length ? attentionSignals.join(' / ') : 'Needs entry')} / mix {compactNumber(row.production_mix_pct)}%
                      {row.claim_rate_per_1000 ? ` / ${compactNumber(row.claim_rate_per_1000)} claims per 1k` : ''}
                    </small>
                  </Link>
                )
              })}
            </div>
          ) : null}
          <div className="sm-ytf-size-grid">
            {showProductionLaneDetail ? (
              <article>
                <span>Production by size</span>
                {visibleProductionBySize.length ? (
                  visibleProductionBySize.slice(0, 5).map((row) => {
                    const outputQty = Number(row.output_qty || 0)
                    const outputWeight = Number(row.weight_kg || 0)
                    const needsConfirmation = productionRowNeedsConfirmation(row)
                    const rowKey = productionConfirmationKey(row)
                    const isConfirming = productionConfirmingKey === rowKey
                    if (needsConfirmation) {
                      return (
                        <div className="sm-ytf-size-row sm-ytf-size-row-confirm" key={`production-confirm-${row.size}-${row.source?.date_context || row.updated_at || ''}`}>
                          <strong>{row.size || 'Unknown size'}</strong>
                          <em>{outputQty > 0 ? `${ytfCompactNumber(outputQty)} pcs` : 'Confirm'}</em>
                          <small>{[row.plant, row.source?.date_context || row.updated_at || '', 'needs manager confirm'].filter(Boolean).join(' / ')}</small>
                          <button
                            className="sm-ytf-size-row-action"
                            disabled={Boolean(productionConfirmingKey)}
                            onClick={() => void confirmPendingProduction(row)}
                            type="button"
                          >
                            {isConfirming ? 'Saving...' : 'Confirm'}
                          </button>
                        </div>
                      )
                    }
                    return (
                      <Link className="sm-ytf-size-row" key={`production-${row.size}`} to={buildKpiDrillRoute('production', String(row.size || ''))}>
                        <strong>{row.size || 'Unknown size'}</strong>
                        <em>{outputQty > 0 ? `${ytfCompactNumber(outputQty)} pcs` : 'Needs entry'}</em>
                        <small>{[ytfMetricSourceContext(row), outputWeight > 0 ? `${ytfCompactNumber(outputWeight, 1)} kg` : ''].filter(Boolean).join(' / ')}</small>
                        <small>{ytfMetricSourceLine(row)}</small>
                      </Link>
                    )
                  })
                ) : visiblePendingProductionClose.length ? (
                  visiblePendingProductionClose.slice(0, 5).map((row) => {
                    const pendingQty = Number(row.pending_qty || 0)
                    const rowKey = productionConfirmationKey(row)
                    const isConfirming = productionConfirmingKey === rowKey
                    return (
                      <div className="sm-ytf-size-row sm-ytf-size-row-confirm" key={`pending-production-${row.size}-${row.updated_at}`}>
                        <strong>{row.size || 'Unknown size'}</strong>
                        <em>{pendingQty > 0 ? `${ytfCompactNumber(pendingQty)} pcs` : 'Confirm'}</em>
                        <small>{[row.plant, row.updated_at ? compactDateTime(row.updated_at) : '', 'needs manager confirm'].filter(Boolean).join(' / ')}</small>
                        <button
                          className="sm-ytf-size-row-action"
                          disabled={Boolean(productionConfirmingKey)}
                          onClick={() => void confirmPendingProduction(row)}
                          type="button"
                        >
                          {isConfirming ? 'Saving...' : 'Confirm'}
                        </button>
                      </div>
                    )
                  })
                ) : (
                  <Link className="sm-ytf-size-row is-empty" to="/app/daily-entry?mode=daily_routine">
                    <strong>Add production by size</strong>
                    <em>Entry</em>
                    <small>Capture output, shift, and tyre size.</small>
                  </Link>
                )}
              </article>
            ) : null}
            {showQualityLaneDetail ? (
              <article>
                <span>Claims by size</span>
                {visibleQualityClaimsBySize.length ? (
                  visibleQualityClaimsBySize.slice(0, 5).map((row) => {
                    const claimQty = Number(row.claim_qty || 0)
                    return (
                      <Link className="sm-ytf-size-row" key={`claims-${row.size}`} to={buildKpiDrillRoute('quality', String(row.size || ''))}>
                        <strong>{row.size || 'Unknown size'}</strong>
                        <em>{claimQty > 0 ? `${ytfCompactNumber(claimQty)} claims` : 'Needs entry'}</em>
                        <small>{ytfMetricSourceContext(row)}{row.claim_amount ? ` / ${ytfMoneyText(row.claim_amount)}` : ''}</small>
                        <small>{ytfMetricSourceLine(row)}</small>
                      </Link>
                    )
                  })
                ) : (
                  <Link className="sm-ytf-size-row is-empty" to="/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection">
                    <strong>Add claim by size</strong>
                    <em>Entry</em>
                    <small>Use 5W1H for abnormal quality issues.</small>
                  </Link>
                )}
              </article>
            ) : null}
            {showStockLaneDetail ? (
              <article>
                <span>Stock by size</span>
                {visibleStockBySize.length ? (
                  visibleStockBySize.slice(0, 5).map((row) => {
                    const stockQty = Number(row.received_qty || row.issued_qty || row.movement_qty || row.closing_qty || 0)
                    const movementParts = [
                      Number(row.received_qty || 0) > 0 ? `R ${ytfCompactNumber(row.received_qty)}` : '',
                      Number(row.issued_qty || 0) > 0 ? `I ${ytfCompactNumber(row.issued_qty)}` : '',
                      Number(row.closing_qty || 0) > 0 ? `C ${ytfCompactNumber(row.closing_qty)}` : '',
                    ].filter(Boolean)
                    return (
                      <Link className="sm-ytf-size-row" key={`stock-${row.size}`} to={buildKpiDrillRoute('sales_inventory', String(row.size || ''))}>
                        <strong>{row.size || 'Unknown size'}</strong>
                        <em>{stockQty > 0 ? `${ytfCompactNumber(stockQty)} pcs` : 'Open row'}</em>
                        <small>
                          {[...movementParts, ytfMetricSourceContext(row)].filter(Boolean).join(' / ')}
                        </small>
                        <small>{ytfMetricSourceLine(row)}</small>
                      </Link>
                    )
                  })
                ) : (
                  <Link className="sm-ytf-size-row is-empty" to="/app/daily-entry?mode=whiteboard_snapshot&section=Stock%20board">
                    <strong>Add stock close by size</strong>
                    <em>Photo</em>
                    <small>Upload stock board or enter receipt, issue, closing.</small>
                  </Link>
                )}
              </article>
            ) : null}
            {showSupplierLaneDetail ? (
              <article>
                <span>Material / buying</span>
                {visibleProcurementBySize.slice(0, 3).map((row) => {
                  const pcs = Number(row.pcs || 0)
                  return (
                    <Link className="sm-ytf-size-row" key={`buying-${row.size}`} to={buildKpiDrillRoute('finance_procurement', String(row.size || ''))}>
                      <strong>{row.size || 'Procurement'}</strong>
                      <em>{pcs > 0 ? `${ytfCompactNumber(pcs)} pcs` : 'Needs qty'}</em>
                      <small>{ytfMoneyText(row.amount)} / {ytfMetricSourceContext(row)}</small>
                      <small>{ytfMetricSourceLine(row)}</small>
                    </Link>
                  )
                })}
                {!visibleProcurementBySize.length
                  ? visibleRawMaterialOrders.slice(0, 3).map((row) => (
                      <Link className="sm-ytf-size-row" key={`material-${row.material}-${row.source?.date_context || row.source?.period_label || ''}`} to={buildKpiDrillRoute('finance_procurement', String(row.material || ''))}>
                        <strong>{row.material || 'Raw material'}</strong>
                        <em>{Number(row.order_ton || 0) > 0 ? `${ytfCompactNumber(row.order_ton, 1)} ton` : ytfMoneyText(row.amount_mmk)}</em>
                        <small>{[ytfMoneyText(row.amount_mmk), ytfMetricSourceContext(row)].filter(Boolean).join(' / ')}</small>
                        <small>{ytfMetricSourceLine(row)}</small>
                      </Link>
                    ))
                  : null}
                {energyByPlant.slice(0, 2).map((row) => (
                  <Link className="sm-ytf-size-row" key={`energy-${row.plant}`} to={buildKpiDrillRoute('finance_procurement', String(row.plant || ''))}>
                    <strong>{row.plant || 'Energy'}</strong>
                    <em>MMK {compactNumber(row.energy_cost)}</em>
                    <small>{ytfMetricSourceLine(row) || 'Energy / utility record'}</small>
                  </Link>
                ))}
                {!visibleProcurementBySize.length && !visibleRawMaterialOrders.length && !energyByPlant.length ? (
                  <Link className="sm-ytf-size-row is-empty" to="/app/daily-entry?mode=daily_routine&section=Supplier%20%2F%20raw%20material">
                    <strong>Add material close</strong>
                    <em>Entry</em>
                    <small>Record supplier order, receipt, price, and material status.</small>
                  </Link>
                ) : null}
              </article>
            ) : null}
          </div>
          <div className="sm-ytf-gap-strip">
            {(missingOperatingInputs.length ? missingOperatingInputs : []).slice(0, 4).map((item) => (
              <Link className="sm-ytf-gap-pill" key={item.id || item.label} to={item.route || '/app/daily-entry'}>
                <strong>{item.label || 'Missing input'}</strong>
                <small>{item.action || item.why || 'Add from phone entry.'}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {showDataNarrative ? <section className="sm-ytf-insight-rail" aria-label="Dashboard KPI story">
        {dashboardInsightCards.map((card) => (
          <button className="sm-ytf-insight-card" key={card.label} onClick={() => changeView(card.routeView)} type="button">
            <span>
              <strong>{card.label}</strong>
              <small>{publicDataText(card.detail, 'Operating signal.')}</small>
            </span>
            <em>{publicMetricValue(card.value, 'Review')}</em>
            <i aria-hidden="true">
              <b style={{ width: `${Math.max(6, card.progress)}%` }} />
            </i>
          </button>
        ))}
      </section> : null}

      <section className="sm-ytf-panel">
        <div className="sm-ytf-live-tabs" aria-label="Live data sections">
          {visibleLiveDataViews.map((view) => (
            <button className={activeView === view.id ? 'is-active' : ''} key={view.id} onClick={() => changeView(view.id)} type="button">
              <strong>{view.label}</strong>
              <small>{view.hint}</small>
            </button>
          ))}
        </div>
      </section>

      {showDataNarrative ? <section className="sm-ytf-action-grid" aria-label="Live data overview">
        {liveOverviewCards.map((card) => (
          <button
            className={`sm-ytf-action-tile text-left ${activeView === card.view ? 'is-primary' : ''}`.trim()}
            key={card.label}
            onClick={() => {
              if (card.route.startsWith('/app/live-data')) {
                changeView(card.view)
              } else {
                window.location.assign(card.route)
              }
            }}
            type="button"
          >
            <span>
              <strong>{card.label}</strong>
              <small>{publicDataText(card.detail, 'Operating signal.')}</small>
            </span>
            <span className="sm-ytf-action-arrow">{publicMetricValue(card.value, 'Review')}</span>
          </button>
        ))}
      </section> : null}

      {activeView === 'operate' ? (
        <section className="sm-ytf-live-grid" aria-label="Plant dashboard">
          <article className="sm-ytf-panel sm-ytf-live-wide sm-ytf-data-map-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Data map</p>
                <h2>Tap a factory area.</h2>
                <p>Business records are organized into plant, department, and metric lanes.</p>
              </div>
              <Link className="sm-button-primary" to="/app/daily-entry">
                Add today
              </Link>
            </div>
            <div className="sm-ytf-data-map" aria-label="Factory Client data map">
              {dataMapNodes.map((node) => (
                <Link className={`sm-ytf-data-node is-${node.tone}`} key={node.id} to={node.route}>
                  <span>{node.title}</span>
                  <strong>{publicMetricValue(node.value, 'Open')}</strong>
                  <small>{node.subtitle}</small>
                </Link>
              ))}
            </div>
            <div className="sm-ytf-map-legend">
                <span>Original documents stay private</span>
              <span>A, B, and shared A+B rows stay marked</span>
              <span>Tap any node for numbers or detail rows</span>
            </div>
          </article>

          <article className="sm-ytf-panel sm-ytf-live-wide">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Data use</p>
                <h2>What is safe to show.</h2>
              <p>Factory records are grouped into live numbers, reference documents, master data, and history before dashboards use them.</p>
              </div>
              <span className="sm-status-pill">{sourceBehaviorMap?.status || 'mapping'}</span>
            </div>
            <div className="sm-ytf-live-feature-grid">
              {sourceBehaviorCards.map((card) => (
                <div key={card.label}>
                  <span>{card.label}</span>
                  <strong>{publicMetricValue(card.value, 'Review')}</strong>
                  <small>{publicDataText(card.detail, 'Factory data group.')}</small>
                </div>
              ))}
            </div>
            <div className="sm-ytf-compact-list mt-3">
              {sourceBehaviorFolderRows.slice(0, 4).map((folder) => (
                <Link className="sm-ytf-list-row" key={folder.folder} to="/app/live-data?view=data">
                  <span>
                    <strong>{compactSourceName(folder.folder)}</strong>
                    <small>
                      {compactNumber(countBucket(folder.by_behavior, 'operational_dataset'))} live numbers / {compactNumber(countBucket(folder.by_behavior, 'context_reference'))} reference / {topBucketLabel(folder.extraction_modes, 'metadata')}
                    </small>
                    <small>{topBucketLabel(folder.by_plant, 'shared')} / {topBucketLabel(folder.by_domain, 'general')} / updated {compactDateTime(folder.latest_modified_time)}</small>
                  </span>
                  <em>{compactNumber(folder.record_count)}</em>
                </Link>
              ))}
              {!sourceBehaviorFolderRows.length ? <p className="sm-ytf-empty">Plant data is loading.</p> : null}
            </div>
          </article>

          <article className="sm-ytf-panel sm-ytf-live-wide">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Extracted numbers</p>
                <h2>Numbers from Factory Client records.</h2>
                <p>Structured values by plant, period, and section. Use Entry for today&apos;s missing numbers.</p>
                {workbookGeneratedAt ? <small>Last extraction: {compactDateTime(workbookGeneratedAt)}</small> : null}
              </div>
              <div className="sm-ytf-inline-actions">
                <Link className="sm-button-secondary" to="/app/live-data?view=kpi">
                  All numbers
                </Link>
                <Link className="sm-button-primary" to="/app/daily-entry?mode=whiteboard_snapshot">
                  Add board
                </Link>
              </div>
            </div>
            <div className="sm-ytf-compact-list">
              {operatingMetricRows.length
                ? operatingMetricRows.slice(0, 5).map((metric, index) => (
                    <Link
                      className="sm-ytf-list-row"
                      key={`${metric.metric_name || 'metric'}-${metric.source || index}`}
                      to={metric.route || '/app/live-data?view=kpi'}
                    >
                      <span>
                        <strong>{ytfOperatingMetricTitle(metric)}</strong>
                        <small>{publicDataText(ytfOperatingMetricContext(metric), 'Operational context.')}</small>
                        <small>{publicDataText(ytfOperatingMetricSource(metric), 'Operational source')} / {publicDataText(ytfOperatingMetricStatus(metric), 'current')}</small>
                      </span>
                      <em>{publicMetricValue(ytfOperatingMetricValue(metric))}</em>
                    </Link>
                  ))
                : visiblePlantMetricValues.length
                  ? visiblePlantMetricValues.slice(0, 5).map((metric, index) => (
                    <Link
                      className="sm-ytf-list-row"
                      key={`${metric.metric_key || metric.metric_name || 'metric'}-${metric.row_number || index}`}
                      to="/app/live-data?view=kpi&focus=workbook_values"
                    >
                      <span>
                        <strong>{workbookMetricTitle(metric)}</strong>
                        <small>{publicDataText(workbookMetricContext(metric), 'Operational context.')}</small>
                        <small>{publicDataText(workbookMetricSource(metric), 'Operational source')} / {publicDataText(workbookMetricReviewLabel(metric), 'current')}</small>
                      </span>
                      <em>{publicMetricValue(workbookMetricValue(metric))}</em>
                    </Link>
                  ))
                : (savedMetricRows.length ? savedMetricRows : candidateMetricRows).slice(0, 5).map((metric, index) => (
                    <Link
                      className="sm-ytf-list-row"
                      key={`${metric.metric_id || metric.metric_name || 'metric-row'}-${metric.updated_at || metric.captured_at || index}`}
                      to="/app/live-data?view=kpi"
                    >
                      <span>
                        <strong>{cleanMetricDisplayTitle(metric.metric_name) || 'Metric'}</strong>
                        <small>{[metric.metric_group, metric.period_label, metric.owner].filter(Boolean).join(' / ') || 'Metric row'}</small>
                        <small>{metricSourceSummary(metric)}</small>
                      </span>
                      <em>{publicMetricValue(metricValue(metric))}</em>
                    </Link>
                  ))}
              {!operatingMetricRows.length && !visiblePlantMetricValues.length && !savedMetricRows.length && !candidateMetricRows.length ? (
                <p className="sm-ytf-empty">No plant values are ready yet. Use Entry to add today&apos;s output, rejects, downtime, WIP, OT, and stock.</p>
              ) : null}
            </div>
          </article>

          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Departments</p>
            <h2>Where data exists.</h2>
            <div className="sm-ytf-compact-list">
              {(operatingLaneCards.length ? operatingLaneCards : workbookLaneCards).slice(0, 5).map((lane) => (
                <button
                  className="sm-ytf-list-row"
                  key={'lane' in lane ? lane.lane : lane.id || lane.label}
                  onClick={() => {
                    setActiveView('kpi')
                    const nextParams = new URLSearchParams(searchParams)
                    nextParams.set('view', 'kpi')
                    if (selectedPlantScope !== 'all') nextParams.set('plant', selectedPlantScope)
                    setSearchParams(nextParams)
                  }}
                  type="button"
                >
                  <span>
                    <strong>{'lane' in lane ? lane.lane : lane.label}</strong>
                    <small>
                      {'sample' in lane
                        ? lane.sample
                          ? `${lane.sample.metric_name || 'Metric'} ${publicMetricValue(workbookMetricValue(lane.sample))}`
                          : 'No current values in this lane yet.'
                        : 'Review current values for this lane.'}
                    </small>
                  </span>
                  <em>{compactNumber(lane.count)}</em>
                </button>
              ))}
            </div>
          </article>

          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Plant split</p>
                <h2>Do not mix A and B.</h2>
              </div>
              <Link className="sm-button-secondary" to="/app/live-data?view=data">
                Records
              </Link>
            </div>
            <div className="sm-ytf-compact-list">
              {visiblePlantScopeDisplayCards.map((card) => (
                <Link className="sm-ytf-list-row" key={card.id || card.label} to={card.route}>
                  <span>
                    <strong>{card.label}</strong>
                    <small>{card.site ? `${card.site}. ` : ''}{publicDataText(card.detail, 'Plant operating scope.')}</small>
                  </span>
                  <em>{publicMetricValue(card.value, 'Review')}</em>
                </Link>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {activeView === 'database' ? (
        <section className="sm-ytf-live-grid">
          <article className="sm-ytf-panel sm-ytf-live-wide">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Saved history</p>
                <h2>What is actually saved and updating.</h2>
              <p>Original records stay private. The portal uses organized plant history for values, team work, and evidence.</p>
            </div>
            {canRunFullRefresh ? (
              <div className="sm-ytf-inline-actions">
                <button className="sm-button-secondary" disabled={fileAgentRunning} onClick={runFileAgentsNow} type="button">
                  {fileAgentRunning ? 'Updating source checks...' : 'Update source checks'}
                </button>
                <button className="sm-button-primary" disabled={refreshRunning} onClick={runFullRefreshNow} type="button">
                  {refreshRunning ? 'Updating...' : 'Update data now'}
                </button>
              </div>
            ) : (
              <Link className="sm-button-secondary" to="/app/action-board">
                Open actions
              </Link>
            )}
            </div>
            <div className="sm-ytf-live-feature-grid">
              {databaseHealthCards.map((card) => (
                <div key={card.label}>
                  <span>{card.label}</span>
                  <strong>{publicMetricValue(card.value, 'Review')}</strong>
                  <small>{publicDataText(card.detail, 'Saved operational history.')}</small>
                </div>
              ))}
            </div>
            {refreshMessage ? <p className="sm-ytf-live-answer">{refreshMessage}</p> : null}
            {fileAgentMessage ? <p className="sm-ytf-live-answer">{fileAgentMessage}</p> : null}
          </article>

          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Automation</p>
            <h2>Daily update loop.</h2>
            <div className="sm-ytf-compact-list">
              {DAILY_CLOUD_REFRESH_STEPS.map((step) => (
                <div className="sm-ytf-list-row" key={step.label}>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </span>
                  <em>{step.time}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Write model</p>
            <h2>Simple control path.</h2>
            <div className="sm-ytf-compact-list">
              {databaseWriteModel.map((item) => (
                <div className="sm-ytf-list-row" key={item.label}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{publicDataText(item.detail, 'Operational control step.')}</small>
                  </span>
                  <em>Tracked</em>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Data flow</p>
            <h2>From source to clean work.</h2>
            <div className="sm-ytf-compact-list">
              {aiNativePipelineRows.map((item) => (
                <div className="sm-ytf-list-row" key={item.label}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{publicDataText(item.detail, 'Operational source step.')}</small>
                  </span>
                  <em>Tracked</em>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Last background update</p>
            <h2>{compactDateTime(dataManagerRun?.synced_at)}</h2>
            <div className="sm-ytf-live-feature-grid">
              <div>
                <span>Metrics</span>
                <strong>{compactNumber(dataManagerSaved.enterprise_metrics ?? dataManagerSaved.metrics)}</strong>
              </div>
              <div>
                <span>Actions</span>
                <strong>{compactNumber(dataManagerSaved.workspace_tasks ?? dataManagerSaved.actions)}</strong>
              </div>
              <div>
                <span>Source checks</span>
                <strong>{compactNumber(dataManagerSaved.source_checks ?? dataManagerSaved.approvals)}</strong>
              </div>
              <div>
                <span>Quality</span>
                <strong>{compactNumber(dataManagerSaved.quality_incidents)}</strong>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {activeView === 'data' ? (
        <section className="sm-ytf-live-grid">
          <article className="sm-ytf-panel sm-ytf-live-wide sm-ytf-brain-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Factory data map</p>
                <h2>How Factory Client data connects.</h2>
                <p>Records, board photos, and daily entries become factory books, dashboards, and searchable context.</p>
              </div>
              <span className="sm-status-pill">
                {compactNumber(companyBrainBookCount)}/{compactNumber(companyBrainTotalBooks)} books
              </span>
            </div>
            <div className="sm-ytf-brain-layout">
              <div className="sm-ytf-brain-books">
                {(companyBrainBooks.length
                  ? companyBrainBooks
                  : [
                      { id: 'production', label: 'Production book', value: compactNumber(scopedProductionBySize.length), detail: 'Output, WIP, sizes, weight, and board values.', route: '/app/live-data?view=kpi&lane=production' },
                      { id: 'quality', label: 'QC book', value: compactNumber(scopedQualityClaimsBySize.length), detail: 'Claims, rejects, holds, and QC evidence.', route: '/app/live-data?view=kpi&lane=quality' },
                      { id: 'stock', label: 'Stock book', value: compactNumber(scopedStockBySize.length), detail: 'Receipt, issue, movement, and closing balance.', route: '/app/live-data?view=kpi&lane=sales_inventory' },
                    ]).map((book) => (
                  <Link className="sm-ytf-brain-book" key={book.id || book.label} to={book.route || '/app/live-data?view=kpi'}>
                    <span>{book.label}</span>
                    <strong>{book.value || compactNumber(book.count || 0)}</strong>
                    <small>{publicDataText(book.detail, 'Factory record group.')}</small>
                  </Link>
                ))}
              </div>
              <div className="sm-ytf-brain-side">
                <div className="sm-ytf-brain-stat-row">
                  <article>
                    <span>Plant values</span>
                    <strong>{compactNumber(companyBrainSummary.dashboard_values ?? actualMetricValueCount)}</strong>
                  </article>
                  <article>
                    <span>Search rows</span>
                    <strong>{compactNumber(companyBrainSummary.knowledge_chunks ?? knowledgeChunks)}</strong>
                  </article>
                  <article>
                    <span>Graph links</span>
                    <strong>{compactNumber(companyBrainEdgeCount || companyBrainNodeCount)}</strong>
                  </article>
                </div>
                <div className="sm-ytf-brain-flow" aria-label="YTF data flow">
                  {(companyBrainFlow.length
                    ? companyBrainFlow
                    : [
                        { label: 'Raw records', detail: 'Business records, board photos, manager entries, and messages.' },
                        { label: 'Factory books', detail: 'Production, QC, stock, buying, and maintenance records.' },
                        { label: 'Role dashboards', detail: 'Only the useful numbers and work appear for each role.' },
                      ]).map((step, index) => (
                    <div key={`${step.label}-${index}`}>
                      <i>{index + 1}</i>
                      <span>
                        <strong>{step.label}</strong>
                        <small>{publicDataText(step.detail, 'Factory records are prepared for role dashboards.')}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {companyBrainInsights.length ? (
              <div className="sm-ytf-brain-insights">
                {companyBrainInsights.map((insight) => (
                  <Link key={insight.id || insight.title} to={insight.route || '/app/live-data?view=kpi'}>
                    <span>{publicDataText(insight.title, 'Factory insight')}</span>
                    <strong>{insight.value}</strong>
                    <small>{publicDataText(insight.detail, 'Factory operating insight.')}</small>
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Source groups</p>
                <h2>What is feeding the books.</h2>
              </div>
              <Link className="sm-button-secondary" to="/app/data-quality">
                Quality
              </Link>
            </div>
            <div className="sm-ytf-live-bars">
              {topEntries(sourceRecords?.by_domain).map(([label, value]) => (
                <div key={label}>
                  <span>{label || 'Unknown'}</span>
                  <strong>{compactNumber(value)}</strong>
                  <i style={{ width: `${Math.max(8, Math.min(100, (Number(value) / Math.max(1, Number(sourceRecords?.count || value))) * 100))}%` }} />
                </div>
              ))}
            </div>
          </article>
          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Plant split</p>
                <h2>Where it belongs.</h2>
              </div>
              <Link className="sm-button-secondary" to="/app/live-data?view=operate">
                Open
              </Link>
            </div>
            <div className="sm-ytf-compact-list">
              {visiblePlantScopeDisplayCards.map((item) => (
                <Link className="sm-ytf-list-row" key={item.id || item.label} to={item.route}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.site ? `${item.site}. ` : ''}{publicDataText(item.detail, 'Plant operating scope.')}</small>
                  </span>
                  <em>{publicMetricValue(item.value, 'Review')}</em>
                </Link>
              ))}
            </div>
          </article>
          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Records</p>
            <h2>Useful data groups.</h2>
            <div className="sm-ytf-compact-list">
              {dataSourceCards.map((card) => (
                <Link className="sm-ytf-list-row" key={card.label} to={card.route}>
                  <span>
                    <strong>{card.label}</strong>
                    <small>{publicDataText(card.detail, 'Factory data group.')}</small>
                  </span>
                  <em>{publicMetricValue(card.value, 'Review')}</em>
                </Link>
              ))}
            </div>
          </article>
          {canBrowseSourceRecords ? (
            <article className="sm-ytf-panel sm-ytf-live-wide">
              <div className="sm-ytf-section-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Admin file browser</p>
                  <h2>Mapped files.</h2>
                </div>
                <button className="sm-button-secondary" disabled={sourceLoading} onClick={refreshSourceRecords} type="button">
                  {sourceLoading ? 'Loading' : 'Filter'}
                </button>
              </div>
              <div className="sm-ytf-live-filter-grid">
                <input
                  className="sm-ytf-input"
                  onChange={(event) => setSourceSearch(event.target.value)}
                  placeholder="Search file, folder, owner, domain..."
                  value={sourceSearch}
                />
                <select className="sm-ytf-input" onChange={(event) => setSourceDomain(event.target.value)} value={sourceDomain}>
                  <option value="">All domains</option>
                  {sourceDomainOptions.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
                <select className="sm-ytf-input" onChange={(event) => setSourcePlant(event.target.value)} value={sourcePlant}>
                  <option value="">All plants</option>
                  {sourcePlantOptions.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="sm-ytf-source-record-list">
                {sourceRecordRows.map((record) => {
                  const label = sourceRecordLabel(record)
                  const content = (
                    <>
                      <span>
                        <strong>{label}</strong>
                        <small>{sourceRecordMeta(record)} / {compactDateTime(record.modified_time || record.updated_at)}</small>
                      </span>
                      <em>{safeSourceStatus(record.kpi_readiness || record.rag_readiness || record.source_behavior)}</em>
                    </>
                  )
                  return (
                    <div className="sm-ytf-list-row" key={record.source_record_id || record.source_item_id || label}>
                      {content}
                    </div>
                  )
                })}
                {!sourceRecordRows.length ? <p className="sm-ytf-empty">No records match this filter yet.</p> : null}
              </div>
            </article>
          ) : (
            <article className="sm-ytf-panel sm-ytf-live-wide">
              <div className="sm-ytf-section-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Role-safe data</p>
                  <h2>{roleDataView.title}</h2>
                  <p>{roleDataView.subtitle}</p>
                </div>
                <Link className="sm-button-secondary" to={safeYtfMetricRoute(roleDataView.nextBestAction.route)}>
                  Open
                </Link>
              </div>
              <div className="sm-ytf-metric-strip is-compact">
                {roleSafeMetricCards.map((metric) => (
                  <Link key={metric.label} to={metric.route}>
                    <span>{publicDataText(metric.label, 'Factory metric')}</span>
                    <strong>{publicMetricValue(metric.value)}</strong>
                    <small>{publicDataText(metric.detail, 'Operating signal.')}</small>
                  </Link>
                ))}
              </div>
              <div className="sm-ytf-compact-list">
                <Link className="sm-ytf-list-row" to="/app/action-board">
                  <span>
                    <strong>What managers see</strong>
                    <small>{roleDataView.visibleData.slice(0, 3).join(' / ')}</small>
                  </span>
                  <em>Filtered</em>
                </Link>
                <Link className="sm-ytf-list-row" to="/app/daily-entry">
                  <span>
                    <strong>What to add</strong>
                    <small>{roleDataView.nextBestAction.detail}</small>
                  </span>
                  <em>Entry</em>
                </Link>
              </div>
            </article>
          )}
        </section>
      ) : null}

      {activeView === 'kpi' ? (
        <section className="sm-ytf-live-grid">
          <article className="sm-ytf-panel sm-ytf-live-wide">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Numbers</p>
                <h2>Operating values</h2>
                <p>Tap any row for plant, size, period, and next entry.</p>
              </div>
              <Link className="sm-button-secondary" to="/app/daily-entry?mode=whiteboard_snapshot">
                Add board
              </Link>
            </div>
            <div className="sm-ytf-metric-strip is-compact">
              <article>
                <span>Production sizes</span>
                <strong>
                  {scopedProductionBySize.length
                    ? compactNumber(scopedProductionBySize.length)
                    : visibleProductionConfirmRows.length
                      ? `${compactNumber(visibleProductionConfirmRows.length)} to confirm`
                      : 'Needs entry'}
                </strong>
                <small>
                  {scopedProductionTotal > 0
                    ? `${ytfCompactNumber(scopedProductionTotal)} pcs from dated rows.`
                    : visibleProductionConfirmRows.length
                      ? `${ytfCompactNumber(productionConfirmTotal)} pcs waiting for manager close.`
                      : 'Add output by size.'}
                </small>
              </article>
              <article>
                <span>Claims rows</span>
                <strong>{scopedQualityClaimsBySize.length ? compactNumber(scopedQualityClaimsBySize.length) : 'No claims logged'}</strong>
                <small>{scopedClaimTotal > 0 ? `${ytfCompactNumber(scopedClaimTotal)} claims with size context.` : 'Log abnormality with 5W1H when needed.'}</small>
              </article>
              <article>
                <span>Stock rows</span>
                <strong>{scopedStockBySize.length ? compactNumber(scopedStockBySize.length) : 'Needs entry'}</strong>
                <small>{scopedStockTotal > 0 ? `${ytfCompactNumber(scopedStockTotal)} pcs received/issued/closing.` : 'Add receipt, issue, and closing values.'}</small>
              </article>
              <article>
                <span>Material / buying</span>
                <strong>
                  {scopedBuyingRecordCount
                    ? scopedMaterialTotalTon > 0
                      ? `${ytfCompactNumber(scopedMaterialTotalTon)} tons`
                      : compactNumber(scopedBuyingRecordCount)
                    : 'Needs entry'}
                </strong>
                <small>
                  {scopedProcurementBySize.length
                    ? 'Tyre-size buying is available.'
                    : scopedRawMaterialOrders.length
                      ? 'Raw material orders are available; tyre-size buying is not tagged.'
                      : 'Add supplier order, material receipt, or purchase close.'}
                </small>
              </article>
            </div>
            {visibleProductionConfirmRows.length ? (
              <div className="sm-ytf-production-confirm-strip" aria-label="Production rows needing confirmation">
                <span>Confirm production</span>
                {visibleProductionConfirmRows.slice(0, 4).map((row) => {
                  const quantity = productionRowQuantity(row)
                  const rowKey = productionConfirmationKey(row)
                  const isConfirming = productionConfirmingKey === rowKey
                  return (
                    <button
                      className="sm-ytf-production-confirm-card"
                      disabled={Boolean(productionConfirmingKey)}
                      key={`kpi-production-confirm-${rowKey}`}
                      onClick={() => void confirmPendingProduction(row)}
                      type="button"
                    >
                      <strong>{row.size || 'Unknown size'}</strong>
                      <em>{quantity > 0 ? `${ytfCompactNumber(quantity)} pcs` : 'Confirm'}</em>
                      <small>{[row.plant, row.source?.date_context || row.updated_at || ''].filter(Boolean).join(' / ')}</small>
                      <span>{isConfirming ? 'Saving...' : 'Confirm'}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div className="sm-ytf-plant-scope-grid" aria-label="Floor And company scope">
              {visiblePlantScopeDisplayCards.map((scope) => (
                <Link
                  className={`sm-ytf-plant-scope-card ${selectedPlantScope === scope.id ? 'is-active' : ''}`.trim()}
                  key={scope.id}
                  to={scope.route}
                >
                  <span>
                    <strong>{scope.label}</strong>
                    <small>{scope.site}</small>
                  </span>
                  <em>{publicMetricValue(scope.value, 'Open')}</em>
                </Link>
              ))}
            </div>
            <div className="sm-ytf-section-dashboard-grid" aria-label="Factory ledger">
              {visibleFactoryLedgerLanes.map((lane) => (
                <article className="sm-ytf-section-dashboard-card" key={lane.id}>
                  <div className="sm-ytf-section-dashboard-head">
                    <span>
                      <strong>{lane.label}</strong>
                      <small>{lane.hint}</small>
                    </span>
                    <Link to={`/app/daily-entry?mode=${lane.entryMode}`}>Add</Link>
                  </div>
                  <div className="sm-ytf-section-dashboard-rows">
                    {lane.rows.length ? (
                      lane.rows.map((row, index) => (
                        <Link className="sm-ytf-section-metric-row" key={`${lane.id}-${row.title}-${row.value}-${index}`} to={row.route}>
                          <span>
                            <strong>{publicDataText(row.title, 'Factory metric')}</strong>
                            <small>{publicDataText(row.context, 'Operational context.')}</small>
                            <small>{publicDataText(row.source, 'Operational source')} / {publicDataText(row.status, 'current')}</small>
                          </span>
                          <em>{publicMetricValue(row.value, 'Needs entry')}</em>
                        </Link>
                      ))
                    ) : (
                      <Link className="sm-ytf-section-metric-row is-empty" to={`/app/daily-entry?mode=${lane.entryMode}`}>
                        <span>
                          <strong>No clean row yet</strong>
                          <small>Add one manager entry or upload a section board photo.</small>
                        </span>
                        <em>Add</em>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {canRunFullRefresh && operatingStoryWatchlist.length ? (
              <div className="sm-ytf-story-watchlist">
                <div className="sm-ytf-section-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Watchlist</p>
                    <h2>Operational items to act on.</h2>
                  </div>
                  <Link className="sm-button-secondary" to="/app/daily-entry?mode=whiteboard_snapshot">
                    Add board
                  </Link>
                </div>
                <div className="sm-ytf-compact-list">
                  {operatingStoryWatchlist.slice(0, 4).map((item) => (
                    <Link className="sm-ytf-list-row" key={`${item.title}-${item.value}-${item.source}`} to={item.route || '/app/live-data?view=kpi'}>
                      <span>
                        <strong>{item.title || 'Extracted value'}</strong>
                        <small>{publicDataText(item.context, 'Operational context.')}</small>
                        <small>{publicDataText(item.source, 'Operational evidence')}</small>
                      </span>
                      <em>{publicMetricValue(item.value, 'Review')}</em>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {canRunFullRefresh ? (
            <div className="sm-ytf-compact-list">
              {operatingMetricRows.length
                ? operatingMetricRows.slice(0, 10).map((metric, index) => (
                    <Link
                      className="sm-ytf-list-row"
                      key={`${metric.metric_name || 'metric'}-${metric.source || index}`}
                      to={metric.route || '/app/live-data?view=kpi'}
                    >
                      <span>
                        <strong>{ytfOperatingMetricTitle(metric)}</strong>
                        <small>{publicDataText(ytfOperatingMetricContext(metric), 'Operational context.')}</small>
                        <small>{publicDataText(ytfOperatingMetricSource(metric), 'Operational source')} / {publicDataText(ytfOperatingMetricStatus(metric), 'current')}</small>
                      </span>
                      <em>{publicMetricValue(ytfOperatingMetricValue(metric))}</em>
                    </Link>
                  ))
                : visiblePlantMetricValues.length
                  ? visiblePlantMetricValues.slice(0, 10).map((metric, index) => (
                      <Link
                        className="sm-ytf-list-row"
                        key={`${metric.metric_key || metric.metric_name || 'workbook-value'}-${metric.row_number || index}`}
                        to="/app/live-data?view=kpi&focus=workbook_values"
                      >
                        <span>
                          <strong>{workbookMetricTitle(metric)}</strong>
                          <small>{publicDataText(workbookMetricContext(metric), 'Operational context.')}</small>
                          <small>{publicDataText(workbookMetricSource(metric), 'Operational source')} / {publicDataText(workbookMetricReviewLabel(metric), 'current')}</small>
                        </span>
                        <em>{publicMetricValue(workbookMetricValue(metric))}</em>
                      </Link>
                    ))
                  : savedMetricRows.slice(0, 10).map((metric) => (
                      <Link className="sm-ytf-list-row" key={`${metric.metric_id || metric.metric_name}-${metric.updated_at || metric.captured_at || ''}`} to="/app/daily-entry?mode=whiteboard_snapshot">
                        <span>
                          <strong>{cleanMetricDisplayTitle(metric.metric_name) || 'Metric'}</strong>
                          <small>{[metric.metric_group, metric.owner, metric.period_label || compactDateTime(metric.captured_at || metric.updated_at)].filter(Boolean).join(' / ')}</small>
                          <small>{metricSourceSummary(metric)}</small>
                        </span>
                        <em>{publicMetricValue(metricValue(metric))}</em>
                      </Link>
                    ))}
              {!operatingMetricRows.length && !visiblePlantMetricValues.length && !savedMetricRows.length && !actualMetricValueCount ? (
                <p className="sm-ytf-empty">No clean values are loaded yet. Use Entry to add output, rejects, downtime, WIP, OT, stock, or a board photo.</p>
              ) : !operatingMetricRows.length && !visiblePlantMetricValues.length && !savedMetricRows.length ? (
                <p className="sm-ytf-live-answer">
                  Loading current values now. Use Entry if today&apos;s plant values are missing.
                </p>
              ) : null}
            </div>
            ) : null}
          </article>

          {canRunFullRefresh ? (
          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Departments</p>
                <h2>Where numbers exist.</h2>
              </div>
            </div>
            <div className="sm-ytf-compact-list">
              {(operatingLaneCards.length ? operatingLaneCards : workbookLaneCards).slice(0, 6).map((lane) => (
                <Link className="sm-ytf-list-row" key={'lane' in lane ? lane.lane : lane.id || lane.label} to="/app/live-data?view=kpi">
                  <span>
                    <strong>{'lane' in lane ? lane.lane : lane.label}</strong>
                    <small>
                      {'sample' in lane
                        ? lane.sample
                          ? `${workbookMetricTitle(lane.sample)} / ${publicMetricValue(workbookMetricValue(lane.sample))}`
                          : 'No dashboard value in this lane yet.'
                        : 'Review current values for this lane.'}
                    </small>
                  </span>
                  <em>{compactNumber(lane.count)}</em>
                </Link>
              ))}
            </div>
          </article>
          ) : null}

          {canRunFullRefresh && candidateMetricRows.length && agentKeyEscalations > 0 ? (
            <article className="sm-ytf-panel sm-ytf-live-wide">
              <div className="sm-ytf-section-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Key exceptions</p>
                  <h2>Only touch business-critical holds.</h2>
                  <p>Agents handle normal rows. This appears only when weak table/date evidence could affect an important dashboard number.</p>
                </div>
              </div>
              <div className="sm-ytf-compact-list">
                {candidateMetricRows.slice(0, 6).map((metric) => {
                  const metricId = String(metric.metric_id || '').trim()
                  const busy = Boolean(metricId && metricReviewingId === metricId)
                  return (
                    <article className="sm-ytf-list-row" key={metricId || `${metric.metric_name}-${metric.captured_at}`}>
                    <span>
                      <strong>{cleanMetricDisplayTitle(metric.metric_name) || 'Source value'}</strong>
                      <small>{[metricReviewLane(metric), metric.owner, metric.period_label].filter(Boolean).join(' / ') || metricSourceSummary(metric)}</small>
                      <small>{metricSourceSummary(metric)}</small>
                    </span>
                    <div className="sm-ytf-inline-actions">
                      <span className="sm-ytf-inline-value">{publicMetricValue(metricValue(metric))}</span>
                      <Link to="/app/live-data?view=data&focus=source_records">Record</Link>
                      <button className="sm-button-primary" disabled={busy || !metricId} onClick={() => void reviewCandidateMetric(metric, 'official')} type="button">
                        {busy ? 'Saving...' : 'Use once'}
                      </button>
                      <button className="sm-button-secondary" disabled={busy || !metricId} onClick={() => void reviewCandidateMetric(metric, 'rejected')} type="button">
                        Keep held
                      </button>
                    </div>
                  </article>
                  )
                })}
              </div>
              {metricReviewMessage ? <p className="sm-ytf-live-answer">{metricReviewMessage}</p> : null}
            </article>
          ) : null}

          {canRunFullRefresh ? (
            <article className="sm-ytf-panel">
                <p className="sm-kicker text-[var(--sm-accent)]">Source coverage</p>
              <h2>Which records are feeding numbers.</h2>
            <div className="sm-ytf-live-feature-grid">
              <div>
                <span>Source profiles</span>
                <strong>{compactNumber(workbookProfileCount)}</strong>
              </div>
              <div>
                <span>Useful source books</span>
                <strong>{compactNumber(workbookSelectedCount)}</strong>
              </div>
              <div>
                <span>Prepared tables</span>
                <strong>{compactNumber(agentAutoHandledTables)}</strong>
              </div>
              <div>
                <span>Needs manager check</span>
                <strong>{compactNumber(agentKeyEscalations || workbookBlockedCount)}</strong>
              </div>
            </div>
          </article>
          ) : null}
        </section>
      ) : null}

      {activeView === 'actions' ? (
        <section className="sm-ytf-live-grid">
          <article className="sm-ytf-panel sm-ytf-live-wide">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Work queue</p>
                <h2>Sort latest changes into real work.</h2>
              </div>
              <Link className="sm-button-secondary" to="/app/action-board">
                Action Board
              </Link>
            </div>
            <div className="sm-ytf-action-grid sm-ytf-action-grid-five">
              {actionGroups.map((group) => (
                <Link className={`sm-ytf-action-tile ${group.id === 'do_now' ? 'is-primary' : ''}`} key={group.id} to="/app/action-board">
                  <span>
                    <strong>{group.label}</strong>
                    <small>{group.detail}</small>
                  </span>
                  <span className="sm-ytf-action-arrow">{compactNumber(group.events.length)}</span>
                </Link>
              ))}
            </div>
          </article>
          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Top decisions</p>
            <h2>Open, assign, close.</h2>
            <div className="sm-ytf-compact-list">
              {sourceEvents.slice(0, 8).map((event) => {
                const group = actionGroupForEvent(event)
                return (
                  <Link className="sm-ytf-list-row" key={event.event_id || sourceTitle(event)} to={event.owning_route || '/app/action-board'}>
                    <span>
                      <strong>{sourceTitle(event)}</strong>
                      <small>{actionNextStepForEvent(event)}</small>
                      <small>{sourceMeta(event)} / {event.owner_hint || 'Owner pending'} / {compactDateTime(event.detected_at || event.current_modified_time)}</small>
                    </span>
                    <em>{actionGroupLabel(group)}</em>
                  </Link>
                )
              })}
              {!sourceEvents.length ? <p className="sm-ytf-empty">No operational changes loaded.</p> : null}
            </div>
          </article>
          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Owner routing</p>
            <h2>Who needs to act.</h2>
            <div className="sm-ytf-compact-list">
              {ownerFocus.map((item) => (
                <Link className="sm-ytf-list-row" key={item.label || item.sample} to={item.route || '/app/action-board'}>
                  <span>
                    <strong>{item.label || 'Owner lane'}</strong>
                    <small>{item.sample || 'Open the linked operating record.'}</small>
                  </span>
                  <em>{compactNumber(item.count)}</em>
                </Link>
              ))}
              {nextActions.slice(0, 4).map((item) => (
                <Link className="sm-ytf-list-row" key={item} to="/app/action-board">
                  <span>
                    <strong>{item}</strong>
                    <small>Suggested by recent data. A manager closes it or turns it into work.</small>
                  </span>
                  <em>Next</em>
                </Link>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {activeView === 'comms' ? (
        <section className="sm-ytf-live-grid">
          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Gmail</p>
                <h2>Factory Client email signals.</h2>
                <p>Bounded Gmail filters mine only YTF, CEO-forwarded, KIIC, and JUNKY signals. Shared output is redacted.</p>
              </div>
              {canSeeRawComms ? (
                <button className="sm-button-secondary" disabled={gmailSyncing} onClick={runGmailSyncNow} type="button">
                  {gmailSyncing ? 'Syncing...' : 'Sync Gmail'}
                </button>
              ) : (
                <Link className="sm-button-secondary" to="/app/action-board">
                  Open Actions
                </Link>
              )}
            </div>
            {canSeeRawComms ? (
              <div className="sm-ytf-mini-grid">
                <div>
                  <span>Status</span>
                  <strong>{gmail?.summary?.token_status || gmail?.status || 'unknown'}</strong>
                </div>
                <div>
                  <span>Filters</span>
                  <strong>{compactNumber(gmailQueryProfiles.length || gmail?.summary?.query_profile_count || emailTotal)}</strong>
                </div>
                <div>
                  <span>Matched</span>
                  <strong>{compactNumber(gmailMatchedCount)}</strong>
                </div>
                <div>
                  <span>Routed</span>
                  <strong>{compactNumber(gmailSavedCount)}</strong>
                </div>
              </div>
            ) : null}
            {gmailSyncMessage ? <p className="sm-ytf-live-answer">{gmailSyncMessage}</p> : null}
            <div className="sm-ytf-compact-list">
              {canSeeRawComms ? (
                <>
                  <div className="sm-ytf-list-row">
                    <span>
                      <strong>{formatMode(gmailWorkerMode)}</strong>
                      <small>{sanitizeYtfCommsText(gmailIntakePlan?.worker_contract?.scope) || 'Metadata-only query fanout; manager review before promotion.'}</small>
                    </span>
                    <em>{gmailIntakePlan?.worker_contract?.cadence || 'Daily'}</em>
                  </div>
                  {(gmailQueryProfiles.length ? gmailQueryProfiles : gmail?.sources ?? []).slice(0, 6).map((source) => (
                    <div className="sm-ytf-list-row" key={source.source_id || source.name}>
                      <span>
                        <strong>{sanitizeYtfCommsText(source.name || source.source_id)}</strong>
                        <small>{[source.query_profile, source.status].filter(Boolean).map((item) => sanitizeYtfCommsText(String(item))).join(' / ')}</small>
                      </span>
                      <em>{source.max_results ? `${source.max_results} max` : source.status || 'ready'}</em>
                    </div>
                  ))}
                  {gmailScanResults.slice(0, 4).map((result, index) => (
                    <div className="sm-ytf-list-row" key={String(result.source_id || result.query_hash || `gmail-scan-${index}`)}>
                      <span>
                        <strong>{String(result.query_profile || result.source_id || 'Gmail scan')}</strong>
                        <small>
                          {compactNumber(Number(result.message_count || 0))} matched / {compactNumber(Number(result.relevant_count || 0))} relevant / {compactNumber(Number(result.skipped_irrelevant_count || 0))} skipped
                        </small>
                      </span>
                      <em>{compactNumber(Number(result.saved_tasks || 0))} saved</em>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="sm-ytf-list-row">
                    <span>
                      <strong>Raw email hidden</strong>
                      <small>Only admin can see inbox setup, intake names, and manual email capture.</small>
                    </span>
                    <em>Filtered</em>
                  </div>
                  <Link className="sm-ytf-list-row" to="/app/action-board">
                    <span>
                      <strong>Derived follow-ups</strong>
                      <small>Floor And manager roles get routed work, supplier risks, and evidence links.</small>
                    </span>
                    <em>{compactNumber(sourceChanges?.promoted_task_count)}</em>
                  </Link>
                </>
              )}
            </div>
          </article>
          <article className="sm-ytf-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Chat bots</p>
            <h2>LINE, Viber, WeChat.</h2>
            <div className="sm-ytf-compact-list">
              {canSeeRawComms ? (
                (bots?.sources ?? []).slice(0, 8).map((source) => (
                  <div className="sm-ytf-list-row" key={source.source_id || source.name}>
                    <span>
                      <strong>{source.name || source.source_id}</strong>
                      <small>{[source.system || source.provider, source.owner, source.status].filter(Boolean).join(' / ')}</small>
                    </span>
                    <em>{source.status || 'ready'}</em>
                  </div>
                ))
              ) : (
                <div className="sm-ytf-list-row">
                  <span>
                    <strong>Chat evidence summary</strong>
                    <small>Bot and manual drops are routed to work items before role workspaces see them.</small>
                  </span>
                  <em>{botReady}/{botTotal || 0}</em>
                </div>
              )}
              <div className="sm-ytf-list-row">
                <span>
                  <strong>Manual drops</strong>
                  <small>Safe temporary capture until each webhook is connected.</small>
                </span>
                <em>{compactNumber(displayPipeline.communications?.manual_message_count)}</em>
              </div>
              {canSeeRawComms ? (
                <>
                  <div className="sm-ytf-list-row">
                    <span>
                      <strong>Cloud runtime</strong>
                      <small>
                        {cloudComms?.pc_dependency === 'none_for_production'
                          ? 'Production runs from Vercel/webhooks, not this PC.'
                          : 'Runtime status is still loading.'}
                      </small>
                    </span>
                    <em>{cloudComms?.status || 'checking'}</em>
                  </div>
                  <div className="sm-ytf-list-row">
                    <span>
                      <strong>Secrets and cron</strong>
                      <small>
                        {compactNumber(cloudCommsSecretReady)}/{compactNumber(cloudCommsSecretCount)} secrets ready /{' '}
                        {compactNumber(cloudCommsCronReady)}/{compactNumber(cloudCommsCronCount)} cron jobs in config
                      </small>
                    </span>
                    <em>{cloudComms?.database?.status || 'database?'}</em>
                  </div>
                  {cloudCommsActions.slice(0, 2).map((action: string) => (
                    <div className="sm-ytf-list-row" key={action}>
                      <span>
                        <strong>Next fix</strong>
                        <small>{sanitizeYtfCommsText(action)}</small>
                      </span>
                      <em>setup</em>
                    </div>
                  ))}
                  {cloudCommsSetupFlow ? (
                    <div className="sm-ytf-list-row">
                      <span>
                        <strong>Start with {sanitizeYtfCommsText(cloudCommsSetupFlow.label || 'official bot')}</strong>
                        <small>
                          {sanitizeYtfCommsText(cloudCommsSetupFlow.command || '')}
                        </small>
                      </span>
                      <em>{cloudCommsSetupFlow.difficulty || 'guided'}</em>
                    </div>
                  ) : null}
                </>
              ) : null}
              {recentBotMessages.length ? (
                <>
                  <div className="sm-ytf-list-row">
                    <span>
                      <strong>Extracted chat facts</strong>
                      <small>Recent Viber/LINE/WeChat messages converted into candidate factory facts.</small>
                    </span>
                    <em>{compactNumber(recentBotFactCount)}</em>
                  </div>
                  {recentBotMessages.slice(0, 3).map((message) => (
                    <div className="sm-ytf-list-row" key={message.event_id || message.created_at || message.title}>
                      <span>
                        <strong>{sanitizeYtfCommsText(message.title || message.source_id || 'Chat evidence')}</strong>
                        <small>
                          {message.facts?.length
                            ? message.facts.slice(0, 2).map(formatChatFact).join(' | ')
                            : message.fact_summary || [message.domain, message.priority].filter(Boolean).join(' / ') || 'No structured facts yet'}
                        </small>
                      </span>
                      <em>{message.fact_count ? `${message.fact_count} facts` : message.priority || 'check'}</em>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </article>
          {canSeeRawComms ? (
            <article className="sm-ytf-panel sm-ytf-live-wide">
              <div className="sm-ytf-section-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Admin capture</p>
                  <h2>Paste one message.</h2>
                  <p>Use this until the chat bot is inside the group. It creates evidence, not an automatic final record.</p>
                </div>
              </div>
              <form
                className="sm-ytf-manual-drop-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveManualDrop()
                }}
              >
                <select className="sm-ytf-input" onChange={(event) => setManualSourceId(event.target.value)} value={manualSourceId}>
                  {communicationSources.map((source) => (
                    <option key={source.source_id} value={source.source_id}>
                      {sanitizeYtfCommsText(source.name || source.source_id)}
                    </option>
                  ))}
                </select>
                <input className="sm-ytf-input" onChange={(event) => setManualTitle(event.target.value)} placeholder="Short title" value={manualTitle} />
                <input className="sm-ytf-input" onChange={(event) => setManualSender(event.target.value)} placeholder="Sender or group" value={manualSender} />
                <input className="sm-ytf-input" onChange={(event) => setManualEvidence(event.target.value)} placeholder="Evidence link, optional" value={manualEvidence} />
                <textarea
                  className="sm-ytf-textarea"
                  onChange={(event) => setManualText(event.target.value)}
                  placeholder="Paste the important chat/email excerpt here..."
                  value={manualText}
                />
                <button className="sm-button-primary" disabled={manualSaving} type="submit">
                  {manualSaving ? 'Saving...' : 'Save evidence'}
                </button>
              </form>
              {manualStatus ? <p className="sm-ytf-live-answer">{manualStatus}</p> : null}
            </article>
          ) : (
            <article className="sm-ytf-panel sm-ytf-live-wide">
              <p className="sm-kicker text-[var(--sm-accent)]">Role-safe comms</p>
              <h2>Messages are summarized for your role.</h2>
              <p>Email and chat are processed by admin data jobs, then converted into clean work, number signals, and evidence cards for each role.</p>
              <Link className="sm-button-primary" to="/app/action-board">
                Open actions
              </Link>
            </article>
          )}
        </section>
      ) : null}

    </div>
  )
}
