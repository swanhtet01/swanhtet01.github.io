import { useEffect, useMemo, useRef, useState } from 'react'

import {
  managedContextProductLabel,
  type ManagedContextProfile,
  type ManagedContextProfileRequest,
} from './managed-context'
import {
  ManagedTrialError,
  retainManagedContextProfile,
  validateManagedContextProfile,
  type ManagedIdentity,
} from './managed-trial'


type Props = {
  contextPackage: ManagedContextProfileRequest | null
  identity: ManagedIdentity | null
  onRetained?: (profile: ManagedContextProfile) => void
}

function commandId() {
  const id = globalThis.crypto?.randomUUID?.()
  if (!id) throw new ManagedTrialError('Secure managed context confirmation is unavailable in this browser.', {
    code: 'managed_context_command_unavailable',
  })
  return id
}

function managedContextError(error: unknown) {
  if (error instanceof ManagedTrialError && (error.code === 'trial_version_conflict' || error.code === 'managed_context_validation_changed')) {
    return 'The company changed. Review this summary and confirm it again.'
  }
  return error instanceof Error ? error.message : 'Managed context could not be retained.'
}

export function ManagedContextConsent({ contextPackage, identity, onRetained }: Props) {
  const [approvedKey, setApprovedKey] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [noticeState, setNoticeState] = useState({ key: '', text: '' })
  const [retainedState, setRetainedState] = useState<{ key: string; profile: ManagedContextProfile } | null>(null)
  const commandRef = useRef('')
  const requestRef = useRef(0)
  const contextKey = useMemo(() => JSON.stringify([
    identity?.workspaceId ?? '',
    identity?.userId ?? '',
    contextPackage,
  ]), [contextPackage, identity])
  const approved = approvedKey === contextKey
  const busy = busyKey === contextKey
  const notice = noticeState.key === contextKey ? noticeState.text : ''
  const retained = retainedState?.key === contextKey ? retainedState.profile : null

  useEffect(() => {
    requestRef.current += 1
    commandRef.current = ''
    return () => { requestRef.current += 1 }
  }, [contextKey])

  if (!identity || !contextPackage) return null

  async function keepContext() {
    if (!approved || busy || !identity || !contextPackage) return
    const submittedIdentity = identity
    const submittedPackage = contextPackage
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    commandRef.current ||= commandId()
    setBusyKey(contextKey)
    setNoticeState({ key: contextKey, text: 'Checking the exact company revision...' })
    try {
      const checked = await validateManagedContextProfile(submittedPackage, submittedIdentity)
      if (requestRef.current !== requestId) return
      const result = await retainManagedContextProfile({
        commandId: commandRef.current,
        contextPackage: submittedPackage,
        identity: submittedIdentity,
        validation: checked.validation,
      })
      if (requestRef.current !== requestId) return
      setRetainedState({ key: contextKey, profile: result.profile })
      setNoticeState({ key: contextKey, text: 'Managed context retained. Future briefs can use this preference after operational risk is ranked.' })
      onRetained?.(result.profile)
    } catch (error) {
      if (requestRef.current !== requestId) return
      if (error instanceof ManagedTrialError && (error.code === 'trial_version_conflict' || error.code === 'managed_context_validation_changed')) {
        commandRef.current = ''
      }
      setApprovedKey('')
      setRetainedState(null)
      setNoticeState({ key: contextKey, text: managedContextError(error) })
    } finally {
      if (requestRef.current === requestId) setBusyKey('')
    }
  }

  const sourceCounts = contextPackage.sourceCounts
  const preference = managedContextProductLabel(contextPackage.behaviorPreference.product)
  return (
    <div aria-label="Managed context consent" className="managed-context-consent">
      <div>
        <span className="core-eyebrow">Managed memory</span>
        <h3>Remember how this owner works.</h3>
        <p>Keep only source counts, reviewed decision counts, and a product preference. Raw records and browser text stay out.</p>
      </div>
      <div className="premium-pilot-rows">
        <span><small>Prepared sources</small><strong>{sourceCounts.selectedProductRecords}</strong><em>Count only</em></span>
        <span><small>Behavior signals</small><strong>{sourceCounts.behaviorSignals}</strong><em>{preference} preferred</em></span>
        <span><small>Human decisions</small><strong>{sourceCounts.reviewedDecisions}</strong><em>Approved or declined</em></span>
        <span><small>Boundary</small><strong>Recommendations only</strong><em>No sends, payments, stock, production, publishing, CRM, or training</em></span>
      </div>
      {retained ? (
        <div className="managed-context-kept" role="status">
          <strong>Managed context retained</strong>
          <span>{preference} preference / {retained.profileDigest.slice(0, 19)}...</span>
        </div>
      ) : (
        <>
          <label className="managed-context-approval">
            <input checked={approved} onChange={(event) => setApprovedKey(event.target.checked ? contextKey : '')} type="checkbox" />
            <span>I approve these summarized source counts, owner behavior pattern, and reviewed decision counts for managed AI recommendations.</span>
          </label>
          <button className="core-button primary" disabled={!approved || busy} onClick={() => void keepContext()} type="button">
            {busy ? 'Checking...' : 'Keep managed context'}
          </button>
        </>
      )}
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}
    </div>
  )
}
