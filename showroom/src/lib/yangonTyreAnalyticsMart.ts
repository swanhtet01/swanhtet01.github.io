import type { DataFabricDataset, DataFabricSourceRegistryItem } from './dataFabricApi'
import { YANGON_TYRE_DATA_PROFILE } from './yangonTyreDataProfile'

export type YangonTyreAnalyticsLens = 'all' | 'operations' | 'quality' | 'commercial' | 'governance'

export type YangonTyreAnalyticsLensDefinition = {
  id: YangonTyreAnalyticsLens
  label: string
  description: string
}

export type YangonTyreAnalyticsKpi = {
  id: string
  label: string
  value: string
  detail: string
  formula: string
  route: string
  trend: string
  lenses: YangonTyreAnalyticsLens[]
}

export type YangonTyreSourceBehavior = {
  id: string
  name: string
  behavior: string
  structure: string
  readiness: string
  risk: string
  detail: string
  route: string
  connectedMetrics: string[]
  lenses: YangonTyreAnalyticsLens[]
}

export type YangonTyreSegmentStat = {
  id: string
  group: string
  name: string
  value: string
  share: number | null
  detail: string
  route: string
  lenses: YangonTyreAnalyticsLens[]
}

export type YangonTyreEngineeredFeature = {
  id: string
  name: string
  status: 'ready' | 'watch' | 'needs-writeback'
  grain: string
  formula: string
  signal: string
  whyItMatters: string
  consumers: string[]
  route: string
  lenses: YangonTyreAnalyticsLens[]
}

export type YangonTyreQualityTrace = {
  id: string
  month: string
  output: string
  defectRate: string
  trend: string
  route: string
  lenses: YangonTyreAnalyticsLens[]
}

export type YangonTyreProductWatch = {
  id: string
  name: string
  units: string
  defectRate: string
  weightDelta: string
  note: string
  route: string
  lenses: YangonTyreAnalyticsLens[]
}

export type YangonTyreAnalyticsMart = {
  headline: string
  databaseNote: string
  updatedAt: string | null
  lenses: YangonTyreAnalyticsLensDefinition[]
  kpis: YangonTyreAnalyticsKpi[]
  sourceBehaviors: YangonTyreSourceBehavior[]
  segments: YangonTyreSegmentStat[]
  engineeredFeatures: YangonTyreEngineeredFeature[]
  qualityTrace: YangonTyreQualityTrace[]
  productWatchlist: YangonTyreProductWatch[]
}

export type YangonTyreAnalyticsMartView = {
  selectedLens: YangonTyreAnalyticsLensDefinition
  kpis: YangonTyreAnalyticsKpi[]
  sourceBehaviors: YangonTyreSourceBehavior[]
  segments: YangonTyreSegmentStat[]
  engineeredFeatures: YangonTyreEngineeredFeature[]
  qualityTrace: YangonTyreQualityTrace[]
  productWatchlist: YangonTyreProductWatch[]
}

const ANALYTICS_LENSES: YangonTyreAnalyticsLensDefinition[] = [
  {
    id: 'all',
    label: 'All lenses',
    description: 'Cross-functional warehouse view across source behavior, operational control, quality, commercial mix, and governance.',
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Folder behavior, plant stages, throughput, shift pressure, and industrial engineering control.',
  },
  {
    id: 'quality',
    label: 'Quality',
    description: 'B+R behavior, defect concentration, release timing, and feature inputs for closeout loops.',
  },
  {
    id: 'commercial',
    label: 'Commercial',
    description: 'Workbook demand mix, dealer concentration, revenue, and pricing or cost leakage behavior.',
  },
  {
    id: 'governance',
    label: 'Governance',
    description: 'Source registry quality, shortcut risk, lineage readiness, trust scoring, and management drift.',
  },
] as const

