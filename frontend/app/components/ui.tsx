import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  useId,
  useMemo
} from "react";

import { Icon, type IconName } from "./icons";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";

export const inputClass = "input";

// ---------------- Button ----------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "lg";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: IconName;
    trailingIcon?: IconName;
  }
>(function Button(
  { variant = "secondary", size, icon, trailingIcon, children, className, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("btn", `btn-${variant}`, size && `btn-${size}`, focusRing, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "lg" ? 16 : 14} className="btn-icon" /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={14} className="btn-icon" /> : null}
    </button>
  );
});

// ---------------- Badge ----------------
type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent"
  | "outline"
  // legacy aliases
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "violet";

export function Badge({
  tone = "neutral",
  dot,
  pulse,
  children,
  className
}: {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
    accent: "badge-accent",
    outline: "badge-outline",
    green: "badge-success",
    amber: "badge-warning",
    red: "badge-danger",
    blue: "badge-info",
    violet: "badge-accent"
  };
  return (
    <span className={cx("badge", tones[tone], pulse && "badge-running", className)}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}

// ---------------- Status helpers ----------------
type StatusKey =
  | "completed"
  | "healthy"
  | "succeeded"
  | "ok"
  | "running"
  | "queued"
  | "pending"
  | "failed"
  | "error"
  | "needs"
  | "draft"
  | "paused"
  | "active"
  | "verified"
  | string;

const STATUS_MAP: Record<string, { tone: BadgeTone; dot?: boolean; label: string; pulse?: boolean }> = {
  completed: { tone: "success", dot: true, label: "Completed" },
  healthy: { tone: "success", dot: true, label: "Healthy" },
  succeeded: { tone: "success", dot: true, label: "Succeeded" },
  ok: { tone: "success", dot: true, label: "OK" },
  active: { tone: "success", dot: true, label: "Active" },
  verified: { tone: "success", dot: true, label: "Verified" },
  running: { tone: "warning", dot: true, label: "Running", pulse: true },
  queued: { tone: "info", dot: true, label: "Queued" },
  pending: { tone: "info", dot: true, label: "Pending" },
  failed: { tone: "danger", dot: true, label: "Failed" },
  error: { tone: "danger", dot: true, label: "Error" },
  needs: { tone: "warning", dot: true, label: "Needs review" },
  "needs review": { tone: "warning", dot: true, label: "Needs review" },
  draft: { tone: "outline", dot: true, label: "Draft" },
  paused: { tone: "outline", dot: true, label: "Paused" },
  new: { tone: "success", dot: true, label: "new" },
  changed: { tone: "warning", dot: true, label: "changed" },
  removed: { tone: "danger", dot: true, label: "removed" }
};

export function StatusBadge({ status }: { status: StatusKey }) {
  const key = (status ?? "").toString().toLowerCase().trim();
  const s = STATUS_MAP[key] || { tone: "outline" as BadgeTone, dot: true, label: status };
  return (
    <Badge tone={s.tone} dot={s.dot} pulse={s.pulse}>
      {s.label}
    </Badge>
  );
}

// Legacy alias used by some callers
export function StatusPill({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

// ---------------- Card ----------------
export function Card({
  children,
  className,
  padded,
  style
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={cx("card", padded && "card-pad", className)} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  sub,
  action
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div>
        <div className="card-title">{title}</div>
        {sub ? <div className="card-sub">{sub}</div> : null}
      </div>
      {action}
    </div>
  );
}

// Legacy Panel alias used by other parts of the codebase
export function Panel({
  children,
  className,
  style
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={cx("card", className)} style={style}>
      {children}
    </section>
  );
}

// ---------------- SectionTitle (legacy) ----------------
export function SectionTitle({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{eyebrow}</p>
        ) : null}
        <h2 className="mt-1 text-[15px] font-semibold tracking-normal text-[var(--text-primary)]">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

// ---------------- Form helpers ----------------
export function FieldLabel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cx("input", focusRing, className)} {...rest} />;
});

// ---------------- KPI ----------------
export function KPI({
  icon,
  label,
  value,
  delta,
  deltaDir = "up",
  spark
}: {
  icon?: IconName;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  deltaDir?: "up" | "down" | "flat";
  spark?: number[];
}) {
  return (
    <Card className="kpi">
      <div className="kpi-label">
        {icon ? (
          <span className="ki">
            <Icon name={icon} size={13} />
          </span>
        ) : null}
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div className="kpi-value">{value}</div>
        {delta ? (
          <span className={cx("kpi-delta", deltaDir)}>
            <Icon
              name={deltaDir === "up" ? "arrowUp" : deltaDir === "down" ? "arrowDown" : "arrowRight"}
              size={12}
            />
            {delta}
          </span>
        ) : null}
      </div>
      {spark ? <Sparkline className="kpi-spark" data={spark} dir={deltaDir} /> : null}
    </Card>
  );
}

// ---------------- Sparkline ----------------
export function Sparkline({
  data,
  dir = "up",
  className,
  width = 88,
  height = 32,
  stroke
}: {
  data: number[];
  dir?: "up" | "down" | "flat";
  className?: string;
  width?: number;
  height?: number;
  stroke?: string;
}) {
  const reactId = useId();
  const gid = useMemo(() => `g${reactId.replace(/[^a-z0-9]/gi, "")}`, [reactId]);
  const { d, dArea } = useMemo(() => {
    if (data.length === 0) return { d: "", dArea: "" };
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return [x, y] as const;
    });
    const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
    return { d: path, dArea: `${path} L${width},${height} L0,${height} Z` };
  }, [data, width, height]);

  const color = stroke || (dir === "down" ? "var(--danger)" : dir === "flat" ? "var(--text-muted)" : "var(--accent)");

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={dArea} fill={`url(#${gid})`} />
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------- Avatar ----------------
// Skrowt is monochrome — user avatars rotate through inky neutrals (+ one soil/sprout tint).
const AVATAR_PALETTE = ["#1A1913", "#3A3933", "#56554D", "#6A5A45", "#4F7A43", "#2E2D27", "#46453E"];

