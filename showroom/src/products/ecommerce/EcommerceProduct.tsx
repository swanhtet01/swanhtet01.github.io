import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import {
  COMMERCE_KEY,
  commerceCatalogDigest,
  commerceCatalogDigestSource,
  commerceStorefrontConfiguration,
  commerceStorefrontRequestEquals,
  commerceStorefrontRequests,
  recordCommerceStorefrontRequest,
  validateCommerceState,
  type CommerceItem,
  type CommerceState,
  type CommerceStorefrontMerchandising,
} from '../../core/commerce-workspace'
import {
  currentManagedIdentity,
  loadManagedBootstrap,
  ManagedTrialError,
  requireManagedSurfaceState,
  saveManagedCommerceCommand,
  type ManagedIdentity,
  type ManagedStateRecord,
} from '../../core/managed-trial'
import { EcommerceBuyingWorkspace } from './EcommerceBuyingWorkspace'
import {
  type EcommerceCartLine,
  type EcommerceOrderRequestV2,
  type EcommerceShopDraftV2,
} from './ecommerce-buying-lifecycle'
import {
  acceptManagedStorefrontCommand,
  prepareManagedStorefrontSave,
  readManagedStorefront,
  type ManagedStorefrontSaved,
} from './managed-storefront'
import {
  buildStorefrontPreview,
  readStorefrontCatalog,
  storefrontPreviewDigest,
  type StorefrontPreviewItem,
} from './storefront-model'
import {
  LOCAL_STOREFRONT_DRAFT_SCOPE,
  legacyStorefrontDraftStorageKey,
  readStorefrontDraft,
  reconcileStorefrontSelection,
  saveStorefrontDraft,
  storefrontDraftStorageKey,
  type LegacyStorefrontDraft,
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
type SavedStorefrontState = ManagedStorefrontSaved & {
  localPreviewDigest?: string
}
type ManagedInboxContext = {
  identity: ManagedIdentity
  state: CommerceState
  version: number
}
type ManagedStorefrontView = {
  inbox: ManagedInboxContext
  saved: SavedStorefrontState | null
  fields: {
    storeName: string
    summary: string
    selectedSkus: string[]
    merchandising: CommerceStorefrontMerchandising[] | null
  }
  availableSku: string
}

const DEFAULT_STORE_NAME = 'Mingalar Market'
const DEFAULT_STORE_SUMMARY = 'Everyday essentials for pickup or delivery, with clear local pricing.'

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

function defaultSelection(items: CommerceItem[]) {
  return items.filter((item) => item.onHand > 0).slice(0, 4).map((item) => item.sku)
}

function cloneMerchandising(value: CommerceStorefrontMerchandising[] | undefined) {
  return value?.map((entry) => ({ ...entry })) ?? null
}

function storefrontDisplayName(item: StorefrontPreviewItem) {
  return item.merchandising?.displayName || item.name
}

function storefrontArtworkKind(sku: string) {
  return Array.from(sku).reduce((total, character) => total + character.charCodeAt(0), 0) % 5
}

function StorefrontProductArtwork({ sku }: { sku: string }) {
  const kind = storefrontArtworkKind(sku)
  if (kind === 1) return <svg aria-hidden="true" className="storefront-product-art" data-art={kind} focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><rect className="art-main" height="48" rx="7" width="18" x="20" y="34" /><rect className="art-main" height="58" rx="7" width="18" x="41" y="24" /><rect className="art-main" height="44" rx="7" width="18" x="62" y="38" /><path className="art-highlight" d="M24 42h10M45 33h10M66 46h10" /></svg>
  if (kind === 2) return <svg aria-hidden="true" className="storefront-product-art" data-art={kind} focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><path className="art-main" d="M27 23h46l7 58H20z" /><path className="art-highlight" d="M32 39h36M39 57h22" /><circle className="art-detail" cx="50" cy="69" r="6" /></svg>
  if (kind === 3) return <svg aria-hidden="true" className="storefront-product-art" data-art={kind} focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><rect className="art-main" height="48" rx="9" width="28" x="22" y="35" /><rect className="art-main" height="55" rx="9" width="26" x="55" y="28" /><path className="art-highlight" d="M29 28h15v8M62 20h13v9M30 54h12M62 49h12" /></svg>
  if (kind === 4) return <svg aria-hidden="true" className="storefront-product-art" data-art={kind} focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><rect className="art-main" height="58" rx="10" width="62" x="19" y="23" /><path className="art-detail" d="M50 67 34 53c-9-9 4-21 16-8 12-13 25-1 16 8z" /><path className="art-highlight" d="M27 32h46" /></svg>
  return <svg aria-hidden="true" className="storefront-product-art" data-art={kind} focusable="false" viewBox="0 0 100 100"><rect className="art-soft" height="88" rx="18" width="88" x="6" y="6" /><path className="art-highlight" d="M30 41c2-18 38-18 40 0" /><path className="art-main" d="M18 42h64l-8 39H26z" /><rect className="art-detail" height="21" rx="4" width="15" x="31" y="50" /><circle className="art-detail" cx="59" cy="60" r="10" /></svg>
}

function savedLocalDraft(draft: StorefrontDraft | LegacyStorefrontDraft | null): SavedStorefrontState | null {
  if (!draft) return null
  return {
    revision: draft.revision,
    savedAt: draft.savedAt,
    storeName: draft.storeName,
    summary: draft.summary,
    selectedSkus: [...draft.selectedSkus],
    ...('sourcePreviewDigest' in draft ? { localPreviewDigest: draft.sourcePreviewDigest } : {}),
  }
}

function draftFieldsForCatalog(saved: SavedStorefrontState | null, items: CommerceItem[]) {
  if (!saved) {
    return {
      storeName: DEFAULT_STORE_NAME,
      summary: DEFAULT_STORE_SUMMARY,
      selectedSkus: defaultSelection(items),
      merchandising: null,
    }
  }
  const reconciliation = reconcileStorefrontSelection(saved.selectedSkus, items.map((item) => item.sku))
  const retainedMerchandising = saved.merchandising
    ?.filter((entry) => reconciliation.selectedSkus.includes(entry.sku))
    .map((entry) => ({ ...entry }))
  return {
    storeName: saved.storeName,
    summary: saved.summary,
    selectedSkus: reconciliation.selectedSkus,
    merchandising: retainedMerchandising?.length === reconciliation.selectedSkus.length
      && reconciliation.selectedSkus.length > 0
      ? retainedMerchandising
      : null,
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
    merchandising: null,
  }
}

export function EcommerceProduct() {
  const navigate = useNavigate()
  const [initialState] = useState(initialEcommerceState)
  const [catalog, setCatalog] = useState<EcommerceCatalog>(initialState.catalog)
  const [catalogHydrating, setCatalogHydrating] = useState(true)
  const [managedIdentity, setManagedIdentity] = useState<ManagedIdentity | null>(null)
  const [managedInbox, setManagedInbox] = useState<ManagedInboxContext | null>(null)
  const [savedDraft, setSavedDraft] = useState<SavedStorefrontState | null>(null)
  const [draftReadStatus, setDraftReadStatus] = useState<StorefrontDraftReadResult['status']>('empty')
  const [draftIssue, setDraftIssue] = useState('')
  const [draftNotice, setDraftNotice] = useState('')
  const [draftBusy, setDraftBusy] = useState(false)
  const [missingSelectionReviewed, setMissingSelectionReviewed] = useState(false)
  const [storeName, setStoreName] = useState(initialState.storeName)
  const [summary, setSummary] = useState(initialState.summary)
  const [selectedSkus, setSelectedSkus] = useState(initialState.selectedSkus)
  const [merchandising, setMerchandising] = useState<CommerceStorefrontMerchandising[] | null>(initialState.merchandising)
  const [device, setDevice] = useState<PreviewDevice>('phone')
  const [mobileWorkspace, setMobileWorkspace] = useState<'setup' | 'preview'>('preview')
  const [digestState, setDigestState] = useState({ previewJson: '', value: '', error: '' })
  const [managedCatalogDigestState, setManagedCatalogDigestState] = useState({
    source: '',
    value: '',
    error: '',
  })
  const [buyingCart, setBuyingCart] = useState<EcommerceCartLine[]>([])
  const storefrontSaveRef = useRef<HTMLButtonElement>(null)
  const storefrontPreviewHeadingRef = useRef<HTMLHeadingElement>(null)

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
          setMerchandising(fields.merchandising)
          setMissingSelectionReviewed(false)
          setCatalogHydrating(false)
          return
        }
        setManagedIdentity(identity)
        const bootstrap = await loadManagedBootstrap(identity)
        if (!current) return
        const view = resolveManagedStorefront(
          identity,
          requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
        )
        if (!view) {
          setManagedInbox(null)
          setSavedDraft(null)
          setDraftReadStatus('empty')
          setDraftIssue('')
          setStoreName(DEFAULT_STORE_NAME)
          setSummary(DEFAULT_STORE_SUMMARY)
          setSelectedSkus([])
          setMerchandising(null)
          setCatalog({ source: 'unavailable', items: [], error: 'Create the managed Shop catalog before opening its Ecommerce storefront.' })
          setBuyingCart([])
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
        setMerchandising(view.fields.merchandising)
        setBuyingCart([])
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
        setMerchandising(null)
        setBuyingCart([])
        setSavedDraft(null)
        setDraftReadStatus('unavailable')
        setDraftIssue('Authenticated storefront setup could not be resolved. Nothing was loaded or replaced.')
        setCatalogHydrating(false)
      })
    return () => { current = false }
  }, [initialState.catalog.items])

  useEffect(() => {
    if (managedIdentity) return
    const currentDraftKey = storefrontDraftStorageKey(LOCAL_STOREFRONT_DRAFT_SCOPE)
    const legacyDraftKey = legacyStorefrontDraftStorageKey(LOCAL_STOREFRONT_DRAFT_SCOPE)
    function refreshLocalStorefront(event: StorageEvent) {
      if (event.key === COMMERCE_KEY || event.key === null) {
        const latestCatalog = readStorefrontCatalog()
        setCatalog(latestCatalog)
        setBuyingCart((current) => current.filter((line) => (
          latestCatalog.items.some((item) => item.sku === line.sku && item.onHand >= line.quantity)
        )))
        setMissingSelectionReviewed(false)
        setDraftNotice('Shop catalog changed in another tab. Review the customer view and save the storefront again.')
        if (event.key === COMMERCE_KEY) return
      }
      if (event.key !== currentDraftKey
        && event.key !== legacyDraftKey
        && event.key !== null) return
      const latest = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE)
      if (event.key === legacyDraftKey && latest.status === 'ready') return
      setSavedDraft(savedLocalDraft(latest.draft))
      setMerchandising(null)
      setDraftReadStatus(latest.status)
      setDraftIssue(latest.error)
      setMissingSelectionReviewed(false)
      setBuyingCart([])
      setDraftNotice('Saved storefront setup changed in another tab. Current edits were kept; Discard loads the latest saved version.')
    }
    window.addEventListener('storage', refreshLocalStorefront)
    return () => window.removeEventListener('storage', refreshLocalStorefront)
  }, [managedIdentity])

  const previewResult = useMemo(() => {
    try {
      return {
        preview: buildStorefrontPreview(catalog.items, {
          storeName,
          summary,
          selectedSkus,
          ...(merchandising ? { merchandising } : {}),
        }),
        error: '',
      }
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : 'Storefront preview is invalid.',
      }
    }
  }, [catalog.items, merchandising, selectedSkus, storeName, summary])
  const previewJson = previewResult.preview ? JSON.stringify(previewResult.preview) : ''
  const digest = digestState.previewJson === previewJson ? digestState.value : ''
  const digestError = digestState.previewJson === previewJson ? digestState.error : ''
  const managedCatalogSource = managedInbox
    ? commerceCatalogDigestSource(managedInbox.state)
    : ''
  const managedCatalogDigest = managedCatalogDigestState.source === managedCatalogSource
    ? managedCatalogDigestState.value
    : ''
  const managedCatalogDigestError = managedCatalogDigestState.source === managedCatalogSource
    ? managedCatalogDigestState.error
    : ''
  const managedCatalogDigestPending = Boolean(managedInbox
    && !managedCatalogDigest
    && !managedCatalogDigestError)
  const savedFieldsAreCurrent = Boolean(savedDraft
    && savedDraft.storeName === storeName
    && savedDraft.summary === summary
    && savedDraft.selectedSkus.length === selectedSkus.length
    && savedDraft.selectedSkus.every((sku) => selectedSkus.includes(sku))
    && JSON.stringify(savedDraft.merchandising ?? null) === JSON.stringify(merchandising))
  const savedCatalogIsCurrent = managedIdentity
    ? Boolean(savedDraft?.shopCatalogDigest
      && managedCatalogDigest
      && savedDraft.shopCatalogDigest === managedCatalogDigest)
    : Boolean(savedDraft?.localPreviewDigest
      && digest
      && savedDraft.localPreviewDigest === digest)
  const savedDraftIsCurrent = savedFieldsAreCurrent && savedCatalogIsCurrent
  const hasUnsavedStorefront = !savedDraftIsCurrent
  const hasUnsavedFieldChanges = !savedFieldsAreCurrent
  const managedCatalogRebindRequired = Boolean(managedIdentity
    && savedDraft
    && savedFieldsAreCurrent
    && managedCatalogDigest
    && !savedCatalogIsCurrent)
  const localCatalogRebindRequired = Boolean(!managedIdentity
    && savedDraft?.localPreviewDigest
    && savedFieldsAreCurrent
    && digest
    && !savedCatalogIsCurrent)
  const catalogRebindRequired = managedCatalogRebindRequired || localCatalogRebindRequired
  const localFingerprintUpgradeRequired = Boolean(!managedIdentity
    && savedDraft
    && savedFieldsAreCurrent
    && digest
    && !savedDraft.localPreviewDigest)
  const localFingerprintPending = Boolean(!managedIdentity
    && savedDraft
    && savedFieldsAreCurrent
    && !digest
    && !digestError)
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

  useEffect(() => {
    let current = true
    if (!managedInbox) {
      return () => { current = false }
    }
    void commerceCatalogDigest(managedInbox.state)
      .then((value) => {
        if (current) setManagedCatalogDigestState({ source: managedCatalogSource, value, error: '' })
      })
      .catch((error) => {
        if (current) {
          setManagedCatalogDigestState({
            source: managedCatalogSource,
            value: '',
            error: error instanceof Error ? error.message : 'Shop catalog digest failed.',
          })
        }
      })
    return () => { current = false }
  }, [managedCatalogSource, managedInbox])

  function toggleSku(sku: string) {
    setDraftNotice(merchandising
      ? 'Product selection changed. Imported display details were cleared; save to confirm.'
      : '')
    setMerchandising(null)
    setBuyingCart([])
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

  function finishStorefrontSetup() {
    showMobileWorkspace('setup')
    requestAnimationFrame(() => {
      storefrontSaveRef.current?.scrollIntoView({ block: 'center' })
      storefrontSaveRef.current?.focus({ preventScroll: true })
    })
  }

  function showSavedStorefrontPreview() {
    showMobileWorkspace('preview')
    requestAnimationFrame(() => {
      storefrontPreviewHeadingRef.current?.focus({ preventScroll: true })
    })
  }

  function applyManagedView(view: ManagedStorefrontView, replaceEdits: boolean) {
    setManagedInbox(view.inbox)
    setCatalog({ source: 'managed-shop', items: view.inbox.state.items, error: '' })
    setSavedDraft(view.saved)
    setDraftReadStatus(view.saved ? 'ready' : 'empty')
    setDraftIssue('')
    setBuyingCart([])
    setMissingSelectionReviewed(false)
    if (!replaceEdits) return
    setStoreName(view.fields.storeName)
    setSummary(view.fields.summary)
    setSelectedSkus(view.fields.selectedSkus)
    setMerchandising(view.fields.merchandising)
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
    const view = resolveManagedStorefront(
      identity,
      requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
    )
    if (!view) throw new Error('Create the managed Shop catalog before saving its Ecommerce storefront.')
    applyManagedView(view, false)
    const currentSkus = new Set(view.inbox.state.items.map((item) => item.sku))
    if (selectedSkus.some((sku) => !currentSkus.has(sku))) {
      throw new Error('The Shop catalog changed. Current edits were kept; review the product selection and save again.')
    }
    const plan = await prepareManagedStorefrontSave(
      view.inbox.state,
      { storeName, summary, selectedSkus, merchandising },
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
      setMerchandising(cloneMerchandising(saved.merchandising))
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
    setMerchandising(cloneMerchandising(saved.merchandising))
    setMissingSelectionReviewed(false)
    setDraftNotice(`Saved to ${identity.workspaceId} as revision ${saved.revision}.`)
  }

  async function saveCurrentStorefront() {
    if (!previewResult.preview
      || !digest
      || Boolean(digestError)
      || catalogHydrating
      || selectionReviewRequired
      || draftBusy
      || draftStorageBlocked
      || managedCatalogDigestPending
      || Boolean(managedCatalogDigestError)) return
    setDraftBusy(true)
    setDraftNotice('')
    try {
      if (managedIdentity) {
        await saveManagedStorefront(managedIdentity)
        setBuyingCart([])
        showSavedStorefrontPreview()
        return
      }
      const saved = await saveStorefrontDraft(
        { storeName, summary, selectedSkus, sourcePreviewDigest: digest },
        savedDraft?.revision ?? 0,
        LOCAL_STOREFRONT_DRAFT_SCOPE,
      )
      setSavedDraft(savedLocalDraft(saved))
      setDraftReadStatus('ready')
      setDraftIssue('')
      setStoreName(saved.storeName)
      setSummary(saved.summary)
      setSelectedSkus(saved.selectedSkus)
      setMerchandising(null)
      setMissingSelectionReviewed(false)
      setBuyingCart([])
      setDraftNotice(`Storefront saved on this device as revision ${saved.revision}.`)
      showSavedStorefrontPreview()
    } catch (error) {
      if (managedIdentity && error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const identity = await currentManagedIdentity()
          if (!identity || identity.workspaceId !== managedIdentity.workspaceId || identity.userId !== managedIdentity.userId) {
            throw new Error('The managed workspace identity changed before the conflict could be refreshed.', { cause: error })
          }
          const bootstrap = await loadManagedBootstrap(identity)
          const view = resolveManagedStorefront(
            identity,
            requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
          )
          if (!view) throw new Error('The managed Shop catalog is no longer available.', { cause: error })
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
        setMerchandising(null)
        setDraftReadStatus(latest.status)
        setDraftIssue(latest.error)
        setDraftNotice(error instanceof Error ? error.message : 'Storefront setup was not saved.')
      }
    } finally {
      setDraftBusy(false)
    }
  }

  function discardStorefrontChanges() {
    const fields = draftFieldsForCatalog(savedDraft, catalog.items)
    setStoreName(fields.storeName)
    setSummary(fields.summary)
    setSelectedSkus(fields.selectedSkus)
    setMerchandising(fields.merchandising)
    setMissingSelectionReviewed(false)
    setBuyingCart([])
    setDraftNotice(savedDraft
      ? savedSelectionReconciliation.missingSkus.length === 0
        ? 'Unsaved storefront changes were discarded.'
        : 'Available saved products were restored. Removed Shop SKUs still need review before saving.'
      : 'Current Shop defaults were restored. The storefront is still not saved.')
  }

  function addToCart(sku: string) {
    if (catalogHydrating || !previewResult.preview || !digest || (Boolean(managedIdentity) && !savedDraftIsCurrent)) return
    setBuyingCart((current) => current.some((line) => line.sku === sku)
      ? current
      : [...current, { sku, quantity: 1 }])
    requestAnimationFrame(() => {
      const workspace = document.getElementById('ecommerce-buying-workspace')
      if (workspace instanceof HTMLDetailsElement) workspace.open = true
      workspace?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function recordManagedBuyingRequest(request: EcommerceOrderRequestV2) {
    const identity = managedIdentity
    if (!identity || !globalThis.crypto?.randomUUID) throw new Error('Managed Ecommerce request identity is unavailable. Nothing was sent to Shop.')
    const currentIdentity = await currentManagedIdentity()
    if (!currentIdentity
      || currentIdentity.workspaceId !== identity.workspaceId
      || currentIdentity.userId !== identity.userId) throw new Error('The managed workspace identity changed. Reload before sending this request to Shop.')
    const bootstrap = await loadManagedBootstrap(identity)
    const view = resolveManagedStorefront(identity, requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'))
    if (!view?.saved) throw new Error('Save the managed storefront before sending a customer request to Shop.')
    setManagedInbox(view.inbox)
    setCatalog({ source: 'managed-shop', items: view.inbox.state.items, error: '' })
    const exactRequestIsRetained = (state: CommerceState) => {
      const matches = commerceStorefrontRequests(state).filter((candidate) => candidate.id === request.id || candidate.idempotencyKey === request.idempotencyKey)
      return matches.length === 1 && commerceStorefrontRequestEquals(matches[0], request)
    }
    const proof = {
      actionId: `ACT-${request.id.slice(4)}`,
      capturedAt: request.createdAt,
      actor: identity.userId,
      reason: 'Record the reviewed multi-line Ecommerce request for Shop review.',
      evidenceReference: `ECOMMERCE:${request.id}:${request.sourcePreviewDigest}`,
    }
    const next = await recordCommerceStorefrontRequest(view.inbox.state, request, proof)
    if (!next) throw new Error('The Ecommerce request no longer matches the current managed Shop catalog or storefront.')
    if (next === view.inbox.state && exactRequestIsRetained(next)) return
    const commandId = globalThis.crypto.randomUUID()
    try {
      const result = await saveManagedCommerceCommand({
        commandId,
        evidence: proof,
        eventType: 'commerce.storefront_request.received',
        expectedVersion: view.inbox.version,
        identity,
        state: next as unknown as Record<string, unknown>,
      })
      if (result.command_id !== commandId
        || result.surface !== 'commerce'
        || result.event_type !== 'commerce.storefront_request.received'
        || result.version !== view.inbox.version + 1
        || typeof result.idempotent_replay !== 'boolean') throw new Error('The managed workspace returned an unrelated Ecommerce receipt.')
      const accepted = validateCommerceState(result.state)
      if (!exactRequestIsRetained(accepted)) throw new Error('The managed workspace returned a different Ecommerce request.')
      const confirmedIdentity = await currentManagedIdentity()
      if (!confirmedIdentity
        || confirmedIdentity.workspaceId !== identity.workspaceId
        || confirmedIdentity.userId !== identity.userId) throw new Error('The managed identity changed before the Ecommerce request could be confirmed.')
      setManagedInbox({ identity, state: accepted, version: result.version })
      setCatalog({ source: 'managed-shop', items: accepted.items, error: '' })
    } catch (error) {
      try {
        const refreshedBootstrap = await loadManagedBootstrap(identity)
        const refreshed = resolveManagedStorefront(identity, requireManagedSurfaceState(refreshedBootstrap, 'commerce', 'Shop'))
        const confirmedIdentity = await currentManagedIdentity()
        if (refreshed && confirmedIdentity
          && confirmedIdentity.workspaceId === identity.workspaceId
          && confirmedIdentity.userId === identity.userId
          && exactRequestIsRetained(refreshed.inbox.state)) {
          setManagedInbox(refreshed.inbox)
          setCatalog({ source: 'managed-shop', items: refreshed.inbox.state.items, error: '' })
          return
        }
      } catch { /* Preserve the original managed command failure. */ }
      throw error
    }
  }

  function openShopDraft(draft: EcommerceShopDraftV2) {
    navigate('/shop/?tab=orders&source=ecommerce', { state: { ecommerceShopDraft: draft } })
  }

  const sourceLabel = catalog.source === 'shop-local'
    ? 'Current local Shop catalog'
    : catalog.source === 'managed-shop'
      ? `Managed Shop · ${managedInbox?.identity.workspaceId ?? 'authenticated'}`
      : catalog.source === 'sample'
      ? 'Sample Shop catalog'
      : 'Catalog unavailable'
  const sourceStorefront = managedIdentity && managedInbox
    ? commerceStorefrontConfiguration(managedInbox.state)
    : null
  const buyingScope = managedIdentity
    ? `ecommerce:${managedIdentity.workspaceId}`
    : 'ecommerce:local'
  const customerPreviewItems = previewResult.preview
    ? [...previewResult.preview.items].sort((left, right) => {
      const featuredDifference = Number(Boolean(right.merchandising?.featured)) - Number(Boolean(left.merchandising?.featured))
      if (featuredDifference) return featuredDifference
      const collectionDifference = (left.merchandising?.collection ?? '').localeCompare(right.merchandising?.collection ?? '')
      return collectionDifference || left.sku.localeCompare(right.sku)
    })
    : []
  const buyingReady = Boolean(previewResult.preview && digest && (savedDraftIsCurrent || !managedIdentity))
  const pendingManagedRequests = managedInbox
    ? commerceStorefrontRequests(managedInbox.state).filter((request) => request.state === 'pending_shop_review')
    : []
  const importNeeded = catalog.source === 'sample' || catalog.source === 'unavailable' || catalog.items.length === 0
  const setupRows = [
    ['Catalog', sourceLabel],
    ['Products', `${selectedSkus.length}/${Math.min(catalog.items.length, 8)} selected`],
    ['Store', savedDraftIsCurrent ? 'Saved' : hasUnsavedStorefront ? 'Save needed' : 'Draft'],
    ['Orders', buyingReady ? 'Ready' : catalogHydrating ? 'Checking' : 'Save store'],
  ] as const
  const aiDeskRows = [
    ['Import', importNeeded ? 'Needed' : `${catalog.items.length} items`],
    ['Merchandise', selectedSkus.length ? `${selectedSkus.length} live` : 'Pick products'],
    ['Checkout', buyingReady ? 'Quote ready' : 'Save first'],
    ['Shop review', pendingManagedRequests.length ? `${pendingManagedRequests.length} waiting` : 'No queue'],
  ] as const
  const aiAgentJob = pendingManagedRequests.length
    ? 'Review Ecommerce requests in Shop'
    : importNeeded
      ? 'Prepare catalog import'
      : !savedDraftIsCurrent
        ? 'Finish storefront setup'
        : buyingCart.length
          ? 'Review cart quote'
          : 'Open storefront for ordering'
  const aiAgentReason = pendingManagedRequests.length
    ? `${pendingManagedRequests.length} request${pendingManagedRequests.length === 1 ? '' : 's'} waiting for accountable Shop review.`
    : importNeeded
      ? 'The order desk needs a real Shop catalog before the storefront can sell.'
      : !savedDraftIsCurrent
        ? 'The customer view must be saved before quote and Shop handoff are trusted.'
        : buyingCart.length
          ? `${buyingCart.length} cart line${buyingCart.length === 1 ? '' : 's'} ready for quote review.`
          : 'The storefront is saved and ready for a customer request.'
  const aiOwnerGate = pendingManagedRequests.length
    ? 'Shop confirms stock, delivery, payment, and customer contact.'
    : importNeeded
      ? 'Owner approves the imported catalog before managed activation.'
      : !savedDraftIsCurrent
        ? 'Owner saves the exact storefront fingerprint first.'
        : buyingCart.length
          ? 'Owner reviews the quote before sending to Shop.'
          : 'Owner keeps payment and customer messages locked.'
  const aiAgentQueueRows = [
    ['Agent job', aiAgentJob],
    ['Reason', aiAgentReason],
    ['Owner gate', aiOwnerGate],
  ] as const
  const aiDeskAction = pendingManagedRequests.length
    ? { label: 'Review requests', to: '/shop/?tab=orders&source=ecommerce' }
    : importNeeded
      ? { label: 'Import catalog', to: '/settings/?product=ecommerce' }
      : !savedDraftIsCurrent
        ? null
        : { label: 'Open storefront', to: '#ecommerce-preview-panel' }

  return (
    <div className="workspace-screen ecommerce-product">
      <header className="ecommerce-heading">
        <div>
          <span className="core-eyebrow">{managedIdentity ? 'Managed storefront' : 'Local preview'}</span>
          <h1>Ecommerce</h1>
          <p>Browse the working storefront, add products, and hand one reviewed order to Shop.</p>
        </div>
        <div className="ecommerce-heading-actions">
          <Link className="text-link" to="/settings/?product=ecommerce">Import catalog</Link>
          <Link className="text-link" to="/shop/?tab=inventory">Open Shop stock</Link>
        </div>
      </header>

      <div className="ecommerce-boundary" role="status">
        <span>{sourceLabel}</span>
        <p>Prices and stock stay controlled by Shop. This preview sends no payment or customer message.</p>
      </div>

      <div aria-label="Ecommerce setup status" className="ecommerce-command-strip">
        {setupRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
      </div>

      <section aria-label="AI order desk" className="ecommerce-ai-desk">
        <div>
          <span className="core-eyebrow">AI order desk</span>
          <h2>{pendingManagedRequests.length ? 'Shop review is waiting' : importNeeded ? 'Import first, then sell' : !savedDraftIsCurrent ? 'Finish setup before orders' : 'Ready to take reviewed orders'}</h2>
          <p>{pendingManagedRequests.length
            ? 'Requests are retained for Shop confirmation before stock, delivery, payment, or customer contact changes.'
            : importNeeded
              ? 'Upload or connect the Shop catalog once. The storefront, quote, and Shop handoff use that source.'
              : !savedDraftIsCurrent
                ? 'Save the customer view so the quote, cart, and Shop handoff all share one verified fingerprint.'
                : 'Customers can build a cart; Shop still confirms the accountable order before anything consequential happens.'}</p>
        </div>
        <div className="ecommerce-ai-desk-queue">
          {aiDeskRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        <div className="ecommerce-ai-agent-queue" aria-label="Recommended Ecommerce agent job">
          {aiAgentQueueRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        {aiDeskAction
          ? <Link className="core-button primary compact" to={aiDeskAction.to}>{aiDeskAction.label}</Link>
          : <button className="core-button primary compact" onClick={finishStorefrontSetup} type="button">Finish setup</button>}
      </section>

      <div aria-label="Ecommerce workspace" className="ecommerce-mobile-switch" role="group">
        <button aria-controls="ecommerce-preview-panel" aria-pressed={mobileWorkspace === 'preview'} onClick={() => showMobileWorkspace('preview')} type="button">Store</button>
        <button aria-controls="ecommerce-setup-panel" aria-pressed={mobileWorkspace === 'setup'} onClick={() => showMobileWorkspace('setup')} type="button">Edit store</button>
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
              <input disabled={catalogHydrating || draftBusy} maxLength={60} onChange={(event) => { setStoreName(event.target.value); setDraftNotice(''); setBuyingCart([]) }} value={storeName} />
            </label>
            <label>
              <span>Short description</span>
              <textarea disabled={catalogHydrating || draftBusy} maxLength={180} onChange={(event) => { setSummary(event.target.value); setDraftNotice(''); setBuyingCart([]) }} rows={3} value={summary} />
            </label>
          </div>

          {merchandising ? (
            <div className="ecommerce-merchandising-status" role="status">
              <span><strong>Imported display details</strong><small>{merchandising.length} products use reviewed names, collections, and featured order.</small></span>
              <b>Active</b>
            </div>
          ) : null}

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
              const presentation = merchandising?.find((entry) => entry.sku === item.sku)
              return (
                <button
                  aria-pressed={selected}
                  className="ecommerce-catalog-item"
                  disabled={catalogHydrating || draftBusy || (!selected && selectedSkus.length >= 8)}
                  key={item.sku}
                  onClick={() => toggleSku(item.sku)}
                  type="button"
                >
                  <span><strong>{presentation?.displayName || item.name}</strong><small>{presentation ? `${presentation.featured ? 'Featured · ' : ''}${presentation.collection}` : item.variant || item.sku}</small></span>
                  <span><b>{formatMmk(item.price)}</b><small>{item.onHand > 0 ? 'Available' : 'Sold out'}</small></span>
                  <i aria-hidden="true">{selected ? '✓' : '+'}</i>
                </button>
              )
            })}
          </div>

          <div
            aria-live="polite"
            className="ecommerce-save-bar"
            data-state={savedDraftIsCurrent
              ? 'saved'
              : draftStorageBlocked || managedCatalogDigestError
                ? 'blocked'
                : 'unsaved'}
            role="status"
          >
            <div>
              <strong>{catalogHydrating
                ? 'Checking storefront workspace'
                : localFingerprintPending
                ? 'Checking saved storefront fingerprint'
                : draftStorageBlocked
                ? 'Saved setup needs recovery'
                : managedCatalogDigestError
                ? 'Shop catalog check unavailable'
                : localFingerprintUpgradeRequired
                ? 'Saved setup needs fingerprint upgrade'
                : catalogRebindRequired
                ? 'Shop catalog changed'
                : savedDraftIsCurrent
                ? managedIdentity
                  ? `Saved to workspace · revision ${savedDraft?.revision}`
                  : `Saved on this device · revision ${savedDraft?.revision}`
                : savedDraft ? 'Unsaved changes' : 'Not saved yet'}</strong>
              <small>{catalogHydrating
                ? 'Editing unlocks after the local or managed Shop scope is confirmed.'
                : localFingerprintPending
                ? 'Comparing the saved fingerprint with the current Shop-backed customer view.'
                : draftIssue || managedCatalogDigestError || (catalogRebindRequired
                ? 'Save again to bind this storefront to the current Shop catalog.'
                : savedDraftIsCurrent && savedDraft
                ? `Saved ${new Date(savedDraft.savedAt).toLocaleString()}`
                : managedIdentity
                  ? 'Save the storefront name, description, and selected products to this workspace.'
                  : 'Save the storefront name, description, and selected products for the next visit.')}</small>
              {draftStorageBlocked
                ? <Link className="text-link" to="/settings/#controls">Open recovery settings</Link>
                : null}
            </div>
            {!savedDraftIsCurrent ? <div className="ecommerce-save-actions">
              {hasUnsavedFieldChanges ? <button className="core-button secondary" disabled={catalogHydrating || draftBusy} onClick={discardStorefrontChanges} type="button">Discard</button> : null}
              <button
                className="core-button primary"
                disabled={!hasUnsavedStorefront
                  || !previewResult.preview
                  || !digest
                  || Boolean(digestError)
                  || catalogHydrating
                  || selectionReviewRequired
                  || draftBusy
                  || draftStorageBlocked
                  || managedCatalogDigestPending
                  || Boolean(managedCatalogDigestError)}
                id="ecommerce-save-storefront"
                onClick={() => void saveCurrentStorefront()}
                ref={storefrontSaveRef}
                type="button"
              >
                {draftBusy ? 'Saving…' : localFingerprintUpgradeRequired ? 'Upgrade storefront' : catalogRebindRequired ? 'Rebind storefront' : 'Save storefront'}
              </button>
            </div> : null}
          </div>
          <p className="ecommerce-save-notice" aria-live="polite">{draftNotice}</p>
        </section>

        <section className="core-panel ecommerce-preview-panel" aria-labelledby="ecommerce-preview-title" id="ecommerce-preview-panel">
          <div className="panel-head ecommerce-preview-head">
            <div><span className="core-eyebrow">Storefront demo</span><h2 id="ecommerce-preview-title" ref={storefrontPreviewHeadingRef} tabIndex={-1}>Shop the sample</h2></div>
            <div className="segmented-control" role="group" aria-label="Preview size">
              <button aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} type="button">Phone</button>
              <button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} type="button">Desktop</button>
            </div>
          </div>

          {!buyingReady && !catalogHydrating ? (
            <div className="ecommerce-preview-gate">
              <span>
                <strong>{managedIdentity ? 'Review the store before taking orders' : 'Preparing the sample store'}</strong>
                <small>{managedIdentity ? 'Save the managed storefront before customer requests are available.' : 'The exact Shop catalog and prices are being checked.'}</small>
              </span>
              <button
                aria-controls="ecommerce-setup-panel"
                className="core-button primary"
                onClick={finishStorefrontSetup}
                type="button"
              >
                Edit store
              </button>
            </div>
          ) : null}

          <div className={`ecommerce-preview-frame is-${device}`}>
            {previewResult.preview ? (
              <div className="storefront-preview">
                <header>
                  <span>&gt;_ {previewResult.preview.storeName}</span>
                  <b>{previewResult.preview.items.length} products</b>
                </header>
                <section className="storefront-hero">
                  <small>BROWSE &amp; BUY</small>
                  <h3>{previewResult.preview.storeName}</h3>
                  <p>{previewResult.preview.summary}</p>
                </section>
                <div className="storefront-grid">
                  {customerPreviewItems.map((item) => {
                    const available = item.availability === 'available'
                    const displayName = storefrontDisplayName(item)
                    return (
                    <article
                      className={available && buyingReady ? 'has-request-action' : undefined}
                      data-featured={item.merchandising?.featured ? 'true' : 'false'}
                      data-requested={buyingCart.some((line) => line.sku === item.sku) ? 'true' : 'false'}
                      key={item.sku}
                    >
                      <StorefrontProductArtwork sku={item.sku} />
                      <small>{item.merchandising ? `${item.merchandising.featured ? 'Featured · ' : ''}${item.merchandising.collection}` : item.variant || item.sku}</small>
                      <strong>{displayName}</strong>
                      <span>{formatMmk(item.unitPriceMmk)}</span>
                      <b>{available ? 'Available' : 'Sold out'}</b>
                      {available && buyingReady ? (
                        <button
                          aria-controls="ecommerce-buying-workspace"
                          aria-label={`${buyingCart.some((line) => line.sku === item.sku) ? 'View' : 'Add'} ${displayName} ${buyingCart.some((line) => line.sku === item.sku) ? 'in cart' : 'to cart'}`}
                          className="storefront-request-button"
                          disabled={catalogHydrating}
                          onClick={() => addToCart(item.sku)}
                          type="button"
                        >
                          {buyingCart.some((line) => line.sku === item.sku) ? 'In cart' : 'Add to cart'}
                        </button>
                      ) : null}
                    </article>
                    )
                  })}
                </div>
                <footer>Review one quote. Shop confirms the order, stock, delivery, and payment.</footer>
              </div>
            ) : (
              <div className="ecommerce-preview-empty">
                <span>&gt;_</span>
                <strong>Preview needs attention</strong>
                <p>{previewResult.error}</p>
              </div>
            )}
          </div>

          {buyingReady && previewResult.preview && digest ? (
            <EcommerceBuyingWorkspace
              cart={buyingCart}
              currentCatalog={catalog.items}
              disabled={catalogHydrating}
              onCartChange={setBuyingCart}
              onDraft={openShopDraft}
              onOpenManagedRequest={managedIdentity ? (requestId) => navigate(`/shop/?tab=orders&source=ecommerce&request=${encodeURIComponent(requestId)}`) : undefined}
              onOpenReturns={() => navigate('/shop/?tab=orders&source=ecommerce-return')}
              onRecordManagedRequest={managedIdentity ? recordManagedBuyingRequest : undefined}
              preview={previewResult.preview}
              scope={buyingScope}
              sourcePreviewDigest={digest}
              sourceStorefront={sourceStorefront
                ? { revision: sourceStorefront.revision, actionId: sourceStorefront.saved.actionId }
                : null}
            />
          ) : null}

          <details className="ecommerce-verification" open={digestError ? true : undefined}>
            <summary>
              <span><strong>Preview verification</strong><small>Local currentness check</small></span>
              <b>{digestError ? 'Attention' : digest ? 'Ready' : 'Checking'}</b>
            </summary>
            <div className="ecommerce-digest" aria-live="polite">
              <span>Preview fingerprint</span>
              <code>{digest || (digestError ? 'Unavailable' : 'Calculating…')}</code>
              <small>{digestError || 'The same storefront fields and Shop snapshot produce the same local fingerprint.'}</small>
            </div>
          </details>
        </section>
      </div>
    </div>
  )
}
