import type { ArAgingSummary } from './shop-ar-aging-summary.ts'
import type { ApAgingSummary } from './shop-ap-aging-summary.ts'

export type WorkingCapitalAlert = {
  level: 'warn' | 'critical'
  message: string
}

export type WorkingCapitalSummary = {
  asOf: string
  totalArMmk: number
  totalApMmk: number
  netWorkingCapitalMmk: number
  overdueArMmk: number
  overdueApMmk: number
  netOverdueMmk: number
  pendingApReviewInvoices: number
  alerts: WorkingCapitalAlert[]
}

export function projectWorkingCapitalSummary(
  arAging: ArAgingSummary,
  apAging: ApAgingSummary,
  asOf: string,
): WorkingCapitalSummary {
  const totalArMmk = arAging.totalOutstandingMmk
  const totalApMmk = apAging.totalPayableMmk
  const netWorkingCapitalMmk = totalArMmk - totalApMmk
  const overdueArMmk = arAging.overdueMmk
  const overdueApMmk = apAging.overduePayableMmk
  const netOverdueMmk = overdueArMmk - overdueApMmk
  const pendingApReviewInvoices = apAging.pendingReviewInvoices
  const alerts: WorkingCapitalAlert[] = []
  if (netWorkingCapitalMmk < 0) {
    alerts.push({ level: 'critical', message: `Negative working capital: AP (${totalApMmk.toLocaleString()} MMK) exceeds AR (${totalArMmk.toLocaleString()} MMK).` })
  }
  if (overdueApMmk > overdueArMmk && overdueApMmk > 0) {
    alerts.push({ level: 'critical', message: `Overdue AP (${overdueApMmk.toLocaleString()} MMK) exceeds overdue AR (${overdueArMmk.toLocaleString()} MMK).` })
  } else if (overdueApMmk > 0) {
    alerts.push({ level: 'warn', message: `${apAging.overdueInvoices} overdue supplier invoice${apAging.overdueInvoices === 1 ? '' : 's'} totalling ${overdueApMmk.toLocaleString()} MMK.` })
  }
  if (pendingApReviewInvoices > 0) {
    alerts.push({ level: 'warn', message: `${pendingApReviewInvoices} supplier invoice${pendingApReviewInvoices === 1 ? '' : 's'} pending AP review.` })
  }
  return {
    asOf,
    totalArMmk,
    totalApMmk,
    netWorkingCapitalMmk,
    overdueArMmk,
    overdueApMmk,
    netOverdueMmk,
    pendingApReviewInvoices,
    alerts,
  }
}
