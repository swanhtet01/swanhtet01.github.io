"""Synthetic decoded-XML cases for the actual postbuild APK verifier.

These do not claim a built APK, SDK output compatibility, or device behavior.
"""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from verify_shop_android_apk_backup import (
    APK_NAMES,
    BackupPolicyError,
    DOMAINS,
    RESOURCES,
    compiled_resource_ids,
    verify_compiled_refs,
    analyzer_output,
    verify_apk,
    verify_decoded,
)


def exclusions() -> str:
    return "".join(
        f'<exclude domain="{domain}" path="." />' for domain in sorted(DOMAINS)
    )


def valid_xml(profile: str) -> tuple[bytes, bytes, bytes]:
    package = (
        "dev.supermega.supermega_shop.qa"
        if profile == "qa"
        else "dev.supermega.supermega_shop"
    )
    manifest = (
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android" '
        f'package="{package}"><application android:allowBackup="false" '
        'android:fullBackupContent="@xml/shop_backup_rules" '
        'android:dataExtractionRules="@xml/shop_data_extraction_rules" />'
        "</manifest>"
    )
    legacy = f"<full-backup-content>{exclusions()}</full-backup-content>"
    modern = (
        "<data-extraction-rules>"
        f"<cloud-backup>{exclusions()}</cloud-backup>"
        f"<device-transfer>{exclusions()}</device-transfer>"
        "</data-extraction-rules>"
    )
    return manifest.encode(), legacy.encode(), modern.encode()


def valid_compiled() -> tuple[bytes, bytes]:
    tree = (
        "E: manifest (line=1)\n"
        "  E: application (line=2)\n"
        "    A: http://schemas.android.com/apk/res/android:allowBackup"
        '(0x01010280)=false (Raw: "false")\n'
        "    A: http://schemas.android.com/apk/res/android:fullBackupContent"
        '(0x01010287)=@0x7f0a0001 (Raw: "@xml/shop_backup_rules")\n'
        "    A: http://schemas.android.com/apk/res/android:dataExtractionRules"
        '(0x0101063c)=@0x7f0a0002 (Raw: "@xml/shop_data_extraction_rules")\n'
    )
    table = (
        "Package name=dev.supermega.supermega_shop id=0x7f\n"
        "resource 0x7f0a0001 xml/shop_backup_rules\n"
        "  () (file) res/xml/shop_backup_rules.xml type=XML\n"
        "resource 0x7f0a0002 xml/shop_data_extraction_rules\n"
        "  () (file) res/xml/shop_data_extraction_rules.xml type=XML\n"
    )
    return tree.encode(), table.encode()


