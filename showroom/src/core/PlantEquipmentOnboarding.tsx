import { useEffect, useRef, useState } from 'react'

import { CLIENT_IMPORT_MAX_BYTES } from './client-onboarding.ts'
import {
  applyManagedPlantEquipmentImport,
  loadManagedBootstrap,
  sameManagedClientImportState,
  validateManagedPlantEquipmentImport,
  type ManagedIdentity,
  type ManagedPlantEquipmentActivationResult,
  type ManagedPlantEquipmentValidation,
} from './managed-trial.ts'
import {
  createPlantEquipmentImportPreview,
  plantEquipmentSampleCsv,
  type PlantEquipmentImportPreview,
} from './plant-equipment-import.ts'
import { validateProductionState, type ProductionState } from './production-workspace.ts'
import { PlantEquipmentCommissioning } from './PlantEquipmentCommissioning.tsx'
import { PlantEquipmentMaintenanceStrategy } from './PlantEquipmentMaintenanceStrategy.tsx'

type PlantEquipmentOnboardingProps = {
  workspace: string
  owner: string
  managedIdentity: ManagedIdentity | null
}

type CheckedEquipmentImport = {
  commandId: string
  expectedVersion: number
  identity: ManagedIdentity
  priorState: ProductionState
  preview: PlantEquipmentImportPreview
  receipt: ManagedPlantEquipmentValidation
}

type EquipmentImportState = {
  sourceName: string
  preview: PlantEquipmentImportPreview | null
  checked: CheckedEquipmentImport | null
  applied: ManagedPlantEquipmentActivationResult | null
  busy: boolean
  approved: boolean
  error: string
}

const emptyState = (): EquipmentImportState => ({
  sourceName: '',
  preview: null,
  checked: null,
  applied: null,
  busy: false,
  approved: false,
  error: '',
})

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function commandId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure command identity is unavailable in this browser.')
  return globalThis.crypto.randomUUID()
}

