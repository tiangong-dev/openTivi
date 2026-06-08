/**
 * Application-level constants.
 */

/** Maximum channels to load per query */
export const CHANNEL_PAGE_LIMIT: number = 5000;

/** EPG window: 15 minutes back */
export const EPG_WINDOW_BACK_MS: number = 15 * 60 * 1000;

/** EPG window: 4 hours forward */
export const EPG_WINDOW_FORWARD_MS: number = 4 * 60 * 60 * 1000;

/** Settings keys — must match desktop/android apps */
export const LOCALE_SETTING_KEY: string = 'ui.locale';
export const APP_START_VIEW_SETTING_KEY: string = 'app.startView';
export const INSTANT_SWITCH_ENABLED_SETTING_KEY: string = 'player.instantSwitchEnabled';

/** Player overlay auto-hide timeout (ms) */
export const PLAYER_OVERLAY_TIMEOUT: number = 5000;

/** Channel number input timeout (ms) — for quick number-pad channel switching */
export const CHANNEL_NUMBER_INPUT_TIMEOUT: number = 2000;

/** Grid columns for channel cards on TV */
export const CHANNEL_GRID_COLUMNS: number = 4;
