import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Resolve aliases. The legacy Next.js tsconfig mapped `@/lib/*` →
// `./packages/lib/*` (and similar) at the cloud root. The frontend now lives
// under `cloud/frontend/`, so we map those legacy aliases relative to
// `../packages/...` — preserving import paths in the existing pages.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/lib": r("../packages/lib"),
      "@/db": r("../packages/db"),
      "@/types": r("../packages/types"),
      "@/components": r("../packages/ui/src/components"),
      "@/packages": r("../packages"),
      "@/actions": r("./_legacy_actions"),
      "@elizaos/cloud-ui": r("../packages/ui/src/index.ts"),
      "@": r("./src"),
    },
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
  define: {
    // Many legacy pages still read `process.env.NEXT_PUBLIC_*`. Vite normally
    // exposes env via `import.meta.env`, but we keep `process.env` defined to
    // avoid breaking the existing call sites during the migration.
    "process.env": {},
  },
});
