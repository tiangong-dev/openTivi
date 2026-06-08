# OpenTivi 多端架构方案

> 适用分支：`feat-android-ios`（HEAD `e36472a`）。本文是该分支真实架构的盘点与前进路线，作为多端开发的权威依据。

---

## 0. 结论

架构方向已定且已落地：`crates/opentivi-core`（纯 Rust 业务/基础设施）被 **6 个端**消费——desktop(Tauri2)、android-tv、android-phone、ios、harmony-tv、harmony-phone。UI 各端原生（React / Compose / SwiftUI / ArkTS），播放器各端原生（hls.js·mpegts.js / Media3 / VLCKit(iOS 现状) / ArkTS），FFI 按生态选型（桌面 Rust 直连 / 移动 UniFFI / 鸿蒙 NAPI）。

接下来的工作**不是选路线**，而是两件事：**(1) 把数据模型补齐到成熟 IPTV 客户端水准；(2) 各端从"能跑"打磨到"能上架"**。最大风险是 iOS：当前播放层已是 **VLCKit 直连**（kill-spike 校正，详见 §4 决策点），残余风险已从"AVPlayer 长尾流兼容"转移为 **App Store 对 LGPL/GPL + IPTV 的合规审查**（最高，可毙整端）+ 后台/PiP 配套，应最先做风险验证。

**第一个 PR**：EPG 时间 `TEXT→epoch` 的"加列 + 双写 + 回填 + 校验 + 升级测试"，不切读、不删旧列（见 §3 P0a）。

---

## 1. 现状基线

### 1.1 目录与端

```
crates/opentivi-core/        # 共享 Rust 核（无 UI/FFI 依赖，纯业务+基础设施）
apps/
  desktop/        Tauri2 + React18/TS    播放 hls.js + mpegts.js     FFI: Rust 直连
  android-tv/     Jetpack Compose for TV 播放 Media3 ExoPlayer       FFI: UniFFI 0.28 (cdylib)
  android-phone/  Compose                播放 Media3 (TextureView)   FFI: UniFFI 0.28
  ios/            SwiftUI                播放 VLCKit(直连，现状)      FFI: UniFFI 0.28 (staticlib)
  harmony-tv/     ArkTS (ArkUI)          播放 ArkTS                  FFI: NAPI (napi-ohos, cdylib)
  harmony-phone/  ArkTS                  播放 ArkTS                  FFI: NAPI
shared/locales/   i18n (en-US, zh-CN)，各端共享
```

### 1.2 各端完成度（非空行代码量，已排除生成/构建产物）

| 端 | UI 代码量 | Rust 桥接 | 状态 |
|---|---|---|---|
| desktop | ~9.9k TS/TSX | (Tauri 直连 core) | 最成熟（原 v0.1 基线） |
| android-tv | ~7.0k Kotlin | 693 行 | 真实现：import / player / TV Material3 已接 |
| android-phone | ~7.4k Kotlin | 689 行 | 真实现，最新加入 |
| ios | ~6.4k Swift | 782 行 | 真实现：RustBridge 已接真 UniFFI、player 已接 |
| harmony-tv | ~2.9k ArkTS | 604 行 NAPI | 真实现，成熟度最低，README 未收录 |
| harmony-phone | ~3.1k ArkTS | 740 行 NAPI | 真实现，成熟度最低，README 未收录 |

### 1.3 共享核暴露的 FFI 面（`apps/android-tv/rust/src/opentivi.udl`）

```
init_engine(data_dir) -> proxy_port
import_m3u / import_xtream / import_xmltv -> ImportResult
refresh_source / update_source / delete_source
set_favorite / mark_recent_watched
resolve_playback(channel_id) -> PlaybackInfo     ← 给出可播 URL/代理信息
set_setting / get_proxy_port
+ DTO: Source/Channel/EpgProgram/EpgProgramMini/ChannelEpgSnapshot/Recent/Setting/Playback/EpgSearchResult
```

FFI **不暴露任何播放器接口**，只到 `resolve_playback → PlaybackInfo` 为止；播放 100% 各端原生，不经 Rust 路由。核已异步化（消除同步阻塞、async engine init），适配移动端主线程约束。

