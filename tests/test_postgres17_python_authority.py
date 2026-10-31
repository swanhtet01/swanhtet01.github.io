from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import tools.postgres17_python_authority as authority_module

from tools.postgres17_python_authority import (
    AuthorityFailure,
    _close_windows_handle,
    read_inherited_request,
    verify_inherited_authority,
)


def digest(payload: bytes) -> str:
    return sha256(payload).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


class PythonAuthorityFixture:
    roles = (
        "postgres", "initdb", "pg_ctl", "pg_isready", "pg_dump", "pg_restore",
        "psql", "libpq", "openssl", "python", "psycopg",
    )

    def __init__(self) -> None:
        self.folder = Path(tempfile.mkdtemp(prefix="supermega-pg17-python-authority-"))
        self.repository = self.folder / "repository"
        self.research = self.repository / "hq" / "research"
        self.research.mkdir(parents=True)
        self.first_root = self.folder / "first-pass" / "pgsql"
        self.second_root = self.folder / "second-pass" / "pgsql"
        self.archive = self.folder / "postgresql-17.11-5-windows-x64.exe"
        self.parent = self.folder / "node.exe"
        self.archive.write_bytes(b"signed official installer fixture")
        self.parent.write_bytes(b"node parent fixture")
        self.bindings: list[dict[str, object]] = []
        relative_paths = {
            "postgres": "bin/postgres.exe",
            "initdb": "bin/initdb.exe",
            "pg_ctl": "bin/pg_ctl.exe",
            "pg_isready": "bin/pg_isready.exe",
            "pg_dump": "bin/pg_dump.exe",
            "pg_restore": "bin/pg_restore.exe",
            "psql": "bin/psql.exe",
            "libpq": "bin/libpq.dll",
            "openssl": "bin/openssl.exe",
            "python": "python/python.exe",
            "psycopg": "python/site-packages/psycopg/__init__.py",
        }
        for role in self.roles:
            payload = f"binary:{role}\n".encode()
            version = f"{role} synthetic 17.11\n"
            relative_path = relative_paths[role]
            version_path = f"versions/{role}.txt"
            self.bindings.append({
                "role": role,
                "relativePath": relative_path,
                "bytes": len(payload),
                "sha256": digest(payload),
                "sourceArtifactSha256": digest(self.archive.read_bytes()),
                "observedVersion": version,
                "versionEvidencePath": version_path,
                "versionEvidenceBytes": len(version.encode()),
                "versionOutputSha256": digest(version.encode()),
            })
            for root in (self.first_root, self.second_root):
                (root / relative_path).parent.mkdir(parents=True, exist_ok=True)
                (root / relative_path).write_bytes(payload)
                (root / version_path).parent.mkdir(parents=True, exist_ok=True)
                (root / version_path).write_text(version, encoding="utf-8")

        inventory = self._inventory(self.first_root)
        self.observation = {
            "contract": "supermega.windows-authenticode-observation.v1",
            "signatureStatus": "Valid",
            "signatureType": "Authenticode",
            "artifactFileName": self.archive.name,
            "artifactBytes": self.archive.stat().st_size,
            "artifactSha256": digest(self.archive.read_bytes()),
            "signerCertificateSha256": "1" * 64,
            "signerSubject": "CN=Example Database Publisher",
            "signerIssuer": "CN=Example Code Signing CA",
            "timestampCertificateSha256": "2" * 64,
            "timestampSubject": "CN=Example Timestamp",
            "ekuOids": ["1.3.6.1.5.5.7.3.3"],
        }
        self.materialization = {
            "contract": "supermega.postgres17-materialization.v1",
            "status": "reviewed",
            "method": "two-pass-reviewed-installer-v1",
            "sourceArtifactSha256": digest(self.archive.read_bytes()),
            "outputRootName": "pgsql",
            "installerArguments": ["--mode", "unattended", "--prefix", "{destination}"],
            "files": inventory["files"],
            "directories": inventory["directories"],
            "approval": {
                "status": "reviewed",
                "reviewedBy": "synthetic-security-review",
                "reviewedAt": "2026-10-31T00:00:00Z",
            },
        }
        closure_files = [
            {key: binding[key] for key in ("relativePath", "bytes", "sha256")}
            for binding in self.bindings
        ]
        self.closure = {
            "contract": "supermega.windows-load-closure.v1",
            "status": "reviewed",
            "captureMethod": "windows-loaded-module-capture-v1",
            "sourceArtifactSha256": digest(self.archive.read_bytes()),
            "unexpectedNonSystemModules": 0,
            "systemModulePolicy": "windows-system32-os-component-v1",
            "files": closure_files,
        }
        self.policy = {
            "contract": "supermega.postgres17-publisher-policy.v1",
            "policyId": "synthetic-authenticode-policy",
            "status": "reviewed",
            "testOnly": False,
            "method": "windows-authenticode-v1",
            "platform": {"os": "windows", "arch": "x64"},
            "requiredSignatureType": "Authenticode",
            "timestampRequired": True,
            "requiredEkuOids": ["1.3.6.1.5.5.7.3.3"],
            "approvedSigners": [{
                "certificateSha256": self.observation["signerCertificateSha256"],
                "subject": self.observation["signerSubject"],
                "issuer": self.observation["signerIssuer"],
            }],
            "approval": {"status": "reviewed", "reviewedBy": "security", "reviewedAt": "2026-10-31T00:00:00Z"},
        }
        self._write_evidence("authenticode.json", self.observation)
        self._write_evidence("materialization.json", self.materialization)
        self._write_evidence("closure.json", self.closure)
        self._write_evidence("postgres17-publisher-policy.json", self.policy)
        self.profile = {
            "contract": "supermega.postgres17-toolchain-provenance.v1",
            "profileId": "synthetic-windows-pg17",
            "status": "reviewed",
            "testOnly": False,
            "platform": {"os": "windows", "arch": "x64"},
            "postgres": {"version": "17.11-5"},
            "loadClosureComplete": True,
            "extractedRootName": "pgsql",
            "archive": {
                "fileName": self.archive.name,
                "bytes": self.archive.stat().st_size,
                "sha256": digest(self.archive.read_bytes()),
            },
            "sourceAuthentication": {
                "status": "reviewed", "method": "windows-authenticode-v1",
                "reference": "https://www.postgresql.org/download/windows/",
                "policyId": self.policy["policyId"], "evidencePath": "authenticode.json",
                "evidenceBytes": (self.research / "authenticode.json").stat().st_size,
                "evidenceSha256": digest((self.research / "authenticode.json").read_bytes()),
            },
            "materialization": {
                "status": "reviewed", "method": "two-pass-reviewed-installer-v1",
                "evidencePath": "materialization.json",
                "evidenceBytes": (self.research / "materialization.json").stat().st_size,
                "evidenceSha256": digest((self.research / "materialization.json").read_bytes()),
            },
            "loadClosure": {
                "status": "reviewed", "captureMethod": "windows-loaded-module-capture-v1",
                "systemModulePolicy": "windows-system32-os-component-v1",
                "evidencePath": "closure.json",
                "evidenceBytes": (self.research / "closure.json").stat().st_size,
                "evidenceSha256": digest((self.research / "closure.json").read_bytes()),
            },
            "artifacts": self.bindings[:8],
            "dependencies": self.bindings[8:],
            "approval": {
                "status": "reviewed", "reviewedBy": "independent-security",
                "reviewedAt": "2026-10-31T00:00:00Z",
            },
        }
        self._write_evidence("postgres17-toolchain-profile.json", self.profile)
        self.now = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)
        self.source = {
            "head": "a" * 40,
            "tree": "b" * 40,
            "implementationDigest": f"sha256:{'c' * 64}",
        }
        bundle = [
            {key: binding[key] for key in (
                "role", "relativePath", "bytes", "sha256", "sourceArtifactSha256",
                "observedVersion", "versionOutputSha256",
            )}
            for binding in self.bindings
        ]
        self.request = {
            "contract": "supermega.postgres17-authority-request.v1",
            "authoritative": False,
            "sessionId": "d" * 32,
            "nonce": "e" * 64,
            "issuedAt": self.now.isoformat().replace("+00:00", "Z"),
            "expiresAt": (self.now + timedelta(seconds=60)).isoformat().replace("+00:00", "Z"),
            "source": self.source,
            "toolchain": {
                "profileId": self.profile["profileId"],
                "manifestSha256": digest((self.research / "postgres17-toolchain-profile.json").read_bytes()),
                "policyId": self.policy["policyId"],
                "policySha256": digest((self.research / "postgres17-publisher-policy.json").read_bytes()),
                "sourceArtifactSha256": digest(self.archive.read_bytes()),
                "materializationEvidenceSha256": digest((self.research / "materialization.json").read_bytes()),
                "materializationInventorySha256": digest(canonical(inventory)),
                "loadClosureEvidenceSha256": digest((self.research / "closure.json").read_bytes()),
                "executionBundleSha256": digest(canonical(bundle)),
            },
            "materialization": {"firstRoot": str(self.first_root), "secondRoot": str(self.second_root)},
            "execution": {
                "archivePath": str(self.archive), "root": str(self.first_root),
                "postgresBin": str(self.first_root / "bin"),
                "openssl": str(self.first_root / "bin" / "openssl.exe"),
                "python": str(self.first_root / "python" / "python.exe"),
                "psycopg": str(self.first_root / "python" / "site-packages" / "psycopg" / "__init__.py"),
            },
            "parent": {
                "pid": 42, "executablePath": str(self.parent),
                "executableSha256": digest(self.parent.read_bytes()),
            },
        }

    def _write_evidence(self, name: str, value: object) -> None:
        (self.research / name).write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")

    @staticmethod
    def _inventory(root: Path) -> dict[str, object]:
        directories = sorted(str(path.relative_to(root)).replace("\\", "/") for path in root.rglob("*") if path.is_dir())
        files = []
        for path in sorted((path for path in root.rglob("*") if path.is_file()), key=lambda item: str(item.relative_to(root))):
            payload = path.read_bytes()
            files.append({"relativePath": str(path.relative_to(root)).replace("\\", "/"), "bytes": len(payload), "sha256": digest(payload)})
        return {"files": files, "directories": directories}

    def verify(self, request: dict[str, object] | None = None, **overrides: object):
        options = {
            "expected_source": self.source,
            "repository_root": self.repository,
            "now": self.now + timedelta(seconds=1),
            "parent_pid": 42,
            "parent_executable": self.parent,
            "authenticode_observer": lambda _archive, _repository: deepcopy(self.observation),
            "runtime_python": Path(self.request["execution"]["python"]),
            "runtime_psycopg": Path(self.request["execution"]["psycopg"]),
        }
        options.update(overrides)
        return verify_inherited_authority(request or deepcopy(self.request), **options)

    def close(self) -> None:
        shutil.rmtree(self.folder)


