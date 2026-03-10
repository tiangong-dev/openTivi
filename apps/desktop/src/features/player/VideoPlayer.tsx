import { useCallback, useEffect, useRef, useState } from "react";

import { t, type Locale } from "../../lib/i18n";
import { DEFAULT_STANDBY_ENABLED, STANDBY_ENABLED_SETTING_KEY, resolveStandbyEnabled } from "../../lib/settings";
import { tauriInvoke } from "../../lib/tauri";
import { createConfirmPressHandler, mapKeyToTvIntent } from "../../lib/tvInput";
import type { Channel, ChannelEpgSnapshot, EpgProgram, Setting } from "../../types/api";
import {
  buildNeighborWarmPlan,
  getAdjacentChannel,
  getPrevSlot,
  getNextSlot,
  resolveCurrentPlaybackChannelId,
} from "./playerSwitchCore";
import {
  formatNetworkSpeed,
  formatTime,
  getGuidePrograms,
  parseXmltvDate,
} from "./playerUtils";
import { useDualPlaybackEngine } from "./useDualPlaybackEngine";
import {
  bottomBarStyle,
  channelListItemStyle,
  channelListPanelStyle,
  channelProgramNextStyle,
  channelProgramNowStyle,
  containerStyle,
  errorOverlayStyle,
  guideHeaderStyle,
  guideHintStyle,
  guideItemStyle,
  guidePanelStyle,
  networkSpeedStyle,
  osdStyle,
  overlayBtnStyle,
  pauseIndicatorStyle,
  progressBarStyle,
  progressTrackStyle,
  topBarStyle,
  videoStyle,
} from "./playerStyles";

const OVERLAY_HIDE_MS = 4000;
const OSD_DISPLAY_MS = 2000;
const NEIGHBOR_WARM_DELAY_MS = 320;
const STANDBY_SLOT_TTL_MS = 2500; // TTL for standby slots - sync with backend
const PREWARM_TTL_NEIGHBOR_MS = STANDBY_SLOT_TTL_MS; // Send to backend
const PREWARM_TTL_NEIGHBOR_BG_MS = STANDBY_SLOT_TTL_MS;
const PREWARM_TTL_EXPLICIT_MS = 6000;
const PREWARM_TTL_LIST_FOCUS_MS = 1200;

interface Props {
  channel: Channel;
  channels: Channel[];
  locale: Locale;
  onClose: () => void;
  onChannelChange: (channel: Channel) => void;
}

type PrewarmReason = "explicit_switch" | "neighbor" | "list_focus" | "background";
type PrewarmSource = "player" | "channel_list_outer" | "channel_list_inner";

interface PrewarmIntentInput {
  channelId: number;
  streamUrl: string;
  reason: PrewarmReason;
  source: PrewarmSource;
  ttlMs?: number;
}

