"""Credential-free PostgreSQL transport probe; never starts a database session."""
from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import struct
from urllib.parse import urlsplit


def probe(database_url: str) -> dict:
    result = {"contract": "supermega.postgres-transport.v1", "ok": False,
              "credentials_sent": False, "queries_executed": False, "stage": "configuration"}
    try:
        parsed = urlsplit(database_url)
        if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
            raise ValueError()
        host, port = parsed.hostname, 5432 if parsed.port is None else parsed.port
        if not 1 <= port <= 65535:
            raise ValueError()
    except Exception:
        return {**result, "category": "invalid_configuration"}
    try:
        result["stage"] = "tcp"
        with socket.create_connection((host, port), timeout=5) as connection:
            result["stage"] = "ssl_response"
            connection.sendall(struct.pack("!II", 8, 80877103))
            # Read exactly one byte; never display unauthenticated server text.
            response = connection.recv(1)
            if response != b"S":
                return {**result, "category": "tls_unavailable" if response == b"N" else "invalid_ssl_response"}
            result["stage"] = "tls_handshake"
            # No unverified fallback and no StartupMessage: user/password from
            # the URL are never used. This checks system trust, independently
            # of the application's configured libpq SSL mode or trust store.
            with ssl.create_default_context().wrap_socket(connection, server_hostname=host):
                return {**result, "ok": True, "category": "tls_verified"}
    except ssl.SSLCertVerificationError:
        return {**result, "category": "certificate_not_verified"}
    except TimeoutError:
        return {**result, "category": "timeout"}
    except socket.gaierror:
        return {**result, "category": "dns_failure"}
    except ssl.SSLError:
        return {**result, "category": "tls_failure"}
    except OSError:
        return {**result, "category": "transport_failure"}
    except Exception:
        return {**result, "category": "unexpected_failure"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url-env", required=True,
                        help="Name of the environment variable; never pass the URL itself")
    args = parser.parse_args()
    report = probe(os.environ.get(args.database_url_env, ""))
    print(json.dumps(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