> 注：上表是 android-tv 的 `opentivi.udl`（含 `init_engine -> proxy_port` 与 `get_proxy_port`）。**iOS 侧尚未接入这套代理出口**——`apps/ios/rust/src/lib.rs:167-221` 的 `init_engine` 返回 `()`、不启动 proxy、Engine 无 `proxy_port`/无 `get_proxy_port`。补齐它是 §3 P0f 的一部分。

---

## 2. 架构定调

### 2.1 已决策、不再讨论的边界

| 维度 | 定论 | 依据 |
|---|---|---|
| 总路线 | 共享 Rust 核 + 各端原生 UI/播放 + 按生态 FFI | 已落地于 6 端 |
| 不走 Tauri-mobile | 移动端不复用 React、不用 webview 播放 | iOS WKWebView 不支持 MSE；原生播放/通知/后台/输入差异过大 |
| 播放抽象边界 | Rust 只到 `resolve_playback`，播放器控制不跨 FFI | `opentivi.udl` 无 player 接口 |
| FFI 选型 | Android/iOS = UniFFI 0.28，鸿蒙 = NAPI，桌面 = 直连 | 各 `rust/Cargo.toml` |
| 数据库 | rusqlite bundled（自带 SQLite，版本/FTS 可控） | `crates/opentivi-core/Cargo.toml` |
| 装配 | 无根 workspace，各端 `rust/` 经 `path` 引 `opentivi-core` | 各 `Cargo.toml` |

**100% 共享**：parsers(M3U/Xtream/XMLTV)、models、services(import/epg_matching/channel_identity/health/prewarm)、db+repositories、http、proxy、locales。
**各端一份**：播放器、文件选择、通知/提醒、后台/录制、SMB、输入范式（鼠键 / 遥控器+触屏 / 触屏）。

### 2.2 边界已定，但 `PlaybackInfo` 这个 DTO 要持续演进

`resolve_playback` 的边界对，但其返回的 `PlaybackInfo` 数据结构**不能定死**。当前实测仅 6 个字段（`apps/ios/rust/src/lib.rs:141-148` 与底层 `crates/.../dto.rs:207 PlaybackSourceDto`：channel_id / resolved_channel_id / source_id / channel_name / stream_url / logo_url），不足以驱动一个成熟 IPTV 播放器。要补齐的**具体字段清单**：

| 字段组 | 字段 | 说明 |
|---|---|---|
| **上游请求头**（最该先补） | `headers: Map<String,String>` / `user_agent` / `referer` | IPTV 上游普遍校验 Referer/UA/Cookie；缺它直连必然 403/重定向失败 |
| **代理建议**（最该先补） | `proxy_recommended: bool` / `proxy_url` | core 给出"该走代理还是直连"+ 代理后的 loopback URL |
| **媒体类型提示**（最该先补） | `mime` / `container_hint`（hls / mpegts / native） | core 已能产出（`probe_playback_kind`，`playback_service.rs:98`），但未透出到 DTO |
| 多候选 | `candidates: [{url, priority, health}]` | 候选已按 alive 排序，但**优先级未进 DTO**；播放器据此做有序回退 |
| URL 时效 | `expires_at` / `needs_reresolve: bool` | 临时签名 URL 过期后播放器主动重解析（配合代理被杀场景） |
| catchup | `catchup_type` / `catchup_source` / `catchup_hours` | 回看参数，随 P0d 数据模型一并透出 |
| 失败原因 | `failure_reason` | 解析失败时返回结构化原因，播放器据此提示而非空播 |

> **优先级**：`headers + 代理建议 + mime` 三组最该先补——它们是直连能否成功的决定因素，且 core 大多**已有能力、只差透出**（如 `probe_playback_kind` 已能产 hls/mpegts/native）。

即：播放器**控制**不跨 FFI，但播放**决策信息**要随实战演进。FFI 还需明确定义：错误码、取消、超时、DTO 版本兼容策略。iOS 风险验证（§6 P1）的结果应**反向校验** `PlaybackInfo` 的能力是否够用。**字段扩展 + iOS 接代理出口作为一个独立 P0f 批次落地，见 §3。**

