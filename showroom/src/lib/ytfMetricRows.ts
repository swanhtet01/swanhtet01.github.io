import type { YtfOperatingMetricsResult } from './workspaceApi'

export type YtfOperatingMetricRow = NonNullable<YtfOperatingMetricsResult['top_rows']>[number]
export type YtfOperatingMetricScope = 'plant-a' | 'plant-b' | 'shared' | 'all'
export type YtfOperatingMetricCategory = 'production' | 'quality' | 'stock' | 'supplier' | 'maintenance' | 'raw-material' | 'all'

const MYANMAR_NOTE = '\u1019\u103e\u1010\u103a\u1001\u103b\u1000\u103a'
const MYANMAR_ACTUAL_PRODUCTION =
  '\u1021\u1019\u103e\u1014\u103a\u1010\u1000\u101a\u103a\u1011\u102f\u1010\u103a\u101c\u102f\u1015\u103a\u1019\u103e\u102f'

const GENERIC_METRIC_NAMES = new Set([
  '',
  'amount',
  'date',
  'description',
  'month',
  'name',
  'note',
  'notes',
  'qty',
  'quantity',
  'remark',
  'remarks',
  'total',
  'value',
  'year',
  MYANMAR_NOTE,
])

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function cleanMetricTitle(value: unknown): string {
  return cleanText(value).replace(/\s*:\s*(total|qty|quantity|amount|value)\s*$/i, '')
}

function readableStatus(value: unknown): string {
  const normalized = cleanText(value).toLowerCase().replace(/[_-]+/g, ' ')
  if (!normalized || normalized === 'value sample') return 'extracted'
  if (normalized === 'schema candidate') return 'candidate'
  return normalized
}

function readablePlantScope(value: unknown): string {
  const normalized = cleanText(value).toLowerCase()
  if (!normalized) return ''
  if (normalized.includes('Factory Floor/b') || normalized.includes('Factory Floor + b')) return 'Shared A+B source'
  if (normalized.includes('plant b') || normalized.includes('bilin')) return 'Plant B'
  if (normalized.includes('Factory Floor') || normalized.includes('yangon plant') || normalized.includes('yangon factory') || normalized.includes('shwe pyi thar')) return 'Factory Floor'
  return cleanText(value)
}

function haystack(row: YtfOperatingMetricRow): string {
  return [
    row.metric_name,
    row.metric_group,
    row.metric_family,
    row.tyre_size,
    row.row_label,
    row.lane,
    row.plant,
    row.site_scope,
    row.workbook,
    row.source_workbook,
    row.sheet_name,
    row.source_sheet,
    row.period_label,
    row.source,
  ]
    .map(cleanText)
    .join(' ')
    .toLowerCase()
}

function metricSourceText(row: YtfOperatingMetricRow): string {
  return [
    row.metric_name,
    row.metric_group,
    row.metric_family,
    row.tyre_size,
    row.row_label,
    row.lane,
    row.plant,
    row.site_scope,
    row.workbook,
    row.source_workbook,
    row.sheet_name,
    row.source_sheet,
    row.period_label,
    row.source,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(' ')
}

function twoDigitYearToFullYear(value: string): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return numeric >= 70 ? 1900 + numeric : 2000 + numeric
}

function monthNameYearCandidate(text: string): number | null {
  const match = text.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s_-]+(\d{2})\b/i,
  )
  return match ? twoDigitYearToFullYear(match[1]) : null
}

