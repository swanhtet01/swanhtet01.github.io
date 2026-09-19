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

export function validatePreviewLinks(html, policy, products, options = {}) {
  const active = products.filter(product => ['shop', 'website', 'ecommerce'].includes(product.id))
  if (active.length !== 3 || new Set(active.map(product => product.id)).size !== 3) throw new Error('public_preview_active_products_invalid')
  const origin = policy.app?.origin || 'https://app.supermega.dev'
  // Generated HTML uses double-quoted href attributes. Decode its entity form
  // without permitting a malformed absolute URL to disappear from validation.
  const hrefs = [...html.matchAll(/<a\b[^>]*>/gi)].map(match => {
    const attributes = [...match[0].matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    if (attributes.length !== 1) throw new Error('public_preview_anchor_shape_invalid')
    const href = attributes[0][1] ?? attributes[0][2] ?? attributes[0][3]
    return href.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
      const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]
      return String.fromCodePoint(parseInt(entity.slice(entity[2].toLowerCase() === 'x' ? 3 : 2, -1), entity[2].toLowerCase() === 'x' ? 16 : 10))
    })
  })
  const appPaths = new Set(['/login', '/shop/?tab=today', ...active.map(p => `/settings/?product=${p.id}`),
    ...(options.shopTemplateIds || []).map(id => `/shop/?template=${id}`),
    ...active.filter(p => p.id !== 'shop').flatMap(p => (p.templates || []).map(t => `/settings/?product=${p.id}&template=${t.id}`))])
  const publicOrigin = options.publicOrigin || 'https://supermega.dev'
  for (const href of hrefs) {
    if (!href || /[\s\\]|%|&(?:#|[a-z]+;)/i.test(href) || href.startsWith('//')) throw new Error('public_preview_href_unsafe')
    if (/\/plant(?:\/|\?|#|$)|\/operations\/production|[?&](?:product|demo)=(?:plant|production|factory)(?:&|$)/i.test(href)) throw new Error('public_preview_retired_entry')
    if (href === 'mailto:swanhtet@supermega.dev') continue
    const url = new URL(href, publicOrigin)
    if (url.username || url.password || url.protocol !== 'https:') throw new Error('public_preview_href_unsafe')
    if (url.origin === origin) {
      if (!appPaths.has(url.pathname + url.search + url.hash)) throw new Error('public_preview_app_route_invalid')
    } else if (url.origin !== publicOrigin) throw new Error('public_preview_production_escape')
    else if (!['/', '/shop/', '/website/', '/ecommerce/', '/contact/', '/privacy/'].includes(url.pathname)) throw new Error('public_preview_public_route_invalid')
  }
  for (const product of options.requireActions === false ? [] : active) {
    const expected = product.id === 'shop' ? '/shop/?tab=today' : `/settings/?product=${product.id}`
    if (!hrefs.includes(`${origin}${expected}`)) throw new Error(`public_preview_action_missing:${product.id}`)
  }
  return { activeProducts: active.map(product => product.id), pairedOrigin: origin }
}

export function validatePreviewDeployment(deployment, { origin, projectId, deploymentId, commit }) {
  if (!deployment || deployment.id !== deploymentId || deployment.projectId !== projectId
    || `https://${deployment.url}` !== origin || deployment.readyState !== 'READY'
    || !Object.hasOwn(deployment, 'target') || ![null, 'preview'].includes(deployment.target)
    || deployment.meta?.githubCommitSha !== commit) throw new Error('public_preview_provider_binding_mismatch')
}
