import { ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50";

export const inputClass =
  "h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition placeholder:text-slate-400 focus:border-blue-400";

const buttonBase =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cx(
        buttonBase,
        focusRing,
        variant === "primary" &&
          "bg-slate-950 text-white shadow-sm shadow-slate-950/10 hover:bg-slate-800",
        variant === "secondary" &&
          "border border-slate-200 bg-white text-slate-800 shadow-sm shadow-slate-950/[0.03] hover:border-slate-300 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        variant === "danger" && "bg-red-600 text-white shadow-sm hover:bg-red-700",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-[18px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">{eyebrow}</p>
        ) : null}
        <h2 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function FieldLabel({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, focusRing, props.className)} {...props} />;
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "violet" | "neutral";
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-600"
  };
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized.includes("healthy") ||
    normalized.includes("active") ||
    normalized.includes("success") ||
    normalized.includes("validated") ||
    normalized.includes("completed")
      ? "green"
      : normalized.includes("review") ||
          normalized.includes("paused") ||
          normalized.includes("running") ||
          normalized.includes("pending")
        ? "amber"
        : normalized.includes("failed") || normalized.includes("broken")
          ? "red"
          : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
      {children}
    </div>
  );
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <p className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-700">
      {children}
    </p>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = "blue"
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "violet";
}) {
  const tones = {
    blue: "from-blue-50 to-white text-blue-600",
    green: "from-emerald-50 to-white text-emerald-600",
    amber: "from-amber-50 to-white text-amber-600",
    red: "from-red-50 to-white text-red-600",
    violet: "from-violet-50 to-white text-violet-600"
  };
  return (
    <Panel className={cx("overflow-hidden bg-gradient-to-br p-5", tones[tone])}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</h2>
        <span className="h-2 w-2 rounded-full bg-current" />
      </div>
      <p className="mt-4 min-w-0 break-words text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </Panel>
  );
}

export function DataTable({
  columns,
  rows,
  actionLabel = "View"
}: {
  columns: string[];
  rows: string[][];
  actionLabel?: string;
}) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70">
            {columns.map((column) => (
              <th
                className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"
                key={column}
              >
                {column}
              </th>
            ))}
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr className="bg-white transition hover:bg-slate-50/80" key={row.join("|")}>
              {row.map((cell, index) => (
                <td
                  className={cx(
                    "max-w-[16rem] whitespace-nowrap px-5 py-4 align-middle text-slate-600",
                    index === 0 && "font-medium text-slate-950"
                  )}
                  key={`${cell}-${index}`}
                >
                  {index === row.length - 1 ? <StatusPill status={cell} /> : cell}
                </td>
              ))}
              <td className="px-5 py-4 text-right">
                <Button
                  className="min-h-8 px-3"
                  type="button"
                  variant={row[row.length - 1].includes("review") || row[row.length - 1].includes("Failed") ? "secondary" : "ghost"}
                >
                  {row[row.length - 1].includes("review") || row[row.length - 1].includes("Failed") ? "Repair" : actionLabel}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
