import { FormEvent, useEffect, useState } from "react";

import {
  type ApiKey,
  confirmEmailVerification,
  confirmPasswordReset,
  createApiKey,
  deleteApiKey,
  listApiKeys,
  requestEmailVerification,
  requestPasswordReset,
  revokeAllSessions
} from "@/lib/api";

import { Button, CodeBlock, FieldLabel, Panel, SectionTitle, StatusPill, TextInput } from "./ui";

export function AccountPanel({
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
    <Panel className="p-5">
      <SectionTitle
        eyebrow="Account"
        title="Verification, API keys, and sessions"
        action={
          <Button
            disabled={accountBusy}
            onClick={handleRevokeAllSessions}
            type="button"
            variant="secondary"
          >
            Revoke sessions
          </Button>
        }
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Email verification</h3>
            <StatusPill status={emailVerified ? "Verified" : "Needs review"} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Local dev does not send email. The token is logged to the API container.
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
                  Resend token
                </Button>
              </div>
              <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleConfirmVerification}>
                <TextInput
                  aria-label="Verification token"
                  onChange={(event) => setVerifyToken(event.target.value)}
                  placeholder="Paste verification token"
                  value={verifyToken}
                />
                <Button disabled={accountBusy || !verifyToken.trim()} type="submit">
                  Verify
                </Button>
              </form>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">API keys</h3>
          <p className="mt-2 text-sm text-slate-500">
            API keys are for product integrations and exports. The full key is shown once.
          </p>
          <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleCreateKey}>
            <TextInput
              aria-label="New API key name"
              maxLength={160}
              onChange={(event) => setNewKeyName(event.target.value)}
              placeholder="ops-export-key"
              value={newKeyName}
            />
            <Button disabled={accountBusy || !newKeyName.trim()} type="submit">
              Create key
            </Button>
          </form>
          {revealedKey ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="font-semibold text-emerald-900">Copy this key now. It will not be shown again.</p>
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
              <li className="text-sm text-slate-500">No API keys yet.</li>
            ) : (
              apiKeys.map((key) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  key={key.id}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-slate-900">{key.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{key.prefix}...</span>
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
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {verifyMsg}
        </p>
      ) : null}
      {accountErr ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="status">
          {accountErr}
        </p>
      ) : null}
    </Panel>
  );
}

export function PasswordResetPanel({
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
      setMessage("If that email exists we sent a reset token. In local dev check the API logs.");
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
        <FieldLabel label="Reset token">
          <TextInput
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste the token"
            value={token}
          />
        </FieldLabel>
        <FieldLabel label="New password">
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
      {message ? <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {errorMessage ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</p> : null}
    </Panel>
  );
}
