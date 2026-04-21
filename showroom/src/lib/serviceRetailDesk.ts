export type ServiceRetailSector = 'spa' | 'salon' | 'clinic' | 'studio'

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'e_wallet'
export type ExpenseCategory = 'supplies' | 'laundry' | 'refreshments' | 'marketing' | 'staff_support'
export type ExpensePaidFrom = 'cash' | 'bank'
export type AppointmentStatus = 'booked' | 'in_progress' | 'needs_checkout' | 'closed'

export type ServiceItem = {
  id: string
  name: string
  durationMinutes: number
  price: number
  commissionRate: number
  category: string
}

export type StaffMember = {
  id: string
  name: string
  role: string
  shift: string
}

export type Appointment = {
  id: string
  customerName: string
  serviceIds: string[]
  staffId: string
  startsAt: string
  status: AppointmentStatus
  roomLabel: string
}

export type SaleRecord = {
  id: string
  customerName: string
  serviceIds: string[]
  staffId: string
  paymentMethod: PaymentMethod
  subtotal: number
  discount: number
  tip: number
  total: number
  commissionAccrual: number
  notes: string
  createdAt: string
}

export type ExpenseRecord = {
  id: string
  category: ExpenseCategory
  note: string
  amount: number
  paidFrom: ExpensePaidFrom
  createdAt: string
}

export type ServiceRetailWorkspace = {
  version: number
  businessName: string
  location: string
  sector: ServiceRetailSector
  currencyCode: string
  openingCashFloat: number
  services: ServiceItem[]
  staff: StaffMember[]
  appointments: Appointment[]
  sales: SaleRecord[]
  expenses: ExpenseRecord[]
}

export type ServiceRetailDailySummary = {
  dayKey: string
  saleCount: number
  grossSales: number
  discounts: number
  tips: number
  collectedRevenue: number
  expenses: number
  cashExpenses: number
  bankExpenses: number
  commissions: number
  averageTicket: number
  cashSales: number
  cardSales: number
  bankTransferSales: number
  walletSales: number
  cashOnHand: number
  depositTarget: number
  operatingBalance: number
  appointmentCount: number
  pendingCheckoutCount: number
}

export type ServiceRetailLedgerItem = {
  id: string
  kind: 'sale' | 'expense'
  title: string
  subtitle: string
  amount: number
  createdAt: string
  state: string
  detail: string
  searchableText: string
}

export type ServiceRetailAgentLoop = {
  name: string
  role: string
  scope: string
  handoff: string
}

export type ServiceRetailStackLayer = {
  layer: string
  tools: string[]
  why: string
}

export type ServiceRetailTemplateLane = {
  name: string
  firstSurface: string
  adaptsWith: string
}

export type CreateSaleInput = {
  customerName: string
  serviceIds: string[]
  staffId: string
  paymentMethod: PaymentMethod
  discount: number
  tip: number
  notes: string
}

export type CreateExpenseInput = {
  category: ExpenseCategory
  note: string
  amount: number
  paidFrom: ExpensePaidFrom
}

export type CreateAppointmentInput = {
  customerName: string
  serviceIds: string[]
  staffId: string
  startsAt: string
  roomLabel: string
  status: AppointmentStatus
}

export type CreateServiceInput = {
  name: string
  durationMinutes: number
  price: number
  commissionRate: number
  category: string
}

export type CreateStaffInput = {
  name: string
  role: string
  shift: string
}

export type UpdateWorkspaceProfileInput = {
  businessName: string
  location: string
  sector: ServiceRetailSector
  currencyCode: string
  openingCashFloat: number
}

const STORAGE_KEY = 'supermega.serviceRetailDesk.v1'
const STATE_VERSION = 1

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function todayKey(reference = new Date()) {
  return `${reference.getFullYear()}-${pad(reference.getMonth() + 1)}-${pad(reference.getDate())}`
}

function dateKeyFromIso(iso: string) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return todayKey(parsed)
}

function entryId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function slugToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueId(baseValue: string, fallback: string, existingIds: string[]) {
  const seed = slugToken(baseValue) || fallback
  let candidate = seed
  let counter = 2

  while (existingIds.includes(candidate)) {
    candidate = `${seed}-${counter}`
    counter += 1
  }

  return candidate
}

