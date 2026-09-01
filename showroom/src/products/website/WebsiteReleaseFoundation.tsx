import { useEffect, useMemo, useState } from 'react'

import {
  approveWebsiteReleasePackage,
  buildWebsiteDomainHandoff,
  buildWebsiteReleasePackage,
  createEmptyWebsiteReleaseState,
  loadWebsiteReleaseWorkspace,
  mutateWebsiteReleaseWorkspace,
  normalizeWebsiteDomainHostname,
  prepareWebsiteDeployPlan,
  prepareWebsiteReleasePackage,
  projectWebsiteRelease,
  validateWebsiteReleaseState,
  websiteReleaseEvidenceDigest,
  websiteReleaseTemplate,
  type WebsiteReleasePackage,
  type WebsiteReleaseProjection,
  type WebsiteReleaseState,
} from './website-release-foundation'
import { getCurrentApproval, getCurrentPublish, type WebsiteWorkspace } from './website-model'

type WebsiteReleaseFoundationProps = {
  managedActorId: string
  managedRecords?: WebsiteReleaseState[]
  onSaveManagedState?: (state: WebsiteReleaseState) => Promise<{ ok: true } | { ok: false; error: string }>
  publishIsCurrent: boolean
  workspace: WebsiteWorkspace
}

const emptyProjection = (scope: string): WebsiteReleaseProjection => projectWebsiteRelease(createEmptyWebsiteReleaseState(scope))

