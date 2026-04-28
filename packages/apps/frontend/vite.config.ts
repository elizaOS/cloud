import { fileURLToPath, URL } from "node:url";
import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig } from "vite";

// Resolve aliases. The legacy Next.js tsconfig mapped `@/lib/*` →
// `./packages/lib/*` (and similar) at the cloud root. The frontend now lives
// under `cloud/packages/apps/frontend/`, so we map those legacy aliases
// relative to `../../...` — preserving import paths in the existing pages.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      // No `providerImportSource` — `@mdx-js/react`'s runtime provider can't
      // be resolved from `cloud/packages/content/*.mdx` (it's hoisted under
      // frontend's node_modules only). We don't need MDXProvider component
      // overrides anyway: nextra/components is aliased to a local file
      // (see resolve.alias below) and markdown elements are styled via CSS.
      ...mdx({
        remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
      }),
    },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    tailwindcss(),
  ],
  optimizeDeps: {
    // Avoid scanning the giant transitive graph from packages/lib at
    // dev-server boot.
    entries: ["src/main.tsx"],
  },
  resolve: {
    alias: [
      // Stub Node built-ins that legacy server-side modules import. The SPA
      // never executes those code paths at runtime (any function that needs
      // them is gated behind `typeof window === "undefined"` or only called
      // server-side), but Rollup still has to resolve the module graph at
      // build time.
      {
        find: /^node:(fs|fs\/promises|path|os|crypto|stream|http|https|zlib|net|tls|child_process|util|url|events|buffer|querystring|assert|process|vm|worker_threads|cluster|dgram|dns|punycode|readline|repl|string_decoder|tty)$/,
        replacement: r("./src/shims/empty.ts"),
      },
      {
        find: /^(fs|fs\/promises|path|os|crypto|stream|http|https|zlib|net|tls|child_process|vm|url|util|events|querystring|buffer|assert|punycode|readline|repl|string_decoder|tty|process|worker_threads|perf_hooks)$/,
        replacement: r("./src/shims/empty.ts"),
      },
      // Existing MDX content (cloud/content/**/*.mdx) imports from
      // "nextra/components". Alias to our local replacement so the .mdx
      // sources don't need to be rewritten.
      { find: /^nextra\/components$/, replacement: r("./src/docs/components.tsx") },
      // Order matters: longer prefixes / subpath aliases must precede broader
      // ones. Use regex/exact `find` values so `@elizaos/cloud-ui/foo` doesn't
      // get rewritten to `…/index.ts/foo`.
      { find: /^@elizaos\/cloud-ui$/, replacement: r("../../ui/src/index.ts") },
      { find: /^@elizaos\/cloud-ui\/(.*)$/, replacement: r("../../ui/src") + "/$1" },
      { find: /^@\/lib(\/.*)?$/, replacement: r("../../lib") + "$1" },
      { find: /^@\/db(\/.*)?$/, replacement: r("../../db") + "$1" },
      { find: /^@\/types(\/.*)?$/, replacement: r("../../types") + "$1" },
      { find: /^@\/components(\/.*)?$/, replacement: r("../../ui/src/components") + "$1" },
      { find: /^@\/packages(\/.*)?$/, replacement: r("../..") + "$1" },
      { find: /^@\/(.*)$/, replacement: r("./src") + "/$1" },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "esnext",
  },
  css: {
    // The @tailwindcss/vite plugin handles Tailwind directly; disable
    // PostCSS auto-discovery so the legacy cloud/postcss.config.mjs is
    // ignored.
    postcss: { plugins: [] },
  },
  define: {
    // Many legacy pages still read `process.env.NEXT_PUBLIC_*`. Vite normally
    // exposes env via `import.meta.env`, but we keep `process.env` defined to
    // avoid breaking the existing call sites during the migration.
    "process.env": {},
  },
});
