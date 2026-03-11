import { useEffect, useMemo, useRef, useState } from "react";

import { useIndexFocusGroup, useLinearFocusGroup } from "../../lib/focusScope";
import { getErrorMessage } from "../../lib/errors";
import { LOCALE_SETTING_KEY, t, type Locale, type TranslationKey } from "../../lib/i18n";
import {
  APP_START_VIEW_SETTING_KEY,
  DEFAULT_APP_START_VIEW,
  DEFAULT_GUIDE_WINDOW_MINUTES,
  DEFAULT_INSTANT_SWITCH_ENABLED,
  DEFAULT_PREFER_NATIVE_HLS,
  GUIDE_WINDOW_MINUTES_SETTING_KEY,
  INSTANT_SWITCH_ENABLED_SETTING_KEY,
  PREFER_NATIVE_HLS_SETTING_KEY,
} from "../../lib/settings";
import { tauriInvoke } from "../../lib/tauri";
import { TvIntent, type TvContentKeyDetail } from "../../lib/tvInput";
import type { AppUpdateInfo, Setting } from "../../types/api";

interface Props {
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
}

interface SettingDef {
  key: string;
  labelKey: TranslationKey;
  type: "toggle" | "select" | "range" | "action";
  defaultValue: unknown;
  options?: { labelKey: TranslationKey; value: string; labelParams?: Record<string, string | number> }[];
  min?: number;
  max?: number;
}

type SettingEditAction = "decrease" | "increase" | "done";

const settingEditActions = ["decrease", "increase", "done"] as const;

const minuteOptions = [60, 90, 120, 150, 180, 240, 300, 360].map((minutes) => ({
  labelKey: "settings.option.minutes" as const,
  value: String(minutes),
  labelParams: { minutes },
}));

const CHECK_UPDATE_SETTING_KEY = "__check_update__";

