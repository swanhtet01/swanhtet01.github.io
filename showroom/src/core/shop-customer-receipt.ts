import type { CommerceMerchantProfile, CommerceOrderAcknowledgement } from './commerce-workspace'
import type { UiLocale } from './ui-locale'

function formatMmk(amount: number) {
  return `${amount.toLocaleString('en-US')} MMK`
}

export function formatShopBusinessDate(value: string, locale: UiLocale = 'en') {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === 'my' ? 'my-MM' : 'en-GB', {
    timeZone: 'Asia/Yangon',
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
}

function customerPaymentStatus(ack: CommerceOrderAcknowledgement, my: boolean) {
  if (ack.cancellation?.state === 'cancelled') {
    const refundStatus = ack.payment.refundStatus ?? 'none'
    if (refundStatus === 'due') return my ? 'ပြန်အမ်းရန်ကျန်' : 'Refund due'
    if (refundStatus === 'settled') return my ? 'ပြန်အမ်းပြီး' : 'Refunded'
    if (ack.payment.status === 'reconciled') return my ? 'ပြန်အမ်းမှု အခြေအနေ မမှတ်တမ်းတင်ရသေး' : 'Refund status not recorded'
    return my ? 'မကောက်ခံရသေး' : 'Not collected'
  }
  return ack.payment.status === 'reconciled' ? (my ? 'ပေးချေပြီး' : 'Paid') : (my ? 'ပေးချေရန်ကျန်' : 'Pending')
}

/** Customer copy only. Deliberately excludes command IDs, evidence references and internal notes. */
export function shopCustomerReceiptText(ack: CommerceOrderAcknowledgement, profile: CommerceMerchantProfile, locale: UiLocale = 'en') {
  const my = locale === 'my'
  const lines = [
    my ? (profile.nameMyanmar || profile.nameEnglish) : (profile.nameEnglish || profile.nameMyanmar),
    profile.phone,
    my ? (profile.addressMyanmar || profile.addressEnglish) : (profile.addressEnglish || profile.addressMyanmar),
    '',
    my ? 'အရောင်းပြေစာ' : 'Sales receipt',
    formatShopBusinessDate(ack.createdAt, locale),
    `${my ? 'အော်ဒါ' : 'Order'} · ${ack.orderId}`,
    '',
    my ? 'ပစ္စည်း' : 'Item',
    ...ack.lines.map((line) => `${my ? (line.nameMy || line.name) : line.name}${line.variant ? ` · ${line.variant}` : ''}  ×${line.quantity}  ${formatMmk(line.lineTotalMmk)}`),
    '',
    ...(ack.tax.taxMmk ? [`${my ? 'အခွန်' : 'Tax'}  ${formatMmk(ack.tax.taxMmk)}`] : []),
    ...(ack.promotion.discountMmk ? [`${my ? 'လျှော့ဈေး' : 'Discount'}  −${formatMmk(ack.promotion.discountMmk)}`] : []),
    ...(ack.delivery?.feeMmk ? [`${my ? 'ပို့ဆောင်ခ' : 'Delivery'}  ${formatMmk(ack.delivery.feeMmk)}`] : []),
    `${my ? 'စုစုပေါင်း' : 'Total'}  ${formatMmk(ack.totalMmk)}`,
    ...(ack.cancellation?.state === 'cancelled' ? [`${my ? 'အော်ဒါအခြေအနေ' : 'Order status'}  ${my ? 'ပယ်ဖျက်ပြီး' : 'Cancelled'}`] : []),
    `${my ? 'ငွေပေးချေမှု' : 'Payment'}  ${customerPaymentStatus(ack, my)}`,
    '',
    my ? 'ကျေးဇူးတင်ပါသည်' : 'Thank you',
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

function merchantHeader(profile: CommerceMerchantProfile, locale: UiLocale) {
  const my = locale === 'my'
  return [
    my ? (profile.nameMyanmar || profile.nameEnglish) : (profile.nameEnglish || profile.nameMyanmar),
    profile.phone,
    my ? (profile.addressMyanmar || profile.addressEnglish) : (profile.addressEnglish || profile.addressMyanmar),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

/** Standalone browser-print document for the customer copy; no internal evidence is added. */
export function shopCustomerReceiptDocument(ack: CommerceOrderAcknowledgement, profile: CommerceMerchantProfile, locale: UiLocale = 'en') {
  const title = escapeHtml(ack.orderId)
  const receipt = escapeHtml(shopCustomerReceiptText(ack, profile, locale))
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${locale === 'my' ? 'အရောင်းပြေစာ' : 'Sales receipt'} ${title}</title>
  <style>${CUSTOMER_RECEIPT_PRINT_STYLES}</style>
</head>
<body>${receipt}</body>
</html>`
}

/** Printer check only: no order, customer, payment, or inventory record is created. */
export function shopCustomerReceiptTestDocument(profile: CommerceMerchantProfile, locale: UiLocale = 'en') {
  const my = locale === 'my'
  const header = merchantHeader(profile, locale)
  const title = escapeHtml((my ? profile.nameMyanmar || profile.nameEnglish : profile.nameEnglish || profile.nameMyanmar) || 'Shop')
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${my ? 'ပရင်တာ စမ်းသပ်မှု' : 'Printer test'} · ${title}</title>
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
  <h1>${my ? 'အရောင်းပြေစာ' : 'Sales receipt'}</h1>
  <p class="test-mark">${my ? 'စမ်းသပ်စာရွက်' : 'Printer test only'}</p>
  <p>${my ? 'ဤစာရွက်သည် စမ်းသပ်ရန်သာဖြစ်ပြီး အရောင်းမဟုတ်ပါ။ ငွေပေးချေရန် မလိုပါ။' : 'This test slip is not a sale. No payment is due.'}</p>
  <p>${my ? 'စာလုံးဖတ်ရှုနိုင်မှု' : 'Text and alignment'}</p>
  <p>${my ? '၁၂၃၄၅၆၇၈၉၀' : '1234567890'} · 5,000 MMK</p>
  <hr class="divider">
  <p>${my ? 'ကျေးဇူးတင်ပါသည်' : 'Thank you'}</p>
</body>
</html>`
}
