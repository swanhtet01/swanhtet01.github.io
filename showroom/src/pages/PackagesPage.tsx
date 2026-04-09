import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { useCases } from '../content'

export function PackagesPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Use cases"
        title="Start with the function that hurts first."
        description="SUPERMEGA.dev works best when it starts with one real workflow the team already feels every day."
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {useCases.map((useCase) => (
          <article className="sm-surface p-6" key={useCase.name}>
            <p className="sm-kicker text-[var(--sm-accent)]">{useCase.audience}</p>
            <h2 className="mt-3 text-3xl font-extrabold text-white">{useCase.name}</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{useCase.promise}</p>

            <div className="mt-5 grid gap-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">First rollout</p>
                <p className="mt-2 text-sm">{useCase.firstRollout}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              {useCase.outcomes.map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>

            <Link className="sm-button-accent mt-5" to={`/contact?package=${encodeURIComponent(useCase.name)}`}>
              Start rollout
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What we usually need</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">One inbox, sheet, or file source</div>
            <div className="sm-chip text-white">One owner map</div>
            <div className="sm-chip text-white">One review rhythm</div>
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Rollout rule</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Keep the first win small.</h2>
          <div className="mt-5 grid gap-3">
            {[
              'Ship one board or one queue first.',
              'Make it part of the team rhythm.',
              'Only then add the next module.',
            ].map((step) => (
              <div className="sm-chip text-white" key={step}>
                {step}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
