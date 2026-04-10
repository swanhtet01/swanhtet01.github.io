import { PageIntro } from '../components/PageIntro'
import {
  INTERNAL_AGENT_CREWS,
  MODULE_PROGRAMS,
  RESEARCH_CELLS,
  RELEASE_GATES,
} from '../lib/companyBuildingModel'

export function ProductOperationsPage() {
  const releaseTrainGroups = MODULE_PROGRAMS.reduce<Record<string, string[]>>((acc, program) => {
    const train = program.releaseTrain
    acc[train] = acc[train] ?? []
    acc[train].push(program.name)
    return acc
  }, {})

  const successSignalStory = MODULE_PROGRAMS.map((program) => ({
    id: program.id,
    name: program.name,
    signals: program.successSignals,
    nextMove: program.nextMove,
  }))

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Product Operations"
        title="Turn SuperMega modules into a live R&D and delivery system."
        description="Product lines, release trains, research cells, agent crews, and success signals are tracked here so the operating company can scale beyond prototypes and keep every release accountable."
      />

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product lines</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Every module is a tracked program with release trains, crews, success metrics, and next moves.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">
            Revenue OS, Ops ERP Core, Portal Network, Knowledge Runtime, and Director OS each have a program owner, research cell, and agent stack so R&D does not tumble into heroics.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.releaseTrain}</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">{program.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <div className="mt-4 grid gap-2 text-sm text-white/80 sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-white">Owner:</span> {program.owner}
                </p>
                <p>
                  <span className="font-semibold text-white">Research cell:</span> {program.researchCell}
                </p>
                <p>
                  <span className="font-semibold text-white">Starter wedge:</span> {program.starterWedge}
                </p>
                <p>
                  <span className="font-semibold text-white">Tenant proof:</span> {program.tenantProof}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
                {program.modules.map((module) => (
                  <span key={`${program.id}-${module}`}>{module}</span>
                ))}
              </div>
              <div className="mt-4 text-sm text-white/80">
                <p className="font-semibold text-white">Success signals</p>
                <ul className="mt-2 space-y-1 list-disc pl-4">
                  {program.successSignals.map((signal) => (
                    <li key={`${program.id}-${signal}`}>{signal}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Next move: {program.nextMove}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Release trains</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Release momentum is grouped by discipline.</h2>
          </div>
          <div className="mt-4 grid gap-4">
            {Object.entries(releaseTrainGroups).map(([train, programs]) => (
              <div key={train} className="sm-chip text-white">
                <p className="font-semibold uppercase tracking-[0.2em] text-[var(--sm-muted)]">{train}</p>
                <p className="mt-1 text-sm">{programs.join(', ')}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            <p className="sm-kicker text-[var(--sm-accent)]">Release gates</p>
            <div className="grid gap-3">
              {RELEASE_GATES.map((gate) => (
                <article className="sm-chip text-white" key={gate.id}>
                  <p className="font-semibold">{gate.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{gate.question}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Exit: {gate.exitCriteria}</p>
                </article>
              ))}
            </div>
          </div>
        </article>
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Success signals</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Every program sends a signal that the next release is real.</h2>
          </div>
          <div className="mt-4 space-y-4">
            {successSignalStory.map((story) => (
              <article className="sm-demo-link sm-demo-link-card" key={story.id}>
                <h3 className="text-xl font-bold text-white">{story.name}</h3>
                <ul className="mt-2 space-y-1 text-sm text-white/80 list-disc pl-4">
                  {story.signals.map((signal) => (
                    <li key={`${story.id}-${signal}`}>{signal}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Next move: {story.nextMove}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Research cells</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Experimental cells turn data into modules.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">Cells own mandates, inputs, outputs, and the tenants they support so the factory can prioritize wiring the right data.</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {RESEARCH_CELLS.map((cell) => (
            <article className="sm-demo-link sm-demo-link-card" key={cell.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{cell.ownedBy}</span>
                <span className="sm-status-pill text-[var(--sm-accent)]">Supports {cell.supports.length} lines</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">{cell.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{cell.mandate}</p>
              <div className="mt-3 text-sm text-white/80 space-y-1">
                <p>Inputs: {cell.inputs.join(', ')}</p>
                <p>Outputs: {cell.outputs.join(', ')}</p>
                <p>Supports: {cell.supports.join(', ')}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Agent crews</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Dedicated crews scale the automation work.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">Crews own read/write scope, cadence, and approvals so AI action stays aligned with the product company’s risk posture.</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {INTERNAL_AGENT_CREWS.map((crew) => (
            <article className="sm-demo-link sm-demo-link-card" key={crew.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{crew.workspace}</span>
                <span className="sm-status-pill text-white/80">{crew.cadence}</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-white">{crew.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
              <div className="mt-3 space-y-1 text-sm text-white/80">
                <p>Read scope: {crew.readScope.join(', ')}</p>
                <p>Write scope: {crew.writeScope.join(', ')}</p>
                <p>Approval gate: {crew.approvalGate}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
