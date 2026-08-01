import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import {
  CLIENT_DEMO_PREPARATION_MAX_BYTES,
  verifyClientDemoPreparation,
} from './prepare_client_demo.mjs'

const ROOT = resolve(import.meta.dirname, '..')
export const INTEGRATED_CLIENT_PILOT_CONTRACT = 'supermega.integrated_client_pilot.v1'
export const CLIENT_BOUND_INTEGRATED_PILOT_CONTRACT = 'supermega.client_bound_integrated_pilot.v1'

const timeline = Object.freeze({
  websiteEvidence: [
    '2026-07-31T07:50:00.000Z',
    '2026-07-31T07:51:00.000Z',
    '2026-07-31T07:52:00.000Z',
  ],
  websiteApproval: '2026-07-31T07:53:00.000Z',
  websiteSnapshot: '2026-07-31T07:54:00.000Z',
  websiteIntake: '2026-07-31T07:55:00.000Z',
  websiteConversion: '2026-07-31T07:56:00.000Z',
  websitePromise: '2026-07-31T12:00:00.000Z',
  websitePreparing: '2026-07-31T07:57:00.000Z',
  websiteReady: '2026-07-31T07:58:00.000Z',
  websitePayment: '2026-07-31T07:59:00.000Z',
  websiteComplete: '2026-07-31T08:00:00.000Z',
  ecommerceRequest: '2026-07-31T08:01:00.000Z',
  ecommerceHandoff: '2026-07-31T08:02:00.000Z',
  ecommerceOrder: '2026-07-31T08:03:00.000Z',
  ecommercePromise: '2026-07-31T13:00:00.000Z',
  plantJob: '2026-07-31T08:04:00.000Z',
  plantDue: '2026-08-01T08:00:00.000Z',
  ecommercePreparing: '2026-07-31T08:05:00.000Z',
  ecommerceReady: '2026-07-31T08:06:00.000Z',
  ecommercePayment: '2026-07-31T08:07:00.000Z',
  ecommerceComplete: '2026-07-31T08:08:00.000Z',
})

