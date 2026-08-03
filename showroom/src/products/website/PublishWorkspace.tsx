import { lazy, Suspense, type FormEvent, useRef, useState } from 'react'

import {
  evidenceRequirements,
  formatTimestamp,
  type EvidenceKind,
  type ReadinessCheck,
  type WebsiteWorkspace,
} from './website-model'
import type { WebsiteReleaseState } from './website-release-foundation'
import './publish-workspace.css'

const WebsiteReleaseFoundation = lazy(() => import('./WebsiteReleaseFoundation'))

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
  managedActorId: string
  managedReleaseRecords?: WebsiteReleaseState[]
  currentPublishId: string
  publishIsCurrent: boolean
  workspace: WebsiteWorkspace
  onAddEvidence: (input: EvidenceInput) => Promise<boolean>
  onApprove: (input: ApprovalInput) => Promise<boolean>
  onDownloadPublish: (recordId: string) => void
  onRecordPublish: () => Promise<void>
  onSaveManagedRelease?: (state: WebsiteReleaseState) => Promise<{ ok: true } | { ok: false; error: string }>
}

type PublishStep = 'checks' | 'evidence' | 'approval' | 'snapshot'

const publishSteps: Array<{ id: PublishStep; label: string }> = [
  { id: 'checks', label: 'Checks' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'approval', label: 'Review' },
  { id: 'snapshot', label: 'Site file' },
]

function localEvidenceSuggestion(kind: EvidenceKind, workspace: WebsiteWorkspace) {
  const revision = workspace.contentRevision
  if (kind === 'responsive') return {
    finding: `Desktop, tablet, and mobile previews reviewed for ${workspace.siteName}.`,
    reference: `Website responsive preview r${revision}`,
  }
  if (kind === 'links') return {
    finding: `Navigation and call-to-action destinations reviewed for ${workspace.siteName}.`,
    reference: `Website destination check r${revision}`,
  }
  return {
    finding: `Ready-page copy and contact details reviewed for ${workspace.siteName}.`,
    reference: `Website content r${revision}`,
  }
}

