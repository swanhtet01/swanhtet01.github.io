"""Independent verifier for the inherited PostgreSQL 17 rehearsal capability.

The Node request is correlation data, never authority.  This module grants an
in-process capability only after Python independently revalidates the canonical
source-controlled policy/profile, the live signed installer observation, both
materialized roots, complete load closure, execution paths, parent process and
fresh one-time session.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import ctypes
import importlib
import json
import os
from pathlib import Path
import re
import stat as stat_module
import subprocess
import sys
from typing import Any, BinaryIO, Callable, MutableSet


CONTRACT = "supermega.postgres17-authority-request.v1"
MATERIALIZATION_CONTRACT = "supermega.postgres17-materialization.v1"
AUTHENTICODE_CONTRACT = "supermega.windows-authenticode-observation.v1"
LOAD_CLOSURE_CONTRACT = "supermega.windows-load-closure.v1"
PROFILE_CONTRACT = "supermega.postgres17-toolchain-provenance.v1"
POLICY_CONTRACT = "supermega.postgres17-publisher-policy.v1"
MAX_REQUEST_BYTES = 32_768
MAX_LIFETIME_SECONDS = 120
REPARSE_POINT = 0x400
CODE_SIGNING_EKU = "1.3.6.1.5.5.7.3.3"


class AuthorityFailure(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthorityGrant:
    authoritative: bool
    independently_verified: bool
    execution_locked: bool
    session_id: str
    nonce: str
    postgres_bin: Path
    openssl: Path
    python: Path
    psycopg: Path
    source_artifact_sha256: str
    execution_bundle_sha256: str
    request_digest: str


def _fail(code: str) -> None:
    raise AuthorityFailure(code)


def _exact_keys(value: Any, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            _fail("database_rehearsal_authority_request_invalid")
        value[key] = item
    return value


def _digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(os.path.abspath(left)) == os.path.normcase(os.path.abspath(right))


def _canonical_absolute(value: Any) -> Path:
    if not isinstance(value, str) or not value:
        _fail("database_rehearsal_authority_path_invalid")
    path = Path(value)
    if not path.is_absolute() or os.path.normpath(value) != value:
        _fail("database_rehearsal_authority_path_invalid")
    return path


def _assert_no_reparse(metadata: os.stat_result) -> None:
    if getattr(metadata, "st_file_attributes", 0) & REPARSE_POINT:
        _fail("database_rehearsal_authority_reparse_point")


def _stable_file(path: Path, *, root: Path | None = None) -> tuple[bytes, os.stat_result]:
    path = _canonical_absolute(str(path))
    before = os.lstat(path)
    _assert_no_reparse(before)
    if not stat_module.S_ISREG(before.st_mode) or before.st_nlink != 1:
        _fail("database_rehearsal_authority_file_invalid")
    resolved = path.resolve(strict=True)
    if not _same_path(path, resolved):
        _fail("database_rehearsal_authority_path_substituted")
    if root is not None:
        resolved_root = root.resolve(strict=True)
        try:
            resolved.relative_to(resolved_root)
        except ValueError:
            _fail("database_rehearsal_authority_path_escape")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        opened_before = os.fstat(descriptor)
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        opened_after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    identity_before = (
        opened_before.st_dev, opened_before.st_ino, opened_before.st_size,
        opened_before.st_mtime_ns, opened_before.st_ctime_ns,
    )
    identity_after = (
        opened_after.st_dev, opened_after.st_ino, opened_after.st_size,
        opened_after.st_mtime_ns, opened_after.st_ctime_ns,
    )
    path_identity = (
        before.st_dev, before.st_ino, before.st_size,
        before.st_mtime_ns, before.st_ctime_ns,
    )
    if path_identity != identity_before or identity_before != identity_after \
            or len(b"".join(chunks)) != opened_after.st_size:
        _fail("database_rehearsal_authority_file_changed")
    return b"".join(chunks), opened_after


def _safe_relative(value: Any) -> str:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        _fail("database_rehearsal_authority_manifest_invalid")
    parts = value.split("/")
    if value.startswith("/") or value.endswith("/") or any(
        part in ("", ".", "..") for part in parts
    ):
        _fail("database_rehearsal_authority_manifest_invalid")
    return value


def _inventory(root: Path) -> dict[str, Any]:
    root = _canonical_absolute(str(root))
    root_metadata = os.lstat(root)
    _assert_no_reparse(root_metadata)
    if not stat_module.S_ISDIR(root_metadata.st_mode) or not _same_path(root, root.resolve(strict=True)):
        _fail("database_rehearsal_authority_root_invalid")
    files: list[dict[str, Any]] = []
    directories: list[str] = []
    folded: set[str] = set()

    def visit(directory: Path, prefix: str = "") -> None:
        with os.scandir(directory) as entries:
            for entry in sorted(entries, key=lambda candidate: candidate.name.casefold()):
                relative = f"{prefix}/{entry.name}" if prefix else entry.name
                _safe_relative(relative)
                identity = relative.casefold()
                if identity in folded:
                    _fail("database_rehearsal_authority_case_collision")
                folded.add(identity)
                metadata = entry.stat(follow_symlinks=False)
                _assert_no_reparse(metadata)
                path = Path(entry.path)
                if entry.is_symlink():
                    _fail("database_rehearsal_authority_reparse_point")
                if stat_module.S_ISDIR(metadata.st_mode):
                    if not _same_path(path, path.resolve(strict=True)):
                        _fail("database_rehearsal_authority_path_substituted")
                    directories.append(relative)
                    visit(path, relative)
                elif stat_module.S_ISREG(metadata.st_mode):
                    payload, observed = _stable_file(path, root=root)
                    files.append({
                        "relativePath": relative,
                        "bytes": observed.st_size,
                        "sha256": _digest(payload),
                    })
                else:
                    _fail("database_rehearsal_authority_special_file")

    visit(root)
    # Keep the insertion order identical to the source-controlled Node
    # materialization verifier.  The digest intentionally binds this exact
    # canonical representation as well as the independently observed tree.
    return {
        "files": sorted(files, key=lambda value: value["relativePath"].encode("utf-8")),
        "directories": sorted(directories, key=lambda value: value.encode("utf-8")),
    }


def read_inherited_request(stream: BinaryIO) -> dict[str, Any]:
    chunks: list[bytes] = []
    total = 0
    try:
        while True:
            chunk = stream.read(min(4096, MAX_REQUEST_BYTES + 1 - total))
            if chunk is None or not isinstance(chunk, bytes):
                _fail("database_rehearsal_authority_partial_read")
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > MAX_REQUEST_BYTES:
                _fail("database_rehearsal_authority_request_too_large")
    except AuthorityFailure:
        raise
    except Exception as exc:
        raise AuthorityFailure("database_rehearsal_authority_partial_read") from exc
    if total == 0:
        _fail("database_rehearsal_authority_missing")
    try:
        value = json.loads(
            b"".join(chunks).decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuthorityFailure("database_rehearsal_authority_request_invalid") from exc
    if not isinstance(value, dict):
        _fail("database_rehearsal_authority_request_invalid")
    return value


def _parse_time(value: Any) -> datetime:
    if not isinstance(value, str):
        _fail("database_rehearsal_authority_request_stale")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AuthorityFailure("database_rehearsal_authority_request_stale") from exc
    if parsed.tzinfo is None:
        _fail("database_rehearsal_authority_request_stale")
    return parsed.astimezone(timezone.utc)


def _valid_review_time(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _json_file(path: Path, *, root: Path | None = None) -> tuple[dict[str, Any], bytes]:
    payload, _ = _stable_file(path, root=root)
    try:
        value = json.loads(
            payload.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuthorityFailure("database_rehearsal_authority_evidence_invalid") from exc
    if not isinstance(value, dict):
        _fail("database_rehearsal_authority_evidence_invalid")
    return value, payload


def _bound_evidence(research_root: Path, relative_path: Any) -> tuple[dict[str, Any], bytes]:
    relative = _safe_relative(relative_path)
    return _json_file(research_root / relative, root=research_root)


def _validate_observation(
    observation: dict[str, Any],
    profile: dict[str, Any],
    policy: dict[str, Any],
) -> None:
    archive = profile.get("archive", {})
    if (
        observation.get("contract") != AUTHENTICODE_CONTRACT
        or observation.get("signatureStatus") != "Valid"
        or observation.get("signatureType") != "Authenticode"
        or observation.get("artifactFileName") != archive.get("fileName")
        or observation.get("artifactBytes") != archive.get("bytes")
        or observation.get("artifactSha256") != archive.get("sha256")
        or not observation.get("timestampCertificateSha256")
        or not observation.get("timestampSubject")
        or CODE_SIGNING_EKU not in observation.get("ekuOids", [])
    ):
        _fail("database_rehearsal_authority_authenticode_invalid")
    approved = any(
        signer.get("certificateSha256") == observation.get("signerCertificateSha256")
        and signer.get("subject") == observation.get("signerSubject")
        and signer.get("issuer") == observation.get("signerIssuer")
        for signer in policy.get("approvedSigners", [])
        if isinstance(signer, dict)
    )
    if not approved:
        _fail("database_rehearsal_authority_signer_unapproved")
    for required_eku in policy.get("requiredEkuOids", []):
        if required_eku not in observation.get("ekuOids", []):
            _fail("database_rehearsal_authority_authenticode_invalid")


def _windows_parent_executable(pid: int) -> Path:
    if os.name != "nt":
        _fail("database_rehearsal_authority_platform_unapproved")
    process = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
    if not process:
        _fail("database_rehearsal_authority_parent_unavailable")
    try:
        size = ctypes.c_ulong(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        if not ctypes.windll.kernel32.QueryFullProcessImageNameW(
            process, 0, buffer, ctypes.byref(size)
        ):
            _fail("database_rehearsal_authority_parent_unavailable")
        return Path(buffer.value).resolve(strict=True)
    finally:
        _close_windows_handle(ctypes.windll.kernel32, process)


def _close_windows_handle(kernel32: Any, handle: Any) -> None:
    if not kernel32.CloseHandle(handle):
        _fail("database_rehearsal_authority_cleanup_failed")


def _observe_windows_authenticode(archive: Path, repository_root: Path) -> dict[str, Any]:
    if os.name != "nt":
        _fail("database_rehearsal_authority_platform_unapproved")
    powershell = Path(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
    script_path = repository_root / "tools" / "inspect_windows_authenticode.ps1"
    script, _ = _stable_file(script_path, root=repository_root)
    completed = subprocess.run(
        [str(powershell), "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"],
        input=script,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
        check=False,
        env={
            "SystemRoot": r"C:\Windows",
            "SUPERMEGA_AUTHENTICODE_TARGET": str(archive),
        },
    )
    if completed.returncode != 0 or not completed.stdout:
        _fail("database_rehearsal_authority_authenticode_inspection_failed")
    try:
        value = json.loads(completed.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuthorityFailure(
            "database_rehearsal_authority_authenticode_inspection_failed"
        ) from exc
    if not isinstance(value, dict):
        _fail("database_rehearsal_authority_authenticode_inspection_failed")
    return value


def verify_inherited_authority(
    request: dict[str, Any],
    *,
    expected_source: dict[str, str],
    repository_root: Path,
    now: datetime | None = None,
    parent_pid: int | None = None,
    parent_executable: Path | None = None,
    authenticode_observer: Callable[[Path, Path], dict[str, Any]] | None = None,
    runtime_python: Path | None = None,
    runtime_psycopg: Path | None = None,
    used_sessions: MutableSet[tuple[str, str]] | None = None,
) -> AuthorityGrant:
    required = {
        "contract", "authoritative", "sessionId", "nonce", "issuedAt", "expiresAt",
        "source", "toolchain", "materialization", "execution", "parent",
    }
    if not _exact_keys(request, required) or request.get("contract") != CONTRACT \
            or request.get("authoritative") is not False:
        _fail("database_rehearsal_authority_request_invalid")
    session = request.get("sessionId")
    nonce = request.get("nonce")
    if not isinstance(session, str) or len(session) != 32 or any(c not in "0123456789abcdef" for c in session) \
            or not isinstance(nonce, str) or len(nonce) != 64 \
            or any(c not in "0123456789abcdef" for c in nonce):
        _fail("database_rehearsal_authority_request_invalid")
    observed_now = now or datetime.now(timezone.utc)
    issued = _parse_time(request.get("issuedAt"))
    expires = _parse_time(request.get("expiresAt"))
    if expires <= issued or (expires - issued).total_seconds() > MAX_LIFETIME_SECONDS \
            or issued > observed_now or expires < observed_now:
        _fail("database_rehearsal_authority_request_stale")
    if request.get("source") != expected_source:
        _fail("database_rehearsal_authority_source_mismatch")
    parent = request.get("parent")
    if not _exact_keys(parent, {"pid", "executablePath", "executableSha256"}):
        _fail("database_rehearsal_authority_parent_mismatch")
    actual_parent_pid = os.getppid() if parent_pid is None else parent_pid
    if parent.get("pid") != actual_parent_pid:
        _fail("database_rehearsal_authority_parent_mismatch")
    observed_parent = parent_executable or _windows_parent_executable(actual_parent_pid)
    claimed_parent = _canonical_absolute(parent.get("executablePath"))
    if not _same_path(observed_parent, claimed_parent):
        _fail("database_rehearsal_authority_parent_mismatch")
    parent_bytes, _ = _stable_file(claimed_parent)
    if _digest(parent_bytes) != parent.get("executableSha256"):
        _fail("database_rehearsal_authority_parent_mismatch")

    repository_root = repository_root.resolve(strict=True)
    research_root = (repository_root / "hq" / "research").resolve(strict=True)
    profile, profile_bytes = _json_file(
        research_root / "postgres17-toolchain-profile.json", root=research_root
    )
    policy, policy_bytes = _json_file(
        research_root / "postgres17-publisher-policy.json", root=research_root
    )
    toolchain = request.get("toolchain")
    required_toolchain = {
        "profileId", "manifestSha256", "policyId", "policySha256",
        "sourceArtifactSha256", "materializationEvidenceSha256",
        "materializationInventorySha256", "loadClosureEvidenceSha256",
        "executionBundleSha256",
    }
    if not _exact_keys(toolchain, required_toolchain) \
            or toolchain.get("manifestSha256") != _digest(profile_bytes) \
            or toolchain.get("policySha256") != _digest(policy_bytes) \
            or toolchain.get("profileId") != profile.get("profileId") \
            or toolchain.get("policyId") != policy.get("policyId"):
        _fail("database_rehearsal_authority_policy_mismatch")
    profile_approval = profile.get("approval", {})
    policy_approval = policy.get("approval", {})
    required_ekus = policy.get("requiredEkuOids", [])
    if profile.get("contract") != PROFILE_CONTRACT \
            or profile.get("platform") != {"os": "windows", "arch": "x64"} \
            or not isinstance(profile.get("postgres", {}).get("version"), str) \
            or not profile.get("postgres", {}).get("version", "").startswith("17.") \
            or profile.get("loadClosureComplete") is not True \
            or profile.get("status") != "reviewed" or profile.get("testOnly") is not False \
            or profile_approval.get("status") != "reviewed" \
            or not profile_approval.get("reviewedBy") \
            or not _valid_review_time(profile_approval.get("reviewedAt")) \
            or policy.get("contract") != POLICY_CONTRACT \
            or policy.get("status") != "reviewed" or policy.get("testOnly") is not False \
            or profile.get("sourceAuthentication", {}).get("policyId") != policy.get("policyId") \
            or profile.get("sourceAuthentication", {}).get("status") != "reviewed" \
            or profile.get("sourceAuthentication", {}).get("method") != "windows-authenticode-v1" \
            or not profile.get("sourceAuthentication", {}).get("reference") \
            or profile.get("materialization", {}).get("status") != "reviewed" \
            or profile.get("materialization", {}).get("method") != "two-pass-reviewed-installer-v1" \
            or profile.get("loadClosure", {}).get("status") != "reviewed" \
            or profile.get("loadClosure", {}).get("captureMethod") != "windows-loaded-module-capture-v1" \
            or policy.get("method") != "windows-authenticode-v1" \
            or policy.get("platform") != {"os": "windows", "arch": "x64"} \
            or policy.get("requiredSignatureType") != "Authenticode" \
            or policy.get("timestampRequired") is not True \
            or not isinstance(required_ekus, list) or CODE_SIGNING_EKU not in required_ekus \
            or policy_approval.get("status") != "reviewed" \
            or not policy_approval.get("reviewedBy") \
            or not _valid_review_time(policy_approval.get("reviewedAt")):
        _fail("database_rehearsal_authority_policy_unapproved")
    approved_signers = policy.get("approvedSigners", [])
    fingerprints = [signer.get("certificateSha256") for signer in approved_signers
        if isinstance(signer, dict)]
    if len(fingerprints) != len(approved_signers) or len(set(fingerprints)) != len(fingerprints):
        _fail("database_rehearsal_authority_policy_unapproved")

    execution = request.get("execution")
    if not _exact_keys(
        execution, {"archivePath", "root", "postgresBin", "openssl", "python", "psycopg"}
    ):
        _fail("database_rehearsal_authority_execution_invalid")
    archive = _canonical_absolute(execution.get("archivePath"))
    archive_bytes, archive_metadata = _stable_file(archive)
    archive_profile = profile.get("archive", {})
    if archive.name != archive_profile.get("fileName") \
            or archive_metadata.st_size != archive_profile.get("bytes") \
            or _digest(archive_bytes) != archive_profile.get("sha256") \
            or toolchain.get("sourceArtifactSha256") != archive_profile.get("sha256"):
        _fail("database_rehearsal_authority_archive_mismatch")

    authentication, authentication_bytes = _bound_evidence(
        research_root, profile.get("sourceAuthentication", {}).get("evidencePath")
    )
    if len(authentication_bytes) != profile.get("sourceAuthentication", {}).get("evidenceBytes") \
            or _digest(authentication_bytes) != profile.get("sourceAuthentication", {}).get("evidenceSha256"):
        _fail("database_rehearsal_authority_authenticode_invalid")
    observer = authenticode_observer or _observe_windows_authenticode
    live_authentication = observer(archive, repository_root)
    if live_authentication != authentication:
        _fail("database_rehearsal_authority_authenticode_changed")
    _validate_observation(authentication, profile, policy)

    materialization_evidence, materialization_bytes = _bound_evidence(
        research_root, profile.get("materialization", {}).get("evidencePath")
    )
    closure, closure_bytes = _bound_evidence(
        research_root, profile.get("loadClosure", {}).get("evidencePath")
    )
    if _digest(materialization_bytes) != toolchain.get("materializationEvidenceSha256") \
            or len(materialization_bytes) != profile.get("materialization", {}).get("evidenceBytes") \
            or _digest(materialization_bytes) != profile.get("materialization", {}).get("evidenceSha256") \
            or len(closure_bytes) != profile.get("loadClosure", {}).get("evidenceBytes") \
            or _digest(closure_bytes) != toolchain.get("loadClosureEvidenceSha256") \
            or _digest(closure_bytes) != profile.get("loadClosure", {}).get("evidenceSha256"):
        _fail("database_rehearsal_authority_evidence_mismatch")
    if materialization_evidence.get("contract") != MATERIALIZATION_CONTRACT \
            or materialization_evidence.get("status") != "reviewed" \
            or materialization_evidence.get("method") != "two-pass-reviewed-installer-v1" \
            or materialization_evidence.get("sourceArtifactSha256") != archive_profile.get("sha256") \
            or materialization_evidence.get("outputRootName") != profile.get("extractedRootName") \
            or materialization_evidence.get("installerArguments", []).count("{destination}") != 1 \
            or materialization_evidence.get("approval", {}).get("status") != "reviewed" \
            or not materialization_evidence.get("approval", {}).get("reviewedBy") \
            or not _valid_review_time(materialization_evidence.get("approval", {}).get("reviewedAt")):
        _fail("database_rehearsal_authority_materialization_invalid")

    evidence_files = materialization_evidence.get("files", [])
    evidence_directories = materialization_evidence.get("directories", [])
    if not isinstance(evidence_files, list) or not all(isinstance(item, dict) for item in evidence_files) \
            or not isinstance(evidence_directories, list) \
            or not all(isinstance(value, str) for value in evidence_directories):
        _fail("database_rehearsal_authority_materialization_invalid")
    expected_inventory = {
        "files": sorted(({
            "relativePath": item.get("relativePath"),
            "bytes": item.get("bytes"),
            "sha256": item.get("sha256"),
        } for item in evidence_files),
            key=lambda item: item.get("relativePath", "").encode("utf-8")),
        "directories": sorted(evidence_directories, key=lambda value: value.encode("utf-8")),
    }
    for directory in expected_inventory["directories"]:
        _safe_relative(directory)
    for item in expected_inventory["files"]:
        if not _exact_keys(item, {"relativePath", "bytes", "sha256"}):
            _fail("database_rehearsal_authority_materialization_invalid")
        _safe_relative(item.get("relativePath"))
        if not isinstance(item.get("bytes"), int) or item["bytes"] < 0 \
                or not isinstance(item.get("sha256"), str) or len(item["sha256"]) != 64:
            _fail("database_rehearsal_authority_materialization_invalid")
    materialization = request.get("materialization")
    if not _exact_keys(materialization, {"firstRoot", "secondRoot"}):
        _fail("database_rehearsal_authority_materialization_invalid")
    first_root = _canonical_absolute(materialization.get("firstRoot"))
    second_root = _canonical_absolute(materialization.get("secondRoot"))
    if _same_path(first_root, second_root) or execution.get("root") != str(first_root) \
            or first_root.name != profile.get("extractedRootName"):
        _fail("database_rehearsal_authority_materialization_invalid")
    first_inventory = _inventory(first_root)
    second_inventory = _inventory(second_root)
    if first_inventory != expected_inventory or second_inventory != expected_inventory \
            or first_inventory != second_inventory:
        _fail("database_rehearsal_authority_materialization_mismatch")
    canonical_inventory = json.dumps(
        expected_inventory, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    if _digest(canonical_inventory) != toolchain.get("materializationInventorySha256"):
        _fail("database_rehearsal_authority_materialization_mismatch")

    bindings = [*profile.get("artifacts", []), *profile.get("dependencies", [])]
    if not all(isinstance(binding, dict) for binding in bindings):
        _fail("database_rehearsal_authority_execution_mismatch")
    relative_paths = [binding.get("relativePath") for binding in bindings]
    binding_hashes = [binding.get("sha256") for binding in bindings]
    if len(set(relative_paths)) != len(relative_paths) \
            or len(set(binding_hashes)) != len(binding_hashes):
        _fail("database_rehearsal_authority_execution_mismatch")
    expected_files = sorted(
        ({
            "relativePath": binding.get("relativePath"),
            "bytes": binding.get("bytes"),
            "sha256": binding.get("sha256"),
        } for binding in bindings),
        key=lambda item: item["relativePath"],
    )
    if closure.get("contract") != LOAD_CLOSURE_CONTRACT \
            or closure.get("status") != "reviewed" \
            or closure.get("captureMethod") != "windows-loaded-module-capture-v1" \
            or closure.get("sourceArtifactSha256") != archive_profile.get("sha256") \
            or closure.get("unexpectedNonSystemModules") != 0 \
            or closure.get("systemModulePolicy") != "windows-system32-os-component-v1" \
            or profile.get("loadClosure", {}).get("systemModulePolicy") != "windows-system32-os-component-v1" \
            or sorted(closure.get("files", []), key=lambda item: item.get("relativePath", "")) != expected_files:
        _fail("database_rehearsal_authority_load_closure_incomplete")
    binding_by_role = {binding.get("role"): binding for binding in bindings}
    required_roles = {
        "postgres", "initdb", "pg_ctl", "pg_isready", "pg_dump", "pg_restore", "psql",
        "libpq", "openssl", "python", "psycopg",
    }
    if set(binding_by_role) != required_roles:
        _fail("database_rehearsal_authority_load_closure_incomplete")
    if len(bindings) != len(required_roles):
        _fail("database_rehearsal_authority_load_closure_incomplete")
    for binding in bindings:
        if binding.get("sourceArtifactSha256") != archive_profile.get("sha256"):
            _fail("database_rehearsal_authority_execution_mismatch")
        if binding.get("role") in {
            "postgres", "initdb", "pg_ctl", "pg_isready", "pg_dump", "pg_restore", "psql"
        }:
            upstream_version = re.sub(r"-[0-9]+$", "", profile["postgres"]["version"])
            if not re.search(rf"(?:^|[^0-9.]){re.escape(upstream_version)}(?:$|[^0-9.])",
                             binding.get("observedVersion", "")):
                _fail("database_rehearsal_authority_version_evidence_mismatch")
        matching_file = next((item for item in expected_inventory["files"]
            if item["relativePath"] == binding.get("relativePath")), None)
        if matching_file != {
            "relativePath": binding.get("relativePath"),
            "bytes": binding.get("bytes"),
            "sha256": binding.get("sha256"),
        }:
            _fail("database_rehearsal_authority_materialization_binding_mismatch")
        version_relative = _safe_relative(binding.get("versionEvidencePath"))
        version_bytes, _ = _stable_file(first_root / version_relative, root=first_root)
        try:
            observed_version = version_bytes.decode("utf-8")
        except UnicodeDecodeError:
            _fail("database_rehearsal_authority_version_evidence_mismatch")
        if len(version_bytes) != binding.get("versionEvidenceBytes") \
                or _digest(version_bytes) != binding.get("versionOutputSha256") \
                or observed_version != binding.get("observedVersion"):
            _fail("database_rehearsal_authority_version_evidence_mismatch")
    execution_paths = {
        role: first_root / binding_by_role[role]["relativePath"] for role in required_roles
    }
    postgres_bin = _canonical_absolute(execution.get("postgresBin"))
    openssl = _canonical_absolute(execution.get("openssl"))
    python = _canonical_absolute(execution.get("python"))
    psycopg = _canonical_absolute(execution.get("psycopg"))
    if not all(_same_path(execution_paths[role].parent, postgres_bin) for role in (
        "postgres", "initdb", "pg_ctl", "pg_isready", "pg_dump", "pg_restore", "psql"
    )) or not _same_path(execution_paths["openssl"], openssl) \
            or not _same_path(execution_paths["python"], python) \
            or not _same_path(execution_paths["psycopg"], psycopg):
        _fail("database_rehearsal_authority_execution_mismatch")
    bundle = [
        {
            "role": binding.get("role"),
            "relativePath": binding.get("relativePath"),
            "bytes": binding.get("bytes"),
            "sha256": binding.get("sha256"),
            "sourceArtifactSha256": binding.get("sourceArtifactSha256"),
            "observedVersion": binding.get("observedVersion"),
            "versionOutputSha256": binding.get("versionOutputSha256"),
        }
        for binding in bindings
    ]
    canonical_bundle = json.dumps(bundle, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if _digest(canonical_bundle) != toolchain.get("executionBundleSha256"):
        _fail("database_rehearsal_authority_execution_mismatch")
    observed_python = Path(sys.executable) if runtime_python is None else runtime_python
    if not _same_path(observed_python.resolve(strict=True), python):
        _fail("database_rehearsal_authority_runtime_mismatch")
    if runtime_psycopg is None:
        try:
            module = importlib.import_module("psycopg")
            module_file = getattr(module, "__file__", None)
            if not isinstance(module_file, str):
                _fail("database_rehearsal_authority_runtime_mismatch")
            observed_psycopg = Path(module_file)
        except AuthorityFailure:
            raise
        except Exception as exc:
            raise AuthorityFailure("database_rehearsal_authority_runtime_mismatch") from exc
    else:
        observed_psycopg = runtime_psycopg
    if not _same_path(observed_psycopg.resolve(strict=True), psycopg):
        _fail("database_rehearsal_authority_runtime_mismatch")
    session_key = (session, nonce)
    if used_sessions is not None:
        if session_key in used_sessions:
            _fail("database_rehearsal_authority_replay")
        used_sessions.add(session_key)
    return AuthorityGrant(
        # Independent provenance verification does not by itself prevent a
        # Windows swap-execute-restore race.  A reviewed immutable execution
        # root or retained OS-handle capability is still required, so the
        # production authority bit deliberately remains false.
        authoritative=False,
        independently_verified=True,
        execution_locked=False,
        session_id=session,
        nonce=nonce,
        postgres_bin=postgres_bin,
        openssl=openssl,
        python=python,
        psycopg=psycopg,
        source_artifact_sha256=archive_profile["sha256"],
        execution_bundle_sha256=toolchain["executionBundleSha256"],
        request_digest=_digest(json.dumps(
            request, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")),
    )


def consume_inherited_authority(
    stream: BinaryIO,
    *,
    expected_source: dict[str, str],
    repository_root: Path,
) -> AuthorityGrant:
    request = read_inherited_request(stream)
    return verify_inherited_authority(
        request,
        expected_source=expected_source,
        repository_root=repository_root,
    )
