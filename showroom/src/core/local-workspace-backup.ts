import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from '../products/product-handoff'
import { WEBSITE_LEAD_LEDGER_KEY } from '../products/website/website-leads'
import { BEHAVIOR_TRAIL_KEY } from './behavior-trail'
import { COMMERCE_KEY, LEGACY_COMMERCE_KEYS } from './commerce-workspace'
import { CLIENT_DEMO_WORKSPACE_STORAGE_KEY } from './client-onboarding'
import { PLANT_INDUSTRY_PACK_STORAGE_KEY } from './plant-industry-packs'
import {
  ACTION_KEY,
  APPROVAL_KEY,
  LEGACY_APPROVAL_KEYS,
  LEGACY_SETUP_KEYS,
  LEGACY_STOREFRONT_DRAFT_RESET_KEY,
  LEGACY_STOREFRONT_DRAFT_RESET_PREFIX,
  SETUP_KEY,
  SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
  SHOP_ORDER_DRAFT_RESET_PREFIX,
  STOREFRONT_DRAFT_RESET_PREFIX,
  WEBSITE_RECOVERY_EXPORT_PREFIX,
} from './product-setup'
import { LEGACY_PRODUCTION_KEYS, PRODUCTION_KEY } from './production-workspace'
import { SHOP_SERVICE_SCHEDULE_STORAGE_KEY } from './shop-service-scheduling'
import { LEGACY_TEAM_WORK_KEYS, TEAM_WORK_KEY } from './team-work'

export const LOCAL_WORKSPACE_BACKUP_CONTRACT = 'supermega.local_workspace_backup.v1'
export const LOCAL_WORKSPACE_BACKUP_MAX_BYTES = 5 * 1024 * 1024
export const LOCAL_WORKSPACE_RESTORE_POINT_KEY = 'supermega.local-workspace-restore-point.v1'

export type LocalWorkspaceBackup = {
  contract: typeof LOCAL_WORKSPACE_BACKUP_CONTRACT
  version: 1
  createdAt: string
  records: Record<string, string>
}

type StorageReader = Pick<Storage, 'getItem' | 'key' | 'length'>
type StorageWriter = StorageReader & Pick<Storage, 'removeItem' | 'setItem'>

const exactWorkspaceKeys = new Set([
  COMMERCE_KEY,
  PRODUCTION_KEY,
  APPROVAL_KEY,
  SETUP_KEY,
  ACTION_KEY,
  BEHAVIOR_TRAIL_KEY,
  SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
  TEAM_WORK_KEY,
  WEBSITE_STORAGE_KEY,
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_LEAD_LEDGER_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  CLIENT_DEMO_WORKSPACE_STORAGE_KEY,
  LEGACY_STOREFRONT_DRAFT_RESET_KEY,
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  PLANT_INDUSTRY_PACK_STORAGE_KEY,
  ...LEGACY_TEAM_WORK_KEYS,
  ...LEGACY_COMMERCE_KEYS,
  ...LEGACY_PRODUCTION_KEYS,
  ...LEGACY_APPROVAL_KEYS,
  ...LEGACY_SETUP_KEYS,
])

export function isLocalWorkspaceKey(key: string) {
  return exactWorkspaceKeys.has(key)
    || key.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)
    || key.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)
    || key.startsWith(SHOP_ORDER_DRAFT_RESET_PREFIX)
    || key.startsWith(WEBSITE_RECOVERY_EXPORT_PREFIX)
}

function checkedBackup(value: unknown): LocalWorkspaceBackup | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<LocalWorkspaceBackup>
  if (source.contract !== LOCAL_WORKSPACE_BACKUP_CONTRACT
    || source.version !== 1
    || typeof source.createdAt !== 'string'
    || !Number.isFinite(Date.parse(source.createdAt))
    || !source.records
    || typeof source.records !== 'object'
    || Array.isArray(source.records)) return null
  const entries = Object.entries(source.records)
  if (entries.length > 256) return null
  const records: Record<string, string> = {}
  for (const [key, raw] of entries) {
    if (!key || key.length > 240 || !isLocalWorkspaceKey(key) || typeof raw !== 'string') return null
    records[key] = raw
  }
  const backup: LocalWorkspaceBackup = {
    contract: LOCAL_WORKSPACE_BACKUP_CONTRACT,
    version: 1,
    createdAt: source.createdAt,
    records,
  }
  return new TextEncoder().encode(JSON.stringify(backup)).byteLength <= LOCAL_WORKSPACE_BACKUP_MAX_BYTES ? backup : null
}

export function collectLocalWorkspaceBackup(storage: StorageReader, createdAt = new Date().toISOString()) {
  const records: Record<string, string> = {}
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key || !isLocalWorkspaceKey(key)) continue
    const value = storage.getItem(key)
    if (value !== null) records[key] = value
  }
  return checkedBackup({ contract: LOCAL_WORKSPACE_BACKUP_CONTRACT, version: 1, createdAt, records })
}

export function restoreLocalWorkspaceBackup(value: unknown) {
  return checkedBackup(value)
}

export function restoreLocalWorkspaceBackupFromEvidence(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const evidence = value as { contract?: unknown; version?: unknown; environment?: unknown; localWorkspaceBackup?: unknown }
  if (evidence.contract !== 'supermega_trial_evidence'
    || evidence.version !== 24
    || evidence.environment !== 'isolated_demo') return null
  return checkedBackup(evidence.localWorkspaceBackup)
}

function removeLocalWorkspaceRecords(storage: StorageWriter) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key && isLocalWorkspaceKey(key)))
  keys.forEach((key) => storage.removeItem(key))
}

export function applyLocalWorkspaceBackup(storage: StorageWriter, value: LocalWorkspaceBackup) {
  const backup = checkedBackup(value)
  const previous = collectLocalWorkspaceBackup(storage)
  if (!backup || !previous) throw new Error('The local workspace backup is invalid or too large.')
  try {
    removeLocalWorkspaceRecords(storage)
    Object.entries(backup.records).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, raw]) => storage.setItem(key, raw))
  } catch (error) {
    try {
      removeLocalWorkspaceRecords(storage)
      Object.entries(previous.records).forEach(([key, raw]) => storage.setItem(key, raw))
    } catch { /* Preserve the original failure. */ }
    throw error
  }
}
