# OpenTivi Android TV — 架构设计

## 1. 总览

OpenTivi Android TV 客户端与 Desktop 共享同一 Rust 后端（`opentivi-core` crate），通过 UniFFI 桥接暴露给 Kotlin。

| 层 | 技术 |
|----|------|
| UI | Jetpack Compose for TV (`androidx.tv:tv-material 1.0.0`) |
| 导航 | Navigation Compose + 顶部 TabRow |
| 状态管理 | ViewModel + StateFlow |
| DI | Hilt |
| 播放器 | Media3 ExoPlayer (`media3-exoplayer-hls 1.5.0`) |
| Rust 桥接 | UniFFI 0.28 → 自动生成 Kotlin bindings |
| 共享后端 | `opentivi-core` crate (SQLite + reqwest + warp proxy) |
| Min SDK | 24 (Android 7.0) |

---

## 2. 仓库结构（已实现）

```
opentivi/
├── crates/
│   └── opentivi-core/                  # 共享 Rust crate（46 个 .rs 文件）
│       ├── Cargo.toml
│       ├── migrations/                 # 9 个 SQLite migration
│       └── src/
│           ├── lib.rs                  # pub mod core, dto, error, platform
│           ├── dto.rs                  # 所有 DTO (Input + Output types)
│           ├── error.rs                # AppError, AppResult
│           ├── core/
│           │   ├── models/             # Channel, Source, EPG, Setting
│           │   ├── parsers/            # M3U, Xtream, XMLTV
│           │   └── services/           # 14 个 service 模块
│           └── platform/
│               ├── db/                 # connection, migrations, 7 个 repository
│               ├── fs/paths.rs         # 多平台路径 (macOS/Windows/Linux/Android)
│               ├── http/client.rs      # reqwest HTTP 客户端
│               ├── proxy.rs            # 127.0.0.1 流代理 (warp)
│               └── remote_config.rs    # LAN 远程配置服务
│
├── apps/
│   ├── desktop/                        # Tauri 2 桌面端
│   │   └── src-tauri/
│   │       ├── Cargo.toml              # 依赖 opentivi-core（path）
│   │       └── src/
│   │           ├── commands/           # Tauri invoke 边界层
│   │           ├── state.rs            # AppState (db + proxy + prewarm)
│   │           └── lib.rs              # pub use opentivi_core::{core, dto, error, platform}
│   │
│   └── android-tv/                     # Android TV 客户端
│       ├── build.gradle.kts            # AGP 8.7.0, Kotlin 2.1.0
│       ├── settings.gradle.kts
│       ├── gradle.properties
│       ├── app/
│       │   ├── build.gradle.kts        # compileSdk 35, Compose TV, Media3, Hilt, Coil
│       │   └── src/main/
│       │       ├── AndroidManifest.xml  # Leanback TV app
│       │       ├── java/com/opentivi/tv/
│       │       │   ├── OpenTiviApp.kt          # @HiltAndroidApp
│       │       │   ├── MainActivity.kt         # @AndroidEntryPoint + Compose
│       │       │   ├── ui/
│       │       │   │   ├── theme/              # Color, Type (10-foot), Theme (dark-only)
│       │       │   │   ├── navigation/         # Screen routes + AppNavigation (TabRow)
│       │       │   │   ├── home/               # HomeScreen (recent + favorites rows)
│       │       │   │   ├── channels/           # ChannelsScreen (grid) + ChannelCard
│       │       │   │   ├── player/             # PlayerScreen + PlayerOverlay
│       │       │   │   ├── favorites/          # FavoritesScreen
│       │       │   │   ├── sources/            # SourcesScreen + ImportDialog
│       │       │   │   ├── settings/           # SettingsScreen
│       │       │   │   └── components/         # TvCard, TvRow, EpgBar
│       │       │   ├── viewmodel/              # 5 个 ViewModel (StateFlow)
│       │       │   └── player/
│       │       │       └── TiviPlayer.kt       # Media3 ExoPlayer wrapper
│       │       └── res/
│       │           ├── values/strings.xml       # English
│       │           └── values-zh-rCN/strings.xml # 中文
│       └── rust/                        # UniFFI 桥接 crate
│           ├── Cargo.toml               # cdylib, 依赖 opentivi-core + uniffi
│           ├── build.rs                 # uniffi scaffolding generation
│           └── src/
│               ├── opentivi.udl         # 22 个 FFI 函数 + 10 个 record 定义
│               └── lib.rs               # 实现：OnceLock<Mutex<EngineState>>
│
└── shared/
    └── locales/                         # en-US.json, zh-CN.json
```

---

## 3. Rust Core 共享策略

### 3.1 crate 拆分

Desktop 原有的 `core/` + `platform/` + `error.rs` + `commands/dto.rs` 已提取到独立 crate `opentivi-core`。

Desktop 端通过 `pub use` 重新导出，保持所有 `crate::` 路径兼容：

