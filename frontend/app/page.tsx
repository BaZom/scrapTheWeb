"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  type AuthSession,
  type Dashboard,
  type DomNode,
  type ExtractType,
  type ExtractionRun,
  type PageSession,
  type PreviewField,
  type PreviewResult,
  type Recipe,
  type SelectorResult,
  createPageSession,
  createRecipe,
  downloadRunExport,
  fetchScreenshot,
  generateSelector,
  getDashboard,
  getRun,
  listRecipes,
  listRuns,
  login,
  logout,
  previewPageSession,
  refreshSession,
  register,
  runRecipe
} from "@/lib/api";

import { AccountPanel, PasswordResetPanel } from "./components/account-panels";
import { AppShell } from "./components/app-shell";
import {
  DashboardView,
  ExportsView,
  MonitorDetailView,
  MonitorsView,
  RecipesView,
  RunsView,
  SettingsView
} from "./components/product-screens";
import {
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  FieldLabel,
  Panel,
  SectionTitle,
  StatCard,
  StatusPill,
  TextInput,
  cx,
  focusRing,
  inputClass
} from "./components/ui";
import type { AppView, DisplayRow } from "./data/product-ui";

const storageKey = "scraptheweb.auth";

type Mode = "login" | "register";
type PickerView = "overlays" | "nodes";
type PickMode = "container" | "field";
type StoredSession = Pick<AuthSession, "access_token" | "refresh_token">;

