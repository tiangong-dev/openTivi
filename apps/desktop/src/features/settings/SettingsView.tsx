import { useEffect, useMemo, useRef, useState } from "react";

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
  const [focusedSettingKey, setFocusedSettingKey] = useState<string | null>(null);
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [domFocusedSettingKey, setDomFocusedSettingKey] = useState<string | null>(null);
  const [hoveredSettingKey, setHoveredSettingKey] = useState<string | null>(null);
  const [isContentZoneActive, setIsContentZoneActive] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const closeModalBtnRef = useRef<HTMLButtonElement | null>(null);
  const orderedSettings = useMemo(() => settingCategories.flatMap((cat) => cat.settings), []);
  const editingSetting = orderedSettings.find((item) => item.key === editingSettingKey) ?? null;

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

  useEffect(() => {
    if (!focusedSettingKey && orderedSettings.length > 0) {
      setFocusedSettingKey(orderedSettings[0].key);
    }
  }, [focusedSettingKey, orderedSettings]);

  useEffect(() => {
    const onZoneChange = (event: Event) => {
      const detail = (event as CustomEvent<{ zone?: string; view?: string }>).detail;
      const inThisView = !detail?.view || detail.view === "settings";
      setIsContentZoneActive(detail?.zone === "content" && inThisView);
      if (detail?.zone === "nav" && inThisView) {
        setDomFocusedSettingKey(null);
      }
    };
    window.addEventListener("tv-focus-zone", onZoneChange as EventListener);
    return () => {
      window.removeEventListener("tv-focus-zone", onZoneChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const onFocusContent = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: string }>).detail;
      if (detail?.view && detail.view !== "settings") {
        return;
      }
      if (editingSetting) {
        window.setTimeout(() => closeModalBtnRef.current?.focus(), 0);
        return;
      }
      if (orderedSettings.length === 0) return;
      const currentIndex = focusedSettingKey
        ? orderedSettings.findIndex((item) => item.key === focusedSettingKey)
        : 0;
      focusSettingByIndex(currentIndex >= 0 ? currentIndex : 0);
    };
    const onContentKey = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; view?: string }>).detail;
      if (detail?.view && detail.view !== "settings") {
        return;
      }
      const key = detail?.key;
      if (!key || orderedSettings.length === 0) return;
      if (editingSetting) {
        if (key === "ArrowRight") {
          event.preventDefault();
          triggerSetting(editingSetting, 1);
          return;
        }
        if (key === "ArrowLeft") {
          event.preventDefault();
          triggerSetting(editingSetting, -1);
          return;
        }
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          triggerSetting(editingSetting, 1);
          return;
        }
        return;
      }
      const currentIndex = focusedSettingKey
        ? orderedSettings.findIndex((item) => item.key === focusedSettingKey)
        : 0;
      const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
      const current = orderedSettings[normalizedIndex];
      if (!current) return;
      if (key === "ArrowDown") {
        event.preventDefault();
        focusSettingByIndex(normalizedIndex + 1);
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        focusSettingByIndex(normalizedIndex - 1);
        return;
      }
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        setEditingSettingKey(current.key);
      }
    };
    window.addEventListener("tv-focus-content", onFocusContent as EventListener);
    window.addEventListener("tv-content-key", onContentKey as EventListener);
    return () => {
      window.removeEventListener("tv-focus-content", onFocusContent as EventListener);
      window.removeEventListener("tv-content-key", onContentKey as EventListener);
    };
  }, [editingSetting, focusedSettingKey, orderedSettings]);

  useEffect(() => {
    if (!editingSetting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setEditingSettingKey(null);
      window.setTimeout(() => {
        const index = orderedSettings.findIndex((item) => item.key === editingSetting.key);
        if (index >= 0) {
          focusSettingByIndex(index);
        }
      }, 0);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editingSetting, orderedSettings]);

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

  const focusSettingByIndex = (index: number) => {
    if (orderedSettings.length === 0) return;
    const wrapped = ((index % orderedSettings.length) + orderedSettings.length) % orderedSettings.length;
    const target = orderedSettings[wrapped];
    setFocusedSettingKey(target.key);
    const node = rowRefs.current[target.key];
    node?.focus();
    node?.scrollIntoView({ block: "nearest" });
  };

  const cycleSelect = (def: SettingDef, direction: 1 | -1) => {
    const options = def.options ?? [];
    if (options.length === 0) return;
    const currentValue = String(getValue(def));
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === currentValue));
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    void saveSetting(def.key, options[nextIndex].value);
  };

  const adjustRange = (def: SettingDef, direction: 1 | -1) => {
    const min = def.min ?? 0;
    const max = def.max ?? 100;
    const step = 5;
    const current = Number(getValue(def));
    const fallback = Number(def.defaultValue);
    const base = Number.isFinite(current) ? current : Number.isFinite(fallback) ? fallback : min;
    const next = Math.max(min, Math.min(max, base + direction * step));
    void saveSetting(def.key, next);
  };

  const triggerSetting = (def: SettingDef, direction: 1 | -1 = 1) => {
    if (def.type === "toggle") {
      void saveSetting(def.key, !Boolean(getValue(def)));
      return;
    }
    if (def.type === "select") {
      cycleSelect(def, direction);
      return;
    }
    adjustRange(def, direction);
  };

  const displaySettingValue = (def: SettingDef): string => {
    const value = getValue(def);
    if (def.type === "toggle") {
      return Boolean(value) ? t(locale, "settings.value.on") : t(locale, "settings.value.off");
    }
    if (def.type === "range") {
      return `${Number(value)}`;
    }
    const option = def.options?.find((item) => item.value === String(value));
    return option ? t(locale, option.labelKey, option.labelParams) : String(value);
  };

  return (
    <div style={{ padding: 24, width: "100%", height: "100%", overflowY: "auto" }}>
      {flash && <div style={flashStyle}>{t(locale, "settings.flash.saved")}</div>}

      {error && <div style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div>}
      <div style={hintStyle}>{t(locale, "settings.hint.tv")}</div>

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
            <div
              key={def.key}
              ref={(node) => {
                rowRefs.current[def.key] = node;
              }}
              role="button"
              tabIndex={0}
              data-tv-focusable={focusedSettingKey === def.key ? "true" : undefined}
              style={{
                ...rowStyle,
                ...(hoveredSettingKey === def.key || (isContentZoneActive && domFocusedSettingKey === def.key) ? rowActiveStyle : null),
              }}
              onFocus={() => {
                setFocusedSettingKey(def.key);
                setDomFocusedSettingKey(def.key);
              }}
              onBlur={() => {
                setDomFocusedSettingKey((prev) => (prev === def.key ? null : prev));
              }}
              onMouseEnter={() => setHoveredSettingKey(def.key)}
              onMouseLeave={() => setHoveredSettingKey((prev) => (prev === def.key ? null : prev))}
              onClick={() => setEditingSettingKey(def.key)}
            >
              <span style={rowLabelStyle}>{t(locale, def.labelKey)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={rowValueStyle}>{displaySettingValue(def)}</span>
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{">"}</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {editingSetting && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              {t(locale, "settings.edit.title", { label: t(locale, editingSetting.labelKey) })}
            </h3>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 10 }}>
              {t(locale, "settings.edit.hint")}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <button
                type="button"
                onClick={() => triggerSetting(editingSetting, -1)}
                style={modalActionBtnStyle}
              >
                {t(locale, "settings.edit.decrease")}
              </button>
              <span style={{ minWidth: 140, textAlign: "center", color: "var(--accent)", fontWeight: 600 }}>
                {displaySettingValue(editingSetting)}
              </span>
              <button
                type="button"
                onClick={() => triggerSetting(editingSetting, 1)}
                style={modalActionBtnStyle}
              >
                {t(locale, "settings.edit.increase")}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                ref={closeModalBtnRef}
                type="button"
                onClick={() => {
                  const index = orderedSettings.findIndex((item) => item.key === editingSetting.key);
                  setEditingSettingKey(null);
                  window.setTimeout(() => {
                    if (index >= 0) {
                      focusSettingByIndex(index);
                    }
                  }, 0);
                }}
                style={{ ...modalActionBtnStyle, backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
              >
                {t(locale, "settings.edit.done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 12px",
  borderBottom: "1px solid var(--border)",
  borderRadius: 4,
  outline: "none",
  cursor: "pointer",
};

const rowActiveStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-tertiary)",
  boxShadow: "inset 0 0 0 1px var(--accent)",
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: 14,
};

const rowValueStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontSize: 13,
  minWidth: 110,
  textAlign: "right",
};

const hintStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 12,
  marginBottom: 12,
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalCardStyle: React.CSSProperties = {
  width: 480,
  maxWidth: "90vw",
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 16,
};

const modalActionBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  backgroundColor: "var(--accent)",
  color: "#fff",
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
