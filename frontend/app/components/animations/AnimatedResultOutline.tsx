"use client";

// A non-interactive outline layer painted OVER the canvas overlay buttons. It owns only the
// motion (a one-time pulse for the selected result, a staggered fade-in for matched results)
// so the existing interactive overlay buttons keep all click behaviour untouched. Geometry is
// supplied by the parent as a ready-made style (percentage left/top/width/height) so it
// matches the existing screenshot coordinate system exactly. pointer-events: none throughout.
import { motion, useReducedMotion } from "motion/react";

type AnimatedResultOutlineProps = {
  // Positioning only: left/top/width/height as the parent already computes them.
  geometry: React.CSSProperties;
  variant: "selected" | "matched";
  index?: number;
  label?: string;
};

export function AnimatedResultOutline({ geometry, variant, index = 0, label }: AnimatedResultOutlineProps) {
  const reduceMotion = useReducedMotion();
  const selected = variant === "selected";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: selected ? 0.985 : 1 }}
      animate={{
        opacity: 1,
        scale: selected && !reduceMotion ? [1, 1.06, 1] : 1
      }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : selected
            ? { duration: 0.5, ease: "easeOut" }
            : { duration: 0.4, ease: "easeOut", delay: Math.min(index * 0.03, 0.4) }
      }
      style={{
        position: "absolute",
        borderRadius: selected ? 8 : 6,
        border: selected ? "2px solid var(--accent)" : "1.4px dashed var(--success)",
        pointerEvents: "none",
        zIndex: selected ? 6 : 4,
        ...geometry
      }}
    >
      {selected && label ? (
        <span
          style={{
            position: "absolute",
            left: -11,
            top: -11,
            display: "grid",
            placeItems: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "var(--text-onAccent)",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "var(--font-mono)"
          }}
        >
          {label}
        </span>
      ) : null}
    </motion.div>
  );
}
