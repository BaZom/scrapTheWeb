import type { IconName } from "../components/icons";

export type AppView =
  | "dashboard"
  | "monitors"
  | "monitorDetail"
  | "recipes"
  | "builder"
  | "runTest"
  | "runs"
  | "exports"
  | "settings"
  | "profile";

export type DisplayRow = {
  id: string;
  values: Record<string, unknown>;
};

export type NavItem = {
  id: AppView;
  label: string;
  icon: IconName;
  badge?: string;
};

export const navItems: NavItem[] = [
  { id: "builder", label: "Builder", icon: "wand" },
  { id: "dashboard", label: "Overview", icon: "dashboard" },
  { id: "monitors", label: "Monitors", icon: "monitor", badge: "Soon" },
  { id: "recipes", label: "Recipes", icon: "recipe" },
  { id: "runTest", label: "Run Test", icon: "play" },
  { id: "runs", label: "Runs", icon: "runs" },
  { id: "exports", label: "Exports", icon: "exports" }
];

export const navBottom: NavItem[] = [{ id: "settings", label: "Settings", icon: "settings" }];

export const pageCopy: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Workspace overview · last 24 hours" },
  monitors: { title: "Monitors", subtitle: "Scheduled extraction · diff-based alerts" },
  monitorDetail: {
    title: "Monitor Detail",
    subtitle: "Select a saved monitor once scheduling is available."
  },
  recipes: { title: "Recipes", subtitle: "Saved extraction templates" },
  builder: { title: "Recipe Builder", subtitle: "Turn any URL into structured records" },
  runTest: { title: "Run Test", subtitle: "Fetch live data and review changes" },
  runs: { title: "Runs", subtitle: "Execution history" },
  exports: { title: "Exports", subtitle: "CSV & JSON from completed runs" },
  settings: { title: "Settings", subtitle: "Workspace, security, billing" },
  profile: { title: "Profile", subtitle: "Account, sessions, and API keys" }
};

// ----- Demo data (1:1 with /design/data.jsx) -----
export const HOSTS: Record<string, { display: string; color: string; short: string }> = {
  ycombinator: { display: "news.ycombinator.com", color: "#FB651E", short: "HN" },
  indeed: { display: "indeed.com", color: "#1F3F8F", short: "IN" },
  bestbuy: { display: "bestbuy.com", color: "#0F4DBC", short: "BB" },
  amazon: { display: "amazon.com", color: "#D17A06", short: "AM" },
  techcrunch: { display: "techcrunch.com", color: "#107C41", short: "TC" },
  producthunt: { display: "producthunt.com", color: "#DA552F", short: "PH" },
  workable: { display: "jobs.workable.com", color: "#3A75D8", short: "WK" },
  greenhouse: { display: "boards.greenhouse.io", color: "#1F8A5B", short: "GH" },
  shopify: { display: "shopify.com/blog", color: "#3D6B26", short: "SH" },
  glassdoor: { display: "glassdoor.com", color: "#0CAA41", short: "GD" }
};

export type DemoRecipe = {
  id: string;
  name: string;
  host: keyof typeof HOSTS;
  pageType: string;
  fields: number;
  selector: string;
  matches: number;
  lastRun: number;
  runs: number;
  records: number;
  changes: number;
  status: "completed" | "needs" | "failed" | "running" | "paused";
  duration: number;
};

const now = Date.now();

