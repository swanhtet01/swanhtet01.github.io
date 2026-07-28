export const SHOP_SERVICE_SCHEDULE_SCHEMA = 'supermega.shop.service_schedule.v1' as const
export const SHOP_SERVICE_SCHEDULE_STORAGE_KEY = 'supermega.shop.service-schedule.v1'

export type ShopService = {
  id: string
  name: string
  durationMinutes: number
  priceMmk: number
  active: boolean
}

export type ShopServiceResource = {
  id: string
  name: string
  kind: 'staff' | 'room' | 'equipment'
  active: boolean
}

export type ShopServiceBookingStatus = 'held' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled'

export type ShopServiceBooking = {
  id: string
  customerName: string
  contact: string
  serviceId: string
  resourceId: string
  startsAt: string
  endsAt: string
  status: ShopServiceBookingStatus
  note: string
  createdAt: string
  updatedAt: string
}

export type ShopServiceScheduleEvent = {
  revision: number
  type: 'service_registered' | 'resource_registered' | 'booking_scheduled' | 'booking_advanced' | 'booking_cancelled'
  subjectId: string
  actor: string
  reason: string
  happenedAt: string
}

export type ShopServiceSchedule = {
  schema: typeof SHOP_SERVICE_SCHEDULE_SCHEMA
  revision: number
  services: ShopService[]
  resources: ShopServiceResource[]
  bookings: ShopServiceBooking[]
  events: ShopServiceScheduleEvent[]
}

export type ShopServiceScheduleProof = {
  actor: string
  reason: string
  happenedAt: string
}

export type ShopServiceScheduleProjection = {
  activeServices: number
  activeResources: number
  today: ShopServiceBooking[]
  upcoming: ShopServiceBooking[]
  awaitingArrival: number
  inService: number
  completedToday: number
  expectedRevenueMmk: number
}

const bookingTransitions: Record<Exclude<ShopServiceBookingStatus, 'completed' | 'cancelled'>, ShopServiceBookingStatus> = {
  held: 'confirmed',
  confirmed: 'checked_in',
  checked_in: 'completed',
}

function boundedText(value: string, label: string, maximum = 160) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`)
  if (Array.from(normalized).some((character) => {
    const code = character.codePointAt(0) as number
    return code <= 31 || code === 127
  })) throw new Error(`${label} contains unsupported control characters.`)
  return normalized
}

function positiveWholeNumber(value: number, label: string, maximum: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be a whole number from 1 to ${maximum.toLocaleString()}.`)
  }
  return value
}

function validIso(value: string, label: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) throw new Error(`${label} must be an exact ISO timestamp.`)
  return timestamp
}

function identifier(prefix: string, revision: number) {
  return `${prefix}-${String(revision).padStart(4, '0')}`
}

function proofRecord(proof: ShopServiceScheduleProof) {
  return {
    actor: boundedText(proof.actor, 'Actor', 120),
    reason: boundedText(proof.reason, 'Reason', 240),
    happenedAt: new Date(validIso(proof.happenedAt, 'Evidence time')).toISOString(),
  }
}

export function createShopServiceSchedule(): ShopServiceSchedule {
  return {
    schema: SHOP_SERVICE_SCHEDULE_SCHEMA,
    revision: 0,
    services: [
      { id: 'service-consultation', name: 'Consultation', durationMinutes: 30, priceMmk: 20_000, active: true },
      { id: 'service-session', name: 'Standard session', durationMinutes: 60, priceMmk: 45_000, active: true },
    ],
    resources: [
      { id: 'resource-staff-1', name: 'Staff 1', kind: 'staff', active: true },
      { id: 'resource-room-1', name: 'Room 1', kind: 'room', active: true },
    ],
    bookings: [],
    events: [],
  }
}