---

## 3. P0：数据模型补齐（对齐成熟 IPTV 客户端）

### 3.1 现状缺口（实地核实）

- **EPG 时间存 TEXT**：`epg.rs:7` `start_at: String`、`0001_init.sql:37` `start_at TEXT NOT NULL` → now/next 查询走字符串比较，时区/格式不保序。
- **频道分组单值**：`channel.rs:11` `group_name: Option<String>`、`0001_init.sql:21` `group_name TEXT` → 无多组、无自定义分组/排序/隐藏。
- **无 catchup / 无软删除 / 无 FTS**。

参照范本：成熟 IPTV 客户端的 Room schema（`~/Downloads/tivimate_schema.sql`，纯 schema，无专有代码）。

### 3.2 落地原则

数据地基**拆成有序小批**，每批独立 PR、独立可回滚，严格串行（逐批稳定后再下一批）。六端的真正风险不在 migration 本身（库是各设备本地、不竞争同一库），而在 **DTO / 查询语义同时变**——靠三类测试兜底：core 迁移测试、旧库快照升级测试、各 FFI 契约测试。

### P0a — EPG 时间 TEXT→epoch（第一个 PR，范围最小）

- `0010_epg_add_epoch.sql`：加 `start_epoch INTEGER / end_epoch INTEGER`（可空），导入端**双写**。
- 一次性 backfill **必须可重入**（幂等，解析旧 TEXT → epoch）。
- **先明确定义**：epoch 单位（秒）、时区 / DST 规则、空值与非法时间的处理。
- `0011_epg_epoch_indexes.sql`：建 epoch 复合索引 `(channel, start, stop, title_len, desc_len)`，**之后**再切读。
- **暂缓 `0012` 删 TEXT 列**：至少跨一个稳定版本观察周期再删（删列 + 旧版回滚都加风险，留旧列成本极低）。
- **第一个 PR 只到"加列 + 双写 + 回填 + 校验 + 升级测试"，不切读、不删列。**
- 伴随项（非 migration，随本批）：EPG 源 url 全局去重 + `etag / last_modified / file_size` 条件请求 304 跳过解析（`0004_epg_channel_aliases.sql` 已有别名雏形）。

### P0b — 软删除 + 稳定频道身份（先于多分组）

- **先定义稳定 identity**：不能依赖易变的 name/url；优先 provider id，回退 `(source_id, 稳定键)`（`0007_channels_per_source_key.sql` 已是这方向）。
- 软删除 `deleted_time`：频道在新 M3U 消失时不物删、只置墓碑，保住 id → 收藏 / 历史 / 续播 / 提醒跨刷新不丢；查询层 `WHERE deleted_time IS NULL`。
- 唯一约束要**允许已删频道复活并恢复原 id**；删除语义**按 source 隔离**；定义 source 删除 / 重新导入 / 长期墓碑清理策略。

### P0c — 频道↔分组多对多

- 新增 `channel_groups` + `channel_group_links(channel_id, group_id, UNIQUE)`，保留 `channels` 单一 `original_group`（双轨：供应商原始归属 + 用户多组 membership）。M3U `group-title="A;B"` 用 `;` 拆分。

### P0d — catchup

- playlist + channel 两级 `catchup_type / catchup_source(URL 模板) / catchup_hours`。
- **保留原始属性**（type / URL 模板 / 时间格式 / 时区 / 原始 days）；`catchup-days × 24` 只作归一化结果，不作完整模型。

### P0e — FTS5（可推迟到真实搜索需求出现）

- channel / program 名做 FTS5（content 外部表 + trigger 同步，tokenize=unicode61）。
- **确认所有目标端的 SQLite 构建都启用了 FTS5**——由 Rust `rusqlite bundled` 统一保证，不依赖系统 SQLite。

### P0f — `PlaybackInfo` 扩展 + iOS 接代理出口（独立 P0 批次，触及各端 FFI DTO）

这批不动 DB schema，但**会同时改各端 FFI 契约**，单独成批、配契约测试。

