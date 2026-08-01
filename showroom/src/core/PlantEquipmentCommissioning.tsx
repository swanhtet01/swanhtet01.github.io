import { useState } from 'react'

import {
  commissionManagedPlantEquipment,
  loadManagedBootstrap,
  sameManagedClientImportState,
  type ManagedIdentity,
  type ManagedPlantEquipmentCommissioningResult,
} from './managed-trial.ts'
import {
  validateProductionState,
  type ProductionMachineState,
  type ProductionState,
} from './production-workspace.ts'

type PlantEquipmentCommissioningProps = {
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

function installedAtUtc(value: string) {
  if (!value) throw new Error('Choose the recorded installation date and time.')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error('The installation date and time is invalid.')
  return parsed.toISOString()
}

export function PlantEquipmentCommissioning({ managedIdentity }: PlantEquipmentCommissioningProps) {
  const [loaded, setLoaded] = useState<LoadedProduction | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [installedAt, setInstalledAt] = useState('')
  const [initialState, setInitialState] = useState<ProductionMachineState>('stopped')
  const [safetyReference, setSafetyReference] = useState('')
  const [approval, setApproval] = useState(false)
  const [pendingCommandId, setPendingCommandId] = useState('')
  const [result, setResult] = useState<ManagedPlantEquipmentCommissioningResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const uncommissioned = loaded?.state.equipmentMaster?.assets
    .filter((asset) => asset.commissioningStatus === 'not_commissioned')
    .slice(0, 20) ?? []
  const selected = uncommissioned.find((asset) => asset.id === selectedId)
  const canCommission = Boolean(selected && installedAt && safetyReference.trim() === safetyReference && safetyReference && approval && !busy)

  async function loadEquipment() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const bootstrap = await loadManagedBootstrap(managedIdentity)
      const production = bootstrap.states.production
      if (!production || !Number.isSafeInteger(production.version) || production.version < 1) throw new Error('Create the Plant opening plan before commissioning equipment.')
      const state = validateProductionState(production.state)
      const available = state.equipmentMaster?.assets.filter((asset) => asset.commissioningStatus === 'not_commissioned') ?? []
      setLoaded({ state, version: production.version })
      setSelectedId(available[0]?.id ?? '')
      setApproval(false)
      setPendingCommandId('')
    } catch (loadError) {
      setLoaded(null)
      setError(loadError instanceof Error ? loadError.message : 'Equipment could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  async function commission() {
    if (!loaded || !selected || !canCommission) return
    const currentCommandId = pendingCommandId || commandId()
    const input = {
      equipmentId: selected.id,
      installedAt: installedAtUtc(installedAt),
      initialState,
      safetyBaselineReference: safetyReference,
    }
    setPendingCommandId(currentCommandId)
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const receipt = await commissionManagedPlantEquipment({
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
        || !sameManagedClientImportState(production.state, receipt.result.state)) throw new Error('Commissioning was accepted but its durable Production revision could not be confirmed. Retry keeps the same command identity.')
      const nextState = validateProductionState(production.state)
      const nextAvailable = nextState.equipmentMaster?.assets.filter((asset) => asset.commissioningStatus === 'not_commissioned') ?? []
      setLoaded({ state: nextState, version: production.version })
      setSelectedId(nextAvailable[0]?.id ?? '')
      setInstalledAt('')
      setSafetyReference('')
      setApproval(false)
      setPendingCommandId('')
      setResult(receipt)
    } catch (commissionError) {
      setError(commissionError instanceof Error ? commissionError.message : 'No equipment was commissioned.')
    } finally {
      setBusy(false)
    }
  }

  return <section aria-label="Plant equipment commissioning" className="catalog-import-checklist">
    <div><span className="core-eyebrow">Commissioning</span><strong>Start one reviewed asset</strong><small>Creates runtime identity from one master record. It does not send a machine command or connect telemetry.</small></div>
    {!loaded ? <div className="form-actions"><button className="core-button" disabled={busy} onClick={() => void loadEquipment()} type="button">{busy ? 'Loading...' : 'Load equipment'}</button></div> : <>
      <div className="form-grid">
        <label>Equipment<select disabled={busy || !uncommissioned.length} onChange={(event) => { setSelectedId(event.target.value); setApproval(false); setPendingCommandId(''); setResult(null) }} value={selectedId}><option value="">{uncommissioned.length ? 'Choose equipment' : 'No equipment waiting'}</option>{uncommissioned.map((asset) => <option key={asset.id} value={asset.id}>{asset.id} / {asset.name} / {asset.workCentreId}</option>)}</select></label>
        <label>Installed at<input disabled={busy || !selected} onChange={(event) => { setInstalledAt(event.target.value); setApproval(false); setPendingCommandId(''); setResult(null) }} type="datetime-local" value={installedAt} /></label>
        <label>Initial observed state<select disabled={busy || !selected} onChange={(event) => { setInitialState(event.target.value as ProductionMachineState); setApproval(false); setPendingCommandId(''); setResult(null) }} value={initialState}><option value="stopped">Stopped</option><option value="attention">Needs attention</option><option value="running">Running</option></select></label>
        <label>Safety baseline reference<input disabled={busy || !selected} maxLength={240} onChange={(event) => { setSafetyReference(event.target.value); setApproval(false); setPendingCommandId(''); setResult(null) }} placeholder="CHECKLIST-EQ-001-R1" value={safetyReference} /></label>
      </div>
      {selected ? <p className="catalog-import-boundary">{selected.name} / {selected.workCentreId} / {selected.criticality}. The initial state is an operator observation, not telemetry.</p> : null}
      {selected ? <label className="website-intake-confirm"><input checked={approval} disabled={busy} onChange={(event) => setApproval(event.target.checked)} type="checkbox" /><span>I reviewed this one asset, its installation time, initial observation, and safety-baseline evidence.</span></label> : null}
      <div className="form-actions"><button className="core-button" disabled={busy} onClick={() => void loadEquipment()} type="button">Refresh</button><button className="core-button primary" disabled={!canCommission} onClick={() => void commission()} type="button">{busy ? 'Commissioning...' : 'Commission 1 equipment'}</button></div>
    </>}
    {result ? <p className="form-notice" role="status">{result.commissioning.equipment_id} is commissioned in revision {result.result.version}. No equipment command or telemetry connection occurred.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>
}
