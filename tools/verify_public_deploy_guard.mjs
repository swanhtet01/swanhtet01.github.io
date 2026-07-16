import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const deployWorkflow = (await readFile(new URL('../.github/workflows/supermega-public-release.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
const healthWorkflow = (await readFile(new URL('../.github/workflows/supermega-public-live-health.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
const releaseScript = (await readFile(new URL('./deploy_website_actions.ps1', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
const failures = []

for (const name of ['vercel:deploy', 'vercel:deploy:prod']) {
  if (packageJson.scripts?.[name] !== 'node tools/deny_stale_public_deploy.mjs') {
    failures.push(`direct_public_deploy_not_guarded:${name}`)
  }
}

if (packageJson.scripts?.['public:release:guard'] !== 'node tools/verify_public_deploy_guard.mjs') {
  failures.push('public_release_guard_not_exposed')
}

for (const token of [
  "branches:\n      - codex/public-enterprise-site",
  'refs/heads/codex/public-enterprise-site',
  '--meta "githubCommitRef=codex/public-enterprise-site"',
  'npx --yes vercel@56.1.0 deploy --prebuilt --prod',
]) {
  if (!deployWorkflow.includes(token)) failures.push(`canonical_workflow_missing:${token}`)
}

for (const token of ['source_ref = "codex/public-enterprise-site"', 'workflow = $workflowFile', 'dispatch_ref = "main"']) {
  if (!releaseScript.includes(token)) failures.push(`release_dispatch_missing:${token}`)
}

for (const token of ['tools/verify_public_deploy_guard.mjs', 'Verify public release guard', 'node tools/verify_public_deploy_guard.mjs']) {
  if (!healthWorkflow.includes(token)) failures.push(`health_guard_missing:${token}`)
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'public_deploy_guard', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'public_deploy_guard', canonicalBranch: 'codex/public-enterprise-site' }))
