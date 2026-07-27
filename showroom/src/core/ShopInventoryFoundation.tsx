import { type FormEvent, useMemo, useState } from 'react'

import {
  applyShopInventoryImport,
  buildShopInventoryImportPackage,
  createEmptyShopInventoryState,
  projectShopInventory,
  shopInventoryEvidenceDigest,
  transferShopInventory,
  type ShopInventoryImportPackage,
  type ShopInventoryProof,
} from './shop-inventory-foundation'
import { ShopProductionHandoff } from './ShopProductionHandoff'
import type { CommerceActionProof, CommerceState } from './commerce-workspace'
import type { ManagedIdentity } from './managed-trial'


type ShopInventoryFoundationProps = {
  actor: string
  commerce: CommerceState
  disabled: boolean
  identity: ManagedIdentity | null
  onIssue: (
    eventType: 'commerce.production_material.issued',
    commandId: string,
    proof: CommerceActionProof,
    transition: (state: CommerceState) => CommerceState | null,
  ) => Promise<void>
  onInventory: (
    eventType: 'commerce.inventory.initialized' | 'commerce.inventory.transferred',
    commandId: string,
    proof: CommerceActionProof,
    transition: (state: CommerceState) => CommerceState | null,
  ) => Promise<void>
  scope: string
}

type SetupReview = {
  package: ShopInventoryImportPackage
  proof: ShopInventoryProof
  expectedHeadDigest: string
}

type TransferReview = {
  transferId: string
  stockUnitId: string
  fromLocationId: string
  toLocationId: string
  quantity: number
  proof: ShopInventoryProof
  expectedHeadDigest: string
}

function commandId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().toUpperCase()
    : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return `${prefix}-${random}`
}

function actionProof(actor: string, label: string): ShopInventoryProof {
  const actionId = commandId('ACT')
  return {
    actionId,
    capturedAt: new Date().toISOString(),
    actor: actor.trim() || 'Local Shop operator',
    reason: `Review and record ${label}.`,
    evidenceReference: `SHOP-INVENTORY:${actionId}`,
  }
}

