import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { t, type Locale } from "../../lib/i18n";
import { buildSnapshotRequestChannelIds } from "../../lib/epgSnapshots";
import {
  DEFAULT_INSTANT_SWITCH_ENABLED,
  DEFAULT_PREFER_NATIVE_HLS,
  DEFAULT_PLAYER_VOLUME,
  INSTANT_SWITCH_ENABLED_SETTING_KEY,
  PREFER_NATIVE_HLS_SETTING_KEY,
  PLAYER_VOLUME_SETTING_KEY,
  resolveInstantSwitchEnabled,
  resolvePreferNativeHls,
  resolvePlayerVolume,
} from "../../lib/settings";
import { tauriInvoke } from "../../lib/tauri";
import { ConfirmGesture, createConfirmPressHandler, mapKeyToTvIntent, TvIntent } from "../../lib/tvInput";
import type { Channel, ChannelEpgSnapshot, EpgProgram, PlaybackSource, Setting } from "../../types/api";
import {
  getAdjacentChannel,
  getPrevSlot,
  getNextSlot,
  resolveCurrentPlaybackChannelId,
} from "./playerSwitchCore";
import {
  formatNetworkSpeed,
  formatTime,
  getGuidePrograms,
  getPlaybackKind,
  parseXmltvDate,
} from "./playerUtils";
import { useInstantChannelSwitch } from "./useInstantChannelSwitch";
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
const INSTANT_SWITCH_SLOT_TTL_MS = 60000; // 1min - keep instant switch slots ready
const CHANNEL_LIST_SNAPSHOT_WINDOW_SIZE = 20;

interface Props {
  channel: Channel;
  channels: Channel[];
  locale: Locale;
  onClose: () => void;
  onChannelChange: (channel: Channel) => void;
}

