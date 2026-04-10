import { Link } from 'react-router-dom'

import { enterpriseSignals, ytfDeployment } from '../content'
import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'

const platformLayers = [
  {
    name: 'Products',
    detail: 'Find Clients, Company List, and Receiving Control are the starting screens teams open.',
  },
  {
    name: 'Connections',
    detail: 'Gmail, Drive, Sheets, CSV, uploads, ERP exports, and APIs feed the same records.',
  },
  {
    name: 'Control',
    detail: 'Roles, approvals, history, tenant scope, and agent runs sit under every workflow.',
  },
] as const

export function PlatformNarrativePage() {
  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow="Enterprise setup"
        title="One system behind the demos."
        description="Start with one live product. Keep data, roles, approvals, and tenant rollout on the same base."
      />

      <section className="grid gap-4 md:grid-cols-3">
        {platformLayers.map((item) => (
          <article className="sm-demo-link sm-demo-link-card" key={item.name}>
            <strong>{item.name}</strong>
            <span>{item.detail}</span>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">What is live now</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Start from the product, not the architecture.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Open one of the live products first. Add the wider enterprise layer only if that workflow is worth rolling out.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STARTER_PACK_DETAILS.map((product) => (
            <article className="sm-demo-link sm-demo-link-card" key={product.id}>
              <strong>{product.name}</strong>
              <span>{product.promise}</span>
              <Link className="sm-link mt-1" to={product.proofTool.route}>
                Open demo
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise controls</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are already part of the base.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The point is to keep the rollout real, not to add another layer of tooling.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {enterpriseSignals.slice(0, 6).map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Example tenant</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">{ytfDeployment.domain}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Same base, different company. That is the point of the platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/products">
            View products
          </Link>
        </div>
      </section>
    </div>
  )
}
