import { useEffect, useMemo, useState } from 'react'

type GeneralProduct = {
  id: string
  name: string
  category: string
  one_liner: string
  demo_input: string
  output: string
  safety_gate: string
  pricing?: {
    diagnostic_usd?: string
    monthly_usd?: string
  }
}

type GeneralProductsPayload = {
  status: string
  generated_at: string
  payment_status?: string
  products?: GeneralProduct[]
}

type AgentToolLane = {
  id: string
  name: string
  status: string
  stack?: string[]
  route: string
  use_for: string
  next_build: string
}

type AgentToolRadarPayload = {
  status: string
  generated_at: string
  position: string
  operating_rule: string
  metrics?: {
    adoption_lane_count?: number
    agent_skill_count?: number
    adopt_now_count?: number
  }
  adoption_lanes?: AgentToolLane[]
}

type SocialOAuthProvider = {
  id: string
  name: string
  purpose: string
  status: string
  next_action: string
  safety_gate: string
  required_env_present?: string[]
  optional_env_present?: string[]
}

type SocialOAuthPayload = {
  status: string
  generated_at: string
  public_publish_allowed: boolean
  warning?: string
  metrics?: {
    provider_count?: number
    ready_for_private_test?: number
    local_material_present?: number
  }
  providers?: SocialOAuthProvider[]
}

const REQUIRED_TOOL_NAMES = [
  'Market Intel Room',
  'Lead Radar',
  'Document Intake',
  'Contract and Policy Review Desk',
  'Meeting to Action Desk',
  'Competitor and Trend Watchtower',
  'Deal Diligence Risk Room',
  'Customer Support QA Miner',
  'Finance Ops Reconciliation Desk',
  'Hiring Pipeline Review Desk',
] as const

async function fetchOptionalJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