function timestampForToday(hour: number, minute: number, reference = new Date()) {
  const value = new Date(reference)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function normalizeCurrencyCode(value: unknown, fallback = 'THB') {
  const normalized = String(value ?? fallback).trim().toUpperCase()
  return normalized.length >= 3 ? normalized.slice(0, 3) : fallback
}

function baseServices(): ServiceItem[] {
  return [
    { id: 'aroma-reset', name: 'Aroma Reset Massage', durationMinutes: 90, price: 2400, commissionRate: 0.34, category: 'Massage' },
    { id: 'deep-recovery', name: 'Deep Recovery Massage', durationMinutes: 60, price: 1800, commissionRate: 0.3, category: 'Massage' },
    { id: 'glow-facial', name: 'Glow Facial Ritual', durationMinutes: 75, price: 2100, commissionRate: 0.28, category: 'Facial' },
    { id: 'herbal-foot', name: 'Herbal Foot Reset', durationMinutes: 45, price: 950, commissionRate: 0.24, category: 'Express' },
    { id: 'signature-package', name: 'Signature Spa Journey', durationMinutes: 120, price: 3200, commissionRate: 0.32, category: 'Package' },
    { id: 'retail-serum', name: 'Botanical Recovery Serum', durationMinutes: 0, price: 650, commissionRate: 0.1, category: 'Retail' },
  ]
}

function baseStaff(): StaffMember[] {
  return [
    { id: 'mya', name: 'Mya', role: 'Senior therapist', shift: '10:00-19:00' },
    { id: 'nisa', name: 'Nisa', role: 'Facial specialist', shift: '11:00-20:00' },
    { id: 'may', name: 'May', role: 'Front desk', shift: '09:30-18:30' },
  ]
}

function baseAppointments(reference = new Date()): Appointment[] {
  return [
    {
      id: 'appt-1',
      customerName: 'Alicia T.',
      serviceIds: ['signature-package'],
      staffId: 'mya',
      startsAt: timestampForToday(11, 0, reference),
      status: 'needs_checkout',
      roomLabel: 'Room 2',
    },
    {
      id: 'appt-2',
      customerName: 'Mina K.',
      serviceIds: ['glow-facial'],
      staffId: 'nisa',
      startsAt: timestampForToday(14, 30, reference),
      status: 'booked',
      roomLabel: 'Room 1',
    },
    {
      id: 'appt-3',
      customerName: 'Walk-in guest',
      serviceIds: ['herbal-foot'],
      staffId: 'mya',
      startsAt: timestampForToday(16, 0, reference),
      status: 'in_progress',
      roomLabel: 'Chair A',
    },
  ]
}

function serviceTotal(services: ServiceItem[], serviceIds: string[]) {
  const byId = new Map(services.map((service) => [service.id, service]))
  return serviceIds.reduce((total, serviceId) => total + (byId.get(serviceId)?.price ?? 0), 0)
}

function serviceCommission(services: ServiceItem[], serviceIds: string[]) {
  const byId = new Map(services.map((service) => [service.id, service]))
  return serviceIds.reduce((total, serviceId) => {
    const service = byId.get(serviceId)
    if (!service) {
      return total
    }
    return total + service.price * service.commissionRate
  }, 0)
}

export const SERVICE_RETAIL_AGENT_LOOPS: ServiceRetailAgentLoop[] = [
  {
    name: 'Booking Concierge',
    role: 'Front desk copilot',
    scope: 'Confirms appointments, fills customer notes, and prepares the next therapist handoff.',
    handoff: 'Hands reception a clean queue with customer context, upsell cues, and timing risks.',
  },
  {
    name: 'Daily Close Clerk',
    role: 'Accounting copilot',
    scope: 'Checks sales, cash-outs, missing checkouts, and end-of-day notes before the owner closes the till.',
    handoff: 'Hands the owner one close-ready summary with deposit target, exceptions, and missing entries.',
  },
  {
    name: 'Stock Watch',
    role: 'Back office copilot',
    scope: 'Tracks retail add-ons, towel or consumable burn, and replenishment warnings from daily usage.',
    handoff: 'Hands operations a short reorder or procurement list instead of a manual count chase.',
  },
]

export const SERVICE_RETAIL_OPEN_SOURCE_STACK: ServiceRetailStackLayer[] = [
  {
    layer: 'Desk UI',
    tools: ['React 19', 'Vite', 'Tailwind CSS'],
    why: 'Fast local setup, tablet-friendly front desk UI, and easy route-by-route rollout.',
  },
  {
    layer: 'API and agent control',
    tools: ['FastAPI', 'Pydantic', 'Celery or RQ'],
    why: 'Simple Python service layer for receipts, accounting sync, worker jobs, and approval-safe AI actions.',
  },
  {
    layer: 'Data',
    tools: ['Postgres', 'SQLite for local pilot'],
    why: 'Start single-site with SQLite or browser-local demo state, then promote to multi-user Postgres without redoing the model.',
  },
  {
    layer: 'Automation',
    tools: ['n8n', 'OpenAI-compatible workers', 'WhatsApp or Gmail connectors'],
    why: 'Useful for booking reminders, daily close summaries, lead recovery, and low-risk staff copilots.',
  },
]

export const SERVICE_RETAIL_TEMPLATE_LANES: ServiceRetailTemplateLane[] = [
  {
    name: 'Spa and wellness',
    firstSurface: 'Bookings, therapist checkout, package tracking, and cash close.',
    adaptsWith: 'Room scheduling, treatment notes, memberships, and gift cards.',
  },
  {
    name: 'Salon and barber',
    firstSurface: 'Chair schedule, service checkout, stylist commission, and retail add-ons.',
    adaptsWith: 'Color formulas, revisit reminders, and no-show recovery agents.',
  },
  {
    name: 'Clinic and studio services',
    firstSurface: 'Appointment desk, intake notes, invoice capture, and end-of-day reconciliation.',
    adaptsWith: 'Consent forms, care plans, package balances, and follow-up messaging.',
  },
]

export function createDefaultServiceRetailWorkspace(reference = new Date()): ServiceRetailWorkspace {
  const services = baseServices()
  return {
    version: STATE_VERSION,
    businessName: 'Lotus Calm Spa',
    location: 'Single location pilot',
    sector: 'spa',
    currencyCode: 'THB',
    openingCashFloat: 3000,
    services,
    staff: baseStaff(),
    appointments: baseAppointments(reference),
    sales: [
      {
        id: 'sale-1',
        customerName: 'Rina P.',
        serviceIds: ['aroma-reset'],
        staffId: 'mya',
        paymentMethod: 'card',
        subtotal: serviceTotal(services, ['aroma-reset']),
        discount: 0,
        tip: 250,
        total: serviceTotal(services, ['aroma-reset']) + 250,
        commissionAccrual: serviceCommission(services, ['aroma-reset']),
        notes: 'Requested neck and shoulder focus.',
        createdAt: timestampForToday(10, 20, reference),
      },
      {
        id: 'sale-2',
        customerName: 'Suri L.',
        serviceIds: ['glow-facial', 'retail-serum'],
        staffId: 'nisa',
        paymentMethod: 'cash',
        subtotal: serviceTotal(services, ['glow-facial', 'retail-serum']),
        discount: 150,
        tip: 0,
        total: serviceTotal(services, ['glow-facial', 'retail-serum']) - 150,
        commissionAccrual: serviceCommission(services, ['glow-facial', 'retail-serum']),
        notes: 'Member bundle applied.',
        createdAt: timestampForToday(12, 10, reference),
      },
    ],
    expenses: [
      {
        id: 'expense-1',
        category: 'laundry',
        note: 'Towel and robe laundry pickup',
        amount: 420,
        paidFrom: 'cash',
        createdAt: timestampForToday(13, 45, reference),
      },
      {
        id: 'expense-2',
        category: 'supplies',
        note: 'Aroma oil restock',
        amount: 960,
        paidFrom: 'bank',
        createdAt: timestampForToday(15, 5, reference),
      },
    ],
  }
}

function hydrateServiceRetailWorkspace(payload?: Partial<ServiceRetailWorkspace> | null, reference = new Date()): ServiceRetailWorkspace {
  const services = Array.isArray(payload?.services)
    ? payload.services.map((item) => normalizeServiceItem(item)).filter(Boolean) as ServiceItem[]
    : baseServices()
  const staff = Array.isArray(payload?.staff) ? payload.staff.map((item) => normalizeStaffMember(item)).filter(Boolean) as StaffMember[] : baseStaff()
  const appointments = Array.isArray(payload?.appointments)
    ? payload.appointments.map((item) => normalizeAppointment(item)).filter(Boolean) as Appointment[]
    : baseAppointments(reference)
  const sales = Array.isArray(payload?.sales) ? payload.sales.map((item) => normalizeSaleRecord(item)).filter(Boolean) as SaleRecord[] : []
  const expenses = Array.isArray(payload?.expenses)
    ? payload.expenses.map((item) => normalizeExpenseRecord(item)).filter(Boolean) as ExpenseRecord[]
    : []

  return {
    version: numberValue(payload?.version, STATE_VERSION),
    businessName: stringValue(payload?.businessName, 'Lotus Calm Spa'),
    location: stringValue(payload?.location, 'Single location pilot'),
    sector: enumValue(payload?.sector, ['spa', 'salon', 'clinic', 'studio'], 'spa'),
    currencyCode: normalizeCurrencyCode(payload?.currencyCode),
    openingCashFloat: numberValue(payload?.openingCashFloat, 3000),
    services: services.length ? services : baseServices(),
    staff: staff.length ? staff : baseStaff(),
    appointments,
    sales,
    expenses,
  }
}

function normalizeServiceItem(value: unknown): ServiceItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return {
    id: stringValue((value as { id?: unknown }).id),
    name: stringValue((value as { name?: unknown }).name),
    durationMinutes: numberValue((value as { durationMinutes?: unknown }).durationMinutes),
    price: numberValue((value as { price?: unknown }).price),
    commissionRate: numberValue((value as { commissionRate?: unknown }).commissionRate),
    category: stringValue((value as { category?: unknown }).category),
  }
}

