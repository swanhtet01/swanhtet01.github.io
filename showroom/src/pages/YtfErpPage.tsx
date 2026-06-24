import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import {
  createWorkspaceTasks,
  createYtfErpTransaction,
  confirmYtfProductionClose,
  getYtfDailyCloseSummary,
  getYtfManagerFiveWOneHReport,
  getYtfRoleFocus,
  getWorkspaceSession,
  getYtfErpTransactions,
  getYtfOperatingMetrics,
  getYtfRoleMetrics,
  loadCachedWorkspaceSession,
  sessionHasCapability,
  updateWorkspaceTask,
  type YtfOperatingMetricsResult,
  type WorkspaceSessionPayload,
  type YtfErpTransactionsResult,
  type YtfErpTransactionType,
  type YtfDailyCloseSummaryResult,
  type YtfManagerFiveWOneHReportResult,
  type YtfRoleFocusResult,
  type YtfRoleMetricsResult,
} from '../lib/workspaceApi'
import { ytfMetricIsCurrentOperational } from '../lib/ytfMetricContext'

type YtfErpState = {
  session: WorkspaceSessionPayload['session'] | null
  roleFocus: YtfRoleFocusResult | null
  roleMetrics: YtfRoleMetricsResult | null
  operatingMetrics: YtfOperatingMetricsResult | null
  transactions: YtfErpTransactionsResult | null
  managerReport: YtfManagerFiveWOneHReportResult | null
  dailyClose: YtfDailyCloseSummaryResult | null
  loading: boolean
  error: string | null
  syncMessage: string | null
}

type TransactionForm = {
  transaction_type: YtfErpTransactionType
  document_ref: string
  item_code: string
  item_name: string
  quantity: string
  unit: string
  location: string
  movement_type: string
  planned_quantity: string
  actual_quantity: string
  scrap_quantity: string
  batch_or_lot: string
  owner: string
  status: string
  approval_gate: string
  evidence_link: string
  notes: string
  create_approval: boolean
  idempotency_key: string
}

const INITIAL_STATE: YtfErpState = {
  session: null,
  roleFocus: null,
  roleMetrics: null,
  operatingMetrics: null,
  transactions: null,
  managerReport: null,
  dailyClose: null,
  loading: true,
  error: null,
  syncMessage: null,
}

const TRANSACTION_TYPES = [
  {
    id: 'production_order',
    label: 'Production',
    documentLabel: 'Shift/order',
    itemLabel: 'What was produced?',
    quantityLabel: 'Good qty',
    unit: 'pcs',
    location: 'Floor A',
    owner: 'Plant Manager',
    status: 'review',
    gate: 'production close approval',
    movement: 'closeout',
    notePlaceholder: 'Shift, line, size, reject reason',
  },
  {
    id: 'inventory_movement',
    label: 'Stock',
    documentLabel: 'Move ref',
    itemLabel: 'What moved?',
    quantityLabel: 'Qty',
    unit: 'pcs',
    location: 'Main Warehouse',
    owner: 'Stores Team',
    status: 'review',
    gate: 'stock movement approval',
    movement: 'issue',
    notePlaceholder: 'Issue, receipt, transfer, shortage reason',
  },
  {
    id: 'quality_hold',
    label: 'Quality',
    documentLabel: 'Pack/batch',
    itemLabel: 'What is the issue?',
    quantityLabel: 'Affected qty',
    unit: 'pcs',
    location: 'QC inspection',
    owner: 'Quality Team',
    status: 'hold',
    gate: 'quality hold release approval',
    movement: 'hold',
    notePlaceholder: 'Defect, claim, containment action',
  },
  {
    id: 'finance_approval',
    label: 'Purchase',
    documentLabel: 'PO/cost ref',
    itemLabel: 'What was bought?',
    quantityLabel: 'Amount',
    unit: 'MMK',
    location: 'Plant costing',
    owner: 'Finance',
    status: 'review',
    gate: 'finance cost approval',
    movement: 'costing',
    notePlaceholder: 'Supplier, material, variance',
  },
] as const

type TransactionLaneId = (typeof TRANSACTION_TYPES)[number]['id']

type RoleDefaults = {
  roleLabel: string
  title: string
  subtitle: string
  entryTitle: string
  homeRoute: string
  defaultLane: TransactionLaneId
  defaultOwner: string
  defaultLocation: string
  lanes: TransactionLaneId[]
}

const ROLE_DEFAULTS: Record<string, RoleDefaults> = {
  admin: {
    roleLabel: 'Admin',
    title: 'Factory operations',
    subtitle: "Focus on today's output, quality, stock, and approvals.",
    entryTitle: 'Record factory work',
    homeRoute: '/app/platform-admin',
    defaultLane: 'production_order',
    defaultOwner: 'YTF Admin',
    defaultLocation: 'Floor A',
    lanes: ['production_order', 'inventory_movement', 'quality_hold', 'finance_approval'],
  },
  ceo: {
    roleLabel: 'Director / GM',
    title: 'Company operations',
    subtitle: 'Review exceptions, decisions, and manager follow-through.',
    entryTitle: 'Record decision',
    homeRoute: '/app/director',
    defaultLane: 'finance_approval',
    defaultOwner: 'Director / GM',
    defaultLocation: 'Company',
    lanes: ['production_order', 'inventory_movement', 'quality_hold', 'finance_approval'],
  },
  plant_a_manager: {
    roleLabel: 'Floor A Manager',
    title: 'Floor A control',
    subtitle: "Close today's production, quality, and stock movement.",
    entryTitle: 'Record Floor A work',
    homeRoute: '/app/plant-manager',
    defaultLane: 'production_order',
    defaultOwner: 'Floor A Manager',
    defaultLocation: 'Floor A',
    lanes: ['production_order', 'inventory_movement', 'quality_hold'],
  },
  plant_b_manager: {
    roleLabel: 'Floor B Manager',
    title: 'Floor B control',
    subtitle: "Close today's production, quality, and stock movement.",
    entryTitle: 'Record Floor B work',
    homeRoute: '/app/plant-manager',
    defaultLane: 'production_order',
    defaultOwner: 'Floor B Manager',
    defaultLocation: 'Floor B',
    lanes: ['production_order', 'inventory_movement', 'quality_hold'],
  },
  manager_plant_a: {
    roleLabel: 'Manager A',
    title: "Today's floor work",
    subtitle: 'Capture numbers, issues, and handoff updates quickly.',
    entryTitle: "Record today's update",
    homeRoute: '/app/manager-system',
    defaultLane: 'production_order',
    defaultOwner: 'Manager A',
    defaultLocation: 'Floor A',
    lanes: ['production_order', 'inventory_movement', 'quality_hold'],
  },
  manager_plant_b: {
    roleLabel: 'Manager B',
    title: "Today's floor work",
    subtitle: 'Capture numbers, issues, and handoff updates quickly.',
    entryTitle: "Record today's update",
    homeRoute: '/app/manager-system',
    defaultLane: 'production_order',
    defaultOwner: 'Manager B',
    defaultLocation: 'Floor B',
    lanes: ['production_order', 'inventory_movement', 'quality_hold'],
  },
}

const DEFAULT_ROLE: RoleDefaults = ROLE_DEFAULTS.manager_plant_a
type OperationalCard = {
  label: string
  value: string
  detail: string
  route: string
  status?: string
}
type RoleModuleRow = NonNullable<YtfRoleMetricsResult['modules']>[number]
type ProductionBySizeRow = NonNullable<NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['size_breakdowns']>['production_by_size']>[number]
type PendingProductionCloseRow = NonNullable<NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['size_breakdowns']>['pending_production_close']>[number]
type StockBySizeRow = NonNullable<NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['size_breakdowns']>['stock_by_size']>[number]
type QualityBySizeRow = NonNullable<NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['size_breakdowns']>['quality_claims_by_size']>[number]
type SizeMetricRow = { periods?: string[]; source?: Record<string, string> }
type SizeMatrixRow = {
  size: string
  outputQty: number
  stockQty: number
  outputRoute: string
  stockRoute: string
  asOf: string
  scope: string
}

type WorkRow = {
  key: string
  title: string
  owner: string
  status: string
  detail: string
  route: string
  taskId?: string
  state?: 'open' | 'closed'
}

type TeamViewFilter = 'open' | 'blocked' | 'mine' | 'all'

const INTERNAL_TEST_PATTERN =
  /\b(live erp document smoke|api live erp smoke|ui debug smoke|manual debug smoke|debug smoke|playwright live smoke|live smoke|qa smoke|line capture qa|test record|erp-ui-debug|erp-api-live-smoke)\b|production entry \d{10,}/i
const INTERNAL_WORK_PATTERN =
  /\b(source data|erp facts|data qa|data health|latest update|runtime snapshot|pipeline|database|schema|drive|gmail oauth|review .* data file|sync lane|shortcut|source record)\b|(?:\.xlsx|\.xls|\.csv|\.pdf|\.docx|\.pptx|\.mp4)\b/i
const META_CARD_LABEL_PATTERN = /^(source data|erp facts|kpi facts|data qa|data health|latest update|runtime snapshot|records|facts|tables)$/i
const ERP_SAVE_RETRY_MESSAGE = 'Save did not complete. Try again after refresh or use Daily Entry.'

function isInternalTestText(...parts: unknown[]) {
  return INTERNAL_TEST_PATTERN.test(parts.map((part) => String(part || '')).join(' '))
}

function isInternalWorkText(...parts: unknown[]) {
  return INTERNAL_WORK_PATTERN.test(parts.map((part) => String(part || '')).join(' '))
}

function userSafeErpSaveError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/managed postgres|production write|database|supermega_database_url|database_url_postgres_url|write_blocked/i.test(message)) {
    return ERP_SAVE_RETRY_MESSAGE
  }
  return message || 'Save failed.'
}

function sanitizeText(value: unknown, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function erpDisplayText(value: unknown, fallback = '') {
  const text = sanitizeText(value, '')
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
    .replace(/\b(?:Google\s+Drive|Drive|workbook|worksheet|source file|file)\b/gi, 'record')
    .replace(/\s*\/\s*Current source period\b/gi, '')
    .replace(/\bLatest available source period\b/gi, 'Latest operating period')
    .replace(/\bCurrent source period\b/gi, 'Current operating period')
    .replace(/\bsource period\b/gi, 'operating period')
    .replace(/\bNo recent update\b/gi, 'Needs latest entry')
    .replace(/\bAwaiting latest\b/gi, 'Needs latest')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.;,])/g, '$1')
    .trim()
  return cleaned || fallback
}

function erpDisplayValue(value: unknown, fallback = 'Needs entry') {
  const text = erpDisplayText(value, '')
  if (!text) return fallback
  if (/^0(?:\.0+)?\s*(?:pcs|kg|ton|mmk)?$/i.test(text)) return fallback
  return text
}

