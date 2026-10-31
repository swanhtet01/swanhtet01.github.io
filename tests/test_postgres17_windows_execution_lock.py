from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest

from tools.postgres17_windows_execution_lock import (
    CONTRACT,
    ExecutionLockFailure,
    ImmutableWindowsStagingProtocol,
    inspect_execution_lock_policy,
    production_windows_adapter,
    verify_execution_lock_snapshot,
)


def _sha(value: bytes) -> str:
    return sha256(value).hexdigest()


class FakeAdapter:
    windows_validated = True

    def __init__(self, initial: dict, final: dict) -> None:
        self.initial = initial
        self.final = final
        self.prepared = deepcopy(initial)
        self.prepared["phase"] = "prepared"
        self.prepared["childLaunch"]["resumed"] = False
        self.cleanup_ok = True
        self.recovery = {
            "sessionId": initial["sessionId"],
            "childTerminated": True,
            "jobClosed": True,
            "handlesClosed": True,
            "stagingDeleted": True,
        }
        self.calls: list[str] = []

    def create_acl_locked_stage(self, session_id: str, policy: dict) -> str:
        self.calls.append("create_acl_locked_stage")
        return self.initial["stagingRoot"]

    def copy_exact_files(self, stage: str, expected_files: list[dict]) -> None:
        self.calls.append("copy_exact_files")

    def open_retained_handles(self, stage: str, expected_files: list[dict]) -> None:
        self.calls.append("open_retained_handles")

    def create_containment_job(self, session_id: str) -> None:
        self.calls.append("create_containment_job")

    def launch_child_suspended(self, stage: str, explicit_handles: tuple[dict[str, str], ...]) -> None:
        self.calls.append("launch_child_suspended")

    def clear_and_close_parent_inheritable_handles(self) -> None:
        self.calls.append("clear_and_close_parent_inheritable_handles")

    def assign_child_before_resume(self) -> None:
        self.calls.append("assign_child_before_resume")

    def resume_child(self) -> None:
        self.calls.append("resume_child")

    def wait_for_contained_exit(self) -> None:
        self.calls.append("wait_for_contained_exit")

    def observe_snapshot(self, phase: str) -> dict:
        self.calls.append(f"observe_{phase}")
        snapshots = {
            "prepared": self.prepared,
            "initial": self.initial,
            "final": self.final,
        }
        return deepcopy(snapshots[phase])

    def close_and_cleanup(self) -> bool:
        self.calls.append("close_and_cleanup")
        return self.cleanup_ok

    def recover_orphan(self, session_id: str) -> dict:
        self.calls.append("recover_orphan")
        return deepcopy(self.recovery)


