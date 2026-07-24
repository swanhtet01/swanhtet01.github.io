import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  commerceStorefrontRequests,
  recordCommerceStorefrontRequest,
  validateCommerceState,
  type CommerceItem,
  type CommerceState,
} from '../../core/commerce-workspace'
import {
  currentManagedIdentity,
  loadManagedBootstrap,
  ManagedTrialError,
  saveManagedCommerceCommand,
  type ManagedIdentity,
  type ManagedStateRecord,
} from '../../core/managed-trial'
import { confirmEcommerceShopDraft } from './ecommerce-shop-confirm'
import {
  acceptManagedStorefrontCommand,
  prepareManagedStorefrontSave,
  readManagedStorefront,
  type ManagedStorefrontSaved,
} from './managed-storefront'
import {
  buildStorefrontOrderRequest,
  createEmptyStorefrontRequestLedger,
  recordStorefrontOrderRequest,
} from './storefront-request'
import {
  buildStorefrontPreview,
  readStorefrontCatalog,
  storefrontPreviewDigest,
} from './storefront-model'
import {
  LOCAL_STOREFRONT_DRAFT_SCOPE,
  readStorefrontDraft,
  reconcileStorefrontSelection,
  saveStorefrontDraft,
  storefrontDraftStorageKey,
  type StorefrontDraft,
  type StorefrontDraftReadResult,
} from './storefront-draft'
import './ecommerce-product.css'

type PreviewDevice = 'phone' | 'desktop'
type EcommerceCatalog = {
  source: 'shop-local' | 'sample' | 'unavailable' | 'managed-shop'
  items: CommerceItem[]
  error: string
}
type ManagedInboxContext = {
  identity: ManagedIdentity
  state: CommerceState
  version: number
}
type ManagedStorefrontView = {
  inbox: ManagedInboxContext
  saved: ManagedStorefrontSaved | null
  fields: {
    storeName: string
    summary: string
    selectedSkus: string[]
  }
  availableSku: string
}

const DEFAULT_STORE_NAME = 'My Shop'
const DEFAULT_STORE_SUMMARY = 'Everyday products, clearly priced and ready to request.'

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

function defaultSelection(items: CommerceItem[]) {
  return items.filter((item) => item.onHand > 0).slice(0, 4).map((item) => item.sku)
}

function savedLocalDraft(draft: StorefrontDraft | null): ManagedStorefrontSaved | null {
  if (!draft) return null
  return {
    revision: draft.revision,
    savedAt: draft.savedAt,
    storeName: draft.storeName,
    summary: draft.summary,
    selectedSkus: [...draft.selectedSkus],
  }
}

function draftFieldsForCatalog(saved: ManagedStorefrontSaved | null, items: CommerceItem[]) {
  if (!saved) {
    return {
      storeName: DEFAULT_STORE_NAME,
      summary: DEFAULT_STORE_SUMMARY,
      selectedSkus: defaultSelection(items),
    }
  }
  const reconciliation = reconcileStorefrontSelection(saved.selectedSkus, items.map((item) => item.sku))
  return {
    storeName: saved.storeName,
    summary: saved.summary,
    selectedSkus: reconciliation.selectedSkus,
  }
}

function resolveManagedStorefront(
  identity: ManagedIdentity,
  record: ManagedStateRecord,
): ManagedStorefrontView | null {
  if (record.surface !== 'commerce' || !Number.isSafeInteger(record.version) || record.version < 1) return null
  const state = validateCommerceState(record.state)
  const saved = readManagedStorefront(state)
  const fields = draftFieldsForCatalog(saved, state.items)
  const available = state.items.filter((item) => item.onHand > 0)
  return {
    inbox: { identity, state, version: record.version },
    saved,
    fields,
    availableSku: fields.selectedSkus.find((sku) => available.some((item) => item.sku === sku))
      ?? available[0]?.sku
      ?? '',
  }
}

function initialEcommerceState() {
  const catalog = readStorefrontCatalog()
  return {
    catalog,
    storeName: DEFAULT_STORE_NAME,
    summary: DEFAULT_STORE_SUMMARY,
    selectedSkus: defaultSelection(catalog.items),
  }
}

