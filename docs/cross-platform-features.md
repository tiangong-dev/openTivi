# OpenTivi 跨平台功能清单

本文档根据当前代码库（`apps/ios`、`apps/desktop`、`apps/android-tv`）梳理各端**已实现**的功能、**与共享 Rust 核心（`opentivi-core`）的集成方式**，以及「全产品」功能全集与平台差异。

**说明**

- **Desktop（Tauri）**、**iOS（UniFFI）**、**Android TV（UniFFI + JNA）** 均通过各自 FFI 边界调用同一套核心逻辑（频道、源、EPG、收藏、最近、播放解析、设置、本地代理等）。
- **Android TV** 的 Kotlin UI 已与 `Opentivi.*` API 贯通；运行前需在本地构建并放入 **`libopentivi_android.so`**（见 §4.2），否则进程在 `initEngine` 时会失败。

---

## 1. 功能总览矩阵

| 功能域 | iOS | Desktop | Android TV |
|--------|:---:|:-------:|:----------:|
| 频道列表浏览 | ✅ | ✅ | ✅（网格 + UniFFI；依赖 native 库） |
| 分组（Group）筛选 | ✅ | ✅ | ✅ |
| 频道搜索 | ✅ | ✅（含 EPG 节目搜索） | ✅（`list_channels` 的 `search`） |
| 频道详情页 | ✅ `ChannelDetailView` | ❌（列表内直接播放为主） | ❌（网格点击进入播放） |
| 频道列表 EPG 时间轴（Guide） | ❌ | ✅ `ChannelRowsWithGuide` | ⚠️ 卡片副标题展示「当前节目」；无横向时间轴 |
| 多维度筛选（来源 / 分组 / 排序） | ❌ | ✅ | ⚠️ 分组 + 搜索；无来源 / 排序 |
| 收藏 | ✅ 列表滑动 + 收藏页 | ✅ 专用页 + 行内取消 | ✅ 专用页 + 行内 ★ 切换 |
| 最近观看 | ✅ 列表 + 相对时间 / 次数 | ✅ 带 Guide 行 | ✅ **独立 Tab** + Home `TvRow` |
| 节目源管理 | ✅ 滑动操作 + 编辑 + M3U/Xtream/XMLTV | ✅ 筛选 + 表格 + 三种导入 | ✅ 列表 + 刷新/删除 + 三种导入 |
| 播放 | ✅ VLC、全屏、`MiniPlayerBar` | ✅ Web 播放器、侧栏 Now Playing、恢复上次频道 | ✅ ExoPlayer、全屏路由、代理 URL |
| 播放中换台 | ✅ 纵向滑动手势 | ✅ 快捷键 / 即时切换 | ✅ DPAD 上/下（基于全量列表索引） |
| 播放 OSD / 叠加层 | ✅ 返回、旋转、锁定、EPG、码率 | ✅ 节目单、频道列表、音量、诊断等 | ✅ 频道名 + 现在/下一档 |
| 画中画式「非全屏继续听」 | ✅ `MiniPlayerBar` | ✅ 侧栏保留 Now Playing | ❌ |
| 设置：界面语言 | ✅ `ui.locale` + 启动恢复 | ✅ `ui.locale` | ✅ `ui.locale` |
| 设置：启动默认页 | ❌ | ✅ 启动即生效 | ⚠️ 写入 `app.startView`；**启动 Tab 未按该值自动跳转**（与 iOS 同为后续项） |
| 设置：播放（即时换台、优先原生 HLS） | ❌ | ✅ | ✅ 与 Desktop **同键名**（值是否影响 ExoPlayer 行为因平台而异） |
| 设置：EPG（时间窗等） | ❌ | ✅ | ❌ |
| 检查应用更新 | ❌ | ✅ | ❌ |
| EPG 提醒 | ❌ | ✅ | ❌ |
| TV / 键盘遥控导航 | N/A（触控为主） | ✅ `tvInput`、焦点域 | ✅ DPAD / Leanback |
| 开发用 UI 样例页 | ❌ | ✅（仅 `DEV`） | ❌ |

图例：**✅** 主流程已贯通；**⚠️** 部分能力或仅持久化未接 UI 行为；**❌** 未实现或未暴露。

---

## 2. 跨端对齐要点（设置与数据）