function normalizeStaffMember(value: unknown): StaffMember | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return {
    id: stringValue((value as { id?: unknown }).id),
    name: stringValue((value as { name?: unknown }).name),
    role: stringValue((value as { role?: unknown }).role),
    shift: stringValue((value as { shift?: unknown }).shift),
  }
}

function normalizeAppointment(value: unknown): Appointment | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return {
    id: stringValue((value as { id?: unknown }).id),
    customerName: stringValue((value as { customerName?: unknown }).customerName),
    serviceIds: stringArray((value as { serviceIds?: unknown }).serviceIds),
    staffId: stringValue((value as { staffId?: unknown }).staffId),
    startsAt: stringValue((value as { startsAt?: unknown }).startsAt),
    status: enumValue((value as { status?: unknown }).status, ['booked', 'in_progress', 'needs_checkout', 'closed'], 'booked'),
    roomLabel: stringValue((value as { roomLabel?: unknown }).roomLabel),
  }
}

function normalizeSaleRecord(value: unknown): SaleRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return {
    id: stringValue((value as { id?: unknown }).id),
    customerName: stringValue((value as { customerName?: unknown }).customerName),
    serviceIds: stringArray((value as { serviceIds?: unknown }).serviceIds),
    staffId: stringValue((value as { staffId?: unknown }).staffId),
    paymentMethod: enumValue((value as { paymentMethod?: unknown }).paymentMethod, ['cash', 'card', 'bank_transfer', 'e_wallet'], 'card'),
    subtotal: numberValue((value as { subtotal?: unknown }).subtotal),
    discount: numberValue((value as { discount?: unknown }).discount),
    tip: numberValue((value as { tip?: unknown }).tip),
    total: numberValue((value as { total?: unknown }).total),
    commissionAccrual: numberValue((value as { commissionAccrual?: unknown }).commissionAccrual),
    notes: stringValue((value as { notes?: unknown }).notes),
    createdAt: stringValue((value as { createdAt?: unknown }).createdAt),
  }
}

