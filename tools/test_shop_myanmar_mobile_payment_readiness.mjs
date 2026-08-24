// Myanmar mobile-payment readiness: counter, QR, intake, draft, and ledger surfaces
// must understand local wallet rails without storing owner payment identifiers in source.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { PAYMENT_QR_METHODS } from './payment-qr-store.ts'
      export { channelOrderPayments } from './channel-order-intake.ts'
      export { commerceOrderDraftPayments } from './commerce-order-draft.ts'
      export { cashAccountCodeForMethod, coreLedgerAccounts } from './shop-ledger-accounts.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/myanmar-mobile-payment-readiness-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  PAYMENT_QR_METHODS,
  channelOrderPayments,
  commerceOrderDraftPayments,
  cashAccountCodeForMethod,
  coreLedgerAccounts,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const mobileWalletMethods = ['KBZPay', 'WavePay', 'AYA Pay', 'MMQR']

check(JSON.stringify(PAYMENT_QR_METHODS) === JSON.stringify(mobileWalletMethods),
  'QR upload slots are exactly the non-cash Myanmar wallet methods')

for (const method of mobileWalletMethods) {
  check(channelOrderPayments.includes(method), `${method} is accepted by channel order intake`)
  check(commerceOrderDraftPayments.includes(method), `${method} is accepted by saved Shop order drafts`)
}

check(cashAccountCodeForMethod('KBZPay') === 'cash_kbz_wallet', 'KBZPay clears to its own wallet account')
check(cashAccountCodeForMethod('WavePay') === 'cash_wave_wallet', 'WavePay clears to its own wallet account')
check(cashAccountCodeForMethod('AYA Pay') === 'cash_aya_wallet', 'AYA Pay clears to its own wallet account')
check(cashAccountCodeForMethod('MMQR') === 'cash_mmqr_clearing', 'MMQR clears to its own wallet-clearing account')

const accountCodes = new Set(coreLedgerAccounts().map((account) => account.code))
for (const code of ['cash_kbz_wallet', 'cash_wave_wallet', 'cash_aya_wallet', 'cash_mmqr_clearing']) {
  check(accountCodes.has(code), `${code} exists in the core chart`)
}

// Public source may describe owner-provided QR/phone setup, but it must not commit a
// real destination number. The owner can add their actual QR or phone later through
// private configuration/onboarding, not by merging it into this public code path.
const publicPaymentFiles = [
  'showroom/src/core/payment-qr-store.ts',
  'showroom/src/core/PaymentQr.tsx',
  'showroom/src/core/WorkspaceControlsPage.tsx',
  'showroom/src/core/CoreApp.tsx',
]
const bareMyanmarMobileNumber = /(^|[^0-9])09[0-9]{5,}([^0-9]|$)/
for (const file of publicPaymentFiles) {
  const source = readFileSync(file, 'utf8')
  check(!bareMyanmarMobileNumber.test(source), `${file} has no committed bare Myanmar mobile-payment number`)
}

console.log(JSON.stringify({ ok: true, checks }))
