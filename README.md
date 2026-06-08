# OpenTivi

Local IPTV client for desktop, Android (TV & phone), iOS, and HarmonyOS (TV & phone). No cloud, no server, everything runs on your machine.

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

All six clients share the same Rust core (`opentivi-core`): SQLite via `rusqlite`,
XMLTV parsing via `quick-xml`, remote fetching via `reqwest`, and a `warp` localhost
stream proxy. They differ in UI framework and how they bind to the core:

| Platform | App framework / UI | Language | Core binding (FFI) | Video playback | DI |
|----------|--------------------|----------|--------------------|----------------|----|
| Desktop | Tauri 2 | React 18 + TypeScript + Vite | Rust direct (Tauri commands) | hls.js + mpegts.js | — |
| Android TV | Jetpack Compose for TV (`androidx.tv`) | Kotlin | UniFFI 0.28 (JNI, `cdylib`) | Media3 ExoPlayer | Hilt |
| Android phone | Jetpack Compose + Material 3 | Kotlin | UniFFI 0.28 (JNI, `cdylib`) | Media3 ExoPlayer (+HLS, FFmpeg decoder) | Hilt |
| iOS | SwiftUI | Swift | UniFFI 0.28 (`staticlib`) | AVPlayer | — |
| HarmonyOS TV | ArkUI / ArkTS | ArkTS | NAPI via `napi-ohos` (`cdylib` `.so`) | AVPlayer + XComponent (SURFACE) | — |
| HarmonyOS phone | ArkUI / ArkTS | ArkTS | NAPI via `napi-derive` (`cdylib` `.so`) | AVPlayer + XComponent (SURFACE) | — |

> Database is SQLite via `rusqlite` (bundled) on every platform — it lives in the shared core, not per-client.

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
│   ├── android-phone/          # Android phone app (Jetpack Compose + Material 3)
│   │   ├── app/                # Kotlin/Compose application module
│   │   │   └── src/main/java/com/opentivi/phone/
│   │   │       ├── ui/         # Compose screens (channels, sources, player, …)
│   │   │       ├── viewmodel/  # ViewModels (StateFlow)
│   │   │       └── player/     # Media3 ExoPlayer wrapper (TiviPlayer)
│   │   └── rust/               # UniFFI bridge crate (Rust → Kotlin JNI)
│   │       └── src/
│   │           ├── lib.rs      # FFI function implementations
│   │           └── opentivi.udl # UniFFI interface definition
│   │
│   ├── ios/                    # iOS app (SwiftUI)
│   │   ├── rust/               # UniFFI bridge crate (Rust → Swift)
│   │   │   └── src/
│   │   │       ├── lib.rs      # FFI function implementations
│   │   │       └── opentivi.udl # UniFFI interface definition
│   │   └── OpenTivi/           # SwiftUI application
│   │       ├── App/            # App entry point
│   │       ├── Views/          # SwiftUI screens & components
│   │       ├── Player/         # AVPlayer wrapper
│   │       └── Generated/      # UniFFI-generated Swift bindings
│   │
│   ├── harmony-tv/             # HarmonyOS TV app (ArkUI / ArkTS)
│   │   ├── entry/src/main/ets/
│   │   │   ├── pages/          # ArkTS pages (Home, Channels, Player, …)
│   │   │   ├── components/     # ArkUI components (ChannelCard, PlayerOverlay, …)
│   │   │   ├── viewmodels/     # ArkTS view models
│   │   │   ├── bridge/         # RustBridge.ets — NAPI binding to libopentivi.so
│   │   │   └── models/         # Shared TS types
│   │   └── rust/               # NAPI bridge crate (napi-ohos → ArkTS, cdylib .so)
│   │       └── lib.rs          # #[napi] function implementations
│   │
│   └── harmony-phone/          # HarmonyOS phone app (ArkUI / ArkTS)
│       ├── entry/src/main/ets/
│       │   ├── pages/          # ArkTS pages (Index, PlayerPage)
│       │   ├── views/          # ArkUI views (PlayerView, …)
│       │   ├── components/     # ArkUI components
│       │   ├── viewmodels/     # ArkTS view models
│       │   ├── bridge/         # RustBridge.ets — NAPI binding to libopentivi.so
│       │   └── models/         # Shared TS types
│       └── rust/               # NAPI bridge crate (napi-derive → ArkTS, cdylib .so)
│           └── lib.rs          # #[napi] function implementations
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

The diagram above shows three representative clients. The remaining three reuse the
same shape against the same `opentivi-core`:

- **Android phone** mirrors Android TV — Compose (Material 3) → ViewModel → UniFFI (JNI) → core, with Media3 ExoPlayer.
- **HarmonyOS TV / phone** bridge through **NAPI** instead of UniFFI: ArkTS pages/components → ViewModel → `RustBridge.ets` → `libopentivi.so` (`napi-ohos` / `napi-derive`) → core, with video rendered via AVPlayer on an XComponent surface.

All Tauri commands return `Result<T, AppError>`. Errors are serialized as `{ kind, message }` to the frontend.

Android/iOS FFI functions use `[Throws=OpenTiviError]` — errors are surfaced through UniFFI; HarmonyOS NAPI functions return `napi::Result`.

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