- **扩展 `PlaybackSourceDto`（`dto.rs:207`）/ `PlaybackInfo`（`apps/ios/rust/src/lib.rs:141-148`）**：按 §2.2 字段清单补字段，**先落 `headers + 代理建议 + mime` 三组**（core 已有能力，如 `probe_playback_kind`（`playback_service.rs:98`）能产 hls/mpegts/native，候选已按 alive 排序——把这些透出到 DTO 即可）。
- **iOS 接 `get_proxy_port` + 启动 core 代理**：`init_engine`（`apps/ios/rust/src/lib.rs:167-221`）当前返回 `()`、不调 `start_proxy_server()`、Engine 无 `proxy_port`——对齐 android-tv 的整套代理出口，让 iOS 播放器能走 loopback 代理注入 Referer/UA/Cookie（与 §4 选项 2 一致；即便维持选项 1，代理出口也是注入上游 headers 的前置）。
- **触及面**：android/ios 的 `*.udl` + harmony 的 napi DTO 三端 FFI 表面同时变。
- **测试**：core DTO 序列化测试 + 三端 FFI 契约测试 + 旧 binding 兼容（DTO 版本策略）。

> P0f 与 P1 iOS kill-spike 互为前提：kill-spike 实测会反推还缺哪些字段，代理出口是 §4 选项 2 落地的硬依赖。

---

## 4. 播放层各端现状与缺口

| 端 | 现状 | 冷门编码(AC3/EAC3/DTS)缺口 | 路线 |
|---|---|---|---|
| desktop | hls.js + mpegts.js（webview） | webview 不解 Dolby/DTS | 中期 mpv sidecar → libmpv 嵌入（内置 FFmpeg 全解） |
| android-tv/phone | Media3 ExoPlayer，硬解优先 | 加 `media3-decoder-ffmpeg`（**仅音频**软解，补 AC3/EAC3/DTS/TrueHD；视频仍走 MediaCodec 硬解） | 已对路，补 ffmpeg 音频扩展 |
| ios | **VLCKit 直连**（`StreamPlayer.swift:6` `import VLCKitSPM`、:22 `VLCMediaPlayer`；全工程 0 处 `AVPlayer`；`vlckit-spm` 锁 3.6.0） | VLC 内置解码器全覆盖（含 AC3/EAC3/DTS/MKV） | **当前已 VLC-only，需拍板取舍——见下决策点** |
| harmony | ArkTS 播放 | 待评估 AVPlayer(OHOS) 能力 | 成熟度最低，先打通基础播放 |

稳态方案（android/桌面）：**视频硬解 + FFmpeg 仅 audio-only 兜底**（范本 `libffmpegJNI.so` 只编音频解码器、无视频/demux）。这两端照此即可，**不必造全能播放器**。

### iOS 播放层决策点（kill-spike 校正后必须拍板）

**代码现状与本方案原描述不一致，须先决策。** 代码现状（kill-spike 实证）：iOS 播放层已是 **VLCKit 直连**，且：

- 播放器一步到位上 VLC，**跳过**了本方案原设想的"AVPlayer 直连 → core 代理 → 仍不行才上 VLCKit"递进（`StreamPlayer.swift:6/22`，全工程 `grep AVPlayer` 0 命中）。
- iOS 端**未启动 core 代理**：`apps/ios/rust/src/lib.rs:167-221` 的 `init_engine` 从不调 `start_proxy_server()`，Engine 无 `proxy_port` 字段、无 `get_proxy_port` 导出（对比 android-tv `lib.rs` 有整套）。VLC 直吃上游裸 URL，**无法注入 Referer / UA / Cookie**。
- VLCKit 许可为 **LGPL/GPL**，且现已**无条件**背上——与下文"VLCKit 非预设必需、有门槛才上"原则直接相悖。

**两个选项（择一拍板，不可两存）：**