const settingCategories: { titleKey: TranslationKey; settings: SettingDef[] }[] = [
  {
    titleKey: "settings.update.title",
    settings: [
      {
        key: CHECK_UPDATE_SETTING_KEY,
        labelKey: "settings.update.checkNow",
        type: "action",
        defaultValue: null,
      },
    ],
  },
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
        key: APP_START_VIEW_SETTING_KEY,
        labelKey: "settings.startView.label",
        type: "select",
        defaultValue: DEFAULT_APP_START_VIEW,
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
      { key: INSTANT_SWITCH_ENABLED_SETTING_KEY, labelKey: "settings.player.instantSwitchEnabled", type: "toggle", defaultValue: DEFAULT_INSTANT_SWITCH_ENABLED },
      { key: PREFER_NATIVE_HLS_SETTING_KEY, labelKey: "settings.player.preferNativeHls", type: "toggle", defaultValue: DEFAULT_PREFER_NATIVE_HLS },
    ],
  },
  {
    titleKey: "settings.category.epg",
    settings: [
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

interface SettingOption {
  label: string;
  value: string;
}

export function SettingsView({ locale, onLocaleChange }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [flash, setFlash] = useState(false);
  const [focusedSettingKey, setFocusedSettingKey] = useState<string | null>(null);
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [editAction, setEditAction] = useState<SettingEditAction>("increase");
  const [editOptionIndex, setEditOptionIndex] = useState(0);
  const [domFocusedSettingKey, setDomFocusedSettingKey] = useState<string | null>(null);
  const [hoveredSettingKey, setHoveredSettingKey] = useState<string | null>(null);
  const [isContentZoneActive, setIsContentZoneActive] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const decreaseModalBtnRef = useRef<HTMLButtonElement | null>(null);
  const increaseModalBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeModalBtnRef = useRef<HTMLButtonElement | null>(null);
  const orderedSettings = useMemo(() => settingCategories.flatMap((cat) => cat.settings), []);
  const editingSetting = orderedSettings.find((item) => item.key === editingSettingKey) ?? null;
  const editingOptions = useMemo(() => {
    if (!editingSetting) return [] as SettingOption[];
    if (editingSetting.type === "toggle") {
      return [
        { label: t(locale, "settings.value.on"), value: "true" },
        { label: t(locale, "settings.value.off"), value: "false" },
      ];
    }
    if (editingSetting.type === "select") {
      return (editingSetting.options ?? []).map((option) => ({
        label: t(locale, option.labelKey, option.labelParams),
        value: option.value,
      }));
    }
    return [] as SettingOption[];
  }, [editingSetting, locale]);
  const focusedSettingIndex = Math.max(
    0,
    focusedSettingKey ? orderedSettings.findIndex((item) => item.key === focusedSettingKey) : 0,
  );
  const settingsListGroup = useIndexFocusGroup({
    itemCount: orderedSettings.length,
    currentIndex: focusedSettingIndex,
    setCurrentIndex: (nextIndex) => {
      const next = orderedSettings[nextIndex];
      if (next) {
        setFocusedSettingKey(next.key);
      }
    },
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const editActionGroup = useLinearFocusGroup({
    items: settingEditActions,
    current: editAction,
    setCurrent: setEditAction,
    backwardIntent: TvIntent.MoveLeft,
    forwardIntent: TvIntent.MoveRight,
    backwardEdge: "stay",
    forwardEdge: "stay",
  });
  const editOptionGroup = useIndexFocusGroup({
    itemCount: editingOptions.length,
    currentIndex: editOptionIndex,
    setCurrentIndex: setEditOptionIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });

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

  const checkAppUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    try {
      const info = await tauriInvoke<AppUpdateInfo>("check_app_update");
      setUpdateInfo(info);
    } catch (e) {
      setUpdateError(getErrorMessage(e));
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    void checkAppUpdate();
  }, []);

  useEffect(() => {
    if (!focusedSettingKey && orderedSettings.length > 0) {
      setFocusedSettingKey(orderedSettings[0].key);
    }
  }, [focusedSettingKey, orderedSettings]);

  useEffect(() => {
    if (!editingSetting) return;
    if (editingSetting.type === "range" || editingSetting.type === "action") {
      setEditAction("increase");
      return;
    }
    const currentValue = editingSetting.type === "toggle" ? String(Boolean(getValue(editingSetting))) : String(getValue(editingSetting));
    const currentIndex = Math.max(0, editingOptions.findIndex((option) => option.value === currentValue));
    setEditOptionIndex(currentIndex);
  }, [editingOptions, editingSetting]);

  useEffect(() => {
    if (!editingSetting) return;
    window.setTimeout(() => {
      if (editingSetting.type !== "range" && editingSetting.type !== "action") {
        const node = document.querySelector<HTMLButtonElement>(`[data-setting-option-index="${editOptionIndex}"]`);
        node?.focus();
        return;
      }
      if (editAction === "decrease") {
        decreaseModalBtnRef.current?.focus();
        return;
      }
      if (editAction === "done") {
        closeModalBtnRef.current?.focus();
        return;
      }
      increaseModalBtnRef.current?.focus();
    }, 0);
  }, [editAction, editingSetting, editOptionIndex]);

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
        window.setTimeout(() => {
          if (editingSetting.type !== "range" && editingSetting.type !== "action") {
            const node = document.querySelector<HTMLButtonElement>(`[data-setting-option-index="${editOptionIndex}"]`);
            node?.focus();
            return;
          }
          if (editAction === "decrease") {
            decreaseModalBtnRef.current?.focus();
            return;
          }
          if (editAction === "done") {
            closeModalBtnRef.current?.focus();
            return;
          }
          increaseModalBtnRef.current?.focus();
        }, 0);
        return;
      }
      if (orderedSettings.length === 0) return;
      const currentIndex = focusedSettingKey
        ? orderedSettings.findIndex((item) => item.key === focusedSettingKey)
        : 0;
      focusSettingByIndex(currentIndex >= 0 ? currentIndex : 0);
    };
    const onContentKey = (event: Event) => {
      if (event.defaultPrevented) return;
      const detail = (event as CustomEvent<TvContentKeyDetail>).detail;
      if (detail?.view && detail.view !== "settings") {
        return;
      }
      const intent = detail?.intent;
      if (!intent || orderedSettings.length === 0) return;
      if (editingSetting) {
        if (intent === TvIntent.Back) {
          event.preventDefault();
          closeEditingSetting(editingSetting.key);
          return;
        }
        if (editingSetting.type !== "range") {
          if (intent === TvIntent.MoveUp || intent === TvIntent.MoveDown) {
            const result = editOptionGroup.handleIntent(intent);
            if (result.handled) {
              event.preventDefault();
            }
            return;
          }
          if (intent === TvIntent.Confirm) {
            event.preventDefault();
            const option = editingOptions[editOptionIndex];
            if (!option) return;
            const nextValue = editingSetting.type === "toggle" ? option.value === "true" : option.value;
            void saveSetting(editingSetting.key, nextValue);
            closeEditingSetting(editingSetting.key);
          }
          return;
        }
        if (intent === TvIntent.MoveRight || intent === TvIntent.MoveLeft) {
          const result = editActionGroup.handleIntent(intent);
          if (result.handled) {
            event.preventDefault();
          }
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          if (editAction === "decrease") {
            triggerSetting(editingSetting, -1);
            return;
          }
          if (editAction === "done") {
            closeEditingSetting(editingSetting.key);
            return;
          }
          triggerSetting(editingSetting, 1);
          return;
        }
        return;
      }
      const current = orderedSettings[focusedSettingIndex];
      if (!current) return;
      if (intent === TvIntent.MoveDown || intent === TvIntent.MoveUp) {
        const result = settingsListGroup.handleIntent(intent);
        if (result.handled) {
          event.preventDefault();
          focusSettingByIndex(result.next);
        }
        return;
      }
      if (intent === TvIntent.Confirm) {
        event.preventDefault();
        if (current.type === "action") {
          void checkAppUpdate();
          return;
        }
        setEditingSettingKey(current.key);
      }
    };
    window.addEventListener("tv-focus-content", onFocusContent as EventListener);
    window.addEventListener("tv-content-key", onContentKey as EventListener);
    return () => {
      window.removeEventListener("tv-focus-content", onFocusContent as EventListener);
      window.removeEventListener("tv-content-key", onContentKey as EventListener);
    };
  }, [editAction, editActionGroup, editOptionGroup, editOptionIndex, editingOptions, editingSetting, focusedSettingIndex, orderedSettings, settingsListGroup]);

  useEffect(() => {
    if (!editingSetting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditingSetting(editingSetting.key);
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
    const previousValue = values[key];
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === LOCALE_SETTING_KEY) {
      onLocaleChange((value === "zh-CN" ? "zh-CN" : "en-US") as Locale);
    }
    try {
      await tauriInvoke("set_setting", { input: { key, value } });
      setError(null);
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (e) {
      setValues((prev) => {
        if (previousValue === undefined) {
          const { [key]: _discarded, ...rest } = prev;
          return rest;
        }
        return { ...prev, [key]: previousValue };
      });
      if (key === LOCALE_SETTING_KEY) {
        onLocaleChange((previousValue === "zh-CN" ? "zh-CN" : "en-US") as Locale);
      }
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

  const closeEditingSetting = (settingKey: string) => {
    const index = orderedSettings.findIndex((item) => item.key === settingKey);
    setEditingSettingKey(null);
    setEditAction("increase");
    setEditOptionIndex(0);
    window.setTimeout(() => {
      if (index >= 0) {
        focusSettingByIndex(index);
      }
    }, 0);
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
    if (def.type === "action") {
      void checkAppUpdate();
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
    if (def.type === "action") {
      if (checkingUpdate) return t(locale, "settings.update.checking");
      if (!updateInfo) return t(locale, "settings.update.checked");
      return updateInfo.hasUpdate ? t(locale, "settings.update.availableShort") : t(locale, "settings.update.upToDateShort");
    }
    if (def.type === "range") {
      return `${Number(value)}`;
    }
    const option = def.options?.find((item) => item.value === String(value));
    return option ? t(locale, option.labelKey, option.labelParams) : String(value);
  };

  const displaySettingLabel = (def: SettingDef): string => {
    if (def.key === CHECK_UPDATE_SETTING_KEY) {
      return t(locale, "settings.update.checkNowWithVersion", { version: updateInfo?.currentVersion ?? "-" });
    }
    return t(locale, def.labelKey);
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
              onClick={() => {
                if (def.type === "action") {
                  void checkAppUpdate();
                  return;
                }
                setEditingSettingKey(def.key);
              }}
            >
              <span style={rowLabelStyle}>{displaySettingLabel(def)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={rowValueStyle}>{displaySettingValue(def)}</span>
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{">"}</span>
              </div>
            </div>
          ))}
          {cat.titleKey === "settings.update.title" && updateError ? <div style={{ color: "var(--danger)", marginTop: 8 }}>{updateError}</div> : null}
        </div>
      ))}

      {editingSetting && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              {t(locale, "settings.edit.title", { label: t(locale, editingSetting.labelKey) })}
            </h3>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 10 }}>
              {t(locale, editingSetting.type === "range" ? "settings.edit.hintRange" : "settings.edit.hintSelect")}
            </div>
            {editingSetting.type === "range" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <button
                    ref={decreaseModalBtnRef}
                    type="button"
                    onClick={() => triggerSetting(editingSetting, -1)}
                    data-tv-focusable={editAction === "decrease" ? "true" : undefined}
                    style={{
                      ...modalActionBtnStyle,
                      ...(editAction === "decrease" ? modalActionBtnActiveStyle : null),
                    }}
                  >
                    {t(locale, "settings.edit.decrease")}
                  </button>
                  <span style={{ minWidth: 140, textAlign: "center", color: "var(--accent)", fontWeight: 600 }}>
                    {displaySettingValue(editingSetting)}
                  </span>
                  <button
                    ref={increaseModalBtnRef}
                    type="button"
                    onClick={() => triggerSetting(editingSetting, 1)}
                    data-tv-focusable={editAction === "increase" ? "true" : undefined}
                    style={{
                      ...modalActionBtnStyle,
                      ...(editAction === "increase" ? modalActionBtnActiveStyle : null),
                    }}
                  >
                    {t(locale, "settings.edit.increase")}
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                  <button
                    ref={closeModalBtnRef}
                    type="button"
                    onClick={() => {
                      closeEditingSetting(editingSetting.key);
                    }}
                    data-tv-focusable={editAction === "done" ? "true" : undefined}
                    style={{
                      ...modalActionBtnStyle,
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      ...(editAction === "done" ? modalActionBtnActiveStyle : null),
                    }}
                  >
                    {t(locale, "settings.edit.done")}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {editingOptions.map((option, index) => {
                  const selected = String(getValue(editingSetting)) === option.value
                    || (editingSetting.type === "toggle" && String(Boolean(getValue(editingSetting))) === option.value);
                  const active = editOptionIndex === index;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-setting-option-index={index}
                      data-tv-focusable={active ? "true" : undefined}
                      onClick={() => {
                        const nextValue = editingSetting.type === "toggle" ? option.value === "true" : option.value;
                        void saveSetting(editingSetting.key, nextValue);
                        closeEditingSetting(editingSetting.key);
                      }}
                      style={{
                        ...modalOptionStyle,
                        ...(selected ? modalOptionSelectedStyle : null),
                        ...(active ? modalOptionActiveStyle : null),
                      }}
                    >
                      <span style={modalRadioStyle}>{selected ? "●" : "○"}</span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
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

const modalActionBtnActiveStyle: React.CSSProperties = {
  boxShadow: "inset 0 0 0 1px #fff",
};

const modalOptionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-primary)",
  color: "var(--text-primary)",
  cursor: "pointer",
  textAlign: "left",
};

const modalOptionSelectedStyle: React.CSSProperties = {
  color: "var(--accent)",
};

const modalOptionActiveStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-tertiary)",
  boxShadow: "inset 0 0 0 1px var(--accent)",
};

const modalRadioStyle: React.CSSProperties = {
  width: 16,
  color: "var(--accent)",
  fontSize: 14,
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
