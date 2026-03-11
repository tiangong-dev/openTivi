import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";

import { t, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel } from "../../types/api";
import { getPlaybackKind, toProxyUrl, type PlaybackKind } from "./playerUtils";

export interface UseInstantChannelSwitchOptions {
  proxyPort: number | null;
  locale: Locale;
  preferNativeHls: boolean;
  onError: (error: string | null) => void;
  onNetworkSpeed: (bps: number) => void;
}

export interface InstantChannelSwitchEngine {
  prevVideoRef: React.RefObject<HTMLVideoElement>;
  activeVideoRef: React.RefObject<HTMLVideoElement>;
  nextVideoRef: React.RefObject<HTMLVideoElement>;
  activeSlot: 0 | 1 | 2;
  activeSlotRef: React.MutableRefObject<0 | 1 | 2>;
  slotChannelIdRef: React.MutableRefObject<[number | null, number | null, number | null]>;
  hlsSlotsRef: React.MutableRefObject<[Hls | null, Hls | null, Hls | null]>;
  loadChannelInSlot: (
    slot: 0 | 1 | 2,
    target: Channel,
    prewarm: boolean,
    streamUrlOverride?: string,
  ) => boolean;
  activateSlot: (slot: 0 | 1 | 2) => void;
  destroySlot: (slot: 0 | 1 | 2) => void;
  setSlotMuted: (slot: 0 | 1 | 2, muted: boolean) => void;
  getVideoBySlot: (slot: 0 | 1 | 2) => HTMLVideoElement | null;
  getSlotPlaybackDebugInfo: (slot: 0 | 1 | 2) => {
    kind: PlaybackKind | null;
    engineLabel: string;
    decoderLabel: string;
  };
  appendRuntimeLog: (event: string, data: Record<string, unknown>) => void;
}

