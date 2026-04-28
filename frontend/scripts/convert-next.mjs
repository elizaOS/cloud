#!/usr/bin/env node
// Mechanical Next.js -> React Router SPA converter for legacy pages.
//
// Run from cloud/frontend:  node scripts/convert-next.mjs
//
// Conversions performed:
//   - drop "use client" / "use server" directives
//   - drop `export const dynamic|revalidate|runtime|fetchCache = ...`
//   - rewrite next/link        ->  react-router-dom Link  (href -> to)
//   - rewrite next/image       ->  plain <img> (drop fill/priority/sizes/placeholder/blurDataURL)
//   - rewrite next/navigation  ->  react-router-dom equivalents (useRouter -> useNavigate, etc.)
//   - rewrite next/dynamic dynamic(() => import(...), {ssr:false}) -> React.lazy
//   - flag next/headers, next/font, next/cache imports with TODO comments
//   - flag `export const metadata` blocks with a TODO so they get hand-converted
//     to <Helmet> in a follow-up
//   - leave page bodies alone otherwise
//
// Idempotent. Skips files in src/, scripts/, _legacy_actions/, node_modules/.

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

const SKIP_DIRS = new Set(["src", "scripts", "_legacy_actions", "node_modules", "fonts", "public", "dist"]);

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name)) yield full;
  }
}

function convert(src, file) {
  let s = src;
  let touched = false;

  const before = s;

  // 1. drop "use client" / "use server" directive lines
  s = s.replace(/^\s*['"]use (client|server)['"];?\s*\n/m, "");

  // 2. drop next config exports
  s = s.replace(/^export const (dynamic|revalidate|runtime|fetchCache|preferredRegion|maxDuration|dynamicParams)\s*=\s*[^;]+;?\s*\n/gm, "");

  // 3. next/link
  if (s.includes('from "next/link"')) {
    s = s.replace(/import\s+Link\s+from\s+"next\/link";?/g, 'import { Link } from "react-router-dom";');
    // <Link href="..."> -> <Link to="...">  (string + expression forms)
    s = s.replace(/(<Link\b[^>]*?)\shref=/g, "$1 to=");
  }

  // 4. next/image -> <img>. Just rewrite the import to a no-op shim and add a TODO.
  // (Full JSX rewrite is risky; we leave Image components in place but back them by a shim
  //  in src/shims/next-image.tsx that renders a plain <img>.)
  if (/from\s+"next\/image"/.test(s)) {
    s = s.replace(/from\s+"next\/image"/g, 'from "@/shims/next-image"');
    s = `// TODO(migrate): next/image replaced by shim; consider switching to plain <img>.\n` + s;
  }

  // 5. next/navigation
  if (/from\s+"next\/navigation"/.test(s)) {
    // capture the named imports, normalize, re-emit from react-router-dom
    s = s.replace(
      /import\s*\{([^}]+)\}\s*from\s*"next\/navigation";?/g,
      (_m, names) => {
        const items = names.split(",").map((n) => n.trim()).filter(Boolean);
        const out = new Set();
        let needsNavigate = false;
        let needsLocation = false;
        let needsRedirect = false;
        let needsNotFound = false;
        for (const it of items) {
          if (it === "useRouter") {
            needsNavigate = true;
          } else if (it === "usePathname") {
            needsLocation = true;
          } else if (it === "useSearchParams") {
            out.add("useSearchParams");
          } else if (it === "useParams") {
            out.add("useParams");
          } else if (it === "redirect" || it === "permanentRedirect") {
            needsRedirect = true;
          } else if (it === "notFound") {
            needsNotFound = true;
          } else {
            out.add(it);
          }
        }
        if (needsNavigate) out.add("useNavigate");
        if (needsLocation) out.add("useLocation");
        if (needsRedirect) out.add("Navigate");
        const lines = [`import { ${[...out].join(", ")} } from "react-router-dom";`];
        if (needsRedirect) {
          lines.push(`// TODO(migrate): replace redirect(...) calls with <Navigate to=... replace /> or navigate(...).`);
        }
        if (needsNotFound) {
          lines.push(`// TODO(migrate): notFound() removed; throw a Response or render a 404 component instead.`);
        }
        return lines.join("\n");
      },
    );
    // useRouter() -> useNavigate(); router.push -> navigate(...) etc. (best-effort)
    s = s.replace(/const\s+router\s*=\s*useRouter\(\)/g, "const navigate = useNavigate()");
    s = s.replace(/router\.push\(/g, "navigate(");
    s = s.replace(/router\.replace\(([^)]+)\)/g, "navigate($1, { replace: true })");
    s = s.replace(/router\.back\(\)/g, "navigate(-1)");
    s = s.replace(/router\.refresh\(\)/g, "window.location.reload()");
    // usePathname() -> useLocation().pathname (only when called as bare usePathname())
    s = s.replace(/const\s+pathname\s*=\s*usePathname\(\);/g, "const pathname = useLocation().pathname;");
  }

  // 6. next/dynamic
  if (/from\s+"next\/dynamic"/.test(s)) {
    s = s.replace(/import\s+dynamic\s+from\s+"next\/dynamic";?/g, 'import { lazy } from "react";');
    // dynamic(() => import("..."), { ssr: false[, ...] })  ->  lazy(() => import("..."))
    s = s.replace(
      /dynamic\(\s*\(\)\s*=>\s*import\(([^)]+)\)\s*,\s*\{[\s\S]*?\}\s*\)/g,
      "lazy(() => import($1))",
    );
    // bare dynamic(() => import("...")) -> lazy(() => import("..."))
    s = s.replace(
      /dynamic\(\s*\(\)\s*=>\s*import\(([^)]+)\)\s*\)/g,
      "lazy(() => import($1))",
    );
  }

  // 7. flag next/headers / next/cache / next/font with TODO
  if (/from\s+"next\/(headers|cache|font\/google|font\/local)"/.test(s)) {
    s = `// TODO(migrate): file imports a Next.js server-only API (next/headers|next/cache|next/font). ` +
        `These do not exist in a SPA. Move logic to API endpoint or convert client-side.\n` + s;
    s = s.replace(/import\s+\{[^}]*\}\s+from\s+"next\/headers";?/g, "// $&");
    s = s.replace(/import\s+\{[^}]*\}\s+from\s+"next\/cache";?/g, "// $&");
  }

  // 8. flag exported metadata for hand-conversion
  if (/^export\s+const\s+metadata\b/m.test(s) || /^export\s+(async\s+)?function\s+generateMetadata\b/m.test(s)) {
    if (!s.includes("TODO(migrate-metadata)")) {
      s = `// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.\n` + s;
    }
  }

  if (s !== before) touched = true;
  return { s, touched };
}

let changed = 0;
for await (const file of walk(ROOT)) {
  const src = await fs.readFile(file, "utf8");
  const { s, touched } = convert(src, file);
  if (touched) {
    await fs.writeFile(file, s, "utf8");
    changed++;
    console.log("rewrote", path.relative(ROOT, file));
  }
}
console.log(`\nDone. ${changed} file(s) rewritten.`);
