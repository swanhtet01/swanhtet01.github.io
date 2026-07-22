import { type FormEvent, useState } from 'react'

import {
  evidenceRequirements,
  formatTimestamp,
  type EvidenceKind,
  type ReadinessCheck,
  type WebsiteWorkspace,
} from './website-model'

type EvidenceInput = {
  kind: EvidenceKind
  finding: string
  reference: string
  verifiedBy: string
}

type ApprovalInput = {
  reviewer: string
  note: string
}

type PublishWorkspaceProps = {
  approvalIsCurrent: boolean
  checks: ReadinessCheck[]
  fingerprint: string
  publishIsCurrent: boolean
  workspace: WebsiteWorkspace
  onAddEvidence: (input: EvidenceInput) => void
  onApprove: (input: ApprovalInput) => void
  onRecordPublish: () => void
}

export function PublishWorkspace({
  approvalIsCurrent,
  checks,
  fingerprint,
  publishIsCurrent,
  workspace,
  onAddEvidence,
  onApprove,
  onRecordPublish,
}: PublishWorkspaceProps) {
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('content')
  const [evidenceFinding, setEvidenceFinding] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [evidenceVerifier, setEvidenceVerifier] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [approvalConfirmed, setApprovalConfirmed] = useState(false)
  const passedCount = checks.filter((check) => check.passed).length
  const allChecksPass = passedCount === checks.length
  const staleEvidenceCount = workspace.evidence.filter((entry) => entry.fingerprint !== fingerprint).length

  function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onAddEvidence({
      kind: evidenceKind,
      finding: evidenceFinding.trim(),
      reference: evidenceReference.trim(),
      verifiedBy: evidenceVerifier.trim(),
    })
    setEvidenceFinding('')
    setEvidenceReference('')
  }

  function submitApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!allChecksPass || !approvalConfirmed) return
    onApprove({ reviewer: reviewer.trim(), note: approvalNote.trim() })
    setApprovalConfirmed(false)
  }

  return (
    <section className="website-editor-panel website-publish-panel" aria-labelledby="publish-editor-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Publish control</span>
          <h2 id="publish-editor-title">Readiness and approval</h2>
          <p>Checks use only the current local workspace revision.</p>
        </div>
        <span className={'website-status ' + (allChecksPass ? 'is-ready' : 'is-pending')}>
          {passedCount}/{checks.length} passed
        </span>
      </header>

      <div className="website-editor-scroll">
        <section className="website-publish-section" aria-labelledby="readiness-title">
          <header>
            <div>
              <span className="website-step">01</span>
              <div>
                <h3 id="readiness-title">Publish-readiness checks</h3>
                <p>Content checks are derived; evidence is explicitly recorded.</p>
              </div>
            </div>
            <code>{fingerprint}</code>
          </header>
          <div className="website-check-list">
            {checks.map((check) => (
              <article className={check.passed ? 'is-passed' : 'is-blocked'} key={check.id}>
                <span aria-hidden="true">{check.passed ? '✓' : '!'}</span>
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="website-publish-section" aria-labelledby="evidence-title">
          <header>
            <div>
              <span className="website-step">02</span>
              <div>
                <h3 id="evidence-title">Verified evidence</h3>
                <p>Recording evidence is an accountable claim; this demo does not run a test for you.</p>
              </div>
            </div>
            {staleEvidenceCount ? <small>{staleEvidenceCount} stale record{staleEvidenceCount === 1 ? '' : 's'}</small> : null}
          </header>

          <div className="website-evidence-status">
            {evidenceRequirements.map((requirement) => {
              const evidence = workspace.evidence.find((entry) => (
                entry.kind === requirement.id && entry.fingerprint === fingerprint
              ))
              return (
                <article className={evidence ? 'is-current' : ''} key={requirement.id}>
                  <span>{evidence ? 'verified' : 'required'}</span>
                  <strong>{requirement.label}</strong>
                  {evidence ? (
                    <>
                      <p>{evidence.finding}</p>
                      <small>{evidence.reference} · {evidence.verifiedBy} · {formatTimestamp(evidence.verifiedAt)}</small>
                    </>
                  ) : (
                    <p>{requirement.detail}</p>
                  )}
                </article>
              )
            })}
          </div>

          <form className="website-evidence-form" onSubmit={submitEvidence}>
            <label>
              <span>Requirement</span>
              <select value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value as EvidenceKind)}>
                {evidenceRequirements.map((requirement) => (
                  <option key={requirement.id} value={requirement.id}>{requirement.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Finding</span>
              <input
                maxLength={180}
                onChange={(event) => setEvidenceFinding(event.target.value)}
                placeholder="What the review established"
                required
                value={evidenceFinding}
              />
            </label>
            <label>
              <span>Source or reference</span>
              <input
                maxLength={220}
                onChange={(event) => setEvidenceReference(event.target.value)}
                placeholder="File, test result, URL, or review record"
                required
                value={evidenceReference}
              />
            </label>
            <label>
              <span>Verified by</span>
              <input
                maxLength={80}
                onChange={(event) => setEvidenceVerifier(event.target.value)}
                placeholder="Accountable person or role"
                required
                value={evidenceVerifier}
              />
            </label>
            <button className="website-button is-secondary" type="submit">Record evidence</button>
          </form>
        </section>

        <section className="website-publish-section" aria-labelledby="approval-title">
          <header>
            <div>
              <span className="website-step">03</span>
              <div>
                <h3 id="approval-title">Human approval</h3>
                <p>Approval applies only to the exact fingerprint shown above.</p>
              </div>
            </div>
            <span className={'website-status ' + (approvalIsCurrent ? 'is-ready' : 'is-pending')}>
              {approvalIsCurrent ? 'approved' : workspace.approval ? 'stale' : 'required'}
            </span>
          </header>

          {workspace.approval ? (
            <div className={'website-approval-record ' + (approvalIsCurrent ? 'is-current' : 'is-stale')}>
              <strong>{approvalIsCurrent ? 'Current approval' : 'Superseded by workspace changes'}</strong>
              <p>{workspace.approval.note}</p>
              <small>{workspace.approval.reviewer} · {formatTimestamp(workspace.approval.approvedAt)} · {workspace.approval.fingerprint}</small>
            </div>
          ) : null}

          <form className="website-approval-form" onSubmit={submitApproval}>
            <div className="website-form-grid two-columns">
              <label>
                <span>Human reviewer</span>
                <input
                  disabled={!allChecksPass}
                  maxLength={80}
                  onChange={(event) => setReviewer(event.target.value)}
                  placeholder="Name or accountable role"
                  required
                  value={reviewer}
                />
              </label>
              <label>
                <span>Decision note</span>
                <input
                  disabled={!allChecksPass}
                  maxLength={240}
                  onChange={(event) => setApprovalNote(event.target.value)}
                  placeholder="Why this revision is approved"
                  required
                  value={approvalNote}
                />
              </label>
            </div>
            <label className="website-confirmation">
              <input
                checked={approvalConfirmed}
                disabled={!allChecksPass}
                onChange={(event) => setApprovalConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>I reviewed this exact local revision and accept the recorded evidence.</span>
            </label>
            <div className="website-gate-actions">
              <small>{allChecksPass ? 'Ready for a named human decision.' : 'Complete all readiness checks to unlock approval.'}</small>
              <button
                className="website-button is-primary"
                disabled={!allChecksPass || !approvalConfirmed}
                type="submit"
              >
                Record approval
              </button>
            </div>
          </form>
        </section>

        <section className="website-publish-section website-local-publish" aria-labelledby="local-publish-title">
          <header>
            <div>
              <span className="website-step">04</span>
              <div>
                <h3 id="local-publish-title">Local publish record</h3>
                <p>No deployment target, domain write, or external connection exists in this prototype.</p>
              </div>
            </div>
            <span className={'website-status ' + (publishIsCurrent ? 'is-ready' : 'is-local')}>
              {publishIsCurrent ? 'recorded' : 'local only'}
            </span>
          </header>

          <div className="website-local-publish-action">
            <div>
              <strong>{approvalIsCurrent ? 'Approval matches the current revision.' : 'A current approval is required.'}</strong>
              <p>The action saves a bounded browser-local snapshot. It does not publish a website.</p>
            </div>
            <button
              className="website-button is-primary"
              disabled={!approvalIsCurrent || publishIsCurrent}
              onClick={onRecordPublish}
              type="button"
            >
              {publishIsCurrent ? 'Current revision recorded' : 'Record local publish'}
            </button>
          </div>

          {workspace.localPublishes.length ? (
            <div className="website-publish-history">
              {workspace.localPublishes.slice(0, 3).map((record) => (
                <article key={record.id}>
                  <span aria-hidden="true">&gt;_</span>
                  <div>
                    <strong>{record.id}</strong>
                    <small>{record.readyPageIds.length} ready page{record.readyPageIds.length === 1 ? '' : 's'} · {record.recordedBy} · {formatTimestamp(record.recordedAt)}</small>
                  </div>
                  <code>{record.fingerprint}</code>
                </article>
              ))}
            </div>
          ) : (
            <div className="website-empty compact">
              <span aria-hidden="true">&gt;_</span>
              <p>No local publish records yet.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