function loadHlsSlot(
  video: HTMLVideoElement,
  proxiedUrl: string,
  slot: 0 | 1 | 2,
  activeSlotRef: React.MutableRefObject<0 | 1 | 2>,
  hlsSlotsRef: React.MutableRefObject<[Hls | null, Hls | null, Hls | null]>,
  localeRef: React.MutableRefObject<Locale>,
  preferNativeHls: boolean,
  prewarm: boolean,
  markReady: () => void,
  onError: (error: string | null) => void,
  onNetworkSpeed: (bps: number) => void,
): void {
   const canUseNativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

   if (preferNativeHls && canUseNativeHls) {
     video.addEventListener("loadeddata", markReady, { once: true });
     video.src = proxiedUrl;
     video.preload = prewarm ? "metadata" : "auto";
     if (prewarm) {
       video.load();
       return;
     }
     video.play().catch(() => {
       if (Hls.isSupported()) {
         loadHlsSlot(
           video,
           proxiedUrl,
           slot,
           activeSlotRef,
           hlsSlotsRef,
           localeRef,
           false,
           prewarm,
           markReady,
           onError,
           onNetworkSpeed,
         );
         return;
       }
       if (slot === 1) {
         onError(t(localeRef.current, "player.hlsNotSupported"));
       }
     });
     return;
   }

   if (Hls.isSupported()) {
     const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
     hls.loadSource(proxiedUrl);
     hls.attachMedia(video);
     hls.on(Hls.Events.MANIFEST_PARSED, () => {
       markReady();
       if (!prewarm) {
         video.play().catch(() => {});
       }
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
   } else if (canUseNativeHls) {
     video.src = proxiedUrl;
     video.preload = prewarm ? "metadata" : "auto";
     if (prewarm) {
       video.load();
     } else {
       video.play().catch(() => {});
     }
   } else if (slot === 1) {
     onError(t(localeRef.current, "player.hlsNotSupported"));
   }
}

function loadMpegtsSlot(
  video: HTMLVideoElement,
  proxiedUrl: string,
  slot: 0 | 1 | 2,
  activeSlotRef: React.MutableRefObject<0 | 1 | 2>,
  mpegtsSlotsRef: React.MutableRefObject<[mpegts.Player | null, mpegts.Player | null, mpegts.Player | null]>,
  localeRef: React.MutableRefObject<Locale>,
  prewarm: boolean,
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
     if (!prewarm) {
       player.play();
     }
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
   } else if (slot === 1) {
     onError(t(localeRef.current, "player.mpegtsNotSupported"));
   }
}

function loadNativeSlot(
  video: HTMLVideoElement,
  proxiedUrl: string,
  slot: 0 | 1 | 2,
  activeSlotRef: React.MutableRefObject<0 | 1 | 2>,
  hlsSlotsRef: React.MutableRefObject<[Hls | null, Hls | null, Hls | null]>,
  localeRef: React.MutableRefObject<Locale>,
  prewarm: boolean,
  markReady: () => void,
  onError: (error: string | null) => void,
): void {
   video.addEventListener("loadeddata", markReady, { once: true });
   video.src = proxiedUrl;
   video.preload = prewarm ? "metadata" : "auto";
   if (prewarm) {
     video.load();
     return;
   }
   video.play().catch(() => {
     if (slot !== 1) return;
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

export function useInstantChannelSwitch({
  proxyPort,
  locale,
  preferNativeHls,
  onError,
  onNetworkSpeed,
}: UseInstantChannelSwitchOptions): InstantChannelSwitchEngine {
  const prevVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const hlsSlotsRef = useRef<[Hls | null, Hls | null, Hls | null]>([null, null, null]);
  const mpegtsSlotsRef = useRef<[mpegts.Player | null, mpegts.Player | null, mpegts.Player | null]>([null, null, null]);
  const slotKindRef = useRef<[PlaybackKind | null, PlaybackKind | null, PlaybackKind | null]>([null, null, null]);
  const slotUrlRef = useRef<[string | null, string | null, string | null]>([null, null, null]);
  const slotChannelIdRef = useRef<[number | null, number | null, number | null]>([null, null, null]);
  const activeSlotRef = useRef<0 | 1 | 2>(1);
  const slotReadyRef = useRef<[boolean, boolean, boolean]>([false, false, false]);
  const localeRef = useRef(locale);

  const onErrorRef = useRef(onError);
  const onNetworkSpeedRef = useRef(onNetworkSpeed);

  const [activeSlot, setActiveSlot] = useState<0 | 1 | 2>(1);

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

  const appendRuntimeLog = useCallback((event: string, data: Record<string, unknown>) => {
    void tauriInvoke("append_runtime_log", {
      input: { component: "player", event, data },
    }).catch(() => undefined);
  }, []);

  const getVideoBySlot = useCallback(
    (slot: 0 | 1 | 2) => {
      if (slot === 0) return prevVideoRef.current;
      if (slot === 1) return activeVideoRef.current;
      return nextVideoRef.current;
    },
    [],
  );

  const getSlotPlaybackDebugInfo = useCallback(
    (slot: 0 | 1 | 2) => {
      const kind = slotKindRef.current[slot];
      if (kind === "hls") {
        if (hlsSlotsRef.current[slot]) {
          return {
            kind,
            engineLabel: "hls.js",
            decoderLabel: "MSE browser decoder",
          };
        }
        return {
          kind,
          engineLabel: "Native HLS",
          decoderLabel: "System media pipeline (inferred)",
        };
      }
      if (kind === "mpegts") {
        return {
          kind,
          engineLabel: "mpegts.js",
          decoderLabel: "MSE browser decoder",
        };
      }
      if (kind === "native") {
        return {
          kind,
          engineLabel: "HTML5 native",
          decoderLabel: "HTML5 media decoder",
        };
      }
      return {
        kind: null,
        engineLabel: "--",
        decoderLabel: "--",
      };
    },
    [],
  );

  const setSlotMuted = useCallback(
    (slot: 0 | 1 | 2, muted: boolean) => {
      const video = getVideoBySlot(slot);
      if (!video) return;
      video.muted = muted;
    },
    [getVideoBySlot],
  );

  const destroySlot = useCallback(
    (slot: 0 | 1 | 2) => {
      const oldChannelId = slotChannelIdRef.current[slot];
      const slotName = slot === 0 ? "prev" : slot === 1 ? "active" : "next";
      console.log(`[InstantSwitch] destroySlot - slot ${slot}(${slotName}), channel: ${oldChannelId}`);
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
    (slot: 0 | 1 | 2) => {
      if (slot === activeSlotRef.current) {
        console.log("[InstantSwitch] activateSlot - already at active");
        return;
      }
      
      const direction = slot === 0 ? "prev" : "next";
      const targetChannelId = slotChannelIdRef.current[slot];
      console.log(
        `[InstantSwitch] activateSlot - move ${direction} to active, channel: ${targetChannelId}`,
      );
      
      // Track which slots need to stay
      // When activating slot 0: [n-1, n, n+1] -> destroy 2, move 0->1, 1->2
      // When activating slot 2: [n-1, n, n+1] -> destroy 0, move 2->1, 1->0
      
      activeSlotRef.current = slot;
      setActiveSlot(slot);
      
      // Update playback: unmute active, mute others
      setSlotMuted(slot, false);
      for (let i = 0; i < 3; i++) {
        if (i !== slot) {
          setSlotMuted(i as 0 | 1 | 2, true);
          const video = getVideoBySlot(i as 0 | 1 | 2);
          if (video) {
            video.pause();
          }
        }
      }
      
      // Start playback
      const activeVideo = getVideoBySlot(slot);
      if (activeVideo) {
        mpegtsSlotsRef.current[slot]?.play();
        activeVideo.play().catch((err) => {
          console.error(`[InstantSwitch] Failed to play slot ${slot}:`, err);
        });
      }
    },
    [getVideoBySlot, setSlotMuted],
  );

  const loadChannelInSlot = useCallback(
    (slot: 0 | 1 | 2, target: Channel, prewarm: boolean, streamUrlOverride?: string) => {
      if (proxyPort === null) return false;
      const video = getVideoBySlot(slot);
      if (!video) return false;

      const slotName = slot === 0 ? "prev" : slot === 1 ? "active" : "next";
      console.log(
        `[InstantSwitch] loadChannelInSlot - slot ${slot}(${slotName}), channel: ${target.id} (${target.name}), prewarm: ${prewarm}`,
      );
      destroySlot(slot);
      slotReadyRef.current[slot] = false;
      video.muted = prewarm;
      video.preload = prewarm ? "metadata" : "auto";
      const playbackUrl = streamUrlOverride ?? target.streamUrl;
      const proxiedUrl = toProxyUrl(playbackUrl, proxyPort);
      const kind = getPlaybackKind(playbackUrl);
      const markReady = () => {
        if (slotChannelIdRef.current[slot] === target.id) {
          slotReadyRef.current[slot] = true;
          console.log(
            `[InstantSwitch] Slot ${slot}(${slotName}) ready - channel: ${target.id} (${target.name}), prewarm: ${prewarm}`,
          );
          appendRuntimeLog("slot_ready", {
            slot,
            channelId: target.id,
            prewarm,
            isActiveSlot: slot === 1,
          });
        }
      };

      if (kind === "hls") {
        loadHlsSlot(
          video, proxiedUrl, slot, activeSlotRef, hlsSlotsRef, localeRef,
          preferNativeHls, prewarm,
          markReady, onErrorRef.current, onNetworkSpeedRef.current,
        );
      } else if (kind === "mpegts") {
        loadMpegtsSlot(
          video, proxiedUrl, slot, activeSlotRef, mpegtsSlotsRef, localeRef,
          prewarm, markReady, onErrorRef.current, onNetworkSpeedRef.current,
        );
      } else {
        loadNativeSlot(
          video, proxiedUrl, slot, activeSlotRef, hlsSlotsRef, localeRef,
          prewarm, markReady, onErrorRef.current,
        );
      }

      slotKindRef.current[slot] = kind;
      slotUrlRef.current[slot] = proxiedUrl;
      slotChannelIdRef.current[slot] = target.id;
      return true;
      },
      [appendRuntimeLog, destroySlot, getVideoBySlot, preferNativeHls, proxyPort],
      );

      return {
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
      };
      }
