from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path


REPO_ROOT = Path(r"C:\Users\swann\OneDrive - BDA\swanhtet01.github.io.worktrees\copilot-worktree-2026-03-04T08-10-33")
WRAPPER = REPO_ROOT / "tools" / "start_supermega_mcp.ps1"


def send_message(proc: subprocess.Popen[bytes], payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
    assert proc.stdin is not None
    proc.stdin.write(header + body)
    proc.stdin.flush()


def read_message(proc: subprocess.Popen[bytes], timeout: float = 10.0) -> dict:
    assert proc.stdout is not None
    deadline = time.time() + timeout
    headers = b""
    while b"\r\n\r\n" not in headers:
        if time.time() > deadline:
            raise TimeoutError("Timed out waiting for MCP headers")
        chunk = proc.stdout.read(1)
        if not chunk:
            stderr = b""
            if proc.stderr is not None:
                try:
                    stderr = proc.stderr.read()
                except Exception:
                    stderr = b""
            raise RuntimeError(f"MCP process closed while waiting for headers. STDERR: {stderr.decode('utf-8', errors='ignore')}")
        headers += chunk
    header_blob, _ = headers.split(b"\r\n\r\n", 1)
    content_length = 0
    for line in header_blob.decode("ascii", errors="ignore").split("\r\n"):
        if line.lower().startswith("content-length:"):
            content_length = int(line.split(":", 1)[1].strip())
            break
    if content_length <= 0:
        raise RuntimeError("Invalid MCP content length")
    body = proc.stdout.read(content_length)
    if not body:
        raise RuntimeError("MCP process closed while reading body")
    return json.loads(body.decode("utf-8"))


def main() -> int:
    proc = subprocess.Popen(
        [
            "powershell",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(WRAPPER),
        ],
        cwd=str(REPO_ROOT),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        send_message(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "supermega-mcp-smoke", "version": "1.0.0"},
                },
            },
        )
        init_response = read_message(proc)
        send_message(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

        send_message(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        tools_response = read_message(proc)

        send_message(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "mark1_insights",
                    "arguments": {},
                },
            },
        )
        insights_response = read_message(proc)

        report = {
            "initialize_ok": "result" in init_response,
            "tool_count": len((tools_response.get("result") or {}).get("tools", [])),
            "insights_ok": "result" in insights_response,
        }
        print(json.dumps(report, indent=2))
        return 0
    finally:
        proc.kill()
        proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
