import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  YANGON_TYRE_ADOPTION_METRICS,
  YANGON_TYRE_ADOPTION_PRINCIPLES,
  YANGON_TYRE_INSIGHT_CADENCES,
  YANGON_TYRE_ROLE_PLAYBOOKS,
  YANGON_TYRE_ROLLOUT_WAVES,
} from '../lib/yangonTyreAdoptionModel'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'

const managerRules = [
  'Supervisors and managers must run the daily review from the portal, not from chat screenshots or side spreadsheets.',
  'Do not ask staff to enter data twice. If a form is mandatory, it must replace an old tracker or chat ritual.',
  'Every high-severity entry needs an owner, due date, and next action before the review closes.',
  'Start with the smallest required fields that still produce a useful queue and useful insight.',
] as const

export function AdoptionPlaybookPage() {
  const nextModules = YANGON_TYRE_MODEL.modules.filter((module) => module.status === 'Next module')

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Adoption playbook"
        title="Make the portal useful enough that staff actually use it."
        description="This is the operating adoption layer for Yangon Tyre: who enters what, when they enter it, what insight comes back out, and what managers have to review in the system. Use Adoption Command for the live score and intervention view."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">2024 output</p>
          <p className="mt-3 text-3xl font-bold text-white">{YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Bias tyres in the local monthly workbook.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">B+R baseline</p>
          <p className="mt-3 text-3xl font-bold text-white">{YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}%</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">If entry discipline improves, root-cause review gets sharper faster.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Top defect focus</p>
          <p className="mt-3 text-3xl font-bold text-white">{YANGON_TYRE_DATA_PROFILE.topDefects[0]}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Current defect pattern should shape the first review loops.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Adoption target</p>
          <p className="mt-3 text-3xl font-bold text-white">Daily use</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">The goal is operational dependence, not passive dashboard viewing.</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">How to adjust the rollout</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Do not sell it internally as software. Make it the job path.</h2>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_ADOPTION_PRINCIPLES.map((item) => (
              <article className="sm-proof-card" key={item.title}>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Manager non-negotiables</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Staff will follow the review system management actually uses.</h2>
          <div className="mt-6 space-y-3">
            {managerRules.map((rule) => (
              <div className="sm-chip text-white" key={rule}>
                {rule}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/operations">
              Open operations
            </Link>
            <Link className="sm-button-secondary" to="/app/adoption-command">
              Open adoption command
            </Link>
            <Link className="sm-button-secondary" to="/app/insights">
              Open insights
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Role playbooks</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Each role needs a simple reason to use the portal every day.</h2>
          </div>
          <span className="sm-status-pill">Role-based adoption</span>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {YANGON_TYRE_ROLE_PLAYBOOKS.map((playbook) => (
            <article className="sm-proof-card" key={playbook.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{playbook.role}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{playbook.home}</h3>
                </div>
                <Link className="sm-link" to={playbook.route}>
                  Open home
                </Link>
              </div>
              <p className="mt-4 text-sm text-white/80">Use it: {playbook.frequency}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Must capture</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {playbook.mustCapture.map((item) => (
                      <span className="sm-status-pill" key={`${playbook.id}-capture-${item}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">What they get back</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {playbook.usefulOutputs.map((item) => (
                      <span className="sm-status-pill" key={`${playbook.id}-output-${item}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Manager cadence</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{playbook.managerCadence}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Adjustment moves</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                    {playbook.changeMoves.map((item) => (
                      <p key={`${playbook.id}-move-${item}`}>{item}</p>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Data entry surfaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Keep entry tied to real work lanes.</h2>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_MODEL.dataEntrySurfaces.map((surface) => (
              <article className="sm-proof-card" key={surface.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{surface.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{surface.users.join(' / ')}</p>
                  </div>
                  {surface.route ? (
                    <Link className="sm-link" to={surface.route}>
                      Open surface
                    </Link>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Captures</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{surface.captures.join(' / ')}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality rules</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{surface.qualityRules.join(' / ')}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Insight rituals</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Turn entry into something management can act on.</h2>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_INSIGHT_CADENCES.map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {item.owner} | {item.cadence}
                    </p>
                  </div>
                  <span className="sm-status-pill">{item.cadence}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Inputs</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.inputs.join(' / ')}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.outputs.join(' / ')}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{item.why}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Adoption scorecard</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Measure usage the same way you measure production and quality.</h2>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_ADOPTION_METRICS.map((metric) => (
              <article className="sm-proof-card" key={metric.name}>
                <p className="font-semibold text-white">{metric.name}</p>
                <p className="mt-3 text-lg font-bold text-white">{metric.target}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{metric.why}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">What else next</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Continue in three waves, then build the next modules on clean data.</h2>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_ROLLOUT_WAVES.map((wave) => (
              <article className="sm-proof-card" key={wave.id}>
                <p className="font-semibold text-white">{wave.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{wave.outcome}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {wave.moves.map((move) => (
                    <span className="sm-status-pill" key={`${wave.id}-${move}`}>
                      {move}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Next modules to keep building</p>
            <div className="mt-3 grid gap-3">
              {nextModules.map((module) => (
                <article className="sm-chip text-white" key={module.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{module.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.summary}</p>
                    </div>
                    {module.route ? (
                      <Link className="sm-link" to={module.route}>
                        Open route
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
