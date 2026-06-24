import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  FOUNDER_AGENT_ROLES,
  FOUNDER_BILLION_SCALE_STEPS,
  FOUNDER_BILLION_THESIS,
  FOUNDER_MACHINE_GATES,
  FOUNDER_MACHINE_PRINCIPLES,
  FOUNDER_OPERATING_LOOPS,
  FOUNDER_PRODUCT_LINES,
} from '../lib/founderMachineModel'
import { SAAS_MODULE_FAMILIES } from '../lib/saasModuleMachine'

function scoreTone(score: number) {
  if (score >= 88) return 'text-emerald-300'
  if (score >= 80) return 'text-amber-300'
  return 'text-white/70'
}

export function FounderMachinePage() {
  const topProducts = [...FOUNDER_PRODUCT_LINES].sort((left, right) => right.score - left.score)
  const averageScore = Math.round(FOUNDER_PRODUCT_LINES.reduce((sum, product) => sum + product.score, 0) / FOUNDER_PRODUCT_LINES.length)
  const incumbentCount = new Set(SAAS_MODULE_FAMILIES.flatMap((family) => family.incumbents)).size
  const dataInputCount = new Set(FOUNDER_PRODUCT_LINES.flatMap((product) => product.dataInputs)).size
  const agentRoleCount = FOUNDER_AGENT_ROLES.length

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Founder Machine"
        title="Make SuperMega run like an autonomous software company."
        description="This is the operating surface for replacing the founder's manual loop: choose product bets, dispatch agent crews, build modules, verify releases, and feed market learning back into the platform."
      />

      <section className="sm-surface-deep overflow-hidden p-6">
        <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Billion focus</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-semibold text-white lg:text-5xl">{FOUNDER_BILLION_THESIS.name}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--sm-muted)]">{FOUNDER_BILLION_THESIS.decision}</p>
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">Beachhead</p>
              <p className="mt-3 text-sm leading-6 text-white">{FOUNDER_BILLION_THESIS.beachhead}</p>
            </div>
            <div className="mt-4 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-100">Wedge</p>
              <p className="mt-3 text-sm leading-6 text-white">{FOUNDER_BILLION_THESIS.wedge}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <p className="sm-kicker text-rose-200">Do not build</p>
              <div className="mt-4 space-y-3">
                {FOUNDER_BILLION_THESIS.notThis.map((item) => (
                  <p className="rounded-2xl border border-rose-300/15 bg-rose-500/10 p-3 text-sm leading-6 text-rose-50" key={item}>
                    {item}
                  </p>
                ))}
              </div>
            </article>
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <p className="sm-kicker text-[var(--sm-accent)]">Moat</p>
              <div className="mt-4 space-y-3">
                {FOUNDER_BILLION_THESIS.moat.map((item) => (
                  <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-white" key={item}>
                    {item}
                  </p>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Scale path</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">How this becomes a venture-scale company instead of custom software chaos.</h2>
          </div>
          <span className="sm-chip text-white">$1B path needs repeatable source contracts, not vague AI demos</span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          {FOUNDER_BILLION_SCALE_STEPS.map((step) => (
            <article className="rounded-3xl border border-white/10 bg-white/4 p-5" key={step.id}>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{step.stage}</p>
              <h3 className="mt-3 text-lg font-semibold text-white">{step.target}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{step.product}</p>
              <p className="mt-3 text-sm leading-6 text-white">{step.proof}</p>
              <p className="mt-3 text-sm leading-6 text-emerald-200">{step.scaleMechanic}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          ['Agent runtime', FOUNDER_BILLION_THESIS.agentRuntime],
          ['Revenue path', FOUNDER_BILLION_THESIS.revenuePath],
        ].map(([label, items]) => (
          <article className="sm-surface p-5 xl:col-span-2" key={String(label)}>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">{label}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(items as string[]).map((item) => (
                <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white" key={item}>
                  {item}
                </p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="sm-surface-deep overflow-hidden p-6">
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Company autopilot</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-semibold text-white lg:text-5xl">The product is the machine that builds more products.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--sm-muted)]">
              SuperMega should behave like a founder plus a software team: research pain, turn it into a wedge, build the route, verify the release, package the offer, and learn from customers. The founder stays in the approval and direction loop while agents handle repeatable prep work.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/foundry">
                Open Foundry
              </Link>
              <Link className="sm-button-secondary" to="/app/product-ops">
                Product Ops
              </Link>
              <Link className="sm-button-secondary" to="/app/market-intel">
                Market Intel
              </Link>
              <Link className="sm-button-secondary" to="/app/prototype-forge">
                Prototype Forge
              </Link>
              <Link className="sm-button-secondary" to="/app/process">
                Process Control
              </Link>
              <Link className="sm-button-secondary" to="/app/revenue/growth">
                Growth Machine
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Product lines', FOUNDER_PRODUCT_LINES.length, 'sellable wedges'],
              ['Avg readiness', averageScore, 'portfolio score'],
              ['Agent roles', agentRoleCount, 'founder replacements'],
              ['Data inputs', dataInputCount, 'source types'],
              ['SaaS targets', incumbentCount, 'incumbents mapped'],
              ['Release gates', FOUNDER_MACHINE_GATES.length, 'hard controls'],
            ].map(([label, value, detail]) => (
              <article className="rounded-3xl border border-white/10 bg-white/5 p-5" key={String(label)}>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{label}</p>
                <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {FOUNDER_MACHINE_PRINCIPLES.map((principle, index) => (
          <article className="sm-surface p-5" key={principle}>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Rule {index + 1}</p>
            <p className="mt-3 text-sm leading-6 text-white">{principle}</p>
          </article>
        ))}
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Operating loop</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">What the machine should do instead of waiting for founder prompting.</h2>
          </div>
          <span className="sm-chip text-white">{FOUNDER_OPERATING_LOOPS.length} loops</span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          {FOUNDER_OPERATING_LOOPS.map((loop) => (
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5" key={loop.id}>
              <div className="flex min-h-full flex-col">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{loop.cadence}</p>
                  <h3 className="mt-3 text-lg font-semibold text-white">{loop.name}</h3>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{loop.founderJob}</p>
                  <p className="mt-3 text-sm text-white">{loop.autonomousUpgrade}</p>
                </div>
                <div className="mt-auto pt-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Gate</p>
                  <p className="mt-2 text-sm text-white">{loop.reviewGate}</p>
                  <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={loop.route}>
                    Open loop
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Product portfolio</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Other products the machine should build and sell.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/portal-factory">
              Portal Factory
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            {topProducts.map((product) => (
              <article className="rounded-3xl border border-white/10 bg-white/4 p-5" key={product.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--sm-muted)]">{product.buyer}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{product.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Replaces: {product.categoryToReplace}</p>
                  </div>
                  <span className={`text-3xl font-semibold ${scoreTone(product.score)}`}>{product.score}</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-white">{product.wedge}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Data</p>
                    <p className="mt-2 text-sm text-white">{product.dataInputs.join(', ')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Agents</p>
                    <p className="mt-2 text-sm text-white">{product.agentCrew.join(', ')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Gate</p>
                    <p className="mt-2 text-sm text-white">{product.gate}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="sm-chip text-white">{product.sellablePack}</span>
                  <Link className="sm-button-secondary" to={product.firstRoute}>
                    Open proof
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent workforce</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Roles that replace founder busywork.</h2>
          <div className="mt-5 space-y-4">
            {FOUNDER_AGENT_ROLES.map((role) => (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5" key={role.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{role.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{role.replacesFounderWork}</p>
                  </div>
                  <Link className="text-sm font-semibold text-[var(--sm-accent)]" to={role.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm text-white">Reads: {role.reads.join(', ')}</p>
                <p className="mt-2 text-sm text-white">Produces: {role.produces.join(', ')}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Write boundary: {role.writes}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Safety and release gates</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">The machine scales only when gates stay hard.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/teams">
            Agent evidence
          </Link>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {FOUNDER_MACHINE_GATES.map((gate) => (
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5" key={gate.id}>
              <h3 className="text-lg font-semibold text-white">{gate.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">Evidence: {gate.requiredEvidence.join(', ')}</p>
              <p className="mt-3 text-sm text-rose-200">Blocks: {gate.blocks}</p>
              <p className="mt-3 text-sm text-emerald-200">Unlocks: {gate.unlocks}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
