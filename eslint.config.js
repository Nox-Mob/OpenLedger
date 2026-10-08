import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // The two classic hook rules. react-hooks 7 also ships React Compiler rules
      // (static-components, set-state-in-effect, purity); those are tracked on the roadmap.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Zero loose types in app code since v0.0.5; new ones fail the check.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  eslintPluginPrettier,
  // Formatting is checked separately (`npm run format:check`) so lint errors mean real code problems.
  { rules: { "prettier/prettier": "off" } },
  // Route files must export `Route`, and shadcn ui files export variants by design.
  {
    files: ["src/routes/**/*.tsx", "src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  // Test doubles fake only the slice of a library they need; loose types are fine there.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // Generated / vendored files are not ours to edit.
  { ignores: ["src/integrations/supabase/**", "src/routeTree.gen.ts"] },
);
