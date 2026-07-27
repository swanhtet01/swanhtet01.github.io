import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  issueCommerceStockToProduction,
  type CommerceActionProof,
  type CommerceState,
} from './commerce-workspace'
import { planShopInventoryProductionAllocation, projectShopInventory } from './shop-inventory-foundation'
import { pendingProductionMaterialHandoffs, type ProductionMaterialHandoff } from './production-material-handoff'
import { loadPlantOrderWorkspace, type PlantOrderState } from './plant-order-foundation'
import { loadManagedBootstrap, requireManagedSurfaceState, type ManagedIdentity } from './managed-trial'
import { validateProductionState } from './production-workspace'

type ShopProductionHandoffProps = {
  commerce: CommerceState
  disabled: boolean
  identity: ManagedIdentity | null
  onIssue: (
    eventType: 'commerce.production_material.issued',
    commandId: string,
    proof: CommerceActionProof,
    transition: (state: CommerceState) => CommerceState | null,
  ) => Promise<void>
}

type IssueReview = {
  commandId: string
  conversionNote: string
  expectedInventoryHeadDigest: string | null
  locationPicks: string[]
  proof: CommerceActionProof
  request: ProductionMaterialHandoff
  sku: string
  stockQuantity: number
}

function uuid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ''
}

function actionProof(actor: string, request: ProductionMaterialHandoff): CommerceActionProof {
  const actionId = `ACT-${uuid().toUpperCase()}`
  return {
    actionId,
    capturedAt: new Date().toISOString(),
    actor: actor.trim() || 'Local Shop operator',
    reason: `Issue reviewed Shop stock for Plant request ${request.requestId}.`,
    evidenceReference: `PLANT-MATERIAL:${request.requestId}:${request.sourceCommandDigest}`,
  }
}

function defaultStockQuantity(request: ProductionMaterialHandoff, available: number) {
  const exactWholeUnits = request.quantityMilli % 1_000 === 0 ? request.quantityMilli / 1_000 : 1
  return String(Math.max(1, Math.min(exactWholeUnits, Math.max(available, 1))))
}

function formatPlantQuantity(request: ProductionMaterialHandoff) {
  return `${(request.quantityMilli / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${request.unit}`
}

