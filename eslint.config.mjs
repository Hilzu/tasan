import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import nodePlugin from "eslint-plugin-n";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tsEslint from "typescript-eslint";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tsEslint.config(
  // https://eslint.org/docs/latest/use/configure/ignore
  {
    ignores: ["**/.react-router/", "**/build/", "**/cdk.out/", "**/dist/"],
  },

  js.configs.recommended,

  // Rules enabled by this config in addition to recommended: https://typescript-eslint.io/rules/?=xrecommended-strict
  // Replace this with ...tsEslint.configs.recommendedTypeChecked, if you want to include recommended rules only
  ...tsEslint.configs.strictTypeChecked,

  // Rules enabled by this config: https://typescript-eslint.io/rules/?=stylistic
  // Remove this if you don't want to include stylistic rules
  ...tsEslint.configs.stylisticTypeChecked,

  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.nodeBuiltin,
      },
    },
  },
  nodePlugin.configs["flat/recommended"],
  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "sort-imports": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-require-imports": [
        "error",
        { allowAsImport: true },
      ],
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            {
              from: "package",
              package: "react-router",
              name: "DataWithResponseInit",
            },
          ],
        },
      ],
      "n/prefer-node-protocol": "error",
    },
  },
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    ...tsEslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    files: ["packages/infra/**"],
    rules: {
      "n/no-missing-import": "off",
    },
  },
  {
    files: ["packages/web/**"],
    rules: {
      "n/no-missing-import": "off",
    },
  },
  {
    files: ["**/*.client.ts", "**/*.client.tsx"],
    rules: {
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
);
