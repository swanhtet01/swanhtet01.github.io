from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path

EXPECTED_OWNER_CONFIRMATION = "I APPROVE SUPERMEGA GITHUB SECRET WRITE"
ALLOWED_TOKEN_ENVS = frozenset({"GITHUB_TOKEN", "GH_TOKEN"})
CONTRACT = "supermega.github-secret-sync.quarantine.v1"
WRITE_CONFIRMED_PERFORMED = "confirmed_performed"
WRITE_CONFIRMED_NOT_PERFORMED = "confirmed_not_performed"
WRITE_OUTCOME_UNKNOWN = "outcome_unknown"


def _load_secret_value(path: str | None, env_name: str | None) -> str:
    if path:
        value_path = Path(path)
        if not value_path.is_file():
            raise ValueError(f"Secret value file not found: {path}")
        value = value_path.read_text(encoding="utf-8").strip()
        if not value:
            raise ValueError(f"Secret value file is empty: {path}")
        return value
    if env_name:
        value = os.getenv(env_name, "")
        if not value:
            raise ValueError(f"Environment variable is empty: {env_name}")
        return value.strip()
    raise ValueError("Provide either --value-file or --value-env.")


def _load_token(token_env: str | None, token_arg: str | None) -> str:
    if token_arg:
        raise ValueError("Refusing --token. Set GITHUB_TOKEN or GH_TOKEN and pass --token-env instead.")
    if not token_env:
        raise ValueError("Provide --token-env explicitly as GITHUB_TOKEN or GH_TOKEN.")
    if token_env not in ALLOWED_TOKEN_ENVS:
        raise ValueError("Unsupported --token-env. Allowed values: GITHUB_TOKEN, GH_TOKEN.")
    token = os.getenv(token_env, "").strip()
    if not token:
        raise ValueError(f"Token environment variable is empty: {token_env}")
    return token


def _encrypt(public_key_b64: str, secret_value: str) -> str:
    try:
        from nacl import encoding, public
    except Exception as exc:  # pragma: no cover - optional runtime dependency
        raise RuntimeError(
            "PyNaCl is required for GitHub secret encryption. Install with: "
            "pip install pynacl"
        ) from exc

    public_key = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")


def _emit(payload: dict) -> None:
    print(
        json.dumps(
            {
                "contract": CONTRACT,
                "secret_values_exposed": False,
                **payload,
            },
            indent=2,
        )
    )


def _external_write_controls(*, attempted: bool, outcome: str) -> dict:
    performed_by_outcome = {
        WRITE_CONFIRMED_PERFORMED: True,
        WRITE_CONFIRMED_NOT_PERFORMED: False,
        WRITE_OUTCOME_UNKNOWN: None,
    }
    if outcome not in performed_by_outcome:
        raise ValueError("GitHub secret write outcome is invalid.")
    if outcome == WRITE_CONFIRMED_PERFORMED and not attempted:
        raise ValueError("A confirmed GitHub secret write must have been attempted.")
    if outcome == WRITE_OUTCOME_UNKNOWN and not attempted:
        raise ValueError("An unknown GitHub secret write outcome must have been attempted.")
    return {
        "external_write_attempted": attempted,
        "external_writes_performed": performed_by_outcome[outcome],
        "external_write_outcome": outcome,
        "external_write_retry_allowed": False,
    }