- **选项 1 — 维持 VLC-only（代码现状）**：实现简单、解码覆盖最全（一个播放器吃掉所有冷门编码 / MKV / 坏流）。代价：背 **LGPL/GPL App Store 合规审查**（最高残余风险）、包体显著增大、缺乏 PiP / 后台 / 锁屏的原生配套（VLCKit 路线需自行补齐），且当前 VLC 绕过 core 代理，Referer/UA/Cookie 注入能力缺失。
- **选项 2 — 回退到本方案原设想**：AVPlayer 直连优先 + core 代理修 headers/Range/重定向 + VLC 仅作兜底。合规风险小（多数流走 AVPlayer，VLC 仅在必要时启用）、PiP / 后台 / 锁屏原生友好。代价：要补 iOS 侧 core 代理接入（`get_proxy_port` + `init_engine` 启动 proxy）、维护双播放器状态一致性、并实测 AVPlayer 对长尾流兼容性。

> **现状对照**：代码现状 = 选项 1；本方案原描述 = 选项 2。二者不一致，**需决策**。

**推荐：选项 2（AVPlayer 优先 + core 代理 + VLC 兜底）。** 理由：(a) App Store 对 LGPL/GPL + IPTV 的合规审查是可毙整端的最高残余风险，选项 1 让全部用户流量无条件落在 VLCKit 上，把这条风险从"按需承担"变成"必然承担"；(b) 当前 VLC-only 已经绕过 core 代理，等于丢掉了 Referer/UA/Cookie 注入这一 IPTV 实战刚需，而补代理的工作选项 2 本就要做；(c) PiP / 后台 / 锁屏在 AVPlayer 上是系统原生能力，VLCKit 需手工搭建生命周期。选项 1 的唯一优势是解码覆盖，但这正是"仅在 corpus 证伪 AVPlayer 时才上 VLC"的兜底场景能覆盖的——把 VLC 留作兜底既保解码、又把合规面收敛到少数真正需要它的流。**若选项 1，必须先取得 App Store LGPL/GPL 合规结论再继续投入**（详见 §6 P1）。

**iOS VLCKit 引入门槛**（选项 2 下的递进条件，不预设必需）：
1. 先测 AVPlayer 直连；
2. 再测 core 代理能否修好 headers / Range / 重定向等问题；
3. **只有目标 corpus 仍有不可接受失败率时**才集成 VLCKit。

VLCKit 会带来包体 / 构建 / 授权合规 / 审核 / 双播放器状态一致性成本，不应提前永久背负。

---

## 5. 跨端横切与各端特定

**跨端横切（core 做一份，各端接 FFI）**：
- 数据模型补齐（§3）
- 提醒 / 通知：core 维护提醒表 + 下一批定时；发送各端原生（Android Notification / iOS UNUserNotification / 鸿蒙）
- 备份 / 恢复：core 用 SQLite `VACUUM INTO` 出一致快照 + zip 打包，各端只管文件选择
- 录制 / timeshift：core 管 FFmpeg 分片 + 配额；移动端注意后台 / 休眠
- SMB / NAS：优先系统挂载，凭据交给 OS

**各端特定**：
- 输入范式：桌面鼠键 / TV 遥控器+焦点（android-tv Compose-TV 已起步，见 `docs/focus-group-wrapper.md`）/ 手机+iOS 触屏
- **移动端本地代理安全与生命周期**：进程被系统杀后 `127.0.0.1` 服务必然消失，不能当保证。准则——直连始终优先；代理**只绑 loopback + 随机端口 + 临时 token**；**不笼统"放开私网"，只豁免 loopback**（防 SSRF / 局域网暴露）；完整支持 HEAD / Range / 重定向 / 取消 / 超时 / 上游 headers；代理重启后**重新 `resolve_playback`** + 播放器收到连接失败做一次受控重试；后台音频 / PiP 仅作延长存活手段，非可靠保活。若要求"App 被杀后仍持续播放"，只能改产品定义或用系统下载 / 离线机制。
- harmony 两端 + android-phone 需补进 README 与 CI

**构建 / 发布**：移动端 `tauri-action` 不适用，各自 CI（Gradle / Xcode / DevEco）；iOS 需签名 IPA + TestFlight。

---

## 6. 路线图

> P0 与 P1 **并行**：iOS 风险验证不必等数据地基做完，它可能反推 `PlaybackInfo` / 代理能力需求，应尽早并行启动。

