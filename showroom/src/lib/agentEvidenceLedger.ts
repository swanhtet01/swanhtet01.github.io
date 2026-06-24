export type EvidenceContract = {
  input_scope?: string
  output_artifact?: string
  source_refs?: string[]
  tool_calls?: string[]
  approval_state?: string
  owner?: string
  security_drill_status?: string
  rollback_path?: string
  risk_level?: string
  write_policy?: string
  complete?: boolean
  missing_required_fields?: string[]
  required_fields?: string[]
}

export type EvidenceAgentRun = {
  run_id: string
  job_type: string
  source?: string
  status?: string
  summary?: string
  triggered_by?: string
  created_at?: string
  started_at?: string
  completed_at?: string
  error_text?: string
  attempt_count?: number
  max_attempts?: number
  scheduled_for?: string
  idempotency_key?: string | null
  related_entity_type?: string
  related_entity_id?: string
  payload?: {
    evidence_contract?: EvidenceContract
    [key: string]: unknown
  }
  result?: {
    evidence_contract?: EvidenceContract
    [key: string]: unknown
  }
  evidence_contract?: EvidenceContract
}

export type EvidenceAgentJob = {
  job_type: string
  cadence?: string
  last_run?: EvidenceAgentRun | null
}

export type EvidenceRuntimeContract = {
  summary?: {
    approval_gate_count?: number
    connector_enabled_team_count?: number
    scheduler_backed_team_count?: number
    guarded_team_count?: number
  }
}

export type AgentEvidenceGate = {
  id: string
  name: string
  state: 'strong' | 'improving' | 'weak'
  detail: string
}

export type AgentEvidenceRun = {
  id: string
  jobType: string
  status: string
  source: string
  triggeredBy: string
  completedAt: string
  evidence: string
  action: string
  inputScope: string
  outputArtifact: string
  owner: string
  approvalState: string
  securityDrillStatus: string
  rollbackPath: string
  riskLevel: string
  writePolicy: string
  sourceRefs: string[]
  toolCalls: string[]
  attemptLabel: string
  idempotencyKey: string
  relatedEntity: string
  scheduledFor: string
  missingFields: string[]
}

export type AgentEvidenceLedger = {
  score: number
  verdict: string
  successfulRuns: number
  failedRuns: number
  reviewableRuns: number
  dueJobs: number
  gates: AgentEvidenceGate[]
  rows: AgentEvidenceRun[]
}

