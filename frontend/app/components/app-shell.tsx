import type { ReactNode } from "react";

import type { Dashboard } from "@/lib/api";

import { Icon } from "./icons";
import {
  type AppView,
  navBottom,
  navItems,
  pageCopy
} from "../data/product-ui";
import { Avatar, Button, cx, focusRing } from "./ui";

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
  const userEmail = dashboard?.user.email ?? "";
  const workspaceName = dashboard?.organizations[0]?.name ?? "Workspace";
  const role = dashboard?.organizations[0]?.role ?? "Member";
  const workspaceInitials =
    workspaceName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase() || "W";
  const userDisplayName = userEmail.split("@")[0]?.replace(/[._-]/g, " ") || "Account";
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
            <div className="ws-plan">{role}</div>
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
