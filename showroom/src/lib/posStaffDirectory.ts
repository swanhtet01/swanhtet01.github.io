import type { PosLocationProfile, PosSession, PosUserRole } from './posAuth'

const POS_STAFF_STORAGE_PREFIX = 'supermega.pos.staff-directory.v1'
const POS_ROLE_SET = new Set<PosUserRole>(['owner', 'manager', 'cashier', 'auditor', 'front-desk', 'service-provider', 'inventory-clerk'])

export type PosStaffStatus = 'active' | 'suspended'

export type PosStaffMember = {
  id: string
  displayName: string
  role: PosUserRole
  locationId: string
  locationLabel: string
  status: PosStaffStatus
  pinDigest: string
  pinHint: string
  note: string
  createdAt: string
  updatedAt: string
  pinUpdatedAt: string
}

export type PosStaffDraft = {
  displayName: string
  role: PosUserRole
  locationId: string
  note: string
  pin: string
}

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function normalizeScopeKey(scopeKey: string) {
  return String(scopeKey || 'pos-default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, '-')
    .replace(/^-|-$/g, '') || 'pos-default'
}

function getStorageKey(scopeKey: string) {
  return `${POS_STAFF_STORAGE_PREFIX}.${normalizeScopeKey(scopeKey)}`
}

function resolveLocationLabel(locationId: string, locations: PosLocationProfile[]) {
  const normalized = String(locationId || '').trim().toLowerCase()
  const match = locations.find((location) => location.id === normalized)
  return match?.label || 'Main location'
}

function sanitizeDisplayName(value: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72)
}

function normalizeStatus(value: unknown): PosStaffStatus {
  return value === 'suspended' ? 'suspended' : 'active'
}

function buildPinDigest(pin: string) {
  const normalized = String(pin || '').trim()
  const checksum = normalized.split('').reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0)
  return `demo-pin-${normalized.length}-${checksum.toString(36)}`
}

function buildPinHint(pin: string) {
  const normalized = String(pin || '').trim()
  if (!normalized) {
    return 'not-set'
  }
  return `**${normalized.slice(-2)}`
}

function normalizeStaffMember(value: unknown, locations: PosLocationProfile[]): PosStaffMember | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<PosStaffMember>
  const role = String(raw.role || '').trim().toLowerCase() as PosUserRole
  const locationId = String(raw.locationId || '').trim().toLowerCase()
  const displayName = sanitizeDisplayName(String(raw.displayName || ''))
  if (!displayName || !role || !locationId || !POS_ROLE_SET.has(role)) {
    return null
  }
  const pinDigest = String(raw.pinDigest || '').trim()
  const pinHint = String(raw.pinHint || '').trim()
  const now = nowIso()
  return {
    id: String(raw.id || createId('staff')),
    displayName,
    role,
    locationId,
    locationLabel: resolveLocationLabel(locationId, locations),
    status: normalizeStatus(raw.status),
    pinDigest: pinDigest || 'legacy-unknown',
    pinHint: pinHint || '**--',
    note: String(raw.note || '').trim().slice(0, 180),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || raw.createdAt || now),
    pinUpdatedAt: String(raw.pinUpdatedAt || raw.updatedAt || raw.createdAt || now),
  }
}

function sortStaff(items: PosStaffMember[]) {
  return [...items].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function saveStaffDirectory(scopeKey: string, items: PosStaffMember[]) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(getStorageKey(scopeKey), JSON.stringify(items))
  } catch {
    // Ignore storage errors for restricted environments.
  }
}

function buildSeedStaff(session: PosSession) {
  const locations = session.locations
  const now = nowIso()
  const seedRole = session.roles.includes('owner') ? 'owner' : session.roles[0]
  const seedLocation = locations.find((location) => location.id === session.activeLocationId) || locations[0]
  if (!seedRole || !seedLocation) {
    return []
  }
  return [
    {
      id: createId('staff'),
      displayName: session.displayName,
      role: seedRole,
      locationId: seedLocation.id,
      locationLabel: seedLocation.label,
      status: 'active',
      pinDigest: buildPinDigest('0000'),
      pinHint: '**00',
      note: 'Seed owner profile. Rotate PIN before go-live.',
      createdAt: now,
      updatedAt: now,
      pinUpdatedAt: now,
    },
  ] satisfies PosStaffMember[]
}

