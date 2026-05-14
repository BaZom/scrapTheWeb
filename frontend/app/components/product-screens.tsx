"use client";

import { Fragment, type ReactNode, useState } from "react";

import type { Dashboard, ExtractionRun, Recipe } from "@/lib/api";

import { AccountPanel } from "./account-panels";
import { Icon, type IconName } from "./icons";
import { DEMO_RECIPES, HOSTS, type DemoRecipe } from "../data/product-ui";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  FieldLabel,
  KPI,
  Segmented,
  StatusBadge,
  Tabs,
  TextInput,
  fmtDuration,
  fmtInt,
  fmtRelative,
  FaviconTile
} from "./ui";

type WorkspaceDataProps = {
  error?: string | null;
  loading?: boolean;
  recipes: Recipe[];
  runs: ExtractionRun[];
};

// ---------- shared real-data helpers ----------
function shortId(id: string) {
  return id.slice(0, 8);
}

function domainForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function relativeFromIso(value: string | null | undefined): string {
  if (!value) return "—";
  return fmtRelative(new Date(value).getTime());
}

function durationFromIso(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "—";
  const seconds = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return fmtDuration(seconds);
}

function recipeNameFor(run: ExtractionRun, recipes: Recipe[]): string {
  return recipes.find((r) => r.id === run.recipeId)?.name ?? shortId(run.recipeId);
}

function recipeFieldCount(recipe: Recipe): number {
  const cfg = recipe.config as { fields?: unknown } | undefined;
  return Array.isArray(cfg?.fields) ? (cfg!.fields as unknown[]).length : 0;
}

function runChangeCount(run: ExtractionRun): number {
  return run.changes.new.length + run.changes.changed.length + run.changes.removed.length;
}

function statusGroup(status: string): "completed" | "running" | "failed" | "pending" {
  const s = status.toLowerCase();
  if (s === "completed" || s === "succeeded" || s === "ok") return "completed";
  if (s === "running") return "running";
  if (s === "failed" || s === "error") return "failed";
  return "pending";
}

