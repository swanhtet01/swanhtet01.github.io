import type { CommerceState } from './commerce-workspace.ts'

export type CustomerMetrics = {
  customer: string
  orderCount: number
  totalRevenue: number
  completedOrders: number
  cancelledOrders: number
  lastOrderDate: string | undefined
}

export type CustomerJourneySummary = {
  uniqueCustomers: number
  repeatCustomers: number
  topCustomers: CustomerMetrics[]
  newCustomers: number
  averageOrdersPerCustomer: number
}

export function projectCustomerJourneySummary(
  commerce: CommerceState,
  date?: string,
): CustomerJourneySummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true
  const byCustomer = new Map<string, CustomerMetrics>()

  for (const order of commerce.orders) {
    if (!filter(order.createdAt)) continue
    const existing = byCustomer.get(order.customer) ?? {
      customer: order.customer,
      orderCount: 0,
      totalRevenue: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      lastOrderDate: undefined,
    }
    if (order.status === 'cancelled') {
      existing.cancelledOrders += 1
    } else {
      existing.orderCount += 1
      existing.totalRevenue += order.total
      if (order.status === 'completed') existing.completedOrders += 1
      if (!existing.lastOrderDate || order.createdAt > existing.lastOrderDate) {
        existing.lastOrderDate = order.createdAt
      }
    }
    byCustomer.set(order.customer, existing)
  }

  const customers = Array.from(byCustomer.values()).filter((c) => c.orderCount > 0)
  const topCustomers = [...customers].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5)
  const repeatCustomers = customers.filter((c) => c.orderCount > 1).length
  const newCustomers = customers.filter((c) => c.orderCount === 1).length
  const totalOrders = customers.reduce((sum, c) => sum + c.orderCount, 0)
  const uniqueCustomers = customers.length

  return {
    uniqueCustomers,
    repeatCustomers,
    topCustomers,
    newCustomers,
    averageOrdersPerCustomer: uniqueCustomers > 0 ? Math.round((totalOrders / uniqueCustomers) * 10) / 10 : 0,
  }
}
