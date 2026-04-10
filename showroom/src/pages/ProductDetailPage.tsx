import { Link, Navigate, useParams } from 'react-router-dom'

import { getStarterPackDetail, STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'
import { getAgentTeamDetails, getSoftwareModuleDetail, SOFTWARE_MODULE_DETAILS, type SoftwareModuleDetail } from '../lib/softwareCatalog'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

export function ProductDetailPage() {
  const { productId } = useParams()
  const starterProduct = getStarterPackDetail(productId)
  const softwareModule = getSoftwareModuleDetail(productId)

  if (!starterProduct && !softwareModule) {
    return <Navigate replace to="/products" />
  }

  if (softwareModule) {
    const relatedTeams = getAgentTeamDetails(softwareModule.agentTeams)
    const siblingModules: SoftwareModuleDetail[] = SOFTWARE_MODULE_DETAILS.filter((item: SoftwareModuleDetail) => item.id !== softwareModule.id).slice(0, 3)

    return (
      <div className="space-y-10 pb-12">
        <section className="sm-site-panel">
          <div className="grid gap-8 xl:grid-cols-[1fr_1fr] xl:items-end">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{softwareModule.category}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{softwareModule.name}</h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{softwareModule.promise}</p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
                <span className="sm-status-pill">{softwareModule.status}</span>
                <span className="sm-status-pill">{softwareModule.audience}</span>
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={contactLink(softwareModule.name)}>
                  Start rollout
                </Link>
                <Link className="sm-button-secondary" to="/clients/yangon-tyre">
                  See case study
                </Link>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <article className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Best for</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.audience}</p>
              </article>
              <article className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.replaces}</p>
              </article>
              <article className="sm-chip text-white md:col-span-2">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Includes</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.surfaces.join(' · ')}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">What ships</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A reusable template, not a one-off build.</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{softwareModule.summary}</p>
            <div className="mt-6 grid gap-3">
              {softwareModule.surfaces.map((surface) => (
                <article className="sm-chip text-white" key={surface}>
                  <p className="font-semibold">{surface}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Built in</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Shared data, controls, and agent support.</h2>
            <div className="mt-6 grid gap-3">
              {softwareModule.knowledgeModules.map((item: string) => (
                <article className="sm-chip text-white" key={`knowledge-${item}`}>
                  <p className="font-semibold">{item}</p>
                </article>
              ))}
              {softwareModule.infrastructureModules.map((item: string) => (
                <article className="sm-chip text-white" key={`infra-${item}`}>
                  <p className="font-semibold">{item}</p>
                </article>
              ))}
              {relatedTeams.map((team) => (
                <article className="sm-chip text-white" key={team.id}>
                  <p className="font-semibold">{team.name}</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className="sm-site-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Use with</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Expand without changing stacks.</h2>
            </div>
            <Link className="sm-button-secondary" to="/products">
              View all products
            </Link>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {siblingModules.map((item: SoftwareModuleDetail) => (
              <article className="sm-proof-card" key={item.id}>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.summary}</p>
                <div className="mt-5">
                  <Link className="sm-link" to={`/products/${item.id}`}>
                    See template
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const product = starterProduct!
  const siblingProducts: StarterPackDetail[] = STARTER_PACK_DETAILS.filter((item: StarterPackDetail) => item.id !== product.id)

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[1.04fr_0.96fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{product.name}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{product.promise}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Live product</span>
              <span className="sm-status-pill">Open now</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={product.proofTool.route}>
                Open product
              </Link>
              <Link className="sm-button-secondary" to={contactLink(product.name)}>
                Start rollout
              </Link>
            </div>
          </div>

          <article className="sm-pack-card overflow-hidden p-4">
            <img
              alt={`${product.name} live screenshot`}
              className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
              decoding="async"
              height={screenshotSize.height}
              loading="lazy"
              src={product.image}
              width={screenshotSize.width}
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <article className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Starts with</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.starterModules.join(' + ')}</p>
              </article>
              <article className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Replaces</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.replaces}</p>
              </article>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What it solves</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">One job, clearly done.</h2>
          <div className="mt-6 space-y-3">
            {product.problemsSolved.map((item: string) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">What ships first</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The first useful setup.</h2>
          <div className="mt-6 grid gap-3">
            {product.setupPath.map((item: string) => (
              <article className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Inputs</p>
          <div className="mt-5 space-y-3">
            {product.integrations.map((item: string) => (
              <div className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Built in</p>
          <div className="mt-5 space-y-3">
            {product.controls.map((item: string) => (
              <div className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Grows into</p>
          <div className="mt-5 space-y-3">
            {product.expandsTo.map((item: string) => (
              <div className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next product</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use the same system for another workflow.</h2>
          </div>
          <Link className="sm-button-secondary" to="/products">
            View all products
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {siblingProducts.map((item: StarterPackDetail) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={item.id}>
              <img
                alt={`${item.name} live screenshot`}
                className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
                decoding="async"
                height={screenshotSize.height}
                loading="lazy"
                src={item.image}
                width={screenshotSize.width}
              />
              <p className="mt-4 text-xl font-semibold">{item.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.promise}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${item.slug}`}>
                  See product
                </Link>
                <Link className="sm-link" to={contactLink(item.name)}>
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
