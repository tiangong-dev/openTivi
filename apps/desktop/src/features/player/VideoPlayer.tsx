import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel } from "../../types/api";

interface Props {
  channel: Channel;
  onClose: () => void;
}

export function VideoPlayer({ channel, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proxyPort, setProxyPort] = useState<number | null>(null);

  useEffect(() => {
    tauriInvoke<number>("get_proxy_port").then(setProxyPort);
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

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600 }}>{channel.name}</span>
        <button onClick={onClose} style={closeBtnStyle}>✕</button>
      </div>
      {error && <div style={errorStyle}>{error}</div>}
      <video ref={videoRef} style={videoStyle} controls autoPlay />
    </div>
  );
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
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#000",
  flex: 1,
  minHeight: 0,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  backgroundColor: "var(--bg-secondary)",
  fontSize: 14,
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: 16,
};

const errorStyle: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "#ef444430",
  color: "#ef4444",
  fontSize: 13,
};

const videoStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  minHeight: 0,
  backgroundColor: "#000",
};
