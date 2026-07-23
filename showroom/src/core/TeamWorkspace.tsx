import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { AgentTeamsPanel } from './AgentTeamsPanel'
import { Empty, PageHeading } from './CoreApp'
import {
  createTeamId,
  evidenceKinds,
  formatTime,
  productStages,
  teamDefinitions,
  type EvidenceKind,
  type EvidenceRecord,
  type ProductDecision,
  type ProductStage,
  type TeamId,
  type TeamWorkItem,
  type WorkPriority,
  type WorkStatus,
  useTeamWorkspace,
} from './team-work'

const workStatuses = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
] as const satisfies ReadonlyArray<{ id: WorkStatus; label: string }>

const teamPrefixes: Record<TeamId, string> = {
  product: 'PROD',
  engineering: 'ENG',
  growth: 'GROW',
  finance: 'FIN',
}

type WorkspaceView = 'work' | 'agents' | 'review'

const workspaceViews: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'work', label: 'Work' },
  { id: 'agents', label: 'Agents' },
  { id: 'review', label: 'Review' },
]

function statusLabel(status: WorkStatus) {
  return workStatuses.find((item) => item.id === status)?.label ?? status
}

function defaultProductStage(status: WorkStatus): ProductStage {
  if (status === 'done') return 'learn'
  if (status === 'review') return 'release'
  if (status === 'in_progress') return 'build'
  return 'define'
}

function normalizeView(value: string | null): WorkspaceView {
  if (value === 'agents' || value === 'review') return value
  if (value === 'decisions') return 'review'
  return 'work'
}