| 键名 | 含义 | iOS | Desktop | Android TV |
|------|------|:---:|:-------:|:----------:|
| `ui.locale` | 界面语言（JSON 字符串，如 `en-US` / `zh-CN`） | ✅ 读写；启动读库恢复 | ✅ | ✅ |
| `locale` | 历史 iOS 键 | ⚠️ 仅启动时**兼容读取** | — | — |
| `app.startView` | 启动后默认视图标识 | ❌ | ✅ | ⚠️ 写入；**未驱动导航** |
| `player.instantSwitchEnabled` | 即时换台 | ❌ | ✅ | ✅ 写入 |
| `player.preferNativeHls` | 优先原生 HLS | ❌ | ✅ | ✅ 写入 |
| `player.lastChannelId` | 恢复上次频道 | ❌ | ✅ | ❌ |
| `epg.timelineWindowMinutes` 等 | EPG 时间窗等 | ❌ | ✅ | ❌ |

---

## 3. iOS（SwiftUI）

### 3.1 导航与信息架构

- 底部 **TabView**：频道、收藏、最近、节目源、设置（`ContentView.swift`）。
- 播放时底部 **`MiniPlayerBar`**：台标、当前台名、EPG「正在播」标题、停止、点击进入全屏。
- **启动语言**：`ContentView` 在 `.task` 中拉取设置，优先 **`ui.locale`**，否则回退 **`locale`**，应用到 `LocaleManager`。

### 3.2 频道（`ChannelsView`）

- Rust 拉取频道与分组；**横向分组 Chips**；**`.searchable`** 搜索。
- **下拉刷新**；行 **滑动** 收藏/取消收藏。
- 行 **点击进入 `ChannelDetailView`（NavigationLink）**；详情内提供播放等操作（不再在列表行上直接点按播放）。

### 3.3 收藏 / 最近（`FavoritesView` / `RecentsView`）

- 收藏：网格 + 台标，点击播放；空状态文案。
- 最近：列表、相对时间、`playCount`，点击构造 `ChannelInfo` 播放；播放路径上会 `markRecentWatched`。

### 3.4 节目源（`SourcesView` + `AddSourceView` / `EditSourceView`）

- 列表 + 滑动：删除、刷新、编辑；工具栏全部刷新、添加。
- **M3U、Xtream、XMLTV** 表单。

### 3.5 设置（`SettingsView`）

- 语言：English / 中文 → **`ui.locale`**（JSON 字符串形式写入，与 Desktop/Android 一致）。
- 关于：版本、Build、GitHub。

### 3.6 播放器

- **`StreamPlayer` + `VLCVideoView`**；播放时 **全屏**（`fullScreenCover`）。
- 手势：叠加层显示/隐藏、锁定、**纵向滑动**换台。
- **`PlayerOverlay`**：返回、旋转、锁定、EPG、码率等。
- **`PlayerViewModel`**：`channelList` 换台、EPG 快照、码率、最近观看。

### 3.7 其他

- **`ChannelDetailView`**：与列表通过 **NavigationLink** 连接。
- 主题（`Color+Theme`）、`LocaleManager`。

---

## 4. Desktop（Tauri + React）

### 4.1 壳层（`AppShell`）

- 侧栏：频道、收藏、最近、节目源、设置；播放中出现 **Now Playing**。
- `DEV`：**Dev Components**。
- 启动：语言、默认视图、可选恢复上次频道；播放中定时刷新当前频道 EPG 供侧栏展示。
- **`NavigationContext`**：TV 键盘/遥控与焦点域。

### 4.2 频道（`ChannelsView`）

- 来源 / 分组 / **排序**；频道名搜索 + **EPG 节目搜索**；**`ChannelRowsWithGuide`** 时间轴；EPG 提醒设置键。

### 4.3 收藏 / 最近

- 收藏：`list_favorites`，行内取消收藏，带 Guide。
- 最近：`list_recents`，可切换收藏，带 Guide。

### 4.4 节目源（`SourcesView`）

- 源状态筛选；M3U / Xtream / XMLTV；刷新、编辑、删除与 TV 焦点。

### 4.5 设置（`SettingsView`）

- 检查更新；语言、`app.startView`；即时换台、优先原生 HLS；EPG 时间窗等。

### 4.6 播放器（`VideoPlayer`）

- 即时换台双槽、音量、`preferNativeHls`；OSD、节目单、频道列表、诊断等。

### 4.7 库能力

- `tvInput`、`focusScope`、`epgSnapshots`、`i18n`、`settings` 等。

---

## 5. Android TV（Compose for TV）

### 5.1 导航

- 顶部 **TabRow**：**Home**、频道、收藏、**最近**、节目源、设置。
- **Player**：`player/{channelId}`（`AppNavigation.kt`、`Screen.kt`）。

