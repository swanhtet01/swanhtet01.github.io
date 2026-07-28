type ActivationRuntime = {
  status: 'checking' | 'enterprise' | 'demo'
  operatingMode: string
  enterpriseDbReady: boolean
  authReady: boolean
  auditReady: boolean
  writesReady: boolean
  requirements: string[]
  activationSteps: Array<{ id: string; label: string; ready: boolean; action: string }>
  evidencePlan: Array<{ id: string; label: string; ready: boolean; proof: string; verifier: string }>
  activationManifest: {
    contract: string
    mode: string
    ready_percent: number
    next_action: string
    blocked_gate_ids: string[]
    safe_enable: string[]
    automation_boundary: string
    secret_values_exposed: boolean
  } | null
}

type ManagedActivationRunbookProps = {
  runtime: ActivationRuntime
}

export function ManagedActivationRunbook({ runtime }: ManagedActivationRunbookProps) {
  const hasRequirement = (text: string) => runtime.requirements.some((requirement) => requirement.toLowerCase().includes(text))
  const fallbackSteps = [
    ['Database', runtime.enterpriseDbReady && !hasRequirement('postgres'), 'Provision non-BYPASSRLS Postgres.'],
    ['Role', runtime.status === 'enterprise' || (runtime.enterpriseDbReady && !hasRequirement('login')), 'Use a dedicated trial backend login.'],
    ['Schema', runtime.status === 'enterprise' || (runtime.enterpriseDbReady && !hasRequirement('schema')), 'Apply private trial migrations.'],
    ['Identity', runtime.authReady, 'Configure gateway signing or Supabase auth.'],
    ['Audit', runtime.auditReady, 'Verify immutable event inserts.'],
    ['Writes', runtime.writesReady, 'Enable writes after acceptance tests.'],
  ] as const
  const activationSteps = runtime.activationSteps.length
    ? runtime.activationSteps.map((step) => [step.label, step.ready, step.action] as const)
    : fallbackSteps
  const blockers = activationSteps.filter(([, ready]) => !ready)
  const readyCount = activationSteps.length - blockers.length
  const next = blockers[0]
  const percent = Math.round((readyCount / activationSteps.length) * 100)
  const nextRequirement = runtime.activationManifest?.next_action ?? runtime.requirements[0] ?? next?.[2] ?? 'Managed activation is ready for workspace sign-in.'
  const evidenceReady = runtime.evidencePlan.filter((item) => item.ready).length

  return <section aria-label="Managed activation runbook" className="activation-runbook">
    <div className="activation-runbook-head">
      <div><span className="core-eyebrow">Managed activation</span><strong>{runtime.status === 'enterprise' ? 'Ready for paid workspaces' : 'Next hosted blocker'}</strong><small>{nextRequirement}</small></div>
      <span className={`status-pill ${runtime.status === 'enterprise' ? 'approved' : 'pending'}`}>{percent}% ready</span>
    </div>
    <div className="activation-runbook-steps">
      {activationSteps.map(([label, ready, action]) => <span data-ready={ready ? 'true' : 'false'} key={label}><small>{label}</small><b>{ready ? 'Ready' : 'Needed'}</b><em>{action}</em></span>)}
    </div>
    {runtime.evidencePlan.length ? <div className="activation-evidence-plan" aria-label="Managed activation evidence plan">
      <div><span className="core-eyebrow">Evidence to go live</span><strong>{evidenceReady}/{runtime.evidencePlan.length} proof gates ready</strong></div>
      {runtime.evidencePlan.map((item) => <span data-ready={item.ready ? 'true' : 'false'} key={item.id}><small>{item.label}</small><b>{item.ready ? 'Ready' : 'Needed'}</b><em>{item.proof}</em><code>{item.verifier}</code></span>)}
    </div> : null}
    {runtime.activationManifest ? <div className="activation-evidence-plan" aria-label="Activation automation manifest">
      <div><span className="core-eyebrow">Automation manifest</span><strong>{runtime.activationManifest.ready_percent}% ready</strong></div>
      <span data-ready={runtime.activationManifest.blocked_gate_ids.length ? 'false' : 'true'}><small>Next action</small><b>{runtime.activationManifest.blocked_gate_ids.length ? 'Blocked' : 'Ready'}</b><em>{runtime.activationManifest.next_action}</em><code>{runtime.activationManifest.safe_enable.join(', ')}</code></span>
      <span data-ready="false"><small>Authority boundary</small><b>Approval gated</b><em>{runtime.activationManifest.automation_boundary}</em></span>
    </div> : null}
    <p className="authority-note">Mode: {runtime.operatingMode.replace('_', ' ')}. Keep client imports, AI learning, and operational writes locked until every activation gate is ready.</p>
  </section>
}