function compactDateTime(value?: string | null) {
  if (!value) return 'Current view'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function operationalCardSemantic(card: OperationalCard) {
  const text = `${card.label} ${card.detail}`.toLowerCase()
  if (/(Floor A vs Floor B|plant split|a\s*\/\s*b|gap)/.test(text)) return 'plant_split'
  if (/(sales|dispatch)/.test(text)) return 'sales'
  if (/(inventory|closing|balance)/.test(text)) return 'inventory'
  if (/(quality|qc|claim|defect|reject)/.test(text)) return 'quality'
  if (/(stock|movement|warehouse)/.test(text)) return 'stock'
  if (/(production|output)/.test(text)) return 'production'
  return 'other'
}

function pickCard(cards: OperationalCard[], semantic: ReturnType<typeof operationalCardSemantic>) {
  return cards.find((card) => operationalCardSemantic(card) === semantic) ?? null
}

function buildYtfLiveDataRoute(lane: string, plant: string, size?: string) {
  const params = new URLSearchParams()
  params.set('view', 'kpi')
  params.set('lane', lane)
  params.set('plant', plant || 'all')
  if (size && size.trim()) params.set('size', size.trim())
  return `/app/live-data?${params.toString()}`
}

type DailyEntryModeRoute = 'daily_routine' | 'whiteboard_snapshot' | 'normal_abnormal' | 'shift_handoff'
type DailyEntryCondition = 'normal' | 'abnormal' | 'follow-up' | 'done'
type DailyEntryRouteOptions = { condition?: DailyEntryCondition; section?: string }

function defaultEntrySection(mode: DailyEntryModeRoute, plant: string) {
  const normalizedPlant = String(plant || '').trim().toLowerCase()
  if (normalizedPlant === 'plant-b') {
    if (mode === 'daily_routine' || mode === 'shift_handoff') return 'Floor B daily routine'
    if (mode === 'normal_abnormal') return 'Floor B normal / abnormal'
    return 'Floor B daily routine'
  }
  if (mode === 'daily_routine') return '01 Mixing'
  if (mode === 'normal_abnormal') return 'QC / inspection'
  if (mode === 'shift_handoff') return 'Tyre building'
  return '07 Curing press'
}

function buildDailyEntryRoute(mode: DailyEntryModeRoute, plant: string, options: DailyEntryRouteOptions = {}) {
  const params = new URLSearchParams()
  params.set('mode', mode)
  params.set('section', options.section || defaultEntrySection(mode, plant))
  if (options.condition) params.set('condition', options.condition)
  return `/app/daily-entry?${params.toString()}`
}

function buildEntryModeRoute(mode: string, section?: string) {
  const params = new URLSearchParams()
  params.set('mode', mode)
  if (section && section.trim()) params.set('section', section.trim())
  return `/app/daily-entry?${params.toString()}`
}

function periodHintFromDetail(label: string, detail: string) {
  const text = `${label} ${detail}`.toLowerCase()
  if (/\b(daily|weekly|monthly|quarter|period)\b/.test(text)) return ''
  if (/\bas of\b/.test(text)) return 'Current operating period'
  return ''
}

function ymdTokens(value: unknown) {
  const text = String(value || '')
  return [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1])
}

function latestYmdToken(values: Array<string | null | undefined>) {
  const normalized = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
  if (!normalized.length) return ''
  return normalized.sort().at(-1) || ''
}

function latestPeriodFromSizeMetricRow(row: SizeMetricRow) {
  const periods = Array.isArray(row.periods) ? row.periods : []
  const sourceText = Object.values(row.source || {}).join(' ')
  return latestYmdToken([...periods.flatMap((value) => ymdTokens(value)), ...ymdTokens(sourceText)])
}

function normalizePlantLabel(scope: string) {
  const value = String(scope || '').trim().toLowerCase()
  if (value === 'plant-a') return 'Floor A'
  if (value === 'plant-b') return 'Floor B'
  if (value === 'shared' || value === 'all') return 'A + B'
  return 'A + B'
}

