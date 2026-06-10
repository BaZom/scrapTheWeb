"use client";

// The Harvestly builder progress indicator (matches the design reference): five numbered
// circles — LOAD · PICK · CHOOSE · PREVIEW · SAVE — joined by thin straight connectors, with
// the label under each circle. Only the CURRENT step is filled (ink); completed steps keep a
// solid ring, upcoming steps a light ring. Visual-only: takes the existing step labels + the
// current index + an optional click handler. The active circle gives one subtle scale settle.
import { motion, useReducedMotion } from "motion/react";

import { HARVEST_ART, HarvestArt } from "./HarvestArt";

type HarvestStepperProps = {
  // Full step labels from the builder (e.g. "Load page"); only the first word is shown, uppercased.
  steps: string[];
  current: number;
  // When provided, completed/current steps become clickable (navigate back).
  onStepClick?: (index: number) => void;
};

const CIRCLE = 30;

export function HarvestStepper({ steps, current, onStepClick }: HarvestStepperProps) {
  const reduceMotion = useReducedMotion();
  const nodes: React.ReactNode[] = [];

  steps.forEach((label, index) => {
    const done = index < current;
    const active = index === current;
    const navigable = Boolean(onStepClick) && index <= current;
    const short = (label.split(" ")[0] || label).toUpperCase();

    const seed = (
      <motion.span
        animate={{
          scale: active && !reduceMotion ? [1, 1.14, 1] : 1,
          boxShadow: active && !reduceMotion
            ? [
                "0 0 0 0 rgba(0,0,0,0)",
                "0 0 0 5px rgba(0,0,0,0.08)",
                "0 0 0 0 rgba(0,0,0,0)"
              ]
            : "0 0 0 0 rgba(0,0,0,0)"
        }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        style={{
          display: "grid",
          placeItems: "center",
          width: CIRCLE,
          height: CIRCLE,
          borderRadius: "50%",
          border: `1.5px solid ${active || done ? "var(--accent)" : "var(--border-strong)"}`,
          background: active ? "var(--accent)" : "var(--surface)",
          color: active ? "var(--text-onAccent)" : done ? "var(--text-primary)" : "var(--text-muted)",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1,
          position: "relative"
        }}
      >
        {done ? (
          <HarvestArt
            src={HARVEST_ART.stepComplete}
            size={18}
            style={{ position: "absolute", inset: 5, opacity: 0.9 }}
          />
        ) : null}
        {index + 1}
      </motion.span>
    );

    const stack = (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
        {seed}
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.14em",
            color: active ? "var(--text-primary)" : "var(--text-muted)"
          }}
        >
          {short}
        </span>
      </span>
    );

    nodes.push(
      navigable ? (
        <button
          key={`s${index}`}
          type="button"
          onClick={() => onStepClick?.(index)}
          aria-label={`Go to step ${index + 1}: ${label}`}
          style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", font: "inherit" }}
        >
          {stack}
        </button>
      ) : (
        <span key={`s${index}`} aria-current={active ? "step" : undefined}>
          {stack}
        </span>
      )
    );

    // straight connector to the next circle, vertically centred on the circles
    if (index < steps.length - 1) {
      nodes.push(
        <span
          key={`l${index}`}
          aria-hidden="true"
          style={{
            width: 46,
            height: 1.5,
            marginTop: CIRCLE / 2 - 0.75,
            background: "var(--border-strong)",
            flexShrink: 0,
            position: "relative",
            overflow: "visible"
          }}
        >
          <motion.span
            initial={false}
            animate={{ width: index < current ? "100%" : active ? "45%" : "0%" }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--accent)",
              transformOrigin: "left"
            }}
          />
          {index === Math.max(0, current - 1) && !reduceMotion ? (
            <motion.span
              initial={{ x: -6, opacity: 0 }}
              animate={{ x: 40, opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
              style={{ position: "absolute", top: -10, left: 0 }}
            >
              <HarvestArt src={HARVEST_ART.seedTrail} width={24} height={18} />
            </motion.span>
          ) : null}
        </span>
      );
    }
  });

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: "var(--font-mono)" }}>
      {nodes}
    </div>
  );
}
