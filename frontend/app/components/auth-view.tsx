"use client";

import { type FormEvent, Fragment, useState } from "react";

import { Icon, type IconName } from "./icons";
import { Badge, Button, FaviconTile, StatusBadge, cx } from "./ui";
import { PasswordResetPanel } from "./account-panels";

export type AuthMode = "signin" | "register";

export function AuthView({
  mode,
  onModeChange,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  busy,
  error
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string | null;
}) {
  const [showReset, setShowReset] = useState(false);

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        overflow: "auto",
        display: "grid",
        gridTemplateColumns: "minmax(480px, 1fr) minmax(0, 1.1fr)",
        background: "var(--bg-app)"
      }}
    >
      {/* LEFT — form */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "32px 48px",
          background: "white",
          borderRight: "1px solid var(--border)",
          minHeight: "100vh"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 5L12 2.5L19 5V12C19 16.5 15.5 20 12 21C8.5 20 5 16.5 5 12V5Z"
                fill="white"
                fillOpacity="0.92"
              />
              <path
                d="M9 11L11 13L15.5 8.5"
                stroke="var(--accent-deep)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>ScrapTheWeb</div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "32px 0" }}>
          <div style={{ maxWidth: 380, width: "100%" }}>
            {showReset ? (
              <PasswordResetPanel onClose={() => setShowReset(false)} />
            ) : (
              <>
                <div className="segmented" style={{ marginBottom: 22, padding: 4, display: "flex", width: "100%" }}>
                  <button
                    type="button"
                    className={cx(mode === "signin" && "on")}
                    style={{ height: 28, flex: 1, justifyContent: "center" }}
                    onClick={() => onModeChange("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={cx(mode === "register" && "on")}
                    style={{ height: 28, flex: 1, justifyContent: "center" }}
                    onClick={() => onModeChange("register")}
                  >
                    Create account
                  </button>
                </div>

                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
                  {mode === "signin" ? "Sign in to ScrapTheWeb" : "Start your 14-day trial"}
                </h1>
                <p style={{ marginTop: 6, marginBottom: 22, color: "var(--text-secondary)", fontSize: 13.5 }}>
                  Turn public pages into structured records, alerts, and exports.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  <Button variant="secondary" style={{ width: "100%", justifyContent: "center" }}>
                    <GoogleGlyph />
                    Google
                  </Button>
                  <Button variant="secondary" icon="github" style={{ width: "100%", justifyContent: "center" }}>
                    GitHub
                  </Button>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    color: "var(--text-faint)",
                    fontSize: 11.5,
                    margin: "8px 0 16px",
                    whiteSpace: "nowrap"
                  }}
                >
                  <div style={{ height: 1, background: "var(--divider)", flex: 1 }} />
                  OR CONTINUE WITH EMAIL
                  <div style={{ height: 1, background: "var(--divider)", flex: 1 }} />
                </div>

                <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="field">
                    <label>{mode === "register" ? "Work email" : "Email"}</label>
                    <input
                      className="input input-lg"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => onEmailChange(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <div className="field">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <label>Password</label>
                      {mode === "signin" ? (
                        <button
                          type="button"
                          onClick={() => setShowReset(true)}
                          style={{
                            background: "transparent",
                            border: 0,
                            fontSize: 12,
                            color: "var(--accent-deep)",
                            fontWeight: 550,
                            padding: 0,
                            cursor: "pointer"
                          }}
                        >
                          Forgot password?
                        </button>
                      ) : null}
                    </div>
                    <input
                      className="input input-lg"
                      type="password"
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      minLength={8}
                      required
                      value={password}
                      onChange={(e) => onPasswordChange(e.target.value)}
                      placeholder={mode === "register" ? "At least 8 characters" : ""}
                    />
                  </div>

                  {mode === "register" ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        marginTop: 4
                      }}
                    >
                      <input type="checkbox" defaultChecked style={{ marginTop: 3 }} />
                      <span>
                        I agree to the{" "}
                        <a style={{ color: "var(--accent-deep)", fontWeight: 550 }}>Terms</a> and{" "}
                        <a style={{ color: "var(--accent-deep)", fontWeight: 550 }}>Privacy Policy</a>.
                      </span>
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    trailingIcon="arrowRight"
                    disabled={busy}
                    style={{ justifyContent: "center", marginTop: 6 }}
                  >
                    {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create workspace"}
                  </Button>

                  {error ? (
                    <div
                      role="status"
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--danger)",
                        background: "var(--danger-bg)",
                        color: "var(--danger-fg)",
                        fontSize: 13,
                        fontWeight: 550
                      }}
                    >
                      {error}
                    </div>
                  ) : null}

                  <div
                    style={{
                      textAlign: "center",
                      fontSize: 12.5,
                      color: "var(--text-muted)",
                      marginTop: 4,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {mode === "signin" ? (
                      <>
                        Don&apos;t have an account?{" "}
                        <button
                          type="button"
                          onClick={() => onModeChange("register")}
                          style={{
                            background: 0,
                            border: 0,
                            color: "var(--accent-deep)",
                            fontWeight: 600,
                            padding: 0,
                            cursor: "pointer"
                          }}
                        >
                          Create one →
                        </button>
                      </>
                    ) : (
                      <>
                        Already on ScrapTheWeb?{" "}
                        <button
                          type="button"
                          onClick={() => onModeChange("signin")}
                          style={{
                            background: 0,
                            border: 0,
                            color: "var(--accent-deep)",
                            fontWeight: 600,
                            padding: 0,
                            cursor: "pointer"
                          }}
                        >
                          Sign in →
                        </button>
                      </>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: "var(--text-muted)", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>© 2026 ScrapTheWeb</span>
          <span>•</span>
          <a>Status</a>
          <a>Privacy</a>
          <a>Terms</a>
          <a>Contact</a>
        </div>
      </div>

      {/* RIGHT — product visual */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(155deg, var(--accent-softer) 0%, #FFFFFF 55%, #F2EFFD 100%)",
          padding: "40px 56px",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <span className="workflow-chip" style={{ background: "white" }}>
            <Icon name="trend" size={11} style={{ color: "var(--success-fg)" }} />
            Trusted by 1,400+ ops & market intelligence teams
          </span>
        </div>

        <h2
          style={{
            fontSize: 36,
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
            fontWeight: 600,
            margin: 0,
            maxWidth: 540
          }}
        >
          Stop manually checking websites.
          <br />
          <span
            style={{
              background: "linear-gradient(90deg, var(--accent), var(--accent-deep))",
              WebkitBackgroundClip: "text",
              color: "transparent"
            }}
          >
            Turn public pages into structured records.
          </span>
        </h2>
        <p
          style={{
            marginTop: 18,
            color: "var(--text-secondary)",
            fontSize: 14.5,
            maxWidth: 480,
            lineHeight: 1.55
          }}
        >
          Point at any URL. Pick a card. Map fields. Get a clean table — and an alert when anything changes. No proxies. No engineers. No browser plugins.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 28, maxWidth: 540 }}>
          {(
            [
              { icon: "monitor", label: "Monitor" },
              { icon: "recipe", label: "Recipe" },
              { icon: "runs", label: "Run" },
              { icon: "records", label: "Records" },
              { icon: "diff", label: "Changes" },
              { icon: "exports", label: "Export" }
            ] as Array<{ icon: IconName; label: string }>
          ).map((s, i, arr) => (
            <Fragment key={s.label}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px 5px 7px",
                  borderRadius: 999,
                  background: "white",
                  border: "1px solid var(--border)",
                  fontSize: 12,
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
              </span>
              {i < arr.length - 1 ? (
                <Icon name="chevronRight" size={11} style={{ color: "var(--text-faint)", alignSelf: "center" }} />
              ) : null}
            </Fragment>
          ))}
        </div>

        <div style={{ marginTop: 40, position: "relative", flex: 1 }}>
          <div
            style={{
              background: "white",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow-pop)",
              overflow: "hidden",
              maxWidth: 580,
              marginLeft: "auto"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 14px",
                borderBottom: "1px solid var(--divider)",
                background: "white"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FaviconTile host="bestbuy" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Best Buy · Espresso Machines</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    last run 3m ago · 18 records · 6 changes
                  </div>
                </div>
              </div>
              <Badge tone="success" dot>
                Healthy
              </Badge>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { n: "Breville Bambino Plus", p: "€399.00", s: "In stock", d: "new", was: "" },
                  { n: "De'Longhi Magnifica S", p: "€499.00", s: "In stock", d: "changed", was: "€549" },
                  { n: "Smeg ECF02", p: "—", s: "Discontinued", d: "removed", was: "" },
                  { n: "Gaggia Classic Pro", p: "€449.00", s: "Low (2)", d: "", was: "" }
                ].map((r, i) => (
                  <tr key={i}>
                    <td className="ci-name">{r.n}</td>
                    <td className="mono tabular">
                      {r.p}
                      {r.was ? (
                        <span style={{ color: "var(--text-faint)", textDecoration: "line-through", marginLeft: 6 }}>
                          {r.was}
                        </span>
                      ) : null}
                    </td>
                    <td className="muted">{r.s}</td>
                    <td>{r.d ? <StatusBadge status={r.d} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              position: "absolute",
              left: -10,
              top: 30,
              background: "white",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "var(--shadow-lg)",
              padding: "10px 12px",
              display: "flex",
              gap: 10,
              alignItems: "center",
              maxWidth: 280,
              transform: "rotate(-2deg)"
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "var(--warning-bg)",
                color: "var(--warning-fg)",
                display: "grid",
                placeItems: "center"
              }}
            >
              <Icon name="bell" size={14} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Price drop alert</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>De&apos;Longhi Magnifica — €549 → €499</div>
            </div>
          </div>
        </div>

        <div style={{ paddingTop: 24, marginTop: "auto", borderTop: "1px dashed var(--border)" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10
            }}
          >
            Used by teams at
          </div>
          <div
            style={{
              display: "flex",
              gap: 22,
              alignItems: "center",
              flexWrap: "wrap",
              color: "var(--text-secondary)",
              opacity: 0.65,
              fontWeight: 600,
              letterSpacing: "-0.015em"
            }}
          >
            <span style={{ fontSize: 17, fontFamily: "Georgia, serif" }}>Hibou Group</span>
            <span style={{ fontSize: 15, fontFamily: "var(--font-mono)", fontWeight: 700 }}>Northgate.</span>
            <span style={{ fontSize: 18, letterSpacing: "-0.04em" }}>vinyl.</span>
            <span style={{ fontSize: 16, fontWeight: 800 }}>ATELIER 12</span>
            <span style={{ fontSize: 15, fontStyle: "italic" }}>Mercato</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>◇ FRAME</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.2-2 2.9v2.4h3.2c1.9-1.8 3-4.4 3-7.1z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.4c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.5C4.7 19.8 8.1 22 12 22z"
      />
      <path fill="#FBBC05" d="M6.4 14.1c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.6H3.1C2.4 9 2 10.5 2 12s.4 3 1.1 4.4l3.3-2.3z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2 8.1 2 4.7 4.2 3.1 7.6l3.3 2.5C7.2 7.6 9.4 5.9 12 5.9z" />
    </svg>
  );
}
