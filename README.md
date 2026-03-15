# OpenTivi

Local IPTV client for desktop, Android TV, and iOS. No cloud, no server, everything runs on your machine.

## Features (v0.1)

- **M3U import** — load channels from local files or remote URLs
- **Xtream Codes import** — connect to Xtream Codes API servers
- **XMLTV EPG import** — load electronic program guide data
- **Channel browsing** — list, search, filter by group
- **Favorites** — star channels for quick access
- **Recent history** — track recently watched channels
- **Local playback** — HLS / MPEG-TS stream playback via built-in proxy
- **Settings** — local key-value preferences

## Tech Stack

| Layer | Desktop | Android TV | iOS |
|-------|---------|------------|-----|
| App framework | Tauri 2 | Jetpack Compose for TV | SwiftUI |
| Frontend | React 18 + TypeScript + Vite | Kotlin + Compose (`androidx.tv`) | Swift + SwiftUI |
| Backend | Rust (`opentivi-core` crate) | Rust (`opentivi-core` via UniFFI) | Rust (`opentivi-core` via UniFFI) |
| Database | SQLite via rusqlite | SQLite via rusqlite | SQLite via rusqlite |
| XML parsing | quick-xml | quick-xml (shared) | quick-xml (shared) |
| HTTP | reqwest | reqwest (shared) | reqwest (shared) |
| Stream proxy | warp (localhost) | warp (localhost) | warp (localhost) |
| Video playback | hls.js + mpegts.js | Media3 ExoPlayer | AVPlayer |
| DI | — | Hilt | — |

## Repository Structure

```
opentivi/
├── apps/
│   ├── desktop/                # Tauri 2 desktop app
│   │   ├── src/                # React frontend
│   │   └── src-tauri/
│   │       └── src/
│   │           ├── commands/   # Tauri command handlers (API boundary)
│   │           ├── state.rs    # App state, init, proxy & service startup
│   │           └── lib.rs      # Re-exports opentivi-core modules
│   │
│   ├── android-tv/             # Android TV app (Jetpack Compose)
│   │   ├── app/                # Kotlin/Compose application module
│   │   │   └── src/main/java/com/opentivi/tv/
│   │   │       ├── ui/         # Compose screens & components
│   │   │       ├── viewmodel/  # ViewModels (StateFlow)
│   │   │       └── player/     # Media3 ExoPlayer wrapper
│   │   └── rust/               # UniFFI bridge crate (Rust → Kotlin JNI)
│   │       └── src/
│   │           ├── lib.rs      # FFI function implementations
│   │           └── opentivi.udl # UniFFI interface definition
│   │
│   └── ios/                    # iOS app (SwiftUI)
│       ├── rust/               # UniFFI bridge crate (Rust → Swift)
│       │   └── src/
│       │       ├── lib.rs      # FFI function implementations
│       │       └── opentivi.udl # UniFFI interface definition
│       └── OpenTivi/           # SwiftUI application
│           ├── App/            # App entry point
│           ├── Views/          # SwiftUI screens & components
│           ├── Player/         # AVPlayer wrapper
│           └── Generated/      # UniFFI-generated Swift bindings
│
├── crates/
│   └── opentivi-core/          # Shared Rust business logic & infrastructure
│       ├── src/
│       │   ├── dto.rs          # Shared DTOs (input/output types)
│       │   ├── error.rs        # AppError, AppResult
│       │   ├── core/           # Business logic
│       │   │   ├── models/     # Domain types (Channel, Source, EPG)
│       │   │   ├── parsers/    # M3U, Xtream, XMLTV parsers
│       │   │   └── services/   # Service orchestration
│       │   └── platform/       # Infrastructure
│       │       ├── db/         # SQLite connection, migrations, repositories
│       │       ├── fs/         # File system paths (multi-platform)
│       │       ├── http/       # Remote content fetching
│       │       └── proxy.rs    # Local HTTP proxy for streaming
│       └── migrations/         # SQLite migration scripts
│
├── shared/
│   └── locales/                # i18n resources (en-US, zh-CN)
├── docs/                       # Architecture & design docs
├── scripts/                    # Version management scripts
└── Makefile
```

