import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";

import { t, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import { createConfirmPressHandler, mapKeyToTvIntent } from "../../lib/tvInput";
import type { Channel, ChannelEpgSnapshot, EpgProgram } from "../../types/api";
import {
  buildNeighborWarmPlan,
  getAdjacentChannel,
  getStandbySlot,
  resolveCurrentPlaybackChannelId,
  shouldLoadInStandby,
} from "./playerSwitchCore";
import {
  formatNetworkSpeed,
  formatTime,
  getGuidePrograms,
  getPlaybackKind,
  parseXmltvDate,
  toProxyUrl,
  type PlaybackKind,
} from "./playerUtils";
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

interface Props {
  channel: Channel;
  channels: Channel[];
  locale: Locale;
  onClose: () => void;
  onChannelChange: (channel: Channel) => void;
}

export function VideoPlayer({ channel, channels, locale, onClose, onChannelChange }: Props) {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const standbyVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsSlotsRef = useRef<[Hls | null, Hls | null]>([null, null]);
  const mpegtsSlotsRef = useRef<[mpegts.Player | null, mpegts.Player | null]>([null, null]);
  const slotKindRef = useRef<[PlaybackKind | null, PlaybackKind | null]>([null, null]);
  const slotUrlRef = useRef<[string | null, string | null]>([null, null]);
  const slotChannelIdRef = useRef<[number | null, number | null]>([null, null]);
  const activeSlotRef = useRef<0 | 1>(0);
  const localeRef = useRef(locale);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guideAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelListAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedFallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerFocusZoneRef = useRef<"player" | "nav">("player");
  const showChannelListPanelRef = useRef(false);
  const focusedChannelIndexRef = useRef(0);
  const channelsRef = useRef<Channel[]>(channels);
  const confirmPressRef = useRef<ReturnType<typeof createConfirmPressHandler> | null>(null);
  const channelListItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const slotReadyRef = useRef<[boolean, boolean]>([false, false]);
  const preferredDirectionRef = useRef<-1 | 1>(1);
  const neighborWarmTsRef = useRef<Map<string, number>>(new Map());
  const neighborWarmInFlightRef = useRef<Map<string, AbortController>>(new Map());
  const neighborWarmLruRef = useRef<string[]>([]);

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
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);

  const GUIDE_AUTO_HIDE_MS = 3500;
  const CHANNEL_LIST_AUTO_HIDE_MS = 5000;

  useEffect(() => {
    playerFocusZoneRef.current = playerFocusZone;
  }, [playerFocusZone]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    void tauriInvoke<number>("get_proxy_port").then(setProxyPort);
  }, []);

  const getVideoBySlot = useCallback(
    (slot: 0 | 1) => (slot === 0 ? primaryVideoRef.current : standbyVideoRef.current),
    [],
  );

  const setSlotMuted = useCallback(
    (slot: 0 | 1, muted: boolean) => {
      const video = getVideoBySlot(slot);
      if (!video) return;
      video.muted = muted;
    },
    [getVideoBySlot],
  );

  const destroySlot = useCallback(
    (slot: 0 | 1) => {
      if (hlsSlotsRef.current[slot]) {
        hlsSlotsRef.current[slot]?.destroy();
        hlsSlotsRef.current[slot] = null;
      }
      if (mpegtsSlotsRef.current[slot]) {
        mpegtsSlotsRef.current[slot]?.pause();
        mpegtsSlotsRef.current[slot]?.unload();
        mpegtsSlotsRef.current[slot]?.detachMediaElement();
        mpegtsSlotsRef.current[slot]?.destroy();
        mpegtsSlotsRef.current[slot] = null;
      }
      const video = getVideoBySlot(slot);
      if (video) {
        video.removeAttribute("src");
        video.load();
      }
      slotReadyRef.current[slot] = false;
      slotKindRef.current[slot] = null;
      slotUrlRef.current[slot] = null;
      slotChannelIdRef.current[slot] = null;
    },
    [getVideoBySlot],
  );

  const activateSlot = useCallback(
    (slot: 0 | 1) => {
      const other: 0 | 1 = slot === 0 ? 1 : 0;
      activeSlotRef.current = slot;
      setActiveSlot(slot);
      setSlotMuted(slot, false);
      setSlotMuted(other, true);
      const activeVideo = getVideoBySlot(slot);
      activeVideo?.play().catch(() => {});
    },
    [getVideoBySlot, setSlotMuted],
  );

  const loadChannelInSlot = useCallback(
    (slot: 0 | 1, target: Channel, prewarm: boolean) => {
      if (proxyPort === null) return false;
      const video = getVideoBySlot(slot);
      if (!video) return false;

      destroySlot(slot);
      slotReadyRef.current[slot] = false;
      video.muted = prewarm;
      const proxiedUrl = toProxyUrl(target.streamUrl, proxyPort);
      const kind = getPlaybackKind(target.streamUrl);
      const markReady = () => {
        if (slotChannelIdRef.current[slot] === target.id) {
          slotReadyRef.current[slot] = true;
        }
      };

      if (kind === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hls.loadSource(proxiedUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            markReady();
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
            if (slot !== activeSlotRef.current) return;
            const fragData = data as unknown as {
              stats?: {
                total?: number;
                loaded?: number;
                loading?: { start?: number; end?: number };
              };
            };
            const loadedBytes = fragData.stats?.total ?? fragData.stats?.loaded ?? 0;
            const loadingStart = fragData.stats?.loading?.start ?? 0;
            const loadingEnd = fragData.stats?.loading?.end ?? 0;
            const durationMs = loadingEnd - loadingStart;
            if (loadedBytes > 0 && durationMs > 0) {
              const bitsPerSecond = (loadedBytes * 8 * 1000) / durationMs;
              setNetworkSpeedBps(bitsPerSecond);
            }
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (slot !== activeSlotRef.current) return;
            if (data.fatal) {
              setError(t(localeRef.current, "player.playbackErrorDetails", { details: data.details }));
            }
          });
          hlsSlotsRef.current[slot] = hls;
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = proxiedUrl;
          video.play().catch(() => {});
        } else if (slot === activeSlotRef.current) {
          setError(t(localeRef.current, "player.hlsNotSupported"));
        }
      } else if (kind === "mpegts") {
        if (mpegts.isSupported()) {
          const player = mpegts.createPlayer({
            type: "mpegts",
            isLive: true,
            url: proxiedUrl,
          });
          player.attachMediaElement(video);
          player.load();
          player.play();
          player.on(mpegts.Events.STATISTICS_INFO, (stats) => {
            markReady();
            if (slot !== activeSlotRef.current) return;
            const speedKiloBytesPerSec = Number((stats as { speed?: number })?.speed);
            if (Number.isFinite(speedKiloBytesPerSec) && speedKiloBytesPerSec > 0) {
              const bitsPerSecond = speedKiloBytesPerSec * 1024 * 8;
              setNetworkSpeedBps(bitsPerSecond);
            }
          });
          player.on(mpegts.Events.ERROR, () => {
            if (slot !== activeSlotRef.current) return;
            setError(t(localeRef.current, "player.mpegtsPlaybackError"));
          });
          mpegtsSlotsRef.current[slot] = player;
        } else if (slot === activeSlotRef.current) {
          setError(t(localeRef.current, "player.mpegtsNotSupported"));
        }
      } else {
        video.addEventListener("loadeddata", markReady, { once: true });
        video.src = proxiedUrl;
        video.play().catch(() => {
          if (slot !== activeSlotRef.current) return;
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(proxiedUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              video.play().catch(() => {});
            });
            hlsSlotsRef.current[slot] = hls;
          } else {
            setError(t(localeRef.current, "player.unsupportedStreamFormat"));
          }
        });
      }

      slotKindRef.current[slot] = kind;
      slotUrlRef.current[slot] = proxiedUrl;
      slotChannelIdRef.current[slot] = target.id;
      return true;
    },
    [destroySlot, getVideoBySlot, proxyPort],
  );

  useEffect(() => {
    if (proxyPort === null) return;
    const active = activeSlotRef.current;
    const standby: 0 | 1 = active === 0 ? 1 : 0;

    if (slotChannelIdRef.current[active] === channel.id) {
      setSlotMuted(active, false);
      return;
    }

    setError(null);

    if (slotChannelIdRef.current[standby] === channel.id) {
      activateSlot(standby);
      return;
    }

    loadChannelInSlot(active, channel, false);
    setSlotMuted(active, false);
  }, [
    activateSlot,
    channel.id,
    channel.streamUrl,
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
      if (!error) setOverlayVisible(false);
    }, 4000);
  }, [error]);

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
    osdTimerRef.current = setTimeout(() => setOsdChannel(null), 2000);
  }, []);

  const warmProxyUrl = useCallback(
    (rawUrl: string, force = false) => {
      if (proxyPort === null) return;
      const now = Date.now();
      const cacheMs = 1800;
      const tsMap = neighborWarmTsRef.current;
      const last = tsMap.get(rawUrl) ?? 0;
      const inflight = neighborWarmInFlightRef.current.has(rawUrl);
      if (!force && now - last < cacheMs) return;
      if (inflight) return;

      if (neighborWarmInFlightRef.current.size >= 2) {
        const oldest = neighborWarmLruRef.current.shift();
        if (oldest) {
          neighborWarmInFlightRef.current.get(oldest)?.abort();
          neighborWarmInFlightRef.current.delete(oldest);
        }
      }

      const controller = new AbortController();
      neighborWarmInFlightRef.current.set(rawUrl, controller);
      neighborWarmLruRef.current = neighborWarmLruRef.current.filter((url) => url !== rawUrl);
      neighborWarmLruRef.current.push(rawUrl);
      if (neighborWarmLruRef.current.length > 24) {
        neighborWarmLruRef.current = neighborWarmLruRef.current.slice(-24);
      }

      const warmUrl = `http://127.0.0.1:${proxyPort}/warm?url=${encodeURIComponent(rawUrl)}`;
      void fetch(warmUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      })
        .catch(() => undefined)
        .finally(() => {
          tsMap.set(rawUrl, Date.now());
          neighborWarmInFlightRef.current.delete(rawUrl);
        });
    },
    [proxyPort],
  );

  const prewarmChannel = useCallback(
    (next: Channel) => {
      if (proxyPort === null) return;
      const currentPlaybackChannelId = getCurrentPlaybackChannelId();
      if (next.id === currentPlaybackChannelId) return;
      const standbySlot = getStandbySlot(activeSlotRef.current);
      if (shouldLoadInStandby(slotChannelIdRef.current[standbySlot], next.id)) {
        loadChannelInSlot(standbySlot, next, true);
      }
      setSlotMuted(standbySlot, true);
      warmProxyUrl(next.streamUrl);
    },
    [getCurrentPlaybackChannelId, loadChannelInSlot, proxyPort, setSlotMuted, warmProxyUrl],
  );

  useEffect(() => {
    if (proxyPort === null || channels.length < 2) return;
    const timer = setTimeout(() => {
      const preferred = preferredDirectionRef.current;
      const baseChannelId = getCurrentPlaybackChannelId();
      const { predicted, warmTargets } = buildNeighborWarmPlan(channels, baseChannelId, preferred);
      if (predicted) {
        prewarmChannel(predicted);
      }
      for (const target of warmTargets) {
        warmProxyUrl(target.streamUrl);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [
    channel.id,
    channels.length,
    channels,
    getCurrentPlaybackChannelId,
    prewarmChannel,
    proxyPort,
    warmProxyUrl,
  ]);

  const switchChannel = useCallback(
    (direction: -1 | 1) => {
      preferredDirectionRef.current = direction;
      const baseChannelId = getCurrentPlaybackChannelId();
      const next = getAdjacentChannel(channels, baseChannelId, direction);
      if (!next || next.id === baseChannelId) return;
      showSwitchOsd(next);
      const standbySlot = getStandbySlot(activeSlotRef.current);
      if (shouldLoadInStandby(slotChannelIdRef.current[standbySlot], next.id)) {
        loadChannelInSlot(standbySlot, next, false);
      }
      setError(null);
      activateSlot(standbySlot);
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
      neighborWarmInFlightRef.current.forEach((controller) => controller.abort());
      neighborWarmInFlightRef.current.clear();
      neighborWarmLruRef.current = [];
      destroySlot(0);
      destroySlot(1);
    };
  }, [destroySlot]);

  return (
    <div ref={containerRef} style={containerStyle} onMouseMove={showOverlay} onClick={showOverlay}>
      <video
        ref={primaryVideoRef}
        style={{
          ...videoStyle,
          opacity: activeSlot === 0 ? 1 : 0,
          zIndex: activeSlot === 0 ? 1 : 0,
          pointerEvents: "none",
        }}
        autoPlay
        muted={activeSlot !== 0}
      />
      <video
        ref={standbyVideoRef}
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

