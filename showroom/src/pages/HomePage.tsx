import { Link } from 'react-router-dom'

import { hero } from '../content'
import { trackEvent } from '../lib/analytics'

const tools = [
  {
    name: 'Find clients',
    detail: 'Search a market and keep the few companies worth contacting.',
    to: '/find-companies',
  },
  {
    name: 'Clean list',
    detail: 'Bring the list you already have and turn it into something usable.',
    to: '/company-list?setup=leads',
  },
  {
    name: 'Log receiving',
    detail: 'Log shortages, holds, and missing documents in one short follow-up list.',
    to: '/receiving-log',
  },
]

export function HomePage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="relative left-1/2 w-screen max-w-none -translate-x-1/2 overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_82%_22%,rgba(37,208,255,0.2),transparent_18%),radial-gradient(circle_at_16%_78%,rgba(255,122,24,0.18),transparent_16%),linear-gradient(180deg,rgba(2,8,23,0.98),rgba(4,10,22,0.95))]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40" />
        <div className="mx-auto grid min-h-[calc(100svh-7rem)] w-full max-w-6xl gap-10 px-4 pb-12 pt-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.85fr)] lg:px-8 lg:pb-16 lg:pt-20">
          <div className="flex flex-col justify-end">
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">Turn messy business work into one clear next step.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Find clients, clean a company list, or log receiving issues. Start with one small tool before any rollout.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('public_start_click', { offer: 'Find clients' })} to="/find-companies">
                Try find clients
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('book_demo_click', { source: 'home_hero' })} to="/book">
                Book rollout call
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Works with spreadsheets</span>
              <span className="sm-status-pill">Works with WhatsApp notes</span>
              <span className="sm-status-pill">Works with email</span>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="border-l border-white/10 pl-5 lg:pl-8">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Start here</p>
              <div className="mt-6 space-y-5">
                {tools.map((tool, index) => (
                  <Link
                    className="group block border-b border-white/8 pb-5 transition hover:border-[rgba(37,208,255,0.24)]"
                    key={tool.name}
                    onClick={() => trackEvent('offer_open_click', { offer: tool.name })}
                    to={tool.to}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--sm-muted)]">0{index + 1}</p>
                    <h2 className="mt-2 text-2xl font-bold text-white transition group-hover:text-[var(--sm-accent)]">{tool.name}</h2>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--sm-muted)]">{tool.detail}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">How it works</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Start with one tool. Keep one working list.</h2>
          <div className="mt-6 space-y-3">
            {[
              'Try one tool first.',
              'Keep the next step visible in one list.',
              'If it helps, we roll it out for the team.',
            ].map((item) => (
              <div className="border-b border-white/8 pb-3 text-base text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Paid rollout</p>
          <div className="mt-5 space-y-4">
            {[
              ['Sales Setup', 'Find clients plus Clean list for one outreach workflow.'],
              ['Company Cleanup', 'Turn a messy spreadsheet into one working company list.'],
              ['Receiving Control', 'Turn receiving issues into one short follow-up queue.'],
            ].map(([title, detail]) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={title}>
                <p className="text-xl font-bold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--sm-muted)]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-surface-deep p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-2xl font-bold text-white">Share the card. Let them start with one real tool.</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">If they need help, the next step is one small rollout, not a giant software project.</p>
          </div>
          <Link className="sm-button-primary" onClick={() => trackEvent('book_demo_click', { source: 'home' })} to="/book">
            Book rollout call
          </Link>
        </div>
      </section>
    </div>
  )
}
