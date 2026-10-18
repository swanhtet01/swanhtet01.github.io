import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { commerceMerchantProfileActionId, createEmptyCommerce, saveCommerceMerchantProfile, validateCommerceState } from '../showroom/src/core/commerce-workspace.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const requireFromShowroom = createRequire(pathToFileURL(`${root}showroom/package.json`).href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundled = await build({
  stdin: {
    contents: "export { formatShopBusinessDate, shopCustomerReceiptText, shopCustomerReceiptDocument, shopCustomerReceiptTestDocument } from './shop-customer-receipt.ts'",
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
const { formatShopBusinessDate, shopCustomerReceiptText, shopCustomerReceiptDocument, shopCustomerReceiptTestDocument } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)

const profileInput = {
  nameMyanmar: 'ဆိုင်', nameEnglish: 'Corner Shop', phone: '09 123 456',
  addressMyanmar: 'ရန်ကုန်', addressEnglish: 'Yangon',
}
const profileProof = {
  actionId: commerceMerchantProfileActionId(1), capturedAt: '2026-10-07T00:00:00.000Z',
  actor: 'operator', reason: 'setup', evidenceReference: 'SHOP-MERCHANT-PROFILE:R1',
}
const savedWorkspace = saveCommerceMerchantProfile(createEmptyCommerce(), profileInput, profileProof)
assert.ok(savedWorkspace)
const profile = validateCommerceState(JSON.parse(JSON.stringify(savedWorkspace))).merchantProfile
assert.ok(profile)
const acknowledgement = {
  orderId: 'ORD-1001', createdAt: '2026-10-07T08:00:00.000Z', channel: 'counter', customer: 'Guest',
  lines: [{ sku: 'RICE-1', name: 'Premium rice', nameMy: 'ဆန်မွှေး', quantity: 2, lineTotalMmk: 150000 }],
  promotion: { discountMmk: 0 }, tax: { taxMmk: 0 }, delivery: null, totalMmk: 150000,
  payment: { method: 'KBZPay', status: 'pending' },
}

const text = shopCustomerReceiptText(acknowledgement, profile)
assert.match(text, /Corner Shop/)
assert.doesNotMatch(text, /ဆိုင်|အရောင်းပြေစာ/)
assert.match(text, /Sales receipt/)
assert.match(text, /7 Oct 2026, 14:30/)
assert.match(text, /Premium rice  ×2  150,000 MMK/)
assert.equal(formatShopBusinessDate('not-a-date'), 'not-a-date')
assert.match(text, /Payment  Pending/)
assert.doesNotMatch(text, /ACT-SHOP|SHOP-MERCHANT-PROFILE|evidence|internal note/i)
const burmeseText = shopCustomerReceiptText(acknowledgement, profile, 'my')
assert.match(burmeseText, /ဆိုင်/)
assert.doesNotMatch(burmeseText, /Corner Shop|Sales receipt|Premium rice|Payment|Pending/)
assert.match(burmeseText, /အရောင်းပြေစာ/)
assert.match(burmeseText, /ဆန်မွှေး  ×2  150,000 MMK/)
assert.match(burmeseText, /ငွေပေးချေမှု  ပေးချေရန်ကျန်/)

