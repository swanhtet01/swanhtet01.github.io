from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any


DRIVE_METADATA_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly"
DRIVE_FULL_SCOPE = "https://www.googleapis.com/auth/drive"
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
DOC_MIME_TYPE = "application/vnd.google-apps.document"


class GoogleDriveProbe:
    def __init__(self, service_account_json: Path | None, folder_id: str) -> None:
        self.service_account_json = service_account_json
        self.folder_id = folder_id

    def _validate_base_config(self) -> dict[str, Any] | None:
        if not self.service_account_json:
            return {
                "status": "not_configured",
                "message": "No service account file path is configured.",
            }

        if not self.service_account_json.exists():
            return {
                "status": "missing_file",
                "message": f"Configured service account file does not exist: {self.service_account_json}",
            }
        return None

    def _build_service(self, scopes: list[str]) -> tuple[Any, Any]:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        credentials = service_account.Credentials.from_service_account_file(
            str(self.service_account_json),
            scopes=scopes,
        )
        service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        return service, credentials

    @staticmethod
    def _escape_query_value(value: str) -> str:
        return value.replace("\\", "\\\\").replace("'", "\\'")

    def probe(self) -> dict[str, Any]:
        base_error = self._validate_base_config()
        if base_error:
            return base_error

        try:
            service, credentials = self._build_service([DRIVE_METADATA_SCOPE])
            about = service.about().get(fields="user").execute()
            result = {
                "status": "ready",
                "message": "Service account can authenticate to Drive API.",
                "service_account_email": getattr(credentials, "service_account_email", ""),
                "folder_id_configured": bool(self.folder_id),
                "drive_user": about.get("user", {}).get("emailAddress", ""),
            }
            if self.folder_id:
                folder = service.files().get(
                    fileId=self.folder_id,
                    fields="id,name,mimeType,webViewLink,owners",
                    supportsAllDrives=True,
                ).execute()
                children = service.files().list(
                    q=f"'{self.folder_id}' in parents and trashed = false",
                    fields="files(id,name,mimeType,modifiedTime,size)",
                    pageSize=25,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                ).execute().get("files", [])
                result["folder"] = {
                    "id": folder.get("id", ""),
                    "name": folder.get("name", ""),
                    "mime_type": folder.get("mimeType", ""),
                    "web_view_link": folder.get("webViewLink", ""),
                    "owner_emails": [
                        owner.get("emailAddress", "")
                        for owner in folder.get("owners", [])
                        if owner.get("emailAddress")
                    ],
                }
                result["sample_children"] = children[:10]
                result["children_count_sampled"] = len(children)
            return result
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"Google API client libraries are not available: {exc}",
            }
        except Exception as exc:
            message = str(exc)
            if "Service Accounts do not have storage quota" in message:
                return {
                    "status": "storage_quota_blocked",
                    "message": (
                        "Service-account publishing cannot write into a regular My Drive folder. "
                        "Use a Shared Drive or a user OAuth Drive publisher for Workspace output."
                    ),
                    "raw_message": message,
                    "folder_id_configured": bool(self.folder_id),
                }
            return {
                "status": "error",
                "message": message,
                "folder_id_configured": bool(self.folder_id),
            }

    def list_folder_tree(self, max_depth: int = 2, page_size: int = 100) -> dict[str, Any]:
        base_error = self._validate_base_config()
        if base_error:
            return base_error

        if not self.folder_id:
            return {
                "status": "missing_folder_id",
                "message": "No Google Drive folder ID is configured.",
            }

        try:
            service, _ = self._build_service([DRIVE_METADATA_SCOPE])

            def walk(folder_id: str, depth: int) -> dict[str, Any]:
                folder = service.files().get(
                    fileId=folder_id,
                    fields="id,name,mimeType,webViewLink",
                    supportsAllDrives=True,
                ).execute()
                node = {
                    "id": folder.get("id", ""),
                    "name": folder.get("name", ""),
                    "mime_type": folder.get("mimeType", ""),
                    "web_view_link": folder.get("webViewLink", ""),
                }
                if depth >= max_depth:
                    return node

                children = service.files().list(
                    q=f"'{folder_id}' in parents and trashed = false",
                    fields="files(id,name,mimeType,modifiedTime,size)",
                    orderBy="folder,name",
                    pageSize=page_size,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                ).execute().get("files", [])

                node["children"] = []
                for child in children:
                    child_node = {
                        "id": child.get("id", ""),
                        "name": child.get("name", ""),
                        "mime_type": child.get("mimeType", ""),
                        "modified_time": child.get("modifiedTime", ""),
                        "size": child.get("size", ""),
                    }
                    if child.get("mimeType") == FOLDER_MIME_TYPE:
                        child_node = walk(child["id"], depth + 1)
                    node["children"].append(child_node)
                return node

            return {
                "status": "ready",
                "root": walk(self.folder_id, 0),
            }
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"Google API client libraries are not available: {exc}",
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
            }

    def list_shared_drives(self, page_size: int = 100) -> dict[str, Any]:
        base_error = self._validate_base_config()
        if base_error:
            return base_error

        try:
            service, credentials = self._build_service([DRIVE_FULL_SCOPE])
            drives: list[dict[str, Any]] = []
            page_token = None
            while True:
                response = service.drives().list(
                    pageSize=page_size,
                    pageToken=page_token,
                    fields="nextPageToken,drives(id,name,createdTime,hidden)",
                    useDomainAdminAccess=False,
                ).execute()
                drives.extend(response.get("drives", []))
                page_token = response.get("nextPageToken")
                if not page_token:
                    break
            return {
                "status": "ready",
                "service_account_email": getattr(credentials, "service_account_email", ""),
                "count": len(drives),
                "drives": drives,
            }
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"Google API client libraries are not available: {exc}",
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
            }

    def _find_child_by_name(self, service: Any, parent_id: str, name: str, mime_type: str | None = None) -> dict[str, Any] | None:
        escaped_name = self._escape_query_value(name)
        query = [
            f"'{parent_id}' in parents",
            "trashed = false",
            f"name = '{escaped_name}'",
        ]
        if mime_type:
            query.append(f"mimeType = '{mime_type}'")
        response = service.files().list(
            q=" and ".join(query),
            fields="files(id,name,mimeType,webViewLink,webContentLink)",
            pageSize=1,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        files = response.get("files", [])
        return files[0] if files else None

    def _ensure_folder(self, service: Any, parent_id: str, folder_name: str) -> dict[str, Any]:
        existing = self._find_child_by_name(service, parent_id, folder_name, FOLDER_MIME_TYPE)
        if existing:
            return existing
        return service.files().create(
            body={
                "name": folder_name,
                "mimeType": FOLDER_MIME_TYPE,
                "parents": [parent_id],
            },
            fields="id,name,mimeType,webViewLink",
            supportsAllDrives=True,
        ).execute()

    def _upsert_file(
        self,
        service: Any,
        *,
        parent_id: str,
        name: str,
        mime_type: str,
        content: bytes,
    ) -> dict[str, Any]:
        from googleapiclient.http import MediaInMemoryUpload

        existing = self._find_child_by_name(service, parent_id, name)
        media = MediaInMemoryUpload(content, mimetype=mime_type, resumable=False)
        if existing:
            return service.files().update(
                fileId=existing["id"],
                media_body=media,
                body={"name": name},
                fields="id,name,mimeType,webViewLink,webContentLink",
                supportsAllDrives=True,
            ).execute()

        return service.files().create(
            body={
                "name": name,
                "parents": [parent_id],
            },
            media_body=media,
            fields="id,name,mimeType,webViewLink,webContentLink",
            supportsAllDrives=True,
        ).execute()

    def _create_google_doc(self, service: Any, *, parent_id: str, name: str, html_content: str) -> dict[str, Any]:
        from googleapiclient.http import MediaInMemoryUpload

        media = MediaInMemoryUpload(
            html_content.encode("utf-8"),
            mimetype="text/html",
            resumable=False,
        )
        return service.files().create(
            body={
                "name": name,
                "mimeType": DOC_MIME_TYPE,
                "parents": [parent_id],
            },
            media_body=media,
            fields="id,name,mimeType,webViewLink",
            supportsAllDrives=True,
        ).execute()

    def publish_dashboard_bundle(
        self,
        *,
        workspace_folder_name: str,
        dashboard_title: str,
        html_content: str,
        markdown_content: str,
        json_content: str,
        create_google_doc: bool = True,
    ) -> dict[str, Any]:
        base_error = self._validate_base_config()
        if base_error:
            return base_error

        if not self.folder_id:
            return {
                "status": "missing_folder_id",
                "message": "No Google Drive folder ID is configured.",
            }

        try:
            service, credentials = self._build_service([DRIVE_FULL_SCOPE])
            target_folder = self._ensure_folder(service, self.folder_id, workspace_folder_name)
            published_at = datetime.now().astimezone()
            latest_html = self._upsert_file(
                service,
                parent_id=target_folder["id"],
                name="swan-intelligence-hub-latest.html",
                mime_type="text/html",
                content=html_content.encode("utf-8"),
            )
            latest_md = self._upsert_file(
                service,
                parent_id=target_folder["id"],
                name="swan-intelligence-hub-latest.md",
                mime_type="text/markdown",
                content=markdown_content.encode("utf-8"),
            )
            latest_json = self._upsert_file(
                service,
                parent_id=target_folder["id"],
                name="swan-intelligence-hub-latest.json",
                mime_type="application/json",
                content=json_content.encode("utf-8"),
            )

            google_doc = None
            if create_google_doc:
                google_doc = self._create_google_doc(
                    service,
                    parent_id=target_folder["id"],
                    name=f"{dashboard_title} Brief {published_at.strftime('%Y-%m-%d %H%M %z')}",
                    html_content=html_content,
                )

            return {
                "status": "ready",
                "service_account_email": getattr(credentials, "service_account_email", ""),
                "target_folder": target_folder,
                "published_at": published_at.isoformat(),
                "latest_files": {
                    "html": latest_html,
                    "markdown": latest_md,
                    "json": latest_json,
                },
                "google_doc": google_doc,
            }
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"Google API client libraries are not available: {exc}",
            }
        except Exception as exc:
            message = str(exc)
            if "Service Accounts do not have storage quota" in message:
                return {
                    "status": "storage_quota_blocked",
                    "message": (
                        "Service-account publishing cannot write into a regular My Drive folder. "
                        "Use a Shared Drive or a user OAuth Drive publisher for Workspace output."
                    ),
                    "raw_message": message,
                    "folder_id_configured": bool(self.folder_id),
                }
            return {
                "status": "error",
                "message": message,
                "folder_id_configured": bool(self.folder_id),
            }
