const canonicalBranch = 'codex/public-enterprise-site'

console.error(
  [
    'public_direct_deploy=blocked_use_verified_release',
    `supermega.dev releases only from ${canonicalBranch} through .github/workflows/supermega-public-release.yml.`,
    'Merge reviewed changes into the canonical branch, or dispatch that verified workflow from main.',
  ].join('\n'),
)

process.exitCode = 1
