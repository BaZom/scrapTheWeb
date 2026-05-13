import type { Dashboard, ExtractionRun, Recipe } from "@/lib/api";
import type { ReactNode } from "react";

import {
  Badge,
  Button,
  EmptyState,
  FieldLabel,
  Panel,
  SectionTitle,
  StatCard,
  StatusPill,
  TextInput
} from "./ui";

type WorkspaceDataProps = {
  error?: string | null;
  loading?: boolean;
  recipes: Recipe[];
  runs: ExtractionRun[];
};

export function DashboardView({
  dashboard,
  error,
  loading,
  onCreateRecipe,
  onOpenProfile,
  recipes,
  runs
}: WorkspaceDataProps & {
  dashboard: Dashboard | null;
  onCreateRecipe: () => void;
  onOpenProfile: () => void;
}) {
  const organization = dashboard?.organizations[0];
  const completedRuns = runs.filter((run) => run.status === "completed");
  const recordCount = completedRuns.reduce((total, run) => total + run.records.length, 0);
  const changeCount = runs.reduce((total, run) => total + runChangeCount(run), 0);
  const latestRunWithRecords = runs.find((run) => run.records.length > 0);

  return (
    <div className="space-y-6">
      <WorkspaceNotice error={error} loading={loading} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saved Recipes"
          value={recipes.length}
          detail={organization ? organization.name : "Workspace loading"}
          tone="blue"
        />
        <StatCard label="Runs" value={runs.length} detail={`${completedRuns.length} completed`} tone="green" />
        <StatCard label="Records Extracted" value={recordCount} detail="Stored from completed runs" tone="violet" />
        <StatCard label="Changes Detected" value={changeCount} detail="New, changed, and removed records" tone="amber" />
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <SectionTitle
              action={
                <Button onClick={onCreateRecipe} type="button">
                  Open Builder
                </Button>
              }
              description="Recent recipe executions from the database."
              eyebrow="Activity"
              title="Latest runs"
            />
          </div>
          {runs.length > 0 ? (
            <RunsTable recipes={recipes} runs={runs.slice(0, 6)} />
          ) : (
            <div className="p-5">
              <EmptyState>Create and run a recipe to see workspace activity here.</EmptyState>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel className="p-5">
            <SectionTitle eyebrow="Account" title="Workspace access" />
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Signed in as {dashboard?.user.email ?? "loading account"}. API keys, verification, and session controls are available from your profile.
            </p>
            <Button className="mt-4 w-full" onClick={onOpenProfile} type="button" variant="secondary">
              Open Profile
            </Button>
          </Panel>

          <Panel className="p-5">
            <SectionTitle eyebrow="Workflow" title="Live extraction flow" />
            <div className="mt-5 grid gap-3">
              {["Load URL", "Select Container", "Map Fields", "Run Recipe"].map((step, index) => (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" key={step}>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold text-slate-950">{step}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <SectionTitle
            eyebrow="Records"
            title="Latest extracted records"
            description={latestRunWithRecords ? `From ${recipeNameForRun(latestRunWithRecords, recipes)}` : undefined}
          />
        </div>
        {latestRunWithRecords ? (
          <RecordsTable records={latestRunWithRecords.records.slice(0, 8)} />
        ) : (
          <div className="p-5">
            <EmptyState>No extracted records are stored yet. Run a saved recipe and completed records will appear here.</EmptyState>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function MonitorsView({
  error,
  loading,
  onCreateRecipe,
  onRunRecipe,
  recipes,
  runs
}: WorkspaceDataProps & {
  onCreateRecipe: () => void;
  onRunRecipe: (recipeId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <WorkspaceNotice error={error} loading={loading} />
      <Panel className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <SectionTitle
            action={<Button onClick={onCreateRecipe} type="button">Create Recipe</Button>}
            description="Scheduling is not persisted yet, so this page shows saved sources that can become scheduled monitors."
            eyebrow="Sources"
            title="Saved monitor sources"
          />
        </div>
        {recipes.length > 0 ? (
          <RecipesTable actionLabel="Run now" onRecipeAction={onRunRecipe} recipes={recipes} runs={runs} />
        ) : (
          <div className="p-5">
            <EmptyState>Create a recipe to add the first monitored source.</EmptyState>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function MonitorDetailView() {
  return (
    <EmptyProductPage
      description="Select a scheduled monitor once monitor persistence is added. Today, recipe runs and records are available from Recipes and Runs."
      eyebrow="Monitor Detail"
      title="No monitor selected"
    />
  );
}

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
  return (
    <div className="space-y-6">
      <WorkspaceNotice error={error} loading={loading} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recipes" value={recipes.length} detail="Saved extraction templates" tone="blue" />
        <StatCard label="Validated" value={recipes.filter((recipe) => recipe.status === "active").length} detail="Ready to run" tone="green" />
        <StatCard label="Fields" value={recipes.reduce((total, recipe) => total + recipeFieldCount(recipe), 0)} detail="Mapped fields" tone="violet" />
        <StatCard label="Runs" value={runs.length} detail="All saved recipes" tone="amber" />
      </div>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <SectionTitle
            action={<Button onClick={onOpenBuilder} type="button">New Recipe</Button>}
            description="Saved extraction templates loaded from the workspace database."
            eyebrow="Recipes"
            title="Extraction recipes"
          />
        </div>
        {recipes.length > 0 ? (
          <RecipesTable actionLabel="Run" onRecipeAction={onRunRecipe} recipes={recipes} runs={runs} />
        ) : (
          <div className="p-5">
            <EmptyState>No recipes are saved yet. Build one from a public URL to populate this table.</EmptyState>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function RunsView({
  error,
  loading,
  onOpenRun,
  recipes,
  runs
}: WorkspaceDataProps & {
  onOpenRun: (run: ExtractionRun) => void;
}) {
  const latestRunWithRecords = runs.find((run) => run.records.length > 0);

  return (
    <div className="space-y-6">
      <WorkspaceNotice error={error} loading={loading} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Runs" value={runs.length} detail="Stored executions" tone="blue" />
        <StatCard label="Completed" value={runs.filter((run) => run.status === "completed").length} detail="Ready to export" tone="green" />
        <StatCard label="Failed" value={runs.filter((run) => run.status === "failed").length} detail="Need review" tone="red" />
        <StatCard label="Records" value={runs.reduce((total, run) => total + run.records.length, 0)} detail="Extracted rows" tone="violet" />
      </div>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <SectionTitle
            description="Execution history with stored records and change counts."
            eyebrow="Runs"
            title="Run history"
          />
        </div>
        {runs.length > 0 ? (
          <RunsTable onOpenRun={onOpenRun} recipes={recipes} runs={runs} />
        ) : (
          <div className="p-5">
            <EmptyState>No runs are stored yet. Run a saved recipe to populate the history.</EmptyState>
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <SectionTitle
            description={latestRunWithRecords ? `From ${recipeNameForRun(latestRunWithRecords, recipes)}` : undefined}
            eyebrow="Records"
            title="Latest run records"
          />
        </div>
        {latestRunWithRecords ? (
          <RecordsTable records={latestRunWithRecords.records.slice(0, 20)} />
        ) : (
          <div className="p-5">
            <EmptyState>No extracted records are available yet.</EmptyState>
          </div>
        )}
      </Panel>
    </div>
  );
}

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
  const completedRuns = runs.filter((run) => run.status === "completed");

  return (
    <div className="space-y-6">
      <WorkspaceNotice error={error} loading={loading} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Exportable Runs" value={completedRuns.length} detail="Completed executions" tone="blue" />
        <StatCard label="CSV" value={completedRuns.length} detail="Generated on download" tone="green" />
        <StatCard label="JSON" value={completedRuns.length} detail="Generated on download" tone="violet" />
        <StatCard label="Records" value={completedRuns.reduce((total, run) => total + run.records.length, 0)} detail="Available for export" tone="amber" />
      </div>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <SectionTitle
            description="Exports are generated from completed runs, so every row here maps to stored records in the database."
            eyebrow="Exports"
            title="Available exports"
          />
        </div>
        {completedRuns.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  {["Run", "Recipe", "Source", "Records", "Completed", "Status", "Actions"].map((column) => (
                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completedRuns.map((run) => (
                  <tr className="bg-white hover:bg-slate-50/70" key={run.id}>
                    <td className="px-5 py-4 font-mono text-xs text-slate-700">{shortId(run.id)}</td>
                    <td className="px-5 py-4 font-medium text-slate-950">{recipeNameForRun(run, recipes)}</td>
                    <td className="px-5 py-4 text-slate-600">{domainForUrl(run.url)}</td>
                    <td className="px-5 py-4 text-slate-600">{run.records.length}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDate(run.finishedAt)}</td>
                    <td className="px-5 py-4"><StatusPill status={run.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="min-h-8 px-3"
                          disabled={exportBusy === "csv"}
                          onClick={() => onDownloadExport(run.id, "csv")}
                          type="button"
                          variant="secondary"
                        >
                          {exportBusy === "csv" ? "Preparing..." : "CSV"}
                        </Button>
                        <Button
                          className="min-h-8 px-3"
                          disabled={exportBusy === "json"}
                          onClick={() => onDownloadExport(run.id, "json")}
                          type="button"
                          variant="secondary"
                        >
                          {exportBusy === "json" ? "Preparing..." : "JSON"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState>Completed runs will appear here with CSV and JSON download actions.</EmptyState>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function SettingsView() {
  const tabs = ["Workspace", "Members", "Notifications", "Integrations", "API Keys", "Security", "Billing"];

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Panel className="p-3">
        {tabs.map((tab, index) => (
          <button
            className={index === 0 ? "flex w-full items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-left text-sm font-semibold text-white" : "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"}
            key={tab}
            type="button"
          >
            {tab}
            {index === 0 ? <span>-&gt;</span> : null}
          </button>
        ))}
      </Panel>
      <div className="space-y-6">
        <Panel className="p-5">
          <SectionTitle
            eyebrow="Workspace"
            title="Workspace settings"
            description="These controls are visual placeholders until workspace update endpoints are available."
          />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FieldLabel label="Workspace name"><TextInput disabled placeholder="Loaded from your account" /></FieldLabel>
            <FieldLabel label="Workspace URL"><TextInput disabled placeholder="Not configurable yet" /></FieldLabel>
            <FieldLabel label="Timezone"><TextInput disabled placeholder="Not configurable yet" /></FieldLabel>
            <FieldLabel label="Default export format"><TextInput disabled placeholder="Configured per run export" /></FieldLabel>
          </div>
          <Button className="mt-5" disabled type="button">Save changes</Button>
        </Panel>
        <Panel className="p-5">
          <SectionTitle eyebrow="Administration" title="Not connected yet" />
          <div className="mt-4">
            <EmptyState>
              Members, integrations, security policy, and billing screens need backend endpoints before they can modify real workspace state.
            </EmptyState>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function RecipesTable({
  actionLabel,
  onRecipeAction,
  recipes,
  runs
}: {
  actionLabel: string;
  onRecipeAction: (recipeId: string) => void;
  recipes: Recipe[];
  runs: ExtractionRun[];
}) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="border-b border-slate-200">
            {["Recipe", "Domain", "Page Type", "Fields", "Last Run", "Records", "Status", "Action"].map((column) => (
              <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {recipes.map((recipe) => {
            const latestRun = runs.find((run) => run.recipeId === recipe.id);
            return (
              <tr className="bg-white hover:bg-slate-50/70" key={recipe.id}>
                <td className="px-5 py-4">
                  <p className="font-medium text-slate-950">{recipe.name}</p>
                  <p className="mt-1 max-w-sm truncate text-xs text-slate-500">{recipe.url}</p>
                </td>
                <td className="px-5 py-4 text-slate-600">{domainForUrl(recipe.url)}</td>
                <td className="px-5 py-4 text-slate-600">{recipe.pageType}</td>
                <td className="px-5 py-4 text-slate-600">{recipeFieldCount(recipe)}</td>
                <td className="px-5 py-4 text-slate-600">{formatDate(latestRun?.finishedAt ?? latestRun?.startedAt)}</td>
                <td className="px-5 py-4 text-slate-600">{latestRun?.records.length ?? 0}</td>
                <td className="px-5 py-4"><StatusPill status={recipe.status} /></td>
                <td className="px-5 py-4">
                  <Button className="min-h-8 px-3" onClick={() => onRecipeAction(recipe.id)} type="button" variant="secondary">
                    {actionLabel}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunsTable({
  onOpenRun,
  recipes,
  runs
}: {
  onOpenRun?: (run: ExtractionRun) => void;
  recipes: Recipe[];
  runs: ExtractionRun[];
}) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="border-b border-slate-200">
            {["Run", "Recipe", "Source", "Started", "Duration", "Records", "Changes", "Status", "Action"].map((column) => (
              <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((run) => (
            <tr className="bg-white hover:bg-slate-50/70" key={run.id}>
              <td className="px-5 py-4 font-mono text-xs text-slate-700">{shortId(run.id)}</td>
              <td className="px-5 py-4 font-medium text-slate-950">{recipeNameForRun(run, recipes)}</td>
              <td className="px-5 py-4 text-slate-600">{domainForUrl(run.url)}</td>
              <td className="px-5 py-4 text-slate-600">{formatDate(run.startedAt)}</td>
              <td className="px-5 py-4 text-slate-600">{formatDuration(run.startedAt, run.finishedAt)}</td>
              <td className="px-5 py-4 text-slate-600">{run.records.length}</td>
              <td className="px-5 py-4 text-slate-600">{runChangeCount(run)}</td>
              <td className="px-5 py-4"><StatusPill status={run.status} /></td>
              <td className="px-5 py-4">
                {onOpenRun ? (
                  <Button className="min-h-8 px-3" onClick={() => onOpenRun(run)} type="button" variant="ghost">
                    View
                  </Button>
                ) : (
                  <Badge tone="neutral">Stored</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordsTable({ records }: { records: ExtractionRun["records"] }) {
  const columns = recordColumns(records).slice(0, 8);

  if (columns.length === 0) {
    return (
      <div className="p-5">
        <EmptyState>The latest run has records, but no field values were extracted.</EmptyState>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="border-b border-slate-200">
            <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              record_key
            </th>
            {columns.map((column) => (
              <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record) => (
            <tr className="bg-white hover:bg-slate-50/70" key={record.id}>
              <td className="max-w-[14rem] truncate px-5 py-4 font-mono text-xs text-slate-500">{record.recordKey}</td>
              {columns.map((column) => (
                <td className="max-w-[18rem] px-5 py-4 align-top text-slate-700" key={column}>
                  <span className="line-clamp-2 break-words">{formatRecordValue(record.data[column])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkspaceNotice({ error, loading }: { error?: string | null; loading?: boolean }) {
  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        {error}
      </div>
    );
  }

  if (!loading) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
      Refreshing workspace data...
    </div>
  );
}

function EmptyProductPage({
  action,
  description,
  eyebrow,
  title
}: {
  action?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <Panel className="p-5">
      <SectionTitle action={action} eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-5">
        <EmptyState>No real records are available for this page yet.</EmptyState>
      </div>
    </Panel>
  );
}

function recipeNameForRun(run: ExtractionRun, recipes: Recipe[]) {
  return recipes.find((recipe) => recipe.id === run.recipeId)?.name ?? shortId(run.recipeId);
}

function recipeFieldCount(recipe: Recipe) {
  const fields = recipe.config.fields;
  return Array.isArray(fields) ? fields.length : 0;
}

function recordColumns(records: ExtractionRun["records"]) {
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record.data)) {
      if (key && !seen.has(key)) {
        seen.add(key);
      }
    }
  }
  return Array.from(seen);
}

function runChangeCount(run: ExtractionRun) {
  return run.changes.new.length + run.changes.changed.length + run.changes.removed.length;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function domainForUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDuration(start?: string | null, end?: string | null) {
  if (!start || !end) {
    return "--";
  }
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatRecordValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