export function PublishWorkspace({
  approvalIsCurrent,
  checks,
  fingerprint,
  managedActorId,
  managedReleaseRecords,
  currentPublishId,
  publishIsCurrent,
  workspace,
  onAddEvidence,
  onApprove,
  onDownloadPublish,
  onRecordPublish,
  onSaveManagedRelease,
}: PublishWorkspaceProps) {
  const firstMissingEvidenceKind = evidenceRequirements.find((requirement) => !workspace.evidence.some((entry) => (
    entry.kind === requirement.id
    && entry.fingerprint === fingerprint
    && entry.source.contentRevision === workspace.contentRevision
  )))?.id ?? 'content'
  const firstEvidenceSuggestion = localEvidenceSuggestion(firstMissingEvidenceKind, workspace)
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>(firstMissingEvidenceKind)
  const [evidenceFinding, setEvidenceFinding] = useState(managedActorId ? '' : firstEvidenceSuggestion.finding)
  const [evidenceReference, setEvidenceReference] = useState(managedActorId ? '' : firstEvidenceSuggestion.reference)
  const [evidenceVerifier, setEvidenceVerifier] = useState(managedActorId ? '' : 'Website owner')
  const [reviewer, setReviewer] = useState(managedActorId ? '' : 'Website owner')
  const [approvalNote, setApprovalNote] = useState(managedActorId ? '' : `Content, responsive preview, and destinations reviewed for ${workspace.siteName}.`)
  const [approvalConfirmed, setApprovalConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState<'evidence' | 'approval' | 'snapshot' | ''>('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const passedCount = checks.filter((check) => check.passed).length
  const allChecksPass = passedCount === checks.length
  const latestApproval = workspace.approvals[0]
  const staleEvidenceCount = workspace.evidence.filter((entry) => (
    entry.fingerprint !== fingerprint || entry.source.contentRevision !== workspace.contentRevision
  )).length
  const currentEvidenceByKind = new Map(
    evidenceRequirements.map((requirement) => [
      requirement.id,
      workspace.evidence.find((entry) => (
        entry.kind === requirement.id
        && entry.fingerprint === fingerprint
        && entry.source.contentRevision === workspace.contentRevision
      )),
    ]),
  )
  const currentEvidenceCount = [...currentEvidenceByKind.values()].filter(Boolean).length
  const contentChecks = checks.filter((check) => !check.id.startsWith('evidence-'))
  const passedContentCheckCount = contentChecks.filter((check) => check.passed).length
  const contentChecksPass = passedContentCheckCount === contentChecks.length
  const evidenceIsCurrent = currentEvidenceCount === evidenceRequirements.length
  const initialStep: PublishStep = !contentChecksPass
    ? 'checks'
    : !evidenceIsCurrent
      ? 'evidence'
      : !approvalIsCurrent
        ? 'approval'
        : 'snapshot'
  const [activeStep, setActiveStep] = useState<PublishStep>(initialStep)
  const workflowStatus = publishIsCurrent
    ? 'Site file ready'
    : approvalIsCurrent
      ? 'Ready to record'
      : evidenceIsCurrent && contentChecksPass
        ? 'Needs review'
        : contentChecksPass
          ? 'Needs evidence'
          : 'Needs fixes'
  const stepStatus: Record<PublishStep, string> = {
    checks: `${passedContentCheckCount}/${contentChecks.length}`,
    evidence: `${currentEvidenceCount}/${evidenceRequirements.length}`,
    approval: approvalIsCurrent ? 'Approved' : 'Required',
    snapshot: publishIsCurrent ? 'Ready' : 'Not ready',
  }

  function chooseEvidenceKind(kind: EvidenceKind) {
    setEvidenceKind(kind)
    const suggestion = localEvidenceSuggestion(kind, workspace)
    setEvidenceFinding(managedActorId ? '' : suggestion.finding)
    setEvidenceReference(managedActorId ? '' : suggestion.reference)
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
      const nextRequirement = evidenceRequirements.find((requirement) => (
        requirement.id !== evidenceKind && !currentEvidenceByKind.get(requirement.id)
      ))
      if (nextRequirement) chooseEvidenceKind(nextRequirement.id)
      else {
        setEvidenceFinding('')
        setEvidenceReference('')
        setActiveStep('approval')
      }
    }
  }

  async function submitApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!allChecksPass || !approvalConfirmed) return
    setSubmitting('approval')
    const saved = await onApprove({ reviewer: managedActorId || reviewer.trim(), note: approvalNote.trim() })
    setSubmitting('')
    if (saved) {
      setApprovalConfirmed(false)
      setActiveStep('snapshot')
    }
  }

  async function recordSnapshot() {
    setSubmitting('snapshot')
    await onRecordPublish()
    setSubmitting('')
  }

  function selectStep(step: PublishStep) {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    setActiveStep(step)
  }

  return (
    <section
      className="website-editor-panel website-publish-panel website-publish-workspace"
      aria-labelledby="publish-editor-title"
    >
      <header className="website-panel-head publish-flow-header">
        <div>
          <span className="website-eyebrow">Website file checklist</span>
          <h2 id="publish-editor-title">Check and download the site</h2>
          <p>Fix the pages, add review notes, then create one website file.</p>
        </div>
        <span className={'website-status ' + (publishIsCurrent ? 'is-ready' : 'is-pending')}>
          {workflowStatus}
        </span>
      </header>

      <nav className="publish-flow-nav" aria-label="Publish steps">
        <ol>
          {publishSteps.map((step, index) => (
            <li key={step.id}>
              <button
                aria-current={activeStep === step.id ? 'step' : undefined}
                onClick={() => selectStep(step.id)}
                type="button"
              >
                <span className="publish-flow-step-number" aria-hidden="true">{index + 1}</span>
                <span className="publish-flow-step-label">
                  <strong>{step.label}</strong>
                  <small>{stepStatus[step.id]}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="publish-flow-boundary" role="note">
        <strong>{managedActorId ? 'Company account record' : 'This device only'}</strong>
        <span>{managedActorId
          ? 'Saved in the company history. No deployment, domain, payment, stock, message, or order change happens here.'
          : 'Stored in this browser. No deployment, domain, payment, stock, message, or order change happens here.'}</span>
      </div>

      <div className="website-editor-scroll publish-flow-body" ref={bodyRef}>
        {activeStep === 'checks' ? (
          <section
            className="website-publish-section publish-flow-card"
            id="publish-step-checks"
            aria-labelledby="readiness-title"
          >
            <header>
              <div>
                <span className="website-step" aria-hidden="true">1</span>
                <div>
                  <h3 id="readiness-title">Check the website</h3>
                  <p>These checks come from the current content and navigation.</p>
                </div>
              </div>
              <span className={'website-status ' + (contentChecksPass ? 'is-ready' : 'is-pending')}>
                {passedContentCheckCount}/{contentChecks.length} passed
              </span>
            </header>

            <div className="publish-flow-revision">
              <span>Current revision</span>
              <code>{fingerprint}</code>
            </div>

            <div className="website-check-list">
              {contentChecks.map((check) => (
                <article className={check.passed ? 'is-passed' : 'is-blocked'} key={check.id}>
                  <span className="publish-flow-check-state">{check.passed ? 'Pass' : 'Fix'}</span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                </article>
              ))}
            </div>

            <footer className="publish-flow-actions">
              <p>{contentChecksPass
                ? 'Website checks are clear. Add the three review records next.'
                : 'Fix blocked items in Content or Navigation, then return here.'}</p>
              <button className="website-button is-primary" onClick={() => selectStep('evidence')} type="button">
                Review evidence
              </button>
            </footer>
          </section>
        ) : null}

        {activeStep === 'evidence' ? (
          <section
            className="website-publish-section publish-flow-card"
            id="publish-step-evidence"
            aria-labelledby="evidence-title"
          >
            <header>
              <div>
                <span className="website-step" aria-hidden="true">2</span>
                <div>
                  <h3 id="evidence-title">Add review notes</h3>
                  <p>Save proof for this exact version of the website.</p>
                </div>
              </div>
              <span className={'website-status ' + (evidenceIsCurrent ? 'is-ready' : 'is-pending')}>
                {currentEvidenceCount}/{evidenceRequirements.length} current
              </span>
            </header>

            {staleEvidenceCount ? (
              <p className="publish-flow-stale-note">
                {staleEvidenceCount} older record{staleEvidenceCount === 1 ? '' : 's'} remain in history but do not approve this revision.
              </p>
            ) : null}

            <div className="website-evidence-status">
              {evidenceRequirements.map((requirement) => {
                const evidence = currentEvidenceByKind.get(requirement.id)
                return (
                  <article className={evidence ? 'is-current' : ''} key={requirement.id}>
                    <span>{evidence ? 'Verified' : 'Required'}</span>
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
                <select value={evidenceKind} onChange={(event) => chooseEvidenceKind(event.target.value as EvidenceKind)}>
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
                <span>{managedActorId ? 'Signed in as' : 'Checked by'}</span>
                <input
                  disabled={Boolean(managedActorId)}
                  maxLength={80}
                  onChange={(event) => setEvidenceVerifier(event.target.value)}
                  placeholder={managedActorId ? 'Signed-in account' : 'Name or role'}
                  required
                  value={managedActorId || evidenceVerifier}
                />
              </label>
              <button className="website-button is-secondary" disabled={Boolean(submitting)} type="submit">
                {submitting === 'evidence' ? 'Saving…' : 'Save review note'}
              </button>
            </form>

            <footer className="publish-flow-actions">
              <button className="website-button is-secondary" onClick={() => selectStep('checks')} type="button">
                Back to checks
              </button>
              <button className="website-button is-primary" onClick={() => selectStep('approval')} type="button">
                Final review
              </button>
            </footer>
          </section>
        ) : null}

        {activeStep === 'approval' ? (
          <section
            className="website-publish-section publish-flow-card"
            id="publish-step-approval"
            aria-labelledby="approval-title"
          >
            <header>
              <div>
                <span className="website-step" aria-hidden="true">3</span>
                <div>
                  <h3 id="approval-title">Final review</h3>
                  <p>This confirms the current pages and review notes.</p>
                </div>
              </div>
              <span className={'website-status ' + (approvalIsCurrent ? 'is-ready' : 'is-pending')}>
                {approvalIsCurrent ? 'Approved' : latestApproval ? 'Stale' : 'Required'}
              </span>
            </header>

            {!allChecksPass ? (
              <div className="publish-flow-gate-note" role="status">
                <strong>Review is locked</strong>
                <p>{passedCount}/{checks.length} readiness checks pass. Complete the blocked website checks and evidence first.</p>
              </div>
            ) : null}

            {latestApproval ? (
              <div className={'website-approval-record ' + (approvalIsCurrent ? 'is-current' : 'is-stale')}>
                <strong>{approvalIsCurrent ? 'Current review' : latestApproval.migratedFromV1 ? 'Historical review' : 'Superseded by workspace changes'}</strong>
                <p>{latestApproval.note}</p>
                <small>{latestApproval.reviewer} · {formatTimestamp(latestApproval.approvedAt)} · content r{latestApproval.source.contentRevision}</small>
              </div>
            ) : null}

            <form className="website-approval-form" onSubmit={submitApproval}>
              <div className="website-form-grid two-columns">
                <label>
                  <span>Reviewer</span>
                  <input
                    disabled={Boolean(managedActorId) || !allChecksPass || approvalIsCurrent}
                    maxLength={80}
                    onChange={(event) => setReviewer(event.target.value)}
                    placeholder={managedActorId ? 'Signed-in account' : 'Name or role'}
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
                <span>I reviewed this exact website version and accept the saved notes.</span>
              </label>
              <div className="website-gate-actions">
                <small>{approvalIsCurrent
                  ? 'This exact website version is already reviewed.'
                  : allChecksPass ? 'Ready for a named reviewer.' : 'Complete all checks before final review.'}</small>
                <button
                  className="website-button is-primary"
                  disabled={!allChecksPass || !approvalConfirmed || approvalIsCurrent || Boolean(submitting)}
                  type="submit"
                >
                  {approvalIsCurrent ? 'Website reviewed' : submitting === 'approval' ? 'Saving…' : 'Save final review'}
                </button>
              </div>
            </form>

            <footer className="publish-flow-actions">
              <button className="website-button is-secondary" onClick={() => selectStep('evidence')} type="button">
                Back to evidence
              </button>
              <button className="website-button is-primary" onClick={() => selectStep('snapshot')} type="button">
                Create site file
              </button>
            </footer>
          </section>
        ) : null}

        {activeStep === 'snapshot' ? (
          <section
            className="website-publish-section website-local-publish publish-flow-card"
            id="publish-step-snapshot"
            aria-labelledby="local-publish-title"
          >
            <header>
              <div>
                <span className="website-step" aria-hidden="true">4</span>
                <div>
                  <h3 id="local-publish-title">Save the approved site</h3>
                  <p>Create one portable site file. Deployment and domains remain separate.</p>
                </div>
              </div>
              <span className={'website-status ' + (publishIsCurrent ? 'is-ready' : 'is-local')}>
                {publishIsCurrent ? 'File ready' : 'Not ready'}
              </span>
            </header>

            <div className="website-local-publish-action">
              <div>
                <strong>{publishIsCurrent
                  ? 'The approved site is retained and ready to download.'
                  : approvalIsCurrent
                    ? 'Review matches. Create the site file.'
                    : 'A current review is required.'}</strong>
                <p>The file contains only ready pages and public site content. It does not deploy or change a domain.</p>
              </div>
              <div className="website-local-publish-controls">
                {!publishIsCurrent ? (
                  <button
                    className="website-button is-primary"
                    disabled={!approvalIsCurrent || Boolean(submitting)}
                    onClick={recordSnapshot}
                    type="button"
                  >
                    {submitting === 'snapshot' ? 'Creating…' : 'Create site file'}
                  </button>
                ) : null}
                <button
                  className="website-button is-primary"
                  disabled={!publishIsCurrent || !currentPublishId || Boolean(submitting)}
                  onClick={() => onDownloadPublish(currentPublishId)}
                  type="button"
                >
                  Download site
                </button>
              </div>
            </div>

            <Suspense fallback={<div className="website-release-loading">Loading client release controls...</div>}>
              <WebsiteReleaseFoundation
                managedActorId={managedActorId}
                managedRecords={managedReleaseRecords}
                onSaveManagedState={onSaveManagedRelease}
                publishIsCurrent={publishIsCurrent}
                workspace={workspace}
              />
            </Suspense>

            {workspace.localPublishes.length ? (
              <details className="website-publish-history-disclosure">
                <summary>Site file history ({workspace.localPublishes.length})</summary>
                <div className="website-publish-history">
                  {workspace.localPublishes.slice(0, 3).map((record) => (
                    <article key={record.id}>
                      <span aria-hidden="true">&gt;_</span>
                      <div>
                        <strong>{record.id}</strong>
                        <small>{record.readyPageIds.length} page{record.readyPageIds.length === 1 ? '' : 's'} · {record.recordedBy} · {formatTimestamp(record.recordedAt)}</small>
                      </div>
                      {record.artifact ? (
                        <button
                          className="website-button is-secondary is-compact website-history-download"
                          onClick={() => onDownloadPublish(record.id)}
                          type="button"
                        >
                          Download
                        </button>
                      ) : <code>File unavailable</code>}
                    </article>
                  ))}
                </div>
              </details>
            ) : (
              <div className="website-empty compact">
                <span aria-hidden="true">&gt;_</span>
                <p>No approved site files yet.</p>
              </div>
            )}

            <footer className="publish-flow-actions">
              <button className="website-button is-secondary" onClick={() => selectStep('approval')} type="button">
                Back to review
              </button>
            </footer>
          </section>
        ) : null}
      </div>
    </section>
  )
}
