import { type Dispatch, type FormEvent, type SetStateAction, useState } from 'react'

import {
  agentApprovalBoundaries,
  agentCapabilities,
  agentStates,
  createTeamId,
  defaultAgentCapabilities,
  formatTime,
  type AgentApprovalBoundary,
  type AgentCapability,
  type AgentState,
  type DelegatedAgent,
  type TeamId,
  type TeamWorkspaceState,
} from './team-work'

type AgentTeamsPanelProps = {
  activeTeam: TeamId
  workspace: TeamWorkspaceState
  setWorkspace: Dispatch<SetStateAction<TeamWorkspaceState>>
}

function agentStateLabel(state: AgentState) {
  return agentStates.find((entry) => entry.id === state)?.label ?? state
}

export function AgentTeamsPanel({ activeTeam, workspace, setWorkspace }: AgentTeamsPanelProps) {
  const teamAgents = workspace.agents.filter((agent) => agent.team === activeTeam)
  const teamItems = workspace.items.filter((item) => item.team === activeTeam && item.status !== 'done')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [humanOwner, setHumanOwner] = useState('')
  const [evidenceSummary, setEvidenceSummary] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [notice, setNotice] = useState('')
  const selectedAgent = teamAgents.find((agent) => agent.id === selectedAgentId) ?? teamAgents[0]

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
    setSelectedAgentId(agent.id)
    setName('')
    setRole('')
    setHumanOwner('')
    setNotice(`${agent.name} added as a local delegation record.`)
  }

  function assignWork(workItemId: string) {
    if (!selectedAgent) return
    updateAgent(selectedAgent.id, {
      assignedWorkItemId: workItemId || undefined,
      state: workItemId ? selectedAgent.state === 'available' ? 'assigned' : selectedAgent.state : 'available',
    })
    setNotice(workItemId ? `${selectedAgent.name} assigned to ${workItemId}.` : `${selectedAgent.name} returned to available.`)
  }

  function changeState(state: AgentState) {
    if (!selectedAgent) return
    if (state !== 'available' && !selectedAgent.assignedWorkItemId) {
      setNotice('Assign accountable work before changing this role state.')
      return
    }
    if (state === 'waiting_review' && !selectedAgent.lastEvidence) {
      setNotice('Record evidence before requesting human review.')
      return
    }
    updateAgent(selectedAgent.id, { state })
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
    updateAgent(selectedAgent.id, {
      lastEvidence: {
        capturedAt: new Date().toISOString(),
        summary: evidenceSummary.trim(),
        reference: evidenceReference.trim(),
      },
    })
    setEvidenceSummary('')
    setEvidenceReference('')
    setNotice(`Evidence recorded for ${selectedAgent.name}; human review is still required.`)
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
              <button aria-current={selectedAgent?.id === agent.id ? 'true' : undefined} key={agent.id} onClick={() => setSelectedAgentId(agent.id)} type="button">
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
              <label>Human owner<input maxLength={80} value={selectedAgent.humanOwner} onChange={(event) => updateAgent(selectedAgent.id, { humanOwner: event.target.value })} /></label>
              <label>Assignment<select value={selectedAgent.assignedWorkItemId ?? ''} onChange={(event) => assignWork(event.target.value)}><option value="">Available</option>{teamItems.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
              <label>State<select value={selectedAgent.state} onChange={(event) => changeState(event.target.value as AgentState)}>{agentStates.map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}</select></label>
              <label>Approval boundary<select value={selectedAgent.approvalBoundary} onChange={(event) => updateAgent(selectedAgent.id, { approvalBoundary: event.target.value as AgentApprovalBoundary })}>{agentApprovalBoundaries.map((boundary) => <option key={boundary.id} value={boundary.id}>{boundary.label}</option>)}</select></label>
            </div>
            <p className="agent-boundary-copy">{agentApprovalBoundaries.find((boundary) => boundary.id === selectedAgent.approvalBoundary)?.description}</p>
            <fieldset className="capability-fieldset">
              <legend>Bounded capabilities</legend>
              <div>{agentCapabilities.map((capability) => <label key={capability.id}><input checked={selectedAgent.capabilities.includes(capability.id)} onChange={() => toggleCapability(capability.id)} type="checkbox" /><span>{capability.label}</span></label>)}</div>
            </fieldset>
            <section className="agent-evidence-card">
              <div><span>Latest evidence</span>{selectedAgent.lastEvidence ? <small>{formatTime(selectedAgent.lastEvidence.capturedAt)}</small> : null}</div>
              {selectedAgent.lastEvidence ? <><strong>{selectedAgent.lastEvidence.summary}</strong><small>{selectedAgent.lastEvidence.reference}</small></> : <p>No evidence has been attributed to this role.</p>}
              <details className="compact-disclosure evidence-disclosure">
                <summary>Record evidence</summary>
                <form className="core-form agent-evidence-form" onSubmit={recordEvidence}>
                  <label>Finding<input maxLength={240} required value={evidenceSummary} onChange={(event) => setEvidenceSummary(event.target.value)} placeholder="What was completed or learned?" /></label>
                  <label>Reference<input maxLength={180} required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Test, file, task, or source reference" /></label>
                  <button className="core-button compact" type="submit">Record</button>
                </form>
              </details>
            </section>
            <p className="form-notice" aria-live="polite">{notice || `Updated ${formatTime(selectedAgent.updatedAt)} · local record only.`}</p>
          </> : <p className="panel-copy">Add a bounded role to begin delegating work for this team.</p>}
        </section>
      </div>
    </div>
  )
}
