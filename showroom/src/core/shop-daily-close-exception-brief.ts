import type { CommerceState } from './commerce-workspace.ts'

export type ShopDailyCloseExceptionBrief = {
  totalCloses: number
  closesWithOperator: number
  closesWithPaymentExceptions: number
  closesWithStockExceptions: number
  totalPaymentExceptionOrders: number
  totalStockExceptionSkus: number
  paymentExceptionRate: number
  stockExceptionRate: number
}

export function projectShopDailyCloseExceptionBrief(commerce: CommerceState): ShopDailyCloseExceptionBrief {
  const totalCloses = commerce.closes.length
  if (totalCloses === 0) {
    return {
      totalCloses: 0,
      closesWithOperator: 0,
      closesWithPaymentExceptions: 0,
      closesWithStockExceptions: 0,
      totalPaymentExceptionOrders: 0,
      totalStockExceptionSkus: 0,
      paymentExceptionRate: 0,
      stockExceptionRate: 0,
    }
  }

  let closesWithOperator = 0
  let closesWithPaymentExceptions = 0
  let closesWithStockExceptions = 0
  let totalPaymentExceptionOrders = 0
  let totalStockExceptionSkus = 0

  for (const close of commerce.closes) {
    if (close.operator !== undefined) closesWithOperator++

    if (close.paymentExceptionOrderIds && close.paymentExceptionOrderIds.length > 0) {
      closesWithPaymentExceptions++
      totalPaymentExceptionOrders += close.paymentExceptionOrderIds.length
    }

    if (close.stockExceptionSkus && close.stockExceptionSkus.length > 0) {
      closesWithStockExceptions++
      totalStockExceptionSkus += close.stockExceptionSkus.length
    }
  }

  return {
    totalCloses,
    closesWithOperator,
    closesWithPaymentExceptions,
    closesWithStockExceptions,
    totalPaymentExceptionOrders,
    totalStockExceptionSkus,
    paymentExceptionRate: Math.round((closesWithPaymentExceptions / totalCloses) * 100),
    stockExceptionRate: Math.round((closesWithStockExceptions / totalCloses) * 100),
  }
}
