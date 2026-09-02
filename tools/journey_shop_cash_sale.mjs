#!/usr/bin/env node
// Shop cash-sale browser journey — ONE deterministic end-to-end run at a 390px
// phone viewport against the BUILT app (showroom/dist), driven over raw CDP.
//
// Why this exists: ENTERPRISE-READINESS-SCORECARD §5 names CoreApp.tsx as the
// largest untested surface — verified by build gates plus MANUAL 390px journeys,
// with no automated browser E2E in any workflow. This is that journey. It follows
// docs/demo-playbooks/shop.md §2-§3 (the canonical demo script) plus the shipped
// one-review settle ('Paid & handed over', DESIGN-PROGRAM phase 2 item 1):
//
//   1. /settings/?product=shop  → type a business name → 'Create Shop and start selling'
//   2. lands on /shop/?tab=counter with the guided working sample provisioned
//   3. tap two catalog tiles (one of them twice) → open the phone cart bar
//   4. pick 'Cash' → 'Review order' → the counter gate ('Review counter order')
//   5. name the cashier → 'Create order'   (reserve: order confirmed, stock reserved)
//   6. reload on /shop/?tab=orders → 'Paid & handed over' → 'Confirm change'
//      (settle: payment reconciled + confirmed→preparing→ready→completed, one proof)
//   7. reload on /shop/?tab=counter → the tiles show the decremented stock
//
// Every assertion is on STATE the app persists (the localStorage workspace record,
// see showroom/src/core/local-workspace-storage.ts) or on rendered text — never
// on pixels. Screenshots are diagnostic output on failure only.
//
// Contract with the environment:
//   - Zero dependencies: Node built-ins + Chromium's DevTools protocol over the
//     built-in WebSocket (same pattern as tools/perf/measure-android-baseline.mjs).
//     The server, browser, CDP client, verified click/type and diagnostics live in
//     tools/journey_lib.mjs, shared with every other tools/journey_*.mjs.
//   - Chromium is resolved from --chromium / $CHROMIUM_BIN / /opt/pw-browsers /
//     PATH (google-chrome, chromium, ...). Nothing is downloaded; it never runs
//     `playwright install`.
//   - Every run launches a FRESH temporary browser profile, so there is no service
//     worker, no cache and no localStorage from any earlier run; the journey asserts
//     that emptiness before it starts. A pass that depended on a cached prior run
//     would be worthless.
//   - Nothing here seeds a record. The only sample data is what the app's own
//     onboarding provisions (guided sample, `ACT-DEMO-WORKING-SAMPLE-` action ids —
//     the CLAUDE.md prefix rule). The order the journey creates is made through the
//     real UI with a real generated proof, exactly as an operator would make it.
//
// Usage:
//   node tools/journey_shop_cash_sale.mjs [--chromium /path/to/chrome] [--out-dir DIR]
// Exit 0 with a one-line JSON verdict on success; exit 1 with the failing step, the
// reason, and diagnostics (screenshot path, page text, stored workspace summary).

import {
  GUIDED_SAMPLE_PREFIX,
  LAST_OPERATOR_KEY,
  LOCAL_METRICS_KEY,
  PRODUCT_SETUPS_KEY,
  SETUP_KEY,
  WORKING_SAMPLE_PREFIX,
  reportFatal,
  runJourney,
} from './journey_lib.mjs'

const CONTRACT = 'supermega.shop-cash-sale-journey.v1'
const LABEL = 'SHOP CASH-SALE JOURNEY'
const BUSINESS_NAME = 'Journey Test Shop'
const CASHIER = 'Journey cashier'
const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
const COUNTER_DRAFT_KEY = 'supermega.shop.counter_draft.v1'