```rust
// apps/desktop/src-tauri/src/lib.rs
pub use opentivi_core::core;
pub use opentivi_core::dto;
pub use opentivi_core::error;
pub use opentivi_core::platform;
```

Desktop `commands/dto.rs` 简化为：
```rust
pub use opentivi_core::dto::*;
```

### 3.2 多平台路径

`platform/fs/paths.rs` 通过 `OnceLock` + `#[cfg(target_os)]` 支持 4 个平台：

```rust
static EXTERNAL_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_data_dir(path: &str) {
    let _ = EXTERNAL_DATA_DIR.set(PathBuf::from(path));
}

fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "android")]  { EXTERNAL_DATA_DIR.get().cloned() }
    #[cfg(target_os = "macos")]    { dirs::data_dir().map(|d| d.join("com.opentivi.app")) }
    #[cfg(target_os = "windows")]  { dirs::data_local_dir().map(|d| d.join("OpenTivi")) }
    #[cfg(target_os = "linux")]    { dirs::data_dir().map(|d| d.join("opentivi")) }
}
```

### 3.3 依赖关系

```
opentivi-desktop ──────► opentivi-core
                            ▲
opentivi-android ──────────┘
   (cdylib + uniffi)
```

---

## 4. UniFFI Bridge

### 4.1 全局状态

Android 端通过 `OnceLock<Mutex<EngineState>>` 持有全局状态：

```rust
static ENGINE: OnceLock<Mutex<EngineState>> = OnceLock::new();

struct EngineState {
    db: rusqlite::Connection,
    proxy_port: u16,
}
```

### 4.2 初始化流程

```
OpenTiviApp.onCreate()
    └─► init_engine(filesDir)     // Kotlin → JNI → Rust
            ├─► set_data_dir()     // 设置 Android 数据目录
            ├─► open_connection()  // 打开 SQLite
            ├─► run_migrations()   // 执行 9 个 migration
            ├─► backfill_normalized_names()
            ├─► start_proxy_server() // 启动 127.0.0.1 warp proxy
            └─► 返回 proxy_port
```

### 4.3 FFI 接口 (opentivi.udl)

| 类别 | 函数 | 返回类型 |
|------|------|----------|
| 初始化 | `init_engine(data_dir)` | `u16` (proxy port) |
| 数据源 | `list_sources`, `import_m3u`, `import_xtream`, `import_xmltv`, `refresh_source`, `update_source`, `delete_source` | `SourceInfo` / `ImportResult` |
| 频道 | `list_channels`, `list_groups`, `get_channel` | `ChannelInfo` |
| EPG | `get_channel_epg`, `get_channels_epg_snapshots`, `search_epg` | `EpgProgramInfo` / `ChannelEpgSnapshot` |
| 收藏 | `list_favorites`, `set_favorite` | `ChannelInfo` |
| 最近 | `list_recents`, `mark_recent_watched` | `RecentChannelInfo` |
| 播放 | `resolve_playback`, `list_playback_candidates` | `PlaybackInfo` |
| 设置 | `get_all_settings`, `set_setting` | `SettingInfo` |
| 代理 | `get_proxy_port` | `u16` |

所有函数标记 `[Throws=string]`，错误统一序列化为字符串。

### 4.4 Import 操作的连接策略

Import 操作（`import_m3u`, `import_xtream`, `import_xmltv`, `refresh_source`）会自行打开独立的 DB 连接，避免长时间持有全局 Mutex 锁：

```rust
pub fn import_m3u(...) -> Result<ImportResult, String> {
    let conn = opentivi_core::platform::db::connection::open_connection()
        .map_err(|e| e.to_string())?;  // 独立连接
    opentivi_core::core::services::import_service::import_m3u(&conn, ...)
        .map(ImportResult::from)
        .map_err(|e| e.to_string())
}
```

---

## 5. Android TV UI

### 5.1 导航结构

Desktop 使用左侧 200px 侧边栏 → Android TV 改为顶部 TabRow（Leanback 范式）。

