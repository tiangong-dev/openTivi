import type { CSSProperties } from "react";

export const containerStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  backgroundColor: "#000",
  overflow: "hidden",
  cursor: "default",
};

export const videoStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  backgroundColor: "#000",
};

export const topBarStyle: CSSProperties = {
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

export const bottomBarStyle: CSSProperties = {
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

export const guidePanelStyle: CSSProperties = {
  position: "absolute",
  top: 72,
  right: 12,
  bottom: 92,
  width: 340,
  maxWidth: "40vw",
  borderRadius: 8,
  border: "1px solid var(--border)",
  backgroundColor: "rgba(10,10,10,0.82)",
  backdropFilter: "blur(8px)",
  color: "var(--text-primary)",
  display: "flex",
  flexDirection: "column",
  padding: 10,
  gap: 8,
  zIndex: 12,
};

export const channelListPanelStyle: CSSProperties = {
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

export const guideHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 13,
  fontWeight: 600,
};

export const guideHintStyle: CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 12,
};

export const guideItemStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 8px",
};

export const channelListItemStyle: CSSProperties = {
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

export const channelProgramNowStyle: CSSProperties = {
  fontSize: 11,
  color: "#cbd5e1",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const channelProgramNextStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const overlayBtnStyle: CSSProperties = {
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

export const progressTrackStyle: CSSProperties = {
  width: "100%",
  height: 3,
  backgroundColor: "rgba(255,255,255,0.2)",
  borderRadius: 2,
  marginTop: 8,
  overflow: "hidden",
};

export const progressBarStyle: CSSProperties = {
  height: "100%",
  backgroundColor: "#3b82f6",
  borderRadius: 2,
  transition: "width 0.5s ease",
};

export const networkSpeedStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "rgba(255,255,255,0.75)",
};

export const errorOverlayStyle: CSSProperties = {
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

export const pauseIndicatorStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  fontSize: 64,
  color: "rgba(255,255,255,0.7)",
  pointerEvents: "none",
  zIndex: 15,
};

export const osdStyle: CSSProperties = {
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
