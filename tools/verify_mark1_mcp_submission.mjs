import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const serverPath = resolve(root, 'mark1-mcp', 'server.mjs');
const submissionPath = resolve(root, 'chatgpt-app-submission.json');
const serverSource = await readFile(serverPath, 'utf8');
const submission = JSON.parse(await readFile(submissionPath, 'utf8'));
const failures = [];
let checks = 0;

function assert(condition, reason) {
  checks += 1;
  if (!condition) failures.push(reason);
}

function describeTools(extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [serverPath, '--describe-tools'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SUPERMEGA_ENABLE_LOCAL_TOOLS: '', ...extraEnvironment },
  });
  if (result.status !== 0) throw new Error(result.stderr || 'descriptor process failed');
  return JSON.parse(result.stdout);
}

function redactLeadFixture() {
  const result = spawnSync(process.execPath, [serverPath, '--redact-lead-fixture'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SUPERMEGA_ENABLE_LOCAL_TOOLS: '' },
  });
  if (result.status !== 0) throw new Error(result.stderr || 'lead redaction process failed');
  return JSON.parse(result.stdout);
}

function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}

function createFrameReader(stream) {
  let buffer = Buffer.alloc(0);
  const queued = [];
  const waiters = [];

  function flush() {
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = buffer.slice(0, headerEnd).toString('ascii');
      const lengthLine = header.split('\r\n').find((line) => line.toLowerCase().startsWith('content-length:'));
      const length = Number(lengthLine?.split(':')[1]?.trim() || 0);
      const frameEnd = headerEnd + 4 + length;
      if (!Number.isSafeInteger(length) || length <= 0 || buffer.length < frameEnd) return;
      const payload = JSON.parse(buffer.slice(headerEnd + 4, frameEnd).toString('utf8'));
      buffer = buffer.slice(frameEnd);
      const waiter = waiters.shift();
      if (waiter) waiter(payload);
      else queued.push(payload);
    }
  }

  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });

  return () => {
    if (queued.length) return Promise.resolve(queued.shift());
    return new Promise((resolveFrame, reject) => {
      const timeout = setTimeout(() => reject(new Error('MCP frame timeout')), 3_000);
      waiters.push((payload) => {
        clearTimeout(timeout);
        resolveFrame(payload);
      });
    });
  };
}

async function listToolsThroughProtocol() {
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: { ...process.env, SUPERMEGA_ENABLE_LOCAL_TOOLS: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const readFrame = createFrameReader(child.stdout);
  try {
    child.stdin.write(encodeMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'submission-verifier', version: '1.0.0' } },
    }));
    const initialized = await readFrame();
    if (initialized?.result?.serverInfo?.name !== 'supermega-mark1') throw new Error('MCP initialize failed');
    child.stdin.write(encodeMessage({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
    child.stdin.write(encodeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
    const listed = await readFrame();
    child.stdin.write(encodeMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'mark1_execute', arguments: { command: 'node --version' } },
    }));
    const disabledCall = await readFrame();
    return { tools: listed?.result?.tools || [], disabledCall };
  } finally {
    child.kill();
  }
}

const defaultTools = describeTools();
const internalTools = describeTools({ SUPERMEGA_ENABLE_LOCAL_TOOLS: 'true' });
const redactedLeadFixture = redactLeadFixture();
const protocol = await listToolsThroughProtocol();
const expectedDefaultHints = {
  mark1_get_operating_brief: [true, false, false],
  mark1_list_exceptions: [true, false, false],
  mark1_list_approvals: [true, false, false],
  mark1_create_approval: [false, false, false],
  mark1_list_leads: [true, false, false],
};
const expectedInternalHints = {
  mark1_files: [true, false, false],
  mark1_execute: [false, true, true],
};

assert(defaultTools.length === 5, 'default_tool_count');
assert(internalTools.length === 7, 'internal_tool_count');
assert(JSON.stringify(protocol.tools) === JSON.stringify(defaultTools), 'protocol_tool_descriptors_mismatch');
assert(protocol.disabledCall?.error?.message?.includes('local-only tool is disabled'), 'disabled_local_tool_was_callable');
assert(!defaultTools.some((tool) => tool.name === 'mark1_files' || tool.name === 'mark1_execute'), 'local_tools_exposed_by_default');
assert(redactedLeadFixture.rows?.[0]?.company_name === 'Example Company', 'lead_redaction_removed_business_identity');
assert(!['contact_email', 'contact_phone', 'outreach_message', 'discovery_questions', 'notes']
  .some((field) => Object.hasOwn(redactedLeadFixture.rows?.[0] || {}, field)), 'lead_redaction_leaked_private_fields');

