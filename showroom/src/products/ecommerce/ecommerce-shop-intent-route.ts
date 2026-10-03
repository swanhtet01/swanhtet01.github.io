import type {
  EcommerceCancellationIntent,
  EcommerceCorrectionIntent,
  EcommerceOrderAmendmentIntent,
  EcommerceOrderRescheduleIntent,
  EcommerceShopDraftV2,
  EcommerceReturnIntent,
  EcommerceSupportIntent,
} from './ecommerce-buying-lifecycle'

export const ecommerceShopIntentKinds = [
  'order',
  'return',
  'support',
  'correction',
  'cancellation',
  'amendment',
  'reschedule',
] as const

export type EcommerceShopIntentKind = typeof ecommerceShopIntentKinds[number]

export type EcommerceShopIntentReference = {
  kind: EcommerceShopIntentKind
  id: string
}

export type EcommerceShopNavigationIntents = {
  orderDraft: EcommerceShopDraftV2 | null
  returnIntent: EcommerceReturnIntent | null
  supportIntent: EcommerceSupportIntent | null
  correctionIntent: EcommerceCorrectionIntent | null
  cancellationIntent: EcommerceCancellationIntent | null
  amendmentIntent: EcommerceOrderAmendmentIntent | null
  rescheduleIntent: EcommerceOrderRescheduleIntent | null
}

const intentPrefixes: Record<EcommerceShopIntentKind, string> = {
  order: 'ECR',
  return: 'ERR',
  support: 'ESR',
  correction: 'ECO',
  cancellation: 'ECN',
  amendment: 'EAM',
  reschedule: 'ERS',
}

const uuidSuffix = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

function validIntentId(kind: EcommerceShopIntentKind, id: string) {
  return new RegExp(`^${intentPrefixes[kind]}-${uuidSuffix}$`, 'i').test(id)
}

export function ecommerceShopIntentReference(search: URLSearchParams): EcommerceShopIntentReference | null {
  if (search.get('source') !== 'ecommerce-handoff') return null
  const kind = search.get('handoff')
  const id = search.get('handoff_id')?.trim() ?? ''
  if (!ecommerceShopIntentKinds.includes(kind as EcommerceShopIntentKind)) return null
  const canonicalKind = kind as EcommerceShopIntentKind
  return validIntentId(canonicalKind, id) ? { kind: canonicalKind, id } : null
}

export function ecommerceShopIntentPath(kind: EcommerceShopIntentKind, id: string) {
  if (!validIntentId(kind, id)) throw new Error('The Ecommerce handoff identifier is invalid.')
  const search = new URLSearchParams({
    tab: 'orders',
    source: 'ecommerce-handoff',
    handoff: kind,
    handoff_id: id,
  })
  return `/shop/?${search.toString()}`
}
