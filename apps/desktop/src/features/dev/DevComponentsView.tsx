import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { Bell, Settings2, Trash2 } from "lucide-react";

import { useIndexFocusGroup } from "../../lib/focusScope";
import { t, type Locale } from "../../lib/i18n";
import { useTvViewEvents, useViewActivity } from "../../lib/tvEvents";
import { TvIntent } from "../../lib/tvInput";
import {
  colorTokens,
  elevationTokens,
  radiusTokens,
  spacingTokens,
  typographyTokens,
  type DesignTokenItem,
} from "../../styles/designTokens";
import { Badge, Button, ChipButton, Modal, Notice, Panel } from "../../components/ui";

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

      <Section title="Design Tokens">
        <div style={tokenSectionStackStyle}>
          <TokenGroup title="Colors" tokens={colorTokens} swatch />
          <TokenGroup title="Typography" tokens={typographyTokens} />
          <TokenGroup title="Radius" tokens={radiusTokens} preview="radius" />
          <TokenGroup title="Spacing" tokens={spacingTokens} preview="spacing" />
          <TokenGroup title="Elevation" tokens={elevationTokens} preview="shadow" />
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
          <Notice tone="success" style={bannerSuccessStyle}>{t(locale, "sources.message.sourceUpdated")}</Notice>
          <Notice tone="danger" style={bannerErrorStyle}>{t(locale, "sources.status.lastError", { error: "HTTP 404" })}</Notice>
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
        <Modal onDismiss={closeModal} style={modalCardStyle}>
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
        </Modal>
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
  const isChip = style === chipStyle || style === chipActiveStyle;

  return (
    isChip ? (
      <ChipButton
        ref={(node) => {
          refMap.current[id] = node;
        }}
        type="button"
        data-tv-focusable={active ? "true" : undefined}
        onFocus={() => undefined}
        onClick={onClick}
        aria-label={iconOnly ? label : undefined}
        active={active || style === chipActiveStyle}
      >
        {children ?? label}
      </ChipButton>
    ) : (
      <Button
        ref={(node) => {
          refMap.current[id] = node;
        }}
        type="button"
        data-tv-focusable={active ? "true" : undefined}
        onFocus={() => undefined}
        onClick={onClick}
        aria-label={iconOnly ? label : undefined}
        variant={style === secondaryButtonStyle ? "secondary" : style === dangerButtonStyle ? "danger" : "primary"}
        size={iconOnly ? "icon" : "md"}
        active={active}
        style={style === secondaryButtonStyle || style === dangerButtonStyle || style === primaryButtonStyle ? undefined : style}
      >
        {children ?? label}
      </Button>
    )
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
    <Button
      ref={(node) => {
        refMap.current[id] = node;
      }}
      type="button"
      data-tv-focusable={active ? "true" : undefined}
      onClick={onClick}
      variant={style === dangerButtonStyle ? "danger" : style === secondaryButtonStyle ? "secondary" : "secondary"}
      active={active}
      style={{
        ...(style === dangerButtonStyle || style === secondaryButtonStyle ? undefined : style),
        justifyContent: "flex-start",
        width: "100%",
      }}
    >
      {children ?? label}
      {children ? <span>{label}</span> : null}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel as="section" style={sectionStyle}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      {children}
    </Panel>
  );
}

