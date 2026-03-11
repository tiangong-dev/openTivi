import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type Ref } from "react";

import { getErrorMessage } from "../../lib/errors";
import { useIndexFocusGroup, useLinearFocusGroup } from "../../lib/focusScope";
import { t, type Locale } from "../../lib/i18n";
import {
  EPG_REMINDERS_SETTING_KEY,
  resolveEpgReminders,
  type EpgReminder,
} from "../../lib/settings";
import { tauriInvoke } from "../../lib/tauri";
import { useTvViewEvents, useViewActivity } from "../../lib/tvEvents";
import {
  ConfirmGesture,
  createConfirmPressHandler,
  isConfirmGestureOneOf,
  TvIntent,
} from "../../lib/tvInput";
import type { Channel, EpgProgramSearchResult, Setting, Source } from "../../types/api";
import { formatTime, parseXmltvDate } from "../player/playerUtils";
import { ChannelRowsWithGuide } from "./ChannelRowsWithGuide";

interface Props {
  locale: Locale;
  favoritesOnly?: boolean;
  onPlay?: (channel: Channel, allChannels?: Channel[]) => void;
}

type ChannelSort = "name" | "channelNumber" | "sourceThenChannel";
type EpgStateFilter = "all" | "live" | "upcoming";
type FilterColumn = "source" | "group" | "sort";
type EpgRegion = "input" | "status" | "results";
const filterColumnOrder = ["source", "group", "sort"] as const;
const epgRegionOrder = ["input", "status", "results"] as const;

export enum ChannelsFocusAnchor {
  ChannelSearchEntry = "channelSearchEntry",
  FilterEntry = "filterEntry",
  EpgEntry = "epgEntry",
  ChannelList = "channelList",
}

export enum ChannelsMode {
  Browse = "browse",
  ChannelSearchEditing = "channelSearchEditing",
  Filters = "filters",
  EpgBrowse = "epgBrowse",
  EpgSearchEditing = "epgSearchEditing",
  EpgDetail = "epgDetail",
}

const browseEntryOrder = [
  ChannelsFocusAnchor.FilterEntry,
  ChannelsFocusAnchor.EpgEntry,
] as const;
const browseAnchorOrder = [
  ChannelsFocusAnchor.ChannelSearchEntry,
  ChannelsFocusAnchor.FilterEntry,
  ChannelsFocusAnchor.EpgEntry,
  ChannelsFocusAnchor.ChannelList,
] as const;

