// Renders a Harvestly art asset from /public/harvest-assets (provided by the design team).
// The animated SVGs self-animate via internal CSS and ship their own prefers-reduced-motion
// handling, so they're used as plain <img> (per the asset-pack README). currentColor inside
// an <img> resolves to ink black, which is exactly the monochrome Harvestly palette.

type HarvestArtProps = {
  // Path under /harvest-assets, e.g. "animated/animated-sprout-grow.svg" or "pics/sprout-logo.svg".
  src: string;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function HarvestArt({ src, size = 40, width, height, className, style }: HarvestArtProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/harvest-assets/${src}`}
      alt=""
      aria-hidden="true"
      width={width ?? size}
      height={height ?? size}
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
    />
  );
}

// Convenience names for the moments actually used across the builder flow. (Tight registry —
// the asset kit in /public/harvest-assets holds more SVGs; add a key here when one is wired in.)
export const HARVEST_ART = {
  sproutGrow: "animated/animated-sprout-grow.svg",
  collecting: "animated/animated-collecting-data.svg",
  dataFlowToTable: "animated/animated-data-flow-to-table.svg",
  stepComplete: "animated/animated-step-complete-seed.svg",
  emptyStateGrow: "animated/animated-empty-state-grow.svg",
  seedTrail: "animated/animated-seed-trail.svg",
  logo: "pics/sprout-logo.svg",
  dataRows: "pics/data-rows-sprout.svg",
  emptyCard: "pics/empty-state-sprout-card.svg",
  fieldLink: "pics/field-chip-link.svg",
  fieldImage: "pics/field-chip-image.svg",
  fieldText: "pics/field-chip-text.svg"
} as const;
