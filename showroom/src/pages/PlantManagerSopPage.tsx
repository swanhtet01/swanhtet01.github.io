import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { PLANT_MANAGER_CAPTURE_MODES, PLANT_MANAGER_CORE_SOPS, PLANT_MANAGER_VALUE_MODULES } from '../lib/plantManagerSopModel'

export function PlantManagerSopPage() {
  const tenant = getTenantConfig()

  return (
    <div className="space-y-8 pb-10">
      <PageIntro
        eyebrow={`${getTenantBrandLabel(tenant)} / Manager SOPs`}
        title="Manager SOPs."
        description="Use these routines to run the platform. Keep the actions short for managers and supervisors; let the system carry the hidden standard behind them."
      />

      <section className="sm-calm-surface flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="sm-kicker text-[var(--sm-accent)]">Plant manager rule</p>
          <h2 className="text-3xl font-bold text-white">Start small: review, clarify, work, handoff.</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Do not train managers on the whole system. Train them on a small routine: Plant Manager first, Action Board for messy updates, then the owning desk,
            then a clean handoff.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/plant-manager">
            Open Plant OS
          </Link>
          <Link className="sm-button-secondary" to="/app/action-board">
            Open action board
          </Link>
          <Link className="sm-button-secondary" to="/app/daily-entry">
            Open daily entry
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Core SOPs', value: String(PLANT_MANAGER_CORE_SOPS.length), detail: 'The routines managers should repeat.' },
          { label: 'Core modules', value: String(PLANT_MANAGER_VALUE_MODULES.length), detail: 'The desks that add real value for plant control.' },
          { label: 'Capture modes', value: String(PLANT_MANAGER_CAPTURE_MODES.length), detail: 'Portal first, bridge tools only when needed.' },
          { label: 'Manager outcome', value: 'One clear next move', detail: 'Every routine should end with an owner and a due window.' },
        ].map((item) => (
          <article className="sm-manager-stat" key={item.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
            <p className="mt-3 text-2xl font-bold text-white">{item.value}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What you should use as Plant Manager</p>
          <h2 className="mt-2 text-3xl font-bold text-white">These are the actual value-added modules.</h2>
          <div className="mt-6 grid gap-3">
            {PLANT_MANAGER_VALUE_MODULES.map((module) => (
              <Link className="sm-manager-row" key={module.id} to={module.route}>
                <div>
                  <p className="font-semibold text-white">{module.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Use cadence: {module.cadence}</p>
                  <p className="mt-2 text-sm text-white/84">{module.whyItMatters}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Use when: {module.useWhen}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Capture shape</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Use the portal first. Use AppSheet or Google Forms only as bridges.</h2>
          <div className="mt-6 grid gap-3">
            {PLANT_MANAGER_CAPTURE_MODES.map((mode) => (
              <article className="sm-manager-method" key={mode.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{mode.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{mode.whenToUse}</p>
                  </div>
                  <span className="sm-status-pill">{mode.recommendation}</span>
                </div>
                <div className="mt-4 grid gap-2">
                  {mode.flow.map((step) => (
                    <div className="sm-manager-rule" key={step}>
                      <span className="sm-led text-[var(--sm-accent)]" />
                      <p className="text-sm text-white/84">{step}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-[var(--sm-muted)]">{mode.note}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Core SOP stack</p>
        <h2 className="mt-2 text-3xl font-bold text-white">These are the manager routines to train and repeat.</h2>
        <div className="mt-6 grid gap-4">
          {PLANT_MANAGER_CORE_SOPS.map((sop) => (
            <article className="sm-proof-card" key={sop.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{sop.label}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{sop.title}</h3>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">{sop.goal}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="sm-status-pill">{sop.cadence}</span>
                  <Link className="sm-status-pill" to={sop.primaryRoute}>
                    {sop.primaryLabel}
                  </Link>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="grid gap-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Trigger</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{sop.trigger}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Who uses it</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{sop.ownerRoles.join(' / ')}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Hidden control</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{sop.hiddenControl}</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <article className="sm-manager-method">
                    <p className="font-semibold text-white">What to do</p>
                    <div className="mt-4 grid gap-2">
                      {sop.steps.map((step, index) => (
                        <div className="sm-manager-rule" key={step}>
                          <span className="sm-manager-rule-index">{index + 1}</span>
                          <p className="text-sm text-white/84">{step}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="sm-manager-method">
                    <p className="font-semibold text-white">What to record</p>
                    <div className="mt-4 grid gap-2">
                      {sop.evidence.map((item) => (
                        <div className="sm-manager-rule" key={item}>
                          <span className="sm-led text-[var(--sm-accent)]" />
                          <p className="text-sm text-white/84">{item}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="sm-manager-method">
                    <p className="font-semibold text-white">Escalate when</p>
                    <p className="mt-3 text-sm text-[var(--sm-muted)]">{sop.escalation}</p>
                  </article>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
