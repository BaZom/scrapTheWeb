export type AppView =
  | "dashboard"
  | "monitors"
  | "monitorDetail"
  | "recipes"
  | "builder"
  | "runs"
  | "exports"
  | "settings"
  | "profile";

export type DisplayRow = {
  id: string;
  values: Record<string, unknown>;
};

export const navItems: Array<{ id: AppView; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "D" },
  { id: "monitors", label: "Monitors", icon: "M" },
  { id: "recipes", label: "Recipes", icon: "R" },
  { id: "builder", label: "Builder", icon: "B" },
  { id: "runs", label: "Runs", icon: "N" },
  { id: "exports", label: "Exports", icon: "E" },
  { id: "settings", label: "Settings", icon: "S" }
];

export const pageCopy: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Website Monitoring",
    subtitle:
      "Monitor public pages, extract structured records, and get alerts when listings, prices, or availability change."
  },
  monitors: {
    title: "Monitors",
    subtitle: "Manage the public pages you track and the alerts they produce."
  },
  monitorDetail: {
    title: "Monitor Detail",
    subtitle: "Select a saved monitor once scheduling is available."
  },
  recipes: {
    title: "Recipes",
    subtitle: "Manage reusable extraction templates for websites and page types."
  },
  builder: {
    title: "Recipe Builder",
    subtitle: "Select a result container, map fields, and preview structured records."
  },
  runs: {
    title: "Runs",
    subtitle: "Review extraction executions, failures, durations, and detected changes."
  },
  exports: {
    title: "Exports",
    subtitle: "Download CSV and JSON files generated from monitor runs."
  },
  settings: {
    title: "Settings",
    subtitle: "Manage workspace, members, alerts, integrations, security, and billing."
  },
  profile: {
    title: "Profile",
    subtitle: "Manage your personal account, sessions, and notification preferences."
  }
};
