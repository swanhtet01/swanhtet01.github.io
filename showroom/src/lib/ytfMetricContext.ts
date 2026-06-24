import { ytfWcmMetricLens } from './ytfWcmModel'

type YtfMetricSourceLike = Record<string, unknown>

export type YtfSizeMetricLike = {
  size?: string
  material?: string
  plant?: string
  status?: string
  plants?: Record<string, number>
  periods?: string[]
  metric_names?: string[]
  source?: YtfMetricSourceLike
  output_qty?: number | null
  weight_kg?: number | null
  claim_qty?: number | null
  claim_amount?: number | null
  opening_qty?: number | null
  received_qty?: number | null
  issued_qty?: number | null
  closing_qty?: number | null
  movement_qty?: number | null
  pcs?: number | null
  amount?: number | null
  unit_price?: number | null
  order_ton?: number | null
  order_lb?: number | null
  amount_mmk?: number | null
}

export type YtfMetricDisplayCard = {
  label: string
  value: string
  detail: string
  source: string
  route: string
  wcm?: string
  wcmAction?: string
}

export type YtfPlantScope = 'plant-a' | 'plant-b' | 'shared' | 'all'

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function cleanSourceName(value: unknown): string {
  return asText(value).replace(/[_-][0-9a-f]{8,}(?:-[0-9a-f]{4,})*$/i, '').trim()
}

function normalizeVisiblePeriodLabel(value: string): string {
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
  return value
    .replace(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s_-]+(\d{2,4})\b/gi,
      (match, rawMonth: string, rawYear: string) => {
        const month = monthMap[rawMonth.toLowerCase()] || ''
        const yearNumber = Number(rawYear)
        const year =
          rawYear.length === 4
            ? yearNumber
            : yearNumber >= 70
              ? 1900 + yearNumber
              : 2000 + yearNumber
        return month && Number.isFinite(year) ? `${year}-${month}` : match
      },
    )
    .replace(
      /\b(\d{4})[\s_-]+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\b/gi,
      (match, rawYear: string, rawMonth: string) => {
        const month = monthMap[rawMonth.toLowerCase()] || ''
        const year = Number(rawYear)
        return month && Number.isFinite(year) ? `${year}-${month}` : match
      },
    )
    .replace(/\bjan\s*to\s*december\b/gi, 'full year')
}

