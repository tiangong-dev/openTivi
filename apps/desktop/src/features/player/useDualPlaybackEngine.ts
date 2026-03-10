import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";

import { t, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel } from "../../types/api";
import { getPlaybackKind, toProxyUrl, type PlaybackKind } from "./playerUtils";

export interface UseDualPlaybackEngineOptions {
  proxyPort: number | null;
  locale: Locale;
  onError: (error: string | null) => void;
  onNetworkSpeed: (bps: number) => void;
}

export interface DualPlaybackEngine {
  primaryVideoRef: React.RefObject<HTMLVideoElement>;
  standbyVideoRef: React.RefObject<HTMLVideoElement>;
  activeSlot: 0 | 1;
  activeSlotRef: React.MutableRefObject<0 | 1>;
  slotChannelIdRef: React.MutableRefObject<[number | null, number | null]>;
  hlsSlotsRef: React.MutableRefObject<[Hls | null, Hls | null]>;
  decoderPrewarmAllowedRef: React.MutableRefObject<boolean>;
  loadChannelInSlot: (slot: 0 | 1, target: Channel, prewarm: boolean) => boolean;
  activateSlot: (slot: 0 | 1) => void;
  destroySlot: (slot: 0 | 1) => void;
  setSlotMuted: (slot: 0 | 1, muted: boolean) => void;
  getVideoBySlot: (slot: 0 | 1) => HTMLVideoElement | null;
  reportPrimaryState: (channelId: number | null, started: boolean) => Promise<boolean>;
  appendRuntimeLog: (event: string, data: Record<string, unknown>) => void;
}

function loadHlsSlot(
  video: HTMLVideoElement,
  proxiedUrl: string,
  slot: 0 | 1,
  activeSlotRef: React.MutableRefObject<0 | 1>,
  hlsSlotsRef: React.MutableRefObject<[Hls | null, Hls | null]>,
  localeRef: React.MutableRefObject<Locale>,
  markReady: () => void,
  onError: (error: string | null) => void,
  onNetworkSpeed: (bps: number) => void,
): void {
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
        onNetworkSpeed(bitsPerSecond);
      }
    });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (slot !== activeSlotRef.current) return;
      if (data.fatal) {
        onError(t(localeRef.current, "player.playbackErrorDetails", { details: data.details }));
      }
    });
    hlsSlotsRef.current[slot] = hls;
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = proxiedUrl;
    video.play().catch(() => {});
  } else if (slot === activeSlotRef.current) {
    onError(t(localeRef.current, "player.hlsNotSupported"));
  }
}

function loadMpegtsSlot(
  video: HTMLVideoElement,
  proxiedUrl: string,
  slot: 0 | 1,
  activeSlotRef: React.MutableRefObject<0 | 1>,
  mpegtsSlotsRef: React.MutableRefObject<[mpegts.Player | null, mpegts.Player | null]>,
  localeRef: React.MutableRefObject<Locale>,
  markReady: () => void,
  onError: (error: string | null) => void,
  onNetworkSpeed: (bps: number) => void,
): void {
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
        onNetworkSpeed(bitsPerSecond);
      }
    });
    player.on(mpegts.Events.ERROR, () => {
      if (slot !== activeSlotRef.current) return;
      onError(t(localeRef.current, "player.mpegtsPlaybackError"));
    });
    mpegtsSlotsRef.current[slot] = player;
  } else if (slot === activeSlotRef.current) {
    onError(t(localeRef.current, "player.mpegtsNotSupported"));
  }
}

function loadNativeSlot(
  video: HTMLVideoElement,
  proxiedUrl: string,
  slot: 0 | 1,
  activeSlotRef: React.MutableRefObject<0 | 1>,
  hlsSlotsRef: React.MutableRefObject<[Hls | null, Hls | null]>,
  localeRef: React.MutableRefObject<Locale>,
  markReady: () => void,
  onError: (error: string | null) => void,
): void {
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
      onError(t(localeRef.current, "player.unsupportedStreamFormat"));
    }
  });
}