export function PlantEquipmentOnboarding({ workspace, owner, managedIdentity }: PlantEquipmentOnboardingProps) {
  const [state, setState] = useState<EquipmentImportState>(emptyState)
  const requestRef = useRef(0)

  useEffect(() => {
    requestRef.current += 1
    setState(emptyState())
  }, [managedIdentity?.userId, managedIdentity?.workspaceId, owner, workspace])

  async function preview(sourceName: string, sourceText: string) {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setState({ ...emptyState(), sourceName, busy: true })
    try {
      const nextPreview = await createPlantEquipmentImportPreview({ sourceName, sourceText, workspace, owner })
      if (requestRef.current !== requestId) return
      setState({ ...emptyState(), sourceName, preview: nextPreview })
    } catch (error) {
      if (requestRef.current !== requestId) return
      setState({ ...emptyState(), sourceName, error: error instanceof Error ? error.message : 'The equipment CSV could not be reviewed.' })
    }
  }

  async function chooseFile(file: File | null) {
    if (!file) return
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv') && file.type !== 'text/csv') {
      setState({ ...emptyState(), sourceName: file.name, error: 'Choose a CSV file.' })
      return
    }
    if (file.size > CLIENT_IMPORT_MAX_BYTES) {
      setState({ ...emptyState(), sourceName: file.name, error: `Choose a CSV smaller than ${CLIENT_IMPORT_MAX_BYTES / 1024} KB.` })
      return
    }
    try {
      await preview(file.name, await file.text())
    } catch {
      setState({ ...emptyState(), sourceName: file.name, error: 'The browser could not read this CSV.' })
    }
  }

  function downloadTemplate() {
    downloadFile('supermega-plant-equipment-master-v1.csv', `\uFEFF${plantEquipmentSampleCsv()}`, 'text/csv;charset=utf-8')
  }

  async function checkOrDownload() {
    if (!state.preview || state.busy) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const identity = managedIdentity
    if (!identity) {
      downloadFile('supermega-plant-equipment-master-staged-v1.json', `${JSON.stringify(state.preview.package, null, 2)}\n`, 'application/json;charset=utf-8')
      return
    }
    setState((current) => ({ ...current, busy: true, checked: null, applied: null, approved: false, error: '' }))
    try {
      const [receipt, bootstrap] = await Promise.all([
        validateManagedPlantEquipmentImport(state.preview.package, identity),
        loadManagedBootstrap(identity),
      ])
      if (requestRef.current !== requestId) return
      const production = bootstrap.states.production
      if (!production || !Number.isSafeInteger(production.version) || production.version < 1) {
        throw new Error('Create the Plant opening plan before adding equipment master records.')
      }
      const priorState = validateProductionState(production.state)
      setState((current) => ({
        ...current,
        busy: false,
        checked: { commandId: commandId(), expectedVersion: production.version, identity, priorState, preview: state.preview as PlantEquipmentImportPreview, receipt },
        applied: null,
        approved: false,
        error: '',
      }))
    } catch (error) {
      if (requestRef.current !== requestId) return
      setState((current) => ({ ...current, busy: false, checked: null, error: error instanceof Error ? error.message : 'The managed equipment check failed.' }))
    }
  }

  async function apply() {
    const checked = state.checked
    if (!checked || !state.approved || state.busy) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setState((current) => ({ ...current, busy: true, applied: null, error: '' }))
    try {
      const applied = await applyManagedPlantEquipmentImport({
        commandId: checked.commandId,
        expectedVersion: checked.expectedVersion,
        identity: checked.identity,
        priorState: checked.priorState,
        equipmentPackage: checked.preview.package,
        validation: checked.receipt,
      })
      const bootstrap = await loadManagedBootstrap(checked.identity)
      if (requestRef.current !== requestId) return
      const production = bootstrap.states.production
      if (!production
        || production.version < applied.result.version
        || production.updated_by !== checked.identity.userId
        || !sameManagedClientImportState(production.state, applied.result.state)) {
        throw new Error('The equipment import was accepted but its durable Production revision could not be confirmed. Retrying cannot duplicate it.')
      }
      validateProductionState(production.state)
      setState((current) => ({ ...current, busy: false, applied, approved: false, error: '' }))
    } catch (error) {
      if (requestRef.current !== requestId) return
      setState((current) => ({ ...current, busy: false, applied: null, error: error instanceof Error ? error.message : 'No equipment records were changed.' }))
    }
  }

  const visibleRows = state.preview?.package.rows.slice(0, 20) ?? []
  const checkedIsCurrent = state.checked?.preview.packageDigest === state.preview?.packageDigest
  const appliedIsCurrent = state.applied?.activation.package_digest === state.preview?.packageDigest

  return (
    <details className="compact-disclosure catalog-import-disclosure">
      <summary><span>Equipment master</span><small>Optional after Plant jobs</small></summary>
      <div className="catalog-import-workspace">
        <div className="catalog-import-intro">
          <div><span className="core-eyebrow">Plant setup</span><h3>Add known equipment</h3><p>Register stable equipment IDs, work centres, criticality, and owner. This does not start or commission a machine.</p></div>
          <div className="catalog-import-file-actions">
            <label htmlFor="plant-equipment-import">Choose equipment CSV<input accept=".csv,text/csv" disabled={state.busy} id="plant-equipment-import" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void chooseFile(file) }} type="file" /></label>
            <div className="catalog-import-template-actions"><button className="core-button" disabled={state.busy} onClick={() => void preview('supermega-plant-equipment-master-v1.csv', plantEquipmentSampleCsv())} type="button">Try sample</button><button className="core-button" disabled={state.busy} onClick={downloadTemplate} type="button">Download template</button></div>
          </div>
        </div>
        <p className="catalog-import-boundary">The CSV stays in this tab. Review creates equipment master identity only: no running state, maintenance history, sensor data, or commissioning is invented.</p>
        {state.busy ? <p className="form-notice" role="status">{state.checked ? 'Confirming the equipment master...' : 'Checking equipment records...'}</p> : null}
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.preview ? <div className="catalog-import-preview">
          <div className="catalog-import-source"><div><strong>{state.sourceName}</strong><small>{state.preview.package.rows.length} equipment records / 4 required columns</small></div><span className={`status-pill ${appliedIsCurrent || checkedIsCurrent ? 'approved' : 'pending'}`}>{appliedIsCurrent ? 'Applied' : checkedIsCurrent ? 'Workspace checked' : 'Ready to check'}</span></div>
          <div className="catalog-import-totals"><span><strong>{state.preview.package.rows.length}</strong><small>Records</small></span><span data-result="ready"><strong>{new Set(state.preview.package.rows.map((row) => row.values.workCentreId)).size}</strong><small>Work centres</small></span><span><strong>0</strong><small>Commissioned</small></span><span><strong>0</strong><small>Runtime states</small></span></div>
          <details className="catalog-import-row-review">
            <summary><span>Review equipment</span><small>{visibleRows.length} shown</small></summary>
            <div className="catalog-import-table" role="table" aria-label="Plant equipment master preview">
              <div className="catalog-import-row catalog-import-head" role="row"><span>Row</span><span>Equipment</span><span>Work centre</span><span>Criticality</span></div>
              {visibleRows.map((row) => <div className="catalog-import-row" data-result="ready" key={row.key} role="row"><span>{row.sourceRow}</span><strong>{row.values.equipmentId}<small>{row.values.name}</small></strong><span>{row.values.workCentreId}</span><small>{row.values.criticality}</small></div>)}
            </div>
          </details>
          {checkedIsCurrent && state.checked && !appliedIsCurrent ? <><label className="website-intake-confirm"><input checked={state.approved} disabled={state.busy} onChange={(event) => setState((current) => ({ ...current, approved: event.target.checked, error: '' }))} type="checkbox" /><span>I reviewed all {state.checked.preview.package.rows.length} equipment records and approve adding them as not commissioned.</span></label><div className="form-actions"><button className="core-button primary" disabled={!state.approved || state.busy} onClick={() => void apply()} type="button">Add equipment master</button></div></> : null}
          <div className="catalog-import-footer"><div><strong>{appliedIsCurrent && state.applied ? `${state.applied.activation.row_count} equipment records added in revision ${state.applied.result.version}.` : checkedIsCurrent ? 'Server checked; no records written yet.' : 'Ready for accountable setup.'}</strong><small>{appliedIsCurrent ? 'Equipment remains not commissioned until a separate safety-reviewed commissioning action exists.' : managedIdentity ? 'Check the package, then approve one atomic managed write.' : 'Download the staged package for owner review; local mode does not apply it.'}</small></div><div className="form-actions"><button className="core-button" disabled={state.busy} onClick={() => { requestRef.current += 1; setState(emptyState()) }} type="button">Clear</button>{!appliedIsCurrent && !checkedIsCurrent ? <button className="core-button primary" disabled={state.busy} onClick={() => void checkOrDownload()} type="button">{managedIdentity ? 'Check with workspace' : 'Download staged file'}</button> : null}</div></div>
        </div> : null}
        {managedIdentity ? <PlantEquipmentCommissioning key={`${managedIdentity.userId}:${managedIdentity.workspaceId}`} managedIdentity={managedIdentity} /> : null}
        {managedIdentity ? <PlantEquipmentMaintenanceStrategy key={`maintenance:${managedIdentity.userId}:${managedIdentity.workspaceId}`} managedIdentity={managedIdentity} /> : null}
      </div>
    </details>
  )
}
