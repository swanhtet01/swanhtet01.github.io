const canonicalBranch = 'codex/public-enterprise-site'

console.error(
  [
    'Direct Vercel deployment is disabled from this checkout.',
    `supermega.dev releases only from ${canonicalBranch} through .github/workflows/supermega-public-release.yml.`,
    'Open a pull request to the canonical branch, or run tools/deploy_website_actions.ps1 to dispatch the verified release.',
  ].join('\n'),
)

process.exitCode = 1
