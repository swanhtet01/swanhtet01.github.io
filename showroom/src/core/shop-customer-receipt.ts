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
