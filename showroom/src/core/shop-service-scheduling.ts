export const SHOP_SERVICE_SCHEDULE_SCHEMA = 'supermega.shop.service_schedule.v4' as const
export const SHOP_SERVICE_SCHEDULE_STORAGE_KEY = 'supermega.shop.service-schedule.v1'
const LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA = 'supermega.shop.service_schedule.v1' as const
const LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V2 = 'supermega.shop.service_schedule.v2' as const
const LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V3 = 'supermega.shop.service_schedule.v3' as const

export type ShopIndustryPackId = 'retail' | 'cafe' | 'restaurant' | 'spa' | 'gym' | 'school'

// A restaurant books reservations and a school books classes. Calling both an
// "appointment" is the fastest way to make a working schedule read as a generic
// template, so the words belong to the pack rather than to the screen.
export type ShopScheduleVocabulary = {
  plural: string
  singular: string
  holdAction: string
}

export type ShopIndustryPack = {
  id: ShopIndustryPackId
  name: string
  // Burmese display name. Carried alongside `name` rather than widening it to {en, my}:
  // `name` reaches installCommerceWorkingSampleCatalog as a sampleName and is persisted
  // in the commerce workspace, so changing its type would invalidate saved workspaces.
  nameMy: string
  description: string
  firstWorkflow: string
  workflowTemplateId: 'social-commerce' | 'retail-wholesale' | 'restaurant-ordering'
  entryPoint: 'Walk-in' | 'Phone'
  capabilities: readonly string[]
  scheduleVocabulary: ShopScheduleVocabulary
  services: readonly Omit<ShopService, 'active'>[]
  resources: readonly Omit<ShopServiceResource, 'active'>[]
}

// nameMy is optional on both of these because they are PERSISTED under
// SHOP_SERVICE_SCHEDULE_STORAGE_KEY. Schedules saved before this field existed carry no
// Burmese name, and readShopServiceSchedule turns any validation miss into "Saved
// appointments are unreadable" -- so requiring it would lock owners out of their own
// evidence. Pack seeds always supply it; owner-registered services may not.
export type ShopService = {
  id: string
  name: string
  nameMy?: string
  durationMinutes: number
  priceMmk: number
  active: boolean
}

export type ShopServiceResource = {
  id: string
  name: string
  nameMy?: string
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
}

