import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import type { ActiveModule } from './RestaurantOperatingSystemPage'
import {
  getPosActiveLocation,
  getPosLocationCatalog,
  clearPosActiveRole,
  ensurePosWorkspaceCache,
  type PosBusinessType,
  type PosModuleId,
  type PosUserRole,
  getPosBusinessModuleContracts,
  getPosBusinessModuleLabels,
  getPosBusinessProfile,
  getPosManagerOverrideHint,
  getPosProvisionedAccounts,
  getPosRoleAccess,
  getPosRoleCatalogForBusiness,
  getPosRoleProfile,
  getPosWorkspaceScopeKey,
  loadPosSession,
  logoutPosAccount,
  syncPosProvisionedAccountToApi,
  upsertPosProvisionedAccount,
  upsertPosProvisionedRoleAccount,
} from '../lib/posAuth'
import { getPosEnterpriseReadinessChecklist, getPosEnterpriseReadinessSummary } from '../lib/posEnterpriseChecklist'
import { getPosBenchmarkBacklog } from '../lib/posBenchmarkBacklog'
import { getPosReferenceRepos } from '../lib/posReferenceRepos'
import {
  buildPosClientDeploymentPack,
  buildPosDeploymentChecklistText,
  type PosDeploymentEnvironment,
} from '../lib/posDeploymentPack'
import {
  clearPosSyncedLedger,
  enqueuePosSyncLedgerEntry,
  flushPosSyncLedger,
  loadPosSyncLedger,
  summarizePosSyncLedger,
  type PosSyncLedgerActionType,
  type PosSyncLedgerEntry,
} from '../lib/posSyncLedger'
import {
  createPosStaffMember,
  isValidPosStaffPin,
  loadPosStaffDirectory,
  replacePosStaffDirectory,
  rotatePosStaffPin,
  updatePosStaffStatus,
  type PosStaffMember,
} from '../lib/posStaffDirectory'
import {
  createPosSupportIncident,
  getPosControlPlane,
  getPosAuditEvents,
  getPosSupportIncidents,
  hasLiveWorkspaceApi,
  inviteTeamMember,
  isWorkspaceAuthError,
  updatePosControlPlane,
  updatePosSupportIncident,
  type PosAuditEventRow,
  type PosControlPlaneBillingStatus,
  type PosControlPlaneContractStatus,
  type PosControlPlaneHandoffPacketRow,
  type PosControlPlaneRoleInviteRow,
  type PosControlPlaneStaffRow,
  type PosControlPlaneTenantRow,
  type PosSupportIncidentRow,
} from '../lib/workspaceApi'

const PosRuntimeWorkspace = lazy(async () => {
  const module = await import('./RestaurantOperatingSystemPage')
  return { default: module.RestaurantOperatingSystemPage }
})

const POS_AUTO_LOCK_STORAGE_KEY = 'supermega.pos.autolock.minutes.v1'
const POS_SALES_TENANTS_STORAGE_KEY = 'supermega.pos.sales.tenants.v1'
const POS_HANDOFF_SIGNATURE_STORAGE_PREFIX = 'supermega.pos.handoff.signatures.v1'
const POS_HANDOFF_PACKET_QUEUE_STORAGE_PREFIX = 'supermega.pos.handoff.queue.v1'
const POS_ROLE_INVITE_STORAGE_PREFIX = 'supermega.pos.role-invites.v1'
const POS_ENTERPRISE_SETTINGS_STORAGE_KEY = 'supermega.pos.enterprise.settings.v1'
const POS_REDACTED_INVITE_SECRET = 'RESET_REQUIRED_DELIVER_SEPARATELY'
const AUTO_LOCK_OPTIONS = [0, 5, 10, 15] as const
const DEPLOYMENT_ENV_OPTIONS: PosDeploymentEnvironment[] = ['pilot', 'staging', 'production']

type PosSalesRoleTemplate = 'owner-led' | 'manager-led' | 'cashier-first' | 'front-desk-first' | 'inventory-led'
type PosSalesContractStatus = PosControlPlaneContractStatus
type PosSalesBillingStatus = PosControlPlaneBillingStatus
type PosSalesRoleInviteStatus = 'generated' | 'sent'
type PosEnterprisePaymentMode = 'manual-cash' | 'manual-wallet' | 'invoice-bank' | 'external-device-proof'
type PosEnterprisePrinterMode = 'browser-print' | 'pdf-a4' | 'thermal-driver' | 'email-only'
type PosEnterpriseOfflinePolicy = 'online-closeout' | 'offline-capture-review' | 'no-offline-payments'
type PosSupportSeverity = 'sev1' | 'sev2' | 'sev3'
type PosSupportCategory = 'payment' | 'printer' | 'offline' | 'data' | 'access' | 'general'
type PosHardwarePolicyStatus = 'ready' | 'review' | 'blocked'
type PosRestoreDrillStatus = 'pending' | 'passed' | 'failed'

type PosEnterpriseSettings = {
  paymentMode: PosEnterprisePaymentMode
  printerMode: PosEnterprisePrinterMode
  offlinePolicy: PosEnterpriseOfflinePolicy
}

type PosHardwarePolicyItem = {
  id: string
  lane: string
  status: PosHardwarePolicyStatus
  owner: string
  requirement: string
  implementation: string
  acceptance: string
  evidence: string
  fallback: string
}

type PosRestoreDrillResult = {
  status: PosRestoreDrillStatus
  fileName: string
  validatedAt: string
  message: string
  workspaceScopeKey?: string
  issue?: string
  sections?: string[]
}

type PosSalesTenantRecord = {
  id: string
  clientName: string
  businessType: PosBusinessType
  stage: PosSalesStage
  owner: string
  roleTemplate: PosSalesRoleTemplate
  locationCount: number
  status: 'new' | 'active' | 'paused'
  contractStatus: PosSalesContractStatus
  billingStatus: PosSalesBillingStatus
  kind: 'demo' | 'client'
  updatedAt: string
}

type PosSalesRoleInviteRecord = {
  id: string
  tenantId: string
  tenantName: string
  businessType: PosBusinessType
  role: PosUserRole
  inviteeName: string
  inviteeEmail: string
  username: string
  temporaryPassword: string
  status: PosSalesRoleInviteStatus
  createdAt: string
}

type PosProvisionedAccountResult = NonNullable<ReturnType<typeof upsertPosProvisionedAccount>>
type PosProvisionedAccountRecord = ReturnType<typeof getPosProvisionedAccounts>[number]
type PosClientLaunchRoomGateStatus = 'ready' | 'review' | 'blocked'

type PosClientLaunchRoomGate = {
  id: string
  label: string
  status: PosClientLaunchRoomGateStatus
  owner: string
  evidence: string
  nextAction: string
}

type PosSalesProvisioningPacket = {
  generatedAt: string
  workspace: string
  client: {
    id: string
    name: string
    kind: 'demo' | 'client'
    owner: string
    stage: PosSalesStage
    businessType: PosBusinessType
    locationCount: number
    roleTemplate: PosSalesRoleTemplate
  }
  readiness: {
    score: number
    label: string
    reason: string
  }
  rolePolicy: {
    templateLabel: string
    templateSummary: string
    availableRoles: string[]
  }
  launchGate: {
    contractStatus: PosSalesContractStatus
    billingStatus: PosSalesBillingStatus
    stage: PosSalesStage
  }
  moduleScope: Array<{
    moduleId: string
    label: string
  }>
  deploymentDefaults: {
    deploymentEnvironment: PosDeploymentEnvironment
    autoLockMinutes: number
    canExportExcel: boolean
    canExportJson: boolean
  }
}

type PosHandoffPacketQueueItem = {
  id: string
  tenantId: string
  tenantName: string
  stage: PosSalesStage
  generatedAt: string
  payload: PosSalesProvisioningPacket
}

const POS_SALES_ROLE_TEMPLATE_LABELS: Record<PosSalesRoleTemplate, string> = {
  'owner-led': 'Owner-led',
  'manager-led': 'Manager-led',
  'cashier-first': 'Cashier-first',
  'front-desk-first': 'Front-desk-first',
  'inventory-led': 'Inventory-led',
}

const POS_SALES_ROLE_TEMPLATE_SUMMARY: Record<PosSalesRoleTemplate, string> = {
  'owner-led': 'Owner + manager controls, full approvals, and deployment gate ownership.',
  'manager-led': 'Manager-first operations with owner escalation for sensitive approvals.',
  'cashier-first': 'Counter flow optimized for rapid checkout and strict proof capture.',
  'front-desk-first': 'Service booking and queue operations centered on front desk throughput.',
  'inventory-led': 'Stock/receiving-first flow for stores that run frequent transfer cycles.',
}

const POS_SALES_CONTRACT_STATUS_LABELS: Record<PosSalesContractStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
}

const POS_SALES_BILLING_STATUS_LABELS: Record<PosSalesBillingStatus, string> = {
  'not-configured': 'Not configured',
  trial: 'Trial',
  active: 'Active',
  'past-due': 'Past due',
}

const POS_ENTERPRISE_PAYMENT_OPTIONS: Array<{ id: PosEnterprisePaymentMode; label: string; detail: string; setup: 'client' | 'supermega' }> = [
  { id: 'manual-cash', label: 'Manual cash', detail: 'Client records cash received and prints receipt. No payment processor needed.', setup: 'client' },
  { id: 'manual-wallet', label: 'Manual wallet/bank proof', detail: 'Client records KBZPay/WavePay/bank reference manually. No provider API needed.', setup: 'client' },
  { id: 'invoice-bank', label: 'Invoice + bank transfer', detail: 'Generate invoice, print/share, and reconcile paid reference later.', setup: 'client' },
  { id: 'external-device-proof', label: 'External card/device proof', detail: 'Client uses its own card machine or banking app; POS stores the reference number and closeout note only.', setup: 'client' },
]

const POS_ENTERPRISE_PRINTER_OPTIONS: Array<{ id: PosEnterprisePrinterMode; label: string; detail: string; setup: 'client' | 'supermega' }> = [
  { id: 'browser-print', label: 'Normal browser print', detail: 'Works with any printer installed on the device through the browser print dialog.', setup: 'client' },
  { id: 'pdf-a4', label: 'A4 PDF invoice', detail: 'Use browser Save as PDF or office printer for invoices and day packs.', setup: 'client' },
  { id: 'thermal-driver', label: 'Thermal receipt driver', detail: 'Install vendor driver first. Direct silent print needs kiosk/Electron/WebUSB later.', setup: 'supermega' },
  { id: 'email-only', label: 'No printer / digital receipt', detail: 'Use invoice JSON/PDF handoff and customer message until hardware is ready.', setup: 'client' },
]

const POS_ENTERPRISE_OFFLINE_OPTIONS: Array<{ id: PosEnterpriseOfflinePolicy; label: string; detail: string }> = [
  { id: 'online-closeout', label: 'Online closeout required', detail: 'Safest for pilots: all pending queue items must sync before logout/role switch.' },
  { id: 'offline-capture-review', label: 'Offline capture with manager review', detail: 'Allow local tickets but require manager review before payment closeout.' },
  { id: 'no-offline-payments', label: 'No offline payments', detail: 'Payments are blocked while offline; service notes can still be captured locally.' },
]

const POS_SUPPORT_SEVERITY_OPTIONS: Array<{ id: PosSupportSeverity; label: string; response: string }> = [
  { id: 'sev1', label: 'SEV1 - business stopped', response: 'Immediate escalation before closeout.' },
  { id: 'sev2', label: 'SEV2 - degraded workflow', response: 'Same-day support with workaround.' },
  { id: 'sev3', label: 'SEV3 - question/change', response: 'Next release queue or training follow-up.' },
]

const POS_SUPPORT_CATEGORY_OPTIONS: Array<{ id: PosSupportCategory; label: string }> = [
  { id: 'payment', label: 'Payment' },
  { id: 'printer', label: 'Printer/hardware' },
  { id: 'offline', label: 'Offline/sync' },
  { id: 'data', label: 'Data/export' },
  { id: 'access', label: 'Login/access' },
  { id: 'general', label: 'General' },
]

const POS_CLIENT_SELF_SERVICE_CONTROLS = [
  'Print invoice or receipt through browser print dialog to any installed printer.',
  'Record manual cash, wallet, bank-transfer, or external card-device proof.',
  'Export invoice JSON, sync evidence, workspace backup, and support packets where role policy allows.',
  'Validate a backup file as a restore drill before go-live signoff.',
  'Create a support incident packet with severity, category, sync state, and device policy.',
] as const

const POS_SUPERMEGA_PROVISIONED_CONTROLS = [
  'Hardware implementation policy, device acceptance checks, and support handoff.',
  'Direct silent thermal printing, scanner automation, and cash drawer integration beyond browser print if requested later.',
  'Durable tenant database, row-level isolation, monitoring, and scheduled backup jobs.',
  'Automated restore drill, incident SLA, release approvals, and post-deploy smoke evidence.',
] as const

const POS_BUSINESS_DEVICE_POLICY: Record<PosBusinessType, { lane: string; requirement: string; acceptance: string; fallback: string }> = {
  restaurant: {
    lane: 'Restaurant service devices',
    requirement: 'Counter browser device, optional kitchen/tablet screen, and one manager device for approvals.',
    acceptance: 'Open POS, create one order/payment-proof note, switch role, and verify queue/sync remains clean.',
    fallback: 'Use one counter laptop/tablet and printed kitchen ticket until KDS/table tablets are approved.',
  },
  spa: {
    lane: 'Spa front desk and treatment devices',
    requirement: 'Front desk browser device, optional therapist phone/tablet, and one manager device for closeout.',
    acceptance: 'Open booking/billing, print or export one receipt, update one service queue item, and flush sync.',
    fallback: 'Use front desk device as the source of truth and capture therapist updates as handover notes.',
  },
  retail: {
    lane: 'Retail counter and stock devices',
    requirement: 'Counter browser device, optional keyboard-wedge barcode scanner, and receiving/manager device.',
    acceptance: 'Scan/type one item, print or export receipt, create one stock note, and verify closeout export.',
    fallback: 'Use manual item lookup and receiving notes until scanner station is tested.',
  },
}

const POS_STAGE_READINESS_SCORE: Record<PosSalesStage, number> = {
  lead: 22,
  discovery: 46,
  pilot: 72,
  'go-live': 94,
}

function getSalesTenantReadiness(tenant: PosSalesTenantRecord) {
  const stageBase = POS_STAGE_READINESS_SCORE[tenant.stage]
  const statusBonus = tenant.status === 'active' ? 6 : tenant.status === 'paused' ? -4 : 0
  const locationPenalty = tenant.locationCount > 3 ? -4 : 0
  const contractPenalty = tenant.contractStatus === 'signed' ? 0 : tenant.contractStatus === 'sent' ? -6 : -12
  const billingPenalty = tenant.billingStatus === 'active' || tenant.billingStatus === 'trial'
    ? 0
    : tenant.billingStatus === 'past-due'
      ? -10
      : -14
  const boundedScore = Math.max(0, Math.min(100, stageBase + statusBonus + locationPenalty))
  const scoredWithCommercialGate = Math.max(0, Math.min(100, boundedScore + contractPenalty + billingPenalty))
  const label = scoredWithCommercialGate >= 85
    ? 'ready'
    : scoredWithCommercialGate >= 60
      ? 'pilot'
      : scoredWithCommercialGate >= 40
        ? 'build'
        : 'intake'
  const reason =
    tenant.stage === 'go-live'
      ? 'Live handoff requires deployment proof + staff readiness.'
      : tenant.stage === 'pilot'
        ? 'Pilot is active; close readiness and sync gaps before launch.'
        : tenant.stage === 'discovery'
          ? 'Discovery is in progress; role matrix and workflow scope still open.'
          : 'Lead stage; intake, role policy, and deployment lane still missing.'
  return { score: scoredWithCommercialGate, label, reason }
}

type PosSalesLaunchGateStatus = 'ready' | 'review' | 'blocked'

type PosSalesLaunchGate = {
  status: PosSalesLaunchGateStatus
  score: number
  summary: string
  blockers: string[]
  reviewItems: string[]
}

function getSalesTenantRegistryStatus(
  salesTenantCloudMode: 'unknown' | 'cloud' | 'local',
  syncBusy: boolean,
  syncMessage: string,
) {
  if (syncBusy) {
    return {
      label: 'Checking cloud sync',
      summary: syncMessage || 'Verifying client registry and role invites.',
      compactLabel: 'checking',
    }
  }
  if (salesTenantCloudMode === 'cloud') {
    return {
      label: 'Cloud verified',
      summary: syncMessage || 'POS client registry is saved through the cloud API.',
      compactLabel: 'api verified',
    }
  }
  if (salesTenantCloudMode === 'local') {
    return {
      label: 'Sync review',
      summary: syncMessage || 'Client registry changes are queued. Retry cloud save before handoff.',
      compactLabel: 'review',
    }
  }
  return {
    label: 'Not checked',
    summary: syncMessage || 'Sign in to verify client registry sync.',
    compactLabel: 'not checked',
  }
}

function getSalesTenantLaunchGate(
  tenant: PosSalesTenantRecord,
  salesTenantCloudMode: 'unknown' | 'cloud' | 'local',
): PosSalesLaunchGate {
  const blockers: string[] = []
  const reviewItems: string[] = []

  if (tenant.contractStatus !== 'signed') {
    blockers.push('Contract is not signed.')
  }
  if (!(tenant.billingStatus === 'trial' || tenant.billingStatus === 'active')) {
    blockers.push('Billing is not trial/active.')
  }
  if (tenant.billingStatus === 'past-due') {
    blockers.push('Billing is past due.')
  }
  if (tenant.stage === 'lead' || tenant.stage === 'discovery') {
    blockers.push('Stage must reach pilot before launch handoff.')
  }
  if (tenant.stage === 'pilot' && salesTenantCloudMode !== 'cloud') {
    reviewItems.push('Cloud registry sync should be enabled before go-live.')
  }
  if (tenant.locationCount > 3) {
    reviewItems.push('Multi-location rollout: confirm transfer and receiving SOP.')
  }

  const status: PosSalesLaunchGateStatus = blockers.length > 0 ? 'blocked' : reviewItems.length > 0 ? 'review' : 'ready'
  const score = status === 'ready' ? 100 : status === 'review' ? 72 : 36
  const summary = status === 'ready'
    ? 'Launch gate is clear for credential handoff.'
    : status === 'review'
      ? 'Launch is possible with review items.'
      : 'Launch is blocked until contract, billing, and stage gates close.'

  return {
    status,
    score,
    summary,
    blockers,
    reviewItems,
  }
}

function normalizeSalesStage(value: unknown): PosSalesStage {
  return value === 'lead' || value === 'discovery' || value === 'pilot' || value === 'go-live' ? value : 'lead'
}

function normalizeSalesRoleTemplate(value: unknown, businessType: PosBusinessType): PosSalesRoleTemplate {
  if (
    value === 'owner-led'
    || value === 'manager-led'
    || value === 'cashier-first'
    || value === 'front-desk-first'
    || value === 'inventory-led'
  ) {
    return value
  }
  if (businessType === 'spa') {
    return 'front-desk-first'
  }
  if (businessType === 'retail') {
    return 'inventory-led'
  }
  return 'cashier-first'
}

function defaultSalesRoleTemplate(businessType: PosBusinessType): PosSalesRoleTemplate {
  if (businessType === 'spa') {
    return 'front-desk-first'
  }
  if (businessType === 'retail') {
    return 'inventory-led'
  }
  return 'cashier-first'
}

function normalizeSalesContractStatus(value: unknown, tenantKind: 'demo' | 'client') {
  if (value === 'draft' || value === 'sent' || value === 'signed') {
    return value
  }
  return tenantKind === 'demo' ? 'signed' : 'draft'
}

function normalizeSalesBillingStatus(value: unknown, tenantKind: 'demo' | 'client') {
  if (value === 'not-configured' || value === 'trial' || value === 'active' || value === 'past-due') {
    return value
  }
  return tenantKind === 'demo' ? 'trial' : 'not-configured'
}

const POS_DEMO_PACK_LABELS: Record<PosBusinessType, string> = {
  restaurant: 'Restaurant Demo Pack',
  spa: 'Yangon Spa Reference Pilot',
  retail: 'Retail Demo Pack',
}

const POS_DEMO_PACK_TENANT_IDS: Record<PosBusinessType, string> = {
  restaurant: 'demo-restaurant-pack',
  spa: 'demo-spa-pack',
  retail: 'demo-retail-pack',
}

function isLegacyDemoName(name: string) {
  const token = name.trim().toLowerCase()
  if (!token) {
    return false
  }
  return token === 'restaurant'
    || token === 'spa'
    || token === 'retail'
    || token.includes('golden plate')
    || token.includes('lotus spa')
    || token.includes('north retail')
    || token.includes('first client demo')
    || token.includes('first client pilot')
    || token.includes('yangon spa reference pilot')
    || token.includes('supermega pos demo')
    || token.includes('demo pack')
    || token.includes('demo / rangoon')
    || token.includes('demo / yangon')
}

function normalizeSalesTenantClientName(rawName: string, businessType: PosBusinessType) {
  const name = rawName.trim()
  if (!name) {
    return POS_DEMO_PACK_LABELS[businessType]
  }
  return isLegacyDemoName(name) ? POS_DEMO_PACK_LABELS[businessType] : name
}

function normalizeSalesTenantKind(rawKind: unknown, clientName: string) {
  if (isLegacyDemoName(clientName)) {
    return 'demo'
  }
  if (rawKind === 'demo' || rawKind === 'client') {
    return rawKind
  }
  return 'client'
}

function normalizeSalesTenantRecord(value: unknown): PosSalesTenantRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<PosSalesTenantRecord>
  const businessType = raw.businessType === 'restaurant' || raw.businessType === 'spa' || raw.businessType === 'retail'
    ? raw.businessType
    : null
  if (!businessType) {
    return null
  }
  const clientName = normalizeSalesTenantClientName(String(raw.clientName || ''), businessType)
  if (!clientName) {
    return null
  }
  const kind = normalizeSalesTenantKind(raw.kind, clientName)
  const normalizedRawId = String(raw.id || '').trim().toLowerCase()
  const id = kind === 'demo'
    ? POS_DEMO_PACK_TENANT_IDS[businessType]
    : (normalizedRawId || `${kind}-${clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
  const locationCount = Number(raw.locationCount)
  return {
    id,
    clientName,
    businessType,
    stage: normalizeSalesStage(raw.stage),
    owner: String(raw.owner || '').trim() || 'Sales lead',
    roleTemplate: normalizeSalesRoleTemplate(raw.roleTemplate, businessType),
    locationCount: Number.isFinite(locationCount) && locationCount > 0 ? Math.round(locationCount) : 1,
    status: raw.status === 'active' || raw.status === 'paused' ? raw.status : 'new',
    contractStatus: normalizeSalesContractStatus(raw.contractStatus, kind),
    billingStatus: normalizeSalesBillingStatus(raw.billingStatus, kind),
    kind,
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  }
}

function normalizeSalesTenantRecords(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as PosSalesTenantRecord[]
  }
  const rows = value
    .map((item) => normalizeSalesTenantRecord(item))
    .filter((item): item is PosSalesTenantRecord => Boolean(item))
  const byKey = new Map<string, PosSalesTenantRecord>()
  for (const row of rows) {
    const key = row.kind === 'demo' ? `demo:${row.businessType}` : `client:${row.id}`
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, row)
      continue
    }
    const currentAt = Date.parse(current.updatedAt || '') || 0
    const nextAt = Date.parse(row.updatedAt || '') || 0
    byKey.set(key, nextAt >= currentAt ? row : current)
  }
  return [...byKey.values()]
}

function mergeSalesTenantRecords(base: PosSalesTenantRecord[], incoming: PosSalesTenantRecord[]) {
  if (!incoming.length) {
    return base
  }
  const byId = new Map<string, PosSalesTenantRecord>()
  for (const row of base) {
    byId.set(row.id, row)
  }
  for (const row of incoming) {
    const current = byId.get(row.id)
    if (!current) {
      byId.set(row.id, row)
      continue
    }
    const nextAt = Date.parse(row.updatedAt || '') || 0
    const currentAt = Date.parse(current.updatedAt || '') || 0
    byId.set(row.id, nextAt >= currentAt ? row : current)
  }
  return normalizeSalesTenantRecords([...byId.values()]).sort((a, b) => {
    const bAt = Date.parse(b.updatedAt || '') || 0
    const aAt = Date.parse(a.updatedAt || '') || 0
    return bAt - aAt
  })
}

function toPosControlPlaneTenantRows(records: PosSalesTenantRecord[]): PosControlPlaneTenantRow[] {
  return records.map((item) => ({
    id: item.id,
    clientName: item.clientName,
    businessType: item.businessType,
    stage: item.stage,
    owner: item.owner,
    roleTemplate: item.roleTemplate,
    locationCount: item.locationCount,
    status: item.status,
    kind: item.kind,
    contractStatus: item.contractStatus,
    billingStatus: item.billingStatus,
    updatedAt: item.updatedAt,
  }))
}

function toPosControlPlaneRoleInviteRows(records: PosSalesRoleInviteRecord[]): PosControlPlaneRoleInviteRow[] {
  return records.map((item) => ({
    id: item.id,
    tenantId: item.tenantId,
    tenantName: item.tenantName,
    businessType: item.businessType,
    role: item.role,
    inviteeName: item.inviteeName,
    inviteeEmail: item.inviteeEmail,
    username: item.username,
    temporaryPassword: POS_REDACTED_INVITE_SECRET,
    status: item.status,
    createdAt: item.createdAt,
  }))
}

function toPosControlPlaneHandoffPacketRows(items: PosHandoffPacketQueueItem[]): PosControlPlaneHandoffPacketRow[] {
  return items.map((item) => ({
    id: item.id,
    tenantId: item.tenantId,
    tenantName: item.tenantName,
    stage: item.stage,
    generatedAt: item.generatedAt,
    payload: item.payload as Record<string, unknown>,
  }))
}

function toPosControlPlaneStaffRows(records: PosStaffMember[]): PosControlPlaneStaffRow[] {
  return [...records]
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
    .map((member) => ({
      id: member.id,
      displayName: member.displayName,
      role: member.role,
      locationId: member.locationId,
      locationLabel: member.locationLabel,
      status: member.status,
      pinDigest: member.pinDigest,
      pinHint: member.pinHint,
      note: member.note,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      pinUpdatedAt: member.pinUpdatedAt,
    }))
}

function normalizeAutoLockMinutes(value: unknown): number | null {
  const parsed = Number(value)
  if (parsed === 0 || parsed === 5 || parsed === 10 || parsed === 15) {
    return parsed
  }
  return null
}

function loadPosSalesTenants() {
  if (typeof window === 'undefined') {
    return [] as PosSalesTenantRecord[]
  }
  try {
    const raw = window.localStorage.getItem(POS_SALES_TENANTS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return normalizeSalesTenantRecords(parsed)
  } catch {
    return []
  }
}

function savePosSalesTenants(records: PosSalesTenantRecord[]) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(POS_SALES_TENANTS_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Ignore storage failures in locked browsers.
  }
}

function getDefaultEnterpriseSettings(): PosEnterpriseSettings {
  return {
    paymentMode: 'manual-cash',
    printerMode: 'browser-print',
    offlinePolicy: 'online-closeout',
  }
}

function normalizeEnterpriseSettings(value: unknown): PosEnterpriseSettings {
  const defaults = getDefaultEnterpriseSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }
  const raw = value as Partial<PosEnterpriseSettings>
  const paymentMode = POS_ENTERPRISE_PAYMENT_OPTIONS.some((option) => option.id === raw.paymentMode)
    ? raw.paymentMode as PosEnterprisePaymentMode
    : defaults.paymentMode
  const printerMode = POS_ENTERPRISE_PRINTER_OPTIONS.some((option) => option.id === raw.printerMode)
    ? raw.printerMode as PosEnterprisePrinterMode
    : defaults.printerMode
  const offlinePolicy = POS_ENTERPRISE_OFFLINE_OPTIONS.some((option) => option.id === raw.offlinePolicy)
    ? raw.offlinePolicy as PosEnterpriseOfflinePolicy
    : defaults.offlinePolicy
  return { paymentMode, printerMode, offlinePolicy }
}

function loadPosEnterpriseSettings() {
  if (typeof window === 'undefined') {
    return getDefaultEnterpriseSettings()
  }
  try {
    const raw = window.localStorage.getItem(POS_ENTERPRISE_SETTINGS_STORAGE_KEY)
    return raw ? normalizeEnterpriseSettings(JSON.parse(raw)) : getDefaultEnterpriseSettings()
  } catch {
    return getDefaultEnterpriseSettings()
  }
}

function savePosEnterpriseSettings(settings: PosEnterpriseSettings) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(POS_ENTERPRISE_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeEnterpriseSettings(settings)))
  } catch {
    // Ignore local storage failures in locked browsers.
  }
}

function normalizeScopeStorageKey(scopeKey: string) {
  return String(scopeKey || 'pos-default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, '-')
    .replace(/^-|-$/g, '') || 'pos-default'
}

function getHandoffSignatureStorageKey(scopeKey: string) {
  return `${POS_HANDOFF_SIGNATURE_STORAGE_PREFIX}.${normalizeScopeStorageKey(scopeKey)}`
}

function getHandoffPacketQueueStorageKey(scopeKey: string) {
  return `${POS_HANDOFF_PACKET_QUEUE_STORAGE_PREFIX}.${normalizeScopeStorageKey(scopeKey)}`
}

function getRoleInviteStorageKey(scopeKey: string) {
  return `${POS_ROLE_INVITE_STORAGE_PREFIX}.${normalizeScopeStorageKey(scopeKey)}`
}

function loadHandoffSignatures(scopeKey: string) {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>
  }
  try {
    const raw = window.localStorage.getItem(getHandoffSignatureStorageKey(scopeKey))
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => Boolean(String(key || '').trim()) && typeof value === 'string')
      .map(([key, value]) => [String(key), String(value)] as const)
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function saveHandoffSignatures(scopeKey: string, signatures: Record<string, string>) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(getHandoffSignatureStorageKey(scopeKey), JSON.stringify(signatures))
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function normalizeHandoffQueueItem(value: unknown): PosHandoffPacketQueueItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<PosHandoffPacketQueueItem>
  if (
    !raw.id
    || !raw.tenantId
    || !raw.tenantName
    || !raw.generatedAt
    || !raw.payload
    || (raw.stage !== 'lead' && raw.stage !== 'discovery' && raw.stage !== 'pilot' && raw.stage !== 'go-live')
  ) {
    return null
  }
  return {
    id: String(raw.id),
    tenantId: String(raw.tenantId),
    tenantName: String(raw.tenantName),
    stage: raw.stage,
    generatedAt: String(raw.generatedAt),
    payload: raw.payload,
  }
}

function sortHandoffQueue(items: PosHandoffPacketQueueItem[]) {
  return [...items].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
}

function loadHandoffPacketQueue(scopeKey: string) {
  if (typeof window === 'undefined') {
    return [] as PosHandoffPacketQueueItem[]
  }
  try {
    const raw = window.localStorage.getItem(getHandoffPacketQueueStorageKey(scopeKey))
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return sortHandoffQueue(
      parsed
        .map((item) => normalizeHandoffQueueItem(item))
        .filter((item): item is PosHandoffPacketQueueItem => Boolean(item)),
    )
  } catch {
    return []
  }
}

function saveHandoffPacketQueue(scopeKey: string, items: PosHandoffPacketQueueItem[]) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(getHandoffPacketQueueStorageKey(scopeKey), JSON.stringify(items))
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function normalizeRoleInviteRecord(value: unknown): PosSalesRoleInviteRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<PosSalesRoleInviteRecord>
  if (
    !raw.id
    || !raw.tenantId
    || !raw.tenantName
    || !raw.username
    || !raw.createdAt
    || !raw.role
    || !raw.businessType
  ) {
    return null
  }
  const role = String(raw.role || '') as PosUserRole
  const businessType = raw.businessType === 'restaurant' || raw.businessType === 'spa' || raw.businessType === 'retail'
    ? raw.businessType
    : null
  if (!businessType || !getPosRoleCatalogForBusiness(businessType).some((item) => item.id === role)) {
    return null
  }
  const status: PosSalesRoleInviteStatus = raw.status === 'sent' ? 'sent' : 'generated'
  return {
    id: String(raw.id),
    tenantId: String(raw.tenantId),
    tenantName: String(raw.tenantName),
    businessType,
    role,
    inviteeName: String(raw.inviteeName || '').trim() || 'Team member',
    inviteeEmail: String(raw.inviteeEmail || '').trim().toLowerCase(),
    username: String(raw.username).trim().toLowerCase(),
    temporaryPassword: POS_REDACTED_INVITE_SECRET,
    status,
    createdAt: String(raw.createdAt),
  }
}

function redactRoleInviteSecrets(records: PosSalesRoleInviteRecord[]): PosSalesRoleInviteRecord[] {
  return records.map((record) => ({
    ...record,
    temporaryPassword: POS_REDACTED_INVITE_SECRET,
  }))
}

function getRoleInviteCredentialStatus(invite: PosSalesRoleInviteRecord) {
  const rawSecret = String(invite.temporaryPassword || '').trim()
  return rawSecret && rawSecret !== POS_REDACTED_INVITE_SECRET
    ? 'One-time credential generated. Deliver through approved channel, then rotate/reset after first login.'
    : 'Secret not stored in exports or control plane. Reset credential if another handoff is needed.'
}

function toRoleInviteExportRows(records: PosSalesRoleInviteRecord[]) {
  return records.map((invite) => ({
    tenant_name: invite.tenantName,
    business_type: invite.businessType,
    role: invite.role,
    invitee_name: invite.inviteeName,
    invitee_email: invite.inviteeEmail,
    username: invite.username,
    credential_secret: 'REDACTED',
    credential_delivery: getRoleInviteCredentialStatus(invite),
    status: invite.status,
    created_at: invite.createdAt,
  }))
}

function sortRoleInvites(records: PosSalesRoleInviteRecord[]) {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function mergeRoleInvites(base: PosSalesRoleInviteRecord[], incoming: PosSalesRoleInviteRecord[]) {
  if (!incoming.length) {
    return base
  }
  const byId = new Map<string, PosSalesRoleInviteRecord>()
  for (const record of base) {
    byId.set(record.id, record)
  }
  for (const record of incoming) {
    const current = byId.get(record.id)
    if (!current) {
      byId.set(record.id, record)
      continue
    }
    const nextAt = Date.parse(record.createdAt || '') || 0
    const currentAt = Date.parse(current.createdAt || '') || 0
    byId.set(record.id, nextAt >= currentAt ? record : current)
  }
  return sortRoleInvites([...byId.values()]).slice(0, 120)
}

function mergeHandoffPacketQueue(base: PosHandoffPacketQueueItem[], incoming: PosHandoffPacketQueueItem[]) {
  if (!incoming.length) {
    return base
  }
  const byId = new Map<string, PosHandoffPacketQueueItem>()
  for (const item of base) {
    byId.set(item.id, item)
  }
  for (const item of incoming) {
    const current = byId.get(item.id)
    if (!current) {
      byId.set(item.id, item)
      continue
    }
    const nextAt = Date.parse(item.generatedAt || '') || 0
    const currentAt = Date.parse(current.generatedAt || '') || 0
    byId.set(item.id, nextAt >= currentAt ? item : current)
  }
  return sortHandoffQueue([...byId.values()]).slice(0, 24)
}

function loadRoleInvites(scopeKey: string) {
  if (typeof window === 'undefined') {
    return [] as PosSalesRoleInviteRecord[]
  }
  try {
    const raw = window.localStorage.getItem(getRoleInviteStorageKey(scopeKey))
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return sortRoleInvites(
      parsed
        .map((item) => normalizeRoleInviteRecord(item))
        .filter((item): item is PosSalesRoleInviteRecord => Boolean(item)),
    )
  } catch {
    return []
  }
}

function saveRoleInvites(scopeKey: string, records: PosSalesRoleInviteRecord[]) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(getRoleInviteStorageKey(scopeKey), JSON.stringify(redactRoleInviteSecrets(records)))
  } catch {
    // Ignore storage failures in locked browser contexts.
  }
}

function pushHandoffPacketQueue(scopeKey: string, item: PosHandoffPacketQueueItem) {
  const current = loadHandoffPacketQueue(scopeKey)
  const deduped = current.filter((existing) => existing.id !== item.id && existing.tenantId !== item.tenantId)
  const next = sortHandoffQueue([item, ...deduped]).slice(0, 24)
  saveHandoffPacketQueue(scopeKey, next)
  return next
}

function loadAutoLockMinutes() {
  if (typeof window === 'undefined') {
    return 5
  }
  let raw = Number.NaN
  try {
    raw = Number(window.localStorage.getItem(POS_AUTO_LOCK_STORAGE_KEY))
  } catch {
    return 5
  }
  const normalized = normalizeAutoLockMinutes(raw)
  if (normalized !== null) return normalized
  return 5
}

function defaultDeploymentEnvironment(locationStatus: 'setup' | 'pilot' | 'live' | undefined): PosDeploymentEnvironment {
  if (locationStatus === 'live') {
    return 'production'
  }
  if (locationStatus === 'setup') {
    return 'staging'
  }
  return 'pilot'
}

function defaultDeploymentVersionTag() {
  const dateToken = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `pos-${dateToken}`
}

function isMobileUserAgent() {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(navigator.userAgent || '')
}

function detectCompactPosViewport() {
  if (typeof window === 'undefined') {
    return false
  }
  const visualWidth = window.visualViewport?.width || window.innerWidth
  const visualHeight = window.visualViewport?.height || window.innerHeight
  const screenShortEdge = Math.min(window.screen.width || visualWidth, window.screen.height || visualHeight)
  const shortEdge = Math.min(visualWidth, visualHeight, screenShortEdge)
  const widthMatch = window.matchMedia('(max-width: 1024px)').matches
  const touchMatch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const mobileUaMatch = isMobileUserAgent()
  return widthMatch || shortEdge <= 820 || (touchMatch && shortEdge <= 1366) || mobileUaMatch
}

function syncCompactPosViewportFlag(setCompactViewport: (value: boolean) => void) {
  if (typeof window === 'undefined') {
    return
  }
  const visualWidth = window.visualViewport?.width || window.innerWidth
  const visualHeight = window.visualViewport?.height || window.innerHeight
  const screenShortEdge = Math.min(window.screen.width || visualWidth, window.screen.height || visualHeight)
  const shortEdge = Math.min(visualWidth, visualHeight, screenShortEdge)
  const widthMatch = window.matchMedia('(max-width: 1024px)').matches
  const touchMatch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const mobileUaMatch = isMobileUserAgent()
  setCompactViewport(widthMatch || shortEdge <= 820 || (touchMatch && shortEdge <= 1366) || mobileUaMatch)
}

const MODULE_PREVIEW: Record<ActiveModule, { detail: string }> = {
  enterprise: {
    detail: 'Readiness gates, owner brief, and release controls before closeout.',
  },
  payment: {
    detail: 'Split-tender tracking, provider payloads, and reconciliation routing.',
  },
  tables: {
    detail: 'Floor zones, table states, bill-request alerts, and server ownership.',
  },
  kitchen: {
    detail: 'Ticket status by station, target-ready times, and delay escalation.',
  },
  approvals: {
    detail: 'Void/discount/refund requests routed to manager approval with evidence.',
  },
  shift: {
    detail: 'Opening, lunch, dinner, and close checkpoints with handover capture.',
  },
  stock: {
    detail: 'Par levels, current stock, waste logging, and supplier issue notes.',
  },
  guest: {
    detail: 'Issue capture with owner, recovery actions, and status follow-through.',
  },
  margin: {
    detail: 'Promo decisions with sales-lift and cost-pressure tracking.',
  },
  'qr-menu': {
    detail: 'Customer menu publish flow with printable output and source evidence.',
  },
}

const BUSINESS_SAAS_FEATURES: Record<PosBusinessType, Array<{ title: string; detail: string; status: 'live' | 'build' | 'next' }>> = {
  restaurant: [
    { title: 'Order and payment proof', detail: 'Split tenders, proof capture, cash-up, and exports.', status: 'live' },
    { title: 'Kitchen and table SLA lane', detail: 'Ticket aging, service alerts, and handover discipline.', status: 'live' },
    { title: 'Offline guardrail and tip recovery', detail: 'Reconnect queue lock, pending uploads, and shift review lock workflow.', status: 'build' },
    { title: 'Supplier transfer and receiving loop', detail: 'Request, dispatch, receive, and variance resolution from one queue.', status: 'build' },
    { title: 'Recipe costing and waste variance', detail: 'Auto margin checks by dish and shift.', status: 'next' },
  ],
  spa: [
    { title: 'Booking and front desk billing', detail: 'Appointment to checkout in one flow.', status: 'live' },
    { title: 'Therapist queue and room turnover', detail: 'Session handoff, room state, and delay alerts.', status: 'build' },
    { title: 'Membership packs and prepayments', detail: 'Package balance, usage history, and renewal prompts.', status: 'next' },
    { title: 'No-show policy automation', detail: 'Deposit, reminders, and cancellation charge logic.', status: 'next' },
  ],
  retail: [
    { title: 'Counter checkout and returns', detail: 'Proof-backed tenders with return approvals.', status: 'live' },
    { title: 'Stock receiving discipline', detail: 'PO status and partial receiving alignment.', status: 'build' },
    { title: 'Replenishment and shelf alerts', detail: 'Reorder quantities with supplier lead-time logic.', status: 'build' },
    { title: 'Omnichannel order sync', detail: 'Web and in-store inventory consistency.', status: 'next' },
  ],
}

type PosModulePlaybook = {
  operatorAction: string
  evidence: string
  aiOutput: string
  primaryAction: string
  metric: string
  stepOne: string
  stepTwo: string
  stepThree: string
  quickActions: [string, string, string]
}

const POS_MODULE_PLAYBOOK_BASE: Record<PosModuleId, PosModulePlaybook> = {
  enterprise: {
    operatorAction: 'Review today, clear exceptions, and decide what can close.',
    evidence: 'Open risks, owner approvals, pending sync, and closeout notes.',
    aiOutput: 'Owner brief with risks, next actions, and release blockers.',
    primaryAction: 'Review closeout',
    metric: 'Closeout confidence',
    stepOne: 'Review open sales, service, stock, and support issues.',
    stepTwo: 'Clear blockers or assign an owner before closing.',
    stepThree: 'Export the owner closeout brief.',
    quickActions: ['Review exceptions', 'Export owner brief', 'Open support'],
  },
  payment: {
    operatorAction: 'Capture payment method, proof reference, invoice, and settlement note.',
    evidence: 'Cash count, wallet/bank reference, external terminal proof, invoice number.',
    aiOutput: 'Payment exception list and daily settlement summary.',
    primaryAction: 'Record payment proof',
    metric: 'Unmatched tenders',
    stepOne: 'Enter customer, item/service, amount, and tender type.',
    stepTwo: 'Attach wallet/bank/cash/external terminal proof.',
    stepThree: 'Print or save the receipt/PDF.',
    quickActions: ['Create invoice', 'Print receipt', 'Export proof'],
  },
  tables: {
    operatorAction: 'Assign the active resource, owner, status, and handoff time.',
    evidence: 'Table, room, chair, lane, or station state with staff owner.',
    aiOutput: 'Capacity pressure, delay risk, and next handoff.',
    primaryAction: 'Update resource state',
    metric: 'Open resources',
    stepOne: 'Choose table, room, chair, lane, or station.',
    stepTwo: 'Set status, staff owner, and expected handoff time.',
    stepThree: 'Flag delay or ready-for-next-customer.',
    quickActions: ['Seat/check in', 'Mark ready', 'Flag delay'],
  },
  kitchen: {
    operatorAction: 'Move active work through queue, delay, recovery, and completion states.',
    evidence: 'Ticket/session status, target time, delay reason, and recovery owner.',
    aiOutput: 'SLA breach warnings and queue recovery plan.',
    primaryAction: 'Clear active queue',
    metric: 'Queue SLA',
    stepOne: 'Pick the active order/session from the queue.',
    stepTwo: 'Update status, target time, and owner.',
    stepThree: 'Escalate delay or mark complete.',
    quickActions: ['Start work', 'Escalate delay', 'Complete'],
  },
  approvals: {
    operatorAction: 'Approve or reject discounts, refunds, voids, waivers, and closeout exceptions.',
    evidence: 'Reason, requester, proof, manager decision, and customer impact.',
    aiOutput: 'Exception trend summary and approval risk notes.',
    primaryAction: 'Review approvals',
    metric: 'Approval risk',
    stepOne: 'Open the discount, refund, void, waiver, or exception.',
    stepTwo: 'Check reason, proof, amount, and requester.',
    stepThree: 'Approve, reject, or request missing proof.',
    quickActions: ['Approve', 'Request proof', 'Reject'],
  },
  shift: {
    operatorAction: 'Run opening, handover, and close checkpoints with accountable owner.',
    evidence: 'Float, roster, blockers, handover notes, and missed tasks.',
    aiOutput: 'Shift readiness and next-shift handoff summary.',
    primaryAction: 'Run shift check',
    metric: 'Shift readiness',
    stepOne: 'Confirm staff, float/device, and opening checklist.',
    stepTwo: 'Record blockers and handover notes.',
    stepThree: 'Close shift with pending items assigned.',
    quickActions: ['Open shift', 'Handover', 'Close shift'],
  },
  stock: {
    operatorAction: 'Update stock, waste, receiving, supplier issue, and reorder action.',
    evidence: 'On-hand, par, variance, waste reason, supplier, and next action.',
    aiOutput: 'Low-stock list, variance explanation, and reorder prompts.',
    primaryAction: 'Update stock proof',
    metric: 'Stock risk',
    stepOne: 'Search or scan the item/SKU/service stock.',
    stepTwo: 'Record count, waste, receiving, or transfer.',
    stepThree: 'Set reorder/supplier follow-up.',
    quickActions: ['Count stock', 'Receive item', 'Reorder'],
  },
  guest: {
    operatorAction: 'Capture complaint, recovery action, owner, and closure state.',
    evidence: 'Customer issue, response, compensation, and follow-up owner.',
    aiOutput: 'Client recovery queue and repeat-issue pattern.',
    primaryAction: 'Log recovery',
    metric: 'Open recovery',
    stepOne: 'Find or create the customer profile.',
    stepTwo: 'Record issue, history, and recovery action.',
    stepThree: 'Assign follow-up owner and close state.',
    quickActions: ['Find customer', 'Log issue', 'Schedule follow-up'],
  },
  margin: {
    operatorAction: 'Review discounts, packages, promos, and cost pressure before close.',
    evidence: 'Discount reason, package balance, promo use, and margin note.',
    aiOutput: 'Margin drift warning and owner pricing prompt.',
    primaryAction: 'Check margin drift',
    metric: 'Margin pressure',
    stepOne: 'Review today discounts, package use, and promo sales.',
    stepTwo: 'Compare against cost, waste, and stock pressure.',
    stepThree: 'Export pricing/margin note for owner.',
    quickActions: ['Review discounts', 'Check package', 'Export note'],
  },
  'qr-menu': {
    operatorAction: 'Keep menu/catalog live, printable, and aligned with approved prices.',
    evidence: 'Published item, price, category, availability, and source approval.',
    aiOutput: 'Catalog change note and mismatch warning.',
    primaryAction: 'Update catalog',
    metric: 'Catalog accuracy',
    stepOne: 'Update item/service name, price, category, and availability.',
    stepTwo: 'Confirm source approval and display order.',
    stepThree: 'Print/save menu or catalog view.',
    quickActions: ['Add item', 'Set unavailable', 'Print menu'],
  },
}

const POS_VERTICAL_MODULE_PLAYBOOK_OVERRIDES: Record<PosBusinessType, Partial<Record<PosModuleId, Partial<PosModulePlaybook>>>> = {
  restaurant: {
    enterprise: {
      operatorAction: 'Check orders, payment proof, kitchen delays, stock blockers, and closeout before release.',
      evidence: 'Open checks, delayed tickets, void/discount approvals, stock variance, and cash-up note.',
    },
    payment: {
      operatorAction: 'Record order, tender split, wallet/bank/card proof, invoice, and cashier close note.',
      metric: 'Unmatched checks',
    },
    tables: {
      operatorAction: 'Set table state, server owner, bill request, and cleanup handoff.',
      metric: 'Table turnover',
    },
    kitchen: {
      operatorAction: 'Track ticket station, target-ready time, delay reason, and recovery action.',
      metric: 'Kitchen delay',
    },
    stock: {
      operatorAction: 'Log prep par, waste, supplier issue, and next purchase action.',
      metric: 'Prep shortage',
    },
  },
  spa: {
    enterprise: {
      operatorAction: 'Check front desk, therapist queue, billing exceptions, package balances, and owner closeout.',
      evidence: 'Late sessions, unpaid balances, package usage, room delays, and recovery notes.',
      metric: 'Service desk risk',
    },
    payment: {
      operatorAction: 'Capture booking deposit, balance payment, package use, invoice, and proof reference.',
      evidence: 'Appointment, therapist, deposit, wallet/bank proof, package balance, and invoice.',
      aiOutput: 'Unpaid bookings, package-risk list, and owner settlement brief.',
      primaryAction: 'Settle booking',
      metric: 'Unpaid sessions',
    },
    tables: {
      operatorAction: 'Assign room/chair, therapist, check-in state, cleanup state, and next guest.',
      evidence: 'Room, chair, therapist owner, start/end time, cleanup status, and delay reason.',
      aiOutput: 'Room turnover pressure and therapist handoff prompt.',
      primaryAction: 'Update room state',
      metric: 'Room turnover',
    },
    kitchen: {
      operatorAction: 'Move active treatments through waiting, in-session, delayed, recovery, and complete.',
      evidence: 'Client, treatment, therapist, target end, delay reason, and recovery action.',
      aiOutput: 'Therapist queue priority and delay recovery brief.',
      primaryAction: 'Clear service queue',
      metric: 'Queue delay',
    },
    approvals: {
      operatorAction: 'Approve package discounts, free add-ons, refunds, waivers, and complaint recovery.',
      metric: 'Waiver risk',
    },
    shift: {
      operatorAction: 'Confirm front desk opening, therapist roster, room readiness, and close handover.',
      metric: 'Roster readiness',
    },
    stock: {
      operatorAction: 'Track oils, consumables, retail stock, low-stock issue, and supplier follow-up.',
      metric: 'Treatment stock',
    },
    guest: {
      operatorAction: 'Record complaint, reschedule, therapist follow-up, aftercare, and closure.',
      metric: 'Client recovery',
    },
    margin: {
      operatorAction: 'Review prepaid package usage, discount leakage, and high-cost service mix.',
      metric: 'Package margin',
    },
    'qr-menu': {
      operatorAction: 'Publish service menu, duration, price, availability, and package terms for front desk.',
      metric: 'Service menu accuracy',
    },
  },
  retail: {
    enterprise: {
      operatorAction: 'Check checkout risk, returns, stock variance, receiving blockers, and owner closeout.',
      evidence: 'Open returns, missing proof, stock variance, receiving status, and close note.',
      metric: 'Store close risk',
    },
    payment: {
      operatorAction: 'Record sale, tender proof, return/exchange link, invoice, and cashier settlement.',
      metric: 'Unmatched sales',
    },
    tables: {
      operatorAction: 'Track checkout lane, queue pressure, cashier owner, and handoff state.',
      metric: 'Lane pressure',
    },
    approvals: {
      operatorAction: 'Approve returns, exchanges, discounts, manual price changes, and cash variances.',
      metric: 'Return risk',
    },
    stock: {
      operatorAction: 'Capture receiving, transfer, shelf count, reorder point, and supplier issue.',
      metric: 'Reorder risk',
    },
    margin: {
      operatorAction: 'Review promo, markdown, stock age, and discount pressure before close.',
      metric: 'Markdown risk',
    },
  },
}

function getPosModulePlaybook(businessType: PosBusinessType, moduleId: PosModuleId): PosModulePlaybook {
  return {
    ...POS_MODULE_PLAYBOOK_BASE[moduleId],
    ...(POS_VERTICAL_MODULE_PLAYBOOK_OVERRIDES[businessType]?.[moduleId] || {}),
  }
}

type PosPilotKitRow = {
  label: string
  value: string
  note?: string
}

type PosPilotKit = {
  title: string
  location: string
  hours: string
  sourceNote: string
  serviceMenu: PosPilotKitRow[]
  resources: PosPilotKitRow[]
  setup: PosPilotKitRow[]
}

const POS_VERTICAL_PILOT_KITS: Record<PosBusinessType, PosPilotKit> = {
  restaurant: {
    title: 'Restaurant demo launch kit',
    location: 'Counter service / MMK / Asia/Rangoon',
    hours: 'Daily service windows by shift',
    sourceNote: 'Generic restaurant POS seed for demo and training.',
    serviceMenu: [
      { label: 'Quick sale', value: 'Counter checkout, split tender, receipt proof' },
      { label: 'Table service', value: 'Table state, order age, kitchen handoff' },
      { label: 'Closeout', value: 'Cash-up, variance note, owner export' },
    ],
    resources: [
      { label: 'Stations', value: 'Counter, kitchen, manager phone' },
      { label: 'Stock', value: 'Par levels, waste, supplier issue notes' },
    ],
    setup: [
      { label: 'Payments', value: 'Cash, card, wallet, void/refund approvals' },
      { label: 'Exports', value: 'Daily close Excel and JSON proof pack' },
    ],
  },
  spa: {
    title: 'Yangon spa pilot kit',
    location: '4th floor, Building 401, Times City Complex, Kamayut TSP, Yangon / MMK / Asia/Rangoon',
    hours: '9:00 AM-8:00 PM; last admission seed 6:00 PM',
    sourceNote: 'Reference seed from public Hladee Spa location/service data and Inya Day Spa MMK price benchmarks; confirm exact client approval before live use.',
    serviceMenu: [
      { label: 'INDIBA', value: 'therapy device service', note: 'Room, device, staff skill, and safety checklist tracked.' },
      { label: 'Oil massage', value: 'massage service', note: 'Room, therapist, package, and settlement tracked.' },
      { label: 'Dry massage', value: 'non-oil massage', note: 'Quick-service queue with therapist handoff.' },
      { label: 'Foot massage', value: '13,000-18,000 MMK benchmark', note: 'Chair resource, therapist handoff, and payment split.' },
      { label: 'Head and ear massage', value: 'addon lane', note: 'Add-on timing and cross-sell prompts.' },
      { label: 'Nail spa', value: '15,000-20,000 MMK benchmark', note: 'Retail add-ons and staff ownership ready.' },
      { label: 'Eyelash', value: 'addon lane', note: 'Catalog add-ons, deposits, and aftercare prompts.' },
    ],
    resources: [
      { label: 'Rooms', value: '4 treatment rooms, 2 foot chairs, 1 nail desk' },
      { label: 'Team', value: 'Owner, manager, front desk, 5 therapists' },
      { label: 'Retail', value: 'Oils, scrubs, gift cards, prepaid packages' },
    ],
    setup: [
      { label: 'Menu loaded', value: 'Service catalog, duration, price seed, and provider ownership' },
      { label: 'Booking policy', value: 'Deposit, cancellation, no-show, and balance settlement rules' },
      { label: 'Operations', value: 'Therapist queue, room turnover, package balance, client recovery' },
      { label: 'Launch proof', value: 'Role logins, Excel launch room, sync queue, and day-one runbook' },
    ],
  },
  retail: {
    title: 'Retail demo launch kit',
    location: 'Store counter / MMK / Asia/Rangoon',
    hours: 'Daily open-close store rhythm',
    sourceNote: 'Generic retail POS seed for inventory-heavy stores.',
    serviceMenu: [
      { label: 'Barcode sale', value: 'Counter checkout, receipt proof, returns' },
      { label: 'Receiving', value: 'Purchase order, partial receive, variance' },
      { label: 'Replenishment', value: 'Low stock, reorder quantity, supplier follow-up' },
    ],
    resources: [
      { label: 'Stations', value: 'Counter, receiving shelf, manager device' },
      { label: 'Inventory', value: 'SKU, supplier, on-hand, reorder point' },
    ],
    setup: [
      { label: 'Catalog', value: 'SKU seed, supplier list, taxes, return rules' },
      { label: 'Exports', value: 'Stock ledger and daily sales workbook' },
    ],
  },
}

type PosWorkspaceControlPanel = 'overview' | 'ai-native' | 'readiness' | 'deployment' | 'sync' | 'go-live' | 'support' | 'staff'

const POS_WORKSPACE_CONTROL_PANELS: Array<{ id: PosWorkspaceControlPanel; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'ai-native', label: 'AI Native' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'deployment', label: 'Deploy' },
  { id: 'sync', label: 'Sync' },
  { id: 'go-live', label: 'Go-live' },
  { id: 'support', label: 'Support' },
  { id: 'staff', label: 'Staff' },
]
const POS_CLIENT_CONTROL_PANEL_IDS = new Set<PosWorkspaceControlPanel>(['overview', 'staff'])

type PosWorkspaceSurface = 'workspace' | 'control' | 'sales' | 'help'

const POS_WORKSPACE_SURFACES: Array<{ id: PosWorkspaceSurface; label: string }> = [
  { id: 'workspace', label: 'POS' },
  { id: 'control', label: 'Control' },
  { id: 'sales', label: 'Sales Admin' },
  { id: 'help', label: 'Help' },
]

type PosWorkspaceRuntimeView = 'overview' | 'runtime'

const POS_WORKSPACE_RUNTIME_VIEWS: Array<{ id: PosWorkspaceRuntimeView; label: string }> = [
  { id: 'overview', label: 'One-screen overview' },
  { id: 'runtime', label: 'Runtime lab' },
]

type PosSalesPanel = 'pipeline' | 'playbook' | 'clients' | 'handoff' | 'ops' | 'meta' | 'portfolio'

const POS_WORKSPACE_SALES_PANELS: Array<{ id: PosSalesPanel; label: string }> = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'playbook', label: 'Playbook' },
  { id: 'clients', label: 'Clients' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'ops', label: 'Ops' },
  { id: 'meta', label: 'Platform' },
  { id: 'portfolio', label: 'Future' },
]

type PosCompactWorkspaceMode = 'snapshot' | 'operations' | 'launch'
type PosCompactControlMode = PosWorkspaceControlPanel
type PosCompactSalesMode = PosSalesPanel

const POS_COMPACT_WORKSPACE_MODES: Array<{ id: PosCompactWorkspaceMode; label: string }> = [
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'operations', label: 'Operations' },
  { id: 'launch', label: 'Launch' },
]

const POS_COMPACT_CONTROL_MODES: Array<{ id: PosCompactControlMode; label: string }> = [
  ...POS_WORKSPACE_CONTROL_PANELS,
]

const POS_COMPACT_SALES_MODES: Array<{ id: PosCompactSalesMode; label: string }> = [
  ...POS_WORKSPACE_SALES_PANELS,
]

function normalizeWorkspaceSurface(value: string | null) {
  if (value === 'workspace' || value === 'control' || value === 'sales' || value === 'help') {
    return value
  }
  return null
}

function isSuperMegaInternalPosSession(session: { username: string; workspaceSlug: string }) {
  const username = session.username.trim().toLowerCase()
  const workspaceSlug = session.workspaceSlug.trim().toLowerCase()
  return username === 'demo'
    || username === 'demo@firstclient.supermega.dev'
    || workspaceSlug === 'supermega-demo-group'
}

function getVisibleWorkspaceSurfaces(isInternalOperator: boolean) {
  return POS_WORKSPACE_SURFACES
    .filter((surface) => isInternalOperator || surface.id !== 'sales')
    .map((surface) => (
      !isInternalOperator && surface.id === 'control'
        ? { ...surface, label: 'Setup' }
        : surface
    ))
}

function getVisibleControlPanels(isInternalOperator: boolean) {
  return isInternalOperator
    ? POS_WORKSPACE_CONTROL_PANELS
    : POS_WORKSPACE_CONTROL_PANELS
      .filter((panel) => POS_CLIENT_CONTROL_PANEL_IDS.has(panel.id))
      .map((panel) => (panel.id === 'overview' ? { ...panel, label: 'Setup' } : panel))
}

function isWorkspaceSurfaceAvailable(surface: PosWorkspaceSurface, isInternalOperator: boolean) {
  return surface === 'help' || isInternalOperator || surface !== 'sales'
}

function isControlPanelAvailable(panel: PosWorkspaceControlPanel, isInternalOperator: boolean) {
  return isInternalOperator || POS_CLIENT_CONTROL_PANEL_IDS.has(panel)
}

function normalizeWorkspaceView(value: string | null) {
  if (value === 'overview' || value === 'runtime') {
    return value
  }
  return null
}

function normalizeCompactWorkspaceMode(value: string | null) {
  if (value === 'snapshot' || value === 'operations' || value === 'launch') {
    return value
  }
  return null
}

function normalizeCompactControlMode(value: string | null) {
  const mode = POS_COMPACT_CONTROL_MODES.find((item) => item.id === value)
  return mode?.id || null
}

function normalizeCompactSalesMode(value: string | null) {
  const mode = POS_COMPACT_SALES_MODES.find((item) => item.id === value)
  return mode?.id || null
}

function normalizeControlPanel(value: string | null) {
  if (value === 'overview' || value === 'ai-native' || value === 'readiness' || value === 'deployment' || value === 'sync' || value === 'go-live' || value === 'support' || value === 'staff') {
    return value
  }
  return null
}

function normalizeSalesPanel(value: string | null) {
  if (
    value === 'pipeline'
    || value === 'playbook'
    || value === 'clients'
    || value === 'handoff'
    || value === 'ops'
    || value === 'meta'
    || value === 'portfolio'
  ) {
    return value
  }
  return null
}

const POS_CONTROL_PANEL_SUMMARY: Record<PosWorkspaceControlPanel, { title: string; detail: string }> = {
  overview: {
    title: 'Operating overview',
    detail: 'Role scope, module stack, and next shift actions on one page.',
  },
  'ai-native': {
    title: 'AI-native roadmap',
    detail: 'Live automations, build gaps, and next AI lanes for the selected business pack.',
  },
  readiness: {
    title: 'Enterprise readiness',
    detail: 'Controls, audits, and benchmark gaps before go-live.',
  },
  deployment: {
    title: 'Deployment gate',
    detail: 'Release owner, smoke checks, and launch checklist for each client lane.',
  },
  sync: {
    title: 'Sync discipline',
    detail: 'Queue health, offline risk, and export reliability controls.',
  },
  'go-live': {
    title: 'Go-live kit',
    detail: 'Manual payments, invoice printing, hardware policy, backup drill, and support incidents.',
  },
  support: {
    title: 'Support desk',
    detail: 'Persistent incidents, SLA response, device/payment state, and support evidence exports.',
  },
  staff: {
    title: 'Staff and role policy',
    detail: 'PIN lifecycle, role enforcement, and support-safe roster control.',
  },
}

const POS_PRODUCT_FUTURE_MAP = [
  {
    id: 'pos-core',
    horizon: 'Now -> 60 days',
    title: 'POS Core hardening',
    detail: 'Close offline safety, passcode attribution, shift closeout discipline, and release smoke automation.',
  },
  {
    id: 'vertical-packs',
    horizon: 'Now -> 90 days',
    title: 'Vertical business packs',
    detail: 'Restaurant, spa, and retail packs stay modular while sharing auth, exports, and deployment lanes.',
  },
  {
    id: 'operator-cloud',
    horizon: 'Next 2 quarters',
    title: 'Cloud operator control plane',
    detail: 'Tenant lifecycle, role templates, billing state, deployment packets, and support playbooks in one admin lane.',
  },
  {
    id: 'ai-native',
    horizon: 'Next 2 quarters',
    title: 'AI-native operations copilot',
    detail: 'Queue anomaly detection, owner briefs, forecast prompts, and guided recovery actions linked to proofs.',
  },
  {
    id: 'cross-sell',
    horizon: 'Expansion',
    title: 'POS expansion',
    detail: 'Scale POS-only rollout across restaurant, spa, and retail while keeping one shared auth + deployment control plane.',
  },
] as const

function getRoleSurfaceDefaults(role: PosUserRole | null) {
  if (role === 'owner') {
    return {
      surface: 'workspace' as const,
      view: 'overview' as const,
      control: null,
      sales: null,
    }
  }
  if (role === 'manager') {
    return {
      surface: 'workspace' as const,
      view: 'overview' as const,
      control: null,
      sales: null,
    }
  }
  if (role === 'auditor') {
    return {
      surface: 'workspace' as const,
      view: 'overview' as const,
      control: null,
      sales: null,
    }
  }
  return {
    surface: 'workspace' as const,
    view: 'overview' as const,
    control: null,
    sales: null,
  }
}

type PosSalesStage = 'lead' | 'discovery' | 'pilot' | 'go-live'

type PosSalesQueueItem = {
  id: string
  clientName: string
  businessType: PosBusinessType
  stage: PosSalesStage
  owner: string
  summary: string
  nextAction: string
}

const POS_SALES_STAGE_LABELS: Record<PosSalesStage, string> = {
  lead: 'Lead',
  discovery: 'Discovery',
  pilot: 'Pilot',
  'go-live': 'Go-live',
}

const POS_SALES_PLAYBOOK = [
  {
    id: 'intake',
    title: 'Client intake pack',
    detail: 'Business type, location scope, manual/external payment proof, and closeout policy captured before build.',
  },
  {
    id: 'role-map',
    title: 'Role matrix',
    detail: 'Owner, manager, and operator permissions agreed before first training day.',
  },
  {
    id: 'data-ops',
    title: 'Data and sync policy',
    detail: 'Offline rules, sync queue checks, and export ownership locked before pilot.',
  },
  {
    id: 'launch',
    title: 'Launch command',
    detail: 'Readiness gate, smoke pass, and training evidence approved before go-live.',
  },
] as const

const POS_SALES_OFFER_PACKAGES = [
  {
    id: 'pilot-setup',
    title: 'POS Pilot Setup',
    price: '$750-$1,500 setup',
    cadence: '3-7 day pilot launch',
    buyer: 'Owner-led single location',
    deliverable: 'Business pack, simple logins, staff roles, menu/service import, printer test, launch room, and training handoff.',
  },
  {
    id: 'launch-pack',
    title: 'POS Launch Pack',
    price: '$2,500-$5,000 setup',
    cadence: '2-4 week rollout',
    buyer: 'Multi-role or multi-location client',
    deliverable: 'Pilot setup plus role templates, closeout policy, hardware acceptance, support desk, Excel packs, and day-one go-live proof.',
  },
  {
    id: 'managed-ops',
    title: 'Managed POS Ops',
    price: '$300-$1,500 / month',
    cadence: 'Ongoing support retainer',
    buyer: 'Client wants SuperMega to operate updates and support',
    deliverable: 'Release updates, support incidents, backup drills, monthly owner reports, AI-native exception brief, and staff change requests.',
  },
] as const

const POS_SALES_QUALIFICATION_QUESTIONS = [
  'What business type is this: restaurant, spa, retail, or hybrid?',
  'How many locations, devices, staff users, and daily transactions are in scope?',
  'What is the current POS/spreadsheet pain: checkout speed, stock accuracy, staff control, reporting, or support?',
  'Which payment paths are required on day one: cash, wallet/bank reference, invoice, or external card device proof?',
  'What setup data exists now: menu, services, products, prices, customers, staff, tax, discounts, and closeout rules?',
  'Who approves voids, discounts, refunds, closeout, stock corrections, and role changes?',
] as const

const POS_CLIENT_ONBOARDING_STEPS = [
  {
    id: 'scope',
    title: '1. Scope',
    owner: 'Sales',
    detail: 'Confirm vertical, location count, devices, roles, payment policy, and target pilot date.',
  },
  {
    id: 'data',
    title: '2. Data',
    owner: 'Client + SuperMega',
    detail: 'Collect menu/services/products, prices, stock units, staff list, tax/discount/refund rules, and client contact list.',
  },
  {
    id: 'build',
    title: '3. Build',
    owner: 'SuperMega',
    detail: 'Create client lane, provision owner login, configure roles, load starter catalog, and export launch room.',
  },
  {
    id: 'device',
    title: '4. Device',
    owner: 'Client',
    detail: 'Open POS on client phone/tablet/desktop, test browser print, confirm manual payment proof path, and validate support contact.',
  },
  {
    id: 'training',
    title: '5. Training',
    owner: 'Sales + Implementation',
    detail: 'Run owner and operator walkthrough, closeout rehearsal, support incident rehearsal, and day-one handoff.',
  },
  {
    id: 'go-live',
    title: '6. Go-live',
    owner: 'SuperMega support',
    detail: 'Run smoke checks, export launch certification, monitor support incidents, and schedule week-one review.',
  },
] as const

type PosClientIntakeWorkbookInput = {
  clientName: string
  businessType: PosBusinessType
  owner: string
  locationCount: number
  roleTemplate: PosSalesRoleTemplate
  source: 'playbook' | 'tenant' | 'wizard'
}

function buildPosClientIntakeWorkbookSheets(input: PosClientIntakeWorkbookInput) {
  const businessProfile = getPosBusinessProfile(input.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const roleCatalog = getPosRoleCatalogForBusiness(input.businessType)
  const generatedAt = new Date().toISOString()
  const catalogKind: Record<PosBusinessType, string> = {
    restaurant: 'menu_item',
    spa: 'service',
    retail: 'product',
  }
  const catalogSetupNote: Record<PosBusinessType, string> = {
    restaurant: 'Add price, category, kitchen print group, stock impact, and modifiers before pilot.',
    spa: 'Add duration, room/chair resource, therapist skill, package eligibility, and aftercare note before pilot.',
    retail: 'Add SKU/barcode, supplier, on-hand count, reorder point, and return policy before pilot.',
  }

  return {
    startHere: [
      {
        generated_at: generatedAt,
        workbook: 'SuperMega POS client intake workbook',
        client_name: input.clientName,
        business_type: businessProfile.label,
        owner: input.owner,
        locations: input.locationCount,
        role_template: POS_SALES_ROLE_TEMPLATE_LABELS[input.roleTemplate],
        source: input.source,
        instruction: 'Complete the open fields, return this workbook to SuperMega, then use Sales Admin to create the pilot setup and launch room.',
      },
      {
        generated_at: generatedAt,
        workbook: 'Client-safe setup boundary',
        client_name: input.clientName,
        business_type: businessProfile.label,
        owner: input.owner,
        locations: input.locationCount,
        role_template: POS_SALES_ROLE_TEMPLATE_LABELS[input.roleTemplate],
        source: input.source,
        instruction: 'Clients receive POS, Setup, and Help. Sales Admin, launch gates, and internal control lanes stay with SuperMega.',
      },
    ],
    businessProfile: [
      { field: 'Business display name', value: input.clientName, owner: 'Client', required: 'yes', notes: 'Name shown to staff and receipts.' },
      { field: 'Legal/company name', value: '', owner: 'Client', required: 'optional', notes: 'Use if invoice or contract name differs.' },
      { field: 'Business type', value: businessProfile.label, owner: 'SuperMega', required: 'yes', notes: businessProfile.summary },
      { field: 'Primary owner', value: input.owner, owner: 'Client', required: 'yes', notes: 'Person who approves role access, discounts, refunds, and closeout.' },
      { field: 'Owner phone', value: '', owner: 'Client', required: 'yes', notes: 'For day-one support escalation.' },
      { field: 'Owner email', value: '', owner: 'Client', required: 'yes', notes: 'For login and launch packet delivery.' },
      { field: 'Location count', value: input.locationCount, owner: 'Sales', required: 'yes', notes: 'One launch room per client lane in this pilot build.' },
      { field: 'Currency', value: 'MMK', owner: 'Sales', required: 'yes', notes: 'Confirm if client needs another currency.' },
      { field: 'Timezone', value: 'Asia/Rangoon', owner: 'Sales', required: 'yes', notes: 'Used for closeout, booking, and audit timestamps.' },
      { field: 'Operating hours', value: pilotKit.hours, owner: 'Client', required: 'yes', notes: 'Confirm exact hours before live use.' },
      { field: 'Launch target date', value: '', owner: 'Sales', required: 'yes', notes: 'Needed before staff training and go-live smoke.' },
    ],
    catalog: pilotKit.serviceMenu.map((item, index) => ({
      row: index + 1,
      catalog_type: catalogKind[input.businessType],
      item_name: item.label,
      category: '',
      price_mmk: '',
      sku_or_service_code: '',
      duration_or_modifier: item.value,
      tax_category: '',
      stock_or_resource_rule: '',
      active: 'yes',
      client_notes: '',
      setup_note: item.note || catalogSetupNote[input.businessType],
    })),
    staffRoles: roleCatalog.map((role) => ({
      role_id: role.id,
      role_label: role.label,
      recommended_staff_name: '',
      phone: '',
      email: '',
      pin_owner_required: role.id === 'owner' || role.id === 'manager' ? 'yes' : 'optional',
      approval_scope: role.summary,
      daily_focus: role.focus,
      client_training_status: 'not_started',
    })),
    paymentRules: POS_ENTERPRISE_PAYMENT_OPTIONS.map((option) => ({
      payment_mode: option.label,
      setup_owner: option.setup === 'client' ? 'Client can self-setup' : 'SuperMega implementation',
      accepted_on_day_one: option.id === 'manual-cash' || option.id === 'manual-wallet' ? 'yes' : 'confirm',
      proof_required: 'yes',
      closeout_rule: 'Capture reference, staff owner, amount, and variance note before daily close.',
      implementation_note: option.detail,
    })),
    hardware: [
      {
        device_or_policy: 'Primary POS device',
        setup_owner: 'Client',
        required: 'yes',
        acceptance_test: 'Open pos.supermega.dev, sign in, select role, and complete one sample order/service/sale.',
        fallback: 'Use manager phone or desktop browser.',
      },
      {
        device_or_policy: 'Backup device',
        setup_owner: 'Client',
        required: 'recommended',
        acceptance_test: 'Second device can sign in and view the same day queue.',
        fallback: 'Keep manual receipt book until backup device is confirmed.',
      },
      {
        device_or_policy: 'Cash drawer / cash box',
        setup_owner: 'Client',
        required: 'if cash accepted',
        acceptance_test: 'Cash count owner, opening float, closeout variance, and manager approval are defined.',
        fallback: 'Cash disabled until owner signs off.',
      },
      {
        device_or_policy: 'Barcode scanner',
        setup_owner: 'Client',
        required: input.businessType === 'retail' ? 'recommended' : 'optional',
        acceptance_test: 'Scanner enters SKU into browser input like a keyboard.',
        fallback: 'Manual search and SKU entry.',
      },
      ...POS_ENTERPRISE_PRINTER_OPTIONS.map((option) => ({
        device_or_policy: option.label,
        setup_owner: option.setup === 'client' ? 'Client can self-setup' : 'SuperMega implementation',
        required: option.id === 'browser-print' ? 'recommended' : 'optional',
        acceptance_test: 'Print or save a sample receipt/invoice during training.',
        fallback: option.detail,
      })),
    ],
    launchApprovals: [
      ...POS_SALES_QUALIFICATION_QUESTIONS.map((question, index) => ({
        lane: 'qualification',
        order: index + 1,
        owner: 'Sales',
        item: question,
        status: 'open',
        evidence_required: 'Client answer recorded in discovery notes.',
      })),
      ...POS_CLIENT_ONBOARDING_STEPS.map((step, index) => ({
        lane: 'onboarding',
        order: index + 1,
        owner: step.owner,
        item: step.title,
        status: 'open',
        evidence_required: step.detail,
      })),
    ],
    offers: POS_SALES_OFFER_PACKAGES.map((offer) => ({
      offer: offer.title,
      price: offer.price,
      cadence: offer.cadence,
      best_for: offer.buyer,
      deliverable: offer.deliverable,
      client_fit_notes: '',
    })),
  }
}

const POS_OUTSOURCED_SALES_STACK = [
  {
    id: 'sdr',
    title: 'SDR lane (outsourced)',
    detail: 'Qualify store type, location count, and existing POS pain before demo.',
  },
  {
    id: 'demo',
    title: 'Demo specialist lane',
    detail: 'Run 20-minute role-focused flow (owner + operator), then confirm pilot scope.',
  },
  {
    id: 'onboarding',
    title: 'Implementation lane',
    detail: 'Use launch packet, provision login, schedule training, and collect go-live signoff.',
  },
  {
    id: 'retention',
    title: 'Week-1 success lane',
    detail: 'Track sync health, closeout quality, and unresolved incidents in first 7 days.',
  },
] as const

type PosAiNativeCapabilityStatus = 'live' | 'build' | 'next'

type PosAiNativeCapability = {
  id: string
  status: PosAiNativeCapabilityStatus
  title: string
  detail: string
  owner: string
  businessTypes: PosBusinessType[]
}

const POS_AI_NATIVE_CAPABILITIES: PosAiNativeCapability[] = [
  {
    id: 'offline-guardrail',
    status: 'live',
    title: 'Offline guardrail orchestration',
    detail: 'Queue-lock policy, reconnect deadline, and pending critical actions tracked in the POS runtime.',
    owner: 'Ops owner',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'tip-transfer-recovery',
    status: 'live',
    title: 'Recovery lanes for tips and transfers',
    detail: 'Shift review lock, tip recovery queue, and stock transfer lifecycle available for operator actions.',
    owner: 'Shift manager',
    businessTypes: ['restaurant'],
  },
  {
    id: 'service-device-map',
    status: 'live',
    title: 'Service-device mapping',
    detail: 'Table/kitchen lane ownership mapped to terminal/tablet/phone/KDS device assignments.',
    owner: 'Implementation lead',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'daily-brief-export',
    status: 'build',
    title: 'AI owner brief handoff',
    detail: 'One-click owner brief export to summarize readiness, sync risk, and next go-live actions.',
    owner: 'Founder ops',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'role-passcode-policy',
    status: 'build',
    title: 'Role + passcode policy enforcement',
    detail: 'Maps cashier/front desk/device actions to role template and enforces manager override evidence by action type.',
    owner: 'Implementation lead',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'transfer-receiving-sla',
    status: 'build',
    title: 'Transfer receive SLA and variance watcher',
    detail: 'Flags delayed transfer receiving and prompts variance approval before stock is released to sale.',
    owner: 'Inventory lead',
    businessTypes: ['restaurant', 'retail'],
  },
  {
    id: 'scheduled-owner-report-pack',
    status: 'build',
    title: 'Scheduled owner report pack',
    detail: 'Generates daily export packet (Excel + JSON + brief) and queues it for owner review before close.',
    owner: 'Ops owner',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'permission-drift-audit',
    status: 'build',
    title: 'Permission drift audit monitor',
    detail: 'Flags mismatch between tenant policy roles and active terminal privileges before shift closeout.',
    owner: 'Security admin',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'service-anomaly-watch',
    status: 'build',
    title: 'Service anomaly watch',
    detail: 'Detects queue spikes, repeated approvals, and sync-failure clusters and routes owner actions by severity.',
    owner: 'Ops owner',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'forecasting',
    status: 'next',
    title: 'Demand and labor forecasting',
    detail: 'Predict prep pressure and staffing risk per daypart using POS + queue patterns.',
    owner: 'Data lead',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'voice-order-capture',
    status: 'next',
    title: 'Phone-order capture with AI parsing',
    detail: 'Convert incoming call notes into structured ticket rows and queue-safe approval requests.',
    owner: 'Product lead',
    businessTypes: ['restaurant', 'retail'],
  },
  {
    id: 'operator-coach',
    status: 'next',
    title: 'Operator coaching assistant',
    detail: 'Suggest next best action for cashier/front desk based on queue risk, stock variance, and customer recovery history.',
    owner: 'Product lead',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
]

function getPosAiNativeCapabilities(businessType: PosBusinessType) {
  return POS_AI_NATIVE_CAPABILITIES.filter((item) => item.businessTypes.includes(businessType))
}

function summarizeAiNativeCapabilities(capabilities: PosAiNativeCapability[]) {
  const live = capabilities.filter((item) => item.status === 'live').length
  const build = capabilities.filter((item) => item.status === 'build').length
  const next = capabilities.filter((item) => item.status === 'next').length
  return {
    live,
    build,
    next,
    score: capabilities.length ? Math.round((live / capabilities.length) * 100) : 0,
  }
}

function resolveSalesStage(locationStatus: 'setup' | 'pilot' | 'live' | undefined): PosSalesStage {
  if (locationStatus === 'live') {
    return 'go-live'
  }
  if (locationStatus === 'pilot') {
    return 'pilot'
  }
  return 'discovery'
}

function buildPosSalesQueue(
  session: { companyName: string; displayName: string; activeBusinessType: PosBusinessType; activeLocationStatus?: 'setup' | 'pilot' | 'live' },
  tenants: PosSalesTenantRecord[],
): PosSalesQueueItem[] {
  const activeWorkspaceItem: PosSalesQueueItem = {
    id: 'active-workspace',
    clientName: `${session.companyName} / Active workspace`,
    businessType: session.activeBusinessType,
    stage: resolveSalesStage(session.activeLocationStatus),
    owner: session.displayName || 'Owner',
    summary: 'Current account selected in POS host.',
    nextAction: 'Run readiness and export deployment pack.',
  }

  const tenantItems = [...tenants]
    .sort((a, b) => {
      const bAt = Date.parse(b.updatedAt || '') || 0
      const aAt = Date.parse(a.updatedAt || '') || 0
      return bAt - aAt
    })
    .slice(0, 6)
    .map((tenant) => ({
      id: `tenant-${tenant.id}`,
      clientName: tenant.clientName,
      businessType: tenant.businessType,
      stage: tenant.stage,
      owner: tenant.owner,
      summary: tenant.kind === 'demo'
        ? 'Internal demo lane for sales walkthrough and operator rehearsal.'
        : 'Client lane tracked in sales admin registry.',
      nextAction: tenant.stage === 'go-live'
        ? 'Run go-live smoke and hand off launch packet.'
        : tenant.stage === 'pilot'
          ? 'Close launch blockers and provision role invites.'
          : 'Advance discovery checklist and finalize deployment scope.',
    }))

  const deduped = [activeWorkspaceItem, ...tenantItems].filter((item, index, rows) =>
    rows.findIndex((entry) => entry.clientName === item.clientName && entry.businessType === item.businessType) === index,
  )

  return deduped
}

type PosOfflineSyncRisk = {
  pendingCount: number
  warningCount: number
  reviewCount: number
  criticalCount: number
  oldestPendingMinutes: number
  status: 'clear' | 'fresh' | 'watch' | 'review' | 'critical'
  statusLabel: string
  nextAction: string
}

function formatPendingAge(minutes: number) {
  if (minutes <= 0) {
    return '0m'
  }
  const clamped = Math.max(0, Math.floor(minutes))
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  if (hours <= 0) {
    return `${mins}m`
  }
  return `${hours}h ${mins}m`
}

function getOfflineSyncRisk(entries: PosSyncLedgerEntry[]): PosOfflineSyncRisk {
  const pending = entries.filter((entry) => entry.status === 'queued' || entry.status === 'failed')
  if (!pending.length) {
    return {
      pendingCount: 0,
      warningCount: 0,
      reviewCount: 0,
      criticalCount: 0,
      oldestPendingMinutes: 0,
      status: 'clear',
      statusLabel: 'Risk clear',
      nextAction: 'No pending sync actions.',
    }
  }

  const now = Date.now()
  let warningCount = 0
  let reviewCount = 0
  let criticalCount = 0
  let oldestPendingMinutes = 0

  for (const entry of pending) {
    const createdAtMs = Date.parse(entry.createdAt || '')
    if (!Number.isFinite(createdAtMs)) {
      continue
    }
    const ageMinutes = Math.max(0, Math.round((now - createdAtMs) / 60000))
    oldestPendingMinutes = Math.max(oldestPendingMinutes, ageMinutes)
    if (ageMinutes >= 72 * 60) {
      criticalCount += 1
    } else if (ageMinutes >= 24 * 60) {
      reviewCount += 1
    } else if (ageMinutes >= 12 * 60) {
      warningCount += 1
    }
  }

  if (criticalCount > 0) {
    return {
      pendingCount: pending.length,
      warningCount,
      reviewCount,
      criticalCount,
      oldestPendingMinutes,
      status: 'critical',
      statusLabel: 'Risk critical',
      nextAction: 'Reconnect immediately and flush queue before role switch or logout.',
    }
  }
  if (reviewCount > 0) {
    return {
      pendingCount: pending.length,
      warningCount,
      reviewCount,
      criticalCount,
      oldestPendingMinutes,
      status: 'review',
      statusLabel: 'Risk review',
      nextAction: 'Clear pending queue now to avoid 24h offline expiry pressure.',
    }
  }
  if (warningCount > 0) {
    return {
      pendingCount: pending.length,
      warningCount,
      reviewCount,
      criticalCount,
      oldestPendingMinutes,
      status: 'watch',
      statusLabel: 'Risk watch',
      nextAction: 'Monitor queue age and clear before closeout.',
    }
  }
  return {
    pendingCount: pending.length,
    warningCount,
    reviewCount,
    criticalCount,
    oldestPendingMinutes,
    status: 'fresh',
    statusLabel: 'Risk fresh',
    nextAction: 'Queue is fresh. Keep cloud sync running.',
  }
}

function buildSalesProvisioningPacket(
  tenant: PosSalesTenantRecord,
  workspaceSlug: string,
  autoLockMinutes: number,
): PosSalesProvisioningPacket {
  const readiness = getSalesTenantReadiness(tenant)
  const roleCatalog = getPosRoleCatalogForBusiness(tenant.businessType)
  const moduleLabels = getPosBusinessModuleLabels(tenant.businessType)
  const moduleScope = Object.entries(moduleLabels)
    .filter(([, label]) => Boolean(label))
    .map(([moduleId, label]) => ({
      moduleId,
      label: String(label || moduleId),
    }))

  return {
    generatedAt: new Date().toISOString(),
    workspace: workspaceSlug,
    client: {
      id: tenant.id,
      name: tenant.clientName,
      kind: tenant.kind,
      owner: tenant.owner,
      stage: tenant.stage,
      businessType: tenant.businessType,
      locationCount: tenant.locationCount,
      roleTemplate: tenant.roleTemplate,
    },
    readiness: {
      score: readiness.score,
      label: readiness.label,
      reason: readiness.reason,
    },
    rolePolicy: {
      templateLabel: POS_SALES_ROLE_TEMPLATE_LABELS[tenant.roleTemplate],
      templateSummary: POS_SALES_ROLE_TEMPLATE_SUMMARY[tenant.roleTemplate],
      availableRoles: roleCatalog.map((role) => role.label),
    },
    launchGate: {
      contractStatus: tenant.contractStatus,
      billingStatus: tenant.billingStatus,
      stage: tenant.stage,
    },
    moduleScope,
    deploymentDefaults: {
      deploymentEnvironment: defaultDeploymentEnvironment(
        tenant.stage === 'go-live'
          ? 'live'
          : tenant.stage === 'pilot'
            ? 'pilot'
            : 'setup',
      ),
      autoLockMinutes,
      canExportExcel: true,
      canExportJson: true,
    },
  }
}

function buildHandoffQueueItem(
  tenant: PosSalesTenantRecord,
  workspaceSlug: string,
  autoLockMinutes: number,
): PosHandoffPacketQueueItem {
  const payload = buildSalesProvisioningPacket(tenant, workspaceSlug, autoLockMinutes)
  return {
    id: `${tenant.id}:${tenant.stage}:${tenant.updatedAt || payload.generatedAt}`,
    tenantId: tenant.id,
    tenantName: tenant.clientName,
    stage: tenant.stage,
    generatedAt: payload.generatedAt,
    payload,
  }
}

function mapSalesStageToGoLiveStatus(stage: PosSalesStage): 'setup' | 'pilot' | 'live' {
  if (stage === 'go-live') {
    return 'live'
  }
  if (stage === 'pilot') {
    return 'pilot'
  }
  return 'setup'
}

function buildSalesLaunchExecutionPacket(
  tenant: PosSalesTenantRecord,
  workspaceSlug: string,
  autoLockMinutes: number,
  credentials: { username: string; password: string },
  launchGate: PosSalesLaunchGate,
) {
  const provisioningPacket = buildSalesProvisioningPacket(tenant, workspaceSlug, autoLockMinutes)
  return {
    generatedAt: new Date().toISOString(),
    client: {
      id: tenant.id,
      name: tenant.clientName,
      businessType: tenant.businessType,
      stage: tenant.stage,
      owner: tenant.owner,
      locations: tenant.locationCount,
    },
    login: {
      url: 'https://pos.supermega.dev/pos/login',
      username: credentials.username,
      password: credentials.password,
      nextStep: 'Sign in, select role, run role-specific smoke, then lock shared terminal safety.',
    },
    deployment: {
      status: mapSalesStageToGoLiveStatus(tenant.stage),
      launchGate,
      checklist: [
        'Run lint/build/smoke before release',
        'Alias pos.supermega.dev to ready deployment',
        'Run role + sync + export smoke on mobile and desktop',
      ],
      packet: provisioningPacket,
    },
    outsourcedSales: {
      laneOwner: tenant.owner,
      model: [
        'Lead qualification (business type + location count + pain points)',
        'Demo scheduling (role-focused flow for owner and operator)',
        'Implementation handoff (credentials + packet + training slot)',
        'Go-live follow-up (daily KPI + sync health + support SLA)',
      ],
      kpis: ['leads_created', 'demos_booked', 'pilot_starts', 'go_live_signoffs', 'week1_retention'],
    },
  }
}

function downloadJsonFile(fileName: string, payload: unknown) {
  if (typeof window === 'undefined') {
    return
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.URL.revokeObjectURL(url)
}

function downloadTextFile(fileName: string, text: string, type = 'text/plain') {
  if (typeof window === 'undefined') {
    return
  }
  const blob = new Blob([text], { type })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.URL.revokeObjectURL(url)
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function parseMmkAmount(value: string) {
  const normalized = String(value || '').replace(/[^0-9.]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function formatMmk(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString('en-US')} MMK`
}

function buildInvoiceNumber(workspaceScopeKey: string) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const scope = slugifyInviteToken(workspaceScopeKey).slice(0, 10) || 'pos'
  return `SMG-${day}-${scope}-${Date.now().toString().slice(-5)}`
}

function openPrintableDocument(html: string, fileName: string) {
  if (typeof window === 'undefined') {
    return false
  }
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=460,height=760')
  if (!printWindow) {
    downloadTextFile(fileName, html, 'text/html')
    return false
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  window.setTimeout(() => {
    try {
      printWindow.focus()
      printWindow.print()
    } catch {
      downloadTextFile(fileName, html, 'text/html')
    }
  }, 150)
  return true
}

function slugifyInviteToken(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildInvitePassword() {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase()
  const numeric = Math.floor(Math.random() * 90 + 10).toString()
  return `Smg#${token}${numeric}`
}

const POS_PILOT_OPERATOR_ROLE: Record<PosBusinessType, PosUserRole> = {
  restaurant: 'cashier',
  spa: 'front-desk',
  retail: 'inventory-clerk',
}

function getPilotSetupRolesForBusiness(businessType: PosBusinessType) {
  const catalogRoles = new Set(getPosRoleCatalogForBusiness(businessType).map((role) => role.id))
  const preferredRoles: PosUserRole[] = ['owner', 'manager', POS_PILOT_OPERATOR_ROLE[businessType], 'auditor']
  return preferredRoles.filter((role, index, roles) => roles.indexOf(role) === index && catalogRoles.has(role))
}

function buildPilotReadyTenant(tenant: PosSalesTenantRecord, updatedAt: string): PosSalesTenantRecord {
  return {
    ...tenant,
    stage: 'pilot',
    status: 'active',
    contractStatus: 'signed',
    billingStatus: tenant.billingStatus === 'active' ? 'active' : 'trial',
    kind: 'client',
    updatedAt,
  }
}

function buildPilotRoleInviteRecord(
  tenant: PosSalesTenantRecord,
  role: PosUserRole,
  createdAt: string,
): PosSalesRoleInviteRecord {
  const clientSlug = slugifyInviteToken(tenant.clientName) || slugifyInviteToken(tenant.id) || 'client'
  const roleSlug = slugifyInviteToken(role) || 'role'
  const roleProfile = getPosRoleProfile(role, tenant.businessType)
  const inviteeName = `${roleProfile?.label || role} Pilot User`
  const inviteeEmail = `${clientSlug}.${roleSlug}@pilot.clients.pos.supermega.dev`
  return {
    id: `${tenant.id}:${role}:${inviteeEmail}`,
    tenantId: tenant.id,
    tenantName: tenant.clientName,
    businessType: tenant.businessType,
    role,
    inviteeName,
    inviteeEmail,
    username: `role.${roleSlug}.${clientSlug}.pilot@clients.pos.supermega.dev`,
    temporaryPassword: buildInvitePassword(),
    status: 'generated',
    createdAt,
  }
}

function getTenantSlug(value: string) {
  return slugifyInviteToken(value) || 'client'
}

function getProvisionedAccountsForTenant(accounts: PosProvisionedAccountRecord[], tenant: PosSalesTenantRecord) {
  const clientName = tenant.clientName.trim().toLowerCase()
  return accounts.filter((account) => account.companyName.trim().toLowerCase() === clientName)
}

function getPrimaryClientAccountForTenant(accounts: PosProvisionedAccountRecord[]) {
  return accounts.find((account) => account.roles.includes('owner'))
    || accounts.find((account) => account.roles.includes('manager'))
    || accounts[0]
    || null
}

function getRecommendedSalesOfferForTenant(tenant: PosSalesTenantRecord) {
  if (tenant.locationCount > 1 || tenant.stage === 'go-live') {
    return POS_SALES_OFFER_PACKAGES.find((offer) => offer.id === 'launch-pack') || POS_SALES_OFFER_PACKAGES[1]
  }
  return POS_SALES_OFFER_PACKAGES.find((offer) => offer.id === 'pilot-setup') || POS_SALES_OFFER_PACKAGES[0]
}

function buildPosClientProposal(input: {
  tenant: PosSalesTenantRecord
  readiness: ReturnType<typeof getSalesTenantReadiness>
  launchGate: PosSalesLaunchGate
  loginUrl: string
}) {
  const businessProfile = getPosBusinessProfile(input.tenant.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const recommendedOffer = getRecommendedSalesOfferForTenant(input.tenant)
  const managedOffer = POS_SALES_OFFER_PACKAGES.find((offer) => offer.id === 'managed-ops') || POS_SALES_OFFER_PACKAGES[2]
  const roleTemplate = POS_SALES_ROLE_TEMPLATE_LABELS[input.tenant.roleTemplate]
  const setupStatus = input.launchGate.status === 'ready'
    ? 'Ready to schedule owner handoff after setup data is confirmed.'
    : input.launchGate.status === 'review'
      ? 'Good pilot candidate; confirm the review items before paid launch.'
      : 'Proposal-ready; contract, payment terms, and setup data must be confirmed before launch.'
  const catalogPreview = pilotKit.serviceMenu.slice(0, 6).map((item) => `${item.label}: ${item.value}`)

  return [
    `# SuperMega POS proposal`,
    ``,
    `Client: ${input.tenant.clientName}`,
    `Business pack: ${businessProfile.label}`,
    `Owner/contact: ${input.tenant.owner}`,
    `Location count: ${input.tenant.locationCount}`,
    `Role template: ${roleTemplate}`,
    `Prepared: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `## Recommended package`,
    ``,
    `${recommendedOffer.title}`,
    `Price range: ${recommendedOffer.price}`,
    `Timeline: ${recommendedOffer.cadence}`,
    `Best fit: ${recommendedOffer.buyer}`,
    `Scope: ${recommendedOffer.deliverable}`,
    ``,
    `Optional managed support: ${managedOffer.title} (${managedOffer.price}) for release updates, support incidents, staff changes, backup drills, and owner reporting.`,
    ``,
    `## What the client gets`,
    ``,
    `- POS login after setup: ${input.loginUrl}`,
    `- One simple role-based screen for daily ${businessProfile.label.toLowerCase()} operations.`,
    `- Staff roles for owner, manager, operator, and review/audit access.`,
    `- Starter ${input.tenant.businessType === 'spa' ? 'service' : input.tenant.businessType === 'retail' ? 'product' : 'menu'} catalog loaded from the client intake workbook.`,
    `- Manual cash, wallet/bank reference, invoice, or client-owned external device proof flow.`,
    `- Normal browser printing or Save as PDF for receipts, invoices, and day packs.`,
    `- Launch room, training checklist, and day-one support path.`,
    ``,
    `## Setup focus`,
    ``,
    ...pilotKit.setup.map((item) => `- ${item.label}: ${item.value}`),
    ``,
    `## Starter catalog preview`,
    ``,
    ...catalogPreview.map((item) => `- ${item}`),
    ``,
    `## Setup data needed from client`,
    ``,
    `- Final menu/services/products with prices.`,
    `- Staff list, roles, and approval owners.`,
    `- Payment methods and proof/reference rules.`,
    `- Tax, discount, refund, void, and closeout rules.`,
    `- Device and printer list for browser print testing.`,
    `- Target training and pilot date.`,
    ``,
    `## Onboarding plan`,
    ``,
    ...POS_CLIENT_ONBOARDING_STEPS.map((step) => `- ${step.title} (${step.owner}): ${step.detail}`),
    ``,
    `## Current setup status`,
    ``,
    `Readiness: ${input.readiness.score}% (${input.readiness.label})`,
    `Status note: ${setupStatus}`,
    `Next step: complete the client intake workbook, confirm package scope, then schedule setup and training.`,
    ``,
    `## Boundaries`,
    ``,
    `- Native card-terminal processing is not included unless separately scoped.`,
    `- Silent thermal printing, barcode automation, and cash drawer kick require device-specific implementation.`,
    `- Tax compliance depends on client-approved tax/service-charge rules.`,
    `- AI recommendations do not change money, refunds, inventory, or customer messages without human approval.`,
    ``,
    `## Acceptance criteria`,
    ``,
    `- Owner can sign in and select the approved role.`,
    `- Operator can complete one real-world order, service, or sale.`,
    `- Receipt or invoice can print through the browser or save as PDF.`,
    `- Payment proof/reference is captured for manual or external-device payments.`,
    `- Manager confirms closeout, refund, discount, and support process.`,
  ].join('\n')
}

function buildPosClientUpdateNote(input: {
  tenant: PosSalesTenantRecord
  readiness: ReturnType<typeof getSalesTenantReadiness>
  launchRoomSummary: { score: number; ready: number; review: number; blocked: number }
  aiNativeSummary: ReturnType<typeof summarizeAiNativeCapabilities>
  aiNativeGaps: ReturnType<typeof getPosAiNativeCapabilities>
  loginUrl: string
}) {
  const businessProfile = getPosBusinessProfile(input.tenant.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const recommendedOffer = getRecommendedSalesOfferForTenant(input.tenant)
  const nextAiItems = input.aiNativeGaps.slice(0, 3)
  const setupFocus = pilotKit.setup.slice(0, 5).map((item) => `${item.label}: ${item.value}`)

  return [
    '# SuperMega POS client update note',
    '',
    `Client: ${input.tenant.clientName}`,
    `Business pack: ${businessProfile.label}`,
    `Owner/contact: ${input.tenant.owner}`,
    `Prepared: ${new Date().toISOString().slice(0, 10)}`,
    `Login: ${input.loginUrl}`,
    '',
    '## What changed',
    '',
    '- POS is focused on one client workspace with role-based daily operations.',
    '- Client users see POS, Setup, and Help. Internal setup tools stay with SuperMega.',
    '- Manual cash, wallet/bank reference, invoice, and external-device proof flows are ready for pilot use.',
    '- Receipt and invoice printing use the normal browser print dialog or Save as PDF.',
    '- Excel and JSON exports are available for owner review, setup, closeout, support, and launch records.',
    '',
    '## Current readiness',
    '',
    `- Setup readiness: ${input.readiness.score}% (${input.readiness.label}).`,
    `- Launch room: ${input.launchRoomSummary.score}% (${input.launchRoomSummary.ready} ready / ${input.launchRoomSummary.review} review / ${input.launchRoomSummary.blocked} review items).`,
    `- Recommended package: ${recommendedOffer.title} (${recommendedOffer.price}).`,
    '',
    '## Client testing checklist',
    '',
    `1. Open ${input.loginUrl} on the main phone, tablet, or desktop.`,
    '2. Sign in with the assigned username from SuperMega.',
    '3. Select the correct role for owner, manager, operator, front desk, inventory, or review.',
    `4. Run one real ${input.tenant.businessType === 'spa' ? 'booking or service checkout' : input.tenant.businessType === 'retail' ? 'counter sale or stock check' : 'order or payment proof'} flow.`,
    '5. Print or Save as PDF for one receipt, invoice, or daily record.',
    '6. Export the owner closeout brief and confirm the support contact.',
    '',
    '## Setup still needed from client',
    '',
    ...setupFocus.map((item) => `- ${item}`),
    '- Final staff list, approval owners, and device/printer list.',
    '- Final payment proof rules, tax/service-charge rules, and closeout owner.',
    '',
    '## AI-native operating layer',
    '',
    `- Live capability score: ${input.aiNativeSummary.score}% (${input.aiNativeSummary.live} live / ${input.aiNativeSummary.build} build / ${input.aiNativeSummary.next} next).`,
    ...(nextAiItems.length
      ? nextAiItems.map((item) => `- Next AI assist: ${item.title} - ${item.detail}`)
      : ['- AI assist is ready for guided owner review and exception summaries.']),
    '',
    '## Not included unless separately scoped',
    '',
    '- Native card-terminal processing.',
    '- Silent thermal printing, cash drawer kick, or barcode automation.',
    '- Autonomous refund, discount, stock, payment, or customer-message changes.',
    '- Legal/tax advice beyond the client-approved operating rules.',
    '',
    '## Support path',
    '',
    'Send the issue, device, role, screenshot, and expected result to the assigned SuperMega contact.',
    'This note does not include passwords or internal implementation details.',
  ].join('\n')
}

function buildPosSetupCopilot(input: {
  tenant: PosSalesTenantRecord
  readiness: ReturnType<typeof getSalesTenantReadiness>
  launchGate: PosSalesLaunchGate
  launchRoomGates: PosClientLaunchRoomGate[]
  launchRoomSummary: { score: number; ready: number; review: number; blocked: number }
  roleInviteCount: number
  provisionedAccountCount: number
  handoffPacketCount: number
  aiNativeSummary: ReturnType<typeof summarizeAiNativeCapabilities>
  aiNativeGaps: ReturnType<typeof getPosAiNativeCapabilities>
  loginUrl: string
}) {
  const businessProfile = getPosBusinessProfile(input.tenant.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const catalogKind = input.tenant.businessType === 'spa'
    ? 'services, rooms/chairs, therapist ownership, packages, and retail add-ons'
    : input.tenant.businessType === 'retail'
      ? 'products, categories, SKUs, stock units, suppliers, and return policy'
      : 'menu items, modifiers, tables/zones, kitchen handoff, stock units, and closeout policy'
  const openGates = input.launchRoomGates.filter((gate) => gate.status !== 'ready')
  const blockedGates = input.launchRoomGates.filter((gate) => gate.status === 'blocked')
  const reviewGates = input.launchRoomGates.filter((gate) => gate.status === 'review')
  const launchDecision = blockedGates.length
    ? 'Not ready for client go-live. Close blocked setup items first.'
    : reviewGates.length
      ? 'Ready for guided pilot only. Review open items during training.'
      : 'Ready to schedule guided pilot handoff.'
  const setupItems = [
    {
      status: input.tenant.stage === 'pilot' || input.tenant.stage === 'go-live' ? 'ready' : 'review',
      title: 'Client lane and package',
      owner: 'Sales',
      evidence: `${POS_SALES_STAGE_LABELS[input.tenant.stage]} / ${businessProfile.label} / ${input.tenant.locationCount} location(s).`,
      nextAction: input.tenant.stage === 'lead' || input.tenant.stage === 'discovery'
        ? 'Confirm package, owner, location count, and pilot target date.'
        : 'Keep package scope attached to the launch room.',
    },
    {
      status: input.readiness.score >= 80 ? 'ready' : 'review',
      title: 'Setup data completeness',
      owner: 'Client + SuperMega',
      evidence: `${input.readiness.score}% readiness. Required catalog: ${catalogKind}.`,
      nextAction: 'Collect final catalog, prices, tax/service charge, discount/refund/void rules, and closeout owner.',
    },
    {
      status: input.roleInviteCount > 0 || input.provisionedAccountCount > 0 ? 'ready' : 'blocked',
      title: 'Role login coverage',
      owner: 'SuperMega',
      evidence: `${input.roleInviteCount} role invite(s), ${input.provisionedAccountCount} provisioned account(s).`,
      nextAction: input.roleInviteCount > 0 || input.provisionedAccountCount > 0
        ? 'Send approved username/start message only through the agreed owner channel.'
        : 'Provision owner/operator role access before training.',
    },
    {
      status: input.handoffPacketCount > 0 ? 'ready' : 'review',
      title: 'Launch room and handoff packet',
      owner: 'Implementation',
      evidence: `${input.handoffPacketCount} handoff packet(s). Launch room ${input.launchRoomSummary.score}%.`,
      nextAction: input.handoffPacketCount > 0
        ? 'Attach launch room, update note, and start message to the client folder.'
        : 'Export launch room, setup copilot, and handoff packet before client training.',
    },
    {
      status: blockedGates.length ? 'blocked' : reviewGates.length ? 'review' : 'ready',
      title: 'Device, payment, and support policy',
      owner: 'Implementation + Client',
      evidence: `${input.launchRoomSummary.ready} ready / ${input.launchRoomSummary.review} review / ${input.launchRoomSummary.blocked} blocked gate(s).`,
      nextAction: openGates[0]?.nextAction || 'Run device/browser print test and support incident rehearsal.',
    },
  ]

  return [
    '# SuperMega POS setup copilot',
    '',
    `Client: ${input.tenant.clientName}`,
    `Business pack: ${businessProfile.label}`,
    `Owner/contact: ${input.tenant.owner}`,
    `Prepared: ${new Date().toISOString()}`,
    `Login after provisioning: ${input.loginUrl}`,
    '',
    '## Launch decision',
    '',
    launchDecision,
    '',
    '## Setup score',
    '',
    `- Readiness: ${input.readiness.score}% (${input.readiness.label}).`,
    `- Launch room: ${input.launchRoomSummary.score}% (${input.launchRoomSummary.ready} ready / ${input.launchRoomSummary.review} review / ${input.launchRoomSummary.blocked} blocked).`,
    `- Launch gate: ${input.launchGate.status.toUpperCase()} - ${input.launchGate.summary}`,
    `- AI-native layer: ${input.aiNativeSummary.score}% live (${input.aiNativeSummary.live} live / ${input.aiNativeSummary.build} build / ${input.aiNativeSummary.next} next).`,
    '',
    '## What to collect before launch',
    '',
    `- Final ${catalogKind}.`,
    '- Staff roster, role owner, PIN policy, and approval owners.',
    '- Payment proof policy for cash, wallet/bank, invoice, or external device.',
    '- Printer/device list and one successful browser print or Save as PDF test.',
    '- Refund, void, discount, stock adjustment, complaint, and closeout approval rules.',
    '- Support owner, escalation channel, and first-week review time.',
    '',
    '## Copilot checklist',
    '',
    ...setupItems.flatMap((item) => [
      `- [${item.status.toUpperCase()}] ${item.title}`,
      `  Owner: ${item.owner}`,
      `  Evidence: ${item.evidence}`,
      `  Next: ${item.nextAction}`,
    ]),
    '',
    '## Current business-pack starter data',
    '',
    ...pilotKit.serviceMenu.slice(0, 8).map((item) => `- ${item.label}: ${item.value}${item.note ? ` (${item.note})` : ''}`),
    '',
    '## Open launch-room gates',
    '',
    ...(openGates.length
      ? openGates.map((gate) => `- [${gate.status.toUpperCase()}] ${gate.label} / ${gate.owner}: ${gate.nextAction}`)
      : ['- No open launch-room gates in this setup view.']),
    '',
    '## AI-native next actions',
    '',
    ...(input.aiNativeGaps.length
      ? input.aiNativeGaps.slice(0, 4).map((item) => `- [${item.status.toUpperCase()}] ${item.title}: ${item.detail}`)
      : ['- No AI-native gaps in this business-pack view.']),
    '',
    '## Human approval boundary',
    '',
    '- AI can suggest setup gaps, operating risks, owner briefs, and next actions.',
    '- AI must not change payments, refunds, discounts, stock, customer messages, roles, or launch approval without a human owner.',
  ].join('\n')
}

function buildPosClientHardwareReadiness(input: {
  tenant: PosSalesTenantRecord
  paymentOption: { id: PosEnterprisePaymentMode; label: string; detail: string; setup: 'client' | 'supermega' }
  printerOption: { id: PosEnterprisePrinterMode; label: string; detail: string; setup: 'client' | 'supermega' }
  offlineOption: { id: PosEnterpriseOfflinePolicy; label: string; detail: string }
  businessDevicePolicy: { lane: string; requirement: string; acceptance: string; fallback: string }
  loginUrl: string
}) {
  const businessProfile = getPosBusinessProfile(input.tenant.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const businessChecklist = input.tenant.businessType === 'spa'
    ? [
        '- Front desk device can open booking, service queue, checkout, and daily closeout.',
        '- Therapist phone/tablet can be used for handover notes if the client wants therapist updates.',
        '- One receipt or invoice is printed or saved for a real appointment flow.',
      ]
    : input.tenant.businessType === 'retail'
      ? [
          '- Counter device can search items and complete one sale with proof reference.',
          '- Optional barcode scanner is tested as keyboard input before go-live.',
          '- Receiving/manager device can create one stock note and export a closeout pack.',
        ]
      : [
          '- Counter device can create one order and record payment proof.',
          '- Optional kitchen/tablet screen is tested only after the counter flow is accepted.',
          '- Manager device can review queue, exceptions, and closeout before end of day.',
        ]
  const supermegaHardwareScope = [
    'Hardware implementation policy, device acceptance checks, and support handoff.',
    'Direct silent thermal printing, scanner automation, and cash drawer integration beyond browser print if requested later.',
    'Backup/export validation, support rehearsal, release approval, and post-launch smoke evidence.',
    'Client setup changes, role requests, training notes, and approved operating-rule updates.',
  ]

  return [
    '# SuperMega POS hardware readiness',
    '',
    `Client: ${input.tenant.clientName}`,
    `Business pack: ${businessProfile.label}`,
    `Owner/contact: ${input.tenant.owner}`,
    `Prepared: ${new Date().toISOString()}`,
    `Login after provisioning: ${input.loginUrl}`,
    '',
    '## Hardware decision',
    '',
    'Pilot-ready setup uses browser-based POS, normal browser printing or Save as PDF, and manual payment proof capture.',
    'Direct integrations can be added later, but they should not block the first client launch if the manual proof flow is accepted.',
    '',
    '## Recommended starting setup',
    '',
    `- Payment mode: ${input.paymentOption.label} - ${input.paymentOption.detail}`,
    `- Printer mode: ${input.printerOption.label} - ${input.printerOption.detail}`,
    `- Offline policy: ${input.offlineOption.label} - ${input.offlineOption.detail}`,
    `- Business device lane: ${input.businessDevicePolicy.lane}.`,
    `- Requirement: ${input.businessDevicePolicy.requirement}`,
    `- Acceptance: ${input.businessDevicePolicy.acceptance}`,
    `- Fallback: ${input.businessDevicePolicy.fallback}`,
    '',
    '## Device checklist',
    '',
    '- Primary POS device: laptop, tablet, or desktop with a modern browser and stable internet.',
    '- Backup device: second browser-capable phone, tablet, or laptop for owner/manager access.',
    '- Printer path: installed office/receipt printer or Save as PDF for invoices, receipts, and day packs.',
    '- Payment proof path: cash count, wallet/bank reference, invoice settlement note, or external card device reference.',
    '- Invoice and receipt path: browser print, Save as PDF, or digital share from the exported file.',
    '- Support evidence path: screenshot, device name, role, expected result, and what happened.',
    ...businessChecklist,
    '',
    '## Acceptance checks',
    '',
    '- Sign in on the primary device and select the approved role.',
    `- Complete one ${pilotKit.serviceMenu[0]?.label || 'sale'} flow using the selected payment proof mode.`,
    '- Print one receipt/invoice or Save as PDF from the browser.',
    '- Export one owner closeout or day pack and confirm the owner can read it.',
    '- Record one support issue for printer, payment, access, or sync rehearsal.',
    '- Confirm the backup device can sign in and view the same business lane.',
    '- Confirm pending items are closed before logout, role switch, or day closeout.',
    '',
    '## Client can self-manage',
    '',
    ...POS_CLIENT_SELF_SERVICE_CONTROLS.map((item) => `- ${item}`),
    '',
    '## SuperMega prepares or implements',
    '',
    ...supermegaHardwareScope.map((item) => `- ${item}`),
    '',
    '## Not included unless separately scoped',
    '',
    '- Native card-terminal processing.',
    '- Silent thermal printing, cash drawer kick, or barcode automation beyond keyboard-style scanner input.',
    '- Automatic customer messages, refund execution, discount approval, or payment settlement without human approval.',
    '- Custom device procurement, on-site networking, or printer driver installation unless added to the service scope.',
    '',
    '## Go-live rule',
    '',
    'If printing fails, use Save as PDF or digital receipt for pilot day and log the printer issue for follow-up.',
    'If payment proof is unclear, stop closeout and ask the owner or manager to approve the reference before final daily close.',
  ].join('\n')
}

function buildPosClientHandoffPack(input: {
  tenant: PosSalesTenantRecord
  readiness: ReturnType<typeof getSalesTenantReadiness>
  launchRoomSummary: { score: number; ready: number; review: number; blocked: number }
  paymentOption: { id: PosEnterprisePaymentMode; label: string; detail: string; setup: 'client' | 'supermega' }
  printerOption: { id: PosEnterprisePrinterMode; label: string; detail: string; setup: 'client' | 'supermega' }
  offlineOption: { id: PosEnterpriseOfflinePolicy; label: string; detail: string }
  businessDevicePolicy: { lane: string; requirement: string; acceptance: string; fallback: string }
  aiNativeSummary: ReturnType<typeof summarizeAiNativeCapabilities>
  loginUrl: string
}) {
  const businessProfile = getPosBusinessProfile(input.tenant.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const operatingFlow = input.tenant.businessType === 'spa'
    ? 'appointment, front desk checkout, therapist handover, service queue, and client recovery'
    : input.tenant.businessType === 'retail'
      ? 'counter checkout, product lookup, stock note, receiving handover, and daily close'
      : 'counter order, table/takeaway flow, kitchen handoff, stock note, and daily close'
  const roleNotes = getPosRoleCatalogForBusiness(input.tenant.businessType)

  return [
    '# SuperMega POS client handoff pack',
    '',
    `Client: ${input.tenant.clientName}`,
    `Business pack: ${businessProfile.label}`,
    `Owner/contact: ${input.tenant.owner}`,
    `Prepared: ${new Date().toISOString()}`,
    `Login URL: ${input.loginUrl}`,
    '',
    '## Purpose',
    '',
    'This pack is the client-ready day-one guide for owner training, operator handoff, device checks, and support rehearsal.',
    'Use the approved username and first-login message from SuperMega separately. This pack does not include passwords.',
    '',
    '## Day-one operating flow',
    '',
    `- Focus workflow: ${operatingFlow}.`,
    `- Readiness: ${input.readiness.score}% (${input.readiness.label}).`,
    `- Launch prep: ${input.launchRoomSummary.score}% (${input.launchRoomSummary.ready} ready / ${input.launchRoomSummary.review} review / ${input.launchRoomSummary.blocked} blocked).`,
    `- AI operating layer: ${input.aiNativeSummary.score}% live (${input.aiNativeSummary.live} live / ${input.aiNativeSummary.build} build / ${input.aiNativeSummary.next} next).`,
    '',
    '## First login checklist',
    '',
    '- Open the login URL in a modern browser on the primary POS device.',
    '- Enter the assigned username exactly as provided by SuperMega.',
    '- Select the approved role for owner, manager, operator, front desk, inventory, or review.',
    '- Confirm the visible business name and location before entering real data.',
    '- Keep the backup device ready before pilot day starts.',
    '',
    '## Training checklist',
    '',
    `- Run one ${pilotKit.serviceMenu[0]?.label || 'sale'} flow from open item to closeout note.`,
    '- Record one cash, wallet/bank, invoice, or external device reference.',
    '- Print one receipt/invoice or Save as PDF from the browser.',
    '- Add one staff/role setup note and confirm the owner knows where support lives.',
    '- Export one owner closeout or day pack before ending the rehearsal.',
    '- Create one support rehearsal note with device, role, screenshot, expected result, and actual result.',
    '',
    '## Payment and printing rules',
    '',
    `- Payment path: ${input.paymentOption.label}. ${input.paymentOption.detail}`,
    `- Print path: ${input.printerOption.label}. ${input.printerOption.detail}`,
    `- Offline rule: ${input.offlineOption.label}. ${input.offlineOption.detail}`,
    '- Payment proof must be approved by the owner or manager before final daily close.',
    '- If printing fails, use Save as PDF or digital receipt for the pilot and log the issue for follow-up.',
    '',
    '## Device acceptance',
    '',
    `- Device lane: ${input.businessDevicePolicy.lane}.`,
    `- Minimum requirement: ${input.businessDevicePolicy.requirement}`,
    `- Acceptance check: ${input.businessDevicePolicy.acceptance}`,
    `- Fallback mode: ${input.businessDevicePolicy.fallback}`,
    '',
    '## Role guide',
    '',
    ...roleNotes.map((role) => `- ${role.label}: ${role.summary}`),
    '',
    '## Starter items for walkthrough',
    '',
    ...pilotKit.serviceMenu.slice(0, 6).map((item) => `- ${item.label}: ${item.value}${item.note ? ` (${item.note})` : ''}`),
    '',
    '## Client can do without engineering',
    '',
    '- Use the POS, Setup, and Help screens for daily operation.',
    '- Record payment references and daily notes.',
    '- Print or Save as PDF through the browser.',
    '- Export closeout and day-pack files where the role allows.',
    '- Request staff, catalog, policy, or workflow changes through SuperMega support.',
    '',
    '## Send separately',
    '',
    '- Approved username and first-login message.',
    '- Client intake workbook if setup data is still missing.',
    '- Client update note after each patch, setup change, or pilot milestone.',
    '- Any approved price, tax, discount, refund, or closeout policy changes.',
    '',
    '## Not included unless separately scoped',
    '',
    '- Native card-terminal processing.',
    '- Silent thermal printing, cash drawer kick, scanner automation, or device procurement.',
    '- Autonomous refunds, discounts, stock changes, customer messages, or payment settlement.',
    '- Legal, tax, or accounting advice beyond the client-approved operating rules.',
    '',
    '## Support path',
    '',
    'Send the business name, role, device, screenshot, expected result, actual result, and urgency to the assigned SuperMega contact.',
  ].join('\n')
}

function buildPosClientStartMessage(input: {
  tenant: PosSalesTenantRecord
  accounts: PosProvisionedAccountRecord[]
  launchRoomSummary: { score: number; ready: number; review: number; blocked: number }
  loginUrl: string
}) {
  const businessProfile = getPosBusinessProfile(input.tenant.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const primaryAccount = getPrimaryClientAccountForTenant(input.accounts)
  const roleLine = primaryAccount?.roles?.length
    ? primaryAccount.roles.map((role) => getPosRoleProfile(role, input.tenant.businessType)?.label || role).join(', ')
    : POS_SALES_ROLE_TEMPLATE_LABELS[input.tenant.roleTemplate]
  const credentialLines = primaryAccount
    ? [
      `Username: ${primaryAccount.username}`,
      `First-login password: ${primaryAccount.password}`,
      `Workspace: ${primaryAccount.companyName}`,
      `Role access: ${roleLine}`,
    ]
    : [
      'Username: pending - SuperMega will send it after provisioning.',
      'First-login password: pending - SuperMega will send it through the approved channel.',
      `Workspace: ${input.tenant.clientName}`,
      `Role access: ${roleLine}`,
    ]

  return [
    `SuperMega POS start message`,
    ``,
    `Client: ${input.tenant.clientName}`,
    `Business pack: ${businessProfile.label}`,
    `Owner/contact: ${input.tenant.owner}`,
    `Location count: ${input.tenant.locationCount}`,
    `Launch readiness: ${input.launchRoomSummary.score}% (${input.launchRoomSummary.ready} ready / ${input.launchRoomSummary.review} review / ${input.launchRoomSummary.blocked} blocked)`,
    ``,
    `Login`,
    `Open: ${input.loginUrl}`,
    ...credentialLines,
    ``,
    `First 10 minutes`,
    `1. Open the login link on the main phone/tablet/desktop.`,
    `2. Sign in with the username above.`,
    `3. Select the role requested by the owner or manager.`,
    `4. Open POS and run one sample ${input.tenant.businessType === 'spa' ? 'booking or service checkout' : input.tenant.businessType === 'retail' ? 'counter sale or stock check' : 'order or payment proof'} flow.`,
    `5. Open Setup only for staff/role changes and PIN readiness.`,
    `6. Open Help if the team needs the quick manual.`,
    ``,
    `Client setup focus`,
    `- ${pilotKit.setup.map((item) => `${item.label}: ${item.value}`).join('\n- ')}`,
    ``,
    `Payment and printing`,
    `- Use manual cash, wallet/bank proof, invoice, or client-owned external device proof as approved during setup.`,
    `- Print receipts or invoices through the normal browser print dialog on an installed printer.`,
    `- If printing is not ready, use Save as PDF or digital receipt until hardware is confirmed.`,
    ``,
    `Training checklist`,
    `- Owner confirms staff roles and approval rules.`,
    `- Operator runs one real-world order/service/sale with SuperMega watching.`,
    `- Manager confirms discount, refund, void, tax/service charge, and closeout policy.`,
    `- Team confirms the support contact and first-day review time.`,
    ``,
    `Support`,
    `Reply to your SuperMega contact with the device, role, screenshot, and what you expected to happen.`,
    `Do not share this message publicly. Rotate this first-login password after the first live handoff.`,
  ].join('\n')
}

function buildPosClientLaunchBrief(input: {
  tenant: PosSalesTenantRecord
  readiness: ReturnType<typeof getSalesTenantReadiness>
  launchGate: PosSalesLaunchGate
  launchRoomGates: PosClientLaunchRoomGate[]
  launchRoomSummary: { score: number; ready: number; review: number; blocked: number }
  provisionedAccountCount: number
  roleInviteCount: number
  handoffPacketCount: number
  cloudMode: 'unknown' | 'cloud' | 'local'
  loginUrl: string
}) {
  const businessProfile = getPosBusinessProfile(input.tenant.businessType)
  const pilotKit = POS_VERTICAL_PILOT_KITS[input.tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const recommendedOffer = getRecommendedSalesOfferForTenant(input.tenant)
  const openGates = input.launchRoomGates.filter((gate) => gate.status !== 'ready')
  const nextAction =
    openGates[0]?.nextAction
    || input.launchGate.blockers[0]
    || input.launchGate.reviewItems[0]
    || 'Schedule owner/operator walkthrough and attach launch room to the client folder.'
  const clientSafeAssets = [
    'Client proposal',
    'Client intake workbook',
    'Client start message after provisioning',
    'Client manual',
    'Login URL and assigned username',
  ]
  const internalAssets = [
    'Launch room Excel',
    'Sales AI handoff JSON',
    'Control-plane/client registry exports',
    'Role invite reset notes',
    'Support, backup, deployment, and smoke evidence',
  ]

  return [
    '# SuperMega POS launch brief',
    '',
    `Client: ${input.tenant.clientName}`,
    `Business pack: ${businessProfile.label}`,
    `Owner/contact: ${input.tenant.owner}`,
    `Stage: ${POS_SALES_STAGE_LABELS[input.tenant.stage]}`,
    `Recommended offer: ${recommendedOffer.title} (${recommendedOffer.price})`,
    `Login: ${input.loginUrl}`,
    `Prepared: ${new Date().toISOString()}`,
    '',
    '## Decision',
    '',
    `Sales readiness: ${input.readiness.score}% / ${input.readiness.label}`,
    `Launch gate: ${input.launchGate.status.toUpperCase()} - ${input.launchGate.summary}`,
    `Launch room: ${input.launchRoomSummary.score}% (${input.launchRoomSummary.ready} ready / ${input.launchRoomSummary.review} review / ${input.launchRoomSummary.blocked} blocked)`,
    `Cloud control plane: ${input.cloudMode}`,
    `Provisioned accounts: ${input.provisionedAccountCount}`,
    `Role invites: ${input.roleInviteCount}`,
    `Handoff packets: ${input.handoffPacketCount}`,
    '',
    '## Sales team next action',
    '',
    nextAction,
    '',
    '## Client-safe handoff assets',
    '',
    ...clientSafeAssets.map((asset) => `- ${asset}`),
    '',
    '## Internal-only assets',
    '',
    ...internalAssets.map((asset) => `- ${asset}`),
    '',
    '## Setup scope',
    '',
    ...pilotKit.setup.map((item) => `- ${item.label}: ${item.value}`),
    '',
    '## Open launch gates',
    '',
    ...(openGates.length
      ? openGates.map((gate) => `- [${gate.status.toUpperCase()}] ${gate.label} / ${gate.owner}: ${gate.nextAction}`)
      : ['- No open launch gates in this launch-room view.']),
    '',
    '## Do not promise yet',
    '',
    '- Durable production history/SLA until the strict enterprise database gate passes.',
    '- Native card-terminal processing unless separately scoped.',
    '- Silent thermal printing, barcode automation, or cash drawer kick without device implementation.',
    '- Autonomous money, refund, stock, or customer-message changes without human approval.',
    '',
    '## Go-live commands',
    '',
    '```powershell',
    'npm run smoke:pos-host -- https://pos.supermega.dev',
    'npm run smoke:pos-handoff -- https://pos.supermega.dev',
    'npm run smoke:pos-enterprise -- https://pos.supermega.dev',
    '```',
  ].join('\n')
}

function buildClientLaunchRoomGates(input: {
  tenant: PosSalesTenantRecord
  invites: PosSalesRoleInviteRecord[]
  handoffPackets: PosHandoffPacketQueueItem[]
  accounts: PosProvisionedAccountRecord[]
  cloudMode: 'unknown' | 'cloud' | 'local'
  auditEvents: PosAuditEventRow[]
  syncSummary: ReturnType<typeof summarizePosSyncLedger>
  staffDirectory: PosStaffMember[]
  autoLockMinutes: number
  deploymentGateSummary: { ready: number; review: number; blocked: number }
}): PosClientLaunchRoomGate[] {
  const {
    tenant,
    invites,
    handoffPackets,
    accounts,
    cloudMode,
    auditEvents,
    syncSummary,
    staffDirectory,
    autoLockMinutes,
    deploymentGateSummary,
  } = input
  const provisionedAccounts = getProvisionedAccountsForTenant(accounts, tenant)
  const handoffReady = handoffPackets.some((packet) => packet.tenantId === tenant.id)
  const requiredRoles = getPilotSetupRolesForBusiness(tenant.businessType)
  const inviteRoles = new Set(invites.filter((invite) => invite.tenantId === tenant.id).map((invite) => invite.role))
  const accountRoles = new Set(provisionedAccounts.flatMap((account) => account.roles))
  const coveredRoles = requiredRoles.filter((role) => inviteRoles.has(role) || accountRoles.has(role))
  const billingReady = tenant.billingStatus === 'active'
  const billingReview = tenant.billingStatus === 'trial'
  const commercialReady = tenant.contractStatus === 'signed' && (billingReady || billingReview)
  const syncClean = syncSummary.queued === 0 && syncSummary.failed === 0
  const hasAuditEvidence = auditEvents.length > 0
  const hasStaffPolicy = staffDirectory.length > 0 || coveredRoles.length >= Math.min(requiredRoles.length, 2)

  return [
    {
      id: 'commercial-contract',
      label: 'Commercial contract and billing',
      status: commercialReady ? (billingReady ? 'ready' : 'review') : 'blocked',
      owner: 'Sales lead',
      evidence: `Contract ${tenant.contractStatus}; billing ${tenant.billingStatus}.`,
      nextAction: commercialReady ? 'Confirm first invoice, subscription plan, and renewal owner.' : 'Sign contract and configure trial or active billing before go-live.',
    },
    {
      id: 'tenant-auth',
      label: 'Tenant auth and owner login',
      status: provisionedAccounts.length > 0 ? 'ready' : tenant.stage === 'pilot' ? 'review' : 'blocked',
      owner: 'Implementation',
      evidence: `${provisionedAccounts.length} provisioned account(s) for this tenant.`,
      nextAction: provisionedAccounts.length > 0 ? 'Owner signs in and selects role on mobile and desktop.' : 'Run Start pilot setup or Provision login for the client lane.',
    },
    {
      id: 'role-coverage',
      label: 'Role credentials and staff lanes',
      status: coveredRoles.length >= requiredRoles.length ? 'ready' : coveredRoles.length > 0 ? 'review' : 'blocked',
      owner: 'Implementation',
      evidence: `${coveredRoles.length} of ${requiredRoles.length} required role(s) covered: ${coveredRoles.join(', ') || 'none'}.`,
      nextAction: coveredRoles.length >= requiredRoles.length ? 'Reset or rotate role credentials after first login; do not store secrets in launch exports.' : 'Generate owner, manager, operator, and auditor role credentials.',
    },
    {
      id: 'handoff-packet',
      label: 'Handoff packet and launch room',
      status: handoffReady ? 'ready' : 'review',
      owner: 'Delivery',
      evidence: `${handoffPackets.filter((packet) => packet.tenantId === tenant.id).length} handoff packet(s) queued.`,
      nextAction: handoffReady ? 'Attach the launch room workbook to the client folder.' : 'Export handoff packet and launch room workbook.',
    },
    {
      id: 'cloud-sync',
      label: 'Cloud sync and source of truth',
      status: cloudMode === 'cloud' && syncClean ? 'ready' : cloudMode === 'cloud' ? 'review' : 'blocked',
      owner: 'Platform',
      evidence: `${cloudMode} mode; queue ${syncSummary.queued}; failed ${syncSummary.failed}.`,
      nextAction: cloudMode === 'cloud' ? 'Clear failed sync items before production switch.' : 'Authenticate cloud workspace and confirm control-plane persistence.',
    },
    {
      id: 'audit-trail',
      label: 'Audit trail and support evidence',
      status: hasAuditEvidence ? 'ready' : 'review',
      owner: 'Support',
      evidence: `${auditEvents.length} POS audit event(s) visible.`,
      nextAction: hasAuditEvidence ? 'Verify provisioning, login, and handoff events in Ops before go-live.' : 'Run login/provisioning/handoff once on cloud to create audit evidence.',
    },
    {
      id: 'payments-tax',
      label: 'Payments, tax, receipt policy',
      status: billingReady ? 'review' : 'blocked',
      owner: 'Finance',
      evidence: `Billing status ${tenant.billingStatus}; manual/external payment proof policy must be approved.`,
      nextAction: 'Approve manual/external payment proof, tax/service charge rules, receipt template, refund/void approval policy.',
    },
    {
      id: 'hardware-offline',
      label: 'Hardware and offline policy',
      status: autoLockMinutes > 0 && syncClean ? 'review' : 'blocked',
      owner: 'Implementation',
      evidence: `Auto-lock ${autoLockMinutes ? `${autoLockMinutes} min` : 'off'}; sync queue ${syncSummary.queued} queued / ${syncSummary.failed} failed.`,
      nextAction: 'Export hardware policy, run printer/device/offline acceptance checks, and close shared-terminal auto-lock before paid launch.',
    },
    {
      id: 'backup-restore',
      label: 'Backup, restore, and data export',
      status: cloudMode === 'cloud' && handoffReady ? 'review' : 'blocked',
      owner: 'Platform',
      evidence: `${cloudMode} mode; launch packet ${handoffReady ? 'queued' : 'missing'}.`,
      nextAction: 'Schedule cloud backup/restore verification and keep Excel/JSON exports in the client folder.',
    },
    {
      id: 'training-support',
      label: 'Training, SLA, and change control',
      status: hasStaffPolicy && tenant.stage !== 'lead' ? 'review' : 'blocked',
      owner: 'Support',
      evidence: `${staffDirectory.length} staff record(s); tenant stage ${tenant.stage}.`,
      nextAction: 'Book owner/operator training, define support escalation, and document how patches are shipped.',
    },
    {
      id: 'release-smoke',
      label: 'Release smoke and mobile one-page check',
      status: deploymentGateSummary.blocked === 0 ? 'ready' : 'review',
      owner: 'Engineering',
      evidence: `${deploymentGateSummary.ready} deployment gate(s) ready; ${deploymentGateSummary.blocked} blocked.`,
      nextAction: 'Run lint, build, live POS smoke, and mobile screenshot capture after every change.',
    },
  ]
}

function summarizeClientLaunchRoomGates(gates: PosClientLaunchRoomGate[]) {
  const ready = gates.filter((gate) => gate.status === 'ready').length
  const review = gates.filter((gate) => gate.status === 'review').length
  const blocked = gates.filter((gate) => gate.status === 'blocked').length
  return {
    ready,
    review,
    blocked,
    score: gates.length ? Math.round((ready / gates.length) * 100) : 0,
  }
}

function buildSalesAiHandoffPacket(input: {
  tenant: PosSalesTenantRecord
  workspaceSlug: string
  launchGate: PosSalesLaunchGate
  launchRoomGates: PosClientLaunchRoomGate[]
  cloudMode: 'unknown' | 'cloud' | 'local'
  autoLockMinutes: number
  syncSummary: ReturnType<typeof summarizePosSyncLedger>
  deploymentGateSummary: { ready: number; review: number; blocked: number }
}) {
  const {
    tenant,
    workspaceSlug,
    launchGate,
    launchRoomGates,
    cloudMode,
    autoLockMinutes,
    syncSummary,
    deploymentGateSummary,
  } = input
  const businessProfile = getPosBusinessProfile(tenant.businessType)
  const readiness = getSalesTenantReadiness(tenant)
  const launchRoomSummary = summarizeClientLaunchRoomGates(launchRoomGates)
  const launchGaps = launchRoomGates.filter((gate) => gate.status !== 'ready')
  const aiCapabilities = getPosAiNativeCapabilities(tenant.businessType)
  const aiSummary = summarizeAiNativeCapabilities(aiCapabilities)
  const aiGaps = aiCapabilities.filter((capability) => capability.status !== 'live')
  const roleCatalog = getPosRoleCatalogForBusiness(tenant.businessType)
  const moduleLabels = getPosBusinessModuleLabels(tenant.businessType)
  const moduleScope = Object.entries(moduleLabels)
    .filter(([, label]) => Boolean(label))
    .map(([moduleId, label]) => ({ moduleId, label: String(label) }))
  const nextActions = [
    launchGaps[0]?.nextAction,
    aiGaps[0] ? `Assign ${aiGaps[0].owner} to close AI-native lane: ${aiGaps[0].title}.` : '',
    launchGate.blockers[0] ? `Close launch blocker: ${launchGate.blockers[0]}` : '',
    syncSummary.queued || syncSummary.failed ? `Flush sync queue before handoff: ${syncSummary.queued} queued / ${syncSummary.failed} failed.` : '',
    autoLockMinutes > 0 ? '' : 'Turn on shared-terminal auto-lock before paid production.',
    deploymentGateSummary.blocked ? `Resolve ${deploymentGateSummary.blocked} deployment gate(s) before paid production.` : '',
  ].filter((item): item is string => Boolean(item))
  const uniqueNextActions = Array.from(new Set(nextActions)).slice(0, 6)

  return {
    type: 'supermega-pos-sales-ai-handoff',
    generatedAt: new Date().toISOString(),
    workspace: {
      slug: workspaceSlug,
      loginUrl: 'https://pos.supermega.dev/pos/login',
      cloudMode,
    },
    client: {
      id: tenant.id,
      name: tenant.clientName,
      businessType: tenant.businessType,
      businessLabel: businessProfile.label,
      stage: tenant.stage,
      owner: tenant.owner,
      locationCount: tenant.locationCount,
      contractStatus: tenant.contractStatus,
      billingStatus: tenant.billingStatus,
      roleTemplate: tenant.roleTemplate,
    },
    salesDecision: {
      motion: launchRoomSummary.blocked > 0 || launchGate.status === 'blocked'
        ? 'Sell as guided pilot / paid setup only'
        : 'Ready for sales handoff review',
      readyForSalesTeam: tenant.stage === 'pilot' || tenant.stage === 'go-live',
      readyForPaidProduction: launchRoomSummary.blocked === 0 && launchGate.status !== 'blocked' && deploymentGateSummary.blocked === 0 && autoLockMinutes > 0,
    },
    readiness: {
      salesScore: readiness.score,
      salesLabel: readiness.label,
      salesReason: readiness.reason,
      launchGate,
      launchRoom: launchRoomSummary,
      topLaunchGaps: launchGaps.slice(0, 5),
    },
    aiNative: {
      score: aiSummary.score,
      summary: aiSummary,
      liveCapabilities: aiCapabilities.filter((capability) => capability.status === 'live'),
      nextGaps: aiGaps.slice(0, 5),
    },
    operatingSystem: {
      roles: roleCatalog.map((role) => ({ id: role.id, label: role.label })),
      modules: moduleScope,
      manualPaymentsReady: true,
      normalPrinterReady: true,
      excelAndJsonExportsReady: true,
    },
    salesTeamTalkTrack: [
      `Lead with ${businessProfile.label} operations: ${businessProfile.summary}`,
      'Show owner role first, then operator/front-desk/cashier workflow.',
      'Explain payments as manual proof or client-owned external device for pilot.',
      'Export launch room, launch certification, hardware policy, and sales AI handoff before training.',
      'Do not promise paid-production enterprise status until blocked gates are cleared.',
    ],
    nextActions: uniqueNextActions.length ? uniqueNextActions : ['Export launch room and schedule owner/operator pilot walkthrough.'],
  }
}

export function PosWorkspacePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const session = loadPosSession()
  const activeLocationStatus = session?.locations.find((location) => location.id === session.activeLocationId)?.status
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(() => loadAutoLockMinutes())
  const [staffDirectory, setStaffDirectory] = useState<PosStaffMember[]>([])
  const [staffName, setStaffName] = useState('')
  const [staffRole, setStaffRole] = useState<PosUserRole>('cashier')
  const [staffLocationId, setStaffLocationId] = useState('')
  const [staffPin, setStaffPin] = useState('')
  const [staffNote, setStaffNote] = useState('')
  const [staffMessage, setStaffMessage] = useState('')
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [deploymentEnvironment, setDeploymentEnvironment] = useState<PosDeploymentEnvironment>(() =>
    defaultDeploymentEnvironment(activeLocationStatus),
  )
  const [deploymentReleaseOwner, setDeploymentReleaseOwner] = useState(() => session?.displayName || 'Owner')
  const [deploymentVersionTag, setDeploymentVersionTag] = useState(() => defaultDeploymentVersionTag())
  const [deploymentMessage, setDeploymentMessage] = useState('')
  const [syncLedger, setSyncLedger] = useState<PosSyncLedgerEntry[]>([])
  const [syncMessage, setSyncMessage] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)
  const [aiNativeMessage, setAiNativeMessage] = useState('')
  const [ownerCloseoutMessage, setOwnerCloseoutMessage] = useState('')
  const [activeSurface, setActiveSurface] = useState<PosWorkspaceSurface>('workspace')
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<PosWorkspaceRuntimeView>('overview')
  const [activeControlPanel, setActiveControlPanel] = useState<PosWorkspaceControlPanel>('overview')
  const [activeSalesPanel, setActiveSalesPanel] = useState<PosSalesPanel>('pipeline')
  const [compactWorkspaceMode, setCompactWorkspaceMode] = useState<PosCompactWorkspaceMode>('snapshot')
  const [compactControlMode, setCompactControlMode] = useState<PosCompactControlMode>('overview')
  const [compactSalesMode, setCompactSalesMode] = useState<PosCompactSalesMode>('pipeline')
  const [selectedWorkspaceModule, setSelectedWorkspaceModule] = useState<PosModuleId | null>(null)
  const [runtimeLoadNonce, setRuntimeLoadNonce] = useState(0)
  const [runtimeLoadSlow, setRuntimeLoadSlow] = useState(false)
  const [salesTenants, setSalesTenants] = useState<PosSalesTenantRecord[]>(() => loadPosSalesTenants())
  const [salesTenantName, setSalesTenantName] = useState('')
  const [salesTenantBusinessType, setSalesTenantBusinessType] = useState<PosBusinessType>(session?.activeBusinessType || 'restaurant')
  const [salesTenantOwner, setSalesTenantOwner] = useState(() => session?.displayName || 'Sales lead')
  const [salesTenantRoleTemplate, setSalesTenantRoleTemplate] = useState<PosSalesRoleTemplate>(() =>
    defaultSalesRoleTemplate(session?.activeBusinessType || 'restaurant'),
  )
  const [salesTenantLocations, setSalesTenantLocations] = useState('1')
  const [salesTenantMessage, setSalesTenantMessage] = useState('')
  const [activeSalesTenantId, setActiveSalesTenantId] = useState('')
  const [salesTenantSyncMessage, setSalesTenantSyncMessage] = useState('')
  const [salesTenantSyncBusy, setSalesTenantSyncBusy] = useState(false)
  const [salesTenantCloudMode, setSalesTenantCloudMode] = useState<'unknown' | 'cloud' | 'local'>('unknown')
  const [posAuditEvents, setPosAuditEvents] = useState<PosAuditEventRow[]>([])
  const [posAuditMessage, setPosAuditMessage] = useState('')
  const [handoffAutoMessage, setHandoffAutoMessage] = useState('')
  const [handoffPacketQueue, setHandoffPacketQueue] = useState<PosHandoffPacketQueueItem[]>([])
  const [roleInvites, setRoleInvites] = useState<PosSalesRoleInviteRecord[]>([])
  const [roleInviteName, setRoleInviteName] = useState('')
  const [roleInviteEmail, setRoleInviteEmail] = useState('')
  const [roleInviteRole, setRoleInviteRole] = useState<PosUserRole>('cashier')
  const [roleInviteBusy, setRoleInviteBusy] = useState(false)
  const [roleInviteMessage, setRoleInviteMessage] = useState('')
  const [pilotSetupBusyTenantId, setPilotSetupBusyTenantId] = useState('')
  const [enterpriseSettings, setEnterpriseSettings] = useState<PosEnterpriseSettings>(() => loadPosEnterpriseSettings())
  const [invoiceCustomer, setInvoiceCustomer] = useState('Walk-in customer')
  const [invoiceService, setInvoiceService] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('45000')
  const [invoiceNote, setInvoiceNote] = useState('Manual payment proof required before closeout.')
  const [enterpriseMessage, setEnterpriseMessage] = useState('')
  const [restoreMessage, setRestoreMessage] = useState('')
  const [restoreDrillResult, setRestoreDrillResult] = useState<PosRestoreDrillResult | null>(null)
  const [supportSeverity, setSupportSeverity] = useState<PosSupportSeverity>('sev2')
  const [supportCategory, setSupportCategory] = useState<PosSupportCategory>('printer')
  const [supportSummary, setSupportSummary] = useState('Printer/invoice test or payment setup question.')
  const [supportResolutionNote, setSupportResolutionNote] = useState('Workaround confirmed or issue resolved.')
  const [supportIncidents, setSupportIncidents] = useState<PosSupportIncidentRow[]>([])
  const [supportDeskMessage, setSupportDeskMessage] = useState('')
  const [supportDeskBusy, setSupportDeskBusy] = useState(false)
  const salesTenantCloudHashRef = useRef('')
  const roleInvitesCloudHashRef = useRef('')
  const handoffPacketCloudHashRef = useRef('')
  const staffDirectoryCloudHashRef = useRef('')
  const controlSettingsCloudHashRef = useRef('')
  const restoreInputRef = useRef<HTMLInputElement | null>(null)
  const [compactViewport, setCompactViewport] = useState(() => detectCompactPosViewport())
  const syncSummary = summarizePosSyncLedger(syncLedger)
  const pendingSyncCount = syncSummary.queued + syncSummary.failed
  const offlineSyncRisk = useMemo(() => getOfflineSyncRisk(syncLedger), [syncLedger])
  const autoLockMs = useMemo(() => (autoLockMinutes > 0 ? autoLockMinutes * 60 * 1000 : 0), [autoLockMinutes])
  const workspaceScopeKeyCandidate = session ? getPosWorkspaceScopeKey(session) : 'pos-default'
  const sessionScopeSignature = session
    ? [
      session.username,
      session.workspaceSlug,
      session.activeRole || '',
      session.activeBusinessType,
      session.activeLocationId,
      session.roles.join(','),
      session.locations.map((location) => `${location.id}:${location.status}`).join('|'),
    ].join('::')
    : ''
  const isInternalOperator = session ? isSuperMegaInternalPosSession(session) : false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableSession = useMemo(() => session, [sessionScopeSignature])
  const locationOptions = useMemo(() => getPosLocationCatalog(session), [session])
  const staffRoleOptions = useMemo(() => {
    if (!session) {
      return []
    }
    const businessRoles = getPosRoleCatalogForBusiness(session.activeBusinessType)
    return businessRoles.filter((role) => session.roles.includes(role.id))
  }, [session])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const surfaceHint = normalizeWorkspaceSurface(params.get('surface'))
    const viewHint = normalizeWorkspaceView(params.get('view'))
    const controlHint = normalizeControlPanel(params.get('control'))
    const salesHint = normalizeSalesPanel(params.get('sales'))
    const compactWorkspaceHint = normalizeCompactWorkspaceMode(params.get('workspace_mode'))
    const compactControlHint = normalizeCompactControlMode(params.get('control_mode'))
    const compactSalesHint = normalizeCompactSalesMode(params.get('sales_mode'))
    const resolvedViewHint = compactViewport && viewHint === 'runtime' ? 'overview' : viewHint
    const roleDefaults = getRoleSurfaceDefaults(session?.activeRole ?? null)
    const requestedSurface = surfaceHint || roleDefaults.surface
    const nextSurface = isWorkspaceSurfaceAvailable(requestedSurface, isInternalOperator) ? requestedSurface : 'workspace'

    setActiveSurface(nextSurface)

    if (resolvedViewHint) {
      setActiveWorkspaceView(resolvedViewHint)
    } else if (nextSurface === 'workspace' && roleDefaults.view) {
      setActiveWorkspaceView(roleDefaults.view)
    }

    if (controlHint && isControlPanelAvailable(controlHint, isInternalOperator)) {
      setActiveControlPanel(controlHint)
    } else if (controlHint && !isControlPanelAvailable(controlHint, isInternalOperator)) {
      setActiveControlPanel('overview')
    } else if (nextSurface === 'control' && roleDefaults.control) {
      setActiveControlPanel(roleDefaults.control)
    } else if (nextSurface === 'control') {
      setActiveControlPanel('overview')
    }

    if (salesHint) {
      setActiveSalesPanel(salesHint)
    } else if (nextSurface === 'sales' && roleDefaults.sales) {
      setActiveSalesPanel(roleDefaults.sales)
    } else if (nextSurface === 'sales') {
      setActiveSalesPanel('pipeline')
    }

    if (compactWorkspaceHint) {
      setCompactWorkspaceMode(compactWorkspaceHint)
    } else if (nextSurface === 'workspace') {
      setCompactWorkspaceMode('snapshot')
    }

    if (compactControlHint && isControlPanelAvailable(compactControlHint, isInternalOperator)) {
      setCompactControlMode(compactControlHint)
    } else if (compactControlHint && !isControlPanelAvailable(compactControlHint, isInternalOperator)) {
      setCompactControlMode('overview')
    } else if (nextSurface === 'control') {
      const roleDefaultControlMode = roleDefaults.control || 'overview'
      setCompactControlMode(roleDefaultControlMode)
    }

    if (compactSalesHint) {
      setCompactSalesMode(compactSalesHint)
    } else if (nextSurface === 'sales') {
      const roleDefaultSalesMode = salesHint || roleDefaults.sales || 'pipeline'
      setCompactSalesMode(roleDefaultSalesMode)
    }
  }, [compactViewport, isInternalOperator, location.search, session?.activeRole])

  useEffect(() => {
    if (compactViewport && activeWorkspaceView === 'runtime') {
      setActiveWorkspaceView('overview')
    }
  }, [activeWorkspaceView, compactViewport])

  useEffect(() => {
    savePosEnterpriseSettings(enterpriseSettings)
  }, [enterpriseSettings])

  useEffect(() => {
    if (!(activeSurface === 'workspace' && activeWorkspaceView === 'runtime')) {
      setRuntimeLoadSlow(false)
      return
    }
    setRuntimeLoadSlow(false)
    const timer = window.setTimeout(() => {
      setRuntimeLoadSlow(true)
    }, 7000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [activeSurface, activeWorkspaceView, runtimeLoadNonce])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(POS_AUTO_LOCK_STORAGE_KEY, String(autoLockMinutes))
    } catch {
      // Ignore storage issues in restricted environments.
    }
  }, [autoLockMinutes])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const widthQuery = window.matchMedia('(max-width: 1024px)')
    const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)')
    const syncCompactViewport = () => syncCompactPosViewportFlag(setCompactViewport)
    const visualViewport = window.visualViewport
    syncCompactViewport()
    widthQuery.addEventListener('change', syncCompactViewport)
    touchQuery.addEventListener('change', syncCompactViewport)
    window.addEventListener('orientationchange', syncCompactViewport)
    visualViewport?.addEventListener('resize', syncCompactViewport)
    return () => {
      widthQuery.removeEventListener('change', syncCompactViewport)
      touchQuery.removeEventListener('change', syncCompactViewport)
      window.removeEventListener('orientationchange', syncCompactViewport)
      visualViewport?.removeEventListener('resize', syncCompactViewport)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !session?.activeRole || autoLockMs <= 0) {
      return
    }
    let timeoutId = window.setTimeout(() => {
      clearPosActiveRole()
      navigate('/pos/role?locked=1', { replace: true })
    }, autoLockMs)

    const resetTimer = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        clearPosActiveRole()
        navigate('/pos/role?locked=1', { replace: true })
      }, autoLockMs)
    }

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'mousemove']
    for (const eventName of events) {
      window.addEventListener(eventName, resetTimer, { passive: true })
    }

    return () => {
      window.clearTimeout(timeoutId)
      for (const eventName of events) {
        window.removeEventListener(eventName, resetTimer)
      }
    }
  }, [autoLockMs, navigate, session?.activeRole])

  useEffect(() => {
    if (!stableSession || !stableSession.activeRole) {
      setStaffDirectory([])
      return
    }
    const nextLocationOptions = getPosLocationCatalog(stableSession)
    const nextRoleOptions = getPosRoleCatalogForBusiness(stableSession.activeBusinessType).filter((role) => stableSession.roles.includes(role.id))
    const nextDirectory = loadPosStaffDirectory(workspaceScopeKeyCandidate, stableSession)
    setStaffDirectory((current) => {
      if (current.length !== nextDirectory.length) {
        return nextDirectory
      }
      const sameRecords = current.every((member, index) => {
        const nextMember = nextDirectory[index]
        if (!nextMember) {
          return false
        }
        return member.id === nextMember.id && member.updatedAt === nextMember.updatedAt && member.status === nextMember.status
      })
      return sameRecords ? current : nextDirectory
    })
    setStaffLocationId((current) =>
      nextLocationOptions.find((location) => location.id === current)
        ? current
        : stableSession.activeLocationId || nextLocationOptions[0]?.id || '',
    )
    setStaffRole((current) =>
      nextRoleOptions.find((role) => role.id === current)
        ? current
        : ((nextRoleOptions[0]?.id || 'cashier') as PosUserRole),
    )
  }, [stableSession, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!stableSession || !stableSession.activeRole) {
      setSyncLedger([])
      return
    }
    setSyncLedger(loadPosSyncLedger(workspaceScopeKeyCandidate))
  }, [stableSession, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!stableSession || !stableSession.activeRole) {
      setHandoffPacketQueue([])
      setHandoffAutoMessage('')
      return
    }
    setHandoffPacketQueue(loadHandoffPacketQueue(workspaceScopeKeyCandidate))
  }, [stableSession, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!stableSession || !stableSession.activeRole) {
      setRoleInvites([])
      return
    }
    setRoleInvites(loadRoleInvites(workspaceScopeKeyCandidate))
  }, [stableSession, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!session?.activeRole || !isOnline || syncBusy || pendingSyncCount === 0) {
      return
    }
    const result = flushPosSyncLedger(workspaceScopeKeyCandidate, true)
    setSyncLedger(result.entries)
    if (result.queuedCount === 0 && result.failedCount === 0) {
      setSyncMessage(`Auto-synced ${result.syncedCount} action(s).`)
    }
  }, [isOnline, pendingSyncCount, session?.activeRole, syncBusy, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!stableSession?.activeRole) {
      return
    }
    const trackedClients = salesTenants.filter(
      (tenant) => tenant.kind === 'client' && (tenant.stage === 'pilot' || tenant.stage === 'go-live'),
    )
    if (!trackedClients.length) {
      return
    }
    const signatureMap = loadHandoffSignatures(workspaceScopeKeyCandidate)
    let changedCount = 0
    let latestQueue = loadHandoffPacketQueue(workspaceScopeKeyCandidate)
    const nextSignatureMap = { ...signatureMap }
    for (const tenant of trackedClients) {
      const signature = [
        tenant.stage,
        tenant.status,
        tenant.roleTemplate,
        tenant.locationCount,
        tenant.updatedAt,
      ].join('|')
      if (nextSignatureMap[tenant.id] === signature) {
        continue
      }
      const queueItem = buildHandoffQueueItem(
        tenant,
        stableSession.workspaceSlug || 'pos-workspace',
        autoLockMinutes,
      )
      latestQueue = pushHandoffPacketQueue(workspaceScopeKeyCandidate, queueItem)
      nextSignatureMap[tenant.id] = signature
      changedCount += 1
    }
    if (changedCount <= 0) {
      return
    }
    saveHandoffSignatures(workspaceScopeKeyCandidate, nextSignatureMap)
    setHandoffPacketQueue(latestQueue)
    setHandoffAutoMessage(`Auto-run refreshed ${changedCount} handoff packet(s).`)
    const nextSyncLedger = enqueuePosSyncLedgerEntry(workspaceScopeKeyCandidate, {
      actionType: 'deployment.export',
      summary: `Auto handoff packet refresh queued for ${changedCount} client lane(s).`,
    })
    setSyncLedger(nextSyncLedger)
    setSyncMessage('Auto handoff packet refresh queued for sync.')
  }, [autoLockMinutes, salesTenants, stableSession, workspaceScopeKeyCandidate])

  useEffect(() => {
    savePosSalesTenants(salesTenants)
  }, [salesTenants])

  useEffect(() => {
    saveRoleInvites(workspaceScopeKeyCandidate, roleInvites)
  }, [roleInvites, workspaceScopeKeyCandidate])

  useEffect(() => {
    saveHandoffPacketQueue(workspaceScopeKeyCandidate, handoffPacketQueue)
  }, [handoffPacketQueue, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!salesTenants.length) {
      setActiveSalesTenantId('')
      return
    }
    if (salesTenants.some((item) => item.id === activeSalesTenantId)) {
      return
    }
    setActiveSalesTenantId(salesTenants[0].id)
  }, [activeSalesTenantId, salesTenants])

  useEffect(() => {
    const tenant = salesTenants.find((item) => item.id === activeSalesTenantId) || salesTenants[0] || null
    if (!tenant) {
      return
    }
    const allowedRoles = getPosRoleCatalogForBusiness(tenant.businessType).map((item) => item.id)
    if (!allowedRoles.includes(roleInviteRole)) {
      setRoleInviteRole((allowedRoles[0] || 'cashier') as PosUserRole)
    }
  }, [activeSalesTenantId, roleInviteRole, salesTenants])

  useEffect(() => {
    if (!stableSession) {
      return
    }
    setSalesTenantBusinessType((current) => current || stableSession.activeBusinessType)
    setSalesTenantOwner((current) => (current.trim() ? current : stableSession.displayName || 'Sales lead'))
    setSalesTenantRoleTemplate((current) => current || defaultSalesRoleTemplate(stableSession.activeBusinessType))

    const businessLabel = getPosBusinessProfile(stableSession.activeBusinessType).label
    const activeRecord: PosSalesTenantRecord = {
      id: `workspace-${stableSession.workspaceSlug}-${stableSession.activeLocationId}`,
      clientName: stableSession.companyName,
      businessType: stableSession.activeBusinessType,
      stage: resolveSalesStage(activeLocationStatus),
      owner: stableSession.displayName || 'Owner',
      roleTemplate: defaultSalesRoleTemplate(stableSession.activeBusinessType),
      locationCount: Math.max(1, getPosLocationCatalog(stableSession).length),
      status: 'active',
      contractStatus: 'signed',
      billingStatus: 'trial',
      kind: 'demo',
      updatedAt: new Date().toISOString(),
    }

    setSalesTenants((current) => {
      const next = [...current]
      const activeIndex = next.findIndex((item) => item.id === activeRecord.id)
      if (activeIndex >= 0) {
        const existing = next[activeIndex]
        next[activeIndex] = {
          ...existing,
          clientName: activeRecord.clientName,
          businessType: activeRecord.businessType,
          stage: activeRecord.stage,
          owner: activeRecord.owner,
          status: 'active',
          contractStatus: existing.contractStatus || activeRecord.contractStatus,
          billingStatus: existing.billingStatus || activeRecord.billingStatus,
          locationCount: activeRecord.locationCount,
          updatedAt: activeRecord.updatedAt,
        }
      } else {
        next.unshift(activeRecord)
      }

      return normalizeSalesTenantRecords(next)
    })

    setSalesTenantMessage(`Client registry synced for ${businessLabel} workspace.`)
  }, [activeLocationStatus, stableSession])

  useEffect(() => {
    if (!stableSession?.activeRole) {
      setSalesTenantCloudMode('unknown')
      setSalesTenantSyncMessage('')
      setSalesTenantSyncBusy(false)
      salesTenantCloudHashRef.current = ''
      roleInvitesCloudHashRef.current = ''
      handoffPacketCloudHashRef.current = ''
      staffDirectoryCloudHashRef.current = ''
      controlSettingsCloudHashRef.current = ''
      return
    }
    if (!isInternalOperator) {
      setSalesTenantCloudMode('local')
      setSalesTenantSyncMessage('Client workspace active. SuperMega handles client registry sync and setup changes.')
      setSalesTenantSyncBusy(false)
      salesTenantCloudHashRef.current = ''
      roleInvitesCloudHashRef.current = ''
      handoffPacketCloudHashRef.current = ''
      staffDirectoryCloudHashRef.current = ''
      controlSettingsCloudHashRef.current = ''
      return
    }
    if (!hasLiveWorkspaceApi()) {
      setSalesTenantCloudMode('local')
      setSalesTenantSyncMessage('Client registry sync is not available on this host. Setup packets can still be prepared and retried before handoff.')
      setSalesTenantSyncBusy(false)
      return
    }
    let cancelled = false
    setSalesTenantSyncBusy(true)
    void (async () => {
      try {
        const payload = await getPosControlPlane()
        if (cancelled) {
          return
        }
        const cloudRecords = normalizeSalesTenantRecords(payload.sales_tenants)
        const cloudRoleInvites = sortRoleInvites(
          (Array.isArray(payload.role_invites) ? payload.role_invites : [])
            .map((item) => normalizeRoleInviteRecord(item))
            .filter((item): item is PosSalesRoleInviteRecord => Boolean(item)),
        )
        const cloudHandoffPackets = sortHandoffQueue(
          (Array.isArray(payload.handoff_packets) ? payload.handoff_packets : [])
            .map((item) => normalizeHandoffQueueItem(item))
            .filter((item): item is PosHandoffPacketQueueItem => Boolean(item)),
        )
        const cloudAuditEvents = Array.isArray(payload.audit_events) ? payload.audit_events : []
        const cloudStaffDirectory = replacePosStaffDirectory(
          workspaceScopeKeyCandidate,
          stableSession,
          payload.staff_directory,
        )
        const cloudStaffRows = toPosControlPlaneStaffRows(cloudStaffDirectory)
        const cloudSettingsAutoLock = normalizeAutoLockMinutes(payload.settings?.auto_lock_minutes)
        salesTenantCloudHashRef.current = JSON.stringify(toPosControlPlaneTenantRows(cloudRecords))
        roleInvitesCloudHashRef.current = JSON.stringify(toPosControlPlaneRoleInviteRows(cloudRoleInvites))
        handoffPacketCloudHashRef.current = JSON.stringify(toPosControlPlaneHandoffPacketRows(cloudHandoffPackets))
        staffDirectoryCloudHashRef.current = JSON.stringify(cloudStaffRows)
        controlSettingsCloudHashRef.current = JSON.stringify({
          auto_lock_minutes: cloudSettingsAutoLock ?? autoLockMinutes,
        })
        if (cloudRecords.length) {
          setSalesTenants((current) => mergeSalesTenantRecords(current, cloudRecords))
        }
        if (cloudRoleInvites.length) {
          setRoleInvites((current) => mergeRoleInvites(current, cloudRoleInvites))
        }
        if (cloudHandoffPackets.length) {
          setHandoffPacketQueue((current) => mergeHandoffPacketQueue(current, cloudHandoffPackets))
        }
        if (cloudAuditEvents.length) {
          setPosAuditEvents(cloudAuditEvents)
          setPosAuditMessage(`Audit trail loaded: ${cloudAuditEvents.length} event(s).`)
        }
        setStaffDirectory((current) => {
          const currentHash = JSON.stringify(toPosControlPlaneStaffRows(current))
          const nextHash = JSON.stringify(cloudStaffRows)
          return currentHash === nextHash ? current : cloudStaffDirectory
        })
        if (cloudSettingsAutoLock !== null) {
          setAutoLockMinutes((current) => (current === cloudSettingsAutoLock ? current : cloudSettingsAutoLock))
        }
        setSalesTenantCloudMode('cloud')
        const loadedCount = cloudRecords.length + cloudRoleInvites.length + cloudHandoffPackets.length + cloudStaffRows.length
        setSalesTenantSyncMessage(
          loadedCount
            ? `Cloud sync loaded ${cloudRecords.length} lane(s), ${cloudRoleInvites.length} invite(s), ${cloudHandoffPackets.length} packet(s), ${cloudStaffRows.length} staff profile(s).`
            : 'Cloud sync ready. Client lanes will save on first update.',
        )
      } catch (error) {
        if (cancelled) {
          return
        }
        setSalesTenantCloudMode('local')
        setSalesTenantSyncMessage(
          isWorkspaceAuthError(error)
            ? 'POS API session required. Sign in at pos.supermega.dev/pos/login with an internal owner account to enable client registry sync.'
            : 'Client registry sync is unavailable. Setup packets remain available; retry before handoff.',
        )
      } finally {
        if (!cancelled) {
          setSalesTenantSyncBusy(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [autoLockMinutes, isInternalOperator, stableSession, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!isInternalOperator || !stableSession?.activeRole) {
      setPosAuditEvents([])
      setPosAuditMessage('')
      return
    }
    if (!hasLiveWorkspaceApi()) {
      setPosAuditEvents([])
      setPosAuditMessage('Audit trail will load after cloud sync reconnects.')
      return
    }
    let cancelled = false
    setPosAuditMessage('Loading POS audit trail...')
    void (async () => {
      try {
        const payload = await getPosAuditEvents(40)
        if (cancelled) {
          return
        }
        const rows = Array.isArray(payload.rows) ? payload.rows : []
        setPosAuditEvents(rows)
        setPosAuditMessage(rows.length ? `Audit trail loaded: ${rows.length} event(s).` : 'No POS audit events recorded yet.')
      } catch (error) {
        if (cancelled) {
          return
        }
        setPosAuditEvents([])
        setPosAuditMessage(
          isWorkspaceAuthError(error)
            ? 'Audit trail requires POS or workspace session.'
            : 'Audit trail unavailable. Check cloud API health.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isInternalOperator, stableSession?.activeRole, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!isInternalOperator || !stableSession?.activeRole) {
      setSupportIncidents([])
      setSupportDeskMessage('')
      return
    }
    if (!hasLiveWorkspaceApi()) {
      setSupportDeskMessage('Support desk will sync after cloud connection is restored.')
      return
    }
    let cancelled = false
    setSupportDeskBusy(true)
    setSupportDeskMessage('Loading support desk...')
    void (async () => {
      try {
        const payload = await getPosSupportIncidents(50)
        if (cancelled) {
          return
        }
        const rows = Array.isArray(payload.incidents) ? payload.incidents : []
        setSupportIncidents(rows)
        setSupportDeskMessage(rows.length ? `Support desk loaded: ${rows.length} incident(s).` : 'Support desk ready. No incidents recorded yet.')
      } catch (error) {
        if (cancelled) {
          return
        }
        setSupportIncidents([])
        setSupportDeskMessage(
          isWorkspaceAuthError(error)
            ? 'Support desk requires POS or workspace session.'
            : 'Support desk API unavailable. JSON support packet export still works.',
        )
      } finally {
        if (!cancelled) {
          setSupportDeskBusy(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isInternalOperator, stableSession?.activeRole, workspaceScopeKeyCandidate])

  useEffect(() => {
    if (!stableSession?.activeRole || salesTenantCloudMode !== 'cloud' || !hasLiveWorkspaceApi()) {
      return
    }
    const tenantRows = toPosControlPlaneTenantRows(salesTenants)
    const inviteRows = toPosControlPlaneRoleInviteRows(roleInvites)
    const handoffRows = toPosControlPlaneHandoffPacketRows(handoffPacketQueue)
    const staffRows = toPosControlPlaneStaffRows(staffDirectory)
    const controlSettings = {
      auto_lock_minutes: autoLockMinutes,
    }
    const nextTenantHash = JSON.stringify(tenantRows)
    const nextInviteHash = JSON.stringify(inviteRows)
    const nextHandoffHash = JSON.stringify(handoffRows)
    const nextStaffHash = JSON.stringify(staffRows)
    const nextSettingsHash = JSON.stringify(controlSettings)
    const hasChange = (
      nextTenantHash !== salesTenantCloudHashRef.current
      || nextInviteHash !== roleInvitesCloudHashRef.current
      || nextHandoffHash !== handoffPacketCloudHashRef.current
      || nextStaffHash !== staffDirectoryCloudHashRef.current
      || nextSettingsHash !== controlSettingsCloudHashRef.current
    )
    if (!hasChange) {
      return
    }
    let cancelled = false
    setSalesTenantSyncBusy(true)
    void (async () => {
      try {
        const result = await updatePosControlPlane({
          sales_tenants: tenantRows,
          role_invites: inviteRows,
          handoff_packets: handoffRows,
          staff_directory: staffRows,
          settings: controlSettings,
        }, { timeoutMs: 45000 })
        if (cancelled) {
          return
        }
        salesTenantCloudHashRef.current = nextTenantHash
        roleInvitesCloudHashRef.current = nextInviteHash
        handoffPacketCloudHashRef.current = nextHandoffHash
        staffDirectoryCloudHashRef.current = nextStaffHash
        controlSettingsCloudHashRef.current = nextSettingsHash
        const savedAuditEvents = Array.isArray(result.saved?.audit_events) ? result.saved.audit_events : []
        if (savedAuditEvents.length) {
          setPosAuditEvents(savedAuditEvents)
          setPosAuditMessage(`Audit trail refreshed: ${savedAuditEvents.length} event(s).`)
        } else {
          void getPosAuditEvents(40)
            .then((payload) => {
              if (cancelled) {
                return
              }
              const rows = Array.isArray(payload.rows) ? payload.rows : []
              if (rows.length) {
                setPosAuditEvents(rows)
                setPosAuditMessage(`Audit trail refreshed: ${rows.length} event(s).`)
              }
            })
            .catch(() => {
              if (!cancelled) {
                setPosAuditMessage('Audit trail will refresh after the next sync.')
              }
            })
        }
        setSalesTenantSyncMessage(
          `Cloud sync saved ${tenantRows.length} lane(s), ${inviteRows.length} invite(s), ${handoffRows.length} packet(s), ${staffRows.length} staff profile(s).`,
        )
      } catch (error) {
        if (cancelled) {
          return
        }
        setSalesTenantCloudMode('local')
        setSalesTenantSyncMessage(
          isWorkspaceAuthError(error)
            ? 'POS API session expired. Sign in again at pos.supermega.dev/pos/login to restore client registry sync.'
            : 'Cloud save needs retry. Setup packets remain available for controlled handoff.',
        )
      } finally {
        if (!cancelled) {
          setSalesTenantSyncBusy(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    autoLockMinutes,
    handoffPacketQueue,
    roleInvites,
    salesTenantCloudMode,
    salesTenants,
    stableSession?.activeRole,
    staffDirectory,
  ])

  if (!session) {
    return <Navigate replace to="/pos/login" />
  }

  if (!session.activeRole) {
    return <Navigate replace to="/pos/role" />
  }

  const activeSession = session
  const activeBusinessType = activeSession.activeBusinessType
  ensurePosWorkspaceCache()
  const role = getPosRoleProfile(session.activeRole, session.activeBusinessType)
  const roleAccess = getPosRoleAccess(session.activeRole, session.activeBusinessType)
  const businessProfile = getPosBusinessProfile(session.activeBusinessType)
  const activeLocation = getPosActiveLocation(session)
  const moduleLabels = getPosBusinessModuleLabels(session.activeBusinessType)
  const moduleContracts = getPosBusinessModuleContracts(session.activeBusinessType)
  const workspaceScopeKey = getPosWorkspaceScopeKey(session)
  const managerOverrideHint = getPosManagerOverrideHint()
  const previewModules = (roleAccess?.modules || []).slice(0, 4)
  const hiddenCount = Math.max(0, (roleAccess?.modules.length || 0) - previewModules.length)
  const saasFeatures = BUSINESS_SAAS_FEATURES[session.activeBusinessType] || BUSINESS_SAAS_FEATURES.restaurant
  const pilotKit = POS_VERTICAL_PILOT_KITS[session.activeBusinessType] || POS_VERTICAL_PILOT_KITS.restaurant
  const enterpriseChecklist = getPosEnterpriseReadinessChecklist(session.activeBusinessType)
  const enterpriseSummary = getPosEnterpriseReadinessSummary(enterpriseChecklist)
  const benchmarkBacklog = getPosBenchmarkBacklog(session.activeBusinessType)
  const benchmarkSummary = benchmarkBacklog.reduce(
    (summary, item) => {
      summary[item.status] += 1
      return summary
    },
    { live: 0, build: 0, missing: 0 },
  )
  const referenceRepos = getPosReferenceRepos(session.activeBusinessType)
  const referenceRepoSummary = referenceRepos.reduce(
    (summary, item) => {
      summary[item.status] += 1
      return summary
    },
    { 'adopt-now': 0, pilot: 0, watch: 0 },
  )
  const aiNativeCapabilities = getPosAiNativeCapabilities(session.activeBusinessType)
  const aiNativeSummary = summarizeAiNativeCapabilities(aiNativeCapabilities)
  const aiNativeTopGaps = aiNativeCapabilities.filter((item) => item.status !== 'live').slice(0, 3)
  const staffSummary = {
    active: staffDirectory.filter((member) => member.status === 'active').length,
    suspended: staffDirectory.filter((member) => member.status === 'suspended').length,
  }
  const deploymentRoles = (staffRoleOptions.length ? staffRoleOptions.map((roleOption) => roleOption.id) : session.roles) as PosUserRole[]
  const deploymentModuleIds = [
    ...new Set<PosModuleId>((roleAccess?.modules?.length ? roleAccess.modules : (Object.keys(moduleContracts) as PosModuleId[])) || []),
  ]
  const deploymentPack = buildPosClientDeploymentPack({
    session,
    businessType: session.activeBusinessType,
    environment: deploymentEnvironment,
    releaseOwner: deploymentReleaseOwner.trim() || session.displayName || 'Owner',
    versionTag: deploymentVersionTag.trim() || defaultDeploymentVersionTag(),
    workspaceUrl: typeof window === 'undefined' ? 'https://pos.supermega.dev/pos/login' : `${window.location.origin}/pos/login`,
    roles: deploymentRoles,
    moduleIds: deploymentModuleIds,
    moduleLabels: moduleLabels as Partial<Record<PosModuleId, string>>,
    staffDirectory,
    canExportExcel: roleAccess?.canExportExcel ?? true,
    canExportJson: roleAccess?.canExportJson ?? true,
    managerOverrideHint,
    enterpriseChecklist,
    benchmarkBacklog,
    referenceRepos,
  })
  const deploymentChecklistText = buildPosDeploymentChecklistText(deploymentPack)
  const deploymentGateSummary = deploymentPack.gates.reduce(
    (summary, gate) => {
      summary[gate.status] += 1
      return summary
    },
    { ready: 0, review: 0, blocked: 0 },
  )
  const normalizedSessionCompanyName = isLegacyDemoName(session.companyName) ? 'SuperMega POS Demo' : session.companyName
  const salesQueue = buildPosSalesQueue({
    companyName: normalizedSessionCompanyName,
    displayName: session.displayName,
    activeBusinessType: session.activeBusinessType,
    activeLocationStatus,
  }, salesTenants)
  const salesSummary = salesQueue.reduce(
    (summary, item) => {
      summary[item.stage] += 1
      return summary
    },
    { lead: 0, discovery: 0, pilot: 0, 'go-live': 0 },
  )
  const salesTenantSummary = salesTenants.reduce(
    (summary, item) => {
      summary[item.stage] += 1
      return summary
    },
    { lead: 0, discovery: 0, pilot: 0, 'go-live': 0 },
  )
  const demoTenantRecords = salesTenants.filter((item) => item.kind === 'demo')
  const clientTenantRecords = salesTenants.filter((item) => item.kind === 'client' && !isLegacyDemoName(item.clientName))
  const registryTenantRecords = [...clientTenantRecords, ...demoTenantRecords]
  const clientLaneCount = clientTenantRecords.length
  const demoLaneCount = demoTenantRecords.length
  const salesTenantRegistryStatus = getSalesTenantRegistryStatus(
    salesTenantCloudMode,
    salesTenantSyncBusy,
    salesTenantSyncMessage,
  )
  const activeLocationLabel = activeLocation
    ? normalizeSalesTenantClientName(activeLocation.label, activeLocation.businessType)
    : 'Main location'
  const companyDisplayName = normalizedSessionCompanyName
  const activeScopeLine = `${activeLocationLabel} / ${businessProfile.label}`
  const activeIdentityLine = `${session.displayName} / ${role?.label || session.activeRole}`
  const roleModeLabel = roleAccess?.readOnly ? 'Review mode' : 'Operator mode'
  const hiddenLaneLabel = hiddenCount > 0 ? ` / +${hiddenCount} lane${hiddenCount === 1 ? '' : 's'}` : ''
  const roleScopeLine = roleAccess ? `${roleAccess.role} / ${roleModeLabel}${hiddenLaneLabel}` : ''
  const compactLocationStatus = activeLocation?.status || 'setup'
  const compactIdentityLine = `${role?.label || session.activeRole} / ${compactLocationStatus.toUpperCase()}`
  const visibleSalesTenantRecords = compactViewport ? registryTenantRecords.slice(0, 3) : registryTenantRecords
  const activeSalesTenant = registryTenantRecords.find((item) => item.id === activeSalesTenantId) || visibleSalesTenantRecords[0] || null
  const activeSalesTenantRoleOptions = activeSalesTenant
    ? getPosRoleCatalogForBusiness(activeSalesTenant.businessType)
    : []
  const activeSalesTenantLaunchGate = activeSalesTenant
    ? getSalesTenantLaunchGate(activeSalesTenant, salesTenantCloudMode)
    : null
  const activeSalesTenantInvites = activeSalesTenant
    ? roleInvites.filter((item) => item.tenantId === activeSalesTenant.id).slice(0, 6)
    : []
  const provisionedAccounts = getPosProvisionedAccounts()
  const activeSalesTenantLaunchRoomGates = activeSalesTenant
    ? buildClientLaunchRoomGates({
      tenant: activeSalesTenant,
      invites: roleInvites,
      handoffPackets: handoffPacketQueue,
      accounts: provisionedAccounts,
      cloudMode: salesTenantCloudMode,
      auditEvents: posAuditEvents,
      syncSummary,
      staffDirectory,
      autoLockMinutes,
      deploymentGateSummary,
    })
    : []
  const activeSalesTenantLaunchRoomSummary = summarizeClientLaunchRoomGates(activeSalesTenantLaunchRoomGates)
  const activeSalesTenantTopLaunchGaps = activeSalesTenantLaunchRoomGates
    .filter((gate) => gate.status !== 'ready')
    .slice(0, compactViewport ? 2 : 4)
  const activeSalesTenantAiCapabilities = activeSalesTenant
    ? getPosAiNativeCapabilities(activeSalesTenant.businessType)
    : []
  const activeSalesTenantAiSummary = summarizeAiNativeCapabilities(activeSalesTenantAiCapabilities)
  const activeSalesTenantAiGaps = activeSalesTenantAiCapabilities
    .filter((capability) => capability.status !== 'live')
    .slice(0, compactViewport ? 2 : 4)
  const activeSalesTenantCopilotPacket = activeSalesTenant && activeSalesTenantLaunchGate
    ? buildSalesAiHandoffPacket({
      tenant: activeSalesTenant,
      workspaceSlug: workspaceScopeKey,
      launchGate: activeSalesTenantLaunchGate,
      launchRoomGates: activeSalesTenantLaunchRoomGates,
      cloudMode: salesTenantCloudMode,
      autoLockMinutes,
      syncSummary,
      deploymentGateSummary,
    })
    : null
  const visibleWorkspaceSurfaces = getVisibleWorkspaceSurfaces(isInternalOperator)
  const visibleControlPanels = getVisibleControlPanels(isInternalOperator)
  const visibleCompactControlModes = visibleControlPanels
  const surfaceForDisplay: PosWorkspaceSurface = isWorkspaceSurfaceAvailable(activeSurface, isInternalOperator) ? activeSurface : 'workspace'
  const requestedControlPanel = compactViewport ? compactControlMode : activeControlPanel
  const controlPanelForDisplay: PosWorkspaceControlPanel = isControlPanelAvailable(requestedControlPanel, isInternalOperator)
    ? requestedControlPanel
    : 'overview'
  const salesPanelForDisplay: PosSalesPanel = compactViewport ? compactSalesMode : activeSalesPanel
  const activeControlPanelLabel = visibleControlPanels.find((panel) => panel.id === controlPanelForDisplay)?.label || 'Setup'
  const activeSalesPanelLabel = POS_WORKSPACE_SALES_PANELS.find((panel) => panel.id === salesPanelForDisplay)?.label || 'Pipeline'
  const compactSalesQueue = compactViewport ? salesQueue.slice(0, 2) : salesQueue
  const salesHandoffCards = (clientTenantRecords.length ? clientTenantRecords : registryTenantRecords).map((tenant) => {
    const readiness = getSalesTenantReadiness(tenant)
    const launchGate = getSalesTenantLaunchGate(tenant, salesTenantCloudMode)
    const checklist = [
      { id: 'roles', label: 'Role policy', done: tenant.roleTemplate !== 'cashier-first' || tenant.businessType === 'restaurant' },
      { id: 'sync', label: 'Sync + export owner', done: salesTenantCloudMode === 'cloud' || tenant.stage !== 'go-live' },
      { id: 'deploy', label: 'Deployment gate', done: launchGate.status !== 'blocked' },
      { id: 'handoff', label: 'Training handoff', done: tenant.stage === 'go-live' || tenant.stage === 'pilot' },
    ]
    const completedCount = checklist.filter((item) => item.done).length
    return {
      tenant,
      readiness,
      launchGate,
      checklist,
      completedCount,
      blocked: readiness.score < 70 || completedCount < 3 || launchGate.status === 'blocked',
    }
  })
  const compactHandoffCards = compactViewport ? salesHandoffCards.slice(0, 2) : salesHandoffCards
  const launchReadyCount = clientTenantRecords.filter((tenant) => getSalesTenantLaunchGate(tenant, salesTenantCloudMode).status === 'ready').length
  const launchBlockedCount = clientTenantRecords.filter((tenant) => getSalesTenantLaunchGate(tenant, salesTenantCloudMode).status === 'blocked').length
  const salesTenantWizardBusinessProfile = getPosBusinessProfile(salesTenantBusinessType)
  const salesTenantWizardRoleSummary = POS_SALES_ROLE_TEMPLATE_SUMMARY[salesTenantRoleTemplate]
  const salesTenantWizardLocationCount = Math.max(1, Number(salesTenantLocations) || 1)
  const salesTenantWizardClientName = normalizeSalesTenantClientName(salesTenantName, salesTenantBusinessType)
  const businessPackCards = (['restaurant', 'spa', 'retail'] as const).map((businessType) => {
    const business = getPosBusinessProfile(businessType)
    const roleTemplate = defaultSalesRoleTemplate(businessType)
    const roleScope = getPosRoleCatalogForBusiness(businessType).map((item) => item.label).join(', ')
    const moduleScope = Object.values(getPosBusinessModuleLabels(businessType)).filter(Boolean).slice(0, 5).join(' / ')
    return {
      id: businessType,
      label: business.label,
      summary: business.summary,
      roleTemplate,
      roleScope,
      moduleScope,
    }
  })
  const quickStatusCards = [
    {
      id: 'role',
      label: 'Role',
      value: role?.label || session.activeRole,
    },
    {
      id: 'sync',
      label: 'Sync',
      value: `${isOnline ? 'Online' : 'Offline'} / pending ${pendingSyncCount} / ${offlineSyncRisk.statusLabel}`,
    },
    {
      id: 'readiness',
      label: 'Readiness',
      value: `${enterpriseSummary.live} live / ${enterpriseSummary.missing} missing`,
    },
    {
      id: 'deployment',
      label: isInternalOperator ? 'Deploy' : 'Setup',
      value: isInternalOperator
        ? `${deploymentGateSummary.ready} ready / ${deploymentGateSummary.blocked} blocked`
        : `${enterpriseSummary.live} live / ${enterpriseSummary.missing} missing`,
    },
  ]
  const visibleQuickStatusCards = compactViewport ? quickStatusCards.slice(0, 3) : quickStatusCards
  const compactWorkspaceCards = [
    {
      id: 'scope',
      value: `${activeLocationLabel} / ${role?.label || session.activeRole}`,
    },
    {
      id: 'health',
      value: `Sync ${isOnline ? 'online' : 'offline'} / pending ${pendingSyncCount} / ${offlineSyncRisk.statusLabel}`,
    },
  ]
  const compactSaasFeatures = compactViewport ? saasFeatures.slice(0, 2) : saasFeatures
  const compactAiNativeCapabilities = compactViewport ? aiNativeCapabilities.slice(0, 3) : aiNativeCapabilities
  const compactReadinessChecklist = compactViewport ? enterpriseChecklist.slice(0, 3) : enterpriseChecklist
  const compactBenchmarkBacklog = compactViewport ? benchmarkBacklog.slice(0, 3) : benchmarkBacklog
  const compactReferenceRepos = compactViewport ? referenceRepos.slice(0, 2) : referenceRepos
  const compactStaffDirectory = compactViewport ? staffDirectory.slice(0, 4) : staffDirectory
  const workspaceModuleCards = compactViewport ? previewModules : (roleAccess?.modules || []).slice(0, 6)
  const workspaceOperationalSignals = [
    {
      id: 'sync',
      label: 'Sync health',
      value: `${isOnline ? 'Online' : 'Offline'} / pending ${pendingSyncCount}`,
    },
    {
      id: 'risk',
      label: 'Offline risk',
      value: `${offlineSyncRisk.statusLabel} / oldest ${formatPendingAge(offlineSyncRisk.oldestPendingMinutes)}`,
    },
    {
      id: 'readiness',
      label: 'Readiness',
      value: `${enterpriseSummary.live} live / ${enterpriseSummary.missing} missing`,
    },
    {
      id: 'deploy',
      label: isInternalOperator ? 'Deploy gates' : 'Go-live check',
      value: `${deploymentGateSummary.ready} ready / ${deploymentGateSummary.blocked} blocked`,
    },
  ]
  const blockedGate = deploymentPack.gates.find((gate) => gate.status === 'blocked') || null
  const workspaceNextActions = [
    blockedGate ? `Resolve blocked deployment gate: ${blockedGate.title}.` : 'Deployment gates are clear enough for pilot handoff.',
    offlineSyncRisk.nextAction,
    `Run ${businessProfile.label} smoke on owner + operator roles before handoff.`,
  ]
  const workspaceClientNextAction = isInternalOperator
    ? workspaceNextActions[0]
    : `Complete first ${businessProfile.label.toLowerCase()} flow: capture proof, print/export receipt, then export owner brief at close.`
  const defaultRoleModule = roleAccess?.defaultModule
  const defaultRoleModuleLabel = defaultRoleModule ? (moduleLabels[defaultRoleModule] || defaultRoleModule) : 'assigned module'
  const workspaceModuleCommandCards = workspaceModuleCards.map((moduleId) => {
    const contract = moduleContracts[moduleId]
    const playbook = getPosModulePlaybook(session.activeBusinessType, moduleId)
    return {
      moduleId,
      label: moduleLabels[moduleId] || contract?.name || moduleId,
      title: contract?.name || moduleLabels[moduleId] || moduleId,
      job: contract?.job || MODULE_PREVIEW[moduleId]?.detail || 'Module lane ready.',
      playbook,
    }
  })
  const activeModuleCommand = (
    selectedWorkspaceModule
      ? workspaceModuleCommandCards.find((card) => card.moduleId === selectedWorkspaceModule)
      : null
  ) || (
    defaultRoleModule
      ? workspaceModuleCommandCards.find((card) => card.moduleId === defaultRoleModule)
      : null
  ) || workspaceModuleCommandCards[0] || null
  const visibleModuleCommandCards = workspaceModuleCommandCards.slice(0, compactViewport ? 3 : 6)
  const activeModuleId = activeModuleCommand?.moduleId || null
  const workspaceCoreActions = [
    {
      id: 'checkout',
      label: 'Checkout',
      title: 'Invoice, proof, print',
      detail: 'Cash, wallet/bank, invoice, or external device proof with browser print/PDF.',
      moduleId: 'payment' as PosModuleId,
    },
    {
      id: 'customer',
      label: 'Customer',
      title: 'Profile and recovery',
      detail: 'Name, phone, visit/order history, package balance, issue, and follow-up owner.',
      moduleId: 'guest' as PosModuleId,
    },
    {
      id: 'stock',
      label: 'Stock',
      title: 'Count, receive, reorder',
      detail: 'Stock movement, low stock, waste, receiving, supplier issue, and next action.',
      moduleId: 'stock' as PosModuleId,
    },
    {
      id: 'closeout',
      label: 'Closeout',
      title: 'Review and export',
      detail: 'Exceptions, sync queue, approvals, support issues, and owner closeout brief.',
      moduleId: 'enterprise' as PosModuleId,
    },
  ]
  const helpDailyFlowCards = [
    {
      id: 'open-shift',
      label: '1. Open shift',
      value: `Start in POS, confirm ${activeLocationLabel}, then use ${defaultRoleModuleLabel} for the first action.`,
    },
    {
      id: 'capture-proof',
      label: '2. Capture proof',
      value: 'Record payment proof, stock note, service status, or exception before closing the item.',
    },
    {
      id: 'review-close',
      label: '3. Review close',
      value: roleAccess?.readOnly
        ? 'Use review mode to check evidence and export proof without changing live work.'
        : 'Managers/owners review discounts, voids, closeout, and unresolved queue items before end of day.',
    },
  ]
  const helpPolicyCards = [
    {
      id: 'payment-print',
      label: 'Payments + print',
      value: 'Use manual cash, wallet/bank reference, invoice, or external device proof. Print through the normal browser print dialog.',
    },
    {
      id: 'offline-sync',
      label: 'Offline rule',
      value: `${isOnline ? 'Online now' : 'Offline now'} / pending ${pendingSyncCount}. Do not switch role or log out with unresolved queued work.`,
    },
    {
      id: 'role-safety',
      label: 'Role safety',
      value: roleAccess
        ? `${role?.label || roleAccess.role} can use ${workspaceModuleCards.map((moduleId) => moduleLabels[moduleId] || moduleId).join(', ') || defaultRoleModuleLabel}.`
        : 'Open a role before using client POS actions.',
    },
  ]
  const helpBusinessCards = [
    {
      id: 'business-pack',
      label: `${businessProfile.label} pack`,
      value: businessProfile.summary,
    },
    {
      id: 'menu-scope',
      label: 'First workflow',
      value: pilotKit.serviceMenu[0]
        ? `${pilotKit.serviceMenu[0].label}: ${pilotKit.serviceMenu[0].value}`
        : 'Use the active business pack workflow.',
    },
    {
      id: 'next-action',
      label: 'Next action',
      value: workspaceClientNextAction,
    },
  ]
  const compactModuleScopePreview = workspaceModuleCards
    .map((moduleId) => moduleLabels[moduleId] || moduleId)
    .slice(0, 2)
    .join(' / ')
  const compactWorkspaceOverviewCards = [
    {
      id: 'pilot',
      label: 'Pilot kit',
      value: `${pilotKit.title} / ${pilotKit.serviceMenu.length} services`,
    },
    {
      id: 'module',
      label: 'Module scope',
      value: compactModuleScopePreview || 'Module lanes ready.',
    },
    {
      id: 'sync',
      label: 'Sync health',
      value: `${isOnline ? 'Online' : 'Offline'} / pending ${pendingSyncCount}`,
    },
    {
      id: 'readiness',
      label: 'Readiness',
      value: `${enterpriseSummary.live} live / ${enterpriseSummary.missing} missing`,
    },
    {
      id: 'deploy',
      label: isInternalOperator ? 'Deploy gate' : 'Go-live check',
      value: `${deploymentGateSummary.ready} ready / ${deploymentGateSummary.blocked} blocked`,
    },
  ]
  const enterprisePaymentOption = POS_ENTERPRISE_PAYMENT_OPTIONS.find((option) => option.id === enterpriseSettings.paymentMode) || POS_ENTERPRISE_PAYMENT_OPTIONS[0]
  const enterprisePrinterOption = POS_ENTERPRISE_PRINTER_OPTIONS.find((option) => option.id === enterpriseSettings.printerMode) || POS_ENTERPRISE_PRINTER_OPTIONS[0]
  const enterpriseOfflineOption = POS_ENTERPRISE_OFFLINE_OPTIONS.find((option) => option.id === enterpriseSettings.offlinePolicy) || POS_ENTERPRISE_OFFLINE_OPTIONS[0]
  const supportSeverityOption = POS_SUPPORT_SEVERITY_OPTIONS.find((option) => option.id === supportSeverity) || POS_SUPPORT_SEVERITY_OPTIONS[1]
  const supportCategoryOption = POS_SUPPORT_CATEGORY_OPTIONS.find((option) => option.id === supportCategory) || POS_SUPPORT_CATEGORY_OPTIONS[0]
  const invoiceAmountValue = parseMmkAmount(invoiceAmount)
  const invoiceServiceLabel = invoiceService.trim() || pilotKit.serviceMenu[0]?.label || `${businessProfile.label} service`
  const invoiceCustomerLabel = invoiceCustomer.trim() || 'Walk-in customer'
  const invoiceNoteText = invoiceNote.trim() || 'Manual proof required before closeout.'
  const businessDevicePolicy = POS_BUSINESS_DEVICE_POLICY[activeSession.activeBusinessType] || POS_BUSINESS_DEVICE_POLICY.restaurant
  const hardwarePolicyItems: PosHardwarePolicyItem[] = [
    {
      id: 'browser-device',
      lane: 'Browser POS device',
      status: 'ready',
      owner: 'Client operations',
      requirement: `${businessProfile.label} users need one current Chrome, Edge, or Safari device with stable Wi-Fi and access to ${activeLocationLabel}.`,
      implementation: 'Install no POS software for pilot. Open https://pos.supermega.dev/pos/login, sign in, and keep the browser updated.',
      acceptance: 'Login, select role, open POS, switch to Setup, then logout without pending sync actions.',
      evidence: `${role?.label || activeSession.activeRole} role active on ${activeLocationLabel}.`,
      fallback: 'Use any second browser-capable laptop/tablet/phone and sign in with the assigned role.',
    },
    {
      id: 'business-device-map',
      lane: businessDevicePolicy.lane,
      status: 'review',
      owner: 'Implementation',
      requirement: businessDevicePolicy.requirement,
      implementation: 'Assign device owner, station, role, Wi-Fi, charging point, and closeout responsibility before pilot day.',
      acceptance: businessDevicePolicy.acceptance,
      evidence: `Business pack: ${businessProfile.label}; location scope: ${activeLocationLabel}.`,
      fallback: businessDevicePolicy.fallback,
    },
    {
      id: 'printer',
      lane: 'Invoice and receipt printing',
      status: enterprisePrinterOption.id === 'email-only' ? 'review' : enterprisePrinterOption.id === 'thermal-driver' ? 'review' : 'ready',
      owner: enterprisePrinterOption.setup === 'client' ? 'Client operations' : 'Implementation',
      requirement: enterprisePrinterOption.detail,
      implementation: 'Use the OS/browser print dialog. For thermal printers, install the vendor driver first and test normal browser print before requesting any direct integration.',
      acceptance: 'Run Test printer, print one invoice/receipt, and keep the printed or PDF proof with day-one closeout evidence.',
      evidence: `Selected printer mode: ${enterprisePrinterOption.label}.`,
      fallback: 'Use A4 PDF invoice or digital receipt export until the printer is stable.',
    },
    {
      id: 'manual-payment-proof',
      lane: 'Manual payment proof',
      status: 'ready',
      owner: 'Client cashier/owner',
      requirement: enterprisePaymentOption.detail,
      implementation: 'Record the cash, wallet, bank, or external card-device reference in the invoice note before closeout.',
      acceptance: 'Export invoice JSON with payment mode, reference note, operator, role, and timestamp.',
      evidence: `Payment mode: ${enterprisePaymentOption.label}.`,
      fallback: 'If external proof is missing, mark invoice as payment-requested and reconcile before daily close.',
    },
    {
      id: 'scanner-cash-drawer',
      lane: 'Scanner and cash drawer',
      status: 'review',
      owner: 'Implementation',
      requirement: 'Keyboard-wedge barcode scanner is allowed if it types into the focused field. Cash drawer is manual unless printer-connected kick is separately tested.',
      implementation: 'Test scanner as normal keyboard input. Do not promise browser-controlled cash drawer kicks in pilot mode.',
      acceptance: 'Scan/type one item code or service code, create a stock/payment note, and confirm no browser permission prompt blocks operation.',
      evidence: 'Direct drawer/scanner automation is not required for launch.',
      fallback: 'Manual item search and manual cash drawer log.',
    },
    {
      id: 'offline-sync',
      lane: 'Network and offline policy',
      status: !isOnline ? 'blocked' : pendingSyncCount > 0 || syncSummary.failed > 0 ? 'review' : 'ready',
      owner: 'Client manager',
      requirement: enterpriseOfflineOption.detail,
      implementation: 'Keep online closeout as the default. If offline capture is approved, manager reviews and flushes queued actions before logout/role switch.',
      acceptance: 'Create one queued action, reconnect, flush sync queue, and confirm queued/failed counts return to zero.',
      evidence: `Online ${isOnline ? 'yes' : 'no'}; queued ${syncSummary.queued}; failed ${syncSummary.failed}; oldest pending ${formatPendingAge(offlineSyncRisk.oldestPendingMinutes)}.`,
      fallback: 'Pause payment closeout while offline and capture service notes only.',
    },
    {
      id: 'shared-terminal-lock',
      lane: 'Shared terminal safety',
      status: autoLockMinutes > 0 ? 'ready' : 'blocked',
      owner: 'Client owner',
      requirement: 'Shared devices need auto-lock and role attribution so staff do not transact under the wrong account.',
      implementation: 'Use a 5, 10, or 15 minute lock policy and rotate staff PINs during onboarding.',
      acceptance: 'Set auto-lock above zero, verify staff roles, and confirm logout/role switch is blocked when sync is pending.',
      evidence: `Auto-lock ${autoLockMinutes ? `${autoLockMinutes} minutes` : 'off'}.`,
      fallback: 'One named user per device until auto-lock is configured.',
    },
  ]
  const hardwarePolicySummary = hardwarePolicyItems.reduce(
    (summary, item) => {
      summary[item.status] += 1
      return summary
    },
    { ready: 0, review: 0, blocked: 0 } as Record<PosHardwarePolicyStatus, number>,
  )
  const hardwarePilotAllowed = hardwarePolicySummary.blocked === 0 || (
    hardwarePolicySummary.blocked === 1 && hardwarePolicyItems.some((item) => item.id === 'shared-terminal-lock' && item.status === 'blocked')
  )
  const launchPilotBlockers = [
    !isOnline ? 'POS is currently offline.' : '',
    pendingSyncCount > 0 ? `${pendingSyncCount} sync action(s) are still pending or failed.` : '',
    deploymentGateSummary.blocked > 0 ? `${deploymentGateSummary.blocked} deployment gate(s) are blocked.` : '',
    !hardwarePilotAllowed ? `${hardwarePolicySummary.blocked} hardware policy item(s) are blocked.` : '',
  ].filter(Boolean)
  const launchProductionBlockers = [
    salesTenantCloudMode !== 'cloud' ? 'Durable tenant database/control-plane sync is not confirmed.' : '',
    enterpriseSummary.missing > 0 ? `${enterpriseSummary.missing} enterprise readiness item(s) are missing.` : '',
    deploymentGateSummary.blocked > 0 ? `${deploymentGateSummary.blocked} deployment gate(s) are blocked.` : '',
    hardwarePolicySummary.blocked > 0 ? `${hardwarePolicySummary.blocked} hardware policy item(s) are blocked.` : '',
    pendingSyncCount > 0 ? `${pendingSyncCount} sync action(s) are still pending or failed.` : '',
    autoLockMinutes <= 0 ? 'Shared-terminal auto-lock is off.' : '',
    'Automated cloud backup/restore rehearsal is not complete.',
    'Support SLA owner, ticket queue, and incident resolution workflow are not signed off.',
    'Tax, service charge, discount, void, refund, and daily settlement policy are not signed off.',
  ].filter(Boolean)
  const launchCertificationStatus = {
    guidedPilot: launchPilotBlockers.length === 0 ? 'ready' : 'blocked',
    paidProduction: launchProductionBlockers.length === 0 ? 'ready' : 'blocked',
  }
  const enterpriseGoLiveCards = [
    {
      id: 'launch-certification',
      label: 'Launch certification',
      value: `${launchCertificationStatus.guidedPilot === 'ready' ? 'Pilot ready' : 'Pilot blocked'} / ${launchCertificationStatus.paidProduction === 'ready' ? 'Paid ready' : 'Paid blocked'}`,
      detail: launchCertificationStatus.paidProduction === 'ready'
        ? 'All production gates are closed for a paid rollout.'
        : 'Guided pilot may proceed only if pilot blockers are clear; paid production remains gated.',
    },
    {
      id: 'manual-payment',
      label: 'Payment mode',
      value: enterprisePaymentOption.label,
      detail: enterprisePaymentOption.detail,
    },
    {
      id: 'printer-mode',
      label: 'Printer mode',
      value: enterprisePrinterOption.label,
      detail: enterprisePrinterOption.detail,
    },
    {
      id: 'offline-policy',
      label: 'Offline policy',
      value: enterpriseOfflineOption.label,
      detail: enterpriseOfflineOption.detail,
    },
    {
      id: 'backup-drill',
      label: 'Backup drill',
      value: salesTenantCloudMode === 'cloud' ? 'Cloud + export path' : 'Manual export path',
      detail: 'Export backup JSON and validate restore file before paid go-live.',
    },
    {
      id: 'hardware-policy',
      label: 'Hardware policy',
      value: `${hardwarePolicySummary.ready} ready / ${hardwarePolicySummary.review} review / ${hardwarePolicySummary.blocked} blocked`,
      detail: 'Device matrix, implementation owner, fallback mode, and acceptance checks are exportable.',
    },
  ]
  const supportOpenCount = supportIncidents.filter((incident) => incident.status !== 'resolved').length
  const supportSev1Count = supportIncidents.filter((incident) => incident.severity === 'sev1' && incident.status !== 'resolved').length
  const supportQueueCards = [
    {
      id: 'open',
      label: 'Open incidents',
      value: `${supportOpenCount}`,
      detail: supportOpenCount ? 'Review before daily closeout or client follow-up.' : 'No active support blockers in this workspace.',
    },
    {
      id: 'sev1',
      label: 'SEV1',
      value: `${supportSev1Count}`,
      detail: supportSev1Count ? 'Business-stopping issue needs immediate escalation.' : 'No business-stopping incident recorded.',
    },
    {
      id: 'mode',
      label: 'Queue mode',
      value: hasLiveWorkspaceApi() ? 'Cloud API' : 'Local fallback',
      detail: hasLiveWorkspaceApi() ? 'Incidents save to workspace-scoped backend snapshot.' : 'Use JSON packet export until cloud API is reachable.',
    },
    {
      id: 'policy',
      label: 'Current policy',
      value: `${enterprisePrinterOption.label} / ${enterprisePaymentOption.label}`,
      detail: `${enterpriseOfflineOption.label}. Hardware: ${hardwarePolicySummary.ready} ready / ${hardwarePolicySummary.review} review / ${hardwarePolicySummary.blocked} blocked.`,
    },
  ]
  const supportFallbackIncident: PosSupportIncidentRow = {
    incident_id: 'empty-support-desk',
    status: 'open',
    severity: supportSeverity,
    category: supportCategory,
    summary: 'No persisted incidents yet. Create one when a client cannot close out, print, access a role, sync, or reconcile payment proof.',
    next_action: 'Create an incident with current device/payment/sync state.',
    owner: 'SuperMega support',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const visibleSupportQueueCards = compactViewport ? supportQueueCards.slice(0, 2) : supportQueueCards
  const supportIncidentRowsForDisplay = (supportIncidents.length ? supportIncidents : [supportFallbackIncident]).slice(0, compactViewport ? 4 : 12)
  const aiNativeBriefText = [
    `POS AI-native readiness brief`,
    `Workspace: ${companyDisplayName}`,
    `Business: ${businessProfile.label}`,
    `Role: ${role?.label || session.activeRole}`,
    `Location: ${activeLocationLabel}`,
    `Date: ${new Date().toISOString()}`,
    ``,
    `Readiness: ${enterpriseSummary.live} live / ${enterpriseSummary.build} in build / ${enterpriseSummary.missing} missing`,
    `Deployment gates: ${deploymentGateSummary.ready} ready / ${deploymentGateSummary.review} review / ${deploymentGateSummary.blocked} blocked`,
    `Sync queue: ${syncSummary.queued} queued / ${syncSummary.failed} failed / ${syncSummary.synced} synced`,
    `Offline risk: ${offlineSyncRisk.statusLabel} / 24h+ ${offlineSyncRisk.reviewCount} / 72h+ ${offlineSyncRisk.criticalCount} / oldest ${formatPendingAge(offlineSyncRisk.oldestPendingMinutes)}`,
    `AI-native stack: ${aiNativeSummary.live} live / ${aiNativeSummary.build} in build / ${aiNativeSummary.next} next`,
    ``,
    `Top gaps:`,
    ...(aiNativeTopGaps.length
      ? aiNativeTopGaps.map((item) => `- ${item.title}: ${item.detail}`)
      : ['- No immediate AI-native gaps flagged for this workspace.']),
  ].join('\n')
  const ownerCloseoutEvidenceLines = [
    `Business pack: ${businessProfile.label}`,
    `Role scope: ${roleScopeLine || activeIdentityLine}`,
    `Payment policy: ${enterprisePaymentOption.label}`,
    `Print policy: ${enterprisePrinterOption.label}`,
    `Offline policy: ${enterpriseOfflineOption.label}`,
    `Support queue: ${supportOpenCount} open / ${supportSev1Count} SEV1`,
    `Sync queue: ${syncSummary.queued} queued / ${syncSummary.failed} failed / ${syncSummary.synced} synced`,
  ]
  const ownerCloseoutRiskLines = [
    supportSev1Count > 0 ? `Escalate ${supportSev1Count} SEV1 support incident(s) before closing the day.` : '',
    supportOpenCount > 0 ? `Review ${supportOpenCount} open support incident(s) before owner follow-up.` : '',
    pendingSyncCount > 0 ? `Flush or review ${pendingSyncCount} pending sync action(s) before logout or role switch.` : '',
    deploymentGateSummary.blocked > 0 ? `Keep paid go-live blocked: ${deploymentGateSummary.blocked} deployment gate(s) still blocked.` : '',
    hardwarePolicySummary.blocked > 0 ? `Hardware policy has ${hardwarePolicySummary.blocked} blocked item(s); keep normal browser print/manual proof fallback active.` : '',
    launchCertificationStatus.paidProduction === 'blocked' ? 'Do not promise durable production history until strict DB/readiness gate passes.' : '',
  ].filter(Boolean)
  const ownerCloseoutNextActionLines = workspaceNextActions.slice(0, 3)
  const ownerCloseoutBriefText = [
    `# SuperMega POS owner daily closeout brief`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Workspace: ${companyDisplayName}`,
    `Location: ${activeLocationLabel}`,
    `Business: ${businessProfile.label}`,
    `Role: ${role?.label || session.activeRole}`,
    `Status: ${launchCertificationStatus.guidedPilot === 'ready' ? 'pilot-ready' : 'pilot-review'} / ${launchCertificationStatus.paidProduction === 'ready' ? 'paid-production-ready' : 'paid-production-blocked'}`,
    ``,
    `## What happened`,
    ...ownerCloseoutEvidenceLines.map((line) => `- ${line}`),
    ``,
    `## Risks to review`,
    ...(ownerCloseoutRiskLines.length
      ? ownerCloseoutRiskLines.map((line) => `- ${line}`)
      : ['- No support, sync, or launch-blocking risk is currently flagged.']),
    ``,
    `## Next actions`,
    ...ownerCloseoutNextActionLines.map((line) => `- ${line}`),
    ``,
    `## Client-safe note`,
    `This brief is for owner/manager closeout review. It does not authorize autonomous refunds, discounts, stock changes, or customer messages without human approval.`,
  ].join('\n')
  const clientQuickStartText = [
    '# SuperMega POS quick start',
    '',
    `Prepared: ${new Date().toISOString()}`,
    `Workspace: ${companyDisplayName}`,
    `Business pack: ${businessProfile.label}`,
    `Location: ${activeLocationLabel}`,
    `Role: ${role?.label || session.activeRole}`,
    '',
    '## First day checklist',
    '',
    ...helpDailyFlowCards.map((card) => `- ${card.label}: ${card.value}`),
    '',
    '## Payment and printing',
    '',
    `- Payment path: ${enterprisePaymentOption.label}. ${enterprisePaymentOption.detail}`,
    `- Printing path: ${enterprisePrinterOption.label}. ${enterprisePrinterOption.detail}`,
    `- Offline rule: ${enterpriseOfflineOption.label}. ${enterpriseOfflineOption.detail}`,
    '- If printing fails, use Save as PDF or digital receipt and report the issue to SuperMega.',
    '- If payment proof is unclear, pause closeout until the owner or manager approves the reference.',
    '',
    '## What this role can use',
    '',
    ...helpBusinessCards.map((card) => `- ${card.label}: ${card.value}`),
    ...helpPolicyCards.map((card) => `- ${card.label}: ${card.value}`),
    '',
    '## Human approval boundary',
    '',
    '- AI and POS notes can summarize work, risks, exceptions, and next actions.',
    '- A human owner or manager must approve refunds, discounts, stock changes, customer messages, payment references, and staff access changes.',
    '',
    '## Support path',
    '',
    '- Send the business name, role, device, screenshot, expected result, actual result, and urgency to SuperMega.',
    '- Use POS for daily work, Setup for staff/role changes, and Help for this quick guide.',
    '- Account, printer, device, backup, and workflow changes are requested through SuperMega.',
    '',
    '## Not included in this quick start',
    '',
    '- Native card-terminal processing.',
    '- Silent thermal printer control, cash drawer kick, scanner automation, or device procurement.',
    '- Autonomous money, inventory, customer-message, or staff-access changes without human approval.',
    '',
    'Send usernames or reset instructions separately through the approved owner channel. Do not store passwords in this file.',
  ].join('\n')
  const clientSupportRequestText = [
    '# SuperMega POS support request',
    '',
    `Prepared: ${new Date().toISOString()}`,
    `Workspace: ${companyDisplayName}`,
    `Business pack: ${businessProfile.label}`,
    `Location: ${activeLocationLabel}`,
    `Role: ${role?.label || session.activeRole}`,
    `Sync status: ${syncSummary.queued} queued / ${syncSummary.failed} failed / ${syncSummary.synced} synced`,
    '',
    '## Issue summary',
    '',
    '- What happened: ',
    '- Expected result: ',
    '- Actual result: ',
    '- Urgency: normal / today / cannot operate',
    '- Device: phone / tablet / laptop / desktop',
    '- Browser: Chrome / Safari / Edge / other',
    '',
    '## Steps to reproduce',
    '',
    '1. Open POS, Setup, or Help.',
    '2. Describe the button, screen, order, booking, stock item, payment proof, or role action.',
    '3. Attach a screenshot or photo if available.',
    '',
    '## Current operating context',
    '',
    ...helpDailyFlowCards.map((card) => `- ${card.label}: ${card.value}`),
    `- Payment path: ${enterprisePaymentOption.label}. ${enterprisePaymentOption.detail}`,
    `- Printing path: ${enterprisePrinterOption.label}. ${enterprisePrinterOption.detail}`,
    `- Offline rule: ${enterpriseOfflineOption.label}. ${enterpriseOfflineOption.detail}`,
    '',
    '## Human approval boundary',
    '',
    '- Do not process refunds, discounts, stock changes, customer messages, or staff access changes until the owner or manager approves.',
    '- SuperMega can review the request and send a patch, setup change, or operating instruction after approval.',
    '',
    '## Client-safe note',
    '',
    '- Do not include passwords in this file.',
    '- Send this file with a screenshot through the approved owner support channel.',
  ].join('\n')
  const ownerCloseoutCards = [
    {
      id: 'status',
      label: 'Closeout status',
      value: `${launchCertificationStatus.guidedPilot === 'ready' ? 'Pilot ready' : 'Review needed'} / ${supportOpenCount} support open`,
    },
    {
      id: 'sync',
      label: 'Sync before logout',
      value: `${pendingSyncCount} pending / ${offlineSyncRisk.statusLabel}`,
    },
    {
      id: 'risk',
      label: 'Owner risk',
      value: ownerCloseoutRiskLines[0] || 'No immediate closeout blocker flagged.',
    },
  ]

  function appendSyncAction(actionType: PosSyncLedgerActionType, summary: string) {
    const next = enqueuePosSyncLedgerEntry(workspaceScopeKey, { actionType, summary })
    setSyncLedger(next)
  }

  function updateEnterpriseSetting(next: Partial<PosEnterpriseSettings>) {
    setEnterpriseSettings((current) => normalizeEnterpriseSettings({ ...current, ...next }))
  }

  function buildInvoicePayload(kind: 'invoice' | 'receipt') {
    const invoiceNumber = buildInvoiceNumber(workspaceScopeKey)
    const subtotal = invoiceAmountValue
    const total = subtotal
    return {
      version: 1,
      kind,
      invoiceNumber,
      generatedAt: new Date().toISOString(),
      workspace: {
        companyName: companyDisplayName,
        location: activeLocationLabel,
        scope: activeScopeLine,
        businessType: activeSession.activeBusinessType,
        workspaceSlug: activeSession.workspaceSlug,
      },
      customer: {
        name: invoiceCustomerLabel,
      },
      payment: {
        mode: enterprisePaymentOption.label,
        processingBoundary: 'manual-or-external-proof',
        providerSetup: enterprisePaymentOption.setup,
        providerDetail: enterprisePaymentOption.detail,
        status: kind === 'receipt' ? 'recorded-manual-proof' : 'payment-requested',
      },
      print: {
        mode: enterprisePrinterOption.label,
        detail: enterprisePrinterOption.detail,
      },
      lines: [
        {
          label: invoiceServiceLabel,
          quantity: 1,
          amount: subtotal,
          note: pilotKit.sourceNote,
        },
      ],
      totals: {
        subtotal,
        tax: 0,
        serviceCharge: 0,
        total,
        currency: 'MMK',
      },
      closeout: {
        offlinePolicy: enterpriseOfflineOption.label,
        note: invoiceNoteText,
        operator: activeSession.displayName,
        role: role?.label || activeSession.activeRole,
      },
    }
  }

  function buildPrintableInvoiceHtml(kind: 'invoice' | 'receipt') {
    const payload = buildInvoicePayload(kind)
    const title = kind === 'receipt' ? 'Receipt' : 'Invoice'
    const line = payload.lines[0]
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} ${escapeHtml(payload.invoiceNumber)}</title>
  <style>
    @page { size: auto; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #101820; font-family: Arial, sans-serif; background: white; }
    .page { width: min(100%, 760px); margin: 0 auto; padding: 24px; }
    .receipt { max-width: 320px; padding: 12px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.03em; }
    .receipt h1 { font-size: 20px; }
    p { margin: 4px 0; }
    .muted { color: #526071; font-size: 12px; }
    .kicker { color: #0b7895; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
    table { width: 100%; margin-top: 18px; border-collapse: collapse; }
    th, td { padding: 10px 0; border-bottom: 1px solid #d9e1ea; text-align: left; vertical-align: top; }
    th:last-child, td:last-child { text-align: right; }
    .total { margin-top: 16px; padding-top: 14px; border-top: 2px solid #101820; font-size: 20px; font-weight: 900; text-align: right; }
    .box { margin-top: 16px; padding: 12px; border: 1px solid #d9e1ea; border-radius: 12px; }
    @media print {
      .page { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <main class="page ${enterprisePrinterOption.id === 'browser-print' ? 'receipt' : ''}">
    <p class="kicker">pos.supermega.dev</p>
    <h1>${escapeHtml(title)}</h1>
    <p><strong>${escapeHtml(payload.workspace.companyName)}</strong></p>
    <p>${escapeHtml(payload.workspace.location)}</p>
    <p class="muted">${escapeHtml(payload.invoiceNumber)} / ${escapeHtml(new Date(payload.generatedAt).toLocaleString())}</p>
    <div class="box">
      <p><strong>Customer:</strong> ${escapeHtml(payload.customer.name)}</p>
      <p><strong>Payment:</strong> ${escapeHtml(payload.payment.mode)}</p>
      <p><strong>Operator:</strong> ${escapeHtml(payload.closeout.operator)} / ${escapeHtml(payload.closeout.role)}</p>
    </div>
    <table>
      <thead>
        <tr><th>Item</th><th>Total</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${escapeHtml(line.label)}</strong><br /><span class="muted">${escapeHtml(payload.closeout.note)}</span></td>
          <td>${escapeHtml(formatMmk(line.amount))}</td>
        </tr>
      </tbody>
    </table>
    <p class="total">Total ${escapeHtml(formatMmk(payload.totals.total))}</p>
    <div class="box">
      <p><strong>Print mode:</strong> ${escapeHtml(payload.print.mode)}</p>
      <p class="muted">${escapeHtml(payload.print.detail)}</p>
      <p class="muted">${escapeHtml(payload.payment.providerDetail)}</p>
    </div>
    <p class="muted">Generated by SuperMega POS. Keep this with daily closeout evidence.</p>
  </main>
</body>
</html>`
  }

  function handlePrintInvoice(kind: 'invoice' | 'receipt' = 'invoice') {
    const html = buildPrintableInvoiceHtml(kind)
    const opened = openPrintableDocument(html, `${workspaceScopeKey}-${kind}.html`)
    appendSyncAction('invoice.print', `${kind === 'receipt' ? 'Receipt' : 'Invoice'} generated for ${invoiceCustomerLabel}: ${formatMmk(invoiceAmountValue)}.`)
    setEnterpriseMessage(
      opened
        ? `${kind === 'receipt' ? 'Receipt' : 'Invoice'} opened in browser print. Select any installed office or receipt printer.`
        : 'Popup blocked. Printable HTML was downloaded instead; open it and print from the browser.',
    )
  }

  function handleExportInvoiceJson() {
    const payload = buildInvoicePayload('invoice')
    downloadJsonFile(`${workspaceScopeKey}-invoice-${payload.invoiceNumber}.json`, payload)
    appendSyncAction('invoice.print', `Invoice JSON exported for ${invoiceCustomerLabel}: ${formatMmk(invoiceAmountValue)}.`)
    setEnterpriseMessage('Invoice JSON exported for manual reconciliation and closeout evidence.')
  }

  function handleLogPaymentPolicy() {
    appendSyncAction('payment.manual', `Payment policy set: ${enterprisePaymentOption.label}; offline policy ${enterpriseOfflineOption.label}.`)
    setEnterpriseMessage(`Payment policy saved: ${enterprisePaymentOption.label}. POS will record proof and closeout evidence; no integrated provider or terminal startup is required.`)
  }

  function handlePrintHardwareTest() {
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SuperMega POS printer test</title>
  <style>
    @page { margin: 8mm; }
    body { color: #111; font-family: Arial, sans-serif; }
    .ticket { max-width: 320px; border: 1px dashed #111; padding: 14px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { margin: 4px 0; font-size: 12px; }
  </style>
</head>
<body>
  <section class="ticket">
    <h1>SUPERMEGA POS TEST</h1>
    <p>${escapeHtml(companyDisplayName)}</p>
    <p>${escapeHtml(activeLocationLabel)}</p>
    <p>Printer mode: ${escapeHtml(enterprisePrinterOption.label)}</p>
    <p>Time: ${escapeHtml(new Date().toLocaleString())}</p>
    <p>If this prints, normal browser printing is ready.</p>
  </section>
</body>
</html>`
    const opened = openPrintableDocument(html, `${workspaceScopeKey}-printer-test.html`)
    appendSyncAction('hardware.test', `Printer test generated: ${enterprisePrinterOption.label}.`)
    setEnterpriseMessage(opened ? 'Printer test opened. Use the OS/browser print dialog to select the client printer.' : 'Printer test HTML downloaded because popup was blocked.')
  }

  function buildHardwarePolicyPayload() {
    return {
      version: 1,
      type: 'supermega-pos-hardware-implementation-policy',
      generatedAt: new Date().toISOString(),
      workspace: {
        companyName: companyDisplayName,
        workspaceSlug: activeSession.workspaceSlug,
        businessType: businessProfile.label,
        location: activeLocationLabel,
        role: role?.label || activeSession.activeRole,
        operator: activeSession.displayName,
      },
      boundary: {
        paymentProcessing: 'Manual or external proof only. No integrated payment provider or terminal startup is required for this implementation policy.',
        browserPrint: 'Supported through normal OS/browser print dialog.',
        directHardwareControl: 'Silent thermal print, cash drawer kick, scanner automation, and device fleet health require separate implementation if requested later.',
      },
      selectedModes: {
        paymentMode: enterprisePaymentOption,
        printerMode: enterprisePrinterOption,
        offlinePolicy: enterpriseOfflineOption,
        autoLockMinutes,
      },
      summary: hardwarePolicySummary,
      devicePolicy: hardwarePolicyItems,
      acceptanceChecks: hardwarePolicyItems.map((item) => ({
        id: item.id,
        lane: item.lane,
        owner: item.owner,
        status: item.status,
        acceptance: item.acceptance,
        fallback: item.fallback,
      })),
      dayOneGoNoGo: {
        canPilot: hardwarePolicySummary.blocked === 0 || (
          hardwarePolicySummary.blocked === 1 && hardwarePolicyItems.some((item) => item.id === 'shared-terminal-lock' && item.status === 'blocked')
        ),
        mustCloseBeforePaidLive: hardwarePolicyItems
          .filter((item) => item.status === 'blocked')
          .map((item) => `${item.lane}: ${item.acceptance}`),
        supportTrigger: 'Create a support packet for printer, offline, access, data/export, or hardware issues that block closeout.',
      },
    }
  }

  function handleExportHardwarePolicy() {
    const payload = buildHardwarePolicyPayload()
    downloadJsonFile(`${workspaceScopeKey}-hardware-policy-${new Date().toISOString().slice(0, 10)}.json`, payload)
    appendSyncAction('hardware.policy', `Hardware policy exported: ${hardwarePolicySummary.ready} ready / ${hardwarePolicySummary.review} review / ${hardwarePolicySummary.blocked} blocked.`)
    setEnterpriseMessage('Hardware implementation policy exported. Use it for printer, scanner, cash drawer, device, offline, and shared-terminal setup.')
  }

  function buildLaunchCertificationPayload() {
    return {
      version: 1,
      type: 'supermega-pos-launch-certification',
      generatedAt: new Date().toISOString(),
      workspace: {
        companyName: companyDisplayName,
        workspaceSlug: activeSession.workspaceSlug,
        businessType: businessProfile.label,
        location: activeLocationLabel,
        role: role?.label || activeSession.activeRole,
        operator: activeSession.displayName,
        url: typeof window === 'undefined' ? 'https://pos.supermega.dev/pos/workspace' : window.location.href,
      },
      decision: {
        guidedPilot: launchCertificationStatus.guidedPilot,
        paidProduction: launchCertificationStatus.paidProduction,
        canStartGuidedPilot: launchCertificationStatus.guidedPilot === 'ready',
        canSellAsFullEnterpriseProduction: launchCertificationStatus.paidProduction === 'ready',
      },
      blockers: {
        guidedPilot: launchPilotBlockers,
        paidProduction: launchProductionBlockers,
      },
      evidence: {
        enterpriseReadiness: enterpriseSummary,
        deploymentGates: deploymentGateSummary,
        syncSummary,
        offlineRisk: offlineSyncRisk,
        hardwarePolicySummary,
        salesTenantCloudMode,
        autoLockMinutes,
        paymentMode: enterprisePaymentOption,
        printerMode: enterprisePrinterOption,
        offlinePolicy: enterpriseOfflineOption,
      },
      requiredBeforePaidProduction: [
        'Durable tenant database and control-plane persistence confirmed.',
        'Automated backup/restore rehearsal completed and documented.',
        'Support SLA owner, support ticket queue, and escalation workflow signed off.',
        'Tax/service charge/discount/void/refund/settlement policy signed off.',
        'Client hardware/offline acceptance completed on real devices.',
        'Post-deploy live smoke evidence attached to launch room.',
      ],
      operatingRule: 'Sell as guided pilot or paid setup until paidProduction is ready. Do not present as full enterprise production while blockers remain.',
    }
  }

  function handleExportLaunchCertification() {
    const payload = buildLaunchCertificationPayload()
    downloadJsonFile(`${workspaceScopeKey}-launch-certification-${new Date().toISOString().slice(0, 10)}.json`, payload)
    appendSyncAction('launch.certification', `Launch certification exported: pilot ${launchCertificationStatus.guidedPilot}; paid production ${launchCertificationStatus.paidProduction}.`)
    setEnterpriseMessage(`Launch certification exported. Pilot ${launchCertificationStatus.guidedPilot}; paid production ${launchCertificationStatus.paidProduction}.`)
  }

  function buildClientGoLiveAcceptancePack() {
    const pilotReady = launchCertificationStatus.guidedPilot === 'ready'
    const productionReady = launchCertificationStatus.paidProduction === 'ready'
    const goLiveDecision = pilotReady
      ? 'Ready for a guided client pilot with SuperMega support and agreed manual operating rules.'
      : 'Not ready for client pilot. Close the listed action items before scheduling handoff.'
    const businessChecklist = activeBusinessType === 'spa'
      ? [
          'Run one appointment-to-checkout rehearsal.',
          'Confirm therapist/front desk ownership for service queue and room handover.',
          'Confirm package, deposit, balance, and retail add-on handling.',
        ]
      : activeBusinessType === 'retail'
        ? [
            'Run one counter sale and one stock note rehearsal.',
            'Confirm barcode scanner behavior if the client uses one.',
            'Confirm receiving, return, and daily closeout owners.',
          ]
        : [
            'Run one order-to-closeout rehearsal.',
            'Confirm counter/table/takeaway ownership and kitchen or prep handoff.',
            'Confirm stock, comp, void, and daily closeout owners.',
          ]
    const actionItems = [
      pendingSyncCount > 0 ? `Clear ${pendingSyncCount} pending sync action(s) before handoff.` : '',
      hardwarePolicySummary.blocked > 0 ? 'Close blocked device/printing/shared-terminal acceptance item(s).' : '',
      deploymentGateSummary.blocked > 0 ? 'Close blocked release gate(s) before client handoff.' : '',
      autoLockMinutes <= 0 ? 'Turn on shared-device auto-lock before live client use.' : '',
      productionReady ? '' : 'Keep this as guided pilot/setup scope until durable history, support, and backup commitments are separately accepted.',
    ].filter(Boolean)

    return [
      '# SuperMega POS client go-live acceptance',
      '',
      `Prepared: ${new Date().toISOString()}`,
      `Client workspace: ${companyDisplayName}`,
      `Business pack: ${businessProfile.label}`,
      `Location: ${activeLocationLabel}`,
      `Login URL: ${typeof window === 'undefined' ? 'https://pos.supermega.dev/pos/login' : `${window.location.origin}/pos/login`}`,
      '',
      '## Acceptance decision',
      '',
      `- Decision: ${goLiveDecision}`,
      `- Pilot status: ${pilotReady ? 'ready' : 'needs action'}.`,
      `- Durable production history/SLA: ${productionReady ? 'ready in this workspace' : 'not included in this acceptance unless separately scoped'}.`,
      '',
      '## Accepted operating model',
      '',
      `- Payment proof: ${enterprisePaymentOption.label}. ${enterprisePaymentOption.detail}`,
      `- Printing: ${enterprisePrinterOption.label}. ${enterprisePrinterOption.detail}`,
      `- Offline rule: ${enterpriseOfflineOption.label}. ${enterpriseOfflineOption.detail}`,
      `- Device rule: ${businessDevicePolicy.lane}. ${businessDevicePolicy.requirement}`,
      `- Device acceptance: ${businessDevicePolicy.acceptance}`,
      '- Client daily screens: POS, Setup, and Help.',
      '- SuperMega handles approved account setup, role changes, launch support, and workflow changes.',
      '- If printing fails during pilot, use Save as PDF or digital receipt and report it to SuperMega.',
      '- If payment proof is unclear, pause closeout until the owner or manager approves the reference.',
      '',
      '## Client confirmations',
      '',
      '- Business name, location, currency, timezone, and owner contact are correct.',
      '- Staff roles and approval owners are correct for day-one use.',
      '- Starter services, menu items, products, packages, prices, and closeout rules are accepted for pilot use.',
      '- Primary device and backup device can open the login page.',
      '- One receipt or invoice can be printed through the browser or saved as PDF.',
      '- One support issue can be reported with device, role, screenshot, expected result, and actual result.',
      ...businessChecklist.map((item) => `- ${item}`),
      '',
      '## Not included unless separately scoped',
      '',
      '- Native card-terminal processing.',
      '- Silent thermal printing, cash drawer kick, barcode automation, or device procurement.',
      '- Autonomous refunds, discounts, stock changes, customer messages, or payment settlement.',
      '- Custom accounting, tax, legal, marketing automation, or third-party ordering integration.',
      '- Guaranteed durable production history/SLA beyond the agreed pilot/setup scope.',
      '',
      '## Human approval boundary',
      '',
      '- AI can summarize gaps, draft owner briefs, flag exceptions, and suggest next actions.',
      '- A human owner must approve money movement, refunds, discounts, stock changes, customer messages, staff access, and go-live acceptance.',
      '',
      '## Send separately',
      '',
      '- Assigned username and approved account-start instructions.',
      '- Client intake workbook if any setup data is still missing.',
      '- Client handoff pack, hardware readiness checklist, and client update note when a change is released.',
      '- Support contact and first-week review time.',
      '',
      '## Open action items before handoff',
      '',
      ...(actionItems.length ? actionItems.map((item) => `- ${item}`) : ['- No client-pilot blockers are currently flagged in this workspace.']),
      '',
      '## Client signoff',
      '',
      'Client owner: __________________________',
      '',
      'SuperMega owner: _______________________',
      '',
      'Date: _________________________________',
    ].join('\n')
  }

  function handleExportClientGoLiveAcceptance() {
    const text = buildClientGoLiveAcceptancePack()
    downloadTextFile(`${workspaceScopeKey}-client-go-live-acceptance-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown')
    appendSyncAction('launch.acceptance', `Client go-live acceptance exported: pilot ${launchCertificationStatus.guidedPilot}; production scope ${launchCertificationStatus.paidProduction}.`)
    setEnterpriseMessage('Client go-live acceptance exported. Send it with the handoff pack after the client accepts payment, printing, support, and human-approval rules.')
  }

  function buildWorkspaceBackupPayload() {
    return {
      version: 1,
      type: 'supermega-pos-workspace-backup',
      generatedAt: new Date().toISOString(),
      workspaceScopeKey,
      session: {
        username: activeSession.username,
        companyName: companyDisplayName,
        displayName: activeSession.displayName,
        workspaceSlug: activeSession.workspaceSlug,
        activeBusinessType: activeSession.activeBusinessType,
        activeLocationId: activeSession.activeLocationId,
        activeRole: activeSession.activeRole,
      },
      settings: {
        autoLockMinutes,
        enterprise: enterpriseSettings,
        deployment: {
          environment: deploymentEnvironment,
          releaseOwner: deploymentReleaseOwner,
          versionTag: deploymentVersionTag,
        },
      },
      pilotKit,
      staffDirectory,
      salesTenants,
      roleInvites: redactRoleInviteSecrets(roleInvites),
      handoffPacketQueue,
      syncLedger,
      deploymentPack,
      supportPolicy: {
        severity: supportSeverityOption,
        category: supportCategoryOption,
      },
      hardwarePolicy: buildHardwarePolicyPayload(),
      launchCertification: buildLaunchCertificationPayload(),
    }
  }

  function handleExportWorkspaceBackup() {
    const payload = buildWorkspaceBackupPayload()
    downloadJsonFile(`${workspaceScopeKey}-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`, payload)
    appendSyncAction('backup.export', `Workspace backup exported: ${workspaceScopeKey}.`)
    setRestoreMessage('Workspace backup JSON exported. Store it with the launch room workbook before go-live.')
  }

  function buildRestoreDrillReport(result: PosRestoreDrillResult | null = restoreDrillResult) {
    const fallbackResult: PosRestoreDrillResult = {
      status: 'pending',
      fileName: 'not validated yet',
      validatedAt: new Date().toISOString(),
      message: 'No backup file has been validated in this browser session yet.',
      workspaceScopeKey,
      issue: 'Run Export backup JSON, upload that backup into the restore drill input, then export this report again.',
      sections: [],
    }
    const drillResult = result || fallbackResult
    return {
      version: 1,
      type: 'supermega-pos-restore-drill',
      generatedAt: new Date().toISOString(),
      workspace: {
        companyName: companyDisplayName,
        workspaceSlug: activeSession.workspaceSlug,
        businessType: businessProfile.label,
        location: activeLocationLabel,
        role: role?.label || activeSession.activeRole,
        operator: activeSession.displayName,
        workspaceScopeKey,
      },
      drill: drillResult,
      decision: {
        structureValidated: drillResult.status === 'passed',
        readyForGuidedPilot: drillResult.status === 'passed',
        readyForDurableProductionSla: false,
      },
      acceptance: [
        'Backup JSON has type supermega-pos-workspace-backup.',
        'Backup JSON contains workspace scope, session, staff directory, and sync ledger.',
        'Role invite secrets are redacted in exported backup data.',
        'Client launch folder stores backup JSON, restore drill report, launch room, and support contact.',
      ],
      productionBoundary: [
        'This browser restore drill validates backup structure only.',
        'Durable production SLA still requires managed database restore rehearsal, scheduled backups, and retention policy.',
        'Do not promise production history recovery until strict enterprise gate passes.',
      ],
      evidence: {
        enterpriseReadiness: enterpriseSummary,
        deploymentGates: deploymentGateSummary,
        syncSummary,
        offlineRisk: offlineSyncRisk,
        hardwarePolicySummary,
        supportQueue: {
          severity: supportSeverityOption,
          category: supportCategoryOption,
          incidentCount: supportIncidents.length,
        },
      },
      nextAction: drillResult.status === 'passed'
        ? 'Attach this restore drill report to the launch folder and run managed database restore rehearsal before production SLA.'
        : 'Export backup JSON, validate it with the restore drill file input, then export this report again.',
    }
  }

  function handleExportRestoreDrillReport() {
    const payload = buildRestoreDrillReport()
    downloadJsonFile(`${workspaceScopeKey}-restore-drill-${new Date().toISOString().slice(0, 10)}.json`, payload)
    appendSyncAction('backup.restore-report', `Restore drill report exported: ${payload.drill.status}.`)
    setRestoreMessage(
      payload.drill.status === 'passed'
        ? 'Restore drill report exported. Attach it to the launch folder before handoff.'
        : 'Restore drill report exported as pending. Validate a backup file before production handoff.',
    )
  }

  async function handleValidateRestoreFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Partial<ReturnType<typeof buildWorkspaceBackupPayload>>
      const valid =
        parsed?.type === 'supermega-pos-workspace-backup'
        && parsed.version === 1
        && Boolean(parsed.workspaceScopeKey)
        && Boolean(parsed.session)
        && Array.isArray(parsed.staffDirectory)
        && Array.isArray(parsed.syncLedger)
      if (!valid) {
        const failedResult: PosRestoreDrillResult = {
          status: 'failed',
          fileName: file.name,
          validatedAt: new Date().toISOString(),
          message: 'Restore drill failed: backup file is missing required workspace sections.',
          workspaceScopeKey: String(parsed?.workspaceScopeKey || ''),
          issue: 'Missing required workspace sections.',
          sections: Object.keys(parsed || {}),
        }
        setRestoreDrillResult(failedResult)
        setRestoreMessage(failedResult.message)
        return
      }
      const passedResult: PosRestoreDrillResult = {
        status: 'passed',
        fileName: file.name,
        validatedAt: new Date().toISOString(),
        message: 'Restore drill passed. Backup structure is valid for launch-folder evidence.',
        workspaceScopeKey: String(parsed.workspaceScopeKey || ''),
        sections: ['workspaceScopeKey', 'session', 'staffDirectory', 'syncLedger'],
      }
      setRestoreDrillResult(passedResult)
      appendSyncAction('backup.restore', `Restore drill validated backup file ${file.name}.`)
      setRestoreMessage(`Restore drill passed for ${file.name}. This validates structure only; production restore still needs cloud database rehearsal.`)
    } catch {
      const failedResult: PosRestoreDrillResult = {
        status: 'failed',
        fileName: file.name,
        validatedAt: new Date().toISOString(),
        message: 'Restore drill failed: file is not valid JSON.',
        workspaceScopeKey,
        issue: 'Invalid JSON.',
        sections: [],
      }
      setRestoreDrillResult(failedResult)
      setRestoreMessage(failedResult.message)
    } finally {
      if (restoreInputRef.current) {
        restoreInputRef.current.value = ''
      }
    }
  }

  async function handleRefreshSupportDesk() {
    if (!hasLiveWorkspaceApi()) {
      setSupportDeskMessage('Support desk API is not reachable from this host. Use JSON packet export as fallback.')
      return
    }
    setSupportDeskBusy(true)
    setSupportDeskMessage('Refreshing support desk...')
    try {
      const payload = await getPosSupportIncidents(50)
      const rows = Array.isArray(payload.incidents) ? payload.incidents : []
      setSupportIncidents(rows)
      setSupportDeskMessage(rows.length ? `Support desk refreshed: ${rows.length} incident(s).` : 'Support desk ready. No incidents recorded yet.')
    } catch (error) {
      setSupportDeskMessage(
        isWorkspaceAuthError(error)
          ? 'Support desk requires POS or workspace session.'
          : 'Support desk refresh failed. Check cloud API health.',
      )
    } finally {
      setSupportDeskBusy(false)
    }
  }

  function handleExportSupportDeskJson() {
    const payload = {
      version: 1,
      type: 'supermega-pos-support-desk',
      generatedAt: new Date().toISOString(),
      workspace: {
        companyName: companyDisplayName,
        location: activeLocationLabel,
        businessType: businessProfile.label,
        role: role?.label || activeSession.activeRole,
        operator: activeSession.displayName,
      },
      incidents: supportIncidents,
      currentPolicy: {
        severity: supportSeverityOption,
        category: supportCategoryOption,
        paymentMode: enterprisePaymentOption,
        printerMode: enterprisePrinterOption,
        offlinePolicy: enterpriseOfflineOption,
        hardwarePolicySummary,
        syncSummary,
      },
      nextAction: supportIncidents.length
        ? 'Review open SEV1/SEV2 items before daily closeout and update client owner.'
        : 'Keep support channel ready; create an incident when printer, payment, access, data, or offline work is blocked.',
    }
    downloadJsonFile(`${workspaceScopeKey}-support-desk-${new Date().toISOString().slice(0, 10)}.json`, payload)
    appendSyncAction('support.incident', `Support desk exported with ${supportIncidents.length} incident(s).`)
    setSupportDeskMessage(`Support desk JSON exported with ${supportIncidents.length} incident(s).`)
  }

  function buildChangeRequestPayload() {
    const changeId = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const summary = supportSummary.trim() || 'Client requested POS change'
    const approvalRequired = supportSeverity === 'sev1'
      || supportCategory === 'payment'
      || supportCategory === 'data'
      || supportCategory === 'access'
    return {
      version: 1,
      type: 'supermega-pos-change-request',
      changeId,
      generatedAt: new Date().toISOString(),
      workspace: {
        companyName: companyDisplayName,
        workspaceSlug: activeSession.workspaceSlug,
        location: activeLocationLabel,
        businessType: businessProfile.label,
        role: role?.label || activeSession.activeRole,
        operator: activeSession.displayName,
        url: typeof window === 'undefined' ? 'https://pos.supermega.dev/pos/workspace' : window.location.href,
      },
      request: {
        summary,
        category: supportCategoryOption,
        priority: supportSeverityOption,
        clientVisible: true,
        requestedBy: 'Client or SuperMega support',
        source: 'Internal Support lane',
      },
      impact: {
        touchesMoney: supportCategory === 'payment',
        touchesAccess: supportCategory === 'access',
        touchesDataOrExports: supportCategory === 'data',
        touchesPrinterOrHardware: supportCategory === 'printer',
        touchesOfflineCloseout: supportCategory === 'offline',
      },
      approval: {
        required: approvalRequired,
        owner: approvalRequired ? 'Client owner plus SuperMega release owner' : 'SuperMega support',
        humanApprovalBoundary: 'AI can draft analysis, acceptance criteria, and release note. A human must approve changes affecting money, access, data, inventory, customer messages, or launch readiness.',
      },
      releasePlan: {
        proposedLane: supportSeverity === 'sev1' ? 'hotfix-review' : supportSeverity === 'sev2' ? 'next-patch' : 'training-or-next-release',
        acceptanceCriteria: [
          'Change is scoped to a named client, role, workflow, and expected result.',
          'Client-safe update note is exported after implementation.',
          'POS host/login, Sales Admin handoff, and enterprise smoke gates pass before deployment.',
          'Rollback note or workaround is attached if the change affects daily POS operations.',
        ],
        clientUpdate: 'After implementation, export Client update note from Sales Admin and tell the client what changed, what to test, and who owns follow-up.',
      },
      currentState: {
        syncSummary,
        offlineRisk: offlineSyncRisk,
        paymentMode: enterprisePaymentOption,
        printerMode: enterprisePrinterOption,
        offlinePolicy: enterpriseOfflineOption,
        hardwarePolicySummary,
        supportIncidentCount: supportIncidents.length,
      },
      nextAction: approvalRequired
        ? 'Get owner approval, define acceptance test, then implement and smoke before client release.'
        : 'Add to next support patch or training follow-up, then send client update note after release.',
    }
  }

  function handleExportChangeRequestJson() {
    const payload = buildChangeRequestPayload()
    downloadJsonFile(`${workspaceScopeKey}-${payload.changeId}.json`, payload)
    appendSyncAction('change.request', `${payload.request.priority.label} ${payload.request.category.label} change request exported: ${payload.request.summary}.`)
    const message = `Change request ${payload.changeId} exported. ${payload.nextAction}`
    setSupportDeskMessage(message)
    setEnterpriseMessage(message)
  }

  async function handleCreateSupportIncident() {
    const incidentId = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const payload = {
      version: 1,
      incidentId,
      generatedAt: new Date().toISOString(),
      severity: supportSeverityOption,
      category: supportCategoryOption,
      summary: supportSummary.trim() || 'POS support incident',
      workspace: {
        companyName: companyDisplayName,
        location: activeLocationLabel,
        businessType: businessProfile.label,
        role: role?.label || activeSession.activeRole,
        url: typeof window === 'undefined' ? 'https://pos.supermega.dev/pos/workspace' : window.location.href,
      },
      operatingState: {
        online: isOnline,
        syncSummary,
        offlineRisk: offlineSyncRisk,
        paymentMode: enterprisePaymentOption,
        printerMode: enterprisePrinterOption,
        offlinePolicy: enterpriseOfflineOption,
        hardwarePolicySummary,
        hardwarePolicy: hardwarePolicyItems,
      },
      nextAction: supportSeverityOption.response,
    }
    downloadJsonFile(`${workspaceScopeKey}-${incidentId}.json`, payload)
    appendSyncAction('support.incident', `${supportSeverityOption.label} ${supportCategoryOption.label} incident created: ${payload.summary}.`)
    setEnterpriseMessage(`Support packet ${incidentId} exported. ${supportSeverityOption.response}`)
    if (!hasLiveWorkspaceApi()) {
      setSupportDeskMessage(`Support packet ${incidentId} exported locally. Cloud support desk is unavailable from this host.`)
      return
    }
    setSupportDeskBusy(true)
    try {
      const result = await createPosSupportIncident({
        incident_id: incidentId,
        status: 'open',
        severity: supportSeverity,
        category: supportCategory,
        summary: payload.summary,
        workspace: payload.workspace,
        operating_state: payload.operatingState,
        next_action: payload.nextAction,
        owner: 'SuperMega support',
      })
      if (result.incident) {
        setSupportIncidents((current) => {
          const withoutDuplicate = current.filter((item) => item.incident_id !== result.incident?.incident_id)
          return [result.incident!, ...withoutDuplicate].slice(0, 50)
        })
      }
      setSupportDeskMessage(`Support incident ${incidentId} saved to cloud queue. ${supportSeverityOption.response}`)
    } catch (error) {
      setSupportDeskMessage(
        isWorkspaceAuthError(error)
          ? `Support packet ${incidentId} exported. Cloud queue needs POS/workspace session.`
          : `Support packet ${incidentId} exported. Cloud queue save failed; retry from Support lane.`,
      )
    } finally {
      setSupportDeskBusy(false)
    }
  }

  async function handleUpdateSupportIncident(incident: PosSupportIncidentRow, nextStatus: 'in_progress' | 'resolved') {
    const incidentId = String(incident.incident_id || '').trim()
    if (!incidentId || incidentId === 'empty-support-desk') {
      setSupportDeskMessage('Create or refresh a real support incident before updating status.')
      return
    }
    if (!hasLiveWorkspaceApi()) {
      setSupportDeskMessage('Support status updates need cloud sync. Export the support desk JSON as fallback.')
      return
    }
    const resolutionNote = supportResolutionNote.trim()
      || (nextStatus === 'resolved' ? 'Resolved after support review.' : 'Support review started.')
    const nextAction = nextStatus === 'resolved'
      ? 'Closed after confirmation; keep evidence in client launch folder.'
      : 'SuperMega support is investigating and keeping the client owner updated.'
    setSupportDeskBusy(true)
    setSupportDeskMessage(nextStatus === 'resolved' ? `Resolving ${incidentId}...` : `Marking ${incidentId} in progress...`)
    try {
      const result = await updatePosSupportIncident(incidentId, {
        status: nextStatus,
        owner: incident.owner || 'SuperMega support',
        next_action: nextAction,
        resolution_note: resolutionNote,
      })
      if (result.incident) {
        setSupportIncidents((current) => {
          const withoutDuplicate = current.filter((item) => item.incident_id !== result.incident?.incident_id)
          return [result.incident!, ...withoutDuplicate].slice(0, 50)
        })
      }
      appendSyncAction('support.incident', `${incidentId} marked ${nextStatus}: ${resolutionNote}.`)
      setSupportDeskMessage(`${incidentId} marked ${nextStatus.replace('_', ' ')} and saved to the support queue.`)
    } catch (error) {
      setSupportDeskMessage(
        isWorkspaceAuthError(error)
          ? 'Support status update requires POS or workspace session.'
          : 'Support status update failed. Refresh support desk and retry.',
      )
    } finally {
      setSupportDeskBusy(false)
    }
  }

  function guardExitWithSyncQueue(exitLabel: 'Role switch' | 'Logout') {
    if (syncBusy) {
      setActiveSurface('control')
      setActiveControlPanel('sync')
      setCompactControlMode('sync')
      setSyncMessage(`${exitLabel} is paused while sync is running.`)
      return false
    }
    if (pendingSyncCount > 0) {
      setActiveSurface('control')
      setActiveControlPanel('sync')
      setCompactControlMode('sync')
      setSyncMessage(`${exitLabel} locked: flush ${pendingSyncCount} pending sync action(s) first.`)
      return false
    }
    return true
  }

  function handleSwitchRole() {
    if (!guardExitWithSyncQueue('Role switch')) {
      return
    }
    clearPosActiveRole()
    navigate('/pos/role', { replace: true })
  }

  async function handleLogout() {
    if (!guardExitWithSyncQueue('Logout')) {
      return
    }
    await logoutPosAccount()
    navigate('/pos/login', { replace: true })
  }

  function handleAddStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) {
      setStaffMessage('Session expired. Sign in again.')
      return
    }
    if (!isValidPosStaffPin(staffPin)) {
      setStaffMessage('PIN must be 4 to 8 digits.')
      return
    }
    const next = createPosStaffMember(workspaceScopeKey, staffDirectory, session, {
      displayName: staffName,
      role: staffRole,
      locationId: staffLocationId || session.activeLocationId,
      note: staffNote,
      pin: staffPin,
    })
    if (next.length === staffDirectory.length) {
      setStaffMessage('Staff profile not created. Check required fields and PIN format.')
      return
    }
    const createdStaffName = staffName.trim() || 'Staff'
    setStaffDirectory(next)
    setStaffName('')
    setStaffPin('')
    setStaffNote('')
    setStaffMessage('Staff profile created.')
    appendSyncAction('staff.create', `Created staff profile: ${createdStaffName} / ${staffRole}.`)
    setSyncMessage('Staff action queued for sync.')
  }

  function handleToggleStaff(staffId: string, nextStatus: 'active' | 'suspended') {
    const next = updatePosStaffStatus(workspaceScopeKey, staffDirectory, staffId, nextStatus)
    setStaffDirectory(next)
    const target = next.find((item) => item.id === staffId)
    setStaffMessage(nextStatus === 'suspended' ? 'Staff profile suspended.' : 'Staff profile reactivated.')
    appendSyncAction('staff.status', `${target?.displayName || staffId} status changed to ${nextStatus}.`)
    setSyncMessage('Status change queued for sync.')
  }

  function handleRotatePin(staffId: string) {
    if (typeof window === 'undefined') {
      return
    }
    const entered = window.prompt('Enter new staff PIN (4-8 digits).', '')
    if (entered === null) {
      return
    }
    if (!isValidPosStaffPin(entered)) {
      setStaffMessage('PIN update failed. Use 4 to 8 digits.')
      return
    }
    const next = rotatePosStaffPin(workspaceScopeKey, staffDirectory, staffId, entered)
    const target = next.find((item) => item.id === staffId)
    setStaffDirectory(next)
    setStaffMessage('Staff PIN rotated.')
    appendSyncAction('staff.pin-rotate', `PIN rotated for ${target?.displayName || staffId}.`)
    setSyncMessage('PIN rotation queued for sync.')
  }

  function handleExportDeploymentPack() {
    if (typeof window === 'undefined') {
      return
    }
    const fileBase = `${deploymentPack.workspaceSlug || 'pos-workspace'}-${deploymentPack.environment}-${deploymentPack.versionTag}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^-|-$/g, '')
    const blob = new Blob([JSON.stringify(deploymentPack, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${fileBase || 'pos-deployment-pack'}.json`
    link.click()
    window.URL.revokeObjectURL(url)
    setDeploymentMessage('Deployment pack JSON exported.')
    appendSyncAction('deployment.export', `Deployment pack exported: ${deploymentPack.environment} / ${deploymentPack.versionTag}.`)
    setSyncMessage('Deployment export queued for sync.')
  }

  async function handleCopyDeploymentChecklist() {
    if (typeof window === 'undefined' || !window.navigator.clipboard) {
      setDeploymentMessage('Clipboard not available. Use JSON export.')
      return
    }
    try {
      await window.navigator.clipboard.writeText(deploymentChecklistText)
      setDeploymentMessage('Deployment checklist copied.')
      appendSyncAction('deployment.copy', `Deployment checklist copied: ${deploymentPack.environment} / ${deploymentPack.versionTag}.`)
      setSyncMessage('Deployment checklist action queued for sync.')
    } catch {
      setDeploymentMessage('Checklist copy failed. Use JSON export.')
    }
  }

  function handleFlushSyncQueue() {
    if (syncBusy) {
      return
    }
    if (!isOnline) {
      setSyncMessage('Still offline. Queue will sync when online.')
      return
    }
    setSyncBusy(true)
    try {
      const result = flushPosSyncLedger(workspaceScopeKey, true)
      setSyncLedger(result.entries)
      if (result.failedCount > 0) {
        setSyncMessage(`Sync finished with ${result.failedCount} failure(s).`)
      } else if (result.queuedCount > 0) {
        setSyncMessage(`${result.queuedCount} action(s) still queued.`)
      } else {
        setSyncMessage(`Synced ${result.syncedCount} action(s).`)
      }
    } finally {
      setSyncBusy(false)
    }
  }

  function handleClearSyncedQueue() {
    const next = clearPosSyncedLedger(workspaceScopeKey)
    setSyncLedger(next)
    setSyncMessage('Synced records cleared from local queue.')
  }

  function handleExportSyncQueue() {
    if (typeof window === 'undefined') {
      return
    }
    const fileBase = `${workspaceScopeKey}-sync-ledger`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^-|-$/g, '')
    const blob = new Blob([JSON.stringify(syncLedger, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${fileBase || 'pos-sync-ledger'}.json`
    link.click()
    window.URL.revokeObjectURL(url)
    setSyncMessage('Sync queue exported.')
  }

  async function handleExportSyncQueueExcel() {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const { utils: xlsxUtils, writeFileXLSX } = await import('xlsx')
      const rows = syncLedger.length
        ? syncLedger.map((entry) => ({
          id: entry.id,
          status: entry.status,
          action_type: entry.actionType,
          summary: entry.summary,
          attempt_count: entry.attemptCount,
          created_at: entry.createdAt,
          last_attempt_at: entry.lastAttemptAt || '',
          synced_at: entry.syncedAt || '',
          failure_reason: entry.failureReason || '',
        }))
        : [{ note: 'No sync records yet.' }]
      const workbook = xlsxUtils.book_new()
      const sheet = xlsxUtils.json_to_sheet(rows)
      xlsxUtils.book_append_sheet(workbook, sheet, 'SyncQueue')
      const fileBase = `${workspaceScopeKey}-sync-ledger`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_.]+/g, '-')
        .replace(/^-|-$/g, '')
      writeFileXLSX(workbook, `${fileBase || 'pos-sync-ledger'}.xlsx`)
      setSyncMessage('Sync queue Excel exported.')
    } catch {
      setSyncMessage('Sync queue Excel export failed.')
    }
  }

  async function handleCopyAiNativeBrief() {
    if (typeof window === 'undefined' || !window.navigator.clipboard) {
      setAiNativeMessage('Clipboard is unavailable on this device. Use export instead.')
      return
    }
    try {
      await window.navigator.clipboard.writeText(aiNativeBriefText)
      setAiNativeMessage('AI-native brief copied.')
      appendSyncAction('deployment.copy', 'AI-native readiness brief copied.')
      setSyncMessage('AI-native brief action queued for sync.')
    } catch {
      setAiNativeMessage('Copy failed. Use export instead.')
    }
  }

  function handleExportAiNativeBrief() {
    if (typeof window === 'undefined') {
      return
    }
    const fileBase = `${workspaceScopeKey}-ai-native-brief`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^-|-$/g, '')
    const blob = new Blob([aiNativeBriefText], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${fileBase || 'pos-ai-native-brief'}.txt`
    link.click()
    window.URL.revokeObjectURL(url)
    setAiNativeMessage('AI-native brief exported.')
    appendSyncAction('deployment.export', 'AI-native readiness brief exported.')
    setSyncMessage('AI-native brief export queued for sync.')
  }

  async function handleCopyOwnerCloseoutBrief() {
    if (typeof window === 'undefined' || !window.navigator.clipboard) {
      setOwnerCloseoutMessage('Clipboard is unavailable on this device. Use export instead.')
      return
    }
    try {
      await window.navigator.clipboard.writeText(ownerCloseoutBriefText)
      setOwnerCloseoutMessage('Owner closeout brief copied.')
      appendSyncAction('deployment.copy', 'Owner daily closeout brief copied.')
      setSyncMessage('Owner closeout brief action queued for sync.')
    } catch {
      setOwnerCloseoutMessage('Copy failed. Use export instead.')
    }
  }

  function handleExportOwnerCloseoutBrief() {
    const fileBase = `${workspaceScopeKey}-owner-closeout-${new Date().toISOString().slice(0, 10)}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^-|-$/g, '')
    downloadTextFile(`${fileBase || 'pos-owner-closeout-brief'}.md`, ownerCloseoutBriefText, 'text/markdown')
    setOwnerCloseoutMessage('Owner closeout brief exported.')
    appendSyncAction('deployment.export', 'Owner daily closeout brief exported.')
    setSyncMessage('Owner closeout brief export queued for sync.')
  }

  function handleExportClientQuickStart() {
    const fileBase = `${workspaceScopeKey}-quick-start-${new Date().toISOString().slice(0, 10)}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^-|-$/g, '')
    downloadTextFile(`${fileBase || 'pos-quick-start'}.md`, clientQuickStartText, 'text/markdown')
    appendSyncAction('help.quickstart', `Client quick start exported for ${businessProfile.label} / ${role?.label || activeSession.activeRole}.`)
    setSyncMessage('Client quick start export queued for sync.')
  }

  function handleExportClientSupportRequest() {
    const fileBase = `${workspaceScopeKey}-support-request-${new Date().toISOString().slice(0, 10)}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^-|-$/g, '')
    downloadTextFile(`${fileBase || 'pos-support-request'}.md`, clientSupportRequestText, 'text/markdown')
    appendSyncAction('help.support', `Client support request exported for ${businessProfile.label} / ${role?.label || activeSession.activeRole}.`)
    setSyncMessage('Client support request export queued for sync.')
  }

  function handleModuleQuickAction(action: string, moduleId: PosModuleId | null | undefined) {
    if (moduleId) {
      setSelectedWorkspaceModule(moduleId)
    }
    const normalizedAction = action.toLowerCase()
    if (/print|receipt|menu/.test(normalizedAction)) {
      if (typeof window !== 'undefined') {
        window.print()
      }
      setOwnerCloseoutMessage('Print dialog opened. Use Save as PDF if there is no receipt printer.')
      appendSyncAction('module.print', `${action} requested from ${moduleId || 'active'} module.`)
      return
    }
    if (/support|issue|proof/.test(normalizedAction)) {
      handleExportClientSupportRequest()
      setOwnerCloseoutMessage('Support/proof request exported.')
      return
    }
    if (/owner|close|export note|review/.test(normalizedAction)) {
      handleExportOwnerCloseoutBrief()
      return
    }
    setOwnerCloseoutMessage(`${action} selected. Capture proof, then print/export before closeout.`)
    appendSyncAction('module.action', `${action} selected from ${moduleId || 'active'} module.`)
  }

  function handleSalesTenantBusinessTypeChange(nextBusinessType: PosBusinessType) {
    setSalesTenantBusinessType(nextBusinessType)
    setSalesTenantRoleTemplate(defaultSalesRoleTemplate(nextBusinessType))
  }

  function handleApplySalesTenantWizardDefaults() {
    const roleTemplate = defaultSalesRoleTemplate(salesTenantBusinessType)
    setSalesTenantRoleTemplate(roleTemplate)
    setSalesTenantLocations((current) => (Math.max(1, Number(current) || 1)).toString())
    setSalesTenantOwner((current) => (current.trim() ? current : session?.displayName || 'Sales lead'))
    setSalesTenantMessage(
      `Recommended setup loaded for ${salesTenantWizardBusinessProfile.label}: ${POS_SALES_ROLE_TEMPLATE_LABELS[roleTemplate]}.`,
    )
  }

  async function handleCreatePilotSetupFromWizard() {
    if (pilotSetupBusyTenantId) {
      return
    }

    const clientName = salesTenantWizardClientName
    if (!clientName) {
      setSalesTenantMessage('Client name is required before creating a pilot setup.')
      return
    }

    const owner = salesTenantOwner.trim() || session?.displayName || 'Sales lead'
    const now = new Date().toISOString()
    const roleTemplate = salesTenantRoleTemplate || defaultSalesRoleTemplate(salesTenantBusinessType)
    const id = `client-${getTenantSlug(clientName)}`
    const existingTenant = salesTenants.find(
      (item) => item.id === id || item.clientName.toLowerCase() === clientName.toLowerCase(),
    )
    const pilotTenant: PosSalesTenantRecord = {
      ...(existingTenant || {}),
      id: existingTenant?.id || id,
      clientName,
      businessType: salesTenantBusinessType,
      stage: existingTenant?.stage || 'lead',
      owner,
      roleTemplate,
      locationCount: salesTenantWizardLocationCount,
      status: existingTenant?.status || 'new',
      contractStatus: existingTenant?.contractStatus || 'draft',
      billingStatus: existingTenant?.billingStatus || 'not-configured',
      kind: 'client',
      updatedAt: existingTenant?.updatedAt || now,
    }

    setSalesTenantOwner(owner)
    setSalesTenantRoleTemplate(roleTemplate)
    await handleStartPilotSetup(pilotTenant)
    setSalesTenantName('')
    setSalesTenantLocations('1')
  }

  function upsertSalesTenantLane({
    rawClientName,
    businessType,
    owner,
    roleTemplate,
    locationCount,
    successMessage = 'Client lane added to sales admin registry.',
  }: {
    rawClientName: string
    businessType: PosBusinessType
    owner: string
    roleTemplate: PosSalesRoleTemplate
    locationCount: number
    successMessage?: string
  }) {
    const clientName = normalizeSalesTenantClientName(rawClientName, businessType)
    if (!clientName) {
      setSalesTenantMessage('Client name is required.')
      return null
    }
    const now = new Date().toISOString()
    const id = `client-${getTenantSlug(clientName) || Date.now().toString()}`
    const duplicateRecord = salesTenants.find(
      (item) => item.id === id || item.clientName.toLowerCase() === clientName.toLowerCase(),
    )
    const selectedId = duplicateRecord?.id || id
    setSalesTenants((current) => {
      const duplicate = current.find((item) => item.id === id || item.clientName.toLowerCase() === clientName.toLowerCase())
      if (duplicate) {
        return normalizeSalesTenantRecords(current.map((item) =>
          item.id === duplicate.id
            ? {
              ...item,
              businessType,
              owner,
              roleTemplate,
              locationCount,
              contractStatus: item.contractStatus || 'draft',
              billingStatus: item.billingStatus || 'not-configured',
              kind: 'client',
              updatedAt: now,
            }
            : item,
        ))
      }
      return normalizeSalesTenantRecords([
        {
          id,
          clientName,
          businessType,
          stage: 'lead',
          owner,
          roleTemplate,
          locationCount,
          status: 'new',
          contractStatus: 'draft',
          billingStatus: 'not-configured',
          kind: 'client',
          updatedAt: now,
        },
        ...current,
      ])
    })
    setActiveSalesTenantId(selectedId)
    setSalesTenantName('')
    setSalesTenantLocations('1')
    setSalesTenantBusinessType(businessType)
    setSalesTenantOwner(owner)
    setSalesTenantRoleTemplate(roleTemplate)
    setSalesTenantMessage(successMessage)
    appendSyncAction('staff.create', `Sales registry updated: ${clientName} (${businessType}).`)
    setSyncMessage('Sales registry change queued for sync.')
    return {
      id: selectedId,
      clientName,
      businessType,
      owner,
      roleTemplate,
      locationCount,
    }
  }

  function handleAddSalesTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    upsertSalesTenantLane({
      rawClientName: salesTenantName,
      businessType: salesTenantBusinessType,
      owner: salesTenantOwner.trim() || 'Sales lead',
      roleTemplate: salesTenantRoleTemplate,
      locationCount: Math.max(1, Number(salesTenantLocations) || 1),
    })
  }

  function handleMobileQuickAddSalesTenant() {
    if (typeof window === 'undefined') {
      return
    }
    const currentName = salesTenantName.trim() || (activeSalesTenant?.kind === 'client' ? activeSalesTenant.clientName : '')
    const rawClientName = window.prompt('Client name', currentName)
    if (rawClientName === null) {
      return
    }
    const businessAnswer = (window.prompt('Business type: restaurant, spa, or retail', salesTenantBusinessType) || salesTenantBusinessType)
      .trim()
      .toLowerCase()
    const businessType = (
      businessAnswer === 'restaurant' || businessAnswer === 'spa' || businessAnswer === 'retail'
        ? businessAnswer
        : salesTenantBusinessType
    ) as PosBusinessType
    const owner = (window.prompt('Owner or manager name', salesTenantOwner.trim() || activeSalesTenant?.owner || 'Sales lead') || salesTenantOwner || 'Sales lead').trim()
    const locationAnswer = window.prompt('Number of locations', salesTenantLocations || String(activeSalesTenant?.locationCount || 1))
    const locationCount = Math.max(1, Number(locationAnswer || activeSalesTenant?.locationCount || 1) || 1)
    const record = upsertSalesTenantLane({
      rawClientName,
      businessType,
      owner: owner || 'Sales lead',
      roleTemplate: salesTenantRoleTemplate || defaultSalesRoleTemplate(businessType),
      locationCount,
      successMessage: 'Mobile quick add saved. Start pilot setup when the client is ready.',
    })
    if (record) {
      setCompactSalesMode('clients')
    }
  }

  function handleUpdateSalesTenantStage(tenantId: string, stage: PosSalesStage) {
    const now = new Date().toISOString()
    setActiveSalesTenantId(tenantId)
    setSalesTenants((current) =>
      current.map((item) => (item.id === tenantId ? { ...item, stage, status: stage === 'go-live' ? 'active' : item.status, updatedAt: now } : item)),
    )
  }

  function handleUpdateSalesTenantRoleTemplate(tenantId: string, roleTemplate: PosSalesRoleTemplate) {
    const now = new Date().toISOString()
    setActiveSalesTenantId(tenantId)
    setSalesTenants((current) => current.map((item) => (item.id === tenantId ? { ...item, roleTemplate, updatedAt: now } : item)))
  }

  function handleUpdateSalesTenantContractStatus(tenantId: string, contractStatus: PosSalesContractStatus) {
    const now = new Date().toISOString()
    setActiveSalesTenantId(tenantId)
    setSalesTenants((current) => current.map((item) => (item.id === tenantId ? { ...item, contractStatus, updatedAt: now } : item)))
  }

  function handleUpdateSalesTenantBillingStatus(tenantId: string, billingStatus: PosSalesBillingStatus) {
    const now = new Date().toISOString()
    setActiveSalesTenantId(tenantId)
    setSalesTenants((current) => current.map((item) => (item.id === tenantId ? { ...item, billingStatus, updatedAt: now } : item)))
  }

  async function handleCreateRoleInvite(tenant: PosSalesTenantRecord) {
    if (roleInviteBusy) {
      return
    }
    const inviteeEmail = roleInviteEmail.trim().toLowerCase()
    if (!inviteeEmail || !inviteeEmail.includes('@')) {
      setRoleInviteMessage('Invite email is required.')
      return
    }
    const allowedRole = getPosRoleCatalogForBusiness(tenant.businessType).some((item) => item.id === roleInviteRole)
    if (!allowedRole) {
      setRoleInviteMessage('Selected role is not valid for this business pack.')
      return
    }
    const inviteeName = roleInviteName.trim() || inviteeEmail.split('@')[0] || 'Team member'
    const clientSlug = slugifyInviteToken(tenant.clientName) || slugifyInviteToken(tenant.id) || 'client'
    const inviteeSlug = slugifyInviteToken(inviteeEmail.split('@')[0] || inviteeName) || 'user'
    const username = `role.${roleInviteRole}.${clientSlug}.${inviteeSlug}@clients.pos.supermega.dev`
    const temporaryPassword = buildInvitePassword()
    let status: PosSalesRoleInviteStatus = 'generated'
    let cloudErrorMessage = ''

    setRoleInviteBusy(true)
    try {
      if (salesTenantCloudMode === 'cloud' && hasLiveWorkspaceApi()) {
        await inviteTeamMember({
          email: inviteeEmail,
          name: inviteeName,
          role: roleInviteRole,
          password: temporaryPassword,
        })
        status = 'sent'
      }
    } catch (error) {
      cloudErrorMessage = isWorkspaceAuthError(error)
        ? 'Cloud invite requires authenticated workspace session.'
        : 'Cloud invite failed; saved as local packet.'
    } finally {
      setRoleInviteBusy(false)
    }

    const record: PosSalesRoleInviteRecord = {
      id: `${tenant.id}:${roleInviteRole}:${inviteeEmail}`,
      tenantId: tenant.id,
      tenantName: tenant.clientName,
      businessType: tenant.businessType,
      role: roleInviteRole,
      inviteeName,
      inviteeEmail,
      username,
      temporaryPassword,
      status,
      createdAt: new Date().toISOString(),
    }
    const accountResult = upsertPosProvisionedRoleAccount({
      clientName: tenant.clientName,
      displayName: inviteeName,
      businessType: tenant.businessType,
      role: roleInviteRole,
      username,
      password: temporaryPassword,
    })
    const authRegistrySync = accountResult
      ? await syncPosProvisionedAccountToApi(accountResult.account)
      : { ok: false as const, created: false }
    setRoleInvites((current) => {
      const deduped = current.filter((item) => item.id !== record.id)
      return sortRoleInvites([record, ...deduped]).slice(0, 120)
    })
    setRoleInviteName('')
    setRoleInviteEmail('')
    const loginLine = `Login: ${accountResult?.username || username} / ${accountResult?.password || temporaryPassword}`
    const cloudStatusLine = cloudErrorMessage ? ` Cloud status: ${cloudErrorMessage}` : ''
    const authRegistryLine = authRegistrySync.ok ? ' Auth registry: synced.' : ' Auth registry: local fallback.'
    setRoleInviteMessage(
      status === 'sent'
        ? `Invite sent for ${inviteeEmail} (${roleInviteRole}). ${loginLine}${authRegistryLine}`
        : `Invite packet generated for ${inviteeEmail}. ${loginLine}${cloudStatusLine}${authRegistryLine}`,
    )
    appendSyncAction(
      'staff.create',
      `Role invite ${status === 'sent' ? 'sent' : 'generated'}: ${tenant.clientName} / ${roleInviteRole} / ${inviteeEmail}.`,
    )
    setSyncMessage('Role invite action queued for sync.')
  }

  async function handleExportSalesTenantsExcel() {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const { utils: xlsxUtils, writeFileXLSX } = await import('xlsx')
      const rows = salesTenants.length
        ? salesTenants.map((tenant) => ({
          lane_kind: tenant.kind,
          client_name: tenant.clientName,
          business_type: tenant.businessType,
          stage: tenant.stage,
          owner: tenant.owner,
          role_template: tenant.roleTemplate,
          location_count: tenant.locationCount,
          status: tenant.status,
          contract_status: tenant.contractStatus,
          billing_status: tenant.billingStatus,
          updated_at: tenant.updatedAt,
        }))
        : [{ note: 'No client lanes yet.' }]
      const workbook = xlsxUtils.book_new()
      const sheet = xlsxUtils.json_to_sheet(rows)
      xlsxUtils.book_append_sheet(workbook, sheet, 'Clients')
      writeFileXLSX(workbook, `pos-client-registry-${new Date().toISOString().slice(0, 10)}.xlsx`)
      setSalesTenantMessage('Client registry Excel exported.')
    } catch {
      setSalesTenantMessage('Client registry Excel export failed.')
    }
  }

  function handleExportSalesTenantsJson() {
    if (typeof window === 'undefined') {
      return
    }
    const blob = new Blob([JSON.stringify(salesTenants, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `pos-client-registry-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    window.URL.revokeObjectURL(url)
    setSalesTenantMessage('Client registry JSON exported.')
  }

  async function handleExportSalesControlPlaneExcel() {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const { utils: xlsxUtils, writeFileXLSX } = await import('xlsx')
      const rows = salesTenants.length
        ? salesTenants.map((tenant) => {
          const readiness = getSalesTenantReadiness(tenant)
          const launchGate = getSalesTenantLaunchGate(tenant, salesTenantCloudMode)
          return {
            lane_kind: tenant.kind,
            client_name: tenant.clientName,
            business_type: tenant.businessType,
            stage: tenant.stage,
            status: tenant.status,
            owner: tenant.owner,
            role_template: POS_SALES_ROLE_TEMPLATE_LABELS[tenant.roleTemplate],
            location_count: tenant.locationCount,
            contract_status: tenant.contractStatus,
            billing_status: tenant.billingStatus,
            launch_gate_status: launchGate.status,
            launch_gate_summary: launchGate.summary,
            readiness_score: readiness.score,
            readiness_label: readiness.label,
            readiness_reason: readiness.reason,
            updated_at: tenant.updatedAt,
          }
        })
        : [{ note: 'No client lanes yet.' }]
      const workbook = xlsxUtils.book_new()
      const sheet = xlsxUtils.json_to_sheet(rows)
      xlsxUtils.book_append_sheet(workbook, sheet, 'ClientControlPlane')
      writeFileXLSX(workbook, `pos-client-control-plane-${new Date().toISOString().slice(0, 10)}.xlsx`)
      setSalesTenantMessage('Client control plane Excel exported.')
    } catch {
      setSalesTenantMessage('Client control plane Excel export failed.')
    }
  }

  async function handleExportClientIntakeWorkbook(tenant?: PosSalesTenantRecord | null) {
    if (typeof window === 'undefined') {
      return
    }
    const businessType = tenant?.businessType || salesTenantBusinessType || session?.activeBusinessType || 'restaurant'
    const clientName = normalizeSalesTenantClientName(tenant?.clientName || salesTenantName, businessType)
    const owner = (tenant?.owner || salesTenantOwner || 'Client owner').trim()
    const locationCount = Math.max(1, tenant?.locationCount || Number(salesTenantLocations) || 1)
    const roleTemplate = tenant?.roleTemplate || salesTenantRoleTemplate
    const source = tenant ? 'tenant' : salesTenantName.trim() ? 'wizard' : 'playbook'
    try {
      const { utils: xlsxUtils, writeFileXLSX } = await import('xlsx')
      const workbook = xlsxUtils.book_new()
      const sheets = buildPosClientIntakeWorkbookSheets({
        businessType,
        clientName,
        owner,
        locationCount,
        roleTemplate,
        source,
      })

      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.startHere), 'StartHere')
      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.businessProfile), 'BusinessProfile')
      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.catalog), 'Catalog')
      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.staffRoles), 'StaffRoles')
      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.paymentRules), 'PaymentRules')
      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.hardware), 'Hardware')
      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.launchApprovals), 'LaunchApprovals')
      xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(sheets.offers), 'Offers')

      const slug = getTenantSlug(clientName)
      writeFileXLSX(workbook, `pos-client-intake-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      appendSyncAction('deployment.export', `Client intake workbook exported for ${clientName}.`)
      setSyncMessage('Client intake workbook export queued for sync.')
      setSalesTenantMessage(`Client intake workbook exported for ${clientName}. Send it to the client before pilot setup.`)
    } catch {
      setSalesTenantMessage('Client intake workbook export failed.')
    }
  }

  function buildClientStartMessageForTenant(tenant: PosSalesTenantRecord) {
    const gates = buildClientLaunchRoomGates({
      tenant,
      invites: roleInvites,
      handoffPackets: handoffPacketQueue,
      accounts: provisionedAccounts,
      cloudMode: salesTenantCloudMode,
      auditEvents: posAuditEvents,
      syncSummary,
      staffDirectory,
      autoLockMinutes,
      deploymentGateSummary,
    })
    const launchRoomSummary = summarizeClientLaunchRoomGates(gates)
    const loginUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pos/login`
      : 'https://pos.supermega.dev/pos/login'
    return buildPosClientStartMessage({
      tenant,
      accounts: getProvisionedAccountsForTenant(provisionedAccounts, tenant),
      launchRoomSummary,
      loginUrl,
    })
  }

  function handleExportClientStartMessage(tenant: PosSalesTenantRecord) {
    const text = buildClientStartMessageForTenant(tenant)
    const slug = getTenantSlug(tenant.clientName)
    downloadTextFile(`pos-client-start-message-${slug}-${new Date().toISOString().slice(0, 10)}.txt`, text)
    appendSyncAction('deployment.export', `Client start message exported for ${tenant.clientName}.`)
    setSyncMessage('Client start message export queued for sync.')
    setSalesTenantMessage(`Client start message exported for ${tenant.clientName}. Send this only to the approved owner/contact.`)
  }

  async function handleCopyClientStartMessage(tenant: PosSalesTenantRecord) {
    if (typeof window === 'undefined' || !window.navigator.clipboard) {
      setSalesTenantMessage('Clipboard is unavailable. Use Export client start message instead.')
      return
    }
    try {
      await window.navigator.clipboard.writeText(buildClientStartMessageForTenant(tenant))
      appendSyncAction('deployment.copy', `Client start message copied for ${tenant.clientName}.`)
      setSyncMessage('Client start message copy queued for sync.')
      setSalesTenantMessage(`Client start message copied for ${tenant.clientName}.`)
    } catch {
      setSalesTenantMessage('Client start message copy failed. Use Export client start message instead.')
    }
  }

  function buildClientProposalForTenant(tenant: PosSalesTenantRecord) {
    const loginUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pos/login`
      : 'https://pos.supermega.dev/pos/login'
    return buildPosClientProposal({
      tenant,
      readiness: getSalesTenantReadiness(tenant),
      launchGate: getSalesTenantLaunchGate(tenant, salesTenantCloudMode),
      loginUrl,
    })
  }

  function buildClientUpdateNoteForTenant(tenant: PosSalesTenantRecord) {
    const gates = buildClientLaunchRoomGates({
      tenant,
      invites: roleInvites,
      handoffPackets: handoffPacketQueue,
      accounts: provisionedAccounts,
      cloudMode: salesTenantCloudMode,
      auditEvents: posAuditEvents,
      syncSummary,
      staffDirectory,
      autoLockMinutes,
      deploymentGateSummary,
    })
    const aiCapabilities = getPosAiNativeCapabilities(tenant.businessType)
    const loginUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pos/login`
      : 'https://pos.supermega.dev/pos/login'
    return buildPosClientUpdateNote({
      tenant,
      readiness: getSalesTenantReadiness(tenant),
      launchRoomSummary: summarizeClientLaunchRoomGates(gates),
      aiNativeSummary: summarizeAiNativeCapabilities(aiCapabilities),
      aiNativeGaps: aiCapabilities.filter((capability) => capability.status !== 'live'),
      loginUrl,
    })
  }

  function buildSetupCopilotForTenant(tenant: PosSalesTenantRecord) {
    const gates = buildClientLaunchRoomGates({
      tenant,
      invites: roleInvites,
      handoffPackets: handoffPacketQueue,
      accounts: provisionedAccounts,
      cloudMode: salesTenantCloudMode,
      auditEvents: posAuditEvents,
      syncSummary,
      staffDirectory,
      autoLockMinutes,
      deploymentGateSummary,
    })
    const tenantAccounts = getProvisionedAccountsForTenant(provisionedAccounts, tenant)
    const tenantInvites = roleInvites.filter((invite) => invite.tenantId === tenant.id)
    const tenantPackets = handoffPacketQueue.filter((packet) => packet.tenantId === tenant.id)
    const aiCapabilities = getPosAiNativeCapabilities(tenant.businessType)
    const loginUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pos/login`
      : 'https://pos.supermega.dev/pos/login'
    return buildPosSetupCopilot({
      tenant,
      readiness: getSalesTenantReadiness(tenant),
      launchGate: getSalesTenantLaunchGate(tenant, salesTenantCloudMode),
      launchRoomGates: gates,
      launchRoomSummary: summarizeClientLaunchRoomGates(gates),
      roleInviteCount: tenantInvites.length,
      provisionedAccountCount: tenantAccounts.length,
      handoffPacketCount: tenantPackets.length,
      aiNativeSummary: summarizeAiNativeCapabilities(aiCapabilities),
      aiNativeGaps: aiCapabilities.filter((capability) => capability.status !== 'live'),
      loginUrl,
    })
  }

  function buildHardwareReadinessForTenant(tenant: PosSalesTenantRecord) {
    const loginUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pos/login`
      : 'https://pos.supermega.dev/pos/login'
    return buildPosClientHardwareReadiness({
      tenant,
      paymentOption: enterprisePaymentOption,
      printerOption: enterprisePrinterOption,
      offlineOption: enterpriseOfflineOption,
      businessDevicePolicy: POS_BUSINESS_DEVICE_POLICY[tenant.businessType] || POS_BUSINESS_DEVICE_POLICY.restaurant,
      loginUrl,
    })
  }

  function buildClientHandoffPackForTenant(tenant: PosSalesTenantRecord) {
    const gates = buildClientLaunchRoomGates({
      tenant,
      invites: roleInvites,
      handoffPackets: handoffPacketQueue,
      accounts: provisionedAccounts,
      cloudMode: salesTenantCloudMode,
      auditEvents: posAuditEvents,
      syncSummary,
      staffDirectory,
      autoLockMinutes,
      deploymentGateSummary,
    })
    const aiCapabilities = getPosAiNativeCapabilities(tenant.businessType)
    const loginUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pos/login`
      : 'https://pos.supermega.dev/pos/login'
    return buildPosClientHandoffPack({
      tenant,
      readiness: getSalesTenantReadiness(tenant),
      launchRoomSummary: summarizeClientLaunchRoomGates(gates),
      paymentOption: enterprisePaymentOption,
      printerOption: enterprisePrinterOption,
      offlineOption: enterpriseOfflineOption,
      businessDevicePolicy: POS_BUSINESS_DEVICE_POLICY[tenant.businessType] || POS_BUSINESS_DEVICE_POLICY.restaurant,
      aiNativeSummary: summarizeAiNativeCapabilities(aiCapabilities),
      loginUrl,
    })
  }

  function buildClientLaunchBriefForTenant(tenant: PosSalesTenantRecord) {
    const gates = buildClientLaunchRoomGates({
      tenant,
      invites: roleInvites,
      handoffPackets: handoffPacketQueue,
      accounts: provisionedAccounts,
      cloudMode: salesTenantCloudMode,
      auditEvents: posAuditEvents,
      syncSummary,
      staffDirectory,
      autoLockMinutes,
      deploymentGateSummary,
    })
    const tenantAccounts = getProvisionedAccountsForTenant(provisionedAccounts, tenant)
    const tenantInvites = roleInvites.filter((invite) => invite.tenantId === tenant.id)
    const tenantPackets = handoffPacketQueue.filter((packet) => packet.tenantId === tenant.id)
    const loginUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pos/login`
      : 'https://pos.supermega.dev/pos/login'
    return buildPosClientLaunchBrief({
      tenant,
      readiness: getSalesTenantReadiness(tenant),
      launchGate: getSalesTenantLaunchGate(tenant, salesTenantCloudMode),
      launchRoomGates: gates,
      launchRoomSummary: summarizeClientLaunchRoomGates(gates),
      provisionedAccountCount: tenantAccounts.length,
      roleInviteCount: tenantInvites.length,
      handoffPacketCount: tenantPackets.length,
      cloudMode: salesTenantCloudMode,
      loginUrl,
    })
  }

  function handleExportClientLaunchBrief(tenant: PosSalesTenantRecord) {
    const text = buildClientLaunchBriefForTenant(tenant)
    const slug = getTenantSlug(tenant.clientName)
    downloadTextFile(`pos-client-launch-brief-${slug}-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown')
    appendSyncAction('sales.handoff', `Client launch brief exported for ${tenant.clientName}.`)
    setSyncMessage('Client launch brief export queued for sync.')
    setSalesTenantMessage(`Client launch brief exported for ${tenant.clientName}. Use it as the sales and onboarding command note.`)
  }

  function handleExportClientProposal(tenant: PosSalesTenantRecord) {
    const text = buildClientProposalForTenant(tenant)
    const slug = getTenantSlug(tenant.clientName)
    downloadTextFile(`pos-client-proposal-${slug}-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown')
    appendSyncAction('sales.handoff', `Client proposal exported for ${tenant.clientName}.`)
    setSyncMessage('Client proposal export queued for sync.')
    setSalesTenantMessage(`Client proposal exported for ${tenant.clientName}. Send it before intake/provisioning.`)
  }

  function handleExportClientUpdateNote(tenant: PosSalesTenantRecord) {
    const text = buildClientUpdateNoteForTenant(tenant)
    const slug = getTenantSlug(tenant.clientName)
    downloadTextFile(`pos-client-update-note-${slug}-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown')
    appendSyncAction('sales.handoff', `Client update note exported for ${tenant.clientName}.`)
    setSyncMessage('Client update note export queued for sync.')
    setSalesTenantMessage(`Client update note exported for ${tenant.clientName}. Send after a patch, setup change, or pilot milestone.`)
  }

  function handleExportSetupCopilot(tenant: PosSalesTenantRecord) {
    const text = buildSetupCopilotForTenant(tenant)
    const slug = getTenantSlug(tenant.clientName)
    downloadTextFile(`pos-setup-copilot-${slug}-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown')
    appendSyncAction('sales.handoff', `Setup copilot exported for ${tenant.clientName}.`)
    setSyncMessage('Setup copilot export queued for sync.')
    setSalesTenantMessage(`Setup copilot exported for ${tenant.clientName}. Use it to close setup data, role, device, and launch gaps before training.`)
  }

  function handleExportHardwareReadiness(tenant: PosSalesTenantRecord) {
    const text = buildHardwareReadinessForTenant(tenant)
    const slug = getTenantSlug(tenant.clientName)
    downloadTextFile(`pos-hardware-readiness-${slug}-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown')
    appendSyncAction('sales.handoff', `Hardware readiness exported for ${tenant.clientName}.`)
    setSyncMessage('Hardware readiness export queued for sync.')
    setSalesTenantMessage(`Hardware readiness exported for ${tenant.clientName}. Use it for device, printer, payment proof, and support acceptance before training.`)
  }

  function handleExportClientHandoffPack(tenant: PosSalesTenantRecord) {
    const text = buildClientHandoffPackForTenant(tenant)
    const slug = getTenantSlug(tenant.clientName)
    downloadTextFile(`pos-client-handoff-pack-${slug}-${new Date().toISOString().slice(0, 10)}.md`, text, 'text/markdown')
    appendSyncAction('sales.handoff', `Client handoff pack exported for ${tenant.clientName}.`)
    setSyncMessage('Client handoff pack export queued for sync.')
    setSalesTenantMessage(`Client handoff pack exported for ${tenant.clientName}. Send it with the client manual after setup approval.`)
  }

  async function handleExportClientLaunchRoomExcel(tenant: PosSalesTenantRecord) {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const { utils: xlsxUtils, writeFileXLSX } = await import('xlsx')
      const tenantInvites = roleInvites.filter((invite) => invite.tenantId === tenant.id)
      const tenantPackets = handoffPacketQueue.filter((packet) => packet.tenantId === tenant.id)
      const tenantAccounts = getProvisionedAccountsForTenant(getPosProvisionedAccounts(), tenant)
      const launchGate = getSalesTenantLaunchGate(tenant, salesTenantCloudMode)
      const gates = buildClientLaunchRoomGates({
        tenant,
        invites: roleInvites,
        handoffPackets: handoffPacketQueue,
        accounts: getPosProvisionedAccounts(),
        cloudMode: salesTenantCloudMode,
        auditEvents: posAuditEvents,
        syncSummary,
        staffDirectory,
        autoLockMinutes,
        deploymentGateSummary,
      })
      const gateSummary = summarizeClientLaunchRoomGates(gates)
      const workbook = xlsxUtils.book_new()

      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.json_to_sheet([
          {
            generated_at: new Date().toISOString(),
            client_name: tenant.clientName,
            business_type: tenant.businessType,
            stage: tenant.stage,
            owner: tenant.owner,
            locations: tenant.locationCount,
            readiness_score: getSalesTenantReadiness(tenant).score,
            launch_room_score: gateSummary.score,
            launch_gate_status: launchGate.status,
            cloud_mode: salesTenantCloudMode,
            provisioned_accounts: tenantAccounts.length,
            role_credentials: tenantInvites.length,
            handoff_packets: tenantPackets.length,
            blocked_gates: gateSummary.blocked,
            review_gates: gateSummary.review,
            ready_gates: gateSummary.ready,
          },
        ]),
        'LaunchRoom',
      )

      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.json_to_sheet(gates.map((gate) => ({
          gate_id: gate.id,
          label: gate.label,
          status: gate.status,
          owner: gate.owner,
          evidence: gate.evidence,
          next_action: gate.nextAction,
        }))),
        'ProductionGates',
      )

      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.json_to_sheet(tenantInvites.length ? toRoleInviteExportRows(tenantInvites) : [{ note: 'No role credentials generated yet.' }]),
        'RoleCredentials',
      )

      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.json_to_sheet(tenantPackets.length ? tenantPackets.map((packet) => ({
          tenant_name: packet.tenantName,
          stage: packet.stage,
          generated_at: packet.generatedAt,
          packet_id: packet.id,
        })) : [{ note: 'No handoff packet queued yet.' }]),
        'HandoffPackets',
      )

      const tenantPilotKit = POS_VERTICAL_PILOT_KITS[tenant.businessType] || POS_VERTICAL_PILOT_KITS.restaurant
      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.json_to_sheet([
          {
            section: 'Pilot identity',
            label: tenantPilotKit.title,
            value: tenantPilotKit.location,
            note: tenantPilotKit.sourceNote,
          },
          {
            section: 'Pilot identity',
            label: 'Hours',
            value: tenantPilotKit.hours,
            note: 'Confirm with the client before public launch.',
          },
          ...tenantPilotKit.serviceMenu.map((item) => ({
            section: 'Service menu',
            label: item.label,
            value: item.value,
            note: item.note || '',
          })),
          ...tenantPilotKit.resources.map((item) => ({
            section: 'Resources',
            label: item.label,
            value: item.value,
            note: item.note || '',
          })),
          ...tenantPilotKit.setup.map((item) => ({
            section: 'Setup',
            label: item.label,
            value: item.value,
            note: item.note || '',
          })),
        ]),
        'PilotKit',
      )

      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.json_to_sheet([
          {
            area: 'Support SLA',
            policy: 'Early client response target',
            action: 'Owner or manager issue gets same-day triage; payment/hardware/offline issue gets escalation before closeout.',
          },
          {
            area: 'Change control',
            policy: 'Patch path',
            action: 'Patch repo, run lint/build/live smoke, deploy Vercel, verify pos.supermega.dev, then notify client with exact change note.',
          },
          {
            area: 'Access control',
            policy: 'Support/admin access',
            action: 'No silent impersonation. Support access must be time-bounded and visible in audit trail.',
          },
          {
            area: 'Backup/restore',
            policy: 'Production data safety',
            action: 'Keep cloud source of truth, daily export path, and restore drill before paid go-live.',
          },
        ]),
        'SupportPolicy',
      )

      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.json_to_sheet([
          { order: 1, owner: 'Sales', action: 'Confirm signed agreement, billing owner, and launch date.' },
          { order: 2, owner: 'Implementation', action: 'Run Start pilot setup and verify owner/manager/operator/auditor credentials.' },
          { order: 3, owner: 'Client owner', action: 'Sign in on mobile and desktop, select role, and confirm one-page POS lane fits the workflow.' },
          { order: 4, owner: 'Finance', action: 'Approve manual/external payment proof, tax/service charge, receipt, void/refund, and closeout rules.' },
          { order: 5, owner: 'Support', action: 'Confirm training, support channel, escalation owner, and day-one closeout review time.' },
          { order: 6, owner: 'Engineering', action: 'Run live smoke and screenshot capture after any change before client use.' },
        ]),
        'DayOneRunbook',
      )

      const slug = getTenantSlug(tenant.clientName)
      writeFileXLSX(workbook, `pos-client-launch-room-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      appendSyncAction('deployment.export', `Client launch room exported for ${tenant.clientName}.`)
      setSyncMessage('Client launch room export queued for sync.')
      setSalesTenantMessage(`Client launch room Excel exported for ${tenant.clientName}: ${gateSummary.ready} ready / ${gateSummary.review} review / ${gateSummary.blocked} blocked.`)
    } catch {
      setSalesTenantMessage('Client launch room Excel export failed.')
    }
  }

  function handleExportSalesControlPlaneJson() {
    if (typeof window === 'undefined') {
      return
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      workspace: session?.workspaceSlug || 'pos-workspace',
      totalTenants: salesTenants.length,
      tenants: salesTenants.map((tenant) => ({
        ...tenant,
        roleTemplateLabel: POS_SALES_ROLE_TEMPLATE_LABELS[tenant.roleTemplate],
        readiness: getSalesTenantReadiness(tenant),
        launchGate: getSalesTenantLaunchGate(tenant, salesTenantCloudMode),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `pos-client-control-plane-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    window.URL.revokeObjectURL(url)
    setSalesTenantMessage('Client control plane JSON exported.')
  }

  function handleExportSalesProvisioningPacket(tenant: PosSalesTenantRecord) {
    const queueItem = buildHandoffQueueItem(tenant, session?.workspaceSlug || 'pos-workspace', autoLockMinutes)
    const payload = queueItem.payload
    const slug = tenant.clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    downloadJsonFile(`pos-client-provisioning-${slug || tenant.id}.json`, payload)
    const nextQueue = pushHandoffPacketQueue(workspaceScopeKey, queueItem)
    setHandoffPacketQueue(nextQueue)
    setSalesTenantMessage(`Provisioning packet exported for ${tenant.clientName}.`)
  }

  function handleExportSalesAiHandoffPacket(tenant: PosSalesTenantRecord) {
    const launchGate = getSalesTenantLaunchGate(tenant, salesTenantCloudMode)
    const launchRoomGates = buildClientLaunchRoomGates({
      tenant,
      invites: roleInvites,
      handoffPackets: handoffPacketQueue,
      accounts: provisionedAccounts,
      cloudMode: salesTenantCloudMode,
      auditEvents: posAuditEvents,
      syncSummary,
      staffDirectory,
      autoLockMinutes,
      deploymentGateSummary,
    })
    const packet = buildSalesAiHandoffPacket({
      tenant,
      workspaceSlug: workspaceScopeKey,
      launchGate,
      launchRoomGates,
      cloudMode: salesTenantCloudMode,
      autoLockMinutes,
      syncSummary,
      deploymentGateSummary,
    })
    const slug = getTenantSlug(tenant.clientName)
    downloadJsonFile(`pos-sales-ai-handoff-${slug || tenant.id}-${new Date().toISOString().slice(0, 10)}.json`, packet)
    appendSyncAction('sales.handoff', `Sales AI handoff exported for ${tenant.clientName}.`)
    setSyncMessage('Sales AI handoff export recorded in the sync ledger.')
    setSalesTenantMessage(
      `Sales AI handoff exported for ${tenant.clientName}: ${packet.readiness.launchRoom.score}% launch room / ${packet.aiNative.score}% AI-native.`,
    )
  }

  async function handleProvisionSalesTenantLogin(tenant: PosSalesTenantRecord) {
    if (tenant.kind !== 'client') {
      setSalesTenantMessage('Client login provisioning is available for client lanes only.')
      return
    }
    const launchGate = getSalesTenantLaunchGate(tenant, salesTenantCloudMode)
    if (launchGate.status === 'blocked') {
      setSalesTenantMessage(
        `Launch gate blocked for ${tenant.clientName}: ${launchGate.blockers.join(' ')}`,
      )
      return
    }
    const result = upsertPosProvisionedAccount({
      clientName: tenant.clientName,
      ownerName: tenant.owner,
      businessType: tenant.businessType,
      locationCount: tenant.locationCount,
      goLiveStatus: mapSalesStageToGoLiveStatus(tenant.stage),
    })
    if (!result) {
      setSalesTenantMessage('Client login provisioning failed. Check client lane data.')
      return
    }
    const authRegistrySync = await syncPosProvisionedAccountToApi(result.account)
    const launchPacket = buildSalesLaunchExecutionPacket(
      tenant,
      session?.workspaceSlug || 'pos-workspace',
      autoLockMinutes,
      { username: result.username, password: result.password },
      launchGate,
    )
    const slug = tenant.clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    downloadJsonFile(`pos-client-launch-${slug || tenant.id}.json`, launchPacket)
    appendSyncAction('deployment.export', `Launch packet exported for ${tenant.clientName}.`)
    setSyncMessage('Launch packet export queued for sync.')
    setSalesTenantMessage(
      `${result.created ? 'Provisioned' : 'Updated'} login for ${tenant.clientName}: ${result.username} / ${result.password}${authRegistrySync.ok ? ' / auth synced' : ' / auth pending sync'}`,
    )
  }

  async function handleStartPilotSetup(tenant: PosSalesTenantRecord) {
    if (pilotSetupBusyTenantId) {
      return
    }
    if (tenant.kind !== 'client') {
      setSalesTenantMessage('Start pilot setup is for real client lanes. Add a client lane first, then run pilot setup.')
      setActiveSalesTenantId(tenant.id)
      return
    }

    setPilotSetupBusyTenantId(tenant.id)
    try {
      const now = new Date().toISOString()
      const pilotTenant = buildPilotReadyTenant(tenant, now)
      const pilotRoles = getPilotSetupRolesForBusiness(pilotTenant.businessType)
      const inviteRecords = pilotRoles.map((role) => buildPilotRoleInviteRecord(pilotTenant, role, now))
      const accountResults: PosProvisionedAccountResult[] = []
      const ownerResult = upsertPosProvisionedAccount({
        clientName: pilotTenant.clientName,
        ownerName: pilotTenant.owner,
        businessType: pilotTenant.businessType,
        locationCount: pilotTenant.locationCount,
        goLiveStatus: 'pilot',
      })

      if (ownerResult) {
        accountResults.push(ownerResult)
      }

      for (const invite of inviteRecords) {
        const roleResult = upsertPosProvisionedRoleAccount({
          clientName: pilotTenant.clientName,
          displayName: invite.inviteeName,
          businessType: pilotTenant.businessType,
          role: invite.role,
          username: invite.username,
          password: invite.temporaryPassword,
        })
        if (roleResult) {
          accountResults.push(roleResult)
        }
      }

      const syncResults = await Promise.all(accountResults.map((result) => syncPosProvisionedAccountToApi(result.account)))
      const syncedCount = syncResults.filter((result) => result.ok).length
      const handoffItem = buildHandoffQueueItem(pilotTenant, session?.workspaceSlug || 'pos-workspace', autoLockMinutes)
      const nextSalesTenants = mergeSalesTenantRecords(salesTenants, [pilotTenant])
      const nextRoleInvites = mergeRoleInvites(roleInvites, inviteRecords)
      const nextHandoffPacketQueue = mergeHandoffPacketQueue(handoffPacketQueue, [handoffItem])
      const staffRows = toPosControlPlaneStaffRows(staffDirectory)
      const controlSettings = { auto_lock_minutes: autoLockMinutes }
      let cloudSaveOk = false
      let cloudSaveMessage = 'Pilot setup changed the client lane, role invites, auth registry, and handoff queue.'

      if (hasLiveWorkspaceApi()) {
        const tenantRows = toPosControlPlaneTenantRows(nextSalesTenants)
        const inviteRows = toPosControlPlaneRoleInviteRows(nextRoleInvites)
        const handoffRows = toPosControlPlaneHandoffPacketRows(nextHandoffPacketQueue)
        const settingsHash = JSON.stringify(controlSettings)
        try {
          const result = await updatePosControlPlane({
            sales_tenants: tenantRows,
            role_invites: inviteRows,
            handoff_packets: handoffRows,
            staff_directory: staffRows,
            settings: controlSettings,
          }, { timeoutMs: 45000 })
          salesTenantCloudHashRef.current = JSON.stringify(tenantRows)
          roleInvitesCloudHashRef.current = JSON.stringify(inviteRows)
          handoffPacketCloudHashRef.current = JSON.stringify(handoffRows)
          staffDirectoryCloudHashRef.current = JSON.stringify(staffRows)
          controlSettingsCloudHashRef.current = settingsHash
          const savedAuditEvents = Array.isArray(result.saved?.audit_events) ? result.saved.audit_events : []
          if (savedAuditEvents.length) {
            setPosAuditEvents(savedAuditEvents)
            setPosAuditMessage(`Audit trail refreshed: ${savedAuditEvents.length} event(s).`)
          } else {
            void getPosAuditEvents(40)
              .then((payload) => {
                const rows = Array.isArray(payload.rows) ? payload.rows : []
                if (rows.length) {
                  setPosAuditEvents(rows)
                  setPosAuditMessage(`Audit trail refreshed: ${rows.length} event(s).`)
                }
              })
              .catch(() => {
                setPosAuditMessage('Audit trail will refresh after the next sync.')
              })
          }
          setSalesTenantCloudMode('cloud')
          cloudSaveOk = true
          cloudSaveMessage = `Control plane saved ${tenantRows.length} lane(s), ${inviteRows.length} invite(s), ${handoffRows.length} handoff packet(s), ${staffRows.length} staff profile(s).`
        } catch (error) {
          setSalesTenantCloudMode('local')
          cloudSaveMessage = isWorkspaceAuthError(error)
            ? 'Client setup is queued because the session expired. Sign in again and retry cloud save before handoff.'
            : 'Client setup is queued because cloud save needs retry. Retry before sales handoff.'
        }
      } else {
        cloudSaveMessage = 'Client setup is queued because cloud sync is not reachable from this host. Retry before handoff.'
      }

      setSalesTenants(nextSalesTenants)
      setRoleInvites(nextRoleInvites)
      setHandoffPacketQueue(nextHandoffPacketQueue)
      setActiveSalesTenantId(pilotTenant.id)
      setActiveSalesPanel('clients')
      setCompactSalesMode('clients')
      appendSyncAction(
        'deployment.export',
        `Pilot setup prepared: ${pilotTenant.clientName} / ${inviteRecords.length} role credential(s) / handoff packet queued.`,
      )
      setSyncMessage('Pilot setup queued for sync.')
      setSalesTenantSyncMessage(cloudSaveMessage)
      setRoleInviteMessage(`${inviteRecords.length} pilot role credential(s) generated for ${pilotTenant.clientName}.`)
      setSalesTenantMessage(
        cloudSaveOk
          ? `Pilot setup ready for ${pilotTenant.clientName}: owner login ${ownerResult?.username || 'not created'} / ${ownerResult?.password || 'not created'}; ${inviteRecords.length} role credential(s); ${syncedCount} auth record(s) synced; control plane saved.`
          : `Pilot setup queued for ${pilotTenant.clientName}: owner login ${ownerResult?.username || 'not created'} / ${ownerResult?.password || 'not created'}; ${inviteRecords.length} role credential(s); ${syncedCount} auth record(s) synced; control plane needs retry before handoff.`,
      )
    } finally {
      setPilotSetupBusyTenantId('')
    }
  }

  function handleExportQueuedHandoffPacket(item: PosHandoffPacketQueueItem) {
    const slug = item.tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    downloadJsonFile(`pos-client-provisioning-${slug || item.tenantId}.json`, item.payload)
    setSalesTenantMessage(`Handoff packet exported for ${item.tenantName}.`)
  }

  function handleExportOutsourcedSalesPlaybook() {
    const payload = {
      generatedAt: new Date().toISOString(),
      workspace: session?.workspaceSlug || 'pos-workspace',
      offers: POS_SALES_OFFER_PACKAGES,
      qualificationQuestions: POS_SALES_QUALIFICATION_QUESTIONS,
      onboardingSteps: POS_CLIENT_ONBOARDING_STEPS,
      lanes: POS_OUTSOURCED_SALES_STACK,
      benchmarkNotes: {
        retail: 'Square-style basics: checkout, inventory, staff, customer data, analytics, and reports must stay visible.',
        restaurant: 'Toast-style basics: order flow, kitchen/service handoff, team management, digital ordering path, support, and AI action prompts.',
        spa: 'Vagaro-style basics: appointments, client profiles, service history, forms, packages, marketing, and retention follow-up.',
        permissions: 'Shopify POS-style staff roles and permissions remain central to safe scaling.',
      },
      clientPipeline: salesTenants
        .filter((tenant) => tenant.kind === 'client')
        .map((tenant) => ({
          id: tenant.id,
          clientName: tenant.clientName,
          businessType: tenant.businessType,
          stage: tenant.stage,
          owner: tenant.owner,
          contractStatus: tenant.contractStatus,
          billingStatus: tenant.billingStatus,
          readiness: getSalesTenantReadiness(tenant),
          launchGate: getSalesTenantLaunchGate(tenant, salesTenantCloudMode),
        })),
      kpis: ['lead_to_demo_rate', 'demo_to_pilot_rate', 'pilot_to_live_rate', 'week1_activation_rate'],
    }
    downloadJsonFile(`pos-outsourced-sales-playbook-${new Date().toISOString().slice(0, 10)}.json`, payload)
    setSalesTenantMessage('Outsourced sales playbook exported.')
  }

  function handleExportRoleInvitesJson() {
    if (typeof window === 'undefined') {
      return
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      workspace: session?.workspaceSlug || 'pos-workspace',
      inviteCount: roleInvites.length,
      credentialPolicy: 'Temporary secrets are never stored in POS exports or control-plane audit. Reset credentials if a second handoff is required.',
      invites: redactRoleInviteSecrets(roleInvites),
    }
    downloadJsonFile(`pos-role-invites-${new Date().toISOString().slice(0, 10)}.json`, payload)
    setRoleInviteMessage('Role invites JSON exported.')
  }

  async function handleExportRoleInvitesExcel() {
    if (typeof window === 'undefined') {
      return
    }
    try {
      const { utils: xlsxUtils, writeFileXLSX } = await import('xlsx')
      const rows = roleInvites.length
        ? toRoleInviteExportRows(roleInvites)
        : [{ note: 'No role invites generated yet.' }]
      const workbook = xlsxUtils.book_new()
      const sheet = xlsxUtils.json_to_sheet(rows)
      xlsxUtils.book_append_sheet(workbook, sheet, 'RoleInvites')
      writeFileXLSX(workbook, `pos-role-invites-${new Date().toISOString().slice(0, 10)}.xlsx`)
      setRoleInviteMessage('Role invites Excel exported.')
    } catch {
      setRoleInviteMessage('Role invites Excel export failed.')
    }
  }

  return (
    <div className="sm-pos-workspace-shell">
      <header className={`sm-pos-workspace-header ${compactViewport ? 'is-compact' : ''}`}>
        <div className="sm-pos-workspace-identity">
          <p className="sm-kicker text-[var(--sm-accent)]">pos.supermega.dev</p>
          <h1>{companyDisplayName}</h1>
          <p>{activeScopeLine}</p>
          {compactViewport ? (
            <p className="sm-pos-workspace-subline">{compactIdentityLine}</p>
          ) : (
            <>
              <p className="sm-pos-workspace-subline">{activeIdentityLine}</p>
              {activeLocation ? <p className="sm-pos-workspace-subline">Location status: {activeLocation.status}</p> : null}
            </>
          )}
        </div>
        <div className="sm-pos-workspace-actions">
          <button className="sm-button-secondary" onClick={handleSwitchRole} type="button">
            Switch role
          </button>
          <button className="sm-button-secondary" onClick={() => void handleLogout()} type="button">
            Logout
          </button>
        </div>
      </header>
      {!compactViewport ? (
        <section className="sm-pos-workspace-quickstrip" aria-label="POS workspace status">
          {visibleQuickStatusCards.map((card) => (
            <article className="sm-pos-workspace-quickcard" key={card.id}>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>
      ) : null}
      <section className={`sm-pos-surface-tabs ${compactViewport ? 'is-compact' : ''}`} aria-label="POS workspace surfaces">
        {visibleWorkspaceSurfaces.map((surface) => (
          <button
            aria-pressed={surfaceForDisplay === surface.id}
            className={`sm-pos-control-tab ${surfaceForDisplay === surface.id ? 'is-active' : ''}`}
            key={surface.id}
            onClick={() => setActiveSurface(surface.id)}
            type="button"
          >
            {surface.label}
          </button>
        ))}
      </section>
      {surfaceForDisplay === 'workspace' ? (
        <section className="sm-pos-panel-picker" aria-label="POS workspace view tabs">
          {compactViewport ? (
            <div className="sm-pos-compact-mode-tabs" role="tablist" aria-label="POS workspace compact modes">
              {POS_COMPACT_WORKSPACE_MODES.map((mode) => (
                <button
                  aria-selected={compactWorkspaceMode === mode.id}
                  className={`sm-pos-compact-mode-tab ${compactWorkspaceMode === mode.id ? 'is-active' : ''}`}
                  key={mode.id}
                  onClick={() => setCompactWorkspaceMode(mode.id)}
                  role="tab"
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
          ) : isInternalOperator ? (
            <>
              <label className="sm-pos-panel-picker-label">
                <span className="sm-pos-picker-title">Workspace view</span>
                <select
                  className="sm-input"
                  onChange={(event) => setActiveWorkspaceView(event.target.value as PosWorkspaceRuntimeView)}
                  value={activeWorkspaceView}
                >
                  {POS_WORKSPACE_RUNTIME_VIEWS.map((view) => (
                    <option disabled={compactViewport && view.id === 'runtime'} key={view.id} value={view.id}>
                      {view.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeWorkspaceView === 'runtime' ? (
                <p className="sm-pos-compact-lane-hint">
                  Runtime lab is advanced mode. Use Overview for clean one-screen client walkthroughs.
                </p>
              ) : null}
            </>
          ) : (
            <div className="sm-pos-client-workspace-title">
              <span className="sm-pos-picker-title">Daily POS modules</span>
              <strong>{businessProfile.label} / {role?.label || session.activeRole} / {activeLocationLabel}</strong>
            </div>
          )}
        </section>
      ) : null}
      {surfaceForDisplay === 'control' ? (
        <section className="sm-pos-panel-picker" aria-label="POS workspace control tabs">
          {compactViewport ? (
            <label className="sm-pos-panel-picker-label">
              <span className="sm-pos-picker-title">{isInternalOperator ? 'Control lane' : 'Setup'}</span>
              <select
                className="sm-input"
                onChange={(event) => {
                  const nextMode = event.target.value as PosCompactControlMode
                  setCompactControlMode(nextMode)
                  setActiveControlPanel(nextMode)
                }}
                value={controlPanelForDisplay}
              >
                {visibleCompactControlModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="sm-pos-panel-picker-label">
              <span className="sm-pos-picker-title">{isInternalOperator ? 'Control view' : 'Setup view'}</span>
              <select className="sm-input" onChange={(event) => setActiveControlPanel(event.target.value as PosWorkspaceControlPanel)} value={controlPanelForDisplay}>
                {visibleControlPanels.map((panel) => (
                  <option key={panel.id} value={panel.id}>
                    {panel.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      ) : null}
      {isInternalOperator && surfaceForDisplay === 'sales' ? (
        <section className="sm-pos-panel-picker" aria-label="POS sales administration tabs">
          {compactViewport ? (
            <label className="sm-pos-panel-picker-label">
              <span className="sm-pos-picker-title">Sales lane</span>
              <select
                className="sm-input"
                onChange={(event) => {
                  const nextMode = event.target.value as PosCompactSalesMode
                  setCompactSalesMode(nextMode)
                  setActiveSalesPanel(nextMode)
                }}
                value={salesPanelForDisplay}
              >
                {POS_COMPACT_SALES_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="sm-pos-panel-picker-label">
              <span className="sm-pos-picker-title">Sales view</span>
              <select className="sm-input" onChange={(event) => setActiveSalesPanel(event.target.value as PosSalesPanel)} value={activeSalesPanel}>
                {POS_WORKSPACE_SALES_PANELS.map((panel) => (
                  <option key={panel.id} value={panel.id}>
                    {panel.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      ) : null}

      <section className="sm-pos-surface-panel">
        {surfaceForDisplay === 'workspace' ? (
          <div className={`sm-pos-surface-content is-workspace ${compactViewport ? 'is-compact' : ''}`} aria-label="POS runtime workspace">
            {compactViewport || isInternalOperator ? (
            <section className="sm-pos-status-rail">
              {compactViewport ? (
                <div className="sm-pos-mobile-summary" aria-label="POS mobile status cards">
                  {compactWorkspaceCards.map((card) => (
                    <article className="sm-pos-mobile-summary-card" key={card.id}>
                      <strong>{card.value}</strong>
                    </article>
                  ))}
                </div>
              ) : null}
              {!compactViewport && isInternalOperator && roleAccess ? (
                <p className="sm-pos-role-capability">
                  Role scope: {roleScopeLine}
                </p>
              ) : null}
              {!compactViewport && isInternalOperator && roleAccess && !roleAccess.readOnly && !['owner', 'manager'].includes(roleAccess.role) && managerOverrideHint ? (
                <p className="sm-pos-role-capability">
                  Sensitive actions require manager override PIN. Demo PIN: {managerOverrideHint}
                </p>
              ) : null}
              {!compactViewport && isInternalOperator ? (
                <div className="sm-pos-role-capability flex flex-wrap items-center gap-2">
                  <span>Shared terminal safety: auto-lock</span>
                  <select
                    className="rounded-xl border border-white/20 bg-black/20 px-3 py-1 text-sm text-white"
                    onChange={(event) => setAutoLockMinutes(Number(event.target.value))}
                    value={autoLockMinutes}
                  >
                    {AUTO_LOCK_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? 'Off' : `${minutes} min`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {!compactViewport && isInternalOperator ? (
                <p className="sm-pos-role-capability">
                  Device status: {isOnline ? 'online' : 'offline / local capture only'} / POS registry {salesTenantRegistryStatus.compactLabel} / pending {pendingSyncCount} / {offlineSyncRisk.statusLabel}
                </p>
              ) : null}
              {!compactViewport && isInternalOperator ? (
                <div className="sm-pos-role-capability flex flex-wrap items-center gap-2">
                  <span>Owner daily closeout: {ownerCloseoutCards[0].value}</span>
                  <button className="sm-button-secondary" onClick={handleExportOwnerCloseoutBrief} type="button">
                    Export owner brief
                  </button>
                </div>
              ) : null}
              {isInternalOperator && !compactViewport ? (
                <p className="sm-pos-role-capability">
                  Sales registry: {salesTenantRegistryStatus.label}
                </p>
              ) : null}
            </section>
            ) : null}
            <div className="sm-pos-runtime-shell">
              {activeWorkspaceView === 'overview' ? (
                <div className="sm-pos-workspace-overview">
                  {compactViewport ? (
                    <section className="sm-pos-feature-preview" aria-label="POS mobile overview">
                      {compactWorkspaceMode === 'snapshot'
                        ? (
                          <>
                            <article className="sm-pos-feature-card sm-pos-compact-command-card">
                              <p>Module command center</p>
                              <strong>{activeModuleCommand?.label || defaultRoleModuleLabel}</strong>
                              <small>{activeModuleCommand?.playbook.primaryAction || workspaceClientNextAction}</small>
                              <div className="sm-pos-compact-action-grid" aria-label="Core POS actions">
                                {workspaceCoreActions.map((action) => (
                                  <button
                                    aria-pressed={activeModuleId === action.moduleId}
                                    className={`sm-pos-compact-action ${activeModuleId === action.moduleId ? 'is-active' : ''}`}
                                    key={`compact-core-pos-action-${action.id}`}
                                    onClick={() => setSelectedWorkspaceModule(action.moduleId)}
                                    type="button"
                                  >
                                    <span>{action.label}</span>
                                  </button>
                                ))}
                              </div>
                            </article>
                            {compactWorkspaceOverviewCards.slice(0, 2).map((card) => (
                              <article className="sm-pos-feature-card" key={`workspace-compact-${card.id}`}>
                                <p>{card.label}</p>
                                <strong>{card.value}</strong>
                              </article>
                            ))}
                            <article className="sm-pos-feature-card sm-pos-compact-next-action">
                              <p>Next action</p>
                              <strong>{workspaceClientNextAction}</strong>
                            </article>
                          </>
                        )
                        : null}
                      {compactWorkspaceMode === 'operations'
                        ? (
                          <>
                            {visibleModuleCommandCards.map((card) => (
                              <button
                                aria-pressed={activeModuleId === card.moduleId}
                                className={`sm-pos-feature-card sm-pos-module-card ${activeModuleId === card.moduleId ? 'is-active' : ''}`}
                                key={`workspace-module-mobile-${card.moduleId}`}
                                onClick={() => setSelectedWorkspaceModule(card.moduleId)}
                                type="button"
                              >
                                <p>{card.label}</p>
                                <strong>{card.playbook.primaryAction}</strong>
                                <small className="text-xs text-[var(--sm-muted)]">{card.playbook.stepOne}</small>
                              </button>
                            ))}
                            {workspaceOperationalSignals.slice(0, 1).map((signal) => (
                              <article className="sm-pos-feature-card" key={`workspace-ops-signal-${signal.id}`}>
                                <p>{signal.label}</p>
                                <strong>{signal.value}</strong>
                              </article>
                            ))}
                          </>
                        )
                        : null}
                      {compactWorkspaceMode === 'launch'
                        ? (
                          <>
                            <article className="sm-pos-feature-card">
                              <p>Launch control</p>
                              <strong>{workspaceClientNextAction}</strong>
                              <small className="text-xs text-[var(--sm-muted)]">{isInternalOperator ? workspaceNextActions[1] : 'If anything is blocked, export a support request from Help.'}</small>
                            </article>
                            <article className="sm-pos-feature-card">
                              <p>{isInternalOperator ? 'Deploy gate' : 'Go-live check'}</p>
                              <strong>{deploymentGateSummary.ready} ready / {deploymentGateSummary.blocked} blocked</strong>
                              <small className="text-xs text-[var(--sm-muted)]">
                                {isInternalOperator
                                  ? 'Move to Control for full deployment checklist and sync discipline.'
                                  : 'Open Setup for printer, payment proof, account, and daily closeout checks.'}
                              </small>
                              <div className="sm-pos-staff-actions mt-2">
                                <button
                                  className="sm-button-secondary"
                                  onClick={() => {
                                    setActiveSurface('control')
                                    setCompactControlMode('deployment')
                                  }}
                                  type="button"
                                >
                                  {isInternalOperator ? 'Open deploy lane' : 'Open setup'}
                                </button>
                                {isInternalOperator ? (
                                  <button
                                    className="sm-button-secondary"
                                    onClick={() => {
                                      setActiveSurface('sales')
                                      setCompactSalesMode('handoff')
                                    }}
                                    type="button"
                                  >
                                    Open client handoff
                                  </button>
                                ) : null}
                              </div>
                            </article>
                            <article className="sm-pos-feature-card">
                              <p>Owner daily closeout</p>
                              <strong>{ownerCloseoutCards[0].value}</strong>
                              <small className="text-xs text-[var(--sm-muted)]">{ownerCloseoutCards[1].value}</small>
                              <div className="sm-pos-staff-actions mt-2">
                                <button className="sm-button-secondary" onClick={handleExportOwnerCloseoutBrief} type="button">
                                  Export owner brief
                                </button>
                              </div>
                            </article>
                          </>
                        )
                        : null}
                    </section>
                  ) : (
                    <>
                      <section className="sm-pos-module-command-board" aria-label="POS module command center">
                        <article className="sm-pos-module-primary">
                          <p>Module command center</p>
                          <h2>{activeModuleCommand?.label || businessProfile.label}</h2>
                          <strong>
                            {activeModuleCommand?.playbook.primaryAction || businessProfile.summary}
                          </strong>
                          <span className="sm-pos-module-job">
                            {activeModuleCommand?.job || businessProfile.summary}
                          </span>
                          <div className="sm-pos-module-proof-grid">
                            <span>
                              <b>Do now</b>
                              {activeModuleCommand?.playbook.stepOne || workspaceClientNextAction}
                            </span>
                            <span>
                              <b>Capture</b>
                              {activeModuleCommand?.playbook.stepTwo || helpPolicyCards[0].value}
                            </span>
                            <span>
                              <b>AI output</b>
                              {activeModuleCommand?.playbook.stepThree || activeModuleCommand?.playbook.aiOutput || 'Owner brief and exception queue.'}
                            </span>
                          </div>
                          <div className="sm-pos-module-quick-actions" aria-label="Module quick actions">
                            {(activeModuleCommand?.playbook.quickActions || []).map((action) => (
                              <button
                                className="sm-button-secondary"
                                key={`quick-action-${activeModuleCommand?.moduleId}-${action}`}
                                onClick={() => handleModuleQuickAction(action, activeModuleCommand?.moduleId)}
                                type="button"
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                          <div className="sm-pos-staff-actions">
                            <button className="sm-button-secondary" onClick={() => void handleCopyOwnerCloseoutBrief()} type="button">
                              Copy owner brief
                            </button>
                            <button className="sm-button-secondary" onClick={handleExportOwnerCloseoutBrief} type="button">
                              Export owner brief
                            </button>
                            <button className="sm-button-secondary" onClick={handleExportClientQuickStart} type="button">
                              Export quick start
                            </button>
                            <button className="sm-button-secondary" onClick={() => setActiveSurface('help')} type="button">
                              Open help
                            </button>
                            {isInternalOperator ? (
                              <button className="sm-button-secondary" onClick={() => setActiveWorkspaceView('runtime')} type="button">
                                Open runtime lab
                              </button>
                            ) : null}
                          </div>
                          {ownerCloseoutMessage ? <small className="text-xs text-[var(--sm-muted)]">{ownerCloseoutMessage}</small> : null}
                        </article>
                        <aside className="sm-pos-module-next-panel">
                          <article>
                            <p>Workspace</p>
                            <strong>{pilotKit.title}</strong>
                            <span>{pilotKit.location} / {pilotKit.hours}</span>
                          </article>
                          {workspaceOperationalSignals.slice(0, 3).map((signal) => (
                            <article key={`workspace-command-signal-${signal.id}`}>
                              <p>{signal.label}</p>
                              <strong>{signal.value}</strong>
                            </article>
                          ))}
                        </aside>
                      </section>
                      <section className="sm-pos-module-grid" aria-label="Useful POS modules">
                        {visibleModuleCommandCards.map((card) => (
                          <button
                            aria-pressed={activeModuleId === card.moduleId}
                            className={`sm-pos-module-card ${activeModuleId === card.moduleId ? 'is-active' : ''}`}
                            key={`workspace-module-command-${card.moduleId}`}
                            onClick={() => setSelectedWorkspaceModule(card.moduleId)}
                            type="button"
                          >
                            <p>{card.label}</p>
                            <strong>{card.playbook.primaryAction}</strong>
                            <span>{card.playbook.stepOne}</span>
                            <small>{card.playbook.stepTwo}</small>
                            <em>{card.playbook.metric}</em>
                          </button>
                        ))}
                      </section>
                      <section className="sm-pos-module-action-strip" aria-label="Core POS actions">
                        {workspaceCoreActions.map((action) => (
                          <button
                            className={`sm-pos-module-action ${activeModuleId === action.moduleId ? 'is-active' : ''}`}
                            key={`core-pos-action-${action.id}`}
                            onClick={() => setSelectedWorkspaceModule(action.moduleId)}
                            type="button"
                          >
                            <p>{action.label}</p>
                            <strong>{action.title}</strong>
                            <span>{action.detail}</span>
                          </button>
                        ))}
                      </section>
                    </>
                  )}
                </div>
              ) : (
                <Suspense
                  fallback={(
                    <div className="sm-pos-route-loading">
                      <strong>Loading runtime lab...</strong>
                      {runtimeLoadSlow ? (
                        <div className="sm-pos-route-recovery">
                          <button
                            className="sm-button-secondary"
                            onClick={() => setRuntimeLoadNonce((value) => value + 1)}
                            type="button"
                          >
                            Retry runtime
                          </button>
                          <button
                            className="sm-button-secondary"
                            onClick={() => setActiveWorkspaceView('overview')}
                            type="button"
                          >
                            Return to overview
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                >
                  <PosRuntimeWorkspace
                    key={`runtime-${runtimeLoadNonce}`}
                    allowedModules={roleAccess?.modules}
                    canExportExcel={roleAccess?.canExportExcel ?? true}
                    canExportJson={roleAccess?.canExportJson ?? true}
                    canResetWorkspace={roleAccess?.canResetWorkspace ?? true}
                    canRunAiActions={roleAccess?.canRunAiActions ?? true}
                    defaultBranchName={activeLocationLabel || `${businessProfile.label} Demo`}
                    initialModule={roleAccess?.defaultModule}
                    moduleContractOverrides={moduleContracts}
                    moduleLabelOverrides={moduleLabels}
                    workspaceScopeKey={workspaceScopeKey}
                    workspaceTitle={`${activeLocationLabel || businessProfile.label} POS`}
                    posRole={session.activeRole}
                    readOnly={roleAccess?.readOnly ?? false}
                    staffDirectory={staffDirectory}
                  />
                </Suspense>
              )}
            </div>
          </div>
        ) : null}

        {surfaceForDisplay === 'control' ? (
          <div className={`sm-pos-surface-content ${compactViewport ? 'is-compact' : ''}`} aria-label="POS control surface">
            {compactViewport ? (
              <section className="sm-pos-feature-preview" aria-label="Control compact summary">
                <article className="sm-pos-feature-card">
                  <p>{isInternalOperator ? 'Control lane' : 'Setup'}</p>
                  <strong>{activeControlPanelLabel}</strong>
                  <small className="text-xs text-[var(--sm-muted)]">
                    {POS_CONTROL_PANEL_SUMMARY[controlPanelForDisplay].detail}
                  </small>
                </article>
                {isInternalOperator ? (
                  <article className="sm-pos-feature-card">
                    <p>Readiness</p>
                    <strong>{enterpriseSummary.live} live / {enterpriseSummary.build} build / {enterpriseSummary.missing} missing</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Keep missing controls out of go-live lanes until they are closed.
                    </small>
                  </article>
                ) : (
                  <article className="sm-pos-feature-card">
                    <p>Client setup</p>
                    <strong>Staff, roles, and daily POS configuration only.</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      SuperMega keeps launch, hardware policy, backup, and support operations internal.
                    </small>
                  </article>
                )}
              </section>
            ) : null}
            {controlPanelForDisplay === 'overview' ? (
              <>
                {compactViewport && !isInternalOperator ? (
                  <section className="sm-pos-feature-preview sm-pos-client-setup-compact" aria-label="Client setup compact">
                    <article className="sm-pos-feature-card">
                      <p>Setup focus</p>
                      <strong>Staff, role access, receipts, and support request only.</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Internal launch, hardware policy, backup, and sales controls stay with SuperMega.
                      </small>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>Staff access</p>
                      <strong>{staffSummary.active} active / {staffSummary.suspended} suspended</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Add names, roles, and PIN status before sharing the device.
                      </small>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>Payment + print</p>
                      <strong>{enterprisePaymentOption.label} / {enterprisePrinterOption.label}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Works with cash, wallet/bank proof, invoice, and normal browser print/PDF.
                      </small>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>Next</p>
                      <strong>Run one sample service checkout, then export support if anything blocks the team.</strong>
                      <div className="sm-pos-staff-actions">
                        <button
                          className="sm-button-secondary"
                          onClick={() => {
                            setCompactControlMode('staff')
                            setActiveControlPanel('staff')
                          }}
                          type="button"
                        >
                          Staff setup
                        </button>
                        <button className="sm-button-secondary" onClick={() => setActiveSurface('help')} type="button">
                          Help
                        </button>
                      </div>
                    </article>
                  </section>
                ) : (
                  <>
                    <section className="sm-pos-feature-preview" aria-label="POS feature preview">
                      {previewModules.map((moduleId) => {
                        const preview = MODULE_PREVIEW[moduleId]
                        if (!preview) {
                          return null
                        }
                        return (
                          <article className="sm-pos-feature-card" key={moduleId}>
                            <p>{moduleLabels[moduleId] || moduleId}</p>
                            <strong>{moduleContracts[moduleId]?.job || preview.detail}</strong>
                          </article>
                        )
                      })}
                    </section>
                    <section className="sm-pos-feature-preview" aria-label="Business SaaS feature pipeline">
                      {compactSaasFeatures.map((feature) => (
                        <article className="sm-pos-feature-card" key={feature.title}>
                          <p>{feature.status}</p>
                          <strong>{feature.title}</strong>
                          <small className="text-xs text-[var(--sm-muted)]">{feature.detail}</small>
                        </article>
                      ))}
                    </section>
                  </>
                )}
              </>
            ) : null}
            {controlPanelForDisplay === 'ai-native' ? (
              <>
                <details className="sm-pos-readiness-drawer" open={!compactViewport}>
                  <summary>
                    AI-native stack: {aiNativeSummary.live} live / {aiNativeSummary.build} in build / {aiNativeSummary.next} next
                  </summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="AI-native POS capabilities">
                    {compactAiNativeCapabilities.map((item) => (
                      <article className="sm-pos-feature-card" key={item.id}>
                        <p>{item.status}</p>
                        <strong>{item.title}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">Owner: {item.owner}</small>
                        <small className="text-xs text-[var(--sm-muted)]">{item.detail}</small>
                      </article>
                    ))}
                  </div>
                  <div className="sm-pos-staff-actions mt-3">
                    <button className="sm-button-secondary" onClick={() => void handleCopyAiNativeBrief()} type="button">
                      Copy AI brief
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportAiNativeBrief} type="button">
                      Export AI brief
                    </button>
                  </div>
                  {aiNativeMessage ? <p className="sm-pos-role-capability mt-2">{aiNativeMessage}</p> : null}
                </details>
              </>
            ) : null}
            {controlPanelForDisplay === 'readiness' ? (
              <>
                <details className="sm-pos-readiness-drawer">
                  <summary>
                    Enterprise readiness: {enterpriseSummary.live} live / {enterpriseSummary.build} in build / {enterpriseSummary.missing} missing
                  </summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="Enterprise readiness checklist">
                    {compactReadinessChecklist.map((item) => (
                      <article className="sm-pos-feature-card" key={item.id}>
                        <p>{item.status}</p>
                        <strong>{item.control}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">Owner: {item.owner} / {item.detail}</small>
                      </article>
                    ))}
                  </div>
                </details>
                <details className="sm-pos-readiness-drawer">
                  <summary>
                    Benchmark backlog: {benchmarkSummary.live} live / {benchmarkSummary.build} in build / {benchmarkSummary.missing} missing
                  </summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="POS benchmark backlog">
                    {compactBenchmarkBacklog.map((item) => (
                      <article className="sm-pos-feature-card" key={item.id}>
                        <p>{item.status}</p>
                        <strong>{item.benchmark}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">Source: {item.source}</small>
                        <small className="text-xs text-[var(--sm-muted)]">Action: {item.action}</small>
                      </article>
                    ))}
                  </div>
                </details>
                <details className="sm-pos-readiness-drawer">
                  <summary>
                    Open-source acceleration: {referenceRepoSummary['adopt-now']} adopt now / {referenceRepoSummary.pilot} pilot / {referenceRepoSummary.watch} watch
                  </summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="POS open source accelerators">
                    {compactReferenceRepos.map((item) => (
                      <article className="sm-pos-feature-card" key={item.id}>
                        <p>{item.status}</p>
                        <strong>{item.name}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">Repo: {item.source} / Focus: {item.focus}</small>
                        <small className="text-xs text-[var(--sm-muted)]">{item.fit}</small>
                        <a className="sm-pos-reference-link" href={item.url} rel="noreferrer" target="_blank">
                          Open repository
                        </a>
                      </article>
                    ))}
                  </div>
                </details>
              </>
            ) : null}
            {controlPanelForDisplay === 'deployment' ? (
              <details className="sm-pos-readiness-drawer">
                <summary>
                  Deployment pack: {deploymentPack.environment} / {deploymentGateSummary.ready} ready / {deploymentGateSummary.review} review / {deploymentGateSummary.blocked} blocked
                </summary>
                <div className="sm-pos-staff-form mt-3">
                  <select className="sm-input" onChange={(event) => setDeploymentEnvironment(event.target.value as PosDeploymentEnvironment)} value={deploymentEnvironment}>
                    {DEPLOYMENT_ENV_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    className="sm-input"
                    onChange={(event) => setDeploymentReleaseOwner(event.target.value)}
                    placeholder="Release owner"
                    value={deploymentReleaseOwner}
                  />
                  <input
                    className="sm-input"
                    onChange={(event) => setDeploymentVersionTag(event.target.value)}
                    placeholder="Version tag"
                    value={deploymentVersionTag}
                  />
                  <button className="sm-button-secondary" onClick={() => void handleCopyDeploymentChecklist()} type="button">
                    Copy checklist
                  </button>
                  <button className="sm-button-secondary" onClick={handleExportDeploymentPack} type="button">
                    Export deployment JSON
                  </button>
                </div>
                <div className="sm-pos-feature-preview mt-3" aria-label="Deployment release gates">
                  {deploymentPack.gates.map((gate) => (
                    <article className="sm-pos-feature-card" key={gate.id}>
                      <p>{gate.status}</p>
                      <strong>{gate.title}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">Owner: {gate.owner}</small>
                      <small className="text-xs text-[var(--sm-muted)]">{gate.detail}</small>
                    </article>
                  ))}
                </div>
                <div className="sm-pos-feature-preview mt-3" aria-label="Deployment next actions">
                  {deploymentPack.nextActions.map((action) => (
                    <article className="sm-pos-feature-card" key={action}>
                      <p>next action</p>
                      <strong>{action}</strong>
                    </article>
                  ))}
                </div>
                <p className="sm-pos-role-capability mt-2">Smoke local: {deploymentPack.smoke.local} / Smoke live: {deploymentPack.smoke.live}</p>
                {deploymentMessage ? <p className="sm-pos-role-capability mt-2">{deploymentMessage}</p> : null}
              </details>
            ) : null}
            {controlPanelForDisplay === 'sync' ? (
              <details className="sm-pos-readiness-drawer">
                <summary>
                  Offline sync queue: {syncSummary.queued} queued / {syncSummary.failed} failed / {syncSummary.synced} synced
                </summary>
                <div className="sm-pos-staff-form mt-3">
                  <button className="sm-button-secondary" disabled={!isOnline || syncBusy || pendingSyncCount === 0} onClick={handleFlushSyncQueue} type="button">
                    {syncBusy ? 'Syncing...' : 'Flush sync queue'}
                  </button>
                  <button className="sm-button-secondary" onClick={handleExportSyncQueue} type="button">
                    Export queue JSON
                  </button>
                  <button className="sm-button-secondary" onClick={() => void handleExportSyncQueueExcel()} type="button">
                    Export queue Excel
                  </button>
                  <button className="sm-button-secondary" onClick={handleClearSyncedQueue} type="button">
                    Clear synced
                  </button>
                </div>
                <div className="sm-pos-feature-preview mt-3" aria-label="Offline sync guardrails">
                  <article className="sm-pos-feature-card">
                    <p>Offline expiry</p>
                    <strong>{offlineSyncRisk.reviewCount} at 24h+ / {offlineSyncRisk.criticalCount} at 72h+</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Pending actions should sync before role switch/logout on shared terminals.
                    </small>
                  </article>
                  <article className="sm-pos-feature-card">
                    <p>Oldest pending</p>
                    <strong>{formatPendingAge(offlineSyncRisk.oldestPendingMinutes)}</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Pending actions: {offlineSyncRisk.pendingCount} / status: {offlineSyncRisk.statusLabel}
                    </small>
                  </article>
                  <article className="sm-pos-feature-card">
                    <p>Guardrail next action</p>
                    <strong>{offlineSyncRisk.nextAction}</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Mirrors enterprise offline-mode protection and upload discipline.
                    </small>
                  </article>
                </div>
                <div className="sm-pos-feature-preview mt-3" aria-label="POS sync ledger records">
                  {syncLedger.slice(0, 12).map((entry) => (
                    <article className="sm-pos-feature-card" key={entry.id}>
                      <p>{entry.status}</p>
                      <strong>{entry.summary}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        {entry.actionType} / attempts {entry.attemptCount}
                      </small>
                      <small className="text-xs text-[var(--sm-muted)]">
                        queued {new Date(entry.createdAt).toLocaleString()} / last {entry.lastAttemptAt ? new Date(entry.lastAttemptAt).toLocaleString() : 'never'}
                      </small>
                      {entry.failureReason ? <small className="text-xs text-[var(--sm-muted)]">Failure: {entry.failureReason}</small> : null}
                    </article>
                  ))}
                </div>
                {syncMessage ? <p className="sm-pos-role-capability mt-2">{syncMessage}</p> : null}
              </details>
            ) : null}
            {controlPanelForDisplay === 'go-live' ? (
              <>
                <section className="sm-pos-feature-preview" aria-label="Enterprise go-live controls">
                  {enterpriseGoLiveCards.map((item) => (
                    <article className="sm-pos-feature-card" key={item.id}>
                      <p>{item.label}</p>
                      <strong>{item.value}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">{item.detail}</small>
                    </article>
                  ))}
                </section>
                <details className="sm-pos-readiness-drawer" open={!compactViewport}>
                  <summary>
                    Manual payment proof, invoice, and normal printer setup
                  </summary>
                  <div className="sm-pos-staff-form mt-3">
                    <select
                      className="sm-input"
                      onChange={(event) => updateEnterpriseSetting({ paymentMode: event.target.value as PosEnterprisePaymentMode })}
                      value={enterpriseSettings.paymentMode}
                    >
                      {POS_ENTERPRISE_PAYMENT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="sm-input"
                      onChange={(event) => updateEnterpriseSetting({ printerMode: event.target.value as PosEnterprisePrinterMode })}
                      value={enterpriseSettings.printerMode}
                    >
                      {POS_ENTERPRISE_PRINTER_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="sm-input"
                      onChange={(event) => updateEnterpriseSetting({ offlinePolicy: event.target.value as PosEnterpriseOfflinePolicy })}
                      value={enterpriseSettings.offlinePolicy}
                    >
                      {POS_ENTERPRISE_OFFLINE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button className="sm-button-secondary" onClick={handleLogPaymentPolicy} type="button">
                      Save policy
                    </button>
                  </div>
                  <div className="sm-pos-staff-form mt-3">
                    <input
                      className="sm-input"
                      onChange={(event) => setInvoiceCustomer(event.target.value)}
                      placeholder="Customer or client name"
                      value={invoiceCustomer}
                    />
                    <input
                      className="sm-input"
                      onChange={(event) => setInvoiceService(event.target.value)}
                      placeholder={pilotKit.serviceMenu[0]?.label || 'Service item'}
                      value={invoiceService}
                    />
                    <input
                      className="sm-input"
                      inputMode="numeric"
                      onChange={(event) => setInvoiceAmount(event.target.value)}
                      placeholder="Amount MMK"
                      value={invoiceAmount}
                    />
                    <input
                      className="sm-input sm-pos-staff-note"
                      onChange={(event) => setInvoiceNote(event.target.value)}
                      placeholder="Payment proof or closeout note"
                      value={invoiceNote}
                    />
                    <button className="sm-button-secondary" onClick={() => handlePrintInvoice('invoice')} type="button">
                      Print invoice
                    </button>
                    <button className="sm-button-secondary" onClick={() => handlePrintInvoice('receipt')} type="button">
                      Print receipt
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportInvoiceJson} type="button">
                      Export invoice JSON
                    </button>
                    <button className="sm-button-secondary" onClick={handlePrintHardwareTest} type="button">
                      Test printer
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportHardwarePolicy} type="button">
                      Export hardware policy
                    </button>
                  </div>
                  <p className="sm-pos-role-capability mt-2">
                    Browser print is ready for normal installed printers. Payments are manual/external proof only. Silent thermal printing, cash drawer kicks, and scanner automation require separate hardware implementation if requested.
                  </p>
                </details>
                <details className="sm-pos-readiness-drawer" open={!compactViewport}>
                  <summary>
                    Launch certification: pilot {launchCertificationStatus.guidedPilot} / paid production {launchCertificationStatus.paidProduction}
                  </summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="Launch certification">
                    <article className="sm-pos-feature-card">
                      <p>guided pilot</p>
                      <strong>{launchCertificationStatus.guidedPilot === 'ready' ? 'Ready to start' : 'Blocked'}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        {launchPilotBlockers.length ? launchPilotBlockers.join(' ') : 'Deployment, sync, and hardware pilot gates are clear.'}
                      </small>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>paid production</p>
                      <strong>{launchCertificationStatus.paidProduction === 'ready' ? 'Ready to sell as production' : 'Still gated'}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        {launchProductionBlockers.length ? launchProductionBlockers.slice(0, 3).join(' ') : 'All enterprise gates are closed.'}
                      </small>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>operating rule</p>
                      <strong>Sell as guided pilot or paid setup until production gates close.</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Do not promise full enterprise production while durable database, restore rehearsal, support SLA, tax/discount/refund policy, or real hardware acceptance remains open.
                      </small>
                    </article>
                  </div>
                  <div className="sm-pos-staff-actions mt-3">
                    <button className="sm-button-secondary" onClick={handleExportClientGoLiveAcceptance} type="button">
                      Export client acceptance
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportLaunchCertification} type="button">
                      Export launch certification JSON
                    </button>
                  </div>
                </details>
                <details className="sm-pos-readiness-drawer" open={!compactViewport}>
                  <summary>
                    Hardware implementation policy: {hardwarePolicySummary.ready} ready / {hardwarePolicySummary.review} review / {hardwarePolicySummary.blocked} blocked
                  </summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="Hardware implementation policy">
                    {hardwarePolicyItems.map((item) => (
                      <article className="sm-pos-feature-card" key={item.id}>
                        <p>{item.status} / {item.owner}</p>
                        <strong>{item.lane}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">{item.requirement}</small>
                        <small className="text-xs text-[var(--sm-muted)]">Accept: {item.acceptance}</small>
                        <small className="text-xs text-[var(--sm-muted)]">Fallback: {item.fallback}</small>
                      </article>
                    ))}
                  </div>
                  <div className="sm-pos-staff-actions mt-3">
                    <button className="sm-button-secondary" onClick={handleExportHardwarePolicy} type="button">
                      Export hardware policy JSON
                    </button>
                    <button className="sm-button-secondary" onClick={handlePrintHardwareTest} type="button">
                      Print test ticket
                    </button>
                  </div>
                </details>
                <details className="sm-pos-readiness-drawer">
                  <summary>
                    Backup, restore drill, and support incident workflow
                  </summary>
                  <div className="sm-pos-staff-form mt-3">
                    <button className="sm-button-secondary" onClick={handleExportWorkspaceBackup} type="button">
                      Export backup JSON
                    </button>
                    <input
                      accept="application/json,.json"
                      className="sm-input sm-pos-staff-note"
                      onChange={(event) => void handleValidateRestoreFile(event)}
                      ref={restoreInputRef}
                      type="file"
                    />
                    <button className="sm-button-secondary" onClick={handleExportRestoreDrillReport} type="button">
                      Export restore drill JSON
                    </button>
                    <select className="sm-input" onChange={(event) => setSupportSeverity(event.target.value as PosSupportSeverity)} value={supportSeverity}>
                      {POS_SUPPORT_SEVERITY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select className="sm-input" onChange={(event) => setSupportCategory(event.target.value as PosSupportCategory)} value={supportCategory}>
                      {POS_SUPPORT_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="sm-input sm-pos-staff-note"
                      onChange={(event) => setSupportSummary(event.target.value)}
                      placeholder="What happened?"
                      value={supportSummary}
                    />
                    <button className="sm-button-secondary" onClick={() => void handleCreateSupportIncident()} type="button">
                      Create support packet
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportChangeRequestJson} type="button">
                      Export change request JSON
                    </button>
                  </div>
                  {restoreMessage ? <p className="sm-pos-role-capability mt-2">{restoreMessage}</p> : null}
                  {enterpriseMessage ? <p className="sm-pos-role-capability mt-2">{enterpriseMessage}</p> : null}
                </details>
                <details className="sm-pos-readiness-drawer">
                  <summary>
                    Client self-serve vs SuperMega setup boundary
                  </summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="Client self serve controls">
                    {POS_CLIENT_SELF_SERVICE_CONTROLS.map((item) => (
                      <article className="sm-pos-feature-card" key={item}>
                        <p>client can do</p>
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </div>
                  <div className="sm-pos-feature-preview mt-3" aria-label="SuperMega provisioned controls">
                    {POS_SUPERMEGA_PROVISIONED_CONTROLS.map((item) => (
                      <article className="sm-pos-feature-card" key={item}>
                        <p>supermega setup</p>
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </div>
                </details>
              </>
            ) : null}
            {isInternalOperator && controlPanelForDisplay === 'support' ? (
              <>
                <section className="sm-pos-feature-preview" aria-label="Support desk summary">
                  {visibleSupportQueueCards.map((item) => (
                    <article className="sm-pos-feature-card" key={item.id}>
                      <p>{item.label}</p>
                      <strong>{item.value}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">{item.detail}</small>
                    </article>
                  ))}
                </section>
                <details className="sm-pos-readiness-drawer" open={!compactViewport}>
                  <summary>
                    {compactViewport ? 'Support workflow' : 'Support desk: incidents, SLA, and evidence'}
                  </summary>
                  <div className="sm-pos-staff-form mt-3">
                    <select className="sm-input" onChange={(event) => setSupportSeverity(event.target.value as PosSupportSeverity)} value={supportSeverity}>
                      {POS_SUPPORT_SEVERITY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select className="sm-input" onChange={(event) => setSupportCategory(event.target.value as PosSupportCategory)} value={supportCategory}>
                      {POS_SUPPORT_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="sm-input sm-pos-staff-note"
                      onChange={(event) => setSupportSummary(event.target.value)}
                      placeholder="What happened?"
                      value={supportSummary}
                    />
                    <input
                      className="sm-input sm-pos-staff-note"
                      onChange={(event) => setSupportResolutionNote(event.target.value)}
                      placeholder="Resolution or support note"
                      value={supportResolutionNote}
                    />
                    <button className="sm-button-secondary" disabled={supportDeskBusy} onClick={() => void handleCreateSupportIncident()} type="button">
                      Create support incident
                    </button>
                    <button className="sm-button-secondary" disabled={supportDeskBusy} onClick={() => void handleRefreshSupportDesk()} type="button">
                      Refresh support desk
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportSupportDeskJson} type="button">
                      Export support desk JSON
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportChangeRequestJson} type="button">
                      Export change request JSON
                    </button>
                  </div>
                  <p className="sm-pos-role-capability mt-2">
                    {supportDeskMessage || 'Use this for printer, payment, access, offline, and data/export incidents after client handoff.'}
                  </p>
                  <p className="sm-pos-role-capability mt-2">
                    SLA rule: SEV1 blocks closeout and gets immediate escalation; SEV2 gets same-day workaround; SEV3 goes into training or change queue.
                  </p>
                </details>
                <details className="sm-pos-readiness-drawer" open={!compactViewport}>
                  <summary>
                    {compactViewport ? `Incident queue: ${supportIncidents.length}` : `Incident queue: ${supportIncidents.length} persisted incident(s)`}
                  </summary>
                  <section className="sm-pos-feature-preview mt-3" aria-label="Support incident queue">
                    {supportIncidentRowsForDisplay.map((incident) => (
                      <article className="sm-pos-feature-card" key={incident.incident_id}>
                        <p>{incident.severity.toUpperCase()} / {incident.category} / {incident.status}</p>
                        <strong>{incident.summary}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          {incident.workspace?.companyName || companyDisplayName} / {incident.workspace?.location || activeLocationLabel}
                        </small>
                        <small className="text-xs text-[var(--sm-muted)]">
                          Owner: {incident.owner || 'SuperMega support'} / Updated {incident.updated_at ? new Date(incident.updated_at).toLocaleString() : 'now'}
                        </small>
                        {incident.next_action ? (
                          <small className="text-xs text-[var(--sm-muted)]">Next: {incident.next_action}</small>
                        ) : null}
                        {incident.resolution_note ? (
                          <small className="text-xs text-[var(--sm-muted)]">Resolution: {incident.resolution_note}</small>
                        ) : null}
                        {incident.resolved_at ? (
                          <small className="text-xs text-[var(--sm-muted)]">
                            Resolved {new Date(incident.resolved_at).toLocaleString()}
                          </small>
                        ) : null}
                        {incident.incident_id !== 'empty-support-desk' ? (
                          <div className="sm-pos-mini-actions">
                            <button
                              className="sm-button-secondary"
                              disabled={supportDeskBusy || incident.status === 'in_progress' || incident.status === 'resolved'}
                              onClick={() => void handleUpdateSupportIncident(incident, 'in_progress')}
                              type="button"
                            >
                              Mark in progress
                            </button>
                            <button
                              className="sm-button-secondary"
                              disabled={supportDeskBusy || incident.status === 'resolved'}
                              onClick={() => void handleUpdateSupportIncident(incident, 'resolved')}
                              type="button"
                            >
                              Resolve
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </section>
                  {compactViewport && supportIncidents.length > 4 ? (
                    <p className="sm-pos-role-capability mt-2">
                      Showing 4 of {supportIncidents.length} support incidents on mobile. Export JSON for the full queue.
                    </p>
                  ) : null}
                </details>
              </>
            ) : null}
            {controlPanelForDisplay === 'staff' ? (
              <details className="sm-pos-readiness-drawer">
                <summary>
                  Staff access control: {staffSummary.active} active / {staffSummary.suspended} suspended
                </summary>
                <form className="sm-pos-staff-form mt-3" onSubmit={handleAddStaff}>
                  <input
                    className="sm-input"
                    onChange={(event) => setStaffName(event.target.value)}
                    placeholder="Staff display name"
                    required
                    value={staffName}
                  />
                  <select className="sm-input" onChange={(event) => setStaffRole(event.target.value as PosUserRole)} value={staffRole}>
                    {staffRoleOptions.map((roleOption) => (
                      <option key={roleOption.id} value={roleOption.id}>
                        {roleOption.label}
                      </option>
                    ))}
                  </select>
                  <select className="sm-input" onChange={(event) => setStaffLocationId(event.target.value)} value={staffLocationId}>
                    {locationOptions.map((locationOption) => (
                      <option key={locationOption.id} value={locationOption.id}>
                        {locationOption.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="sm-input"
                    inputMode="numeric"
                    maxLength={8}
                    onChange={(event) => setStaffPin(event.target.value)}
                    pattern="\d{4,8}"
                    placeholder="PIN (4-8 digits)"
                    required
                    value={staffPin}
                  />
                  <input
                    className="sm-input sm-pos-staff-note"
                    onChange={(event) => setStaffNote(event.target.value)}
                    placeholder="Optional note"
                    value={staffNote}
                  />
                  <button className="sm-button-secondary" type="submit">
                    Add staff
                  </button>
                </form>
                {staffMessage ? <p className="sm-pos-role-capability mt-2">{staffMessage}</p> : null}
                <div className="sm-pos-staff-grid mt-3">
                  {compactStaffDirectory.map((staff) => (
                    <article className="sm-pos-feature-card" key={staff.id}>
                      <p>{staff.status}</p>
                      <strong>{staff.displayName}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        {staff.role} / {staff.locationLabel} / PIN {staff.pinHint} / updated {new Date(staff.pinUpdatedAt).toLocaleDateString()}
                      </small>
                      {staff.note ? <small className="text-xs text-[var(--sm-muted)]">Note: {staff.note}</small> : null}
                      <div className="sm-pos-staff-actions">
                        <button className="sm-button-secondary" onClick={() => handleRotatePin(staff.id)} type="button">
                          Rotate PIN
                        </button>
                        {staff.status === 'active' ? (
                          <button className="sm-button-secondary" onClick={() => handleToggleStaff(staff.id, 'suspended')} type="button">
                            Suspend
                          </button>
                        ) : (
                          <button className="sm-button-secondary" onClick={() => handleToggleStaff(staff.id, 'active')} type="button">
                            Reactivate
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {compactViewport && staffDirectory.length > compactStaffDirectory.length ? (
                  <p className="sm-pos-role-capability mt-2">
                    Showing {compactStaffDirectory.length} of {staffDirectory.length} staff records on mobile.
                  </p>
                ) : null}
              </details>
            ) : null}
          </div>
        ) : null}

        {isInternalOperator && surfaceForDisplay === 'sales' ? (
          <div className={`sm-pos-surface-content ${compactViewport ? 'is-compact' : ''}`} aria-label="POS sales administration surface">
            {compactViewport ? (
              <section className="sm-pos-feature-preview" aria-label="Sales compact summary">
                <article className="sm-pos-feature-card">
                  <p>Sales lane</p>
                  <strong>{activeSalesPanelLabel}</strong>
                  <small className="text-xs text-[var(--sm-muted)]">
                    Mobile mode keeps one-screen summary first. Open details only when needed.
                  </small>
                </article>
                <article className="sm-pos-feature-card">
                  <p>Pipeline</p>
                  <strong>{clientLaneCount} client lane(s) / {demoLaneCount} demo lane(s)</strong>
                  <small className="text-xs text-[var(--sm-muted)]">
                    Ready {launchReadyCount} / blocked {launchBlockedCount} launch lanes.
                  </small>
                </article>
              </section>
            ) : null}
            {salesPanelForDisplay === 'pipeline' ? (
              <>
                <section className="sm-pos-feature-preview" aria-label="Sales stage summary">
                  {Object.entries(salesSummary).map(([stage, count]) => (
                    <article className="sm-pos-feature-card" key={stage}>
                      <p>{POS_SALES_STAGE_LABELS[stage as PosSalesStage]}</p>
                      <strong>{count} client lane(s)</strong>
                    </article>
                  ))}
                </section>
                <section className="sm-pos-feature-preview" aria-label="Sellable POS offer packages">
                  {(compactViewport ? POS_SALES_OFFER_PACKAGES.slice(0, 1) : POS_SALES_OFFER_PACKAGES).map((offer) => (
                    <article className="sm-pos-feature-card" key={offer.id}>
                      <p>{offer.price}</p>
                      <strong>{offer.title}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">{offer.cadence} / {offer.buyer}</small>
                      <small className="text-xs text-[var(--sm-muted)]">{offer.deliverable}</small>
                    </article>
                  ))}
                </section>
                <section className="sm-pos-feature-preview" aria-label="Client onboarding queue">
                  {compactSalesQueue.map((item) => (
                    <article className="sm-pos-feature-card" key={item.id}>
                      <p>{POS_SALES_STAGE_LABELS[item.stage]} / {getPosBusinessProfile(item.businessType).label}</p>
                      <strong>{item.clientName}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">Owner: {item.owner} / {item.summary}</small>
                      <small className="text-xs text-[var(--sm-muted)]">Next: {item.nextAction}</small>
                    </article>
                  ))}
                </section>
                {compactViewport && salesQueue.length > compactSalesQueue.length ? (
                  <p className="sm-pos-role-capability mt-2">
                    Showing {compactSalesQueue.length} of {salesQueue.length} queue lanes on mobile.
                  </p>
                ) : null}
              </>
            ) : null}
            {salesPanelForDisplay === 'playbook' ? (
              <>
                {!compactViewport ? (
                  <section className="sm-pos-feature-preview" aria-label="Sales playbook controls">
                    {POS_SALES_PLAYBOOK.map((item) => (
                      <article className="sm-pos-feature-card" key={item.id}>
                        <p>Playbook</p>
                        <strong>{item.title}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">{item.detail}</small>
                      </article>
                    ))}
                  </section>
                ) : null}
                <section className="sm-pos-feature-preview mt-3" aria-label="POS offer packaging">
                  {(compactViewport ? POS_SALES_OFFER_PACKAGES.slice(0, 1) : POS_SALES_OFFER_PACKAGES).map((offer) => (
                    <article className="sm-pos-feature-card" key={`playbook-offer-${offer.id}`}>
                      <p>{offer.price}</p>
                      <strong>{offer.title}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">{offer.cadence} / buyer: {offer.buyer}</small>
                      <small className="text-xs text-[var(--sm-muted)]">{offer.deliverable}</small>
                    </article>
                  ))}
                </section>
                <div className="sm-pos-staff-actions mt-2">
                  <button className="sm-button-secondary" onClick={handleExportOutsourcedSalesPlaybook} type="button">
                    Export sales + onboarding playbook
                  </button>
                  <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(activeSalesTenant)} type="button">
                    Export client intake workbook
                  </button>
                </div>
                <details className="sm-pos-readiness-drawer mt-2">
                  <summary>Qualification questions: {POS_SALES_QUALIFICATION_QUESTIONS.length} prompts</summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="POS sales qualification questions">
                    {(compactViewport ? POS_SALES_QUALIFICATION_QUESTIONS.slice(0, 3) : POS_SALES_QUALIFICATION_QUESTIONS).map((question, index) => (
                      <article className="sm-pos-feature-card" key={`qualification-${question}`}>
                        <p>Question {index + 1}</p>
                        <strong>{question}</strong>
                      </article>
                    ))}
                  </div>
                </details>
                <details className="sm-pos-readiness-drawer mt-2">
                  <summary>Client onboarding setup path: {POS_CLIENT_ONBOARDING_STEPS.length} steps</summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="POS client onboarding setup path">
                    {(compactViewport ? POS_CLIENT_ONBOARDING_STEPS.slice(0, 3) : POS_CLIENT_ONBOARDING_STEPS).map((step) => (
                      <article className="sm-pos-feature-card" key={`onboarding-${step.id}`}>
                        <p>{step.owner}</p>
                        <strong>{step.title}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">{step.detail}</small>
                      </article>
                    ))}
                  </div>
                </details>
              </>
            ) : null}
            {salesPanelForDisplay === 'clients' ? (
              <>
                {compactViewport ? (
                  <section className="sm-pos-client-quickstart" aria-label="Client setup wizard">
                    <article className="sm-pos-feature-card sm-pos-client-quickstart-card">
                      <p>Client admin registry</p>
                      <strong>{activeSalesTenant?.kind === 'client' ? activeSalesTenant.clientName : 'No client lane selected'}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        {activeSalesTenant?.kind === 'client'
                          ? `${getPosBusinessProfile(activeSalesTenant.businessType).label} / ${activeSalesTenant.locationCount} location(s) / ${activeSalesTenantLaunchGate?.status || 'review'}`
                          : 'Add a client, then start pilot setup. Internal setup stays with SuperMega.'}
                      </small>
                    </article>
                    <div className="sm-pos-staff-actions sm-pos-compact-action-row">
                      <button className="sm-button-secondary" onClick={handleMobileQuickAddSalesTenant} type="button">
                        New client
                      </button>
                      <button
                        className="sm-button-primary"
                        disabled={activeSalesTenant?.kind !== 'client' || pilotSetupBusyTenantId === activeSalesTenant.id}
                        onClick={() => {
                          if (activeSalesTenant?.kind === 'client') {
                            void handleStartPilotSetup(activeSalesTenant)
                          }
                        }}
                        type="button"
                      >
                        {activeSalesTenant?.kind === 'client' && pilotSetupBusyTenantId === activeSalesTenant.id ? 'Preparing...' : 'Start pilot'}
                      </button>
                      <button
                        className="sm-button-secondary"
                        disabled={activeSalesTenant?.kind !== 'client'}
                        onClick={() => {
                          if (activeSalesTenant?.kind === 'client') {
                            void handleExportClientLaunchRoomExcel(activeSalesTenant)
                          }
                        }}
                        type="button"
                      >
                        Export launch room
                      </button>
                      <button
                        className="sm-button-secondary"
                        disabled={activeSalesTenant?.kind !== 'client'}
                        onClick={() => {
                          if (activeSalesTenant?.kind === 'client') {
                            handleExportSalesAiHandoffPacket(activeSalesTenant)
                          }
                        }}
                        type="button"
                      >
                        Export sales AI handoff
                      </button>
                    </div>
                    {salesTenantMessage ? <p className="sm-pos-role-capability">{salesTenantMessage}</p> : null}
                  </section>
                ) : (
                  <section className="sm-pos-client-quickstart" aria-label="Client setup wizard">
                    <article className="sm-pos-feature-card sm-pos-client-quickstart-card">
                      <p>Client setup wizard</p>
                      <strong>Create a real pilot client in one action.</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Enter the client, choose the business template, then generate owner login, role credentials, launch room, and handoff queue.
                      </small>
                    </article>
                    <form className="sm-pos-staff-form sm-pos-client-quickstart-form" onSubmit={handleAddSalesTenant}>
                      <input
                        className="sm-input"
                        onChange={(event) => setSalesTenantName(event.target.value)}
                        placeholder="Client name"
                        required
                        value={salesTenantName}
                      />
                      <select className="sm-input" onChange={(event) => handleSalesTenantBusinessTypeChange(event.target.value as PosBusinessType)} value={salesTenantBusinessType}>
                        <option value="restaurant">Restaurant</option>
                        <option value="spa">Spa</option>
                        <option value="retail">Retail</option>
                      </select>
                      <input
                        className="sm-input"
                        onChange={(event) => setSalesTenantOwner(event.target.value)}
                        placeholder="Owner"
                        value={salesTenantOwner}
                      />
                      <input
                        className="sm-input"
                        inputMode="numeric"
                        min={1}
                        onChange={(event) => setSalesTenantLocations(event.target.value)}
                        placeholder="Locations"
                        type="number"
                        value={salesTenantLocations}
                      />
                      <button className="sm-button-secondary" type="submit">
                        Add lane
                      </button>
                      <button
                        className="sm-button-primary"
                        disabled={Boolean(pilotSetupBusyTenantId)}
                        onClick={() => void handleCreatePilotSetupFromWizard()}
                        type="button"
                      >
                        {pilotSetupBusyTenantId ? 'Preparing pilot...' : 'Create pilot setup'}
                      </button>
                    </form>
                    {salesTenantMessage ? <p className="sm-pos-role-capability">{salesTenantMessage}</p> : null}
                  </section>
                )}
                <section className="sm-pos-feature-preview" aria-label="Client registry summary">
                  {compactViewport ? null : (
                    <>
                      {Object.entries(salesTenantSummary).map(([stage, count]) => (
                        <article className="sm-pos-feature-card" key={stage}>
                          <p>{POS_SALES_STAGE_LABELS[stage as PosSalesStage]}</p>
                          <strong>{count} tenant lane(s)</strong>
                        </article>
                      ))}
                      <article className="sm-pos-feature-card">
                        <p>Registry size</p>
                        <strong>{clientLaneCount} client lane(s) / {demoLaneCount} demo lane(s)</strong>
                        <small className="text-xs text-[var(--sm-muted)]">Client lanes are production prospects. Demo lanes stay as internal proof packs.</small>
                      </article>
                      <article className="sm-pos-feature-card">
                        <p>Registry mode</p>
                        <strong>{salesTenantRegistryStatus.label}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          {salesTenantRegistryStatus.summary}
                        </small>
                      </article>
                      <article className="sm-pos-feature-card">
                        <p>Readiness coverage</p>
                        <strong>
                          {salesTenants.length
                            ? `${Math.round(salesTenants.reduce((sum, tenant) => sum + getSalesTenantReadiness(tenant).score, 0) / salesTenants.length)}%`
                            : '0%'}
                        </strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          Average onboarding readiness across all client lanes.
                        </small>
                      </article>
                      <article className="sm-pos-feature-card">
                        <p>Sales AI copilot</p>
                        <strong>
                          {activeSalesTenant
                            ? `${activeSalesTenant.clientName} / ${activeSalesTenantAiSummary.score}% AI-native`
                            : 'Select a client lane'}
                        </strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          {activeSalesTenant
                            ? `${activeSalesTenantLaunchRoomSummary.score}% launch room. Next: ${activeSalesTenantAiGaps[0]?.title || activeSalesTenantTopLaunchGaps[0]?.label || 'walkthrough and training'}`
                            : 'Exports sales talk track, launch blockers, AI-native gaps, and next actions.'}
                        </small>
                        {activeSalesTenant ? (
                          <div className="sm-pos-staff-actions">
                            <button className="sm-button-secondary" onClick={() => void handleExportClientLaunchRoomExcel(activeSalesTenant)} type="button">
                              Export launch room
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportSetupCopilot(activeSalesTenant)} type="button">
                              Export setup copilot
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportHardwareReadiness(activeSalesTenant)} type="button">
                              Export hardware readiness
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientHandoffPack(activeSalesTenant)} type="button">
                              Export client handoff pack
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportSalesAiHandoffPacket(activeSalesTenant)} type="button">
                              Export sales AI handoff
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(activeSalesTenant)} type="button">
                              Export intake workbook
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientLaunchBrief(activeSalesTenant)} type="button">
                              Export launch brief
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientProposal(activeSalesTenant)} type="button">
                              Export client proposal
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientUpdateNote(activeSalesTenant)} type="button">
                              Export client update note
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientStartMessage(activeSalesTenant)} type="button">
                              Export client start message
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleCopyClientStartMessage(activeSalesTenant)} type="button">
                              Copy start message
                            </button>
                            <button className="sm-button-secondary" onClick={() => setActiveSalesPanel('handoff')} type="button">
                              Open handoff
                            </button>
                          </div>
                        ) : null}
                      </article>
                    </>
                  )}
                </section>
                {!compactViewport && activeSalesTenant ? (
                  <details className="sm-pos-readiness-drawer mt-3">
                    <summary>Launch room details</summary>
                    <section className="sm-pos-feature-preview mt-3" aria-label="Client launch room readiness">
                      <article className="sm-pos-feature-card">
                        <p>Launch room</p>
                        <strong>
                          {activeSalesTenant.clientName} / {activeSalesTenantLaunchRoomSummary.score}% complete
                        </strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          {activeSalesTenantLaunchRoomSummary.ready} ready / {activeSalesTenantLaunchRoomSummary.review} review / {activeSalesTenantLaunchRoomSummary.blocked} blocked production gate(s).
                        </small>
                        <div className="sm-pos-staff-actions">
                          <button
                            className="sm-button-secondary"
                            disabled={pilotSetupBusyTenantId === activeSalesTenant.id}
                            onClick={() => void handleStartPilotSetup(activeSalesTenant)}
                            type="button"
                          >
                            {pilotSetupBusyTenantId === activeSalesTenant.id ? 'Preparing pilot...' : 'Start pilot setup'}
                          </button>
                          <button className="sm-button-secondary" onClick={() => void handleExportClientLaunchRoomExcel(activeSalesTenant)} type="button">
                            Export launch room
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportSetupCopilot(activeSalesTenant)} type="button">
                            Export setup copilot
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportHardwareReadiness(activeSalesTenant)} type="button">
                            Export hardware readiness
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportClientHandoffPack(activeSalesTenant)} type="button">
                            Export client handoff pack
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportSalesAiHandoffPacket(activeSalesTenant)} type="button">
                            Export sales AI handoff
                          </button>
                          <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(activeSalesTenant)} type="button">
                            Export intake workbook
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportClientLaunchBrief(activeSalesTenant)} type="button">
                            Export launch brief
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportClientProposal(activeSalesTenant)} type="button">
                            Export client proposal
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportClientUpdateNote(activeSalesTenant)} type="button">
                            Export client update note
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportClientStartMessage(activeSalesTenant)} type="button">
                            Export client start message
                          </button>
                          <button className="sm-button-secondary" onClick={() => void handleCopyClientStartMessage(activeSalesTenant)} type="button">
                            Copy start message
                          </button>
                        </div>
                      </article>
                      <article className="sm-pos-feature-card">
                        <p>Sales AI copilot</p>
                        <strong>
                          {activeSalesTenantCopilotPacket?.salesDecision.motion || 'Build handoff packet'}
                        </strong>
                        {(activeSalesTenantCopilotPacket?.nextActions || []).slice(0, 3).map((item) => (
                          <small className="text-xs text-[var(--sm-muted)]" key={`sales-ai-action-${item}`}>
                            {item}
                          </small>
                        ))}
                        <small className="text-xs text-[var(--sm-muted)]">
                          AI-native {activeSalesTenantAiSummary.score}% / {activeSalesTenantAiSummary.live} live / {activeSalesTenantAiSummary.build} build / {activeSalesTenantAiSummary.next} next.
                        </small>
                      </article>
                      {activeSalesTenantTopLaunchGaps.length ? (
                      <article className="sm-pos-feature-card">
                        <p>Next production blockers</p>
                        <strong>{activeSalesTenantTopLaunchGaps[0].label}</strong>
                        {activeSalesTenantTopLaunchGaps.map((gate) => (
                          <small className="text-xs text-[var(--sm-muted)]" key={`desktop-launch-gap-${gate.id}`}>
                            {gate.status.toUpperCase()} / {gate.owner}: {gate.nextAction}
                          </small>
                        ))}
                      </article>
                      ) : null}
                      <article className="sm-pos-feature-card">
                        <p>Workbook contents</p>
                        <strong>Gates, credentials, handoff, SLA, day-one runbook.</strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          This is the practical client folder artifact for sales, implementation, support, and launch review.
                        </small>
                      </article>
                    </section>
                  </details>
                ) : null}
                {compactViewport ? (
                  <details className="sm-pos-readiness-drawer sm-pos-compact-tools">
                    <summary>More client admin tools</summary>
                    <div className="sm-pos-staff-actions mt-3">
                      <button className="sm-button-secondary" onClick={() => void handleExportSalesTenantsExcel()} type="button">
                        Export clients Excel
                      </button>
                      <button className="sm-button-secondary" onClick={() => void handleExportSalesControlPlaneExcel()} type="button">
                        Export control plane Excel
                      </button>
                      {activeSalesTenant ? (
                        <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(activeSalesTenant)} type="button">
                          Export intake workbook
                        </button>
                      ) : null}
                      {activeSalesTenant ? (
                        <button className="sm-button-secondary" onClick={() => handleExportSetupCopilot(activeSalesTenant)} type="button">
                          Export setup copilot
                        </button>
                      ) : null}
                      {activeSalesTenant ? (
                        <>
                          <button className="sm-button-secondary" onClick={() => handleExportHardwareReadiness(activeSalesTenant)} type="button">
                            Export hardware readiness
                          </button>
                          <button className="sm-button-secondary" onClick={() => handleExportClientHandoffPack(activeSalesTenant)} type="button">
                            Export client handoff pack
                          </button>
                        </>
                      ) : null}
                      {activeSalesTenant ? (
                        <button className="sm-button-secondary" onClick={() => handleExportClientProposal(activeSalesTenant)} type="button">
                          Export client proposal
                        </button>
                      ) : null}
                      {activeSalesTenant ? (
                        <button className="sm-button-secondary" onClick={() => handleExportClientUpdateNote(activeSalesTenant)} type="button">
                          Export client update note
                        </button>
                      ) : null}
                      {activeSalesTenant ? (
                        <button className="sm-button-secondary" onClick={() => handleExportClientLaunchBrief(activeSalesTenant)} type="button">
                          Export launch brief
                        </button>
                      ) : null}
                      {activeSalesTenant ? (
                        <button className="sm-button-secondary" onClick={() => handleExportClientStartMessage(activeSalesTenant)} type="button">
                          Export client start message
                        </button>
                      ) : null}
                      <button className="sm-button-secondary" onClick={() => setCompactSalesMode('handoff')} type="button">
                        Open handoff lane
                      </button>
                    </div>
                  </details>
                ) : (
                  <details className="sm-pos-readiness-drawer" open={!compactViewport}>
                  <summary>Client admin registry</summary>
                  <section className="sm-pos-feature-preview mt-3" aria-label="Client setup wizard">
                    <article className="sm-pos-feature-card">
                      <p>Client setup wizard</p>
                      <strong>Create a pilot workspace in one action.</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Enter the client below, choose {salesTenantWizardBusinessProfile.label.toLowerCase()}, then create owner login,
                        role credentials, launch room, and handoff queue without exposing internal controls to the client.
                      </small>
                      <div className="sm-pos-staff-actions">
                        <button className="sm-button-secondary" onClick={handleApplySalesTenantWizardDefaults} type="button">
                          Use recommended defaults
                        </button>
                        <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(activeSalesTenant)} type="button">
                          Export intake workbook
                        </button>
                      </div>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>Recommended template</p>
                      <strong>{POS_SALES_ROLE_TEMPLATE_LABELS[salesTenantRoleTemplate]} / {salesTenantWizardLocationCount} location(s)</strong>
                      <small className="text-xs text-[var(--sm-muted)]">{salesTenantWizardRoleSummary}</small>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Pilot setup converts the lane to signed trial status, generates role logins, and queues a sales handoff packet.
                      </small>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>Client-safe result</p>
                      <strong>POS, setup, and help only for client users.</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Sales Admin and go-live controls stay in the SuperMega internal account; clients receive simple role-based access.
                      </small>
                    </article>
                  </section>
                  <form className="sm-pos-staff-form mt-3" onSubmit={handleAddSalesTenant}>
                    <input
                      className="sm-input"
                      onChange={(event) => setSalesTenantName(event.target.value)}
                      placeholder="Client name"
                      required
                      value={salesTenantName}
                    />
                    <select className="sm-input" onChange={(event) => handleSalesTenantBusinessTypeChange(event.target.value as PosBusinessType)} value={salesTenantBusinessType}>
                      <option value="restaurant">Restaurant</option>
                      <option value="spa">Spa</option>
                      <option value="retail">Retail</option>
                    </select>
                    <input
                      className="sm-input"
                      onChange={(event) => setSalesTenantOwner(event.target.value)}
                      placeholder="Owner"
                      value={salesTenantOwner}
                    />
                    <select className="sm-input" onChange={(event) => setSalesTenantRoleTemplate(event.target.value as PosSalesRoleTemplate)} value={salesTenantRoleTemplate}>
                      {Object.entries(POS_SALES_ROLE_TEMPLATE_LABELS).map(([roleTemplate, label]) => (
                        <option key={roleTemplate} value={roleTemplate}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="sm-input"
                      inputMode="numeric"
                      min={1}
                      onChange={(event) => setSalesTenantLocations(event.target.value)}
                      placeholder="Locations"
                      type="number"
                      value={salesTenantLocations}
                    />
                    <button className="sm-button-secondary" type="submit">
                      Add client lane
                    </button>
                    <button
                      className="sm-button-primary"
                      disabled={Boolean(pilotSetupBusyTenantId)}
                      onClick={() => void handleCreatePilotSetupFromWizard()}
                      type="button"
                    >
                      {pilotSetupBusyTenantId ? 'Preparing pilot...' : 'Create pilot setup'}
                    </button>
                  </form>
                  <div className="sm-pos-staff-actions mt-3">
                    <button className="sm-button-secondary" onClick={() => void handleExportSalesTenantsExcel()} type="button">
                      Export clients Excel
                    </button>
                    <button className="sm-button-secondary" onClick={handleExportSalesTenantsJson} type="button">
                      Export clients JSON
                    </button>
                    <button className="sm-button-secondary" onClick={() => void handleExportSalesControlPlaneExcel()} type="button">
                      Export control plane Excel
                    </button>
                    <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(activeSalesTenant)} type="button">
                      Export intake workbook
                    </button>
                    {activeSalesTenant ? (
                      <button className="sm-button-secondary" onClick={() => handleExportSetupCopilot(activeSalesTenant)} type="button">
                        Export setup copilot
                      </button>
                    ) : null}
                    {activeSalesTenant ? (
                      <>
                        <button className="sm-button-secondary" onClick={() => handleExportHardwareReadiness(activeSalesTenant)} type="button">
                          Export hardware readiness
                        </button>
                        <button className="sm-button-secondary" onClick={() => handleExportClientHandoffPack(activeSalesTenant)} type="button">
                          Export client handoff pack
                        </button>
                      </>
                    ) : null}
                    {activeSalesTenant ? (
                      <button className="sm-button-secondary" onClick={() => handleExportClientProposal(activeSalesTenant)} type="button">
                        Export client proposal
                      </button>
                    ) : null}
                    {activeSalesTenant ? (
                      <button className="sm-button-secondary" onClick={() => handleExportClientUpdateNote(activeSalesTenant)} type="button">
                        Export client update note
                      </button>
                    ) : null}
                    {activeSalesTenant ? (
                      <button className="sm-button-secondary" onClick={() => handleExportClientStartMessage(activeSalesTenant)} type="button">
                        Export client start message
                      </button>
                    ) : null}
                    <button className="sm-button-secondary" onClick={handleExportSalesControlPlaneJson} type="button">
                      Export control plane JSON
                    </button>
                  </div>
                  {salesTenantMessage ? <p className="sm-pos-role-capability mt-2">{salesTenantMessage}</p> : null}
                  {salesTenantSyncMessage ? <p className="sm-pos-role-capability mt-2">{salesTenantSyncMessage}</p> : null}
                  {compactViewport ? (
                    <>
                      <div className="sm-pos-tenant-selector mt-3">
                        {visibleSalesTenantRecords.map((tenant) => (
                          <button
                            className={`sm-pos-tenant-chip ${activeSalesTenant?.id === tenant.id ? 'is-active' : ''}`}
                            key={tenant.id}
                            onClick={() => setActiveSalesTenantId(tenant.id)}
                            type="button"
                          >
                            {tenant.clientName}
                          </button>
                        ))}
                      </div>
                      {activeSalesTenant ? (
                        <article className="sm-pos-feature-card sm-pos-tenant-detail mt-3" key={activeSalesTenant.id}>
                          <p>{activeSalesTenant.status}</p>
                          <strong>{activeSalesTenant.clientName}</strong>
                          <small className="text-xs text-[var(--sm-muted)]">
                            Readiness {getSalesTenantReadiness(activeSalesTenant).score}% / {getSalesTenantReadiness(activeSalesTenant).label}
                          </small>
                          <small className="text-xs text-[var(--sm-muted)]">
                            {getPosBusinessProfile(activeSalesTenant.businessType).label} / owner {activeSalesTenant.owner} / {activeSalesTenant.locationCount} location(s)
                          </small>
                          <small className="text-xs text-[var(--sm-muted)]">
                            Contract {POS_SALES_CONTRACT_STATUS_LABELS[activeSalesTenant.contractStatus]} / Billing {POS_SALES_BILLING_STATUS_LABELS[activeSalesTenant.billingStatus]}
                          </small>
                          <div className="sm-pos-staff-form mt-2">
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantStage(activeSalesTenant.id, event.target.value as PosSalesStage)}
                              value={activeSalesTenant.stage}
                            >
                              {Object.entries(POS_SALES_STAGE_LABELS).map(([stageId, stageLabel]) => (
                                <option key={stageId} value={stageId}>
                                  {stageLabel}
                                </option>
                              ))}
                            </select>
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantRoleTemplate(activeSalesTenant.id, event.target.value as PosSalesRoleTemplate)}
                              value={activeSalesTenant.roleTemplate}
                            >
                              {Object.entries(POS_SALES_ROLE_TEMPLATE_LABELS).map(([roleTemplate, label]) => (
                                <option key={roleTemplate} value={roleTemplate}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantContractStatus(activeSalesTenant.id, event.target.value as PosSalesContractStatus)}
                              value={activeSalesTenant.contractStatus}
                            >
                              {Object.entries(POS_SALES_CONTRACT_STATUS_LABELS).map(([statusId, statusLabel]) => (
                                <option key={statusId} value={statusId}>
                                  {statusLabel}
                                </option>
                              ))}
                            </select>
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantBillingStatus(activeSalesTenant.id, event.target.value as PosSalesBillingStatus)}
                              value={activeSalesTenant.billingStatus}
                            >
                              {Object.entries(POS_SALES_BILLING_STATUS_LABELS).map(([statusId, statusLabel]) => (
                                <option key={statusId} value={statusId}>
                                  {statusLabel}
                                </option>
                              ))}
                            </select>
                            <small className="text-xs text-[var(--sm-muted)] self-center">
                              Updated {new Date(activeSalesTenant.updatedAt).toLocaleString()}
                            </small>
                            <small className="text-xs text-[var(--sm-muted)] self-center">
                              Launch gate {getSalesTenantLaunchGate(activeSalesTenant, salesTenantCloudMode).status.toUpperCase()}
                            </small>
                            <button className="sm-button-secondary" onClick={() => handleExportSalesProvisioningPacket(activeSalesTenant)} type="button">
                              Export packet
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleProvisionSalesTenantLogin(activeSalesTenant)} type="button">
                              Provision login
                            </button>
                            <button
                              className="sm-button-secondary"
                              disabled={pilotSetupBusyTenantId === activeSalesTenant.id}
                              onClick={() => void handleStartPilotSetup(activeSalesTenant)}
                              type="button"
                            >
                              {pilotSetupBusyTenantId === activeSalesTenant.id ? 'Preparing pilot...' : 'Start pilot setup'}
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleExportClientLaunchRoomExcel(activeSalesTenant)} type="button">
                              Export launch room
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportSalesAiHandoffPacket(activeSalesTenant)} type="button">
                              Export sales AI handoff
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(activeSalesTenant)} type="button">
                              Export intake workbook
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientLaunchBrief(activeSalesTenant)} type="button">
                              Export launch brief
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientProposal(activeSalesTenant)} type="button">
                              Export client proposal
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientUpdateNote(activeSalesTenant)} type="button">
                              Export client update note
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientStartMessage(activeSalesTenant)} type="button">
                              Export client start message
                            </button>
                          </div>
                        </article>
                      ) : null}
                    </>
                  ) : (
                    <div className="sm-pos-staff-grid mt-3">
                      {visibleSalesTenantRecords.map((tenant) => (
                        <article className="sm-pos-feature-card" key={tenant.id}>
                          <p>{tenant.status}</p>
                          <strong>{tenant.clientName}</strong>
                          <small className="text-xs text-[var(--sm-muted)]">
                            Readiness {getSalesTenantReadiness(tenant).score}% / {getSalesTenantReadiness(tenant).label}
                          </small>
                          <small className="text-xs text-[var(--sm-muted)]">
                            {getPosBusinessProfile(tenant.businessType).label} / owner {tenant.owner} / {tenant.locationCount} location(s)
                          </small>
                          <small className="text-xs text-[var(--sm-muted)]">
                            Contract {POS_SALES_CONTRACT_STATUS_LABELS[tenant.contractStatus]} / Billing {POS_SALES_BILLING_STATUS_LABELS[tenant.billingStatus]} / Launch {getSalesTenantLaunchGate(tenant, salesTenantCloudMode).status}
                          </small>
                          <div className="sm-pos-staff-form mt-2">
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantStage(tenant.id, event.target.value as PosSalesStage)}
                              value={tenant.stage}
                            >
                              {Object.entries(POS_SALES_STAGE_LABELS).map(([stageId, stageLabel]) => (
                                <option key={stageId} value={stageId}>
                                  {stageLabel}
                                </option>
                              ))}
                            </select>
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantRoleTemplate(tenant.id, event.target.value as PosSalesRoleTemplate)}
                              value={tenant.roleTemplate}
                            >
                              {Object.entries(POS_SALES_ROLE_TEMPLATE_LABELS).map(([roleTemplate, label]) => (
                                <option key={roleTemplate} value={roleTemplate}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantContractStatus(tenant.id, event.target.value as PosSalesContractStatus)}
                              value={tenant.contractStatus}
                            >
                              {Object.entries(POS_SALES_CONTRACT_STATUS_LABELS).map(([statusId, statusLabel]) => (
                                <option key={statusId} value={statusId}>
                                  {statusLabel}
                                </option>
                              ))}
                            </select>
                            <select
                              className="sm-input"
                              onChange={(event) => handleUpdateSalesTenantBillingStatus(tenant.id, event.target.value as PosSalesBillingStatus)}
                              value={tenant.billingStatus}
                            >
                              {Object.entries(POS_SALES_BILLING_STATUS_LABELS).map(([statusId, statusLabel]) => (
                                <option key={statusId} value={statusId}>
                                  {statusLabel}
                                </option>
                              ))}
                            </select>
                            <small className="text-xs text-[var(--sm-muted)] self-center">
                              Updated {new Date(tenant.updatedAt).toLocaleString()}
                            </small>
                            <button className="sm-button-secondary" onClick={() => handleExportSalesProvisioningPacket(tenant)} type="button">
                              Export packet
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleProvisionSalesTenantLogin(tenant)} type="button">
                              Provision login
                            </button>
                            <button
                              className="sm-button-secondary"
                              disabled={pilotSetupBusyTenantId === tenant.id}
                              onClick={() => void handleStartPilotSetup(tenant)}
                              type="button"
                            >
                              {pilotSetupBusyTenantId === tenant.id ? 'Preparing pilot...' : 'Start pilot setup'}
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleExportClientLaunchRoomExcel(tenant)} type="button">
                              Export launch room
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportSetupCopilot(tenant)} type="button">
                              Export setup copilot
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportHardwareReadiness(tenant)} type="button">
                              Export hardware readiness
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientHandoffPack(tenant)} type="button">
                              Export client handoff pack
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportSalesAiHandoffPacket(tenant)} type="button">
                              Export sales AI handoff
                            </button>
                            <button className="sm-button-secondary" onClick={() => void handleExportClientIntakeWorkbook(tenant)} type="button">
                              Export intake workbook
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientLaunchBrief(tenant)} type="button">
                              Export launch brief
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientProposal(tenant)} type="button">
                              Export client proposal
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientUpdateNote(tenant)} type="button">
                              Export client update note
                            </button>
                            <button className="sm-button-secondary" onClick={() => handleExportClientStartMessage(tenant)} type="button">
                              Export client start message
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {compactViewport && salesTenants.length > visibleSalesTenantRecords.length ? (
                    <p className="sm-pos-role-capability mt-2">
                      Showing {visibleSalesTenantRecords.length} of {salesTenants.length} records. Use desktop or export for full registry.
                    </p>
                  ) : null}
                  {activeSalesTenant ? (
                    <section className="sm-pos-feature-preview mt-3" aria-label="Launch and role invite controls">
                      <article className="sm-pos-feature-card">
                        <p>Launch gate</p>
                        <strong>
                          {activeSalesTenant.clientName} / {activeSalesTenantLaunchGate?.status.toUpperCase() || 'UNKNOWN'}
                        </strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          {activeSalesTenantLaunchGate?.summary || 'No launch gate summary.'}
                        </small>
                        {(activeSalesTenantLaunchGate?.blockers || []).map((item) => (
                          <small className="text-xs text-[var(--sm-muted)]" key={`launch-blocker-${item}`}>
                            Blocked: {item}
                          </small>
                        ))}
                        {(activeSalesTenantLaunchGate?.reviewItems || []).map((item) => (
                          <small className="text-xs text-[var(--sm-muted)]" key={`launch-review-${item}`}>
                            Review: {item}
                          </small>
                        ))}
                      </article>
                      <article className="sm-pos-feature-card">
                        <p>Role invite provisioning</p>
                        <strong>
                          {activeSalesTenantRoleOptions.length} role lane(s) / {activeSalesTenantInvites.length} recent invite(s)
                        </strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          Generate or send role invites, then hand over login + PIN setup to the client onboarding lead.
                        </small>
                        <div className="sm-pos-staff-form mt-2">
                          <select
                            className="sm-input"
                            onChange={(event) => setRoleInviteRole(event.target.value as PosUserRole)}
                            value={roleInviteRole}
                          >
                            {activeSalesTenantRoleOptions.map((roleOption) => (
                              <option key={roleOption.id} value={roleOption.id}>
                                {roleOption.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="sm-input"
                            onChange={(event) => setRoleInviteName(event.target.value)}
                            placeholder="Invitee name"
                            value={roleInviteName}
                          />
                          <input
                            className="sm-input"
                            onChange={(event) => setRoleInviteEmail(event.target.value)}
                            placeholder="invitee@email.com"
                            value={roleInviteEmail}
                          />
                          <button
                            className="sm-button-secondary"
                            onClick={() => void handleCreateRoleInvite(activeSalesTenant)}
                            type="button"
                          >
                            {roleInviteBusy ? 'Sending...' : 'Generate invite'}
                          </button>
                          <button className="sm-button-secondary" onClick={() => void handleExportRoleInvitesExcel()} type="button">
                            Export invites Excel
                          </button>
                          <button className="sm-button-secondary" onClick={handleExportRoleInvitesJson} type="button">
                            Export invites JSON
                          </button>
                        </div>
                        {roleInviteMessage ? <small className="text-xs text-[var(--sm-muted)]">{roleInviteMessage}</small> : null}
                        {activeSalesTenantInvites.map((invite) => (
                          <small className="text-xs text-[var(--sm-muted)]" key={invite.id}>
                            {invite.status.toUpperCase()} / {invite.role} / {invite.inviteeEmail} / {invite.username}
                          </small>
                        ))}
                      </article>
                    </section>
                  ) : null}
                  </details>
                )}
              </>
            ) : null}
            {salesPanelForDisplay === 'handoff' ? (
              <>
                <section className="sm-pos-feature-preview" aria-label="Client handoff readiness board">
                  {compactHandoffCards.map((entry) => (
                    <article className="sm-pos-feature-card" key={entry.tenant.id}>
                      <p>{entry.tenant.kind === 'demo' ? 'Demo lane' : 'Client lane'}</p>
                      <strong>{entry.tenant.clientName}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        {getPosBusinessProfile(entry.tenant.businessType).label} / owner {entry.tenant.owner} / {entry.tenant.locationCount} location(s)
                      </small>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Contract {POS_SALES_CONTRACT_STATUS_LABELS[entry.tenant.contractStatus]} / Billing {POS_SALES_BILLING_STATUS_LABELS[entry.tenant.billingStatus]} / Launch {entry.launchGate.status}
                      </small>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Readiness {entry.readiness.score}% / checklist {entry.completedCount} of {entry.checklist.length}
                      </small>
                      {(compactViewport ? entry.checklist.slice(0, 2) : entry.checklist).map((item) => (
                        <small className="text-xs text-[var(--sm-muted)]" key={`${entry.tenant.id}-${item.id}`}>
                          {item.done ? 'Done' : 'Open'}: {item.label}
                        </small>
                      ))}
                      <div className="sm-pos-staff-actions">
                        <button className="sm-button-secondary" onClick={() => handleExportSalesProvisioningPacket(entry.tenant)} type="button">
                          Export handoff packet
                        </button>
                        <button className="sm-button-secondary" onClick={() => void handleProvisionSalesTenantLogin(entry.tenant)} type="button">
                          Provision login
                        </button>
                        <button
                          className="sm-button-secondary"
                          disabled={pilotSetupBusyTenantId === entry.tenant.id}
                          onClick={() => void handleStartPilotSetup(entry.tenant)}
                          type="button"
                        >
                          {pilotSetupBusyTenantId === entry.tenant.id ? 'Preparing pilot...' : 'Start pilot setup'}
                        </button>
                        <button className="sm-button-secondary" onClick={() => void handleExportClientLaunchRoomExcel(entry.tenant)} type="button">
                          Export launch room
                        </button>
                        <button className="sm-button-secondary" onClick={() => handleExportHardwareReadiness(entry.tenant)} type="button">
                          Export hardware readiness
                        </button>
                        <button className="sm-button-secondary" onClick={() => handleExportClientHandoffPack(entry.tenant)} type="button">
                          Export client handoff pack
                        </button>
                        <button className="sm-button-secondary" onClick={() => handleExportSalesAiHandoffPacket(entry.tenant)} type="button">
                          Export sales AI handoff
                        </button>
                        <button className="sm-button-secondary" onClick={() => handleExportClientLaunchBrief(entry.tenant)} type="button">
                          Export launch brief
                        </button>
                        <button className="sm-button-secondary" onClick={() => handleExportClientStartMessage(entry.tenant)} type="button">
                          Export client start message
                        </button>
                        <button className="sm-button-secondary" onClick={() => void handleCopyClientStartMessage(entry.tenant)} type="button">
                          Copy start message
                        </button>
                        <button
                          className="sm-button-secondary"
                          onClick={() => handleUpdateSalesTenantStage(entry.tenant.id, entry.blocked ? 'pilot' : 'go-live')}
                          type="button"
                        >
                          {entry.blocked ? 'Set pilot' : 'Set go-live'}
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
                {compactViewport && salesHandoffCards.length > compactHandoffCards.length ? (
                  <p className="sm-pos-role-capability mt-2">
                    Showing {compactHandoffCards.length} of {salesHandoffCards.length} handoff lanes on mobile.
                  </p>
                ) : null}
                <section className="sm-pos-feature-preview mt-3" aria-label="Auto handoff packet queue">
                  <article className="sm-pos-feature-card">
                    <p>Auto packet queue</p>
                    <strong>{handoffPacketQueue.length} cached packet(s)</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Packets auto-refresh when client lanes move to pilot or go-live.
                    </small>
                    {handoffAutoMessage ? <small className="text-xs text-[var(--sm-muted)]">{handoffAutoMessage}</small> : null}
                  </article>
                  {handoffPacketQueue.slice(0, compactViewport ? 2 : 6).map((item) => (
                    <article className="sm-pos-feature-card" key={item.id}>
                      <p>{POS_SALES_STAGE_LABELS[item.stage]}</p>
                      <strong>{item.tenantName}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Generated {new Date(item.generatedAt).toLocaleString()}
                      </small>
                      <div className="sm-pos-staff-actions">
                        <button className="sm-button-secondary" onClick={() => handleExportQueuedHandoffPacket(item)} type="button">
                          Export cached packet
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
                <details className="sm-pos-readiness-drawer">
                  <summary>Handoff queue notes</summary>
                  <div className="sm-pos-feature-preview mt-3" aria-label="Handoff queue notes">
                    {salesHandoffCards.map((entry) => (
                      <article className="sm-pos-feature-card" key={`handoff-note-${entry.tenant.id}`}>
                        <p>{POS_SALES_STAGE_LABELS[entry.tenant.stage]}</p>
                        <strong>{entry.tenant.clientName}</strong>
                        <small className="text-xs text-[var(--sm-muted)]">
                          {entry.blocked
                            ? 'Blocked: finalize role policy + sync ownership + deployment gate before launch.'
                            : 'Ready: schedule client training handoff and attach deployment packet.'}
                        </small>
                        <small className="text-xs text-[var(--sm-muted)]">
                          Launch {entry.launchGate.status.toUpperCase()} / Contract {POS_SALES_CONTRACT_STATUS_LABELS[entry.tenant.contractStatus]} / Billing {POS_SALES_BILLING_STATUS_LABELS[entry.tenant.billingStatus]}
                        </small>
                      </article>
                    ))}
                  </div>
                </details>
              </>
            ) : null}
            {salesPanelForDisplay === 'ops' ? (
              <section className="sm-pos-feature-preview" aria-label="Admin quick actions">
                <article className="sm-pos-feature-card">
                  <p>Audit trail</p>
                  <strong>{posAuditEvents.length} POS event(s)</strong>
                  <small className="text-xs text-[var(--sm-muted)]">
                    {posAuditMessage || 'Audit trail records login, provisioning, invites, and handoff packet activity.'}
                  </small>
                  {posAuditEvents.slice(0, compactViewport ? 2 : 5).map((event) => (
                    <small className="text-xs text-[var(--sm-muted)]" key={event.event_id || `${event.event_type}-${event.created_at}`}>
                      {event.event_type} / {event.actor} / {event.summary}
                    </small>
                  ))}
                  {!posAuditEvents.length ? (
                    <small className="text-xs text-[var(--sm-muted)]">
                      No durable POS audit entries yet. Sign in, provision a client, or generate a handoff packet to create one.
                    </small>
                  ) : null}
                </article>
                {!compactViewport ? (
                  <article className="sm-pos-feature-card">
                    <p>Launch control</p>
                    <strong>
                      {launchReadyCount}
                      {' '}ready /{' '}
                      {launchBlockedCount}
                      {' '}blocked
                    </strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Contract + billing + stage gates are enforced before provisioning client launch login.
                    </small>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Role invites generated: {roleInvites.length}
                    </small>
                  </article>
                ) : null}
                {compactViewport ? (
                  <>
                    <article className="sm-pos-feature-card">
                      <p>Launch + sync</p>
                      <strong>
                        {launchReadyCount}
                        {' '}ready /{' '}
                        {launchBlockedCount}
                        {' '}blocked
                      </strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Queue {syncSummary.queued} queued / {syncSummary.failed} failed. Role invites {roleInvites.length}.
                      </small>
                    </article>
                    <details className="sm-pos-readiness-drawer">
                      <summary>Ops tools: exports and sales playbook</summary>
                      <div className="sm-pos-staff-actions mt-3">
                        <button className="sm-button-secondary" onClick={handleExportDeploymentPack} type="button">
                          Export deployment JSON
                        </button>
                        <button className="sm-button-secondary" onClick={() => void handleCopyDeploymentChecklist()} type="button">
                          Copy checklist
                        </button>
                        <button className="sm-button-secondary" onClick={() => void handleExportSyncQueueExcel()} type="button">
                          Export queue Excel
                        </button>
                        <button className="sm-button-secondary" onClick={handleFlushSyncQueue} type="button">
                          Flush sync queue
                        </button>
                        <button className="sm-button-secondary" onClick={handleExportOutsourcedSalesPlaybook} type="button">
                          Export sales playbook
                        </button>
                      </div>
                      <div className="sm-pos-feature-preview mt-3" aria-label="Outsourced sales execution lanes">
                        {POS_OUTSOURCED_SALES_STACK.slice(0, 2).map((lane) => (
                          <article className="sm-pos-feature-card" key={lane.id}>
                            <p>{lane.title}</p>
                            <strong>{lane.detail}</strong>
                          </article>
                        ))}
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    <article className="sm-pos-feature-card">
                      <p>Deploy pack</p>
                      <strong>{deploymentPack.environment} / {deploymentPack.versionTag}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">Use this pack for handoff to delivery and client onboarding.</small>
                      <div className="sm-pos-staff-actions">
                        <button className="sm-button-secondary" onClick={handleExportDeploymentPack} type="button">
                          Export deployment JSON
                        </button>
                        <button className="sm-button-secondary" onClick={() => void handleCopyDeploymentChecklist()} type="button">
                          Copy checklist
                        </button>
                      </div>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>Sync evidence</p>
                      <strong>{syncSummary.queued} queued / {syncSummary.failed} failed</strong>
                      <small className="text-xs text-[var(--sm-muted)]">Keep queue clean before sharing screenshots with clients.</small>
                      <div className="sm-pos-staff-actions">
                        <button className="sm-button-secondary" onClick={() => void handleExportSyncQueueExcel()} type="button">
                          Export queue Excel
                        </button>
                        <button className="sm-button-secondary" onClick={handleFlushSyncQueue} type="button">
                          Flush sync queue
                        </button>
                      </div>
                    </article>
                    <article className="sm-pos-feature-card">
                      <p>Outsourced sales engine</p>
                      <strong>{POS_OUTSOURCED_SALES_STACK.length} execution lanes</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        Keep sales delivery consistent across internal team and outsourced reps.
                      </small>
                      {POS_OUTSOURCED_SALES_STACK.map((lane) => (
                        <small className="text-xs text-[var(--sm-muted)]" key={lane.id}>
                          {lane.title}: {lane.detail}
                        </small>
                      ))}
                      <div className="sm-pos-staff-actions">
                        <button className="sm-button-secondary" onClick={handleExportOutsourcedSalesPlaybook} type="button">
                          Export sales playbook
                        </button>
                      </div>
                    </article>
                  </>
                )}
              </section>
            ) : null}
            {salesPanelForDisplay === 'meta' ? (
              <>
                <section className="sm-pos-feature-preview" aria-label="Sales platform admin control">
                  <article className="sm-pos-feature-card">
                    <p>Platform control</p>
                    <strong>{clientLaneCount} client lane(s) / {demoLaneCount} demo lane(s) / {roleInvites.length} role invite(s)</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Use this lane as the sales-team command center for client provisioning, role policy, and deployment handoff.
                    </small>
                    <div className="sm-pos-staff-actions">
                      <button className="sm-button-secondary" onClick={() => void handleExportSalesTenantsExcel()} type="button">
                        Export tenant registry
                      </button>
                      <button className="sm-button-secondary" onClick={() => void handleExportSalesControlPlaneExcel()} type="button">
                        Export platform matrix
                      </button>
                      <button className="sm-button-secondary" onClick={handleExportOutsourcedSalesPlaybook} type="button">
                        Export sales engine
                      </button>
                    </div>
                  </article>
                </section>
                <section className="sm-pos-feature-preview" aria-label="Business pack blueprints">
                  {(compactViewport ? businessPackCards.slice(0, 2) : businessPackCards).map((card) => (
                    <article className="sm-pos-feature-card" key={card.id}>
                      <p>{card.label} pack</p>
                      <strong>{card.summary}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">Role template: {POS_SALES_ROLE_TEMPLATE_LABELS[card.roleTemplate]}</small>
                      <small className="text-xs text-[var(--sm-muted)]">Role scope: {card.roleScope}</small>
                      <small className="text-xs text-[var(--sm-muted)]">Modules: {card.moduleScope}</small>
                      <div className="sm-pos-staff-actions">
                        <button
                          className="sm-button-secondary"
                          onClick={() => {
                            setSalesTenantBusinessType(card.id)
                            setSalesTenantRoleTemplate(card.roleTemplate)
                            setSalesTenantMessage(`${card.label} blueprint applied to add-client form.`)
                          }}
                          type="button"
                        >
                          Apply blueprint
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
                <section className="sm-pos-feature-preview" aria-label="Role template policy">
                  {(compactViewport
                    ? Object.entries(POS_SALES_ROLE_TEMPLATE_LABELS).slice(0, 3)
                    : Object.entries(POS_SALES_ROLE_TEMPLATE_LABELS)).map(([templateId, templateLabel]) => (
                    <article className="sm-pos-feature-card" key={templateId}>
                      <p>Role policy</p>
                      <strong>{templateLabel}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">
                        {POS_SALES_ROLE_TEMPLATE_SUMMARY[templateId as PosSalesRoleTemplate]}
                      </small>
                    </article>
                  ))}
                </section>
              </>
            ) : null}
            {salesPanelForDisplay === 'portfolio' ? (
              <>
                <section className="sm-pos-feature-preview" aria-label="POS future roadmap">
                  <article className="sm-pos-feature-card">
                    <p>Current state</p>
                    <strong>{clientLaneCount} client lane(s) / {launchReadyCount} ready-to-launch lane(s)</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Keep POS host focused on sellable operations. Expand only after launch quality is stable.
                    </small>
                  </article>
                  {(compactViewport ? POS_PRODUCT_FUTURE_MAP.slice(0, 3) : POS_PRODUCT_FUTURE_MAP).map((item) => (
                    <article className="sm-pos-feature-card" key={item.id}>
                      <p>{item.horizon}</p>
                      <strong>{item.title}</strong>
                      <small className="text-xs text-[var(--sm-muted)]">{item.detail}</small>
                    </article>
                  ))}
                </section>
                <section className="sm-pos-feature-preview" aria-label="POS expansion path">
                  <article className="sm-pos-feature-card">
                    <p>Product path</p>
                    <strong>POS core / vertical packs / enterprise control plane</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Keep this host POS-only. Expand inside POS lanes with enterprise-grade staff, sync, and deployment controls.
                    </small>
                  </article>
                  <article className="sm-pos-feature-card">
                    <p>Next release gates</p>
                    <strong>Auth hardening / role audit / export QA / go-live packet</strong>
                    <small className="text-xs text-[var(--sm-muted)]">
                      Keep these four gates green before scaling client count or adding new vertical modules.
                    </small>
                  </article>
                </section>
              </>
            ) : null}
          </div>
        ) : null}

        {surfaceForDisplay === 'help' ? (
          <div className={`sm-pos-surface-content ${compactViewport ? 'is-compact' : ''}`} aria-label="POS help manual">
            <section className="sm-pos-feature-preview" aria-label="POS quick manual">
              <article className="sm-pos-feature-card">
                <p>POS quick manual</p>
                <strong>{businessProfile.label} / {role?.label || session.activeRole}</strong>
                <small className="text-xs text-[var(--sm-muted)]">
                  {compactViewport
                    ? 'Daily guide. SuperMega handles launch, hardware, backup, and account changes.'
                    : 'Use this as the client-safe operating guide. Internal launch, hardware, backup, and sales controls stay with SuperMega.'}
                </small>
                <div className="sm-pos-staff-actions">
                  <button className="sm-button-secondary" onClick={handleExportClientQuickStart} type="button">
                    Export quick start
                  </button>
                  <button className="sm-button-secondary" onClick={handleExportClientSupportRequest} type="button">
                    Export support request
                  </button>
                </div>
              </article>
              {helpBusinessCards.slice(0, compactViewport ? 1 : 3).map((card) => (
                <article className="sm-pos-feature-card" key={`help-business-${card.id}`}>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </section>
            <section className="sm-pos-feature-preview mt-3" aria-label="POS daily use steps">
              {helpDailyFlowCards.slice(0, compactViewport ? 1 : helpDailyFlowCards.length).map((card) => (
                <article className="sm-pos-feature-card" key={`help-flow-${card.id}`}>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </section>
            <section className="sm-pos-feature-preview mt-3" aria-label="POS policy and support guide">
              {helpPolicyCards.slice(0, compactViewport ? 1 : helpPolicyCards.length).map((card) => (
                <article className="sm-pos-feature-card" key={`help-policy-${card.id}`}>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                </article>
              ))}
              <article className="sm-pos-feature-card">
                <p>If stuck</p>
                <strong>Go back to POS for daily work, Setup for staff/role changes, or ask SuperMega for printer, device, backup, and account changes.</strong>
                <div className="sm-pos-staff-actions">
                  <button className="sm-button-secondary" onClick={() => setActiveSurface('workspace')} type="button">
                    Open POS
                  </button>
                  <button
                    className="sm-button-secondary"
                    onClick={() => {
                      setActiveSurface('control')
                      setActiveControlPanel('overview')
                      setCompactControlMode('overview')
                    }}
                    type="button"
                  >
                    Open setup
                  </button>
                  {isInternalOperator ? (
                    <button
                      className="sm-button-secondary"
                      onClick={() => {
                        setActiveSurface('sales')
                        setActiveSalesPanel('clients')
                        setCompactSalesMode('clients')
                      }}
                      type="button"
                    >
                      Open clients
                    </button>
                  ) : null}
                </div>
              </article>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  )
}
