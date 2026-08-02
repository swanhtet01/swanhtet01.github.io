import { type FormEvent, useMemo, useState } from 'react'

import {
  applyShopInventoryImport,
  buildShopInventoryImportPackage,
  createShopInventoryMaster,
  createEmptyShopInventoryState,
  projectShopInventory,
  setShopSupplierPolicy,
  shopInventoryEvidenceDigest,
  transferShopInventory,
  type ShopInventoryImportPackage,
  type ShopInventoryProof,
  type ShopSupplierPolicy,
} from './shop-inventory-foundation'
import { ShopProductionHandoff } from './ShopProductionHandoff'
import { projectPlantOrder } from './plant-order-foundation'
import { productionOrderPortfolioEntries } from './production-order-portfolio'
import {
  receiveCommerceProductionBatch,
  type CommerceActionProof,
  type CommerceProductionBatchReceipt,
  type CommerceState,
} from './commerce-workspace'
import type { ManagedIdentity } from './managed-trial'
import type { ProductionState } from './production-workspace'


type ShopInventoryFoundationProps = {
  actor: string
  commerce: CommerceState
  disabled: boolean
  identity: ManagedIdentity | null
  production: ProductionState
  onIssue: (
    eventType: 'commerce.production_material.issued' | 'commerce.production_material.returned',
    commandId: string,
    proof: CommerceActionProof,
    transition: (state: CommerceState) => CommerceState | null,
  ) => Promise<void>
  onInventory: (
    eventType: 'commerce.inventory.initialized' | 'commerce.inventory.master_created' | 'commerce.inventory.supplier_policy_saved' | 'commerce.inventory.transferred' | 'commerce.production_batch.received',
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

type MasterReview = {
  commandId: string
  masterType: 'client' | 'vendor'
  master: { id: string; name: string }
  proof: ShopInventoryProof
  expectedHeadDigest: string
}

type SupplierPolicyReview = {
  commandId: string
  policy: Omit<ShopSupplierPolicy, 'commandId' | 'proof'>
  proof: ShopInventoryProof
  expectedHeadDigest: string
}

type ProductionReceiptReview = {
  receipt: CommerceProductionBatchReceipt
  proof: ShopInventoryProof
  sourceProduct: string
  locationId: string
  expectedItemOnHand: number
  expectedInventoryHeadDigest: string | null
  expectedProductionHeadDigest: string
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

function productionReceiptProof(actor: string, receipt: CommerceProductionBatchReceipt, sourceProduct: string, locationId: string): ShopInventoryProof {
  const actionId = commandId('ACT')
  const productLabel = sourceProduct.trim().slice(0, 48)
  const skuLabel = receipt.sku.trim().slice(0, 48)
  return {
    actionId,
    capturedAt: new Date().toISOString(),
    actor: actor.trim() || 'Local Shop operator',
    reason: `Map Plant “${productLabel}” to Shop “${skuLabel}” and receive the released batch.`,
    evidenceReference: `PLANT-BATCH:${receipt.releaseId}:${receipt.sourceCommandDigest}:${locationId}`,
  }
}

export function ShopInventoryFoundation({ actor, commerce, disabled, identity, onInventory, onIssue, production, scope }: ShopInventoryFoundationProps) {
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
  const [masterDraft, setMasterDraft] = useState<{ masterType: 'client' | 'vendor'; name: string }>({ masterType: 'client', name: '' })
  const [masterReview, setMasterReview] = useState<MasterReview | null>(null)
  const [supplierPolicyDraft, setSupplierPolicyDraft] = useState({
    vendorId: '', sku: catalog[0]?.sku ?? '', leadTimeDays: '7', minimumOrderUnits: '1',
    orderMultipleUnits: '1', safetyStockUnits: '0', serviceLevelBasisPoints: '9500', status: 'active' as 'active' | 'inactive',
  })
  const [supplierPolicyReview, setSupplierPolicyReview] = useState<SupplierPolicyReview | null>(null)
  const [productionReceiptReview, setProductionReceiptReview] = useState<ProductionReceiptReview | null>(null)
  const [productionItemMapping, setProductionItemMapping] = useState<{ releaseId: string; sku: string } | null>(null)

  const projection = useMemo(
    () => projectShopInventory(state, catalogSkus),
    [catalogSkus, state],
  )
  const selectedMasters = masterDraft.masterType === 'client' ? projection.clients : projection.vendors
  const masterAtLimit = selectedMasters.length >= 200
  const masterListPreview = `${selectedMasters.slice(0, 4).map((master) => master.name).join(' · ')}${selectedMasters.length > 4 ? ` · +${selectedMasters.length - 4} more` : ''}`
  const activeSupplierPolicies = projection.supplierPolicies.filter((policy) => policy.status === 'active')
  const catalogBySku = useMemo(() => new Map(catalog.map((item) => [item.sku, item])), [catalog])
  const balanceOptions = projection.balances.filter((row) => row.availableToPromise > 0)
  const activeAggregateOrders = commerce.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
  const setupBlockedByOrders = !state.revision && activeAggregateOrders.length > 0
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
  const inventoryDrift = Boolean(state.revision && catalog.some((item) => {
    const locationTotal = projection.balances.filter((row) => row.sku === item.sku).reduce((sum, row) => sum + row.availableToPromise, 0)
    return locationTotal !== catalogBySku.get(item.sku)?.onHand
  }))
  const inventoryAutopilotRows = [
    ['Locations', state.revision ? `${projection.locations.length} active` : 'Set up'],
    ['ATP', state.revision ? projection.metrics.totalAvailableToPromise.toLocaleString() : 'Locked'],
    ['Reserved', state.revision ? projection.metrics.totalReserved.toLocaleString() : activeAggregateOrders.length ? 'Finish orders' : 'None'],
    ['Health', inventoryDrift ? 'Reconcile' : state.revision ? 'Ready' : setupBlockedByOrders ? 'Blocked' : 'Ready'],
  ] as const
  const inventoryAutopilotMessage = inventoryDrift
    ? 'Catalog available stock and location ATP disagree. Reconcile before another move, count, or production issue.'
    : state.revision
      ? 'Use available stock, reservations, lots, and locations to choose the next count or stock move.'
      : setupBlockedByOrders
        ? 'Finish or cancel open aggregate-stock orders before creating location history.'
        : 'Set up locations once so orders, returns, production issues, counts, and transfers share the same stock truth.'
  const plantProjection = useMemo(() => {
    const released = productionOrderPortfolioEntries(production)
      .map((entry) => projectPlantOrder(entry.execution))
      .find((candidate) => candidate.status === 'released_to_stock'
        && candidate.batchRelease
        && !commerce.movements.some((movement) => movement.kind === 'production_receipt'
          && movement.productionReleaseId === candidate.batchRelease?.id))
    return released ?? null
  }, [commerce.movements, production])
  const releasedPlantBatch = plantProjection?.status === 'released_to_stock'
    && plantProjection.plan
    && plantProjection.batchRelease
    && plantProjection.latestInspection
    && plantProjection.metrics.acceptedQuantity > 0
    ? {
        releaseId: plantProjection.batchRelease.id,
        sourceCommandDigest: plantProjection.headDigest,
        jobId: plantProjection.plan.job.jobId,
        outputBatchId: plantProjection.batchRelease.outputBatchId,
        releasedAt: plantProjection.batchRelease.proof.capturedAt,
        product: plantProjection.plan.job.product,
        quantity: plantProjection.metrics.acceptedQuantity,
      }
    : null
  const receivedPlantMovement = releasedPlantBatch
    ? commerce.movements.find((movement) => movement.kind === 'production_receipt' && movement.productionReleaseId === releasedPlantBatch.releaseId)
    : undefined
  const normalizedPlantProduct = releasedPlantBatch?.product.trim().toLocaleLowerCase() ?? ''
  const retainedProductionSku = releasedPlantBatch
    ? commerce.movements.find((movement) => movement.kind === 'production_receipt'
      && movement.productionSourceProduct?.trim().toLocaleLowerCase() === normalizedPlantProduct)?.sku ?? ''
    : ''
  const exactPlantCatalogMatches = releasedPlantBatch
    ? catalog.filter((item) => [item.sku, item.name].some((value) => value.trim().toLocaleLowerCase() === normalizedPlantProduct))
    : []
  const selectedProductionSku = productionItemMapping && productionItemMapping.releaseId === releasedPlantBatch?.releaseId ? productionItemMapping.sku : ''
  const plantCatalogItem = retainedProductionSku
    ? catalog.find((item) => item.sku === retainedProductionSku)
    : exactPlantCatalogMatches.length === 1
    ? exactPlantCatalogMatches[0]
    : catalog.find((item) => item.sku === selectedProductionSku)
  const productionMappingRequired = Boolean(releasedPlantBatch && !retainedProductionSku && exactPlantCatalogMatches.length !== 1)
  const plantReceiptLocationId = state.revision
    ? projection.locations.find((location) => location.id === 'LOC-MAIN')?.id ?? projection.locations[0]?.id ?? ''
    : 'LOC-MAIN'
  const plantReceiptIssue = releasedPlantBatch && !receivedPlantMovement
    ? !catalog.length
      ? 'Add at least one Shop catalog item before receiving Plant output.'
      : retainedProductionSku && !plantCatalogItem
        ? `The retained Plant mapping points to missing Shop SKU ${retainedProductionSku}. Restore that catalog item before receiving more output.`
      : !plantReceiptLocationId
        ? 'Released Plant stock needs one active Shop location.'
        : ''
    : ''

  function reviewProductionReceipt() {
    if (!releasedPlantBatch || !plantCatalogItem || !plantReceiptLocationId || receivedPlantMovement) return
    const receipt: CommerceProductionBatchReceipt = {
      releaseId: releasedPlantBatch.releaseId,
      sourceCommandDigest: releasedPlantBatch.sourceCommandDigest,
      jobId: releasedPlantBatch.jobId,
      outputBatchId: releasedPlantBatch.outputBatchId,
      releasedAt: releasedPlantBatch.releasedAt,
      sourceProduct: releasedPlantBatch.product,
      sku: plantCatalogItem.sku,
      quantity: releasedPlantBatch.quantity,
    }
    setError('')
    setProductionReceiptReview({
      receipt,
      proof: productionReceiptProof(actor, receipt, releasedPlantBatch.product, plantReceiptLocationId),
      sourceProduct: releasedPlantBatch.product,
      locationId: plantReceiptLocationId,
      expectedItemOnHand: plantCatalogItem.onHand,
      expectedInventoryHeadDigest: commerce.inventoryFoundation?.headDigest ?? null,
      expectedProductionHeadDigest: releasedPlantBatch.sourceCommandDigest,
    })
    setNotice('Review the released quantity, output batch, Shop item, and receiving location. Nothing has been written yet.')
  }

  async function confirmProductionReceipt() {
    if (!productionReceiptReview) return
    if (!plantProjection
      || plantProjection.status !== 'released_to_stock'
      || plantProjection.headDigest !== productionReceiptReview.expectedProductionHeadDigest
      || plantProjection.batchRelease?.id !== productionReceiptReview.receipt.releaseId
      || plantProjection.plan?.job.product !== productionReceiptReview.sourceProduct) {
      setProductionReceiptReview(null)
      setError('The Plant release changed. Review the current released batch again.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onInventory(
        'commerce.production_batch.received',
        productionReceiptReview.proof.actionId.slice(4),
        productionReceiptReview.proof,
        (current) => {
          const item = current.items.find((candidate) => candidate.sku === productionReceiptReview.receipt.sku)
          if (!item || item.onHand !== productionReceiptReview.expectedItemOnHand) return null
          if ((current.inventoryFoundation?.headDigest ?? null) !== productionReceiptReview.expectedInventoryHeadDigest) return null
          return receiveCommerceProductionBatch(
            current,
            productionReceiptReview.receipt,
            productionReceiptReview.proof,
            current.inventoryFoundation
              ? { locationId: productionReceiptReview.locationId, expectedHeadDigest: productionReceiptReview.expectedInventoryHeadDigest as string }
              : undefined,
          )
        },
      )
      setProductionReceiptReview(null)
      setNotice(identity
        ? 'The managed Shop workspace received the released Plant batch with linked lot evidence.'
        : 'The released Plant batch is now in Shop stock with linked lot evidence.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The Plant batch was not received into Shop.')
    } finally {
      setBusy(false)
    }
  }

  function reviewSetup(event: FormEvent) {
    event.preventDefault()
    if (setupBlockedByOrders) return
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
          if (current.inventoryFoundation || current.orders.some((order) => order.status !== 'completed' && order.status !== 'cancelled')) return null
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

  function reviewMaster(event: FormEvent) {
    event.preventDefault()
    const name = masterDraft.name.trim()
    const existing = selectedMasters
    if (!name || name.length > 120) {
      setError('Enter a client or supplier name of 120 characters or fewer.')
      return
    }
    if (existing.some((master) => master.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))) {
      setError(`${name} is already in the ${masterDraft.masterType === 'client' ? 'client' : 'supplier'} master.`)
      return
    }
    setError('')
    const masterLabel = masterDraft.masterType === 'client' ? 'client' : 'supplier'
    setMasterReview({
      commandId: commandId('MST'),
      masterType: masterDraft.masterType,
      master: { id: commandId(masterDraft.masterType === 'client' ? 'CLI' : 'VEN'), name },
      proof: actionProof(actor, `the new ${masterLabel} master “${name}”`),
      expectedHeadDigest: state.headDigest,
    })
    setNotice(`Review the new ${masterLabel}. Nothing has been recorded yet.`)
  }

  async function confirmMaster() {
    if (!masterReview) return
    setBusy(true)
    setError('')
    try {
      await onInventory(
        'commerce.inventory.master_created',
        masterReview.proof.actionId.slice(4),
        masterReview.proof,
        (current) => {
          if (!current.inventoryFoundation) return null
          const result = createShopInventoryMaster(current.inventoryFoundation, {
            ...masterReview,
            catalogSkus: current.items.map((item) => item.sku).sort(),
          })
          return { ...current, inventoryFoundation: result.state }
        },
      )
      const masterLabel = masterReview.masterType === 'client' ? 'client' : 'supplier'
      setMasterReview(null)
      setMasterDraft((current) => ({ ...current, name: '' }))
      setNotice(`${masterReview.master.name} is now an accountable ${masterLabel} record.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The business partner was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  function selectSupplierPolicy(vendorId: string, sku: string) {
    const retained = projection.supplierPolicies.find((policy) => policy.vendorId === vendorId && policy.sku === sku)
    setSupplierPolicyReview(null)
    setSupplierPolicyDraft({
      vendorId,
      sku,
      leadTimeDays: String(retained?.leadTimeDays ?? 7),
      minimumOrderUnits: String(retained?.minimumOrderUnits ?? 1),
      orderMultipleUnits: String(retained?.orderMultipleUnits ?? 1),
      safetyStockUnits: String(retained?.safetyStockUnits ?? catalogBySku.get(sku)?.reorderAt ?? 0),
      serviceLevelBasisPoints: String(retained?.serviceLevelBasisPoints ?? 9_500),
      status: retained?.status ?? 'active',
    })
  }

  function reviewSupplierPolicy(event: FormEvent) {
    event.preventDefault()
    const integer = (value: string) => /^\d+$/.test(value) ? Number(value) : Number.NaN
    const leadTimeDays = integer(supplierPolicyDraft.leadTimeDays)
    const minimumOrderUnits = integer(supplierPolicyDraft.minimumOrderUnits)
    const orderMultipleUnits = integer(supplierPolicyDraft.orderMultipleUnits)
    const safetyStockUnits = integer(supplierPolicyDraft.safetyStockUnits)
    const serviceLevelBasisPoints = integer(supplierPolicyDraft.serviceLevelBasisPoints)
    if (!projection.vendors.some((vendor) => vendor.id === supplierPolicyDraft.vendorId)
      || !catalogBySku.has(supplierPolicyDraft.sku)
      || !Number.isSafeInteger(leadTimeDays) || leadTimeDays < 1 || leadTimeDays > 365
      || ![minimumOrderUnits, orderMultipleUnits].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000)
      || !Number.isSafeInteger(safetyStockUnits) || safetyStockUnits < 0 || safetyStockUnits > 1_000_000
      || !Number.isSafeInteger(serviceLevelBasisPoints) || serviceLevelBasisPoints < 5_000 || serviceLevelBasisPoints > 9_999) {
      setError('Choose one supplier and item, then enter valid lead time, order quantities, safety stock, and a 50.00–99.99% service level.')
      return
    }
    const vendor = projection.vendors.find((candidate) => candidate.id === supplierPolicyDraft.vendorId)
    const item = catalogBySku.get(supplierPolicyDraft.sku)
    const reviewProof = actionProof(actor, `the ${vendor?.name ?? 'supplier'} purchasing policy for ${item?.name ?? supplierPolicyDraft.sku}`)
    setError('')
    setSupplierPolicyReview({
      commandId: commandId('SPP'),
      policy: {
        vendorId: supplierPolicyDraft.vendorId,
        sku: supplierPolicyDraft.sku,
        leadTimeDays,
        minimumOrderUnits,
        orderMultipleUnits,
        safetyStockUnits,
        serviceLevelBasisPoints,
        status: supplierPolicyDraft.status,
      },
      proof: reviewProof,
      expectedHeadDigest: state.headDigest,
    })
    setNotice('Review the purchasing constraints. Nothing has been recorded or sent to the supplier yet.')
  }

  async function confirmSupplierPolicy() {
    if (!supplierPolicyReview) return
    setBusy(true)
    setError('')
    try {
      await onInventory(
        'commerce.inventory.supplier_policy_saved',
        supplierPolicyReview.proof.actionId.slice(4),
        supplierPolicyReview.proof,
        (current) => {
          if (!current.inventoryFoundation) return null
          const result = setShopSupplierPolicy(current.inventoryFoundation, {
            ...supplierPolicyReview,
            catalogSkus: current.items.map((item) => item.sku).sort(),
          })
          return { ...current, inventoryFoundation: result.state }
        },
      )
      const vendor = projection.vendors.find((candidate) => candidate.id === supplierPolicyReview.policy.vendorId)
      setSupplierPolicyReview(null)
      setNotice(`${vendor?.name ?? 'Supplier'} purchasing policy is now retained for replenishment planning.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The supplier purchasing policy was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  return <>{releasedPlantBatch ? <section aria-labelledby="plant-receipt-title" className="catalog-onboarding-bridge">
    <div><span className="core-eyebrow">Released from Plant</span><h3 id="plant-receipt-title">{receivedPlantMovement ? 'Batch received' : releasedPlantBatch.product}</h3><p>{releasedPlantBatch.quantity.toLocaleString()} accepted units · batch {releasedPlantBatch.outputBatchId}{plantCatalogItem ? ` · ${plantCatalogItem.name}` : ''}</p></div>
    {!receivedPlantMovement && productionMappingRequired ? <label>Receive as Shop item<select aria-label="Map released Plant product to Shop item" disabled={disabled || busy || Boolean(productionReceiptReview)} onChange={(event) => { setProductionItemMapping({ releaseId: releasedPlantBatch.releaseId, sku: event.target.value }); setProductionReceiptReview(null) }} value={selectedProductionSku}><option value="">Choose one item</option>{catalog.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.sku}</option>)}</select><small>This reviewed choice is retained in the stock receipt evidence.</small></label> : null}
    {receivedPlantMovement ? <span className="status-badge success">In Shop stock</span> : plantReceiptIssue || !plantCatalogItem ? null : <button className="core-button primary" disabled={disabled || busy} onClick={productionReceiptReview ? () => void confirmProductionReceipt() : reviewProductionReceipt} type="button">{productionReceiptReview ? busy ? 'Receiving…' : 'Confirm into Shop' : 'Review Plant receipt'}</button>}
    {productionReceiptReview && !receivedPlantMovement ? <div className="stock-receipt-preview" role="status"><small>{productionReceiptReview.receipt.sku} · {productionReceiptReview.locationId}</small><strong>{productionReceiptReview.receipt.quantity.toLocaleString()} units · lot {productionReceiptReview.receipt.outputBatchId}</strong></div> : null}
    {plantReceiptIssue ? <p className="form-notice warning-text" role="alert">{plantReceiptIssue}</p> : productionMappingRequired && !plantCatalogItem ? <p className="form-notice" role="status">Choose the Shop item that represents this Plant product. SuperMega will not guess the mapping.</p> : null}
  </section> : null}<ShopProductionHandoff commerce={commerce} disabled={disabled} identity={identity} onIssue={onIssue} /><section aria-labelledby="location-stock-title" className="catalog-onboarding-bridge">
    <div aria-label="Stock guide" className="inventory-autopilot">
      <div><span className="core-eyebrow">Stock guide</span><strong>{state.revision ? inventoryDrift ? 'Reconcile stock' : 'Location stock is active' : 'Start location stock'}</strong><small>{inventoryAutopilotMessage}</small></div>
      <div className="inventory-autopilot-rows">
        {inventoryAutopilotRows.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
      </div>
    </div>
    <div>
      <span className="core-eyebrow">Location stock</span>
      <h3 id="location-stock-title">{state.revision ? `${projection.metrics.totalAvailableToPromise.toLocaleString()} available to promise` : 'Set up two locations'}</h3>
      <p>{state.revision
        ? `${projection.metrics.totalOnHand.toLocaleString()} on hand · ${projection.metrics.totalReserved.toLocaleString()} reserved · ${projection.stockUnits.length} traceable ${projection.stockUnits.length === 1 ? 'unit' : 'units'}`
        : 'Add accountable client, vendor, location, and opening-lot evidence inside the Shop record.'}</p>
    </div>
    {!state.revision ? <button aria-controls="location-stock-setup" aria-expanded={setupOpen} className="core-button primary" disabled={disabled || setupBlockedByOrders} onClick={() => { setSetupOpen((current) => !current); setSetupReview(null) }} type="button">{setupBlockedByOrders ? `Finish ${activeAggregateOrders.length} ${activeAggregateOrders.length === 1 ? 'order' : 'orders'} first` : setupOpen ? 'Close setup' : 'Set up locations'}</button>
      : <button aria-controls="location-stock-transfer" aria-expanded={transferOpen} className="core-button primary" disabled={disabled || inventoryDrift || !balanceOptions.length} onClick={() => { setTransferOpen((current) => !current); setTransferReview(null); setTransferDraft({ balanceKey: balanceOptions[0] ? `${balanceOptions[0].stockUnitId}|${balanceOptions[0].locationId}` : '', quantity: '1' }) }} type="button">{transferOpen ? 'Close move' : 'Move stock'}</button>}
    {setupOpen && !state.revision ? <form className="core-form compact-form" id="location-stock-setup" onSubmit={reviewSetup}>
      <div className="form-row"><label>Main location<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, main: event.target.value }))} required value={setupDraft.main} /></label><label>Second location<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, branch: event.target.value }))} required value={setupDraft.branch} /></label></div>
      <div className="form-row"><label>Default client<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, client: event.target.value }))} required value={setupDraft.client} /></label><label>Opening vendor reference<input disabled={disabled || Boolean(setupReview)} maxLength={120} onChange={(event) => setSetupDraft((current) => ({ ...current, vendor: event.target.value }))} required value={setupDraft.vendor} /></label></div>
      {setupReview ? <div className="stock-receipt-preview" role="status"><small>Opening import ready</small><strong>{setupReview.package.openings.reduce((sum, row) => sum + row.quantity, 0).toLocaleString()} units · {setupReview.package.stockUnits.length} lots · 2 locations</strong></div> : null}
      <div className="form-actions">{setupReview ? <button className="core-button" disabled={busy} onClick={() => setSetupReview(null)} type="button">Edit</button> : null}<button className="core-button primary" disabled={disabled || busy} onClick={setupReview ? () => void confirmSetup() : undefined} type={setupReview ? 'button' : 'submit'}>{setupReview ? busy ? 'Recording…' : 'Confirm setup' : 'Review setup'}</button></div>
    </form> : null}
    {state.revision ? <div className="exception-summary" aria-label="Stock by location">{locationTotals.map((location) => <span key={location.id}><strong>{location.availableToPromise.toLocaleString()}</strong><small>{location.name} ATP · {location.onHand.toLocaleString()} on hand</small></span>)}</div> : null}
    {state.revision ? <details className="compact-disclosure">
      <summary><span>Clients and suppliers</span><small>{projection.clients.length} clients · {projection.vendors.length} suppliers</small></summary>
      <form className="core-form compact-form" onSubmit={reviewMaster}>
        <div className="form-row"><label>Record type<select disabled={disabled || busy || Boolean(masterReview)} onChange={(event) => { setMasterDraft({ masterType: event.target.value as 'client' | 'vendor', name: '' }); setMasterReview(null); setError('') }} value={masterDraft.masterType}><option value="client">Client</option><option value="vendor">Supplier</option></select></label><label>Name<input disabled={disabled || busy || masterAtLimit || Boolean(masterReview)} maxLength={120} onChange={(event) => { setMasterDraft((current) => ({ ...current, name: event.target.value })); setMasterReview(null) }} placeholder={masterDraft.masterType === 'client' ? 'Customer or account name' : 'Supplier name'} required value={masterDraft.name} /></label></div>
        <div className="stock-receipt-preview" role="status"><small>{masterDraft.masterType === 'client' ? 'Client master' : 'Supplier master'}</small><strong>{masterReview ? `${masterReview.master.name} · ${masterReview.master.id}` : masterAtLimit ? '200-record pilot limit reached' : masterListPreview}</strong></div>
        <div className="form-actions">{masterReview ? <button className="core-button" disabled={busy} onClick={() => setMasterReview(null)} type="button">Edit</button> : null}<button className="core-button primary" disabled={disabled || busy || masterAtLimit || !masterDraft.name.trim()} onClick={masterReview ? () => void confirmMaster() : undefined} type={masterReview ? 'button' : 'submit'}>{masterReview ? busy ? 'Recording…' : 'Confirm record' : 'Review record'}</button></div>
      </form>
      <form aria-label="Supplier purchasing policy" className="core-form compact-form supplier-policy-form" onSubmit={reviewSupplierPolicy}>
        <div><span className="core-eyebrow">Purchasing policy</span><strong>Set the constraints once</strong><small>Replenishment will respect lead time, minimum order, order multiples, safety stock, and service level.</small></div>
        <div className="form-row"><label>Supplier<select disabled={disabled || busy || Boolean(supplierPolicyReview)} onChange={(event) => selectSupplierPolicy(event.target.value, supplierPolicyDraft.sku)} required value={supplierPolicyDraft.vendorId}><option value="">Choose supplier</option>{projection.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label>Item<select disabled={disabled || busy || Boolean(supplierPolicyReview)} onChange={(event) => selectSupplierPolicy(supplierPolicyDraft.vendorId, event.target.value)} required value={supplierPolicyDraft.sku}><option value="">Choose item</option>{catalog.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.sku}</option>)}</select></label></div>
        <div className="form-row"><label>Lead time (days)<input disabled={disabled || busy || Boolean(supplierPolicyReview)} inputMode="numeric" max="365" min="1" onChange={(event) => { setSupplierPolicyDraft((current) => ({ ...current, leadTimeDays: event.target.value })); setSupplierPolicyReview(null) }} required step="1" type="number" value={supplierPolicyDraft.leadTimeDays} /></label><label>Minimum order<input disabled={disabled || busy || Boolean(supplierPolicyReview)} inputMode="numeric" max="1000000" min="1" onChange={(event) => { setSupplierPolicyDraft((current) => ({ ...current, minimumOrderUnits: event.target.value })); setSupplierPolicyReview(null) }} required step="1" type="number" value={supplierPolicyDraft.minimumOrderUnits} /></label></div>
        <div className="form-row"><label>Order multiple<input disabled={disabled || busy || Boolean(supplierPolicyReview)} inputMode="numeric" max="1000000" min="1" onChange={(event) => { setSupplierPolicyDraft((current) => ({ ...current, orderMultipleUnits: event.target.value })); setSupplierPolicyReview(null) }} required step="1" type="number" value={supplierPolicyDraft.orderMultipleUnits} /></label><label>Safety stock<input disabled={disabled || busy || Boolean(supplierPolicyReview)} inputMode="numeric" max="1000000" min="0" onChange={(event) => { setSupplierPolicyDraft((current) => ({ ...current, safetyStockUnits: event.target.value })); setSupplierPolicyReview(null) }} required step="1" type="number" value={supplierPolicyDraft.safetyStockUnits} /></label></div>
        <div className="form-row"><label>Service level (basis points)<input disabled={disabled || busy || Boolean(supplierPolicyReview)} inputMode="numeric" max="9999" min="5000" onChange={(event) => { setSupplierPolicyDraft((current) => ({ ...current, serviceLevelBasisPoints: event.target.value })); setSupplierPolicyReview(null) }} required step="1" type="number" value={supplierPolicyDraft.serviceLevelBasisPoints} /><small>9500 = 95.00%</small></label><label>Status<select disabled={disabled || busy || Boolean(supplierPolicyReview)} onChange={(event) => { setSupplierPolicyDraft((current) => ({ ...current, status: event.target.value as 'active' | 'inactive' })); setSupplierPolicyReview(null) }} value={supplierPolicyDraft.status}><option value="active">Active</option><option value="inactive">Paused</option></select></label></div>
        {supplierPolicyReview ? <div className="stock-receipt-preview" role="status"><small>{supplierPolicyReview.policy.sku} · {supplierPolicyReview.policy.status}</small><strong>{supplierPolicyReview.policy.leadTimeDays} days · MOQ {supplierPolicyReview.policy.minimumOrderUnits} · multiple {supplierPolicyReview.policy.orderMultipleUnits} · safety {supplierPolicyReview.policy.safetyStockUnits} · {(supplierPolicyReview.policy.serviceLevelBasisPoints / 100).toFixed(2)}%</strong></div> : activeSupplierPolicies.length ? <div className="stock-receipt-preview"><small>{activeSupplierPolicies.length} active {activeSupplierPolicies.length === 1 ? 'policy' : 'policies'}</small><strong>{activeSupplierPolicies.slice(0, 3).map((policy) => `${policy.sku}: ${policy.leadTimeDays}d / MOQ ${policy.minimumOrderUnits}`).join(' · ')}</strong></div> : null}
        <div className="form-actions">{supplierPolicyReview ? <button className="core-button" disabled={busy} onClick={() => setSupplierPolicyReview(null)} type="button">Edit</button> : null}<button className="core-button primary" disabled={disabled || busy || !projection.vendors.length || !supplierPolicyDraft.vendorId || !supplierPolicyDraft.sku} onClick={supplierPolicyReview ? () => void confirmSupplierPolicy() : undefined} type={supplierPolicyReview ? 'button' : 'submit'}>{supplierPolicyReview ? busy ? 'Recording…' : 'Confirm policy' : 'Review policy'}</button></div>
      </form>
    </details> : null}
    {transferOpen && state.revision ? <form className="core-form compact-form" id="location-stock-transfer" onSubmit={reviewTransfer}>
      <label>Stock to move<select disabled={disabled || Boolean(transferReview)} onChange={(event) => setTransferDraft({ balanceKey: event.target.value, quantity: '1' })} required value={transferDraft.balanceKey}><option value="">Choose stock</option>{balanceOptions.map((row) => <option key={`${row.stockUnitId}|${row.locationId}`} value={`${row.stockUnitId}|${row.locationId}`}>{catalogBySku.get(row.sku)?.name ?? row.sku} · {projection.locations.find((location) => location.id === row.locationId)?.name} · {row.availableToPromise} ATP</option>)}</select></label>
      <label>Quantity<input disabled={disabled || Boolean(transferReview) || !selectedBalance} inputMode="numeric" max={selectedBalance?.availableToPromise ?? 0} min="1" onChange={(event) => setTransferDraft((current) => ({ ...current, quantity: event.target.value }))} required step="1" type="number" value={transferDraft.quantity} /></label>
      {selectedBalance && destination ? <div className="stock-receipt-preview" role="status"><small>{projection.locations.find((location) => location.id === selectedBalance.locationId)?.name} → {destination.name}</small><strong>{transferQuantityValid ? `${transferQuantity} units · ${selectedBalance.availableToPromise - transferQuantity} source ATP after` : 'Enter available units'}</strong></div> : null}
      <div className="form-actions">{transferReview ? <button className="core-button" disabled={busy} onClick={() => setTransferReview(null)} type="button">Edit</button> : null}<button className="core-button primary" disabled={disabled || busy || !transferQuantityValid} onClick={transferReview ? () => void confirmTransfer() : undefined} type={transferReview ? 'button' : 'submit'}>{transferReview ? busy ? 'Moving…' : 'Confirm move' : 'Review move'}</button></div>
    </form> : null}
    {inventoryDrift ? <p className="form-notice warning-text" role="alert">Shop available stock no longer matches location ATP. Reconcile before another move.</p> : null}
    <p className="form-notice" aria-live="polite">{error || notice || (state.revision ? 'Transfers retain paired source and destination evidence. No supplier contact, payment, or accounting action occurs.' : setupBlockedByOrders ? 'Finish or cancel active aggregate-stock orders before starting location stock; no warehouse history will be invented.' : 'Setup previews the exact opening package before one Shop write.')}</p>
  </section></>
}
