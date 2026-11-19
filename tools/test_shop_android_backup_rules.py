"""Source contract for Shop's Android platform backup exclusions.

This parses authored XML. Merged APK resources and device transfer behavior
require separate pinned-toolchain and installed checks.
"""

import argparse
from pathlib import Path
import xml.etree.ElementTree as ET


ANDROID = "{http://schemas.android.com/apk/res/android}"
DOMAINS = {
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
APP = Path("mobile/shop_pos/android/app/src")


def require(condition: bool, code: str) -> None:
    if not condition:
        raise SystemExit(code)


def application(manifest: Path) -> ET.Element:
    root = ET.parse(manifest).getroot()
    require(root.tag == "manifest", "shop_backup_manifest_root_invalid")
    apps = root.findall("application")
    require(len(apps) == 1, "shop_backup_application_count_invalid")
    return apps[0]


def excluded_domains(section: ET.Element, code: str) -> None:
    children = list(section)
    require(all(child.tag == "exclude" for child in children), code)
    observed = {(child.get("domain"), child.get("path")) for child in children}
    expected = {(domain, ".") for domain in DOMAINS}
    require(len(children) == len(DOMAINS) and observed == expected, code)
    require(
        all(set(child.attrib) == {"domain", "path"} for child in children),
        code,
    )


def verify(source_root: Path) -> None:
    main = APP / "main"
    app = application(source_root / main / "AndroidManifest.xml")
    require(app.get(ANDROID + "allowBackup") == "false", "shop_backup_flag_missing")
    require(
        app.get(ANDROID + "fullBackupContent") == "@xml/shop_backup_rules",
        "shop_backup_legacy_rules_missing",
    )
    require(
        app.get(ANDROID + "dataExtractionRules")
        == "@xml/shop_data_extraction_rules",
        "shop_backup_modern_rules_missing",
    )

    for flavor in ("production", "qa"):
        overlay = application(source_root / APP / flavor / "AndroidManifest.xml")
        require(
            all(
                ANDROID + field not in overlay.attrib
                for field in ("allowBackup", "fullBackupContent", "dataExtractionRules")
            ),
            "shop_backup_flavor_override_forbidden",
        )

    legacy = ET.parse(source_root / main / "res/xml/shop_backup_rules.xml").getroot()
    require(legacy.tag == "full-backup-content", "shop_backup_legacy_root_invalid")
    excluded_domains(legacy, "shop_backup_legacy_exclusions_incomplete")

    modern = ET.parse(
        source_root / main / "res/xml/shop_data_extraction_rules.xml"
    ).getroot()
    require(modern.tag == "data-extraction-rules", "shop_backup_modern_root_invalid")
    sections = list(modern)
    require(
        len(sections) == 2
        and {section.tag for section in sections} == {"cloud-backup", "device-transfer"},
        "shop_backup_modern_modes_incomplete",
    )
    for section in sections:
        require(not section.attrib, "shop_backup_modern_mode_attributes_unreviewed")
        excluded_domains(section, "shop_backup_modern_exclusions_incomplete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    verify(args.source_root)
    print("shop_android_backup_source_policy_pass")
