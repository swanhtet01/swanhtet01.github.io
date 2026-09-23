// Build-time navigation binding only. The deploy orchestrator must independently
// verify project ownership, effective environment isolation and access protection.
// Possession of this metadata is not deployment or tenant authorization.
export function parsePreviewAppBinding(raw, releaseCommit, checkoutCommit) {
  if (raw === undefined) return null
  let binding
  try { binding = JSON.parse(raw) } catch { throw new Error('public_preview_binding_invalid') }
  if (!binding || Array.isArray(binding)
    || Object.keys(binding).sort().join(',') !== 'commit,deploymentId,origin,projectId'
    || binding.projectId !== 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
    || typeof binding.commit !== 'string' || !/^[a-f0-9]{40}$/.test(binding.commit)
    || binding.commit !== releaseCommit || binding.commit !== checkoutCommit
    || typeof binding.deploymentId !== 'string' || !/^dpl_[A-Za-z0-9]{8,80}$/.test(binding.deploymentId)
    || typeof binding.origin !== 'string'
    || !/^https:\/\/megaos-[a-z0-9]{9}-swanhtet01s-projects\.vercel\.app$/.test(binding.origin)) {
    throw new Error('public_preview_binding_invalid')
  }
  return Object.freeze({ ...binding })
}

export function bindPreviewNavigation(html, binding) {
  if (!binding) return html
  // Only generated anchor navigation changes: canonical/OG/schema identity,
  // prose, assets, forms and server functions are deliberately left untouched.
  return html.replace(/(<a\b[^>]*\bhref=")([^"<>]*)(")/g, (match, prefix, href, suffix) => {
    if (href !== 'https://app.supermega.dev' && !href.startsWith('https://app.supermega.dev/')) return match
    return `${prefix}${binding.origin}${href.slice('https://app.supermega.dev'.length)}${suffix}`
  })
}
