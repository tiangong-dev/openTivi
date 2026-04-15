// AUTO-GENERATED from shared/design/tokens.json — do not edit manually

export interface DesignTokenItem {
  name: string;
  value: string;
  usage: string;
}

export const colorTokens: DesignTokenItem[] = [
  { name: "--background", value: "hsl(240, 10%, 4%)", usage: "应用整体背景" },
  { name: "--foreground", value: "hsl(0, 0%, 95%)", usage: "主要文字" },
  { name: "--card", value: "hsl(240, 6%, 10%)", usage: "主内容容器、卡片底色" },
  { name: "--card-foreground", value: "hsl(0, 0%, 95%)", usage: "卡片文字" },
  { name: "--popover", value: "hsl(240, 6%, 15%)", usage: "弹层、浮层、选中卡片" },
  { name: "--popover-foreground", value: "hsl(0, 0%, 95%)", usage: "弹层文字" },
  { name: "--primary", value: "hsl(217, 91%, 60%)", usage: "主按钮、可交互高亮" },
  { name: "--primary-foreground", value: "hsl(0, 0%, 100%)", usage: "主按钮文字" },
  { name: "--secondary", value: "hsl(240, 4%, 16%)", usage: "次级按钮、输入框、表头" },
  { name: "--secondary-foreground", value: "hsl(0, 0%, 95%)", usage: "次级按钮文字" },
  { name: "--muted", value: "hsl(240, 4%, 16%)", usage: "弱化背景" },
  { name: "--muted-foreground", value: "hsl(240, 5%, 65%)", usage: "说明文字、弱化信息" },
  { name: "--destructive", value: "hsl(0, 70%, 64%)", usage: "错误状态、删除操作" },
  { name: "--destructive-foreground", value: "hsl(0, 0%, 95%)", usage: "错误状态文字" },
  { name: "--success", value: "hsl(142, 71%, 45%)", usage: "成功状态" },
  { name: "--success-foreground", value: "hsl(150, 50%, 10%)", usage: "成功状态文字" },
  { name: "--warning", value: "hsl(38, 92%, 50%)", usage: "警告状态" },
  { name: "--warning-foreground", value: "hsl(38, 92%, 14%)", usage: "警告状态文字" },
  { name: "--border", value: "hsl(240, 4%, 16%)", usage: "默认描边" },
  { name: "--ring", value: "hsl(217, 91%, 60%)", usage: "焦点环" },
  { name: "--favorite", value: "hsl(45, 93%, 47%)", usage: "收藏高亮" },
  { name: "--live", value: "hsl(0, 84%, 61%)", usage: "直播状态" },
];

export const typographyTokens: DesignTokenItem[] = [
  { name: "--font-family-sans", value: "Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, sans-serif", usage: "默认 UI 字体" },
  { name: "--font-family-mono", value: "JetBrains Mono, SF Mono, Consolas, monospace", usage: "代码、数据标签" },
  { name: "--font-size-badge", value: "10px", usage: "徽标文字" },
  { name: "--font-size-overline", value: "11px", usage: "大写标签" },
  { name: "--font-size-caption", value: "12px", usage: "表头、标签、次要说明" },
  { name: "--font-size-small", value: "13px", usage: "辅助正文" },
  { name: "--font-size-body", value: "14px", usage: "正文、默认按钮" },
  { name: "--font-size-body-large", value: "16px", usage: "模块标题、关键字段" },
  { name: "--font-size-h4", value: "16px", usage: "四级标题" },
  { name: "--font-size-h3", value: "20px", usage: "三级标题" },
  { name: "--font-size-h2", value: "24px", usage: "二级标题" },
  { name: "--font-size-h1", value: "32px", usage: "一级标题" },
  { name: "--font-size-display", value: "48px", usage: "大屏强调信息" },
  { name: "--line-height-tight", value: "1.2", usage: "标题与高密度数字" },
  { name: "--line-height-normal", value: "1.5", usage: "正文默认" },
  { name: "--line-height-relaxed", value: "1.65", usage: "长文案、说明文" },
];

export const radiusTokens: DesignTokenItem[] = [
  { name: "--radius-sm", value: "6px", usage: "按钮、输入框" },
  { name: "--radius-md", value: "8px", usage: "卡片" },
  { name: "--radius-lg", value: "12px", usage: "面板、模态" },
  { name: "--radius-xl", value: "16px", usage: "大型浮层" },
  { name: "--radius-2xl", value: "24px", usage: "特大圆角" },
  { name: "--radius-pill", value: "9999px", usage: "胶囊标签、筛选 chip" },
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
  { name: "--shadow-sm", value: "0 1px 2px hsla(0, 0%, 0%, 0.05)", usage: "微弱阴影" },
  { name: "--shadow-md", value: "0 4px 6px hsla(0, 0%, 0%, 0.07), 0 1px 3px hsla(0, 0%, 0%, 0.06)", usage: "悬浮面板" },
  { name: "--shadow-lg", value: "0 10px 15px hsla(0, 0%, 0%, 0.1), 0 4px 6px hsla(0, 0%, 0%, 0.05)", usage: "浮层" },
  { name: "--shadow-xl", value: "0 20px 25px hsla(0, 0%, 0%, 0.15), 0 8px 10px hsla(0, 0%, 0%, 0.06)", usage: "模态、关键层级" },
  { name: "--shadow-focus-ring", value: "0 0 0 2px var(--ring)", usage: "TV 焦点、键盘焦点" },
];
