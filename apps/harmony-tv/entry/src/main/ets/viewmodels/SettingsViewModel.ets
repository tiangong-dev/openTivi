import { RustBridge } from '../bridge/RustBridge';
import {
  LOCALE_SETTING_KEY,
  APP_START_VIEW_SETTING_KEY,
  INSTANT_SWITCH_ENABLED_SETTING_KEY
} from '../common/Constants';

/**
 * ViewModel for the Settings page. Manages app preferences persisted via Rust core.
 */
@ObservedV2
export class SettingsViewModel {
  @Trace languageCode: string = 'en-US';
  @Trace startView: string = 'channels';
  @Trace instantSwitch: boolean = false;

  constructor() {
    this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    try {
      const settings = await RustBridge.getAllSettings();
      const map = new Map<string, string>();
      for (const s of settings) {
        map.set(s.key, s.value);
      }

      const localeRaw = map.get(LOCALE_SETTING_KEY);
      if (localeRaw) {
        const parsed = this.parseJsonString(localeRaw);
        if (parsed === 'en-US' || parsed === 'zh-CN') {
          this.languageCode = parsed;
        }
      }

      const startViewRaw = map.get(APP_START_VIEW_SETTING_KEY);
      if (startViewRaw) {
        const parsed = this.parseJsonString(startViewRaw);
        if (parsed) {
          this.startView = parsed;
        }
      }

      const instantSwitchRaw = map.get(INSTANT_SWITCH_ENABLED_SETTING_KEY);
      if (instantSwitchRaw) {
        this.instantSwitch = instantSwitchRaw.trim().toLowerCase() === 'true';
      }
    } catch (_e) {
      // Use defaults on error
    }
  }

  async setLanguageCode(code: string): Promise<void> {
    if (code !== 'en-US' && code !== 'zh-CN') return;
    try {
      await RustBridge.setSetting(LOCALE_SETTING_KEY, JSON.stringify(code));
      this.languageCode = code;
    } catch (_e) {
      // Silently fail
    }
  }

  async setStartView(view: string): Promise<void> {
    try {
      await RustBridge.setSetting(APP_START_VIEW_SETTING_KEY, JSON.stringify(view));
      this.startView = view;
    } catch (_e) {
      // Silently fail
    }
  }

  async setInstantSwitch(enabled: boolean): Promise<void> {
    try {
      await RustBridge.setSetting(INSTANT_SWITCH_ENABLED_SETTING_KEY,
        enabled ? 'true' : 'false');
      this.instantSwitch = enabled;
    } catch (_e) {
      // Silently fail
    }
  }

  private parseJsonString(raw: string): string {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      return raw;
    } catch {
      return raw;
    }
  }
}
