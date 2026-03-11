from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any


DRIVE_METADATA_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly"
DRIVE_FULL_SCOPE = "https://www.googleapis.com/auth/drive"
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
DOC_MIME_TYPE = "application/vnd.google-apps.document"
SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet"


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

    def _build_drive_and_sheets_services(self, scopes: list[str]) -> tuple[Any, Any, Any]:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        credentials = service_account.Credentials.from_service_account_file(
            str(self.service_account_json),
            scopes=scopes,
        )
        drive_service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        sheets_service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
        return drive_service, sheets_service, credentials

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

    def list_folder_file_index(self, *, max_items: int = 5000, page_size: int = 200) -> dict[str, Any]:
        base_error = self._validate_base_config()
        if base_error:
            return base_error

        if not self.folder_id:
            return {
                "status": "missing_folder_id",
                "message": "No Google Drive folder ID is configured.",
            }

        max_items = max(1, int(max_items))

        try:
            service, _ = self._build_service([DRIVE_METADATA_SCOPE])
            root = service.files().get(
                fileId=self.folder_id,
                fields="id,name,mimeType,webViewLink,driveId",
                supportsAllDrives=True,
            ).execute()

            files: list[dict[str, Any]] = []
            folders: list[dict[str, Any]] = []
            queue: list[tuple[str, str]] = [(self.folder_id, "")]
            visited: set[str] = set()
            truncated = False

            while queue and not truncated:
                folder_id, folder_path = queue.pop(0)
                if folder_id in visited:
                    continue
                visited.add(folder_id)

                page_token = None
                while True:
                    response = service.files().list(
                        q=f"'{folder_id}' in parents and trashed = false",
                        fields=(
                            "nextPageToken,"
                            "files(id,name,mimeType,modifiedTime,size,md5Checksum,webViewLink,driveId,"
                            "lastModifyingUser(emailAddress,displayName))"
                        ),
                        orderBy="folder,name",
                        pageSize=page_size,
                        pageToken=page_token,
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                    ).execute()

                    for item in response.get("files", []):
                        name = item.get("name", "")
                        path = f"{folder_path}/{name}" if folder_path else name
                        mime_type = item.get("mimeType", "")
                        item_id = item.get("id", "")

                        if mime_type == FOLDER_MIME_TYPE:
                            folders.append(
                                {
                                    "id": item_id,
                                    "name": name,
                                    "path": path,
                                    "mime_type": mime_type,
                                    "modified_time": item.get("modifiedTime", ""),
                                    "web_view_link": item.get("webViewLink", ""),
                                    "drive_id": item.get("driveId", ""),
                                }
                            )
                            if item_id:
                                queue.append((item_id, path))
                            continue

                        files.append(
                            {
                                "id": item_id,
                                "name": name,
                                "path": path,
                                "mime_type": mime_type,
                                "modified_time": item.get("modifiedTime", ""),
                                "size": item.get("size", ""),
                                "md5_checksum": item.get("md5Checksum", ""),
                                "web_view_link": item.get("webViewLink", ""),
                                "drive_id": item.get("driveId", ""),
                                "last_modified_by": item.get("lastModifyingUser", {}).get("emailAddress", ""),
                            }
                        )
                        if len(files) >= max_items:
                            truncated = True
                            break

                    if truncated:
                        break

                    page_token = response.get("nextPageToken")
                    if not page_token:
                        break

            return {
                "status": "ready",
                "generated_at": datetime.now().astimezone().isoformat(),
                "truncated": truncated,
                "max_items": max_items,
                "root": {
                    "id": root.get("id", ""),
                    "name": root.get("name", ""),
                    "mime_type": root.get("mimeType", ""),
                    "web_view_link": root.get("webViewLink", ""),
                    "drive_id": root.get("driveId", ""),
                },
                "folder_count": len(folders),
                "file_count": len(files),
                "folders": folders,
                "files": files,
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

    def _create_spreadsheet(self, service: Any, *, parent_id: str, name: str) -> dict[str, Any]:
        return service.files().create(
            body={
                "name": name,
                "mimeType": SPREADSHEET_MIME_TYPE,
                "parents": [parent_id],
            },
            fields="id,name,mimeType,webViewLink",
            supportsAllDrives=True,
        ).execute()

    def _ensure_spreadsheet_template(
        self,
        *,
        sheets_service: Any,
        spreadsheet_id: str,
        sheet_name: str,
        headers: list[str],
        description: str,
        sample_row: list[str],
    ) -> dict[str, Any]:
        metadata = sheets_service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields="sheets(properties(sheetId,title,index,gridProperties(frozenRowCount)))",
        ).execute()

        sheets = metadata.get("sheets", [])
        sheet_name_lookup = {
            sheet.get("properties", {}).get("title", ""): sheet.get("properties", {}).get("sheetId")
            for sheet in sheets
        }

        requests: list[dict[str, Any]] = []
        input_sheet_id = sheet_name_lookup.get(sheet_name)

        if input_sheet_id is None and sheets:
            first_sheet_id = sheets[0].get("properties", {}).get("sheetId", 0)
            requests.append(
                {
                    "updateSheetProperties": {
                        "properties": {
                            "sheetId": first_sheet_id,
                            "title": sheet_name,
                        },
                        "fields": "title",
                    }
                }
            )
            input_sheet_id = first_sheet_id

        if input_sheet_id is None:
            requests.append({"addSheet": {"properties": {"title": sheet_name}}})

        if description and "Instructions" not in sheet_name_lookup:
            requests.append({"addSheet": {"properties": {"title": "Instructions"}}})

        if requests:
            sheets_service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": requests},
            ).execute()

        metadata = sheets_service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields="sheets(properties(sheetId,title,index,gridProperties(frozenRowCount)))",
        ).execute()
        sheets = metadata.get("sheets", [])
        sheet_name_lookup = {
            sheet.get("properties", {}).get("title", ""): sheet.get("properties", {}).get("sheetId")
            for sheet in sheets
        }
        input_sheet_id = sheet_name_lookup.get(sheet_name)

        if headers:
            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"{sheet_name}!A1",
                valueInputOption="RAW",
                body={"values": [headers]},
            ).execute()

        if input_sheet_id is not None:
            sheets_service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={
                    "requests": [
                        {
                            "updateSheetProperties": {
                                "properties": {
                                    "sheetId": input_sheet_id,
                                    "gridProperties": {"frozenRowCount": 1},
                                },
                                "fields": "gridProperties.frozenRowCount",
                            }
                        }
                    ]
                },
            ).execute()

        if sample_row and headers:
            row_preview = sheets_service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f"{sheet_name}!A2:ZZ2",
            ).execute().get("values", [])
            has_row_data = bool(row_preview and any(str(cell).strip() for cell in row_preview[0]))
            if not has_row_data:
                normalized_sample = list(sample_row[: len(headers)])
                while len(normalized_sample) < len(headers):
                    normalized_sample.append("")
                sheets_service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=f"{sheet_name}!A2",
                    valueInputOption="RAW",
                    body={"values": [normalized_sample]},
                ).execute()

        if description:
            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range="Instructions!A1",
                valueInputOption="RAW",
                body={
                    "values": [
                        ["Template purpose", description],
                        ["How to use", "Fill one row per update. Keep status, owner, and next action current."],
                        ["Data quality", "Do not delete header columns. Add one row per event/update."],
                    ]
                },
            ).execute()

        return {
            "status": "ready",
            "sheet_name": sheet_name,
            "headers": headers,
        }

    def setup_input_center_templates(
        self,
        *,
        workspace_folder_name: str,
        templates: list[dict[str, Any]],
        sheet_name: str = "Input",
    ) -> dict[str, Any]:
        base_error = self._validate_base_config()
        if base_error:
            return base_error

        if not self.folder_id:
            return {
                "status": "missing_folder_id",
                "message": "No Google Drive folder ID is configured for input-center setup.",
            }

        if not templates:
            return {
                "status": "missing_templates",
                "message": "No input-center sheet templates were provided.",
            }

        try:
            service, sheets_service, credentials = self._build_drive_and_sheets_services(
                [DRIVE_FULL_SCOPE, SHEETS_SCOPE]
            )
            target_folder = self._ensure_folder(service, self.folder_id, workspace_folder_name)
            template_outputs: list[dict[str, Any]] = []

            for template in templates:
                key = str(template.get("key", "")).strip()
                title = str(template.get("title", "")).strip() or key
                description = str(template.get("description", "")).strip()
                headers = [str(value).strip() for value in template.get("headers", []) if str(value).strip()]
                sample_row = [str(value) for value in template.get("sample_row", [])]

                if not key:
                    continue

                existing = self._find_child_by_name(
                    service,
                    target_folder["id"],
                    title,
                    SPREADSHEET_MIME_TYPE,
                )
                created = False
                if existing:
                    spreadsheet_file = existing
                else:
                    spreadsheet_file = self._create_spreadsheet(service, parent_id=target_folder["id"], name=title)
                    created = True

                template_status = self._ensure_spreadsheet_template(
                    sheets_service=sheets_service,
                    spreadsheet_id=spreadsheet_file["id"],
                    sheet_name=sheet_name,
                    headers=headers,
                    description=description,
                    sample_row=sample_row,
                )

                template_outputs.append(
                    {
                        "status": template_status.get("status", "unknown"),
                        "key": key,
                        "title": title,
                        "description": description,
                        "headers": headers,
                        "sample_row": sample_row,
                        "sheet_name": template_status.get("sheet_name", sheet_name),
                        "spreadsheet_id": spreadsheet_file.get("id", ""),
                        "web_view_link": spreadsheet_file.get("webViewLink", ""),
                        "created": created,
                    }
                )

            return {
                "status": "ready",
                "generated_at": datetime.now().astimezone().isoformat(),
                "service_account_email": getattr(credentials, "service_account_email", ""),
                "target_folder": target_folder,
                "sheet_name": sheet_name,
                "templates": template_outputs,
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
                "folder_id_configured": bool(self.folder_id),
            }

    def read_input_center_templates(
        self,
        *,
        templates: list[dict[str, Any]],
        default_sheet_name: str = "Input",
        max_rows_per_sheet: int = 200,
    ) -> dict[str, Any]:
        base_error = self._validate_base_config()
        if base_error:
            return base_error

        if not templates:
            return {
                "status": "missing_templates",
                "message": "No input-center templates were provided.",
            }

        try:
            _, sheets_service, credentials = self._build_drive_and_sheets_services(
                [DRIVE_METADATA_SCOPE, SHEETS_SCOPE]
            )
            template_results: list[dict[str, Any]] = []

            row_limit = max(2, max_rows_per_sheet + 1)
            for template in templates:
                spreadsheet_id = str(template.get("spreadsheet_id", "")).strip()
                if not spreadsheet_id:
                    template_results.append(
                        {
                            "status": "missing_spreadsheet_id",
                            "key": template.get("key", ""),
                            "title": template.get("title", ""),
                            "headers": template.get("headers", []),
                            "rows": [],
                            "row_count": 0,
                        }
                    )
                    continue

                sheet_name = str(template.get("sheet_name", "")).strip() or default_sheet_name
                range_name = f"{sheet_name}!A1:ZZ{row_limit}"
                try:
                    values = sheets_service.spreadsheets().values().get(
                        spreadsheetId=spreadsheet_id,
                        range=range_name,
                    ).execute().get("values", [])
                except Exception as exc:
                    template_results.append(
                        {
                            "status": "error",
                            "key": template.get("key", ""),
                            "title": template.get("title", ""),
                            "sheet_name": sheet_name,
                            "spreadsheet_id": spreadsheet_id,
                            "web_view_link": template.get("web_view_link", ""),
                            "message": str(exc),
                            "headers": template.get("headers", []),
                            "rows": [],
                            "row_count": 0,
                        }
                    )
                    continue

                headers = values[0] if values else list(template.get("headers", []))
                normalized_headers = [str(value).strip() for value in headers]
                rows: list[dict[str, Any]] = []

                for index, row in enumerate(values[1:], start=2):
                    row_payload: dict[str, Any] = {}
                    for column_index, header in enumerate(normalized_headers):
                        if not header:
                            continue
                        row_payload[header] = str(row[column_index]).strip() if column_index < len(row) else ""
                    if row_payload and any(value for value in row_payload.values()):
                        row_payload["__row_number"] = index
                        rows.append(row_payload)

                template_results.append(
                    {
                        "status": "ready",
                        "key": template.get("key", ""),
                        "title": template.get("title", ""),
                        "description": template.get("description", ""),
                        "sheet_name": sheet_name,
                        "spreadsheet_id": spreadsheet_id,
                        "web_view_link": template.get("web_view_link", ""),
                        "headers": normalized_headers,
                        "rows": rows,
                        "row_count": len(rows),
                    }
                )

            ready_count = len([item for item in template_results if item.get("status") == "ready"])
            if ready_count == len(template_results):
                status = "ready"
            elif ready_count > 0:
                status = "ready_with_errors"
            else:
                status = "error"

            return {
                "status": status,
                "generated_at": datetime.now().astimezone().isoformat(),
                "service_account_email": getattr(credentials, "service_account_email", ""),
                "template_count": len(template_results),
                "ready_template_count": ready_count,
                "templates": template_results,
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
