import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import type { Setting } from "../../types/api";

interface SettingDef {
  key: string;
  label: string;
  type: "toggle" | "select" | "range";
  defaultValue: unknown;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
}

const settingCategories: { title: string; settings: SettingDef[] }[] = [
  {
    title: "General",
    settings: [
      {
        key: "app.language",
        label: "Language",
        type: "select",
        defaultValue: "en",
        options: [{ label: "English", value: "en" }],
      },
      {
        key: "app.startView",
        label: "Start View",
        type: "select",
        defaultValue: "channels",
        options: [
          { label: "Channels", value: "channels" },
          { label: "Sources", value: "sources" },
          { label: "Favorites", value: "favorites" },
          { label: "Recents", value: "recents" },
        ],
      },
    ],
  },
  {
    title: "Playback",
    settings: [
      { key: "player.autoplay", label: "Autoplay", type: "toggle", defaultValue: true },
      { key: "player.volume", label: "Volume", type: "range", defaultValue: 80, min: 0, max: 100 },
    ],
  },
  {
    title: "EPG",
    settings: [
      { key: "epg.autoRefresh", label: "Auto Refresh EPG", type: "toggle", defaultValue: false },
    ],
  },
];

export function SettingsView() {
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
    loadSettings();
  }, []);

  const getValue = (def: SettingDef): unknown => {
    return values[def.key] ?? def.defaultValue;
  };

  const saveSetting = async (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    try {
      await tauriInvoke("set_setting", { input: { key, value } });
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (_) {}
  };

  const renderControl = (def: SettingDef) => {
    const val = getValue(def);

    if (def.type === "toggle") {
      return (
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={val as boolean}
            onChange={(e) => saveSetting(def.key, e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
        </label>
      );
    }

    if (def.type === "select") {
      return (
        <select
          value={val as string}
          onChange={(e) => saveSetting(def.key, e.target.value)}
          style={selectStyle}
        >
          {def.options!.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
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
            value={val as number}
            onChange={(e) => saveSetting(def.key, Number(e.target.value))}
            style={{ accentColor: "var(--accent)", width: 120 }}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 28 }}>{val as number}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ padding: 24, maxWidth: 560, height: "100%", overflowY: "auto" }}>
      {flash && <div style={flashStyle}>Settings saved</div>}

      {error && <div style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {settingCategories.map((cat) => (
        <div key={cat.title} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
            {cat.title}
          </div>
          {cat.settings.map((def) => (
            <div key={def.key} style={rowStyle}>
              <span style={{ fontSize: 14 }}>{def.label}</span>
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
