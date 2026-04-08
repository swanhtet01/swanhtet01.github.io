import { Link } from 'react-router-dom'

import { CUSTOM_BUILD_EXAMPLES, getModuleCategoryGroups, getSystemModules, MODULE_LIBRARY, SITE_SYSTEMS } from '../lib/siteSystems'

export function ProductsPage() {
  const moduleGroups = getModuleCategoryGroups()

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Systems</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Four flagship systems. Twelve reusable modules behind them.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Keep the public story simple. Start with the system the team will actually open every day, then add modules from the same base.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm-demo-mini">
              <strong>{SITE_SYSTEMS.length} flagship systems</strong>
              <span>Sales, operations, management, and client-facing work.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>{MODULE_LIBRARY.length} focused modules</strong>
              <span>Small building blocks, not vague product names.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Open the demo first</strong>
              <span>Every flagship has a real free-to-try proof surface.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {SITE_SYSTEMS.map((system) => {
          const modules = getSystemModules(system.id)
          return (
            <article className="sm-site-module-card sm-site-module-card-dense" id={system.slug} key={system.id}>
              <div className="sm-site-module-image-wrap">
                <img alt={system.previewAlt} className="sm-site-module-image" loading="lazy" src={system.previewImage} />
              </div>
              <div className="sm-site-module-body">
                <div className="sm-site-module-head">
                  <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                  <h2 className="mt-2 text-3xl font-bold text-white lg:text-4xl">{system.name}</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{system.tagline}</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="sm-demo-mini">
                    <strong>Used by</strong>
                    <span>{system.audience}</span>
                  </div>
                  <div className="sm-demo-mini">
                    <strong>Core modules</strong>
                    <span>{modules.map((item) => item.name).join(', ')}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {system.replaces.slice(0, 3).map((item) => (
                    <span className="sm-home-tag sm-home-tag-muted" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/products/${system.slug}`}>
                    View system
                  </Link>
                  <Link className="sm-button-secondary" to={`/demos/${system.slug}`}>
                    Open demo
                  </Link>
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Module library</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The reusable parts are broader than the public headline.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              The buyer sees a simple flagship. The delivery team works from a module library that can be configured for another company.
            </p>
          </div>
          <Link className="sm-button-secondary" to="/demos">
            Browse demos
          </Link>
        </div>

        <div className="mt-8 space-y-6">
          {moduleGroups.map((group) => (
            <div key={group.category}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-white">{group.category}</h3>
                <span className="sm-status-pill">{group.modules.length} modules</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {group.modules.map((module) => (
                  <article className="sm-demo-link sm-demo-link-card" key={module.id}>
                    <strong>{module.name}</strong>
                    <span>{module.purpose}</span>
                    <small className="text-[var(--sm-muted)]">Used by: {module.users}</small>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Follow-on builds</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">When the base system is live, add a focused follow-on.</h2>
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
