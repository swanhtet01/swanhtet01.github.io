from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-sonnet-4-20250514"
DEFAULT_TIMEOUT_SECONDS = 12


def _extract_text(payload: dict[str, Any]) -> str:
    content = payload.get("content", [])
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            parts.append(str(item.get("text", "")).strip())
    return "\n".join(part for part in parts if part).strip()


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


class AnthropicProvider:
    def __init__(self, *, api_key: str = "", model: str = "") -> None:
        self.api_key = str(api_key or os.getenv("ANTHROPIC_API_KEY", "")).strip()
        self.model = str(model or os.getenv("SUPERMEGA_ANTHROPIC_MODEL", DEFAULT_MODEL)).strip() or DEFAULT_MODEL
        try:
            self.timeout_seconds = max(
                3,
                int(str(os.getenv("SUPERMEGA_ANTHROPIC_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)).strip() or DEFAULT_TIMEOUT_SECONDS),
            )
        except ValueError:
            self.timeout_seconds = DEFAULT_TIMEOUT_SECONDS

    def available(self) -> bool:
        return bool(self.api_key)

    def generate_text(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 900,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        if not self.available():
            return {
                "status": "not_configured",
                "message": "ANTHROPIC_API_KEY is not configured.",
            }

        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": str(system_prompt or "").strip(),
            "messages": [
                {
                    "role": "user",
                    "content": str(user_prompt or "").strip(),
                }
            ],
        }
        request = Request(
            ANTHROPIC_MESSAGES_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
            parsed = json.loads(raw)
            return {
                "status": "ready",
                "model": str(parsed.get("model", self.model)),
                "text": _extract_text(parsed),
                "raw": parsed,
            }
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

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 900,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        result = self.generate_text(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if result.get("status") != "ready":
            return result
        parsed = _extract_json_block(str(result.get("text", "")))
        if not isinstance(parsed, dict):
            return {
                "status": "error",
                "message": "Anthropic response did not contain valid JSON.",
                "text": result.get("text", ""),
            }
        return {
            "status": "ready",
            "model": result.get("model", self.model),
            "json": parsed,
            "text": result.get("text", ""),
        }
