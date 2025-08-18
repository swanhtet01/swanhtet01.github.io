Agent Kernel (Minimal)
=======================
A lightweight, replicable orchestration core for running small autonomous / scheduled tasks ("agents") with **zero heavy dependencies**.

Features
- Task registration decorator
- Explicit task invocation via HTTP GET
- Simple interval scheduler (in-process, threads)
- Environment-only secret access
- Extensible: add modules under `tasks/` or `adapters/`

Quick Start
1. Set environment variables for any secrets (never commit real keys):
   - On Windows PowerShell:  `$env:OPENAI_API_KEY="sk-..."`
2. Run the HTTP server:
   `python -m agent_kernel.serve --port 8000`
3. List tasks:  `GET /tasks`
4. Run heartbeat: `GET /run/heartbeat`
5. Generate a demo post: `GET /run/demo:generate_post?topic=Launch&style=punchy`

Adding a Task
```
from agent_kernel.kernel import AgentKernel, TaskContext
from agent_kernel.tasks.basic import kernel  # reuse global kernel

@kernel.task("my:task")
def my_task(ctx: TaskContext):
    ctx.log("Running custom logic")
    return {"ok": True}
```

Scheduling
```
from agent_kernel.tasks.basic import kernel
kernel.schedule_every(300, "demo:generate_post", topic="Status", style="daily")
```

Why This Exists
To provide a minimal, auditable base you can replicate on any EC2 (or container) to run focused automation without the complexity of the larger experimental codebase.

Next Steps (Suggested)
- Add adapter: OpenAI/Gemini wrapper with rate limiting
- Add persistence: lightweight SQLite for task run history
- Add auth token (shared secret) on HTTP endpoints
- Expose webhook trigger endpoint (POST) for GitHub or external events

Security Notes
- No secrets in code or static site; load only from env / secret manager
- Add a reverse proxy (nginx) + basic auth or token header before internet exposure

License: Internal / Proprietary (adjust as needed)
