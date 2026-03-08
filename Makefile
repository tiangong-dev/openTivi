SHELL := /bin/bash

APP_DIR := apps/desktop
TAURI_DIR := $(APP_DIR)/src-tauri
VERSION_SCRIPT := scripts/version_manager.py

.PHONY: help install dev build web-build desktop-build rust-test version-check version-sync test-build

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
	python3 $(VERSION_SCRIPT) check

version-sync:
	@if [ -z "$(VERSION)" ]; then \
		echo "VERSION is required. Example: make version-sync VERSION=0.1.1"; \
		exit 1; \
	fi
	python3 $(VERSION_SCRIPT) sync --version "$(VERSION)"
	python3 $(VERSION_SCRIPT) check

test-build:
	@if [ -z "$(VERSION)" ]; then \
		echo "VERSION is required. Example: make test-build VERSION=0.1.1-beta.1"; \
		exit 1; \
	fi
	$(MAKE) version-sync VERSION="$(VERSION)"
	$(MAKE) desktop-build
