from __future__ import annotations

import argparse
import subprocess
import tarfile
from pathlib import Path, PurePosixPath


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = Path("/tmp/supermega-platform-preview.tgz")
DEFAULT_PATHS = [
    "api_app.py",
    "package.json",
    "requirements.txt",
    "vercel.json",
    ".vercelignore",
    "config.example.json",
    "tools",
    "mark1_pilot",
    "showroom",
    "pilot-data",
    "data",
    "Super Mega Inc/sales",
    "Super Mega Inc/runbooks",
]
EXCLUDED_PARTS = {"node_modules", ".git", ".venv-linux", "venv", "__pycache__", "dist"}
EXCLUDED_GLOBS = {
    "showroom/public/site/*.png",
    "showroom/public/site/shots/*",
    "tools/run_local_*.sh",
    "tools/run_local_*.ps1",
    "tools/smoke_test_*.py",
}


def _collect_files(paths: list[str]) -> list[str]:
    command = ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", *paths]
    output = subprocess.check_output(command, cwd=REPO_ROOT, text=True)
    files: list[str] = []
    for line in output.splitlines():
        pure_path = PurePosixPath(line)
        if any(part in EXCLUDED_PARTS for part in pure_path.parts):
            continue
        if any(pure_path.match(pattern) for pattern in EXCLUDED_GLOBS):
            continue
        files.append(line)
    return files


def _write_bundle(output_path: Path, files: list[str]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()
    with tarfile.open(output_path, "w:gz") as archive:
        for relative_path in files:
            archive.add(REPO_ROOT / relative_path, arcname=relative_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a curated preview deployment bundle.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Path to the output .tgz bundle.")
    args = parser.parse_args()

    output_path = Path(args.output).expanduser().resolve()
    files = _collect_files(DEFAULT_PATHS)
    if not files:
        raise SystemExit("No files matched the preview bundle manifest.")

    _write_bundle(output_path, files)
    print(output_path)
    print(f"files={len(files)}")
    print(f"bytes={output_path.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
