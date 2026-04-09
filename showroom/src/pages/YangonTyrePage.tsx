import { Link } from 'react-router-dom'

import { enterpriseSignals, ytfDeployment } from '../content'

export function YangonTyrePage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{ytfDeployment.domain}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Yangon Tyre Plant A on one live operating system.</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{ytfDeployment.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Named tenant workspace</span>
              <span className="sm-status-pill">Role-based access</span>
              <span className="sm-status-pill">Gmail, Drive, Sheets, ERP exports</span>
              <span className="sm-status-pill">Agent operations</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/login">
                Team login
              </Link>
              <Link className="sm-button-secondary" to="/receiving-log">
                Open receiving queue
              </Link>
              <Link className="sm-button-secondary" to="/platform">
                Review operating model
              </Link>
            </div>
          </div>

          <article className="sm-site-proof-panel overflow-hidden">
            <div className="sm-site-proof-head">
              <span>Live tenant</span>
              <span>Receiving + approvals + management review</span>
            </div>
            <img
              alt="Yangon Tyre receiving control module"
              className="aspect-[16/10] w-full border-b border-white/8 object-cover object-top"
              src="/site/receiving-control-live.png"
            />
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <div className="sm-demo-mini">
                <strong>{ytfDeployment.modules.length} modules</strong>
                <span>Receiving, task control, document intake, approvals, review, and follow-up.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{ytfDeployment.roles.length} roles</strong>
                <span>Managers, procurement, quality, operators, and reviewers work from the right view.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{ytfDeployment.dataSources.length} data sources</strong>
                <span>Files, exports, inbox threads, and structured updates feed the same workspace.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{ytfDeployment.agentTeams.length} agent teams</strong>
                <span>Operators and agents share the same queues, history, and escalation rules.</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Tenant modules</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A focused operating stack instead of another heavy rollout.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The first rollout is operational: receiving, tasks, supplier follow-up, quality control, document intake, and management review. Commercial
            workflows can be added later on the same base.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {ytfDeployment.modules.map((module) => (
            <article className="sm-demo-link sm-demo-link-card" key={module}>
              <strong>{module}</strong>
              <span>Part of the live Yangon Tyre tenant stack.</span>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Roles and controls</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each user sees the right work, data, and decisions.</h2>
          <div className="mt-6 grid gap-3">
            {ytfDeployment.roles.map((role) => (
              <article className="sm-chip text-white" key={role}>
                <p className="font-semibold">{role}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {ytfDeployment.controls.map((control) => (
              <article className="sm-chip text-[var(--sm-muted)]" key={control}>
                {control}
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Connected inputs</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use the files and exports the team already has.</h2>
          <div className="mt-6 grid gap-3">
            {ytfDeployment.dataSources.map((source) => (
              <article className="sm-chip text-white" key={source}>
                {source}
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-[var(--sm-muted)]">
            The honest connector story today is imports, exports, file intake, Gmail draft workflows, Drive links, and API-backed state. Deeper sync can
            expand later as the tenant grows.
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Agent work stays inside the operating system.</h2>
          <div className="mt-6 grid gap-3">
            {ytfDeployment.agentTeams.map((team) => (
              <article className="sm-proof-card" key={team}>
                <p className="font-semibold text-white">{team}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">Runs on live tenant queues with approvals and operator review where needed.</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Enterprise layer</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This tenant is part of a wider platform model.</h2>
          <div className="mt-6 grid gap-3">
            {enterpriseSignals.map((item) => (
              <article className="sm-demo-mini" key={item.name}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the workspace or keep reviewing the operating model.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            This tenant is presented as a real branded pilot deployment with live modules, roles, workflows, and agent operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/login">
            Team login
          </Link>
          <Link className="sm-button-secondary" to="/platform">
            Enterprise setup
          </Link>
        </div>
      </section>
    </div>
  )
}
