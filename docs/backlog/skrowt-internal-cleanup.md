# Skrowt internal cleanup

## Summary

The visible product language is moving from **Recipe** to **Sprout** and from the old
ScrapTheWeb name to **Skrowt**. The first cleanup pass should keep runtime behavior stable and
avoid database/API migrations. This backlog item tracks the deeper cleanup that should happen
deliberately.

## Plan

- Audit remaining internal `Recipe`/`recipes` names and decide which are purely code concepts
  versus API/database contracts.
- If product wants the API contract to say `sprouts`, design a migration plan for routes,
  schemas, database table/model names, client SDK names, metrics, docs, and backward
  compatibility.
- Remove the unused builder DOM-tree branch once confirmed no debug workflow depends on it.
- Consider consolidating sprout/run terminology helpers so UI screens do not hand-roll labels.
- Review legacy `scraptheweb_*` local storage keys, metrics, filenames, and docs. Keep aliases
  or migration reads where user data may already exist.
- Revisit large workspace screens for repeated table/card patterns after the rename settles.

## Acceptance notes

- Public UI consistently says Skrowt and Sprout/Sprouts.
- Internal renames happen in small, migration-safe commits.
- Existing saved data and exports remain readable.
