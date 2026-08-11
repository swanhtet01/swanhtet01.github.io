import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderLifecycleSummary = {
  totalOrders: number
  withPaymentDecision: number
  withShippingDecision: number
  withTaxDecision: number
  withCreditExtension: number
  withCalculation: number
  withAdvancement: number
  withCompletion: number
  withReconciliation: number
}

export function projectShopOrderLifecycleSummary(commerce: CommerceState): ShopOrderLifecycleSummary {
  let totalOrders = 0
  let withPaymentDecision = 0
  let withShippingDecision = 0
  let withTaxDecision = 0
  let withCreditExtension = 0
  let withCalculation = 0
  let withAdvancement = 0
  let withCompletion = 0
  let withReconciliation = 0

  for (const order of commerce.orders) {
    totalOrders++
    if (order.paymentDecision !== undefined) withPaymentDecision++
    if (order.shippingDecision !== undefined) withShippingDecision++
    if (order.taxDecision !== undefined) withTaxDecision++
    if (order.creditDecision !== undefined) withCreditExtension++
    if (order.calculation !== undefined) withCalculation++
    if (order.advancementActionIds && order.advancementActionIds.length > 0) withAdvancement++
    if (order.completion !== undefined) withCompletion++
    if (order.paymentReconciledAt !== undefined) withReconciliation++
  }

  return {
    totalOrders,
    withPaymentDecision,
    withShippingDecision,
    withTaxDecision,
    withCreditExtension,
    withCalculation,
    withAdvancement,
    withCompletion,
    withReconciliation,
  }
}