function statusTone(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('ready') || normalized.includes('adopt')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
  if (normalized.includes('missing') || normalized.includes('blocked')) {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

export function ToolsPage() {
  const [payload, setPayload] = useState<GeneralProductsPayload | null>(null)
  const [stackRadar, setStackRadar] = useState<AgentToolRadarPayload | null>(null)
  const [socialOAuth, setSocialOAuth] = useState<SocialOAuthPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/site/general-products.json', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Tool catalog is not ready on this host yet.')
        }
        const nextPayload = (await response.json()) as GeneralProductsPayload
        const [nextAgentRadar, nextSocialOAuth] = await Promise.all([
          fetchOptionalJson<AgentToolRadarPayload>('/site/agent-tool-stack-radar.json'),
          fetchOptionalJson<SocialOAuthPayload>('/site/social-oauth-readiness.json'),
        ])
        if (!cancelled) {
          setPayload(nextPayload)
          setStackRadar(nextAgentRadar)
          setSocialOAuth(nextSocialOAuth)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) {
          setPayload(null)
          setError(caught instanceof Error ? caught.message : 'Could not load tool catalog.')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const products = useMemo(() => payload?.products ?? [], [payload])
  const stackLanes = useMemo(() => stackRadar?.adoption_lanes ?? [], [stackRadar])
  const socialProviders = useMemo(() => socialOAuth?.providers ?? [], [socialOAuth])

  return (
    <div className="sm-simple-scope">
      <section className="sm-simple-scope-hero" aria-label="Business workflow tools">
        <div>
          <h1>Business workflow tools.</h1>
          <p>Useful outputs first: research, leads, documents, diligence, support QA, finance ops, hiring, reports, and workflow replacement.</p>
        </div>
      </section>

      <section className="sm-simple-scope-grid" aria-label="Tool catalog">
        <div className="sm-simple-form">
          <div className="sm-simple-fields">
            <div className="sm-simple-wide">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Paid tools</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--sm-ink)]">Request paid access to one useful workflow.</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Human approval required before external posting, outreach sending, payment activation, or advice-sensitive use.
              </p>
              {error ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}
            </div>

            <div className="sm-simple-wide rounded-3xl border border-slate-200 bg-white/76 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Implementation stack</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--sm-ink)]">Frameworks become governed product lanes.</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">
                    {stackRadar?.operating_rule ?? 'Deterministic software first. Automation runs only where messy sources, reasoning, browser work, or review creates leverage.'}
                  </p>
                </div>
                <span className={`w-fit rounded-full border px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.14em] ${statusTone(stackRadar?.status)}`}>
                  {stackRadar?.status ?? 'loading'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {stackLanes.slice(0, 6).map((lane) => (
                  <article className="rounded-[1.2rem] border border-slate-200 bg-white/82 p-4" key={lane.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-[var(--sm-ink)]">{lane.name}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.12em] ${statusTone(lane.status)}`}>{lane.status}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{lane.use_for}</p>
                    <p className="mt-3 text-xs font-bold text-[var(--sm-ink)]">{lane.next_build}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(lane.stack ?? []).slice(0, 4).map((item) => (
                        <span className="rounded-full bg-[var(--sm-soft)] px-3 py-1 text-[0.68rem] font-black text-[var(--sm-ink)]" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="sm-simple-wide flex flex-wrap gap-2">
              {REQUIRED_TOOL_NAMES.map((name) => (
                <span className="rounded-full bg-[var(--sm-soft)] px-3 py-2 text-xs font-black text-[var(--sm-ink)]" key={name}>
                  {name}
                </span>
              ))}
            </div>

            {products.map((product) => (
              <article className="sm-simple-wide rounded-3xl border border-slate-200 bg-white/70 p-5" id={product.id} key={product.id}>
                <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-accent)]">{product.category}</p>
                <h2 className="mt-2 text-2xl font-black leading-tight text-[var(--sm-ink)]">{product.name}</h2>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.one_liner}</p>
                <div className="mt-4 grid gap-3 text-sm text-[var(--sm-muted)]">
                  <p>
                    <strong className="text-[var(--sm-ink)]">Input: </strong>
                    {product.demo_input}
                  </p>
                  <p>
                    <strong className="text-[var(--sm-ink)]">Output: </strong>
                    {product.output}
                  </p>
                  <p>
                    <strong className="text-[var(--sm-ink)]">Gate: </strong>
                    {product.safety_gate || 'Human approval required.'}
                  </p>
                </div>
                <a className="sm-button-primary mt-5 inline-flex" href={`/intake/?tool=${encodeURIComponent(product.id)}`}>
                  Request paid access
                </a>
              </article>
            ))}
          </div>
        </div>

        <aside className="sm-simple-next" aria-label="Tool policy">
          <h2>Policy</h2>
          <ol>
            <li>Send permissioned sources only.</li>
            <li>No external action without review.</li>
            <li>No investment, legal, or financial advice.</li>
          </ol>
          <p className="mt-4 text-sm text-[var(--sm-muted)]">
            Payment setup is intentionally separate from the product catalog. Catalog status: {payload?.status ?? 'loading'}.
          </p>
          <div className="mt-5 rounded-3xl border border-slate-200 bg-white/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-[var(--sm-ink)]">Social OAuth</h3>
              <span className={`rounded-full border px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.12em] ${statusTone(socialOAuth?.status)}`}>
                {socialOAuth?.status ?? 'loading'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">
              Draft queues can run now. Publishing stays blocked until provider tokens, page/channel identity, approval, and audit rows are verified.
            </p>
            <div className="mt-3 grid gap-2">
              {socialProviders.map((provider) => (
                <div className="rounded-2xl border border-slate-200 bg-white/76 p-3" key={provider.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm text-[var(--sm-ink)]">{provider.name}</strong>
                    <span className={`rounded-full border px-2 py-1 text-[0.58rem] font-black uppercase tracking-[0.1em] ${statusTone(provider.status)}`}>{provider.status}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--sm-muted)]">{provider.next_action}</p>
                </div>
              ))}
            </div>
          </div>
          <a className="sm-button-secondary mt-4 inline-flex" href="/site/general-products.json">
            View JSON catalog
          </a>
          <a className="sm-button-secondary mt-3 inline-flex" href="/site/agent-tool-stack-radar.json">
            View implementation readiness
          </a>
          <a className="sm-button-secondary mt-3 inline-flex" href="/site/social-oauth-readiness.json">
            View OAuth readiness
          </a>
        </aside>
      </section>
    </div>
  )
}
