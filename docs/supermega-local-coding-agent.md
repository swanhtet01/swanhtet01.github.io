# SuperMega local coding agent

This repository can be inspected, edited, and tested with a fully local coding-agent stack. The default is Ollama for inference and OpenCode for agentic file, Git, search, and terminal tools. It uses the already-installed local model and does not require a paid API.

## Fastest start

Open PowerShell or Command Prompt and run:

```powershell
C:\Users\thesw\Projects\local-agent-company\local-code.cmd C:\Users\thesw\Projects\supermega-platform
```

The launcher admits only Llama models. It uses `llama3.2:3b` when installed and current memory permits it; otherwise it uses `llama3.2:1b`. The 1B model is suitable for narrow searches, summaries, tests, and small constrained edits. A larger local model will usually produce better repository changes but consume more memory.

Before launching a model, run the read-only readiness check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\thesw\.codex\skills\supermega-local-ai\scripts\check_local_ai.ps1 -ProjectPath C:\Users\thesw\Projects\supermega-platform
```

After the stack check, run `local-code.cmd --check C:\Users\thesw\Projects\supermega-platform`; its ready receipt must name an admitted Llama model. A desktop application being installed is not proof that its model server is running.

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

Do not ask the 1B model to redesign the whole product, autonomously deploy, or make business decisions. Use it for bounded execution; use Codex for review, complex architecture, security-sensitive work, and final verification.

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

## Lane pre-review (advisory)

Before publishing a lane branch, ask the same free local stack for an advisory pre-review of the committed diff:

```powershell
npm.cmd run lane:prereview
```

The wrapper is `tools/run_local_prereview.mjs` (contract `supermega.local-prereview.v1`) and it behaves as follows:

- Reviews `origin/main...HEAD` by default. Pass one other ref or range as the only argument, for example `npm.cmd run lane:prereview -- HEAD~3...HEAD`. Ranges must not start with `-`, so git option injection is rejected up front.
- Probes readiness first through the documented `check_local_ai.ps1` read-only check (falling back to `local-code.cmd --check`). When the stack is absent or not ready it fails closed with the single JSON reason line `local_prereview_unavailable` and touches nothing else — no error spray, no partial output. `npm.cmd run lane:prereview:check` runs only this probe.
- Writes a bounded review task (at most 30,000 bytes: change summary request plus changed-file list plus truncated unified diff) into the git-ignored `.tmp/local-prereview/` directory, then invokes the headless runner `local-code.cmd --run` (receipt schema `local-ai.coding-run.v1`, `paidApiUsed:false`, bounded caps). The task instructs the model to summarize the change and flag suspicious deletions, secret-shaped additions, and scope creep — review text only.
- The expected receipt outcome for a review is `no_file_change`, which the wrapper records as `clean_advisory`. A receipt showing changed files is recorded loudly as `mutation_detected` but, like every finding, it is advisory and blocks nothing.
- Captures the runner receipt verbatim, digests it (`sha256:` over the exact receipt line), and writes a report (`prereview-*.json`) with the receipt, digest, changed files, and review text next to the task file in `.tmp/local-prereview/`.
- The wrapper itself performs zero network calls (its self-test asserts the source imports no network-capable module) and mutates nothing outside `.tmp/local-prereview/`. The runner's inference is loopback-only Ollama by design.
- `npm.cmd run lane:prereview:self-test` proves the wiring with a fully stubbed subprocess layer, so it passes on GitHub runners without Ollama, OpenCode, or PowerShell installed.
