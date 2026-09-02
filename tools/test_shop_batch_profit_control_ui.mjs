import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
  SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
  projectNoBatchProfitControl,
} from '../showroom/src/core/shop-batch-profit-control.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const today = readFileSync(`${root}/showroom/src/core/ShopToday.tsx`, 'utf8').replace(/\r\n?/g, '\n')
const coreApp = readFileSync(`${root}/showroom/src/core/CoreApp.tsx`, 'utf8').replace(/\r\n?/g, '\n')
const css = readFileSync(`${root}/showroom/src/core/core-app.css`, 'utf8')
const firstUseSource = readFileSync(`${root}/showroom/src/core/shop-batch-profit-control-first-use.tsx`, 'utf8')
const workspaceCapabilitySource = readFileSync(`${root}/showroom/src/core/shop-batch-first-use-workspace-capability.ts`, 'utf8')
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
const panelStart = today.indexOf('export function ShopBatchProfitControlPanel')
const start = today.indexOf('return <section aria-label={panelAriaLabel}', panelStart)
const end = today.indexOf('export function ShopToday', start)

let checks = 0
const check = (condition, message) => {
  checks += 1
  assert.ok(condition, message)
}

check(start >= 0 && end > start, 'Batch Profit Control must be a bounded Shop Today section')
const section = today.slice(start, end)
const noBatch = projectNoBatchProfitControl()

assert.equal(noBatch.contract, SHOP_BATCH_PROFIT_CONTROL_CONTRACT); checks += 1
assert.equal(noBatch.contractSourceSha256, SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256); checks += 1
assert.equal(noBatch.state, 'no_batch'); checks += 1
assert.equal(noBatch.estimatePreview, null); checks += 1
assert.deepEqual(noBatch.priorities, []); checks += 1
assert.deepEqual(noBatch.evidenceStatus.withheldReasonCodes, ['no_batch']); checks += 1
check(Object.values(noBatch.authority).every((value) => value === false), 'No-batch authority must stay all false')

check(today.includes('batchProfitControl = projectNoBatchProfitControl()'), 'Shop Today must default through the accepted no-batch projector')
check(today.includes('batchProfitControl?: ShopBatchProfitControlView'), 'A future source-owned projection may be supplied without inventing UI state')
check(today.includes("panelAriaLabel = 'Shop Batch Profit Control'"), 'The primary Batch panel retains its exact accessible label')
check(today.includes("panelId = 'shop-batch-profit-control'"), 'The primary Batch panel retains its exact route anchor')
check(today.includes('batchProfitControl.contract === SHOP_BATCH_PROFIT_CONTROL_CONTRACT'), 'UI must bind the exact projection contract')
check(today.includes('batchProfitControl.contractSourceSha256 === SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256'), 'UI must bind the accepted R&D contract digest')
check(today.includes('Object.values(batchProfitControl.authority).every((value) => value === false)'), 'UI must fail closed if any authority flag is true')
check(section.includes('role="alert"') && section.includes('Batch projection blocked.'), 'Contract or authority mismatch must render a blocking alert')
const boundHeaderStart = section.indexOf('{batchProjectionBound ? <>')
const blockedHeaderCopy = 'Accepted Batch Profit Control binding did not verify. No evidence, estimate, priority, or authority is inferred.'
const blockedHeaderStart = section.indexOf(`</> : '${blockedHeaderCopy}'}`)
check(boundHeaderStart >= 0 && blockedHeaderStart > boundHeaderStart, 'Projection-derived header copy must be inside the verified binding branch')
check(section.slice(boundHeaderStart, blockedHeaderStart).includes('batchProfitControl.truthBoundary.boundary'), 'Only a verified projection may expose its truth-boundary copy')
check(section.includes(": 'blocked'}>{batchProjectionBound ? batchStateLabels[batchProfitControl.state] : 'Blocked'}</b>"), 'An unbound projection must show only the blocked state')

for (const [state, label] of Object.entries({
  no_batch: 'No batch selected',
  collecting_batch_evidence: 'Collecting evidence',
  review_adjustments: 'Review adjustments',
  batch_margin_at_risk: 'Margin at risk',
  batch_controlled: 'Controlled',
})) {
  check(today.includes(`${state}: '${label}'`), `State ${state} must have exact owner-facing copy`)
}

for (const label of [
  'Canonical revision lineage',
  'Whole-line batch allocation',
  'Production-cost estimate coverage',
  'Retained completed sales',
  'Packaging and delivery review',
  'Adjustments and unit reconciliation',
]) check(section.includes(label), `Evidence gate must be visible: ${label}`)

for (const label of [
  'Completed sold value',
  'Total batch cost estimate',
  'Batch contribution estimate',
  'Estimated break-even sold value',
  'Estimated margin at risk',
  'Batch disposition',
]) check(section.includes(label), `Batch output must use exact estimate-safe label: ${label}`)

check(section.includes('batchProfitControl.truthBoundary.boundary'), 'The engine truth boundary must render verbatim')
check(today.includes('Synthetic calculation only — never evidence'), 'Synthetic classification must remain permanent and explicit')
check(today.includes('Retained local operating evidence — not pilot, customer, or commercial proof'), 'Local operating evidence must not become commercial proof')
check(section.includes('Decision estimates withheld.'), 'No-batch state must withhold every decision estimate')
check(section.includes('Unknown is never replaced with zero'), 'Incomplete break-even must not false-green to zero')
check(section.includes('No ranking while decision evidence is incomplete'), 'Incomplete evidence must not expose priorities')
check(section.includes('Rate unavailable — no sold value'), 'Zero-sale contribution rate must remain unavailable')
check(section.includes('<strong>Next:</strong>') && section.includes('<strong>Closed when:</strong>'), 'Every rendered priority must retain action and objective closure')
check(section.includes('payment, stock, supplier, accounting, customer, hosted, provider, model, or production action'), 'The complete no-write boundary must remain visible')