function actionProof(actor: string, reason: string, evidenceReference: string, capturedAt = new Date().toISOString()) {
  const suffix = `${Date.now().toString(36)}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? 'local'}`
  return {
    actionId: `website-release-${suffix}`,
    capturedAt,
    actor,
    reason,
    evidenceReference,
  }
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function roleActor(packageValue: WebsiteReleasePackage | null, role: 'release_manager' | 'release_reviewer') {
  return packageValue?.roles.find((entry) => entry.role === role)?.actor ?? ''
}

export default function WebsiteReleaseFoundation({ managedActorId, managedRecords, onSaveManagedState, publishIsCurrent, workspace }: WebsiteReleaseFoundationProps) {
  const currentPublish = getCurrentPublish(workspace)
  const currentApproval = getCurrentApproval(workspace)
  const artifactDigest = useMemo(
    () => currentPublish?.artifact ? websiteReleaseEvidenceDigest(currentPublish.artifact) : '',
    [currentPublish],
  )
  const scope = artifactDigest ? `website:${artifactDigest}` : ''
  const managed = managedRecords !== undefined
  const [state, setState] = useState<WebsiteReleaseState | null>(null)
  const [projection, setProjection] = useState<WebsiteReleaseProjection | null>(null)
  const [releaseManager, setReleaseManager] = useState(managedActorId || currentApproval?.reviewer || '')
  const [releaseReviewer, setReleaseReviewer] = useState(currentApproval?.reviewer || '')
  const [domainHostname, setDomainHostname] = useState('')
  const [includeMyanmarDraft, setIncludeMyanmarDraft] = useState(true)
  const [accent, setAccent] = useState('#087f5b')
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [busy, setBusy] = useState<'review' | 'plan' | ''>('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!scope) return
    const refresh = () => {
      try {
        if (managed) {
          const matches = managedRecords.filter((record) => record.scope === scope)
          if (matches.length > 1) throw new Error('Managed Website release history has a duplicate scope.')
          const nextState = matches.length ? validateWebsiteReleaseState(matches[0]) : createEmptyWebsiteReleaseState(scope)
          const nextProjection = projectWebsiteRelease(nextState)
          setState(nextState)
          setProjection(nextProjection)
          setMessage('')
          if (nextProjection.package) {
            setReleaseManager(roleActor(nextProjection.package, 'release_manager'))
            setReleaseReviewer(roleActor(nextProjection.package, 'release_reviewer'))
            setIncludeMyanmarDraft(nextProjection.draftLocales.includes('my'))
            setAccent(nextProjection.package.brand.palette.accent)
          }
          return
        }
        const snapshot = loadWebsiteReleaseWorkspace(localStorage, scope)
        if (snapshot.source === 'recovery') {
          setState(null)
          setProjection(null)
          setMessage(`Release history was preserved but needs recovery: ${snapshot.error}`)
          return
        }
        const nextProjection = projectWebsiteRelease(snapshot.state)
        setState(snapshot.state)
        setProjection(nextProjection)
        setMessage('')
        if (nextProjection.package) {
          setReleaseManager(roleActor(nextProjection.package, 'release_manager'))
          setReleaseReviewer(roleActor(nextProjection.package, 'release_reviewer'))
          setIncludeMyanmarDraft(nextProjection.draftLocales.includes('my'))
          setAccent(nextProjection.package.brand.palette.accent)
        }
      } catch (error) {
        setState(null)
        setProjection(null)
        setMessage(error instanceof Error ? error.message : 'Release history is unavailable on this device.')
      }
    }
    const sync = (event: StorageEvent) => {
      if (event.key === null || event.key.includes(encodeURIComponent(scope))) refresh()
    }
    refresh()
    if (managed) return
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [managed, managedRecords, scope])

  const candidate = useMemo(() => {
    if (!scope || !publishIsCurrent || !currentPublish?.artifact || !currentApproval) return null
    const currentEvidence = ['content', 'links', 'responsive'].map((kind) => (
      workspace.evidence.find((entry) => entry.kind === kind && currentPublish.evidenceIds.includes(entry.id))
    ))
    if (currentEvidence.some((entry) => !entry)) return null
    try {
      const locales = [
        {
          locale: 'en',
          isDefault: true,
          status: 'approved',
          contentDigest: websiteReleaseEvidenceDigest({ artifactDigest, locale: 'en' }),
        },
        ...(includeMyanmarDraft ? [{
          locale: 'my',
          isDefault: false,
          status: 'draft',
          contentDigest: websiteReleaseEvidenceDigest({ artifactDigest, locale: 'my' }),
        }] : []),
      ]
      return buildWebsiteReleasePackage({
        packageId: `website-package-${artifactDigest.slice(7, 23)}-v2`,
        source: {
          scope,
          snapshotId: currentPublish.id,
          websiteFingerprint: currentPublish.fingerprint,
          artifactDigest,
          contentRevision: currentPublish.source.contentRevision,
          contentApprovalId: currentApproval.id,
          contentApprovalActor: currentApproval.reviewer,
          contentApprovalAt: currentApproval.approvedAt,
          evidence: currentEvidence.map((entry) => ({
            id: entry!.id,
            kind: entry!.kind,
            reference: entry!.reference,
            verifiedBy: entry!.verifiedBy,
            verifiedAt: entry!.verifiedAt,
          })),
        },
        template: websiteReleaseTemplate(2),
        brand: {
          schema: 'supermega.website.brand_tokens.v1',
          palette: { accent, ink: '#17211b', surface: '#f7f8f4' },
          typography: { body: 'noto-sans-myanmar', heading: 'system-sans' },
          radiusPx: 12,
        },
        locales,
        media: [],
        roles: [
          { role: 'content_owner', actor: currentApproval.reviewer },
          { role: 'release_manager', actor: managed ? managedActorId : releaseManager.trim() },
          { role: 'release_reviewer', actor: managed ? managedActorId : releaseReviewer.trim() },
        ],
      })
    } catch {
      return null
    }
  }, [accent, artifactDigest, currentApproval, currentPublish, includeMyanmarDraft, managed, managedActorId, publishIsCurrent, releaseManager, releaseReviewer, scope, workspace.evidence])

  const currentProjection = projection ?? (scope ? emptyProjection(scope) : null)
  const status = currentProjection?.status ?? 'unprepared'
  const packageValue = currentProjection?.package
  const effectiveReleaseManager = managed ? managedActorId : releaseManager.trim()
  const effectiveReleaseReviewer = managed ? managedActorId : releaseReviewer.trim()
  const actorsReady = Boolean(effectiveReleaseManager && effectiveReleaseReviewer)
  const assignedStepActor = status === 'needs_release_review'
    ? roleActor(packageValue ?? null, 'release_reviewer')
    : status === 'ready_for_plan'
      ? roleActor(packageValue ?? null, 'release_manager')
      : ''
  const managedRoleBlocked = Boolean(managed && assignedStepActor && assignedStepActor !== managedActorId)
  const domainHostnameIsValid = (() => {
    try {
      normalizeWebsiteDomainHostname(domainHostname)
      return true
    } catch {
      return false
    }
  })()

  async function saveTransition(
    kind: 'review' | 'plan',
    transition: (current: WebsiteReleaseState) => { state: WebsiteReleaseState; replayed: boolean },
  ) {
    if (!scope) return
    setBusy(kind)
    setMessage('')
    try {
      if (managed) {
        if (!onSaveManagedState) throw new Error('Managed Website release storage is unavailable.')
        const current = validateWebsiteReleaseState(state ?? createEmptyWebsiteReleaseState(scope))
        const result = transition(current)
        const saved = await onSaveManagedState(result.state)
        if (!saved.ok) throw new Error(saved.error)
        setState(result.state)
        setProjection(projectWebsiteRelease(result.state))
      } else {
        const result = await mutateWebsiteReleaseWorkspace(
          scope,
          transition,
          localStorage,
          'locks' in navigator ? navigator.locks : null,
        )
        if (!result.ok) {
          setMessage(result.error)
          const retained = loadWebsiteReleaseWorkspace(localStorage, scope)
          if (retained.source !== 'recovery') {
            setState(retained.state)
            setProjection(projectWebsiteRelease(retained.state))
          }
          return
        }
        setState(result.state)
        setProjection(projectWebsiteRelease(result.state))
      }
      setReviewConfirmed(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Website release transition failed.')
    } finally {
      setBusy('')
    }
  }

  async function reviewPackage() {
    if (!candidate || !currentPublish || !reviewConfirmed || !actorsReady) return
    const now = Date.now()
    await saveTransition('review', (current) => {
      if (projectWebsiteRelease(current).status === 'needs_release_review') {
        const retainedPackage = projectWebsiteRelease(current).package!
        return approveWebsiteReleasePackage(current, {
          approvalId: `website-review-${retainedPackage.packageDigest.slice(7, 23)}`,
          packageDigest: retainedPackage.packageDigest,
          note: 'Template, brand, languages, source evidence, and release boundary reviewed.',
          proof: actionProof(roleActor(retainedPackage, 'release_reviewer'), 'approved the exact Website release package', currentPublish.id, new Date(now + 1).toISOString()),
          expectedHeadDigest: current.headDigest,
        })
      }
      const prepared = prepareWebsiteReleasePackage(
        current,
        candidate,
        actionProof(effectiveReleaseManager, 'prepared the approved Website release package', currentPublish.id, new Date(now).toISOString()),
        current.headDigest,
      )
      return approveWebsiteReleasePackage(prepared.state, {
        approvalId: `website-review-${candidate.packageDigest.slice(7, 23)}`,
        packageDigest: candidate.packageDigest,
        note: 'Template, brand, languages, source evidence, and release boundary reviewed.',
        proof: actionProof(effectiveReleaseReviewer, 'approved the exact Website release package', currentPublish.id, new Date(now + 1).toISOString()),
        expectedHeadDigest: prepared.state.headDigest,
      })
    })
  }

  async function preparePlan() {
    if (!state || !packageValue || !currentProjection?.approval) return
    const manager = roleActor(packageValue, 'release_manager')
    await saveTransition('plan', (current) => prepareWebsiteDeployPlan(current, {
      planId: `website-plan-${packageValue.packageDigest.slice(7, 23)}`,
      packageDigest: packageValue.packageDigest,
      approvalId: currentProjection.approval!.id,
      target: { provider: 'vercel', projectRef: 'owner-bound-at-execution', environment: 'production', protection: 'required' },
      previousDeployment: null,
      proof: actionProof(manager, 'prepared an owner-gated deployment plan without executing it', currentPublish?.id ?? scope),
      expectedHeadDigest: current.headDigest,
    }))
  }

  function downloadDomainHandoff() {
    if (!packageValue || !currentProjection?.approval || !currentProjection.deployPlan) return
    const packet = buildWebsiteDomainHandoff({
      hostname: domainHostname,
      release: {
        scope: currentProjection.scope,
        headDigest: currentProjection.headDigest,
        packageDigest: packageValue.packageDigest,
        artifactDigest: packageValue.source.artifactDigest,
        approvalId: currentProjection.approval.id,
        deployPlanDigest: websiteReleaseEvidenceDigest(currentProjection.deployPlan),
      },
    })
    downloadJson(`website-domain-handoff-${packet.hostname.replaceAll('.', '-')}-${packet.packetDigest.slice(7, 19)}.json`, packet)
  }

  if (!publishIsCurrent || !currentPublish?.artifact || !currentApproval) {
    return (
      <section className="website-release-foundation is-locked" aria-label="Client release package">
        <div><strong>Client release package</strong><small>Create the approved site file first.</small></div>
        <span className="website-status is-local">Locked</span>
      </section>
    )
  }

  return (
    <section className="website-release-foundation" aria-labelledby="website-release-title">
      <header>
        <div>
          <span className="website-eyebrow">Client release</span>
          <h4 id="website-release-title">Package the approved site</h4>
          <p>Bind the site file to a reusable template, named review, and an owner-gated rollout plan.</p>
        </div>
        <span className={'website-status ' + (status === 'plan_ready' ? 'is-ready' : 'is-pending')}>
          {status === 'plan_ready' ? 'Plan ready' : status === 'ready_for_plan' ? 'Reviewed' : 'Needs review'}
        </span>
      </header>

      <div className="website-release-boundary" role="note">
        <strong>Plan only</strong>
        <span>No deployment, domain, credential, or provider change happens here.</span>
      </div>

      {message ? <p className="website-release-message" role="status">{message}</p> : null}
      {managedRoleBlocked ? <p className="website-release-message" role="status">This managed step is assigned to {assignedStepActor}. Sign in as that operator to continue.</p> : null}

      {status === 'unprepared' ? (
        <div className="website-release-config">
          <label>
            <span>Release manager</span>
            <input autoComplete="name" disabled={managed} onChange={(event) => setReleaseManager(event.target.value)} value={effectiveReleaseManager} />
          </label>
          <label>
            <span>Release reviewer</span>
            <input autoComplete="name" disabled={managed} onChange={(event) => setReleaseReviewer(event.target.value)} value={effectiveReleaseReviewer} />
          </label>
          <details>
            <summary>Template options</summary>
            <div className="website-release-options">
              <label>
                <span>Accent</span>
                <input aria-label="Website release accent color" onChange={(event) => setAccent(event.target.value)} type="color" value={accent} />
              </label>
              <label className="website-release-check">
                <input checked={includeMyanmarDraft} onChange={(event) => setIncludeMyanmarDraft(event.target.checked)} type="checkbox" />
                <span>Keep Myanmar as a draft language</span>
              </label>
            </div>
          </details>
        </div>
      ) : null}

      {packageValue || candidate ? (
        <details className="website-release-summary">
          <summary>Review package details</summary>
          <dl>
            <div><dt>Template</dt><dd>Business v2</dd></div>
            <div><dt>Approved language</dt><dd>English</dd></div>
            <div><dt>Draft language</dt><dd>{(packageValue?.locales ?? candidate?.locales)?.some((locale) => locale.status === 'draft') ? 'Myanmar' : 'None'}</dd></div>
            <div><dt>Site evidence</dt><dd>Content, links, mobile, desktop</dd></div>
          </dl>
        </details>
      ) : null}

      {status === 'unprepared' || status === 'needs_release_review' ? (
        <div className="website-release-action">
          <label className="website-release-check">
            <input checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} type="checkbox" />
            <span>I reviewed this exact site file, template, language status, and release boundary.</span>
          </label>
          <button className="website-button is-primary" disabled={!candidate || !actorsReady || !reviewConfirmed || managedRoleBlocked || Boolean(busy)} onClick={() => void reviewPackage()} type="button">
            {busy === 'review' ? 'Recording...' : 'Record release review'}
          </button>
        </div>
      ) : status === 'ready_for_plan' ? (
        <div className="website-release-action">
          <p>The exact package is reviewed. The rollout plan stays unexecuted and rollback stays blocked until the owner binds a known-good deployment.</p>
          <button className="website-button is-primary" disabled={managedRoleBlocked || Boolean(busy)} onClick={() => void preparePlan()} type="button">
            {busy === 'plan' ? 'Preparing...' : 'Prepare rollout plan'}
          </button>
        </div>
      ) : (
        <div className="website-release-action is-complete">
          <p><strong>Ready for owner handoff.</strong> Candidate promotion and rollback remain unexecuted. Add a hostname below only to download a separate domain checklist.</p>
          <label>
            <span>Customer domain</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              inputMode="url"
              onChange={(event) => setDomainHostname(event.target.value)}
              placeholder="www.example.com"
              spellCheck={false}
              value={domainHostname}
            />
            {domainHostname && !domainHostnameIsValid
              ? <small role="alert">Enter an ASCII public hostname or explicit punycode only — no scheme, port, path, credentials, or local address.</small>
              : <small>The hostname stays only in this form until download. It is not saved to Website history; ownership, provider add, DNS, HTTPS, activation, and rollback remain separate gates.</small>}
          </label>
          <button className="website-button is-secondary" disabled={!domainHostnameIsValid} onClick={downloadDomainHandoff} type="button">
            Download domain handoff
          </button>
          <button
            className="website-button is-secondary"
            onClick={() => downloadJson(`website-release-${packageValue?.packageDigest.slice(7, 19)}.json`, { state, projection: currentProjection })}
            type="button"
          >
            Download release record
          </button>
        </div>
      )}
    </section>
  )
}
