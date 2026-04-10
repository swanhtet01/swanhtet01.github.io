import { Link, Navigate, useParams } from 'react-router-dom'

import { getInternalAgentCrewDetails, getModuleProgramsForModule, getResearchCellByName, MODULE_PROGRAMS } from '../lib/companyBuildingModel'
import { getStarterPackDetail, STARTER_PACK_DETAILS } from '../lib/salesControl'
import { getAgentTeamDetails, getSoftwareModuleDetail, SOFTWARE_MODULE_DETAILS } from '../lib/softwareCatalog'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function ProductDetailPage() {
  const { productId } = useParams()
  const starterProduct = getStarterPackDetail(productId)
  const softwareModule = getSoftwareModuleDetail(productId)

  if (!starterProduct && !softwareModule) {
    return <Navigate replace to="/products" />
  }

  if (softwareModule) {
    const relatedTeams = getAgentTeamDetails(softwareModule.agentTeams)
    const relatedPrograms = getModuleProgramsForModule(softwareModule.name)
    const internalBuildCrews = Array.from(
      new Map(
        relatedPrograms
          .flatMap((program) => getInternalAgentCrewDetails(program.agentCrews))
          .map((crew) => [crew.id, crew]),
      ).values(),
    )
    const siblingModules = SOFTWARE_MODULE_DETAILS.filter((item) => item.id !== softwareModule.id).slice(0, 4)

    return (
      <div className="space-y-10 pb-12">
        <section className="sm-site-panel">
          <div className="grid gap-8 xl:grid-cols-[1.04fr_0.96fr] xl:items-end">
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
                  Start with this module
                </Link>
                <Link className="sm-button-secondary" to="/factory">
                  See how it is built
                </Link>
              </div>
            </div>

            <div className="sm-pack-card p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Category</p>
                  <p className="mt-3 text-sm font-semibold text-white">{softwareModule.category}</p>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.replaces}</p>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Knowledge layer</p>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.knowledgeModules.join(', ')}</p>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Infrastructure</p>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{softwareModule.infrastructureModules.join(', ')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Module summary</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A software layer that can land in one tenant and expand across many.</h2>
            <p className="mt-5 text-sm leading-relaxed text-[var(--sm-muted)]">{softwareModule.summary}</p>
            <div className="mt-6 space-y-3">
              {softwareModule.surfaces.map((surface) => (
                <div className="sm-site-point" key={surface}>
                  <span className="sm-site-point-dot" />
                  <span>{surface}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Where it sits in the platform</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each module uses shared memory, controls, and agent infrastructure.</h2>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {softwareModule.knowledgeModules.map((item) => (
                <article className="sm-chip text-white" key={`knowledge-${item}`}>
                  <p className="font-semibold">{item}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Shared knowledge layer</p>
                </article>
              ))}
              {softwareModule.infrastructureModules.map((item) => (
                <article className="sm-chip text-white" key={`infra-${item}`}>
                  <p className="font-semibold">{item}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Shared infrastructure layer</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        {relatedPrograms.length ? (
          <section className="sm-site-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Product line</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This module is part of a broader product roadmap.</h2>
              </div>
              <Link className="sm-button-secondary" to="/factory">
                See Build
              </Link>
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {relatedPrograms.map((program) => (
                <article className="sm-demo-link sm-demo-link-card" key={program.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="sm-home-proof-label">{program.stage}</span>
                    <span className="sm-status-pill">{program.owner}</span>
                  </div>
                  <strong>{program.name}</strong>
                  <span>{program.target}</span>
                  <small className="text-[var(--sm-muted)]">{program.commercialStory}</small>
                  <small className="text-[var(--sm-muted)]">Market: {program.market}</small>
                  <small className="text-[var(--sm-muted)]">Starts with: {program.starterWedge}</small>
                  <small className="text-[var(--sm-muted)]">Release train: {program.releaseTrain}</small>
                  <small className="text-[var(--sm-muted)]">Live example: {program.tenantProof}</small>
                  <small className="text-[var(--sm-muted)]">Build team: {program.researchCell}</small>
                  <small className="text-[var(--sm-muted)]">Internal crews: {program.agentCrews.join(', ')}</small>
                  <small className="text-[var(--sm-muted)]">Next move: {program.nextMove}</small>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Agent teams handle the prep work around the human workflow.</h2>
            <div className="mt-6 grid gap-3">
              {relatedTeams.map((team) => (
                <article className="sm-proof-card" key={team.id}>
                  <p className="font-semibold text-white">{team.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{team.strap}</p>
                  <p className="mt-3 text-sm text-white/80">Delegates: {team.delegates.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Handoff: {team.handoff}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Rollout ownership</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This module should have a clear owner, rollout scope, and next release plan.</h2>
            <div className="mt-6 grid gap-3">
              {relatedPrograms.map((program) => {
                const researchCell = getResearchCellByName(program.researchCell)
                return (
                  <article className="sm-chip text-white" key={`${program.id}-ownership`}>
                    <p className="font-semibold">{program.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Owned by {program.owner}</p>
                    <p className="mt-2 text-sm text-white/80">{program.commercialStory}</p>
                    <p className="mt-2 text-sm text-white/80">Build team: {program.researchCell}</p>
                    <p className="mt-2 text-sm text-white/80">Starts with: {program.starterWedge}</p>
                    <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
                    <p className="mt-2 text-sm text-white/80">Internal crews: {program.agentCrews.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Success signals: {program.successSignals.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Adds next: {program.nextReleases.join(', ')}</p>
                    {researchCell ? <p className="mt-2 text-sm text-white/80">Team focus: {researchCell.mandate}</p> : null}
                  </article>
                )
              })}
              {!relatedPrograms.length ? (
                <article className="sm-chip text-white">
                  <p className="font-semibold">Module rollout posture</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Roll it out inside one team first, then expand after the workflow is trusted.</p>
                </article>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={contactLink(softwareModule.name)}>
                Start rollout
              </Link>
              <Link className="sm-button-secondary" to="/clients/yangon-tyre">
                View tenant blueprint
              </Link>
            </div>
          </article>
        </section>

        {internalBuildCrews.length ? (
          <section className="sm-site-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Internal build crews</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Named internal crews keep this module improving between releases.</h2>
              </div>
              <Link className="sm-button-secondary" to="/factory">
                See Build
              </Link>
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              {internalBuildCrews.map((crew) => (
                <article className="sm-proof-card" key={crew.id}>
                  <p className="font-semibold text-white">{crew.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
                  <p className="mt-3 text-sm text-white/80">Workspace: {crew.workspace}</p>
                  <p className="mt-2 text-sm text-white/80">Write scope: {crew.writeScope.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Cadence: {crew.cadence}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="sm-site-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Related modules</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Expand into adjacent layers without starting a second stack.</h2>
            </div>
            <Link className="sm-button-secondary" to="/products">
              View all products
            </Link>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {siblingModules.map((item) => (
              <article className="sm-demo-link sm-demo-link-card" key={item.id}>
                <span className="sm-home-proof-label">{item.category}</span>
                <strong>{item.name}</strong>
                <span>{item.summary}</span>
                <small className="text-[var(--sm-muted)]">{item.status}</small>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/products/${item.id}`}>
                    See module
                  </Link>
                  <Link className="sm-button-secondary" to={contactLink(item.name)}>
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

  const product = starterProduct!
  const starterProgram =
    MODULE_PROGRAMS.find((program) => program.starterWedge.toLowerCase().includes(product.name.toLowerCase())) ?? null
  const siblingProducts = STARTER_PACK_DETAILS.filter((item) => item.id !== product.id)

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{product.name}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{product.promise}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Live product</span>
              <span className="sm-status-pill">{product.audience}</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={product.proofTool.route}>
                Open {product.proofTool.label}
              </Link>
              <Link className="sm-button-secondary" to={contactLink(product.name)}>
                Start rollout
              </Link>
            </div>
          </div>

          <div className="sm-pack-card overflow-hidden p-4">
            <img
              alt={`${product.name} live screenshot`}
              className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
              loading="lazy"
              src={product.image}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Product</p>
                <p className="mt-3 text-sm font-semibold text-white">{product.starterModules.join(' + ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.replaces}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Shared data</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.knowledgeModules.join(', ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Controls</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.controls.join(', ')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Problems solved</p>
          <div className="mt-5 space-y-3">
            {product.problemsSolved.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-[var(--sm-muted)]">
            This is a live product on the same system that also handles roles, approvals, history, and tenant workspaces.
          </p>
        </article>

        <article className="sm-site-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">How setup works</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Set up in four short steps.</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Start from the data and habits the team already has. Do not ask them to learn a giant new system first.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {product.setupPath.map((step, index) => (
              <article className="sm-chip text-white" key={step}>
                <p className="sm-kicker text-[var(--sm-accent)]">Step {index + 1}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{step}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Roles</p>
          <div className="mt-5 space-y-3">
            {product.dailyUsers.map((role) => (
              <div className="sm-chip text-white" key={role}>
                <p className="font-semibold capitalize">{role}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Can expand into</p>
          <div className="mt-5 space-y-3">
            {product.expandsTo.map((item) => (
              <div className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent loops</p>
          <div className="mt-5 space-y-3">
            {product.agentLoops.map((item) => (
              <div className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {starterProgram ? (
        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Product line</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This live product is the first step in a broader SUPERMEGA.dev product line.</h2>
            <div className="mt-6 grid gap-3">
              <article className="sm-proof-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{starterProgram.name}</p>
                  <span className="sm-status-pill">{starterProgram.stage}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{starterProgram.target}</p>
                <p className="mt-3 text-sm text-white/80">{starterProgram.commercialStory}</p>
                <p className="mt-3 text-sm text-white/80">Market: {starterProgram.market}</p>
                <p className="mt-2 text-sm text-white/80">Owner: {starterProgram.owner}</p>
                <p className="mt-2 text-sm text-white/80">Build team: {starterProgram.researchCell}</p>
                <p className="mt-2 text-sm text-white/80">Release train: {starterProgram.releaseTrain}</p>
                <p className="mt-2 text-sm text-white/80">Internal crews: {starterProgram.agentCrews.join(', ')}</p>
              </article>
            </div>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">How it expands</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The live product proves the workflow before the wider rollout.</h2>
            <div className="mt-6 space-y-3">
              {[
                `Starts with: ${starterProgram.starterWedge}.`,
                `Proven in: ${starterProgram.tenantProof}.`,
                `Release train: ${starterProgram.releaseTrain}.`,
                `Next move: ${starterProgram.nextMove}`,
                `Adds next: ${starterProgram.nextReleases.join(', ')}.`,
              ].map((item) => (
                <div className="sm-site-point" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {starterProgram.successSignals.map((signal) => (
                <article className="sm-chip text-white" key={signal}>
                  <p className="font-semibold">{signal}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/factory">
                See Build
              </Link>
              <Link className="sm-button-secondary" to={starterProgram.route}>
                See broader system
              </Link>
            </div>
          </article>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Connections and controls</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Shared data, integrations, permissions, and history are built in.</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {product.integrations.map((item) => (
              <article className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </article>
            ))}
            {product.controls.map((item) => (
              <article className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Also works for</p>
          <div className="mt-5 space-y-3">
            {product.otherUses.map((item) => (
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
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Same company, different workflow.</h2>
          </div>
          <Link className="sm-button-secondary" to="/products">
            View all products
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {siblingProducts.map((item) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={item.id}>
              <img
                alt={`${item.name} live screenshot`}
                className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
                loading="lazy"
                src={item.image}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="font-semibold">{item.name}</p>
                <span className="sm-status-pill">Live product</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.promise}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${item.slug}`}>
                  See product
                </Link>
                <Link className="sm-button-secondary" to={contactLink(item.name)}>
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
