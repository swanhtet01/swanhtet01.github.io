"""Fail-closed contract for immutable Windows PostgreSQL rehearsal execution.

Windows CreateProcess accepts an image path, not an already verified image
handle.  The safe source contract therefore requires a separately authenticated
broker to stage exact bytes, seal the DACL, retain reparse-safe read handles
that deny write/delete sharing, and create the child suspended in a
non-breakaway kill-on-close job.  This module validates and orchestrates that
contract through an injected adapter.  No production adapter is supplied until
the behavior is exercised and reviewed on an authorized Windows host.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
import json
import os
from typing import Any, Iterable, Protocol


CONTRACT = "supermega.postgres17-windows-execution-lock.v1"
POLICY_CONTRACT = "supermega.postgres17-windows-execution-lock-policy.v1"
METHOD = "signed-broker-held-handles-v1"
SYSTEM_MODULE_POLICY = "windows-system32-os-component-v1"
SHA256_LENGTH = 64
REQUIRED_OPEN_FLAGS = (
    "FILE_FLAG_OPEN_REPARSE_POINT",
    "FILE_FLAG_BACKUP_SEMANTICS",
)
FORBIDDEN_ACCESS = ("write", "append", "delete", "writeDac", "writeOwner")


class ExecutionLockFailure(RuntimeError):
    pass


def _fail(code: str) -> None:
    raise ExecutionLockFailure(code)


def _exact_keys(value: Any, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def _hex(value: Any, length: int) -> bool:
    return isinstance(value, str) and len(value) == length \
        and all(character in "0123456789abcdef" for character in value)


def _absolute_canonical(value: Any) -> str:
    if not isinstance(value, str) or not value or not os.path.isabs(value) \
            or os.path.normpath(value) != value:
        _fail("database_rehearsal_execution_lock_path_invalid")
    return value


def _relative(value: Any) -> str:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value \
            or value.startswith("/") or value.endswith("/") \
            or any(part in ("", ".", "..") for part in value.split("/")):
        _fail("database_rehearsal_execution_lock_path_invalid")
    return value


def _digest(value: Any) -> str:
    return sha256(json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    ).encode("utf-8")).hexdigest()


def inspect_execution_lock_policy(policy: dict[str, Any]) -> dict[str, Any]:
    required = {
        "contract", "policyId", "status", "testOnly", "method", "platform",
        "broker", "staging", "handles", "job", "approval", "blockers",
    }
    if not _exact_keys(policy, required) \
            or policy.get("contract") != POLICY_CONTRACT \
            or not isinstance(policy.get("policyId"), str) \
            or policy.get("method") != METHOD \
            or policy.get("platform") != {"os": "windows", "arch": "x64"} \
            or not isinstance(policy.get("blockers"), list):
        _fail("database_rehearsal_execution_lock_policy_invalid")
    broker = policy.get("broker")
    staging = policy.get("staging")
    handles = policy.get("handles")
    job = policy.get("job")
    approval = policy.get("approval")
    if not _exact_keys(broker, {
        "fileName", "sha256", "signerCertificateSha256", "protocolVersion",
    }) or not _exact_keys(staging, {
        "sameVolumeRequired", "protectedDaclRequired", "ownerSid",
        "daclSha256", "denyCurrentTokenMutation", "singleDataStreamOnly",
    }) or not _exact_keys(handles, {
        "shareMode", "openFlags", "nonInheritableByDefault",
        "explicitChildHandleListOnly", "temporaryInheritabilityUnderSpawnLock",
        "clearAndCloseBeforeVerification",
    }) or not _exact_keys(job, {
        "killOnClose", "breakawayAllowed", "silentBreakawayAllowed",
        "createSuspended", "assignBeforeResume", "completionPortRequired",
    }) or not _exact_keys(approval, {"status", "reviewedBy", "reviewedAt"}):
        _fail("database_rehearsal_execution_lock_policy_invalid")
    blockers: list[str] = []
    if policy.get("status") != "reviewed" or policy.get("testOnly") is not False:
        blockers.append("execution_lock_policy_not_reviewed")
    if not broker.get("fileName") or not _hex(broker.get("sha256"), 64) \
            or not _hex(broker.get("signerCertificateSha256"), 64) \
            or broker.get("protocolVersion") != 1:
        blockers.append("execution_lock_broker_unapproved")
    if staging != {
        "sameVolumeRequired": True,
        "protectedDaclRequired": True,
        "ownerSid": staging.get("ownerSid"),
        "daclSha256": staging.get("daclSha256"),
        "denyCurrentTokenMutation": True,
        "singleDataStreamOnly": True,
    } or not staging.get("ownerSid") or not _hex(staging.get("daclSha256"), 64):
        blockers.append("execution_lock_staging_policy_incomplete")
    if handles != {
        "shareMode": "FILE_SHARE_READ",
        "openFlags": list(REQUIRED_OPEN_FLAGS),
        "nonInheritableByDefault": True,
        "explicitChildHandleListOnly": True,
        "temporaryInheritabilityUnderSpawnLock": True,
        "clearAndCloseBeforeVerification": True,
    }:
        blockers.append("execution_lock_handle_policy_incomplete")
    if job != {
        "killOnClose": True,
        "breakawayAllowed": False,
        "silentBreakawayAllowed": False,
        "createSuspended": True,
        "assignBeforeResume": True,
        "completionPortRequired": True,
    }:
        blockers.append("execution_lock_job_policy_incomplete")
    if approval.get("status") != "reviewed" or not approval.get("reviewedBy") \
            or not isinstance(approval.get("reviewedAt"), str):
        blockers.append("execution_lock_approval_missing")
    else:
        try:
            parsed = datetime.fromisoformat(approval["reviewedAt"].replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                blockers.append("execution_lock_approval_missing")
        except ValueError:
            blockers.append("execution_lock_approval_missing")
    return {
        "contract": POLICY_CONTRACT,
        "policyId": policy["policyId"],
        "ready": not blockers,
        "blockers": blockers,
    }


@dataclass(frozen=True)
class ExecutionLockCapability:
    session_id: str
    policy_id: str
    staging_root: str
    volume_serial: str
    broker_process_id: int
    child_process_id: int
    snapshot_digest: str
    source_contract_verified: bool
    execution_locked: bool
    windows_validated: bool


class WindowsExecutionLockAdapter(Protocol):
    windows_validated: bool

    def create_acl_locked_stage(self, session_id: str, policy: dict[str, Any]) -> str: ...
    def copy_exact_files(self, stage: str, expected_files: list[dict[str, Any]]) -> None: ...
    def open_retained_handles(self, stage: str, expected_files: list[dict[str, Any]]) -> None: ...
    def create_containment_job(self, session_id: str) -> None: ...
    def launch_child_suspended(
        self, stage: str, explicit_handles: tuple[dict[str, str], ...],
    ) -> None: ...
    def clear_and_close_parent_inheritable_handles(self) -> None: ...
    def assign_child_before_resume(self) -> None: ...
    def resume_child(self) -> None: ...
    def wait_for_contained_exit(self) -> None: ...
    def observe_snapshot(self, phase: str) -> dict[str, Any]: ...
    def close_and_cleanup(self) -> bool: ...
    def recover_orphan(self, session_id: str) -> dict[str, Any]: ...


def _expected_file_map(expected_files: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    folded_paths: set[str] = set()
    for item in expected_files:
        if not _exact_keys(item, {"role", "relativePath", "bytes", "sha256"}) \
                or not isinstance(item.get("role"), str) or not item["role"] \
                or not isinstance(item.get("bytes"), int) or item["bytes"] < 0 \
                or not _hex(item.get("sha256"), SHA256_LENGTH):
            _fail("database_rehearsal_execution_lock_inventory_invalid")
        relative = _relative(item["relativePath"])
        folded = relative.casefold()
        if relative in result or folded in folded_paths:
            _fail("database_rehearsal_execution_lock_inventory_duplicate")
        result[relative] = dict(item)
        folded_paths.add(folded)
    if not result:
        _fail("database_rehearsal_execution_lock_inventory_invalid")
    return result


def verify_execution_lock_snapshot(
    snapshot: dict[str, Any],
    *,
    policy: dict[str, Any],
    expected_files: list[dict[str, Any]],
    expected_session: str,
    expected_phase: str,
    expected_requestor_sid: str,
    expected_broker_image: dict[str, str],
    expected_explicit_handles: tuple[dict[str, str], ...],
    prior_snapshot: dict[str, Any] | None = None,
) -> ExecutionLockCapability:
    # expected_requestor_sid and expected_broker_image must come from the
    # independently authenticated launcher/token inspection, never from the
    # snapshot under review.  The production adapter remains unavailable.
    inspection = inspect_execution_lock_policy(policy)
    if not inspection["ready"]:
        _fail("database_rehearsal_execution_lock_policy_unapproved")
    required = {
        "contract", "authoritative", "phase", "sessionId", "stagingRoot",
        "volumeSerial", "rootFileId", "rootReparseTag", "rootOpenFlags",
        "rootHandleRetained", "ownerSid", "requestorSid", "daclSha256",
        "aclProtected", "effectiveAccess", "broker", "job", "childLaunch",
        "handles", "cleanup",
    }
    if not _exact_keys(snapshot, required) or snapshot.get("contract") != CONTRACT \
            or snapshot.get("authoritative") is not False \
            or snapshot.get("phase") != expected_phase \
            or expected_phase not in ("prepared", "initial", "final") \
            or snapshot.get("sessionId") != expected_session \
            or not _hex(expected_session, 32):
        _fail("database_rehearsal_execution_lock_snapshot_invalid")
    root = _absolute_canonical(snapshot.get("stagingRoot"))
    if not _hex(snapshot.get("volumeSerial"), 16) or not _hex(snapshot.get("rootFileId"), 32) \
            or snapshot.get("rootReparseTag") != 0 \
            or snapshot.get("rootOpenFlags") != list(REQUIRED_OPEN_FLAGS) \
            or snapshot.get("rootHandleRetained") is not True \
            or snapshot.get("ownerSid") != policy["staging"]["ownerSid"] \
            or snapshot.get("requestorSid") != expected_requestor_sid \
            or not expected_requestor_sid \
            or snapshot["requestorSid"] == snapshot["ownerSid"] \
            or snapshot.get("daclSha256") != policy["staging"]["daclSha256"] \
            or snapshot.get("aclProtected") is not True:
        _fail("database_rehearsal_execution_lock_root_identity_mismatch")
    access = snapshot.get("effectiveAccess")
    if not _exact_keys(access, {"read", "execute", *FORBIDDEN_ACCESS}) \
            or access.get("read") is not True or access.get("execute") is not True \
            or any(access.get(name) is not False for name in FORBIDDEN_ACCESS):
        _fail("database_rehearsal_execution_lock_dacl_mutable")
    broker = snapshot.get("broker")
    expected_broker = policy["broker"]
    if not _exact_keys(expected_broker_image, {
        "absolutePath", "volumeSerial", "fileId", "sha256",
        "signerCertificateSha256",
    }) or not _absolute_canonical(expected_broker_image.get("absolutePath")) \
            or not _hex(expected_broker_image.get("volumeSerial"), 16) \
            or not _hex(expected_broker_image.get("fileId"), 32) \
            or expected_broker_image.get("sha256") != expected_broker["sha256"] \
            or expected_broker_image.get("signerCertificateSha256") \
            != expected_broker["signerCertificateSha256"]:
        _fail("database_rehearsal_execution_lock_broker_identity_invalid")
    if not _exact_keys(broker, {
        "processId", "parentProcessId", "fileName", "sha256",
        "signerCertificateSha256", "authenticodeValid", "protocolVersion",
        "imagePath", "imageVolumeSerial", "imageFileId",
    }) or broker.get("fileName") != expected_broker["fileName"] \
            or broker.get("sha256") != expected_broker["sha256"] \
            or broker.get("signerCertificateSha256") != expected_broker["signerCertificateSha256"] \
            or broker.get("authenticodeValid") is not True \
            or broker.get("protocolVersion") != 1 \
            or broker.get("imagePath") != expected_broker_image["absolutePath"] \
            or broker.get("imageVolumeSerial") != expected_broker_image["volumeSerial"] \
            or broker.get("imageFileId") != expected_broker_image["fileId"] \
            or not isinstance(broker.get("processId"), int) or broker["processId"] <= 0 \
            or not isinstance(broker.get("parentProcessId"), int) \
            or broker["parentProcessId"] <= 0:
        _fail("database_rehearsal_execution_lock_broker_invalid")
    job = snapshot.get("job")
    if not _exact_keys(job, {
        "jobId", "killOnClose", "breakawayAllowed", "silentBreakawayAllowed",
        "completionPortBound", "childAssigned", "activeProcessIds",
        "allProcessesExited", "completionMessagesDrained",
    }) or job.get("killOnClose") is not True \
            or job.get("breakawayAllowed") is not False \
            or job.get("silentBreakawayAllowed") is not False \
            or job.get("completionPortBound") is not True \
            or job.get("childAssigned") is not True:
        _fail("database_rehearsal_execution_lock_child_escape")
    launch = snapshot.get("childLaunch")
    if not _exact_keys(launch, {
        "processId", "createdSuspended", "assignedBeforeResume", "resumed",
        "startupInfoEx", "explicitHandleList", "unrelatedInheritedHandles",
        "imageVolumeSerial", "imageFileId", "bInheritHandles",
        "brokerSpawnLockHeld", "concurrentSpawnCount",
    }) or launch.get("createdSuspended") is not True \
            or launch.get("assignedBeforeResume") is not True \
            or launch.get("resumed") is not (expected_phase != "prepared") \
            or launch.get("startupInfoEx") is not True \
            or launch.get("bInheritHandles") is not True \
            or launch.get("brokerSpawnLockHeld") is not True \
            or launch.get("concurrentSpawnCount") != 0 \
            or launch.get("unrelatedInheritedHandles") != 0 \
            or not expected_explicit_handles \
            or not isinstance(launch.get("explicitHandleList"), list):
        _fail("database_rehearsal_execution_lock_handle_inheritance_invalid")
    if len(launch["explicitHandleList"]) != len(expected_explicit_handles):
        _fail("database_rehearsal_execution_lock_handle_inheritance_invalid")
    inherited_values: set[str] = set()
    for observed, expected_handle in zip(
            launch["explicitHandleList"], expected_explicit_handles, strict=True):
        if not _exact_keys(expected_handle, {
            "kind", "access", "direction", "securityDescriptorSha256",
        }) or not _hex(expected_handle.get("securityDescriptorSha256"), 64) \
                or not _exact_keys(observed, {
                    "handleValue", "kind", "access", "direction",
                    "securityDescriptorSha256",
                    "targetProcessId", "sourceWasTemporarilyInheritable",
                    "sourceInheritabilityCleared", "parentHandleClosed",
                    "explicitlyInherited",
                }) or {key: observed.get(key) for key in expected_handle} != expected_handle \
                or not _hex(observed.get("handleValue"), 16) \
                or observed["handleValue"] in inherited_values \
                or observed.get("targetProcessId") != launch.get("processId") \
                or observed.get("sourceWasTemporarilyInheritable") is not True \
                or observed.get("sourceInheritabilityCleared") is not True \
                or observed.get("parentHandleClosed") is not True \
                or observed.get("explicitlyInherited") is not True:
            _fail("database_rehearsal_execution_lock_handle_inheritance_invalid")
        inherited_values.add(observed["handleValue"])
    expected = _expected_file_map(expected_files)
    handles = snapshot.get("handles")
    if not isinstance(handles, list) or len(handles) != len(expected):
        _fail("database_rehearsal_execution_lock_handle_set_invalid")
    seen_handle_ids: set[str] = set()
    seen_files: set[str] = set()
    seen_directories: dict[str, tuple[str, str]] = {}
    python_identity: tuple[str, str] | None = None
    for handle in handles:
        if not _exact_keys(handle, {
            "handleId", "role", "relativePath", "absolutePath", "volumeSerial",
            "fileId", "bytes", "sha256", "linkCount", "reparseTag", "streams",
            "openFlags", "shareMode", "inheritable", "duplicateTargetProcessId",
            "directoryChain",
        }):
            _fail("database_rehearsal_execution_lock_handle_invalid")
        relative = _relative(handle.get("relativePath"))
        expected_file = expected.get(relative)
        if expected_file is None or handle.get("role") != expected_file["role"] \
                or handle.get("bytes") != expected_file["bytes"] \
                or handle.get("sha256") != expected_file["sha256"]:
            _fail("database_rehearsal_execution_lock_file_mismatch")
        absolute = _absolute_canonical(handle.get("absolutePath"))
        exact_absolute = os.path.normpath(os.path.join(root, *relative.split("/")))
        if absolute != exact_absolute:
            _fail("database_rehearsal_execution_lock_path_escape")
        parent_parts = relative.split("/")[:-1]
        expected_directories = [
            "/".join(parent_parts[:index])
            for index in range(1, len(parent_parts) + 1)
        ]
        chain = handle.get("directoryChain")
        if not isinstance(chain, list) or len(chain) != len(expected_directories):
            _fail("database_rehearsal_execution_lock_directory_chain_invalid")
        for directory, expected_relative in zip(
                chain, expected_directories, strict=True):
            expected_absolute = os.path.normpath(
                os.path.join(root, *expected_relative.split("/")),
            )
            if not _exact_keys(directory, {
                "relativePath", "absolutePath", "volumeSerial", "fileId", "reparseTag",
            }) or directory.get("relativePath") != expected_relative \
                    or directory.get("absolutePath") != expected_absolute \
                    or directory.get("volumeSerial") != snapshot["volumeSerial"] \
                    or not _hex(directory.get("fileId"), 32) \
                    or directory.get("reparseTag") != 0:
                _fail("database_rehearsal_execution_lock_directory_chain_invalid")
            folded_directory = expected_relative.casefold()
            identity = (directory["volumeSerial"], directory["fileId"])
            if folded_directory in seen_directories \
                    and seen_directories[folded_directory] != identity:
                _fail("database_rehearsal_execution_lock_directory_chain_invalid")
            seen_directories[folded_directory] = identity
        handle_id = handle.get("handleId")
        if not _hex(handle_id, 16) or handle_id in seen_handle_ids or relative in seen_files:
            _fail("database_rehearsal_execution_lock_handle_duplicate")
        seen_handle_ids.add(handle_id)
        seen_files.add(relative)
        if handle.get("volumeSerial") != snapshot["volumeSerial"] \
                or not _hex(handle.get("fileId"), 32):
            _fail("database_rehearsal_execution_lock_file_identity_mismatch")
        if handle.get("linkCount") != 1 or handle.get("reparseTag") != 0 \
                or handle.get("streams") != ["::$DATA"]:
            _fail("database_rehearsal_execution_lock_unsafe_file")
        if handle.get("openFlags") != list(REQUIRED_OPEN_FLAGS) \
                or handle.get("shareMode") != "FILE_SHARE_READ" \
                or handle.get("inheritable") is not False \
                or handle.get("duplicateTargetProcessId") != launch.get("processId"):
            _fail("database_rehearsal_execution_lock_handle_inheritance_invalid")
        if handle.get("role") == "python":
            python_identity = (handle["volumeSerial"], handle["fileId"])
    if seen_files != set(expected):
        _fail("database_rehearsal_execution_lock_handle_set_invalid")
    if python_identity != (launch.get("imageVolumeSerial"), launch.get("imageFileId")):
        _fail("database_rehearsal_execution_lock_image_substituted")
    active = job.get("activeProcessIds")
    if not isinstance(active, list) or len(active) != len(set(active)):
        _fail("database_rehearsal_execution_lock_child_escape")
    if expected_phase == "final":
        if active or job.get("allProcessesExited") is not True \
                or job.get("completionMessagesDrained") is not True:
            _fail("database_rehearsal_execution_lock_child_escape")
    elif launch.get("processId") not in active \
            or job.get("allProcessesExited") is not False \
            or job.get("completionMessagesDrained") is not False:
        _fail("database_rehearsal_execution_lock_child_escape")
    cleanup = snapshot.get("cleanup")
    if not _exact_keys(cleanup, {"handlesClosed", "jobClosed", "stagingDeleted"}):
        _fail("database_rehearsal_execution_lock_cleanup_invalid")
    if expected_phase in ("prepared", "initial") and cleanup != {
        "handlesClosed": False, "jobClosed": False, "stagingDeleted": False,
    }:
        _fail("database_rehearsal_execution_lock_cleanup_invalid")
    if expected_phase == "final" and cleanup != {
        "handlesClosed": True, "jobClosed": True, "stagingDeleted": True,
    }:
        _fail("database_rehearsal_execution_lock_cleanup_failed")
    if prior_snapshot is not None:
        for key in (
            "sessionId", "stagingRoot", "volumeSerial", "rootFileId", "ownerSid",
            "requestorSid",
            "daclSha256", "broker", "handles",
        ):
            if snapshot.get(key) != prior_snapshot.get(key):
                _fail("database_rehearsal_execution_lock_postrun_identity_changed")
    canonical = {key: snapshot[key] for key in sorted(snapshot)}
    return ExecutionLockCapability(
        session_id=expected_session,
        policy_id=policy["policyId"],
        staging_root=root,
        volume_serial=snapshot["volumeSerial"],
        broker_process_id=broker["processId"],
        child_process_id=launch["processId"],
        snapshot_digest=_digest(canonical),
        source_contract_verified=True,
        # Source-level snapshot verification is not Windows execution proof.
        # A future reviewed native adapter must promote both fields together.
        execution_locked=False,
        windows_validated=False,
    )


class ImmutableWindowsStagingProtocol:
    """Orchestrate the broker protocol through a Windows-validated adapter."""

    def __init__(self, adapter: WindowsExecutionLockAdapter, policy: dict[str, Any]):
        self.adapter = adapter
        self.policy = policy
        self.prepared_snapshot: dict[str, Any] | None = None
        self.initial_snapshot: dict[str, Any] | None = None
        self.capability: ExecutionLockCapability | None = None
        self.expected_requestor_sid: str | None = None
        self.expected_broker_image: dict[str, str] | None = None
        self.explicit_child_handles: tuple[dict[str, str], ...] | None = None

    def prepare(
        self,
        *,
        session_id: str,
        expected_files: list[dict[str, Any]],
        expected_requestor_sid: str,
        expected_broker_image: dict[str, str],
        explicit_child_handles: tuple[dict[str, str], ...],
    ) -> ExecutionLockCapability:
        if not getattr(self.adapter, "windows_validated", False):
            _fail("database_rehearsal_execution_lock_windows_not_validated")
        inspect = inspect_execution_lock_policy(self.policy)
        if not inspect["ready"]:
            _fail("database_rehearsal_execution_lock_policy_unapproved")
        stage = ""
        try:
            stage = self.adapter.create_acl_locked_stage(session_id, self.policy)
            self.adapter.copy_exact_files(stage, expected_files)
            self.adapter.open_retained_handles(stage, expected_files)
            self.adapter.create_containment_job(session_id)
            self.adapter.launch_child_suspended(stage, explicit_child_handles)
            self.adapter.clear_and_close_parent_inheritable_handles()
            self.adapter.assign_child_before_resume()
            prepared = self.adapter.observe_snapshot("prepared")
            prepared_capability = verify_execution_lock_snapshot(
                prepared,
                policy=self.policy,
                expected_files=expected_files,
                expected_session=session_id,
                expected_phase="prepared",
                expected_requestor_sid=expected_requestor_sid,
                expected_broker_image=expected_broker_image,
                expected_explicit_handles=explicit_child_handles,
            )
            if stage != prepared_capability.staging_root:
                _fail("database_rehearsal_execution_lock_stage_substituted")
            self.adapter.resume_child()
            snapshot = self.adapter.observe_snapshot("initial")
            capability = verify_execution_lock_snapshot(
                snapshot,
                policy=self.policy,
                expected_files=expected_files,
                expected_session=session_id,
                expected_phase="initial",
                expected_requestor_sid=expected_requestor_sid,
                expected_broker_image=expected_broker_image,
                expected_explicit_handles=explicit_child_handles,
                prior_snapshot=prepared,
            )
        except Exception as error:
            if not self.adapter.close_and_cleanup():
                raise ExecutionLockFailure(
                    "database_rehearsal_execution_lock_cleanup_failed"
                ) from error
            raise
        self.prepared_snapshot = prepared
        self.initial_snapshot = snapshot
        self.capability = capability
        self.expected_requestor_sid = expected_requestor_sid
        self.expected_broker_image = dict(expected_broker_image)
        self.explicit_child_handles = explicit_child_handles
        return capability

    def finalize(self, *, expected_files: list[dict[str, Any]]) -> ExecutionLockCapability:
        if self.initial_snapshot is None or self.capability is None \
                or self.expected_requestor_sid is None \
                or self.expected_broker_image is None \
                or self.explicit_child_handles is None:
            _fail("database_rehearsal_execution_lock_session_missing")
        self.adapter.wait_for_contained_exit()
        if not self.adapter.close_and_cleanup():
            _fail("database_rehearsal_execution_lock_cleanup_failed")
        final = self.adapter.observe_snapshot("final")
        return verify_execution_lock_snapshot(
            final,
            policy=self.policy,
            expected_files=expected_files,
            expected_session=self.capability.session_id,
            expected_phase="final",
            expected_requestor_sid=self.expected_requestor_sid,
            expected_broker_image=self.expected_broker_image,
            expected_explicit_handles=self.explicit_child_handles,
            prior_snapshot=self.initial_snapshot,
        )

    def recover(self, session_id: str) -> dict[str, Any]:
        if not getattr(self.adapter, "windows_validated", False) \
                or not _hex(session_id, 32):
            _fail("database_rehearsal_execution_lock_windows_not_validated")
        observed = self.adapter.recover_orphan(session_id)
        if observed != {
            "sessionId": session_id,
            "childTerminated": True,
            "jobClosed": True,
            "handlesClosed": True,
            "stagingDeleted": True,
        }:
            _fail("database_rehearsal_execution_lock_crash_recovery_failed")
        return observed


def production_windows_adapter() -> WindowsExecutionLockAdapter:
    # A Python-only adapter cannot authenticate and lock the Python image before
    # Python itself starts.  Keep the real adapter unavailable until a reviewed,
    # signed native broker and Windows evidence exist.
    _fail("database_rehearsal_execution_lock_broker_unavailable")
