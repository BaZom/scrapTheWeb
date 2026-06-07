"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  previewPageSession,
  refreshSession,
  register,
  runRecipe
} from "@/lib/api";

import { AccountPanel } from "./components/account-panels";
import { AppShell } from "./components/app-shell";
import { AuthView, type AuthMode } from "./components/auth-view";
import { BuilderView } from "./components/builder-view";
import {
  DashboardView,
  ExportsView,
  MonitorDetailView,
  MonitorsView,
  RecipesView,
  RunsView,
  SettingsView
} from "./components/product-screens";
import type { AppView } from "./data/product-ui";

const storageKey = "scraptheweb.auth";
// Builder drafts are ephemeral page sessions today: a refresh threw away all mapping
// work. We snapshot the in-progress builder here so a reload resumes exactly where the
// user left off. Versioned so a shape change can invalidate old drafts instead of
// crashing on restore.
const builderDraftKey = "scraptheweb.builder-draft.v1";

type StoredSession = Pick<AuthSession, "access_token" | "refresh_token">;

// Only the state needed to reconstruct the canvas + mapping. Transient results
// (preview/run/savedRecipe) and the blob screenshot URL are intentionally excluded —
// the screenshot is re-fetched from pageSession.screenshotUrl on restore.
type BuilderDraft = {
  renderUrl: string;
  recipeName: string;
  recipeShape: "list" | "single";
  pickMode: "container" | "field";
  pageSession: PageSession;
  selectedNode: DomNode | null;
  selectorResult: SelectorResult | null;
  fields: PreviewField[];
  fieldSamples: Record<string, string>;
};

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [renderUrl, setRenderUrl] = useState("https://news.ycombinator.com/news");
  const [pageSession, setPageSession] = useState<PageSession | null>(null);
  const [screenshotObjectUrl, setScreenshotObjectUrl] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<DomNode | null>(null);
  const [selectorResult, setSelectorResult] = useState<SelectorResult | null>(null);
  const [recipeShape, setRecipeShape] = useState<"list" | "single">("list");
  const [pickMode, setPickMode] = useState<"container" | "field">("container");
  const [fieldNode, setFieldNode] = useState<DomNode | null>(null);
  const [fieldSelector, setFieldSelector] = useState<SelectorResult | null>(null);
  const [fieldName, setFieldName] = useState("title");
  const [fieldExtract, setFieldExtract] = useState<ExtractType>("text");
  const [fieldAttribute, setFieldAttribute] = useState("");
  const [fields, setFields] = useState<PreviewField[]>([]);
  const [fieldSample, setFieldSample] = useState<string | null>(null);
  const [fieldSampleBusy, setFieldSampleBusy] = useState(false);
  const [fieldSamples, setFieldSamples] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);
  const [run, setRun] = useState<ExtractionRun | null>(null);
  const [pickerView, setPickerView] = useState<"overlays" | "nodes">("overlays");
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
  // Set to a restored draft's sessionId so the screenshot-restore effect knows to
  // re-fetch the blob (which can't be serialized) once an auth token is available.
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null);
  // Skip the persist effect's first invocation so it can't clobber a stored draft
  // before the restore effect has read it.
  const draftPersistReady = useRef(false);

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

  // ----- Restore an in-progress builder draft on mount -----
  useEffect(() => {
    const raw = window.localStorage.getItem(builderDraftKey);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as BuilderDraft;
      if (!draft.pageSession?.sessionId) throw new Error("malformed draft");
      setRenderUrl(draft.renderUrl);
      setRecipeName(draft.recipeName);
      setRecipeShape(draft.recipeShape);
      setPickMode(draft.pickMode);
      setPageSession(draft.pageSession);
      setSelectedNode(draft.selectedNode);
      setSelectorResult(draft.selectorResult);
      setFields(draft.fields);
      setFieldSamples(draft.fieldSamples);
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
  const activeRunId =
    run && !["completed", "failed"].includes(run.status) ? run.id : null;
  useEffect(() => {
    if (!session || !activeRunId) return;
    const controller = new AbortController();
    streamRunEvents(
      activeRunId,
      session.access_token,
      (next) => {
        setRun(next);
        setRuns((prev) => [next, ...prev.filter((r) => r.id !== next.id)]);
      },
      controller.signal
    ).catch((e) => {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Run status stream failed");
    });
    return () => controller.abort();
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

  // ----- Persist the in-progress builder draft (debounced) -----
  // Snapshot iff a page session exists (i.e. there is real work to resume); otherwise
  // clear the draft — this also fires on sign-out/reset, which null the page session.
  // The first run is skipped so it can't wipe the stored draft before restore reads it.
  useEffect(() => {
    if (!draftPersistReady.current) {
      draftPersistReady.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
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
    }, 400);
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

  // ----- Live sample for the field currently being mapped -----
  // Show the value of the element the user ACTUALLY clicked, read straight from that
  // node — not row[0] of a preview. A relative field selector matches one element per
  // card, so previewing "the first card" showed a different listing's value than the
  // one clicked ("text from a previous listing"). Reading the clicked node is instant
  // and always matches what was selected.
  useEffect(() => {
    if (!fieldNode) {
      setFieldSample(null);
      return;
    }
    const attrs = fieldNode.attrs ?? {};
    let value: string;
    if (fieldExtract === "href") value = attrs.href ?? "";
    else if (fieldExtract === "src") value = attrs.src ?? "";
    else if (fieldExtract === "attribute") value = attrs[fieldAttribute.trim()] ?? "";
    else value = fieldNode.text ?? ""; // text / html (domNodes carry text, not innerHTML)
    setFieldSample(value);
  }, [fieldNode, fieldExtract, fieldAttribute]);

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
    setPageSession(null);
    setScreenshotObjectUrl(null);
    setSelectedNode(null);
    setSelectorResult(null);
    setFieldNode(null);
    setFieldSelector(null);
    setFieldSample(null);
    setFieldSamples({});
    setFields([]);
    setPreview(null);
    setSavedRecipe(null);
    setRun(null);
    setPickMode("container");
    setRecipeShape("list");
    setImageSize(null);
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
      setPageSession(rendered);
      // Auto-detect page shape. A *strong* repeated candidate → list flow; otherwise
      // single-record flow (the whole page body is the record). Detail pages have
      // incidental repeats (spec lists, galleries) that score low, so we gate on score
      // rather than mere presence — and the user can override via the shape toggle.
      const strongCandidate = rendered.containerCandidates.some((c) => c.score >= 40);
      if (strongCandidate) {
        setRecipeShape("list");
      } else {
        setRecipeShape("single");
        setSelectorResult({ selector: "body", matchCount: 1, strategy: "single", matchedNodeIds: [] });
        setPickMode("field");
      }
      setRecipeName((current) => current.trim() || suggestedRecipeName(renderUrl, rendered.title));
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
      const result = await generateSelector(pageSession.sessionId, node.nodeId, session.access_token);
      setSelectorResult(result);
      // Auto-advance: once the container is locked in, the next action is always to map
      // fields inside it, so flip the picker into Field mode for the user.
      setPickMode("field");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Selector generation failed");
    } finally {
      setSelectorBusy(false);
    }
  }

  async function handleFieldNodeSelect(node: DomNode) {
    if (!session || !pageSession || !selectorResult) return;
    setFieldNode(node);
    setFieldSelector(null);
    setSelectorBusy(true);
    setError(null);
    try {
      // List: selector relative to the chosen item. Single: page-wide unique selector
      // (the "container" is the whole body, so a relative selector would be meaningless).
      const result =
        recipeShape === "single"
          ? await generateSelector(pageSession.sessionId, node.nodeId, session.access_token, undefined, {
              single: true
            })
          : await generateSelector(
              pageSession.sessionId,
              node.nodeId,
              session.access_token,
              selectorResult.selector
            );
      setFieldSelector(result);
      if (!fieldName) setFieldName(defaultFieldName(node));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Field selector failed");
    } finally {
      setSelectorBusy(false);
    }
  }

  function addField() {
    if (!fieldSelector) return;
    const name = fieldName.trim();
    if (!name) {
      setError("Field name is required");
      return;
    }
    const next: PreviewField = {
      name,
      selector: fieldSelector.selector,
      extract: fieldExtract,
      ...(fieldExtract === "attribute" ? { attribute: fieldAttribute.trim() } : {})
    };
    setFields((current) => [...current.filter((f) => f.name !== name), next]);
    // Remember the live sample so the saved field card can keep showing a value.
    if (fieldSample !== null) setFieldSamples((current) => ({ ...current, [name]: fieldSample }));
    setFieldName("");
    setFieldSelector(null);
    setFieldNode(null);
    setFieldSample(null);
    setPreview(null);
    setSavedRecipe(null);
    setRun(null);
  }

  // Stepper navigation: clicking an earlier step rewinds the workflow by clearing
  // everything downstream of it. `currentStep` is derived from this state, so the
  // stepper updates itself once the relevant slices are cleared. Steps:
  // 0 Load URL · 1 Select container · 2 Map fields · 3 Preview · 4 Save & run.
  function handleStepNavigate(target: number) {
    if (recipeShape === "single") {
      // Single steps: 0 Load · 1 Choose details · 2 Preview · 3 Save. The body
      // "container" is kept throughout; going back to details clears details forward.
      if (target <= 1) {
        setFields([]);
        setFieldSamples({});
        setFieldNode(null);
        setFieldSelector(null);
        setFieldSample(null);
        setPreview(null);
      }
      setSavedRecipe(null);
      setRun(null);
      return;
    }
    if (target <= 1) {
      setSelectedNode(null);
      setSelectorResult(null);
      setFieldNode(null);
      setFieldSelector(null);
      setFieldSample(null);
      setFields([]);
      setFieldSamples({});
      setPickMode("container");
    } else if (target === 2) {
      setFieldNode(null);
      setFieldSelector(null);
      setFieldSample(null);
      setPickMode("field");
    }
    // Landing on "Preview" (3) keeps the preview table; earlier steps clear it too.
    if (target <= 2) setPreview(null);
    setSavedRecipe(null);
    setRun(null);
  }

  async function runPreview() {
    if (!session || !pageSession || !selectorResult || fields.length === 0) return;
    setPreviewBusy(true);
    setError(null);
    try {
      setPreview(
        await previewPageSession(pageSession.sessionId, selectorResult.selector, fields, session.access_token)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview extraction failed");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSaveRecipe() {
    if (!session || !selectorResult || fields.length === 0) return;
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
      setSavedRecipe(recipe);
      setRecipes((prev) => [recipe, ...prev.filter((r) => r.id !== recipe.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recipe save failed");
    } finally {
      setRecipeBusy(false);
    }
  }

  async function startRecipeRun(recipeId: string) {
    if (!session) return;
    setRunBusy(true);
    setError(null);
    try {
      const recipe = recipes.find((c) => c.id === recipeId);
      if (recipe) setSavedRecipe(recipe);
      const created = await runRecipe(recipeId, session.access_token);
      const firstRead = await getRun(created.runId, session.access_token);
      setRun(firstRead);
      setRuns((prev) => [firstRead, ...prev.filter((r) => r.id !== firstRead.id)]);
      setActiveView("builder");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recipe run failed");
    } finally {
      setRunBusy(false);
    }
  }

  async function handleRunRecipe() {
    if (!savedRecipe) return;
    await startRecipeRun(savedRecipe.id);
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
      onUrlChange: setRenderUrl,
      onLoadPage: handleRenderSubmit,
      pageSession,
      screenshotObjectUrl,
      selectedNode,
      selectorResult,
      selectorBusy,
      recipeShape,
      pickMode,
      onPickModeChange: setPickMode,
      pickerView,
      onPickerViewChange: setPickerView,
      fieldNode,
      fieldSelector,
      fieldName,
      onFieldNameChange: setFieldName,
      fieldExtract,
      onFieldExtractChange: setFieldExtract,
      fieldAttribute,
      onFieldAttributeChange: setFieldAttribute,
      fields,
      onFieldsChange: setFields,
      onAddField: addField,
      fieldSample,
      fieldSampleBusy,
      fieldSamples,
      onStepNavigate: handleStepNavigate,
      preview,
      previewBusy,
      onRunPreview: runPreview,
      recipeName,
      onRecipeNameChange: setRecipeName,
      savedRecipe,
      recipeBusy,
      onSaveRecipe: handleSaveRecipe,
      run,
      runBusy,
      onRunRecipe: handleRunRecipe,
      exportBusy,
      onDownloadExport: handleDownloadExport,
      imageSize,
      onImageLoad: setImageSize,
      renderBusy,
      error,
      onNodeSelect: handleNodeSelect,
      onFieldNodeSelect: handleFieldNodeSelect
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
      fieldNode,
      fieldSelector,
      fieldName,
      fieldExtract,
      fieldAttribute,
      fields,
      fieldSample,
      fieldSampleBusy,
      fieldSamples,
      preview,
      previewBusy,
      recipeName,
      savedRecipe,
      recipeBusy,
      run,
      runBusy,
      exportBusy,
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
      {activeView === "runs" ? (
        <RunsView
          error={workspaceError}
          loading={workspaceBusy}
          onOpenRun={(selected) => {
            setRun(selected);
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
          onDownloadExport={(id, format) => void handleDownloadExport(id, format)}
          recipes={recipes}
          runs={runs}
        />
      ) : null}
      {activeView === "settings" ? (
        <SettingsView
          dashboard={dashboard}
          accessToken={session.access_token}
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

function defaultFieldName(node: DomNode) {
  if (node.tag === "a") return "detail_url";
  if (node.tag === "img") return "image_url";
  if (node.classes.some((c) => c.includes("price"))) return "price";
  return node.tag;
}

function suggestedRecipeName(url: string, pageTitle: string | null) {
  if (pageTitle?.trim()) return `${pageTitle.trim()} Recipe`;
  try {
    return `${new URL(url).hostname.replace(/^www\./, "")} Recipe`;
  } catch {
    return "Extraction Recipe";
  }
}
