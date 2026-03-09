from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
DEFAULT_GMAIL_AUTH_HOST = "127.0.0.1"
DEFAULT_GMAIL_AUTH_PORT = 8765


def _normalize_redirect_uri(uri: str) -> str:
    return uri if uri.endswith("/") else f"{uri}/"


def _is_loopback_redirect(uri: str) -> bool:
    parsed = urlparse(uri)
    return parsed.hostname in {"127.0.0.1", "localhost"}


def _allow_insecure_oauth_for_loopback(uri: str) -> None:
    if _is_loopback_redirect(uri):
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")


class GmailProbe:
    def __init__(self, client_secret_json: Path | None, token_json: Path | None) -> None:
        self.client_secret_json = client_secret_json
        self.token_json = token_json

    def _load_client_payload(self) -> dict[str, Any]:
        if not self.client_secret_json:
            raise FileNotFoundError("No Gmail OAuth client file path is configured.")
        return json.loads(self.client_secret_json.read_text(encoding="utf-8"))

    def _session_path(self) -> Path | None:
        if not self.token_json:
            return None
        return self.token_json.parent / "gmail-oauth-session.json"

    def _resolve_manual_redirect_uri(self, payload: dict[str, Any]) -> str:
        if "installed" in payload:
            redirect_uris = payload["installed"].get("redirect_uris", [])
            if redirect_uris:
                return redirect_uris[0]
            return "http://localhost"
        if "web" in payload:
            redirect_uris = payload["web"].get("redirect_uris", [])
            loopbacks = [
                _normalize_redirect_uri(uri)
                for uri in redirect_uris
                if _is_loopback_redirect(uri)
            ]
            if loopbacks:
                return loopbacks[0]
        return "http://localhost"

    def probe(self) -> dict[str, Any]:
        if not self.client_secret_json:
            return {
                "status": "not_configured",
                "message": "No Gmail OAuth client file path is configured.",
            }

        if not self.client_secret_json.exists():
            return {
                "status": "missing_client_secret",
                "message": f"Gmail OAuth client file does not exist: {self.client_secret_json}",
            }

        if not self.token_json:
            return {
                "status": "missing_token_path",
                "message": "No Gmail OAuth token file path is configured.",
            }

        if not self.token_json.exists():
            return {
                "status": "missing_token_file",
                "message": f"Gmail token file does not exist: {self.token_json}",
            }

        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"Gmail API client libraries are not available: {exc}",
            }

        try:
            scopes = [GMAIL_READONLY_SCOPE]
            credentials = Credentials.from_authorized_user_file(
                str(self.token_json),
                scopes=scopes,
            )
            if credentials.expired and credentials.refresh_token:
                credentials.refresh(Request())
            service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
            profile = service.users().getProfile(userId="me").execute()
            return {
                "status": "ready",
                "message": "Gmail OAuth token is valid.",
                "email_address": profile.get("emailAddress", ""),
                "messages_total": profile.get("messagesTotal", 0),
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
            }

    def validate_client_config(
        self,
        *,
        host: str = DEFAULT_GMAIL_AUTH_HOST,
        port: int = DEFAULT_GMAIL_AUTH_PORT,
    ) -> dict[str, Any]:
        if not self.client_secret_json:
            return {
                "status": "not_configured",
                "message": "No Gmail OAuth client file path is configured.",
            }

        if not self.client_secret_json.exists():
            return {
                "status": "missing_client_secret",
                "message": f"Gmail OAuth client file does not exist: {self.client_secret_json}",
            }

        try:
            payload = self._load_client_payload()
        except Exception as exc:
            return {
                "status": "invalid_oauth_client",
                "message": f"Could not parse Gmail OAuth client JSON: {exc}",
            }

        expected_redirect_uri = _normalize_redirect_uri(f"http://{host}:{port}")
        if "installed" in payload:
            client = payload["installed"]
            return {
                "status": "ready",
                "client_type": "installed",
                "client_id": client.get("client_id", ""),
                "auth_host": host,
                "auth_port": port,
                "recommended_command": f"python -m mark1_pilot.cli gmail-auth --host {host} --port {port}",
            }

        if "web" in payload:
            client = payload["web"]
            redirect_uris = client.get("redirect_uris", [])
            if not redirect_uris:
                return {
                    "status": "redirect_uri_missing",
                    "client_type": "web",
                    "message": f"OAuth client is a web client without redirect URIs. Create a Desktop app OAuth client or add the exact loopback redirect URI {expected_redirect_uri} and redownload the JSON.",
                    "client_id": client.get("client_id", ""),
                    "expected_redirect_uri": expected_redirect_uri,
                }
            normalized_redirect_uris = [_normalize_redirect_uri(uri) for uri in redirect_uris]
            if expected_redirect_uri not in normalized_redirect_uris:
                loopback_redirects = [
                    uri for uri in normalized_redirect_uris if _is_loopback_redirect(uri)
                ]
                return {
                    "status": "redirect_uri_missing",
                    "client_type": "web",
                    "client_id": client.get("client_id", ""),
                    "message": f"Web OAuth client is present, but it does not contain the exact loopback redirect URI {expected_redirect_uri} required by the local auth flow.",
                    "expected_redirect_uri": expected_redirect_uri,
                    "available_redirect_uris": normalized_redirect_uris,
                    "available_loopback_redirect_uris": loopback_redirects,
                }
            return {
                "status": "ready",
                "client_type": "web",
                "client_id": client.get("client_id", ""),
                "redirect_uris": normalized_redirect_uris,
                "auth_host": host,
                "auth_port": port,
                "recommended_command": f"python -m mark1_pilot.cli gmail-auth --host {host} --port {port}",
            }

        return {
            "status": "invalid_oauth_client",
            "message": "OAuth client JSON must contain either an 'installed' or 'web' client definition.",
        }

    def bootstrap_token(
        self,
        *,
        open_browser: bool = True,
        host: str = DEFAULT_GMAIL_AUTH_HOST,
        port: int = DEFAULT_GMAIL_AUTH_PORT,
    ) -> dict[str, Any]:
        validation = self.validate_client_config(host=host, port=port)
        if validation.get("status") != "ready":
            return validation

        if not self.token_json:
            return {
                "status": "missing_token_path",
                "message": "No Gmail OAuth token file path is configured.",
            }

        try:
            from google_auth_oauthlib.flow import InstalledAppFlow
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"google-auth-oauthlib is not available: {exc}",
            }

        try:
            scopes = [GMAIL_READONLY_SCOPE]
            _allow_insecure_oauth_for_loopback(f"http://{host}:{port}")
            flow = InstalledAppFlow.from_client_secrets_file(
                str(self.client_secret_json),
                scopes=scopes,
            )
            credentials = flow.run_local_server(
                host=host,
                port=port,
                open_browser=open_browser,
            )
            self.token_json.parent.mkdir(parents=True, exist_ok=True)
            self.token_json.write_text(credentials.to_json(), encoding="utf-8")
            return {
                "status": "ready",
                "message": "Gmail OAuth token created.",
                "token_path": str(self.token_json),
                "auth_host": host,
                "auth_port": port,
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
            }

    def start_manual_auth_session(self) -> dict[str, Any]:
        if not self.client_secret_json:
            return {
                "status": "not_configured",
                "message": "No Gmail OAuth client file path is configured.",
            }
        if not self.client_secret_json.exists():
            return {
                "status": "missing_client_secret",
                "message": f"Gmail OAuth client file does not exist: {self.client_secret_json}",
            }
        if not self.token_json:
            return {
                "status": "missing_token_path",
                "message": "No Gmail OAuth token file path is configured.",
            }

        try:
            from google_auth_oauthlib.flow import Flow
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"google-auth-oauthlib is not available: {exc}",
            }

        try:
            payload = self._load_client_payload()
            redirect_uri = self._resolve_manual_redirect_uri(payload)
            _allow_insecure_oauth_for_loopback(redirect_uri)
            flow = Flow.from_client_secrets_file(
                str(self.client_secret_json),
                scopes=[GMAIL_READONLY_SCOPE],
                redirect_uri=redirect_uri,
            )
            auth_url, _ = flow.authorization_url(
                access_type="offline",
                prompt="consent",
                include_granted_scopes="true",
            )
            session_path = self._session_path()
            if not session_path:
                return {
                    "status": "missing_token_path",
                    "message": "No Gmail OAuth token file path is configured.",
                }
            session_path.parent.mkdir(parents=True, exist_ok=True)
            session_path.write_text(
                json.dumps(
                    {
                        "client_secret_json": str(self.client_secret_json),
                        "redirect_uri": redirect_uri,
                        "scopes": [GMAIL_READONLY_SCOPE],
                        "authorization_url": auth_url,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            return {
                "status": "ready",
                "authorization_url": auth_url,
                "redirect_uri": redirect_uri,
                "session_path": str(session_path),
                "next_step": "Open the authorization URL, sign in, then run gmail-auth-finish with the full callback URL from the browser address bar.",
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
            }

    def complete_manual_auth_session(self, callback_url: str) -> dict[str, Any]:
        session_path = self._session_path()
        if not session_path or not session_path.exists():
            return {
                "status": "missing_session",
                "message": "Manual Gmail OAuth session file does not exist. Run gmail-auth-start first.",
            }
        if not self.token_json:
            return {
                "status": "missing_token_path",
                "message": "No Gmail OAuth token file path is configured.",
            }

        try:
            from google_auth_oauthlib.flow import Flow
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"google-auth-oauthlib is not available: {exc}",
            }

        try:
            session = json.loads(session_path.read_text(encoding="utf-8"))
            redirect_uri = session.get("redirect_uri", "")
            _allow_insecure_oauth_for_loopback(redirect_uri)
            _allow_insecure_oauth_for_loopback(callback_url)
            flow = Flow.from_client_secrets_file(
                str(self.client_secret_json),
                scopes=session["scopes"],
                redirect_uri=redirect_uri,
            )
            flow.fetch_token(authorization_response=callback_url)
            credentials = flow.credentials
            self.token_json.parent.mkdir(parents=True, exist_ok=True)
            self.token_json.write_text(credentials.to_json(), encoding="utf-8")
            session_path.unlink(missing_ok=True)
            return {
                "status": "ready",
                "message": "Gmail OAuth token created.",
                "token_path": str(self.token_json),
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
            }

    def search_messages(self, query: str, max_results: int = 10) -> dict[str, Any]:
        if not self.token_json or not self.token_json.exists():
            return {
                "status": "missing_token_file",
                "message": "Gmail OAuth token file does not exist.",
            }

        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
        except ImportError as exc:
            return {
                "status": "dependency_missing",
                "message": f"Gmail API client libraries are not available: {exc}",
            }

        try:
            scopes = [GMAIL_READONLY_SCOPE]
            credentials = Credentials.from_authorized_user_file(
                str(self.token_json),
                scopes=scopes,
            )
            if credentials.expired and credentials.refresh_token:
                credentials.refresh(Request())

            service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
            listing = service.users().messages().list(
                userId="me",
                q=query,
                maxResults=max_results,
            ).execute()
            messages = listing.get("messages", [])
            results: list[dict[str, Any]] = []

            for item in messages:
                message = service.users().messages().get(
                    userId="me",
                    id=item["id"],
                    format="metadata",
                    metadataHeaders=["From", "To", "Subject", "Date"],
                ).execute()
                headers = {
                    header["name"]: header["value"]
                    for header in message.get("payload", {}).get("headers", [])
                }
                results.append(
                    {
                        "id": message.get("id", ""),
                        "thread_id": message.get("threadId", ""),
                        "snippet": message.get("snippet", ""),
                        "from": headers.get("From", ""),
                        "to": headers.get("To", ""),
                        "subject": headers.get("Subject", ""),
                        "date": headers.get("Date", ""),
                    }
                )

            return {
                "status": "ready",
                "query": query,
                "messages": results,
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
                "query": query,
            }

    def build_setup_guide(
        self,
        *,
        host: str = DEFAULT_GMAIL_AUTH_HOST,
        port: int = DEFAULT_GMAIL_AUTH_PORT,
    ) -> str:
        validation = self.validate_client_config(host=host, port=port)
        expected_redirect_uri = _normalize_redirect_uri(f"http://{host}:{port}")
        lines = [
            "# Gmail OAuth Setup Guide",
            "",
            "## What These JSON Files Are",
            "",
            "- The service account JSON is for server-to-server Google API access such as the shared Yangon Tyre Drive folder.",
            "- The Gmail OAuth client JSON is for end-user mailbox access.",
            "- Gmail mailbox access needs both the OAuth client JSON and a token JSON created after you sign in.",
            "",
            "## Current Local Status",
            "",
            f"- Client file: `{self.client_secret_json}`",
            f"- Token file: `{self.token_json}`",
            f"- Validation status: `{validation.get('status', 'unknown')}`",
        ]
        if validation.get("message"):
            lines.append(f"- Validation note: {validation['message']}")
        lines.extend(
            [
                "",
                "## Recommended Setup",
                "",
                "Preferred path:",
                "- In Google Cloud Console, create a new OAuth client of type `Desktop app` in the same project.",
                "- Download the new JSON and replace `.secrets/gmail-oauth-client.json` with that file.",
                f"- Run `python -m mark1_pilot.cli gmail-auth --host {host} --port {port}` from the repo root.",
                "",
                "Alternative path using the existing web client:",
                f"- Edit the existing web OAuth client and add the exact redirect URI `{expected_redirect_uri}`.",
                "- Save the client, download the updated JSON again, and replace `.secrets/gmail-oauth-client.json`.",
                f"- Run `python -m mark1_pilot.cli gmail-auth --host {host} --port {port}` from the repo root.",
                "- If the local server flow is awkward, use `gmail-auth-start` and `gmail-auth-finish` instead.",
                "",
                "## Google Console Checklist",
                "",
                "- Gmail API must be enabled in the same Google Cloud project.",
                "- The OAuth consent screen must exist.",
                "- If the app is in Testing, every Google account you want to use must be added under Google Auth Platform -> Audience -> Test users.",
                "- A `403 access_denied` screen during sign-in usually means the current Google account is not on that test-user list yet.",
                "",
                "## After Auth Works",
                "",
                "- A token file will be created at `.secrets/gmail-oauth-token.json`.",
                "- Then `gmail-preview` can pull Yangon Tyre internal and supplier-related emails using the saved query profiles.",
            ]
        )
        return "\n".join(lines)