function normalizeExpenseRecord(value: unknown): ExpenseRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return {
    id: stringValue((value as { id?: unknown }).id),
    category: enumValue((value as { category?: unknown }).category, ['supplies', 'laundry', 'refreshments', 'marketing', 'staff_support'], 'supplies'),
    note: stringValue((value as { note?: unknown }).note),
    amount: numberValue((value as { amount?: unknown }).amount),
    paidFrom: enumValue((value as { paidFrom?: unknown }).paidFrom, ['cash', 'bank'], 'cash'),
    createdAt: stringValue((value as { createdAt?: unknown }).createdAt),
  }
}

export function loadServiceRetailWorkspace() {
  if (typeof window === 'undefined') {
    return createDefaultServiceRetailWorkspace()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return createDefaultServiceRetailWorkspace()
    }

    const parsed = JSON.parse(raw) as Partial<ServiceRetailWorkspace>
    return hydrateServiceRetailWorkspace(parsed)
  } catch {
    return createDefaultServiceRetailWorkspace()
  }
}

export function saveServiceRetailWorkspace(workspace: ServiceRetailWorkspace) {
  if (typeof window === 'undefined') {
    return workspace
  }

  const normalized = {
    ...workspace,
    version: STATE_VERSION,
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Ignore storage failures to keep the desk usable offline.
  }

  return normalized
}

