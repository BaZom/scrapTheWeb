"use client";

import { type FormEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";

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
  streamRunEvents,
  listRecipes,
  listRuns,
  login,
  logout,
  previewFromSnapshot,
  refreshSession,
  register,
  runRecipe
} from "@/lib/api";

import {
  type BuilderDraft,
  builderReducer,
  initialBuilderState
} from "@/lib/builder-reducer";

import { AccountPanel } from "./components/account-panels";
import { AppShell } from "./components/app-shell";
import { AuthView, type AuthMode } from "./components/auth-view";
import { BuilderView } from "./components/builder-view";
import {
  type AppearanceSettings,
  DashboardView,
  ExportsView,
  MonitorDetailView,
  MonitorsView,
  RecipesView,
  RunTestView,
  RunsView,
  SettingsView
} from "./components/product-screens";
import type { AppView } from "./data/product-ui";

const storageKey = "scraptheweb.auth";
const appearanceStorageKey = "scraptheweb.appearance.v1";
const lightAccent = "#1A1913";
const darkAccent = "#F4F1E8";
const lightSprout = "#4F7A43";
const darkSprout = "#8CAF7B";
const lightPaper = "#F6F5EF";
const darkPaper = "#24231F";
const defaultAppearance: AppearanceSettings = {
  mode: "light",
  accentColor: lightAccent,
  sproutColor: lightSprout,
  paperColor: lightPaper
};
const runTerminalStatuses = new Set(["completed", "failed"]);
// Builder drafts are ephemeral page sessions today: a refresh threw away all mapping
// work. We snapshot the in-progress builder here so a reload resumes exactly where the
// user left off. Versioned so a shape change can invalidate old drafts instead of
// crashing on restore.
const builderDraftKey = "scraptheweb.builder-draft.v1";

