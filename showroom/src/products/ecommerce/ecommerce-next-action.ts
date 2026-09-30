export type EcommerceAttentionInput = {
  agedRequestCount: number
  expiringQuoteCount: number
  paymentAttentionCount: number
  paymentRiskCount: number
  pendingRequestCount: number
  refundAttentionCount: number
  stockRiskCount: number
}

export type EcommerceAttentionDecision = {
  action: string
  filter: 'aged' | 'all' | 'expiring' | 'payment' | 'stock'
  headline: string
  kind: 'shop-orders' | 'shop-request'
  summary: string
}

export function decideEcommerceAttention(input: EcommerceAttentionInput): EcommerceAttentionDecision | null {
  const counts = [input.agedRequestCount, input.expiringQuoteCount, input.paymentAttentionCount, input.paymentRiskCount, input.pendingRequestCount, input.refundAttentionCount, input.stockRiskCount]
  if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0)) throw new Error('Commerce attention counts must be non-negative safe integers.')

  if (input.refundAttentionCount) return {
    action: 'Review refunds in Shop',
    filter: 'all',
    headline: `${input.refundAttentionCount} refund${input.refundAttentionCount === 1 ? '' : 's'} need evidence`,
    kind: 'shop-orders',
    summary: 'Open the Shop order record and settle refund evidence before closing the customer issue.',
  }
  if (input.paymentAttentionCount) return {
    action: 'Review payments in Shop',
    filter: 'all',
    headline: `${input.paymentAttentionCount} payment${input.paymentAttentionCount === 1 ? '' : 's'} need confirmation`,
    kind: 'shop-orders',
    summary: 'Confirm payment evidence in Shop before completing fulfilment or telling the customer it is paid.',
  }
  if (input.stockRiskCount) return {
    action: 'Review stock-risk request',
    filter: 'stock',
    headline: `${input.stockRiskCount} request${input.stockRiskCount === 1 ? '' : 's'} exceed available stock`,
    kind: 'shop-request',
    summary: 'Open the affected request first. Shop confirms stock, substitutions, promise, payment, and customer contact.',
  }
  if (input.expiringQuoteCount) return {
    action: 'Review expiring quote',
    filter: 'expiring',
    headline: `${input.expiringQuoteCount} quote${input.expiringQuoteCount === 1 ? '' : 's'} expire soon`,
    kind: 'shop-request',
    summary: 'Open an expiring request before its reviewed price and fulfilment terms become stale.',
  }
  if (input.paymentRiskCount) return {
    action: 'Review payment request',
    filter: 'payment',
    headline: `${input.paymentRiskCount} request${input.paymentRiskCount === 1 ? '' : 's'} need payment review`,
    kind: 'shop-request',
    summary: 'Open the affected request and confirm its manual payment evidence before Shop accepts the order.',
  }
  if (input.agedRequestCount) return {
    action: 'Review aged request',
    filter: 'aged',
    headline: `${input.agedRequestCount} request${input.agedRequestCount === 1 ? ' has' : 's have'} waited over 30 minutes`,
    kind: 'shop-request',
    summary: 'Open an aged request and resolve its Shop review before taking another queue item.',
  }
  if (input.pendingRequestCount) return {
    action: 'Review next request',
    filter: 'all',
    headline: `${input.pendingRequestCount} order request${input.pendingRequestCount === 1 ? '' : 's'} need review`,
    kind: 'shop-request',
    summary: 'Open the next request. Shop confirms stock, payment, promise, delivery, and customer contact.',
  }
  return null
}
