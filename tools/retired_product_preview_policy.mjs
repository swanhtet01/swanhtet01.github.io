// Shared acceptance policy only. Browser capture must supply both observations;
// synthetic unit fixtures are never hosted evidence.
export const RETIRED_PRODUCT_PREVIEW_POLICY = 'supermega.retired-product-preview.v1'
export const RETIRED_PRODUCT_ROUTES = Object.freeze([
  '/plant/', '/plant/?tab=production', '/operations/production/',
  '/?demo=plant', '/?demo=factory',
  '/settings/?product=plant', '/settings/?product=production',
])
export const RETIRED_STORAGE_KEYS = Object.freeze([
  'supermega.production.workspace.v2', 'supermega.production.workspace.v1',
  'supermega.plant.workspace.v2', 'supermega.product_setups.v1',
])
export const RETIRED_PRODUCT_CASES = Object.freeze(RETIRED_PRODUCT_ROUTES.flatMap((route, index) =>
  [{ width: 1280, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]
    .map(viewport => Object.freeze({
      id: `retired_plant_${index}_${viewport.mobile ? 'mobile' : 'desktop'}`,
      route, ...viewport, expectedPath: '/?choose=1',
    }))))

const fail = code => { throw new Error(`retired_product_preview_${code}`) }
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

export function validateRetiredProductObservation({ policy, caseId, origin, before, after, retainedBefore }) {
  if (policy !== RETIRED_PRODUCT_PREVIEW_POLICY) fail('policy_mismatch')
  const spec = RETIRED_PRODUCT_CASES.find(item => item.id === caseId)
  if (!spec) fail('case_unknown')
  let parsed
  try { parsed = new URL(origin) } catch { fail('origin_invalid') }
  if (parsed.origin !== origin || !['https:', 'http:'].includes(parsed.protocol)
    || parsed.username || parsed.password) fail('origin_invalid')
  if (!record(retainedBefore) || Object.keys(retainedBefore).length !== RETIRED_STORAGE_KEYS.length
    || RETIRED_STORAGE_KEYS.some(key => !Object.hasOwn(retainedBefore, key)
      || !(retainedBefore[key] === null || typeof retainedBefore[key] === 'string'))) fail('baseline_missing')
  for (const state of [before, after]) {
    if (!record(state) || state.origin !== origin || state.path !== spec.expectedPath || state.hash !== '') fail('location_mismatch')
    if (state.viewportWidth !== spec.width || state.viewportHeight !== spec.height) fail('viewport_mismatch')
    const expected = [['Shop', '/shop/'], ['Ecommerce', '/ecommerce/'], ['Website', '/website/']]
    if (!Array.isArray(state.launcherLinks) || state.launcherLinks.length !== expected.length
      || state.launcherLinks.some((link, index) => link?.name !== expected[index][0] || link?.href !== expected[index][1])) fail('launcher_mismatch')
    // Collector must inspect rendered controls, not infer absence from redirect.
    if (state.retiredToolVisible !== false || state.retiredActionVisible !== false) fail('retired_ui_present_or_unknown')
    if (!record(state.retained) || Object.keys(state.retained).length !== RETIRED_STORAGE_KEYS.length
      || RETIRED_STORAGE_KEYS.some(key => !Object.hasOwn(state.retained, key)
        || state.retained[key] !== retainedBefore[key])) fail('retained_data_changed')
  }
  // No raw local records are returned in the evidence summary.
  return { policy, caseId, redirectVerified: true, activeChooserVerified: true,
    retiredUiAbsent: true, retainedDataUnchanged: true }
}
