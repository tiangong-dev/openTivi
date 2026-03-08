import { useEffect, useMemo, useRef, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { t, type Locale } from "../../lib/i18n";
import type { Source, ImportSummary } from "../../types/api";

type ImportTab = "m3u" | "xtream" | "xmltv";

interface Props {
  locale: Locale;
}

export function SourcesView({ locale }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [activeTab, setActiveTab] = useState<ImportTab>("m3u");
  const [loading, setLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<EditSourceDraft | null>(null);
  const [focusedSourceIndex, setFocusedSourceIndex] = useState(0);
  const [hoveredSourceId, setHoveredSourceId] = useState<number | null>(null);
  const refreshingSourceIds = useRef<Set<number>>(new Set());
  const sourceRowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

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

  useEffect(() => {
    if (sources.length === 0) {
      setFocusedSourceIndex(0);
      return;
    }
    setFocusedSourceIndex((prev) => Math.min(prev, sources.length - 1));
  }, [sources.length]);

  const handleImportDone = (summary: ImportSummary, auto = false) => {
    setMessage({
      type: "ok",
      text: auto
        ? t(locale, "sources.message.autoRefreshCompleted", {
            imported: summary.channelsImported,
            updated: summary.channelsUpdated,
            removed: summary.channelsRemoved,
          })
        : t(locale, "sources.message.importCompleted", {
            imported: summary.channelsImported,
            updated: summary.channelsUpdated,
            removed: summary.channelsRemoved,
          }),
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

  const openEdit = (source: Source) => {
    setEditing({
      sourceId: source.id,
      kind: source.kind,
      name: source.name,
      location: source.location,
      username: source.username ?? "",
      password: source.password ?? "",
      autoRefreshMinutes: source.autoRefreshMinutes ? String(source.autoRefreshMinutes) : "",
      enabled: source.enabled,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    const location = editing.location.trim();
    if (!name || !location) {
      setMessage({
        type: "err",
        text: t(locale, "sources.validation.nameLocationRequired"),
      });
      return;
    }
    if (editing.kind === "xtream" && (!editing.username.trim() || !editing.password.trim())) {
      setMessage({
        type: "err",
        text: t(locale, "sources.validation.xtreamCredentialsRequired"),
      });
      return;
    }

    const parsedRefresh = Number.parseInt(editing.autoRefreshMinutes, 10);
    const autoRefreshMinutes =
      editing.kind === "m3u" && Number.isFinite(parsedRefresh) && parsedRefresh > 0
        ? parsedRefresh
        : null;

    setSavingEdit(true);
    try {
      await tauriInvoke("update_source", {
        input: {
          sourceId: editing.sourceId,
          name,
          location,
          username: editing.kind === "xtream" ? editing.username.trim() : null,
          password: editing.kind === "xtream" ? editing.password.trim() : null,
          autoRefreshMinutes,
          enabled: editing.enabled,
        },
      });
      setEditing(null);
      setMessage({
        type: "ok",
        text: t(locale, "sources.message.sourceUpdated"),
      });
      void loadSources();
    } catch (e) {
      setMessage({ type: "err", text: getErrorMessage(e) });
    } finally {
      setSavingEdit(false);
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

  const focusSourceByIndex = (index: number) => {
    if (sources.length === 0) return;
    const clamped = Math.max(0, Math.min(index, sources.length - 1));
    setFocusedSourceIndex(clamped);
    const source = sources[clamped];
    const rowNode = source ? sourceRowRefs.current[source.id] : null;
    rowNode?.focus();
    rowNode?.scrollIntoView({ block: "nearest" });
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
      <h2 style={{ marginBottom: 16 }}>{t(locale, "sources.title")}</h2>

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
                ? t(locale, "sources.tab.xtream")
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
          <h3 style={{ marginBottom: 12 }}>{t(locale, "sources.section.importedSources")}</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                <th style={thStyle}>{t(locale, "sources.table.name")}</th>
                <th style={thStyle}>{t(locale, "sources.table.type")}</th>
                <th style={thStyle}>{t(locale, "sources.table.location")}</th>
                <th style={thStyle}>{t(locale, "sources.table.importedOverview")}</th>
                <th style={thStyle}>{t(locale, "sources.table.autoRefresh")}</th>
                <th style={thStyle}>{t(locale, "sources.table.lastImport")}</th>
                <th style={thStyle}>{t(locale, "sources.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, index) => (
                <tr
                  key={s.id}
                  ref={(node) => {
                    sourceRowRefs.current[s.id] = node;
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    outline: "none",
                    ...(focusedSourceIndex === index || hoveredSourceId === s.id ? sourceRowActiveStyle : null),
                  }}
                  onFocus={() => setFocusedSourceIndex(index)}
                  onMouseEnter={() => setHoveredSourceId(s.id)}
                  onMouseLeave={() => setHoveredSourceId((prev) => (prev === s.id ? null : prev))}
                  onDoubleClick={() => openEdit(s)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusSourceByIndex(index + 1);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      focusSourceByIndex(index - 1);
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEdit(s);
                      return;
                    }
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      void handleDelete(s.id);
                      return;
                    }
                    if (event.key === "r" || event.key === "R") {
                      event.preventDefault();
                      void handleRefresh(s.id);
                    }
                  }}
                >
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
                      ? t(locale, "sources.autoRefreshEveryMinutes", { minutes: s.autoRefreshMinutes })
                      : "—"}
                  </td>
                  <td style={tdStyle}>{s.lastImportedAt ?? "—"}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRefresh(s.id);
                      }}
                      disabled={loading}
                      tabIndex={-1}
                      style={actionBtnStyle}
                    >
                      {t(locale, "sources.action.refresh")}
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(s);
                      }}
                      tabIndex={-1}
                      style={actionBtnStyle}
                    >
                      {t(locale, "sources.action.edit")}
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(s.id);
                      }}
                      tabIndex={-1}
                      style={{ ...actionBtnStyle, color: "var(--danger)" }}
                    >
                      {t(locale, "sources.action.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>{t(locale, "sources.edit.title")}</h3>
            <label style={labelStyle}>
              {t(locale, "sources.edit.name")}
              <input
                style={inputStyle}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label style={labelStyle}>
              {t(locale, "sources.edit.location")}
              <input
                style={inputStyle}
                value={editing.location}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
            </label>
            {editing.kind === "xtream" && (
              <>
                <label style={labelStyle}>
                  {t(locale, "sources.edit.username")}
                  <input
                    style={inputStyle}
                    value={editing.username}
                    onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                  />
                </label>
                <label style={labelStyle}>
                  {t(locale, "sources.edit.password")}
                  <input
                    style={inputStyle}
                    type="password"
                    value={editing.password}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  />
                </label>
              </>
            )}
            {editing.kind === "m3u" && (
              <label style={labelStyle}>
                {t(locale, "sources.edit.autoRefreshInterval")}
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={editing.autoRefreshMinutes}
                  onChange={(e) => setEditing({ ...editing, autoRefreshMinutes: e.target.value })}
                />
              </label>
            )}
            <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              {t(locale, "sources.edit.enabled")}
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => setEditing(null)}
                style={{ ...submitBtnStyle, backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                disabled={savingEdit}
              >
                {t(locale, "sources.edit.cancel")}
              </button>
              <button onClick={handleSaveEdit} style={submitBtnStyle} disabled={savingEdit}>
                {savingEdit ? t(locale, "sources.edit.saving") : t(locale, "sources.edit.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditSourceDraft {
  sourceId: number;
  kind: Source["kind"];
  name: string;
  location: string;
  username: string;
  password: string;
  autoRefreshMinutes: string;
  enabled: boolean;
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
        {t(locale, "sources.form.name")}
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(locale, "sources.form.m3uNamePlaceholder")}
        />
      </label>
      <label style={labelStyle}>
        {t(locale, "sources.form.m3uLocation")}
        <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="http://example.com/playlist.m3u" />
      </label>
      <label style={labelStyle}>
        {t(locale, "sources.form.autoRefreshInterval")}
        <input
          style={inputStyle}
          value={autoRefreshMinutes}
          onChange={(e) => setAutoRefreshMinutes(e.target.value)}
          placeholder={t(locale, "sources.form.autoRefreshPlaceholder")}
          type="number"
          min={1}
        />
      </label>
      <button type="submit" disabled={loading} style={submitBtnStyle}>
        {loading ? t(locale, "sources.form.importing") : t(locale, "sources.form.importM3u")}
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
        {t(locale, "sources.form.name")}
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(locale, "sources.form.xtreamNamePlaceholder")}
        />
      </label>
      <label style={labelStyle}>
        {t(locale, "sources.form.serverUrl")}
        <input style={inputStyle} value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://example.com:8080" />
      </label>
      <label style={labelStyle}>
        {t(locale, "sources.form.username")}
        <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label style={labelStyle}>
        {t(locale, "sources.form.password")}
        <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button type="submit" disabled={loading} style={submitBtnStyle}>
        {loading ? t(locale, "sources.form.importing") : t(locale, "sources.form.importXtream")}
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
        {t(locale, "sources.form.name")}
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(locale, "sources.form.xmltvNamePlaceholder")}
        />
      </label>
      <label style={labelStyle}>
        {t(locale, "sources.form.xmltvLocation")}
        <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="http://example.com/epg.xml" />
      </label>
      <button type="submit" disabled={loading} style={submitBtnStyle}>
        {loading ? t(locale, "sources.form.importing") : t(locale, "sources.form.importXmltv")}
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
    return t(locale, "sources.overview.epgPrograms", { count: source.epgProgramCount });
  }
  return t(locale, "sources.overview.channels", {
    channels: source.channelCount,
    groups: source.groupCount,
    withTvgId: source.channelsWithTvgId,
  });
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

const sourceRowActiveStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-tertiary)",
  boxShadow: "inset 0 0 0 1px var(--accent)",
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
  width: 520,
  maxWidth: "90vw",
  maxHeight: "90vh",
  overflowY: "auto",
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
