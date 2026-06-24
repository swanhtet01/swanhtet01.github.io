import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { loadClientRoom, type ClientRoomPayload } from '../lib/clientRoomApi'

const fallbackRoomMetrics = [
  { label: 'Open requests', value: '4', detail: 'waiting for source or owner' },
  { label: 'Decisions', value: '3', detail: 'need approval this week' },
  { label: 'Tasks due', value: '6', detail: 'assigned with proof' },
  { label: 'Next handoff', value: 'Today', detail: '4:30 pm owner review' },
] as const

const fallbackPeople = [
  { role: 'Client owner', name: 'Owner', focus: 'Approves scope, payment, and final decisions.', state: 'Reviewing' },
  { role: 'Operations lead', name: 'Manager', focus: 'Confirms daily work, blockers, and handoff notes.', state: 'Active' },
  { role: 'SuperMega lead', name: 'Delivery', focus: 'Builds the first useful screen and keeps proof attached.', state: 'On it' },
  { role: 'Finance / QA', name: 'Reviewer', focus: 'Checks billing, access, and release evidence before go-live.', state: 'Ready' },
] as const

const fallbackSourceRequests = [
  { title: 'Current workflow sample', owner: 'Manager', status: 'Needed', detail: 'One sheet, folder, screenshot, PDF, or email thread.' },
  { title: 'User list and roles', owner: 'Owner', status: 'Ready', detail: 'Who can view, edit, approve, and admin the first module.' },
  { title: 'Payment or quote approval', owner: 'Owner', status: 'Review', detail: 'Quote-led setup before billing or private account activation.' },
] as const

const fallbackDecisions = [
  { title: 'First module', decision: 'Document Extraction Ledger first, then more workflow desk modules only after usage proof.', state: 'Approved' },
  { title: 'Data scope', decision: 'Use sample data until source owner approves real files.', state: 'Safe' },
  { title: 'Go-live gate', decision: 'Mobile, auth, route, and proof checks must pass before sharing.', state: 'Pending' },
] as const

const fallbackHandoff = [
  'Client sends one source sample and names the decision owner.',
  'SuperMega turns it into a first work packet with source, owner, status, and next action.',
  'Owner reviews the packet, approves scope, and opens the first private app.',
  'Release gate checks access, mobile layout, route health, and billing readiness.',
] as const

export function ClientRoomPage() {
  const [payload, setPayload] = useState<ClientRoomPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadClientRoom()
      .then((result) => {
        if (!cancelled) {
          setPayload(result)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPayload({ status: 'demo', source: 'demo' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const roomMetrics = payload?.metrics?.length ? payload.metrics : fallbackRoomMetrics
  const people = payload?.people?.length ? payload.people : fallbackPeople
  const sourceRequests = payload?.source_requests?.length ? payload.source_requests : fallbackSourceRequests
  const decisions = payload?.decisions?.length ? payload.decisions : fallbackDecisions
  const handoff = payload?.handoff?.length ? payload.handoff : fallbackHandoff
  const sourceLabel = payload?.source === 'live' ? 'Live account' : 'Sample records'

  return (
    <div className="sm-client-room sm-start-shell">
      <section className="sm-start-hero sm-client-room-hero">
        <div className="sm-start-copy">
          <div className="flex flex-wrap gap-2">
            <span className="sm-status-pill">Shared module</span>
            <span className="sm-status-pill">Included in every client account</span>
            <span className="sm-status-pill">{sourceLabel}</span>
          </div>
          <h1>Client Room.</h1>
          <p>People, sources, decisions, tasks, and handoff in one simple account.</p>
        </div>
        <Link className="sm-start-primary-card" to="/app/documents">
          <span>First workflow</span>
          <strong>Open the desk</strong>
          <p>Start from one painful workflow, then add modules only after the first packet is useful.</p>
          <em>Open</em>
        </Link>
      </section>

      <section className="sm-client-room-metrics" aria-label="Client room status">
        {roomMetrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="sm-client-room-grid" aria-label="Client collaboration room">
        <article className="sm-client-room-panel">
          <div>
            <span className="sm-client-room-kicker">People</span>
            <h2>Who owns what</h2>
          </div>
          <div className="sm-client-room-list">
            {people.map((item) => (
              <div className="sm-client-room-row" key={item.role}>
                <div>
                  <strong>{item.role}</strong>
                  <p>{item.focus}</p>
                </div>
                <span>{item.state}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-client-room-panel">
          <div>
            <span className="sm-client-room-kicker">Sources</span>
            <h2>What we need next</h2>
          </div>
          <div className="sm-client-room-list">
            {sourceRequests.map((item) => (
              <div className="sm-client-room-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>{item.owner}</small>
                </div>
                <span>{item.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-client-room-panel">
          <div>
            <span className="sm-client-room-kicker">Decisions</span>
            <h2>Approved or waiting</h2>
          </div>
          <div className="sm-client-room-list">
            {decisions.map((item) => (
              <div className="sm-client-room-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.decision}</p>
                </div>
                <span>{item.state}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-client-room-panel sm-client-room-handoff">
        <div>
          <span className="sm-client-room-kicker">Handoff</span>
          <h2>How a client app starts</h2>
        </div>
        <div className="sm-client-room-steps">
          {handoff.map((step, index) => (
            <article key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
