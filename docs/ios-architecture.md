# OpenTivi iOS — 架构设计

## 1. 总览

OpenTivi iOS 客户端与 Desktop、Android TV 共享同一 Rust 后端（`opentivi-core` crate），通过 UniFFI 桥接暴露给 Swift。

| 层 | 技术 |
|----|------|
| UI | SwiftUI (iOS 16+) |
| 导航 | TabView + NavigationStack |
| 状态管理 | @MainActor ViewModel + @Published |
| 播放器 | AVPlayer + AVKit `VideoPlayer` |
| Rust 桥接 | UniFFI 0.28 → 自动生成 Swift bindings |
| 共享后端 | `opentivi-core` crate (SQLite + reqwest + warp proxy) |
| Deployment Target | iOS 16.0 |

---

## 2. 仓库结构（已实现）

```
opentivi/
├── crates/
│   └── opentivi-core/                  # 共享 Rust crate
│
├── apps/
│   └── ios/
│       ├── rust/                        # UniFFI 桥接 crate
│       │   ├── Cargo.toml               # staticlib, 依赖 opentivi-core + uniffi
│       │   ├── build.rs                 # uniffi scaffolding generation
│       │   └── src/
│       │       ├── opentivi.udl         # 22 个 FFI 函数 + 10 个 record 定义
│       │       └── lib.rs               # 实现：OnceLock<Mutex<EngineState>>
│       │
│       └── OpenTivi/OpenTivi/           # SwiftUI 应用
│           ├── OpenTiviApp.swift         # @main App 入口
│           ├── ContentView.swift         # TabView + MiniPlayerBar
│           ├── Bridge/
│           │   └── RustBridge.swift      # UniFFI 单例封装 (async/await)
│           ├── Models/
│           │   └── Models.swift          # UniFFI record 占位类型 (10 个 struct)
│           ├── ViewModels/
│           │   ├── ChannelsViewModel.swift
│           │   ├── FavoritesViewModel.swift
│           │   ├── RecentsViewModel.swift
│           │   ├── SourcesViewModel.swift
│           │   ├── SettingsViewModel.swift
│           │   └── PlayerViewModel.swift
│           ├── Player/
│           │   └── StreamPlayer.swift    # AVPlayer wrapper (proxy 路由)
│           ├── Views/
│           │   ├── Channels/            # ChannelsView, ChannelRow, ChannelDetailView
│           │   ├── Favorites/           # FavoritesView (LazyVGrid)
│           │   ├── Recents/             # RecentsView
│           │   ├── Sources/             # SourcesView, AddSourceView, EditSourceView
│           │   ├── Settings/            # SettingsView
│           │   ├── Player/              # PlayerView, PlayerOverlay, MiniPlayerBar
│           │   └── Components/          # ChannelLogo, GroupFilterChips, EpgNowNextView, LoadingView
│           └── Extensions/
│               ├── Date+Formatting.swift
│               └── Color+Theme.swift
```

---

## 3. Rust Core 共享策略

### 3.1 crate 配置

iOS 端构建为静态库 (`staticlib`)，区别于 Android 的动态库 (`cdylib`)：

```toml
# apps/ios/rust/Cargo.toml
[lib]
crate-type = ["staticlib"]
name = "opentivi_ios"

[dependencies]
opentivi-core = { path = "../../../crates/opentivi-core" }
uniffi = { version = "0.28", features = ["build"] }
serde_json = "1"
```

### 3.2 依赖关系

```
opentivi-desktop ──────► opentivi-core
                            ▲
opentivi-android ──────────┤ (cdylib + uniffi)
                            │
opentivi-ios ──────────────┘ (staticlib + uniffi)
```

### 3.3 多平台路径

与 Android 共享 `platform/fs/paths.rs` 的 `set_data_dir()` + `OnceLock` 机制。
iOS 端在 `OpenTiviApp.init()` 中传入 `documentDirectory`：

```swift
let docsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
RustBridge.shared.initialize(dataDir: docsDir.path)
```

---

## 4. UniFFI Bridge

### 4.1 全局状态

iOS 与 Android 共享完全相同的 bridge 实现模式：

```rust
static ENGINE: OnceLock<Mutex<EngineState>> = OnceLock::new();

struct EngineState {
    db: rusqlite::Connection,
    proxy_port: u16,
}
```

### 4.2 初始化流程

