#!/bin/sh
set -eu

export PATH="$HOME/.cargo/bin:$PATH"

if [ -n "${PROJECT_DIR:-}" ] && [ -d "${PROJECT_DIR}/../rust" ]; then
  IOS_PROJECT_DIR="$PROJECT_DIR"
  SCRIPT_DIR="${PROJECT_DIR}/../rust"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  IOS_PROJECT_DIR="$SCRIPT_DIR/../OpenTivi"
fi

BRIDGE_SWIFT="$IOS_PROJECT_DIR/OpenTivi/Bridge/opentivi.swift"
ARTIFACT_DIR="$IOS_PROJECT_DIR/RustGenerated/${CONFIGURATION}${EFFECTIVE_PLATFORM_NAME}"

cd "$SCRIPT_DIR"

case "${SDK_NAME:-}" in
  iphoneos*)
    TARGET_TRIPLE="aarch64-apple-ios"
    ;;
  iphonesimulator*)
    TARGET_TRIPLE="aarch64-apple-ios-sim"
    ;;
  *)
    echo "Unsupported SDK_NAME: ${SDK_NAME:-unknown}" >&2
    exit 1
    ;;
esac

PROFILE_DIR="debug"
BUILD_FLAGS=""
if [ "${CONFIGURATION:-Debug}" = "Release" ]; then
  PROFILE_DIR="release"
  BUILD_FLAGS="--release"
fi

mkdir -p "$ARTIFACT_DIR"

cargo build --manifest-path "$SCRIPT_DIR/Cargo.toml" --target "$TARGET_TRIPLE" $BUILD_FLAGS

LIB_SRC="$SCRIPT_DIR/target/$TARGET_TRIPLE/$PROFILE_DIR/libopentivi_ios.a"
cp "$LIB_SRC" "$ARTIFACT_DIR/libopentivi_ios.a"

cargo run --manifest-path "$SCRIPT_DIR/Cargo.toml" --bin uniffi-bindgen generate \
  --library \
  --crate opentivi_ios \
  --language swift \
  --no-format \
  --out-dir "$ARTIFACT_DIR" \
  "$ARTIFACT_DIR/libopentivi_ios.a"

cp "$ARTIFACT_DIR/opentiviFFI.modulemap" "$ARTIFACT_DIR/module.modulemap"
cp "$ARTIFACT_DIR/opentivi.swift" "$BRIDGE_SWIFT"
