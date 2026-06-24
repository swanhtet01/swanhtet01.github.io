import { Link } from 'react-router-dom'

import { LiveProductPreview } from '../components/LiveProductPreview'
import { PageIntro } from '../components/PageIntro'
import { PUBLIC_PERSONAS, PUBLIC_SHOWCASE_TEMPLATES } from '../lib/goToMarketShowcase'
import { STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'

function rolloutLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const caseStudyLanes = [
  'Sales follow-up and account history in one place.',
  'Operations, receiving, and quality issues in one place.',
  'Leadership review without chasing updates across tools.',
] as const

const supportedInputs = ['Gmail', 'Google Drive', 'Google Sheets', 'Google Calendar', 'CSV / Excel', 'ERP / CRM exports', 'Uploaded documents'] as const

export function ProductsPage() {
  const liveProductCount = STARTER_PACK_DETAILS.length

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Products"
        title="Choose the first product or package."
        description="Start with one live product. Move into a fuller package only after the first team is using it every day."
      />

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Supported inputs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Connect the current stack before replacing it.</h2>
          </div>
          <Link className="sm-link" to="/platform">
            See how it works
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {supportedInputs.map((item) => (
            <span className="sm-status-pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{liveProductCount} live products are ready to review.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Pick the closest fit, review the product page, and start the rollout.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-4">
          {STARTER_PACK_DETAILS.map((product: StarterPackDetail) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
              <div className="overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#040b16]">
                <img alt={`${product.name} screenshot`} className="h-auto w-full object-cover object-top" loading="lazy" src={product.image} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">Live product</p>
                <span className="sm-status-pill">Shipping now</span>
              </div>
              <p className="mt-4 text-2xl font-semibold text-white">{product.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-5 grid gap-3">
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Best for</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.audience}</p>
                </article>
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Connects to</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.integrations.slice(0, 3).join(', ')}</p>
                </article>
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">First result</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.problemsSolved[0]}</p>
                </article>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${product.slug}`}>
                  Review product
                </Link>
                <Link className="sm-button-secondary" to={rolloutLink(product.name)}>
                  Request rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Rollout packages</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the four main packages we sell.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Match the buyer to the right package, then launch the first module before expanding the rest.
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {PUBLIC_SHOWCASE_TEMPLATES.map((template) => (
            <article className="sm-proof-card" key={template.id}>
              <div className="mb-5 overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#040b16]">
                <img alt={`${template.name} showcase`} className="h-auto w-full object-cover object-top" loading="lazy" src={template.image} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">Template rollout</span>
                <span className="sm-status-pill">Ready to launch</span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-white">{template.name}</h3>
              <p className="mt-2 text-sm text-white/80">{template.strap}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Best for</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{template.audience}</p>
                </article>
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Current stack</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{template.currentStack}</p>
                </article>
              </div>
              <div className="mt-4 grid gap-3">
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Launch first</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{template.firstLaunch}</p>
                </article>
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Then expand</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{template.expandsTo}</p>
                </article>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {template.modules.map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={template.route}>
                  Review package
                </Link>
                <Link className="sm-button-secondary" to={rolloutLink(template.packageName)}>
                  Request rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Buyer fit</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the clearest buyer types right now.</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Tell us your current stack
          </Link>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {PUBLIC_PERSONAS.map((persona) => (
            <article className="sm-proof-card" key={persona.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">{persona.name}</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">{persona.role}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{persona.pain}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Current stack</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{persona.stack}</p>
                </article>
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Start with</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{persona.firstLaunch}</p>
                </article>
              </div>
              <p className="mt-4 text-sm text-white/80">Expands to: {persona.expandsTo}</p>
              <div className="mt-5">
                <Link className="sm-link" to={persona.route}>
                  Review package
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <p className="sm-kicker text-[var(--sm-accent-alt)]">Case study</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold text-white lg:text-4xl">Yangon Tyre shows what the full system looks like.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              One role-based portal brings sales, operations, quality, maintenance, and leadership into the same working system.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {caseStudyLanes.map((item) => (
                <article className="sm-chip text-white" key={item}>
                  <p className="text-sm leading-relaxed">{item}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/clients/yangon-tyre">
                Read case study
              </Link>
              <Link className="sm-button-secondary" to={rolloutLink('Yangon Tyre portal')}>
                Request rollout
              </Link>
            </div>
          </div>
          <div className="sm-home-showcase-stack">
            <LiveProductPreview variant="ytf-portal" />
            <LiveProductPreview compact variant="tenant-control" />
          </div>
        </div>
      </section>
    </div>
  )
}
