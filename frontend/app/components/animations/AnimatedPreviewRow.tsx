"use client";

// A preview-table row that fades/rises in, lightly staggered by index, so the extracted data
// reads as "flowing in" rather than snapping. It renders a <motion.tr>, so it must be used
// directly inside a <tbody>; children are the existing <td> cells, unchanged.
import { motion, useReducedMotion } from "motion/react";

type AnimatedPreviewRowProps = {
  children: React.ReactNode;
  index: number;
};

export function AnimatedPreviewRow({ children, index }: AnimatedPreviewRowProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.tr
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.34, delay: Math.min(index * 0.04, 0.35) }}
    >
      {children}
    </motion.tr>
  );
}
