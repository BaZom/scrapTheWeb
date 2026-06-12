"use client";

import { motion, useReducedMotion } from "motion/react";

type Point = { x: number; y: number };

type AnimatedHarvestTrailProps = {
  active: boolean;
  from: Point;
  to: Point;
  className?: string;
};

function createPath(from: Point, to: Point) {
  const midX = (from.x + to.x) / 2;
  const lift = Math.max(48, Math.abs(to.x - from.x) * 0.12);

  return `M ${from.x} ${from.y} C ${midX} ${from.y - lift}, ${midX} ${to.y + lift}, ${to.x} ${to.y}`;
}

export function AnimatedHarvestTrail({
  active,
  from,
  to,
  className = "",
}: AnimatedHarvestTrailProps) {
  const reduceMotion = useReducedMotion();

  if (!active) return null;

  const path = createPath(from, to);
  const seeds = Array.from({ length: 5 });

  return (
    <svg
      className={[
        "pointer-events-none absolute inset-0 z-40 overflow-visible text-black",
        className,
      ].join(" ")}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 8"
        opacity="0.28"
      />

      {!reduceMotion &&
        seeds.map((_, index) => (
          <motion.circle
            key={index}
            r={index % 2 === 0 ? 3 : 2.25}
            fill={index % 2 === 0 ? "currentColor" : "#B99A6B"}
            initial={{ offsetDistance: "0%", opacity: 0 }}
            animate={{
              offsetDistance: ["0%", "100%"],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: 1.15,
              delay: index * 0.12,
              ease: "easeInOut",
            }}
            style={{
              offsetPath: `path("${path}")`,
            }}
          />
        ))}
    </svg>
  );
}
