import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  CLIENT_COMMS_PACK,
  MIT_COMPETITOR_SOURCES,
  SEMINAR_DEMO_STACK,
  SEMINAR_PLAYBOOK,
  SUPERMEGA_POSITIONING,
  SUPERMEGA_REPLACEMENT_MAP,
  UMFCCI_BUSINESS_AI_EVENT,
} from '../lib/marketIntelModel'

function confidenceTone(confidence: string) {
  if (confidence === 'now') return 'bg-emerald-400/15 text-emerald-200'
  if (confidence === 'near') return 'bg-amber-400/15 text-amber-200'
  return 'bg-white/10 text-white/70'
}

export function MarketIntelPage() {
  const nowCount = SUPERMEGA_REPLACEMENT_MAP.filter((item) => item.confidence === 'now').length

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Market Intel"
        title="Prepare SuperMega to win the Yangon Business AI conversation."
        description="A working battlecard for the UMFCCI seminar: what MIT sells, where SuperMega can beat the old implementation model, what to ask buyers, and what product proof to show after the room gets excited about AI."
      />

      <section className="sm-surface-deep overflow-hidden p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr,0.85fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Event brief</p>
            <h2 className="mt-3 text-3xl font-semibold text-white lg:text-5xl">{UMFCCI_BUSINESS_AI_EVENT.name}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--sm-muted)]">
              {UMFCCI_BUSINESS_AI_EVENT.speaker} will be the public authority in the room. The SuperMega move is to listen, collect buyer pain, then offer a faster first-value AI readiness sprint with a live portal and approval-safe agents.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">When</p>
                <p className="mt-2 font-semibold text-white">{UMFCCI_BUSINESS_AI_EVENT.date}</p>
                <p className="text-sm text-[var(--sm-muted)]">{UMFCCI_BUSINESS_AI_EVENT.time}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Where</p>
                <p className="mt-2 font-semibold text-white">{UMFCCI_BUSINESS_AI_EVENT.location}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Seats</p>
                <p className="mt-2 font-semibold text-white">{UMFCCI_BUSINESS_AI_EVENT.seats} seats</p>
                <p className="text-sm text-[var(--sm-muted)]">Register by {UMFCCI_BUSINESS_AI_EVENT.registrationDeadline}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">SuperMega target</p>
                <p className="mt-2 font-semibold text-white">10 conversations, 3 workflow audits, 1 paid sprint</p>
              </div>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Positioning</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">Do not fight MIT on legacy trust. Beat them on speed to AI value.</h3>
            <p className="mt-4 text-sm leading-7 text-[var(--sm-muted)]">{SUPERMEGA_POSITIONING.thesis}</p>
            <div className="mt-5 space-y-3">
              {[
                ['Wedge', SUPERMEGA_POSITIONING.wedge],
                ['Proof', SUPERMEGA_POSITIONING.proof],
                ['Boundary', SUPERMEGA_POSITIONING.boundary],
              ].map(([label, value]) => (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4" key={label}>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">{label}</p>
                  <p className="mt-2 text-sm leading-6 text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {MIT_COMPETITOR_SOURCES.map((source) => (
          <article className="sm-surface p-5" key={source.url}>
            <p className="sm-kicker text-[var(--sm-accent)]">{source.label}</p>
            <p className="mt-3 text-sm leading-6 text-white">{source.observed}</p>
            <a className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" href={source.url} rel="noreferrer" target="_blank">
              Source
            </a>
          </article>
        ))}
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Replacement map</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Where SuperMega can replace the workflow, not just the software name.</h2>
          </div>
          <span className="sm-chip text-white">{nowCount} ready-now wedges</span>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {SUPERMEGA_REPLACEMENT_MAP.map((item) => (
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5" key={item.incumbentArea}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-white">{item.incumbentArea}</h3>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">MIT/current market: {item.whatMitSells}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] ${confidenceTone(item.confidence)}`}>
                  {item.confidence}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-white">{item.supermegaMove}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Ask buyer</p>
                  <p className="mt-2 text-sm text-white">{item.buyerQuestion}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Automate setup</p>
                  <p className="mt-2 text-sm text-white">{item.setupAutomation}</p>
                </div>
              </div>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={item.firstProofRoute}>
                Open proof route
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Seminar execution</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">What to do before, during, and after.</h2>
          <div className="mt-5 space-y-4">
            {SEMINAR_PLAYBOOK.map((phase) => (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5" key={phase.phase}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{phase.phase}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{phase.goal}</p>
                  </div>
                  <span className="sm-chip text-white">{phase.owner}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-white">
                  {phase.actions.map((action) => (
                    <li key={action}>- {action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Client comms</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Simple scripts for conversations and follow-up.</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {CLIENT_COMMS_PACK.map((script) => (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5" key={script.id}>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">{script.moment}</p>
                <p className="mt-3 text-sm leading-6 text-white">{script.script}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">Next: {script.followUp}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Proof stack</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">The order to show prospects after the seminar.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/portal-factory">
            Build a prospect portal
          </Link>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {SEMINAR_DEMO_STACK.map((proofItem) => (
            <article className="rounded-3xl border border-white/10 bg-white/5 p-5" key={proofItem.name}>
              <h3 className="text-lg font-semibold text-white">{proofItem.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{proofItem.shows}</p>
              <p className="mt-3 text-sm text-white">{proofItem.proof}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={proofItem.route}>
                Open proof
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
