import { parsePreviewAppBinding } from './public_preview_navigation.mjs'

export function previewProfile({ profile, expectedCommit, appBinding }) {
  if (!['production-contract', 'isolated-pair'].includes(profile)) throw new Error('public_preview_profile_required')
  if (!/^[a-f0-9]{40}$/.test(expectedCommit || '')) throw new Error('public_preview_commit_required')
  if (profile === 'production-contract') {
    if (appBinding !== undefined) throw new Error('public_preview_binding_unexpected')
    return { profile, expectedCommit, app: null }
  }
  const app = parsePreviewAppBinding(appBinding, expectedCommit, expectedCommit)
  if (!app) throw new Error('public_preview_binding_required')
  return { profile, expectedCommit, app }
}

export function validatePreviewContact(contact, policy) {
  const accepting = policy.profile === 'production-contract'
  if (contact?.service !== 'supermega-contact' || contact.accepting !== accepting
    || contact.status !== (accepting ? 'ready' : 'attention')) throw new Error('public_preview_contact_posture_wrong')
  if (contact.controls?.idempotency !== 'required' || contact.controls?.edge_rate_limit !== 'required') {
    throw new Error('preview_contact_controls_wrong')
  }
}

export function validatePreviewLinks(html, policy, products) {
  const active = products.filter(product => ['shop', 'website', 'ecommerce'].includes(product.id))
  if (active.length !== 3 || new Set(active.map(product => product.id)).size !== 3) throw new Error('public_preview_active_products_invalid')
  const origin = policy.app?.origin || 'https://app.supermega.dev'
  // Generated HTML uses double-quoted href attributes. Decode its entity form
  // without permitting a malformed absolute URL to disappear from validation.
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"<>]*)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
  for (const href of hrefs) {
    if (/\/plant(?:\/|\?|#|$)|\/operations\/production|[?&](?:product|demo)=(?:plant|production|factory)(?:&|$)/i.test(href)) throw new Error('public_preview_retired_entry')
    if (policy.app && /^https?:\/\//i.test(href)) {
      const url = new URL(href)
      if (url.hostname === 'app.supermega.dev' || (url.hostname.endsWith('.vercel.app') && url.origin !== origin)) throw new Error('public_preview_production_escape')
    }
  }
  for (const product of active) {
    const expected = product.id === 'shop' ? '/shop/?tab=today' : `/settings/?product=${product.id}`
    if (!hrefs.includes(`${origin}${expected}`)) throw new Error(`public_preview_action_missing:${product.id}`)
  }
  return { activeProducts: active.map(product => product.id), pairedOrigin: origin }
}

export function validatePreviewDeployment(deployment, { origin, projectId, deploymentId, commit }) {
  if (!deployment || deployment.id !== deploymentId || deployment.projectId !== projectId
    || `https://${deployment.url}` !== origin || deployment.readyState !== 'READY'
    || deployment.target === 'production'
    || deployment.meta?.githubCommitSha !== commit) throw new Error('public_preview_provider_binding_mismatch')
}
