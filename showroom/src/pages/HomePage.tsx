import { Link } from 'react-router-dom'

import { caseStudies, engagementFlow, packages, solutions } from '../content'

export function HomePage() {
  return (
    <div className="space-y-10 lg:space-y-14">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="animate-rise rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.8)] lg:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">SuperMega Showroom</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 lg:text-5xl">
            AI agents and automation partner for Myanmar SMBs.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-700 lg:text-lg">
            We design and run practical AI systems that help owners and directors execute faster across sales,
            operations, suppliers, and quality workflows.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700" to="/contact">
              Book Call
            </Link>
            <Link className="rounded-full bg-cyan-600 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-500" to="/contact?intent=proposal">
              Request Proposal
            </Link>
            <Link className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100" to="/packages">
              See Packages
            </Link>
          </div>
        </div>

        <div className="animate-rise-delayed rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-[0_24px_70px_-45px_rgba(15,23,42,1)] lg:p-8">
          <h2 className="text-lg font-bold">How engagement works</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-200">
            {engagementFlow.map((step) => (
              <li className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3" key={step}>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Solution stack</h2>
          <Link className="text-sm font-semibold text-cyan-700 hover:text-cyan-600" to="/solutions">
            View all solutions
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {solutions.slice(0, 4).map((solution, index) => (
            <article
              className={`rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.8)] animate-rise-delay-${index + 1}`}
              key={solution.name}
            >
              <h3 className="text-xl font-semibold text-slate-900">{solution.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{solution.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Packages</h2>
          <Link className="text-sm font-semibold text-cyan-700 hover:text-cyan-600" to="/packages">
            Compare package details
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {packages.map((pkg) => (
            <article className="rounded-3xl border border-slate-200 bg-white/90 p-5" key={pkg.name}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">{pkg.name}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{pkg.investment}</p>
              <p className="mt-1 text-sm text-slate-600">{pkg.timeline}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Case studies</h2>
          <Link className="text-sm font-semibold text-cyan-700 hover:text-cyan-600" to="/case-studies">
            Read full narratives
          </Link>
        </div>
        <div className="grid gap-4">
          {caseStudies.slice(0, 2).map((study) => (
            <article className="rounded-3xl border border-slate-200 bg-white/90 p-5" key={study.title}>
              <h3 className="text-lg font-semibold text-slate-900">{study.title}</h3>
              <p className="mt-2 text-sm text-slate-700">{study.outcome}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">{study.proof}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
