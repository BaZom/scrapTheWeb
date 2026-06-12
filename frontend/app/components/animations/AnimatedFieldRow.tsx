"use client";

// Thin motion wrapper for a single "Data to collect" row. It only animates enter/exit/reorder
// — the row's real content (checkbox, editable name, value, type) is passed as children and is
// completely unchanged, so no product behaviour or field key is touched. Wrap each row inside a
// parent <AnimatePresence initial={false}> and give it a stable `key`.
import { motion, useReducedMotion } from "motion/react";

type AnimatedFieldRowProps = {
  children: React.ReactNode;
};

export function AnimatedFieldRow({ children }: AnimatedFieldRowProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }}
    >
      {children}
    </motion.div>
  );
}
