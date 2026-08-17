import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceDeliveryAddressInstructionsBrief = {
  totalRequests: number
  requestsWithDeliveryAddress: number
  requestsWithInstructions: number
  instructionsPresenceRate: number
  uniqueInstructions: number
  topInstructionsByCount: Array<{ text: string; count: number }>
}

export function projectEcommerceDeliveryAddressInstructionsBrief(
  buying: EcommerceBuyingState,
): EcommerceDeliveryAddressInstructionsBrief {
  let totalRequests = 0
  let requestsWithDeliveryAddress = 0
  let requestsWithInstructions = 0
  const instructionMap = new Map<string, number>()

  for (const req of buying.requests) {
    totalRequests++
    const addr = req.deliveryAddress
    if (addr == null) continue
    requestsWithDeliveryAddress++
    if (addr.instructions !== null) {
      requestsWithInstructions++
      const text = addr.instructions
      instructionMap.set(text, (instructionMap.get(text) ?? 0) + 1)
    }
  }

  const topInstructionsByCount = Array.from(instructionMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, 5)

  return {
    totalRequests,
    requestsWithDeliveryAddress,
    requestsWithInstructions,
    instructionsPresenceRate:
      requestsWithDeliveryAddress > 0
        ? Math.round((requestsWithInstructions / requestsWithDeliveryAddress) * 100)
        : 0,
    uniqueInstructions: instructionMap.size,
    topInstructionsByCount,
  }
}
