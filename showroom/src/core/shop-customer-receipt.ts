import type { CommerceMerchantProfile, CommerceOrderAcknowledgement } from './commerce-workspace'

function formatMmk(amount: number) {
  return `${amount.toLocaleString('en-US')} MMK`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
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
    formatDate(ack.createdAt),
    `Order · ${ack.orderId}`,
    '',
    'ပစ္စည်း / ITEM',
    ...ack.lines.map((line) => `${line.name}${line.variant ? ` · ${line.variant}` : ''}  ×${line.quantity}  ${formatMmk(line.lineTotalMmk)}`),
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
  <style>
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
    }
  </style>
</head>
<body>${receipt}</body>
</html>`
}
