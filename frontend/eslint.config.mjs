import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Generated, not authored: Next.js type shims and the synced templates.
    ignores: [".next/**", "node_modules/**", "src/templates/**", "next-env.d.ts"],
  },
];

export default config;