const WORKBOOK_UNITS_2023 = 263_317
const GUIDEBOOK_ANNUAL_VOLUME = 100_000
const GROSS_SALES_MMK = 59_065_338_000
const TUBE_COST_MMK = 4_265_871_736
const NET_AFTER_TUBE_MMK = 54_799_466_264
const TOP_THREE_PRODUCT_FAMILY_UNITS = 74_713
const TOP_THREE_PRODUCT_FAMILY_SHARE = 28.4
const TOP_THREE_DEALER_SHARE = 44.3
const GUIDEBOOK_SECTION_COUNT = 11
const SOURCE_LANE_COUNT = 13
const PRICE_RESET_SAMPLE = 5.0

const SOURCE_LENS_MAP: Record<string, YangonTyreAnalyticsLens[]> = {
  'future-source-register': ['governance'],
  'drive-plant-a': ['operations', 'governance'],
  'drive-ops-manual': ['operations', 'quality', 'governance'],
  'drive-tyre-analysis': ['commercial', 'quality'],
  'drive-ceo-data': ['commercial', 'governance'],
  'email-financials': ['commercial', 'governance'],
}

function supportsLens(lenses: YangonTyreAnalyticsLens[], selected: YangonTyreAnalyticsLens) {
  return selected === 'all' || lenses.includes(selected)
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`
}

function formatRatio(value: number, digits = 2) {
  return `${value.toFixed(digits)}x`
}

function formatBillionsMmK(value: number) {
  return `MMK ${(value / 1_000_000_000).toFixed(1)}B`
}

function formatUnits(value: number) {
  return value.toLocaleString()
}

function formatCurrencyPerUnit(value: number) {
  return `MMK ${Math.round(value).toLocaleString()} / unit`
}

function shareOfEvidence(evidenceCount: number, totalEvidenceCount: number) {
  if (!totalEvidenceCount) {
    return 0
  }
  return (evidenceCount / totalEvidenceCount) * 100
}

function inferSourceBehavior(item: DataFabricSourceRegistryItem) {
  if (item.id === 'drive-plant-a' || item.id === 'drive-ceo-data') {
    return {
      behavior: 'Shortcut-heavy lane',
      structure: 'Curated folders plus shortcut hubs',
      readiness: 'Needs target resolution before exact file lineage is trustworthy.',
      risk: 'Targets can move without the story layer knowing which underlying source changed.',
    }
  }

  if (item.id === 'drive-tyre-analysis') {
    return {
      behavior: 'Analytical workbook',
      structure: 'Sheet sections that already encode volume, pricing, cost, and dealer mix.',
      readiness: 'Ready for mart extraction into product, dealer, and pricing dimensions.',
      risk: 'Historical workbook logic can dominate the story unless paired with fresher writeback and demand telemetry.',
    }
  }

  if (item.id === 'drive-ops-manual') {
    return {
      behavior: 'Process grammar document',
      structure: 'Guidebook with named sections, machinery, roles, and KPI headings.',
      readiness: 'Ready to become stage-aware SOP nodes and writeback checklists.',
      risk: 'Rich process knowledge exists, but it is still descriptive until line events are captured in structured form.',
    }
  }

  if (item.id === 'email-financials') {
    return {
      behavior: 'Mailbox-linked packet',
      structure: 'Docs and sheets referenced from email-linked finance and purchase-order lanes.',
      readiness: 'Needs sender, attachment, and approval lineage before full promotion.',
      risk: 'Managers can see the files, but not yet the thread-level decision chain or missing evidence debt.',
    }
  }

  return {
    behavior: 'Curated source register',
    structure: 'Governed register of the Drive estate and linked source surfaces.',
    readiness: 'Ready to act as the catalog spine for every downstream mart.',
    risk: 'The catalog is useful only if every listed lane keeps owner, freshness, and extraction policy current.',
  }
}

function buildSourceBehaviors(dataset: DataFabricDataset) {
  return dataset.sourceRegistry.map((item) => {
    const behavior = inferSourceBehavior(item)

    return {
      id: item.id,
      name: item.name,
      behavior: behavior.behavior,
      structure: behavior.structure,
      readiness: behavior.readiness,
      risk: behavior.risk,
      detail: item.nextAutomation,
      route: item.route,
      connectedMetrics: [
        `${item.evidenceCount} curated evidence rows`,
        item.lastSignalAt ? `Latest signal ${new Date(item.lastSignalAt).toLocaleDateString()}` : 'No recent source timestamp',
      ],
      lenses: SOURCE_LENS_MAP[item.id] ?? ['governance'],
    } satisfies YangonTyreSourceBehavior
  })
}

function buildSegmentStats(dataset: DataFabricDataset) {
  const totalEvidenceCount = dataset.sourceRegistry.reduce((sum, item) => sum + item.evidenceCount, 0)
  const sourceSegments = [...dataset.sourceRegistry]
    .sort((left, right) => right.evidenceCount - left.evidenceCount)
    .slice(0, 4)
    .map((item) => ({
      id: `source-share-${item.id}`,
      group: 'Source weight',
      name: item.name,
      value: formatPercent(shareOfEvidence(item.evidenceCount, totalEvidenceCount)),
      share: shareOfEvidence(item.evidenceCount, totalEvidenceCount),
      detail: `${item.evidenceCount} promoted rows feeding the current source catalog.`,
      route: item.route,
      lenses: SOURCE_LENS_MAP[item.id] ?? ['governance'],
    }))

  const qualitySpan =
    YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate - YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate

  return [
    ...sourceSegments,
    {
      id: 'commercial-top-families',
      group: 'Commercial concentration',
      name: 'Top 3 product families',
      value: formatPercent(TOP_THREE_PRODUCT_FAMILY_SHARE),
      share: TOP_THREE_PRODUCT_FAMILY_SHARE,
      detail: `${formatUnits(TOP_THREE_PRODUCT_FAMILY_UNITS)} workbook units sit inside the top three SKU families.`,
      route: '/app/insights',
      lenses: ['commercial'],
    },
    {
      id: 'commercial-top-dealers',
      group: 'Commercial concentration',
      name: 'Top 3 dealers',
      value: formatPercent(TOP_THREE_DEALER_SHARE),
      share: TOP_THREE_DEALER_SHARE,
      detail: 'Ko Phyo, Ko Tin Ko, and Manpower carry a concentrated share of workbook volume.',
      route: '/app/revenue',
      lenses: ['commercial'],
    },
    {
      id: 'quality-best-month',
      group: 'Quality extremes',
      name: YANGON_TYRE_DATA_PROFILE.bestMonth2024.month,
      value: formatPercent(YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate, 2),
      share: YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate * 100,
      detail: `Best observed B+R month with ${formatUnits(YANGON_TYRE_DATA_PROFILE.bestMonth2024.totalOutput)} units.`,
      route: '/app/dqms',
      lenses: ['quality'],
    },
    {
      id: 'quality-worst-month',
      group: 'Quality extremes',
      name: YANGON_TYRE_DATA_PROFILE.worstMonth2024.month,
      value: formatPercent(YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate, 2),
      share: YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate * 100,
      detail: `Worst observed B+R month. Control span to best month is ${formatPercent(qualitySpan, 2)}.`,
      route: '/app/dqms',
      lenses: ['quality'],
    },
  ] satisfies YangonTyreSegmentStat[]
}

function buildEngineeredFeatures(dataset: DataFabricDataset) {
  const healthyConnectorShare = dataset.connectorSignals.length
    ? (dataset.connectorSignals.filter((signal) => signal.status === 'Healthy').length / dataset.connectorSignals.length) * 100
    : 0
  const qualitySpan =
    YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate - YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate

  return [
    {
      id: 'feature-net-revenue-per-unit',
      name: 'Net revenue per sold unit',
      status: 'ready',
      grain: 'sold unit',
      formula: `${formatBillionsMmK(NET_AFTER_TUBE_MMK)} / ${formatUnits(WORKBOOK_UNITS_2023)} workbook units`,
      signal: formatCurrencyPerUnit(NET_AFTER_TUBE_MMK / WORKBOOK_UNITS_2023),
      whyItMatters: 'Sets a stable commercial baseline before layering in dealer, product-family, or pricing filters.',
      consumers: ['Operating Intelligence Studio', 'CEO Command Center'],
      route: '/app/insights',
      lenses: ['commercial'],
    },
    {
      id: 'feature-tube-cost-drag',
      name: 'Tube cost drag',
      status: 'ready',
      grain: 'sales mix period',
      formula: `${formatBillionsMmK(TUBE_COST_MMK)} / ${formatBillionsMmK(GROSS_SALES_MMK)}`,
      signal: formatPercent((TUBE_COST_MMK / GROSS_SALES_MMK) * 100),
      whyItMatters: 'This exposes how much tube economics erode the commercial headline before management sees the real net number.',
      consumers: ['Revenue Desk', 'CEO Command Center'],
      route: '/app/insights',
      lenses: ['commercial'],
    },
    {
      id: 'feature-volume-drift',
      name: 'Guidebook versus workbook drift',
      status: 'watch',
      grain: 'plant annual output claim',
      formula: `${formatUnits(WORKBOOK_UNITS_2023)} workbook units / ${formatUnits(GUIDEBOOK_ANNUAL_VOLUME)} guidebook units`,
      signal: formatRatio(WORKBOOK_UNITS_2023 / GUIDEBOOK_ANNUAL_VOLUME),
      whyItMatters: 'The documentation layer and analytical workbook disagree enough to require governance review before targets are trusted.',
      consumers: ['Admin and Connector Control', 'CEO Command Center'],
      route: '/app/knowledge',
      lenses: ['governance', 'operations'],
    },
    {
      id: 'feature-quality-control-span',
      name: 'B+R control span',
      status: 'ready',
      grain: 'monthly quality performance',
      formula: `${formatPercent(YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate, 2)} - ${formatPercent(YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate, 2)}`,
      signal: formatPercent(qualitySpan, 2),
      whyItMatters: 'The span between best and worst months shows how much process variation still exists even before defect root-cause clustering.',
      consumers: ['DQMS and Quality Lab', 'Operations Control'],
      route: '/app/dqms',
      lenses: ['quality', 'operations'],
    },
    {
      id: 'feature-price-reset',
      name: 'Sampled price reset pressure',
      status: 'watch',
      grain: 'sample workbook pricing lines',
      formula: 'Observed reset across sampled workbook pricing lines',
      signal: formatPercent(PRICE_RESET_SAMPLE),
      whyItMatters: 'Commercial storytelling should isolate whether price movement is deliberate strategy or response to cost leakage and concentration.',
      consumers: ['Revenue Desk', 'Operating Intelligence Studio'],
      route: '/app/revenue',
      lenses: ['commercial'],
    },
    {
      id: 'feature-source-health',
      name: 'Connector-ready source coverage',
      status: 'needs-writeback',
      grain: 'curated source surface',
      formula: `${dataset.connectorSignals.filter((signal) => signal.status === 'Healthy').length} healthy connectors / ${dataset.connectorSignals.length} registered connectors`,
      signal: formatPercent(healthyConnectorShare),
      whyItMatters: 'The source estate is curated, but autonomy still stalls where wiring and writeback are incomplete.',
      consumers: ['Admin and Connector Control', 'Adoption Command'],
      route: '/app/connectors',
      lenses: ['governance'],
    },
    {
      id: 'feature-learning-trust',
      name: 'Learning-database trust score',
      status: dataset.learningDatabase.trustScore >= 70 ? 'ready' : 'watch',
      grain: 'tenant learning snapshot',
      formula: 'Completeness and freshness score from the current learning database seed',
      signal: `${dataset.learningDatabase.trustScore}%`,
      whyItMatters: 'This is the fastest indicator of whether the current mart can safely support management review and agent handoffs.',
      consumers: ['CEO Command Center', 'Workforce Command', 'Admin and Connector Control'],
      route: '/app/data-fabric',
      lenses: ['governance', 'operations'],
    },
  ] satisfies YangonTyreEngineeredFeature[]
}

function buildQualityTrace() {
  const averageRate = YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024

  return YANGON_TYRE_DATA_PROFILE.monthlyQuality2024.map((point) => ({
    id: `quality-trace-${point.month.toLowerCase()}`,
    month: point.month,
    output: formatUnits(point.totalOutput),
    defectRate: formatPercent(point.bPlusRRate, 2),
    trend: point.bPlusRRate <= averageRate ? 'Below annual average' : 'Above annual average',
    route: '/app/dqms',
    lenses: ['quality', 'operations'] as YangonTyreAnalyticsLens[],
  }))
}

function buildProductWatchlist() {
  return YANGON_TYRE_DATA_PROFILE.focusProducts2025.map((product) => {
    const deltaKg = product.avgActualWeight - product.specWeight
    const direction = deltaKg === 0 ? 'on target' : deltaKg > 0 ? 'over spec' : 'under spec'

    return {
      id: `product-watch-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: product.name,
      units: formatUnits(product.units),
      defectRate: formatPercent(product.bPlusRRate, 2),
      weightDelta: `${deltaKg > 0 ? '+' : ''}${deltaKg.toFixed(2)} kg`,
      note: `${direction}; average actual ${product.avgActualWeight.toFixed(2)} kg versus spec ${product.specWeight.toFixed(2)} kg.`,
      route: '/app/dqms',
      lenses: ['quality', 'commercial'],
    } satisfies YangonTyreProductWatch
  })
}

