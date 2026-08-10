import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'

import {
  LOCAL_WORKSPACE_BACKUP_MAX_BYTES,
  LOCAL_WORKSPACE_RESTORE_POINT_KEY,
  applyLocalWorkspaceBackup,
  collectLocalWorkspaceBackup,
  listLocalWorkspaceStorageKeys,
  restoreLocalWorkspaceBackup,
  restoreLocalWorkspaceBackupFromEvidence,
  type LocalWorkspaceBackup,
} from './local-workspace-backup'
import { PageHeading, RuntimeBadge, type RuntimeHealth } from './CoreShell'
import {
  readBehaviorTrail,
  summarizeBehaviorPreferences,
  summarizeProductActivationFunnel,
  summarizeProductFirstValue,
} from './behavior-trail'
import { productContracts, type SetupProductId } from './product-setup'

const activityProducts: SetupProductId[] = ['commerce', 'production', 'website', 'ecommerce']

function readActivity() {
  if (typeof window === 'undefined') return null
  const entries = readBehaviorTrail(window.localStorage)
  // Opening this page records a signal against no product, so counting raw
  // entries would make the empty state unreachable and show a first-time owner
  // four products of zeros as though they were measurements.
  const productSignals = entries.filter((entry) => activityProducts.some((product) => product === entry.product))
  if (!productSignals.length) return null
  return {
    signals: productSignals.length,
    preference: summarizeBehaviorPreferences(entries),
    products: activityProducts.map((product) => ({
      product,
      name: productContracts[product].name,
      funnel: summarizeProductActivationFunnel(entries, product),
      firstValue: summarizeProductFirstValue(entries, product),
    })),
  }
}

function elapsedLabel(seconds: number | null) {
  if (seconds === null) return ''
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1)} h`
}

function firstValueLabel(status: 'not_started' | 'in_progress' | 'completed', seconds: number | null) {
  if (status === 'completed') return seconds === null ? 'Done' : `Done in ${elapsedLabel(seconds)}`
  return status === 'in_progress' ? 'Started' : 'Not opened'
}

function loadRestorePoint() {
  if (typeof window === 'undefined') return null
  try {
    return restoreLocalWorkspaceBackup(JSON.parse(window.sessionStorage.getItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY) || 'null'))
  } catch {
    return null
  }
}

function collectCurrentBackup() {
  return typeof window === 'undefined' ? null : collectLocalWorkspaceBackup(window.localStorage)
}

function backupHref(backup: LocalWorkspaceBackup | null) {
  return backup ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup, null, 2))}` : '#'
}

function backupFilename(backup: LocalWorkspaceBackup | null) {
  const day = backup?.createdAt.slice(0, 10) || new Date().toISOString().slice(0, 10)
  return `supermega-workspace-backup-${day}.json`
}

