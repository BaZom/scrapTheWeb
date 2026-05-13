"use client";

import { Fragment, type ReactNode, useState } from "react";

import type { Dashboard, ExtractionRun, Recipe } from "@/lib/api";

import { Icon, type IconName } from "./icons";
import {
  DEMO_ACTIVITY,
  DEMO_LATEST_RECORDS,
  DEMO_RECIPES,
  DEMO_RUNS,
  HOSTS,
  type DemoRecipe,
  type DemoRun
} from "../data/product-ui";
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

// ======================================================================
// DASHBOARD
// ======================================================================
export function DashboardView({
  dashboard,
  error,
  loading,
  onCreateRecipe,
  onNavigate
}: WorkspaceDataProps & {
  dashboard: Dashboard | null;
  onCreateRecipe: () => void;
  onOpenProfile: () => void;
  onNavigate?: (view: "runs" | "monitors" | "recipes" | "exports" | "settings") => void;
}) {
  const firstName = dashboard?.user.email.split("@")[0]?.split(/[._-]/)[0] ?? "Ondrej";
  const titleName = firstName ? firstName[0].toUpperCase() + firstName.slice(1) : "Ondrej";
  const latestRuns = DEMO_RUNS.slice(0, 5);

  return (
    <>
      <WorkspaceNotice error={error} loading={loading} />
      <div className="page-hero">
        <div>
          <h2>Welcome back, {titleName}</h2>
          <div className="sub">
            Here&apos;s what&apos;s changed across your monitored sources in the last 24 hours.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="refresh">
            Run all (9)
          </Button>
          <Button variant="primary" icon="wand" onClick={onCreateRecipe}>
            Open Builder
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
        <KPI icon="recipe" label="Saved recipes" value="9" delta="+2 this week" deltaDir="up" spark={[3, 4, 4, 5, 5, 6, 7, 8, 9, 9, 9]} />
        <KPI icon="runs" label="Runs" value="1,532" delta="+18.4%" deltaDir="up" spark={[12, 14, 11, 18, 22, 20, 28, 27, 31, 34, 38]} />
        <KPI icon="records" label="Records extracted" value="24,089" delta="+3,212 this week" deltaDir="up" spark={[180, 240, 260, 290, 280, 320, 380, 420, 460, 510, 580]} />
        <KPI icon="diff" label="Changes detected" value="146" delta="−12 vs last week" deltaDir="down" spark={[22, 18, 24, 21, 19, 16, 22, 18, 14, 16, 12]} />
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
                {latestRuns.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-main">
                        <FaviconTile host={r.host} />
                        <div style={{ minWidth: 0 }}>
                          <div
                            className="ci-name"
                            style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}
                          >
                            {r.recipeName}
                          </div>
                          <div className="ci-sub">
                            {r.id} · {HOSTS[r.host].display}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{fmtRelative(r.started)}</td>
                    <td className="num tabular">
                      {r.status === "running" || r.status === "failed" ? "—" : fmtInt(r.records)}
                    </td>
                    <td className="num tabular">
                      {r.changes > 0 ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Icon name="diff" size={11} style={{ color: "var(--accent-deep)" }} />
                          {r.changes}
                        </span>
                      ) : r.status === "running" || r.status === "failed" ? (
                        "—"
                      ) : (
                        "0"
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
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader
              title="Latest extracted records"
              sub="Y Combinator — Front Page · run 8f31 · 3m ago"
              action={
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="ghost" size="sm" icon="csv">
                    CSV
                  </Button>
                  <Button variant="ghost" size="sm" icon="json">
                    JSON
                  </Button>
                </div>
              }
            />
            <table className="tbl">
              <thead>
                <tr>
                  <th className="num" style={{ width: 40 }}>
                    #
                  </th>
                  <th>Title</th>
                  <th>User</th>
                  <th className="num">Points</th>
                  <th className="num">Comments</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_LATEST_RECORDS.map((r) => (
                  <tr key={r.rank}>
                    <td className="num muted tabular">{r.rank}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <a
                          className="row-link"
                          href="#"
                          onClick={(e) => e.preventDefault()}
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 460 }}
                        >
                          {r.title}
                        </a>
                        <Icon name="external" size={12} style={{ color: "var(--text-faint)" }} />
                      </div>
                    </td>
                    <td className="muted mono" style={{ fontSize: 12 }}>
                      {r.user}
                    </td>
                    <td className="num tabular">{r.points}</td>
                    <td className="num tabular">{r.comments}</td>
                    <td className="muted">{r.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <Button variant="ghost" trailingIcon="arrowRight">
                Watch 2-min tour
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent activity" sub="Last 24 hours" />
            <div style={{ padding: "4px 0" }}>
              {DEMO_ACTIVITY.map((a, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "10px 18px",
                    borderBottom: i < DEMO_ACTIVITY.length - 1 ? "1px solid var(--divider)" : "0"
                  }}
                >
                  <ActivityDot type={a.type} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.35 }}>{a.text}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                      {a.meta} · {fmtRelative(a.ts)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Workspace" sub="Ocean Mata · Team plan" />
            <div style={{ padding: "12px 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div className="ws-avatar" style={{ width: 36, height: 36, fontSize: 13, borderRadius: 9 }}>
                  OM
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>Ocean Mata</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    workspace · oceanmata.scraptheweb.app
                  </div>
                </div>
                <div style={{ display: "flex", marginRight: 4 }}>
                  {["Ondrej Hrabal", "Mia Chen", "Pavel Kvas", "Luna Park"].map((n, i) => (
                    <div key={n} style={{ marginLeft: i ? -8 : 0, border: "2px solid white", borderRadius: "50%" }}>
                      <Avatar name={n} size={22} />
                    </div>
                  ))}
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
                      color: "var(--success-fg)",
                      fontWeight: 550
                    }}
                  >
                    <Icon name="checkCircle" size={12} /> Verified
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Two-factor</div>
                  <div style={{ marginTop: 2, fontWeight: 550 }}>Enabled (TOTP)</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>API keys</div>
                  <div style={{ marginTop: 2, fontWeight: 550 }}>2 active</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Active sessions</div>
                  <div style={{ marginTop: 2, fontWeight: 550 }}>3 devices</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
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
  recipes
}: WorkspaceDataProps & {
  onOpenBuilder: () => void;
  onRunRecipe: (recipeId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "healthy" | "review" | "failed">("all");

  const merged = mergeRecipes(recipes);
  const counts = {
    all: merged.length,
    healthy: merged.filter((r) => r.status === "completed").length,
    review: merged.filter((r) => r.status === "needs").length,
    failed: merged.filter((r) => r.status === "failed").length
  };
  const visible = merged.filter((r) => {
    if (filter === "all") return true;
    if (filter === "healthy") return r.status === "completed";
    if (filter === "review") return r.status === "needs";
    if (filter === "failed") return r.status === "failed";
    return true;
  });

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
          <Button variant="secondary" icon="download">
            Import
          </Button>
          <Button variant="primary" icon="plus" onClick={onOpenBuilder}>
            New recipe
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 16 }}>
        <KPI icon="recipe" label="Saved recipes" value={merged.length} delta="+2 this week" deltaDir="up" spark={[3, 4, 5, 6, 7, 8, 9]} />
        <KPI
          icon="checkCircle"
          label="Healthy"
          value={counts.healthy}
          delta={merged.length ? `${Math.round((counts.healthy / merged.length) * 100)}%` : "—"}
          deltaDir="flat"
          spark={[5, 5, 6, 6, 7, 7, 7]}
        />
        <KPI
          icon="alert"
          label="Needs review"
          value={counts.review}
          delta={counts.review > 0 ? "Selector drift" : "0"}
          deltaDir={counts.review > 0 ? "down" : "flat"}
          spark={[0, 0, 1, 0, 1, 0, 1]}
        />
        <KPI icon="diff" label="Avg fields per recipe" value="6.0" delta="—" deltaDir="flat" spark={[5, 5, 5, 6, 6, 6, 6]} />
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "all", label: "All", count: counts.all },
          { value: "healthy", label: "Healthy", count: counts.healthy },
          { value: "review", label: "Needs review", count: counts.review },
          { value: "failed", label: "Failed", count: counts.failed }
        ]}
      />

      <div className="toolbar">
        <div className="search-box" style={{ width: 280, height: 30 }}>
          <Icon name="search" size={14} />
          <input placeholder="Search recipes by name or domain…" />
        </div>
        <Chip label="Domain" value="All" />
        <Chip label="Page type" value="Any" />
        <Chip label="Last run" value="Anytime" />
        <div className="grow" />
        <Button variant="ghost" size="sm" icon="sort">
          Sort: Last run
        </Button>
        <Segmented<"rows" | "grid">
          value="rows"
          onChange={() => undefined}
          options={[
            { value: "rows", icon: "list", label: "Rows" },
            { value: "grid", icon: "grid", label: "Grid" }
          ]}
        />
      </div>

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
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="cell-main">
                    <FaviconTile host={r.host} />
                    <div style={{ minWidth: 0 }}>
                      <div className="ci-name">{r.name}</div>
                      <div className="ci-sub">{r.id}</div>
                    </div>
                  </div>
                </td>
                <td className="muted">{HOSTS[r.host]?.display ?? r.host}</td>
                <td>
                  <Badge tone="outline">{r.pageType}</Badge>
                </td>
                <td className="num tabular">{r.fields}</td>
                <td className="muted">{fmtRelative(r.lastRun)}</td>
                <td className="num tabular">{fmtInt(r.records)}</td>
                <td>
                  <StatusBadge status={r.status === "completed" ? "healthy" : r.status} />
                </td>
                <td>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                    <Button variant="secondary" size="sm" icon="play" onClick={() => r.realId && onRunRecipe(r.realId)}>
                      Run now
                    </Button>
                    <button type="button" className="icon-btn" style={{ width: 28, height: 28 }}>
                      <Icon name="more" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const merged = mergeRuns(runs, recipes);
  const counts = {
    all: merged.length,
    running: merged.filter((r) => r.status === "running").length,
    completed: merged.filter((r) => r.status === "completed").length,
    failed: merged.filter((r) => r.status === "failed").length
  };
  const visible = merged.filter((r) => filter === "all" || r.status === filter);

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
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="refresh">
            Refresh
          </Button>
          <Button variant="primary" icon="play">
            Run all
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 16 }}>
        <KPI icon="runs" label="Runs (24h)" value="38" delta="+12% vs prev day" deltaDir="up" spark={[2, 3, 3, 4, 5, 4, 5, 5, 6, 7, 8]} />
        <KPI icon="checkCircle" label="Success rate" value="96%" delta="+1.4%" deltaDir="up" spark={[92, 93, 93, 94, 94, 95, 95, 96, 96, 96, 96]} />
        <KPI icon="clock" label="Median latency" value="5.2s" delta="−0.8s" deltaDir="down" spark={[7, 6.5, 6, 5.8, 5.4, 5.5, 5.3, 5.2, 5.2, 5, 5.2]} />
        <KPI icon="alert" label="Failed (24h)" value="2" delta="Amazon DP" deltaDir="down" spark={[0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1]} />
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
          <input placeholder="Search by run ID or recipe…" />
        </div>
        <Chip label="Recipe" value="All" />
        <Chip label="Started" value="Last 7 days" />
        <div className="grow" />
        <Button variant="ghost" size="sm" icon="sort">
          Sort: Newest
        </Button>
      </div>

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
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {r.id}
                </td>
                <td>
                  <div className="cell-main">
                    <FaviconTile host={r.host} />
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
                        {r.recipeName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="muted mono" style={{ fontSize: 12 }}>
                  {HOSTS[r.host]?.display ?? r.host}
                </td>
                <td className="muted">{fmtRelative(r.started)}</td>
                <td className="num tabular">{r.duration ? fmtDuration(r.duration) : "—"}</td>
                <td className="num tabular">
                  {r.status === "running" || r.status === "failed" ? "—" : fmtInt(r.records)}
                </td>
                <td className="num tabular">
                  {r.status === "running" || r.status === "failed" ? "—" : r.changes || "0"}
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
                      onClick={() => r.real && onOpenRun(r.real)}
                    >
                      <Icon name="chevronRight" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card>
        <CardHeader
          title="Latest extracted records"
          sub="From the most recent completed run — Y Combinator · Front Page"
          action={
            <div style={{ display: "flex", gap: 6 }}>
              <Button variant="ghost" size="sm" icon="csv">
                CSV
              </Button>
              <Button variant="ghost" size="sm" icon="json">
                JSON
              </Button>
            </div>
          }
        />
        <table className="tbl">
          <thead>
            <tr>
              <th className="num" style={{ width: 40 }}>
                #
              </th>
              <th>Title</th>
              <th>User</th>
              <th className="num">Points</th>
              <th className="num">Comments</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_LATEST_RECORDS.map((r) => (
              <tr key={r.rank}>
                <td className="num muted tabular">{r.rank}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <a
                      className="row-link"
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}
                    >
                      {r.title}
                    </a>
                    <Icon name="external" size={12} style={{ color: "var(--text-faint)" }} />
                  </div>
                </td>
                <td className="muted mono" style={{ fontSize: 12 }}>
                  {r.user}
                </td>
                <td className="num tabular">{r.points}</td>
                <td className="num tabular">{r.comments}</td>
                <td className="muted">{r.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
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
  const merged = mergeRuns(runs, recipes);
  const completed = merged.filter((r) => r.status === "completed");

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
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="webhook">
            Webhooks
          </Button>
          <Button variant="primary" icon="download">
            Bulk export
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
        <KPI icon="csv" label="CSV exports (30d)" value="84" delta="+18" deltaDir="up" spark={[3, 4, 3, 5, 4, 6, 7, 8, 9, 10, 12]} />
        <KPI icon="json" label="JSON exports (30d)" value="61" delta="+22" deltaDir="up" spark={[1, 2, 3, 4, 5, 5, 7, 8, 9, 10, 11]} />
        <KPI icon="records" label="Records exported" value="74,209" delta="+12,840" deltaDir="up" spark={[400, 420, 500, 540, 600, 700, 800, 820, 900, 950, 1100]} />
        <KPI icon="webhook" label="Webhook deliveries" value="312" delta="all OK" deltaDir="up" spark={[10, 12, 14, 15, 18, 18, 20, 22, 24, 26, 28]} />
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
          <Button variant="ghost" size="sm" trailingIcon="external">
            Read docs
          </Button>
        </div>
      </Card>

      <div className="toolbar">
        <div className="search-box" style={{ width: 280, height: 30 }}>
          <Icon name="search" size={14} />
          <input placeholder="Search exportable runs…" />
        </div>
        <Chip label="Format" value="CSV + JSON" />
        <Chip label="Completed" value="Last 30 days" />
        <div className="grow" />
        <Button variant="ghost" size="sm" icon="sort">
          Sort: Newest
        </Button>
      </div>

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
              <th style={{ width: 240, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {r.id}
                </td>
                <td>
                  <div className="cell-main">
                    <FaviconTile host={r.host} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="ci-name"
                        style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 240 }}
                      >
                        {r.recipeName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="muted mono" style={{ fontSize: 12 }}>
                  {HOSTS[r.host]?.display ?? r.host}
                </td>
                <td className="num tabular">{fmtInt(r.records)}</td>
                <td className="muted">{fmtRelative(r.started)}</td>
                <td>
                  <StatusBadge status="completed" />
                </td>
                <td>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="csv"
                      disabled={!r.real || exportBusy === "csv"}
                      onClick={() => r.real && onDownloadExport(r.real.id, "csv")}
                    >
                      CSV
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="json"
                      disabled={!r.real || exportBusy === "json"}
                      onClick={() => r.real && onDownloadExport(r.real.id, "json")}
                    >
                      JSON
                    </Button>
                    <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} title="More">
                      <Icon name="more" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

export function SettingsView() {
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
          { value: "members", label: "Members", count: 4 },
          { value: "notifications", label: "Notifications" },
          { value: "integrations", label: "Integrations" },
          { value: "keys", label: "API keys" },
          { value: "security", label: "Security" },
          { value: "billing", label: "Billing" }
        ]}
      />

      <div style={{ marginTop: 24 }}>
        {tab === "workspace" && <SettingsWorkspace />}
        {tab === "members" && <SettingsMembers />}
        {tab === "notifications" && <SettingsNotifications />}
        {tab === "integrations" && <SettingsIntegrations />}
        {tab === "keys" && <SettingsApiKeys />}
        {tab === "security" && <SettingsSecurity />}
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

function SettingsWorkspace() {
  return (
    <Card style={{ padding: "4px 24px 24px" }}>
      <SettingsRow title="Workspace identity" description="Shown to teammates in the app and on exports.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldLabel label="Workspace name">
            <TextInput defaultValue="Ocean Mata" />
          </FieldLabel>
          <FieldLabel label="Slug">
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <span
                style={{
                  height: 34,
                  padding: "0 10px",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-strong)",
                  borderRight: 0,
                  borderRadius: "7px 0 0 7px",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12.5,
                  color: "var(--text-muted)"
                }}
              >
                scraptheweb.app/
              </span>
              <TextInput defaultValue="oceanmata" style={{ borderRadius: "0 7px 7px 0" }} />
            </div>
          </FieldLabel>
        </div>
      </SettingsRow>

      <SettingsRow title="Default export format" description="New users will see this format selected first.">
        <Segmented<"csv" | "json">
          value="csv"
          onChange={() => undefined}
          options={[
            { value: "csv", icon: "csv", label: "CSV" },
            { value: "json", icon: "json", label: "JSON" }
          ]}
        />
      </SettingsRow>

      <SettingsRow title="Brand color" description="Used on shared exports and webhook badges.">
        <div style={{ display: "flex", gap: 8 }}>
          {["#5B5BD6", "#1B7F5B", "#0E6FB7", "#B85C00", "#7A3AC4", "#0E1726"].map((c, i) => (
            <div
              key={c}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: c,
                border: i === 0 ? "2px solid var(--text-primary)" : "1px solid var(--border)",
                cursor: "pointer",
                boxShadow: "var(--shadow-xs)"
              }}
            />
          ))}
        </div>
      </SettingsRow>

      <SettingsRow
        title="Danger zone"
        description="Deleting the workspace removes all recipes, runs, and exports. This action is irreversible."
      >
        <Button variant="danger" icon="trash">
          Delete workspace…
        </Button>
      </SettingsRow>
    </Card>
  );
}