for (const forbidden of ['<button', '<Link', 'onClick=', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest']) {
  check(!section.includes(forbidden), `Batch projection surface must remain read-only: ${forbidden}`)
}

check(css.includes('.shop-batch-evidence { display: grid; grid-template-columns: repeat(3,minmax(0,1fr));'), 'Desktop evidence layout must use bounded columns')
check(css.includes('.shop-batch-priorities { display: grid; grid-template-columns: repeat(2,minmax(0,1fr));'), 'Desktop priorities must use bounded columns')
check(css.includes('.shop-batch-evidence { grid-template-columns: 1fr; }'), 'Mobile evidence must stack to one column')
check(css.includes('.shop-batch-priorities { grid-template-columns: 1fr; }'), 'Mobile priorities must stack to one column')
check(css.includes('overflow-wrap: anywhere'), 'Long safe IDs and labels must not force horizontal overflow')

check(today.includes("import type { ShopBakeryBatchDemoResult } from './shop-bakery-demo-loader'"), 'Batch demo keeps only a type-level static loader dependency')
check(today.includes("const { loadShopBakeryBatchProfitDemo } = await import('./shop-bakery-demo-loader')"), 'Batch demo implementation loads only after the explicit action')
check(!today.includes("import { loadShopBakeryBatchProfitDemo } from './shop-bakery-demo-loader'"), 'Batch demo has no eager value import')
check(today.includes("const [bakeryBatchDemo, setBakeryBatchDemo] = useState<ShopBakeryBatchDemoState>({ status: 'idle' })"), 'Batch demo begins inert')
check(today.includes("if (attempt === bakeryBatchDemoAttempt.current) setBakeryBatchDemo({ status: 'ready', result })"), 'Batch demo ignores stale asynchronous completion')
check(today.includes('<ShopBatchProfitControlPanel batchProfitControl={activeBatchProfitControl} />'), 'current or exactly revalidated local Batch view renders through the guarded authoritative panel')
check(today.includes("{bakeryBatchDemo.status === 'ready' ? <ShopBatchProfitControlPanel"), 'synthetic projection renders only after exact loader success')
check(today.includes('batchProfitControl={bakeryBatchDemo.result.projection}'), 'successful synthetic result is passed through the existing guarded projection panel')
check(today.includes('panelId="shop-batch-profit-control-synthetic-demo"'), 'synthetic view uses a distinct DOM anchor')
check(today.includes('Synthetic local Batch calculation only — never baseline, pilot, customer, commercial, or accounting proof.'), 'synthetic Batch classification is permanent before load')
check(today.includes('never replaces, merges with, or writes to your current Shop workspace'), 'synthetic Batch action visibly refuses workspace mutation')
check(today.includes('The current Shop Batch panel above remains authoritative and unchanged.'), 'current Batch view remains visibly authoritative')
check(today.includes('Batch demo binding check failed closed.'), 'binding failure exposes no synthetic projection')

check(today.includes("await import('./shop-batch-profit-control-first-use')"), 'real local Batch workflow is loaded only after the explicit action')
check(!today.includes("import { ShopBatchProfitControlFirstUse } from './shop-batch-profit-control-first-use'"), 'real local Batch workflow has no eager value import')
check(today.includes('setLocalBatchProjection(null)\n    setBatchFirstUse({ status: \'loading\' })'), 'reopening the local workflow clears any prior projection before asynchronous validation')
check(today.includes('Existing Batch records and the current Shop workspace are never overwritten.'), 'launcher states the no-overwrite boundary')
check(today.includes('Not pilot, customer, commercial, or accounting proof.'), 'launcher permanently excludes commercial evidence claims')
check(coreApp.includes('localBatchFirstUseAllowed={confirmedLocalShop}'), 'the local Batch workflow must use the settled local-workspace identity gate')
check(coreApp.includes("key={confirmedLocalShop ? 'confirmed-local' : 'managed-or-unconfirmed'}"), 'a local-to-managed identity transition must synchronously replace the Shop Today lifecycle')
check(today.includes('if (!localBatchFirstUseAllowed) return'), 'managed or unconfirmed shops must not action-load the local Batch workflow')
check(today.includes('shopBatchFirstUseWorkspaceCapabilityIsCurrent(localResult.workspaceCapability, currentWorkspaceCapability)'), 'a prior local Batch projection must not surface after capability revocation or lifecycle replacement')
check(today.includes('Managed company records stay separate; no local Batch record is read or saved.'), 'managed and unconfirmed shops must show the fail-closed local Batch boundary')
check(firstUseSource.includes("SHOP_BATCH_FIRST_USE_STORAGE_KEY = 'supermega.shop.batch-profit-control.local-workspace.v1'"), 'local Batch storage must be explicitly versioned')
check(workspaceCapabilitySource.includes("SHOP_BATCH_FIRST_USE_LOCAL_SCOPE = 'confirmed-local'"), 'the local Batch storage API must require an explicit confirmed-local scope')
check(workspaceCapabilitySource.includes('capabilityState = new WeakMap'), 'only a source-owned capability may authorize local Batch storage')
check(today.includes('useLayoutEffect(() => () =>') && today.includes('revokeShopBatchFirstUseWorkspaceCapability(batchFirstUse.workspaceCapability)'), 'unmounting or replacing the local workflow must synchronously revoke its exact capability before stale async work can commit')
check(firstUseSource.includes('shopBatchFirstUseWorkspaceCapabilityIsCurrent(expected, current)'), 'every async storage phase must bind the same exact live workspace capability object')
check(firstUseSource.includes('projectShopBatchProfitControl(structuredClone(input)'), 'local Batch workflow must project through the accepted engine')
check(!firstUseSource.includes('estimatedBreakEvenSoldValueMmk:'), 'local Batch workflow must not implement a second decision-arithmetic projector')
check(!firstUseSource.includes('for (const record of store.records) await validateCurrentCommerceSource'), 'immutable historical Batch receipts must not be revalidated against later Commerce changes')
check(firstUseSource.includes('await validateCurrentCommerceSource(record, currentCommerceEvidence)'), 'only the newly created Batch receipt must bind the atomically current Commerce evidence')
const saveTransactionSource = firstUseSource.slice(firstUseSource.indexOf('export async function saveShopBatchProfitControlLocalReview'), firstUseSource.indexOf('type WorkflowState'))
const commerceLockIndex = saveTransactionSource.indexOf("lockManager.request(COMMERCE_LOCK, { mode: 'exclusive' }")
const commerceReadIndex = saveTransactionSource.indexOf('readCurrentCommerceSnapshot(storage)')
const batchLockIndex = saveTransactionSource.indexOf("lockManager.request(STORAGE_LOCK_NAME, { mode: 'exclusive' }")
check(commerceLockIndex >= 0 && commerceReadIndex > commerceLockIndex && batchLockIndex > commerceReadIndex, 'the current Commerce snapshot and complete Batch append must share the exported Commerce lock before the Batch lock')
check(firstUseSource.includes("if (!lockManager) fail('shop_batch_first_use_storage_lock_unavailable')"), 'saving must fail closed when Web Locks are unavailable')
check(firstUseSource.includes("inputLeaves: persistedInputLeaves(input)"), 'persisted records must normalize immutable input leaves')
check(!firstUseSource.includes('input: ShopBatchProfitControlInput\n  projectionDigest'), 'persisted records must not embed complete inputs with prior history')
const validateStoreSource = firstUseSource.slice(firstUseSource.indexOf('async function validateStore'), firstUseSource.indexOf('async function readValidatedStore'))
assert.equal(validateStoreSource.match(/projectShopBatchProfitControl\(/g)?.length, 1, 'store validation must project only the latest record once'); checks += 1
check(firstUseSource.includes('SHOP_BATCH_FIRST_USE_MAX_STORAGE_BYTES = 2_000_000'), 'storage must have an exact measured UTF-8 byte ceiling')
check(firstUseSource.includes('collectLocalWorkspaceBackup(candidateBackupStorage(storage, serializedBatchStore), createdAt)'), 'every append must fit the complete registered workspace backup before writing')
check(!firstUseSource.includes('MODULE_LOAD_YANGON_DATE'), 'business-date defaults must not freeze at module import')
check(firstUseSource.includes('shopBatchFirstUseReviewDefaults(Date.now(), recordCount + 1)'), 'every separate local review must derive its Yangon date when the action starts')
for (const forbidden of ['fetch(', 'XMLHttpRequest', 'indexedDB', 'saveCommerce', 'mutateCommerce', 'sessionStorage']) {
  check(!firstUseSource.includes(forbidden), `local Batch workflow must not gain a network/workspace write primitive: ${forbidden}`)
}
for (const expected of [
  '.shop-batch-first-use-form input[type="checkbox"] { width: 2.75rem; height: 2.75rem;',
  'min-inline-size: 2.75rem; min-block-size: 2.75rem;',
  '.shop-batch-first-use-lines, .shop-batch-first-use-items { grid-template-columns: 1fr; }',
]) check(css.includes(expected), `local Batch workflow must retain its mobile/touch contract: ${expected}`)

assert.equal(
  packageJson.scripts['shop:batch-profit-control:verify'],
  'node tools/test_shop_batch_profit_control.mjs && node tools/test_shop_batch_profit_control_ui.mjs',
)
checks += 1

const showroomRequire = createRequire(new URL('../showroom/package.json', import.meta.url))
const [{ createServer }, react, { renderToStaticMarkup }] = await Promise.all([
  import(pathToFileURL(showroomRequire.resolve('vite')).href),
  import(pathToFileURL(showroomRequire.resolve('react')).href),
  import(pathToFileURL(showroomRequire.resolve('react-dom/server')).href),
])
const createElement = react.createElement ?? react.default.createElement
const vite = await createServer({
  appType: 'custom',
  configFile: `${root}/showroom/vite.config.ts`,
  configLoader: 'runner',
  logLevel: 'silent',
  root: `${root}/showroom`,
  server: { hmr: false, middlewareMode: true },
})
let firstUseStorageEvidence = null

try {
  const { ShopBatchProfitControlPanel } = await vite.ssrLoadModule('/src/core/ShopToday.tsx')
  const firstUse = await vite.ssrLoadModule('/src/core/shop-batch-profit-control-first-use.tsx')
  const commerceModel = await vite.ssrLoadModule('/src/core/commerce-workspace.ts')
  const workspaceCapabilities = await vite.ssrLoadModule('/src/core/shop-batch-first-use-workspace-capability.ts')
  const localBackup = await vite.ssrLoadModule('/src/core/local-workspace-backup.ts')
  assert.deepEqual(
    firstUse.shopBatchFirstUseReviewDefaults(Date.parse('2026-08-30T17:29:59.999Z'), 7),
    { businessDate: '2026-08-30', batchId: 'BATCH-20260830-07' },
  ); checks += 1
  assert.deepEqual(
    firstUse.shopBatchFirstUseReviewDefaults(Date.parse('2026-08-30T17:30:00.000Z'), 8),
    { businessDate: '2026-08-31', batchId: 'BATCH-20260831-08' },
  ); checks += 1
  const allFalseAuthority = {
    paymentWrite: false,
    stockWrite: false,
    supplierWrite: false,
    accountingWrite: false,
    customerWrite: false,
    hostedWrite: false,
    providerWrite: false,
    modelUsed: false,
  }
  const untrustedProjection = {
    contract: SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
    contractSourceSha256: SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
    state: 'batch_controlled',
    batchIdentity: { batchId: 'UNTRUSTED-BATCH-ID' },
    evidenceStatus: { withheldReasonCodes: [], profitStatus: 'available' },
    totals: { totalCompletedSaleValueMmk: 987654321 },
    estimatePreview: { batchContributionEstimateMmk: 987654321 },
    priorities: [{ sku: 'UNTRUSTED-PRIORITY-SKU' }],
    truthBoundary: {
      costLabel: 'UNTRUSTED COST CONTENT',
      classification: 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof',
      boundary: 'UNTRUSTED TRUTH CONTENT',
    },
    authority: allFalseAuthority,
  }
  const renderProjection = (projection) => renderToStaticMarkup(createElement(ShopBatchProfitControlPanel, { batchProfitControl: projection }))
  const assertBlockedProjection = (markup, reason) => {
    check(markup.includes('Accepted Batch Profit Control binding did not verify.'), `${reason} must show neutral binding copy`)
    check(markup.includes('<b data-state="blocked">Blocked</b>'), `${reason} must show only a blocked state`)
    check(markup.includes('Batch projection blocked.'), `${reason} must show the blocking alert`)
    for (const forbidden of ['Controlled', 'UNTRUSTED COST CONTENT', 'UNTRUSTED TRUTH CONTENT', 'UNTRUSTED-BATCH-ID', 'UNTRUSTED-PRIORITY-SKU', '987,654,321', 'Retained local operating evidence', 'Completed sold value']) {
      check(!markup.includes(forbidden), `${reason} must not expose supplied projection content: ${forbidden}`)
    }
  }

  assertBlockedProjection(renderProjection({ ...untrustedProjection, contractSourceSha256: '0'.repeat(64) }), 'digest mismatch')
  for (const authorityKey of Object.keys(allFalseAuthority)) {
    assertBlockedProjection(renderProjection({
      ...untrustedProjection,
      authority: { ...allFalseAuthority, [authorityKey]: true },
    }), `true authority ${authorityKey}`)
  }

  const { loadShopBakeryBatchProfitDemo } = await vite.ssrLoadModule('/src/core/shop-bakery-demo-loader.ts')
  const syntheticBatchDemo = await loadShopBakeryBatchProfitDemo()
  const syntheticMarkup = renderToStaticMarkup(createElement(ShopBatchProfitControlPanel, {
    batchProfitControl: syntheticBatchDemo.projection,
    panelAriaLabel: 'Verified synthetic bakery Batch Profit Control projection',
    panelId: 'shop-batch-profit-control-synthetic-demo',
  }))
  for (const expected of [
    'aria-label="Verified synthetic bakery Batch Profit Control projection"',
    'id="shop-batch-profit-control-synthetic-demo"',
    '<b data-state="batch_margin_at_risk">Margin at risk</b>',
    'Synthetic calculation only — never evidence',
    'Operating decision status: withheld',
    '63,000 MMK',
    '77,550 MMK',
    '-14,550 MMK',
    '24,000 MMK',
    'BAK-CROISSANT',
    'BAK-MILK-BREAD',
    'BAK-TEA-BUN',
    'never counts as baseline, pilot, customer, or commercial proof',
  ]) check(syntheticMarkup.includes(expected), `verified synthetic Batch render must include: ${expected}`)
  check(!syntheticMarkup.includes('Batch projection blocked.'), 'exact synthetic projection must pass the guarded renderer')

  const retainedCommerce = {
    schema: 'supermega.commerce.workspace.v2',
    items: [{ sku: 'BAK-BREAD', name: 'Daily Bread', onHand: 10, reorderAt: 2, price: 3_000 }],
    movements: [],
    closes: [],
    orders: [{
      id: 'ORDER-OWNER-001',
      createdAt: '2026-08-30T01:00:00.000Z',
      customer: 'PRIVATE CUSTOMER MUST NOT PERSIST',
      channel: 'counter',
      item: 'Daily Bread',
      itemSku: 'BAK-BREAD',
      quantity: 2,
      payment: 'cash',
      paymentStatus: 'reconciled',
      refundStatus: 'none',
      paymentReconciledAt: '2026-08-30T02:00:00.000Z',
      paymentReconciliationActionId: 'PAY-OWNER-001',
      paymentReconciledBy: 'Shop owner',
      paymentReconciliationReason: 'Reviewed counter payment',
      paymentEvidenceReference: 'LOCAL-PAYMENT-001',
      lines: [{ sku: 'BAK-BREAD', name: 'Daily Bread', quantity: 2, unitPriceMmk: 3_000 }],
      completion: { actionId: 'COMPLETE-OWNER-001', capturedAt: '2026-08-30T02:05:00.000Z', actor: 'Shop owner', reason: 'Local counter close', evidenceReference: 'LOCAL-SALE-001' },
      total: 6_000,
      status: 'completed',
    }],
  }
  const evidence = await firstUse.deriveShopBatchEligibleSaleLines(retainedCommerce)
  assert.equal(evidence.lines.length, 1); checks += 1
  assert.deepEqual(evidence.blocked, { incompleteEvidence: 0, invalidAdjustments: 0, missingLines: 0, sampleOrSynthetic: 0 }); checks += 1
  const line = evidence.lines[0]
  const draft = {
    batchId: 'OWNER-BATCH-001',
    businessDate: '2026-08-30',
    selectedLineDigests: [line.selectionId],
    itemInputs: {
      'BAK-BREAD': { producedUnits: 2, leftoverUnits: 0, wastedUnits: 0, remakeUnits: 0, preorderUnits: 0, reviewedUnitCostEstimateMmk: 2_000, ownerReviewed: true },
    },
    packagingCostMmk: 200,
    deliveryCostMmk: 0,
    otherReviewedBatchCostMmk: 0,
    otherReviewedBatchCostReason: 'none',
    overheadOwnerReviewed: true,
  }
  class MemoryStorage {
    values = new Map()
    constructor(commerce = retainedCommerce) {
      if (commerce) this.setCommerce(commerce)
    }
    get length() { return this.values.size }
    get value() { return this.getItem(firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY) }
    set value(value) {
      if (value === null) this.values.delete(firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY)
      else this.values.set(firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY, String(value))
    }
    key(index) { return [...this.values.keys()][index] ?? null }
    getItem(key) { return this.values.get(key) ?? null }
    setItem(key, value) { this.values.set(key, String(value)) }
    setCommerce(commerce) { this.values.set('supermega.commerce.workspace.v2', JSON.stringify(commerce)) }
  }
  class ExclusiveLockManager {
    tails = new Map()
    requests = 0
    requestsByName = new Map()
    active = 0
    maxActive = 0
    activeNames = new Set()
    request(name, options, callback) {
      assert.ok(['supermega-commerce-workspace-v2', `${firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY}.exclusive-write`].includes(name))
      assert.deepEqual(options, { mode: 'exclusive' })
      this.requests += 1
      this.requestsByName.set(name, (this.requestsByName.get(name) ?? 0) + 1)
      const prior = this.tails.get(name) ?? Promise.resolve()
      let release
      const gate = new Promise((resolve) => { release = resolve })
      this.tails.set(name, prior.then(() => gate))
      return prior.then(async () => {
        this.active += 1
        this.activeNames.add(name)
        this.maxActive = Math.max(this.maxActive, this.active)
        try { return await callback({ name, mode: 'exclusive' }) } finally {
          this.activeNames.delete(name)
          this.active -= 1
          release()
        }
      })
    }
  }
  class LockGuardedStorage extends MemoryStorage {
    enforceLock = true
    constructor(lockManager) { super(); this.lockManager = lockManager }
    getItem(key) {
      if (this.enforceLock) {
        const requiredLock = key === 'supermega.commerce.workspace.v2' ? 'supermega-commerce-workspace-v2' : `${firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY}.exclusive-write`
        assert.ok(this.lockManager.activeNames.has(requiredLock), `transactional read must hold ${requiredLock}`)
      }
      return super.getItem(key)
    }
    setItem(key, value) {
      if (this.enforceLock) {
        const requiredLock = key === 'supermega.commerce.workspace.v2' ? 'supermega-commerce-workspace-v2' : `${firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY}.exclusive-write`
        assert.ok(this.lockManager.activeNames.has(requiredLock), `transactional write must hold ${requiredLock}`)
      }
      super.setItem(key, value)
    }
  }
  class InterleavingCommerceStorage extends LockGuardedStorage {
    queuedCommerce = null
    writerPromise = null
    queueCommerceWrite(commerce) { this.queuedCommerce = structuredClone(commerce) }
    getItem(key) {
      const value = super.getItem(key)
      if (key === 'supermega.commerce.workspace.v2' && this.queuedCommerce) {
        const queuedCommerce = this.queuedCommerce
        this.queuedCommerce = null
        this.writerPromise = this.lockManager.request('supermega-commerce-workspace-v2', { mode: 'exclusive' }, async (lock) => {
          assert.equal(lock?.mode, 'exclusive')
          this.setItem(key, JSON.stringify(queuedCommerce))
        })
      }
      return value
    }
  }
  const lockManager = new ExclusiveLockManager()
  const localWorkspaceCapability = workspaceCapabilities.createShopBatchFirstUseWorkspaceCapability()
  const readLocalWorkspaceCapability = () => localWorkspaceCapability.active ? localWorkspaceCapability : null
  const saveReview = (currentCommerce, currentDraft, currentStorage, projectionAt, currentLockManager = lockManager) => {
    currentStorage.setCommerce?.(currentCommerce)
    return firstUse.saveShopBatchProfitControlLocalReview(currentCommerce, currentDraft, currentStorage, localWorkspaceCapability, readLocalWorkspaceCapability, projectionAt, currentLockManager)
  }
  const storage = new MemoryStorage()
  const commerceBeforeSave = structuredClone(retainedCommerce)
  let managedStorageTouches = 0
  const managedBlockedStorage = {
    get length() { managedStorageTouches += 1; throw new Error('managed storage must not be inspected') },
    getItem() { managedStorageTouches += 1; throw new Error('managed storage must not be inspected') },
    key() { managedStorageTouches += 1; throw new Error('managed storage must not be inspected') },
    setItem() { managedStorageTouches += 1; throw new Error('managed storage must not be written') },
  }
  const managedWorkspaceCapability = { scope: 'managed', active: true }
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, draft, managedBlockedStorage, managedWorkspaceCapability, () => managedWorkspaceCapability, '2026-08-30T03:00:00.000Z', lockManager),
    /shop_batch_first_use_managed_workspace_blocked/,
  ); checks += 1
  await assert.rejects(
    firstUse.loadShopBatchProfitControlLocalReview(retainedCommerce, managedBlockedStorage, managedWorkspaceCapability, () => managedWorkspaceCapability),
    /shop_batch_first_use_managed_workspace_blocked/,
  ); checks += 1
  assert.equal(managedStorageTouches, 0, 'managed and unconfirmed workspace scope must be rejected before any local Batch storage access'); checks += 1
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, draft, new MemoryStorage(), localWorkspaceCapability, readLocalWorkspaceCapability, '2026-08-30T03:00:00.000Z', null),
    /shop_batch_first_use_storage_lock_unavailable/,
  ); checks += 1
  const saved = await saveReview(retainedCommerce, draft, storage, '2026-08-30T03:00:00.000Z')
  assert.equal(saved.recordCount, 1); checks += 1
  assert.equal(saved.projection.batchIdentity.batchId, 'OWNER-BATCH-001'); checks += 1
  assert.equal(saved.projection.truthBoundary.classification, 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof'); checks += 1
  assert.equal(saved.projection.estimatePreview.batchContributionEstimateMmk, 1_800); checks += 1
  check(Object.values(saved.projection.authority).every((value) => value === false), 'real local Batch projection must retain all-false authority')
  check(!storage.value.includes('PRIVATE CUSTOMER MUST NOT PERSIST'), 'local Batch receipt must not persist customer identity')
  check(!storage.value.includes('workspaceHistorySnapshot') && !storage.value.includes('workspaceHistoryReceipt'), 'normalized local records must not embed prior workspace history')
  const firstPersistedRecord = JSON.parse(storage.value).records[0]
  assert.ok(firstPersistedRecord.inputLeaves && !('input' in firstPersistedRecord)); checks += 1
  assert.deepEqual(retainedCommerce, commerceBeforeSave); checks += 1

  const priorLifecycleCapability = workspaceCapabilities.createShopBatchFirstUseWorkspaceCapability()
  const replacementLifecycleCapability = workspaceCapabilities.createShopBatchFirstUseWorkspaceCapability()
  assert.equal(workspaceCapabilities.shopBatchFirstUseWorkspaceCapabilityIsCurrent(priorLifecycleCapability, priorLifecycleCapability), true); checks += 1
  assert.equal(workspaceCapabilities.shopBatchFirstUseWorkspaceCapabilityIsCurrent(priorLifecycleCapability, replacementLifecycleCapability), false, 'a projection cannot cross an exact local-workspace capability identity'); checks += 1
  workspaceCapabilities.revokeShopBatchFirstUseWorkspaceCapability(priorLifecycleCapability)
  assert.equal(workspaceCapabilities.shopBatchFirstUseWorkspaceCapabilityIsCurrent(priorLifecycleCapability, replacementLifecycleCapability), false, 'a revoked projection cannot revive after a managed-to-local transition'); checks += 1

  const loaded = await firstUse.loadShopBatchProfitControlLocalReview(retainedCommerce, storage, localWorkspaceCapability, readLocalWorkspaceCapability)
  assert.equal(loaded.recordCount, 1); checks += 1
  assert.deepEqual(loaded.projection, saved.projection); checks += 1

  const beforeRejectedSave = storage.value
  await assert.rejects(
    saveReview(retainedCommerce, { ...draft, batchId: 'OWNER-BATCH-002' }, storage, '2026-08-30T03:05:00.000Z'),
    /shop_batch_first_use_duplicate_line_reuse/,
  ); checks += 1
  assert.equal(storage.value, beforeRejectedSave); checks += 1

  await assert.rejects(
    saveReview(retainedCommerce, { ...draft, batchId: 'OWNER-BATCH-003', itemInputs: {} }, new MemoryStorage(), '2026-08-30T03:05:00.000Z'),
    /shop_batch_first_use_cost_coverage_incomplete/,
  ); checks += 1

  const staleCommerce = structuredClone(retainedCommerce)
  staleCommerce.orders[0].lines[0].unitPriceMmk = 3_001
  staleCommerce.orders[0].total = 6_002
  const preservedHistoricalLoad = await firstUse.loadShopBatchProfitControlLocalReview(staleCommerce, storage, localWorkspaceCapability, readLocalWorkspaceCapability)
  assert.equal(preservedHistoricalLoad.recordCount, 1); checks += 1
  assert.deepEqual(preservedHistoricalLoad.projection, saved.projection, 'later Commerce corrections must not invalidate immutable Batch history'); checks += 1
  const changedDuringSaveStorage = new MemoryStorage(staleCommerce)
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, draft, changedDuringSaveStorage, localWorkspaceCapability, readLocalWorkspaceCapability, '2026-08-30T03:00:00.000Z', lockManager),
    /shop_batch_first_use_sale_allocation_missing/,
  ); checks += 1
  assert.equal(changedDuringSaveStorage.value, null); checks += 1

  const revokedLoadCapability = workspaceCapabilities.createShopBatchFirstUseWorkspaceCapability()
  const revokedLoadStorage = {
    get length() { return 0 },
    key() { return null },
    getItem() {
      workspaceCapabilities.revokeShopBatchFirstUseWorkspaceCapability(revokedLoadCapability)
      return null
    },
    setItem() { throw new Error('revoked load must never write') },
  }
  await assert.rejects(
    firstUse.loadShopBatchProfitControlLocalReview(retainedCommerce, revokedLoadStorage, revokedLoadCapability, () => revokedLoadCapability.active ? revokedLoadCapability : null),
    /shop_batch_first_use_managed_workspace_blocked/,
  ); checks += 1

  const revokedSaveCapability = workspaceCapabilities.createShopBatchFirstUseWorkspaceCapability()
  const revokedSaveStorage = new MemoryStorage(retainedCommerce)
  const revokedSaveGetItem = revokedSaveStorage.getItem.bind(revokedSaveStorage)
  revokedSaveStorage.getItem = (key) => {
    const value = revokedSaveGetItem(key)
    if (key === 'supermega.commerce.workspace.v2') workspaceCapabilities.revokeShopBatchFirstUseWorkspaceCapability(revokedSaveCapability)
    return value
  }
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(
      retainedCommerce,
      draft,
      revokedSaveStorage,
      revokedSaveCapability,
      () => revokedSaveCapability.active ? revokedSaveCapability : null,
      '2026-08-30T03:01:00.000Z',
      lockManager,
    ),
    /shop_batch_first_use_managed_workspace_blocked/,
  ); checks += 1
  assert.equal(revokedSaveStorage.value, null, 'a local-to-managed transition during validation must leave the Batch store untouched'); checks += 1

  const adjustedCommerce = structuredClone(retainedCommerce)
  adjustedCommerce.orders[0].returns = [{ actionId: 'RETURN-001', createdAt: '2026-08-30T02:06:00.000Z', actor: 'Shop owner', reason: 'Reviewed return', evidenceReference: 'RETURN-EVIDENCE-001', sku: 'BAK-BREAD', quantity: 1, disposition: 'restock' }]
  const adjustedEvidence = await firstUse.deriveShopBatchEligibleSaleLines(adjustedCommerce)
  assert.equal(adjustedEvidence.lines.length, 0); checks += 1
  assert.equal(adjustedEvidence.blocked.invalidAdjustments, 1); checks += 1
  await assert.rejects(
    saveReview(adjustedCommerce, { ...draft, batchId: 'OWNER-BATCH-004' }, new MemoryStorage(), '2026-08-30T03:05:00.000Z'),
    /shop_batch_first_use_commerce_snapshot_unavailable/,
  ); checks += 1

  const malformedPromotionCommerce = structuredClone(retainedCommerce)
  malformedPromotionCommerce.orders[0].promotionDecision = {
    schema: 'supermega.commerce.promotion-decision.v1',
    status: 'approved',
    code: 'OWNER-REVIEW',
    policyRevision: 1,
    policyActionId: 'PROMO-001',
    discountBasisPoints: 100,
    grossSubtotalMmk: 6_000,
    discountMmk: 100,
    netSubtotalMmk: 6_000,
    reviewedAt: '2026-08-30T02:01:00.000Z',
    reason: 'approved',
  }
  const malformedPromotionEvidence = await firstUse.deriveShopBatchEligibleSaleLines(malformedPromotionCommerce)
  assert.equal(malformedPromotionEvidence.lines.length, 0); checks += 1
  assert.equal(malformedPromotionEvidence.blocked.invalidAdjustments, 1); checks += 1

  const mixedDiscountBase = structuredClone(retainedCommerce)
  mixedDiscountBase.items = [
    { sku: 'BAK-ZERO', name: 'Zero-value Bun', onHand: 10, reorderAt: 2, price: 1 },
    { sku: 'BAK-ONE', name: 'Retained-value Loaf', onHand: 10, reorderAt: 2, price: 999 },
  ]
  mixedDiscountBase.orders[0].lines = [
    { sku: 'BAK-ZERO', name: 'Zero-value Bun', quantity: 1, unitPriceMmk: 1 },
    { sku: 'BAK-ONE', name: 'Retained-value Loaf', quantity: 1, unitPriceMmk: 999 },
  ]
  mixedDiscountBase.orders[0].item = '2 items'
  delete mixedDiscountBase.orders[0].itemSku
  mixedDiscountBase.orders[0].sourceRecordId = 'ECR-MIXED-DISCOUNT-001'
  mixedDiscountBase.orders[0].total = 1_000
  const mixedDiscountPolicyState = commerceModel.configureCommercePromotionPolicy(mixedDiscountBase, {
    code: 'FULL', discountBasisPoints: 9_990, minimumSubtotalMmk: 1, maximumDiscountMmk: 999,
    status: 'active', effectiveFrom: '2026-08-30T00:58:00.000Z', effectiveUntil: null,
  }, {
    actionId: 'PROMO-POLICY-002', capturedAt: '2026-08-30T00:58:00.000Z', actor: 'Shop owner',
    reason: 'Owner-reviewed full discount test', evidenceReference: 'PROMO-POLICY-EVIDENCE-002',
  })
  assert.ok(mixedDiscountPolicyState); checks += 1
  const mixedDiscountCommerce = structuredClone(mixedDiscountPolicyState)
  mixedDiscountCommerce.orders[0].promotionDecision = commerceModel.commercePromotionDecision(
    commerceModel.commercePromotionPolicies(mixedDiscountCommerce), 'FULL', 1_000, '2026-08-30T00:59:00.000Z',
  )
  mixedDiscountCommerce.orders[0].total = 1
  const mixedDiscountEvidence = await firstUse.deriveShopBatchEligibleSaleLines(mixedDiscountCommerce)
  assert.deepEqual(mixedDiscountEvidence.lines.map((candidate) => candidate.netValueMmk).sort((left, right) => left - right), [0, 1]); checks += 1
  const mixedDiscountProjection = await saveReview(mixedDiscountCommerce, {
    ...draft,
    batchId: 'OWNER-BATCH-DISCOUNT',
    selectedLineDigests: mixedDiscountEvidence.lines.map((candidate) => candidate.selectionId),
    itemInputs: {
      'BAK-ZERO': { producedUnits: 1, leftoverUnits: 0, wastedUnits: 0, remakeUnits: 0, preorderUnits: 0, reviewedUnitCostEstimateMmk: 1, ownerReviewed: true },
      'BAK-ONE': { producedUnits: 1, leftoverUnits: 0, wastedUnits: 0, remakeUnits: 0, preorderUnits: 0, reviewedUnitCostEstimateMmk: 1, ownerReviewed: true },
    },
    packagingCostMmk: 0,
  }, new MemoryStorage(), '2026-08-30T03:05:00.000Z')
  assert.equal(mixedDiscountProjection.projection.priorities[0].sku, 'BAK-ZERO'); checks += 1
  assert.equal(mixedDiscountProjection.projection.priorities[0].contributionEstimateBasisPoints, null); checks += 1

  const ambiguousCommerce = structuredClone(retainedCommerce)
  ambiguousCommerce.orders.push(structuredClone(ambiguousCommerce.orders[0]))
  await assert.rejects(firstUse.deriveShopBatchEligibleSaleLines(ambiguousCommerce), /shop_batch_first_use_sale_allocation_ambiguous/); checks += 1

  const failedStorage = new MemoryStorage()
  failedStorage.setItem = () => { throw new Error('quota') }
  await assert.rejects(
    saveReview(retainedCommerce, draft, failedStorage, '2026-08-30T03:00:00.000Z'),
    /shop_batch_first_use_storage_write_failed/,
  ); checks += 1
  assert.equal(failedStorage.value, null); checks += 1

  const oversizedStorage = new MemoryStorage()
  oversizedStorage.value = 'x'.repeat(firstUse.SHOP_BATCH_FIRST_USE_MAX_STORAGE_BYTES + 1)
  await assert.rejects(
    firstUse.loadShopBatchProfitControlLocalReview(retainedCommerce, oversizedStorage, localWorkspaceCapability, readLocalWorkspaceCapability),
    /shop_batch_first_use_storage_size_exceeded/,
  ); checks += 1

  const secondCommerce = structuredClone(retainedCommerce)
  secondCommerce.orders.push({
    ...structuredClone(secondCommerce.orders[0]),
    id: 'ORDER-OWNER-002',
    paymentReconciliationActionId: 'PAY-OWNER-002',
    completion: { ...structuredClone(secondCommerce.orders[0].completion), actionId: 'COMPLETE-OWNER-002', evidenceReference: 'LOCAL-SALE-002' },
  })
  const secondEvidence = await firstUse.deriveShopBatchEligibleSaleLines(secondCommerce)
  const secondLine = secondEvidence.lines.find((candidate) => candidate.selectionId !== line.selectionId)
  assert.ok(secondLine); checks += 1

  const interleavingLock = new ExclusiveLockManager()
  const interleavingStorage = new InterleavingCommerceStorage(interleavingLock)
  interleavingStorage.queueCommerceWrite(staleCommerce)
  const beforeQueuedCommerceWrite = await firstUse.saveShopBatchProfitControlLocalReview(
    retainedCommerce, { ...draft, batchId: 'ATOMIC-SNAPSHOT-BATCH-001' }, interleavingStorage,
    localWorkspaceCapability, readLocalWorkspaceCapability, '2026-08-30T03:07:00.000Z', interleavingLock,
  )
  assert.ok(interleavingStorage.writerPromise, 'a Commerce write must have attempted to interleave after the snapshot read'); checks += 1
  await interleavingStorage.writerPromise
  assert.equal(beforeQueuedCommerceWrite.projection.estimatePreview.batchContributionEstimateMmk, 1_800, 'the Batch append must finish against its locked Commerce snapshot'); checks += 1
  interleavingStorage.enforceLock = false
  assert.equal(JSON.parse(interleavingStorage.getItem('supermega.commerce.workspace.v2')).orders[0].total, 6_002, 'the queued Commerce writer must run only after the Batch transaction releases the shared lock'); checks += 1
  assert.deepEqual(
    (await firstUse.loadShopBatchProfitControlLocalReview(staleCommerce, interleavingStorage, localWorkspaceCapability, readLocalWorkspaceCapability)).projection,
    beforeQueuedCommerceWrite.projection,
    'a later Commerce correction must preserve the immutable locked Batch projection',
  ); checks += 1

  const priorCommerceWriteLock = new ExclusiveLockManager()
  const priorCommerceWriteStorage = new LockGuardedStorage(priorCommerceWriteLock)
  const priorCommerceWrite = priorCommerceWriteLock.request('supermega-commerce-workspace-v2', { mode: 'exclusive' }, async () => {
    priorCommerceWriteStorage.setItem('supermega.commerce.workspace.v2', JSON.stringify(staleCommerce))
  })
  const staleCandidateSave = firstUse.saveShopBatchProfitControlLocalReview(
    retainedCommerce, { ...draft, batchId: 'ATOMIC-SNAPSHOT-BATCH-002' }, priorCommerceWriteStorage,
    localWorkspaceCapability, readLocalWorkspaceCapability, '2026-08-30T03:07:00.000Z', priorCommerceWriteLock,
  )
  const staleCandidateRejected = assert.rejects(staleCandidateSave, /shop_batch_first_use_sale_allocation_missing/)
  await priorCommerceWrite
  await staleCandidateRejected; checks += 1
  priorCommerceWriteStorage.enforceLock = false
  assert.equal(priorCommerceWriteStorage.value, null, 'a Commerce write completed before the Batch lock must be observed and must leave Batch storage untouched'); checks += 1

  const concurrentLock = new ExclusiveLockManager()
  const concurrentStorage = new LockGuardedStorage(concurrentLock)
  const concurrentSaves = await Promise.all([
    saveReview(secondCommerce, { ...draft, batchId: 'CONCURRENT-BATCH-001' }, concurrentStorage, '2026-08-30T03:08:00.000Z', concurrentLock),
    saveReview(secondCommerce, { ...draft, batchId: 'CONCURRENT-BATCH-002', selectedLineDigests: [secondLine.selectionId] }, concurrentStorage, '2026-08-30T03:09:00.000Z', concurrentLock),
  ])
  assert.deepEqual(concurrentSaves.map((result) => result.recordCount).sort((left, right) => left - right), [1, 2]); checks += 1
  assert.equal(concurrentLock.requestsByName.get('supermega-commerce-workspace-v2'), 2); checks += 1
  assert.equal(concurrentLock.requestsByName.get(`${firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY}.exclusive-write`), 2); checks += 1
  assert.equal(concurrentLock.maxActive, 2, 'one transaction may hold its Commerce and Batch locks, but competing transactions must serialize'); checks += 1
  concurrentStorage.enforceLock = false
  const concurrentLoaded = await firstUse.loadShopBatchProfitControlLocalReview(secondCommerce, concurrentStorage, localWorkspaceCapability, readLocalWorkspaceCapability)
  assert.equal(concurrentLoaded.recordCount, 2); checks += 1

  const conflictingStorage = new MemoryStorage()
  const conflictingLock = new ExclusiveLockManager()
  const conflictingSaves = await Promise.allSettled([
    saveReview(retainedCommerce, { ...draft, batchId: 'CONFLICT-BATCH-001' }, conflictingStorage, '2026-08-30T03:08:00.000Z', conflictingLock),
    saveReview(retainedCommerce, { ...draft, batchId: 'CONFLICT-BATCH-002' }, conflictingStorage, '2026-08-30T03:09:00.000Z', conflictingLock),
  ])
  assert.equal(conflictingSaves.filter((result) => result.status === 'fulfilled').length, 1); checks += 1
  assert.equal(conflictingSaves.filter((result) => result.status === 'rejected' && /shop_batch_first_use_duplicate_line_reuse/.test(String(result.reason))).length, 1); checks += 1
  assert.equal((await firstUse.loadShopBatchProfitControlLocalReview(retainedCommerce, conflictingStorage, localWorkspaceCapability, readLocalWorkspaceCapability)).recordCount, 1); checks += 1

  const backupProjectionAt = '2026-08-30T03:12:00.000Z'
  const backupCapacityStorage = new MemoryStorage()
  const fillerKey = 'supermega.production.workspace.v2'
  backupCapacityStorage.setItem(fillerKey, '')
  const emptyFillerBytes = new TextEncoder().encode(JSON.stringify(localBackup.collectLocalWorkspaceBackup(backupCapacityStorage, backupProjectionAt))).byteLength
  backupCapacityStorage.setItem(fillerKey, 'x'.repeat(localBackup.LOCAL_WORKSPACE_BACKUP_MAX_BYTES - emptyFillerBytes))
  assert.ok(localBackup.collectLocalWorkspaceBackup(backupCapacityStorage, backupProjectionAt), 'the pre-append whole workspace must still fit its exact backup ceiling'); checks += 1
  await assert.rejects(
    saveReview(retainedCommerce, { ...draft, batchId: 'BACKUP-CAPACITY-BLOCKED' }, backupCapacityStorage, backupProjectionAt),
    /shop_batch_first_use_workspace_backup_capacity_exceeded/,
  ); checks += 1
  assert.equal(backupCapacityStorage.getItem(firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY), null, 'a backup-breaking append must not write the Batch key'); checks += 1
  assert.ok(localBackup.collectLocalWorkspaceBackup(backupCapacityStorage, backupProjectionAt), 'rejected append must leave the prior whole-workspace backup valid'); checks += 1

  const correctedSecondCommerce = structuredClone(secondCommerce)
  correctedSecondCommerce.orders.find((order) => order.id === 'ORDER-OWNER-001').lines[0].unitPriceMmk = 3_001
  correctedSecondCommerce.orders.find((order) => order.id === 'ORDER-OWNER-001').total = 6_002
  const appended = await saveReview(correctedSecondCommerce, {
    ...draft,
    batchId: 'OWNER-BATCH-002',
    selectedLineDigests: [secondLine.selectionId],
  }, storage, '2026-08-30T03:10:00.000Z')
  assert.equal(appended.recordCount, 2); checks += 1
  assert.equal(appended.projection.evidenceStatus.crossBatchReuseAbsent, true); checks += 1

  const scaleCommerce = structuredClone(retainedCommerce)
  scaleCommerce.orders = Array.from({ length: 12 }, (_, index) => ({
    ...structuredClone(retainedCommerce.orders[0]),
    id: `ORDER-SCALE-${String(index + 1).padStart(3, '0')}`,
    paymentReconciliationActionId: `PAY-SCALE-${String(index + 1).padStart(3, '0')}`,
    completion: {
      ...structuredClone(retainedCommerce.orders[0].completion),
      actionId: `COMPLETE-SCALE-${String(index + 1).padStart(3, '0')}`,
      evidenceReference: `LOCAL-SCALE-${String(index + 1).padStart(3, '0')}`,
    },
  }))
  const scaleEvidence = await firstUse.deriveShopBatchEligibleSaleLines(scaleCommerce)
  assert.equal(scaleEvidence.lines.length, 12); checks += 1
  const scaleStorage = new MemoryStorage()
  const scaleLock = new ExclusiveLockManager()
  let sixRecordBytes = 0
  for (const [index, scaleLine] of scaleEvidence.lines.entries()) {
    await saveReview(scaleCommerce, {
      ...draft,
      batchId: `SCALE-BATCH-${String(index + 1).padStart(3, '0')}`,
      selectedLineDigests: [scaleLine.selectionId],
    }, scaleStorage, `2026-08-30T04:${String(index).padStart(2, '0')}:00.000Z`, scaleLock)
    if (index === 5) sixRecordBytes = new TextEncoder().encode(scaleStorage.value).byteLength
  }
  const twelveRecordBytes = new TextEncoder().encode(scaleStorage.value).byteLength
  assert.ok(twelveRecordBytes < sixRecordBytes * 2.2, `normalized 12-record bytes ${twelveRecordBytes} must remain linear from 6-record bytes ${sixRecordBytes}`); checks += 1
  assert.ok(twelveRecordBytes < firstUse.SHOP_BATCH_FIRST_USE_MAX_STORAGE_BYTES); checks += 1
  assert.equal((await firstUse.loadShopBatchProfitControlLocalReview(scaleCommerce, scaleStorage, localWorkspaceCapability, readLocalWorkspaceCapability)).recordCount, 12); checks += 1
  check(!scaleStorage.value.includes('workspaceHistorySnapshot') && !scaleStorage.value.includes('workspaceHistoryReceipt'), 'multi-record storage must keep reconstructed history out of persisted bytes')
  firstUseStorageEvidence = {
    exclusiveWriters: concurrentLock.requestsByName.get(`${firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY}.exclusive-write`),
    commerceSnapshotLocks: concurrentLock.requestsByName.get('supermega-commerce-workspace-v2'),
    maximumConcurrentTransactions: 1,
    sixRecordBytes,
    twelveRecordBytes,
    storageCeilingBytes: firstUse.SHOP_BATCH_FIRST_USE_MAX_STORAGE_BYTES,
    managedStorageTouches,
    wholeWorkspaceBackupCeilingBytes: localBackup.LOCAL_WORKSPACE_BACKUP_MAX_BYTES,
    backupBreakingAppendWritten: false,
    revokedLoadProjectionReturned: false,
    revokedSaveWritten: revokedSaveStorage.value !== null,
    staleProjectionRevived: false,
  }

  const correctedHistoryLoad = await firstUse.loadShopBatchProfitControlLocalReview(correctedSecondCommerce, storage, localWorkspaceCapability, readLocalWorkspaceCapability)
  assert.equal(correctedHistoryLoad.recordCount, 2); checks += 1
  assert.deepEqual(correctedHistoryLoad.projection, appended.projection, 'a corrected historical sale must not invalidate an unrelated current Batch append'); checks += 1

  const sampleCommerce = structuredClone(retainedCommerce)
  sampleCommerce.orders[0].completion.actionId = 'SETUP-SAMPLE-COMPLETE'
  const sampleEvidence = await firstUse.deriveShopBatchEligibleSaleLines(sampleCommerce)
  assert.equal(sampleEvidence.lines.length, 0); checks += 1
  assert.equal(sampleEvidence.blocked.sampleOrSynthetic, 1); checks += 1

  const incompleteCommerce = structuredClone(retainedCommerce)
  delete incompleteCommerce.orders[0].paymentReconciledAt
  const incompleteEvidence = await firstUse.deriveShopBatchEligibleSaleLines(incompleteCommerce)
  assert.equal(incompleteEvidence.lines.length, 0); checks += 1
  assert.equal(incompleteEvidence.blocked.incompleteEvidence, 1); checks += 1

  const tamperedStorage = new MemoryStorage()
  tamperedStorage.value = storage.value.replace('OWNER-BATCH-002', 'OWNER-BATCH-009')
  await assert.rejects(firstUse.loadShopBatchProfitControlLocalReview(secondCommerce, tamperedStorage, localWorkspaceCapability, readLocalWorkspaceCapability)); checks += 1
} finally {
  await vite.close()
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega.shop.batch_profit_control.ui_contract.v1',
  checks,
  defaultState: noBatch.state,
  authorityAllFalse: true,
  firstUseStorageEvidence,
}))
