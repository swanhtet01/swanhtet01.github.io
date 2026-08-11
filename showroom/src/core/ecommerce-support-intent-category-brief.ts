import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentCategoryBrief = {
  totalIntents: number
  orderStatusCount: number
  deliveryIssueCount: number
  paymentQuestionCount: number
  itemIssueCount: number
  otherCount: number
  orderStatusRate: number
  deliveryIssueRate: number
  paymentQuestionRate: number
  itemIssueRate: number
  otherRate: number
}

export function projectEcommerceSupportIntentCategoryBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentCategoryBrief {
  let orderStatusCount = 0
  let deliveryIssueCount = 0
  let paymentQuestionCount = 0
  let itemIssueCount = 0
  let otherCount = 0

  for (const intent of buying.supportIntents) {
    switch (intent.category) {
      case 'order_status': orderStatusCount++; break
      case 'delivery_issue': deliveryIssueCount++; break
      case 'payment_question': paymentQuestionCount++; break
      case 'item_issue': itemIssueCount++; break
      default: otherCount++; break
    }
  }

  const totalIntents = orderStatusCount + deliveryIssueCount + paymentQuestionCount + itemIssueCount + otherCount

  return {
    totalIntents,
    orderStatusCount,
    deliveryIssueCount,
    paymentQuestionCount,
    itemIssueCount,
    otherCount,
    orderStatusRate: totalIntents > 0 ? Math.round((orderStatusCount / totalIntents) * 100) : 0,
    deliveryIssueRate: totalIntents > 0 ? Math.round((deliveryIssueCount / totalIntents) * 100) : 0,
    paymentQuestionRate: totalIntents > 0 ? Math.round((paymentQuestionCount / totalIntents) * 100) : 0,
    itemIssueRate: totalIntents > 0 ? Math.round((itemIssueCount / totalIntents) * 100) : 0,
    otherRate: totalIntents > 0 ? Math.round((otherCount / totalIntents) * 100) : 0,
  }
}
