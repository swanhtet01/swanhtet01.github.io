import { type FormEvent, useState } from 'react'

import { PageHeading } from '../../core/CoreShell'

type PilotAssessment = {
  ready: boolean
  monthlyHours: number
  summary: string
}

const proofPoints = [
  ['Private by default', 'Screens and model inference stay on customer-controlled hardware.'],
  ['Windows ready', 'A sealed local Windows runtime and replayable buyer evaluation kit exist.'],
  ['Android packaged', 'Universal and ARM64 packages are ready for physical-device qualification.'],
  ['Human governed', 'The founding pilot observes and reports; consequential actions stay held.'],
] as const

function boundedNumber(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1_000_000) : fallback
}

export function VisionProduct() {
  const [workflow, setWorkflow] = useState('')
  const [monthlyRuns, setMonthlyRuns] = useState('100')
  const [minutesPerRun, setMinutesPerRun] = useState('10')
  const [screensAuthorized, setScreensAuthorized] = useState(false)
  const [humanFallback, setHumanFallback] = useState(true)
  const [assessment, setAssessment] = useState<PilotAssessment | null>(null)

  function assessPilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const runs = boundedNumber(monthlyRuns, 0)
    const minutes = boundedNumber(minutesPerRun, 0)
    const monthlyHours = Math.round((runs * minutes / 60) * 10) / 10
    const ready = workflow.trim().length >= 20
      && monthlyHours >= 4
      && screensAuthorized
      && humanFallback
    const summary = [
      `Workflow: ${workflow.trim() || 'Not supplied'}`,
      `Current effort: ${monthlyHours} hours/month`,
      `Authorized screenshots: ${screensAuthorized ? 'yes' : 'no'}`,
      `Human fallback: ${humanFallback ? 'yes' : 'no'}`,
      `Pilot fit: ${ready ? 'ready for SuperMega review' : 'needs more fit evidence'}`,
    ].join('\n')
    setAssessment({ ready, monthlyHours, summary })
  }

  return (
    <div className="workspace-screen vision-screen">
      <PageHeading
        copy="Teach a private visual worker one repetitive Windows or Android workflow, prove it in observation-only mode, then decide whether controlled automation is justified."
        eyebrow="SuperMega Vision"
        title="Make screen work measurable."
        actions={<a className="core-button primary" href="#pilot-fit">Check pilot fit</a>}
      />

      <section aria-label="Vision founding offer" className="vision-offer">
        <div>
          <span className="core-eyebrow">Four-week founding pilot</span>
          <h2>One workflow. Local evidence. A clear go or stop decision.</h2>
          <p>We define the screen states, train on authorized examples, measure held-out performance, and deliver a local observation-only runtime.</p>
        </div>
        <div className="vision-price">
          <small>Founding range</small>
          <strong>USD 1,500–4,000</strong>
          <span>One workflow · one site · four weeks</span>
        </div>
      </section>

      <section aria-label="Vision proof" className="vision-proof-grid">
        {proofPoints.map(([title, copy]) => <article key={title}><strong>{title}</strong><p>{copy}</p></article>)}
      </section>

      <section className="vision-fit" id="pilot-fit">
        <div>
          <span className="core-eyebrow">Pilot qualification</span>
          <h2>Is the workflow worth learning?</h2>
          <p>This check stays in the browser. It does not send customer data or create a sale.</p>
        </div>
        <form onSubmit={assessPilot}>
          <label>
            Repetitive workflow
            <textarea
              maxLength={500}
              onChange={(event) => setWorkflow(event.target.value)}
              placeholder="Example: verify that the release dashboard is ready and no loading, error, or degraded state remains."
              required
              value={workflow}
            />
          </label>
          <div className="vision-fit-numbers">
            <label>Runs per month<input min="1" onChange={(event) => setMonthlyRuns(event.target.value)} required type="number" value={monthlyRuns} /></label>
            <label>Minutes per run<input min="1" onChange={(event) => setMinutesPerRun(event.target.value)} required type="number" value={minutesPerRun} /></label>
          </div>
          <label className="vision-check"><input checked={screensAuthorized} onChange={(event) => setScreensAuthorized(event.target.checked)} type="checkbox" /><span>The business owns or is authorized to use the workflow screenshots.</span></label>
          <label className="vision-check"><input checked={humanFallback} onChange={(event) => setHumanFallback(event.target.checked)} type="checkbox" /><span>A person can handle the workflow when Vision abstains or fails.</span></label>
          <button className="core-button primary" type="submit">Assess workflow</button>
        </form>

        {assessment ? (
          <div aria-live="polite" className={`vision-result ${assessment.ready ? 'ready' : 'attention'}`} role="status">
            <span className="core-eyebrow">{assessment.ready ? 'Ready for review' : 'Not ready yet'}</span>
            <h3>{assessment.monthlyHours} current hours per month</h3>
            <p>{assessment.ready ? 'This workflow is a credible founding-pilot candidate.' : 'Add a specific repetitive workflow, confirm screenshot rights, retain a human fallback, and show at least four hours of monthly effort.'}</p>
            <label>Pilot brief<textarea readOnly value={assessment.summary} /></label>
            {assessment.ready ? <a className="core-button primary" href="https://supermega.dev/contact/?product=vision" rel="noreferrer" target="_blank">Request owner-reviewed pilot</a> : null}
          </div>
        ) : null}
      </section>

      <section aria-label="Vision boundaries" className="vision-boundary">
        <strong>Founding boundary</strong>
        <p>No surveillance, biometrics, CAPTCHA bypass, credential handling, medical decisions, safety-critical control, or invisible autonomous actions.</p>
      </section>
    </div>
  )
}
