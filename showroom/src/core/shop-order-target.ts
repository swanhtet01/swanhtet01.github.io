/** A stable, non-customer URL fragment for a Shop order record. */
export function shopOrderTargetId(orderId: string) {
  return `shop-order-${orderId.replace(/[^A-Za-z0-9_-]+/g, '-')}`
}

export function shopOrderLink(orderId: string) {
  return `/shop/?tab=orders#${shopOrderTargetId(orderId)}`
}
