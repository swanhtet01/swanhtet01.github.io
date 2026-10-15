import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const requireFromShowroom = createRequire(pathToFileURL(`${root}showroom/package.json`).href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundled = await build({
  stdin: {
    contents: "export { shopCustomerReceiptText } from './shop-customer-receipt.ts'",
    resolveDir: `${root}showroom/src/core`,
    sourcefile: 'shop-customer-receipt-check.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
})
const { shopCustomerReceiptText } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)

const profile = {
  schema: 'supermega.shop.merchant_profile.v1', revision: 1,
  nameMyanmar: 'ဆိုင်', nameEnglish: 'Corner Shop', phone: '09 123 456',
  addressMyanmar: 'ရန်ကုန်', addressEnglish: 'Yangon',
  proof: { actionId: 'ACT-SHOP-MERCHANT-R1', capturedAt: '2026-10-07T00:00:00.000Z', actor: 'operator', reason: 'setup', evidenceReference: 'SHOP-MERCHANT-PROFILE:R1' },
}
const acknowledgement = {
  orderId: 'ORD-1001', createdAt: '2026-10-07T08:00:00.000Z', channel: 'counter', customer: 'Guest',
  lines: [{ sku: 'RICE-1', name: 'Premium rice', quantity: 2, lineTotalMmk: 150000 }],
  promotion: { discountMmk: 0 }, tax: { taxMmk: 0 }, delivery: null, totalMmk: 150000,
  payment: { method: 'KBZPay', status: 'pending' },
}

const text = shopCustomerReceiptText(acknowledgement, profile)
assert.match(text, /ဆိုင်/)
assert.match(text, /Corner Shop/)
assert.match(text, /အရောင်းပြေစာ · SALES RECEIPT/)
assert.match(text, /Premium rice  ×2  150,000 MMK/)
assert.match(text, /Payment · ငွေပေးချေမှု  Pending · ပေးချေရန်ကျန်/)
assert.doesNotMatch(text, /ACT-SHOP|SHOP-MERCHANT-PROFILE|evidence|internal note/i)
console.log('PASS bilingual customer receipt content and evidence separation')
