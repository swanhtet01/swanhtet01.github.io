import type { EcommerceOrderRequestV2 } from './ecommerce-buying-lifecycle'

// Memory-only acknowledgement; never infer delivery from a recovered local request.
export async function confirmManagedRequest(request: EcommerceOrderRequestV2, send: (request: EcommerceOrderRequestV2) => Promise<void>): Promise<string> {
  const identity = JSON.stringify(request)
  await send(request)
  return identity
}

export function managedRequestWasConfirmed(request: EcommerceOrderRequestV2 | null, confirmation: string): boolean {
  return Boolean(request && confirmation && JSON.stringify(request) === confirmation)
}
