import { Link } from 'react-router-dom'

import { EnterpriseSolutionCanvas } from '../components/EnterpriseSolutionCanvas'
import { getTenantConfig } from '../lib/tenantConfig'

const proofCards = [
  {
    title: 'Role-based homes',
    detail: 'Sales, operations, quality, maintenance, and leadership open different desks on the same operating record.',
  },
  {
    title: 'Current data first',
    detail: 'Drive files, exports, requests, and manual updates stay attached to the work instead of being copied into side tools.',
  },
  {
    title: 'Guarded AI',
    detail: 'AI drafts, routes, and summarizes. Releases, supplier actions, and policy moves still pass review.',
  },
] as const

const launchDesks = [
  {
    title: 'Manager System',
    route: '/app/manager-system',
    detail: 'Daily entry, blockers, and next actions.',
  },
  {
    title: 'Operations Command',
    route: '/app/operations',
    detail: 'Issues, approvals, and supplier follow-up.',
  },
  {
    title: 'DQMS Desk',
    route: '/app/dqms',
    detail: 'Incidents, root cause, CAPA, and closeout.',
  },
] as const

const rolloutPoints = [
  'The first release can start with one team and one desk.',
  'The same system can expand into broader company control later.',
] as const

export function YangonTyrePage() {
  const tenant = getTenantConfig()
  const isClientTenant = tenant.key === 'ytf-plant-a'

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Case study / Yangon Tyre</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">A client portal that grows into a company system.</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Yangon Tyre is the reference rollout: one portal, role-based desks, connected current data, and guarded AI support.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={isClientTenant ? '/app/portal' : '/contact?package=Yangon%20Tyre%20portal'}>
                {isClientTenant ? 'Open portal' : 'Start rollout'}
              </Link>
              <Link className="sm-link self-center" to="/products">
                Back to products
              </Link>
            </div>
            <div className="mt-8 space-y-3">
              {rolloutPoints.map((point) => (
                <div className="sm-site-point" key={point}>
                  <span className="sm-site-point-dot" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <EnterpriseSolutionCanvas solutionId="client-workspace" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {proofCards.map((item) => (
          <article className="sm-proof-card" key={item.title}>
            <p className="font-semibold text-white">{item.title}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="sm-section-heading">
            <p className="sm-kicker text-[var(--sm-accent)]">First desks</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Open the working route first.</h2>
          </div>
          {isClientTenant ? (
            <Link className="sm-link" to="/app/portal">
              Open client portal
            </Link>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {launchDesks.map((desk) => (
            <article className="sm-proof-card" key={desk.title}>
              <p className="font-semibold text-white">{desk.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{desk.detail}</p>
              <p className="mt-4 text-sm font-semibold text-white">{desk.route}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
