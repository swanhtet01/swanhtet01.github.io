import { type Dispatch, type FormEvent, type SetStateAction, useState } from 'react'

import {
  agentApprovalBoundaries,
  agentCapabilities,
  agentStates,
  createTeamId,
  defaultAgentCapabilities,
  formatTime,
  reviewAgentHandoff,
  submitAgentHandoff,
  type AgentHandoffDecision,
  type AgentApprovalBoundary,
  type AgentCapability,
  type AgentState,
  type DelegatedAgent,
  type TeamId,
  type TeamWorkspaceState,
} from './team-work'

type AgentTeamsPanelProps = {
  activeTeam: TeamId
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
  onSelectWork: (workItemId: string) => void
  workspace: TeamWorkspaceState
  setWorkspace: Dispatch<SetStateAction<TeamWorkspaceState>>
}

function agentStateLabel(state: AgentState) {
  return agentStates.find((entry) => entry.id === state)?.label ?? state
}

export function AgentTeamsPanel({ activeTeam, selectedAgentId, onSelectAgent, onSelectWork, workspace, setWorkspace }: AgentTeamsPanelProps) {
  const teamAgents = workspace.agents.filter((agent) => agent.team === activeTeam)
  const teamItems = workspace.items.filter((item) => item.team === activeTeam && item.status !== 'done')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [humanOwner, setHumanOwner] = useState('')
  const [evidenceSummary, setEvidenceSummary] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [handoffReviewer, setHandoffReviewer] = useState('')
  const [handoffNote, setHandoffNote] = useState('')
  const [notice, setNotice] = useState('')
  const selectedAgent = selectedAgentId ? teamAgents.find((agent) => agent.id === selectedAgentId) : teamAgents[0]
  const pendingHandoff = selectedAgent ? workspace.handoffs.find((handoff) => handoff.agentId === selectedAgent.id && handoff.status === 'pending_review') : undefined
  const latestHandoff = selectedAgent ? workspace.handoffs.find((handoff) => handoff.agentId === selectedAgent.id) : undefined

  function updateAgent(agentId: string, patch: Partial<DelegatedAgent>) {
    const updatedAt = new Date().toISOString()
    setWorkspace((current) => ({
      ...current,
      agents: current.agents.map((agent) => agent.id === agentId ? { ...agent, ...patch, updatedAt } : agent),
    }))
  }

  function addAgent(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !role.trim() || !humanOwner.trim()) return
    const timestamp = new Date().toISOString()
    const agent: DelegatedAgent = {
      id: createTeamId('AGT'),
      createdAt: timestamp,
      updatedAt: timestamp,
      name: name.trim(),
      team: activeTeam,
      role: role.trim(),
      humanOwner: humanOwner.trim(),
      state: 'available',
      capabilities: defaultAgentCapabilities[activeTeam],
      approvalBoundary: activeTeam === 'engineering' ? 'local_change_review' : 'prepare_only',
    }
    setWorkspace((current) => ({ ...current, agents: [agent, ...current.agents] }))
    onSelectAgent(agent.id)
    setName('')
    setRole('')
    setHumanOwner('')
    setNotice(`${agent.name} added as a local delegation record.`)
  }

  function assignWork(workItemId: string) {
    if (!selectedAgent) return
    if (pendingHandoff) {
      setNotice('Accept or return the pending handoff before changing its assignment.')
      return
    }
    updateAgent(selectedAgent.id, {
      assignedWorkItemId: workItemId || undefined,
      state: workItemId ? selectedAgent.state === 'available' ? 'assigned' : selectedAgent.state : 'available',
    })
    setNotice(workItemId ? `${selectedAgent.name} assigned to ${workItemId}.` : `${selectedAgent.name} returned to available.`)
  }

  function changeState(state: AgentState) {
    if (!selectedAgent) return
    if (pendingHandoff) {
      setNotice('Human review must accept or return the pending handoff before its state changes.')
      return
    }
    if (state !== 'available' && !selectedAgent.assignedWorkItemId) {
      setNotice('Assign accountable work before changing this role state.')
      return
    }
    updateAgent(selectedAgent.id, { state, assignedWorkItemId: state === 'available' ? undefined : selectedAgent.assignedWorkItemId })
    setNotice(`${selectedAgent.name} moved to ${agentStateLabel(state)}.`)
  }

  function toggleCapability(capability: AgentCapability) {
    if (!selectedAgent) return
    const hasCapability = selectedAgent.capabilities.includes(capability)
    if (hasCapability && selectedAgent.capabilities.length === 1) {
      setNotice('Keep at least one bounded capability on every delegated role.')
      return
    }
    updateAgent(selectedAgent.id, {
      capabilities: hasCapability
        ? selectedAgent.capabilities.filter((entry) => entry !== capability)
        : [...selectedAgent.capabilities, capability],
    })
  }

  function recordEvidence(event: FormEvent) {
    event.preventDefault()
    if (!selectedAgent || !evidenceSummary.trim() || !evidenceReference.trim()) return
    if (!selectedAgent.assignedWorkItemId || selectedAgent.state !== 'assigned') {
      setNotice('Assign open accountable work before submitting evidence for review.')
      return
    }
    const next = submitAgentHandoff(workspace, {
      agentId: selectedAgent.id,
      summary: evidenceSummary,
      reference: evidenceReference,
    })
    if (!next) {
      setNotice('The handoff could not be submitted. Confirm the assignment is open and no review is pending.')
      return
    }
    const submitted = next.handoffs.find((handoff) => handoff.agentId === selectedAgent.id && handoff.status === 'pending_review')
    setWorkspace(next)
    setEvidenceSummary('')
    setEvidenceReference('')
    setHandoffReviewer('')
    setHandoffNote('')
    setNotice(`${submitted?.id ?? 'Handoff'} submitted for human review.`)
  }

  function completeHandoff(decision: AgentHandoffDecision) {
    if (!pendingHandoff || !handoffReviewer.trim() || !handoffNote.trim()) return
    const next = reviewAgentHandoff(workspace, {
      handoffId: pendingHandoff.id,
      decision,
      reviewer: handoffReviewer,
      note: handoffNote,
    })
    if (!next) {
      setNotice('The handoff review failed closed because its assignment or evidence changed.')
      return
    }
    setWorkspace(next)
    setHandoffReviewer('')
    setHandoffNote('')
    setNotice(decision === 'accepted'
      ? `${pendingHandoff.id} accepted into ${pendingHandoff.workItemId} as verified evidence.`
      : `${pendingHandoff.id} returned to the assigned role for revision.`)
  }

  const assignedCount = teamAgents.filter((agent) => agent.state === 'assigned').length
  const reviewCount = teamAgents.filter((agent) => agent.state === 'waiting_review').length
  const blockedCount = teamAgents.filter((agent) => agent.state === 'blocked').length

  return (
    <div className="agent-team-workspace">
      <section className="agent-boundary-banner" aria-label="Agent delegation boundary">
        <div><span className="core-eyebrow">Delegation control</span><strong>Roles prepare work; named humans keep authority.</strong></div>
        <p>No agent can send, pay, publish, merge, deploy, or write to production from this local roster.</p>
      </section>
      <section className="agent-summary" aria-label="Agent team summary">
        <span><small>Roles</small><strong>{teamAgents.length}</strong></span>
        <span><small>Assigned</small><strong>{assignedCount}</strong></span>
        <span><small>Needs review</small><strong>{reviewCount}</strong></span>
        <span><small>Blocked</small><strong>{blockedCount}</strong></span>
      </section>
      <div className="split-workspace agent-team-view">
        <section className="core-panel agent-roster-panel">
          <div className="panel-head">
            <div><span className="core-eyebrow">Team roster</span><h2>Delegated roles</h2></div>
            <details className="compact-disclosure">
              <summary>Add role</summary>
              <form className="core-form agent-create-form" onSubmit={addAgent}>
                <label>Name<input maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. QA operator" /></label>
                <label>Role<input maxLength={140} required value={role} onChange={(event) => setRole(event.target.value)} placeholder="One bounded responsibility" /></label>
                <label>Human owner<input maxLength={80} required value={humanOwner} onChange={(event) => setHumanOwner(event.target.value)} placeholder="Accountable person or role" /></label>
                <button className="core-button primary compact" type="submit">Add local role</button>
              </form>
            </details>
          </div>
          <div className="agent-roster" role="list">
            {teamAgents.map((agent) => (
              <button aria-current={selectedAgent?.id === agent.id ? 'true' : undefined} key={agent.id} onClick={() => onSelectAgent(agent.id)} type="button">
                <span className={`record-status ${agent.state === 'waiting_review' ? 'review' : agent.state === 'assigned' ? 'in_progress' : agent.state}`} />
                <span><strong>{agent.name}</strong><small>{agent.role}</small></span>
                <span><b>{agentStateLabel(agent.state)}</b><small>{agent.assignedWorkItemId ?? 'Unassigned'}</small></span>
              </button>
            ))}
            {!teamAgents.length ? <p className="panel-copy">No delegated role exists for this team yet.</p> : null}
          </div>
        </section>
        <section className="core-panel agent-detail-panel">
          {selectedAgent ? <>
            <div className="record-detail-head">
              <div><span className="core-eyebrow">{selectedAgent.id}</span><h2>{selectedAgent.name}</h2><p>{selectedAgent.role}</p></div>
              <span className={`status-pill ${selectedAgent.state === 'waiting_review' ? 'pending' : selectedAgent.state === 'blocked' ? 'pending' : 'bounded'}`}>{agentStateLabel(selectedAgent.state)}</span>
            </div>
            <div className="agent-control-grid">
              <label>Human owner<input disabled={Boolean(pendingHandoff)} maxLength={80} value={selectedAgent.humanOwner} onChange={(event) => updateAgent(selectedAgent.id, { humanOwner: event.target.value })} /></label>
              <label>Assignment<select disabled={Boolean(pendingHandoff)} value={selectedAgent.assignedWorkItemId ?? ''} onChange={(event) => assignWork(event.target.value)}><option value="">Available</option>{teamItems.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
              {pendingHandoff ? <label>State<input readOnly value="Needs review" /></label> : <label>State<select value={selectedAgent.state} onChange={(event) => changeState(event.target.value as AgentState)}>{agentStates.filter((state) => state.id !== 'waiting_review').map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}</select></label>}
              <label>Approval boundary<select disabled={Boolean(pendingHandoff)} value={selectedAgent.approvalBoundary} onChange={(event) => updateAgent(selectedAgent.id, { approvalBoundary: event.target.value as AgentApprovalBoundary })}>{agentApprovalBoundaries.map((boundary) => <option key={boundary.id} value={boundary.id}>{boundary.label}</option>)}</select></label>
            </div>
            <p className="agent-boundary-copy">{agentApprovalBoundaries.find((boundary) => boundary.id === selectedAgent.approvalBoundary)?.description}</p>
            <fieldset className="capability-fieldset">
              <legend>Bounded capabilities</legend>
              <div>{agentCapabilities.map((capability) => <label key={capability.id}><input checked={selectedAgent.capabilities.includes(capability.id)} disabled={Boolean(pendingHandoff)} onChange={() => toggleCapability(capability.id)} type="checkbox" /><span>{capability.label}</span></label>)}</div>
            </fieldset>
            <section className="agent-evidence-card">
              <div><span>Latest evidence</span>{selectedAgent.lastEvidence ? <small>{formatTime(selectedAgent.lastEvidence.capturedAt)}</small> : null}</div>
              {selectedAgent.lastEvidence ? <><strong>{selectedAgent.lastEvidence.summary}</strong><small>{selectedAgent.lastEvidence.reference}</small></> : <p>No evidence has been attributed to this role.</p>}
              {!pendingHandoff && selectedAgent.assignedWorkItemId && selectedAgent.state === 'assigned' ? <details className="compact-disclosure evidence-disclosure">
                <summary>Record evidence</summary>
                <form className="core-form agent-evidence-form" onSubmit={recordEvidence}>
                  <label>Finding<input maxLength={240} required value={evidenceSummary} onChange={(event) => setEvidenceSummary(event.target.value)} placeholder="What was completed or learned?" /></label>
                  <label>Reference<input maxLength={180} required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Test, file, task, or source reference" /></label>
                  <button className="core-button compact" type="submit">Submit for review</button>
                </form>
              </details> : <p>{pendingHandoff ? 'Evidence is locked while a named human reviews this handoff.' : 'Assign open work and use Assigned state before submitting evidence.'}</p>}
            </section>
            {pendingHandoff ? <section className="agent-handoff-card" aria-labelledby={`handoff-${pendingHandoff.id}`}>
              <div className="agent-handoff-head"><div><span className="core-eyebrow">Human handoff review</span><h3 id={`handoff-${pendingHandoff.id}`}>{pendingHandoff.id}</h3></div><span className="status-pill pending">Pending</span></div>
              <div className="agent-handoff-evidence"><strong>{pendingHandoff.evidence.summary}</strong><small>{pendingHandoff.evidence.reference}</small><small>{pendingHandoff.agentName} / {pendingHandoff.humanOwner} / {pendingHandoff.workItemId}</small></div>
              <form className="core-form agent-handoff-form" onSubmit={(event) => { event.preventDefault(); completeHandoff('accepted') }}>
                <label>Human reviewer<input maxLength={80} required value={handoffReviewer} onChange={(event) => setHandoffReviewer(event.target.value)} /></label>
                <label>Review note<textarea maxLength={360} required value={handoffNote} onChange={(event) => setHandoffNote(event.target.value)} /></label>
                <div className="form-actions"><button className="core-button" disabled={!handoffReviewer.trim() || !handoffNote.trim()} onClick={() => completeHandoff('returned')} type="button">Return for revision</button><button className="core-button primary" type="submit">Accept into work</button></div>
              </form>
              <p>Acceptance creates one human-verified evidence record and moves the assigned item to Review. It performs no external action.</p>
            </section> : latestHandoff ? <section className="agent-handoff-card compact" aria-label="Latest handoff result">
              <div className="agent-handoff-head"><div><span className="core-eyebrow">Latest handoff</span><h3>{latestHandoff.id}</h3></div><span className={`status-pill ${latestHandoff.status === 'accepted' ? 'approved' : 'pending'}`}>{latestHandoff.status}</span></div>
              <div className="agent-handoff-evidence"><strong>{latestHandoff.evidence.summary}</strong><small>{latestHandoff.reviewedBy} / {latestHandoff.reviewNote}</small>{latestHandoff.workEvidenceId ? <small>Verified evidence {latestHandoff.workEvidenceId}</small> : null}</div>
              <button className="text-link" onClick={() => onSelectWork(latestHandoff.workItemId)} type="button">Open work record</button>
            </section> : null}
            <p className="form-notice" aria-live="polite">{notice || `Updated ${formatTime(selectedAgent.updatedAt)} · local record only.`}</p>
          </> : <p className="panel-copy">{teamAgents.length ? 'Select a delegated role.' : 'Add a bounded role to begin delegating work for this team.'}</p>}
        </section>
      </div>
    </div>
  )
}
