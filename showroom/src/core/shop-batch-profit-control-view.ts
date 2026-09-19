export const SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256 = 'd2968009e5eb18c44420e2fbbe6b40072e59b9bac0cda1e9ff531a4cae7b5910'
export const SHOP_BATCH_PROFIT_CONTROL_CONTRACT = 'supermega.shop.batch_profit_control.v1'

export type ShopBatchProfitControlState = 'no_batch' | 'collecting_batch_evidence' | 'review_adjustments' | 'batch_margin_at_risk' | 'batch_controlled'

export type ShopBatchProfitControlNoBatchProjection = {
  contract: typeof SHOP_BATCH_PROFIT_CONTROL_CONTRACT
  contractSourceSha256: typeof SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256
  state: 'no_batch'
  batchIdentity: null
  evidenceStatus: {
    canonicalDigestsComplete: false
    immutableRevisionLineageComplete: false
    reconciliationComplete: false
    batchSaleAllocationComplete: false
    crossBatchReuseAbsent: false
    retainedSalesEvidenceComplete: false
    productionQuantityCostCoverageComplete: false
    costEstimateBasisUnambiguous: false
    overheadReviewComplete: false
    adjustmentLinkageComplete: false
    profitStatus: 'withheld'
    withheldReasonCodes: ['no_batch']
  }
  totals: null
  estimatePreview: null
  priorities: []
  truthBoundary: {
    costLabel: 'Owner-reviewed production-cost estimate'
    classification: null
    boundary: string
    mayCountAsBaseline: false
    mayCountAsPilotRun: false
    mayCountAsCustomerEvidence: false
    mayCountAsCommercialProof: false
  }
  authority: {
    paymentWrite: false
    stockWrite: false
    supplierWrite: false
    accountingWrite: false
    customerWrite: false
    hostedWrite: false
    providerWrite: false
    modelUsed: false
  }
}

export function projectNoBatchProfitControl(): ShopBatchProfitControlNoBatchProjection {
  return {
    contract: SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
    contractSourceSha256: SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
    state: 'no_batch',
    batchIdentity: null,
    evidenceStatus: {
      canonicalDigestsComplete: false,
      immutableRevisionLineageComplete: false,
      reconciliationComplete: false,
      batchSaleAllocationComplete: false,
      crossBatchReuseAbsent: false,
      retainedSalesEvidenceComplete: false,
      productionQuantityCostCoverageComplete: false,
      costEstimateBasisUnambiguous: false,
      overheadReviewComplete: false,
      adjustmentLinkageComplete: false,
      profitStatus: 'withheld',
      withheldReasonCodes: ['no_batch'],
    },
    totals: null,
    estimatePreview: null,
    priorities: [],
    truthBoundary: {
      costLabel: 'Owner-reviewed production-cost estimate',
      classification: null,
      boundary: 'No batch is selected. Decision estimates and priorities are unavailable; no evidence or authority is inferred.',
      mayCountAsBaseline: false,
      mayCountAsPilotRun: false,
      mayCountAsCustomerEvidence: false,
      mayCountAsCommercialProof: false,
    },
    authority: {
      paymentWrite: false,
      stockWrite: false,
      supplierWrite: false,
      accountingWrite: false,
      customerWrite: false,
      hostedWrite: false,
      providerWrite: false,
      modelUsed: false,
    },
  }
}
