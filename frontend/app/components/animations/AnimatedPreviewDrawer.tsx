"use client";

// Slide-up reveal for the bottom preview table — the "reward" moment when extracted records
// land. Adapted from a fixed drawer to an in-flow reveal so it drops straight into the
// existing bottom panel layout without repositioning anything: it simply animates its children
// up + in when `open` flips true (e.g. the first preview rows arrive), and out when cleared.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type AnimatedPreviewDrawerProps = {
  open: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export function AnimatedPreviewDrawer({ open, children, style }: AnimatedPreviewDrawerProps) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 260, damping: 28 } as const);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40 }}
          transition={transition}
          style={style}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
