import type {
  DomNode,
  ExtractType,
  ExtractionRun,
  PageSession,
  PreviewField,
  PreviewResult,
  Recipe,
  SelectorResult
} from "./api";

// Single source of truth for the recipe builder's flow state. Replaces the ~18 scattered
// useState flags in page.tsx whose transitions were spread across handlers that each had
// to remember to clear the right downstream slices (ADR 0001 Decision 2 flagged this as
// fragile). Every transition here is atomic and named, so "going back" / re-picking can't
// half-update. Pure (no React, no I/O) so it's unit-testable and so future features — the
// assistant's "apply these suggestions" being a bulk mutation — get one safe action.
//
// Deliberately NOT owned here: async/busy flags, error text, the screenshot blob URL,
// the canvas view toggle, and auth/workspace state. Those have no cross-slice invariant,
// so they stay as plain useState in the component.

export type RecipeShape = "list" | "single";
export type PickMode = "container" | "field";

export type BuilderState = {
  renderUrl: string;
  pageSession: PageSession | null;
  selectedNode: DomNode | null;
  selectorResult: SelectorResult | null;
  // Teach-by-example (ADR 0009): the node IDs the user clicked as item / field examples.
  // The selector is inferred to cover all of them; the first pick seeds the list.
  containerExampleIds: string[];
  fieldExampleIds: string[];
  recipeShape: RecipeShape;
  pickMode: PickMode;
  fieldNode: DomNode | null;
  fieldSelector: SelectorResult | null;
  fieldName: string;
  fieldExtract: ExtractType;
  fieldAttribute: string;
  fields: PreviewField[];
  fieldSamples: Record<string, string>;
  preview: PreviewResult | null;
  recipeName: string;
  savedRecipe: Recipe | null;
  run: ExtractionRun | null;
  imageSize: { width: number; height: number } | null;
};

// What the persisted draft carries (must match BuilderDraft in page.tsx).
export type BuilderDraft = {
  renderUrl: string;
  recipeName: string;
  recipeShape: RecipeShape;
  pickMode: PickMode;
  pageSession: PageSession;
  selectedNode: DomNode | null;
  selectorResult: SelectorResult | null;
  fields: PreviewField[];
  fieldSamples: Record<string, string>;
};

export type BuilderAction =
  | { type: "url_changed"; url: string }
  | { type: "reset" }
  | { type: "render_succeeded"; pageSession: PageSession; suggestedName: string }
  | { type: "container_selecting"; node: DomNode }
  | { type: "container_selector_resolved"; result: SelectorResult }
  | { type: "container_example_added"; node: DomNode }
  | { type: "container_selector_inferred"; result: SelectorResult }
  | { type: "field_selecting"; node: DomNode }
  | { type: "field_selector_resolved"; result: SelectorResult; defaultName: string }
  | { type: "field_example_added"; node: DomNode }
  | { type: "field_selector_inferred"; result: SelectorResult }
  | { type: "field_name_changed"; name: string }
  | { type: "field_extract_changed"; extract: ExtractType }
  | { type: "field_attribute_changed"; attribute: string }
  | { type: "field_added"; sample: string | null }
  | { type: "fields_added"; fields: PreviewField[]; samples: Record<string, string> }
  | { type: "fields_changed"; fields: PreviewField[] }
  | { type: "shape_changed"; shape: RecipeShape }
  | { type: "pick_mode_changed"; mode: PickMode }
  | { type: "step_navigated"; target: number }
  | { type: "preview_succeeded"; preview: PreviewResult }
  | { type: "recipe_name_changed"; name: string }
  | { type: "recipe_saved"; recipe: Recipe }
  | { type: "run_updated"; run: ExtractionRun }
  | { type: "image_loaded"; size: { width: number; height: number } }
  | { type: "draft_restored"; draft: BuilderDraft };

// A candidate at/above this score is a strong "this page is a list" signal (ADR 0005).
export const STRONG_CANDIDATE_SCORE = 40;
// Single-record pages use the whole body as the (synthetic) container; it matches once
// and isn't in domNodes, so matchedNodeIds is empty (the builder falls back to its
// signature heuristic for the outline there — ADR 0007 Decision 1).
export const SINGLE_BODY_SELECTOR: SelectorResult = {
  selector: "body",
  matchCount: 1,
  strategy: "single",
  matchedNodeIds: []
};

export const initialBuilderState: BuilderState = {
  renderUrl: "https://news.ycombinator.com/news",
  pageSession: null,
  selectedNode: null,
  selectorResult: null,
  containerExampleIds: [],
  fieldExampleIds: [],
  recipeShape: "list",
  pickMode: "container",
  fieldNode: null,
  fieldSelector: null,
  fieldName: "title",
  fieldExtract: "text",
  fieldAttribute: "",
  fields: [],
  fieldSamples: {},
  preview: null,
  recipeName: "",
  savedRecipe: null,
  run: null,
  imageSize: null
};

