import { Link } from 'react-router-dom'

import { hero } from '../content'
import { trackEvent } from '../lib/analytics'

const tools = [
  {
    title: 'Find Companies',
    detail: 'Search a place or niche and keep the companies worth contacting.',
    to: '/find-companies',
  },
  {
    title: 'Company List',
    detail: 'Paste your own company list or keep the results you want to work.',
    to: '/company-list',
  },
  {
    title: 'Task List',
    detail: 'Turn messy team updates into one short daily task list.',
    to: '/task-list',
  },
]

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-7xl">Find companies. Keep a list. Run tasks.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Three small tools. Find companies, keep the ones that matter, and turn messy updates into the next tasks.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('public_start_click', { tool: 'Find Companies' })} to="/find-companies">
                Find companies
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('public_start_click', { tool: 'Company List' })} to="/company-list">
                Bring a company list
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            {tools.map((tool) => (
              <Link
                className="sm-command-row transition hover:border-[rgba(37,208,255,0.24)] hover:bg-white/6"
                key={tool.title}
                onClick={() => trackEvent('public_start_click', { tool: tool.title })}
                to={tool.to}
              >
                <div>
                  <p className="text-lg font-bold text-white">{tool.title}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">{tool.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-surface p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Start here</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Pick one simple workflow.</h2>
          </div>
          <div className="space-y-3">
            <div className="sm-command-row">
              <div>
                <p className="font-bold text-white">Sales and partnerships</p>
                <p className="mt-1 text-sm text-[var(--sm-muted)]">Use Find Companies and Company List.</p>
              </div>
            </div>
            <div className="sm-command-row">
              <div>
                <p className="font-bold text-white">Operations and receiving</p>
                <p className="mt-1 text-sm text-[var(--sm-muted)]">Use Task List to turn messy updates into the next actions.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sm-surface-soft p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xl font-bold text-white">Need help setting it up?</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">We can set up the first workflow with your real data.</p>
          </div>
          <Link className="sm-button-secondary" onClick={() => trackEvent('book_demo_click', { source: 'home' })} to="/book">
            Book setup call
          </Link>
        </div>
      </section>
    </div>
  )
}