export function EcommerceProduct() {
  const navigate = useNavigate()
  const [initialState] = useState(initialEcommerceState)
  const [catalog, setCatalog] = useState<EcommerceCatalog>(initialState.catalog)
  const [catalogHydrating, setCatalogHydrating] = useState(true)
  const [managedIdentity, setManagedIdentity] = useState<ManagedIdentity | null>(null)
  const [managedInbox, setManagedInbox] = useState<ManagedInboxContext | null>(null)
  const [savedDraft, setSavedDraft] = useState<ManagedStorefrontSaved | null>(null)
  const [draftReadStatus, setDraftReadStatus] = useState<StorefrontDraftReadResult['status']>('empty')
  const [draftIssue, setDraftIssue] = useState('')
  const [draftNotice, setDraftNotice] = useState('')
  const [draftBusy, setDraftBusy] = useState(false)
  const [missingSelectionReviewed, setMissingSelectionReviewed] = useState(false)
  const [storeName, setStoreName] = useState(initialState.storeName)
  const [summary, setSummary] = useState(initialState.summary)
  const [selectedSkus, setSelectedSkus] = useState(initialState.selectedSkus)
  const [device, setDevice] = useState<PreviewDevice>('phone')
  const [mobileWorkspace, setMobileWorkspace] = useState<'setup' | 'preview'>('setup')
  const [digestState, setDigestState] = useState({ previewJson: '', value: '', error: '' })
  const [requestLedger, setRequestLedger] = useState(createEmptyStorefrontRequestLedger)
  const [requestCustomer, setRequestCustomer] = useState('')
  const [requestSku, setRequestSku] = useState(initialState.selectedSkus[0] ?? '')
  const [requestQuantity, setRequestQuantity] = useState(1)
  const [requestFulfilment, setRequestFulfilment] = useState<'pickup' | 'delivery'>('pickup')
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestBusy, setRequestBusy] = useState(false)
  const [requestNotice, setRequestNotice] = useState('')
  const [handoffConfirmed, setHandoffConfirmed] = useState(false)
  const [handoffBusy, setHandoffBusy] = useState(false)
  const requestPanelRef = useRef<HTMLDetailsElement>(null)
  const requestCustomerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let current = true
    void currentManagedIdentity()
      .then(async (identity) => {
        if (!current) return
        if (!identity) {
          const saved = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE)
          const localDraft = savedLocalDraft(saved.draft)
          const fields = draftFieldsForCatalog(localDraft, initialState.catalog.items)
          setSavedDraft(localDraft)
          setDraftReadStatus(saved.status)
          setDraftIssue(saved.error)
          setStoreName(fields.storeName)
          setSummary(fields.summary)
          setSelectedSkus(fields.selectedSkus)
          setRequestSku((sku) => fields.selectedSkus.includes(sku) ? sku : fields.selectedSkus[0] ?? '')
          setMissingSelectionReviewed(false)
          setCatalogHydrating(false)
          return
        }
        setManagedIdentity(identity)
        const bootstrap = await loadManagedBootstrap(identity)
        if (!current) return
        const view = resolveManagedStorefront(identity, bootstrap.states.commerce)
        if (!view) {
          setManagedInbox(null)
          setSavedDraft(null)
          setDraftReadStatus('empty')
          setDraftIssue('')
          setStoreName(DEFAULT_STORE_NAME)
          setSummary(DEFAULT_STORE_SUMMARY)
          setSelectedSkus([])
          setCatalog({ source: 'unavailable', items: [], error: 'Create the managed Shop catalog before opening its Ecommerce storefront.' })
          setRequestSku('')
          setRequestLedger(createEmptyStorefrontRequestLedger())
          setHandoffConfirmed(false)
          setMissingSelectionReviewed(false)
          setCatalogHydrating(false)
          return
        }
        setSavedDraft(view.saved)
        setDraftReadStatus(view.saved ? 'ready' : 'empty')
        setDraftIssue('')
        setStoreName(view.fields.storeName)
        setSummary(view.fields.summary)
        setSelectedSkus(view.fields.selectedSkus)
        setRequestSku(view.availableSku)
        setRequestLedger(createEmptyStorefrontRequestLedger())
        setHandoffConfirmed(false)
        setRequestNotice('')
        setMissingSelectionReviewed(false)
        setManagedInbox(view.inbox)
        setCatalog({ source: 'managed-shop', items: view.inbox.state.items, error: '' })
        setCatalogHydrating(false)
      })
      .catch((error) => {
        if (!current) return
        setManagedInbox(null)
        setCatalog({
          source: 'unavailable',
          items: [],
          error: error instanceof Error ? error.message : 'The authenticated Shop catalog could not be loaded.',
        })
        setSelectedSkus([])
        setRequestSku('')
        setRequestLedger(createEmptyStorefrontRequestLedger())
        setHandoffConfirmed(false)
        setSavedDraft(null)
        setDraftReadStatus('unavailable')
        setDraftIssue('Authenticated storefront setup could not be resolved. Nothing was loaded or replaced.')
        setCatalogHydrating(false)
      })
    return () => { current = false }
  }, [initialState.catalog.items])

  useEffect(() => {
    if (managedIdentity) return
    function refreshSavedDraft(event: StorageEvent) {
      if (event.key !== storefrontDraftStorageKey(LOCAL_STOREFRONT_DRAFT_SCOPE)) return
      const latest = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE)
      setSavedDraft(savedLocalDraft(latest.draft))
      setDraftReadStatus(latest.status)
      setDraftIssue(latest.error)
      setMissingSelectionReviewed(false)
      setDraftNotice('Saved storefront setup changed in another tab. Current edits were kept; Discard loads the latest saved version.')
    }
    window.addEventListener('storage', refreshSavedDraft)
    return () => window.removeEventListener('storage', refreshSavedDraft)
  }, [managedIdentity])

  const previewResult = useMemo(() => {
    try {
      return {
        preview: buildStorefrontPreview(catalog.items, { storeName, summary, selectedSkus }),
        error: '',
      }
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : 'Storefront preview is invalid.',
      }
    }
  }, [catalog.items, selectedSkus, storeName, summary])
  const previewJson = previewResult.preview ? JSON.stringify(previewResult.preview) : ''
  const savedDraftIsCurrent = Boolean(savedDraft
    && savedDraft.storeName === storeName
    && savedDraft.summary === summary
    && savedDraft.selectedSkus.length === selectedSkus.length
    && savedDraft.selectedSkus.every((sku) => selectedSkus.includes(sku)))
  const hasUnsavedStorefront = !savedDraftIsCurrent
  const savedSelectionReconciliation = useMemo(
    () => savedDraft
      ? reconcileStorefrontSelection(savedDraft.selectedSkus, catalog.items.map((item) => item.sku))
      : { selectedSkus: [], missingSkus: [] },
    [catalog.items, savedDraft],
  )
  const missingSavedSkus = catalogHydrating ? [] : savedSelectionReconciliation.missingSkus
  const selectionReviewRequired = missingSavedSkus.length > 0 && !missingSelectionReviewed
  const draftStorageBlocked = !managedIdentity
    && (draftReadStatus === 'invalid' || draftReadStatus === 'unavailable')

  useEffect(() => {
    let current = true
    if (!previewResult.preview) return () => { current = false }
    void storefrontPreviewDigest(previewResult.preview)
      .then((value) => {
        if (current) setDigestState({ previewJson, value, error: '' })
      })
      .catch((error) => {
        if (current) setDigestState({ previewJson, value: '', error: error instanceof Error ? error.message : 'Preview digest failed.' })
      })
    return () => { current = false }
  }, [previewJson, previewResult.preview])

  function toggleSku(sku: string) {
    setDraftNotice('')
    if (missingSavedSkus.length) setMissingSelectionReviewed(true)
    setSelectedSkus((current) => (
      current.includes(sku)
        ? current.filter((candidate) => candidate !== sku)
        : current.length < 8 ? [...current, sku] : current
    ))
  }

  function showMobileWorkspace(view: 'setup' | 'preview') {
    setMobileWorkspace(view)
    if (!window.matchMedia('(max-width: 840px)').matches) return
    requestAnimationFrame(() => {
      document.getElementById(`ecommerce-${view}-panel`)?.scrollIntoView({ block: 'start' })
    })
  }

  function applyManagedView(view: ManagedStorefrontView, replaceEdits: boolean) {
    setManagedInbox(view.inbox)
    setCatalog({ source: 'managed-shop', items: view.inbox.state.items, error: '' })
    setSavedDraft(view.saved)
    setDraftReadStatus(view.saved ? 'ready' : 'empty')
    setDraftIssue('')
    setRequestSku((sku) => (
      view.inbox.state.items.some((item) => item.sku === sku && item.onHand > 0)
        ? sku
        : view.availableSku
    ))
    setMissingSelectionReviewed(false)
    if (!replaceEdits) return
    setStoreName(view.fields.storeName)
    setSummary(view.fields.summary)
    setSelectedSkus(view.fields.selectedSkus)
  }

  async function saveManagedStorefront(identity: ManagedIdentity) {
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Secure command identity is unavailable. Nothing was saved.')
    }
    const currentIdentity = await currentManagedIdentity()
    if (!currentIdentity
      || currentIdentity.workspaceId !== identity.workspaceId
      || currentIdentity.userId !== identity.userId) {
      throw new Error('The managed workspace identity changed. Reload before saving.')
    }
    const bootstrap = await loadManagedBootstrap(identity)
    const view = resolveManagedStorefront(identity, bootstrap.states.commerce)
    if (!view) throw new Error('Create the managed Shop catalog before saving its Ecommerce storefront.')
    applyManagedView(view, false)
    const currentSkus = new Set(view.inbox.state.items.map((item) => item.sku))
    if (selectedSkus.some((sku) => !currentSkus.has(sku))) {
      throw new Error('The Shop catalog changed. Current edits were kept; review the product selection and save again.')
    }
    const plan = await prepareManagedStorefrontSave(
      view.inbox.state,
      { storeName, summary, selectedSkus },
      identity.userId,
      new Date().toISOString(),
    )
    if (plan.status === 'unchanged') {
      const confirmedIdentity = await currentManagedIdentity()
      if (!confirmedIdentity
        || confirmedIdentity.workspaceId !== identity.workspaceId
        || confirmedIdentity.userId !== identity.userId) {
        throw new Error('The managed identity changed before the saved storefront could be confirmed.')
      }
      const saved = readManagedStorefront(plan.next)
      if (!saved) throw new Error('The saved storefront configuration could not be read.')
      setSavedDraft(saved)
      setDraftReadStatus('ready')
      setStoreName(saved.storeName)
      setSummary(saved.summary)
      setSelectedSkus(saved.selectedSkus)
      setDraftNotice(`Already saved in ${identity.workspaceId} as revision ${saved.revision}.`)
      return
    }
    const commandId = globalThis.crypto.randomUUID()
    const result = await saveManagedCommerceCommand({
      commandId,
      evidence: plan.evidence,
      eventType: 'commerce.storefront.configuration.saved',
      expectedVersion: view.inbox.version,
      identity,
      state: plan.next as unknown as Record<string, unknown>,
    })
    const receipt = acceptManagedStorefrontCommand(plan, result, {
      commandId,
      priorVersion: view.inbox.version,
      actor: identity.userId,
    })
    const confirmedIdentity = await currentManagedIdentity()
    if (!confirmedIdentity
      || confirmedIdentity.workspaceId !== identity.workspaceId
      || confirmedIdentity.userId !== identity.userId) {
      throw new Error('The managed identity changed before the storefront save was confirmed.')
    }
    const accepted = receipt.state
    const saved = readManagedStorefront(accepted)
    if (!saved) throw new Error('The accepted storefront configuration could not be read.')
    setManagedInbox({ identity, state: accepted, version: receipt.version })
    setCatalog({ source: 'managed-shop', items: accepted.items, error: '' })
    setSavedDraft(saved)
    setDraftReadStatus('ready')
    setDraftIssue('')
    setStoreName(saved.storeName)
    setSummary(saved.summary)
    setSelectedSkus(saved.selectedSkus)
    setMissingSelectionReviewed(false)
    setDraftNotice(`Saved to ${identity.workspaceId} as revision ${saved.revision}.`)
  }

  async function saveCurrentStorefront() {
    if (!previewResult.preview
      || catalogHydrating
      || selectionReviewRequired
      || draftBusy
      || draftStorageBlocked) return
    setDraftBusy(true)
    setDraftNotice('')
    try {
      if (managedIdentity) {
        await saveManagedStorefront(managedIdentity)
        return
      }
      const saved = await saveStorefrontDraft(
        { storeName, summary, selectedSkus },
        savedDraft?.revision ?? 0,
        LOCAL_STOREFRONT_DRAFT_SCOPE,
      )
      setSavedDraft(savedLocalDraft(saved))
      setDraftReadStatus('ready')
      setDraftIssue('')
      setStoreName(saved.storeName)
      setSummary(saved.summary)
      setSelectedSkus(saved.selectedSkus)
      setMissingSelectionReviewed(false)
      setDraftNotice(`Storefront saved on this device as revision ${saved.revision}.`)
    } catch (error) {
      if (managedIdentity && error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const identity = await currentManagedIdentity()
          if (!identity || identity.workspaceId !== managedIdentity.workspaceId || identity.userId !== managedIdentity.userId) {
            throw new Error('The managed workspace identity changed before the conflict could be refreshed.')
          }
          const bootstrap = await loadManagedBootstrap(identity)
          const view = resolveManagedStorefront(identity, bootstrap.states.commerce)
          if (!view) throw new Error('The managed Shop catalog is no longer available.')
          applyManagedView(view, false)
          setDraftNotice('Workspace changed in another session. The latest saved revision is loaded; current edits were kept for review.')
        } catch (refreshError) {
          setDraftIssue(refreshError instanceof Error ? refreshError.message : 'The latest managed storefront could not be loaded.')
          setDraftNotice('The storefront save conflicted and the latest workspace revision could not be confirmed.')
        }
      } else if (managedIdentity) {
        setDraftNotice(error instanceof Error ? error.message : 'The managed storefront was not confirmed. Current edits were kept.')
      } else {
        const latest = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE)
        setSavedDraft(savedLocalDraft(latest.draft))
        setDraftReadStatus(latest.status)
        setDraftIssue(latest.error)
        setDraftNotice(error instanceof Error ? error.message : 'Storefront setup was not saved.')
      }
    } finally {
      setDraftBusy(false)
    }
  }

  function discardStorefrontChanges() {
    const selected = savedDraft ? savedSelectionReconciliation.selectedSkus : defaultSelection(catalog.items)
    setStoreName(savedDraft?.storeName ?? DEFAULT_STORE_NAME)
    setSummary(savedDraft?.summary ?? DEFAULT_STORE_SUMMARY)
    setSelectedSkus(selected)
    setMissingSelectionReviewed(false)
    setDraftNotice(savedDraft
      ? savedSelectionReconciliation.missingSkus.length === 0
        ? 'Unsaved storefront changes were discarded.'
        : 'Available saved products were restored. Removed Shop SKUs still need review before saving.'
      : 'Current Shop defaults were restored. The storefront is still not saved.')
  }

  function openRequestFor(sku: string) {
    if (catalogHydrating) return
    setRequestSku(sku)
    setRequestOpen(true)
    setHandoffConfirmed(false)
    setRequestNotice('')
    window.requestAnimationFrame(() => {
      requestPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      requestCustomerRef.current?.focus({ preventScroll: true })
    })
  }

  async function createRequestReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!previewResult.preview || !digest || catalogHydrating || requestBusy) return
    if (!globalThis.crypto?.randomUUID) {
      setRequestNotice('Secure request identity is unavailable. Nothing was recorded.')
      return
    }
    setRequestBusy(true)
    setRequestNotice('')
    try {
      const selectedSku = previewResult.preview.items.some((item) => item.sku === requestSku)
        ? requestSku
        : previewResult.preview.items[0]?.sku ?? ''
      const request = await buildStorefrontOrderRequest(previewResult.preview, digest, {
        idempotencyKey: `ECI-${globalThis.crypto.randomUUID().toUpperCase()}`,
        customerReference: requestCustomer,
        sku: selectedSku,
        quantity: requestQuantity,
        fulfilment: requestFulfilment,
        createdAt: new Date().toISOString(),
      })
      const nextLedger = recordStorefrontOrderRequest(requestLedger, request)
      if (!nextLedger) throw new Error('The request receipt conflicted with the current local ledger.')
      setRequestLedger(nextLedger)
      setHandoffConfirmed(false)
      setRequestNotice(`${request.id} is awaiting Shop handoff. No Shop record or stock changed.`)
    } catch (error) {
      setRequestNotice(error instanceof Error ? error.message : 'Request receipt failed closed.')
    } finally {
      setRequestBusy(false)
    }
  }

  async function sendToShopReview() {
    if (!latestRequest || !previewResult.preview || !digest || !handoffConfirmed || handoffBusy) return
    setHandoffBusy(true)
    setRequestNotice('')
    try {
      const currentCatalog = readStorefrontCatalog()
      if (currentCatalog.source === 'unavailable') throw new Error(currentCatalog.error || 'Current Shop catalog is unavailable.')
      const draft = await confirmEcommerceShopDraft({
        request: latestRequest,
        requestLedger,
        preview: previewResult.preview,
        sourcePreviewDigest: digest,
        currentCatalog: currentCatalog.items,
        confirmedAt: new Date().toISOString(),
      })
      setRequestNotice(`${draft.id} is ready for human review in Shop. No stock or order changed.`)
      navigate('/shop/?tab=orders&source=ecommerce', { state: { ecommerceShopDraft: draft } })
    } catch (error) {
      setRequestNotice(error instanceof Error ? error.message : 'Shop handoff failed closed.')
    } finally {
      setHandoffBusy(false)
    }
  }

  async function retainInManagedInbox() {
    if (!latestRequest || !handoffConfirmed || handoffBusy) return
    setHandoffBusy(true)
    setRequestNotice('')
    try {
      if (!previewResult.preview) throw new Error('The current storefront preview is unavailable.')
      const currentDigest = await storefrontPreviewDigest(previewResult.preview)
      if (latestRequest.sourcePreviewDigest !== currentDigest || digest !== currentDigest) {
        throw new Error('The storefront changed after this request receipt was created. Create and review a new receipt.')
      }
      const identity = await currentManagedIdentity()
      if (!identity) throw new Error('Connect an authenticated workspace in Settings before saving this request.')
      if (!managedIdentity
        || identity.workspaceId !== managedIdentity.workspaceId
        || identity.userId !== managedIdentity.userId) {
        throw new Error('The managed workspace changed. Reload Ecommerce before retaining this request.')
      }
      const bootstrap = await loadManagedBootstrap(identity)
      const record = bootstrap.states.commerce
      if (record.surface !== 'commerce' || !Number.isSafeInteger(record.version) || record.version < 1) {
        throw new Error('The managed Shop catalog is not ready for Ecommerce requests.')
      }
      const currentState = validateCommerceState(record.state)
      const proof = {
        actionId: `ACT-${latestRequest.id.slice(4)}`,
        capturedAt: latestRequest.createdAt,
        actor: identity.userId,
        reason: 'Retain this customer request for human Shop review.',
        evidenceReference: `ECOMMERCE:${latestRequest.id}:${latestRequest.sourcePreviewDigest}`,
      }
      const nextState = recordCommerceStorefrontRequest(currentState, latestRequest, proof)
      if (!nextState) throw new Error('The Ecommerce request conflicts with the current managed Shop inbox.')
      if (nextState === currentState) {
        setManagedInbox({ identity, state: currentState, version: record.version })
        setRequestNotice(`${latestRequest.id} is already retained in the managed Shop inbox.`)
        navigate('/shop/?tab=orders&source=ecommerce-inbox')
        return
      }
      const commandId = latestRequest.idempotencyKey.slice(4)
      const result = await saveManagedCommerceCommand({
        commandId,
        evidence: proof,
        eventType: 'commerce.storefront_request.received',
        expectedVersion: record.version,
        identity,
        state: nextState as unknown as Record<string, unknown>,
      })
      if (result.command_id !== commandId
        || result.surface !== 'commerce'
        || result.event_type !== 'commerce.storefront_request.received'
        || result.version !== record.version + 1
        || typeof result.idempotent_replay !== 'boolean') {
        throw new Error('The managed Shop returned an invalid Ecommerce inbox receipt.')
      }
      const confirmedIdentity = await currentManagedIdentity()
      if (!confirmedIdentity
        || confirmedIdentity.workspaceId !== identity.workspaceId
        || confirmedIdentity.userId !== identity.userId) {
        throw new Error('The managed identity changed before the Ecommerce inbox receipt was confirmed.')
      }
      const accepted = validateCommerceState(result.state)
      const retained = commerceStorefrontRequests(accepted).find((candidate) => candidate.id === latestRequest.id)
      if (!retained || JSON.stringify(retained) !== JSON.stringify(latestRequest)
        || JSON.stringify(accepted.items) !== JSON.stringify(currentState.items)
        || JSON.stringify(accepted.orders) !== JSON.stringify(currentState.orders)
        || JSON.stringify(accepted.movements) !== JSON.stringify(currentState.movements)
        || JSON.stringify(accepted.closes) !== JSON.stringify(currentState.closes)
        || JSON.stringify(accepted.websiteIntakes ?? []) !== JSON.stringify(currentState.websiteIntakes ?? [])
        || JSON.stringify(accepted.storefrontConfiguration ?? null) !== JSON.stringify(currentState.storefrontConfiguration ?? null)) {
        throw new Error('The managed Ecommerce receipt changed Shop records and was rejected by the client.')
      }
      setManagedIdentity(identity)
      setManagedInbox({ identity, state: accepted, version: result.version })
      setRequestNotice(`${latestRequest.id} is retained in ${identity.workspaceId}. No order or stock changed.`)
      navigate('/shop/?tab=orders&source=ecommerce-inbox')
    } catch (error) {
      setRequestNotice(error instanceof Error ? error.message : 'The managed request was not confirmed. Nothing was claimed.')
    } finally {
      setHandoffBusy(false)
    }
  }

  const sourceLabel = catalog.source === 'shop-local'
    ? 'Current local Shop catalog'
    : catalog.source === 'managed-shop'
      ? `Managed Shop · ${managedInbox?.identity.workspaceId ?? 'authenticated'}`
      : catalog.source === 'sample'
      ? 'Sample Shop catalog'
      : 'Catalog unavailable'
  const digest = digestState.previewJson === previewJson ? digestState.value : ''
  const digestError = digestState.previewJson === previewJson ? digestState.error : ''
  const currentRequestSku = previewResult.preview?.items.some((item) => item.sku === requestSku)
    ? requestSku
    : previewResult.preview?.items[0]?.sku ?? ''
  const latestRequest = requestLedger.requests[0]

  return (
    <div className="workspace-screen ecommerce-product">
      <header className="ecommerce-heading">
        <div>
          <span className="core-eyebrow">{managedIdentity ? 'Managed storefront' : 'Local preview'}</span>
          <h1>Ecommerce</h1>
          <p>Shape a simple customer storefront from Shop, then retain customer requests for human review.</p>
        </div>
        <Link className="text-link" to="/shop/?tab=inventory">Open Shop stock</Link>
      </header>

      <div className="ecommerce-boundary" role="status">
        <span>{sourceLabel}</span>
        <p>Prices and availability are read-only. A request can enter the authenticated Shop inbox, but cannot reserve stock, create an order, take payment, send a message, or publish a site.</p>
      </div>

      <div aria-label="Ecommerce workspace" className="ecommerce-mobile-switch" role="group">
        <button aria-controls="ecommerce-setup-panel" aria-pressed={mobileWorkspace === 'setup'} onClick={() => showMobileWorkspace('setup')} type="button">1 · Setup</button>
        <button aria-controls="ecommerce-preview-panel" aria-pressed={mobileWorkspace === 'preview'} onClick={() => showMobileWorkspace('preview')} type="button">2 · Preview</button>
      </div>

      <div className="ecommerce-workspace" data-mobile-view={mobileWorkspace}>
        <section className="core-panel ecommerce-setup" aria-busy={catalogHydrating || draftBusy} aria-labelledby="ecommerce-setup-title" id="ecommerce-setup-panel">
          <div className="panel-head">
            <div><span className="core-eyebrow">1 · Storefront</span><h2 id="ecommerce-setup-title">Choose what customers see</h2></div>
            <span className="status-pill bounded">{selectedSkus.length}/8</span>
          </div>

          <div className="ecommerce-copy-fields">
            <label>
              <span>Store name</span>
              <input disabled={catalogHydrating || draftBusy} maxLength={60} onChange={(event) => { setStoreName(event.target.value); setDraftNotice('') }} value={storeName} />
            </label>
            <label>
              <span>Short description</span>
              <textarea disabled={catalogHydrating || draftBusy} maxLength={180} onChange={(event) => { setSummary(event.target.value); setDraftNotice('') }} rows={3} value={summary} />
            </label>
          </div>

          {missingSavedSkus.length ? (
            <p className="ecommerce-selection-warning" role="status">
              Saved products no longer in this Shop: <strong>{missingSavedSkus.join(', ')}</strong>. {missingSelectionReviewed
                ? 'Current product selection reviewed; save when the preview is ready.'
                : 'Select or remove a current product to confirm the replacement before saving.'}
            </p>
          ) : null}

          <div className="ecommerce-catalog-head">
            <strong>Shop products</strong>
            <small>Select 1–8. Price and availability stay locked.</small>
          </div>
          {catalog.error ? <p className="form-notice warning-text">{catalog.error}</p> : null}
          <div className="ecommerce-catalog-list">
            {catalog.items.map((item) => {
              const selected = selectedSkus.includes(item.sku)
              return (
                <button
                  aria-pressed={selected}
                  className="ecommerce-catalog-item"
                  disabled={catalogHydrating || draftBusy || (!selected && selectedSkus.length >= 8)}
                  key={item.sku}
                  onClick={() => toggleSku(item.sku)}
                  type="button"
                >
                  <span><strong>{item.name}</strong><small>{item.variant || item.sku}</small></span>
                  <span><b>{formatMmk(item.price)}</b><small>{item.onHand > 0 ? 'Available' : 'Sold out'}</small></span>
                  <i aria-hidden="true">{selected ? '✓' : '+'}</i>
                </button>
              )
            })}
          </div>

          <div
            aria-live="polite"
            className="ecommerce-save-bar"
            data-state={savedDraftIsCurrent ? 'saved' : draftStorageBlocked ? 'blocked' : 'unsaved'}
            role="status"
          >
            <div>
              <strong>{catalogHydrating
                ? 'Checking storefront workspace'
                : draftStorageBlocked
                ? 'Saved setup needs recovery'
                : savedDraftIsCurrent
                ? managedIdentity
                  ? `Saved to workspace · revision ${savedDraft?.revision}`
                  : `Saved on this device · revision ${savedDraft?.revision}`
                : savedDraft ? 'Unsaved changes' : 'Not saved yet'}</strong>
              <small>{catalogHydrating
                ? 'Editing unlocks after the local or managed Shop scope is confirmed.'
                : draftIssue || (savedDraftIsCurrent && savedDraft
                ? `Saved ${new Date(savedDraft.savedAt).toLocaleString()}`
                : managedIdentity
                  ? 'Save the storefront name, description, and selected products to this workspace.'
                  : 'Save the storefront name, description, and selected products for the next visit.')}</small>
              {draftStorageBlocked
                ? <Link className="text-link" to="/settings/#controls">Open recovery settings</Link>
                : null}
            </div>
            <div className="ecommerce-save-actions">
              <button className="core-button secondary" disabled={!hasUnsavedStorefront || catalogHydrating || draftBusy} onClick={discardStorefrontChanges} type="button">Discard</button>
              <button
                className="core-button primary"
                disabled={!hasUnsavedStorefront || !previewResult.preview || catalogHydrating || selectionReviewRequired || draftBusy || draftStorageBlocked}
                onClick={() => void saveCurrentStorefront()}
                type="button"
              >
                {draftBusy ? 'Saving…' : 'Save storefront'}
              </button>
            </div>
          </div>
          <p className="ecommerce-save-notice" aria-live="polite">{draftNotice}</p>
        </section>

        <section className="core-panel ecommerce-preview-panel" aria-labelledby="ecommerce-preview-title" id="ecommerce-preview-panel">
          <div className="panel-head ecommerce-preview-head">
            <div><span className="core-eyebrow">2 · Preview</span><h2 id="ecommerce-preview-title">Customer view</h2></div>
            <div className="segmented-control" role="group" aria-label="Preview size">
              <button aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} type="button">Phone</button>
              <button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} type="button">Desktop</button>
            </div>
          </div>

          <div className={`ecommerce-preview-frame is-${device}`}>
            {previewResult.preview ? (
              <div className="storefront-preview">
                <header>
                  <span>&gt;_ {previewResult.preview.storeName}</span>
                  <b>{previewResult.preview.items.length} products</b>
                </header>
                <section className="storefront-hero">
                  <small>BROWSE &amp; REQUEST</small>
                  <h3>{previewResult.preview.storeName}</h3>
                  <p>{previewResult.preview.summary}</p>
                </section>
                <div className="storefront-grid">
                  {previewResult.preview.items.map((item) => {
                    const available = item.availability === 'available'
                    return (
                    <article
                      className="has-request-action"
                      data-requested={requestOpen && currentRequestSku === item.sku ? 'true' : 'false'}
                      key={item.sku}
                    >
                      <div aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</div>
                      <small>{item.variant || item.sku}</small>
                      <strong>{item.name}</strong>
                      <span>{formatMmk(item.unitPriceMmk)}</span>
                      <b>{available ? 'Available' : 'Sold out'}</b>
                      <button
                        aria-controls="ecommerce-request-form"
                        aria-label={available ? `Request ${item.name}` : `${item.name} is sold out`}
                        className="storefront-request-button"
                        disabled={!available || catalogHydrating}
                        onClick={() => openRequestFor(item.sku)}
                        type="button"
                      >
                        {available ? 'Request' : 'Sold out'}
                      </button>
                    </article>
                    )
                  })}
                </div>
                <footer>Requests enter Shop review. Payment and fulfilment stay separate.</footer>
              </div>
            ) : (
              <div className="ecommerce-preview-empty">
                <span>&gt;_</span>
                <strong>Preview needs attention</strong>
                <p>{previewResult.error}</p>
              </div>
            )}
          </div>

          <details
            className="ecommerce-request-lab"
            onToggle={(event) => setRequestOpen(event.currentTarget.open)}
            open={requestOpen}
            ref={requestPanelRef}
          >
            <summary>
              <span><strong>Request an item</strong><small>Choose quantity and pickup or delivery</small></span>
              <b>{requestLedger.requests.length ? `${requestLedger.requests.length} pending` : 'Start'}</b>
            </summary>
            <div className="ecommerce-request-body" id="ecommerce-request-form">
              <form onSubmit={(event) => void createRequestReceipt(event)}>
                <label>
                  <span>Customer reference</span>
                  <input
                    maxLength={80}
                    onChange={(event) => setRequestCustomer(event.target.value)}
                    placeholder="Name or counter reference"
                    ref={requestCustomerRef}
                    required
                    value={requestCustomer}
                  />
                </label>
                <label>
                  <span>Product</span>
                  <select onChange={(event) => setRequestSku(event.target.value)} required value={currentRequestSku}>
                    {previewResult.preview?.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {formatMmk(item.unitPriceMmk)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Quantity</span>
                  <input max={99} min={1} onChange={(event) => setRequestQuantity(Number(event.target.value))} required type="number" value={requestQuantity} />
                </label>
                <label>
                  <span>Fulfilment</span>
                  <select onChange={(event) => setRequestFulfilment(event.target.value as 'pickup' | 'delivery')} value={requestFulfilment}>
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery request</option>
                  </select>
                </label>
                <button className="core-button primary" disabled={!previewResult.preview || !digest || catalogHydrating || requestBusy} type="submit">
                  {requestBusy ? 'Recording…' : 'Create request'}
                </button>
              </form>

              {latestRequest ? (
                <article className="ecommerce-request-receipt">
                  <span className="status-pill bounded">Awaiting Shop handoff</span>
                  <strong>{latestRequest.id}</strong>
                  <p>{latestRequest.customerReference} · {latestRequest.line.name} × {latestRequest.line.quantity}</p>
                  <b>{formatMmk(latestRequest.totalMmk)}</b>
                  <small>{latestRequest.fulfilment} · preview {latestRequest.sourcePreviewDigest.slice(7, 19)}</small>
                </article>
              ) : null}
              {latestRequest ? <>
                <label className="website-intake-confirm">
                  <input checked={handoffConfirmed} onChange={(event) => setHandoffConfirmed(event.target.checked)} type="checkbox" />
                  <span>I reviewed the SKU, quantity, MMK price, and current availability.</span>
                </label>
                <button className="core-button primary" disabled={!handoffConfirmed || !digest || catalogHydrating || handoffBusy} onClick={() => void (managedIdentity ? retainInManagedInbox() : sendToShopReview())} type="button">
                  {handoffBusy ? 'Checking…' : managedIdentity ? 'Save to Shop inbox' : 'Open draft in Shop'}
                </button>
              </> : null}
              <p className="form-notice" aria-live="polite">{requestNotice || (managedIdentity
                ? 'Confirm the exact receipt, then retain it in the managed Shop inbox. It remains request intent only.'
                : 'This local receipt is not a Shop order. Connect a managed workspace for shared, recoverable retention.')}</p>
            </div>
          </details>

          <details className="ecommerce-verification" open={digestError ? true : undefined}>
            <summary>
              <span><strong>Preview verification</strong><small>Technical proof for operators</small></span>
              <b>{digestError ? 'Attention' : digest ? 'Ready' : 'Checking'}</b>
            </summary>
            <div className="ecommerce-digest" aria-live="polite">
              <span>Preview digest</span>
              <code>{digest || (digestError ? 'Unavailable' : 'Calculating…')}</code>
              <small>{digestError || 'Same approved copy and Shop snapshot produce the same digest.'}</small>
            </div>
          </details>
        </section>
      </div>
    </div>
  )
}
