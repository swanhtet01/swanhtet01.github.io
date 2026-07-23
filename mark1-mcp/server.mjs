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

function dataOutputSchema(data) {
  return {
    type: 'object',
    properties: { data },
    required: ['data'],
    additionalProperties: false,
  };
}

const OBJECT_DATA_OUTPUT_SCHEMA = dataOutputSchema({ type: 'object' });
const OPERATING_BRIEF_OUTPUT_SCHEMA = dataOutputSchema({
  type: 'object',
  properties: {
    health: { type: 'object' },
    summary: { type: 'object' },
    insights: { type: 'object' },
  },
  required: ['health', 'summary', 'insights'],
  additionalProperties: false,
});
const LOCAL_FILES_OUTPUT_SCHEMA = dataOutputSchema({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['dir', 'file'] },
    },
    required: ['name', 'type'],
    additionalProperties: false,
  },
});
const TEXT_OUTPUT_SCHEMA = dataOutputSchema({ type: 'string' });

function buildTools() {
  const tools = [
    {
      name: 'mark1_get_operating_brief',
      title: 'Get operating brief',
      description: 'Use this when you need one current operating brief for the authorized private SuperMega workspace; it reads health, summary, and recommended actions without changing state.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: OPERATING_BRIEF_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_list_exceptions',
      title: 'List current exceptions',
      description: 'Use this when you need a bounded list of current exceptions from the authorized private SuperMega workspace without resolving or changing them.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum exception records to return' },
        },
        required: [],
        additionalProperties: false,
      },
      outputSchema: OBJECT_DATA_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_list_approvals',
      title: 'List pending approvals',
      description: 'Use this when you need a bounded list of private approval items without creating, deciding, or changing an approval.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum approval records to return' },
        },
        required: [],
        additionalProperties: false,
      },
      outputSchema: OBJECT_DATA_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_create_approval',
      title: 'Create pending approval',
      description: 'Use this when an authorized operator explicitly asks to create one pending private approval for later human review; it never makes the final decision.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          summary: { type: 'string', maxLength: 1000 },
          approval_gate: { type: 'string', maxLength: 80 },
          requested_by: { type: 'string', maxLength: 80 },
          owner: { type: 'string', minLength: 1, maxLength: 80 },
          due: { type: 'string', maxLength: 40 },
          related_route: { type: 'string', maxLength: 200 },
          related_entity: { type: 'string', maxLength: 120 },
        },
        required: ['title', 'owner'],
        additionalProperties: false,
      },
      outputSchema: OBJECT_DATA_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    },
    {
      name: 'mark1_list_leads',
      title: 'List saved leads',
      description: 'Use this when you need the saved private lead pipeline without contact details, outreach messages, discovery questions, free-form notes, or any state change.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: OBJECT_DATA_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
  ];

  if (ENABLE_LOCAL_TOOLS) tools.push({
      name: 'mark1_files',
      title: 'List local repository files',
      description: 'Use this when operating in an approved internal-local environment to list top-level names and types in the configured SuperMega repository.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: LOCAL_FILES_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    }, {
      name: 'mark1_execute',
      title: 'Run local repository command',
      description: 'Use this when operating in an approved internal-local environment to run an arbitrary shell command that may change files, external systems, or public state.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', minLength: 1, maxLength: 2000, description: 'Command to run' },
          timeout: { type: 'integer', minimum: 5, maximum: 300, description: 'Timeout in seconds' },
        },
        required: ['command'],
        additionalProperties: false,
      },
      outputSchema: TEXT_OUTPUT_SCHEMA,
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
    case 'mark1_get_operating_brief': {
      const [health, summary, insights] = await Promise.all([
        apiRequest('/api/health'),
        apiRequest('/api/summary'),
        apiRequest('/api/insights'),
      ]);
      return toolData({ health, summary, insights });
    }
    case 'mark1_list_exceptions': {
      const limit = boundedInteger(args.limit, 10, 1, 50);
      const payload = await apiRequest(`/api/exceptions?limit=${limit}`);
      return toolData(payload);
    }
    case 'mark1_list_approvals': {
      const limit = boundedInteger(args.limit, 10, 1, 50);
      const payload = await apiRequest(`/api/approvals?limit=${limit}`);
      return toolData(payload);
    }
    case 'mark1_create_approval': {
      const title = String(args.title || '').trim();
      const owner = String(args.owner || '').trim();
      if (!title || !owner) throw new Error('Approval title and owner are required.');
      const payload = await apiRequest('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary: String(args.summary || '').trim(),
          approval_gate: String(args.approval_gate || 'general').trim(),
          requested_by: String(args.requested_by || 'MCP client').trim(),
          owner,
          due: String(args.due || '').trim(),
          related_route: String(args.related_route || '/app').trim(),
          related_entity: String(args.related_entity || '').trim(),
          status: 'pending',
        }),
      });
      return toolData(payload);
    }
    case 'mark1_list_leads': {
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
          serverInfo: { name: 'supermega-mark1', version: '2.2.0' },
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