export const DEMO_RECIPES: DemoRecipe[] = [
  { id: "rec_a1", name: "Y Combinator — Front Page", host: "ycombinator", pageType: "Listing",       fields: 5, selector: "tr.athing",                matches: 30, lastRun: now - 1000 * 60 * 7,        runs: 142, records: 4212, changes: 12, status: "completed", duration: 4.2 },
  { id: "rec_a2", name: "Indeed — “Data Analyst, Berlin”", host: "indeed", pageType: "Search results", fields: 8, selector: "div.job_seen_beacon",     matches: 24, lastRun: now - 1000 * 60 * 38,       runs: 86,  records: 2048, changes: 3,  status: "completed", duration: 11.4 },
  { id: "rec_a3", name: "Best Buy — Espresso Machines",  host: "bestbuy", pageType: "Category page",  fields: 7, selector: "li.sku-item",             matches: 18, lastRun: now - 1000 * 60 * 60 * 2,   runs: 312, records: 5604, changes: 27, status: "completed", duration: 6.7 },
  { id: "rec_a4", name: "Workable — Acme Careers",     host: "workable", pageType: "Careers feed",   fields: 6, selector: "li[data-ui='job']",        matches: 11, lastRun: now - 1000 * 60 * 60 * 6,   runs: 64,  records: 712,  changes: 1,  status: "needs",     duration: 3.1 },
  { id: "rec_a5", name: "Product Hunt — Today's Launches", host: "producthunt", pageType: "Listing", fields: 6, selector: "div[data-test='post-item']", matches: 36, lastRun: now - 1000 * 60 * 60 * 9,   runs: 191, records: 6876, changes: 18, status: "completed", duration: 5.0 },
  { id: "rec_a6", name: "TechCrunch — AI Tag",         host: "techcrunch", pageType: "Tag archive",  fields: 4, selector: "li.wp-block-post",         matches: 20, lastRun: now - 1000 * 60 * 60 * 14,  runs: 58,  records: 1160, changes: 0,  status: "completed", duration: 3.8 },
  { id: "rec_a7", name: "Greenhouse — Notion Careers", host: "greenhouse", pageType: "Careers feed", fields: 5, selector: "div.opening",              matches: 87, lastRun: now - 1000 * 60 * 60 * 22,  runs: 31,  records: 2697, changes: 4,  status: "completed", duration: 7.2 },
  { id: "rec_a8", name: "Amazon — DJI Osmo Pocket",    host: "amazon", pageType: "Product page",     fields: 9, selector: "div#dp-container",         matches: 1,  lastRun: now - 1000 * 60 * 60 * 30,  runs: 412, records: 412,  changes: 31, status: "failed",    duration: 0   },
  { id: "rec_a9", name: "Shopify Blog — Commerce News", host: "shopify", pageType: "Blog index",     fields: 4, selector: "article.article-card",     matches: 12, lastRun: now - 1000 * 60 * 60 * 36,  runs: 22,  records: 264,  changes: 0,  status: "completed", duration: 2.3 }
];

export type DemoRun = {
  id: string;
  recipe: string;
  recipeName: string;
  host: keyof typeof HOSTS;
  started: number;
  duration: number;
  records: number;
  changes: number;
  status: "completed" | "running" | "failed";
};

export const DEMO_RUNS: DemoRun[] = [
  { id: "run_8f31", recipe: "rec_a1", recipeName: "Y Combinator — Front Page", host: "ycombinator", started: now - 1000 * 60 * 7, duration: 4.2, records: 30, changes: 4, status: "completed" },
  { id: "run_8f30", recipe: "rec_a2", recipeName: "Indeed — “Data Analyst, Berlin”", host: "indeed", started: now - 1000 * 60 * 38, duration: 11.4, records: 24, changes: 2, status: "completed" },
  { id: "run_8f2f", recipe: "rec_a5", recipeName: "Product Hunt — Today's Launches", host: "producthunt", started: now - 1000 * 60 * 60, duration: 0, records: 0, changes: 0, status: "running" },
  { id: "run_8f2e", recipe: "rec_a3", recipeName: "Best Buy — Espresso Machines", host: "bestbuy", started: now - 1000 * 60 * 60 * 2, duration: 6.7, records: 18, changes: 6, status: "completed" },
  { id: "run_8f2d", recipe: "rec_a8", recipeName: "Amazon — DJI Osmo Pocket", host: "amazon", started: now - 1000 * 60 * 60 * 3, duration: 0, records: 0, changes: 0, status: "failed" },
  { id: "run_8f2c", recipe: "rec_a4", recipeName: "Workable — Acme Careers", host: "workable", started: now - 1000 * 60 * 60 * 6, duration: 3.1, records: 11, changes: 1, status: "completed" },
  { id: "run_8f2b", recipe: "rec_a5", recipeName: "Product Hunt — Today's Launches", host: "producthunt", started: now - 1000 * 60 * 60 * 9, duration: 5.0, records: 36, changes: 7, status: "completed" },
  { id: "run_8f2a", recipe: "rec_a6", recipeName: "TechCrunch — AI Tag", host: "techcrunch", started: now - 1000 * 60 * 60 * 14, duration: 3.8, records: 20, changes: 0, status: "completed" },
  { id: "run_8f29", recipe: "rec_a7", recipeName: "Greenhouse — Notion Careers", host: "greenhouse", started: now - 1000 * 60 * 60 * 22, duration: 7.2, records: 87, changes: 2, status: "completed" },
  { id: "run_8f28", recipe: "rec_a3", recipeName: "Best Buy — Espresso Machines", host: "bestbuy", started: now - 1000 * 60 * 60 * 26, duration: 6.4, records: 18, changes: 3, status: "completed" },
  { id: "run_8f27", recipe: "rec_a9", recipeName: "Shopify Blog — Commerce News", host: "shopify", started: now - 1000 * 60 * 60 * 36, duration: 2.3, records: 12, changes: 0, status: "completed" },
  { id: "run_8f26", recipe: "rec_a1", recipeName: "Y Combinator — Front Page", host: "ycombinator", started: now - 1000 * 60 * 60 * 38, duration: 3.9, records: 30, changes: 5, status: "completed" }
];

