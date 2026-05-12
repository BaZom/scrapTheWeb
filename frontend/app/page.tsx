"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import {
  type ApiKey,
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
  confirmEmailVerification,
  confirmPasswordReset,
  createApiKey,
  createPageSession,
  createRecipe,
  deleteApiKey,
  downloadRunExport,
  fetchScreenshot,
  generateSelector,
  getDashboard,
  getRun,
  listApiKeys,
  login,
  logout,
  previewPageSession,
  refreshSession,
  register,
  requestEmailVerification,
  requestPasswordReset,
  revokeAllSessions,
  runRecipe
} from "@/lib/api";

const storageKey = "scraptheweb.auth";

type Mode = "login" | "register";
type PickerView = "overlays" | "nodes";
type PickMode = "container" | "field";
type StoredSession = Pick<AuthSession, "access_token" | "refresh_token">;
type DisplayRow = {
  id: string;
  values: Record<string, unknown>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50";
const inputClass =
  "h-11 min-w-0 rounded-md border border-neutral-300 bg-white px-3 text-base text-neutral-950 shadow-sm transition placeholder:text-neutral-400 focus:border-emerald-700";
const buttonBase =
  "inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      className={cx(
        buttonBase,
        focusRing,
        variant === "primary" && "bg-neutral-950 text-white shadow-sm hover:bg-neutral-800",
        variant === "secondary" &&
          "border border-neutral-300 bg-white text-neutral-900 shadow-sm hover:bg-neutral-50",
        variant === "ghost" && "text-neutral-700 hover:bg-neutral-100",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Panel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-lg border border-neutral-200 bg-white shadow-sm shadow-neutral-950/[0.03]",
        className
      )}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
        ) : null}
        <h2 className="mt-1 text-xl font-semibold tracking-normal text-neutral-950">{title}</h2>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

function FieldLabel({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-neutral-800">
      {label}
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, focusRing, props.className)} {...props} />;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "failed"
        ? "border-red-200 bg-red-50 text-red-800"
        : status === "pending" || status === "running"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-neutral-200 bg-neutral-50 text-neutral-700";
  return (
    <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", tone)}>
      {status}
    </span>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-sm text-neutral-600">
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <p className="break-all rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-800">
      {children}
    </p>
  );
}

function StatCard({
  label,
  value,
  detail
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <Panel className="p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</h2>
      <p className="mt-3 min-w-0 break-words text-lg font-semibold text-neutral-950">{value}</p>
      {detail ? <p className="mt-1 text-sm text-neutral-600">{detail}</p> : null}
    </Panel>
  );
}