```
OpenTiviApp.init()
    └─► RustBridge.shared.initialize(dataDir:)
            └─► init_engine(data_dir)        // Swift → FFI → Rust
                    ├─► set_data_dir()         // 设置 iOS 文档目录
                    ├─► open_connection()       // 打开 SQLite
                    ├─► run_migrations()        // 执行 migration
                    ├─► backfill_normalized_names()
                    ├─► start_proxy_server()    // 启动 127.0.0.1 warp proxy
                    └─► 返回 proxy_port
```

### 4.3 FFI 接口

UDL 文件与 Android 端完全共享（22 个函数 + 10 个 record），见 `apps/ios/rust/src/opentivi.udl`。

所有函数标记 `[Throws=string]`，错误统一序列化为字符串。

### 4.4 RustBridge 封装

Swift 端通过 `RustBridge` 单例封装所有 UniFFI 调用：

```swift
@MainActor
final class RustBridge: ObservableObject {
    static let shared = RustBridge()
    private(set) var proxyPort: UInt16 = 0
    private(set) var isInitialized = false

    // 所有数据方法标记 nonisolated + async throws
    nonisolated func fetchChannels(...) async throws -> [ChannelInfo]
    nonisolated func fetchSources() async throws -> [SourceInfo]
    // ... 等
}
```

- `@MainActor` 确保 `proxyPort` / `isInitialized` 在主线程读写
- `nonisolated` + `async` 确保 FFI 调用不阻塞主线程

### 4.5 Import 操作的连接策略

与 Android 端一致，Import 操作自行打开独立 DB 连接，避免长时间持有全局 Mutex 锁。

---

## 5. iOS UI

### 5.1 导航结构

Desktop 使用左侧 200px 侧边栏 → iOS 改为底部 TabBar（iOS 移动端范式）。

```
┌──────────────────────────────────────────────┐
│                                              │
│  内容区 (NavigationStack)                     │
│                                              │
│  ┌──────────────────────────────────┐        │
│  │ 📺 MiniPlayerBar (播放中显示)      │        │
│  └──────────────────────────────────┘        │
├──────────────────────────────────────────────┤
│ [📺 Channels] [⭐ Favorites] [🕐 Recents] [📡 Sources] [⚙ Settings] │
└──────────────────────────────────────────────┘
```

### 5.2 页面组成

| 页面 | View | 布局 |
|------|------|------|
| 频道 | `ChannelsView` | List + GroupFilterChips (横向滚动) + searchable + pull-to-refresh |
| 收藏 | `FavoritesView` | LazyVGrid (adaptive 100pt) + pull-to-refresh |
| 最近 | `RecentsView` | List + pull-to-refresh |
| 数据源 | `SourcesView` | List + AddSourceView (sheet) + EditSourceView |
| 设置 | `SettingsView` | Form |
| 播放 | `PlayerView` | 全屏 AVPlayer + PlayerOverlay (5s 自动隐藏) |
| 导入 | `AddSourceView` | Form + 分段 Picker (M3U / Xtream) |

### 5.3 频道列表

```
┌──────────────────────────────────────────┐
│ [All] [Sports] [News] [Movies] ...       │  ← GroupFilterChips (横向)
├──────────────────────────────────────────┤
│ 🔍 Search channels...                    │  ← .searchable
├──────────────────────────────────────────┤
│ [Logo] Channel Name         ← swipe →  ⭐ │
│ [Logo] Channel Name         ← swipe →  ⭐ │
│ ...                                      │
└──────────────────────────────────────────┘
```

- 左滑显示收藏/取消收藏按钮（`swipeActions`）
- 触觉反馈（`UIImpactFeedbackGenerator`）

### 5.4 播放器

#### MiniPlayerBar

播放开始后，在 TabBar 上方显示迷你播放栏：

```
┌──────────────────────────────────────────┐
│ [Logo] Channel Name          [✕ 关闭]    │
│        Now: Program Title               │
└──────────────────────────────────────────┘
```

- 背景 `.ultraThinMaterial`（毛玻璃效果）
- 点击展开全屏播放器（`fullScreenCover`）

#### 全屏播放器

```
┌──────────────────────────────────────────┐
│ [▼ 关闭]                                 │
│                                          │
│           AVPlayer (全屏视频)              │
│                                          │
│                                          │
│ Channel Name                             │
│ Group                                    │
│ [NOW] Program Title                      │
│ [NEXT] Program Title                     │
│ Swipe up/down to switch · down to close  │
└──────────────────────────────────────────┘
```

