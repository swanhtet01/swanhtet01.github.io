import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const pilotWorkspaceHtmlPath = resolve('.vercel/output/static/app/start/index.html')
if (!existsSync(pilotWorkspaceHtmlPath)) fail('generated_pilot_workspace_page_missing')
const html = readFileSync(pilotWorkspaceHtmlPath, 'utf8')

for (const token of [
  'Record first production run',
  'id="first-run-output"',
  'id="first-run-evidence-reference"',
  'id="first-run-source-trace"',
  'id="record-first-run"',
  'id="first-run-record-status"',
  "operation: 'record_first_production_run'",
  'first_run_output',
  'first_run_evidence_reference',
  'source_trace',
  'first_run_output_ready',
  'ready_for_owner_acceptance',
  'approval_only_until_owner_acceptance',
  'No external send, connector write, browser action, or payment action is triggered.',
]) {
  if (!html.includes(token)) fail('first_run_console_contract_missing', { token })
}

const pipelineControlPath = resolve('api/pipeline-control.js')
const pipelineControlSource = readFileSync(pipelineControlPath, 'utf8')
for (const token of [
  "operation === 'record_first_production_run'",
  'first_run_output',
  'first_run_evidence_reference',
  'private_workspace_required',
  'first_run_output_ready',
  'ready_for_owner_acceptance',
  'approval_only_until_owner_acceptance',
  'real_mrr_delta: 0',
]) {
  if (!pipelineControlSource.includes(token)) fail('first_run_backend_contract_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      checked: 'private_workspace_first_run_console_contract',
      page: pilotWorkspaceHtmlPath,
    },
    null,
    2,
  ),
)
