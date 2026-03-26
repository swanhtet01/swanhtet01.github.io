import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import type { Product } from '../content'
import { products, servicePacks } from '../content'

const moduleRoutes: Record<string, string> = {
  'Action OS': '/workspace',
  'Ops Intake': '/ops-intake',
  'Supplier Watch': '/workspace',
  'Receiving Control': '/receiving-control',
  'Inventory Pulse': '/inventory-pulse',
  'Quality Closeout': '/workspace',
  'Cash Watch': '/workspace',
  'Production Pulse': '/workspace',
  'Sales Signal': '/workspace',
}

const groupedModules = servicePacks.map((pack) => ({
  ...pack,
  modules: pack.includes
    .map((name) => products.find((product) => product.name === name))
    .filter((product): product is Product => Boolean(product)),
}))

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Modules"
        title="One wedge product. Then the modules that make the business easier to run."
        description="Action OS is the first thing we want a client to trust. The modules below are the deeper operating layers we add after that."
      />

      <section className="sm-surface-deep p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Main product</p>
        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <h2 className="mt-3 text-4xl font-bold text-white">Action OS</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
              One action board for managers and directors. This is the first system to sell, the first system to deploy, and the first system that should become part of the team’s daily rhythm.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/platform">
                See Action OS
              </Link>
              <Link className="sm-button-secondary" to="/workspace">
                Open live view
              </Link>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              'One owner queue',
              'One blocker list',
              'One director summary',
            ].map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {groupedModules.map((group) => (
        <section className="space-y-4" key={group.name}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{group.audience}</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{group.name}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{group.promise}</p>
            </div>
            <Link className="sm-link" to={`/contact?package=${encodeURIComponent(group.name)}`}>
              Book this rollout
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {group.modules.map((product) => (
              <article className="sm-surface-soft p-6" key={product.name}>
                <h3 className="text-2xl font-bold text-white">{product.name}</h3>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.tagline}</p>
                <div className="mt-5 grid gap-2">
                  {product.deliverables.slice(0, 3).map((item) => (
                    <div className="sm-chip text-white" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className="sm-button-secondary" to={moduleRoutes[product.name] || '/workspace'}>
                    Open
                  </Link>
                  <Link className="sm-button-accent" to={`/contact?package=${encodeURIComponent(product.name)}`}>
                    Use on my data
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
