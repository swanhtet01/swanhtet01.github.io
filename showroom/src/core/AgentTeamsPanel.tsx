import { type Dispatch, type FormEvent, type SetStateAction, useState } from 'react'

import {
  AGENT_ACTIVE_ASSIGNMENT_LIMIT,
  AGENT_ROSTER_LIMIT,
  agentApprovalBoundaries,
  agentCapabilities,
  agentStateUsesActiveCapacity,
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
  selectedAgentId: string
  onSelectAgent: (agentId: string) => void
  workspace: TeamWorkspaceState
  setWorkspace: Dispatch<SetStateAction<TeamWorkspaceState>>
}

function agentStateLabel(state: AgentState) {
  return agentStates.find((entry) => entry.id === state)?.label ?? state
}

export function AgentTeamsPanel({ activeTeam, selectedAgentId, onSelectAgent, workspace, setWorkspace }: AgentTeamsPanelProps) {
  const teamAgents = workspace.agents.filter((agent) => agent.team === activeTeam)
  const teamItems = workspace.items.filter((item) => item.team === activeTeam && item.status !== 'done')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [humanOwner, setHumanOwner] = useState('')
  const [evidenceSummary, setEvidenceSummary] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [notice, setNotice] = useState('')
  const selectedAgent = selectedAgentId ? teamAgents.find((agent) => agent.id === selectedAgentId) : teamAgents[0]
  const mobileDetailOpen = Boolean(selectedAgentId && selectedAgent)

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
    if (workspace.agents.length >= AGENT_ROSTER_LIMIT) {
      setNotice(`The local roster is capped at ${AGENT_ROSTER_LIMIT}. Pause or reuse an existing role instead of creating more.`)
      return
    }
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
    if (!workItemId) {
      updateAgent(selectedAgent.id, { assignedWorkItemId: undefined, state: 'available', lastEvidence: undefined })
      setNotice(`${selectedAgent.name} returned to available; no execution is running.`)
      return
    }
    const existingOwner = workspace.agents.find((agent) => agent.id !== selectedAgent.id && agent.assignedWorkItemId === workItemId)
    if (existingOwner) {
      setNotice(`${workItemId} already belongs to ${existingOwner.name}. One role owns each work item.`)
      return
    }
    const activeCount = workspace.agents.filter((agent) => agentStateUsesActiveCapacity(agent.state)).length
    const needsCapacity = !agentStateUsesActiveCapacity(selectedAgent.state)
    if (needsCapacity && activeCount >= AGENT_ACTIVE_ASSIGNMENT_LIMIT && (selectedAgent.state === 'available' || selectedAgent.state === 'paused')) {
      setNotice(`Active assignment capacity is ${AGENT_ACTIVE_ASSIGNMENT_LIMIT}. Finish, block, or pause one role first.`)
      return
    }
    updateAgent(selectedAgent.id, {
      assignedWorkItemId: workItemId,
      state: selectedAgent.state === 'available' || selectedAgent.state === 'paused' ? 'assigned' : selectedAgent.state === 'waiting_review' ? 'assigned' : selectedAgent.state,
      lastEvidence: selectedAgent.assignedWorkItemId === workItemId ? selectedAgent.lastEvidence : undefined,
    })
    setNotice(`${selectedAgent.name} assigned to ${workItemId}.`)
  }

  function changeState(state: AgentState) {
    if (!selectedAgent) return
    if ((state === 'available' || state === 'paused')) {
      updateAgent(selectedAgent.id, { state, assignedWorkItemId: undefined })
      setNotice(`${selectedAgent.name} moved to ${agentStateLabel(state)}; no execution is running.`)
      return
    }
    if (!selectedAgent.assignedWorkItemId) {
      setNotice('Assign accountable work before changing this role state.')
      return
    }
    if (state === 'waiting_review' && !selectedAgent.lastEvidence) {
      setNotice('Record evidence before requesting human review.')
      return
    }
    const activeCount = workspace.agents.filter((agent) => agentStateUsesActiveCapacity(agent.state)).length
    if (agentStateUsesActiveCapacity(state)
      && !agentStateUsesActiveCapacity(selectedAgent.state)
      && activeCount >= AGENT_ACTIVE_ASSIGNMENT_LIMIT) {
      setNotice(`Active assignment capacity is ${AGENT_ACTIVE_ASSIGNMENT_LIMIT}. Finish, block, or pause one role first.`)
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

  const activeCount = workspace.agents.filter((agent) => agentStateUsesActiveCapacity(agent.state)).length
  const assignedCount = teamAgents.filter((agent) => agent.state === 'assigned').length
  const reviewCount = teamAgents.filter((agent) => agent.state === 'waiting_review').length
  const blockedCount = teamAgents.filter((agent) => agent.state === 'blocked').length
  const dormantCount = teamAgents.filter((agent) => !agentStateUsesActiveCapacity(agent.state)).length
  const rosterSummary = [
    `${teamAgents.length} ${teamAgents.length === 1 ? 'role' : 'roles'}`,
    `${activeCount}/${AGENT_ACTIVE_ASSIGNMENT_LIMIT} company capacity`,
    ...(dormantCount ? [`${dormantCount} dormant`] : []),
    ...(assignedCount ? [`${assignedCount} assigned`] : []),
    ...(reviewCount ? [`${reviewCount} waiting review`] : []),
    ...(blockedCount ? [`${blockedCount} blocked`] : []),
  ].join(' · ')

  return (
    <div className="agent-team-workspace">
      <div className={`split-workspace agent-team-view ${mobileDetailOpen ? 'mobile-detail-open' : 'mobile-list-open'}`}>
        <section className="core-panel agent-roster-panel">
          <div className="panel-head">
            <div>
              <span className="core-eyebrow">Team roster</span>
              <h2>Delegated roles</h2>
              <p className="agent-roster-overview" aria-label="Agent team summary">
                <span>{rosterSummary}</span>
                <span>Agents prepare work; named humans approve consequential actions. Roster records consume no compute; queued execution scales to zero.</span>
              </p>
            </div>
            <details className="compact-disclosure">
              <summary>Add role</summary>
              <form className="core-form agent-create-form" onSubmit={addAgent}>
                <label>Name<input maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. QA operator" /></label>
                <label>Role<input maxLength={140} required value={role} onChange={(event) => setRole(event.target.value)} placeholder="One bounded responsibility" /></label>
                <label>Human owner<input maxLength={80} required value={humanOwner} onChange={(event) => setHumanOwner(event.target.value)} placeholder="Accountable person or role" /></label>
                <button className="core-button primary compact" disabled={workspace.agents.length >= AGENT_ROSTER_LIMIT} type="submit">{workspace.agents.length >= AGENT_ROSTER_LIMIT ? 'Roster full' : 'Add local role'}</button>
              </form>
            </details>
          </div>
          <div className="agent-roster">
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
            <button className="agent-mobile-back text-link" onClick={() => onSelectAgent('')} type="button">Back to roles</button>
            <div className="record-detail-head">
              <div><span className="core-eyebrow">{selectedAgent.id}</span><h2>{selectedAgent.name}</h2><p>{selectedAgent.role}</p></div>
              <span className={`status-pill ${selectedAgent.state === 'waiting_review' || selectedAgent.state === 'blocked' || selectedAgent.state === 'paused' ? 'pending' : 'bounded'}`}>{agentStateLabel(selectedAgent.state)}</span>
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
          </> : <p className="panel-copy">{teamAgents.length ? 'Select a delegated role.' : 'Add a bounded role to begin delegating work for this team.'}</p>}
        </section>
      </div>
    </div>
  )
}
