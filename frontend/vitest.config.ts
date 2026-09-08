import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Most tests cover the document-generation logic, which is plain
    // TypeScript and needs no DOM. The few component tests opt into jsdom with
    // a `@vitest-environment jsdom` docblock of their own, so the fast default
    // stays fast.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  // tsconfig keeps jsx: "preserve" for Next.js; the test transform needs it
  // turned into real calls.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