export function ShopProductionHandoff({ commerce, disabled, identity, onIssue }: ShopProductionHandoffProps) {
  const actor = identity?.userId ?? 'Local Shop operator'
  const [execution, setExecution] = useState<PlantOrderState | null>(() => {
    if (identity || typeof localStorage === 'undefined') return null
    const snapshot = loadPlantOrderWorkspace(localStorage, 'plant:local-sample')
    return snapshot.error ? null : snapshot.state
  })
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    if (!identity) return undefined
    let active = true
    loadManagedBootstrap(identity)
      .then((bootstrap) => {
        if (!active) return
        const record = requireManagedSurfaceState(bootstrap, 'production', 'Plant')
        setExecution(record.version ? validateProductionState(record.state).orderExecution ?? null : null)
        setLoadError('')
      })
      .catch((nextError) => {
        if (!active) return
        setExecution(null)
        setLoadError(nextError instanceof Error ? nextError.message : 'Plant material requests could not be loaded.')
      })
    return () => { active = false }
  }, [identity])
  const pending = useMemo(
    () => pendingProductionMaterialHandoffs(execution, commerce),
    [commerce, execution],
  )
  const request = pending[0]
  const defaultItem = commerce.items.find((item) => item.onHand > 0) ?? commerce.items[0]
  const [openRequestId, setOpenRequestId] = useState('')
  const [sku, setSku] = useState(defaultItem?.sku ?? '')
  const [stockQuantity, setStockQuantity] = useState(request && defaultItem ? defaultStockQuantity(request, defaultItem.onHand) : '1')
  const [conversionNote, setConversionNote] = useState('')
  const [review, setReview] = useState<IssueReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  if (loadError) return <p className="form-notice warning-text" role="alert">{loadError}</p>
  if (!request) return null

  const selectedItem = commerce.items.find((item) => item.sku === sku)
  const parsedQuantity = /^\d+$/.test(stockQuantity) ? Number(stockQuantity) : Number.NaN
  const aggregateQuantityValid = Boolean(selectedItem
    && Number.isSafeInteger(parsedQuantity)
    && parsedQuantity > 0
    && parsedQuantity <= selectedItem.onHand)
  let locationAllocationReady = !commerce.inventoryFoundation
  let locationPicks: string[] = []
  if (commerce.inventoryFoundation && aggregateQuantityValid) {
    try {
      const catalogSkus = commerce.items.map((item) => item.sku).sort()
      const projection = projectShopInventory(commerce.inventoryFoundation, catalogSkus)
      const allocations = planShopInventoryProductionAllocation(commerce.inventoryFoundation, {
        sku,
        stockQuantity: parsedQuantity,
        catalogSkus,
      })
      locationPicks = allocations.map((allocation) => {
        const location = projection.locations.find((candidate) => candidate.id === allocation.locationId)
        const unit = projection.stockUnits.find((candidate) => candidate.id === allocation.stockUnitId)
        return `${location?.name ?? allocation.locationId} / ${unit?.tracking ?? 'lot'} ${unit?.trackingCode ?? allocation.stockUnitId} x ${allocation.quantity}`
      })
      locationAllocationReady = locationPicks.length > 0
    } catch {
      locationAllocationReady = false
    }
  }
  const quantityValid = aggregateQuantityValid && locationAllocationReady
  const open = openRequestId === request.requestId

  function begin() {
    const item = commerce.items.find((candidate) => candidate.onHand > 0) ?? commerce.items[0]
    setOpenRequestId(request.requestId)
    setSku(item?.sku ?? '')
    setStockQuantity(item ? defaultStockQuantity(request, item.onHand) : '1')
    setConversionNote(request.unit === 'pcs' && request.quantityMilli % 1_000 === 0
      ? 'One Shop stock unit equals one Plant piece.'
      : '')
    setReview(null)
    setError('')
    setNotice('')
  }

  function stage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quantityValid || !conversionNote.trim()) return
    const proof = actionProof(actor, request)
    const commandId = uuid()
    if (!commandId) {
      setError('Secure command identity is unavailable. Nothing was written.')
      return
    }
    setReview({
      commandId,
      conversionNote: conversionNote.trim(),
      expectedInventoryHeadDigest: commerce.inventoryFoundation?.headDigest ?? null,
      locationPicks,
      proof,
      request,
      sku,
      stockQuantity: parsedQuantity,
    })
    setNotice('Review the exact stock decrement. Nothing has been written yet.')
  }

  async function confirm() {
    if (!review) return
    setBusy(true)
    setError('')
    try {
      await onIssue(
        'commerce.production_material.issued',
        review.commandId,
        review.proof,
        (current) => (current.inventoryFoundation?.headDigest ?? null) === review.expectedInventoryHeadDigest
          ? issueCommerceStockToProduction(
            current,
            review.request,
            review.sku,
            review.stockQuantity,
            review.conversionNote,
            review.proof,
          )
          : null,
      )
      setReview(null)
      setOpenRequestId('')
      setNotice(`${review.request.requestId} issued from Shop with linked Plant evidence.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The stock issue was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  return <section aria-labelledby="production-material-handoff-title" className="catalog-onboarding-bridge">
    <span className="core-eyebrow">Plant request</span>
    <h3 id="production-material-handoff-title">{pending.length} material {pending.length === 1 ? 'issue' : 'issues'} waiting</h3>
    <p>{request.materialName} · {formatPlantQuantity(request)} · lot {request.inputLotId}. Shop remains the only stock authority.</p>
    {!open ? <button className="core-button primary" disabled={disabled || !commerce.items.some((item) => item.onHand > 0)} onClick={begin} type="button">Review stock issue</button> : null}
    {open ? <form className="core-form compact-form" onSubmit={stage}>
      <label>Shop item<select disabled={disabled || busy || Boolean(review)} onChange={(event) => { setSku(event.target.value); setStockQuantity('1') }} required value={sku}><option value="">Choose stock</option>{commerce.items.map((item) => <option disabled={item.onHand < 1} key={item.sku} value={item.sku}>{item.name} · {item.onHand} available</option>)}</select></label>
      <label>Stock units to issue<input disabled={disabled || busy || Boolean(review) || !selectedItem} inputMode="numeric" max={selectedItem?.onHand ?? 0} min="1" onChange={(event) => setStockQuantity(event.target.value)} required step="1" type="number" value={stockQuantity} /></label>
      <label>Conversion basis<input disabled={disabled || busy || Boolean(review)} maxLength={240} onChange={(event) => setConversionNote(event.target.value)} placeholder="Example: 2 bags provide the reviewed 10 kg" required value={conversionNote} /></label>
      {selectedItem ? <div className="stock-receipt-preview" role="status"><small>{request.requestId} → {request.jobId}</small><strong>{quantityValid ? `${selectedItem.onHand} → ${selectedItem.onHand - parsedQuantity} ${selectedItem.sku}${locationPicks.length ? `; pick ${locationPicks.join('; ')}` : ''}` : commerce.inventoryFoundation ? 'Choose a quantity available in managed location stock' : 'Enter available whole stock units'}</strong></div> : null}
      {review ? <div className="stock-receipt-preview" role="status"><small>Final review</small><strong>Issue {review.stockQuantity} {review.sku}; Plant quantity remains {formatPlantQuantity(review.request)}{review.locationPicks.length ? `; pick ${review.locationPicks.join('; ')}` : ''}</strong></div> : null}
      <div className="form-actions">
        <button className="core-button" disabled={busy} onClick={() => { setReview(null); setOpenRequestId(''); setNotice('') }} type="button">Cancel</button>
        {review ? <button className="core-button primary" disabled={disabled || busy} onClick={() => void confirm()} type="button">{busy ? 'Issuing…' : 'Confirm issue'}</button>
          : <button className="core-button primary" disabled={disabled || !quantityValid || !conversionNote.trim()} type="submit">Review issue</button>}
      </div>
    </form> : null}
    {notice ? <p className="form-notice" role="status">{notice}</p> : null}
    {error ? <p className="form-notice warning-text" role="alert">{error}</p> : null}
  </section>
}
