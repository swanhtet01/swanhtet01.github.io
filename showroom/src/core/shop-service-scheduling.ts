export const SHOP_SERVICE_SCHEDULE_SCHEMA = 'supermega.shop.service_schedule.v2' as const
export const SHOP_SERVICE_SCHEDULE_STORAGE_KEY = 'supermega.shop.service-schedule.v1'
const LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA = 'supermega.shop.service_schedule.v1' as const

export type ShopIndustryPackId = 'retail' | 'cafe' | 'restaurant' | 'spa' | 'gym' | 'school'

export type ShopIndustryPack = {
  id: ShopIndustryPackId
  name: string
  description: string
  firstWorkflow: string
  workflowTemplateId: 'social-commerce' | 'retail-wholesale' | 'restaurant-ordering'
  entryPoint: 'Walk-in' | 'Phone'
  capabilities: readonly string[]
  services: readonly Omit<ShopService, 'active'>[]
  resources: readonly Omit<ShopServiceResource, 'active'>[]
}

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
  checkoutOrderId?: string
}

export type ShopServiceScheduleEvent = {
  revision: number
  type: 'service_registered' | 'resource_registered' | 'booking_scheduled' | 'booking_advanced' | 'booking_cancelled' | 'booking_checkout_linked'
  subjectId: string
  actor: string
  reason: string
  happenedAt: string
}

