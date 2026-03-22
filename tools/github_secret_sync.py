from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

import requests

try:
    from nacl import encoding, public
except Exception as exc:  # pragma: no cover - optional runtime dependency
    raise SystemExit(
        "PyNaCl is required for GitHub secret encryption. Install with: "
        "pip install pynacl"
    ) from exc


def _load_secret_value(path: str | None, env_name: str | None) -> str:
    if path:
        value = Path(path).expanduser().read_text(encoding="utf-8")
        return value.strip()
    if env_name:
        value = os.getenv(env_name, "")
        if not value:
            raise ValueError(f"Environment variable is empty: {env_name}")
        return value.strip()
    raise ValueError("Provide either --value-file or --value-env.")


def _encrypt(public_key_b64: str, secret_value: str) -> str:
    public_key = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Set a GitHub Actions repository secret.")
    parser.add_argument("--repo", required=True, help="owner/repo")
    parser.add_argument("--token", required=True, help="GitHub token")
    parser.add_argument("--name", required=True, help="Secret name")
    parser.add_argument("--value-file", default="", help="Path to file containing secret value")
    parser.add_argument("--value-env", default="", help="Env var name containing secret value")
    args = parser.parse_args()

    secret_value = _load_secret_value(
        path=args.value_file or None,
        env_name=args.value_env or None,
    )

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {args.token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "supermega-secret-sync",
    }

    key_url = f"https://api.github.com/repos/{args.repo}/actions/secrets/public-key"
    key_resp = requests.get(key_url, headers=headers, timeout=30)
    if key_resp.status_code != 200:
        print(
            json.dumps(
                {
                    "status": "error",
                    "stage": "public_key",
                    "status_code": key_resp.status_code,
                    "response": key_resp.text[:500],
                },
                indent=2,
            )
        )
        return 1

    key_payload = key_resp.json()
    encrypted_value = _encrypt(key_payload["key"], secret_value)
    put_url = f"https://api.github.com/repos/{args.repo}/actions/secrets/{args.name}"
    put_resp = requests.put(
        put_url,
        headers=headers,
        json={
            "encrypted_value": encrypted_value,
            "key_id": key_payload["key_id"],
        },
        timeout=30,
    )

    ok = put_resp.status_code in {201, 204}
    print(
        json.dumps(
            {
                "status": "ready" if ok else "error",
                "repo": args.repo,
                "secret_name": args.name,
                "status_code": put_resp.status_code,
            },
            indent=2,
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
