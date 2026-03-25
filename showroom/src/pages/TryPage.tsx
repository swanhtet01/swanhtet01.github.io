import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'

const toolCards = [
  {
    kind: 'Free tool',
    name: 'Lead Finder',
    path: '/lead-finder',
    tagline: 'Find leads from websites, public social pages, and map-style results.',
    bullets: ['Search by market or buyer type', 'Review real result cards', 'Save the best names'],
  },
  {
    kind: 'Free tool',
    name: 'News Brief',
    path: '/news-brief',
    tagline: 'Turn a few URLs or notes into one short director brief.',
    bullets: ['Pull from public URLs', 'Get risk themes fast', 'Use on your own watch list'],
  },
  {
    kind: 'Free tool',
    name: 'Action Board',
    path: '/action-board',
    tagline: 'Convert raw updates into owners, due dates, and follow-up lanes.',
    bullets: ['Paste messy updates', 'Generate action rows', 'Save into the workspace'],
  },
  {
    kind: 'Utility',
    name: 'Document Intake',
    path: '/document-intake',
    tagline: 'Upload real files and route them into the right operating module.',
    bullets: ['Read PDFs and spreadsheets', 'Extract fields', 'Recommend the next module'],
  },
  {
    kind: 'Core module',
    name: 'Ops Intake',
    path: '/ops-intake',
    tagline: 'Turn files and quick KPI rows into clean operating records.',
    bullets: ['Extract candidate metrics', 'Paste quick metric rows', 'Feed Action OS and control modules'],
  },
  {
    kind: 'Planning tool',
    name: 'Solution Architect',
    path: '/solution-architect',
    tagline: 'Design the right SuperMega rollout before selling or building it.',
    bullets: ['Choose the wedge product', 'See the first module stack', 'Get the next tooling layer'],
  },
]

export function TryPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Live apps"
        title="Use the products directly."
        description="These are live product surfaces. Some are free proof tools. Others are working modules we use to move companies from messy inputs into usable operating data."
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {toolCards.map((tool) => (
            <article className="sm-pack-card p-6" key={tool.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{tool.kind}</p>
              <h2 className="mt-3 text-3xl font-bold text-white">{tool.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{tool.tagline}</p>

            <div className="mt-5 grid gap-3">
              {tool.bullets.map((bullet) => (
                <div className="sm-chip text-white" key={bullet}>
                  {bullet}
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={tool.path}>
                Open app
              </Link>
              <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(tool.name)}`}>
                Use on my data
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
