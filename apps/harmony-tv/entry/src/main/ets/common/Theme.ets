/**
 * Design tokens for OpenTivi HarmonyOS TV app.
 * Derived from shared/design/tokens.json — dark theme only (TV default).
 */

/** Dark theme color palette */
export class TiviColors {
  /** Page canvas — near-black with blue warmth */
  static readonly background: ResourceColor = '#FF0A0A0F';
  /** Primary text */
  static readonly foreground: ResourceColor = '#FFF2F2F2';
  /** Card background — subtle lift from canvas */
  static readonly card: ResourceColor = '#FF18181B';
  /** Card text */
  static readonly cardForeground: ResourceColor = '#FFF2F2F2';
  /** Popover / dialog background */
  static readonly popover: ResourceColor = '#FF232328';
  /** Brand accent — blue */
  static readonly primary: ResourceColor = '#FF3B82F6';
  /** Text on primary */
  static readonly primaryForeground: ResourceColor = '#FFFFFFFF';
  /** Secondary surfaces */
  static readonly secondary: ResourceColor = '#FF27272A';
  /** Text on secondary */
  static readonly secondaryForeground: ResourceColor = '#FFF2F2F2';
  /** Muted / disabled */
  static readonly muted: ResourceColor = '#FF27272A';
  /** Muted text */
  static readonly mutedForeground: ResourceColor = '#FF9C9CA8';
  /** Hover / accent surface */
  static readonly accent: ResourceColor = '#FF27272A';
  /** Destructive / error */
  static readonly destructive: ResourceColor = '#FF7F1D1D';
  /** Destructive text */
  static readonly destructiveForeground: ResourceColor = '#FFF2F2F2';
  /** Success */
  static readonly success: ResourceColor = '#FF22C55E';
  /** Warning */
  static readonly warning: ResourceColor = '#FFF59E0B';
  /** Border */
  static readonly border: ResourceColor = '#FF27272A';
  /** Focus ring */
  static readonly ring: ResourceColor = '#FF3B82F6';
  /** Favorite star — warm yellow */
  static readonly favorite: ResourceColor = '#FFEAB308';
  /** Live indicator — red dot */
  static readonly live: ResourceColor = '#FFEF4444';

  /** Focused card border color */
  static readonly focusBorder: ResourceColor = '#FF3B82F6';
  /** Sidebar selected background */
  static readonly sidebarSelected: ResourceColor = '#33FFFFFF';
  /** Transparent */
  static readonly transparent: ResourceColor = '#00000000';

  /** Overlay gradient start — fully transparent */
  static readonly overlayGradientStart: ResourceColor = '#00000000';
  /** Overlay gradient end — background at 80% */
  static readonly overlayGradientEnd: ResourceColor = '#CC0A0A0F';
  /** Heavy overlay — 80% background */
  static readonly overlayHeavy: ResourceColor = '#CC0A0A0F';
  /** Medium overlay — 60% background */
  static readonly overlayMedium: ResourceColor = '#990A0A0F';
  /** Light overlay — 25% background */
  static readonly overlayLight: ResourceColor = '#400A0A0F';
  /** Primary color at 25% opacity */
  static readonly primarySoft: ResourceColor = '#403B82F6';
}

/** Typography scale — adapted for 10-foot UI (1.15x TV scale) */
export class TiviTypo {
  static readonly displaySize: number = 55; // 48 * 1.15
  static readonly h1Size: number = 37; // 32 * 1.15
  static readonly h2Size: number = 28; // 24 * 1.15
  static readonly h3Size: number = 23; // 20 * 1.15
  static readonly h4Size: number = 18; // 16 * 1.15
  static readonly bodySize: number = 16; // 14 * 1.15
  static readonly bodyLargeSize: number = 18;
  static readonly smallSize: number = 15; // 13 * 1.15
  static readonly captionSize: number = 14; // 12 * 1.15
  static readonly badgeSize: number = 12; // 10 * 1.15

  static readonly iconLargeSize: number = 36;
  static readonly iconNavSize: number = 24;
  static readonly iconMediumSize: number = 20;
  static readonly iconXLargeSize: number = 48;
  static readonly iconHugeSize: number = 72;
  static readonly iconLargishSize: number = 32;

  static readonly weightRegular: number = 400;
  static readonly weightMedium: number = 500;
  static readonly weightSemibold: number = 600;
  static readonly weightBold: number = 700;
}

/** Spacing — 4px base unit, TV-adapted */
export class TiviSpacing {
  static readonly xs: number = 4;
  static readonly sm: number = 8;
  static readonly md: number = 12;
  static readonly base: number = 16;
  static readonly lg: number = 24;
  static readonly xl: number = 32;
  static readonly xxl: number = 48;

  /** TV safe area padding */
  static readonly safeAreaX: number = 48;
  static readonly safeAreaY: number = 27;

  /** TV grid gap */
  static readonly gridGap: number = 24;
  /** TV section gap */
  static readonly sectionGap: number = 48;
}

/** Border radius */
export class TiviRadius {
  static readonly sm: number = 6;
  static readonly md: number = 8;
  static readonly lg: number = 12;
  static readonly xl: number = 16;
  static readonly xxl: number = 24;
}

/** Focus animation constants for TV */
export class TiviFocus {
  static readonly scale: number = 1.05;
  static readonly borderWidth: number = 3;
  static readonly animDuration: number = 150;
}

/** Sidebar dimensions */
export class TiviSidebar {
  static readonly collapsedWidth: number = 72;
  static readonly expandedWidth: number = 220;
}
