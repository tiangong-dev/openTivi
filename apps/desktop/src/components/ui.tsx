import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
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
  disabled?: boolean;
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
  disabled?: boolean;
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
        color: "var(--muted-foreground)",
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
  {
    active = false,
    disabled = false,
    variant = "primary",
    size = "md",
    style,
    onFocus,
    onBlur,
    onMouseEnter,
    onMouseLeave,
    onMouseDown,
    ...props
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const mouseDownRef = useRef(false);

  const isHighlight = variant === "primary" || variant === "danger";

  const hoverStyle: CSSProperties | null = hovered && !disabled
    ? isHighlight
      ? { filter: "brightness(1.15)" }
      : { backgroundColor: "var(--accent)" }
    : null;

  return (
    <button
      ref={ref}
      disabled={disabled}
      style={{
        ...buttonBaseStyle,
        ...buttonSizeStyles[size],
        ...buttonVariantStyles[variant],
        ...(active ? buttonActiveStyle : null),
        ...(focused ? buttonFocusStyle : null),
        ...hoverStyle,
        ...(disabled ? buttonDisabledStyle : null),
        ...style,
      }}
      onMouseDown={(e) => {
        mouseDownRef.current = true;
        onMouseDown?.(e);
      }}
      onFocus={(e) => {
        if (!mouseDownRef.current) setFocused(true);
        mouseDownRef.current = false;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        mouseDownRef.current = false;
        onBlur?.(e);
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
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
        backgroundColor: "var(--card)",
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
      role={tone === "danger" ? "alert" : "status"}
      style={{
        ...noticeToneStyles[tone],
        padding: "var(--space-3) var(--space-3)",
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
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const getFocusable = () =>
      Array.from(card.querySelectorAll<HTMLElement>(focusableSelector));

    const first = getFocusable()[0];
    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismiss?.();
        return;
      }
      if (e.key === "Tab") {
        const items = getFocusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    card.addEventListener("keydown", handleKeyDown);
    return () => card.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return (
    <div
      style={modalOverlayStyle}
      onClick={onDismiss}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
        color: "var(--muted-foreground)",
        textAlign: "center",
        ...style,
      }}
      {...props}
    >
      {heading ? <div style={{ fontSize: "var(--font-size-lg)", color: "var(--foreground)", marginBottom: "var(--space-2)" }}>{heading}</div> : null}
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
        color: "var(--muted-foreground)",
        ...style,
      }}
    >
      {label}
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { invalid = false, disabled = false, style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid ? "true" : undefined}
      style={{
        padding: "var(--space-2) var(--space-3)",
        backgroundColor: "var(--secondary)",
        border: `1px solid ${invalid ? "var(--live)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        color: "var(--foreground)",
        fontSize: "var(--font-size-body)",
        outline: "none",
        ...(focused ? inputFocusStyle : null),
        ...(disabled ? inputDisabledStyle : null),
        ...style,
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
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
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  secondary: {
    backgroundColor: "var(--secondary)",
    color: "var(--secondary-foreground)",
    borderColor: "var(--border)",
  },
  danger: {
    backgroundColor: "var(--destructive)",
    color: "var(--destructive-foreground)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  nav: {
    width: "100%",
    justifyContent: "flex-start",
    padding: "10px 16px",
    backgroundColor: "transparent",
    color: "var(--foreground)",
    borderColor: "transparent",
    fontWeight: "var(--font-weight-medium)",
  },
};

const buttonActiveStyle: CSSProperties = {
  boxShadow: "var(--shadow-focus-ring)",
};

const buttonFocusStyle: CSSProperties = {
  boxShadow: "0 0 0 2px var(--ring)",
};

const buttonDisabledStyle: CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
  pointerEvents: "none",
};

const inputFocusStyle: CSSProperties = {
  boxShadow: "0 0 0 2px var(--ring)",
};

const inputDisabledStyle: CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const noticeToneStyles: Record<Tone, CSSProperties> = {
  default: {
    backgroundColor: "var(--popover)",
    color: "var(--foreground)",
  },
  success: {
    backgroundColor: "var(--success-soft)",
    color: "var(--success)",
  },
  danger: {
    backgroundColor: "var(--destructive-soft)",
    color: "var(--live)",
  },
  warning: {
    backgroundColor: "var(--warning-soft)",
    color: "var(--warning)",
  },
};

const badgeToneStyles: Record<Tone, CSSProperties> = {
  default: {
    backgroundColor: "var(--muted)",
    color: "var(--foreground)",
  },
  success: {
    backgroundColor: "var(--success-soft)",
    color: "var(--success)",
  },
  danger: {
    backgroundColor: "var(--destructive-soft)",
    color: "var(--live)",
  },
  warning: {
    backgroundColor: "var(--warning-soft)",
    color: "var(--warning)",
  },
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "var(--overlay-scrim)",
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
  border: "1px solid var(--popover)",
  backgroundColor: "var(--card)",
  padding: "var(--space-5)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};
