#!/usr/bin/env node

/**
 * SuperMega Mark 1 CLI — Your AI-native workspace command center.
 * 
 * Usage:
 *   mark1 status          — Show machine status and health
 *   mark1 chat [message]  — Talk to Mark 1 AI (Gemini-powered)
 *   mark1 agent list      — List all agents and their status
 *   mark1 agent run <id>  — Run an agent task
 *   mark1 tools           — List available AI tools
 *   mark1 setup           — Interactive setup wizard
 *   mark1 n8n             — Manage n8n workflows
 *   mark1 browse <url>    — Autonomous browser agent
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG_PATH = join(process.env.HOME || '~', '.mark1', 'config.json');

function loadConfig() {
  try {
    if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {}
  return { gemini_api_key: '', dashboard_url: '', gcp_project: '' };
}

function saveConfig(cfg) {
  const dir = dirname(CONFIG_PATH);
  execSync(`mkdir -p "${dir}"`);
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Gemini API ───────────────────────────────────────────────────────────────
async function callGemini(prompt, systemPrompt = '') {
  const config = loadConfig();
  const apiKey = config.gemini_api_key || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log(chalk.red('No Gemini API key. Run: mark1 setup'));
    process.exit(1);
  }

  const fetch = (await import('node-fetch')).default;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  const contents = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: `System: ${systemPrompt}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

// ─── Machine Data ─────────────────────────────────────────────────────────────
const MACHINE_STATUS = {
  machine: 'SuperMega Mark 1',
  version: '2.3.0',
  status: 'INITIALIZING',
  completion: '15%',
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
    gcp: 'NOT_PROVISIONED',
    github_pages: 'ACTIVE',
    google_workspace: 'ACTIVE',
    n8n: 'NOT_PROVISIONED',
    cloud_run: 'NOT_PROVISIONED',
    cloud_sql: 'NOT_PROVISIONED',
  },
  tools: [
    { name: 'Gemini CLI', category: 'Coding', installed: false, cmd: 'npm install -g @google/gemini-cli' },
    { name: 'Claude Code', category: 'Coding', installed: false, cmd: 'npm install -g @anthropic-ai/claude-code' },
    { name: 'Aider', category: 'Coding', installed: false, cmd: 'pip install aider-chat' },
    { name: 'Codex CLI', category: 'Coding', installed: false, cmd: 'npm install -g @openai/codex' },
    { name: 'CrewAI', category: 'Agents', installed: false, cmd: 'pip install crewai crewai-tools' },
    { name: 'LangGraph', category: 'Agents', installed: false, cmd: 'pip install langgraph langchain-google-genai' },
    { name: 'AutoGen', category: 'Agents', installed: false, cmd: 'pip install autogen-agentchat' },
    { name: 'Browser-Use', category: 'Browser', installed: false, cmd: 'pip install browser-use' },
    { name: 'Playwright', category: 'Browser', installed: false, cmd: 'pip install playwright && playwright install' },
    { name: 'n8n', category: 'Automation', installed: false, cmd: 'npm install -g n8n' },
    { name: 'Composio', category: 'Integration', installed: false, cmd: 'pip install composio-core' },
    { name: 'E2B', category: 'Sandbox', installed: false, cmd: 'pip install e2b-code-interpreter' },
  ],
};

// ─── Commands ─────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name('mark1')
  .description(chalk.cyan('SuperMega Mark 1 Machine') + ' — AI-native workspace CLI')
  .version(pkg.version);

// ── status ──
program
  .command('status')
  .description('Show machine status and health')
  .action(() => {
    const s = MACHINE_STATUS;
    console.log('');
    console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   SUPERMEGA MARK 1 — COMMAND CENTER              ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════╝'));
    console.log('');
    console.log(`  ${chalk.gray('Machine:')}    ${chalk.white(s.machine)}`);
    console.log(`  ${chalk.gray('Version:')}    ${chalk.green('v' + s.version)}`);
    console.log(`  ${chalk.gray('Status:')}     ${chalk.yellow(s.status)}`);
    console.log(`  ${chalk.gray('Completion:')} ${chalk.yellow(s.completion)}`);
    console.log('');
    console.log(chalk.cyan('  ── Infrastructure ──'));
    for (const [k, v] of Object.entries(s.infrastructure)) {
      const color = v === 'ACTIVE' ? chalk.green : chalk.yellow;
      const icon = v === 'ACTIVE' ? '●' : '○';
      console.log(`  ${color(icon)} ${chalk.white(k.replace(/_/g, ' ').padEnd(20))} ${color(v)}`);
    }
    console.log('');
    console.log(chalk.cyan('  ── Agents ──'));
    for (const a of s.agents) {
      const color = a.status === 'ACTIVE' ? chalk.green : chalk.yellow;
      const icon = a.status === 'ACTIVE' ? '●' : '○';
      console.log(`  ${color(icon)} ${chalk.white(a.name.padEnd(22))} ${chalk.gray(a.framework.padEnd(20))} ${color(a.status)}`);
    }
    console.log('');
    console.log(chalk.gray('  Run `mark1 tools` to see available AI tools'));
    console.log(chalk.gray('  Run `mark1 chat` to talk to Mark 1 AI'));
    console.log('');
  });

// ── chat ──
program
  .command('chat [message...]')
  .description('Talk to Mark 1 AI (Gemini-powered)')
  .option('-s, --system <prompt>', 'Custom system prompt')
  .action(async (messageParts, opts) => {
    const systemPrompt = opts.system || `You are Mark 1, the SuperMega AI workspace assistant. You help Swan Htet manage his AI-native development workspace. You know about: 8 AI agents (Coder, Data Analyst, Lead Gen, Content, DevOps, Research, QA, Meta Orchestrator), infrastructure (GCP Cloud Run, Cloud SQL, GitHub Pages, Google Workspace), and 60+ AI tools (Gemini CLI, Claude Code, Aider, CrewAI, n8n, etc.). The machine is currently at 15% completion — INITIALIZING phase. Be concise, technical, and action-oriented.`;

    if (messageParts && messageParts.length > 0) {
      const message = messageParts.join(' ');
      const spinner = ora({ text: chalk.cyan('Mark 1 thinking...'), spinner: 'dots' }).start();
      try {
        const response = await callGemini(message, systemPrompt);
        spinner.stop();
        console.log('');
        console.log(chalk.cyan.bold('  Mark 1:'));
        console.log('  ' + response.split('\n').join('\n  '));
        console.log('');
      } catch (err) {
        spinner.fail(chalk.red(`Error: ${err.message}`));
      }
    } else {
      // Interactive mode
      const { default: inquirer } = await import('inquirer');
      console.log('');
      console.log(chalk.cyan.bold('  Mark 1 AI Chat') + chalk.gray(' (type "exit" to quit)'));
      console.log('');

      while (true) {
        const { message } = await inquirer.prompt([{
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          prefix: ' ',
        }]);

        if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
          console.log(chalk.gray('  Goodbye.'));
          break;
        }

        const spinner = ora({ text: chalk.cyan('  Thinking...'), spinner: 'dots' }).start();
        try {
          const response = await callGemini(message, systemPrompt);
          spinner.stop();
          console.log('');
          console.log(chalk.cyan('  Mark 1: ') + response.split('\n').join('\n  '));
          console.log('');
        } catch (err) {
          spinner.fail(chalk.red(`  Error: ${err.message}`));
        }
      }
    }
  });

// ── agent ──
const agentCmd = program.command('agent').description('Manage AI agents');

agentCmd
  .command('list')
  .description('List all agents')
  .action(() => {
    console.log('');
    console.log(chalk.cyan.bold('  Agent Fleet'));
    console.log('');
    for (const a of MACHINE_STATUS.agents) {
      const color = a.status === 'ACTIVE' ? chalk.green : chalk.yellow;
      console.log(`  ${color('●')} ${chalk.white(a.id.padEnd(12))} ${a.name.padEnd(22)} ${chalk.gray(a.framework.padEnd(20))} ${color(a.status)}`);
    }
    console.log('');
  });

agentCmd
  .command('run <id>')
  .description('Run an agent task')
  .option('-t, --task <task>', 'Task description')
  .action(async (id, opts) => {
    const agent = MACHINE_STATUS.agents.find(a => a.id === id);
    if (!agent) {
      console.log(chalk.red(`  Agent "${id}" not found. Run: mark1 agent list`));
      return;
    }

    if (agent.status === 'NOT_DEPLOYED') {
      console.log(chalk.yellow(`  Agent "${agent.name}" is not deployed yet.`));
      console.log(chalk.gray(`  To deploy, you need:`));
      console.log(chalk.gray(`    1. GCP Cloud Run provisioned`));
      console.log(chalk.gray(`    2. ${agent.framework} installed`));
      console.log(chalk.gray(`    3. Run: mark1 setup`));
      return;
    }

    const task = opts.task || 'Default task';
    const spinner = ora({ text: chalk.cyan(`  Running ${agent.name}: ${task}`), spinner: 'dots' }).start();
    try {
      const response = await callGemini(
        `You are the ${agent.name} agent (${agent.framework}). Execute this task: ${task}. Provide a step-by-step plan and expected output.`,
        `You are an AI agent specialized as ${agent.name}. You use ${agent.framework}. Be specific and actionable.`
      );
      spinner.succeed(chalk.green(`  ${agent.name} completed`));
      console.log('');
      console.log('  ' + response.split('\n').join('\n  '));
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red(`  Error: ${err.message}`));
    }
  });

// ── tools ──
program
  .command('tools')
  .description('List and install AI tools')
  .option('-i, --install <name>', 'Install a specific tool')
  .option('--install-all', 'Install all tools')
  .action(async (opts) => {
    if (opts.install) {
      const tool = MACHINE_STATUS.tools.find(t => t.name.toLowerCase().includes(opts.install.toLowerCase()));
      if (!tool) {
        console.log(chalk.red(`  Tool "${opts.install}" not found.`));
        return;
      }
      console.log(chalk.cyan(`  Installing ${tool.name}...`));
      console.log(chalk.gray(`  $ ${tool.cmd}`));
      try {
        execSync(tool.cmd, { stdio: 'inherit' });
        console.log(chalk.green(`  ✓ ${tool.name} installed`));
      } catch {
        console.log(chalk.yellow(`  ⚠ Install manually: ${tool.cmd}`));
      }
      return;
    }

    if (opts.installAll) {
      for (const tool of MACHINE_STATUS.tools) {
        const spinner = ora({ text: chalk.cyan(`  Installing ${tool.name}...`), spinner: 'dots' }).start();
        try {
          execSync(tool.cmd, { stdio: 'pipe' });
          spinner.succeed(chalk.green(`  ${tool.name}`));
        } catch {
          spinner.warn(chalk.yellow(`  ${tool.name} — install manually: ${tool.cmd}`));
        }
      }
      return;
    }

    console.log('');
    console.log(chalk.cyan.bold('  AI Tool Catalog') + chalk.gray(` (${MACHINE_STATUS.tools.length} tools)`));
    console.log('');
    const categories = [...new Set(MACHINE_STATUS.tools.map(t => t.category))];
    for (const cat of categories) {
      console.log(chalk.cyan(`  ── ${cat} ──`));
      for (const t of MACHINE_STATUS.tools.filter(t => t.category === cat)) {
        const check = t.installed ? chalk.green('✓') : chalk.gray('○');
        console.log(`  ${check} ${chalk.white(t.name.padEnd(18))} ${chalk.gray(t.cmd)}`);
      }
      console.log('');
    }
    console.log(chalk.gray('  Install: mark1 tools --install <name>'));
    console.log(chalk.gray('  Install all: mark1 tools --install-all'));
    console.log('');
  });

// ── setup ──
program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    const { default: inquirer } = await import('inquirer');
    console.log('');
    console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   MARK 1 SETUP WIZARD                            ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════╝'));
    console.log('');

    const config = loadConfig();

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'gemini_api_key',
        message: 'Gemini API Key:',
        default: config.gemini_api_key || process.env.GEMINI_API_KEY || '',
        prefix: chalk.cyan('  ?'),
      },
      {
        type: 'input',
        name: 'dashboard_url',
        message: 'Dashboard URL:',
        default: config.dashboard_url || 'https://supermega-mark1.manus.space',
        prefix: chalk.cyan('  ?'),
      },
      {
        type: 'input',
        name: 'gcp_project',
        message: 'GCP Project ID:',
        default: config.gcp_project || 'supermega-mark1',
        prefix: chalk.cyan('  ?'),
      },
    ]);

    saveConfig(answers);
    console.log('');
    console.log(chalk.green('  ✓ Configuration saved to ~/.mark1/config.json'));
    console.log('');
    console.log(chalk.cyan('  Next steps:'));
    console.log(chalk.gray('    1. mark1 status        — Check machine health'));
    console.log(chalk.gray('    2. mark1 chat          — Talk to Mark 1 AI'));
    console.log(chalk.gray('    3. mark1 tools         — Install AI tools'));
    console.log(chalk.gray('    4. mark1 agent list    — View agent fleet'));
    console.log('');
  });

// ── browse ──
program
  .command('browse <url>')
  .description('Autonomous browser agent (requires browser-use)')
  .action(async (url) => {
    console.log(chalk.cyan(`  Browsing: ${url}`));
    console.log(chalk.gray('  Checking for browser-use...'));
    try {
      execSync('python3 -c "import browser_use"', { stdio: 'pipe' });
      console.log(chalk.green('  ✓ browser-use found'));
      console.log(chalk.cyan('  Starting autonomous browser agent...'));
      // Create a temp Python script for browser-use
      const script = `
import asyncio
from browser_use import Agent
from langchain_google_genai import ChatGoogleGenerativeAI

async def main():
    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")
    agent = Agent(task="Navigate to ${url} and summarize the page content", llm=llm)
    result = await agent.run()
    print(result)

asyncio.run(main())
`;
      const tmpFile = '/tmp/mark1_browse.py';
      writeFileSync(tmpFile, script);
      execSync(`python3 ${tmpFile}`, { stdio: 'inherit' });
    } catch {
      console.log(chalk.yellow('  ⚠ browser-use not installed'));
      console.log(chalk.gray('  Install: pip install browser-use langchain-google-genai'));
      console.log(chalk.gray('  Then: playwright install'));
    }
  });

// ── n8n ──
program
  .command('n8n')
  .description('Manage n8n workflows')
  .option('-s, --start', 'Start n8n locally')
  .option('-l, --list', 'List workflows')
  .action((opts) => {
    if (opts.start) {
      console.log(chalk.cyan('  Starting n8n...'));
      try {
        execSync('which n8n', { stdio: 'pipe' });
        const child = spawn('n8n', ['start'], { stdio: 'inherit', detached: true });
        child.unref();
        console.log(chalk.green('  ✓ n8n started at http://localhost:5678'));
      } catch {
        console.log(chalk.yellow('  ⚠ n8n not installed'));
        console.log(chalk.gray('  Install: npm install -g n8n'));
      }
      return;
    }

    console.log('');
    console.log(chalk.cyan.bold('  n8n Workflow Templates'));
    console.log('');
    const workflows = [
      'Daily Status Digest', 'Email Priority Filter', 'GitHub Commit Monitor',
      'Agent Health Check', 'Google Drive Sync', 'Lead Capture Pipeline',
      'Content Publishing', 'Invoice Processing', 'Meeting Scheduler',
      'Slack/Discord Notifier', 'Data Pipeline ETL', 'Weekly Report Generator',
    ];
    workflows.forEach((w, i) => {
      console.log(`  ${chalk.gray(String(i + 1).padStart(2, '0'))} ${chalk.white(w)}`);
    });
    console.log('');
    console.log(chalk.gray('  Start n8n: mark1 n8n --start'));
    console.log(chalk.gray('  Templates: github.com/swanhtet01/swanhtet01.github.io/command-center/n8n-workflows.json'));
    console.log('');
  });

program.parse();
