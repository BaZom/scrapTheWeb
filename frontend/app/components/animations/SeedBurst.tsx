"use client";

// A brief, localized scatter of "seed" particles, fired once when a meaningful harvest
// moment lands (preview succeeded). Pure CSS keyframe (`seed-drift` in globals.css) so it
// stays cheap; the component just mounts the particles while `active`. Non-interactive and
// fully suppressed under prefers-reduced-motion.
import { useReducedMotion } from "motion/react";

type SeedBurstProps = {
  active: boolean;
  // Origin of the burst within the positioned parent (defaults to upper-centre).
  origin?: { left: string; top: string };
  className?: string;
  style?: React.CSSProperties;
};

const SEED_COUNT = 16;

export function SeedBurst({ active, origin, className = "", style }: SeedBurstProps) {
  const reduceMotion = useReducedMotion();
  if (!active || reduceMotion) return null;

  const left = origin?.left ?? "46%";
  const top = origin?.top ?? "38%";

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        overflow: "hidden",
        pointerEvents: "none",
        // Soil brown so the scatter reads clearly on the pale canvas (was faint grey).
        color: "var(--soil)",
        ...style
      }}
    >
      {Array.from({ length: SEED_COUNT }).map((_, index) => {
        // Deterministic fan: seeds spray outward and fall, scattering across the canvas.
        const angle = (index / (SEED_COUNT - 1)) * Math.PI; // 0 → π
        const reach = 90 + (index % 4) * 26;
        const x = Math.round(Math.cos(angle) * reach);
        const y = Math.round(34 + Math.sin(angle) * 96); // mostly downward
        return (
          <span
            key={index}
            className="seed-particle"
            style={
              {
                left,
                top,
                "--seed-x": `${x}px`,
                "--seed-y": `${y}px`,
                animationDelay: `${index * 38}ms`
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
