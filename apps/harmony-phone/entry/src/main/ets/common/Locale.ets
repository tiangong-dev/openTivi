// Locale helper for dynamic string resolution
// Uses HarmonyOS $r() resource system for static strings.
// This helper provides runtime locale switching and parameterized strings.

export class LocaleHelper {
  private static currentLocale: string = 'en-US';

  static setLocale(locale: string): void {
    LocaleHelper.currentLocale = locale;
  }

  static getLocale(): string {
    return LocaleHelper.currentLocale;
  }

  static isZhCN(): boolean {
    return LocaleHelper.currentLocale === 'zh-CN';
  }

  // Format relative time from ISO date string
  static relativeTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMinutes < 1) {
        return LocaleHelper.isZhCN() ? '刚刚' : 'just now';
      } else if (diffMinutes < 60) {
        return LocaleHelper.isZhCN() ? `${diffMinutes} 分钟前` : `${diffMinutes} min ago`;
      } else if (diffHours < 24) {
        return LocaleHelper.isZhCN() ? `${diffHours} 小时前` : `${diffHours}h ago`;
      } else if (diffDays === 1) {
        return LocaleHelper.isZhCN() ? '昨天' : 'yesterday';
      } else {
        return LocaleHelper.isZhCN() ? `${diffDays} 天前` : `${diffDays}d ago`;
      }
    } catch (e) {
      return isoString;
    }
  }

  // Format XMLTV time string (e.g. "20240101120000 +0000") to "12:00"
  static formatXmltvTime(xmltvTime: string): string {
    try {
      // Try ISO format first
      const date = new Date(xmltvTime);
      if (!isNaN(date.getTime())) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      }
      // Try XMLTV format: "20240101120000 +0000"
      if (xmltvTime.length >= 12) {
        const h = xmltvTime.substring(8, 10);
        const m = xmltvTime.substring(10, 12);
        return `${h}:${m}`;
      }
      return xmltvTime;
    } catch (e) {
      return xmltvTime;
    }
  }
}
