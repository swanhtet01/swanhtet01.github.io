import { Link } from 'react-router-dom'

import { customBuilds, operatorAddOns, publicModules, templatePacks } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8 pb-12">
      <section className="sm-surface-deep p-6 lg:p-10">
        <p className="sm-kicker text-[var(--sm-accent)]">Templates</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
          Starter packs, reusable systems, and full custom builds.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
          We do not want clients buying another generic stack. We start from a reusable pack, then extend into the exact AI-native system the company needs.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {templatePacks.map((offer) => (
          <article className="sm-surface p-6" key={offer.name}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">{offer.category}</p>
                <h2 className="mt-3 text-3xl font-extrabold text-white">{offer.name}</h2>
              </div>
              <span className="sm-status-pill">{offer.live ? 'Reusable now' : 'Sprint-ready'}</span>
            </div>
            <div className="mt-5 grid gap-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Best for</p>
                <p className="mt-2 text-sm">{offer.audience}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Outcome</p>
                <p className="mt-2 text-sm">{offer.promise}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Inputs</p>
                <p className="mt-2 text-sm">{offer.inputs.join(', ')}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                <p className="mt-2 text-sm">{offer.outputs.join(', ')}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">Operator add-ons</p>
          <h2 className="mt-3 text-3xl font-bold text-white">AI-native pieces that make the packs stronger.</h2>
          <div className="mt-5 space-y-3">
            {operatorAddOns.map((item) => (
              <div className="border-b border-white/8 pb-3 text-base text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item.name}>
                <span className="font-semibold text-white">{item.name}</span>
                <span> {item.detail}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Live proof tools</p>
          <div className="mt-5 space-y-4">
            {publicModules.map((item) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={item.name}>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">Custom builds</p>
          <div className="mt-5 grid gap-3">
            {customBuilds.map((item) => (
              <div className="sm-chip text-white" key={item.name}>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <section className="sm-surface p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-2xl font-bold text-white">Use a proof tool, then deploy the real system.</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">The tools show the approach. The template packs and custom builds are the main offer.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/templates">
              View templates
            </Link>
            <Link className="sm-button-secondary" to="/find-companies">
              Try a proof tool
            </Link>
            <Link className="sm-button-primary" to="/book">
              Book rollout call
            </Link>
          </div>
        </div>
        </section>
      </section>
    </div>
  )
}
