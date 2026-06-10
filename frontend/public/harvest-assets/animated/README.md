# Harvestly Animated Asset Pack

Animated SVG/CSS assets for the Harvestly/ScrapTheWeb builder.

## Included animated SVGs

- `animated-sprout-grow.svg`
- `animated-seed-trail.svg`
- `animated-collecting-data.svg`
- `animated-pattern-found.svg`
- `animated-recipe-saved.svg`

## Included code snippets

- `SeedBurstAnimated.tsx`
- `harvest-animations.css`

## Usage in Next.js

Put SVGs here:

```text
frontend/public/harvest-assets/animated/
```

Then use them as static animated SVG images:

```tsx
<img
  src="/harvest-assets/animated/animated-sprout-grow.svg"
  alt=""
  className="h-12 w-12 text-black"
/>
```

For the React seed burst component, place:

```text
frontend/app/components/animations/SeedBurstAnimated.tsx
```

Add `harvest-animations.css` content to your `globals.css`.

## Recommended mapping

- Pattern found card: `animated-pattern-found.svg`
- Preview loading: `animated-collecting-data.svg`
- Preview ready / recipe saved: `animated-recipe-saved.svg`
- Stepper / ambient trail: `animated-seed-trail.svg`
- Empty state / logo moment: `animated-sprout-grow.svg`

All SVGs include `prefers-reduced-motion` handling.