export function buildYangonTyreAnalyticsMart(dataset: DataFabricDataset): YangonTyreAnalyticsMart {
  const sourceBehaviors = buildSourceBehaviors(dataset)
  const segments = buildSegmentStats(dataset)
  const engineeredFeatures = buildEngineeredFeatures(dataset)
  const healthyConnectors = dataset.connectorSignals.filter((signal) => signal.status === 'Healthy').length

  const kpis: YangonTyreAnalyticsKpi[] = [
    {
      id: 'kpi-source-lanes',
      label: 'Meaningful source lanes',
      value: formatUnits(SOURCE_LANE_COUNT),
      detail: 'Deduped source lanes from the Drive register after collapsing repeated shared-root references.',
      formula: 'Curated source-register review',
      route: '/app/connectors',
      trend: 'Governance baseline',
      lenses: ['governance'],
    },
    {
      id: 'kpi-workbook-units',
      label: 'Workbook units',
      value: formatUnits(WORKBOOK_UNITS_2023),
      detail: 'Extracted sales quantity from the Tyre Analysis workbook baseline.',
      formula: '2023 workbook sales total',
      route: '/app/insights',
      trend: 'Commercial baseline',
      lenses: ['commercial'],
    },
    {
      id: 'kpi-net-after-tube',
      label: 'Net after tube cost',
      value: formatBillionsMmK(NET_AFTER_TUBE_MMK),
      detail: 'Commercial headline after backing out the workbook tube-cost component.',
      formula: `${formatBillionsMmK(GROSS_SALES_MMK)} - ${formatBillionsMmK(TUBE_COST_MMK)}`,
      route: '/app/insights',
      trend: 'Cost-cleaned revenue',
      lenses: ['commercial'],
    },
    {
      id: 'kpi-guidebook-sections',
      label: 'Guidebook sections',
      value: formatUnits(GUIDEBOOK_SECTION_COUNT),
      detail: 'Named Plant A sections already encoded in the operations guide and ready for SOP or writeback modeling.',
      formula: 'Operations guidebook section count',
      route: '/app/knowledge',
      trend: 'Process grammar',
      lenses: ['operations', 'quality'],
    },
    {
      id: 'kpi-annual-output',
      label: '2024 output baseline',
      value: formatUnits(YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024),
      detail: 'Bias-tyre production baseline from the current quality profile.',
      formula: '2024 output profile',
      route: '/app/operations',
      trend: 'Industrial baseline',
      lenses: ['operations', 'quality'],
    },
    {
      id: 'kpi-br-rate',
      label: 'Average B+R',
      value: formatPercent(YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024, 2),
      detail: 'Current annual quality-loss profile before deeper defect clustering and closeout automation.',
      formula: 'Annual average of monthly B+R rate',
      route: '/app/dqms',
      trend: 'Quality control',
      lenses: ['quality'],
    },
    {
      id: 'kpi-top-family-share',
      label: 'Top family concentration',
      value: formatPercent(TOP_THREE_PRODUCT_FAMILY_SHARE),
      detail: 'The top three SKU families already carry an outsized share of workbook volume.',
      formula: `${formatUnits(TOP_THREE_PRODUCT_FAMILY_UNITS)} / ${formatUnits(WORKBOOK_UNITS_2023)}`,
      route: '/app/revenue',
      trend: 'Mix concentration',
      lenses: ['commercial'],
    },
    {
      id: 'kpi-dealer-share',
      label: 'Top dealer concentration',
      value: formatPercent(TOP_THREE_DEALER_SHARE),
      detail: 'The leading dealer cluster is large enough to merit focused account-watch logic.',
      formula: 'Top dealer cluster share from workbook review',
      route: '/app/revenue',
      trend: 'Account concentration',
      lenses: ['commercial'],
    },
    {
      id: 'kpi-drift-ratio',
      label: 'Guidebook drift',
      value: formatRatio(WORKBOOK_UNITS_2023 / GUIDEBOOK_ANNUAL_VOLUME),
      detail: 'Annual volume claimed in the guidebook versus the workbook total should be treated as a governance signal.',
      formula: `${formatUnits(WORKBOOK_UNITS_2023)} / ${formatUnits(GUIDEBOOK_ANNUAL_VOLUME)}`,
      route: '/app/knowledge',
      trend: 'Documentation conflict',
      lenses: ['governance', 'operations'],
    },
    {
      id: 'kpi-learning-trust',
      label: 'Learning trust',
      value: `${dataset.learningDatabase.trustScore}%`,
      detail: `${healthyConnectors} of ${dataset.connectorSignals.length} connector lanes behave like healthy live sources right now.`,
      formula: 'Learning-database trust score plus connector health review',
      route: '/app/data-fabric',
      trend: dataset.source === 'live' ? 'Live mart merged' : 'Seed mart active',
      lenses: ['governance'],
    },
  ]

  if (dataset.source === 'live' && dataset.summary.openTaskCount > 0) {
    kpis.unshift({
      id: 'kpi-live-open-tasks',
      label: 'Live open tasks',
      value: formatUnits(dataset.summary.openTaskCount),
      detail: 'Workspace-backed tasks are now merged into the data-fabric view instead of staying outside the analytical surface.',
      formula: 'Live workspace summary',
      route: '/app/action-board',
      trend: 'Runtime queue',
      lenses: ['governance', 'operations'],
    })
  }

  return {
    headline: 'Turn the curated Drive estate into a warehouse-grade operating mart.',
    databaseNote:
      dataset.source === 'live'
        ? 'Live workspace counts are merged with the Yangon Tyre mart. Curated Drive evidence still provides the structure, feature definitions, and storytelling grammar.'
        : 'This is a local analytical mart built from curated Drive and workbook evidence. It behaves like a warehouse-ready slice even before a full backend ingestion loop is online.',
    updatedAt: dataset.updatedAt,
    lenses: [...ANALYTICS_LENSES],
    kpis,
    sourceBehaviors,
    segments,
    engineeredFeatures,
    qualityTrace: buildQualityTrace(),
    productWatchlist: buildProductWatchlist(),
  }
}

export function getYangonTyreAnalyticsMartView(
  mart: YangonTyreAnalyticsMart,
  selectedLens: YangonTyreAnalyticsLens,
): YangonTyreAnalyticsMartView {
  const lens = mart.lenses.find((item) => item.id === selectedLens) ?? mart.lenses[0]

  return {
    selectedLens: lens,
    kpis: mart.kpis.filter((item) => supportsLens(item.lenses, selectedLens)),
    sourceBehaviors: mart.sourceBehaviors.filter((item) => supportsLens(item.lenses, selectedLens)),
    segments: mart.segments.filter((item) => supportsLens(item.lenses, selectedLens)),
    engineeredFeatures: mart.engineeredFeatures.filter((item) => supportsLens(item.lenses, selectedLens)),
    qualityTrace: mart.qualityTrace.filter((item) => supportsLens(item.lenses, selectedLens)),
    productWatchlist: mart.productWatchlist.filter((item) => supportsLens(item.lenses, selectedLens)),
  }
}
