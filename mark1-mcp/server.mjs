#!/usr/bin/env node

import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = (process.env.SUPERMEGA_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const USERNAME = String(process.env.SUPERMEGA_APP_USERNAME || '').trim();
const PASSWORD = String(process.env.SUPERMEGA_APP_PASSWORD || '').trim();
const WORKSPACE = String(process.env.SUPERMEGA_WORKSPACE_SLUG || 'supermega-lab').trim();
const SERVER_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = String(process.env.SUPERMEGA_REPO_ROOT || resolve(SERVER_ROOT, '..')).trim();
const ENABLE_LOCAL_TOOLS = process.env.SUPERMEGA_ENABLE_LOCAL_TOOLS === 'true';

let cookieHeader = '';
let initialized = false;
let buffer = Buffer.alloc(0);

function writeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
  process.stdout.write(Buffer.concat([header, body]));
}

function toolData(data) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
    structuredContent: { data },
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

async function loginIfNeeded(force = false) {
  if (cookieHeader && !force) {
    return cookieHeader;
  }
  if (!USERNAME || !PASSWORD) {
    throw new Error('SuperMega credentials are not configured for private API access.');
  }

  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      username: USERNAME,
      password: PASSWORD,
      workspace_slug: WORKSPACE,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Login failed (${response.status}): ${body}`);
  }

  const cookie = response.headers.get('set-cookie') || '';
  cookieHeader = cookie.split(';')[0];
  return cookieHeader;
}

async function apiRequest(path, options = {}) {
  const needsAuth = path !== '/api/health';
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (needsAuth) {
    await loginIfNeeded();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
  }

  let response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && needsAuth) {
    await loginIfNeeded(true);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed (${response.status}): ${body}`);
  }

  return response.json();
}

function listTopFiles(rootPath) {
  return readdirSync(rootPath)
    .map((name) => {
      const fullPath = resolve(rootPath, name);
      const stats = statSync(fullPath);
      return {
        name,
        type: stats.isDirectory() ? 'dir' : 'file',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 80);
}

const SAFE_LEAD_FIELDS = [
  'lead_id',
  'company_name',
  'archetype',
  'stage',
  'status',
  'owner',
  'campaign_goal',
  'service_pack',
  'wedge_product',
  'starter_modules',
  'semi_products',
  'website',
  'source',
  'source_url',
  'provider',
  'score',
  'created_at',
  'synced_at',
];

function redactLeadPipeline(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const rows = Array.isArray(payload.rows)
    ? payload.rows.map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
        return Object.fromEntries(SAFE_LEAD_FIELDS.filter((field) => field in row).map((field) => [field, row[field]]));
      })
    : [];
  return { ...payload, rows };
}

const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: { data: {} },
  required: ['data'],
  additionalProperties: false,
};

function buildTools() {
  const tools = [
    {
      name: 'mark1_status',
      description: 'Read health and operating-summary data from the configured private SuperMega workspace.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_insights',
      description: 'Read the current private operating brief and its recommended actions without changing workspace state.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_exceptions',
      description: 'Read a bounded page of current exceptions from the configured private SuperMega workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum exception records to return' },
        },
        required: [],
        additionalProperties: false,
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_approvals',
      description: 'List private approval items, or create one pending private approval when action is create.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create'], description: 'Approval action' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum approval records to return for list' },
          title: { type: 'string', maxLength: 120 },
          summary: { type: 'string', maxLength: 1000 },
          approval_gate: { type: 'string', maxLength: 80 },
          requested_by: { type: 'string', maxLength: 80 },
          owner: { type: 'string', maxLength: 80 },
          due: { type: 'string', maxLength: 40 },
          related_route: { type: 'string', maxLength: 200 },
          related_entity: { type: 'string', maxLength: 120 },
        },
        required: ['action'],
        additionalProperties: false,
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_leads',
      description: 'Read a redacted private lead pipeline without contact details, outreach messages, discovery notes, or free-form notes.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
  ];

  if (ENABLE_LOCAL_TOOLS) tools.push({
      name: 'mark1_files',
      description: 'List top-level names and types in the configured local SuperMega repository; available only in explicit internal-local mode.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    }, {
      name: 'mark1_execute',
      description: 'Run an arbitrary local shell command in the configured SuperMega repository; may change files, external systems, or public state and is available only in explicit internal-local mode.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', minLength: 1, maxLength: 2000, description: 'Command to run' },
          timeout: { type: 'integer', minimum: 5, maximum: 300, description: 'Timeout in seconds' },
        },
        required: ['command'],
        additionalProperties: false,
      },
      outputSchema: TOOL_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    });

  return tools;
}