function normalizeStatus(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function hasMeaningfulText(value?: string) {
  return String(value ?? '').trim().length > 8
}

function hasResultPayload(run: EvidenceAgentRun) {
  return Boolean(run.result && Object.keys(run.result).length > 0)
}

function getEvidenceContract(run: EvidenceAgentRun): EvidenceContract {
  return run.evidence_contract ?? run.result?.evidence_contract ?? run.payload?.evidence_contract ?? {}
}

function compactList(value?: string[]) {
  return (value ?? []).map((item) => String(item).trim()).filter(Boolean)
}

function hasEvidenceContract(contract: EvidenceContract) {
  return (
    hasMeaningfulText(contract.input_scope)
    || hasMeaningfulText(contract.output_artifact)
    || compactList(contract.source_refs).length > 0
    || compactList(contract.tool_calls).length > 0
  )
}

function completedAt(run: EvidenceAgentRun) {
  return String(run.completed_at || run.started_at || run.created_at || '').trim()
}

function isRunSuccessful(run: EvidenceAgentRun) {
  const status = normalizeStatus(run.status)
  return ['completed', 'success', 'succeeded', 'ok', 'ready', 'partial'].includes(status)
}

function isRunFailed(run: EvidenceAgentRun) {
  const status = normalizeStatus(run.status)
  return ['error', 'failed', 'failure'].includes(status)
}

function isRunReviewable(run: EvidenceAgentRun) {
  const contract = getEvidenceContract(run)
  return (
    hasMeaningfulText(run.summary)
    || hasMeaningfulText(run.error_text)
    || hasResultPayload(run)
    || hasMeaningfulText(contract.output_artifact)
    || hasMeaningfulText(contract.input_scope)
  )
}

function countDueJobs(jobs: EvidenceAgentJob[]) {
  return jobs.filter((job) => {
    if (!job.last_run) {
      return true
    }
    return isRunFailed(job.last_run) || !isRunReviewable(job.last_run)
  }).length
}

function gateState(strong: boolean, improving: boolean): AgentEvidenceGate['state'] {
  if (strong) return 'strong'
  if (improving) return 'improving'
  return 'weak'
}

export function buildAgentEvidenceLedger(
  runs: EvidenceAgentRun[],
  jobs: EvidenceAgentJob[],
  runtimeContract?: EvidenceRuntimeContract | null,
): AgentEvidenceLedger {
  const successfulRuns = runs.filter(isRunSuccessful).length
  const failedRuns = runs.filter(isRunFailed).length
  const reviewableRuns = runs.filter(isRunReviewable).length
  const dueJobs = countDueJobs(jobs)
  const hasScheduler = runs.some((run) => normalizeStatus(run.source).includes('scheduler'))
  const hasManual = runs.some((run) => normalizeStatus(run.source).includes('manual') || hasMeaningfulText(run.triggered_by))
  const hasApprovalGates = Number(runtimeContract?.summary?.approval_gate_count ?? 0) > 0
  const hasConnectors = Number(runtimeContract?.summary?.connector_enabled_team_count ?? 0) > 0
  const hasGuardedTeams = Number(runtimeContract?.summary?.guarded_team_count ?? 0) > 0
  const hasRuns = runs.length > 0
  const evidenceContracts = runs.map(getEvidenceContract)
  const runsWithContracts = evidenceContracts.filter((contract) => hasMeaningfulText(contract.input_scope) && hasMeaningfulText(contract.output_artifact)).length
  const runsWithOwners = evidenceContracts.filter((contract) => hasMeaningfulText(contract.owner)).length
  const runsWithApprovalState = evidenceContracts.filter((contract) => hasMeaningfulText(contract.approval_state)).length
  const runsWithSecurityDrills = evidenceContracts.filter((contract) => hasMeaningfulText(contract.security_drill_status)).length
  const runsWithRollbackPath = evidenceContracts.filter((contract) => hasMeaningfulText(contract.rollback_path)).length
  const runsWithToolScope = evidenceContracts.filter((contract) => compactList(contract.tool_calls).length > 0 && compactList(contract.source_refs).length > 0).length
  const completeContracts = evidenceContracts.filter(
    (contract) => hasEvidenceContract(contract) && (contract.complete === true || compactList(contract.missing_required_fields).length === 0),
  ).length

  const successScore = runs.length ? Math.round((successfulRuns / runs.length) * 18) : 0
  const reviewScore = runs.length ? Math.round((reviewableRuns / runs.length) * 12) : 0
  const contractScore = runs.length ? Math.round(((runsWithContracts + completeContracts) / (runs.length * 2)) * 16) : 0
  const approvalScore = runs.length ? Math.round((runsWithApprovalState / runs.length) * 10) : 0
  const securityScore = runs.length ? Math.round((runsWithSecurityDrills / runs.length) * 8) : 0
  const rollbackScore = runs.length ? Math.round((runsWithRollbackPath / runs.length) * 6) : 0
  const cadenceScore = jobs.length ? Math.max(0, 14 - Math.min(14, dueJobs * 4)) : 4
  const gateScore = (hasApprovalGates ? 8 : 0) + (hasGuardedTeams ? 5 : 0) + (hasConnectors ? 4 : 0)
  const sourceScore = (hasScheduler ? 5 : 0) + (hasManual ? 3 : 0)
  const failurePenalty = Math.min(14, failedRuns * 4)
  const score = Math.max(
    0,
    Math.min(100, 10 + successScore + reviewScore + contractScore + approvalScore + securityScore + rollbackScore + cadenceScore + gateScore + sourceScore - failurePenalty),
  )

  const gates: AgentEvidenceGate[] = [
    {
      id: 'run-proof',
      name: 'Run proof',
      state: gateState(hasRuns && reviewableRuns === runs.length && runsWithContracts === runs.length && runs.length > 0, reviewableRuns > 0),
      detail: hasRuns
        ? `${reviewableRuns}/${runs.length} runs are reviewable; ${completeContracts}/${runs.length} have complete evidence contracts.`
        : 'No recent runs recorded yet.',
    },
    {
      id: 'approval-boundary',
      name: 'Approval boundary',
      state: gateState(hasApprovalGates && hasGuardedTeams, hasApprovalGates || hasGuardedTeams),
      detail: hasApprovalGates
        ? `${runtimeContract?.summary?.approval_gate_count ?? 0} approval gates and ${runtimeContract?.summary?.guarded_team_count ?? 0} guarded teams reported.`
        : 'Approval gates are not reported by the runtime contract yet.',
    },
    {
      id: 'cadence',
      name: 'Cadence health',
      state: gateState(jobs.length > 0 && dueJobs === 0, jobs.length > 0 && dueJobs <= 2),
      detail: jobs.length ? `${dueJobs}/${jobs.length} runnable jobs need attention.` : 'Runnable jobs are not visible to this role yet.',
    },
    {
      id: 'source-coverage',
      name: 'Source coverage',
      state: gateState(hasScheduler && hasManual, hasScheduler || hasManual),
      detail: hasScheduler && hasManual ? 'Scheduler and manual operator paths both have evidence.' : 'Need both scheduler and operator-triggered evidence.',
    },
    {
      id: 'owner-approval',
      name: 'Owner and approval',
      state: gateState(hasRuns && runsWithOwners === runs.length && runsWithApprovalState === runs.length, runsWithOwners > 0 || runsWithApprovalState > 0),
      detail: hasRuns ? `${runsWithOwners}/${runs.length} runs have owners and ${runsWithApprovalState}/${runs.length} have approval state.` : 'No owner or approval state recorded yet.',
    },
    {
      id: 'security-drills',
      name: 'Security drills',
      state: gateState(hasRuns && runsWithSecurityDrills === runs.length && runsWithRollbackPath === runs.length, runsWithSecurityDrills > 0 || runsWithRollbackPath > 0),
      detail: hasRuns
        ? `${runsWithSecurityDrills}/${runs.length} runs have drill status; ${runsWithRollbackPath}/${runs.length} have rollback path.`
        : 'No security drill or rollback evidence recorded yet.',
    },
    {
      id: 'tool-scope',
      name: 'Tool scope',
      state: gateState(hasRuns && runsWithToolScope === runs.length, runsWithToolScope > 0),
      detail: hasRuns ? `${runsWithToolScope}/${runs.length} runs name tool calls and source references.` : 'No tool or source scope recorded yet.',
    },
    {
      id: 'connector-scope',
      name: 'Connector scope',
      state: gateState(hasConnectors, false),
      detail: hasConnectors
        ? `${runtimeContract?.summary?.connector_enabled_team_count ?? 0} connector-enabled crews are in the runtime contract.`
        : 'Connector-enabled crews are not reported yet.',
    },
  ]

  const rows = runs.slice(0, 8).map((run): AgentEvidenceRun => {
    const failed = isRunFailed(run)
    const contract = getEvidenceContract(run)
    const evidence = String(run.summary || run.error_text || '').trim() || (hasResultPayload(run) ? 'Result payload captured.' : 'No reviewable artifact yet.')
    return {
      id: run.run_id,
      jobType: run.job_type || 'agent_job',
      status: run.status || 'unknown',
      source: run.source || 'manual',
      triggeredBy: run.triggered_by || 'system',
      completedAt: completedAt(run),
      evidence,
      action: failed ? 'Inspect error and rerun with owner.' : isRunReviewable(run) ? 'Review evidence and approve next write.' : 'Attach summary/result before trusting output.',
      inputScope: contract.input_scope || 'Workspace-scoped inputs not named yet.',
      outputArtifact: contract.output_artifact || 'No output artifact recorded.',
      owner: contract.owner || run.triggered_by || 'Agent Ops',
      approvalState: contract.approval_state || 'review_required_before_writeback',
      securityDrillStatus: contract.security_drill_status || 'mapped_required',
      rollbackPath: contract.rollback_path || 'Keep output staged and rerun before promotion.',
      riskLevel: contract.risk_level || (failed ? 'high' : 'medium'),
      writePolicy: contract.write_policy || 'No silent customer-system writes.',
      sourceRefs: compactList(contract.source_refs),
      toolCalls: compactList(contract.tool_calls),
      attemptLabel: `${Number(run.attempt_count ?? 0)}/${Number(run.max_attempts ?? 1)}`,
      idempotencyKey: String(run.idempotency_key || '').trim() || 'none',
      relatedEntity: [run.related_entity_type, run.related_entity_id].map((item) => String(item || '').trim()).filter(Boolean).join(':') || 'none',
      scheduledFor: String(run.scheduled_for || '').trim() || 'not scheduled',
      missingFields: compactList(contract.missing_required_fields),
    }
  })

  return {
    score,
    verdict:
      score >= 85
        ? 'Evidence is strong enough for controlled autonomy.'
        : score >= 65
          ? 'Evidence is usable, but writeback and approval proof still need tightening.'
          : 'Do not expand autonomy until runs, gates, and connector proof are stronger.',
    successfulRuns,
    failedRuns,
    reviewableRuns,
    dueJobs,
    gates,
    rows,
  }
}
