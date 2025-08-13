"""Core starter tasks for the Agent Kernel."""
from datetime import datetime, timezone
from ..kernel import AgentKernel, TaskContext

kernel = AgentKernel()

@kernel.task("heartbeat")
def heartbeat(ctx: TaskContext):
    ctx.log("Heartbeat check")
    return {"utc": datetime.now(timezone.utc).isoformat()}

@kernel.task("env:list_keys")
def list_env(ctx: TaskContext):
    prefix = ctx.params.get("prefix")
    keys = sorted(k for k in ctx.env.keys() if (not prefix or k.startswith(prefix)))
    ctx.log(f"Found {len(keys)} keys")
    return keys

@kernel.task("demo:generate_post")
def generate_post(ctx: TaskContext):
    topic = ctx.params.get("topic", "Super Mega AI")
    style = ctx.params.get("style", "concise")
    # Placeholder deterministic pseudo-generation
    post = f"[{style}] {topic} | Elevate reach with focused AI automation. #SuperMega #AI"
    ctx.log("Generated post")
    return {"post": post}

# Auto-schedule a heartbeat every 60s when module imported (can be disabled externally)
kernel.schedule_every(60, "heartbeat")
