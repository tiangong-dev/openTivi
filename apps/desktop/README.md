# OpenTivi Desktop

Tauri 2 desktop client for OpenTivi — a local IPTV player.

## Development

```bash
pnpm install
pnpm tauri dev
```

## Project Layout

```
src/                    # React frontend
  app/AppShell.tsx      # Main shell with sidebar navigation
  features/
    sources/            # M3U / Xtream / XMLTV import UI
    channels/           # Channel list with search & group filter
    player/             # Video player (hls.js + mpegts.js)
  lib/
    tauri.ts            # invoke() wrapper
    errors.ts           # Error type helpers
  types/api.ts          # TypeScript types matching Rust DTOs

src-tauri/              # Rust backend
  src/
    commands/           # Tauri commands (API surface)
      dto.rs            # Request/response structs
      sources.rs        # import_m3u, import_xtream, import_xmltv, etc.
      channels.rs       # list_channels, list_groups, get_channel_epg
      favorites.rs      # list_favorites, set_favorite
      recents.rs        # list_recents, mark_recent_watched
      settings.rs       # get_settings, set_setting
      playback.rs       # resolve_playback
      health.rs         # health, get_proxy_port
    core/
      models/           # Source, Channel, EpgProgram, Setting
      parsers/          # M3U, Xtream JSON, XMLTV parsers
      services/         # Business logic orchestration
    platform/
      db/               # SQLite: connection, migrations, repositories
      http/             # reqwest-based HTTP client
      fs/               # App data directory paths
      proxy/            # Local warp HTTP proxy for stream CORS bypass
    error.rs            # AppError enum with From impls
    state.rs            # AppState (DB + proxy port)
  migrations/           # SQL migration files
  tauri.conf.json       # Tauri app configuration
```

## Tauri Commands

| Command | Description |
|---------|-------------|
| `health` | Health check |
| `get_proxy_port` | Get local stream proxy port |
| `list_sources` | List all imported sources |
| `import_m3u` | Import M3U playlist |
| `import_xtream` | Import Xtream Codes live streams |
| `import_xmltv` | Import XMLTV EPG data |
| `refresh_source` | Re-import a source |
| `delete_source` | Delete a source and its channels |
| `list_channels` | List channels with filters |
| `list_groups` | List distinct channel groups |
| `get_channel_epg` | Get EPG for a channel |
| `list_favorites` | List favorite channels |
| `set_favorite` | Add/remove favorite |
| `list_recents` | List recently watched |
| `mark_recent_watched` | Record a watch event |
| `get_settings` | Get all settings |
| `set_setting` | Create/update a setting |
| `resolve_playback` | Get stream URL for playback |

## Stream Proxy

IPTV servers typically don't set CORS headers. A local warp HTTP proxy starts on a random port at app launch. The frontend routes all stream URLs through `http://127.0.0.1:{port}/stream?url=<encoded>`. For HLS playlists, the proxy rewrites internal URLs to also go through the proxy.

## Database

SQLite with WAL mode, stored in the OS app data directory. Tables:

- `sources` — M3U / Xtream / XMLTV sources
- `channels` — parsed channels with stable `channel_key` for upserts
- `epg_programs` — EPG programme entries
- `favorites` — favorited channel IDs
- `recents` — watch history with play count
- `settings` — key-value app preferences

## Testing

```bash
cd src-tauri
cargo test
```
