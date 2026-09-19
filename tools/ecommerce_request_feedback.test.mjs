import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function reviewOrder(')
const end = source.indexOf('\n  async function openOperatorReview', start)
assert.ok(start >= 0 && end > start)
const handler = source.slice(start, end).replace('event: FormEvent<HTMLFormElement>', 'event')

async function run({ managed = false, failure = '', duplicate = false } = {}) {
  const result = { saved: 0, delivered: 0, notice: '', fresh: '', busy: false }
  const window = { location: { pathname: '/ecommerce/', search: '' } }
  Object.defineProperty(window, 'localStorage', { get() {
    if (failure === 'storage') throw new Error('storage unavailable')
    return {}
  } })
  const context = {
    window, Error, disabled: false, quoteBusy: false, quoteInFlight: { current: false }, recoveryBlocked: false,
    cart: [{ sku: 'SYNTHETIC' }], paymentPolicyReady: true,
    crypto: { randomUUID: () => 'synthetic' }, scope: 'local', sourcePreviewDigest: 'digest', preview: {},
    sourceStorefront: null, activeBuyingState: { requests: [], headDigest: 'head' },
    customerReference: 'synthetic', customerName: 'Example', customerPhone: '', fulfilment: 'pickup',
    effectivePaymentAdapter: 'cash', promotionCode: '',
    setQuoteBusy: value => { result.busy = value }, setNotice: value => { result.notice = value },
    buildEcommercePimProjection: async () => ({}), buildEcommerceCheckoutQuote: async () => ({}),
    buildEcommerceOrderRequestV2: async () => ({ id: 'REQUEST' }),
    saveEcommerceOrderRequestV2: async () => {
      if (failure === 'save') throw new Error('save unconfirmed')
      result.saved++; return {}
    },
    setBuyingState() {}, setRecoveryRead() {}, emitMetric() {},
    setFreshQuoteId: value => { result.fresh = value }, setQuoteClock() {}, setManagedConfirmation() {},
    onRecordManagedRequest: managed ? async () => {
      if (failure === 'delivery') throw new Error('delivery unconfirmed')
      result.delivered++
    } : undefined,
    confirmManagedRequest: async (request, callback) => { await callback(request); return 'confirmed' },
    recordBehaviorSignal() { if (failure === 'behavior') throw new Error('optional behavior failed') },
  }
  const invoke = runInNewContext(handler + '\nreviewOrder', context)
  const first = invoke({ preventDefault() {} })
  if (duplicate) await invoke({ preventDefault() {} })
  await first
  assert.equal(context.quoteInFlight.current, false, 'completion or failure releases the synchronous guard')
  return result
}
for (const managed of [false, true]) for (const failure of ['', 'storage', 'behavior']) {
  test(`retained request feedback: managed=${managed}, optional failure=${failure || 'none'}`, async () => {
    const result = await run({ managed, failure })
    assert.equal(result.saved, 1)
    assert.equal(result.delivered, managed ? 1 : 0)
    assert.equal(result.fresh, 'REQUEST')
    assert.equal(result.busy, false)
    assert.match(result.notice, managed ? /Company Shop inbox and local recovery/ : /saved on this device/)
  })
}
for (const failure of ['save', 'delivery']) {
  test(`real ${failure} failure is not hidden`, async () => {
    const result = await run({ managed: true, failure })
    assert.equal(result.saved, failure === 'save' ? 0 : 1)
    assert.equal(result.delivered, 0)
    assert.equal(result.fresh, '')
    assert.equal(result.busy, false)
    assert.match(result.notice, /unconfirmed/)
  })
}

for (const managed of [false, true]) {
  test(`same-render double submit starts one request: managed=${managed}`, async () => {
    const result = await run({ managed, duplicate: true })
    assert.equal(result.saved, 1)
    assert.equal(result.delivered, managed ? 1 : 0)
    assert.equal(result.fresh, 'REQUEST')
    assert.equal(result.busy, false)
  })
}

const handoffStart = source.indexOf('  async function openOperatorReview()')
const handoffEnd = source.indexOf('\n  return (', handoffStart)
assert.ok(handoffStart >= 0 && handoffEnd > handoffStart)
const handoffHandler = source.slice(handoffStart, handoffEnd)

for (const managed of [false, true]) {
  test(`Shop handoff is single-flight and recovers after failure: managed=${managed}`, async () => {
    let opened = 0
    let prepared = 0
    let fail = true
    const context = {
      Error, disabled: false, recoveryBlocked: false, latestRequestConfirmed: false,
      latestRequest: { id: 'REQUEST', quote: { pimDigest: 'pim' } },
      quoteCurrent: true, handoffBusy: false, handoffInFlight: { current: false },
      scope: 'local', sourcePreviewDigest: 'digest', preview: {}, activeBuyingState: {},
      currentCatalog: [], commerceState: {}, checkoutPaymentPolicies: [],
      setHandoffBusy() {}, setNotice() {}, emitMetric() {}, formatMmk: String,
      buildEcommercePimProjection: async () => ({ pimDigest: 'pim' }),
      prepareEcommerceShopDraftV2: async () => {
        prepared++
        if (fail) throw new Error('temporary failure')
        return { id: 'DRAFT', totalMmk: 100, pricing: { promotion: {}, tax: {} } }
      },
      onDraft: () => { opened++ },
      onOpenManagedRequest: managed ? () => { opened++ } : undefined,
    }
    const invoke = runInNewContext(handoffHandler + '\nopenOperatorReview', context)
    await invoke()
    assert.equal(opened, 0)
    assert.equal(context.handoffInFlight.current, false)
    fail = false
    const first = invoke()
    await invoke()
    await first
    assert.equal(prepared, 2, 'one failed attempt and one successful attempt')
    assert.equal(opened, 1)
    assert.equal(context.handoffInFlight.current, false)
    for (const blocker of ['disabled', 'recoveryBlocked', 'latestRequestConfirmed']) {
      context[blocker] = true
      await invoke()
      context[blocker] = false
    }
    assert.equal(prepared, 2, 'blocked workspace never prepares a handoff')
    assert.equal(opened, 1)
  })
}