runJourney({
  contract: CONTRACT,
  label: LABEL,
  profilePrefix: 'shop-journey',
  workspaceKey: COMMERCE_KEY,
  summarizeWorkspace: (workspace) => ({
    items: workspace.items.map((item) => ({ sku: item.sku, onHand: item.onHand, price: item.price })),
    orders: workspace.orders.map((order) => ({ id: order.id, status: order.status, paymentStatus: order.paymentStatus, total: order.total, quantity: order.quantity })),
    movements: workspace.movements.length,
  }),
}, async (j) => {
  let expected = null

  await j.step('fresh-origin', async () => {
    await j.navigate('/settings/?product=shop')
    // The app writes its own housekeeping keys on first paint (theme, behaviour
    // trail, local metrics, the Plant workspace seed), so "empty" is the wrong
    // test. What proves a fresh origin is that no Shop workspace, no setup record
    // and no counter draft exist before onboarding — the keys this journey will
    // go on to assert against.
    const fresh = await j.evaluate(`(async () => ({
      business: [${JSON.stringify(COMMERCE_KEY)}, ${JSON.stringify(SETUP_KEY)}, ${JSON.stringify(PRODUCT_SETUPS_KEY)}, ${JSON.stringify(COUNTER_DRAFT_KEY)}, ${JSON.stringify(LAST_OPERATOR_KEY)}]
        .filter((key) => window.localStorage.getItem(key) !== null),
      keys: Object.keys(window.localStorage).sort(),
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      viewport: window.innerWidth,
    }))()`)
    j.expect(fresh.business.length === 0, `a fresh profile already carries ${fresh.business.join(', ')} — this run is contaminated by a previous one`)
    j.expect(fresh.viewport === j.viewport.width, `expected a ${j.viewport.width}px viewport, got ${fresh.viewport}`)
    return { browser: j.browser, profile: j.userDataDir, keysWrittenByFirstPaint: fresh.keys, serviceWorkers: fresh.workers }
  })

  await j.step('setup-name-workspace', async () => {
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await j.type('input[autocomplete="organization"]', null, BUSINESS_NAME, 'Business name')
    // The submit is disabled until the runtime health probe settles (static host → demo).
    const submit = await j.click('form.product-onboarding-form button[type="submit"]', null, 'the setup submit button')
    j.expect(submit.text === 'Create Shop and start selling', `setup submit reads ${JSON.stringify(submit.text)}, expected "Create Shop and start selling"`)
  })

  await j.step('counter-opens-with-sample', async () => {
    await j.waitUntil(`location.pathname === '/shop/' && new URLSearchParams(location.search).get('tab') === 'counter'`, 'navigation to /shop/?tab=counter')
    await j.waitUntil(`Boolean(window.__journey.q('.shop-catalog-head h2', 'Tap an item to add it'))`, 'the counter heading')
    await j.waitUntil(`document.querySelectorAll('button.shop-product-tile').length > 1`, 'catalog tiles')
    const workspace = await j.readJson(COMMERCE_KEY)
    j.expect(workspace && workspace.schema === COMMERCE_KEY, `${COMMERCE_KEY} missing or wrong schema after onboarding`)
    j.expect(Array.isArray(workspace.orders) && workspace.orders.length === 0, `expected no orders before the sale, found ${workspace?.orders?.length}`)
    const baselines = workspace.catalogBaselines || []
    j.expect(baselines.length > 0 && baselines.every((b) => b.proof?.actionId?.startsWith(WORKING_SAMPLE_PREFIX)),
      'the provisioned catalog is not the guided working sample (catalog baselines lack the ACT-DEMO-WORKING-SAMPLE- prefix)')
    j.expect(workspace.movements.every((m) => m.actionId.startsWith(GUIDED_SAMPLE_PREFIX)),
      'a stock movement without the guided-sample prefix exists before any sale was made')
    const tiles = await j.evaluate(`Array.from(document.querySelectorAll('button.shop-product-tile')).map((tile, i) => ({
      name: (document.getElementById('shop-tile-name-' + i) || {}).textContent || '',
      stock: (document.getElementById('shop-tile-stock-' + i) || {}).textContent || '',
      disabled: tile.disabled,
    }))`)
    j.expect(tiles.length === workspace.items.length, `counter shows ${tiles.length} tiles for ${workspace.items.length} catalog items`)
    // Tile i renders items[i] (visibleItems === items with no search query).
    const first = workspace.items.findIndex((item) => item.onHand >= 2)
    const second = workspace.items.findIndex((item, i) => i !== first && item.onHand >= 1)
    j.expect(first >= 0 && second >= 0, 'the sample catalog has no two sellable items (one needs stock >= 2)')
    const a = workspace.items[first]
    const b = workspace.items[second]
    j.expect(tiles[first].name === a.name && tiles[second].name === b.name, 'tile order does not match the stored catalog order')
    j.expect(tiles[first].stock === `${a.onHand} in stock`, `tile ${first} shows ${JSON.stringify(tiles[first].stock)}, stored ${a.onHand}`)
    expected = {
      a: { index: first, sku: a.sku, name: a.name, price: a.price, onHand: a.onHand, quantity: 2 },
      b: { index: second, sku: b.sku, name: b.name, price: b.price, onHand: b.onHand, quantity: 1 },
      units: 3,
      total: a.price * 2 + b.price,
    }
    expected.totalText = `${new Intl.NumberFormat('en-US').format(expected.total)} MMK`
    return { items: workspace.items.length, sale: { [a.sku]: 2, [b.sku]: 1 }, total: expected.total }
  })

  await j.step('tap-items', async () => {
    const tile = (i) => `button.shop-product-tile:nth-of-type(${i + 1})`
    await j.click(tile(expected.a.index), null, `tile ${expected.a.name}`)
    await j.click(tile(expected.a.index), null, `tile ${expected.a.name} (second tap)`)
    await j.click(tile(expected.b.index), null, `tile ${expected.b.name}`)
    const bar = await j.waitUntil(`(() => {
      const bar = window.__journey.q('button.shop-mobile-cart');
      const qa = document.getElementById('shop-tile-quantity-${expected.a.index}');
      const qb = document.getElementById('shop-tile-quantity-${expected.b.index}');
      return bar && qa && qb ? { bar: bar.textContent.trim(), qa: qa.textContent.trim(), qb: qb.textContent.trim() } : null;
    })()`, 'the phone cart bar and tile quantity badges')
    j.expect(bar.qa === '2' && bar.qb === '1', `tile badges read ${bar.qa}/${bar.qb}, expected 2/1`)
    j.expect(bar.bar.includes(`${expected.units} items`), `cart bar reads ${JSON.stringify(bar.bar)}, expected "${expected.units} items"`)
    j.expect(bar.bar.includes(expected.totalText), `cart bar reads ${JSON.stringify(bar.bar)}, expected total ${expected.totalText}`)
    const draft = JSON.parse(await j.readStored(COUNTER_DRAFT_KEY) || 'null')
    j.expect(draft && draft.cart?.[expected.a.sku] === 2 && draft.cart?.[expected.b.sku] === 1,
      `the in-progress sale was not persisted to ${COUNTER_DRAFT_KEY}: ${JSON.stringify(draft)}`)
  })

  await j.step('review-cash-sale', async () => {
    await j.click('button.shop-mobile-cart', null, 'the phone cart bar')
    await j.waitUntil(`Boolean(document.querySelector('.shop-current-sale.is-open'))`, 'the current-sale panel to open')
    await j.click('.shop-payment-options button', 'Cash', 'the Cash payment option')
    const pressed = await j.evaluate(`(window.__journey.q('.shop-payment-options button[aria-pressed="true"]') || {}).textContent`)
    j.expect(pressed === 'Cash', `payment method reads ${JSON.stringify(pressed)}, expected Cash`)
    const footerTotal = await j.evaluate(`(window.__journey.q('.shop-current-sale > footer strong') || {}).textContent`)
    j.expect(footerTotal === expected.totalText, `sale panel total reads ${JSON.stringify(footerTotal)}, expected ${expected.totalText}`)
    const review = await j.click('button.shop-review-sale', null, 'Review order')
    j.expect(review.text.startsWith('Review order'), `review button reads ${JSON.stringify(review.text)}`)
  })

  await j.step('create-order', async () => {
    const gate = await j.waitUntil(`(() => {
      const d = document.querySelector('dialog.accountable-action-gate[open]');
      if (!d) return null;
      return { eyebrow: (d.querySelector('.core-eyebrow') || {}).textContent, title: (d.querySelector('#action-confirm-title') || {}).textContent };
    })()`, 'the counter review gate')
    j.expect(gate.eyebrow === 'Review counter order', `gate eyebrow reads ${JSON.stringify(gate.eyebrow)}`)
    j.expect(gate.title === `Create ${expected.totalText} counter order`, `gate title reads ${JSON.stringify(gate.title)}, expected "Create ${expected.totalText} counter order"`)
    const boundary = await j.evaluate(`Boolean(window.__journey.q('dialog.accountable-action-gate[open] .counter-local-boundary', 'Browser-local sample only.'))`)
    j.expect(boundary, 'the counter gate lost its browser-local boundary line (the playbook §4 privacy pitch)')
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, CASHIER, 'the Cashier field')
    const submit = await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Create order')
    j.expect(submit.text.startsWith('Create order'), `gate submit reads ${JSON.stringify(submit.text)}`)
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]')`, 'the gate to close after the order was created')
  })

  await j.step('order-reserved-in-storage', async () => {
    const workspace = await j.waitUntil(`(() => {
      const raw = window.__journey.read(${JSON.stringify(COMMERCE_KEY)});
      if (!raw) return null;
      const state = JSON.parse(raw);
      return state.orders.length === 1 ? state : null;
    })()`, 'exactly one order in the stored workspace')
    const [order] = workspace.orders
    j.expect(order.status === 'confirmed', `order status is ${order.status}, expected confirmed`)
    j.expect(order.paymentStatus === 'pending', `payment status is ${order.paymentStatus}, expected pending`)
    j.expect(order.payment === 'Cash', `payment method stored as ${order.payment}`)
    j.expect(order.channel === 'Walk-in' && order.fulfilment === 'pickup', `channel/fulfilment stored as ${order.channel}/${order.fulfilment}`)
    j.expect(order.total === expected.total, `order total is ${order.total}, expected ${expected.total}`)
    j.expect(order.quantity === expected.units, `order quantity is ${order.quantity}, expected ${expected.units}`)
    j.expect(order.owner === CASHIER, `order owner is ${JSON.stringify(order.owner)}, expected the typed cashier`)
    j.expect(order.customer === 'Guest', `customer stored as ${JSON.stringify(order.customer)}, expected Guest`)
    const lines = Object.fromEntries((order.lines || []).map((line) => [line.sku, { quantity: line.quantity, unitPriceMmk: line.unitPriceMmk }]))
    j.expect(lines[expected.a.sku]?.quantity === 2 && lines[expected.a.sku]?.unitPriceMmk === expected.a.price, `line for ${expected.a.sku} is ${JSON.stringify(lines[expected.a.sku])}`)
    j.expect(lines[expected.b.sku]?.quantity === 1 && lines[expected.b.sku]?.unitPriceMmk === expected.b.price, `line for ${expected.b.sku} is ${JSON.stringify(lines[expected.b.sku])}`)
    const itemA = workspace.items.find((item) => item.sku === expected.a.sku)
    const itemB = workspace.items.find((item) => item.sku === expected.b.sku)
    j.expect(itemA.onHand === expected.a.onHand - 2, `${expected.a.sku} on hand is ${itemA.onHand}, expected ${expected.a.onHand - 2}`)
    j.expect(itemB.onHand === expected.b.onHand - 1, `${expected.b.sku} on hand is ${itemB.onHand}, expected ${expected.b.onHand - 1}`)
    const reserves = workspace.movements.filter((m) => m.orderId === order.id)
    j.expect(reserves.length === 2 && reserves.every((m) => m.kind === 'reserve'), `expected two reserve movements for ${order.id}, found ${JSON.stringify(reserves.map((m) => m.kind))}`)
    j.expect(reserves.every((m) => !m.actionId.startsWith(GUIDED_SAMPLE_PREFIX)),
      'the counter sale was recorded under the guided-sample prefix — a real UI action must not be indistinguishable from seeded data')
    j.expect(reserves.every((m) => m.actor === CASHIER && m.evidenceReference && m.reason), 'reserve movements are missing their proof (actor/reason/evidence)')
    const draft = await j.readStored(COUNTER_DRAFT_KEY)
    j.expect(draft === null, `the counter draft survived the sale: ${draft}`)
    const operator = await j.readStored(LAST_OPERATOR_KEY)
    j.expect(operator === CASHIER, `last operator is ${JSON.stringify(operator)}, expected ${CASHIER}`)
    const metrics = JSON.parse(await j.readStored(LOCAL_METRICS_KEY) || '{"events":[]}')
    const completed = (metrics.events || []).filter((event) => event.action === 'sale.completed')
    j.expect(completed.length === 1, `expected one sale.completed local metric, found ${completed.length}`)
    const cartGone = await j.evaluate(`!document.querySelector('button.shop-mobile-cart')`)
    j.expect(cartGone, 'the phone cart bar is still showing after the order was created')
    expected.orderId = order.id
    return { orderId: order.id, total: order.total, status: order.status }
  })

  await j.step('settle-paid-and-handed-over', async () => {
    // A full reload: the settle must work from the persisted record, not from React state.
    await j.navigate('/shop/?tab=orders')
    const settle = await j.click('.order-list button', 'Paid & handed over', 'Paid & handed over')
    j.expect(settle.text === 'Paid & handed over', `settle button reads ${JSON.stringify(settle.text)}`)
    const gate = await j.waitUntil(`(() => {
      const d = document.querySelector('dialog.accountable-action-gate[open]');
      if (!d) return null;
      const inputs = Array.from(d.querySelectorAll('form input'));
      return { title: (d.querySelector('#action-confirm-title') || {}).textContent, values: inputs.map((i) => i.value) };
    })()`, 'the settle gate')
    j.expect(gate.title.startsWith('Settle ') && gate.title.endsWith(' · paid and handed over'), `settle gate title reads ${JSON.stringify(gate.title)}`)
    // The name defaults to the setup owner ('Business owner', written by onboarding) and
    // falls back to the remembered operator only when there is none — the operator
    // confirms who actually did it, exactly as at a shared till.
    j.expect(gate.values[0] && gate.values[0].trim(), 'settle gate offered no default name')
    j.expect(gate.values[1] === 'Cash received and the customer took the order.', `settle gate reason reads ${JSON.stringify(gate.values[1])}`)
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, CASHIER, 'the settle gate name field')
    const submit = await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Confirm change')
    // bi() renders bilingual labels ('Confirm change · အတည်ပြုမည်'); match the English head.
    j.expect(submit.text.startsWith('Confirm change'), `settle submit reads ${JSON.stringify(submit.text)}`)
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]')`, 'the settle gate to close')
    expected.settleTitle = gate.title
  })

  await j.step('order-completed-in-storage', async () => {
    const workspace = await j.waitUntil(`(() => {
      const raw = window.__journey.read(${JSON.stringify(COMMERCE_KEY)});
      if (!raw) return null;
      const state = JSON.parse(raw);
      const order = state.orders.find((o) => o.id === ${JSON.stringify(expected.orderId)});
      return order && order.status === 'completed' ? state : null;
    })()`, `order ${expected.orderId} to reach completed`)
    const order = workspace.orders.find((o) => o.id === expected.orderId)
    j.expect(workspace.orders.length === 1, `expected the single journey order, found ${workspace.orders.length}`)
    j.expect(order.paymentStatus === 'reconciled', `payment status is ${order.paymentStatus}, expected reconciled`)
    j.expect(order.paymentReconciledBy === CASHIER, `payment reconciled by ${JSON.stringify(order.paymentReconciledBy)}`)
    const settleId = order.paymentReconciliationActionId
    j.expect(typeof settleId === 'string' && settleId && !settleId.startsWith(GUIDED_SAMPLE_PREFIX), `settle proof id is ${JSON.stringify(settleId)}`)
    // One reviewed settle = one command with derived, individually unique inner proofs.
    j.expect(JSON.stringify(order.advancementActionIds) === JSON.stringify([`${settleId}:advance-confirmed`, `${settleId}:advance-preparing`]),
      `advancement ids are ${JSON.stringify(order.advancementActionIds)}, expected the derived confirmed/preparing pair`)
    j.expect(order.completion?.actionId === `${settleId}:advance-ready`, `completion proof id is ${JSON.stringify(order.completion?.actionId)}`)
    j.expect(order.completion?.actor === CASHIER, `completion actor is ${JSON.stringify(order.completion?.actor)}`)
    j.expect(order.total === expected.total, `settled order total drifted to ${order.total}`)
    const itemA = workspace.items.find((item) => item.sku === expected.a.sku)
    j.expect(itemA.onHand === expected.a.onHand - 2, `${expected.a.sku} on hand changed again at settle: ${itemA.onHand}`)
    // The Orders tab lists work that still needs action, so a settled order leaves it;
    // what must reflect the sale is the settle notice, the queue count, and the
    // daily-close panel (#shop-close-controls) counting it as ready to close.
    const surface = await j.waitUntil(`(() => {
      const text = document.body.innerText;
      const noticed = text.includes(${JSON.stringify(`${expected.settleTitle} completed.`)});
      const queue = text.includes('0 orders need action');
      const close = text.includes(${JSON.stringify(`1 completed, reconciled orders · ${expected.totalText} ready to close.`)});
      return noticed && queue && close ? { noticed, queue, close } : null;
    })()`, 'the Orders tab to reflect the settled sale (notice, empty queue, daily close ready)')
    const settleGone = await j.evaluate(`!window.__journey.q('button', 'Paid & handed over')`)
    j.expect(settleGone, 'the settle button is still offered after the order completed')
    return { ...surface, orderId: order.id, settleActionId: settleId, status: order.status, paymentStatus: order.paymentStatus }
  })

  await j.step('counter-shows-decremented-stock', async () => {
    await j.navigate('/shop/?tab=counter')
    const stock = await j.waitUntil(`(() => {
      const a = document.getElementById('shop-tile-stock-${expected.a.index}');
      const b = document.getElementById('shop-tile-stock-${expected.b.index}');
      return a && b ? { a: a.textContent.trim(), b: b.textContent.trim() } : null;
    })()`, 'the catalog tiles after the sale')
    const wantA = expected.a.onHand - 2 > 0 ? `${expected.a.onHand - 2} in stock` : 'Out of stock'
    const wantB = expected.b.onHand - 1 > 0 ? `${expected.b.onHand - 1} in stock` : 'Out of stock'
    j.expect(stock.a === wantA, `${expected.a.sku} tile reads ${JSON.stringify(stock.a)}, expected ${JSON.stringify(wantA)}`)
    j.expect(stock.b === wantB, `${expected.b.sku} tile reads ${JSON.stringify(stock.b)}, expected ${JSON.stringify(wantB)}`)
    const openOrders = await j.evaluate(`(window.__journey.q('.shop-counter-summary a') || {}).textContent`)
    j.expect(openOrders === '0 open orders', `counter summary reads ${JSON.stringify(openOrders)}, expected "0 open orders"`)
    return { stock }
  })
}).catch((err) => reportFatal(LABEL, err))