function TokenGroup({
  title,
  tokens,
  swatch = false,
  preview,
}: {
  title: string;
  tokens: DesignTokenItem[];
  swatch?: boolean;
  preview?: "radius" | "spacing" | "shadow";
}) {
  return (
    <div style={tokenGroupStyle}>
      <div style={tokenGroupHeaderStyle}>
        <h4 style={tokenGroupTitleStyle}>{title}</h4>
        <span style={tokenGroupCountStyle}>{tokens.length} tokens</span>
      </div>
      <div style={tokenGridStyle}>
        {tokens.map((token) => (
          <div key={token.name} style={tokenCardStyle}>
            {swatch ? <div style={{ ...tokenSwatchStyle, background: `var(${token.name})` }} /> : null}
            {preview === "radius" ? <div style={{ ...radiusPreviewStyle, borderRadius: `var(${token.name})` }} /> : null}
            {preview === "spacing" ? <div style={{ width: `var(${token.name})`, ...spacingPreviewStyle }} /> : null}
            {preview === "shadow" ? <div style={{ ...shadowPreviewStyle, boxShadow: `var(${token.name})` }} /> : null}
            <div style={tokenNameStyle}>{token.name}</div>
            <div style={tokenValueStyle}>{token.value}</div>
            <div style={tokenUsageStyle}>{token.usage}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({
  children,
  style,
}: {
  children: React.ReactNode;
  style: CSSProperties;
}) {
  return <Badge style={{ ...statusBadgeStyle, ...style }}>{children}</Badge>;
}

const pageStyle: CSSProperties = {
  padding: "var(--space-6)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-6)",
  overflowY: "auto",
};

const heroStyle: CSSProperties = {
  padding: "var(--space-5)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--color-border-strong)",
  background:
    "linear-gradient(135deg, rgba(45, 140, 255, 0.18), rgba(18, 185, 129, 0.12) 52%, rgba(7, 16, 24, 0.16))",
  boxShadow: "var(--shadow-elevation-1)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: "var(--font-size-sm)",
  textTransform: "uppercase",
  letterSpacing: "var(--letter-spacing-wide)",
  color: "var(--text-secondary)",
  marginBottom: "var(--space-2)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-2xl)",
  lineHeight: "var(--line-height-tight)",
  letterSpacing: "var(--letter-spacing-tight)",
};

const subtitleStyle: CSSProperties = {
  margin: "var(--space-2) 0 0",
  color: "var(--text-secondary)",
  lineHeight: "var(--line-height-relaxed)",
  maxWidth: 720,
};

const sectionStyle: CSSProperties = {};

const sectionTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "var(--space-4)",
  fontSize: "var(--font-size-lg)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "var(--space-3)",
  flexWrap: "wrap",
  alignItems: "center",
};

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const primaryButtonStyle: CSSProperties = {};

const secondaryButtonStyle: CSSProperties = {
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-primary)",
};

const dangerButtonStyle: CSSProperties = {
  backgroundColor: "var(--color-fill-danger)",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

const iconButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "var(--radius-pill)",
  color: "var(--text-secondary)",
};

const chipStyle: CSSProperties = {};

const chipActiveStyle: CSSProperties = {
  backgroundColor: "var(--color-fill-brand)",
  color: "var(--color-white)",
};

const bannerSuccessStyle: CSSProperties = {
  padding: 0,
};

const bannerErrorStyle: CSSProperties = {
  padding: 0,
};

const statusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-semibold)",
};

const healthyBadgeStyle: CSSProperties = {
  backgroundColor: "rgba(18, 185, 129, 0.22)",
  color: "#baf7df",
};

const backoffBadgeStyle: CSSProperties = {
  backgroundColor: "rgba(245, 158, 11, 0.22)",
  color: "#ffe19d",
};

const errorBadgeStyle: CSSProperties = {
  backgroundColor: "rgba(239, 68, 68, 0.22)",
  color: "#ffc5c5",
};

const tableCardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
};

const tableHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr auto 48px",
  gap: "var(--space-3)",
  padding: "10px 12px",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border)",
};

const tableRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr auto 48px",
  gap: "var(--space-3)",
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
  fontSize: "var(--font-size-sm)",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "var(--color-bg-overlay)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1200,
};

const modalCardStyle: CSSProperties = {
  width: 520,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBottom: "var(--space-4)",
};

const modalTitleStyle: CSSProperties = {
  fontSize: "var(--font-size-xl)",
  fontWeight: "var(--font-weight-bold)",
  marginBottom: "var(--space-2)",
};

const modalTextStyle: CSSProperties = {
  color: "var(--text-secondary)",
  lineHeight: "var(--line-height-normal)",
};

const metaPanelStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  padding: 12,
  backgroundColor: "var(--bg-primary)",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  color: "var(--text-secondary)",
};

const actionListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "var(--space-4)",
};

const focusRingStyle: CSSProperties = {};

const tokenSectionStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-5)",
};

const tokenGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const tokenGroupHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
};

const tokenGroupTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
};

const tokenGroupCountStyle: CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
};

const tokenGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "var(--space-3)",
};

const tokenCardStyle: CSSProperties = {
  padding: "var(--space-4)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  backgroundColor: "var(--color-bg-canvas)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const tokenSwatchStyle: CSSProperties = {
  height: 56,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-border-strong)",
};

const radiusPreviewStyle: CSSProperties = {
  width: 72,
  height: 56,
  background: "linear-gradient(135deg, rgba(45, 140, 255, 0.9), rgba(18, 185, 129, 0.9))",
};

const spacingPreviewStyle: CSSProperties = {
  height: 10,
  borderRadius: "var(--radius-pill)",
  backgroundColor: "var(--color-fill-brand)",
};

const shadowPreviewStyle: CSSProperties = {
  height: 56,
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--color-bg-elevated)",
};

const tokenNameStyle: CSSProperties = {
  fontFamily: "var(--font-family-mono)",
  fontSize: "var(--font-size-sm)",
  color: "var(--color-brand-300)",
};

const tokenValueStyle: CSSProperties = {
  fontSize: "var(--font-size-md)",
  fontWeight: "var(--font-weight-semibold)",
  color: "var(--text-primary)",
};

const tokenUsageStyle: CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  lineHeight: "var(--line-height-normal)",
};
