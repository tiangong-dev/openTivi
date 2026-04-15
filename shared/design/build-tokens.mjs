#!/usr/bin/env node
/**
 * build-tokens.mjs
 *
 * Reads shared/design/tokens.json (the Single Source of Truth) and generates
 * platform-specific theme files for Desktop, Android TV, and iOS.
 *
 * Usage: node shared/design/build-tokens.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const tokens = JSON.parse(readFileSync(join(__dirname, 'tokens.json'), 'utf8'));

const HEADER = '// AUTO-GENERATED from shared/design/tokens.json — do not edit manually\n';
const generated = [];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse an HSL string like "hsl(240, 10%, 4%)" into { h, s, l } where
 * h is 0-360, s and l are 0-100.
 */
function parseHSL(str) {
  const m = str.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
  if (!m) throw new Error(`Cannot parse HSL: ${str}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/**
 * Convert HSL (h 0-360, s 0-100, l 0-100) to RGB (0-255 ints).
 */
function hslToRGB(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r1, g1, b1;
  if (h < 60)       { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else              { r1 = c; g1 = 0; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** camelCase → PascalCase */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** camelCase → kebab-case */
function camelToKebab(s) {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/** Weight number → Kotlin FontWeight constant */
function kotlinFontWeight(w) {
  switch (w) {
    case 400: return 'FontWeight.Normal';
    case 500: return 'FontWeight.Medium';
    case 600: return 'FontWeight.SemiBold';
    case 700: return 'FontWeight.Bold';
    default:  return `FontWeight(${w})`;
  }
}

// ─── 1. Desktop: designTokens.ts ───────────────────────────────────────────────

function buildDesktopTokens() {
  const darkColors = tokens.color.dark;
  const typography = tokens.typography;
  const radius = tokens.radius;
  const spacing = tokens.spacing;
  const shadow = tokens.shadow;

  // Color tokens — dark mode values (desktop defaults)
  const colorUsageMap = {
    background: '应用整体背景',
    foreground: '主要文字',
    card: '主内容容器、卡片底色',
    cardForeground: '卡片文字',
    popover: '弹层、浮层、选中卡片',
    popoverForeground: '弹层文字',
    primary: '主按钮、可交互高亮',
    primaryForeground: '主按钮文字',
    secondary: '次级按钮、输入框、表头',
    secondaryForeground: '次级按钮文字',
    muted: '弱化背景',
    mutedForeground: '说明文字、弱化信息',
    destructive: '错误状态、删除操作',
    destructiveForeground: '错误状态文字',
    success: '成功状态',
    successForeground: '成功状态文字',
    warning: '警告状态',
    warningForeground: '警告状态文字',
    border: '默认描边',
    ring: '焦点环',
    favorite: '收藏高亮',
    live: '直播状态',
  };

  const colorLines = [];
  for (const [key, usage] of Object.entries(colorUsageMap)) {
    if (!darkColors[key]) continue;
    const cssName = `--${camelToKebab(key)}`;
    colorLines.push(`  { name: "${cssName}", value: "${darkColors[key].$value}", usage: "${usage}" },`);
  }

  // Typography tokens
  const typoLines = [];
  typoLines.push(`  { name: "--font-family-sans", value: "${typography.fontFamily.sans}", usage: "默认 UI 字体" },`);
  typoLines.push(`  { name: "--font-family-mono", value: "${typography.fontFamily.mono}", usage: "代码、数据标签" },`);

  const scaleUsageMap = {
    badge: '徽标文字',
    overline: '大写标签',
    caption: '表头、标签、次要说明',
    small: '辅助正文',
    body: '正文、默认按钮',
    bodyLarge: '模块标题、关键字段',
    h4: '四级标题',
    h3: '三级标题',
    h2: '二级标题',
    h1: '一级标题',
    display: '大屏强调信息',
  };
  // Ordered by size ascending
  const scaleOrder = ['badge', 'overline', 'caption', 'small', 'body', 'bodyLarge', 'h4', 'h3', 'h2', 'h1', 'display'];
  for (const key of scaleOrder) {
    const s = typography.scale[key];
    const cssName = `--font-size-${camelToKebab(key)}`;
    typoLines.push(`  { name: "${cssName}", value: "${s.size}px", usage: "${scaleUsageMap[key]}" },`);
  }
  typoLines.push(`  { name: "--line-height-tight", value: "1.2", usage: "标题与高密度数字" },`);
  typoLines.push(`  { name: "--line-height-normal", value: "1.5", usage: "正文默认" },`);
  typoLines.push(`  { name: "--line-height-relaxed", value: "1.65", usage: "长文案、说明文" },`);

  // Radius tokens
  const radiusUsageMap = {
    sm: '按钮、输入框',
    md: '卡片',
    lg: '面板、模态',
    xl: '大型浮层',
    '2xl': '特大圆角',
  };
  const radiusLines = [];
  for (const [key, val] of Object.entries(radius)) {
    if (key === 'none') continue;
    if (key === 'full') {
      radiusLines.push(`  { name: "--radius-pill", value: "${val}px", usage: "胶囊标签、筛选 chip" },`);
    } else {
      radiusLines.push(`  { name: "--radius-${key}", value: "${val}px", usage: "${radiusUsageMap[key] || key}" },`);
    }
  }
  radiusLines.push(`  { name: "--radius-round", value: "50%", usage: "圆形按钮" },`);

  // Spacing tokens
  const spacingUsageMap = {
    '1': '最小间距、细微内边距',
    '2': '图标与文字、紧凑间隔',
    '3': '控件默认垂直节奏',
    '4': '卡片内边距、区块间距',
    '5': '模块内容区',
    '6': '页面级留白',
    '8': '大区块分隔',
    '10': 'Hero 或空状态留白',
  };
  const spacingLines = [];
  for (const [key, val] of Object.entries(spacingUsageMap)) {
    spacingLines.push(`  { name: "--space-${key}", value: "${tokens.spacing[key]}px", usage: "${val}" },`);
  }

  // Elevation tokens
  const elevationLines = [];
  for (const [key, val] of Object.entries(shadow)) {
    elevationLines.push(`  { name: "--shadow-${key}", value: "${val}", usage: "${{ sm: '微弱阴影', md: '悬浮面板', lg: '浮层', xl: '模态、关键层级' }[key] || key}" },`);
  }
  elevationLines.push(`  { name: "--shadow-focus-ring", value: "0 0 0 2px var(--ring)", usage: "TV 焦点、键盘焦点" },`);

  const out = `${HEADER}
export interface DesignTokenItem {
  name: string;
  value: string;
  usage: string;
}

export const colorTokens: DesignTokenItem[] = [
${colorLines.join('\n')}
];

export const typographyTokens: DesignTokenItem[] = [
${typoLines.join('\n')}
];

export const radiusTokens: DesignTokenItem[] = [
${radiusLines.join('\n')}
];

export const spacingTokens: DesignTokenItem[] = [
${spacingLines.join('\n')}
];

export const elevationTokens: DesignTokenItem[] = [
${elevationLines.join('\n')}
];
`;

  const outPath = join(ROOT, 'apps/desktop/src/styles/designTokens.ts');
  writeFileSync(outPath, out);
  generated.push(outPath);
}

// ─── 2. Android TV: Color.kt ──────────────────────────────────────────────────

function buildAndroidColors() {
  const dark = tokens.color.dark;
  const tv = tokens.platform.tv;

  const lines = [HEADER];
  lines.push('package com.opentivi.tv.ui.theme');
  lines.push('');
  lines.push('import androidx.compose.ui.graphics.Color');
  lines.push('');
  lines.push('// Semantic colors — Dark mode (TV is always dark)');

  const colorKeys = [
    'background', 'foreground', 'card', 'cardForeground',
    'popover', 'popoverForeground', 'primary', 'primaryForeground',
    'secondary', 'secondaryForeground', 'muted', 'mutedForeground',
    'accent', 'accentForeground', 'destructive', 'destructiveForeground',
    'success', 'successForeground', 'warning', 'warningForeground',
    'border', 'input', 'ring', 'favorite', 'live',
  ];

  for (const key of colorKeys) {
    const entry = dark[key];
    if (!entry) continue;
    const name = 'Tivi' + capitalize(key);
    const { h, s, l } = parseHSL(entry.$value);

    // Special case: pure white → Color.White
    if (h === 0 && s === 0 && l === 100) {
      lines.push(`val ${name} = Color.White`);
    } else {
      lines.push(`val ${name} = Color.hsl(${h}f, ${(s / 100).toFixed(2)}f, ${(l / 100).toFixed(2)}f)`);
    }
  }

  // Overlay tokens
  lines.push('');
  lines.push('// Overlay — semi-transparent surfaces');
  const overlay = tokens.overlay;
  for (const [key, entry] of Object.entries(overlay)) {
    if (key.startsWith('$') || typeof entry.color !== 'string') continue;
    const name = 'TiviOverlay' + capitalize(key);
    const { h, s, l } = parseHSL(entry.color);
    lines.push(`val ${name} = Color.hsl(${h}f, ${(s / 100).toFixed(2)}f, ${(l / 100).toFixed(2)}f, alpha = ${entry.opacity}f)`);
  }

  // TV-specific maxWhite
  lines.push('');
  lines.push('// TV-specific: max white (no pure white on TVs)');
  const maxWhite = parseHSL(tv.maxWhite);
  lines.push(`val TiviMaxWhite = Color.hsl(${maxWhite.h}f, ${(maxWhite.s / 100).toFixed(2)}f, ${(maxWhite.l / 100).toFixed(2)}f)`);
  lines.push('');

  const outPath = join(ROOT, 'apps/android-tv/app/src/main/java/com/opentivi/tv/ui/theme/Color.kt');
  writeFileSync(outPath, lines.join('\n'));
  generated.push(outPath);
}

// ─── 3. Android TV: Type.kt ───────────────────────────────────────────────────

function buildAndroidTypography() {
  const scale = tokens.typography.scale;
  const tvScale = tokens.platform.tv.typographyScale;   // 1.15
  const minFont = tokens.platform.tv.minFontSize;        // 14

  function tvSize(base) {
    return Math.max(minFont, Math.round(base * tvScale));
  }

  // Mapping: token key → Material3 Typography slot(s)
  // display→displayLarge, h1→displayMedium, h2→displaySmall + headlineLarge,
  // h3→headlineMedium + titleLarge, h4→headlineSmall + titleMedium,
  // bodyLarge→bodyLarge + titleSmall, body→bodyMedium,
  // small→bodySmall, caption→labelMedium + labelLarge, overline→labelSmall
  const mapping = [
    { slot: 'displayLarge',  token: 'display' },
    { slot: 'displayMedium', token: 'h1' },
    { slot: 'displaySmall',  token: 'h2' },
    { slot: 'headlineLarge', token: 'h2' },
    { slot: 'headlineMedium', token: 'h3' },
    { slot: 'headlineSmall', token: 'h4' },
    { slot: 'titleLarge',   token: 'h3' },
    { slot: 'titleMedium',  token: 'h4' },
    { slot: 'titleSmall',   token: 'bodyLarge' },
    { slot: 'bodyLarge',    token: 'bodyLarge' },
    { slot: 'bodyMedium',   token: 'body' },
    { slot: 'bodySmall',    token: 'small' },
    { slot: 'labelLarge',   token: 'caption' },
    { slot: 'labelMedium',  token: 'caption' },
    { slot: 'labelSmall',   token: 'overline' },
  ];

  const lines = [HEADER];
  lines.push('package com.opentivi.tv.ui.theme');
  lines.push('');
  lines.push('import androidx.tv.material3.Typography');
  lines.push('import androidx.compose.ui.text.TextStyle');
  lines.push('import androidx.compose.ui.text.font.FontFamily');
  lines.push('import androidx.compose.ui.text.font.FontWeight');
  lines.push('import androidx.compose.ui.unit.em');
  lines.push('import androidx.compose.ui.unit.sp');
  lines.push('');
  lines.push('val TvTypography = Typography(');

  for (let i = 0; i < mapping.length; i++) {
    const { slot, token } = mapping[i];
    const t = scale[token];
    const sz = tvSize(t.size);
    const fw = kotlinFontWeight(t.weight);
    const lh = t.lineHeight;
    const tracking = t.tracking;
    const comma = i < mapping.length - 1 ? ',' : ',';

    let trackingLine = '';
    if (tracking && tracking !== 0) {
      trackingLine = `\n        letterSpacing = (${tracking}).em,`;
    }

    lines.push(`    ${slot} = TextStyle(`);
    lines.push(`        fontFamily = FontFamily.SansSerif,`);
    lines.push(`        fontWeight = ${fw},`);
    lines.push(`        fontSize = ${sz}.sp,`);
    lines.push(`        lineHeight = (${sz} * ${lh}).sp,${trackingLine}`);
    lines.push(`    )${comma}`);
  }

  lines.push(')');
  lines.push('');

  const outPath = join(ROOT, 'apps/android-tv/app/src/main/java/com/opentivi/tv/ui/theme/Type.kt');
  writeFileSync(outPath, lines.join('\n'));
  generated.push(outPath);
}

// ─── 4. iOS: Color+Theme.swift ─────────────────────────────────────────────────

function buildIOSColors() {
  const dark = tokens.color.dark;
  const light = tokens.color.light;

  // Colors that are the same in both modes (no light/dark variant needed)
  // These are colors where dark === light value OR special single-mode colors
  const sameInBothModes = new Set();

  // Check which colors have the same value in both modes
  for (const key of Object.keys(dark)) {
    if (dark[key].$value === light[key]?.$value) {
      sameInBothModes.add(key);
    }
  }

  // Adaptive colors (different dark/light) use UIColor dynamic provider
  // Same-in-both colors use simple Color(red:green:blue:)
  const colorKeys = [
    'background', 'foreground', 'card', 'cardForeground',
    'popover', 'primary', 'primaryForeground',
    'secondary', 'secondaryForeground', 'muted', 'mutedForeground',
    'accent', 'accentForeground', 'border', 'input', 'ring',
    'destructive', 'destructiveForeground',
    'success', 'successForeground', 'warning', 'warningForeground',
    'favorite', 'live',
  ];

  // popoverForeground is same as foreground in the existing file, skip separate entry
  // to match existing format; actually let's include it for completeness but check the original
  // The original file doesn't have popoverForeground — let's match the existing set

  const lines = [HEADER];
  lines.push('import SwiftUI');
  lines.push('');
  lines.push('extension Color {');
  lines.push('    // MARK: - Adaptive Design Token Colors');

  function rgbLiteral(hslStr) {
    const { h, s, l } = parseHSL(hslStr);
    const { r, g, b } = hslToRGB(h, s, l);
    // Use fractional form for pure white (1.0) to match existing style
    if (r === 255 && g === 255 && b === 255) return 'red: 1.0, green: 1.0, blue: 1.0, alpha: 1';
    return `red: ${r}/255, green: ${g}/255, blue: ${b}/255, alpha: 1`;
  }

  function rgbLiteralSimple(hslStr) {
    const { h, s, l } = parseHSL(hslStr);
    const { r, g, b } = hslToRGB(h, s, l);
    return `red: ${r}/255, green: ${g}/255, blue: ${b}/255`;
  }

  for (const key of colorKeys) {
    const darkEntry = dark[key];
    const lightEntry = light[key];
    if (!darkEntry) continue;
    const name = 'tivi' + capitalize(key);

    lines.push('');

    if (sameInBothModes.has(key)) {
      // Same in both modes — simple Color
      lines.push(`    static let ${name} = Color(${rgbLiteralSimple(darkEntry.$value)})`);
    } else {
      // Adaptive — UIColor dynamic provider
      lines.push(`    static let ${name} = Color(UIColor { trait in`);
      lines.push(`        trait.userInterfaceStyle == .dark`);
      lines.push(`            ? UIColor(${rgbLiteral(darkEntry.$value)})`);
      lines.push(`            : UIColor(${rgbLiteral(lightEntry.$value)})`);
      lines.push(`    })`);
    }
  }

  // Overlay tokens
  const overlay = tokens.overlay;
  lines.push('');
  lines.push('    // MARK: - Overlay Tokens');
  for (const [key, entry] of Object.entries(overlay)) {
    if (key.startsWith('$') || typeof entry.color !== 'string') continue;
    const name = 'tiviOverlay' + capitalize(key);
    const { h, s, l } = parseHSL(entry.color);
    const { r, g, b } = hslToRGB(h, s, l);
    lines.push(`    static let ${name} = Color(red: ${r}/255, green: ${g}/255, blue: ${b}/255).opacity(${entry.opacity})`);
  }

  lines.push('}');
  lines.push('');

  const outPath = join(ROOT, 'apps/ios/OpenTivi/OpenTivi/Extensions/Color+Theme.swift');
  writeFileSync(outPath, lines.join('\n'));
  generated.push(outPath);
}

// ─── 5. iOS: Font+Theme.swift ──────────────────────────────────────────────────

function buildIOSTypography() {
  const scale = tokens.typography.scale;

  function swiftFontWeight(w) {
    switch (w) {
      case 400: return '.regular';
      case 500: return '.medium';
      case 600: return '.semibold';
      case 700: return '.bold';
      default:  return `.regular`;
    }
  }

  const lines = [HEADER];
  lines.push('import SwiftUI');
  lines.push('');
  lines.push('extension Font {');
  lines.push('    // MARK: - Design Token Fonts');

  for (const [key, val] of Object.entries(scale)) {
    const name = 'tivi' + capitalize(key);
    const weight = swiftFontWeight(val.weight);
    lines.push(`    static let ${name} = Font.system(size: ${val.size}, weight: ${weight})`);
  }

  lines.push('}');
  lines.push('');

  const outPath = join(ROOT, 'apps/ios/OpenTivi/OpenTivi/Extensions/Font+Theme.swift');
  writeFileSync(outPath, lines.join('\n'));
  generated.push(outPath);
}

// ─── 6. iOS: Spacing+Theme.swift ───────────────────────────────────────────────

function buildIOSSpacing() {
  const spacing = tokens.spacing;
  const radius = tokens.radius;

  // Explicit order to match design intent (JSON order, not JS numeric-key order)
  const spacingOrder = ['0', 'px', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20'];

  function spacingKey(k) {
    return 's' + capitalize(k.replace('.', '_'));
  }

  function radiusKey(k) {
    if (k === '2xl') return 'xxl';
    return k;
  }

  const lines = [HEADER];
  lines.push('import CoreGraphics');
  lines.push('');
  lines.push('enum TiviSpacing {');

  for (const key of spacingOrder) {
    const val = spacing[key];
    if (val === undefined) continue;
    const name = spacingKey(key);
    lines.push(`    static let ${name}: CGFloat = ${val}`);
  }

  lines.push('}');
  lines.push('');
  lines.push('enum TiviRadius {');

  for (const [key, val] of Object.entries(radius)) {
    const name = radiusKey(key);
    lines.push(`    static let ${name}: CGFloat = ${val}`);
  }

  lines.push('}');
  lines.push('');

  const outPath = join(ROOT, 'apps/ios/OpenTivi/OpenTivi/Extensions/Spacing+Theme.swift');
  writeFileSync(outPath, lines.join('\n'));
  generated.push(outPath);
}

// ─── 7. Android TV: Spacing.kt ────────────────────────────────────────────────

function buildAndroidSpacing() {
  const spacing = tokens.spacing;
  const radius = tokens.radius;

  const spacingOrder = ['0', 'px', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20'];

  function spacingKey(k) {
    return 's' + capitalize(k.replace('.', '_'));
  }

  function radiusKey(k) {
    if (k === '2xl') return 'xxl';
    return k;
  }

  const lines = [HEADER];
  lines.push('package com.opentivi.tv.ui.theme');
  lines.push('');
  lines.push('import androidx.compose.ui.unit.Dp');
  lines.push('import androidx.compose.ui.unit.dp');
  lines.push('');
  lines.push('object TiviSpacing {');

  for (const key of spacingOrder) {
    const val = spacing[key];
    if (val === undefined) continue;
    const name = spacingKey(key);
    lines.push(`    val ${name}: Dp = ${val}.dp`);
  }

  lines.push('}');
  lines.push('');
  lines.push('object TiviRadius {');

  for (const [key, val] of Object.entries(radius)) {
    const name = radiusKey(key);
    lines.push(`    val ${name}: Dp = ${val}.dp`);
  }

  lines.push('}');
  lines.push('');

  const outPath = join(ROOT, 'apps/android-tv/app/src/main/java/com/opentivi/tv/ui/theme/Spacing.kt');
  writeFileSync(outPath, lines.join('\n'));
  generated.push(outPath);
}

// ─── Run ───────────────────────────────────────────────────────────────────────

buildDesktopTokens();
buildAndroidColors();
buildAndroidTypography();
buildAndroidSpacing();
buildIOSColors();
buildIOSTypography();
buildIOSSpacing();

console.log(`Generated ${generated.length} files:`);
for (const f of generated) {
  console.log(`  ✓ ${f.replace(ROOT + '/', '')}`);
}
