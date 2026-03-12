import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { Bell, Settings2, Trash2 } from "lucide-react";

import { useIndexFocusGroup } from "../../lib/focusScope";
import { t, type Locale } from "../../lib/i18n";
import { useTvViewEvents, useViewActivity } from "../../lib/tvEvents";
import { TvIntent } from "../../lib/tvInput";

interface Props {
  locale: Locale;
}

type DemoActionId =
  | "primary"
  | "secondary"
  | "danger"
  | "icon"
  | "chip-all"
  | "chip-enabled"
  | "chip-error"
  | "row-menu"
  | "modal-open";
type ModalActionId = "refresh" | "edit" | "delete" | "close";

const demoActionOrder: DemoActionId[] = [
  "primary",
  "secondary",
  "danger",
  "icon",
  "chip-all",
  "chip-enabled",
  "chip-error",
  "row-menu",
  "modal-open",
];
const modalActionOrder: ModalActionId[] = ["refresh", "edit", "delete", "close"];

export function DevComponentsView({ locale }: Props) {
  const { isKeyboardContentActive } = useViewActivity("dev-components");
  const [showModal, setShowModal] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [focusedModalIndex, setFocusedModalIndex] = useState(0);
  const demoRefs = useRef<Record<DemoActionId, HTMLButtonElement | null>>({
    primary: null,
    secondary: null,
    danger: null,
    icon: null,
    "chip-all": null,
    "chip-enabled": null,
    "chip-error": null,
    "row-menu": null,
    "modal-open": null,
  });
  const modalRefs = useRef<Record<ModalActionId, HTMLButtonElement | null>>({
    refresh: null,
    edit: null,
    delete: null,
    close: null,
  });

  const demoFocusGroup = useIndexFocusGroup({
    itemCount: demoActionOrder.length,
    currentIndex: focusedIndex,
    setCurrentIndex: setFocusedIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  const modalFocusGroup = useIndexFocusGroup({
    itemCount: modalActionOrder.length,
    currentIndex: focusedModalIndex,
    setCurrentIndex: setFocusedModalIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });

  const focusDemoItem = (index: number) => {
    const wrapped = ((index % demoActionOrder.length) + demoActionOrder.length) % demoActionOrder.length;
    setFocusedIndex(wrapped);
    demoRefs.current[demoActionOrder[wrapped]]?.focus();
  };

  const focusModalItem = (index: number) => {
    const wrapped = ((index % modalActionOrder.length) + modalActionOrder.length) % modalActionOrder.length;
    setFocusedModalIndex(wrapped);
    modalRefs.current[modalActionOrder[wrapped]]?.focus();
  };

  const closeModal = () => {
    setShowModal(false);
    window.setTimeout(() => demoRefs.current["modal-open"]?.focus(), 0);
  };

  const triggerDemoAction = (id: DemoActionId) => {
    if (id === "modal-open" || id === "row-menu" || id === "icon") {
      setFocusedModalIndex(0);
      setShowModal(true);
    }
  };

  const triggerModalAction = (_id: ModalActionId) => {
    if (_id === "close") {
      closeModal();
    }
  };

  useEffect(() => {
    if (!isKeyboardContentActive) return;
    if (showModal) {
      window.setTimeout(() => focusModalItem(focusedModalIndex), 0);
      return;
    }
    window.setTimeout(() => focusDemoItem(focusedIndex), 0);
  }, [focusedIndex, focusedModalIndex, isKeyboardContentActive, showModal]);

  useTvViewEvents({
    views: "dev-components",
    onFocusContent: () => {
      if (showModal) {
        focusModalItem(focusedModalIndex);
        return;
      }
      focusDemoItem(focusedIndex);
    },
    onContentKey: (event) => {
      if (event.defaultPrevented) return;
      const intent = event.detail.intent;
      if (!intent) return;

      if (showModal) {
        if (intent === TvIntent.MoveUp || intent === TvIntent.MoveDown) {
          event.preventDefault();
          const result = modalFocusGroup.handleIntent(intent);
          if (result.handled) {
            focusModalItem(result.next);
          }
          return;
        }
        if (intent === TvIntent.Back || intent === TvIntent.MoveLeft) {
          event.preventDefault();
          closeModal();
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          triggerModalAction(modalActionOrder[focusedModalIndex] ?? "close");
        }
        return;
      }

      if (intent === TvIntent.MoveUp || intent === TvIntent.MoveDown) {
        event.preventDefault();
        const result = demoFocusGroup.handleIntent(intent);
        if (result.handled) {
          focusDemoItem(result.next);
        }
        return;
      }

      if (intent === TvIntent.Confirm) {
        event.preventDefault();
        triggerDemoAction(demoActionOrder[focusedIndex] ?? "primary");
      }
    },
  });

  const activeDemoId = useMemo(() => demoActionOrder[focusedIndex], [focusedIndex]);
  const activeModalId = useMemo(() => modalActionOrder[focusedModalIndex], [focusedModalIndex]);

  return (
    <div style={pageStyle}>
      <div style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>{t(locale, "devComponents.eyebrow")}</div>
          <h2 style={titleStyle}>{t(locale, "devComponents.title")}</h2>
          <p style={subtitleStyle}>{t(locale, "devComponents.subtitle")}</p>
        </div>
      </div>

      <Section title={t(locale, "devComponents.section.buttons")}>
        <div style={rowStyle}>
          <DemoButton
            id="primary"
            label={t(locale, "devComponents.button.primary")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "primary"}
          />
          <DemoButton
            id="secondary"
            label={t(locale, "devComponents.button.secondary")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "secondary"}
            style={secondaryButtonStyle}
          />
          <DemoButton
            id="danger"
            label={t(locale, "devComponents.button.danger")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "danger"}
            style={dangerButtonStyle}
          />
          <DemoButton
            id="icon"
            label={t(locale, "devComponents.button.icon")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "icon"}
            iconOnly
            style={iconButtonStyle}
            onClick={() => triggerDemoAction("icon")}
          >
            <Settings2 size={16} />
          </DemoButton>
        </div>
      </Section>

      <Section title={t(locale, "devComponents.section.chips")}>
        <div style={rowStyle}>
          <DemoButton
            id="chip-all"
            label={t(locale, "sources.filter.all")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "chip-all"}
            style={chipActiveStyle}
          />
          <DemoButton
            id="chip-enabled"
            label={t(locale, "sources.filter.enabled")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "chip-enabled"}
            style={chipStyle}
          />
          <DemoButton
            id="chip-error"
            label={t(locale, "sources.filter.error")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "chip-error"}
            style={chipStyle}
          />
        </div>
      </Section>

      <Section title={t(locale, "devComponents.section.status")}>
        <div style={stackStyle}>
          <div style={bannerSuccessStyle}>{t(locale, "sources.message.sourceUpdated")}</div>
          <div style={bannerErrorStyle}>{t(locale, "sources.status.lastError", { error: "HTTP 404" })}</div>
          <div style={rowStyle}>
            <StatusBadge style={healthyBadgeStyle}>{t(locale, "sources.status.healthy")}</StatusBadge>
            <StatusBadge style={backoffBadgeStyle}>{t(locale, "sources.status.backoff")}</StatusBadge>
            <StatusBadge style={errorBadgeStyle}>{t(locale, "sources.status.error")}</StatusBadge>
          </div>
        </div>
      </Section>

      <Section title={t(locale, "devComponents.section.rows")}>
        <div style={tableCardStyle}>
          <div style={tableHeaderStyle}>
            <span>{t(locale, "sources.table.name")}</span>
            <span>{t(locale, "sources.table.status")}</span>
            <span aria-hidden="true" />
          </div>
          <div style={tableRowStyle}>
            <div>
              <div style={rowTitleStyle}>Demo IPTV</div>
              <div style={rowMetaStyle}>M3U · https://example.com/playlist.m3u</div>
            </div>
            <StatusBadge style={healthyBadgeStyle}>{t(locale, "sources.status.healthy")}</StatusBadge>
            <DemoButton
              id="row-menu"
              label={t(locale, "sources.action.openMenuAria")}
              refMap={demoRefs}
              active={isKeyboardContentActive && !showModal && activeDemoId === "row-menu"}
              iconOnly
              style={iconButtonStyle}
              onClick={() => triggerDemoAction("row-menu")}
            >
              <Settings2 size={16} />
            </DemoButton>
          </div>
        </div>
      </Section>

      <Section title={t(locale, "devComponents.section.modal")}>
        <div style={rowStyle}>
          <DemoButton
            id="modal-open"
            label={t(locale, "devComponents.modal.open")}
            refMap={demoRefs}
            active={isKeyboardContentActive && !showModal && activeDemoId === "modal-open"}
            onClick={() => triggerDemoAction("modal-open")}
          />
        </div>
      </Section>

      {showModal ? (
        <div style={overlayStyle} onClick={closeModal}>
          <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <div style={modalTitleStyle}>{t(locale, "devComponents.modal.title")}</div>
                <div style={modalTextStyle}>{t(locale, "devComponents.modal.body")}</div>
              </div>
              <Bell size={18} color="var(--accent)" />
            </div>
            <div style={stackStyle}>
              <div style={metaPanelStyle}>
                <div style={metaRowStyle}>
                  <span>{t(locale, "sources.table.type")}</span>
                  <strong>M3U</strong>
                </div>
                <div style={metaRowStyle}>
                  <span>{t(locale, "sources.table.status")}</span>
                  <strong>{t(locale, "sources.status.healthy")}</strong>
                </div>
              </div>
              <div style={actionListStyle}>
                <ModalButton
                  id="refresh"
                  label={t(locale, "sources.action.refresh")}
                  refMap={modalRefs}
                  active={activeModalId === "refresh"}
                />
                <ModalButton
                  id="edit"
                  label={t(locale, "sources.action.edit")}
                  refMap={modalRefs}
                  active={activeModalId === "edit"}
                />
                <ModalButton
                  id="delete"
                  label={t(locale, "sources.action.delete")}
                  refMap={modalRefs}
                  active={activeModalId === "delete"}
                  style={dangerButtonStyle}
                >
                  <Trash2 size={16} />
                </ModalButton>
              </div>
            </div>
            <div style={modalFooterStyle}>
              <ModalButton
                id="close"
                label={t(locale, "sources.edit.cancel")}
                refMap={modalRefs}
                active={activeModalId === "close"}
                style={secondaryButtonStyle}
                onClick={closeModal}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DemoButton({
  id,
  label,
  refMap,
  active,
  style,
  iconOnly = false,
  onClick,
  children,
}: {
  id: DemoActionId;
  label: string;
  refMap: MutableRefObject<Record<DemoActionId, HTMLButtonElement | null>>;
  active: boolean;
  style?: CSSProperties;
  iconOnly?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      ref={(node) => {
        refMap.current[id] = node;
      }}
      type="button"
      data-tv-focusable={active ? "true" : undefined}
      onFocus={() => undefined}
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
      style={{
        ...(style ?? primaryButtonStyle),
        ...(active ? focusRingStyle : null),
      }}
    >
      {children ?? label}
    </button>
  );
}

function ModalButton({
  id,
  label,
  refMap,
  active,
  style,
  onClick,
  children,
}: {
  id: ModalActionId;
  label: string;
  refMap: MutableRefObject<Record<ModalActionId, HTMLButtonElement | null>>;
  active: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      ref={(node) => {
        refMap.current[id] = node;
      }}
      type="button"
      data-tv-focusable={active ? "true" : undefined}
      onClick={onClick}
      style={{
        ...(style ?? secondaryButtonStyle),
        ...(active ? focusRingStyle : null),
      }}
    >
      {children ?? label}
      {children ? <span>{label}</span> : null}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      {children}
    </section>
  );
}

function StatusBadge({
  children,
  style,
}: {
  children: React.ReactNode;
  style: CSSProperties;
}) {
  return <span style={{ ...statusBadgeStyle, ...style }}>{children}</span>;
}

const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 24,
  overflowY: "auto",
};

const heroStyle: CSSProperties = {
  padding: 20,
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "linear-gradient(135deg, rgba(11, 107, 94, 0.16), rgba(15, 23, 42, 0.12))",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  color: "var(--text-secondary)",
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 28,
};

const subtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  maxWidth: 720,
};

const sectionStyle: CSSProperties = {
  padding: 20,
  borderRadius: 12,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-secondary)",
};

const sectionTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 16,
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 16px",
  border: "none",
  borderRadius: 8,
  backgroundColor: "var(--accent)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

const dangerButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: "#7f1d1d",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const iconButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const chipStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  cursor: "pointer",
};

const chipActiveStyle: CSSProperties = {
  ...chipStyle,
  backgroundColor: "var(--accent)",
  color: "#fff",
};

const bannerSuccessStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  backgroundColor: "#065f4620",
  color: "#4ade80",
};

const bannerErrorStyle: CSSProperties = {
  ...bannerSuccessStyle,
  backgroundColor: "#ef444420",
  color: "#ef4444",
};

const statusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
};

