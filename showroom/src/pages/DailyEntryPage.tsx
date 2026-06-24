import { startTransition, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import {
  YTF_LANGUAGE_MODE_STORAGE_KEY,
  translateYtfUse,
  type YtfLanguageMode,
} from '../lib/ytfFactoryUseModel'
import { getEntryPackById, getEntryPackByRole, type YtfPlantAEntryPack } from '../lib/ytfPlantATeamModel'
import {
  createWorkspaceTasks,
  extractYtfAgenticWhiteboardPhoto,
  extractYtfWhiteboardPhoto,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  getYtfKpiDefinitionsLatest,
  loadCachedWorkspaceSession,
  saveYtfWcmIncident,
  saveMetricRecordsBulk,
  sessionHasCapability,
  workspaceFetch,
  type EnterpriseMetricRecord,
  type MetricRecordPayload,
  type YtfAgenticWhiteboardResult,
} from '../lib/workspaceApi'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

type EntryMode =
  | 'daily_routine'
  | 'normal_abnormal'
  | 'five_s_check'
  | 'shift_handoff'
  | 'whiteboard_snapshot'
  | 'quality_incident'
  | 'maintenance_issue'
  | 'receiving_hold'
  | 'kpi_snapshot'
  | 'document_control'
  | 'audit_review'
  | 'training_followup'

type ModeCard = {
  id: EntryMode
  label: string
  title: string
  detail: string
  recordType: string
}

type PhoneCaptureShortcut = {
  mode: EntryMode
  label: string
  detail: string
  badge: string
  condition?: 'normal' | 'abnormal' | 'follow-up' | 'done'
}

type SectionEntryBlueprint = {
  section: string
  plant: 'Floor A' | 'Floor B'
  owner: string
  preferredMode: EntryMode
  focus: string
  expected: string[]
  sample: string
  placeholder: string
}

type TaskRow = {
  task_id: string
  template: string
  title: string
  owner: string
  priority: string
  due: string
  status: string
  notes: string
}

type QualityIncidentRow = {
  incident_id: string
  title: string
  owner: string
  severity: string
  status: string
  target_close_date: string
}

type MaintenanceRow = {
  maintenance_id: string
  asset_name: string
  issue_type: string
  owner: string
  priority: string
  status: string
  downtime_minutes: string
}

type ReceivingRow = {
  receiving_id: string
  supplier: string
  material: string
  owner: string
  status: string
  next_action: string
}

type MetricRow = {
  metric_id: string
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  period_label: string
  owner: string
}

type EntrySavePayload = {
  message?: string
  linked_action?: { saved_count?: number } | null
  linked_tasks?: { saved_count?: number } | null
}

type ShiftForm = {
  title: string
  owner: string
  priority: string
  due: string
  notes: string
  evidence_link: string
}

type QuickEntryForm = {
  note: string
  section: string
  condition: string
  owner: string
  priority: string
  due: string
}

type WhiteboardForm = {
  section: string
  shift: string
  board_date: string
  visible_numbers: string
  owner: string
  evidence_link: string
}

type StructuredEntryForm = {
  who: string
  what: string
  where: string
  when: string
  why: string
  how: string
  normal: string
  abnormal: string
  nextAction: string
  sort: string
  setOrder: string
  shine: string
  standardize: string
  sustain: string
}

type WhiteboardMetricCandidate = {
  metric_name: string
  metric_value: string
  unit: string
  raw_line: string
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  start: () => void
}

type QualityForm = {
  title: string
  summary: string
  supplier: string
  severity: string
  owner: string
  target_close_date: string
  evidence_link: string
}

type MaintenanceForm = {
  asset_name: string
  issue_type: string
  priority: string
  owner: string
  downtime_minutes: string
  next_action: string
  evidence_link: string
}

type ReceivingForm = {
  supplier: string
  material: string
  po_or_pi: string
  grn_or_batch: string
  expected_qty: string
  received_qty: string
  status: string
  owner: string
  next_action: string
  evidence_link: string
}

type MetricForm = {
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  period_label: string
  scope: string
  owner: string
  notes: string
  evidence_link: string
}

type DocumentForm = {
  document_name: string
  document_type: string
  change_type: string
  owner: string
  effective_date: string
  summary: string
  evidence_link: string
}

type AuditForm = {
  title: string
  review_type: string
  area: string
  owner: string
  due: string
  priority: string
  summary: string
  evidence_link: string
}

type TrainingForm = {
  topic: string
  audience: string
  owner: string
  due: string
  verification: string
  summary: string
  evidence_link: string
}

const MODE_CARDS: ModeCard[] = [
  {
    id: 'daily_routine',
    label: 'Daily 5W1H',
    title: 'Record the daily routine with who, what, where, when, why, and how much.',
    detail: 'Use this for the simple daily manager routine before shift close or handover.',
    recordType: 'Daily routine',
  },
  {
    id: 'normal_abnormal',
    label: 'Normal / abnormal',
    title: 'Record whether the section is normal or what abnormal condition happened.',
    detail: 'Use this for the fastest factory log: normal today, or abnormal with evidence and next action.',
    recordType: 'Condition record',
  },
  {
    id: 'five_s_check',
    label: '5S',
    title: 'Record 5S condition, cleaning, safety, and workplace discipline.',
    detail: 'Use this for Sort, Set in order, Shine, Standardize, and Sustain checks.',
    recordType: '5S check',
  },
  {
    id: 'shift_handoff',
    label: 'Shift handoff',
    title: 'Capture one Floor A issue, owner team, due time, and source.',
    detail: 'Use this for mixing, tyre building, curing, admin, sales, or any handoff that cannot stay only in chat.',
    recordType: 'Workspace task',
  },
  {
    id: 'whiteboard_snapshot',
    label: 'Whiteboard',
    title: 'Upload the section board photo.',
    detail: 'Best for curing, sales balance, stock, output, rejects, downtime, WIP, and OT boards. The system reads the board after save.',
    recordType: 'Board photo',
  },
  {
    id: 'quality_incident',
    label: 'Quality',
    title: 'Log a defect, claim, hold, or containment case.',
    detail: 'Use when a defect, hold, claim, or recheck needs to become visible team work.',
    recordType: 'Quality incident',
  },
  {
    id: 'maintenance_issue',
    label: 'Maintenance',
    title: 'Record downtime, machine trouble, utility risk, and repair action.',
    detail: 'Use for Curing Press 07, mixers, utilities, spares, PM, and repeated failures.',
    recordType: 'Maintenance record',
  },
  {
    id: 'receiving_hold',
    label: 'Receiving',
    title: 'Capture an inbound hold, material mismatch, or release blocker.',
    detail: 'Use when raw materials, supplier documents, PO/GRN, or quantity do not match.',
    recordType: 'Receiving record',
  },
  {
    id: 'kpi_snapshot',
    label: 'Number',
    title: 'Save one number from the floor, showroom, or planning desk.',
    detail: 'This updates live plant numbers for trends and dashboards.',
    recordType: 'Plant number',
  },
  {
    id: 'document_control',
    label: 'Documents',
    title: 'Capture SOP, form, COA, revision, and controlled-record changes.',
    detail: 'This writes a live document-control action for the manager and document loop.',
    recordType: 'Controlled-document action',
  },
  {
    id: 'audit_review',
    label: 'Audit / check',
    title: 'Save audit findings, management-review points, and repeat issues.',
    detail: 'This writes a live action instead of leaving the finding in notes or meetings.',
    recordType: 'Audit action',
  },
  {
    id: 'training_followup',
    label: 'Training',
    title: 'Capture competence gaps, refreshers, and coaching follow-up.',
    detail: 'This writes a live training action for manager follow-through and adoption.',
    recordType: 'Training action',
  },
] as const

const CORE_MODE_IDS: EntryMode[] = ['daily_routine', 'normal_abnormal', 'five_s_check', 'whiteboard_snapshot']

const SECONDARY_MODE_IDS: EntryMode[] = [
  'shift_handoff',
  'kpi_snapshot',
  'document_control',
  'quality_incident',
  'receiving_hold',
  'maintenance_issue',
]

const VISIBLE_ENTRY_MODE_IDS: EntryMode[] = [...CORE_MODE_IDS, ...SECONDARY_MODE_IDS]

const PHONE_CAPTURE_SHORTCUTS: PhoneCaptureShortcut[] = [
  {
    mode: 'daily_routine',
    label: 'Daily 5W1H',
    detail: 'Routine, handover, and shift close.',
    badge: 'Routine',
    condition: 'normal',
  },
  {
    mode: 'whiteboard_snapshot',
    label: 'Board photo',
    detail: 'Upload one clear board image.',
    badge: 'Data',
  },
  {
    mode: 'daily_routine',
    label: 'Abnormal 5W1H',
    detail: 'Issue, cause, action, and owner.',
    badge: 'Issue',
    condition: 'abnormal',
  },
  {
    mode: 'kpi_snapshot',
    label: 'KPI value',
    detail: 'Save one operational number now.',
    badge: 'KPI',
  },
]

const WHITEBOARD_SECTION_OPTIONS = [
  '01 Mixing',
  'Sales balance board',
  'Showroom stock board',
  'Rubberizing / extrusion / cutting',
  'Tyre building',
  '07 Curing press',
  'Floor B daily routine',
  'Floor B normal / abnormal',
  'Floor B 5S',
  'QC / inspection',
  'Maintenance',
  'Utility',
  'Admin / planning',
  'Sales / inventory',
] as const

const SECTION_ENTRY_BLUEPRINTS: SectionEntryBlueprint[] = [
  {
    section: '01 Mixing',
    plant: 'Floor A',
    owner: 'Production team',
    preferredMode: 'whiteboard_snapshot',
    focus: 'Compound, output, reject, downtime, WIP.',
    expected: ['output kg', 'reject kg', 'downtime min', 'WIP', 'compound status'],
    sample: 'Output 420 kg\nReject 8 kg\nDowntime 35 min\nWIP 120 kg\nCompound OK 1',
    placeholder: 'Example: Output 420 kg, reject 8 kg, downtime 35 min, compound OK.',
  },
  {
    section: 'Rubberizing / extrusion / cutting',
    plant: 'Floor A',
    owner: 'Production team',
    preferredMode: 'whiteboard_snapshot',
    focus: 'Stage output, WIP, reject, downtime, changeover.',
    expected: ['output pcs', 'reject pcs', 'downtime min', 'WIP', 'changeover'],
    sample: 'Output 650 pcs\nReject 12 pcs\nDowntime 25 min\nWIP 80 pcs\nChangeover 1',
    placeholder: 'Example: Output 650 pcs, reject 12 pcs, downtime 25 min, changeover 1.',
  },
  {
    section: 'Tyre building',
    plant: 'Floor A',
    owner: 'Production team',
    preferredMode: 'whiteboard_snapshot',
    focus: 'Built tyres, WIP, reject, machine stop.',
    expected: ['built pcs', 'reject pcs', 'WIP', 'downtime min'],
    sample: 'Built 520 pcs\nReject 6 pcs\nWIP 95 pcs\nDowntime 10 min',
    placeholder: 'Example: Built 520 pcs, reject 6 pcs, WIP 95 pcs, downtime 10 min.',
  },
  {
    section: '07 Curing press',
    plant: 'Floor A',
    owner: 'Production team',
    preferredMode: 'whiteboard_snapshot',
    focus: 'Curing output, reject, downtime, press status.',
    expected: ['output pcs', 'reject pcs', 'downtime min', 'press running', 'mold change'],
    sample: 'Output 793 pcs\nReject 30 pcs\nDowntime 45 min\nPress running 6\nMold change 2',
    placeholder: 'Example: Output 793 pcs, reject 30 pcs, downtime 45 min, press running 6.',
  },
  {
    section: 'QC / inspection',
    plant: 'Floor A',
    owner: 'Quality team',
    preferredMode: 'normal_abnormal',
    focus: 'Inspection result, defects, holds, claim signals.',
    expected: ['inspected pcs', 'defect pcs', 'hold pcs', 'claim note'],
    sample: 'Inspected 780 pcs\nDefect 12 pcs\nHold 4 pcs\nClaim review 1',
    placeholder: 'Example: inspected 780 pcs, defect 12 pcs, hold 4 pcs, claim review 1.',
  },
  {
    section: 'Maintenance',
    plant: 'Floor A',
    owner: 'Maintenance team',
    preferredMode: 'normal_abnormal',
    focus: 'Downtime, breakdown, PM, open repair, parts waiting.',
    expected: ['downtime min', 'breakdown count', 'PM done', 'open repair', 'parts waiting'],
    sample: 'Downtime 35 min\nBreakdown 1\nPM done 3\nOpen repair 2\nParts waiting 1',
    placeholder: 'Example: downtime 35 min, breakdown 1, PM done 3, open repair 2.',
  },
  {
    section: 'Utility',
    plant: 'Floor A',
    owner: 'Maintenance team',
    preferredMode: 'normal_abnormal',
    focus: 'Boiler, compressor, electricity, water, utility abnormality.',
    expected: ['utility normal/abnormal', 'downtime min', 'repair note'],
    sample: 'Compressor OK 1\nBoiler issue 0\nUtility downtime 0 min\nWater pressure OK 1',
    placeholder: 'Example: compressor OK, boiler issue 0, utility downtime 0 min.',
  },
  {
    section: 'Sales balance board',
    plant: 'Floor A',
    owner: 'Sales and inventory team',
    preferredMode: 'whiteboard_snapshot',
    focus: 'Sales board, collection, balance, closing stock.',
    expected: ['opening balance', 'sales pcs', 'collection', 'closing balance'],
    sample: 'Opening balance 126 pcs\nSales 42 pcs\nCollection 850000 MMK\nClosing balance 84 pcs',
    placeholder: 'Example: opening balance 126 pcs, sales 42 pcs, collection 850000 MMK.',
  },
  {
    section: 'Showroom stock board',
    plant: 'Floor A',
    owner: 'Sales and inventory team',
    preferredMode: 'whiteboard_snapshot',
    focus: 'Showroom stock movement and closing quantity.',
    expected: ['opening stock', 'sold pcs', 'received pcs', 'closing stock'],
    sample: 'Opening stock 180 pcs\nSold 26 pcs\nReceived 40 pcs\nClosing stock 194 pcs',
    placeholder: 'Example: opening stock 180 pcs, sold 26 pcs, received 40 pcs, closing stock 194 pcs.',
  },
  {
    section: 'Sales / inventory',
    plant: 'Floor A',
    owner: 'Sales and inventory team',
    preferredMode: 'whiteboard_snapshot',
    focus: 'Sales, dispatch, stock movement, dealer follow-up.',
    expected: ['sales pcs', 'dispatch pcs', 'stock pcs', 'collection'],
    sample: 'Sales 42 pcs\nDispatch 38 pcs\nStock 194 pcs\nCollection 850000 MMK',
    placeholder: 'Example: sales 42 pcs, dispatch 38 pcs, stock 194 pcs, collection 850000 MMK.',
  },
  {
    section: 'Admin / planning',
    plant: 'Floor A',
    owner: 'Admin and planning team',
    preferredMode: 'daily_routine',
    focus: 'Presence, OT, plan gap, missing forms, training.',
    expected: ['attendance', 'OT hours', 'plan gap', 'missing forms'],
    sample: 'Present 42 people\nOT 18 hr\nPlan gap 2 items\nMissing form 1',
    placeholder: 'Example: attendance 42 people, OT 18 hr, plan gap 2 items, missing form 1.',
  },
  {
    section: 'Floor B daily routine',
    plant: 'Floor B',
    owner: 'Production team',
    preferredMode: 'daily_routine',
    focus: 'Mr Wu daily routine: 5W1H, output, issue, next step.',
    expected: ['who', 'what', 'where', 'when', 'why', 'how much'],
    sample: 'Who Mr Wu\nWhat daily routine checked\nWhere Floor B\nWhen today\nWhy daily control\nHow much output updated',
    placeholder: 'Example: Mr Wu checked daily routine, output updated, one next action for line team.',
  },
  {
    section: 'Floor B normal / abnormal',
    plant: 'Floor B',
    owner: 'Production team',
    preferredMode: 'normal_abnormal',
    focus: 'Floor B normal/abnormal record and next action.',
    expected: ['normal/abnormal', 'machine/area', 'downtime', 'next action'],
    sample: 'Normal running 1\nAbnormal machine stop 20 min\nNext maintenance check before shift end',
    placeholder: 'Example: normal running; abnormal machine stop 20 min; maintenance checks before shift end.',
  },
  {
    section: 'Floor B 5S',
    plant: 'Floor B',
    owner: 'Production team',
    preferredMode: 'five_s_check',
    focus: 'Floor B 5S: sort, set, shine, standardize, sustain.',
    expected: ['sort', 'set', 'shine', 'standardize', 'sustain'],
    sample: 'Sort OK 1\nSet tools OK 1\nShine OK 1\nStandard labels missing 1\nSustain follow-up tomorrow',
    placeholder: 'Example: sort OK, set tools OK, shine OK, labels missing 1, follow-up tomorrow.',
  },
]

const OWNER_TEAM_OPTIONS = [
  'Operations team',
  'Production team',
  'Quality team',
  'Maintenance team',
  'Stores team',
  'Admin and planning team',
  'Sales and inventory team',
  'Plant review',
] as const

type MetricPresetId = 'production_output' | 'sales_dispatch' | 'inventory_close' | 'material_purchase'

type MetricPreset = {
  id: MetricPresetId
  label: string
  metric_name: string
  metric_group: string
  unit: string
  notes: string
}

const METRIC_PRESETS: MetricPreset[] = [
  {
    id: 'production_output',
    label: 'Production output',
    metric_name: 'Production output',
    metric_group: 'production',
    unit: 'pcs',
    notes: 'Daily production close from shift board.',
  },
  {
    id: 'sales_dispatch',
    label: 'Sales dispatch',
    metric_name: 'Sales dispatch qty',
    metric_group: 'commercial',
    unit: 'pcs',
    notes: 'Daily dispatched quantity from sales board.',
  },
  {
    id: 'inventory_close',
    label: 'Inventory close',
    metric_name: 'Inventory closing qty',
    metric_group: 'commercial',
    unit: 'pcs',
    notes: 'Daily closing stock from showroom or warehouse board.',
  },
  {
    id: 'material_purchase',
    label: 'Material purchase',
    metric_name: 'Material purchase amount',
    metric_group: 'finance',
    unit: 'MMK',
    notes: 'Daily material purchase or payable update.',
  },
]

function metricPresetFromSection(section: string): MetricPresetId | null {
  const normalized = section.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('sales') || normalized.includes('dispatch')) return 'sales_dispatch'
  if (normalized.includes('stock') || normalized.includes('inventory')) return 'inventory_close'
  if (normalized.includes('supplier') || normalized.includes('receiving') || normalized.includes('material')) return 'material_purchase'
  if (normalized.includes('mixing') || normalized.includes('curing') || normalized.includes('building') || normalized.includes('production')) {
    return 'production_output'
  }
  return null
}

