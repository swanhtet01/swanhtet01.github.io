import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'

import {
  ManagedTrialError,
  currentManagedIdentity,
  loadManagedServiceSchedule,
  saveManagedServiceSchedule,
  type ManagedIdentity,
  type ManagedWorkspaceAccess,
} from './managed-trial'

import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  advanceShopServiceBooking,
  cancelShopServiceBooking,
  linkShopServiceBookingCheckout,
  projectShopServiceSchedule,
  readShopServiceSchedule,
  registerShopService,
  registerShopServiceResource,
  scheduleShopServiceBooking,
  shopServiceClientExportRows,
  shopServiceCheckoutRequest,
  type ShopServiceBookingStatus,
  type ShopServiceCheckoutRequest,
  type ShopServiceSchedule,
} from './shop-service-scheduling'

const statusLabels: Record<ShopServiceBookingStatus, string> = {
  held: 'Held',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const nextActionLabels: Partial<Record<ShopServiceBookingStatus, string>> = {
  held: 'Confirm',
  confirmed: 'Check in',
  checked_in: 'Complete',
}

function nextLocalStart() {
  const date = new Date()
  date.setMinutes(0, 0, 0)
  date.setHours(date.getHours() + 1)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

function initialSchedule() {
  try {
    return { schedule: readShopServiceSchedule(window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)), error: '' }
  } catch (error) {
    return { schedule: null, error: error instanceof Error ? error.message : 'Appointments could not be loaded.' }
  }
}

type ShopServiceCheckoutPayment = 'Cash' | 'KBZPay' | 'WavePay'

export function ShopServiceSchedule({
  access: initialAccess,
  actor = 'Local Shop operator',
  disabled: externallyDisabled = false,
  initiallyOpen = false,
  onReviewCheckout,
}: {
  access?: ManagedWorkspaceAccess
  actor?: string
  disabled?: boolean
  initiallyOpen?: boolean
  onReviewCheckout?: (request: ShopServiceCheckoutRequest, payment: ShopServiceCheckoutPayment) => Promise<{ orderId: string } | null>
}) {
  const [schedule, setSchedule] = useState<ShopServiceSchedule | null>(null)
  const [notice, setNotice] = useState('')
  const [workspaceOpen, setWorkspaceOpen] = useState(initiallyOpen)
  const [bookingDraft, setBookingDraft] = useState({ customerName: '', contact: '', appointmentUpdates: 'declined' as 'allowed' | 'declined', serviceId: '', resourceId: '', startsAt: nextLocalStart(), note: '' })
  const [serviceDraft, setServiceDraft] = useState({ name: '', durationMinutes: '60', priceMmk: '' })
  const [resourceDraft, setResourceDraft] = useState({ name: '', kind: 'staff' as 'staff' | 'room' | 'equipment' })
  const [managedLoading, setManagedLoading] = useState(true)
  const [managedSaving, setManagedSaving] = useState(false)
  const [managedConnected, setManagedConnected] = useState(false)
  const [managedAccess, setManagedAccess] = useState<ManagedWorkspaceAccess | undefined>(initialAccess)
  const [checkoutBusyBookingId, setCheckoutBusyBookingId] = useState('')
  const [checkoutPayments, setCheckoutPayments] = useState<Record<string, ShopServiceCheckoutPayment>>({})
  const managedIdentityRef = useRef<ManagedIdentity | null>(null)
  const managedVersionRef = useRef<number | null>(null)
  const managedSaveBusyRef = useRef(false)
  const schedulePanelRef = useRef<HTMLDetailsElement>(null)
  const scheduleRef = useRef(schedule)
  const projection = useMemo(() => schedule ? projectShopServiceSchedule(schedule) : null, [schedule])
  const disabled = externallyDisabled || managedLoading || managedSaving
  const managedRoleActive = managedConnected || Boolean(managedAccess)
  const fullAccess = !managedRoleActive || managedAccess === 'owner' || managedAccess === 'operator'
  const canManageSetup = fullAccess
  const canExportClients = !managedRoleActive || managedAccess === 'owner'
  const canRunFrontDesk = fullAccess || managedAccess === 'spa-front-desk'
  const canCompleteTreatment = fullAccess || managedAccess === 'spa-therapist'
  const accessLabel = managedAccess === 'spa-front-desk'
    ? 'Front desk'
    : managedAccess === 'spa-therapist'
      ? 'Therapist'
      : managedAccess === 'owner'
        ? 'Owner / manager'
        : managedAccess === 'viewer'
          ? 'Read only'
          : 'Shop operator'

  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])

  useEffect(() => {
    if (!initiallyOpen) return
    const frame = requestAnimationFrame(() => schedulePanelRef.current?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [initiallyOpen])

  useEffect(() => {
    let active = true
    void currentManagedIdentity().then(async (identity) => {
      if (!active) return
      if (!identity) {
        const local = initialSchedule()
        setSchedule(local.schedule)
        setNotice(local.error)
        if (local.schedule) {
          setBookingDraft((current) => ({
            ...current,
            serviceId: current.serviceId || local.schedule?.services[0]?.id || '',
            resourceId: current.resourceId || local.schedule?.resources[0]?.id || '',
          }))
        }
        return
      }
      managedIdentityRef.current = identity
      setManagedConnected(true)
      setManagedAccess(identity.access)
      const managed = await loadManagedServiceSchedule(identity)
      if (!active) return
      managedVersionRef.current = managed.version
      if (managed.schedule) {
        setSchedule(managed.schedule)
        setBookingDraft((current) => ({
          ...current,
          serviceId: current.serviceId || managed.schedule?.services[0]?.id || '',
          resourceId: current.resourceId || managed.schedule?.resources[0]?.id || '',
        }))
        setNotice('Appointments loaded from this company account.')
      } else {
        setNotice('Managed appointments are ready. Your next change will create the shared schedule.')
      }
    }).catch((error) => {
      if (active) setNotice(error instanceof Error ? `${error.message} Appointments stayed locked on this device.` : 'Appointments stayed locked because account access could not be checked.')
    }).finally(() => {
      if (active) setManagedLoading(false)
    })
    return () => { active = false }
  }, [])

  function persistLocal(next: ShopServiceSchedule) {
    window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(next))
  }

  function commit(next: ShopServiceSchedule, message: string) {
    setSchedule(next)
    const identity = managedIdentityRef.current
    if (!identity) {
      try {
        persistLocal(next)
        setNotice(message)
      } catch {
        setNotice('The appointment changed in memory but could not be saved on this device. Do not close this page until local storage is available.')
      }
      return
    }
    setNotice(message)
    const expectedVersion = managedVersionRef.current
    if (expectedVersion === null) return
    if (managedSaveBusyRef.current) {
      setNotice('Wait for the current company appointment change to finish.')
      return
    }
    managedSaveBusyRef.current = true
    setManagedSaving(true)
    void saveManagedServiceSchedule({
      commandId: crypto.randomUUID(),
      expectedVersion,
      identity,
      schedule: next,
    }).then((saved) => {
      managedVersionRef.current = saved.version
      if (saved.schedule) {
        setSchedule(saved.schedule)
      }
      setNotice(`${message} Shared company schedule saved.`)
    }).catch(async (error) => {
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const current = await loadManagedServiceSchedule(identity)
          managedVersionRef.current = current.version
          if (current.schedule) {
            setSchedule(current.schedule)
          }
          setNotice('Another user changed appointments first. The current shared schedule was reloaded; review and try again.')
          return
        } catch {
          // Fall through to the recoverable local warning.
        }
      }
      setNotice(`${error instanceof Error ? error.message : 'Managed save failed.'} This device retained the change; reconnect and try again before another operator edits the schedule.`)
    }).finally(() => {
      managedSaveBusyRef.current = false
      setManagedSaving(false)
    })
  }

  function proof(reason: string) {
    return { actor, reason, happenedAt: new Date().toISOString() }
  }

  function downloadClientList() {
    if (!schedule || !canExportClients) return
    const rows = shopServiceClientExportRows(schedule)
    const cell = (value: string | number) => { const text = String(value); const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"` }
    const csv = [['Name', 'Contact', 'Appointment updates', 'Consent recorded', 'Appointments', 'Completed visits'], ...rows.map((row) => [row.name, row.contact, row.appointmentUpdates, row.consentRecordedAt, row.appointments, row.completedVisits])].map((row) => row.map(cell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'spa-clients.csv'
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Client list downloaded on this device. No notes, health details, or payment details were included.')
  }

  function createBooking(event: FormEvent) {
    event.preventDefault()
    if (!canRunFrontDesk) {
      setNotice('Front desk or owner access is required.')
      return
    }
    if (!schedule) return
    try {
      const startsAt = new Date(bookingDraft.startsAt)
      if (!Number.isFinite(startsAt.getTime())) throw new Error('Choose a valid appointment date and time.')
      const next = scheduleShopServiceBooking(schedule, { ...bookingDraft, startsAt: startsAt.toISOString() }, proof('Scheduled from the Shop appointment workspace.'))
      commit(next, 'Appointment held. Confirm it after checking the customer and resource.')
      setBookingDraft((current) => ({ ...current, customerName: '', contact: '', appointmentUpdates: 'declined', startsAt: nextLocalStart(), note: '' }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The appointment could not be scheduled.')
    }
  }

  function advanceBooking(bookingId: string) {
    if (!schedule) return
    const currentBooking = schedule.bookings.find((booking) => booking.id === bookingId)
    const treatmentCompletion = currentBooking?.status === 'checked_in'
    if (treatmentCompletion ? !canCompleteTreatment : !canRunFrontDesk) {
      setNotice(treatmentCompletion
        ? 'Therapist or owner access is required.'
        : 'Front desk or owner access is required.')
      return
    }
    try {
      const next = advanceShopServiceBooking(schedule, bookingId, proof('Advanced by the responsible Shop operator.'))
      const booking = next.bookings.find((candidate) => candidate.id === bookingId)
      commit(next, `Appointment marked ${booking ? statusLabels[booking.status].toLowerCase() : 'updated'}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The appointment could not advance.')
    }
  }

  function cancelBooking(bookingId: string) {
    if (!canRunFrontDesk) {
      setNotice('Front desk or owner access is required.')
      return
    }
    if (!schedule) return
    try {
      commit(cancelShopServiceBooking(schedule, bookingId, proof('Cancelled by the responsible Shop operator.')), 'Appointment cancelled; the resource is available again.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The appointment could not be cancelled.')
    }
  }

  async function reviewCheckout(bookingId: string) {
    if (!canRunFrontDesk) {
      setNotice('Front desk or owner access is required.')
      return
    }
    const current = scheduleRef.current
    if (!current || !onReviewCheckout) {
      setNotice('Shop checkout is unavailable. Reload the Shop workspace and try again.')
      return
    }
    const request = shopServiceCheckoutRequest(current, bookingId)
    if (!request) {
      setNotice('Complete this appointment once before starting checkout.')
      return
    }
    setCheckoutBusyBookingId(bookingId)
    try {
      const result = await onReviewCheckout(request, checkoutPayments[bookingId] ?? 'Cash')
      if (!result) {
        setNotice('Checkout review cancelled. No order or payment was created.')
        return
      }
      const latest = scheduleRef.current
      if (!latest) throw new Error('Appointments need recovery before the checkout can be linked.')
      const linkProof = proof('Linked the completed appointment to its reviewed Shop checkout.')
      const next = linkShopServiceBookingCheckout(latest, bookingId, result.orderId, linkProof)
      setSchedule(next)
      const identity = managedIdentityRef.current
      if (!identity) {
        try { persistLocal(next) } catch { /* The in-memory checkout link remains visible for recovery. */ }
        setNotice(`Checkout ${result.orderId} linked on this device. Payment still needs reconciliation in Orders.`)
        return
      }
      if (managedSaveBusyRef.current) throw new Error('Wait for the current company appointment change, then reopen this checkout.')
      managedSaveBusyRef.current = true
      setManagedSaving(true)
      try {
        const fresh = await loadManagedServiceSchedule(identity)
        managedVersionRef.current = fresh.version
        if (!fresh.schedule) throw new Error('The shared appointment schedule is unavailable. This device retained the checkout link.')
        const managedNext = linkShopServiceBookingCheckout(fresh.schedule, bookingId, result.orderId, linkProof)
        if (managedNext === fresh.schedule) {
          setSchedule(fresh.schedule)
          setNotice(`Checkout ${result.orderId} was already linked in the company account. Payment still needs reconciliation in Orders.`)
          return
        }
        const saved = await saveManagedServiceSchedule({
          commandId: crypto.randomUUID(),
          expectedVersion: fresh.version,
          identity,
          schedule: managedNext,
        })
        managedVersionRef.current = saved.version
        if (saved.schedule) {
          setSchedule(saved.schedule)
        }
        setNotice(`Checkout ${result.orderId} linked in the company account. Payment still needs reconciliation in Orders.`)
      } finally {
        managedSaveBusyRef.current = false
        setManagedSaving(false)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Checkout could not be linked. No automatic payment or customer message was attempted.')
    } finally {
      setCheckoutBusyBookingId('')
    }
  }

  function createService(event: FormEvent) {
    event.preventDefault()
    if (!canManageSetup) {
      setNotice('Owner access is required for Spa setup.')
      return
    }
    if (!schedule) return
    try {
      const next = registerShopService(schedule, { name: serviceDraft.name, durationMinutes: Number(serviceDraft.durationMinutes), priceMmk: Number(serviceDraft.priceMmk) }, proof('Added from Shop appointment setup.'))
      commit(next, 'Service added to appointment setup.')
      const serviceId = next.services.at(-1)?.id ?? bookingDraft.serviceId
      setBookingDraft((current) => ({ ...current, serviceId }))
      setServiceDraft({ name: '', durationMinutes: '60', priceMmk: '' })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The service could not be added.')
    }
  }

  function createResource(event: FormEvent) {
    event.preventDefault()
    if (!canManageSetup) {
      setNotice('Owner access is required for Spa setup.')
      return
    }
    if (!schedule) return
    try {
      const next = registerShopServiceResource(schedule, resourceDraft, proof('Added from Shop appointment setup.'))
      commit(next, 'Staff or resource added to appointment setup.')
      const resourceId = next.resources.at(-1)?.id ?? bookingDraft.resourceId
      setBookingDraft((current) => ({ ...current, resourceId }))
      setResourceDraft({ name: '', kind: 'staff' })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The resource could not be added.')
    }
  }

  if (!schedule || !projection) return <section className="core-panel shop-service-schedule" id="shop-service-schedule"><div className="panel-head"><div><span className="core-eyebrow">Appointments</span><h2>Schedule needs recovery</h2></div></div><p className="form-notice" role="alert">{notice}</p></section>

  const serviceById = new Map(schedule.services.map((service) => [service.id, service]))
  const resourceById = new Map(schedule.resources.map((resource) => [resource.id, resource]))

  return <details className="core-panel shop-service-schedule" id="shop-service-schedule" onToggle={(event) => setWorkspaceOpen(event.currentTarget.open)} open={workspaceOpen} ref={schedulePanelRef}>
    <summary><span><small>Appointments</small><strong>{projection.today.length ? `${projection.today.length} today` : 'Schedule services'}</strong></span><span>{projection.awaitingArrival} waiting · {projection.inService} in service</span></summary>
    <div className="service-schedule-body">
      <div className="service-schedule-summary" aria-label="Appointment summary">
        <span><small>Today</small><strong>{projection.today.length}</strong></span>
        <span><small>Expected</small><strong>{formatMmk(projection.expectedRevenueMmk)}</strong></span>
        <span><small>Clients</small><strong>{projection.clients}</strong></span>
        <span><small>Staff / rooms</small><strong>{projection.activeResources}</strong></span>
      </div>
      {managedRoleActive ? <p className="form-notice" data-spa-access={managedAccess ?? 'operator'}><strong>{accessLabel}</strong> · {managedAccess === 'spa-front-desk'
        ? 'Book, check in, and review visit payment.'
        : managedAccess === 'spa-therapist'
          ? 'Complete checked-in treatments.'
          : managedAccess === 'viewer'
            ? 'View only.'
            : 'Full Spa controls.'}</p> : null}
      {canRunFrontDesk ? <form className="service-booking-form" onSubmit={createBooking}>
        <div><span className="core-eyebrow">New appointment</span><h3>Hold a time</h3><p>A matching contact reuses one client record. Only name, contact, and appointment-update choice are kept.</p></div>
        <label>Customer<input disabled={disabled} maxLength={160} onChange={(event) => setBookingDraft((current) => ({ ...current, customerName: event.target.value }))} placeholder="Customer name" required value={bookingDraft.customerName} /></label>
        <label>Contact<input disabled={disabled} list="spa-client-contacts" maxLength={160} onChange={(event) => { const contact = event.target.value; const client = schedule.clients.find((candidate) => candidate.contact === contact); setBookingDraft((current) => ({ ...current, contact, customerName: client?.name ?? current.customerName })) }} placeholder="Phone or reference" required value={bookingDraft.contact} /><datalist id="spa-client-contacts">{schedule.clients.map((client) => <option key={client.id} value={client.contact}>{client.name}</option>)}</datalist></label>
        <label>Appointment updates<select disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, appointmentUpdates: event.target.value as typeof current.appointmentUpdates }))} value={bookingDraft.appointmentUpdates}><option value="declined">No messages</option><option value="allowed">Customer allowed updates</option></select></label>
        <label>Service<select disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, serviceId: event.target.value }))} required value={bookingDraft.serviceId}>{schedule.services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min · {formatMmk(service.priceMmk)}</option>)}</select></label>
        <label>Staff, room, or equipment<select disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, resourceId: event.target.value }))} required value={bookingDraft.resourceId}>{schedule.resources.filter((resource) => resource.active).map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.kind}</option>)}</select></label>
        <label>Starts<input disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, startsAt: event.target.value }))} required type="datetime-local" value={bookingDraft.startsAt} /></label>
        <label>Note<input disabled={disabled} maxLength={300} onChange={(event) => setBookingDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Optional request" value={bookingDraft.note} /></label>
        <button className="core-button primary" disabled={disabled} type="submit">Hold appointment</button>
      </form> : null}
      <section className="service-agenda" aria-label="Upcoming appointments">
        <div className="panel-head"><div><span className="core-eyebrow">Agenda</span><h3>{projection.upcoming.length ? 'Next appointments' : 'No upcoming appointments'}</h3></div><span className="panel-note">revision {schedule.revision}</span></div>
        {projection.upcoming.length ? projection.upcoming.slice(0, 12).map((booking) => {
          const service = serviceById.get(booking.serviceId)
          const resource = resourceById.get(booking.resourceId)
          const canAdvanceThisBooking = booking.status === 'checked_in' ? canCompleteTreatment : canRunFrontDesk
          return <article key={booking.id}>
            <time dateTime={booking.startsAt}><strong>{new Date(booking.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><small>{new Date(booking.startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></time>
            <div><strong>{booking.customerName}</strong><small>{service?.name} · {resource?.name}{canRunFrontDesk ? ` · ${booking.contact}` : ''}</small>{canRunFrontDesk ? <small>{booking.appointmentUpdates === 'allowed' ? 'Appointment updates allowed' : 'Do not message'}</small> : null}{booking.note ? <em>{booking.note}</em> : null}</div>
            <div><span className={`status-pill ${booking.status === 'completed' ? 'approved' : booking.status === 'checked_in' ? 'pending' : 'bounded'}`}>{statusLabels[booking.status]}</span>{nextActionLabels[booking.status] && canAdvanceThisBooking ? <button className="core-button compact" disabled={disabled} onClick={() => advanceBooking(booking.id)} type="button">{nextActionLabels[booking.status]}</button> : null}{booking.status !== 'completed' && booking.status !== 'cancelled' && canRunFrontDesk ? <button className="text-link danger-text" disabled={disabled} onClick={() => cancelBooking(booking.id)} type="button">Cancel</button> : null}{booking.checkoutOrderId && canRunFrontDesk ? <Link className="core-button compact" to={`/shop/?tab=orders#shop-order-${booking.checkoutOrderId}`}>Open checkout</Link> : booking.status === 'completed' && canRunFrontDesk ? <><label>Payment<select aria-label={`Payment for ${booking.customerName}`} disabled={disabled || checkoutBusyBookingId === booking.id} onChange={(event) => setCheckoutPayments((current) => ({ ...current, [booking.id]: event.target.value as ShopServiceCheckoutPayment }))} value={checkoutPayments[booking.id] ?? 'Cash'}><option>Cash</option><option>KBZPay</option><option>WavePay</option></select></label><button className="core-button compact" disabled={disabled || checkoutBusyBookingId === booking.id || !onReviewCheckout} onClick={() => void reviewCheckout(booking.id)} type="button">{checkoutBusyBookingId === booking.id ? 'Waiting…' : 'Review checkout'}</button><small>No payment or message is automatic.</small></> : null}</div>
          </article>
        }) : <p className="form-notice">{canRunFrontDesk ? 'Hold the first appointment above. Nothing is sent to the customer or an external calendar.' : 'No appointment is waiting for this role.'}</p>}
      </section>
      {canManageSetup && schedule.clients.length ? <details className="compact-disclosure">
        <summary><span>Clients and privacy</span><small>{schedule.clients.length} minimal records</small></summary>
        <div><p>Name, contact, appointment-update choice, and visit counts only. No health, identity-document, or payment data.</p>{canExportClients ? <button className="core-button compact" disabled={disabled} onClick={downloadClientList} type="button">Download client list</button> : <p className="panel-note">Only the owner can download the client list.</p>}<p className="panel-note">Deletion stays review-only until open visits and required financial records are closed.</p></div>
      </details> : null}
      {canManageSetup ? <details className="compact-disclosure service-schedule-setup">
        <summary><span>Services and resources</span><small>{schedule.services.length} services · {schedule.resources.length} resources</small></summary>
        <div>
          <form onSubmit={createService}><strong>Add service</strong><label>Name<input disabled={disabled} maxLength={160} onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Massage, class, consultation" required value={serviceDraft.name} /></label><label>Minutes<input disabled={disabled} max={1440} min={1} onChange={(event) => setServiceDraft((current) => ({ ...current, durationMinutes: event.target.value }))} required type="number" value={serviceDraft.durationMinutes} /></label><label>Price MMK<input disabled={disabled} min={1} onChange={(event) => setServiceDraft((current) => ({ ...current, priceMmk: event.target.value }))} required type="number" value={serviceDraft.priceMmk} /></label><button className="core-button" disabled={disabled} type="submit">Add service</button></form>
          <form onSubmit={createResource}><strong>Add staff or resource</strong><label>Name<input disabled={disabled} maxLength={160} onChange={(event) => setResourceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Staff name or Room 2" required value={resourceDraft.name} /></label><label>Type<select disabled={disabled} onChange={(event) => setResourceDraft((current) => ({ ...current, kind: event.target.value as typeof resourceDraft.kind }))} value={resourceDraft.kind}><option value="staff">Staff</option><option value="room">Room</option><option value="equipment">Equipment</option></select></label><button className="core-button" disabled={disabled} type="submit">Add resource</button></form>
        </div>
      </details> : null}
      <p className="form-notice" aria-live="polite">{notice || (managedConnected ? 'Appointments persist in this company account. Customer messages, calendar sync, and payment remain separate human-approved actions.' : 'Appointments persist on this device. Sign in to share them with a company account.')}</p>
    </div>
  </details>
}