export function validateShopServiceSchedule(state: ShopServiceSchedule) {
  if (!state || state.schema !== SHOP_SERVICE_SCHEDULE_SCHEMA) throw new Error('Unsupported Shop service schedule.')
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('Invalid Shop service schedule revision.')
  if (!Array.isArray(state.services) || !Array.isArray(state.resources) || !Array.isArray(state.bookings) || !Array.isArray(state.events)) throw new Error('Incomplete Shop service schedule.')
  const serviceIds = new Set<string>()
  for (const service of state.services) {
    const id = boundedText(service.id, 'Service ID', 80)
    if (serviceIds.has(id)) throw new Error(`Duplicate service ${id}.`)
    serviceIds.add(id)
    boundedText(service.name, 'Service name')
    positiveWholeNumber(service.durationMinutes, 'Service duration', 24 * 60)
    positiveWholeNumber(service.priceMmk, 'Service price', Number.MAX_SAFE_INTEGER)
    if (typeof service.active !== 'boolean') throw new Error(`Service ${id} has an invalid active state.`)
  }
  const resourceIds = new Set<string>()
  for (const resource of state.resources) {
    const id = boundedText(resource.id, 'Resource ID', 80)
    if (resourceIds.has(id)) throw new Error(`Duplicate resource ${id}.`)
    resourceIds.add(id)
    boundedText(resource.name, 'Resource name')
    if (!['staff', 'room', 'equipment'].includes(resource.kind)) throw new Error(`Resource ${id} has an invalid kind.`)
    if (typeof resource.active !== 'boolean') throw new Error(`Resource ${id} has an invalid active state.`)
  }
  const bookingIds = new Set<string>()
  for (const booking of state.bookings) {
    const id = boundedText(booking.id, 'Booking ID', 80)
    if (bookingIds.has(id)) throw new Error(`Duplicate booking ${id}.`)
    bookingIds.add(id)
    boundedText(booking.customerName, 'Customer name')
    boundedText(booking.contact, 'Customer contact')
    if (!serviceIds.has(booking.serviceId)) throw new Error(`Booking ${id} references an unknown service.`)
    if (!resourceIds.has(booking.resourceId)) throw new Error(`Booking ${id} references an unknown resource.`)
    const startsAt = validIso(booking.startsAt, 'Booking start')
    const endsAt = validIso(booking.endsAt, 'Booking end')
    if (endsAt <= startsAt) throw new Error(`Booking ${id} must end after it starts.`)
    if (!['held', 'confirmed', 'checked_in', 'completed', 'cancelled'].includes(booking.status)) throw new Error(`Booking ${id} has an invalid status.`)
    if (booking.note.length > 300) throw new Error(`Booking ${id} note is too long.`)
    validIso(booking.createdAt, 'Booking creation time')
    validIso(booking.updatedAt, 'Booking update time')
  }
  const blocking = state.bookings.filter((booking) => booking.status !== 'cancelled')
  for (let left = 0; left < blocking.length; left += 1) {
    for (let right = left + 1; right < blocking.length; right += 1) {
      const first = blocking[left]
      const second = blocking[right]
      if (first.resourceId === second.resourceId
        && Date.parse(first.startsAt) < Date.parse(second.endsAt)
        && Date.parse(second.startsAt) < Date.parse(first.endsAt)) throw new Error(`Bookings ${first.id} and ${second.id} overlap.`)
    }
  }
  if (state.events.length !== state.revision) throw new Error('Shop service schedule evidence is incomplete.')
  state.events.forEach((event, index) => {
    if (event.revision !== index + 1) throw new Error('Shop service schedule evidence revisions are not continuous.')
    boundedText(event.subjectId, 'Evidence subject', 80)
    boundedText(event.actor, 'Evidence actor', 120)
    boundedText(event.reason, 'Evidence reason', 240)
    validIso(event.happenedAt, 'Evidence time')
  })
  return state
}

function appendEvent(state: ShopServiceSchedule, event: Omit<ShopServiceScheduleEvent, 'revision'>) {
  const revision = state.revision + 1
  return { ...state, revision, events: [...state.events, { ...event, revision }] }
}

export function registerShopService(state: ShopServiceSchedule, input: Omit<ShopService, 'id' | 'active'>, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  const revision = state.revision + 1
  const service: ShopService = {
    id: identifier('service', revision),
    name: boundedText(input.name, 'Service name'),
    durationMinutes: positiveWholeNumber(input.durationMinutes, 'Service duration', 24 * 60),
    priceMmk: positiveWholeNumber(input.priceMmk, 'Service price', Number.MAX_SAFE_INTEGER),
    active: true,
  }
  const next = appendEvent({ ...state, services: [...state.services, service] }, { type: 'service_registered', subjectId: service.id, ...evidence })
  return validateShopServiceSchedule(next)
}

export function registerShopServiceResource(state: ShopServiceSchedule, input: Pick<ShopServiceResource, 'name' | 'kind'>, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  if (!['staff', 'room', 'equipment'].includes(input.kind)) throw new Error('Choose staff, room, or equipment.')
  const revision = state.revision + 1
  const resource: ShopServiceResource = { id: identifier('resource', revision), name: boundedText(input.name, 'Resource name'), kind: input.kind, active: true }
  const next = appendEvent({ ...state, resources: [...state.resources, resource] }, { type: 'resource_registered', subjectId: resource.id, ...evidence })
  return validateShopServiceSchedule(next)
}

