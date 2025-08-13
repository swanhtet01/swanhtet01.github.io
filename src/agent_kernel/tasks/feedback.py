"""Feedback intake and planning tasks for Agent Kernel.

Provides endpoints to store stakeholder feedback and generate a change plan
that other agents can consume.
"""
import os
from datetime import datetime, timezone
from typing import List, Dict, Any

from ..kernel import TaskContext
from .basic import kernel  # reuse the global kernel instance

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
REQUESTS_DIR = os.path.join(BASE_DIR, 'agent_requests')
TASKS_DIR = os.path.join(BASE_DIR, 'agent_tasks')
PLAN_FILE = os.path.join(BASE_DIR, 'CHANGE_PLAN.md')

os.makedirs(REQUESTS_DIR, exist_ok=True)
os.makedirs(TASKS_DIR, exist_ok=True)

@kernel.task("feedback:store_message")
def store_message(ctx: TaskContext):
    content = ctx.params.get('content')
    source = ctx.params.get('source', 'stakeholder')
    if not content or not isinstance(content, str):
        raise ValueError("'content' (string) is required")
    ts = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    fname = f"feedback_{source}_{ts}.md"
    fpath = os.path.join(REQUESTS_DIR, fname)
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content.strip() + "\n")
    ctx.log(f"Stored feedback at {fpath}")
    # also drop a task signal other agents can read
    task_sig = {
        "type": "feedback",
        "source": source,
        "path": fpath,
        "received_at": ts,
    }
    with open(os.path.join(TASKS_DIR, 'latest_feedback.json'), 'w', encoding='utf-8') as f:
        import json; json.dump(task_sig, f, indent=2)
    return {"path": fpath, "signal": task_sig}

@kernel.task("feedback:plan_changes")
def plan_changes(ctx: TaskContext):
    title = ctx.params.get('title', 'Change Plan')
    items: List[Dict[str, Any]] = ctx.params.get('items', [])
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    lines = [
        f"# {title}",
        "",
        f"Generated: {now}",
        "",
        "## Checklist",
    ]
    if not items:
        lines += [
            "- [ ] Define scope",
            "- [ ] Update website content",
            "- [ ] Adjust workflows",
            "- [ ] Update agents & tests",
            "- [ ] Verify deployment",
        ]
    else:
        for i in items:
            desc = i.get('desc') or i.get('description') or 'Task'
            lines.append(f"- [ ] {desc}")
    with open(PLAN_FILE, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines) + "\n")
    ctx.log(f"Wrote change plan to {PLAN_FILE}")
    # For agents
    with open(os.path.join(TASKS_DIR, 'change_plan_path.txt'), 'w', encoding='utf-8') as f:
        f.write(PLAN_FILE)
    return {"plan_path": PLAN_FILE, "items": len(items)}
