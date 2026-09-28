"""Pure host-only correction preparation. No provider calls, writes or authorization."""
from dataclasses import dataclass, field
import re
from urllib.parse import parse_qs, unquote, urlsplit

PROJECT = "zvtzwcimpvvtkowflhda"
TARGET_HOST = "aws-1-us-east-1.pooler.supabase.com"


@dataclass(frozen=True)
class HostCorrection:
    corrected_url: str = field(repr=False)
    project: str = PROJECT
    target_host: str = TARGET_HOST
    production_write_authorized: bool = field(default=False, init=False)


def prepare(database_url: str, *, expected_current_host: str) -> HostCorrection:
    """Return a private in-memory candidate; caller must independently verify authority.

    The expected current host must come from a fresh private provider read. The
    target is the recorded dashboard endpoint and must be revalidated before apply.
    Only the hostname bytes change. Credentials, query, encoding and port survive.
    """
    try:
        if not isinstance(database_url, str) or any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in database_url):
            raise ValueError()
        parsed = urlsplit(database_url)
        query = parse_qs(parsed.query, keep_blank_values=True)
        valid = (
            parsed.scheme in {"postgres", "postgresql"}
            and bool(parsed.password)
            and unquote(parsed.username or "") == f"supermega_trial_login.{PROJECT}"
            and parsed.port == 6543 and parsed.path == "/postgres"
            and not parsed.fragment
            and set(query) <= {"sslmode", "sslrootcert"}
            and len(query.get("sslmode", [])) == 1
            and query["sslmode"][0] in {"require", "verify-ca", "verify-full"}
            and len(query.get("sslrootcert", [])) <= 1
            and all(value.strip() for value in query.get("sslrootcert", ["present"]))
            and isinstance(expected_current_host, str)
            and re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", expected_current_host)
            and parsed.hostname == expected_current_host
            and parsed.hostname != TARGET_HOST
        )
        if not valid:
            raise ValueError()
        # Work on original bytes, not geturl(): preserve URI encoding and query.
        authority_start = database_url.index("://") + 3
        authority_end = database_url.index("/", authority_start)
        authority = database_url[authority_start:authority_end]
        prefix, separator, endpoint = authority.rpartition("@")
        host_text, colon, port_text = endpoint.rpartition(":")
        if not separator or not colon or host_text.lower() != expected_current_host or port_text != "6543":
            raise ValueError()
        start = authority_start + len(prefix) + 1
        candidate = database_url[:start] + TARGET_HOST + database_url[start + len(host_text):]
        return HostCorrection(candidate)
    except Exception:
        # Never include URL, exception text or chained parser exceptions.
        raise ValueError("pooler_host_correction_preconditions_failed") from None