export function ShopInventoryFoundation({ actor, commerce, disabled, identity, onInventory, onIssue, scope }: ShopInventoryFoundationProps) {
  const catalog = commerce.items
  const catalogSkus = useMemo(
    () => [...new Set(catalog.map((item) => item.sku))].sort(),
    [catalog],
  )
  const state = commerce.inventoryFoundation ?? createEmptyShopInventoryState()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupDraft, setSetupDraft] = useState({ main: 'Main store', branch: 'Branch', client: 'Walk-in customer', vendor: 'Opening stock source' })
  const [setupReview, setSetupReview] = useState<SetupReview | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDraft, setTransferDraft] = useState({ balanceKey: '', quantity: '1' })
  const [transferReview, setTransferReview] = useState<TransferReview | null>(null)

  const projection = useMemo(
    () => projectShopInventory(state, catalogSkus),
    [catalogSkus, state],
  )
  const catalogBySku = useMemo(() => new Map(catalog.map((item) => [item.sku, item])), [catalog])
  const balanceOptions = projection.balances.filter((row) => row.availableToPromise > 0)
  const selectedBalance = balanceOptions.find((row) => `${row.stockUnitId}|${row.locationId}` === transferDraft.balanceKey)
  const destination = selectedBalance
    ? projection.locations.find((location) => location.id !== selectedBalance.locationId)
    : undefined
  const transferQuantity = /^\d+$/.test(transferDraft.quantity) ? Number(transferDraft.quantity) : Number.NaN
  const transferQuantityValid = selectedBalance
    && destination
    && Number.isSafeInteger(transferQuantity)
    && transferQuantity >= 1
    && transferQuantity <= selectedBalance.availableToPromise
  const locationTotals = projection.locations.map((location) => ({
    ...location,
    onHand: projection.balances.filter((row) => row.locationId === location.id).reduce((sum, row) => sum + row.onHand, 0),
    reserved: projection.balances.filter((row) => row.locationId === location.id).reduce((sum, row) => sum + row.reserved, 0),
    availableToPromise: projection.balances.filter((row) => row.locationId === location.id).reduce((sum, row) => sum + row.availableToPromise, 0),
  }))
  const inventoryDrift = projection.stockUnits.some((unit) => {
    const locationTotal = projection.balances.filter((row) => row.sku === unit.sku).reduce((sum, row) => sum + row.onHand, 0)
    return locationTotal !== catalogBySku.get(unit.sku)?.onHand
  })

  function reviewSetup(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const stockItems = catalog.filter((item) => Number.isSafeInteger(item.onHand) && item.onHand > 0)
      if (!stockItems.length) throw new Error('Receive or import positive stock before setting up locations.')
      if (stockItems.length > 8) throw new Error('Location setup v1 supports eight stocked catalog items. Reduce the reviewed opening scope before setup.')
      const importId = commandId('IMP')
      const clients = [{ id: 'CLI-DEFAULT-001', name: setupDraft.client.trim() }]
      const vendors = [{ id: 'VEN-OPENING-001', name: setupDraft.vendor.trim() }]
      const locations = [
        { id: 'LOC-BRANCH', name: setupDraft.branch.trim() },
        { id: 'LOC-MAIN', name: setupDraft.main.trim() },
      ]
      const stockUnits = stockItems.map((item, index) => ({
        id: `LOT-OPENING-${String(index + 1).padStart(3, '0')}`,
        sku: item.sku,
        tracking: 'lot' as const,
        trackingCode: `OPENING-${String(index + 1).padStart(3, '0')}`,
      }))
      const openings = stockItems.map((item, index) => ({
        stockUnitId: stockUnits[index].id,
        locationId: 'LOC-MAIN',
        vendorId: 'VEN-OPENING-001',
        quantity: item.onHand,
      }))
      const importPackage = buildShopInventoryImportPackage({
        importId,
        sourceDigest: shopInventoryEvidenceDigest({ scope, catalog: stockItems.map(({ sku, onHand }) => ({ sku, onHand })), clients, vendors, locations }),
        catalogSkus,
        clients,
        vendors,
        locations,
        stockUnits,
        openings,
      })
      setSetupReview({ package: importPackage, proof: actionProof(actor, 'the two-location opening import'), expectedHeadDigest: state.headDigest })
      setNotice('Review the two locations and opening total. Nothing has been written yet.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Location setup could not be prepared.')
    }
  }

  async function confirmSetup() {
    if (!setupReview) return
    setBusy(true)
    setError('')
    try {
      await onInventory(
        'commerce.inventory.initialized',
        setupReview.proof.actionId.slice(4),
        setupReview.proof,
        (current) => {
          if (current.inventoryFoundation) return null
          const result = applyShopInventoryImport(
            createEmptyShopInventoryState(),
            setupReview.package,
            setupReview.proof,
            current.items.map((item) => item.sku).sort(),
            setupReview.expectedHeadDigest,
          )
          return { ...current, inventoryFoundation: result.state }
        },
      )
      setSetupReview(null)
      setSetupOpen(false)
      setNotice(identity
        ? 'Two-location stock is now confirmed by the managed Shop workspace.'
        : 'Two-location stock is now part of this Shop record. No supplier or accounting action was sent.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Location setup was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  function reviewTransfer(event: FormEvent) {
    event.preventDefault()
    if (!selectedBalance || !destination || !transferQuantityValid) return
    setError('')
    setTransferReview({
      transferId: commandId('TRF'),
      stockUnitId: selectedBalance.stockUnitId,
      fromLocationId: selectedBalance.locationId,
      toLocationId: destination.id,
      quantity: transferQuantity,
      proof: actionProof(actor, 'the location transfer'),
      expectedHeadDigest: state.headDigest,
    })
    setNotice('Review the exact source, destination, and quantity. Nothing has moved yet.')
  }

  async function confirmTransfer() {
    if (!transferReview) return
    setBusy(true)
    setError('')
    try {
      await onInventory(
        'commerce.inventory.transferred',
        transferReview.proof.actionId.slice(4),
        transferReview.proof,
        (current) => {
          if (!current.inventoryFoundation) return null
          const result = transferShopInventory(current.inventoryFoundation, {
            ...transferReview,
            catalogSkus: current.items.map((item) => item.sku).sort(),
          })
          return { ...current, inventoryFoundation: result.state }
        },
      )
      setTransferReview(null)
      setTransferOpen(false)
      setNotice(identity
        ? 'The managed Shop workspace confirmed the paired location transfer.'
        : 'Stock moved inside this Shop record with paired evidence.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Location transfer was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  return <><ShopProductionHandoff commerce={commerce} disabled={disabled} identity={identity} onIssue={onIssue} /><section aria-labelledby="location-stock-title" className="catalog-onboarding-bridge">
    <div>
      <span className="core-eyebrow">Location stock</span>
      <h3 id="location-stock-title">{state.revision ? `${projection.metrics.totalAvailableToPromise.toLocaleString()} available to promise` : 'Set up two locations'}</h3>
      <p>{state.revision
        ? `${projection.metrics.totalOnHand.toLocaleString()} on hand · ${projection.metrics.totalReserved.toLocaleString()} reserved · ${projection.stockUnits.length} traceable ${projection.stockUnits.length === 1 ? 'unit' : 'units'}`
        : 'Add accountable client, vendor, location, and opening-lot evidence inside the Shop record.'}</p>
    </div>
    {!state.revision ? <button aria-controls="location-stock-setup" aria-expanded={setupOpen} className="core-button primary" disabled={disabled} onClick={() => { setSetupOpen((current) => !current); setSetupReview(null) }} type="button">{setupOpen ? 'Close setup' : 'Set up locations'}</button>
      : <button aria-controls="location-stock-transfer" aria-expanded={transferOpen} className="core-button primary" disabled={disabled || inventoryDrift || !balanceOptions.length} onClick={() => { setTransferOpen((current) => !current); setTransferReview(null); setTransferDraft({ balanceKey: balanceOptions[0] ? `${balanceOptions[0].stockUnitId}|${balanceOptions[0].locationId}` : '', quantity: '1' }) }} type="button">{transferOpen ? 'Close move' : 'Move stock'}</button>}
    {setupOpen && !state.revision ? <form className="core-form compact-form" id="location-stock-setup" onSubmit={reviewSetup}>
      <div className="form-row"><label>Main location<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, main: event.target.value }))} required value={setupDraft.main} /></label><label>Second location<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, branch: event.target.value }))} required value={setupDraft.branch} /></label></div>
      <div className="form-row"><label>Default client<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, client: event.target.value }))} required value={setupDraft.client} /></label><label>Opening vendor reference<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, vendor: event.target.value }))} required value={setupDraft.vendor} /></label></div>
      {setupReview ? <div className="stock-receipt-preview" role="status"><small>Opening import ready</small><strong>{setupReview.package.openings.reduce((sum, row) => sum + row.quantity, 0).toLocaleString()} units · {setupReview.package.stockUnits.length} lots · 2 locations</strong></div> : null}
      <div className="form-actions">{setupReview ? <button className="core-button" disabled={busy} onClick={() => setSetupReview(null)} type="button">Edit</button> : null}<button className="core-button primary" disabled={disabled || busy} onClick={setupReview ? () => void confirmSetup() : undefined} type={setupReview ? 'button' : 'submit'}>{setupReview ? busy ? 'Recording…' : 'Confirm setup' : 'Review setup'}</button></div>
    </form> : null}
    {state.revision ? <div className="exception-summary" aria-label="Stock by location">{locationTotals.map((location) => <span key={location.id}><strong>{location.availableToPromise.toLocaleString()}</strong><small>{location.name} ATP · {location.onHand.toLocaleString()} on hand</small></span>)}</div> : null}
    {transferOpen && state.revision ? <form className="core-form compact-form" id="location-stock-transfer" onSubmit={reviewTransfer}>
      <label>Stock to move<select disabled={disabled || Boolean(transferReview)} onChange={(event) => setTransferDraft({ balanceKey: event.target.value, quantity: '1' })} required value={transferDraft.balanceKey}><option value="">Choose stock</option>{balanceOptions.map((row) => <option key={`${row.stockUnitId}|${row.locationId}`} value={`${row.stockUnitId}|${row.locationId}`}>{catalogBySku.get(row.sku)?.name ?? row.sku} · {projection.locations.find((location) => location.id === row.locationId)?.name} · {row.availableToPromise} ATP</option>)}</select></label>
      <label>Quantity<input disabled={disabled || Boolean(transferReview) || !selectedBalance} inputMode="numeric" max={selectedBalance?.availableToPromise ?? 0} min="1" onChange={(event) => setTransferDraft((current) => ({ ...current, quantity: event.target.value }))} required step="1" type="number" value={transferDraft.quantity} /></label>
      {selectedBalance && destination ? <div className="stock-receipt-preview" role="status"><small>{projection.locations.find((location) => location.id === selectedBalance.locationId)?.name} → {destination.name}</small><strong>{transferQuantityValid ? `${transferQuantity} units · ${selectedBalance.availableToPromise - transferQuantity} source ATP after` : 'Enter available units'}</strong></div> : null}
      <div className="form-actions">{transferReview ? <button className="core-button" disabled={busy} onClick={() => setTransferReview(null)} type="button">Edit</button> : null}<button className="core-button primary" disabled={disabled || busy || !transferQuantityValid} onClick={transferReview ? () => void confirmTransfer() : undefined} type={transferReview ? 'button' : 'submit'}>{transferReview ? busy ? 'Moving…' : 'Confirm move' : 'Review move'}</button></div>
    </form> : null}
    {inventoryDrift ? <p className="form-notice warning-text" role="alert">Aggregate Shop stock changed after location setup. Reconcile the opening layer before another move.</p> : null}
    <p className="form-notice" aria-live="polite">{error || notice || (state.revision ? 'Transfers retain paired source and destination evidence. No supplier contact, payment, or accounting action occurs.' : 'Setup previews the exact opening package before one Shop write.')}</p>
  </section></>
}
