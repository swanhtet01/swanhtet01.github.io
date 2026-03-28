#!/usr/bin/env node

import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = (process.env.SUPERMEGA_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const USERNAME = String(process.env.SUPERMEGA_APP_USERNAME || 'owner').trim();
const PASSWORD = String(process.env.SUPERMEGA_APP_PASSWORD || 'supermega-demo').trim();
const WORKSPACE = String(process.env.SUPERMEGA_WORKSPACE_SLUG || 'supermega-lab').trim();
const REPO_ROOT = String(
  process.env.SUPERMEGA_REPO_ROOT ||
    'C:\\Users\\swann\\OneDrive - BDA\\swanhtet01.github.io.worktrees\\copilot-worktree-2026-03-04T08-10-33',
).trim();

let cookieHeader = '';
let initialized = false;
let buffer = Buffer.alloc(0);

function writeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
  process.stdout.write(Buffer.concat([header, body]));
}

function toolText(text) {
  return { content: [{ type: 'text', text }] };
}

async function loginIfNeeded(force = false) {
  if (cookieHeader && !force) {
    return cookieHeader;
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
        fullPath,
        type: stats.isDirectory() ? 'dir' : 'file',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 80);
}

function buildTools() {
  return [
    {
      name: 'mark1_status',
      description: 'Get health and summary from the live SuperMega app.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'mark1_insights',
      description: 'Get the current operating brief and recommended actions.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'mark1_exceptions',
      description: 'Get the live exception queue from the private app.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum rows to return' },
        },
        required: [],
      },
    },
    {
      name: 'mark1_approvals',
      description: 'List approvals or create a new approval item.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create'], description: 'Approval action' },
          limit: { type: 'number', description: 'Maximum rows to return for list' },
          title: { type: 'string' },
          summary: { type: 'string' },
          approval_gate: { type: 'string' },
          requested_by: { type: 'string' },
          owner: { type: 'string' },
          due: { type: 'string' },
          related_route: { type: 'string' },
          related_entity: { type: 'string' },
        },
        required: ['action'],
      },
    },
    {
      name: 'mark1_leads',
      description: 'List the saved lead pipeline from the live workspace.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'mark1_files',
      description: 'List top-level files and folders in the SuperMega repo root.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'mark1_execute',
      description: 'Execute a local shell command against the SuperMega workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
          timeout: { type: 'number', description: 'Timeout seconds' },
        },
        required: ['command'],
      },
    },
  ];
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'mark1_status': {
      const [health, summary] = await Promise.all([
        apiRequest('/api/health'),
        apiRequest('/api/summary'),
      ]);
      return toolText(JSON.stringify({ health, summary }, null, 2));
    }
    case 'mark1_insights': {
      const payload = await apiRequest('/api/insights');
      return toolText(JSON.stringify(payload, null, 2));
    }
    case 'mark1_exceptions': {
      const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
      const payload = await apiRequest(`/api/exceptions?limit=${limit}`);
      return toolText(JSON.stringify(payload, null, 2));
    }
    case 'mark1_approvals': {
      if (args.action === 'create') {
        const payload = await apiRequest('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: String(args.title || 'Untitled approval').trim(),
            summary: String(args.summary || '').trim(),
            approval_gate: String(args.approval_gate || 'general').trim(),
            requested_by: String(args.requested_by || 'Codex MCP').trim(),
            owner: String(args.owner || 'Management').trim(),
            due: String(args.due || '').trim(),
            related_route: String(args.related_route || '/app').trim(),
            related_entity: String(args.related_entity || '').trim(),
            status: 'pending',
          }),
        });
        return toolText(JSON.stringify(payload, null, 2));
      }
      const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
      const payload = await apiRequest(`/api/approvals?limit=${limit}`);
      return toolText(JSON.stringify(payload, null, 2));
    }
    case 'mark1_leads': {
      const payload = await apiRequest('/api/lead-pipeline');
      return toolText(JSON.stringify(payload, null, 2));
    }
    case 'mark1_files': {
      return toolText(JSON.stringify(listTopFiles(REPO_ROOT), null, 2));
    }
    case 'mark1_execute': {
      const timeout = Math.max(5, Number(args.timeout || 30)) * 1000;
      const output = execSync(String(args.command || ''), {
        cwd: REPO_ROOT,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      });
      return toolText(output);
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
        serverInfo: { name: 'supermega-mark1', version: '2.0.0' },
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
