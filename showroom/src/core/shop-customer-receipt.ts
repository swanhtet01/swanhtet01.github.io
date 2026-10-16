import type { CommerceMerchantProfile, CommerceOrderAcknowledgement } from './commerce-workspace'

function formatMmk(amount: number) {
  return `${amount.toLocaleString('en-US')} MMK`
}

export function formatShopBusinessDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', {
    timeZone: 'Asia/Yangon',
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
}

/** Customer copy only. Deliberately excludes command IDs, evidence references and internal notes. */
export function shopCustomerReceiptText(ack: CommerceOrderAcknowledgement, profile: CommerceMerchantProfile) {
  const lines = [
    profile.nameMyanmar || profile.nameEnglish,
    profile.nameMyanmar && profile.nameEnglish ? profile.nameEnglish : '',
    profile.phone,
    profile.addressMyanmar,
    profile.addressEnglish,
    '',
    'အရောင်းပြေစာ · SALES RECEIPT',
    formatShopBusinessDate(ack.createdAt),
    `Order · ${ack.orderId}`,
    '',
    'ပစ္စည်း / ITEM',
    ...ack.lines.map((line) => `${line.nameMy ? `${line.nameMy} · ` : ''}${line.name}${line.variant ? ` · ${line.variant}` : ''}  ×${line.quantity}  ${formatMmk(line.lineTotalMmk)}`),
    '',
    ...(ack.tax.taxMmk ? [`Tax · အခွန်  ${formatMmk(ack.tax.taxMmk)}`] : []),
    ...(ack.promotion.discountMmk ? [`Discount · လျှော့ဈေး  −${formatMmk(ack.promotion.discountMmk)}`] : []),
    ...(ack.delivery?.feeMmk ? [`Delivery · ပို့ဆောင်ခ  ${formatMmk(ack.delivery.feeMmk)}`] : []),
    `စုစုပေါင်း / TOTAL  ${formatMmk(ack.totalMmk)}`,
    `Payment · ငွေပေးချေမှု  ${ack.payment.status === 'reconciled' ? 'Paid · ပေးချေပြီး' : 'Pending · ပေးချေရန်ကျန်'}`,
    '',
    'ကျေးဇူးတင်ပါသည် · Thank you',
  ]
  return lines.filter((line, index) => line || (index > 0 && lines[index - 1] !== '')).join('\n')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CUSTOMER_RECEIPT_PRINT_STYLES = `
    * { box-sizing: border-box; }
    body { font-family: 'Noto Sans Myanmar', 'Myanmar Text', system-ui, sans-serif; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; max-width: 80mm; margin: 4mm auto; padding: 0 2mm; font-variant-numeric: tabular-nums; }
    @media print {
      @page { margin: 3mm 0; }
      body { max-width: none; margin: 0; padding: 0 4mm; font-size: 0.7rem; line-height: 1.35; }
    }
    @media print and (max-width: 65mm) {
      body { padding: 0 5mm; font-size: 0.6rem; }
    }
    @media print and (min-width: 90mm) {
      @page { margin: 1cm; }
      body { margin: 0.5rem; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }
    }`

function merchantHeader(profile: CommerceMerchantProfile) {
  return [
    profile.nameMyanmar || profile.nameEnglish,
    profile.nameMyanmar && profile.nameEnglish ? profile.nameEnglish : '',
    profile.phone,
    profile.addressMyanmar,
    profile.addressEnglish,
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

/** Standalone browser-print document for the customer copy; no internal evidence is added. */
export function shopCustomerReceiptDocument(ack: CommerceOrderAcknowledgement, profile: CommerceMerchantProfile) {
  const title = escapeHtml(ack.orderId)
  const receipt = escapeHtml(shopCustomerReceiptText(ack, profile))
  return `<!doctype html>
<html lang="my">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sales receipt ${title}</title>
  <style>${CUSTOMER_RECEIPT_PRINT_STYLES}</style>
</head>
<body>${receipt}</body>
</html>`
}

/** Printer check only: no order, customer, payment, or inventory record is created. */
export function shopCustomerReceiptTestDocument(profile: CommerceMerchantProfile) {
  const header = merchantHeader(profile)
  const title = escapeHtml(profile.nameMyanmar || profile.nameEnglish || 'Shop')
  return `<!doctype html>
<html lang="my">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Printer test · ${title}</title>
  <style>${CUSTOMER_RECEIPT_PRINT_STYLES}
    body { display: grid; gap: 3mm; }
    h1, p { margin: 0; }
    h1 { font-size: 1.15em; }
    .test-mark { border: 1px dashed #555; padding: 2mm; font-weight: 700; text-align: center; }
    .divider { border: 0; border-top: 1px dashed #777; width: 100%; }
  </style>
</head>
<body>
  <header>${header}</header>
  <hr class="divider">
  <h1>အရောင်းပြေစာ · SALES RECEIPT</h1>
  <p class="test-mark">စမ်းသပ်စာရွက် · PRINTER TEST ONLY</p>
  <p>ဤစာရွက်သည် စမ်းသပ်ရန်သာဖြစ်ပြီး အရောင်းမဟုတ်ပါ။<br>This test slip is not a sale. No payment is due.</p>
  <p>စာလုံးဖတ်ရှုနိုင်မှု · Text and alignment</p>
  <p>၁၂၃၄၅၆၇၈၉၀ · 1234567890 · 5,000 MMK</p>
  <hr class="divider">
  <p>ကျေးဇူးတင်ပါသည် · Thank you</p>
</body>
</html>`
}