export function clearServiceRetailWorkspace() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function parseServiceRetailWorkspace(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceRetailWorkspace>
    return hydrateServiceRetailWorkspace(parsed)
  } catch {
    return null
  }
}

export function serializeServiceRetailWorkspace(workspace: ServiceRetailWorkspace) {
  return JSON.stringify(
    {
      ...hydrateServiceRetailWorkspace(workspace),
      version: STATE_VERSION,
    },
    null,
    2,
  )
}

export function paymentMethodLabel(method: PaymentMethod) {
  if (method === 'bank_transfer') {
    return 'Transfer'
  }
  if (method === 'e_wallet') {
    return 'Wallet'
  }
  return method.charAt(0).toUpperCase() + method.slice(1)
}

export function expenseCategoryLabel(category: ExpenseCategory) {
  if (category === 'staff_support') {
    return 'Staff support'
  }
  return category.charAt(0).toUpperCase() + category.slice(1)
}

export function expensePaidFromLabel(source: ExpensePaidFrom) {
  return source === 'cash' ? 'Cash drawer' : 'Bank account'
}

export function appointmentStatusLabel(status: AppointmentStatus) {
  if (status === 'in_progress') {
    return 'In treatment'
  }
  if (status === 'needs_checkout') {
    return 'Needs checkout'
  }
  if (status === 'closed') {
    return 'Closed'
  }
  return 'Booked'
}

export function serviceRetailSectorLabel(sector: ServiceRetailSector) {
  if (sector === 'spa') {
    return 'Spa'
  }
  if (sector === 'salon') {
    return 'Salon'
  }
  if (sector === 'clinic') {
    return 'Clinic'
  }
  return 'Studio'
}

export function resolveServiceNames(workspace: ServiceRetailWorkspace, serviceIds: string[]) {
  const serviceMap = new Map(workspace.services.map((item) => [item.id, item.name]))
  return serviceIds.map((serviceId) => serviceMap.get(serviceId) ?? serviceId)
}

export function resolveStaffName(workspace: ServiceRetailWorkspace, staffId: string) {
  return workspace.staff.find((member) => member.id === staffId)?.name ?? 'Unassigned'
}

