import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentCategoryRefundStartedBrief = {
  totalIntents: number
  orderStatusStartedCount: number
  orderStatusNotStartedCount: number
  deliveryIssueStartedCount: number
  deliveryIssueNotStartedCount: number
  paymentQuestionStartedCount: number
  paymentQuestionNotStartedCount: number
  itemIssueStartedCount: number
  itemIssueNotStartedCount: number
  otherStartedCount: number
  otherNotStartedCount: number
}

export function projectEcommerceSupportIntentCategoryRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentCategoryRefundStartedBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderStatusStartedCount: 0,
      orderStatusNotStartedCount: 0,
      deliveryIssueStartedCount: 0,
      deliveryIssueNotStartedCount: 0,
      paymentQuestionStartedCount: 0,
      paymentQuestionNotStartedCount: 0,
      itemIssueStartedCount: 0,
      itemIssueNotStartedCount: 0,
      otherStartedCount: 0,
      otherNotStartedCount: 0,
    }
  }

  let orderStatusStartedCount = 0
  let orderStatusNotStartedCount = 0
  let deliveryIssueStartedCount = 0
  let deliveryIssueNotStartedCount = 0
  let paymentQuestionStartedCount = 0
  let paymentQuestionNotStartedCount = 0
  let itemIssueStartedCount = 0
  let itemIssueNotStartedCount = 0
  let otherStartedCount = 0
  let otherNotStartedCount = 0

  for (const intent of buying.supportIntents) {
    const started = intent.refundStarted
    if (intent.category === 'order_status') {
      if (started) orderStatusStartedCount++
      else orderStatusNotStartedCount++
    } else if (intent.category === 'delivery_issue') {
      if (started) deliveryIssueStartedCount++
      else deliveryIssueNotStartedCount++
    } else if (intent.category === 'payment_question') {
      if (started) paymentQuestionStartedCount++
      else paymentQuestionNotStartedCount++
    } else if (intent.category === 'item_issue') {
      if (started) itemIssueStartedCount++
      else itemIssueNotStartedCount++
    } else {
      if (started) otherStartedCount++
      else otherNotStartedCount++
    }
  }

  return {
    totalIntents: total,
    orderStatusStartedCount,
    orderStatusNotStartedCount,
    deliveryIssueStartedCount,
    deliveryIssueNotStartedCount,
    paymentQuestionStartedCount,
    paymentQuestionNotStartedCount,
    itemIssueStartedCount,
    itemIssueNotStartedCount,
    otherStartedCount,
    otherNotStartedCount,
  }
}
