import os
import time
import threading
from dataclasses import dataclass, field
from typing import Callable, Dict, Any, Optional, List

TaskFunc = Callable[["TaskContext"], Any]

@dataclass
class TaskContext:
    name: str
    run_id: str
    env: Dict[str, str]
    params: Dict[str, Any] = field(default_factory=dict)
    logs: List[str] = field(default_factory=list)

    def log(self, msg: str):
        line = f"[{self.name}] {msg}"
        self.logs.append(line)
        print(line)

class AgentKernel:
    def __init__(self):
        self._tasks: Dict[str, TaskFunc] = {}
        self._schedules: List[Dict[str, Any]] = []
        self._lock = threading.RLock()
        self._running = False

    # Registration -------------------------------------------------
    def register(self, name: str, func: TaskFunc):
        if name in self._tasks:
            raise ValueError(f"Task '{name}' already registered")
        self._tasks[name] = func
        return func

    def task(self, name: str):
        def decorator(func: TaskFunc):
            self.register(name, func)
            return func
        return decorator

    # Invocation ---------------------------------------------------
    def run_task(self, name: str, **params):
        func = self._tasks.get(name)
        if not func:
            raise KeyError(f"Unknown task: {name}")
        ctx = TaskContext(name=name, run_id=str(time.time()), env=dict(os.environ), params=params)
        ctx.log("Starting")
        try:
            result = func(ctx)
            ctx.log("Completed")
            return {"status": "ok", "result": result, "logs": ctx.logs}
        except Exception as e:  # noqa
            ctx.log(f"Error: {e}")
            return {"status": "error", "error": str(e), "logs": ctx.logs}

    # Scheduling ---------------------------------------------------
    def schedule_every(self, seconds: int, task_name: str, **params):
        self._schedules.append({"interval": seconds, "task": task_name, "params": params, "next": time.time()+seconds})

    def _schedule_loop(self):
        while self._running:
            now = time.time()
            for sched in self._schedules:
                if now >= sched["next"]:
                    threading.Thread(target=self.run_task, args=(sched["task"],), kwargs=sched["params"], daemon=True).start()
                    sched["next"] = now + sched["interval"]
            time.sleep(0.5)

    def start(self):
        if self._running:
            return
        self._running = True
        threading.Thread(target=self._schedule_loop, daemon=True).start()

    def stop(self):
        self._running = False

    # Introspection ------------------------------------------------
    def list_tasks(self):
        return sorted(self._tasks.keys())

    def list_schedules(self):
        return [{k: v for k, v in s.items() if k != 'next'} for s in self._schedules]
