#!/usr/bin/env node
// Ecommerce request-to-review browser journey — ONE deterministic end-to-end run at
// a 390px phone viewport against the BUILT app (showroom/dist), driven over raw CDP.
//
// Why this exists: tools/journey_shop_cash_sale.mjs and
// tools/journey_plant_shift_release.mjs are the repo's first two automated browser
// journeys (ENTERPRISE-READINESS-SCORECARD §5). This is the third, on the product
// whose whole point is a handoff BETWEEN products: a customer's storefront request
// that only becomes an order once a named person reviews it in Shop. It follows
// docs/demo-playbooks/ecommerce.md §2-§3 (Shop guided setup first so the handoff has
// a Shop side to land in, then the Ecommerce sample) through the shipped review:
//
//   1. /settings/?product=shop      → business name → 'Create Shop and start selling'
//   2. /settings/?product=ecommerce → 'Create Ecommerce and open the store' → /ecommerce/
//      with the guided sample provisioned: the storefront draft, and ONE seeded customer
//      request (the fixed synthetic id, guided-sample-order.ts) that stops at
//      pending_shop_review with no Shop order referencing it
//   3. the checkout recovers the seeded cart and customer but offers NO handoff for it
//      (the shipped UI never keys a current quote on the sample's display-copy
//      reference, so the sample cannot be sent to Shop from the screen at all) → tap
//      'Add to cart' on a product the sample did not pick → name and phone → 'Send
//      order request' → a SECOND request with a generated ECI-<uuid> key, still
//      pending_shop_review; the sample request is untouched and Shop has no order yet
//   4. 'Open Shop operator review' → the app prepares a review_required draft in memory
//      and navigates to /shop/?tab=orders&source=ecommerce with the order composer open
//      on that request (payment locked, source link shown)
//   5. 'Review order' → the accountable gate ('Review Ecommerce order', evidence locked
//      to the request) → name the reviewer → 'Confirm change' → ONE confirmed Shop order
//      with sourceRecordId = the real request, reserve movements under a generated
//      ACT-<uuid> proof
//   6. reload on /ecommerce/ → the receipt re-derives 'Confirmed in Shop' with the Shop
//      order id from the persisted records; the sample request is byte-identical and
//      still has no order
//
// Where this journey stops and why: the Shop confirmation is the end of the
// request-to-review flow. What follows (preparing → ready → paid and handed over) is
// Shop's own fulfilment lifecycle, already covered by the Shop journey's settle. It
// is not driven here and nothing beyond the shipped UI is simulated.
//
// The CLAUDE.md rule this journey pins: a GUIDED Ecommerce request stops at
// pending_shop_review and must never fabricate a record that earns a proof counter.
// Sample records are identified by actionId prefix (ACT-DEMO-) or by the sample's
// fixed synthetic ids — never by actor string. The journey asserts (a) before any
// operator action the Shop workspace carries only ACT-DEMO- proofs and the one
// Ecommerce request is the fixed guided id at pending_shop_review with no order, and
// (b) after the operator's work exactly one order exists, it references the REAL
// request, its proof is a generated ACT-<uuid>, and the guided request is unchanged
// with still no order — the sample earned nothing.
//
// Every assertion is on STATE the app persists (the localStorage Shop workspace and
// the Ecommerce buying-lifecycle record) or on rendered text — never on pixels.
// Screenshots are diagnostic output on failure only.
//
// Contract with the environment:
//   - Zero dependencies: Node built-ins + Chromium's DevTools protocol over the
//     built-in WebSocket. The server, browser, CDP client, verified click/type and
//     diagnostics live in tools/journey_lib.mjs, shared with every tools/journey_*.mjs.
//   - Chromium is resolved from --chromium / $CHROMIUM_BIN / /opt/pw-browsers /
//     PATH (google-chrome, chromium, ...). Nothing is downloaded; it never runs
//     `playwright install`.
//   - Every run launches a FRESH temporary browser profile, so there is no service
//     worker, no cache and no localStorage from any earlier run; the journey asserts
//     that emptiness before it starts.
//   - Nothing here seeds a record. The only sample data is what the app's own
//     onboarding provisions. The request and the order the journey creates are made
//     through the real UI, exactly as a customer and a Shop reviewer would.
//
// Usage:
//   node tools/journey_ecommerce_request_review.mjs [--chromium /path/to/chrome] [--out-dir DIR]
// Exit 0 with a one-line JSON verdict on success; exit 1 with the failing step, the
// reason, and diagnostics (screenshot path, page text, stored workspace summary).

import {
  ACCOUNTABLE_ACTIONS_KEY,
  GUIDED_SAMPLE_PREFIX,
  LAST_OPERATOR_KEY,
  LOCAL_METRICS_KEY,
  PRODUCT_SETUPS_KEY,
  SETUP_KEY,
  WORKING_SAMPLE_PREFIX,
  reportFatal,
  runJourney,
} from './journey_lib.mjs'

const CONTRACT = 'supermega.ecommerce-request-review-journey.v1'
const LABEL = 'ECOMMERCE REQUEST-REVIEW JOURNEY'
const BUSINESS_NAME = 'Journey Test Store'
const CUSTOMER_NAME = 'Journey customer'
const CUSTOMER_PHONE = '09 700 000 001'
const REVIEWER = 'Journey reviewer'
const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
// showroom/src/products/ecommerce/local-merchandising-import.ts: the browser-local
// buying scope and its storage key; storefront-draft.ts: the local draft key.
const BUYING_KEY = 'supermega.ecommerce.buying_lifecycle.v1.ecommerce%3Alocal'
const BUYING_SCOPE = 'ecommerce:local'
const STOREFRONT_DRAFT_KEY = 'supermega.ecommerce.storefront_draft.v2.local'
// guided-sample-order.ts: the fixed, obviously-synthetic checkout key of the seeded
// request, and the storefront action id the sample stamps on it.
const GUIDED_CHECKOUT_KEY = 'ECI-5A4D0000-0000-4000-8000-000000000001'
const GUIDED_REQUEST_ID = `ECR-${GUIDED_CHECKOUT_KEY.slice(4)}`
const GUIDED_STOREFRONT_ACTION_ID = 'demo-working-sample'
const UUID_TAIL = '[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}'
const REAL_CHECKOUT_KEY = new RegExp(`^ECI-${UUID_TAIL}$`)
const REAL_ACTION_ID = new RegExp(`^ACT-${UUID_TAIL}$`)
const ORDER_ID = new RegExp(`^ORD-${UUID_TAIL}$`)
const DIGEST = /^sha256:[0-9a-f]{64}$/

