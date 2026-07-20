import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const workflow = await readFile(resolve(root, '.github/workflows/supermega-app-deploy.yml'), 'utf8')
const enterpriseGate = await readFile(resolve(root, '.github/workflows/supermega-enterprise-gate.yml'), 'utf8')
const requirements = [
  ['linux runner', /runs-on:\s*ubuntu-latest/],
  ['node 24', /node-version:\s*24/],
  ['python 3.12', /python-version:\s*['"]?3\.12/],
  ['production approval environment', /environment:\s*production/],
  ['megaos project check', /project inspect megaos/],
  ['prebuilt production deploy', /vercel deploy --prebuilt --prod/],
  ['free mode health smoke', /smoke_free_mode_health\.mjs/],
  ['separate enterprise readiness gate', /workflow_run:[\s\S]*SuperMega App Build and Deploy[\s\S]*enterprise-readiness/],
  ['enterprise gate requires managed storage and coverage', /enterprise_db_ready == true[\s\S]*enterprise_db_scheme != "sqlite"[\s\S]*coverage_score/],
]
const failures = requirements.filter(([, pattern]) => !pattern.test(`${workflow}\n${enterpriseGate}`)).map(([name]) => name)
if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: 'ready', contract: 'supermega_app_cloud_release', checks: requirements.length }, null, 2))
