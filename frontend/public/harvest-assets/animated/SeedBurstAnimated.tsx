"use client";

import { useReducedMotion } from "motion/react";

type SeedBurstAnimatedProps = {
  active: boolean;
  className?: string;
};

export function SeedBurstAnimated({ active, className = "" }: SeedBurstAnimatedProps) {
  const reduceMotion = useReducedMotion();

  if (!active || reduceMotion) return null;

  const seeds = Array.from({ length: 14 });

  return (
    <div
      className={[
        "pointer-events-none absolute inset-0 z-30 overflow-hidden text-black",
        className,
      ].join(" ")}
      aria-hidden="true"
    >
      {seeds.map((_, index) => (
        <span
          key={index}
          className="harvest-seed-particle"
          style={
            {
              left: "50%",
              top: "48%",
              "--seed-x": `${70 + index * 12}px`,
              "--seed-y": `${index % 2 === 0 ? -38 - index : 24 + index}px`,
              "--seed-delay": `${index * 38}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
