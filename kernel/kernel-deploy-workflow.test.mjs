import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'


const root = path.resolve(import.meta.dirname, '..')
const workflow = await readFile(path.join(root, '.github', 'workflows', 'kernel-deploy.yml'), 'utf8')
const config = JSON.parse(await readFile(path.join(root, 'kernel', 'vercel.json'), 'utf8'))


function ordered(...labels) {
  const positions = labels.map((label) => workflow.indexOf(label))
  assert.ok(positions.every((position) => position >= 0), `Missing ordered step: ${labels[positions.indexOf(-1)]}`)
  assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]))
}


test('kernel production uses one owner-gated immutable candidate and exact rollback', () => {
  assert.equal(config.git?.deploymentEnabled, false)
  assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:/)
  assert.match(workflow, /release_sha:/)
  assert.match(workflow, /confirmation:/)
  assert.match(
    workflow,
    /if: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' && github\.repository == 'swanhtet01\/swanhtet01\.github\.io' \}\}/,
  )
  assert.match(workflow, /environment: kernel-production/)
  assert.match(workflow, /permissions:\s*\n\s*contents: read/)
  assert.match(workflow, /cancel-in-progress: false/)

  assert.match(workflow, /RELEASE_SHA: \$\{\{ inputs\.release_sha \}\}/)
  assert.match(workflow, /RELEASE_CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/)
  assert.doesNotMatch(workflow, /RELEASE_SHA="\$\{\{ inputs\./)
  assert.doesNotMatch(workflow, /\[ "\$\{\{ inputs\.confirmation/)
  assert.match(workflow, /\^\[a-f0-9\]\{40\}\$/)
  assert.match(workflow, /RELEASE KERNEL \$ACTUAL_SHA/)
  assert.match(workflow, /git fetch --no-tags --depth=1 origin main/)
  assert.match(workflow, /git rev-parse origin\/main/)

  assert.match(workflow, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/)
  assert.match(workflow, /VERCEL_ORG_ID: \$\{\{ secrets\.VERCEL_ORG_ID \}\}/)
  assert.match(workflow, /VERCEL_PROJECT_ID: \$\{\{ secrets\.VERCEL_PROJECT_ID \}\}/)
  assert.ok((workflow.match(/vercel@56\.1\.0/g) || []).length >= 12)
  assert.match(workflow, /pull --yes --environment=production/)
  assert.match(workflow, /build --prod --yes/)
  assert.equal((workflow.match(/deploy --prebuilt --prod --skip-domain --yes/g) || []).length, 1)
  assert.doesNotMatch(workflow, /deploy --prebuilt --prod --yes/)
  assert.match(workflow, /githubCommitSha=\$\{\{ github\.sha \}\}/)

  assert.match(workflow, /resolve_vercel_rollback_target\.mjs alias console\.supermega\.dev "\$VERCEL_PROJECT_ID"/)
  assert.match(workflow, /resolve_vercel_rollback_target\.mjs deployment "\$PREVIOUS_URL" "\$PREVIOUS_ID"/)
  assert.match(workflow, /vercel@56\.1\.0 curl \/api\/status --deployment "\$CANDIDATE_URL"/)
  assert.match(workflow, /value\.agentCompany\?\.plannerReady!==true/)
  assert.match(workflow, /value\.agentCompany\?\.externalWrites!==false/)
  assert.equal((workflow.match(/vercel@56\.1\.0 promote "\$CANDIDATE_URL"/g) || []).length, 1)
  assert.match(workflow, /\[ "\$PROMOTED_URL" != "\$CANDIDATE_URL" \]/)

  assert.match(workflow, /failure\(\) && steps\.promote\.outputs\.attempted == 'true'/)
  assert.match(workflow, /vercel@56\.1\.0 rollback "\$PREVIOUS_URL" --yes/)
  assert.match(workflow, /vercel@56\.1\.0 rollback status/)
  assert.match(workflow, /\[ "\$RESTORED_URL" != "\$PREVIOUS_URL" \]/)

  ordered(
    'Require exact current-main release intent',
    'Install and reverify the immutable kernel source',
    'Pull and verify production project settings',
    'Build the immutable production-configured artifact',
    'Capture the exact production rollback target',
    'Deploy an isolated production candidate',
    'Inspect and smoke the exact candidate',
    'Reconfirm current main before promotion',
    'Promote the exact verified candidate',
    'Verify the production alias and kernel health',
    'Roll back a failed production verification',
  )
})
