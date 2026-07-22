import { type FormEvent, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Empty, PageHeading } from './CoreApp'
import {
  createTeamId,
  evidenceKinds,
  formatTime,
  productStages,
  teamDefinitions,
  type ProductDecision,
  type ProductStage,
  type EvidenceKind,
  type EvidenceRecord,
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

type WorkspaceView = 'board' | 'intake' | 'review' | 'decisions'

const baseViews: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'board', label: 'Board' },
  { id: 'intake', label: 'New work' },
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

export function TeamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTeam = searchParams.get('team')
  const activeTeam = teamDefinitions.some((team) => team.id === requestedTeam) ? requestedTeam as TeamId : 'product'
  const activeDefinition = teamDefinitions.find((team) => team.id === activeTeam) ?? teamDefinitions[0]
  const requestedView = searchParams.get('view') as WorkspaceView | null
  const validViews = activeTeam === 'product' ? [...baseViews, { id: 'decisions' as const, label: 'Decisions' }] : baseViews
  const activeView = validViews.some((view) => view.id === requestedView) ? requestedView as WorkspaceView : 'board'
  const [workspace, setWorkspace] = useTeamWorkspace()
  const teamItems = useMemo(() => workspace.items.filter((item) => item.team === activeTeam), [activeTeam, workspace.items])
  const [selectedItemId, setSelectedItemId] = useState(teamItems[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(`${activeDefinition.label} owner`)
  const [priority, setPriority] = useState<WorkPriority>('P1')
  const [productStage, setProductStage] = useState<ProductStage>('discover')
  const [outcome, setOutcome] = useState('')
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('test')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [evidenceFinding, setEvidenceFinding] = useState('')
  const [decisionTitle, setDecisionTitle] = useState('')
  const [decisionRationale, setDecisionRationale] = useState('')
  const [reviewDecisionId, setReviewDecisionId] = useState('')
  const [decisionReviewer, setDecisionReviewer] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [decisionEvidenceReference, setDecisionEvidenceReference] = useState('')
  const [brief, setBrief] = useState<string[]>([])
  const [notice, setNotice] = useState('')

  const selectedItem = teamItems.find((item) => item.id === selectedItemId) ?? teamItems[0]
  const openItems = teamItems.filter((item) => item.status !== 'done')
  const deliveryItems = teamItems.filter((item) => ['in_progress', 'review'].includes(item.status))
  const blockedItems = teamItems.filter((item) => item.status === 'blocked')
  const evidenceCount = teamItems.reduce((total, item) => total + item.evidence.length, 0)
  const verifiedEvidenceCount = teamItems.reduce((total, item) => total + item.evidence.filter((entry) => entry.status === 'verified').length, 0)
  const releaseComplete = workspace.release.checks.filter((check) => check.complete).length
  const releasePercent = Math.round((releaseComplete / workspace.release.checks.length) * 100)
  const reviewDecision = workspace.decisions.find((decision) => decision.id === reviewDecisionId && decision.status === 'proposed')

  function navigate(team: TeamId, view: WorkspaceView) {
    setSearchParams({ team, view }, { replace: true })
  }

  function selectTeam(team: TeamId) {
    const definition = teamDefinitions.find((item) => item.id === team) ?? teamDefinitions[0]
    setOwner(`${definition.label} owner`)
    setSelectedItemId(workspace.items.find((item) => item.team === team)?.id ?? '')
    setBrief([])
    setNotice('')
    navigate(team, 'board')
  }

  function selectView(view: WorkspaceView) {
    navigate(activeTeam, view)
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
    setSelectedItemId(item.id)
    setNotice(`${item.id} added to ${activeDefinition.label}.`)
    selectView('board')
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
      items: current.items.map((item) => item.id === selectedItem.id
        ? { ...item, evidence: [...item.evidence, record] }
        : item),
    }))
    setEvidenceReference('')
    setEvidenceFinding('')
    setNotice(`${record.id} attached as observed evidence. Review it before verification.`)
  }

  function verifyEvidence(itemId: string, evidenceId: string) {
    const verifiedAt = new Date().toISOString()
    setWorkspace((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId
        ? { ...item, evidence: item.evidence.map((entry) => entry.id === evidenceId ? { ...entry, status: 'verified', verifiedAt } : entry) }
        : item),
    }))
    setNotice(`${evidenceId} marked verified in this local trial.`)
  }

  function prepareBrief() {
    setBrief([
      `${openItems.length} open ${activeDefinition.label} item${openItems.length === 1 ? '' : 's'}; ${deliveryItems.length} in delivery or review.`,
      blockedItems.length ? `${blockedItems.length} blocked item${blockedItems.length === 1 ? '' : 's'} needs an owner decision.` : 'No blocked work is recorded.',
      `${verifiedEvidenceCount} of ${evidenceCount} evidence record${evidenceCount === 1 ? '' : 's'} verified in this team workspace.`,
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
    setNotice(`${reviewDecision.id} accepted by ${decisionReviewer.trim()} with an evidence reference.`)
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
        checks: current.release.checks.map((check) => check.id === checkId ? { ...check, complete: !check.complete } : check),
      },
    }))
  }

  return (
    <div className="workspace-screen team-screen">
      <PageHeading
        eyebrow="Teams"
        title={activeDefinition.label}
        copy={activeDefinition.purpose}
        actions={<button className="core-button primary compact" onClick={() => selectView('intake')} type="button">New work</button>}
      />
      <div className="workspace-toolbar">
        <div className="segmented-control" role="group" aria-label="Team workspace">
          {teamDefinitions.map((team) => <button aria-pressed={activeTeam === team.id} key={team.id} onClick={() => selectTeam(team.id)} type="button">{team.label}</button>)}
        </div>
        <div className="view-tabs" role="tablist" aria-label={`${activeDefinition.label} views`}>
          {validViews.map((view) => <button aria-selected={activeView === view.id} key={view.id} onClick={() => selectView(view.id)} role="tab" type="button">{view.label}</button>)}
        </div>
      </div>
      <section className="summary-strip" aria-label={`${activeDefinition.label} summary`}>
        <span><small>Open</small><strong>{openItems.length}</strong></span>
        <span><small>Delivery</small><strong>{deliveryItems.length}</strong></span>
        <span><small>Blocked</small><strong>{blockedItems.length}</strong></span>
        <span><small>Verified evidence</small><strong>{verifiedEvidenceCount}/{evidenceCount}</strong></span>
        {activeTeam === 'product' ? <span><small>Release</small><strong>{releasePercent}%</strong></span> : null}
      </section>

      <div className="workspace-view">
        {activeView === 'board' ? <div className="split-workspace team-board-view">
          <section className="core-panel queue-panel">
            <div className="panel-head"><div><span className="core-eyebrow">Owned work</span><h2>{openItems.length} active records</h2></div></div>
            {teamItems.length ? <div className="record-list" role="list">{teamItems.map((item) => (
              <button aria-current={selectedItem?.id === item.id ? 'true' : undefined} className="record-row" key={item.id} onClick={() => setSelectedItemId(item.id)} type="button">
                <span className={`record-status ${item.status}`} />
                <span><strong>{item.title}</strong><small>{item.id} · {item.owner}</small></span>
                <span><b>{item.priority}</b><small>{statusLabel(item.status)}</small></span>
              </button>
            ))}</div> : <Empty>No work is recorded for this team.</Empty>}
          </section>
          <section className="core-panel record-detail-panel">
            {selectedItem ? <>
              <div className="record-detail-head"><div><span className="core-eyebrow">{selectedItem.id}</span><h2>{selectedItem.title}</h2><p>{selectedItem.outcome}</p></div><span className={`status-pill ${selectedItem.status === 'done' ? 'approved' : selectedItem.status === 'blocked' ? 'pending' : 'bounded'}`}>{statusLabel(selectedItem.status)}</span></div>
              <div className="record-controls">
                <label>Owner<input aria-label={`Owner for ${selectedItem.title}`} maxLength={80} value={selectedItem.owner} onChange={(event) => updateWork(selectedItem.id, { owner: event.target.value })} /></label>
                <label>Status<select aria-label={`Status for ${selectedItem.title}`} value={selectedItem.status} onChange={(event) => changeWorkStatus(selectedItem.id, event.target.value as WorkStatus)}>{workStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
                <label>Priority<select value={selectedItem.priority} onChange={(event) => updateWork(selectedItem.id, { priority: event.target.value as WorkPriority })}><option>P0</option><option>P1</option><option>P2</option></select></label>
                {activeTeam === 'product' ? <label>Lifecycle<select value={selectedItem.productStage ?? defaultProductStage(selectedItem.status)} onChange={(event) => updateWork(selectedItem.id, { productStage: event.target.value as ProductStage })}>{productStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label> : null}
              </div>
              <div className="evidence-register"><div><span>Evidence register</span><small>{selectedItem.evidence.filter((entry) => entry.status === 'verified').length}/{selectedItem.evidence.length} verified</small></div>{selectedItem.evidence.length ? <div className="evidence-record-list">{selectedItem.evidence.map((entry) => <article key={entry.id}><div><span className={`status-pill ${entry.status === 'verified' ? 'approved' : 'pending'}`}>{entry.status}</span><b>{evidenceKinds.find((kind) => kind.id === entry.kind)?.label ?? entry.kind}</b></div><strong>{entry.finding}</strong><small>{entry.reference} · {formatTime(entry.createdAt)}</small>{entry.status === 'observed' ? <button className="text-link" onClick={() => verifyEvidence(selectedItem.id, entry.id)} type="button">Mark verified</button> : null}</article>)}</div> : <p>No evidence attached yet.</p>}</div>
              <form className="inline-evidence" onSubmit={attachEvidence}><label><span className="sr-only">Evidence type</span><select aria-label="Evidence type" value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value as EvidenceKind)}>{evidenceKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label><label><span className="sr-only">Evidence source or reference</span><input maxLength={180} required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Source, file, test, URL, or record" /></label><label><span className="sr-only">Evidence finding</span><input maxLength={240} required value={evidenceFinding} onChange={(event) => setEvidenceFinding(event.target.value)} placeholder="What does this evidence prove?" /></label><button className="core-button compact" type="submit">Attach</button></form>
              <p className="form-notice" aria-live="polite">{notice || `Updated ${formatTime(selectedItem.createdAt)} · changes stay in this browser.`}</p>
            </> : <Empty>Select a work record.</Empty>}
          </section>
        </div> : null}

        {activeView === 'intake' ? <div className="split-workspace intake-view">
          <section className="core-panel form-panel">
            <div className="panel-head"><div><span className="core-eyebrow">New accountable work</span><h2>Define the result before the task.</h2></div></div>
            <form className="core-form compact-form" onSubmit={addWork}>
              <label>Work item<input maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`What should ${activeDefinition.label} own?`} /></label>
              <div className="form-row"><label>Owner<input maxLength={80} required value={owner} onChange={(event) => setOwner(event.target.value)} /></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as WorkPriority)}><option>P0</option><option>P1</option><option>P2</option></select></label></div>
              {activeTeam === 'product' ? <label>Product lifecycle stage<select value={productStage} onChange={(event) => setProductStage(event.target.value as ProductStage)}>{productStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label> : null}
              <label>Acceptance outcome<textarea maxLength={320} required value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="What observable result makes this done?" /></label>
              <div className="form-actions"><button className="core-button" onClick={() => selectView('board')} type="button">Cancel</button><button className="core-button primary" type="submit">Add work</button></div>
            </form>
          </section>
          <aside className="core-panel guidance-panel"><span className="core-eyebrow">Definition of ready</span><h2>One record should answer four questions.</h2><ol><li>What observable outcome changes?</li><li>Who owns the decision?</li><li>What evidence will prove it?</li><li>What authority remains human?</li></ol></aside>
        </div> : null}

        {activeView === 'review' ? <div className="review-workspace">
          {activeTeam === 'product' ? <section className="core-panel lifecycle-panel">
            <div className="panel-head"><div><span className="core-eyebrow">Product lifecycle</span><h2>Discover → define → build → release → learn</h2></div></div>
            <div className="lifecycle-grid">{productStages.map((stage) => { const stageItems = teamItems.filter((item) => (item.productStage ?? defaultProductStage(item.status)) === stage.id); return <article key={stage.id}><span>{stage.label}</span><strong>{stageItems.length}</strong><p>{stage.purpose}</p></article> })}</div>
          </section> : null}
          <div className="split-workspace review-grid">
            <section className="core-panel release-panel">
              <div className="panel-head"><div><span className="core-eyebrow">{activeTeam === 'product' ? 'Release control' : 'Team review'}</span><h2>{activeTeam === 'product' ? workspace.release.name : `${activeDefinition.label} evidence`}</h2></div>{activeTeam === 'product' ? <span className="status-pill bounded">{releasePercent}% ready</span> : null}</div>
              {activeTeam === 'product' ? <div className="release-checks">{workspace.release.checks.map((check) => <label key={check.id}><input checked={check.complete} onChange={() => toggleReleaseCheck(check.id)} type="checkbox" /><span>{check.label}</span></label>)}</div> : <div className="evidence-summary"><strong>{evidenceCount}</strong><p>Evidence references are attached across {teamItems.length} work records.</p></div>}
            </section>
            <section className="core-panel brief-panel">
              <div className="panel-head"><div><span className="core-eyebrow">Record brief</span><h2>Review what the evidence says.</h2></div><button className="core-button compact" onClick={prepareBrief} type="button">Prepare brief</button></div>
              {brief.length ? <div className="brief-output"><div className="brief-command"><span>&gt;</span> summarize {activeDefinition.label.toLowerCase()} records</div>{brief.map((line) => <p key={line}>{line}</p>)}</div> : <Empty>The brief uses only this team’s recorded work and evidence.</Empty>}
              <p className="authority-note">Preparation is not approval. Sends, payments, publishing, and production writes remain owner-controlled.</p>
            </section>
          </div>
        </div> : null}

        {activeView === 'decisions' && activeTeam === 'product' ? <div className="split-workspace decision-view">
          <section className="core-panel decision-list-panel">
            <div className="panel-head"><div><span className="core-eyebrow">Product decisions</span><h2>Rationale stays with the record.</h2></div></div>
            <div className="decision-list">{workspace.decisions.map((decision) => <article key={decision.id}><div><span className={`status-pill ${decision.status === 'accepted' ? 'approved' : 'pending'}`}>{decision.status}</span><strong>{decision.title}</strong><p>{decision.rationale}</p><small>{decision.id} · {decision.owner} · {formatTime(decision.createdAt)}</small>{decision.status === 'accepted' ? <small>{decision.acceptedActorKind === 'human' && decision.acceptedBy ? `Accepted by ${decision.acceptedBy} · ${decision.acceptanceEvidenceReference}` : 'Legacy acceptance · reviewer attribution unavailable'}</small> : null}</div>{decision.status === 'proposed' ? <button className="core-button compact" onClick={() => startDecisionReview(decision.id)} type="button">Review</button> : null}</article>)}</div>
          </section>
          <section className="core-panel decision-form-panel">{reviewDecision ? <><span className="core-eyebrow">Human acceptance</span><h2>{reviewDecision.title}</h2><p className="panel-copy">{reviewDecision.rationale}</p><form className="core-form compact-form decision-acceptance-form" onSubmit={acceptDecision}><label>Human reviewer<input autoFocus maxLength={80} required value={decisionReviewer} onChange={(event) => setDecisionReviewer(event.target.value)} placeholder="Name or accountable role" /></label><label>Decision note<textarea maxLength={360} required value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Why this is accepted and what boundary remains." /></label><label>Evidence reference<input maxLength={240} required value={decisionEvidenceReference} onChange={(event) => setDecisionEvidenceReference(event.target.value)} placeholder="Record, test, source, or review URL" /></label><div className="form-actions"><button className="text-link" onClick={() => setReviewDecisionId('')} type="button">Cancel</button><button className="core-button primary" type="submit">Accept and record</button></div></form></> : <><span className="core-eyebrow">Proposal</span><h2>Record a decision.</h2><form className="core-form compact-form" onSubmit={addDecision}><label>Decision<input maxLength={160} required value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} /></label><label>Rationale<textarea maxLength={360} required value={decisionRationale} onChange={(event) => setDecisionRationale(event.target.value)} /></label><button className="core-button primary" type="submit">Record proposal</button></form></>}<p className="form-notice" aria-live="polite">{notice}</p></section>
        </div> : null}
      </div>
    </div>
  )
}
