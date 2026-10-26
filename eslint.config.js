import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      ".nitro",
      ".tanstack/**",
      "node_modules",
      // File generated — jangan di-lint.
      "src/routeTree.gen.ts",
      "src/integrations/supabase/types.ts",
      "lint-report.json",
    ],
  },
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
      ...reactHooks.configs.recommended.rules,
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
      // Kode lama banyak memakai `any`; dijadikan peringatan agar CI tetap
      // berguna menangkap bug nyata (hooks, undefined, dsb) tanpa terhalang
      // utang tipe. Perbaikan `any` menyeluruh adalah pekerjaan terpisah.
      "@typescript-eslint/no-explicit-any": "warn",
      // False positive umum: variabel yang di-assign di dalam closure (mis. timer
      // yang diset belakangan). Diturunkan ke peringatan.
      "prefer-const": "warn",
    },
  },
  // Prettier dijalankan sebagai peringatan, bukan blocker CI.
  // Format menyeluruh pada kode lama adalah pekerjaan terpisah; CI fokus pada
  // kesalahan logika/kualitas, bukan gaya penulisan.
  {
    ...eslintPluginPrettier,
    rules: {
      ...eslintPluginPrettier.rules,
      "prettier/prettier": "warn",
    },
  },
);
