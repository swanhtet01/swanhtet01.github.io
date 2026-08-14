import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentCategoryExternalMessageBrief = {
  totalIntents: number
  orderStatusSentCount: number
  orderStatusNotSentCount: number
  deliveryIssueSentCount: number
  deliveryIssueNotSentCount: number
  paymentQuestionSentCount: number
  paymentQuestionNotSentCount: number
  itemIssueSentCount: number
  itemIssueNotSentCount: number
  otherSentCount: number
  otherNotSentCount: number
}

export function projectEcommerceSupportIntentCategoryExternalMessageBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentCategoryExternalMessageBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderStatusSentCount: 0,
      orderStatusNotSentCount: 0,
      deliveryIssueSentCount: 0,
      deliveryIssueNotSentCount: 0,
      paymentQuestionSentCount: 0,
      paymentQuestionNotSentCount: 0,
      itemIssueSentCount: 0,
      itemIssueNotSentCount: 0,
      otherSentCount: 0,
      otherNotSentCount: 0,
    }
  }

  let orderStatusSentCount = 0
  let orderStatusNotSentCount = 0
  let deliveryIssueSentCount = 0
  let deliveryIssueNotSentCount = 0
  let paymentQuestionSentCount = 0
  let paymentQuestionNotSentCount = 0
  let itemIssueSentCount = 0
  let itemIssueNotSentCount = 0
  let otherSentCount = 0
  let otherNotSentCount = 0

  for (const intent of buying.supportIntents) {
    const sent = intent.externalMessageSent
    if (intent.category === 'order_status') {
      if (sent) orderStatusSentCount++
      else orderStatusNotSentCount++
    } else if (intent.category === 'delivery_issue') {
      if (sent) deliveryIssueSentCount++
      else deliveryIssueNotSentCount++
    } else if (intent.category === 'payment_question') {
      if (sent) paymentQuestionSentCount++
      else paymentQuestionNotSentCount++
    } else if (intent.category === 'item_issue') {
      if (sent) itemIssueSentCount++
      else itemIssueNotSentCount++
    } else {
      if (sent) otherSentCount++
      else otherNotSentCount++
    }
  }

  return {
    totalIntents: total,
    orderStatusSentCount,
    orderStatusNotSentCount,
    deliveryIssueSentCount,
    deliveryIssueNotSentCount,
    paymentQuestionSentCount,
    paymentQuestionNotSentCount,
    itemIssueSentCount,
    itemIssueNotSentCount,
    otherSentCount,
    otherNotSentCount,
  }
}
