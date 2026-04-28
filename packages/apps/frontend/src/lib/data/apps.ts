import { useQuery } from "@tanstack/react-query";
import { api } from "../api-client";

export interface App {
  id: string;
  name: string;
  description?: string | null;
  url?: string | null;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * GET /api/v1/apps — list of the caller's apps.
 * TODO(api): confirm endpoint shape against api/v1/apps once the route lands.
 */
export function useApps() {
  return useQuery({
    queryKey: ["apps"],
    queryFn: async () => {
      const data = await api<{ apps?: App[]; data?: App[] }>("/api/v1/apps");
      return data.apps ?? data.data ?? [];
    },
  });
}

export function useApp(id: string | undefined) {
  return useQuery({
    queryKey: ["app", id],
    queryFn: () => api<{ app: App }>(`/api/v1/apps/${id}`).then((r) => r.app),
    enabled: Boolean(id),
  });
}
