import { getPublicSolution, type PublicSolutionId } from '../lib/publicSolutions'

type EnterpriseSolutionCanvasProps = {
  solutionId: PublicSolutionId
  compact?: boolean
  className?: string
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function EnterpriseSolutionCanvas({ solutionId, compact = false, className = '' }: EnterpriseSolutionCanvasProps) {
  const solution = getPublicSolution(solutionId)
  const connectedInputs = solution.inputs.slice(0, compact ? 2 : 3)
  const workingSteps = solution.workflow.slice(0, compact ? 2 : 3)
  const firstWins = solution.outcomes.slice(0, compact ? 2 : 3)

  return (
    <article className={joinClassNames('sm-solution-canvas', `is-${solution.theme}`, compact && 'is-compact', className)}>
      <div className="sm-solution-canvas-head">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">{solution.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{solution.name}</h3>
        </div>
        <span className="sm-status-pill">{solution.status}</span>
      </div>

      <p className="sm-solution-canvas-strap">{solution.strap}</p>

      <section className="sm-solution-product-screen" aria-label={`${solution.name} product preview`}>
        <div className="sm-solution-screen-top">
          <div>
            <p>{solution.demo.title}</p>
            <strong>{solution.demo.metric}</strong>
          </div>
          <span>Live</span>
        </div>
        <div className="sm-solution-screen-list">
          {solution.demo.rows.map((row) => (
            <div className="sm-solution-screen-row" key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <em>{row.state}</em>
            </div>
          ))}
        </div>
      </section>

      <div className="sm-solution-canvas-grid">
        <section className="sm-solution-canvas-panel">
          <p className="sm-solution-canvas-label">Plug in</p>
          <div className="sm-solution-canvas-chip-row">
            {connectedInputs.map((item) => (
              <span className="sm-solution-canvas-chip" key={item}>
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="sm-solution-canvas-core">
          <p className="sm-solution-canvas-label">Use</p>
          <div className="sm-solution-canvas-flow">
            {workingSteps.map((item, index) => (
              <div className="sm-solution-canvas-step" key={item}>
                <span className="sm-solution-canvas-step-index">{index + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="sm-solution-canvas-panel">
          <p className="sm-solution-canvas-label">Get</p>
          <div className="sm-solution-canvas-chip-row">
            {firstWins.map((item) => (
              <span className="sm-solution-canvas-chip is-outcome" key={item}>
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </article>
  )
}
