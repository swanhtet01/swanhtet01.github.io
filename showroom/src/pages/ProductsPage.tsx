import { Link, useLocation } from 'react-router-dom'

import { publicModules, siteExamples, siteShowcases } from '../content'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

function SystemsView() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Systems</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
          The operating layer we build for sales, operations, and management.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
          Each system starts from a real workflow and ends in one queue, one source of truth, and one cleaner daily rhythm for the team.
        </p>
      </section>

      <section className="space-y-8">
        {siteShowcases.map((showcase, index) => (
          <article className={`sm-site-case ${index % 2 === 1 ? 'sm-site-case-reverse' : ''}`} key={showcase.name}>
            <div className="sm-site-case-copy">
              <p className="sm-kicker text-[var(--sm-accent)]">{showcase.eyebrow}</p>
              <h2 className="mt-3 max-w-xl text-3xl font-bold text-white lg:text-4xl">{showcase.name}</h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{showcase.summary}</p>
              <div className="mt-6 space-y-3">
                {showcase.points.map((point) => (
                  <div className="sm-site-point" key={point}>
                    <span className="sm-site-point-dot" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <div className="mt-7">
                <Link className="sm-button-secondary" to={showcase.route}>
                  Contact us about {showcase.name}
                </Link>
              </div>
            </div>
            <div className="sm-site-case-visual">
              <img alt={showcase.name} className="sm-site-case-image" src={showcase.image} />
            </div>
          </article>
        ))}
      </section>

      <section className="sm-site-final">
        <div>
          <p className="text-xl font-semibold text-white">Need something outside the examples?</p>
          <p className="mt-2 max-w-2xl text-sm text-[var(--sm-muted)]">
            We also build client portals, learning hubs, approvals, document intake, and other internal systems when the workflow is clear.
          </p>
        </div>
        <Link className="sm-button-primary" to="/contact">
          Contact us
        </Link>
      </section>
    </div>
  )
}

function TemplatesView() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Examples</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
          Example systems, rollout patterns, and proof tools.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
          These are the fastest ways to see how we structure work. Some are ready to ship now. Others are the next builds on the same operating model.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {siteExamples.map((example) => (
          <article className="sm-example-card" key={example.name}>
            <div className="sm-example-image-wrap">
              <img alt={example.name} className="sm-example-image" src={example.image} />
            </div>
            <div className="sm-example-copy">
              <div className="flex items-center justify-between gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">{example.category}</p>
                <span className="sm-status-pill">{example.live ? 'Ready now' : 'Next up'}</span>
              </div>
              <h2 className="mt-3 text-2xl font-bold text-white">{example.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{example.detail}</p>
              <div className="mt-5">
                <Link className="sm-button-secondary" to={contactLink(example.name)}>
                  Ask about this build
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Free proof tools</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              The tools below are not the whole company. They are just quick ways to test the workflow shape before a rollout.
            </p>
          </div>
          <Link className="sm-button-primary" to="/contact">
            Contact us
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {publicModules.map((item) => (
            <article className="sm-chip text-white" key={item.name}>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={item.path}>
                Open tool
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function ProductsPage() {
  const location = useLocation()
  const isTemplatePage = location.pathname.startsWith('/templates')
  return isTemplatePage ? <TemplatesView /> : <SystemsView />
}
