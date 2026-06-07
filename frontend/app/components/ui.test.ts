import { describe, expect, it } from "vitest";

import { cx, fmtDuration, fmtInt } from "./ui";

// First test in the frontend harness — exercises the pure UI helpers end-to-end so a
// regression in formatting is caught without running the app.
describe("cx", () => {
  it("joins truthy class names and drops falsy ones", () => {
    expect(cx("a", false, "b", null, undefined, "c")).toBe("a b c");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cx(false, null, undefined)).toBe("");
  });
});

describe("fmtDuration", () => {
  it("shows one decimal of seconds under a minute", () => {
    expect(fmtDuration(5)).toBe("5.0s");
    expect(fmtDuration(0)).toBe("0.0s");
  });

  it("switches to minutes + rounded seconds at/above a minute", () => {
    expect(fmtDuration(65)).toBe("1m 5s");
    expect(fmtDuration(125.4)).toBe("2m 5s");
  });
});

describe("fmtInt", () => {
  it("formats with US thousands separators", () => {
    expect(fmtInt(1234567)).toBe("1,234,567");
  });
});