if (process.argv.includes('--describe-tools')) {
  process.stdout.write(`${JSON.stringify(buildTools(), null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes('--redact-lead-fixture')) {
  process.stdout.write(`${JSON.stringify(redactLeadPipeline({
    status: 'ready',
    rows: [{
      lead_id: 'LEAD-1',
      company_name: 'Example Company',
      stage: 'qualified',
      contact_email: 'private@example.com',
      contact_phone: '+95 000000',
      outreach_message: 'Private draft',
      discovery_questions: ['Private question'],
      notes: 'Private note',
    }],
  }))}\n`);
  process.exit(0);
}

async function callTool(name, args = {}) {
  if (!ENABLE_LOCAL_TOOLS && (name === 'mark1_files' || name === 'mark1_execute')) {
    throw new Error('This local-only tool is disabled. Set SUPERMEGA_ENABLE_LOCAL_TOOLS=true only in an approved internal environment.');
  }
  switch (name) {
    case 'mark1_status': {
      const [health, summary] = await Promise.all([
        apiRequest('/api/health'),
        apiRequest('/api/summary'),
      ]);
      return toolData({ health, summary });
    }
    case 'mark1_insights': {
      const payload = await apiRequest('/api/insights');
      return toolData(payload);
    }
    case 'mark1_exceptions': {
      const limit = boundedInteger(args.limit, 10, 1, 50);
      const payload = await apiRequest(`/api/exceptions?limit=${limit}`);
      return toolData(payload);
    }
    case 'mark1_approvals': {
      if (args.action !== 'list' && args.action !== 'create') throw new Error('Approval action must be list or create.');
      if (args.action === 'create') {
        const payload = await apiRequest('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: String(args.title || 'Untitled approval').trim(),
            summary: String(args.summary || '').trim(),
            approval_gate: String(args.approval_gate || 'general').trim(),
            requested_by: String(args.requested_by || 'MCP client').trim(),
            owner: String(args.owner || 'Management').trim(),
            due: String(args.due || '').trim(),
            related_route: String(args.related_route || '/app').trim(),
            related_entity: String(args.related_entity || '').trim(),
            status: 'pending',
          }),
        });
        return toolData(payload);
      }
      const limit = boundedInteger(args.limit, 10, 1, 50);
      const payload = await apiRequest(`/api/approvals?limit=${limit}`);
      return toolData(payload);
    }
    case 'mark1_leads': {
      const payload = await apiRequest('/api/lead-pipeline');
      return toolData(redactLeadPipeline(payload));
    }
    case 'mark1_files': {
      return toolData(listTopFiles(REPO_ROOT));
    }
    case 'mark1_execute': {
      const timeout = boundedInteger(args.timeout, 30, 5, 300) * 1000;
      const command = String(args.command || '').trim();
      if (!command) throw new Error('A non-empty local command is required.');
      const output = execSync(command, {
        cwd: REPO_ROOT,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      });
      return toolData(output);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleMessage(message) {
  const { id, method, params = {} } = message;

  if (method === 'initialize') {
    initialized = true;
    writeMessage({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
          serverInfo: { name: 'supermega-mark1', version: '2.1.0' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (!initialized) {
    writeMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32002, message: 'Server not initialized' },
    });
    return;
  }

  if (method === 'tools/list') {
    writeMessage({
      jsonrpc: '2.0',
      id,
      result: { tools: buildTools() },
    });
    return;
  }

  if (method === 'tools/call') {
    try {
      const result = await callTool(params.name, params.arguments || {});
      writeMessage({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (error) {
      writeMessage({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return;
  }

  writeMessage({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

function processBuffer() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const headerText = buffer.slice(0, headerEnd).toString('ascii');
    const headers = Object.fromEntries(
      headerText
        .split('\r\n')
        .map((line) => {
          const [key, ...rest] = line.split(':');
          return [key.toLowerCase(), rest.join(':').trim()];
        }),
    );
    const contentLength = Number(headers['content-length'] || 0);
    const totalLength = headerEnd + 4 + contentLength;
    if (buffer.length < totalLength) {
      return;
    }

    const body = buffer.slice(headerEnd + 4, totalLength).toString('utf8');
    buffer = buffer.slice(totalLength);

    let message;
    try {
      message = JSON.parse(body);
    } catch (error) {
      console.error('Failed to parse MCP message', error);
      continue;
    }

    void handleMessage(message);
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer();
});

process.stdin.on('end', () => {
  process.exit(0);
});

console.error(`SuperMega MCP running against ${BASE_URL}`);
