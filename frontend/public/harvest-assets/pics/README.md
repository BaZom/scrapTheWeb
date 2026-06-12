# Skrowt Harvest Assets

Seed, sprout, and Skrowt brand resources for the app redesign. The directory keeps its
historical `harvest-assets` name because the visual system still uses the harvest/plant theme.

## New assets

- `harvestly-browser-sprout.svg`
- `harvestly-logo-source.png` (legacy)
- `harvestly-wordmark.png` (legacy)
- `skrowt-wordmark-source.jpg`
- `skrowt-wordmark.png`
- `skrowt-emblem-source.jpg`
- `skrowt-emblem.png`
- `skrowt-icon.png`
- `data-rows-sprout.svg`
- `selected-card-seed-burst.svg`
- `table-harvest-ready.svg`
- `field-chip-link.svg`
- `field-chip-image.svg`
- `field-chip-text.svg`
- `monochrome-seed-cluster.svg`
- `empty-state-sprout-card.svg`
- `harvest-theme-toggle.svg`
- `animated-seed-trail-sprite.svg`

## Recommended use

- Browser/source concept: `harvestly-browser-sprout.svg`
- Main app/auth logo: `skrowt-wordmark.png` (`skrowt-wordmark-source.jpg` is the original
  supplied source image)
- Secondary auth/brand visual: `skrowt-emblem.png`
- Collapsed sidebar icon: `skrowt-icon.png`
- Preview table/reward state: `table-harvest-ready.svg`
- Pattern found card: `selected-card-seed-burst.svg`
- Empty or onboarding card: `empty-state-sprout-card.svg`
- Field type icons: `field-chip-link.svg`, `field-chip-image.svg`, `field-chip-text.svg`
- Theme settings: `harvest-theme-toggle.svg`
- Ambient motion overlay: `animated-seed-trail-sprite.svg`

Put in:

```text
frontend/public/harvest-assets/
```

Most assets use `currentColor`, so they can follow theme colors when inlined or styled.
