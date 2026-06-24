import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type RadarRepo = {
  id: string
  name: string
  repo: string
  url: string
  stars: number | null
  forks: number | null
  language: string
  license: string
  category: string
  action: 'adopt' | 'prototype' | 'watch'
  risk: 'low' | 'medium' | 'high'
  supermegaUse: string
  clientProduct: string
  firstIntegration: string
  licenseGate: string
}

type ProductSuite = {
  id: string
  name: string
  repos: string[]
  buyer: string
  clientPromise: string
  firstPaidStep: string
}

type FusionProduct = {
  id: string
  name: string
  repos: string[]
  disruptiveUse: string
  sellableOffer: string
  firstProof: string
  guardrail: string
}

type RadarPayload = {
  status: string
  generated_at: string
  generated_for: string
  positioning: {
    title: string
    thesis: string
    antithesis: string
    synthesis: string
  }
  metrics: {
    repo_count: number
    adopt_now_count: number
    prototype_count: number
    high_risk_count: number
    product_suite_count: number
    fusion_product_count?: number
    total_observed_stars: number
  }
  license_policy: {
    rule: string
    safeDefault: string
    highRiskLicenses: string[]
    ownerApprovalRequired: string[]
  }
  adoption_sequence: string[]
  product_suites: ProductSuite[]
  fusion_products?: FusionProduct[]
  repositories: RadarRepo[]
}

function formatNumber(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return value.toLocaleString()
}

function actionTone(action: RadarRepo['action']) {
  if (action === 'adopt') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (action === 'prototype') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-sky-200 bg-sky-50 text-sky-800'
}

function riskTone(risk: RadarRepo['risk']) {
  if (risk === 'high') return 'border-rose-200 bg-rose-50 text-rose-800'
  if (risk === 'medium') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-emerald-200 bg-emerald-50 text-emerald-800'
}

