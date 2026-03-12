# OpenTIVI Design System

## 目标

为桌面端组件库建立统一的视觉基础，先覆盖最常用的基础 token：

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

### 1. Core token

底层原始值，例如：

- `--color-neutral-950`
- `--color-brand-500`
- `--font-size-md`
- `--radius-md`

这层定义数值本身，不直接表达业务语义。

### 2. Semantic token

组件和页面应优先使用语义 token：

- `--color-bg-canvas`
- `--color-bg-surface`
- `--color-text-primary`
- `--color-fill-brand`
- `--color-border-subtle`

这样后续换主题或微调品牌色，只需要改 token 映射，不需要全局搜样式值。

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

- 页面标题：`--font-size-2xl` 或 `--font-size-3xl`
- 模块标题：`--font-size-lg`
- 正文/按钮：`--font-size-md`
- 标签/表头：`--font-size-sm`
- 状态徽标：`--font-size-xs`

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

## 下一步建议

1. 将 `ChannelsView`、`VideoPlayer` 等大页面中的散落尺寸和颜色逐步替换为 token。
2. 抽出基础组件层，例如 `Button`、`Chip`、`Badge`、`Panel`。
3. 如果后续支持浅色主题，再增加 `:root[data-theme="light"]` 的语义 token 映射。
