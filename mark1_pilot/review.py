from __future__ import annotations

import os
import shutil
import sys
from datetime import UTC, datetime
from typing import Any

from .config import PilotConfig


def build_review_markdown(
    config: PilotConfig,
    inventory: dict[str, Any],
    drive_probe: dict[str, Any],
    gmail_client: dict[str, Any],
    gmail_probe: dict[str, Any],
) -> str:
    lines: list[str] = []
    lines.append("# Yangon Tyre Pilot Review")
    lines.append("")
    lines.append(f"- Generated: {datetime.now(UTC).isoformat()}")
    lines.append(f"- Project: `{config.project_name}`")
    lines.append("")
    lines.append("## Findings")
    lines.append("")
    lines.append(
        f"- The local Yangon Tyre corpus is real and usable now: `{inventory['total_files']}` files under `{inventory['root']}`."
    )
    lines.append(
        "- The highest-value source for v1 is the Yangon Tyre corpus, dominated by spreadsheet, document, and PDF files."
    )
    if gmail_probe.get("status") == "ready":
        lines.append(
            f"- Gmail is live as `{config.gmail.mode}` and the mailbox `{gmail_probe.get('email_address', '')}` is connected."
        )
    else:
        lines.append(
            f"- Gmail is configured as `{config.gmail.mode}`, but it only becomes usable once user OAuth files are present."
        )
        if gmail_client.get("status") != "ready" and gmail_client.get("message"):
            lines.append(f"- The current Gmail OAuth client is not usable yet: {gmail_client['message']}")
    if drive_probe.get("folder"):
        folder = drive_probe["folder"]
        lines.append(
            f"- The shared Google Drive root is validated: `{folder.get('name', '')}` (`{folder.get('id', '')}`) is accessible through the service account."
        )
    else:
        lines.append(
            "- Direct Drive API access is optional. It depends on the target folder being shared to the service account or an equivalent delegated access model."
        )
    lines.append("")
    lines.append("## Environment reality")
    lines.append("")
    lines.append(f"- Python executable used by the pilot: `{sys.executable}`")
    lines.append(f"- `rclone` on PATH: `{bool(shutil.which('rclone'))}`")
    lines.append(f"- `manus-mcp-cli` on PATH: `{bool(shutil.which('manus-mcp-cli'))}`")
    lines.append("")
    lines.append("## Connector status")
    lines.append("")
    lines.append(f"- Google Drive probe: `{drive_probe['status']}`")
    if drive_probe.get("message"):
        lines.append(f"- Google Drive note: {drive_probe['message']}")
    if drive_probe.get("folder"):
        folder = drive_probe["folder"]
        lines.append(
            f"- Google Drive folder: `{folder.get('name', '')}` | `{folder.get('id', '')}`"
        )
    if drive_probe.get("sample_children"):
        child_names = ", ".join(
            child.get("name", "")
            for child in drive_probe["sample_children"][:5]
            if child.get("name")
        )
        if child_names:
            lines.append(f"- Sample Drive children: {child_names}")
    lines.append(f"- Gmail client: `{gmail_client['status']}`")
    if gmail_client.get("message"):
        lines.append(f"- Gmail client note: {gmail_client['message']}")
    lines.append(f"- Gmail probe: `{gmail_probe['status']}`")
    if gmail_probe.get("message"):
        lines.append(f"- Gmail note: {gmail_probe['message']}")
    lines.append("")
    lines.append("## Immediate priorities")
    lines.append("")
    lines.append("- Build retrieval over the local Yangon Tyre mirror first.")
    lines.append("- Stop storing secrets in screenshots, docs, and loose downloads.")
    if gmail_probe.get("status") == "ready":
        lines.append("- Turn the now-working Gmail connection into repeatable briefs, triage, and cross-linking with file evidence.")
    else:
        lines.append("- Create proper Gmail OAuth client and token files if email is part of v1.")
    if drive_probe.get("folder"):
        lines.append("- Expand Drive ingestion from the validated shared root into targeted subfolders such as Plant A and Plant B.")
    else:
        lines.append("- Use Drive API only if folder sharing and permissions are confirmed.")
    lines.append("")
    lines.append("## Secret hygiene")
    lines.append("")
    lines.append(
        "- Store secret file paths in `.env`, not raw credentials in markdown, screenshots, or tracked JSON."
    )
    lines.append(
        "- Rotate any exposed keys before connecting this pilot to production data or cloud resources."
    )
    lines.append("")
    return "\n".join(lines)


def build_connector_presence_summary(config: PilotConfig) -> dict[str, Any]:
    return {
        "drive_local_root_exists": config.drive.local_root_path.exists(),
        "service_account_path_exists": bool(
            config.drive.service_account_path and config.drive.service_account_path.exists()
        ),
        "gmail_client_secret_exists": bool(
            config.gmail.client_secret_path and config.gmail.client_secret_path.exists()
        ),
        "gmail_token_exists": bool(
            config.gmail.token_path and config.gmail.token_path.exists()
        ),
        "pilot_output_dir": str(config.output.inventory_path),
        "cwd": os.getcwd(),
    }
