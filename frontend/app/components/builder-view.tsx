"use client";

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type {
  AccessBlock,
  ContainerCandidate,
  DomNode,
  ExtractType,
  PageSession,
  PreviewField,
  PreviewResult,
  Recipe,
  SelectorResult
} from "@/lib/api";

import {
  AnimatedFieldRow,
  AnimatedPreviewDrawer,
  AnimatedPreviewRow,
  AnimatedResultOutline,
  HARVEST_ART,
  HarvestArt,
  HarvestStepper,
  SeedBurst
} from "./animations";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Segmented,
  cx
} from "./ui";

const LINK_BUTTON_STYLE = {
  border: 0,
  background: "transparent",
  padding: 0,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--accent-deep)",
  cursor: "pointer"
} as const;

const LIST_STEPS = ["Load page", "Pick an item", "Choose details", "Preview", "Save"];
const SINGLE_STEPS = ["Load page", "Choose details", "Preview", "Save"];

const TYPE_COLORS: Record<ExtractType, { bg: string; fg: string }> = {
  text: { bg: "var(--accent-soft)", fg: "var(--accent-deep)" },
  href: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  src: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  attribute: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
  html: { bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" }
};

function fieldArtFor(extract: ExtractType) {
  if (extract === "href") return HARVEST_ART.fieldLink;
  if (extract === "src") return HARVEST_ART.fieldImage;
  return HARVEST_ART.fieldText;
}

export type BuilderProps = {
  url: string;
  onUrlChange: (url: string) => void;
  onLoadPage: (event?: FormEvent<HTMLFormElement>) => void;
  pageSession: PageSession | null;
  screenshotObjectUrl: string | null;
  selectedNode: DomNode | null;
  selectorResult: SelectorResult | null;
  selectorBusy: boolean;
  recipeShape: "list" | "single";
  onShapeChange: (shape: "list" | "single") => void;
  pickMode: "container" | "field";
  onPickModeChange: (mode: "container" | "field") => void;
  fields: PreviewField[];
  // Remove a field by deleting its column in the preview table (ADR 0009).
  onRemoveField: (name: string) => void;
  onStepNavigate: (target: number) => void;
  preview: PreviewResult | null;
  previewBusy: boolean;
  // Preview records (ADR 0009): commit the selected fields + extract all matched items into
  // the bottom panel. `picks` are the discovery rows the user selected (table or screenshot).
  onPreviewRecords: (
    picks: { nodeId: string; extract: ExtractType; name: string; value: string }[]
  ) => void;
  recipeName: string;
  savedRecipe: Recipe | null;
  recipeBusy: boolean;
  onSaveRecipe: () => void;
  onOpenRunTest: () => void;
  imageSize: { width: number; height: number } | null;
  onImageLoad: (size: { width: number; height: number }) => void;
  renderBusy: boolean;
  error: string | null;
  onNodeSelect: (node: DomNode) => void;
};

function currentStep(props: BuilderProps) {
  // Single-record pages have no "pick an item" step (the whole page is the record).
  if (props.recipeShape === "single") {
    if (props.savedRecipe) return 3;
    if (props.preview) return 2;
    if (props.fields.length > 0) return 1;
    return 0;
  }
  if (props.savedRecipe) return 4;
  if (props.preview) return 3;
  if (props.fields.length > 0) return 2;
  if (props.selectorResult) return 1;
  return 0;
}

function nodeLabel(node: DomNode) {
  const classText = node.classes.length > 0 ? `.${node.classes.slice(0, 2).join(".")}` : "";
  const idText = node.attrs.id ? `#${node.attrs.id}` : "";
  return `${node.tag}${idText}${classText}`;
}

function isDescendant(node: DomNode, ancestor: DomNode, nodes: DomNode[]) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  let parentId = node.parentNodeId;
  while (parentId) {
    if (parentId === ancestor.nodeId) return true;
    parentId = byId.get(parentId)?.parentNodeId ?? null;
  }
  return false;
}

// A friendly, snake_case field name from a hint string (itemprop / class / aria-label).
function slugifyName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Heuristic: is this an auto-generated / developer-ish field name the user would rather
// rename? Used ONLY to prompt a friendlier placeholder in the UI — never to change the
// internal key or the committed field name (those stay exactly as generated).
function isUglyGeneratedName(name: string | undefined | null): boolean {
  if (!name) return true;
  return (
    /^field(_\d+)?$/i.test(name) ||
    /_\d+$/.test(name) ||
    /^(text|link|image|img|src|href)(_?\d+)?$/i.test(name) ||
    name.includes("selector") ||
    name.includes("aditem") ||
    name.includes("galleryimage")
  );
}

// A discovered candidate field (ADR 0009): one extractable value from one element.
type FieldCandidate = {
  key: string; // `${nodeId}:${extract}` — stable id for tick/name state
  nodeId: string;
  extract: ExtractType;
  label: string; // Text / Link / Image
  value: string; // preview value from the DOM node
  suggestedName: string;
};