export function WorkspaceControlsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const [currentBackup, setCurrentBackup] = useState<LocalWorkspaceBackup | null>(collectCurrentBackup)
  const [restorePoint, setRestorePoint] = useState<LocalWorkspaceBackup | null>(loadRestorePoint)
  const [restorePointLabel, setRestorePointLabel] = useState(restorePoint ? 'Saved on this device' : '')
  const [notice, setNotice] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const backupDownload = useMemo(() => ({ href: backupHref(currentBackup), filename: backupFilename(currentBackup) }), [currentBackup])
  // Every product records these signals already; until now nothing outside the
  // dev-only client builder read them back, so the owner never saw their own
  // activity. Read once on mount: this is a report, not a live counter.
  const [activity] = useState(readActivity)
  const recordCount = currentBackup ? Object.keys(currentBackup.records).length : 0
  const statusRows: Array<readonly [string, string]> = [
    ['Mode', runtime.status === 'enterprise' ? 'Company data' : runtime.status === 'checking' ? 'Checking' : 'Demo on this device'],
    ['Writes', runtime.writesReady ? 'Ready' : 'Locked'],
    ['Local records', currentBackup ? String(recordCount) : 'Backup unavailable'],
    ['Next action', runtime.activationManifest?.next_action ?? runtime.requirements[0] ?? 'Open a product and continue working.'],
  ]

  function saveRestorePoint() {
    const backup = collectCurrentBackup()
    if (!backup) {
      setNotice('This workspace is too large to save safely. Download smaller product exports before resetting this device.')
      return
    }
    try {
      window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      setCurrentBackup(backup)
      setRestorePoint(backup)
      setRestorePointLabel('Saved on this device')
      setNotice(`${Object.keys(backup.records).length} local records saved as a restore point.`)
    } catch {
      setNotice('This browser could not save a restore point. Download the workspace backup instead.')
    }
  }

  async function loadBackupFile(file: File | null) {
    if (!file) return
    try {
      if (file.size < 1 || file.size > LOCAL_WORKSPACE_BACKUP_MAX_BYTES) throw new Error('Choose a SuperMega backup smaller than 5 MB.')
      const parsed: unknown = JSON.parse(await file.text())
      const backup = restoreLocalWorkspaceBackup(parsed) ?? restoreLocalWorkspaceBackupFromEvidence(parsed)
      if (!backup) throw new Error('This is not a valid SuperMega workspace backup or version 24 evidence file.')
      window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      setRestorePoint(backup)
      setRestorePointLabel(file.name)
      setNotice(`${Object.keys(backup.records).length} records verified. Restore only when you are ready to replace this browser workspace.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The workspace backup could not be loaded.')
    }
  }

  function restoreWorkspace() {
    if (!restorePoint || restoreBusy) return
    setRestoreBusy(true)
    try {
      applyLocalWorkspaceBackup(window.localStorage, restorePoint)
      window.sessionStorage.removeItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY)
      window.location.assign('/')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The previous workspace could not be restored safely.')
      setRestoreBusy(false)
    }
  }

  async function resetWorkspace() {
    if (resetBusy) return
    setResetBusy(true)
    try {
      if (!loadRestorePoint()) {
        const backup = collectCurrentBackup()
        if (!backup) throw new Error('Save or download a restore point before resetting this device.')
        window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      }
      const { resetCommerceOrderDraftRecovery } = await import('./commerce-order-draft')
      await resetCommerceOrderDraftRecovery()
      listLocalWorkspaceStorageKeys(window.localStorage).forEach((key) => window.localStorage.removeItem(key))
      window.location.assign('/')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The workspace could not be reset safely.')
      setResetBusy(false)
    }
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading
        actions={<Link className="core-button" to="/">Back to products</Link>}
        copy="Check company readiness and protect the work saved in this browser. Product setup and internal client tools stay separate."
        eyebrow="Workspace controls"
        title="Status and recovery"
      />
      <div className="settings-control-stack">
        <section className="core-panel system-boundary-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Company boundary</span><h2>{runtime.writesReady ? 'Company writes are ready' : 'Real changes stay locked'}</h2><p>Local work remains usable while hosted identity, persistence, and security evidence are checked.</p></div><RuntimeBadge status={runtime.status} /></div>
          <div aria-label="Workspace readiness" className="readiness-list">{statusRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
          {runtime.requirements.length ? <ul className="requirement-list">{runtime.requirements.slice(0, 4).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
          <div className="trial-actions"><Link className="core-button" to="/login">Company login</Link><Link className="core-button primary" to="/">Open a product</Link></div>
          <p className="authority-note">SuperMega can prepare local work. Customer messages, payments, publishing, imports, and managed writes still require verified company controls and human approval.</p>
        </section>

        <section aria-label="Workspace activity" className="core-panel workspace-activity-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Your activity</span><h2>{activity ? 'What this workspace has done' : 'No activity recorded yet'}</h2><p>Counted from what you opened and finished on this device. Nothing is sent anywhere, and nothing here is an estimate.</p></div>{activity ? <span className="panel-note">{activity.signals} recorded {activity.signals === 1 ? 'step' : 'steps'}</span> : null}</div>
          {activity ? (
            <>
              <div aria-label="Product activity" className="workspace-activity-grid">
                {activity.products.map((entry) => (
                  <article key={entry.product}>
                    <strong>{entry.name}</strong>
                    <span className={`status-pill ${entry.firstValue.status === 'completed' ? 'approved' : entry.firstValue.status === 'in_progress' ? 'pending' : 'bounded'}`}>{firstValueLabel(entry.firstValue.status, entry.firstValue.elapsedSeconds)}</span>
                    <small>Setup {entry.funnel.completionPercent}% · next: {entry.funnel.nextAction.toLowerCase()}</small>
                  </article>
                ))}
              </div>
              {activity.preference.preferred ? <p className="authority-note">Most used so far: <strong>{productContracts[activity.preference.preferred.product].name}</strong> — {activity.preference.preferred.detail} ({activity.preference.preferred.chosenCount}&times;).</p> : null}
            </>
          ) : <p className="form-notice">Open a product and finish its first task. This panel then shows how far each product got and how long the first result took.</p>}
        </section>

        <section className="core-panel trial-control-panel">
          <div><span className="core-eyebrow">Browser workspace</span><h2>Save or restore your work.</h2><p>A restore point stays on this device. A downloaded backup can be kept somewhere safer.</p></div>
          <div className="trial-actions">
            <button className="core-button" onClick={saveRestorePoint} type="button">Save restore point</button>
            {currentBackup ? <a className="core-button" download={backupDownload.filename} href={backupDownload.href}>Download workspace backup</a> : <button className="core-button" disabled type="button">Backup unavailable</button>}
            <label className="core-button">Load backup file<input accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void loadBackupFile(file) }} type="file" /></label>
          </div>
        </section>

        {restorePoint ? <section aria-label="Local workspace restore point" className="setup-complete settings-restore-point"><div><strong>Restore point ready.</strong><small>{restorePointLabel} · {Object.keys(restorePoint.records).length} records</small></div><button className="core-button primary" disabled={restoreBusy} onClick={restoreWorkspace} type="button">{restoreBusy ? 'Restoring...' : 'Restore previous workspace'}</button></section> : null}
        {notice ? <p aria-live="polite" className="form-notice" role="status">{notice}</p> : null}

        <details className="compact-disclosure">
          <summary><span>Reset this device</span><small>Destructive</small></summary>
          <div className="setup-template-summary"><div><span>What will be cleared</span><strong>Local Shop, Plant, Website, Ecommerce, setup, drafts, approvals, and AI-memory records</strong></div><p>A restore point is created first. Managed company records and external systems are not changed.</p><div className="trial-actions">{resetArmed ? <><button className="text-link" disabled={resetBusy} onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" disabled={resetBusy} onClick={() => void resetWorkspace()} type="button">{resetBusy ? 'Resetting...' : 'Confirm local reset'}</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Prepare local reset</button>}</div></div>
        </details>
      </div>
    </div>
  )
}
