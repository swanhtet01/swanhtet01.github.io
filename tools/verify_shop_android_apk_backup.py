"""Fail closed on Shop backup policy in a built Android APK.

The CLI asks the Android SDK's apkanalyzer to decode the merged manifest and
both compiled XML resources. Authored source XML alone cannot prove these APK
contents. This check is not an installed cloud/device-transfer test.
"""

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


ANDROID = "{http://schemas.android.com/apk/res/android}"
DOMAINS = frozenset(
    {
        "root",
        "file",
        "database",
        "sharedpref",
        "external",
        "device_root",
        "device_file",
        "device_database",
        "device_sharedpref",
    }
)
RESOURCES = (
    "/res/xml/shop_backup_rules.xml",
    "/res/xml/shop_data_extraction_rules.xml",
)
APK_NAMES = {
    "production": "app-production-debug.apk",
    "qa": "app-qa-debug.apk",
}
PACKAGE_NAMES = {
    "production": "dev.supermega.supermega_shop",
    "qa": "dev.supermega.supermega_shop.qa",
}
MAX_XML_BYTES = 2 * 1024 * 1024
MAX_DUMP_BYTES = 16 * 1024 * 1024
REF_FIELDS = {
    "fullBackupContent": "shop_backup_rules",
    "dataExtractionRules": "shop_data_extraction_rules",
}
RESOURCE_LINE = re.compile(
    r"^\s*resource 0x([0-9a-fA-F]{8}) xml/([A-Za-z0-9_]+)"
    r"(?: (?:PUBLIC|_PRIVATE_))?\s*$"
)
PACKAGE_LINE = re.compile(r"^\s*Package name=([A-Za-z_][A-Za-z0-9_.]*) id=(?:0x)?[0-9a-fA-F]+\s*$")
VALUE_LINE = re.compile(
    r"^\s+\(\) \(file\) (res/xml/[A-Za-z0-9_]+\.xml) type=XML"
    r"(?: src=[^\r\n]+)?\s*$"
)
ELEMENT_LINE = re.compile(r"^( *)E: ([A-Za-z_][A-Za-z0-9_.:-]*) \(line=[0-9]+\)\s*$")
ATTRIBUTE_LINE = re.compile(
    r"^( *)A: http://schemas\.android\.com/apk/res/android:"
    r"(fullBackupContent|dataExtractionRules)\(0x[0-9a-fA-F]{8}\)="
    r"(@[^\s()]+)(?: \(Raw: \"[^\"]*\"\))?\s*$"
)
BOOLEAN_ATTRIBUTE_LINE = re.compile(
    r"^( *)A: http://schemas\.android\.com/apk/res/android:allowBackup"
    r"\(0x[0-9a-fA-F]{8}\)=(true|false)(?: \(Raw: \"[^\"]*\"\))?\s*$"
)


class BackupPolicyError(Exception):
    """A bounded, input-free failure code safe for CI logs."""


def require(condition: bool, code: str) -> None:
    if not condition:
        raise BackupPolicyError(code)


def parse_xml(raw: bytes, code: str) -> ET.Element:
    require(0 < len(raw) <= MAX_XML_BYTES, code)
    try:
        return ET.fromstring(raw)
    except ET.ParseError:
        raise BackupPolicyError(code) from None


def decode_lines(raw: bytes, code: str) -> list[str]:
    require(0 < len(raw) <= MAX_DUMP_BYTES, code)
    try:
        return raw.decode("utf-8").splitlines()
    except UnicodeDecodeError:
        raise BackupPolicyError(code) from None


def compiled_resource_ids(raw: bytes) -> tuple[dict[str, str], str]:
    ids: dict[str, str] = {}
    used: set[str] = set()
    values: dict[str, int] = {}
    selected_package: str | None = None
    current_package: str | None = None
    current_entry: str | None = None
    for line in decode_lines(raw, "shop_backup_compiled_table_invalid"):
        package = PACKAGE_LINE.fullmatch(line)
        if package is not None:
            current_package = package.group(1)
            current_entry = None
            continue
        require("Package name=" not in line, "shop_backup_compiled_table_invalid")
        match = RESOURCE_LINE.fullmatch(line)
        require(
            match is not None
            or not line.lstrip().startswith("resource ")
            or not any("xml/" + name in line for name in REF_FIELDS.values()),
            "shop_backup_compiled_table_invalid",
        )
        if match is None:
            if line.lstrip().startswith("resource ") or line.lstrip().startswith("type "):
                current_entry = None
            elif current_entry is not None and line.lstrip().startswith("("):
                value = VALUE_LINE.fullmatch(line)
                require(
                    value is not None
                    and value.group(1) == f"res/xml/{current_entry}.xml"
                    and values.get(current_entry, 0) == 0,
                    "shop_backup_compiled_table_file_invalid",
                )
                values[current_entry] = 1
            continue
        current_entry = None
        if match.group(2) not in REF_FIELDS.values():
            continue
        resource_id, name = match.group(1).lower(), match.group(2)
        require(
            current_package is not None
            and name not in ids
            and resource_id not in used
            and (selected_package is None or selected_package == current_package),
            "shop_backup_compiled_table_ambiguous",
        )
        selected_package = current_package
        ids[name] = resource_id
        used.add(resource_id)
        current_entry = name
    require(set(ids) == set(REF_FIELDS.values()), "shop_backup_compiled_table_incomplete")
    require(
        all(values.get(name) == 1 for name in REF_FIELDS.values()),
        "shop_backup_compiled_table_file_invalid",
    )
    require(selected_package is not None, "shop_backup_compiled_table_incomplete")
    return ids, selected_package


