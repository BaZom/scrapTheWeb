"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const sidebarBrandStyle: CSSProperties = {
    border: 0,
    background: "transparent",
    padding: "4px 6px 18px",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 5
  };

  return (
    <div className={cx("app", sidebarCollapsed && "app-sidebar-collapsed")} data-screen-label={`02 ${copy.title}`}>
      <aside className="sidebar">
        <button
          type="button"
          className={cx("sidebar-toggle", focusRing)}
          onClick={() => setSidebarCollapsed((value) => !value)}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={sidebarCollapsed ? "chevronRight" : "chevronLeft"} size={14} />
        </button>
        <button type="button" className="brand harvest-brand" onClick={() => onViewChange("builder")} style={sidebarBrandStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/harvest-assets/pics/skrowt-wordmark.png"
            width={166}
            height={53}
            alt="Skrowt"
            className="brand-wordmark"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/harvest-assets/pics/skrowt-icon.png"
            width={28}
            height={40}
            alt="Skrowt"
            className="brand-iconmark"
          />
          <span className="brand-tagline">turn websites into structured data</span>
        </button>

        <nav className="nav-section">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx("nav-item", activeView === item.id && "active", focusRing)}
              onClick={() => onViewChange(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon name={item.icon} size={15} className="nav-icon" />
              <span className="nav-text">{item.label}</span>
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
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon name={item.icon} size={15} className="nav-icon" />
              <span className="nav-text">{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            className={cx("profile-tile", focusRing)}
            onClick={onLogout}
            title="Sign out"
          >
            <Avatar name={workspaceInitials} size={28} />
            <div className="pt-info">
              <div className="pt-name">{userDisplayName}</div>
              <div className="pt-email">{role} · {workspaceName}</div>
            </div>
            <Icon name="chevronUpDown" size={13} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
      </aside>

      <div className="main">
        {!fullBleed ? (
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
        ) : null}

        {fullBleed ? children : <div className="page"><div className="page-inner">{children}</div></div>}
      </div>
    </div>
  );
}
