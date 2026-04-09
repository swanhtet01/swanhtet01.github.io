import { Link } from 'react-router-dom'

import { hero, publicModules } from '../content'
import { trackEvent } from '../lib/analytics'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'

const usageModes = [
  {
    name: 'For your team',
    detail: 'Run your own operations, approvals, lists, and automations in one place.',
  },
  {
    name: 'For your own workspace',
    detail: 'Use the same system for your own notes, tasks, daily review, and follow-up.',
  },
  {
    name: 'For clients',
    detail: 'Reuse the same base for client portals, shared workflows, and managed delivery.',
  },
  {
    name: 'For self-hosted builds',
    detail: 'Keep shared code reusable while client data and private workflows stay separate.',
  },
] as const

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function HomePage() {
  const featuredProducts = STARTER_PACK_DETAILS

  return (
    <div className="pb-16">
      <section className="sm-site-bleed sm-site-hero">
        <div className="sm-site-hero-grid">
          <div className="sm-site-hero-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">{hero.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/contact">
                Start onboarding
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('offer_open_click', { offer: 'Find Clients' })} to="/find-companies">
                Open live module
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-[var(--sm-muted)]">
              <span>Live now: Find Clients</span>
              <span>Company List</span>
              <span>Receiving Log</span>
              <span>Gmail, Drive, Sheets, CSV, API</span>
              <span>Shared data</span>
              <span>Automation</span>
            </div>
          </div>

          <div className="sm-site-stage" aria-label="SuperMega live portal preview">
            <img alt="SuperMega company list module" className="sm-site-shot sm-site-shot-main object-cover object-top" src="/site/company-list-live.png" />
            <img alt="SuperMega find clients module" className="sm-site-shot sm-site-shot-top object-cover object-top" src="/site/find-clients-live.png" />
            <img alt="SuperMega receiving control module" className="sm-site-shot sm-site-shot-bottom object-cover object-top" src="/site/receiving-control-live.png" />
          </div>
        </div>
      </section>

      <section className="mt-12 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Real products now. One connected system behind them.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Start with one product, connect the tools you already use, and keep one workflow moving. Add shared data, permissions, and automation as the team grows.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {featuredProducts.map((product) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
              <img
                alt={`${product.name} live screenshot`}
                className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
                loading="lazy"
                src={product.image}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="font-semibold">{product.name}</p>
                <span className="sm-status-pill">Live now</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">Starts with {product.starterModules.join(' + ')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={contactLink(product.name)}>
                  Start onboarding
                </Link>
                <Link className="sm-button-secondary" to={product.proofTool.route}>
                  Open live module
                </Link>
              </div>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={`/products/${product.slug}`}>
                View product details
              </Link>
            </article>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
          These screenshots are from live public modules, not placeholder mockups. We connect them to Gmail, Google Drive, Sheets, CSV exports, ERP data, APIs, and the workflow your team already uses.
        </p>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Platform model</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">Products, shared data, and automation in one connected system.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Every product shares the same base: connected data, rules, permissions, and background automations. That is how one product can grow into a full company system without adding more tool sprawl.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-secondary" to="/platform">
            See how it works
          </Link>
          <Link className="sm-button-secondary" to="/products">
            View all products
          </Link>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Use Cases</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">Use the same base for your team, your own workspace, or client delivery.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            SuperMega is not just for external software. The same system can run your internal tools, your own workspace, and client-facing products.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {usageModes.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <article className="sm-surface p-6 lg:p-8">
            <p className="sm-kicker text-[var(--sm-accent)]">Onboarding</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Start with one workflow and the data you already have.</h2>
            <div className="mt-6 space-y-3">
              {[
                'Pick the first workflow that is still trapped in chat, sheets, or inboxes.',
                'Import the current rows, notes, files, and owner context into the matching product.',
                'Launch the first live screen for the team that uses it every day.',
                'Add automations and extra controls once the base workflow is trusted.',
              ].map((item, index) => (
                <div className="sm-site-point" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{index + 1}. {item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact">
                Start onboarding
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See products
              </Link>
            </div>
          </article>

          <article className="sm-terminal p-6 lg:p-8">
            <p className="sm-kicker text-[var(--sm-accent)]">What ships first</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                'One mapped workflow',
                'Imported data from your current tools',
                'One live screen for the team',
                'One shared list or queue',
                'Roles and permissions',
                'Connected automation',
              ].map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-[var(--sm-muted)]">
              Common starting inputs: Gmail, Google Drive, Sheets, CSV exports, ERP exports, APIs, form submissions, WhatsApp notes, and internal task updates.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live modules</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">Open the live products now, then connect them into a full system.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These are working entry points, not design placeholders.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {publicModules.map((item) => (
            <article className="sm-chip text-white" key={item.name}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{item.name}</p>
                <span className="sm-status-pill">Live now</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">Best for {item.bestFor}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">Outputs: {item.outputs.join(', ')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to={item.path}>
                  Open live module
                </Link>
                <Link className="sm-button-primary" to={contactLink(item.name)}>
                  Start onboarding
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Start with one workflow. Turn it into working software.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Tell us the process, the tools you already use, and who needs the first live screen. We will map the right product, the connections, and the rollout.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start onboarding
          </Link>
          <Link className="sm-button-secondary" to="/find-companies">
            Open live software
          </Link>
          <Link className="sm-button-secondary" to="/products">
            View products
          </Link>
        </div>
      </section>
    </div>
  )
}
