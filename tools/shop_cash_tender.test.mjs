import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { delimiter, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

import {
  initialShopCashTenderGateState,
  reduceShopCashTenderGate,
  reviewShopCashTender,
  reviewShopCashTenderGate,
  SHOP_CASH_TENDER_MAX_DIGITS,
  shopCashTenderGateCanSubmit,
  shopCashTenderMmk,
} from '../showroom/src/core/shop-cash-tender.ts'

const coreSource = readFileSync('showroom/src/core/CoreApp.tsx', 'utf8')
const runtimeSource = readFileSync('showroom/src/core/workspace-runtime.ts', 'utf8')
const require = createRequire(resolve('showroom/package.json'))
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href)

test('blank means exact cash and Arabic or Myanmar digits calculate the same change', () => {
  assert.deepEqual(reviewShopCashTender(2_500, ''), {
    status: 'exact', cashGivenMmk: 2_500, changeMmk: 0,
  })
  assert.deepEqual(reviewShopCashTender(2_500, '3000'), {
    status: 'change', cashGivenMmk: 3_000, changeMmk: 500,
  })
  assert.deepEqual(reviewShopCashTender(2_500, '၃၀၀၀'), {
    status: 'change', cashGivenMmk: 3_000, changeMmk: 500,
  })
  assert.deepEqual(reviewShopCashTender(2_500, '  ၂၅၀၀  '), {
    status: 'exact', cashGivenMmk: 2_500, changeMmk: 0,
  })
  assert.equal(shopCashTenderMmk(125_000), '125,000 MMK')
  assert.deepEqual(reviewShopCashTender(Number.MAX_SAFE_INTEGER, ''), {
    status: 'exact', cashGivenMmk: Number.MAX_SAFE_INTEGER, changeMmk: 0,
  })
  assert.deepEqual(reviewShopCashTender(Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)), {
    status: 'exact', cashGivenMmk: Number.MAX_SAFE_INTEGER, changeMmk: 0,
  })
})

test('short, unsafe, signed, decimal and non-digit tender fail closed', () => {
  assert.deepEqual(reviewShopCashTender(2_500, '2499'), {
    status: 'short', cashGivenMmk: 2_499, changeMmk: null,
  })
  for (const value of ['2,500', '2500.00', '-2500', '+2500', '25 00', 'cash', '၂၅၀၀ MMK', '99999999999999999999', '9007199254740992']) {
    assert.equal(reviewShopCashTender(2_500, value).status, 'invalid', value)
  }
  assert.throws(() => reviewShopCashTender(-1, ''), /amount_due_invalid/)
})

test('wiring is cash-only, completion-only, ephemeral and frozen for retry', () => {
  assert.match(runtimeSource, /cashTender\?: \{ amountDueMmk: number \}/)
  assert.doesNotMatch(runtimeSource.slice(
    runtimeSource.indexOf('export type AccountableAction ='),
    runtimeSource.indexOf('export type PendingAccountableAction ='),
  ), /cashTender/)
  assert.doesNotMatch(runtimeSource.slice(
    runtimeSource.indexOf('export function confirmAccountableAction'),
    runtimeSource.indexOf('export function commerceActionProof'),
  ), /cashTender|cashGivenMmk|changeMmk/)
  assert.match(coreSource, /completesSale && review\.payment === 'Cash'/)
  assert.equal((coreSource.match(/cashTender: \{ amountDueMmk: order\.total \}/g) ?? []).length, 1)
  assert.match(coreSource, /dispatchCashTender\(\{ type: 'submit', amountDueMmk: cashTender\.amountDueMmk \}\)/)
  assert.match(coreSource, /readOnly=\{cashTenderState\.frozenValue !== null \|\| Boolean\(action\.confirmation\)\}/)
  assert.match(coreSource, /disabled=\{busy \|\| cashTenderBlocked\}/)
  assert.match(coreSource, /requestAnimationFrame\(\(\) => cashTenderInputRef\.current\?\.focus\(\)\)/)
  assert.doesNotMatch(coreSource.slice(
    coreSource.indexOf('const order: CommerceOrder = {'),
    coreSource.indexOf('const lineReview =', coreSource.indexOf('const order: CommerceOrder = {')),
  ), /cashTender|cashGivenMmk|changeMmk/)
  for (const persistedPath of [
    'showroom/src/core/commerce-workspace.ts',
    'showroom/src/core/shop-parked-tickets.ts',
    'showroom/src/core/local-workspace-backup.ts',
    'showroom/src/core/company-backup.ts',
  ]) {
    assert.doesNotMatch(readFileSync(persistedPath, 'utf8'), /cashTender|cashGivenMmk|changeMmk/, persistedPath)
  }
})

