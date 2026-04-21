import { startTransition, type FormEvent, useDeferredValue, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { LiveProductPreview } from '../components/LiveProductPreview'
import { PageIntro } from '../components/PageIntro'
import {
  appendAppointmentRecord,
  appendExpenseRecord,
  appendSaleRecord,
  appendServiceItem,
  appendStaffMember,
  appointmentStatusLabel,
  clearServiceRetailWorkspace,
  createDefaultServiceRetailWorkspace,
  expenseCategoryLabel,
  expensePaidFromLabel,
  getServiceRetailDailySummary,
  getServiceRetailLedger,
  loadServiceRetailWorkspace,
  parseServiceRetailWorkspace,
  paymentMethodLabel,
  resolveServiceNames,
  resolveStaffName,
  saveServiceRetailWorkspace,
  serializeServiceRetailWorkspace,
  serviceRetailSectorLabel,
  SERVICE_RETAIL_AGENT_LOOPS,
  SERVICE_RETAIL_OPEN_SOURCE_STACK,
  SERVICE_RETAIL_TEMPLATE_LANES,
  updateAppointmentRecordStatus,
  updateServiceRetailWorkspaceProfile,
  type AppointmentStatus,
  type ExpenseCategory,
  type ExpensePaidFrom,
  type PaymentMethod,
  type ServiceRetailSector,
  type ServiceRetailWorkspace,
} from '../lib/serviceRetailDesk'

const initialWorkspaceState = loadServiceRetailWorkspace()

type SaleDraft = {
  customerName: string
  staffId: string
  serviceIds: string[]
  paymentMethod: PaymentMethod
  discount: string
  tip: string
  notes: string
}

type ExpenseDraft = {
  category: ExpenseCategory
  paidFrom: ExpensePaidFrom
  amount: string
  note: string
}

type WorkspaceSettingsDraft = {
  businessName: string
  location: string
  sector: ServiceRetailSector
  currencyCode: string
  openingCashFloat: string
}

type ServiceCatalogDraft = {
  name: string
  category: string
  durationMinutes: string
  price: string
  commissionRate: string
}

type StaffDraft = {
  name: string
  role: string
  shift: string
}

type AppointmentDraft = {
  customerName: string
  serviceId: string
  staffId: string
  startsAt: string
  roomLabel: string
  status: AppointmentStatus
}

function defaultDateTimeInputValue(reference = new Date()) {
  const value = new Date(reference)
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 16)
}

function localDateTimeToIso(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString()
  }
  return parsed.toISOString()
}

function createInitialSaleDraft(workspace: ServiceRetailWorkspace): SaleDraft {
  return {
    customerName: '',
    staffId: workspace.staff[0]?.id ?? '',
    serviceIds: workspace.services[0] ? [workspace.services[0].id] : [],
    paymentMethod: 'card',
    discount: '',
    tip: '',
    notes: '',
  }
}

function createInitialExpenseDraft(): ExpenseDraft {
  return {
    category: 'supplies',
    paidFrom: 'cash',
    amount: '',
    note: '',
  }
}

function createWorkspaceSettingsDraft(workspace: ServiceRetailWorkspace): WorkspaceSettingsDraft {
  return {
    businessName: workspace.businessName,
    location: workspace.location,
    sector: workspace.sector,
    currencyCode: workspace.currencyCode,
    openingCashFloat: String(workspace.openingCashFloat),
  }
}

function createInitialServiceCatalogDraft(): ServiceCatalogDraft {
  return {
    name: '',
    category: '',
    durationMinutes: '60',
    price: '',
    commissionRate: '30',
  }
}

function createInitialStaffDraft(): StaffDraft {
  return {
    name: '',
    role: '',
    shift: '',
  }
}

function createInitialAppointmentDraft(workspace: ServiceRetailWorkspace): AppointmentDraft {
  return {
    customerName: '',
    serviceId: workspace.services[0]?.id ?? '',
    staffId: workspace.staff[0]?.id ?? '',
    startsAt: defaultDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
    roomLabel: '',
    status: 'booked',
  }
}