- **P0 数据地基（拆批串行，见 §3）**：P0a EPG epoch → P0b 软删除+稳定身份 → P0c 多分组 → P0d catchup → P0e FTS5（可推迟）。每批独立 PR / 可回滚，配 core 迁移测试 + 旧库快照升级测试 + FFI 契约测试。
- **P0f `PlaybackInfo` 扩展 + iOS 代理出口（独立 P0 批次，见 §3）**：补 headers/代理建议/mime 等字段、iOS 接 `get_proxy_port` + 启动 proxy；触各端 FFI DTO，配契约测试。可与数据地基并行，但要先于（或同步于）P1 选项 2 落地。
- **P1 iOS kill-spike（与 P0 并行，最高风险前置）**：风险已经 kill-spike 校正——代码现状是 **VLC-only**（见 §4 决策点），剩余步骤：
  1. **（有网后）VLC 实播 corpus 证伪解码风险**：真机最坏流（AC3/EAC3/DTS / 坏流 / MKV / 超长 EPG）跑通，确认 VLC 解码覆盖（当前构建唯一卡点是无外网拉不到 `vlckit-spm`，Rust iOS staticlib 离线可编过）。
  2. **App Store LGPL/GPL + IPTV 审核（最高残余风险，可毙整端）**：VLCKit = LGPL/GPL，若维持选项 1 则全部流量无条件背此风险，须先取得合规结论；选项 2 把 VLC 收敛为兜底以缩小合规面。"带 demo 源审核"先确保内容授权 / 隐私合规。
  3. **后台 / 锁屏 / PiP + 代理生命周期（需真机，当前未配）**：iOS 当前无 `UIBackgroundModes` / 无 PiP / 无相关 entitlements，且 `NSAllowsArbitraryLoads=true`（审核需说明）；VLCKit 路线这些要手工搭建，AVPlayer 路线多为系统原生——实测并据此校验 `PlaybackInfo` / 代理能力。
- **P2 Android 双端打磨**：Media3 + ffmpeg 音频扩展、TV 焦点/Back/生命周期、phone 触屏交互；上 Play 审核。
- **P3 桌面解码拉齐 + 功能扩展**：桌面迁 libmpv 补冷门编码；catchup 回看、录制、提醒落地。
- **P4 鸿蒙两端（押后但不冻结）**：core 每次 schema/FFI 变更跑 NAPI 编译 + init/import/query/resolve_playback 冒烟测试，固定 napi-ohos / NDK / ABI / 打包工具链版本；功能对齐留到本阶段。主要风险是 NAPI 异步线程模型 / Rust 错误映射 / `i64` 时间戳精度 / 动态库打包。

---

## 7. 风险登记

| 风险 | 级别 | 处置 |
|---|---|---|
| iOS 播放层合规 + 上架：VLCKit(LGPL/GPL) 现状已无条件背上 + IPTV 审核 | 高（可毙整端） | §4 决策点拍板（推荐选项 2：AVPlayer 优先 + 代理 + VLC 兜底，收敛合规面）；P1 kill-spike 前置取合规结论 + demo 源审核 |
| 移动端本地代理后台被杀 / SSRF / 局域网暴露 | 中高 | 直连为主；代理只绑 loopback+随机端口+临时 token、只豁免 loopback；进程被杀不保活，重启后重解析 |
| 数据模型改动影响 6 端 | 中 | 拆批 + expand-and-contract 渐进迁移，core 先行，三类测试兜底 |
| 鸿蒙生态成熟度 / 工具链 | 中 | 押后到 P4，但保持编译 + 最小链路测试，先保三大端 |
| 无根 workspace、各端独立构建 | 低 | 各自 CI，core 版本统一 |

---

*本方案经两轮独立对抗评审收敛：第一轮否决了早期的 Tauri-mobile 路线（现已改为 native + UniFFI/NAPI 并落地）；第二轮将数据地基拆批、明确了 `PlaybackInfo` 演进、代理 loopback 安全、VLCKit 引入门槛与鸿蒙不冻结策略，相关结论已内化进上文。iOS 经 kill-spike 校正：实为 VLC-only（非方案原描述的 AVPlayer 优先），详见 §4 决策点。*