export type DemoRecord = {
  rank: number;
  title: string;
  url: string;
  points: number;
  comments: number;
  user: string;
  age: string;
};

export const DEMO_LATEST_RECORDS: DemoRecord[] = [
  { rank: 1, title: "Show HN: Sqlite-rsync — single-file replication over SSH", url: "https://sqlite.org/rsync", points: 482, comments: 213, user: "drhsqlite", age: "3h" },
  { rank: 2, title: "Postgres 17.4 released", url: "https://postgresql.org/docs/release-17-4", points: 311, comments: 84, user: "robmen", age: "5h" },
  { rank: 3, title: "I rewrote my note-taking app in Rust and it's 1.6× slower", url: "https://blog.kerwood.dev/rust-rewrite", points: 268, comments: 412, user: "kerwood", age: "6h" },
  { rank: 4, title: "OpenTelemetry collector reaches 1.0", url: "https://opentelemetry.io/blog/2026/collector-1-0", points: 219, comments: 41, user: "lzap", age: "7h" },
  { rank: 5, title: "How we cut our S3 bill by 74% without changing access patterns", url: "https://canva.engineering/s3-bill", points: 196, comments: 88, user: "canvaeng", age: "8h" },
  { rank: 6, title: "Show HN: I built a structured monitor for any public website", url: "https://scraptheweb.app", points: 182, comments: 53, user: "ondrejhrabal", age: "9h" }
];

export type DemoActivity = { ts: number; type: "run" | "fail" | "review" | "saved"; text: string; meta: string };

export const DEMO_ACTIVITY: DemoActivity[] = [
  { ts: now - 1000 * 60 * 7,        type: "run",    text: "Run completed for Y Combinator — Front Page", meta: "30 records · 4 changes" },
  { ts: now - 1000 * 60 * 60 * 3,   type: "fail",   text: "Run failed for Amazon — DJI Osmo Pocket",      meta: "Selector returned 0 matches" },
  { ts: now - 1000 * 60 * 60 * 6,   type: "review", text: "Workable — Acme Careers needs review",        meta: "1 selector drifted" },
  { ts: now - 1000 * 60 * 60 * 9,   type: "run",    text: "Run completed for Product Hunt — Today's Launches", meta: "36 records · 7 changes" },
  { ts: now - 1000 * 60 * 60 * 20,  type: "saved",  text: "Recipe saved: Greenhouse — Notion Careers",   meta: "5 fields mapped" }
];

export const DEMO_HN_FIELDS = [
  { name: "rank",   type: "text" as const, selector: "span.rank",            attr: "" },
  { name: "title",  type: "text" as const, selector: "span.titleline a",     attr: "" },
  { name: "url",    type: "href" as const, selector: "span.titleline a",     attr: "" },
  { name: "points", type: "text" as const, selector: ".score",                attr: "" },
  { name: "user",   type: "text" as const, selector: ".hnuser",               attr: "" }
];