```
┌──────────────────────────────────────────────────────┐
│  [🏠 Home]  [📺 Channels]  [⭐ Favorites]  [⚙ Settings] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  内容区（全屏，D-pad 焦点导航）                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 5.2 页面组成

| 页面 | Composable | 布局 |
|------|-----------|------|
| Home | `HomeScreen` | Now Playing Banner + 最近观看 TvLazyRow + 收藏 TvLazyRow |
| 频道 | `ChannelsScreen` | Group filter chips + TvLazyVerticalGrid (4~5列) |
| 收藏 | `FavoritesScreen` | TvLazyVerticalGrid |
| 设置 | `SettingsScreen` | 数据源管理 + 语言 + 版本 |
| 播放 | `PlayerScreen` | 全屏 ExoPlayer + PlayerOverlay (自动隐藏 5s) |
| 导入 | `ImportDialog` | M3U / Xtream 标签页表单 |

### 5.3 频道卡片

```
┌──────────┐
│  [Logo]  │   ← Coil 异步加载
│ Ch Name  │
│ Now: ... │   ← EPG 当前节目
└──────────┘
```

- 聚焦时放大 + 高亮边框
- 使用 `androidx.tv.material3.Card`

### 5.4 播放器 Overlay

```
┌──────────────────────────────────────────────┐
│                                              │
│  Channel Name — Group                        │
│  ▶ Now: Program Title     18:00 - 19:00     │
│  ⏭ Next: Program Title    19:00 - 20:00     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ [进度条]       │
│  [⭐ 收藏]  [📋 频道列表]                     │
│                                              │
└──────────────────────────────────────────────┘
```

按任意 D-pad 键显示，5 秒无操作自动隐藏。

### 5.5 遥控器按键映射

| 按键 | 行为 |
|------|------|
| D-pad Up/Down/Left/Right | 焦点导航 |
| Center / Enter | 确认 / 播放频道 |
| Back | 返回上一层；播放中先显示 overlay → 再按退出播放 |
| D-pad Up/Down (播放中) | 切换上/下一个频道 |
| 数字键 0-9 | 频道号直接输入（3 秒窗口组合） |
| Menu / 长按 Center | 频道上下文菜单（收藏/切源） |

对应 Desktop 的 `tvInput` 系统（`TvIntent`），在 Android 上直接映射 `KeyEvent.KEYCODE_*`。

---

## 6. 播放器

Desktop 使用 `hls.js` + `mpegts.js` 在 WebView 中播放 → Android TV 改用 Media3 ExoPlayer 原生硬解。

流量路径与 Desktop 一致：

```
ExoPlayer ──HTTP──► Rust proxy (127.0.0.1:port) ──HTTP──► 远端流媒体服务器
                    /stream?url=...
```

```kotlin
class TiviPlayer(context: Context, private val proxyPort: Int) {
    private val exoPlayer = ExoPlayer.Builder(context).build()

    fun play(streamUrl: String) {
        val proxiedUrl = "http://127.0.0.1:$proxyPort/stream?url=${URLEncoder.encode(streamUrl, "UTF-8")}"
        exoPlayer.setMediaItem(MediaItem.fromUri(proxiedUrl))
        exoPlayer.prepare()
        exoPlayer.play()
    }
}
```

---

## 7. 构建流程

### 编译 Rust → Android .so

```bash
cd apps/android-tv/rust
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 \
    -o ../app/src/main/jniLibs build --release
```

产出：`libopentivi_android.so`（每个 ABI 一份）

### 生成 UniFFI Kotlin bindings

UniFFI 在编译时自动生成 scaffolding。Kotlin bindings 通过 `uniffi-bindgen` 生成：

```bash
cargo run --bin uniffi-bindgen -- generate \
    --library target/aarch64-linux-android/release/libopentivi_android.so \
    --language kotlin \
    --out-dir ../app/src/main/java/
```

### 构建 APK

```bash
cd apps/android-tv
./gradlew assembleRelease
```

### Makefile 快捷命令

```bash
make core-check           # cargo check opentivi-core
make core-test            # cargo test opentivi-core (41 tests)
make android-rust-build   # 编译 Rust → .so (3 ABI)
make android-build        # Rust + Gradle release
make android-dev          # 安装 debug APK
make android-clean        # 清理
```

---

## 8. 数据流示意

```
用户遥控器
    │ D-pad / Select / Back
    ▼
Compose UI (Screen + Components)
    │ 状态观察
    ▼
ViewModel (StateFlow)
    │ 调用
    ▼
UniFFI Kotlin Bindings (auto-generated)
    │ JNI
    ▼
opentivi-android (Rust cdylib)
    │ with_engine() / 独立 conn
    ▼
opentivi-core
    ├── services → parsers, models
    ├── repositories → SQLite
    ├── http::client → reqwest
    └── proxy → warp (127.0.0.1)
              │
              ▼
         远端 IPTV 服务器
```

---

## 9. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Rust 复用方式 | UniFFI crate (cdylib) | 类型安全、自动 Kotlin 绑定、无需手写 JNI |
| DTO 共享 | `opentivi-core::dto` | 消除 `commands/dto` 的跨层耦合，两端共用 |
| 播放器 | Media3 ExoPlayer | 原生硬解 HLS/MPEG-TS、TV 遥控器集成、低延迟 |
| 流代理 | 复用 Rust warp proxy | 架构一致、CORS 处理、playlist URL rewrite |
| UI 框架 | Compose for TV | Google 官方 TV 组件库、内置 D-pad 焦点管理 |
| 导航 | 顶部 TabRow | TV 大屏最佳实践（Leanback 范式） |
| 状态管理 | ViewModel + StateFlow | Android 标准、生命周期感知、Compose 集成 |
| DI | Hilt | Android 标准 DI、ViewModel 注入支持 |
| Import 并发 | 独立 DB 连接 | 避免 Mutex 锁竞争、长操作不阻塞 UI 查询 |
| Android 路径 | `set_data_dir()` + OnceLock | 由 Application.onCreate 传入 filesDir |
