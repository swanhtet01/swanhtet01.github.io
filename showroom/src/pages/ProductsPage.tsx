import { Link } from 'react-router-dom'

import { SystemDemoCanvas } from '../components/SystemDemoCanvas'
import { CUSTOM_BUILD_EXAMPLES, SITE_SYSTEMS } from '../lib/siteSystems'

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Systems</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">These are the systems we actually sell.</h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Open the demos. See what the working surface looks like. Then decide whether one of these fits your workflow.
          </p>
        </div>
      </section>

      <section className="space-y-8">
        {SITE_SYSTEMS.map((system, index) => (
          <article className="sm-product-row" key={system.id}>
            <div className={index % 2 === 0 ? 'order-2 lg:order-1' : 'order-2'}>
              <div className="sm-product-copy">
                <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">{system.name}</h2>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{system.summary}</p>
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <div className="sm-demo-mini">
                    <strong>Replaces</strong>
                    <span>{system.replaces.join(', ')}</span>
                  </div>
                  <div className="sm-demo-mini">
                    <strong>Daily use</strong>
                    <span>{system.dailyUse.join(', ')}</span>
                  </div>
                  <div className="sm-demo-mini">
                    <strong>Next</strong>
                    <span>{system.nextBuilds.join(', ')}</span>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/products/${system.slug}`}>
                    View system
                  </Link>
                  <Link className="sm-button-secondary" to={`/demos/${system.slug}`}>
                    Open demo
                  </Link>
                  <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(system.name)}`}>
                    Contact
                  </Link>
                </div>
              </div>
            </div>
            <div className={index % 2 === 0 ? 'order-1 lg:order-2' : 'order-1'}>
              <SystemDemoCanvas scenario={system.scenarios[0]} />
            </div>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Also build</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">When the workflow is clear, we extend from the same base.</h2>
          </div>
          <Link className="sm-button-secondary" to="/contact">
            Contact
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {CUSTOM_BUILD_EXAMPLES.map((item) => (
            <div className="sm-demo-mini" key={item}>
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