const healthyBadgeStyle: CSSProperties = {
  backgroundColor: "#14532d",
  color: "#bbf7d0",
};

const backoffBadgeStyle: CSSProperties = {
  backgroundColor: "#78350f",
  color: "#fde68a",
};

const errorBadgeStyle: CSSProperties = {
  backgroundColor: "#7f1d1d",
  color: "#fecaca",
};

const tableCardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  overflow: "hidden",
};

const tableHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr auto 48px",
  gap: 12,
  padding: "10px 12px",
  fontSize: 12,
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border)",
};

const tableRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr auto 48px",
  gap: 12,
  alignItems: "center",
  padding: "12px",
  backgroundColor: "var(--bg-primary)",
};

const rowTitleStyle: CSSProperties = {
  fontWeight: 700,
  marginBottom: 4,
};

const rowMetaStyle: CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 12,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1200,
};

const modalCardStyle: CSSProperties = {
  width: 520,
  maxWidth: "90vw",
  borderRadius: 12,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-secondary)",
  padding: 20,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};

const modalTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 8,
};

const modalTextStyle: CSSProperties = {
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const metaPanelStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 12,
  backgroundColor: "var(--bg-primary)",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "var(--text-secondary)",
};

const actionListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 16,
};

const focusRingStyle: CSSProperties = {
  boxShadow: "0 0 0 2px rgba(255,255,255,0.2), inset 0 0 0 1px #fff",
  outline: "none",
};
