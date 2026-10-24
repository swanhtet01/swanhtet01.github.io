import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { delimiter, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

import {
  reviewShopCashTender,
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
})

test('short, unsafe, signed, decimal and non-digit tender fail closed', () => {
  assert.deepEqual(reviewShopCashTender(2_500, '2499'), {
    status: 'short', cashGivenMmk: 2_499, changeMmk: null,
  })
  for (const value of ['2,500', '2500.00', '-2500', '+2500', '25 00', 'cash', '၂၅၀၀ MMK', '99999999999999999999']) {
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
  assert.match(coreSource, /setFrozenCashGiven\(cashGiven\)/)
  assert.match(coreSource, /readOnly=\{frozenCashGiven !== null \|\| Boolean\(action\.confirmation\)\}/)
  assert.match(coreSource, /disabled=\{busy \|\| cashTenderBlocked\}/)
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

test('rendered tender fields expose due, given, change, invalid state and retry lock', async () => {
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
          return renderToStaticMarkup(<ShopCashTenderFields {...props} onChange={() => {}} />)
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
    readOnly: false,
    review: reviewShopCashTender(2_500, '၃၀၀၀'),
    value: '၃၀၀၀',
  })
  assert.match(change, /Amount due/)
  assert.match(change, /2,500 MMK/)
  assert.match(change, /inputMode="numeric"/)
  assert.match(change, /Change: 500 MMK/)
  assert.match(change, /role="status"/)

  const short = module.render({
    amountDueMmk: 2_500,
    readOnly: false,
    review: reviewShopCashTender(2_500, '2000'),
    value: '2000',
  })
  assert.match(short, /aria-invalid="true"/)
  assert.match(short, /role="alert"/)
  assert.match(short, /500 MMK short/)

  const frozen = module.render({
    amountDueMmk: 2_500,
    readOnly: true,
    review: reviewShopCashTender(2_500, '3000'),
    value: '3000',
  })
  assert.match(frozen, /readOnly=""/i)
})
