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
      ? 'Escalate top quality incidents to director review this week.'
      : 'Keep current quality cadence and close low-severity backlog.',
  )
  actions.push(
    openActions >= 10
      ? 'Enforce owner and due-date closure on overdue action items.'
      : 'Maintain action cadence and closure evidence quality.',
  )
  if (risk === 'high') {
    actions.push('Run supplier and logistics contingency check before next production window.')
  } else if (risk === 'medium') {
    actions.push('Watch supplier and fuel updates daily and refresh plan on disruption.')
  } else {
    actions.push('No major disruption signal. Keep regular monitoring cadence.')
  }
  return actions
}

function analyzeSupplierEmail(text: string): SupplierSnapshot {
  const normalized = text.toLowerCase()
  const findings: string[] = []
  let score = 0

  if (/(overdue|payment|remittance|invoice past due)/.test(normalized)) {
    score += 3
    findings.push('Payment risk detected')
  }
  if (/(shipment|delay|eta|customs|clearance|port)/.test(normalized)) {
    score += 3
    findings.push('Logistics risk detected')
  }
  if (/(defect|claim|quality|reject|nonconformance)/.test(normalized)) {
    score += 3
    findings.push('Quality risk detected')
  }
  if (/(missing docs|document|pi revision|passport copy)/.test(normalized)) {
    score += 2
    findings.push('Documentation mismatch risk detected')
  }

  const risk = score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low'
  const actions =
    risk === 'high'
      ? [
          'Escalate to procurement lead today.',
          'Confirm supplier commitment in writing within 24h.',
          'Prepare alternate supplier or contingency stock.',
        ]
      : risk === 'medium'
        ? [
            'Assign owner and due date for supplier follow-up.',
            'Validate documents and ETA with supplier.',
            'Track in weekly supplier review.',
          ]
        : ['Log for monitoring.', 'Keep supplier follow-up in routine cycle.']

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
      'Containment: isolate affected batch and stop further release.',
      'Root cause: confirm issue source with supplier and receiving records.',
      'Corrective action: define fix owner and deadline.',
      'Verification: record closure evidence and sign-off.',
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

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Free Prototypes"
        title="Use full working prototypes in your browser."
        description="Test behavior now. Then we connect the same modules to your real data."
      />

      <section className="grid gap-3 md:grid-cols-3">
        {trialModules.map((module) => (
          <button
            className={`rounded-2xl border px-4 py-4 text-left transition ${
              activeTab === module.id
                ? 'border-[var(--sm-accent)] bg-[var(--sm-paper)] shadow-[0_16px_36px_-30px_rgba(13,110,112,0.75)]'
                : 'border-[var(--sm-line)] bg-white/90 hover:bg-[var(--sm-paper)]'
            }`}
            key={module.id}
            onClick={() => setActiveTab(module.id)}
            type="button"
          >
            <p className="text-sm font-bold text-[var(--sm-ink)]">{module.name}</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">{module.promise}</p>
          </button>
        ))}
      </section>

      {activeTab === 'brief' ? (
        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Executive Brief Agent</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Set key numbers and generate leadership actions.</p>
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
                Run Prototype
              </button>
            </div>
          </article>
          <article className="rounded-3xl border border-[#184a4a] bg-[#112d31] p-6 text-white">
            <h3 className="text-lg font-bold">Generated Director Brief</h3>
            <p className="mt-3 text-sm text-slate-200">
              Incidents: {briefSnapshot.incidentCount} | Open actions: {briefSnapshot.openActions} | External risk: {briefSnapshot.risk}
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
          <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Supplier Control Agent</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste one supplier message for risk score and actions.</p>
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
              Run Prototype
            </button>
          </article>
          <article className="rounded-3xl border border-[#184a4a] bg-[#112d31] p-6 text-white">
            <h3 className="text-lg font-bold">Analysis Output</h3>
            <p className="mt-3 text-sm text-slate-200">
              Risk: <strong>{supplierSnapshot.risk.toUpperCase()}</strong> | Score: {supplierSnapshot.score}
            </p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Findings</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-100">
              {(supplierSnapshot.findings.length ? supplierSnapshot.findings : ['No critical risk keywords detected.']).map((finding) => (
                <li className="rounded-xl border border-white/15 bg-white/5 px-3 py-2" key={finding}>
                  {finding}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Recommended actions</p>
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
          <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Quality CAPA Agent</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Turn one issue into incident and CAPA plan.</p>
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
                Run Prototype
              </button>
            </div>
          </article>
          <article className="rounded-3xl border border-[#184a4a] bg-[#112d31] p-6 text-white">
            <h3 className="text-lg font-bold">Generated Output</h3>
            <p className="mt-3 text-sm text-slate-200">Incident ID: {qualitySnapshot.incidentId}</p>
            <p className="mt-1 text-sm text-slate-200">Supplier: {qualitySnapshot.supplier}</p>
            <p className="mt-1 text-sm text-slate-200">Severity: {qualitySnapshot.severity}</p>
            <p className="mt-3 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-slate-100">{qualitySnapshot.issue}</p>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">CAPA chain</p>
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

      <section className="rounded-3xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-6">
        <h2 className="text-xl font-bold text-[var(--sm-ink)]">Want these modules on your own data?</h2>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          Start a 14-day pilot and we connect these same prototypes to your real files, inbox, and operating process.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-[var(--sm-accent-alt)] px-5 py-3 text-sm font-bold text-white hover:bg-[#b84d1d]"
            to="/contact?intent=pilot"
          >
            Start 14-Day Pilot
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

