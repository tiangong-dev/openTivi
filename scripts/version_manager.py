#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_JSON_PATH = ROOT / "apps" / "desktop" / "package.json"
CARGO_TOML_PATH = ROOT / "apps" / "desktop" / "src-tauri" / "Cargo.toml"
TAURI_CONF_PATH = ROOT / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"

SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def normalize_version(raw_version: str) -> str:
    candidate = raw_version.strip()
    if candidate.startswith("refs/tags/"):
        candidate = candidate.rsplit("/", 1)[-1]
    if candidate.startswith("v"):
        candidate = candidate[1:]
    if not SEMVER_PATTERN.match(candidate):
        raise ValueError(
            f"Invalid version '{raw_version}'. Expected SemVer like 1.2.3 or 1.2.3-beta.1."
        )
    return candidate


def read_package_version() -> str:
    data = json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
    version = data.get("version")
    if not isinstance(version, str):
        raise ValueError(f"Missing 'version' in {PACKAGE_JSON_PATH}")
    return version


def read_tauri_version() -> str:
    data = json.loads(TAURI_CONF_PATH.read_text(encoding="utf-8"))
    version = data.get("version")
    if not isinstance(version, str):
        raise ValueError(f"Missing 'version' in {TAURI_CONF_PATH}")
    return version


def read_cargo_version() -> str:
    in_package_section = False
    for line in CARGO_TOML_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            in_package_section = stripped == "[package]"
            continue
        if in_package_section:
            match = re.match(r'version\s*=\s*"([^"]+)"\s*$', stripped)
            if match:
                return match.group(1)
    raise ValueError(f"Missing package version in {CARGO_TOML_PATH}")


def read_versions() -> dict[str, str]:
    return {
        "package.json": read_package_version(),
        "Cargo.toml": read_cargo_version(),
        "tauri.conf.json": read_tauri_version(),
    }


def write_package_version(version: str) -> bool:
    data = json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
    if data.get("version") == version:
        return False
    data["version"] = version
    PACKAGE_JSON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return True


def write_tauri_version(version: str) -> bool:
    data = json.loads(TAURI_CONF_PATH.read_text(encoding="utf-8"))
    if data.get("version") == version:
        return False
    data["version"] = version
    TAURI_CONF_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return True


def write_cargo_version(version: str) -> bool:
    lines = CARGO_TOML_PATH.read_text(encoding="utf-8").splitlines()
    in_package_section = False
    changed = False
    updated_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            in_package_section = stripped == "[package]"
            updated_lines.append(line)
            continue

        if in_package_section and re.match(r'version\s*=\s*"[^"]+"\s*$', stripped):
            new_line = f'version = "{version}"'
            updated_lines.append(new_line)
            changed = changed or (line != new_line)
            in_package_section = False
            continue

        updated_lines.append(line)

    if not changed:
        return False

    CARGO_TOML_PATH.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
    return True


def check_versions() -> int:
    versions = read_versions()
    print("Current versions:")
    for key, value in versions.items():
        print(f"- {key}: {value}")

    unique_versions = set(versions.values())
    if len(unique_versions) != 1:
        print("Version mismatch detected.", file=sys.stderr)
        return 1

    print(f"Version check passed: {next(iter(unique_versions))}")
    return 0


def sync_versions(raw_version: str) -> int:
    target_version = normalize_version(raw_version)
    changed_files: list[str] = []

    if write_package_version(target_version):
        changed_files.append(str(PACKAGE_JSON_PATH.relative_to(ROOT)))
    if write_cargo_version(target_version):
        changed_files.append(str(CARGO_TOML_PATH.relative_to(ROOT)))
    if write_tauri_version(target_version):
        changed_files.append(str(TAURI_CONF_PATH.relative_to(ROOT)))

    print(f"Synced version: {target_version}")
    if changed_files:
        print("Updated files:")
        for file_path in changed_files:
            print(f"- {file_path}")
    else:
        print("No file changes were required.")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage desktop app versions.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("check", help="Check if all app versions are in sync.")

    sync_parser = subparsers.add_parser("sync", help="Sync all app versions.")
    sync_parser.add_argument("--version", required=True, help="SemVer value or tag name.")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.command == "check":
            return check_versions()
        if args.command == "sync":
            return sync_versions(args.version)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
