"use client";

import { useMemo, useState } from "react";

import type { DiscoveredApiRoute, HttpMethod } from "@/lib/docs/api-route-discovery";
import { cn } from "@/lib/utils";

type RouteGroup = {
  group: string;
  routes: DiscoveredApiRoute[];
};

function methodBadgeClass(method: HttpMethod) {
  const base =
    "inline-flex items-center rounded-none px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide border";
  switch (method) {
    case "GET":
      return `${base} bg-emerald-500/10 text-emerald-400 border-emerald-500/30`;
    case "POST":
      return `${base} bg-blue-500/10 text-blue-400 border-blue-500/30`;
    case "PUT":
      return `${base} bg-amber-500/10 text-amber-400 border-amber-500/30`;
    case "PATCH":
      return `${base} bg-violet-500/10 text-violet-400 border-violet-500/30`;
    case "DELETE":
      return `${base} bg-rose-500/10 text-rose-400 border-rose-500/30`;
    default:
      return `${base} bg-white/5 text-white/60 border-white/10`;
  }
}

function isProbablyPublic(route: DiscoveredApiRoute) {
  const p = route.path;
  // Heuristic: keep docs focused on externally useful routes by default.
  if (p.includes("/api/v1/admin/")) return false;
  if (p.includes("/api/v1/cron/")) return false;
  if (p.includes("/api/v1/iap/")) return false;
  // Miniapp routes are public-ish, but often app-specific. Keep them visible.
  return true;
}

function groupKeyForPath(p: string) {
  const parts = p.split("/").filter(Boolean);
  // ["api","v1",...]
  const group = parts[2] ?? "root";
  return group;
}

export function ApiRouteExplorerClient({
  routes,
}: {
  routes: DiscoveredApiRoute[];
}) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = showAll ? routes : routes.filter(isProbablyPublic);
    if (!q) return base;
    return base.filter((r) => {
      const hay = [
        r.path,
        r.methods.join(" "),
        r.meta?.name ?? "",
        r.meta?.description ?? "",
        r.meta?.category ?? "",
        (r.meta?.tags ?? []).join(" "),
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, routes, showAll]);

  const groups = useMemo<RouteGroup[]>(() => {
    const map = new Map<string, DiscoveredApiRoute[]>();
    for (const r of filtered) {
      const key = groupKeyForPath(r.path);
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, rs]) => ({
        group,
        routes: rs.sort((a, b) => a.path.localeCompare(b.path)),
      }));
  }, [filtered]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return routes.find((r) => `${r.path}::${r.methods.join(",")}` === selectedKey) ?? null;
  }, [routes, selectedKey]);

  return (
    <div className="not-prose">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left explorer */}
        <div className="lg:sticky lg:top-[calc(var(--nextra-navbar-height)+16px)] h-fit">
          <div className="border border-white/10 bg-black/40">
            <div className="border-b border-white/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">
                  Route Explorer
                </div>
                <label className="flex items-center gap-2 text-xs text-white/60 select-none">
                  <input
                    type="checkbox"
                    checked={showAll}
                    onChange={(e) => setShowAll(e.target.checked)}
                    className="accent-[#ff5800]"
                  />
                  Show all
                </label>
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search paths, tags, names..."
                className="mt-3 w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#ff5800] focus:border-[#ff5800]"
              />
              <div className="mt-2 text-xs text-white/40">
                {filtered.length} route{filtered.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {groups.map((g) => (
                <details key={g.group} open className="border-b border-white/5">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5">
                    {g.group}
                    <span className="ml-2 text-xs font-normal text-white/40">
                      ({g.routes.length})
                    </span>
                  </summary>
                  <div className="px-2 pb-2">
                    {g.routes.map((r) => {
                      const key = `${r.path}::${r.methods.join(",")}`;
                      const active = selectedKey === key;
                      const title = r.meta?.name ?? r.path.replace("/api/v1", "");
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className={cn(
                            "w-full text-left rounded-none border border-transparent px-2 py-2 transition-colors",
                            active
                              ? "bg-[#ff5800]/10 border-[#ff5800]/30"
                              : "hover:bg-white/5 hover:border-white/10",
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {(r.methods.length ? r.methods : (["GET"] as HttpMethod[]))
                                .slice(0, 2)
                                .map((m) => (
                                  <span key={m} className={methodBadgeClass(m)}>
                                    {m}
                                  </span>
                                ))}
                              {r.methods.length > 2 && (
                                <span className="text-[11px] text-white/40">
                                  +{r.methods.length - 2}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-white/90 truncate">
                                {title}
                              </div>
                              <div className="mt-0.5 font-mono text-[11px] text-white/40 truncate">
                                {r.path}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>

        {/* Right details */}
        <div className="border border-white/10 bg-black/20">
          {selected ? (
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                {selected.methods.map((m) => (
                  <span key={m} className={methodBadgeClass(m)}>
                    {m}
                  </span>
                ))}
                <code className="rounded-none border border-white/10 bg-black/50 px-2 py-1 font-mono text-xs text-white break-all">
                  {selected.path}
                </code>
              </div>

              {selected.meta?.name && (
                <h3 className="mt-4 text-xl font-semibold text-white">
                  {selected.meta.name}
                </h3>
              )}

              {selected.meta?.description ? (
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  {selected.meta.description}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-white/50">
                  This endpoint is implemented in code, but doesn’t have rich
                  docs metadata yet.
                </p>
              )}

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-white/10 bg-black/30 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
                    Auth
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {selected.meta
                      ? selected.meta.requiresAuth
                        ? "Required"
                        : "Not required"
                      : "Unknown"}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/30 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
                    Source
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-white/60 break-all">
                    {selected.filePath}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
                  Quick cURL
                </div>
                <pre className="mt-2 overflow-auto border border-white/10 bg-black/60 p-3 text-xs text-white/80">
                  <code>
                    {`curl -X ${selected.methods[0] ?? "GET"} "https://cloud.eliza.ai${selected.path}" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`}
                  </code>
                </pre>
                <div className="mt-2 text-xs text-white/40">
                  Tip: for OpenAI-compatible chat, see{" "}
                  <a className="text-[#ff5800] hover:underline" href="/docs/api/chat">
                    Chat Completions
                  </a>
                  .
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-sm text-white/50">
              Select an endpoint on the left to see details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


