import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type Pilot = {
  id: string
  rank: number
  sourceType?: 'product_suite' | 'fusion_product'
  name: string
  suiteName: string
  stack: string[]
  buyer: string
  clientQuestion: string
  firstWorkflow: string
  proofScript: string
  clientPromise: string
  priceBand: string
  pilotWindow: string
  intakeFields: string[]
  deliverables: string[]
  securityGates: string[]
  ownerApprovalGates: string[]
  evidenceLedger: string[]
  acceptanceChecks: string[]
  nextAgentJobs: string[]
  risk: string
  highRiskRepos: Array<{
    id: string
    name: string
    license: string
    risk: string
    gate: string
  }>
  fusion?: {
    disruptiveUse: string
    sellableOffer: string
    firstProof: string
    guardrail: string
  }
}

type IntegrationStudioPayload = {
  status: string
  generated_at: string
  generated_for: string
  positioning: {
    title: string
    promise: string
    rule: string
  }
  metrics: {
    pilot_count: number
    product_suite_pilot_count?: number
    fusion_pilot_count?: number
    total_repo_count: number
    adopt_now_count: number
    license_review_required_count: number
    acceptance_check_count: number
    next_agent_job_count: number
  }
  operating_model: string[]
  package_ladder: Array<{
    name: string
    price: string
    output: string
  }>
  pilots: Pilot[]
}

function formatNumber(value?: number | null) {
  if (typeof value !== 'number') return '0'
  return value.toLocaleString()
}

function riskLabel(value: string) {
  if (value === 'license_review_required') return 'License review'
  return 'Sandbox ready'
}

function riskTone(value: string) {
  if (value === 'license_review_required') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-emerald-200 bg-emerald-50 text-emerald-800'
}

function sourceTone(value?: Pilot['sourceType']) {
  if (value === 'fusion_product') return 'border-sky-200 bg-sky-50 text-sky-800'
  return 'border-emerald-200 bg-emerald-50 text-emerald-800'
}

function sourceLabel(value?: Pilot['sourceType']) {
  if (value === 'fusion_product') return 'fusion'
  return 'suite'
}

function checklist(items: string[], className = '') {
  return (
    <div className={`grid gap-2 ${className}`.trim()}>
      {items.map((item) => (
        <div className="rounded-2xl border border-slate-200 bg-white/72 px-3 py-2 text-sm font-bold leading-5 text-[var(--sm-ink)]" key={item}>
          {item}
        </div>
      ))}
    </div>
  )
}

