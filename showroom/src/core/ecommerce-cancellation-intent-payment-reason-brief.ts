import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentPaymentReasonBrief = {
  totalIntents: number
  pendingCount: number
  reconciledCount: number
  pendingTopReasonCode: string | null
  pendingTopReasonCodeCount: number
  reconciledTopReasonCode: string | null
  reconciledTopReasonCodeCount: number
}

export function projectEcommerceCancellationIntentPaymentReasonBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentPaymentReasonBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      pendingCount: 0,
      reconciledCount: 0,
      pendingTopReasonCode: null,
      pendingTopReasonCodeCount: 0,
      reconciledTopReasonCode: null,
      reconciledTopReasonCodeCount: 0,
    }
  }

  let pendingCount = 0
  let reconciledCount = 0
  const pendingFreq = new Map<string, number>()
  const reconciledFreq = new Map<string, number>()

  for (const intent of buying.cancellationIntents) {
    const code = intent.reasonCode
    if (intent.paymentStatus === 'pending') {
      pendingCount++
      pendingFreq.set(code, (pendingFreq.get(code) ?? 0) + 1)
    } else {
      reconciledCount++
      reconciledFreq.set(code, (reconciledFreq.get(code) ?? 0) + 1)
    }
  }

  let pendingTopReasonCode: string | null = null
  let pendingTopReasonCodeCount = 0
  for (const [code, count] of pendingFreq) {
    if (count > pendingTopReasonCodeCount) {
      pendingTopReasonCode = code
      pendingTopReasonCodeCount = count
    }
  }

  let reconciledTopReasonCode: string | null = null
  let reconciledTopReasonCodeCount = 0
  for (const [code, count] of reconciledFreq) {
    if (count > reconciledTopReasonCodeCount) {
      reconciledTopReasonCode = code
      reconciledTopReasonCodeCount = count
    }
  }

  return {
    totalIntents: total,
    pendingCount,
    reconciledCount,
    pendingTopReasonCode,
    pendingTopReasonCodeCount,
    reconciledTopReasonCode,
    reconciledTopReasonCodeCount,
  }
}
