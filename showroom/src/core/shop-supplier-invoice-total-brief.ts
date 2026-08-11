import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierInvoiceTotalBrief = {
  totalInvoices: number
  totalInvoiceValueMmk: number
  averageInvoiceValueMmk: number
  minInvoiceValueMmk: number | null
  maxInvoiceValueMmk: number | null
  invoicesWithPayableReview: number
  payableReviewRate: number
}

export function projectShopSupplierInvoiceTotalBrief(
  commerce: CommerceState,
): ShopSupplierInvoiceTotalBrief {
  let totalInvoices = 0
  let totalInvoiceValueMmk = 0
  let minInvoiceValueMmk: number | null = null
  let maxInvoiceValueMmk: number | null = null
  let invoicesWithPayableReview = 0

  for (const po of commerce.purchaseOrders ?? []) {
    const inv = po.supplierInvoice
    if (inv === undefined) continue
    totalInvoices++
    totalInvoiceValueMmk += inv.totalMmk
    if (minInvoiceValueMmk === null || inv.totalMmk < minInvoiceValueMmk)
      minInvoiceValueMmk = inv.totalMmk
    if (maxInvoiceValueMmk === null || inv.totalMmk > maxInvoiceValueMmk)
      maxInvoiceValueMmk = inv.totalMmk
    if (inv.payableReview !== undefined) invoicesWithPayableReview++
  }

  return {
    totalInvoices,
    totalInvoiceValueMmk,
    averageInvoiceValueMmk:
      totalInvoices > 0 ? Math.round(totalInvoiceValueMmk / totalInvoices) : 0,
    minInvoiceValueMmk,
    maxInvoiceValueMmk,
    invoicesWithPayableReview,
    payableReviewRate:
      totalInvoices > 0
        ? Math.round((invoicesWithPayableReview / totalInvoices) * 100)
        : 0,
  }
}