function plantScopeFromSection(section: string): 'Floor A' | 'Floor B' {
  return section.toLowerCase().includes('Floor B') ? 'Floor B' : 'Floor A'
}

function orgIdForPlantScope(scope: 'Floor A' | 'Floor B') {
  return scope === 'Floor B' ? 'ytf-plant-b' : 'ytf-plant-a'
}

function modeWritesWcmRecord(mode: EntryMode, condition: string) {
  return (
    mode === 'daily_routine' ||
    mode === 'normal_abnormal' ||
    mode === 'five_s_check' ||
    mode === 'quality_incident' ||
    mode === 'maintenance_issue' ||
    condition === 'abnormal' ||
    condition === 'follow-up'
  )
}

function ownerTeamForSection(section: string, mode: EntryMode) {
  const blueprint = sectionBlueprintFor(section)
  if (blueprint) return blueprint.owner
  const haystack = `${section} ${mode}`.toLowerCase()
  if (/sales|showroom|stock|inventory|balance/.test(haystack)) return 'Sales and inventory team'
  if (/qc|quality|claim|defect|inspection/.test(haystack)) return 'Quality team'
  if (/maint|utility|machine|press|downtime|repair/.test(haystack)) return 'Maintenance team'
  if (/receiving|supplier|stores|grn|raw/.test(haystack)) return 'Stores team'
  if (/admin|planning|hr|training/.test(haystack)) return 'Admin and planning team'
  return 'Production team'
}

function sectionBlueprintFor(section: string) {
  const normalized = section.trim().toLowerCase()
  return SECTION_ENTRY_BLUEPRINTS.find((blueprint) => blueprint.section.toLowerCase() === normalized)
}

function defaultSectionBlueprint(section: string, mode: EntryMode): SectionEntryBlueprint {
  return {
    section: section.trim() || '01 Mixing',
    plant: plantScopeFromSection(section),
    owner: ownerTeamForSection(section, mode),
    preferredMode: mode,
    focus: 'One short entry with section, condition, evidence, and next step.',
    expected: ['short fact', 'note or photo if useful', 'next action only if abnormal'],
    sample: 'Normal 1\nIssue 0\nNext action none',
    placeholder: quickModePlaceholder(mode),
  }
}

function getSectionBlueprint(section: string, mode: EntryMode) {
  return sectionBlueprintFor(section) ?? defaultSectionBlueprint(section, mode)
}

const SHIFT_DEFAULTS: ShiftForm = {
  title: '',
  owner: 'Plant review',
  priority: 'high',
  due: '',
  notes: '',
  evidence_link: '',
}

const QUICK_ENTRY_DEFAULTS: QuickEntryForm = {
  note: '',
  section: '01 Mixing',
  condition: 'normal',
  owner: 'Operations team',
  priority: 'high',
  due: '',
}

const STRUCTURED_ENTRY_DEFAULTS: StructuredEntryForm = {
  who: '',
  what: '',
  where: '',
  when: '',
  why: '',
  how: '',
  normal: '',
  abnormal: '',
  nextAction: '',
  sort: '',
  setOrder: '',
  shine: '',
  standardize: '',
  sustain: '',
}

const WHITEBOARD_DEFAULTS: WhiteboardForm = {
  section: '01 Mixing',
  shift: '',
  board_date: '',
  visible_numbers: '',
  owner: 'Production team',
  evidence_link: '',
}

const QUALITY_DEFAULTS: QualityForm = {
  title: '',
  summary: '',
  supplier: 'Internal',
  severity: 'medium',
  owner: 'Quality team',
  target_close_date: '',
  evidence_link: '',
}

const MAINTENANCE_DEFAULTS: MaintenanceForm = {
  asset_name: '',
  issue_type: 'breakdown',
  priority: 'medium',
  owner: 'Maintenance team',
  downtime_minutes: '',
  next_action: '',
  evidence_link: '',
}

const RECEIVING_DEFAULTS: ReceivingForm = {
  supplier: '',
  material: '',
  po_or_pi: '',
  grn_or_batch: '',
  expected_qty: '',
  received_qty: '',
  status: 'review',
  owner: 'Stores team',
  next_action: '',
  evidence_link: '',
}

const METRIC_DEFAULTS: MetricForm = {
  metric_name: '',
  metric_group: 'production',
  metric_value: '',
  unit: 'value',
  period_label: '',
  scope: '',
  owner: 'Plant review',
  notes: '',
  evidence_link: '',
}

const DOCUMENT_DEFAULTS: DocumentForm = {
  document_name: '',
  document_type: 'SOP',
  change_type: 'revision',
  owner: 'Admin and planning team',
  effective_date: '',
  summary: '',
  evidence_link: '',
}

const AUDIT_DEFAULTS: AuditForm = {
  title: '',
  review_type: 'audit',
  area: '',
  owner: 'Plant review',
  due: '',
  priority: 'high',
  summary: '',
  evidence_link: '',
}

const TRAINING_DEFAULTS: TrainingForm = {
  topic: '',
  audience: '',
  owner: 'Operations team',
  due: '',
  verification: 'Supervisor confirmation',
  summary: '',
  evidence_link: '',
}

function normalizeEntryCondition(value: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'normal' || normalized === 'abnormal' || normalized === 'follow-up' || normalized === 'done') {
    return normalized
  }
  return ''
}

const ALLOWED_CAPABILITIES = [
  'actions.view',
  'operations.view',
  'dqms.view',
  'maintenance.view',
  'receiving.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
] as const

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('The photo could not be read.'))
    reader.readAsDataURL(file)
  })
}

async function compressEvidencePhoto(file: File) {
  const fallback = await readFileAsDataUrl(file)

  if (typeof document === 'undefined') {
    return fallback
  }

  const image = new Image()
  image.decoding = 'async'
  image.src = fallback

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('The photo preview could not be generated.'))
  })

  const maxSide = 960
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return fallback
  }

  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.72)
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

function canOpenDailyEntry(session: SessionState | null | undefined) {
  return ALLOWED_CAPABILITIES.some((capability) => sessionHasCapability(session, capability))
}

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 4500) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}

async function safeWorkspaceRows<T>(path: string) {
  try {
    const payload = await withTimeout(workspaceFetch<{ rows?: T[] }>(path), { rows: [] })
    return payload.rows ?? []
  } catch {
    return []
  }
}

function defaultDueDate() {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  return next.toISOString().slice(0, 10)
}

function routedSaveMessage(payload: EntrySavePayload, fallback: string) {
  const taskCount = payload.linked_tasks?.saved_count ?? 0
  const actionCount = payload.linked_action?.saved_count ?? 0
  const routedCount = taskCount || actionCount
  if (!routedCount) {
    return payload.message ?? fallback
  }
  return `${payload.message ?? fallback} ${taskCount ? `${taskCount} task${taskCount === 1 ? '' : 's'}` : `${actionCount} action${actionCount === 1 ? '' : 's'}`} opened.`
}

function quickTitleFromNote(note: string, fallback: string) {
  const firstLine = note
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean)
  if (!firstLine) {
    return fallback
  }
  return firstLine.length > 74 ? `${firstLine.slice(0, 71).trim()}...` : firstLine
}

function metricDefinitionKey(metric: EnterpriseMetricRecord) {
  return metric.metric_id || `${metric.metric_group || 'metric'}:${metric.metric_name || 'unnamed'}`
}

