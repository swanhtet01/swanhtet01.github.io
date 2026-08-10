import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  issueCommerceStockToProduction,
  returnCommerceStockFromProduction,
  type CommerceActionProof,
  type CommerceState,
} from './commerce-workspace'
import { planShopInventoryProductionAllocation, projectShopInventory } from './shop-inventory-foundation'
import { productionMaterialHandoffs, type ProductionMaterialHandoff } from './production-material-handoff'
import {
  PLANT_ORDER_WORKSPACE_UPDATED_EVENT,
  loadPlantOrderWorkspace,
  plantOrderStorageKey,
  type PlantOrderState,
} from './plant-order-foundation'
import { loadManagedBootstrap, requireManagedSurfaceState, type ManagedIdentity } from './managed-trial'
import { loadProductionWorkspace, PRODUCTION_KEY, validateProductionState } from './production-workspace'
import { productionOrderPortfolioEntries } from './production-order-portfolio'

type ShopProductionHandoffProps = {
  commerce: CommerceState
  disabled: boolean
  identity: ManagedIdentity | null
  onIssue: (
    eventType: 'commerce.production_material.issued' | 'commerce.production_material.returned',
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

function productionReadyStock(item: CommerceState['items'][number]) {
  return Math.max(item.onHand - item.reorderAt, 0)
}

function requiredMappedStockQuantity(request: ProductionMaterialHandoff) {
  if (!request.shopSupply) return null
  return Number(
    (BigInt(request.quantityMilli) + BigInt(request.shopSupply.materialQuantityMilliPerStockUnit) - 1n)
    / BigInt(request.shopSupply.materialQuantityMilliPerStockUnit),
  )
}

function defaultStockQuantity(request: ProductionMaterialHandoff, available: number) {
  const mappedQuantity = requiredMappedStockQuantity(request)
  if (mappedQuantity !== null) return String(mappedQuantity)
  const exactWholeUnits = request.quantityMilli % 1_000 === 0 ? request.quantityMilli / 1_000 : 1
  return String(Math.max(1, Math.min(exactWholeUnits, Math.max(available, 1))))
}

type MaterialReturnOption = {
  key: string
  expectedInventoryHeadDigest: string
  issueProductionQuantityMilli: number
  issueStockQuantity: number
  locationId: string
  locationLabel: string
  materialName: string
  maxStockQuantity: number
  productionUnit: string
  requestId: string
  sku: string
  sourceIssueActionId: string
  stockUnitId: string
}

type ReturnReview = {
  commandId: string
  input: {
    sourceIssueActionId: string
    productionQuantityMilli: number
    stockQuantity: number
    stockUnitId: string
    locationId: string
    expectedInventoryHeadDigest: string
  }
  option: MaterialReturnOption
  proof: CommerceActionProof
}

function defaultConversionNote(request: ProductionMaterialHandoff, available: number) {
  const mappedQuantity = requiredMappedStockQuantity(request)
  if (request.shopSupply && mappedQuantity !== null) {
    return `Reviewed Plant mapping ${request.shopSupply.sku}: ${mappedQuantity} Shop stock ${mappedQuantity === 1 ? 'unit provides' : 'units provide'} ${formatPlantQuantity(request)}.`
  }
  const exactWholeUnits = request.quantityMilli % 1_000 === 0 ? request.quantityMilli / 1_000 : 0
  return request.unit === 'pcs' && exactWholeUnits > 0 && exactWholeUnits <= available
    ? 'One Shop stock unit equals one Plant piece.'
    : ''
}

function formatPlantQuantity(request: ProductionMaterialHandoff) {
  return `${(request.quantityMilli / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${request.unit}`
}

function formatMilli(value: number) {
  return (value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function materialReturnOptions(commerce: CommerceState, handoffs: ProductionMaterialHandoff[]) {
  const foundation = commerce.inventoryFoundation
  if (!foundation) return []
  const projection = projectShopInventory(foundation, commerce.items.map((item) => item.sku).sort())
  return handoffs.flatMap((handoff): MaterialReturnOption[] => {
    const movement = handoff.fulfilledBy
    if (!movement) return []
    const source = foundation.commands.find((command) => command.payload.kind === 'production_issue'
      && command.payload.proof.actionId === movement.actionId)?.payload
    if (!source || source.kind !== 'production_issue') return []
    const returns = foundation.commands.flatMap((command) => command.payload.kind === 'production_return'
      && command.payload.productionIssueId === source.id ? [command.payload] : [])
    return source.allocations.flatMap((allocation): MaterialReturnOption[] => {
      const returned = returns
        .filter((entry) => entry.stockUnitId === allocation.stockUnitId && entry.locationId === allocation.locationId)
        .reduce((total, entry) => total + entry.stockQuantity, 0)
      const maxStockQuantity = allocation.quantity - returned
      if (maxStockQuantity < 1) return []
      const location = projection.locations.find((candidate) => candidate.id === allocation.locationId)
      const unit = projection.stockUnits.find((candidate) => candidate.id === allocation.stockUnitId)
      return [{
        key: `${source.id}|${allocation.stockUnitId}|${allocation.locationId}`,
        expectedInventoryHeadDigest: foundation.headDigest,
        issueProductionQuantityMilli: source.productionQuantityMilli,
        issueStockQuantity: source.stockQuantity,
        locationId: allocation.locationId,
        locationLabel: `${location?.name ?? allocation.locationId} / ${unit?.trackingCode ?? allocation.stockUnitId}`,
        materialName: handoff.materialName,
        maxStockQuantity,
        productionUnit: source.productionUnit,
        requestId: source.productionRequestId,
        sku: source.sku,
        sourceIssueActionId: movement.actionId,
        stockUnitId: allocation.stockUnitId,
      }]
    })
  })
}

function returnProductionQuantity(option: MaterialReturnOption, stockQuantity: number) {
  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 1 || stockQuantity > option.maxStockQuantity) return null
  const numerator = BigInt(stockQuantity) * BigInt(option.issueProductionQuantityMilli)
  const denominator = BigInt(option.issueStockQuantity)
  if (numerator % denominator !== 0n) return null
  const quantity = numerator / denominator
  return quantity <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(quantity) : null
}

function returnActionProof(actor: string, option: MaterialReturnOption): CommerceActionProof {
  return {
    actionId: `ACT-${uuid().toUpperCase()}`,
    capturedAt: new Date().toISOString(),
    actor: actor.trim() || 'Local Shop operator',
    reason: `Return reviewed unused stock from Plant request ${option.requestId}.`,
    evidenceReference: `PLANT-MATERIAL-RETURN:${option.requestId}:${option.sourceIssueActionId}`,
  }
}

const LOCAL_PLANT_SCOPE = 'plant:local-sample'
const LEGACY_LOCAL_PLANT_SCOPE = 'plant:'

function loadLocalPlantExecutions() {
  const production = loadProductionWorkspace()
  const entries = productionOrderPortfolioEntries(production.state)
  if (entries.length) return { executions: entries.map((entry) => entry.execution), error: production.error }
  const snapshot = loadPlantOrderWorkspace(localStorage, LOCAL_PLANT_SCOPE)
  if (snapshot.source !== 'empty') return { executions: snapshot.error ? [] : [snapshot.state], error: snapshot.error }
  const legacy = loadPlantOrderWorkspace(localStorage, LEGACY_LOCAL_PLANT_SCOPE)
  return { executions: legacy.error ? [] : [legacy.state], error: legacy.error }
}

function ProductionMaterialReturn({
  actor,
  commerce,
  disabled,
  handoffs,
  onIssue,
}: {
  actor: string
  commerce: CommerceState
  disabled: boolean
  handoffs: ProductionMaterialHandoff[]
  onIssue: ShopProductionHandoffProps['onIssue']
}) {
  const options = useMemo(() => {
    try {
      return materialReturnOptions(commerce, handoffs)
    } catch {
      return []
    }
  }, [commerce, handoffs])
  const [open, setOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [stockQuantity, setStockQuantity] = useState('1')
  const [review, setReview] = useState<ReturnReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selected = options.find((option) => option.key === selectedKey) ?? options[0]
  const parsedStockQuantity = /^\d+$/.test(stockQuantity) ? Number(stockQuantity) : Number.NaN
  const productionQuantityMilli = selected ? returnProductionQuantity(selected, parsedStockQuantity) : null
  if (!selected) return null

  function stage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || productionQuantityMilli === null) return
    const proof = returnActionProof(actor, selected)
    const commandId = uuid()
    if (!commandId || !proof.actionId.slice(4)) {
      setError('Secure command identity is unavailable. Nothing was written.')
      return
    }
    setReview({
      commandId,
      input: {
        sourceIssueActionId: selected.sourceIssueActionId,
        productionQuantityMilli,
        stockQuantity: parsedStockQuantity,
        stockUnitId: selected.stockUnitId,
        locationId: selected.locationId,
        expectedInventoryHeadDigest: selected.expectedInventoryHeadDigest,
      },
      option: selected,
      proof,
    })
    setError('')
    setNotice('Review the exact unused quantity and destination. Nothing has been written yet.')
  }

  async function confirm() {
    if (!review) return
    setBusy(true)
    setError('')
    try {
      await onIssue(
        'commerce.production_material.returned',
        review.commandId,
        review.proof,
        (current) => returnCommerceStockFromProduction(current, review.input, review.proof),
      )
      setReview(null)
      setOpen(false)
      setNotice(`${review.input.stockQuantity} ${review.option.sku} returned to ${review.option.locationLabel}.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The material return was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  return <section aria-labelledby="production-material-return-title" className="catalog-onboarding-bridge">
    <span className="core-eyebrow">Unused Plant material</span>
    <h3 id="production-material-return-title">Return stock to its original location</h3>
    <p>{selected.materialName} · {selected.maxStockQuantity} {selected.sku} available to return from {selected.requestId}.</p>
    {!open ? <button className="core-button" disabled={disabled} onClick={() => { setOpen(true); setNotice(''); setError('') }} type="button">Return unused stock</button> : null}
    {open ? <form className="core-form compact-form" onSubmit={stage}>
      <label>Original lot and location<select disabled={disabled || busy || Boolean(review)} onChange={(event) => { setSelectedKey(event.target.value); setStockQuantity('1') }} value={selected.key}>{options.map((option) => <option key={option.key} value={option.key}>{option.locationLabel} · {option.maxStockQuantity} available</option>)}</select></label>
      <label>Whole stock units to return<input disabled={disabled || busy || Boolean(review)} inputMode="numeric" max={selected.maxStockQuantity} min="1" onChange={(event) => setStockQuantity(event.target.value)} required step="1" type="number" value={stockQuantity} /></label>
      <div className="stock-receipt-preview" role="status"><small>{selected.requestId} → {selected.locationLabel}</small><strong>{productionQuantityMilli === null ? 'Choose a whole quantity that preserves the reviewed conversion' : `${parsedStockQuantity} ${selected.sku} = ${(productionQuantityMilli / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${selected.productionUnit}`}</strong></div>
      {review ? <div className="stock-receipt-preview" role="status"><small>Final review</small><strong>Return {review.input.stockQuantity} {review.option.sku} to {review.option.locationLabel}</strong></div> : null}
      <div className="form-actions">
        <button className="core-button" disabled={busy} onClick={() => { setReview(null); setOpen(false); setNotice('') }} type="button">Cancel</button>
        {review ? <button className="core-button primary" disabled={disabled || busy} onClick={() => void confirm()} type="button">{busy ? 'Returning…' : 'Confirm return'}</button>
          : <button className="core-button primary" disabled={disabled || productionQuantityMilli === null} type="submit">Review return</button>}
      </div>
    </form> : null}
    {notice ? <p className="form-notice" role="status">{notice}</p> : null}
    {error ? <p className="form-notice warning-text" role="alert">{error}</p> : null}
  </section>
}

export function ShopProductionHandoff({ commerce, disabled, identity, onIssue }: ShopProductionHandoffProps) {
  const actor = identity?.userId ?? 'Local Shop operator'
  const [executions, setExecutions] = useState<PlantOrderState[]>(() => {
    if (identity || typeof localStorage === 'undefined') return []
    return loadLocalPlantExecutions().executions
  })
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    if (identity || typeof localStorage === 'undefined') return undefined
    const refresh = () => {
      const snapshot = loadLocalPlantExecutions()
      setExecutions(snapshot.executions)
      setLoadError(snapshot.error)
    }
    const handleWorkspaceUpdate = (event: Event) => {
      const eventScope = event instanceof CustomEvent && typeof event.detail?.scope === 'string'
        ? event.detail.scope
        : ''
      if (!eventScope || eventScope === LOCAL_PLANT_SCOPE) refresh()
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PRODUCTION_KEY
        || event.key === plantOrderStorageKey(LOCAL_PLANT_SCOPE)
        || event.key === plantOrderStorageKey(LEGACY_LOCAL_PLANT_SCOPE)) refresh()
    }
    refresh()
    window.addEventListener(PLANT_ORDER_WORKSPACE_UPDATED_EVENT, handleWorkspaceUpdate)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(PLANT_ORDER_WORKSPACE_UPDATED_EVENT, handleWorkspaceUpdate)
      window.removeEventListener('storage', handleStorage)
    }
  }, [identity])
  useEffect(() => {
    if (!identity) return undefined
    let active = true
    loadManagedBootstrap(identity)
      .then((bootstrap) => {
        if (!active) return
        const record = requireManagedSurfaceState(bootstrap, 'production', 'Plant')
        setExecutions(record.version ? productionOrderPortfolioEntries(validateProductionState(record.state)).map((entry) => entry.execution) : [])
        setLoadError('')
      })
      .catch((nextError) => {
        if (!active) return
        setExecutions([])
        setLoadError(nextError instanceof Error ? nextError.message : 'Plant material requests could not be loaded.')
      })
    return () => { active = false }
  }, [identity])
  const handoffs = useMemo(
    () => executions.flatMap((execution) => productionMaterialHandoffs(execution, commerce)),
    [commerce, executions],
  )
  const pending = handoffs.filter((handoff) => !handoff.fulfilledBy)
  const request = pending[0]
  const mappedItem = request?.shopSupply
    ? commerce.items.find((item) => item.sku === request.shopSupply?.sku)
    : undefined
  const defaultItem = mappedItem
    ?? (request?.substitutionApprovalId
      ? commerce.items.find((item) => productionReadyStock(item) > 0) ?? commerce.items[0]
      : undefined)
  const [openRequestId, setOpenRequestId] = useState('')
  const [sku, setSku] = useState(defaultItem?.sku ?? '')
  const [stockQuantity, setStockQuantity] = useState(request && defaultItem ? defaultStockQuantity(request, productionReadyStock(defaultItem)) : '1')
  const [conversionNote, setConversionNote] = useState('')
  const [review, setReview] = useState<IssueReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  if (loadError) return <p className="form-notice warning-text" role="alert">{loadError}</p>
  if (!request) return <ProductionMaterialReturn actor={actor} commerce={commerce} disabled={disabled} handoffs={handoffs} onIssue={onIssue} />

  const selectedItem = commerce.items.find((item) => item.sku === sku)
  const mappedStockQuantity = requiredMappedStockQuantity(request)
  const parsedQuantity = /^\d+$/.test(stockQuantity) ? Number(stockQuantity) : Number.NaN
  const aggregateQuantityValid = Boolean(selectedItem
    && Number.isSafeInteger(parsedQuantity)
    && parsedQuantity > 0
    && parsedQuantity <= productionReadyStock(selectedItem)
    && (request.shopSupply
      ? selectedItem.sku === request.shopSupply.sku && parsedQuantity === mappedStockQuantity
      : Boolean(request.substitutionApprovalId)))
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
  const requestSupplyReady = request.shopSupply
    ? Boolean(mappedItem && mappedStockQuantity && mappedStockQuantity <= productionReadyStock(mappedItem))
    : Boolean(request.substitutionApprovalId && commerce.items.some((item) => productionReadyStock(item) > 0))

  function begin() {
    const item = request.shopSupply
      ? commerce.items.find((candidate) => candidate.sku === request.shopSupply?.sku)
      : commerce.items.find((candidate) => productionReadyStock(candidate) > 0) ?? commerce.items[0]
    setOpenRequestId(request.requestId)
    setSku(item?.sku ?? '')
    setStockQuantity(item ? defaultStockQuantity(request, productionReadyStock(item)) : '1')
    setConversionNote(item ? defaultConversionNote(request, productionReadyStock(item)) : '')
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

  return <><section aria-labelledby="production-material-handoff-title" className="catalog-onboarding-bridge">
    <span className="core-eyebrow">Plant request</span>
    <h3 id="production-material-handoff-title">{pending.length} material {pending.length === 1 ? 'issue' : 'issues'} waiting</h3>
    <p>{request.materialName} · {formatPlantQuantity(request)} · lot {request.inputLotId}. Shop remains the only stock authority.</p>
    {request.substitution ? <div className="stock-receipt-preview" role="status"><small>Approved substitute · {request.substitution.approvalId}</small><strong>{request.materialId} replaces {request.substitution.originalMaterialId}; issuing {formatPlantQuantity(request)} credits {formatMilli(request.substitution.originalQuantityMilli)} {request.substitution.originalUnit} of the unchanged BOM.</strong><span>{request.substitution.technicalBasis}</span></div> : null}
    {!request.shopSupply && !request.substitutionApprovalId ? <p className="form-notice warning-text" role="alert">Map this material to a Shop SKU in the reviewed Plant plan before issuing stock.</p> : null}
    {request.shopSupply && !mappedItem ? <p className="form-notice warning-text" role="alert">The reviewed Shop SKU {request.shopSupply.sku} is not in this catalog. Revise the Plant plan or catalog first.</p> : null}
    {request.shopSupply && mappedItem && !requestSupplyReady ? <p className="form-notice warning-text" role="alert">{request.shopSupply.sku} does not have enough production-ready stock above its reorder reserve.</p> : null}
    {!open && (request.shopSupply || request.substitutionApprovalId) ? <button className="core-button primary" disabled={disabled || !requestSupplyReady} onClick={begin} type="button">Review stock issue</button> : null}
    {open ? <form className="core-form compact-form" onSubmit={stage}>
      <label>Shop item<select data-production-mapped-sku={request.shopSupply?.sku} disabled={disabled || busy || Boolean(review) || Boolean(request.shopSupply)} onChange={(event) => { const nextSku = event.target.value; const nextItem = commerce.items.find((item) => item.sku === nextSku); setSku(nextSku); setStockQuantity(nextItem ? defaultStockQuantity(request, productionReadyStock(nextItem)) : '1'); setConversionNote(nextItem ? defaultConversionNote(request, productionReadyStock(nextItem)) : '') }} required value={sku}><option value="">Choose stock</option>{commerce.items.map((item) => <option disabled={productionReadyStock(item) < 1} key={item.sku} value={item.sku}>{item.name} · {item.sku} · {productionReadyStock(item)} production-ready · {item.reorderAt} protected</option>)}</select></label>
      <label>Stock units to issue<input disabled={disabled || busy || Boolean(review) || !selectedItem || Boolean(request.shopSupply)} inputMode="numeric" max={selectedItem ? productionReadyStock(selectedItem) : 0} min="1" onChange={(event) => setStockQuantity(event.target.value)} required step="1" type="number" value={stockQuantity} /></label>
      <label>Conversion basis<input disabled={disabled || busy || Boolean(review) || Boolean(request.shopSupply)} maxLength={240} onChange={(event) => setConversionNote(event.target.value)} placeholder="Example: 2 bags provide the reviewed 10 kg" required value={conversionNote} /></label>
      {selectedItem ? <div className="stock-receipt-preview" role="status"><small>{request.shopSupply ? 'Reviewed Plant mapping' : 'Approved substitute stock mapping'} · {request.requestId} → {request.jobId}</small><strong>{quantityValid ? `${selectedItem.onHand} → ${selectedItem.onHand - parsedQuantity} ${selectedItem.sku}; ${selectedItem.reorderAt} reorder reserve protected${locationPicks.length ? `; pick ${locationPicks.join('; ')}` : ''}` : request.shopSupply ? 'Reviewed mapping is unavailable above the Shop reorder reserve' : commerce.inventoryFoundation ? 'Choose a quantity available in managed location stock' : 'Enter production-ready whole stock units'}</strong></div> : null}
      {review ? <div className="stock-receipt-preview" role="status"><small>Final review</small><strong>Issue {review.stockQuantity} {review.sku}; Plant quantity remains {formatPlantQuantity(review.request)}{review.request.substitution ? `; original BOM credit ${formatMilli(review.request.substitution.originalQuantityMilli)} ${review.request.substitution.originalUnit}` : ''}{review.locationPicks.length ? `; pick ${review.locationPicks.join('; ')}` : ''}</strong></div> : null}
      <div className="form-actions">
        <button className="core-button" disabled={busy} onClick={() => { setReview(null); setOpenRequestId(''); setNotice('') }} type="button">Cancel</button>
        {review ? <button className="core-button primary" disabled={disabled || busy} onClick={() => void confirm()} type="button">{busy ? 'Issuing…' : 'Confirm issue'}</button>
          : <button className="core-button primary" disabled={disabled || !quantityValid || !conversionNote.trim()} type="submit">Review issue</button>}
      </div>
    </form> : null}
    {notice ? <p className="form-notice" role="status">{notice}</p> : null}
    {error ? <p className="form-notice warning-text" role="alert">{error}</p> : null}
  </section><ProductionMaterialReturn actor={actor} commerce={commerce} disabled={disabled} handoffs={handoffs} onIssue={onIssue} /></>
}
