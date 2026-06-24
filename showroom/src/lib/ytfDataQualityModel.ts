import type { YtfRootLane, YtfRootWarehouseDataset } from './ytfRootWarehouseApi'

export type YtfDataQualityQueueId =
  | 'ready'
  | 'workbook-heavy'
  | 'shortcut-debt'
  | 'needs-owner'
  | 'stale-empty'

export type YtfDataQualityQueue = {
  id: YtfDataQualityQueueId
  title: string
  intent: string
  action: string
  route: string
  lanes: YtfRootLane[]
}

export type YtfDataQualitySummary = {
  readinessScore: number
  laneCount: number
  readyLaneCount: number
  workbookHeavyCount: number
  shortcutDebtCount: number
  ownerAttentionCount: number
  staleEmptyCount: number
  canonicalRecordCount: number
  liveItemCount: number
  shortcutCount: number
  workbookCount: number
  highRiskCount: number
}

export type YtfDataQualityPayload = {
  summary: YtfDataQualitySummary
  queues: YtfDataQualityQueue[]
  nextMoves: string[]
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function hasOwnerAttention(lane: YtfRootLane) {
  const status = normalize(lane.status)
  return lane.highRiskCount > 0 || status.includes('attention') || status.includes('needs') || status.includes('risk')
}

function isStaleOrEmpty(lane: YtfRootLane) {
  const status = normalize(lane.status)
  return lane.sourceItemCount <= 0 || lane.liveItemCount <= 0 || status.includes('empty') || status.includes('stale')
}

function isShortcutDebt(lane: YtfRootLane) {
  return lane.shortcutCount > 0 && (lane.liveItemCount <= 0 || lane.shortcutCount >= Math.max(1, lane.liveItemCount))
}

function isWorkbookHeavy(lane: YtfRootLane) {
  return lane.workbookCount > 0
}

function isReady(lane: YtfRootLane) {
  return lane.liveItemCount > 0 && lane.canonicalRecordCount > 0 && !isShortcutDebt(lane) && !isStaleOrEmpty(lane)
}

function byRiskThenRecords(a: YtfRootLane, b: YtfRootLane) {
  return (
    b.highRiskCount - a.highRiskCount ||
    b.workbookCount - a.workbookCount ||
    b.sourceItemCount - a.sourceItemCount ||
    a.title.localeCompare(b.title)
  )
}

export function buildYtfDataQualityPayload(dataset: YtfRootWarehouseDataset): YtfDataQualityPayload {
  const lanes = dataset.lanes
  const ready = lanes.filter(isReady).sort(byRiskThenRecords)
  const workbookHeavy = lanes.filter(isWorkbookHeavy).sort(byRiskThenRecords)
  const shortcutDebt = lanes.filter(isShortcutDebt).sort(byRiskThenRecords)
  const ownerAttention = lanes.filter(hasOwnerAttention).sort(byRiskThenRecords)
  const staleEmpty = lanes.filter(isStaleOrEmpty).sort(byRiskThenRecords)
  const laneCount = Math.max(1, lanes.length)
  const qualityPoints =
    ready.length * 3 +
    workbookHeavy.length * 1.5 -
    shortcutDebt.length * 2 -
    staleEmpty.length * 2 -
    ownerAttention.length * 0.5
  const readinessScore = Math.max(0, Math.min(100, Math.round((qualityPoints / (laneCount * 3)) * 100)))

  return {
    summary: {
      readinessScore,
      laneCount: lanes.length,
      readyLaneCount: ready.length,
      workbookHeavyCount: workbookHeavy.length,
      shortcutDebtCount: shortcutDebt.length,
      ownerAttentionCount: ownerAttention.length,
      staleEmptyCount: staleEmpty.length,
      canonicalRecordCount: dataset.summary.canonicalRecordCount,
      liveItemCount: dataset.summary.liveItemCount,
      shortcutCount: dataset.summary.shortcutCount,
      workbookCount: dataset.summary.workbookCount,
      highRiskCount: dataset.summary.highRiskCount,
    },
    queues: [
      {
        id: 'ready',
        title: 'Ready for KPI review',
        intent: 'Live records exist and can be reviewed or promoted.',
        action: 'Open the owner workspace and promote the useful rows into official metrics.',
        route: '/app/intake',
        lanes: ready,
      },
      {
        id: 'workbook-heavy',
        title: 'Workbook-heavy lanes',
        intent: 'Likely source of useful production, sales, finance, inventory, QC, or maintenance metrics.',
        action: 'Run extraction, inspect candidates, then promote only the useful metrics.',
        route: '/app/intake',
        lanes: workbookHeavy,
      },
      {
        id: 'shortcut-debt',
        title: 'Shortcut debt',
        intent: 'The app can see references, but not enough direct usable records.',
        action: 'Resolve folder permissions, duplicate the source, or ask the owner to share the real file.',
        route: '/app/actions',
        lanes: shortcutDebt,
      },
      {
        id: 'needs-owner',
        title: 'Needs owner attention',
        intent: 'High-risk, needs-attention, or manager-sensitive lanes.',
        action: 'Assign the owner and next action before more automation is trusted.',
        route: '/app/plant-manager',
        lanes: ownerAttention,
      },
      {
        id: 'stale-empty',
        title: 'Stale or empty lanes',
        intent: 'Folders or records that are not producing usable signals yet.',
        action: 'Ask the human owner whether to keep, merge, archive, or seed with a simple form.',
        route: '/app/action-board',
        lanes: staleEmpty,
      },
    ],
    nextMoves: [
      'Review ready lanes first; this is where useful KPIs can become official fastest.',
      'Resolve shortcut debt before asking AI to summarize that lane.',
      'Use workbook-heavy lanes as the next feature-engineering queue.',
      'Keep stale or empty lanes out of executive metrics until an owner confirms them.',
    ],
  }
}