class CompiledBackupPolicyTest(unittest.TestCase):
    def check_rejected(self, code: str, profile: str, parts: tuple[bytes, bytes, bytes]) -> None:
        with self.assertRaisesRegex(BackupPolicyError, f"^{code}$"):
            verify_decoded(profile, *parts)

    def test_both_profiles_accept_exact_compiled_policy(self) -> None:
        for profile in APK_NAMES:
            with self.subTest(profile=profile):
                verify_decoded(profile, *valid_xml(profile))

    def test_compiled_manifest_id_bindings_and_numeric_decoded_refs(self) -> None:
        tree, table = valid_compiled()
        for profile in APK_NAMES:
            with self.subTest(profile=profile):
                ids, package = verify_compiled_refs(profile, tree, table)
                manifest, legacy, modern = valid_xml(profile)
                numeric = manifest.replace(
                    b"@xml/shop_backup_rules", b"@0x7f0a0001"
                ).replace(b"@xml/shop_data_extraction_rules", b"@0x7f0a0002")
                verify_decoded(profile, numeric, legacy, modern, ids, package)

    def test_compiled_boolean_requires_false_even_with_false_raw_text(self) -> None:
        tree, table = valid_compiled()
        for changed in (
            tree.replace(b'=false (Raw: "false")', b'=true (Raw: "false")'),
            tree.replace(b'=false (Raw: "false")', b'="false" (Raw: "false")'),
            tree.replace(b"    A: http://schemas.android.com/apk/res/android:allowBackup"
                         b'(0x01010280)=false (Raw: "false")\n', b""),
        ):
            with self.assertRaises(BackupPolicyError):
                verify_compiled_refs("production", changed, table)

    def test_compiled_table_duplicate_or_missing_name_and_wrong_id_refused(self) -> None:
        tree, table = valid_compiled()
        for changed in (
            table.replace(b"xml/shop_backup_rules", b"xml/unrelated"),
            table + b"resource 0x7f0a0003 xml/shop_backup_rules\n",
            table.replace(b"0x7f0a0002", b"0x7f0a0001"),
        ):
            with self.assertRaises(BackupPolicyError):
                verify_compiled_refs("production", tree, changed)
        wrong_ref = tree.replace(b"@0x7f0a0001", b"@0x7f0a0011")
        with self.assertRaisesRegex(BackupPolicyError, "shop_backup_compiled_reference_table_mismatch"):
            verify_compiled_refs("production", wrong_ref, table)

    def test_compiled_resource_entry_must_resolve_to_decoded_file(self) -> None:
        tree, table = valid_compiled()
        for changed in (
            table.replace(b"res/xml/shop_backup_rules.xml", b"res/xml/unrelated.xml"),
            table.replace(b"res/xml/shop_backup_rules.xml", b"res/xml/shop_data_extraction_rules.xml"),
            table.replace(b"  () (file) res/xml/shop_backup_rules.xml type=XML\n", b""),
            table.replace(b"  () (file) res/xml/shop_backup_rules.xml type=XML\n",
                          b"  (land) (file) res/xml/shop_backup_rules.xml type=XML\n"),
            table.replace(b"  () (file) res/xml/shop_backup_rules.xml type=XML\n",
                          b"  () (file) res/xml/shop_backup_rules.xml type=XML\n"
                          b"  () (file) res/xml/shop_backup_rules.xml type=XML\n"),
        ):
            with self.assertRaisesRegex(BackupPolicyError, "shop_backup_compiled_table_file_invalid"):
                verify_compiled_refs("production", tree, changed)

    def test_compiled_raw_text_cannot_substitute_for_typed_reference(self) -> None:
        tree, table = valid_compiled()
        wrong_typed = tree.replace(
            b'@0x7f0a0001 (Raw: "@xml/shop_backup_rules")',
            b'@0x7f0a0011 (Raw: "@xml/shop_backup_rules")',
        )
        with self.assertRaisesRegex(BackupPolicyError, "shop_backup_compiled_reference_table_mismatch"):
            verify_compiled_refs("production", wrong_typed, table)
        raw_only = tree.replace(b'=@0x7f0a0001', b'=not_a_reference')
        with self.assertRaisesRegex(BackupPolicyError, "shop_backup_compiled_reference_invalid"):
            verify_compiled_refs("production", raw_only, table)

    def test_compiled_references_must_be_unique_and_on_application(self) -> None:
        tree, table = valid_compiled()
        attr = tree.splitlines()[3] + b"\n"
        duplicate = tree + attr
        with self.assertRaisesRegex(BackupPolicyError, "shop_backup_compiled_reference_invalid"):
            verify_compiled_refs("production", duplicate, table)
        moved = tree.replace(b"  E: application (line=2)", b"  E: activity (line=2)")
        with self.assertRaisesRegex(BackupPolicyError, "shop_backup_compiled_reference_scope_invalid"):
            verify_compiled_refs("production", moved, table)
        malformed_child = tree.replace(
            b"  E: application (line=2)\n",
            b"  E: application (line=2)\n    E: activity (line=bad)\n",
        )
        with self.assertRaisesRegex(BackupPolicyError, "shop_backup_compiled_manifest_invalid"):
            verify_compiled_refs("production", malformed_child, table)

    def test_merged_manifest_missing_or_true_allow_backup(self) -> None:
        manifest, legacy, modern = valid_xml("production")
        for replacement in (b"", b'android:allowBackup="true"'):
            changed = manifest.replace(b'android:allowBackup="false"', replacement)
            self.check_rejected(
                "shop_backup_merged_flag_invalid",
                "production",
                (changed, legacy, modern),
            )

    def test_wrong_or_numeric_manifest_references_fail_closed(self) -> None:
        manifest, legacy, modern = valid_xml("qa")
        for expected, code in (
            (b"shop_backup_rules", "shop_backup_merged_legacy_reference_invalid"),
            (b"shop_data_extraction_rules", "shop_backup_merged_modern_reference_invalid"),
        ):
            for replacement in (b"wrong", b"0x7f0a0001"):
                self.check_rejected(
                    code,
                    "qa",
                    (manifest.replace(expected, replacement), legacy, modern),
                )

    def test_wrong_package_does_not_satisfy_other_profile(self) -> None:
        manifest, legacy, modern = valid_xml("production")
        self.check_rejected(
            "shop_backup_merged_package_mismatch", "qa", (manifest, legacy, modern)
        )

    def test_missing_duplicate_or_malformed_application_refused(self) -> None:
        manifest, legacy, modern = valid_xml("production")
        app_start = manifest.index(b"<application")
        app_end = manifest.index(b"/>", app_start) + 2
        app = manifest[app_start:app_end]
        for changed, code in (
            (manifest.replace(app, b""), "shop_backup_merged_application_count_invalid"),
            (manifest.replace(app, app + app), "shop_backup_merged_application_count_invalid"),
            (manifest[:-1], "shop_backup_merged_manifest_invalid"),
        ):
            self.check_rejected(code, "production", (changed, legacy, modern))

    def test_missing_or_oversize_decoded_resource_refused(self) -> None:
        manifest, legacy, modern = valid_xml("qa")
        self.check_rejected(
            "shop_backup_compiled_legacy_invalid", "qa", (manifest, b"", modern)
        )
        self.check_rejected(
            "shop_backup_compiled_modern_invalid",
            "qa",
            (manifest, legacy, b"x" * (2 * 1024 * 1024 + 1)),
        )

    def test_legacy_missing_domain_duplicate_include_or_extra_attribute_refused(self) -> None:
        manifest, legacy, modern = valid_xml("production")
        missing = legacy.replace(b'<exclude domain="root" path="." />', b"")
        duplicate = legacy.replace(
            b'<exclude domain="root" path="." />',
            b'<exclude domain="root" path="." /><exclude domain="root" path="." />',
        )
        include = legacy.replace(b"</full-backup-content>", b"<include /></full-backup-content>")
        extra = legacy.replace(b'path="."', b'path="." requireFlags="clientSideEncryption"', 1)
        for changed in (missing, duplicate, include, extra):
            self.check_rejected(
                "shop_backup_compiled_legacy_exclusions_invalid",
                "production",
                (manifest, changed, modern),
            )

    def test_modern_missing_mode_domain_include_or_mode_attribute_refused(self) -> None:
        manifest, legacy, modern = valid_xml("qa")
        no_transfer = modern[: modern.index(b"<device-transfer>")] + b"</data-extraction-rules>"
        missing_domain = modern.replace(b'<exclude domain="root" path="." />', b"", 1)
        include = modern.replace(b"</device-transfer>", b"<include /></device-transfer>")
        extra_mode = modern.replace(b"<cloud-backup>", b'<cloud-backup disableIfNoEncryptionCapabilities="true">')
        self.check_rejected(
            "shop_backup_compiled_modern_modes_invalid", "qa", (manifest, legacy, no_transfer)
        )
        self.check_rejected(
            "shop_backup_compiled_modern_modes_invalid", "qa", (manifest, legacy, extra_mode)
        )
        for changed in (missing_domain, include):
            self.check_rejected(
                "shop_backup_compiled_modern_exclusions_invalid",
                "qa",
                (manifest, legacy, changed),
            )

    def test_apk_profile_binding_and_three_analyzer_calls(self) -> None:
        manifest, legacy, modern = valid_xml("qa")
        with tempfile.TemporaryDirectory(prefix="shop-apk-backup-test-") as directory:
            root = Path(directory)
            analyzer = root / "cmdline-tools/latest/bin/apkanalyzer"
            analyzer.parent.mkdir(parents=True)
            analyzer.write_bytes(b"synthetic test executable placeholder")
            analyzer.chmod(0o700)
            aapt2 = root / "build-tools/36.0.0/aapt2"
            aapt2.parent.mkdir(parents=True)
            aapt2.write_bytes(b"synthetic test executable placeholder")
            aapt2.chmod(0o700)
            apk = root / APK_NAMES["qa"]
            apk.write_bytes(b"synthetic APK placeholder")
            tree, table = valid_compiled()
            with patch("verify_shop_android_apk_backup.aapt2_output", side_effect=(tree, table)) as compiled:
                with patch("verify_shop_android_apk_backup.analyzer_output", side_effect=(manifest, legacy, modern)) as output:
                    verify_apk("qa", apk, root)
            self.assertEqual(compiled.call_count, 2)
            self.assertEqual(
                compiled.call_args_list[0].args[1],
                ["dump", "xmltree", str(apk), "--file", "AndroidManifest.xml"],
            )
            self.assertEqual(compiled.call_args_list[1].args[1], ["dump", "resources", str(apk)])
            self.assertEqual(output.call_count, 3)
            self.assertEqual(output.call_args_list[0].args[1], ["manifest", "print", str(apk)])
            for index, resource in enumerate(RESOURCES, 1):
                self.assertEqual(
                    output.call_args_list[index].args[1],
                    ["resources", "xml", "--file", resource, str(apk)],
                )
            with self.assertRaisesRegex(BackupPolicyError, "shop_backup_apk_invalid"):
                verify_apk("production", apk, root)

    def test_analyzer_failure_and_unbounded_output_are_not_accepted(self) -> None:
        from subprocess import CompletedProcess, TimeoutExpired

        for result, code in (
            (CompletedProcess([], 1, b"", b"sensitive error"), "shop_backup_apkanalyzer_failed"),
            (CompletedProcess([], 0, b"", b""), "shop_backup_apkanalyzer_output_invalid"),
            (
                CompletedProcess([], 0, b"x" * (2 * 1024 * 1024 + 1), b""),
                "shop_backup_apkanalyzer_output_invalid",
            ),
        ):
            with patch("verify_shop_android_apk_backup.subprocess.run", return_value=result):
                with self.assertRaisesRegex(BackupPolicyError, f"^{code}$"):
                    analyzer_output(Path("/synthetic/apkanalyzer"), ["manifest", "print", "x.apk"])
        with patch(
            "verify_shop_android_apk_backup.subprocess.run",
            side_effect=TimeoutExpired("apkanalyzer", 30, stderr=b"sensitive error"),
        ):
            with self.assertRaisesRegex(BackupPolicyError, "shop_backup_apkanalyzer_unavailable"):
                analyzer_output(Path("/synthetic/apkanalyzer"), ["manifest", "print", "x.apk"])


if __name__ == "__main__":
    unittest.main()
