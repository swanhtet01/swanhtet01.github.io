import { authorizedRequest, type ManagedIdentity } from '../../core/managed-trial'

export type ManagedCommercePublicPublication = {
  handle: string
  enabled: boolean
  sourceRevision: number
  previewDigest: string
  publishedAt: string
}

export type ManagedCommercePublicRequest = {
  handle: string
  requestId: string
  shopRequestId: string
  status: 'new' | 'in_shop'
  receivedAt: string
  request: {
    id: string
    customerReference: string
    fulfilment: 'pickup' | 'delivery'
    totalMmk: number
    lines: Array<{ sku: string; name: string; quantity: number }>
    customerProfile?: { phone: string }
  }
}

export async function loadManagedCommercePublications(identity: ManagedIdentity) {
  return authorizedRequest<{ publications: ManagedCommercePublicPublication[] }>(
    '/api/trial/v1/commerce-publications', { cache: 'no-store', credentials: 'omit' }, true, identity)
}

export async function publishManagedCommerceStorefront(identity: ManagedIdentity, expectedVersion: number) {
  return authorizedRequest<{ handle: string; enabled: boolean; previewDigest: string }>(
    '/api/trial/v1/commerce-publications',
    { method: 'POST', credentials: 'omit', body: JSON.stringify({ expectedVersion }) }, true, identity)
}

export async function revokeManagedCommerceStorefront(identity: ManagedIdentity, handle: string, previewDigest: string) {
  return authorizedRequest<{ handle: string; enabled: boolean }>(
    `/api/trial/v1/commerce-publications/${encodeURIComponent(handle)}/revoke`,
    { method: 'POST', credentials: 'omit', body: JSON.stringify({ previewDigest }) }, true, identity)
}

export async function loadManagedCommercePublicInbox(identity: ManagedIdentity, after?: string) {
  return authorizedRequest<{ requests: ManagedCommercePublicRequest[]; nextCursor: string | null }>(
    '/api/trial/v1/commerce-public-inbox' + (after ? `?after=${encodeURIComponent(after)}` : ''),
    { cache: 'no-store', credentials: 'omit' }, true, identity)
}

export async function claimManagedCommercePublicRequest(identity: ManagedIdentity, handle: string, requestId: string) {
  return authorizedRequest<{ status: 'in_shop'; shopRequestId: string; priceChanged: boolean }>(
    `/api/trial/v1/commerce-public-inbox/${encodeURIComponent(handle)}/${encodeURIComponent(requestId)}/claim`,
    { method: 'POST', credentials: 'omit', body: '{}' }, true, identity)
}
