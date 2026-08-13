export const SHOP_SERVICE_SCHEDULE_SCHEMA = 'supermega.shop.service_schedule.v4' as const
export const SHOP_SERVICE_SCHEDULE_STORAGE_KEY = 'supermega.shop.service-schedule.v1'
export const SHOP_SERVICE_FIRST_DAY_REVIEW_SCHEMA = 'supermega.shop.service-first-day-review.v1' as const
const LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V1 = 'supermega.shop.service_schedule.v1' as const
const LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V2 = 'supermega.shop.service_schedule.v2' as const
const LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V3 = 'supermega.shop.service_schedule.v3' as const

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
export type ShopServiceAppointmentUpdates = 'allowed' | 'declined' | 'not_recorded'

export type ShopServiceClient = {
  id: string
  name: string
  contact: string
  appointmentUpdates: ShopServiceAppointmentUpdates
  consentRecordedAt?: string
  createdAt: string
  updatedAt: string
  anonymizedAt?: string
  anonymizedBy?: string
}

export type ShopServicePrivacyPolicy = {
  clientRetentionDays: number | null
  updatedAt?: string
  updatedBy?: string
}

export type ShopServiceBooking = {
  id: string
  clientId: string
  customerName: string
  contact: string
  appointmentUpdates: ShopServiceAppointmentUpdates
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
  type: 'service_registered' | 'resource_registered' | 'booking_scheduled' | 'booking_advanced' | 'booking_cancelled' | 'booking_checkout_linked' | 'client_retention_set' | 'client_exported' | 'client_anonymized'
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
  privacyPolicy: ShopServicePrivacyPolicy
  clients: ShopServiceClient[]
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
  clients: number
  today: ShopServiceBooking[]
  upcoming: ShopServiceBooking[]
  awaitingArrival: number
  inService: number
  completedToday: number
  expectedRevenueMmk: number
}

export type ShopServiceFirstDayAccess = 'local-operator' | 'owner' | 'operator' | 'spa-front-desk' | 'spa-therapist' | 'viewer'
export type ShopServiceFirstDayStage = 'setup_service' | 'setup_staff' | 'hold_appointment' | 'confirm_appointment' | 'check_in' | 'complete_treatment' | 'review_checkout' | 'reconcile_payment' | 'review_daily_close'
export type ShopServiceFirstDayRequiredAccess = 'owner' | 'front_desk' | 'therapist'

export type ShopServiceFirstDayAction = {
  stage: ShopServiceFirstDayStage
  label: string
  requiredAccess: ShopServiceFirstDayRequiredAccess
  allowedForCurrentAccess: boolean
  bookingId?: string
  startsAt?: string
}

export type ShopServiceFirstDayReview = {
  contract: typeof SHOP_SERVICE_FIRST_DAY_REVIEW_SCHEMA
  windowStartAt: string
  windowEndAt: string
  access: ShopServiceFirstDayAccess
  status: 'setup_required' | 'ready_to_book' | 'work_to_do' | 'owner_close_review'
  setup: {
    activeServices: number
    activeStaffResources: number
    retentionRecorded: boolean
  }
  counts: {
    appointments: number
    awaitingConfirmation: number
    awaitingArrival: number
    inTreatment: number
    awaitingCheckout: number
    awaitingPaymentClose: number
    completed: number
  }
  ownerAttention: Array<{
    id: 'activate_service' | 'activate_staff' | 'set_client_retention'
    label: string
  }>
  queue: ShopServiceFirstDayAction[]
  nextAction: ShopServiceFirstDayAction
  authority: {
    invitationSent: false
    customerMessageSent: false
    calendarWritten: false
    paymentReconciled: false
    dailyCloseRecorded: false
    membershipWritten: false
  }
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
    privacyPolicy: { clientRetentionDays: null },
    clients: [],
    bookings: [],
    events: [],
  }
}

