import { Link, Navigate, useParams } from 'react-router-dom'

import { LiveProductPreview } from '../components/LiveProductPreview'
import { previewVariantForSoftwareModule, previewVariantForStarterProduct } from '../lib/liveProductPreviewUtils'
import { getStarterPackDetail, STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'
import {
  getAgentTeamDetails,
  getSoftwareModuleDetail,
  getSoftwareModuleGalleryShots,
  SOFTWARE_MODULE_DETAILS,
  type SoftwareModuleDetail,
} from '../lib/softwareCatalog'

function rolloutLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

function publicReferenceRoute(route: string | undefined) {
  if (!route || route.startsWith('/app/')) {
    return null
  }
  return route
}

function workspaceReferenceRoute(route: string | undefined) {
  if (!route || !route.startsWith('/app/')) {
    return null
  }
  return `/login?next=${encodeURIComponent(route)}`
}

export function ProductDetailPage() {
  const { productId } = useParams()
  const starterProduct = getStarterPackDetail(productId)
  const softwareModule = getSoftwareModuleDetail(productId)

  if (!starterProduct && !softwareModule) {
    return <Navigate replace to="/products" />
  }

  if (softwareModule) {
    const automationSupport = getAgentTeamDetails(softwareModule.agentTeams)
    const siblingModules: SoftwareModuleDetail[] = SOFTWARE_MODULE_DETAILS.filter((item: SoftwareModuleDetail) => item.id !== softwareModule.id).slice(0, 3)
    const liveNotes = softwareModule.liveNotes ?? []
    const galleryShots = getSoftwareModuleGalleryShots(softwareModule.id)
    const proofRoute = publicReferenceRoute(softwareModule.proofRoute)
    const liveModuleRoute = workspaceReferenceRoute(softwareModule.proofRoute) ?? workspaceReferenceRoute(softwareModule.workspaceRoute)
    const rolloutPath = [
      `Start with ${softwareModule.surfaces[0]}.`,
      'Import the current data, files, or inbox flow first.',
      'Set the right roles, approvals, and history around the workflow.',
      'Add another product only after the first team is using it daily.',
    ] as const

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
                {softwareModule.deliveryState ? <span className="sm-status-pill">{softwareModule.deliveryState}</span> : null}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={rolloutLink(softwareModule.name)}>
                  Start this rollout
                </Link>
                {proofRoute ? (
                  <Link className="sm-button-secondary" to={proofRoute}>
                    See proof
                  </Link>
                ) : null}
                {liveModuleRoute ? (
                  <Link className="sm-button-secondary" to={liveModuleRoute}>
                    Open live module
                  </Link>
                ) : null}
              </div>
              {liveModuleRoute ? <p className="mt-3 text-sm text-[var(--sm-muted)]">This module’s proof lives inside the authenticated workspace.</p> : null}
              <div className="mt-4">
                {proofRoute === '/clients/yangon-tyre' ? (
                  <Link className="sm-link" to="/products">
                    View all products
                  </Link>
                ) : (
                  <Link className="sm-link" to="/clients/yangon-tyre">
                    Read the Yangon Tyre case study
                  </Link>
                )}
              </div>
            </div>

            <article className="sm-pack-card overflow-hidden p-4">
              <LiveProductPreview variant={softwareModule.previewVariant || previewVariantForSoftwareModule(softwareModule.id)} />
              {softwareModule.heroImage ? (
                <div className="mt-4 overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#040b16] p-3">
                  <div className="overflow-hidden rounded-[0.9rem] border border-white/10 bg-black/20">
                    <img
                      alt={`${softwareModule.name} catalog view`}
                      className="h-auto w-full object-cover object-top"
                      loading="lazy"
                      src={softwareModule.heroImage}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--sm-muted)]">
                    Catalog image pulled directly from the module metadata so the public page stays aligned with the product catalog.
                  </p>
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Best for</p>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.audience}</p>
                </article>
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.replaces}</p>
                </article>
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">What it includes</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A clear system for one job.</h2>
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
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Included</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Connected data and built-in controls.</h2>
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
              {automationSupport.map((team) => (
                <article className="sm-chip text-white" key={team.id}>
                  <p className="font-semibold">{team.name}</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        {galleryShots.length ? (
          <section className="sm-site-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Live screenshots</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Actual product surfaces, not placeholders.</h2>
              </div>
              <span className="sm-status-pill">Captured from the working site</span>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {galleryShots.map((shot) => (
                <figure className="sm-proof-card overflow-hidden" key={shot.src}>
                  <div className="overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#040b16]">
                    <img
                      alt={shot.alt}
                      className="h-auto w-full object-cover object-top"
                      loading="lazy"
                      src={shot.src}
                    />
                  </div>
                  <figcaption className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{shot.caption}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">How teams start</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The usual first setup.</h2>
            <div className="mt-6 space-y-3">
              {rolloutPath.map((step, index) => (
                <div className="sm-site-point" key={step}>
                  <span className="sm-site-point-dot" />
                  <span>{index + 1}. {step}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">What you get</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The workflow, controls, and rollout proof.</h2>
            <div className="mt-6 grid gap-3">
              {softwareModule.deliveryState ? (
                <article className="sm-chip text-white">
                  <p className="font-semibold">{softwareModule.deliveryState}</p>
                </article>
              ) : null}
              {liveNotes.map((item) => (
                <article className="sm-chip text-white" key={item}>
                  <p className="font-semibold">{item}</p>
                </article>
              ))}
              {!liveNotes.length ? (
                <>
                  <article className="sm-chip text-white">
                    <p className="font-semibold">Roles and permissions</p>
                  </article>
                  <article className="sm-chip text-white">
                    <p className="font-semibold">Approval steps</p>
                  </article>
                  <article className="sm-chip text-white">
                    <p className="font-semibold">Audit history</p>
                  </article>
                  <article className="sm-chip text-white">
                    <p className="font-semibold">Customer-specific workspace</p>
                  </article>
                </>
              ) : null}
            </div>
          </article>
        </section>

        <section className="sm-site-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Use with</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Add another product later.</h2>
            </div>
            <Link className="sm-link" to="/products">
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
                    View setup
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
              <span className="sm-status-pill">Working product</span>
              <span className="sm-status-pill">{product.launchWindow}</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={rolloutLink(product.name)}>
                Start this rollout
              </Link>
              <Link className="sm-button-secondary" to={product.proofTool.route}>
                Open live product
              </Link>
            </div>
            <div className="mt-4">
              <Link className="sm-link" to="/clients/yangon-tyre">
                Need a larger client system around this? Read the case study.
              </Link>
            </div>
          </div>

          <article className="sm-pack-card overflow-hidden p-4">
            <LiveProductPreview variant={previewVariantForStarterProduct(product.id)} />
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
            <p className="sm-kicker text-[var(--sm-accent)]">Add next</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use the same portal for another workflow.</h2>
          </div>
          <Link className="sm-link" to="/products">
            View all products
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {siblingProducts.map((item: StarterPackDetail) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={item.id}>
              <LiveProductPreview compact variant={previewVariantForStarterProduct(item.id)} />
              <p className="mt-4 text-xl font-semibold">{item.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.promise}</p>
              <div className="mt-5">
                <Link className="sm-button-primary" to={`/products/${item.slug}`}>
                  View product
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