// Every extractable value present on one element — its text, link, and/or image. Shared by
// auto-discovery (a card's fields) and by clicking an element on the screenshot, so both
// surface the SAME attribute rows for that element (ADR 0009 — group rows, tick multiple).
function candidatesForNode(node: DomNode): FieldCandidate[] {
  const nameFor = (extract: ExtractType): string => {
    const a = node.attrs;
    const hint =
      a.itemprop ||
      a["data-testid"] ||
      a["aria-label"] ||
      node.classes.find((c) =>
        /title|name|price|cost|amount|date|time|location|place|desc|label|brand|model|rating|image|img|photo|link|url/i.test(c)
      );
    return (hint && slugifyName(hint)) || (extract === "href" ? "link" : extract === "src" ? "image" : "field");
  };
  const out: FieldCandidate[] = [];
  const text = (node.text ?? "").trim();
  if (text) {
    out.push({ key: `${node.nodeId}:text`, nodeId: node.nodeId, extract: "text", label: "Text", value: text, suggestedName: nameFor("text") });
  }
  if (node.attrs.href) {
    out.push({ key: `${node.nodeId}:href`, nodeId: node.nodeId, extract: "href", label: "Link", value: node.attrs.href, suggestedName: nameFor("href") });
  }
  if (node.attrs.src) {
    out.push({ key: `${node.nodeId}:src`, nodeId: node.nodeId, extract: "src", label: "Image", value: node.attrs.src, suggestedName: nameFor("src") });
  }
  return out;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function BuilderView(props: BuilderProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Which discovered fields the user has selected (ADR 0009): candidate key `nodeId:extract`.
  // ONE shared selection — toggled by both the table and screenshot clicks, so they can't
  // conflict. Selecting is instant/client-side; nothing extracts until "Preview records".
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // ---- Animation layer (visual-only — deliberately NOT in the reducer) ----
  // Seed burst fires once each time a preview lands.
  const [showSeedBurst, setShowSeedBurst] = useState(false);
  useEffect(() => {
    if (!props.preview) return;
    setShowSeedBurst(true);
    const t = window.setTimeout(() => setShowSeedBurst(false), 1300);
    return () => window.clearTimeout(t);
  }, [props.preview]);
  // Which nodes the container selector matches, so we can outline the whole repeated set
  // on the screenshot. These now come straight from the backend (`selectorResult
  // .matchedNodeIds`) — the same selector engine that produces `matchCount` — so the
  // outline is exact, not a guess. We fall back to a tag+class signature only when the
  // backend returned none (e.g. the synthetic `body` selector on single-record pages).
  const matchedNodeIds = useMemo(() => {
    const authoritative = props.selectorResult?.matchedNodeIds ?? [];
    if (authoritative.length > 0) return new Set(authoritative);
    if (!props.selectedNode || !props.pageSession) return new Set<string>();
    const sig = (n: DomNode) => `${n.tag}|${[...n.classes].sort().join(".")}`;
    const target = sig(props.selectedNode);
    return new Set(props.pageSession.domNodes.filter((n) => sig(n) === target).map((n) => n.nodeId));
  }, [props.selectorResult, props.selectedNode, props.pageSession]);

  // Semantic listing-card candidates from the backend (Container mode's primary layer).
  const candidates = useMemo(
    () => props.pageSession?.containerCandidates ?? [],
    [props.pageSession]
  );
  const domNodeById = useMemo(
    () => new Map((props.pageSession?.domNodes ?? []).map((n) => [n.nodeId, n] as const)),
    [props.pageSession]
  );
  // Candidate cards help the first pick; once an item is chosen, the matched set is outlined.
  const showCandidates =
    props.pickMode === "container" && candidates.length > 0 && !props.selectorResult;

  // The repeated group the current container belongs to — lets us outline the EXACT
  // matched cards (preferred over the tag/class approximation in `matchedNodeIds`).
  const selectedGroup = useMemo(() => {
    if (!props.selectedNode) return null;
    return candidates.find((c) => c.nodeId === props.selectedNode!.nodeId)?.group ?? null;
  }, [props.selectedNode, candidates]);
  const groupMembers = useMemo(
    () => (selectedGroup ? candidates.filter((c) => c.group === selectedGroup) : []),
    [selectedGroup, candidates]
  );

  // Selecting a candidate needs a DomNode for selector generation; prefer the real
  // node (so Field mode can find descendants), fall back to a synthetic one.
  function selectCandidate(c: ContainerCandidate) {
    const node = domNodeById.get(c.nodeId) ?? {
      nodeId: c.nodeId,
      tag: c.tag,
      text: "",
      attrs: {},
      classes: [],
      parentNodeId: null,
      nthOfType: 1,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height
    };
    handleContainerPick(node);
  }

  // Container clicks pick or re-pick the working item. If the click lands inside an already
  // matched card, use the matched card itself rather than a child node.
  function handleContainerPick(node: DomNode) {
    const containerId = props.selectorResult ? matchedContainerIdOf(node) : null;
    props.onNodeSelect((containerId && domNodeById.get(containerId)) || node);
  }

  // The matched item-card a node lives in (walk up to the first ancestor in the match set),
  // or null if it's outside every card.
  function matchedContainerIdOf(node: DomNode): string | null {
    let current: DomNode | undefined = node;
    while (current) {
      if (matchedNodeIds.has(current.nodeId)) return current.nodeId;
      current = current.parentNodeId ? domNodeById.get(current.parentNodeId) : undefined;
    }
    return null;
  }

  // Percentage geometry for an overlay box, in the same coordinate system the screenshot
  // overlay buttons use. Shared by the (visual-only) animated outline layer.
  const overlayGeometry = (n: { x: number; y: number; width: number; height: number }): CSSProperties =>
    props.imageSize
      ? {
          left: `${(n.x / props.imageSize.width) * 100}%`,
          top: `${(n.y / props.imageSize.height) * 100}%`,
          width: `${(n.width / props.imageSize.width) * 100}%`,
          height: `${(n.height / props.imageSize.height) * 100}%`
        }
      : {};

  // Clicking a detail on the screenshot surfaces ALL its attributes (Text/Link/Image) as
  // rows and highlights them, so the user ticks which one(s) to collect — instead of
  // auto-picking a single attribute (ADR 0009 — group rows, tick multiple). Adds the rows
  // if they weren't already listed (e.g. single-record pages, which have no auto-discovery).
  function handleFieldPick(node: DomNode) {
    const cands = candidatesForNode(node);
    if (cands.length === 0) return; // a wrapper with no own value — its value is in a child
    setClickedCandidates((prev) => {
      const have = new Set([...prev, ...discoveredFields].map((c) => c.key));
      const additions = cands.filter((c) => !have.has(c.key));
      return additions.length ? [...prev, ...additions] : prev;
    });
    setFocusedNodeId(node.nodeId);
  }

  const overlayNodes = useMemo(() => {
    const fieldMode = props.pickMode === "field";
    const nodes = props.pageSession?.domNodes ?? [];
    // Field mode operates within the ONE selected card — manual clicks add a field from that
    // card (auto-discovery covers the rest). (Reverted the cross-card expansion, ADR 0009.)
    const all =
      fieldMode && props.selectedNode
        ? nodes.filter((n) => isDescendant(n, props.selectedNode!, nodes))
        : nodes;
    // Sort largest-first so small elements paint last (on top) and win the hover
    // hit-test. In field mode we must NOT cap to the largest boxes — small details
    // like price/mileage are exactly what the user needs to click, and hover-only
    // highlighting means rendering more boxes adds no visual clutter.
    const eligible = all
      .filter((n) => n.width >= 6 && n.height >= 6)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    return fieldMode ? eligible : eligible.slice(0, 220);
  }, [props.pageSession, props.pickMode, props.selectedNode]);

  const fieldNodes = useMemo(() => {
    if (!props.pageSession || !props.selectedNode) return [];
    return props.pageSession.domNodes.filter((n) =>
      isDescendant(n, props.selectedNode!, props.pageSession!.domNodes)
    );
  }, [props.pageSession, props.selectedNode]);

  // Auto-discover the selected card's fields (ADR 0009): list every extractable value inside
  // the card — innermost text (title, price), links, images — with its value, so the user
  // ticks what to keep instead of hunting element by element. List-shape only (a single-page
  // "card" is the whole body; that flow keeps the manual picker).
  const discoveredFields = useMemo<FieldCandidate[]>(() => {
    if (props.recipeShape === "single" || !props.selectedNode || fieldNodes.length === 0) return [];
    const all = props.pageSession?.domNodes ?? [];
    // Innermost text holder: text present and no descendant within the card also has text.
    const hasTextDescendant = (n: DomNode) =>
      fieldNodes.some(
        (d) => d.nodeId !== n.nodeId && (d.text ?? "").trim() !== "" && isDescendant(d, n, all)
      );
    const out: FieldCandidate[] = [];
    fieldNodes.forEach((n) => {
      // Skip the text candidate on wrappers (their text is the whole subtree); keep links/imgs.
      for (const c of candidatesForNode(n)) {
        if (c.extract === "text" && hasTextDescendant(n)) continue;
        out.push(c);
      }
    });
    // Drop empties/dupes by value+type, order by position, cap to stay scannable.
    const seen = new Set<string>();
    const byId = new Map(all.map((d) => [d.nodeId, d] as const));
    return out
      .filter((c) => {
        const k = `${c.label}:${c.value}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => {
        const na = byId.get(a.nodeId)!;
        const nb = byId.get(b.nodeId)!;
        return na.y - nb.y || na.x - nb.x;
      })
      .slice(0, 15);
  }, [props.recipeShape, props.selectedNode, props.pageSession, fieldNodes]);

  // Rows added by clicking an element on the screenshot (elements not in auto-discovery —
  // mainly single-record pages, which have no card to pre-scan). Plus the element whose rows
  // are currently highlighted ("focused") so the user can tick among its attributes.
  const [clickedCandidates, setClickedCandidates] = useState<FieldCandidate[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [fieldNameOverrides, setFieldNameOverrides] = useState<Record<string, string>>({});
  // Reset the field-mapping state when the item (list) or page (single) changes.
  const selectionScopeId = props.selectedNode?.nodeId ?? props.pageSession?.sessionId ?? null;
  useEffect(() => {
    setSelectedKeys(new Set());
    setFieldNameOverrides({});
    setClickedCandidates([]);
    setFocusedNodeId(null);
  }, [selectionScopeId]);

  // All candidate rows = auto-discovered (list cards) + click-added, de-duped, ordered.
  const allCandidates = useMemo<FieldCandidate[]>(() => {
    const byKey = new Map<string, FieldCandidate>();
    [...discoveredFields, ...clickedCandidates].forEach((c) => {
      if (!byKey.has(c.key)) byKey.set(c.key, c);
    });
    const byId = new Map((props.pageSession?.domNodes ?? []).map((d) => [d.nodeId, d] as const));
    return [...byKey.values()].sort((a, b) => {
      const na = byId.get(a.nodeId);
      const nb = byId.get(b.nodeId);
      return (na?.y ?? 0) - (nb?.y ?? 0) || (na?.x ?? 0) - (nb?.x ?? 0);
    });
  }, [discoveredFields, clickedCandidates, props.pageSession]);

  const candidateByKey = useMemo(() => {
    const m = new Map<string, FieldCandidate>();
    allCandidates.forEach((c) => m.set(c.key, c));
    return m;
  }, [allCandidates]);

  // Is this DOM node one of the user's selected fields? (drives the screenshot highlight so
  // table ticks and on-page clicks show the same selection — ADR 0009).
  function nodeIsSelectedField(node: DomNode): boolean {
    return allCandidates.some((c) => c.nodeId === node.nodeId && selectedKeys.has(c.key));
  }

  // Toggle a candidate in the shared selection (used by BOTH the table and the screenshot).
  function toggleFieldKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Select-all for the fields table: tick every current candidate, or untick them all if
  // they're already all on. Operates only on `allCandidates` so it never touches keys that
  // are no longer offered (e.g. after switching items).
  function toggleAllFields() {
    setSelectedKeys((prev) => {
      const keys = allCandidates.map((c) => c.key);
      const allOn = keys.length > 0 && keys.every((k) => prev.has(k));
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  // The selected fields, resolved to {key, nodeId, extract, name, value} with FINAL unique
  // names (deduped here so the committed field names match — lets a removed column untick its
  // candidate). Reads the current item's candidates only (ADR 0009).
  function selectedFieldPicks() {
    const seen = new Set<string>();
    const picks: { key: string; nodeId: string; extract: ExtractType; name: string; value: string }[] = [];
    for (const key of selectedKeys) {
      const c = candidateByKey.get(key);
      if (!c) continue;
      const base = (fieldNameOverrides[key] ?? c.suggestedName).trim() || c.suggestedName;
      let name = base;
      let n = 2;
      while (seen.has(name)) name = `${base}_${n++}`;
      seen.add(name);
      picks.push({ key, nodeId: c.nodeId, extract: c.extract, name, value: c.value });
    }
    return picks;
  }

  // Remove a field by deleting its column in the preview table (ADR 0009): drop the field and
  // untick its candidate so it won't return on the next preview. Adding stays via selection.
  function handleRemoveField(name: string) {
    props.onRemoveField(name);
    const pick = selectedFieldPicks().find((p) => p.name === name);
    if (pick) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(pick.key);
        return next;
      });
    }
  }

  const step = currentStep(props);
  const STEPS = props.recipeShape === "single" ? SINGLE_STEPS : LIST_STEPS;
  const previewRows = props.preview?.rows ?? [];

  return (
    <div className="builder-root">
      {/* TOP: flow + actions, matching the Skrowt harvest workbench. */}
      <div className="builder-topbar">
        {/* Left grid column intentionally empty (keeps the stepper centred). The sprout name
            auto-derives on render (reducer `render_succeeded` → `suggestedName`); the sidebar
            carries the brand, so no title/Draft chip is needed here. */}
        <div className="builder-topbar-spacer" />

        <div className="builder-stepper-wrap">
          <HarvestStepper steps={STEPS} current={step} onStepClick={props.onStepNavigate} />
          <HarvestArt src={HARVEST_ART.sproutGrow} size={52} />
        </div>

        <div className="builder-actions">
          <Button
            variant="secondary"
            size="sm"
            icon="play"
            disabled={!props.savedRecipe || props.recipeBusy}
            onClick={props.onOpenRunTest}
            title={props.savedRecipe ? "Open the live test workspace for this sprout" : "Save the sprout first"}
          >
            Test run
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="bookmark"
            disabled={
              props.recipeBusy ||
              Boolean(props.savedRecipe) ||
              !props.preview ||
              props.fields.length === 0 ||
              !props.recipeName.trim()
            }
            onClick={props.onSaveRecipe}
            title={
              props.savedRecipe
                ? "Sprout saved"
                : !props.preview
                  ? "Preview records first to see the data, then save"
                  : undefined
            }
          >
            {props.recipeBusy ? "Saving…" : props.savedRecipe ? "Saved" : "Save sprout"}
          </Button>
        </div>
      </div>

      {/* URL + status command bar */}
      <div className="builder-command-wrap">
        <div className="builder-command-bar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              props.onLoadPage(e);
            }}
            className="builder-url-form"
          >
            <span className="builder-url-lock">
              <Icon name="lock" size={13} /> https://
            </span>
            <input
              className="input builder-url-input"
              value={props.url.replace(/^https?:\/\//, "")}
              onChange={(e) => props.onUrlChange(`https://${e.target.value.replace(/^https?:\/\//, "")}`)}
              placeholder="kleinanzeigen.de/hunde-und-welpen"
            />
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              type="submit"
              disabled={props.renderBusy}
              className="builder-reload-button"
            >
              Load page
            </Button>
          </form>

          {/* Only a transient loading cue here — the URL bar is otherwise left alone for
              future URL-related features. Page mode + pick controls moved to the right panel. */}
          <div className="builder-status-row">
            {props.renderBusy ? (
              <span className="builder-status-pill builder-status-pill-live">
                <HarvestArt src={HARVEST_ART.collecting} size={24} /> Loading page
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {props.error ? (
        <div
          role="status"
          style={{
            margin: "10px 24px 0",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--danger)",
            background: "var(--danger-bg)",
            color: "var(--danger-fg)",
            fontSize: 13
          }}
        >
          {props.error}
        </div>
      ) : null}

      {/* MAIN SPLIT */}
      <div
        className="builder-workbench"
        style={{
          display: "grid",
          // Resize the WINDOWS, not the image (ADR 0009 fix): the page pane shares space with
          // a roomy assistant panel (where the data lives), and the screenshot fills its pane
          // below — so there are no empty gutters around a shrunken image.
          gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 392px)",
          flex: 1,
          minHeight: 0,
          overflow: "hidden"
        }}
      >
        {/* Canvas */}
        <div
          className="canvas-bg builder-canvas-pane"
          style={{
            padding: 20,
            overflow: "auto",
            minWidth: 0,
            position: "relative"
          }}
        >
          {props.renderBusy && props.pageSession ? (
            <div className="builder-canvas-loading" aria-live="polite">
              <BuilderScreenshotLoading compact />
            </div>
          ) : null}
          {props.pageSession?.accessBlock?.blocked ? (
            <AccessBlockNotice block={props.pageSession.accessBlock} url={props.url} />
          ) : null}
          {!props.pageSession && props.renderBusy ? (
            <BuilderScreenshotLoading />
          ) : props.pageSession ? (
            props.screenshotObjectUrl ? (
                <div
                  style={{
                    width: "100%",
                    marginLeft: 0,
                    transition: "width 180ms ease, margin-left 180ms ease"
                  }}
                >
                  <div
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px 12px 0 0",
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 12px",
                      gap: 8,
                      borderBottom: 0
                    }}
                  >
                    <span style={{ display: "flex", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF6058" }} />
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FFBC2F" }} />
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C940" }} />
                    </span>
                    <div
                      style={{
                        marginLeft: 10,
                        flex: 1,
                        maxWidth: 520,
                        padding: "4px 10px",
                        background: "var(--surface-sunken)",
                        border: "1px solid var(--border)",
                        borderRadius: 7,
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-secondary)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      <Icon name="lock" size={10} /> {props.pageSession.title ?? props.url}
                    </div>
                    <Badge tone="outline">
                      <Icon name="checkCircle" size={11} /> Rendered · {props.pageSession.domNodes.length} nodes
                    </Badge>
                  </div>

                  <div
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderTop: 0,
                      borderRadius: "0 0 12px 12px",
                      boxShadow: "var(--shadow-md)",
                      overflow: "hidden",
                      position: "relative"
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={props.pageSession.title ?? "Rendered page screenshot"}
                        src={props.screenshotObjectUrl}
                        style={{ display: "block", width: "100%" }}
                        onLoad={(e) =>
                          props.onImageLoad({
                            width: e.currentTarget.naturalWidth,
                            height: e.currentTarget.naturalHeight
                          })
                        }
                      />

                      {/* Harvest motion layer — visual only, pointer-events:none, so the
                          interactive overlay buttons below stay fully clickable. Container mode
                          only: the selected result pulses once; the rest of the matched set
                          fades/reveals in, staggered. */}
                      {props.imageSize && props.pickMode === "container" && !showCandidates && props.selectorResult
                        ? [...matchedNodeIds]
                            .filter((id) => id !== props.selectedNode?.nodeId)
                            .map((id, i) => {
                              const n = domNodeById.get(id);
                              if (!n) return null;
                              return (
                                <AnimatedResultOutline key={id} variant="matched" index={i} geometry={overlayGeometry(n)} />
                              );
                            })
                        : null}
                      {props.imageSize && props.pickMode === "container" && !showCandidates && props.selectedNode ? (
                        <AnimatedResultOutline
                          key={`selected-${props.selectedNode.nodeId}`}
                          variant="selected"
                          label="1"
                          geometry={overlayGeometry(props.selectedNode)}
                        />
                      ) : null}

                      {/* One-shot seed burst on preview success. */}
                      <SeedBurst active={showSeedBurst} />

                      {props.imageSize && !showCandidates
                        ? overlayNodes.map((node) => {
                            const selected =
                              (props.pickMode === "container" && props.selectedNode?.nodeId === node.nodeId) ||
                              (props.pickMode === "field" && nodeIsSelectedField(node));
                            const hovered = hoveredNodeId === node.nodeId;
                            // In container mode, persistently outline the whole repeated set
                            // so the user can confirm the selection grabbed every card.
                            const matched = props.pickMode === "container" && matchedNodeIds.has(node.nodeId);
                            // Devtools-style: boxes are invisible until hovered. In CONTAINER
                            // mode the (visual-only) animated outline layer owns the selected
                            // + matched outlines so they can pulse/fade — the button keeps only
                            // hover feedback there to avoid drawing each outline twice. Field
                            // mode is unchanged (its selection highlight stays on the button).
                            const containerMode = props.pickMode === "container";
                            let background = "transparent";
                            let border = "1.4px solid transparent";
                            if (selected && !containerMode) {
                              background = "rgba(0,0,0,0.14)";
                              border = "1.4px solid var(--accent)";
                            } else if (hovered) {
                              background = "rgba(0,0,0,0.07)";
                              border = "1.6px solid var(--accent)";
                            } else if (matched && !containerMode) {
                              border = "1.4px dashed var(--success)";
                            }

                            return (
                              <button
                                type="button"
                                key={node.nodeId}
                                aria-label={`Select ${nodeLabel(node)}`}
                                onMouseEnter={() => setHoveredNodeId(node.nodeId)}
                                onMouseLeave={() =>
                                  setHoveredNodeId((current) => (current === node.nodeId ? null : current))
                                }
                                onClick={() =>
                                  props.pickMode === "field"
                                    ? handleFieldPick(node)
                                    : handleContainerPick(node)
                                }
                                title={`${props.pickMode === "field" ? "Field" : "Container"} ${nodeLabel(node)} ${node.text}`}
                                style={{
                                  position: "absolute",
                                  left: `${(node.x / props.imageSize!.width) * 100}%`,
                                  top: `${(node.y / props.imageSize!.height) * 100}%`,
                                  width: `${(node.width / props.imageSize!.width) * 100}%`,
                                  height: `${(node.height / props.imageSize!.height) * 100}%`,
                                  background,
                                  border,
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  padding: 0,
                                  transition: "background 80ms ease, border-color 80ms ease"
                                }}
                              >
                                {hovered && !selected ? (
                                  <span
                                    style={{
                                      position: "absolute",
                                      top: -20,
                                      left: -1,
                                      maxWidth: 240,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      background: "var(--info)",
                                      color: "white",
                                      fontSize: 10.5,
                                      fontFamily: "var(--font-mono)",
                                      fontWeight: 600,
                                      padding: "1px 6px",
                                      borderRadius: 4,
                                      pointerEvents: "none"
                                    }}
                                  >
                                    {nodeLabel(node)}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })
                        : null}

                      {/* Container mode: clickable semantic listing-card candidates */}
                      {props.imageSize && showCandidates
                        ? candidates.map((c) => {
                            const selected = props.selectedNode?.nodeId === c.nodeId;
                            const inGroup = selectedGroup !== null && c.group === selectedGroup;
                            const hovered = hoveredNodeId === c.nodeId;
                            // Devtools-style: candidates are invisible until hovered, so the
                            // canvas stays clean. Selection + matched-group outline still show.
                            let background = "transparent";
                            let border = "1.4px solid transparent";
                            if (selected) {
                              background = "rgba(0,0,0,0.14)";
                              border = "1.6px solid var(--accent)";
                            } else if (hovered) {
                              background = "rgba(0,0,0,0.08)";
                              border = "1.6px solid var(--accent)";
                            } else if (inGroup) {
                              border = "1.4px dashed var(--accent)";
                            }
                            return (
                              <button
                                type="button"
                                key={`cand-${c.nodeId}`}
                                aria-label={`Select listing card ${c.label}`}
                                onMouseEnter={() => setHoveredNodeId(c.nodeId)}
                                onMouseLeave={() =>
                                  setHoveredNodeId((current) => (current === c.nodeId ? null : current))
                                }
                                onClick={() => selectCandidate(c)}
                                title={`${c.label} · score ${Math.round(c.score)} · ${c.reason}`}
                                style={{
                                  position: "absolute",
                                  left: `${(c.x / props.imageSize!.width) * 100}%`,
                                  top: `${(c.y / props.imageSize!.height) * 100}%`,
                                  width: `${(c.width / props.imageSize!.width) * 100}%`,
                                  height: `${(c.height / props.imageSize!.height) * 100}%`,
                                  background,
                                  border,
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  padding: 0,
                                  transition: "background 80ms ease, border-color 80ms ease"
                                }}
                              >
                                {hovered && !selected ? (
                                  <span
                                    style={{
                                      position: "absolute",
                                      top: -20,
                                      left: -1,
                                      maxWidth: 260,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      background: "var(--accent)",
                                      color: "white",
                                      fontSize: 10.5,
                                      fontFamily: "var(--font-mono)",
                                      fontWeight: 600,
                                      padding: "1px 6px",
                                      borderRadius: 4,
                                      pointerEvents: "none"
                                    }}
                                  >
                                    {c.label}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })
                        : null}

                      {/* Persistent exact-match outline for the selected group while mapping
                          fields. In container mode the node overlays already paint the matched
                          outline (and stay clickable to add missed items), so skip it there. */}
                      {props.imageSize && props.pickMode === "field" && groupMembers.length > 0
                        ? groupMembers.map((c) => (
                            <div
                              key={`grp-${c.nodeId}`}
                              style={{
                                position: "absolute",
                                left: `${(c.x / props.imageSize!.width) * 100}%`,
                                top: `${(c.y / props.imageSize!.height) * 100}%`,
                                width: `${(c.width / props.imageSize!.width) * 100}%`,
                                height: `${(c.height / props.imageSize!.height) * 100}%`,
                                border: "1.4px dashed var(--accent)",
                                borderRadius: 6,
                                pointerEvents: "none"
                              }}
                            />
                          ))
                        : null}

                      {/* The card being worked on — make it unmistakable while mapping
                          fields (ADR 0009 #3): bold outline + a label, dimming the rest. */}
                      {props.imageSize && props.pickMode === "field" && props.selectedNode ? (
                        <div
                          style={{
                            position: "absolute",
                            left: `${(props.selectedNode.x / props.imageSize.width) * 100}%`,
                            top: `${(props.selectedNode.y / props.imageSize.height) * 100}%`,
                            width: `${(props.selectedNode.width / props.imageSize.width) * 100}%`,
                            height: `${(props.selectedNode.height / props.imageSize.height) * 100}%`,
                            border: "2.5px solid var(--accent)",
                            borderRadius: 8,
                            boxShadow: "0 0 0 9999px rgba(15,23,42,0.20)",
                            pointerEvents: "none"
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: -22,
                              left: -2,
                              background: "var(--accent)",
                              color: "white",
                              fontSize: 10.5,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 5,
                              whiteSpace: "nowrap"
                            }}
                          >
                            Editing this item
                          </span>
                        </div>
                      ) : null}

                      {props.selectorResult ? (
                        <div
                          style={{
                            position: "absolute",
                            top: 12,
                            left: 12,
                            background: "var(--accent)",
                            color: "white",
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                            boxShadow: "var(--shadow-lg)"
                          }}
                        >
                          {props.selectorResult.matchCount} matches
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      padding: "8px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      boxShadow: "var(--shadow-xs)"
                    }}
                  >
                    <Icon name="info" size={13} style={{ color: "var(--accent-deep)" }} />
                    <span>
                      {props.recipeShape === "single" ? (
                        <>
                          Single page detected — hover any element and click the{" "}
                          <strong style={{ color: "var(--text-primary)" }}>details to collect</strong> (title,
                          price, etc.).
                        </>
                      ) : showCandidates ? (
                        <>
                          Found <strong style={{ color: "var(--text-primary)" }}>{candidates.length}</strong>{" "}
                          likely items — hover to highlight, click one example, then choose the{" "}
                          <strong style={{ color: "var(--text-primary)" }}>details</strong> to collect.
                        </>
                      ) : (
                        <>
                          Hover any element and click the repeating{" "}
                          <strong style={{ color: "var(--text-primary)" }}>item</strong> you want, then choose its{" "}
                          <strong style={{ color: "var(--text-primary)" }}>details</strong>.
                        </>
                      )}
                    </span>
                  </div>
                </div>
            ) : (
              <BuilderScreenshotLoading />
            )
          ) : (
            <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
              <Card className="card-pad" style={{ maxWidth: 520, textAlign: "center" }}>
                <Badge tone="accent" dot>
                  Sprout builder
                </Badge>
                <HarvestArt
                  src={HARVEST_ART.emptyStateGrow}
                  size={116}
                  style={{ margin: "2px auto 0" }}
                />
                <h2
                  style={{
                    margin: "12px 0 8px",
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: "-0.018em"
                  }}
                >
                  Load a source URL to start mapping records
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Paste any public listing page above. The preview shows selectable containers and field overlays, plus a structured records table.
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* Inspector */}
        <aside
          className="builder-inspector-pane"
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "auto"
          }}
        >
          {/* Page mode + pick controls (moved out of the URL bar, ADR 0011 follow-up): a small
              box above the Item pattern section. List/Single always; Item/Details for lists. */}
          {props.pageSession ? (
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Page
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Segmented<"list" | "single">
                  value={props.recipeShape}
                  onChange={(v) => props.onShapeChange(v)}
                  options={[
                    { value: "list", icon: "list", label: "List" },
                    { value: "single", icon: "file", label: "Single" }
                  ]}
                />
                {props.recipeShape !== "single" ? (
                  <Segmented<"container" | "field">
                    value={props.pickMode}
                    onChange={(v) => props.onPickModeChange(v)}
                    options={[
                      { value: "container", icon: "layers", label: "Item" },
                      { value: "field", icon: "cursor", label: "Details" }
                    ]}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          {props.recipeShape !== "single" ? (
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10
                }}
              >
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                  }}
                >
                  Item
                </div>
                {props.selectorResult ? (
                  <Badge tone="success" dot>
                    {props.selectorResult.matchCount} items
                  </Badge>
                ) : (
                  <Badge tone="outline">Nothing picked yet</Badge>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Icon name="layers" size={14} style={{ color: "var(--accent-deep)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {props.selectorResult
                    ? "Item pattern selected"
                    : "Click one result to teach the pattern"}
                </span>
              </div>
              {props.selectorResult ? (
                props.pickMode === "field" ? (
                  <button
                    type="button"
                    onClick={() => props.onPickModeChange("container")}
                    style={LINK_BUTTON_STYLE}
                  >
                    Pick a different item →
                  </button>
                ) : (
                  <div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>
                      Click another item on the page to replace the current pattern.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                      <Button variant="secondary" size="sm" icon="check" onClick={() => props.onPickModeChange("field")}>
                        Done
                      </Button>
                    </div>
                  </div>
                )
              ) : null}
              {props.selectorBusy ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Finding similar items…</p>
              ) : null}
            </div>
          ) : (
            // Single-page anchor — the detail-page counterpart of the list "Item" block, so
            // the panel opens with a clear "what is this / what do I do" instead of jumping
            // straight to an empty fields card (ux-polish: single-flow parity with list).
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                  }}
                >
                  Page
                </div>
                <Badge tone={props.fields.length > 0 ? "success" : "outline"} dot={props.fields.length > 0}>
                  {props.fields.length > 0 ? `${props.fields.length} details` : "Detail page"}
                </Badge>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="file" size={14} style={{ color: "var(--accent-deep)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Collecting from this page</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, margin: "8px 0 0" }}>
                This page is one record.{" "}
                <strong style={{ color: "var(--text-secondary)" }}>Click each value you want</strong> on the page —
                title, price, image — to collect it.
              </p>
            </div>
          )}

          <div style={{ padding: "16px 18px", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              >
                <HarvestArt src={HARVEST_ART.logo} size={20} />
                Data to collect
              </div>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {allCandidates.length > 0 ? `${allCandidates.length} suggested` : `${props.fields.length} fields`}
              </span>
            </div>

            {/* This item's data (ADR 0009): every value found in the selected card, with a
                field name. Tick rows to collect them — or click them on the screenshot; both
                drive the SAME selection. Nothing extracts until "Preview records". */}
            {/* This item's data (ADR 0009): each extractable value with a field name. Tick
                rows to collect them — or click a value on the screenshot, which highlights
                that element's attributes (Text/Link/Image) here so you tick which to keep.
                One shared selection; nothing extracts until "Preview records". */}
            {props.selectorResult ? (
              <Card className="card-pad" style={{ marginBottom: 12 }}>
                {allCandidates.length === 0 ? (
                  // Real empty state (not a buried one-liner) so the detail-page flow has the
                  // same "here's your next move" affordance as list mode (ux-polish).
                  <EmptyState>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <Icon name="cursor" size={16} style={{ color: "var(--accent-deep)", flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Click a value on the page</strong> — a title,
                        price or image. Its options (Text / Link / Image) appear here to tick.
                      </div>
                    </div>
                  </EmptyState>
                ) : null}
                {allCandidates.length > 0 ? (
                  (() => {
                    const selectedCount = allCandidates.filter((c) => selectedKeys.has(c.key)).length;
                    const allOn = selectedCount === allCandidates.length;
                    return (
                      <div style={{ marginBottom: 10 }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12.5,
                            color: "var(--text-secondary)",
                            cursor: "pointer"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allOn}
                            ref={(el) => {
                              if (el) el.indeterminate = selectedCount > 0 && !allOn;
                            }}
                            onChange={toggleAllFields}
                            style={{ flexShrink: 0, cursor: "pointer" }}
                          />
                          <strong style={{ color: "var(--text-primary)" }}>Select all</strong>
                          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>
                            {selectedCount}/{allCandidates.length}
                          </span>
                        </label>
                        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0", paddingLeft: 24 }}>
                          …or click a value in the page to see its options here.
                        </p>
                      </div>
                    );
                  })()
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <AnimatePresence initial={false}>
                    {allCandidates.map((c) => {
                      const on = selectedKeys.has(c.key);
                      const focused = c.nodeId === focusedNodeId;
                      // Display-only: if the auto name is ugly and the user hasn't renamed it,
                      // show an empty field with a "Rename this field" prompt. The committed
                      // name still falls back to the real suggestedName (keys never change).
                      const overridden = fieldNameOverrides[c.key] !== undefined;
                      const uglyName = isUglyGeneratedName(c.suggestedName);
                      const name = overridden ? fieldNameOverrides[c.key] : uglyName ? "" : c.suggestedName;
                      return (
                        <AnimatedFieldRow key={c.key}>
                          <div className={cx("field-pick-row", focused && "field-pick-row-focused")}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleFieldKey(c.key)}
                              style={{ flexShrink: 0, cursor: "pointer" }}
                            />
                            <span className="field-pick-icon" aria-hidden="true">
                              <HarvestArt src={fieldArtFor(c.extract)} size={18} />
                            </span>
                            <input
                              className="input input-sm"
                              value={name}
                              placeholder={uglyName && !overridden ? "Rename this field" : undefined}
                              onChange={(e) => setFieldNameOverrides((p) => ({ ...p, [c.key]: e.target.value }))}
                              disabled={!on}
                              style={{ width: 92, flexShrink: 0, opacity: on ? 1 : 0.5 }}
                            />
                            <span
                              title={c.value}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 12,
                                color: "var(--text-secondary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              }}
                            >
                              {c.value}
                            </span>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: TYPE_COLORS[c.extract].fg,
                                background: TYPE_COLORS[c.extract].bg,
                                padding: "1px 6px",
                                borderRadius: 4,
                                flexShrink: 0
                              }}
                            >
                              {c.label}
                            </span>
                          </div>
                        </AnimatedFieldRow>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </Card>
            ) : null}

            {props.recipeShape !== "single" &&
            props.pickMode === "container" &&
            props.selectorResult ? (
              <Button
                variant="secondary"
                icon="cursor"
                style={{ width: "100%", marginTop: 12, borderStyle: "dashed" }}
                onClick={() => props.onPickModeChange("field")}
              >
                Choose a detail inside the item
              </Button>
            ) : null}

            {/* Explicit preview only (ADR 0009): nothing extracts until this is clicked;
                results show in the bottom panel for all matched items. */}
            <Button
              variant="primary"
              icon="eye"
              style={{ width: "100%", marginTop: 12 }}
              disabled={props.previewBusy || selectedKeys.size === 0}
              onClick={() => props.onPreviewRecords(selectedFieldPicks())}
            >
              {props.previewBusy ? "Extracting…" : `Preview records${selectedKeys.size ? ` (${selectedKeys.size})` : ""}`}
            </Button>

            <div
              style={{
                marginTop: 16,
                padding: "12px 14px",
                background: "var(--sprout-soft)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 12
              }}
            >
              <HarvestArt src={HARVEST_ART.dataRows} width={54} height={40} />
              <div>
                <strong style={{ color: "var(--text-primary)" }}>Tip:</strong>{" "}
                {props.recipeShape === "single"
                  ? "click each value on the page to collect it — click a linked title to grab its text and link together."
                  : "click a value in the item, then tick Text, Link, or Image — you can take several from one element."}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* BOTTOM PANEL — builder-only preview from the screenshot snapshot. Live runs live on Runs. */}
      <PreviewRecordsPanel
        rows={previewRows}
        fields={props.fields}
        busy={props.previewBusy}
        onRemoveField={handleRemoveField}
      />
    </div>
  );
}

// Builder-only preview from the screenshot snapshot (live runs live on the Runs page).
// Purely presentational: the parent owns the data and the remove-field side effect.
function PreviewRecordsPanel({
  rows,
  fields,
  busy,
  onRemoveField
}: {
  rows: PreviewResult["rows"];
  fields: PreviewField[];
  busy: boolean;
  onRemoveField: (name: string) => void;
}) {
  // The snapshot preview can leave later matched items as empty shells on large pages (their
  // detail nodes fall outside the build-time capture budget); the saved RUN extracts them all.
  // Hide the all-empty rows and point the user to a run, instead of showing blank rows.
  const populated = rows.filter((row) =>
    fields.some((f) => String(row[f.name] ?? "").trim() !== "")
  );
  const hiddenCount = rows.length - populated.length;
  return (
    <div
      className="builder-bottom-panel"
      style={{ flexShrink: 0, maxHeight: 360, display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            Preview records
          </span>
          <Badge tone="outline">{rows.length} matched</Badge>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ overflow: "auto", flex: 1 }}>
        {busy ? (
          <BuilderPreviewLoading />
        ) : rows.length > 0 ? (
          <AnimatedPreviewDrawer open>
            <table className="tbl" style={{ tableLayout: "auto" }}>
              <thead>
                <tr>
                  {fields.map((f) => (
                    <th key={f.name}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {f.name}
                        <span
                          style={{
                            fontSize: 9.5,
                            padding: "0 5px",
                            borderRadius: 3,
                            background: "var(--surface-sunken)",
                            color: "var(--text-muted)",
                            letterSpacing: 0,
                            textTransform: "uppercase",
                            fontFamily: "var(--font-mono)"
                          }}
                        >
                          {f.extract}
                        </span>
                        {/* Remove this field by dropping its column here (ADR 0009). */}
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 18, height: 18, border: 0 }}
                          onClick={() => onRemoveField(f.name)}
                          title={`Remove ${f.name}`}
                        >
                          <Icon name="x" size={10} />
                        </button>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {populated.map((row, i) => (
                  <AnimatedPreviewRow key={i} index={i}>
                    {fields.map((f) => (
                      <td
                        key={f.name}
                        className={f.extract === "href" || f.name === "url" ? "mono" : ""}
                        style={{ fontSize: 12.5 }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                            maxWidth: 420
                          }}
                        >
                          {formatValue(row[f.name])}
                        </span>
                      </td>
                    ))}
                  </AnimatedPreviewRow>
                ))}
              </tbody>
            </table>
            {hiddenCount > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 12.5,
                  color: "var(--text-muted)",
                  borderTop: "1px solid var(--divider)"
                }}
              >
                <HarvestArt src={HARVEST_ART.collecting} size={24} />
                <span>
                  Showing {populated.length} of {rows.length} matched items in this preview.{" "}
                  <strong style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                    Run the sprout to collect all listings.
                  </strong>
                </span>
              </div>
            ) : null}
          </AnimatedPreviewDrawer>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "48px 24px", textAlign: "center" }}>
            <HarvestArt src={HARVEST_ART.emptyCard} size={104} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Your harvest will grow here</h3>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", maxWidth: 320, lineHeight: 1.5 }}>
              Pick an item, choose the values to collect, then click Preview records.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BuilderScreenshotLoading({ compact = false }: { compact?: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cx("builder-loading-card", compact && "builder-loading-card-compact")}
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 24 }}
    >
      <HarvestArt src={HARVEST_ART.collecting} width={compact ? 74 : 128} height={compact ? 54 : 94} />
      <div>
        <div className="builder-loading-title">Loading screenshot</div>
        <div className="builder-loading-copy">Capturing the page and preparing clickable areas.</div>
      </div>
    </motion.div>
  );
}

function BuilderPreviewLoading() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="builder-preview-loading"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 26 }}
      aria-live="polite"
    >
      <HarvestArt src={HARVEST_ART.dataFlowToTable} width={148} height={92} />
      <div>
        <div className="builder-loading-title">Building preview table</div>
        <div className="builder-loading-copy">Collecting the selected values from matching records.</div>
      </div>
    </motion.div>
  );
}

function AccessBlockNotice({ block, url }: { block: AccessBlock; url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw url */
  }
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto 14px" }}>
      <Card
        className="card-pad"
        style={{ border: "1px solid var(--danger)", background: "var(--danger-bg)" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <Icon name="shield" size={18} style={{ color: "var(--danger-fg)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--danger-fg)"
              }}
            >
              This site blocks automated access
              <Badge tone="danger">HTTP {block.status}</Badge>
              {block.vendor && block.vendor !== "unknown" ? (
                <Badge tone="outline">{block.vendor}</Badge>
              ) : null}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--text-primary)" }}>{host}</strong> served a bot-protection
              page instead of its content, so the snapshot below is the block page — not the listings.
              Monitoring this source needs its official API/data feed or the site owner&rsquo;s permission.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