function formatCurrency(amount: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatClock(iso: string) {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) {
    return '--:--'
  }
  return value.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function decimalStringToNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function percentageFromString(value: string) {
  return Math.max(0, Math.min(decimalStringToNumber(value), 100)) / 100
}

function downloadWorkspaceSnapshot(workspace: ServiceRetailWorkspace) {
  if (typeof window === 'undefined') {
    return
  }

  const blob = new Blob([serializeServiceRetailWorkspace(workspace)], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `${workspace.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'service-desk'}-snapshot.json`
  link.click()
  window.URL.revokeObjectURL(url)
}

export function ServiceDeskPage() {
  const [workspace, setWorkspace] = useState<ServiceRetailWorkspace>(initialWorkspaceState)
  const [saleDraft, setSaleDraft] = useState<SaleDraft>(() => createInitialSaleDraft(initialWorkspaceState))
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(createInitialExpenseDraft)
  const [workspaceSettingsDraft, setWorkspaceSettingsDraft] = useState<WorkspaceSettingsDraft>(() => createWorkspaceSettingsDraft(initialWorkspaceState))
  const [serviceDraft, setServiceDraft] = useState<ServiceCatalogDraft>(createInitialServiceCatalogDraft)
  const [staffDraft, setStaffDraft] = useState<StaffDraft>(createInitialStaffDraft)
  const [appointmentDraft, setAppointmentDraft] = useState<AppointmentDraft>(() => createInitialAppointmentDraft(initialWorkspaceState))
  const [importDraft, setImportDraft] = useState('')
  const [dataMessage, setDataMessage] = useState('Using local-first pilot storage. Export a snapshot before pushing it live.')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const deferredLedgerSearch = useDeferredValue(ledgerSearch.trim().toLowerCase())

  useEffect(() => {
    saveServiceRetailWorkspace(workspace)
  }, [workspace])

  useEffect(() => {
    setSaleDraft((current) => {
      const validServiceIds = current.serviceIds.filter((serviceId) => workspace.services.some((service) => service.id === serviceId))
      const fallbackServiceId = workspace.services[0]?.id
      const nextServiceIds = validServiceIds.length ? validServiceIds : fallbackServiceId ? [fallbackServiceId] : []
      const nextStaffId = workspace.staff.some((member) => member.id === current.staffId) ? current.staffId : workspace.staff[0]?.id ?? ''

      if (nextStaffId === current.staffId && nextServiceIds.join('|') === current.serviceIds.join('|')) {
        return current
      }

      return {
        ...current,
        staffId: nextStaffId,
        serviceIds: nextServiceIds,
      }
    })

    setAppointmentDraft((current) => {
      const nextServiceId = workspace.services.some((service) => service.id === current.serviceId) ? current.serviceId : workspace.services[0]?.id ?? ''
      const nextStaffId = workspace.staff.some((member) => member.id === current.staffId) ? current.staffId : workspace.staff[0]?.id ?? ''

      if (nextServiceId === current.serviceId && nextStaffId === current.staffId) {
        return current
      }

      return {
        ...current,
        serviceId: nextServiceId,
        staffId: nextStaffId,
      }
    })
  }, [workspace.services, workspace.staff])

  const summary = getServiceRetailDailySummary(workspace)
  const ledger = getServiceRetailLedger(workspace)
  const filteredLedger = deferredLedgerSearch
    ? ledger.filter(
        (item) =>
          item.searchableText.includes(deferredLedgerSearch) ||
          item.state.toLowerCase().includes(deferredLedgerSearch) ||
          item.detail.toLowerCase().includes(deferredLedgerSearch),
      )
    : ledger

  const selectedServices = workspace.services.filter((service) => saleDraft.serviceIds.includes(service.id))
  const selectedSubtotal = selectedServices.reduce((sum, service) => sum + service.price, 0)
  const selectedDuration = selectedServices.reduce((sum, service) => sum + service.durationMinutes, 0)
  const draftDiscount = Math.max(0, decimalStringToNumber(saleDraft.discount))
  const draftTip = Math.max(0, decimalStringToNumber(saleDraft.tip))
  const draftTotal = Math.max(selectedSubtotal - draftDiscount + draftTip, 0)
  const canSubmitSale = Boolean(saleDraft.staffId && saleDraft.serviceIds.length)
  const canSubmitExpense = decimalStringToNumber(expenseDraft.amount) > 0
  const canSaveProfile = Boolean(workspaceSettingsDraft.businessName.trim() && workspaceSettingsDraft.currencyCode.trim())
  const canAddService = Boolean(serviceDraft.name.trim() && decimalStringToNumber(serviceDraft.price) > 0)
  const canAddStaff = Boolean(staffDraft.name.trim())
  const canAddAppointment = Boolean(appointmentDraft.customerName.trim() && appointmentDraft.serviceId && appointmentDraft.staffId)

  function replaceWorkspace(nextWorkspace: ServiceRetailWorkspace, message: string) {
    startTransition(() => {
      setWorkspace(nextWorkspace)
    })
    setWorkspaceSettingsDraft(createWorkspaceSettingsDraft(nextWorkspace))
    setSaleDraft(createInitialSaleDraft(nextWorkspace))
    setExpenseDraft(createInitialExpenseDraft())
    setAppointmentDraft(createInitialAppointmentDraft(nextWorkspace))
    setImportDraft('')
    setLedgerSearch('')
    setDataMessage(message)
  }

  function toggleService(serviceId: string) {
    setSaleDraft((current) => {
      const exists = current.serviceIds.includes(serviceId)
      const nextServiceIds = exists ? current.serviceIds.filter((item) => item !== serviceId) : [...current.serviceIds, serviceId]
      return {
        ...current,
        serviceIds: nextServiceIds,
      }
    })
  }

  function loadAppointmentIntoCheckout(customerName: string, staffId: string, serviceIds: string[]) {
    setSaleDraft((current) => ({
      ...current,
      customerName,
      staffId,
      serviceIds,
    }))
    setDataMessage('Appointment copied into checkout. Confirm payment, tip, and notes, then close the ticket.')
  }

  function handleSaleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmitSale) {
      return
    }

    startTransition(() => {
      setWorkspace((current) =>
        appendSaleRecord(current, {
          customerName: saleDraft.customerName,
          serviceIds: saleDraft.serviceIds,
          staffId: saleDraft.staffId,
          paymentMethod: saleDraft.paymentMethod,
          discount: draftDiscount,
          tip: draftTip,
          notes: saleDraft.notes,
        }),
      )
    })

    setSaleDraft((current) => ({
      ...current,
      customerName: '',
      discount: '',
      tip: '',
      notes: '',
    }))
    setDataMessage('Checkout added. Daily close and ledger totals were updated immediately.')
  }

  function handleExpenseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmitExpense) {
      return
    }

    startTransition(() => {
      setWorkspace((current) =>
        appendExpenseRecord(current, {
          category: expenseDraft.category,
          note: expenseDraft.note,
          amount: decimalStringToNumber(expenseDraft.amount),
          paidFrom: expenseDraft.paidFrom,
        }),
      )
    })

    setExpenseDraft((current) => ({
      ...current,
      amount: '',
      note: '',
    }))
    setDataMessage('Cash-out logged on the same day ledger.')
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSaveProfile) {
      return
    }

    const nextWorkspace = updateServiceRetailWorkspaceProfile(workspace, {
      businessName: workspaceSettingsDraft.businessName,
      location: workspaceSettingsDraft.location,
      sector: workspaceSettingsDraft.sector,
      currencyCode: workspaceSettingsDraft.currencyCode,
      openingCashFloat: decimalStringToNumber(workspaceSettingsDraft.openingCashFloat),
    })

    startTransition(() => {
      setWorkspace(nextWorkspace)
    })
    setWorkspaceSettingsDraft(createWorkspaceSettingsDraft(nextWorkspace))
    setDataMessage('Business profile updated. This snapshot is now the default for this browser.')
  }

  function handleServiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canAddService) {
      return
    }

    const nextWorkspace = appendServiceItem(workspace, {
      name: serviceDraft.name,
      category: serviceDraft.category,
      durationMinutes: decimalStringToNumber(serviceDraft.durationMinutes),
      price: decimalStringToNumber(serviceDraft.price),
      commissionRate: percentageFromString(serviceDraft.commissionRate),
    })

    startTransition(() => {
      setWorkspace(nextWorkspace)
    })
    setServiceDraft(createInitialServiceCatalogDraft())
    setDataMessage('Service added to the catalog. It is now available for bookings and checkout.')
  }

  function handleStaffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canAddStaff) {
      return
    }

    const nextWorkspace = appendStaffMember(workspace, staffDraft)
    startTransition(() => {
      setWorkspace(nextWorkspace)
    })
    setStaffDraft(createInitialStaffDraft())
    setDataMessage('Team member added. They can now be assigned on appointments and checkout.')
  }

  function handleAppointmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canAddAppointment) {
      return
    }

    const nextWorkspace = appendAppointmentRecord(workspace, {
      customerName: appointmentDraft.customerName,
      serviceIds: appointmentDraft.serviceId ? [appointmentDraft.serviceId] : [],
      staffId: appointmentDraft.staffId,
      startsAt: localDateTimeToIso(appointmentDraft.startsAt),
      roomLabel: appointmentDraft.roomLabel,
      status: appointmentDraft.status,
    })

    startTransition(() => {
      setWorkspace(nextWorkspace)
    })
    setAppointmentDraft((current) => ({
      ...createInitialAppointmentDraft(nextWorkspace),
      startsAt: current.startsAt,
    }))
    setDataMessage('Appointment added. Reception can hand it straight into checkout when the treatment ends.')
  }

  function handleAppointmentStatusChange(appointmentId: string, status: AppointmentStatus) {
    startTransition(() => {
      setWorkspace((current) => updateAppointmentRecordStatus(current, appointmentId, status))
    })
    setDataMessage(`Appointment moved to ${appointmentStatusLabel(status).toLowerCase()}.`)
  }

  function handleResetDemo() {
    clearServiceRetailWorkspace()
    replaceWorkspace(createDefaultServiceRetailWorkspace(), 'Demo snapshot restored. Use export before replacing it with live spa data.')
  }

  function handleImportSnapshot() {
    const imported = parseServiceRetailWorkspace(importDraft)
    if (!imported) {
      setDataMessage('Import failed. Paste a valid service desk JSON snapshot first.')
      return
    }

    replaceWorkspace(imported, 'Snapshot imported. Review the business setup and daily close totals before using it live.')
  }

  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow="Service Retail / Spa Desk"
        title="Run front desk checkout and daily close from one usable, self-buildable workspace."
        description="This wedge is now set up to be adapted, not just demoed: configure the business, add services and staff, book appointments, export the data model, and promote it into a shared backend when the single-site flow is stable."
      />

      <section className="flex flex-wrap gap-3">
        <Link className="sm-button-primary" to="/products/spa-service-desk">
          Review public product page
        </Link>
        <Link className="sm-button-secondary" to="/contact?package=Spa%20Service%20Desk">
          Request rollout
        </Link>
        <button className="sm-button-dark" onClick={() => downloadWorkspaceSnapshot(workspace)} type="button">
          Export snapshot
        </button>
        <button className="sm-button-dark" onClick={handleResetDemo} type="button">
          Reset demo data
        </button>
      </section>

      <section className="sm-calm-surface p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Current workspace</p>
            <h2 className="mt-2 text-2xl font-bold text-white">
              {workspace.businessName} | {serviceRetailSectorLabel(workspace.sector)} | {workspace.location}
            </h2>
          </div>
          <span className="sm-status-pill">{workspace.services.length} services | {workspace.staff.length} staff</span>
        </div>
        <p className="mt-4 text-sm text-[var(--sm-muted)]">{dataMessage}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Collected today</p>
          <p className="mt-3 text-3xl font-bold text-white">{formatCurrency(summary.collectedRevenue, workspace.currencyCode)}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{summary.saleCount} checkouts logged so far.</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Cash to count</p>
          <p className="mt-3 text-3xl font-bold text-white">{formatCurrency(summary.cashOnHand, workspace.currencyCode)}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            Deposit target {formatCurrency(summary.depositTarget, workspace.currencyCode)} after keeping the float.
          </p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Operating balance</p>
          <p className="mt-3 text-3xl font-bold text-white">{formatCurrency(summary.operatingBalance, workspace.currencyCode)}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Expenses logged today: {formatCurrency(summary.expenses, workspace.currencyCode)}.</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Pending checkout</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary.pendingCheckoutCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{summary.appointmentCount} appointments in today&apos;s room flow.</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <article className="sm-calm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Front desk</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Quick checkout</h2>
            </div>
            <p className="max-w-xl text-sm text-[var(--sm-muted)]">
              Keep the operator path short: pick services, assign therapist, take payment, and let the ledger and close routine update automatically.
            </p>
          </div>

          <form className="mt-6 space-y-6" onSubmit={handleSaleSubmit}>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-white">Customer</span>
                <input
                  className="sm-input"
                  onChange={(event) => setSaleDraft((current) => ({ ...current, customerName: event.target.value }))}
                  placeholder="Walk-in guest or member name"
                  value={saleDraft.customerName}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-white">Therapist or owner</span>
                <select
                  className="sm-input"
                  onChange={(event) => setSaleDraft((current) => ({ ...current, staffId: event.target.value }))}
                  value={saleDraft.staffId}
                >
                  {workspace.staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} | {member.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Services and add-ons</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Toggle one or more items for the same ticket.</p>
                </div>
                <span className="sm-status-pill">{selectedDuration ? `${selectedDuration} min selected` : 'No services selected'}</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {workspace.services.map((service) => {
                  const active = saleDraft.serviceIds.includes(service.id)
                  return (
                    <button
                      aria-pressed={active}
                      className={`rounded-[1.1rem] border p-4 text-left transition ${
                        active
                          ? 'border-[rgba(123,196,176,0.36)] bg-[rgba(123,196,176,0.1)] text-white'
                          : 'border-white/10 bg-white/3 text-[var(--sm-muted)] hover:border-white/16 hover:bg-white/5 hover:text-white'
                      }`}
                      key={service.id}
                      onClick={() => toggleService(service.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{service.name}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">
                            {service.category} {service.durationMinutes ? `| ${service.durationMinutes} min` : '| Retail'}
                          </p>
                        </div>
                        <span className="sm-status-pill">{formatCurrency(service.price, workspace.currencyCode)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-white">Discount</span>
                <input
                  className="sm-input"
                  inputMode="decimal"
                  onChange={(event) => setSaleDraft((current) => ({ ...current, discount: event.target.value }))}
                  placeholder="0"
                  value={saleDraft.discount}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-white">Tip</span>
                <input
                  className="sm-input"
                  inputMode="decimal"
                  onChange={(event) => setSaleDraft((current) => ({ ...current, tip: event.target.value }))}
                  placeholder="0"
                  value={saleDraft.tip}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-white">Notes</span>
                <input
                  className="sm-input"
                  onChange={(event) => setSaleDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Membership, package, or treatment note"
                  value={saleDraft.notes}
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_0.88fr]">
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Payment method</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(['cash', 'card', 'bank_transfer', 'e_wallet'] as PaymentMethod[]).map((method) => {
                    const active = saleDraft.paymentMethod === method
                    return (
                      <button
                        aria-pressed={active}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          active
                            ? 'bg-[rgba(123,196,176,0.18)] text-white'
                            : 'bg-white/4 text-[var(--sm-muted)] hover:bg-white/8 hover:text-white'
                        }`}
                        key={method}
                        onClick={() => setSaleDraft((current) => ({ ...current, paymentMethod: method }))}
                        type="button"
                      >
                        {paymentMethodLabel(method)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Ticket total</p>
                <div className="mt-4 space-y-3 text-sm text-[var(--sm-muted)]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Services</span>
                    <strong className="text-white">{formatCurrency(selectedSubtotal, workspace.currencyCode)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Discount</span>
                    <strong className="text-white">-{formatCurrency(draftDiscount, workspace.currencyCode)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Tip</span>
                    <strong className="text-white">{formatCurrency(draftTip, workspace.currencyCode)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <span className="font-semibold text-white">Collect now</span>
                    <strong className="text-xl text-white">{formatCurrency(draftTotal, workspace.currencyCode)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button className="sm-button-primary" disabled={!canSubmitSale} type="submit">
                Add checkout
              </button>
              <span className="text-sm text-[var(--sm-muted)]">Stays local for the pilot, but the data model is exportable and backend-ready.</span>
            </div>
          </form>
        </article>

        <div className="space-y-6">
          <article className="sm-calm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Cash-out log</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Record expenses fast</h2>
            <form className="mt-6 space-y-4" onSubmit={handleExpenseSubmit}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-white">Category</span>
                <select
                  className="sm-input"
                  onChange={(event) =>
                    setExpenseDraft((current) => ({
                      ...current,
                      category: event.target.value as ExpenseCategory,
                    }))
                  }
                  value={expenseDraft.category}
                >
                  {(['supplies', 'laundry', 'refreshments', 'marketing', 'staff_support'] as ExpenseCategory[]).map((category) => (
                    <option key={category} value={category}>
                      {expenseCategoryLabel(category)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-white">Amount</span>
                  <input
                    className="sm-input"
                    inputMode="decimal"
                    onChange={(event) => setExpenseDraft((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0"
                    value={expenseDraft.amount}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-white">Note</span>
                  <input
                    className="sm-input"
                    onChange={(event) => setExpenseDraft((current) => ({ ...current, note: event.target.value }))}
                    placeholder="What was spent and why"
                    value={expenseDraft.note}
                  />
                </label>
              </div>

              <div>
                <p className="text-sm font-semibold text-white">Paid from</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['cash', 'bank'] as ExpensePaidFrom[]).map((source) => {
                    const active = expenseDraft.paidFrom === source
                    return (
                      <button
                        aria-pressed={active}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          active
                            ? 'bg-[rgba(123,196,176,0.18)] text-white'
                            : 'bg-white/4 text-[var(--sm-muted)] hover:bg-white/8 hover:text-white'
                        }`}
                        key={source}
                        onClick={() => setExpenseDraft((current) => ({ ...current, paidFrom: source }))}
                        type="button"
                      >
                        {expensePaidFromLabel(source)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button className="sm-button-secondary" disabled={!canSubmitExpense} type="submit">
                Add expense
              </button>
            </form>
          </article>

          <article className="sm-calm-surface p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Room flow</p>
                <h2 className="mt-2 text-3xl font-bold text-white">Today&apos;s appointments</h2>
              </div>
              <span className="sm-status-pill">{workspace.businessName}</span>
            </div>
            <div className="mt-5 space-y-3">
              {workspace.appointments.map((appointment) => (
                <article className="sm-proof-card" key={appointment.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{appointment.customerName}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {formatClock(appointment.startsAt)} | {appointment.roomLabel} | {resolveServiceNames(workspace, appointment.serviceIds).join(', ')}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">{resolveStaffName(workspace, appointment.staffId)}</p>
                    </div>
                    <span className="sm-status-pill">{appointmentStatusLabel(appointment.status)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="sm-button-secondary" onClick={() => loadAppointmentIntoCheckout(appointment.customerName, appointment.staffId, appointment.serviceIds)} type="button">
                      Use in checkout
                    </button>
                    <button className="sm-button-dark" onClick={() => handleAppointmentStatusChange(appointment.id, 'in_progress')} type="button">
                      Start
                    </button>
                    <button className="sm-button-dark" onClick={() => handleAppointmentStatusChange(appointment.id, 'needs_checkout')} type="button">
                      Ready
                    </button>
                    <button className="sm-button-dark" onClick={() => handleAppointmentStatusChange(appointment.id, 'closed')} type="button">
                      Close
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-calm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Daily close</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Accounting snapshot</h2>
            </div>
            <span className="sm-status-pill">Local-first pilot in {workspace.currencyCode}</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Gross sales</p>
              <p className="mt-3 text-2xl font-bold text-white">{formatCurrency(summary.grossSales, workspace.currencyCode)}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Before discounts and tips.</p>
            </div>
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Discounts + tips</p>
              <p className="mt-3 text-2xl font-bold text-white">
                -{formatCurrency(summary.discounts, workspace.currencyCode)} / +{formatCurrency(summary.tips, workspace.currencyCode)}
              </p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Keep the commercial and service context visible on every ticket.</p>
            </div>
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Commission accrual</p>
              <p className="mt-3 text-2xl font-bold text-white">{formatCurrency(summary.commissions, workspace.currencyCode)}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Estimated from treatment and retail lines.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Payment mix</p>
              <div className="mt-4 space-y-3 text-sm text-[var(--sm-muted)]">
                <div className="flex items-center justify-between gap-3">
                  <span>Cash</span>
                  <strong className="text-white">{formatCurrency(summary.cashSales, workspace.currencyCode)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Card</span>
                  <strong className="text-white">{formatCurrency(summary.cardSales, workspace.currencyCode)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Transfer</span>
                  <strong className="text-white">{formatCurrency(summary.bankTransferSales, workspace.currencyCode)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Wallet</span>
                  <strong className="text-white">{formatCurrency(summary.walletSales, workspace.currencyCode)}</strong>
                </div>
              </div>
            </article>

            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Close checklist</p>
              <div className="mt-4 space-y-3 text-sm text-[var(--sm-muted)]">
                <div className="sm-site-point">
                  <span className="sm-site-point-dot" />
                  <span>Count drawer: {formatCurrency(summary.cashOnHand, workspace.currencyCode)} on hand.</span>
                </div>
                <div className="sm-site-point">
                  <span className="sm-site-point-dot" />
                  <span>Set aside float and deposit {formatCurrency(summary.depositTarget, workspace.currencyCode)}.</span>
                </div>
                <div className="sm-site-point">
                  <span className="sm-site-point-dot" />
                  <span>Review {summary.pendingCheckoutCount} appointments still marked as needing checkout.</span>
                </div>
                <div className="sm-site-point">
                  <span className="sm-site-point-dot" />
                  <span>Confirm {formatCurrency(summary.cashExpenses, workspace.currencyCode)} cash-outs against receipts.</span>
                </div>
              </div>
            </article>
          </div>
        </article>

        <article className="sm-pack-card overflow-hidden p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Product proof</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Service-retail wedge</h2>
            </div>
            <span className="sm-status-pill">Single-site pilot</span>
          </div>
          <div className="mt-5">
            <LiveProductPreview variant="service-desk" />
          </div>
          <div className="mt-5 grid gap-3">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">First rollout</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">One reception desk, one day ledger, one owner close routine.</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Next rollout</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Bookings, package balances, commissions, branch analytics, and a shared backend.</p>
            </article>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Make it yours</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Configure the actual business, not just the demo.</h2>

          <div className="mt-6 space-y-4">
            <details className="sm-details sm-proof-card" open>
              <summary>Business profile</summary>
              <div className="sm-details-content grid gap-4 pt-4">
                <form className="grid gap-4" onSubmit={handleProfileSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Business name</span>
                      <input
                        className="sm-input"
                        onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, businessName: event.target.value }))}
                        value={workspaceSettingsDraft.businessName}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Location</span>
                      <input
                        className="sm-input"
                        onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, location: event.target.value }))}
                        value={workspaceSettingsDraft.location}
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Sector</span>
                      <select
                        className="sm-input"
                        onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, sector: event.target.value as ServiceRetailSector }))}
                        value={workspaceSettingsDraft.sector}
                      >
                        {(['spa', 'salon', 'clinic', 'studio'] as ServiceRetailSector[]).map((sector) => (
                          <option key={sector} value={sector}>
                            {serviceRetailSectorLabel(sector)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Currency</span>
                      <input
                        className="sm-input"
                        maxLength={3}
                        onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))}
                        value={workspaceSettingsDraft.currencyCode}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Opening float</span>
                      <input
                        className="sm-input"
                        inputMode="decimal"
                        onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, openingCashFloat: event.target.value }))}
                        value={workspaceSettingsDraft.openingCashFloat}
                      />
                    </label>
                  </div>
                  <div>
                    <button className="sm-button-primary" disabled={!canSaveProfile} type="submit">
                      Save business profile
                    </button>
                  </div>
                </form>
              </div>
            </details>

            <details className="sm-details sm-proof-card">
              <summary>Services catalog</summary>
              <div className="sm-details-content pt-4">
                <div className="grid gap-3">
                  {workspace.services.map((service) => (
                    <article className="sm-manager-row" key={service.id}>
                      <div>
                        <p className="font-semibold text-white">{service.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">
                          {service.category} | {service.durationMinutes ? `${service.durationMinutes} min` : 'Retail'} | {Math.round(service.commissionRate * 100)}% commission
                        </p>
                      </div>
                      <strong className="text-white">{formatCurrency(service.price, workspace.currencyCode)}</strong>
                    </article>
                  ))}
                </div>
                <form className="mt-4 grid gap-4" onSubmit={handleServiceSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Service name</span>
                      <input className="sm-input" onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} value={serviceDraft.name} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Category</span>
                      <input className="sm-input" onChange={(event) => setServiceDraft((current) => ({ ...current, category: event.target.value }))} value={serviceDraft.category} />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Duration (min)</span>
                      <input className="sm-input" inputMode="numeric" onChange={(event) => setServiceDraft((current) => ({ ...current, durationMinutes: event.target.value }))} value={serviceDraft.durationMinutes} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Price</span>
                      <input className="sm-input" inputMode="decimal" onChange={(event) => setServiceDraft((current) => ({ ...current, price: event.target.value }))} value={serviceDraft.price} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Commission %</span>
                      <input className="sm-input" inputMode="decimal" onChange={(event) => setServiceDraft((current) => ({ ...current, commissionRate: event.target.value }))} value={serviceDraft.commissionRate} />
                    </label>
                  </div>
                  <div>
                    <button className="sm-button-secondary" disabled={!canAddService} type="submit">
                      Add service
                    </button>
                  </div>
                </form>
              </div>
            </details>

            <details className="sm-details sm-proof-card">
              <summary>Staff roster</summary>
              <div className="sm-details-content pt-4">
                <div className="grid gap-3">
                  {workspace.staff.map((member) => (
                    <article className="sm-manager-row" key={member.id}>
                      <div>
                        <p className="font-semibold text-white">{member.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">
                          {member.role} | {member.shift}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
                <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={handleStaffSubmit}>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-white">Name</span>
                    <input className="sm-input" onChange={(event) => setStaffDraft((current) => ({ ...current, name: event.target.value }))} value={staffDraft.name} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-white">Role</span>
                    <input className="sm-input" onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value }))} value={staffDraft.role} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-white">Shift</span>
                    <input className="sm-input" onChange={(event) => setStaffDraft((current) => ({ ...current, shift: event.target.value }))} value={staffDraft.shift} />
                  </label>
                  <div className="md:col-span-3">
                    <button className="sm-button-secondary" disabled={!canAddStaff} type="submit">
                      Add team member
                    </button>
                  </div>
                </form>
              </div>
            </details>

            <details className="sm-details sm-proof-card">
              <summary>Appointment intake</summary>
              <div className="sm-details-content pt-4">
                <form className="grid gap-4" onSubmit={handleAppointmentSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Customer</span>
                      <input className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, customerName: event.target.value }))} value={appointmentDraft.customerName} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Room or chair</span>
                      <input className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, roomLabel: event.target.value }))} value={appointmentDraft.roomLabel} />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Service</span>
                      <select className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, serviceId: event.target.value }))} value={appointmentDraft.serviceId}>
                        {workspace.services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Staff</span>
                      <select className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, staffId: event.target.value }))} value={appointmentDraft.staffId}>
                        {workspace.staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Start time</span>
                      <input className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, startsAt: event.target.value }))} type="datetime-local" value={appointmentDraft.startsAt} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-white">Status</span>
                      <select className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, status: event.target.value as AppointmentStatus }))} value={appointmentDraft.status}>
                        {(['booked', 'in_progress', 'needs_checkout', 'closed'] as AppointmentStatus[]).map((status) => (
                          <option key={status} value={status}>
                            {appointmentStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div>
                    <button className="sm-button-secondary" disabled={!canAddAppointment} type="submit">
                      Add appointment
                    </button>
                  </div>
                </form>
              </div>
            </details>
          </div>
        </article>

        <div className="space-y-6">
          <article className="sm-calm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Own the build</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Portable data and clear local commands</h2>
            <div className="mt-5 space-y-4">
              <button className="sm-button-primary" onClick={() => downloadWorkspaceSnapshot(workspace)} type="button">
                Download current snapshot
              </button>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-white">Import snapshot JSON</span>
                <textarea
                  className="sm-input min-h-40 font-mono text-xs"
                  onChange={(event) => setImportDraft(event.target.value)}
                  placeholder="Paste a previously exported service desk snapshot here."
                  value={importDraft}
                />
              </label>
              <button className="sm-button-secondary" onClick={handleImportSnapshot} type="button">
                Load snapshot
              </button>
              <div className="sm-terminal p-4 text-xs text-[var(--sm-muted)]">
                <pre className="overflow-x-auto whitespace-pre-wrap">
{`cd showroom
npm ci
npm run dev

# In this Windows Bash/Codex environment:
cmd.exe /c npm run build

# Root-level Vercel helpers:
npm run vercel:build
npm run vercel:deploy:prod`}
                </pre>
              </div>
            </div>
          </article>

          <article className="sm-calm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Open-source stack</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Simple setup path</h2>
            <div className="mt-5 space-y-3">
              {SERVICE_RETAIL_OPEN_SOURCE_STACK.map((layer) => (
                <article className="sm-proof-card" key={layer.layer}>
                  <p className="font-semibold text-white">{layer.layer}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{layer.tools.join(', ')}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{layer.why}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <article className="sm-calm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today ledger</p>
              <h2 className="mt-2 text-3xl font-bold text-white">One stream for sales and cash-outs</h2>
            </div>
            <label className="w-full max-w-sm">
              <span className="sr-only">Search today&apos;s ledger</span>
              <input
                className="sm-input"
                onChange={(event) => setLedgerSearch(event.target.value)}
                placeholder="Search customer, note, service, or state"
                value={ledgerSearch}
              />
            </label>
          </div>

          <div className="mt-6 space-y-3">
            {filteredLedger.length ? (
              filteredLedger.map((item) => (
                <article className="sm-manager-row" key={item.id}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{item.title}</p>
                      <span className="sm-status-pill">{item.state}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.subtitle}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">
                      {formatClock(item.createdAt)} | {item.detail}
                    </p>
                  </div>
                  <strong className={item.amount >= 0 ? 'text-lg text-white' : 'text-lg text-[#ffb5ad]'}>
                    {item.amount >= 0 ? '+' : '-'}
                    {formatCurrency(Math.abs(item.amount), workspace.currencyCode)}
                  </strong>
                </article>
              ))
            ) : (
              <div className="sm-proof-card">
                <p className="text-sm text-[var(--sm-muted)]">No ledger rows match the current filter.</p>
              </div>
            )}
          </div>
        </article>

        <div className="space-y-6">
          <article className="sm-calm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">AI agent loops</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Useful automation, not agent theater</h2>
            <div className="mt-5 space-y-3">
              {SERVICE_RETAIL_AGENT_LOOPS.map((agent) => (
                <article className="sm-proof-card" key={agent.name}>
                  <p className="font-semibold text-white">{agent.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{agent.role}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{agent.scope}</p>
                  <p className="mt-3 text-sm text-white/80">{agent.handoff}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="sm-calm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Generalize next</p>
            <h2 className="mt-2 text-3xl font-bold text-white">The same core can expand beyond spa</h2>
            <div className="mt-5 space-y-3">
              {SERVICE_RETAIL_TEMPLATE_LANES.map((lane) => (
                <article className="sm-proof-card" key={lane.name}>
                  <p className="font-semibold text-white">{lane.name}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">Start with: {lane.firstSurface}</p>
                  <p className="mt-3 text-sm text-white/80">Then add: {lane.adaptsWith}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
