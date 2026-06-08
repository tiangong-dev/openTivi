// App-wide constants

export class AppConstants {
  static readonly APP_VERSION: string = '0.1.0';
  static readonly APP_BUILD: string = '1';
  static readonly GITHUB_URL: string = 'https://github.com/tiangong-dev/opentivi';

  // Touch targets (HarmonyOS minimum 48vp)
  static readonly MIN_TOUCH_TARGET: number = 48;

  // Channel logo sizes
  static readonly LOGO_SIZE_SMALL: number = 40;
  static readonly LOGO_SIZE_MEDIUM: number = 48;
  static readonly LOGO_SIZE_LARGE: number = 60;
  static readonly LOGO_SIZE_XL: number = 88;

  // Player overlay auto-hide delay (ms)
  static readonly OVERLAY_HIDE_DELAY: number = 5000;

  // Tab bar height
  static readonly TAB_BAR_HEIGHT: number = 56;

  // Mini player height
  static readonly MINI_PLAYER_HEIGHT: number = 64;

  // Animation durations
  static readonly ANIM_FAST: number = 100;
  static readonly ANIM_BASE: number = 150;
  static readonly ANIM_SLOW: number = 250;
  static readonly ANIM_SLOWER: number = 400;
}
