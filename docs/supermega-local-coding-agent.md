# SuperMega local coding agent

This repository can be inspected, edited, and tested with a fully local coding-agent stack. The default is Ollama for inference and OpenCode for agentic file, Git, search, and terminal tools. It uses the already-installed local model and does not require a paid API.

## Fastest start

Open PowerShell or Command Prompt and run:

```powershell
C:\Users\thesw\Projects\local-agent-company\local-code.cmd C:\Users\thesw\Projects\supermega-platform
```

The launcher uses `qwen3.5:4b` when installed and otherwise uses `qwen3.5:0.8b`. The 0.8B model is suitable for narrow searches, summaries, tests, and small constrained edits. A larger local model will usually produce better repository changes but consume more memory.

Before launching a model, run the read-only readiness check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\thesw\.codex\skills\supermega-local-ai\scripts\check_local_ai.ps1 -ProjectPath C:\Users\thesw\Projects\supermega-platform
```

`codingAgentReady: true` means Ollama, OpenCode, the launcher, and a supported Qwen model are present. A desktop application being installed is not proof that its model server is running.

## Share with Codex agents

The reusable user-level skill is installed at:

```text
C:\Users\thesw\.codex\skills\supermega-local-ai\SKILL.md
```

In a new Codex task, use this prompt:

> Use the `supermega-local-ai` skill. Work in `C:\Users\thesw\Projects\supermega-platform`. Read `docs/supermega-local-coding-agent.md`, choose one concrete outcome, keep scope to at most five paths, validate it locally, and perform no push, merge, deploy, external send, payment, credential, or hosted mutation.

The user-level skill covers machine-specific launch and runtime details. This document carries the repository's local-agent contract, so the same safety and validation rules reach Codex, OpenCode, Bionic, and other file-aware coding agents.

## Use Bionic

Create or edit a **Code Project** whose root is exactly:

```text
C:\Users\thesw\Projects\supermega-platform
```

Do not use the broader OneDrive folder as the code-project root. Start a focused Bionic session with:

> Read `docs/supermega-local-coding-agent.md` completely. Work on one exact deliverable in at most five paths. Inspect Git status first, preserve unrelated changes, run the narrowest test, and do not push, merge, deploy, publish, send messages, accept payment, inspect credentials, or mutate hosted systems.

Choose a local model in Bionic for the free-local path. If Bionic offers a cloud model, assume it can incur account or credit usage unless its UI explicitly proves otherwise.

## Use LM Studio

LM Studio is optional. It is useful for chatting with downloaded models, comparing quality and speed, or serving one model through an OpenAI-compatible loopback API. It does not replace the file and terminal tools provided by OpenCode or a Bionic Code Project.

When an application specifically needs the LM Studio API:

1. Stop or unload the Ollama model first.
2. Load one model in LM Studio.
3. Start the server from LM Studio's Developer page on `http://127.0.0.1:1234/v1`.
4. Keep **Serve on Local Network** disabled.
5. Stop the server and unload the model when finished.

Do not run LM Studio and Ollama inference simultaneously on this Ally. The repository launcher uses Ollama, so LM Studio's server should normally remain off.

## Give small models good tasks

Use prompts with one outcome, exact paths, acceptance checks, and explicit exclusions. For example:

> Objective: add validation for the Shop pilot input. Deliverable: one validator and its focused test. Scope: `tools/example.mjs` and `tools/example.test.mjs`. Out of scope: UI, deployment, database, and external calls. Run the focused test and stop after reporting the diff and proof.

Do not ask the 0.8B model to redesign the whole product, autonomously deploy, or make business decisions. Use it for bounded execution; use Codex for review, complex architecture, security-sensitive work, and final verification.

## Existing money workflow

For the private Shop lead-to-pilot workflow, read `docs/supermega-shop-sales-agent.md` and begin with:

```powershell
npm.cmd run client:pilot:workspace:self-test
```

That workflow can prepare a reviewed handoff and reply draft. It never contacts the prospect, accepts payment, deploys, or changes hosted data automatically.

## Stop cleanly

Exit OpenCode or Bionic when the task is done. Ollama is configured for short keep-alive and should return to zero loaded models. Confirm with:

```powershell
ollama ps
```

An empty model list is the desired idle state.
