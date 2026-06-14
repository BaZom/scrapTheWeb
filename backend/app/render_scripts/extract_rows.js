// Extract rows for a saved sprout using the REAL browser DOM + CSS engine — the same engine the
// builder used to pick the fields — so the saved run can't diverge from the build (no Python
// HTML re-parse, no hand-rolled selector matcher). Input:
//   { containerSelector, fields: [{name, selector, extract, attribute}], pageType, limit }
// Listing sprouts: one row per matched container, each field matched WITHIN its container.
// Single-page sprouts (pageType "single" or container "body"): one page-wide row.
// Robust by design: a malformed/non-matching selector yields "" for that cell, never throws —
// extraction must not fail the whole run on one bad field.
(args) => {
  const containerSelector = args.containerSelector;
  const fields = Array.isArray(args.fields) ? args.fields : [];
  const single = args.pageType === "single" || containerSelector === "body";
  const limit = typeof args.limit === "number" ? args.limit : null;

  // Whitespace-collapse text the same way the builder snapshot does (dom_candidates.js), so a
  // field's value matches between preview and run and the diff doesn't churn on formatting.
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const valueOf = (el, extract, attribute) => {
    if (!el) return "";
    if (extract === "text") return norm(el.innerText || el.textContent || "");
    if (extract === "href") return el.getAttribute("href") || "";
    if (extract === "src") return el.getAttribute("src") || "";
    if (extract === "attribute") return el.getAttribute(attribute || "") || "";
    if (extract === "html") return el.innerHTML || "";
    return "";
  };
  const rowFrom = (root) => {
    const row = {};
    for (const f of fields) {
      const name = (f.name || "").trim();
      const selector = (f.selector || "").trim();
      if (!name || !selector) continue;
      let match = null;
      try {
        match = root.querySelector(selector);
      } catch (e) {
        match = null; // invalid selector for this field — leave the cell empty
      }
      row[name] = valueOf(match, (f.extract || "").trim(), f.attribute);
    }
    return row;
  };

  if (single) {
    return document.body ? [rowFrom(document)] : [];
  }

  let containers;
  try {
    containers = Array.from(document.querySelectorAll(containerSelector));
  } catch (e) {
    containers = []; // invalid container selector — no rows (run health-check will flag it)
  }
  if (limit != null) containers = containers.slice(0, limit);
  return containers.map(rowFrom);
}
