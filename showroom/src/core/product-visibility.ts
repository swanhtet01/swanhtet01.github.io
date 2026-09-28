// Acquisition visibility is separate from retained product identity/storage.
// Shared by public generation and app setup consumers. No storage or network access.
type ProductIdentity = { id: string; runtimeId: string }
type VisibilitySource<T extends ProductIdentity> = {
  customerProducts: T[]
  productVisibility: {
    contract: string
    activeProductIds: string[]
    retainedOnlyProductIds: string[]
    retainedWorkspaceAccess: boolean
    deleteRetainedData: boolean
  }
}

export function activeProductContracts<T extends ProductIdentity>(source: VisibilitySource<T>): T[] {
  const policy = source?.productVisibility
  const products = source?.customerProducts
  const invalid = () => { throw new Error('product_visibility_contract_invalid') }
  if (!policy || policy.contract !== 'supermega.product-visibility.v1'
    || policy.retainedWorkspaceAccess !== true || policy.deleteRetainedData !== false
    || !Array.isArray(products) || !products.length
    || !Array.isArray(policy.activeProductIds) || !policy.activeProductIds.length
    || !Array.isArray(policy.retainedOnlyProductIds)) return invalid()
  const ids = products.map(product => product?.id)
  const runtimeIds = products.map(product => product?.runtimeId)
  const declared = [...policy.activeProductIds, ...policy.retainedOnlyProductIds]
  if ([...ids, ...runtimeIds, ...declared].some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id))
    || new Set(ids).size !== ids.length || new Set(runtimeIds).size !== runtimeIds.length
    || new Set(declared).size !== declared.length || declared.length !== ids.length
    || declared.some(id => !ids.includes(id))) return invalid()
  return policy.activeProductIds.map(id => products.find(product => product.id === id)!)
}