function metricPeriodYear(row: YtfOperatingMetricRow): number | null {
  const text = metricSourceText(row)
  const fullYears = [...text.matchAll(/\b(19[7-9]\d|20[0-3]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year))
  const shortDateYears = [...text.matchAll(/\b\d{1,2}[./-]\d{1,2}[./-](\d{2})\b/g)]
    .map((match) => twoDigitYearToFullYear(match[1]))
    .filter((year): year is number => Number.isFinite(year))
  const monthYear = monthNameYearCandidate(text)
  const candidates = [...fullYears, ...shortDateYears, ...(monthYear ? [monthYear] : [])]
  return candidates.length ? Math.max(...candidates) : null
}

function hasArchiveMetricMarker(row: YtfOperatingMetricRow): boolean {
  const text = metricSourceText(row).toLowerCase()
  return [
    '2017-tube',
    '2017 tube',
    '2018',
    '2019',
    '2019-2022',
    '2020 h1',
    '2021',
    '2022',
    'jan-2024 costing',
    'costing 3400',
    'price list',
    'rate list',
    'building spec',
    'design',
    'drawing',
    'autocad',
    'dwg',
    '2022 to 2024',
    'h1 2024 financial',
    'specification',
    'analysis workbook',
    'archive',
    'historical',
    'old data',
  ].some((marker) => text.includes(marker))
}

function hasValue(row: YtfOperatingMetricRow): boolean {
  const value = cleanText(row.value)
  return value.length > 0 && value.toLowerCase() !== 'pending'
}

function hasTyreSize(value: string): boolean {
  return /\b\d{3}\/\d{2}\s*r\s*\d{2,3}\b|\b\d{1,2}(?:\.\d{2})?\/\d{1,2}(?:\.\d{2})?-\d{2,3}\b|\b\d{1,2}(?:\.\d{2})?-\d{2,3}\b/i.test(value)
}

function operatingScopeKind(row: YtfOperatingMetricRow): YtfOperatingMetricScope {
  const text = metricSourceText(row).toLowerCase()
  if (
    /plant\s*a\s*(?:\/|\+|and)\s*b|plant\s*a\s*[- ]?b|a\+b|shared\s*a\s*\+\s*b|yangon\s*(?:\/|\+|and)\s*bilin|bilin\s*(?:\/|\+|and)\s*yangon/.test(
      text,
    )
  ) {
    return 'shared'
  }
  if (/\bplant\s*b\b|bilin|belin|mon\s*state|large\s*machinery|no\.?\s*2\s*factory/.test(text)) {
    return 'plant-b'
  }
  if (/plant\s*a|shwe\s*pyi\s*thar|yangon\s+(?:plant|factory|site)|(?:plant|factory|site)\s+yangon/.test(text)) {
    return 'plant-a'
  }
  return 'shared'
}

function categoryScore(text: string, category: YtfOperatingMetricCategory) {
  if (category === 'all') return 0
  if (category === 'production') {
    let score = 0
    if (/monthly tyre production|tyre production|daily production|production report|output|produced|actual production|curing|mixing|building|tube production|actual wt|total wt|wip/.test(text)) score += 95
    if (/claim|defect|supplier|purchase|invoice|costing|price list|salary|cashbook/.test(text)) score -= 45
    return score
  }
  if (category === 'quality') {
    let score = 0
    if (/claim tyre|claim\s+tyre|s\.?r\.?\s*claim|defect|reject|quality|qc|hold|inspection|waste|repair|return/.test(text)) score += 92
    if (/price list|costing|salary|cashbook|purchase order/.test(text)) score -= 40
    return score
  }
  if (category === 'stock') {
    let score = 0
    if (/stock|inventory|warehouse|ware house|showroom|balance board|sales balance|stock movement|issue|issued|received|dispatch|delivery/.test(text)) score += 88
    if (/salary|passport|license|costing 3400/.test(text)) score -= 45
    return score
  }
  if (category === 'supplier' || category === 'raw-material') {
    let score = 0
    if (/purchase|supplier|invoice|payment|natural rubber|raw material|rss|po\b|purchase order|order ton|junky|kiic|mr dong|mr cheng/.test(text)) score += 86
    if (/tyre sales|claim tyre|salary|passport|license/.test(text)) score -= 35
    return score
  }
  if (category === 'maintenance') {
    let score = 0
    if (/downtime|breakdown|maintenance|machine|curing press|utility|repair|spare|motor|compressor|boiler|mixer/.test(text)) score += 88
    if (/sales|dealer|invoice|price list|salary|passport/.test(text)) score -= 35
    return score
  }
  return 0
}

function scopeScore(scope: YtfOperatingMetricScope, preferredScope: YtfOperatingMetricScope) {
  if (preferredScope === 'all') return 0
  if (scope === preferredScope) return 90
  if (scope === 'shared') return preferredScope === 'shared' ? 50 : -25
  return -130
}

function normalizeCategory(value?: string): YtfOperatingMetricCategory {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('production')) return 'production'
  if (normalized.includes('quality') || normalized.includes('claim') || normalized.includes('qc')) return 'quality'
  if (normalized.includes('stock') || normalized.includes('inventory') || normalized.includes('sales')) return 'stock'
  if (normalized.includes('supplier') || normalized.includes('procurement')) return 'supplier'
  if (normalized.includes('raw')) return 'raw-material'
  if (normalized.includes('maintenance') || normalized.includes('downtime')) return 'maintenance'
  return 'all'
}

export function isGenericYtfMetricName(name: unknown): boolean {
  const normalized = cleanText(name).toLowerCase()
  if (GENERIC_METRIC_NAMES.has(normalized)) return true
  return /^(sr\.?\s*no\.?|no|id|code|class|column[_\s-]?\d+|serial|\d+(?:\.\d+)?(?:_\d+)?)$/.test(normalized)
}

