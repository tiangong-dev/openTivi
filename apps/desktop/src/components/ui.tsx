import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

type Tone = "default" | "success" | "danger" | "warning";
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "nav";
type ButtonSize = "sm" | "md" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  padding?: CSSProperties["padding"];
  as?: "div" | "section";
}

interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  children: ReactNode;
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onDismiss?: () => void;
  width?: number | string;
}

interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  heading?: ReactNode;
  description?: ReactNode;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function PageView({
  children,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        height: "100%",
        width: "100%",
        overflowY: "auto",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionLabel({
  children,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{
        fontSize: "var(--font-size-sm)",
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "var(--letter-spacing-wide)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { active = false, variant = "primary", size = "md", style, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      style={{
        ...buttonBaseStyle,
        ...buttonSizeStyles[size],
        ...buttonVariantStyles[variant],
        ...(active ? buttonActiveStyle : null),
        ...style,
      }}
      {...props}
    />
  );
});

export const ChipButton = forwardRef<HTMLButtonElement, ButtonProps>(function ChipButton(
  { active = false, style, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={active ? "primary" : "secondary"}
      size="sm"
      active={active}
      style={{
        borderRadius: "var(--radius-pill)",
        minHeight: 32,
        ...style,
      }}
      {...props}
    />
  );
});

export function Panel({
  children,
  padding = "var(--space-5)",
  style,
  as = "div",
  ...props
}: PanelProps) {
  const Element = as;
  return (
    <Element
      style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        backgroundColor: "var(--bg-secondary)",
        boxShadow: "var(--shadow-elevation-1)",
        padding,
        ...style,
      }}
      {...props}
    >
      {children}
    </Element>
  );
}

export function Notice({ tone = "default", children, style, ...props }: NoticeProps) {
  return (
    <div
      style={{
        ...noticeToneStyles[tone],
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--font-size-md)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ tone = "default", children, style, ...props }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-semibold)",
        ...badgeToneStyles[tone],
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export function Modal({
  children,
  onDismiss,
  width = 520,
  style,
  ...props
}: ModalProps) {
  return (
    <div
      style={modalOverlayStyle}
      onClick={onDismiss}
    >
      <div
        style={{
          ...modalCardStyle,
          width,
          ...style,
        }}
        onClick={(event) => event.stopPropagation()}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  heading,
  description,
  children,
  style,
  ...props
}: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "var(--space-8) var(--space-4)",
        color: "var(--text-secondary)",
        textAlign: "center",
        ...style,
      }}
      {...props}
    >
      {heading ? <div style={{ fontSize: "var(--font-size-lg)", color: "var(--text-primary)", marginBottom: "var(--space-2)" }}>{heading}</div> : null}
      {description ? <div style={{ lineHeight: "var(--line-height-normal)" }}>{description}</div> : null}
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  style,
}: {
  label: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        fontSize: "var(--font-size-sm)",
        color: "var(--text-secondary)",
        ...style,
      }}
    >
      {label}
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { invalid = false, style, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      style={{
        padding: "8px 10px",
        backgroundColor: "var(--bg-tertiary)",
        border: `1px solid ${invalid ? "var(--danger)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        color: "var(--text-primary)",
        fontSize: "var(--font-size-md)",
        outline: "none",
        ...style,
      }}
      {...props}
    />
  );
});

const buttonBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  fontSize: "var(--font-size-md)",
  fontWeight: "var(--font-weight-semibold)",
  lineHeight: "var(--line-height-tight)",
  textDecoration: "none",
  outline: "none",
  whiteSpace: "nowrap",
};

const buttonSizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: {
    minHeight: 30,
    padding: "6px 10px",
    fontSize: "var(--font-size-sm)",
  },
  md: {
    minHeight: 36,
    padding: "8px 16px",
  },
  icon: {
    width: 36,
    height: 36,
    padding: 0,
    borderRadius: "var(--radius-pill)",
  },
};

const buttonVariantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: "var(--accent)",
    color: "var(--color-white)",
  },
  secondary: {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    borderColor: "var(--border)",
  },
  danger: {
    backgroundColor: "var(--color-fill-danger)",
    color: "var(--color-white)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--text-primary)",
    borderColor: "var(--border)",
  },
  nav: {
    width: "100%",
    justifyContent: "flex-start",
    padding: "10px 16px",
    backgroundColor: "transparent",
    color: "var(--text-primary)",
    borderColor: "transparent",
    fontWeight: "var(--font-weight-medium)",
  },
};

const buttonActiveStyle: CSSProperties = {
  boxShadow: "var(--shadow-focus-ring)",
};

const noticeToneStyles: Record<Tone, CSSProperties> = {
  default: {
    backgroundColor: "var(--color-bg-elevated)",
    color: "var(--text-primary)",
  },
  success: {
    backgroundColor: "var(--color-fill-success-soft)",
    color: "#7af0c2",
  },
  danger: {
    backgroundColor: "var(--color-fill-danger-soft)",
    color: "#ff8b8b",
  },
  warning: {
    backgroundColor: "var(--color-fill-warning-soft)",
    color: "#ffe19d",
  },
};

const badgeToneStyles: Record<Tone, CSSProperties> = {
  default: {
    backgroundColor: "rgba(107, 124, 147, 0.22)",
    color: "var(--color-neutral-100)",
  },
  success: {
    backgroundColor: "rgba(18, 185, 129, 0.22)",
    color: "#baf7df",
  },
  danger: {
    backgroundColor: "rgba(239, 68, 68, 0.22)",
    color: "#ffc5c5",
  },
  warning: {
    backgroundColor: "rgba(245, 158, 11, 0.22)",
    color: "#ffe19d",
  },
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "var(--color-bg-overlay)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1200,
};

const modalCardStyle: CSSProperties = {
  maxWidth: "90vw",
  maxHeight: "90vh",
  overflowY: "auto",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--color-border-strong)",
  backgroundColor: "var(--color-bg-surface)",
  padding: "var(--space-5)",
  boxShadow: "var(--shadow-elevation-2)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};