// The flow slices that depend purely on the page shape, shared by render_succeeded
// (auto-detection) and shape_changed (manual override) so the two can't drift:
// - single: the whole body is the (synthetic) container — jump straight to field mode;
// - list: no container yet — the user picks a repeating item in container mode.
function shapeFlow(shape: RecipeShape): Pick<BuilderState, "recipeShape" | "selectorResult" | "pickMode"> {
  const single = shape === "single";
  return {
    recipeShape: shape,
    selectorResult: single ? SINGLE_BODY_SELECTOR : null,
    pickMode: single ? "field" : "container"
  };
}

// Clears the per-render flow while keeping inputs the user shouldn't have to re-enter
// (URL, recipe name, and the field-editor's name/extract/attribute defaults). Mirrors the
// old resetBuilderState exactly — including that it does NOT clear fieldSamples here only
// where the original didn't.
function clearedFlow(state: BuilderState): BuilderState {
  return {
    ...state,
    pageSession: null,
    selectedNode: null,
    selectorResult: null,
    containerExampleIds: [],
    fieldExampleIds: [],
    fieldNode: null,
    fieldSelector: null,
    fieldSamples: {},
    fields: [],
    preview: null,
    savedRecipe: null,
    run: null,
    pickMode: "container",
    recipeShape: "list",
    imageSize: null
  };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "url_changed":
      return { ...state, renderUrl: action.url };

    case "reset":
      return clearedFlow(state);

    case "render_succeeded": {
      const base = clearedFlow(state);
      const strong = action.pageSession.containerCandidates.some(
        (c) => c.score >= STRONG_CANDIDATE_SCORE
      );
      return {
        ...base,
        pageSession: action.pageSession,
        ...shapeFlow(strong ? "list" : "single"),
        recipeName: state.recipeName.trim() || action.suggestedName
      };
    }

    case "container_selecting":
      // Picking (or re-picking) an item resets everything downstream of it, and seeds the
      // example list with this first click (teach-by-example, ADR 0009).
      return {
        ...state,
        selectedNode: action.node,
        selectorResult: null,
        containerExampleIds: [action.node.nodeId],
        fieldExampleIds: [],
        fieldNode: null,
        fieldSelector: null,
        fields: [],
        preview: null,
        savedRecipe: null,
        run: null,
        pickMode: "container"
      };

    case "container_selector_resolved":
      // Auto-advance: once the item selector resolves, the next action is mapping fields.
      return { ...state, selectorResult: action.result, pickMode: "field" };

    case "container_example_added": {
      // Teach-by-example (ADR 0009): an extra item example to broaden the match. Keep the
      // mapped fields (relative selectors stay valid as the item set widens) but clear the
      // preview/save/run, which depend on the item set. No-op if already an example.
      if (state.containerExampleIds.includes(action.node.nodeId)) return state;
      return {
        ...state,
        containerExampleIds: [...state.containerExampleIds, action.node.nodeId],
        preview: null,
        savedRecipe: null,
        run: null
      };
    }

    case "container_selector_inferred":
      // Set the re-inferred item selector without auto-advancing — the user is refining.
      return { ...state, selectorResult: action.result };

    case "field_selecting":
      return { ...state, fieldNode: action.node, fieldSelector: null, fieldExampleIds: [action.node.nodeId] };

    case "field_selector_resolved":
      return {
        ...state,
        fieldSelector: action.result,
        fieldName: state.fieldName ? state.fieldName : action.defaultName
      };

    case "field_example_added": {
      // Teach-by-example (ADR 0009): another example of the same field in a different card,
      // to correct the relative selector. No-op if already an example.
      if (state.fieldExampleIds.includes(action.node.nodeId)) return state;
      return { ...state, fieldExampleIds: [...state.fieldExampleIds, action.node.nodeId] };
    }

    case "field_selector_inferred":
      return { ...state, fieldSelector: action.result };

    case "field_name_changed":
      return { ...state, fieldName: action.name };

    case "field_extract_changed":
      return { ...state, fieldExtract: action.extract };

    case "field_attribute_changed":
      return { ...state, fieldAttribute: action.attribute };

    case "field_added": {
      const name = state.fieldName.trim();
      // Invalid adds are a no-op; the component surfaces the "name required" error.
      if (!state.fieldSelector || !name) return state;
      const field: PreviewField = {
        name,
        selector: state.fieldSelector.selector,
        extract: state.fieldExtract,
        ...(state.fieldExtract === "attribute" ? { attribute: state.fieldAttribute.trim() } : {})
      };
      return {
        ...state,
        fields: [...state.fields.filter((f) => f.name !== name), field],
        fieldSamples:
          action.sample !== null
            ? { ...state.fieldSamples, [name]: action.sample }
            : state.fieldSamples,
        fieldName: "",
        fieldSelector: null,
        fieldNode: null,
        fieldExampleIds: [],
        preview: null,
        savedRecipe: null,
        run: null
      };
    }

    case "fields_added": {
      // Commit one or more fields from a single picked element (ADR 0009): e.g. a linked
      // title yields both a Text and a Link field. Dedupe by name, merge samples, clear the
      // editor. No-op without a selector or any named field.
      if (!state.fieldSelector) return state;
      const incoming = action.fields.filter((f) => f.name.trim());
      if (incoming.length === 0) return state;
      const incomingNames = new Set(incoming.map((f) => f.name));
      return {
        ...state,
        fields: [...state.fields.filter((f) => !incomingNames.has(f.name)), ...incoming],
        fieldSamples: { ...state.fieldSamples, ...action.samples },
        fieldName: "",
        fieldSelector: null,
        fieldNode: null,
        fieldExampleIds: [],
        preview: null,
        savedRecipe: null,
        run: null
      };
    }

    case "fields_changed":
      // Editing the field set (remove/reorder) invalidates the preview table — it was
      // extracted for a different set of fields. Clear it so a stale table can't show a
      // column the user just removed (matches field_added, which also clears preview).
      return { ...state, fields: action.fields, preview: null };

    case "shape_changed": {
      // Manual override when auto-detection (ADR 0005) guessed wrong — e.g. a single-item
      // detail page with an incidental "similar ads" strip mis-read as a list, trapping the
      // user in container mode. Flipping shape invalidates every downstream slice: the
      // field selectors differ by shape (list = relative to the item; single = page-wide
      // unique), so kept fields would be wrong. Clear them and the preview/save/run so the
      // user re-maps cleanly. No-op if the shape is unchanged.
      if (action.shape === state.recipeShape) return state;
      return {
        ...state,
        ...shapeFlow(action.shape),
        selectedNode: null,
        containerExampleIds: [],
        fieldExampleIds: [],
        fieldNode: null,
        fieldSelector: null,
        fields: [],
        fieldSamples: {},
        preview: null,
        savedRecipe: null,
        run: null
      };
    }

    case "pick_mode_changed":
      return { ...state, pickMode: action.mode };

    case "step_navigated":
      return stepNavigated(state, action.target);

    case "preview_succeeded":
      return { ...state, preview: action.preview };

    case "recipe_name_changed":
      return { ...state, recipeName: action.name };

    case "recipe_saved":
      return { ...state, savedRecipe: action.recipe };

    case "run_updated":
      return { ...state, run: action.run };

    case "image_loaded":
      return { ...state, imageSize: action.size };

    case "draft_restored":
      return {
        ...state,
        renderUrl: action.draft.renderUrl,
        recipeName: action.draft.recipeName,
        recipeShape: action.draft.recipeShape,
        pickMode: action.draft.pickMode,
        pageSession: action.draft.pageSession,
        selectedNode: action.draft.selectedNode,
        selectorResult: action.draft.selectorResult,
        // Re-seed the item example list from the restored pick so refine works post-reload.
        containerExampleIds: action.draft.selectedNode ? [action.draft.selectedNode.nodeId] : [],
        fieldExampleIds: [],
        fields: action.draft.fields,
        fieldSamples: action.draft.fieldSamples
      };

    default: {
      // Exhaustiveness guard: a new action without a case is a compile error.
      const _never: never = action;
      return _never;
    }
  }
}

