#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_JSON_PATH="${ROOT_DIR}/apps/desktop/package.json"
CARGO_TOML_PATH="${ROOT_DIR}/apps/desktop/src-tauri/Cargo.toml"
TAURI_CONF_PATH="${ROOT_DIR}/apps/desktop/src-tauri/tauri.conf.json"

usage() {
  echo "Usage:"
  echo "  scripts/version_manager.sh check"
  echo "  scripts/version_manager.sh current"
  echo "  scripts/version_manager.sh sync --version <semver-or-tag>"
}

normalize_version() {
  local raw="$1"
  local candidate="${raw//[$'\t\r\n ']/}"

  if [[ "${candidate}" == refs/tags/* ]]; then
    candidate="${candidate##*/}"
  fi
  if [[ "${candidate}" == v* ]]; then
    candidate="${candidate#v}"
  fi

  local semver_regex='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
  if [[ ! "${candidate}" =~ ${semver_regex} ]]; then
    echo "Error: Invalid version '${raw}'. Expected SemVer like 1.2.3 or 1.2.3-beta.1." >&2
    return 1
  fi

  echo "${candidate}"
}

read_package_version() {
  awk -F'"' '
    /"version"[[:space:]]*:/ {
      print $4
      exit
    }
  ' "${PACKAGE_JSON_PATH}"
}

read_tauri_version() {
  awk -F'"' '
    /"version"[[:space:]]*:/ {
      print $4
      exit
    }
  ' "${TAURI_CONF_PATH}"
}

read_cargo_version() {
  awk -F'"' '
    /^\[package\]$/ { in_package=1; next }
    /^\[/ && $0 !~ /^\[package\]$/ { in_package=0 }
    in_package && /^[[:space:]]*version[[:space:]]*=/ {
      print $2
      exit
    }
  ' "${CARGO_TOML_PATH}"
}

read_all_versions() {
  PACKAGE_VERSION="$(read_package_version)"
  CARGO_VERSION="$(read_cargo_version)"
  TAURI_VERSION="$(read_tauri_version)"
}

update_json_version() {
  local file_path="$1"
  local version="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v ver="${version}" '
    BEGIN { done=0 }
    {
      if (!done && $0 ~ /"version"[[:space:]]*:[[:space:]]*"/) {
        sub(/"version"[[:space:]]*:[[:space:]]*"[^"]+"/, "\"version\": \"" ver "\"")
        done=1
      }
      print
    }
    END {
      if (!done) {
        exit 2
      }
    }
  ' "${file_path}" > "${tmp_file}"

  mv "${tmp_file}" "${file_path}"
}

update_cargo_version() {
  local version="$1"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v ver="${version}" '
    BEGIN { in_package=0; done=0 }
    {
      if ($0 ~ /^\[package\]$/) {
        in_package=1
        print
        next
      }
      if ($0 ~ /^\[/ && $0 !~ /^\[package\]$/) {
        in_package=0
      }
      if (in_package && !done && $0 ~ /^[[:space:]]*version[[:space:]]*=[[:space:]]*"/) {
        sub(/version[[:space:]]*=[[:space:]]*"[^"]+"/, "version = \"" ver "\"")
        done=1
      }
      print
    }
    END {
      if (!done) {
        exit 2
      }
    }
  ' "${CARGO_TOML_PATH}" > "${tmp_file}"

  mv "${tmp_file}" "${CARGO_TOML_PATH}"
}

check_versions() {
  read_all_versions

  echo "Current versions:"
  echo "- package.json: ${PACKAGE_VERSION}"
  echo "- Cargo.toml: ${CARGO_VERSION}"
  echo "- tauri.conf.json: ${TAURI_VERSION}"

  if [[ "${PACKAGE_VERSION}" != "${CARGO_VERSION}" ]] || [[ "${PACKAGE_VERSION}" != "${TAURI_VERSION}" ]]; then
    echo "Version mismatch detected." >&2
    return 1
  fi

  echo "Version check passed: ${PACKAGE_VERSION}"
}

current_version() {
  read_all_versions
  if [[ "${PACKAGE_VERSION}" != "${CARGO_VERSION}" ]] || [[ "${PACKAGE_VERSION}" != "${TAURI_VERSION}" ]]; then
    echo "Error: Version mismatch detected. Run 'scripts/version_manager.sh check' for details." >&2
    return 1
  fi
  echo "${PACKAGE_VERSION}"
}

sync_versions() {
  local raw_version="$1"
  local target_version
  target_version="$(normalize_version "${raw_version}")"

  update_json_version "${PACKAGE_JSON_PATH}" "${target_version}"
  update_cargo_version "${target_version}"
  update_json_version "${TAURI_CONF_PATH}" "${target_version}"

  echo "Synced version: ${target_version}"
  echo "Updated files:"
  echo "- apps/desktop/package.json"
  echo "- apps/desktop/src-tauri/Cargo.toml"
  echo "- apps/desktop/src-tauri/tauri.conf.json"
}

main() {
  if [[ $# -lt 1 ]]; then
    usage
    return 1
  fi

  local command="$1"
  shift

  case "${command}" in
    check)
      check_versions
      ;;
    current)
      current_version
      ;;
    sync)
      if [[ $# -ne 2 ]] || [[ "$1" != "--version" ]] || [[ -z "$2" ]]; then
        echo "Error: sync requires --version <value>." >&2
        usage
        return 1
      fi
      sync_versions "$2"
      ;;
    *)
      echo "Error: Unknown command '${command}'." >&2
      usage
      return 1
      ;;
  esac
}

main "$@"