export function useDualPlaybackEngine({
  proxyPort,
  locale,
  onError,
  onNetworkSpeed,
}: UseDualPlaybackEngineOptions): DualPlaybackEngine {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const standbyVideoRef = useRef<HTMLVideoElement>(null);
  const hlsSlotsRef = useRef<[Hls | null, Hls | null]>([null, null]);
  const mpegtsSlotsRef = useRef<[mpegts.Player | null, mpegts.Player | null]>([null, null]);
  const slotKindRef = useRef<[PlaybackKind | null, PlaybackKind | null]>([null, null]);
  const slotUrlRef = useRef<[string | null, string | null]>([null, null]);
  const slotChannelIdRef = useRef<[number | null, number | null]>([null, null]);
  const activeSlotRef = useRef<0 | 1>(0);
  const slotReadyRef = useRef<[boolean, boolean]>([false, false]);
  const localeRef = useRef(locale);
  const decoderPrewarmAllowedRef = useRef(true);

  const onErrorRef = useRef(onError);
  const onNetworkSpeedRef = useRef(onNetworkSpeed);

  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onNetworkSpeedRef.current = onNetworkSpeed;
  }, [onNetworkSpeed]);

  const reportPrimaryState = useCallback(async (channelId: number | null, started: boolean) => {
    try {
      const allow = await tauriInvoke<boolean>("prewarm_report_primary", {
        input: { channelId, started },
      });
      decoderPrewarmAllowedRef.current = allow;
      return allow;
    } catch {
      return decoderPrewarmAllowedRef.current;
    }
  }, []);

  const appendRuntimeLog = useCallback((event: string, data: Record<string, unknown>) => {
    void tauriInvoke("append_runtime_log", {
      input: { component: "player", event, data },
    }).catch(() => undefined);
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
      const oldChannelId = slotChannelIdRef.current[slot];
      console.log(`[Standby] destroySlot - slot ${slot} (channel: ${oldChannelId})`);
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
      console.log(
        `[Standby] activateSlot - slot ${slot} (channel: ${slotChannelIdRef.current[slot]}), mute slot ${other} (channel: ${slotChannelIdRef.current[other]})`,
      );
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

      console.log(
        `[Standby] loadChannelInSlot - slot: ${slot}, channel: ${target.id} (${target.name}), prewarm: ${prewarm}`,
      );
      destroySlot(slot);
      slotReadyRef.current[slot] = false;
      video.muted = prewarm;
      const proxiedUrl = toProxyUrl(target.streamUrl, proxyPort);
      const kind = getPlaybackKind(target.streamUrl);
      const markReady = () => {
        if (slotChannelIdRef.current[slot] === target.id) {
          slotReadyRef.current[slot] = true;
          console.log(
            `[Standby] Slot ${slot} ready - channel: ${target.id} (${target.name}), prewarm: ${prewarm}, isActive: ${slot === activeSlotRef.current}`,
          );
          appendRuntimeLog("slot_ready", {
            slot,
            channelId: target.id,
            prewarm,
            isActiveSlot: slot === activeSlotRef.current,
          });
          if (slot === activeSlotRef.current) {
            void reportPrimaryState(target.id, true);
          }
        }
      };

      if (kind === "hls") {
        loadHlsSlot(
          video, proxiedUrl, slot, activeSlotRef, hlsSlotsRef, localeRef,
          markReady, onErrorRef.current, onNetworkSpeedRef.current,
        );
      } else if (kind === "mpegts") {
        loadMpegtsSlot(
          video, proxiedUrl, slot, activeSlotRef, mpegtsSlotsRef, localeRef,
          markReady, onErrorRef.current, onNetworkSpeedRef.current,
        );
      } else {
        loadNativeSlot(
          video, proxiedUrl, slot, activeSlotRef, hlsSlotsRef, localeRef,
          markReady, onErrorRef.current,
        );
      }

      slotKindRef.current[slot] = kind;
      slotUrlRef.current[slot] = proxiedUrl;
      slotChannelIdRef.current[slot] = target.id;
      return true;
    },
    [appendRuntimeLog, destroySlot, getVideoBySlot, proxyPort, reportPrimaryState],
  );

  return {
    primaryVideoRef,
    standbyVideoRef,
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
  };
}
