import { startTransition, type FormEvent, useDeferredValue, useEffect, useState } from 'react'
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

const serviceDeskModules = [
  ['checkout', 'Checkout'],
  ['closeout', 'Closeout'],
  ['setup', 'Setup'],
  ['ledger', 'Ledger'],
] as const

type ServiceDeskModule = (typeof serviceDeskModules)[number][0]

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

function normalizeSaleDraft(draft: SaleDraft, workspace: ServiceRetailWorkspace): SaleDraft {
  const validServiceIds = draft.serviceIds.filter((serviceId) => workspace.services.some((service) => service.id === serviceId))
  const fallbackServiceId = workspace.services[0]?.id
  const nextServiceIds = validServiceIds.length ? validServiceIds : fallbackServiceId ? [fallbackServiceId] : []
  const nextStaffId = workspace.staff.some((member) => member.id === draft.staffId) ? draft.staffId : workspace.staff[0]?.id ?? ''

  if (nextStaffId === draft.staffId && nextServiceIds.join('|') === draft.serviceIds.join('|')) {
    return draft
  }

  return {
    ...draft,
    staffId: nextStaffId,
    serviceIds: nextServiceIds,
  }
}

function normalizeAppointmentDraft(draft: AppointmentDraft, workspace: ServiceRetailWorkspace): AppointmentDraft {
  const nextServiceId = workspace.services.some((service) => service.id === draft.serviceId) ? draft.serviceId : workspace.services[0]?.id ?? ''
  const nextStaffId = workspace.staff.some((member) => member.id === draft.staffId) ? draft.staffId : workspace.staff[0]?.id ?? ''

  if (nextServiceId === draft.serviceId && nextStaffId === draft.staffId) {
    return draft
  }

  return {
    ...draft,
    serviceId: nextServiceId,
    staffId: nextStaffId,
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
  const [dataMessage, setDataMessage] = useState('Using local-first storage. Export a snapshot before pushing it live.')
  const [activeModule, setActiveModule] = useState<ServiceDeskModule>('checkout')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const deferredLedgerSearch = useDeferredValue(ledgerSearch.trim().toLowerCase())

  useEffect(() => {
    saveServiceRetailWorkspace(workspace)
  }, [workspace])

  const effectiveSaleDraft = normalizeSaleDraft(saleDraft, workspace)
  const effectiveAppointmentDraft = normalizeAppointmentDraft(appointmentDraft, workspace)
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

  const selectedServices = workspace.services.filter((service) => effectiveSaleDraft.serviceIds.includes(service.id))
  const selectedSubtotal = selectedServices.reduce((sum, service) => sum + service.price, 0)
  const selectedDuration = selectedServices.reduce((sum, service) => sum + service.durationMinutes, 0)
  const draftDiscount = Math.max(0, decimalStringToNumber(effectiveSaleDraft.discount))
  const draftTip = Math.max(0, decimalStringToNumber(effectiveSaleDraft.tip))
  const draftTotal = Math.max(selectedSubtotal - draftDiscount + draftTip, 0)
  const canSubmitSale = Boolean(effectiveSaleDraft.staffId && effectiveSaleDraft.serviceIds.length)
  const canSubmitExpense = decimalStringToNumber(expenseDraft.amount) > 0
  const canSaveProfile = Boolean(workspaceSettingsDraft.businessName.trim() && workspaceSettingsDraft.currencyCode.trim())
  const canAddService = Boolean(serviceDraft.name.trim() && decimalStringToNumber(serviceDraft.price) > 0)
  const canAddStaff = Boolean(staffDraft.name.trim())
  const canAddAppointment = Boolean(effectiveAppointmentDraft.customerName.trim() && effectiveAppointmentDraft.serviceId && effectiveAppointmentDraft.staffId)

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
      const draft = normalizeSaleDraft(current, workspace)
      const exists = draft.serviceIds.includes(serviceId)
      const nextServiceIds = exists ? draft.serviceIds.filter((item) => item !== serviceId) : [...draft.serviceIds, serviceId]
      return {
        ...draft,
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
          customerName: effectiveSaleDraft.customerName,
          serviceIds: effectiveSaleDraft.serviceIds,
          staffId: effectiveSaleDraft.staffId,
          paymentMethod: effectiveSaleDraft.paymentMethod,
          discount: draftDiscount,
          tip: draftTip,
          notes: effectiveSaleDraft.notes,
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
      customerName: effectiveAppointmentDraft.customerName,
      serviceIds: effectiveAppointmentDraft.serviceId ? [effectiveAppointmentDraft.serviceId] : [],
      staffId: effectiveAppointmentDraft.staffId,
      startsAt: localDateTimeToIso(effectiveAppointmentDraft.startsAt),
      roomLabel: effectiveAppointmentDraft.roomLabel,
      status: effectiveAppointmentDraft.status,
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
    replaceWorkspace(createDefaultServiceRetailWorkspace(), 'Sample workspace restored. Export before replacing it with live business data.')
  }

  function handleImportSnapshot() {
    const imported = parseServiceRetailWorkspace(importDraft)
    if (!imported) {
      setDataMessage('Import failed. Paste a valid service desk JSON snapshot first.')
      return
    }

    replaceWorkspace(imported, 'Snapshot imported. Review the business setup and daily close totals before using it live.')
  }

  const metricCards = [
    ['Collected', formatCurrency(summary.collectedRevenue, workspace.currencyCode), String(summary.saleCount) + ' sales'],
    ['Cash', formatCurrency(summary.cashOnHand, workspace.currencyCode), 'count drawer'],
    ['Balance', formatCurrency(summary.operatingBalance, workspace.currencyCode), 'after expenses'],
    ['Pending', String(summary.pendingCheckoutCount), String(summary.appointmentCount) + ' bookings'],
  ] as const
  const paymentRows = [
    ['Cash', summary.cashSales],
    ['Card', summary.cardSales],
    ['Transfer', summary.bankTransferSales],
    ['Wallet', summary.walletSales],
  ] as const
  const closeChecks = [
    'Count drawer: ' + formatCurrency(summary.cashOnHand, workspace.currencyCode),
    'Deposit: ' + formatCurrency(summary.depositTarget, workspace.currencyCode),
    'Pending checkout: ' + String(summary.pendingCheckoutCount),
    'Receipt check: ' + formatCurrency(summary.cashExpenses, workspace.currencyCode),
  ] as const

  return (
    <div className="sm-service-desk-screen">
      <section className="sm-service-desk-command" aria-label="Service Desk POS command">
        <div>
          <span>Service Desk POS</span>
          <strong>{workspace.businessName}</strong>
          <p>{serviceRetailSectorLabel(workspace.sector)} / {workspace.location} / {dataMessage}</p>
        </div>
        <div className="sm-service-desk-actions">
          <button className="sm-button-primary" onClick={() => downloadWorkspaceSnapshot(workspace)} type="button">
            Backup
          </button>
          <button className="sm-button-dark" onClick={handleResetDemo} type="button">
            Reset
          </button>
        </div>
      </section>

      <section className="sm-service-desk-metrics" aria-label="Today status">
        {metricCards.map(([label, value, detail]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <nav className="sm-service-desk-tabs" aria-label="Service Desk modules">
        {serviceDeskModules.map(([key, label]) => (
          <button
            aria-pressed={activeModule === key}
            className={activeModule === key ? 'is-active' : ''}
            key={key}
            onClick={() => setActiveModule(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="sm-service-desk-module-grid" data-module={activeModule}>
        {activeModule === 'checkout' ? (
          <>
            <form className="sm-service-desk-panel sm-service-checkout-panel" onSubmit={handleSaleSubmit}>
              <div className="sm-service-desk-panel-head">
                <span>Checkout</span>
                <strong>{formatCurrency(draftTotal, workspace.currencyCode)}</strong>
              </div>

              <div className="sm-service-desk-form-grid">
                <label>
                  <span>Customer</span>
                  <input
                    className="sm-input"
                    onChange={(event) => setSaleDraft((current) => ({ ...current, customerName: event.target.value }))}
                    placeholder="Walk-in or member"
                    value={effectiveSaleDraft.customerName}
                  />
                </label>
                <label>
                  <span>Staff</span>
                  <select
                    className="sm-input"
                    onChange={(event) => setSaleDraft((current) => ({ ...current, staffId: event.target.value }))}
                    value={effectiveSaleDraft.staffId}
                  >
                    {workspace.staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} / {member.role}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="sm-service-list-head">
                <span>Services</span>
                <strong>{selectedDuration ? String(selectedDuration) + ' min' : 'None'}</strong>
              </div>
              <div className="sm-service-service-grid">
                {workspace.services.map((service) => {
                  const active = effectiveSaleDraft.serviceIds.includes(service.id)
                  return (
                    <button
                      aria-pressed={active}
                      className={active ? 'is-active' : ''}
                      key={service.id}
                      onClick={() => toggleService(service.id)}
                      type="button"
                    >
                      <strong>{service.name}</strong>
                      <span>{formatCurrency(service.price, workspace.currencyCode)}</span>
                    </button>
                  )
                })}
              </div>

              <div className="sm-service-desk-form-grid is-compact">
                <label>
                  <span>Discount</span>
                  <input className="sm-input" inputMode="decimal" onChange={(event) => setSaleDraft((current) => ({ ...current, discount: event.target.value }))} placeholder="0" value={effectiveSaleDraft.discount} />
                </label>
                <label>
                  <span>Tip</span>
                  <input className="sm-input" inputMode="decimal" onChange={(event) => setSaleDraft((current) => ({ ...current, tip: event.target.value }))} placeholder="0" value={effectiveSaleDraft.tip} />
                </label>
                <label>
                  <span>Note</span>
                  <input className="sm-input" onChange={(event) => setSaleDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Membership or treatment note" value={effectiveSaleDraft.notes} />
                </label>
              </div>

              <div className="sm-service-desk-payment-row" aria-label="Payment method">
                {(['cash', 'card', 'bank_transfer', 'e_wallet'] as PaymentMethod[]).map((method) => (
                  <button
                    aria-pressed={effectiveSaleDraft.paymentMethod === method}
                    className={effectiveSaleDraft.paymentMethod === method ? 'is-active' : ''}
                    key={method}
                    onClick={() => setSaleDraft((current) => ({ ...current, paymentMethod: method }))}
                    type="button"
                  >
                    {paymentMethodLabel(method)}
                  </button>
                ))}
              </div>

              <div className="sm-service-total-card">
                <span>Collect now</span>
                <strong>{formatCurrency(draftTotal, workspace.currencyCode)}</strong>
                <small>{formatCurrency(selectedSubtotal, workspace.currencyCode)} services / -{formatCurrency(draftDiscount, workspace.currencyCode)} discount / +{formatCurrency(draftTip, workspace.currencyCode)} tip</small>
                <button className="sm-button-primary" disabled={!canSubmitSale} type="submit">
                  Add checkout
                </button>
              </div>
            </form>

            <aside className="sm-service-desk-side-stack">
              <form className="sm-service-desk-panel" onSubmit={handleExpenseSubmit}>
                <div className="sm-service-desk-panel-head">
                  <span>Cash-out</span>
                  <strong>{expensePaidFromLabel(expenseDraft.paidFrom)}</strong>
                </div>
                <label>
                  <span>Category</span>
                  <select className="sm-input" onChange={(event) => setExpenseDraft((current) => ({ ...current, category: event.target.value as ExpenseCategory }))} value={expenseDraft.category}>
                    {(['supplies', 'laundry', 'refreshments', 'marketing', 'staff_support'] as ExpenseCategory[]).map((category) => (
                      <option key={category} value={category}>{expenseCategoryLabel(category)}</option>
                    ))}
                  </select>
                </label>
                <div className="sm-service-desk-form-grid">
                  <label>
                    <span>Amount</span>
                    <input className="sm-input" inputMode="decimal" onChange={(event) => setExpenseDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0" value={expenseDraft.amount} />
                  </label>
                  <label>
                    <span>Note</span>
                    <input className="sm-input" onChange={(event) => setExpenseDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Receipt or reason" value={expenseDraft.note} />
                  </label>
                </div>
                <div className="sm-service-desk-payment-row">
                  {(['cash', 'bank'] as ExpensePaidFrom[]).map((source) => (
                    <button aria-pressed={expenseDraft.paidFrom === source} className={expenseDraft.paidFrom === source ? 'is-active' : ''} key={source} onClick={() => setExpenseDraft((current) => ({ ...current, paidFrom: source }))} type="button">
                      {expensePaidFromLabel(source)}
                    </button>
                  ))}
                </div>
                <button className="sm-button-secondary" disabled={!canSubmitExpense} type="submit">
                  Add expense
                </button>
              </form>

              <article className="sm-service-desk-panel">
                <div className="sm-service-desk-panel-head">
                  <span>Room flow</span>
                  <strong>{workspace.appointments.length}</strong>
                </div>
                <div className="sm-service-appointment-list">
                  {workspace.appointments.map((appointment) => (
                    <div key={appointment.id}>
                      <strong>{appointment.customerName}</strong>
                      <span>{formatClock(appointment.startsAt)} / {resolveStaffName(workspace, appointment.staffId)}</span>
                      <small>{resolveServiceNames(workspace, appointment.serviceIds).join(', ')} / {appointmentStatusLabel(appointment.status)}</small>
                      <div>
                        <button onClick={() => loadAppointmentIntoCheckout(appointment.customerName, appointment.staffId, appointment.serviceIds)} type="button">Checkout</button>
                        <button onClick={() => handleAppointmentStatusChange(appointment.id, 'needs_checkout')} type="button">Ready</button>
                        <button onClick={() => handleAppointmentStatusChange(appointment.id, 'closed')} type="button">Close</button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </>
        ) : null}

        {activeModule === 'closeout' ? (
          <>
            <article className="sm-service-desk-panel">
              <div className="sm-service-desk-panel-head">
                <span>Daily close</span>
                <strong>{workspace.currencyCode}</strong>
              </div>
              <div className="sm-service-closeout-grid">
                {[
                  ['Gross sales', summary.grossSales],
                  ['Discounts', summary.discounts],
                  ['Tips', summary.tips],
                  ['Commission', summary.commissions],
                  ['Expenses', summary.expenses],
                  ['Deposit', summary.depositTarget],
                ].map(([label, amount]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{formatCurrency(Number(amount), workspace.currencyCode)}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="sm-service-desk-panel">
              <div className="sm-service-desk-panel-head">
                <span>Payment mix</span>
                <strong>{formatCurrency(summary.collectedRevenue, workspace.currencyCode)}</strong>
              </div>
              <div className="sm-service-closeout-list">
                {paymentRows.map(([label, amount]) => (
                  <p key={label}><span>{label}</span><strong>{formatCurrency(amount, workspace.currencyCode)}</strong></p>
                ))}
              </div>
              <div className="sm-service-checklist">
                {closeChecks.map((check) => <span key={check}>{check}</span>)}
              </div>
            </article>
          </>
        ) : null}

        {activeModule === 'setup' ? (
          <>
            <article className="sm-service-desk-panel">
              <div className="sm-service-desk-panel-head">
                <span>Business setup</span>
                <strong>{workspace.services.length} services / {workspace.staff.length} staff</strong>
              </div>
              <form className="sm-service-desk-form-grid" onSubmit={handleProfileSubmit}>
                <label><span>Business</span><input className="sm-input" onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, businessName: event.target.value }))} value={workspaceSettingsDraft.businessName} /></label>
                <label><span>Location</span><input className="sm-input" onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, location: event.target.value }))} value={workspaceSettingsDraft.location} /></label>
                <label><span>Sector</span><select className="sm-input" onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, sector: event.target.value as ServiceRetailSector }))} value={workspaceSettingsDraft.sector}>{(['spa', 'salon', 'clinic', 'studio'] as ServiceRetailSector[]).map((sector) => <option key={sector} value={sector}>{serviceRetailSectorLabel(sector)}</option>)}</select></label>
                <label><span>Currency</span><input className="sm-input" maxLength={3} onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))} value={workspaceSettingsDraft.currencyCode} /></label>
                <label><span>Float</span><input className="sm-input" inputMode="decimal" onChange={(event) => setWorkspaceSettingsDraft((current) => ({ ...current, openingCashFloat: event.target.value }))} value={workspaceSettingsDraft.openingCashFloat} /></label>
                <button className="sm-button-primary" disabled={!canSaveProfile} type="submit">Save profile</button>
              </form>
            </article>

            <article className="sm-service-desk-panel">
              <div className="sm-service-desk-panel-head"><span>Catalog and schedule</span><strong>Live setup</strong></div>
              <form className="sm-service-mini-form" onSubmit={handleServiceSubmit}>
                <input className="sm-input" onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Service name" value={serviceDraft.name} />
                <input className="sm-input" onChange={(event) => setServiceDraft((current) => ({ ...current, category: event.target.value }))} placeholder="Category" value={serviceDraft.category} />
                <input className="sm-input" inputMode="decimal" onChange={(event) => setServiceDraft((current) => ({ ...current, price: event.target.value }))} placeholder="Price" value={serviceDraft.price} />
                <input className="sm-input" inputMode="numeric" onChange={(event) => setServiceDraft((current) => ({ ...current, durationMinutes: event.target.value }))} placeholder="Minutes" value={serviceDraft.durationMinutes} />
                <input className="sm-input" inputMode="decimal" onChange={(event) => setServiceDraft((current) => ({ ...current, commissionRate: event.target.value }))} placeholder="Commission %" value={serviceDraft.commissionRate} />
                <button className="sm-button-secondary" disabled={!canAddService} type="submit">Add service</button>
              </form>
              <form className="sm-service-mini-form" onSubmit={handleStaffSubmit}>
                <input className="sm-input" onChange={(event) => setStaffDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Staff name" value={staffDraft.name} />
                <input className="sm-input" onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Role" value={staffDraft.role} />
                <input className="sm-input" onChange={(event) => setStaffDraft((current) => ({ ...current, shift: event.target.value }))} placeholder="Shift" value={staffDraft.shift} />
                <button className="sm-button-secondary" disabled={!canAddStaff} type="submit">Add staff</button>
              </form>
              <form className="sm-service-mini-form" onSubmit={handleAppointmentSubmit}>
                <input className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, customerName: event.target.value }))} placeholder="Customer" value={effectiveAppointmentDraft.customerName} />
                <select className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, serviceId: event.target.value }))} value={effectiveAppointmentDraft.serviceId}>{workspace.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
                <select className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, staffId: event.target.value }))} value={effectiveAppointmentDraft.staffId}>{workspace.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
                <input className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, startsAt: event.target.value }))} type="datetime-local" value={effectiveAppointmentDraft.startsAt} />
                <input className="sm-input" onChange={(event) => setAppointmentDraft((current) => ({ ...current, roomLabel: event.target.value }))} placeholder="Room" value={effectiveAppointmentDraft.roomLabel} />
                <button className="sm-button-secondary" disabled={!canAddAppointment} type="submit">Add booking</button>
              </form>
            </article>
          </>
        ) : null}

        {activeModule === 'ledger' ? (
          <>
            <article className="sm-service-desk-panel">
              <div className="sm-service-desk-panel-head">
                <span>Ledger</span>
                <strong>{filteredLedger.length} rows</strong>
              </div>
              <input className="sm-input" onChange={(event) => setLedgerSearch(event.target.value)} placeholder="Search customer, note, service, state" value={ledgerSearch} />
              <div className="sm-service-ledger-list">
                {filteredLedger.length ? filteredLedger.map((item) => (
                  <div key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.state} / {formatClock(item.createdAt)} / {item.detail}</span>
                    <small>{item.subtitle}</small>
                    <em>{item.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(item.amount), workspace.currencyCode)}</em>
                  </div>
                )) : <p>No ledger rows match this filter.</p>}
              </div>
            </article>
            <article className="sm-service-desk-panel">
              <div className="sm-service-desk-panel-head"><span>Restore</span><strong>JSON snapshot</strong></div>
              <textarea className="sm-input sm-service-import" onChange={(event) => setImportDraft(event.target.value)} placeholder="Paste exported Service Desk JSON" value={importDraft} />
              <button className="sm-button-secondary" onClick={handleImportSnapshot} type="button">Load snapshot</button>
            </article>
          </>
        ) : null}
      </section>
    </div>
  )
}
