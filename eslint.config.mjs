import nextConfig from "eslint-config-next";

const eslintConfig = [
  // Global ignores must be at the top level with only the ignores key
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/dist/**",
      "next-env.d.ts",
      "docs/**",
      "ignore/**",
      "todo-app/**",
      "vendor/**",
      "apps/**",
      "miniapp/.next/**",
      "tests/playwright/test-reports/**",
      "tests/playwright/test-results/**",
    ],
  },
  ...nextConfig,
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": [
        "warn",
        {
          additionalHooks:
            "(useDeepMemo|useDeepCallback|useDebounce|useDedupedFetch)",
        },
      ],
      "react/jsx-no-constructed-context-values": "error",
      "react/jsx-no-useless-fragment": "warn",
    },
  },
];

export default eslintConfig;
