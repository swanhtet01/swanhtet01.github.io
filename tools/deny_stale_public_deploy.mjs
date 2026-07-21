const canonicalBranch = 'main'

console.error(
  [
    'Direct Vercel deployment is disabled from this checkout.',
    `supermega.dev releases only from ${canonicalBranch} through .github/workflows/supermega-public-release.yml.`,
    'Push a verified change to main, or run tools/deploy_website_actions.ps1 to dispatch the registered release workflow.',
  ].join('\n'),
)

process.exitCode = 1
