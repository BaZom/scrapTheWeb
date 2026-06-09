import { describe, expect, it } from "vitest";

import type {
  ContainerCandidate,
  DomNode,
  ExtractionRun,
  PageSession,
  Recipe,
  SelectorResult
} from "./api";
import {
  type BuilderState,
  SINGLE_BODY_SELECTOR,
  builderReducer,
  initialBuilderState
} from "./builder-reducer";

// ---- fixtures -------------------------------------------------------------

function node(nodeId: string, over: Partial<DomNode> = {}): DomNode {
  return {
    nodeId,
    tag: "div",
    text: "",
    attrs: {},
    classes: [],
    parentNodeId: null,
    nthOfType: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...over
  };
}

function candidate(score: number): ContainerCandidate {
  return {
    nodeId: "c1",
    tag: "article",
    label: "article.card",
    group: "g1",
    score,
    reason: "repeats",
    matchCount: 12,
    x: 0,
    y: 0,
    width: 100,
    height: 100
  };
}

function pageSession(candidates: ContainerCandidate[]): PageSession {
  return {
    sessionId: "sess-1",
    screenshotUrl: "/shot.png",
    domNodes: [node("c1")],
    title: "A page",
    jobStatus: "completed",
    overlayDismissals: [],
    containerCandidates: candidates,
    accessBlock: null
  };
}

const selector: SelectorResult = {
  selector: "article.card",
  matchCount: 12,
  strategy: "stable_class",
  matchedNodeIds: ["c1", "c2"]
};

const recipe = { id: "r1", name: "My recipe" } as Recipe;
const run = { id: "run-1", status: "running" } as ExtractionRun;

// A state deep in the list flow: item picked, two fields mapped, preview + saved + run.
function deepListState(): BuilderState {
  return {
    ...initialBuilderState,
    pageSession: pageSession([candidate(55)]),
    selectedNode: node("c1"),
    selectorResult: selector,
    recipeShape: "list",
    pickMode: "field",
    fields: [
      { name: "title", selector: "h2", extract: "text" },
      { name: "price", selector: ".p", extract: "text" }
    ],
    fieldSamples: { title: "Hello", price: "£5" },
    preview: { rows: [{ title: "Hello" }], rowCount: 1 },
    recipeName: "My recipe",
    savedRecipe: recipe,
    run
  };
}

// ---- render shape detection ----------------------------------------------

describe("render_succeeded", () => {
  it("a strong candidate yields the list flow (no auto selector)", () => {
    const s = builderReducer(initialBuilderState, {
      type: "render_succeeded",
      pageSession: pageSession([candidate(55)]),
      suggestedName: "Suggested"
    });
    expect(s.recipeShape).toBe("list");
    expect(s.pickMode).toBe("container");
    expect(s.selectorResult).toBeNull();
  });

  it("no strong candidate yields the single flow (body selector, field mode)", () => {
    const s = builderReducer(initialBuilderState, {
      type: "render_succeeded",
      pageSession: pageSession([candidate(12)]),
      suggestedName: "Suggested"
    });
    expect(s.recipeShape).toBe("single");
    expect(s.selectorResult).toEqual(SINGLE_BODY_SELECTOR);
    expect(s.pickMode).toBe("field");
  });

  it("keeps a user-entered recipe name (trimmed) but falls back to the suggestion", () => {
    const named = builderReducer(
      { ...initialBuilderState, recipeName: "  Mine  " },
      { type: "render_succeeded", pageSession: pageSession([candidate(55)]), suggestedName: "Auto" }
    );
    expect(named.recipeName).toBe("Mine");
    const blank = builderReducer(
      { ...initialBuilderState, recipeName: "   " },
      { type: "render_succeeded", pageSession: pageSession([candidate(55)]), suggestedName: "Auto" }
    );
    expect(blank.recipeName).toBe("Auto");
  });

  it("discards prior flow state from an earlier render", () => {
    const s = builderReducer(deepListState(), {
      type: "render_succeeded",
      pageSession: pageSession([candidate(55)]),
      suggestedName: "Auto"
    });
    expect(s.fields).toEqual([]);
    expect(s.preview).toBeNull();
    expect(s.savedRecipe).toBeNull();
    expect(s.run).toBeNull();
  });
});

// ---- selection transitions ------------------------------------------------