// Rewinds the workflow to an earlier step by clearing everything downstream of it.
// `currentStep` is derived from which slices exist, so clearing them moves the stepper.
// Single steps: 0 Load · 1 Choose details · 2 Preview · 3 Save (body container kept).
// List steps:   0 Load · 1 Pick item · 2 Map fields · 3 Preview · 4 Save.
function stepNavigated(state: BuilderState, target: number): BuilderState {
  if (state.recipeShape === "single") {
    const cleared =
      target <= 1
        ? {
            ...state,
            fields: [],
            fieldSamples: {},
            fieldNode: null,
            fieldSelector: null,
            fieldExampleIds: [],
            preview: null
          }
        : state;
    return { ...cleared, savedRecipe: null, run: null };
  }

  let next = state;
  if (target <= 1) {
    next = {
      ...next,
      selectedNode: null,
      selectorResult: null,
      containerExampleIds: [],
      fieldExampleIds: [],
      fieldNode: null,
      fieldSelector: null,
      fields: [],
      fieldSamples: {},
      pickMode: "container"
    };
  } else if (target === 2) {
    next = { ...next, fieldNode: null, fieldSelector: null, fieldExampleIds: [], pickMode: "field" };
  }
  if (target <= 2) next = { ...next, preview: null };
  return { ...next, savedRecipe: null, run: null };
}
