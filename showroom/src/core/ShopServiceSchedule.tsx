import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'

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
  anonymizeShopServiceClient,
  cancelShopServiceBooking,
  mutateShopServiceSchedule,
  planShopServiceScheduleWrite,
  projectShopServiceSchedule,
  readShopServiceSchedule,
  recordShopServiceClientExport,
  registerShopService,
  registerShopServiceResource,
  scheduleShopServiceBooking,
  shopScheduleVocabulary,
  shopServiceSaleSku,
  setShopServiceClientRetention,
  shopServiceClientAnonymizationReadiness,
  shopServiceClientCsv,
  type ShopServiceBookingStatus,
  type ShopServiceSchedule,
} from './shop-service-scheduling'
import {
  availableSpaMembershipForBooking,
  redeemSpaMembershipSession,
  spaMembershipBalances,
  type SpaMembershipCommerceView,
} from './shop-spa-membership'

const emptyMembershipCommerce: SpaMembershipCommerceView = { orders: [] }

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

export function ShopServiceSchedule({ actor = 'Local Shop operator', commerce = emptyMembershipCommerce, disabled: externallyDisabled = false, initiallyOpen = false, onScheduleChange }: {
  actor?: string
  commerce?: SpaMembershipCommerceView
  disabled?: boolean
  initiallyOpen?: boolean
  onScheduleChange?: (schedule: ShopServiceSchedule) => void
}) {
  const [initial] = useState(initialSchedule)
  const [schedule, setScheduleState] = useState<ShopServiceSchedule | null>(initial.schedule)
  // Every path that changes the book goes through here, so an observer -- today, the close
  // screen's "completed but not rung up" list -- cannot miss a completion. Notifying is
  // strictly read-only: observers receive the book, they do not get to change it.
  function setSchedule(next: ShopServiceSchedule) {
    setScheduleState(next)
    onScheduleChange?.(next)
  }
  const [notice, setNotice] = useState(initial.error)
  const [workspaceOpen, setWorkspaceOpen] = useState(initiallyOpen)
  const [bookingDraft, setBookingDraft] = useState({ customerName: '', contact: '', appointmentUpdates: 'declined' as 'allowed' | 'declined', serviceId: initial.schedule?.services[0]?.id ?? '', resourceId: initial.schedule?.resources[0]?.id ?? '', startsAt: nextLocalStart(), note: '' })
  const [serviceDraft, setServiceDraft] = useState({ name: '', durationMinutes: '60', priceMmk: '' })
  const [resourceDraft, setResourceDraft] = useState({ name: '', kind: 'staff' as 'staff' | 'room' | 'equipment' })
  const [retentionDraft, setRetentionDraft] = useState(initial.schedule?.privacyPolicy.clientRetentionDays?.toString() ?? '')
  const [anonymizeReviewClientId, setAnonymizeReviewClientId] = useState('')
  const [managedLoading, setManagedLoading] = useState(true)
  const [managedSaving, setManagedSaving] = useState(false)
  const [managedConnected, setManagedConnected] = useState(false)
  const [managedPrivacyOwner, setManagedPrivacyOwner] = useState(false)
  const managedIdentityRef = useRef<ManagedIdentity | null>(null)
  const managedVersionRef = useRef<number | null>(null)
  const managedSaveBusyRef = useRef(false)
  const schedulePanelRef = useRef<HTMLDetailsElement>(null)
  const projection = useMemo(() => schedule ? projectShopServiceSchedule(schedule) : null, [schedule])
  const membershipBalances = useMemo(() => schedule ? spaMembershipBalances(commerce, schedule) : [], [commerce, schedule])
  const settledSourceRecordIds = useMemo(() => new Set(commerce.orders.flatMap((order) => order.sourceRecordId && order.status === 'completed' && order.paymentStatus === 'reconciled' && order.refundStatus !== 'due' ? [order.sourceRecordId] : [])), [commerce])
  const membershipByBookingId = useMemo(() => {
    if (!schedule || !membershipBalances.length) return new Map<string, (typeof membershipBalances)[number]>()
    const balancesByCustomerService = new Map(membershipBalances.map((balance) => [`${balance.customer}\u0000${balance.serviceId}`, balance]))
    const redeemedBookingIds = new Set(schedule.events.filter((event) => event.type === 'package_redeemed').map((event) => event.subjectId))
    return new Map(schedule.bookings.flatMap((booking) => {
      const balance = balancesByCustomerService.get(`${booking.customerName.trim()}\u0000${booking.serviceId}`)
      return booking.status === 'completed' && !redeemedBookingIds.has(booking.id) && balance && balance.remaining > 0 ? [[booking.id, balance] as const] : []
    }))
  }, [membershipBalances, schedule])
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
      setManagedPrivacyOwner(Boolean(managed.privacyOwner))
      if (managed.schedule) {
        setSchedule(managed.schedule)
        setRetentionDraft(managed.schedule.privacyPolicy.clientRetentionDays?.toString() ?? '')
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

  // Used only where a managed server copy is already authoritative and a failed
  // local write is survivable. Owner-originated changes go through commit().
  function persistLocal(next: ShopServiceSchedule) {
    window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(next))
  }

  function commit(next: ShopServiceSchedule, message: string) {
    const baseRevision = schedule?.revision ?? null
    setSchedule(next)
    // The book is written under an exclusive lock, validated, and read back, so
    // a quota or private-mode rejection can no longer look like a saved booking.
    void mutateShopServiceSchedule(planShopServiceScheduleWrite(baseRevision, next))
      .then((result) => {
        if (result.ok) {
          setNotice(message)
          return
        }
        // The refused change already advanced the on-screen book, so put the
        // stored truth back. Without this the guard only survives ONE
        // collision: the phantom revision would match storage by coincidence on
        // the next change, and that change would overwrite the other tab's book
        // exactly as if no guard existed.
        try {
          setSchedule(readShopServiceSchedule(window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)))
        } catch {
          // Storage is unreadable; the notice already tells them to reload, and
          // showing a stale book is better than showing none.
        }
        setNotice(`${result.error} The schedule below was reloaded from this device.`)
      })
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

  async function commitPrivacy(next: ShopServiceSchedule, message: string) {
    const identity = managedIdentityRef.current
    if (!identity) {
      const result = await mutateShopServiceSchedule(planShopServiceScheduleWrite(schedule?.revision ?? null, next))
      if (!result.ok) {
        setNotice(result.error)
        return false
      }
      setSchedule(result.schedule)
      setNotice(message)
      return true
    }
    const expectedVersion = managedVersionRef.current
    if (expectedVersion === null || managedSaveBusyRef.current) {
      setNotice(`Wait for the current company ${vocabulary.singular} change to finish.`)
      return false
    }
    managedSaveBusyRef.current = true
    setManagedSaving(true)
    try {
      const saved = await saveManagedServiceSchedule({
        commandId: crypto.randomUUID(),
        expectedVersion,
        identity,
        schedule: next,
      })
      managedVersionRef.current = saved.version
      if (saved.schedule) {
        setSchedule(saved.schedule)
        setRetentionDraft(saved.schedule.privacyPolicy.clientRetentionDays?.toString() ?? '')
        try { persistLocal(saved.schedule) } catch { /* The managed copy remains authoritative. */ }
      }
      setNotice(`${message} Shared company schedule saved.`)
      return true
    } catch (error) {
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const current = await loadManagedServiceSchedule(identity)
          managedVersionRef.current = current.version
          setManagedPrivacyOwner(Boolean(current.privacyOwner))
          if (current.schedule) {
            setSchedule(current.schedule)
            setRetentionDraft(current.schedule.privacyPolicy.clientRetentionDays?.toString() ?? '')
            try { persistLocal(current.schedule) } catch { /* The managed copy remains authoritative. */ }
          }
          setNotice(`Another user changed ${vocabulary.plural.toLowerCase()} first. The current shared schedule was reloaded; review and try again.`)
          return false
        } catch {
          // Fall through to a fail-closed warning.
        }
      }
      setNotice(`${error instanceof Error ? error.message : 'Managed save failed.'} Nothing was changed or downloaded.`)
      return false
    } finally {
      managedSaveBusyRef.current = false
      setManagedSaving(false)
    }
  }

  async function downloadClientList() {
    if (!schedule || (managedConnected && !managedPrivacyOwner)) return
    if (!globalThis.crypto?.subtle) {
      setNotice('Secure export evidence is unavailable in this browser. No file was downloaded.')
      return
    }
    try {
      const csv = shopServiceClientCsv(schedule)
      const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(csv)))
      const digest = `sha256:${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
      const next = recordShopServiceClientExport(schedule, digest, proof('Owner downloaded the privacy-minimal client list.'))
      if (!await commitPrivacy(next, 'Client export receipt recorded.')) return
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'spa-clients.csv'
      link.click()
      URL.revokeObjectURL(url)
      setNotice('Client list downloaded with an attributable receipt. Notes and payment details were excluded.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The client export was not created.')
    }
  }

  async function saveClientRetention(event: FormEvent) {
    event.preventDefault()
    if (!schedule || (managedConnected && !managedPrivacyOwner)) return
    try {
      const days = Number(retentionDraft)
      const next = setShopServiceClientRetention(schedule, days, proof(`Owner approved a ${days}-day client retention period.`))
      if (await commitPrivacy(next, `Client retention set to ${days} days.`)) setAnonymizeReviewClientId('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The client retention rule was not saved.')
    }
  }

  async function confirmClientAnonymization() {
    if (!schedule || (managedConnected && !managedPrivacyOwner) || !anonymizeReviewClientId) return
    try {
      const client = schedule.clients.find((candidate) => candidate.id === anonymizeReviewClientId)
      if (!client) throw new Error('Client record not found.')
      const next = anonymizeShopServiceClient(
        schedule,
        client.id,
        Array.from(settledSourceRecordIds),
        proof('Owner reviewed and confirmed client anonymization after retention and financial closure.'),
      )
      if (await commitPrivacy(next, `${client.name} anonymized in ${vocabulary.plural.toLowerCase()}.`)) setAnonymizeReviewClientId('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The client was not anonymized.')
    }
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

  function redeemPackage(bookingId: string) {
    if (!schedule) return
    try {
      const available = availableSpaMembershipForBooking(commerce, schedule, bookingId)
      const next = redeemSpaMembershipSession(schedule, commerce, bookingId, proof('Used after the completed treatment was checked by the responsible Spa operator.'))
      if (next === schedule) {
        setNotice(`This ${vocabulary.singular} already used its package session.`)
        return
      }
      const remaining = Math.max(0, (available?.remaining ?? 1) - 1)
      commit(next, `Package session used · ${remaining} left.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The package session could not be used.')
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
  const canManageClientPrivacy = !managedConnected || managedPrivacyOwner
  const settledSources = Array.from(settledSourceRecordIds)
  const clientPrivacyRows = schedule.clients.map((client) => ({
    client,
    readiness: shopServiceClientAnonymizationReadiness(schedule, client.id, settledSources),
  }))
  const anonymizeReviewClient = schedule.clients.find((client) => client.id === anonymizeReviewClientId) ?? null
  return <details className="core-panel shop-service-schedule" id="shop-service-schedule" onToggle={(event) => setWorkspaceOpen(event.currentTarget.open)} open={workspaceOpen} ref={schedulePanelRef}>
    <summary><span><small>{vocabulary.plural}</small><strong>{projection.today.length ? `${projection.today.length} today` : 'Schedule services'}</strong></span><span>{projection.awaitingArrival} waiting · {projection.inService} in service</span></summary>
    <div className="service-schedule-body">
      <div className="service-schedule-summary" aria-label={`${vocabulary.plural} summary`}>
        <span><small>Today</small><strong>{projection.today.length}</strong></span>
        <span><small>Expected</small><strong>{formatMmk(projection.expectedRevenueMmk)}</strong></span>
        <span><small>Clients</small><strong>{projection.clients}</strong></span>
        <span><small>Staff / rooms</small><strong>{projection.activeResources}</strong></span>
      </div>
      {schedule.industryPackId === 'spa' && membershipBalances.length ? <div className="service-schedule-summary" aria-label="Prepaid package summary">
        <span><small>Package customers</small><strong>{new Set(membershipBalances.map((balance) => balance.customer)).size}</strong></span>
        <span><small>Sessions left</small><strong>{membershipBalances.reduce((total, balance) => total + balance.remaining, 0)}</strong></span>
        <span><small>Sessions used</small><strong>{membershipBalances.reduce((total, balance) => total + balance.redeemed, 0)}</strong></span>
      </div> : null}
      <form className="service-booking-form" onSubmit={createBooking}>
        <div><span className="core-eyebrow">New {vocabulary.singular}</span><h3>{vocabulary.holdAction}</h3><p>Shop blocks overlapping bookings for the same staff member, room, or equipment.</p></div>
        <label>Customer<input disabled={disabled} maxLength={160} onChange={(event) => setBookingDraft((current) => ({ ...current, customerName: event.target.value }))} placeholder="Customer name" required value={bookingDraft.customerName} /></label>
        <label>Contact or client reference *<input disabled={disabled} list="spa-client-contacts" maxLength={160} onChange={(event) => { const contact = event.target.value; const client = schedule.clients.find((candidate) => !candidate.anonymizedAt && candidate.contact === contact); setBookingDraft((current) => ({ ...current, contact, customerName: client?.name ?? current.customerName, appointmentUpdates: client?.appointmentUpdates === 'allowed' ? 'allowed' : 'declined' })) }} placeholder="Phone or walk-in reference" required value={bookingDraft.contact} /><small>Required to distinguish client records. Use a non-contact reference when updates are off.</small><datalist id="spa-client-contacts">{schedule.clients.filter((client) => !client.anonymizedAt).map((client) => <option key={client.id} value={client.contact}>{client.name}</option>)}</datalist></label>
        <label>Customer updates<select disabled={disabled} onChange={(event) => setBookingDraft((current) => ({ ...current, appointmentUpdates: event.target.value as 'allowed' | 'declined' }))} value={bookingDraft.appointmentUpdates}><option value="declined">No messages</option><option value="allowed">Customer allowed updates</option></select></label>
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
          const saleSku = shopServiceSaleSku(schedule.industryPackId, booking.serviceId)
          const membership = membershipByBookingId.get(booking.id)
          return <article key={booking.id}>
            <time dateTime={booking.startsAt}><strong>{new Date(booking.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><small>{new Date(booking.startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></time>
            <div><strong>{booking.customerName}</strong><small>{service?.name} · {resource?.name} · {booking.contact}</small>{booking.note ? <em>{booking.note}</em> : null}</div>
            <div><span className={`status-pill ${booking.status === 'completed' ? 'approved' : booking.status === 'checked_in' ? 'pending' : 'bounded'}`}>{statusLabels[booking.status]}</span>{membership ? <button className="core-button compact" disabled={disabled} onClick={() => redeemPackage(booking.id)} type="button">Use package · {membership.remaining} left</button> : null}{booking.status === 'checked_in' && saleSku ? <Link className="core-button compact" state={{ shopCounterCustomer: booking.customerName, shopCounterSearch: saleSku }} to="/shop/?tab=counter">Charge at counter</Link> : null}{nextActionLabels[booking.status] ? <button className="core-button compact" disabled={disabled} onClick={() => advanceBooking(booking.id)} type="button">{nextActionLabels[booking.status]}</button> : null}{booking.status !== 'completed' && booking.status !== 'cancelled' ? <button className="text-link danger-text" disabled={disabled} onClick={() => cancelBooking(booking.id)} type="button">Cancel</button> : null}</div>
          </article>
        }) : <p className="form-notice">Hold the first {vocabulary.singular} above. Nothing is sent to the customer or an external calendar.</p>}
      </section>
      {schedule.clients.length ? <details className="compact-disclosure service-client-privacy">
        <summary><span>Clients and privacy</span><small>{schedule.clients.length} minimal records</small></summary>
        <div>
          <p>Name, contact, customer-update choice, and visit counts only. Notes and financial records are excluded from export.</p>
          {canManageClientPrivacy ? <>
            <form className="service-privacy-policy" onSubmit={saveClientRetention}>
              <label>Keep identifiable records after the last activity<select disabled={disabled} onChange={(event) => setRetentionDraft(event.target.value)} required value={retentionDraft}><option value="">Choose an owner-approved period</option><option value="365">1 year</option><option value="730">2 years</option><option value="1095">3 years</option><option value="1825">5 years</option></select></label>
              <button className="core-button compact" disabled={disabled || !retentionDraft} type="submit">Save retention rule</button>
            </form>
            <div className="service-privacy-actions"><button className="core-button compact" disabled={disabled} onClick={() => void downloadClientList()} type="button">Download client list</button><small>The export receipt is saved before the file is created.</small></div>
            <div className="service-client-list">{clientPrivacyRows.map(({ client, readiness }) => <article key={client.id}><div><strong>{client.name}</strong><small>{client.anonymizedAt ? `Anonymized ${new Date(client.anonymizedAt).toLocaleDateString()}` : `${client.contact} · ${client.appointmentUpdates === 'allowed' ? 'Updates allowed' : 'No messages'}`}</small></div><div><small>{readiness.reason}</small>{!client.anonymizedAt ? <button className="text-link" disabled={disabled || !readiness.allowed} onClick={() => setAnonymizeReviewClientId(client.id)} type="button">Review anonymization</button> : null}</div></article>)}</div>
            {anonymizeReviewClient ? <div className="service-privacy-review" role="alert"><strong>Review permanent anonymization</strong><p>Remove {anonymizeReviewClient.name}'s contact, update choice, and visit notes. Closed financial orders remain unchanged.</p><div><button className="core-button compact danger" disabled={disabled} onClick={() => void confirmClientAnonymization()} type="button">Confirm anonymization</button><button className="text-link" disabled={disabled} onClick={() => setAnonymizeReviewClientId('')} type="button">Cancel</button></div></div> : null}
          </> : <p className="panel-note">Only a company owner can set retention, export clients, or approve anonymization.</p>}
        </div>
      </details> : null}
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