def compiled_manifest_references(raw: bytes) -> dict[str, str]:
    lines = decode_lines(raw, "shop_backup_compiled_manifest_invalid")
    current_element: str | None = None
    current_indent: int | None = None
    app_count = 0
    refs: dict[str, str] = {}
    for line in lines:
        element = ELEMENT_LINE.fullmatch(line)
        if element is not None:
            current_indent = len(element.group(1))
            current_element = element.group(2)
            if element.group(2) == "application":
                app_count += 1
                require(app_count == 1, "shop_backup_compiled_application_count_invalid")
            continue
        require(
            re.match(r"^\s*E:", line) is None,
            "shop_backup_compiled_manifest_invalid",
        )
        # A malformed line naming a sensitive attribute is not silently ignored.
        if not any(name in line for name in (*REF_FIELDS, "allowBackup")):
            continue
        attribute = ATTRIBUTE_LINE.fullmatch(line)
        boolean = BOOLEAN_ATTRIBUTE_LINE.fullmatch(line)
        require(
            (attribute is None) != (boolean is None),
            "shop_backup_compiled_reference_invalid",
        )
        match = attribute if attribute is not None else boolean
        assert match is not None
        indent = len(match.group(1))
        require(
            current_element == "application"
            and current_indent is not None
            and indent > current_indent,
            "shop_backup_compiled_reference_scope_invalid",
        )
        if boolean is not None:
            field, compiled_value = "allowBackup", boolean.group(2)
        else:
            assert attribute is not None
            field, compiled_value = attribute.group(2), attribute.group(3)
        require(
            field not in refs,
            "shop_backup_compiled_reference_invalid",
        )
        refs[field] = compiled_value
    require(app_count == 1, "shop_backup_compiled_application_count_invalid")
    require(
        set(refs) == set(REF_FIELDS) | {"allowBackup"},
        "shop_backup_compiled_reference_incomplete",
    )
    require(refs["allowBackup"] == "false", "shop_backup_compiled_flag_invalid")
    return refs


def verify_compiled_refs(
    profile: str, xmltree_raw: bytes, table_raw: bytes
) -> tuple[dict[str, str], str]:
    require(profile in APK_NAMES, "shop_backup_profile_invalid")
    table_ids, package = compiled_resource_ids(table_raw)
    manifest_refs = compiled_manifest_references(xmltree_raw)
    require(
        all(
            reference_matches(manifest_refs[field], name, table_ids, package)
            for field, name in REF_FIELDS.items()
        ),
        "shop_backup_compiled_reference_table_mismatch",
    )
    return table_ids, package


def reference_matches(
    value: str | None, name: str, ids: dict[str, str] | None, package: str = ""
) -> bool:
    if value in {"@xml/" + name, f"@{package}:xml/{name}" if package else ""}:
        return True
    if ids is None or name not in ids or value is None:
        return False
    return value.lower() == "@0x" + ids[name]


def check_exclusions(section: ET.Element, code: str) -> None:
    children = list(section)
    expected = {(domain, ".") for domain in DOMAINS}
    observed = {(child.get("domain"), child.get("path")) for child in children}
    require(
        len(children) == len(DOMAINS)
        and all(child.tag == "exclude" for child in children)
        and all(not list(child) for child in children)
        and all(set(child.attrib) == {"domain", "path"} for child in children)
        and observed == expected,
        code,
    )


