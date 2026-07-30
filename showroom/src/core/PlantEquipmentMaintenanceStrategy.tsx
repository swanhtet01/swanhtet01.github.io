import { useState } from 'react'

import {
  loadManagedBootstrap,
  sameManagedClientImportState,
  saveManagedPlantEquipmentMaintenanceStrategy,
  type ManagedIdentity,
  type ManagedPlantEquipmentMaintenanceStrategyResult,
} from './managed-trial.ts'
import { validateProductionState, type ProductionEquipmentAsset, type ProductionState } from './production-workspace.ts'

type PlantEquipmentMaintenanceStrategyProps = {
  managedIdentity: ManagedIdentity
}

type LoadedProduction = {
  state: ProductionState
  version: number
}

function commandId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure command identity is unavailable in this browser.')
  return globalThis.crypto.randomUUID()
}

function localDateTime(iso: string) {
  const value = new Date(iso)
  if (!Number.isFinite(value.getTime())) return ''
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function nextDueAtUtc(value: string) {
  if (!value) throw new Error('Choose the next preventive-maintenance due date and time.')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error('The next due date and time is invalid.')
  return parsed.toISOString()
}

export function PlantEquipmentMaintenanceStrategy({ managedIdentity }: PlantEquipmentMaintenanceStrategyProps) {
  const [loaded, setLoaded] = useState<LoadedProduction | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [maintenanceOwner, setMaintenanceOwner] = useState('')
  const [intervalDays, setIntervalDays] = useState('30')
  const [nextDueAt, setNextDueAt] = useState('')
  const [procedureReference, setProcedureReference] = useState('')
  const [safetyReference, setSafetyReference] = useState('')
  const [approval, setApproval] = useState(false)
  const [pendingCommandId, setPendingCommandId] = useState('')
  const [result, setResult] = useState<ManagedPlantEquipmentMaintenanceStrategyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const commissioned = loaded?.state.equipmentMaster?.assets
    .filter((asset) => asset.commissioningStatus === 'commissioned')
    .slice(0, 20) ?? []
  const selected = commissioned.find((asset) => asset.id === selectedId)
  const interval = Number(intervalDays)
  const canSave = Boolean(selected
    && maintenanceOwner
    && maintenanceOwner.trim() === maintenanceOwner
    && Number.isSafeInteger(interval)
    && interval >= 1
    && interval <= 3650
    && nextDueAt
    && procedureReference
    && procedureReference.trim() === procedureReference
    && safetyReference
    && safetyReference.trim() === safetyReference
    && approval
    && !busy)

  function selectAsset(asset: ProductionEquipmentAsset | undefined) {
    const strategy = asset?.maintenanceStrategy
    setSelectedId(asset?.id ?? '')
    setMaintenanceOwner(strategy?.maintenanceOwner ?? '')
    setIntervalDays(String(strategy?.intervalDays ?? 30))
    setNextDueAt(strategy ? localDateTime(strategy.nextDueAt) : '')
    setProcedureReference(strategy?.procedureReference ?? '')
    setSafetyReference(strategy?.safetyBaselineReference ?? '')
    setApproval(false)
    setPendingCommandId('')
    setResult(null)
  }

  async function loadEquipment() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const bootstrap = await loadManagedBootstrap(managedIdentity)
      const production = bootstrap.states.production
      if (!production || !Number.isSafeInteger(production.version) || production.version < 1) throw new Error('Create the Plant opening plan before saving a maintenance strategy.')
      const state = validateProductionState(production.state)
      const available = state.equipmentMaster?.assets.filter((asset) => asset.commissioningStatus === 'commissioned') ?? []
      setLoaded({ state, version: production.version })
      selectAsset(available[0])
    } catch (loadError) {
      setLoaded(null)
      setError(loadError instanceof Error ? loadError.message : 'Commissioned equipment could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  function resetApproval() {
    setApproval(false)
    setPendingCommandId('')
    setResult(null)
  }

  async function saveStrategy() {
    if (!loaded || !selected || !canSave) return
    const currentCommandId = pendingCommandId || commandId()
    const input = {
      equipmentId: selected.id,
      maintenanceOwner,
      intervalDays: interval,
      nextDueAt: nextDueAtUtc(nextDueAt),
      procedureReference,
      safetyBaselineReference: safetyReference,
    }
    setPendingCommandId(currentCommandId)
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const receipt = await saveManagedPlantEquipmentMaintenanceStrategy({
        commandId: currentCommandId,
        expectedVersion: loaded.version,
        identity: managedIdentity,
        priorState: loaded.state,
        input,
      })
      const bootstrap = await loadManagedBootstrap(managedIdentity)
      const production = bootstrap.states.production
      if (!production
        || production.version < receipt.result.version
        || production.updated_by !== managedIdentity.userId
        || !sameManagedClientImportState(production.state, receipt.result.state)) throw new Error('The strategy was accepted but its durable Production revision could not be confirmed. Retry keeps the same command identity.')
      const nextState = validateProductionState(production.state)
      const nextAsset = nextState.equipmentMaster?.assets.find((asset) => asset.id === selected.id)
      setLoaded({ state: nextState, version: production.version })
      selectAsset(nextAsset)
      setResult(receipt)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No maintenance strategy was saved.')
    } finally {
      setBusy(false)
    }
  }

  return <section aria-label="Plant preventive maintenance strategy" className="catalog-import-checklist">
    <div><span className="core-eyebrow">Preventive maintenance</span><strong>Plan one commissioned asset</strong><small>Records accountable maintenance master data only. It does not start work, create a work order, control equipment, or connect telemetry.</small></div>
    {!loaded ? <div className="form-actions"><button className="core-button" disabled={busy} onClick={() => void loadEquipment()} type="button">{busy ? 'Loading...' : 'Load commissioned equipment'}</button></div> : <>
      <div className="form-grid">
        <label>Equipment<select disabled={busy || !commissioned.length} onChange={(event) => selectAsset(commissioned.find((asset) => asset.id === event.target.value))} value={selectedId}><option value="">{commissioned.length ? 'Choose equipment' : 'No commissioned equipment'}</option>{commissioned.map((asset) => <option key={asset.id} value={asset.id}>{asset.id} / {asset.name} / {asset.maintenanceStrategy ? `R${asset.maintenanceStrategy.revision}` : 'No strategy'}</option>)}</select></label>
        <label>Maintenance owner<input disabled={busy || !selected} maxLength={120} onChange={(event) => { setMaintenanceOwner(event.target.value); resetApproval() }} placeholder="Maintenance lead" value={maintenanceOwner} /></label>
        <label>Interval days<input disabled={busy || !selected} max={3650} min={1} onChange={(event) => { setIntervalDays(event.target.value); resetApproval() }} type="number" value={intervalDays} /></label>
        <label>Next due at<input disabled={busy || !selected} onChange={(event) => { setNextDueAt(event.target.value); resetApproval() }} type="datetime-local" value={nextDueAt} /></label>
        <label>Procedure reference<input disabled={busy || !selected} maxLength={240} onChange={(event) => { setProcedureReference(event.target.value); resetApproval() }} placeholder="SOP-PM-001-R1" value={procedureReference} /></label>
        <label>Safety baseline reference<input disabled={busy || !selected} maxLength={240} onChange={(event) => { setSafetyReference(event.target.value); resetApproval() }} placeholder="SAFETY-PM-001-R1" value={safetyReference} /></label>
      </div>
      {selected ? <p className="catalog-import-boundary">{selected.name} / {selected.workCentreId}. Saving creates strategy revision {(selected.maintenanceStrategy?.revision ?? 0) + 1}; maintenance execution remains separate.</p> : null}
      {selected ? <label className="website-intake-confirm"><input checked={approval} disabled={busy} onChange={(event) => setApproval(event.target.checked)} type="checkbox" /><span>I reviewed this one asset, accountable owner, interval, due date, procedure, and safety evidence.</span></label> : null}
      <div className="form-actions"><button className="core-button" disabled={busy} onClick={() => void loadEquipment()} type="button">Refresh</button><button className="core-button primary" disabled={!canSave} onClick={() => void saveStrategy()} type="button">{busy ? 'Saving...' : 'Save strategy'}</button></div>
    </>}
    {result ? <p className="form-notice" role="status">{result.maintenance_strategy.equipment_id} maintenance strategy is saved in revision {result.result.version}. No maintenance work or equipment action started.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>
}
