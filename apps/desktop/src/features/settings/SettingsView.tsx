import { useEffect, useState } from "react";

import { getErrorMessage } from "../../lib/errors";
import { LOCALE_SETTING_KEY, t, type Locale, type TranslationKey } from "../../lib/i18n";
import { DEFAULT_GUIDE_WINDOW_MINUTES, GUIDE_WINDOW_MINUTES_SETTING_KEY } from "../../lib/settings";
import { tauriInvoke } from "../../lib/tauri";
import type { Setting } from "../../types/api";

interface Props {
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
}

interface SettingDef {
  key: string;
  labelKey: TranslationKey;
  type: "toggle" | "select" | "range";
  defaultValue: unknown;
  options?: { labelKey: TranslationKey; value: string; labelParams?: Record<string, string | number> }[];
  min?: number;
  max?: number;
}

const minuteOptions = [60, 90, 120, 150, 180, 240, 300, 360].map((minutes) => ({
  labelKey: "settings.option.minutes" as const,
  value: String(minutes),
  labelParams: { minutes },
}));

const settingCategories: { titleKey: TranslationKey; settings: SettingDef[] }[] = [
  {
    titleKey: "settings.category.general",
    settings: [
      {
        key: LOCALE_SETTING_KEY,
        labelKey: "settings.locale.label",
        type: "select",
        defaultValue: "en-US",
        options: [
          { labelKey: "settings.locale.en", value: "en-US" },
          { labelKey: "settings.locale.zh", value: "zh-CN" },
        ],
      },
      {
        key: "app.startView",
        labelKey: "settings.startView.label",
        type: "select",
        defaultValue: "channels",
        options: [
          { labelKey: "settings.startView.channels", value: "channels" },
          { labelKey: "settings.startView.sources", value: "sources" },
          { labelKey: "settings.startView.favorites", value: "favorites" },
          { labelKey: "settings.startView.recents", value: "recents" },
        ],
      },
    ],
  },
  {
    titleKey: "settings.category.playback",
    settings: [
      { key: "player.autoplay", labelKey: "settings.player.autoplay", type: "toggle", defaultValue: true },
      { key: "player.volume", labelKey: "settings.player.volume", type: "range", defaultValue: 80, min: 0, max: 100 },
    ],
  },
  {
    titleKey: "settings.category.epg",
    settings: [
      { key: "epg.autoRefresh", labelKey: "settings.epg.autoRefresh", type: "toggle", defaultValue: false },
      {
        key: GUIDE_WINDOW_MINUTES_SETTING_KEY,
        labelKey: "settings.epg.guideTimelineWindow",
        type: "select",
        defaultValue: String(DEFAULT_GUIDE_WINDOW_MINUTES),
        options: minuteOptions,
      },
    ],
  },
];

export function SettingsView({ locale, onLocaleChange }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const loadSettings = async () => {
    try {
      const list = await tauriInvoke<Setting[]>("get_settings");
      const map: Record<string, unknown> = {};
      for (const s of list) {
        map[s.key] = s.value;
      }
      setValues(map);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const getValue = (def: SettingDef): unknown => {
    return values[def.key] ?? def.defaultValue;
  };

  const saveSetting = async (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === LOCALE_SETTING_KEY) {
      onLocaleChange((value === "zh-CN" ? "zh-CN" : "en-US") as Locale);
    }
    try {
      await tauriInvoke("set_setting", { input: { key, value } });
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const renderControl = (def: SettingDef) => {
    const val = getValue(def);

    if (def.type === "toggle") {
      return (
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={Boolean(val)}
            onChange={(e) => void saveSetting(def.key, e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
        </label>
      );
    }

    if (def.type === "select") {
      return (
        <select
          value={String(val)}
          onChange={(e) => void saveSetting(def.key, e.target.value)}
          style={selectStyle}
        >
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {t(locale, o.labelKey, o.labelParams)}
            </option>
          ))}
        </select>
      );
    }

    if (def.type === "range") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min={def.min}
            max={def.max}
            value={Number(val)}
            onChange={(e) => void saveSetting(def.key, Number(e.target.value))}
            style={{ accentColor: "var(--accent)", width: 120 }}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 28 }}>{Number(val)}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ padding: 24, maxWidth: 560, height: "100%", overflowY: "auto" }}>
      {flash && <div style={flashStyle}>{t(locale, "settings.flash.saved")}</div>}

      {error && <div style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {settingCategories.map((cat) => (
        <div key={cat.titleKey} style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {t(locale, cat.titleKey)}
          </div>
          {cat.settings.map((def) => (
            <div key={def.key} style={rowStyle}>
              <span style={{ fontSize: 14 }}>{t(locale, def.labelKey)}</span>
              {renderControl(def)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
};

const selectStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: 13,
};

const toggleLabelStyle: React.CSSProperties = {
  cursor: "pointer",
};

const flashStyle: React.CSSProperties = {
  backgroundColor: "var(--accent)",
  color: "#fff",
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: 13,
  marginBottom: 12,
  textAlign: "center",
};
