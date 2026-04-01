from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5-mini"
DEFAULT_TIMEOUT_SECONDS = 12


def _extract_text(payload: dict[str, Any]) -> str:
    output_text = str(payload.get("output_text", "")).strip()
    if output_text:
        return output_text

    parts: list[str] = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") in {"output_text", "text"}:
                text = str(content.get("text", "")).strip()
                if text:
                    parts.append(text)
    return "\n".join(parts).strip()


def _extract_json_block(text: str) -> dict[str, Any] | None:
    raw = str(text or "").strip()
    if not raw:
        return None

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, flags=re.S | re.I)
    candidates = [fenced.group(1)] if fenced else []
    candidates.append(raw)

    brace_match = re.search(r"(\{.*\})", raw, flags=re.S)
    if brace_match:
        candidates.append(brace_match.group(1))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


class OpenAIProvider:
    def __init__(self, *, api_key: str = "", model: str = "") -> None:
        self.api_key = str(api_key or os.getenv("OPENAI_API_KEY", "")).strip()
        self.model = str(model or os.getenv("SUPERMEGA_OPENAI_MODEL", DEFAULT_MODEL)).strip() or DEFAULT_MODEL
        try:
            self.timeout_seconds = max(
                3,
                int(str(os.getenv("SUPERMEGA_OPENAI_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)).strip() or DEFAULT_TIMEOUT_SECONDS),
            )
        except ValueError:
            self.timeout_seconds = DEFAULT_TIMEOUT_SECONDS

    def available(self) -> bool:
        return bool(self.api_key)

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema_name: str = "supermega_payload",
        required_keys: list[str] | None = None,
        max_output_tokens: int = 700,
    ) -> dict[str, Any]:
        if not self.available():
            return {
                "status": "not_configured",
                "message": "OPENAI_API_KEY is not configured.",
            }

        schema_properties = {key: {"type": "string"} for key in (required_keys or [])}
        if "recommended_actions" in schema_properties or "opportunities" in schema_properties:
            schema_properties.pop("recommended_actions", None)
            schema_properties.pop("opportunities", None)
        if required_keys and "recommended_actions" in required_keys:
            schema_properties["recommended_actions"] = {"type": "array", "items": {"type": "string"}}
        if required_keys and "opportunities" in required_keys:
            schema_properties["opportunities"] = {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "outreach_subject": {"type": "string"},
                        "outreach_message": {"type": "string"},
                        "why_now": {"type": "string"},
                    },
                    "required": ["name"],
                    "additionalProperties": True,
                },
            }

        payload = {
            "model": self.model,
            "instructions": str(system_prompt or "").strip(),
            "input": str(user_prompt or "").strip(),
            "max_output_tokens": max_output_tokens,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "schema": {
                        "type": "object",
                        "properties": schema_properties,
                        "required": required_keys or [],
                        "additionalProperties": True,
                    },
                    "strict": False,
                }
            },
        }

        request = Request(
            OPENAI_RESPONSES_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
            parsed = json.loads(raw)
        except HTTPError as exc:
            try:
                error_body = exc.read().decode("utf-8")
            except Exception:
                error_body = str(exc)
            return {
                "status": "error",
                "message": error_body,
            }
        except Exception as exc:
            return {
                "status": "error",
                "message": str(exc),
            }

        text = _extract_text(parsed)
        json_payload = _extract_json_block(text)
        if not isinstance(json_payload, dict):
            return {
                "status": "error",
                "message": "OpenAI response did not contain valid JSON.",
                "text": text,
            }
        return {
            "status": "ready",
            "model": str(parsed.get("model", self.model)),
            "json": json_payload,
            "text": text,
            "raw": parsed,
        }
