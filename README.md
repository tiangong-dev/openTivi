# OpenTivi

Local IPTV client for desktop. No cloud, no server, everything runs on your machine.

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

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri 2 |
| Frontend | React 18 + TypeScript + Vite |
| Backend | Rust (integrated in src-tauri) |
| Database | SQLite via rusqlite |
| XML parsing | quick-xml |
| HTTP | reqwest |
| Stream proxy | warp |
| Video playback | hls.js + mpegts.js |

## Repository Structure

```
apps/
  desktop/          # Tauri 2 desktop app
    src/            # React frontend
    src-tauri/      # Rust backend
      src/
        commands/   # Tauri command handlers (API boundary)
        core/       # Business logic, parsers, models
        platform/   # DB, filesystem, HTTP, stream proxy
      migrations/   # SQLite migration scripts
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) ≥ 8
- Platform dependencies for Tauri: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Run

```bash
cd apps/desktop
pnpm install
pnpm tauri dev
```

Or from repository root:

```bash
make install
make dev
```

### Build

```bash
cd apps/desktop
pnpm tauri build
```

Or from repository root:

```bash
make build
```

### Test (Rust)

```bash
cd apps/desktop/src-tauri
cargo test
```

Or from repository root:

```bash
make rust-test
```

## Versioning and Release

- `make version-check` checks version consistency across:
  - `apps/desktop/package.json`
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/tauri.conf.json`
- `make version-sync VERSION=x.y.z` updates these three files together.
- Tag push (`v*.*.*`) triggers GitHub Action release build and publishes artifacts to GitHub Release.
- `workflow_dispatch` on `Desktop Release Build` can build manual test versions (optionally as prerelease).
- `workflow_dispatch` on `Version Check and Update` can sync version files and auto-commit updates.

## Architecture

```
Frontend (React)
    │  invoke()
    ▼
commands/        ← Tauri boundary: DTOs, validation
    │
    ▼
core/            ← Business logic
  ├── parsers/   ← M3U, Xtream, XMLTV parsing
  ├── models/    ← Domain types
  └── services/  ← Orchestration
    │
    ▼
platform/        ← Infrastructure
  ├── db/        ← SQLite connection, migrations, repositories
  ├── http/      ← Remote content fetching
  ├── fs/        ← File system paths
  └── proxy/     ← Local HTTP proxy for CORS-free streaming
```

All Tauri commands return `Result<T, AppError>`. Errors are serialized as `{ kind, message }` to the frontend.

## Not in Scope (v0.1)

Recording, timeshift, catch-up, multi-view, DRM, VOD/Series, user accounts, cloud sync.

## License

MIT
