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

type CommerceHandoffInput = {
  sku: string
  quantity: number
}

type PublishWorkspaceProps = {
  approvalIsCurrent: boolean
  checks: ReadinessCheck[]
  fingerprint: string
  handoffAvailable: boolean
  handoffIsCurrent: boolean
  managedActorId: string
  publishIsCurrent: boolean
  workspace: WebsiteWorkspace
  onAddEvidence: (input: EvidenceInput) => Promise<boolean>
  onApprove: (input: ApprovalInput) => Promise<boolean>
  onPrepareCommerceHandoff: (input: CommerceHandoffInput) => Promise<void>
  onRecordPublish: () => Promise<void>
}

export function PublishWorkspace({
  approvalIsCurrent,
  checks,
  fingerprint,
  handoffAvailable,
  handoffIsCurrent,
  managedActorId,
  publishIsCurrent,
  workspace,
  onAddEvidence,
  onApprove,
  onPrepareCommerceHandoff,
  onRecordPublish,
}: PublishWorkspaceProps) {
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('content')
  const [evidenceFinding, setEvidenceFinding] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [evidenceVerifier, setEvidenceVerifier] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [approvalConfirmed, setApprovalConfirmed] = useState(false)
  const [handoffSku, setHandoffSku] = useState('')
  const [handoffQuantity, setHandoffQuantity] = useState(1)
  const [submitting, setSubmitting] = useState<'evidence' | 'approval' | 'snapshot' | 'handoff' | ''>('')
  const passedCount = checks.filter((check) => check.passed).length
  const allChecksPass = passedCount === checks.length
  const latestApproval = workspace.approvals[0]
  const staleEvidenceCount = workspace.evidence.filter((entry) => (
    entry.fingerprint !== fingerprint || entry.source.contentRevision !== workspace.contentRevision
  )).length

  async function prepareCommerceHandoff() {
    const sku = handoffSku.trim().toUpperCase()
    if (!sku || !Number.isSafeInteger(handoffQuantity) || handoffQuantity < 1 || handoffQuantity > 99) return
    setSubmitting('handoff')
    try {
      await onPrepareCommerceHandoff({ sku, quantity: handoffQuantity })
    } finally {
      setSubmitting('')
    }
  }

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting('evidence')
    const saved = await onAddEvidence({
      kind: evidenceKind,
      finding: evidenceFinding.trim(),
      reference: evidenceReference.trim(),
      verifiedBy: managedActorId || evidenceVerifier.trim(),
    })
    setSubmitting('')
    if (saved) {
      setEvidenceFinding('')
      setEvidenceReference('')
    }
  }

  async function submitApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!allChecksPass || !approvalConfirmed) return
    setSubmitting('approval')
    const saved = await onApprove({ reviewer: managedActorId || reviewer.trim(), note: approvalNote.trim() })
    setSubmitting('')
    if (saved) setApprovalConfirmed(false)
  }

  async function recordSnapshot() {
    setSubmitting('snapshot')
    await onRecordPublish()
    setSubmitting('')
  }

  return (
    <section className="website-editor-panel website-publish-panel" aria-labelledby="publish-editor-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Publish control</span>
          <h2 id="publish-editor-title">Readiness and approval</h2>
          <p>Checks use only the current workspace revision.</p>
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
                <p>Recording evidence is an accountable claim. Managed mode binds it to the signed-in actor.</p>
              </div>
            </div>
            {staleEvidenceCount ? <small>{staleEvidenceCount} stale record{staleEvidenceCount === 1 ? '' : 's'}</small> : null}
          </header>

          <div className="website-evidence-status">
            {evidenceRequirements.map((requirement) => {
              const evidence = workspace.evidence.find((entry) => (
                entry.kind === requirement.id
                && entry.fingerprint === fingerprint
                && entry.source.contentRevision === workspace.contentRevision
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
              <span>{managedActorId ? 'Signed-in actor' : 'Verified by'}</span>
              <input
                disabled={Boolean(managedActorId)}
                maxLength={80}
                onChange={(event) => setEvidenceVerifier(event.target.value)}
                placeholder={managedActorId ? 'Authenticated identity' : 'Accountable person or role'}
                required
                value={managedActorId || evidenceVerifier}
              />
            </label>
            <button className="website-button is-secondary" disabled={Boolean(submitting)} type="submit">
              {submitting === 'evidence' ? 'Saving…' : 'Record evidence'}
            </button>
          </form>
        </section>

        <section className="website-publish-section" aria-labelledby="approval-title">
          <header>
            <div>
              <span className="website-step">03</span>
              <div>
                <h3 id="approval-title">Human approval</h3>
                <p>Approval applies only to the exact fingerprint; managed mode binds the signed-in actor.</p>
              </div>
            </div>
            <span className={'website-status ' + (approvalIsCurrent ? 'is-ready' : 'is-pending')}>
              {approvalIsCurrent ? 'approved' : latestApproval ? 'stale' : 'required'}
            </span>
          </header>

          {latestApproval ? (
            <div className={'website-approval-record ' + (approvalIsCurrent ? 'is-current' : 'is-stale')}>
              <strong>{approvalIsCurrent ? 'Current approval' : latestApproval.migratedFromV1 ? 'Historical v1 approval' : 'Superseded by workspace changes'}</strong>
              <p>{latestApproval.note}</p>
              <small>{latestApproval.reviewer} · {formatTimestamp(latestApproval.approvedAt)} · content r{latestApproval.source.contentRevision}</small>
            </div>
          ) : null}

          <form className="website-approval-form" onSubmit={submitApproval}>
            <div className="website-form-grid two-columns">
              <label>
                <span>Human reviewer</span>
                <input
                  disabled={Boolean(managedActorId) || !allChecksPass || approvalIsCurrent}
                  maxLength={80}
                  onChange={(event) => setReviewer(event.target.value)}
                  placeholder={managedActorId ? 'Authenticated identity' : 'Name or accountable role'}
                  required
                  value={managedActorId || reviewer}
                />
              </label>
              <label>
                <span>Decision note</span>
                <input
                  disabled={!allChecksPass || approvalIsCurrent}
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
                disabled={!allChecksPass || approvalIsCurrent}
                onChange={(event) => setApprovalConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>I reviewed this exact content revision and accept the recorded evidence.</span>
            </label>
            <div className="website-gate-actions">
              <small>{approvalIsCurrent
                ? 'This exact evidence set already has a current human approval.'
                : allChecksPass ? 'Ready for a named human decision.' : 'Complete all readiness checks to unlock approval.'}</small>
              <button
                className="website-button is-primary"
                disabled={!allChecksPass || !approvalConfirmed || approvalIsCurrent || Boolean(submitting)}
                type="submit"
              >
                {approvalIsCurrent ? 'Current revision approved' : submitting === 'approval' ? 'Saving…' : 'Record approval'}
              </button>
            </div>
          </form>
        </section>

        <section className="website-publish-section website-local-publish" aria-labelledby="local-publish-title">
          <header>
            <div>
              <span className="website-step">04</span>
              <div>
                <h3 id="local-publish-title">Approved snapshot</h3>
                <p>No deployment target, domain write, or external connection exists in this prototype.</p>
              </div>
            </div>
            <span className={'website-status ' + (publishIsCurrent ? 'is-ready' : 'is-local')}>
              {publishIsCurrent ? 'recorded' : 'not recorded'}
            </span>
          </header>

          <div className="website-local-publish-action">
            <div>
              <strong>{approvalIsCurrent ? 'Approval matches the current revision.' : 'A current approval is required.'}</strong>
              <p>The action saves an evidence-bound approved snapshot. It does not publish a website.</p>
            </div>
            <button
              className="website-button is-primary"
              disabled={!approvalIsCurrent || publishIsCurrent || Boolean(submitting)}
              onClick={recordSnapshot}
              type="button"
            >
              {publishIsCurrent ? 'Current revision recorded' : submitting === 'snapshot' ? 'Saving…' : 'Record approved snapshot'}
            </button>
          </div>

          <div className="website-handoff-action">
            <div>
              <strong>Website → Commerce intake</strong>
              <p>Send one catalog SKU and quantity from this approved revision into Commerce. No stock, payment, customer message, or order changes until a human confirms it there.</p>
            </div>
            <div className="website-handoff-controls">
              <label>Commerce SKU<input autoComplete="off" maxLength={80} onChange={(event) => setHandoffSku(event.target.value.toUpperCase())} placeholder="SKU-001" value={handoffSku} /></label>
              <label>Qty<input max="99" min="1" onChange={(event) => setHandoffQuantity(Number(event.target.value))} step="1" type="number" value={handoffQuantity} /></label>
              <button
                className="website-button is-secondary"
                disabled={!publishIsCurrent || !handoffAvailable || handoffIsCurrent || !handoffSku.trim() || Boolean(submitting)}
                onClick={() => void prepareCommerceHandoff()}
                type="button"
              >
                {handoffIsCurrent ? 'Intake sent' : submitting === 'handoff' ? 'Sending…' : 'Send intake'}
              </button>
              {handoffIsCurrent ? <a className="website-button is-primary" href="/operations/commerce/?tab=orders">Review in Commerce</a> : null}
            </div>
          </div>

          {workspace.localPublishes.length ? (
            <div className="website-publish-history">
              <small>Showing {Math.min(3, workspace.localPublishes.length)} of {workspace.localPublishes.length} retained snapshots</small>
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
              <p>No approved snapshots yet.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
