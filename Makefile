SHELL := /bin/bash

APP_DIR := apps/desktop
TAURI_DIR := $(APP_DIR)/src-tauri
VERSION_SCRIPT := scripts/version_manager.sh

.PHONY: help install dev build web-build desktop-build rust-test version-check version-sync test-build \
	core-check core-test android-rust-build android-build android-dev android-clean \
	ios-rust-build-device ios-rust-build-sim ios-rust-build ios-uniffi ios-clean

help:
	@echo "Available targets:"
	@echo "  make install                    # Install frontend dependencies"
	@echo "  make dev                        # Start Tauri dev mode"
	@echo "  make build                      # Build desktop app"
	@echo "  make web-build                  # Build frontend assets only"
	@echo "  make rust-test                  # Run Rust tests"
	@echo "  make version-check              # Check version consistency"
	@echo "  make version-sync VERSION=x.y.z # Sync all version files"
	@echo "  make test-build VERSION=x.y.z   # Sync version and build test package"
	@echo ""
	@echo "  make core-check                 # Check opentivi-core crate"
	@echo "  make core-test                  # Run opentivi-core tests"
	@echo "  make android-rust-build         # Build Rust libs for Android"
	@echo "  make android-build              # Build Android TV APK (release)"
	@echo "  make android-dev                # Install debug APK to device/emulator"
	@echo "  make android-clean              # Clean Android TV build artifacts"
	@echo ""
	@echo "  make ios-rust-build             # Build Rust libs for iOS (device + sim)"
	@echo "  make ios-uniffi                 # Generate Swift bindings from UniFFI"
	@echo "  make ios-clean                  # Clean iOS Rust build artifacts"

install:
	pnpm --dir $(APP_DIR) install

dev:
	pnpm --dir $(APP_DIR) tauri dev

build: desktop-build

web-build:
	pnpm --dir $(APP_DIR) build

desktop-build:
	pnpm --dir $(APP_DIR) tauri build

rust-test:
	cargo test --manifest-path $(TAURI_DIR)/Cargo.toml

version-check:
	bash $(VERSION_SCRIPT) check

version-sync:
	@if [ -z "$(VERSION)" ]; then \
		echo "VERSION is required. Example: make version-sync VERSION=0.1.1"; \
		exit 1; \
	fi
	bash $(VERSION_SCRIPT) sync --version "$(VERSION)"
	bash $(VERSION_SCRIPT) check

test-build:
	@if [ -z "$(VERSION)" ]; then \
		echo "VERSION is required. Example: make test-build VERSION=0.1.1-beta.1"; \
		exit 1; \
	fi
	$(MAKE) version-sync VERSION="$(VERSION)"
	$(MAKE) desktop-build

# --- Android TV ---

ANDROID_TV_DIR := apps/android-tv
ANDROID_RUST_DIR := $(ANDROID_TV_DIR)/rust
CORE_CRATE_DIR := crates/opentivi-core

core-check:
	cargo check --manifest-path $(CORE_CRATE_DIR)/Cargo.toml

core-test:
	cargo test --manifest-path $(CORE_CRATE_DIR)/Cargo.toml

android-rust-build:
	cd $(ANDROID_RUST_DIR) && cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o ../app/src/main/jniLibs build --release

android-build: android-rust-build
	cd $(ANDROID_TV_DIR) && ./gradlew assembleRelease

android-dev:
	cd $(ANDROID_TV_DIR) && ./gradlew installDebug

android-clean:
	cd $(ANDROID_TV_DIR) && ./gradlew clean
	cd $(ANDROID_RUST_DIR) && cargo clean

# --- iOS ---

IOS_DIR := apps/ios
IOS_RUST_DIR := $(IOS_DIR)/rust

ios-rust-build-device:
	cd $(IOS_RUST_DIR) && cargo build --release --target aarch64-apple-ios

ios-rust-build-sim:
	cd $(IOS_RUST_DIR) && cargo build --release --target aarch64-apple-ios-sim

ios-rust-build: ios-rust-build-device ios-rust-build-sim

ios-uniffi:
	cd $(IOS_RUST_DIR) && cargo run --bin uniffi-bindgen -- generate --library target/aarch64-apple-ios/release/libopentivi_ios.a --language swift --out-dir ../OpenTivi/Generated

ios-clean:
	cd $(IOS_RUST_DIR) && cargo clean