describe("container selection", () => {
  it("re-picking an item clears everything downstream", () => {
    const s = builderReducer(deepListState(), { type: "container_selecting", node: node("c9") });
    expect(s.selectedNode?.nodeId).toBe("c9");
    expect(s.selectorResult).toBeNull();
    expect(s.fields).toEqual([]);
    expect(s.preview).toBeNull();
    expect(s.savedRecipe).toBeNull();
    expect(s.run).toBeNull();
    expect(s.pickMode).toBe("container");
  });

  it("resolving the item selector auto-advances to field mode", () => {
    const s = builderReducer(
      { ...initialBuilderState, selectedNode: node("c1") },
      { type: "container_selector_resolved", result: selector }
    );
    expect(s.selectorResult).toEqual(selector);
    expect(s.pickMode).toBe("field");
  });

  it("field_selector_resolved only defaults the name when it's empty", () => {
    const withName = builderReducer(
      { ...initialBuilderState, fieldName: "price", fieldNode: node("f1") },
      { type: "field_selector_resolved", result: selector, defaultName: "auto" }
    );
    expect(withName.fieldName).toBe("price");
    const blank = builderReducer(
      { ...initialBuilderState, fieldName: "", fieldNode: node("f1") },
      { type: "field_selector_resolved", result: selector, defaultName: "auto" }
    );
    expect(blank.fieldName).toBe("auto");
  });
});

// ---- adding fields --------------------------------------------------------

describe("field_added", () => {
  const base: BuilderState = {
    ...initialBuilderState,
    fieldName: "price",
    fieldExtract: "text",
    fieldSelector: { selector: ".price", matchCount: 1, strategy: "x", matchedNodeIds: [] }
  };

  it("appends the field, stores its sample, and clears the editor", () => {
    const s = builderReducer(base, { type: "field_added", sample: "£5" });
    expect(s.fields).toEqual([{ name: "price", selector: ".price", extract: "text" }]);
    expect(s.fieldSamples).toEqual({ price: "£5" });
    expect(s.fieldName).toBe("");
    expect(s.fieldSelector).toBeNull();
    expect(s.fieldNode).toBeNull();
  });

  it("replaces a field of the same name rather than duplicating", () => {
    const withExisting = { ...base, fields: [{ name: "price", selector: ".old", extract: "text" as const }] };
    const s = builderReducer(withExisting, { type: "field_added", sample: null });
    expect(s.fields).toHaveLength(1);
    expect(s.fields[0].selector).toBe(".price");
  });

  it("includes the attribute key only for attribute extraction", () => {
    const attr = builderReducer(
      { ...base, fieldExtract: "attribute", fieldAttribute: " data-id " },
      { type: "field_added", sample: null }
    );
    expect(attr.fields[0]).toEqual({
      name: "price",
      selector: ".price",
      extract: "attribute",
      attribute: "data-id"
    });
  });

  it("is a no-op when there is no selector or the name is blank", () => {
    expect(builderReducer({ ...base, fieldSelector: null }, { type: "field_added", sample: null })).toEqual({
      ...base,
      fieldSelector: null
    });
    expect(builderReducer({ ...base, fieldName: "  " }, { type: "field_added", sample: null })).toEqual({
      ...base,
      fieldName: "  "
    });
  });
});

// ---- step navigation (the most desync-prone transition) -------------------

describe("step_navigated (list)", () => {
  it("back to step 1 clears the whole flow below the item pick", () => {
    const s = builderReducer(deepListState(), { type: "step_navigated", target: 1 });
    expect(s.selectedNode).toBeNull();
    expect(s.selectorResult).toBeNull();
    expect(s.fields).toEqual([]);
    expect(s.fieldSamples).toEqual({});
    expect(s.pickMode).toBe("container");
    expect(s.preview).toBeNull();
    expect(s.savedRecipe).toBeNull();
    expect(s.run).toBeNull();
  });

  it("back to step 2 keeps fields but clears the field editor + preview", () => {
    const s = builderReducer(deepListState(), { type: "step_navigated", target: 2 });
    expect(s.fields).toHaveLength(2);
    expect(s.selectorResult).toEqual(selector);
    expect(s.fieldNode).toBeNull();
    expect(s.pickMode).toBe("field");
    expect(s.preview).toBeNull();
    expect(s.savedRecipe).toBeNull();
  });

  it("landing on Preview (3) keeps the preview table", () => {
    const s = builderReducer(deepListState(), { type: "step_navigated", target: 3 });
    expect(s.preview).not.toBeNull();
    expect(s.fields).toHaveLength(2);
    expect(s.savedRecipe).toBeNull();
    expect(s.run).toBeNull();
  });
});