def verify_decoded(
    profile: str,
    manifest_raw: bytes,
    legacy_raw: bytes,
    modern_raw: bytes,
    compiled_ids: dict[str, str] | None = None,
    resource_package: str = "",
) -> None:
    require(profile in APK_NAMES, "shop_backup_profile_invalid")
    manifest = parse_xml(manifest_raw, "shop_backup_merged_manifest_invalid")
    require(manifest.tag == "manifest", "shop_backup_merged_manifest_invalid")
    require(
        manifest.get("package") == PACKAGE_NAMES[profile],
        "shop_backup_merged_package_mismatch",
    )
    apps = manifest.findall("application")
    require(len(apps) == 1, "shop_backup_merged_application_count_invalid")
    app = apps[0]
    require(
        app.get(ANDROID + "allowBackup") == "false",
        "shop_backup_merged_flag_invalid",
    )
    require(
        reference_matches(
            app.get(ANDROID + "fullBackupContent"),
            "shop_backup_rules",
            compiled_ids,
            resource_package,
        ),
        "shop_backup_merged_legacy_reference_invalid",
    )
    require(
        reference_matches(
            app.get(ANDROID + "dataExtractionRules"),
            "shop_data_extraction_rules",
            compiled_ids,
            resource_package,
        ),
        "shop_backup_merged_modern_reference_invalid",
    )

    legacy = parse_xml(legacy_raw, "shop_backup_compiled_legacy_invalid")
    require(
        legacy.tag == "full-backup-content" and not legacy.attrib,
        "shop_backup_compiled_legacy_invalid",
    )
    check_exclusions(legacy, "shop_backup_compiled_legacy_exclusions_invalid")

    modern = parse_xml(modern_raw, "shop_backup_compiled_modern_invalid")
    require(
        modern.tag == "data-extraction-rules" and not modern.attrib,
        "shop_backup_compiled_modern_invalid",
    )
    sections = list(modern)
    require(
        len(sections) == 2
        and {section.tag for section in sections} == {"cloud-backup", "device-transfer"}
        and all(not section.attrib for section in sections),
        "shop_backup_compiled_modern_modes_invalid",
    )
    for section in sections:
        check_exclusions(section, "shop_backup_compiled_modern_exclusions_invalid")


def analyzer_output(analyzer: Path, args: list[str]) -> bytes:
    try:
        result = subprocess.run(
            [str(analyzer), *args],
            capture_output=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise BackupPolicyError("shop_backup_apkanalyzer_unavailable") from None
    require(result.returncode == 0, "shop_backup_apkanalyzer_failed")
    require(0 < len(result.stdout) <= MAX_XML_BYTES, "shop_backup_apkanalyzer_output_invalid")
    return result.stdout


def aapt2_output(aapt2: Path, args: list[str]) -> bytes:
    try:
        result = subprocess.run(
            [str(aapt2), *args],
            capture_output=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise BackupPolicyError("shop_backup_aapt2_unavailable") from None
    require(result.returncode == 0, "shop_backup_aapt2_failed")
    require(
        0 < len(result.stdout) <= MAX_DUMP_BYTES,
        "shop_backup_aapt2_output_invalid",
    )
    return result.stdout


def verify_apk(profile: str, apk: Path, sdk_root: Path) -> None:
    require(profile in APK_NAMES, "shop_backup_profile_invalid")
    require(apk.name == APK_NAMES[profile] and apk.is_file(), "shop_backup_apk_invalid")
    analyzer = sdk_root / "cmdline-tools/latest/bin/apkanalyzer"
    require(analyzer.is_file() and os.access(analyzer, os.X_OK), "shop_backup_apkanalyzer_unavailable")
    aapt2 = sdk_root / "build-tools/36.0.0/aapt2"
    require(aapt2.is_file() and os.access(aapt2, os.X_OK), "shop_backup_aapt2_unavailable")
    xmltree = aapt2_output(aapt2, ["dump", "xmltree", str(apk), "--file", "AndroidManifest.xml"])
    table = aapt2_output(aapt2, ["dump", "resources", str(apk)])
    compiled_ids, resource_package = verify_compiled_refs(profile, xmltree, table)
    manifest = analyzer_output(analyzer, ["manifest", "print", str(apk)])
    resources = [
        analyzer_output(analyzer, ["resources", "xml", "--file", path, str(apk)])
        for path in RESOURCES
    ]
    verify_decoded(profile, manifest, *resources, compiled_ids, resource_package)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True, choices=tuple(APK_NAMES))
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument("--sdk-root", type=Path)
    args = parser.parse_args()
    sdk = args.sdk_root or Path(os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME") or "")
    try:
        require(str(sdk) not in {"", "."}, "shop_backup_android_sdk_unavailable")
        verify_apk(args.profile, args.apk, sdk)
    except BackupPolicyError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print("shop_android_merged_backup_policy_pass:" + args.profile)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