class PostgreSQL17PythonAuthorityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = PythonAuthorityFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_verified_pipe_request_grants_only_internal_capability(self) -> None:
        grant = self.fixture.verify()
        self.assertFalse(grant.authoritative)
        self.assertTrue(grant.independently_verified)
        self.assertFalse(grant.execution_locked)
        self.assertFalse(self.fixture.request["authoritative"])
        self.assertEqual(grant.postgres_bin, self.fixture.first_root / "bin")

    def test_policy_profile_parent_and_runtime_substitution_fail_closed(self) -> None:
        mutations = (
            lambda value: value["toolchain"].__setitem__("policySha256", "0" * 64),
            lambda value: value["parent"].__setitem__("pid", 43),
            lambda value: value["execution"].__setitem__("python", str(self.fixture.first_root / "bin" / "postgres.exe")),
        )
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                request = deepcopy(self.fixture.request)
                mutation(request)
                with self.assertRaises(AuthorityFailure):
                    self.fixture.verify(request)

    def test_stale_and_replayed_sessions_fail_closed(self) -> None:
        stale = deepcopy(self.fixture.request)
        stale["expiresAt"] = (self.fixture.now - timedelta(seconds=1)).isoformat().replace("+00:00", "Z")
        with self.assertRaisesRegex(AuthorityFailure, "request_stale"):
            self.fixture.verify(stale)
        sessions: set[tuple[str, str]] = set()
        self.fixture.verify(used_sessions=sessions)
        with self.assertRaisesRegex(AuthorityFailure, "authority_replay"):
            self.fixture.verify(used_sessions=sessions)

    def test_two_root_change_and_partial_closure_fail_closed(self) -> None:
        target = self.fixture.second_root / "bin" / "postgres.exe"
        target.write_bytes(b"substituted")
        with self.assertRaisesRegex(AuthorityFailure, "materialization_mismatch"):
            self.fixture.verify()
        target.write_bytes(b"binary:postgres\n")
        closure = deepcopy(self.fixture.closure)
        closure["files"] = closure["files"][:-1]
        self.fixture._write_evidence("closure.json", closure)
        profile = deepcopy(self.fixture.profile)
        profile["loadClosure"]["evidenceBytes"] = (self.fixture.research / "closure.json").stat().st_size
        profile["loadClosure"]["evidenceSha256"] = digest((self.fixture.research / "closure.json").read_bytes())
        self.fixture._write_evidence("postgres17-toolchain-profile.json", profile)
        request = deepcopy(self.fixture.request)
        request["toolchain"]["manifestSha256"] = digest((self.fixture.research / "postgres17-toolchain-profile.json").read_bytes())
        request["toolchain"]["loadClosureEvidenceSha256"] = profile["loadClosure"]["evidenceSha256"]
        with self.assertRaisesRegex(AuthorityFailure, "load_closure_incomplete"):
            self.fixture.verify(request)

    def test_changed_authenticode_and_archive_fail_closed(self) -> None:
        with self.assertRaisesRegex(AuthorityFailure, "authenticode_changed"):
            self.fixture.verify(authenticode_observer=lambda *_: {**self.fixture.observation, "signatureStatus": "NotSigned"})
        self.fixture.archive.write_bytes(b"changed")
        with self.assertRaisesRegex(AuthorityFailure, "archive_mismatch"):
            self.fixture.verify()

    def test_pipe_parser_rejects_duplicate_trailing_oversized_and_partial_input(self) -> None:
        duplicate = b'{"contract":"a","contract":"b"}'
        with self.assertRaisesRegex(AuthorityFailure, "request_invalid"):
            read_inherited_request(BytesIO(duplicate))
        with self.assertRaisesRegex(AuthorityFailure, "request_invalid"):
            read_inherited_request(BytesIO(b"{}{}"))
        with self.assertRaisesRegex(AuthorityFailure, "request_too_large"):
            read_inherited_request(BytesIO(b"x" * 32769))

        class Partial:
            def read(self, _size: int):
                return None

        with self.assertRaisesRegex(AuthorityFailure, "partial_read"):
            read_inherited_request(Partial())

    def test_environment_like_fields_and_extra_keys_are_never_authority(self) -> None:
        request = deepcopy(self.fixture.request)
        request["SUPERMEGA_POSTGRES17_BIN"] = request["execution"]["postgresBin"]
        with self.assertRaisesRegex(AuthorityFailure, "request_invalid"):
            self.fixture.verify(request)

    def test_failed_windows_handle_cleanup_fails_closed(self) -> None:
        class Kernel32:
            @staticmethod
            def CloseHandle(_handle: object) -> bool:
                return False

        with self.assertRaisesRegex(AuthorityFailure, "cleanup_failed"):
            _close_windows_handle(Kernel32(), object())

    def test_file_identity_change_during_read_fails_closed(self) -> None:
        real_fstat = os.fstat
        calls = 0

        def changed_fstat(descriptor: int):
            nonlocal calls
            observed = real_fstat(descriptor)
            calls += 1
            if calls != 2:
                return observed
            return SimpleNamespace(
                st_dev=observed.st_dev,
                st_ino=observed.st_ino,
                st_size=observed.st_size,
                st_mtime_ns=observed.st_mtime_ns + 1,
                st_ctime_ns=observed.st_ctime_ns,
            )

        with patch.object(authority_module.os, "fstat", side_effect=changed_fstat), \
                self.assertRaisesRegex(AuthorityFailure, "file_changed"):
            self.fixture.verify()

    def test_unsupported_profile_and_policy_contracts_fail_closed(self) -> None:
        for target in ("profile", "policy"):
            fixture = PythonAuthorityFixture()
            try:
                request = deepcopy(fixture.request)
                if target == "profile":
                    fixture.profile["contract"] = "unreviewed.profile.v0"
                    fixture._write_evidence("postgres17-toolchain-profile.json", fixture.profile)
                    request["toolchain"]["manifestSha256"] = digest(
                        (fixture.research / "postgres17-toolchain-profile.json").read_bytes()
                    )
                else:
                    fixture.policy["timestampRequired"] = False
                    fixture._write_evidence("postgres17-publisher-policy.json", fixture.policy)
                    request["toolchain"]["policySha256"] = digest(
                        (fixture.research / "postgres17-publisher-policy.json").read_bytes()
                    )
                with self.assertRaisesRegex(AuthorityFailure, "policy_unapproved"):
                    fixture.verify(request)
            finally:
                fixture.close()

    def test_load_closure_system_policy_evidence_is_mandatory(self) -> None:
        closure = deepcopy(self.fixture.closure)
        closure.pop("systemModulePolicy")
        self.fixture._write_evidence("closure.json", closure)
        profile = deepcopy(self.fixture.profile)
        closure_bytes = (self.fixture.research / "closure.json").read_bytes()
        profile["loadClosure"]["evidenceBytes"] = len(closure_bytes)
        profile["loadClosure"]["evidenceSha256"] = digest(closure_bytes)
        self.fixture._write_evidence("postgres17-toolchain-profile.json", profile)
        request = deepcopy(self.fixture.request)
        request["toolchain"]["manifestSha256"] = digest(
            (self.fixture.research / "postgres17-toolchain-profile.json").read_bytes()
        )
        request["toolchain"]["loadClosureEvidenceSha256"] = digest(closure_bytes)
        with self.assertRaisesRegex(AuthorityFailure, "load_closure_incomplete"):
            self.fixture.verify(request)

    def test_dot_segment_path_is_not_canonical_authority(self) -> None:
        request = deepcopy(self.fixture.request)
        request["parent"]["executablePath"] = str(self.fixture.folder / "x" / ".." / "node.exe")
        with self.assertRaisesRegex(AuthorityFailure, "path_invalid"):
            self.fixture.verify(request)


if __name__ == "__main__":
    unittest.main()
