# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

OpenTivi is a Tauri 2 desktop IPTV client with a React/TypeScript frontend (Vite) and a Rust backend. The single app lives at `apps/desktop/`. There is no monorepo workspace — the only `package.json` is `apps/desktop/package.json`.

### Standard commands

See `README.md` for prerequisites and run/build/test instructions. Key commands from repo root:

| Task | Command |
|------|---------|
| Install JS deps | `pnpm -C apps/desktop install --frozen-lockfile` |
| Frontend build (`tsc && vite build`) | `pnpm -C apps/desktop build` |
| Vite dev server (port 1420) | `pnpm -C apps/desktop dev` |
| Full Tauri dev | `cd apps/desktop && pnpm tauri dev` |
| Rust check | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| Rust lint | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` |

### Gotchas

- **pnpm version**: The repo pins `pnpm@9.15.4` via the `packageManager` field in `apps/desktop/package.json`. The update script activates this via `corepack`. Do not upgrade to pnpm 10+.
- **Rust toolchain**: The default Rust toolchain must be `stable` (not a pinned old version). Dependency `time-core` requires `edition2024`, which needs Rust >= 1.85. Run `rustup default stable` if `cargo check` fails with an `edition2024` error.
- **Tauri system deps (Linux)**: Required: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libssl-dev`, `patchelf`. These are installed in the base image.
- **No ESLint/Prettier**: The project has no JS linter config. TypeScript checking is done via `tsc --noEmit` (also runs as part of `pnpm build`).
- **Vite dev server without Tauri**: Running `pnpm -C apps/desktop dev` starts Vite standalone on port 1420. The UI renders but Tauri `invoke()` calls fail with "Cannot read properties of undefined (reading 'invoke')" — this is expected when running outside the Tauri webview.
- **`pnpm -C` flag**: All commands work from `/workspace` using `pnpm -C apps/desktop <script>`, since there's no root `package.json`.

### Testing policy

- **No manual GUI testing or screen recordings.** Verify changes via CLI commands only (`pnpm build`, `tsc --noEmit`, `cargo test`, `cargo clippy`, etc.). Do not launch a browser, use the `computerUse` subagent, or record videos.
