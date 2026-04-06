import { Link, useLocation } from 'react-router-dom'

import { customBuilds, operatorAddOns, publicModules, systemOffers, templatePacks } from '../content'

function contactLink(packageName?: string) {
  if (!packageName) {
    return '/contact'
  }
  return `/contact?package=${encodeURIComponent(packageName)}`
}

function SystemsView() {
  return (
    <div className="space-y-8 pb-12">
      <section className="sm-surface-deep p-6 lg:p-10">
        <p className="sm-kicker text-[var(--sm-accent)]">What we build</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
          AI-native systems for sales, operations, and management.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
          We replace scattered chats, spreadsheets, and mismatched SaaS with one working system the team can actually use.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {systemOffers.map((offer) => (
          <article className="sm-surface p-6" key={offer.name}>
            <p className="sm-kicker text-[var(--sm-accent)]">{offer.name}</p>
            <p className="mt-3 text-xl font-bold text-white">{offer.outcome}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">Best for: {offer.audience}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">Replaces: {offer.replaces}</p>
          </article>
        ))}
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

        <article className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">AI operator add-ons</p>
          <div className="mt-5 space-y-3">
            {operatorAddOns.map((item) => (
              <div className="border-b border-white/8 pb-3 text-base text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item.name}>
                <span className="font-semibold text-white">{item.name}</span>
                <span> {item.detail}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-2xl font-bold text-white">Need one workflow fixed first?</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">Contact us with the workflow and current tools. We will reply with the right starter pack or build.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/templates">
              See starter packs
            </Link>
            <Link className="sm-button-primary" to="/contact">
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function TemplatesView() {
  return (
    <div className="space-y-8 pb-12">
      <section className="sm-surface-deep p-6 lg:p-10">
        <p className="sm-kicker text-[var(--sm-accent)]">Starter packs</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
          Reusable systems we can ship first.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
          Start with one clear pack. Extend later only if the business needs more.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {templatePacks.map((pack) => (
          <article className="sm-surface p-6" key={pack.name}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">{pack.category}</p>
                <h2 className="mt-3 text-3xl font-extrabold text-white">{pack.name}</h2>
              </div>
              <span className="sm-status-pill">{pack.live ? 'Ready now' : 'Sprint build'}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{pack.promise}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Best for</p>
                <p className="mt-2 text-sm">{pack.audience}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                <p className="mt-2 text-sm">{pack.outputs.join(', ')}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={contactLink(pack.name)}>
                Ask about this pack
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Useful free tools</p>
          <div className="mt-5 space-y-4">
            {publicModules.map((item) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={item.name}>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--sm-muted)]">
            Find clients is for new names. Clean my list is for the names you already have.
          </p>
        </article>

        <article className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <p className="mt-3 text-2xl font-bold text-white">Pick a pack or tell us the workflow.</p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            If one of these fits, contact us with the pack name. If not, tell us the workflow and we will scope the right build.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/find-companies">
              Try a proof tool
            </Link>
            <Link className="sm-button-primary" to="/contact">
              Contact us
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}

export function ProductsPage() {
  const location = useLocation()
  const isTemplatePage = location.pathname.startsWith('/templates')
  return isTemplatePage ? <TemplatesView /> : <SystemsView />
}