describe("step_navigated (single)", () => {
  const single = { ...deepListState(), recipeShape: "single" as const };

  it("back to details (<=1) clears fields + preview", () => {
    const s = builderReducer(single, { type: "step_navigated", target: 1 });
    expect(s.fields).toEqual([]);
    expect(s.fieldSamples).toEqual({});
    expect(s.preview).toBeNull();
  });

  it("forward keeps fields, just clears saved/run", () => {
    const s = builderReducer(single, { type: "step_navigated", target: 2 });
    expect(s.fields).toHaveLength(2);
    expect(s.savedRecipe).toBeNull();
    expect(s.run).toBeNull();
  });
});

// ---- reset / restore / simple setters -------------------------------------

describe("fields_changed", () => {
  it("clears the stale preview so a removed field can't linger in the table", () => {
    const s = builderReducer(deepListState(), {
      type: "fields_changed",
      fields: [{ name: "title", selector: "h2", extract: "text" }]
    });
    expect(s.fields).toHaveLength(1);
    expect(s.preview).toBeNull();
  });
});

describe("shape_changed", () => {
  it("list → single seeds the body container, jumps to field mode, drops the flow", () => {
    const s = builderReducer(deepListState(), { type: "shape_changed", shape: "single" });
    expect(s.recipeShape).toBe("single");
    expect(s.selectorResult).toEqual(SINGLE_BODY_SELECTOR);
    expect(s.pickMode).toBe("field");
    expect(s.selectedNode).toBeNull();
    expect(s.fields).toEqual([]);
    expect(s.fieldSamples).toEqual({});
    expect(s.preview).toBeNull();
    expect(s.savedRecipe).toBeNull();
    expect(s.run).toBeNull();
  });

  it("single → list clears the body selector and returns to container mode", () => {
    const single = { ...deepListState(), recipeShape: "single" as const, selectorResult: SINGLE_BODY_SELECTOR };
    const s = builderReducer(single, { type: "shape_changed", shape: "list" });
    expect(s.recipeShape).toBe("list");
    expect(s.selectorResult).toBeNull();
    expect(s.pickMode).toBe("container");
    expect(s.selectedNode).toBeNull();
    expect(s.fields).toEqual([]);
    expect(s.preview).toBeNull();
  });

  it("is a no-op when the shape is unchanged (keeps the in-progress flow)", () => {
    const state = deepListState();
    expect(builderReducer(state, { type: "shape_changed", shape: "list" })).toBe(state);
  });
});

describe("reset and restore", () => {
  it("reset clears the flow but preserves URL and field-editor defaults", () => {
    const s = builderReducer(
      { ...deepListState(), renderUrl: "https://x.test", fieldName: "kept", fieldExtract: "href" },
      { type: "reset" }
    );
    expect(s.pageSession).toBeNull();
    expect(s.fields).toEqual([]);
    expect(s.renderUrl).toBe("https://x.test");
    expect(s.fieldName).toBe("kept");
    expect(s.fieldExtract).toBe("href");
  });

  it("draft_restored rehydrates the persisted slices", () => {
    const s = builderReducer(initialBuilderState, {
      type: "draft_restored",
      draft: {
        renderUrl: "https://d.test",
        recipeName: "Draft",
        recipeShape: "list",
        pickMode: "field",
        pageSession: pageSession([candidate(55)]),
        selectedNode: node("c1"),
        selectorResult: selector,
        fields: [{ name: "title", selector: "h2", extract: "text" }],
        fieldSamples: { title: "Hi" }
      }
    });
    expect(s.renderUrl).toBe("https://d.test");
    expect(s.recipeName).toBe("Draft");
    expect(s.pickMode).toBe("field");
    expect(s.pageSession?.sessionId).toBe("sess-1");
    expect(s.fields).toHaveLength(1);
    expect(s.fieldSamples).toEqual({ title: "Hi" });
  });

  it("simple setters update only their slice", () => {
    expect(builderReducer(initialBuilderState, { type: "url_changed", url: "u" }).renderUrl).toBe("u");
    expect(builderReducer(initialBuilderState, { type: "pick_mode_changed", mode: "field" }).pickMode).toBe("field");
    expect(builderReducer(initialBuilderState, { type: "recipe_saved", recipe }).savedRecipe).toBe(recipe);
    expect(builderReducer(initialBuilderState, { type: "run_updated", run }).run).toBe(run);
    expect(
      builderReducer(initialBuilderState, { type: "image_loaded", size: { width: 4, height: 2 } }).imageSize
    ).toEqual({ width: 4, height: 2 });
  });
});