function normalizedContact(value: string) {
  const contact = boundedText(value, 'Customer contact')
  if (contact.includes('@')) return `email:${contact.toLocaleLowerCase()}`
  const digits = contact.replace(/\D/g, '')
  if (digits.length >= 7) return `phone:${digits.startsWith('09') ? `95${digits.slice(1)}` : digits}`
  return `reference:${contact.toLocaleLowerCase().replace(/\s+/g, ' ')}`
}

function normalizedName(value: string) {
  return boundedText(value, 'Customer name').toLocaleLowerCase().replace(/\s+/g, ' ')
}

function evidenceContainsIdentifier(events: readonly ShopServiceScheduleEvent[], identifier: string) {
  const normalized = identifier.trim().toLocaleLowerCase()
  if (!normalized) return false
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u')
    .test(JSON.stringify(events).toLocaleLowerCase())
}

export function validateShopServiceSchedule(state: ShopServiceSchedule) {
  if (!state || state.schema !== SHOP_SERVICE_SCHEDULE_SCHEMA) throw new Error('Unsupported Shop service schedule.')
  shopIndustryPack(state.industryPackId)
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('Invalid Shop service schedule revision.')
  if (!Array.isArray(state.services) || !Array.isArray(state.resources) || !Array.isArray(state.clients) || !Array.isArray(state.bookings) || !Array.isArray(state.events)) throw new Error('Incomplete Shop service schedule.')
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
  const privacyPolicy = state.privacyPolicy
  if (!privacyPolicy || typeof privacyPolicy !== 'object' || Array.isArray(privacyPolicy)) throw new Error('Client retention policy is missing.')
  if (privacyPolicy.clientRetentionDays === null) {
    if (!hasExactScheduleFields(privacyPolicy as unknown as Record<string, unknown>, ['clientRetentionDays'])) throw new Error('Unset client retention policy fields are invalid.')
    if (privacyPolicy.updatedAt !== undefined || privacyPolicy.updatedBy !== undefined) throw new Error('An unset client retention policy cannot claim approval evidence.')
  } else {
    if (!hasExactScheduleFields(privacyPolicy as unknown as Record<string, unknown>, ['clientRetentionDays', 'updatedAt', 'updatedBy'])) throw new Error('Client retention policy fields are invalid.')
    positiveWholeNumber(privacyPolicy.clientRetentionDays, 'Client retention days', 3650)
    if (privacyPolicy.clientRetentionDays < 30) throw new Error('Client retention must be at least 30 days.')
    if (privacyPolicy.updatedAt === undefined || privacyPolicy.updatedBy === undefined) throw new Error('Client retention approval evidence is incomplete.')
    validIso(privacyPolicy.updatedAt, 'Client retention update time')
    boundedText(privacyPolicy.updatedBy, 'Client retention approver', 120)
  }
  const clientIds = new Set<string>()
  const clientContacts = new Set<string>()
  for (const client of state.clients) {
    const id = boundedText(client.id, 'Client ID', 80)
    if (clientIds.has(id) || !/^client-(?:legacy-)?\d{4,10}$/.test(id)) throw new Error(`Duplicate or invalid client ${id}.`)
    clientIds.add(id)
    boundedText(client.name, 'Client name')
    const contact = normalizedContact(client.contact)
    if (clientContacts.has(contact)) throw new Error('A customer contact can belong to only one client record.')
    clientContacts.add(contact)
    if (!['allowed', 'declined', 'not_recorded'].includes(client.appointmentUpdates)) throw new Error(`Client ${id} has an invalid appointment-update choice.`)
    const createdAt = validIso(client.createdAt, 'Client creation time')
    const updatedAt = validIso(client.updatedAt, 'Client update time')
    if (updatedAt < createdAt) throw new Error(`Client ${id} update time is invalid.`)
    if (client.appointmentUpdates === 'not_recorded') {
      if (client.consentRecordedAt !== undefined) throw new Error(`Client ${id} cannot claim consent evidence.`)
    } else if (client.consentRecordedAt === undefined || validIso(client.consentRecordedAt, 'Client consent time') > updatedAt) {
      throw new Error(`Client ${id} consent evidence is invalid.`)
    }
    const hasAnonymizedAt = client.anonymizedAt !== undefined
    const hasAnonymizedBy = client.anonymizedBy !== undefined
    if (hasAnonymizedAt !== hasAnonymizedBy) throw new Error(`Client ${id} anonymization evidence is incomplete.`)
    if (hasAnonymizedAt) {
      if (client.name !== `Former client ${id}`
        || client.contact !== `anonymized:${id}`
        || client.appointmentUpdates !== 'not_recorded'
        || client.anonymizedAt !== client.updatedAt) throw new Error(`Client ${id} anonymization is invalid.`)
      validIso(client.anonymizedAt as string, 'Client anonymization time')
      boundedText(client.anonymizedBy as string, 'Client anonymization actor', 120)
    }
  }
  const clientById = new Map(state.clients.map((client) => [client.id, client]))
  const bookingIds = new Set<string>()
  for (const booking of state.bookings) {
    const id = boundedText(booking.id, 'Booking ID', 80)
    if (bookingIds.has(id)) throw new Error(`Duplicate booking ${id}.`)
    bookingIds.add(id)
    const client = clientById.get(boundedText(booking.clientId, 'Booking client ID', 80))
    if (!client
      || normalizedContact(client.contact) !== normalizedContact(booking.contact)
      || normalizedName(client.name) !== normalizedName(booking.customerName)) throw new Error(`Booking ${id} does not match its client record.`)
    boundedText(booking.customerName, 'Customer name')
    boundedText(booking.contact, 'Customer contact')
    if (!['allowed', 'declined', 'not_recorded'].includes(booking.appointmentUpdates)) throw new Error(`Booking ${id} has an invalid appointment-update choice.`)
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
    if (!['service_registered', 'resource_registered', 'booking_scheduled', 'booking_advanced', 'booking_cancelled', 'booking_checkout_linked', 'client_retention_set', 'client_exported', 'client_anonymized'].includes(event.type)) throw new Error('Shop service schedule evidence type is invalid.')
    boundedText(event.subjectId, 'Evidence subject', 80)
    boundedText(event.actor, 'Evidence actor', 120)
    boundedText(event.reason, 'Evidence reason', 240)
    validIso(event.happenedAt, 'Evidence time')
    if (event.type === 'client_anonymized' && !clientIds.has(event.subjectId)) throw new Error('Client anonymization evidence references an unknown client.')
    if (event.type === 'client_exported' && !/^sha256:[a-f0-9]{64}$/.test(event.subjectId)) throw new Error('Client export evidence digest is invalid.')
    if (event.type === 'client_retention_set' && !/^retention-(?:[3-9]\d|[1-9]\d{2,3})-days$/.test(event.subjectId)) throw new Error('Client retention evidence is invalid.')
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
  appointmentUpdates: Exclude<ShopServiceAppointmentUpdates, 'not_recorded'>
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
  const customerName = boundedText(input.customerName, 'Customer name')
  const contact = boundedText(input.contact, 'Customer contact')
  if (!['allowed', 'declined'].includes(input.appointmentUpdates)) throw new Error('Record whether appointment updates are allowed.')
  const contactKey = normalizedContact(contact)
  const existingClient = state.clients.find((client) => normalizedContact(client.contact) === contactKey)
  if (existingClient?.anonymizedAt) throw new Error('Start a new client record with the customer\'s current contact.')
  if (existingClient && normalizedName(existingClient.name) !== normalizedName(customerName)) {
    throw new Error(`This contact already belongs to ${existingClient.name}. Review the client before booking.`)
  }
  const client: ShopServiceClient = existingClient
    ? {
        ...existingClient,
        appointmentUpdates: input.appointmentUpdates,
        consentRecordedAt: evidence.happenedAt,
        updatedAt: evidence.happenedAt,
      }
    : {
        id: identifier('client', revision),
        name: customerName,
        contact,
        appointmentUpdates: input.appointmentUpdates,
        consentRecordedAt: evidence.happenedAt,
        createdAt: evidence.happenedAt,
        updatedAt: evidence.happenedAt,
      }
  const booking: ShopServiceBooking = {
    id: identifier('booking', revision),
    clientId: client.id,
    customerName: client.name,
    contact: client.contact,
    appointmentUpdates: input.appointmentUpdates,
    serviceId: service.id,
    resourceId: resource.id,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    status: 'held',
    note: (input.note ?? '').trim().slice(0, 300),
    createdAt: evidence.happenedAt,
    updatedAt: evidence.happenedAt,
  }
  const clients = existingClient
    ? state.clients.map((candidate) => candidate.id === existingClient.id ? client : candidate)
    : [...state.clients, client]
  const next = appendEvent({ ...state, clients, bookings: [...state.bookings, booking] }, { type: 'booking_scheduled', subjectId: booking.id, ...evidence })
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
    clients: state.clients.length,
    today,
    upcoming,
    awaitingArrival: today.filter((booking) => booking.status === 'held' || booking.status === 'confirmed').length,
    inService: today.filter((booking) => booking.status === 'checked_in').length,
    completedToday: today.filter((booking) => booking.status === 'completed').length,
    expectedRevenueMmk: today.filter((booking) => booking.status !== 'cancelled').reduce((total, booking) => total + (serviceById.get(booking.serviceId)?.priceMmk ?? 0), 0),
  }
}

