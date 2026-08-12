import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentCategoryRatesBrief = {
  totalIntents: number
  orderStatusCount: number
  orderStatusRate: number
  deliveryIssueCount: number
  deliveryIssueRate: number
  paymentQuestionCount: number
  paymentQuestionRate: number
  itemIssueCount: number
  itemIssueRate: number
  otherCategoryCount: number
  otherCategoryRate: number
}

export function projectEcommerceSupportIntentCategoryRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentCategoryRatesBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderStatusCount: 0,
      orderStatusRate: 0,
      deliveryIssueCount: 0,
      deliveryIssueRate: 0,
      paymentQuestionCount: 0,
      paymentQuestionRate: 0,
      itemIssueCount: 0,
      itemIssueRate: 0,
      otherCategoryCount: 0,
      otherCategoryRate: 0,
    }
  }

  let orderStatusCount = 0
  let deliveryIssueCount = 0
  let paymentQuestionCount = 0
  let itemIssueCount = 0
  let otherCategoryCount = 0

  for (const intent of buying.supportIntents) {
    switch (intent.category) {
      case 'order_status': orderStatusCount++; break
      case 'delivery_issue': deliveryIssueCount++; break
      case 'payment_question': paymentQuestionCount++; break
      case 'item_issue': itemIssueCount++; break
      default: otherCategoryCount++; break
    }
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    orderStatusCount,
    orderStatusRate: rate(orderStatusCount),
    deliveryIssueCount,
    deliveryIssueRate: rate(deliveryIssueCount),
    paymentQuestionCount,
    paymentQuestionRate: rate(paymentQuestionCount),
    itemIssueCount,
    itemIssueRate: rate(itemIssueCount),
    otherCategoryCount,
    otherCategoryRate: rate(otherCategoryCount),
  }
}