type StoredSession = Pick<AuthSession, "access_token" | "refresh_token">;
// BuilderDraft (the persisted snapshot shape) is defined alongside the reducer so the two
// can't drift; only the canvas + mapping is stored — transient results and the blob
// screenshot URL are excluded and the screenshot is re-fetched on restore.

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function hexToRgb(hex: string) {
  const normalized = isHexColor(hex) ? hex.slice(1) : "1A1913";
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function readableTextOn(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#11100D" : "#FFFFFF";
}

function applyAppearance(settings: AppearanceSettings) {
  const root = document.documentElement;
  const fallback = settings.mode === "dark"
    ? { accentColor: darkAccent, sproutColor: darkSprout, paperColor: darkPaper }
    : defaultAppearance;
  const storedAccent =
    settings.mode === "dark" && settings.accentColor.toLowerCase() === lightAccent.toLowerCase()
      ? darkAccent
      : settings.mode === "light" && settings.accentColor.toLowerCase() === darkAccent.toLowerCase()
        ? lightAccent
        : settings.accentColor;
  const storedSprout =
    settings.mode === "dark" && settings.sproutColor.toLowerCase() === lightSprout.toLowerCase()
      ? darkSprout
      : settings.mode === "light" && settings.sproutColor.toLowerCase() === darkSprout.toLowerCase()
        ? lightSprout
        : settings.sproutColor;
  const storedPaper =
    settings.mode === "dark" && settings.paperColor.toLowerCase() === lightPaper.toLowerCase()
      ? darkPaper
      : settings.mode === "light" && settings.paperColor.toLowerCase() === darkPaper.toLowerCase()
        ? lightPaper
        : settings.paperColor;
  const accent = isHexColor(storedAccent) ? storedAccent : fallback.accentColor;
  const sprout = isHexColor(storedSprout) ? storedSprout : fallback.sproutColor;
  const paper = isHexColor(storedPaper) ? storedPaper : fallback.paperColor;

  root.dataset.theme = settings.mode;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-strong", accent);
  root.style.setProperty("--accent-deep", accent);
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 14%, var(--surface))`);
  root.style.setProperty("--accent-softer", `color-mix(in srgb, ${accent} 8%, var(--surface))`);
  root.style.setProperty("--accent-ring", `color-mix(in srgb, ${accent} 28%, transparent)`);
  root.style.setProperty("--text-onAccent", readableTextOn(accent));

  root.style.setProperty("--sprout", sprout);
  root.style.setProperty("--success", sprout);
  root.style.setProperty("--success-bg", `color-mix(in srgb, ${sprout} 18%, var(--surface))`);
  root.style.setProperty("--success-fg", sprout);

  root.style.setProperty("--surface-sidebar", paper);
  root.style.setProperty("--surface-footer", paper);
  root.style.setProperty("--surface-warm", `color-mix(in srgb, ${paper} 84%, var(--surface))`);
}

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  // Builder flow state lives in one reducer (see lib/builder-reducer.ts). Destructured to
  // the same names the rest of this component already reads, so only writes change here.
  const [builder, dispatch] = useReducer(builderReducer, initialBuilderState);
  const {
    renderUrl,
    pageSession,
    selectedNode,
    selectorResult,
    recipeShape,
    pickMode,
    fields,
    fieldSamples,
    preview,
    recipeName,
    savedRecipe,
    run,
    imageSize
  } = builder;
  // Kept outside the reducer: the screenshot blob URL (side-effect lifecycle) and the
  // canvas view toggle.
  const [screenshotObjectUrl, setScreenshotObjectUrl] = useState<string | null>(null);
  const [pickerView, setPickerView] = useState<"overlays" | "nodes">("overlays");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [selectorBusy, setSelectorBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [runBusyRecipeId, setRunBusyRecipeId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"csv" | "json" | null>(null);
  const [appearance, setAppearance] = useState<AppearanceSettings>(defaultAppearance);
  const [selectedRunRecipeId, setSelectedRunRecipeId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  // Set to a restored draft's sessionId so the screenshot-restore effect knows to
  // re-fetch the blob (which can't be serialized) once an auth token is available.
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null);
  // Skip the persist effect's first invocation so it can't clobber a stored draft
  // before the restore effect has read it.
  const draftPersistReady = useRef(false);
  // Last persisted "structural" snapshot key. Structural changes (pick item, add/remove
  // field, render) persist immediately; only text edits (recipe/field name) are debounced.
  const draftStructuralKey = useRef("");

  // ----- Load stored session on mount -----
  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      setSession(JSON.parse(raw) as StoredSession);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  // ----- Load and apply appearance preferences -----
  useEffect(() => {
    const raw = window.localStorage.getItem(appearanceStorageKey);
    if (!raw) return;
    try {
      setAppearance({ ...defaultAppearance, ...(JSON.parse(raw) as Partial<AppearanceSettings>) });
    } catch {
      window.localStorage.removeItem(appearanceStorageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(appearanceStorageKey, JSON.stringify(appearance));
    applyAppearance(appearance);
  }, [appearance]);

  // ----- Restore an in-progress builder draft on mount -----
  useEffect(() => {
    const raw = window.localStorage.getItem(builderDraftKey);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as BuilderDraft;
      if (!draft.pageSession?.sessionId) throw new Error("malformed draft");
      dispatch({ type: "draft_restored", draft });
      setRestoredSessionId(draft.pageSession.sessionId);
      setActiveView("builder");
    } catch {
      window.localStorage.removeItem(builderDraftKey);
    }
  }, []);

  // ----- Fetch dashboard/recipes/runs when session changes -----
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
        const data = await Promise.all([
          getDashboard(activeSession.access_token),
          listRecipes(activeSession.access_token),
          listRuns(activeSession.access_token)
        ]);
        if (!cancelled) applyWorkspaceData(data);
      } catch (loadError) {
        try {
          const rotated = await refreshSession(activeSession.refresh_token);
          const next = { access_token: rotated.access_token, refresh_token: rotated.refresh_token };
          window.localStorage.setItem(storageKey, JSON.stringify(next));
          if (!cancelled) {
            setSession(next);
            const data = await Promise.all([
              getDashboard(rotated.access_token),
              listRecipes(rotated.access_token),
              listRuns(rotated.access_token)
            ]);
            if (!cancelled) applyWorkspaceData(data);
          }
        } catch {
          window.localStorage.removeItem(storageKey);
          if (!cancelled) {
            setSession(null);
            setWorkspaceError(loadError instanceof Error ? loadError.message : "Session expired");
          }
        }
      } finally {
        if (!cancelled) setWorkspaceBusy(false);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // ----- Stream the active run's progress (SSE) -----
  // Server-pushed updates replace the old 1.5 s poll. `activeRunId` is the id only while
  // the run is non-terminal, so the stream opens once per run and the effect does NOT
  // restart on every status update (which would reconnect on each event); it tears down
  // when the run reaches a terminal state.
  const activeRunId = run && !runTerminalStatuses.has(run.status) ? run.id : null;
  useEffect(() => {
    if (!session || !activeRunId) return;
    const controller = new AbortController();
    let cancelled = false;
    let polling = false;
    let latestTerminal = false;
    let pollTimer: number | null = null;

    const applyRunUpdate = (next: ExtractionRun) => {
      latestTerminal = runTerminalStatuses.has(next.status);
      dispatch({ type: "run_updated", run: next });
      setRuns((prev) => [next, ...prev.filter((r) => r.id !== next.id)]);
    };

    const pollRun = async () => {
      if (cancelled) return;
      try {
        const next = await getRun(activeRunId, session.access_token);
        if (cancelled) return;
        applyRunUpdate(next);
        if (!runTerminalStatuses.has(next.status)) {
          pollTimer = window.setTimeout(() => void pollRun(), 1500);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Run status refresh failed");
      }
    };

    const startPollingFallback = () => {
      if (cancelled || polling || latestTerminal) return;
      polling = true;
      void pollRun();
    };

    void streamRunEvents(activeRunId, session.access_token, applyRunUpdate, controller.signal)
      .then(() => {
        // SSE can be closed by a proxy or by the server-side stream cap before the run
        // reaches a terminal state. Polling keeps progress reliable without giving up
        // the SSE happy path.
        startPollingFallback();
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof Error && e.name === "AbortError") return;
        startPollingFallback();
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [activeRunId, session]);

  // ----- Clean up screenshot blob -----
  useEffect(() => {
    return () => {
      if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl);
    };
  }, [screenshotObjectUrl]);

  // ----- Re-fetch the screenshot for a restored draft -----
  // The screenshot is a blob object URL that can't be serialized, so the restore
  // effect only records the sessionId. Once a token is available we re-fetch it from
  // the page session (still alive within its server-side TTL). If the session has
  // expired the canvas image just stays blank; the mapping work is still intact.
  useEffect(() => {
    if (!restoredSessionId || !session || !pageSession?.screenshotUrl) return;
    let cancelled = false;
    fetchScreenshot(pageSession.screenshotUrl, session.access_token)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setScreenshotObjectUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
      })
      .catch(() => {
        /* session likely expired — keep the restored mapping, drop the image */
      })
      .finally(() => {
        if (!cancelled) setRestoredSessionId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [restoredSessionId, session, pageSession]);

  // ----- Persist the in-progress builder draft -----
  // Snapshot iff a page session exists (i.e. there is real work to resume); otherwise
  // clear the draft — this also fires on sign-out/reset, which null the page session.
  // Structural changes (pick item, add/remove field, render, navigate) persist
  // IMMEDIATELY so a reload right after a click can't lose them; pure text edits
  // (recipe/field name) are debounced to avoid re-serializing the large DOM on every
  // keystroke. The first run is skipped so it can't wipe the stored draft before restore.
  useEffect(() => {
    const writeDraft = () => {
      if (!pageSession) {
        window.localStorage.removeItem(builderDraftKey);
        return;
      }
      const draft: BuilderDraft = {
        renderUrl,
        recipeName,
        recipeShape,
        pickMode,
        pageSession,
        selectedNode,
        selectorResult,
        fields,
        fieldSamples
      };
      try {
        window.localStorage.setItem(builderDraftKey, JSON.stringify(draft));
      } catch {
        /* quota exceeded (large DOM) — skip persistence rather than break the app */
      }
    };

    const structuralKey = JSON.stringify({
      session: pageSession?.sessionId ?? null,
      shape: recipeShape,
      pick: pickMode,
      node: selectedNode?.nodeId ?? null,
      selector: selectorResult?.selector ?? null,
      fields
    });

    if (!draftPersistReady.current) {
      draftPersistReady.current = true;
      draftStructuralKey.current = structuralKey;
      return;
    }

    if (structuralKey !== draftStructuralKey.current) {
      draftStructuralKey.current = structuralKey;
      writeDraft();
      return;
    }
    const handle = window.setTimeout(writeDraft, 400);
    return () => window.clearTimeout(handle);
  }, [
    pageSession,
    renderUrl,
    recipeName,
    recipeShape,
    pickMode,
    selectedNode,
    selectorResult,
    fields,
    fieldSamples
  ]);

  function applyWorkspaceData([d, r, u]: [Dashboard, Recipe[], ExtractionRun[]]) {
    setDashboard(d);
    setRecipes(r);
    setRuns(u);
    setWorkspaceError(null);
  }

  // ----- Auth handlers -----
  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth = mode === "register" ? await register(email, password) : await login(email, password);
      const next = { access_token: auth.access_token, refresh_token: auth.refresh_token };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setSession(next);
      setDashboard({ user: auth.user, organizations: [auth.organization] });
      setRecipes([]);
      setRuns([]);
      setWorkspaceError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (session) {
      try {
        await logout(session.refresh_token);
      } catch {
        /* ignore */
      }
    }
    window.localStorage.removeItem(storageKey);
    setSession(null);
    resetBuilderState();
  }

  function resetBuilderState() {
    dispatch({ type: "reset" });
    setScreenshotObjectUrl(null);
  }

  // ----- Builder handlers -----
  async function handleRenderSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!session) return;
    setActiveView("builder");
    setRenderBusy(true);
    setError(null);
    resetBuilderState();
    try {
      const rendered = await createPageSession(renderUrl, session.access_token);
      // The reducer detects shape (strong candidate → list, else single + body selector)
      // and keeps a user-entered name, falling back to the suggestion.
      dispatch({
        type: "render_succeeded",
        pageSession: rendered,
        suggestedName: suggestedRecipeName(renderUrl, rendered.title)
      });
      if (rendered.screenshotUrl) {
        const objectUrl = await fetchScreenshot(rendered.screenshotUrl, session.access_token);
        setScreenshotObjectUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setRenderBusy(false);
    }
  }

  async function handleNodeSelect(node: DomNode) {
    if (!session || !pageSession) return;
    dispatch({ type: "container_selecting", node });
    setSelectorBusy(true);
    setError(null);
    try {
      const result = await generateSelector(pageSession.sessionId, node.nodeId, session.access_token);
      // Auto-advance: once the container is locked in, the next action is always to map
      // fields inside it, so the reducer flips the picker into Field mode.
      dispatch({ type: "container_selector_resolved", result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Selector generation failed");
    } finally {
      setSelectorBusy(false);
    }
  }

  // Preview records (ADR 0009): the only thing that extracts. ONE call to the snapshot
  // preview — the backend generates each selected field's selector and reads its value from
  // the render snapshot (no S3 fetch, no HTML re-parse), returning all matched rows + the
  // generated fields. We commit the fields (so Save works) and show the rows in the bottom
  // panel. The saved run does the full HTML extraction later, against fresh pages.
  async function handlePreviewRecords(
    picks: { nodeId: string; extract: ExtractType; name: string; value: string }[]
  ) {
    if (!session || !pageSession || !selectorResult || picks.length === 0) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const { rows, fields } = await previewFromSnapshot(
        pageSession.sessionId,
        selectorResult.selector,
        picks.map((p) => ({ nodeId: p.nodeId, extract: p.extract, name: p.name })),
        session.access_token
      );
      if (fields.length === 0) return;
      const samples: Record<string, string> = {};
      for (const p of picks) if (p.value) samples[p.name] = p.value;
      dispatch({ type: "fields_added", fields, samples });
      dispatch({ type: "preview_succeeded", preview: { rows, rowCount: rows.length } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  }

  // Manual shape override (ADR 0005 follow-up): the reducer clears the now-invalid mapping.
  function handleShapeChange(shape: "list" | "single") {
    dispatch({ type: "shape_changed", shape });
  }

  // Stepper navigation: clicking an earlier step rewinds the workflow by clearing
  // everything downstream of it (the reducer owns the per-shape clearing rules).
  // `currentStep` is derived from the cleared slices, so the stepper updates itself.
  function handleStepNavigate(target: number) {
    dispatch({ type: "step_navigated", target });
  }

  async function handleSaveRecipe() {
    if (!session || !selectorResult || fields.length === 0 || savedRecipe) return;
    const name = recipeName.trim();
    if (!name) {
      setError("Recipe name is required");
      return;
    }
    setRecipeBusy(true);
    setError(null);
    try {
      const recipe = await createRecipe(
        name,
        renderUrl,
        selectorResult.selector,
        fields,
        session.access_token,
        recipeShape === "single" ? "single" : "listing"
      );
      dispatch({ type: "recipe_saved", recipe });
      setRecipes((prev) => [recipe, ...prev.filter((r) => r.id !== recipe.id)]);
      setSelectedRunRecipeId(recipe.id);
      setSelectedRunId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recipe save failed");
    } finally {
      setRecipeBusy(false);
    }
  }

  function handleOpenSavedRecipeRunTest() {
    if (!savedRecipe) return;
    setSelectedRunRecipeId(savedRecipe.id);
    setSelectedRunId(null);
    setActiveView("runTest");
  }

  async function startRecipeRun(recipeId: string) {
    if (!session) return;
    setError(null);
    setRunBusyRecipeId(recipeId);
    try {
      const recipe = recipes.find((c) => c.id === recipeId);
      if (recipe) dispatch({ type: "recipe_saved", recipe });
      const created = await runRecipe(recipeId, session.access_token);
      const firstRead = await getRun(created.runId, session.access_token);
      dispatch({ type: "run_updated", run: firstRead });
      setRuns((prev) => [firstRead, ...prev.filter((r) => r.id !== firstRead.id)]);
      setSelectedRunRecipeId(recipeId);
      setSelectedRunId(firstRead.id);
      setActiveView("runTest");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recipe run failed");
    } finally {
      setRunBusyRecipeId(null);
    }
  }

  async function handleDownloadExport(runId: string, format: "csv" | "json") {
    if (!session) return;
    setExportBusy(format);
    setError(null);
    try {
      const blob = await downloadRunExport(runId, format, session.access_token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `scraptheweb-run-${runId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export download failed");
    } finally {
      setExportBusy(null);
    }
  }

  const builderProps = useMemo(
    () => ({
      url: renderUrl,
      onUrlChange: (url: string) => dispatch({ type: "url_changed", url }),
      onLoadPage: handleRenderSubmit,
      pageSession,
      screenshotObjectUrl,
      selectedNode,
      selectorResult,
      selectorBusy,
      recipeShape,
      onShapeChange: handleShapeChange,
      pickMode,
      onPickModeChange: (mode: "container" | "field") => dispatch({ type: "pick_mode_changed", mode }),
      pickerView,
      onPickerViewChange: setPickerView,
      fields,
      onRemoveField: (name: string) => dispatch({ type: "field_removed", name }),
      fieldSamples,
      onStepNavigate: handleStepNavigate,
      preview,
      previewBusy,
      onPreviewRecords: handlePreviewRecords,
      recipeName,
      onRecipeNameChange: (name: string) => dispatch({ type: "recipe_name_changed", name }),
      savedRecipe,
      recipeBusy,
      onSaveRecipe: handleSaveRecipe,
      onOpenRunTest: handleOpenSavedRecipeRunTest,
      imageSize,
      onImageLoad: (size: { width: number; height: number }) =>
        dispatch({ type: "image_loaded", size }),
      renderBusy,
      error,
      onNodeSelect: handleNodeSelect
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      renderUrl,
      pageSession,
      screenshotObjectUrl,
      selectedNode,
      selectorResult,
      selectorBusy,
      recipeShape,
      pickMode,
      pickerView,
      fields,
      fieldSamples,
      preview,
      previewBusy,
      recipeName,
      savedRecipe,
      recipeBusy,
      imageSize,
      renderBusy,
      error
    ]
  );

  if (!session) {
    return (
      <AuthView
        mode={mode}
        onModeChange={setMode}
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleAuthSubmit}
        busy={busy}
        error={error}
      />
    );
  }

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
          onNavigate={(v) => setActiveView(v as AppView)}
          recipes={recipes}
          runs={runs}
        />
      ) : null}
      {activeView === "monitors" ? (
        <MonitorsView
          error={workspaceError}
          loading={workspaceBusy}
          onCreateRecipe={() => setActiveView("builder")}
          onRunRecipe={(id) => void startRecipeRun(id)}
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
          onRunRecipe={(id) => void startRecipeRun(id)}
          recipes={recipes}
          runs={runs}
        />
      ) : null}
      {activeView === "builder" ? <BuilderView {...builderProps} /> : null}
      {activeView === "runTest" ? (
        <RunTestView
          error={workspaceError}
          exportBusy={exportBusy}
          loading={workspaceBusy}
          onDownloadExport={(id, format) => void handleDownloadExport(id, format)}
          onOpenBuilder={() => setActiveView("builder")}
          onOpenRun={(selected) => {
            dispatch({ type: "run_updated", run: selected });
            setSelectedRunId(selected.id);
          }}
          onRunRecipe={(id) => void startRecipeRun(id)}
          onSelectRecipe={setSelectedRunRecipeId}
          recipes={recipes}
          runBusyRecipeId={runBusyRecipeId}
          runs={runs}
          selectedRecipeId={selectedRunRecipeId}
          selectedRunId={selectedRunId}
        />
      ) : null}
      {activeView === "runs" ? (
        <RunsView
          error={workspaceError}
          exportBusy={exportBusy}
          loading={workspaceBusy}
          onOpenRun={(selected) => {
            dispatch({ type: "run_updated", run: selected });
            setSelectedRunId(selected.id);
          }}
          onDownloadExport={(id, format) => void handleDownloadExport(id, format)}
          recipes={recipes}
          runs={runs}
          selectedRunId={selectedRunId}
        />
      ) : null}
      {activeView === "exports" ? (
        <ExportsView
          error={workspaceError}
          exportBusy={exportBusy}
          loading={workspaceBusy}
          onDownloadExport={(id, format) => void handleDownloadExport(id, format)}
          recipes={recipes}
          runs={runs}
        />
      ) : null}
      {activeView === "settings" ? (
        <SettingsView
          appearance={appearance}
          dashboard={dashboard}
          accessToken={session.access_token}
          onAppearanceChange={setAppearance}
          onAppearanceReset={() => setAppearance(defaultAppearance)}
          onVerified={() =>
            setDashboard((current) =>
              current ? { ...current, user: { ...current.user, email_verified: true } } : current
            )
          }
          onSessionRevoked={() => void handleLogout()}
        />
      ) : null}
      {activeView === "profile" && session ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AccountPanel
            accessToken={session.access_token}
            emailVerified={dashboard?.user.email_verified ?? false}
            onSessionRevoked={() => void handleLogout()}
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

function suggestedRecipeName(url: string, pageTitle: string | null) {
  if (pageTitle?.trim()) return `${pageTitle.trim()} Recipe`;
  try {
    return `${new URL(url).hostname.replace(/^www\./, "")} Recipe`;
  } catch {
    return "Extraction Recipe";
  }
}
