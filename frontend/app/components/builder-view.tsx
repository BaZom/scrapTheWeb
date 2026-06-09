"use client";

import { type FormEvent, useMemo, useState } from "react";

import type {
  AccessBlock,
  ChangeEvent,
  ContainerCandidate,
  DomNode,
  ExtractType,
  ExtractionRun,
  PageSession,
  PreviewField,
  PreviewResult,
  Recipe,
  SelectorResult
} from "@/lib/api";

import { Icon } from "./icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Segmented,
  StatusBadge,
  Stepper,
  Tabs,
  cx,
  fmtDuration
} from "./ui";

const LIST_STEPS = ["Load page", "Pick an item", "Choose details", "Preview", "Save & run"];
const SINGLE_STEPS = ["Load page", "Choose details", "Preview", "Save & run"];

const TYPE_COLORS: Record<ExtractType, { bg: string; fg: string }> = {
  text: { bg: "var(--accent-soft)", fg: "var(--accent-deep)" },
  href: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  src: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  attribute: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
  html: { bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" }
};

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
  pickerView: "overlays" | "nodes";
  onPickerViewChange: (view: "overlays" | "nodes") => void;
  fieldNode: DomNode | null;
  fieldSelector: SelectorResult | null;
  fieldName: string;
  onFieldNameChange: (name: string) => void;
  fieldExtract: ExtractType;
  onFieldExtractChange: (type: ExtractType) => void;
  fieldAttribute: string;
  onFieldAttributeChange: (attr: string) => void;
  fields: PreviewField[];
  onFieldsChange: (fields: PreviewField[]) => void;
  onAddField: () => void;
  fieldSample: string | null;
  fieldSampleBusy: boolean;
  fieldSamples: Record<string, string>;
  onStepNavigate: (target: number) => void;
  preview: PreviewResult | null;
  previewBusy: boolean;
  onRunPreview: () => void;
  recipeName: string;
  onRecipeNameChange: (value: string) => void;
  savedRecipe: Recipe | null;
  recipeBusy: boolean;
  onSaveRecipe: () => void;
  run: ExtractionRun | null;
  runBusy: boolean;
  onRunRecipe: () => void;
  exportBusy: "csv" | "json" | null;
  onDownloadExport: (runId: string, format: "csv" | "json") => void;
  imageSize: { width: number; height: number } | null;
  onImageLoad: (size: { width: number; height: number }) => void;
  renderBusy: boolean;
  error: string | null;
  onNodeSelect: (node: DomNode) => void;
  onFieldNodeSelect: (node: DomNode) => void;
  // Teach-by-example (ADR 0009): once an item is picked, clicks add more examples to
  // broaden the match instead of re-picking; Reset starts over from the first example.
  containerExampleIds: string[];
  onAddItemExample: (node: DomNode) => void;
  onResetItemExamples: () => void;
  // Field teach-by-example: click the same detail in another card to fix that column.
  fieldExampleIds: string[];
  onAddFieldExample: (node: DomNode) => void;
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

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function BuilderView(props: BuilderProps) {
  const [bottomTab, setBottomTab] = useState<"preview" | "changes" | "logs">("preview");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

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
  const showCandidates = props.pickMode === "container" && candidates.length > 0;

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

  // Teach-by-example (ADR 0009): the first container click picks the item (auto-advances);
  // once an item is selected, further clicks add example items to broaden the match. A
  // click on an already-matched item is ignored — it's already included.
  function handleContainerPick(node: DomNode) {
    if (!props.selectorResult) {
      props.onNodeSelect(node);
      return;
    }
    if (matchedNodeIds.has(node.nodeId)) return;
    props.onAddItemExample(node);
  }

  // The matched item-card a node lives in (walk up to the first ancestor in the match set),
  // or null if it's outside every card. Used to tell field clicks apart (teach-by-example).
  function matchedContainerIdOf(node: DomNode): string | null {
    let current: DomNode | undefined = node;
    while (current) {
      if (matchedNodeIds.has(current.nodeId)) return current.nodeId;
      current = current.parentNodeId ? domNodeById.get(current.parentNodeId) : undefined;
    }
    return null;
  }

  // First field click maps the detail (single-pick + auto live-sample); once a field is in
  // the editor, clicking the SAME detail in a DIFFERENT card adds it as an example and
  // re-infers the column (ADR 0009). A click inside the current card maps a fresh detail.
  function handleFieldPick(node: DomNode) {
    if (props.fieldSelector && props.fieldNode) {
      const clickedCard = matchedContainerIdOf(node);
      const currentCard = matchedContainerIdOf(props.fieldNode);
      if (clickedCard && currentCard && clickedCard !== currentCard) {
        props.onAddFieldExample(node);
        return;
      }
    }
    props.onFieldNodeSelect(node);
  }

  const overlayNodes = useMemo(() => {
    const fieldMode = props.pickMode === "field";
    const nodes = props.pageSession?.domNodes ?? [];
    // In field mode, make details clickable in EVERY matched card (teach-by-example across
    // cards, ADR 0009), not just the first picked one. Fall back to the single picked card
    // when there's no match set (single-record pages, whose body selector matches nothing).
    const inMatchedCard = (n: DomNode) => {
      let current: DomNode | undefined = n;
      while (current) {
        if (matchedNodeIds.has(current.nodeId)) return true;
        current = current.parentNodeId ? domNodeById.get(current.parentNodeId) : undefined;
      }
      return false;
    };
    let all = nodes;
    if (fieldMode) {
      if (matchedNodeIds.size > 0) all = nodes.filter(inMatchedCard);
      else if (props.selectedNode) all = nodes.filter((n) => isDescendant(n, props.selectedNode!, nodes));
    }
    // Sort largest-first so small elements paint last (on top) and win the hover
    // hit-test. In field mode we must NOT cap to the largest boxes — small details
    // like price/mileage are exactly what the user needs to click, and hover-only
    // highlighting means rendering more boxes adds no visual clutter.
    const eligible = all
      .filter((n) => n.width >= 6 && n.height >= 6)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    return fieldMode ? eligible : eligible.slice(0, 220);
  }, [props.pageSession, props.pickMode, props.selectedNode, matchedNodeIds, domNodeById]);

  const fieldNodes = useMemo(() => {
    if (!props.pageSession || !props.selectedNode) return [];
    return props.pageSession.domNodes.filter((n) =>
      isDescendant(n, props.selectedNode!, props.pageSession!.domNodes)
    );
  }, [props.pageSession, props.selectedNode]);

  const step = currentStep(props);
  const STEPS = props.recipeShape === "single" ? SINGLE_STEPS : LIST_STEPS;
  const previewRows = props.preview?.rows ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "var(--bg-app)" }}>
      {/* TOP: name + stepper + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          background: "white",
          flexShrink: 0,
          flexWrap: "wrap"
        }}
      >
        <input
          value={props.recipeName}
          onChange={(e) => props.onRecipeNameChange(e.target.value)}
          placeholder="Untitled recipe"
          className="input"
          style={{
            width: 240,
            fontWeight: 550,
            height: 32,
            border: "1px dashed transparent",
            background: "transparent"
          }}
          onFocus={(e) => {
            e.currentTarget.style.border = "1px solid var(--border-strong)";
            e.currentTarget.style.background = "white";
          }}
          onBlur={(e) => {
            e.currentTarget.style.border = "1px dashed transparent";
            e.currentTarget.style.background = "transparent";
          }}
        />
        <Badge tone="outline" dot>
          {props.savedRecipe ? "Saved" : "Draft"}
        </Badge>

        <div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
          <Stepper steps={STEPS} current={step} compact onStepClick={props.onStepNavigate} />
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon="bookmark"
          disabled={props.recipeBusy || !props.selectorResult || props.fields.length === 0 || !props.recipeName.trim()}
          onClick={props.onSaveRecipe}
        >
          {props.recipeBusy ? "Saving…" : "Save recipe"}
        </Button>
        <Button variant="primary" size="sm" icon="play" disabled={!props.savedRecipe || props.runBusy} onClick={props.onRunRecipe}>
          {props.runBusy ? "Running…" : "Run now"}
        </Button>
      </div>

      {/* URL row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 24px",
          background: "var(--surface-soft)",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap"
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            props.onLoadPage(e);
          }}
          style={{ display: "flex", alignItems: "center", gap: 0, flex: 1, maxWidth: 720, minWidth: 320 }}
        >
          <span
            style={{
              height: 32,
              padding: "0 12px",
              background: "white",
              border: "1px solid var(--border-strong)",
              borderRight: 0,
              borderRadius: "7px 0 0 7px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-muted)",
              whiteSpace: "nowrap"
            }}
          >
            <Icon name="lock" size={12} /> https://
          </span>
          <input
            className="input"
            value={props.url.replace(/^https?:\/\//, "")}
            onChange={(e) => props.onUrlChange(`https://${e.target.value.replace(/^https?:\/\//, "")}`)}
            placeholder="news.ycombinator.com/news"
            style={{ borderRadius: 0, fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
          <Button
            variant="primary"
            size="sm"
            icon="refresh"
            type="submit"
            disabled={props.renderBusy}
            style={{ borderRadius: "0 7px 7px 0", height: 32 }}
          >
            {props.renderBusy ? "Loading…" : "Reload page"}
          </Button>
        </form>

        <div style={{ flex: 1 }} />

        {/* Page shape: auto-detected on render (ADR 0005), overridable here for the case it
            guesses wrong — e.g. a single-item page with an incidental repeated strip read as
            a list. Flipping shape clears the in-progress mapping (selectors differ by shape). */}
        {props.pageSession ? (
          <span
            style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}
          >
            Page
          </span>
        ) : null}
        {props.pageSession ? (
          <Segmented<"list" | "single">
            value={props.recipeShape}
            onChange={(v) => props.onShapeChange(v)}
            options={[
              { value: "list", icon: "list", label: "List" },
              { value: "single", icon: "file", label: "Single" }
            ]}
          />
        ) : null}

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
        {/* DOM-tree view is a power-user fallback, tucked behind "Advanced". */}
        <Button
          variant="ghost"
          size="sm"
          icon="treeNode"
          onClick={() => props.onPickerViewChange(props.pickerView === "nodes" ? "overlays" : "nodes")}
        >
          {props.pickerView === "nodes" ? "Visual" : "Advanced"}
        </Button>
        {props.selectorResult && props.recipeShape !== "single" ? (
          <span className="badge badge-success" style={{ height: 26, padding: "0 10px" }}>
            <span className="dot" /> {props.selectorResult.matchCount} matches
          </span>
        ) : null}
        {props.pageSession?.overlayDismissals.length ? (
          <span
            className="badge badge-info"
            style={{ height: 26, padding: "0 10px" }}
            title="Playwright dismissed a blocking popup before capture"
          >
            <span className="dot" /> Popup dismissed
          </span>
        ) : null}
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
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          flex: 1,
          minHeight: 0,
          overflow: "hidden"
        }}
      >
        {/* Canvas */}
        <div
          className="canvas-bg"
          style={{
            padding: 20,
            overflow: "auto",
            borderRight: "1px solid var(--border)",
            minWidth: 0,
            position: "relative"
          }}
        >
          {props.pageSession?.accessBlock?.blocked ? (
            <AccessBlockNotice block={props.pageSession.accessBlock} url={props.url} />
          ) : null}
          {props.pageSession ? (
            props.screenshotObjectUrl ? (
              props.pickerView === "overlays" ? (
                <div style={{ maxWidth: 1180, margin: "0 auto" }}>
                  <div
                    style={{
                      background: "white",
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
                      background: "white",
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
                      {props.imageSize && !showCandidates
                        ? overlayNodes.map((node) => {
                            const selected =
                              props.selectedNode?.nodeId === node.nodeId ||
                              props.fieldNode?.nodeId === node.nodeId;
                            const hovered = hoveredNodeId === node.nodeId;
                            // In container mode, persistently outline the whole repeated set
                            // so the user can confirm the selection grabbed every card.
                            const matched = props.pickMode === "container" && matchedNodeIds.has(node.nodeId);

                            // Devtools-style: boxes are invisible until hovered. Selected and
                            // matched nodes stay visible so the current state is always readable.
                            let background = "transparent";
                            let border = "1.4px solid transparent";
                            if (selected) {
                              background = "rgba(91,91,214,0.30)";
                              border = "1.4px solid var(--accent)";
                            } else if (hovered) {
                              background = "rgba(37,99,235,0.16)";
                              border = "1.6px solid var(--info)";
                            } else if (matched) {
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
                              background = "rgba(20,184,166,0.28)";
                              border = "1.6px solid var(--accent)";
                            } else if (hovered) {
                              background = "rgba(20,184,166,0.20)";
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

                      {/* Persistent exact-match outline for the selected group (e.g. after
                          auto-switching to Field mode the matched cards stay outlined) */}
                      {props.imageSize && !showCandidates && groupMembers.length > 0
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
                      background: "white",
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
                          price, etc.). Use <strong style={{ color: "var(--text-primary)" }}>Advanced</strong> for
                          manual selection.
                        </>
                      ) : showCandidates ? (
                        <>
                          Found <strong style={{ color: "var(--text-primary)" }}>{candidates.length}</strong>{" "}
                          likely items — hover to highlight, click one example, then choose the{" "}
                          <strong style={{ color: "var(--text-primary)" }}>details</strong> to collect. Use{" "}
                          <strong style={{ color: "var(--text-primary)" }}>Advanced</strong> for manual selection.
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
                <div style={{ maxWidth: 920, margin: "0 auto" }}>
                  <Card style={{ overflow: "hidden" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--divider)"
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                        <Icon name="treeNode" size={14} style={{ color: "var(--accent-deep)" }} /> DOM tree
                        <Badge tone="outline">{props.pageSession.domNodes.length} nodes</Badge>
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "10px 14px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12.5,
                        lineHeight: 1.7,
                        color: "var(--text-secondary)",
                        maxHeight: 600,
                        overflow: "auto"
                      }}
                    >
                      {(props.pickMode === "field" ? fieldNodes : props.pageSession.domNodes)
                        .slice(0, 200)
                        .map((node) => {
                          const active =
                            props.selectedNode?.nodeId === node.nodeId ||
                            props.fieldNode?.nodeId === node.nodeId;
                          return (
                            <button
                              type="button"
                              key={node.nodeId}
                              onClick={() =>
                                props.pickMode === "field"
                                  ? handleFieldPick(node)
                                  : handleContainerPick(node)
                              }
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                padding: "3px 6px",
                                border: 0,
                                background: active ? "var(--accent-soft)" : "transparent",
                                borderRadius: 4,
                                fontFamily: "inherit",
                                fontSize: "inherit",
                                color: "inherit",
                                cursor: "pointer"
                              }}
                            >
                              <span style={{ color: "var(--text-faint)" }}>&lt;</span>
                              <span style={{ color: "var(--accent-deep)", fontWeight: 600 }}>{node.tag}</span>
                              {node.attrs.id ? (
                                <span>
                                  {" "}
                                  id=<span style={{ color: "var(--info-fg)" }}>&quot;{node.attrs.id}&quot;</span>
                                </span>
                              ) : null}
                              {node.classes.length > 0 ? (
                                <span>
                                  {" "}
                                  class=<span style={{ color: "var(--info-fg)" }}>&quot;{node.classes.join(" ")}&quot;</span>
                                </span>
                              ) : null}
                              <span style={{ color: "var(--text-faint)" }}>&gt;</span>
                              {node.text ? (
                                <span style={{ marginLeft: 12, color: "var(--text-muted)", fontSize: 11 }}>
                                  {node.text.slice(0, 70)}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                    </div>
                  </Card>
                </div>
              )
            ) : (
              <div style={{ display: "grid", placeItems: "center", padding: 80 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Screenshot pending…</p>
              </div>
            )
          ) : (
            <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
              <Card className="card-pad" style={{ maxWidth: 520, textAlign: "center" }}>
                <Badge tone="accent" dot>
                  Recipe Builder
                </Badge>
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
          style={{
            background: "white",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "auto"
          }}
        >
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
                    ? `Found ${props.selectorResult.matchCount} similar items`
                    : "Click an example item in the page"}
                </span>
              </div>
              {/* Teach-by-example refine (ADR 0009): no selector shown — the user grows the
                  selection by clicking more items, never by editing code. */}
              {props.selectorResult ? (
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>
                    Missed some? <strong style={{ color: "var(--text-secondary)" }}>Click them on the page</strong> to
                    include them too.
                  </p>
                  {props.containerExampleIds.length > 1 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <Badge tone="outline">{props.containerExampleIds.length} examples</Badge>
                      <button
                        type="button"
                        onClick={props.onResetItemExamples}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--accent-deep)",
                          cursor: "pointer"
                        }}
                      >
                        Start over
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {props.selectorBusy ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Finding similar items…</p>
              ) : null}
            </div>
          ) : null}

          <div style={{ padding: "16px 18px", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              >
                Details to collect
              </div>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{props.fields.length} fields</span>
            </div>

            {/* Plain-language summary (ADR 0009): what will be collected, in words. */}
            {props.fields.length > 0 ? (
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                  margin: "0 0 12px",
                  padding: "8px 10px",
                  background: "var(--surface-soft)",
                  borderRadius: 7
                }}
              >
                Collecting{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {props.fields.map((f) => f.name).join(", ")}
                </strong>{" "}
                {props.recipeShape === "single"
                  ? "from this page."
                  : `from ${props.selectorResult?.matchCount ?? 0} items.`}
              </p>
            ) : null}

            {props.fieldSelector ? (
              <Card className="card-pad" style={{ marginBottom: 12, background: "var(--accent-softer)", border: "1px solid var(--accent-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Icon name="hash" size={11} style={{ color: "var(--text-muted)" }} />
                  <input
                    value={props.fieldName}
                    onChange={(e) => props.onFieldNameChange(e.target.value)}
                    placeholder="field_name"
                    style={{
                      border: 0,
                      background: "transparent",
                      fontSize: 13,
                      fontWeight: 600,
                      outline: "none",
                      flex: 1,
                      padding: 0,
                      minWidth: 0,
                      color: "var(--text-primary)",
                      fontFamily: "inherit"
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "1px 7px",
                      borderRadius: 3,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      background: TYPE_COLORS[props.fieldExtract].bg,
                      color: TYPE_COLORS[props.fieldExtract].fg
                    }}
                  >
                    {props.fieldExtract}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <select
                    className="input input-sm"
                    value={props.fieldExtract}
                    onChange={(e) => props.onFieldExtractChange(e.target.value as ExtractType)}
                    style={{ width: 110 }}
                  >
                    <option value="text">text</option>
                    <option value="href">href</option>
                    <option value="src">src</option>
                    <option value="attribute">attribute</option>
                    <option value="html">html</option>
                  </select>
                  {props.fieldExtract === "attribute" ? (
                    <input
                      className="input input-sm"
                      placeholder="data-id"
                      value={props.fieldAttribute}
                      onChange={(e) => props.onFieldAttributeChange(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                </div>
                <FieldSample busy={props.fieldSampleBusy} value={props.fieldSample} />

                {/* No selector shown — fix a wrong column by example, not by editing code
                    (ADR 0009). Only meaningful when there are multiple cards to compare. */}
                {props.recipeShape !== "single" && (props.selectorResult?.matchCount ?? 0) > 1 ? (
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45, marginTop: 8 }}>
                    Wrong in some rows?{" "}
                    <strong style={{ color: "var(--text-secondary)" }}>Click the right value in another card</strong>
                    {props.fieldExampleIds.length > 1 ? ` · ${props.fieldExampleIds.length} examples` : ""}.
                  </p>
                ) : null}

                <Button
                  variant="primary"
                  size="sm"
                  icon="plus"
                  style={{ marginTop: 10 }}
                  onClick={props.onAddField}
                  disabled={!props.fieldName.trim()}
                >
                  Add field
                </Button>
              </Card>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {props.fields.map((f, i) => (
                <Card
                  key={`${f.name}-${i}`}
                  className="card-pad"
                  style={{ padding: "10px 12px", background: "white", boxShadow: "var(--shadow-xs)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="hash" size={11} style={{ color: "var(--text-muted)" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, color: "var(--text-primary)" }}>
                      {f.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        padding: "1px 7px",
                        borderRadius: 3,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        background: TYPE_COLORS[f.extract].bg,
                        color: TYPE_COLORS[f.extract].fg
                      }}
                    >
                      {f.extract}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 22, height: 22, border: 0 }}
                      onClick={() => props.onFieldsChange(props.fields.filter((_, idx) => idx !== i))}
                      title="Remove field"
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      wordBreak: "break-all"
                    }}
                  >
                    {f.selector}
                  </div>
                  {props.fieldSamples[f.name] ? (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <Icon name="arrowRight" size={11} style={{ color: "var(--success-fg)", flexShrink: 0 }} />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {props.fieldSamples[f.name]}
                      </span>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>

            {props.recipeShape !== "single" &&
            props.pickMode === "container" &&
            props.selectorResult &&
            !props.fieldSelector ? (
              <Button
                variant="secondary"
                icon="cursor"
                style={{ width: "100%", marginTop: 12, borderStyle: "dashed" }}
                onClick={() => props.onPickModeChange("field")}
              >
                Choose a detail inside the item
              </Button>
            ) : null}

            <Button
              variant="primary"
              icon="eye"
              style={{ width: "100%", marginTop: 12 }}
              disabled={props.previewBusy || props.fields.length === 0 || !props.selectorResult}
              onClick={props.onRunPreview}
            >
              {props.previewBusy ? "Extracting…" : "Preview records"}
            </Button>

            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                background: "var(--accent-softer)",
                borderRadius: 9,
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "flex-start",
                gap: 8
              }}
            >
              <Icon name="wand" size={13} style={{ color: "var(--accent-deep)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: "var(--text-primary)" }}>Tip:</strong> click any element in the page to map it. Switch the extraction type if you need{" "}
                <span className="mono" style={{ background: "white", padding: "0 4px", borderRadius: 3 }}>
                  href
                </span>
                ,{" "}
                <span className="mono" style={{ background: "white", padding: "0 4px", borderRadius: 3 }}>
                  src
                </span>
                , or a custom attribute.
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* BOTTOM PANEL: preview / changes / logs */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          background: "white",
          flexShrink: 0,
          maxHeight: 360,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--divider)" }}>
          <Tabs
            value={bottomTab}
            onChange={setBottomTab}
            tabs={[
              { value: "preview", label: "Preview records", count: previewRows.length },
              {
                value: "changes",
                label: "Changes",
                count: props.run
                  ? `+${props.run.changes.new.length} / ${props.run.changes.changed.length} / ${props.run.changes.removed.length}`
                  : "—"
              },
              { value: "logs", label: "Run logs" }
            ]}
          />
          <div style={{ flex: 1 }} />
          {bottomTab === "preview" && props.run ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {props.run.id.slice(0, 8)} · {props.run.records.length} records ·{" "}
                {props.run.startedAt && props.run.finishedAt
                  ? fmtDuration((new Date(props.run.finishedAt).getTime() - new Date(props.run.startedAt).getTime()) / 1000)
                  : "—"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon="csv"
                disabled={props.run.status !== "completed" || props.exportBusy === "csv"}
                onClick={() => props.onDownloadExport(props.run!.id, "csv")}
              >
                CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="json"
                disabled={props.run.status !== "completed" || props.exportBusy === "json"}
                onClick={() => props.onDownloadExport(props.run!.id, "json")}
              >
                JSON
              </Button>
            </div>
          ) : null}
        </div>

        <div style={{ overflow: "auto", flex: 1 }}>
          {bottomTab === "preview" ? (
            previewRows.length > 0 ? (
              <table className="tbl" style={{ tableLayout: "auto" }}>
                <thead>
                  <tr>
                    {props.fields.map((f) => (
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
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      {props.fields.map((f) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title="No preview records yet"
                description="Pick a container, map at least one field, and click Preview records."
              />
            )
          ) : null}

          {bottomTab === "changes" && props.run ? (
            <div style={{ padding: "12px 18px" }}>
              <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                <ChangeStat label="New" count={props.run.changes.new.length} color="success" />
                <ChangeStat label="Changed" count={props.run.changes.changed.length} color="warning" />
                <ChangeStat label="Removed" count={props.run.changes.removed.length} color="danger" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(["new", "changed", "removed"] as const).flatMap((kind) =>
                  props.run!.changes[kind].slice(0, 8).map((event) => (
                    <ChangeRow key={event.id} kind={kind} event={event} />
                  ))
                )}
                {props.run.status === "completed" &&
                props.run.changes.new.length + props.run.changes.changed.length + props.run.changes.removed.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No changes since the previous run.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {bottomTab === "logs" && props.run ? (
            <div
              style={{
                padding: "10px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: 4
              }}
            >
              <LogLine at={props.run.startedAt} level="info" text={`Run started · recipe ${props.run.recipeId.slice(0, 8)}`} />
              <LogLine at={props.run.startedAt} level="info" text={`${props.run.records.length} record(s) extracted`} />
              <LogLine
                at={props.run.finishedAt}
                level="info"
                text={`Diff: +${props.run.changes.new.length} new · ${props.run.changes.changed.length} changed · ${props.run.changes.removed.length} removed`}
              />
              {props.run.errorMessage ? (
                <LogLine at={props.run.finishedAt} level="error" text={props.run.errorMessage} />
              ) : null}
              {props.run.status === "completed" ? (
                <LogLine at={props.run.finishedAt} level="ok" text="Run completed" />
              ) : props.run.status === "failed" ? (
                <LogLine at={props.run.finishedAt} level="error" text="Run failed" />
              ) : (
                <LogLine at={null} level="info" text={`Status: ${props.run.status}`} />
              )}
            </div>
          ) : null}

          {bottomTab === "changes" && !props.run ? (
            <EmptyState title="Run the recipe first" description="Changes will appear after the first run completes." />
          ) : null}

          {bottomTab === "logs" && !props.run ? (
            <EmptyState title="No run logs yet" description="Save the recipe and run it once to see logs here." />
          ) : null}
        </div>

        {props.run ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px",
              borderTop: "1px solid var(--divider)"
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Run{" "}
              <span className="mono" style={{ color: "var(--text-primary)" }}>
                {props.run.id.slice(0, 8)}
              </span>
              <StatusBadge status={props.run.status} />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChangeStat({ label, count, color }: { label: string; count: number; color: "success" | "warning" | "danger" }) {
  const bg = { success: "var(--success-bg)", warning: "var(--warning-bg)", danger: "var(--danger-bg)" }[color];
  const fg = { success: "var(--success-fg)", warning: "var(--warning-fg)", danger: "var(--danger-fg)" }[color];
  return (
    <div
      style={{
        padding: "10px 14px",
        background: bg,
        color: fg,
        borderRadius: 9,
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 130
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, fontFamily: "var(--font-mono)" }}>{count}</div>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

function LogLine({
  level,
  text,
  at
}: {
  level: "info" | "ok" | "warn" | "error";
  text: string;
  // Real event time from the run; null renders an em dash rather than a fabricated "now".
  at?: string | null;
}) {
  const colors: Record<string, { bg: string; fg: string }> = {
    info: { bg: "var(--accent-soft)", fg: "var(--accent-deep)" },
    ok: { bg: "var(--success-bg)", fg: "var(--success-fg)" },
    warn: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
    error: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" }
  };
  return (
    <div className={cx("flex")} style={{ display: "flex", gap: 12 }}>
      <span style={{ color: "var(--text-faint)" }}>{at ? new Date(at).toLocaleTimeString() : "—"}</span>
      <span
        style={{
          color: colors[level].fg,
          background: colors[level].bg,
          fontWeight: 600,
          textTransform: "uppercase",
          fontSize: 10.5,
          alignSelf: "center",
          padding: "0 6px",
          borderRadius: 3
        }}
      >
        {level}
      </span>
      <span>{text}</span>
    </div>
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

function FieldSample({ busy, value }: { busy: boolean; value: string | null }) {
  const empty = value !== null && value.trim() === "";
  return (
    <div
      style={{
        marginTop: 8,
        padding: "6px 10px",
        background: "white",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 12,
        color: empty ? "var(--text-muted)" : "var(--text-primary)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 28
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-muted)",
          flexShrink: 0
        }}
      >
        Sample
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {busy ? "Extracting…" : value === null ? "—" : empty ? "(empty)" : value}
      </span>
    </div>
  );
}

function ChangeRow({ kind, event }: { kind: "new" | "changed" | "removed"; event: ChangeEvent }) {
  // "changed" rows show only the fields that actually differ, as old → new.
  const diffs =
    kind === "changed" && event.oldData && event.newData
      ? Object.keys(event.newData).filter(
          (k) => formatValue(event.newData![k]) !== formatValue(event.oldData![k])
        )
      : [];
  const snapshot = kind === "new" ? event.newData : kind === "removed" ? event.oldData : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 12px",
        border: "1px solid var(--divider)",
        borderRadius: 8,
        background: "white"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Badge tone={kind === "new" ? "success" : kind === "changed" ? "warning" : "danger"}>{kind}</Badge>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 550, color: "var(--text-primary)", wordBreak: "break-all" }}>
          {event.recordKey}
        </span>
      </div>

      {diffs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {diffs.map((key) => (
            <div key={key} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{key}</span>
              <span
                style={{
                  color: "var(--danger-fg)",
                  textDecoration: "line-through",
                  maxWidth: 280,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {formatValue(event.oldData?.[key])}
              </span>
              <Icon name="arrowRight" size={11} style={{ color: "var(--text-faint)" }} />
              <span
                style={{
                  color: "var(--success-fg)",
                  maxWidth: 280,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {formatValue(event.newData?.[key])}
              </span>
            </div>
          ))}
        </div>
      ) : snapshot ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
          {Object.entries(snapshot)
            .slice(0, 4)
            .map(([key, value]) => (
              <span key={key} style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{key}:</span>{" "}
                <span style={{ color: "var(--text-primary)" }}>{formatValue(value).slice(0, 60)}</span>
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}