export function isValidPosStaffPin(pin: string) {
  return /^\d{4,8}$/.test(String(pin || '').trim())
}

export function loadPosStaffDirectory(scopeKey: string, session: PosSession): PosStaffMember[] {
  const storageKey = getStorageKey(scopeKey)
  const locations = session.locations
  if (typeof window === 'undefined') {
    return buildSeedStaff(session)
  }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      const seeded = buildSeedStaff(session)
      saveStaffDirectory(scopeKey, seeded)
      return seeded
    }
    const parsed = JSON.parse(raw)
    const normalized = Array.isArray(parsed)
      ? parsed
        .map((item) => normalizeStaffMember(item, locations))
        .filter((item): item is PosStaffMember => Boolean(item))
      : []
    if (!normalized.length) {
      const seeded = buildSeedStaff(session)
      saveStaffDirectory(scopeKey, seeded)
      return seeded
    }
    const sorted = sortStaff(normalized)
    saveStaffDirectory(scopeKey, sorted)
    return sorted
  } catch {
    return buildSeedStaff(session)
  }
}

export function replacePosStaffDirectory(scopeKey: string, session: PosSession, rows: unknown): PosStaffMember[] {
  const normalized = Array.isArray(rows)
    ? rows
      .map((item) => normalizeStaffMember(item, session.locations))
      .filter((item): item is PosStaffMember => Boolean(item))
    : []
  const next = normalized.length ? sortStaff(normalized) : buildSeedStaff(session)
  saveStaffDirectory(scopeKey, next)
  return next
}

export function createPosStaffMember(
  scopeKey: string,
  current: PosStaffMember[],
  session: PosSession,
  draft: PosStaffDraft,
) {
  const displayName = sanitizeDisplayName(draft.displayName)
  const locationId = String(draft.locationId || '').trim().toLowerCase()
  const role = String(draft.role || '').trim().toLowerCase() as PosUserRole
  const note = String(draft.note || '').trim().slice(0, 180)
  const pin = String(draft.pin || '').trim()
  if (!displayName || !locationId || !role || !POS_ROLE_SET.has(role) || !isValidPosStaffPin(pin)) {
    return current
  }
  const locationLabel = resolveLocationLabel(locationId, session.locations)
  const now = nowIso()
  const next = sortStaff([
    ...current,
    {
      id: createId('staff'),
      displayName,
      role,
      locationId,
      locationLabel,
      status: 'active',
      pinDigest: buildPinDigest(pin),
      pinHint: buildPinHint(pin),
      note,
      createdAt: now,
      updatedAt: now,
      pinUpdatedAt: now,
    },
  ])
  saveStaffDirectory(scopeKey, next)
  return next
}

export function rotatePosStaffPin(scopeKey: string, current: PosStaffMember[], staffId: string, nextPin: string) {
  if (!isValidPosStaffPin(nextPin)) {
    return current
  }
  const normalizedId = String(staffId || '').trim()
  const now = nowIso()
  const next = sortStaff(
    current.map((member) =>
      member.id === normalizedId
        ? {
          ...member,
          pinDigest: buildPinDigest(nextPin),
          pinHint: buildPinHint(nextPin),
          pinUpdatedAt: now,
          updatedAt: now,
        }
        : member,
    ),
  )
  saveStaffDirectory(scopeKey, next)
  return next
}

export function updatePosStaffStatus(scopeKey: string, current: PosStaffMember[], staffId: string, status: PosStaffStatus) {
  const normalizedId = String(staffId || '').trim()
  const now = nowIso()
  const next = sortStaff(
    current.map((member) =>
      member.id === normalizedId
        ? {
          ...member,
          status,
          updatedAt: now,
        }
        : member,
    ),
  )
  saveStaffDirectory(scopeKey, next)
  return next
}
