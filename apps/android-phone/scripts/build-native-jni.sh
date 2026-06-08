#!/usr/bin/env bash
# Build libopentivi_android_phone.so for all Android ABIs into app/src/main/jniLibs.
# Prerequisites: Android NDK (ANDROID_NDK_HOME), Rust targets, cargo-ndk:
#   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
#   cargo install cargo-ndk
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHONE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUST_DIR="$PHONE_ROOT/rust"
OUT="$PHONE_ROOT/app/src/main/jniLibs"

if [[ -z "${ANDROID_NDK_HOME:-}" ]]; then
  echo "ANDROID_NDK_HOME is not set. Install the Android NDK and export ANDROID_NDK_HOME." >&2
  exit 1
fi

mkdir -p "$OUT"
cd "$RUST_DIR"
cargo ndk \
  -t arm64-v8a \
  -t armeabi-v7a \
  -t x86 \
  -t x86_64 \
  -o "$OUT" \
  build --release

echo "Native libs written to $OUT"