const firstDayStagePriority: Record<ShopServiceFirstDayStage, number> = {
  setup_service: 0,
  setup_staff: 1,
  complete_treatment: 2,
  review_checkout: 3,
  reconcile_payment: 4,
  check_in: 5,
  confirm_appointment: 6,
  hold_appointment: 7,
  review_daily_close: 8,
}

const firstDayActionLabels: Record<ShopServiceFirstDayStage, string> = {
  setup_service: 'Add one active service',
  setup_staff: 'Add one active staff member',
  hold_appointment: 'Hold the first appointment',
  confirm_appointment: 'Confirm the held appointment',
  check_in: 'Check in the confirmed appointment',
  complete_treatment: 'Complete the checked-in treatment',
  review_checkout: 'Review the treatment checkout',
  reconcile_payment: 'Reconcile payment and close the checkout',
  review_daily_close: 'Review the daily close',
}

function firstDayRequiredAccess(stage: ShopServiceFirstDayStage): ShopServiceFirstDayRequiredAccess {
  if (stage === 'complete_treatment') return 'therapist'
  if (['hold_appointment', 'confirm_appointment', 'check_in', 'review_checkout', 'reconcile_payment'].includes(stage)) return 'front_desk'
  return 'owner'
}

function firstDayAccessAllowed(access: ShopServiceFirstDayAccess, requiredAccess: ShopServiceFirstDayRequiredAccess) {
  if (access === 'local-operator' || access === 'owner' || access === 'operator') return true
  if (requiredAccess === 'front_desk') return access === 'spa-front-desk'
  if (requiredAccess === 'therapist') return access === 'spa-therapist'
  return false
}

