import { type FormEvent, useEffect, useId, useRef, useState } from 'react'

import type { ApprovalDetails, ProposedAction } from './ecommerce-model'

type ApprovalGateProps = {
  action: ProposedAction
  guidedDemo: boolean
  onApprove: (details: ApprovalDetails) => void
  onCancel: () => void
}

export function ApprovalGate({ action, guidedDemo, onApprove, onCancel }: ApprovalGateProps) {
  const [actor, setActor] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const titleId = useId()
  const boundaryId = useId()
  const actorRef = useRef<HTMLInputElement>(null)
  const canApprove = Boolean(actor.trim() && reason.trim() && evidenceReference.trim())

  useEffect(() => {
    actorRef.current?.focus()

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [action.id, onCancel])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canApprove) return
    onApprove({
      actor: actor.trim(),
      reason: reason.trim(),
      evidenceReference: evidenceReference.trim(),
    })
  }

  function fillGuidedFields() {
    setActor('Demo operator')
    setReason('Reviewed the guided local scenario and proposed state change.')
    setEvidenceReference(`DEMO-EVIDENCE-${action.subjectId}`)
  }

  return (
    <div className="eco-modal-backdrop">
      <section
        aria-describedby={boundaryId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="eco-approval-dialog"
        role="dialog"
      >
        <header className="eco-dialog-head">
          <div>
            <span className="eco-eyebrow">Human approval required</span>
            <h2 id={titleId}>{action.title}</h2>
          </div>
          <button aria-label="Cancel approval" className="eco-icon-button" onClick={onCancel} type="button">×</button>
        </header>

        <div className="eco-change-preview" aria-label="Proposed record change">
          <span><small>Before</small><strong>{action.before}</strong></span>
          <i aria-hidden="true">→</i>
          <span><small>After approval</small><strong>{action.after}</strong></span>
        </div>

        <p className="eco-boundary-note" id={boundaryId}>{action.consequence}</p>

        <form className="eco-approval-form" onSubmit={submit}>
          <label>
            Responsible operator
            <input
              autoComplete="off"
              maxLength={80}
              onChange={(event) => setActor(event.target.value)}
              placeholder="Name or accountable role"
              ref={actorRef}
              required
              value={actor}
            />
          </label>
          <label>
            Reason for this change
            <textarea
              maxLength={220}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this state is correct now"
              required
              rows={2}
              value={reason}
            />
          </label>
          <label>
            Evidence reference
            <input
              autoComplete="off"
              maxLength={180}
              onChange={(event) => setEvidenceReference(event.target.value)}
              placeholder={action.evidencePrompt}
              required
              value={evidenceReference}
            />
          </label>

          <p className="eco-local-warning"><strong>Local prototype:</strong> approval records a browser-memory change only. No payment, message, refund, delivery, or inventory integration is connected.</p>

          <div className="eco-dialog-actions">
            {guidedDemo ? <button className="eco-button eco-button-quiet" onClick={fillGuidedFields} type="button">Fill demo fields</button> : null}
            <span />
            <button className="eco-button eco-button-quiet" onClick={onCancel} type="button">Cancel</button>
            <button className="eco-button eco-button-primary" disabled={!canApprove} type="submit">Approve local change</button>
          </div>
        </form>
      </section>
    </div>
  )
}
