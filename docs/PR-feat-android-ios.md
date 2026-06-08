# feat: 数据地基重构 + 多端播放决策层 + iOS 选项2 播放器 + 备份/提醒

## 概述

本分支 `feat-android-ios` 基于既有的多端架构（Android TV / Android Phone / iOS / Harmony TV / Harmony Phone / Desktop 六端共享 `opentivi-core`），完成三件事：

1. **数据地基补齐**：把 OpenTivi 的核心数据模型补齐到成熟 IPTV 客户端水准 —— EPG UTC epoch、频道软删除墓碑、多对多频道分组、catchup/回看字段、FTS5 全文搜索、按频道 HTTP 头。
2. **打通播放决策 / 代理层**：在 core 扩展 `PlaybackSourceDto`，解析频道级 UA/Referer，并让本地代理按频道注入并以 header 感知的 cache key 转发；播放信息字段经 FFI 暴露到全部 5 个移动/Harmony 桥。
3. **iOS 选项2 播放器 + 跨端备份/提醒管线**：iOS 接入 core 代理、UniFFI 绑定，落地 AVPlayer-primary + VLCKit 回退的播放器；core 落地 SQLite VACUUM INTO + zip 的备份/恢复与 EPG 节目提醒，并经 desktop Tauri command 与 5 个移动/Harmony FFI 桥暴露。

## 提交分组（相对 main，共 43 commit）

### P0 数据地基（迁移 0010–0014）
- `ee96711` feat(epg): UTC epoch 列，dual-write + 幂等 backfill（0010）
- `591ed53` feat(channels): 稳定身份的软删除墓碑（P0b，0011）
- `c4bfdf3` feat(channels): 经 `channel_group_links` 的多对多频道分组（0012）
- `f208d34` feat(catchup): 频道与源上解析/存储 catchup 字段（0013）
- `5151902` feat(search): 频道与 EPG 标题的 FTS5 trigram 搜索（P0e，0014）

### P0f 播放决策（core / FFI / proxy，迁移 0015）
- `1fd66f2` feat(playback): 扩展 `PlaybackSourceDto`，解析频道 UA/referer（0015）
- `822983e` feat(ffi): 扩展 `PlaybackInfo` 字段暴露到 5 个平台桥
- `5cd8886` chore(ios): 重新生成 UniFFI Swift 绑定
- `9810076` feat(proxy): 按频道转发 UA/Referer，header 感知 cache key

### iOS 选项2（接代理 / 绑定 / 播放器）
- `fe15285` feat(ios): `init_engine` 中启动 core proxy 并导出 `get_proxy_port`
- `32d3d32` feat(ios): AVPlayer-primary 播放 + VLCKit 回退（选项2）

### P1 备份 / 提醒（迁移 0016）
- `92b0a9f` feat(backup): SQLite VACUUM INTO 快照 + zip 备份/恢复（core）
- `749bcd8` feat(reminders): `epg_reminders` 表 + repo/service 节目提醒（0016）

### desktop commands
- `f76544e` feat(desktop): backup + reminders 暴露为 Tauri command

### mobile FFI
- `46aa74c` feat(ffi): backup + reminders 暴露到全部 5 个移动/Harmony 桥

### docs / 早期多端基础（节选）
- `9fba265` docs: 重构多端方案，README 同步到 6 端
- `f66f036` feat: 多平台架构（Android TV / iOS / shared core）
- 其余为 iOS i18n / Info.plist / 迁移系统升级 / refactor 等早期提交

## 验证状态

| 项 | 结果 |
|---|---|
| `cargo test` (opentivi-core) | **127 passed; 0 failed**（117 + 10 doctests，3 套件） |
| `cargo build` opentivi-core | 0 error，1 warning（unused import `is_playlist_content_type`） |
| `cargo build` desktop/src-tauri | 0 error，0 自身 warning（仅继承 core warning） |
| `cargo build` android-tv/rust | 0 error，仅继承 core warning |
| `cargo build` android-phone/rust | 0 error，仅继承 core warning |
| `cargo build` ios/rust | 0 error，仅继承 core warning |
| `cargo build` harmony-tv/rust（host） | 0 error，1 自身 warning（unused `napi::bindgen_prelude`） |
| `cargo check` harmony-phone/rust | 0 error（host link 缺 OHOS 符号属环境，故用 check） |

> 全部 Rust crate host 侧编过；harmony 在 host 上 type-check 通过。

## ⚠️ 未验证 / 待真机

- **iOS 选项2 播放器 Swift 离线未编译**：4 个新 Swift 文件（`Player/AVPlayerBackend.swift`、`Player/VLCPlayerBackend.swift`、`Player/VideoPlayerBackend.swift`、`Player/StreamPlayer.swift`）需在 Xcode 手动加入 OpenTivi target。
- **HLS 子请求头继承未验证**：注入到 `AVURLAsset` 的 UA/Referer 是否被 HLS 分段/子请求继承，需真机验证。
- **后台音频 / PiP** 未验证。
- **AVPlayer ↔ VLC 回退**：切换时是否无黑屏未验证。
- **消费侧 UI 未接线**：mobile（Kotlin/Swift）与 harmony（ArkTS）的 backup/reminders 及扩展播放信息的 UI 尚未接线（FFI 侧已就绪）。

## 剩余 roadmap

- 前端 UI：各端 backup / reminders 界面
- 录制 / timeshift（FFmpeg sidecar）
- SMB 支持
- 桌面 libmpv 后端
- 平台通知 / 文件选择
- App Store 上架、iOS 真机验收

## 迁移

新增 `0010`–`0016` 共 **7 个迁移**，以 expand-only / `ADD COLUMN` 为主，向后兼容（无破坏性 drop）：

- `0010_epg_epoch.sql`
- `0011_channels_soft_delete.sql`
- `0012_channel_groups.sql`
- `0013_catchup.sql`
- `0014_fts5_search.sql`
- `0015_channel_http_headers.sql`
- `0016_epg_reminders.sql`

新增依赖（均为纯 Rust，无 C 依赖）：`zip`（deflate-only）、`sha2`。

## 如何验证

```bash
# 核心测试（应 127 passed; 0 failed）
cargo test --manifest-path crates/opentivi-core/Cargo.toml

# 各端构建
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo build --manifest-path apps/android-tv/rust/Cargo.toml
cargo build --manifest-path apps/android-phone/rust/Cargo.toml
cargo build --manifest-path apps/ios/rust/Cargo.toml
cargo build --manifest-path apps/harmony-tv/rust/Cargo.toml
cargo check --manifest-path apps/harmony-phone/rust/Cargo.toml
```
