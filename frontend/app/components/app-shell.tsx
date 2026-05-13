import { ReactNode } from "react";

import type { Dashboard } from "@/lib/api";

import { AppView, navItems, pageCopy } from "../data/product-ui";
import { Button, Panel, TextInput, cx, focusRing } from "./ui";

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
  const initials = dashboard?.user.email.slice(0, 2).toUpperCase() ?? "ST";

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200/80 bg-white/90 px-4 py-5 backdrop-blur xl:flex xl:flex-col">
        <button
          className={cx("flex items-center gap-3 rounded-2xl px-2 py-2 text-left", focusRing)}
          onClick={() => onViewChange("dashboard")}
          type="button"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-white">
            SW
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-950">ScrapTheWeb</span>
            <span className="block text-xs text-slate-500">Structured monitoring</span>
          </span>
        </button>

        <nav className="mt-8 space-y-1">
          {navItems.map((item) => (
            <button
              className={cx(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition",
                focusRing,
                activeView === item.id
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              )}
              key={item.id}
              onClick={() => onViewChange(item.id)}
              type="button"
            >
              <span
                className={cx(
                  "grid h-7 w-7 place-items-center rounded-xl text-xs font-semibold",
                  activeView === item.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <Panel className="p-4 shadow-none">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Workflow</p>
            <p className="mt-2 text-sm font-medium text-slate-950">URL -&gt; Recipe -&gt; Records -&gt; Alerts</p>
          </Panel>
          <button
            className={cx("flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-slate-100", focusRing)}
            onClick={() => onViewChange("profile")}
            type="button"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-950">
                {dashboard?.user.email ?? "Loading account"}
              </span>
              <span className="block text-xs text-slate-500">Profile and sessions</span>
            </span>
          </button>
        </div>
      </aside>

      <section className="xl:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-[#f7f8fb]/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex gap-2 overflow-auto xl:hidden">
                {navItems.map((item) => (
                  <button
                    className={cx(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      focusRing,
                      activeView === item.id ? "bg-slate-950 text-white" : "bg-white text-slate-600"
                    )}
                    key={item.id}
                    onClick={() => onViewChange(item.id)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{copy.title}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TextInput className="w-full sm:w-72" placeholder="Search monitors, websites, records..." />
              <Button onClick={onRunAll} type="button" variant="secondary">
                Run All
              </Button>
              <Button onClick={onCreateRecipe} type="button">
                Open Builder
              </Button>
              <button
                className={cx("grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500", focusRing)}
                aria-label="Notifications"
                type="button"
              >
                !
              </button>
              <Button onClick={onLogout} type="button" variant="ghost">
                Log out
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </section>
    </main>
  );
}
