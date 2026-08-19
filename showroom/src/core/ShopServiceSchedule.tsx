import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import {
  ManagedTrialError,
  currentManagedIdentity,
  loadManagedServiceSchedule,
  saveManagedServiceSchedule,
  type ManagedIdentity,
} from './managed-trial'

import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  advanceShopServiceBooking,
  cancelShopServiceBooking,
  projectShopServiceSchedule,
  readShopServiceSchedule,
  registerShopService,
  registerShopServiceResource,
  scheduleShopServiceBooking,
  shopScheduleVocabulary,
  type ShopServiceBookingStatus,
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
    return { schedule: null, error: error instanceof Error ? error.message : 'The schedule could not be loaded.' }
  }
}

export function ShopServiceSchedule({ actor = 'Local Shop operator', disabled: externallyDisabled = false, initiallyOpen = false }: { actor?: string; disabled?: boolean; initiallyOpen?: boolean }) {
  const [initial] = useState(initialSchedule)
  const [schedule, setSchedule] = useState<ShopServiceSchedule | null>(initial.schedule)
  const [notice, setNotice] = useState(initial.error)
  const [workspaceOpen, setWorkspaceOpen] = useState(initiallyOpen)
  const [bookingDraft, setBookingDraft] = useState({ customerName: '', contact: '', serviceId: initial.schedule?.services[0]?.id ?? '', resourceId: initial.schedule?.resources[0]?.id ?? '', startsAt: nextLocalStart(), note: '' })
  const [serviceDraft, setServiceDraft] = useState({ name: '', durationMinutes: '60', priceMmk: '' })
  const [resourceDraft, setResourceDraft] = useState({ name: '', kind: 'staff' as 'staff' | 'room' | 'equipment' })
  const [managedLoading, setManagedLoading] = useState(true)
  const [managedSaving, setManagedSaving] = useState(false)
  const [managedConnected, setManagedConnected] = useState(false)
  const managedIdentityRef = useRef<ManagedIdentity | null>(null)
  const managedVersionRef = useRef<number | null>(null)
  const managedSaveBusyRef = useRef(false)
  const schedulePanelRef = useRef<HTMLDetailsElement>(null)
  const projection = useMemo(() => schedule ? projectShopServiceSchedule(schedule) : null, [schedule])
  // A restaurant sees "Reservations" and a school sees "Classes"; the generic
  // "appointment" made every pack read as the same untailored template. The
  // action notices need it too, so it is derived here rather than at render.
  const vocabulary = shopScheduleVocabulary(schedule?.industryPackId ?? '')
  const disabled = externallyDisabled || managedLoading || managedSaving
  const capitalizedSingular = `${vocabulary.singular.charAt(0).toUpperCase()}${vocabulary.singular.slice(1)}`

  useEffect(() => {
    if (!initiallyOpen) return
    const frame = requestAnimationFrame(() => schedulePanelRef.current?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [initiallyOpen])

  useEffect(() => {
    let active = true
    void currentManagedIdentity().then(async (identity) => {
      if (!active || !identity) return
      managedIdentityRef.current = identity
      setManagedConnected(true)
      const managed = await loadManagedServiceSchedule(identity)
      if (!active) return
      managedVersionRef.current = managed.version
      if (managed.schedule) {
        setSchedule(managed.schedule)
        window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(managed.schedule))
        setNotice('Schedule loaded from this company account.')
      } else {
        setNotice('The managed schedule is ready. Your next change will create the shared schedule.')
      }
    }).catch((error) => {
      if (active) setNotice(error instanceof Error ? `${error.message} The schedule remains available on this device.` : 'The managed schedule is unavailable; this device remains available.')
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
    try {
      persistLocal(next)
      setNotice(message)
    } catch {
      setNotice(`The ${vocabulary.singular} changed in memory but could not be saved on this device. Do not close this page until local storage is available.`)
    }
    const identity = managedIdentityRef.current
    const expectedVersion = managedVersionRef.current
    if (!identity || expectedVersion === null) return
    if (managedSaveBusyRef.current) {
      setNotice(`Wait for the current company ${vocabulary.singular} change to finish.`)
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
        try { persistLocal(saved.schedule) } catch { /* The managed copy remains authoritative. */ }
      }
      setNotice(`${message} Shared company schedule saved.`)
    }).catch(async (error) => {
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const current = await loadManagedServiceSchedule(identity)
          managedVersionRef.current = current.version
          if (current.schedule) {
            setSchedule(current.schedule)
            try { persistLocal(current.schedule) } catch { /* The managed copy remains authoritative. */ }
          }
          setNotice(`Another user changed ${vocabulary.plural.toLowerCase()} first. The current shared schedule was reloaded; review and try again.`)
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

  function createBooking(event: FormEvent) {
    event.preventDefault()
    if (!schedule) return
    try {
      const startsAt = new Date(bookingDraft.startsAt)
      if (!Number.isFinite(startsAt.getTime())) throw new Error(`Choose a valid ${vocabulary.singular} date and time.`)
      const next = scheduleShopServiceBooking(schedule, { ...bookingDraft, startsAt: startsAt.toISOString() }, proof(`Scheduled from the Shop ${vocabulary.singular} workspace.`))
      commit(next, `${capitalizedSingular} held. Confirm it after checking the customer and resource.`)
      setBookingDraft((current) => ({ ...current, customerName: '', contact: '', startsAt: nextLocalStart(), note: '' }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `The ${vocabulary.singular} could not be scheduled.`)
    }
  }

  function advanceBooking(bookingId: string) {
    if (!schedule) return
    try {
      const next = advanceShopServiceBooking(schedule, bookingId, proof('Advanced by the responsible Shop operator.'))
      const booking = next.bookings.find((candidate) => candidate.id === bookingId)
      commit(next, `${capitalizedSingular} marked ${booking ? statusLabels[booking.status].toLowerCase() : 'updated'}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `The ${vocabulary.singular} could not advance.`)
    }
  }

  function cancelBooking(bookingId: string) {
    if (!schedule) return
    try {
      commit(cancelShopServiceBooking(schedule, bookingId, proof('Cancelled by the responsible Shop operator.')), `${capitalizedSingular} cancelled; the resource is available again.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `The ${vocabulary.singular} could not be cancelled.`)
    }
  }

  function createService(event: FormEvent) {
    event.preventDefault()
    if (!schedule) return
    try {
      const next = registerShopService(schedule, { name: serviceDraft.name, durationMinutes: Number(serviceDraft.durationMinutes), priceMmk: Number(serviceDraft.priceMmk) }, proof('Added from Shop schedule setup.'))
      commit(next, 'Service added to schedule setup.')
      const serviceId = next.services.at(-1)?.id ?? bookingDraft.serviceId
      setBookingDraft((current) => ({ ...current, serviceId }))
      setServiceDraft({ name: '', durationMinutes: '60', priceMmk: '' })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The service could not be added.')
    }
  }

  function createResource(event: FormEvent) {
    event.preventDefault()
    if (!schedule) return
    try {
      const next = registerShopServiceResource(schedule, resourceDraft, proof('Added from Shop schedule setup.'))
      commit(next, 'Staff or resource added to schedule setup.')
      const resourceId = next.resources.at(-1)?.id ?? bookingDraft.resourceId
      setBookingDraft((current) => ({ ...current, resourceId }))
      setResourceDraft({ name: '', kind: 'staff' })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The resource could not be added.')
    }
  }

  if (!schedule || !projection) return <section className="core-panel shop-service-schedule" id="shop-service-schedule"><div className="panel-head"><div><span className="core-eyebrow">Schedule</span><h2>Schedule needs recovery</h2></div></div><p className="form-notice" role="alert">{notice}</p></section>

  const serviceById = new Map(schedule.services.map((service) => [service.id, service]))
  const resourceById = new Map(schedule.resources.map((resource) => [resource.id, resource]))
  // A guided sample seeds its bookings at fixed times of day, so setting up
  // during the evening leaves nothing ending in the future and the agenda would
  // read as empty moments after provisioning promised a working day. Fall back
  // to what the day actually held rather than claiming there is nothing.
  const agenda = projection.upcoming.length ? projection.upcoming : projection.today
  return <details className="core-panel shop-service-schedule" id="shop-service-schedule" onToggle={(event) => setWorkspaceOpen(event.currentTarget.open)} open={workspaceOpen} ref={schedulePanelRef}>
    <summary><span><small>{vocabulary.plural}</small><strong>{projection.today.length ? `${projection.today.length} today` : 'Schedule services'}</strong></span><span>{projection.awaitingArrival} waiting · {projection.inService} in service</span></summary>
    <div className="service-schedule-body">
      <div className="service-schedule-summary" aria-label={`${vocabulary.plural} summary`}>
        <span><small>Today</small><strong>{projection.today.length}</strong></span>
        <span><small>Expected</small><strong>{formatMmk(projection.expectedRevenueMmk)}</strong></span>
        <span><small>Services</small><strong>{projection.activeServices}</strong></span>
        <span><small>Staff / rooms</small><strong>{projection.activeResources}</strong></span>
      </div>
      <form className="service-booking-form" onSubmit={createBooking}>
        <div><span className="core-eyebrow">New {vocabulary.singular}</span><h3>{vocabulary.holdAction}</h3><p>Shop blocks overlapping bookings for the same staff member, room, or equipment.</p></div>
        <label>Customer<input disabled={disabled} maxLength={160} onChange={(event) => setBookingDraft((current) => ({ ...current, customerName: event.target.value }))} placeholder="Customer name" required value={bookingDraft.customerName} /></label>
        <label>Contact<input disabled={disabled} maxLength={160} onChange={(event) => setBookingDraft((current) => ({ ...current, contact: event.target.value }))} placeholder="Phone or reference" required value={bookingDraft.contact} /></label>
        <label>Service<select disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, serviceId: event.target.value }))} required value={bookingDraft.serviceId}>{schedule.services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.nameMy ? `${service.name} · ${service.nameMy}` : service.name} · {service.durationMinutes} min · {formatMmk(service.priceMmk)}</option>)}</select></label>
        <label>Staff, room, or equipment<select disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, resourceId: event.target.value }))} required value={bookingDraft.resourceId}>{schedule.resources.filter((resource) => resource.active).map((resource) => <option key={resource.id} value={resource.id}>{resource.nameMy ? `${resource.name} · ${resource.nameMy}` : resource.name} · {resource.kind}</option>)}</select></label>
        <label>Starts<input disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, startsAt: event.target.value }))} required type="datetime-local" value={bookingDraft.startsAt} /></label>
        <label>Note<input disabled={disabled} maxLength={300} onChange={(event) => setBookingDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Optional request" value={bookingDraft.note} /></label>
        <button className="core-button primary" disabled={disabled} type="submit">{vocabulary.holdAction}</button>
      </form>
      <section className="service-agenda" aria-label={`Upcoming ${vocabulary.plural.toLowerCase()}`}>
        <div className="panel-head"><div><span className="core-eyebrow">Agenda</span><h3>{projection.upcoming.length ? `Next ${vocabulary.plural.toLowerCase()}` : agenda.length ? `Today's ${vocabulary.plural.toLowerCase()}` : `No upcoming ${vocabulary.plural.toLowerCase()}`}</h3></div></div>
        {agenda.length ? agenda.slice(0, 12).map((booking) => {
          const service = serviceById.get(booking.serviceId)
          const resource = resourceById.get(booking.resourceId)
          return <article key={booking.id}>
            <time dateTime={booking.startsAt}><strong>{new Date(booking.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><small>{new Date(booking.startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></time>
            <div><strong>{booking.customerName}</strong><small>{service?.name} · {resource?.name} · {booking.contact}</small>{booking.note ? <em>{booking.note}</em> : null}</div>
            <div><span className={`status-pill ${booking.status === 'completed' ? 'approved' : booking.status === 'checked_in' ? 'pending' : 'bounded'}`}>{statusLabels[booking.status]}</span>{nextActionLabels[booking.status] ? <button className="core-button compact" disabled={disabled} onClick={() => advanceBooking(booking.id)} type="button">{nextActionLabels[booking.status]}</button> : null}{booking.status !== 'completed' && booking.status !== 'cancelled' ? <button className="text-link danger-text" disabled={disabled} onClick={() => cancelBooking(booking.id)} type="button">Cancel</button> : null}</div>
          </article>
        }) : <p className="form-notice">Hold the first {vocabulary.singular} above. Nothing is sent to the customer or an external calendar.</p>}
      </section>
      <details className="compact-disclosure service-schedule-setup">
        <summary><span>Services and resources</span><small>{schedule.services.length} services · {schedule.resources.length} resources</small></summary>
        <div>
          <form onSubmit={createService}><strong>Add service</strong><label>Name<input disabled={disabled} maxLength={160} onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Massage, class, consultation" required value={serviceDraft.name} /></label><label>Minutes<input disabled={disabled} max={1440} min={1} onChange={(event) => setServiceDraft((current) => ({ ...current, durationMinutes: event.target.value }))} required type="number" value={serviceDraft.durationMinutes} /></label><label>Price MMK<input disabled={disabled} min={1} onChange={(event) => setServiceDraft((current) => ({ ...current, priceMmk: event.target.value }))} required type="number" value={serviceDraft.priceMmk} /></label><button className="core-button" disabled={disabled} type="submit">Add service</button></form>
          <form onSubmit={createResource}><strong>Add staff or resource</strong><label>Name<input disabled={disabled} maxLength={160} onChange={(event) => setResourceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Staff name or Room 2" required value={resourceDraft.name} /></label><label>Type<select disabled={disabled} onChange={(event) => setResourceDraft((current) => ({ ...current, kind: event.target.value as typeof resourceDraft.kind }))} value={resourceDraft.kind}><option value="staff">Staff</option><option value="room">Room</option><option value="equipment">Equipment</option></select></label><button className="core-button" disabled={disabled} type="submit">Add resource</button></form>
        </div>
      </details>
      <p className="form-notice" aria-live="polite">{notice || (managedConnected ? `${vocabulary.plural} persist in this company account. Customer messages, calendar sync, and payment remain separate human-approved actions.` : `${vocabulary.plural} persist on this device. Sign in to share them with a company account.`)}</p>
    </div>
  </details>
}