export function appendSaleRecord(workspace: ServiceRetailWorkspace, input: CreateSaleInput): ServiceRetailWorkspace {
  const normalizedServiceIds = input.serviceIds.filter((serviceId) => workspace.services.some((service) => service.id === serviceId))
  const subtotal = serviceTotal(workspace.services, normalizedServiceIds)
  const discount = Math.max(0, input.discount)
  const tip = Math.max(0, input.tip)
  const total = Math.max(subtotal - discount + tip, 0)
  const nextSale: SaleRecord = {
    id: entryId('sale'),
    customerName: input.customerName.trim() || 'Walk-in guest',
    serviceIds: normalizedServiceIds,
    staffId: input.staffId,
    paymentMethod: input.paymentMethod,
    subtotal,
    discount,
    tip,
    total,
    commissionAccrual: serviceCommission(workspace.services, normalizedServiceIds),
    notes: input.notes.trim(),
    createdAt: new Date().toISOString(),
  }

  return {
    ...workspace,
    sales: [nextSale, ...workspace.sales],
    appointments: workspace.appointments.map((appointment) =>
      appointment.customerName.toLowerCase() === nextSale.customerName.toLowerCase() && appointment.status === 'needs_checkout'
        ? { ...appointment, status: 'closed' }
        : appointment,
    ),
  }
}

export function appendExpenseRecord(workspace: ServiceRetailWorkspace, input: CreateExpenseInput) {
  const nextExpense: ExpenseRecord = {
    id: entryId('expense'),
    category: input.category,
    note: input.note.trim() || expenseCategoryLabel(input.category),
    amount: Math.max(0, input.amount),
    paidFrom: input.paidFrom,
    createdAt: new Date().toISOString(),
  }

  return {
    ...workspace,
    expenses: [nextExpense, ...workspace.expenses],
  }
}

export function appendAppointmentRecord(workspace: ServiceRetailWorkspace, input: CreateAppointmentInput): ServiceRetailWorkspace {
  const normalizedServiceIds = input.serviceIds.filter((serviceId) => workspace.services.some((service) => service.id === serviceId))
  const nextAppointment: Appointment = {
    id: entryId('appt'),
    customerName: input.customerName.trim() || 'Guest',
    serviceIds: normalizedServiceIds,
    staffId: input.staffId,
    startsAt: input.startsAt,
    status: input.status,
    roomLabel: input.roomLabel.trim() || 'Front desk',
  }

  return {
    ...workspace,
    appointments: [...workspace.appointments, nextAppointment].sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
  }
}

export function updateAppointmentRecordStatus(
  workspace: ServiceRetailWorkspace,
  appointmentId: string,
  status: AppointmentStatus,
): ServiceRetailWorkspace {
  return {
    ...workspace,
    appointments: workspace.appointments.map((appointment) =>
      appointment.id === appointmentId
        ? {
            ...appointment,
            status,
          }
        : appointment,
    ),
  }
}

export function appendServiceItem(workspace: ServiceRetailWorkspace, input: CreateServiceInput): ServiceRetailWorkspace {
  const nextService: ServiceItem = {
    id: uniqueId(input.name, 'service', workspace.services.map((service) => service.id)),
    name: input.name.trim() || 'New service',
    durationMinutes: Math.max(0, input.durationMinutes),
    price: Math.max(0, input.price),
    commissionRate: Math.max(0, Math.min(input.commissionRate, 1)),
    category: input.category.trim() || 'General',
  }

  return {
    ...workspace,
    services: [...workspace.services, nextService],
  }
}

export function appendStaffMember(workspace: ServiceRetailWorkspace, input: CreateStaffInput): ServiceRetailWorkspace {
  const nextStaff: StaffMember = {
    id: uniqueId(input.name, 'staff', workspace.staff.map((member) => member.id)),
    name: input.name.trim() || 'New staff',
    role: input.role.trim() || 'Team member',
    shift: input.shift.trim() || 'Flexible',
  }

  return {
    ...workspace,
    staff: [...workspace.staff, nextStaff],
  }
}

export function updateServiceRetailWorkspaceProfile(
  workspace: ServiceRetailWorkspace,
  input: UpdateWorkspaceProfileInput,
): ServiceRetailWorkspace {
  return {
    ...workspace,
    businessName: input.businessName.trim() || workspace.businessName,
    location: input.location.trim() || workspace.location,
    sector: input.sector,
    currencyCode: normalizeCurrencyCode(input.currencyCode, workspace.currencyCode),
    openingCashFloat: Math.max(0, input.openingCashFloat),
  }
}

