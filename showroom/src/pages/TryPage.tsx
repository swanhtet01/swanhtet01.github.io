import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { trialModules } from '../content'

type TrialTab = 'brief' | 'supplier' | 'quality'
type BriefRisk = 'low' | 'medium' | 'high'
type QualitySeverity = 'low' | 'medium' | 'high'

type BriefSnapshot = {
  incidentCount: number
  openActions: number
  risk: BriefRisk
  actions: string[]
}

type SupplierSnapshot = {
  score: number
  risk: 'low' | 'medium' | 'high'
  findings: string[]
  actions: string[]
}

type QualitySnapshot = {
  incidentId: string
  supplier: string
  issue: string
  severity: QualitySeverity
  capaPlan: string[]
}

function resolveInitialTab(): TrialTab {
  const hash = window.location.hash.replace('#', '').trim()
  if (hash === 'supplier' || hash === 'quality') {
    return hash
  }
  return 'brief'
}

function buildBriefActions(incidentCount: number, openActions: number, risk: BriefRisk) {
  const actions: string[] = []
  actions.push(
    incidentCount >= 12
      ? 'Escalate top quality issues this week.'
      : 'Keep current quality cadence and close low-severity backlog.',
  )
  actions.push(
    openActions >= 10
      ? 'Enforce owner + due-date closure on overdue actions.'
      : 'Maintain action cadence and closure discipline.',
  )
  if (risk === 'high') {
    actions.push('Run supplier and logistics contingency check now.')
  } else if (risk === 'medium') {
    actions.push('Monitor supplier and fuel changes daily.')
  } else {
    actions.push('No major external disruption signal.')
  }
  return actions
}

function analyzeSupplierEmail(text: string): SupplierSnapshot {
  const normalized = text.toLowerCase()
  const findings: string[] = []
  let score = 0

  if (/(overdue|payment|remittance|invoice past due)/.test(normalized)) {
    score += 3
    findings.push('Payment risk')
  }
  if (/(shipment|delay|eta|customs|clearance|port)/.test(normalized)) {
    score += 3
    findings.push('Logistics risk')
  }
  if (/(defect|claim|quality|reject|nonconformance)/.test(normalized)) {
    score += 3
    findings.push('Quality risk')
  }
  if (/(missing docs|document|pi revision|passport copy)/.test(normalized)) {
    score += 2
    findings.push('Documentation risk')
  }

  const risk = score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low'
  const actions =
    risk === 'high'
      ? [
          'Escalate to procurement lead today.',
          'Confirm supplier commitment in writing.',
          'Prepare backup supplier or stock plan.',
        ]
      : risk === 'medium'
        ? [
            'Assign owner and due date for follow-up.',
            'Validate documents and ETA.',
            'Track in weekly supplier review.',
          ]
        : ['Log and monitor in routine supplier cycle.']

  return { score, risk, findings, actions }
}