function AccountPanel({
  accessToken,
  emailVerified,
  onVerified,
  onSessionRevoked
}: {
  accessToken: string;
  emailVerified: boolean;
  onVerified: () => void;
  onSessionRevoked: () => void;
}) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [accountErr, setAccountErr] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listApiKeys(accessToken)
      .then((keys) => {
        if (!cancelled) {
          setApiKeys(keys);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiKeys([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleRequestVerification() {
    setAccountBusy(true);
    setAccountErr(null);
    setVerifyMsg(null);
    try {
      const result = await requestEmailVerification(accessToken);
      setVerifyMsg(
        result.status === "already_verified"
          ? "Email is already verified."
          : "Verification email sent. In local dev the token is in the API logs."
      );
    } catch (err) {
      setAccountErr(err instanceof Error ? err.message : "Verification request failed");
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleConfirmVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verifyToken.trim()) {
      return;
    }
    setAccountBusy(true);
    setAccountErr(null);
    setVerifyMsg(null);
    try {
      await confirmEmailVerification(verifyToken.trim());
      setVerifyToken("");
      setVerifyMsg("Email verified.");
      onVerified();
    } catch (err) {
      setAccountErr(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleCreateKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newKeyName.trim()) {
      return;
    }
    setAccountBusy(true);
    setAccountErr(null);
    try {
      const result = await createApiKey(accessToken, newKeyName.trim());
      setRevealedKey(result.api_key);
      setApiKeys((prev) => [result.key, ...prev]);
      setNewKeyName("");
    } catch (err) {
      setAccountErr(err instanceof Error ? err.message : "API key creation failed");
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleDeleteKey(keyId: string) {
    setAccountBusy(true);
    setAccountErr(null);
    try {
      await deleteApiKey(accessToken, keyId);
      setApiKeys((prev) => prev.filter((key) => key.id !== keyId));
    } catch (err) {
      setAccountErr(err instanceof Error ? err.message : "API key revoke failed");
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleRevokeAllSessions() {
    setAccountBusy(true);
    setAccountErr(null);
    try {
      const result = await revokeAllSessions(accessToken);
      setVerifyMsg(`Revoked ${result.revoked_count} active session(s).`);
      onSessionRevoked();
    } catch (err) {
      setAccountErr(err instanceof Error ? err.message : "Session revoke failed");
    } finally {
      setAccountBusy(false);
    }
  }

  return (
    <Panel className="p-5 sm:p-6">
      <SectionTitle
        eyebrow="Account"
        title="Verification, API keys, and sessions"
        action={
          <Button
            disabled={accountBusy}
            onClick={handleRevokeAllSessions}
            type="button"
            variant="ghost"
          >
            Revoke all sessions
          </Button>
        }
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">Email verification</h3>
            <span
              className={cx(
                "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                emailVerified
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              )}
            >
              {emailVerified ? "verified" : "unverified"}
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-600">
            Local dev does not send email -- the token is logged to the API container.
          </p>
          {emailVerified ? null : (
            <>
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={accountBusy}
                  onClick={handleRequestVerification}
                  type="button"
                  variant="secondary"
                >
                  Resend verification token
                </Button>
              </div>
              <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleConfirmVerification}>
                <TextInput
                  aria-label="Verification token"
                  onChange={(event) => setVerifyToken(event.target.value)}
                  placeholder="paste verification token"
                  value={verifyToken}
                />
                <Button disabled={accountBusy || !verifyToken.trim()} type="submit">
                  Verify
                </Button>
              </form>
            </>
          )}
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-sm font-semibold text-neutral-900">API keys</h3>
          <p className="mt-2 text-sm text-neutral-600">
            API keys can call read-only endpoints. The full key is shown once on creation.
          </p>
          <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleCreateKey}>
            <TextInput
              aria-label="New API key name"
              maxLength={160}
              onChange={(event) => setNewKeyName(event.target.value)}
              placeholder="laptop-export"
              value={newKeyName}
            />
            <Button disabled={accountBusy || !newKeyName.trim()} type="submit">
              Create key
            </Button>
          </form>
          {revealedKey ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="font-semibold text-emerald-900">Copy this key now -- it will not be shown again.</p>
              <CodeBlock>{revealedKey}</CodeBlock>
              <Button
                className="mt-2"
                onClick={() => setRevealedKey(null)}
                type="button"
                variant="ghost"
              >
                Dismiss
              </Button>
            </div>
          ) : null}
          <ul className="mt-4 space-y-2">
            {apiKeys.length === 0 ? (
              <li className="text-sm text-neutral-600">No API keys yet.</li>
            ) : (
              apiKeys.map((key) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
                  key={key.id}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-neutral-900">{key.name}</span>
                    <span className="ml-2 font-mono text-xs text-neutral-500">{key.prefix}...</span>
                  </span>
                  <Button
                    disabled={accountBusy}
                    onClick={() => handleDeleteKey(key.id)}
                    type="button"
                    variant="ghost"
                  >
                    Revoke
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
      {verifyMsg ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {verifyMsg}
        </p>
      ) : null}
      {accountErr ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="status">
          {accountErr}
        </p>
      ) : null}
    </Panel>
  );
}

function PasswordResetPanel({
  onClose
}: {
  onClose: () => void;
}) {
  const [requestEmail, setRequestEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestEmail.trim()) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      await requestPasswordReset(requestEmail.trim().toLowerCase());
      setMessage(
        "If that email exists we sent a reset token. In local dev check the API logs."
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Reset request failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim() || password.length < 8) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      await confirmPasswordReset(token.trim(), password);
      setMessage("Password reset. You can log in with the new password.");
      setToken("");
      setPassword("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Reset confirm failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5 sm:p-6">
      <SectionTitle
        eyebrow="Forgot password"
        title="Request a reset token"
        action={
          <Button onClick={onClose} type="button" variant="ghost">
            Back to sign in
          </Button>
        }
      />
      <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleRequest}>
        <TextInput
          aria-label="Email"
          autoComplete="email"
          onChange={(event) => setRequestEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={requestEmail}
        />
        <Button disabled={busy} type="submit" variant="secondary">
          Send reset token
        </Button>
      </form>
      <form className="mt-4 grid gap-3" onSubmit={handleConfirm}>
        <FieldLabel label="Reset token (from email/logs)">
          <TextInput
            onChange={(event) => setToken(event.target.value)}
            placeholder="paste the token"
            value={token}
          />
        </FieldLabel>
        <FieldLabel label="New password (min 8 chars)">
          <TextInput
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </FieldLabel>
        <Button disabled={busy || !token.trim() || password.length < 8} type="submit">
          Set new password
        </Button>
      </form>
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="status">
          {errorMessage}
        </p>
      ) : null}
    </Panel>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("register");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [renderUrl, setRenderUrl] = useState("https://books.toscrape.com/");
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
  const [recipeName, setRecipeName] = useState("Books page 1");
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
      return;
    }

    let cancelled = false;
    const activeSession = session;

    async function loadDashboard() {
      setError(null);
      try {
        const data = await getDashboard(activeSession.access_token);
        if (!cancelled) {
          setDashboard(data);
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
            setDashboard(await getDashboard(rotated.access_token));
          }
        } catch {
          window.localStorage.removeItem(storageKey);
          if (!cancelled) {
            setSession(null);
            setError(loadError instanceof Error ? loadError.message : "Session expired");
          }
        }
      }
    }

    void loadDashboard();

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

  async function handleRenderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setRenderBusy(true);
    setError(null);
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

    try {
      const rendered = await createPageSession(renderUrl, session.access_token);
      setPageSession(rendered);
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
      setSavedRecipe(
        await createRecipe(name, renderUrl, selectorResult.selector, fields, session.access_token)
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Recipe save failed");
    } finally {
      setRecipeBusy(false);
    }
  }

  async function handleRunRecipe() {
    if (!session || !savedRecipe) {
      return;
    }
    setRunBusy(true);
    setError(null);
    try {
      const created = await runRecipe(savedRecipe.id, session.access_token);
      const firstRead = await getRun(created.runId, session.access_token);
      setRun(firstRead);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Recipe run failed");
    } finally {
      setRunBusy(false);
    }
  }

  async function handleDownloadExport(format: "csv" | "json") {
    if (!session || !run) {
      return;
    }
    setExportBusy(format);
    setError(null);
    try {
      const blob = await downloadRunExport(run.id, format, session.access_token);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `scraptheweb-run-${run.id}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Export download failed");
    } finally {
      setExportBusy(null);
    }
  }

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

  function nodeLabel(node: DomNode) {
    const classText = node.classes.length > 0 ? `.${node.classes.slice(0, 2).join(".")}` : "";
    const idText = node.attrs.id ? `#${node.attrs.id}` : "";
    return `${node.tag}${idText}${classText}`;
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
      return "link";
    }
    if (node.tag === "img") {
      return "image";
    }
    if (node.classes.some((className) => className.includes("price"))) {
      return "price";
    }
    return node.tag;
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
          "min-h-8 rounded px-3 text-sm font-semibold transition",
          focusRing,
          current === value
            ? "bg-neutral-950 text-white shadow-sm"
            : "text-neutral-700 hover:bg-white disabled:text-neutral-400"
        )}
        disabled={disabled}
        onClick={() => onSelect(value)}
        type="button"
      >
        {label}
      </button>
    );
  }

  if (session) {
    const primaryOrg = dashboard?.organizations[0];

    return (
      <main className="min-h-screen bg-stone-50 px-4 py-6 text-neutral-950 sm:px-6 lg:px-8">
        <section className="mx-auto flex max-w-7xl flex-col gap-7">
          <header className="flex flex-col gap-4 border-b border-neutral-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                ScrapTheWeb workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-neutral-950">
                Extraction dashboard
              </h1>
            </div>
            <Button variant="secondary" onClick={handleLogout} type="button">
              Log out
            </Button>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <StatCard label="Signed in as" value={dashboard?.user.email ?? "Loading..."} />
            <StatCard
              detail={primaryOrg ? `Role: ${primaryOrg.role}` : undefined}
              label="Organization"
              value={primaryOrg?.name ?? "Loading..."}
            />
          </div>

          {dashboard ? (
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
          ) : null}

          <Panel className="p-5 sm:p-6">
            <SectionTitle eyebrow="Start" title="Render a public listing page" />
            <form className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleRenderSubmit}>
              <TextInput
                aria-label="Public page URL"
                onChange={(event) => setRenderUrl(event.target.value)}
                required
                type="url"
                value={renderUrl}
              />
              <Button disabled={renderBusy} type="submit">
                {renderBusy ? "Rendering..." : "Render page"}
              </Button>
            </form>
            {error ? (
              <div
                aria-live="polite"
                className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                role="status"
              >
                {error}
              </div>
            ) : null}
          </Panel>

          {pageSession ? (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(21rem,0.9fr)]">
              <Panel className="overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-neutral-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <SectionTitle eyebrow="Pick" title="Rendered page" />
                  <div className="flex flex-wrap gap-2">
                    <div className="grid grid-cols-2 rounded-md border border-neutral-200 bg-neutral-100 p-1">
                      {renderSegmentedButton({
                        current: pickMode,
                        label: "Card",
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
                    <div className="grid grid-cols-2 rounded-md border border-neutral-200 bg-neutral-100 p-1">
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
                {screenshotObjectUrl ? (
                  pickerView === "overlays" ? (
                    <div className="max-h-[42rem] overflow-auto bg-neutral-100">
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
                                      ? "border-emerald-500 bg-emerald-400/30 shadow-[0_0_0_1px_rgba(16,185,129,0.55)]"
                                      : "border-sky-500 bg-sky-400/10 hover:bg-sky-400/25"
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
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[42rem] overflow-auto divide-y divide-neutral-100">
                      {(pickMode === "field" ? fieldNodes : pageSession.domNodes).map((node) => (
                        <button
                          className={cx(
                            "block w-full px-4 py-3 text-left transition hover:bg-neutral-50",
                            focusRing,
                            (selectedNode?.nodeId === node.nodeId || fieldNode?.nodeId === node.nodeId) &&
                              "bg-emerald-50"
                          )}
                          key={node.nodeId}
                          onClick={() =>
                            void (pickMode === "field"
                              ? handleFieldNodeSelect(node)
                              : handleNodeSelect(node))
                          }
                          type="button"
                        >
                          <span className="block break-words text-sm font-semibold text-neutral-950">
                            {nodeLabel(node)}
                          </span>
                          <span className="mt-1 block truncate text-xs text-neutral-600">
                            {node.text || node.nodeId}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="flex h-72 items-center justify-center bg-neutral-50 text-sm text-neutral-600">
                    Screenshot pending
                  </div>
                )}
              </Panel>

              <Panel className="p-5">
                <SectionTitle eyebrow="Inspect" title="Selection details" />
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-md bg-neutral-50 px-3 py-2">
                    <dt className="font-medium text-neutral-500">Status</dt>
                    <dd className="mt-1">
                      <StatusPill status={pageSession.jobStatus} />
                    </dd>
                  </div>
                  <div className="rounded-md bg-neutral-50 px-3 py-2">
                    <dt className="font-medium text-neutral-500">DOM nodes</dt>
                    <dd className="mt-1 font-semibold text-neutral-950">{pageSession.domNodes.length}</dd>
                  </div>
                  <div className="rounded-md bg-neutral-50 px-3 py-2 sm:col-span-2 xl:col-span-1">
                    <dt className="font-medium text-neutral-500">Title</dt>
                    <dd className="mt-1 break-words text-neutral-950">{pageSession.title ?? "Pending"}</dd>
                  </div>
                  <div className="rounded-md bg-neutral-50 px-3 py-2 sm:col-span-2 xl:col-span-1">
                    <dt className="font-medium text-neutral-500">Session</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-neutral-950">
                      {pageSession.sessionId}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 border-t border-neutral-200 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Selected container
                  </h3>
                  {selectedNode ? (
                    <div className="mt-3 space-y-3 text-sm">
                      <p className="break-words font-semibold text-neutral-950">{nodeLabel(selectedNode)}</p>
                      <p className="line-clamp-3 text-neutral-600">{selectedNode.text || "No visible text"}</p>
                      {selectorBusy ? (
                        <p aria-live="polite" className="text-neutral-600">
                          Generating selector...
                        </p>
                      ) : null}
                      {selectorResult ? (
                        <dl className="space-y-3">
                          <div>
                            <dt className="font-medium text-neutral-500">Selector</dt>
                            <dd className="mt-1">
                              <CodeBlock>{selectorResult.selector}</CodeBlock>
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-neutral-500">Matches</dt>
                            <dd className="mt-1 font-semibold text-neutral-950">
                              {selectorResult.matchCount}
                            </dd>
                          </div>
                        </dl>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyState>Select one bounding box or DOM node to define the repeated card.</EmptyState>
                  )}
                </div>

                {selectorResult ? (
                  <div className="mt-6 border-t border-neutral-200 pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Fields</h3>
                      <Button className="min-h-9 px-3" onClick={() => setPickMode("field")} type="button" variant="secondary">
                        Pick field
                      </Button>
                    </div>
                    {fieldSelector ? (
                      <div className="mt-4 space-y-3">
                        <FieldLabel label="Name">
                          <TextInput
                            onChange={(event) => setFieldName(event.target.value)}
                            value={fieldName}
                          />
                        </FieldLabel>
                        <FieldLabel label="Extract">
                          <select
                            className={cx(inputClass, focusRing)}
                            onChange={(event) => setFieldExtract(event.target.value as ExtractType)}
                            value={fieldExtract}
                          >
                            <option value="text">text</option>
                            <option value="href">href</option>
                            <option value="src">src</option>
                            <option value="attribute">attribute</option>
                            <option value="html">html</option>
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
                        <div className="space-y-3">
                          <CodeBlock>{fieldSelector.selector}</CodeBlock>
                          <Button className="min-h-9 px-3" onClick={addField} type="button">
                            Add field
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-600">
                        Switch to field mode and select a node inside the chosen card.
                      </p>
                    )}
                    {fields.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        <div className="space-y-2">
                          {fields.map((field) => (
                            <div
                              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
                              key={field.name}
                            >
                              <p className="break-words font-semibold text-neutral-950">{field.name}</p>
                              <p className="break-all font-mono text-xs leading-relaxed text-neutral-600">
                                {field.selector} · {field.extract}
                              </p>
                            </div>
                          ))}
                        </div>
                        <Button disabled={previewBusy} onClick={() => void runPreview()} type="button">
                          {previewBusy ? "Extracting..." : "Preview rows"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Panel>
            </section>
          ) : null}

          {preview && fields.length > 0 ? (
            <Panel className="overflow-hidden">
              <div className="border-b border-neutral-200 p-5">
                <SectionTitle
                  action={<StatusPill status={`${displayPreviewRows.length} shown`} />}
                  eyebrow="Preview"
                  title="Extracted table"
                />
              </div>
              <div className="overflow-auto">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      {fields.map((field) => (
                        <th
                          className="min-w-40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500"
                          key={field.name}
                        >
                          {field.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {displayPreviewRows.slice(0, 20).map((row) => (
                      <tr className="hover:bg-neutral-50/70" key={row.id}>
                        {fields.map((field) => (
                          <td className="min-w-40 max-w-80 px-4 py-3 align-top text-neutral-950" key={field.name}>
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

          {preview && fields.length > 0 && selectorResult ? (
            <section className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel className="p-5">
                  <SectionTitle eyebrow="Save" title="Recipe" />
                  <FieldLabel label="Name">
                    <TextInput
                      className="mt-4"
                      onChange={(event) => setRecipeName(event.target.value)}
                      value={recipeName}
                    />
                  </FieldLabel>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button disabled={recipeBusy} onClick={() => void handleSaveRecipe()} type="button">
                      {recipeBusy ? "Saving..." : "Save recipe"}
                    </Button>
                    <Button
                      disabled={!savedRecipe || runBusy}
                      onClick={() => void handleRunRecipe()}
                      type="button"
                      variant="secondary"
                    >
                      {runBusy ? "Starting..." : "Run once"}
                    </Button>
                  </div>
                  {savedRecipe ? (
                    <dl className="mt-5 space-y-3 text-sm">
                      <div className="rounded-md bg-neutral-50 px-3 py-2">
                        <dt className="font-medium text-neutral-500">Saved</dt>
                        <dd className="mt-1 break-words font-semibold text-neutral-950">{savedRecipe.name}</dd>
                      </div>
                      <div className="rounded-md bg-neutral-50 px-3 py-2">
                        <dt className="font-medium text-neutral-500">Recipe ID</dt>
                        <dd className="mt-1 break-all font-mono text-xs text-neutral-950">
                          {savedRecipe.id}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                </Panel>

                <Panel className="p-5">
                  <SectionTitle eyebrow="Run" title="Status and exports" />
                  {run ? (
                    <>
                      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md bg-neutral-50 px-3 py-2">
                          <dt className="font-medium text-neutral-500">Status</dt>
                          <dd className="mt-1">
                            <StatusPill status={run.status} />
                          </dd>
                        </div>
                        <div className="rounded-md bg-neutral-50 px-3 py-2">
                          <dt className="font-medium text-neutral-500">Records</dt>
                          <dd className="mt-1 font-semibold text-neutral-950">{run.totalRecords}</dd>
                        </div>
                        <div className="col-span-2 rounded-md bg-neutral-50 px-3 py-2">
                          <dt className="font-medium text-neutral-500">Run ID</dt>
                          <dd className="mt-1 break-all font-mono text-xs text-neutral-950">{run.id}</dd>
                        </div>
                        {run.errorMessage ? (
                          <div className="col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                            <dt className="font-medium text-red-800">Error</dt>
                            <dd className="mt-1 break-words text-red-800">{run.errorMessage}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
                        <Button
                          disabled={run.status !== "completed" || exportBusy === "csv"}
                          onClick={() => void handleDownloadExport("csv")}
                          type="button"
                          variant="secondary"
                        >
                          {exportBusy === "csv" ? "Preparing CSV..." : "Download CSV"}
                        </Button>
                        <Button
                          disabled={run.status !== "completed" || exportBusy === "json"}
                          onClick={() => void handleDownloadExport("json")}
                          type="button"
                          variant="secondary"
                        >
                          {exportBusy === "json" ? "Preparing JSON..." : "Download JSON"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-5">
                      <EmptyState>Save a recipe and run it once to see records, diffs, and exports.</EmptyState>
                    </div>
                  )}
                </Panel>
              </div>

              {run ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  {(["new", "changed", "removed"] as const).map((changeType) => (
                    <Panel className="p-4" key={changeType}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          {changeType}
                        </h3>
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-sm font-semibold text-neutral-950">
                          {run.changes[changeType].length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {run.changes[changeType].slice(0, 5).map((event) => (
                          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs" key={event.id}>
                            <p className="break-all font-mono text-neutral-700">{event.recordKey}</p>
                            <p className="mt-1 line-clamp-2 break-words text-neutral-600">
                              {changePreview(event.newData ?? event.oldData)}
                            </p>
                          </div>
                        ))}
                        {run.status === "completed" && run.changes[changeType].length === 0 ? (
                          <p className="text-sm text-neutral-600">No records.</p>
                        ) : null}
                      </div>
                    </Panel>
                  ))}
                </div>
              ) : null}

            </section>
          ) : null}
          {run && displayRunRecords.length > 0 ? (
            <Panel className="overflow-hidden">
              <div className="border-b border-neutral-200 p-5">
                <SectionTitle
                  action={<StatusPill status={`${displayRunRecords.length} shown`} />}
                  eyebrow="Results"
                  title="Latest run records"
                />
              </div>
              <div className="overflow-auto">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      {runRecordColumns.map((column) => (
                        <th
                          className="min-w-40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500"
                          key={column}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {displayRunRecords.slice(0, 20).map((record) => (
                      <tr className="hover:bg-neutral-50/70" key={record.id}>
                        {runRecordColumns.map((column) => (
                          <td className="min-w-40 max-w-80 px-4 py-3 align-top text-neutral-950" key={column}>
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
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8 text-neutral-950 sm:px-6">
      <section className="mx-auto flex max-w-md flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">ScrapTheWeb</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-neutral-950">
            Access your extraction workspace
          </h1>
        </div>

        {showPasswordReset ? (
          <PasswordResetPanel onClose={() => setShowPasswordReset(false)} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
              {renderSegmentedButton({
                current: mode,
                label: "Register",
                value: "register",
                onSelect: setMode
              })}
              {renderSegmentedButton({
                current: mode,
                label: "Log in",
                value: "login",
                onSelect: setMode
              })}
            </div>

            <Panel className="p-5">
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
                    className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                    role="status"
                  >
                    {error}
                  </div>
                ) : null}
              </form>
              {mode === "login" ? (
                <div className="mt-3 text-right">
                  <button
                    className={cx(
                      "text-sm font-medium text-emerald-700 hover:text-emerald-900",
                      focusRing
                    )}
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
      </section>
    </main>
  );
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
