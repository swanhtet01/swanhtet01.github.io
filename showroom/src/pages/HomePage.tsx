import { Link } from 'react-router-dom'

import { caseStudies, engagementFlow, packages, solutions } from '../content'

export function HomePage() {
  const capabilityBlocks = [
    'Operations visibility across files, email, and team updates',
    'Supplier and payment control with owner-level escalation',
    'DQMS incident-to-CAPA chain with weekly quality reporting',
    'Executive briefing with evidence-linked recommendations',
  ]

  return (
    <div className="space-y-10 pb-8 lg:space-y-14">
      <section className="grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="animate-rise animate-soft-glow rounded-[1.9rem] border border-[var(--sm-line)] bg-[var(--sm-paper)]/92 p-6 shadow-[var(--sm-shadow)] lg:p-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--sm-accent)]">01 / SuperMega Showroom</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--sm-ink)] lg:text-5xl">
            Build an AI-native operating system before you buy another generic ERP.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
            We turn your existing files, inbox, and team workflows into a practical control surface for directors,
            managers, and owners. Start with one workflow, then scale into an AI-native ERP layer.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--sm-line)] bg-white/80 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sm-muted)]">Launch pace</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--sm-ink)]">2-4 weeks</p>
            </div>
            <div className="rounded-2xl border border-[var(--sm-line)] bg-white/80 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sm-muted)]">Proof model</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--sm-ink)]">Evidence linked</p>
            </div>
            <div className="rounded-2xl border border-[var(--sm-line)] bg-white/80 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sm-muted)]">Delivery mode</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--sm-ink)]">Owner first</p>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0a5b5d]"
              to="/contact?intent=discovery"
            >
              Book Discovery
            </Link>
            <Link
              className="rounded-full bg-[var(--sm-accent-alt)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#b84d1d]"
              to="/contact?intent=proposal"
            >
              Request Proposal
            </Link>
            <Link
              className="rounded-full border border-[var(--sm-line)] px-5 py-3 text-sm font-bold text-[var(--sm-ink)] transition hover:bg-white/90"
              to="/packages"
            >
              See Packages
            </Link>
          </div>
        </div>

        <div className="animate-rise-delayed rounded-[1.9rem] border border-[#184a4a] bg-[#112d31] p-6 text-white shadow-[0_24px_70px_-45px_rgba(15,23,42,1)] lg:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-200">02 / Delivery flow</p>
          <h2 className="mt-2 text-xl font-bold">How we execute with you</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-200">
            {engagementFlow.map((step) => (
              <li className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3" key={step}>
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-2xl border border-cyan-100/20 bg-cyan-200/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100">Reality check</p>
            <p className="mt-2 text-sm text-slate-200">
              We do not ask your team to migrate everything on day one. We convert existing data into control first,
              then formalize where needed.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">03 / What you get</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/solutions">
            View full solution stack
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {capabilityBlocks.map((item, index) => (
            <article
              className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.8)]"
              key={item}
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--sm-muted)]">Capability {index + 1}</p>
              <p className="mt-2 text-base font-semibold text-[var(--sm-ink)]">{item}</p>
            </article>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {solutions.slice(0, 4).map((solution, index) => (
            <article
              className={`rounded-3xl border border-[var(--sm-line)] bg-[var(--sm-paper)]/95 p-5 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.8)] animate-rise-delay-${index + 1}`}
              key={solution.name}
            >
              <h3 className="text-xl font-semibold text-[var(--sm-ink)]">{solution.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{solution.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">04 / Productized packages</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/packages">
            Compare package details
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {packages.map((pkg) => (
            <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-5" key={pkg.name}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-accent)]">{pkg.name}</p>
              <p className="mt-2 text-2xl font-extrabold text-[var(--sm-ink)]">{pkg.investment}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">{pkg.timeline}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{pkg.bestFor}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">05 / Proof and outcomes</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/case-studies">
            Read full narratives
          </Link>
        </div>
        <div className="grid gap-4">
          {caseStudies.slice(0, 2).map((study) => (
            <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-5" key={study.title}>
              <h3 className="text-lg font-semibold text-[var(--sm-ink)]">{study.title}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{study.outcome}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sm-accent)]">{study.proof}</p>
            </article>
          ))}
        </div>
        <section className="rounded-[1.9rem] border border-[var(--sm-line)] bg-[var(--sm-paper)] p-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--sm-accent)]">06 / Next step</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[var(--sm-ink)]">If you want one business outcome in 30 days, start here.</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--sm-muted)]">
            We start with one critical workflow, establish control, then scale. You get visible progress every week and
            reusable architecture for future expansion.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0a5b5d]"
              to="/contact?intent=discovery"
            >
              Book Discovery
            </Link>
            <Link
              className="rounded-full border border-[var(--sm-line)] px-5 py-3 text-sm font-bold text-[var(--sm-ink)] transition hover:bg-white"
              to="/dqms"
            >
              Explore DQMS add-ons
            </Link>
          </div>
        </section>
      </section>
    </div>
  )
}
