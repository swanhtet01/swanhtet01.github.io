import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceRequestCustomerReferenceBrief = {
  totalRequests: number; uniqueCustomers: number; topCustomer: string | null; topCustomerCount: number
}
export function projectEcommerceRequestCustomerReferenceBrief(buying: EcommerceBuyingState): EcommerceRequestCustomerReferenceBrief {
  const total = buying.requests.length
  if (total === 0) return { totalRequests: 0, uniqueCustomers: 0, topCustomer: null, topCustomerCount: 0 }
  const counts = new Map<string, number>()
  for (const request of buying.requests) {
    counts.set(request.customerReference, (counts.get(request.customerReference) ?? 0) + 1)
  }
  let topCustomer: string | null = null; let topCustomerCount = 0
  for (const [key, count] of counts) { if (count > topCustomerCount) { topCustomerCount = count; topCustomer = key } }
  return { totalRequests: total, uniqueCustomers: counts.size, topCustomer, topCustomerCount }
}