### 5.2 Native 与 UniFFI

- **Kotlin 绑定**：`app/src/main/java/uniffi/opentivi/opentivi.kt`（由 `apps/android-tv/rust/src/opentivi.udl` + `uniffi-bindgen` 生成）。
- **库加载**：通过 `System.setProperty("uniffi.component.opentivi.libraryOverride", "opentivi_android")` 加载 **`libopentivi_android.so`**（与 Cargo `[lib] name = "opentivi_android"` 一致）。
- **再次生成绑定**：若 `uniffi-bindgen` 输出的函数未包在 `public object Opentivi { }` 内，需手动补全（UniFFI 0.28 生成物曾出现该问题）。
- **构建脚本**：`apps/android-tv/scripts/build-native-jni.sh`（需 `ANDROID_NDK_HOME`、`cargo-ndk`）。产物目录 `app/src/main/jniLibs/` 已在仓库 `.gitignore` 中忽略。

### 5.3 依赖与进程初始化

- **JNA**：`net.java.dev.jna:jna`（UniFFI Kotlin 后端）。
- **`OpenTiviApp`**：`OpenTiviEngine.init()` → `Opentivi.initEngine(filesDir)`。

### 5.4 Home（`HomeScreen`）

- **继续观看**：`RecentsViewModel` → `listRecents()` → `TvRow`。
- **我的收藏**：`FavoritesViewModel` → `listFavorites()` + EPG 快照摘要 → `TvRow`。

### 5.5 频道（`ChannelsScreen`）

- `ChannelsViewModel`：`listGroups`、`list_channels`（分组 + search）、`get_channels_epg_snapshots`（卡片副标题）。
- 网格旁 **★ / ☆** 调用 `setFavorite`。

### 5.6 收藏 / 最近

- **`FavoritesScreen`**：网格 + 取消收藏。
- **`RecentsScreen`**：独立 Tab；卡片副标题为播放次数文案。

### 5.7 节目源（`SourcesScreen` + `ImportDialog`）

- **M3U / Xtream / XMLTV** 三 Tab；列表行 **刷新**、**删除**（确认对话框）。

### 5.8 设置（`SettingsScreen`）

- 语言（`ui.locale`）、启动页（`app.startView`）、`player.instantSwitchEnabled`、`player.preferNativeHls`（键与 Desktop 对齐）。

### 5.9 播放器

- **`PlayerViewModel`**：`resolve_playback`、`mark_recent_watched`；`TiviPlayer` 使用 **`127.0.0.1:{proxyPort}/stream?url=`** 且对 URL **编码**。
- 换台：内存中全量频道列表（`list_channels` limit 5000）与当前索引。
- **`PlayerScreen`**：返回、确认显隐 overlay、上/下换台。

### 5.10 共享组件

- **`TvCard` / `TvRow`**：Home 横向列表。
- **`EpgBar`**：可用于扩展布局；当前频道卡片的「当前节目」主要来自 **EPG snapshot**，而非该条单独时间轴。

---

## 6. 「全产品」功能全集（不按平台拆分）

1. **内容发现**：频道列表、分组、关键字搜索、（Desktop）EPG 节目搜索、（Desktop）时间轴节目单。
2. **个人化**：收藏、最近观看、（**Android**）Home 继续观看与收藏行、（**iOS**）迷你播放条。
3. **源与元数据**：M3U / Xtream / XMLTV、刷新、（iOS/Desktop）编辑、删除。
4. **播放**：全屏、换台、OSD、EPG 现在/接下来、（Desktop/iOS）更丰富诊断与策略开关、（Android）ExoPlayer + 本地代理。
5. **全局行为**：多语言（`ui.locale`）、启动视图、（Desktop）恢复上次频道与 EPG 时间窗/提醒/检查更新。
6. **交互**：触控（iOS）、指针+键盘（Desktop）、DPAD（Android TV）、完整 TV 语义（Desktop）。

---

## 7. 维护建议

- 任一端改动 **设置键**、**导航结构** 或 **FFI 接口（`opentivi.udl`）** 时，同步更新本文件 §1、§2、对应平台章节。
- Android 重新生成 `opentivi.kt` 后务必 **编译一次**并检查 **`object Opentivi` 是否完整**。
- 若后续实现 **Android 按 `app.startView` 自动选 Tab** 或 **iOS 启动默认 Tab**，请把 §1 矩阵与 §2 表中对应行改为 ✅ 并简述行为。

文档版本：与仓库当前代码同步（2026-03-25）。
