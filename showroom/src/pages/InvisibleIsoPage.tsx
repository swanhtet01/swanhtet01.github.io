import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { YANGON_TYRE_DAILY_ENTRY_WORKFLOWS, YANGON_TYRE_ERP_CONTROL_CHAIN } from '../lib/yangonTyreIsoRuntime'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import {
  YANGON_TYRE_INVISIBLE_ISO_CAPTURE_MODES,
  YANGON_TYRE_INVISIBLE_ISO_COACHES,
  YANGON_TYRE_INVISIBLE_ISO_DIALECTIC,
  YANGON_TYRE_INVISIBLE_ISO_PRINCIPLES,
  YANGON_TYRE_INVISIBLE_ISO_ROADMAP,
} from '../lib/yangonTyreFrameworkModel'

export function InvisibleIsoPage() {
  const tenant = getTenantConfig()

  return (
    <div className="space-y-8 pb-10">
      <PageIntro
        eyebrow={`${getTenantBrandLabel(tenant)} / Invisible ISO`}
        title="Invisible ISO."
        description="Keep the discipline, hide the paperwork. Managers speak, review, and coach; the system turns it into structured quality and operating control."
      />

      <section className="sm-calm-surface flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="sm-kicker text-[var(--sm-accent)]">Manager rule</p>
          <h2 className="text-3xl font-bold text-white">Do not teach ISO as paperwork.</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Teach the team to report what happened, follow the short routine, and open the right desk. The platform should handle the standard, the evidence
            chain, and the follow-up structure behind the scenes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/plant-manager">
            Open plant manager
          </Link>
          <Link className="sm-button-secondary" to="/app/manager-sops">
            Open manager SOPs
          </Link>
          <Link className="sm-button-secondary" to="/app/action-board">
            Open action board
          </Link>
          <Link className="sm-button-secondary" to="/app/operations">
            Open operations
          </Link>
          <Link className="sm-button-secondary" to="/app/dqms">
            Open DQMS
          </Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Why standards matter</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Standards matter.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_INVISIBLE_ISO_DIALECTIC.thesis}</p>
        </article>
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Where rollout fails</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Paper-heavy rollout fails.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_INVISIBLE_ISO_DIALECTIC.antithesis}</p>
        </article>
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">How AI carries it</p>
          <h2 className="mt-3 text-2xl font-bold text-white">AI carries the hidden standard.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_INVISIBLE_ISO_DIALECTIC.synthesis}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Core principles</p>
          <h2 className="mt-2 text-3xl font-bold text-white">What managers should feel every day.</h2>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_INVISIBLE_ISO_PRINCIPLES.map((principle, index) => (
              <div className="sm-manager-rule" key={principle.id}>
                <span className="sm-manager-rule-index">{index + 1}</span>
                <div>
                  <p className="font-semibold text-white">{principle.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{principle.detail}</p>
                  <p className="mt-2 text-sm text-white/88">{principle.managerTranslation}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Capture modes</p>
          <h2 className="mt-2 text-3xl font-bold text-white">How the floor should actually use it.</h2>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_INVISIBLE_ISO_CAPTURE_MODES.map((mode) => (
              <article className="sm-manager-method" key={mode.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{mode.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{mode.whenToUse}</p>
                  </div>
                  <Link className="sm-status-pill" to={mode.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-2">
                  <div className="sm-manager-rule">
                    <span className="sm-led text-[var(--sm-accent)]" />
                    <p className="text-sm text-white/84">Manager move: {mode.managerAction}</p>
                  </div>
                  <div className="sm-manager-rule">
                    <span className="sm-led text-[var(--sm-accent-alt)]" />
                    <p className="text-sm text-white/84">System result: {mode.systemOutput}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Integrated runtime</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Invisible ISO now lives inside the ERP chain.</h2>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_ERP_CONTROL_CHAIN.map((step) => (
              <Link className="sm-manager-row" key={step.id} to={step.route}>
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{step.label}</p>
                  <p className="mt-2 font-semibold text-white">{step.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{step.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Guided entry workflows</p>
          <h2 className="mt-2 text-3xl font-bold text-white">The same logic now guides Daily Entry and the downstream desks.</h2>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_DAILY_ENTRY_WORKFLOWS.map((workflow) => (
              <article className="sm-proof-card" key={workflow.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{workflow.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{workflow.aiAssist}</p>
                  </div>
                  <Link className="sm-status-pill" to={workflow.owningDesk.route}>
                    {workflow.owningDesk.label}
                  </Link>
                </div>
                <div className="mt-4 grid gap-2">
                  {workflow.hiddenControls.map((item) => (
                    <div className="sm-manager-rule" key={item}>
                      <span className="sm-led text-[var(--sm-accent-alt)]" />
                      <p className="text-sm text-white/88">{item}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Role-specific AI coaches</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Train each manager with the routine they already own.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These are not generic chat prompts. They are working manager patterns tied to the desks already in the portal.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {YANGON_TYRE_INVISIBLE_ISO_COACHES.map((coach) => (
            <article className="sm-proof-card" key={coach.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{coach.role}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{coach.title}</h3>
                </div>
                <Link className="sm-status-pill" to={coach.route}>
                  Open desk
                </Link>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Old way</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{coach.oldWay}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">AI-native way</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{coach.aiWay}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[rgba(5,10,18,0.56)] px-4 py-3">
                  <p className="sm-kicker text-[var(--sm-accent)]">Manager prompt pattern</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/88">{coach.managerPrompt}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Sixteen-week rollout</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Build habit first, then depth.</h2>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_INVISIBLE_ISO_ROADMAP.map((step) => (
              <article className="sm-manager-method" key={step.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{step.label}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{step.focus}</p>
                  </div>
                  <span className="sm-status-pill">{step.timing}</span>
                </div>
                <p className="mt-4 text-sm text-white/84">{step.outcome}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Manager language</p>
          <h2 className="mt-2 text-3xl font-bold text-white">What to say when training the team.</h2>
          <div className="mt-6 grid gap-3">
            {[
              'Do not say ISO first. Say: this helps us fix problems faster and go home with a cleaner handoff.',
              'If updates are messy, paste them into Action Board first and let the system sort owner, timing, and next move.',
              'Ask for a short voice update, one photo, and one next action instead of a long explanation.',
              'Review the generated record with the supervisor, then coach the missing part instead of rewriting everything yourself.',
              'Use the same route every day so the team learns by repetition, not by training slides.',
            ].map((item, index) => (
              <div className="sm-manager-rule" key={item}>
                <span className="sm-manager-rule-index">{index + 1}</span>
                <p className="text-sm leading-relaxed text-white/92">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/adoption-command">
              Open adoption command
            </Link>
            <Link className="sm-button-secondary" to="/app/workforce">
              Open workforce
            </Link>
            <Link className="sm-button-secondary" to="/app/portal">
              Open tenant portal
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