function createIncidentId() {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`
  return `INC-${datePart}-${timePart}`
}

function createQualitySnapshot(supplier: string, issue: string, severity: QualitySeverity): QualitySnapshot {
  return {
    incidentId: createIncidentId(),
    supplier,
    issue,
    severity,
    capaPlan: [
      'Containment: isolate affected batch.',
      'Root cause: confirm source with supplier and receiving record.',
      'Corrective action: assign owner and due date.',
      'Verification: attach closure evidence and sign-off.',
    ],
  }
}

export function TryPage() {
  const [activeTab, setActiveTab] = useState<TrialTab>(resolveInitialTab)

  const [incidentCount, setIncidentCount] = useState(14)
  const [openActions, setOpenActions] = useState(11)
  const [briefRisk, setBriefRisk] = useState<BriefRisk>('medium')
  const [briefSnapshot, setBriefSnapshot] = useState<BriefSnapshot>({
    incidentCount: 14,
    openActions: 11,
    risk: 'medium',
    actions: buildBriefActions(14, 11, 'medium'),
  })

  const [supplierText, setSupplierText] = useState(
    'Supplier update: shipment delayed by 5 days due to customs check. Please settle overdue invoice to release next lot.',
  )
  const [supplierSnapshot, setSupplierSnapshot] = useState<SupplierSnapshot>(() =>
    analyzeSupplierEmail(
      'Supplier update: shipment delayed by 5 days due to customs check. Please settle overdue invoice to release next lot.',
    ),
  )

  const [qualitySupplier, setQualitySupplier] = useState('KIIC')
  const [qualityIssue, setQualityIssue] = useState('Bead wire defect found in incoming batch.')
  const [qualitySeverity, setQualitySeverity] = useState<QualitySeverity>('high')
  const [qualitySnapshot, setQualitySnapshot] = useState<QualitySnapshot>(() =>
    createQualitySnapshot('KIIC', 'Bead wire defect found in incoming batch.', 'high'),
  )

  function activateTab(tab: TrialTab) {
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Examples"
        title="3 simple, testable AI agent examples."
        description="Try each one now. If useful, we connect it to your real data in 14 days."
      />

      <section className="grid gap-3 md:grid-cols-3">
        {trialModules.map((module) => (
          <button
            className={`rounded-2xl border px-4 py-4 text-left transition ${
              activeTab === module.id
                ? 'border-[var(--sm-accent)] bg-white/55 shadow-[0_20px_46px_-34px_rgba(13,110,112,0.85)] backdrop-blur-xl'
                : 'border-white/65 bg-white/35 backdrop-blur-xl hover:bg-white/55'
            }`}
            key={module.id}
            onClick={() => activateTab(module.id)}
            type="button"
          >
            <p className="text-sm font-bold text-[var(--sm-ink)]">{module.name}</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">{module.promise}</p>
          </button>
        ))}
      </section>

      {activeTab === 'brief' ? (
        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-3xl border border-white/65 bg-white/45 p-6 backdrop-blur-xl">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Daily Brief Example</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Set basic inputs and generate action points.</p>
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-semibold text-[var(--sm-muted)]">
                Open quality incidents
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2"
                  max={80}
                  min={0}
                  onChange={(event) => setIncidentCount(Number(event.target.value))}
                  type="number"
                  value={incidentCount}
                />
              </label>
              <label className="text-sm font-semibold text-[var(--sm-muted)]">
                Open action items
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2"
                  max={80}
                  min={0}
                  onChange={(event) => setOpenActions(Number(event.target.value))}
                  type="number"
                  value={openActions}
                />
              </label>
              <label className="text-sm font-semibold text-[var(--sm-muted)]">
                External risk level
                <select
                  className="mt-2 w-full rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2"
                  onChange={(event) => setBriefRisk(event.target.value as BriefRisk)}
                  value={briefRisk}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <button
                className="rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]"
                onClick={() =>
                  setBriefSnapshot({
                    incidentCount,
                    openActions,
                    risk: briefRisk,
                    actions: buildBriefActions(incidentCount, openActions, briefRisk),
                  })
                }
                type="button"
              >
                Run Example
              </button>
            </div>
          </article>
          <article className="rounded-3xl border border-white/45 bg-[linear-gradient(135deg,rgba(12,64,76,0.86),rgba(12,42,66,0.88))] p-6 text-white shadow-[0_24px_56px_-35px_rgba(8,23,42,0.95)]">
            <h3 className="text-lg font-bold">Output</h3>
            <p className="mt-3 text-sm text-slate-200">
              Incidents: {briefSnapshot.incidentCount} | Open actions: {briefSnapshot.openActions} | Risk: {briefSnapshot.risk}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-100">
              {briefSnapshot.actions.map((action) => (
                <li className="rounded-xl border border-white/15 bg-white/5 px-3 py-3" key={action}>
                  {action}
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      {activeTab === 'supplier' ? (
        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-3xl border border-white/65 bg-white/45 p-6 backdrop-blur-xl">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Supplier Risk Example</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste one supplier message.</p>
            <textarea
              className="mt-4 min-h-52 w-full rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3 text-sm"
              onChange={(event) => setSupplierText(event.target.value)}
              value={supplierText}
            />
            <button
              className="mt-4 rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]"
              onClick={() => setSupplierSnapshot(analyzeSupplierEmail(supplierText))}
              type="button"
            >
              Run Example
            </button>
          </article>
          <article className="rounded-3xl border border-white/45 bg-[linear-gradient(135deg,rgba(12,64,76,0.86),rgba(12,42,66,0.88))] p-6 text-white shadow-[0_24px_56px_-35px_rgba(8,23,42,0.95)]">
            <h3 className="text-lg font-bold">Output</h3>
            <p className="mt-3 text-sm text-slate-200">
              Risk: <strong>{supplierSnapshot.risk.toUpperCase()}</strong> | Score: {supplierSnapshot.score}
            </p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Findings</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-100">
              {(supplierSnapshot.findings.length ? supplierSnapshot.findings : ['No critical keywords detected']).map((finding) => (
                <li className="rounded-xl border border-white/15 bg-white/5 px-3 py-2" key={finding}>
                  {finding}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Actions</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-100">
              {supplierSnapshot.actions.map((action) => (
                <li className="rounded-xl border border-white/15 bg-white/5 px-3 py-2" key={action}>
                  {action}
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      {activeTab === 'quality' ? (
        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-3xl border border-white/65 bg-white/45 p-6 backdrop-blur-xl">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Quality CAPA Example</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Convert one issue into a CAPA chain.</p>
            <div className="mt-4 grid gap-4">
              <label className="text-sm font-semibold text-[var(--sm-muted)]">
                Supplier
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2"
                  onChange={(event) => setQualitySupplier(event.target.value)}
                  type="text"
                  value={qualitySupplier}
                />
              </label>
              <label className="text-sm font-semibold text-[var(--sm-muted)]">
                Severity
                <select
                  className="mt-2 w-full rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2"
                  onChange={(event) => setQualitySeverity(event.target.value as QualitySeverity)}
                  value={qualitySeverity}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-[var(--sm-muted)]">
                Issue
                <textarea
                  className="mt-2 min-h-28 w-full rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2"
                  onChange={(event) => setQualityIssue(event.target.value)}
                  value={qualityIssue}
                />
              </label>
              <button
                className="rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]"
                onClick={() => setQualitySnapshot(createQualitySnapshot(qualitySupplier, qualityIssue, qualitySeverity))}
                type="button"
              >
                Run Example
              </button>
            </div>
          </article>
          <article className="rounded-3xl border border-white/45 bg-[linear-gradient(135deg,rgba(12,64,76,0.86),rgba(12,42,66,0.88))] p-6 text-white shadow-[0_24px_56px_-35px_rgba(8,23,42,0.95)]">
            <h3 className="text-lg font-bold">Output</h3>
            <p className="mt-3 text-sm text-slate-200">Incident ID: {qualitySnapshot.incidentId}</p>
            <p className="mt-1 text-sm text-slate-200">Supplier: {qualitySnapshot.supplier}</p>
            <p className="mt-1 text-sm text-slate-200">Severity: {qualitySnapshot.severity}</p>
            <p className="mt-3 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-slate-100">{qualitySnapshot.issue}</p>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">CAPA</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-100">
              {qualitySnapshot.capaPlan.map((step) => (
                <li className="rounded-xl border border-white/15 bg-white/5 px-3 py-2" key={step}>
                  {step}
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/65 bg-white/45 p-6 backdrop-blur-xl">
        <h2 className="text-xl font-bold text-[var(--sm-ink)]">Want this on your real data?</h2>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          Start a 14-day pilot. We connect these examples to your files, email, and team workflow.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-[var(--sm-accent-alt)] px-5 py-3 text-sm font-bold text-white hover:bg-[#b84d1d]"
            to="/contact?intent=pilot"
          >
            Start Pilot
          </Link>
          <Link
            className="rounded-full border border-[var(--sm-line)] px-5 py-3 text-sm font-semibold text-[var(--sm-ink)] hover:bg-white/80"
            to="/packages"
          >
            View Pricing
          </Link>
        </div>
      </section>
    </div>
  )
}