export function scheduleShopServiceBooking(state: ShopServiceSchedule, input: {
  customerName: string
  contact: string
  serviceId: string
  resourceId: string
  startsAt: string
  note?: string
}, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  const service = state.services.find((candidate) => candidate.id === input.serviceId && candidate.active)
  if (!service) throw new Error('Choose an active service.')
  const resource = state.resources.find((candidate) => candidate.id === input.resourceId && candidate.active)
  if (!resource) throw new Error('Choose active staff, room, or equipment.')
  const startsAt = validIso(input.startsAt, 'Booking start')
  const endsAt = startsAt + service.durationMinutes * 60_000
  const conflict = state.bookings.find((booking) => booking.resourceId === resource.id
    && booking.status !== 'cancelled'
    && startsAt < Date.parse(booking.endsAt)
    && Date.parse(booking.startsAt) < endsAt)
  if (conflict) throw new Error(`${resource.name} is already booked during that time.`)
  const revision = state.revision + 1
  const booking: ShopServiceBooking = {
    id: identifier('booking', revision),
    customerName: boundedText(input.customerName, 'Customer name'),
    contact: boundedText(input.contact, 'Customer contact'),
    serviceId: service.id,
    resourceId: resource.id,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    status: 'held',
    note: (input.note ?? '').trim().slice(0, 300),
    createdAt: evidence.happenedAt,
    updatedAt: evidence.happenedAt,
  }
  const next = appendEvent({ ...state, bookings: [...state.bookings, booking] }, { type: 'booking_scheduled', subjectId: booking.id, ...evidence })
  return validateShopServiceSchedule(next)
}

export function advanceShopServiceBooking(state: ShopServiceSchedule, bookingId: string, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  const booking = state.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking) throw new Error('Booking not found.')
  if (booking.status === 'completed' || booking.status === 'cancelled') throw new Error('This booking has no next operating step.')
  const status = bookingTransitions[booking.status]
  const next = appendEvent({
    ...state,
    bookings: state.bookings.map((candidate) => candidate.id === bookingId ? { ...candidate, status, updatedAt: evidence.happenedAt } : candidate),
  }, { type: 'booking_advanced', subjectId: bookingId, ...evidence })
  return validateShopServiceSchedule(next)
}

export function cancelShopServiceBooking(state: ShopServiceSchedule, bookingId: string, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  const booking = state.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking) throw new Error('Booking not found.')
  if (booking.status === 'completed' || booking.status === 'cancelled') throw new Error('This booking cannot be cancelled.')
  const next = appendEvent({
    ...state,
    bookings: state.bookings.map((candidate) => candidate.id === bookingId ? { ...candidate, status: 'cancelled' as const, updatedAt: evidence.happenedAt } : candidate),
  }, { type: 'booking_cancelled', subjectId: bookingId, ...evidence })
  return validateShopServiceSchedule(next)
}

export function projectShopServiceSchedule(state: ShopServiceSchedule, now = new Date()) : ShopServiceScheduleProjection {
  validateShopServiceSchedule(state)
  const localDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayKey = localDay.format(now)
  const activeBookings = state.bookings.filter((booking) => booking.status !== 'cancelled')
  const today = activeBookings.filter((booking) => localDay.format(new Date(booking.startsAt)) === todayKey).sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  const upcoming = activeBookings.filter((booking) => Date.parse(booking.endsAt) >= now.getTime()).sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  const serviceById = new Map(state.services.map((service) => [service.id, service]))
  return {
    activeServices: state.services.filter((service) => service.active).length,
    activeResources: state.resources.filter((resource) => resource.active).length,
    today,
    upcoming,
    awaitingArrival: today.filter((booking) => booking.status === 'held' || booking.status === 'confirmed').length,
    inService: today.filter((booking) => booking.status === 'checked_in').length,
    completedToday: today.filter((booking) => booking.status === 'completed').length,
    expectedRevenueMmk: today.filter((booking) => booking.status !== 'cancelled').reduce((total, booking) => total + (serviceById.get(booking.serviceId)?.priceMmk ?? 0), 0),
  }
}

export function readShopServiceSchedule(value: string | null) {
  if (!value) return createShopServiceSchedule()
  try {
    return validateShopServiceSchedule(JSON.parse(value) as ShopServiceSchedule)
  } catch {
    throw new Error('Saved appointments are unreadable. Export or clear the local evidence before continuing.')
  }
}