export type ShopServiceScheduleEvent = {
  revision: number
  type: 'service_registered' | 'resource_registered' | 'booking_scheduled' | 'booking_advanced' | 'booking_cancelled' | 'package_redeemed' | 'client_retention_set' | 'client_exported' | 'client_anonymized'
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

const bookingTransitions: Record<Exclude<ShopServiceBookingStatus, 'completed' | 'cancelled'>, ShopServiceBookingStatus> = {
  held: 'confirmed',
  confirmed: 'checked_in',
  checked_in: 'completed',
}

export const shopIndustryPacks: readonly ShopIndustryPack[] = [
  {
    id: 'retail',
    name: 'Retail',
    nameMy: 'အရောင်းဆိုင်',
    description: 'Counter sales, pickup windows, stock, purchasing, and returns.',
    firstWorkflow: 'Complete a counter sale and schedule a reviewed pickup.',
    workflowTemplateId: 'retail-wholesale',
    entryPoint: 'Walk-in',
    capabilities: ['Sell', 'Orders', 'Stock', 'Purchasing', 'Returns', 'Pickup schedule'],
    scheduleVocabulary: { plural: 'Pickups', singular: 'pickup', holdAction: 'Hold a pickup window' },
    services: [
      { id: 'service-personal-shopping', name: 'Personal shopping', nameMy: 'အထူးဝယ်ယူ ကူညီမှု', durationMinutes: 30, priceMmk: 15_000 },
      { id: 'service-pickup-window', name: 'Pickup window', nameMy: 'ပစ္စည်းလာယူချိန်', durationMinutes: 15, priceMmk: 5_000 },
    ],
    resources: [
      { id: 'resource-sales-1', name: 'Sales staff 1', nameMy: 'အရောင်းဝန်ထမ်း ၁', kind: 'staff' },
      { id: 'resource-pickup-1', name: 'Pickup desk 1', nameMy: 'ပစ္စည်းလာယူကောင်တာ ၁', kind: 'room' },
    ],
  },
  {
    id: 'cafe',
    name: 'Cafe',
    nameMy: 'လက်ဖက်ရည်ဆိုင်',
    description: 'Counter orders, collection slots, stock, and daily close.',
    firstWorkflow: 'Take a counter order and schedule a large-order collection.',
    workflowTemplateId: 'restaurant-ordering',
    entryPoint: 'Walk-in',
    capabilities: ['Sell', 'Orders', 'Stock', 'Daily close', 'Collection schedule'],
    scheduleVocabulary: { plural: 'Collections', singular: 'collection', holdAction: 'Hold a collection slot' },
    services: [
      { id: 'service-catering-consultation', name: 'Catering consultation', nameMy: 'ပွဲအတွက် တိုင်ပင်ဆွေးနွေးခြင်း', durationMinutes: 30, priceMmk: 20_000 },
      { id: 'service-preorder-collection', name: 'Preorder collection', nameMy: 'ကြိုတင်မှာယူ လာယူချိန်', durationMinutes: 15, priceMmk: 5_000 },
    ],
    resources: [
      { id: 'resource-counter-1', name: 'Counter staff 1', nameMy: 'ကောင်တာဝန်ထမ်း ၁', kind: 'staff' },
      { id: 'resource-collection-1', name: 'Collection point 1', nameMy: 'ပစ္စည်းလာယူနေရာ ၁', kind: 'room' },
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    nameMy: 'စားသောက်ဆိုင်',
    description: 'Orders, table reservations, deposits, stock, and payment review.',
    firstWorkflow: 'Record an order and hold one accountable table reservation.',
    workflowTemplateId: 'restaurant-ordering',
    entryPoint: 'Walk-in',
    capabilities: ['Sell', 'Orders', 'Stock', 'Payments', 'Reservations'],
    scheduleVocabulary: { plural: 'Reservations', singular: 'reservation', holdAction: 'Hold a table' },
    services: [
      { id: 'service-table-reservation', name: 'Table reservation deposit', nameMy: 'စားပွဲ ကြိုတင်စရန်', durationMinutes: 90, priceMmk: 10_000 },
      { id: 'service-event-consultation', name: 'Private event consultation', nameMy: 'ကိုယ်ပိုင်ပွဲ တိုင်ပင်ဆွေးနွေးခြင်း', durationMinutes: 45, priceMmk: 25_000 },
    ],
    resources: [
      { id: 'resource-host-1', name: 'Host 1', nameMy: 'ဧည့်ကြိုဝန်ထမ်း ၁', kind: 'staff' },
      { id: 'resource-table-zone-1', name: 'Table zone 1', nameMy: 'စားပွဲဇုန် ၁', kind: 'room' },
    ],
  },
  // The three packs below are the ones with no trade template in business-templates.ts.
  // Their depth lives HERE rather than there on purpose: a spa sells a therapist-hour, not a
  // stock unit with a reorder level, and this file is what already models that. Service ids
  // present before this deepening are kept so nothing that referenced them has to move.
  {
    id: 'spa',
    name: 'Spa',
    nameMy: 'စပါနှင့် အနှိပ်ခန်း',
    description: 'Service sales, appointments, staff, rooms, stock, and payments.',
    firstWorkflow: 'Hold, confirm, check in, and complete one treatment appointment.',
    workflowTemplateId: 'social-commerce',
    entryPoint: 'Phone',
    capabilities: ['Sell', 'Orders', 'Stock', 'Payments', 'Appointments', 'Service resources'],
    scheduleVocabulary: { plural: 'Appointments', singular: 'appointment', holdAction: 'Hold an appointment' },
    services: [
      { id: 'service-consultation', name: 'Consultation', nameMy: 'အလှအပ တိုင်ပင်ဆွေးနွေးခြင်း', durationMinutes: 30, priceMmk: 20_000 },
      { id: 'service-session', name: 'Traditional Myanmar massage', nameMy: 'မြန်မာ့ရိုးရာ အနှိပ်', durationMinutes: 60, priceMmk: 45_000 },
      { id: 'service-oil-massage', name: 'Aromatic oil massage', nameMy: 'ရနံ့ဆီ အနှိပ်', durationMinutes: 90, priceMmk: 65_000 },
      { id: 'service-foot-massage', name: 'Foot massage', nameMy: 'ခြေထောက် အနှိပ်', durationMinutes: 45, priceMmk: 28_000 },
      { id: 'service-facial', name: 'Facial treatment', nameMy: 'မျက်နှာ အလှပြင်ခြင်း', durationMinutes: 45, priceMmk: 38_000 },
      { id: 'service-body-scrub', name: 'Body scrub', nameMy: 'ကိုယ်ခန္ဓာ အရေပြားသန့်စင်ခြင်း', durationMinutes: 60, priceMmk: 42_000 },
      { id: 'service-herbal-steam', name: 'Herbal steam', nameMy: 'ဆေးဖက်ဝင် ရေနွေးငွေ့ခံခြင်း', durationMinutes: 30, priceMmk: 18_000 },
    ],
    resources: [
      { id: 'resource-staff-1', name: 'Therapist 1', nameMy: 'အနှိပ်ဆရာမ ၁', kind: 'staff' },
      { id: 'resource-staff-2', name: 'Therapist 2', nameMy: 'အနှိပ်ဆရာမ ၂', kind: 'staff' },
      { id: 'resource-room-1', name: 'Treatment room 1', nameMy: 'ကုသခန်း ၁', kind: 'room' },
      { id: 'resource-room-2', name: 'Treatment room 2', nameMy: 'ကုသခန်း ၂', kind: 'room' },
      { id: 'resource-steam-room', name: 'Steam room', nameMy: 'ရေနွေးငွေ့ခန်း', kind: 'room' },
    ],
  },
  {
    id: 'gym',
    name: 'Gym',
    nameMy: 'ကာယဗလခန်း',
    description: 'Service sales, consultations, training sessions, staff, and studios.',
    firstWorkflow: 'Schedule and complete one personal-training session.',
    workflowTemplateId: 'social-commerce',
    entryPoint: 'Phone',
    capabilities: ['Sell', 'Orders', 'Stock', 'Payments', 'Training schedule', 'Staff resources'],
    scheduleVocabulary: { plural: 'Sessions', singular: 'session', holdAction: 'Hold a session' },
    services: [
      { id: 'service-fitness-consultation', name: 'Fitness consultation', nameMy: 'ကြံ့ခိုင်ရေး တိုင်ပင်ဆွေးနွေးခြင်း', durationMinutes: 30, priceMmk: 15_000 },
      { id: 'service-personal-training', name: 'Personal training', nameMy: 'တစ်ဦးချင်း လေ့ကျင့်ရေး', durationMinutes: 60, priceMmk: 30_000 },
      { id: 'service-body-check', name: 'Body composition check', nameMy: 'ကိုယ်အလေးချိန်နှင့် အသားဓာတ် တိုင်းတာခြင်း', durationMinutes: 20, priceMmk: 8_000 },
      { id: 'service-group-class', name: 'Group class', nameMy: 'အုပ်စုလိုက် လေ့ကျင့်ခန်း', durationMinutes: 60, priceMmk: 12_000 },
      { id: 'service-yoga', name: 'Yoga session', nameMy: 'ယောဂ လေ့ကျင့်ခန်း', durationMinutes: 60, priceMmk: 15_000 },
      { id: 'service-nutrition-review', name: 'Nutrition plan review', nameMy: 'အာဟာရ အစီအစဉ် သုံးသပ်ခြင်း', durationMinutes: 30, priceMmk: 20_000 },
    ],
    resources: [
      { id: 'resource-trainer-1', name: 'Trainer 1', nameMy: 'လေ့ကျင့်ရေးဆရာ ၁', kind: 'staff' },
      { id: 'resource-trainer-2', name: 'Trainer 2', nameMy: 'လေ့ကျင့်ရေးဆရာ ၂', kind: 'staff' },
      { id: 'resource-studio-1', name: 'Studio 1', nameMy: 'လေ့ကျင့်ခန်းမ ၁', kind: 'room' },
      { id: 'resource-weights-floor', name: 'Weights floor', nameMy: 'အလေးမ ကစားကွင်း', kind: 'room' },
    ],
  },
  {
    id: 'school',
    name: 'School',
    nameMy: 'သင်တန်းကျောင်း',
    description: 'Enrollment consultations, class sessions, teachers, rooms, and fee sales.',
    firstWorkflow: 'Schedule one enrollment consultation or class session.',
    workflowTemplateId: 'social-commerce',
    entryPoint: 'Phone',
    capabilities: ['Sell', 'Orders', 'Stock', 'Payments', 'Class schedule', 'Teacher resources'],
    scheduleVocabulary: { plural: 'Classes', singular: 'class', holdAction: 'Hold a class' },
    services: [
      { id: 'service-enrollment-consultation', name: 'Enrollment consultation', nameMy: 'ကျောင်းအပ် တိုင်ပင်ဆွေးနွေးခြင်း', durationMinutes: 30, priceMmk: 10_000 },
      { id: 'service-placement-test', name: 'Placement test', nameMy: 'အဆင့်စစ်ဆေးမှု', durationMinutes: 45, priceMmk: 5_000 },
      { id: 'service-class-session', name: 'English class session', nameMy: 'အင်္ဂလိပ်စာ သင်တန်းချိန်', durationMinutes: 60, priceMmk: 20_000 },
      { id: 'service-maths-class', name: 'Maths class session', nameMy: 'သင်္ချာ သင်တန်းချိန်', durationMinutes: 60, priceMmk: 20_000 },
      { id: 'service-private-tutoring', name: 'Private tutoring', nameMy: 'တစ်ဦးချင်း အထူးသင်ကြားခြင်း', durationMinutes: 60, priceMmk: 35_000 },
      { id: 'service-exam-prep', name: 'Exam preparation session', nameMy: 'စာမေးပွဲ ပြင်ဆင်သင်တန်း', durationMinutes: 90, priceMmk: 30_000 },
    ],
    resources: [
      { id: 'resource-teacher-1', name: 'Teacher 1', nameMy: 'ဆရာ/ဆရာမ ၁', kind: 'staff' },
      { id: 'resource-teacher-2', name: 'Teacher 2', nameMy: 'ဆရာ/ဆရာမ ၂', kind: 'staff' },
      { id: 'resource-classroom-1', name: 'Classroom 1', nameMy: 'စာသင်ခန်း ၁', kind: 'room' },
      { id: 'resource-classroom-2', name: 'Classroom 2', nameMy: 'စာသင်ခန်း ၂', kind: 'room' },
    ],
  },
] as const

export function shopIndustryPack(id: ShopIndustryPackId) {
  const pack = shopIndustryPacks.find((candidate) => candidate.id === id)
  if (!pack) throw new Error('Choose a supported Shop industry pack.')
  return pack
}

// Appointment scheduling and counter sales remain separate accountable books. This map provides
// only a navigation hint from a reviewed Spa service to its exact sellable catalog row; it never
// creates an order, records payment, advances a booking, or guesses a custom service SKU.
const spaServiceSaleSkus: Readonly<Record<string, string>> = {
  'service-consultation': 'SPA-SVC-CONSULT',
  'service-session': 'SPA-SVC-MASSAGE',
  'service-oil-massage': 'SPA-SVC-OIL',
  'service-foot-massage': 'SPA-SVC-FOOT',
  'service-facial': 'SPA-SVC-FACIAL',
  'service-body-scrub': 'SPA-SVC-SCRUB',
  'service-herbal-steam': 'SPA-SVC-STEAM',
}

export function shopServiceSaleSku(industryPackId: ShopIndustryPackId, serviceId: string) {
  if (industryPackId !== 'spa') return null
  return Object.prototype.hasOwnProperty.call(spaServiceSaleSkus, serviceId)
    ? spaServiceSaleSkus[serviceId] ?? null
    : null
}

const fallbackScheduleVocabulary: ShopScheduleVocabulary = { plural: 'Bookings', singular: 'booking', holdAction: 'Hold a booking' }

// The schedule screen reads this while rendering, so an unrecognised pack has to
// degrade to neutral wording rather than throw and blank the panel.
export function shopScheduleVocabulary(id: string): ShopScheduleVocabulary {
  return shopIndustryPacks.find((candidate) => candidate.id === id)?.scheduleVocabulary ?? fallbackScheduleVocabulary
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

export function createShopServiceSchedule(industryPackId: ShopIndustryPackId = 'retail'): ShopServiceSchedule {
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

export function validateShopServiceSchedule(state: ShopServiceSchedule) {
  if (!state || state.schema !== SHOP_SERVICE_SCHEDULE_SCHEMA) throw new Error('Unsupported Shop service schedule.')
  shopIndustryPack(state.industryPackId)
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('Invalid Shop service schedule revision.')
  if (!Array.isArray(state.services) || !Array.isArray(state.resources) || !state.privacyPolicy || typeof state.privacyPolicy !== 'object' || Array.isArray(state.privacyPolicy) || !Array.isArray(state.clients) || !Array.isArray(state.bookings) || !Array.isArray(state.events)) throw new Error('Incomplete Shop service schedule.')
  const serviceIds = new Set<string>()
  for (const service of state.services) {
    const id = boundedText(service.id, 'Service ID', 80)
    if (serviceIds.has(id)) throw new Error(`Duplicate service ${id}.`)
    serviceIds.add(id)
    boundedText(service.name, 'Service name')
    if (service.nameMy !== undefined) boundedText(service.nameMy, 'Service Myanmar name')
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
    if (resource.nameMy !== undefined) boundedText(resource.nameMy, 'Resource Myanmar name')
    if (!['staff', 'room', 'equipment'].includes(resource.kind)) throw new Error(`Resource ${id} has an invalid kind.`)
    if (typeof resource.active !== 'boolean') throw new Error(`Resource ${id} has an invalid active state.`)
  }
  if (state.privacyPolicy.clientRetentionDays === null) {
    if (state.privacyPolicy.updatedAt !== undefined || state.privacyPolicy.updatedBy !== undefined) throw new Error('An unset client retention policy cannot claim approval evidence.')
  } else {
    positiveWholeNumber(state.privacyPolicy.clientRetentionDays, 'Client retention days', 3650)
    if (state.privacyPolicy.clientRetentionDays < 30) throw new Error('Client retention must be at least 30 days.')
    if (!state.privacyPolicy.updatedAt || !state.privacyPolicy.updatedBy) throw new Error('Client retention approval evidence is incomplete.')
    validIso(state.privacyPolicy.updatedAt, 'Client retention update time')
    boundedText(state.privacyPolicy.updatedBy, 'Client retention approver', 120)
  }
  const clientIds = new Set<string>()
  const clientContacts = new Set<string>()
  for (const client of state.clients) {
    const id = boundedText(client.id, 'Client ID', 80)
    const contact = boundedText(client.contact, 'Client contact').toLocaleLowerCase()
    if (clientIds.has(id) || !/^client-(?:legacy-)?\d{4,10}$/.test(id)) throw new Error(`Duplicate or invalid client ${id}.`)
    if (clientContacts.has(contact)) throw new Error('Each Spa contact must belong to one client record.')
    clientIds.add(id)
    clientContacts.add(contact)
    boundedText(client.name, 'Client name')
    if (!['allowed', 'declined', 'not_recorded'].includes(client.appointmentUpdates)) throw new Error(`Client ${id} appointment-update choice is invalid.`)
    validIso(client.createdAt, 'Client creation time')
    validIso(client.updatedAt, 'Client update time')
    if (client.appointmentUpdates === 'allowed') {
      if (!client.consentRecordedAt) throw new Error(`Client ${id} consent evidence is missing.`)
      validIso(client.consentRecordedAt, 'Client consent time')
    } else if (client.consentRecordedAt !== undefined) {
      throw new Error(`Client ${id} consent evidence is invalid.`)
    }
    const hasAnonymizedAt = client.anonymizedAt !== undefined
    const hasAnonymizedBy = client.anonymizedBy !== undefined
    if (hasAnonymizedAt !== hasAnonymizedBy) throw new Error(`Client ${id} anonymization evidence is incomplete.`)
    if (hasAnonymizedAt) {
      if (client.name !== `Former client ${id}` || client.contact !== `anonymized:${id}` || client.appointmentUpdates !== 'not_recorded' || client.updatedAt !== client.anonymizedAt) throw new Error(`Client ${id} anonymization is invalid.`)
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
    const client = clientById.get(booking.clientId)
    if (!client) throw new Error(`Booking ${id} references an unknown client.`)
    boundedText(booking.customerName, 'Customer name')
    boundedText(booking.contact, 'Customer contact')
    if (!['allowed', 'declined', 'not_recorded'].includes(booking.appointmentUpdates)) throw new Error(`Booking ${id} appointment-update choice is invalid.`)
    if (booking.customerName !== client.name || booking.contact !== client.contact || booking.appointmentUpdates !== client.appointmentUpdates) throw new Error(`Booking ${id} client details are stale.`)
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
    if (!['service_registered', 'resource_registered', 'booking_scheduled', 'booking_advanced', 'booking_cancelled', 'package_redeemed', 'client_retention_set', 'client_exported', 'client_anonymized'].includes(event.type)) throw new Error('Shop service schedule evidence type is unsupported.')
    boundedText(event.subjectId, 'Evidence subject', 80)
    if (event.type === 'package_redeemed' && !state.bookings.some((booking) => booking.id === event.subjectId && booking.status === 'completed')) throw new Error('Package redemption must reference a completed booking.')
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
    ...(input.nameMy === undefined ? {} : { nameMy: boundedText(input.nameMy, 'Service Myanmar name') }),
    durationMinutes: positiveWholeNumber(input.durationMinutes, 'Service duration', 24 * 60),
    priceMmk: positiveWholeNumber(input.priceMmk, 'Service price', Number.MAX_SAFE_INTEGER),
    active: true,
  }
  const next = appendEvent({ ...state, services: [...state.services, service] }, { type: 'service_registered', subjectId: service.id, ...evidence })
  return validateShopServiceSchedule(next)
}

export function registerShopServiceResource(state: ShopServiceSchedule, input: Pick<ShopServiceResource, 'name' | 'kind' | 'nameMy'>, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  if (!['staff', 'room', 'equipment'].includes(input.kind)) throw new Error('Choose staff, room, or equipment.')
  const revision = state.revision + 1
  const resource: ShopServiceResource = {
    id: identifier('resource', revision),
    name: boundedText(input.name, 'Resource name'),
    ...(input.nameMy === undefined ? {} : { nameMy: boundedText(input.nameMy, 'Resource Myanmar name') }),
    kind: input.kind,
    active: true,
  }
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
  if (!['allowed', 'declined'].includes(input.appointmentUpdates)) throw new Error('Choose whether the customer allows appointment updates.')
  const customerName = boundedText(input.customerName, 'Customer name')
  const contact = boundedText(input.contact, 'Customer contact')
  const normalizedContact = contact.toLocaleLowerCase()
  const existingClient = state.clients.find((client) => client.contact.toLocaleLowerCase() === normalizedContact)
  if (existingClient && existingClient.name.toLocaleLowerCase() !== customerName.toLocaleLowerCase()) {
    throw new Error(`This contact already belongs to ${existingClient.name}. Review the client before booking.`)
  }
  const client: ShopServiceClient = existingClient
    ? {
        ...existingClient,
        name: customerName,
        contact,
        appointmentUpdates: input.appointmentUpdates,
        ...(input.appointmentUpdates === 'allowed' ? { consentRecordedAt: evidence.happenedAt } : { consentRecordedAt: undefined }),
        updatedAt: evidence.happenedAt,
      }
    : {
        id: identifier('client', revision),
        name: customerName,
        contact,
        appointmentUpdates: input.appointmentUpdates,
        ...(input.appointmentUpdates === 'allowed' ? { consentRecordedAt: evidence.happenedAt } : {}),
        createdAt: evidence.happenedAt,
        updatedAt: evidence.happenedAt,
      }
  const booking: ShopServiceBooking = {
    id: identifier('booking', revision),
    clientId: client.id,
    customerName: client.name,
    contact: client.contact,
    appointmentUpdates: client.appointmentUpdates,
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
    ? state.clients.map((candidate) => candidate.id === client.id ? client : candidate)
    : [...state.clients, client]
  const synchronizedBookings = state.bookings.map((candidate) => candidate.clientId === client.id
    ? { ...candidate, customerName: client.name, contact: client.contact, appointmentUpdates: client.appointmentUpdates }
    : candidate)
  const next = appendEvent({ ...state, clients, bookings: [...synchronizedBookings, booking] }, { type: 'booking_scheduled', subjectId: booking.id, ...evidence })
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
    clients: state.clients.length,
    today,
    upcoming,
    awaitingArrival: today.filter((booking) => booking.status === 'held' || booking.status === 'confirmed').length,
    inService: today.filter((booking) => booking.status === 'checked_in').length,
    completedToday: today.filter((booking) => booking.status === 'completed').length,
    expectedRevenueMmk: today.filter((booking) => booking.status !== 'cancelled').reduce((total, booking) => total + (serviceById.get(booking.serviceId)?.priceMmk ?? 0), 0),
  }
}

export function setShopServiceClientRetention(state: ShopServiceSchedule, clientRetentionDays: number, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  positiveWholeNumber(clientRetentionDays, 'Client retention days', 3650)
  if (clientRetentionDays < 30) throw new Error('Client retention must be at least 30 days.')
  if (state.privacyPolicy.clientRetentionDays === clientRetentionDays) throw new Error('Choose a different client retention period.')
  return validateShopServiceSchedule(appendEvent({
    ...state,
    privacyPolicy: { clientRetentionDays, updatedAt: evidence.happenedAt, updatedBy: evidence.actor },
  }, { type: 'client_retention_set', subjectId: `retention-${clientRetentionDays}-days`, ...evidence }))
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

export function recordShopServiceClientExport(state: ShopServiceSchedule, digest: string, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('Client export digest is invalid.')
  const count = shopServiceClientExportRows(state).length
  return validateShopServiceSchedule(appendEvent(state, {
    type: 'client_exported',
    subjectId: digest,
    ...evidence,
    reason: `Exported ${count} privacy-minimal client ${count === 1 ? 'record' : 'records'}.`,
  }))
}

export type ShopServiceClientAnonymizationReadiness = { allowed: boolean; reason: string; dueAt: string | null }

function evidenceContainsIdentifier(events: readonly ShopServiceScheduleEvent[], identifier: string) {
  const needle = identifier.trim().toLocaleLowerCase()
  return needle.length > 0 && events.some((event) => [event.subjectId, event.actor, event.reason].some((value) => value.toLocaleLowerCase().includes(needle)))
}

export function shopServiceClientAnonymizationReadiness(
  state: ShopServiceSchedule,
  clientId: string,
  settledSourceRecordIds: readonly string[],
  now = new Date(),
): ShopServiceClientAnonymizationReadiness {
  validateShopServiceSchedule(state)
  const client = state.clients.find((candidate) => candidate.id === clientId)
  if (!client) return { allowed: false, reason: 'Client record not found.', dueAt: null }
  if (client.anonymizedAt) return { allowed: false, reason: 'This client is already anonymized.', dueAt: client.anonymizedAt }
  const retentionDays = state.privacyPolicy.clientRetentionDays
  if (retentionDays === null) return { allowed: false, reason: 'Set the owner-approved retention period first.', dueAt: null }
  const bookings = state.bookings.filter((booking) => booking.clientId === clientId)
  if (bookings.some((booking) => ['held', 'confirmed', 'checked_in'].includes(booking.status))) return { allowed: false, reason: 'Close or cancel every open visit first.', dueAt: null }
  const settled = new Set(settledSourceRecordIds)
  if (bookings.some((booking) => booking.status === 'completed' && !settled.has(`SHOP-BOOKING-${booking.id}`))) return { allowed: false, reason: 'Complete payment and close every finished visit first.', dueAt: null }
  if ([client.name, client.contact].some((identifier) => evidenceContainsIdentifier(state.events, identifier))) return { allowed: false, reason: 'Identity remains in immutable appointment evidence; review support before anonymizing.', dueAt: null }
  const lastActivity = Math.max(Date.parse(client.updatedAt), ...bookings.map((booking) => Date.parse(booking.updatedAt)))
  const dueAt = new Date(lastActivity + retentionDays * 24 * 60 * 60 * 1000).toISOString()
  if (!Number.isFinite(now.getTime()) || now.getTime() < Date.parse(dueAt)) return { allowed: false, reason: `Retention runs until ${new Date(dueAt).toLocaleDateString()}.`, dueAt }
  return { allowed: true, reason: 'Ready for owner review.', dueAt }
}

export function anonymizeShopServiceClient(state: ShopServiceSchedule, clientId: string, settledSourceRecordIds: readonly string[], proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(state)
  const evidence = proofRecord(proof)
  const readiness = shopServiceClientAnonymizationReadiness(state, clientId, settledSourceRecordIds, new Date(evidence.happenedAt))
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
  return validateShopServiceSchedule(appendEvent({ ...state, clients, bookings }, { type: 'client_anonymized', subjectId: clientId, ...evidence }))
}

export function readShopServiceSchedule(value: string | null) {
  if (!value) return createShopServiceSchedule()
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const v2 = parsed.schema === LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA && !parsed.industryPackId
      ? { ...parsed, schema: LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V2, industryPackId: 'spa' }
      : parsed
    if (v2.schema === LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V2) {
      const legacyBookings = Array.isArray(v2.bookings) ? v2.bookings as Array<Record<string, unknown>> : []
      const clients: ShopServiceClient[] = []
      const contactToClient = new Map<string, ShopServiceClient>()
      const bookings = legacyBookings.map((booking) => {
        const contact = String(booking.contact ?? '').trim()
        const key = contact.toLocaleLowerCase()
        let client = contactToClient.get(key)
        if (!client) {
          client = {
            id: `client-legacy-${String(clients.length + 1).padStart(4, '0')}`,
            name: String(booking.customerName ?? '').trim(),
            contact,
            appointmentUpdates: 'not_recorded',
            createdAt: String(booking.createdAt ?? ''),
            updatedAt: String(booking.updatedAt ?? ''),
          }
          clients.push(client)
          contactToClient.set(key, client)
        }
        return { ...booking, clientId: client.id, customerName: client.name, contact: client.contact, appointmentUpdates: 'not_recorded' as const }
      })
      return validateShopServiceSchedule({ ...v2, schema: SHOP_SERVICE_SCHEDULE_SCHEMA, privacyPolicy: { clientRetentionDays: null }, clients, bookings } as unknown as ShopServiceSchedule)
    }
    if (v2.schema === LEGACY_SHOP_SERVICE_SCHEDULE_SCHEMA_V3) return validateShopServiceSchedule({ ...v2, schema: SHOP_SERVICE_SCHEDULE_SCHEMA, privacyPolicy: { clientRetentionDays: null } } as unknown as ShopServiceSchedule)
    return validateShopServiceSchedule(v2 as unknown as ShopServiceSchedule)
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


/**
 * The one rule that says "this catalog line sells that bookable service".
 *
 * It lives in its own module because three unrelated things now depend on agreeing about it:
 * test_industry_pack_sample_pairing.mjs (every bookable service must have a catalog row),
 * shop-appointment-till-reconciliation.ts (which completed treatments never reached the till),
 * and withShopServiceMyanmarNames below (which catalog rows get the pack's Burmese name). Three
 * copies of a matching rule is three chances for them to drift apart silently.
 *
 * The rule: the catalog name either IS the service name, or is the service name followed by a
 * qualifier -- "Traditional Myanmar massage" pairs "Traditional Myanmar massage 60 min". The
 * trailing space matters; without it "Consultation" would pair "Consultationreport".
 *
 * Price is NOT part of this. The pairing test asserts price equality separately, on top of this
 * rule, because there it is checking shipped seed data. Callers reasoning about a real trading
 * day deliberately do not -- see shop-appointment-till-reconciliation.ts for why.
 */
export function catalogNameSellsShopService(catalogName: string, service: Pick<ShopService, 'name'>) {
  if (typeof catalogName !== 'string' || !service?.name) return false
  return catalogName === service.name || catalogName.startsWith(`${service.name} `)
}

/**
 * Which of these services does this catalog line sell, if any?
 *
 * Longest service name wins. Where one service name is a prefix of another -- "Facial treatment"
 * and a hypothetical "Facial treatment deluxe" -- the more specific one is the honest answer, and
 * resolving to exactly one service is what stops a single line being counted against two.
 */
export function shopServiceForCatalogName<T extends Pick<ShopService, 'name'>>(catalogName: string, services: readonly T[]): T | undefined {
  let best: T | undefined
  for (const service of services) {
    if (!catalogNameSellsShopService(catalogName, service)) continue
    if (!best || service.name.length > best.name.length) best = service
  }
  return best
}
type NameableCatalogItem = { name: string; nameMy?: string }

/**
 * Carry the pack's Burmese service names onto the catalog rows that sell those services.
 *
 * The appointment book has shown treatments in Burmese since the packs were deepened, while the
 * counter showed the same treatments in English -- and the translation was sitting thirty lines
 * away in shop-service-scheduling.ts the whole time, dropped by the copy that turns a CSV preview
 * into CommerceItems. The owner read one screen in her language and the next in someone else's.
 *
 * SERVICE ROWS ONLY, and that limit is deliberate. Catalog items across all ten trades carry no
 * Myanmar name at all. Inventing one here for "Herbal body scrub jar 200g" would put machine-made
 * retail copy in front of a paying customer under the product's own name; that needs a native
 * trade writer, not a build script. A row this cannot pair to a bookable service is returned
 * exactly as it arrived.
 *
 * Returns new objects; the input is not modified. Key order is stable because two callers compare
 * installed catalogs by JSON.stringify.
 */
export function withShopServiceMyanmarNames<T extends NameableCatalogItem>(items: readonly T[], industryPackId: ShopIndustryPackId): T[] {
  let services: readonly ShopService[]
  try {
    services = createShopServiceSchedule(industryPackId).services
  } catch {
    // An unrecognised pack means no Burmese to carry, not a failed provisioning run.
    return items.map((item) => ({ ...item }))
  }
  const named = services.filter((service) => service.nameMy !== undefined)
  return items.map((item) => {
    const service = shopServiceForCatalogName(item.name, named)
    return service?.nameMy === undefined ? { ...item } : { ...item, nameMy: service.nameMy }
  })
}

export const SHOP_SERVICE_SCHEDULE_LOCK = 'supermega-shop-service-schedule-v1'

/**
 * Decide whether one owner-originated appointment change may overwrite storage.
 *
 * This lives here, rather than inline in the component, so that the guard which
 * SHIPS is the guard which is TESTED. Written inline it was trivially possible
 * for a test to hand-write its own equivalent closure, pass, and still miss a
 * change to the real one.
 *
 * `baseRevision` is the revision the caller derived its change from. A null
 * baseline means the book was never successfully read, so there is no way to
 * tell whether the change is based on what is stored; refusing is the only safe
 * answer. A stored revision AHEAD of the baseline means another tab wrote
 * first, and overwriting would silently drop that tab's booking.
 */
export function planShopServiceScheduleWrite(
  baseRevision: number | null,
  next: ShopServiceSchedule,
): (current: ShopServiceSchedule) => ShopServiceSchedule | null {
  return (current) => {
    if (baseRevision === null) return null
    return current.revision > baseRevision ? null : next
  }
}

// KNOWN LIMIT, recorded because it bounds what this guard can promise.
//
// `revision` is a COUNT, not an identity, and booking ids come from
// `identifier(prefix, revision)` -- `booking-0001` -- so they are derived from
// that same counter. Two tabs that each book once from revision 5 therefore
// produce books at revision 6 whose event records are byte-identical AND whose
// new bookings share an id. There is nothing at this layer to tell the two
// lineages apart; a content check was tried and cannot work for exactly this
// reason.
//
// So the guard stops the FIRST collision, and the caller must reconcile from
// storage when refused (see commit() in ShopServiceSchedule.tsx) or its stale
// in-memory revision will match storage by coincidence and be accepted next
// time. Closing this properly needs per-write identity -- a writer id, or
// booking ids that do not come from the revision counter -- which is a stored
// schema change and deliberately not attempted here, days before the first
// pilot. The collision itself needs two tabs of ONE browser profile on ONE
// device: localStorage and Web Locks are per-origin-per-profile, so two devices
// never contend for this key.

type ShopServiceScheduleStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type ShopServiceScheduleLockManager = {
  request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T>
}

export type ShopServiceScheduleMutationResult =
  | { ok: true; schedule: ShopServiceSchedule; replayed: boolean }
  | { ok: false; error: string }

function scheduleBrowserStorage() {
  try { return globalThis.localStorage as ShopServiceScheduleStorage | undefined } catch { return undefined }
}

/**
 * Apply one appointment-book change under the same guarantees Commerce gets.
 *
 * The appointment book is the appointment trades' primary record — for a spa it
 * IS the business — but it was previously written with a bare setItem: no lock,
 * so two open tabs could interleave and silently drop a booking; no read-back,
 * so a quota or private-mode rejection looked like success; and no validation of
 * the proposed state, so a bad transition could persist an unreadable book that
 * `readShopServiceSchedule` then refuses to load.
 *
 * Mirrors `mutateCommerceWorkspace` in commerce-workspace.ts. One deliberate
 * difference: an absent key is NOT an error here. Commerce requires explicit
 * initialization, whereas a missing appointment book means a fresh install and
 * `readShopServiceSchedule(null)` seeds an empty schedule — so absence is
 * normal and must stay a working first write, not a refusal.
 */
export async function mutateShopServiceSchedule(
  transition: (schedule: ShopServiceSchedule) => ShopServiceSchedule | null,
  storage: ShopServiceScheduleStorage | undefined = scheduleBrowserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as ShopServiceScheduleLockManager | undefined,
): Promise<ShopServiceScheduleMutationResult> {
  if (!storage) return { ok: false, error: 'Appointment storage is unavailable; the change was not applied.' }
  if (!lockManager?.request) return { ok: false, error: 'This browser cannot lock appointment writes; the change was not applied.' }
  try {
    return await lockManager.request(SHOP_SERVICE_SCHEDULE_LOCK, { mode: 'exclusive' }, async () => {
      let raw: string | null
      try { raw = storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY) } catch { return { ok: false, error: 'Appointments could not be read; the change was not applied.' } as const }
      let current: ShopServiceSchedule
      try { current = readShopServiceSchedule(raw) } catch { return { ok: false, error: 'Saved appointments are unreadable; the change failed closed. Export or clear the local evidence before continuing.' } as const }
      const next = transition(current)
      if (!next) return { ok: false, error: 'The appointment book changed or the requested change is not valid. Nothing was written.' } as const
      if (next === current) return { ok: true, schedule: current, replayed: true } as const
      let serialized: string
      try {
        validateShopServiceSchedule(next)
        serialized = JSON.stringify(next)
      } catch { return { ok: false, error: 'The proposed appointment book failed integrity checks. Nothing was written.' } as const }
      try {
        storage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, serialized)
        if (storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY) !== serialized) return { ok: false, error: 'Appointment storage did not confirm the write.' } as const
      } catch {
        return { ok: false, error: 'Appointment storage rejected the write. The booking was not saved.' } as const
      }
      return { ok: true, schedule: next, replayed: false } as const
    })
  } catch {
    return { ok: false, error: 'The appointment write lock failed. Nothing was applied.' }
  }
}

export const GUIDED_SAMPLE_SCHEDULE_ACTOR = 'Guided sample'

type GuidedSampleBookingPlan = {
  customerName: string
  contact: string
  note: string
}

const guidedSampleBookingPlans: Record<ShopIndustryPackId, readonly [GuidedSampleBookingPlan, GuidedSampleBookingPlan, GuidedSampleBookingPlan]> = {
  retail: [
    { customerName: 'Ma Thandar', contact: '09 450 210 331', note: 'Weekly personal shopping visit.' },
    { customerName: 'U Kyaw Zin', contact: '09 795 114 208', note: 'Bulk order pickup window.' },
    { customerName: 'Daw Khin Mar', contact: '09 262 448 190', note: 'Reserved pickup for phone order.' },
  ],
  cafe: [
    { customerName: 'Ko Aung Myat', contact: '09 421 077 615', note: 'Office catering tasting.' },
    { customerName: 'Ma Ei Phyu', contact: '09 970 333 484', note: 'Birthday cake collection.' },
    { customerName: 'U Tun Lin', contact: '09 253 901 772', note: 'Large preorder for meeting.' },
  ],
  restaurant: [
    { customerName: 'Daw Nilar', contact: '09 799 442 156', note: 'Family lunch table for six.' },
    { customerName: 'U Zaw Htet', contact: '09 448 015 923', note: 'Anniversary dinner reservation.' },
    { customerName: 'Ma Su Myat', contact: '09 664 270 388', note: 'Private event walkthrough.' },
  ],
  spa: [
    { customerName: 'Ma Hnin Wai', contact: '09 450 623 917', note: 'First-visit consultation.' },
    { customerName: 'Daw Aye Aye', contact: '09 262 380 445', note: 'Monthly standard treatment.' },
    { customerName: 'Ko Thiha', contact: '09 977 105 236', note: 'Gift-voucher treatment.' },
  ],
  gym: [
    { customerName: 'Ko Nay Lin', contact: '09 421 908 350', note: 'Program review consultation.' },
    { customerName: 'Ma Phyo Thiri', contact: '09 795 663 128', note: 'Personal training session.' },
    { customerName: 'U Min Khant', contact: '09 448 237 566', note: 'Strength session with trainer.' },
  ],
  school: [
    { customerName: 'Ma Yoon Nadi', contact: '09 970 481 259', note: 'New student enrollment talk.' },
    { customerName: 'Ko Htet Aung', contact: '09 253 774 016', note: 'Weekend class session.' },
    { customerName: 'Daw Mya Sandar', contact: '09 664 590 843', note: 'Parent consultation booking.' },
  ],
}

function guidedSampleProof(planningDayUtcStart: number, step: number, reason: string): ShopServiceScheduleProof {
  return {
    actor: GUIDED_SAMPLE_SCHEDULE_ACTOR,
    reason,
    happenedAt: new Date(planningDayUtcStart + step * 60_000).toISOString(),
  }
}

export function isGuidedSampleShopSchedule(state: ShopServiceSchedule) {
  validateShopServiceSchedule(state)
  if (!state.events.length) return true
  return state.events.every((event) => event.actor === GUIDED_SAMPLE_SCHEDULE_ACTOR)
}

export function createShopServiceScheduleDemo(industryPackId: ShopIndustryPackId, planningDay: string): ShopServiceSchedule {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planningDay) || !Number.isFinite(Date.parse(`${planningDay}T00:00:00.000Z`))) {
    throw new Error('Planning day must be an exact YYYY-MM-DD date.')
  }
  const pack = shopIndustryPack(industryPackId)
  const dayStart = Date.parse(`${planningDay}T00:00:00.000Z`)
  const plans = guidedSampleBookingPlans[pack.id]
  // Local demo times, Myanmar day: 08:00, 09:30, and 14:00 MMT expressed as UTC.
  const slots = [
    { plan: plans[0], serviceIndex: 0, resourceIndex: 0, startsAt: `${planningDay}T01:30:00.000Z`, advances: 3 },
    { plan: plans[1], serviceIndex: 1, resourceIndex: 0, startsAt: `${planningDay}T03:00:00.000Z`, advances: 2 },
    { plan: plans[2], serviceIndex: 1, resourceIndex: 1, startsAt: `${planningDay}T07:30:00.000Z`, advances: 1 },
  ] as const
  let state = createShopServiceSchedule(pack.id)
  let step = 0
  for (const slot of slots) {
    state = scheduleShopServiceBooking(state, {
      customerName: slot.plan.customerName,
      contact: slot.plan.contact,
      appointmentUpdates: 'declined',
      serviceId: state.services[slot.serviceIndex].id,
      resourceId: state.resources[slot.resourceIndex].id,
      startsAt: slot.startsAt,
      note: slot.plan.note,
    }, guidedSampleProof(dayStart, step += 1, `Guided sample appointment for the ${pack.name} demo schedule.`))
    const bookingId = state.bookings[state.bookings.length - 1].id
    for (let advance = 0; advance < slot.advances; advance += 1) {
      state = advanceShopServiceBooking(state, bookingId, guidedSampleProof(dayStart, step += 1, 'Guided sample status walk-through.'))
    }
  }
  return validateShopServiceSchedule(state)
}
