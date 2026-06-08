import { SettingInfo } from '../models/Types';
import { RustBridge } from '../bridge/RustBridge';

@ObservedV2
export class SettingsViewModel {
  @Trace settings: SettingInfo[] = [];
  @Trace isLoading: boolean = false;
  @Trace currentLocale: string = 'en-US';

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.settings = await RustBridge.shared().getAllSettings();
      // Extract locale setting
      const localeSetting = this.settings.find((s) => s.key === 'ui.locale');
      if (localeSetting) {
        let value = localeSetting.value.trim();
        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        if (value === 'en-US' || value === 'zh-CN') {
          this.currentLocale = value;
        }
      }
    } catch (e) {
      console.error('SettingsViewModel.load failed:', JSON.stringify(e));
    } finally {
      this.isLoading = false;
    }
  }

  async setSetting(key: string, value: string): Promise<void> {
    try {
      await RustBridge.shared().setSetting(key, value);
    } catch (e) {
      console.error('SettingsViewModel.setSetting failed:', JSON.stringify(e));
    }
  }

  async setLocale(locale: string): Promise<void> {
    this.currentLocale = locale;
    await this.setSetting('ui.locale', `"${locale}"`);
  }
}
