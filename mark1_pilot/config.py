from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def _expand(value: Any) -> Any:
    if isinstance(value, str):
        expanded = os.path.expandvars(value)
        if expanded == value and "${" in value and "}" in value:
            return ""
        return expanded
    if isinstance(value, list):
        return [_expand(item) for item in value]
    if isinstance(value, dict):
        return {key: _expand(item) for key, item in value.items()}
    return value


WINDOWS_ABS_PATH_PATTERN = re.compile(r"^[A-Za-z]:[\\/]")


def _normalize_cross_platform_path(path_value: str) -> str:
    raw = (path_value or "").strip()
    if not raw:
        return raw

    # When running under Linux/WSL, map Windows-style paths to /mnt/<drive>/...
    if os.name != "nt" and WINDOWS_ABS_PATH_PATTERN.match(raw):
        drive = raw[0].lower()
        remainder = raw[2:].replace("\\", "/").lstrip("/")
        return f"/mnt/{drive}/{remainder}"

    return raw


def _path_from_config(path_value: str) -> Path:
    return Path(_normalize_cross_platform_path(path_value)).expanduser()


@dataclass(slots=True)
class DriveSourceConfig:
    mode: str
    local_root: str
    google_drive_folder_id: str
    service_account_json: str

    @property
    def local_root_path(self) -> Path:
        return _path_from_config(self.local_root)

    @property
    def service_account_path(self) -> Path | None:
        if not self.service_account_json:
            return None
        return _path_from_config(self.service_account_json)


@dataclass(slots=True)
class GmailSourceConfig:
    mode: str
    user_email: str
    query: str
    client_secret_json: str
    token_json: str
    profiles: dict[str, str] = field(default_factory=dict)

    @property
    def client_secret_path(self) -> Path | None:
        if not self.client_secret_json:
            return None
        return _path_from_config(self.client_secret_json)

    @property
    def token_path(self) -> Path | None:
        if not self.token_json:
            return None
        return _path_from_config(self.token_json)


@dataclass(slots=True)
class OutputConfig:
    inventory_dir: str

    @property
    def inventory_path(self) -> Path:
        return _path_from_config(self.inventory_dir)


@dataclass(slots=True)
class ExternalWatchSourceConfig:
    name: str
    kind: str
    url: str
    notes: str = ""


@dataclass(slots=True)
class ExternalSourceConfig:
    watch_keywords: list[str] = field(default_factory=list)
    news_sources: list[ExternalWatchSourceConfig] = field(default_factory=list)
    manual_sources: list[ExternalWatchSourceConfig] = field(default_factory=list)


@dataclass(slots=True)
class PlatformSearchQueryConfig:
    name: str
    query: str
    top_k: int = 5


@dataclass(slots=True)
class PlatformPublishConfig:
    site_dir: str = "./swan-intelligence-hub"
    workspace_folder_name: str = "Swan Intelligence Hub"
    drive_folder_id: str = ""
    publish_to_drive: bool = True
    create_google_doc: bool = True

    @property
    def site_path(self) -> Path:
        return _path_from_config(self.site_dir)


@dataclass(slots=True)
class PlatformDigestConfig:
    dashboard_title: str = "Swan Intelligence Hub"
    email_profiles: list[str] = field(default_factory=list)
    search_queries: list[PlatformSearchQueryConfig] = field(default_factory=list)
    publish: PlatformPublishConfig = field(default_factory=PlatformPublishConfig)


@dataclass(slots=True)
class InputCenterTemplateConfig:
    key: str
    title: str
    description: str = ""
    headers: list[str] = field(default_factory=list)
    sample_row: list[str] = field(default_factory=list)


@dataclass(slots=True)
class InputCenterConfig:
    enabled: bool = True
    workspace_folder_name: str = "YTF Input Center"
    drive_folder_id: str = ""
    sheet_name: str = "Input"
    max_rows_per_sheet: int = 200
    registry_file: str = "input_center_registry.json"
    snapshot_file: str = "input_center_snapshot.json"
    summary_file: str = "input_center_snapshot.md"
    templates: list[InputCenterTemplateConfig] = field(default_factory=list)


@dataclass(slots=True)
class DQMSConfig:
    quality_profile_name: str = "quality_watch"
    quality_search_query: str = "claim OR complaint OR defect OR reject OR quality"
    owner_default: str = "Quality Team"
    due_days_default: int = 14
    incident_keywords: list[str] = field(
        default_factory=lambda: [
            "quality",
            "claim",
            "complaint",
            "defect",
            "reject",
            "ncr",
            "capa",
            "nonconformance",
        ]
    )
    incident_file: str = "dqms_incidents.json"
    capa_file: str = "dqms_capa_actions.json"
    supplier_file: str = "dqms_supplier_nonconformance.json"
    weekly_summary_file: str = "dqms_weekly_summary.md"


