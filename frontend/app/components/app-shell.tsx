import type { ReactNode } from "react";

import type { Dashboard } from "@/lib/api";

import { Icon } from "./icons";
import {
  type AppView,
  navBottom,
  navItems,
  pageCopy
} from "../data/product-ui";
import { Avatar, Button, Card, cx, focusRing } from "./ui";

export function AppShell({
  activeView,
  children,
  dashboard,
  onCreateRecipe,
  onLogout,
  onRunAll,
  onViewChange
}: {
  activeView: AppView;
  children: ReactNode;
  dashboard: Dashboard | null;
  onCreateRecipe: () => void;
  onLogout: () => void;
  onRunAll: () => void;
  onViewChange: (view: AppView) => void;
}) {
  const copy = pageCopy[activeView];
  const userEmail = dashboard?.user.email ?? "ondrej@oceanmata.com";
  const workspaceName = dashboard?.organizations[0]?.name ?? "Ocean Mata";
  const seats = dashboard?.organizations.length ?? 1;
  const workspaceInitials =
    workspaceName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase() || "OM";
  const userDisplayName = userEmail.split("@")[0]?.replace(/[._-]/g, " ") ?? userEmail;
  const fullBleed = activeView === "builder";

  return (
    <div className="app" data-screen-label={`02 ${copy.title}`}>
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => onViewChange("dashboard")} style={{ border: 0, background: "transparent", padding: "6px 10px 14px", width: "100%", textAlign: "left", cursor: "pointer" }}>
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 5L12 2.5L19 5V12C19 16.5 15.5 20 12 21C8.5 20 5 16.5 5 12V5Z" fill="white" fillOpacity="0.92" />
              <path d="M9 11L11 13L15.5 8.5" stroke="var(--accent-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand-name">ScrapTheWeb</span>
        </button>

        <button
          type="button"
          className="ws-switcher"
          title="Switch workspace"
          onClick={() => onViewChange("settings")}
        >
          <div className="ws-avatar">{workspaceInitials}</div>
          <div className="ws-info">
            <div className="ws-name">{workspaceName}</div>
            <div className="ws-plan">Team · {seats} seat{seats === 1 ? "" : "s"}</div>
          </div>
          <Icon name="chevronUpDown" size={13} />
        </button>

        <nav className="nav-section">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx("nav-item", activeView === item.id && "active", focusRing)}
              onClick={() => onViewChange(item.id)}
            >
              <Icon name={item.icon} size={15} className="nav-icon" />
              <span>{item.label}</span>
              {item.badge ? <span className="badge-count">{item.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        <Card
          className=""
          style={{
            padding: 12,
            margin: "0 4px 8px",
            background: "linear-gradient(180deg, var(--accent-softer) 0%, var(--surface) 75%)",
            border: "1px solid var(--accent-soft)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Icon name="bolt" size={14} style={{ color: "var(--accent-deep)" }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Quota</div>
            <span className="badge badge-outline" style={{ marginLeft: "auto", fontSize: 10 }}>
              Team
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>12,408</span> of 25,000 records this month
          </div>
          <div style={{ height: 5, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
            <div
              style={{
                width: "49%",
                height: "100%",
                background: "linear-gradient(90deg, var(--accent), var(--accent-strong))",
                borderRadius: 999
              }}
            />
          </div>
        </Card>

        <div className="sidebar-foot">
          {navBottom.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx("nav-item", activeView === item.id && "active", focusRing)}
              onClick={() => onViewChange(item.id)}
            >
              <Icon name={item.icon} size={15} className="nav-icon" />
              <span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            className={cx("profile-tile", focusRing)}
            onClick={onLogout}
            title="Sign out"
          >
            <Avatar name={userDisplayName} size={28} />
            <div className="pt-info">
              <div className="pt-name">{userDisplayName}</div>
              <div className="pt-email">{userEmail}</div>
            </div>
            <Icon name="chevronUpDown" size={13} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <div className="h-title">
            <h1>{copy.title}</h1>
            {copy.subtitle ? <span className="h-sub">{copy.subtitle}</span> : null}
          </div>
          <div className="grow" />
          <div className="search-box">
            <Icon name="search" size={14} />
            <input placeholder="Search monitors, websites, records…" />
            <span className="kbd">⌘K</span>
          </div>
          <Button variant="secondary" size="sm" icon="play" onClick={onRunAll}>
            Run all
          </Button>
          <Button variant="primary" size="sm" icon="wand" onClick={onCreateRecipe}>
            Open Builder
          </Button>
          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
          <button type="button" className="icon-btn" title="Notifications">
            <Icon name="bell" size={14} />
            <span className="dot" />
          </button>
          <Avatar name={userDisplayName} size={32} className="avatar" />
        </header>

        {fullBleed ? children : <div className="page"><div className="page-inner">{children}</div></div>}
      </div>
    </div>
  );
}
