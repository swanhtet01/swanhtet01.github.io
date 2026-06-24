import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { buildProofLoginHref } from '../lib/demoSurfaces'
import { GENERAL_USE_TOOL_WEDGES } from '../lib/myanmarProductOpportunities'

function buildProofHref(route: string) {
  if (route.includes('restaurant-os')) {
    return buildProofLoginHref('restaurant-group-os', route)
  }
  if (route.includes('industrial-os')) {
    return buildProofLoginHref('operations-digital-twin', '/app/operations-twin')
  }
  return buildProofLoginHref('ai-workflow-desk', route)
}

export function TryPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Free tools"
        title="Try one useful business tool first."
        description="No platform tour. Pick one small workflow, see the output, then send your real sample if you want a private version."
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {GENERAL_USE_TOOL_WEDGES.map((tool) => (
            <article className="sm-pack-card p-6" key={tool.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">{tool.audience}</p>
              <h2 className="mt-3 text-3xl font-bold text-white">{tool.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{tool.promise}</p>

            <div className="mt-5 grid gap-3">
              {tool.inputs.slice(0, 3).map((bullet) => (
                <div className="sm-chip text-white" key={bullet}>
                  {bullet}
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed text-[var(--sm-muted)]">
              Output: <strong className="text-white">{tool.output}</strong>
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a className="sm-button-primary" href={buildProofHref(tool.route)}>
                Open product
              </a>
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