function compactText(value: unknown, maxLength = 96): string {
  const text = normalizeVisiblePeriodLabel(cleanSourceName(value)).replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trim()}…`
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value)
    if (text) return text
  }
  return ''
}

function looksLikeTyreSize(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    /\b\d{2,3}\s*\/\s*\d{2,3}\s*r\s*\d{2,3}\b/i.test(normalized) ||
    /\b\d(?:\.\d{2})?-\d{2,3}\b/i.test(normalized) ||
    /\b\d{2,3}\s*\/\s*\d{2,3}-\d{2,3}\b/i.test(normalized)
  )
}

function periodCandidate(value: unknown): string {
  const text = compactText(value, 64)
  if (!text) return ''
  if (looksLikeTyreSize(text)) return ''
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(text) && !/^(19|20)\d{2}$/.test(text)) return ''
  if (/^(kg|pcs|qty|amount|total|balance|opening|closing|issue|receive)$/i.test(text)) return ''
  return text
}

function collectMetricSourceText(row: YtfSizeMetricLike): string {
  const source = row.source ?? {}
  return [
    row.size,
    row.material,
    row.plant,
    ...(row.periods ?? []),
    ...(row.metric_names ?? []),
    source.date_context,
    source.period_label,
    source.sheet_name,
    source.source_sheet,
    source.workbook,
    source.source_workbook,
    source.file_name,
    source.title,
    source.row_label,
    source.source_path,
    source.source_root_title,
    source.domain,
    source.department,
    source.source_behavior,
    source.modified_time,
    source.source,
  ]
    .map(asText)
    .filter(Boolean)
    .join(' ')
}

function collectMetricProductText(row: YtfSizeMetricLike): string {
  const source = row.source ?? {}
  return [
    row.size,
    row.material,
    ...(row.metric_names ?? []),
    source.row_label,
    source.metric_name,
    source.metric_key,
    source.title,
  ]
    .map(asText)
    .filter(Boolean)
    .join(' ')
}

function hasArchiveSourceMarker(row: YtfSizeMetricLike): boolean {
  const text = collectMetricSourceText(row).toLowerCase()
  return [
    '2017-tube',
    '2017 tube',
    '2018',
    '2019-2022',
    '2020 h1',
    'jan-2024 costing',
    'costing 3400',
    'price list',
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
  ].some((marker) => text.includes(marker))
}

function monthNameYearCandidate(text: string): number | null {
  const match = text.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s_-]+(\d{2})\b/i)
  if (!match) return null
  const twoDigit = Number(match[1])
  if (!Number.isFinite(twoDigit)) return null
  return twoDigit >= 70 ? 1900 + twoDigit : 2000 + twoDigit
}

export function ytfMetricPeriodYear(row: YtfSizeMetricLike): number | null {
  const text = collectMetricSourceText(row)
  const fullYears = [...text.matchAll(/\b(19[7-9]\d|20[0-3]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year))
  const shortDateYears = [...text.matchAll(/\b\d{1,2}[./-]\d{1,2}[./-](\d{2})\b/g)]
    .map((match) => {
      const twoDigit = Number(match[1])
      if (!Number.isFinite(twoDigit)) return null
      return twoDigit >= 70 ? 1900 + twoDigit : 2000 + twoDigit
    })
    .filter((year): year is number => Number.isFinite(year))
  const monthYear = monthNameYearCandidate(text)
  const candidates = [...fullYears, ...shortDateYears, ...(monthYear ? [monthYear] : [])]
  return candidates.length ? Math.max(...candidates) : null
}

const YTF_DAY_MS = 86_400_000

function parseMetricDateToken(value: unknown, maxYear: number): Date | null {
  const raw = asText(value)
  if (!raw) return null
  const isoDate = new Date(raw)
  if (!Number.isNaN(isoDate.getTime()) && isoDate.getUTCFullYear() <= maxYear) return isoDate

  const monthYearMatch = raw.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s_-]+(\d{2,4})\b/i,
  )
  if (monthYearMatch) {
    const monthToken = monthYearMatch[1].toLowerCase()
    const yearToken = monthYearMatch[2]
    const monthIndex = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    }[monthToken]
    const yearValue =
      yearToken.length === 4
        ? Number(yearToken)
        : Number(yearToken) >= 70
          ? 1900 + Number(yearToken)
          : 2000 + Number(yearToken)
    if (Number.isInteger(monthIndex) && Number.isFinite(yearValue) && yearValue <= maxYear) {
      const parsed = new Date(Date.UTC(yearValue, monthIndex, 1))
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }

  const ymdMatch = raw.match(/\b(20\d{2})[-/](\d{1,2})(?:[-/](\d{1,2}))?\b/)
  if (ymdMatch) {
    const year = Number(ymdMatch[1])
    const month = Number(ymdMatch[2])
    const day = Number(ymdMatch[3] || '1')
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && year <= maxYear) {
      const parsed = new Date(Date.UTC(year, Math.min(11, Math.max(0, month - 1)), Math.min(31, Math.max(1, day))))
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }

  const dmyMatch = raw.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && year <= maxYear) {
      const parsed = new Date(Date.UTC(year, Math.min(11, Math.max(0, month - 1)), Math.min(31, Math.max(1, day))))
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }

  const yearMatch = raw.match(/\b(19[7-9]\d|20[0-3]\d)\b/)
  if (yearMatch) {
    const year = Number(yearMatch[1])
    if (Number.isFinite(year) && year <= maxYear) return new Date(Date.UTC(year, 0, 1))
  }

  return null
}

function ytfMetricLatestTimestamp(
  row: YtfSizeMetricLike,
  options: { includeIngestFallback?: boolean; preferBusinessDate?: boolean } = {},
): Date | null {
  const source = row.source ?? {}
  const rowRecord = row as Record<string, unknown>
  const maxYear = new Date().getUTCFullYear() + 1
  const businessValues = [
    ...((row.periods ?? []).map((period) => asText(period))),
    asText(rowRecord.period_label),
    asText(rowRecord.date_context),
    asText(source.period_label),
    asText(source.date_context),
  ].filter(Boolean)
  const ingestValues = options.includeIngestFallback
    ? [
        asText(rowRecord.captured_at),
        asText(rowRecord.synced_at),
        asText(rowRecord.updated_at),
        asText(rowRecord.modified_time),
        asText(source.captured_at),
        asText(source.synced_at),
        asText(source.updated_at),
        asText(source.modified_time),
      ].filter(Boolean)
    : []

  const businessCandidates = businessValues
    .map((value) => parseMetricDateToken(value, maxYear))
    .filter((value): value is Date => Boolean(value))
  if (businessCandidates.length && options.preferBusinessDate !== false) {
    return new Date(Math.max(...businessCandidates.map((value) => value.getTime())))
  }

  const combinedCandidates = [
    ...businessCandidates,
    ...ingestValues
      .map((value) => parseMetricDateToken(value, maxYear))
      .filter((value): value is Date => Boolean(value)),
  ]
  if (!combinedCandidates.length) return null
  return new Date(Math.max(...combinedCandidates.map((value) => value.getTime())))
}

export function normalizeYtfPlantScope(value?: unknown, fallback: YtfPlantScope = 'all'): YtfPlantScope {
  const normalized = asText(value).toLowerCase().replace(/[_\s]+/g, '-')
  if (/\b(shared|company|a(?:\+|&|\/|-)?b|plant-a(?:and|\+|&|\/|-)?plant-b|plant-a-b)\b/.test(normalized)) return 'shared'
  if (/\b(plant-b|bilin|belin|mon-state|mon-plant|radial|motorcycle|motor-cycle|mc|pcr|m-c|large-machinery|factory-no-2|no-2)\b/.test(normalized)) return 'plant-b'
  if (/\b(plant-a|shwe-pyi-thar|shwepyi-thar|shwepyithar|yangon-plant|yangon-factory|spt|bias|nylon|agricultural|agri)\b/.test(normalized)) return 'plant-a'
  return fallback
}

export function inferYtfTextPlantScope(value: unknown, fallback: YtfPlantScope = 'shared'): YtfPlantScope {
  const text = asText(value)
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/[–—]/g, '-')
  const hasShared = /(shared|a\s*\+\s*b|a\s*&\s*b|a\s*\/\s*b|plant\s*a\s*(?:and|\+|&|\/)\s*b|company|head\s*office|ceo|finance|all\s+plants)/.test(text)
  const hasPlantBSite = /(plant\s*b|bilin|belin|mon\s*state|mon\s+plant|large\s+machinery|factory\s*no\.?\s*2|no\.?\s*2\s+large\s+machinery)/.test(text)
  const hasPlantBProduct =
    /(radial|\bpcr\b|motor\s*cycle|motorcycle|\bmc\b|m\s*c\s*production|mc\s*stock|motorbike)/.test(text) ||
    /\b\d{2,3}\s*\/\s*\d{2,3}\s*r\s*\d{1,2}\b/.test(text)
  const hasPlantASite = /(plant\s*a|shwe\s*pyi\s*thar|shwepyi\s*thar|shwepyithar|yangon\s+(?:plant|factory|site)|(?:plant|factory|site)\s+yangon|\bspt\b)/.test(text)
  const hasPlantAProduct = /(bias|nylon|agricultural|agri|farm\s+tyre|tractor\s+tyre|truck\s+bias)/.test(text)
  const hasPlantASize = [...text.matchAll(/\b(\d{1,2})(?:\.\d{2})-(\d{2})\b/g)].some((match) => {
    const width = Number(match[1])
    const rim = Number(match[2])
    return Number.isFinite(width) && Number.isFinite(rim) && width >= 4 && rim <= 16
  })
  const hasPlantB = hasPlantBSite || hasPlantBProduct
  const hasPlantA = hasPlantASite || hasPlantAProduct || hasPlantASize

  if (hasPlantBProduct && !(hasPlantAProduct || hasPlantASize)) return 'plant-b'
  if ((hasPlantAProduct || hasPlantASize) && !hasPlantBProduct) return 'plant-a'
  if (hasPlantA && hasPlantB) return 'shared'
  if (hasPlantA) return 'plant-a'
  if (hasPlantB) return 'plant-b'
  if (hasShared) return 'shared'
  return fallback
}

export function ytfMetricMatchesPlantScope(row: YtfSizeMetricLike, scope: YtfPlantScope): boolean {
  if (scope === 'all') return true
  const scopeKind = ytfMetricScopeKind(row)
  if (scope === 'plant-a') return scopeKind === 'plant-a'
  if (scope === 'plant-b') return scopeKind === 'plant-b'
  return scopeKind === 'shared'
}

export function ytfMetricMatchesExactPlantScope(row: YtfSizeMetricLike, scope: YtfPlantScope): boolean {
  if (scope === 'all') return true
  return ytfMetricScopeKind(row) === scope
}

export function ytfMetricPlantScopeText(scope: YtfPlantScope): string {
  if (scope === 'plant-a') return 'Factory Floor'
  if (scope === 'plant-b') return 'Plant B'
  if (scope === 'shared') return 'Company'
  return 'All plants'
}

export function ytfMetricScopeKind(row: YtfSizeMetricLike): YtfPlantScope {
  const text = collectMetricSourceText(row).toLowerCase().replace(/_/g, ' ')
  const plant = ytfPlantText(row)
  const explicitScope = normalizeYtfPlantScope(plant, 'all')
  if (explicitScope !== 'all') return explicitScope
  const productScope = inferYtfTextPlantScope(collectMetricProductText(row), 'all')
  if (productScope !== 'all') return productScope
  return inferYtfTextPlantScope(text, 'shared')
}

export function ytfMetricConfidenceLabel(row: YtfSizeMetricLike): string {
  const source = row.source ?? {}
  const confidence = asText(source.date_confidence || source.confidence || source.source_confidence)
  if (!confidence) return 'source confidence unknown'
  return `${confidence.toLowerCase()} confidence`
}

export function ytfMetricRecencyLabel(row: YtfSizeMetricLike): string {
  const year = ytfMetricPeriodYear(row)
  const currentYear = new Date().getFullYear()
  if (!year) return 'date needs check'
  if (year >= currentYear) return `current ${year}`
  if (year >= currentYear - 1) return `recent ${year}`
  return `archive ${year}`
}

export function ytfMetricSourceBadge(row: YtfSizeMetricLike): string {
  return `${ytfMetricRecencyLabel(row)} / ${ytfMetricConfidenceLabel(row)}`
}

function metricNumericValue(row: YtfSizeMetricLike, category: string): number {
  const normalized = category.toLowerCase()
  if (normalized.includes('production')) return Number(row.output_qty || row.pcs || 0)
  if (normalized.includes('quality') || normalized.includes('claim')) return Number(row.claim_qty || row.claim_amount || 0)
  if (normalized.includes('stock') || normalized.includes('inventory')) {
    return Number(row.movement_qty ?? row.received_qty ?? row.issued_qty ?? row.closing_qty ?? 0)
  }
  if (normalized.includes('supplier') || normalized.includes('procurement') || normalized.includes('raw')) {
    return Number(row.order_ton ?? row.order_lb ?? row.amount_mmk ?? row.amount ?? row.pcs ?? 0)
  }
  return Number(
    row.output_qty ??
      row.claim_qty ??
      row.movement_qty ??
      row.received_qty ??
      row.issued_qty ??
      row.closing_qty ??
      row.order_ton ??
      row.amount_mmk ??
      row.amount ??
      row.pcs ??
      0,
  )
}

export function ytfMetricOperationalScore(
  row: YtfSizeMetricLike,
  options: { category?: string; preferredScope?: YtfPlantScope; minYear?: number } = {},
): number {
  const category = options.category ?? ''
  const source = row.source ?? {}
  const text = collectMetricSourceText(row).toLowerCase()
  const year = ytfMetricPeriodYear(row)
  const currentYear = new Date().getFullYear()
  const scope = ytfMetricScopeKind(row)
  const numericValue = metricNumericValue(row, category)
  const confidence = asText(source.date_confidence || source.confidence || source.source_confidence).toLowerCase()
  const preferredScope = options.preferredScope ?? 'all'
  const minYear = options.minYear ?? currentYear - 2

  let score = 0
  if (!Number.isFinite(numericValue) || numericValue <= 0) score -= 80
  else score += 70

  if (year) {
    if (year >= currentYear) score += 42
    else if (year >= currentYear - 1) score += 34
    else if (year >= minYear) score += 18
    else score -= 90
  } else {
    score -= 24
  }

  if (confidence === 'high') score += 24
  else if (confidence === 'medium') score += 12
  else if (confidence === 'low') score -= 35

  if (preferredScope !== 'all') {
    if (scope === preferredScope) score += 80
    else if (scope === 'shared') score += 8
    else score -= 90
  }

  if (hasArchiveSourceMarker(row)) score -= 180
  if (looksLikeTyreSize(asText(row.size))) score += 14
  if (asText(source.workbook || source.source_workbook || source.file_name || source.title)) score += 10
  if (asText(source.sheet_name || source.source_sheet)) score += 8
  if (asText(source.row_label)) score += 8

  const normalizedCategory = category.toLowerCase()
  if (normalizedCategory.includes('production')) {
    if (row.output_qty && row.output_qty > 0) score += 70
    if (/monthly tyre production|daily production|tyre production|tube production|output|actual production|curing|mixing|building/.test(text)) score += 34
    if (/costing|price list|claim|purchase/.test(text)) score -= 30
  } else if (normalizedCategory.includes('quality') || normalizedCategory.includes('claim')) {
    if (row.claim_qty && row.claim_qty > 0) score += 70
    if (/claim|defect|reject|quality|inspection|hold/.test(text)) score += 34
    if (/price list|costing|purchase order/.test(text)) score -= 30
  } else if (normalizedCategory.includes('stock') || normalizedCategory.includes('inventory')) {
    if (numericValue > 0) score += 64
    if (/stock|warehouse|showroom|issue|issued|receive|received|closing|balance|dispatch/.test(text)) score += 36
    if (/costing|price list/.test(text)) score -= 30
  } else if (normalizedCategory.includes('supplier') || normalizedCategory.includes('procurement') || normalizedCategory.includes('raw')) {
    if (numericValue > 0) score += 58
    if (/purchase|supplier|invoice|raw material|natural rubber|rss|order|po\b/.test(text)) score += 34
  }

  return score
}

export function rankYtfMetricRows<T extends YtfSizeMetricLike>(
  rows: T[],
  options: { category?: string; preferredScope?: YtfPlantScope; minYear?: number } = {},
): T[] {
  return rows
    .map((row, index) => ({ row, index, score: ytfMetricOperationalScore(row, options) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.row)
}

export function ytfMetricIsCurrentOperational(
  row: YtfSizeMetricLike,
  options: {
    minYear?: number
    allowLowConfidence?: boolean
    allowArchiveMarker?: boolean
    maxAgeDays?: number
    preferBusinessDate?: boolean
    allowIngestFallback?: boolean
  } = {},
): boolean {
  const minYear = options.minYear ?? new Date().getFullYear() - 2
  const year = ytfMetricPeriodYear(row)
  const source = row.source ?? {}
  const confidence = asText(source.date_confidence).toLowerCase()
  const status = asText(row.status).toLowerCase().replace(/[-\s]+/g, '_')
  const latestAvailable = status === 'manager_confirmed'
  if (!year || year < minYear) return false
  if (!options.allowLowConfidence && confidence === 'low') return false
  if (!options.allowArchiveMarker && hasArchiveSourceMarker(row)) return false
  if (options.maxAgeDays != null && !latestAvailable) {
    const latest = ytfMetricLatestTimestamp(row, {
      includeIngestFallback: options.allowIngestFallback ?? Boolean(options.allowLowConfidence),
      preferBusinessDate: options.preferBusinessDate !== false,
    })
    if (!latest) return false
    let ageDays = Math.max(0, Math.floor((Date.now() - latest.getTime()) / YTF_DAY_MS))
    if (ageDays > options.maxAgeDays && options.allowLowConfidence) {
      const ingestLatest = ytfMetricLatestTimestamp(row, {
        includeIngestFallback: options.allowIngestFallback ?? true,
        preferBusinessDate: false,
      })
      if (ingestLatest) ageDays = Math.max(0, Math.floor((Date.now() - ingestLatest.getTime()) / YTF_DAY_MS))
    }
    if (ageDays > options.maxAgeDays) return false
  }
  return true
}

export function ytfCompactNumber(value?: number | null, maximumFractionDigits = 0): string {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0'
  return numeric.toLocaleString(undefined, { maximumFractionDigits })
}

function ytfPositiveNumber(value?: number | null): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function ytfQtyPart(label: string, value?: number | null): string {
  const numeric = ytfPositiveNumber(value)
  return numeric > 0 ? `${label} ${ytfCompactNumber(numeric)}` : ''
}

export function ytfMoneyText(value?: number | null): string {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric) || !numeric) return 'MMK 0'
  const abs = Math.abs(numeric)
  if (abs >= 1_000_000_000) return `MMK ${(numeric / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}B`
  if (abs >= 1_000_000) return `MMK ${(numeric / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`
  return `MMK ${ytfCompactNumber(numeric)}`
}

export function ytfPlantText(row: YtfSizeMetricLike): string {
  const plant = asText(row.plant)
  if (plant) return plant
  const topPlant = Object.entries(row.plants ?? {}).sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))[0]?.[0]
  return topPlant || 'Plant not tagged'
}

export function ytfMetricScopeText(row: YtfSizeMetricLike): string {
  const scopeKind = ytfMetricScopeKind(row)
  if (scopeKind === 'shared') return 'Company source'
  if (scopeKind === 'plant-b') return 'Plant B'
  if (scopeKind === 'plant-a') return 'Factory Floor'
  const plant = ytfPlantText(row)
  if (/company/i.test(plant)) return 'Company'
  return plant
}

export function ytfMetricScopeNotice(row: YtfSizeMetricLike): string {
  const scopeKind = ytfMetricScopeKind(row)
  if (scopeKind === 'shared') return 'Company'
  if (scopeKind === 'plant-b') return 'Plant B'
  if (scopeKind === 'plant-a') return 'Factory Floor'
  return 'Company source'
}

export function ytfPeriodText(row: YtfSizeMetricLike): string {
  const source = row.source ?? {}
  const confidence = asText(source.date_confidence).toLowerCase()
  const periodFromContext = periodCandidate(source.date_context)
  const periodFromLabel = periodCandidate(source.period_label)
  const periodFromRows = (row.periods ?? []).map(periodCandidate).find(Boolean) ?? ''
  const periodFromSheet = periodCandidate(source.sheet_name)
  const period = firstText(
    confidence !== 'low' ? periodFromContext : '',
    periodFromLabel,
    periodFromRows,
    periodFromContext,
    periodFromSheet,
  )
  if (!period) return 'Period needs check'
  return confidence === 'low' ? `Period needs check: ${period}` : `Period ${period}`
}

export function ytfWorkbookText(row: YtfSizeMetricLike): string {
  const source = row.source ?? {}
  const workbook = cleanSourceName(firstText(source.workbook, source.source_workbook, source.file_name, source.title, source.source))
  const sheet = cleanSourceName(firstText(source.sheet_name, source.source_sheet))
  return [workbook, sheet].filter(Boolean).join(' / ') || 'YTF workbook'
}

export function ytfMetricSourceContext(row: YtfSizeMetricLike): string {
  return [ytfPeriodText(row), ytfMetricScopeText(row)].filter(Boolean).join(' / ')
}

export function ytfMetricSourceLine(row: YtfSizeMetricLike): string {
  const source = row.source ?? {}
  const rowLabel = compactText(source.row_label, 80)
  return [ytfMetricScopeText(row), rowLabel].filter(Boolean).join(' / ') || ytfMetricSourceContext(row) || 'Operational row'
}

function ytfMetricCardDetail(row: YtfSizeMetricLike, primary: string): string {
  return [
    ytfMetricScopeNotice(row),
    primary,
    ytfPeriodText(row),
  ].filter(Boolean).join(' / ')
}

export function ytfProductionMetricCard(row?: YtfSizeMetricLike): YtfMetricDisplayCard | null {
  if (!row) return null
  const outputQty = ytfPositiveNumber(row.output_qty)
  if (!outputQty) return null
  const size = row.size || 'Production size'
  const label = /shared/i.test(ytfMetricScopeText(row)) ? 'Shared production' : 'Production'
  const lens = ytfWcmMetricLens('production output', size, row.metric_names, ytfMetricSourceContext(row), ytfMetricSourceLine(row))
  return {
    label,
    value: `${ytfCompactNumber(outputQty)} pcs`,
    detail: ytfMetricCardDetail(row, `Size ${size}${row.weight_kg ? ` / ${ytfCompactNumber(row.weight_kg, 1)} kg` : ''}`),
    source: ytfMetricSourceLine(row),
    route: '/app/live-data?view=kpi',
    wcm: lens.label,
    wcmAction: lens.action,
  }
}

export function ytfQualityMetricCard(row?: YtfSizeMetricLike): YtfMetricDisplayCard | null {
  if (!row) return null
  const size = row.size || 'Claim size'
  const label = /shared/i.test(ytfMetricScopeText(row)) ? 'Shared quality' : 'Quality'
  const claimQty = ytfPositiveNumber(row.claim_qty)
  const lens = ytfWcmMetricLens('quality claim defect', size, row.metric_names, ytfMetricSourceContext(row), ytfMetricSourceLine(row))
  return {
    label,
    value: claimQty ? `${ytfCompactNumber(claimQty)} claims` : 'No claims logged',
    detail: ytfMetricCardDetail(row, `Size ${size}${row.claim_amount ? ` / ${ytfMoneyText(row.claim_amount)}` : ''}`),
    source: ytfMetricSourceLine(row),
    route: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    wcm: lens.label,
    wcmAction: lens.action,
  }
}

export function ytfStockMetricCard(row?: YtfSizeMetricLike): YtfMetricDisplayCard | null {
  if (!row) return null
  const size = row.size || 'Stock size'
  const label = /shared/i.test(ytfMetricScopeText(row)) ? 'Shared stock' : 'Stock'
  const movement = [
    row.movement_qty,
    row.received_qty,
    row.issued_qty,
    row.closing_qty,
  ].map(ytfPositiveNumber).find((value) => value > 0)
  if (!movement) return null
  const stockParts = [
    ytfQtyPart('R', row.received_qty),
    ytfQtyPart('I', row.issued_qty),
    ytfQtyPart('C', row.closing_qty),
  ].filter(Boolean)
  const lens = ytfWcmMetricLens('stock inventory warehouse movement', size, row.metric_names, ytfMetricSourceContext(row), ytfMetricSourceLine(row))
  return {
    label,
    value: `${ytfCompactNumber(movement)} pcs`,
    detail: ytfMetricCardDetail(row, [`Size ${size}`, ...stockParts].join(' / ')),
    source: ytfMetricSourceLine(row),
    route: '/app/live-data?view=kpi',
    wcm: lens.label,
    wcmAction: lens.action,
  }
}

export function ytfProcurementMetricCard(row?: YtfSizeMetricLike): YtfMetricDisplayCard | null {
  if (!row) return null
  const size = row.size || 'Buying'
  const label = /shared/i.test(ytfMetricScopeText(row)) ? 'Shared supplier' : 'Supplier'
  const lens = ytfWcmMetricLens('supplier procurement purchase cost', size, row.metric_names, ytfMetricSourceContext(row), ytfMetricSourceLine(row))
  return {
    label,
    value: ytfPositiveNumber(row.pcs) ? `${ytfCompactNumber(row.pcs)} pcs` : ytfMoneyText(row.amount),
    detail: ytfMetricCardDetail(row, `${size} / ${ytfMoneyText(row.amount)}`),
    source: ytfMetricSourceLine(row),
    route: '/app/live-data?view=kpi',
    wcm: lens.label,
    wcmAction: lens.action,
  }
}

export function ytfRawMaterialMetricCard(row?: YtfSizeMetricLike): YtfMetricDisplayCard | null {
  if (!row) return null
  const material = row.material || row.size || 'Raw material'
  const sourceRow = {
    ...row,
    plant: row.plant || 'Supplier / raw material',
    amount: row.amount_mmk ?? row.amount,
  }
  const lens = ytfWcmMetricLens('supplier raw material purchase logistics', material, row.metric_names, ytfMetricSourceContext(sourceRow), ytfMetricSourceLine(sourceRow))
  const tonText = row.order_ton ? `${ytfCompactNumber(row.order_ton, 1)} ton` : ''
  const lbText = row.order_lb ? `${ytfCompactNumber(row.order_lb)} lb` : ''
  return {
    label: 'Supplier',
    value: tonText || ytfMoneyText(row.amount_mmk ?? row.amount),
    detail: ytfMetricCardDetail(sourceRow, [material, ytfMoneyText(row.amount_mmk ?? row.amount), lbText].filter(Boolean).join(' / ')),
    source: ytfMetricSourceLine(sourceRow),
    route: '/app/live-data?view=kpi',
    wcm: lens.label,
    wcmAction: lens.action,
  }
}
