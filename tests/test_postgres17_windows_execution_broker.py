from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
WINDOWS = ROOT / "tools" / "windows"
BROKER = WINDOWS / "postgres17_execution_broker.cpp"
PROTOCOL = WINDOWS / "postgres17_execution_broker_protocol.cpp"
PROTOCOL_HEADER = WINDOWS / "postgres17_execution_broker_protocol.hpp"
PROTOCOL_TEST = WINDOWS / "postgres17_execution_broker_protocol_test.cpp"
MANIFEST = WINDOWS / "postgres17_execution_broker_build.json"
BUILD_SCRIPT = WINDOWS / "build_postgres17_execution_broker.ps1"


class WindowsExecutionBrokerSourceTests(unittest.TestCase):
    def test_build_manifest_is_deterministic_and_fail_closed(self) -> None:
        raw = MANIFEST.read_text(encoding="utf-8")
        manifest = json.loads(raw)
        self.assertEqual(raw, json.dumps(manifest, indent=2) + "\n")
        self.assertEqual(
            manifest["contract"], "supermega.postgres17-windows-broker-build.v1"
        )
        self.assertEqual(manifest["target"], "windows-x64")
        self.assertEqual(
            manifest["sources"],
            [
                "tools/windows/postgres17_execution_broker.cpp",
                "tools/windows/postgres17_execution_broker_protocol.cpp",
                "tools/windows/postgres17_execution_broker_protocol.hpp",
            ],
        )
        self.assertEqual(manifest["translationUnits"], manifest["sources"][:2])
        self.assertEqual(manifest["headers"], manifest["sources"][2:])
        self.assertEqual(
            manifest["buildInputs"],
            [
                *manifest["sources"],
                "tools/windows/postgres17_execution_broker_build.json",
                "tools/windows/build_postgres17_execution_broker.ps1",
            ],
        )
        self.assertEqual(
            manifest["invocationOrder"],
            [
                "compiler.path",
                "compileFlags",
                "/pathmap:repository=.",
                "translationUnits",
                "/Fo:output-directory",
                "/Fe:output",
                "/link",
                "linkFlags",
                "systemLibraries",
            ],
        )
        self.assertIsNone(manifest["compiler"]["path"])
        self.assertEqual(manifest["compiler"]["expectedVersion"], "19.44.35228")
        self.assertIs(manifest["compiler"]["resolvedFromDeveloperCommandPrompt"], True)
        self.assertEqual(
            manifest["hostInventory"]["msbuildVersionAvailableButUnused"],
            "17.14.51.32402",
        )
        self.assertEqual(
            manifest["hostInventory"]["signToolVersionAvailableButUnused"],
            "10.0.26100.0",
        )
        self.assertIs(manifest["hostInventory"]["cmakeRequired"], False)
        self.assertIs(manifest["hostInventory"]["ninjaRequired"], False)
        self.assertEqual(manifest["windowsSdkVersion"], "10.0.26100.0")
        for field in (
            "productionAdapterEnabled",
            "signed",
            "windowsCompiled",
            "windowsValidated",
            "toolchainClosureComplete",
        ):
            self.assertIs(manifest[field], False)
        self.assertIn("/W4", manifest["compileFlags"])
        self.assertIn("/WX", manifest["compileFlags"])
        self.assertIn("/guard:cf", manifest["compileFlags"])
        self.assertIn("/DYNAMICBASE", manifest["linkFlags"])
        self.assertIn("/NXCOMPAT", manifest["linkFlags"])
        self.assertIn("windows-hostile-runtime-tests-not-run", manifest["blockers"])

    def test_msvc_x64_build_script_is_exact_and_does_not_sign_or_use_generators(self) -> None:
        source = BUILD_SCRIPT.read_text(encoding="utf-8")
        for token in (
            "$env:VSCMD_ARG_TGT_ARCH -ne 'x64'",
            "$env:WindowsSDKVersion.TrimEnd('\\')",
            "Get-Command cl.exe -CommandType Application",
            "Get-Command link.exe -CommandType Application",
            "Compiler Version ([0-9.]+) for x64",
            "postgres17_broker_output_directory_not_empty",
            '"/pathmap:$repositoryRoot=."',
            "objectDirectoryArgument",
            "@($manifest.compileFlags)",
            "@($manifest.linkFlags)",
            "Get-FileHash",
            "compilerSha256",
            "linkerSha256",
            "postBuildInputs",
            "postgres17_broker_input_changed_during_build",
            "postgres17_broker_system_library_changed_during_build",
            "toolchainClosureComplete = $false",
            "sdkIncludeRoot",
            "sdkLibraryRoot",
            "Assert-NonReparsePath",
            "authoritative = $false",
            "executionLocked = $false",
            "windowsValidated = $false",
            "signed = $false",
        ):
            self.assertIn(token, source)
        for forbidden in ("cmake", "ninja", "signtool", "Invoke-WebRequest", "Start-BitsTransfer"):
            self.assertNotIn(forbidden, source.lower())

    def test_source_preserves_required_fail_closed_order_and_controls(self) -> None:
        source = BROKER.read_text(encoding="utf-8")
        run_start = source.index("int RunBroker")
        run_source = source[run_start:]
        ordered = [
            "broker_spawn_lock_unavailable",
            "CreateJobObjectW",
            "PROC_THREAD_ATTRIBUTE_HANDLE_LIST",
            "CREATE_SUSPENDED",
            "inheritance_cleared =",
            "AssignProcessToJobObject",
            'BaseEvidence(config, "prepared"',
            "ParseApproval",
            "ResumeThread",
            "broker_postrun_identity_changed",
            'BaseEvidence(config, "final"',
        ]
        positions = [run_source.index(token) for token in ordered]
        self.assertEqual(positions, sorted(positions))
        self.assertLess(source.index("ParseBrokerConfig"), source.index("RunBroker(parsed.config"))
        required = (
            "FILE_FLAG_OPEN_REPARSE_POINT",
            "FILE_FLAG_DELETE_ON_CLOSE",
            "OpenDirectoryIdentityChain",
            "FileIdInfo",
            "SE_DACL_PROTECTED",
            "DaclIsExactAllowlist",
            "GetEffectiveRightsFromAclW",
            "nNumberOfLinks != 1",
            'L"::$DATA"',
            "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE",
            "JobObjectAssociateCompletionPortInformation",
            "CreateProcessW",
            "QueryFullProcessImageNameW",
            "ReadFrameBounded",
            "TerminateJobObject",
            "MarkDelete",
            "CleanupStage",
            "StableRecoveryDigest",
            '{"authoritative", "false"}',
            '{"executionLocked", "false"}',
            '{"windowsValidated", "false"}',
        )
        for token in required:
            self.assertIn(token, source)
        self.assertNotIn("CREATE_BREAKAWAY_FROM_JOB", source)
        self.assertNotIn("ShellExecute", source)
        self.assertNotIn("system(", source)
        self.assertNotIn("destination.handle.Reset(CreateFileW", source)
        recovery_body = source[
            source.index("bool StableRecoveryDigest") : source.index("bool Sha256Handle")
        ]
        for ephemeral in (
            "approval_read_handle",
            "evidence_write_handle",
            "child_stdin_handle",
            "child_stdout_handle",
        ):
            self.assertNotIn(ephemeral, recovery_body)

    def test_protocol_has_versioned_exact_schema_and_hostile_cases(self) -> None:
        protocol = PROTOCOL.read_text(encoding="utf-8")
        header = PROTOCOL_HEADER.read_text(encoding="utf-8")
        hostile = PROTOCOL_TEST.read_text(encoding="utf-8")
        self.assertIn('kEnvelopeMagic = "SMELOCK1"', header)
        self.assertIn("kProtocolVersion = 1", header)
        for token in (
            "kTrailingBytes",
            "kDuplicateField",
            "kUnknownField",
            "IsCanonicalRelativePath",
            "ParseApproval",
        ):
            self.assertIn(token, header + protocol)
        for token in (
            "truncated",
            "wrong_magic",
            "wrong_version",
            "unknown",
            "../python.exe",
            "postgres.exe:evil",
            "300001",
            "approvalReadHandle",
            "preparedDigest",
            '"deny"',
        ):
            self.assertIn(token, hostile)

    def test_host_protocol_and_non_windows_stub_compile_strictly(self) -> None:
        compiler = shutil.which("g++")
        if compiler is None:
            self.skipTest("g++ is unavailable; Windows compilation remains separately blocked")
        with tempfile.TemporaryDirectory(prefix="supermega-broker-") as directory:
            directory_path = pathlib.Path(directory)
            common = [
                compiler,
                "-std=c++17",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-pedantic",
                str(PROTOCOL),
            ]
            protocol_binary = directory_path / "protocol-test"
            subprocess.run(
                [*common, str(PROTOCOL_TEST), "-o", str(protocol_binary)],
                check=True,
                cwd=ROOT,
                timeout=30,
            )
            result = subprocess.run(
                [str(protocol_binary)],
                check=True,
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(
                result.stdout.strip(), "postgres17_execution_broker_protocol_tests=pass"
            )
            stub_binary = directory_path / "broker-stub"
            subprocess.run(
                [*common, str(BROKER), "-o", str(stub_binary)],
                check=True,
                cwd=ROOT,
                timeout=30,
            )
            result = subprocess.run([str(stub_binary)], cwd=ROOT, timeout=10)
            self.assertEqual(result.returncode, 125)


if __name__ == "__main__":
    unittest.main()
