import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Resolve aliases. The legacy Next.js tsconfig mapped `@/lib/*` →
// `./packages/lib/*` (and similar) at the cloud root. The frontend now lives
// under `cloud/frontend/`, so we map those legacy aliases relative to
// `../packages/...` — preserving import paths in the existing pages.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
      { find: /^node:(fs|fs\/promises|path|os|crypto|stream|http|https|zlib|net|tls|child_process|util|url|events|buffer|querystring|assert|process|vm|worker_threads|cluster|dgram|dns|punycode|readline|repl|string_decoder|tty)$/, replacement: r("./src/shims/empty.ts") },
      { find: /^(fs|fs\/promises|path|os|crypto|stream|http|https|zlib|net|tls|child_process|vm|url|util|events|querystring|buffer|assert|punycode|readline|repl|string_decoder|tty|process|worker_threads|perf_hooks)$/, replacement: r("./src/shims/empty.ts") },
      // Order matters: longer prefixes / subpath aliases must precede broader
      // ones. Use regex/exact `find` values so `@elizaos/cloud-ui/foo` doesn't
      // get rewritten to `…/index.ts/foo`.
      { find: /^@elizaos\/cloud-ui$/, replacement: r("../packages/ui/src/index.ts") },
      { find: /^@elizaos\/cloud-ui\/(.*)$/, replacement: r("../packages/ui/src") + "/$1" },
      { find: /^@\/lib(\/.*)?$/, replacement: r("../packages/lib") + "$1" },
      { find: /^@\/db(\/.*)?$/, replacement: r("../packages/db") + "$1" },
      { find: /^@\/types(\/.*)?$/, replacement: r("../packages/types") + "$1" },
      { find: /^@\/components(\/.*)?$/, replacement: r("../packages/ui/src/components") + "$1" },
      { find: /^@\/packages(\/.*)?$/, replacement: r("../packages") + "$1" },
      { find: /^@\/app\/actions(\/.*)?$/, replacement: r("./_legacy_actions") + "$1" },
      { find: /^@\/actions(\/.*)?$/, replacement: r("./_legacy_actions") + "$1" },
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