def _assert_external_write_approval(allow_external_write: bool, owner_confirmation: str) -> None:
    if not allow_external_write or owner_confirmation != EXPECTED_OWNER_CONFIRMATION:
        raise ValueError(
            "Quarantined legacy GitHub secret sync. Re-run only with "
            f"--allow-external-write and --owner-confirmation \"{EXPECTED_OWNER_CONFIRMATION}\" "
            "after explicit owner approval."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Set a GitHub Actions repository secret.")
    parser.add_argument("--repo", required=True, help="owner/repo")
    parser.add_argument("--token", default="", help=argparse.SUPPRESS)
    parser.add_argument("--token-env", default="", help="Environment variable holding the GitHub token: GITHUB_TOKEN or GH_TOKEN")
    parser.add_argument("--name", required=True, help="Secret name")
    parser.add_argument("--value-file", default="", help="Path to file containing secret value")
    parser.add_argument("--value-env", default="", help="Env var name containing secret value")
    parser.add_argument("--allow-external-write", action="store_true", help="Owner-gated opt-in for the provider write")
    parser.add_argument("--owner-confirmation", default="", help="Exact typed owner approval phrase")
    parser.add_argument("--plan", action="store_true", help="Report the required gate without loading secret material or writing")
    args = parser.parse_args()

    if args.token:
        _emit(
            {
                "status": "error",
                "repo": args.repo,
                "secret_name": args.name,
                "error": "Refusing --token. Set GITHUB_TOKEN or GH_TOKEN and pass --token-env instead.",
                **_external_write_controls(
                    attempted=False,
                    outcome=WRITE_CONFIRMED_NOT_PERFORMED,
                ),
            }
        )
        return 1

    if args.plan:
        _emit(
            {
                "status": "planned",
                "repo": args.repo,
                "secret_name": args.name,
                "owner_gate_required": True,
                **_external_write_controls(
                    attempted=False,
                    outcome=WRITE_CONFIRMED_NOT_PERFORMED,
                ),
            }
        )
        return 0

    secret_material_loaded = False
    external_write_attempted = False
    failure_stage = "approval"
    try:
        _assert_external_write_approval(args.allow_external_write, args.owner_confirmation)
        failure_stage = "token"
        token = _load_token(args.token_env or None, args.token or None)
        failure_stage = "secret_value"
        secret_value_loaded = _load_secret_value(
            path=args.value_file or None,
            env_name=args.value_env or None,
        )
        secret_material_loaded = True

        failure_stage = "requests_import"
        import requests

        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "supermega-secret-sync",
        }

        key_url = f"https://api.github.com/repos/{args.repo}/actions/secrets/public-key"
        failure_stage = "public_key_request"
        key_resp = requests.get(key_url, headers=headers, timeout=30)
        if key_resp.status_code != 200:
            _emit(
                {
                    "status": "error",
                    "stage": "public_key",
                    "repo": args.repo,
                    "secret_name": args.name,
                    "status_code": key_resp.status_code,
                    **_external_write_controls(
                        attempted=False,
                        outcome=WRITE_CONFIRMED_NOT_PERFORMED,
                    ),
                }
            )
            return 1

        failure_stage = "public_key_response"
        key_payload = key_resp.json()
        failure_stage = "encryption"
        encrypted_value = _encrypt(key_payload["key"], secret_value_loaded)
        put_url = f"https://api.github.com/repos/{args.repo}/actions/secrets/{args.name}"
        external_write_attempted = True
        failure_stage = "secret_put"
        put_resp = requests.put(
            put_url,
            headers=headers,
            json={
                "encrypted_value": encrypted_value,
                "key_id": key_payload["key_id"],
            },
            timeout=30,
        )

        failure_stage = "secret_put_response"
        status_code = put_resp.status_code
        ok = status_code in {201, 204}
        if ok:
            outcome = WRITE_CONFIRMED_PERFORMED
        elif 400 <= status_code < 500:
            outcome = WRITE_CONFIRMED_NOT_PERFORMED
        else:
            outcome = WRITE_OUTCOME_UNKNOWN
        _emit(
            {
                "status": "ready" if ok else "error",
                "repo": args.repo,
                "secret_name": args.name,
                "status_code": status_code,
                **_external_write_controls(
                    attempted=True,
                    outcome=outcome,
                ),
            }
        )
        return 0 if ok else 1
    except Exception as exc:
        if external_write_attempted:
            error = "github_secret_sync_put_outcome_unknown"
            outcome = WRITE_OUTCOME_UNKNOWN
        elif secret_material_loaded:
            error = f"github_secret_sync_{failure_stage}_failed"
            outcome = WRITE_CONFIRMED_NOT_PERFORMED
        else:
            error = str(exc)[:240]
            outcome = WRITE_CONFIRMED_NOT_PERFORMED
        _emit(
            {
                "status": "error",
                "stage": failure_stage,
                "repo": args.repo,
                "secret_name": args.name,
                "error": error,
                **_external_write_controls(
                    attempted=external_write_attempted,
                    outcome=outcome,
                ),
            }
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