export function TeamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTeam = searchParams.get('team')
  const requestedView = searchParams.get('view')
  const requestedItemId = searchParams.get('item')
  const requestedAgentId = searchParams.get('agent')
  const activeTeam = teamDefinitions.some((team) => team.id === requestedTeam) ? requestedTeam as TeamId : 'product'
  const activeDefinition = teamDefinitions.find((team) => team.id === activeTeam) ?? teamDefinitions[0]
  const activeView = normalizeView(requestedView)
  const [workspace, setWorkspace] = useTeamWorkspace()
  const teamItems = workspace.items.filter((item) => item.team === activeTeam)
  const [showIntake, setShowIntake] = useState(requestedView === 'intake')
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(`${activeDefinition.label} owner`)
  const [priority, setPriority] = useState<WorkPriority>('P1')
  const [productStage, setProductStage] = useState<ProductStage>('discover')
  const [outcome, setOutcome] = useState('')
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('test')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [evidenceFinding, setEvidenceFinding] = useState('')
  const [evidenceReviewId, setEvidenceReviewId] = useState('')
  const [evidenceReviewer, setEvidenceReviewer] = useState('')
  const [decisionTitle, setDecisionTitle] = useState('')
  const [decisionRationale, setDecisionRationale] = useState('')
  const [reviewDecisionId, setReviewDecisionId] = useState('')
  const [decisionReviewer, setDecisionReviewer] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [decisionEvidenceReference, setDecisionEvidenceReference] = useState('')
  const [brief, setBrief] = useState<string[]>([])
  const [notice, setNotice] = useState('')

  const intakeOpen = showIntake || requestedView === 'intake'
  const selectedItem = requestedItemId ? teamItems.find((item) => item.id === requestedItemId) : teamItems[0]
  const mobileDetailOpen = Boolean(requestedItemId && selectedItem)
  const mobileAgentDetailOpen = activeView === 'agents'
    && Boolean(requestedAgentId && workspace.agents.some((agent) => agent.team === activeTeam && agent.id === requestedAgentId))
  const mobileFocusOpen = intakeOpen || (activeView === 'work' && mobileDetailOpen) || mobileAgentDetailOpen
  const openItems = teamItems.filter((item) => item.status !== 'done')
  const activeItems = teamItems.filter((item) => ['in_progress', 'review'].includes(item.status))
  const blockedItems = teamItems.filter((item) => item.status === 'blocked')
  const evidenceCount = teamItems.reduce((total, item) => total + item.evidence.length, 0)
  const verifiedEvidenceCount = teamItems.reduce((total, item) => total + item.evidence.filter((entry) => entry.status === 'verified').length, 0)
  const releaseComplete = workspace.release.checks.filter((check) => check.complete).length
  const releasePercent = Math.round((releaseComplete / workspace.release.checks.length) * 100)
  const reviewDecision = workspace.decisions.find((decision) => decision.id === reviewDecisionId && decision.status === 'proposed')

  useEffect(() => {
    if (!mobileFocusOpen || !window.matchMedia('(max-width: 840px)').matches) return
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [mobileFocusOpen, requestedAgentId, requestedItemId])

  function navigate(team: TeamId, view: WorkspaceView, selectedId?: string) {
    const next = { team, view } as Record<string, string>
    if (view === 'work' && selectedId) next.item = selectedId
    if (view === 'agents' && selectedId) next.agent = selectedId
    setSearchParams(next, { replace: true })
  }

  function selectTeam(team: TeamId) {
    const definition = teamDefinitions.find((item) => item.id === team) ?? teamDefinitions[0]
    setOwner(`${definition.label} owner`)
    setShowIntake(false)
    setBrief([])
    setNotice('')
    navigate(team, activeView)
  }

  function selectView(view: WorkspaceView) {
    setShowIntake(false)
    navigate(activeTeam, view)
  }

  function openNewWork() {
    navigate(activeTeam, 'work')
    setShowIntake(true)
  }

  function addWork(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !owner.trim() || !outcome.trim()) return
    const item: TeamWorkItem = {
      id: createTeamId(teamPrefixes[activeTeam]),
      createdAt: new Date().toISOString(),
      team: activeTeam,
      title: title.trim(),
      owner: owner.trim(),
      priority,
      status: 'backlog',
      productStage: activeTeam === 'product' ? productStage : undefined,
      outcome: outcome.trim(),
      evidence: [],
    }
    setWorkspace((current) => ({ ...current, items: [item, ...current.items] }))
    setTitle('')
    setOutcome('')
    setShowIntake(false)
    setNotice(`${item.id} added to ${activeDefinition.label}.`)
    navigate(activeTeam, 'work', item.id)
  }

  function updateWork(itemId: string, patch: Partial<Pick<TeamWorkItem, 'status' | 'owner' | 'priority' | 'productStage'>>) {
    setWorkspace((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    }))
  }

  function changeWorkStatus(itemId: string, status: WorkStatus) {
    const item = workspace.items.find((candidate) => candidate.id === itemId)
    if (status === 'done' && !item?.evidence.some((entry) => entry.status === 'verified')) {
      setNotice(`Verify at least one evidence record before marking ${itemId} done.`)
      return
    }
    updateWork(itemId, { status })
    setNotice(`${itemId} moved to ${statusLabel(status)}.`)
  }

  function attachEvidence(event: FormEvent) {
    event.preventDefault()
    if (!selectedItem || !evidenceReference.trim() || !evidenceFinding.trim()) return
    const record: EvidenceRecord = {
      id: createTeamId('EVD'),
      createdAt: new Date().toISOString(),
      kind: evidenceKind,
      finding: evidenceFinding.trim(),
      reference: evidenceReference.trim(),
      status: 'observed',
    }
    setWorkspace((current) => ({
      ...current,
      items: current.items.map((item) => item.id === selectedItem.id ? { ...item, evidence: [...item.evidence, record] } : item),
    }))
    setEvidenceReference('')
    setEvidenceFinding('')
    setNotice(`${record.id} attached as observed evidence.`)
  }

  function verifyEvidence(event: FormEvent, itemId: string, evidenceId: string) {
    event.preventDefault()
    if (!evidenceReviewer.trim()) return
    const verifiedAt = new Date().toISOString()
    setWorkspace((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId
        ? { ...item, evidence: item.evidence.map((entry) => entry.id === evidenceId ? { ...entry, status: 'verified', verifiedAt, verifiedBy: evidenceReviewer.trim(), verifiedActorKind: 'human' } : entry) }
        : item),
    }))
    setEvidenceReviewId('')
    setEvidenceReviewer('')
    setNotice(`${evidenceId} verified by ${evidenceReviewer.trim()}.`)
  }

  function prepareBrief() {
    setBrief([
      `${openItems.length} open ${activeDefinition.label} item${openItems.length === 1 ? '' : 's'}; ${activeItems.length} in progress or review.`,
      blockedItems.length ? `${blockedItems.length} blocked item${blockedItems.length === 1 ? '' : 's'} needs a human owner.` : 'No blocked work is recorded.',
      `${verifiedEvidenceCount} of ${evidenceCount} evidence record${evidenceCount === 1 ? '' : 's'} verified.`,
    ])
  }

  function addDecision(event: FormEvent) {
    event.preventDefault()
    if (!decisionTitle.trim() || !decisionRationale.trim()) return
    const decision: ProductDecision = {
      id: createTeamId('DEC'),
      createdAt: new Date().toISOString(),
      title: decisionTitle.trim(),
      owner: owner.trim() || 'Product owner',
      rationale: decisionRationale.trim(),
      status: 'proposed',
    }
    setWorkspace((current) => ({ ...current, decisions: [decision, ...current.decisions] }))
    setDecisionTitle('')
    setDecisionRationale('')
    setNotice(`${decision.id} recorded for review.`)
  }

  function startDecisionReview(decisionId: string) {
    setReviewDecisionId(decisionId)
    setDecisionReviewer('')
    setDecisionNote('')
    setDecisionEvidenceReference('')
    setNotice('Record the human reviewer, reason, and supporting evidence before acceptance.')
  }

  function acceptDecision(event: FormEvent) {
    event.preventDefault()
    if (!reviewDecision || !decisionReviewer.trim() || !decisionNote.trim() || !decisionEvidenceReference.trim()) return
    const acceptedAt = new Date().toISOString()
    setWorkspace((current) => ({
      ...current,
      decisions: current.decisions.map((decision) => decision.id === reviewDecision.id ? {
        ...decision,
        status: 'accepted',
        acceptedAt,
        acceptedBy: decisionReviewer.trim(),
        acceptedActorKind: 'human',
        acceptanceNote: decisionNote.trim(),
        acceptanceEvidenceReference: decisionEvidenceReference.trim(),
      } : decision),
    }))
    setNotice(`${reviewDecision.id} accepted by ${decisionReviewer.trim()}.`)
    setReviewDecisionId('')
    setDecisionReviewer('')
    setDecisionNote('')
    setDecisionEvidenceReference('')
  }

  function toggleReleaseCheck(checkId: string) {
    const check = workspace.release.checks.find((candidate) => candidate.id === checkId)
    if (check && !check.complete && verifiedEvidenceCount === 0) {
      setNotice('Verify at least one Product evidence record before completing a release check.')
      return
    }
    setWorkspace((current) => ({
      ...current,
      release: {
        ...current.release,
        checks: current.release.checks.map((entry) => entry.id === checkId ? { ...entry, complete: !entry.complete } : entry),
      },
    }))
  }

  return (
    <div className={`workspace-screen team-screen ${mobileFocusOpen ? 'mobile-focus-open' : ''}`}>
      <PageHeading
        eyebrow="Teams"
        title={activeDefinition.label}
        copy="Accountable work, delegated roles, evidence, and human review in one workspace."
        actions={<button className="core-button primary" onClick={openNewWork} type="button">New work</button>}
      />
      <div className="workspace-toolbar simple-toolbar">
        <label className="team-picker"><span>Team</span><select aria-label="Team" value={activeTeam} onChange={(event) => selectTeam(event.target.value as TeamId)}>{teamDefinitions.map((team) => <option key={team.id} value={team.id}>{team.label}</option>)}</select></label>
        <nav className="view-tabs" aria-label={`${activeDefinition.label} workspace views`}>
          {workspaceViews.map((view) => <button aria-current={activeView === view.id ? 'page' : undefined} key={view.id} onClick={() => selectView(view.id)} type="button">{view.label}</button>)}
        </nav>
      </div>
      {activeView !== 'agents' ? <section className="summary-strip compact-summary" aria-label={`${activeDefinition.label} summary`}>
        <span><small>Active</small><strong>{activeItems.length}</strong></span>
        <span><small>Blocked</small><strong>{blockedItems.length}</strong></span>
        <span><small>Verified</small><strong>{verifiedEvidenceCount}/{evidenceCount}</strong></span>
      </section> : null}

      <div className="workspace-view">
        {activeView === 'work' && intakeOpen ? <div className="split-workspace intake-view focused-intake">
          <section className="core-panel form-panel">
            <div className="panel-head"><div><span className="core-eyebrow">New accountable work</span><h2>Define the result first.</h2></div></div>
            <form className="core-form compact-form" onSubmit={addWork}>
              <label>Work item<input maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`What should ${activeDefinition.label} own?`} /></label>
              <div className="form-row"><label>Owner<input maxLength={80} required value={owner} onChange={(event) => setOwner(event.target.value)} /></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as WorkPriority)}><option>P0</option><option>P1</option><option>P2</option></select></label></div>
              {activeTeam === 'product' ? <label>Lifecycle<select value={productStage} onChange={(event) => setProductStage(event.target.value as ProductStage)}>{productStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label> : null}
              <label>Acceptance outcome<textarea maxLength={320} required value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="What observable result makes this done?" /></label>
              <div className="form-actions"><button className="core-button" onClick={() => selectView('work')} type="button">Cancel</button><button className="core-button primary" type="submit">Add work</button></div>
            </form>
          </section>
          <aside className="core-panel guidance-panel"><span className="core-eyebrow">Definition of ready</span><h2>Outcome, owner, evidence, boundary.</h2><ol><li>Name the observable result.</li><li>Assign one accountable human.</li><li>State what evidence proves it.</li><li>Keep consequential authority human.</li></ol></aside>
        </div> : null}

        {activeView === 'work' && !intakeOpen ? <div className={`split-workspace team-board-view ${mobileDetailOpen ? 'mobile-detail-open' : 'mobile-list-open'}`}>
          <section className="core-panel queue-panel">
            <div className="panel-head"><div><span className="core-eyebrow">Owned work</span><h2>{openItems.length} open</h2></div></div>
            {teamItems.length ? <ul className="record-list">{teamItems.map((item) => (
              <li key={item.id}>
                <button aria-current={selectedItem?.id === item.id ? 'true' : undefined} className="record-row" onClick={() => navigate(activeTeam, 'work', item.id)} type="button">
                  <span className={`record-status ${item.status}`} />
                  <span><strong>{item.title}</strong><small>{item.id} / {item.owner}</small></span>
                  <span><b>{item.priority}</b><small>{statusLabel(item.status)}</small></span>
                </button>
              </li>
            ))}</ul> : <Empty>No work is recorded for this team.</Empty>}
          </section>
          <section className="core-panel record-detail-panel">
            {selectedItem ? <>
              <button className="team-mobile-back text-link" onClick={() => navigate(activeTeam, 'work')} type="button">Back to work</button>
              <div className="record-detail-head"><div><span className="core-eyebrow">{selectedItem.id}</span><h2>{selectedItem.title}</h2><p>{selectedItem.outcome}</p></div><span className={`status-pill ${selectedItem.status === 'done' ? 'approved' : selectedItem.status === 'blocked' ? 'pending' : 'bounded'}`}>{statusLabel(selectedItem.status)}</span></div>
              <div className="record-controls">
                <label>Owner<input aria-label={`Owner for ${selectedItem.title}`} maxLength={80} value={selectedItem.owner} onChange={(event) => updateWork(selectedItem.id, { owner: event.target.value })} /></label>
                <label>Status<select aria-label={`Status for ${selectedItem.title}`} value={selectedItem.status} onChange={(event) => changeWorkStatus(selectedItem.id, event.target.value as WorkStatus)}>{workStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
                <label>Priority<select value={selectedItem.priority} onChange={(event) => updateWork(selectedItem.id, { priority: event.target.value as WorkPriority })}><option>P0</option><option>P1</option><option>P2</option></select></label>
                {activeTeam === 'product' ? <label>Lifecycle<select value={selectedItem.productStage ?? defaultProductStage(selectedItem.status)} onChange={(event) => updateWork(selectedItem.id, { productStage: event.target.value as ProductStage })}>{productStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label> : null}
              </div>
              <details className="evidence-disclosure">
                <summary><span>Evidence register</span><strong>{selectedItem.evidence.filter((entry) => entry.status === 'verified').length}/{selectedItem.evidence.length} verified</strong></summary>
                {selectedItem.evidence.length ? <div className="evidence-record-list">{selectedItem.evidence.map((entry) => <article key={entry.id}><div><span className={`status-pill ${entry.status === 'verified' ? 'approved' : 'pending'}`}>{entry.status}</span><b>{evidenceKinds.find((kind) => kind.id === entry.kind)?.label ?? entry.kind}</b></div><strong>{entry.finding}</strong><small>{entry.reference} / {formatTime(entry.createdAt)}{entry.verifiedBy ? ` / verified by ${entry.verifiedBy}` : ''}</small>{entry.status === 'observed' ? evidenceReviewId === entry.id ? <form className="evidence-verification-form" onSubmit={(event) => verifyEvidence(event, selectedItem.id, entry.id)}><label><span className="sr-only">Human reviewer</span><input autoFocus maxLength={80} required value={evidenceReviewer} onChange={(event) => setEvidenceReviewer(event.target.value)} placeholder="Human reviewer" /></label><button className="core-button compact" type="submit">Verify</button><button className="text-link" onClick={() => setEvidenceReviewId('')} type="button">Cancel</button></form> : <button className="text-link" onClick={() => { setEvidenceReviewId(entry.id); setEvidenceReviewer('') }} type="button">Review</button> : null}</article>)}</div> : <p className="panel-copy">No evidence attached yet.</p>}
                <form className="inline-evidence" onSubmit={attachEvidence}><label><span className="sr-only">Evidence type</span><select aria-label="Evidence type" value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value as EvidenceKind)}>{evidenceKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label><label><span className="sr-only">Evidence source or reference</span><input maxLength={180} required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Source or reference" /></label><label><span className="sr-only">Evidence finding</span><input maxLength={240} required value={evidenceFinding} onChange={(event) => setEvidenceFinding(event.target.value)} placeholder="What does it prove?" /></label><button className="core-button compact" type="submit">Attach</button></form>
              </details>
              <p className="form-notice" aria-live="polite">{notice || `Updated ${formatTime(selectedItem.createdAt)} / local record only.`}</p>
            </> : <Empty>Select a work record.</Empty>}
          </section>
        </div> : null}

        {activeView === 'agents' ? <AgentTeamsPanel activeTeam={activeTeam} onSelectAgent={(agentId) => navigate(activeTeam, 'agents', agentId)} selectedAgentId={requestedAgentId ?? ''} setWorkspace={setWorkspace} workspace={workspace} /> : null}

        {activeView === 'review' ? <div className="review-workspace simplified-review">
          <div className="split-workspace review-grid">
            <section className="core-panel release-panel">
              <div className="panel-head"><div><span className="core-eyebrow">{activeTeam === 'product' ? 'Release control' : 'Evidence review'}</span><h2>{activeTeam === 'product' ? workspace.release.name : activeDefinition.label}</h2></div>{activeTeam === 'product' ? <span className="status-pill bounded">{releasePercent}% ready</span> : null}</div>
              {activeTeam === 'product' ? <div className="release-checks">{workspace.release.checks.map((check) => <label key={check.id}><input checked={check.complete} onChange={() => toggleReleaseCheck(check.id)} type="checkbox" /><span>{check.label}</span></label>)}</div> : <div className="evidence-summary"><strong>{verifiedEvidenceCount}/{evidenceCount}</strong><p>Verified evidence across {teamItems.length} work records.</p></div>}
            </section>
            <section className="core-panel brief-panel">
              <div className="panel-head"><div><span className="core-eyebrow">Team brief</span><h2>Review recorded facts.</h2></div><button className="core-button compact" onClick={prepareBrief} type="button">Prepare</button></div>
              {brief.length ? <div className="brief-output">{brief.map((line) => <p key={line}>{line}</p>)}</div> : <Empty>The brief uses only recorded work and evidence.</Empty>}
              <p className="authority-note">Preparation is not approval. Sends, payments, publishing, merges, deployments, and production writes remain human-controlled.</p>
            </section>
          </div>
          {activeTeam === 'product' ? <details className="core-panel decision-workspace-disclosure" open={requestedView === 'decisions' ? true : undefined}>
            <summary><span>Product decisions</span><strong>{workspace.decisions.length} records</strong></summary>
            <div className="decision-workspace-content">
              <div className="decision-list">{workspace.decisions.map((decision) => <article key={decision.id}><div><span className={`status-pill ${decision.status === 'accepted' ? 'approved' : 'pending'}`}>{decision.status}</span><strong>{decision.title}</strong><p>{decision.rationale}</p><small>{decision.id} / {decision.owner} / {formatTime(decision.createdAt)}</small>{decision.status === 'accepted' ? <small>{decision.acceptedActorKind === 'human' && decision.acceptedBy ? `Accepted by ${decision.acceptedBy} / ${decision.acceptanceEvidenceReference}` : 'Reviewer attribution unavailable'}</small> : null}</div>{decision.status === 'proposed' ? <button className="core-button compact" onClick={() => startDecisionReview(decision.id)} type="button">Review</button> : null}</article>)}</div>
              <div className="decision-form-panel">{reviewDecision ? <><span className="core-eyebrow">Human acceptance</span><h2>{reviewDecision.title}</h2><form className="core-form compact-form" onSubmit={acceptDecision}><label>Human reviewer<input autoFocus maxLength={80} required value={decisionReviewer} onChange={(event) => setDecisionReviewer(event.target.value)} /></label><label>Decision note<textarea maxLength={360} required value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label><label>Evidence reference<input maxLength={240} required value={decisionEvidenceReference} onChange={(event) => setDecisionEvidenceReference(event.target.value)} /></label><div className="form-actions"><button className="core-button" onClick={() => setReviewDecisionId('')} type="button">Cancel</button><button className="core-button primary" type="submit">Accept and record</button></div></form></> : <><span className="core-eyebrow">Proposal</span><h2>Record a decision.</h2><form className="core-form compact-form" onSubmit={addDecision}><label>Decision<input maxLength={160} required value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} /></label><label>Rationale<textarea maxLength={360} required value={decisionRationale} onChange={(event) => setDecisionRationale(event.target.value)} /></label><button className="core-button primary" type="submit">Record proposal</button></form></>}</div>
            </div>
          </details> : null}
          <p className="form-notice" aria-live="polite">{notice}</p>
        </div> : null}
      </div>
    </div>
  )
}
