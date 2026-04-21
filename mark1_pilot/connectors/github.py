from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


GITHUB_API_ROOT = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"
DEFAULT_TIMEOUT_SECONDS = 12
FAILING_RUN_CONCLUSIONS = {"failure", "startup_failure", "timed_out", "cancelled", "action_required"}


class GitHubRepoProbe:
    def __init__(self, repo_root: Path | None, *, token: str = "", repo_slug: str = "") -> None:
        self.repo_root = repo_root
        self.token = str(token or "").strip()
        self.repo_slug = str(repo_slug or "").strip()

    def _git(self, *args: str) -> str:
        if self.repo_root is None or not self.repo_root.exists():
            return ""
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return ""
        if result.returncode != 0:
            return ""
        return str(result.stdout or "").strip()

    @staticmethod
    def _sanitize_remote_url(value: str) -> str:
        raw = str(value or "").strip()
        if not raw:
            return ""
        if raw.startswith("http://") or raw.startswith("https://"):
            parsed = urlparse(raw)
            host = parsed.hostname or ""
            path = parsed.path or ""
            if parsed.scheme and host:
                return f"{parsed.scheme}://{host}{path}"
        return raw

    @staticmethod
    def _remote_has_embedded_credentials(value: str) -> bool:
        raw = str(value or "").strip()
        if not raw or not (raw.startswith("http://") or raw.startswith("https://")):
            return False
        parsed = urlparse(raw)
        return bool(parsed.username or parsed.password)

    @staticmethod
    def _repo_slug_from_remote(value: str) -> str:
        raw = str(value or "").strip()
        if not raw:
            return ""
        patterns = (
            r"github\.com[:/](?:[^@/]+@)?([^/]+/[^/]+?)(?:\.git)?$",
            r"^git@github\.com:([^/]+/[^/]+?)(?:\.git)?$",
        )
        for pattern in patterns:
            match = re.search(pattern, raw, flags=re.I)
            if match:
                return str(match.group(1) or "").strip()
        return ""

    def _api_json(self, path: str) -> dict[str, Any]:
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "SuperMega-GitHub-Probe",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(f"{GITHUB_API_ROOT}{path}", headers=headers, method="GET")
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8") or "{}")

    def probe(self) -> dict[str, Any]:
        if self.repo_root is None:
            return {
                "status": "not_configured",
                "message": "No repository root is configured for GitHub probe.",
            }

        normalized_root = self.repo_root.expanduser().resolve()
        if not normalized_root.exists():
            return {
                "status": "missing_repo",
                "message": f"Configured repository root does not exist: {normalized_root}",
            }

        branch = self._git("rev-parse", "--abbrev-ref", "HEAD")
        head_sha = self._git("rev-parse", "HEAD")
        head_subject = self._git("log", "-1", "--pretty=%s")
        head_authored_at = self._git("log", "-1", "--date=iso-strict", "--pretty=%cI")
        is_dirty = bool(self._git("status", "--short"))
        origin_url = self._git("config", "--get", "remote.origin.url")
        repo_slug = self.repo_slug or self._repo_slug_from_remote(origin_url)
        remote_has_embedded_credentials = self._remote_has_embedded_credentials(origin_url)

        payload: dict[str, Any] = {
            "status": "local_only",
            "message": "GitHub runtime is using local git state only.",
            "repo_root": str(normalized_root),
            "repo": repo_slug,
            "branch": branch,
            "head_sha": head_sha,
            "head_subject": head_subject,
            "head_authored_at": head_authored_at,
            "is_dirty": is_dirty,
            "origin_url": self._sanitize_remote_url(origin_url),
            "remote_credential_embedded": remote_has_embedded_credentials,
            "api_access_mode": "local_only",
        }

        if not repo_slug:
            payload["message"] = "Origin remote is not a resolvable GitHub repository."
            return payload

        try:
            repo_response = self._api_json(f"/repos/{repo_slug}")
            runs_response = self._api_json(f"/repos/{repo_slug}/actions/runs?per_page=5")
        except HTTPError as exc:
            message = f"GitHub API request failed with HTTP {exc.code}."
            if not self.token and exc.code in {401, 403, 404}:
                payload["message"] = message + " Falling back to local git state."
                return payload
            return {
                **payload,
                "status": "error",
                "message": message,
                "api_access_mode": "token" if self.token else "public_api",
            }
        except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            if not self.token:
                payload["message"] = f"GitHub API unavailable ({exc}); using local git state only."
                return payload
            return {
                **payload,
                "status": "error",
                "message": str(exc),
                "api_access_mode": "token",
            }

        workflow_runs = runs_response.get("workflow_runs", []) if isinstance(runs_response, dict) else []
        latest_run = workflow_runs[0] if workflow_runs and isinstance(workflow_runs[0], dict) else {}
        failing_run_count = sum(
            1
            for item in workflow_runs
            if isinstance(item, dict) and str(item.get("conclusion", "")).strip().lower() in FAILING_RUN_CONCLUSIONS
        )

        return {
            **payload,
            "status": "ready",
            "message": "GitHub repository and Actions runtime are reachable.",
            "api_access_mode": "token" if self.token else "public_api",
            "default_branch": str(repo_response.get("default_branch", "")).strip(),
            "is_private": bool(repo_response.get("private", False)),
            "is_archived": bool(repo_response.get("archived", False)),
            "open_issues_count": int(repo_response.get("open_issues_count", 0) or 0),
            "workflow_runs_count_sampled": len(workflow_runs),
            "failing_workflow_run_count": failing_run_count,
            "latest_workflow_run": {
                "id": latest_run.get("id", ""),
                "name": latest_run.get("name", ""),
                "status": latest_run.get("status", ""),
                "conclusion": latest_run.get("conclusion", ""),
                "event": latest_run.get("event", ""),
                "head_branch": latest_run.get("head_branch", ""),
                "head_sha": latest_run.get("head_sha", ""),
                "html_url": latest_run.get("html_url", ""),
                "created_at": latest_run.get("created_at", ""),
                "updated_at": latest_run.get("updated_at", ""),
                "run_number": latest_run.get("run_number", 0),
            },
        }
