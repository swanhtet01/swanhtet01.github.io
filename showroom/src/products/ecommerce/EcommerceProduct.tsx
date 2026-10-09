import { lazy, Suspense, type ChangeEvent, type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { readSessionCart, readSessionCartSnapshot, saveSessionCart } from './cart-session'
import { deliveryConfirmedForScope, type DeliveryConfirmation } from './managed-request-confirmation'
import { ecommerceShopIntentPath } from './ecommerce-shop-intent-route'

import { recordBehaviorSignal } from '../../core/behavior-trail'
import { emitMetric } from '../../analytics/metrics-collector'
import { readLocalSetupBusinessName } from '../../core/product-onboarding-runtime'
import {
  COMMERCE_KEY,
  commerceCatalogDigest,
  commerceCatalogDigestSource,
  commerceStorefrontConfiguration,
  commerceStorefrontOrderTimeline,
  commerceStorefrontRequestEquals,
  commerceStorefrontRequestLines,
  commerceStorefrontRequests,
  loadCommerceWorkspace,
  recordCommerceStorefrontRequest,
  validateCommerceState,
  type CommerceItem,
  type CommerceState,
  type CommerceStorefrontMerchandising,
} from '../../core/commerce-workspace'
import {
  currentManagedIdentity,
  loadManagedBootstrap,
  managedBootstrapHasCapability,
  ManagedTrialError,
  requireManagedSurfaceState,
  saveManagedCommerceCommand,
  type ManagedIdentity,
  type ManagedStateRecord,
} from '../../core/managed-trial'
import { ProductPhoto } from '../../core/ProductPhoto'
import { productImageScopeForWorkspace } from '../../core/product-image-store'
import { CommerceOrderDesk, type CommerceOrderDeskFilter } from './CommerceOrderDesk'
import { EcommerceBuyingWorkspace } from './EcommerceBuyingWorkspace'
import {
  type EcommerceCartLine,
  type EcommerceCancellationIntent,
  type EcommerceOrderAmendmentIntent,
  type EcommerceOrderRescheduleIntent,
  type EcommerceOrderRequestV2,
  type EcommerceReturnIntent,
  type EcommerceSupportIntent,
  type EcommerceShopDraftV2,
} from './ecommerce-buying-lifecycle'
import {
  buildEcommerceManagedStoreActivationPacket,
  type EcommerceManagedStoreActivationReadiness,
} from './ecommerce-activation-packet'
import {
  buildEcommerceOrderImportReviewPacket,
  type EcommerceOrderImportReview,
} from './ecommerce-order-review-packet'
import {
  acceptManagedStorefrontCommand,
  prepareManagedStorefrontSave,
  readManagedStorefront,
  type ManagedStorefrontSaved,
} from './managed-storefront'
import {
  buildStorefrontPreview,
  classifyStorefrontCatalogSource,
  readStorefrontCatalog,
  storefrontBuyingReady,
  storefrontPreviewDigest,
  type StorefrontOperationalSource,
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
import { decideEcommerceAttention, ecommerceAttentionRequestRank } from './ecommerce-next-action'

type PreviewDevice = 'phone' | 'desktop'
type EcommerceWorkspaceView = 'orders' | 'setup' | 'preview'
type EcommerceWorkspaceFocus = 'heading' | 'setup-save' | 'preview-heading'
type RequestInboxFilter = 'all' | 'stock' | 'expiring' | 'payment' | 'delivery'
type ReplyChannelTemplate = 'viber' | 'line' | 'wechat' | 'email'
type EcommerceCatalog = {
  source: StorefrontOperationalSource
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
const DEFAULT_STORE_NAME = 'Your store'

// Prefer the business name captured during onboarding. Until a storefront is saved, the
// neutral fallback must never imply that a fabricated company is already configured.
function defaultStoreName() {
  return readLocalSetupBusinessName() ?? DEFAULT_STORE_NAME
}
const DEFAULT_STORE_SUMMARY = 'Everyday essentials for pickup or delivery, with clear local pricing.'

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

function minutesUntil(value: string | undefined, now: number) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.ceil((timestamp - now) / 60000)
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

function safeEcommerceFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'store'
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function parseOrderImportCsv(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field.trim())
      field = ''
    } else if (character === '\n') {
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') field += character
  }
  if (quoted) throw new Error('Order CSV has an unclosed quoted cell.')
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function deliveryAreaFromCustomerReference(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const separatorIndex = normalized.lastIndexOf('·')
  const candidate = separatorIndex >= 0 ? normalized.slice(separatorIndex + 1).trim() : ''
  return candidate || 'Customer area'
}

function StorefrontProductArtwork() {
  return <svg aria-hidden="true" className="storefront-product-art" focusable="false" viewBox="0 0 100 100"><rect width="100" height="100" rx="12" fill="#f1f2f7" /><path d="m30 39 20-11 20 11v24L50 75 30 63Zm0 0 20 12 20-12M50 51v24M40 34l20 12" fill="none" stroke="#8b8ea4" strokeWidth="2.5" strokeLinejoin="round" /></svg>
}

function savedLocalDraft(draft: StorefrontDraft | LegacyStorefrontDraft | null): SavedStorefrontState | null {
  if (!draft) return null
  return {
    revision: draft.revision,
    savedAt: draft.savedAt,
    storeName: draft.storeName,
    summary: draft.summary,
    selectedSkus: [...draft.selectedSkus],
    ...('merchandising' in draft && draft.merchandising ? { merchandising: cloneMerchandising(draft.merchandising) ?? undefined } : {}),
    ...('sourcePreviewDigest' in draft ? { localPreviewDigest: draft.sourcePreviewDigest } : {}),
  }
}

function draftFieldsForCatalog(saved: SavedStorefrontState | null, items: CommerceItem[]) {
  if (!saved) {
    return {
      storeName: defaultStoreName(),
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
  const commerceState = loadCommerceWorkspace().state
  return {
    catalog,
    commerceState,
    storeName: defaultStoreName(),
    summary: DEFAULT_STORE_SUMMARY,
    selectedSkus: defaultSelection(catalog.items),
    merchandising: null,
  }
}

function canDeliverCatalogReviews(bootstrap: Parameters<typeof managedBootstrapHasCapability>[0], identity: ManagedIdentity) {
  return (['commerce.write', 'company.write', 'approvals.decide'] as const).every(capability => managedBootstrapHasCapability(bootstrap, identity, capability))
}

function StatusRows({ rows }: { rows: readonly (readonly string[])[] }) {
  return <>{rows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</>
}

const CatalogReviewPreparation = lazy(() => import('./CatalogReviewPreparation').then(module => ({ default: module.CatalogReviewPreparation })))

function ecommerceWorkspaceView(search: string, hasSavedStore: boolean): EcommerceWorkspaceView {
  const requested = new URLSearchParams(search).get('view')
  return requested === 'setup' || requested === 'preview' || requested === 'orders'
    ? requested
    : hasSavedStore ? 'orders' : 'preview'
}

function managedCatalogSnapshot(state: CommerceState): EcommerceCatalog {
  return {
    source: classifyStorefrontCatalogSource(state, 'managed'),
    items: state.items,
    error: '',
  }
}

function ecommerceWorkspacePath(pathname: string, search: string, view: EcommerceWorkspaceView) {
  const next = new URLSearchParams(search)
  next.set('workspace', '1')
  next.delete('setup')
  next.set('view', view)
  return `${pathname}?${next.toString()}`
}

export function EcommerceProduct() {
  const [orderOpsNow, setOrderOpsNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setOrderOpsNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const navigate = useNavigate()
  const location = useLocation()
  const [initialState] = useState(initialEcommerceState)
  const [catalog, setCatalog] = useState<EcommerceCatalog>(initialState.catalog)
  const [localCommerceState, setLocalCommerceState] = useState<CommerceState>(initialState.commerceState)
  const [catalogHydrating, setCatalogHydrating] = useState(true)
  const [managedIdentity, setManagedIdentity] = useState<ManagedIdentity | null>(null)
  const [managedCanWrite, setManagedCanWrite] = useState(false)
  const [managedCanDeliverReviews, setManagedCanDeliverReviews] = useState(false)
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
  const [catalogSearch, setCatalogSearch] = useState('')
  const [merchandising, setMerchandising] = useState<CommerceStorefrontMerchandising[] | null>(initialState.merchandising)
  const [device, setDevice] = useState<PreviewDevice>(() => window.matchMedia('(max-width: 760px)').matches ? 'phone' : 'desktop')
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)')
    const syncDevice = () => setDevice(viewport.matches ? 'phone' : 'desktop')
    viewport.addEventListener('change', syncDevice)
    syncDevice()
    return () => viewport.removeEventListener('change', syncDevice)
  }, [])
  const workspaceView = ecommerceWorkspaceView(location.search, Boolean(savedDraft))
  const [digestState, setDigestState] = useState({ previewJson: '', value: '', error: '' })
  const [managedCatalogDigestState, setManagedCatalogDigestState] = useState({
    source: '',
    value: '',
    error: '',
  })
  const [buyingCart, setBuyingCart] = useState<EcommerceCartLine[]>([])
  const restoredCartScope = useRef('')
  const [restoredCartScopeKey, setRestoredCartScopeKey] = useState('')
  const [cartSessionUnavailable, setCartSessionUnavailable] = useState(false)
  const [customerRequestState, setCustomerRequestState] = useState<'idle' | 'waiting_shop_review' | 'confirmed'>('idle')
  const [trackingRequest, setTrackingRequest] = useState(0)
  const [customerRequestDeliveryConfirmed, setCustomerRequestDeliveryConfirmed] = useState<DeliveryConfirmation | null>(null)
  const [requestInboxFilter, setRequestInboxFilter] = useState<RequestInboxFilter>('all')
  const [orderImportText, setOrderImportText] = useState('')
  const [orderImportReview, setOrderImportReview] = useState<EcommerceOrderImportReview | null>(null)
  const [orderImportNotice, setOrderImportNotice] = useState('')
  const [orderImportSourceName, setOrderImportSourceName] = useState('')
  const [customerFollowUpDraft, setCustomerFollowUpDraft] = useState('')
  const [deliveryReviewDraft, setDeliveryReviewDraft] = useState('')
  const [deliveryAreaTemplateDraft, setDeliveryAreaTemplateDraft] = useState('')
  const [replyChannelTemplate, setReplyChannelTemplate] = useState<ReplyChannelTemplate>('viber')
  const [channelReplyDraft, setChannelReplyDraft] = useState('')
  const storefrontSaveRef = useRef<HTMLButtonElement>(null)
  const storefrontPreviewHeadingRef = useRef<HTMLHeadingElement>(null)
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null)
  const previousWorkspaceViewRef = useRef(workspaceView)
  const pendingWorkspaceFocusRef = useRef<EcommerceWorkspaceFocus>('heading')

  const focusWorkspaceDestination = useCallback((focus: EcommerceWorkspaceFocus) => {
    requestAnimationFrame(() => {
      if (focus === 'setup-save' && storefrontSaveRef.current && !storefrontSaveRef.current.disabled) {
        storefrontSaveRef.current.scrollIntoView({ block: 'center' })
        storefrontSaveRef.current.focus({ preventScroll: true })
        return
      }
      if (focus === 'preview-heading' && storefrontPreviewHeadingRef.current) {
        storefrontPreviewHeadingRef.current.focus({ preventScroll: true })
        return
      }
      workspaceHeadingRef.current?.focus()
    })
  }, [])

  useEffect(() => {
    if (previousWorkspaceViewRef.current === workspaceView) return
    previousWorkspaceViewRef.current = workspaceView
    const focus = pendingWorkspaceFocusRef.current
    pendingWorkspaceFocusRef.current = 'heading'
    focusWorkspaceDestination(focus)
  }, [focusWorkspaceDestination, workspaceView])

  useEffect(() => {
    if (catalogHydrating || !managedIdentity) return
    const params = new URLSearchParams(location.search)
    if (params.get('workspace') === '1' && params.get('setup') !== '1') return
    params.set('workspace', '1')
    params.delete('setup')
    params.set('view', ecommerceWorkspaceView(location.search, Boolean(savedDraft)))
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true })
  }, [catalogHydrating, location.pathname, location.search, managedIdentity, navigate, savedDraft])

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
        const confirmedIdentity = await currentManagedIdentity()
        if (!current) return
        if (!confirmedIdentity
          || confirmedIdentity.workspaceId !== identity.workspaceId
          || confirmedIdentity.userId !== identity.userId) {
          throw new Error('The company account changed while loading. Reload to open the current company.')
        }
        setManagedCanWrite(managedBootstrapHasCapability(bootstrap, identity, 'commerce.write'))
        setManagedCanDeliverReviews(canDeliverCatalogReviews(bootstrap, identity))
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
        setCatalog(managedCatalogSnapshot(view.inbox.state))
        setCatalogHydrating(false)
      })
      .catch((error) => {
        if (!current) return
        setManagedInbox(null)
        setManagedCanWrite(false)
        setManagedCanDeliverReviews(false)
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
        setLocalCommerceState(loadCommerceWorkspace().state)
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
      const latestDraft = savedLocalDraft(latest.draft)
      setSavedDraft(latestDraft)
      setMerchandising(cloneMerchandising(latestDraft?.merchandising))
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
  const cartScope = !catalogHydrating && digest && catalog.source !== 'unavailable'
    ? JSON.stringify([managedIdentity ? [managedIdentity.workspaceId, managedIdentity.userId] : 'local', digest]) : ''
  const recoverSessionCart = useCallback(() => {
    try { return readSessionCartSnapshot(window.sessionStorage, cartScope, catalog.items) } catch { return null }
  }, [cartScope, catalog.items])
  useEffect(() => {
    if (!cartScope) return
    let current = true
    queueMicrotask(() => {
      if (!current) return
      if (restoredCartScope.current !== cartScope) {
        restoredCartScope.current = cartScope
        try { setBuyingCart(readSessionCart(window.sessionStorage, cartScope, catalog.items)) }
        catch { setBuyingCart([]); setCartSessionUnavailable(true) }
        setRestoredCartScopeKey(cartScope)
        return
      }
      try { setCartSessionUnavailable(!saveSessionCart(window.sessionStorage, cartScope, buyingCart)) }
      catch { setCartSessionUnavailable(true) }
    })
    return () => { current = false }
  }, [cartScope, buyingCart, catalog.items])

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
  // Device-local product photos are keyed per workspace (product-image-store.ts
  // scope note): IndexedDB is per-origin, so the storefront preview must ask for
  // THIS company's photo or a colliding SKU renders another company's picture.
  const productImageScope = productImageScopeForWorkspace(managedIdentity?.workspaceId)
  const savedCatalogIsCurrent = managedIdentity
    ? Boolean(savedDraft?.shopCatalogDigest
      && managedCatalogDigest
      && savedDraft.shopCatalogDigest === managedCatalogDigest)
    : Boolean(savedDraft?.localPreviewDigest
      && digest
      && savedDraft.localPreviewDigest === digest)
  const savedDraftIsCurrent = savedFieldsAreCurrent && savedCatalogIsCurrent
  const sampleCatalogPreview = catalog.source === 'sample'
  const storefrontSetupRequired = !sampleCatalogPreview && !savedDraftIsCurrent
  const buyingReady = storefrontBuyingReady({
    source: catalog.source,
    previewReady: Boolean(previewResult.preview && digest),
    savedDraftIsCurrent,
  })
  const cartSessionReady = Boolean(cartScope && restoredCartScopeKey === cartScope)
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
  const portalViewOnly = Boolean(managedIdentity && !managedCanWrite)
  const canSaveStorefront = !sampleCatalogPreview
    && !portalViewOnly
    && hasUnsavedStorefront
    && Boolean(previewResult.preview)
    && Boolean(digest)
    && !digestError
    && !catalogHydrating
    && !selectionReviewRequired
    && !draftBusy
    && !draftStorageBlocked
    && !managedCatalogDigestPending
    && !managedCatalogDigestError

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

  function downloadOrderImportTemplate() {
    const csv = ['customer_reference', 'channel', 'sku', 'quantity', 'fulfilment', 'payment', 'source_message'].map(csvCell).join(',')
    const url = URL.createObjectURL(new Blob([`${csv}\r\n`], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `supermega-ecommerce-order-import-${safeEcommerceFilename(storeName)}.csv`
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: 'Download Ecommerce order import template',
    })
    const notice = 'Order import template downloaded. No order import, customer message, payment, delivery booking, stock move, refund, or Shop write ran.'
    setOrderImportNotice(notice)
    setDraftNotice(notice)
  }

  function buildOrderImportReview(csvText: string): EcommerceOrderImportReview {
    const parsed = parseOrderImportCsv(csvText)
    if (parsed.length < 2) throw new Error('Paste or upload the order CSV header and at least one order row.')
    // 51 = one header row plus the 50 order rows the message promises. It was 52, which let a
    // 51st order row through while telling the operator the limit was 50.
    if (parsed.length > 51) throw new Error('Review at most 50 order rows at a time.')
    const [header, ...rows] = parsed
    const normalizedHeaders = header.map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
    const required = ['customer_reference', 'channel', 'sku', 'quantity', 'fulfilment', 'payment', 'source_message']
    const missing = required.filter((field) => !normalizedHeaders.includes(field))
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}.`)
    const indexes = Object.fromEntries(required.map((field) => [field, normalizedHeaders.indexOf(field)]))
    const allowedSkus = new Set(catalog.items.map((item) => item.sku))
    const selected = new Set(selectedSkus)
    let readyRows = 0
    let blockedRows = 0
    for (const row of rows) {
      const sku = row[indexes.sku]?.trim() ?? ''
      const quantity = Number(row[indexes.quantity])
      const fulfilment = (row[indexes.fulfilment] ?? '').toLowerCase()
      const payment = (row[indexes.payment] ?? '').toLowerCase()
      const customer = row[indexes.customer_reference]?.trim() ?? ''
      const sourceMessage = row[indexes.source_message]?.trim() ?? ''
      const ready = Boolean(customer && sourceMessage && allowedSkus.has(sku) && selected.has(sku) && Number.isInteger(quantity) && quantity > 0 && quantity <= 50 && ['pickup', 'delivery'].includes(fulfilment) && ['manual_review', 'cash_on_pickup', 'cash_on_delivery'].includes(payment))
      if (ready) readyRows += 1
      else blockedRows += 1
    }
    return {
      status: blockedRows ? 'blocked' : 'ready',
      totalRows: rows.length,
      readyRows,
      blockedRows,
      summary: blockedRows
        ? `${blockedRows} row${blockedRows === 1 ? '' : 's'} need SKU, quantity, fulfilment, payment, customer, or source-message repair.`
        : `${readyRows} order row${readyRows === 1 ? '' : 's'} ready for review.`,
    }
  }

  function reviewOrderImportBatch() {
    if (sampleCatalogPreview) {
      setOrderImportReview(null)
      setOrderImportNotice('Replace the sample products in Shop before reviewing customer order batches.')
      return
    }
    try {
      setOrderImportReview(buildOrderImportReview(orderImportText))
      setOrderImportNotice('Order import batch reviewed locally. No order import, customer message, payment, delivery booking, stock move, refund, or Shop write ran.')
    } catch (error) {
      setOrderImportReview({
        status: 'blocked',
        totalRows: 0,
        readyRows: 0,
        blockedRows: 0,
        summary: error instanceof Error ? error.message : 'Order CSV could not be reviewed locally.',
      })
      setOrderImportNotice('Order import batch rejected locally. No Shop or customer action ran.')
    }
  }

  async function uploadOrderImportCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (sampleCatalogPreview) {
      setOrderImportReview(null)
      setOrderImportNotice('Replace the sample products in Shop before uploading customer order batches.')
      return
    }
    setOrderImportSourceName(file.name)
    setOrderImportReview(null)
    if (file.size > 180_000) {
      setOrderImportNotice('Order CSV is too large. Upload at most 180 KB or split the file into 50-row batches. No Shop or customer action ran.')
      return
    }
    try {
      const text = await file.text()
      if (!text.trim()) throw new Error('Uploaded file is empty.')
      const review = buildOrderImportReview(text)
      setOrderImportText(text)
      setOrderImportReview(review)
      recordBehaviorSignal(window.localStorage, {
        event: 'agent_job_chosen',
        product: 'ecommerce',
        route: location.pathname + location.search,
        detail: 'Upload Ecommerce order CSV for local review',
      })
      setOrderImportNotice(`Uploaded ${file.name} and reviewed it locally. No order import, customer message, payment, delivery booking, stock move, refund, or Shop write ran.`)
    } catch (error) {
      setOrderImportText('')
      setOrderImportReview({
        status: 'blocked',
        totalRows: 0,
        readyRows: 0,
        blockedRows: 0,
        summary: error instanceof Error ? error.message : 'Uploaded order CSV could not be reviewed locally.',
      })
      setOrderImportNotice('Uploaded order CSV was rejected locally. No Shop or customer action ran.')
    }
  }

  function downloadOrderImportReviewPacket() {
    if (sampleCatalogPreview || !orderImportReview) return
    const packet = buildEcommerceOrderImportReviewPacket({
      generatedAt: new Date().toISOString(),
      product: 'ecommerce',
      storeName,
      operatingMode: managedIdentity ? 'managed_trial' : 'browser_local_trial',
      catalog: {
        source: catalog.source,
        items: catalog.items.length,
        selectedSkus: [...selectedSkus],
      },
      review: orderImportReview,
      sourceCsv: orderImportText,
    })
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(packet, null, 2)}\n`], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `supermega-ecommerce-order-review-${safeEcommerceFilename(storeName)}.json`
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: 'Download Ecommerce order import review packet',
    })
    setOrderImportNotice('Order import review file downloaded. No order import, customer message, payment, delivery booking, stock move, refund, Shop write, or go-live action ran.')
  }

  function showWorkspace(view: EcommerceWorkspaceView, focus: EcommerceWorkspaceFocus = 'heading') {
    pendingWorkspaceFocusRef.current = focus
    if (view === workspaceView) {
      focusWorkspaceDestination(focus)
      pendingWorkspaceFocusRef.current = 'heading'
      return
    }
    navigate(ecommerceWorkspacePath(location.pathname, location.search, view))
  }

  function finishStorefrontSetup() {
    showWorkspace('setup', 'setup-save')
  }

  function showSavedStorefrontPreview() {
    showWorkspace('preview', 'preview-heading')
  }

  function applyManagedView(view: ManagedStorefrontView, replaceEdits: boolean) {
    setManagedInbox(view.inbox)
    setCatalog(managedCatalogSnapshot(view.inbox.state))
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
    if (!managedCanWrite) throw new Error('View only — ask a company owner to assign Ecommerce operator access.')
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Secure command identity is unavailable. Nothing was saved.')
    }
    const currentIdentity = await currentManagedIdentity()
    if (!currentIdentity
      || currentIdentity.workspaceId !== identity.workspaceId
      || currentIdentity.userId !== identity.userId) {
      throw new Error('The company account changed. Reload before saving.')
    }
    const bootstrap = await loadManagedBootstrap(identity)
    const writeAllowed = managedBootstrapHasCapability(bootstrap, identity, 'commerce.write')
    setManagedCanWrite(writeAllowed)
    setManagedCanDeliverReviews(canDeliverCatalogReviews(bootstrap, identity))
    if (!writeAllowed) throw new Error('View only — ask a company owner to assign Ecommerce operator access.')
    const view = resolveManagedStorefront(
      identity,
      requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
    )
    if (!view) throw new Error('Create the managed Shop catalog before saving its Ecommerce storefront.')
    if (classifyStorefrontCatalogSource(view.inbox.state, 'managed') === 'sample') {
      throw new Error('Replace the sample products in Shop before saving a live store.')
    }
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
      setDraftNotice(`Already saved for this company as revision ${saved.revision}.`)
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
    setCatalog(managedCatalogSnapshot(accepted))
    setSavedDraft(saved)
    setDraftReadStatus('ready')
    setDraftIssue('')
    setStoreName(saved.storeName)
    setSummary(saved.summary)
    setSelectedSkus(saved.selectedSkus)
    setMerchandising(cloneMerchandising(saved.merchandising))
    setMissingSelectionReviewed(false)
    setDraftNotice(`Saved for this company as revision ${saved.revision}.`)
  }

  async function saveCurrentStorefront() {
    if (sampleCatalogPreview) {
      setDraftNotice('Replace the example products in Shop before saving a live store.')
      return
    }
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
        { storeName, summary, selectedSkus, sourcePreviewDigest: digest, ...(merchandising ? { merchandising } : {}) },
        savedDraft?.revision ?? 0,
        LOCAL_STOREFRONT_DRAFT_SCOPE,
      )
      setSavedDraft(savedLocalDraft(saved))
      setDraftReadStatus('ready')
      setDraftIssue('')
      setStoreName(saved.storeName)
      setSummary(saved.summary)
      setSelectedSkus(saved.selectedSkus)
      setMerchandising(cloneMerchandising(saved.merchandising))
      setMissingSelectionReviewed(false)
      setBuyingCart([])
      setDraftNotice(`Storefront saved on this device as revision ${saved.revision}.`)
      showSavedStorefrontPreview()
    } catch (error) {
      if (managedIdentity && error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const identity = await currentManagedIdentity()
          if (!identity || identity.workspaceId !== managedIdentity.workspaceId || identity.userId !== managedIdentity.userId) {
            throw new Error('The company account changed before the conflict could be refreshed.', { cause: error })
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
        const latestDraft = savedLocalDraft(latest.draft)
        setSavedDraft(latestDraft)
        setMerchandising(cloneMerchandising(latestDraft?.merchandising))
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

  const addToCart = useCallback((sku: string) => {
    if (!buyingReady || !cartSessionReady) return
    if (!buyingCart.some((line) => line.sku === sku)) emitMetric({ product: 'ecommerce', capability: 'ecommerce-storefront', action: 'cart.built', ts: Date.now() })
    setBuyingCart((current) => current.some((line) => line.sku === sku)
      ? current
      : [...current, { sku, quantity: 1 }])
    requestAnimationFrame(() => {
      const workspace = document.getElementById('ecommerce-buying-workspace')
      if (workspace instanceof HTMLDetailsElement) workspace.open = true
      workspace?.scrollIntoView({ block: 'start' })
      workspace?.focus({ preventScroll: true })
    })
  }, [buyingReady, buyingCart, cartSessionReady])

  function prepareQuoteRecovery(event: ReactMouseEvent<HTMLButtonElement>) {
    const actionNow = Math.round(globalThis.performance.timeOrigin + event.timeStamp)
    setOrderOpsNow(actionNow)
    const recoveryRequest = actionablePendingManagedRequests[0]
    if (recoveryRequest && !requestQuoteIsExpired(recoveryRequest, actionNow)) {
      navigate(`/shop/?tab=orders&source=ecommerce-inbox&request=${encodeURIComponent(recoveryRequest.id)}`)
      return
    }
    if (!buyingReady || !customerPreviewItems.length) {
      finishStorefrontSetup()
      return
    }
    showWorkspace('preview')
  }

  // The cart and checkout live inside a collapsed <details>. Opening it is what "Review
  // checkout" has always said it does.
  function openBuyingWorkspace() {
    const workspace = document.getElementById('ecommerce-buying-workspace')
    if (!(workspace instanceof HTMLDetailsElement)) return false
    workspace.open = true
    const summary = workspace.querySelector('summary')
    if (summary instanceof HTMLElement) summary.focus({ preventScroll: true })
    requestAnimationFrame(() => workspace.scrollIntoView({ block: 'start' }))
    return true
  }

  function focusCurrentRequestReceipt(event: ReactMouseEvent<HTMLButtonElement>) {
    const receipt = document.querySelector<HTMLElement>('.ecommerce-quote-receipt[data-current="true"]')
      ?? document.querySelector<HTMLElement>('.ecommerce-quote-receipt[data-current="false"]')
    if (!receipt) {
      prepareQuoteRecovery(event)
      return
    }
    const workspace = document.getElementById('ecommerce-buying-workspace')
    if (workspace instanceof HTMLDetailsElement) workspace.open = true
    receipt.focus({ preventScroll: true })
    requestAnimationFrame(() => {
      receipt.scrollIntoView({ block: 'center' })
      receipt.focus({ preventScroll: true })
    })
  }

  function prepareCustomerFollowUpDraft() {
    if (!pendingManagedRequests.length) {
      if (!buyingReady) {
        finishStorefrontSetup()
        return
      }
      setCustomerFollowUpDraft('Review draft only: the storefront is ready. Wait for a reviewed customer quote request before sending any payment, delivery, discount, or availability message.')
      return
    }
    const request = customerFollowUpRequest ?? pendingManagedRequests[0]
    const lines = commerceStorefrontRequestLines(request)
    const itemSummary = lines.length === 1 ? lines[0].name : `${lines.length} items`
    const expiryText = 'quote' in request ? ` Quote expires ${new Date(request.quote.expiresAt).toLocaleString()}.` : ''
    const fulfilmentText = request.fulfilment === 'delivery' ? 'delivery, availability, and payment' : 'pickup, availability, and payment'
    setCustomerFollowUpDraft(`Review draft only: Hi ${request.customerReference}, your ${itemSummary} request totals ${formatMmk(request.totalMmk)}. Shop is reviewing ${fulfilmentText} before anything is confirmed.${expiryText} Reference ${request.id}.`)
  }

  function prepareChannelReplyTemplate() {
    if (!customerFollowUpRequest) {
      if (!buyingReady) {
        finishStorefrontSetup()
        return
      }
      setChannelReplyDraft('Review draft only: channel reply templates are ready. Wait for a reviewed customer request, then approve the channel, source evidence, payment boundary, and Shop review status before sending.')
      return
    }
    const lines = commerceStorefrontRequestLines(customerFollowUpRequest)
    const itemSummary = lines.length === 1 ? lines[0].name : `${lines.length} items`
    const reason = requestQuoteIsExpired(customerFollowUpRequest)
      ? 'a fresh customer quote because the previous quote expired'
      : requestHasStockRisk(customerFollowUpRequest)
        ? 'availability check'
        : requestIsExpiring(customerFollowUpRequest)
        ? 'quote refresh'
        : requestNeedsPaymentReview(customerFollowUpRequest)
          ? 'manual payment review'
          : customerFollowUpRequest.fulfilment === 'delivery'
            ? 'delivery confirmation'
            : 'Shop review update'
    setChannelReplyDraft(`Review draft only: ${replyChannelTemplate.toUpperCase()} reply for ${customerFollowUpRequest.customerReference}: Shop is reviewing ${itemSummary} for ${reason}. Confirm stock, payment, delivery, and review before any send. Reference ${customerFollowUpRequest.id}.`)
  }

  function prepareDeliveryFeeReview() {
    if (!deliveryReviewRequest) {
      if (!buyingReady) {
        finishStorefrontSetup()
        return
      }
      setDeliveryReviewDraft('Review draft only: delivery review is ready. Wait for a delivery request, then confirm zone, fee, rider assignment, and payment in Shop before quoting a customer.')
      return
    }
    const lines = commerceStorefrontRequestLines(deliveryReviewRequest)
    const zoneHint = deliveryAreaFromCustomerReference(deliveryReviewRequest.customerReference)
    const itemSummary = lines.length === 1 ? lines[0].name : `${lines.length} items`
    setDeliveryReviewDraft(`Review draft only: review ${zoneHint} as the delivery zone for ${deliveryReviewRequest.customerReference}. Quote ${itemSummary} at ${formatMmk(deliveryReviewRequest.totalMmk)} before delivery fee. Shop must confirm fee, rider assignment, payment, and stock before any customer message or booking. Reference ${deliveryReviewRequest.id}.`)
  }

  function prepareDeliveryAreaTemplate() {
    if (!deliveryReviewRequest) {
      if (!buyingReady) {
        finishStorefrontSetup()
        return
      }
      setDeliveryAreaTemplateDraft('Review draft only: delivery-area templates are ready. Wait for a reviewed delivery request, then approve area, fee rule, rider assignment, payment policy, and cut-off before reuse.')
      return
    }
    const area = deliveryAreaFromCustomerReference(deliveryReviewRequest.customerReference)
    const paymentPolicy = 'quote' in deliveryReviewRequest && deliveryReviewRequest.quote.payment.adapter === 'kbzpay_manual'
      ? 'manual QR review'
      : 'cash-on-delivery review'
    setDeliveryAreaTemplateDraft(`Review draft only: save ${area} as a delivery-area template after Shop approves fee, rider assignment, ${paymentPolicy}, cut-off, and stock confirmation. Reuse stays locked until go-live setup proves audit, roles, and write controls. Reference ${deliveryReviewRequest.id}.`)
  }

  function openFilteredRequestInShop(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!requestInboxNextRequest) return
    const actionNow = Math.round(globalThis.performance.timeOrigin + event.timeStamp)
    setOrderOpsNow(actionNow)
    if (requestQuoteIsExpired(requestInboxNextRequest, actionNow)) return
    navigate(`/shop/?tab=orders&source=ecommerce-inbox&request=${encodeURIComponent(requestInboxNextRequest.id)}`)
  }

  async function recordManagedBuyingRequest(request: EcommerceOrderRequestV2) {
    const identity = managedIdentity
    if (!managedCanWrite) throw new Error('View only — ask a company owner to assign Ecommerce operator access.')
    if (!identity || !globalThis.crypto?.randomUUID) throw new Error('Managed Ecommerce request identity is unavailable. Nothing was sent to Shop.')
    const currentIdentity = await currentManagedIdentity()
    if (!currentIdentity
      || currentIdentity.workspaceId !== identity.workspaceId
      || currentIdentity.userId !== identity.userId) throw new Error('The company account changed. Reload before sending this request to Shop.')
    const assertCurrentRequestIdentity = async () => {
      const current = await currentManagedIdentity()
      if (!current || current.workspaceId !== identity.workspaceId || current.userId !== identity.userId) {
        throw new Error('The company account changed while preparing this request. Reopen checkout.')
      }
    }
    const bootstrap = await loadManagedBootstrap(identity)
    await assertCurrentRequestIdentity()
    const writeAllowed = managedBootstrapHasCapability(bootstrap, identity, 'commerce.write')
    setManagedCanWrite(writeAllowed)
    setManagedCanDeliverReviews(canDeliverCatalogReviews(bootstrap, identity))
    if (!writeAllowed) throw new Error('View only — ask a company owner to assign Ecommerce operator access.')
    const view = resolveManagedStorefront(identity, requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'))
    if (!view?.saved) throw new Error('Save the managed storefront before sending a customer request to Shop.')
    if (classifyStorefrontCatalogSource(view.inbox.state, 'managed') === 'sample') {
      throw new Error('Replace the sample products in Shop before sending a customer request.')
    }
    setManagedInbox(view.inbox)
    setCatalog(managedCatalogSnapshot(view.inbox.state))
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
    await assertCurrentRequestIdentity()
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
        || typeof result.idempotent_replay !== 'boolean') throw new Error('The company account returned an unrelated Ecommerce receipt.')
      const accepted = validateCommerceState(result.state)
      if (!exactRequestIsRetained(accepted)) throw new Error('The company account returned a different Ecommerce request.')
      const confirmedIdentity = await currentManagedIdentity()
      if (!confirmedIdentity
        || confirmedIdentity.workspaceId !== identity.workspaceId
        || confirmedIdentity.userId !== identity.userId) throw new Error('The managed identity changed before the Ecommerce request could be confirmed.')
      setManagedInbox({ identity, state: accepted, version: result.version })
      setCatalog(managedCatalogSnapshot(accepted))
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
          setCatalog(managedCatalogSnapshot(refreshed.inbox.state))
          return
        }
      } catch { /* Preserve the original managed command failure. */ }
      throw error
    }
  }

  function openShopDraft(draft: EcommerceShopDraftV2) {
    navigate(ecommerceShopIntentPath('order', draft.sourceRequestId))
  }

  const sourceLabel = sampleCatalogPreview
    ? 'Sample catalog · preview only'
    : catalog.source === 'shop-local'
      ? 'Current local Shop catalog'
      : catalog.source === 'managed-shop'
        ? 'Company Shop - connected'
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
  const activeCommerceState = managedIdentity ? managedInbox?.state ?? null : localCommerceState
  const managedOrderTimeline = managedInbox
    ? commerceStorefrontOrderTimeline(managedInbox.state)
    : []
  const pendingManagedRequests = managedOrderTimeline
    .filter((entry) => entry.nextAction === 'review_in_shop')
    .map((entry) => entry.request)
  const activeManagedOrders = managedOrderTimeline.filter((entry) => entry.order
    && entry.stage !== 'completed'
    && entry.stage !== 'cancelled')
  const completedManagedOrders = managedOrderTimeline.filter((entry) => entry.stage === 'completed')
  const cancelledManagedOrders = managedOrderTimeline.filter((entry) => entry.stage === 'cancelled')
  const lifecyclePaymentAttention = managedOrderTimeline.filter((entry) => entry.nextAction === 'confirm_payment')
  const lifecycleRefundAttention = managedOrderTimeline.filter((entry) => entry.nextAction === 'settle_refund')
  const managedReturnedUnits = managedOrderTimeline.reduce((total, entry) => total + entry.returnedQuantity, 0)
  const localEcommerceOrders = managedIdentity
    ? []
    : (activeCommerceState?.orders ?? []).filter((order) => order.sourceRecordId?.startsWith('ECR-'))
  const ecommerceActiveOrderCount = managedIdentity
    ? activeManagedOrders.length
    : localEcommerceOrders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled').length
  const ecommerceCompletedOrderCount = managedIdentity
    ? completedManagedOrders.length
    : localEcommerceOrders.filter((order) => order.status === 'completed').length
  const ecommerceCancelledOrderCount = managedIdentity
    ? cancelledManagedOrders.length
    : localEcommerceOrders.filter((order) => order.status === 'cancelled').length
  const ecommercePaymentAttentionCount = managedIdentity
    ? lifecyclePaymentAttention.length
    : localEcommerceOrders.filter((order) => order.status === 'ready' && order.paymentStatus !== 'reconciled').length
  const ecommerceRefundAttentionCount = managedIdentity
    ? lifecycleRefundAttention.length
    : localEcommerceOrders.filter((order) => order.refundStatus === 'due').length
  const ecommerceReturnedUnits = managedIdentity
    ? managedReturnedUnits
    : localEcommerceOrders.reduce((total, order) => total + (order.returns ?? []).reduce((returned, record) => returned + record.quantity, 0), 0)
  const importNeeded = catalog.source === 'unavailable' || catalog.items.length === 0
  const requestQuoteIsExpired = (request: typeof pendingManagedRequests[number], now = orderOpsNow) => {
    const minutes = minutesUntil('quote' in request ? request.quote.expiresAt : undefined, now)
    return minutes !== null && minutes <= 0
  }
  const actionablePendingManagedRequests = pendingManagedRequests.filter((request) => !requestQuoteIsExpired(request))
  const expiredPendingRequestCount = pendingManagedRequests.length - actionablePendingManagedRequests.length
  const orderOpsAgingCount = actionablePendingManagedRequests.filter((request) => Date.parse(request.createdAt) <= orderOpsNow - 30 * 60 * 1000).length
  const orderOpsExpiringCount = actionablePendingManagedRequests.filter((request) => {
    const minutes = minutesUntil('quote' in request ? request.quote.expiresAt : undefined, orderOpsNow)
    return minutes !== null && minutes > 0 && minutes <= 15
  }).length
  const orderOpsStockRiskCount = actionablePendingManagedRequests.filter((request) => commerceStorefrontRequestLines(request).some((line) => {
    const item = catalog.items.find((candidate) => candidate.sku === line.sku)
    return !item || item.onHand < line.quantity
  })).length
  const orderOpsPaymentRiskCount = actionablePendingManagedRequests.filter((request) => 'quote' in request && request.quote.payment.adapter === 'kbzpay_manual').length
  const ecommerceAttention = decideEcommerceAttention({
    agedRequestCount: orderOpsAgingCount,
    expiringQuoteCount: orderOpsExpiringCount,
    paymentAttentionCount: ecommercePaymentAttentionCount,
    paymentRiskCount: orderOpsPaymentRiskCount,
    pendingRequestCount: actionablePendingManagedRequests.length,
    refundAttentionCount: ecommerceRefundAttentionCount,
    stockRiskCount: orderOpsStockRiskCount,
  })
  const deliveryReviewCount = actionablePendingManagedRequests.filter((request) => request.fulfilment === 'delivery').length
  const pickupReviewCount = actionablePendingManagedRequests.filter((request) => request.fulfilment === 'pickup').length
  const controlPaymentsVisible = buyingReady || pendingManagedRequests.length > 0
  const paymentDeliveryStage = importNeeded
    ? 'Import catalog before checkout'
    : sampleCatalogPreview
      ? 'Replace sample products before checkout'
    : !buyingReady
      ? 'Save store before checkout'
      : actionablePendingManagedRequests.length
        ? 'Review payment and delivery'
        : expiredPendingRequestCount
          ? 'New customer quote needed'
        : buyingCart.length
          ? 'Quote payment and delivery'
          : 'Checkout controls ready'
  const orderOpsPriority = ecommerceRefundAttentionCount
    ? 'Settle refund evidence'
    : ecommercePaymentAttentionCount
      ? 'Confirm payment before completion'
      : orderOpsStockRiskCount
        ? 'Resolve stock risk'
        : orderOpsExpiringCount
          ? 'Refresh expiring quotes'
          : orderOpsAgingCount
            ? 'Clear aged requests'
            : actionablePendingManagedRequests.length
              ? 'Review next request'
              : expiredPendingRequestCount
                ? 'Wait for requote'
              : ecommerceActiveOrderCount
                ? 'Continue fulfilment'
                : importNeeded
                  ? 'Import sellable catalog'
                  : sampleCatalogPreview
                    ? 'Replace sample products'
                  : buyingReady
                    ? 'Ready for customer orders'
                    : 'Save store'
  const orderOpsRows = [
    ['Review', actionablePendingManagedRequests.length ? `${actionablePendingManagedRequests.length} waiting` : expiredPendingRequestCount ? `${expiredPendingRequestCount} expired` : 'Clear'],
    ['Fulfil', ecommerceActiveOrderCount ? `${ecommerceActiveOrderCount} active` : 'Clear'],
    ['Payment', ecommercePaymentAttentionCount ? `${ecommercePaymentAttentionCount} blocking` : 'Clear'],
    ['Refund', ecommerceRefundAttentionCount ? `${ecommerceRefundAttentionCount} due` : 'Clear'],
    ['Done', `${ecommerceCompletedOrderCount} completed · ${ecommerceCancelledOrderCount} cancelled`],
    ['Returns', ecommerceReturnedUnits ? `${ecommerceReturnedUnits} units recorded` : 'None'],
  ] as const
  const orderImportStage = importNeeded
    ? 'Upload catalog first'
    : sampleCatalogPreview
      ? 'Replace sample products before order import'
    : pendingManagedRequests.length
      ? 'Review imported orders'
      : buyingReady
        ? 'Ready for order upload'
        : 'Save store first'
  const orderImportRows = [
    ['Input', sampleCatalogPreview ? 'Sample catalog' : catalog.source === 'managed-shop' ? 'Managed catalog' : catalog.source === 'shop-local' ? 'Local catalog' : 'Local/import'],
    ['Bulk', sampleCatalogPreview ? 'Blocked' : importNeeded ? 'Need products' : 'CSV or messages'],
    ['Mapping', selectedSkus.length ? `${selectedSkus.length} SKUs` : 'No SKUs'],
    ['Queue', pendingManagedRequests.length ? `${pendingManagedRequests.length} review` : 'No pending'],
    ['Template', 'Download CSV'],
    ['Review', orderImportReview ? `${orderImportReview.readyRows}/${orderImportReview.totalRows} ready` : 'Paste CSV'],
    ['Boundary', 'No auto submit'],
  ] as const
  const orderRepairRows = orderImportReview
    ? [
        ['Ready rows', `${orderImportReview.readyRows}`],
        ['Blocked rows', `${orderImportReview.blockedRows}`],
        ['Next fix', orderImportReview.status === 'ready' ? 'Download packet' : 'Repair SKU, quantity, fulfilment, payment, customer, source proof'],
      ] as const
    : [
        ['Step 1', 'Upload your order CSV'],
        ['Step 2', 'Checks fields locally'],
        ['Step 3', 'Download reviewed packet'],
      ] as const
  const orderIntakeGuideRows = [
    ['Channels', 'CSV, Viber, LINE, WeChat, email, form'],
    ['Review fields', 'Customer, SKU, quantity, fulfilment, payment, source proof'],
    ['Owner sees', 'Ready rows, blocked rows, stock risk, missing fields'],
    ['Output', 'One reviewed packet for Shop queue approval'],
  ] as const
  const lifecycleRows = [
    ['Capture', pendingManagedRequests.length ? `${pendingManagedRequests.length} request${pendingManagedRequests.length === 1 ? '' : 's'}` : buyingCart.length ? `${buyingCart.length} cart lines` : 'Ready'],
    ['Price', buyingReady ? 'Quote controlled' : 'Save store first'],
    ['ATP', orderOpsStockRiskCount ? `${orderOpsStockRiskCount} risk` : catalog.items.length ? 'Shop stock' : 'Need catalog'],
    ['Fulfil', pendingManagedRequests.length ? 'Shop queue' : buyingReady ? 'Pickup/delivery ready' : 'Setup first'],
    ['Return', 'Shop accountable'],
  ] as const
  const paymentDeliveryRows = [
    ['Payment', orderOpsPaymentRiskCount ? `${orderOpsPaymentRiskCount} manual QR` : controlPaymentsVisible ? 'Not authorized' : 'Locked'],
    ['Delivery', deliveryReviewCount ? `${deliveryReviewCount} review` : buyingReady ? 'Owner priced' : 'Locked'],
    ['Pickup', pickupReviewCount ? `${pickupReviewCount} review` : buyingReady ? 'Allowed' : 'Locked'],
    ['Expiry', orderOpsExpiringCount ? `${orderOpsExpiringCount} quote` : buyingReady ? '30 min quote' : 'No quote'],
    ['Control', pendingManagedRequests.length ? 'Shop confirms' : 'No customer send'],
  ] as const
  const requestHasStockRisk = (request: typeof pendingManagedRequests[number]) => commerceStorefrontRequestLines(request).some((line) => {
    const item = catalog.items.find((candidate) => candidate.sku === line.sku)
    return !item || item.onHand < line.quantity
  })
  const requestIsExpiring = (request: typeof pendingManagedRequests[number]) => {
    const minutes = minutesUntil('quote' in request ? request.quote.expiresAt : undefined, orderOpsNow)
    return minutes !== null && minutes > 0 && minutes <= 15
  }
  const requestNeedsPaymentReview = (request: typeof pendingManagedRequests[number]) => 'quote' in request && request.quote.payment.adapter === 'kbzpay_manual'
  const ecommerceAttentionRequests = ecommerceAttention?.kind === 'shop-request'
    ? actionablePendingManagedRequests.filter((request) => ecommerceAttention.filter === 'stock'
      ? requestHasStockRisk(request)
      : ecommerceAttention.filter === 'expiring'
        ? requestIsExpiring(request)
        : ecommerceAttention.filter === 'payment'
          ? requestNeedsPaymentReview(request)
          : ecommerceAttention.filter === 'aged'
            ? Date.parse(request.createdAt) <= orderOpsNow - 30 * 60 * 1000
            : true)
    : []
  const ecommerceAttentionRequest = ecommerceAttentionRequests
    .sort((left, right) => ecommerceAttentionRequestRank(ecommerceAttention?.filter ?? 'all', {
      createdAt: left.createdAt,
      expiresAt: 'quote' in left ? left.quote.expiresAt : undefined,
    }) - ecommerceAttentionRequestRank(ecommerceAttention?.filter ?? 'all', {
      createdAt: right.createdAt,
      expiresAt: 'quote' in right ? right.quote.expiresAt : undefined,
    }))[0] ?? null
  const requestInboxFilteredRequests = actionablePendingManagedRequests.filter((request) => (
    requestInboxFilter === 'all'
      || (requestInboxFilter === 'stock' && requestHasStockRisk(request))
      || (requestInboxFilter === 'expiring' && requestIsExpiring(request))
      || (requestInboxFilter === 'payment' && requestNeedsPaymentReview(request))
      || (requestInboxFilter === 'delivery' && request.fulfilment === 'delivery')
  ))
  const requestInboxNextRequest = requestInboxFilteredRequests[0] ?? null
  const requestInboxStage = importNeeded
    ? 'Import catalog before request review'
    : sampleCatalogPreview
      ? 'Replace sample products before order review'
    : !buyingReady
      ? 'Save store before order review'
      : requestInboxFilteredRequests.length
        ? 'Open filtered Shop review'
        : actionablePendingManagedRequests.length
          ? 'Switch filter to find requests'
          : expiredPendingRequestCount
            ? 'New customer quote needed'
          : buyingReady
            ? 'Inbox ready for requests'
            : 'Request inbox locked'
  const requestInboxRows = [
    ['All', `${actionablePendingManagedRequests.length}`],
    ['Stock', `${orderOpsStockRiskCount}`],
    ['Expiring', `${orderOpsExpiringCount}`],
    ['Payment', `${orderOpsPaymentRiskCount}`],
    ['Delivery', `${deliveryReviewCount}`],
  ] as const
  const requestInboxFilterButtons = [
    ['all', 'All'],
    ['stock', 'Stock'],
    ['expiring', 'Expiring'],
    ['payment', 'Payment'],
    ['delivery', 'Delivery'],
  ] as const
  const requestInboxNextSummary = requestInboxNextRequest
    ? `${requestInboxNextRequest.customerReference} · ${commerceStorefrontRequestLines(requestInboxNextRequest).length} line${commerceStorefrontRequestLines(requestInboxNextRequest).length === 1 ? '' : 's'} · ${formatMmk(requestInboxNextRequest.totalMmk)}`
    : actionablePendingManagedRequests.length
      ? 'No actionable request matches this filter.'
      : expiredPendingRequestCount
        ? 'Expired history needs a fresh customer quote.'
      : 'No customer request is waiting.'
  const quoteRecoveryStage = importNeeded
    ? 'Import catalog before recovery'
    : sampleCatalogPreview
      ? 'Replace sample products before recovery'
    : !buyingReady
      ? 'Save store before recovery'
      : orderOpsExpiringCount
        ? 'Prepare quote refresh'
        : orderOpsAgingCount
          ? 'Recover aged request'
          : actionablePendingManagedRequests.length
            ? 'Open Shop recovery'
            : expiredPendingRequestCount
              ? 'Start a fresh customer order'
            : buyingCart.length
              ? 'Review recovery quote'
              : 'Prepare recovery cart'
  const quoteRecoveryRows = [
    ['Queue', pendingManagedRequests.length ? `${pendingManagedRequests.length} request` : 'No managed queue'],
    ['Expiring', orderOpsExpiringCount ? `${orderOpsExpiringCount} quote` : 'Clear'],
    ['Aged', orderOpsAgingCount ? `${orderOpsAgingCount} request` : 'Inside SLA'],
    ['Draft', buyingCart.length ? `${buyingCart.length} cart lines` : buyingReady ? 'Ready' : 'Locked'],
    ['Boundary', pendingManagedRequests.length ? 'Shop review' : 'No customer send'],
  ] as const
  const customerFollowUpRequest = pendingManagedRequests.find((request) => commerceStorefrontRequestLines(request).some((line) => {
    const item = catalog.items.find((candidate) => candidate.sku === line.sku)
    return !item || item.onHand < line.quantity
  }))
    ?? pendingManagedRequests.find((request) => {
      const minutes = minutesUntil('quote' in request ? request.quote.expiresAt : undefined, orderOpsNow)
      return minutes !== null && minutes <= 15
    })
    ?? pendingManagedRequests.find((request) => Date.parse(request.createdAt) <= orderOpsNow - 30 * 60 * 1000)
    ?? pendingManagedRequests[0]
    ?? null
  const customerFollowUpStage = importNeeded
    ? 'Import catalog before follow-up'
    : sampleCatalogPreview
      ? 'Replace sample products before follow-up'
    : !buyingReady
      ? 'Save store before follow-up'
      : orderOpsStockRiskCount
        ? 'Draft availability update'
        : orderOpsExpiringCount
          ? 'Draft quote refresh'
          : orderOpsPaymentRiskCount
            ? 'Draft payment clarification'
            : deliveryReviewCount
              ? 'Draft delivery confirmation'
              : pendingManagedRequests.length
                ? 'Draft Shop review update'
                : buyingReady
                  ? 'Follow-up ready when orders arrive'
                  : 'Follow-up locked'
  const customerFollowUpRows = [
    ['Customer', customerFollowUpRequest?.customerReference ?? 'No request yet'],
    ['Reason', orderOpsStockRiskCount ? 'Stock check' : orderOpsExpiringCount ? 'Quote expiry' : orderOpsPaymentRiskCount ? 'Payment review' : deliveryReviewCount ? 'Delivery review' : pendingManagedRequests.length ? 'Shop review' : 'Wait for order'],
    ['Payment', orderOpsPaymentRiskCount ? 'Manual QR' : pendingManagedRequests.length ? 'Not authorized' : 'Locked'],
    ['Delivery', deliveryReviewCount ? `${deliveryReviewCount} review` : pickupReviewCount ? 'Pickup allowed' : 'None yet'],
    ['Boundary', 'Draft only'],
  ] as const
  const replyChannelButtons = [
    ['viber', 'Viber'],
    ['line', 'LINE'],
    ['wechat', 'WeChat'],
    ['email', 'Email'],
  ] as const
  const channelReplyStage = importNeeded
    ? 'Import catalog before reply templates'
    : sampleCatalogPreview
      ? 'Replace sample products before reply templates'
    : !buyingReady
      ? 'Save store before reply templates'
      : customerFollowUpRequest
        ? 'Prepare reviewed channel reply'
        : buyingReady
          ? 'Reply templates ready'
          : 'Reply templates locked'
  const channelReplyRows = [
    ['Channel', replyChannelButtons.find(([value]) => value === replyChannelTemplate)?.[1] ?? 'Viber'],
    ['Intent', customerFollowUpRequest ? customerFollowUpStage.replace('Draft ', '') : 'Wait for request'],
    ['Evidence', customerFollowUpRequest ? customerFollowUpRequest.id : 'No request yet'],
    ['Review', customerFollowUpRequest ? 'Owner approves' : 'Locked'],
    ['Boundary', 'No send'],
  ] as const
  const fulfillmentHandoffStage = importNeeded
    ? 'Import catalog before fulfillment'
    : sampleCatalogPreview
      ? 'Replace sample products before fulfillment'
    : !buyingReady
      ? 'Save store before fulfillment'
      : orderImportReview?.status === 'blocked'
        ? 'Repair imported orders'
        : orderImportReview?.status === 'ready'
          ? 'Package orders for Shop'
          : orderOpsStockRiskCount
            ? 'Resolve stock before review'
            : orderOpsPaymentRiskCount
              ? 'Review payment before review'
              : deliveryReviewCount
                ? 'Review delivery before review'
                : pendingManagedRequests.length
                    ? 'Open Shop fulfilment queue'
                  : buyingReady
                    ? 'Fulfilment review ready'
                    : 'Fulfilment review locked'
  const fulfillmentHandoffRows = [
    ['Source', orderImportReview ? `${orderImportReview.readyRows}/${orderImportReview.totalRows} import` : pendingManagedRequests.length ? 'Managed queue' : buyingCart.length ? 'Cart quote' : 'No request yet'],
    ['Stock', orderOpsStockRiskCount ? `${orderOpsStockRiskCount} risk` : catalog.items.length ? 'ATP check' : 'Need catalog'],
    ['Payment', orderOpsPaymentRiskCount ? `${orderOpsPaymentRiskCount} manual` : pendingManagedRequests.length || buyingReady ? 'Not charged' : 'Locked'],
    ['Fulfilment', deliveryReviewCount ? `${deliveryReviewCount} delivery` : pickupReviewCount ? `${pickupReviewCount} pickup` : buyingReady ? 'Pickup/delivery' : 'Locked'],
    ['Reply', customerFollowUpRequest ? 'Draftable' : buyingReady ? 'Template ready' : 'Locked'],
    ['Shop review', pendingManagedRequests.length ? 'Review queue' : orderImportReview?.status === 'ready' ? 'Packet ready' : buyingReady ? 'Quote only' : 'Save store first'],
    ['Safety', 'Review first'],
  ] as const
  const deliveryReviewRequest = pendingManagedRequests.find((request) => request.fulfilment === 'delivery')
    ?? null
  const deliveryZoneHint = deliveryReviewRequest ? deliveryAreaFromCustomerReference(deliveryReviewRequest.customerReference) : ''
  const deliveryAreaTemplateStage = importNeeded
    ? 'Import catalog before delivery templates'
    : sampleCatalogPreview
      ? 'Replace sample products before delivery templates'
    : !buyingReady
      ? 'Save store before delivery templates'
      : deliveryReviewRequest
        ? 'Prepare delivery-area template'
        : buyingReady
          ? 'Template ready when requests arrive'
          : 'Delivery templates locked'
  const deliveryAreaTemplateRows = [
    ['Area', deliveryZoneHint || 'No request yet'],
    ['Rule', deliveryReviewRequest ? 'Fee review' : buyingReady ? 'Template shell' : 'Locked'],
    ['Rider', deliveryReviewRequest ? 'Review' : 'Not assigned'],
    ['Payment', deliveryReviewRequest && 'quote' in deliveryReviewRequest ? deliveryReviewRequest.quote.payment.adapter === 'kbzpay_manual' ? 'Manual QR' : 'COD review' : 'No charge'],
    ['Reuse', deliveryReviewRequest ? 'After review' : 'Needs order'],
  ] as const
  const deliveryFeeStage = importNeeded
    ? 'Import catalog before delivery setup'
    : sampleCatalogPreview
      ? 'Replace sample products before delivery setup'
    : !buyingReady
      ? 'Save store before delivery setup'
      : deliveryReviewCount
        ? 'Review delivery zone and fee'
        : buyingReady
          ? 'Delivery template ready'
          : 'Delivery setup locked'
  const deliveryFeeRows = [
    ['Zone', deliveryZoneHint || (deliveryReviewCount ? 'Review area' : 'No request yet')],
    ['Fee', deliveryReviewCount ? 'Shop confirms' : buyingReady ? 'Template only' : 'Locked'],
    ['Rider', deliveryReviewCount ? 'Assign in Shop' : 'Not booked'],
    ['Payment', deliveryReviewRequest && 'quote' in deliveryReviewRequest ? deliveryReviewRequest.quote.payment.adapter === 'kbzpay_manual' ? 'Manual QR' : 'COD' : 'Not charged'],
    ['Boundary', 'No booking'],
  ] as const
  const requestWaitingInLocalMode = customerRequestState === 'waiting_shop_review' && !managedIdentity
  const requestDeliveryVerified = Boolean(managedIdentity && deliveryConfirmedForScope(customerRequestDeliveryConfirmed, buyingScope))
  const ecommerceWaitingHeadline = requestWaitingInLocalMode ? 'Order request saved' : requestDeliveryVerified ? 'Request sent to Shop' : 'Request saved — verify Shop delivery'
  const ecommerceWaitingSummary = requestWaitingInLocalMode
    ? 'Saved on this device for Shop review. No order, charge, stock, delivery, or customer message changed.'
    : requestDeliveryVerified ? 'No charge or stock change happens until Shop confirms the order.' : 'This device retained the request, but delivery to Company Shop is not verified in this session. Check the request before retrying. No charge or stock change is confirmed.'
  const ecommerceWaitingMetric = requestWaitingInLocalMode ? 'Local receipt' : requestDeliveryVerified ? 'Review waiting' : 'Delivery unverified'
  const orderingReadinessStage = importNeeded
    ? 'Import Shop catalog'
    : sampleCatalogPreview
      ? 'Replace sample products'
    : !selectedSkus.length
      ? 'Choose sellable products'
      : !previewResult.preview
        ? 'Repair storefront'
        : !savedDraftIsCurrent
          ? 'Save store'
          : pendingManagedRequests.length
            ? 'Clear Shop review queue'
            : buyingReady
              ? 'Ready for reviewed orders'
              : 'Check ordering controls'
  const orderingReadinessRows = [
    ['Catalog', importNeeded ? 'Needed' : `${catalog.items.length} items`],
    ['Storefront', sampleCatalogPreview ? 'Sample only' : previewResult.preview ? savedDraftIsCurrent ? 'Saved' : 'Draft ready' : 'Blocked'],
    ['Checkout', buyingReady ? 'Quote ready' : 'Locked'],
    ['Queue', pendingManagedRequests.length ? `${pendingManagedRequests.length} Shop review` : 'Clear'],
    ['Safety', managedIdentity ? 'Account review' : 'Device only'],
  ] as const
  const managedStoreActivationStage = importNeeded
    ? 'Import catalog for go-live'
    : sampleCatalogPreview
      ? 'Replace sample products before going live'
    : !savedDraftIsCurrent
      ? 'Save store before going live'
      : !buyingReady
        ? 'Repair checkout checks'
        : pendingManagedRequests.length
          ? 'Clear Shop review queue'
          : orderOpsPaymentRiskCount
            ? 'Review payment checks'
            : deliveryReviewCount
              ? 'Review delivery checks'
              : managedIdentity
                ? 'Managed store ready'
                : 'Download go-live file'
  const managedStoreActivationRows = [
    ['Catalog', importNeeded ? 'Needed' : `${selectedSkus.length} sellable`],
    ['Store', sampleCatalogPreview ? 'Sample blocked' : buyingReady ? 'Saved check' : 'Save required'],
    ['Checkout', buyingReady ? 'Quote controlled' : 'Locked'],
    ['Payments', orderOpsPaymentRiskCount ? `${orderOpsPaymentRiskCount} manual QR` : 'Review only'],
    ['Delivery', deliveryReviewCount ? `${deliveryReviewCount} review` : buyingReady ? 'Template ready' : 'Locked'],
    ['Shop review', pendingManagedRequests.length ? `${pendingManagedRequests.length} to review` : 'No queue'],
    ['Go-live', managedIdentity ? 'Account controls' : 'Download file'],
  ] as const
  function downloadManagedStoreActivationPacket() {
    if (!buyingReady) {
      setDraftNotice(sampleCatalogPreview
        ? 'Replace the sample products in Shop before preparing a go-live file.'
        : 'Save the exact customer view before preparing a go-live file.')
      return
    }
    const packet = buildEcommerceManagedStoreActivationPacket({
      generatedAt: new Date().toISOString(),
      product: 'ecommerce',
      storeName,
      stage: managedStoreActivationStage,
      operatingMode: managedIdentity ? 'managed_trial' : 'browser_local_trial',
      source: {
        catalogSource: catalog.source,
        catalogItems: catalog.items.length,
        selectedSkus: [...selectedSkus],
        previewDigest: digest || null,
        managedCatalogDigest: managedCatalogDigest || null,
        savedRevision: savedDraft?.revision ?? null,
        savedAt: savedDraft?.savedAt ?? null,
      },
      readiness: Object.fromEntries(managedStoreActivationRows) as EcommerceManagedStoreActivationReadiness,
      orderQueue: {
        pendingShopReviews: pendingManagedRequests.length,
        stockRisk: orderOpsStockRiskCount,
        expiringQuotes: orderOpsExpiringCount,
        manualPaymentReview: orderOpsPaymentRiskCount,
        deliveryReview: deliveryReviewCount,
        pickupReview: pickupReviewCount,
      },
    })
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(packet, null, 2)}\n`], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `supermega-ecommerce-activation-${safeEcommerceFilename(storeName)}.json`
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: 'Download Ecommerce managed store go-live file',
    })
    setDraftNotice('Ecommerce go-live file downloaded. No product, customer, payment, delivery, stock, Shop, or company account state changed.')
  }
  const aiAgentJob = sampleCatalogPreview
    ? 'Replace sample products'
    : pendingManagedRequests.length
      ? 'Review Ecommerce requests in Shop'
    : customerRequestState === 'waiting_shop_review'
      ? 'View the customer request receipt'
    : ecommerceActiveOrderCount
      ? 'Continue Ecommerce order in Shop'
    : importNeeded
      ? 'Prepare catalog import'
      : storefrontSetupRequired
        ? 'Finish store'
        : buyingCart.length
          ? 'Review cart quote'
          : managedIdentity
            ? 'Open store for ordering'
            : 'Open customer ordering'
  const orderAutopilotStage = sampleCatalogPreview
    ? 'Replace sample products'
    : importNeeded
      ? 'Connect products'
    : storefrontSetupRequired
      ? 'Save store'
      : orderImportReview?.status === 'ready'
        ? 'Package order batch'
        : orderImportReview?.status === 'blocked'
          ? 'Repair order batch'
          : pendingManagedRequests.length
            ? 'Open Shop review'
            : customerRequestState === 'waiting_shop_review'
              ? 'View request receipt'
            : ecommerceActiveOrderCount
              ? 'Continue fulfilment'
            : buyingReady
              ? 'Ready for customer orders'
              : 'Check setup'
  const ecommerceTodayCartUnits = buyingCart.reduce((total, line) => total + line.quantity, 0)
  const ecommerceTodayState = sampleCatalogPreview || importNeeded || storefrontSetupRequired
    ? 'setup'
    : ecommerceRefundAttentionCount || ecommercePaymentAttentionCount || orderOpsStockRiskCount || actionablePendingManagedRequests.length || customerRequestState === 'waiting_shop_review'
      ? 'attention'
      : 'ready'
  const ecommerceTodayHeadline = sampleCatalogPreview
    ? 'Sample storefront is preview-only'
    : importNeeded
      ? 'Connect your products to start selling'
    : storefrontSetupRequired
      ? 'Finish the store customers will see'
      : ecommerceAttention
        ? ecommerceAttention.headline
        : customerRequestState === 'confirmed'
          ? 'Your order is confirmed'
          : customerRequestState === 'waiting_shop_review' && !ecommerceTodayCartUnits
            ? ecommerceWaitingHeadline
            : ecommerceActiveOrderCount && !ecommerceTodayCartUnits
              ? `${ecommerceActiveOrderCount} order${ecommerceActiveOrderCount === 1 ? '' : 's'} in progress`
              : ecommerceTodayCartUnits
                ? `${ecommerceTodayCartUnits} item${ecommerceTodayCartUnits === 1 ? '' : 's'} ready for checkout`
                : managedIdentity
                  ? 'Your store is ready for the next order'
                  : 'Your store is ready'
  const ecommerceTodaySummary = sampleCatalogPreview
    ? 'Example products cannot accept customer requests. Replace them in Shop, then review and save the customer view.'
    : importNeeded
      ? 'Import one Shop catalog. Products, stock, prices, checkout, and order review will use that source.'
    : storefrontSetupRequired
      ? 'Review the customer view once, then save the exact products, prices, and page customers will see.'
      : ecommerceAttention
        ? ecommerceAttention.summary
        : customerRequestState === 'confirmed'
          ? 'Track this order, or use Reorder to review another purchase.'
        : customerRequestState === 'waiting_shop_review' && !ecommerceTodayCartUnits
          ? ecommerceWaitingSummary
        : ecommerceActiveOrderCount && !ecommerceTodayCartUnits
          ? 'Shop owns fulfilment for this order. The storefront stays ready for the next customer.'
          : managedIdentity
            ? 'Customers can browse and build a cart. Shop remains in control of payment, stock, delivery, and returns.'
            : ecommerceTodayCartUnits
              ? 'Review this order request. Nothing is sent until Shop review.'
              : 'Add an item to start an order request. Nothing is sent until Shop review.'
  const ecommerceTodayAction = sampleCatalogPreview
    ? 'Replace sample products'
    : importNeeded
      ? 'Connect products'
    : storefrontSetupRequired
      ? 'Finish store'
      : orderImportReview?.status === 'ready'
        ? 'Download order packet'
        : orderImportReview?.status === 'blocked'
          ? 'Fix order import'
          : ecommerceAttention
            ? ecommerceAttention.action
            : customerRequestState === 'confirmed'
              ? 'View order'
            : customerRequestState === 'waiting_shop_review' && !ecommerceTodayCartUnits
              ? 'View request receipt'
            : ecommerceActiveOrderCount && !ecommerceTodayCartUnits
              ? 'Open Shop'
            : ecommerceTodayCartUnits
              ? 'Review checkout'
              : managedIdentity
                ? 'Prepare next order'
                : 'Open customer ordering'
  const ecommerceTodayMetrics = [
    ['Store', sampleCatalogPreview ? 'Sample' : savedDraftIsCurrent ? 'Ready' : catalogHydrating ? 'Checking' : storefrontSetupRequired ? 'Needs setup' : 'Ready'],
    ['Cart', ecommerceTodayCartUnits ? `${ecommerceTodayCartUnits} item${ecommerceTodayCartUnits === 1 ? '' : 's'}` : buyingReady ? 'Ready' : 'Locked'],
    ['Order follow-up', actionablePendingManagedRequests.length
      ? `${actionablePendingManagedRequests.length} to review`
      : expiredPendingRequestCount
        ? `${expiredPendingRequestCount} expired · requote required`
      : customerRequestState === 'waiting_shop_review'
        ? ecommerceWaitingMetric
      : ecommerceActiveOrderCount
        ? `${ecommerceActiveOrderCount} in progress`
        : ecommerceCompletedOrderCount
          ? `${ecommerceCompletedOrderCount} completed`
          : 'No order yet'],
  ] as const
  const ecommerceTodayActionOpensStore = !sampleCatalogPreview
    && !importNeeded
    && !storefrontSetupRequired
    && orderImportReview?.status !== 'ready'
    && orderImportReview?.status !== 'blocked'
    && !ecommerceAttention
    && customerRequestState !== 'confirmed'
    && !(customerRequestState === 'waiting_shop_review' && !ecommerceTodayCartUnits)
    && !(ecommerceActiveOrderCount && !ecommerceTodayCartUnits)
    && !ecommerceTodayCartUnits
  const orderDeskRequest = requestInboxNextRequest ?? actionablePendingManagedRequests[0] ?? null
  const orderDeskRequestMinutes = orderDeskRequest
    ? Math.max(0, Math.round((orderOpsNow - Date.parse(orderDeskRequest.createdAt)) / 60_000))
    : 0
  const orderDeskQuoteMinutes = orderDeskRequest && 'quote' in orderDeskRequest
    ? minutesUntil(orderDeskRequest.quote.expiresAt, orderOpsNow)
    : null
  const orderDeskRequestView = orderDeskRequest ? {
    customer: orderDeskRequest.customerReference,
    fulfilment: orderDeskRequest.fulfilment === 'delivery' ? 'Delivery' : 'Pickup',
    id: orderDeskRequest.id,
    lineCount: commerceStorefrontRequestLines(orderDeskRequest).length,
    placedLabel: orderDeskRequestMinutes < 1 ? 'Just now' : `${orderDeskRequestMinutes} min ago`,
    quoteLabel: orderDeskQuoteMinutes === null
      ? 'Shop review'
      : orderDeskQuoteMinutes <= 0
        ? 'Expired'
        : `${orderDeskQuoteMinutes} min left`,
    totalLabel: formatMmk(orderDeskRequest.totalMmk),
    flags: [
      ...(requestHasStockRisk(orderDeskRequest) ? ['Stock check'] : []),
      ...(requestNeedsPaymentReview(orderDeskRequest) ? ['Payment review'] : []),
      ...(requestIsExpiring(orderDeskRequest) ? ['Quote expiring'] : []),
      ...(orderDeskRequest.fulfilment === 'delivery' ? ['Delivery review'] : []),
    ],
  } : null
  function openOrderDeskException(filter: CommerceOrderDeskFilter) {
    const request = filter === 'refund' ? null : actionablePendingManagedRequests.find((candidate) => filter === 'stock'
      ? requestHasStockRisk(candidate)
      : filter === 'expiring'
        ? requestIsExpiring(candidate)
        : filter === 'payment'
          ? requestNeedsPaymentReview(candidate)
          : candidate.fulfilment === 'delivery')
    navigate(request
      ? `/shop/?tab=orders&source=ecommerce-inbox&request=${encodeURIComponent(request.id)}`
      : '/shop/?tab=orders')
  }
  function openOrderDeskNext() {
    if (orderDeskRequest) {
      navigate(`/shop/?tab=orders&source=ecommerce-inbox&request=${encodeURIComponent(orderDeskRequest.id)}`)
      return
    }
    if (ecommerceActiveOrderCount || ecommerceRefundAttentionCount || ecommercePaymentAttentionCount) {
      navigate('/shop/?tab=orders')
      return
    }
    showWorkspace('preview')
  }
  function runOrderAutopilot(event: ReactMouseEvent<HTMLButtonElement>) {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: `Order autopilot: ${orderAutopilotStage}`,
    })
    if (sampleCatalogPreview) {
      navigate('/shop/?tab=inventory')
      return
    }
    if (importNeeded) {
      navigate(managedIdentity ? '/settings/?product=ecommerce' : '/shop/?tab=inventory')
      return
    }
    if (storefrontSetupRequired) {
      finishStorefrontSetup()
      return
    }
    if (orderImportReview?.status === 'ready') {
      downloadOrderImportReviewPacket()
      return
    }
    if (ecommerceAttention?.kind === 'shop-request' && ecommerceAttentionRequest) {
      const actionNow = Math.round(globalThis.performance.timeOrigin + event.timeStamp)
      setOrderOpsNow(actionNow)
      if (requestQuoteIsExpired(ecommerceAttentionRequest, actionNow)) return
      navigate(`/shop/?tab=orders&source=ecommerce-inbox&request=${encodeURIComponent(ecommerceAttentionRequest.id)}`)
      return
    }
    if (ecommerceAttention) {
      navigate('/shop/?tab=orders')
      return
    }
    if (actionablePendingManagedRequests.length) {
      navigate('/shop/?tab=orders&source=ecommerce-inbox')
      return
    }
    if (customerRequestState === 'confirmed') {
      setTrackingRequest((request) => request + 1)
      return
    }
    if (customerRequestState === 'waiting_shop_review' && !ecommerceTodayCartUnits) {
      focusCurrentRequestReceipt(event)
      return
    }
    if (ecommerceActiveOrderCount && !ecommerceTodayCartUnits) {
      navigate('/shop/?tab=orders')
      return
    }
    // With items already in the cart the button reads "Review checkout", but every branch
    // above missed and it fell through to prepareQuoteRecovery — which adds the first
    // preview item to the cart. If that item was already in there (the normal case, since
    // it is what put the cart in this state) nothing changed at all, so the primary action
    // did nothing in exactly the situation it advertises. Open the checkout instead.
    if (ecommerceTodayCartUnits && openBuyingWorkspace()) return
    prepareQuoteRecovery(event)
  }

  useEffect(() => {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_seen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: aiAgentJob,
    })
  }, [aiAgentJob, location.pathname, location.search])

  const workspaceCopy = workspaceView === 'orders'
    ? {
        title: 'Orders',
        copy: managedIdentity
          ? 'Review customer requests and resolve exceptions. Shop confirms orders, stock, delivery and payment.'
          : 'Review customer requests on this device. Requests stay on this device until Shop review.',
      }
    : { title: 'Online store', copy: workspaceView === 'setup' ? 'Choose your products. See your store take shape.' : 'Your products, with the prices and stock from Shop.' }
  const catalogSearchTerm = catalogSearch.trim().toLowerCase()
  const visibleCatalogItems = catalogSearchTerm
    ? catalog.items.filter((item) => `${item.name} ${item.variant ?? ''} ${item.sku}`.toLowerCase().includes(catalogSearchTerm))
    : catalog.items

  if (!catalogHydrating && sampleCatalogPreview) {
    return (
      <div className="workspace-screen ecommerce-product">
        <header className="ecommerce-heading">
          <div><span className="core-eyebrow">Commerce</span><h1>Add your products to Shop</h1>
            <p>Commerce uses the products, prices, and stock you manage in Shop.</p></div>
        </header>
        <section className="core-panel" aria-label="Connect the Shop catalog">
          <Link className="core-button primary" state={{ commerceReturn: true }} to="/shop/?tab=inventory#shop-catalog-import">Open Shop inventory</Link>
        </section>
      </div>
    )
  }

  if (!catalogHydrating && !managedIdentity && catalog.source === 'shop-local'
    && catalog.items.length === 0 && !draftIssue && !draftBusy) {
    return (
      <div className="workspace-screen ecommerce-product">
        <header className="ecommerce-heading">
          <div><span className="core-eyebrow">Commerce</span><h1>Add products in Shop</h1>
            <p>Your online store uses the same prices and stock.</p></div>
        </header>
        <section className="core-panel" aria-label="Open Shop inventory">
          <Link className="core-button primary" state={{ commerceReturn: true }} to="/shop/?tab=inventory#shop-catalog-import">Add products</Link>
        </section>
      </div>
    )
  }

  return (
    <div className="workspace-screen ecommerce-product">
      {managedIdentity && managedCanDeliverReviews ? <details className="compact-disclosure">
        <summary>Customer catalog review</summary>
        <Suspense fallback={<p role="status">Opening review tools…</p>}>
          <CatalogReviewPreparation key={JSON.stringify([managedIdentity.workspaceId, managedIdentity.userId])}
            workspaceId={managedIdentity.workspaceId} actorId={managedIdentity.userId} />
        </Suspense>
      </details> : null}
      {cartSessionUnavailable ? <p role="status">This browser cannot keep your cart after a refresh.</p> : null}
      <header className="ecommerce-heading">
        <div>
          <h1 ref={workspaceHeadingRef} tabIndex={-1}>{workspaceCopy.title}</h1>
          <p>{workspaceCopy.copy}</p>
        </div>
        {workspaceView === 'preview' ? <button className="core-button secondary" onClick={() => showWorkspace('setup')} type="button">Edit store</button> : null}
      </header>

      <nav aria-label="Commerce workspace" className="ecommerce-mode-nav" id="ecommerce-workspace-nav">
        <Link aria-current={workspaceView === 'orders' ? 'page' : undefined} to={ecommerceWorkspacePath(location.pathname, location.search, 'orders')}>Orders</Link>
        <Link aria-current={workspaceView !== 'orders' ? 'page' : undefined} to={ecommerceWorkspacePath(location.pathname, location.search, 'preview')}>Online store</Link>
      </nav>

      {workspaceView === 'orders' ? <div className="ecommerce-orders-workspace" id="ecommerce-orders-panel">
      <CommerceOrderDesk
        activeOrderCount={ecommerceActiveOrderCount}
        contextLabel={`${sourceLabel} · Shop reviews each customer request before it becomes an order.`}
        exceptionCounts={{
          stock: orderOpsStockRiskCount,
          expiring: orderOpsExpiringCount,
          payment: orderOpsPaymentRiskCount + ecommercePaymentAttentionCount,
          delivery: deliveryReviewCount,
          refund: ecommerceRefundAttentionCount,
        }}
        headline={ecommerceTodayHeadline}
        nextRequest={orderDeskRequestView}
        onOpenException={openOrderDeskException}
        onOpenNext={openOrderDeskNext}
        onOpenStore={() => showWorkspace('preview')}
        onPrimaryAction={runOrderAutopilot}
        primaryActionDisabled={catalogHydrating}
        primaryActionLabel={ecommerceTodayAction}
        primaryActionOpensStore={ecommerceTodayActionOpensStore}
        state={ecommerceTodayState}
        statusRows={ecommerceTodayMetrics}
        summary={ecommerceTodaySummary}
      />

      <details className="ecommerce-business-controls">
        <summary><span><strong>Extra order tools</strong></span></summary>
        <p>Prepare and review here. Confirm orders in Shop; send customer messages separately.</p>
        <div className="ecommerce-business-controls-content">
      <section aria-label="Import customer orders" className="ecommerce-ops-cockpit ecommerce-order-import-cockpit">
        <div>
          <span className="core-eyebrow">Import customer orders</span>
          <h2>{orderImportStage}</h2>
          <p>Check imported orders against your catalog. A manager reviews them before saving to Shop.</p>
          <div className="ecommerce-inline-actions">
            <Link className="text-link" to="/settings/?product=ecommerce">Open import setup</Link>
            <button className="text-link" onClick={downloadOrderImportTemplate} type="button">Download order template</button>
          </div>
          <details className="ecommerce-order-import-workspace" open={orderImportText || orderImportReview ? true : undefined}>
            <summary><span>Review an order batch</span><small>Upload CSV or paste channel orders only when needed.</small></summary>
            <div aria-label="Order batch review workspace" className="ecommerce-order-import-workspace-body">
              <div aria-label="Order intake guide" className="ecommerce-order-intake-guide">
                <StatusRows rows={orderIntakeGuideRows} />
              </div>
              <div aria-label="Order repair checklist" className="ecommerce-order-repair-checklist">
                <StatusRows rows={orderRepairRows} />
              </div>
              <label className="ecommerce-order-import-upload">Upload order CSV<input accept=".csv,text/csv,text/plain" disabled={sampleCatalogPreview} onChange={uploadOrderImportCsv} type="file" /></label>
              <label className="ecommerce-order-import-field">Order batch CSV<textarea disabled={sampleCatalogPreview} onChange={(event) => {
                setOrderImportText(event.target.value)
                setOrderImportReview(null)
                setOrderImportSourceName('')
              }} placeholder="Paste customer_reference, channel, sku, quantity, fulfilment, payment, source_message rows" value={orderImportText} /></label>
              <button className="text-link" disabled={sampleCatalogPreview || !orderImportText.trim()} onClick={reviewOrderImportBatch} type="button">Review order batch</button>
              {orderImportReview ? <div className={`ecommerce-order-import-review ${orderImportReview.status}`} role="status"><strong>{orderImportReview.status === 'ready' ? 'Ready for review' : 'Repair before Shop review'}</strong><span>{orderImportReview.summary}</span><small>{orderImportReview.readyRows} ready · {orderImportReview.blockedRows} blocked · review first</small><button className="text-link" disabled={sampleCatalogPreview} onClick={downloadOrderImportReviewPacket} type="button">Download review packet</button></div> : null}
              {orderImportSourceName ? <p className="ecommerce-order-import-source">Local file: {orderImportSourceName}</p> : null}
              {orderImportNotice ? <p className="ecommerce-order-import-notice" role="status">{orderImportNotice}</p> : null}
            </div>
          </details>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={orderImportRows} />
        </div>
      </section>

      <details aria-label="More order tools" className="ecommerce-enterprise-controls">
        <summary><span>More order tools</span><small>Inbox, payment, delivery, recovery, replies, and launch checks.</small></summary>
        <div className="ecommerce-enterprise-controls-body">
      <section aria-label="Ecommerce request inbox" className="ecommerce-ops-cockpit ecommerce-request-inbox-cockpit">
        <div>
          <span className="core-eyebrow">Request inbox</span>
          <h2>{requestInboxStage}</h2>
          <p>Find requests needing attention, then open them in Shop.</p>
          <div className="ecommerce-request-filter" role="group" aria-label="Request inbox filter">
            {requestInboxFilterButtons.map(([value, label]) => <button aria-pressed={requestInboxFilter === value} key={value} onClick={() => setRequestInboxFilter(value)} type="button">{label}</button>)}
          </div>
          <button className="text-link" disabled={!requestInboxNextRequest} onClick={openFilteredRequestInShop} type="button">Open filtered request</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={requestInboxRows} />
        </div>
        <p className="ecommerce-request-inbox-summary" role="status">{requestInboxNextSummary}</p>
      </section>

      <section aria-label="Order lifecycle queue" className="ecommerce-ops-cockpit">
        <div>
          <span className="core-eyebrow">Order lifecycle</span>
          <h2>{orderOpsPriority}</h2>
          <p>Track each order through payment, delivery and returns. Confirm changes in Shop.</p>
          <button className="text-link" disabled={!managedOrderTimeline.some((entry) => entry.order)} onClick={() => navigate('/shop/?tab=orders')} type="button">Open Shop order queue</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={orderOpsRows} />
        </div>
      </section>

      <section aria-label="Ordering readiness" className="ecommerce-ops-cockpit">
        <div>
          <span className="core-eyebrow">Ordering readiness</span>
          <h2>{orderingReadinessStage}</h2>
          <p>Check products, prices and requests before accepting orders.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={orderingReadinessRows} />
        </div>
      </section>

      <section aria-label="Ecommerce managed store go-live file" className="ecommerce-ops-cockpit ecommerce-managed-activation-cockpit">
        <div>
          <span className="core-eyebrow">Store launch checklist</span>
          <h2>{managedStoreActivationStage}</h2>
          <p>Download a checklist for launch review. Downloading does not publish your store.</p>
          <button className="text-link" disabled={!buyingReady} onClick={downloadManagedStoreActivationPacket} type="button">Download go-live file</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows ecommerce-managed-activation-rows">
          <StatusRows rows={managedStoreActivationRows} />
        </div>
      </section>

      <section aria-label="Ecommerce fulfillment review" className="ecommerce-ops-cockpit ecommerce-fulfillment-handoff-cockpit">
        <div>
          <span className="core-eyebrow">Fulfilment review</span>
          <h2>{fulfillmentHandoffStage}</h2>
          <p>Check stock, payment and delivery for the selected order.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows ecommerce-fulfillment-handoff-rows">
          <StatusRows rows={fulfillmentHandoffRows} />
        </div>
      </section>

      <section aria-label="Order lifecycle control" className="ecommerce-ops-cockpit">
        <div>
          <span className="core-eyebrow">Order lifecycle</span>
          <h2>One path from cart to return</h2>
          <p>Review the order from cart to return. Confirm changes in Shop.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={lifecycleRows} />
        </div>
      </section>

      <section aria-label="Payment and delivery controls" className="ecommerce-ops-cockpit ecommerce-payment-delivery-cockpit">
        <div>
          <span className="core-eyebrow">Payment and delivery controls</span>
          <h2>{paymentDeliveryStage}</h2>
          <p>Check payment, pickup or delivery before Shop confirmation.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={paymentDeliveryRows} />
        </div>
      </section>

      <section aria-label="Delivery fee review controls" className="ecommerce-ops-cockpit ecommerce-delivery-fee-cockpit">
        <div>
          <span className="core-eyebrow">Delivery fee review</span>
          <h2>{deliveryFeeStage}</h2>
          <p>Draft the delivery area, fee and rider details for review.</p>
          <button className="text-link" disabled={catalogHydrating || (!deliveryReviewRequest && !buyingReady)} onClick={prepareDeliveryFeeReview} type="button">Prepare delivery review</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={deliveryFeeRows} />
        </div>
        {deliveryReviewDraft ? <p className="ecommerce-delivery-review-draft" role="status">{deliveryReviewDraft}</p> : null}
      </section>

      <section aria-label="Delivery-area template controls" className="ecommerce-ops-cockpit ecommerce-delivery-template-cockpit">
        <div>
          <span className="core-eyebrow">Delivery-area templates</span>
          <h2>{deliveryAreaTemplateStage}</h2>
          <p>Draft reusable delivery areas and fees. Review before saving.</p>
          <button className="text-link" disabled={catalogHydrating || (!deliveryReviewRequest && !buyingReady)} onClick={prepareDeliveryAreaTemplate} type="button">Prepare area template</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={deliveryAreaTemplateRows} />
        </div>
        {deliveryAreaTemplateDraft ? <p className="ecommerce-delivery-template-draft" role="status">{deliveryAreaTemplateDraft}</p> : null}
      </section>

      <section aria-label="Quote recovery controls" className="ecommerce-ops-cockpit ecommerce-quote-recovery-cockpit">
        <div>
          <span className="core-eyebrow">Quote recovery</span>
          <h2>{quoteRecoveryStage}</h2>
          <p>Review expired quotes and older requests before following up.</p>
          <button className="text-link" disabled={catalogHydrating || (!pendingManagedRequests.length && !buyingReady)} onClick={prepareQuoteRecovery} type="button">Prepare quote recovery</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={quoteRecoveryRows} />
        </div>
      </section>

      <section aria-label="Customer follow-up controls" className="ecommerce-ops-cockpit ecommerce-customer-follow-up-cockpit">
        <div>
          <span className="core-eyebrow">Customer follow-up</span>
          <h2>{customerFollowUpStage}</h2>
          <p>Draft an update from the current order status. Nothing is sent.</p>
          <button className="text-link" disabled={catalogHydrating || (!pendingManagedRequests.length && !buyingReady)} onClick={prepareCustomerFollowUpDraft} type="button">Prepare follow-up draft</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={customerFollowUpRows} />
        </div>
        {customerFollowUpDraft ? <p className="ecommerce-follow-up-draft" role="status">{customerFollowUpDraft}</p> : null}
      </section>

      <section aria-label="Channel reply template controls" className="ecommerce-ops-cockpit ecommerce-channel-reply-cockpit">
        <div>
          <span className="core-eyebrow">Channel reply templates</span>
          <h2>{channelReplyStage}</h2>
          <p>Draft a reply for the selected channel. Review it before sending.</p>
          <div className="ecommerce-request-filter" role="group" aria-label="Reply channel template">
            {replyChannelButtons.map(([value, label]) => <button aria-pressed={replyChannelTemplate === value} key={value} onClick={() => setReplyChannelTemplate(value)} type="button">{label}</button>)}
          </div>
          <button className="text-link" disabled={catalogHydrating || (!customerFollowUpRequest && !buyingReady)} onClick={prepareChannelReplyTemplate} type="button">Prepare reply template</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          <StatusRows rows={channelReplyRows} />
        </div>
        {channelReplyDraft ? <p className="ecommerce-channel-reply-draft" role="status">{channelReplyDraft}</p> : null}
      </section>
        </div>
      </details>

        </div>
      </details>
      {digestError ? <p className="ecommerce-verification" role="alert">We could not verify your store changes. Keep this page open and try saving again shortly.</p> : null}
      </div> : null}

      {workspaceView !== 'orders' ? <div className="ecommerce-workspace" data-view={workspaceView}>
        <section className="core-panel ecommerce-setup" aria-busy={catalogHydrating || draftBusy} aria-labelledby="ecommerce-setup-title" id="ecommerce-setup-panel">
          <div className="panel-head">
            <div><h2 id="ecommerce-setup-title">Store details</h2></div>
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
                ? 'Current product selection reviewed; save when the store is ready.'
                : 'Select or remove a current product to confirm the replacement before saving.'}
            </p>
          ) : null}

          <div className="ecommerce-copy-fields">
            <label><span>Store name</span><input disabled={portalViewOnly || catalogHydrating || draftBusy} maxLength={60} onChange={(event) => { setStoreName(event.target.value); setDraftNotice(''); setBuyingCart([]) }} value={storeName} /></label>
            <label><span>Description <small>optional</small></span><textarea disabled={portalViewOnly || catalogHydrating || draftBusy} maxLength={180} onChange={(event) => { setSummary(event.target.value); setDraftNotice(''); setBuyingCart([]) }} rows={2} value={summary} /></label>
          </div>
          <div className="ecommerce-catalog-head">
            <strong>Products</strong>
            <small>{selectedSkus.length} of 8 selected</small>
          </div>
          {catalog.items.length > 8 ? <label>
            <span className="sr-only">Search Shop products</span>
            <input onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Name or SKU" type="search" value={catalogSearch} />
          </label> : null}
          {catalog.error ? <p className="form-notice warning-text">{catalog.error}</p> : null}
          <div className="ecommerce-catalog-list">
            {visibleCatalogItems.length ? visibleCatalogItems.map((item) => {
              const selected = selectedSkus.includes(item.sku)
              const presentation = merchandising?.find((entry) => entry.sku === item.sku)
              return (
                <button
                  aria-pressed={selected}
                  className="ecommerce-catalog-item"
                  disabled={portalViewOnly || catalogHydrating || draftBusy || (!selected && selectedSkus.length >= 8)}
                  key={item.sku}
                  onClick={() => toggleSku(item.sku)}
                  type="button"
                >
                  <span><strong>{presentation?.displayName || item.name}</strong><small>{presentation ? `${presentation.featured ? 'Featured · ' : ''}${presentation.collection}` : item.variant || item.sku}</small></span>
                  <span><b>{formatMmk(item.price)}</b><small>{item.onHand > 0 ? 'Available' : 'Sold out'}</small></span>
                  <i aria-hidden="true">{selected ? '✓' : '+'}</i>
                </button>
              )
            }) : <p className="form-notice" role="status">No matches.</p>}
          </div>

          <div
            aria-live="polite"
            className="ecommerce-save-bar"
            data-state={sampleCatalogPreview
              ? 'blocked'
              : savedDraftIsCurrent
              ? 'saved'
              : draftStorageBlocked || managedCatalogDigestError
                ? 'blocked'
                : 'unsaved'}
            role="status"
          >
            <div>
              <strong>{portalViewOnly
                ? 'View only'
                : catalogHydrating
                ? 'Checking saved store'
                : sampleCatalogPreview
                ? 'Sample catalog cannot be saved as a live store'
                : localFingerprintPending
                ? 'Checking saved customer view'
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
                ? 'Saved to your company'
                  : 'Saved on this device'
                : savedDraft ? 'Unsaved changes' : 'Not saved yet'}</strong>
              <small>{portalViewOnly
                ? 'Ask a company owner to assign Ecommerce operator access.'
                : catalogHydrating
                ? 'Editing unlocks after the local or managed Shop scope is confirmed.'
                : sampleCatalogPreview
                ? 'Replace the example products in Shop. This preview stays available for onboarding.'
                : localFingerprintPending
                ? 'Comparing the saved fingerprint with the current Shop-backed customer view.'
                : draftIssue || managedCatalogDigestError || (catalogRebindRequired
                ? 'Save again to bind this store to the current Shop catalog.'
                : savedDraftIsCurrent && savedDraft
                ? `Saved ${new Date(savedDraft.savedAt).toLocaleString()}`
                : managedIdentity
                  ? 'Save the store name, description, and selected products.'
                  : 'Save the store name, description, and selected products for the next visit.')}</small>
              {draftStorageBlocked
                ? <Link className="text-link" to="/settings/#controls">Open recovery settings</Link>
                : null}
            </div>
            {sampleCatalogPreview ? <div className="ecommerce-save-actions">
              <button
                className="core-button primary"
                id="ecommerce-save-storefront"
                onClick={() => navigate('/shop/?tab=inventory')}
                ref={storefrontSaveRef}
                type="button"
              >
                Replace sample products
              </button>
            </div> : !savedDraftIsCurrent ? <div className="ecommerce-save-actions">
              {hasUnsavedFieldChanges ? <button className="core-button secondary" disabled={portalViewOnly || catalogHydrating || draftBusy} onClick={discardStorefrontChanges} type="button">Discard</button> : null}
              <button
                className="core-button primary"
                disabled={!canSaveStorefront}
                id="ecommerce-save-storefront"
                onClick={() => void saveCurrentStorefront()}
                ref={storefrontSaveRef}
                type="button"
              >
                {draftBusy ? 'Saving…' : localFingerprintUpgradeRequired ? 'Upgrade store' : catalogRebindRequired ? 'Reconnect store' : 'Save store'}
              </button>
            </div> : null}
          </div>
          <p className="ecommerce-save-notice" aria-live="polite">{draftNotice}</p>
        </section>

        <section className="core-panel ecommerce-preview-panel" aria-labelledby="ecommerce-preview-title" id="ecommerce-preview-panel">
          <div className="panel-head ecommerce-preview-head">
            <div><h2 id="ecommerce-preview-title" ref={storefrontPreviewHeadingRef} tabIndex={-1}>{workspaceView === 'setup' ? 'Customer view' : 'Your store'}</h2>{workspaceView === 'setup' ? <p>Updates as you edit. Save to keep your changes.</p> : null}</div>
          </div>

          {workspaceView !== 'setup' && !buyingReady && !catalogHydrating ? (
            <div className="ecommerce-preview-gate">
              <span>
                <strong>{sampleCatalogPreview ? 'Sample storefront is preview-only' : 'Store not saved'}</strong>
                <small>{sampleCatalogPreview
                  ? 'Example products cannot accept customer requests. Replace them in Shop, then review and save the customer view.'
                  : canSaveStorefront
                    ? 'These products and prices come from Shop. Save this store to accept customer requests.'
                    : 'Review the product selection and prices before saving your store.'}</small>
              </span>
              <div className="ecommerce-preview-gate-actions">
                {canSaveStorefront ? <button className="core-button primary" onClick={() => void saveCurrentStorefront()} type="button">Save store</button> : null}
                <button
                  aria-controls={sampleCatalogPreview ? undefined : 'ecommerce-setup-panel'}
                  className={`core-button ${canSaveStorefront ? 'secondary' : 'primary'}`}
                  onClick={sampleCatalogPreview ? () => navigate('/shop/?tab=inventory') : finishStorefrontSetup}
                  type="button"
                >
                  {sampleCatalogPreview ? 'Replace sample products' : 'Edit store'}
                </button>
              </div>
            </div>
          ) : null}
          {draftNotice ? <p className="ecommerce-save-notice" role="status">{draftNotice}</p> : null}

          <div className={`ecommerce-preview-frame is-${device}`}>
            {previewResult.preview ? (
              <div className="storefront-preview">
                <header>
                  <span>{previewResult.preview.storeName}</span>
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
                      className={available && buyingReady && cartSessionReady ? 'has-request-action' : undefined}
                      data-featured={item.merchandising?.featured ? 'true' : 'false'}
                      data-requested={buyingCart.some((line) => line.sku === item.sku) ? 'true' : 'false'}
                      key={item.sku}
                    >
                      <ProductPhoto className="storefront-product-art storefront-product-photo" fallback={<StorefrontProductArtwork />} scope={productImageScope} sku={item.sku} />
                      <small>{item.merchandising ? `${item.merchandising.featured ? 'Featured · ' : ''}${item.merchandising.collection}` : item.variant || item.sku}</small>
                      <strong>{displayName}</strong>
                      <span>{formatMmk(item.unitPriceMmk)}</span>
                      <b>{available ? 'Available' : 'Sold out'}</b>
                      {workspaceView !== 'setup' && available && buyingReady && cartSessionReady ? (
                        <button
                          aria-controls="ecommerce-buying-workspace"
                          aria-label={`${buyingCart.some((line) => line.sku === item.sku) ? 'View' : 'Add'} ${displayName} ${buyingCart.some((line) => line.sku === item.sku) ? 'in cart' : 'to cart'}`}
                          className="storefront-request-button"
                          disabled={portalViewOnly || catalogHydrating}
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
                <strong>Store needs attention</strong>
                <p>{previewResult.error}</p>
              </div>
            )}
          </div>

          {workspaceView !== 'setup' && buyingReady && cartSessionReady && previewResult.preview && digest && activeCommerceState ? (
            <EcommerceBuyingWorkspace
              key={cartScope}
              cart={buyingCart}
              commerceState={activeCommerceState}
              currentCatalog={catalog.items}
              disabled={catalogHydrating}
              onCartChange={setBuyingCart}
              recoverSessionCart={recoverSessionCart}
              onContinueInShop={() => navigate('/shop/?tab=orders')}
              onDraft={openShopDraft}
              onOpenManagedRequest={managedIdentity ? (requestId) => navigate(`/shop/?tab=orders&source=ecommerce-inbox&request=${encodeURIComponent(requestId)}`) : undefined}
              onOpenCancellation={(intent: EcommerceCancellationIntent) => navigate(ecommerceShopIntentPath('cancellation', intent.id))}
              onOpenCorrection={(intent) => navigate(ecommerceShopIntentPath('correction', intent.id))}
              onOpenAmendment={(intent: EcommerceOrderAmendmentIntent) => navigate(ecommerceShopIntentPath('amendment', intent.id))}
              onOpenReschedule={(intent: EcommerceOrderRescheduleIntent) => navigate(ecommerceShopIntentPath('reschedule', intent.id))}
              onOpenReturns={(intent: EcommerceReturnIntent) => navigate(ecommerceShopIntentPath('return', intent.id))}
              onOpenSupport={(intent: EcommerceSupportIntent) => navigate(ecommerceShopIntentPath('support', intent.id))}
              onRecordManagedRequest={managedIdentity && managedCanWrite ? recordManagedBuyingRequest : undefined}
              onRequestStateChange={setCustomerRequestState}
              trackingRequest={trackingRequest}
              onDeliveryConfirmationChange={setCustomerRequestDeliveryConfirmed}
              preview={previewResult.preview}
              scope={buyingScope}
              sourcePreviewDigest={digest}
              sourceStorefront={sourceStorefront
                ? { revision: sourceStorefront.revision, actionId: sourceStorefront.saved.actionId }
                : null}
            />
          ) : null}

        </section>
      </div> : null}
    </div>
  )
}
