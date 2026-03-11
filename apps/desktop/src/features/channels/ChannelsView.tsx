import { useEffect, useRef, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { t, type Locale } from "../../lib/i18n";
import {
  EPG_REMINDERS_SETTING_KEY,
  resolveEpgReminders,
  type EpgReminder,
} from "../../lib/settings";
import type { Channel, EpgProgramSearchResult, Setting, Source } from "../../types/api";
import { ChannelRowsWithGuide } from "./ChannelRowsWithGuide";
import { formatTime, parseXmltvDate } from "../player/playerUtils";

interface Props {
  locale: Locale;
  favoritesOnly?: boolean;
  onPlay?: (channel: Channel, allChannels?: Channel[]) => void;
}

type ChannelSort = "name" | "channelNumber" | "sourceThenChannel";
type EpgStateFilter = "all" | "live" | "upcoming";

export function ChannelsView({ locale, favoritesOnly = false, onPlay }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ChannelSort>("channelNumber");
  const [search, setSearch] = useState("");
  const [isSearchEditing, setIsSearchEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epgSearch, setEpgSearch] = useState("");
  const [epgStateFilter, setEpgStateFilter] = useState<EpgStateFilter>("all");
  const [epgResults, setEpgResults] = useState<EpgProgramSearchResult[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const [epgDrawerItem, setEpgDrawerItem] = useState<EpgProgramSearchResult | null>(null);
  const [epgReminders, setEpgReminders] = useState<EpgReminder[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadChannels = async () => {
    try {
      const list = await tauriInvoke<Channel[]>("list_channels", {
        query: {
          sourceId: selectedSourceId,
          groupName: selectedGroup,
          search: search || undefined,
          favoritesOnly,
          limit: 5000,
          offset: 0,
        },
      });
      setChannels(sortChannels(list, sortBy));
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const loadGroups = async (sourceId?: number | null) => {
    try {
      const g = await tauriInvoke<string[]>("list_groups", { sourceId: sourceId ?? undefined });
      setGroups(g);
    } catch (_) {}
  };

  const loadSources = async () => {
    try {
      const list = await tauriInvoke<Source[]>("list_sources");
      setSources(list.filter((item) => item.enabled && item.kind !== "xmltv"));
    } catch (_) {}
  };

  useEffect(() => {
    void loadGroups(selectedSourceId);
  }, [selectedSourceId]);

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    void tauriInvoke<Setting[]>("get_settings")
      .then((settings) => {
        const raw = settings.find((item) => item.key === EPG_REMINDERS_SETTING_KEY)?.value;
        setEpgReminders(resolveEpgReminders(raw));
      })
      .catch(() => setEpgReminders([]));
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [favoritesOnly, search, selectedGroup, selectedSourceId, sortBy]);

  useEffect(() => {
    setSelectedGroup((current) => (current && !groups.includes(current) ? null : current));
  }, [groups]);

  const toggleFavorite = async (ch: Channel) => {
    try {
      await tauriInvoke("set_favorite", { input: { channelId: ch.id, favorite: !ch.isFavorite } });
      loadChannels();
    } catch (_) {}
  };

  const searchPrograms = async () => {
    setEpgLoading(true);
    try {
      const list = await tauriInvoke<EpgProgramSearchResult[]>("search_epg", {
        query: {
          search: epgSearch || undefined,
          state: epgStateFilter,
          limit: 80,
        },
      });
      setEpgResults(list);
    } finally {
      setEpgLoading(false);
    }
  };

  useEffect(() => {
    void searchPrograms();
  }, [epgSearch, epgStateFilter]);

  const toggleReminder = async (program: EpgProgramSearchResult) => {
    const exists = epgReminders.some((item) => item.programId === program.id);
    const next = exists
      ? epgReminders.filter((item) => item.programId !== program.id)
      : [...epgReminders, {
          programId: program.id,
          channelId: program.channelId,
          title: program.title,
          startAt: program.startAt,
        }];
    setEpgReminders(next);
    await tauriInvoke("set_setting", {
      input: { key: EPG_REMINDERS_SETTING_KEY, value: next },
    }).catch(() => undefined);
  };

  const focusSearchNavigationMode = () => {
    setIsSearchEditing(false);
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  return (
    <div style={{ padding: 24, display: "flex", gap: 16, height: "100%" }}>
      {(groups.length > 0 || sources.length > 0) && (
        <div style={{ width: 220, flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {sources.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
                {t(locale, "channels.sources")}
              </div>
              <button
                onClick={() => setSelectedSourceId(null)}
                style={{
                  ...groupBtnStyle,
                  backgroundColor: selectedSourceId === null ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                {t(locale, "channels.allSources")}
              </button>
              {sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => setSelectedSourceId(source.id)}
                  style={{
                    ...groupBtnStyle,
                    backgroundColor: selectedSourceId === source.id ? "var(--bg-tertiary)" : "transparent",
                  }}
                >
                  {source.name}
                </button>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
            {t(locale, "channels.groups")}
          </div>
          <button
            onClick={() => setSelectedGroup(null)}
            style={{
              ...groupBtnStyle,
              backgroundColor: selectedGroup === null ? "var(--bg-tertiary)" : "transparent",
            }}
          >
            {t(locale, "channels.all")}
          </button>
          <div>
            {groups.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                style={{
                  ...groupBtnStyle,
                  backgroundColor: selectedGroup === g ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Channel list */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={searchInputRef}
            data-tv-navigation-priority={isSearchEditing ? undefined : "true"}
            data-tv-focusable="true"
            style={{ ...searchStyle, flex: "1 1 320px" }}
            placeholder={t(locale, "channels.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => setIsSearchEditing(false)}
            onKeyDown={(event) => {
              if (!isSearchEditing && event.key === "Enter") {
                event.preventDefault();
                setIsSearchEditing(true);
                return;
              }
              if (isSearchEditing && event.key === "Escape") {
                event.preventDefault();
                setIsSearchEditing(false);
              }
            }}
          />
          <label style={sortLabelStyle}>
            {t(locale, "channels.sort")}
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as ChannelSort)}
              style={selectStyle}
            >
              <option value="channelNumber">{t(locale, "channels.sort.channelNumber")}</option>
              <option value="name">{t(locale, "channels.sort.name")}</option>
              <option value="sourceThenChannel">{t(locale, "channels.sort.sourceThenChannel")}</option>
            </select>
          </label>
        </div>

        {error && <div style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div>}

        {channels.length === 0 && !error && (
          <div style={{ color: "var(--text-secondary)", marginTop: 24, textAlign: "center" }}>
            {t(locale, "channels.emptyPrefix")}<b>{t(locale, "channels.emptySources")}</b>{t(locale, "channels.emptySuffix")}
          </div>
        )}

        <div style={epgPanelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t(locale, "epg.explorer.title")}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {t(locale, "epg.explorer.subtitle")}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {t(locale, "epg.explorer.reminders")}: {epgReminders.length}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <input
              value={epgSearch}
              onChange={(event) => setEpgSearch(event.target.value)}
              placeholder={t(locale, "epg.searchPlaceholder")}
              style={{ ...searchStyle, flex: "1 1 260px" }}
            />
            {(["all", "live", "upcoming"] as EpgStateFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setEpgStateFilter(filter)}
                style={{
                  ...filterChipStyle,
                  backgroundColor: epgStateFilter === filter ? "var(--accent)" : "var(--bg-tertiary)",
                  color: epgStateFilter === filter ? "#fff" : "var(--text-primary)",
                }}
              >
                {t(locale, `epg.filter.${filter}`)}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: epgDrawerItem ? "1fr minmax(260px, 320px)" : "1fr", gap: 12, marginTop: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {epgLoading ? <div style={{ color: "var(--text-secondary)" }}>{t(locale, "guide.loading")}</div> : null}
              {!epgLoading && epgResults.length === 0 ? (
                <div style={{ color: "var(--text-secondary)" }}>{t(locale, "epg.empty")}</div>
              ) : null}
              {epgResults.map((program) => {
                const isLive = isProgramLive(program);
                const reminded = epgReminders.some((item) => item.programId === program.id);
                return (
                  <div key={program.id} style={epgResultCardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{program.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {program.channelNumber ? `${program.channelNumber} · ` : ""}
                          {program.channelName}
                        </div>
                      </div>
                      <span style={{ ...statusTagStyle, backgroundColor: isLive ? "#14532d" : "#1e3a8a" }}>
                        {t(locale, isLive ? "epg.filter.live" : "epg.filter.upcoming")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {formatTime(program.startAt)} - {formatTime(program.endAt)}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" style={miniButtonStyle} onClick={() => setEpgDrawerItem(program)}>
                        {t(locale, "epg.details")}
                      </button>
                      <button type="button" style={miniButtonStyle} onClick={() => void toggleReminder(program)}>
                        {reminded ? t(locale, "epg.reminder.cancel") : t(locale, "epg.reminder.set")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {epgDrawerItem ? (
              <div style={epgDrawerStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{epgDrawerItem.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {epgDrawerItem.channelName}
                    </div>
                  </div>
                  <button type="button" style={miniButtonStyle} onClick={() => setEpgDrawerItem(null)}>
                    {t(locale, "sources.edit.cancel")}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {formatTime(epgDrawerItem.startAt)} - {formatTime(epgDrawerItem.endAt)}
                </div>
                {epgDrawerItem.category ? (
                  <div style={{ fontSize: 12, color: "var(--accent)" }}>{epgDrawerItem.category}</div>
                ) : null}
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  {epgDrawerItem.description || t(locale, "epg.noDescription")}
                </div>
                <button type="button" style={submitBtnStyleSmall} onClick={() => void toggleReminder(epgDrawerItem)}>
                  {epgReminders.some((item) => item.programId === epgDrawerItem.id)
                    ? t(locale, "epg.reminder.cancel")
                    : t(locale, "epg.reminder.set")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ flex: 1, marginTop: 8 }}>
          <ChannelRowsWithGuide
            items={channels}
            locale={locale}
            onPlay={onPlay}
            onToggleFavorite={toggleFavorite}
            onMoveBeforeFirst={focusSearchNavigationMode}
            virtualized
            virtualListHeight={620}
          />
        </div>
      </div>
    </div>
  );
}

const groupBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "6px 10px",
  border: "none",
  color: "var(--text-primary)",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
  borderRadius: 4,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const searchStyle: React.CSSProperties = {
  padding: "8px 10px",
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: 14,
};

const sortLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "var(--text-secondary)",
  fontSize: 13,
};

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: 14,
};

const epgPanelStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  borderRadius: 10,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(15, 23, 42, 0.35)",
};

const filterChipStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  fontSize: 12,
  cursor: "pointer",
};

const epgResultCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(15, 23, 42, 0.55)",
};

const statusTagStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  color: "#fff",
  height: "fit-content",
};

const miniButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 12,
};

const epgDrawerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  borderRadius: 10,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(2, 6, 23, 0.7)",
};

const submitBtnStyleSmall: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "var(--accent)",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
  alignSelf: "flex-start",
};

function sortChannels(items: Channel[], sortBy: ChannelSort): Channel[] {
  return [...items].sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    }
    if (sortBy === "sourceThenChannel") {
      const sourceCompare = a.sourceId - b.sourceId;
      if (sourceCompare !== 0) return sourceCompare;
      return compareChannelNumbers(a, b) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    }
    return compareChannelNumbers(a, b) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function compareChannelNumbers(a: Channel, b: Channel): number {
  const parsedA = parseChannelNumber(a.channelNumber);
  const parsedB = parseChannelNumber(b.channelNumber);
  if (parsedA === null && parsedB === null) return 0;
  if (parsedA === null) return 1;
  if (parsedB === null) return -1;
  if (parsedA !== parsedB) return parsedA - parsedB;
  return (a.channelNumber ?? "").localeCompare(b.channelNumber ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function parseChannelNumber(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isProgramLive(program: EpgProgramSearchResult): boolean {
  const now = Date.now();
  const start = parseXmltvDate(program.startAt);
  const end = parseXmltvDate(program.endAt);
  return start !== null && end !== null && start <= now && now < end;
}
