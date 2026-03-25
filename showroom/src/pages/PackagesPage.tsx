import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { packages } from '../content'

const deliverySteps = [
  'Pick one workflow and one owner group first.',
  'Connect the smallest useful data surface.',
  'Ship one live control board or summary view.',
  'Review usage, fix weak points, then expand.',
]

export function PackagesPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="How We Work"
        title="Start with one workflow. Expand only after proof."
        description="We do not begin with a heavy ERP rollout. We begin with one useful operating slice and grow from there."
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {packages.map((pkg) => (
          <article className="sm-surface p-6" key={pkg.name}>
            <p className="sm-kicker text-[var(--sm-accent)]">{pkg.name}</p>
            <p className="mt-2 text-3xl font-extrabold text-white">{pkg.timeline}</p>
            <p className="mt-2 text-sm font-medium text-[var(--sm-accent-alt)]">{pkg.commercialModel}</p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{pkg.bestFor}</p>
            <ul className="mt-5 space-y-3 text-sm text-[var(--sm-muted)]">
              {pkg.deliverables.map((deliverable) => (
                <li className="sm-chip text-white" key={deliverable}>
                  {deliverable}
                </li>
              ))}
            </ul>
            <Link className="sm-button-accent mt-5" to={`/contact?intent=proposal&package=${encodeURIComponent(pkg.name)}`}>
              Start with {pkg.name}
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What we need</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Usually less than teams expect.</h2>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">A Gmail account, shared mailbox, or forwarded threads</div>
            <div className="sm-chip text-white">A Drive folder, Sheets tracker, or existing file set</div>
            <div className="sm-chip text-white">One owner map and one review cadence</div>
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Delivery rhythm</p>
          <h2 className="mt-3 text-2xl font-bold text-white">How a rollout actually lands.</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {deliverySteps.map((step, index) => (
              <div className="sm-chip text-white" key={step}>
                <p className="font-mono text-[var(--sm-accent)]">0{index + 1}</p>
                <p className="mt-2 text-sm">{step}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
