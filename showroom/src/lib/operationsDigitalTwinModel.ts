export type TwinAssetState = 'normal' | 'watch' | 'alert'

export type TwinAsset = {
  id: string
  name: string
  area: string
  type: string
  state: TwinAssetState
  owner: string
  lastSeenMinutes: number
  source: string
  expectedRange: string
}

export type TwinReading = {
  id: string
  assetId: string
  label: string
  value: number
  unit: string
  previousValue: number
  capturedAt: string
  source: 'esp32-demo' | 'certified-meter' | 'manual-entry' | 'machine-export'
}

export type TwinAnomaly = {
  id: string
  assetId: string
  severity: 'high' | 'review' | 'watch'
  title: string
  detail: string
  evidence: string
  owner: string
}

export type TwinAction = {
  id: string
  title: string
  owner: string
  status: 'needs review' | 'ready to assign' | 'blocked'
  due: string
  risk: string
}

export type TwinSourcePacket = {
  label: string
  detail: string
  status: 'connected' | 'prototype' | 'needed'
}

export type TwinReadinessStep = {
  label: string
  detail: string
  status: 'ready' | 'next' | 'blocked'
}

export const operationsTwinAssets: TwinAsset[] = [
  {
    id: 'main-meter',
    name: 'Main incoming meter',
    area: 'Electrical room',
    type: 'Energy meter',
    state: 'watch',
    owner: 'Facilities lead',
    lastSeenMinutes: 4,
    source: 'Certified meter or ESP32 prototype lane',
    expectedRange: '18-24 kW baseline during normal production',
  },
  {
    id: 'compressor-01',
    name: 'Utility compressor 01',
    area: 'Utilities',
    type: 'Machine asset',
    state: 'alert',
    owner: 'Maintenance',
    lastSeenMinutes: 11,
    source: 'Machine export + manual downtime log',
    expectedRange: 'Pressure stable, runtime under 78%',
  },
  {
    id: 'curing-line-07',
    name: 'Curing line 07',
    area: 'Production',
    type: 'Production line',
    state: 'normal',
    owner: 'Plant manager',
    lastSeenMinutes: 6,
    source: 'Operator form + maintenance desk',
    expectedRange: 'No repeated stoppage before shift handover',
  },
]

export const operationsTwinReadings: TwinReading[] = [
  {
    id: 'reading-main-meter',
    assetId: 'main-meter',
    label: 'Power draw',
    value: 27.6,
    unit: 'kW',
    previousValue: 21.9,
    capturedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    source: 'certified-meter',
  },
  {
    id: 'reading-compressor-runtime',
    assetId: 'compressor-01',
    label: 'Runtime',
    value: 88,
    unit: '%',
    previousValue: 72,
    capturedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    source: 'machine-export',
  },
  {
    id: 'reading-curing-stoppage',
    assetId: 'curing-line-07',
    label: 'Open stoppages',
    value: 1,
    unit: 'event',
    previousValue: 2,
    capturedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    source: 'manual-entry',
  },
]

export const operationsTwinAnomalies: TwinAnomaly[] = [
  {
    id: 'energy-spike-after-hours',
    assetId: 'main-meter',
    severity: 'review',
    title: 'Energy draw above baseline',
    detail: 'Main meter is 26% above normal production baseline. Confirm whether extra equipment was running.',
    evidence: 'Meter trend + shift note required',
    owner: 'Facilities lead',
  },
  {
    id: 'compressor-runtime-high',
    assetId: 'compressor-01',
    severity: 'high',
    title: 'Compressor runtime is high',
    detail: 'Runtime and pressure notes suggest leak, dirty filter, or demand spike. Maintenance should inspect before next shift.',
    evidence: 'Runtime export + photo of gauge/filter',
    owner: 'Maintenance',
  },
]

export const operationsTwinActions: TwinAction[] = [
  {
    id: 'verify-meter-boundary',
    title: 'Confirm safe meter boundary before production connection',
    owner: 'SuperMega + client electrician',
    status: 'needs review',
    due: 'Before hardware install',
    risk: 'Electrical safety',
  },
  {
    id: 'inspect-compressor',
    title: 'Inspect compressor filter, leak points, and pressure log',
    owner: 'Maintenance',
    status: 'ready to assign',
    due: 'Today',
    risk: 'Downtime and energy waste',
  },
  {
    id: 'attach-source-pack',
    title: 'Attach asset list, meter photos, and current workflow notes',
    owner: 'Operations manager',
    status: 'needs review',
    due: 'This week',
    risk: 'Missing source evidence',
  },
]

export const operationsTwinSourcePackets: TwinSourcePacket[] = [
  {
    label: 'ESP32 prototype lane',
    detail: 'Heartbeat, sample reading, device ID, firmware version, and signal quality.',
    status: 'prototype',
  },
  {
    label: 'Certified meter lane',
    detail: 'Production power readings through a safe meter, gateway, or Modbus/RS485 adapter.',
    status: 'needed',
  },
  {
    label: 'Work order and maintenance lane',
    detail: 'Open issue, owner, next action, source evidence, and closeout decision.',
    status: 'connected',
  },
  {
    label: 'Manager decision lane',
    detail: 'Reviewed anomaly, approval state, escalation note, and final action.',
    status: 'connected',
  },
]

export const operationsTwinReadiness: TwinReadinessStep[] = [
  {
    label: 'Prototype reading',
    detail: 'ESP32 sends heartbeat and sample telemetry through MQTT or gateway.',
    status: 'next',
  },
  {
    label: 'Safety boundary',
    detail: 'Mains work uses certified hardware, enclosure, isolation, calibration, and electrician review.',
    status: 'blocked',
  },
  {
    label: 'Cloud ingest',
    detail: 'Device/source events land with tenant ID, asset ID, timestamp, value, unit, and quality flag.',
    status: 'next',
  },
  {
    label: 'Workspace review',
    detail: 'Manager sees state, anomaly, source evidence, owner, action, and approval gate.',
    status: 'ready',
  },
]

export function latestReadingForAsset(assetId: string) {
  return operationsTwinReadings.find((reading) => reading.assetId === assetId) ?? null
}

export function twinDelta(reading: TwinReading) {
  return reading.value - reading.previousValue
}

export function twinStateCounts() {
  return operationsTwinAssets.reduce(
    (counts, asset) => {
      counts[asset.state] += 1
      return counts
    },
    { normal: 0, watch: 0, alert: 0 } as Record<TwinAssetState, number>,
  )
}

export function operationsTwinSummary() {
  const stateCounts = twinStateCounts()
  const totalAssets = operationsTwinAssets.length
  const actionCount = operationsTwinActions.filter((action) => action.status !== 'blocked').length
  return {
    totalAssets,
    liveReadings: operationsTwinReadings.length,
    anomalyCount: operationsTwinAnomalies.length,
    actionCount,
    stateCounts,
    readiness: operationsTwinReadiness,
  }
}