class ExecutionLockFixture:
    def __init__(self) -> None:
        self.folder = Path(tempfile.mkdtemp(prefix="supermega-pg17-lock-"))
        self.stage = self.folder / "stage"
        self.stage.mkdir()
        self.session = "1" * 32
        self.requestor_sid = "S-1-5-21-67890"
        self.broker_image = {
            "absolutePath": str(self.folder / "supermega-postgres17-broker.exe"),
            "volumeSerial": "7" * 16,
            "fileId": "8" * 32,
            "sha256": "2" * 64,
            "signerCertificateSha256": "3" * 64,
        }
        self.explicit_handles = ({
            "kind": "authority-pipe",
            "access": "GENERIC_READ",
            "direction": "parent-to-child",
            "securityDescriptorSha256": "9" * 64,
        },)
        self.policy = {
            "contract": "supermega.postgres17-windows-execution-lock-policy.v1",
            "policyId": "synthetic-reviewed-lock-policy",
            "status": "reviewed",
            "testOnly": False,
            "method": "signed-broker-held-handles-v1",
            "platform": {"os": "windows", "arch": "x64"},
            "broker": {
                "fileName": "supermega-postgres17-broker.exe",
                "sha256": "2" * 64,
                "signerCertificateSha256": "3" * 64,
                "protocolVersion": 1,
            },
            "staging": {
                "sameVolumeRequired": True,
                "protectedDaclRequired": True,
                "ownerSid": "S-1-5-80-12345",
                "daclSha256": "4" * 64,
                "denyCurrentTokenMutation": True,
                "singleDataStreamOnly": True,
            },
            "handles": {
                "shareMode": "FILE_SHARE_READ",
                "openFlags": [
                    "FILE_FLAG_OPEN_REPARSE_POINT",
                    "FILE_FLAG_BACKUP_SEMANTICS",
                ],
                "nonInheritableByDefault": True,
                "explicitChildHandleListOnly": True,
                "temporaryInheritabilityUnderSpawnLock": True,
                "clearAndCloseBeforeVerification": True,
            },
            "job": {
                "killOnClose": True,
                "breakawayAllowed": False,
                "silentBreakawayAllowed": False,
                "createSuspended": True,
                "assignBeforeResume": True,
                "completionPortRequired": True,
            },
            "approval": {
                "status": "reviewed",
                "reviewedBy": "independent-security",
                "reviewedAt": "2026-10-31T00:00:00Z",
            },
            "blockers": [],
        }
        self.files = []
        for role, relative, payload in (
            ("python", "python/python.exe", b"python fixture"),
            ("postgres", "pgsql/bin/postgres.exe", b"postgres fixture"),
        ):
            target = self.stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
            self.files.append({
                "role": role,
                "relativePath": relative,
                "bytes": len(payload),
                "sha256": _sha(payload),
            })
        self.initial = self._snapshot("initial")
        self.final = self._snapshot("final")

    def _snapshot(self, phase: str) -> dict:
        handles = []
        for index, item in enumerate(self.files, start=1):
            parent_parts = item["relativePath"].split("/")[:-1]
            directory_chain = []
            for directory_index in range(1, len(parent_parts) + 1):
                relative_directory = "/".join(parent_parts[:directory_index])
                identity_seed = sum(ord(character) for character in relative_directory)
                directory_chain.append({
                    "relativePath": relative_directory,
                    "absolutePath": str(self.stage / relative_directory),
                    "volumeSerial": "5" * 16,
                    "fileId": f"{identity_seed:032x}",
                    "reparseTag": 0,
                })
            handles.append({
                "handleId": f"{index:016x}",
                "role": item["role"],
                "relativePath": item["relativePath"],
                "absolutePath": str(self.stage / item["relativePath"]),
                "volumeSerial": "5" * 16,
                "fileId": f"{index + 10:032x}",
                "bytes": item["bytes"],
                "sha256": item["sha256"],
                "linkCount": 1,
                "reparseTag": 0,
                "streams": ["::$DATA"],
                "openFlags": [
                    "FILE_FLAG_OPEN_REPARSE_POINT",
                    "FILE_FLAG_BACKUP_SEMANTICS",
                ],
                "shareMode": "FILE_SHARE_READ",
                "inheritable": False,
                "duplicateTargetProcessId": 300,
                "directoryChain": directory_chain,
            })
        python_handle = handles[0]
        cleanup = {
            "handlesClosed": phase == "final",
            "jobClosed": phase == "final",
            "stagingDeleted": phase == "final",
        }
        return {
            "contract": CONTRACT,
            "authoritative": False,
            "phase": phase,
            "sessionId": self.session,
            "stagingRoot": str(self.stage),
            "volumeSerial": "5" * 16,
            "rootFileId": "6" * 32,
            "rootReparseTag": 0,
            "rootOpenFlags": [
                "FILE_FLAG_OPEN_REPARSE_POINT",
                "FILE_FLAG_BACKUP_SEMANTICS",
            ],
            "rootHandleRetained": True,
            "ownerSid": self.policy["staging"]["ownerSid"],
            "requestorSid": self.requestor_sid,
            "daclSha256": self.policy["staging"]["daclSha256"],
            "aclProtected": True,
            "effectiveAccess": {
                "read": True,
                "execute": True,
                "write": False,
                "append": False,
                "delete": False,
                "writeDac": False,
                "writeOwner": False,
            },
            "broker": {
                "processId": 200,
                "parentProcessId": 100,
                "fileName": self.policy["broker"]["fileName"],
                "sha256": self.policy["broker"]["sha256"],
                "signerCertificateSha256": self.policy["broker"]["signerCertificateSha256"],
                "authenticodeValid": True,
                "protocolVersion": 1,
                "imagePath": self.broker_image["absolutePath"],
                "imageVolumeSerial": self.broker_image["volumeSerial"],
                "imageFileId": self.broker_image["fileId"],
            },
            "job": {
                "jobId": "synthetic-job",
                "killOnClose": True,
                "breakawayAllowed": False,
                "silentBreakawayAllowed": False,
                "completionPortBound": True,
                "childAssigned": True,
                "activeProcessIds": [] if phase == "final" else [300],
                "allProcessesExited": phase == "final",
                "completionMessagesDrained": phase == "final",
            },
            "childLaunch": {
                "processId": 300,
                "createdSuspended": True,
                "assignedBeforeResume": True,
                "resumed": True,
                "startupInfoEx": True,
                "bInheritHandles": True,
                "brokerSpawnLockHeld": True,
                "concurrentSpawnCount": 0,
                "explicitHandleList": [{
                    "handleValue": "0000000000000042",
                    **self.explicit_handles[0],
                    "targetProcessId": 300,
                    "sourceWasTemporarilyInheritable": True,
                    "sourceInheritabilityCleared": True,
                    "parentHandleClosed": True,
                    "explicitlyInherited": True,
                }],
                "unrelatedInheritedHandles": 0,
                "imageVolumeSerial": python_handle["volumeSerial"],
                "imageFileId": python_handle["fileId"],
            },
            "handles": handles,
            "cleanup": cleanup,
        }


class WindowsExecutionLockTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = ExecutionLockFixture()

    def verify(self, snapshot: dict, phase: str = "initial", prior: dict | None = None):
        return verify_execution_lock_snapshot(
            snapshot,
            policy=self.fixture.policy,
            expected_files=self.fixture.files,
            expected_session=self.fixture.session,
            expected_phase=phase,
            expected_requestor_sid=self.fixture.requestor_sid,
            expected_broker_image=self.fixture.broker_image,
            expected_explicit_handles=self.fixture.explicit_handles,
            prior_snapshot=prior,
        )

    def assert_rejected(self, mutate, code: str) -> None:
        snapshot = deepcopy(self.fixture.initial)
        mutate(snapshot)
        with self.assertRaisesRegex(ExecutionLockFailure, f"^{code}$"):
            self.verify(snapshot)

    def test_synthetic_snapshot_is_non_authoritative_and_not_windows_proof(self) -> None:
        capability = self.verify(self.fixture.initial)
        self.assertTrue(capability.source_contract_verified)
        self.assertFalse(capability.execution_locked)
        self.assertFalse(capability.windows_validated)
        authoritative = deepcopy(self.fixture.initial)
        authoritative["authoritative"] = True
        with self.assertRaisesRegex(ExecutionLockFailure, "snapshot_invalid"):
            self.verify(authoritative)

    def test_pending_canonical_policy_and_production_adapter_fail_closed(self) -> None:
        path = Path("hq/research/postgres17-windows-execution-lock-policy.json")
        policy = json.loads(path.read_text(encoding="utf-8"))
        inspection = inspect_execution_lock_policy(policy)
        self.assertFalse(inspection["ready"])
        self.assertIn("execution_lock_policy_not_reviewed", inspection["blockers"])
        with self.assertRaisesRegex(ExecutionLockFailure, "broker_unavailable"):
            production_windows_adapter()

    def test_rejects_rename_replace_hardlink_reparse_ads_and_path_escape(self) -> None:
        cases = (
            (lambda s: s["handles"][0].__setitem__("volumeSerial", "9" * 16), "file_identity_mismatch"),
            (lambda s: s["handles"][0].__setitem__("sha256", "9" * 64), "file_mismatch"),
            (lambda s: s["handles"][0].__setitem__("linkCount", 2), "unsafe_file"),
            (lambda s: s["handles"][0].__setitem__("reparseTag", 0xA000000C), "unsafe_file"),
            (lambda s: s["handles"][0].__setitem__("streams", ["::$DATA", ":evil:$DATA"]), "unsafe_file"),
            (lambda s: s["handles"][0].__setitem__("absolutePath", str(self.fixture.folder / "escape.exe")), "path_escape"),
            (lambda s: s["handles"][0].__setitem__("absolutePath", str(self.fixture.stage / "other.exe")), "path_escape"),
            (lambda s: s["handles"][0]["directoryChain"][0].__setitem__("reparseTag", 0xA000000C), "directory_chain_invalid"),
        )
        for mutate, suffix in cases:
            with self.subTest(suffix=suffix):
                self.assert_rejected(mutate, f"database_rehearsal_execution_lock_{suffix}")

    def test_rejects_dacl_owner_and_root_identity_changes(self) -> None:
        cases = (
            lambda s: s.__setitem__("ownerSid", "S-1-5-21-evil"),
            lambda s: s.__setitem__("requestorSid", s["ownerSid"]),
            lambda s: s.__setitem__("daclSha256", "9" * 64),
            lambda s: s.__setitem__("aclProtected", False),
            lambda s: s["effectiveAccess"].__setitem__("writeDac", True),
            lambda s: s.__setitem__("volumeSerial", "9" * 16),
            lambda s: s.__setitem__("rootFileId", "x" * 32),
            lambda s: s.__setitem__("rootReparseTag", 0xA000000C),
            lambda s: s.__setitem__("rootHandleRetained", False),
        )
        for mutate in cases:
            with self.subTest(mutate=repr(mutate)):
                with self.assertRaises(ExecutionLockFailure):
                    snapshot = deepcopy(self.fixture.initial)
                    mutate(snapshot)
                    self.verify(snapshot)

    def test_rejects_handle_inheritance_duplication_and_image_substitution(self) -> None:
        cases = (
            (lambda s: s["childLaunch"].__setitem__("unrelatedInheritedHandles", 1), "handle_inheritance_invalid"),
            (lambda s: s["childLaunch"].__setitem__("explicitHandleList", []), "handle_inheritance_invalid"),
            (lambda s: s["childLaunch"].__setitem__("bInheritHandles", False), "handle_inheritance_invalid"),
            (lambda s: s["childLaunch"].__setitem__("concurrentSpawnCount", 1), "handle_inheritance_invalid"),
            (lambda s: s["handles"][0].__setitem__("inheritable", True), "handle_inheritance_invalid"),
            (lambda s: s["handles"][0].__setitem__("duplicateTargetProcessId", 999), "handle_inheritance_invalid"),
            (lambda s: s["childLaunch"]["explicitHandleList"][0].__setitem__("access", "GENERIC_WRITE"), "handle_inheritance_invalid"),
            (lambda s: s["childLaunch"]["explicitHandleList"][0].__setitem__("sourceInheritabilityCleared", False), "handle_inheritance_invalid"),
            (lambda s: s["childLaunch"]["explicitHandleList"][0].__setitem__("parentHandleClosed", False), "handle_inheritance_invalid"),
            (lambda s: s["childLaunch"].__setitem__("imageFileId", "9" * 32), "image_substituted"),
        )
        for mutate, suffix in cases:
            with self.subTest(suffix=suffix):
                self.assert_rejected(mutate, f"database_rehearsal_execution_lock_{suffix}")

    def test_rejects_child_escape_and_job_breakaway(self) -> None:
        cases = (
            lambda s: s["job"].__setitem__("killOnClose", False),
            lambda s: s["job"].__setitem__("breakawayAllowed", True),
            lambda s: s["job"].__setitem__("silentBreakawayAllowed", True),
            lambda s: s["job"].__setitem__("childAssigned", False),
            lambda s: s["job"].__setitem__("activeProcessIds", []),
        )
        for mutate in cases:
            with self.subTest(mutate=repr(mutate)):
                self.assert_rejected(mutate, "database_rehearsal_execution_lock_child_escape")
        self.assert_rejected(
            lambda s: s["childLaunch"].__setitem__("assignedBeforeResume", False),
            "database_rehearsal_execution_lock_handle_inheritance_invalid",
        )

    def test_final_snapshot_detects_swap_execute_restore_toctou(self) -> None:
        final = deepcopy(self.fixture.final)
        final["handles"][1]["fileId"] = "9" * 32
        with self.assertRaisesRegex(ExecutionLockFailure, "postrun_identity_changed"):
            self.verify(final, phase="final", prior=self.fixture.initial)

    def test_protocol_orders_containment_and_fails_closed_on_cleanup(self) -> None:
        adapter = FakeAdapter(self.fixture.initial, self.fixture.final)
        protocol = ImmutableWindowsStagingProtocol(adapter, self.fixture.policy)
        capability = protocol.prepare(
            session_id=self.fixture.session,
            expected_files=self.fixture.files,
            expected_requestor_sid=self.fixture.requestor_sid,
            expected_broker_image=self.fixture.broker_image,
            explicit_child_handles=self.fixture.explicit_handles,
        )
        self.assertFalse(capability.execution_locked)
        self.assertFalse(capability.windows_validated)
        self.assertLess(
            adapter.calls.index("launch_child_suspended"),
            adapter.calls.index("clear_and_close_parent_inheritable_handles"),
        )
        self.assertLess(
            adapter.calls.index("clear_and_close_parent_inheritable_handles"),
            adapter.calls.index("observe_prepared"),
        )
        self.assertLess(adapter.calls.index("observe_prepared"), adapter.calls.index("resume_child"))
        self.assertLess(adapter.calls.index("assign_child_before_resume"), adapter.calls.index("resume_child"))
        protocol.finalize(expected_files=self.fixture.files)
        self.assertLess(adapter.calls.index("wait_for_contained_exit"), adapter.calls.index("close_and_cleanup"))
        adapter.cleanup_ok = False
        with self.assertRaisesRegex(ExecutionLockFailure, "cleanup_failed"):
            protocol.finalize(expected_files=self.fixture.files)

    def test_protocol_rejects_unvalidated_adapter_and_failed_crash_recovery(self) -> None:
        adapter = FakeAdapter(self.fixture.initial, self.fixture.final)
        adapter.windows_validated = False
        protocol = ImmutableWindowsStagingProtocol(adapter, self.fixture.policy)
        with self.assertRaisesRegex(ExecutionLockFailure, "windows_not_validated"):
            protocol.prepare(
                session_id=self.fixture.session,
                expected_files=self.fixture.files,
                expected_requestor_sid=self.fixture.requestor_sid,
                expected_broker_image=self.fixture.broker_image,
                explicit_child_handles=self.fixture.explicit_handles,
            )
        adapter.windows_validated = True
        adapter.recovery["stagingDeleted"] = False
        with self.assertRaisesRegex(ExecutionLockFailure, "crash_recovery_failed"):
            protocol.recover(self.fixture.session)

    def test_invalid_suspended_image_never_resumes_and_is_cleaned_up(self) -> None:
        adapter = FakeAdapter(self.fixture.initial, self.fixture.final)
        adapter.prepared["childLaunch"]["imageFileId"] = "9" * 32
        protocol = ImmutableWindowsStagingProtocol(adapter, self.fixture.policy)
        with self.assertRaisesRegex(ExecutionLockFailure, "image_substituted"):
            protocol.prepare(
                session_id=self.fixture.session,
                expected_files=self.fixture.files,
                expected_requestor_sid=self.fixture.requestor_sid,
                expected_broker_image=self.fixture.broker_image,
                explicit_child_handles=self.fixture.explicit_handles,
            )
        self.assertNotIn("resume_child", adapter.calls)
        self.assertIn("close_and_cleanup", adapter.calls)

    def test_rejects_casefold_inventory_and_unbound_broker_or_requestor(self) -> None:
        duplicate = deepcopy(self.fixture.files)
        duplicate.append({**duplicate[0], "relativePath": duplicate[0]["relativePath"].upper()})
        with self.assertRaisesRegex(ExecutionLockFailure, "inventory_duplicate"):
            verify_execution_lock_snapshot(
                self.fixture.initial,
                policy=self.fixture.policy,
                expected_files=duplicate,
                expected_session=self.fixture.session,
                expected_phase="initial",
                expected_requestor_sid=self.fixture.requestor_sid,
                expected_broker_image=self.fixture.broker_image,
                expected_explicit_handles=self.fixture.explicit_handles,
            )
        wrong_broker = {**self.fixture.broker_image, "fileId": "9" * 32}
        with self.assertRaisesRegex(ExecutionLockFailure, "broker_invalid"):
            verify_execution_lock_snapshot(
                self.fixture.initial,
                policy=self.fixture.policy,
                expected_files=self.fixture.files,
                expected_session=self.fixture.session,
                expected_phase="initial",
                expected_requestor_sid=self.fixture.requestor_sid,
                expected_broker_image=wrong_broker,
                expected_explicit_handles=self.fixture.explicit_handles,
            )
        with self.assertRaisesRegex(ExecutionLockFailure, "root_identity_mismatch"):
            verify_execution_lock_snapshot(
                self.fixture.initial,
                policy=self.fixture.policy,
                expected_files=self.fixture.files,
                expected_session=self.fixture.session,
                expected_phase="initial",
                expected_requestor_sid="S-1-5-21-other",
                expected_broker_image=self.fixture.broker_image,
                expected_explicit_handles=self.fixture.explicit_handles,
            )


if __name__ == "__main__":
    unittest.main()
