import { Link } from 'react-router'

import proof from './vision-proof.json'
import './vision-product.css'

const capabilityLabels: Record<string, string> = {
  correction_derived_candidate_pipeline: 'Correction-derived candidate training',
  local_calibrated_onnx_inference: 'Calibrated local ONNX inference',
  multi_screen_loaded_session_inference: 'Loaded-session multi-screen review',
  offline_human_correction_workbench: 'Offline human correction workbench',
  pixel_identity_dataset_join: 'Pixel-identity dataset lineage',
  tamper_evident_visual_reports: 'Tamper-evident visual reports',
}

const pilotSteps = [
  ['Choose one workflow', 'Start with one stable Windows or Android task and measurable human baseline.'],
  ['Keep screenshots controlled', 'Use only owner-approved data with an untouched test set and written retention boundary.'],
  ['Measure before action', 'Run observation-only evaluation before considering any device interaction or production integration.'],
] as const

export function VisionProduct() {
  const evidence = proof.verified_evidence

  return (
    <main className="vision-product" id="vision-main">
      <header className="vision-hero">
        <nav aria-label="Vision preview navigation">
          <Link to="/">SuperMega</Link>
          <span>Private product preview</span>
        </nav>
        <div className="vision-hero-grid">
          <div>
            <p className="vision-kicker">Local computer vision for real work</p>
            <h1>Teach software to recognize the screens your team already uses.</h1>
            <p className="vision-lede">SuperMega Vision trains on approved screenshots, runs inference locally, and keeps every correction and proposed action reviewable.</p>
            <div className="vision-boundary" role="note">
              <strong>Owner review candidate</strong>
              <span>Not approved for publication, pricing, customer outreach, production sale, or payment requests.</span>
            </div>
          </div>
          <aside aria-label="Verified engineering evidence" className="vision-proof-card">
            <span>Source-authenticated local R&amp;D proof</span>
            <dl>
              <div><dt>Screens</dt><dd>{evidence.screens_processed_locally}</dd></div>
              <div><dt>Observations</dt><dd>{evidence.model_observations}</dd></div>
              <div><dt>Files verified</dt><dd>{evidence.private_demo_files_verified}</dd></div>
            </dl>
            <small>Engineering counts, not accuracy metrics.</small>
            <code>Proof {proof.proof_id}</code>
          </aside>
        </div>
      </header>

      <section aria-labelledby="vision-capabilities" className="vision-section">
        <div className="vision-section-heading">
          <p>What exists today</p>
          <h2 id="vision-capabilities">A complete local learning and review loop.</h2>
        </div>
        <ul className="vision-capability-grid">
          {evidence.capabilities.map((capability) => <li key={capability}>{capabilityLabels[capability] ?? capability}</li>)}
        </ul>
      </section>

      <section aria-labelledby="vision-pilot" className="vision-section vision-pilot">
        <div className="vision-section-heading">
          <p>Private pilot shape</p>
          <h2 id="vision-pilot">Prove one bounded workflow before automating anything.</h2>
        </div>
        <ol>
          {pilotSteps.map(([title, copy], index) => (
            <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="vision-honesty" className="vision-section vision-honesty">
        <div className="vision-section-heading">
          <p>Evidence boundary</p>
          <h2 id="vision-honesty">What this proof does not claim.</h2>
        </div>
        <ul>{proof.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        <p>No screenshot pixels, source filenames, source paths, or customer labels are included in this preview.</p>
      </section>

      <footer className="vision-footer">
        <div><strong>SuperMega Vision</strong><span>Private local R&amp;D product preview</span></div>
        <Link to="/">Return to SuperMega</Link>
      </footer>
    </main>
  )
}
