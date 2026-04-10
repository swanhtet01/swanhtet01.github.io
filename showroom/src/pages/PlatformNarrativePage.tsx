import { Link } from 'react-router-dom'

import { enterpriseSignals, ytfDeployment } from '../content'
import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'

const systemPrinciples = [
  'Keep the queue, file, note, approval, and next action attached to one record.',
  'Let agents prepare work, but keep the risky writes behind human review.',
  'Use one shared base so products, tenants, and internal operations do not drift apart.',
] as const

const runtimeLayers = [
  {
    name: 'Data in',
    detail: 'Gmail, Drive, Sheets, CSV, ERP exports, uploads, and APIs feed the same records instead of staying in separate tools.',
  },
  {
    name: 'Workflow',
    detail: 'Owners, priorities, approvals, escalations, and handoffs stay attached to the work that actually changed.',
  },
  {
    name: 'Control',
    detail: 'Tenant scope, roles, audit history, connector health, and agent runs sit under the products by default.',
  },
] as const

const currentGaps = [
  'Deeper tenant isolation across every operational table.',
  'Stronger RBAC with SSO, MFA, and finer policy rules.',
  'Broader connector depth and more durable sync coverage.',
] as const

export function PlatformNarrativePage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Enterprise setup"
        title="This is the system behind the demos."
        description="Start with one live product, then keep roles, approvals, history, connectors, and AI agents on the same shared base as the system grows."
      />

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What it solves</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Replace the handoff mess, not just one screen.</h2>
          <div className="mt-6 space-y-3">
            {systemPrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-proof-panel">
          <div className="sm-site-proof-head">
            <span>What is live today</span>
            <span>Products first, enterprise base underneath</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {STARTER_PACK_DETAILS.map((product) => (
              <div className="sm-demo-mini" key={product.id}>
                <strong>{product.name}</strong>
                <span>{product.promise}</span>
                <small className="text-[var(--sm-muted)]">Starts with: {product.starterModules.join(' + ')}</small>
              </div>
            ))}
          </div>
          <div className="sm-site-proof-foot">
            <span>Open a live product first. Bring in the wider system only where the workflow needs it.</span>
            <div className="flex flex-wrap gap-4">
              <Link className="sm-link" to="/products">
                View products
              </Link>
              <Link className="sm-link" to="/contact">
                Start rollout
              </Link>
            </div>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise layer</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These controls are part of the platform, not extra add-ons.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            A real rollout needs more than a polished demo. It needs security, ownership, history, and predictable system behavior.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {enterpriseSignals.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">How the runtime works</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">One shared system, three layers.</h2>
          <div className="mt-6 grid gap-4">
            {runtimeLayers.map((item) => (
              <article className="sm-proof-card" key={item.name}>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Example client workspace</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{ytfDeployment.domain}</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{ytfDeployment.summary}</p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.modules.join(', ')}</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Roles</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.roles.join(', ')}</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Data sources</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.dataSources.join(', ')}</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Controls</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.controls.join(', ')}</p>
            </article>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Honest next work</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The right next investment is runtime depth, not more noise.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The platform is real enough to sell and demo today. The next engineering work should deepen isolation, policy, and connectors.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {currentGaps.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item}>
              <strong>Next gap</strong>
              <span>{item}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Bring one workflow and the current data around it.</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
            We will map the first live module, the connectors, the roles, and the rollout order instead of selling a giant transformation story.
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