function metricDefinitionUnit(metric: EnterpriseMetricRecord) {
  const explicitUnit = String(metric.unit || '').trim()
  if (explicitUnit && explicitUnit !== 'definition') return explicitUnit
  const name = String(metric.metric_name || '').toLowerCase()
  if (name.includes('kg') || name.includes('weight')) return 'kg'
  if (name.includes('us$') || name.includes('price') || name.includes('amount')) return 'US$'
  if (name.includes('qty') || name.includes('quantity')) return 'qty'
  if (name.includes('percent') || name.includes('%')) return '%'
  return 'value'
}

function metricPeriodLabel() {
  return new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function isVisibleEntryMode(value: string | null): value is EntryMode {
  return VISIBLE_ENTRY_MODE_IDS.includes(value as EntryMode)
}

function normalizeMetricLabel(value: string) {
  return value
    .replace(/[_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-:]+|[-:]+$/g, '')
}

function inferWhiteboardUnit(label: string, rawUnit: string, rawLine: string) {
  const unit = rawUnit.trim()
  if (unit) {
    return unit
  }
  const haystack = `${label} ${rawLine}`.toLowerCase()
  if (haystack.includes('downtime') || haystack.includes('minute') || haystack.includes(' min')) return 'min'
  if (haystack.includes('reject') || haystack.includes('defect') || haystack.includes('claim')) return 'pcs'
  if (haystack.includes('output') || haystack.includes('production') || haystack.includes('qty')) return 'pcs'
  if (haystack.includes('wip') || haystack.includes('stock')) return 'pcs'
  if (haystack.includes('ot') || haystack.includes('overtime') || haystack.includes('hour')) return 'hr'
  if (haystack.includes('kg') || haystack.includes('compound') || haystack.includes('weight')) return 'kg'
  if (haystack.includes('%') || haystack.includes('rate')) return '%'
  return 'value'
}

function parseWhiteboardMetricCandidates(visibleNumbers: string, section: string): WhiteboardMetricCandidate[] {
  const normalizedText = visibleNumbers
    .replace(/\r/g, '\n')
    .replace(/[|;]/g, '\n')
    .replace(/,\s*(?=[A-Za-z])/g, '\n')
  const segments = normalizedText
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const candidates: WhiteboardMetricCandidate[] = []
  const seen = new Set<string>()

  segments.forEach((segment) => {
    const pairPattern = /([A-Za-z][A-Za-z0-9/%() ._-]{1,54}?)[\s:=-]+(-?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*([A-Za-z%]+))?/g
    let matched = false
    for (const match of segment.matchAll(pairPattern)) {
      const label = normalizeMetricLabel(match[1] || '')
      const number = String(match[2] || '').replace(/,/g, '')
      if (!label || !number) continue
      matched = true
      const unit = inferWhiteboardUnit(label, match[3] || '', segment)
      const key = `${label.toLowerCase()}:${number}:${unit}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({
        metric_name: `${label} - ${section}`.slice(0, 110),
        metric_value: number,
        unit,
        raw_line: segment,
      })
    }

    if (!matched) {
      const fallbackNumber = segment.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/)
      if (!fallbackNumber) return
      const number = fallbackNumber[0].replace(/,/g, '')
      const label = normalizeMetricLabel(segment.replace(fallbackNumber[0], '')) || `Board number ${candidates.length + 1}`
      const unit = inferWhiteboardUnit(label, '', segment)
      const key = `${label.toLowerCase()}:${number}:${unit}`
      if (seen.has(key)) return
      seen.add(key)
      candidates.push({
        metric_name: `${label} - ${section}`.slice(0, 110),
        metric_value: number,
        unit,
        raw_line: segment,
      })
    }
  })

  return candidates.slice(0, 8)
}

function whiteboardResultToText(result: YtfAgenticWhiteboardResult | null | undefined) {
  if (!result) return ''

  const lines: string[] = []
  if (result.reported_units !== undefined && result.reported_units !== null) {
    lines.push(`Output ${result.reported_units} pcs`)
  }
  if (result.rejects !== undefined && result.rejects !== null) {
    lines.push(`Reject ${result.rejects} pcs`)
  }
  ;(result.metrics ?? []).forEach((metric) => {
    const name = String(metric.name || 'Board number').trim()
    const value = metric.value === undefined || metric.value === null ? '' : String(metric.value).trim()
    const unit = String(metric.unit || '').trim()
    if (!value) return
    lines.push([name, value, unit].filter(Boolean).join(' '))
  })
  if (!lines.length && result.raw_text) {
    lines.push(result.raw_text)
  }

  return lines.join('\n')
}

function evidenceLabelForNotes(evidenceLink: string) {
  if (!evidenceLink.trim()) return ''
  if (evidenceLink.startsWith('data:image/')) {
    return 'Evidence: compressed photo attached to the entry.'
  }
  return `Evidence: ${evidenceLink.trim()}`
}

function modeTaskTemplate(mode: EntryMode) {
  if (mode === 'daily_routine') return 'manager_daily_5w1h'
  if (mode === 'normal_abnormal') return 'manager_normal_abnormal'
  if (mode === 'five_s_check') return 'manager_5s_check'
  if (mode === 'whiteboard_snapshot') return 'whiteboard_metric_snapshot'
  return 'manager_quick_entry'
}

function quickModePlaceholder(mode: EntryMode) {
  if (mode === 'daily_routine') return 'Example: Today we checked output, rejects, manpower, safety, and the next action.'
  if (mode === 'normal_abnormal') return 'Example: Normal in Mixing. Abnormal in Curing: press 3 stopped for 20 min; maintenance informed.'
  if (mode === 'five_s_check') return 'Example: Floor cleared, tools returned, red tag area checked, one follow-up for scrap labels.'
  if (mode === 'shift_handoff') return 'Example: Shift B should watch press 3 temperature and finish the pending compound transfer.'
  if (mode === 'quality_incident') return 'Example: Sidewall blemish on batch A-102; 12 pcs isolated; QA to confirm root cause.'
  if (mode === 'maintenance_issue') return 'Example: Building machine belt noise; still running; inspect before next shift.'
  if (mode === 'receiving_hold') return 'Example: Carbon black delivery short by 4 bags; hold GRN until supplier confirms.'
  if (mode === 'kpi_snapshot') return 'Example: Output 420 pcs, rejects 8 pcs, downtime 35 min, OT 2 hr.'
  if (mode === 'document_control') return 'Example: SOP mixing revision needs owner sign-off before Monday.'
  if (mode === 'audit_review') return 'Example: Daily audit found missing cleaning record; owner assigned for closeout.'
  if (mode === 'training_followup') return 'Example: New operator training finished; supervisor needs practical verification.'
  return 'Write the short factory update, evidence, and next action.'
}

function quickModeQuestion(mode: EntryMode) {
  if (mode === 'daily_routine') return 'Daily 5W1H: what changed today?'
  if (mode === 'normal_abnormal') return 'Is it normal or abnormal?'
  if (mode === 'five_s_check') return '5S: what did you check?'
  if (mode === 'whiteboard_snapshot') return 'Attach the board photo.'
  if (mode === 'quality_incident') return 'Quality: what defect, claim, or hold happened?'
  if (mode === 'maintenance_issue') return 'Machine: what stopped or needs repair?'
  if (mode === 'receiving_hold') return 'Receiving: what supplier, material, or quantity issue?'
  if (mode === 'kpi_snapshot') return 'Number: what value should the dashboard use?'
  return 'Short update'
}

function usesStructuredEntry(mode: EntryMode) {
  return mode === 'daily_routine' || mode === 'normal_abnormal' || mode === 'five_s_check'
}

function structuredNoteForMode(mode: EntryMode, form: StructuredEntryForm, condition: string) {
  if (mode === 'daily_routine') {
    return [
      condition && condition !== 'normal' ? `Condition: ${condition}` : '',
      form.who ? `Who: ${form.who}` : '',
      form.what ? `What: ${form.what}` : '',
      form.where ? `Where: ${form.where}` : '',
      form.when ? `When: ${form.when}` : '',
      form.why ? `Why: ${form.why}` : '',
      form.how ? `How much/how: ${form.how}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (mode === 'normal_abnormal') {
    return [
      `Condition: ${condition || 'normal'}`,
      form.normal ? `Normal: ${form.normal}` : '',
      form.abnormal ? `Abnormal: ${form.abnormal}` : '',
      form.nextAction ? `Next action: ${form.nextAction}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (mode === 'five_s_check') {
    return [
      form.sort ? `Sort: ${form.sort}` : '',
      form.setOrder ? `Set in order: ${form.setOrder}` : '',
      form.shine ? `Shine: ${form.shine}` : '',
      form.standardize ? `Standardize: ${form.standardize}` : '',
      form.sustain ? `Sustain: ${form.sustain}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function saveButtonLabel(mode: EntryMode) {
  if (mode === 'whiteboard_snapshot') return 'Save board photo'
  if (mode === 'daily_routine') return 'Save routine'
  if (mode === 'normal_abnormal') return 'Save condition'
  if (mode === 'five_s_check') return 'Save 5S'
  return 'Save entry'
}

export function DailyEntryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const cachedSessionPayload = useMemo(() => loadCachedWorkspaceSession(), [])
  const [loading, setLoading] = useState(!cachedSessionPayload?.authenticated)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [session, setSession] = useState<SessionState | null>(cachedSessionPayload?.session ?? null)
  const [activeMode, setActiveMode] = useState<EntryMode>(() => {
    const requestedMode = searchParams.get('mode')
    return isVisibleEntryMode(requestedMode) ? requestedMode : 'daily_routine'
  })
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [taskRows, setTaskRows] = useState<TaskRow[]>([])
  const [incidentRows, setIncidentRows] = useState<QualityIncidentRow[]>([])
  const [maintenanceRows, setMaintenanceRows] = useState<MaintenanceRow[]>([])
  const [receivingRows, setReceivingRows] = useState<ReceivingRow[]>([])
  const [metricRows, setMetricRows] = useState<MetricRow[]>([])
  const [officialKpis, setOfficialKpis] = useState<EnterpriseMetricRecord[]>([])
  const [dailyKpiValues, setDailyKpiValues] = useState<Record<string, string>>({})
  const [shiftForm, setShiftForm] = useState<ShiftForm>(SHIFT_DEFAULTS)
  const [quickForm, setQuickForm] = useState<QuickEntryForm>(QUICK_ENTRY_DEFAULTS)
  const [structuredForm, setStructuredForm] = useState<StructuredEntryForm>(STRUCTURED_ENTRY_DEFAULTS)
  const [whiteboardForm, setWhiteboardForm] = useState<WhiteboardForm>(WHITEBOARD_DEFAULTS)
  const [qualityForm, setQualityForm] = useState<QualityForm>(QUALITY_DEFAULTS)
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceForm>(MAINTENANCE_DEFAULTS)
  const [receivingForm, setReceivingForm] = useState<ReceivingForm>(RECEIVING_DEFAULTS)
  const [metricForm, setMetricForm] = useState<MetricForm>(METRIC_DEFAULTS)
  const [documentForm, setDocumentForm] = useState<DocumentForm>(DOCUMENT_DEFAULTS)
  const [auditForm, setAuditForm] = useState<AuditForm>(AUDIT_DEFAULTS)
  const [trainingForm, setTrainingForm] = useState<TrainingForm>(TRAINING_DEFAULTS)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMessage, setPhotoMessage] = useState<string | null>(null)
  const [voiceListening, setVoiceListening] = useState(false)
  const [appliedPackId, setAppliedPackId] = useState<string | null>(null)
  const [languageMode] = useState<YtfLanguageMode>(() => {
    if (typeof window === 'undefined') return 'en'
    const saved = window.localStorage.getItem(YTF_LANGUAGE_MODE_STORAGE_KEY)
    return saved === 'my' || saved === 'both' || saved === 'en' ? 'en' : 'en'
  })

  function t(english: string, burmese: string) {
    return translateYtfUse(languageMode, english, burmese)
  }

  useEffect(() => {
    const requestedSection = searchParams.get('section')?.trim()
    if (!requestedSection || !WHITEBOARD_SECTION_OPTIONS.includes(requestedSection as (typeof WHITEBOARD_SECTION_OPTIONS)[number])) return
    const blueprint = getSectionBlueprint(requestedSection, activeMode)
    setQuickForm((current) =>
      current.section === requestedSection && current.owner === blueprint.owner
        ? current
        : { ...current, section: requestedSection, owner: blueprint.owner },
    )
    setWhiteboardForm((current) =>
      current.section === requestedSection && current.owner === blueprint.owner
        ? current
        : { ...current, section: requestedSection, owner: blueprint.owner },
    )
    if (activeMode === 'kpi_snapshot') {
      const presetId = metricPresetFromSection(requestedSection)
      if (!presetId) return
      const preset = METRIC_PRESETS.find((item) => item.id === presetId)
      if (!preset) return
      setMetricForm((current) => ({
        ...current,
        metric_name: current.metric_name.trim() || preset.metric_name,
        metric_group: current.metric_group.trim() || preset.metric_group,
        unit: current.unit.trim() || preset.unit,
        period_label: current.period_label.trim() || metricPeriodLabel(),
        scope: current.scope.trim() || `Factory Client ${plantScopeFromSection(requestedSection)}`,
        owner: current.owner.trim() || blueprint.owner,
        notes: current.notes.trim() || preset.notes,
      }))
    }
  }, [activeMode, searchParams])

  useEffect(() => {
    const requestedCondition = normalizeEntryCondition(searchParams.get('condition'))
    if (!requestedCondition) return
    setQuickForm((current) =>
      current.condition === requestedCondition
        ? current
        : { ...current, condition: requestedCondition },
    )
  }, [searchParams])

  function startVoiceNote() {
    if (typeof window === 'undefined') return
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setPhotoMessage('Voice typing is not supported in this browser. Use keyboard typing or phone dictation.')
      return
    }
    const recognition = new Recognition()
    recognition.lang = languageMode === 'my' ? 'my-MM' : 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setVoiceListening(true)
    recognition.onend = () => setVoiceListening(false)
    recognition.onerror = () => {
      setVoiceListening(false)
      setPhotoMessage('Voice typing stopped. Try again or use phone dictation.')
    }
    recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim()
      if (!text) return
      setQuickForm((current) => ({
        ...current,
        note: [current.note.trim(), text].filter(Boolean).join('\n'),
      }))
    }
    recognition.start()
  }

  async function loadDesk(nextSession: SessionState | null | undefined = session) {
    if (!nextSession) {
      startTransition(() => {
        setSession(null)
        setTaskRows([])
        setIncidentRows([])
        setMaintenanceRows([])
        setReceivingRows([])
        setMetricRows([])
        setOfficialKpis([])
        setUpdatedAt(new Date().toISOString())
      })
      return
    }

    const [taskPayload, incidentPayload, maintenancePayload, receivingPayload, metricPayload, officialPayload] = await Promise.all([
      safeWorkspaceRows<TaskRow>('/api/workspace-tasks?status=open&limit=8'),
      safeWorkspaceRows<QualityIncidentRow>('/api/quality/incidents?limit=6'),
      safeWorkspaceRows<MaintenanceRow>('/api/maintenance/records?limit=6'),
      safeWorkspaceRows<ReceivingRow>('/api/receiving/records?limit=6'),
      safeWorkspaceRows<MetricRow>('/api/metrics/records?limit=6'),
      getYtfKpiDefinitionsLatest().catch(() => null),
    ])

    startTransition(() => {
      setSession(nextSession ?? null)
      setTaskRows(taskPayload)
      setIncidentRows(incidentPayload)
      setMaintenanceRows(maintenancePayload)
      setReceivingRows(receivingPayload)
      setMetricRows(metricPayload)
      setOfficialKpis(officialPayload?.rows ?? [])
      setUpdatedAt(new Date().toISOString())
    })
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const sessionPayload = await getWorkspaceSession()
        if (cancelled) {
          return
        }
        setSession(sessionPayload.session ?? null)
        if (!sessionPayload.authenticated) {
          setLoading(false)
          return
        }
        setLoading(false)
        void loadDesk(sessionPayload.session ?? null).catch((nextError) => {
          if (!cancelled) {
            setError(nextError instanceof Error ? nextError.message : 'Recent rows could not be loaded.')
          }
        })
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Daily entry could not be loaded.')
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const capabilityProfile = useMemo(() => getCapabilityProfileForRole(session?.role), [session?.role])
  const roleSuggestedPack = useMemo(() => getEntryPackByRole(session?.role), [session?.role])
  const activePack = useMemo(() => getEntryPackById(searchParams.get('pack')) ?? roleSuggestedPack, [roleSuggestedPack, searchParams])
  const activeCard = useMemo(() => MODE_CARDS.find((item) => item.id === activeMode) ?? MODE_CARDS[0], [activeMode])
  const packAllowedModes = useMemo(() => new Set(activePack?.allowedModes ?? MODE_CARDS.map((item) => item.id)), [activePack])
  const secondaryModeCards = useMemo(
    () => MODE_CARDS.filter((item) => SECONDARY_MODE_IDS.includes(item.id) && packAllowedModes.has(item.id)),
    [packAllowedModes],
  )
  const showAdvancedEntryPanel = secondaryModeCards.length > 0
  const documentTaskRows = useMemo(() => taskRows.filter((row) => row.template === 'document_control_entry'), [taskRows])
  const auditTaskRows = useMemo(() => taskRows.filter((row) => row.template === 'audit_review_entry'), [taskRows])
  const trainingTaskRows = useMemo(() => taskRows.filter((row) => row.template === 'training_followup_entry'), [taskRows])
  const recentRows = useMemo(() => {
    if (activeMode === 'daily_routine' || activeMode === 'normal_abnormal' || activeMode === 'five_s_check' || activeMode === 'shift_handoff') {
      return taskRows.map((row) => ({
        id: row.task_id,
        title: row.title,
        meta: `${row.owner} / ${row.priority} / ${row.status}`,
        detail: row.notes || (row.due ? `Due ${row.due}` : 'Open follow-up task'),
      }))
    }
    if (activeMode === 'whiteboard_snapshot') {
      return taskRows
        .filter((row) => row.template === 'whiteboard_metric_snapshot')
        .map((row) => ({
          id: row.task_id,
          title: row.title,
          meta: `${row.owner} / ${row.priority} / ${row.status}`,
      detail: row.due ? `Due ${row.due}` : row.notes || 'Whiteboard number',
        }))
    }
    if (activeMode === 'quality_incident') {
      return incidentRows.map((row) => ({
        id: row.incident_id,
        title: row.title,
        meta: `${row.owner} / ${row.severity} / ${row.status}`,
        detail: row.target_close_date ? `Target close ${row.target_close_date}` : 'Incident record',
      }))
    }
    if (activeMode === 'maintenance_issue') {
      return maintenanceRows.map((row) => ({
        id: row.maintenance_id,
        title: row.asset_name,
        meta: `${row.owner} / ${row.issue_type} / ${row.status}`,
        detail: row.downtime_minutes ? `${row.downtime_minutes} min downtime` : 'Maintenance record',
      }))
    }
    if (activeMode === 'receiving_hold') {
      return receivingRows.map((row) => ({
        id: row.receiving_id,
        title: `${row.supplier} / ${row.material}`,
        meta: `${row.owner} / ${row.status}`,
        detail: row.next_action || 'Receiving record',
      }))
    }
    if (activeMode === 'document_control') {
      return documentTaskRows.map((row) => ({
        id: row.task_id,
        title: row.title,
        meta: `${row.owner} / ${row.priority} / ${row.status}`,
        detail: row.due ? `Due ${row.due}` : row.notes || 'Controlled-document action',
      }))
    }
    if (activeMode === 'audit_review') {
      return auditTaskRows.map((row) => ({
        id: row.task_id,
        title: row.title,
        meta: `${row.owner} / ${row.priority} / ${row.status}`,
        detail: row.due ? `Due ${row.due}` : row.notes || 'Review action',
      }))
    }
    if (activeMode === 'training_followup') {
      return trainingTaskRows.map((row) => ({
        id: row.task_id,
        title: row.title,
        meta: `${row.owner} / ${row.priority} / ${row.status}`,
        detail: row.due ? `Due ${row.due}` : row.notes || 'Training action',
      }))
    }
    return metricRows.map((row) => ({
      id: row.metric_id,
      title: row.metric_name,
      meta: `${row.metric_value} ${row.unit}`.trim(),
      detail: [row.metric_group, row.period_label, row.owner].filter(Boolean).join(' / '),
    }))
  }, [activeMode, auditTaskRows, documentTaskRows, incidentRows, maintenanceRows, metricRows, receivingRows, taskRows, trainingTaskRows])
  const currentEvidenceLink = useMemo(() => {
    if (activeMode === 'quality_incident') {
      return qualityForm.evidence_link
    }
    if (activeMode === 'maintenance_issue') {
      return maintenanceForm.evidence_link
    }
    if (activeMode === 'receiving_hold') {
      return receivingForm.evidence_link
    }
    if (activeMode === 'whiteboard_snapshot') {
      return whiteboardForm.evidence_link
    }
    if (activeMode === 'kpi_snapshot') {
      return metricForm.evidence_link
    }
    if (activeMode === 'document_control') {
      return documentForm.evidence_link
    }
    if (activeMode === 'audit_review') {
      return auditForm.evidence_link
    }
    if (activeMode === 'training_followup') {
      return trainingForm.evidence_link
    }
    return shiftForm.evidence_link
  }, [activeMode, auditForm.evidence_link, documentForm.evidence_link, maintenanceForm.evidence_link, metricForm.evidence_link, qualityForm.evidence_link, receivingForm.evidence_link, shiftForm.evidence_link, trainingForm.evidence_link, whiteboardForm.evidence_link])
  const evidencePreviewIsImage = currentEvidenceLink.startsWith('data:image/')
  const isWhiteboardMode = activeMode === 'whiteboard_snapshot'
  const activeSectionBlueprint = useMemo(
    () => getSectionBlueprint(isWhiteboardMode ? whiteboardForm.section : quickForm.section, activeMode),
    [activeMode, isWhiteboardMode, quickForm.section, whiteboardForm.section],
  )
  const whiteboardMetricCandidates = useMemo(
    () => parseWhiteboardMetricCandidates(whiteboardForm.visible_numbers, whiteboardForm.section),
    [whiteboardForm.section, whiteboardForm.visible_numbers],
  )
  const evidenceHelp = isWhiteboardMode
    ? t(
        'Upload one clear board photo. The system reads the board after save and updates the plant data.',
        'Upload one clear board photo. The system reads the board after save and updates the plant data.',
      )
    : t(
        'Optional photo or evidence link. Add it only when it helps the next person understand the work.',
        'လိုအပ်ရင် ဓာတ်ပုံ သို့မဟုတ် link တစ်ခုထည့်ပါ။ နောက်လူနားလည်ဖို့ အထောက်အထားဖြစ်ရင်ပဲ ထည့်ပါ။',
      )
  const quickKpiDefinitions = useMemo(() => officialKpis.slice(0, 6), [officialKpis])
  const metricSectionHint = useMemo(() => searchParams.get('section')?.trim() || '', [searchParams])
  const metricPresetId = useMemo(() => metricPresetFromSection(metricSectionHint), [metricSectionHint])
  const showQuickKpiPanel = activeMode === 'kpi_snapshot' && quickKpiDefinitions.length > 0 && !metricPresetId
  const dailyKpiReadyCount = useMemo(
    () => quickKpiDefinitions.filter((metric) => dailyKpiValues[metricDefinitionKey(metric)]?.trim()).length,
    [dailyKpiValues, quickKpiDefinitions],
  )
  useEffect(() => {
    if (activeMode !== 'kpi_snapshot' || !metricPresetId) return
    const preset = METRIC_PRESETS.find((item) => item.id === metricPresetId)
    if (!preset) return
    const sectionHint = metricSectionHint || quickForm.section
    const plantScope = sectionHint ? plantScopeFromSection(sectionHint) : 'Floor A'
    const ownerHint = ownerTeamForSection(sectionHint || '01 Mixing', 'kpi_snapshot')
    setMetricForm((current) =>
      current.metric_name.trim()
        ? current
        : {
            ...current,
            metric_name: preset.metric_name,
            metric_group: preset.metric_group,
            unit: preset.unit,
            period_label: current.period_label.trim() || metricPeriodLabel(),
            scope: current.scope.trim() || `Factory Client ${plantScope}`,
            owner: current.owner.trim() || ownerHint,
            notes: current.notes.trim() || preset.notes,
          },
    )
  }, [activeMode, metricPresetId, metricSectionHint, quickForm.section])

  function applyMetricPreset(presetId: MetricPresetId) {
    const preset = METRIC_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    const sectionHint = metricSectionHint || quickForm.section
    const plantScope = sectionHint ? plantScopeFromSection(sectionHint) : 'Floor A'
    const ownerHint = ownerTeamForSection(sectionHint || '01 Mixing', 'kpi_snapshot')
    setMetricForm((current) => ({
      ...current,
      metric_name: preset.metric_name,
      metric_group: preset.metric_group,
      unit: preset.unit,
      period_label: current.period_label.trim() || metricPeriodLabel(),
      scope: current.scope.trim() || `Factory Client ${plantScope}`,
      owner: current.owner.trim() || ownerHint,
      notes: current.notes.trim() || preset.notes,
    }))
  }
  function applyPackDefaults(pack: YtfPlantAEntryPack) {
    const defaultSection = pack.id === 'plant-b-control' ? 'Floor B daily routine' : null
    setShiftForm((current) => ({ ...current, owner: pack.defaultOwner }))
    setQuickForm((current) => ({ ...current, owner: pack.defaultOwner, section: defaultSection ?? current.section }))
    setWhiteboardForm((current) => ({ ...current, owner: pack.defaultOwner, section: defaultSection ?? current.section }))
    setQualityForm((current) => ({ ...current, owner: pack.defaultOwner }))
    setMaintenanceForm((current) => ({ ...current, owner: pack.defaultOwner }))
    setReceivingForm((current) => ({ ...current, owner: pack.defaultOwner }))
    setMetricForm((current) => ({ ...current, owner: pack.defaultOwner }))
    setDocumentForm((current) => ({ ...current, owner: pack.defaultOwner }))
    setAuditForm((current) => ({ ...current, owner: pack.defaultOwner }))
    setTrainingForm((current) => ({ ...current, owner: pack.defaultOwner }))
  }

  function applyMetricDefinition(metric: EnterpriseMetricRecord) {
    const metricName = String(metric.metric_name || '').trim()
    if (!metricName) return
    setActiveMode('whiteboard_snapshot')
    setMetricForm((current) => ({
      ...current,
      metric_name: metricName,
      metric_group: String(metric.metric_group || current.metric_group || 'production').trim(),
      unit: metricDefinitionUnit(metric),
      period_label: current.period_label || metricPeriodLabel(),
      scope: String(metric.scope || current.scope || 'Factory Client Floor A').trim(),
      owner: String(metric.owner || current.owner || 'Plant review').trim(),
        notes: current.notes || String(metric.notes || 'Saved plant number definition for Factory Client.').trim(),
    }))
  }

  function selectEntryMode(nextMode: EntryMode) {
    const safeMode = isVisibleEntryMode(nextMode) ? nextMode : 'daily_routine'
    setActiveMode(safeMode)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('mode', safeMode)
    if (safeMode !== 'daily_routine' && safeMode !== 'normal_abnormal') {
      nextParams.delete('condition')
    }
    setSearchParams(nextParams, { replace: true })
  }

  function selectCaptureShortcut(shortcut: PhoneCaptureShortcut) {
    const safeMode = isVisibleEntryMode(shortcut.mode) ? shortcut.mode : 'daily_routine'
    setActiveMode(safeMode)
    if (shortcut.condition) {
      setQuickForm((current) => ({ ...current, condition: shortcut.condition || current.condition }))
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('mode', safeMode)
    if (shortcut.condition) {
      nextParams.set('condition', shortcut.condition)
    } else {
      nextParams.delete('condition')
    }
    setSearchParams(nextParams, { replace: true })
  }

  function captureShortcutIsActive(shortcut: PhoneCaptureShortcut) {
    if (shortcut.mode !== activeMode) return false
    if (!shortcut.condition) return true
    return quickForm.condition === shortcut.condition
  }

  useEffect(() => {
    if (!activePack) {
      if (appliedPackId !== null) {
        setAppliedPackId(null)
      }
      return
    }

    if (appliedPackId === activePack.id) {
      return
    }

    const requestedMode = searchParams.get('mode')
    const firstVisiblePackMode =
      (activePack.allowedModes.find((mode) => VISIBLE_ENTRY_MODE_IDS.includes(mode as EntryMode)) as EntryMode | undefined) ?? 'daily_routine'
    const nextMode =
      isVisibleEntryMode(requestedMode) && activePack.allowedModes.includes(requestedMode as typeof activePack.allowedModes[number])
        ? requestedMode
        : firstVisiblePackMode
    setActiveMode(nextMode)
    applyPackDefaults(activePack)
    setAppliedPackId(activePack.id)
    setError(null)
    setMessage(null)
    setPhotoMessage(null)
  }, [activePack, appliedPackId, searchParams])

  useEffect(() => {
    if (!session?.role || searchParams.get('pack') || !roleSuggestedPack) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('pack', roleSuggestedPack.id)
    setSearchParams(nextParams, { replace: true })
  }, [roleSuggestedPack, searchParams, session?.role, setSearchParams])

  useEffect(() => {
    if (!activePack) {
      return
    }
    if (!activePack.allowedModes.includes(activeMode as typeof activePack.allowedModes[number])) {
      const firstVisiblePackMode =
        (activePack.allowedModes.find((mode) => VISIBLE_ENTRY_MODE_IDS.includes(mode as EntryMode)) as EntryMode | undefined) ?? 'daily_routine'
      setActiveMode(firstVisiblePackMode)
    }
  }, [activeMode, activePack])

  useEffect(() => {
    const requestedMode = searchParams.get('mode')
    if (!isVisibleEntryMode(requestedMode)) {
      return
    }
    if (activePack && !activePack.allowedModes.includes(requestedMode as typeof activePack.allowedModes[number])) {
      return
    }
    setActiveMode(requestedMode)
  }, [activePack, searchParams])

  function updateCurrentEvidenceLink(nextLink: string) {
    setPhotoMessage(nextLink ? 'Photo attached to this entry.' : null)
    if (activeMode === 'quality_incident') {
      setQualityForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    if (activeMode === 'maintenance_issue') {
      setMaintenanceForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    if (activeMode === 'receiving_hold') {
      setReceivingForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    if (activeMode === 'whiteboard_snapshot') {
      setWhiteboardForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    if (activeMode === 'kpi_snapshot') {
      setMetricForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    if (activeMode === 'document_control') {
      setDocumentForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    if (activeMode === 'audit_review') {
      setAuditForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    if (activeMode === 'training_followup') {
      setTrainingForm((current) => ({ ...current, evidence_link: nextLink }))
      return
    }
    setShiftForm((current) => ({ ...current, evidence_link: nextLink }))
  }

  async function handleEvidencePhotoChange(file: File | null) {
    if (!file) {
      return
    }

    setPhotoBusy(true)
    setError(null)
    setPhotoMessage(null)
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Use a photo file for this evidence slot.')
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('Keep the photo under 8 MB before attaching it.')
      }
      const compressed = await compressEvidencePhoto(file)
      updateCurrentEvidenceLink(compressed)
      if (activeMode === 'whiteboard_snapshot') {
        setPhotoMessage('Board photo attached. Reading the board now.')
        void extractYtfAgenticWhiteboardPhoto({
          section: whiteboardForm.section.trim(),
          plant: plantScopeFromSection(whiteboardForm.section.trim()),
          shift: '',
          board_date: whiteboardForm.board_date.trim(),
          image_data_url: compressed,
          evidence_link: compressed,
          visible_numbers: '',
          owner: whiteboardForm.owner,
          manager_note: quickForm.note.trim(),
          who: structuredForm.who.trim(),
          what: structuredForm.what.trim(),
          where: structuredForm.where.trim(),
          when: structuredForm.when.trim(),
          why: structuredForm.why.trim(),
          how: structuredForm.how.trim(),
          condition: quickForm.condition.trim(),
          normal_detail: structuredForm.normal.trim(),
          abnormal_detail: structuredForm.abnormal.trim(),
          next_action: structuredForm.nextAction.trim(),
        })
          .then((result) => {
            const extractedText = whiteboardResultToText(result)
            if (!extractedText) {
              setPhotoMessage('Board photo attached. Save it and the system will finish reading it.')
              return
            }
            setWhiteboardForm((current) => ({
              ...current,
              evidence_link: compressed,
              shift: current.shift || result?.shift || '',
              visible_numbers: [current.visible_numbers.trim(), extractedText].filter(Boolean).join('\n'),
            }))
            const count = parseWhiteboardMetricCandidates(extractedText, whiteboardForm.section).length
            setPhotoMessage(count ? `Board photo read: ${count} values ready. Save to update plant data.` : 'Board photo read. Save to update plant data.')
          })
          .catch(() => {
            setPhotoMessage('Board photo attached. Save it and the system will finish reading it.')
          })
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The photo could not be attached.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function saveActiveEntry() {
    setSaving(true)
    setError(null)
    setMessage(null)
    setPhotoMessage(null)
    try {
      if (activeMode === 'shift_handoff') {
        if (!shiftForm.title.trim()) {
          throw new Error('Shift handoff title is required.')
        }
        const payload = await createWorkspaceTasks([
          {
            title: shiftForm.title.trim(),
            owner: shiftForm.owner.trim() || 'Plant review',
            priority: shiftForm.priority.trim() || 'high',
            due: shiftForm.due.trim() || defaultDueDate(),
            status: 'open',
            notes: [shiftForm.notes.trim(), shiftForm.evidence_link.trim() ? `Evidence: ${shiftForm.evidence_link.trim()}` : ''].filter(Boolean).join('\n'),
            template: 'manager_daily_entry',
          },
        ])
        setShiftForm(SHIFT_DEFAULTS)
        setMessage(`Saved shift handoff task${(payload.saved_count ?? 1) === 1 ? '' : 's'}.`)
      }

      if (activeMode === 'quality_incident') {
        if (!qualityForm.title.trim()) {
          throw new Error('Quality issue title is required.')
        }
        const payload = await workspaceFetch<EntrySavePayload>('/api/quality/incidents', {
          method: 'POST',
          body: JSON.stringify({
            title: qualityForm.title.trim(),
            summary: qualityForm.summary.trim(),
            supplier: qualityForm.supplier.trim() || 'Internal',
            severity: qualityForm.severity.trim() || 'medium',
            owner: qualityForm.owner.trim() || 'Quality team',
            target_close_date: qualityForm.target_close_date.trim(),
            evidence_link: qualityForm.evidence_link.trim(),
            source_type: 'simple_manager_entry',
            reported_at: new Date().toISOString(),
            status: 'open',
            create_action: true,
          }),
        })
        setQualityForm(QUALITY_DEFAULTS)
        setMessage(routedSaveMessage(payload, 'Quality issue saved.'))
      }

      if (activeMode === 'maintenance_issue') {
        if (!maintenanceForm.asset_name.trim()) {
          throw new Error('Asset name is required.')
        }
        const payload = await workspaceFetch<EntrySavePayload>('/api/maintenance/records', {
          method: 'POST',
          body: JSON.stringify({
            logged_at: new Date().toISOString(),
            asset_name: maintenanceForm.asset_name.trim(),
            issue_type: maintenanceForm.issue_type.trim() || 'breakdown',
            priority: maintenanceForm.priority.trim() || 'medium',
            owner: maintenanceForm.owner.trim() || 'Maintenance team',
            downtime_minutes: maintenanceForm.downtime_minutes.trim(),
            next_action: maintenanceForm.next_action.trim(),
            evidence_link: maintenanceForm.evidence_link.trim(),
            status: 'open',
            create_action: true,
          }),
        })
        setMaintenanceForm(MAINTENANCE_DEFAULTS)
        setMessage(routedSaveMessage(payload, 'Maintenance issue saved.'))
      }

      if (activeMode === 'receiving_hold') {
        if (!receivingForm.supplier.trim() || !receivingForm.material.trim()) {
          throw new Error('Supplier and material are required.')
        }
        const payload = await workspaceFetch<EntrySavePayload>('/api/receiving/records', {
          method: 'POST',
          body: JSON.stringify({
            received_at: new Date().toISOString(),
            supplier: receivingForm.supplier.trim(),
            material: receivingForm.material.trim(),
            po_or_pi: receivingForm.po_or_pi.trim(),
            grn_or_batch: receivingForm.grn_or_batch.trim(),
            expected_qty: receivingForm.expected_qty.trim(),
            received_qty: receivingForm.received_qty.trim(),
            status: receivingForm.status.trim() || 'review',
            owner: receivingForm.owner.trim() || 'Stores team',
            next_action: receivingForm.next_action.trim(),
            evidence_link: receivingForm.evidence_link.trim(),
            create_action: true,
          }),
        })
        setReceivingForm(RECEIVING_DEFAULTS)
        setMessage(routedSaveMessage(payload, 'Receiving issue saved.'))
      }

      if (activeMode === 'kpi_snapshot') {
        if (!metricForm.metric_name.trim() || !metricForm.metric_value.trim()) {
          throw new Error('Metric name and value are required.')
        }
        const payload = await workspaceFetch<{ message?: string }>('/api/metrics/records', {
          method: 'POST',
          body: JSON.stringify({
            captured_at: new Date().toISOString(),
            metric_name: metricForm.metric_name.trim(),
            metric_group: metricForm.metric_group.trim() || 'production',
            metric_value: metricForm.metric_value.trim(),
            unit: metricForm.unit.trim() || 'value',
            period_label: metricForm.period_label.trim(),
            scope: metricForm.scope.trim(),
            owner: metricForm.owner.trim() || 'Plant review',
            status: 'reported',
            notes: metricForm.notes.trim(),
            evidence_link: metricForm.evidence_link.trim(),
          }),
        })
        setMetricForm(METRIC_DEFAULTS)
        setMessage(payload.message ?? 'Metric saved.')
      }

      if (activeMode === 'document_control') {
        if (!documentForm.document_name.trim()) {
          throw new Error('Document name is required.')
        }
        const payload = await createWorkspaceTasks([
          {
            title: `Document control: ${documentForm.document_name.trim()}`,
            owner: documentForm.owner.trim() || 'Admin and planning team',
            priority: 'medium',
            due: documentForm.effective_date.trim() || defaultDueDate(),
            status: 'open',
            template: 'document_control_entry',
            notes: [
              `Document type: ${documentForm.document_type.trim() || 'SOP'}`,
              `Change type: ${documentForm.change_type.trim() || 'revision'}`,
              documentForm.summary.trim() ? `Summary: ${documentForm.summary.trim()}` : '',
              documentForm.evidence_link.trim() ? `Evidence: ${documentForm.evidence_link.trim()}` : '',
              'Owning desk: /app/documents',
              'Review loop: /app/plant-manager',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ])
        setDocumentForm(DOCUMENT_DEFAULTS)
        setMessage(`Saved document-control action${(payload.saved_count ?? 1) === 1 ? '' : 's'}.`)
      }

      if (activeMode === 'audit_review') {
        if (!auditForm.title.trim()) {
          throw new Error('Review finding title is required.')
        }
        const payload = await createWorkspaceTasks([
          {
            title: `Review finding: ${auditForm.title.trim()}`,
            owner: auditForm.owner.trim() || 'Plant review',
            priority: auditForm.priority.trim() || 'high',
            due: auditForm.due.trim() || defaultDueDate(),
            status: 'open',
            template: 'audit_review_entry',
            notes: [
              `Review type: ${auditForm.review_type.trim() || 'audit'}`,
              auditForm.area.trim() ? `Area: ${auditForm.area.trim()}` : '',
              auditForm.summary.trim() ? `Summary: ${auditForm.summary.trim()}` : '',
              auditForm.evidence_link.trim() ? `Evidence: ${auditForm.evidence_link.trim()}` : '',
              'Owning desk: /app/plant-manager',
              'Review loop: /app/live-data',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ])
        setAuditForm(AUDIT_DEFAULTS)
        setMessage(`Saved audit action${(payload.saved_count ?? 1) === 1 ? '' : 's'}.`)
      }

      if (activeMode === 'training_followup') {
        if (!trainingForm.topic.trim()) {
          throw new Error('Training topic is required.')
        }
        const payload = await createWorkspaceTasks([
          {
            title: `Training follow-up: ${trainingForm.topic.trim()}`,
            owner: trainingForm.owner.trim() || 'Operations team',
            priority: 'medium',
            due: trainingForm.due.trim() || defaultDueDate(),
            status: 'open',
            template: 'training_followup_entry',
            notes: [
              trainingForm.audience.trim() ? `Audience: ${trainingForm.audience.trim()}` : '',
              trainingForm.summary.trim() ? `Gap: ${trainingForm.summary.trim()}` : '',
              trainingForm.verification.trim() ? `Verification: ${trainingForm.verification.trim()}` : '',
              trainingForm.evidence_link.trim() ? `Evidence: ${trainingForm.evidence_link.trim()}` : '',
              'Owning desk: /app/adoption-command',
              'Review loop: /app/plant-manager',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ])
        setTrainingForm(TRAINING_DEFAULTS)
        setMessage(`Saved training action${(payload.saved_count ?? 1) === 1 ? '' : 's'}.`)
      }

      await loadDesk()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Daily entry could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function saveDailyKpiValues() {
    const rows: MetricRecordPayload[] = []
    quickKpiDefinitions.forEach((metric) => {
      const value = dailyKpiValues[metricDefinitionKey(metric)]?.trim()
      const metricName = String(metric.metric_name || '').trim()
      if (!value || !metricName) return
      rows.push({
        captured_at: new Date().toISOString(),
        metric_name: metricName,
        metric_group: String(metric.metric_group || 'production').trim(),
        metric_value: value,
        unit: metricDefinitionUnit(metric),
        period_label: metricPeriodLabel(),
        scope: String(metric.scope || 'Factory Client Floor A').trim(),
        owner: String(metric.owner || 'Plant review').trim(),
        status: 'reported',
        notes: [
        'Daily plant number entered from saved YTF definition.',
          metric.notes ? `Definition note: ${metric.notes}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        evidence_link: metricForm.evidence_link.trim(),
      })
    })

    if (!rows.length) {
      setError('Enter at least one plant value before saving.')
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = await saveMetricRecordsBulk(rows)
      setDailyKpiValues({})
      setMessage(payload.message ?? `Saved ${payload.saved_count ?? rows.length} plant value${rows.length === 1 ? '' : 's'}.`)
      await loadDesk()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'KPI values could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickEntry() {
    const structuredNote = structuredNoteForMode(activeMode, structuredForm, quickForm.condition)
    const rawNote = [structuredNote, quickForm.note.trim()].filter(Boolean).join('\n')
    const isWhiteboard = activeMode === 'whiteboard_snapshot'
    const whiteboardNumbers = whiteboardForm.visible_numbers.trim()
    const evidenceLink = currentEvidenceLink.trim()
    const section = (isWhiteboard ? whiteboardForm.section : quickForm.section).trim()
    const note = isWhiteboard
      ? [
          'Board photo uploaded for board reading.',
          section ? `Section: ${section}` : '',
          activeSectionBlueprint.expected.length ? `Expected fields: ${activeSectionBlueprint.expected.join(', ')}` : '',
          whiteboardNumbers ? `Board text: ${whiteboardNumbers}` : '',
          rawNote ? `Manager note: ${rawNote}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : rawNote
    const condition = quickForm.condition.trim() || 'normal'
    const plantScope = plantScopeFromSection(section)
    const owner = ownerTeamForSection(section, activeMode) || activePack?.defaultOwner || 'Plant review'
    const submittedAt = new Date().toISOString()
    const boardDate = whiteboardForm.board_date.trim() || submittedAt.slice(0, 10)

    if (isWhiteboard && !whiteboardForm.section.trim()) {
      setError('Choose the section before saving the board photo.')
      return
    }
    if (isWhiteboard && !evidenceLink) {
      setError('Attach one clear board photo. The system will read the numbers.')
      return
    }
    if (!isWhiteboard && !note) {
      setError('Write the short update before saving.')
      return
    }

    const isActionCondition = condition === 'abnormal' || condition === 'follow-up'
    const taskStatus = isWhiteboard || !isActionCondition ? 'done' : 'open'
    const taskPriority = isWhiteboard ? 'medium' : isActionCondition ? 'high' : quickForm.priority.trim() || 'medium'
    const taskDue = isActionCondition ? quickForm.due.trim() || 'Today' : 'Daily close'
    const boardTime = submittedAt.slice(11, 16)
    const taskRecord = {
      title: isWhiteboard ? `Board photo: ${whiteboardForm.section.trim()} / ${boardDate} ${boardTime}` : quickTitleFromNote(note, activeCard.label),
      owner,
      priority: taskPriority,
      due: taskDue,
      status: taskStatus,
      template: modeTaskTemplate(activeMode),
      lead_id: isWhiteboard ? `whiteboard:${plantScope}:${whiteboardForm.section.trim()}:${boardDate}:${submittedAt}` : undefined,
      notes: [
        `Entry type: ${activeCard.label}`,
        `Factory record: ${activeCard.recordType}`,
        `Plant: ${plantScope}`,
        `Section focus: ${activeSectionBlueprint.focus}`,
        !isWhiteboard && section ? `Section: ${section}` : '',
        !isWhiteboard ? `Condition: ${condition}` : '',
        isWhiteboard ? `Section: ${whiteboardForm.section.trim()}` : '',
        isWhiteboard ? `Board date: ${boardDate}` : '',
        isWhiteboard ? `Captured at: ${submittedAt}` : '',
        isWhiteboard && whiteboardMetricCandidates.length ? `Board values captured: ${whiteboardMetricCandidates.length}` : '',
        note,
        evidenceLabelForNotes(evidenceLink),
        isWhiteboard
          ? 'Record state: board photo saved to Data. Board reading continues behind the scenes.'
          : isActionCondition
            ? 'Next step: Team keeps working from this record until finished.'
            : 'Record state: normal or checked entry saved to history. No action opened.',
      ]
        .filter(Boolean)
        .join('\n'),
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    setPhotoMessage(null)
    try {
      const shouldWriteWcm = !isWhiteboard && modeWritesWcmRecord(activeMode, condition) && rawNote.trim().length > 0
      const payload = await createWorkspaceTasks([taskRecord])
      setQuickForm((current) => ({ ...QUICK_ENTRY_DEFAULTS, owner: current.owner }))
      setStructuredForm(STRUCTURED_ENTRY_DEFAULTS)
      if (isWhiteboard) {
        setWhiteboardForm((current) => ({ ...WHITEBOARD_DEFAULTS, owner: current.owner, section: current.section }))
      }
      updateCurrentEvidenceLink('')
      if (isWhiteboard) {
        setMessage('Saved board photo. Board reading started.')
        setPhotoMessage('The system will extract output, rejects, downtime, WIP, and other visible board numbers automatically.')
        void Promise.all([
          extractYtfWhiteboardPhoto({
            section: whiteboardForm.section.trim(),
            plant: plantScope,
            shift: '',
            board_date: whiteboardForm.board_date.trim(),
            image_data_url: evidenceLink.startsWith('data:image/') ? evidenceLink : '',
            evidence_link: evidenceLink,
            visible_numbers: whiteboardNumbers,
            owner,
            manager_note: rawNote,
            who: structuredForm.who.trim(),
            what: structuredForm.what.trim(),
            where: structuredForm.where.trim(),
            when: structuredForm.when.trim(),
            why: structuredForm.why.trim(),
            how: structuredForm.how.trim(),
            condition: quickForm.condition.trim(),
            normal_detail: structuredForm.normal.trim(),
            abnormal_detail: structuredForm.abnormal.trim(),
            next_action: structuredForm.nextAction.trim(),
          }),
          extractYtfAgenticWhiteboardPhoto({
            section: whiteboardForm.section.trim(),
            plant: plantScope,
            shift: '',
            board_date: whiteboardForm.board_date.trim(),
            image_data_url: evidenceLink.startsWith('data:image/') ? evidenceLink : '',
            evidence_link: evidenceLink,
            visible_numbers: whiteboardNumbers,
            owner,
            manager_note: rawNote,
            who: structuredForm.who.trim(),
            what: structuredForm.what.trim(),
            where: structuredForm.where.trim(),
            when: structuredForm.when.trim(),
            why: structuredForm.why.trim(),
            how: structuredForm.how.trim(),
            condition: quickForm.condition.trim(),
            normal_detail: structuredForm.normal.trim(),
            abnormal_detail: structuredForm.abnormal.trim(),
            next_action: structuredForm.nextAction.trim(),
          }).catch(() => null),
        ])
          .then(([extractionPayload, agenticExtraction]) => {
            const extractedMetricCount = agenticExtraction?.metrics?.length ?? 0
            const autoRead = extractedMetricCount
              ? ` and read ${extractedMetricCount} board values${agenticExtraction?.asset_name ? ` for ${agenticExtraction.asset_name}` : ''}`
              : agenticExtraction?.reported_units
                ? ` and read ${agenticExtraction.reported_units} units${agenticExtraction.asset_name ? ` for ${agenticExtraction.asset_name}` : ''}`
                : ''
            setMessage(
              extractionPayload?.message ??
                `Saved board photo${autoRead}.`,
            )
            void loadDesk()
          })
          .catch(() => {
            setPhotoMessage('Saved. Board reading did not finish in this browser session; the record remains on the board for retry.')
          })
        await loadDesk()
        return
      }
      const wcmRecord = shouldWriteWcm
        ? await saveYtfWcmIncident({
            text: note,
            org_id: orgIdForPlantScope(plantScope),
          }).catch(() => null)
        : null
      setMessage(
        isActionCondition
            ? `Saved entry${(payload.saved_count ?? 1) === 1 ? '' : 's'} and opened team work.`
            : shouldWriteWcm
              ? `Saved entry${wcmRecord?.inserted ? ' and factory record' : ''}.`
              : 'Saved entry to history.',
      )
      await loadDesk()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Daily entry could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="sm-calm-surface p-5 lg:p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Daily entry</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--sm-ink)]">Opening daily entry.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
          Loading recent rows. Entry is the main manager workflow: one short record and one next step.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="sm-button-secondary" to="/app/action-board">
            Action Board
          </Link>
        </div>
      </section>
    )
  }

  if (!session) {
    return (
      <section className="sm-surface p-6">
        <p className="text-sm text-[var(--sm-muted)]">Login is required to use daily entry.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/login?next=/app/daily-entry">
            Login
          </Link>
          <Link className="sm-button-secondary" to="/app/portal">
            Open portal
          </Link>
        </div>
      </section>
    )
  }

  if (!canOpenDailyEntry(session)) {
    return (
      <section className="sm-surface p-6">
        <p className="text-sm text-[var(--sm-muted)]">
          This page is for plant, quality, maintenance, receiving, director, and tenant control roles. Current role: {capabilityProfile.label}.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/portal">
            Open portal
          </Link>
          <Link className="sm-button-secondary" to="/app/start">
            Open launchpad
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="sm-ytf-simple-page sm-daily-entry-page pb-12">
      <section className="sm-entry-hero sm-calm-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="sm-kicker text-[var(--sm-accent)]">Daily entry</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--sm-ink)] sm:text-5xl">New entry</h1>
            <p className="mt-3 text-base leading-relaxed text-[var(--sm-muted)]">Write it once. Add photo if needed. Save.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="sm-status-pill">{capabilityProfile.label}</span>
            <span className="sm-status-pill sm-hidden-phone">{updatedAt ? `Updated ${formatDateTime(updatedAt)}` : 'No entry saved yet'}</span>
            {activePack ? <span className="sm-status-pill sm-hidden-phone">{activePack.label}</span> : null}
            <Link className="sm-button-secondary" to="/app/action-board">
              Work
            </Link>
          </div>
        </div>
      </section>

      {error ? <section className="sm-calm-surface p-4 text-sm font-semibold text-[#9f1239]">{error}</section> : null}
      {message ? <section className="sm-calm-surface p-4 text-sm font-semibold text-[var(--sm-accent)]">{message}</section> : null}
      {photoMessage ? <section className="sm-calm-surface p-4 text-sm font-semibold text-[var(--sm-accent)]">{photoMessage}</section> : null}

      {showQuickKpiPanel ? (
        <section className="sm-calm-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today&apos;s plant values</p>
              <h2 className="mt-1 text-2xl font-black text-[var(--sm-ink)]">Enter numbers from the floor.</h2>
            </div>
            <div className="flex flex-wrap gap-2">
                <span className="sm-status-pill">{officialKpis.length} saved numbers</span>
              <Link className="sm-button-secondary" to="/app/data-quality">
                Data
              </Link>
            </div>
          </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {quickKpiDefinitions.map((metric) => {
                const key = metricDefinitionKey(metric)
                const unit = metricDefinitionUnit(metric)
                return (
                  <label className="rounded-3xl border border-[var(--sm-border)] bg-white/60 p-3 shadow-sm" key={key}>
                    <span className="block text-xs font-black uppercase tracking-[0.18em] text-[var(--sm-accent)]">{metric.metric_group || 'Metric'}</span>
                    <span className="mt-1 block text-sm font-bold text-[var(--sm-ink)]">{metric.metric_name || 'Plant value'}</span>
                    <div className="mt-3 flex gap-2">
                      <input
                        className="sm-input min-w-0"
                        inputMode="decimal"
                        placeholder={unit}
                        value={dailyKpiValues[key] ?? ''}
                        onChange={(event) => setDailyKpiValues((current) => ({ ...current, [key]: event.target.value }))}
                      />
                      <button className="sm-button-secondary px-3" onClick={() => applyMetricDefinition(metric)} type="button">
                        Edit
                      </button>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="sm-button-primary" disabled={saving || dailyKpiReadyCount === 0} onClick={() => void saveDailyKpiValues()} type="button">
                {saving ? 'Saving...' : `Save ${dailyKpiReadyCount || ''} value${dailyKpiReadyCount === 1 ? '' : 's'}`.trim()}
              </button>
              <p className="text-sm text-[var(--sm-muted)]">These save into the dashboard for trends and plant review.</p>
            </div>
        </section>
      ) : null}

      <section className="grid gap-4">
        <article className="sm-calm-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Entry</p>
              <h2 className="mt-2 text-2xl font-bold text-[var(--sm-ink)] sm:text-4xl">{t('New entry', 'မှတ်တမ်းအသစ်')}</h2>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-muted)]">Choose type. Fill short fields. Save.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sm-status-pill">{activeCard.label}</span>
              <span className="sm-status-pill sm-hidden-phone">{quickModeQuestion(activeMode)}</span>
            </div>
          </div>
          <div className="sm-phone-capture-strip mt-5" aria-label="Phone capture shortcuts">
            {PHONE_CAPTURE_SHORTCUTS.map((shortcut) => {
              const isAllowed = !activePack || activePack.allowedModes.includes(shortcut.mode as typeof activePack.allowedModes[number])
              return (
                <button
                  className={`sm-phone-capture-card ${captureShortcutIsActive(shortcut) ? 'is-active' : ''}`.trim()}
                  disabled={!isAllowed}
                  key={`${shortcut.mode}-${shortcut.condition || 'default'}`}
                  onClick={() => selectCaptureShortcut(shortcut)}
                  type="button"
                >
                  <span>{shortcut.badge}</span>
                  <strong>{shortcut.label}</strong>
                    <small>{isAllowed ? shortcut.detail : 'Not available for your role.'}</small>
                </button>
              )
            })}
          </div>
          <div className="sm-evidence-strip mt-6">
            <div className="sm-upload-card">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">{isWhiteboardMode ? t('Board photo', 'ဘုတ်ဓာတ်ပုံ') : t('Photo', 'ဓာတ်ပုံ')}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{evidenceHelp}</p>
              </div>
              <label className="sm-button-secondary cursor-pointer">
                {photoBusy ? t('Attaching...', 'တင်နေသည်...') : isWhiteboardMode ? t('Attach board photo', 'ဘုတ်ဓာတ်ပုံထည့်') : t('Attach photo', 'ဓာတ်ပုံထည့်')}
                <input
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null
                    void handleEvidencePhotoChange(nextFile)
                    event.currentTarget.value = ''
                  }}
                  type="file"
                />
              </label>
            </div>
            {evidencePreviewIsImage ? (
              <div className="sm-photo-preview">
                <img alt="Attached evidence preview" src={currentEvidenceLink} />
              </div>
            ) : currentEvidenceLink ? (
              <div className="sm-chip text-[var(--sm-ink)]">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Evidence attached</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Evidence saved with this record.</p>
              </div>
            ) : null}
          </div>

          <div className="sm-chip mt-4 text-[var(--sm-ink)]">
            <p className="sm-kicker text-[var(--sm-accent)]">{activeSectionBlueprint.plant} / {activeSectionBlueprint.owner}</p>
            <h3 className="mt-1 text-lg font-black text-[var(--sm-ink)]">{activeSectionBlueprint.section}</h3>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">{activeSectionBlueprint.focus}</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {isWhiteboardMode ? (
              <>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">{t('Section', 'အပိုင်း')}</span>
                  <select
                    className="sm-input"
                    value={whiteboardForm.section}
                    onChange={(event) => {
                      const nextSection = event.target.value
                      const blueprint = getSectionBlueprint(nextSection, activeMode)
                      setWhiteboardForm((current) => ({
                        ...current,
                        section: nextSection,
                        owner: blueprint.owner,
                      }))
                    }}
                  >
                    {WHITEBOARD_SECTION_OPTIONS.map((section) => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">{t('Board date', 'ဘုတ်ရက်စွဲ')}</span>
                  <input className="sm-input" type="date" value={whiteboardForm.board_date} onChange={(event) => setWhiteboardForm((current) => ({ ...current, board_date: event.target.value }))} />
                </label>
                <label className="hidden">
                  <span className="text-sm text-[var(--sm-muted)]">{t('Shift', 'ရှစ်')}</span>
                </label>
                <label className="hidden">
                  <span className="text-sm text-[var(--sm-muted)]">{t('Owner lane', 'စစ်မည့်အဖွဲ့')}</span>
                  <input className="sm-input" value={whiteboardForm.owner} onChange={(event) => setWhiteboardForm((current) => ({ ...current, owner: event.target.value }))} />
                </label>
                <div className="sm-whiteboard-candidates md:col-span-2">
                  {currentEvidenceLink ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="sm-kicker text-[var(--sm-accent)]">Board reading</p>
                        <h3 className="text-lg font-black text-[var(--sm-ink)]">Board photo ready.</h3>
                        <p className="mt-2 text-sm font-semibold text-[var(--sm-muted)]">
                          Save now. The system reads the photo and sends clean values to the dashboard.
                        </p>
                      </div>
                      <span className="sm-chip text-xs font-black uppercase tracking-[0.18em] text-[var(--sm-accent)]">
                        {activeSectionBlueprint.expected.slice(0, 3).join(' / ')}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="sm-kicker text-[var(--sm-accent)]">Board photo</p>
                        <h3 className="text-lg font-black text-[var(--sm-ink)]">Upload one clear board image.</h3>
                        <p className="mt-2 text-sm font-semibold text-[var(--sm-muted)]">
                          Do not type numbers. Save the board photo and the system updates dashboard values.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
            {!isWhiteboardMode ? (
              <>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Section</span>
              <select
                className="sm-input"
                value={quickForm.section}
                onChange={(event) => {
                  const nextSection = event.target.value
                  const blueprint = getSectionBlueprint(nextSection, activeMode)
                  setQuickForm((current) => ({ ...current, section: nextSection, owner: blueprint.owner }))
                }}
              >
                {WHITEBOARD_SECTION_OPTIONS.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>
            <label className={usesStructuredEntry(activeMode) ? 'hidden' : 'space-y-2'}>
              <span className="text-sm text-[var(--sm-muted)]">Condition</span>
              <select className="sm-input" value={quickForm.condition} onChange={(event) => setQuickForm((current) => ({ ...current, condition: event.target.value }))}>
                <option value="normal">Normal</option>
                <option value="abnormal">Abnormal</option>
                <option value="follow-up">Follow-up</option>
                <option value="done">Done / checked</option>
              </select>
            </label>

            {activeMode === 'daily_routine' ? (
              <div className="sm-structured-entry-card md:col-span-2">
                <div className="sm-structured-entry-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Daily routine</p>
                    <h3>5W1H check</h3>
                  </div>
                  <select className="sm-input sm-structured-condition" value={quickForm.condition} onChange={(event) => setQuickForm((current) => ({ ...current, condition: event.target.value }))}>
                    <option value="normal">Normal</option>
                    <option value="abnormal">Abnormal</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div className="sm-structured-entry-grid">
                  {[
                    ['who', 'Who', 'Shift / person'],
                    ['what', 'What', 'Output or issue'],
                    ['where', 'Where', 'Machine / area'],
                    ['when', 'When', 'Shift / time'],
                    ['why', 'Why', 'Cause'],
                    ['how', 'How much', 'Qty / downtime'],
                  ].map(([key, label, placeholder]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        className="sm-input"
                        placeholder={placeholder}
                        value={structuredForm[key as keyof StructuredEntryForm]}
                        onChange={(event) => setStructuredForm((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {activeMode === 'normal_abnormal' ? (
              <div className="sm-structured-entry-card md:col-span-2">
                <div className="sm-structured-entry-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Condition record</p>
                    <h3>Normal / abnormal</h3>
                  </div>
                  <select className="sm-input sm-structured-condition" value={quickForm.condition} onChange={(event) => setQuickForm((current) => ({ ...current, condition: event.target.value }))}>
                    <option value="normal">Normal</option>
                    <option value="abnormal">Abnormal</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div className="sm-structured-entry-grid is-three">
                  <label>
                    <span>Normal condition</span>
                    <textarea className="sm-input" placeholder="What is OK?" value={structuredForm.normal} onChange={(event) => setStructuredForm((current) => ({ ...current, normal: event.target.value }))} />
                  </label>
                  <label>
                    <span>Abnormal condition</span>
                    <textarea className="sm-input" placeholder="What is not OK?" value={structuredForm.abnormal} onChange={(event) => setStructuredForm((current) => ({ ...current, abnormal: event.target.value }))} />
                  </label>
                  <label>
                    <span>Next action</span>
                    <textarea className="sm-input" placeholder="Who will fix/check?" value={structuredForm.nextAction} onChange={(event) => setStructuredForm((current) => ({ ...current, nextAction: event.target.value }))} />
                  </label>
                </div>
              </div>
            ) : null}

            {activeMode === 'five_s_check' ? (
              <div className="sm-structured-entry-card md:col-span-2">
                <div className="sm-structured-entry-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">5S</p>
                    <h3>Workplace check</h3>
                  </div>
                  <span>section check</span>
                </div>
                <div className="sm-structured-entry-grid is-five">
                  {[
                    ['sort', 'Sort', 'Unneeded items removed?'],
                    ['setOrder', 'Set', 'Tools/materials in place?'],
                    ['shine', 'Shine', 'Area clean?'],
                    ['standardize', 'Standard', 'Checklist followed?'],
                    ['sustain', 'Sustain', 'Follow-up owner?'],
                  ].map(([key, label, placeholder]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        className="sm-input"
                        placeholder={placeholder}
                        value={structuredForm[key as keyof StructuredEntryForm]}
                        onChange={(event) => setStructuredForm((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {!usesStructuredEntry(activeMode) ? (
              <label className="space-y-2 md:col-span-2">
                <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--sm-muted)]">
                  <span>{quickModeQuestion(activeMode)}</span>
                  <button className="sm-tiny-action" onClick={startVoiceNote} type="button">
                    {voiceListening ? 'Listening...' : 'Voice'}
                  </button>
                </span>
                <textarea
                  className="sm-input min-h-[132px]"
                  placeholder={activeSectionBlueprint.placeholder || quickModePlaceholder(activeMode)}
                  value={quickForm.note}
                  onChange={(event) => setQuickForm((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
            ) : null}
            <label className="hidden">
              <span className="text-sm text-[var(--sm-muted)]">Team</span>
              <select
                className="sm-input"
                value={isWhiteboardMode ? whiteboardForm.owner : quickForm.owner}
                onChange={(event) => {
                  const nextOwner = event.target.value
                  setQuickForm((current) => ({ ...current, owner: nextOwner }))
                  if (isWhiteboardMode) setWhiteboardForm((current) => ({ ...current, owner: nextOwner }))
                }}
              >
                {OWNER_TEAM_OPTIONS.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </label>
            <label className="hidden">
              <span className="text-sm text-[var(--sm-muted)]">Priority</span>
              <select className="sm-input" value={quickForm.priority} onChange={(event) => setQuickForm((current) => ({ ...current, priority: event.target.value }))}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="hidden">
              <span className="text-sm text-[var(--sm-muted)]">Due</span>
              <input className="sm-input" type="date" value={quickForm.due} onChange={(event) => setQuickForm((current) => ({ ...current, due: event.target.value }))} />
            </label>
              </>
            ) : null}
          </div>

          <div className="sm-entry-actions mt-6 flex flex-wrap gap-3">
            <button aria-label={saveButtonLabel(activeMode)} className="sm-button-primary" disabled={saving} onClick={() => void saveQuickEntry()} type="button">
              {saving ? t('Saving...', 'သိမ်းနေသည်...') : isWhiteboardMode ? t('Save board photo', 'ဘုတ်ဓာတ်ပုံ သိမ်း') : t('Save entry', 'မှတ်တမ်းသိမ်း')}
            </button>
            <Link className="sm-button-secondary" to="/app/action-board">
              {t('Action board', 'လုပ်ဆောင်ရန်')}
            </Link>
          </div>

          {showAdvancedEntryPanel ? (
            <details className="sm-details mt-4 p-0" open={SECONDARY_MODE_IDS.includes(activeMode)}>
              <summary>More entry formats</summary>
              <div className="sm-details-content pt-3">
              {secondaryModeCards.length ? (
                <div className="sm-mode-grid">
                  {secondaryModeCards.map((card) => (
                    <button
                      className={`sm-mode-card ${card.id === activeMode ? 'is-active' : ''}`.trim()}
                      key={card.id}
                      onClick={() => selectEntryMode(card.id)}
                      type="button"
                    >
                      <span>{card.label}</span>
                      <small>{card.recordType}</small>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4">
          {activeMode === 'shift_handoff' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">What needs handoff?</span>
                <input className="sm-input" value={shiftForm.title} onChange={(event) => setShiftForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={shiftForm.owner} onChange={(event) => setShiftForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Priority</span>
                <select className="sm-input" value={shiftForm.priority} onChange={(event) => setShiftForm((current) => ({ ...current, priority: event.target.value }))}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Due</span>
                <input className="sm-input" type="date" value={shiftForm.due} onChange={(event) => setShiftForm((current) => ({ ...current, due: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">What changed?</span>
                <textarea className="sm-input min-h-[128px]" value={shiftForm.notes} onChange={(event) => setShiftForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={shiftForm.evidence_link} onChange={(event) => setShiftForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {activeMode === 'quality_incident' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Issue title</span>
                <input className="sm-input" value={qualityForm.title} onChange={(event) => setQualityForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Supplier or source</span>
                <input className="sm-input" value={qualityForm.supplier} onChange={(event) => setQualityForm((current) => ({ ...current, supplier: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Severity</span>
                <select className="sm-input" value={qualityForm.severity} onChange={(event) => setQualityForm((current) => ({ ...current, severity: event.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={qualityForm.owner} onChange={(event) => setQualityForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Target close</span>
                <input className="sm-input" type="date" value={qualityForm.target_close_date} onChange={(event) => setQualityForm((current) => ({ ...current, target_close_date: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">What happened?</span>
                <textarea className="sm-input min-h-[128px]" value={qualityForm.summary} onChange={(event) => setQualityForm((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={qualityForm.evidence_link} onChange={(event) => setQualityForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {activeMode === 'maintenance_issue' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Asset</span>
                <input className="sm-input" value={maintenanceForm.asset_name} onChange={(event) => setMaintenanceForm((current) => ({ ...current, asset_name: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Issue type</span>
                <select className="sm-input" value={maintenanceForm.issue_type} onChange={(event) => setMaintenanceForm((current) => ({ ...current, issue_type: event.target.value }))}>
                  <option value="breakdown">Breakdown</option>
                  <option value="pm">PM</option>
                  <option value="inspection">Inspection</option>
                  <option value="parts_hold">Parts hold</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Priority</span>
                <select className="sm-input" value={maintenanceForm.priority} onChange={(event) => setMaintenanceForm((current) => ({ ...current, priority: event.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={maintenanceForm.owner} onChange={(event) => setMaintenanceForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Downtime minutes</span>
                <input className="sm-input" value={maintenanceForm.downtime_minutes} onChange={(event) => setMaintenanceForm((current) => ({ ...current, downtime_minutes: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Next action</span>
                <textarea className="sm-input min-h-[128px]" value={maintenanceForm.next_action} onChange={(event) => setMaintenanceForm((current) => ({ ...current, next_action: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={maintenanceForm.evidence_link} onChange={(event) => setMaintenanceForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {activeMode === 'receiving_hold' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Supplier</span>
                <input className="sm-input" value={receivingForm.supplier} onChange={(event) => setReceivingForm((current) => ({ ...current, supplier: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Material</span>
                <input className="sm-input" value={receivingForm.material} onChange={(event) => setReceivingForm((current) => ({ ...current, material: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">PI / PO</span>
                <input className="sm-input" value={receivingForm.po_or_pi} onChange={(event) => setReceivingForm((current) => ({ ...current, po_or_pi: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">GRN / batch</span>
                <input className="sm-input" value={receivingForm.grn_or_batch} onChange={(event) => setReceivingForm((current) => ({ ...current, grn_or_batch: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Expected qty</span>
                <input className="sm-input" value={receivingForm.expected_qty} onChange={(event) => setReceivingForm((current) => ({ ...current, expected_qty: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Received qty</span>
                <input className="sm-input" value={receivingForm.received_qty} onChange={(event) => setReceivingForm((current) => ({ ...current, received_qty: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Status</span>
                <select className="sm-input" value={receivingForm.status} onChange={(event) => setReceivingForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="review">Review</option>
                  <option value="hold">Hold</option>
                  <option value="blocked">Blocked</option>
                  <option value="released">Released</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={receivingForm.owner} onChange={(event) => setReceivingForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Next action</span>
                <textarea className="sm-input min-h-[128px]" value={receivingForm.next_action} onChange={(event) => setReceivingForm((current) => ({ ...current, next_action: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={receivingForm.evidence_link} onChange={(event) => setReceivingForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {activeMode === 'kpi_snapshot' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {officialKpis.length ? (
                <label className="space-y-2 md:col-span-2">
                    <span className="text-sm text-[var(--sm-muted)]">Use saved number definition</span>
                  <select
                    className="sm-input"
                    value=""
                    onChange={(event) => {
                      const next = officialKpis.find((metric) => metricDefinitionKey(metric) === event.target.value)
                      if (next) applyMetricDefinition(next)
                    }}
                  >
                    <option value="">Choose saved number...</option>
                    {officialKpis.map((metric) => (
                      <option key={metricDefinitionKey(metric)} value={metricDefinitionKey(metric)}>
                        {metric.metric_name} / {metric.metric_group || 'metric'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Quick metric type</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {METRIC_PRESETS.map((preset) => (
                    <button
                      className={`sm-button-secondary px-3 ${metricPresetId === preset.id ? 'is-active' : ''}`.trim()}
                      key={preset.id}
                      onClick={() => applyMetricPreset(preset.id)}
                      type="button"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {metricSectionHint ? (
                  <p className="mt-2 text-xs text-[var(--sm-muted)]">Section hint: {metricSectionHint}</p>
                ) : null}
              </div>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Metric name</span>
                <input className="sm-input" value={metricForm.metric_name} onChange={(event) => setMetricForm((current) => ({ ...current, metric_name: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Group</span>
                <select className="sm-input" value={metricForm.metric_group} onChange={(event) => setMetricForm((current) => ({ ...current, metric_group: event.target.value }))}>
                  <option value="production">Production</option>
                  <option value="quality">Quality</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="commercial">Commercial</option>
                  <option value="finance">Finance</option>
                  <option value="general">General</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Value</span>
                <input className="sm-input" value={metricForm.metric_value} onChange={(event) => setMetricForm((current) => ({ ...current, metric_value: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Unit</span>
                <input className="sm-input" value={metricForm.unit} onChange={(event) => setMetricForm((current) => ({ ...current, unit: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Period label</span>
                <input className="sm-input" value={metricForm.period_label} onChange={(event) => setMetricForm((current) => ({ ...current, period_label: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Scope</span>
                <input className="sm-input" value={metricForm.scope} onChange={(event) => setMetricForm((current) => ({ ...current, scope: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={metricForm.owner} onChange={(event) => setMetricForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Notes</span>
                <textarea className="sm-input min-h-[128px]" value={metricForm.notes} onChange={(event) => setMetricForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={metricForm.evidence_link} onChange={(event) => setMetricForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {activeMode === 'document_control' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Document name</span>
                <input className="sm-input" value={documentForm.document_name} onChange={(event) => setDocumentForm((current) => ({ ...current, document_name: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Document type</span>
                <select className="sm-input" value={documentForm.document_type} onChange={(event) => setDocumentForm((current) => ({ ...current, document_type: event.target.value }))}>
                  <option value="SOP">SOP</option>
                  <option value="Work instruction">Work instruction</option>
                  <option value="Form">Form</option>
                  <option value="Record template">Record template</option>
                  <option value="COA / specification">COA / specification</option>
                  <option value="Government / company">Government / company</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Change type</span>
                <select className="sm-input" value={documentForm.change_type} onChange={(event) => setDocumentForm((current) => ({ ...current, change_type: event.target.value }))}>
                  <option value="revision">Revision</option>
                  <option value="new">New</option>
                  <option value="missing">Missing evidence</option>
                  <option value="withdraw">Withdraw</option>
                  <option value="evidence pack">Evidence pack</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={documentForm.owner} onChange={(event) => setDocumentForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Effective or review date</span>
                <input className="sm-input" type="date" value={documentForm.effective_date} onChange={(event) => setDocumentForm((current) => ({ ...current, effective_date: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">What changed?</span>
                <textarea className="sm-input min-h-[128px]" value={documentForm.summary} onChange={(event) => setDocumentForm((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={documentForm.evidence_link} onChange={(event) => setDocumentForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {activeMode === 'audit_review' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Finding or review title</span>
                <input className="sm-input" value={auditForm.title} onChange={(event) => setAuditForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Review type</span>
                <select className="sm-input" value={auditForm.review_type} onChange={(event) => setAuditForm((current) => ({ ...current, review_type: event.target.value }))}>
                  <option value="audit">Audit</option>
                  <option value="management review">Management review</option>
                  <option value="gemba">Gemba</option>
                  <option value="internal check">Internal check</option>
                  <option value="customer follow-up">Customer follow-up</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Area or process</span>
                <input className="sm-input" value={auditForm.area} onChange={(event) => setAuditForm((current) => ({ ...current, area: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={auditForm.owner} onChange={(event) => setAuditForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Due</span>
                <input className="sm-input" type="date" value={auditForm.due} onChange={(event) => setAuditForm((current) => ({ ...current, due: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Priority</span>
                <select className="sm-input" value={auditForm.priority} onChange={(event) => setAuditForm((current) => ({ ...current, priority: event.target.value }))}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">What was found?</span>
                <textarea className="sm-input min-h-[128px]" value={auditForm.summary} onChange={(event) => setAuditForm((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={auditForm.evidence_link} onChange={(event) => setAuditForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {activeMode === 'training_followup' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Training topic</span>
                <input className="sm-input" value={trainingForm.topic} onChange={(event) => setTrainingForm((current) => ({ ...current, topic: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Audience</span>
                <input className="sm-input" value={trainingForm.audience} onChange={(event) => setTrainingForm((current) => ({ ...current, audience: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input className="sm-input" value={trainingForm.owner} onChange={(event) => setTrainingForm((current) => ({ ...current, owner: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Due</span>
                <input className="sm-input" type="date" value={trainingForm.due} onChange={(event) => setTrainingForm((current) => ({ ...current, due: event.target.value }))} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-[var(--sm-muted)]">Training gap or follow-up</span>
                <textarea className="sm-input min-h-[128px]" value={trainingForm.summary} onChange={(event) => setTrainingForm((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Verification method</span>
                <input className="sm-input" value={trainingForm.verification} onChange={(event) => setTrainingForm((current) => ({ ...current, verification: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Evidence link</span>
                <input className="sm-input" value={trainingForm.evidence_link} onChange={(event) => setTrainingForm((current) => ({ ...current, evidence_link: event.target.value }))} />
              </label>
            </div>
          ) : null}

          <div className="sm-entry-actions mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={saving} onClick={() => void saveActiveEntry()} type="button">
              {saving ? t('Saving...', 'သိမ်းနေသည်...') : t(`Save advanced ${activeCard.label.toLowerCase()}`, `${activeCard.label} အသေးစိတ်သိမ်း`)}
            </button>
            <Link className="sm-button-secondary" to="/app/action-board">
              {t('Action board', 'လုပ်ဆောင်ရန်')}
            </Link>
            <Link className="sm-button-secondary" to="/app/plant-manager">
              {t('Plant review', 'စက်ရုံစစ်ဆေးမှု')}
            </Link>
          </div>
              </div>
            </div>
            </details>
          ) : null}

          {recentRows.length ? (
            <details className="sm-details mt-4 p-0">
              <summary>Latest saved</summary>
              <div className="sm-details-content grid gap-2">
                {recentRows.slice(0, 3).map((row) => (
                  <article className="sm-manager-method" key={row.id}>
                    <p className="font-semibold text-[var(--sm-ink)]">{row.title}</p>
                    <p className="mt-1 text-sm text-[var(--sm-muted)]">{row.meta}</p>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </article>

      </section>

    </div>
  )
}
