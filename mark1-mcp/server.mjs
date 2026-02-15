#!/usr/bin/env node

/**
 * SuperMega Mark 1 — MCP Server
 * 
 * Exposes the Mark 1 workspace as MCP tools for:
 * - Claude Code (claude_desktop_config.json)
 * - Cline (VS Code extension settings)
 * - Cursor (cursor settings)
 * - Windsurf (windsurf settings)
 * 
 * Tools exposed:
 * - mark1_status: Get machine status and health
 * - mark1_chat: Talk to Mark 1 AI
 * - mark1_agents: List and manage agents
 * - mark1_tools: List available AI tools
 * - mark1_execute: Execute code in sandbox
 * - mark1_browse: Autonomous web browsing
 * - mark1_search: Search the web
 * - mark1_file: Read/write files
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ─── Gemini API Helper ───────────────────────────────────────────────────────
async function callGemini(prompt, systemPrompt = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 'Error: GEMINI_API_KEY not set. Export it in your shell.';

  const fetch = (await import('node-fetch')).default;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  const contents = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: `System: ${systemPrompt}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });

  const data = await res.json();
  if (data.error) return `Error: ${data.error.message}`;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

// ─── Machine Data ─────────────────────────────────────────────────────────────
const MACHINE = {
  name: 'SuperMega Mark 1',
  version: '2.3.0',
  status: 'INITIALIZING',
  completion: 15,
  agents: [
    { id: 'coder', name: 'Coder Agent', framework: 'CrewAI + Gemini CLI', status: 'NOT_DEPLOYED' },
    { id: 'data', name: 'Data Analyst', framework: 'LangGraph', status: 'NOT_DEPLOYED' },
    { id: 'lead_gen', name: 'Lead Generation', framework: 'AutoGen', status: 'NOT_DEPLOYED' },
    { id: 'content', name: 'Content Creator', framework: 'CrewAI', status: 'NOT_DEPLOYED' },
    { id: 'devops', name: 'DevOps Agent', framework: 'Google ADK', status: 'NOT_DEPLOYED' },
    { id: 'research', name: 'Research Agent', framework: 'LangGraph', status: 'NOT_DEPLOYED' },
    { id: 'qa', name: 'QA Agent', framework: 'CrewAI', status: 'NOT_DEPLOYED' },
    { id: 'meta', name: 'Meta Orchestrator', framework: 'Magentic-One', status: 'NOT_DEPLOYED' },
  ],
  infrastructure: {
    gcp: 'NOT_PROVISIONED', github_pages: 'ACTIVE',
    google_workspace: 'ACTIVE', n8n: 'NOT_PROVISIONED',
    cloud_run: 'NOT_PROVISIONED', cloud_sql: 'NOT_PROVISIONED',
  },
};

// ─── MCP Server ───────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'mark1-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'mark1_status',
      description: 'Get the current status of the SuperMega Mark 1 Machine — agents, infrastructure, completion percentage, and health.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'mark1_chat',
      description: 'Talk to the Mark 1 AI assistant. Ask about the workspace, get help with tasks, or request agent actions.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Your message to Mark 1 AI' },
          context: { type: 'string', description: 'Optional context (e.g., current file, project)' },
        },
        required: ['message'],
      },
    },
    {
      name: 'mark1_agents',
      description: 'List all Mark 1 agents or get details about a specific agent.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Optional agent ID to get details' },
        },
        required: [],
      },
    },
    {
      name: 'mark1_tools',
      description: 'List available AI tools in the Mark 1 ecosystem with install commands.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category: Coding, Agents, Browser, Automation, Integration, Sandbox' },
        },
        required: [],
      },
    },
    {
      name: 'mark1_execute',
      description: 'Execute a shell command in the workspace. Use for running scripts, installing tools, or checking system state.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in seconds (default 30)' },
        },
        required: ['command'],
      },
    },
    {
      name: 'mark1_file',
      description: 'Read or write files in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'list'], description: 'File operation' },
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content to write (for write action)' },
        },
        required: ['action', 'path'],
      },
    },
    {
      name: 'mark1_search',
      description: 'Search the web using Gemini to find information, documentation, or solutions.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'mark1_status':
      return {
        content: [{ type: 'text', text: JSON.stringify(MACHINE, null, 2) }],
      };

    case 'mark1_chat': {
      const systemPrompt = `You are Mark 1, the SuperMega AI workspace assistant. You help Swan Htet manage his AI-native development workspace. Current status: ${MACHINE.status}, ${MACHINE.completion}% complete. ${args.context ? `Context: ${args.context}` : ''}`;
      const response = await callGemini(args.message, systemPrompt);
      return { content: [{ type: 'text', text: response }] };
    }

    case 'mark1_agents': {
      if (args.agent_id) {
        const agent = MACHINE.agents.find(a => a.id === args.agent_id);
        return {
          content: [{ type: 'text', text: agent ? JSON.stringify(agent, null, 2) : `Agent "${args.agent_id}" not found` }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(MACHINE.agents, null, 2) }] };
    }

    case 'mark1_tools': {
      const tools = [
        { name: 'Gemini CLI', category: 'Coding', cmd: 'npm install -g @google/gemini-cli' },
        { name: 'Claude Code', category: 'Coding', cmd: 'npm install -g @anthropic-ai/claude-code' },
        { name: 'Aider', category: 'Coding', cmd: 'pip install aider-chat' },
        { name: 'Codex CLI', category: 'Coding', cmd: 'npm install -g @openai/codex' },
        { name: 'CrewAI', category: 'Agents', cmd: 'pip install crewai crewai-tools' },
        { name: 'LangGraph', category: 'Agents', cmd: 'pip install langgraph langchain-google-genai' },
        { name: 'Browser-Use', category: 'Browser', cmd: 'pip install browser-use' },
        { name: 'Playwright', category: 'Browser', cmd: 'pip install playwright && playwright install' },
        { name: 'n8n', category: 'Automation', cmd: 'npm install -g n8n' },
        { name: 'Composio', category: 'Integration', cmd: 'pip install composio-core' },
        { name: 'E2B', category: 'Sandbox', cmd: 'pip install e2b-code-interpreter' },
      ];
      const filtered = args.category ? tools.filter(t => t.category === args.category) : tools;
      return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
    }

    case 'mark1_execute': {
      try {
        const timeout = (args.timeout || 30) * 1000;
        const output = execSync(args.command, { timeout, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
        return { content: [{ type: 'text', text: output }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}\n${err.stderr || ''}` }] };
      }
    }

    case 'mark1_file': {
      try {
        if (args.action === 'read') {
          const content = readFileSync(args.path, 'utf-8');
          return { content: [{ type: 'text', text: content }] };
        }
        if (args.action === 'write') {
          writeFileSync(args.path, args.content || '');
          return { content: [{ type: 'text', text: `Written to ${args.path}` }] };
        }
        if (args.action === 'list') {
          const output = execSync(`ls -la "${args.path}"`, { encoding: 'utf-8' });
          return { content: [{ type: 'text', text: output }] };
        }
        return { content: [{ type: 'text', text: 'Invalid action. Use: read, write, list' }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      }
    }

    case 'mark1_search': {
      const response = await callGemini(
        `Search the web and provide comprehensive, up-to-date information about: ${args.query}. Include URLs, code examples, and actionable details.`,
        'You are a research assistant. Provide detailed, sourced information.'
      );
      return { content: [{ type: 'text', text: response }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Mark 1 MCP Server running on stdio');
}

main().catch(console.error);