function firstDayAction(
  stage: ShopServiceFirstDayStage,
  access: ShopServiceFirstDayAccess,
  booking?: Pick<ShopServiceBooking, 'id' | 'startsAt'>,
): ShopServiceFirstDayAction {
  const requiredAccess = firstDayRequiredAccess(stage)
  return {
    stage,
    label: firstDayActionLabels[stage],
    requiredAccess,
    allowedForCurrentAccess: firstDayAccessAllowed(access, requiredAccess),
    ...(booking ? { bookingId: booking.id, startsAt: booking.startsAt } : {}),
  }
}

export function projectShopServiceFirstDayReview(
  state: ShopServiceSchedule,
  windowStartAt: string,
  windowEndAt: string,
  access: ShopServiceFirstDayAccess,
  closedCheckoutOrderIds: readonly string[],
): ShopServiceFirstDayReview {
  validateShopServiceSchedule(state)
  const start = validIso(windowStartAt, 'First-day window start')
  const end = validIso(windowEndAt, 'First-day window end')
  if (end <= start || end - start > 86_400_000) throw new Error('First-day window must end after its start and span no more than 24 hours.')
  if (!['local-operator', 'owner', 'operator', 'spa-front-desk', 'spa-therapist', 'viewer'].includes(access)) throw new Error('First-day access is unsupported.')
  if (!Array.isArray(closedCheckoutOrderIds) || closedCheckoutOrderIds.length > 500) throw new Error('Closed checkout order IDs must be a bounded array.')
  const closedIds = closedCheckoutOrderIds.map((orderId) => boundedText(orderId, 'Closed checkout order ID', 120))
  if (new Set(closedIds).size !== closedIds.length) throw new Error('Closed checkout order IDs must be unique.')
  const closedCheckoutIds = new Set(closedIds)
  const activeServices = state.services.filter((service) => service.active).length
  const activeStaffResources = state.resources.filter((resource) => resource.active && resource.kind === 'staff').length
  const appointments = state.bookings.filter((booking) => booking.status !== 'cancelled'
    && Date.parse(booking.startsAt) >= start
    && Date.parse(booking.startsAt) < end)
  const queue = appointments.flatMap((booking): ShopServiceFirstDayAction[] => {
    const stage: ShopServiceFirstDayStage | null = booking.status === 'held'
      ? 'confirm_appointment'
      : booking.status === 'confirmed'
        ? 'check_in'
        : booking.status === 'checked_in'
          ? 'complete_treatment'
          : !booking.checkoutOrderId
            ? 'review_checkout'
            : !closedCheckoutIds.has(booking.checkoutOrderId)
              ? 'reconcile_payment'
              : null
    return stage ? [firstDayAction(stage, access, booking)] : []
  }).sort((left, right) => firstDayStagePriority[left.stage] - firstDayStagePriority[right.stage]
    || (String(left.startsAt) < String(right.startsAt) ? -1 : String(left.startsAt) > String(right.startsAt) ? 1 : 0)
    || (String(left.bookingId) < String(right.bookingId) ? -1 : String(left.bookingId) > String(right.bookingId) ? 1 : 0))
  const ownerAttention: ShopServiceFirstDayReview['ownerAttention'] = [
    ...(activeServices ? [] : [{ id: 'activate_service' as const, label: 'Activate at least one service in Services and resources.' }]),
    ...(activeStaffResources ? [] : [{ id: 'activate_staff' as const, label: 'Activate at least one staff resource in Services and resources.' }]),
    ...(state.privacyPolicy.clientRetentionDays === null ? [{ id: 'set_client_retention' as const, label: 'Choose the client retention period in Clients and privacy.' }] : []),
  ]
  const setupStage: ShopServiceFirstDayStage | null = !activeServices ? 'setup_service' : !activeStaffResources ? 'setup_staff' : null
  const status: ShopServiceFirstDayReview['status'] = setupStage
    ? 'setup_required'
    : queue.length
      ? 'work_to_do'
      : appointments.length
        ? 'owner_close_review'
        : 'ready_to_book'
  const nextAction = setupStage
    ? firstDayAction(setupStage, access)
    : queue[0] ?? firstDayAction(appointments.length ? 'review_daily_close' : 'hold_appointment', access)
  return {
    contract: SHOP_SERVICE_FIRST_DAY_REVIEW_SCHEMA,
    windowStartAt,
    windowEndAt,
    access,
    status,
    setup: {
      activeServices,
      activeStaffResources,
      retentionRecorded: state.privacyPolicy.clientRetentionDays !== null,
    },
    counts: {
      appointments: appointments.length,
      awaitingConfirmation: appointments.filter((booking) => booking.status === 'held').length,
      awaitingArrival: appointments.filter((booking) => booking.status === 'confirmed').length,
      inTreatment: appointments.filter((booking) => booking.status === 'checked_in').length,
      awaitingCheckout: appointments.filter((booking) => booking.status === 'completed' && !booking.checkoutOrderId).length,
      awaitingPaymentClose: appointments.filter((booking) => booking.status === 'completed' && Boolean(booking.checkoutOrderId) && !closedCheckoutIds.has(booking.checkoutOrderId as string)).length,
      completed: appointments.filter((booking) => booking.status === 'completed' && Boolean(booking.checkoutOrderId) && closedCheckoutIds.has(booking.checkoutOrderId as string)).length,
    },
    ownerAttention,
    queue,
    nextAction,
    authority: {
      invitationSent: false,
      customerMessageSent: false,
      calendarWritten: false,
      paymentReconciled: false,
      dailyCloseRecorded: false,
      membershipWritten: false,
    },
  }
}

