import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel, EpgProgram } from "../../types/api";

interface Props {
  channel: Channel;
  channels: Channel[];
  onClose: () => void;
  onChannelChange: (channel: Channel) => void;
}

export function VideoPlayer({ channel, channels, onClose, onChannelChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [proxyPort, setProxyPort] = useState<number | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [osdChannel, setOsdChannel] = useState<Channel | null>(null);
  const [epgNow, setEpgNow] = useState<EpgProgram | null>(null);
  const [epgNext, setEpgNext] = useState<EpgProgram | null>(null);
  const [epgProgress, setEpgProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // --- Proxy port ---
  useEffect(() => {
    tauriInvoke<number>("get_proxy_port").then(setProxyPort);
  }, []);

  // --- Stream setup (kept as-is) ---
  useEffect(() => {
    if (proxyPort === null) return;
    const video = videoRef.current;
    if (!video) return;

    cleanup();
    setError(null);

    const proxiedUrl = toProxyUrl(channel.streamUrl, proxyPort);

    if (isHls(channel.streamUrl)) {
      attachHls(video, proxiedUrl);
    } else if (isMpegTs(channel.streamUrl)) {
      attachMpegTs(video, proxiedUrl);
    } else {
      video.src = proxiedUrl;
      video.play().catch(() => {
        if (Hls.isSupported()) {
          attachHls(video, proxiedUrl);
        } else {
          setError("Unsupported stream format");
        }
      });
    }

    return cleanup;
  }, [channel.streamUrl, proxyPort]);

  const attachHls = (video: HTMLVideoElement, url: string) => {
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setError(`Playback error: ${data.details}`);
        }
      });
      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      setError("HLS is not supported");
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
      player.on(mpegts.Events.ERROR, () => {
        setError("MPEG-TS playback error");
      });
      mpegtsRef.current = player;
    } else {
      setError("MPEG-TS is not supported");
    }
  };

  const cleanup = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.pause();
      mpegtsRef.current.unload();
      mpegtsRef.current.detachMediaElement();
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  };

  // --- EPG ---
  useEffect(() => {
    setEpgNow(null);
    setEpgNext(null);
    setEpgProgress(0);

    tauriInvoke<EpgProgram[]>("get_channel_epg", {
      query: { channelId: channel.id },
    })
      .then((programs) => {
        const now = Date.now();
        const current = programs.find(
          (p) => new Date(p.startAt).getTime() <= now && new Date(p.endAt).getTime() >= now,
        );
        if (current) {
          setEpgNow(current);
          const start = new Date(current.startAt).getTime();
          const end = new Date(current.endAt).getTime();
          setEpgProgress(((now - start) / (end - start)) * 100);

          const currentIdx = programs.indexOf(current);
          if (currentIdx < programs.length - 1) {
            setEpgNext(programs[currentIdx + 1]);
          }
        }
      })
      .catch(() => {});
  }, [channel.id]);

  // Update EPG progress every 30s
  useEffect(() => {
    if (!epgNow) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const start = new Date(epgNow.startAt).getTime();
      const end = new Date(epgNow.endAt).getTime();
      if (now > end) {
        setEpgNow(null);
        setEpgNext(null);
        setEpgProgress(0);
      } else {
        setEpgProgress(((now - start) / (end - start)) * 100);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [epgNow]);

  // --- Overlay auto-hide ---
  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!error) setOverlayVisible(false);
    }, 4000);
  }, [error]);

  useEffect(() => {
    showOverlay();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [channel.id]);

  // Always show overlay on error
  useEffect(() => {
    if (error) setOverlayVisible(true);
  }, [error]);

  // --- Channel switching ---
  const switchChannel = useCallback(
    (direction: -1 | 1) => {
      const idx = channels.findIndex((c) => c.id === channel.id);
      if (idx === -1) return;
      const nextIdx = (idx + direction + channels.length) % channels.length;
      const next = channels[nextIdx];

      setOsdChannel(next);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      osdTimerRef.current = setTimeout(() => setOsdChannel(null), 2000);

      onChannelChange(next);
    },
    [channels, channel.id, onChannelChange],
  );

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowUp":
          e.preventDefault();
          switchChannel(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          switchChannel(1);
          break;
        case " ":
          e.preventDefault();
          if (videoRef.current) {
            if (videoRef.current.paused) {
              videoRef.current.play().catch(() => {});
              setIsPaused(false);
            } else {
              videoRef.current.pause();
              setIsPaused(true);
            }
          }
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            containerRef.current?.requestFullscreen();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, switchChannel]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onMouseMove={showOverlay}
      onClick={showOverlay}
    >
      <video ref={videoRef} style={videoStyle} autoPlay />

      {/* Top overlay: channel info + close */}
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
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {channel.channelNumber && (
                <span style={{ opacity: 0.7, marginRight: 8 }}>{channel.channelNumber}</span>
              )}
              {channel.name}
            </div>
            {channel.groupName && (
              <div style={{ fontSize: 12, opacity: 0.6 }}>{channel.groupName}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => switchChannel(-1)} style={overlayBtnStyle} title="Previous channel (↑)">
            ▲
          </button>
          <button onClick={() => switchChannel(1)} style={overlayBtnStyle} title="Next channel (↓)">
            ▼
          </button>
          <button onClick={onClose} style={overlayBtnStyle} title="Close (Esc)">
            ✕
          </button>
        </div>
      </div>

      {/* Bottom overlay: EPG mini-bar */}
      {epgNow && (
        <div
          style={{
            ...bottomBarStyle,
            opacity: overlayVisible ? 1 : 0,
            pointerEvents: overlayVisible ? "auto" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
            <span style={{ opacity: 0.6, fontSize: 12 }}>Now</span>
            <span style={{ fontWeight: 600 }}>{epgNow.title}</span>
            <span style={{ opacity: 0.5, fontSize: 12 }}>
              {formatTime(epgNow.startAt)} – {formatTime(epgNow.endAt)}
            </span>
          </div>
          <div style={progressTrackStyle}>
            <div style={{ ...progressBarStyle, width: `${epgProgress}%` }} />
          </div>
          {epgNext && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, opacity: 0.7, marginTop: 4 }}>
              <span style={{ opacity: 0.6, fontSize: 12 }}>Next</span>
              <span>{epgNext.title}</span>
              <span style={{ opacity: 0.5, fontSize: 12 }}>{formatTime(epgNext.startAt)}</span>
            </div>
          )}
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div style={errorOverlayStyle}>
          <div style={{ fontSize: 14, color: "#ef4444" }}>{error}</div>
        </div>
      )}

      {/* Pause indicator */}
      {isPaused && (
        <div style={pauseIndicatorStyle}>⏸</div>
      )}

      {/* Channel switch OSD */}
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

// --- Helpers (kept as-is) ---

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

// --- Styles ---

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
