import { useEffect, useMemo, useRef, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { tr, type Locale } from "../../lib/i18n";
import type { Source, ImportSummary } from "../../types/api";

type ImportTab = "m3u" | "xtream" | "xmltv";

interface Props {
  locale: Locale;
}

export function SourcesView({ locale }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [activeTab, setActiveTab] = useState<ImportTab>("m3u");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const refreshingSourceIds = useRef<Set<number>>(new Set());

  const loadSources = async () => {
    try {
      const list = await tauriInvoke<Source[]>("list_sources");
      setSources(list);
    } catch (e) {
      console.error("Failed to load sources:", e);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const handleImportDone = (summary: ImportSummary, auto = false) => {
    setMessage({
      type: "ok",
      text: auto
        ? tr(
            locale,
            `Auto refresh completed. Imported ${summary.channelsImported}, updated ${summary.channelsUpdated}, removed ${summary.channelsRemoved}.`,
            `自动刷新完成。新增 ${summary.channelsImported}，更新 ${summary.channelsUpdated}，删除 ${summary.channelsRemoved}。`,
          )
        : tr(
            locale,
            `Imported ${summary.channelsImported} channels, updated ${summary.channelsUpdated}, removed ${summary.channelsRemoved}.`,
            `导入完成：新增 ${summary.channelsImported}，更新 ${summary.channelsUpdated}，删除 ${summary.channelsRemoved}。`,
          ),
    });
    void loadSources();
  };

  const handleDelete = async (id: number) => {
    try {
      await tauriInvoke("delete_source", { sourceId: id });
      void loadSources();
    } catch (e) {
      setMessage({ type: "err", text: getErrorMessage(e) });
    }
  };

  const handleRefresh = async (id: number, auto = false) => {
    if (refreshingSourceIds.current.has(id)) return;
    refreshingSourceIds.current.add(id);
    if (!auto) {
      setLoading(true);
    }
    if (!auto) {
      setMessage(null);
    }
    try {
      const summary = await tauriInvoke<ImportSummary>("refresh_source", { sourceId: id });
      handleImportDone(summary, auto);
    } catch (e) {
      setMessage({ type: "err", text: getErrorMessage(e) });
    } finally {
      refreshingSourceIds.current.delete(id);
      if (!auto) {
        setLoading(false);
      }
    }
  };

  const m3uSources = useMemo(
    () => sources.filter((s) => s.kind === "m3u" && (s.autoRefreshMinutes ?? 0) > 0),
    [sources],
  );

  useEffect(() => {
    if (m3uSources.length === 0) return;
    const checkAndRefresh = () => {
      if (document.hidden) return;
      const now = Date.now();
      const overdue = m3uSources.find((source) => {
        const refreshMinutes = source.autoRefreshMinutes ?? 0;
        if (refreshMinutes <= 0) return false;
        const lastImportedAt = parseSqliteDate(source.lastImportedAt);
        if (!lastImportedAt) return false;
        const elapsedMs = now - lastImportedAt;
        return elapsedMs >= refreshMinutes * 60 * 1000 && !refreshingSourceIds.current.has(source.id);
      });
      if (overdue) {
        void handleRefresh(overdue.id, true);
      }
    };
    const initial = window.setTimeout(checkAndRefresh, 5_000);
    const timer = window.setInterval(checkAndRefresh, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [m3uSources]);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>{tr(locale, "Sources", "源")}</h2>

      {message && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: 16,
            borderRadius: 4,
            backgroundColor: message.type === "ok" ? "#065f4620" : "#ef444420",
            color: message.type === "ok" ? "#4ade80" : "#ef4444",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Import tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
        {(["m3u", "xtream", "xmltv"] as ImportTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              border: "1px solid var(--border)",
              backgroundColor: activeTab === tab ? "var(--accent)" : "var(--bg-tertiary)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {tab === "m3u"
              ? "M3U"
              : tab === "xtream"
                ? tr(locale, "Xtream Codes", "Xtream 账号")
                : "XMLTV EPG"}
          </button>
        ))}
      </div>

      {/* Import forms */}
      {activeTab === "m3u" && (
        <M3uForm
          locale={locale}
          loading={loading}
          setLoading={setLoading}
          onDone={(summary) => handleImportDone(summary, false)}
          onError={(e) => setMessage({ type: "err", text: e })}
        />
      )}
      {activeTab === "xtream" && (
        <XtreamForm
          locale={locale}
          loading={loading}
          setLoading={setLoading}
          onDone={(summary) => handleImportDone(summary, false)}
          onError={(e) => setMessage({ type: "err", text: e })}
        />
      )}
      {activeTab === "xmltv" && (
        <XmltvForm
          locale={locale}
          loading={loading}
          setLoading={setLoading}
          onDone={(summary) => handleImportDone(summary, false)}
          onError={(e) => setMessage({ type: "err", text: e })}
        />
      )}

      {/* Source list */}
      {sources.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>{tr(locale, "Imported Sources", "已导入源")}</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                <th style={thStyle}>{tr(locale, "Name", "名称")}</th>
                <th style={thStyle}>{tr(locale, "Type", "类型")}</th>
                <th style={thStyle}>{tr(locale, "Location", "地址")}</th>
                <th style={thStyle}>{tr(locale, "Imported Overview", "导入概况")}</th>
                <th style={thStyle}>{tr(locale, "Auto Refresh", "自动刷新")}</th>
                <th style={thStyle}>{tr(locale, "Last Import", "上次导入")}</th>
                <th style={thStyle}>{tr(locale, "Actions", "操作")}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={tdStyle}>{s.name}</td>
                  <td style={tdStyle}>{s.kind.toUpperCase()}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.location}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 320 }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.4 }}>
                      {formatSourceOverview(s, locale)}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {s.kind === "m3u" && s.autoRefreshMinutes
                      ? tr(locale, `Every ${s.autoRefreshMinutes} min`, `每 ${s.autoRefreshMinutes} 分钟`)
                      : "—"}
                  </td>
                  <td style={tdStyle}>{s.lastImportedAt ?? "—"}</td>
                  <td style={tdStyle}>
                    <button onClick={() => handleRefresh(s.id)} disabled={loading} style={actionBtnStyle}>
                      {tr(locale, "Refresh", "刷新")}
                    </button>
                    <button onClick={() => handleDelete(s.id)} style={{ ...actionBtnStyle, color: "var(--danger)" }}>
                      {tr(locale, "Delete", "删除")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface FormProps {
  locale: Locale;
  loading: boolean;
  setLoading: (v: boolean) => void;
  onDone: (s: ImportSummary) => void;
  onError: (msg: string) => void;
}

function M3uForm({ locale, loading, setLoading, onDone, onError }: FormProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !location.trim()) return;
    setLoading(true);
    try {
      const parsedRefresh = Number.parseInt(autoRefreshMinutes, 10);
      const summary = await tauriInvoke<ImportSummary>("import_m3u", {
        input: {
          name,
          location,
          autoRefreshMinutes: Number.isFinite(parsedRefresh) && parsedRefresh > 0 ? parsedRefresh : null,
        },
      });
      onDone(summary);
      setName("");
      setLocation("");
      setAutoRefreshMinutes("");
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <label style={labelStyle}>
        {tr(locale, "Name", "名称")}
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(locale, "My IPTV", "我的 IPTV")} />
      </label>
      <label style={labelStyle}>
        {tr(locale, "M3U URL or file path", "M3U 链接或文件路径")}
        <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="http://example.com/playlist.m3u" />
      </label>
      <label style={labelStyle}>
        {tr(locale, "Auto refresh interval (minutes)", "自动刷新间隔（分钟）")}
        <input
          style={inputStyle}
          value={autoRefreshMinutes}
          onChange={(e) => setAutoRefreshMinutes(e.target.value)}
          placeholder={tr(locale, "Leave empty to disable", "留空表示关闭")}
          type="number"
          min={1}
        />
      </label>
      <button type="submit" disabled={loading} style={submitBtnStyle}>
        {loading ? tr(locale, "Importing...", "导入中...") : tr(locale, "Import M3U", "导入 M3U")}
      </button>
    </form>
  );
}

function XtreamForm({ locale, loading, setLoading, onDone, onError }: FormProps) {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !serverUrl.trim() || !username.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const summary = await tauriInvoke<ImportSummary>("import_xtream", {
        input: { name, serverUrl, username, password },
      });
      onDone(summary);
      setName("");
      setServerUrl("");
      setUsername("");
      setPassword("");
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <label style={labelStyle}>
        {tr(locale, "Name", "名称")}
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(locale, "My Xtream", "我的 Xtream")} />
      </label>
      <label style={labelStyle}>
        {tr(locale, "Server URL", "服务器地址")}
        <input style={inputStyle} value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://example.com:8080" />
      </label>
      <label style={labelStyle}>
        {tr(locale, "Username", "用户名")}
        <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label style={labelStyle}>
        {tr(locale, "Password", "密码")}
        <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button type="submit" disabled={loading} style={submitBtnStyle}>
        {loading ? tr(locale, "Importing...", "导入中...") : tr(locale, "Import Xtream", "导入 Xtream")}
      </button>
    </form>
  );
}