export function VideoPlayer({ channel, channels, locale, onClose, onChannelChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guideAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelListAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedFallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerFocusZoneRef = useRef<"player" | "nav">("player");
  const showChannelListPanelRef = useRef(false);
  const focusedChannelIndexRef = useRef(0);
  const channelsRef = useRef<Channel[]>(channels);
  const confirmPressRef = useRef<ReturnType<typeof createConfirmPressHandler> | null>(null);
  const channelListItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const preferredDirectionRef = useRef<-1 | 1>(1);

  const [error, setError] = useState<string | null>(null);
  const [proxyPort, setProxyPort] = useState<number | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [osdChannel, setOsdChannel] = useState<Channel | null>(null);
  const [epgPrograms, setEpgPrograms] = useState<EpgProgram[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const [epgError, setEpgError] = useState<string | null>(null);
  const [showGuidePanel, setShowGuidePanel] = useState(true);
  const [showChannelListPanel, setShowChannelListPanel] = useState(false);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState(0);
  const [epgNow, setEpgNow] = useState<EpgProgram | null>(null);
  const [epgNext, setEpgNext] = useState<EpgProgram | null>(null);
  const [epgProgress, setEpgProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [playerFocusZone, setPlayerFocusZone] = useState<"player" | "nav">("player");
  const [networkSpeedBps, setNetworkSpeedBps] = useState<number | null>(null);
  const [channelEpgSnapshots, setChannelEpgSnapshots] = useState<Record<number, ChannelEpgSnapshot>>({});
  const [channelEpgLoading, setChannelEpgLoading] = useState(false);
  const [standbyEnabled, setStandbyEnabled] = useState(DEFAULT_STANDBY_ENABLED);

  const {
    prevVideoRef,
    activeVideoRef,
    nextVideoRef,
    activeSlot,
    activeSlotRef,
    slotChannelIdRef,
    hlsSlotsRef,
    decoderPrewarmAllowedRef,
    loadChannelInSlot,
    activateSlot,
    destroySlot,
    setSlotMuted,
    getVideoBySlot,
    reportPrimaryState,
    appendRuntimeLog,
  } = useDualPlaybackEngine({
    proxyPort,
    locale,
    onError: setError,
    onNetworkSpeed: setNetworkSpeedBps,
  });

  const GUIDE_AUTO_HIDE_MS = 3500;
  const CHANNEL_LIST_AUTO_HIDE_MS = 5000;

  useEffect(() => {
    playerFocusZoneRef.current = playerFocusZone;
  }, [playerFocusZone]);

  useEffect(() => {
    void tauriInvoke<number>("get_proxy_port").then(setProxyPort);
    void tauriInvoke<Setting[]>("get_settings").then((settings) => {
      const standbyEnabledSetting = settings.find((s) => s.key === STANDBY_ENABLED_SETTING_KEY);
      setStandbyEnabled(resolveStandbyEnabled(standbyEnabledSetting?.value ?? DEFAULT_STANDBY_ENABLED));
    });
  }, []);

  const submitPrewarmIntents = useCallback(
    async (intents: PrewarmIntentInput[], decoderSlots = 0): Promise<number[]> => {
      if (intents.length === 0) return [];
      try {
        return await tauriInvoke<number[]>("prewarm_submit_intents", {
          input: { intents, decoderSlots },
        });
      } catch {
        return [];
      }
    },
    [],
  );

  useEffect(() => {
    if (proxyPort === null) return;

    // Active slot is always 1
    if (slotChannelIdRef.current[1] === channel.id) {
      setSlotMuted(1, false);
      return;
    }

    // Check if in prev or next slot
    if (slotChannelIdRef.current[0] === channel.id) {
      console.log(
        `[Standby] User switched to prev channel ${channel.id} (${channel.name})`,
      );
      activateSlot(0);
      return;
    }

    if (slotChannelIdRef.current[2] === channel.id) {
      console.log(
        `[Standby] User switched to next channel ${channel.id} (${channel.name})`,
      );
      activateSlot(2);
      return;
    }

    // Load in active slot
    setError(null);
    loadChannelInSlot(1, channel, false);
    setSlotMuted(1, false);
  }, [
    activateSlot,
    channel.id,
    channel.streamUrl,
    loadChannelInSlot,
    proxyPort,
    setSlotMuted,
  ]);

  useEffect(() => {
    void reportPrimaryState(channel.id, false);
  }, [channel.id, reportPrimaryState]);

  useEffect(() => {
    setEpgLoading(true);
    setEpgError(null);
    setEpgPrograms([]);
    setEpgNow(null);
    setEpgNext(null);
    setEpgProgress(0);

    tauriInvoke<EpgProgram[]>("get_channel_epg", {
      query: { channelId: channel.id },
    })
      .then((programs) => {
        setEpgPrograms(programs);
        const now = Date.now();
        const current = programs.find((p) => {
          const start = parseXmltvDate(p.startAt);
          const end = parseXmltvDate(p.endAt);
          return start !== null && end !== null && start <= now && now <= end;
        });
        if (!current) {
          const nextUpcoming = programs.find((p) => {
            const start = parseXmltvDate(p.startAt);
            return start !== null && start > now;
          });
          if (nextUpcoming) {
            setEpgNext(nextUpcoming);
          }
          return;
        }

        setEpgNow(current);
        const start = parseXmltvDate(current.startAt);
        const end = parseXmltvDate(current.endAt);
        if (start !== null && end !== null && end > start) {
          setEpgProgress(((now - start) / (end - start)) * 100);
        }

        const currentIdx = programs.indexOf(current);
        if (currentIdx >= 0 && currentIdx < programs.length - 1) {
          setEpgNext(programs[currentIdx + 1]);
        }
      })
      .catch(() => {
        setEpgError(t(locale, "player.epgLoadFailed"));
      })
      .finally(() => {
        setEpgLoading(false);
      });
  }, [channel.id, locale]);

  useEffect(() => {
    const idx = channels.findIndex((c) => c.id === channel.id);
    if (idx >= 0) {
      setFocusedChannelIndex(idx);
    }
  }, [channel.id, channels]);

  useEffect(() => {
    showChannelListPanelRef.current = showChannelListPanel;
  }, [showChannelListPanel]);

  useEffect(() => {
    focusedChannelIndexRef.current = focusedChannelIndex;
  }, [focusedChannelIndex]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    if (!showChannelListPanel || channels.length === 0) return;
    const focused = channels[focusedChannelIndex];
    if (!focused) return;
    const prev = channels[(focusedChannelIndex - 1 + channels.length) % channels.length];
    const next = channels[(focusedChannelIndex + 1) % channels.length];
    const intents = new Map<number, PrewarmIntentInput>();
    for (const item of [focused, prev, next]) {
      if (!item) continue;
      intents.set(item.id, {
        channelId: item.id,
        streamUrl: item.streamUrl,
        reason: "list_focus",
        source: "channel_list_inner",
        ttlMs: PREWARM_TTL_LIST_FOCUS_MS,
      });
    }
    void submitPrewarmIntents(Array.from(intents.values()), 0);
  }, [channels, focusedChannelIndex, showChannelListPanel, submitPrewarmIntents]);

  useEffect(() => {
    if (showChannelListPanel) return;
    void tauriInvoke("prewarm_clear_source", { source: "channel_list_inner" }).catch(() => undefined);
  }, [showChannelListPanel]);

  useEffect(() => {
    if (!showChannelListPanel || channels.length === 0) {
      return;
    }
    let cancelled = false;
    const now = Date.now();
    setChannelEpgLoading(true);
    tauriInvoke<ChannelEpgSnapshot[]>("get_channels_epg_snapshots", {
      query: {
        channelIds: channels.map((item) => item.id),
        windowStartTs: now - 15 * 60 * 1000,
        windowEndTs: now + 3 * 60 * 60 * 1000,
      },
    })
      .then((list) => {
        if (cancelled) return;
        const map: Record<number, ChannelEpgSnapshot> = {};
        for (const item of list) {
          map[item.channelId] = item;
        }
        setChannelEpgSnapshots(map);
      })
      .catch(() => {
        if (cancelled) return;
        setChannelEpgSnapshots({});
      })
      .finally(() => {
        if (!cancelled) {
          setChannelEpgLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channels, showChannelListPanel]);

  useEffect(() => {
    if (!showChannelListPanel) {
      return;
    }
    const target = channelListItemRefs.current[focusedChannelIndex];
    target?.scrollIntoView({ block: "nearest" });
  }, [focusedChannelIndex, showChannelListPanel]);

  useEffect(() => {
    if (!epgNow) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const start = parseXmltvDate(epgNow.startAt);
      const end = parseXmltvDate(epgNow.endAt);
      if (start === null || end === null || now > end) {
        setEpgNow(null);
        setEpgNext(null);
        setEpgProgress(0);
      } else if (end > start) {
        setEpgProgress(((now - start) / (end - start)) * 100);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [epgNow]);

  useEffect(() => {
    const readDecodedBytes = () => {
      const video = getVideoBySlot(activeSlotRef.current) as (HTMLVideoElement & {
        webkitVideoDecodedByteCount?: number;
        webkitAudioDecodedByteCount?: number;
      }) | null;
      if (!video) return null;
      const videoBytes = Number(video.webkitVideoDecodedByteCount ?? 0);
      const audioBytes = Number(video.webkitAudioDecodedByteCount ?? 0);
      const total = videoBytes + audioBytes;
      return Number.isFinite(total) && total > 0 ? total : null;
    };

    let lastBytes = readDecodedBytes();
    let lastTs = Date.now();
    speedFallbackTimerRef.current = setInterval(() => {
      const activeHls = hlsSlotsRef.current[activeSlotRef.current];
      const hlsEstimate = Number(
        (activeHls as unknown as { bandwidthEstimate?: number } | null)?.bandwidthEstimate ?? 0,
      );
      if (Number.isFinite(hlsEstimate) && hlsEstimate > 0) {
        setNetworkSpeedBps((prev) => (prev === null ? hlsEstimate : prev * 0.4 + hlsEstimate * 0.6));
        return;
      }

      const currentBytes = readDecodedBytes();
      const nowTs = Date.now();
      if (currentBytes === null || lastBytes === null) {
        lastBytes = currentBytes;
        lastTs = nowTs;
        return;
      }
      const deltaBytes = currentBytes - lastBytes;
      const deltaMs = nowTs - lastTs;
      lastBytes = currentBytes;
      lastTs = nowTs;
      if (deltaBytes <= 0 || deltaMs <= 0) {
        return;
      }
      const bitsPerSecond = (deltaBytes * 8 * 1000) / deltaMs;
      setNetworkSpeedBps((prev) => (prev === null ? bitsPerSecond : prev * 0.4 + bitsPerSecond * 0.6));
    }, 1000);

    return () => {
      if (speedFallbackTimerRef.current) {
        clearInterval(speedFallbackTimerRef.current);
        speedFallbackTimerRef.current = null;
      }
    };
  }, [channel.id, getVideoBySlot]);

  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!error) {
        setOverlayVisible(false);
      }
    }, OVERLAY_HIDE_MS);
  }, [channel.id, error]);

  useEffect(() => {
    showOverlay();
    setShowGuidePanel(true);
    if (guideAutoHideTimerRef.current) {
      clearTimeout(guideAutoHideTimerRef.current);
    }
    guideAutoHideTimerRef.current = setTimeout(() => {
      setShowGuidePanel(false);
    }, GUIDE_AUTO_HIDE_MS);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (guideAutoHideTimerRef.current) clearTimeout(guideAutoHideTimerRef.current);
    };
  }, [GUIDE_AUTO_HIDE_MS, channel.id, showOverlay]);

  useEffect(() => {
    if (error) setOverlayVisible(true);
  }, [error]);

  const getCurrentPlaybackChannelId = useCallback(() => {
    return resolveCurrentPlaybackChannelId(slotChannelIdRef.current, activeSlotRef.current, channel.id);
  }, [channel.id]);

  const showSwitchOsd = useCallback((next: Channel) => {
    setOsdChannel(next);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => setOsdChannel(null), OSD_DISPLAY_MS);
  }, []);

  const prewarmChannel = useCallback(
    (next: Channel, direction: -1 | 1) => {
      const currentPlaybackChannelId = getCurrentPlaybackChannelId();
      if (next.id === currentPlaybackChannelId) return;
      appendRuntimeLog("neighbor_prewarm_requested", {
        currentPlaybackChannelId,
        nextChannelId: next.id,
        direction,
      });
      void submitPrewarmIntents(
        [
          {
            channelId: next.id,
            streamUrl: next.streamUrl,
            reason: "neighbor",
            source: "player",
            ttlMs: PREWARM_TTL_NEIGHBOR_MS,
          },
        ],
        1,
      );
      if (!decoderPrewarmAllowedRef.current) {
        console.log("[Standby] Prewarm not allowed");
        return;
      }
      if (proxyPort === null) {
        console.log("[Standby] Proxy port not available");
        return;
      }
      if (!standbyEnabled) {
        console.log("[Standby] Standby disabled in settings");
        return;
      }
      const slot = direction === 1 ? getNextSlot() : getPrevSlot();
      const currentSlotChannelId = slotChannelIdRef.current[slot];
      if (currentSlotChannelId !== next.id) {
        console.log(
          `[Standby] Loading channel ${next.id} (${next.name}) into slot ${slot}(${direction === 1 ? "next" : "prev"}), previous: ${currentSlotChannelId}`,
        );
        loadChannelInSlot(slot, next, true);
      } else {
        console.log(
          `[Standby] Channel ${next.id} already in slot ${slot}, skip loading`,
        );
      }
      setSlotMuted(slot, true);
    },
    [appendRuntimeLog, getCurrentPlaybackChannelId, loadChannelInSlot, proxyPort, setSlotMuted, standbyEnabled, submitPrewarmIntents],
  );

  const resetInactivityTimer = useCallback(() => {
    if (inactivityCleanupTimerRef.current) {
      clearTimeout(inactivityCleanupTimerRef.current);
    }
    inactivityCleanupTimerRef.current = setTimeout(() => {
      console.log("[Standby] Standby TTL expired - cleaning up standby slots");
      destroySlot(0);
      destroySlot(2);
    }, STANDBY_SLOT_TTL_MS);
  }, [destroySlot]);

  useEffect(() => {
    if (proxyPort === null || channels.length < 2) return;
    const timer = setTimeout(() => {
      const preferred = preferredDirectionRef.current;
      const baseChannelId = getCurrentPlaybackChannelId();
      
      // Preload next channel
      const next = getAdjacentChannel(channels, baseChannelId, 1);
      if (next) {
        console.log(
          `[Standby] Preload next channel - base: ${baseChannelId}, next: ${next.id} (${next.name})`,
        );
        prewarmChannel(next, 1);
      }

      // Preload prev channel
      const prev = getAdjacentChannel(channels, baseChannelId, -1);
      if (prev) {
        console.log(
          `[Standby] Preload prev channel - base: ${baseChannelId}, prev: ${prev.id} (${prev.name})`,
        );
        prewarmChannel(prev, -1);
      }

      // Reset inactivity timer
      resetInactivityTimer();
    }, NEIGHBOR_WARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    channel.id,
    channels.length,
    channels,
    getCurrentPlaybackChannelId,
    prewarmChannel,
    proxyPort,
    resetInactivityTimer,
  ]);

  const switchChannel = useCallback(
    (direction: -1 | 1) => {
      preferredDirectionRef.current = direction;
      const baseChannelId = getCurrentPlaybackChannelId();
      const next = getAdjacentChannel(channels, baseChannelId, direction);
      if (!next || next.id === baseChannelId) return;
      appendRuntimeLog("switch_requested", {
        direction,
        baseChannelId,
        nextChannelId: next.id,
      });
      console.log(
        `[Standby] User switch - from ${baseChannelId} to ${next.id} (${next.name}), direction: ${direction}`,
      );
      void submitPrewarmIntents(
        [
          {
            channelId: next.id,
            streamUrl: next.streamUrl,
            reason: "explicit_switch",
            source: "player",
            ttlMs: PREWARM_TTL_EXPLICIT_MS,
          },
        ],
        1,
      );
      showSwitchOsd(next);
      const targetSlot = direction === 1 ? getNextSlot() : getPrevSlot();
      if (slotChannelIdRef.current[targetSlot] !== next.id) {
        console.log(
          `[Standby] Loading channel ${next.id} (${next.name}) in slot ${targetSlot} for immediate switch`,
        );
        loadChannelInSlot(targetSlot, next, false);
      } else {
        console.log(
          `[Standby] Channel ${next.id} already in slot ${targetSlot}, activate directly`,
        );
      }
      setError(null);
      activateSlot(targetSlot);
      appendRuntimeLog("switch_activated", {
        slot: targetSlot,
        nextChannelId: next.id,
      });
      onChannelChange(next);
    },
    [
      activateSlot,
      appendRuntimeLog,
      channels,
      getCurrentPlaybackChannelId,
      loadChannelInSlot,
      onChannelChange,
      showSwitchOsd,
      submitPrewarmIntents,
    ],
  );

  const setChannelListPanel = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setShowChannelListPanel((prev) => {
      const resolved = typeof next === "function" ? (next as (value: boolean) => boolean)(prev) : next;
      showChannelListPanelRef.current = resolved;
      if (!resolved && channelListAutoHideTimerRef.current) {
        clearTimeout(channelListAutoHideTimerRef.current);
        channelListAutoHideTimerRef.current = null;
      }
      return resolved;
    });
  }, []);

  const startChannelListAutoHide = useCallback(() => {
    if (channelListAutoHideTimerRef.current) {
      clearTimeout(channelListAutoHideTimerRef.current);
    }
    channelListAutoHideTimerRef.current = setTimeout(() => {
      setChannelListPanel(false);
      channelListAutoHideTimerRef.current = null;
    }, CHANNEL_LIST_AUTO_HIDE_MS);
  }, [CHANNEL_LIST_AUTO_HIDE_MS, setChannelListPanel]);

  const touchChannelListAutoHide = useCallback(() => {
    if (!channelListAutoHideTimerRef.current) {
      return;
    }
    startChannelListAutoHide();
  }, [startChannelListAutoHide]);

  const setFocusedIndex = useCallback((next: number | ((prev: number) => number)) => {
    setFocusedChannelIndex((prev) => {
      const resolved = typeof next === "function" ? (next as (value: number) => number)(prev) : next;
      focusedChannelIndexRef.current = resolved;
      return resolved;
    });
  }, []);

  const getNavButtons = useCallback((): HTMLButtonElement[] => {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-tv-nav-button="true"]'));
  }, []);

  const focusActiveNavButton = useCallback(() => {
    const active = document.querySelector<HTMLButtonElement>('button[data-tv-nav-button="true"][data-tv-nav-active="true"]');
    if (active) {
      active.focus();
      return;
    }
    const buttons = getNavButtons();
    buttons[0]?.focus();
  }, [getNavButtons]);

  const focusChannelListItem = useCallback((index: number) => {
    const itemNode = channelListItemRefs.current[index];
    itemNode?.focus();
    itemNode?.scrollIntoView({ block: "nearest" });
  }, []);

  const togglePlayPause = useCallback(() => {
    const activeVideo = getVideoBySlot(activeSlotRef.current);
    if (!activeVideo) return;
    if (activeVideo.paused) {
      activeVideo.play().catch(() => {});
      setIsPaused(false);
      return;
    }
    activeVideo.pause();
    setIsPaused(true);
  }, [getVideoBySlot]);

  useEffect(() => {
    confirmPressRef.current = createConfirmPressHandler({
      onSingle: () => {
        const inChannelPanel = showChannelListPanelRef.current;
        if (inChannelPanel) {
          const candidate = channelsRef.current[focusedChannelIndexRef.current];
          if (candidate) {
            onChannelChange(candidate);
          }
          setChannelListPanel(false);
          showOverlay();
          return;
        }
        setChannelListPanel(true);
        startChannelListAutoHide();
        showOverlay();
      },
      onDouble: () => {
        setShowGuidePanel((v) => !v);
        showOverlay();
      },
      onLong: () => {
        togglePlayPause();
        showOverlay();
      },
    });
    return () => {
      confirmPressRef.current?.clear();
      confirmPressRef.current = null;
    };
  }, [onChannelChange, setChannelListPanel, showOverlay, startChannelListAutoHide, togglePlayPause]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const intent = mapKeyToTvIntent(e.key);
      const inNavZone = playerFocusZoneRef.current === "nav";
      if (showChannelListPanelRef.current) {
        touchChannelListAutoHide();
      }
      if (inNavZone) {
        if (intent === "MoveUp" || intent === "MoveDown") {
          e.preventDefault();
          const buttons = getNavButtons();
          if (buttons.length === 0) return;
          const currentIndex = Math.max(0, buttons.findIndex((item) => item === document.activeElement));
          const offset = intent === "MoveDown" ? 1 : -1;
          const nextIndex = (currentIndex + offset + buttons.length) % buttons.length;
          buttons[nextIndex]?.focus();
          showOverlay();
          return;
        }
        if (intent === "MoveRight") {
          e.preventDefault();
          setPlayerFocusZone("player");
          if (showChannelListPanelRef.current) {
            focusChannelListItem(focusedChannelIndexRef.current);
          }
          showOverlay();
          return;
        }
        if (intent === "Confirm") {
          return;
        }
      }
      if (intent === "Back") {
        e.preventDefault();
        if (showChannelListPanelRef.current) {
          setChannelListPanel(false);
        } else {
          onClose();
        }
        showOverlay();
        return;
      }
      if (intent === "MoveLeft") {
        e.preventDefault();
        setPlayerFocusZone("nav");
        focusActiveNavButton();
        showOverlay();
        return;
      }
      if (intent === "MoveRight") {
        e.preventDefault();
        setShowGuidePanel((v) => !v);
        showOverlay();
        return;
      }
      if (intent === "MoveUp") {
        e.preventDefault();
        if (showChannelListPanelRef.current) {
          const size = channelsRef.current.length;
          setFocusedIndex((prev) => {
            if (size === 0) return 0;
            return (prev - 1 + size) % size;
          });
        } else {
          switchChannel(-1);
        }
        showOverlay();
        return;
      }
      if (intent === "MoveDown") {
        e.preventDefault();
        if (showChannelListPanelRef.current) {
          const size = channelsRef.current.length;
          setFocusedIndex((prev) => {
            if (size === 0) return 0;
            return (prev + 1) % size;
          });
        } else {
          switchChannel(1);
        }
        showOverlay();
        return;
      }
      if (intent === "Confirm") {
        e.preventDefault();
        confirmPressRef.current?.onKeyDown(e.repeat);
        return;
      }
      if (intent === "SecondaryAction") {
        e.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void containerRef.current?.requestFullscreen();
        }
        showOverlay();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const intent = mapKeyToTvIntent(e.key);
      if (playerFocusZoneRef.current === "nav") return;
      if (intent === "Confirm") {
        e.preventDefault();
        confirmPressRef.current?.onKeyUp();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    focusActiveNavButton,
    focusChannelListItem,
    getNavButtons,
    onClose,
    setChannelListPanel,
    setFocusedIndex,
    showOverlay,
    switchChannel,
    touchChannelListAutoHide,
  ]);

  useEffect(() => {
    return () => {
      if (channelListAutoHideTimerRef.current) {
        clearTimeout(channelListAutoHideTimerRef.current);
        channelListAutoHideTimerRef.current = null;
      }
      void tauriInvoke("prewarm_clear_source", { source: "channel_list_inner" }).catch(
        () => undefined,
      );
      void tauriInvoke("prewarm_clear_source", { source: "player" }).catch(() => undefined);
      void reportPrimaryState(null, false);
      destroySlot(0);
      destroySlot(1);
      destroySlot(2);
    };
  }, [destroySlot, reportPrimaryState]);

  return (
    <div ref={containerRef} style={containerStyle} onMouseMove={showOverlay} onClick={showOverlay}>
      <video
        ref={prevVideoRef}
        style={{
          ...videoStyle,
          opacity: activeSlot === 1 ? 1 : 0,
          zIndex: activeSlot === 1 ? 1 : 0,
          pointerEvents: "none",
        }}
        autoPlay
        muted
      />
      <video
        ref={activeVideoRef}
        style={{
          ...videoStyle,
          opacity: activeSlot === 1 ? 1 : 0,
          zIndex: activeSlot === 1 ? 1 : 0,
          pointerEvents: "none",
        }}
        autoPlay
        muted={false}
      />
      <video
        ref={nextVideoRef}
        style={{
          ...videoStyle,
          opacity: activeSlot === 1 ? 1 : 0,
          zIndex: activeSlot === 1 ? 1 : 0,
          pointerEvents: "none",
        }}
        autoPlay
        muted={activeSlot !== 1}
      />

      <div
        style={{
          ...topBarStyle,
          opacity: overlayVisible ? 1 : 0,
          pointerEvents: overlayVisible ? "auto" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {channel.logoUrl && (
            <img
              src={channel.logoUrl}
              alt=""
              style={{ width: 32, height: 32, borderRadius: 4, objectFit: "contain" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {channel.channelNumber && (
                <span style={{ opacity: 0.7, marginRight: 8 }}>{channel.channelNumber}</span>
              )}
              {channel.name}
            </div>
            {channel.groupName && <div style={{ fontSize: 12, opacity: 0.6 }}>{channel.groupName}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setChannelListPanel((v) => !v)}
            style={overlayBtnStyle}
            title={t(locale, "player.channelListShortcut")}
          >
            ☰
          </button>
          <button
            onClick={() => setShowGuidePanel((v) => !v)}
            style={overlayBtnStyle}
            title={t(locale, "player.toggleGuideShortcut")}
          >
            ≡
          </button>
          <button onClick={() => switchChannel(-1)} style={overlayBtnStyle} title={t(locale, "player.previousChannelShortcut")}>
            ▲
          </button>
          <button onClick={() => switchChannel(1)} style={overlayBtnStyle} title={t(locale, "player.nextChannelShortcut")}>
            ▼
          </button>
          <button onClick={onClose} style={overlayBtnStyle} title={t(locale, "player.closeShortcut")}>
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          ...bottomBarStyle,
          opacity: 1,
          pointerEvents: "none",
        }}
      >
        {epgNow && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{t(locale, "player.now")}</span>
              <span style={{ fontWeight: 600 }}>{epgNow.title}</span>
              <span style={{ opacity: 0.5, fontSize: 12 }}>
                {formatTime(epgNow.startAt)} - {formatTime(epgNow.endAt)}
              </span>
            </div>
            <div style={progressTrackStyle}>
              <div style={{ ...progressBarStyle, width: `${Math.max(0, Math.min(100, epgProgress))}%` }} />
            </div>
          </>
        )}
        {!epgNow && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {epgLoading ? t(locale, "player.loadingEpg") : t(locale, "player.noGuideForChannel")}
          </div>
        )}
        <div style={networkSpeedStyle}>
          {t(locale, "player.networkSpeed")}:{" "}
          {networkSpeedBps !== null ? formatNetworkSpeed(networkSpeedBps) : t(locale, "player.networkSpeedUnavailable")}
        </div>
        {epgNow && epgNext && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 13,
              opacity: 0.7,
              marginTop: 4,
            }}
          >
            <span style={{ opacity: 0.6, fontSize: 12 }}>{t(locale, "player.next")}</span>
            <span>{epgNext.title}</span>
            <span style={{ opacity: 0.5, fontSize: 12 }}>{formatTime(epgNext.startAt)}</span>
          </div>
        )}
      </div>

      {showGuidePanel && (
        <div style={guidePanelStyle}>
          <div style={guideHeaderStyle}>
            <span>{t(locale, "player.programGuide")}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>
              {t(locale, "player.rightKeyToHide")}
            </span>
          </div>
          {epgLoading && (
            <div style={guideHintStyle}>{t(locale, "player.loadingEpg")}</div>
          )}
          {!epgLoading && epgError && <div style={guideHintStyle}>{epgError}</div>}
          {!epgLoading && !epgError && epgPrograms.length === 0 && (
            <div style={guideHintStyle}>
              {t(locale, "player.noGuideForChannel")}
            </div>
          )}
          {!epgLoading && !epgError && epgPrograms.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
              {getGuidePrograms(epgPrograms).map((program) => {
                const isCurrent = epgNow?.id === program.id;
                return (
                  <div
                    key={program.id}
                    style={{
                      ...guideItemStyle,
                      borderColor: isCurrent ? "var(--accent)" : "var(--border)",
                      backgroundColor: isCurrent ? "#2563eb22" : "transparent",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {formatTime(program.startAt)} - {formatTime(program.endAt)}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: isCurrent ? 600 : 400 }}>{program.title}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showChannelListPanel && (
        <div style={channelListPanelStyle}>
          <div style={guideHeaderStyle}>
            <span>{t(locale, "player.channelsPanelTitle")}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>
              {t(locale, "player.enterToPlay")}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
            {channels.map((item, idx) => {
              const isCurrent = item.id === channel.id;
              const isFocused = idx === focusedChannelIndex;
              const snapshot = channelEpgSnapshots[item.id];
              const nowProgram = snapshot?.now;
              const nextProgram = snapshot?.next;
              const nowLine = nowProgram
                ? nowProgram.title
                : channelEpgLoading
                  ? t(locale, "player.loadingEpg")
                  : t(locale, "player.noGuideForChannel");
              const nextLine = nextProgram
                ? `${formatTime(nextProgram.startAt)} ${nextProgram.title}`
                : "—";
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    channelListItemRefs.current[idx] = node;
                  }}
                  onClick={() => {
                    setFocusedIndex(idx);
                    onChannelChange(item);
                    setChannelListPanel(false);
                  }}
                  style={{
                    ...channelListItemStyle,
                    borderColor: isFocused ? "var(--accent)" : "var(--border)",
                    backgroundColor: isCurrent ? "#2563eb33" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <span style={{ opacity: 0.8, marginRight: 8, minWidth: 36, textAlign: "right", flexShrink: 0 }}>
                    {item.channelNumber ?? idx + 1}
                  </span>
                  {item.logoUrl && (
                    <img
                      src={item.logoUrl}
                      alt=""
                      style={{ width: 24, height: 24, borderRadius: 4, objectFit: "contain", marginRight: 8, flexShrink: 0 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, textAlign: "left", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.name}
                    </span>
                    <span style={channelProgramNowStyle}>
                      {t(locale, "player.now")}: {nowLine}
                    </span>
                    <span style={channelProgramNextStyle}>
                      {t(locale, "player.next")}: {nextLine}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div style={errorOverlayStyle}>
          <div style={{ fontSize: 14, color: "#ef4444" }}>{error}</div>
        </div>
      )}

      {isPaused && <div style={pauseIndicatorStyle}>⏸</div>}

      {osdChannel && (
        <div style={osdStyle}>
          {osdChannel.channelNumber && (
            <div style={{ fontSize: 48, fontWeight: 700, opacity: 0.9 }}>{osdChannel.channelNumber}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            {osdChannel.logoUrl && (
              <img
                src={osdChannel.logoUrl}
                alt=""
                style={{ width: 36, height: 36, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div style={{ fontSize: 24, fontWeight: 600 }}>{osdChannel.name}</div>
          </div>
        </div>
      )}
    </div>
  );
}