function recordColumns(records: ExtractionRun["records"], limit = 6): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record.data)) {
      if (key && !seen.has(key)) seen.add(key);
      if (seen.size >= limit) break;
    }
    if (seen.size >= limit) break;
  }
  return Array.from(seen);
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ======================================================================
// DASHBOARD
// ======================================================================
export function DashboardView({
  dashboard,
  error,
  loading,
  onCreateRecipe,
  onNavigate,
  recipes,
  runs
}: WorkspaceDataProps & {
  dashboard: Dashboard | null;
  onCreateRecipe: () => void;
  onOpenProfile: () => void;
  onNavigate?: (view: "runs" | "monitors" | "recipes" | "exports" | "settings") => void;
}) {
  const firstName =
    dashboard?.user.email.split("@")[0]?.split(/[._-]/)[0] ?? "";
  const titleName = firstName
    ? firstName[0].toUpperCase() + firstName.slice(1)
    : "back";
  const latestRuns = [...runs]
    .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
    .slice(0, 5);

  const totalRecords = runs.reduce((sum, r) => sum + r.records.length, 0);
  const totalChanges = runs.reduce((sum, r) => sum + runChangeCount(r), 0);

  const latestCompletedWithRecords = [...runs]
    .filter((r) => r.status === "completed" && r.records.length > 0)
    .sort((a, b) => new Date(b.finishedAt ?? 0).getTime() - new Date(a.finishedAt ?? 0).getTime())[0];

  const orgName = dashboard?.organizations[0]?.name ?? "Workspace";
  const role = dashboard?.organizations[0]?.role ?? "Member";

  return (
    <>
      <WorkspaceNotice error={error} loading={loading} />
      <div className="page-hero">
        <div>
          <h2>Welcome{titleName ? `, ${titleName}` : " back"}</h2>
          <div className="sub">
            Here&apos;s what&apos;s changed across your monitored sources.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="refresh" onClick={() => onNavigate?.("runs")}>
            View runs
          </Button>
          <Button variant="primary" icon="wand" onClick={onCreateRecipe}>
            Open Builder
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
        <KPI icon="recipe" label="Saved recipes" value={fmtInt(recipes.length)} />
        <KPI icon="runs" label="Runs" value={fmtInt(runs.length)} />
        <KPI icon="records" label="Records extracted" value={fmtInt(totalRecords)} />
        <KPI icon="diff" label="Changes detected" value={fmtInt(totalChanges)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card>
            <CardHeader
              title="Latest runs"
              sub="Execution history across all recipes"
              action={
                <Button variant="ghost" size="sm" trailingIcon="arrowRight" onClick={() => onNavigate?.("runs")}>
                  All runs
                </Button>
              }
            />
            {latestRuns.length === 0 ? (
              <EmptyState
                icon="runs"
                title="No runs yet"
                description="Save a recipe in the Builder and run it once to populate this list."
                action={
                  <Button variant="primary" icon="wand" onClick={onCreateRecipe}>
                    Open Builder
                  </Button>
                }
              />
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: "44%" }}>Recipe</th>
                    <th>Started</th>
                    <th className="num">Records</th>
                    <th className="num">Changes</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {latestRuns.map((r) => {
                    const group = statusGroup(r.status);
                    const host = domainForUrl(r.url);
                    const recipeName = recipeNameFor(r, recipes);
                    const changes = runChangeCount(r);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="cell-main">
                            <FaviconTile host={host} />
                            <div style={{ minWidth: 0 }}>
                              <div
                                className="ci-name"
                                style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}
                              >
                                {recipeName}
                              </div>
                              <div className="ci-sub">
                                {shortId(r.id)} · {host}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="muted">{relativeFromIso(r.startedAt)}</td>
                        <td className="num tabular">
                          {group === "completed" ? fmtInt(r.records.length) : "—"}
                        </td>
                        <td className="num tabular">
                          {group === "completed" ? (
                            changes > 0 ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <Icon name="diff" size={11} style={{ color: "var(--accent-deep)" }} />
                                {changes}
                              </span>
                            ) : (
                              "0"
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td style={{ width: 30 }}>
                          <button type="button" className="icon-btn" style={{ width: 26, height: 26, border: 0 }}>
                            <Icon name="chevronRight" size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Latest extracted records"
              sub={
                latestCompletedWithRecords
                  ? `${recipeNameFor(latestCompletedWithRecords, recipes)} · run ${shortId(latestCompletedWithRecords.id)} · ${relativeFromIso(latestCompletedWithRecords.finishedAt)}`
                  : "No completed runs yet"
              }
            />
            {latestCompletedWithRecords ? (
              <RecordsTable records={latestCompletedWithRecords.records.slice(0, 8)} />
            ) : (
              <EmptyState
                icon="records"
                title="No records yet"
                description="Records from your latest completed run will appear here."
              />
            )}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card
            className="card-pad"
            style={{
              background: "linear-gradient(160deg, var(--accent-softer) 0%, var(--surface) 80%)",
              borderColor: "var(--accent-soft)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Icon name="wand" size={14} style={{ color: "var(--accent-deep)" }} />
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--accent-deep)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              >
                Quick start
              </div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.012em", marginBottom: 4 }}>
              Turn a public page into structured records
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14 }}>
              Paste a URL, point at a repeated card, map fields. Save it as a recipe and run it on demand.
            </div>
            <WorkflowDiagram />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Button variant="primary" icon="wand" onClick={onCreateRecipe}>
                Open Builder
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent activity" sub="Most recent runs" />
            <div style={{ padding: "4px 0" }}>
              {latestRuns.length === 0 ? (
                <div style={{ padding: "20px 18px", fontSize: 13, color: "var(--text-muted)" }}>
                  No activity yet. Run a recipe to populate the feed.
                </div>
              ) : (
                latestRuns.map((r, i) => {
                  const group = statusGroup(r.status);
                  const type: "run" | "fail" | "review" =
                    group === "failed" ? "fail" : group === "completed" ? "run" : "review";
                  const name = recipeNameFor(r, recipes);
                  const meta =
                    group === "failed"
                      ? r.errorMessage ?? "Run failed"
                      : group === "completed"
                        ? `${fmtInt(r.records.length)} records · ${runChangeCount(r)} changes`
                        : r.status;
                  const text =
                    group === "failed"
                      ? `Run failed for ${name}`
                      : group === "completed"
                        ? `Run completed for ${name}`
                        : `Run ${r.status} for ${name}`;
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "10px 18px",
                        borderBottom: i < latestRuns.length - 1 ? "1px solid var(--divider)" : "0"
                      }}
                    >
                      <ActivityDot type={type} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.35 }}>{text}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                          {meta} · {relativeFromIso(r.startedAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Workspace" sub={role} />
            <div style={{ padding: "12px 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div className="ws-avatar" style={{ width: 36, height: 36, fontSize: 13, borderRadius: 9 }}>
                  {orgName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0] ?? "")
                    .join("")
                    .toUpperCase() || "W"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{orgName}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    {dashboard?.user.email ?? ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Email verified</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 2,
                      color: dashboard?.user.email_verified ? "var(--success-fg)" : "var(--warning-fg)",
                      fontWeight: 550
                    }}
                  >
                    <Icon
                      name={dashboard?.user.email_verified ? "checkCircle" : "alert"}
                      size={12}
                    />{" "}
                    {dashboard?.user.email_verified ? "Verified" : "Not verified"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Role</div>
                  <div style={{ marginTop: 2, fontWeight: 550 }}>{role}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Recipes</div>
                  <div style={{ marginTop: 2, fontWeight: 550 }} className="tabular">
                    {fmtInt(recipes.length)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Runs</div>
                  <div style={{ marginTop: 2, fontWeight: 550 }} className="tabular">
                    {fmtInt(runs.length)}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function RecordsTable({ records }: { records: ExtractionRun["records"] }) {
  const columns = recordColumns(records, 6);
  if (columns.length === 0) {
    return (
      <EmptyState
        icon="records"
        title="No field values"
        description="The latest run produced records, but no field values were extracted."
      />
    );
  }
  return (
    <table className="tbl">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((record) => (
          <tr key={record.id}>
            {columns.map((column) => (
              <td key={column} style={{ maxWidth: 320 }}>
                <span
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {renderCell(record.data[column])}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WorkflowDiagram() {
  const steps: Array<{ icon: IconName; label: string }> = [
    { icon: "monitor", label: "Source" },
    { icon: "recipe", label: "Recipe" },
    { icon: "runs", label: "Run" },
    { icon: "records", label: "Records" },
    { icon: "diff", label: "Changes" },
    { icon: "exports", label: "Export" }
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 0", flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <Fragment key={s.label}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px 4px 6px",
              borderRadius: 999,
              background: "white",
              border: "1px solid var(--border)",
              fontSize: 11.5,
              fontWeight: 550,
              color: "var(--text-secondary)",
              boxShadow: "var(--shadow-xs)"
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: "var(--accent-soft)",
                color: "var(--accent-deep)",
                display: "grid",
                placeItems: "center"
              }}
            >
              <Icon name={s.icon} size={11} />
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 ? (
            <Icon name="chevronRight" size={11} style={{ color: "var(--text-faint)" }} />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

function ActivityDot({ type }: { type: "run" | "fail" | "review" | "saved" }) {
  const colors: Record<string, { bg: string; fg: string; icon: IconName }> = {
    run: { bg: "var(--success-bg)", fg: "var(--success-fg)", icon: "checkCircle" },
    fail: { bg: "var(--danger-bg)", fg: "var(--danger-fg)", icon: "alert" },
    review: { bg: "var(--warning-bg)", fg: "var(--warning-fg)", icon: "wand" },
    saved: { bg: "var(--accent-soft)", fg: "var(--accent-deep)", icon: "bookmark" }
  };
  const c = colors[type] || colors.run;
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        background: c.bg,
        color: c.fg,
        display: "grid",
        placeItems: "center",
        flexShrink: 0
      }}
    >
      <Icon name={c.icon} size={13} />
    </div>
  );
}

// ======================================================================
// RECIPES
// ======================================================================
export function RecipesView({
  error,
  loading,
  onOpenBuilder,
  onRunRecipe,
  recipes,
  runs
}: WorkspaceDataProps & {
  onOpenBuilder: () => void;
  onRunRecipe: (recipeId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "other">("all");
  const [query, setQuery] = useState("");

  const counts = {
    all: recipes.length,
    active: recipes.filter((r) => r.status === "active").length,
    draft: recipes.filter((r) => r.status === "draft").length,
    other: recipes.filter((r) => r.status !== "active" && r.status !== "draft").length
  };

  const visible = recipes.filter((r) => {
    if (filter === "active" && r.status !== "active") return false;
    if (filter === "draft" && r.status !== "draft") return false;
    if (filter === "other" && (r.status === "active" || r.status === "draft")) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.url.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalFields = recipes.reduce((sum, r) => sum + recipeFieldCount(r), 0);
  const avgFields = recipes.length ? (totalFields / recipes.length).toFixed(1) : "0";

  const latestRunByRecipe = new Map<string, ExtractionRun>();
  for (const run of runs) {
    const existing = latestRunByRecipe.get(run.recipeId);
    if (!existing) {
      latestRunByRecipe.set(run.recipeId, run);
      continue;
    }
    if (new Date(run.startedAt ?? 0).getTime() > new Date(existing.startedAt ?? 0).getTime()) {
      latestRunByRecipe.set(run.recipeId, run);
    }
  }

  return (
    <>
      <WorkspaceNotice error={error} loading={loading} />
      <div className="page-hero">
        <div>
          <h2>Recipes</h2>
          <div className="sub">
            Saved extraction templates. A recipe defines a container selector and field mappings — it doesn&apos;t schedule itself.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" icon="plus" onClick={onOpenBuilder}>
            New recipe
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 16 }}>
        <KPI icon="recipe" label="Saved recipes" value={fmtInt(recipes.length)} />
        <KPI icon="checkCircle" label="Active" value={fmtInt(counts.active)} />
        <KPI icon="edit" label="Draft" value={fmtInt(counts.draft)} />
        <KPI icon="hash" label="Avg fields per recipe" value={avgFields} />
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "all", label: "All", count: counts.all },
          { value: "active", label: "Active", count: counts.active },
          { value: "draft", label: "Draft", count: counts.draft },
          { value: "other", label: "Other", count: counts.other }
        ]}
      />

      <div className="toolbar">
        <div className="search-box" style={{ width: 280, height: 30 }}>
          <Icon name="search" size={14} />
          <input
            placeholder="Search recipes by name or URL…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grow" />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="recipe"
            title={recipes.length === 0 ? "No recipes yet" : "No matches"}
            description={
              recipes.length === 0
                ? "Build your first extraction recipe from any public listing page."
                : "Try clearing filters or search."
            }
            action={
              recipes.length === 0 ? (
                <Button variant="primary" icon="wand" onClick={onOpenBuilder}>
                  Open Builder
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Recipe</th>
                <th>Domain</th>
                <th>Page type</th>
                <th className="num">Fields</th>
                <th>Last run</th>
                <th className="num">Records</th>
                <th>Status</th>
                <th style={{ width: 130, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const host = domainForUrl(r.url);
                const latest = latestRunByRecipe.get(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-main">
                        <FaviconTile host={host} />
                        <div style={{ minWidth: 0 }}>
                          <div className="ci-name">{r.name}</div>
                          <div className="ci-sub">{shortId(r.id)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{host}</td>
                    <td>
                      <Badge tone="outline">{r.pageType}</Badge>
                    </td>
                    <td className="num tabular">{recipeFieldCount(r)}</td>
                    <td className="muted">{latest ? relativeFromIso(latest.startedAt) : "—"}</td>
                    <td className="num tabular">{latest ? fmtInt(latest.records.length) : "—"}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                        <Button variant="secondary" size="sm" icon="play" onClick={() => onRunRecipe(r.id)}>
                          Run now
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ======================================================================
// MONITORS
// ======================================================================
export function MonitorsView({
  error,
  loading,
  onCreateRecipe,
  recipes
}: WorkspaceDataProps & {
  onCreateRecipe: () => void;
  onRunRecipe: (recipeId: string) => void;
}) {
  const merged = mergeRecipes(recipes);

  return (
    <>
      <WorkspaceNotice error={error} loading={loading} />
      <div className="page-hero">
        <div>
          <h2>Monitors</h2>
          <div className="sub">
            A monitor watches one source URL on a schedule and alerts you when records appear, change, or vanish.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="mail">
            Configure alerts
          </Button>
          <Button variant="primary" icon="plus" onClick={onCreateRecipe}>
            New monitor
          </Button>
        </div>
      </div>

      <Card
        style={{
          marginBottom: 20,
          background: "linear-gradient(140deg, var(--accent-softer) 0%, var(--surface) 65%)",
          borderColor: "var(--accent-soft)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) 1fr",
            gap: 24,
            padding: 24,
            alignItems: "center"
          }}
        >
          <div>
            <Badge tone="accent" dot>
              Coming soon · Q3
            </Badge>
            <h3 style={{ margin: "10px 0 6px", fontSize: 20, letterSpacing: "-0.014em", fontWeight: 600 }}>
              Scheduled monitoring with diff-based alerts
            </h3>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13.5, maxWidth: 540 }}>
              Pick a recipe, give it a schedule, and we&apos;ll keep extracting in the background. You&apos;ll see new, changed, and removed records — and get an email or webhook when something interesting happens.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {["Hourly", "Daily", "Weekly", "Custom cron"].map((s) => (
                <span key={s} className="workflow-chip">
                  <Icon name="clock" size={11} /> {s}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Button variant="primary" icon="bell">
                Join early access
              </Button>
              <Button variant="ghost" trailingIcon="arrowRight">
                See roadmap
              </Button>
            </div>
          </div>

          <div style={{ position: "relative", padding: 8 }}>
            <div
              style={{
                background: "white",
                borderRadius: 12,
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-lg)",
                padding: 14,
                transform: "rotate(-1.5deg)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: "var(--accent-soft)",
                    color: "var(--accent-deep)",
                    display: "grid",
                    placeItems: "center"
                  }}
                >
                  <Icon name="diff" size={13} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Best Buy · Espresso Machines</div>
                <Badge tone="success" dot>
                  +6 new
                </Badge>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
                Detected at 9:14 — daily monitor
              </div>
              <div
                style={{
                  borderTop: "1px dashed var(--border)",
                  paddingTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}
              >
                <DiffLine type="new" text="Breville Bambino Plus — €399.00 — In stock" />
                <DiffLine type="changed" text="De&apos;Longhi Magnifica — €549 → €499" />
                <DiffLine type="removed" text="Smeg ECF02 — discontinued" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <CardHeader title="Source candidates" sub="Your saved recipes — these are the URLs we'll schedule once monitoring ships." />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 14,
          marginTop: 16
        }}
      >
        {merged.map((r) => (
          <Card key={r.id} className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FaviconTile host={r.host} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {r.name}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {HOSTS[r.host]?.display ?? r.host}
                </div>
              </div>
              <StatusBadge status={r.status === "needs" ? "needs" : "paused"} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11.5 }}>
              <div>
                <div style={{ color: "var(--text-muted)" }}>Records</div>
                <div className="tabular" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {fmtInt(r.records)}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-muted)" }}>Last run</div>
                <div style={{ fontWeight: 550, color: "var(--text-primary)" }}>{fmtRelative(r.lastRun)}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-muted)" }}>Fields</div>
                <div className="tabular" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {r.fields}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "space-between", alignItems: "center" }}>
              <span className="workflow-chip" style={{ padding: "4px 8px", opacity: 0.65 }}>
                <Icon name="clock" size={10} /> Schedule — coming soon
              </span>
              {r.status === "needs" ? (
                <Button variant="secondary" size="sm" icon="wand">
                  Repair selector
                </Button>
              ) : (
                <Button variant="ghost" size="sm" icon="play">
                  Run now
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function DiffLine({ type, text }: { type: "new" | "changed" | "removed"; text: string }) {
  const meta = {
    new: { color: "var(--success-fg)", bg: "var(--success-bg)", glyph: "+" },
    changed: { color: "var(--warning-fg)", bg: "var(--warning-bg)", glyph: "~" },
    removed: { color: "var(--danger-fg)", bg: "var(--danger-bg)", glyph: "−" }
  }[type];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          background: meta.bg,
          color: meta.color,
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: 11
        }}
      >
        {meta.glyph}
      </span>
      <span
        style={{
          color: "var(--text-secondary)",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis"
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function MonitorDetailView() {
  return (
    <div className="empty">
      <div className="emp-icon">
        <Icon name="monitor" size={26} />
      </div>
      <h3>No monitor selected</h3>
      <p>Select a scheduled monitor once monitor persistence ships.</p>
    </div>
  );
}

// ======================================================================
// RUNS
// ======================================================================
export function RunsView({
  error,
  loading,
  onOpenRun,
  recipes,
  runs
}: WorkspaceDataProps & {
  onOpenRun: (run: ExtractionRun) => void;
}) {
  const [filter, setFilter] = useState<"all" | "running" | "completed" | "failed">("all");
  const [query, setQuery] = useState("");

  const counts = {
    all: runs.length,
    running: runs.filter((r) => statusGroup(r.status) === "running").length,
    completed: runs.filter((r) => statusGroup(r.status) === "completed").length,
    failed: runs.filter((r) => statusGroup(r.status) === "failed").length
  };

  const sorted = [...runs].sort(
    (a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime()
  );

  const visible = sorted.filter((r) => {
    if (filter !== "all" && statusGroup(r.status) !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      const recipeName = recipeNameFor(r, recipes).toLowerCase();
      if (!r.id.toLowerCase().includes(q) && !recipeName.includes(q)) return false;
    }
    return true;
  });

  const totalRecords = runs.reduce((sum, r) => sum + r.records.length, 0);
  const latestCompletedWithRecords = sorted.find(
    (r) => r.status === "completed" && r.records.length > 0
  );

  return (
    <>
      <WorkspaceNotice error={error} loading={loading} />
      <div className="page-hero">
        <div>
          <h2>Runs</h2>
          <div className="sub">
            Execution history. Each run produces a set of records and an optional change diff.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 16 }}>
        <KPI icon="runs" label="Runs" value={fmtInt(runs.length)} />
        <KPI icon="checkCircle" label="Completed" value={fmtInt(counts.completed)} />
        <KPI icon="alert" label="Failed" value={fmtInt(counts.failed)} />
        <KPI icon="records" label="Records extracted" value={fmtInt(totalRecords)} />
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "all", label: "All", count: counts.all },
          { value: "running", label: "Running", count: counts.running },
          { value: "completed", label: "Completed", count: counts.completed },
          { value: "failed", label: "Failed", count: counts.failed }
        ]}
      />

      <div className="toolbar">
        <div className="search-box" style={{ width: 280, height: 30 }}>
          <Icon name="search" size={14} />
          <input
            placeholder="Search by run ID or recipe…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grow" />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="runs"
            title={runs.length === 0 ? "No runs yet" : "No matches"}
            description={
              runs.length === 0
                ? "Run a saved recipe from the Recipes page to populate the history."
                : "Try clearing filters or search."
            }
          />
        </Card>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 20 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Run</th>
                <th style={{ width: "26%" }}>Recipe</th>
                <th>Source</th>
                <th>Started</th>
                <th className="num">Duration</th>
                <th className="num">Records</th>
                <th className="num">Changes</th>
                <th>Status</th>
                <th style={{ width: 60, textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const group = statusGroup(r.status);
                const host = domainForUrl(r.url);
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {shortId(r.id)}
                    </td>
                    <td>
                      <div className="cell-main">
                        <FaviconTile host={host} />
                        <div style={{ minWidth: 0 }}>
                          <div
                            className="ci-name"
                            style={{
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              maxWidth: 240
                            }}
                          >
                            {recipeNameFor(r, recipes)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="muted mono" style={{ fontSize: 12 }}>
                      {host}
                    </td>
                    <td className="muted">{relativeFromIso(r.startedAt)}</td>
                    <td className="num tabular">{durationFromIso(r.startedAt, r.finishedAt)}</td>
                    <td className="num tabular">
                      {group === "completed" ? fmtInt(r.records.length) : "—"}
                    </td>
                    <td className="num tabular">
                      {group === "completed" ? runChangeCount(r) : "—"}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 28, height: 28 }}
                          onClick={() => onOpenRun(r)}
                        >
                          <Icon name="chevronRight" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {latestCompletedWithRecords ? (
        <Card>
          <CardHeader
            title="Latest extracted records"
            sub={`From ${recipeNameFor(latestCompletedWithRecords, recipes)} · run ${shortId(latestCompletedWithRecords.id)} · ${relativeFromIso(latestCompletedWithRecords.finishedAt)}`}
          />
          <RecordsTable records={latestCompletedWithRecords.records.slice(0, 10)} />
        </Card>
      ) : null}
    </>
  );
}

// ======================================================================
// EXPORTS
// ======================================================================
export function ExportsView({
  error,
  exportBusy,
  loading,
  onDownloadExport,
  recipes,
  runs
}: WorkspaceDataProps & {
  exportBusy: "csv" | "json" | null;
  onDownloadExport: (runId: string, format: "csv" | "json") => void;
}) {
  const [query, setQuery] = useState("");
  const completed = [...runs]
    .filter((r) => r.status === "completed")
    .sort((a, b) => new Date(b.finishedAt ?? 0).getTime() - new Date(a.finishedAt ?? 0).getTime());

  const visible = completed.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.id.toLowerCase().includes(q) || recipeNameFor(r, recipes).toLowerCase().includes(q);
  });

  const totalRecords = completed.reduce((sum, r) => sum + r.records.length, 0);

  return (
    <>
      <WorkspaceNotice error={error} loading={loading} />
      <div className="page-hero">
        <div>
          <h2>Exports</h2>
          <div className="sub">
            CSV and JSON exports are generated from completed runs. Pick a run, choose a format, and download.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
        <KPI icon="checkCircle" label="Completed runs" value={fmtInt(completed.length)} />
        <KPI icon="records" label="Records available" value={fmtInt(totalRecords)} />
        <KPI icon="csv" label="CSV exports" value={fmtInt(completed.length)} />
        <KPI icon="json" label="JSON exports" value={fmtInt(completed.length)} />
      </div>

      <Card style={{ marginBottom: 20, background: "var(--surface-soft)", borderStyle: "dashed" }}>
        <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "white",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
              color: "var(--accent-deep)"
            }}
          >
            <Icon name="info" size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 550, color: "var(--text-primary)" }}>
              Exports are generated from completed runs
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Failed or queued runs don&apos;t appear here. To export from a draft recipe, run it once from the Builder.
            </div>
          </div>
        </div>
      </Card>

      <div className="toolbar">
        <div className="search-box" style={{ width: 280, height: 30 }}>
          <Icon name="search" size={14} />
          <input
            placeholder="Search exportable runs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grow" />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="exports"
            title={completed.length === 0 ? "No exports available" : "No matches"}
            description={
              completed.length === 0
                ? "Run a recipe and wait for it to complete. Completed runs become exportable."
                : "Try clearing the search."
            }
          />
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Run</th>
                <th style={{ width: "26%" }}>Recipe</th>
                <th>Source</th>
                <th className="num">Records</th>
                <th>Completed</th>
                <th>Status</th>
                <th style={{ width: 200, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const host = domainForUrl(r.url);
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {shortId(r.id)}
                    </td>
                    <td>
                      <div className="cell-main">
                        <FaviconTile host={host} />
                        <div style={{ minWidth: 0 }}>
                          <div
                            className="ci-name"
                            style={{
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              maxWidth: 240
                            }}
                          >
                            {recipeNameFor(r, recipes)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="muted mono" style={{ fontSize: 12 }}>
                      {host}
                    </td>
                    <td className="num tabular">{fmtInt(r.records.length)}</td>
                    <td className="muted">{relativeFromIso(r.finishedAt)}</td>
                    <td>
                      <StatusBadge status="completed" />
                    </td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="csv"
                          disabled={exportBusy === "csv"}
                          onClick={() => onDownloadExport(r.id, "csv")}
                        >
                          CSV
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="json"
                          disabled={exportBusy === "json"}
                          onClick={() => onDownloadExport(r.id, "json")}
                        >
                          JSON
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ======================================================================
// SETTINGS
// ======================================================================
type SettingsTab =
  | "workspace"
  | "members"
  | "notifications"
  | "integrations"
  | "keys"
  | "security"
  | "billing";

export function SettingsView({
  dashboard,
  accessToken,
  onVerified,
  onSessionRevoked
}: {
  dashboard: Dashboard | null;
  accessToken: string | null;
  onVerified: () => void;
  onSessionRevoked: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("workspace");
  return (
    <>
      <div className="page-hero">
        <div>
          <h2>Settings</h2>
          <div className="sub">Workspace, security, integrations, and billing.</div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "workspace", label: "Workspace" },
          { value: "members", label: "Members", count: 1 },
          { value: "notifications", label: "Notifications" },
          { value: "integrations", label: "Integrations" },
          { value: "keys", label: "API keys" },
          { value: "security", label: "Security" },
          { value: "billing", label: "Billing" }
        ]}
      />

      <div style={{ marginTop: 24 }}>
        {tab === "workspace" && <SettingsWorkspace dashboard={dashboard} />}
        {tab === "members" && <SettingsMembers dashboard={dashboard} />}
        {tab === "notifications" && <SettingsNotifications />}
        {tab === "integrations" && <SettingsIntegrations />}
        {tab === "keys" && (
          accessToken ? (
            <AccountPanel
              accessToken={accessToken}
              emailVerified={dashboard?.user.email_verified ?? false}
              onVerified={onVerified}
              onSessionRevoked={onSessionRevoked}
            />
          ) : (
            <Card>
              <EmptyState icon="key" title="Sign in required" description="Sign in to manage API keys." />
            </Card>
          )
        )}
        {tab === "security" && <SettingsSecurity dashboard={dashboard} />}
        {tab === "billing" && <SettingsBilling />}
      </div>
    </>
  );
}

function SettingsRow({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 280px) minmax(0, 1fr)",
        gap: 32,
        padding: "20px 0",
        borderBottom: "1px solid var(--divider)"
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        {description ? (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>{description}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsWorkspace({ dashboard }: { dashboard: Dashboard | null }) {
  const org = dashboard?.organizations[0];
  return (
    <Card style={{ padding: "4px 24px 24px" }}>
      <SettingsRow title="Workspace identity" description="Shown to teammates in the app and on exports.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldLabel label="Workspace name">
            <TextInput value={org?.name ?? ""} readOnly disabled />
          </FieldLabel>
          <FieldLabel label="Your role">
            <TextInput value={org?.role ?? "—"} readOnly disabled />
          </FieldLabel>
        </div>
      </SettingsRow>

      <SettingsRow title="Workspace updates" description="Renaming the workspace and changing branding will be available once workspace update endpoints ship.">
        <Badge tone="outline" dot>
          Not yet implemented
        </Badge>
      </SettingsRow>
    </Card>
  );
}

function SettingsMembers({ dashboard }: { dashboard: Dashboard | null }) {
  const userEmail = dashboard?.user.email ?? "";
  const userName = userEmail.split("@")[0]?.replace(/[._-]/g, " ") || "Account";
  const role = dashboard?.organizations[0]?.role ?? "Owner";
  return (
    <div>
      <div className="toolbar" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          Inviting teammates will be available once member management endpoints ship.
        </div>
        <div className="grow" />
        <Button variant="primary" icon="plus" disabled>
          Invite
        </Button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {userEmail ? (
              <tr>
                <td>
                  <div className="cell-main">
                    <Avatar name={userName} size={28} />
                    <div>
                      <div className="ci-name">{userName}</div>
                      <div className="ci-sub" style={{ fontFamily: "var(--font-sans)" }}>
                        {userEmail}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge tone="accent">{role}</Badge>
                </td>
                <td>
                  <StatusBadge status={dashboard?.user.email_verified ? "verified" : "pending"} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <Badge tone="outline">You</Badge>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={4} style={{ padding: "24px 16px", color: "var(--text-muted)" }}>
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsNotifications() {
  return (
    <Card>
      <EmptyState
        icon="bell"
        title="Notification routing — not yet implemented"
        description="Email, Slack, and webhook delivery for run completed / failed / changes / quota events ship with the monitoring milestone."
      />
    </Card>
  );
}

function SettingsIntegrations() {
  const ints: Array<{ id: string; name: string; desc: string; icon: IconName }> = [
    { id: "slack", name: "Slack", desc: "Send alerts to channels or DMs", icon: "slack" },
    { id: "webhook", name: "Webhook", desc: "POST records to any HTTP endpoint", icon: "webhook" },
    { id: "sheets", name: "Google Sheets", desc: "Append records to a spreadsheet", icon: "grid" },
    { id: "zapier", name: "Zapier", desc: "Trigger thousands of apps on each run", icon: "zap" },
    { id: "github", name: "GitHub Issues", desc: "Open issues on detected changes", icon: "github" },
    { id: "supabase", name: "Supabase", desc: "Sync records to a Postgres table", icon: "database" }
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {ints.map((i) => (
        <Card key={i.id} className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                display: "grid",
                placeItems: "center",
                color: "var(--text-primary)"
              }}
            >
              <Icon name={i.icon} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{i.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{i.desc}</div>
            </div>
            <Badge tone="outline">Coming soon</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SettingsSecurity({ dashboard }: { dashboard: Dashboard | null }) {
  const email = dashboard?.user.email ?? "";
  const verified = dashboard?.user.email_verified ?? false;
  return (
    <Card style={{ padding: "4px 24px 24px" }}>
      <SettingsRow title="Email address" description="Used for sign-in, alerts, and password reset.">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TextInput value={email} readOnly disabled style={{ maxWidth: 320 }} />
          <StatusBadge status={verified ? "verified" : "pending"} />
        </div>
      </SettingsRow>
      <SettingsRow
        title="Password & two-factor"
        description="Self-service password change and TOTP enrollment will be available once the security endpoints ship."
      >
        <Badge tone="outline" dot>
          Not yet implemented
        </Badge>
      </SettingsRow>
      <SettingsRow
        title="API keys & sessions"
        description="Manage API keys and active sessions under the API keys tab."
      >
        <Badge tone="outline">Open the API keys tab</Badge>
      </SettingsRow>
    </Card>
  );
}

function SettingsBilling() {
  return (
    <Card>
      <EmptyState
        icon="card"
        title="Billing — not yet implemented"
        description="Plan, usage, and payment management ship once the billing service is wired up."
      />
    </Card>
  );
}

// ======================================================================
// SHARED HELPERS
// ======================================================================
function WorkspaceNotice({ error, loading }: { error?: string | null; loading?: boolean }) {
  if (error) {
    return (
      <div
        style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid var(--warning)",
          background: "var(--warning-bg)",
          color: "var(--warning-fg)",
          fontSize: 13,
          fontWeight: 550
        }}
        role="status"
      >
        {error}
      </div>
    );
  }
  if (!loading) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid var(--info)",
        background: "var(--info-bg)",
        color: "var(--info-fg)",
        fontSize: 13,
        fontWeight: 550
      }}
      role="status"
    >
      Refreshing workspace data…
    </div>
  );
}

function mergeRecipes(real: Recipe[]): Array<DemoRecipe & { realId?: string }> {
  const realMapped: Array<DemoRecipe & { realId: string }> = real.map((recipe) => ({
    id: recipe.id.slice(0, 8),
    realId: recipe.id,
    name: recipe.name,
    host: detectHost(recipe.url) ?? "ycombinator",
    pageType: recipe.pageType ?? "Listing",
    fields: Array.isArray(recipe.config?.fields) ? (recipe.config.fields as unknown[]).length : 0,
    selector:
      typeof recipe.config?.containerSelector === "string" ? (recipe.config.containerSelector as string) : "—",
    matches: 0,
    lastRun: Date.now(),
    runs: 0,
    records: 0,
    changes: 0,
    status: (recipe.status as DemoRecipe["status"]) ?? "completed",
    duration: 0
  }));
  if (realMapped.length > 0) {
    return realMapped;
  }
  return DEMO_RECIPES;
}

function detectHost(urlString: string): keyof typeof HOSTS | undefined {
  try {
    const host = new URL(urlString).hostname.replace(/^www\./, "");
    for (const key of Object.keys(HOSTS) as Array<keyof typeof HOSTS>) {
      if (host.includes(key)) return key;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

// Re-export empty-state placeholder for back-compat
export { EmptyState };
