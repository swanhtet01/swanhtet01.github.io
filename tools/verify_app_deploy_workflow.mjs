import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const workflow = await readFile(resolve(root, '.github/workflows/supermega-app-deploy.yml'), 'utf8')
const requirements = [
  ['linux runner', /runs-on:\s*ubuntu-latest/],
  ['node 24', /node-version:\s*24/],
  ['python 3.12', /python-version:\s*['"]?3\.12/],
  ['production approval environment', /environment:\s*production/],
  ['megaos project check', /project inspect megaos/],
  ['prebuilt production deploy', /vercel deploy --prebuilt --prod/],
  ['live health smoke', /https:\/\/app\.supermega\.dev\/api\/health/],
  ['free mode health smoke', /smoke_free_mode_health\.mjs/],
]
const failures = requirements.filter(([, pattern]) => !pattern.test(workflow)).map(([name]) => name)
if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: 'ready', contract: 'supermega_app_cloud_release', checks: requirements.length }, null, 2))