function extractAsOfFromDetail(detail: string) {
  const text = String(detail || '').trim()
  if (!text) return ''
  const normalized = text.replace(/\s+/g, ' ')
  const compact = text.replace(/\s+/g, '')
  const ymd = normalized.match(/\b(20\d{2}\s*-\s*\d{2}\s*-\s*\d{2})\b/)
  if (ymd) return ymd[1].replace(/\s+/g, '')
  const compactYmd = compact.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (compactYmd) return compactYmd[1]
  const ym = normalized.match(/\b(20\d{2}\s*-\s*\d{2})\b/)
  if (ym) return `${ym[1].replace(/\s+/g, '')}-01`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function explicitAsOfYmdTokens(value: unknown) {
  const text = String(value || '')
  const tokens: string[] = []
  const explicitYmd = text.matchAll(/\bAs\s+of\s+(20\d{2})\s*-\s*(\d{2})\s*-\s*(\d{2})\b/gi)
  for (const match of explicitYmd) tokens.push(`${match[1]}-${match[2]}-${match[3]}`)
  const explicitYm = text.matchAll(/\bAs\s+of\s+(20\d{2})\s*-\s*(\d{2})(?!\s*-\s*\d{2})\b/gi)
  for (const match of explicitYm) tokens.push(`${match[1]}-${match[2]}-01`)
  return tokens
}

function latestExplicitAsOfYmd(value: unknown) {
  return latestYmdToken(explicitAsOfYmdTokens(value))
}

function daysSinceYmd(value: string) {
  const text = String(value || '').trim()
  if (!text) return null
  const parsed = Date.parse(`${text}T00:00:00Z`)
  if (Number.isNaN(parsed)) return null
  return Math.floor((Date.now() - parsed) / 86400000)
}

function isFreshYmd(value: string, maxAgeDays: number) {
  const age = daysSinceYmd(value)
  if (age === null) return false
  return age <= maxAgeDays
}

function hasStaleExplicitAsOf(value: unknown, maxAgeDays: number) {
  return explicitAsOfYmdTokens(value).some((token) => {
    const age = daysSinceYmd(token)
    return age !== null && age > maxAgeDays
  })
}

function metricNumber(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function metricNumberFromText(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = String(value || '').trim().replace(/,/g, '')
  if (!text) return 0
  const match = text.match(/-?\d+(?:\.\d+)?/)
  if (!match) return 0
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : 0
}

function isMissingOperationalValue(value: string) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return true
  if (text.includes('not reported') || text.includes('awaiting') || text.includes('no recent update')) return true
  return metricNumberFromText(value) <= 0
}

function plantSplitLooksUnmeasured(card: OperationalCard) {
  const text = `${card.value} ${card.detail}`.replace(/\s+/g, ' ').trim().toLowerCase()
  return (
    /\ba\s+0\s*\/\s*b\s+0\s*pcs\b/.test(text) ||
    /\ba\s+0\s+\/\s+b\s+0\s+pcs\b/.test(text) ||
    /\bgap\s*\/\s*a\s+0\s*\/\s*b\s+0\s*pcs\b/.test(text) ||
    /\bgap\s+0\s*pcs\b/.test(text)
  )
}

function metricScopeFromText(value: unknown) {
  const text = String(value || '').toLowerCase()
  if (/plant[\s_-]*a|yangon/.test(text)) return 'plant-a'
  if (/plant[\s_-]*b|bilin/.test(text)) return 'plant-b'
  if (/\b\d{2,3}\s*\/\s*\d{2,3}\s*r\s*\d{1,2}\b/.test(text) || /\b\d{3}\s*r\s*\d{2}\s*c?\b/.test(text)) return 'plant-b'
  if (/\b(?:4\.00|4\.50|5\.00|5\.50|6\.00|6\.50|7\.00|7\.50|8\.25|8\.30|9\.00|10\.00|11\.00|12\.4|13\.6|14\.9|16\.9)\s*-\s*\d{2,3}\b/.test(text)) return 'plant-a'
  if (/shared|company|all|a\+b|a \+ b/.test(text)) return 'shared'
  return 'shared'
}

function scopeMatchesExactPlant(scopeText: unknown, plant: string) {
  if (plant !== 'plant-a' && plant !== 'plant-b') return true
  return metricScopeFromText(scopeText) === plant
}

function preferExactPlantRows<T>(
  rows: T[],
  plant: string,
  scopeText: (row: T) => unknown,
) {
  if (plant !== 'plant-a' && plant !== 'plant-b') return rows
  const exact = rows.filter((row) => scopeMatchesExactPlant(scopeText(row), plant))
  if (exact.length) return exact
  return []
}

function roleKey(value?: string | null, workspaceSlug?: string | null, scopeText?: string | null) {
  const normalizedRaw = String(value || '').trim().toLowerCase()
  const normalized = normalizedRaw.replace(/[\s-]+/g, '_').replace(/__+/g, '_')
  const contextText = [workspaceSlug, scopeText].filter(Boolean).join(' ').toLowerCase()
  const plantBContext = contextText.includes('plant-b') || contextText.includes('plant_b') || contextText.includes('bilin')
  const plantARoleHint = /(^|[_\s-])(plant[_\s-]*a|manager[_\s-]*a|a[_\s-]*manager)([_\s-]|$)/.test(normalizedRaw)
  const plantBRoleHint = /(^|[_\s-])(plant[_\s-]*b|manager[_\s-]*b|b[_\s-]*manager)([_\s-]|$)/.test(normalizedRaw)
  if (normalized === 'plant_manager_a' || normalized === 'plant_a_manager') return 'plant_a_manager'
  if (normalized === 'plant_manager_b' || normalized === 'plant_b_manager') return 'plant_b_manager'
  if (normalized === 'manager_a' || normalized === 'manager_plant_a') return 'manager_plant_a'
  if (normalized === 'manager_b' || normalized === 'manager_plant_b') return 'manager_plant_b'
  if ((normalized.includes('plant_manager') || normalized.includes('plantmanager')) && (plantBRoleHint || normalized.endsWith('_b'))) {
    return 'plant_b_manager'
  }
  if ((normalized.includes('plant_manager') || normalized.includes('plantmanager')) && (plantARoleHint || normalized.endsWith('_a'))) {
    return 'plant_a_manager'
  }
  if (normalized.includes('manager') && (plantBRoleHint || normalized.endsWith('_b'))) return 'manager_plant_b'
  if (normalized.includes('manager') && (plantARoleHint || normalized.endsWith('_a'))) return 'manager_plant_a'
  if (normalized === 'admin' || normalized === 'tenant_admin' || normalized === 'platform_admin') return 'admin'
  if (normalized === 'ceo' || normalized === 'director') return 'ceo'
  if (normalized === 'plant_manager') return plantBContext ? 'plant_b_manager' : 'plant_a_manager'
  if (normalized === 'manager') return plantBContext ? 'manager_plant_b' : 'manager_plant_a'
  if (!normalized) return plantBContext ? 'manager_plant_b' : 'manager_plant_a'
  return normalized
}

function resolveRoleDefaults(
  role?: string | null,
  options?: { workspaceSlug?: string | null; rolePlantScope?: string | null; roleGroup?: string | null },
) {
  const roleValue = role || options?.roleGroup || ''
  return ROLE_DEFAULTS[roleKey(roleValue, options?.workspaceSlug, options?.rolePlantScope)] ?? DEFAULT_ROLE
}

function resolveEffectiveErpRole(
  session: WorkspaceSessionPayload['session'] | null,
  roleMetrics: YtfRoleMetricsResult | null,
  roleFocus: YtfRoleFocusResult | null,
) {
  const explicitRole = sanitizeText(session?.role, '')
  if (explicitRole) return explicitRole
  if (canReadAdminRuntime(session)) return 'admin'
  if (sessionHasCapability(session, 'director.view')) return 'ceo'
  return roleMetrics?.role || roleFocus?.role || null
}

function selectedTransactionLane(transactionType: string) {
  return TRANSACTION_TYPES.find((lane) => lane.id === transactionType) ?? TRANSACTION_TYPES[0]
}

function newIdempotencyKey(type: YtfErpTransactionType) {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `ytf-erp:${type}:${randomPart}`
}

function defaultTransactionForm(type: YtfErpTransactionType = 'production_order', overrides: Partial<TransactionForm> = {}): TransactionForm {
  const lane = selectedTransactionLane(type)
  return {
    transaction_type: lane.id,
    document_ref: '',
    item_code: '',
    item_name: '',
    quantity: '',
    unit: lane.unit,
    location: overrides.location ?? lane.location,
    movement_type: lane.movement,
    planned_quantity: '',
    actual_quantity: '',
    scrap_quantity: '',
    batch_or_lot: '',
    owner: overrides.owner ?? lane.owner,
    status: lane.status,
    approval_gate: lane.gate,
    evidence_link: '',
    notes: '',
    create_approval: overrides.create_approval ?? true,
    idempotency_key: newIdempotencyKey(lane.id),
  }
}

function settledValue<T>(result: PromiseSettledResult<T>) {
  return result.status === 'fulfilled' ? result.value : null
}

function canReadAdminRuntime(session: WorkspaceSessionPayload['session'] | null | undefined) {
  return (
    sessionHasCapability(session, 'tenant_admin.view') ||
    sessionHasCapability(session, 'platform_admin.view') ||
    sessionHasCapability(session, 'connector_admin.view')
  )
}

function useYtfErpState() {
  const [state, setState] = useState<YtfErpState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState((current) => ({ ...current, loading: true, error: null }))
      const cached = loadCachedWorkspaceSession()
      const sessionPayload = await getWorkspaceSession().catch(() => cached)
      const activeSession = sessionPayload?.session ?? cached?.session ?? null
      if (!cancelled && activeSession) {
        setState((current) => ({ ...current, session: activeSession, error: null }))
      }
      const coreResults = await Promise.allSettled([
        getYtfRoleMetrics({ refresh: true }),
        getYtfOperatingMetrics({ compact: true, refresh: true }),
        getYtfRoleFocus(),
      ])
      if (cancelled) return
      const roleFocus = settledValue(coreResults[2])
      let roleMetrics = settledValue(coreResults[0])
      let operatingMetrics = settledValue(coreResults[1])

      const roleCardsLookEmpty = (payload: YtfRoleMetricsResult | null) => {
        if (!payload || !Array.isArray(payload.cards) || payload.cards.length <= 0) return false
        return payload.cards.every((row) => isMissingOperationalValue(sanitizeText(row?.value, '')))
      }
      const operatingRowsLookEmpty = (payload: YtfOperatingMetricsResult | null) =>
        !payload ||
        String(payload.status || '').trim().toLowerCase() === 'degraded' ||
        ((payload.top_rows ?? []).length <= 0 && (payload.lanes ?? []).length <= 0)

      if (roleMetrics === null || roleCardsLookEmpty(roleMetrics)) {
        const retriedRoleMetrics = await getYtfRoleMetrics({ refresh: true }).catch(() => null)
        if (!cancelled && retriedRoleMetrics) roleMetrics = retriedRoleMetrics
      }
      if (operatingRowsLookEmpty(operatingMetrics)) {
        const retriedOperatingMetrics = await getYtfOperatingMetrics({ compact: true, refresh: true }).catch(() => null)
        if (!cancelled && retriedOperatingMetrics) operatingMetrics = retriedOperatingMetrics
      }
      const metricWorkspaceSlug = roleMetrics?.plant_scope === 'plant-b' ? 'ytf-plant-b' : 'ytf-plant-a'
      const metricBackedSession =
        roleMetrics?.role
          ? {
              ...(activeSession || {}),
              role: roleMetrics.role,
              workspace_id: roleMetrics.workspace_id || activeSession?.workspace_id,
              workspace_slug: metricWorkspaceSlug,
              workspace_name: activeSession?.workspace_name || 'Factory Client ERP',
            }
          : null
      const resolvedSession = activeSession ?? metricBackedSession

      setState({
        session: resolvedSession,
        roleFocus,
        roleMetrics,
        operatingMetrics,
        transactions: null,
        managerReport: null,
        dailyClose: null,
        loading: false,
        error:
          !roleMetrics
            ? 'ERP backend did not respond. Check login or tenant API health.'
            : null,
        syncMessage: null,
      })

      const roleScopeText = `${String(roleMetrics?.role || '').toLowerCase()} ${String(roleMetrics?.role_group || '').toLowerCase()}`
      const includeTransactions = /\b(admin|tenant_admin|platform_admin|ceo|director|plant_manager|manager)\b/.test(roleScopeText)
      const secondaryResults = await Promise.allSettled([
        includeTransactions ? getYtfErpTransactions(24) : Promise.resolve(null),
        getYtfManagerFiveWOneHReport(6),
        getYtfDailyCloseSummary(),
      ])
      if (cancelled) return
      const transactions = settledValue(secondaryResults[0])
      const managerReport = settledValue(secondaryResults[1])
      const dailyClose = settledValue(secondaryResults[2])
      setState((current) => ({
        ...current,
        transactions: transactions ?? current.transactions,
        managerReport: managerReport ?? current.managerReport,
        dailyClose: dailyClose ?? current.dailyClose,
      }))
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return [state, setState] as const
}

export function YtfErpPage() {
  const [state, setState] = useYtfErpState()
  const effectiveRole = resolveEffectiveErpRole(state.session, state.roleMetrics, state.roleFocus)
  const roleDefaults = resolveRoleDefaults(effectiveRole, {
    workspaceSlug: state.session?.workspace_slug,
    rolePlantScope: state.roleMetrics?.plant_scope,
    roleGroup: state.roleFocus?.role_group || state.roleMetrics?.role_group,
  })
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(() =>
    defaultTransactionForm(roleDefaults.defaultLane, {
      owner: roleDefaults.defaultOwner,
      location: roleDefaults.defaultLocation,
    }),
  )
  const [transactionSaving, setTransactionSaving] = useState(false)
  const [transactionMessage, setTransactionMessage] = useState<string | null>(null)
  const [teamTaskTitle, setTeamTaskTitle] = useState('')
  const [teamTaskOwner, setTeamTaskOwner] = useState(roleDefaults.defaultOwner)
  const [teamTaskDue, setTeamTaskDue] = useState('')
  const [teamTaskSaving, setTeamTaskSaving] = useState(false)
  const [teamTaskMessage, setTeamTaskMessage] = useState<string | null>(null)
  const [teamTaskSyncing, setTeamTaskSyncing] = useState(false)
  const [teamViewFilter, setTeamViewFilter] = useState<TeamViewFilter>('open')
  const [productionConfirmingKey, setProductionConfirmingKey] = useState('')
  const [productionConfirmMessage, setProductionConfirmMessage] = useState<string | null>(null)
  const selectedLane = selectedTransactionLane(transactionForm.transaction_type)
  const adminCanSync = canReadAdminRuntime(state.session)

  const visibleTransactionTypes = useMemo(
    () => TRANSACTION_TYPES.filter((lane) => roleDefaults.lanes.includes(lane.id)),
    [roleDefaults.lanes],
  )

  const roleTopSignals = useMemo(() => {
    const managerPlant: 'plant-a' | 'plant-b' = /Floor B/i.test(roleDefaults.defaultLocation) ? 'plant-b' : 'plant-a'
    const roleLabel = roleDefaults.roleLabel.toLowerCase()
    const managerSurface = roleLabel.includes('manager') && !roleLabel.includes('admin')
    const companySurface = roleLabel.includes('admin') || roleLabel.includes('director')
    return { managerPlant, managerSurface, companySurface }
  }, [roleDefaults.defaultLocation, roleDefaults.roleLabel])
  const [sizeScope, setSizeScope] = useState<'all' | 'plant-a' | 'plant-b'>('all')

  useEffect(() => {
    setSizeScope(roleTopSignals.managerSurface ? roleTopSignals.managerPlant : 'all')
  }, [roleTopSignals.managerPlant, roleTopSignals.managerSurface])

  const plantLaneRollup = useMemo(() => {
    const sizeBreakdowns = state.operatingMetrics?.story?.size_breakdowns
    const sizeBreakdownsRecord = (sizeBreakdowns || {}) as Record<string, unknown>
    const stockBySize = (sizeBreakdowns?.stock_by_size ?? [])
      .filter((row): row is StockBySizeRow => Boolean(row))
      .filter((row) => ytfMetricIsCurrentOperational(row, { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 14 }))
    const pendingProductionClose = (sizeBreakdowns?.pending_production_close ?? [])
      .filter((row): row is PendingProductionCloseRow => Boolean(row))
      .filter((row) => ytfMetricIsCurrentOperational(row, { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 14 }))
    const qualityBySize = (sizeBreakdowns?.quality_claims_by_size ?? [])
      .filter((row): row is QualityBySizeRow => Boolean(row))
      .filter((row) => ytfMetricIsCurrentOperational(row, { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 21 }))
    const salesDispatchByPlant = (Array.isArray(sizeBreakdownsRecord.sales_dispatch_by_plant) ? sizeBreakdownsRecord.sales_dispatch_by_plant : [])
      .filter((row: unknown): row is Record<string, unknown> => Boolean(row))
      .filter((row) => ytfMetricIsCurrentOperational(row, { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 10 }))
    const inventoryByPlant = (Array.isArray(sizeBreakdownsRecord.inventory_balance_by_plant) ? sizeBreakdownsRecord.inventory_balance_by_plant : [])
      .filter((row: unknown): row is Record<string, unknown> => Boolean(row))
      .filter((row) => ytfMetricIsCurrentOperational(row, { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 14 }))
    const stockByPlantRows = stockBySize as unknown as Array<Record<string, unknown>>
    const dispatchRowsForSplit = salesDispatchByPlant
    const inventoryRowsForSplit = inventoryByPlant.length > 0 ? inventoryByPlant : stockByPlantRows

    const splitPlantRollup = (
      rows: Array<Record<string, unknown>>,
      plantScope: 'plant-a' | 'plant-b',
      valueKeys: string[],
    ) => {
      let total = 0
      let asOf = ''
      for (const row of rows) {
        const sourceText = typeof row.source === 'object' && row.source ? String((row.source as { source?: unknown }).source || '') : ''
        const scope = metricScopeFromText(`${String(row.plant || '')} ${sourceText}`)
        let value = 0
        for (const key of valueKeys) {
          const nextValue = metricNumber(row[key])
          if (nextValue > 0) {
            value = nextValue
            break
          }
        }
        if (value <= 0) continue
        if (scope === plantScope) {
          total += value
          const nextAsOf = latestPeriodFromSizeMetricRow(row as SizeMetricRow) || latestYmdToken([
            ...ymdTokens(row.updated_at),
            ...ymdTokens((row.source as Record<string, string> | undefined)?.captured_at),
            ...ymdTokens((row.source as Record<string, string> | undefined)?.date_context),
            ...ymdTokens((row.source as Record<string, string> | undefined)?.period_label),
          ])
          if (nextAsOf && nextAsOf > asOf) asOf = nextAsOf
        }
      }
      return { total, asOf }
    }

    const plantASales = splitPlantRollup(dispatchRowsForSplit, 'plant-a', ['dispatch_qty', 'issued_qty', 'movement_qty'])
    const plantBSales = splitPlantRollup(dispatchRowsForSplit, 'plant-b', ['dispatch_qty', 'issued_qty', 'movement_qty'])
    const plantAInventory = splitPlantRollup(inventoryRowsForSplit, 'plant-a', ['closing_qty', 'balance_qty', 'received_qty', 'movement_qty'])
    const plantBInventory = splitPlantRollup(inventoryRowsForSplit, 'plant-b', ['closing_qty', 'balance_qty', 'received_qty', 'movement_qty'])
    const plantAQuality = splitPlantRollup(qualityBySize as unknown as Array<Record<string, unknown>>, 'plant-a', ['claim_qty', 'reject_qty', 'hold_qty'])
    const plantBQuality = splitPlantRollup(qualityBySize as unknown as Array<Record<string, unknown>>, 'plant-b', ['claim_qty', 'reject_qty', 'hold_qty'])
    const plantAPendingProduction = splitPlantRollup(pendingProductionClose as unknown as Array<Record<string, unknown>>, 'plant-a', ['pending_qty'])
    const plantBPendingProduction = splitPlantRollup(pendingProductionClose as unknown as Array<Record<string, unknown>>, 'plant-b', ['pending_qty'])

    return {
      plantASales: plantASales.total,
      plantBSales: plantBSales.total,
      plantAInventory: plantAInventory.total,
      plantBInventory: plantBInventory.total,
      plantAQuality: plantAQuality.total,
      plantBQuality: plantBQuality.total,
      plantAPendingProduction: plantAPendingProduction.total,
      plantBPendingProduction: plantBPendingProduction.total,
      plantASalesAsOf: plantASales.asOf,
      plantBSalesAsOf: plantBSales.asOf,
      plantAInventoryAsOf: plantAInventory.asOf,
      plantBInventoryAsOf: plantBInventory.asOf,
      plantAQualityAsOf: plantAQuality.asOf,
      plantBQualityAsOf: plantBQuality.asOf,
      plantAPendingProductionAsOf: plantAPendingProduction.asOf,
      plantBPendingProductionAsOf: plantBPendingProduction.asOf,
    }
  }, [state.operatingMetrics?.story?.size_breakdowns])

  const statusCards = useMemo(() => {
    const moduleCards = ((state.roleMetrics?.modules ?? [])
      .map((row: RoleModuleRow) => {
        const label = sanitizeText(row.label, '')
        const route = sanitizeText(row.route, '/app/live-data?view=kpi')
        if (!label || !route) return null
        return {
          label,
          value: sanitizeText(row.value, 'Needs entry'),
          detail: sanitizeText(row.detail, ''),
          route,
          status: sanitizeText(row.status, ''),
        }
      })
      .filter(Boolean) as OperationalCard[])
      .filter((row) => !META_CARD_LABEL_PATTERN.test(row.label))
      .filter((row) => !isInternalWorkText(row.label, row.detail))
      .filter((row) => /production|output|quality|qc|stock|inventory|sales|dispatch|plant|approval|decision|downtime|claim/i.test(`${row.label} ${row.detail}`))
    const fallbackCards = (state.roleMetrics?.cards ?? [])
      .map((row) => ({
        label: sanitizeText(row.label, 'Metric'),
        value: sanitizeText(row.value, 'Needs entry'),
        detail: sanitizeText(row.detail, ''),
        route: sanitizeText(row.route, '/app/live-data?view=kpi'),
        status: '',
      }))
      .filter((row) => row.label || row.value)
      .filter((row) => !META_CARD_LABEL_PATTERN.test(row.label))
      .filter((row) => !isInternalWorkText(row.label, row.detail))
      .filter((row) => /production|output|quality|qc|stock|inventory|sales|dispatch|plant|approval|decision|downtime|claim/i.test(`${row.label} ${row.detail}`))
    const sourceCards = moduleCards.length ? moduleCards : fallbackCards

    const normalizeOperationalCard = (
      card: OperationalCard,
      fallback: { value: string; detail: string },
    ): OperationalCard => {
      const cardStatus = sanitizeText(card.status, '').toLowerCase()
      if (cardStatus === 'needs_data' || cardStatus === 'capture') {
        return { ...card, value: fallback.value, detail: fallback.detail }
      }
      const asOf = extractAsOfFromDetail(card.detail)
      const semantic = operationalCardSemantic(card)
      const freshnessLimitDays =
        semantic === 'sales' || semantic === 'inventory' || semantic === 'stock'
          ? 7
          : roleTopSignals.managerSurface
            ? 10
            : 14
      const explicitAsOf = latestExplicitAsOfYmd(card.detail)
      const effectiveAsOf = explicitAsOf || asOf
      if (hasStaleExplicitAsOf(card.detail, freshnessLimitDays) || (effectiveAsOf && !isFreshYmd(effectiveAsOf, freshnessLimitDays))) {
        return { ...card, value: fallback.value, detail: fallback.detail }
      }
      if (semantic === 'plant_split' && plantSplitLooksUnmeasured(card)) {
        return { ...card, value: fallback.value, detail: fallback.detail }
      }
      if (semantic !== 'plant_split' && isMissingOperationalValue(card.value)) {
        return { ...card, value: fallback.value, detail: fallback.detail }
      }
      return card
    }

    if (roleTopSignals.companySurface) {
      const productionCard = pickCard(sourceCards, 'production')
      const salesCard = pickCard(sourceCards, 'sales')
      const inventoryCard = pickCard(sourceCards, 'inventory') ?? pickCard(sourceCards, 'stock')
      const plantSplitCard = pickCard(sourceCards, 'plant_split')
      const plantDetail = (
        plantAValue: number,
        plantBValue: number,
        options: { unit: string; asOf?: string; missingLabel?: string; fallback?: string },
      ) => {
        const parts: string[] = []
        const missing: string[] = []
        if (plantAValue > 0) parts.push(`Floor A ${Math.round(plantAValue).toLocaleString()} ${options.unit}`)
        else missing.push('Floor A')
        if (plantBValue > 0) parts.push(`Floor B ${Math.round(plantBValue).toLocaleString()} ${options.unit}`)
        else missing.push('Floor B')
        const coverage = parts.length ? parts.join(' / ') : options.fallback || 'Needs current entry'
        const suffix = [
          options.asOf ? `As of ${options.asOf}` : '',
          missing.length && parts.length ? `${missing.join(' + ')} ${options.missingLabel || 'needs close'}` : '',
        ].filter(Boolean)
        return [coverage, ...suffix].join(' / ')
      }
      const pendingRollup = { plantA: 0, plantB: 0, asOf: '' }
      for (const row of state.operatingMetrics?.story?.size_breakdowns?.pending_production_close ?? []) {
        const pendingQty = metricNumber(row?.pending_qty)
        if (pendingQty <= 0) continue
        const asOf = latestYmdToken([
          ...ymdTokens(row?.updated_at),
          ...ymdTokens(row?.source?.captured_at),
          ...ymdTokens(row?.source?.date_context),
          ...ymdTokens(row?.source?.period_label),
        ])
        if (asOf && !isFreshYmd(asOf, 14)) continue
        const scope = metricScopeFromText(`${row?.plant || ''} ${row?.source?.source || ''} ${row?.size || ''}`)
        if (scope === 'plant-b') pendingRollup.plantB += pendingQty
        else pendingRollup.plantA += pendingQty
        if (asOf && asOf > pendingRollup.asOf) pendingRollup.asOf = asOf
      }
      const pendingProductionTotal =
        pendingRollup.plantA + pendingRollup.plantB || plantLaneRollup.plantAPendingProduction + plantLaneRollup.plantBPendingProduction
      const pendingProductionAsOf =
        pendingRollup.asOf ||
        latestYmdToken([
          plantLaneRollup.plantAPendingProductionAsOf,
          plantLaneRollup.plantBPendingProductionAsOf,
        ])
      const pendingProductionPlantA = pendingRollup.plantA || plantLaneRollup.plantAPendingProduction
      const pendingProductionPlantB = pendingRollup.plantB || plantLaneRollup.plantBPendingProduction
      const salesTotal = plantLaneRollup.plantASales + plantLaneRollup.plantBSales
      const salesAsOf = latestYmdToken([plantLaneRollup.plantASalesAsOf, plantLaneRollup.plantBSalesAsOf])
      const inventoryTotal = plantLaneRollup.plantAInventory + plantLaneRollup.plantBInventory
      const inventoryAsOf = latestYmdToken([plantLaneRollup.plantAInventoryAsOf, plantLaneRollup.plantBInventoryAsOf])
      const qualityTotal = plantLaneRollup.plantAQuality + plantLaneRollup.plantBQuality
      const qualityAsOf = latestYmdToken([plantLaneRollup.plantAQualityAsOf, plantLaneRollup.plantBQualityAsOf])
      const productionFallback =
        pendingProductionTotal > 0
          ? {
              label: 'Production output',
              value: `${Math.round(pendingProductionTotal).toLocaleString()} pcs pending`,
              detail: plantDetail(pendingProductionPlantA, pendingProductionPlantB, {
                unit: 'pcs',
                asOf: pendingProductionAsOf,
                missingLabel: 'needs close',
              }),
              route: '/app/action-board',
              status: 'needs_confirmation',
            }
          : { label: 'Production output', value: 'Needs entry', detail: 'Add production close for this period', route: '/app/live-data?view=kpi&lane=production&plant=all', status: 'needs_data' }
      const salesFallback =
        salesTotal > 0
          ? {
              label: 'Sales dispatch',
              value: `${Math.round(salesTotal).toLocaleString()} pcs`,
              detail: plantDetail(plantLaneRollup.plantASales, plantLaneRollup.plantBSales, {
                unit: 'pcs',
                asOf: salesAsOf,
                missingLabel: 'needs dispatch close',
              }),
              route: '/app/live-data?view=kpi&lane=sales_inventory&plant=all',
              status: 'partial',
            }
          : { label: 'Sales dispatch', value: 'Needs entry', detail: 'Add dispatch close for this period', route: '/app/live-data?view=kpi&lane=sales_inventory&plant=all', status: 'needs_data' }
      const inventoryFallback =
        inventoryTotal > 0
          ? {
              label: 'Inventory balance',
              value: `${Math.round(inventoryTotal).toLocaleString()} pcs`,
              detail: plantDetail(plantLaneRollup.plantAInventory, plantLaneRollup.plantBInventory, {
                unit: 'pcs',
                asOf: inventoryAsOf,
                missingLabel: 'needs inventory close',
              }),
              route: '/app/live-data?view=kpi&lane=sales_inventory&plant=all',
              status: 'partial',
            }
          : { label: 'Inventory balance', value: 'Needs entry', detail: 'Add inventory close for this period', route: '/app/live-data?view=kpi&lane=sales_inventory&plant=all', status: 'needs_data' }
      const splitFallback =
        inventoryTotal > 0 || qualityTotal > 0 || pendingProductionTotal > 0
          ? {
              label: 'Floor A vs Floor B',
              value:
                plantLaneRollup.plantAInventory > 0 && plantLaneRollup.plantBInventory > 0
                  ? `${Math.abs(Math.round(plantLaneRollup.plantAInventory - plantLaneRollup.plantBInventory)).toLocaleString()} pcs gap`
                  : plantLaneRollup.plantBInventory > 0
                    ? 'Floor B current'
                    : plantLaneRollup.plantAInventory > 0
                      ? 'Floor A current'
                      : 'Needs close',
              detail:
                inventoryTotal > 0
                  ? plantDetail(plantLaneRollup.plantAInventory, plantLaneRollup.plantBInventory, {
                      unit: 'pcs',
                      asOf: inventoryAsOf,
                      missingLabel: 'needs close',
                    })
                  : plantDetail(plantLaneRollup.plantAQuality, plantLaneRollup.plantBQuality, {
                      unit: 'pcs',
                      asOf: qualityAsOf,
                      missingLabel: 'needs quality close',
                    }),
              route: '/app/live-data?view=kpi&lane=sales_inventory&plant=all',
              status: 'partial',
            }
          : { label: 'Floor A vs Floor B', value: 'Needs entry', detail: 'Add plant split close for this period', route: '/app/live-data?view=kpi&lane=production&plant=all', status: 'needs_data' }
      const resolvedProductionCard =
        pendingProductionTotal > 0
          ? productionFallback
          : productionCard
            ? normalizeOperationalCard(
                { ...productionCard, label: 'Production output' },
                { value: productionFallback.value, detail: productionFallback.detail },
              )
            : productionFallback
      const resolvedSalesCard = salesCard
          ? normalizeOperationalCard(
              { ...salesCard, label: 'Sales dispatch' },
              { value: salesFallback.value, detail: salesFallback.detail },
            )
          : salesFallback
      const resolvedInventoryCard = inventoryCard
          ? normalizeOperationalCard(
              { ...inventoryCard, label: 'Inventory balance' },
              { value: inventoryFallback.value, detail: inventoryFallback.detail },
            )
          : inventoryFallback
      const resolvedSplitCard = plantSplitCard
          ? normalizeOperationalCard(
              { ...plantSplitCard, label: 'Floor A vs Floor B' },
              { value: splitFallback.value, detail: splitFallback.detail },
            )
          : splitFallback
      const splitFromVisibleInventory =
        isMissingOperationalValue(resolvedSplitCard.value) && metricNumberFromText(resolvedInventoryCard.value) > 0
          ? {
              ...resolvedSplitCard,
              value: resolvedInventoryCard.detail.includes('Floor A') && resolvedInventoryCard.detail.includes('Floor B') ? 'Both current' : 'Partial',
              detail: resolvedInventoryCard.detail,
              route: resolvedInventoryCard.route,
              status: 'partial',
            }
          : resolvedSplitCard
      return [resolvedProductionCard, resolvedSalesCard, resolvedInventoryCard, splitFromVisibleInventory]
    }

    if (roleTopSignals.managerSurface) {
      const managerPlant = roleTopSignals.managerPlant
      const productionCard = pickCard(sourceCards, 'production')
      const qualityCard = pickCard(sourceCards, 'quality')
      const salesCard = pickCard(sourceCards, 'sales')
      const stockCard = pickCard(sourceCards, 'inventory') ?? pickCard(sourceCards, 'stock')
      const managerSalesQty = managerPlant === 'plant-a' ? plantLaneRollup.plantASales : plantLaneRollup.plantBSales
      const managerInventoryQty = managerPlant === 'plant-a' ? plantLaneRollup.plantAInventory : plantLaneRollup.plantBInventory
      let managerPendingProductionQty = 0
      let managerPendingProductionAsOf = ''
      for (const row of state.operatingMetrics?.story?.size_breakdowns?.pending_production_close ?? []) {
        const pendingQty = metricNumber(row?.pending_qty)
        if (pendingQty <= 0) continue
        const rowScope = metricScopeFromText(`${row?.plant || ''} ${row?.source?.source || ''} ${row?.size || ''}`)
        if (rowScope !== managerPlant) continue
        const asOf = latestYmdToken([
          ...ymdTokens(row?.updated_at),
          ...ymdTokens(row?.source?.captured_at),
          ...ymdTokens(row?.source?.date_context),
          ...ymdTokens(row?.source?.period_label),
        ])
        if (asOf && !isFreshYmd(asOf, 14)) continue
        managerPendingProductionQty += pendingQty
        if (asOf && asOf > managerPendingProductionAsOf) managerPendingProductionAsOf = asOf
      }
      const managerProductionFallback =
        managerPendingProductionQty > 0
          ? {
              label: 'Production output',
              value: `${Math.round(managerPendingProductionQty).toLocaleString()} pcs pending`,
              detail: `${normalizePlantLabel(managerPlant)} / confirm close${managerPendingProductionAsOf ? ` / As of ${managerPendingProductionAsOf}` : ''}`,
              route: buildDailyEntryRoute('daily_routine', managerPlant),
              status: 'needs_confirmation',
            }
          : {
              label: 'Production output',
              value: 'Needs entry',
              detail: `Add ${normalizePlantLabel(managerPlant)} production close`,
              route: buildYtfLiveDataRoute('production', managerPlant),
              status: 'needs_data',
            }
      const managerCards = [
        managerPendingProductionQty > 0
          ? managerProductionFallback
          : productionCard
            ? normalizeOperationalCard(
                { ...productionCard, label: 'Production output' },
                { value: managerProductionFallback.value, detail: managerProductionFallback.detail },
              )
            : managerProductionFallback,
        qualityCard
          ? normalizeOperationalCard(
              { ...qualityCard, label: 'Quality status' },
              { value: 'Needs entry', detail: `Add ${normalizePlantLabel(managerPlant)} quality or abnormality entry` },
            )
          : { label: 'Quality status', value: 'Needs entry', detail: `Add ${normalizePlantLabel(managerPlant)} quality or abnormality entry`, route: '/app/dqms', status: 'needs_data' },
        salesCard
          ? (() => {
              const normalized = normalizeOperationalCard(
                { ...salesCard, label: 'Sales dispatch' },
                { value: 'Needs entry', detail: `${normalizePlantLabel(managerPlant)} / add dispatch close` },
              )
              if (metricNumberFromText(normalized.value) <= 0 && managerSalesQty > 0) {
                return {
                  ...normalized,
                  value: `${Math.round(managerSalesQty).toLocaleString()} pcs`,
                  detail: `${normalizePlantLabel(managerPlant)} / dispatch by size`,
                }
              }
              if (isMissingOperationalValue(normalized.value)) {
                return {
                  ...normalized,
                  value: 'Needs entry',
                  detail: `${normalizePlantLabel(managerPlant)} / add dispatch close`,
                }
              }
              return normalized
            })()
          : { label: 'Sales dispatch', value: 'Needs entry', detail: `${normalizePlantLabel(managerPlant)} / add dispatch close`, route: buildYtfLiveDataRoute('sales_inventory', managerPlant) },
        stockCard
          ? (() => {
              const normalized = normalizeOperationalCard(
                { ...stockCard, label: 'Inventory balance' },
                { value: 'Needs entry', detail: `${normalizePlantLabel(managerPlant)} / add inventory close` },
              )
              if (metricNumberFromText(normalized.value) <= 0 && managerInventoryQty > 0) {
                return {
                  ...normalized,
                  value: `${Math.round(managerInventoryQty).toLocaleString()} pcs`,
                  detail: `${normalizePlantLabel(managerPlant)} / inventory by size`,
                }
              }
              if (isMissingOperationalValue(normalized.value)) {
                return {
                  ...normalized,
                  value: 'Needs entry',
                  detail: `${normalizePlantLabel(managerPlant)} / add inventory close`,
                }
              }
              return normalized
            })()
          : { label: 'Inventory balance', value: 'Needs entry', detail: `${normalizePlantLabel(managerPlant)} / add inventory close`, route: buildYtfLiveDataRoute('sales_inventory', managerPlant) },
      ]
      const deduped: OperationalCard[] = []
      const seen = new Set<string>()
      for (const card of managerCards) {
        const key = `${card.label}|${card.route}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(card)
      }
      while (deduped.length < 4) {
        deduped.push({ label: 'Pending decisions', value: 'No pending', detail: 'No pending decision', route: '/app/action-board', status: 'ready' })
      }
      return deduped.slice(0, 4)
    }

    return sourceCards.slice(0, 4)
  }, [
    plantLaneRollup.plantAInventory,
    plantLaneRollup.plantAInventoryAsOf,
    plantLaneRollup.plantAPendingProduction,
    plantLaneRollup.plantAPendingProductionAsOf,
    plantLaneRollup.plantAQuality,
    plantLaneRollup.plantAQualityAsOf,
    plantLaneRollup.plantASales,
    plantLaneRollup.plantASalesAsOf,
    plantLaneRollup.plantBInventory,
    plantLaneRollup.plantBInventoryAsOf,
    plantLaneRollup.plantBPendingProduction,
    plantLaneRollup.plantBPendingProductionAsOf,
    plantLaneRollup.plantBQuality,
    plantLaneRollup.plantBQualityAsOf,
    plantLaneRollup.plantBSales,
    plantLaneRollup.plantBSalesAsOf,
    roleTopSignals.companySurface,
    roleTopSignals.managerPlant,
    roleTopSignals.managerSurface,
    state.operatingMetrics?.story?.size_breakdowns?.pending_production_close,
    state.roleMetrics?.cards,
    state.roleMetrics?.modules,
  ])

  const collaborationRows = useMemo(() => {
    const rows: WorkRow[] = []
    const seen = new Set<string>()

    for (const row of state.roleFocus?.collaboration?.rows ?? []) {
      const title = sanitizeText(row.title, 'Workspace task')
      const owner = sanitizeText(row.owner, roleDefaults.roleLabel)
      const status = sanitizeText(row.status, 'open')
      const due = sanitizeText(row.due, '')
      const priority = sanitizeText(row.priority, '')
      const notes = sanitizeText(row.notes, '')
      const detailParts = [priority ? `Priority ${priority}` : '', due ? `Due ${due}` : '', notes].filter(Boolean)
      const detail = detailParts.join(' / ')
      if (!title || isInternalWorkText(title, detail)) continue
      if (hasStaleExplicitAsOf(`${title} ${detail}`, 31)) continue
      const route = sanitizeText(row.route, '/app/action-board')
      const taskId = sanitizeText(row.task_id, '')
      const stateLabel = sanitizeText(row.state, '').toLowerCase() === 'closed' ? 'closed' : 'open'
      const key = `${taskId || title}|${route}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        taskId: taskId || undefined,
        title,
        owner,
        status,
        detail,
        route,
        state: stateLabel,
      })
      if (rows.length >= 8) return rows
    }

    for (const row of state.roleMetrics?.work ?? []) {
      const title = sanitizeText(row.label, 'ERP work')
      const detail = sanitizeText(row.detail, '')
      if (!title || isInternalWorkText(title, detail)) continue
      if (hasStaleExplicitAsOf(`${title} ${detail}`, 31)) continue
      const route = sanitizeText(row.route, '/app/action-board')
      const key = `${title}|${route}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        title,
        owner: sanitizeText(row.status, roleDefaults.roleLabel),
        status: sanitizeText(row.status, 'open'),
        detail,
        route,
        state: 'open',
      })
      if (rows.length >= 8) return rows
    }

    for (const row of state.transactions?.records ?? []) {
      if (isInternalTestText(row.title, row.document_ref, row.owner, row.status)) continue
      if (isInternalWorkText(row.title, row.document_ref, row.owner, row.status)) continue
      const title = sanitizeText(row.title || row.document_ref, 'ERP document')
      const detail = [sanitizeText(row.transaction_type), sanitizeText(row.approval_state)].filter(Boolean).join(' / ')
      if (hasStaleExplicitAsOf(`${title} ${detail}`, 31)) continue
      const route = sanitizeText(row.route, '/app/action-board')
      const key = `${title}|${route}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        title,
        owner: sanitizeText(row.owner, 'Owner'),
        status: sanitizeText(row.status || row.approval_state, 'open'),
        detail,
        route,
        state: 'open',
      })
      if (rows.length >= 8) return rows
    }
    return rows
  }, [roleDefaults.roleLabel, state.roleFocus?.collaboration?.rows, state.roleMetrics?.work, state.transactions?.records])

  const transactionRows = useMemo(
    () =>
      (state.transactions?.records ?? [])
      .filter((row) => !isInternalTestText(row.title, row.document_ref, row.owner, row.status))
      .filter((row) => !isInternalWorkText(row.title, row.document_ref, row.owner, row.status))
      .slice(0, 4)
      .map((row) => ({
        key: sanitizeText(row.document_id || row.document_ref || row.title, `${row.document_id || row.document_ref || 'tx'}`),
        title: sanitizeText(row.title || row.document_ref, 'ERP document'),
        owner: sanitizeText(row.owner, 'Owner'),
        status: sanitizeText(row.status || row.approval_state, 'open'),
        detail: [sanitizeText(row.transaction_type), sanitizeText(row.approval_state)].filter(Boolean).join(' / '),
        route: sanitizeText(row.route, '/app/action-board'),
        state: 'open' as const,
      })),
    [state.transactions?.records],
  )

  const managerReportRows = useMemo(() => {
    const rows: WorkRow[] = []
    for (const row of state.managerReport?.rows ?? []) {
      const what = sanitizeText(row.what, '')
      const where = sanitizeText(row.where, '')
      const when = sanitizeText(row.when, '')
      const who = sanitizeText(row.who, '')
      const why = sanitizeText(row.why, '')
      const how = sanitizeText(row.how, '')
      const title = what || sanitizeText(row.notes, '') || 'Manager 5W1H update'
      const detail = [where, when, who, why, how].filter(Boolean).join(' / ')
      if (isInternalTestText(title, detail) || isInternalWorkText(title, detail)) continue
      if (hasStaleExplicitAsOf(`${title} ${detail}`, 31)) continue
      const route = sanitizeText(row.route, '/app/daily-entry?mode=daily_routine')
      const key = `${title}|${detail}|${route}`
      rows.push({
        key,
        title,
        owner: 'Manager summary',
        status: 'open',
        detail,
        route,
        state: 'open',
      })
      if (rows.length >= 3) break
    }
    return rows
  }, [state.managerReport?.rows])

  const dailyCloseSummaryText = useMemo(() => {
    const ready = metricNumber(state.dailyClose?.summary?.ready_input_count)
    const required = metricNumber(state.dailyClose?.summary?.required_input_count)
    if (required > 0) return `Daily close ${ready.toLocaleString()}/${required.toLocaleString()} inputs ready`
    return 'Daily close inputs pending'
  }, [state.dailyClose?.summary?.ready_input_count, state.dailyClose?.summary?.required_input_count])

  const sizeMatrixRows = useMemo(() => {
    const sizeBreakdowns = state.operatingMetrics?.story?.size_breakdowns
    const productionRows = (sizeBreakdowns?.production_by_size ?? [])
      .filter((row): row is ProductionBySizeRow => Boolean(row))
      .filter((row) => ytfMetricIsCurrentOperational(row, { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 10 }))
      .filter((row) => metricNumber(row.output_qty || row.weight_kg) > 0)
    const stockRows = (sizeBreakdowns?.stock_by_size ?? [])
      .filter((row): row is StockBySizeRow => Boolean(row))
      .filter((row) => ytfMetricIsCurrentOperational(row, { minYear: 2025, allowLowConfidence: true, allowIngestFallback: false, maxAgeDays: 14 }))
      .filter((row) => metricNumber(row.closing_qty || row.movement_qty || row.issued_qty || row.received_qty) > 0)
    const matrix = new Map<string, SizeMatrixRow>()
    const activeScope = roleTopSignals.managerSurface ? roleTopSignals.managerPlant : sizeScope
    const scopeLabel = normalizePlantLabel(activeScope)

    const filteredProductionRows = preferExactPlantRows(
      productionRows,
      activeScope,
      (row) => row.plant || row.source?.source,
    )
    const filteredStockRows = preferExactPlantRows(
      stockRows,
      activeScope,
      (row) => row.plant || row.source?.source,
    )

    for (const row of filteredProductionRows) {
      const size = sanitizeText(row.size, '')
      if (!size) continue
      const entry = matrix.get(size) ?? {
        size,
        outputQty: 0,
        stockQty: 0,
        outputRoute: buildYtfLiveDataRoute('production', activeScope, size),
        stockRoute: buildYtfLiveDataRoute('sales_inventory', activeScope, size),
        asOf: '',
        scope: scopeLabel,
      }
      entry.outputQty += metricNumber(row.output_qty || row.weight_kg)
      const rowAsOf = latestPeriodFromSizeMetricRow(row)
      if (rowAsOf && (!entry.asOf || rowAsOf > entry.asOf)) entry.asOf = rowAsOf
      matrix.set(size, entry)
    }

    for (const row of filteredStockRows) {
      const size = sanitizeText(row.size, '')
      if (!size) continue
      const entry = matrix.get(size) ?? {
        size,
        outputQty: 0,
        stockQty: 0,
        outputRoute: buildYtfLiveDataRoute('production', activeScope, size),
        stockRoute: buildYtfLiveDataRoute('sales_inventory', activeScope, size),
        asOf: '',
        scope: scopeLabel,
      }
      entry.stockQty += metricNumber(row.closing_qty || row.movement_qty || row.issued_qty || row.received_qty)
      const rowAsOf = latestPeriodFromSizeMetricRow(row)
      if (rowAsOf && (!entry.asOf || rowAsOf > entry.asOf)) entry.asOf = rowAsOf
      matrix.set(size, entry)
    }

    return [...matrix.values()]
      .sort((a, b) => (b.outputQty + b.stockQty) - (a.outputQty + a.stockQty))
      .slice(0, roleTopSignals.managerSurface ? 5 : 8)
  }, [roleTopSignals.managerPlant, roleTopSignals.managerSurface, sizeScope, state.operatingMetrics?.story?.size_breakdowns])

  const metricContextRows = useMemo(() => {
    const statusAsOf = statusCards.map((card) => extractAsOfFromDetail(card.detail)).filter(Boolean)
    const sizeAsOf = sizeMatrixRows.map((row) => row.asOf).filter(Boolean)
    const latestAsOf = latestYmdToken([...statusAsOf, ...sizeAsOf])
    const scopeLabel = roleTopSignals.managerSurface ? normalizePlantLabel(roleTopSignals.managerPlant) : 'Floor A + Floor B'
    const latestSourceModifiedText = sanitizeText(
      state.roleMetrics?.summary?.latest_modified_time || state.roleMetrics?.pipeline?.latest_source_modified,
      '',
    )
    const latestSourceModifiedYmd = latestYmdToken(ymdTokens(latestSourceModifiedText))
    const rows = [
      {
        key: 'window',
        label: 'Window',
        value: latestAsOf ? `As of ${latestAsOf}` : 'Needs current entry',
      },
      {
        key: 'scope',
        label: 'Scope',
        value: scopeLabel,
      },
    ]
    if (latestSourceModifiedYmd) {
      rows.push({
        key: 'source',
        label: 'Data updated',
        value: latestSourceModifiedYmd,
      })
    }
    return rows
  }, [
    roleTopSignals.managerPlant,
    roleTopSignals.managerSurface,
    sizeMatrixRows,
    state.roleMetrics?.pipeline?.latest_source_modified,
    state.roleMetrics?.summary?.latest_modified_time,
    statusCards,
  ])

  const missingDataRows = useMemo(() => {
    const plant = roleTopSignals.managerSurface ? roleTopSignals.managerPlant : 'plant-a'
    const rows: Array<{ key: string; label: string; detail: string; route: string; tone: 'missing' | 'stale' }> = []
    const seen = new Set<string>()
    const pendingProductionScope = roleTopSignals.managerSurface ? roleTopSignals.managerPlant : 'all'
    const hasPendingProductionClose = (state.operatingMetrics?.story?.size_breakdowns?.pending_production_close ?? []).some((row) => {
      const pendingQty = metricNumber(row?.pending_qty)
      if (pendingQty <= 0) return false
      const rowScope = metricScopeFromText(`${row?.plant || ''} ${row?.source?.source || ''} ${row?.size || ''}`)
      return pendingProductionScope === 'all' || rowScope === pendingProductionScope
    })
    const detailLooksMissing = (detail: string) =>
      /awaiting|no recent update|no .* row in current window|not reported|pending/i.test(detail)
    const routeForSemantic = (semantic: ReturnType<typeof operationalCardSemantic>) => {
      if (semantic === 'production') return buildDailyEntryRoute('daily_routine', plant)
      if (semantic === 'quality') return buildEntryModeRoute('quality_incident', 'QC / inspection')
      if (semantic === 'sales' || semantic === 'stock' || semantic === 'inventory') {
        return buildEntryModeRoute('kpi_snapshot', 'Sales / inventory')
      }
      return '/app/daily-entry'
    }
    const freshnessLimit = (semantic: ReturnType<typeof operationalCardSemantic>) => {
      if (semantic === 'sales' || semantic === 'inventory' || semantic === 'stock') return 7
      if (semantic === 'quality') return roleTopSignals.managerSurface ? 10 : 14
      return roleTopSignals.managerSurface ? 10 : 14
    }
    for (const row of state.roleMetrics?.missing_inputs ?? []) {
      const label = sanitizeText(row.label, '')
      if (!label) continue
      if (hasPendingProductionClose && /production|output/i.test(label)) continue
      const route = sanitizeText(row.route, '/app/daily-entry')
      const key = `${label}|${route}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        label: erpDisplayText(label, 'Missing input'),
        detail: erpDisplayText(row.detail, 'Capture latest update'),
        route,
        tone: 'missing',
      })
      if (rows.length >= 4) return rows
    }
    for (const card of statusCards) {
      const semantic = operationalCardSemantic(card)
      if (!['production', 'quality', 'sales', 'stock', 'inventory'].includes(semantic)) continue
      const asOf = extractAsOfFromDetail(card.detail)
      const stale = Boolean(asOf) && !isFreshYmd(asOf, freshnessLimit(semantic))
      const pendingConfirmation = /pending/i.test(card.value) || /confirm close|confirm production/i.test(card.detail)
      const missing =
        !pendingConfirmation &&
        (sanitizeText(card.status, '').toLowerCase() === 'needs_data' ||
          sanitizeText(card.status, '').toLowerCase() === 'capture' ||
          isMissingOperationalValue(card.value) ||
          plantSplitLooksUnmeasured(card) ||
          detailLooksMissing(card.detail))
      if (!missing && !stale) continue
      const tone: 'missing' | 'stale' = stale ? 'stale' : 'missing'
      const missingValueDetail = isMissingOperationalValue(card.value) || plantSplitLooksUnmeasured(card)
      const detail = stale
        ? `Last update ${asOf}. Capture latest ${card.label.toLowerCase()}.`
        : missingValueDetail
          ? `Capture latest ${card.label.toLowerCase()}.`
        : erpDisplayText(card.detail, `Capture latest ${card.label.toLowerCase()}.`)
      const key = `${card.label}|${routeForSemantic(semantic)}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        label: erpDisplayText(card.label, 'Missing input'),
        detail: erpDisplayText(detail, `Capture latest ${card.label.toLowerCase()}.`),
        route: routeForSemantic(semantic),
        tone,
      })
      if (rows.length >= 4) break
    }
    return rows
  }, [
    roleTopSignals.managerPlant,
    roleTopSignals.managerSurface,
    state.operatingMetrics?.story?.size_breakdowns?.pending_production_close,
    state.roleMetrics?.missing_inputs,
    statusCards,
  ])

  const pendingProductionActions = useMemo(() => {
    const rows = state.operatingMetrics?.story?.size_breakdowns?.pending_production_close ?? []
    const activeScope = roleTopSignals.managerSurface ? roleTopSignals.managerPlant : 'all'
    const grouped = new Map<string, { size: string; pendingQty: number; rowCount: number; routePlant: 'plant-a' | 'plant-b'; asOf: string }>()
    for (const row of rows.filter((item): item is PendingProductionCloseRow => Boolean(item))) {
      const size = erpDisplayText(row.size, '')
      const pendingQty = metricNumber(row.pending_qty)
      if (!size || pendingQty <= 0) continue
      const rowScope = metricScopeFromText(`${row.plant || ''} ${size} ${row.source?.source || ''}`)
      if (activeScope !== 'all' && rowScope !== activeScope) continue
      const routePlant = rowScope === 'plant-b' ? 'plant-b' : 'plant-a'
      const asOf = latestYmdToken([
        ...ymdTokens(row.updated_at),
        ...ymdTokens(row.source?.captured_at),
        ...ymdTokens(row.source?.date_context),
        ...ymdTokens(row.source?.period_label),
      ])
      const key = `${routePlant}|${size}|${asOf}`
      const current = grouped.get(key) ?? { size, pendingQty: 0, rowCount: 0, routePlant, asOf }
      current.pendingQty += pendingQty
      current.rowCount += Math.max(1, metricNumber(row.row_count))
      grouped.set(key, current)
    }
    return [...grouped.entries()]
      .sort((a, b) => {
        const [, left] = a
        const [, right] = b
        return right.asOf.localeCompare(left.asOf) || right.pendingQty - left.pendingQty
      })
      .slice(0, roleTopSignals.managerSurface ? 2 : 4)
      .map(([key, row]) => {
        const plantLabel = normalizePlantLabel(row.routePlant)
        return {
          key,
          label: `Confirm ${row.size}`,
          detail: `${Math.round(row.pendingQty).toLocaleString()} pcs / ${plantLabel}${row.asOf ? ` / ${row.asOf}` : ''}`,
          size: row.size,
          pendingQty: row.pendingQty,
          plant: plantLabel,
          routePlant: row.routePlant,
          asOf: row.asOf,
        }
      })
  }, [roleTopSignals.managerPlant, roleTopSignals.managerSurface, state.operatingMetrics?.story?.size_breakdowns?.pending_production_close])

  const captureShortcuts = useMemo(() => {
    const managerPlant = roleTopSignals.managerSurface ? roleTopSignals.managerPlant : 'plant-a'
    const managerReportCount = metricNumber(state.managerReport?.summary?.manager_entry_count || state.managerReport?.summary?.row_count)
    const whiteboardCount = metricNumber(state.managerReport?.summary?.whiteboard_ocr_count)
    const shared = {
      salesDispatch: {
        key: 'sales-dispatch',
        label: 'Sales dispatch',
        detail: 'Capture sold and dispatched quantity',
        route: buildEntryModeRoute('kpi_snapshot', 'Sales / inventory'),
      },
      inventoryClose: {
        key: 'inventory-close',
        label: 'Inventory close',
        detail: 'Capture opening, received, issued, and closing qty',
        route: buildEntryModeRoute('kpi_snapshot', 'Showroom stock board'),
      },
      qualityIssue: {
        key: 'quality-issue',
        label: 'Quality issue',
        detail: 'Log defect, hold, or claim',
        route: buildEntryModeRoute('quality_incident', 'QC / inspection'),
      },
      dailySummary: {
        key: 'daily-summary',
        label: 'Daily summary',
        detail: dailyCloseSummaryText,
        route: sanitizeText(state.dailyClose?.next_action?.route, buildDailyEntryRoute('daily_routine', managerPlant)),
      },
    }
    if (roleTopSignals.managerSurface) {
      return [
        {
          key: 'board-ocr',
          label: 'Board photo',
          detail: whiteboardCount > 0 ? `${whiteboardCount.toLocaleString()} board captures ready` : 'Upload whiteboard photo and read values',
          route: buildDailyEntryRoute('whiteboard_snapshot', managerPlant),
        },
        {
          key: 'daily-5w1h',
          label: 'Daily 5W1H',
          detail: managerReportCount > 0 ? `${managerReportCount.toLocaleString()} manager reports ready` : 'Who, what, where, when, why, how',
          route: buildDailyEntryRoute('daily_routine', managerPlant),
        },
        {
          key: 'abnormal-report',
          label: 'Abnormal 5W1H',
          detail: 'Issue, containment, owner',
          route: buildDailyEntryRoute('daily_routine', managerPlant, { condition: 'abnormal' }),
        },
        shared.salesDispatch,
        shared.inventoryClose,
        shared.qualityIssue,
      ]
    }
    return [shared.dailySummary, shared.salesDispatch, shared.inventoryClose, shared.qualityIssue]
  }, [dailyCloseSummaryText, roleTopSignals.managerPlant, roleTopSignals.managerSurface, state.dailyClose?.next_action?.route, state.managerReport?.summary?.manager_entry_count, state.managerReport?.summary?.row_count, state.managerReport?.summary?.whiteboard_ocr_count])

  const adminDataTools = useMemo(() => {
    if (!adminCanSync) return []
    return [
      {
        key: 'admin-data-entry',
        label: 'Role access',
        detail: 'Manage user roles and module visibility',
        route: '/app/platform-admin',
      },
      {
        key: 'admin-forms',
        label: 'Data entry forms',
        detail: 'Open controlled daily forms',
        route: '/app/daily-entry?mode=document_control',
      },
      {
        key: 'admin-board',
        label: 'Company board',
        detail: 'Cross-team approvals and handoffs',
        route: '/app/action-board',
      },
    ]
  }, [adminCanSync])

  useEffect(() => {
    const lane = selectedTransactionLane(roleDefaults.defaultLane)
    setTransactionForm((current) => {
      if (
        current.transaction_type === lane.id &&
        current.owner === roleDefaults.defaultOwner &&
        current.location === roleDefaults.defaultLocation
      ) {
        return current
      }
      if (current.item_name.trim() || current.quantity.trim() || current.notes.trim()) {
        return current
      }
      return defaultTransactionForm(lane.id, {
        owner: roleDefaults.defaultOwner,
        location: roleDefaults.defaultLocation,
      })
    })
  }, [roleDefaults.defaultLane, roleDefaults.defaultLocation, roleDefaults.defaultOwner])

  useEffect(() => {
    const defaultOwners = new Set(Object.values(ROLE_DEFAULTS).map((defaults) => defaults.defaultOwner.toLowerCase()))
    setTeamTaskOwner((current) => {
      const normalized = current.trim().toLowerCase()
      if (!normalized || defaultOwners.has(normalized)) return roleDefaults.defaultOwner
      return current
    })
  }, [roleDefaults.defaultOwner])

  async function refreshRoleSurfaces(options: { refresh?: boolean; includeTransactions?: boolean } = {}) {
    const includeTransactions = options.includeTransactions ?? true
    const refreshed = await Promise.allSettled([
      getYtfRoleMetrics({ refresh: options.refresh ?? true }),
      getYtfRoleFocus(),
      getYtfOperatingMetrics({ compact: true, refresh: options.refresh ?? true }),
      includeTransactions ? getYtfErpTransactions(40) : Promise.resolve(null),
      getYtfManagerFiveWOneHReport(6),
      getYtfDailyCloseSummary(),
    ])
    const nextRoleMetrics = settledValue(refreshed[0])
    const nextRoleFocus = settledValue(refreshed[1])
    const nextOperatingMetrics = settledValue(refreshed[2])
    const nextTransactions = settledValue(refreshed[3])
    const nextManagerReport = settledValue(refreshed[4])
    const nextDailyClose = settledValue(refreshed[5])
    setState((current) => ({
      ...current,
      roleMetrics: nextRoleMetrics ?? current.roleMetrics,
      roleFocus: nextRoleFocus ?? current.roleFocus,
      operatingMetrics: nextOperatingMetrics ?? current.operatingMetrics,
      transactions: nextTransactions ?? current.transactions,
      managerReport: nextManagerReport ?? current.managerReport,
      dailyClose: nextDailyClose ?? current.dailyClose,
    }))
  }

  async function handleSync() {
    if (!adminCanSync) return
    setState((current) => ({ ...current, syncMessage: 'Refreshing data...' }))
    try {
      await refreshRoleSurfaces({ refresh: true, includeTransactions: true })
      setState((current) => ({ ...current, syncMessage: `Refreshed ${compactDateTime(new Date().toISOString())}.` }))
    } catch (error) {
      setState((current) => ({
        ...current,
        syncMessage: error instanceof Error ? error.message : 'Refresh did not finish.',
      }))
    }
  }

  function handleTransactionLane(laneId: string) {
    const lane = selectedTransactionLane(laneId)
    setTransactionForm((current) => ({
      ...defaultTransactionForm(lane.id, {
        owner: roleDefaults.defaultOwner,
        location: lane.id === 'production_order' ? roleDefaults.defaultLocation : lane.location,
      }),
      document_ref: current.document_ref,
      item_code: current.item_code,
      item_name: current.item_name,
      quantity: current.quantity,
      evidence_link: current.evidence_link,
      notes: current.notes,
    }))
  }

  async function handleTransactionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (transactionSaving || !transactionForm.item_name.trim() || !transactionForm.quantity.trim()) return
    setTransactionSaving(true)
    setTransactionMessage(null)
    try {
      const result = await createYtfErpTransaction({
        transaction_type: transactionForm.transaction_type,
        document_ref: transactionForm.document_ref.trim(),
        event_at: new Date().toISOString(),
        item_code: transactionForm.item_code.trim(),
        item_name: transactionForm.item_name.trim(),
        product_spec: transactionForm.item_name.trim(),
        quantity: transactionForm.quantity.trim(),
        unit: transactionForm.unit.trim() || selectedLane.unit,
        location: transactionForm.location.trim() || selectedLane.location,
        movement_type: transactionForm.movement_type.trim() || selectedLane.movement,
        planned_quantity: transactionForm.planned_quantity.trim(),
        actual_quantity: transactionForm.actual_quantity.trim() || transactionForm.quantity.trim(),
        scrap_quantity: transactionForm.scrap_quantity.trim(),
        batch_or_lot: transactionForm.batch_or_lot.trim(),
        owner: transactionForm.owner.trim() || selectedLane.owner,
        status: transactionForm.status.trim() || selectedLane.status,
        approval_gate: transactionForm.approval_gate.trim() || selectedLane.gate,
        evidence_link: transactionForm.evidence_link.trim(),
        notes: transactionForm.notes.trim(),
        create_approval: transactionForm.create_approval,
        idempotency_key: transactionForm.idempotency_key,
      })
      setState((current) => ({
        ...current,
        transactions: result,
      }))
      await refreshRoleSurfaces({ refresh: true, includeTransactions: true })
      setTransactionForm(
        defaultTransactionForm(transactionForm.transaction_type, {
          owner: roleDefaults.defaultOwner,
          location: roleDefaults.defaultLocation,
        }),
      )
      setTransactionMessage(result.message || `${selectedLane.label} saved.`)
    } catch (error) {
      setTransactionMessage(userSafeErpSaveError(error))
    } finally {
      setTransactionSaving(false)
    }
  }

  async function handleCreateTeamTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = teamTaskTitle.trim()
    if (!title || teamTaskSaving) return
    setTeamTaskSaving(true)
    setTeamTaskMessage(null)
    try {
      const owner = teamTaskOwner.trim() || roleDefaults.defaultOwner
      const due = teamTaskDue.trim()
      await createWorkspaceTasks([
        {
          title,
          owner,
          due: due || undefined,
          priority: 'medium',
          status: 'open',
          notes: 'Created from ERP team board.',
          template: 'ytf_team_board_task',
        },
      ])
      setTeamTaskTitle('')
      setTeamTaskDue('')
      setTeamTaskMessage('Task added to team board.')
      await refreshRoleSurfaces({ refresh: true, includeTransactions: true })
    } catch (error) {
      setTeamTaskMessage(error instanceof Error ? error.message : 'Task could not be saved.')
    } finally {
      setTeamTaskSaving(false)
    }
  }

  async function handleConfirmPendingProduction(row: (typeof pendingProductionActions)[number]) {
    if (productionConfirmingKey) return
    const size = row.size.trim()
    const pendingQty = Number(row.pendingQty || 0)
    if (!size || !Number.isFinite(pendingQty) || pendingQty <= 0) return
    setProductionConfirmingKey(row.key)
    setProductionConfirmMessage(null)
    try {
      const result = await confirmYtfProductionClose({
        size,
        plant: row.plant,
        pending_qty: String(pendingQty),
        good_qty: String(pendingQty),
        reject_qty: '0',
        board_date: row.asOf,
        shift: 'Daily close',
        source_updated_at: row.asOf,
        note: 'Manager confirmed from ERP production close queue.',
        idempotency_key: `ytf-erp-production-close:${row.key}`,
      })
      setProductionConfirmMessage(result.message || `${size} production close saved for review.`)
      await refreshRoleSurfaces({ refresh: true, includeTransactions: true })
    } catch (error) {
      setProductionConfirmMessage(error instanceof Error ? error.message : 'Production close could not be saved.')
    } finally {
      setProductionConfirmingKey('')
    }
  }

  async function handleCloseTeamTask(taskId: string) {
    const id = taskId.trim()
    if (!id || teamTaskSyncing) return
    setTeamTaskSyncing(true)
    setTeamTaskMessage(null)
    try {
      await updateWorkspaceTask(id, { status: 'done' })
      setTeamTaskMessage('Task closed.')
      await refreshRoleSurfaces({ refresh: true, includeTransactions: true })
    } catch (error) {
      setTeamTaskMessage(error instanceof Error ? error.message : 'Task update failed.')
    } finally {
      setTeamTaskSyncing(false)
    }
  }

  const visibleWorkRows = useMemo(() => {
    const rows = collaborationRows.length ? collaborationRows : transactionRows
    const combined = [...managerReportRows, ...rows]
    const deduped: WorkRow[] = []
    const seen = new Set<string>()
    for (const row of combined) {
      const key = `${row.title}|${row.route}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(row)
      if (deduped.length >= 8) break
    }
    return deduped
  }, [collaborationRows, managerReportRows, transactionRows])

  const collaborationSummary = useMemo(() => {
    const openCount = visibleWorkRows.filter((row) => {
      const normalizedState = sanitizeText(row.state, '').toLowerCase()
      const normalizedStatus = sanitizeText(row.status, '').toLowerCase()
      if (normalizedState === 'closed') return false
      if (['done', 'closed', 'resolved'].includes(normalizedStatus)) return false
      return true
    }).length
    const blockedCount = visibleWorkRows.filter((row) =>
      ['hold', 'blocked', 'pending', 'needs_review', 'needs-review'].includes(sanitizeText(row.status, '').toLowerCase()),
    ).length
    return {
      openCount,
      blockedCount,
      totalCount: visibleWorkRows.length,
    }
  }, [visibleWorkRows])

  const filteredWorkRows = useMemo(() => {
    const isOpenRow = (row: WorkRow) => {
      const normalizedState = sanitizeText(row.state, '').toLowerCase()
      const normalizedStatus = sanitizeText(row.status, '').toLowerCase()
      if (normalizedState === 'closed') return false
      if (['done', 'closed', 'resolved'].includes(normalizedStatus)) return false
      return true
    }
    const isBlockedRow = (row: WorkRow) =>
      ['hold', 'blocked', 'pending', 'needs_review', 'needs-review'].includes(sanitizeText(row.status, '').toLowerCase())
    const defaultOwner = sanitizeText(roleDefaults.defaultOwner, '').toLowerCase()
    const roleLabel = sanitizeText(roleDefaults.roleLabel, '').toLowerCase()
    const isMineRow = (row: WorkRow) => {
      const owner = sanitizeText(row.owner, '').toLowerCase()
      if (!owner) return false
      return Boolean((defaultOwner && owner.includes(defaultOwner)) || (roleLabel && owner.includes(roleLabel)))
    }
    if (teamViewFilter === 'blocked') return visibleWorkRows.filter(isBlockedRow)
    if (teamViewFilter === 'mine') return visibleWorkRows.filter(isMineRow)
    if (teamViewFilter === 'all') return visibleWorkRows
    return visibleWorkRows.filter(isOpenRow)
  }, [roleDefaults.defaultOwner, roleDefaults.roleLabel, teamViewFilter, visibleWorkRows])

  const roleScopeLine = useMemo(
    () =>
      metricContextRows
        .filter((item) => item.key === 'window' || item.key === 'scope')
        .map((item) => erpDisplayText(item.value, ''))
        .filter(Boolean)
        .join(' / '),
    [metricContextRows],
  )
  const visibleCaptureShortcuts = useMemo(
    () => captureShortcuts.slice(0, roleTopSignals.managerSurface ? 3 : 4),
    [captureShortcuts, roleTopSignals.managerSurface],
  )

  return (
    <div className="sm-ytf-erp-page" aria-busy={state.loading}>
      <section className="sm-ytf-erp-topline">
        <div>
          <h1>{roleDefaults.title}</h1>
          {roleScopeLine ? <p className="sm-ytf-erp-scope-line">{roleScopeLine}</p> : null}
        </div>
        <div className="sm-ytf-erp-top-actions">
          <Link to={roleDefaults.homeRoute}>{roleDefaults.roleLabel}</Link>
          {adminCanSync ? (
            <button disabled={state.loading} onClick={() => void handleSync()} type="button">
              Refresh
            </button>
          ) : null}
        </div>
      </section>

      {state.error ? <section className="sm-ytf-alert">{state.error}</section> : null}
      {state.syncMessage ? <section className="sm-ytf-alert">{state.syncMessage}</section> : null}

      <section className="sm-ytf-erp-ops-grid" aria-label="Role focus">
        {statusCards.map((card) => (
          <Link key={`${card.label}-${card.route}`} to={card.route}>
            <span>{erpDisplayText(card.label, 'Metric')}</span>
            <strong>{erpDisplayValue(card.value)}</strong>
            <small>
              {erpDisplayText(card.detail, 'Capture latest entry')}
              {periodHintFromDetail(card.label, card.detail) ? ` / ${periodHintFromDetail(card.label, card.detail)}` : ''}
            </small>
          </Link>
        ))}
      </section>

      <section className="sm-ytf-erp-command-grid">
        <article className="sm-ytf-erp-card sm-ytf-erp-entry-card">
          <div className="sm-ytf-erp-card-head">
            <div>
              <h2>{roleDefaults.entryTitle}</h2>
            </div>
            <span>{transactionSaving ? 'saving' : 'ready'}</span>
          </div>

          <div className="sm-ytf-erp-lane-buttons" role="group" aria-label="Transaction lane">
            {visibleTransactionTypes.map((lane) => (
              <button
                className={lane.id === transactionForm.transaction_type ? 'is-active' : ''}
                key={lane.id}
                onClick={() => handleTransactionLane(lane.id)}
                type="button"
              >
                {lane.label}
              </button>
            ))}
          </div>

          <form className="sm-ytf-erp-quick-form" onSubmit={(event) => void handleTransactionSubmit(event)}>
            <label className="sm-ytf-erp-field is-wide">
              <span>{selectedLane.itemLabel}</span>
              <input
                name="item_name"
                onChange={(event) => setTransactionForm((current) => ({ ...current, item_name: event.target.value }))}
                placeholder="Tyre size, stock item, defect, shift event"
                value={transactionForm.item_name}
              />
            </label>
            <label className="sm-ytf-erp-field">
              <span>{selectedLane.quantityLabel}</span>
              <input
                inputMode="decimal"
                name="quantity"
                onChange={(event) => setTransactionForm((current) => ({ ...current, quantity: event.target.value }))}
                placeholder="0"
                value={transactionForm.quantity}
              />
            </label>
            <label className="sm-ytf-erp-field">
              <span>Photo/link</span>
              <input
                name="evidence_link"
                onChange={(event) => setTransactionForm((current) => ({ ...current, evidence_link: event.target.value }))}
                placeholder="Optional"
                value={transactionForm.evidence_link}
              />
            </label>
            <label className="sm-ytf-erp-field is-wide">
              <span>Note</span>
              <input
                name="notes"
                onChange={(event) => setTransactionForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder={selectedLane.notePlaceholder}
                value={transactionForm.notes}
              />
            </label>
            <details className="sm-ytf-erp-advanced">
              <summary>Details</summary>
              <div>
                <label className="sm-ytf-erp-field">
                  <span>Location</span>
                  <input
                    name="location"
                    onChange={(event) => setTransactionForm((current) => ({ ...current, location: event.target.value }))}
                    value={transactionForm.location}
                  />
                </label>
                <label className="sm-ytf-erp-field">
                  <span>Owner</span>
                  <input
                    name="owner"
                    onChange={(event) => setTransactionForm((current) => ({ ...current, owner: event.target.value }))}
                    value={transactionForm.owner}
                  />
                </label>
                <label className="sm-ytf-erp-field">
                  <span>{selectedLane.documentLabel}</span>
                  <input
                    name="document_ref"
                    onChange={(event) => setTransactionForm((current) => ({ ...current, document_ref: event.target.value }))}
                    placeholder="Optional"
                    value={transactionForm.document_ref}
                  />
                </label>
                <label className="sm-ytf-erp-field">
                  <span>Batch/lot</span>
                  <input
                    name="batch_or_lot"
                    onChange={(event) => setTransactionForm((current) => ({ ...current, batch_or_lot: event.target.value }))}
                    placeholder="Optional"
                    value={transactionForm.batch_or_lot}
                  />
                </label>
                <label className="sm-ytf-erp-check">
                  <input
                    checked={transactionForm.create_approval}
                    onChange={(event) => setTransactionForm((current) => ({ ...current, create_approval: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Route for approval</span>
                </label>
              </div>
            </details>
            <button
              className="sm-ytf-erp-submit"
              disabled={transactionSaving || !transactionForm.item_name.trim() || !transactionForm.quantity.trim()}
              type="submit"
            >
              {transactionSaving ? 'Saving' : `Save ${selectedLane.label.toLowerCase()}`}
            </button>
          </form>
          {transactionMessage ? <div className="sm-ytf-erp-message">{transactionMessage}</div> : null}
        </article>

        <article className="sm-ytf-erp-card sm-ytf-erp-queue-card">
          <div className="sm-ytf-erp-card-head">
            <div>
              <h2>Needs action</h2>
            </div>
            <Link to="/app/action-board">Open board</Link>
          </div>

          <div className="sm-ytf-erp-context-strip" aria-label="Team summary">
            <span>
              <b>Open</b>
              <small>{collaborationSummary.openCount.toLocaleString()}</small>
            </span>
            <span>
              <b>Blocked</b>
              <small>{collaborationSummary.blockedCount.toLocaleString()}</small>
            </span>
            <span>
              <b>Total</b>
              <small>{collaborationSummary.totalCount.toLocaleString()}</small>
            </span>
          </div>
          <div className="sm-ytf-erp-team-filters" role="tablist" aria-label="Team board filter">
            <button
              aria-selected={teamViewFilter === 'open'}
              className={teamViewFilter === 'open' ? 'is-active' : ''}
              onClick={() => setTeamViewFilter('open')}
              type="button"
            >
              Open
            </button>
            <button
              aria-selected={teamViewFilter === 'blocked'}
              className={teamViewFilter === 'blocked' ? 'is-active' : ''}
              onClick={() => setTeamViewFilter('blocked')}
              type="button"
            >
              Blocked
            </button>
            <button
              aria-selected={teamViewFilter === 'mine'}
              className={teamViewFilter === 'mine' ? 'is-active' : ''}
              onClick={() => setTeamViewFilter('mine')}
              type="button"
            >
              Mine
            </button>
            <button
              aria-selected={teamViewFilter === 'all'}
              className={teamViewFilter === 'all' ? 'is-active' : ''}
              onClick={() => setTeamViewFilter('all')}
              type="button"
            >
              All
            </button>
          </div>

          <form className="sm-ytf-erp-team-form" onSubmit={(event) => void handleCreateTeamTask(event)}>
            <label className="sm-ytf-erp-field is-wide">
              <span>Task</span>
              <input
                name="task_title"
                onChange={(event) => setTeamTaskTitle(event.target.value)}
                placeholder="Add one handoff or follow-up task"
                value={teamTaskTitle}
              />
            </label>
            <label className="sm-ytf-erp-field">
              <span>Owner</span>
              <input
                name="task_owner"
                onChange={(event) => setTeamTaskOwner(event.target.value)}
                placeholder={roleDefaults.defaultOwner}
                value={teamTaskOwner}
              />
            </label>
            <label className="sm-ytf-erp-field">
              <span>Due</span>
              <input
                name="task_due"
                onChange={(event) => setTeamTaskDue(event.target.value)}
                placeholder="Today / Tomorrow / 2026-05-30"
                value={teamTaskDue}
              />
            </label>
            <button
              className="sm-ytf-erp-submit"
              disabled={teamTaskSaving || !teamTaskTitle.trim()}
              type="submit"
            >
              {teamTaskSaving ? 'Saving' : 'Add task'}
            </button>
          </form>
          {teamTaskMessage ? <div className="sm-ytf-erp-message">{teamTaskMessage}</div> : null}
          {productionConfirmMessage ? <div className="sm-ytf-erp-message">{productionConfirmMessage}</div> : null}

          <div className="sm-ytf-erp-action-list sm-ytf-erp-queue-list">
            {pendingProductionActions.length ? (
              <div className="sm-ytf-erp-module-strip sm-ytf-erp-missing-strip">
                {pendingProductionActions.map((item) => (
                  <button
                    disabled={Boolean(productionConfirmingKey)}
                    key={item.key}
                    onClick={() => void handleConfirmPendingProduction(item)}
                    type="button"
                  >
                    <span>Confirm production</span>
                    <strong>{item.label}</strong>
                    <small>{productionConfirmingKey === item.key ? 'Saving close...' : item.detail}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {missingDataRows.length ? (
              <div className="sm-ytf-erp-module-strip sm-ytf-erp-missing-strip">
                {missingDataRows.map((item) => (
                  <Link key={item.key} to={item.route}>
                    <span>{item.tone === 'stale' ? 'Stale data' : 'Missing data'}</span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="sm-ytf-erp-module-strip">
              {visibleCaptureShortcuts.map((shortcut) => (
                <Link key={shortcut.key} to={shortcut.route}>
                  <span>Capture</span>
                  <strong>{shortcut.label}</strong>
                  <small>{shortcut.detail}</small>
                </Link>
              ))}
            </div>
            {adminDataTools.length ? (
              <div className="sm-ytf-erp-module-strip">
                {adminDataTools.map((tool) => (
                  <Link key={tool.key} to={tool.route}>
                    <span>Admin</span>
                    <strong>{tool.label}</strong>
                    <small>{tool.detail}</small>
                  </Link>
                ))}
              </div>
            ) : null}
            {filteredWorkRows.map((row) => (
              <div className="sm-ytf-erp-work-row" key={row.key}>
                <Link to={row.route}>
                  <strong>{row.title}</strong>
                  <small>
                    {row.owner}
                    {row.detail ? ` / ${row.detail}` : ''}
                  </small>
                </Link>
                {row.taskId && !['done', 'closed', 'resolved'].includes(sanitizeText(row.status, '').toLowerCase()) ? (
                  <button
                    className="sm-ytf-erp-work-close"
                    disabled={teamTaskSyncing}
                    onClick={() => void handleCloseTeamTask(row.taskId || '')}
                    type="button"
                  >
                    Done
                  </button>
                ) : null}
              </div>
            ))}
            {!filteredWorkRows.length ? <div className="sm-ytf-erp-empty">No matching team work right now.</div> : null}
          </div>

        </article>
      </section>
    </div>
  )
}