function invariant(condition, reason) {
  if (!condition) throw new Error(reason)
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function proof(actionId, capturedAt, evidenceReference, reason) {
  return {
    actionId,
    capturedAt,
    actor: 'OP-OWNER',
    reason,
    evidenceReference,
  }
}

function moduleUrl(...segments) {
  return pathToFileURL(resolve(ROOT, ...segments)).href
}

async function productModules() {
  const nonce = Date.now()
  return Promise.all([
    import(`${moduleUrl('showroom', 'src', 'products', 'website', 'website-model.ts')}?integrated-pilot=${nonce}`),
    import(`${moduleUrl('showroom', 'src', 'products', 'ecommerce', 'storefront-model.ts')}?integrated-pilot=${nonce}`),
    import(`${moduleUrl('showroom', 'src', 'products', 'ecommerce', 'storefront-request.ts')}?integrated-pilot=${nonce}`),
    import(`${moduleUrl('showroom', 'src', 'products', 'ecommerce', 'ecommerce-shop-confirm.ts')}?integrated-pilot=${nonce}`),
    import(`${moduleUrl('showroom', 'src', 'core', 'commerce-workspace.ts')}?integrated-pilot=${nonce}`),
    import(`${moduleUrl('showroom', 'src', 'core', 'shop-production-demand.ts')}?integrated-pilot=${nonce}`),
    import(`${moduleUrl('showroom', 'src', 'core', 'production-workspace.ts')}?integrated-pilot=${nonce}`),
  ])
}

function releaseWebsite(website) {
  let workspace = website.createInitialWorkspace()
  const apply = (update) => {
    const result = website.applyWebsiteWorkspaceUpdate(workspace, update)
    if (!result.ok) throw new Error(result.error)
    workspace = result.workspace
  }
  for (const [index, kind] of ['content', 'responsive', 'links'].entries()) {
    apply((current) => website.recordWebsiteEvidence(current, {
      actionId: `PILOT-WEB-EVIDENCE-${kind.toUpperCase()}`,
      capturedAt: timeline.websiteEvidence[index],
      kind,
      finding: `${kind} evidence reviewed for the integrated pilot.`,
      reference: `PILOT-WEB-${kind.toUpperCase()}`,
      verifiedBy: 'OP-OWNER',
    }))
  }
  apply((current) => website.approveWebsiteRevision(current, {
    actionId: 'PILOT-WEB-APPROVAL',
    capturedAt: timeline.websiteApproval,
    reviewer: 'OP-OWNER',
    note: 'Approved for the isolated integrated client pilot.',
  }))
  apply((current) => website.recordWebsiteSnapshot(current, {
    actionId: 'PILOT-WEB-SNAPSHOT',
    capturedAt: timeline.websiteSnapshot,
  }))
  const approval = website.getCurrentApproval(workspace)
  const snapshot = website.getCurrentPublish(workspace)
  invariant(approval && snapshot, 'integrated_pilot_website_release_missing')
  invariant(
    website.readinessChecks(workspace).every((check) => check.passed),
    'integrated_pilot_website_release_not_ready',
  )
  return { workspace, approval, snapshot }
}

function closeOrder(commerce, state, orderId, prefix, times) {
  let current = commerce.advanceCommerceOrder(
    state,
    orderId,
    'confirmed',
    proof(`${prefix}-PREPARING`, times.preparing, `${prefix}:PREPARING`, 'Move the reviewed order into preparation.'),
  )
  invariant(current, `${prefix.toLowerCase()}_preparing_failed`)
  current = commerce.advanceCommerceOrder(
    current,
    orderId,
    'preparing',
    proof(`${prefix}-READY`, times.ready, `${prefix}:READY`, 'Mark the prepared order ready for handoff.'),
  )
  invariant(current, `${prefix.toLowerCase()}_ready_failed`)
  current = commerce.reconcileCommercePayment(
    current,
    orderId,
    proof(`${prefix}-PAYMENT`, times.payment, `${prefix}:PAYMENT`, 'Reconcile the reviewed pilot payment evidence.'),
  )
  invariant(current, `${prefix.toLowerCase()}_payment_failed`)
  current = commerce.advanceCommerceOrder(
    current,
    orderId,
    'ready',
    proof(`${prefix}-COMPLETE`, times.complete, `${prefix}:COMPLETE`, 'Complete the reviewed customer handoff.'),
  )
  invariant(current, `${prefix.toLowerCase()}_completion_failed`)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  invariant(
    order?.status === 'completed' && order.paymentStatus === 'reconciled',
    `${prefix.toLowerCase()}_close_not_persisted`,
  )
  return current
}

export async function runIntegratedClientPilots() {
  const [website, storefront, requestModel, ecommerceConfirm, commerce, demand, production] = await productModules()
  const release = releaseWebsite(website)
  let shop = commerce.createSeedCommerce(Date.parse('2026-07-31T07:45:00.000Z'))

  const websiteProductPage = release.workspace.pages.find((page) => page.id === 'page-products')
  invariant(websiteProductPage, 'integrated_pilot_website_product_page_missing')
  const websiteSource = {
    fingerprint: website.workspaceFingerprint(release.workspace),
    approvalId: release.approval.id,
    snapshotId: release.snapshot.id,
    pageId: websiteProductPage.id,
    siteName: release.workspace.siteName,
    pagePath: website.normalizeSlug(websiteProductPage.slug),
  }
  const websiteIntakeProof = proof(
    'PILOT-WEBSITE-INTAKE',
    timeline.websiteIntake,
    `WEBSITE:${release.snapshot.id}:${websiteProductPage.id}`,
    'Record the reviewed Website product request in Shop.',
  )
  shop = commerce.createCommerceWebsiteIntake(shop, {
    id: 'WINT-PILOT-WEBSITE-001',
    source: websiteSource,
    sku: 'SM-CARE-01',
    quantity: 1,
  }, websiteIntakeProof)
  invariant(shop, 'integrated_pilot_website_intake_failed')
  const websiteConversionProof = proof(
    'PILOT-WEBSITE-CONVERT',
    timeline.websiteConversion,
    websiteIntakeProof.evidenceReference,
    'Confirm the Website request against current Shop stock.',
  )
  shop = commerce.convertCommerceWebsiteIntake(shop, 'WINT-PILOT-WEBSITE-001', {
    customer: 'Website pilot customer',
    fulfilmentMethod: 'local_delivery',
    paymentMethod: 'manual_qr',
    promisedAt: timeline.websitePromise,
  }, websiteConversionProof)
  invariant(shop, 'integrated_pilot_website_conversion_failed')
  const websiteOrderId = 'ORD-WEB-PILOT-WEBSITE-001'
  invariant(shop.orders.some((order) => order.id === websiteOrderId), 'integrated_pilot_website_order_missing')
  shop = closeOrder(commerce, shop, websiteOrderId, 'PILOT-WEBSITE', {
    preparing: timeline.websitePreparing,
    ready: timeline.websiteReady,
    payment: timeline.websitePayment,
    complete: timeline.websiteComplete,
  })

  const storefrontInput = {
    storeName: 'Integrated Pilot Store',
    summary: 'A Shop-backed catalog with accountable order review.',
    selectedSkus: ['SM-1002', 'SM-CARE-01'],
  }
  const preview = storefront.buildStorefrontPreview(shop.items, storefrontInput)
  const previewDigest = await storefront.storefrontPreviewDigest(preview)
  const request = await requestModel.buildStorefrontOrderRequest(preview, previewDigest, {
    idempotencyKey: 'ECI-12345678-1234-4ABC-8ABC-1234567890AB',
    customerReference: 'Ecommerce pilot customer',
    sku: 'SM-1002',
    quantity: 3,
    fulfilment: 'pickup',
    createdAt: timeline.ecommerceRequest,
  })
  const requestLedger = requestModel.recordStorefrontOrderRequest(
    requestModel.createEmptyStorefrontRequestLedger(),
    request,
  )
  invariant(requestLedger, 'integrated_pilot_ecommerce_request_not_recorded')
  const draft = await ecommerceConfirm.confirmEcommerceShopDraft({
    request,
    requestLedger,
    preview,
    sourcePreviewDigest: previewDigest,
    currentCatalog: shop.items,
    confirmedAt: timeline.ecommerceHandoff,
  })
  const ecommerceOrderProof = proof(
    'PILOT-ECOMMERCE-ORDER',
    timeline.ecommerceOrder,
    draft.evidenceReference,
    'Confirm the Ecommerce quote against the current Shop catalog.',
  )
  const ecommerceCalculation = commerce.commerceOrderCalculation(shop, draft.totalMmk, ecommerceOrderProof.capturedAt)
  invariant(ecommerceCalculation, 'integrated_pilot_ecommerce_calculation_failed')
  const ecommerceOrder = {
    id: 'ORD-ECOMMERCE-PILOT-001',
    createdAt: ecommerceOrderProof.capturedAt,
    customer: draft.customerReference,
    owner: ecommerceOrderProof.actor,
    channel: 'Ecommerce',
    item: draft.line.name,
    itemSku: draft.line.sku,
    quantity: draft.line.quantity,
    payment: 'Cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    fulfilment: draft.fulfilment,
    fulfilmentReference: draft.id,
    promisedAt: timeline.ecommercePromise,
    paymentDueAt: ecommerceOrderProof.capturedAt,
    sourceRecordId: draft.sourceRequestId,
    evidenceReference: draft.evidenceReference,
    calculation: ecommerceCalculation,
    total: draft.totalMmk,
    status: 'confirmed',
  }
  shop = commerce.reserveCommerceOrder(shop, ecommerceOrder, ecommerceOrderProof)
  invariant(shop, 'integrated_pilot_ecommerce_shop_reservation_failed')

  const demandSignals = await demand.projectShopProductionDemand(shop, [])
  const demandSignal = demandSignals.find((candidate) => candidate.sku === draft.line.sku)
  invariant(demandSignal, 'integrated_pilot_shop_demand_missing')
  invariant(
    demandSignal.sourceOrderIds.includes(ecommerceOrder.id),
    'integrated_pilot_ecommerce_order_not_bound_to_plant_demand',
  )
  const plantProof = proof(
    'PILOT-PLANT-JOB',
    timeline.plantJob,
    demandSignal.evidenceReference,
    'Create one reviewed Plant job from current Shop demand.',
  )
  const plantJob = {
    id: demandSignal.suggestedJobId,
    line: 'Line 01',
    product: demandSignal.productName,
    target: demandSignal.recommendedBatchUnits,
    output: 0,
    owner: 'Plant planner',
    priority: 'normal',
    dueAt: timeline.plantDue,
    shopDemandSource: production.productionShopDemandSource({
      sourceSnapshot: demandSignal.sourceSnapshot,
      sourceDigest: demandSignal.sourceDigest,
      evidenceReference: demandSignal.evidenceReference,
    }),
  }
  const plant = production.registerProductionJob(production.createEmptyProduction(), plantJob, plantProof)
  invariant(plant, 'integrated_pilot_plant_job_failed')
  invariant(
    await demand.shopProductionDemandIsCurrent(demandSignal, shop, []),
    'integrated_pilot_shop_demand_became_stale_before_job',
  )

  shop = closeOrder(commerce, shop, ecommerceOrder.id, 'PILOT-ECOMMERCE', {
    preparing: timeline.ecommercePreparing,
    ready: timeline.ecommerceReady,
    payment: timeline.ecommercePayment,
    complete: timeline.ecommerceComplete,
  })
  invariant(
    !await demand.shopProductionDemandIsCurrent(demandSignal, shop, plant.jobs),
    'integrated_pilot_completed_order_left_stale_demand_current',
  )

  const websiteOrder = shop.orders.find((order) => order.id === websiteOrderId)
  const completedEcommerceOrder = shop.orders.find((order) => order.id === ecommerceOrder.id)
  const receipt = {
    ok: true,
    contract: INTEGRATED_CLIENT_PILOT_CONTRACT,
    mode: 'isolated_deterministic_rehearsal',
    products: ['Website', 'Ecommerce', 'Shop', 'Plant'],
    outcomes: {
      website: {
        releaseFingerprint: websiteSource.fingerprint,
        approvalId: release.approval.id,
        snapshotId: release.snapshot.id,
        shopOrderId: websiteOrder?.id,
        orderStatus: websiteOrder?.status,
      },
      ecommerce: {
        previewDigest,
        requestId: request.id,
        quoteTotalMmk: request.totalMmk,
        shopDraftId: draft.id,
        shopOrderId: completedEcommerceOrder?.id,
        orderStatus: completedEcommerceOrder?.status,
      },
      shop: {
        websiteOrderStatus: websiteOrder?.status,
        ecommerceOrderStatus: completedEcommerceOrder?.status,
        reconciledOrderCount: [websiteOrder, completedEcommerceOrder].filter((order) => order?.paymentStatus === 'reconciled').length,
        sourceBoundOrderCount: [websiteOrder, completedEcommerceOrder].filter((order) => Boolean(order?.sourceRecordId && order.evidenceReference)).length,
      },
      plant: {
        demandDigest: demandSignal.sourceDigest,
        demandOrderIds: demandSignal.sourceOrderIds,
        jobId: plantJob.id,
        targetUnits: plantJob.target,
        sourceAuthority: demandSignal.operatingContext.sourceAuthority,
        targetAuthority: demandSignal.operatingContext.targetAuthority,
      },
    },
    metrics: {
      productCount: 4,
      completedOrders: [websiteOrder, completedEcommerceOrder].filter((order) => order?.status === 'completed').length,
      reconciledPayments: [websiteOrder, completedEcommerceOrder].filter((order) => order?.paymentStatus === 'reconciled').length,
      demandBoundPlantJobs: plant.jobs.filter((job) => job.shopDemandSource).length,
      humanControlledActions: 16,
      externalWrites: 0,
      networkRequests: 0,
      modelCalls: 0,
    },
    controls: {
      syntheticFixture: true,
      managedPersistenceProven: false,
      productionActivationPerformed: false,
      customerMessageSent: false,
      paymentProviderCalled: false,
      deliveryProviderCalled: false,
      connectorCalls: 0,
      humanReviewRequired: true,
    },
  }
  invariant(receipt.metrics.completedOrders === 2, 'integrated_pilot_orders_not_closed')
  invariant(receipt.metrics.reconciledPayments === 2, 'integrated_pilot_payments_not_reconciled')
  invariant(receipt.metrics.demandBoundPlantJobs === 1, 'integrated_pilot_job_not_demand_bound')
  return receipt
}

export function bindIntegratedClientPilot(preparation, pilotReceipt, boundAt = new Date().toISOString()) {
  verifyClientDemoPreparation(preparation)
  invariant(
    typeof boundAt === 'string'
      && Number.isFinite(Date.parse(boundAt))
      && new Date(boundAt).toISOString() === boundAt,
    'client_bound_pilot_time_invalid',
  )
  invariant(
    pilotReceipt?.ok === true
      && pilotReceipt.contract === INTEGRATED_CLIENT_PILOT_CONTRACT
      && JSON.stringify(pilotReceipt.products) === JSON.stringify(['Website', 'Ecommerce', 'Shop', 'Plant'])
      && pilotReceipt.metrics?.completedOrders === 2
      && pilotReceipt.metrics?.reconciledPayments === 2
      && pilotReceipt.metrics?.demandBoundPlantJobs === 1
      && pilotReceipt.metrics?.externalWrites === 0
      && pilotReceipt.metrics?.networkRequests === 0
      && pilotReceipt.metrics?.modelCalls === 0
      && pilotReceipt.controls?.syntheticFixture === true
      && pilotReceipt.controls?.managedPersistenceProven === false
      && pilotReceipt.controls?.productionActivationPerformed === false,
    'client_bound_pilot_evidence_invalid',
  )
  const selectedProducts = new Set(preparation.products.map((product) => product.product))
  const workflow = (id, label, requiredProducts, proof) => {
    const missingProducts = requiredProducts.filter((product) => !selectedProducts.has(product))
    return {
      id,
      label,
      requiredProducts,
      status: missingProducts.length ? 'not_selected' : 'ready_for_local_rehearsal',
      missingProducts,
      proof,
    }
  }
  const payload = {
    contract: CLIENT_BOUND_INTEGRATED_PILOT_CONTRACT,
    boundAt,
    preparation: {
      contract: preparation.contract,
      bundleDigest: preparation.bundleDigest,
      presetId: preparation.client.presetId,
      shopIndustryPackId: preparation.client.shopIndustryPackId,
      plantIndustryPackId: preparation.client.plantIndustryPackId,
      containsNormalizedClientData: preparation.controls.containsNormalizedClientData,
      containsSampleFixtures: preparation.controls.containsSampleFixtures,
      activationStatus: preparation.controls.activationStatus,
    },
    products: preparation.products.map((product) => ({
      product: product.product,
      label: product.label,
      templateId: product.templateId,
      sourceMode: product.sourceMode,
      rowCount: product.rowCount,
      previewDigest: product.previewDigest,
      packageDigest: product.packageDigest,
      demoPath: product.demoPath,
    })),
    workflows: [
      workflow(
        'quote_to_close',
        'Website and Ecommerce to completed Shop order',
        ['commerce', 'website', 'ecommerce'],
        {
          completedOrders: pilotReceipt.metrics.completedOrders,
          reconciledPayments: pilotReceipt.metrics.reconciledPayments,
          websiteReleaseFingerprint: pilotReceipt.outcomes.website.releaseFingerprint,
          ecommercePreviewDigest: pilotReceipt.outcomes.ecommerce.previewDigest,
        },
      ),
      workflow(
        'plan_to_stock',
        'Shop demand to accountable Plant job',
        ['commerce', 'production'],
        {
          demandBoundPlantJobs: pilotReceipt.metrics.demandBoundPlantJobs,
          demandDigest: pilotReceipt.outcomes.plant.demandDigest,
          sourceAuthority: pilotReceipt.outcomes.plant.sourceAuthority,
          targetAuthority: pilotReceipt.outcomes.plant.targetAuthority,
        },
      ),
    ],
    controls: {
      metadataOnly: true,
      containsClientValues: false,
      clientDataApplied: false,
      syntheticRuntimeProofOnly: true,
      localRehearsalRequired: true,
      humanReviewRequired: true,
      managedPersistenceProven: false,
      productionActivationPerformed: false,
      externalWrites: 0,
      networkRequests: 0,
      modelCalls: 0,
    },
  }
  return { ...payload, digest: sha256(JSON.stringify(payload)) }
}

async function preparationFromFile(pathValue) {
  invariant(typeof pathValue === 'string' && pathValue.trim(), 'client_bound_pilot_preparation_path_missing')
  const path = resolve(pathValue)
  const metadata = await lstat(path)
  invariant(metadata.isFile() && !metadata.isSymbolicLink(), 'client_bound_pilot_preparation_file_invalid')
  invariant(metadata.size > 0 && metadata.size <= CLIENT_DEMO_PREPARATION_MAX_BYTES, 'client_bound_pilot_preparation_size_invalid')
  const text = await readFile(path, 'utf8')
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('client_bound_pilot_preparation_json_invalid')
  }
  verifyClientDemoPreparation(value)
  return value
}

function parseArgs(argv) {
  const options = { preparationPath: '', boundAt: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--preparation') options.preparationPath = argv[++index] ?? ''
    else if (argument === '--bound-at') options.boundAt = argv[++index] ?? ''
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`integrated_client_pilot_unknown_argument:${argument}`)
  }
  return options
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === resolve(import.meta.filename)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write([
        'SuperMega integrated client pilot',
        '',
        '  npm run client:pilot:rehearse',
        '  npm run client:pilot:rehearse -- --preparation <private-review.json>',
        '',
        'Without a preparation file, runs the deterministic four-product fixture.',
        'With a verified preparation file, returns a metadata-only client-bound pilot receipt.',
        'No client values, product writes, network requests, model calls, or activation are performed.',
      ].join('\n') + '\n')
    } else {
      const pilot = await runIntegratedClientPilots()
      const output = options.preparationPath
        ? bindIntegratedClientPilot(
            await preparationFromFile(options.preparationPath),
            pilot,
            options.boundAt || new Date().toISOString(),
          )
        : pilot
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      contract: INTEGRATED_CLIENT_PILOT_CONTRACT,
      error: error instanceof Error ? error.message : 'Integrated client pilot failed.',
    })}\n`)
    process.exitCode = 1
  }
}
