import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";

import { t, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel, EpgProgram } from "../../types/api";

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
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    void tauriInvoke<number>("get_proxy_port").then(setProxyPort);
  }, []);

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
          setError(t(locale, "player.unsupportedStreamFormat"));
        }
      });
    }

    return cleanup;
  }, [channel.streamUrl, proxyPort, locale]);

  const attachHls = (video: HTMLVideoElement, url: string) => {
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setError(t(locale, "player.playbackErrorDetails", { details: data.details }));
        }
      });
      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      setError(t(locale, "player.hlsNotSupported"));
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
        setError(t(locale, "player.mpegtsPlaybackError"));
      });
      mpegtsRef.current = player;
    } else {
      setError(t(locale, "player.mpegtsNotSupported"));
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
  }, [channel.id, showOverlay]);

  useEffect(() => {
    if (error) setOverlayVisible(true);
  }, [error]);

  const switchChannel = useCallback(
    (direction: -1 | 1) => {
      if (channels.length === 0) return;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          if (showChannelListPanel) {
            setShowChannelListPanel(false);
          } else {
            onClose();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          setShowChannelListPanel(true);
          break;
        case "ArrowRight":
          e.preventDefault();
          setShowGuidePanel((v) => !v);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (showChannelListPanel) {
            setFocusedChannelIndex((i) => {
              if (channels.length === 0) return 0;
              return (i - 1 + channels.length) % channels.length;
            });
          } else {
            switchChannel(-1);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (showChannelListPanel) {
            setFocusedChannelIndex((i) => {
              if (channels.length === 0) return 0;
              return (i + 1) % channels.length;
            });
          } else {
            switchChannel(1);
          }
          break;
        case "Enter":
          if (showChannelListPanel && channels[focusedChannelIndex]) {
            e.preventDefault();
            onChannelChange(channels[focusedChannelIndex]);
            setShowChannelListPanel(false);
          }
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
            void document.exitFullscreen();
          } else {
            void containerRef.current?.requestFullscreen();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channels, focusedChannelIndex, onChannelChange, onClose, showChannelListPanel, switchChannel]);

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
            onClick={() => setShowChannelListPanel((v) => !v)}
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

      {epgNow && (
        <div
          style={{
            ...bottomBarStyle,
            opacity: overlayVisible ? 1 : 0,
            pointerEvents: overlayVisible ? "auto" : "none",
          }}
        >
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
              <span style={{ opacity: 0.5, fontSize: 12 }}>{formatTime(epgNext.startAt)}</span>
            </div>
          )}
        </div>
      )}

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
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setFocusedChannelIndex(idx);
                    onChannelChange(item);
                    setShowChannelListPanel(false);
                  }}
                  style={{
                    ...channelListItemStyle,
                    borderColor: isFocused ? "var(--accent)" : "var(--border)",
                    backgroundColor: isCurrent ? "#2563eb33" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <span style={{ opacity: 0.8, marginRight: 8, minWidth: 36, textAlign: "right" }}>
                    {item.channelNumber ?? idx + 1}
                  </span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>
                    {item.name}
                  </span>
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
  backgroundColor: "rgba(20,20,20,0.78)",
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
  alignItems: "center",
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text-primary)",
  padding: "6px 8px",
  fontSize: 13,
  cursor: "pointer",
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
