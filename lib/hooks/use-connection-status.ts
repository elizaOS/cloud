"use client";

import { useState, useEffect, useCallback } from "react";

export type ServiceType =
  | "google"
  | "twilio"
  | "blooio"
  | "telegram"
  | "twitter"
  | "discord";

export interface DiscordGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  channelCount: number;
}

export interface ServiceStatus {
  connected: boolean;
  configured?: boolean;
  loading: boolean;
  error?: string;
  details?: {
    // Google specific
    email?: string;
    scopes?: string[];
    // Twilio specific
    phoneNumber?: string;
    accountSid?: string;
    // Blooio specific
    fromNumber?: string;
    // Telegram specific
    botUsername?: string;
    botId?: number;
    // Twitter specific
    username?: string;
    userId?: string;
    avatarUrl?: string;
    // Discord specific
    guilds?: DiscordGuild[];
  };
}

export interface ConnectionStatusResult {
  statuses: Record<ServiceType, ServiceStatus>;
  allConnected: boolean;
  connectedCount: number;
  configuredCount: number;
  totalCount: number;
  refresh: () => Promise<void>;
  refreshService: (service: ServiceType) => Promise<void>;
}

const defaultStatus: ServiceStatus = {
  connected: false,
  configured: true,
  loading: true,
};

async function fetchServiceStatus(
  service: ServiceType,
): Promise<ServiceStatus> {
  try {
    const response = await fetch(`/api/v1/${service}/status`);
    const data = await response.json();

    if (!response.ok) {
      return {
        connected: false,
        configured: data.configured !== false,
        loading: false,
        error: data.error || "Failed to fetch status",
      };
    }

    // Normalize response based on service type
    switch (service) {
      case "google":
        return {
          connected: data.connected === true,
          configured: data.configured !== false,
          loading: false,
          details: {
            email: data.email,
            scopes: data.scopes,
          },
        };
      case "twilio":
        return {
          connected: data.connected === true,
          configured: data.configured !== false,
          loading: false,
          details: {
            phoneNumber: data.phoneNumber,
            accountSid: data.accountSid,
          },
        };
      case "blooio":
        return {
          connected: data.connected === true,
          configured: data.configured !== false,
          loading: false,
          details: {
            fromNumber: data.fromNumber,
          },
        };
      case "telegram":
        return {
          connected: data.connected === true,
          configured: data.configured !== false,
          loading: false,
          details: {
            botUsername: data.botUsername,
            botId: data.botId,
          },
        };
      case "twitter":
        return {
          connected: data.connected === true,
          configured: data.configured !== false,
          loading: false,
          details: {
            username: data.username,
            userId: data.userId,
            avatarUrl: data.avatarUrl,
          },
        };
      case "discord":
        return {
          connected: data.connected === true,
          configured: data.configured !== false,
          loading: false,
          details: {
            guilds: data.guilds || [],
          },
        };
      default:
        return {
          connected: false,
          configured: false,
          loading: false,
          error: "Unknown service type",
        };
    }
  } catch (error) {
    return {
      connected: false,
      configured: true,
      loading: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export function useConnectionStatus(
  services: ServiceType[],
): ConnectionStatusResult {
  const [statuses, setStatuses] = useState<Record<ServiceType, ServiceStatus>>(
    () => {
      const initial: Record<ServiceType, ServiceStatus> = {
        google: defaultStatus,
        twilio: defaultStatus,
        blooio: defaultStatus,
        telegram: defaultStatus,
        twitter: defaultStatus,
        discord: defaultStatus,
      };
      return initial;
    },
  );

  const refreshService = useCallback(async (service: ServiceType) => {
    setStatuses((prev) => ({
      ...prev,
      [service]: { ...prev[service], loading: true },
    }));

    const status = await fetchServiceStatus(service);

    setStatuses((prev) => ({
      ...prev,
      [service]: status,
    }));
  }, []);

  const refresh = useCallback(async () => {
    // Fetch all requested services in parallel
    const fetchPromises = services.map(async (service) => {
      const status = await fetchServiceStatus(service);
      return { service, status };
    });

    const results = await Promise.all(fetchPromises);

    setStatuses((prev) => {
      const updated = { ...prev };
      for (const { service, status } of results) {
        updated[service] = status;
      }
      return updated;
    });
  }, [services]);

  // Initial fetch - this is a valid data fetching pattern on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetching initial data on mount is a valid pattern
    refresh();
  }, [refresh]);

  // Calculate derived values
  // Services that are not configured on the platform should be treated as "complete"
  // since users can't do anything about them (it's a platform-level setting)
  const connectedOrUnavailable = services.filter(
    (s) => statuses[s]?.connected || statuses[s]?.configured === false,
  );
  const connectedCount = services.filter((s) => statuses[s]?.connected).length;
  const configuredCount = services.filter(
    (s) => statuses[s]?.configured !== false,
  ).length;
  const totalCount = services.length;
  const allConnected =
    connectedOrUnavailable.length === totalCount && totalCount > 0;

  return {
    statuses,
    allConnected,
    connectedCount,
    configuredCount,
    totalCount,
    refresh,
    refreshService,
  };
}
