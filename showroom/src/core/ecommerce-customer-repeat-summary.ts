import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceTopCustomerRecord = {
  customerReference: string
  requestCount: number
}

export type EcommerceCustomerRepeatSummary = {
  totalRequests: number
  uniqueCustomers: number
  repeatCustomers: number
  newCustomers: number
  averageRequestsPerCustomer: number
  topCustomers: EcommerceTopCustomerRecord[]
}

export function projectEcommerceCustomerRepeatSummary(buying: EcommerceBuyingState): EcommerceCustomerRepeatSummary {
  const customerMap = new Map<string, number>()

  for (const request of buying.requests) {
    customerMap.set(request.customerReference, (customerMap.get(request.customerReference) ?? 0) + 1)
  }

  let repeatCustomers = 0
  let newCustomers = 0

  for (const count of customerMap.values()) {
    if (count > 1) repeatCustomers++
    else newCustomers++
  }

  const topCustomers: EcommerceTopCustomerRecord[] = Array.from(customerMap.entries())
    .map(([customerReference, requestCount]) => ({ customerReference, requestCount }))
    .sort((a, b) => b.requestCount - a.requestCount || a.customerReference.localeCompare(b.customerReference))
    .slice(0, 5)

  const uniqueCustomers = customerMap.size

  return {
    totalRequests: buying.requests.length,
    uniqueCustomers,
    repeatCustomers,
    newCustomers,
    averageRequestsPerCustomer: uniqueCustomers > 0 ? Math.round(buying.requests.length / uniqueCustomers) : 0,
    topCustomers,
  }
}
