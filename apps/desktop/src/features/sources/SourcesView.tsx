import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { useIndexFocusGroup, useLinearFocusGroup } from "../../lib/focusScope";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { t, type Locale } from "../../lib/i18n";
import { useTvViewEvents, useViewActivity } from "../../lib/tvEvents";
import { TvIntent } from "../../lib/tvInput";
import type { Source, ImportSummary } from "../../types/api";
import { Badge, Button, ChipButton, EmptyState, Field, Modal, Notice, PageView, Panel, TextInput } from "../../components/ui";

type ImportTab = "m3u" | "xtream" | "xmltv";
type SourceFocusTarget = "add" | "filter" | "list";
type SourceFilter = "all" | "enabled" | "disabled" | "backoff" | "error";
type SourceRowAction = "refresh" | "edit" | "delete";

const importTabOrder = ["m3u", "xtream", "xmltv"] as const;
const deleteConfirmActions = ["cancel", "delete"] as const;
const sourceFilterOrder = ["all", "enabled", "disabled", "backoff", "error"] as const;
const sourceActionOrder = ["refresh", "edit", "delete"] as const;

interface Props {
  locale: Locale;
}

export function SourcesView({ locale }: Props) {
  const { isKeyboardContentActive, shouldClearDomFocus } = useViewActivity("sources");
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [activeTab, setActiveTab] = useState<ImportTab>("m3u");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [actionMenuSource, setActionMenuSource] = useState<Source | null>(null);
  const [actionMenuIndex, setActionMenuIndex] = useState(0);
  const [editing, setEditing] = useState<EditSourceDraft | null>(null);
  const [deleteConfirmSource, setDeleteConfirmSource] = useState<Source | null>(null);
  const [deleteConfirmAction, setDeleteConfirmAction] = useState<"cancel" | "delete">("cancel");
  const [focusedSourceIndex, setFocusedSourceIndex] = useState(0);
  const [focusTarget, setFocusTarget] = useState<SourceFocusTarget>("add");
  const [focusedFilterIndex, setFocusedFilterIndex] = useState(0);
  const [domFocusedSourceId, setDomFocusedSourceId] = useState<number | null>(null);
  const [hoveredSourceId, setHoveredSourceId] = useState<number | null>(null);
  const refreshingSourceIds = useRef<Set<number>>(new Set());
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterChipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const addTabRefs = useRef<Record<ImportTab, HTMLButtonElement | null>>({
    m3u: null,
    xtream: null,
    xmltv: null,
  });
  const addModalFirstInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const deleteConfirmRef = useRef<HTMLButtonElement | null>(null);
  const sourceRowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const filteredSources = useMemo(
    () => sources.filter((source) => matchesSourceFilter(source, sourceFilter)),
    [sourceFilter, sources],
  );
  const sourceListGroup = useIndexFocusGroup({
    itemCount: filteredSources.length,
    currentIndex: focusedSourceIndex,
    setCurrentIndex: setFocusedSourceIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "bubble",
    forwardEdge: "bubble",
  });
  const sourceFilterGroup = useIndexFocusGroup({
    itemCount: sourceFilterOrder.length,
    currentIndex: focusedFilterIndex,
    setCurrentIndex: setFocusedFilterIndex,
    backwardIntent: TvIntent.MoveLeft,
    forwardIntent: TvIntent.MoveRight,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const sourceActionGroup = useIndexFocusGroup({
    itemCount: sourceActionOrder.length,
    currentIndex: actionMenuIndex,
    setCurrentIndex: setActionMenuIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const addModalTabGroup = useLinearFocusGroup({
    items: importTabOrder,
    current: activeTab,
    setCurrent: setActiveTab,
    backwardIntent: TvIntent.MoveLeft,
    forwardIntent: TvIntent.MoveRight,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const deleteConfirmActionGroup = useLinearFocusGroup({
    items: deleteConfirmActions,
    current: deleteConfirmAction,
    setCurrent: setDeleteConfirmAction,
    backwardIntent: TvIntent.MoveLeft,
    forwardIntent: TvIntent.MoveRight,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });

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
    if (filteredSources.length === 0) {
      setFocusedSourceIndex(0);
      setDomFocusedSourceId(null);
      setFocusTarget((current) => (current === "list" ? "filter" : current));
      return;
    }
    setFocusedSourceIndex((prev) => Math.min(prev, filteredSources.length - 1));
  }, [filteredSources.length]);

  useEffect(() => {
    setFocusedFilterIndex(Math.max(0, sourceFilterOrder.indexOf(sourceFilter)));
  }, [sourceFilter]);

  const focusAddButton = () => {
    setFocusTarget("add");
    addButtonRef.current?.focus();
  };

  const focusFilterByIndex = (index: number) => {
    const wrapped = ((index % sourceFilterOrder.length) + sourceFilterOrder.length) % sourceFilterOrder.length;
    setFocusTarget("filter");
    setFocusedFilterIndex(wrapped);
    filterChipRefs.current[wrapped]?.focus();
  };

  const focusSourceByIndex = (index: number) => {
    if (filteredSources.length === 0) {
      focusFilterByIndex(focusedFilterIndex);
      return;
    }
    const wrapped = ((index % filteredSources.length) + filteredSources.length) % filteredSources.length;
    setFocusTarget("list");
    setFocusedSourceIndex(wrapped);
    const source = filteredSources[wrapped];
    const rowNode = source ? sourceRowRefs.current[source.id] : null;
    rowNode?.focus();
    rowNode?.scrollIntoView({ block: "nearest" });
  };

  const focusCurrentSource = () => {
    focusSourceByIndex(focusedSourceIndex);
  };

  const executeAction = (source: Source, action: SourceRowAction) => {
    if (action === "refresh") {
      if (!source.enabled || isSourceInBackoff(source) || loading) {
        return;
      }
      setActionMenuSource(null);
      void handleRefresh(source.id);
      return;
    }
    if (action === "edit") {
      setActionMenuSource(null);
      openEdit(source);
      return;
    }
    openDeleteConfirm(source);
  };

  const openActionMenu = (source: Source) => {
    setActionMenuSource(source);
    setActionMenuIndex(0);
  };

  const closeActionMenu = () => {
    setActionMenuSource(null);
    window.setTimeout(() => {
      focusCurrentSource();
    }, 0);
  };

  const openDeleteConfirm = (source: Source) => {
    setDeleteConfirmSource(source);
    setDeleteConfirmAction("cancel");
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmSource(null);
    window.setTimeout(() => {
      if (actionMenuSource) {
        actionMenuRefs.current[actionMenuIndex]?.focus();
        return;
      }
      focusCurrentSource();
    }, 0);
  };

  const closeEditModal = () => {
    setEditing(null);
    window.setTimeout(() => focusCurrentSource(), 0);
  };

  const executeDeleteConfirmed = async () => {
    if (!deleteConfirmSource) return;
    const targetId = deleteConfirmSource.id;
    setDeleteConfirmSource(null);
    await handleDelete(targetId);
    window.setTimeout(() => {
      if (filteredSources.length > 1) {
        focusSourceByIndex(Math.min(focusedSourceIndex, filteredSources.length - 2));
        return;
      }
      if (sourceFilterOrder.length > 0) {
        focusFilterByIndex(focusedFilterIndex);
      } else {
        focusAddButton();
      }
    }, 0);
  };

  useEffect(() => {
    if (shouldClearDomFocus) {
      setDomFocusedSourceId(null);
    }
  }, [shouldClearDomFocus]);

  useTvViewEvents({
    views: "sources",
    onFocusContent: () => {
      if (focusTarget === "list" && filteredSources.length > 0) {
        focusSourceByIndex(focusedSourceIndex);
        return;
      }
      if (focusTarget === "filter") {
        focusFilterByIndex(focusedFilterIndex);
        return;
      }
      focusAddButton();
    },
    onContentKey: (event) => {
      if (event.defaultPrevented) return;
      const detail = event.detail;
      const intent = detail?.intent;
      const key = detail?.key;
      if (!intent && !key) return;
      if (actionMenuSource) {
        if (intent === TvIntent.MoveUp || intent === TvIntent.MoveDown) {
          event.preventDefault();
          const result = sourceActionGroup.handleIntent(intent);
          if (result.handled) {
            window.setTimeout(() => actionMenuRefs.current[result.next]?.focus(), 0);
          }
          return;
        }
        if (intent === TvIntent.MoveLeft || intent === TvIntent.Back) {
          event.preventDefault();
          closeActionMenu();
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          executeAction(actionMenuSource, sourceActionOrder[actionMenuIndex] ?? "edit");
        }
        return;
      }

      if (deleteConfirmSource) {
        if (intent === TvIntent.MoveLeft || intent === TvIntent.MoveRight) {
          const result = deleteConfirmActionGroup.handleIntent(intent);
          if (result.handled) {
            event.preventDefault();
          }
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          if (deleteConfirmAction === "delete") {
            void executeDeleteConfirmed();
          } else {
            closeDeleteConfirm();
          }
          return;
        }
        return;
      }

      if (showAddModal) {
        if (intent === TvIntent.MoveLeft || intent === TvIntent.MoveRight) {
          const result = addModalTabGroup.handleIntent(intent);
          if (result.handled) {
            event.preventDefault();
            window.setTimeout(() => addTabRefs.current[result.next]?.focus(), 0);
          }
          return;
        }
        if (intent === TvIntent.MoveDown || intent === TvIntent.Confirm) {
          event.preventDefault();
          addModalFirstInputRef.current?.focus();
          return;
        }
        if (intent === TvIntent.MoveUp) {
          event.preventDefault();
          addTabRefs.current[activeTab]?.focus();
        }
        return;
      }

      if (editing) return;

      if (focusTarget === "filter") {
        if (intent === TvIntent.MoveLeft || intent === TvIntent.MoveRight) {
          const result = sourceFilterGroup.handleIntent(intent);
          if (result.handled) {
            event.preventDefault();
            focusFilterByIndex(result.next);
          }
          return;
        }
        if (intent === TvIntent.MoveUp) {
          event.preventDefault();
          focusAddButton();
          return;
        }
        if (intent === TvIntent.MoveDown) {
          event.preventDefault();
          if (filteredSources.length > 0) {
            focusSourceByIndex(0);
          }
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          setSourceFilter(sourceFilterOrder[focusedFilterIndex] ?? "all");
        }
        return;
      }

      if (intent === TvIntent.MoveDown || intent === TvIntent.MoveUp) {
        event.preventDefault();
        if (focusTarget === "add") {
          if (intent === TvIntent.MoveDown) {
            focusFilterByIndex(focusedFilterIndex);
          }
          return;
        }
        const result = sourceListGroup.handleIntent(intent);
        if (!result.handled) {
          if (intent === TvIntent.MoveUp) {
            focusFilterByIndex(focusedFilterIndex);
          }
          return;
        }
        focusSourceByIndex(result.next);
        return;
      }

      if (intent === TvIntent.Confirm) {
        event.preventDefault();
        if (focusTarget === "add") {
          setShowAddModal(true);
          return;
        }
        const current = filteredSources[focusedSourceIndex];
        if (current) {
          openActionMenu(current);
        }
        return;
      }

      if (focusTarget !== "list") return;
      const current = filteredSources[focusedSourceIndex];
      if (!current) return;

      if (key === "Delete") {
        event.preventDefault();
        openDeleteConfirm(current);
        return;
      }
      if (key === "r" || key === "R") {
        event.preventDefault();
        void handleRefresh(current.id);
      }
    },
  });

  useEffect(() => {
    if (!showAddModal && !editing && !deleteConfirmSource && !actionMenuSource) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (actionMenuSource) {
        closeActionMenu();
      } else if (deleteConfirmSource) {
        closeDeleteConfirm();
      } else if (editing) {
        closeEditModal();
      } else {
        setShowAddModal(false);
        window.setTimeout(() => focusAddButton(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionMenuIndex, actionMenuSource, deleteConfirmSource, editing, showAddModal]);

  useEffect(() => {
    if (!showAddModal) return;
    window.setTimeout(() => addTabRefs.current[activeTab]?.focus(), 0);
  }, [showAddModal, activeTab]);

  useEffect(() => {
    if (!actionMenuSource) return;
    window.setTimeout(() => actionMenuRefs.current[actionMenuIndex]?.focus(), 0);
  }, [actionMenuIndex, actionMenuSource]);

  useEffect(() => {
    if (!deleteConfirmSource) return;
    window.setTimeout(() => {
      if (deleteConfirmAction === "delete") {
        deleteConfirmRef.current?.focus();
      } else {
        deleteCancelRef.current?.focus();
      }
    }, 0);
  }, [deleteConfirmAction, deleteConfirmSource]);

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

  const m3uSources = useMemo(
    () => sources.filter((s) => s.enabled && s.kind === "m3u" && (s.autoRefreshMinutes ?? 0) > 0),
    [sources],
  );
  useEffect(() => {
    if (m3uSources.length === 0) return;
    const checkAndRefresh = () => {
      if (document.hidden) return;
      const now = Date.now();
      const overdue = m3uSources.find((source) => {
        const nextRetryAt = parseSqliteDate(source.nextRetryAt);
        if (nextRetryAt !== null && nextRetryAt > now) {
          return false;
        }
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
    <PageView style={{ height: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t(locale, "sources.title")}</h2>
        <Button
          ref={addButtonRef}
          type="button"
          data-tv-focusable={focusTarget === "add" ? "true" : undefined}
          onFocus={() => setFocusTarget("add")}
          onClick={() => setShowAddModal(true)}
          active={focusTarget === "add" && isKeyboardContentActive}
          style={{ alignSelf: "auto" }}
        >
          + {t(locale, "sources.action.add")}
        </Button>
      </div>

      {message ? <Notice tone={message.type === "ok" ? "success" : "danger"}>{message.text}</Notice> : null}

      {sources.length > 0 ? (
        <Panel padding="var(--space-4)" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{t(locale, "sources.section.importedSources")}</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(sourceFilterOrder as readonly SourceFilter[]).map((filter, index) => (
                <ChipButton
                  key={filter}
                  type="button"
                  ref={(node) => {
                    filterChipRefs.current[index] = node;
                  }}
                  data-tv-focusable={focusTarget === "filter" && focusedFilterIndex === index ? "true" : undefined}
                  onClick={() => setSourceFilter(filter)}
                  onFocus={() => {
                    setFocusTarget("filter");
                    setFocusedFilterIndex(index);
                  }}
                  active={sourceFilter === filter || (focusTarget === "filter" && focusedFilterIndex === index && isKeyboardContentActive)}
                >
                  {t(locale, `sources.filter.${filter}`)}
                </ChipButton>
              ))}
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                <th style={thStyle}>{t(locale, "sources.table.name")}</th>
                <th style={thStyle}>{t(locale, "sources.table.type")}</th>
                <th style={thStyle}>{t(locale, "sources.table.status")}</th>
                <th style={thStyle}>{t(locale, "sources.table.location")}</th>
                <th style={thStyle}>{t(locale, "sources.table.importedOverview")}</th>
                <th style={thStyle}>{t(locale, "sources.table.autoRefresh")}</th>
                <th style={thStyle}>{t(locale, "sources.table.lastImport")}</th>
                <th style={iconThStyle} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((s, index) => (
                <tr
                  key={s.id}
                  ref={(node) => {
                    sourceRowRefs.current[s.id] = node;
                  }}
                  role="button"
                  tabIndex={0}
                  data-tv-focusable={focusTarget === "list" && focusedSourceIndex === index ? "true" : undefined}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    outline: "none",
                    ...(hoveredSourceId === s.id || (isKeyboardContentActive && domFocusedSourceId === s.id) ? sourceRowActiveStyle : null),
                  }}
                  onFocus={() => {
                    setFocusTarget("list");
                    setFocusedSourceIndex(index);
                    setDomFocusedSourceId(s.id);
                  }}
                  onBlur={() => {
                    setDomFocusedSourceId((prev) => (prev === s.id ? null : prev));
                  }}
                  onMouseEnter={() => setHoveredSourceId(s.id)}
                  onMouseLeave={() => setHoveredSourceId((prev) => (prev === s.id ? null : prev))}
                  onDoubleClick={() => openActionMenu(s)}
                >
                  <td style={tdStyle}>{s.name}</td>
                  <td style={tdStyle}>{s.kind.toUpperCase()}</td>
                  <td style={{ ...tdStyle, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Badge tone={getSourceStatusTone(s)} style={statusBadgeStyle}>
                        {t(locale, `sources.status.${getSourceStatusKey(s)}`)}
                      </Badge>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                        {describeSourceStatus(s, locale)}
                      </span>
                    </div>
                    {s.lastRefreshError ? (
                      <div style={{ marginTop: 6, color: "var(--danger)", fontSize: 12 }}>
                        {t(locale, "sources.status.lastError", { error: s.lastRefreshError })}
                      </div>
                    ) : null}
                  </td>
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
                  <td style={iconTdStyle}>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={t(locale, "sources.action.openMenuAria")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openActionMenu(s);
                      }}
                      style={iconTriggerButtonStyle}
                    >
                      <Settings2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSources.length === 0 ? (
            <EmptyState description={t(locale, "sources.filter.empty")} style={{ padding: "var(--space-4) 0 0" }} />
          ) : null}
        </Panel>
      ) : (
        <EmptyState description={t(locale, "sources.empty")} />
      )}

      {showAddModal && (
        <Modal onDismiss={() => {
          setShowAddModal(false);
          window.setTimeout(() => focusAddButton(), 0);
        }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>{t(locale, "sources.add.title")}</h3>
            <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
              {(["m3u", "xtream", "xmltv"] as ImportTab[]).map((tab) => (
                <Button
                  key={tab}
                  ref={(node) => {
                    addTabRefs.current[tab] = node;
                  }}
                  onClick={() => setActiveTab(tab)}
                  variant={activeTab === tab ? "primary" : "secondary"}
                  size="sm"
                  style={{ borderRadius: 0 }}
                >
                  {tab === "m3u" ? "M3U" : tab === "xtream" ? t(locale, "sources.tab.xtream") : "XMLTV EPG"}
                </Button>
              ))}
            </div>
            {activeTab === "m3u" && (
              <M3uForm
                locale={locale}
                loading={loading}
                setLoading={setLoading}
                  firstInputRef={addModalFirstInputRef}
                onDone={(summary) => {
                  handleImportDone(summary, false);
                  setShowAddModal(false);
                  focusAddButton();
                }}
                onError={(e) => setMessage({ type: "err", text: e })}
              />
            )}
            {activeTab === "xtream" && (
              <XtreamForm
                locale={locale}
                loading={loading}
                setLoading={setLoading}
                  firstInputRef={addModalFirstInputRef}
                onDone={(summary) => {
                  handleImportDone(summary, false);
                  setShowAddModal(false);
                  focusAddButton();
                }}
                onError={(e) => setMessage({ type: "err", text: e })}
              />
            )}
            {activeTab === "xmltv" && (
              <XmltvForm
                locale={locale}
                loading={loading}
                setLoading={setLoading}
                  firstInputRef={addModalFirstInputRef}
                onDone={(summary) => {
                  handleImportDone(summary, false);
                  setShowAddModal(false);
                  focusAddButton();
                }}
                onError={(e) => setMessage({ type: "err", text: e })}
              />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <Button
                onClick={() => {
                  setShowAddModal(false);
                  focusAddButton();
                }}
                variant="secondary"
              >
                {t(locale, "sources.edit.cancel")}
              </Button>
            </div>
        </Modal>
      )}

      {actionMenuSource && (
        <Modal onDismiss={closeActionMenu}>
            <div style={actionMenuHeaderStyle}>
              <div>
                <h3 style={{ margin: 0 }}>{t(locale, "sources.actionMenu.title", { name: actionMenuSource.name })}</h3>
                <p style={actionMenuDescriptionStyle}>{t(locale, "sources.actionMenu.subtitle")}</p>
              </div>
            </div>
            <div style={actionMenuMetaStyle}>
              <div style={actionMenuMetaRowStyle}>
                <span>{t(locale, "sources.table.type")}</span>
                <strong>{actionMenuSource.kind.toUpperCase()}</strong>
              </div>
              <div style={actionMenuMetaRowStyle}>
                <span>{t(locale, "sources.table.status")}</span>
                <strong>{t(locale, `sources.status.${getSourceStatusKey(actionMenuSource)}`)}</strong>
              </div>
              <div style={actionMenuMetaRowStyle}>
                <span>{t(locale, "sources.table.location")}</span>
                <strong style={actionMenuMetaValueStyle}>{actionMenuSource.location}</strong>
              </div>
            </div>
            <div style={actionMenuStackStyle}>
              {sourceActionOrder.map((action, index) => {
                const disabled =
                  action === "refresh" && (loading || !actionMenuSource.enabled || isSourceInBackoff(actionMenuSource));
                return (
                  <Button
                    key={action}
                    ref={(node) => {
                      actionMenuRefs.current[index] = node;
                    }}
                    type="button"
                    disabled={disabled}
                    onClick={() => executeAction(actionMenuSource, action)}
                    variant={action === "delete" ? "danger" : "secondary"}
                    active={actionMenuIndex === index}
                    style={{
                      ...actionMenuButtonStyle,
                      ...(disabled ? actionMenuDisabledStyle : null),
                    }}
                  >
                    {t(locale, `sources.action.${action}`)}
                  </Button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <Button
                type="button"
                onClick={closeActionMenu}
                variant="secondary"
              >
                {t(locale, "sources.edit.cancel")}
              </Button>
            </div>
        </Modal>
      )}

      {deleteConfirmSource && (
        <Modal onDismiss={closeDeleteConfirm}>
            <h3 style={{ marginTop: 0 }}>{t(locale, "sources.deleteConfirm.title")}</h3>
            <p style={{ marginTop: 0, color: "var(--text-secondary)" }}>
              {t(locale, "sources.deleteConfirm.message", { name: deleteConfirmSource.name })}
            </p>
            <div style={actionMenuMetaStyle}>
              <div style={actionMenuMetaRowStyle}>
                <span>{t(locale, "sources.table.type")}</span>
                <strong>{deleteConfirmSource.kind.toUpperCase()}</strong>
              </div>
              <div style={actionMenuMetaRowStyle}>
                <span>{t(locale, "sources.table.location")}</span>
                <strong style={actionMenuMetaValueStyle}>{deleteConfirmSource.location}</strong>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button
                ref={deleteCancelRef}
                onClick={closeDeleteConfirm}
                variant="secondary"
                active={deleteConfirmAction === "cancel"}
              >
                {t(locale, "sources.deleteConfirm.cancel")}
              </Button>
              <Button
                ref={deleteConfirmRef}
                onClick={() => {
                  void executeDeleteConfirmed();
                }}
                variant="danger"
                active={deleteConfirmAction === "delete"}
              >
                {t(locale, "sources.deleteConfirm.confirm")}
              </Button>
            </div>
        </Modal>
      )}

      {editing && (
        <Modal onDismiss={closeEditModal}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>{t(locale, "sources.edit.title")}</h3>
            <Field label={t(locale, "sources.edit.name")}>
              <TextInput value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label={t(locale, "sources.edit.location")}>
              <TextInput value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
            </Field>
            {editing.kind === "xtream" && (
              <>
                <Field label={t(locale, "sources.edit.username")}>
                  <TextInput value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} />
                </Field>
                <Field label={t(locale, "sources.edit.password")}>
                  <TextInput type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
                </Field>
              </>
            )}
            {editing.kind === "m3u" && (
              <Field label={t(locale, "sources.edit.autoRefreshInterval")}>
                <TextInput
                  type="number"
                  min={1}
                  value={editing.autoRefreshMinutes}
                  onChange={(e) => setEditing({ ...editing, autoRefreshMinutes: e.target.value })}
                />
              </Field>
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
              <Button
                onClick={closeEditModal}
                variant="secondary"
                disabled={savingEdit}
              >
                {t(locale, "sources.edit.cancel")}
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? t(locale, "sources.edit.saving") : t(locale, "sources.edit.save")}
              </Button>
            </div>
        </Modal>
      )}
    </PageView>
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
  firstInputRef: { current: HTMLInputElement | null };
}

function M3uForm({ locale, loading, setLoading, onDone, onError, firstInputRef }: FormProps) {
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
      <Field label={t(locale, "sources.form.name")}>
        <TextInput
          ref={firstInputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(locale, "sources.form.m3uNamePlaceholder")}
        />
      </Field>
      <Field label={t(locale, "sources.form.m3uLocation")}>
        <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="http://example.com/playlist.m3u" />
      </Field>
      <Field label={t(locale, "sources.form.autoRefreshInterval")}>
        <TextInput
          value={autoRefreshMinutes}
          onChange={(e) => setAutoRefreshMinutes(e.target.value)}
          placeholder={t(locale, "sources.form.autoRefreshPlaceholder")}
          type="number"
          min={1}
        />
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? t(locale, "sources.form.importing") : t(locale, "sources.form.importM3u")}
      </Button>
    </form>
  );
}

function XtreamForm({ locale, loading, setLoading, onDone, onError, firstInputRef }: FormProps) {
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
      <Field label={t(locale, "sources.form.name")}>
        <TextInput
          ref={firstInputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(locale, "sources.form.xtreamNamePlaceholder")}
        />
      </Field>
      <Field label={t(locale, "sources.form.serverUrl")}>
        <TextInput value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://example.com:8080" />
      </Field>
      <Field label={t(locale, "sources.form.username")}>
        <TextInput value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label={t(locale, "sources.form.password")}>
        <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? t(locale, "sources.form.importing") : t(locale, "sources.form.importXtream")}
      </Button>
    </form>
  );
}

function XmltvForm({ locale, loading, setLoading, onDone, onError, firstInputRef }: FormProps) {
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
      <Field label={t(locale, "sources.form.name")}>
        <TextInput
          ref={firstInputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(locale, "sources.form.xmltvNamePlaceholder")}
        />
      </Field>
      <Field label={t(locale, "sources.form.xmltvLocation")}>
        <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="http://example.com/epg.xml" />
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? t(locale, "sources.form.importing") : t(locale, "sources.form.importXmltv")}
      </Button>
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

function matchesSourceFilter(source: Source, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "enabled") return source.enabled;
  if (filter === "disabled") return !source.enabled;
  if (filter === "backoff") return isSourceInBackoff(source);
  if (filter === "error") return Boolean(source.lastRefreshError);
  return true;
}

function getSourceStatusKey(source: Source): "disabled" | "backoff" | "error" | "healthy" {
  if (!source.enabled) return "disabled";
  if (isSourceInBackoff(source)) return "backoff";
  if (source.lastRefreshError) return "error";
  return "healthy";
}

function getSourceStatusTone(source: Source): "default" | "warning" | "danger" | "success" {
  const status = getSourceStatusKey(source);
  if (status === "disabled") {
    return "default";
  }
  if (status === "backoff") {
    return "warning";
  }
  if (status === "error") {
    return "danger";
  }
  return "success";
}

function describeSourceStatus(source: Source, locale: Locale): string {
  if (!source.enabled) {
    return t(locale, "sources.reason.userDisabled");
  }
  if (isSourceInBackoff(source)) {
    return t(locale, "sources.reason.backoffUntil", {
      time: source.nextRetryAt ?? "—",
      failures: source.consecutiveRefreshFailures,
    });
  }
  if (source.lastRefreshError && source.lastRefreshAttemptAt) {
    return t(locale, "sources.reason.lastFailedAt", { time: source.lastRefreshAttemptAt });
  }
  if (source.lastImportedAt) {
    return t(locale, "sources.reason.lastImportedAt", { time: source.lastImportedAt });
  }
  return t(locale, "sources.reason.ready");
}

function isSourceInBackoff(source: Source): boolean {
  const nextRetryTs = parseSqliteDate(source.nextRetryAt);
  return nextRetryTs !== null && nextRetryTs > Date.now();
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

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
};

const iconThStyle: React.CSSProperties = {
  ...thStyle,
  width: 56,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
};

const iconTdStyle: React.CSSProperties = {
  ...tdStyle,
  width: 56,
  textAlign: "center",
};

const actionMenuButtonStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  justifyContent: "flex-start",
};

const actionMenuDisabledStyle: React.CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const actionMenuStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const actionMenuHeaderStyle: React.CSSProperties = {
  marginBottom: 16,
};

const actionMenuDescriptionStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const actionMenuMetaStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginBottom: 16,
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-primary)",
};

const actionMenuMetaRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "var(--text-secondary)",
  fontSize: 13,
};

const actionMenuMetaValueStyle: React.CSSProperties = {
  color: "var(--text-primary)",
  maxWidth: 280,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const iconTriggerButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const statusBadgeStyle: React.CSSProperties = {};

const sourceRowActiveStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-tertiary)",
  boxShadow: "inset 0 0 0 1px var(--accent)",
};