## Architecture

```
┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  Desktop (Tauri 2)  │  │ Android TV (Compose) │  │     iOS (SwiftUI)    │
│                     │  │                      │  │                      │
│ React ─invoke()──►  │  │ Compose ─►ViewModel─►│  │ SwiftUI ─►ViewModel─►│
│           commands/ │  │           UniFFI JNI  │  │           UniFFI FFI │
│             │       │  │             │         │  │             │        │
│ hls.js/     │       │  │ ExoPlayer   │         │  │ AVPlayer    │        │
│ mpegts.js   │       │  │    │        │         │  │    │        │        │
└──────┼──────┼───────┘  └────┼────────┼─────────┘  └────┼────────┼────────┘
       │      │               │        │                  │        │
       │      ▼               │        ▼                  │        ▼
       │  ┌───────────────────┼────────────────────────────┼──────────────┐
       │  │            opentivi-core (shared Rust crate)   │              │
       │  │                                                              │
       │  │  dto.rs  ← Shared input/output types                        │
       │  │  error.rs ← AppError / AppResult                            │
       │  │                                                              │
       │  │  core/                                                       │
       │  │  ├── models/   ← Channel, Source, EPG                       │
       │  │  ├── parsers/  ← M3U, Xtream, XMLTV                        │
       │  │  └── services/ ← Business orchestration                     │
       │  │                                                              │
       │  │  platform/                                                   │
       │  │  ├── db/       ← SQLite + repositories                      │
       │  │  ├── http/     ← Remote fetching                            │
       │  │  ├── fs/       ← Path resolution (per-OS)                   │
       │  │  └── proxy     ← 127.0.0.1 stream proxy ◄──────────────────┤── stream traffic
       │  │                                                              │
       │  └──────────────────────────────────────────────────────────────┘
       │                         ▲
       └─────────────────────────┘
         stream traffic
```

All Tauri commands return `Result<T, AppError>`. Errors are serialized as `{ kind, message }` to the frontend.

Android FFI functions use `[Throws=string]` — all errors are serialized to plain strings via UniFFI.

## Getting Started

### Desktop

#### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) ≥ 8
- Platform dependencies for Tauri: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

#### Run

```bash
make install
make dev
```

#### Build

```bash
make build
```

#### Test (Rust)

```bash
make core-test     # Shared crate (41 tests)
make rust-test     # Desktop-specific tests
```

### Android TV

#### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Android SDK](https://developer.android.com/studio) (compileSdk 35)
- [Android NDK](https://developer.android.com/ndk) (for Rust cross-compilation)
- [cargo-ndk](https://github.com/nickel-org/cargo-ndk) — `cargo install cargo-ndk`
- Rust Android targets:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
  ```

#### Build

```bash
make android-build          # Compile Rust + build release APK
```

#### Run (connected device/emulator)

```bash
make android-dev            # Install debug APK
```

### iOS

#### Prerequisites

- Xcode 15+ with iOS 16 SDK
- [Rust](https://rustup.rs/) (stable)
- Rust iOS targets:
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim
  ```

#### Build Rust library + Swift bindings

```bash
make ios-rust-build
make ios-uniffi
```

Then open `apps/ios/OpenTivi/` in Xcode, add the generated `.a` library and Swift bindings, and build.

## Versioning and Release

- `make version-check` checks version consistency across:
  - `apps/desktop/package.json`
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/tauri.conf.json`
- `make version-sync VERSION=x.y.z` updates these three files together.
- Tag push (`v*.*.*`) triggers GitHub Action release build and publishes artifacts to GitHub Release.
- `workflow_dispatch` on `Desktop Release Build` can build manual test versions (optionally as prerelease).
- `workflow_dispatch` on `Version Check and Update` can sync version files and auto-commit updates.
- App settings page includes built-in update check, which compares current app version with latest GitHub Release and provides download link.

## Not in Scope (v0.1)

Recording, timeshift, catch-up, multi-view, DRM, VOD/Series, user accounts, cloud sync.

## License

MIT