// The buying record is re-serialised in canonical key order on every save
// (ecommerce-buying-lifecycle.ts canonicalJson), so "unchanged" is a comparison of
// content, not of the stored byte order.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

const gateExpr = `(() => {
  const d = document.querySelector('dialog.accountable-action-gate[open]');
  if (!d) return null;
  const inputs = Array.from(d.querySelectorAll('form input'));
  return {
    eyebrow: (d.querySelector('.core-eyebrow') || {}).textContent,
    title: (d.querySelector('#action-confirm-title') || {}).textContent,
    values: inputs.map((i) => i.value),
    readonly: inputs.map((i) => i.readOnly),
  };
})()`

const receiptExpr = `(() => {
  const r = document.querySelector('#ecommerce-buying-workspace .ecommerce-quote-receipt[data-current="true"]');
  if (!r) return null;
  return {
    pill: (r.querySelector('.status-pill') || {}).textContent,
    heading: (r.querySelector(':scope > strong') || {}).textContent,
    total: (r.querySelector(':scope > b') || {}).textContent,
    reference: (r.querySelector(':scope > small') || {}).textContent,
    buttons: Array.from(r.querySelectorAll('button')).map((b) => b.textContent.trim()),
  };
})()`

runJourney({
  contract: CONTRACT,
  label: LABEL,
  profilePrefix: 'ecommerce-journey',
  workspaceKey: COMMERCE_KEY,
  summarizeWorkspace: (workspace) => ({
    items: workspace.items.map((item) => ({ sku: item.sku, onHand: item.onHand, price: item.price })),
    orders: workspace.orders.map((order) => ({ id: order.id, status: order.status, channel: order.channel, sourceRecordId: order.sourceRecordId, total: order.total })),
    movements: workspace.movements.map((m) => ({ kind: m.kind, actionId: m.actionId, orderId: m.orderId })),
    storefrontRequests: (workspace.storefrontRequests || []).length,
  }),
}, async (j) => {
  const expected = {}

  // Reads the persisted Shop workspace, checking the schema every time.
  async function readCommerce() {
    const state = await j.readJson(COMMERCE_KEY)
    j.expect(state && state.schema === COMMERCE_KEY, `${COMMERCE_KEY} missing or wrong schema`)
    return state
  }

  // Reads the persisted Ecommerce buying-lifecycle record and checks its
  // append-only invariant every time: revision === events.length, one head digest.
  async function readBuying() {
    const state = await j.readJson(BUYING_KEY)
    j.expect(state && state.schema === 'supermega.ecommerce.buying_lifecycle.v1' && state.scope === BUYING_SCOPE,
      `${BUYING_KEY} missing or wrong schema/scope`)
    j.expect(state.revision === state.events.length, `buying revision ${state.revision} does not equal the ${state.events.length} appended events`)
    j.expect(DIGEST.test(state.headDigest), `buying head digest is ${JSON.stringify(state.headDigest)}`)
    return state
  }

  // Which orders, if any, reference a request. The sample must never gain one.
  function ordersFor(commerce, requestId) {
    return commerce.orders.filter((order) => order.sourceRecordId === requestId)
  }

  function startHere() {
    return j.evaluate(`(() => {
      const panel = document.querySelector('.ecommerce-today');
      if (!panel) return null;
      return {
        headline: (panel.querySelector('h2') || {}).textContent,
        action: (panel.querySelector('.ecommerce-today-priority button') || {}).textContent,
        source: (panel.querySelector('.ecommerce-today-source span') || {}).textContent,
      };
    })()`)
  }

  await j.step('fresh-origin', async () => {
    await j.navigate('/settings/?product=shop')
    // The app writes housekeeping keys on first paint (theme, local metrics, the
    // Plant seed). What proves a fresh origin is that no Shop workspace, no setup
    // record, no Ecommerce storefront draft and no Ecommerce buying record exist
    // before onboarding — the keys this journey goes on to assert against.
    const fresh = await j.evaluate(`(async () => ({
      business: [${JSON.stringify(COMMERCE_KEY)}, ${JSON.stringify(SETUP_KEY)}, ${JSON.stringify(PRODUCT_SETUPS_KEY)}, ${JSON.stringify(BUYING_KEY)}, ${JSON.stringify(STOREFRONT_DRAFT_KEY)}, ${JSON.stringify(LAST_OPERATOR_KEY)}]
        .filter((key) => window.localStorage.getItem(key) !== null),
      keys: Object.keys(window.localStorage).sort(),
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      viewport: window.innerWidth,
    }))()`)
    j.expect(fresh.business.length === 0, `a fresh profile already carries ${fresh.business.join(', ')} — this run is contaminated by a previous one`)
    j.expect(fresh.viewport === j.viewport.width, `expected a ${j.viewport.width}px viewport, got ${fresh.viewport}`)
    return { browser: j.browser, profile: j.userDataDir, keysWrittenByFirstPaint: fresh.keys, serviceWorkers: fresh.workers }
  })

  await j.step('setup-shop-first', async () => {
    // Playbook §2.1: run the Shop guided setup first so the handoff has a Shop side
    // to land in; the two samples share the browser workspace.
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await j.type('input[autocomplete="organization"]', null, BUSINESS_NAME, 'Business name')
    const submit = await j.click('form.product-onboarding-form button[type="submit"]', null, 'the Shop setup submit button')
    j.expect(submit.text === 'Create Shop and start selling', `Shop setup submit reads ${JSON.stringify(submit.text)}`)
    await j.waitUntil(`location.pathname === '/shop/' && new URLSearchParams(location.search).get('tab') === 'counter'`, 'navigation to /shop/?tab=counter')
    await j.waitUntil(`document.querySelectorAll('button.shop-product-tile').length > 1`, 'the counter tiles')
    const commerce = await readCommerce()
    j.expect(commerce.orders.length === 0, `expected no Shop orders before the journey, found ${commerce.orders.length}`)
    j.expect((commerce.storefrontRequests || []).length === 0, 'the Shop workspace already carries storefront requests')
    const baselines = commerce.catalogBaselines || []
    j.expect(baselines.length > 0 && baselines.every((b) => b.proof?.actionId?.startsWith(WORKING_SAMPLE_PREFIX)),
      'the provisioned catalog is not the guided working sample (catalog baselines lack the ACT-DEMO-WORKING-SAMPLE- prefix)')
    j.expect(commerce.movements.every((m) => m.actionId.startsWith(GUIDED_SAMPLE_PREFIX)),
      `a Shop movement without the guided-sample prefix exists before any operator action: ${JSON.stringify(commerce.movements.map((m) => m.actionId))}`)
    expected.catalog = Object.fromEntries(commerce.items.map((item) => [item.sku, { name: item.name, price: item.price, onHand: item.onHand }]))
    return { items: commerce.items.length, sampleMovements: commerce.movements.length }
  })

  await j.step('setup-ecommerce', async () => {
    await j.navigate('/settings/?product=ecommerce')
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    // The name is carried over from the Shop setup; typing replaces it with the same
    // name so the store is named deterministically either way.
    await j.type('input[autocomplete="organization"]', null, BUSINESS_NAME, 'Business name')
    const submit = await j.click('form.product-onboarding-form button[type="submit"]', null, 'the Ecommerce setup submit button')
    j.expect(submit.text === 'Create Ecommerce and open the store', `Ecommerce setup submit reads ${JSON.stringify(submit.text)}, expected "Create Ecommerce and open the store" (playbook §2.4)`)
    await j.waitUntil(`location.pathname === '/ecommerce/'`, 'navigation to /ecommerce/')
  })

  await j.step('store-opens-with-sample-request', async () => {
    const eyebrow = await j.waitUntil(`(() => { const e = Array.from(document.querySelectorAll('.core-eyebrow')).find((n) => n.textContent === 'Sample store' || n.textContent === 'Company store'); return e ? e.textContent : null; })()`, 'the store header eyebrow')
    j.expect(eyebrow === 'Sample store', `store header eyebrow reads ${JSON.stringify(eyebrow)} (playbook §2.5)`)
    await j.waitUntil(`document.querySelectorAll('.storefront-grid article').length > 0`, 'the storefront product grid')
    const draft = await j.readJson(STOREFRONT_DRAFT_KEY)
    j.expect(draft && draft.schema === 'supermega.ecommerce.storefront_draft.v2' && draft.scope === 'local' && draft.revision >= 1,
      `the local storefront draft is ${JSON.stringify(draft && { schema: draft.schema, scope: draft.scope, revision: draft.revision })}`)
    j.expect(draft.storeName === BUSINESS_NAME, `the storefront is named ${JSON.stringify(draft.storeName)}, expected the typed business name`)
    j.expect(DIGEST.test(draft.sourcePreviewDigest), `storefront draft digest is ${JSON.stringify(draft.sourcePreviewDigest)}`)
    const buying = await readBuying()
    // (a) The guided sample: exactly ONE seeded request, the fixed synthetic id, at
    // pending_shop_review, stamped with the sample storefront action id, and not one
    // follow-up intent of any kind. Identified by id and prefix — never by the
    // 'Guided sample customer' actor string, which is display copy.
    j.expect(buying.requests.length === 1, `expected the one seeded request, found ${buying.requests.length}`)
    const [sample] = buying.requests
    j.expect(sample.id === GUIDED_REQUEST_ID && sample.idempotencyKey === GUIDED_CHECKOUT_KEY,
      `the seeded request is ${sample.id} / ${sample.idempotencyKey}, expected the fixed guided ids`)
    j.expect(sample.state === 'pending_shop_review' && sample.mode === 'browser-local-request',
      `the seeded request is ${sample.state}/${sample.mode} — a guided Ecommerce request must stop at pending_shop_review`)
    j.expect(sample.sourceStorefrontActionId === GUIDED_STOREFRONT_ACTION_ID && sample.sourceStorefrontRevision === draft.revision,
      `the seeded request cites storefront ${JSON.stringify(sample.sourceStorefrontActionId)} r${sample.sourceStorefrontRevision}, expected ${GUIDED_STOREFRONT_ACTION_ID} r${draft.revision}`)
    j.expect(sample.sourcePreviewDigest === draft.sourcePreviewDigest, 'the seeded request does not cite the saved storefront digest')
    j.expect(sample.quote.payment.status === 'not_authorized' && sample.quote.payment.amountMmk === 0,
      `the seeded quote's payment is ${JSON.stringify(sample.quote.payment)} — a sample must not authorize anything`)
    j.expect(buying.events.length === 1 && buying.events[0].action === 'request_recorded' && buying.events[0].subjectId === GUIDED_REQUEST_ID,
      `the seeded record's events are ${JSON.stringify(buying.events.map((e) => [e.action, e.subjectId]))}`)
    const intents = ['returnIntents', 'supportIntents', 'correctionIntents', 'cancellationIntents', 'cancellationDecisions', 'amendmentIntents', 'rescheduleIntents']
    j.expect(intents.every((key) => Array.isArray(buying[key]) && buying[key].length === 0), 'the seeded record carries follow-up intents')
    const commerce = await readCommerce()
    j.expect(ordersFor(commerce, GUIDED_REQUEST_ID).length === 0 && commerce.orders.length === 0,
      'the guided sample already has a Shop order — a sample must never advance past pending_shop_review')
    for (const line of sample.lines) {
      const item = expected.catalog[line.sku]
      j.expect(item && item.price === line.unitPriceMmk && item.onHand >= line.quantity, `sample line ${JSON.stringify(line)} does not match the Shop catalog ${JSON.stringify(item)}`)
    }
    expected.sample = sample
    expected.sampleJson = canonical(sample)
    expected.storefrontDigest = draft.sourcePreviewDigest
    const today = await j.waitUntil(`(() => { const p = document.querySelector('.ecommerce-today'); const h = p && p.querySelector('h2'); return h && h.textContent === 'Request sent to Shop' ? h.textContent : null; })()`, 'Start here to report the recovered sample request')
    const panel = await startHere()
    j.expect(panel.action === 'View request receipt', `Start here action reads ${JSON.stringify(panel.action)}`)
    j.expect(panel.source === 'Current local Shop catalog', `Start here source reads ${JSON.stringify(panel.source)} — the storefront must read the Shop catalog, not a second stock system`)
    // The recovered sample on screen: its cart lines and customer, the recovery
    // notice, and NO handoff button. The shipped UI never offers 'Open Shop operator
    // review' for the seeded request (its customerReference is display copy, not the
    // name · phone pair a current quote is keyed on), so the sample cannot be handed
    // to Shop from here at all — the CLAUDE.md rule, enforced by construction.
    const recovered = await j.waitUntil(`(() => {
      const d = document.getElementById('ecommerce-buying-workspace');
      if (!d || !d.open) return null;
      const lines = Array.from(d.querySelectorAll('.ecommerce-cart-line')).map((l) => ({ name: (l.querySelector('strong') || {}).textContent, quantity: (l.querySelector('input') || {}).value }));
      if (lines.length !== ${sample.lines.length}) return null;
      return {
        lines,
        name: (d.querySelector('form input[autocomplete="name"]') || {}).value,
        phone: (d.querySelector('form input[autocomplete="tel"]') || {}).value,
        notice: (d.querySelector('.ecommerce-buying-notice') || {}).textContent,
        stale: (d.querySelector('.ecommerce-stale-quote strong') || {}).textContent || null,
        handoff: Boolean(window.__journey.q('#ecommerce-buying-workspace button', 'Open Shop operator review')),
        receipt: ${receiptExpr},
        tracking: Array.from(d.querySelectorAll('.ecommerce-order-history article')).map((a) => ({ id: (a.querySelector('small') || {}).textContent, stage: (a.querySelector('strong') || {}).textContent, payment: Array.from(a.querySelectorAll('div small')).map((n) => n.textContent) })),
      };
    })()`, 'the checkout to recover the seeded request')
    j.expect(JSON.stringify(recovered.lines.map((line) => [line.name, line.quantity])) === JSON.stringify(sample.lines.map((line) => [line.name, String(line.quantity)])),
      `the recovered cart is ${JSON.stringify(recovered.lines)}, expected the sample lines ${JSON.stringify(sample.lines.map((line) => [line.name, line.quantity]))}`)
    j.expect(recovered.name === sample.customerProfile?.name && recovered.phone === sample.customerProfile?.phone, `the recovered customer is ${JSON.stringify([recovered.name, recovered.phone])}`)
    j.expect(recovered.notice === `${GUIDED_REQUEST_ID} recovered on this device. It remains waiting for Shop review.`, `the checkout notice reads ${JSON.stringify(recovered.notice)}`)
    j.expect(recovered.stale === 'Cart changed — review a new total' && recovered.receipt === null && recovered.handoff === false,
      `the seeded request is offered to Shop: ${JSON.stringify({ stale: recovered.stale, receipt: recovered.receipt, handoff: recovered.handoff })} — a guided request must not be handable to Shop`)
    j.expect(recovered.tracking.length === 1 && recovered.tracking[0].id === GUIDED_REQUEST_ID && recovered.tracking[0].stage === 'Waiting for Shop review' && recovered.tracking[0].payment.includes('Payment not charged'),
      `Your orders lists ${JSON.stringify(recovered.tracking)}`)
    return { headline: today, sampleRequestId: sample.id, sampleLines: sample.lines.map((line) => [line.sku, line.quantity]), storefrontRevision: draft.revision }
  })

  await j.step('add-to-cart', async () => {
    // Playbook §3.2: tap 'Add to cart'. The sample's recovered cart already holds the
    // seeded lines; a product the sample did not pick makes this visibly a NEW
    // request, and the button flips to 'In cart'.
    const before = await j.evaluate(`Array.from(document.querySelectorAll('.storefront-grid article')).map((a) => ({
      name: (a.querySelector('strong') || {}).textContent, price: (a.querySelector('span') || {}).textContent,
      availability: (a.querySelector('b') || {}).textContent, button: (a.querySelector('button') || {}).textContent || null, requested: a.dataset.requested,
    }))`)
    const inCart = before.filter((a) => a.button === 'In cart')
    j.expect(inCart.length === expected.sample.lines.length, `the storefront shows ${inCart.length} products in cart for the ${expected.sample.lines.length} recovered sample lines`)
    const candidate = before.find((a) => a.button === 'Add to cart')
    j.expect(candidate, `no available product outside the sample cart to add: ${JSON.stringify(before)}`)
    j.expect(candidate.availability === 'Available', `the product to add reads ${JSON.stringify(candidate.availability)}`)
    await j.click('.storefront-grid article button.storefront-request-button', 'Add to cart', `Add to cart on ${candidate.name}`)
    const after = await j.waitUntil(`(() => {
      const a = Array.from(document.querySelectorAll('.storefront-grid article')).find((n) => (n.querySelector('strong') || {}).textContent === ${JSON.stringify(candidate.name)});
      const b = a && a.querySelector('button');
      return b && b.textContent === 'In cart' && a.dataset.requested === 'true' ? { requested: a.dataset.requested } : null;
    })()`, `the ${candidate.name} tile to flip to 'In cart'`)
    const summary = await j.waitUntil(`(() => {
      const d = document.getElementById('ecommerce-buying-workspace');
      if (!d || !d.open) return null;
      const lines = Array.from(d.querySelectorAll('.ecommerce-cart-line')).map((l) => ({ name: (l.querySelector('strong') || {}).textContent, quantity: (l.querySelector('input') || {}).value, total: (l.querySelector('b') || {}).textContent }));
      return lines.length === ${expected.sample.lines.length + 1} ? { badge: (d.querySelector('summary b') || {}).textContent, lines } : null;
    })()`, 'the open cart with one more line than the sample')
    j.expect(summary.badge.startsWith(`${expected.sample.lines.length + 1} items · `), `cart summary reads ${JSON.stringify(summary.badge)}`)
    const added = summary.lines.find((line) => line.name === candidate.name)
    j.expect(added && added.quantity === '1', `the added line is ${JSON.stringify(added)}`)
    // The sample quote is no longer current, so the app asks for a new total.
    const stale = await j.waitUntil(`(document.querySelector('#ecommerce-buying-workspace .ecommerce-stale-quote strong') || {}).textContent`, 'the stale-quote notice')
    j.expect(stale === 'Cart changed — review a new total', `stale notice reads ${JSON.stringify(stale)}`)
    expected.addedName = candidate.name
    expected.addedPriceText = candidate.price
    return { added: candidate.name, cart: summary.lines.map((line) => [line.name, line.quantity]), ...after }
  })

  await j.step('send-order-request', async () => {
    // Playbook §3.4: Name and Phone, pickup, the sample payment notice; then §3.5.
    const form = '#ecommerce-buying-workspace form'
    await j.type(`${form} input[autocomplete="name"]`, null, CUSTOMER_NAME, 'the customer Name field')
    await j.type(`${form} input[autocomplete="tel"]`, null, CUSTOMER_PHONE, 'the customer Phone field')
    const choices = await j.evaluate(`(() => {
      const selects = Array.from(document.querySelectorAll(${JSON.stringify(form)} + ' select'));
      const notice = window.__journey.q(${JSON.stringify(form)} + ' .form-notice[role="status"]');
      return { values: selects.map((s) => s.value), labels: selects.map((s) => s.selectedOptions[0] && s.selectedOptions[0].textContent), notice: notice ? notice.textContent : null };
    })()`)
    j.expect(choices.values[0] === 'pickup' && choices.labels[0] === 'Pickup · included', `Receive order reads ${JSON.stringify(choices.labels[0])}`)
    j.expect(choices.values[1] === 'pay_on_pickup', `payment adapter is ${JSON.stringify(choices.values[1])}`)
    // The payment methods come from Shop's own configured policies when it has any
    // (the Shop sample installs them); only a Shop with none falls back to the
    // browser-local sample payment and says so (playbook §4).
    const shopBefore = await readCommerce()
    const shopPaymentPolicies = (shopBefore.paymentPolicies || []).length
    j.expect(shopPaymentPolicies > 0 ? choices.notice === null : choices.notice === 'Browser-local sample payment. No charge or payment-provider request is made.',
      `payment notice reads ${JSON.stringify(choices.notice)} with ${shopPaymentPolicies} Shop payment policies`)
    const send = await j.click(`${form} button[type="submit"]`, null, 'Send order request')
    j.expect(send.text === 'Send order request', `submit reads ${JSON.stringify(send.text)}`)
    const receipt = await j.waitUntil(`(() => { const r = ${receiptExpr}; return r && r.pill === 'Request sent' && !r.reference.includes(${JSON.stringify(GUIDED_REQUEST_ID)}) ? r : null; })()`, 'a Request sent receipt for the new request')
    const buying = await readBuying()
    j.expect(buying.requests.length === 2, `expected the sample plus one real request, found ${buying.requests.length}`)
    const [request, sample] = buying.requests
    j.expect(canonical(sample) === expected.sampleJson, 'the guided sample request changed when the real request was recorded')
    j.expect(REAL_CHECKOUT_KEY.test(request.idempotencyKey) && request.idempotencyKey !== GUIDED_CHECKOUT_KEY && request.id === `ECR-${request.idempotencyKey.slice(4)}`,
      `the real request's ids are ${request.id} / ${request.idempotencyKey} — a real UI action must carry a generated key, never the sample's`)
    j.expect(request.state === 'pending_shop_review' && request.scope === BUYING_SCOPE && request.mode === 'browser-local-request',
      `the real request is ${request.state}/${request.scope}/${request.mode}`)
    j.expect(request.sourceStorefrontActionId === null && request.sourceStorefrontRevision === null,
      `a browser-local request cites storefront ${JSON.stringify(request.sourceStorefrontActionId)} — only a managed store has a saved storefront action`)
    j.expect(request.sourcePreviewDigest === expected.storefrontDigest, 'the real request does not cite the saved storefront digest')
    j.expect(request.customerReference === `${CUSTOMER_NAME} · ${CUSTOMER_PHONE}` && request.customerProfile?.name === CUSTOMER_NAME && request.customerProfile?.phone === CUSTOMER_PHONE,
      `the real request names ${JSON.stringify(request.customerReference)} / ${JSON.stringify(request.customerProfile)}`)
    j.expect(request.fulfilment === 'pickup' && !request.deliveryAddress, `the real request is ${request.fulfilment} with address ${JSON.stringify(request.deliveryAddress)}`)
    j.expect(request.quote.payment.adapter === 'pay_on_pickup' && request.quote.payment.status === 'not_authorized' && request.quote.payment.amountMmk === 0,
      `the real quote's payment is ${JSON.stringify(request.quote.payment)} — nothing is authorized before Shop`)
    j.expect(request.lines.length === expected.sample.lines.length + 1, `the real request has ${request.lines.length} lines`)
    for (const sampleLine of expected.sample.lines) {
      const line = request.lines.find((candidate) => candidate.sku === sampleLine.sku)
      j.expect(line && line.quantity === sampleLine.quantity && line.unitPriceMmk === sampleLine.unitPriceMmk, `recovered line ${sampleLine.sku} became ${JSON.stringify(line)}`)
    }
    const addedLine = request.lines.find((line) => !expected.sample.lines.some((sampleLine) => sampleLine.sku === line.sku))
    j.expect(addedLine && addedLine.quantity === 1 && addedLine.name === expected.addedName, `the added line is ${JSON.stringify(addedLine)}, expected ${expected.addedName} × 1`)
    j.expect(expected.addedPriceText === `${addedLine.unitPriceMmk.toLocaleString()} MMK`, `the storefront showed ${JSON.stringify(expected.addedPriceText)} for a line quoted at ${addedLine.unitPriceMmk}`)
    const total = request.lines.reduce((sum, line) => sum + line.unitPriceMmk * line.quantity, 0)
    j.expect(request.totalMmk === total && request.quote.totalMmk === total, `the real request totals ${request.totalMmk}/${request.quote.totalMmk}, lines sum to ${total}`)
    j.expect(Date.parse(request.quote.expiresAt) - Date.parse(request.quote.quotedAt) === 15 * 60_000, 'the quote is not the deterministic 15-minute quote (playbook §3.5)')
    j.expect(buying.events.length === 2 && buying.events[0].subjectId === GUIDED_REQUEST_ID && buying.events[1].subjectId === request.id && buying.events[1].previousDigest === buying.events[0].eventDigest,
      `the buying events are ${JSON.stringify(buying.events.map((e) => [e.sequence, e.action, e.subjectId]))}`)
    // Shop is untouched by a request: no order, no reservation, no storefront request.
    const commerce = await readCommerce()
    j.expect(commerce.orders.length === 0 && (commerce.storefrontRequests || []).length === 0 && commerce.movements.every((m) => m.actionId.startsWith(GUIDED_SAMPLE_PREFIX)),
      'sending the request changed the Shop workspace — nothing goes to Shop until the operator reviews it')
    j.expect(receipt.heading === `Request for ${request.customerReference}` && receipt.total === `${total.toLocaleString()} MMK` && receipt.reference.startsWith(`Reference ${request.id} · quote valid until `),
      `the receipt reads ${JSON.stringify(receipt)}`)
    j.expect(receipt.buttons.includes('Open Shop operator review'), `the receipt offers ${JSON.stringify(receipt.buttons)}`)
    const notice = await j.evaluate(`(document.querySelector('#ecommerce-buying-workspace .ecommerce-buying-notice') || {}).textContent`)
    j.expect(notice === 'This sample order request is saved on this device for Shop review. No order, stock, message, or charge changed.', `the checkout notice reads ${JSON.stringify(notice)}`)
    const metrics = (await j.readJson(LOCAL_METRICS_KEY)) || { events: [] }
    const count = (action) => (metrics.events || []).filter((entry) => entry.action === action).length
    j.expect(count('quote.captured') === 1 && count('order.request.submitted') === 1, `local metrics: quote.captured ×${count('quote.captured')}, order.request.submitted ×${count('order.request.submitted')}`)
    expected.request = request
    expected.requestJson = canonical(request)
    expected.total = total
    expected.units = request.lines.reduce((sum, line) => sum + line.quantity, 0)
    return { requestId: request.id, lines: request.lines.map((line) => [line.sku, line.quantity]), total, shopPaymentPolicies }
  })

  await j.step('open-shop-operator-review', async () => {
    // The app prepares the review_required draft in memory and carries it to Shop in
    // navigation state (playbook §3.6). No reload here: the draft is deliberately not
    // persisted — a request only becomes durable Shop data through the gate below.
    await j.click('#ecommerce-buying-workspace .ecommerce-quote-receipt[data-current="true"] button', 'Open Shop operator review', 'Open Shop operator review')
    await j.waitUntil(`location.pathname === '/shop/' && new URLSearchParams(location.search).get('tab') === 'orders' && new URLSearchParams(location.search).get('source') === 'ecommerce'`, 'navigation to /shop/?tab=orders&source=ecommerce')
    const composer = await j.waitUntil(`(() => {
      const source = document.querySelector('.channel-source-ready');
      if (!source) return null;
      const form = document.getElementById('commerce-manual-order-form');
      if (!form) return null;
      const field = (selector) => (form.querySelector(selector) || {}).value;
      return {
        eyebrow: (source.querySelector('.core-eyebrow') || {}).textContent,
        requestId: (source.querySelector('strong') || {}).textContent,
        detail: (source.querySelector('small') || {}).textContent,
        customer: field('input[maxlength="80"]'),
        fulfilment: field('select[required]'),
        handoffReference: field('input[maxlength="160"]'),
        promise: field('#commerce-order-promise'),
        payment: (document.querySelector('.order-ecommerce-payment select') || {}).value,
        total: (form.querySelector('.order-total strong') || {}).textContent,
        units: (form.querySelector('.order-total span') || {}).textContent,
        review: (document.querySelector('button[form="commerce-manual-order-form"]') || {}).textContent,
      };
    })()`, 'the order composer prepared on the Ecommerce request')
    j.expect(composer.eyebrow === 'Ecommerce request' && composer.requestId === expected.request.id, `the composer's source reads ${JSON.stringify([composer.eyebrow, composer.requestId])}`)
    j.expect(composer.detail.endsWith('pickup · price locked · payment not authorized · no stock reserved'), `the source detail reads ${JSON.stringify(composer.detail)}`)
    j.expect(composer.customer === CUSTOMER_NAME && composer.fulfilment === 'pickup' && composer.handoffReference === expected.request.id,
      `the composer holds ${JSON.stringify({ customer: composer.customer, fulfilment: composer.fulfilment, handoffReference: composer.handoffReference })}`)
    j.expect(composer.promise, 'the composer offered no promise time')
    // Shop's label for the pay_on_pickup adapter (ecommercePaymentLabel) is 'Cash'.
    j.expect(composer.payment === 'Cash', `the locked payment policy reads ${JSON.stringify(composer.payment)}, expected Shop's 'Cash' label for pay_on_pickup`)
    j.expect(composer.total === `${expected.total.toLocaleString()} MMK` && composer.units.startsWith(`${expected.request.lines.length} items · ${expected.units} units`),
      `the composer totals ${JSON.stringify([composer.units, composer.total])}`)
    j.expect(composer.review === 'Review order', `the composer's primary action reads ${JSON.stringify(composer.review)}`)
    // Still nothing in Shop: preparing the review is not the review.
    const commerce = await readCommerce()
    j.expect(commerce.orders.length === 0, 'opening the operator review created a Shop order before anyone confirmed it')
    const metrics = (await j.readJson(LOCAL_METRICS_KEY)) || { events: [] }
    j.expect((metrics.events || []).filter((entry) => entry.action === 'shop.handoff.reached').length === 1, 'the shop.handoff.reached metric was not recorded once')
    return { requestId: composer.requestId, payment: composer.payment, total: composer.total }
  })

  await j.step('confirm-in-shop', async () => {
    await j.click('button[form="commerce-manual-order-form"]', 'Review order', 'Review order')
    const gate = await j.waitUntil(gateExpr, 'the accountable order gate')
    j.expect(gate.eyebrow === 'Confirm change', `gate eyebrow reads ${JSON.stringify(gate.eyebrow)}`)
    j.expect(gate.title === 'Review Ecommerce order', `gate title reads ${JSON.stringify(gate.title)}, expected "Review Ecommerce order"`)
    j.expect(gate.values[0] === 'Shop reviewer', `gate name defaults to ${JSON.stringify(gate.values[0])}, expected the role placeholder "Shop reviewer"`)
    j.expect(gate.values[1] === 'Customer request reviewed against the current Shop catalog.', `gate reason reads ${JSON.stringify(gate.values[1])}`)
    j.expect(gate.values[2].startsWith(`ECOMMERCE:${expected.request.id}:${expected.request.sourcePreviewDigest}:${expected.request.quote.quoteDigest}:${BUYING_SCOPE}:LOC-MAIN:ecommerce>commerce:human_review_required:`) && gate.readonly[2] === true,
      `the gate's evidence reference is ${JSON.stringify(gate.values[2])} (readonly ${gate.readonly[2]}), expected the locked reference bound to the request and its quote digest`)
    expected.evidenceReference = gate.values[2]
    // The name is the accountability: a real person replaces the role placeholder.
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, REVIEWER, 'the gate name field')
    const submit = await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Confirm change')
    // bi() renders bilingual labels ('Confirm change · အတည်ပြုမည်'); match the English head.
    j.expect(submit.text.startsWith('Confirm change'), `gate submit reads ${JSON.stringify(submit.text)}`)
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]')`, 'the gate to close after the order was created')
    const commerce = await j.waitUntil(`(() => {
      const raw = window.__journey.read(${JSON.stringify(COMMERCE_KEY)});
      if (!raw) return null;
      const state = JSON.parse(raw);
      return state.orders.length === 1 ? state : null;
    })()`, 'exactly one order in the stored Shop workspace')
    const [order] = commerce.orders
    j.expect(ORDER_ID.test(order.id), `order id is ${JSON.stringify(order.id)}`)
    j.expect(order.sourceRecordId === expected.request.id, `the order references ${JSON.stringify(order.sourceRecordId)}, expected the real request ${expected.request.id}`)
    j.expect(order.evidenceReference === expected.evidenceReference, `the order's evidence is ${JSON.stringify(order.evidenceReference)}`)
    j.expect(order.channel === 'Ecommerce' && order.status === 'confirmed' && order.paymentStatus === 'pending' && order.refundStatus === 'none',
      `the order is ${JSON.stringify({ channel: order.channel, status: order.status, paymentStatus: order.paymentStatus, refundStatus: order.refundStatus })}`)
    j.expect(order.customer === CUSTOMER_NAME && order.owner === REVIEWER, `the order names customer ${JSON.stringify(order.customer)} and owner ${JSON.stringify(order.owner)}`)
    j.expect(order.fulfilment === 'pickup' && order.fulfilmentReference === expected.request.id && order.payment === 'Cash',
      `the order's handoff is ${JSON.stringify({ fulfilment: order.fulfilment, fulfilmentReference: order.fulfilmentReference, payment: order.payment })}`)
    j.expect(order.total === expected.total && order.quantity === expected.units, `the order totals ${order.total} for ${order.quantity} units, expected ${expected.total} for ${expected.units}`)
    const orderLines = Object.fromEntries((order.lines || []).map((line) => [line.sku, line.quantity]))
    j.expect(expected.request.lines.every((line) => orderLines[line.sku] === line.quantity) && Object.keys(orderLines).length === expected.request.lines.length,
      `the order lines are ${JSON.stringify(orderLines)}, expected the request's ${JSON.stringify(expected.request.lines.map((line) => [line.sku, line.quantity]))}`)
    // (b) The real proof: reserve movements under ONE generated ACT-<uuid>, never the
    // guided prefix, and the sample request still has no order.
    const reserves = commerce.movements.filter((m) => m.orderId === order.id)
    j.expect(reserves.length === expected.request.lines.length && reserves.every((m) => m.kind === 'reserve'),
      `expected ${expected.request.lines.length} reserve movements for ${order.id}, found ${JSON.stringify(reserves.map((m) => [m.kind, m.sku]))}`)
    const actionIds = [...new Set(reserves.map((m) => m.actionId))]
    j.expect(actionIds.length === 1 && REAL_ACTION_ID.test(actionIds[0]) && !actionIds[0].startsWith(GUIDED_SAMPLE_PREFIX),
      `the reservation was recorded under ${JSON.stringify(actionIds)} — a real review must carry one generated proof, never the guided-sample prefix`)
    j.expect(reserves.every((m) => m.actor === REVIEWER && m.reason && m.evidenceReference === expected.evidenceReference), 'reserve movements are missing their proof (actor/reason/evidence)')
    for (const line of expected.request.lines) {
      const item = commerce.items.find((candidate) => candidate.sku === line.sku)
      j.expect(item.onHand === expected.catalog[line.sku].onHand - line.quantity, `${line.sku} on hand is ${item.onHand}, expected ${expected.catalog[line.sku].onHand - line.quantity}`)
    }
    const otherMovements = commerce.movements.filter((m) => m.orderId !== order.id)
    j.expect(otherMovements.every((m) => m.actionId.startsWith(GUIDED_SAMPLE_PREFIX)), 'a movement outside the reviewed order lost the guided-sample prefix')
    j.expect(ordersFor(commerce, GUIDED_REQUEST_ID).length === 0, 'the guided sample request gained a Shop order — the operator reviewed the real request, not the sample')
    j.expect((commerce.storefrontRequests || []).length === 0, 'a browser-local request was copied into the Shop workspace')
    // The device's accountable-action ledger and local metrics agree with the record.
    const actions = (await j.readJson(ACCOUNTABLE_ACTIONS_KEY)) || []
    const commerceActions = actions.filter((action) => action.domain === 'commerce')
    j.expect(commerceActions.length === 1 && commerceActions[0].id === actionIds[0] && commerceActions[0].actor === REVIEWER && commerceActions[0].summary === 'Review Ecommerce order',
      `the accountable-action ledger holds ${JSON.stringify(commerceActions.map((action) => [action.id, action.actor, action.summary]))}`)
    const metrics = (await j.readJson(LOCAL_METRICS_KEY)) || { events: [] }
    const created = (metrics.events || []).filter((entry) => entry.action === 'order.created')
    j.expect(created.length === 1, `expected one order.created local metric, found ${created.length}`)
    const operator = await j.readStored(LAST_OPERATOR_KEY)
    j.expect(operator === REVIEWER, `last operator is ${JSON.stringify(operator)}, expected ${REVIEWER}`)
    // The app drops the source parameter once the draft is consumed and lists the order.
    await j.waitUntil(`location.pathname === '/shop/' && new URLSearchParams(location.search).get('tab') === 'orders' && !new URLSearchParams(location.search).get('source')`, 'the URL to settle on /shop/?tab=orders')
    // The queue names the order by its short reference (#XXXXXXXX), customer and size.
    const listed = await j.waitUntil(`(() => {
      const text = (document.querySelector('.order-list') || {}).innerText || '';
      const page = document.body.innerText;
      const line = ${JSON.stringify(`${CUSTOMER_NAME} · ${expected.request.lines.length} items · ${expected.units} units`)};
      const short = ${JSON.stringify(`#${order.id.slice(4, 12)}`)};
      return text.includes(line) && text.includes(short) && page.includes('1 order needs action') && page.includes('Review Ecommerce order completed.') ? { line, short } : null;
    })()`, `the Orders tab to list ${order.id} as the one order needing action`)
    expected.order = order
    expected.actionId = actionIds[0]
    return { ...listed, orderId: order.id, actionId: actionIds[0], total: order.total, status: order.status }
  })

  await j.step('store-shows-confirmed-order', async () => {
    // A full reload: the confirmation must be re-derived from the two persisted
    // records (the buying-lifecycle request and the Shop order that cites it), not
    // from React state — playbook §3.7.
    await j.navigate('/ecommerce/')
    const receipt = await j.waitUntil(`(() => { const r = ${receiptExpr}; return r && r.pill === 'Confirmed in Shop' ? r : null; })()`, 'the receipt to read Confirmed in Shop')
    j.expect(receipt.heading === `Order ${expected.order.id}` && receipt.total === `${expected.total.toLocaleString()} MMK`, `the confirmed receipt reads ${JSON.stringify(receipt)}`)
    j.expect(receipt.reference === `Request ${expected.request.id} · Shop recorded the order and stock reservation.`, `the confirmed receipt's reference reads ${JSON.stringify(receipt.reference)}`)
    j.expect(receipt.buttons.includes('Continue in Shop') && receipt.buttons.includes('Start another order'), `the confirmed receipt offers ${JSON.stringify(receipt.buttons)}`)
    const boundaries = await j.evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('#ecommerce-buying-workspace .ecommerce-quote-receipt[data-current="true"] .ecommerce-quote-boundaries span')).map((s) => [(s.querySelector('small') || {}).textContent, (s.querySelector('b') || {}).textContent]))`)
    j.expect(boundaries.Customer === CUSTOMER_NAME && boundaries.Payment === 'Pending in Shop' && boundaries['Receive order'] === 'Pickup · no delivery fee',
      `the confirmed receipt's boundaries read ${JSON.stringify(boundaries)}`)
    const notice = await j.evaluate(`(document.querySelector('#ecommerce-buying-workspace .ecommerce-buying-notice') || {}).textContent`)
    j.expect(notice === `${expected.request.id} is confirmed as ${expected.order.id}. Payment still needs Shop reconciliation.`, `the checkout notice reads ${JSON.stringify(notice)}`)
    const sendGone = await j.evaluate(`!window.__journey.q('#ecommerce-buying-workspace form button[type="submit"]')`)
    j.expect(sendGone, 'Send order request is still offered for a request Shop already confirmed')
    const panel = await j.waitUntil(`(() => { const p = document.querySelector('.ecommerce-today'); const h = p && p.querySelector('h2'); return h && h.textContent === '1 order in progress' ? h.textContent : null; })()`, 'Start here to count the confirmed order')
    const today = await startHere()
    j.expect(today.action === 'Open Shop', `Start here action reads ${JSON.stringify(today.action)}`)
    // The persisted records, after everything: the real request and the untouched
    // sample, exactly one order, referencing the real request only.
    const buying = await readBuying()
    j.expect(buying.requests.length === 2 && canonical(buying.requests[0]) === expected.requestJson && canonical(buying.requests[1]) === expected.sampleJson,
      'the buying record changed after the Shop confirmation — Shop owns the order, the request receipt is immutable')
    const commerce = await readCommerce()
    j.expect(commerce.orders.length === 1 && commerce.orders[0].id === expected.order.id && commerce.orders[0].status === 'confirmed', `the Shop workspace holds ${JSON.stringify(commerce.orders.map((o) => [o.id, o.status]))}`)
    j.expect(ordersFor(commerce, GUIDED_REQUEST_ID).length === 0 && ordersFor(commerce, expected.request.id).length === 1,
      'after the journey the guided sample has an order, or the real request has none')
    const real = commerce.movements.filter((m) => !m.actionId.startsWith(GUIDED_SAMPLE_PREFIX))
    j.expect(real.length === expected.request.lines.length && real.every((m) => m.actionId === expected.actionId && m.orderId === expected.order.id),
      `real-proof movements are ${JSON.stringify(real.map((m) => [m.kind, m.actionId, m.orderId]))}, expected only the reviewed order's reserves`)
    return { headline: panel, orderId: expected.order.id, requestId: expected.request.id, sampleRequestId: GUIDED_REQUEST_ID, sampleOrders: 0 }
  })
}).catch((err) => reportFatal(LABEL, err))