describe("teach-by-example selection", () => {
  const inferred: SelectorResult = {
    selector: "article",
    matchCount: 24,
    strategy: "inferred",
    matchedNodeIds: ["c1", "c2", "c3"]
  };

  it("picking an item seeds the example list with that node", () => {
    const s = builderReducer(initialBuilderState, { type: "container_selecting", node: node("c1") });
    expect(s.containerExampleIds).toEqual(["c1"]);
    expect(s.fieldExampleIds).toEqual([]);
  });

  it("container_example_added appends, keeps fields, clears preview", () => {
    const seeded = { ...deepListState(), containerExampleIds: ["c1"] };
    const s = builderReducer(seeded, { type: "container_example_added", node: node("c9") });
    expect(s.containerExampleIds).toEqual(["c1", "c9"]);
    expect(s.fields).toHaveLength(2); // relative field selectors stay valid
    expect(s.preview).toBeNull();
    expect(s.savedRecipe).toBeNull();
  });

  it("container_example_added is a no-op for a duplicate example", () => {
    const seeded = { ...deepListState(), containerExampleIds: ["c1"] };
    expect(builderReducer(seeded, { type: "container_example_added", node: node("c1") })).toBe(seeded);
  });

  it("container_selector_inferred sets the selector without auto-advancing", () => {
    const s = builderReducer(
      { ...initialBuilderState, pickMode: "container", containerExampleIds: ["c1", "c9"] },
      { type: "container_selector_inferred", result: inferred }
    );
    expect(s.selectorResult).toEqual(inferred);
    expect(s.pickMode).toBe("container");
  });

  it("picking a field seeds the field example list", () => {
    const s = builderReducer(deepListState(), { type: "field_selecting", node: node("f1") });
    expect(s.fieldExampleIds).toEqual(["f1"]);
  });

  it("field_example_added appends (no-op on duplicate); field_selector_inferred swaps the selector", () => {
    const seeded = { ...deepListState(), fieldExampleIds: ["f1"] };
    const added = builderReducer(seeded, { type: "field_example_added", node: node("f2") });
    expect(added.fieldExampleIds).toEqual(["f1", "f2"]);
    expect(builderReducer(added, { type: "field_example_added", node: node("f2") })).toBe(added);
    const s = builderReducer(added, { type: "field_selector_inferred", result: inferred });
    expect(s.fieldSelector).toEqual(inferred);
  });
});

describe("fields_added (multi-attribute from one element)", () => {
  const base: BuilderState = {
    ...initialBuilderState,
    fieldName: "title",
    fieldSelector: { selector: "a.title", matchCount: 3, strategy: "x", matchedNodeIds: [] }
  };

  it("appends several fields from one element and clears the editor", () => {
    const s = builderReducer(base, {
      type: "fields_added",
      fields: [
        { name: "title", selector: "a.title", extract: "text" },
        { name: "title_link", selector: "a.title", extract: "href" }
      ],
      samples: { title: "Hello" }
    });
    expect(s.fields.map((f) => f.name)).toEqual(["title", "title_link"]);
    expect(s.fieldSamples).toEqual({ title: "Hello" });
    expect(s.fieldSelector).toBeNull();
    expect(s.fieldNode).toBeNull();
    expect(s.fieldName).toBe("");
  });

  it("dedupes by name against existing fields", () => {
    const withExisting = {
      ...base,
      fields: [{ name: "title", selector: ".old", extract: "text" as const }]
    };
    const s = builderReducer(withExisting, {
      type: "fields_added",
      fields: [{ name: "title", selector: "a.title", extract: "text" }],
      samples: {}
    });
    expect(s.fields).toHaveLength(1);
    expect(s.fields[0].selector).toBe("a.title");
  });

  it("appends even with no open editor (auto-discovery commits a batch)", () => {
    const s = { ...base, fieldSelector: null, fields: [] };
    const out = builderReducer(s, {
      type: "fields_added",
      fields: [{ name: "title", selector: "a.title", extract: "text" }],
      samples: {}
    });
    expect(out.fields.map((f) => f.name)).toEqual(["title"]);
  });

  it("is a no-op when no field is named", () => {
    expect(builderReducer(base, { type: "fields_added", fields: [], samples: {} })).toBe(base);
  });
});