const reconciledAcknowledgement = {
  ...acknowledgement,
  orderId: 'ORD-<1001>',
  lines: [{ ...acknowledgement.lines[0], name: 'Premium <script>alert(1)</script>' }],
  promotion: { ...acknowledgement.promotion, discountMmk: 10000 },
  tax: { ...acknowledgement.tax, taxMmk: 5000 },
  delivery: { feeMmk: 2000 },
  totalMmk: 147000,
}
const customerDocument = shopCustomerReceiptDocument(reconciledAcknowledgement, {
  ...profile,
  nameEnglish: '<img src=x onerror=alert(1)>',
})
assert.match(customerDocument, /<html lang="en">/)
assert.match(customerDocument, /@media print and \(max-width: 65mm\)/)
assert.match(customerDocument, /@media print and \(min-width: 90mm\)/)
assert.doesNotMatch(customerDocument, /@page\s*\{\s*size:/)
assert.match(customerDocument, /Premium &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
assert.match(customerDocument, /&lt;img src=x onerror=alert\(1\)&gt;/)
assert.doesNotMatch(customerDocument, /<script|<img/)
assert.match(customerDocument, /Tax  5,000 MMK/)
assert.match(customerDocument, /Discount  −10,000 MMK/)
assert.match(customerDocument, /Delivery  2,000 MMK/)
assert.match(customerDocument, /Total  147,000 MMK/)
assert.doesNotMatch(customerDocument, /အရောင်းပြေစာ|စုစုပေါင်း/)
assert.equal(150000 - 10000 + 5000 + 2000, reconciledAcknowledgement.totalMmk)
assert.doesNotMatch(customerDocument, /ACT-SHOP|SHOP-MERCHANT-PROFILE|evidence|internal note/i)
const burmeseDocument = shopCustomerReceiptDocument({
  ...reconciledAcknowledgement,
  lines: [{ ...reconciledAcknowledgement.lines[0], nameMy: '<script>alert(2)</script>' }],
}, { ...profile, nameMyanmar: '<img src=x onerror=alert(2)>' }, 'my')
assert.match(burmeseDocument, /<html lang="my">/)
assert.match(burmeseDocument, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/)
assert.match(burmeseDocument, /&lt;img src=x onerror=alert\(2\)&gt;/)
assert.doesNotMatch(burmeseDocument, /<script|<img|Sales receipt|Premium rice/)
assert.match(burmeseDocument, /အခွန်  5,000 MMK/)
assert.match(burmeseDocument, /လျှော့ဈေး  −10,000 MMK/)
assert.match(burmeseDocument, /ပို့ဆောင်ခ  2,000 MMK/)
assert.match(burmeseDocument, /စုစုပေါင်း  147,000 MMK/)
const printerTestDocument = shopCustomerReceiptTestDocument({ ...profile, nameEnglish: '<img src=x onerror=alert(1)>' })
assert.match(printerTestDocument, /<html lang="en">/)
assert.match(printerTestDocument, /Printer test only/)
assert.match(printerTestDocument, /This test slip is not a sale\. No payment is due\./)
assert.match(printerTestDocument, /Sales receipt/)
assert.match(printerTestDocument, /&lt;img src=x onerror=alert\(1\)&gt;/)
assert.match(printerTestDocument, /@media print and \(max-width: 65mm\)/)
assert.match(printerTestDocument, /@media print and \(min-width: 90mm\)/)
assert.doesNotMatch(printerTestDocument, /ORD-|Payment|evidence|internal note|<script|<img|စမ်းသပ်စာရွက်/)
assert.match(printerTestDocument, /1234567890 · 5,000 MMK/)
const burmeseTestDocument = shopCustomerReceiptTestDocument({ ...profile, nameMyanmar: '<img src=x onerror=alert(2)>' }, 'my')
assert.match(burmeseTestDocument, /<html lang="my">/)
assert.match(burmeseTestDocument, /စမ်းသပ်စာရွက်/)
assert.match(burmeseTestDocument, /&lt;img src=x onerror=alert\(2\)&gt;/)
assert.doesNotMatch(burmeseTestDocument, /<img|Printer test only|Sales receipt|Thank you/)
const { readFile } = await import('node:fs/promises')
const receiptDialogSource = await readFile(new URL('../showroom/src/core/ReceiptDialog.tsx', import.meta.url), 'utf8')
assert.match(receiptDialogSource, /const locale = useUiLocale\(\)/)
assert.match(receiptDialogSource, /shopCustomerReceiptDocument\(ack, merchantProfile, locale\)/)
assert.match(receiptDialogSource, /window\.open\('', '_blank'\)/)
assert.match(receiptDialogSource, /uiText\('Printing was blocked\. Allow pop-ups for this site/)
assert.match(receiptDialogSource, /win\.document\.write\(documentHtml\)/)
assert.match(receiptDialogSource, /Print test slip/)
assert.match(receiptDialogSource, /shopCustomerReceiptTestDocument\(merchantProfile, locale\)/)
assert.match(receiptDialogSource, /no sale was recorded/)
console.log('PASS separate-language customer receipts and evidence separation')