export function OpenSourceRadarPage() {
  const [radar, setRadar] = useState<RadarPayload | null>(null)
  const [selectedRepoId, setSelectedRepoId] = useState('n8n')

  useEffect(() => {
    let cancelled = false

    async function loadRadar() {
      try {
        const response = await fetch('/site/open-source-integration-radar.json', { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as RadarPayload
        if (!cancelled) {
          setRadar(payload)
          setSelectedRepoId((current) => current || payload.repositories[0]?.id || '')
        }
      } catch {
        if (!cancelled) {
          setRadar(null)
        }
      }
    }

    void loadRadar()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedRepo = useMemo(
    () => radar?.repositories.find((repo) => repo.id === selectedRepoId) ?? radar?.repositories[0] ?? null,
    [radar, selectedRepoId],
  )
  const repoById = useMemo(() => new Map((radar?.repositories ?? []).map((repo) => [repo.id, repo])), [radar])
  const adoptRepos = (radar?.repositories ?? []).filter((repo) => repo.action === 'adopt')
  const prototypeRepos = (radar?.repositories ?? []).filter((repo) => repo.action === 'prototype')

  return (
    <div className="grid gap-6 pb-28">
      <section className="sm-calm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 md:p-8">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Open-source integration radar</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.05em] text-[var(--sm-ink)] md:text-6xl">
              Use them internally. Productize through SuperMega.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--sm-muted)]">
              General-use tools are not random demos. They become repeatable client products only after license review, tenant isolation, approval gates,
              evidence capture, and a SuperMega-owned workflow screen.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/integration-studio">
                Open Integration Studio
              </Link>
              <Link className="sm-button-secondary" to="/app/prototype-forge">
                Open Prototype Forge
              </Link>
              <Link className="sm-button-secondary" to="/app/revenue/offers">
                Package for client
              </Link>
              <a className="sm-button-secondary" href="/site/open-source-integration-radar.json" rel="noreferrer" target="_blank">
                Open JSON
              </a>
            </div>
          </div>
          <div className="border-t border-slate-200 bg-[#edf2ea] p-6 md:p-8 xl:border-l xl:border-t-0">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-muted)]">Synthesis</p>
            <p className="mt-3 text-xl font-black leading-tight text-[var(--sm-ink)]">
              {radar?.positioning.synthesis ??
                'SuperMega uses open-source tools as accelerators, then delivers governed client software with source evidence and review.'}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ['Repos', radar?.metrics.repo_count ?? 0],
                ['Adopt now', radar?.metrics.adopt_now_count ?? 0],
                ['Prototype', radar?.metrics.prototype_count ?? 0],
                ['Fusions', radar?.metrics.fusion_product_count ?? radar?.fusion_products?.length ?? 0],
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

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Adoption sequence</p>
          <h2 className="mt-2 text-3xl font-black text-white">What we should use first.</h2>
          <div className="mt-5 grid gap-3">
            {(radar?.adoption_sequence ?? []).map((step, index) => (
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4" key={step}>
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Move {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-white/82">{step}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">License and delivery policy</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Open source is an accelerator, not a shortcut around responsibility.</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--sm-muted)]">{radar?.license_policy.rule}</p>
          <p className="mt-3 rounded-[1.2rem] bg-slate-100 p-4 text-sm font-bold leading-6 text-[var(--sm-ink)]">{radar?.license_policy.safeDefault}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-slate-400">High-risk licenses</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(radar?.license_policy.highRiskLicenses ?? []).map((item) => (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-slate-400">Owner approval</p>
              <div className="mt-3 grid gap-2">
                {(radar?.license_policy.ownerApprovalRequired ?? []).map((item) => (
                  <span className="text-sm leading-6 text-[var(--sm-muted)]" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Client product suites</p>
            <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">How popular repos become sellable SuperMega products.</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
            Agentic Workflow Studio
          </span>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-5">
          {(radar?.product_suites ?? []).map((suite) => (
            <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={suite.id}>
              <h3 className="text-xl font-black leading-tight text-[var(--sm-ink)]">{suite.name}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{suite.clientPromise}</p>
              <p className="mt-3 text-sm font-black text-[var(--sm-accent)]">{suite.firstPaidStep}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {suite.repos.map((repoId) => (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600" key={repoId}>
                    {repoById.get(repoId)?.name ?? repoId}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-terminal p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Fusion products</p>
            <h2 className="mt-2 text-3xl font-black text-white">Combine repos into software clients can actually buy.</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white/70">
            repo stack {'->'} SuperMega module
          </span>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-5">
          {(radar?.fusion_products ?? []).map((product) => (
            <article className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4" key={product.id}>
              <h3 className="text-xl font-black leading-tight text-white">{product.name}</h3>
              <p className="mt-3 text-sm leading-6 text-white/76">{product.disruptiveUse}</p>
              <p className="mt-3 text-sm font-black leading-6 text-[var(--sm-accent)]">{product.sellableOffer}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.repos.map((repoId) => (
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-bold text-white/70" key={repoId}>
                    {repoById.get(repoId)?.name ?? repoId}
                  </span>
                ))}
              </div>
              <div className="mt-4 rounded-[1rem] bg-black/20 p-3">
                <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-white/46">First proof</p>
                <p className="mt-2 text-xs leading-5 text-white/70">{product.firstProof}</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/52">{product.guardrail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Repository radar</p>
              <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Pick by utility, not hype.</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
              {formatNumber(radar?.metrics.total_observed_stars)} observed stars
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {(radar?.repositories ?? []).map((repo) => (
              <button
                className={`rounded-[1.2rem] border p-4 text-left transition ${
                  selectedRepo?.id === repo.id ? 'border-[var(--sm-accent)] bg-white shadow-sm' : 'border-slate-200 bg-white/78 hover:border-slate-300'
                }`}
                key={repo.id}
                onClick={() => setSelectedRepoId(repo.id)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-[var(--sm-ink)]">{repo.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{repo.category}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${actionTone(repo.action)}`}>
                    {repo.action}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{repo.supermegaUse}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-5 md:p-6">
          {selectedRepo ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{selectedRepo.repo}</p>
                  <h2 className="mt-2 text-3xl font-black text-white">{selectedRepo.name}</h2>
                </div>
                <a className="sm-button-secondary" href={selectedRepo.url} rel="noreferrer" target="_blank">
                  GitHub
                </a>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {[
                  ['Stars', formatNumber(selectedRepo.stars)],
                  ['Forks', formatNumber(selectedRepo.forks)],
                  ['Language', selectedRepo.language],
                  ['License', selectedRepo.license],
                ].map(([label, value]) => (
                  <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-4" key={label}>
                    <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">{label}</p>
                    <p className="mt-2 text-lg font-black text-white">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Client product</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-white">{selectedRepo.clientProduct}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{selectedRepo.firstIntegration}</p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">License gate</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${riskTone(selectedRepo.risk)}`}>
                      {selectedRepo.risk} risk
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${actionTone(selectedRepo.action)}`}>
                      {selectedRepo.action}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{selectedRepo.licenseGate}</p>
                </div>
              </div>
              <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">SuperMega use</p>
                <p className="mt-2 text-sm leading-6 text-white/82">{selectedRepo.supermegaUse}</p>
              </div>
            </>
          ) : (
            <p className="text-sm leading-6 text-[var(--sm-muted)]">Run npm run open-source:radar to load the current integration radar.</p>
          )}
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Adopt now</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Use these in SuperMega work immediately.</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {adoptRepos.map((repo) => (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800" key={repo.id}>
                {repo.name}
              </span>
            ))}
          </div>
        </article>
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Prototype safely</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Useful, but keep behind lab gates first.</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {prototypeRepos.map((repo) => (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-800" key={repo.id}>
                {repo.name}
              </span>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