export default function Home() {
  const [mode, setMode] = useState<Mode>("register");
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [renderUrl, setRenderUrl] = useState("");
  const [pageSession, setPageSession] = useState<PageSession | null>(null);
  const [screenshotObjectUrl, setScreenshotObjectUrl] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<DomNode | null>(null);
  const [selectorResult, setSelectorResult] = useState<SelectorResult | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("container");
  const [fieldNode, setFieldNode] = useState<DomNode | null>(null);
  const [fieldSelector, setFieldSelector] = useState<SelectorResult | null>(null);
  const [fieldName, setFieldName] = useState("title");
  const [fieldExtract, setFieldExtract] = useState<ExtractType>("text");
  const [fieldAttribute, setFieldAttribute] = useState("");
  const [fields, setFields] = useState<PreviewField[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);
  const [run, setRun] = useState<ExtractionRun | null>(null);
  const [pickerView, setPickerView] = useState<PickerView>("overlays");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [selectorBusy, setSelectorBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<"csv" | "json" | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const overlayNodes = useMemo(() => {
    const nodes =
      pickMode === "field" && selectedNode
        ? (pageSession?.domNodes ?? []).filter((node) => isDescendant(node, selectedNode, pageSession?.domNodes ?? []))
        : pageSession?.domNodes ?? [];
    return nodes
      .filter((node) => node.width >= 8 && node.height >= 8)
      .sort((left, right) => right.width * right.height - left.width * left.height)
      .slice(0, 220);
  }, [pageSession, pickMode, selectedNode]);

  const fieldNodes = useMemo(() => {
    if (!pageSession || !selectedNode) {
      return [];
    }
    return pageSession.domNodes.filter((node) => isDescendant(node, selectedNode, pageSession.domNodes));
  }, [pageSession, selectedNode]);

  const runRecordColumns = useMemo(() => {
    const recordRows =
      run?.records.map((record) => ({
        id: record.id,
        values: record.data
      })) ?? [];
    return orderedColumns(recordRows, fields.map((field) => field.name));
  }, [fields, run]);

  const displayPreviewRows = useMemo(() => {
    if (!preview) {
      return [];
    }

    return displayRows(
      fields.map((field) => field.name),
      preview.rows.map((row, index) => ({
        id: String(index),
        values: row
      }))
    );
  }, [fields, preview]);

  const displayRunRecords = useMemo(() => {
    if (!run) {
      return [];
    }

    return displayRows(
      runRecordColumns,
      run.records.map((record) => ({
        id: record.id,
        values: record.data
      }))
    );
  }, [run, runRecordColumns]);

  async function fetchWorkspaceData(accessToken: string) {
    return Promise.all([getDashboard(accessToken), listRecipes(accessToken), listRuns(accessToken)]);
  }

  function applyWorkspaceData([
    nextDashboard,
    nextRecipes,
    nextRuns
  ]: Awaited<ReturnType<typeof fetchWorkspaceData>>) {
    setDashboard(nextDashboard);
    setRecipes(nextRecipes);
    setRuns(nextRuns);
    setWorkspaceError(null);
  }

  async function refreshWorkspaceData(accessToken = session?.access_token) {
    if (!accessToken) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      applyWorkspaceData(await fetchWorkspaceData(accessToken));
    } catch (refreshError) {
      setWorkspaceError(refreshError instanceof Error ? refreshError.message : "Workspace data refresh failed");
      throw refreshError;
    } finally {
      setWorkspaceBusy(false);
    }
  }

  function upsertRecipe(recipe: Recipe) {
    setRecipes((current) => [recipe, ...current.filter((candidate) => candidate.id !== recipe.id)]);
  }

  function upsertRun(nextRun: ExtractionRun) {
    setRuns((current) => [nextRun, ...current.filter((candidate) => candidate.id !== nextRun.id)]);
  }

  useEffect(() => {
    const rawSession = window.localStorage.getItem(storageKey);
    if (!rawSession) {
      return;
    }

    try {
      setSession(JSON.parse(rawSession) as StoredSession);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setDashboard(null);
      setRecipes([]);
      setRuns([]);
      setWorkspaceError(null);
      return;
    }
    let cancelled = false;
    const activeSession = session;

    async function loadWorkspace() {
      setError(null);
      setWorkspaceBusy(true);
      try {
        const data = await fetchWorkspaceData(activeSession.access_token);
        if (!cancelled) {
          applyWorkspaceData(data);
        }
      } catch (loadError) {
        try {
          const rotated = await refreshSession(activeSession.refresh_token);
          const nextSession = {
            access_token: rotated.access_token,
            refresh_token: rotated.refresh_token
          };
          window.localStorage.setItem(storageKey, JSON.stringify(nextSession));
          if (!cancelled) {
            setSession(nextSession);
            applyWorkspaceData(await fetchWorkspaceData(rotated.access_token));
          }
        } catch {
          window.localStorage.removeItem(storageKey);
          if (!cancelled) {
            setSession(null);
            setDashboard(null);
            setRecipes([]);
            setRuns([]);
            setWorkspaceError(loadError instanceof Error ? loadError.message : "Session expired");
            setError(loadError instanceof Error ? loadError.message : "Session expired");
          }
        }
      } finally {
        if (!cancelled) {
          setWorkspaceBusy(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    return () => {
      if (screenshotObjectUrl) {
        URL.revokeObjectURL(screenshotObjectUrl);
      }
    };
  }, [screenshotObjectUrl]);

  useEffect(() => {
    if (!session || !run || ["completed", "failed"].includes(run.status)) {
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      void getRun(run.id, session.access_token)
        .then((updatedRun) => {
          if (!cancelled) {
            setRun(updatedRun);
            upsertRun(updatedRun);
          }
        })
        .catch((pollError) => {
          if (!cancelled) {
            setError(pollError instanceof Error ? pollError.message : "Run status refresh failed");
          }
        });
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run, session]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const auth = mode === "register" ? await register(email, password) : await login(email, password);
      const nextSession = {
        access_token: auth.access_token,
        refresh_token: auth.refresh_token
      };
      window.localStorage.setItem(storageKey, JSON.stringify(nextSession));
      setSession(nextSession);
      setDashboard({
        user: auth.user,
        organizations: [auth.organization]
      });
      setRecipes([]);
      setRuns([]);
      setWorkspaceError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (session) {
      await logout(session.refresh_token);
    }
    window.localStorage.removeItem(storageKey);
    setSession(null);
    setDashboard(null);
    setRecipes([]);
    setRuns([]);
    setWorkspaceError(null);
    setPageSession(null);
    setScreenshotObjectUrl(null);
    setSelectedNode(null);
    setSelectorResult(null);
    setFieldNode(null);
    setFieldSelector(null);
    setFields([]);
    setPreview(null);
    setSavedRecipe(null);
    setRun(null);
    setPickMode("container");
    setImageSize(null);
  }

  async function handleRenderSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!session) {
      return;
    }

    setActiveView("builder");
    setRenderBusy(true);
    setError(null);
    setPageSession(null);
    setScreenshotObjectUrl(null);
    setSelectedNode(null);
    setSelectorResult(null);
    setFieldNode(null);
    setFieldSelector(null);
    setPreview(null);
    setSavedRecipe(null);
    setRun(null);
    setPickMode("container");
    setImageSize(null);

    try {
      const rendered = await createPageSession(renderUrl, session.access_token);
      setPageSession(rendered);
      setRecipeName((current) => current.trim() || suggestedRecipeName(renderUrl, rendered.title));
      if (rendered.screenshotUrl) {
        setScreenshotObjectUrl(await fetchScreenshot(rendered.screenshotUrl, session.access_token));
      }
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Render failed");
    } finally {
      setRenderBusy(false);
    }
  }

  async function handleNodeSelect(node: DomNode) {
    if (!session || !pageSession) {
      return;
    }

    setSelectedNode(node);
    setSelectorResult(null);
    setFieldNode(null);
    setFieldSelector(null);
    setFields([]);
    setPreview(null);
    setSavedRecipe(null);
    setRun(null);
    setPickMode("container");
    setSelectorBusy(true);
    setError(null);
    try {
      setSelectorResult(await generateSelector(pageSession.sessionId, node.nodeId, session.access_token));
    } catch (selectorError) {
      setError(selectorError instanceof Error ? selectorError.message : "Selector generation failed");
    } finally {
      setSelectorBusy(false);
    }
  }

  async function handleFieldNodeSelect(node: DomNode) {
    if (!session || !pageSession || !selectorResult) {
      return;
    }

    setFieldNode(node);
    setFieldSelector(null);
    setSelectorBusy(true);
    setError(null);
    try {
      const result = await generateSelector(
        pageSession.sessionId,
        node.nodeId,
        session.access_token,
        selectorResult.selector
      );
      setFieldSelector(result);
      if (!fieldName) {
        setFieldName(defaultFieldName(node));
      }
    } catch (selectorError) {
      setError(selectorError instanceof Error ? selectorError.message : "Field selector generation failed");
    } finally {
      setSelectorBusy(false);
    }
  }

  function addField() {
    if (!fieldSelector) {
      return;
    }
    const name = fieldName.trim();
    if (!name) {
      setError("Field name is required");
      return;
    }
    const nextField: PreviewField = {
      name,
      selector: fieldSelector.selector,
      extract: fieldExtract,
      ...(fieldExtract === "attribute" ? { attribute: fieldAttribute.trim() } : {})
    };
    setFields((current) => [...current.filter((field) => field.name !== name), nextField]);
    setFieldName("");
    setFieldSelector(null);
    setFieldNode(null);
    setPreview(null);
    setSavedRecipe(null);
    setRun(null);
  }

  async function runPreview(nextFields = fields) {
    if (!session || !pageSession || !selectorResult || nextFields.length === 0) {
      return;
    }
    setPreviewBusy(true);
    setError(null);
    try {
      setPreview(
        await previewPageSession(
          pageSession.sessionId,
          selectorResult.selector,
          nextFields,
          session.access_token
        )
      );
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Preview extraction failed");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSaveRecipe() {
    if (!session || !selectorResult || fields.length === 0) {
      return;
    }
    const name = recipeName.trim();
    if (!name) {
      setError("Recipe name is required");
      return;
    }
    setRecipeBusy(true);
    setError(null);
    setRun(null);
    try {
      const recipe = await createRecipe(name, renderUrl, selectorResult.selector, fields, session.access_token);
      setSavedRecipe(recipe);
      upsertRecipe(recipe);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Recipe save failed");
    } finally {
      setRecipeBusy(false);
    }
  }

  async function startRecipeRun(recipeId: string) {
    if (!session) {
      return;
    }
    setRunBusy(true);
    setError(null);
    try {
      const recipe = recipes.find((candidate) => candidate.id === recipeId);
      if (recipe) {
        setSavedRecipe(recipe);
      }
      const created = await runRecipe(recipeId, session.access_token);
      const firstRead = await getRun(created.runId, session.access_token);
      setRun(firstRead);
      upsertRun(firstRead);
      setActiveView("builder");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Recipe run failed");
    } finally {
      setRunBusy(false);
    }
  }

  async function handleRunRecipe() {
    if (!savedRecipe) {
      return;
    }
    await startRecipeRun(savedRecipe.id);
  }

  async function handleDownloadExport(runId: string, format: "csv" | "json") {
    if (!session) {
      return;
    }
    setExportBusy(format);
    setError(null);
    try {
      const blob = await downloadRunExport(runId, format, session.access_token);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `scraptheweb-run-${runId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      await refreshWorkspaceData(session.access_token).catch(() => undefined);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Export download failed");
    } finally {
      setExportBusy(null);
    }
  }

  function nodeLabel(node: DomNode) {
    const classText = node.classes.length > 0 ? `.${node.classes.slice(0, 2).join(".")}` : "";
    const idText = node.attrs.id ? `#${node.attrs.id}` : "";
    return `${node.tag}${idText}${classText}`;
  }

  function renderSegmentedButton<TValue extends string>({
    current,
    label,
    value,
    onSelect,
    disabled
  }: {
    current: TValue;
    label: string;
    value: TValue;
    onSelect: (value: TValue) => void;
    disabled?: boolean;
  }) {
    return (
      <button
        aria-pressed={current === value}
        className={cx(
          "min-h-9 rounded-lg px-3 text-sm font-semibold transition",
          focusRing,
          current === value
            ? "bg-white text-slate-950 shadow-sm"
            : "text-slate-600 hover:bg-white/70 disabled:text-slate-400"
        )}
        disabled={disabled}
        onClick={() => onSelect(value)}
        type="button"
      >
        {label}
      </button>
    );
  }

  function renderBuilderView() {
    return (
      <div className="space-y-6">
        <Panel className="p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {["Load URL", "Select Container", "Map Fields", "Preview Records", "Save Recipe"].map((step, index) => (
                <div
                  className={cx(
                    "flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold",
                    (index === 0 && pageSession) ||
                      (index === 1 && selectorResult) ||
                      (index === 2 && fields.length > 0) ||
                      (index === 3 && preview) ||
                      (index === 4 && savedRecipe)
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500"
                  )}
                  key={step}
                >
                  <span>{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>
            <form className="grid gap-2 xl:w-[42rem] xl:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleRenderSubmit}>
              <TextInput
                aria-label="Public page URL"
                onChange={(event) => setRenderUrl(event.target.value)}
                placeholder="https://example.com/listing-page"
                required
                type="url"
                value={renderUrl}
              />
              <Button disabled={renderBusy} type="submit">
                {renderBusy ? "Loading..." : "Load Page"}
              </Button>
            </form>
          </div>
          {error ? (
            <div
              aria-live="polite"
              className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
              role="status"
            >
              {error}
            </div>
          ) : null}
        </Panel>

        <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_26rem]">
          <Panel className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionTitle
                eyebrow="Canvas"
                title="Page preview workspace"
                description="Pick one repeated result card, then map fields inside that card."
              />
              <div className="flex flex-wrap gap-2">
                <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
                  {renderSegmentedButton({
                    current: pickMode,
                    label: "Container",
                    value: "container",
                    onSelect: setPickMode
                  })}
                  {renderSegmentedButton({
                    current: pickMode,
                    label: "Field",
                    value: "field",
                    onSelect: setPickMode,
                    disabled: !selectorResult
                  })}
                </div>
                <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
                  {renderSegmentedButton({
                    current: pickerView,
                    label: "Boxes",
                    value: "overlays",
                    onSelect: setPickerView
                  })}
                  {renderSegmentedButton({
                    current: pickerView,
                    label: "Nodes",
                    value: "nodes",
                    onSelect: setPickerView
                  })}
                </div>
              </div>
            </div>

            {pageSession ? (
              screenshotObjectUrl ? (
                pickerView === "overlays" ? (
                  <div className="max-h-[44rem] overflow-auto bg-slate-100">
                    <div className="relative min-w-[44rem]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={pageSession.title ?? "Rendered page screenshot"}
                        className="h-auto w-full"
                        onLoad={(event) =>
                          setImageSize({
                            width: event.currentTarget.naturalWidth,
                            height: event.currentTarget.naturalHeight
                          })
                        }
                        src={screenshotObjectUrl}
                      />
                      {imageSize
                        ? overlayNodes.map((node) => {
                            const selected =
                              selectedNode?.nodeId === node.nodeId || fieldNode?.nodeId === node.nodeId;
                            return (
                              <button
                                aria-label={`Select ${nodeLabel(node)}`}
                                className={cx(
                                  "absolute border transition focus-visible:z-10",
                                  focusRing,
                                  selected
                                    ? "border-violet-500 bg-violet-400/30 shadow-[0_0_0_1px_rgba(139,92,246,0.6)]"
                                    : "border-blue-500 bg-blue-400/10 hover:bg-blue-400/25"
                                )}
                                key={node.nodeId}
                                onClick={() =>
                                  void (pickMode === "field"
                                    ? handleFieldNodeSelect(node)
                                    : handleNodeSelect(node))
                                }
                                style={{
                                  left: `${(node.x / imageSize.width) * 100}%`,
                                  top: `${(node.y / imageSize.height) * 100}%`,
                                  width: `${(node.width / imageSize.width) * 100}%`,
                                  height: `${(node.height / imageSize.height) * 100}%`
                                }}
                                title={`${pickMode === "field" ? "Field" : "Container"} ${nodeLabel(node)} ${node.text}`}
                                type="button"
                              />
                            );
                          })
                        : null}
                      {selectorResult ? (
                        <div className="absolute left-5 top-5 rounded-full border border-violet-200 bg-white/90 px-3 py-2 text-xs font-semibold text-violet-700 shadow-lg backdrop-blur">
                          {selectorResult.matchCount} matching containers found
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[44rem] overflow-auto divide-y divide-slate-100">
                    {(pickMode === "field" ? fieldNodes : pageSession.domNodes).map((node) => (
                      <button
                        className={cx(
                          "block w-full px-5 py-3 text-left transition hover:bg-slate-50",
                          focusRing,
                          (selectedNode?.nodeId === node.nodeId || fieldNode?.nodeId === node.nodeId) &&
                            "bg-blue-50"
                        )}
                        key={node.nodeId}
                        onClick={() =>
                          void (pickMode === "field"
                            ? handleFieldNodeSelect(node)
                            : handleNodeSelect(node))
                        }
                        type="button"
                      >
                        <span className="block break-words text-sm font-semibold text-slate-950">
                          {nodeLabel(node)}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {node.text || node.nodeId}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex h-96 items-center justify-center bg-slate-50 text-sm text-slate-500">
                  Screenshot pending
                </div>
              )
            ) : (
              <div className="grid min-h-[34rem] place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.12),transparent_30%),linear-gradient(135deg,#f8fafc,#eef2ff)] p-8">
                <div className="max-w-lg text-center">
                  <Badge tone="blue">Recipe Builder</Badge>
                  <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                    Load a source URL to start mapping records.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    The preview will appear here with selectable containers, field overlays, and a structured table.
                  </p>
                </div>
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <SectionTitle eyebrow="Inspector" title={selectorResult ? "Field Mapping" : "Selected Container"} />
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                <dt className="font-medium text-slate-500">Status</dt>
                <dd className="mt-1">
                  <StatusPill status={pageSession?.jobStatus ?? "Waiting for URL"} />
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                <dt className="font-medium text-slate-500">DOM nodes</dt>
                <dd className="mt-1 font-semibold text-slate-950">{pageSession?.domNodes.length ?? "--"}</dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-slate-200 pt-5">
              {selectedNode ? (
                <div className="space-y-3 text-sm">
                  <p className="break-words font-semibold text-slate-950">{nodeLabel(selectedNode)}</p>
                  <p className="line-clamp-3 text-slate-500">{selectedNode.text || "No visible text"}</p>
                  {selectorBusy ? <p className="text-slate-500">Generating selector...</p> : null}
                  {selectorResult ? (
                    <dl className="space-y-3">
                      <div>
                        <dt className="font-medium text-slate-500">CSS selector</dt>
                        <dd className="mt-1"><CodeBlock>{selectorResult.selector}</CodeBlock></dd>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-blue-50 px-3 py-2">
                          <dt className="font-medium text-blue-700">Match count</dt>
                          <dd className="mt-1 font-semibold text-slate-950">{selectorResult.matchCount}</dd>
                        </div>
                        <div className="rounded-2xl bg-violet-50 px-3 py-2">
                          <dt className="font-medium text-violet-700">Strategy</dt>
                          <dd className="mt-1 font-semibold text-slate-950">{selectorResult.strategy}</dd>
                        </div>
                      </div>
                    </dl>
                  ) : null}
                </div>
              ) : (
                <EmptyState>Select a repeated card or row in the preview to define the container.</EmptyState>
              )}
            </div>

            {selectorResult ? (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fields</h3>
                  <Button className="min-h-9 px-3" onClick={() => setPickMode("field")} type="button" variant="secondary">
                    Pick field
                  </Button>
                </div>
                {fieldSelector ? (
                  <div className="mt-4 space-y-3">
                    <FieldLabel label="Field name">
                      <TextInput onChange={(event) => setFieldName(event.target.value)} value={fieldName} />
                    </FieldLabel>
                    <FieldLabel label="Extraction type">
                      <select
                        className={cx(inputClass, focusRing)}
                        onChange={(event) => setFieldExtract(event.target.value as ExtractType)}
                        value={fieldExtract}
                      >
                        <option value="text">Text</option>
                        <option value="href">href</option>
                        <option value="src">src</option>
                        <option value="attribute">Attribute</option>
                        <option value="html">HTML</option>
                      </select>
                    </FieldLabel>
                    {fieldExtract === "attribute" ? (
                      <FieldLabel label="Attribute">
                        <TextInput
                          onChange={(event) => setFieldAttribute(event.target.value)}
                          placeholder="data-id"
                          value={fieldAttribute}
                        />
                      </FieldLabel>
                    ) : null}
                    <CodeBlock>{fieldSelector.selector}</CodeBlock>
                    <Button className="min-h-9 px-3" onClick={addField} type="button">
                      Add field
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Switch to field mode and select a node inside the chosen card.
                  </p>
                )}
                <div className="mt-4 space-y-2">
                  {fields.map((field) => (
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" key={field.name}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="break-words font-semibold text-slate-950">{field.name}</p>
                        <Badge tone="blue">mapped</Badge>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs leading-relaxed text-slate-500">
                        {field.selector} · {field.extract}
                      </p>
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-4 w-full"
                  disabled={previewBusy || fields.length === 0}
                  onClick={() => void runPreview()}
                  type="button"
                >
                  {previewBusy ? "Extracting..." : "Preview Records"}
                </Button>
              </div>
            ) : null}
          </Panel>
        </section>

        {fields.length > 0 ? (
          <Panel className="overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <SectionTitle
                action={<StatusPill status={`${displayPreviewRows.length || 0} records shown`} />}
                eyebrow="Preview"
                title="Structured records"
              />
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {fields.map((field) => (
                      <th
                        className="min-w-40 px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"
                        key={field.name}
                      >
                        {field.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayPreviewRows.slice(0, 20).map((row) => (
                    <tr className="hover:bg-slate-50/70" key={row.id}>
                      {fields.map((field) => (
                        <td className="min-w-40 max-w-80 px-5 py-4 align-top text-slate-700" key={field.name}>
                          <span className="line-clamp-2 break-words">
                            {formatRecordValue(valueForColumn(row.values, field.name))}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}

        {selectorResult ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <Panel className="p-5">
              <SectionTitle eyebrow="Save" title="Extraction Recipe" />
              <FieldLabel label="Recipe name">
                <TextInput className="mt-4" onChange={(event) => setRecipeName(event.target.value)} value={recipeName} />
              </FieldLabel>
              <p className="mt-2 text-xs text-slate-500">
                Save is available after the recipe has a name and at least one mapped field.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={recipeBusy || fields.length === 0 || recipeName.trim().length === 0} onClick={() => void handleSaveRecipe()} type="button">
                  {recipeBusy ? "Saving..." : "Save Recipe"}
                </Button>
                <Button
                  disabled={!savedRecipe || runBusy}
                  onClick={() => void handleRunRecipe()}
                  type="button"
                  variant="secondary"
                >
                  {runBusy ? "Starting..." : "Run Now"}
                </Button>
              </div>
              {savedRecipe ? (
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <dt className="font-medium text-slate-500">Saved</dt>
                    <dd className="mt-1 break-words font-semibold text-slate-950">{savedRecipe.name}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <dt className="font-medium text-slate-500">Recipe ID</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-slate-950">{savedRecipe.id}</dd>
                  </div>
                </dl>
              ) : null}
            </Panel>

            <Panel className="p-5">
              <SectionTitle eyebrow="Run" title="Status and exports" />
              {run ? (
                <>
                  <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <dt className="font-medium text-slate-500">Status</dt>
                      <dd className="mt-1"><StatusPill status={run.status} /></dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <dt className="font-medium text-slate-500">Records</dt>
                      <dd className="mt-1 font-semibold text-slate-950">{run.totalRecords}</dd>
                    </div>
                    <div className="col-span-2 rounded-2xl bg-slate-50 px-3 py-2">
                      <dt className="font-medium text-slate-500">Run ID</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-slate-950">{run.id}</dd>
                    </div>
                    {run.errorMessage ? (
                      <div className="col-span-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
                        <dt className="font-medium text-red-800">Error</dt>
                        <dd className="mt-1 break-words text-red-800">{run.errorMessage}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                    <Button
                      disabled={run.status !== "completed" || exportBusy === "csv"}
                      onClick={() => void handleDownloadExport(run.id, "csv")}
                      type="button"
                      variant="secondary"
                    >
                      {exportBusy === "csv" ? "Preparing CSV..." : "Export CSV"}
                    </Button>
                    <Button
                      disabled={run.status !== "completed" || exportBusy === "json"}
                      onClick={() => void handleDownloadExport(run.id, "json")}
                      type="button"
                      variant="secondary"
                    >
                      {exportBusy === "json" ? "Preparing JSON..." : "Export JSON"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-5">
                  <EmptyState>Save a recipe and run it once to see records, changes, and exports.</EmptyState>
                </div>
              )}
            </Panel>
          </section>
        ) : null}

        {run ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {(["new", "changed", "removed"] as const).map((changeType) => (
              <Panel className="p-4" key={changeType}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {changeType}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-950">
                    {run.changes[changeType].length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {run.changes[changeType].slice(0, 5).map((event) => (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" key={event.id}>
                      <p className="break-all font-mono text-slate-700">{event.recordKey}</p>
                      <p className="mt-1 line-clamp-2 break-words text-slate-500">
                        {changePreview(event.newData ?? event.oldData)}
                      </p>
                    </div>
                  ))}
                  {run.status === "completed" && run.changes[changeType].length === 0 ? (
                    <p className="text-sm text-slate-500">No records.</p>
                  ) : null}
                </div>
              </Panel>
            ))}
          </div>
        ) : null}

        {run && displayRunRecords.length > 0 ? (
          <Panel className="overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <SectionTitle
                action={<StatusPill status={`${displayRunRecords.length} shown`} />}
                eyebrow="Results"
                title="Latest run records"
              />
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {runRecordColumns.map((column) => (
                      <th className="min-w-40 px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500" key={column}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayRunRecords.slice(0, 20).map((record) => (
                    <tr className="hover:bg-slate-50/70" key={record.id}>
                      {runRecordColumns.map((column) => (
                        <td className="min-w-40 max-w-80 px-5 py-4 align-top text-slate-700" key={column}>
                          <span className="line-clamp-2 break-words">
                            {formatRecordValue(valueForColumn(record.values, column))}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
      </div>
    );
  }

  if (session) {
    return (
      <AppShell
        activeView={activeView}
        dashboard={dashboard}
        onCreateRecipe={() => setActiveView("builder")}
        onLogout={() => void handleLogout()}
        onRunAll={() => setActiveView("runs")}
        onViewChange={setActiveView}
      >
        {activeView === "dashboard" ? (
          <DashboardView
            dashboard={dashboard}
            error={workspaceError}
            loading={workspaceBusy}
            onCreateRecipe={() => setActiveView("builder")}
            onOpenProfile={() => setActiveView("profile")}
            recipes={recipes}
            runs={runs}
          />
        ) : null}
        {activeView === "monitors" ? (
          <MonitorsView
            error={workspaceError}
            loading={workspaceBusy}
            onCreateRecipe={() => setActiveView("builder")}
            onRunRecipe={(recipeId) => void startRecipeRun(recipeId)}
            recipes={recipes}
            runs={runs}
          />
        ) : null}
        {activeView === "monitorDetail" ? <MonitorDetailView /> : null}
        {activeView === "recipes" ? (
          <RecipesView
            error={workspaceError}
            loading={workspaceBusy}
            onOpenBuilder={() => setActiveView("builder")}
            onRunRecipe={(recipeId) => void startRecipeRun(recipeId)}
            recipes={recipes}
            runs={runs}
          />
        ) : null}
        {activeView === "builder" ? renderBuilderView() : null}
        {activeView === "runs" ? (
          <RunsView
            error={workspaceError}
            loading={workspaceBusy}
            onOpenRun={(selectedRun) => {
              setRun(selectedRun);
              setActiveView("builder");
            }}
            recipes={recipes}
            runs={runs}
          />
        ) : null}
        {activeView === "exports" ? (
          <ExportsView
            error={workspaceError}
            exportBusy={exportBusy}
            loading={workspaceBusy}
            onDownloadExport={(runId, format) => void handleDownloadExport(runId, format)}
            recipes={recipes}
            runs={runs}
          />
        ) : null}
        {activeView === "settings" ? <SettingsView /> : null}
        {activeView === "profile" && dashboard ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <StatCard label="Signed in as" value={dashboard.user.email} tone="blue" />
              <StatCard
                detail={`Role: ${dashboard.organizations[0]?.role ?? "member"}`}
                label="Workspace"
                value={dashboard.organizations[0]?.name ?? "ScrapTheWeb"}
                tone="violet"
              />
            </div>
            <AccountPanel
              accessToken={session.access_token}
              emailVerified={dashboard.user.email_verified}
              onSessionRevoked={handleLogout}
              onVerified={() =>
                setDashboard((current) =>
                  current ? { ...current, user: { ...current.user, email_verified: true } } : current
                )
              }
            />
          </div>
        ) : null}
      </AppShell>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-8 text-slate-950 sm:px-6">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="relative min-h-[36rem] bg-[radial-gradient(circle_at_18%_12%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_84%_18%,rgba(124,58,237,0.16),transparent_26%),linear-gradient(135deg,#ffffff,#eef2ff)] p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-white">SW</span>
              <div>
                <p className="text-sm font-semibold text-slate-950">ScrapTheWeb</p>
                <p className="text-xs text-slate-500">No-code website monitoring</p>
              </div>
            </div>
            <div className="mt-20 max-w-2xl">
              <Badge tone="blue">Monitor -&gt; Recipe -&gt; Run -&gt; Records -&gt; Changes -&gt; Export</Badge>
              <h1 className="mt-5 text-5xl font-semibold tracking-tight text-slate-950">
                Turn public pages into structured records, alerts, and exports.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                ScrapTheWeb helps operations teams stop manually checking websites and start monitoring changes with clean extraction recipes.
              </p>
            </div>
            <div className="absolute bottom-8 left-8 right-8 grid gap-3 md:grid-cols-3">
              {["Load a public URL", "Map repeated fields", "Export real results"].map((item, index) => (
                <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur" key={item}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Step {index + 1}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">ScrapTheWeb</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Access your workspace
            </h2>
          </div>
          {showPasswordReset ? (
            <PasswordResetPanel onClose={() => setShowPasswordReset(false)} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1">
                {renderSegmentedAuthButton({
                  current: mode,
                  label: "Register",
                  value: "register",
                  onSelect: setMode
                })}
                {renderSegmentedAuthButton({
                  current: mode,
                  label: "Log in",
                  value: "login",
                  onSelect: setMode
                })}
              </div>

              <Panel className="mt-4 p-5">
                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                  <FieldLabel label="Email">
                    <TextInput
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </FieldLabel>
                  <FieldLabel label="Password">
                    <TextInput
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      minLength={8}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </FieldLabel>
                  <Button disabled={busy} type="submit">
                    {busy ? "Working..." : mode === "register" ? "Create account" : "Log in"}
                  </Button>
                  {error ? (
                    <div
                      aria-live="polite"
                      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                      role="status"
                    >
                      {error}
                    </div>
                  ) : null}
                </form>
                {mode === "login" ? (
                  <div className="mt-3 text-right">
                    <button
                      className={cx("text-sm font-medium text-blue-700 hover:text-blue-900", focusRing)}
                      onClick={() => setShowPasswordReset(true)}
                      type="button"
                    >
                      Forgot your password?
                    </button>
                  </div>
                ) : null}
              </Panel>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function renderSegmentedAuthButton<TValue extends string>({
  current,
  label,
  value,
  onSelect
}: {
  current: TValue;
  label: string;
  value: TValue;
  onSelect: (value: TValue) => void;
}) {
  return (
    <button
      aria-pressed={current === value}
      className={cx(
        "min-h-10 rounded-xl px-3 text-sm font-semibold transition",
        focusRing,
        current === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:bg-white/70"
      )}
      onClick={() => onSelect(value)}
      type="button"
    >
      {label}
    </button>
  );
}

function isDescendant(node: DomNode, ancestor: DomNode, nodes: DomNode[]) {
  const byId = new Map(nodes.map((candidate) => [candidate.nodeId, candidate]));
  let parentId = node.parentNodeId;
  while (parentId) {
    if (parentId === ancestor.nodeId) {
      return true;
    }
    parentId = byId.get(parentId)?.parentNodeId ?? null;
  }
  return false;
}

function defaultFieldName(node: DomNode) {
  if (node.tag === "a") {
    return "detail_url";
  }
  if (node.tag === "img") {
    return "image_url";
  }
  if (node.classes.some((className) => className.includes("price"))) {
    return "price";
  }
  return node.tag;
}

function suggestedRecipeName(url: string, pageTitle: string | null) {
  if (pageTitle?.trim()) {
    return `${pageTitle.trim()} Recipe`;
  }
  try {
    return `${new URL(url).hostname.replace(/^www\./, "")} Recipe`;
  } catch {
    return "Extraction Recipe";
  }
}

function changePreview(data: Record<string, unknown> | null) {
  if (!data) {
    return "";
  }
  const preferred = ["title", "price", "detail_url"];
  const parts = preferred
    .filter((key) => data[key])
    .map((key) => `${key}: ${String(data[key])}`);
  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(data);
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

function normalizeColumnName(column: string) {
  return column.trim().toLowerCase();
}

function normalizedRecordValue(value: unknown) {
  return formatRecordValue(value).replace(/\s+/g, " ").trim();
}

function valueForColumn(values: Record<string, unknown>, column: string) {
  if (column in values) {
    return values[column];
  }

  const normalizedColumn = normalizeColumnName(column);
  const matchingKey = Object.keys(values).find((key) => normalizeColumnName(key) === normalizedColumn);
  return matchingKey ? values[matchingKey] : "";
}

function orderedColumns(rows: DisplayRow[], preferredColumns: string[] = []) {
  const columnsByNormalizedName = new Map<string, string>();

  for (const column of preferredColumns) {
    const normalized = normalizeColumnName(column);
    if (normalized && !columnsByNormalizedName.has(normalized)) {
      columnsByNormalizedName.set(normalized, column);
    }
  }

  for (const row of rows) {
    for (const column of Object.keys(row.values)) {
      const normalized = normalizeColumnName(column);
      if (normalized && !columnsByNormalizedName.has(normalized)) {
        columnsByNormalizedName.set(normalized, column);
      }
    }
  }

  return Array.from(columnsByNormalizedName.values());
}

function displayRows(columns: string[], rows: DisplayRow[]) {
  if (columns.length === 0) {
    return [];
  }

  const rowsWithValues = rows.filter((row) =>
    columns.some((column) => normalizedRecordValue(valueForColumn(row.values, column)) !== "")
  );
  const sourceRows = rowsWithValues.length > 0 ? rowsWithValues : rows;
  const seenRows = new Set<string>();

  return sourceRows.filter((row) => {
    const signature = JSON.stringify(
      columns.map((column) => normalizedRecordValue(valueForColumn(row.values, column)))
    );
    if (seenRows.has(signature)) {
      return false;
    }
    seenRows.add(signature);
    return true;
  });
}
