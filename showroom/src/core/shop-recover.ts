import { collectLocalWorkspaceBackup } from './local-workspace-backup.ts'
import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  readShopServiceSchedule,
} from './shop-service-scheduling.ts'

type ShopScheduleRecoveryStorage = Pick<Storage, 'getItem' | 'key' | 'length' | 'removeItem'>

function isUnreadableSchedule(raw: string) {
  try {
    readShopServiceSchedule(raw)
    return false
  } catch {
    return true
  }
}

export function prepareUnreadableShopScheduleRecovery(
  storage: ShopScheduleRecoveryStorage,
  createdAt = new Date().toISOString(),
) {
  const raw = storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  if (raw === null || !isUnreadableSchedule(raw)) {
    throw new Error('The appointment record is readable or no longer exists. Nothing was cleared.')
  }
  const backup = collectLocalWorkspaceBackup(storage, createdAt)
  if (!backup) {
    throw new Error('This device cannot create a safe workspace backup, so unreadable appointments were not cleared.')
  }
  return {
    raw,
    backup,
    filename: `supermega-workspace-before-appointment-recovery-${createdAt.slice(0, 10)}.json`,
  }
}

export function clearUnreadableShopSchedule(
  storage: ShopScheduleRecoveryStorage,
  expectedRaw: string,
) {
  const current = storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  if (current !== expectedRaw || current === null || !isUnreadableSchedule(current)) {
    throw new Error('The appointment record changed or became readable. Nothing was cleared.')
  }
  storage.removeItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  if (storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY) !== null) {
    throw new Error('The browser did not confirm appointment recovery. Try the recovery controls instead.')
  }
  return { cleared: true as const, storageKey: SHOP_SERVICE_SCHEDULE_STORAGE_KEY }
}