export function setShopServiceClientRetention(
  state: ShopServiceSchedule,
  clientRetentionDays: number,
  proof: ShopServiceScheduleProof,
) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  positiveWholeNumber(clientRetentionDays, 'Client retention days', 3650)
  if (clientRetentionDays < 30) throw new Error('Client retention must be at least 30 days.')
  if (state.privacyPolicy.clientRetentionDays === clientRetentionDays) throw new Error('Choose a different client retention period.')
  const next = appendEvent({
    ...state,
    privacyPolicy: {
      clientRetentionDays,
      updatedAt: evidence.happenedAt,
      updatedBy: evidence.actor,
    },
  }, {
    type: 'client_retention_set',
    subjectId: `retention-${clientRetentionDays}-days`,
    ...evidence,
  })
  return validateShopServiceSchedule(next)
}

export function shopServiceClientExportRows(state: ShopServiceSchedule) {
  validateShopServiceSchedule(state)
  return state.clients.filter((client) => !client.anonymizedAt).map((client) => ({
    name: client.name,
    contact: client.contact,
    appointmentUpdates: client.appointmentUpdates,
    consentRecordedAt: client.consentRecordedAt ?? '',
    appointments: state.bookings.filter((booking) => booking.clientId === client.id && booking.status !== 'cancelled').length,
    completedVisits: state.bookings.filter((booking) => booking.clientId === client.id && booking.status === 'completed').length,
  }))
}

