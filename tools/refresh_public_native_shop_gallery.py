"""Pin the public Shop gallery to one exact Flutter CI capture artifact."""

import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
GALLERY = ROOT / "tools/public-assets/native-shop"
MANIFEST = GALLERY / "manifest.json"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Original GitHub Actions artifact ZIP")
    parser.add_argument("--run", type=int, required=True)
    parser.add_argument("--artifact", type=int, required=True)
    parser.add_argument("--head", required=True, help="Exact workflow_dispatch source commit")
    args = parser.parse_args()

    head = args.head.lower()
    if git("rev-parse", "HEAD") != head:
        raise SystemExit("checkout HEAD differs from the capture source commit")
    native_tree = git("rev-parse", "HEAD:mobile/shop_pos")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    archive = args.archive.read_bytes()
    members = {}
    with zipfile.ZipFile(args.archive) as zipped:
        for asset in manifest["assets"]:
            name = asset["file"]
            if name not in zipped.namelist():
                raise SystemExit(f"missing gallery capture in artifact: {name}")
            data = zipped.read(name)
            width, height = int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
            if not data.startswith(PNG_SIGNATURE) or (width, height) != (asset["width"], asset["height"]):
                raise SystemExit(f"invalid PNG or dimensions: {name}")
            members[name] = data

    for asset in manifest["assets"]:
        name = asset["file"]
        (GALLERY / name).write_bytes(members[name])
        asset["sha256"] = digest(members[name])
    manifest.update(
        sourceHead=head,
        ciMergeCommit=head,
        nativeTree=native_tree,
        workflowRun=args.run,
        artifactId=args.artifact,
        artifactName=f"supermega-shop-flutter-renders-{head}",
        artifactArchiveSha256=digest(archive),
    )
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Pinned {len(members)} gallery captures to {head} / run {args.run} / artifact {args.artifact}")


if __name__ == "__main__":
    main()