for (const tool of internalTools) {
  const expected = expectedDefaultHints[tool.name] || expectedInternalHints[tool.name];
  assert(Boolean(expected), `unexpected_tool:${tool.name}`);
  assert(typeof tool.annotations?.readOnlyHint === 'boolean'
    && typeof tool.annotations?.openWorldHint === 'boolean'
    && typeof tool.annotations?.destructiveHint === 'boolean', `missing_hints:${tool.name}`);
  if (expected) {
    assert(tool.annotations.readOnlyHint === expected[0]
      && tool.annotations.openWorldHint === expected[1]
      && tool.annotations.destructiveHint === expected[2], `wrong_hints:${tool.name}`);
  }
  assert(typeof tool.title === 'string' && tool.title.trim().length > 4, `missing_title:${tool.name}`);
  assert(typeof tool.description === 'string' && tool.description.startsWith('Use this when'), `weak_description:${tool.name}`);
  assert(Boolean(tool.outputSchema?.properties?.data), `untyped_output_data:${tool.name}`);
}

const createApproval = defaultTools.find((tool) => tool.name === 'mark1_create_approval');
const listApprovals = defaultTools.find((tool) => tool.name === 'mark1_list_approvals');
assert(JSON.stringify(createApproval?.inputSchema?.required) === JSON.stringify(['title', 'owner']), 'create_approval_required_fields');
assert(!Object.hasOwn(createApproval?.inputSchema?.properties || {}, 'action'), 'create_approval_mixed_action');
assert(!Object.hasOwn(listApprovals?.inputSchema?.properties || {}, 'action'), 'list_approval_mixed_action');

assert(submission.$schema === 'https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json', 'wrong_submission_schema');
assert(submission.schema_version === 1, 'wrong_submission_version');
assert(submission.app_info?.subtitle?.length <= 30, 'subtitle_too_long');
assert(submission.app_info?.category === 'BUSINESS', 'wrong_category');
assert(JSON.stringify(Object.keys(submission.tools).sort()) === JSON.stringify(defaultTools.map((tool) => tool.name).sort()), 'submission_tool_set_mismatch');

for (const tool of defaultTools) {
  const submitted = submission.tools[tool.name];
  assert(Boolean(submitted), `submission_tool_missing:${tool.name}`);
  assert(JSON.stringify(submitted?.annotations) === JSON.stringify(tool.annotations), `submission_hints_mismatch:${tool.name}`);
  assert(Object.values(submitted?.justifications || {}).every((value) => typeof value === 'string' && value.trim().endsWith('.')), `weak_justification:${tool.name}`);
}

assert(submission.test_cases?.length === 5, 'positive_test_count');
assert(submission.negative_test_cases?.length === 3, 'negative_test_count');
assert(submission.test_cases.every((test) => Object.hasOwn(submission.tools, test.tools_triggered)), 'positive_test_unknown_tool');
assert(JSON.stringify(submission.test_cases.map((test) => test.tools_triggered).sort())
  === JSON.stringify(defaultTools.map((tool) => tool.name).sort()), 'positive_tests_do_not_cover_default_surface');
assert(submission.negative_test_cases.every((test) => test.tools_triggered === null), 'negative_test_should_not_trigger');
assert(!serverSource.includes('supermega-demo') && !serverSource.includes('C:\\Users\\swann'), 'stale_secret_or_machine_path');
assert(serverSource.includes("SUPERMEGA_ENABLE_LOCAL_TOOLS === 'true'") && serverSource.includes('This local-only tool is disabled.'), 'local_tool_gate_missing');

const outputSchemaWarnings = internalTools.filter((tool) => !tool.outputSchema).map((tool) => tool.name);
assert(outputSchemaWarnings.length === 0, 'missing_output_schema');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_chatgpt_app_submission', checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_chatgpt_app_submission',
  checks,
  defaultTools: defaultTools.map((tool) => tool.name),
  conditionalInternalTools: internalTools.slice(defaultTools.length).map((tool) => tool.name),
  positiveTests: submission.test_cases.length,
  negativeTests: submission.negative_test_cases.length,
  outputSchemaWarnings,
}, null, 2));
