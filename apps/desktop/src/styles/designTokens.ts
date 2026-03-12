export interface DesignTokenItem {
  name: string;
  value: string;
  usage: string;
}

export const colorTokens: DesignTokenItem[] = [
  { name: "--color-bg-canvas", value: "#071018", usage: "应用整体背景" },
  { name: "--color-bg-surface", value: "#0d1722", usage: "主内容容器、卡片底色" },
  { name: "--color-bg-subtle", value: "#162131", usage: "次级按钮、输入框、表头" },
  { name: "--color-bg-elevated", value: "#1a2738", usage: "弹层、浮层、选中卡片" },
  { name: "--color-text-primary", value: "#edf3fb", usage: "主要文字" },
  { name: "--color-text-secondary", value: "#a4b2c3", usage: "说明文字、弱化信息" },
  { name: "--color-text-muted", value: "#78889b", usage: "占位、辅助状态" },
  { name: "--color-fill-brand", value: "#2d8cff", usage: "主按钮、可交互高亮" },
  { name: "--color-fill-brand-hover", value: "#5ca6ff", usage: "主按钮 hover" },
  { name: "--color-success-500", value: "#12b981", usage: "成功状态" },
  { name: "--color-warning-500", value: "#f59e0b", usage: "警告状态" },
  { name: "--color-danger-500", value: "#ef4444", usage: "错误状态、删除操作" },
  { name: "--color-border-subtle", value: "rgba(169, 180, 194, 0.18)", usage: "默认描边" },
  { name: "--color-border-strong", value: "rgba(169, 180, 194, 0.32)", usage: "强调描边、分组边界" },
];

export const typographyTokens: DesignTokenItem[] = [
  { name: "--font-family-sans", value: "SF Pro Display / Segoe UI / PingFang SC", usage: "默认 UI 字体" },
  { name: "--font-family-mono", value: "SFMono-Regular / JetBrains Mono", usage: "代码、数据标签" },
  { name: "--font-size-xs", value: "11px", usage: "状态徽标、辅助数字" },
  { name: "--font-size-sm", value: "12px", usage: "表头、标签、次要说明" },
  { name: "--font-size-md", value: "14px", usage: "正文、默认按钮" },
  { name: "--font-size-lg", value: "16px", usage: "模块标题、关键字段" },
  { name: "--font-size-xl", value: "18px", usage: "弹层标题" },
  { name: "--font-size-2xl", value: "24px", usage: "页面标题" },
  { name: "--font-size-3xl", value: "32px", usage: "大屏强调信息" },
  { name: "--line-height-tight", value: "1.2", usage: "标题与高密度数字" },
  { name: "--line-height-normal", value: "1.5", usage: "正文默认" },
  { name: "--line-height-relaxed", value: "1.65", usage: "长文案、说明文" },
];

export const radiusTokens: DesignTokenItem[] = [
  { name: "--radius-sm", value: "8px", usage: "输入框、小按钮" },
  { name: "--radius-md", value: "12px", usage: "卡片、表格行" },
  { name: "--radius-lg", value: "16px", usage: "模块容器、面板" },
  { name: "--radius-xl", value: "20px", usage: "大型浮层" },
  { name: "--radius-pill", value: "999px", usage: "胶囊标签、筛选 chip" },
  { name: "--radius-round", value: "50%", usage: "圆形按钮" },
];

export const spacingTokens: DesignTokenItem[] = [
  { name: "--space-1", value: "4px", usage: "最小间距、细微内边距" },
  { name: "--space-2", value: "8px", usage: "图标与文字、紧凑间隔" },
  { name: "--space-3", value: "12px", usage: "控件默认垂直节奏" },
  { name: "--space-4", value: "16px", usage: "卡片内边距、区块间距" },
  { name: "--space-5", value: "20px", usage: "模块内容区" },
  { name: "--space-6", value: "24px", usage: "页面级留白" },
  { name: "--space-8", value: "32px", usage: "大区块分隔" },
  { name: "--space-10", value: "40px", usage: "Hero 或空状态留白" },
];

export const elevationTokens: DesignTokenItem[] = [
  { name: "--shadow-elevation-1", value: "0 10px 30px rgba(2, 8, 16, 0.24)", usage: "悬浮面板" },
  { name: "--shadow-elevation-2", value: "0 18px 44px rgba(2, 8, 16, 0.34)", usage: "模态、关键层级" },
  { name: "--shadow-focus-ring", value: "focus ring", usage: "TV 焦点、键盘焦点" },
];