export function ChannelsView({ locale, favoritesOnly = false, onPlay }: Props) {
  const { isKeyboardContentActive } = useViewActivity("channels");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ChannelSort>("channelNumber");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [epgSearch, setEpgSearch] = useState("");
  const [epgSearchDraft, setEpgSearchDraft] = useState("");
  const [epgStateFilter, setEpgStateFilter] = useState<EpgStateFilter>("all");
  const [epgResults, setEpgResults] = useState<EpgProgramSearchResult[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const [epgDrawerItem, setEpgDrawerItem] = useState<EpgProgramSearchResult | null>(null);
  const [epgReminders, setEpgReminders] = useState<EpgReminder[]>([]);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState(0);
  const [focusAnchor, setFocusAnchor] = useState<ChannelsFocusAnchor>(ChannelsFocusAnchor.ChannelList);
  const [mode, setMode] = useState<ChannelsMode>(ChannelsMode.Browse);
  const [filterColumn, setFilterColumn] = useState<FilterColumn>("source");
  const [filterSourceIndex, setFilterSourceIndex] = useState(0);
  const [filterGroupIndex, setFilterGroupIndex] = useState(0);
  const [filterSortIndex, setFilterSortIndex] = useState(0);
  const [epgRegion, setEpgRegion] = useState<EpgRegion>("input");
  const [epgResultIndex, setEpgResultIndex] = useState(0);
  const channelSearchEntryRef = useRef<HTMLButtonElement | null>(null);
  const channelSearchInputRef = useRef<HTMLInputElement | null>(null);
  const filterEntryRef = useRef<HTMLButtonElement | null>(null);
  const epgEntryRef = useRef<HTMLButtonElement | null>(null);
  const epgSearchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const epgSearchInputRef = useRef<HTMLInputElement | null>(null);
  const epgDetailActionRef = useRef<HTMLButtonElement | null>(null);
  const sourceOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const groupOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sortOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const epgStatusRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const epgResultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const confirmPressRef = useRef<ReturnType<typeof createConfirmPressHandler> | null>(null);

  const sourceOptions = useMemo(
    () => [
      { value: null, label: t(locale, "channels.allSources") },
      ...sources.map((source) => ({ value: source.id, label: source.name })),
    ],
    [locale, sources],
  );
  const groupOptions = useMemo(
    () => [
      { value: null, label: t(locale, "channels.all") },
      ...groups.map((group) => ({ value: group, label: group })),
    ],
    [groups, locale],
  );
  const sortOptions = useMemo(
    () => [
      { value: "channelNumber" as const, label: t(locale, "channels.sort.channelNumber") },
      { value: "name" as const, label: t(locale, "channels.sort.name") },
      { value: "sourceThenChannel" as const, label: t(locale, "channels.sort.sourceThenChannel") },
    ],
    [locale],
  );
  const epgStatusOptions = useMemo(
    () => [
      { value: "all" as const, label: t(locale, "epg.filter.all") },
      { value: "live" as const, label: t(locale, "epg.filter.live") },
      { value: "upcoming" as const, label: t(locale, "epg.filter.upcoming") },
    ],
    [locale],
  );
  const currentChannel = channels[focusedChannelIndex] ?? null;
  const isBrowseMode = mode === ChannelsMode.Browse;
  const isSearchBarActive =
    isKeyboardContentActive &&
    (mode === ChannelsMode.ChannelSearchEditing ||
      (isBrowseMode && focusAnchor === ChannelsFocusAnchor.ChannelSearchEntry));
  const isListActive = isKeyboardContentActive && isBrowseMode && focusAnchor === ChannelsFocusAnchor.ChannelList;
  const sourceIndex = Math.max(0, sourceOptions.findIndex((option) => option.value === selectedSourceId));
  const groupIndex = Math.max(0, groupOptions.findIndex((option) => option.value === selectedGroup));
  const sortIndex = Math.max(0, sortOptions.findIndex((option) => option.value === sortBy));
  const browseEntryGroup = useLinearFocusGroup({
    items: browseEntryOrder,
    current:
      focusAnchor === ChannelsFocusAnchor.FilterEntry || focusAnchor === ChannelsFocusAnchor.EpgEntry
        ? focusAnchor
        : ChannelsFocusAnchor.FilterEntry,
    setCurrent: (next) => setFocusAnchor(next),
    backwardIntent: TvIntent.MoveLeft,
    forwardIntent: TvIntent.MoveRight,
    backwardEdge: "bubble",
    forwardEdge: "stay",
  });
  const browseAnchorGroup = useLinearFocusGroup({
    items: browseAnchorOrder,
    current: focusAnchor,
    setCurrent: setFocusAnchor,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "stay",
    forwardEdge: "stay",
  });
  const filterColumnGroup = useLinearFocusGroup({
    items: filterColumnOrder,
    current: filterColumn,
    setCurrent: setFilterColumn,
    backwardIntent: TvIntent.MoveLeft,
    forwardIntent: TvIntent.MoveRight,
    backwardEdge: "stay",
    forwardEdge: "stay",
  });
  const filterSourceGroup = useIndexFocusGroup({
    itemCount: sourceOptions.length,
    currentIndex: filterSourceIndex,
    setCurrentIndex: setFilterSourceIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const filterGroupOptionGroup = useIndexFocusGroup({
    itemCount: groupOptions.length,
    currentIndex: filterGroupIndex,
    setCurrentIndex: setFilterGroupIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const filterSortGroup = useIndexFocusGroup({
    itemCount: sortOptions.length,
    currentIndex: filterSortIndex,
    setCurrentIndex: setFilterSortIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const epgRegionGroup = useLinearFocusGroup({
    items: epgRegionOrder,
    current: epgRegion,
    setCurrent: setEpgRegion,
    backwardIntent: TvIntent.MoveLeft,
    forwardIntent: TvIntent.MoveRight,
    backwardEdge: "stay",
    forwardEdge: "stay",
  });
  const epgStatusGroup = useIndexFocusGroup({
    itemCount: epgStatusOptions.length,
    currentIndex: Math.max(
      0,
      epgStatusOptions.findIndex((option) => option.value === epgStateFilter),
    ),
    setCurrentIndex: (nextIndex) => setEpgStateFilter(epgStatusOptions[nextIndex]?.value ?? "all"),
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const epgResultsGroup = useIndexFocusGroup({
    itemCount: epgResults.length,
    currentIndex: epgResultIndex,
    setCurrentIndex: setEpgResultIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });

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
      const next = await tauriInvoke<string[]>("list_groups", { sourceId: sourceId ?? undefined });
      setGroups(next);
    } catch {
      setGroups([]);
    }
  };

  const loadSources = async () => {
    try {
      const list = await tauriInvoke<Source[]>("list_sources");
      setSources(list.filter((item) => item.enabled && item.kind !== "xmltv"));
    } catch {
      setSources([]);
    }
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

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    setEpgSearchDraft(epgSearch);
  }, [epgSearch]);

  useEffect(() => {
    setFocusedChannelIndex((current) => {
      if (channels.length === 0) return 0;
      return Math.max(0, Math.min(current, channels.length - 1));
    });
  }, [channels.length]);

  useEffect(() => {
    setEpgResultIndex((current) => {
      if (epgResults.length === 0) return 0;
      return Math.max(0, Math.min(current, epgResults.length - 1));
    });
  }, [epgResults.length]);

  useEffect(() => {
    if (mode === ChannelsMode.EpgDetail && epgDrawerItem) {
      const index = epgResults.findIndex((item) => item.id === epgDrawerItem.id);
      if (index < 0) {
        setMode(ChannelsMode.EpgBrowse);
        setEpgDrawerItem(null);
      }
    }
  }, [epgDrawerItem, epgResults, mode]);

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

  const toggleFavorite = async (channel: Channel) => {
    try {
      await tauriInvoke("set_favorite", { input: { channelId: channel.id, favorite: !channel.isFavorite } });
      await loadChannels();
    } catch {
      // Ignore favorite toggle failures in-place.
    }
  };

  const toggleReminder = async (program: EpgProgramSearchResult) => {
    const exists = epgReminders.some((item) => item.programId === program.id);
    const next = exists
      ? epgReminders.filter((item) => item.programId !== program.id)
      : [
          ...epgReminders,
          {
            programId: program.id,
            channelId: program.channelId,
            title: program.title,
            startAt: program.startAt,
          },
        ];
    setEpgReminders(next);
    await tauriInvoke("set_setting", {
      input: { key: EPG_REMINDERS_SETTING_KEY, value: next },
    }).catch(() => undefined);
  };

  const focusCurrentTarget = () => {
    if (!isKeyboardContentActive) return;
    window.setTimeout(() => {
      if (mode === ChannelsMode.ChannelSearchEditing) {
        channelSearchInputRef.current?.focus();
        return;
      }
      if (mode === ChannelsMode.Filters) {
        if (filterColumn === "source") {
          sourceOptionRefs.current[filterSourceIndex]?.focus();
          return;
        }
        if (filterColumn === "group") {
          groupOptionRefs.current[filterGroupIndex]?.focus();
          return;
        }
        sortOptionRefs.current[filterSortIndex]?.focus();
        return;
      }
      if (mode === ChannelsMode.EpgSearchEditing) {
        epgSearchInputRef.current?.focus();
        return;
      }
      if (mode === ChannelsMode.EpgDetail) {
        epgDetailActionRef.current?.focus();
        return;
      }
      if (mode === ChannelsMode.EpgBrowse) {
        if (epgRegion === "input") {
          epgSearchTriggerRef.current?.focus();
          return;
        }
        if (epgRegion === "status") {
          const activeStatusIndex = Math.max(
            0,
            epgStatusOptions.findIndex((option) => option.value === epgStateFilter),
          );
          epgStatusRefs.current[activeStatusIndex]?.focus();
          return;
        }
        epgResultRefs.current[epgResultIndex]?.focus();
        return;
      }
      if (focusAnchor === ChannelsFocusAnchor.ChannelSearchEntry) {
        channelSearchEntryRef.current?.focus();
        return;
      }
      if (focusAnchor === ChannelsFocusAnchor.FilterEntry) {
        filterEntryRef.current?.focus();
        return;
      }
      if (focusAnchor === ChannelsFocusAnchor.EpgEntry) {
        epgEntryRef.current?.focus();
      }
    }, 0);
  };

  useEffect(() => {
    focusCurrentTarget();
  }, [
    epgRegion,
    epgResultIndex,
    epgResults.length,
    epgStateFilter,
    filterColumn,
    filterGroupIndex,
    filterSortIndex,
    filterSourceIndex,
    focusAnchor,
    isKeyboardContentActive,
    mode,
  ]);

  const focusBrowseAnchor = (anchor: ChannelsFocusAnchor) => {
    setMode(ChannelsMode.Browse);
    setFocusAnchor(anchor);
  };

  const openChannelSearch = () => {
    setMode(ChannelsMode.ChannelSearchEditing);
    setFocusAnchor(ChannelsFocusAnchor.ChannelSearchEntry);
  };

  const submitChannelSearch = () => {
    setSearch(searchDraft.trim());
    setFocusedChannelIndex(0);
    setMode(ChannelsMode.Browse);
    setFocusAnchor(ChannelsFocusAnchor.ChannelList);
  };

  const cancelChannelSearch = () => {
    setSearchDraft(search);
    focusBrowseAnchor(ChannelsFocusAnchor.ChannelSearchEntry);
  };

  const openFilters = () => {
    setFilterColumn("source");
    setFilterSourceIndex(sourceIndex);
    setFilterGroupIndex(groupIndex);
    setFilterSortIndex(sortIndex);
    setMode(ChannelsMode.Filters);
    setFocusAnchor(ChannelsFocusAnchor.FilterEntry);
  };

  const applyFilterSelection = () => {
    if (filterColumn === "source") {
      const option = sourceOptions[filterSourceIndex];
      if (option) {
        setSelectedSourceId(option.value);
      }
    } else if (filterColumn === "group") {
      const option = groupOptions[filterGroupIndex];
      if (option) {
        setSelectedGroup(option.value);
      }
    } else {
      const option = sortOptions[filterSortIndex];
      if (option) {
        setSortBy(option.value);
      }
    }
    setFocusedChannelIndex(0);
    setMode(ChannelsMode.Browse);
    setFocusAnchor(ChannelsFocusAnchor.ChannelList);
  };

  const closeFilters = () => {
    focusBrowseAnchor(ChannelsFocusAnchor.FilterEntry);
  };

  const openEpg = () => {
    setMode(ChannelsMode.EpgBrowse);
    setFocusAnchor(ChannelsFocusAnchor.EpgEntry);
    setEpgRegion("input");
    setEpgDrawerItem(null);
  };

  const submitEpgSearch = () => {
    setEpgSearch(epgSearchDraft.trim());
    setEpgRegion("results");
    setMode(ChannelsMode.EpgBrowse);
    setEpgResultIndex(0);
  };

  const closeEpg = () => {
    setMode(ChannelsMode.Browse);
    setFocusAnchor(ChannelsFocusAnchor.EpgEntry);
    setEpgRegion("input");
    setEpgDrawerItem(null);
  };

  useEffect(() => {
    confirmPressRef.current = createConfirmPressHandler({
      onGesture: (gesture) => {
        if (mode === ChannelsMode.Browse) {
          if (focusAnchor === ChannelsFocusAnchor.ChannelList) {
            if (!currentChannel) return;
            if (gesture === ConfirmGesture.Single) {
              onPlay?.(currentChannel, channels);
              return;
            }
            if (isConfirmGestureOneOf(gesture, [ConfirmGesture.Double, ConfirmGesture.Long])) {
              void toggleFavorite(currentChannel);
            }
            return;
          }

          if (gesture !== ConfirmGesture.Single) return;
          if (focusAnchor === ChannelsFocusAnchor.ChannelSearchEntry) {
            openChannelSearch();
            return;
          }
          if (focusAnchor === ChannelsFocusAnchor.FilterEntry) {
            openFilters();
            return;
          }
          if (focusAnchor === ChannelsFocusAnchor.EpgEntry) {
            openEpg();
          }
          return;
        }

        if (mode === ChannelsMode.Filters) {
          if (gesture === ConfirmGesture.Single) {
            applyFilterSelection();
          }
          return;
        }

        if (mode === ChannelsMode.EpgBrowse) {
          if (epgRegion === "input") {
            if (gesture === ConfirmGesture.Single) {
              setMode(ChannelsMode.EpgSearchEditing);
            }
            return;
          }
          if (epgRegion === "status") {
            if (gesture === ConfirmGesture.Single) {
              const option = epgStatusOptions.find((candidate) => candidate.value === epgStateFilter);
              if (option) {
                setEpgStateFilter(option.value);
              }
              setEpgRegion("results");
            }
            return;
          }
          const selectedProgram = epgResults[epgResultIndex];
          if (!selectedProgram) return;
          if (gesture === ConfirmGesture.Single) {
            setEpgDrawerItem(selectedProgram);
            setMode(ChannelsMode.EpgDetail);
            return;
          }
          if (isConfirmGestureOneOf(gesture, [ConfirmGesture.Double, ConfirmGesture.Long])) {
            void toggleReminder(selectedProgram);
          }
          return;
        }

        if (mode === ChannelsMode.EpgDetail) {
          if (gesture === ConfirmGesture.Single && epgDrawerItem) {
            void toggleReminder(epgDrawerItem);
          }
        }
      },
    });
    return () => {
      confirmPressRef.current?.clear();
      confirmPressRef.current = null;
    };
  }, [
    channels,
    currentChannel,
    epgDrawerItem,
    epgRegion,
    epgResultIndex,
    epgResults,
    epgStateFilter,
    focusAnchor,
    mode,
    onPlay,
    filterGroupIndex,
    filterSortIndex,
    filterSourceIndex,
    sourceOptions,
    groupOptions,
    sortOptions,
    epgStatusOptions,
  ]);

  useTvViewEvents({
    views: "channels",
    onFocusContent: () => {
      focusCurrentTarget();
    },
    onContentKey: (event) => {
      if (event.defaultPrevented) return;
      const detail = event.detail;
      const intent = detail?.intent;
      if (!intent) return;

      if (mode === ChannelsMode.ChannelSearchEditing) {
        if (intent === TvIntent.Back) {
          event.preventDefault();
          cancelChannelSearch();
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          submitChannelSearch();
        }
        return;
      }

      if (mode === ChannelsMode.Browse) {
        if (focusAnchor === ChannelsFocusAnchor.ChannelList) {
          return;
        }

        if (intent === TvIntent.MoveDown || intent === TvIntent.MoveUp) {
          const result = browseAnchorGroup.handleIntent(intent);
          if (result.handled) {
            event.preventDefault();
          }
          return;
        }

        if (
          (focusAnchor === ChannelsFocusAnchor.FilterEntry || focusAnchor === ChannelsFocusAnchor.EpgEntry) &&
          (intent === TvIntent.MoveLeft || intent === TvIntent.MoveRight)
        ) {
          const next = browseEntryGroup.handleIntent(intent);
          if (next.handled) {
            event.preventDefault();
          }
          return;
        }

        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          confirmPressRef.current?.onKeyDown(Boolean(detail?.repeat));
        }
        return;
      }

      if (mode === ChannelsMode.Filters) {
        if (intent === TvIntent.Back) {
          event.preventDefault();
          closeFilters();
          return;
        }
        if (intent === TvIntent.MoveLeft) {
          filterColumnGroup.handleIntent(intent);
          event.preventDefault();
          return;
        }
        if (intent === TvIntent.MoveRight) {
          filterColumnGroup.handleIntent(intent);
          event.preventDefault();
          return;
        }
        if (intent === TvIntent.MoveUp || intent === TvIntent.MoveDown) {
          const activeGroup =
            filterColumn === "source"
              ? filterSourceGroup
              : filterColumn === "group"
                ? filterGroupOptionGroup
                : filterSortGroup;
          const result = activeGroup.handleIntent(intent);
          if (result.handled) {
            event.preventDefault();
          }
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          confirmPressRef.current?.onKeyDown(Boolean(detail?.repeat));
        }
        return;
      }

      if (mode === ChannelsMode.EpgBrowse) {
        if (intent === TvIntent.Back) {
          event.preventDefault();
          closeEpg();
          return;
        }
        if (intent === TvIntent.MoveLeft) {
          epgRegionGroup.handleIntent(intent);
          event.preventDefault();
          return;
        }
        if (intent === TvIntent.MoveRight) {
          epgRegionGroup.handleIntent(intent);
          event.preventDefault();
          return;
        }
        if (intent === TvIntent.MoveUp || intent === TvIntent.MoveDown) {
          const activeGroup =
            epgRegion === "status"
              ? epgStatusGroup
              : epgRegion === "results"
                ? epgResultsGroup
                : null;
          const result = activeGroup?.handleIntent(intent);
          if (result?.handled) {
            event.preventDefault();
          }
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          confirmPressRef.current?.onKeyDown(Boolean(detail?.repeat));
          return;
        }
        if (intent === TvIntent.SecondaryAction && epgRegion === "results") {
          event.preventDefault();
          const selectedProgram = epgResults[epgResultIndex];
          if (selectedProgram) {
            void toggleReminder(selectedProgram);
          }
        }
        return;
      }

      if (mode === ChannelsMode.EpgDetail) {
        if (intent === TvIntent.Back) {
          event.preventDefault();
          setMode(ChannelsMode.EpgBrowse);
          setEpgRegion("results");
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          confirmPressRef.current?.onKeyDown(Boolean(detail?.repeat));
        }
      }
    },
    onContentKeyUp: (event) => {
      if (event.defaultPrevented) return;
      const detail = event.detail;
      if (detail?.intent !== TvIntent.Confirm) return;
      if (
        mode === ChannelsMode.ChannelSearchEditing ||
        mode === ChannelsMode.EpgSearchEditing
      ) {
        return;
      }
      event.preventDefault();
      confirmPressRef.current?.onKeyUp();
    },
  });

  const renderEntryButton = (
    ref: Ref<HTMLButtonElement>,
    title: string,
    subtitle: string,
    active: boolean,
    onClick: () => void,
    value?: string,
  ) => (
    <button
      ref={ref}
      type="button"
      data-tv-focusable={active ? "true" : undefined}
      style={{ ...entryButtonStyle, ...(active ? entryButtonActiveStyle : null) }}
      onClick={onClick}
    >
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{subtitle}</div>
      {value ? <div style={entryValueStyle}>{value}</div> : null}
    </button>
  );

  return (
    <div style={pageStyle}>
      <div style={searchBarWrapStyle}>
        <div style={searchBarHeaderStyle}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t(locale, "channels.searchEntry")}</div>
        </div>
        {mode === ChannelsMode.ChannelSearchEditing ? (
          <input
            ref={channelSearchInputRef}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={t(locale, "channels.searchPlaceholder")}
            style={{
              ...searchInputStyle,
              ...(isSearchBarActive ? searchBarActiveStyle : null),
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitChannelSearch();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelChannelSearch();
              }
            }}
          />
        ) : (
          <button
            ref={channelSearchEntryRef}
            type="button"
            data-tv-focusable={isBrowseMode && focusAnchor === ChannelsFocusAnchor.ChannelSearchEntry ? "true" : undefined}
            style={{
              ...searchBarFieldButtonStyle,
              ...(isSearchBarActive ? searchBarActiveStyle : null),
            }}
            onClick={openChannelSearch}
          >
            {search || t(locale, "channels.searchPlaceholder")}
          </button>
        )}
      </div>

      <div style={entryStackStyle}>
        {renderEntryButton(
          filterEntryRef,
          t(locale, "channels.filterEntry"),
          `${sourceOptions[sourceIndex]?.label ?? t(locale, "channels.allSources")} · ${groupOptions[groupIndex]?.label ?? t(locale, "channels.all")} · ${sortOptions[sortIndex]?.label ?? ""}`,
          isKeyboardContentActive && isBrowseMode && focusAnchor === ChannelsFocusAnchor.FilterEntry,
          openFilters,
        )}
        {renderEntryButton(
          epgEntryRef,
          t(locale, "epg.explorer.title"),
          `${t(locale, "epg.explorer.reminders")}: ${epgReminders.length}`,
          isKeyboardContentActive && isBrowseMode && focusAnchor === ChannelsFocusAnchor.EpgEntry,
          openEpg,
          epgSearch || undefined,
        )}
      </div>

      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}

      {channels.length === 0 && !error ? (
        <div style={emptyStateStyle}>
          {t(locale, "channels.emptyPrefix")}
          <b>{t(locale, "channels.emptySources")}</b>
          {t(locale, "channels.emptySuffix")}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0 }}>
        <ChannelRowsWithGuide
          items={channels}
          locale={locale}
          onPlay={onPlay}
          onToggleFavorite={toggleFavorite}
          onMoveBeforeFirst={() => setFocusAnchor(ChannelsFocusAnchor.EpgEntry)}
          focusedIndex={focusedChannelIndex}
          onFocusedIndexChange={setFocusedChannelIndex}
          keyboardNavigationEnabled
          active={isListActive}
          virtualized
          virtualListHeight={620}
        />
      </div>

      {mode === ChannelsMode.Filters ? (
        <div style={overlayStyle}>
          <div style={{ ...panelStyle, maxWidth: 980 }}>
            <div style={panelHeaderStyle}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{t(locale, "channels.filterEntry")}</div>
            </div>
            <div style={filterColumnsStyle}>
              <FilterColumnSection
                title={t(locale, "channels.sources")}
                items={sourceOptions.map((option) => option.label)}
                selectedIndex={filterSourceIndex}
                active={filterColumn === "source"}
                refs={sourceOptionRefs}
                onSelect={(index) => {
                  setFilterSourceIndex(index);
                  setFilterColumn("source");
                  const option = sourceOptions[index];
                  if (option) {
                    setSelectedSourceId(option.value);
                    setFocusedChannelIndex(0);
                    setMode(ChannelsMode.Browse);
                    setFocusAnchor(ChannelsFocusAnchor.ChannelList);
                  }
                }}
              />
              <FilterColumnSection
                title={t(locale, "channels.groups")}
                items={groupOptions.map((option) => option.label)}
                selectedIndex={filterGroupIndex}
                active={filterColumn === "group"}
                refs={groupOptionRefs}
                onSelect={(index) => {
                  setFilterGroupIndex(index);
                  setFilterColumn("group");
                  const option = groupOptions[index];
                  if (option) {
                    setSelectedGroup(option.value);
                    setFocusedChannelIndex(0);
                    setMode(ChannelsMode.Browse);
                    setFocusAnchor(ChannelsFocusAnchor.ChannelList);
                  }
                }}
              />
              <FilterColumnSection
                title={t(locale, "channels.sort")}
                items={sortOptions.map((option) => option.label)}
                selectedIndex={filterSortIndex}
                active={filterColumn === "sort"}
                refs={sortOptionRefs}
                onSelect={(index) => {
                  setFilterSortIndex(index);
                  setFilterColumn("sort");
                  const option = sortOptions[index];
                  if (option) {
                    setSortBy(option.value);
                    setFocusedChannelIndex(0);
                    setMode(ChannelsMode.Browse);
                    setFocusAnchor(ChannelsFocusAnchor.ChannelList);
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {mode === ChannelsMode.EpgBrowse || mode === ChannelsMode.EpgSearchEditing || mode === ChannelsMode.EpgDetail ? (
        <div style={overlayStyle}>
          <div style={{ ...panelStyle, maxWidth: 1120 }}>
            <div style={panelHeaderStyle}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{t(locale, "epg.explorer.title")}</div>
              <div style={panelHintStyle}>
                {t(locale, "epg.explorer.reminders")}: {epgReminders.length}
              </div>
            </div>
            <div style={epgLayoutStyle}>
              <div style={epgColumnStyle}>
                <button
                  ref={epgSearchTriggerRef}
                  type="button"
                  data-tv-focusable={mode === ChannelsMode.EpgBrowse && epgRegion === "input" ? "true" : undefined}
                  onClick={() => setMode(ChannelsMode.EpgSearchEditing)}
                  style={{
                    ...entryButtonStyle,
                    ...(mode === ChannelsMode.EpgBrowse && epgRegion === "input" ? entryButtonActiveStyle : null),
                  }}
                >
                  <div style={entryValueStyle}>{epgSearch || t(locale, "epg.searchPlaceholder")}</div>
                </button>
                {mode === ChannelsMode.EpgSearchEditing ? (
                  <input
                    ref={epgSearchInputRef}
                    value={epgSearchDraft}
                    onChange={(event) => setEpgSearchDraft(event.target.value)}
                    placeholder={t(locale, "epg.searchPlaceholder")}
                    style={searchInputStyle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitEpgSearch();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEpgSearchDraft(epgSearch);
                        setMode(ChannelsMode.EpgBrowse);
                        setEpgRegion("input");
                      }
                    }}
                  />
                ) : null}
                <div style={chipRowStyle}>
                  {epgStatusOptions.map((option, index) => {
                    const active =
                      mode === ChannelsMode.EpgBrowse &&
                      epgRegion === "status" &&
                      epgStateFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        ref={(node) => {
                          epgStatusRefs.current[index] = node;
                        }}
                        type="button"
                        data-tv-focusable={active ? "true" : undefined}
                        onClick={() => {
                          setEpgStateFilter(option.value);
                          setEpgRegion("results");
                        }}
                        style={{
                          ...filterChipStyle,
                          backgroundColor: epgStateFilter === option.value ? "var(--accent)" : "var(--bg-tertiary)",
                          color: epgStateFilter === option.value ? "#fff" : "var(--text-primary)",
                          ...(active ? { boxShadow: "inset 0 0 0 1px #fff" } : null),
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={epgResultsStyle}>
                {epgLoading ? <div style={panelHintStyle}>{t(locale, "guide.loading")}</div> : null}
                {!epgLoading && epgResults.length === 0 ? <div style={panelHintStyle}>{t(locale, "epg.empty")}</div> : null}
                {epgResults.map((program, index) => {
                  const active =
                    mode === ChannelsMode.EpgBrowse &&
                    epgRegion === "results" &&
                    epgResultIndex === index;
                  const reminded = epgReminders.some((item) => item.programId === program.id);
                  return (
                    <button
                      key={program.id}
                      ref={(node) => {
                        epgResultRefs.current[index] = node;
                      }}
                      type="button"
                      data-tv-focusable={active ? "true" : undefined}
                      onClick={() => {
                        setEpgResultIndex(index);
                        setEpgDrawerItem(program);
                        setMode(ChannelsMode.EpgDetail);
                      }}
                      style={{ ...epgResultCardStyle, ...(active ? entryButtonActiveStyle : null) }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{program.title}</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {program.channelNumber ? `${program.channelNumber} · ` : ""}
                            {program.channelName}
                          </div>
                        </div>
                        <span style={statusTagStyle}>{t(locale, isProgramLive(program) ? "epg.filter.live" : "epg.filter.upcoming")}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {formatTime(program.startAt)} - {formatTime(program.endAt)}
                      </div>
                      <div style={{ fontSize: 12, color: reminded ? "var(--accent)" : "var(--text-secondary)" }}>
                        {reminded ? t(locale, "epg.reminder.cancel") : t(locale, "epg.reminder.set")}
                      </div>
                    </button>
                  );
                })}
              </div>
              {mode === ChannelsMode.EpgDetail && epgDrawerItem ? (
                <div style={epgDetailStyle}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{epgDrawerItem.title}</div>
                    <div style={panelHintStyle}>{epgDrawerItem.channelName}</div>
                  </div>
                  <div style={panelHintStyle}>
                    {formatTime(epgDrawerItem.startAt)} - {formatTime(epgDrawerItem.endAt)}
                  </div>
                  {epgDrawerItem.category ? (
                    <div style={{ fontSize: 12, color: "var(--accent)" }}>{epgDrawerItem.category}</div>
                  ) : null}
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {epgDrawerItem.description || t(locale, "epg.noDescription")}
                  </div>
                  <button
                    ref={epgDetailActionRef}
                    type="button"
                    data-tv-focusable={mode === ChannelsMode.EpgDetail ? "true" : undefined}
                    onClick={() => void toggleReminder(epgDrawerItem)}
                    style={{ ...entryButtonStyle, ...(mode === ChannelsMode.EpgDetail ? entryButtonActiveStyle : null) }}
                  >
                    {epgReminders.some((item) => item.programId === epgDrawerItem.id)
                      ? t(locale, "epg.reminder.cancel")
                      : t(locale, "epg.reminder.set")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterColumnSection({
  title,
  items,
  selectedIndex,
  active,
  refs,
  onSelect,
}: {
  title: string;
  items: string[];
  selectedIndex: number;
  active: boolean;
  refs: MutableRefObject<Array<HTMLButtonElement | null>>;
  onSelect: (index: number) => void;
}) {
  return (
    <div style={filterColumnStyle}>
      <div style={filterColumnTitleStyle}>{title}</div>
      <div style={filterListStyle}>
        {items.map((item, index) => (
          <button
            key={`${title}-${item}-${index}`}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            data-tv-focusable={active && selectedIndex === index ? "true" : undefined}
            onClick={() => onSelect(index)}
            style={{
              ...filterOptionStyle,
              ...(selectedIndex === index ? filterOptionSelectedStyle : null),
              ...(active && selectedIndex === index ? entryButtonActiveStyle : null),
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  position: "relative",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  height: "100%",
};

const entryStackStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const searchBarWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const searchBarHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const searchBarFieldStyle: CSSProperties = {
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  backgroundColor: "transparent",
  color: "var(--text-secondary)",
  fontSize: 14,
};

const searchBarFieldButtonStyle: CSSProperties = {
  ...searchBarFieldStyle,
  width: "100%",
  textAlign: "left",
  outline: "none",
  cursor: "pointer",
};

const searchBarActiveStyle: CSSProperties = {
  boxShadow: "inset 0 0 0 2px var(--accent)",
  color: "var(--text-primary)",
};

const entryButtonStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(15, 23, 42, 0.48)",
  color: "var(--text-primary)",
  textAlign: "left",
  outline: "none",
};

const entryButtonActiveStyle: CSSProperties = {
  boxShadow: "inset 0 0 0 2px var(--accent)",
  backgroundColor: "rgba(30, 41, 59, 0.8)",
};

const entryValueStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--accent)",
  minHeight: 16,
};

const emptyStateStyle: CSSProperties = {
  color: "var(--text-secondary)",
  textAlign: "center",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "rgba(2, 6, 23, 0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const panelStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  borderRadius: 16,
  border: "1px solid var(--border)",
  backgroundColor: "#020817",
  boxShadow: "0 18px 50px rgba(0, 0, 0, 0.38)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const panelHintStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
};

const searchInputStyle: CSSProperties = {
  padding: "12px 14px",
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontSize: 15,
};

const filterColumnsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const filterColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const filterColumnTitleStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
};

const filterListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: 360,
  overflowY: "auto",
};

const filterOptionStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  textAlign: "left",
  outline: "none",
};

const filterOptionSelectedStyle: CSSProperties = {
  backgroundColor: "rgba(37, 99, 235, 0.2)",
};

const epgLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "280px minmax(0, 1fr) minmax(260px, 320px)",
  gap: 16,
  alignItems: "start",
};

const epgColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const filterChipStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  fontSize: 12,
  outline: "none",
};

const epgResultsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: 460,
  overflowY: "auto",
};

const epgResultCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(15, 23, 42, 0.55)",
  color: "var(--text-primary)",
  textAlign: "left",
  outline: "none",
};

const epgDetailStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(15, 23, 42, 0.55)",
};

const statusTagStyle: CSSProperties = {
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  color: "#fff",
  height: "fit-content",
  backgroundColor: "#1e3a8a",
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
