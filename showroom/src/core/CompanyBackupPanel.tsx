import { useState } from 'react'

import {
  COMPANY_BACKUP_MAX_FILE_BYTES,
  createEncryptedCompanyBackup,
  inspectEncryptedCompanyBackup,
  planCompanyRestore,
  restoreCompanyBackup,
  summarizeCompanyStorageKeys,
  type CompanyBackupInspection,
  type CompanyRestorePlan,
} from './company-backup'
import { lockedCapabilityNotice } from './capability-tiers'

function formatBackupDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

/** How old the backup is, because that age is what decides which records are about to be deleted. */
function backupAgeSentence(value: string): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (!Number.isFinite(days)) return 'This backup has no readable date.'
  if (days < 0) return 'This backup is dated in the future. Check the date on this device.'
  if (days === 0) return 'This backup was saved today.'
  if (days === 1) return 'This backup was saved yesterday.'
  return `This backup was saved ${days} days ago.`
}

/**
 * Written for an owner whose first language is not English: what goes, how many, and where to look.
 * A count alone after the write -- which is all this panel used to give -- cannot be acted on.
 */
function deletionSentence(plan: CompanyRestorePlan): string {
  const total = plan.deleting.length
  if (total === 0) return 'Nothing saved on this device will be deleted.'
  const where = summarizeCompanyStorageKeys(plan.deleting).map((item) => `${item.count} in ${item.label}`).join(', ')
  return `Restoring deletes ${total} ${total === 1 ? 'record' : 'records'} you saved after this backup: ${where}. This backup does not hold them. Download a new backup first if you want to keep them.`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function CompanyBackupPanel() {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [inspection, setInspection] = useState<CompanyBackupInspection | null>(null)
  const [plan, setPlan] = useState<CompanyRestorePlan | null>(null)
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false)
  const [busyAction, setBusyAction] = useState<'download' | 'inspect' | 'restore' | null>(null)
  const [restoreArmed, setRestoreArmed] = useState(false)
  const [notice, setNotice] = useState('Encrypted locally. Nothing is uploaded, sent, or written to a company account.')

  // The plan is only true for the storage it was read from, so anything that could change which
  // backup is in play drops it. Restore stays closed until a fresh inspection produces a new one.
  function clearInspection() {
    setInspection(null)
    setPlan(null)
    setDeletionAcknowledged(false)
    setRestoreArmed(false)
  }

  async function downloadBackup() {
    if (passphrase !== confirmation) {
      setNotice('Backup passwords do not match. No file was created.')
      return
    }
    setBusyAction('download')
    try {
      const result = await createEncryptedCompanyBackup(window.localStorage, passphrase)
      const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.download = result.filename
      anchor.href = url
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setConfirmation('')
      clearInspection()
      setNotice(`Encrypted company backup downloaded with ${result.envelope.recordCount} records. Keep the file and password separately.`)
    } catch (error) {
      setNotice(errorMessage(error, 'The encrypted backup could not be created.'))
    } finally {
      setBusyAction(null)
    }
  }

  async function inspectBackup() {
    if (!backupFile) {
      setNotice('Choose an encrypted SuperMega backup file first.')
      return
    }
    if (backupFile.size > COMPANY_BACKUP_MAX_FILE_BYTES) {
      setNotice('The selected backup file is too large. Nothing was opened or restored.')
      return
    }
    setBusyAction('inspect')
    clearInspection()
    try {
      const checked = await inspectEncryptedCompanyBackup(await backupFile.text(), passphrase)
      // Planned before the inspection is published, so a plan we cannot compute leaves restore
      // unavailable rather than offering a write whose deletions were never shown.
      const restorePlan = planCompanyRestore(window.localStorage, checked)
      setInspection(checked)
      setPlan(restorePlan)
      setNotice('Backup integrity passed. Review the summary before restoring this browser.')
    } catch (error) {
      setNotice(errorMessage(error, 'The encrypted backup could not be inspected. Nothing was restored.'))
    } finally {
      setBusyAction(null)
    }
  }

  async function restoreBackup() {
    if (!inspection || !plan) {
      setNotice('Inspect the encrypted backup before restoring it.')
      return
    }
    if (plan.deleting.length > 0 && !deletionAcknowledged) {
      setNotice('Tick the box to confirm the newer records will be deleted. Nothing was restored.')
      return
    }
    setBusyAction('restore')
    try {
      const restored = await restoreCompanyBackup(window.localStorage, inspection)
      setRestoreArmed(false)
      setNotice(`Company state restored: ${restored.restoredCount} records kept, ${restored.removedCount} newer local records removed. Reloading safely...`)
      window.setTimeout(() => window.location.assign('/settings/#controls'), 500)
    } catch (error) {
      setNotice(errorMessage(error, 'Restore failed. No managed or external action ran.'))
    } finally {
      setBusyAction(null)
    }
  }

  return <><section aria-label="Encrypted company backup" className="core-panel company-backup-panel">
    <div className="company-backup-head">
      <div><span className="core-eyebrow">Company backup</span><h2>Move or recover this company.</h2><p>Free mode can download and restore current Shop, Plant, Website, Ecommerce, owner decisions, and local AI memory.</p></div>
      <span className="status-pill bounded">browser only</span>
    </div>
      <div className="company-backup-boundary" role="note"><strong>Customer-owned and encrypted</strong><span>AES-GCM encryption with a password you choose. Auth sessions, company account IDs, and credentials are excluded. SuperMega cannot recover a lost password.</span></div>
    <div className="company-backup-fields">
      <label>Backup password<input autoComplete="new-password" maxLength={256} minLength={12} onChange={(event) => { setPassphrase(event.target.value); clearInspection() }} placeholder="At least 12 characters" type="password" value={passphrase} /></label>
      <label>Confirm for download<input autoComplete="new-password" maxLength={256} minLength={12} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat before download" type="password" value={confirmation} /></label>
      <label>Encrypted backup file<input accept="application/json,.json" onChange={(event) => { setBackupFile(event.target.files?.[0] ?? null); clearInspection() }} type="file" /></label>
    </div>
    <div className="company-backup-actions">
      <button className="core-button" disabled={busyAction !== null || passphrase.length < 12 || confirmation.length < 12} onClick={() => void downloadBackup()} type="button">{busyAction === 'download' ? 'Encrypting...' : 'Download encrypted backup'}</button>
      <button className="core-button" disabled={busyAction !== null || !backupFile || passphrase.length < 12} onClick={() => void inspectBackup()} type="button">{busyAction === 'inspect' ? 'Inspecting...' : 'Inspect backup'}</button>
    </div>
    {inspection ? <div aria-label="Inspected backup summary" className="company-backup-inspection">
      <div><span className="core-eyebrow">Integrity passed</span><strong>{inspection.recordCount} records from {formatBackupDate(inspection.exportedAt)}</strong><small>{inspection.snapshotDigest.slice(0, 22)}...</small></div>
      <div className="company-backup-categories">{inspection.categories.map((category) => <span key={category.label}><small>{category.label}</small><strong>{category.count}</strong></span>)}</div>
      <p>This replaces current free-mode company records in this browser. It never restores auth, company account identity, or credentials.</p>
      <p>{backupAgeSentence(inspection.exportedAt)} {plan ? deletionSentence(plan) : ''}</p>
      {plan && plan.deleting.length > 0 ? <label className="website-intake-confirm"><input checked={deletionAcknowledged} disabled={busyAction !== null} onChange={(event) => setDeletionAcknowledged(event.target.checked)} type="checkbox" /><span>I understand these {plan.deleting.length} newer {plan.deleting.length === 1 ? 'record' : 'records'} will be deleted.</span></label> : null}
      <div className="company-backup-actions">{restoreArmed ? <><button className="text-link" disabled={busyAction !== null} onClick={() => setRestoreArmed(false)} type="button">Cancel</button><button className="core-button danger" disabled={busyAction !== null} onClick={() => void restoreBackup()} type="button">{busyAction === 'restore' ? 'Restoring...' : 'Confirm restore'}</button></> : <button className="core-button" disabled={busyAction !== null || !plan || (plan.deleting.length > 0 && !deletionAcknowledged)} onClick={() => setRestoreArmed(true)} type="button">Restore this backup</button>}</div>
    </div> : null}
    <p aria-live="polite" className="form-notice company-backup-notice" role="status">{notice}</p>
  </section>
  <section aria-label="Automatic off-device backup" className="core-panel company-backup-panel">
    <div className="company-backup-head">
      <div><span className="core-eyebrow">Automatic off-device backup</span><h2>{lockedCapabilityNotice('cloud-backup').label}</h2><p>{lockedCapabilityNotice('cloud-backup').outcome}</p></div>
      <span className="status-pill">premium</span>
    </div>
    <p className="form-notice">{lockedCapabilityNotice('cloud-backup').reason} Manual encrypted backup stays free forever. <a className="text-link" href="/contact/?product=guide&source=managed-intelligence">Talk to us about this.</a></p>
  </section>
</>
}
