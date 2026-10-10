import { useEffect, useState } from 'react'
import { commerceOrderAcknowledgementText, type CommerceOrder, type CommerceOrderAcknowledgement, type CommerceReturnDisposition, type CommerceSupportResolutionOutcome, type CommerceSupportPriority, type CommerceSupportServiceEventKind, type CommerceCorrectionKind, type CommerceCorrectionReasonCode } from './commerce-workspace'
import type { EcommerceReturnIntent, EcommerceSupportIntent, EcommerceCorrectionIntent } from '../products/ecommerce/ecommerce-buying-lifecycle'

export type CommerceReturnDraft = {
  orderId: string
  sku: string
  quantity: string
  disposition: CommerceReturnDisposition
  sourceIntent?: EcommerceReturnIntent
}

export type CommerceSupportResolutionDraft = {
  orderId: string
  caseId: string
  outcome: CommerceSupportResolutionOutcome
  note: string
}

export type CommerceSupportOpenDraft = {
  intent: EcommerceSupportIntent
  priority: CommerceSupportPriority
  owner: string
  dueAt: string
}

export type CommerceSupportReopenDraft = {
  orderId: string
  caseId: string
  sourceResolutionActionId: string
  priority: CommerceSupportPriority
  owner: string
  dueAt: string
  note: string
}

export type CommerceSupportServiceDraft = {
  orderId: string
  caseId: string
  kind: CommerceSupportServiceEventKind
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
  note: string
}

export type CommerceCorrectionDraft = {
  orderId: string
  kind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  listedAmountMmk: string
  sourceIntent?: EcommerceCorrectionIntent
  /**
   * Present when this draft is a POINTS REDEMPTION (S3 PR2): the credit
   * correction stays the money authority, and a redemption row keyed by the
   * same actionId records the points spent (shop-loyalty.ts module header).
   * kind/reasonCode are locked to credit/other; listedAmountMmk IS the points
   * (1 point = 1 MMK before tax).
   */
  loyalty?: { customer: string }
}

export type OrderAcknowledgementDownload = NonNullable<ReturnType<typeof orderAcknowledgementDownload>>

// Asked, not enumerated. The order list and the archive each render a handful of rows and ask
// this for those rows only; nothing else is ever built. It carries a `get` so the two call
// sites read as they always did, but it is a lookup and not a collection -- there is no set of
// downloads standing by behind it, which is the whole point.
export type OrderAcknowledgementLookup = { get: (orderId: string) => OrderAcknowledgementDownload | undefined }

export function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export function commerceOrderReturnLines(order: CommerceOrder) {
  return order.lines?.map((line) => ({
    sku: line.sku,
    name: line.variant ? `${line.name} · ${line.variant}` : line.name,
    quantity: line.quantity,
  })) ?? (order.itemSku ? [{ sku: order.itemSku, name: order.item, quantity: order.quantity }] : [])
}

export function commerceOrderDisplayReference(orderId: string) {
  const canonical = orderId.trim().toUpperCase()
  const match = /^ORD-([A-F0-9]{8})(?:-[A-F0-9-]+)?$/.exec(canonical)
  return match ? `#${match[1]}` : canonical
}

export function fulfilmentLabel(value: string | undefined) {
  if (value === 'pickup') return 'Pickup'
  if (value === 'delivery') return 'Delivery'
  return value ?? ''
}

export function formatMoney(value: number) {
  return `${new Intl.NumberFormat('en-US').format(value)} MMK`
}

export function formatTaxRate(rateBasisPoints: number) {
  return `${(rateBasisPoints / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

export function formatCommerceCalculation(calculation: NonNullable<CommerceOrder['calculation']>) {
  if (!('taxCode' in calculation)) {
    return `Subtotal ${formatMoney(calculation.subtotalMmk)} · Tax not configured · Total ${formatMoney(calculation.totalMmk)}`
  }
  const treatment = calculation.taxMode === 'inclusive' ? 'included' : 'added'
  const jurisdiction = calculation.taxJurisdictionCode ? ` · ${calculation.taxJurisdictionCode}` : ''
  return `Net ${formatMoney(calculation.subtotalMmk)} · Tax ${calculation.taxCode}${jurisdiction} ${formatTaxRate(calculation.taxRateBasisPoints)} ${treatment} ${formatMoney(calculation.taxMmk)} · Total ${formatMoney(calculation.totalMmk)}`
}

export function localDateTimeInputValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

// The bytes of the acknowledgement file, and nothing else. Kept as its own function so the
// artifact can be weighed without a DOM: this string IS the file the customer is handed, so a
// test that pins this pins what she gets.
//
// The U+FEFF byte-order mark is load-bearing and must stay. This file is opened by whatever
// the customer has -- Notepad, a spreadsheet, a phone viewer -- and without the mark a Burmese
// customer or product name comes back as mojibake. It is the opposite call from the workspace
// backup on the settings page, which must NOT carry one because loadBackupFile JSON.parses it
// back and a BOM is not JSON. Nothing reads this file back in.
export function orderAcknowledgementFileText(artifact: CommerceOrderAcknowledgement) {
  return `\uFEFF${commerceOrderAcknowledgementText(artifact)}`
}

// One row's receipt controls, built when that row asks for them.
//
// #538 took the FILE off this path: each of these used to carry a percent-encoded data: URL,
// 1,852,602 bytes of them alive for the life of the page at the workspace ceiling, rebuilt on
// every sale for a file at most one order is ever downloaded from. The artifact stayed,
// because `Boolean(acknowledgement)` decides whether an order shows any secondary actions at
// all and "View receipt" hands it straight to the dialog -- and it cost 53.9 ms EACH, which
// that PR filed as the larger bug rather than smuggling into its own change.
//
// This is that bug. The 53.9 ms was validateCommerceState re-checking the whole workspace once
// per order; the state is now validated once by the caller, and `read` is bound to it. Nothing
// about the document changed -- see the three properties pinned in
// tools/test_commerce_order_integrity.mjs.
export function orderAcknowledgementDownload(read: (orderId: string) => CommerceOrderAcknowledgement | null, orderId: string) {
  const artifact = read(orderId)
  if (!artifact) return null
  const safeOrderId = artifact.orderId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'order'
  return {
    artifact,
    filename: `supermega-${safeOrderId}-acknowledgement.txt`,
  }
}