export function getServiceRetailDailySummary(workspace: ServiceRetailWorkspace, dayKey = todayKey()) {
  const sales = workspace.sales.filter((sale) => dateKeyFromIso(sale.createdAt) === dayKey)
  const expenses = workspace.expenses.filter((expense) => dateKeyFromIso(expense.createdAt) === dayKey)
  const appointments = workspace.appointments.filter((appointment) => dateKeyFromIso(appointment.startsAt) === dayKey)

  const grossSales = sales.reduce((sum, sale) => sum + sale.subtotal, 0)
  const discounts = sales.reduce((sum, sale) => sum + sale.discount, 0)
  const tips = sales.reduce((sum, sale) => sum + sale.tip, 0)
  const collectedRevenue = sales.reduce((sum, sale) => sum + sale.total, 0)
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const cashExpenses = expenses.filter((expense) => expense.paidFrom === 'cash').reduce((sum, expense) => sum + expense.amount, 0)
  const bankExpenses = expenses.filter((expense) => expense.paidFrom === 'bank').reduce((sum, expense) => sum + expense.amount, 0)
  const commissions = sales.reduce((sum, sale) => sum + sale.commissionAccrual, 0)
  const cashSales = sales.filter((sale) => sale.paymentMethod === 'cash').reduce((sum, sale) => sum + sale.total, 0)
  const cardSales = sales.filter((sale) => sale.paymentMethod === 'card').reduce((sum, sale) => sum + sale.total, 0)
  const bankTransferSales = sales.filter((sale) => sale.paymentMethod === 'bank_transfer').reduce((sum, sale) => sum + sale.total, 0)
  const walletSales = sales.filter((sale) => sale.paymentMethod === 'e_wallet').reduce((sum, sale) => sum + sale.total, 0)
  const cashOnHand = workspace.openingCashFloat + cashSales - cashExpenses
  const depositTarget = Math.max(cashOnHand - workspace.openingCashFloat, 0)

  const summary: ServiceRetailDailySummary = {
    dayKey,
    saleCount: sales.length,
    grossSales,
    discounts,
    tips,
    collectedRevenue,
    expenses: expenseTotal,
    cashExpenses,
    bankExpenses,
    commissions,
    averageTicket: sales.length ? collectedRevenue / sales.length : 0,
    cashSales,
    cardSales,
    bankTransferSales,
    walletSales,
    cashOnHand,
    depositTarget,
    operatingBalance: collectedRevenue - expenseTotal,
    appointmentCount: appointments.length,
    pendingCheckoutCount: appointments.filter((appointment) => appointment.status === 'needs_checkout').length,
  }

  return summary
}

export function getServiceRetailLedger(workspace: ServiceRetailWorkspace, dayKey = todayKey()) {
  const sales: ServiceRetailLedgerItem[] = workspace.sales
    .filter((sale) => dateKeyFromIso(sale.createdAt) === dayKey)
    .map((sale) => {
      const services = resolveServiceNames(workspace, sale.serviceIds).join(', ')
      const therapist = resolveStaffName(workspace, sale.staffId)
      return {
        id: sale.id,
        kind: 'sale',
        title: sale.customerName,
        subtitle: services || 'Service checkout',
        amount: sale.total,
        createdAt: sale.createdAt,
        state: paymentMethodLabel(sale.paymentMethod),
        detail: `${therapist}${sale.notes ? ` | ${sale.notes}` : ''}`,
        searchableText: `${sale.customerName} ${services} ${therapist} ${sale.notes}`.toLowerCase(),
      }
    })

  const expenses: ServiceRetailLedgerItem[] = workspace.expenses
    .filter((expense) => dateKeyFromIso(expense.createdAt) === dayKey)
    .map((expense) => ({
      id: expense.id,
      kind: 'expense',
      title: expenseCategoryLabel(expense.category),
      subtitle: expense.note,
      amount: -expense.amount,
      createdAt: expense.createdAt,
      state: expensePaidFromLabel(expense.paidFrom),
      detail: 'Cash-out',
      searchableText: `${expense.category} ${expense.note} ${expense.paidFrom}`.toLowerCase(),
    }))

  return [...sales, ...expenses].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
