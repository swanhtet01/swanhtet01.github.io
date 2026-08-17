import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessageRequestedKindBrief = {
  totalIntents: number
  messageSentCreditCount: number
  messageSentDebitCount: number
  noMessageCreditCount: number
  noMessageDebitCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessageRequestedKindBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentCreditCount: 0,
      messageSentDebitCount: 0,
      noMessageCreditCount: 0,
      noMessageDebitCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentCreditCount = 0
  let messageSentDebitCount = 0
  let noMessageCreditCount = 0
  let noMessageDebitCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.customerMessageSent) {
      if (intent.requestedKind === 'credit') messageSentCreditCount++
      else messageSentDebitCount++
    } else {
      if (intent.requestedKind === 'credit') noMessageCreditCount++
      else noMessageDebitCount++
    }
  }

  return {
    totalIntents: total,
    messageSentCreditCount,
    messageSentDebitCount,
    noMessageCreditCount,
    noMessageDebitCount,
    messageSentCount: messageSentCreditCount + messageSentDebitCount,
    noMessageCount: noMessageCreditCount + noMessageDebitCount,
  }
}
