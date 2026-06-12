# Skrowt More Animated Assets

Second animated pack for the Skrowt builder.

## Animated SVGs

- `animated-data-flow-to-table.svg`
- `animated-similar-results-reveal.svg`
- `animated-field-picked.svg`
- `animated-step-complete-seed.svg`
- `animated-theme-switch.svg`
- `animated-empty-state-grow.svg`

## React/CSS snippets

- `AnimatedHarvestTrail.tsx`
- `more-harvest-animations.css`

## Usage mapping

- Pattern recognition / repeated cards: `animated-similar-results-reveal.svg`
- Data moving into preview table: `animated-data-flow-to-table.svg`
- Field selection: `animated-field-picked.svg`
- Stepper: `animated-step-complete-seed.svg`
- Theme settings: `animated-theme-switch.svg`
- Empty/onboarding state: `animated-empty-state-grow.svg`
- Real coordinate trail: `AnimatedHarvestTrail.tsx`

## Suggested placement

```text
frontend/public/harvest-assets/animated/
frontend/app/components/animations/AnimatedHarvestTrail.tsx
```

Add CSS from `more-harvest-animations.css` to `frontend/app/globals.css`.

All SVGs contain reduced-motion handling.
