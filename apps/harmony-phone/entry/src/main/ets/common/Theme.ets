// Design tokens from shared/design/tokens.json adapted for HarmonyOS ArkUI

export class TiviColors {
  // Light mode
  static readonly lightBackground: ResourceColor = '#FFFFFF';
  static readonly lightForeground: ResourceColor = '#0A0A0F';
  static readonly lightCard: ResourceColor = '#FFFFFF';
  static readonly lightCardForeground: ResourceColor = '#0A0A0F';
  static readonly lightPrimary: ResourceColor = '#2563EB'; // hsl(221, 83%, 53%)
  static readonly lightPrimaryForeground: ResourceColor = '#F8FAFC';
  static readonly lightSecondary: ResourceColor = '#F4F4F5'; // hsl(240, 5%, 96%)
  static readonly lightSecondaryForeground: ResourceColor = '#18181B';
  static readonly lightMuted: ResourceColor = '#F4F4F5';
  static readonly lightMutedForeground: ResourceColor = '#71717A'; // hsl(240, 4%, 46%)
  static readonly lightDestructive: ResourceColor = '#EF4444';
  static readonly lightBorder: ResourceColor = '#E4E4E7';
  static readonly lightFavorite: ResourceColor = '#EAB308'; // hsl(45, 93%, 47%)
  static readonly lightLive: ResourceColor = '#EF4444';
  static readonly lightSuccess: ResourceColor = '#22C55E';

  // Dark mode
  static readonly darkBackground: ResourceColor = '#0A0A0F';
  static readonly darkForeground: ResourceColor = '#F2F2F2';
  static readonly darkCard: ResourceColor = '#18181B';
  static readonly darkCardForeground: ResourceColor = '#F2F2F2';
  static readonly darkPrimary: ResourceColor = '#3B82F6'; // hsl(217, 91%, 60%)
  static readonly darkPrimaryForeground: ResourceColor = '#FFFFFF';
  static readonly darkSecondary: ResourceColor = '#27272A';
  static readonly darkSecondaryForeground: ResourceColor = '#F2F2F2';
  static readonly darkMuted: ResourceColor = '#27272A';
  static readonly darkMutedForeground: ResourceColor = '#A1A1AA'; // hsl(240, 5%, 65%)
  static readonly darkDestructive: ResourceColor = '#7F1D1D';
  static readonly darkBorder: ResourceColor = '#27272A';
  static readonly darkFavorite: ResourceColor = '#EAB308';
  static readonly darkLive: ResourceColor = '#EF4444';
  static readonly darkSuccess: ResourceColor = '#22C55E';

  // Overlay colors (player/dark contexts)
  static readonly overlayText: ResourceColor = '#FFFFFFFF';
  static readonly overlayTextDim: ResourceColor = '#B3FFFFFF';       // white 70%
  static readonly overlayTextMuted: ResourceColor = '#99FFFFFF';     // white 60%
  static readonly overlayTextSubtle: ResourceColor = '#80FFFFFF';    // white 50%
  static readonly overlayTextFaint: ResourceColor = '#55FFFFFF';     // white 33%
  static readonly overlayBg: ResourceColor = '#E6000000';            // black 90%
  static readonly overlayGradientDark: ResourceColor = '#CC000000';  // black 80%
  static readonly overlayGradientMedium: ResourceColor = '#B3000000'; // black 70%
  static readonly overlayButtonBg: ResourceColor = '#40FFFFFF';      // white 25%
  static readonly overlayShadow: ResourceColor = '#40000000';        // black 25%
  static readonly primarySoft: ResourceColor = '#332563EB';          // primary 20%
}

// Typography scale
export class TiviTypography {
  static readonly display: number = 48;
  static readonly h1: number = 32;
  static readonly h2: number = 24;
  static readonly h3: number = 20;
  static readonly h4: number = 16;
  static readonly body: number = 14;
  static readonly bodyLarge: number = 16;
  static readonly small: number = 13;
  static readonly caption: number = 12;
  static readonly overline: number = 11;
  static readonly badge: number = 10;
}

// Spacing (4px base unit)
export class TiviSpacing {
  static readonly xs: number = 4;
  static readonly sm: number = 8;
  static readonly md: number = 12;
  static readonly lg: number = 16;
  static readonly xl: number = 20;
  static readonly xxl: number = 24;
  static readonly xxxl: number = 32;
}

// Border radius
export class TiviRadius {
  static readonly none: number = 0;
  static readonly sm: number = 6;
  static readonly md: number = 8;
  static readonly lg: number = 12;
  static readonly xl: number = 16;
  static readonly xxl: number = 24;
  static readonly full: number = 9999;
}