function csvCell(value: string | number) {
  const text = String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function shopServiceClientCsv(state: ShopServiceSchedule) {
  const rows = shopServiceClientExportRows(state)
  return [
    ['Name', 'Contact', 'Appointment updates', 'Consent recorded', 'Appointments', 'Completed visits'],
    ...rows.map((row) => [row.name, row.contact, row.appointmentUpdates, row.consentRecordedAt, row.appointments, row.completedVisits]),
  ].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function recordShopServiceClientExport(
  state: ShopServiceSchedule,
  digest: string,
  proof: ShopServiceScheduleProof,
) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('Client export digest is invalid.')
  const count = shopServiceClientExportRows(state).length
  const next = appendEvent(state, {
    type: 'client_exported',
    subjectId: digest,
    ...evidence,
    reason: `Exported ${count} privacy-minimal client ${count === 1 ? 'record' : 'records'}.`,
  })
  return validateShopServiceSchedule(next)
}

export type ShopServiceClientAnonymizationReadiness = {
  allowed: boolean
  reason: string
  dueAt: string | null
}

export function shopServiceClientAnonymizationReadiness(
  state: ShopServiceSchedule,
  clientId: string,
  closedCheckoutOrderIds: readonly string[],
  now = new Date(),
): ShopServiceClientAnonymizationReadiness {
  validateShopServiceSchedule(state)
  const client = state.clients.find((candidate) => candidate.id === clientId)
  if (!client) return { allowed: false, reason: 'Client record not found.', dueAt: null }
  if (client.anonymizedAt) return { allowed: false, reason: 'This client is already anonymized.', dueAt: client.anonymizedAt }
  const retentionDays = state.privacyPolicy.clientRetentionDays
  if (retentionDays === null) return { allowed: false, reason: 'Set the owner-approved retention period first.', dueAt: null }
  const bookings = state.bookings.filter((booking) => booking.clientId === clientId)
  if (bookings.some((booking) => ['held', 'confirmed', 'checked_in'].includes(booking.status))) {
    return { allowed: false, reason: 'Close or cancel every open visit first.', dueAt: null }
  }
  const closedOrders = new Set(closedCheckoutOrderIds)
  if (bookings.some((booking) => booking.status === 'completed' && (!booking.checkoutOrderId || !closedOrders.has(booking.checkoutOrderId)))) {
    return { allowed: false, reason: 'Complete payment and close every finished visit first.', dueAt: null }
  }
  if ([client.name, client.contact].some((identifier) => evidenceContainsIdentifier(state.events, identifier))) {
    return { allowed: false, reason: 'Identity remains in immutable appointment evidence; review support before anonymizing.', dueAt: null }
  }
  const lastActivity = Math.max(
    Date.parse(client.updatedAt),
    ...bookings.map((booking) => Date.parse(booking.updatedAt)),
  )
  const dueAt = new Date(lastActivity + retentionDays * 24 * 60 * 60 * 1000).toISOString()
  if (!Number.isFinite(now.getTime()) || now.getTime() < Date.parse(dueAt)) {
    return { allowed: false, reason: `Retention runs until ${new Date(dueAt).toLocaleDateString()}.`, dueAt }
  }
  return { allowed: true, reason: 'Ready for owner review.', dueAt }
}

export function anonymizeShopServiceClient(
  state: ShopServiceSchedule,
  clientId: string,
  closedCheckoutOrderIds: readonly string[],
  proof: ShopServiceScheduleProof,
) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  const readiness = shopServiceClientAnonymizationReadiness(state, clientId, closedCheckoutOrderIds, new Date(evidence.happenedAt))
  if (!readiness.allowed) throw new Error(readiness.reason)
  const anonymousName = `Former client ${clientId}`
  const anonymousContact = `anonymized:${clientId}`
  const clients = state.clients.map((client) => client.id === clientId ? {
    id: client.id,
    name: anonymousName,
    contact: anonymousContact,
    appointmentUpdates: 'not_recorded' as const,
    createdAt: client.createdAt,
    updatedAt: evidence.happenedAt,
    anonymizedAt: evidence.happenedAt,
    anonymizedBy: evidence.actor,
  } : client)
  const bookings = state.bookings.map((booking) => booking.clientId === clientId ? {
    ...booking,
    customerName: anonymousName,
    contact: anonymousContact,
    appointmentUpdates: 'not_recorded' as const,
    note: '',
    updatedAt: evidence.happenedAt,
  } : booking)
  const next = appendEvent({ ...state, clients, bookings }, {
    type: 'client_anonymized',
    subjectId: clientId,
    ...evidence,
  })
  return validateShopServiceSchedule(next)
}

