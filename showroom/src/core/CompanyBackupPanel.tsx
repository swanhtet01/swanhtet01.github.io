import { useState } from 'react'

import {
  COMPANY_BACKUP_MAX_FILE_BYTES,
  createEncryptedCompanyBackup,
  inspectEncryptedCompanyBackup,
  restoreCompanyBackup,
  type CompanyBackupInspection,
} from './company-backup'

function formatBackupDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function CompanyBackupPanel() {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [inspection, setInspection] = useState<CompanyBackupInspection | null>(null)
  const [busyAction, setBusyAction] = useState<'download' | 'inspect' | 'restore' | null>(null)
  const [restoreArmed, setRestoreArmed] = useState(false)
  const [notice, setNotice] = useState('Encrypted locally. Nothing is uploaded, sent, or written to a company account.')

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
      setInspection(null)
      setRestoreArmed(false)
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
    setInspection(null)
    setRestoreArmed(false)
    try {
      const checked = await inspectEncryptedCompanyBackup(await backupFile.text(), passphrase)
      setInspection(checked)
      setNotice('Backup integrity passed. Review the summary before restoring this browser.')
    } catch (error) {
      setNotice(errorMessage(error, 'The encrypted backup could not be inspected. Nothing was restored.'))
    } finally {
      setBusyAction(null)
    }
  }

  async function restoreBackup() {
    if (!inspection) {
      setNotice('Inspect the encrypted backup before restoring it.')
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

  return <section aria-label="Encrypted company backup" className="core-panel company-backup-panel">
    <div className="company-backup-head">
      <div><span className="core-eyebrow">Company backup</span><h2>Move or recover this company.</h2><p>Free mode can download and restore current Shop, Plant, Website, Ecommerce, owner decisions, and local AI memory.</p></div>
      <span className="status-pill bounded">browser only</span>
    </div>
      <div className="company-backup-boundary" role="note"><strong>Customer-owned and encrypted</strong><span>AES-GCM encryption with a password you choose. Auth sessions, company account IDs, and credentials are excluded. SuperMega cannot recover a lost password.</span></div>
    <div className="company-backup-fields">
      <label>Backup password<input autoComplete="new-password" maxLength={256} minLength={12} onChange={(event) => { setPassphrase(event.target.value); setInspection(null); setRestoreArmed(false) }} placeholder="At least 12 characters" type="password" value={passphrase} /></label>
      <label>Confirm for download<input autoComplete="new-password" maxLength={256} minLength={12} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat before download" type="password" value={confirmation} /></label>
      <label>Encrypted backup file<input accept="application/json,.json" onChange={(event) => { setBackupFile(event.target.files?.[0] ?? null); setInspection(null); setRestoreArmed(false) }} type="file" /></label>
    </div>
    <div className="company-backup-actions">
      <button className="core-button" disabled={busyAction !== null || passphrase.length < 12 || confirmation.length < 12} onClick={() => void downloadBackup()} type="button">{busyAction === 'download' ? 'Encrypting...' : 'Download encrypted backup'}</button>
      <button className="core-button" disabled={busyAction !== null || !backupFile || passphrase.length < 12} onClick={() => void inspectBackup()} type="button">{busyAction === 'inspect' ? 'Inspecting...' : 'Inspect backup'}</button>
    </div>
    {inspection ? <div aria-label="Inspected backup summary" className="company-backup-inspection">
      <div><span className="core-eyebrow">Integrity passed</span><strong>{inspection.recordCount} records from {formatBackupDate(inspection.exportedAt)}</strong><small>{inspection.snapshotDigest.slice(0, 22)}...</small></div>
      <div className="company-backup-categories">{inspection.categories.map((category) => <span key={category.label}><small>{category.label}</small><strong>{category.count}</strong></span>)}</div>
      <p>This replaces current free-mode company records in this browser. It never restores auth, company account identity, or credentials.</p>
      <div className="company-backup-actions">{restoreArmed ? <><button className="text-link" disabled={busyAction !== null} onClick={() => setRestoreArmed(false)} type="button">Cancel</button><button className="core-button danger" disabled={busyAction !== null} onClick={() => void restoreBackup()} type="button">{busyAction === 'restore' ? 'Restoring...' : 'Confirm restore'}</button></> : <button className="core-button" disabled={busyAction !== null} onClick={() => setRestoreArmed(true)} type="button">Restore this backup</button>}</div>
    </div> : null}
    <p aria-live="polite" className="form-notice company-backup-notice" role="status">{notice}</p>
  </section>
}