@dataclass(slots=True)
class ERPConfig:
    watch_patterns: list[str] = field(
        default_factory=lambda: [
            "kcm/**",
            "sales/**",
            "strategy/**",
            "**/*cash*",
            "**/*invoice*",
            "**/*claim*",
            "**/*quotation*",
            "**/*shipment*",
        ]
    )
    snapshot_file: str = "erp_snapshot.json"
    change_file: str = "erp_change_register.json"
    change_markdown_file: str = "erp_change_register.md"
    max_recent_changes: int = 40
    include_drive_activity: bool = True
    drive_activity_required: bool = False
    drive_snapshot_file: str = "erp_drive_snapshot.json"
    drive_change_file: str = "erp_drive_change_register.json"
    drive_change_markdown_file: str = "erp_drive_change_register.md"
    drive_max_items: int = 5000
    drive_watch_patterns: list[str] = field(
        default_factory=lambda: [
            "**/kcm/**",
            "**/sales/**",
            "**/strategy/**",
            "**/*cash*",
            "**/*invoice*",
            "**/*claim*",
            "**/*quotation*",
            "**/*shipment*",
        ]
    )
    module_keywords: dict[str, list[str]] = field(default_factory=dict)
    focus_terms: list[str] = field(default_factory=list)
    focus_file: str = "erp_focus_terms.txt"
    focus_report_file: str = "erp_focus_report.json"
    focus_markdown_file: str = "erp_focus_report.md"


@dataclass(slots=True)
class PilotConfig:
    project_name: str
    drive: DriveSourceConfig
    gmail: GmailSourceConfig
    external: ExternalSourceConfig
    platform: PlatformDigestConfig
    input_center: InputCenterConfig
    dqms: DQMSConfig
    erp: ERPConfig
    output: OutputConfig

    @classmethod
    def from_path(cls, config_path: str | Path) -> "PilotConfig":
        raw_path = _path_from_config(str(config_path))
        data = json.loads(raw_path.read_text(encoding="utf-8"))
        data = _expand(data)

        drive = DriveSourceConfig(**data["sources"]["drive"])
        gmail = GmailSourceConfig(**data["sources"]["gmail"])
        external_data = data["sources"].get("external", {})
        external = ExternalSourceConfig(
            watch_keywords=external_data.get("watch_keywords", []),
            news_sources=[
                ExternalWatchSourceConfig(**item)
                for item in external_data.get("news_sources", [])
            ],
            manual_sources=[
                ExternalWatchSourceConfig(**item)
                for item in external_data.get("manual_sources", [])
            ],
        )
        platform_data = data.get("platform", {})
        publish_data = platform_data.get("publish", {})
        platform = PlatformDigestConfig(
            dashboard_title=platform_data.get("dashboard_title", "Swan Intelligence Hub"),
            email_profiles=platform_data.get("email_profiles", []),
            search_queries=[
                PlatformSearchQueryConfig(**item)
                for item in platform_data.get("search_queries", [])
            ],
            publish=PlatformPublishConfig(**publish_data) if publish_data else PlatformPublishConfig(),
        )
        input_center_data = data.get("input_center", {})
        input_center = InputCenterConfig(
            enabled=input_center_data.get("enabled", True),
            workspace_folder_name=input_center_data.get("workspace_folder_name", "YTF Input Center"),
            drive_folder_id=input_center_data.get("drive_folder_id", ""),
            sheet_name=input_center_data.get("sheet_name", "Input"),
            max_rows_per_sheet=input_center_data.get("max_rows_per_sheet", 200),
            registry_file=input_center_data.get("registry_file", "input_center_registry.json"),
            snapshot_file=input_center_data.get("snapshot_file", "input_center_snapshot.json"),
            summary_file=input_center_data.get("summary_file", "input_center_snapshot.md"),
            templates=[
                InputCenterTemplateConfig(**item)
                for item in input_center_data.get("templates", [])
            ],
        )
        dqms = DQMSConfig(**data.get("dqms", {}))
        erp = ERPConfig(**data.get("erp", {}))
        output = OutputConfig(**data["output"])

        return cls(
            project_name=data["project_name"],
            drive=drive,
            gmail=gmail,
            external=external,
            platform=platform,
            input_center=input_center,
            dqms=dqms,
            erp=erp,
            output=output,
        )
