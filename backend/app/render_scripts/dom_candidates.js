// Built the flat DOM-node list AND a scored list of repeated "listing card" container
// candidates. Detection runs over the FULL visible element set (before truncation);
// truncation is then candidate-aware so the repeated listing subtree is kept within the
// node budget instead of being crowded out by header/nav/filter chrome. nodeIds match
// between domNodes and candidates ("node-<documentIndex>"), so a selected candidate is
// usable for selector generation and its descendants stay available for field mapping.
// Generic by design: the load-bearing signal is structural repetition; keywords and the
// detail-link shape are additive bonuses, never requirements. No site-specific tokens.
(maxNodes) => {
  const all = Array.from(document.querySelectorAll("body *"));
  const indexOf = new Map();
  all.forEach((el, i) => indexOf.set(el, i));

  const vw = window.innerWidth || 1440;
  const vh = window.innerHeight || 1200;
  const docW = Math.max(document.documentElement.scrollWidth || 0, vw);
  const docH = Math.max(document.documentElement.scrollHeight || 0, vh);
  const r2 = (n) => Math.round(n * 100) / 100;

  const nodeByIndex = new Map();
  const visibleIdx = [];
  all.forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (rect.width < 1 || rect.height < 1 || style.visibility === "hidden" || style.display === "none") {
      return;
    }
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
    const attrs = {};
    for (const attr of element.attributes) {
      if (attr.name === "id" || attr.name === "class" || attr.name === "role" ||
          attr.name === "itemprop" || attr.name === "href" || attr.name === "src" ||
          attr.name.startsWith("data-")) {
        attrs[attr.name] = attr.value.slice(0, 160);
      }
    }
    const siblings = Array.from(element.parentElement ? element.parentElement.children : []);
    const sameTypeBefore = siblings.filter((s) => s.tagName === element.tagName).indexOf(element) + 1;
    nodeByIndex.set(index, {
      nodeId: "node-" + index,
      tag: element.tagName.toLowerCase(),
      text,
      attrs,
      classes: Array.from(element.classList).slice(0, 12),
      parentNodeId: null,
      nthOfType: sameTypeBefore || 1,
      x: r2(rect.x), y: r2(rect.y), width: r2(rect.width), height: r2(rect.height)
    });
    visibleIdx.push(index);
  });

  // ---- repeated listing-card candidate detection ----
  const CARD_KW = /(item|card|result|listing|product|tile|entry|teaser|offer|article|post|cell|hit|advert)/i;
  const NEG_KW = /(header|nav|footer|sidebar|filter|facet|menu|pagination|paging|breadcrumb|cookie|consent|gdpr|modal|dialog|overlay|banner|toolbar|skip|cmp|drawer)/i;
  const PRICE_RE = /(€|\$|£|\beur\b|\busd\b|\bgbp\b|\d[\d.\s]*,-|\d+[.,]\d{2})/i;
  // Generic detail-link shape: long numeric id, slug-ending id, or a generic segment.
  const DETAIL_RE = /([/_-]\d{4,}\b|\d{6,}|\/(?:item|items|product|products|listing|listings|detail|details|offer|offers|posting|article|ad|ads)\/)/i;

  const normClass = (c) => c.toLowerCase().replace(/[0-9]+/g, "#");
  const sigOf = (el) => {
    const cls = Array.from(el.classList).map(normClass).filter((c) => c.length <= 28).sort().slice(0, 3).join(".");
    return el.tagName.toLowerCase() + "|" + cls;
  };

  const groups = new Map();
  for (const index of visibleIdx) {
    const el = all[index];
    const parent = el.parentElement;
    if (!parent) continue;
    const pIdx = indexOf.has(parent) ? indexOf.get(parent) : -1;
    const key = pIdx + "::" + sigOf(el);
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(index);
  }

  const scored = [];
  for (const entry of groups) {
    const key = entry[0];
    const members = entry[1];
    if (members.length < 3) continue;
    const rep = all[members[0]];
    const className = (rep.className && rep.className.toString) ? rep.className.toString() : "";
    const tag = rep.tagName.toLowerCase();
    const sample = members.slice(0, 8).map((i) => all[i]);

    let hasLink = false, hasDetail = false, hasPrice = false, hasTitle = false, hasImg = false;
    for (const el of sample) {
      const a = el.querySelector("a[href]");
      if (a) { hasLink = true; if (DETAIL_RE.test(a.getAttribute("href") || "")) hasDetail = true; }
      if (PRICE_RE.test((el.innerText || "").slice(0, 400))) hasPrice = true;
      if (el.querySelector("h1,h2,h3,h4,[class*=title],[class*=name]")) hasTitle = true;
      if (el.querySelector("img")) hasImg = true;
    }

    const ws = members.map((i) => nodeByIndex.get(i).width).sort((a, b) => a - b);
    const hs = members.map((i) => nodeByIndex.get(i).height).sort((a, b) => a - b);
    const medW = ws[Math.floor(ws.length / 2)] || 0;
    const medH = hs[Math.floor(hs.length / 2)] || 0;
    const wFrac = medW / docW, hFrac = medH / docH;

    let score = Math.min(members.length, 30);
    const reasons = ["x" + members.length];
    if (tag === "article" || tag === "li") score += 8;
    else if (tag === "tr") score += 4;
    else if (tag === "section") score += 1;
    if (CARD_KW.test(className) || CARD_KW.test(key)) { score += 8; reasons.push("card-like"); }
    if (NEG_KW.test(className) || NEG_KW.test(key)) { score -= 16; reasons.push("chrome"); }
    if (hasDetail) { score += 10; reasons.push("detail link"); }
    else if (hasLink) { score += 4; reasons.push("link"); }
    if (hasPrice) { score += 6; reasons.push("price"); }
    if (hasTitle) { score += 4; reasons.push("title"); }
    if (hasImg) { score += 3; reasons.push("image"); }
    if (wFrac > 0.9 && hFrac > 0.6) { score -= 22; reasons.push("huge wrapper"); }
    if (hFrac > 0.85) score -= 14;
    if (medH < 40 || medW < 80) { score -= 10; reasons.push("too small"); }
    if (medH >= 60 && medH <= vh * 0.6 && wFrac >= 0.12 && wFrac <= 0.98) { score += 6; reasons.push("card size"); }

    if (score <= 4) continue;
    scored.push({ key, members, score, reasons, tag });
  }

  scored.sort((a, b) => b.score - a.score);
  const topGroups = scored.slice(0, 5);

  const candidates = [];
  const CAND_CAP = 250;
  for (const g of topGroups) {
    for (const i of g.members) {
      if (candidates.length >= CAND_CAP) break;
      const n = nodeByIndex.get(i);
      const idPart = n.attrs.id ? "#" + n.attrs.id : "";
      const clsPart = n.classes.length ? "." + n.classes.slice(0, 2).join(".") : "";
      candidates.push({
        nodeId: n.nodeId,
        tag: n.tag,
        label: n.tag + idPart + clsPart,
        group: g.key,
        score: Math.round(g.score * 100) / 100,
        reason: "Repeated " + g.tag + " (" + g.reasons.join(", ") + ")",
        matchCount: g.members.length,
        x: n.x, y: n.y, width: n.width, height: n.height
      });
    }
    if (candidates.length >= CAND_CAP) break;
  }

  // ---- truncation ----
  // Only a STRONG repeated candidate (score >= 40, mirrors the frontend list/single
  // decision) warrants prioritizing the listing subtree — cards can be deep in the page.
  // On a single/unstructured page (incidental repeats only) that prioritization would
  // spend the budget on spec lists / galleries and crowd out the item's MAIN content
  // (title, price near the top), so we keep plain document order instead — that is what
  // makes "anything related to the item" selectable on a one-item page.
  const keep = new Set();
  const hasStrongCandidate = scored.some((g) => g.score >= 40);
  if (hasStrongCandidate) {
    const addAncestors = (idx) => {
      let el = all[idx].parentElement;
      while (el) {
        const i = indexOf.get(el);
        if (i !== undefined && nodeByIndex.has(i) && keep.size < maxNodes) keep.add(i);
        el = el.parentElement;
      }
    };
    const candIdx = candidates.map((c) => parseInt(c.nodeId.slice(5), 10));
    for (const idx of candIdx) { if (keep.size >= maxNodes) break; keep.add(idx); addAncestors(idx); }
    for (const idx of candIdx) {
      if (keep.size >= maxNodes) break;
      for (const desc of all[idx].querySelectorAll("*")) {
        if (keep.size >= maxNodes) break;
        const i = indexOf.get(desc);
        if (i !== undefined && nodeByIndex.has(i)) keep.add(i);
      }
    }
  }
  // Fill the remaining budget in document order (the entire keep set on single pages).
  for (const idx of visibleIdx) { if (keep.size >= maxNodes) break; keep.add(idx); }

  const keptSorted = Array.from(keep).sort((a, b) => a - b);
  for (const i of keptSorted) {
    const node = nodeByIndex.get(i);
    let el = all[i].parentElement;
    node.parentNodeId = null;
    while (el) {
      const pi = indexOf.get(el);
      if (pi !== undefined && keep.has(pi)) { node.parentNodeId = "node-" + pi; break; }
      el = el.parentElement;
    }
  }

  return { domNodes: keptSorted.map((i) => nodeByIndex.get(i)), candidates: candidates };
}
