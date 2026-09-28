import type { ShopRevenueSummary } from './shop-revenue-summary.ts'
import type { PlantOeeSummary } from './plant-oee-summary.ts'
import type { WebsiteLeadSummary } from './website-lead-summary.ts'
import type { EcommercePipelineSummary } from './ecommerce-pipeline-summary.ts'
import type { CustomerJourneySummary } from './customer-journey-summary.ts'

export type OperatingAlert = {
  product: 'shop' | 'plant' | 'website' | 'ecommerce' | 'crm'
  level: 'warn' | 'critical'
  message: string
}

export type LocalProductEvidenceState = 'no_local_records' | 'browser_local_records_present'

export type CeoOperatingBrief = {
  asOf: string
  evidenceBoundary: {
    scope: 'browser_local_unverified'
    source: 'this_device_saved_workspace'
    localRecordProductCount: number
    pilotEvidenceProven: false
    customerEvidenceProven: false
    commercialPerformanceProven: false
    productionTelemetryObserved: false
    products: {
      shop: LocalProductEvidenceState
      plant: LocalProductEvidenceState
      website: LocalProductEvidenceState
      ecommerce: LocalProductEvidenceState
    }
  }
  shopRevenue: {
    totalRevenue: number
    orderCount: number
    completedCount: number
    cancelledCount: number
    averageOrderValue: number
  }
  plantOee: {
    totalJobs: number
    closedJobs: number
    openJobs: number
    onHoldJobs: number
    overdueJobs: number
    qualityRate: number
  }
  websiteLeads: {
    totalLeads: number
    newLeads: number
    qualifiedLeads: number
    closedLeads: number
    qualificationRate: number
    closureRate: number
  }
  ecommercePipeline: {
    totalRequests: number
    pendingReturnIntents: number
    pendingCancellationIntents: number
  }
  crmJourney: {
    uniqueCustomers: number
    repeatCustomers: number
    newCustomers: number
    averageOrdersPerCustomer: number
  }
  alerts: OperatingAlert[]
}

export function projectCeoOperatingBrief(
  shopRevenue: ShopRevenueSummary,
  plantOee: PlantOeeSummary,
  websiteLeads: WebsiteLeadSummary,
  ecommercePipeline: EcommercePipelineSummary,
  crmJourney: CustomerJourneySummary,
  asOf: string,
): CeoOperatingBrief {
  const alerts: OperatingAlert[] = []
  const evidenceProducts = {
    shop: shopRevenue.orderCount + shopRevenue.cancelledCount > 0
      ? 'browser_local_records_present'
      : 'no_local_records',
    plant: plantOee.totalJobs > 0 ? 'browser_local_records_present' : 'no_local_records',
    website: websiteLeads.totalLeads > 0 ? 'browser_local_records_present' : 'no_local_records',
    ecommerce: ecommercePipeline.totalRequests
      + ecommercePipeline.pendingReturnIntents
      + ecommercePipeline.pendingCancellationIntents > 0
      ? 'browser_local_records_present'
      : 'no_local_records',
  } satisfies CeoOperatingBrief['evidenceBoundary']['products']

  if (shopRevenue.cancelledCount > 0) {
    const cancelRate = Math.round(
      (shopRevenue.cancelledCount / (shopRevenue.orderCount + shopRevenue.cancelledCount)) * 100,
    )
    if (cancelRate >= 25) {
      alerts.push({ product: 'shop', level: 'critical', message: `High cancellation rate: ${cancelRate}%` })
    } else if (cancelRate >= 10) {
      alerts.push({ product: 'shop', level: 'warn', message: `Elevated cancellation rate: ${cancelRate}%` })
    }
  }

  if (plantOee.overdueJobs > 0) {
    alerts.push({
      product: 'plant',
      level: plantOee.overdueJobs >= 3 ? 'critical' : 'warn',
      message: `${plantOee.overdueJobs} overdue job${plantOee.overdueJobs > 1 ? 's' : ''}`,
    })
  }
  if (plantOee.onHoldJobs > 0) {
    alerts.push({
      product: 'plant',
      level: 'warn',
      message: `${plantOee.onHoldJobs} job${plantOee.onHoldJobs > 1 ? 's' : ''} on quality hold`,
    })
  }
  if (plantOee.totalTarget > 0 && plantOee.qualityRate < 70) {
    alerts.push({ product: 'plant', level: 'critical', message: `Low quality rate: ${plantOee.qualityRate}%` })
  }

  if (ecommercePipeline.pendingReturnIntents > 0) {
    alerts.push({
      product: 'ecommerce',
      level: 'warn',
      message: `${ecommercePipeline.pendingReturnIntents} pending return intent${ecommercePipeline.pendingReturnIntents > 1 ? 's' : ''}`,
    })
  }
  if (ecommercePipeline.pendingCancellationIntents > 0) {
    alerts.push({
      product: 'ecommerce',
      level: 'warn',
      message: `${ecommercePipeline.pendingCancellationIntents} pending cancellation${ecommercePipeline.pendingCancellationIntents > 1 ? 's' : ''}`,
    })
  }

  return {
    asOf,
    evidenceBoundary: {
      scope: 'browser_local_unverified',
      source: 'this_device_saved_workspace',
      localRecordProductCount: Object.values(evidenceProducts)
        .filter((state) => state === 'browser_local_records_present').length,
      pilotEvidenceProven: false,
      customerEvidenceProven: false,
      commercialPerformanceProven: false,
      productionTelemetryObserved: false,
      products: evidenceProducts,
    },
    shopRevenue: {
      totalRevenue: shopRevenue.totalRevenue,
      orderCount: shopRevenue.orderCount,
      completedCount: shopRevenue.completedCount,
      cancelledCount: shopRevenue.cancelledCount,
      averageOrderValue: shopRevenue.averageOrderValue,
    },
    plantOee: {
      totalJobs: plantOee.totalJobs,
      closedJobs: plantOee.closedJobs,
      openJobs: plantOee.openJobs,
      onHoldJobs: plantOee.onHoldJobs,
      overdueJobs: plantOee.overdueJobs,
      qualityRate: plantOee.qualityRate,
    },
    websiteLeads: {
      totalLeads: websiteLeads.totalLeads,
      newLeads: websiteLeads.newLeads,
      qualifiedLeads: websiteLeads.qualifiedLeads,
      closedLeads: websiteLeads.closedLeads,
      qualificationRate: websiteLeads.qualificationRate,
      closureRate: websiteLeads.closureRate,
    },
    ecommercePipeline: {
      totalRequests: ecommercePipeline.totalRequests,
      pendingReturnIntents: ecommercePipeline.pendingReturnIntents,
      pendingCancellationIntents: ecommercePipeline.pendingCancellationIntents,
    },
    crmJourney: {
      uniqueCustomers: crmJourney.uniqueCustomers,
      repeatCustomers: crmJourney.repeatCustomers,
      newCustomers: crmJourney.newCustomers,
      averageOrdersPerCustomer: crmJourney.averageOrdersPerCustomer,
    },
    alerts,
  }
}
