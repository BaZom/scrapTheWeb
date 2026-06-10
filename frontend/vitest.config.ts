import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Frontend unit-test harness. jsdom so component tests work later; for now it covers
// pure logic (formatters, the upcoming builder reducer). The `@/` alias mirrors
// tsconfig's paths so tests import modules the same way app code does.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) }
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["{app,lib}/**/*.{test,spec}.{ts,tsx}"]
  }
});