function migrateLegacyShopServiceSchedule(parsed: Record<string, unknown>) {
  let source = parsed.schema === LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V1 && !parsed.industryPackId
    ? { ...parsed, schema: LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V2, industryPackId: 'spa' }
    : parsed
  if (source.schema === LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V2) {
    const clients: ShopServiceClient[] = []
    const clientByContact = new Map<string, ShopServiceClient>()
    const bookings = (Array.isArray(source.bookings) ? source.bookings : []).map((candidate) => {
      const booking = candidate as ShopServiceBooking
      const key = normalizedContact(booking.contact)
      let client = clientByContact.get(key)
      if (!client) {
        client = {
          id: `client-legacy-${String(clients.length + 1).padStart(4, '0')}`,
          name: booking.customerName,
          contact: booking.contact,
          appointmentUpdates: 'not_recorded',
          createdAt: booking.createdAt,
          updatedAt: booking.createdAt,
        }
        clients.push(client)
        clientByContact.set(key, client)
      }
      return { ...booking, clientId: client.id, customerName: client.name, contact: client.contact, appointmentUpdates: 'not_recorded' as const }
    })
    source = { ...source, schema: LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V3, clients, bookings }
  }
  if (source.schema === LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V3) {
    return { ...source, schema: SHOP_SERVICE_SCHEDULE_SCHEMA, privacyPolicy: { clientRetentionDays: null } }
  }
  return source
}