function XmltvForm({ locale, loading, setLoading, onDone, onError }: FormProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !location.trim()) return;
    setLoading(true);
    try {
      const summary = await tauriInvoke<ImportSummary>("import_xmltv", { input: { name, location } });
      onDone(summary);
      setName("");
      setLocation("");
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <label style={labelStyle}>
        {tr(locale, "Name", "名称")}
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(locale, "My EPG", "我的 EPG")} />
      </label>
      <label style={labelStyle}>
        {tr(locale, "XMLTV URL or file path", "XMLTV 链接或文件路径")}
        <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="http://example.com/epg.xml" />
      </label>
      <button type="submit" disabled={loading} style={submitBtnStyle}>
        {loading ? tr(locale, "Importing...", "导入中...") : tr(locale, "Import XMLTV", "导入 XMLTV")}
      </button>
    </form>
  );
}

function parseSqliteDate(value?: string): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? null : ts;
}

function formatSourceOverview(source: Source, locale: Locale): string {
  if (source.kind === "xmltv") {
    return tr(
      locale,
      `EPG programs: ${source.epgProgramCount}.`,
      `EPG 条目：${source.epgProgramCount}。`,
    );
  }
  return tr(
    locale,
    `Channels: ${source.channelCount}, groups: ${source.groupCount}, TVG-ID channels: ${source.channelsWithTvgId}.`,
    `频道：${source.channelCount}，分组：${source.groupCount}，含 TVG-ID：${source.channelsWithTvgId}。`,
  );
}

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 480,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "var(--text-secondary)",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: 14,
};

const submitBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  backgroundColor: "var(--accent)",
  border: "none",
  borderRadius: 4,
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
};

const actionBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 13,
  marginRight: 8,
};