test('stateful gate freezes ambiguous retry, rejects Enter errors and resets for the next action', async () => {
  let gate = initialShopCashTenderGateState()
  gate = reduceShopCashTenderGate(gate, { type: 'input', value: '3000' })
  assert.deepEqual(reviewShopCashTenderGate(2_500, gate), {
    status: 'change', cashGivenMmk: 3_000, changeMmk: 500,
  })
  assert.equal(shopCashTenderGateCanSubmit(2_500, gate), true)
  gate = reduceShopCashTenderGate(gate, { type: 'submit', amountDueMmk: 2_500 })
  assert.equal(gate.frozenValue, '3000')
  gate = reduceShopCashTenderGate(gate, { type: 'input', value: '4000' })
  assert.equal(gate.value, '3000', 'an ambiguous retry cannot change the reviewed tender')
  assert.equal(reviewShopCashTenderGate(2_500, gate).changeMmk, 500)

  let submissions = 0
  for (const entered of ['not-cash', '2499']) {
    let refused = initialShopCashTenderGateState()
    refused = reduceShopCashTenderGate(refused, { type: 'input', value: entered })
    if (shopCashTenderGateCanSubmit(2_500, refused)) submissions += 1
    refused = reduceShopCashTenderGate(refused, { type: 'submit', amountDueMmk: 2_500 })
    assert.equal(refused.frozenValue, null)
    assert.equal(refused.validationAssertive, true)
  }
  assert.equal(submissions, 0, 'invalid or short Enter submission must not reach the sale callback')
  const reset = reduceShopCashTenderGate(gate, { type: 'reset' })
  assert.deepEqual(reset, initialShopCashTenderGateState())
})

test('same-command retry after an ambiguous write keeps one sale and one stock effect', async () => {
  let tender = reduceShopCashTenderGate(initialShopCashTenderGateState(), { type: 'input', value: '3000' })
  tender = reduceShopCashTenderGate(tender, { type: 'submit', amountDueMmk: 2_500 })
  assert.deepEqual(reviewShopCashTenderGate(2_500, tender), {
    status: 'change', cashGivenMmk: 3_000, changeMmk: 500,
  })
  const nodePaths = (process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean)
  const commerceBundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `export {
        advanceCommerceOrder, createEmptyCommerce, mutateCommerceWorkspace,
        reconcileCommercePayment, registerCommerceItem, reserveCommerceOrder
      } from './showroom/src/core/commerce-workspace'`,
    },
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    nodePaths,
    platform: 'node',
    write: false,
  })
  const commerce = await import(`data:text/javascript;base64,${Buffer.from(commerceBundle.outputFiles[0].contents).toString('base64')}`)
  const capturedAt = '2026-10-24T10:00:00.000Z'
  const catalogProof = { actionId: 'ACT-CATALOG-CASH', capturedAt, actor: 'Synthetic cashier', reason: 'Synthetic cash test', evidenceReference: 'SYNTHETIC-CASH' }
  let initial = commerce.registerCommerceItem(
    commerce.createEmptyCommerce(),
    { sku: 'TEA-2500', name: 'Tea', onHand: 2, reorderAt: 1, price: 2_500 },
    catalogProof,
  )
  assert.ok(initial)
  const saleProof = { ...catalogProof, actionId: 'ACT-CASH-SALE-1', capturedAt: '2026-10-24T10:01:00.000Z' }
  const order = {
    id: 'ORD-CASH-1', createdAt: saleProof.capturedAt, customer: 'Guest', owner: saleProof.actor,
    channel: 'Counter', item: 'Tea', itemSku: 'TEA-2500', quantity: 1, payment: 'Cash',
    paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup', fulfilmentReference: 'Counter ORD-CASH-1',
    promisedAt: '2026-10-24T10:31:00.000Z', lines: [{ sku: 'TEA-2500', name: 'Tea', quantity: 1, unitPriceMmk: 2_500 }],
    total: 2_500, status: 'confirmed',
  }
  function settle(current) {
    const existing = current.orders.find((candidate) => candidate.id === order.id)
    if (existing) {
      return existing.status === 'completed'
        && existing.itemSku === order.itemSku
        && existing.quantity === order.quantity
        && existing.payment === order.payment
        && existing.total === order.total
        ? current
        : null
    }
    let state = commerce.reserveCommerceOrder(current, order, saleProof)
    if (!state) return null
    state = commerce.reconcileCommercePayment(state, order.id, { ...saleProof, actionId: `${saleProof.actionId}:payment` })
    if (!state) return null
    for (let step = 0; step < 3; step += 1) {
      const live = state.orders.find((candidate) => candidate.id === order.id)
      if (!live || live.status === 'cancelled') return null
      if (live.status === 'completed') break
      state = commerce.advanceCommerceOrder(state, order.id, live.status, { ...saleProof, actionId: `${saleProof.actionId}:advance-${live.status}` }, 'client')
      if (!state) return null
    }
    return state
  }
  const key = 'supermega.commerce.workspace.v2'
  const values = new Map([[key, JSON.stringify(initial)]])
  let ambiguous = true
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value)
      if (ambiguous) { ambiguous = false; throw new Error('synthetic_post_write_disconnect') }
    },
  }
  const locks = { request: async (_name, _options, callback) => callback() }
  const first = await commerce.mutateCommerceWorkspace(settle, storage, locks)
  assert.equal(first.ok, false)
  assert.equal(tender.frozenValue, '3000', 'an ambiguous completion keeps the reviewed tender read-only')
  const retry = await commerce.mutateCommerceWorkspace(settle, storage, locks)
  assert.equal(retry.ok, true, JSON.stringify(retry))
  assert.equal(retry.replayed, true)
  const saved = retry.state
  assert.equal(saved.orders.filter((candidate) => candidate.id === order.id).length, 1)
  assert.equal(saved.items.find((candidate) => candidate.sku === 'TEA-2500').onHand, 1)
  assert.equal(saved.movements.filter((movement) => movement.orderId === order.id && movement.kind === 'reserve').length, 1)
  tender = reduceShopCashTenderGate(tender, { type: 'reset' })
  assert.equal(tender.value, '', 'the next action starts with exact-cash blank')
  assert.equal(tender.frozenValue, null)
})