export function IntegrationStudioPage() {
  const [studio, setStudio] = useState<IntegrationStudioPayload | null>(null)
  const [selectedPilotId, setSelectedPilotId] = useState('agentic-workflow-studio')

  useEffect(() => {
    let cancelled = false

    async function loadStudio() {
      try {
        const response = await fetch('/site/open-source-integration-studio.json', { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as IntegrationStudioPayload
        if (!cancelled) {
          setStudio(payload)
          setSelectedPilotId((current) => current || payload.pilots[0]?.id || '')
        }
      } catch {
        if (!cancelled) {
          setStudio(null)
        }
      }
    }

    void loadStudio()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedPilot = useMemo(
    () => studio?.pilots.find((pilot) => pilot.id === selectedPilotId) ?? studio?.pilots[0] ?? null,
    [studio, selectedPilotId],
  )

  return (
    <div className="grid gap-6 pb-28">
      <section className="sm-calm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 md:p-8">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Integration Studio</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.05em] text-[var(--sm-ink)] md:text-6xl">
              Turn tools into paid client pilots.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--sm-muted)]">
              Use this to convert n8n, Browser Use, OpenHands, OpenClaw, Dify, Langflow, LlamaIndex, and similar tools into one scoped client
              workflow with license review, evidence, approval gates, and a paid next step.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/open-source-radar">
                Open radar
              </Link>
              <Link className="sm-button-secondary" to="/app/revenue/offers">
                Package offer
              </Link>
              <a className="sm-button-secondary" href="/site/open-source-integration-studio.json" rel="noreferrer" target="_blank">
                Open JSON
              </a>
            </div>
          </div>
          <div className="border-t border-slate-200 bg-[#e8efe8] p-6 md:p-8 xl:border-l xl:border-t-0">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-muted)]">Rule</p>
            <p className="mt-3 text-xl font-black leading-tight text-[var(--sm-ink)]">
              {studio?.positioning.rule ?? 'Use open-source tools internally, but sell the SuperMega workflow, evidence, approval, and client outcome.'}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ['Pilots', studio?.metrics.pilot_count ?? 0],
                ['Repos', studio?.metrics.total_repo_count ?? 0],
                ['Fusions', studio?.metrics.fusion_pilot_count ?? 0],
                ['Agent jobs', studio?.metrics.next_agent_job_count ?? 0],
              ].map(([label, value]) => (
                <div className="rounded-3xl border border-slate-300/70 bg-white/72 p-4" key={label}>
                  <strong className="block text-3xl font-black text-[var(--sm-ink)]">{formatNumber(Number(value))}</strong>
                  <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating model</p>
          <h2 className="mt-2 text-3xl font-black text-white">From repo hype to client delivery.</h2>
          <div className="mt-5 grid gap-3">
            {(studio?.operating_model ?? []).map((step, index) => (
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4" key={step}>
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Step {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-white/82">{step}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Package ladder</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Make the first sale small and concrete.</h2>
          <div className="mt-5 grid gap-3">
            {(studio?.package_ladder ?? []).map((pack) => (
              <div className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={pack.name}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-[var(--sm-ink)]">{pack.name}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{pack.price}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{pack.output}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Pilot selector</p>
            <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Choose the first workflow to sell or build.</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
            {studio?.generated_for ?? 'not generated'}
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {(studio?.pilots ?? []).map((pilot) => (
            <button
              className={`rounded-[1.2rem] border p-4 text-left transition ${
                selectedPilot?.id === pilot.id ? 'border-[var(--sm-accent)] bg-white shadow-sm' : 'border-slate-200 bg-white/78 hover:border-slate-300'
              }`}
              key={pilot.id}
              onClick={() => setSelectedPilotId(pilot.id)}
              type="button"
            >
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Pilot {pilot.rank}</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-lg font-black leading-tight text-[var(--sm-ink)]">{pilot.suiteName}</h3>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${sourceTone(pilot.sourceType)}`}>
                  {sourceLabel(pilot.sourceType)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{pilot.clientQuestion}</p>
            </button>
          ))}
        </div>
      </section>

      {selectedPilot ? (
        <section className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
          <article className="sm-terminal p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Selected pilot</p>
                <h2 className="mt-2 text-3xl font-black text-white">{selectedPilot.name}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${riskTone(selectedPilot.risk)}`}>
                {riskLabel(selectedPilot.risk)}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${sourceTone(selectedPilot.sourceType)}`}>
                {sourceLabel(selectedPilot.sourceType)}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/82">{selectedPilot.firstWorkflow}</p>
            {selectedPilot.fusion ? (
              <div className="mt-5 rounded-[1.2rem] border border-sky-300/20 bg-sky-300/10 p-4">
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Fusion product</p>
                <p className="mt-2 text-sm font-bold leading-6 text-white">{selectedPilot.fusion.sellableOffer}</p>
                <p className="mt-3 text-sm leading-6 text-white/68">{selectedPilot.fusion.guardrail}</p>
              </div>
            ) : null}
            <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Proof script</p>
              <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{selectedPilot.proofScript}</p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Buyer</p>
                <p className="mt-2 text-sm font-bold leading-6 text-white">{selectedPilot.buyer}</p>
              </div>
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Price</p>
                <p className="mt-2 text-sm font-bold leading-6 text-white">{selectedPilot.priceBand}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedPilot.stack.map((tool) => (
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-white/82" key={tool}>
                  {tool}
                </span>
              ))}
            </div>
          </article>

          <article className="grid gap-4">
            <div className="sm-calm-surface p-5 md:p-6">
              <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Client intake</p>
              <h3 className="mt-2 text-2xl font-black text-[var(--sm-ink)]">Ask for only what the pilot needs.</h3>
              {checklist(selectedPilot.intakeFields, 'mt-5 md:grid-cols-2')}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="sm-calm-surface p-5">
                <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Deliverables</p>
                {checklist(selectedPilot.deliverables, 'mt-4')}
              </div>
              <div className="sm-calm-surface p-5">
                <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Evidence ledger</p>
                {checklist(selectedPilot.evidenceLedger, 'mt-4')}
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {selectedPilot ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <article className="sm-calm-surface p-5 md:p-6">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Security gates</p>
            {checklist(selectedPilot.securityGates, 'mt-4')}
          </article>
          <article className="sm-calm-surface p-5 md:p-6">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Acceptance checks</p>
            {checklist(selectedPilot.acceptanceChecks, 'mt-4')}
          </article>
          <article className="sm-calm-surface p-5 md:p-6">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Next agent jobs</p>
            {checklist(selectedPilot.nextAgentJobs, 'mt-4')}
          </article>
        </section>
      ) : null}

      {selectedPilot?.highRiskRepos.length ? (
        <section className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">License review required</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Do not ship these into client infrastructure without approval.</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {selectedPilot.highRiskRepos.map((repo) => (
              <article className="rounded-[1.2rem] border border-amber-200 bg-amber-50 p-4" key={repo.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black text-amber-950">{repo.name}</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-800">{repo.license}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-amber-900">{repo.gate}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