export function readShopServiceSchedule(value: string | null) {
  if (!value) return createShopServiceSchedule()
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return validateShopServiceSchedule(migrateLegacyShopServiceSchedule(parsed) as unknown as ShopServiceSchedule)
  } catch {
    throw new Error('Saved appointments are unreadable. Export or clear the local evidence before continuing.')
  }
}

function isScheduleRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactScheduleFields(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  const allowed = new Set([...required, ...optional])
  return required.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field))
}

export function readRestrictedShopServiceSchedule(value: unknown) {
  const scheduleFields = ['schema', 'industryPackId', 'revision', 'services', 'resources', 'privacyPolicy', 'bookings', 'events'] as const
  const bookingFields = ['id', 'clientId', 'customerName', 'serviceId', 'resourceId', 'startsAt', 'endsAt', 'status', 'note', 'createdAt', 'updatedAt'] as const
  if (!isScheduleRecord(value)
    || !hasExactScheduleFields(value, scheduleFields)
    || value.schema !== SHOP_SERVICE_SCHEDULE_SCHEMA
    || !Array.isArray(value.services)
    || !Array.isArray(value.resources)
    || !Array.isArray(value.bookings)
    || !Array.isArray(value.events)) throw new Error('The restricted appointment view is invalid.')
  const bookings: ShopServiceBooking[] = value.bookings.map((candidate) => {
    if (!isScheduleRecord(candidate)
      || !hasExactScheduleFields(candidate, bookingFields, ['checkoutOrderId'])
      || typeof candidate.clientId !== 'string') throw new Error('The restricted appointment view contains an invalid booking.')
    const clientId = boundedText(candidate.clientId, 'Booking client ID', 80)
    return {
      ...candidate,
      clientId,
      contact: `private:${clientId}`,
      appointmentUpdates: 'not_recorded',
    } as ShopServiceBooking
  })
  const clientsById = new Map<string, ShopServiceClient>()
  for (const booking of bookings) {
    const existing = clientsById.get(booking.clientId)
    const createdAt = existing && existing.createdAt < booking.createdAt ? existing.createdAt : booking.createdAt
    const updatedAt = existing && existing.updatedAt > booking.updatedAt ? existing.updatedAt : booking.updatedAt
    clientsById.set(booking.clientId, {
      id: booking.clientId,
      name: existing?.name ?? booking.customerName,
      contact: booking.contact,
      appointmentUpdates: 'not_recorded',
      createdAt,
      updatedAt,
    })
  }
  return validateShopServiceSchedule({
    ...value,
    services: value.services,
    resources: value.resources,
    clients: [...clientsById.values()],
    bookings,
    events: value.events,
  } as ShopServiceSchedule)
}

export function provisionEmptyShopServiceSchedule(state: ShopServiceSchedule, industryPackId: ShopIndustryPackId) {
  validateShopServiceSchedule(state)
  if (state.bookings.length || state.events.length || state.revision !== 0) {
    throw new Error('Existing appointment evidence was preserved. Reset that local demo before replacing its industry pack.')
  }
  return createShopServiceSchedule(industryPackId)
}