test('rendered tender fields expose due, given, change, deferred errors and retry lock', async () => {
  const nodePaths = (process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean)
  const bundled = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
        import React from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { ShopCashTenderFields } from './showroom/src/core/ShopCashTenderFields'
        export function render(props) {
          return renderToStaticMarkup(<ShopCashTenderFields {...props} onBlur={() => {}} onChange={() => {}} />)
        }
      `,
    },
    bundle: true,
    format: 'cjs',
    jsx: 'automatic',
    logLevel: 'silent',
    nodePaths,
    platform: 'node',
    write: false,
  })
  const renderedModule = { exports: {} }
  Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, renderedModule, renderedModule.exports)
  const module = renderedModule.exports
  const change = module.render({
    amountDueMmk: 2_500,
    assertive: false,
    readOnly: false,
    review: reviewShopCashTender(2_500, '၃၀၀၀'),
    value: '၃၀၀၀',
  })
  assert.match(change, /Amount due/)
  assert.match(change, /2,500 MMK/)
  assert.match(change, /inputMode="numeric"/)
  assert.match(change, new RegExp(`maxLength="${SHOP_CASH_TENDER_MAX_DIGITS}"`))
  assert.match(change, /Change: 500 MMK/)
  assert.match(change, /role="status"/)

  const short = module.render({
    amountDueMmk: 2_500,
    assertive: false,
    readOnly: false,
    review: reviewShopCashTender(2_500, '2000'),
    value: '2000',
  })
  assert.match(short, /aria-invalid="true"/)
  assert.match(short, /role="status"/)
  assert.doesNotMatch(short, /aria-live="assertive"/)
  assert.match(short, /500 MMK short/)

  const attempted = module.render({
    amountDueMmk: 2_500,
    assertive: true,
    readOnly: false,
    review: reviewShopCashTender(2_500, '2000'),
    value: '2000',
  })
  assert.match(attempted, /role="alert"/)
  assert.match(attempted, /aria-live="assertive"/)

  const frozen = module.render({
    amountDueMmk: 2_500,
    assertive: false,
    readOnly: true,
    review: reviewShopCashTender(2_500, '3000'),
    value: '3000',
  })
  assert.match(frozen, /readOnly=""/i)
})
