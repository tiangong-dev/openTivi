import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";

import { t, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import { createConfirmPressHandler, mapKeyToTvIntent } from "../../lib/tvInput";
import type { Channel, ChannelEpgSnapshot, EpgProgram } from "../../types/api";

interface Props {
  channel: Channel;
  channels: Channel[];
  locale: Locale;
  onClose: () => void;
  onChannelChange: (channel: Channel) => void;
}

export function VideoPlayer({ channel, channels, locale, onClose, onChannelChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const localeRef = useRef(locale);
  const playbackKindRef = useRef<PlaybackKind | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guideAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelListAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedObserverRef = useRef<PerformanceObserver | null>(null);
  const speedFallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerFocusZoneRef = useRef<"player" | "nav">("player");
  const showChannelListPanelRef = useRef(false);
  const focusedChannelIndexRef = useRef(0);
  const channelsRef = useRef<Channel[]>(channels);
  const confirmPressRef = useRef<ReturnType<typeof createConfirmPressHandler> | null>(null);
  const channelListItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingSwitchChannelRef = useRef<Channel | null>(null);
  const pendingSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prewarmAbortRef = useRef<AbortController | null>(null);

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

  const GUIDE_AUTO_HIDE_MS = 3500;
  const CHANNEL_LIST_AUTO_HIDE_MS = 5000;
  const CHANNEL_SWITCH_COMMIT_DELAY_MS = 120;

  useEffect(() => {
    playerFocusZoneRef.current = playerFocusZone;
  }, [playerFocusZone]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    void tauriInvoke<number>("get_proxy_port").then(setProxyPort);
  }, []);

  const teardownHls = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  const teardownMpegTs = () => {
    if (mpegtsRef.current) {
      mpegtsRef.current.pause();
      mpegtsRef.current.unload();
      mpegtsRef.current.detachMediaElement();
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }
  };

  const teardownNative = () => {
    if (videoRef.current) {
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  };

  const cleanup = () => {
    teardownHls();
    teardownMpegTs();
    teardownNative();
    playbackKindRef.current = null;
    playbackUrlRef.current = null;
  };

  useEffect(() => {
    if (proxyPort === null) return;
    const video = videoRef.current;
    if (!video) return;

    const proxiedUrl = toProxyUrl(channel.streamUrl, proxyPort);
    const nextKind = getPlaybackKind(channel.streamUrl);
    const protocolChanged = playbackKindRef.current !== nextKind;
    const sourceChanged = playbackUrlRef.current !== proxiedUrl;

    if (!protocolChanged && !sourceChanged) return;
    setError(null);
    setNetworkSpeedBps(null);

    if (protocolChanged) {
      cleanup();
    }

    if (nextKind === "hls") {
      if (hlsRef.current) {
        hlsRef.current.loadSource(proxiedUrl);
        video.play().catch(() => {});
      } else {
        attachHls(video, proxiedUrl);
      }
      playbackKindRef.current = "hls";
    } else if (nextKind === "mpegts") {
      if (mpegtsRef.current) {
        teardownMpegTs();
      }
      attachMpegTs(video, proxiedUrl);
      playbackKindRef.current = "mpegts";
    } else {
      if (video.src !== proxiedUrl) {
        video.src = proxiedUrl;
      }
      video.play().catch(() => {
        if (Hls.isSupported()) {
          attachHls(video, proxiedUrl);
          playbackKindRef.current = "hls";
        } else {
          setError(t(localeRef.current, "player.unsupportedStreamFormat"));
        }
      });
      playbackKindRef.current = "native";
    }

    playbackUrlRef.current = proxiedUrl;
  }, [channel.streamUrl, proxyPort]);

  useEffect(() => cleanup, []);

  const attachHls = (video: HTMLVideoElement, url: string) => {
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
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
        if (data.fatal) {
          setError(t(localeRef.current, "player.playbackErrorDetails", { details: data.details }));
        }
      });
      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      setError(t(localeRef.current, "player.hlsNotSupported"));
    }
  };

  const attachMpegTs = (video: HTMLVideoElement, url: string) => {
    if (mpegts.isSupported()) {
      const player = mpegts.createPlayer({
        type: "mpegts",
        isLive: true,
        url,
      });
      player.attachMediaElement(video);
      player.load();
      player.play();
      player.on(mpegts.Events.STATISTICS_INFO, (stats) => {
        const speedKiloBytesPerSec = Number((stats as { speed?: number })?.speed);
        if (Number.isFinite(speedKiloBytesPerSec) && speedKiloBytesPerSec > 0) {
          const bitsPerSecond = speedKiloBytesPerSec * 1024 * 8;
          setNetworkSpeedBps(bitsPerSecond);
        }
      });
      player.on(mpegts.Events.ERROR, () => {
        setError(t(localeRef.current, "player.mpegtsPlaybackError"));
      });
      mpegtsRef.current = player;
    } else {
      setError(t(localeRef.current, "player.mpegtsNotSupported"));
    }
  };

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
    if (proxyPort === null) {
      return;
    }
    if (typeof PerformanceObserver === "undefined") {
      return;
    }
    const proxyPrefix = `http://127.0.0.1:${proxyPort}/stream?`;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== "resource") {
          continue;
        }
        const resource = entry as PerformanceResourceTiming;
        if (!resource.name.startsWith(proxyPrefix)) {
          continue;
        }
        const bytes = resource.transferSize > 0 ? resource.transferSize : resource.encodedBodySize;
        const durationMs = resource.duration;
        if (bytes <= 0 || durationMs <= 0) {
          continue;
        }
        const bitsPerSecond = (bytes * 8 * 1000) / durationMs;
        setNetworkSpeedBps((prev) => (prev === null ? bitsPerSecond : prev * 0.65 + bitsPerSecond * 0.35));
      }
    });
    observer.observe({ type: "resource", buffered: false });
    speedObserverRef.current = observer;
    return () => {
      observer.disconnect();
      if (speedObserverRef.current === observer) {
        speedObserverRef.current = null;
      }
    };
  }, [proxyPort]);

  useEffect(() => {
    const readDecodedBytes = () => {
      const video = videoRef.current as (HTMLVideoElement & {
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
      const hlsEstimate = Number((hlsRef.current as unknown as { bandwidthEstimate?: number } | null)?.bandwidthEstimate ?? 0);
      if (Number.isFinite(hlsEstimate) && hlsEstimate > 0) {
        setNetworkSpeedBps((prev) => (prev === null ? hlsEstimate : prev * 0.65 + hlsEstimate * 0.35));
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
      setNetworkSpeedBps((prev) => (prev === null ? bitsPerSecond : prev * 0.65 + bitsPerSecond * 0.35));
    }, 1000);

    return () => {
      if (speedFallbackTimerRef.current) {
        clearInterval(speedFallbackTimerRef.current);
        speedFallbackTimerRef.current = null;
      }
    };
  }, [channel.id]);

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

  const clearPendingSwitchTimer = useCallback(() => {
    if (pendingSwitchTimerRef.current) {
      clearTimeout(pendingSwitchTimerRef.current);
      pendingSwitchTimerRef.current = null;
    }
  }, []);

  const cancelPrewarm = useCallback(() => {
    if (prewarmAbortRef.current) {
      prewarmAbortRef.current.abort();
      prewarmAbortRef.current = null;
    }
  }, []);

  const showSwitchOsd = useCallback((next: Channel) => {
    setOsdChannel(next);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => setOsdChannel(null), 2000);
  }, []);

  const getAdjacentChannel = useCallback(
    (baseChannelId: number, direction: -1 | 1): Channel | null => {
      if (channels.length === 0) return null;
      const idx = channels.findIndex((c) => c.id === baseChannelId);
      if (idx === -1) return null;
      const nextIdx = (idx + direction + channels.length) % channels.length;
      return channels[nextIdx] ?? null;
    },
    [channels],
  );

  const prewarmChannel = useCallback(
    (next: Channel) => {
      if (proxyPort === null) return;
      cancelPrewarm();
      const controller = new AbortController();
      prewarmAbortRef.current = controller;
      const proxiedUrl = toProxyUrl(next.streamUrl, proxyPort);
      void fetch(proxiedUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return;
          const reader = response.body?.getReader();
          if (!reader) return;
          await reader.read().catch(() => undefined);
          await reader.cancel().catch(() => undefined);
        })
        .catch(() => undefined)
        .finally(() => {
          if (prewarmAbortRef.current === controller) {
            prewarmAbortRef.current = null;
          }
        });
    },
    [cancelPrewarm, proxyPort],
  );

  const commitPendingSwitch = useCallback(() => {
    const next = pendingSwitchChannelRef.current;
    clearPendingSwitchTimer();
    pendingSwitchChannelRef.current = null;
    cancelPrewarm();
    if (!next || next.id === channel.id) return;
    onChannelChange(next);
  }, [cancelPrewarm, channel.id, clearPendingSwitchTimer, onChannelChange]);

  const previewSwitchChannel = useCallback(
    (direction: -1 | 1) => {
      const baseChannelId = pendingSwitchChannelRef.current?.id ?? channel.id;
      const next = getAdjacentChannel(baseChannelId, direction);
      if (!next) return;
      pendingSwitchChannelRef.current = next;
      showSwitchOsd(next);
      prewarmChannel(next);
      clearPendingSwitchTimer();
      pendingSwitchTimerRef.current = setTimeout(() => {
        commitPendingSwitch();
      }, CHANNEL_SWITCH_COMMIT_DELAY_MS);
    },
    [
      CHANNEL_SWITCH_COMMIT_DELAY_MS,
      channel.id,
      clearPendingSwitchTimer,
      commitPendingSwitch,
      getAdjacentChannel,
      prewarmChannel,
      showSwitchOsd,
    ],
  );

  const switchChannel = useCallback(
    (direction: -1 | 1) => {
      const next = getAdjacentChannel(channel.id, direction);
      if (!next) return;
      showSwitchOsd(next);
      onChannelChange(next);
    },
    [channel.id, getAdjacentChannel, onChannelChange, showSwitchOsd],
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
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPaused(false);
      return;
    }
    videoRef.current.pause();
    setIsPaused(true);
  }, []);

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
          previewSwitchChannel(-1);
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
          previewSwitchChannel(1);
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
      if (
        (intent === "MoveUp" || intent === "MoveDown") &&
        !showChannelListPanelRef.current
      ) {
        e.preventDefault();
        commitPendingSwitch();
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
    previewSwitchChannel,
    commitPendingSwitch,
    switchChannel,
    touchChannelListAutoHide,
  ]);

  useEffect(() => {
    pendingSwitchChannelRef.current = null;
    clearPendingSwitchTimer();
    cancelPrewarm();
  }, [cancelPrewarm, channel.id, clearPendingSwitchTimer]);

  useEffect(() => {
    return () => {
      if (channelListAutoHideTimerRef.current) {
        clearTimeout(channelListAutoHideTimerRef.current);
        channelListAutoHideTimerRef.current = null;
      }
      clearPendingSwitchTimer();
      cancelPrewarm();
    };
  }, [cancelPrewarm, clearPendingSwitchTimer]);

  return (
    <div ref={containerRef} style={containerStyle} onMouseMove={showOverlay} onClick={showOverlay}>
      <video ref={videoRef} style={videoStyle} autoPlay />

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
          <div style={{ fontSize: 24, fontWeight: 600 }}>{osdChannel.name}</div>
        </div>
      )}
    </div>
  );
}

