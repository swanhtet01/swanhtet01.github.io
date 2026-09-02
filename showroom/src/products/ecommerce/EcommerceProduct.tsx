import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

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
type RequestInboxFilter = 'all' | 'stock' | 'expiring' | 'payment' | 'delivery'
type ReplyChannelTemplate = 'viber' | 'line' | 'wechat' | 'email'
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

// The owner named their business during onboarding. Opening their storefront under a sample
// shop's name is the same "nothing you did was remembered" signal the website starter had.
//
// Only used where there is no saved draft -- a saved storeName is always the owner's own and
// is never overridden. The managed-identity branch keeps the sample default deliberately,
// because a signed-in company's store name comes from its managed record, not this device.
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

export function EcommerceProduct() {
  const navigate = useNavigate()
  const location = useLocation()
  const [initialState] = useState(initialEcommerceState)
  const [catalog, setCatalog] = useState<EcommerceCatalog>(initialState.catalog)
  const [localCommerceState, setLocalCommerceState] = useState<CommerceState>(initialState.commerceState)
  const [catalogHydrating, setCatalogHydrating] = useState(true)
  const [managedIdentity, setManagedIdentity] = useState<ManagedIdentity | null>(null)
  const [managedCanWrite, setManagedCanWrite] = useState(false)
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
  const [device, setDevice] = useState<PreviewDevice>(() => window.matchMedia('(max-width: 760px)').matches ? 'phone' : 'desktop')
  const [workspaceView, setWorkspaceView] = useState<'setup' | 'preview'>('preview')
  const [digestState, setDigestState] = useState({ previewJson: '', value: '', error: '' })
  const [managedCatalogDigestState, setManagedCatalogDigestState] = useState({
    source: '',
    value: '',
    error: '',
  })
  const [buyingCart, setBuyingCart] = useState<EcommerceCartLine[]>([])
  const [customerRequestState, setCustomerRequestState] = useState<'idle' | 'waiting_shop_review' | 'confirmed'>('idle')
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
        setManagedCanWrite(managedBootstrapHasCapability(bootstrap, identity, 'commerce.write'))
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
        setManagedCanWrite(false)
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
  const storefrontSetupRequired = Boolean(managedIdentity) && !savedDraftIsCurrent
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
    const csv = buildSampleOrderImportCsv()
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

  function buildSampleOrderImportCsv() {
    const suggestedSku = selectedSkus.find((sku) => catalog.items.some((item) => item.sku === sku && item.onHand > 0))
      ?? catalog.items.find((item) => item.onHand > 0)?.sku
      ?? 'SKU-001'
    const rows = [
      ['customer_reference', 'channel', 'sku', 'quantity', 'fulfilment', 'payment', 'source_message'],
      ['Daw Mya / 09 xxx xxx xxx / Bahan', 'Viber', suggestedSku, 1, 'delivery', 'manual_review', 'Paste original customer message here'],
      ['Walk-in customer', 'Shop form', suggestedSku, 1, 'pickup', 'cash_on_pickup', 'Owner-entered sample row'],
    ]
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  }

  function loadSampleOrderImportBatch() {
    const csv = buildSampleOrderImportCsv()
    const review = buildOrderImportReview(csv)
    setOrderImportText(csv)
    setOrderImportReview(review)
    setOrderImportSourceName('sample-order-batch.csv')
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: 'Load sample Ecommerce order batch',
    })
    const notice = 'Sample Ecommerce order batch loaded and reviewed locally. No order import, customer message, payment, delivery booking, stock move, refund, or Shop write ran.'
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
    if (!orderImportReview) return
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

  function showWorkspace(view: 'setup' | 'preview') {
    setWorkspaceView(view)
    requestAnimationFrame(() => {
      document.getElementById(`ecommerce-${view}-panel`)?.scrollIntoView({ block: 'start' })
    })
  }

  function finishStorefrontSetup() {
    showWorkspace('setup')
    requestAnimationFrame(() => {
      storefrontSaveRef.current?.scrollIntoView({ block: 'center' })
      storefrontSaveRef.current?.focus({ preventScroll: true })
    })
  }

  function showSavedStorefrontPreview() {
    showWorkspace('preview')
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
    if (!writeAllowed) throw new Error('View only — ask a company owner to assign Ecommerce operator access.')
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
    setCatalog({ source: 'managed-shop', items: accepted.items, error: '' })
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

  function addToCart(sku: string) {
    if (catalogHydrating || !previewResult.preview || !digest || (Boolean(managedIdentity) && !savedDraftIsCurrent)) return
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
  }

  function prepareQuoteRecovery() {
    if (pendingManagedRequests[0]) {
      navigate(`/shop/?tab=orders&source=ecommerce&request=${encodeURIComponent(pendingManagedRequests[0].id)}`)
      return
    }
    if (!buyingReady || !customerPreviewItems.length) {
      finishStorefrontSetup()
      return
    }
    addToCart(customerPreviewItems[0].sku)
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

  function focusCurrentRequestReceipt() {
    const receipt = document.querySelector<HTMLElement>('.ecommerce-quote-receipt[data-current="true"]')
    if (!receipt) {
      prepareQuoteRecovery()
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
    const reason = requestHasStockRisk(customerFollowUpRequest)
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

  function openFilteredRequestInShop() {
    if (!requestInboxNextRequest) return
    navigate(`/shop/?tab=orders&source=ecommerce&request=${encodeURIComponent(requestInboxNextRequest.id)}`)
  }

  async function recordManagedBuyingRequest(request: EcommerceOrderRequestV2) {
    const identity = managedIdentity
    if (!managedCanWrite) throw new Error('View only — ask a company owner to assign Ecommerce operator access.')
    if (!identity || !globalThis.crypto?.randomUUID) throw new Error('Managed Ecommerce request identity is unavailable. Nothing was sent to Shop.')
    const currentIdentity = await currentManagedIdentity()
    if (!currentIdentity
      || currentIdentity.workspaceId !== identity.workspaceId
      || currentIdentity.userId !== identity.userId) throw new Error('The company account changed. Reload before sending this request to Shop.')
    const bootstrap = await loadManagedBootstrap(identity)
    const writeAllowed = managedBootstrapHasCapability(bootstrap, identity, 'commerce.write')
    setManagedCanWrite(writeAllowed)
    if (!writeAllowed) throw new Error('View only — ask a company owner to assign Ecommerce operator access.')
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
        || typeof result.idempotent_replay !== 'boolean') throw new Error('The company account returned an unrelated Ecommerce receipt.')
      const accepted = validateCommerceState(result.state)
      if (!exactRequestIsRetained(accepted)) throw new Error('The company account returned a different Ecommerce request.')
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
      ? 'Company Shop - connected'
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
  const orderOpsNow = Date.now()
  const orderOpsAgingCount = pendingManagedRequests.filter((request) => Date.parse(request.createdAt) <= orderOpsNow - 30 * 60 * 1000).length
  const orderOpsExpiringCount = pendingManagedRequests.filter((request) => {
    const minutes = minutesUntil('quote' in request ? request.quote.expiresAt : undefined, orderOpsNow)
    return minutes !== null && minutes <= 15
  }).length
  const orderOpsStockRiskCount = pendingManagedRequests.filter((request) => commerceStorefrontRequestLines(request).some((line) => {
    const item = catalog.items.find((candidate) => candidate.sku === line.sku)
    return !item || item.onHand < line.quantity
  })).length
  const orderOpsPaymentRiskCount = pendingManagedRequests.filter((request) => 'quote' in request && request.quote.payment.adapter === 'kbzpay_manual').length
  const deliveryReviewCount = pendingManagedRequests.filter((request) => request.fulfilment === 'delivery').length
  const pickupReviewCount = pendingManagedRequests.filter((request) => request.fulfilment === 'pickup').length
  const controlPaymentsVisible = buyingReady || pendingManagedRequests.length > 0
  const paymentDeliveryStage = importNeeded
    ? 'Import catalog before checkout'
    : !savedDraftIsCurrent
      ? 'Save store before checkout'
      : pendingManagedRequests.length
        ? 'Review payment and delivery'
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
            : pendingManagedRequests.length
              ? 'Review next request'
              : ecommerceActiveOrderCount
                ? 'Continue fulfilment'
                : importNeeded
                  ? 'Import sellable catalog'
                  : savedDraftIsCurrent
                    ? 'Ready for customer orders'
                    : 'Save store'
  const orderOpsRows = [
    ['Review', pendingManagedRequests.length ? `${pendingManagedRequests.length} waiting` : 'Clear'],
    ['Fulfil', ecommerceActiveOrderCount ? `${ecommerceActiveOrderCount} active` : 'Clear'],
    ['Payment', ecommercePaymentAttentionCount ? `${ecommercePaymentAttentionCount} blocking` : 'Clear'],
    ['Refund', ecommerceRefundAttentionCount ? `${ecommerceRefundAttentionCount} due` : 'Clear'],
    ['Done', `${ecommerceCompletedOrderCount} completed · ${ecommerceCancelledOrderCount} cancelled`],
    ['Returns', ecommerceReturnedUnits ? `${ecommerceReturnedUnits} units recorded` : 'None'],
  ] as const
  const orderImportStage = importNeeded
    ? 'Upload catalog first'
    : pendingManagedRequests.length
      ? 'Review imported orders'
      : buyingReady
        ? 'Ready for order upload'
        : 'Save store first'
  const orderImportRows = [
    ['Input', catalog.source === 'managed-shop' ? 'Managed catalog' : catalog.source === 'shop-local' ? 'Local catalog' : 'Sample/import'],
    ['Bulk', importNeeded ? 'Need products' : 'CSV or messages'],
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
        ['Step 1', 'Load sample or upload CSV'],
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
    ['Fulfil', pendingManagedRequests.length ? 'Shop queue' : savedDraftIsCurrent ? 'Pickup/delivery ready' : 'Setup first'],
    ['Return', 'Shop accountable'],
  ] as const
  const paymentDeliveryRows = [
    ['Payment', orderOpsPaymentRiskCount ? `${orderOpsPaymentRiskCount} manual QR` : controlPaymentsVisible ? 'Not authorized' : 'Locked'],
    ['Delivery', deliveryReviewCount ? `${deliveryReviewCount} review` : savedDraftIsCurrent ? 'Owner priced' : 'Locked'],
    ['Pickup', pickupReviewCount ? `${pickupReviewCount} review` : savedDraftIsCurrent ? 'Allowed' : 'Locked'],
    ['Expiry', orderOpsExpiringCount ? `${orderOpsExpiringCount} quote` : buyingReady ? '30 min quote' : 'No quote'],
    ['Control', pendingManagedRequests.length ? 'Shop confirms' : 'No customer send'],
  ] as const
  const requestHasStockRisk = (request: typeof pendingManagedRequests[number]) => commerceStorefrontRequestLines(request).some((line) => {
    const item = catalog.items.find((candidate) => candidate.sku === line.sku)
    return !item || item.onHand < line.quantity
  })
  const requestIsExpiring = (request: typeof pendingManagedRequests[number]) => {
    const minutes = minutesUntil('quote' in request ? request.quote.expiresAt : undefined, orderOpsNow)
    return minutes !== null && minutes <= 15
  }
  const requestNeedsPaymentReview = (request: typeof pendingManagedRequests[number]) => 'quote' in request && request.quote.payment.adapter === 'kbzpay_manual'
  const requestInboxFilteredRequests = pendingManagedRequests.filter((request) => (
    requestInboxFilter === 'all'
      || (requestInboxFilter === 'stock' && requestHasStockRisk(request))
      || (requestInboxFilter === 'expiring' && requestIsExpiring(request))
      || (requestInboxFilter === 'payment' && requestNeedsPaymentReview(request))
      || (requestInboxFilter === 'delivery' && request.fulfilment === 'delivery')
  ))
  const requestInboxNextRequest = requestInboxFilteredRequests[0] ?? null
  const requestInboxStage = importNeeded
    ? 'Import catalog before request review'
    : !savedDraftIsCurrent
      ? 'Save store before order review'
      : requestInboxFilteredRequests.length
        ? 'Open filtered Shop review'
        : pendingManagedRequests.length
          ? 'Switch filter to find requests'
          : buyingReady
            ? 'Inbox ready for requests'
            : 'Request inbox locked'
  const requestInboxRows = [
    ['All', `${pendingManagedRequests.length}`],
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
    : pendingManagedRequests.length
      ? 'No request matches this filter.'
      : 'No customer request is waiting.'
  const quoteRecoveryStage = importNeeded
    ? 'Import catalog before recovery'
    : !savedDraftIsCurrent
      ? 'Save store before recovery'
      : orderOpsExpiringCount
        ? 'Prepare quote refresh'
        : orderOpsAgingCount
          ? 'Recover aged request'
          : pendingManagedRequests.length
            ? 'Open Shop recovery'
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
    : !savedDraftIsCurrent
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
    : !savedDraftIsCurrent
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
    : !savedDraftIsCurrent
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
    ['Fulfilment', deliveryReviewCount ? `${deliveryReviewCount} delivery` : pickupReviewCount ? `${pickupReviewCount} pickup` : savedDraftIsCurrent ? 'Pickup/delivery' : 'Locked'],
    ['Reply', customerFollowUpRequest ? 'Draftable' : buyingReady ? 'Template ready' : 'Locked'],
    ['Shop review', pendingManagedRequests.length ? 'Review queue' : orderImportReview?.status === 'ready' ? 'Packet ready' : buyingReady ? 'Quote only' : 'Save store first'],
    ['Safety', 'Review first'],
  ] as const
  const deliveryReviewRequest = pendingManagedRequests.find((request) => request.fulfilment === 'delivery')
    ?? null
  const deliveryZoneHint = deliveryReviewRequest ? deliveryAreaFromCustomerReference(deliveryReviewRequest.customerReference) : ''
  const deliveryAreaTemplateStage = importNeeded
    ? 'Import catalog before delivery templates'
    : !savedDraftIsCurrent
      ? 'Save store before delivery templates'
      : deliveryReviewRequest
        ? 'Prepare delivery-area template'
        : buyingReady
          ? 'Template ready when requests arrive'
          : 'Delivery templates locked'
  const deliveryAreaTemplateRows = [
    ['Area', deliveryZoneHint || 'No request yet'],
    ['Rule', deliveryReviewRequest ? 'Fee review' : savedDraftIsCurrent ? 'Template shell' : 'Locked'],
    ['Rider', deliveryReviewRequest ? 'Review' : 'Not assigned'],
    ['Payment', deliveryReviewRequest && 'quote' in deliveryReviewRequest ? deliveryReviewRequest.quote.payment.adapter === 'kbzpay_manual' ? 'Manual QR' : 'COD review' : 'No charge'],
    ['Reuse', deliveryReviewRequest ? 'After review' : 'Needs order'],
  ] as const
  const deliveryFeeStage = importNeeded
    ? 'Import catalog before delivery setup'
    : !savedDraftIsCurrent
      ? 'Save store before delivery setup'
      : deliveryReviewCount
        ? 'Review delivery zone and fee'
        : buyingReady
          ? 'Delivery template ready'
          : 'Delivery setup locked'
  const deliveryFeeRows = [
    ['Zone', deliveryZoneHint || (deliveryReviewCount ? 'Review area' : 'No request yet')],
    ['Fee', deliveryReviewCount ? 'Shop confirms' : savedDraftIsCurrent ? 'Template only' : 'Locked'],
    ['Rider', deliveryReviewCount ? 'Assign in Shop' : 'Not booked'],
    ['Payment', deliveryReviewRequest && 'quote' in deliveryReviewRequest ? deliveryReviewRequest.quote.payment.adapter === 'kbzpay_manual' ? 'Manual QR' : 'COD' : 'Not charged'],
    ['Boundary', 'No booking'],
  ] as const
  const requestWaitingInLocalMode = customerRequestState === 'waiting_shop_review' && !managedIdentity
  const requestWaitingQueueLabel = requestWaitingInLocalMode ? 'Saved locally' : 'Request sent'
  const ecommerceWaitingHeadline = requestWaitingInLocalMode ? 'Sample request saved locally' : 'Request sent to Shop'
  const ecommerceWaitingSummary = requestWaitingInLocalMode
    ? 'The sample customer request is saved on this device for Shop review. No Shop inbox write, charge, stock, delivery, or customer message happened.'
    : 'No charge or stock change happens until Shop confirms the order.'
  const ecommerceWaitingMetric = requestWaitingInLocalMode ? 'Local receipt' : 'Review waiting'
  const waitingShopReviewReason = requestWaitingInLocalMode
    ? 'The customer request is retained only in browser-local recovery until the operator opens the Shop review draft.'
    : 'The customer request is retained in the Company Shop inbox for operator review.'
  const waitingShopReviewGate = requestWaitingInLocalMode
    ? 'Open the local Shop review draft before claiming Shop has received the request.'
    : 'The Shop operator confirms stock, promise, payment, and delivery.'
  const orderingReadinessStage = importNeeded
    ? 'Import Shop catalog'
    : !selectedSkus.length
      ? 'Choose sellable products'
      : !previewResult.preview
        ? 'Repair storefront preview'
        : !savedDraftIsCurrent
          ? 'Save store'
          : pendingManagedRequests.length
            ? 'Clear Shop review queue'
            : buyingReady
              ? 'Ready for reviewed orders'
              : 'Check ordering controls'
  const orderingReadinessRows = [
    ['Catalog', importNeeded ? 'Needed' : `${catalog.items.length} items`],
    ['Storefront', previewResult.preview ? savedDraftIsCurrent ? 'Saved' : 'Draft ready' : 'Blocked'],
    ['Checkout', buyingReady ? 'Quote ready' : 'Locked'],
    ['Queue', pendingManagedRequests.length ? `${pendingManagedRequests.length} Shop review` : 'Clear'],
    ['Safety', managedIdentity ? 'Account review' : 'Sample only'],
  ] as const
  const managedStoreActivationStage = importNeeded
    ? 'Import catalog for go-live'
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
    ['Store', savedDraftIsCurrent ? 'Saved check' : 'Save required'],
    ['Checkout', buyingReady ? 'Quote controlled' : 'Locked'],
    ['Payments', orderOpsPaymentRiskCount ? `${orderOpsPaymentRiskCount} manual QR` : 'Review only'],
    ['Delivery', deliveryReviewCount ? `${deliveryReviewCount} review` : savedDraftIsCurrent ? 'Template ready' : 'Locked'],
    ['Shop review', pendingManagedRequests.length ? `${pendingManagedRequests.length} to review` : 'No queue'],
    ['Go-live', managedIdentity ? 'Account controls' : 'Download file'],
  ] as const
  function downloadManagedStoreActivationPacket() {
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
  const aiDeskRows = [
    ['Import', importNeeded ? 'Needed' : `${catalog.items.length} items`],
    ['Merchandise', selectedSkus.length ? `${selectedSkus.length} selected` : 'Pick products'],
    ['Checkout', buyingReady ? 'Quote ready' : 'Save first'],
    ['Shop review', pendingManagedRequests.length ? `${pendingManagedRequests.length} waiting` : customerRequestState === 'waiting_shop_review' ? requestWaitingQueueLabel : 'No queue'],
  ] as const
  const aiAgentJob = pendingManagedRequests.length
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
            : 'Start sample order'
  const aiAgentReason = pendingManagedRequests.length
    ? `${pendingManagedRequests.length} request${pendingManagedRequests.length === 1 ? '' : 's'} waiting for accountable Shop review.`
    : customerRequestState === 'waiting_shop_review'
      ? waitingShopReviewReason
    : ecommerceActiveOrderCount
      ? `${ecommerceActiveOrderCount} Ecommerce order${ecommerceActiveOrderCount === 1 ? '' : 's'} now use the Shop-owned fulfilment record.`
    : importNeeded
      ? 'The order desk needs a real Shop catalog before the store can sell.'
      : storefrontSetupRequired
        ? 'Save the customer view before quotes and order review are trusted.'
        : buyingCart.length
          ? `${buyingCart.length} cart line${buyingCart.length === 1 ? '' : 's'} ready for quote review.`
          : managedIdentity
            ? 'The store is saved and ready for a customer request.'
            : 'The sample store is ready for one customer-order walkthrough.'
  const aiOwnerGate = pendingManagedRequests.length
    ? 'Shop confirms stock, delivery, payment, and customer contact.'
    : customerRequestState === 'waiting_shop_review'
      ? waitingShopReviewGate
    : ecommerceActiveOrderCount
      ? 'Shop remains authoritative for fulfilment, payment, cancellation, and returns.'
    : importNeeded
      ? 'Review the imported catalog before going live.'
      : storefrontSetupRequired
        ? 'Save the exact customer view first.'
      : buyingCart.length
          ? 'Review the quote before sending to Shop.'
          : 'Payment and customer messages stay locked.'
  const aiAgentQueueRows = [
    ['Next step', aiAgentJob],
    ['Why', aiAgentReason],
    ['Review', aiOwnerGate],
  ] as const
  const orderAutopilotStage = importNeeded
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
  const ecommerceTodayState = importNeeded || storefrontSetupRequired
    ? 'setup'
    : ecommerceRefundAttentionCount || ecommercePaymentAttentionCount || orderOpsStockRiskCount || pendingManagedRequests.length || customerRequestState === 'waiting_shop_review'
      ? 'attention'
      : 'ready'
  const ecommerceTodayHeadline = importNeeded
    ? 'Connect your products to start selling'
    : storefrontSetupRequired
      ? 'Finish the store customers will see'
      : ecommerceRefundAttentionCount
        ? `${ecommerceRefundAttentionCount} refund${ecommerceRefundAttentionCount === 1 ? '' : 's'} need evidence`
        : ecommercePaymentAttentionCount
          ? `${ecommercePaymentAttentionCount} payment${ecommercePaymentAttentionCount === 1 ? '' : 's'} need confirmation`
          : pendingManagedRequests.length
            ? `${pendingManagedRequests.length} order request${pendingManagedRequests.length === 1 ? '' : 's'} need review`
            : customerRequestState === 'waiting_shop_review'
              ? ecommerceWaitingHeadline
            : ecommerceActiveOrderCount
              ? `${ecommerceActiveOrderCount} order${ecommerceActiveOrderCount === 1 ? '' : 's'} in progress`
              : ecommerceTodayCartUnits
                ? `${ecommerceTodayCartUnits} item${ecommerceTodayCartUnits === 1 ? '' : 's'} ready for checkout`
                : managedIdentity
                  ? 'Your store is ready for the next order'
                  : 'Try one customer order'
  const ecommerceTodaySummary = importNeeded
    ? 'Import one Shop catalog. Products, stock, prices, checkout, and order review will use that source.'
    : storefrontSetupRequired
      ? 'Review the customer view once, then save the exact products, prices, and page customers will see.'
      : pendingManagedRequests.length
        ? 'Shop keeps the accountable order record. Review stock, payment, and delivery before customer contact.'
        : customerRequestState === 'waiting_shop_review'
          ? ecommerceWaitingSummary
        : ecommerceActiveOrderCount
          ? 'Shop owns fulfilment for this order. The storefront stays ready for the next customer.'
          : managedIdentity
            ? 'Customers can browse and build a cart. Shop remains in control of payment, stock, delivery, and returns.'
            : 'Add one sample item and review pickup, delivery, and payment choices. Nothing reaches Shop until confirmation.'
  const ecommerceTodayAction = importNeeded
    ? 'Connect products'
    : storefrontSetupRequired
      ? 'Finish store'
      : orderImportReview?.status === 'ready'
        ? 'Download order packet'
        : orderImportReview?.status === 'blocked'
          ? 'Fix order import'
          : pendingManagedRequests.length
            ? 'Review orders in Shop'
            : customerRequestState === 'waiting_shop_review'
              ? 'View request receipt'
            : ecommerceActiveOrderCount
              ? 'Open Shop'
            : ecommerceTodayCartUnits
              ? 'Review checkout'
              : managedIdentity
                ? 'Prepare next order'
                : 'Start sample order'
  const ecommerceTodayMetrics = [
    ['1. Store', savedDraftIsCurrent ? 'Ready' : catalogHydrating ? 'Checking' : storefrontSetupRequired ? 'Needs setup' : 'Sample ready'],
    ['2. Cart', ecommerceActiveOrderCount && ecommerceTodayCartUnits ? 'Confirmed' : ecommerceTodayCartUnits ? `${ecommerceTodayCartUnits} item${ecommerceTodayCartUnits === 1 ? '' : 's'}` : buyingReady ? 'Ready' : 'Locked'],
    ['3. Shop', pendingManagedRequests.length
      ? `${pendingManagedRequests.length} to review`
      : customerRequestState === 'waiting_shop_review'
        ? ecommerceWaitingMetric
      : ecommerceActiveOrderCount
        ? `${ecommerceActiveOrderCount} in progress`
        : ecommerceCompletedOrderCount
          ? `${ecommerceCompletedOrderCount} completed`
          : 'No order yet'],
  ] as const
  const ecommerceTodayGuided = importNeeded || storefrontSetupRequired
  function runOrderAutopilot() {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: `Order autopilot: ${orderAutopilotStage}`,
    })
    if (importNeeded) {
      navigate('/settings/?product=ecommerce')
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
    if (pendingManagedRequests.length) {
      navigate('/shop/?tab=orders&source=ecommerce')
      return
    }
    if (customerRequestState === 'waiting_shop_review') {
      focusCurrentRequestReceipt()
      return
    }
    if (ecommerceActiveOrderCount) {
      navigate('/shop/?tab=orders')
      return
    }
    // With items already in the cart the button reads "Review checkout", but every branch
    // above missed and it fell through to prepareQuoteRecovery — which adds the first
    // preview item to the cart. If that item was already in there (the normal case, since
    // it is what put the cart in this state) nothing changed at all, so the primary action
    // did nothing in exactly the situation it advertises. Open the checkout instead.
    if (ecommerceTodayCartUnits && openBuyingWorkspace()) return
    prepareQuoteRecovery()
  }

  useEffect(() => {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_seen',
      product: 'ecommerce',
      route: location.pathname + location.search,
      detail: aiAgentJob,
    })
  }, [aiAgentJob, location.pathname, location.search])

  return (
    <div className="workspace-screen ecommerce-product">
      <header className="ecommerce-heading">
        <div>
          <span className="core-eyebrow">{managedIdentity ? 'Company store' : 'Sample store'}</span>
          <h1>Ecommerce</h1>
          <p>Sell online with products, cart, orders, delivery, and returns.</p>
        </div>
      </header>

      <section aria-labelledby="ecommerce-today-title" className="ecommerce-today" data-density={ecommerceTodayGuided ? 'guided' : 'compact'} data-state={ecommerceTodayState}>
        <div className="ecommerce-today-priority">
          <span className="core-eyebrow">Start here</span>
          <h2 id="ecommerce-today-title">{ecommerceTodayHeadline}</h2>
          <p>{ecommerceTodaySummary}</p>
          <button className="core-button primary" disabled={catalogHydrating} onClick={runOrderAutopilot} type="button">{ecommerceTodayAction}</button>
        </div>
        {ecommerceTodayGuided ? (
          <div aria-label="Ecommerce today status" className="ecommerce-today-metrics" role="group">
            {ecommerceTodayMetrics.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
          </div>
        ) : null}
        <div className="ecommerce-today-source" role="status">
          <span>{sourceLabel}</span>
          <small>Stock, payment, delivery, and the final order stay in Shop.</small>
        </div>
      </section>

      <details className="ecommerce-business-controls">
        <summary><span><strong>Extra order tools</strong><small>Use only when importing orders, checking delivery, or preparing launch</small></span><b>Extra</b></summary>
        <div className="ecommerce-business-controls-content">
      <section aria-label="Order workspace" className="ecommerce-ai-desk">
        <div>
          <span className="core-eyebrow">Order workspace</span>
          <h2>{pendingManagedRequests.length ? 'Shop review is waiting' : importNeeded ? 'Import first, then sell' : storefrontSetupRequired ? 'Save store before orders' : managedIdentity ? 'Ready to take reviewed orders' : 'Try the sample order flow'}</h2>
          <p>{pendingManagedRequests.length
            ? 'Requests are retained for Shop confirmation before stock, delivery, payment, or customer contact changes.'
            : importNeeded
              ? 'Upload or connect the Shop catalog once. The customer view, quote, and order review use that source.'
              : storefrontSetupRequired
                ? 'Save the customer view so the quote, cart, and Shop review all use the same products and prices.'
                : managedIdentity
                  ? 'Customers can build a cart; Shop still confirms the accountable order before anything consequential happens.'
                  : 'Use the sample cart to review the customer path. Nothing reaches Shop until confirmation.'}</p>
        </div>
        <div className="ecommerce-ai-desk-queue">
          {aiDeskRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        <div className="ecommerce-ai-agent-queue" aria-label="Ecommerce next step" role="group">
          {aiAgentQueueRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        <button className="core-button primary compact" disabled={catalogHydrating} onClick={runOrderAutopilot} type="button">Open next step</button>
      </section>

      <section aria-label="Import customer orders" className="ecommerce-ops-cockpit ecommerce-order-import-cockpit">
        <div>
          <span className="core-eyebrow">Import customer orders</span>
          <h2>{orderImportStage}</h2>
          <p>Check CSV, Viber, LINE, WeChat, email, and form orders against the saved Shop catalog so Shop gets one clean order list. Nothing is sent, charged, delivered, refunded, or saved to Shop until a manager reviews it.</p>
          <div className="ecommerce-inline-actions">
            <Link className="text-link" to="/settings/?product=ecommerce">Open import setup</Link>
            <button className="text-link" onClick={downloadOrderImportTemplate} type="button">Download order template</button>
            <button className="text-link" onClick={loadSampleOrderImportBatch} type="button">Load sample order batch</button>
          </div>
          <details className="ecommerce-order-import-workspace" open={orderImportText || orderImportReview ? true : undefined}>
            <summary><span>Review an order batch</span><small>Upload CSV or paste channel orders only when needed.</small></summary>
            <div aria-label="Order batch review workspace" className="ecommerce-order-import-workspace-body">
              <div aria-label="Order intake guide" className="ecommerce-order-intake-guide">
                {orderIntakeGuideRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
              </div>
              <div aria-label="Order repair checklist" className="ecommerce-order-repair-checklist">
                {orderRepairRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
              </div>
              <label className="ecommerce-order-import-upload">Upload order CSV<input accept=".csv,text/csv,text/plain" onChange={uploadOrderImportCsv} type="file" /></label>
              <label className="ecommerce-order-import-field">Order batch CSV<textarea onChange={(event) => {
                setOrderImportText(event.target.value)
                setOrderImportReview(null)
                setOrderImportSourceName('')
              }} placeholder="Paste customer_reference, channel, sku, quantity, fulfilment, payment, source_message rows" value={orderImportText} /></label>
              <button className="text-link" disabled={!orderImportText.trim()} onClick={reviewOrderImportBatch} type="button">Review order batch</button>
              {orderImportReview ? <div className={`ecommerce-order-import-review ${orderImportReview.status}`} role="status"><strong>{orderImportReview.status === 'ready' ? 'Ready for review' : 'Repair before Shop review'}</strong><span>{orderImportReview.summary}</span><small>{orderImportReview.readyRows} ready · {orderImportReview.blockedRows} blocked · review first</small><button className="text-link" onClick={downloadOrderImportReviewPacket} type="button">Download review packet</button></div> : null}
              {orderImportSourceName ? <p className="ecommerce-order-import-source">Local file: {orderImportSourceName}</p> : null}
              {orderImportNotice ? <p className="ecommerce-order-import-notice" role="status">{orderImportNotice}</p> : null}
            </div>
          </details>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {orderImportRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <details aria-label="More order tools" className="ecommerce-enterprise-controls">
        <summary><span>More order tools</span><small>Inbox, payment, delivery, recovery, replies, and launch checks.</small></summary>
        <div className="ecommerce-enterprise-controls-body">
      <section aria-label="Ecommerce request inbox" className="ecommerce-ops-cockpit ecommerce-request-inbox-cockpit">
        <div>
          <span className="core-eyebrow">Request inbox</span>
          <h2>{requestInboxStage}</h2>
          <p>Filter customer requests by stock risk, quote expiry, QR payment review, and delivery mode so the manager opens the right Shop order first. Nothing is sent, charged, delivered, refunded, or saved to Shop from this screen.</p>
          <div className="ecommerce-request-filter" role="group" aria-label="Request inbox filter">
            {requestInboxFilterButtons.map(([value, label]) => <button aria-pressed={requestInboxFilter === value} key={value} onClick={() => setRequestInboxFilter(value)} type="button">{label}</button>)}
          </div>
          <button className="text-link" disabled={!requestInboxNextRequest} onClick={openFilteredRequestInShop} type="button">Open filtered request</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {requestInboxRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        <p className="ecommerce-request-inbox-summary" role="status">{requestInboxNextSummary}</p>
      </section>

      <section aria-label="Order lifecycle queue" className="ecommerce-ops-cockpit">
        <div>
          <span className="core-eyebrow">Order lifecycle</span>
          <h2>{orderOpsPriority}</h2>
          <p>One Shop-owned record now follows each Ecommerce request through review, fulfilment, payment, cancellation, refund, and return. This view reads the lifecycle; Shop confirms every change.</p>
          <button className="text-link" disabled={!managedOrderTimeline.some((entry) => entry.order)} onClick={() => navigate('/shop/?tab=orders')} type="button">Open Shop order queue</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {orderOpsRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <section aria-label="Ordering readiness" className="ecommerce-ops-cockpit">
        <div>
          <span className="core-eyebrow">Ordering readiness</span>
          <h2>{orderingReadinessStage}</h2>
          <p>Check products, prices, quote readiness, Shop review queue, and safety mode before a customer request moves forward. The manager reviews important changes before they are saved.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {orderingReadinessRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <section aria-label="Ecommerce managed store go-live file" className="ecommerce-ops-cockpit ecommerce-managed-activation-cockpit">
        <div>
          <span className="core-eyebrow">Store launch checklist</span>
          <h2>{managedStoreActivationStage}</h2>
          <p>Package products, prices, checkout controls, manual payment review, delivery templates, and Shop review queue for go-live review. No product publish, customer message, payment capture, wallet debit, delivery booking, stock move, refund, Shop write, or go-live action runs from this file.</p>
          <button className="text-link" onClick={downloadManagedStoreActivationPacket} type="button">Download go-live file</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows ecommerce-managed-activation-rows">
          {managedStoreActivationRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <section aria-label="Ecommerce fulfillment review" className="ecommerce-ops-cockpit ecommerce-fulfillment-handoff-cockpit">
        <div>
          <span className="core-eyebrow">Fulfilment review</span>
          <h2>{fulfillmentHandoffStage}</h2>
          <p>Review the exact customer order across source evidence, stock availability, payment review, pickup or delivery, reply draft, and Shop queue ownership. Nothing is sent, charged, booked, refunded, moved, or saved until a manager reviews it.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows ecommerce-fulfillment-handoff-rows">
          {fulfillmentHandoffRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <section aria-label="Order lifecycle control" className="ecommerce-ops-cockpit">
        <div>
          <span className="core-eyebrow">Order lifecycle</span>
          <h2>One path from cart to return</h2>
          <p>Follow capture, pricing, available-to-promise, fulfilment, and returns from the same Shop-controlled source. No charge, message, refund, or stock write starts here.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {lifecycleRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <section aria-label="Payment and delivery controls" className="ecommerce-ops-cockpit ecommerce-payment-delivery-cockpit">
        <div>
          <span className="core-eyebrow">Payment and delivery controls</span>
          <h2>{paymentDeliveryStage}</h2>
          <p>Review pickup, local delivery, manual QR payment, quote expiry, and Shop confirmation from the same checkout request. No card charge, wallet debit, driver booking, customer message, or settlement write runs here.</p>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {paymentDeliveryRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <section aria-label="Delivery fee review controls" className="ecommerce-ops-cockpit ecommerce-delivery-fee-cockpit">
        <div>
          <span className="core-eyebrow">Delivery fee review</span>
          <h2>{deliveryFeeStage}</h2>
          <p>Prepare a local delivery zone, fee, rider assignment, and payment review from the customer request. No rider booking, fee charge, customer message, payment capture, stock move, refund, or Shop write runs here.</p>
          <button className="text-link" disabled={catalogHydrating || (!deliveryReviewRequest && !buyingReady)} onClick={prepareDeliveryFeeReview} type="button">Prepare delivery review</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {deliveryFeeRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        {deliveryReviewDraft ? <p className="ecommerce-delivery-review-draft" role="status">{deliveryReviewDraft}</p> : null}
      </section>

      <section aria-label="Delivery-area template controls" className="ecommerce-ops-cockpit ecommerce-delivery-template-cockpit">
        <div>
          <span className="core-eyebrow">Delivery-area templates</span>
          <h2>{deliveryAreaTemplateStage}</h2>
          <p>Build reusable area, fee, rider, payment, and cut-off templates from repeated delivery requests. No saved template, customer message, rider booking, fee charge, settlement write, stock move, or Shop write runs here.</p>
          <button className="text-link" disabled={catalogHydrating || (!deliveryReviewRequest && !buyingReady)} onClick={prepareDeliveryAreaTemplate} type="button">Prepare area template</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {deliveryAreaTemplateRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        {deliveryAreaTemplateDraft ? <p className="ecommerce-delivery-template-draft" role="status">{deliveryAreaTemplateDraft}</p> : null}
      </section>

      <section aria-label="Quote recovery controls" className="ecommerce-ops-cockpit ecommerce-quote-recovery-cockpit">
        <div>
          <span className="core-eyebrow">Quote recovery</span>
          <h2>{quoteRecoveryStage}</h2>
          <p>Prepare stale quote review, aged request recovery, and a safe cart draft from the same Shop-controlled source. No customer message, discount, payment, delivery, refund, stock, or Shop write runs here.</p>
          <button className="text-link" disabled={catalogHydrating || (!pendingManagedRequests.length && !buyingReady)} onClick={prepareQuoteRecovery} type="button">Prepare quote recovery</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {quoteRecoveryRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </section>

      <section aria-label="Customer follow-up controls" className="ecommerce-ops-cockpit ecommerce-customer-follow-up-cockpit">
        <div>
          <span className="core-eyebrow">Customer follow-up</span>
          <h2>{customerFollowUpStage}</h2>
          <p>Prepare the next reviewed customer update from quote expiry, stock risk, payment state, delivery mode, and Shop review status. No SMS, email, Viber, WhatsApp, discount, payment, delivery, refund, stock, or Shop write runs here.</p>
          <button className="text-link" disabled={catalogHydrating || (!pendingManagedRequests.length && !buyingReady)} onClick={prepareCustomerFollowUpDraft} type="button">Prepare follow-up draft</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {customerFollowUpRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        {customerFollowUpDraft ? <p className="ecommerce-follow-up-draft" role="status">{customerFollowUpDraft}</p> : null}
      </section>

      <section aria-label="Channel reply template controls" className="ecommerce-ops-cockpit ecommerce-channel-reply-cockpit">
        <div>
          <span className="core-eyebrow">Channel reply templates</span>
          <h2>{channelReplyStage}</h2>
          <p>Prepare reviewed Viber, LINE, WeChat, and email reply templates from the same customer request evidence. No message send, clipboard copy, discount, payment, delivery booking, refund, stock move, or Shop write runs here.</p>
          <div className="ecommerce-request-filter" role="group" aria-label="Reply channel template">
            {replyChannelButtons.map(([value, label]) => <button aria-pressed={replyChannelTemplate === value} key={value} onClick={() => setReplyChannelTemplate(value)} type="button">{label}</button>)}
          </div>
          <button className="text-link" disabled={catalogHydrating || (!customerFollowUpRequest && !buyingReady)} onClick={prepareChannelReplyTemplate} type="button">Prepare reply template</button>
        </div>
        <div className="ecommerce-ops-cockpit-rows">
          {channelReplyRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
        {channelReplyDraft ? <p className="ecommerce-channel-reply-draft" role="status">{channelReplyDraft}</p> : null}
      </section>
        </div>
      </details>

      <details className="ecommerce-verification" open={digestError ? true : undefined}>
        <summary>
          <span><strong>Preview verification</strong><small>Local currentness check</small></span>
          <b>{digestError ? 'Attention' : digest ? 'Ready' : 'Checking'}</b>
        </summary>
        <div className="ecommerce-digest" aria-live="polite">
          <span>Preview fingerprint</span>
          <code>{digest || (digestError ? 'Unavailable' : 'Calculating…')}</code>
          <small>{digestError || 'The same store fields and Shop snapshot produce the same local check.'}</small>
        </div>
      </details>
        </div>
      </details>

      <label className="ecommerce-workspace-switch">
        <span>View</span>
        <select aria-controls={workspaceView === 'preview' ? 'ecommerce-preview-panel' : 'ecommerce-setup-panel'} aria-label="Storefront view" onChange={(event) => showWorkspace(event.target.value as 'setup' | 'preview')} value={workspaceView}>
          <option value="preview">Store</option>
          <option value="setup">Edit store</option>
        </select>
      </label>

      <div className="ecommerce-workspace" data-view={workspaceView}>
        <section className="core-panel ecommerce-setup" aria-busy={catalogHydrating || draftBusy} aria-labelledby="ecommerce-setup-title" id="ecommerce-setup-panel">
          <div className="panel-head">
            <div><span className="core-eyebrow">1 · Storefront</span><h2 id="ecommerce-setup-title">Choose what customers see</h2></div>
            <span className="status-pill bounded">{selectedSkus.length}/8</span>
          </div>

          <div className="ecommerce-copy-fields">
            <label>
              <span>Store name</span>
              <input disabled={portalViewOnly || catalogHydrating || draftBusy} maxLength={60} onChange={(event) => { setStoreName(event.target.value); setDraftNotice(''); setBuyingCart([]) }} value={storeName} />
            </label>
            <label>
              <span>Short description</span>
              <textarea disabled={portalViewOnly || catalogHydrating || draftBusy} maxLength={180} onChange={(event) => { setSummary(event.target.value); setDraftNotice(''); setBuyingCart([]) }} rows={3} value={summary} />
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
              <strong>{portalViewOnly
                ? 'View only'
                : catalogHydrating
                ? 'Checking saved store'
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
                ? `Saved to company · revision ${savedDraft?.revision}`
                  : `Saved on this device · revision ${savedDraft?.revision}`
                : savedDraft ? 'Unsaved changes' : 'Not saved yet'}</strong>
              <small>{portalViewOnly
                ? 'Ask a company owner to assign Ecommerce operator access.'
                : catalogHydrating
                ? 'Editing unlocks after the local or managed Shop scope is confirmed.'
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
            {!savedDraftIsCurrent ? <div className="ecommerce-save-actions">
              {hasUnsavedFieldChanges ? <button className="core-button secondary" disabled={portalViewOnly || catalogHydrating || draftBusy} onClick={discardStorefrontChanges} type="button">Discard</button> : null}
              <button
                className="core-button primary"
                disabled={portalViewOnly
                  || !hasUnsavedStorefront
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
                {draftBusy ? 'Saving…' : localFingerprintUpgradeRequired ? 'Upgrade store' : catalogRebindRequired ? 'Reconnect store' : 'Save store'}
              </button>
            </div> : null}
          </div>
          <p className="ecommerce-save-notice" aria-live="polite">{draftNotice}</p>
        </section>

        <section className="core-panel ecommerce-preview-panel" aria-labelledby="ecommerce-preview-title" id="ecommerce-preview-panel">
          <div className="panel-head ecommerce-preview-head">
            <div><span className="core-eyebrow">Store demo</span><h2 id="ecommerce-preview-title" ref={storefrontPreviewHeadingRef} tabIndex={-1}>Shop the sample</h2></div>
            <label className="ecommerce-preview-size">
              <span>Preview</span>
              <select aria-label="Preview size" onChange={(event) => setDevice(event.target.value as PreviewDevice)} value={device}>
                <option value="phone">Phone</option>
                <option value="desktop">Desktop</option>
              </select>
            </label>
          </div>

          {!buyingReady && !catalogHydrating ? (
            <div className="ecommerce-preview-gate">
              <span>
                <strong>{managedIdentity ? 'Review the store before taking orders' : 'Preparing the sample store'}</strong>
                <small>{managedIdentity ? 'Save the store before customer requests are available.' : 'The exact Shop catalog and prices are being checked.'}</small>
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
                      className={available && buyingReady ? 'has-request-action' : undefined}
                      data-featured={item.merchandising?.featured ? 'true' : 'false'}
                      data-requested={buyingCart.some((line) => line.sku === item.sku) ? 'true' : 'false'}
                      key={item.sku}
                    >
                      <ProductPhoto className="storefront-product-art storefront-product-photo" fallback={<StorefrontProductArtwork sku={item.sku} />} scope={productImageScope} sku={item.sku} />
                      <small>{item.merchandising ? `${item.merchandising.featured ? 'Featured · ' : ''}${item.merchandising.collection}` : item.variant || item.sku}</small>
                      <strong>{displayName}</strong>
                      <span>{formatMmk(item.unitPriceMmk)}</span>
                      <b>{available ? 'Available' : 'Sold out'}</b>
                      {available && buyingReady ? (
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
                <strong>Preview needs attention</strong>
                <p>{previewResult.error}</p>
              </div>
            )}
          </div>

          {buyingReady && previewResult.preview && digest && activeCommerceState ? (
            <EcommerceBuyingWorkspace
              cart={buyingCart}
              commerceState={activeCommerceState}
              currentCatalog={catalog.items}
              disabled={catalogHydrating}
              onCartChange={setBuyingCart}
              onContinueInShop={(requestId) => navigate(`/shop/?tab=orders&source=ecommerce&request=${encodeURIComponent(requestId)}`)}
              onDraft={openShopDraft}
              onOpenManagedRequest={managedIdentity ? (requestId) => navigate(`/shop/?tab=orders&source=ecommerce&request=${encodeURIComponent(requestId)}`) : undefined}
              onOpenCancellation={(intent: EcommerceCancellationIntent) => navigate('/shop/?tab=orders', { state: { ecommerceCancellationIntent: intent } })}
              onOpenCorrection={(intent) => navigate('/shop/?tab=orders', { state: { ecommerceCorrectionIntent: intent } })}
              onOpenAmendment={(intent: EcommerceOrderAmendmentIntent) => navigate('/shop/?tab=orders', { state: { ecommerceOrderAmendmentIntent: intent } })}
              onOpenReschedule={(intent: EcommerceOrderRescheduleIntent) => navigate('/shop/?tab=orders', { state: { ecommerceOrderRescheduleIntent: intent } })}
              onOpenReturns={(intent: EcommerceReturnIntent) => navigate('/shop/?tab=orders', { state: { ecommerceReturnIntent: intent } })}
              onOpenSupport={(intent: EcommerceSupportIntent) => navigate('/shop/?tab=orders', { state: { ecommerceSupportIntent: intent } })}
              onRecordManagedRequest={managedIdentity && managedCanWrite ? recordManagedBuyingRequest : undefined}
              onRequestStateChange={setCustomerRequestState}
              preview={previewResult.preview}
              scope={buyingScope}
              sourcePreviewDigest={digest}
              sourceStorefront={sourceStorefront
                ? { revision: sourceStorefront.revision, actionId: sourceStorefront.saved.actionId }
                : null}
            />
          ) : null}

        </section>
      </div>
    </div>
  )
}