export function Avatar({
  name = "",
  size = 28,
  color,
  className
}: {
  name?: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
  const idx =
    name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length;
  const bg = color || AVATAR_PALETTE[idx];
  return (
    <div
      className={cx("avatar", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "white",
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        letterSpacing: "-0.01em"
      }}
    >
      {initials || "U"}
    </div>
  );
}

// ---------------- Favicon Tile ----------------
const FAVICON_PALETTE: Record<string, string> = {
  indeed: "#1F3F8F",
  linkedin: "#0A66C2",
  amazon: "#D17A06",
  bestbuy: "#0F4DBC",
  booking: "#0E4DB1",
  ycombinator: "#FB651E",
  news: "#FB651E",
  crunchbase: "#1463A3",
  g2: "#FF6B2B",
  angellist: "#0F1729",
  apple: "#0E1726",
  notion: "#0E1726",
  techcrunch: "#107C41",
  shopify: "#3D6B26",
  etsy: "#C24A1C",
  glassdoor: "#0CAA41",
  hackernews: "#FB651E",
  producthunt: "#DA552F",
  reddit: "#D93A00",
  wikipedia: "#0F1729",
  nytimes: "#0F1729",
  workable: "#3A75D8",
  lever: "#0F1729",
  greenhouse: "#1F8A5B",
  jobs: "#3A75D8",
  boards: "#1F8A5B"
};

export function FaviconTile({ host, color }: { host: string; color?: string }) {
  const cleaned = (host || "").replace(/^www\./, "");
  const letter = cleaned[0]?.toUpperCase() ?? "?";
  const key = cleaned.replace(/\..*$/, "").toLowerCase();
  const bg = color || FAVICON_PALETTE[key] || "#475467";
  return (
    <div
      className="favicon"
      style={{ background: bg, color: "white", borderColor: "transparent" }}
      title={host}
    >
      {letter}
    </div>
  );
}

// ---------------- Empty State ----------------
export function EmptyState({
  icon = "spark",
  title,
  description,
  action,
  children
}: {
  icon?: IconName;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  if (children && !title && !description) {
    return (
      <div className="rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--text-secondary)]">
        {children}
      </div>
    );
  }
  return (
    <div className="empty">
      <div className="emp-icon">
        <Icon name={icon} size={26} />
      </div>
      {title ? <h3>{title}</h3> : null}
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

// ---------------- Segmented ----------------
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className
}: {
  options: Array<{ value: T; label: string; icon?: IconName }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("segmented", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(value === o.value && "on")}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} size={12} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Chip ----------------
export function Chip({
  label,
  value,
  onClick,
  icon = "chevronDown"
}: {
  label?: string;
  value?: ReactNode;
  onClick?: () => void;
  icon?: IconName;
}) {
  return (
    <button type="button" className="chip" onClick={onClick}>
      {label ? <span>{label}:</span> : null}
      {value ? <span className="cv">{value}</span> : null}
      <Icon name={icon} size={12} />
    </button>
  );
}

// ---------------- Tabs ----------------
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className
}: {
  tabs: Array<{ value: T; label: string; count?: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("tabs", className)}>
      {tabs.map((t) => (
        <button key={t.value} type="button" className={cx(value === t.value && "on")} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && t.count !== null ? (
            <span style={{ marginLeft: 6, color: "var(--text-muted)", fontWeight: 500 }}>{t.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ---------------- Stepper ----------------
export function Stepper({
  steps,
  current,
  compact,
  onStepClick
}: {
  steps: string[];
  current: number;
  compact?: boolean;
  // When provided, completed/current steps become clickable so users can navigate back.
  onStepClick?: (index: number) => void;
}) {
  return (
    <div className="stepper">
      {steps.map((s, i) => {
        const navigable = Boolean(onStepClick) && i <= current;
        const stepClass = cx(
          "step",
          i < current && "done",
          i === current && "active",
          compact && i !== current && "step-icon-only"
        );
        const inner = (
          <>
            <span className="step-num">
              {i < current ? <Icon name="check" size={12} strokeWidth={2.2} /> : (i + 1).toString().padStart(2, "0")}
            </span>
            {(!compact || i === current) && <span>{s}</span>}
          </>
        );
        return (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
            {navigable ? (
              <button
                type="button"
                className={cx(stepClass, focusRing)}
                onClick={() => onStepClick?.(i)}
                style={{ border: 0, background: "transparent", cursor: "pointer", font: "inherit" }}
                aria-label={`Go to step ${i + 1}: ${s}`}
              >
                {inner}
              </button>
            ) : (
              <div className={stepClass} aria-current={i === current ? "step" : undefined}>
                {inner}
              </div>
            )}
            {i < steps.length - 1 ? <div className="step-line" /> : null}
          </span>
        );
      })}
    </div>
  );
}

// ---------------- Code block (legacy) ----------------
export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <p className="break-all rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
      {children}
    </p>
  );
}

// ---------------- StatCard (legacy alias used in profile view) ----------------
export function StatCard({
  label,
  value,
  detail,
  tone: _tone
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "violet";
}) {
  void _tone;
  return <KPI label={label} value={value} delta={detail} deltaDir="flat" />;
}

// ---------------- Helpers ----------------
export const fmtRelative = (ts: number) => {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
};

export const fmtDuration = (s: number) => {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r}s`;
};

export const fmtInt = (n: number) => n.toLocaleString("en-US");