- 点击屏幕切换 overlay 显示/隐藏
- 5 秒无操作自动隐藏 overlay
- 手势导航：上滑切台、下滑关闭

### 5.5 手势映射

| 手势 | 行为 |
|------|------|
| 点击频道行 | 开始播放 |
| 左滑频道行 | 收藏/取消收藏 |
| 下拉 | 刷新列表 (`.refreshable`) |
| 点击 MiniPlayerBar | 展开全屏 |
| 全屏中点击 | 显示/隐藏 overlay |
| 全屏中上滑 | 下一个频道 |
| 全屏中下滑 (>100pt) | 关闭全屏 |
| 全屏中下滑 (>50pt) | 上一个频道 |

---

## 6. 播放器

Desktop 使用 `hls.js` + `mpegts.js` 在 WebView 中播放 → iOS 改用 AVPlayer 原生硬解。

流量路径与 Desktop / Android TV 一致：

```
AVPlayer ──HTTP──► Rust proxy (127.0.0.1:port) ──HTTP──► 远端流媒体服务器
                   /stream?url=...
```

```swift
class StreamPlayer: ObservableObject {
    let player = AVPlayer()

    func play(streamUrl: String) {
        let proxied = "http://127.0.0.1:\(proxyPort)/stream?url=\(encoded)"
        let item = AVPlayerItem(url: URL(string: proxied)!)
        player.replaceCurrentItem(with: item)
        player.play()
    }
}
```

通过 `AVPlayer.observe(\.timeControlStatus)` 监听播放状态变化。

---

## 7. 构建流程

### 编译 Rust → iOS .a

```bash
# 真机 (arm64)
cd apps/ios/rust
cargo build --release --target aarch64-apple-ios

# 模拟器 (arm64 Apple Silicon)
cargo build --release --target aarch64-apple-ios-sim
```

产出：`libopentivi_ios.a`（每个 target 一份）

### 生成 UniFFI Swift bindings

```bash
cargo run --bin uniffi-bindgen -- generate \
    --library target/aarch64-apple-ios/release/libopentivi_ios.a \
    --language swift \
    --out-dir ../OpenTivi/Generated
```

### Xcode 集成

将生成的 `.a` 静态库和 Swift bindings 添加到 Xcode 项目中构建。

### Makefile 快捷命令

```bash
make core-check           # cargo check opentivi-core
make core-test            # cargo test opentivi-core
make ios-rust-build       # 编译 Rust → .a (device + sim)
make ios-uniffi           # 生成 Swift bindings
make ios-clean            # 清理
```

---

## 8. 数据流示意

```
用户触摸
    │ Tap / Swipe / Pull-to-refresh
    ▼
SwiftUI View (Screen + Components)
    │ 状态观察 @Published
    ▼
ViewModel (@MainActor + @Published)
    │ async/await
    ▼
RustBridge (singleton, nonisolated async)
    │ FFI
    ▼
opentivi-ios (Rust staticlib)
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
| Rust 复用方式 | UniFFI crate (staticlib) | 类型安全、自动 Swift 绑定、无需手写 C bridge |
| DTO 共享 | `opentivi-core::dto` | 消除跨层耦合，三端共用 |
| 播放器 | AVPlayer | iOS 原生硬解 HLS/MPEG-TS、系统级集成、低功耗 |
| 流代理 | 复用 Rust warp proxy | 架构一致、CORS 处理、playlist URL rewrite |
| UI 框架 | SwiftUI | Apple 原生、声明式 UI、与 AVKit 深度集成 |
| 导航 | 底部 TabBar | iOS 移动端最佳实践 |
| 状态管理 | @MainActor ViewModel + @Published | SwiftUI 标准、线程安全、自动 UI 刷新 |
| 迷你播放器 | MiniPlayerBar + fullScreenCover | 参考 Apple Music / Podcasts 模式 |
| Import 并发 | 独立 DB 连接 | 避免 Mutex 锁竞争、长操作不阻塞 UI 查询 |
| iOS 路径 | `set_data_dir()` + OnceLock | 由 App.init() 传入 documentDirectory |
| Bridge 并发 | nonisolated async throws | FFI 调用不阻塞主线程 |
| 占位类型 | Models.swift 手写 struct | UniFFI codegen 接入后替换为生成类型 |