export function scoreYtfOperatingMetric(
  row: YtfOperatingMetricRow,
  options: { preferredScope?: YtfOperatingMetricScope; category?: YtfOperatingMetricCategory | string; minYear?: number } = {},
): number {
  const text = haystack(row)
  const name = cleanText(row.metric_name)
  if (!name || !hasValue(row)) return -20
  if (name === MYANMAR_NOTE || /(remark|notes?)\b/.test(name.toLowerCase())) return -100
  if (/salary|cashbook|cash book|bank|passport|license|licence|company\s*&\s*business owner/.test(text)) return -100
  if (/opening balance|closing balance/.test(text) && !/(stock|inventory|warehouse|showroom|sales balance|balance board)/.test(text)) return -100

  const preferredScope = options.preferredScope ?? 'all'
  const category = normalizeCategory(options.category)
  const scope = operatingScopeKind(row)
  const year = metricPeriodYear(row)
  const minYear = options.minYear ?? 2024
  let score = 0
  score += scopeScore(scope, preferredScope)
  score += categoryScore(text, category)
  if (/monthly tyre production|tyre production|daily production|production report|curing|mixing|building|tube production|actual wt|total wt/.test(text)) score += 58
  if (/claim tyre|claim\s+tyre|s\.?r\.?\s*claim|defect|reject/.test(text)) score += 42
  if (/stock ware house|warehouse|showroom|balance board|sales balance|stock movement/.test(text)) score += 38
  if (hasTyreSize(text)) score += 42
  if (text.includes(MYANMAR_ACTUAL_PRODUCTION) || /(actual|production|output|produced)\b/.test(text)) score += 90
  if (/(target|plan|schedule|attainment|weekly|monthly)\b/.test(text)) score += 34
  if (/(reject|defect|claim|quality|hold|inspection|waste)\b/.test(text)) score += 55
  if (/(downtime|breakdown|maintenance|machine|curing|mixing|building|utility)\b/.test(text)) score += 50
  if (/(stock|inventory|sales?|dealer|cash sale|wholesale|retail)\b/.test(text)) score += 42
  if (/(purchase|supplier|invoice|payment|cost|amount|natural rubber)\b/.test(text)) score += 34
  if (/(drive|sheet|workbook|extracted|source_workbook|source sheet)/.test(text)) score += 12
  if (isGenericYtfMetricName(name) && !hasTyreSize(text)) score -= 18
  if (year && year >= new Date().getFullYear() - 1) score += 34
  if (year && year < minYear) score -= 150
  if (!year && /(production|stock|claim|purchase|supplier)/.test(text)) score -= 10
  if (hasArchiveMetricMarker(row)) score -= 180
  return score
}

export function ytfOperatingMetricScope(row: YtfOperatingMetricRow): YtfOperatingMetricScope {
  return operatingScopeKind(row)
}

export function selectTopYtfOperatingRows(
  rows: YtfOperatingMetricRow[] = [],
  limit = 8,
  options: { preferredScope?: YtfOperatingMetricScope; category?: YtfOperatingMetricCategory | string; minYear?: number } = {},
): YtfOperatingMetricRow[] {
  return rows
    .map((row, index) => ({ row, index, score: scoreYtfOperatingMetric(row, options) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.row)
}

export function ytfOperatingMetricTitle(row: YtfOperatingMetricRow): string {
  const name = cleanText(row.metric_name)
  const label = cleanText(row.row_label)
  const lane = cleanText(row.lane)
  const tyreSize = cleanText(row.tyre_size)
  const family = cleanText(row.metric_family)
  if (tyreSize && (!name || isGenericYtfMetricName(name) || /actual production|production|output/i.test(name))) {
    return [tyreSize, family || lane].filter(Boolean).join(' - ')
  }
  if (!name || isGenericYtfMetricName(name)) return cleanMetricTitle(label) || (lane ? `${lane} value` : 'Plant number')
  return cleanMetricTitle(name)
}

export function ytfOperatingMetricValue(row: YtfOperatingMetricRow): string {
  const value = cleanText(row.value)
  if (!value) return 'Needs entry'
  if (/^0(?:\.0+)?\s*(?:pcs|kg|ton|mmk)?$/i.test(value)) return 'Needs entry'
  if (/\b0\s+pcs\b/i.test(value)) return value.replace(/\b0\s+pcs\b/gi, 'Needs entry')
  return value
}

export function ytfOperatingMetricContext(row: YtfOperatingMetricRow): string {
  const name = cleanText(row.metric_name)
  const rowLabel = cleanText(row.row_label)
  const period = cleanText(row.period_label)
  const base = [cleanText(row.metric_family) || cleanText(row.lane), cleanText(row.site_scope) || readablePlantScope(row.plant), period].filter(Boolean)
  if (!isGenericYtfMetricName(name) && rowLabel) base.push(rowLabel)
  return base.join(' / ') || 'Extracted row'
}

export function ytfOperatingMetricSource(row: YtfOperatingMetricRow): string {
  return [cleanText(row.site_scope) || readablePlantScope(row.plant), cleanText(row.period_label)].filter(Boolean).join(' / ') || 'Operational record'
}

export function ytfOperatingMetricStatus(row: YtfOperatingMetricRow): string {
  return readableStatus(row.status)
}