type PlaybackKind = "hls" | "mpegts" | "native";

function parseXmltvDate(raw: string): number | null {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (!match) {
    const fallback = Date.parse(raw);
    return Number.isNaN(fallback) ? null : fallback;
  }
  const [, y, mo, d, h, mi, s, offset] = match;
  const tz = offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : "Z";
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

function formatTime(value: string): string {
  const ts = parseXmltvDate(value);
  if (ts === null) return value;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatNetworkSpeed(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
  }
  return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
}

function getGuidePrograms(programs: EpgProgram[]): EpgProgram[] {
  const now = Date.now();
  const upcoming = programs.filter((p) => {
    const end = parseXmltvDate(p.endAt);
    return end !== null && end >= now - 15 * 60 * 1000;
  });
  return (upcoming.length > 0 ? upcoming : programs).slice(0, 12);
}

function toProxyUrl(originalUrl: string, port: number): string {
  return `http://127.0.0.1:${port}/stream?url=${encodeURIComponent(originalUrl)}`;
}

function isHls(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".m3u8") || lower.includes("format=m3u8");
}

function isMpegTs(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".ts") || lower.includes("container=ts");
}

function getPlaybackKind(url: string): PlaybackKind {
  if (isHls(url)) return "hls";
  if (isMpegTs(url)) return "mpegts";
  return "native";
}

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  backgroundColor: "#000",
  overflow: "hidden",
  cursor: "default",
};

const videoStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  backgroundColor: "#000",
};

const topBarStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px",
  background: "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)",
  color: "#fff",
  transition: "opacity 0.3s ease",
  zIndex: 10,
};

const bottomBarStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  padding: "16px 20px",
  background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
  color: "#fff",
  transition: "opacity 0.3s ease",
  zIndex: 10,
};

const guidePanelStyle: React.CSSProperties = {
  position: "absolute",
  top: 72,
  right: 12,
  bottom: 92,
  width: 340,
  maxWidth: "40vw",
  borderRadius: 8,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(10,10,10,0.92)",
  backdropFilter: "blur(8px)",
  color: "var(--text-primary)",
  display: "flex",
  flexDirection: "column",
  padding: 10,
  gap: 8,
  zIndex: 12,
};

const channelListPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: 72,
  left: 12,
  bottom: 92,
  width: 320,
  maxWidth: "38vw",
  borderRadius: 8,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(20,20,20,0.78)",
  backdropFilter: "blur(8px)",
  color: "var(--text-primary)",
  display: "flex",
  flexDirection: "column",
  padding: 10,
  gap: 8,
  zIndex: 12,
};

const guideHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 13,
  fontWeight: 600,
};

const guideHintStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 12,
};

const guideItemStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 8px",
};

const channelListItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text-primary)",
  padding: "7px 8px",
  fontSize: 13,
  cursor: "pointer",
};

const channelProgramNowStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#cbd5e1",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const channelProgramNextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const overlayBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  backdropFilter: "blur(8px)",
  border: "none",
  color: "#fff",
  width: 36,
  height: 36,
  borderRadius: "50%",
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 3,
  backgroundColor: "rgba(255,255,255,0.2)",
  borderRadius: 2,
  marginTop: 8,
  overflow: "hidden",
};

const progressBarStyle: React.CSSProperties = {
  height: "100%",
  backgroundColor: "#3b82f6",
  borderRadius: 2,
  transition: "width 0.5s ease",
};

const networkSpeedStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "rgba(255,255,255,0.75)",
};

const errorOverlayStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 80,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "10px 20px",
  backgroundColor: "rgba(0,0,0,0.8)",
  backdropFilter: "blur(8px)",
  borderRadius: 8,
  zIndex: 20,
};

const pauseIndicatorStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  fontSize: 64,
  color: "rgba(255,255,255,0.7)",
  pointerEvents: "none",
  zIndex: 15,
};

const osdStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
  color: "#fff",
  textShadow: "0 2px 12px rgba(0,0,0,0.8)",
  pointerEvents: "none",
  zIndex: 15,
  animation: "fadeIn 0.2s ease",
};
