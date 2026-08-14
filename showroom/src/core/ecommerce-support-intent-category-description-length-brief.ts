import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentCategoryDescriptionLengthBrief = {
  totalIntents: number
  orderStatusShortCount: number
  orderStatusDetailedCount: number
  deliveryIssueShortCount: number
  deliveryIssueDetailedCount: number
  paymentQuestionShortCount: number
  paymentQuestionDetailedCount: number
  itemIssueShortCount: number
  itemIssueDetailedCount: number
  otherShortCount: number
  otherDetailedCount: number
}

export function projectEcommerceSupportIntentCategoryDescriptionLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentCategoryDescriptionLengthBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderStatusShortCount: 0,
      orderStatusDetailedCount: 0,
      deliveryIssueShortCount: 0,
      deliveryIssueDetailedCount: 0,
      paymentQuestionShortCount: 0,
      paymentQuestionDetailedCount: 0,
      itemIssueShortCount: 0,
      itemIssueDetailedCount: 0,
      otherShortCount: 0,
      otherDetailedCount: 0,
    }
  }

  let orderStatusShortCount = 0
  let orderStatusDetailedCount = 0
  let deliveryIssueShortCount = 0
  let deliveryIssueDetailedCount = 0
  let paymentQuestionShortCount = 0
  let paymentQuestionDetailedCount = 0
  let itemIssueShortCount = 0
  let itemIssueDetailedCount = 0
  let otherShortCount = 0
  let otherDetailedCount = 0

  for (const intent of buying.supportIntents) {
    const isShort = intent.description.length <= 40
    if (intent.category === 'order_status') {
      if (isShort) orderStatusShortCount++
      else orderStatusDetailedCount++
    } else if (intent.category === 'delivery_issue') {
      if (isShort) deliveryIssueShortCount++
      else deliveryIssueDetailedCount++
    } else if (intent.category === 'payment_question') {
      if (isShort) paymentQuestionShortCount++
      else paymentQuestionDetailedCount++
    } else if (intent.category === 'item_issue') {
      if (isShort) itemIssueShortCount++
      else itemIssueDetailedCount++
    } else {
      if (isShort) otherShortCount++
      else otherDetailedCount++
    }
  }

  return {
    totalIntents: total,
    orderStatusShortCount,
    orderStatusDetailedCount,
    deliveryIssueShortCount,
    deliveryIssueDetailedCount,
    paymentQuestionShortCount,
    paymentQuestionDetailedCount,
    itemIssueShortCount,
    itemIssueDetailedCount,
    otherShortCount,
    otherDetailedCount,
  }
}
