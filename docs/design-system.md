# OpenTIVI Desktop Design System Migration Guide

## 文档定位

这份文档用于说明 Desktop 端如何接入和迁移共享设计系统。

- 视觉 token 的唯一事实源：`shared/design/tokens.json`
- 设计原则与平台规则：`shared/design/DESIGN_GUIDE.md`
- 本文档只负责 Desktop 的落地方式、别名兼容和渐进替换策略

## 目标

为桌面端组件库建立统一的视觉基础，并对接共享设计系统中最常用的基础 token：

- Color：背景、文字、边框、品牌色、状态色
- Typography：字体族、字号、字重、行高
- Spacing：布局和组件节奏
- Radius：控件与容器圆角
- Elevation：阴影与层级
- Motion：过渡时长与缓动

## 设计原则

1. 先语义化，再组件化。组件不要直接写死颜色，优先引用语义 token。
2. 大屏/TV 场景优先。焦点状态必须明显，对比度优先于装饰感。
3. 同层级用同尺度。字号、圆角、间距尽量从固定刻度取值，不做随意扩散。
4. 兼容渐进改造。保留旧变量别名，避免一次性重构全部页面。

## Token 分层

### 1. Canonical token

底层原始值，例如：

- `--background`
- `--primary`
- `--font-size-body`
- `--radius-md`

这层来自共享 token 资产，是推荐的新代码使用入口。

### 2. Desktop compatibility alias

为了兼容旧页面，Desktop 端保留一层语义别名：

- `--color-bg-canvas`
- `--color-bg-surface`
- `--color-text-primary`
- `--color-fill-brand`
- `--color-border-subtle`

这些别名最终映射回 canonical token，避免一次性重写所有页面。

规则：

- 新共享组件优先使用 canonical token
- 旧页面渐进迁移时可以继续使用 alias
- 不要再新增散落色值或第三套命名体系

## 推荐使用规范

### Color

- 页面背景：`--color-bg-canvas`
- 卡片/section：`--color-bg-surface`
- 输入框/次级按钮：`--color-bg-subtle`
- 主文本：`--color-text-primary`
- 次要文本：`--color-text-secondary`
- 主操作：`--color-fill-brand`
- 危险操作：`--color-fill-danger`

不要直接在组件里写 `#fff`、`#333`、`#ef4444` 之类的散值，除非是媒体内容本身。

### Typography

- 页面标题：优先 `--font-size-h1` / `--font-size-h2`
- 模块标题：优先 `--font-size-h3` / `--font-size-h4`
- 正文/按钮：优先 `--font-size-body`
- 标签/表头：优先 `--font-size-caption` / `--font-size-overline`
- 状态徽标：优先 `--font-size-badge`

兼容旧代码时，`--font-size-md/lg/2xl/3xl` 等 legacy alias 仍可使用，但不建议继续扩散。

### Spacing

- 组件内部优先使用 `8 / 12 / 16`
- 模块内部优先使用 `16 / 20 / 24`
- 页面分区优先使用 `24 / 32 / 40`

### Radius

- 输入框、小按钮：`--radius-sm`
- 卡片、列表项：`--radius-md`
- 面板、hero：`--radius-lg`
- chip：`--radius-pill`

### Focus

- 所有可聚焦组件统一使用 `--shadow-focus-ring`
- 不允许只靠微弱边框变化表达焦点

## 当前落地范围

- 全局 token：`apps/desktop/src/styles/tokens.css`
- 全局样式入口：`apps/desktop/src/main.tsx`
- token 元数据：`apps/desktop/src/styles/designTokens.ts`
- 可视化示例页：`apps/desktop/src/features/dev/DevComponentsView.tsx`

其中：

- `tokens.css` 是 Desktop 运行时变量层
- `designTokens.ts` 是从共享 token 生成的元数据
- legacy alias 仅用于迁移兼容，不代表新的规范主命名

## Legacy Alias 清退计划

`tokens.css` 中的 legacy alias（如 `--bg-primary`、`--text-secondary`、`--color-bg-canvas` 等）已标记为 `@deprecated`。

### 迁移映射

| Legacy Alias | Canonical Token | 说明 |
|---|---|---|
| `--bg-primary` | `--background` | 页面背景 |
| `--bg-secondary` | `--card` | 卡片/容器背景 |
| `--bg-tertiary` | `--secondary` | 次级背景 |
| `--text-primary` | `--foreground` | 主文字 |
| `--text-secondary` | `--muted-foreground` | 次要文字 |
| `--color-bg-canvas` | `--background` | 同 --bg-primary |
| `--color-bg-surface` | `--card` | 同 --bg-secondary |
| `--color-bg-subtle` | `--secondary` | 同 --bg-tertiary |
| `--color-bg-elevated` | `--popover` | 浮层背景 |
| `--color-text-primary` | `--foreground` | 同 --text-primary |
| `--color-text-secondary` | `--muted-foreground` | 同 --text-secondary |
| `--color-text-muted` | `--muted-foreground` | 同上 |
| `--color-fill-brand` | `--primary` | 品牌色 |
| `--color-fill-danger` | `--destructive` | 危险色 |
| `--color-border-subtle` | `--border` | 边框色 |
| `--accent-hover` | `--primary` (with brightness) | 悬停态 |
| `--danger` | `--live` 或 `--destructive` | 视语境选择 |

### 规则

- **新代码**：只使用 canonical token
- **现有代码**：遇到修改时顺带迁移
- **计划清除**：下一个 major version 移除所有 legacy alias

## 下一步建议

1. 将 `ChannelsView`、`VideoPlayer` 等大页面中的散落尺寸和颜色逐步替换为 token。
2. 抽出基础组件层，例如 `Button`、`Chip`、`Badge`、`Panel`。
3. 如果后续支持浅色主题，再增加 `:root[data-theme="light"]` 的语义 token 映射。