interface DecoderDiagnosticsState {
  engineLabel: string;
  decoderLabel: string;
  resolutionLabel: string;
  framesLabel: string;
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
  const loadedStreamUrlRef = useRef<string | null>(null);

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
  const [instantSwitchEnabled, setInstantSwitchEnabled] = useState(DEFAULT_INSTANT_SWITCH_ENABLED);
  const [preferNativeHls, setPreferNativeHls] = useState(DEFAULT_PREFER_NATIVE_HLS);
  const [volume, setVolume] = useState(DEFAULT_PLAYER_VOLUME);
  const [playbackCandidates, setPlaybackCandidates] = useState<PlaybackSource[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [runtimeLogs, setRuntimeLogs] = useState<string[]>([]);
  const [decoderDiagnostics, setDecoderDiagnostics] = useState<DecoderDiagnosticsState>({
    engineLabel: "--",
    decoderLabel: "--",
    resolutionLabel: "--",
    framesLabel: "--",
  });
  const volumeSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const candidateIndexRef = useRef(0);
  const playbackCandidatesRef = useRef<PlaybackSource[]>([]);
  const currentPlaybackSource = useMemo<PlaybackSource>(
    () =>
      playbackCandidates[candidateIndex] ?? {
        channelId: channel.id,
        resolvedChannelId: channel.id,
        sourceId: channel.sourceId,
        channelName: channel.name,
        streamUrl: channel.streamUrl,
        logoUrl: channel.logoUrl,
      },
    [candidateIndex, channel, playbackCandidates],
  );
  const visibleGuidePrograms = useMemo(() => getGuidePrograms(epgPrograms), [epgPrograms]);
  const bottomBarNetworkSpeed = useMemo(() => {
    if (networkSpeedBps === null) {
      return t(locale, "player.networkSpeedUnavailable");
    }
    if (networkSpeedBps >= 1_000_000) {
      return `${(networkSpeedBps / 1_000_000).toFixed(1)}M`;
    }
    return `${Math.round(networkSpeedBps / 1_000)}K`;
  }, [locale, networkSpeedBps]);
  const requestedChannelListSnapshotIds = useMemo(
    () =>
      buildSnapshotRequestChannelIds(
        channels,
        focusedChannelIndex,
        CHANNEL_LIST_SNAPSHOT_WINDOW_SIZE,
      ),
    [channels, focusedChannelIndex],
  );

  const {
    prevVideoRef,
    activeVideoRef,
    nextVideoRef,
    activeSlot,
    activeSlotRef,
    slotChannelIdRef,
    hlsSlotsRef,
    loadChannelInSlot,
    activateSlot,
    destroySlot,
    setSlotMuted,
    getVideoBySlot,
    getSlotPlaybackDebugInfo,
    appendRuntimeLog,
  } = useInstantChannelSwitch({
    proxyPort,
    locale,
    preferNativeHls,
    onError: (message) => {
      if (!message) {
        setError(null);
        return;
      }
      const nextRetryCount = retryCountRef.current + 1;
      const hasAlternate = candidateIndexRef.current + 1 < playbackCandidatesRef.current.length;
      setError(message);
      if (nextRetryCount <= 1) {
        retryCountRef.current = nextRetryCount;
        setRetryCount(nextRetryCount);
        window.setTimeout(() => {
          loadChannelInSlot(activeSlotRef.current, channel, false, currentPlaybackSource.streamUrl);
          setSlotMuted(activeSlotRef.current, false);
        }, 600);
        return;
      }
      if (hasAlternate) {
        retryCountRef.current = 0;
        setRetryCount(0);
        setCandidateIndex((prev) => prev + 1);
      }
    },
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
      const instantSwitchEnabledSetting = settings.find((s) => s.key === INSTANT_SWITCH_ENABLED_SETTING_KEY);
      const preferNativeHlsSetting = settings.find((s) => s.key === PREFER_NATIVE_HLS_SETTING_KEY);
      const volumeSetting = settings.find((s) => s.key === PLAYER_VOLUME_SETTING_KEY);
      setInstantSwitchEnabled(resolveInstantSwitchEnabled(instantSwitchEnabledSetting?.value ?? DEFAULT_INSTANT_SWITCH_ENABLED));
      setPreferNativeHls(resolvePreferNativeHls(preferNativeHlsSetting?.value ?? DEFAULT_PREFER_NATIVE_HLS));
      setVolume(resolvePlayerVolume(volumeSetting?.value ?? DEFAULT_PLAYER_VOLUME));
    });
  }, []);

  useEffect(() => {
    playbackCandidatesRef.current = playbackCandidates;
  }, [playbackCandidates]);

  useEffect(() => {
    candidateIndexRef.current = candidateIndex;
  }, [candidateIndex]);

  useEffect(() => {
    retryCountRef.current = retryCount;
  }, [retryCount]);

  useEffect(() => {
    setCandidateIndex(0);
    setRetryCount(0);
    retryCountRef.current = 0;
    void tauriInvoke<PlaybackSource[]>("list_playback_candidates", { channelId: channel.id })
      .then((list) => setPlaybackCandidates(list))
      .catch(() => setPlaybackCandidates([]));
  }, [channel.id]);

  useEffect(() => {
    const videos = [prevVideoRef.current, activeVideoRef.current, nextVideoRef.current];
    for (const video of videos) {
      if (video) {
        video.volume = volume;
      }
    }
    if (volumeSaveTimerRef.current) {
      clearTimeout(volumeSaveTimerRef.current);
    }
    volumeSaveTimerRef.current = window.setTimeout(() => {
      void tauriInvoke("set_setting", {
        input: { key: PLAYER_VOLUME_SETTING_KEY, value: volume },
      }).catch(() => undefined);
    }, 250);
    return () => {
      if (volumeSaveTimerRef.current) {
        clearTimeout(volumeSaveTimerRef.current);
      }
    };
  }, [volume]);



  useEffect(() => {
    if (proxyPort === null) return;

    const currentActiveSlot = activeSlotRef.current;

    if (
      slotChannelIdRef.current[currentActiveSlot] === channel.id &&
      loadedStreamUrlRef.current === currentPlaybackSource.streamUrl
    ) {
      setSlotMuted(currentActiveSlot, false);
      return;
    }

    // Check if in prev or next slot
    if (slotChannelIdRef.current[0] === channel.id) {
      console.log(
        `[InstantSwitch] User switched to prev channel ${channel.id} (${channel.name})`,
      );
      activateSlot(0);
      return;
    }

    if (slotChannelIdRef.current[2] === channel.id) {
      console.log(
        `[InstantSwitch] User switched to next channel ${channel.id} (${channel.name})`,
      );
      activateSlot(2);
      return;
    }

    // Load in current active slot
    setError(null);
    loadChannelInSlot(currentActiveSlot, channel, false, currentPlaybackSource.streamUrl);
    loadedStreamUrlRef.current = currentPlaybackSource.streamUrl;
    setSlotMuted(currentActiveSlot, false);
  }, [
    activateSlot,
    channel.id,
    currentPlaybackSource.streamUrl,
    loadChannelInSlot,
    proxyPort,
    setSlotMuted,
  ]);



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
    if (!showChannelListPanel || requestedChannelListSnapshotIds.length === 0) {
      return;
    }
    let cancelled = false;
    const now = Date.now();
    setChannelEpgLoading(true);
    tauriInvoke<ChannelEpgSnapshot[]>("get_channels_epg_snapshots", {
      query: {
        channelIds: requestedChannelListSnapshotIds,
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
  }, [requestedChannelListSnapshotIds, showChannelListPanel]);

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

  useEffect(() => {
    if (!showDiagnostics) return;

    const readDiagnostics = () => {
      const video = getVideoBySlot(activeSlotRef.current) as (HTMLVideoElement & {
        webkitDecodedFrameCount?: number;
        webkitDroppedFrameCount?: number;
      }) | null;
      const playbackInfo = getSlotPlaybackDebugInfo(activeSlotRef.current);
      if (!video) {
        setDecoderDiagnostics({
          engineLabel: playbackInfo.engineLabel,
          decoderLabel: playbackInfo.decoderLabel,
          resolutionLabel: "--",
          framesLabel: "--",
        });
        return;
      }

      let framesLabel = "--";
      if (typeof video.getVideoPlaybackQuality === "function") {
        const quality = video.getVideoPlaybackQuality();
        const totalFrames = Number(quality.totalVideoFrames ?? 0);
        const droppedFrames = Number(quality.droppedVideoFrames ?? 0);
        if (totalFrames > 0 || droppedFrames > 0) {
          framesLabel = `${totalFrames} decoded / ${droppedFrames} dropped`;
        }
      } else {
        const decodedFrames = Number(video.webkitDecodedFrameCount ?? 0);
        const droppedFrames = Number(video.webkitDroppedFrameCount ?? 0);
        if (decodedFrames > 0 || droppedFrames > 0) {
          framesLabel = `${decodedFrames} decoded / ${droppedFrames} dropped`;
        }
      }

      const resolutionLabel =
        video.videoWidth > 0 && video.videoHeight > 0
          ? `${video.videoWidth}x${video.videoHeight}`
          : "--";

      setDecoderDiagnostics({
        engineLabel: playbackInfo.engineLabel,
        decoderLabel: playbackInfo.decoderLabel,
        resolutionLabel,
        framesLabel,
      });
    };

    readDiagnostics();
    const timer = window.setInterval(readDiagnostics, 1000);
    return () => window.clearInterval(timer);
  }, [activeSlotRef, channel.id, getSlotPlaybackDebugInfo, getVideoBySlot, showDiagnostics]);

  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!error) {
        setOverlayVisible(false);
      }
    }, OVERLAY_HIDE_MS);
  }, [channel.id, error]);

  const startGuideAutoHide = useCallback(() => {
    if (guideAutoHideTimerRef.current) {
      clearTimeout(guideAutoHideTimerRef.current);
    }
    guideAutoHideTimerRef.current = setTimeout(() => {
      setShowGuidePanel(false);
      guideAutoHideTimerRef.current = null;
    }, GUIDE_AUTO_HIDE_MS);
  }, [GUIDE_AUTO_HIDE_MS]);

  const setGuidePanelVisible = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setShowGuidePanel((prev) => {
      const resolved = typeof next === "function" ? (next as (value: boolean) => boolean)(prev) : next;
      if (resolved) {
        startGuideAutoHide();
      } else if (guideAutoHideTimerRef.current) {
        clearTimeout(guideAutoHideTimerRef.current);
        guideAutoHideTimerRef.current = null;
      }
      return resolved;
    });
  }, [startGuideAutoHide]);

  useEffect(() => {
    showOverlay();
    setGuidePanelVisible(true);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (guideAutoHideTimerRef.current) clearTimeout(guideAutoHideTimerRef.current);
    };
  }, [channel.id, setGuidePanelVisible, showOverlay]);

  useEffect(() => {
    if (error) setOverlayVisible(true);
  }, [error]);

  useEffect(() => {
    if (!showDiagnostics && !error) return;
    void tauriInvoke<string[]>("get_runtime_logs", { limit: 12 })
      .then(setRuntimeLogs)
      .catch(() => setRuntimeLogs([]));
  }, [error, showDiagnostics, channel.id, candidateIndex, retryCount]);

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

      if (proxyPort === null) {
        console.log("[InstantSwitch] Proxy port not available");
        return;
      }
      if (!instantSwitchEnabled) {
        console.log("[InstantSwitch] Instant switch disabled in settings");
        return;
      }
      const slot = direction === 1 ? getNextSlot(activeSlotRef.current) : getPrevSlot(activeSlotRef.current);
      const currentSlotChannelId = slotChannelIdRef.current[slot];
      if (currentSlotChannelId !== next.id) {
        console.log(
          `[InstantSwitch] Loading channel ${next.id} (${next.name}) into slot ${slot}(${direction === 1 ? "next" : "prev"}), previous: ${currentSlotChannelId}`,
        );
        loadChannelInSlot(slot, next, true);
      } else {
        console.log(
          `[InstantSwitch] Channel ${next.id} already in slot ${slot}, skip loading`,
        );
      }
      setSlotMuted(slot, true);
    },
    [getCurrentPlaybackChannelId, loadChannelInSlot, proxyPort, setSlotMuted, instantSwitchEnabled],
  );

  const resetInactivityTimer = useCallback(() => {
    if (inactivityCleanupTimerRef.current) {
      clearTimeout(inactivityCleanupTimerRef.current);
    }
    inactivityCleanupTimerRef.current = setTimeout(() => {
      console.log("[InstantSwitch] TTL expired - cleaning up standby slots");
      destroySlot(0);
      destroySlot(2);
    }, INSTANT_SWITCH_SLOT_TTL_MS);
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
          `[InstantSwitch] Preload next channel - base: ${baseChannelId}, next: ${next.id} (${next.name})`,
        );
        prewarmChannel(next, 1);
      }

      // Preload prev channel
      const prev = getAdjacentChannel(channels, baseChannelId, -1);
      if (prev) {
        console.log(
          `[InstantSwitch] Preload prev channel - base: ${baseChannelId}, prev: ${prev.id} (${prev.name})`,
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
      console.log(
        `[InstantSwitch] User switch - from ${baseChannelId} to ${next.id} (${next.name}), direction: ${direction}`,
      );
      showSwitchOsd(next);
      const targetSlot = direction === 1 ? getNextSlot(activeSlotRef.current) : getPrevSlot(activeSlotRef.current);
      if (slotChannelIdRef.current[targetSlot] !== next.id) {
        console.log(
          `[InstantSwitch] Loading channel ${next.id} (${next.name}) in slot ${targetSlot} for immediate switch`,
        );
        const loaded = loadChannelInSlot(targetSlot, next, false);
        if (!loaded) {
          console.warn(
            `[InstantSwitch] Failed to load channel ${next.id} into slot ${targetSlot}, skip activation`,
          );
          return;
        }
      } else {
        console.log(
          `[InstantSwitch] Channel ${next.id} already in slot ${targetSlot}, activate directly`,
        );
      }
      setError(null);
      activateSlot(targetSlot);
      onChannelChange(next);
    },
    [
      activateSlot,
      channels,
       getCurrentPlaybackChannelId,
       loadChannelInSlot,
       onChannelChange,
       showSwitchOsd,
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

  const adjustVolume = useCallback((delta: number) => {
    setVolume((current) => Math.max(0, Math.min(1, Number((current + delta).toFixed(2)))));
    showOverlay();
  }, [showOverlay]);

  useEffect(() => {
    confirmPressRef.current = createConfirmPressHandler({
      onGesture: (gesture) => {
        if (gesture === ConfirmGesture.Single) {
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
          return;
        }
        if (gesture === ConfirmGesture.Double) {
          setGuidePanelVisible((v) => !v);
          showOverlay();
          return;
        }
        if (gesture === ConfirmGesture.Long) {
          togglePlayPause();
          showOverlay();
        }
      },
    });
    return () => {
      confirmPressRef.current?.clear();
      confirmPressRef.current = null;
    };
  }, [onChannelChange, setChannelListPanel, setGuidePanelVisible, showOverlay, startChannelListAutoHide, togglePlayPause]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const intent = mapKeyToTvIntent(e.key);
      const inNavZone = playerFocusZoneRef.current === "nav";
      if (showChannelListPanelRef.current) {
        touchChannelListAutoHide();
      }
      if (inNavZone) {
        if (intent === TvIntent.MoveUp || intent === TvIntent.MoveDown) {
          e.preventDefault();
          const buttons = getNavButtons();
          if (buttons.length === 0) return;
          const currentIndex = Math.max(0, buttons.findIndex((item) => item === document.activeElement));
          const offset = intent === TvIntent.MoveDown ? 1 : -1;
          const nextIndex = (currentIndex + offset + buttons.length) % buttons.length;
          buttons[nextIndex]?.focus();
          showOverlay();
          return;
        }
        if (intent === TvIntent.MoveRight) {
          e.preventDefault();
          setPlayerFocusZone("player");
          if (showChannelListPanelRef.current) {
            focusChannelListItem(focusedChannelIndexRef.current);
          }
          showOverlay();
          return;
        }
        if (intent === TvIntent.Confirm) {
          return;
        }
      }
      if (intent === TvIntent.Back) {
        e.preventDefault();
        if (showChannelListPanelRef.current) {
          setChannelListPanel(false);
        } else {
          onClose();
        }
        showOverlay();
        return;
      }
      if (intent === TvIntent.MoveLeft) {
        e.preventDefault();
        setPlayerFocusZone("nav");
        focusActiveNavButton();
        showOverlay();
        return;
      }
      if (intent === TvIntent.MoveRight) {
        e.preventDefault();
        setGuidePanelVisible((v) => !v);
        showOverlay();
        return;
      }
      if (intent === TvIntent.MoveUp) {
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
      if (intent === TvIntent.MoveDown) {
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
      if (intent === TvIntent.Confirm) {
        e.preventDefault();
        confirmPressRef.current?.onKeyDown(e.repeat);
        return;
      }
      if (intent === TvIntent.SecondaryAction) {
        e.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void containerRef.current?.requestFullscreen();
        }
        showOverlay();
        return;
      }
      if (e.key === "[" || e.key === "-") {
        e.preventDefault();
        adjustVolume(-0.05);
        return;
      }
      if (e.key === "]" || e.key === "=" || e.key === "+") {
        e.preventDefault();
        adjustVolume(0.05);
        return;
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setShowDiagnostics((prev) => !prev);
        showOverlay();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const intent = mapKeyToTvIntent(e.key);
      if (playerFocusZoneRef.current === "nav") return;
      if (intent === TvIntent.Confirm) {
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
    setGuidePanelVisible,
    showOverlay,
    switchChannel,
    touchChannelListAutoHide,
    adjustVolume,
  ]);

  useEffect(() => {
    return () => {
      if (channelListAutoHideTimerRef.current) {
        clearTimeout(channelListAutoHideTimerRef.current);
        channelListAutoHideTimerRef.current = null;
      }
      destroySlot(0);
      destroySlot(1);
      destroySlot(2);
    };
  }, [destroySlot]);

  return (
    <div ref={containerRef} style={containerStyle} onMouseMove={showOverlay} onClick={showOverlay}>
      <video
        ref={prevVideoRef}
        style={{
          ...videoStyle,
          opacity: activeSlot === 0 ? 1 : 0,
          zIndex: activeSlot === 0 ? 1 : 0,
          pointerEvents: activeSlot === 0 ? "auto" : "none",
        }}
        muted={activeSlot !== 0}
      />
      <video
        ref={activeVideoRef}
        style={{
          ...videoStyle,
          opacity: activeSlot === 1 ? 1 : 0,
          zIndex: activeSlot === 1 ? 1 : 0,
          pointerEvents: activeSlot === 1 ? "auto" : "none",
        }}
        muted={activeSlot !== 1}
      />
      <video
        ref={nextVideoRef}
        style={{
          ...videoStyle,
          opacity: activeSlot === 2 ? 1 : 0,
          zIndex: activeSlot === 2 ? 1 : 0,
          pointerEvents: activeSlot === 2 ? "auto" : "none",
        }}
        muted={activeSlot !== 2}
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
            <div style={{ fontSize: 11, opacity: 0.55 }}>
              {t(locale, "player.volume")}: {Math.round(volume * 100)}%
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => adjustVolume(-0.05)} style={overlayBtnStyle} title={t(locale, "player.volumeDown")}>
            -
          </button>
          <button onClick={() => adjustVolume(0.05)} style={overlayBtnStyle} title={t(locale, "player.volumeUp")}>
            +
          </button>
          <button onClick={() => setShowDiagnostics((prev) => !prev)} style={overlayBtnStyle} title={t(locale, "player.diagnostics")}>
            Diag
          </button>
          <button
            onClick={() => setChannelListPanel((v) => !v)}
            style={overlayBtnStyle}
            title={t(locale, "player.channelListShortcut")}
          >
            ☰
          </button>
          <button
            onClick={() => setGuidePanelVisible((v) => !v)}
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
          opacity: overlayVisible ? 1 : 0,
          pointerEvents: overlayVisible ? "auto" : "none",
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
        <div style={bottomStatsStyle}>
          <div style={bottomStatItemStyle}>
            <span>{t(locale, "player.networkSpeed")}:</span>
            <span style={networkSpeedValueStyle}>
              {bottomBarNetworkSpeed}
            </span>
          </div>
          <div style={bottomStatItemStyle}>
            {t(locale, "player.activeLine")}: {candidateIndex + 1}/{Math.max(playbackCandidates.length, 1)} {t(locale, "player.retryCount")}: {retryCount}
          </div>
        </div>
        {epgNext && (
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
            <span style={{ opacity: 0.5, fontSize: 12 }}>
              {formatTime(epgNext.startAt)} - {formatTime(epgNext.endAt)}
            </span>
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
          {!epgLoading && !epgError && visibleGuidePrograms.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
              {visibleGuidePrograms.map((program) => {
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
          {candidateIndex + 1 < Math.max(playbackCandidates.length, 1) && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {t(locale, "player.switchingBackup")}
            </div>
          )}
        </div>
      )}

      {showDiagnostics && (
        <div style={{ position: "absolute", right: 24, bottom: 120, width: 360, maxHeight: 320, overflowY: "auto", backgroundColor: "rgba(3, 7, 18, 0.92)", border: "1px solid rgba(148,163,184,0.35)", borderRadius: 10, padding: 14, zIndex: 5 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{t(locale, "player.diagnostics")}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.volume")}: {Math.round(volume * 100)}%</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.activeLine")}: {candidateIndex + 1}/{Math.max(playbackCandidates.length, 1)}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.retryCount")}: {retryCount}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.networkSpeed")}: {networkSpeedBps !== null ? formatNetworkSpeed(networkSpeedBps) : t(locale, "player.networkSpeedUnavailable")}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.streamKind")}: {getPlaybackKind(currentPlaybackSource.streamUrl) === "hls" ? "HLS" : getPlaybackKind(currentPlaybackSource.streamUrl) === "mpegts" ? "MPEG-TS" : "Native"}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.playbackEngine")}: {decoderDiagnostics.engineLabel}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.decoderInfo")}: {decoderDiagnostics.decoderLabel}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.videoResolution")}: {decoderDiagnostics.resolutionLabel}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.videoFrames")}: {decoderDiagnostics.framesLabel}</div>
          <div style={diagnosticLineStyle}>{t(locale, "player.resolvedSource")}: #{currentPlaybackSource.sourceId}</div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>{t(locale, "player.runtimeLogs")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {runtimeLogs.map((entry, index) => (
              <div key={`${entry}-${index}`} style={{ fontSize: 11, lineHeight: 1.4, color: "#cbd5e1", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {entry}
              </div>
            ))}
            {runtimeLogs.length === 0 && <div style={{ fontSize: 11, color: "#94a3b8" }}>—</div>}
          </div>
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

const diagnosticLineStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  color: "#e2e8f0",
};

const bottomStatsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const bottomStatItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  fontSize: 12,
  opacity: 0.7,
};

const networkSpeedValueStyle: React.CSSProperties = {
  display: "inline-block",
  minWidth: "4ch",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};
