import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { ytfDeployment } from '../content'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'

const featuredPacks = STARTER_PACK_DETAILS
const primaryPack = featuredPacks[0]!

const proofGallery = featuredPacks.map((pack) => ({
  slug: pack.slug,
  title: pack.name,
  description: pack.promise,
  image: pack.image,
  audience: pack.audience,
  route: pack.proofTool.route,
  detailRoute: `/products/${pack.slug}`,
  deliverables: pack.launchDeliverables,
}))

const demoTracks = featuredPacks.map((pack) => ({
  slug: pack.slug,
  name: pack.name,
  audience: pack.audience,
  steps: pack.demoSteps,
  outcome: pack.salesTrigger,
  launchWindow: pack.launchWindow,
  route: pack.proofTool.route,
  detailRoute: `/products/${pack.slug}`,
}))

const videoShots = [
  {
    title: 'Hero film',
    detail: 'Capture a 45 to 60 second opening that shows the product name, the live module, and the first outcome in one motion.',
  },
  {
    title: 'Work flow',
    detail: 'Show the import, cleanup, or issue log screen with the owner, next action, and audit trail visible at the same time.',
  },
  {
    title: 'Before and after',
    detail: 'Cut from the messy starting point into the live queue, cleaned list, or exception board to make the value obvious.',
  },
  {
    title: 'Agent layer',
    detail: 'Record the runtime desk, guardrails, and release train so the product story is clearly AI-native, not just a UI demo.',
  },
  {
    title: 'Call to action',
    detail: 'Close on the rollout request, pilot package, or contact form so the viewer knows exactly what to do next.',
  },
]

const launchSignals = [
  {
    label: 'Proof assets',
    value: 'Live screenshots and module captures',
  },
  {
    label: 'Demo tracks',
    value: 'Sales, operations, and director flows',
  },
  {
    label: 'Launch output',
    value: 'Video scripts, pilot scope, and CTA flow',
  },
  {
    label: 'Tenant proof',
    value: ytfDeployment.domain,
  },
]

export function DemoCenterPage() {
  return (
    <div className="space-y-10 pb-16">
      <PageIntro
        eyebrow="Demo Center"
        title="Proof, demos, and motion media for live products."
        description="Use the real product catalog to sell what is already running: a clean first workflow, the supporting controls, and the launch assets needed to close the first customer."
      />

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Launch-ready surface</p>
            <h2 className="max-w-3xl text-4xl font-bold tracking-tight text-white lg:text-6xl">
              Sell the product like software, not a prototype.
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Start with one live module, show the clean before-and-after, then hand the prospect a clear rollout path with proof assets, security notes,
              and a next step.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact">
                Start rollout
              </Link>
              <Link className="sm-button-secondary" to="/products">
                Browse products
              </Link>
              <Link className="sm-button-secondary" to="/clients/yangon-tyre">
                Tenant example
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {launchSignals.map((signal) => (
                <article className="sm-demo-link sm-demo-link-card" key={signal.label}>
                  <span className="sm-home-proof-label">{signal.label}</span>
                  <strong>{signal.value}</strong>
                </article>
              ))}
            </div>
          </div>

          <div className="sm-site-proof-panel">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#020612]">
              <img
                alt={`${primaryPack.name} live screenshot`}
                className="aspect-[16/10] w-full object-cover object-top"
                decoding="async"
                fetchPriority="high"
                src={primaryPack.image}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020612] via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="sm-kicker text-[var(--sm-accent)]">{primaryPack.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{primaryPack.name}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">{primaryPack.promise}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/45">{primaryPack.launchWindow}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Proof gallery</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Real screenshots from the live product catalog.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Each frame is a product people can buy now. Use them in outbound, onboarding, and the first pilot proposal.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {proofGallery.map((item) => (
            <article className="sm-site-proof-panel" id={item.slug} key={item.title}>
              <div className="relative h-48 overflow-hidden rounded-2xl bg-slate-900/60">
                <img
                  alt={item.title}
                  className="h-full w-full object-cover"
                  decoding="async"
                  fetchPriority="low"
                  src={item.image}
                />
              </div>
              <div className="mt-4 space-y-2 text-sm text-white/90">
                <p className="text-lg font-semibold text-white">{item.title}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{item.audience}</p>
                <p className="text-[var(--sm-muted)]">{item.description}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {item.deliverables.map((deliverable) => (
                    <span className="sm-status-pill text-[var(--sm-accent)]" key={`${item.title}-${deliverable}`}>
                      {deliverable}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link className="sm-link" to={item.route}>
                    Open live route
                  </Link>
                  <Link className="sm-link" to={item.detailRoute}>
                    Review setup
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Demo tracks</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Structured demos for every buyer.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">
            Each track is built from a real starter pack so the talk track matches the actual product and the rollout scope.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {demoTracks.map((track) => (
            <article className="sm-demo-link sm-demo-link-card" id={`track-${track.slug}`} key={track.name}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-status-pill text-[var(--sm-accent)]">{track.name}</span>
                <span className="sm-home-proof-label">{track.launchWindow}</span>
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-white">{track.audience}</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/80 list-disc pl-4">
                {track.steps.map((step) => (
                  <li key={`${track.name}-${step.title}`}>
                    <strong className="text-white">{step.title}:</strong> {step.detail}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{track.outcome}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-link" to={track.route}>
                  Open live route
                </Link>
                <Link className="sm-link" to={track.detailRoute}>
                  Review setup
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Launch media</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Shot-by-shot plan for clips, reels, and demos.</h2>
          </div>
          <p className="max-w-lg text-sm text-[var(--sm-muted)]">
            Record these angles once, then cut them into sales clips, onboarding reels, investor loops, and proof snippets.
          </p>
        </div>
        <div className="mt-6 grid gap-3">
          {videoShots.map((shot) => (
            <article className="sm-chip text-white" key={shot.title}>
              <p className="font-semibold">{shot.title}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">{shot.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Launch package</p>
            <h2 className="mt-2 text-3xl font-bold text-white">What the first client sees.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Lead with one live module, show the security proof, and make the next step obvious. The goal is to close a pilot with a clear product,
              not a vague promise.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="sm-demo-link sm-demo-link-card">
              <span className="sm-home-proof-label">Launch deliverables</span>
              <strong>{primaryPack.launchDeliverables.join(', ')}</strong>
              <span>Use these in the pitch, the onboarding package, and the first pilot plan.</span>
              <Link className="sm-link" to={primaryPack.proofTool.route}>
                Open the primary demo
              </Link>
            </article>
            <article className="sm-demo-link sm-demo-link-card">
              <span className="sm-home-proof-label">Security proof</span>
              <strong>{primaryPack.securityProof[0]}</strong>
              <span>{primaryPack.securityProof[1]}</span>
              <Link className="sm-link" to="/contact">
                Start rollout
              </Link>
            </article>
            <article className="sm-demo-link sm-demo-link-card">
              <span className="sm-home-proof-label">Enterprise proof</span>
              <strong>{ytfDeployment.domain}</strong>
              <span>Use the named tenant to show the same product stack scaling into roles, files, approvals, and client-specific operations.</span>
              <Link className="sm-link" to="/clients/yangon-tyre">
                Open tenant example
              </Link>
            </article>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/portfolio">
            Browse product stories
          </Link>
          <Link className="sm-button-secondary" to="/products">
            See full product catalog
          </Link>
        </div>
      </section>
    </div>
  )
}
