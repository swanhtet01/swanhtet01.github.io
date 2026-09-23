export const PAIRED_TRANSITION_CONTRACT = 'supermega.paired-preview-transition.v1'

export async function activateReadyPairedTransition({ state, publicOrigin, requiredText, activate }) {
  if (!state || state.origin !== publicOrigin || state.path !== '/' || state.hash !== ''
    || !(state.bodyLength > 0) || typeof state.text !== 'string'
    || !Array.isArray(requiredText) || requiredText.length === 0
    || requiredText.some(text => typeof text !== 'string' || !text.trim() || !state.text.includes(text))) {
    throw new Error('paired_transition_public_prerequisite_failed')
  }
  return activate()
}

function origins(publicOrigin, appOrigin) {
  for (const value of [publicOrigin, appOrigin]) {
    const url = new URL(value)
    if (url.origin !== value || url.protocol !== 'https:' || url.username || url.password
      || !url.hostname.endsWith('.vercel.app')) throw new Error('paired_transition_origin_invalid')
  }
  if (publicOrigin === appOrigin) throw new Error('paired_transition_origins_not_distinct')
}

// This builder is executed in an already isolated public-preview context.
// It inspects the exact visible primary href before dispatching a click.
export function pairedClickScript(publicOrigin, appOrigin) {
  origins(publicOrigin, appOrigin)
  const target = `${appOrigin}/shop/?tab=today`
  return `(() => {
    if (location.origin !== ${JSON.stringify(publicOrigin)} || location.pathname !== '/' || location.search || location.hash) throw new Error('paired_transition_public_location_wrong');
    const matches = [...document.querySelectorAll('a.button.primary')].filter(a => a.getClientRects().length && getComputedStyle(a).visibility !== 'hidden' && a.href === ${JSON.stringify(target)});
    if (matches.length !== 1) throw new Error('paired_transition_primary_action_ambiguous');
    const a = matches[0];
    if (a.target && a.target !== '_self' || a.hasAttribute('download') || a.getAttribute('aria-disabled') === 'true') throw new Error('paired_transition_action_unusable');
    const proof = { publicOrigin: location.origin, fromPath: '/', href: a.href, activated: true };
    a.click(); return proof;
  })()`
}

export function validatePairedTransition({ publicOrigin, appOrigin, click, beforeCapture, afterCapture, requests }) {
  origins(publicOrigin, appOrigin)
  if (!click || click.publicOrigin !== publicOrigin || click.fromPath !== '/'
    || click.href !== `${appOrigin}/shop/?tab=today` || click.activated !== true) throw new Error('paired_transition_click_invalid')
  for (const state of [beforeCapture, afterCapture]) {
    if (!state || state.origin !== appOrigin || state.path !== '/shop/?tab=today' || state.hash !== '') throw new Error('paired_transition_destination_invalid')
  }
  if (!Array.isArray(requests) || requests.length === 0) throw new Error('paired_transition_network_missing')
  const seen = new Set()
  for (const request of requests) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) throw new Error('paired_transition_write_observed')
    const url = new URL(request.url)
    if (url.username || url.password || ![publicOrigin, appOrigin].includes(url.origin)) throw new Error('paired_transition_external_request')
    seen.add(url.origin)
  }
  if (!seen.has(publicOrigin) || !seen.has(appOrigin)) throw new Error('paired_transition_pair_not_observed')
  return { contract: PAIRED_TRANSITION_CONTRACT, publicOrigin, appOrigin,
    targetPath: '/shop/?tab=today', visibleActionActivated: true,
    destinationStable: true, pairOnlyRequests: true, noMutatingRequests: true }
}