export type ShopServiceSchedule = {
  schema: typeof SHOP_SERVICE_SCHEDULE_SCHEMA
  industryPackId: ShopIndustryPackId
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

export type ShopServiceCheckoutRequest = {
  bookingId: string
  sourceRecordId: string
  customerName: string
  contact: string
  serviceId: string
  serviceSku: string
  serviceName: string
  servicePriceMmk: number
  completedAt: string
}

const bookingTransitions: Record<Exclude<ShopServiceBookingStatus, 'completed' | 'cancelled'>, ShopServiceBookingStatus> = {
  held: 'confirmed',
  confirmed: 'checked_in',
  checked_in: 'completed',
}

export const shopIndustryPacks: readonly ShopIndustryPack[] = [
  {
    id: 'retail',
    name: 'Retail',
    description: 'Counter sales, pickup windows, stock, purchasing, and returns.',
    firstWorkflow: 'Complete a counter sale and schedule a reviewed pickup.',
    workflowTemplateId: 'retail-wholesale',
    entryPoint: 'Walk-in',
    capabilities: ['Sell', 'Orders', 'Stock', 'Purchasing', 'Returns', 'Pickup schedule'],
    services: [
      { id: 'service-personal-shopping', name: 'Personal shopping', durationMinutes: 30, priceMmk: 15_000 },
      { id: 'service-pickup-window', name: 'Pickup window', durationMinutes: 15, priceMmk: 5_000 },
    ],
    resources: [
      { id: 'resource-sales-1', name: 'Sales staff 1', kind: 'staff' },
      { id: 'resource-pickup-1', name: 'Pickup desk 1', kind: 'room' },
    ],
  },
  {
    id: 'cafe',
    name: 'Cafe',
    description: 'Counter orders, collection slots, stock, and daily close.',
    firstWorkflow: 'Take a counter order and schedule a large-order collection.',
    workflowTemplateId: 'restaurant-ordering',
    entryPoint: 'Walk-in',
    capabilities: ['Sell', 'Orders', 'Stock', 'Daily close', 'Collection schedule'],
    services: [
      { id: 'service-catering-consultation', name: 'Catering consultation', durationMinutes: 30, priceMmk: 20_000 },
      { id: 'service-preorder-collection', name: 'Preorder collection', durationMinutes: 15, priceMmk: 5_000 },
    ],
    resources: [
      { id: 'resource-counter-1', name: 'Counter staff 1', kind: 'staff' },
      { id: 'resource-collection-1', name: 'Collection point 1', kind: 'room' },
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    description: 'Orders, table reservations, deposits, stock, and payment review.',
    firstWorkflow: 'Record an order and hold one accountable table reservation.',
    workflowTemplateId: 'restaurant-ordering',
    entryPoint: 'Walk-in',
    capabilities: ['Sell', 'Orders', 'Stock', 'Payments', 'Reservations'],
    services: [
      { id: 'service-table-reservation', name: 'Table reservation deposit', durationMinutes: 90, priceMmk: 10_000 },
      { id: 'service-event-consultation', name: 'Private event consultation', durationMinutes: 45, priceMmk: 25_000 },
    ],
    resources: [
      { id: 'resource-host-1', name: 'Host 1', kind: 'staff' },
      { id: 'resource-table-zone-1', name: 'Table zone 1', kind: 'room' },
    ],
  },
  {
    id: 'spa',
    name: 'Spa',
    description: 'Appointments, therapist stations, treatment checkout, aftercare stock, and daily close.',
    firstWorkflow: 'Hold, confirm, check in, complete, and check out one treatment appointment.',
    workflowTemplateId: 'social-commerce',
    entryPoint: 'Phone',
    capabilities: ['Appointments', 'Therapist stations', 'Sell', 'Orders', 'Stock', 'Payments', 'Daily close'],
    services: [
      { id: 'service-consultation', name: 'Treatment consultation', durationMinutes: 20, priceMmk: 15_000 },
      { id: 'service-myanmar-massage', name: 'Traditional Myanmar massage', durationMinutes: 60, priceMmk: 45_000 },
      { id: 'service-aromatherapy', name: 'Aromatherapy massage', durationMinutes: 90, priceMmk: 70_000 },
      { id: 'service-signature-facial', name: 'Signature facial', durationMinutes: 60, priceMmk: 55_000 },
      { id: 'service-body-scrub', name: 'Botanical body scrub', durationMinutes: 45, priceMmk: 40_000 },
    ],
    resources: [
      { id: 'resource-station-1', name: 'Therapist May · Treatment room 1', kind: 'staff' },
      { id: 'resource-station-2', name: 'Therapist Thiri · Treatment room 2', kind: 'staff' },
      { id: 'resource-station-3', name: 'Facial specialist · Facial room', kind: 'staff' },
    ],
  },
  {
    id: 'gym',
    name: 'Gym',
    description: 'Service sales, consultations, training sessions, staff, and studios.',
    firstWorkflow: 'Schedule and complete one personal-training session.',
    workflowTemplateId: 'social-commerce',
    entryPoint: 'Phone',
    capabilities: ['Sell', 'Orders', 'Stock', 'Payments', 'Training schedule', 'Staff resources'],
    services: [
      { id: 'service-fitness-consultation', name: 'Fitness consultation', durationMinutes: 30, priceMmk: 15_000 },
      { id: 'service-personal-training', name: 'Personal training', durationMinutes: 60, priceMmk: 30_000 },
    ],
    resources: [
      { id: 'resource-trainer-1', name: 'Trainer 1', kind: 'staff' },
      { id: 'resource-studio-1', name: 'Studio 1', kind: 'room' },
    ],
  },
  {
    id: 'school',
    name: 'School',
    description: 'Enrollment consultations, class sessions, teachers, rooms, and fee sales.',
    firstWorkflow: 'Schedule one enrollment consultation or class session.',
    workflowTemplateId: 'social-commerce',
    entryPoint: 'Phone',
    capabilities: ['Sell', 'Orders', 'Stock', 'Payments', 'Class schedule', 'Teacher resources'],
    services: [
      { id: 'service-enrollment-consultation', name: 'Enrollment consultation', durationMinutes: 30, priceMmk: 10_000 },
      { id: 'service-class-session', name: 'Class session', durationMinutes: 60, priceMmk: 20_000 },
    ],
    resources: [
      { id: 'resource-teacher-1', name: 'Teacher 1', kind: 'staff' },
      { id: 'resource-classroom-1', name: 'Classroom 1', kind: 'room' },
    ],
  },
] as const

export function shopIndustryPack(id: ShopIndustryPackId) {
  const pack = shopIndustryPacks.find((candidate) => candidate.id === id)
  if (!pack) throw new Error('Choose a supported Shop industry pack.')
  return pack
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

export function shopServiceCommerceSku(serviceId: string) {
  const normalized = boundedText(serviceId, 'Service ID', 64).toUpperCase()
  if (!/^[A-Z0-9-]+$/.test(normalized)) throw new Error('Service ID cannot become a Shop checkout reference.')
  return `SPA-SVC-${normalized}`
}

export function shopServiceCheckoutSourceId(bookingId: string) {
  const normalized = boundedText(bookingId, 'Booking ID', 80).toUpperCase()
  if (!/^BOOKING-\d{4,10}$/.test(normalized)) throw new Error('Booking ID cannot become a Shop checkout reference.')
  return `SPA-${normalized}`
}

function proofRecord(proof: ShopServiceScheduleProof) {
  return {
    actor: boundedText(proof.actor, 'Actor', 120),
    reason: boundedText(proof.reason, 'Reason', 240),
    happenedAt: new Date(validIso(proof.happenedAt, 'Evidence time')).toISOString(),
  }
}

export function createShopServiceSchedule(industryPackId: ShopIndustryPackId = 'spa'): ShopServiceSchedule {
  const pack = shopIndustryPack(industryPackId)
  return {
    schema: SHOP_SERVICE_SCHEDULE_SCHEMA,
    industryPackId: pack.id,
    revision: 0,
    services: pack.services.map((service) => ({ ...service, active: true })),
    resources: pack.resources.map((resource) => ({ ...resource, active: true })),
    bookings: [],
    events: [],
  }
}

export function validateShopServiceSchedule(state: ShopServiceSchedule) {
  if (!state || state.schema !== SHOP_SERVICE_SCHEDULE_SCHEMA) throw new Error('Unsupported Shop service schedule.')
  shopIndustryPack(state.industryPackId)
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
    if (booking.checkoutOrderId !== undefined) {
      const checkoutOrderId = boundedText(booking.checkoutOrderId, 'Checkout order ID', 120)
      if (booking.status !== 'completed' || checkoutOrderId !== `ORD-${shopServiceCheckoutSourceId(id)}`) {
        throw new Error(`Booking ${id} has an invalid checkout link.`)
      }
    }
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
    if (!['service_registered', 'resource_registered', 'booking_scheduled', 'booking_advanced', 'booking_cancelled', 'booking_checkout_linked'].includes(event.type)) throw new Error('Shop service schedule evidence type is invalid.')
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

export function shopServiceCheckoutRequest(state: ShopServiceSchedule, bookingId: string): ShopServiceCheckoutRequest | null {
  validateShopServiceSchedule(state)
  const booking = state.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking || booking.status !== 'completed' || booking.checkoutOrderId) return null
  const service = state.services.find((candidate) => candidate.id === booking.serviceId)
  if (!service) return null
  return {
    bookingId: booking.id,
    sourceRecordId: shopServiceCheckoutSourceId(booking.id),
    customerName: booking.customerName,
    contact: booking.contact,
    serviceId: service.id,
    serviceSku: shopServiceCommerceSku(service.id),
    serviceName: service.name,
    servicePriceMmk: service.priceMmk,
    completedAt: booking.updatedAt,
  }
}

export function linkShopServiceBookingCheckout(
  state: ShopServiceSchedule,
  bookingId: string,
  orderId: string,
  proof: ShopServiceScheduleProof,
) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  const booking = state.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking) throw new Error('Booking not found.')
  if (booking.status !== 'completed') throw new Error('Complete the appointment before checkout.')
  const expectedOrderId = `ORD-${shopServiceCheckoutSourceId(booking.id)}`
  if (orderId !== expectedOrderId) throw new Error('Checkout order does not match this appointment.')
  if (booking.checkoutOrderId) {
    if (booking.checkoutOrderId !== orderId) throw new Error('This appointment is already linked to another checkout.')
    return state
  }
  const next = appendEvent({
    ...state,
    bookings: state.bookings.map((candidate) => candidate.id === bookingId
      ? { ...candidate, checkoutOrderId: orderId, updatedAt: evidence.happenedAt }
      : candidate),
  }, { type: 'booking_checkout_linked', subjectId: bookingId, ...evidence })
  return validateShopServiceSchedule(next)
}

export function projectShopServiceSchedule(state: ShopServiceSchedule, now = new Date()) : ShopServiceScheduleProjection {
  validateShopServiceSchedule(state)
  const localDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayKey = localDay.format(now)
  const activeBookings = state.bookings.filter((booking) => booking.status !== 'cancelled')
  const today = activeBookings.filter((booking) => localDay.format(new Date(booking.startsAt)) === todayKey).sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  const upcoming = activeBookings.filter((booking) => Date.parse(booking.endsAt) >= now.getTime()
    || (booking.status === 'completed'
      && (!booking.checkoutOrderId || localDay.format(new Date(booking.startsAt)) === todayKey))).sort((left, right) => left.startsAt.localeCompare(right.startsAt))
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
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.schema === LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA && !parsed.industryPackId) {
      return validateShopServiceSchedule({ ...parsed, schema: SHOP_SERVICE_SCHEDULE_SCHEMA, industryPackId: 'spa' } as ShopServiceSchedule)
    }
    return validateShopServiceSchedule(parsed as unknown as ShopServiceSchedule)
  } catch {
    throw new Error('Saved appointments are unreadable. Export or clear the local evidence before continuing.')
  }
}

export function provisionEmptyShopServiceSchedule(state: ShopServiceSchedule, industryPackId: ShopIndustryPackId) {
  validateShopServiceSchedule(state)
  if (state.bookings.length || state.events.length || state.revision !== 0) {
    throw new Error('Existing appointment evidence was preserved. Reset that local demo before replacing its industry pack.')
  }
  return createShopServiceSchedule(industryPackId)
}
