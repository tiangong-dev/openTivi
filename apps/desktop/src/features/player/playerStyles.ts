import type { CSSProperties } from "react";

export const containerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "var(--background)",
  overflow: "hidden",
  cursor: "default",
};

export const videoStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  backgroundColor: "var(--background)",
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
  background: "var(--player-gradient-top)",
  color: "var(--player-text)",
  transition: "opacity 0.3s ease",
  zIndex: 10,
};

export const bottomBarStyle: CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  padding: "16px 20px",
  background: "var(--player-gradient-bottom)",
  color: "var(--player-text)",
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
  backgroundColor: "var(--player-panel)",
  backdropFilter: "blur(8px)",
  color: "var(--foreground)",
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
  backgroundColor: "var(--player-panel-alt)",
  backdropFilter: "blur(8px)",
  color: "var(--foreground)",
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
  fontSize: "var(--font-size-small)",
  fontWeight: "var(--font-weight-semibold)",
};

export const guideHintStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: "var(--font-size-caption)",
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
  color: "var(--foreground)",
  padding: "7px 8px",
  fontSize: "var(--font-size-small)",
  cursor: "pointer",
};

export const channelProgramNowStyle: CSSProperties = {
  fontSize: "var(--font-size-overline)",
  color: "var(--muted-foreground)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const channelProgramNextStyle: CSSProperties = {
  fontSize: "var(--font-size-overline)",
  color: "var(--muted-foreground)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const overlayBtnStyle: CSSProperties = {
  background: "var(--player-btn)",
  backdropFilter: "blur(8px)",
  border: "none",
  color: "var(--player-text)",
  width: 36,
  height: 36,
  borderRadius: "50%",
  cursor: "pointer",
  fontSize: "var(--font-size-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const progressTrackStyle: CSSProperties = {
  width: "100%",
  height: 3,
  backgroundColor: "var(--player-track)",
  borderRadius: 2,
  marginTop: 8,
  overflow: "hidden",
};

export const progressBarStyle: CSSProperties = {
  height: "100%",
  backgroundColor: "var(--primary)",
  borderRadius: 2,
  transition: "width 0.5s ease",
};

export const networkSpeedStyle: CSSProperties = {
  marginTop: 6,
  fontSize: "var(--font-size-caption)",
  color: "var(--player-text-dim)",
};

export const errorOverlayStyle: CSSProperties = {
  position: "absolute",
  bottom: 80,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "10px 20px",
  backgroundColor: "var(--overlay-toast)",
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
  color: "var(--player-text-dim)",
  pointerEvents: "none",
  zIndex: 15,
};

export const osdStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
  color: "var(--player-text)",
  textShadow: "var(--player-text-shadow)",
  pointerEvents: "none",
  zIndex: 15,
  animation: "fadeIn 0.2s ease",
};