function SettingsMembers() {
  const members = [
    { name: "Ondrej Hrabal", email: "ondrej@oceanmata.com", role: "Owner", added: "Jan 12, 2025" },
    { name: "Mia Chen", email: "mia@oceanmata.com", role: "Admin", added: "Feb 4, 2025" },
    { name: "Pavel Kvas", email: "pavel@oceanmata.com", role: "Member", added: "Mar 28, 2025" },
    { name: "Luna Park", email: "luna@oceanmata.com", role: "Viewer", added: "Apr 09, 2025" }
  ];
  return (
    <div>
      <div className="toolbar" style={{ padding: 0, marginBottom: 16 }}>
        <div className="search-box" style={{ width: 280, height: 30 }}>
          <Icon name="search" size={14} />
          <input placeholder="Search members…" />
        </div>
        <Chip label="Role" value="All" />
        <div className="grow" />
        <Button variant="primary" icon="plus">
          Invite
        </Button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Added</th>
              <th style={{ textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.email}>
                <td>
                  <div className="cell-main">
                    <Avatar name={m.name} size={28} />
                    <div>
                      <div className="ci-name">{m.name}</div>
                      <div className="ci-sub" style={{ fontFamily: "var(--font-sans)" }}>
                        {m.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge tone={m.role === "Owner" ? "accent" : "outline"}>{m.role}</Badge>
                </td>
                <td className="muted">{m.added}</td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="icon-btn" style={{ width: 28, height: 28 }}>
                    <Icon name="more" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsNotifications() {
  const channels = [
    {
      id: "run_completed",
      label: "Run completed",
      desc: "When a run finishes with at least one record",
      email: true,
      slack: true,
      webhook: false
    },
    {
      id: "run_failed",
      label: "Run failed",
      desc: "Selector returned 0, page didn't load, etc.",
      email: true,
      slack: true,
      webhook: true
    },
    {
      id: "changes",
      label: "Changes detected",
      desc: "New, changed, or removed records since last run",
      email: true,
      slack: false,
      webhook: true
    },
    {
      id: "needs_review",
      label: "Needs review",
      desc: "When a selector drifts and the recipe can't auto-repair",
      email: true,
      slack: true,
      webhook: false
    },
    {
      id: "quota",
      label: "Quota threshold",
      desc: "When the workspace passes 80% of monthly records",
      email: true,
      slack: false,
      webhook: false
    }
  ];
  return (
    <Card>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: "44%" }}>Event</th>
            <th style={{ width: 90 }}>Email</th>
            <th style={{ width: 90 }}>Slack</th>
            <th style={{ width: 110 }}>Webhook</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="ci-name">{c.label}</div>
                <div className="ci-sub" style={{ fontFamily: "var(--font-sans)" }}>
                  {c.desc}
                </div>
              </td>
              <td>
                <Toggle initial={c.email} />
              </td>
              <td>
                <Toggle initial={c.slack} />
              </td>
              <td>
                <Toggle initial={c.webhook} />
              </td>
              <td>
                <Button variant="ghost" size="sm" trailingIcon="chevronRight">
                  Configure
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Toggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      style={{
        width: 32,
        height: 18,
        borderRadius: 999,
        background: on ? "var(--accent)" : "var(--surface-sunken)",
        border: on ? "0" : "1px solid var(--border-strong)",
        position: "relative",
        padding: 0,
        transition: "background .15s",
        cursor: "pointer"
      }}
      aria-pressed={on}
    >
      <span
        style={{
          position: "absolute",
          top: on ? 2 : 1,
          left: on ? 16 : 1,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          transition: "left .15s"
        }}
      />
    </button>
  );
}

function SettingsIntegrations() {
  const ints: Array<{ id: string; name: string; desc: string; icon: IconName; connected: boolean; meta?: string }> = [
    { id: "slack", name: "Slack", desc: "Send alerts to channels or DMs", icon: "slack", connected: true, meta: "#monitors-alerts" },
    { id: "webhook", name: "Webhook", desc: "POST records to any HTTP endpoint", icon: "webhook", connected: true, meta: "2 endpoints" },
    { id: "sheets", name: "Google Sheets", desc: "Append records to a spreadsheet", icon: "grid", connected: false },
    { id: "zapier", name: "Zapier", desc: "Trigger thousands of apps on each run", icon: "zap", connected: false },
    { id: "github", name: "GitHub Issues", desc: "Open issues on detected changes", icon: "github", connected: false },
    { id: "supabase", name: "Supabase", desc: "Sync records to a Postgres table", icon: "database", connected: false }
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
            {i.connected ? (
              <Badge tone="success" dot>
                Connected
              </Badge>
            ) : null}
          </div>
          {i.connected ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 6,
                borderTop: "1px solid var(--divider)"
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{i.meta}</span>
              <Button variant="ghost" size="sm">
                Configure
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" icon="plus" style={{ alignSelf: "flex-start" }}>
              Connect
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

function SettingsApiKeys() {
  const keys = [
    { id: "k1", name: "Production", prefix: "stw_live_8f31…b2", created: "Mar 21, 2025", last: "3 minutes ago" },
    { id: "k2", name: "Local dev", prefix: "stw_test_4a90…d1", created: "Jan 09, 2025", last: "yesterday" }
  ];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          API keys grant programmatic access to your workspace&apos;s recipes and runs. Treat them like passwords.
        </div>
        <Button variant="primary" icon="plus">
          Create key
        </Button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Created</th>
              <th>Last used</th>
              <th style={{ textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="ci-name">{k.name}</td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {k.prefix}
                </td>
                <td className="muted">{k.created}</td>
                <td className="muted">{k.last}</td>
                <td style={{ textAlign: "right" }}>
                  <Button variant="danger" size="sm" icon="trash">
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Active sessions</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 }}>
          Devices currently signed in to ondrej@oceanmata.com.
        </div>
        <Card>
          {[
            { device: "Macbook Pro · Chrome", loc: "Prague, CZ", time: "Active now", current: true },
            { device: "iPhone 15 · Safari", loc: "Prague, CZ", time: "2 hours ago" },
            { device: "Macbook Air · Safari", loc: "Berlin, DE", time: "3 days ago" }
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: "12px 18px",
                borderBottom: i < 2 ? "1px solid var(--divider)" : 0,
                display: "flex",
                alignItems: "center",
                gap: 12
              }}
            >
              <Icon name="shield" size={16} style={{ color: "var(--text-muted)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 550, fontSize: 13 }}>
                  {s.device} {s.current ? <Badge tone="accent">This device</Badge> : null}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {s.loc} · {s.time}
                </div>
              </div>
              {!s.current ? (
                <Button variant="danger" size="sm">
                  Revoke
                </Button>
              ) : null}
            </div>
          ))}
          <div style={{ padding: 14, display: "flex", justifyContent: "flex-end" }}>
            <Button variant="danger" icon="lock">
              Revoke all other sessions
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsSecurity() {
  return (
    <Card style={{ padding: "4px 24px 24px" }}>
      <SettingsRow title="Email address" description="Used for sign-in, alerts, and password reset.">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TextInput defaultValue="ondrej@oceanmata.com" style={{ maxWidth: 320 }} />
          <Badge tone="success" dot>
            Verified
          </Badge>
        </div>
      </SettingsRow>
      <SettingsRow title="Password" description="Last changed 38 days ago.">
        <Button variant="secondary" icon="key">
          Change password
        </Button>
      </SettingsRow>
      <SettingsRow title="Two-factor auth" description="An authenticator app or hardware security key.">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Badge tone="success" dot>
            Enabled — TOTP
          </Badge>
          <Button variant="ghost" size="sm">
            Manage devices
          </Button>
        </div>
      </SettingsRow>
      <SettingsRow title="Account email verification" description="ondrej@oceanmata.com is verified.">
        <Button variant="ghost" size="sm" icon="mail">
          Resend verification email
        </Button>
      </SettingsRow>
    </Card>
  );
}

function SettingsBilling() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 16 }}>
      <Card>
        <CardHeader title="Current plan" sub="Team · billed monthly" />
        <div style={{ padding: "16px 18px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>€199</span>
            <span style={{ color: "var(--text-muted)", fontSize: 12.5 }}>/month · renews June 7, 2026</span>
          </div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <BillingStat label="Records" used={12408} cap={25000} />
            <BillingStat label="Recipes" used={9} cap={50} />
            <BillingStat label="Seats" used={4} cap={5} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <Button variant="primary">Upgrade plan</Button>
            <Button variant="ghost">Manage billing portal</Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Payment method" sub="Default card on file" />
        <div style={{ padding: "16px 18px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 10
            }}
          >
            <Icon name="card" size={18} style={{ color: "var(--text-secondary)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 550 }}>Visa ending 4242</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Expires 09/2027</div>
            </div>
            <Button variant="ghost" size="sm">
              Update
            </Button>
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-secondary)" }}>
            Invoices are sent to{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 550 }}>billing@oceanmata.com</span>.
          </div>
        </div>
      </Card>
    </div>
  );
}

function BillingStat({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = Math.min(100, (used / cap) * 100);
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
        {fmtInt(used)}{" "}
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>/ {fmtInt(cap)}</span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 4,
          borderRadius: 999,
          background: "var(--surface-sunken)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct > 80 ? "var(--warning)" : "var(--accent)"
          }}
        />
      </div>
    </div>
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

function mergeRuns(
  real: ExtractionRun[],
  recipes: Recipe[]
): Array<DemoRun & { real?: ExtractionRun }> {
  const realMapped: Array<DemoRun & { real: ExtractionRun }> = real.map((run) => {
    const recipe = recipes.find((r) => r.id === run.recipeId);
    return {
      id: run.id.slice(0, 8),
      real: run,
      recipe: run.recipeId,
      recipeName: recipe?.name ?? run.recipeId.slice(0, 8),
      host: detectHost(run.url) ?? "ycombinator",
      started: run.startedAt ? new Date(run.startedAt).getTime() : Date.now(),
      duration: durationSeconds(run.startedAt, run.finishedAt),
      records: run.records.length,
      changes: runChangeCount(run),
      status: (run.status as DemoRun["status"]) ?? "completed"
    };
  });
  if (realMapped.length > 0) {
    return realMapped;
  }
  return DEMO_RUNS;
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

function durationSeconds(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return 0;
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000);
}

function runChangeCount(run: ExtractionRun) {
  return run.changes.new.length + run.changes.changed.length + run.changes.removed.length;
}

// Re-export empty-state placeholder for back-compat
export { EmptyState };
